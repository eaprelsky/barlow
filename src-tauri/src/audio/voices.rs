// Голоса: порт triggerVoice (src/audio/voices.ts) в посэмпловый рендер.
// Один голос = моно-буфер сэмплов от старта до гашения; цепочка трека
// (фильтры/эффекты/панорама) применяется дальше в chain.rs. Огибающая и
// рампы — семантика AudioParam (linear/exponential ramp, setTarget).

use super::dsp::{exponential_ramp, linear_ramp, set_target, WaveTable};
use super::patch::{Track, Waveform};
use super::patch::{scale_of, Note};

pub const HEADROOM: f64 = 0.55;

// Вокальные форманты: пять гласных (F1, F2, F3), морф интерполирует.
const VOWELS: [(f64, f64, f64); 5] = [
    (800.0, 1150.0, 2800.0), // А
    (500.0, 1900.0, 2550.0), // Э
    (280.0, 2250.0, 2890.0), // И
    (550.0, 950.0, 2400.0),  // О
    (350.0, 800.0, 2300.0),  // У
];

fn vowel_of(m: f64) -> [f64; 3] {
    let pos = m.clamp(0.0, 0.9999) * (VOWELS.len() - 1) as f64;
    let i = pos.floor() as usize;
    let frac = pos - i as f64;
    let a = VOWELS[i];
    let b = VOWELS[i + 1];
    [
        a.0 + (b.0 - a.0) * frac,
        a.1 + (b.1 - a.1) * frac,
        a.2 + (b.2 - a.2) * frac,
    ]
}

#[derive(Debug)]
pub struct NoteGate {
    pub note_idx: usize,
    pub end: f64, // время конца (сек, абсолютное) expRamp к 0.0001
}

pub struct RenderedVoice {
    pub start_sample: usize,
    pub samples: Vec<f32>,
}

/// Параметры длины/огибающей голоса — порт расчётов triggerVoice.
pub struct VoiceShape {
    pub attack: f64,
    pub voice_len: f64,
    pub base_len: f64,
    pub peak: f64,
    pub sus: f64,
    pub gates: Vec<(usize, f64)>, // (индекс ноты, gate)
}

pub fn voice_shape(track: &Track, notes: &[&Note], step_sec: f64) -> VoiceShape {
    let freqs: Vec<f64> = notes
        .iter()
        .map(|nt| {
            let rows = scale_of(track);
            let max = rows.len().saturating_sub(1) as i64;
            let idx = nt.n.clamp(0, max) as usize;
            track.freq * rows.get(idx).copied().unwrap_or(1.0)
        })
        .collect();
    let top_vel = notes.iter().map(|nt| nt.vel).fold(0.0f64, f64::max);
    let peak = (top_vel * HEADROOM / notes.len() as f64).max(0.0001);
    let lowest_period = 1.0 / freqs.iter().cloned().fold(f64::INFINITY, f64::min);
    let attack = track.attack.max((0.25 * lowest_period).min(0.012));
    let base_len = match track.note_steps {
        Some(ns) if ns > 0.0 => ns * step_sec,
        _ => attack + track.decay,
    };
    let max_gate = notes
        .iter()
        .map(|nt| nt.gate.unwrap_or(1.0).clamp(0.1, 4.0))
        .fold(1.0f64, f64::max);
    let mut sus = track.sustain.unwrap_or(0.0).clamp(0.0, 1.0);
    let base_len = match track.note_steps {
        Some(ns) if ns > 0.0 => ns * step_sec,
        _ => attack + track.decay,
    };
    let mut voice_len = base_len * max_gate;
    // 100% плато без сетки — «тянуть до перебоя» (порт voices.ts):
    // потолок 16 с, релиз 50 мс через sus чуть меньше единицы.
    if track.note_steps.is_none() && sus >= 0.99 {
        voice_len = voice_len.max(16.0);
        sus = 1.0 - 0.05 / voice_len;
    }
    let gates = notes
        .iter()
        .enumerate()
        .map(|(i, nt)| (i, nt.gate.unwrap_or(1.0).clamp(0.1, 4.0)))
        .collect();
    VoiceShape {
        attack,
        voice_len,
        base_len,
        peak,
        sus,
        gates,
    }
}

/// Огибающая громкости голоса (amp.gain в WebAudio) в момент t от старта.
pub fn voice_envelope(t: f64, sh: &VoiceShape) -> f64 {
    if t < 0.0 {
        return 0.0;
    }
    let plateau_end = sh.attack + (sh.voice_len - sh.attack) * sh.sus;
    if t < sh.attack {
        return linear_ramp(t, 0.0, 0.0, sh.attack, sh.peak);
    }
    if t < plateau_end {
        return sh.peak;
    }
    if t < sh.voice_len {
        return exponential_ramp(t, plateau_end.max(sh.attack), sh.peak, sh.voice_len, 0.0001);
    }
    0.0001
}

