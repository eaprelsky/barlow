// Цепочка трека — порт makeChain (src/audio/fx.ts): hp → lowpass(Q) →
// эффекты (dry/wet) → панорама → громкость → сайдчейн-дак. Работает
// посэмплово на стерео (вход — моно-микс голосов, up-mix как в WebAudio).

use super::dsp::{saw_value, set_target, square_value, Biquad};
use super::patch::{Effect, Mod, Track};
use super::voices::RenderedVoice;

pub fn mod_scale(target: &str, depth: f64, filter_base: f64) -> f64 {
    match target {
        "pan" => depth,
        "volume" => depth * 0.5,
        "filterFreq" => depth * 1800.0f64.max(filter_base * 2.5),
        "fxTime" => depth * 0.12,
        "fxFeedback" => depth * 0.35,
        "fxMix" => depth * 0.35,
        _ => depth,
    }
}

/// equal-power кроссфейд dry/wet.
fn dry_gain(mix: f64) -> f64 {
    ((mix * std::f64::consts::PI) / 2.0).cos()
}
fn wet_gain(mix: f64) -> f64 {
    ((mix * std::f64::consts::PI) / 2.0).sin()
}

/// Mix-параметр любого эффекта.
fn effect_mix(e: &Effect) -> f64 {
    match e {
        Effect::Delay { mix, .. }
        | Effect::Reverb { mix, .. }
        | Effect::Dist { mix, .. }
        | Effect::Chorus { mix, .. }
        | Effect::Lofi { mix, .. } => *mix,
    }
}

/// Кривая перегруза tanh(drive·x)/tanh(drive) — порт distCurve.
fn dist_curve_value(x: f64, drive: f64) -> f64 {
    (drive * x).tanh() / drive.tanh()
}

/// Ло-фай квантование — порт lofiCurve (непрерывная формула квантования).
fn lofi_value(x: f64, bits: f64) -> f64 {
    let levels = 2f64.powf(bits) - 1.0;
    (((x + 1.0) / 2.0) * levels).round() / levels * 2.0 - 1.0
}

pub struct TrackChain {
    hp: Biquad,
    filter: Biquad,
    filter_freq_base: f64,
    filter_q: f64,
    effects: Vec<EffectChain>,
    pan: f64,    // панорама трека (эффективная) −1..1
    gain: f64,   // эффективная громкость
    mods: Vec<ModChain>,
    /// Сигнатура набора модуляций/эффектов (порт modSig) — при смене
    /// цепочка пересобирается движком.
    sig: String,
    /// Дак-события (t_abs, amount, release): применяются поверх gain.
    pub ducks: Vec<(f64, f64, f64)>,
}

struct EffectChain {
    effect: Effect,
    delay_l: Vec<f32>,
    delay_r: Vec<f32>,
    write: usize,
    lfo_phase: f64,
    reverb: Option<Schroeder>,
}

/// Реверб Шрёдера: 8 гребёнок + 4 allpass на канал — быстрая замена
/// конволюции с процедурным IR web-движка (там случайный IR; здесь
/// детерминированный, той же природы «шумовое пространство»).
pub struct Schroeder {
    combs_l: Vec<(Vec<f32>, usize)>,
    combs_r: Vec<(Vec<f32>, usize)>,
    aps_l: Vec<(Vec<f32>, usize)>,
    aps_r: Vec<(Vec<f32>, usize)>,
}

impl Schroeder {
    pub fn new(size_sec: f64, sr: f64) -> Schroeder {
        // База Freeverb (сэмплы при 44.1 к): растягиваем по sizeSec.
        let base = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
        let ap = [556, 441, 341, 225];
        let scale = ((size_sec / 2.8).clamp(0.25, 4.0) * sr / 44100.0) as usize;
        let mut rng = super::dsp::XorShift::new(0x5EED_5EED);
        let jitter = |rng: &mut super::dsp::XorShift, x: usize| {
            (x as f64 * (1.0 + (rng.next_f64() - 0.5) * 0.05)) as usize
        };
        let mk = |rng: &mut super::dsp::XorShift, xs: &[usize], feedback_len: usize| -> Vec<(Vec<f32>, usize)> {
            xs.iter()
                .map(|&x| (vec![0.0; (jitter(rng, x) * scale).max(4) + 1], feedback_len))
                .collect()
        };
        let mut rng2 = super::dsp::XorShift::new(0x5EED_5EED);
        let combs_l = mk(&mut rng, &base, 0);
        let combs_r = mk(&mut rng2, &base, 0);
        let aps_l = mk(&mut rng, &ap, 0);
        let aps_r = mk(&mut rng2, &ap, 0);
        Schroeder { combs_l, combs_r, aps_l, aps_r }
    }

