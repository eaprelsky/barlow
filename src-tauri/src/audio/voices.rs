// Голоса: порт triggerVoice (src/audio/voices.ts) в посэмпловый рендер.
// Один голос = моно-буфер сэмплов от старта до гашения; цепочка трека
// (фильтры/эффекты/панорама) применяется дальше в chain.rs. Огибающая и
// рампы — семантика AudioParam (linear/exponential ramp, setTarget).

use super::dsp::{exponential_ramp, linear_ramp, set_target, WaveTable};
use super::patch::{Track, Waveform};
use super::patch::{scale_of, Note};

pub const HEADROOM: f64 = 0.55;

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
}