/// Гейн ноты с меньшим гейтом (noteGainOf в triggerVoice).
pub fn gate_gain(t: f64, sh: &VoiceShape, gate: f64) -> f64 {
    if gate >= 1.0 - 1e-9 {
        // maxGate — гейн не нужен, но сравнение идёт по maxGate голоса
        return 1.0;
    }
    let end = 0.03f64.max(sh.base_len * gate);
    if t < 0.0 {
        return 1.0;
    }
    if t < end {
        return exponential_ramp(t, 0.0, 1.0, end, 0.0001);
    }
    0.0001
}

/// Частота ноты с падением тона и вибрато (pitchDrop → exponentialRamp,
/// вибрато — синус от старта голоса, глубина в центах).
pub fn note_freq(track: &Track, base_freq: f64, t: f64) -> f64 {
    let mut f = base_freq;
    if track.pitch_drop > 1.0 && track.pitch_time > 0.0 {
        f = exponential_ramp(t, 0.0, base_freq * track.pitch_drop, track.pitch_time, base_freq);
    }
    let depth = track.vibrato_depth.unwrap_or(0.0);
    if depth > 0.0 {
        let rate = track.vibrato_rate.unwrap_or(5.0);
        let cents = depth * (2.0 * std::f64::consts::PI * rate * t).sin();
        f *= 2f64.powf(cents / 1200.0);
    }
    f
}