    #[inline]
    fn comb(buf: &mut Vec<f32>, idx: &mut usize, input: f32) -> f32 {
        let n = buf.len();
        let out = buf[*idx];
        buf[*idx] = input + out * 0.84; // feedback
        *idx = (*idx + 1) % n;
        out
    }

    #[inline]
    fn allpass(buf: &mut Vec<f32>, idx: &mut usize, input: f32) -> f32 {
        let n = buf.len();
        let bufout = buf[*idx];
        let out = -input + bufout;
        buf[*idx] = input + bufout * 0.5;
        *idx = (*idx + 1) % n;
        out
    }

    pub fn process(&mut self, x: f64) -> (f64, f64) {
        let xl = x as f32;
        // лёгкая декорреляция каналов
        let xr = (x * 0.98) as f32;
        let mut l = 0.0f32;
        let mut r = 0.0f32;
        for (buf, idx) in self.combs_l.iter_mut() {
            l += Self::comb(buf, idx, xl * 0.125);
        }
        for (buf, idx) in self.combs_r.iter_mut() {
            r += Self::comb(buf, idx, xr * 0.125);
        }
        for (buf, idx) in self.aps_l.iter_mut() {
            l = Self::allpass(buf, idx, l);
        }
        for (buf, idx) in self.aps_r.iter_mut() {
            r = Self::allpass(buf, idx, r);
        }
        (l as f64, r as f64)
    }
}

struct ModChain {
    m: Mod,
    phase: f64,
}

impl TrackChain {
    /// Порт makeChain: параметры трека + эффективные volume/pan/mods
    /// (паттерн может переопределять). sr — частота рендера.
    pub fn new(track: &Track, eff_volume: f64, eff_pan: f64, eff_mods: &[Mod], sr: f64) -> TrackChain {
        let filter_q = track.filter_q.unwrap_or(0.8);
        let effects = (track.effects.clone().unwrap_or_default())
            .into_iter()
            .map(|effect| {
                let max_len = match &effect {
                    Effect::Delay { time_sec, .. } => ((time_sec * 1.05) * sr).ceil() as usize + 2,
                    _ => 2,
                };
                let reverb = match &effect {
                    Effect::Reverb { size_sec, .. } => {
                        Some(Schroeder::new(*size_sec, sr))
                    }
                    _ => None,
                };
                EffectChain {
                    effect,
                    delay_l: vec![0.0; max_len],
                    delay_r: vec![0.0; max_len],
                    write: 0,
                    lfo_phase: 0.0,
                    reverb,
                }
            })
            .collect();
        let sig = format!(
            "{}|{}",
            eff_mods
                .iter()
                .map(|m| format!("{}:{:?}:{:?}", m.target, m.source, m.shape))
                .collect::<Vec<_>>()
                .join(","),
            track
                .effects
                .as_ref()
                .map(|fx| fx
                    .iter()
                    .map(|e| serde_json::to_string(e).unwrap_or_default())
                    .collect::<Vec<_>>()
                    .join(","))
                .unwrap_or_default()
        );
        TrackChain {
            hp: Biquad::new("highpass", track.filter_low, 0.7, sr),
            filter: Biquad::new("lowpass", track.filter_freq, filter_q, sr),
            filter_freq_base: track.filter_freq,
            filter_q,
            effects,
            pan: eff_pan * 2.0 - 1.0,
            gain: eff_volume,
            mods: eff_mods
                .iter()
                .map(|m| ModChain { m: m.clone(), phase: 0.0 })
                .collect(),
            sig,
            ducks: vec![],
        }
    }

