// Формула тайминга — порт src/audio/timing.ts один в один (контракт
// движка и UI, см. docs/DESIGN.md). JS `%` и Rust `%` для чисел с плавающей
// точкой — оба remainder с знаком делимого, расхождений нет.

use super::patch::{Pattern, Track};

pub const LOOKAHEAD_MS: u64 = 25;
pub const SCHEDULE_AHEAD: f64 = 0.12;
pub const BAR_TICKS: u64 = 16;

/// Базовый тик = 1/16 при rate = 1.
pub fn tick_duration(bpm: f64) -> f64 {
    60.0 / bpm / 4.0
}

/// Скорость шага: эскиз может переопределять шаг трека.
pub fn effective_rate(track: &Track, pattern: Option<&Pattern>) -> f64 {
    pattern.and_then(|p| p.rate).unwrap_or(track.rate)
}

pub fn step_duration(track: &Track, bpm: f64, pattern: Option<&Pattern>) -> f64 {
    effective_rate(track, pattern) * tick_duration(bpm)
}

pub fn start_step_index(track: &Track, pattern: &Pattern) -> i64 {
    let len = pattern.length as f64;
    (((track.phase % len) + len) % len) as i64
}

/// Позиция трека по часам от последнего сброса (смена сцены).
pub fn step_index_at(
    track: &Track,
    pattern: &Pattern,
    ctx_time: f64,
    reset_time: f64,
    bpm: f64,
) -> i64 {
    let elapsed = ctx_time - reset_time;
    if elapsed < 0.0 {
        return -1;
    }
    ((elapsed / step_duration(track, bpm, Some(pattern))).floor() as i64 + track.phase as i64)
        % pattern.length as i64
}

/// Часы трека планировщика: следующий шаг, его время и время последнего
/// сброса (границы сцены).
#[derive(Clone, Copy, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackClock {
    pub next_step_index: i64,
    pub next_step_time: f64,
    pub reset_time: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(phase: f64) -> Track {
        serde_json::from_value(serde_json::json!({
            "id": "t", "name": "t", "rate": 2.0, "phase": phase,
            "waveform": "sine", "scale": [1.0, 2.0], "freq": 220,
            "pitchDrop": 1, "pitchTime": 0.08, "filterLow": 20,
            "filterFreq": 8000, "attack": 0.002, "decay": 0.25,
            "volume": 0.8, "pan": 0.5, "mods": [], "patterns": []
        }))
        .unwrap()
    }

    fn pattern(len: usize, rate: Option<f64>) -> Pattern {
        serde_json::from_value(serde_json::json!({
            "id": "p", "name": "A", "length": len,
            "steps": [], "rate": rate, "forkedFrom": null
        }))
        .unwrap()
    }

    #[test]
    fn tick_is_sixteenth() {
        assert!((tick_duration(120.0) - 0.125).abs() < 1e-12);
    }

    #[test]
    fn step_respects_pattern_rate() {
        let t = track(3.0);
        let p = pattern(8, None);
        assert!((step_duration(&t, 120.0, Some(&p)) - 0.25).abs() < 1e-12);
        let p4 = pattern(8, Some(4.0));
        assert!((step_duration(&t, 120.0, Some(&p4)) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn phase_wraps_into_length() {
        let t = track(3.0);
        let p = pattern(4, None);
        assert_eq!(start_step_index(&t, &p), 3);
        // отрицательная фаза нормируется двойным взятием остатка
        let neg = track(-1.0);
        assert_eq!(start_step_index(&neg, &p), 3);
    }

    #[test]
    fn index_advances_with_clock() {
        let t = track(3.0);
        let p = pattern(4, None);
        // reset в 1.0, шаг 0.25 c: в 1.5 прошло 2 шага + фаза 3 → (2+3)%4 = 1
        assert_eq!(step_index_at(&t, &p, 1.5, 1.0, 120.0), 1);
        assert_eq!(step_index_at(&t, &p, 0.5, 1.0, 120.0), -1);
    }
}