/// Рендер голоса осцилляторной модели (sine/square/triangle/sawtooth/fm).
/// t0 — абсолютное время старта (сек), step_sec — шаг эскиза.
pub fn render_osc_voice(
    track: &Track,
    notes: &[&Note],
    t0: f64,
    step_sec: f64,
    sr: f64,
) -> RenderedVoice {
    let sh = voice_shape(track, notes, step_sec);
    let stop = t0 + sh.voice_len + 0.05;
    let start_sample = (t0 * sr).round() as usize;
    let end_sample = (stop * sr).ceil() as usize;
    let mut out = vec![0.0f32; end_sample - start_sample];

    let rows = scale_of(track);
    let max = rows.len().saturating_sub(1) as i64;
    for (ni, nt) in notes.iter().enumerate() {
        let idx = nt.n.clamp(0, max) as usize;
        let base_freq = track.freq * rows.get(idx).copied().unwrap_or(1.0);
        let gate = sh
            .gates
            .iter()
            .find(|(i, _)| *i == ni)
            .map(|(_, g)| *g)
            .unwrap_or(1.0);

        match track.waveform {
            Waveform::Sine => {
                let mut phase = 0.0f64;
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let s = (2.0 * std::f64::consts::PI * phase).sin();
                    phase += note_freq(track, base_freq, t) / sr;
                    s
                });
            }
            Waveform::Square | Waveform::Triangle | Waveform::Sawtooth => {
                let table = WaveTable::build(track.waveform, base_freq, sr).unwrap();
                let mut phase = 0.0f64;
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let p = phase - phase.floor();
                    let s = table.sample(p);
                    phase += note_freq(track, base_freq, t) / sr;
                    s
                });
            }
            Waveform::Supersaw => {
                // 7 расстроенных пил (порт voices.ts): морф = ширина в центах.
                let det = 4.0 + track.voice_morph.unwrap_or(0.5) * 36.0;
                let voices7: [(f64, f64); 7] = [
                    (0.0, 1.0),
                    (-det * 0.33, 0.7),
                    (det * 0.33, 0.7),
                    (-det * 0.66, 0.5),
                    (det * 0.66, 0.5),
                    (-det, 0.32),
                    (det, 0.32),
                ];
                let norm: f64 = voices7.iter().map(|v| v.1).sum();
                let table = WaveTable::build(Waveform::Sawtooth, base_freq, sr).unwrap();
                let mut phases = [0.0f64; 7];
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let f = note_freq(track, base_freq, t);
                    let mut s = 0.0;
                    for (i, (dc, g)) in voices7.iter().enumerate() {
                        let p = phases[i] - phases[i].floor();
                        s += table.sample(p) * g;
                        phases[i] += f * 2f64.powf(dc / 1200.0) / sr;
                    }
                    s / norm
                });
            }
            Waveform::Karplus => {
                // Струна Karplus-Strong в буфер (порт karplusBuffer).
                let life = track.ks_life.unwrap_or(2.5).max(0.05);
                let n = ((sr / base_freq).round() as usize).max(2);
                let len = (((sh.voice_len + 0.05) * sr).ceil() as usize).max(2 * n);
                let mut rng = super::dsp::XorShift::new((base_freq * 1000.0) as u64);
                let mut buf: Vec<f64> = Vec::with_capacity(len);
                for _ in 0..n {
                    buf.push(rng.next_f64() * 2.0 - 1.0);
                }
                let g = (-6.9078 * n as f64 / (sr * life)).exp();
                for i in n..len {
                    let a = buf[i - n];
                    let b = if i + 1 >= n { buf[i + 1 - n] } else { a };
                    buf.push(g * 0.5 * (a + b));
                }
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let i = (t * sr) as usize;
                    buf.get(i).copied().unwrap_or(0.0)
                });
            }
            Waveform::Noise => {
                let mut rng = super::dsp::XorShift::new(((t0 * 1e6) as u64) ^ 0x9E37_79B9);
                render_note(&mut out, t0, sr, &sh, gate, |_, _| {
                    rng.next_f64() * 2.0 - 1.0
                });
            }
            Waveform::Additive | Waveform::Organ => {
                let m = track.voice_morph.unwrap_or(0.5);
                let amps: Vec<f64> = if matches!(track.waveform, Waveform::Organ) {
                    // Регистры 1,2,3,4,6,8 открываются по одному.
                    let regs = [1usize, 2, 3, 4, 6, 8];
                    let mut full = vec![0.0f64; 9];
                    for (i, r) in regs.iter().enumerate() {
                        full[*r] = (m * regs.len() as f64 * 1.15 - i as f64).clamp(0.15, 1.0);
                    }
                    full[1..].to_vec()
                } else {
                    let n = 2 + (m * 14.0).round() as usize;
                    (1..=n).map(|k| (k as f64).powf(-1.5)).collect()
                };
                let table = WaveTable::build_harmonics(&amps);
                let mut phase = 0.0f64;
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let p = phase - phase.floor();
                    let s = table.sample(p);
                    phase += note_freq(track, base_freq, t) / sr;
                    s
                });
            }
            Waveform::Formant => {
                // Пила сквозь три формантных полосовых + немного сухой.
                let [f1, f2, f3] = vowel_of(track.voice_morph.unwrap_or(0.5));
                let table = WaveTable::build(Waveform::Sawtooth, base_freq, sr).unwrap();
                let mut phase = 0.0f64;
                let mut bp: Vec<super::dsp::Biquad> = [(f1, 10.0, 1.0), (f2, 12.0, 0.55), (f3, 14.0, 0.3)]
                    .iter()
                    .map(|(ff, q, _)| super::dsp::Biquad::new("bandpass", *ff, *q, sr))
                    .collect();
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let p = phase - phase.floor();
                    let osc = table.sample(p);
                    phase += note_freq(track, base_freq, t) / sr;
                    let mut s = osc * 0.12;
                    for (i, (ff, _, g)) in [(f1, 10.0, 1.0), (f2, 12.0, 0.55), (f3, 14.0, 0.3)]
                        .iter()
                        .enumerate()
                    {
                        let _ = ff;
                        s += bp[i].process(osc) * g;
                    }
                    s
                });
            }
            Waveform::Modal => {
                // Шумовой щелчок 4 мс в банк резонаторов (порт PARTIALS).
                const PARTIALS_A: [f64; 4] = [1.0, 3.9, 9.2, 13.4];
                const PARTIALS_B: [f64; 4] = [1.0, 2.32, 4.25, 6.63];
                let m = track.voice_morph.unwrap_or(0.5);
                let q0 = 30.0 + m * 130.0;
                let mut bp: Vec<super::dsp::Biquad> = PARTIALS_A
                    .iter()
                    .enumerate()
                    .map(|(i, pa)| {
                        let ratio = pa + (PARTIALS_B[i] - pa) * m;
                        super::dsp::Biquad::new(
                            "bandpass",
                            (base_freq * ratio).min(17000.0),
                            q0 / (1.0 + i as f64 * 0.55),
                            sr,
                        )
                    })
                    .collect();
                let mut rng = super::dsp::XorShift::new((base_freq * 7777.0) as u64);
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let x = if t < 0.004 { rng.next_f64() * 2.0 - 1.0 } else { 0.0 };
                    let mut s = 0.0;
                    for (i, f) in bp.iter_mut().enumerate() {
                        s += f.process(x) * (0.9 / (i as f64 + 1.0));
                    }
                    s
                });
            }
            Waveform::Fm => {
                let ratio = track.fm_ratio.unwrap_or(2.0);
                let index = track.fm_index.unwrap_or(3.0);
                let mut ph_c = 0.0f64;
                let mut ph_m = 0.0f64;
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let f = note_freq(track, base_freq, t);
                    // Девиация: setValueAtTime(dev) → setTarget(0) от атаки.
                    // WebAudio модулирует ЧАСТОТУ (Гц): фаза несущей —
                    // интеграл (fc + dev·sin), а не dev в аргументе синуса.
                    let dev = index * f * ratio;
                    let dev_t = set_target(t, sh.attack, dev, 0.0, (track.decay * 0.4).max(0.02));
                    let mod_hz = dev_t * (2.0 * std::f64::consts::PI * ph_m).sin();
                    let s = (2.0 * std::f64::consts::PI * ph_c).sin();
                    ph_m += f * ratio / sr;
                    ph_c += (f + mod_hz) / sr;
                    s
                });
            }
            _ => {
                // Остальные модели — этап 4 (supersaw, karplus, …)
                let mut phase = 0.0f64;
                render_note(&mut out, t0, sr, &sh, gate, |t, _| {
                    let s = (2.0 * std::f64::consts::PI * phase).sin();
                    phase += note_freq(track, base_freq, t) / sr;
                    s
                });
            }
        }
    }
    RenderedVoice { start_sample, samples: out }
}