    /// Сигнатура набора модуляций/эффектов (сравнивает движок).
    pub fn sig(&self) -> &str {
        &self.sig
    }

    /// Обновить эффективные громкость/панораму без пересборки.
    pub fn set_params(&mut self, volume: f64, pan: f64) {
        self.gain = volume;
        self.pan = pan * 2.0 - 1.0;
    }

    /// Добавить событие сайдчейн-дака.
    pub fn push_duck(&mut self, at: f64, amount: f64, release: f64) {
        self.ducks.push((at, amount, release));
    }

    /// Сигнал LFO-источника модуляции в момент t (от старта рендера):
    /// OscillatorNode, запущенный в 0.
    fn mod_value(&self, m: &Mod, phase: f64) -> f64 {
        if m.source.as_deref() == Some("sah") || m.source.as_deref() == Some("perlin") {
            // Seeded-источники — этап 5 (в эталон не входят).
            return 0.0;
        }
        match m.shape.as_deref() {
            Some("square") => square_value(phase),
            Some("sawtooth") => saw_value(phase),
            Some("triangle") => 2.0 * saw_value(phase).abs() - 1.0,
            _ => (2.0 * std::f64::consts::PI * phase).sin(),
        }
    }

    /// Обработать сэмпл (моно-микс голосов трека) → (L, R).
    /// t — абсолютное время рендера.
    pub fn process(&mut self, mono: f64, t: f64, sr: f64) -> (f64, f64) {
        // Модуляции (LFO от старта рендера).
        let mut filter_mod = 0.0f64;
        let mut pan_mod = 0.0f64;
        let mut vol_mod = 0.0f64;
        for mc in &self.mods {
            let v = self.mod_value(&mc.m, mc.phase);
            let scale = mod_scale(&mc.m.target, mc.m.depth, self.filter_freq_base);
            match mc.m.target.as_str() {
                "filterFreq" => filter_mod += v * scale,
                "pan" => pan_mod += v * scale,
                "volume" => vol_mod += v * scale,
                _ => {} // fx-цели — этап 6
            }
        }
        // Частота фильтра: база + модуляция (без clamp в [0, nyq] не уйти).
        let f_now = (self.filter_freq_base + filter_mod).clamp(10.0, sr / 2.0);
        let mut f = Biquad::new("lowpass", f_now, self.filter_q, sr);
        f.x1 = self.filter.x1;
        f.x2 = self.filter.x2;
        f.y1 = self.filter.y1;
        f.y2 = self.filter.y2;
        self.filter = f;

        let x = self.hp.process(mono);
        let x = self.filter.process(x);

        // Эффекты по цепочке: вход следующего — сумма предыдущего
        // (dry/wet кроссфейд на каждом), как node→sum в fx.ts.
        let mut cur_l = x;
        let mut cur_r = x;
        for ei in 0..self.effects.len() {
            let mix = effect_mix(&self.effects[ei].effect);
            let (in_l, in_r) = (cur_l, cur_r);
            let (wet_l, wet_r) = Self::process_effect(&mut self.effects[ei], in_l, in_r, t, sr);
            cur_l = in_l * dry_gain(mix) + wet_l * wet_gain(mix);
            cur_r = in_r * dry_gain(mix) + wet_r * wet_gain(mix);
        }

        // Сайдчейн-дак поверх громкости (порт duckSidechain): приём к цели
        // за 6 мс, с at+0.05 — восстановление с тау release/3; вторая фаза
        // стартует со значения первой в этот момент.
        let duck = self
            .ducks
            .iter()
            .copied()
            .map(|(at, amount, release)| duck_gain(t, at, amount, release))
            .fold(1.0f64, |a, b| a * b);

        let g = self.gain * (1.0 + vol_mod).max(0.0) * duck;
        let pan = (self.pan + pan_mod).clamp(-1.0, 1.0);
        // StereoPanner: equal-power
        let l = cur_l * ((pan + 1.0) * std::f64::consts::FRAC_PI_4).cos() * g;
        let r = cur_r * ((pan + 1.0) * std::f64::consts::FRAC_PI_4).sin() * g;
        (l, r)
    }

