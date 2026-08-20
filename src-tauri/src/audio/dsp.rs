// DSP-примитивы порта: band-limited осцилляторы, biquad-фильтры по формулам
// Web Audio-спеки, автоматизации AudioParam (linear/exponential рампы,
// setTarget). Осцилляторы строятся через DFT точной спека-формулы волны с
// обрезкой гармоник по Найквисту — спектр и фаза совпадают с WebAudio,
// который для своих волн использует band-limited таблицы.

use super::patch::Waveform;

pub const TABLE_LEN: usize = 2048;

/// Целевые формы Web Audio-спеки (x — фаза 0..1 от старта осциллятора).

/// Пила по спеке: 2·(t − floor(t + 1/2)), t = x (в циклах).
pub fn saw_value(x: f64) -> f64 {
    2.0 * (x - (x + 0.5).floor())
}

/// Квадрат: положительная полуволна первой половины фазы.
pub fn square_value(x: f64) -> f64 {
    if x < 0.5 { 1.0 } else { -1.0 }
}

/// Треугольник по спеке: 2·|пила| − 1.
pub fn triangle_value(x: f64) -> f64 {
    2.0 * saw_value(x).abs() - 1.0
}

/// Band-limited таблица волны: DFT точной формы (2048 точек), гармоники
/// 1..=n_harm, фазы сохраняются автоматически. Синус таблицей не строим —
/// он считается напрямую.
pub struct WaveTable {
    data: Vec<f64>,
}

impl WaveTable {
    pub fn build(waveform: Waveform, freq: f64, sample_rate: f64) -> Option<WaveTable> {
        let target: fn(f64) -> f64 = match waveform {
            Waveform::Sawtooth => saw_value,
            Waveform::Square => square_value,
            Waveform::Triangle => triangle_value,
            _ => return None,
        };
        // Гармоники выше Найквиста от основной — обрезаем.
        let nyq = sample_rate / 2.0;
        let n_harm = ((nyq / freq.max(0.01)).floor() as usize).clamp(1, 512);
        let n = TABLE_LEN;
        let mut a = vec![0.0f64; n_harm + 1]; // косинусы
        let mut b = vec![0.0f64; n_harm + 1]; // синусы
        for k in 1..=n_harm {
            let mut sa = 0.0;
            let mut sb = 0.0;
            for j in 0..n {
                let x = j as f64 / n as f64;
                let s = target(x);
                let ang = 2.0 * std::f64::consts::PI * k as f64 * x;
                sa += s * ang.cos();
                sb += s * ang.sin();
            }
            a[k] = 2.0 * sa / n as f64;
            b[k] = 2.0 * sb / n as f64;
        }
        let mut data = vec![0.0f64; n];
        for j in 0..n {
            let x = j as f64 / n as f64;
            let mut v = 0.0;
            for k in 1..=n_harm {
                let ang = 2.0 * std::f64::consts::PI * k as f64 * x;
                v += a[k] * ang.cos() + b[k] * ang.sin();
            }
            data[j] = v;
        }
        Some(WaveTable { data })
    }

    /// Сэмпл по фазе 0..1, линейная интерполяция.
    #[inline]
    pub fn sample(&self, phase: f64) -> f64 {
        let p = phase - phase.floor();
        let pos = p * TABLE_LEN as f64;
        let i = pos as usize % TABLE_LEN;
        let frac = pos - pos.floor();
        let j = (i + 1) % TABLE_LEN;
        self.data[i] + (self.data[j] - self.data[i]) * frac
    }

    /// Таблица из амплитуд гармоник (аналог PeriodicWave с imag=amps):
    /// волна = Σ aₖ·sin(2πkx), пик нормализован к 1 (как
    /// disableNormalization=false у Chromium).
    pub fn build_harmonics(amps: &[f64]) -> WaveTable {
        let n = TABLE_LEN;
        let mut data = vec![0.0f64; n];
        let mut peak = 0.0f64;
        for j in 0..n {
            let x = j as f64 / n as f64;
            let mut v = 0.0;
            for (k, a) in amps.iter().enumerate() {
                v += a * (2.0 * std::f64::consts::PI * (k as f64 + 1.0) * x).sin();
            }
            data[j] = v;
            peak = peak.max(v.abs());
        }
        if peak > 1e-9 {
            for v in &mut data {
                *v /= peak;
            }
        }
        WaveTable { data }
    }
}

/// Детерминированный ГПСЧ для шума/Karplus (зерно — от ноты: рендер
/// воспроизводим; live-звуку безразлично, web там Math.random).
pub struct XorShift(u64);

impl XorShift {
    pub fn new(seed: u64) -> Self {
        XorShift(seed | 1)
    }