/// Заполнить буфер ноты: осциллятор × огибающая × гейт.
fn render_note(
    out: &mut [f32],
    t0: f64,
    sr: f64,
    sh: &VoiceShape,
    gate: f64,
    mut osc: impl FnMut(f64, f64) -> f64,
) {
    for (i, slot) in out.iter_mut().enumerate() {
        let t = i as f64 / sr; // время от старта голоса
        let _ = t0;
        let s = osc(t, t) * voice_envelope(t, sh) * gate_gain(t, sh, gate);
        *slot += s as f32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track_json(waveform: &str) -> Track {
        serde_json::from_value(serde_json::json!({
            "id": "t", "name": "t", "rate": 1, "phase": 0, "waveform": waveform,
            "scale": [1.0, 1.5], "freq": 220.0, "pitchDrop": 1,
            "pitchTime": 0.08, "filterLow": 20, "filterFreq": 8000,
            "attack": 0.002, "decay": 0.25, "volume": 0.8, "pan": 0.5,
            "mods": [], "patterns": []
        }))
        .unwrap()
    }

    #[test]
    fn envelope_shape() {
        let t = track_json("sine");
        let note = Note { n: 0, vel: 0.8, prob: 1.0, gate: None };
        let notes = [&note];
        let sh = voice_shape(&t, &notes, 0.125);
        // noteSteps нет: base = attack + decay = 0.252
        assert!((sh.base_len - 0.252).abs() < 1e-9);
        assert!((sh.voice_len - 0.252).abs() < 1e-9);
        assert!((sh.peak - 0.8 * HEADROOM).abs() < 1e-9);
        assert_eq!(voice_envelope(0.0, &sh), 0.0);
        assert!((voice_envelope(sh.attack, &sh) - sh.peak).abs() < 1e-6);
        // sustain 0: спад сразу после атаки
        assert!(voice_envelope(sh.attack + 0.001, &sh) < sh.peak);
        assert!((voice_envelope(sh.voice_len, &sh) - 0.0001).abs() < 1e-9);
    }

    #[test]
    fn sine_voice_starts_quiet_and_peaks() {
        let t = track_json("sine");
        let note = Note { n: 0, vel: 1.0, prob: 1.0, gate: None };
        let notes = [&note];
        let v = render_osc_voice(&t, &notes, 0.5, 0.125, 44100.0);
        assert_eq!(v.start_sample, 22050);
        assert!(v.samples[0].abs() < 1e-6);
        let mid = &v.samples[1000..2000];
        let peak = mid.iter().fold(0.0f32, |a, s| a.max(s.abs()));
        assert!(peak > 0.3 * HEADROOM as f32, "пик середины {peak}");
    }

    #[test]
    fn every_voice_model_is_audible() {
        // Каждая модель рендерится и звучит (смоук портreta моделей).
        for wf in [
            Waveform::Sine,
            Waveform::Square,
            Waveform::Triangle,
            Waveform::Sawtooth,
            Waveform::Supersaw,
            Waveform::Karplus,
            Waveform::Noise,
            Waveform::Additive,
            Waveform::Organ,
            Waveform::Formant,
            Waveform::Modal,
            Waveform::Fm,
        ] {
            let mut t = track_json("sine");
            t.waveform = wf;
            let note = Note { n: 0, vel: 1.0, prob: 1.0, gate: None };
            let notes = [&note];
            let v = render_osc_voice(&t, &notes, 0.1, 0.125, 44100.0);
            let mid = &v.samples[200..4410];
            let peak = mid.iter().fold(0.0f32, |a, s| a.max(s.abs()));
            // Модальный — тихая по природе модель (шумовой щелчок в
            // высокодобротные резонаторы): web-партиал даёт ~0.002 (зонд).
            assert!(peak > 0.002, "{wf:?}: пик {peak}");
        }
    }
}