    /// Мокрый путь одного эффекта (в WebAudio wet-гейт параллелен dry).
    fn process_effect(ec: &mut EffectChain, xl: f64, xr: f64, t: f64, sr: f64) -> (f64, f64) {
        match &ec.effect {
            Effect::Delay {
                time_sec,
                feedback,
                ..
            } => {
                // Feedback-петля: y[n] = x[n] + fb·y[n−D]
                let d = *time_sec * sr;
                let di = d.floor() as usize;
                let frac = d - di as f64;
                let read = |buf: &Vec<f32>, w: usize| -> f64 {
                    let n = buf.len();
                    let i0 = (w + n - di - 1) % n;
                    let i1 = (w + n - di) % n;
                    buf[i0] as f64 + (buf[i1] as f64 - buf[i0] as f64) * frac
                };
                let (yl, yr) = (read(&ec.delay_l, ec.write), read(&ec.delay_r, ec.write));
                let nl = xl + yl * *feedback;
                let nr = xr + yr * *feedback;
                ec.delay_l[ec.write] = nl as f32;
                ec.delay_r[ec.write] = nr as f32;
                ec.write = (ec.write + 1) % ec.delay_l.len();
                (yl, yr)
            }
            Effect::Dist { drive, .. } => {
                (dist_curve_value(xl, *drive), dist_curve_value(xr, *drive))
            }
            Effect::Lofi { bits, .. } => (lofi_value(xl, *bits), lofi_value(xr, *bits)),
            Effect::Chorus { rate, .. } => {
                // ±5 мс вокруг 26 мс, качаемых LFO.
                let base = 0.026;
                let sway = 0.005 * (2.0 * std::f64::consts::PI * rate * t).sin();
                let d = (base + sway) * sr;
                let di = d.floor() as usize;
                let frac = d - di as f64;
                let read = |buf: &Vec<f32>, w: usize| -> f64 {
                    let n = buf.len();
                    let i0 = (w + n - di - 1) % n;
                    let i1 = (w + n - di) % n;
                    buf[i0] as f64 + (buf[i1] as f64 - buf[i0] as f64) * frac
                };
                let (yl, yr) = (read(&ec.delay_l, ec.write), read(&ec.delay_r, ec.write));
                ec.delay_l[ec.write] = xl as f32;
                ec.delay_r[ec.write] = xr as f32;
                ec.write = (ec.write + 1) % ec.delay_l.len();
                (yl, yr)
            }
            Effect::Reverb { .. } => match ec.reverb.as_mut() {
                Some(rv) => rv.process(xl),
                None => (0.0, 0.0),
            },
        }
    }

    /// Продвинуть фазы модуляций на один сэмпл.
    pub fn tick_mods(&mut self, sr: f64) {
        for mc in &mut self.mods {
            mc.phase += mc.m.rate / sr;
        }
    }

    /// Миксовать голос в накопитель моно-сигнала трека.
    pub fn mix_voice(buf: &mut Vec<f32>, v: &RenderedVoice) {
        if buf.len() < v.start_sample + v.samples.len() {
            buf.resize(v.start_sample + v.samples.len(), 0.0);
        }
        for (i, s) in v.samples.iter().enumerate() {
            buf[v.start_sample + i] += *s;
        }
    }
}

/// Гейн сайдчейн-дака одного события в момент t.
fn duck_gain(t: f64, at: f64, amount: f64, release: f64) -> f64 {
    let t1 = at + 0.05;
    if t <= at {
        return 1.0;
    }
    if t < t1 {
        return set_target(t, at, 1.0, 1.0 - amount, 0.006);
    }
    let v1 = set_target(t1, at, 1.0, 1.0 - amount, 0.006);
    let tc = (release / 3.0).max(0.02);
    1.0 + (v1 - 1.0) * (-(t - t1) / tc).exp()
}
