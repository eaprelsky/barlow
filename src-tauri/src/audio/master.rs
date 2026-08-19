// Мастер — порт connectMaster (src/audio/fx.ts): громкость (0.75·v) →
// компрессия (плотность 0..1; 0 — нейтрален) → мягкий tanh-лимитер
// (0.8 — колено, вход до ±2) → общая панорама. Компрессор — порт по
// Web Audio-спеке (dB-домен, мягкое колено, сглаживание атаки/релиза);
// в golden-эталоне masterComp = 0, компрессор нейтрален.

const KNEE: f64 = 0.8;
/// Мастер-гейн: 1.5·v — как в fx.ts (компенсация прежнего скрытого ×2
/// кривой лимитера на домене [-2,2], которую заменили честной на [-1,1]).
const MASTER_GAIN: f64 = 1.5;

fn limiter_value(x: f64) -> f64 {
    // Вход клампится к [-1, 1] — как WaveShaper по спеке
    let ax = x.abs().min(1.0);
    let y = if ax <= KNEE {
        ax
    } else {
        KNEE + (1.0 - KNEE) * ((ax - KNEE) / (1.0 - KNEE)).tanh()
    };
    y.copysign(x)
}

pub struct MasterChain {
    input_gain: f64,
    // Компрессор (нейтрален при amount = 0)
    threshold: f64,
    ratio: f64,
    knee: f64,
    attack_tc: f64,
    release_tc: f64,
    makeup: f64,
    envelope: f64, // сглаженная оценка уровня (линейная)
}

impl MasterChain {
    pub fn new(volume: f64, comp: f64, _sr: f64) -> MasterChain {
        let (threshold, ratio, makeup) = if comp <= 0.0 {
            (0.0, 1.0, 1.0)
        } else {
            (-8.0 - 22.0 * comp, 2.0 + 8.0 * comp, 1.0 + 0.9 * comp)
        };
        MasterChain {
            input_gain: MASTER_GAIN * volume,
            threshold,
            ratio,
            knee: 24.0,
            attack_tc: 0.006 / 3.0,  // приближение к цели за attack
            release_tc: 0.16 / 3.0,
            makeup,
            envelope: 0.0,
        }
    }

    fn compressor_gain(&mut self, x: f64) -> f64 {
        if self.ratio <= 1.0 {
            return 1.0;
        }
        // Огибающая детектора (peak, атака/релиз экспоненциальные).
        let target = x.abs().max(1e-6);
        let tc = if target > self.envelope {
            self.attack_tc
        } else {
            self.release_tc
        };
        self.envelope += (target - self.envelope) * (1.0 - (-1.0 / (44100.0 * tc)).exp());
        let level_db = 20.0 * self.envelope.log10();
        // Gain computer с мягким коленом (Web Audio-спека).
        let (thr, knee) = (self.threshold, self.knee);
        let over = level_db - thr;
        let slope = 1.0 / self.ratio - 1.0;
        let reduction_db = if over <= -knee / 2.0 {
            0.0
        } else if over >= knee / 2.0 {
            slope * over
        } else {
            // Внутри колена: парабола
            let x2 = over + knee / 2.0;
            slope * (x2 * x2) / (2.0 * knee)
        };
        10f64.powf(reduction_db / 20.0)
    }

    pub fn process(&mut self, l: f64, r: f64, master_pan: f64) -> (f64, f64) {
        let gl = self.compressor_gain(l);
        let gr = self.compressor_gain(r);
        let l = l * self.input_gain * gl * self.makeup;
        let r = r * self.input_gain * gr * self.makeup;
        let l = limiter_value(l);
        let r = limiter_value(r);
        // StereoPanner на СТЕРЕО-входе (мастер — после лимитера): пан
        // перекатывает только «уходящий» канал, диагональ = 1 — центр
        // не ослабляет (матрица снята с Chromium зондом).
        let pan = (master_pan * 2.0 - 1.0).clamp(-1.0, 1.0);
        let (out_l, out_r) = if pan >= 0.0 {
            (l * (pan * std::f64::consts::FRAC_PI_2).cos(), l * (pan * std::f64::consts::FRAC_PI_2).sin() + r)
        } else {
            (l + r * (-pan * std::f64::consts::FRAC_PI_2).sin(), r * (-pan * std::f64::consts::FRAC_PI_2).cos())
        };
        (out_l, out_r)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limiter_linear_below_knee() {
        for x in [0.0, 0.3, -0.79, 0.8] {
            assert!((limiter_value(x) - x).abs() < 1e-12);
        }
        // выше колена — мягкое сжатие; вход клампится к 1: y(1)=0.8+0.2·tanh(1)
        assert!((limiter_value(1.0) - 0.9523).abs() < 0.001);
        assert!((limiter_value(2.0) - 0.9523).abs() < 0.001);
    }

    #[test]
    fn neutral_comp_is_transparent() {
        let mut m = MasterChain::new(1.0, 0.0, 44100.0);
        let (l, r) = m.process(0.5, -0.25, 0.5);
        // 1.5·0.5; мастер-панер в центре — identity на стерео-входе
        assert!((l - 0.75).abs() < 1e-9);
        assert!((r + 0.375).abs() < 1e-9);
    }
}