    pub fn next_f64(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        (x >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// Biquad-фильтр (low/high/band pass) по формулам Web Audio-спеки (RBJ
/// cookbook с расчётом Q через dbGain-масштаба bandpass).
#[derive(Clone)]
pub struct Biquad {
    pub b0: f64,
    pub b1: f64,
    pub b2: f64,
    pub a1: f64,
    pub a2: f64,
    pub x1: f64,
    pub x2: f64,
    pub y1: f64,
    pub y2: f64,
}

impl Biquad {
    pub fn new(kind: &str, freq: f64, q: f64, sample_rate: f64) -> Biquad {
        let ff = (freq / sample_rate).clamp(1e-5, 0.499);
        let w0 = 2.0 * std::f64::consts::PI * ff;
        let (alpha, cos_w) = (w0.sin() / (2.0 * q), w0.cos());
        let (b0, b1, b2, a0, a1, a2) = match kind {
            "lowpass" => (
                (1.0 - cos_w) / 2.0,
                1.0 - cos_w,
                (1.0 - cos_w) / 2.0,
                1.0 + alpha,
                -2.0 * cos_w,
                1.0 - alpha,
            ),
            "highpass" => (
                (1.0 + cos_w) / 2.0,
                -(1.0 + cos_w),
                (1.0 + cos_w) / 2.0,
                1.0 + alpha,
                -2.0 * cos_w,
                1.0 - alpha,
            ),
            // WebAudio bandpass с Q: «пик 0 дБ на центральной» вариант.
            _ => (alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cos_w, 1.0 - alpha),
        };
        Biquad {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    pub fn process(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// AudioParam: setValueAtTime → linearRampToValueAtTime (куском).
pub fn linear_ramp(t: f64, t0: f64, v0: f64, t1: f64, v1: f64) -> f64 {
    if t <= t0 {
        return v0;
    }
    if t >= t1 {
        return v1;
    }
    v0 + (v1 - v0) * (t - t0) / (t1 - t0).max(1e-12)
}

/// AudioParam: exponentialRampToValueAtTime (обе величины > 0).
pub fn exponential_ramp(t: f64, t0: f64, v0: f64, t1: f64, v1: f64) -> f64 {
    if t <= t0 {
        return v0;
    }
    if t >= t1 {
        return v1;
    }
    let r = (t - t0) / (t1 - t0).max(1e-12);
    v0 * (v1 / v0).powf(r)
}

/// AudioParam: setTargetAtTime (экспоненциальное приближение к цели).
pub fn set_target(t: f64, t0: f64, v0: f64, v1: f64, tc: f64) -> f64 {
    if t <= t0 {
        return v0;
    }
    v1 + (v0 - v1) * (-(t - t0) / tc.max(1e-9)).exp()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_matches_target_low_freq() {
        // На низкой частоте (много гармоник) таблица повторяет форму.
        // У разрыва фазы (x≈0.5) усечённый ряд Фурье колеблется (Гиббс) —
        // окно ±2% фазы не проверяем: пара сэмплов на период, RMS-блоки
        // золотого эталона к этому нечувствительны.
        let t = WaveTable::build(Waveform::Sawtooth, 55.0, 44100.0).unwrap();
        let mut err: f64 = 0.0;
        for j in 0..TABLE_LEN {
            let x = j as f64 / TABLE_LEN as f64;
            if (x - 0.5).abs() < 0.02 {
                continue;
            }
            err = err.max((t.sample(x) - saw_value(x)).abs());
        }
        assert!(err < 0.03, "пила: макс. отклонение {err}");
        let t = WaveTable::build(Waveform::Square, 55.0, 44100.0).unwrap();
        assert!((t.sample(0.25) - 1.0).abs() < 0.02);
        assert!((t.sample(0.75) - -1.0).abs() < 0.02);
    }

    #[test]
    fn saw_phase_starts_at_zero() {
        // Спека: пила в фазе 0 равна 0 (старт без щелчка).
        assert!((saw_value(0.0)).abs() < 1e-12);
        assert!((saw_value(0.25) - 0.5).abs() < 1e-12);
        assert!((saw_value(0.75) - -0.5).abs() < 1e-12);
    }

    #[test]
    fn biquad_lowpass_silences_nyquist() {
        let mut f = Biquad::new("lowpass", 100.0, 0.8, 44100.0);
        // Высокочастотный сигнал сильно давится
        let mut acc: f64 = 0.0;
        for i in 0..4410 {
            let x = (2.0 * std::f64::consts::PI * 10000.0 * i as f64 / 44100.0).sin();
            acc = acc.max(f.process(x).abs());
        }
        assert!(acc < 0.2, "низкочастотный шум прошёл: {acc}");
    }

    #[test]
    fn ramps_match_param_semantics() {
        assert_eq!(linear_ramp(0.5, 0.0, 0.0, 1.0, 1.0), 0.5);
        assert!((exponential_ramp(0.5, 0.0, 1.0, 1.0, 4.0) - 2.0).abs() < 1e-9);
        assert!((set_target(1e9, 0.0, 1.0, 0.0, 1.0)).abs() < 1e-6);
    }
}
