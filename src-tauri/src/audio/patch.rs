// Модель патча — зеркало src/types.ts (serde, camelCase как в JSON).
// Патч приходит из UI как JSON и десериализуется сюда; нормализация
// (clamp'ы, дефолты normalizePatch) на стороне UI уже выполнена.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Waveform {
    Sine,
    Square,
    Triangle,
    Sawtooth,
    Noise,
    Fm,
    Karplus,
    Supersaw,
    Additive,
    Formant,
    Modal,
    Organ,
    Sample,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SampleMode {
    Plain,
    Grain,
    Scratch,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchPoint {
    pub t: f64,
    pub pos: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub n: i64,
    pub vel: f64,
    pub prob: f64,
    pub gate: Option<f64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Step {
    pub notes: Vec<Note>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mod {
    /// Цель модуляции; свободная строка как в TS (pan/volume/filterFreq/…).
    pub target: String,
    pub source: Option<String>,
    /// Форма LFO; отсутствует у старых патчей.
    pub shape: Option<String>,
    pub rate: f64,
    pub depth: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Effect {
    Delay {
        #[serde(rename = "timeSec")]
        time_sec: f64,
        feedback: f64,
        mix: f64,
    },
    Reverb {
        #[serde(rename = "sizeSec")]
        size_sec: f64,
        mix: f64,
    },
    Dist {
        drive: f64,
        mix: f64,
    },
    Chorus {
        rate: f64,
        mix: f64,
    },
    Lofi {
        bits: f64,
        mix: f64,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sidechain {
    pub source_id: String,
    pub amount: f64,
    #[serde(rename = "releaseSec")]
    pub release_sec: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pattern {
    pub id: String,
    pub name: String,
    pub length: usize,
    #[serde(default)]
    pub steps: Vec<Step>,
    pub rate: Option<f64>,
    pub forked_from: Option<String>,
    pub volume: Option<f64>,
    pub pan: Option<f64>,
    pub mods: Option<Vec<Mod>>,
    pub muted: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub name: String,
    pub rate: f64,
    pub phase: f64,
    pub waveform: Waveform,
    #[serde(default)]
    pub scale: Vec<f64>,
    pub scale_oct_up: Option<i64>,
    pub scale_oct_down: Option<i64>,
    pub freq: f64,
    pub pitch_drop: f64,
    pub pitch_time: f64,
    pub note_steps: Option<f64>,
    pub filter_low: f64,
    pub filter_freq: f64,
    pub filter_q: Option<f64>,
    pub attack: f64,
    pub decay: f64,
    pub sustain: Option<f64>,
    pub volume: f64,
    pub pan: f64,
    #[serde(default)]
    pub mods: Vec<Mod>,
    pub sample_id: Option<String>,
    pub sample_name: Option<String>,
    pub fm_ratio: Option<f64>,
    pub fm_index: Option<f64>,
    pub voice_morph: Option<f64>,
    pub vibrato_rate: Option<f64>,
    pub vibrato_depth: Option<f64>,
    pub ks_life: Option<f64>,
    pub sample_mode: Option<SampleMode>,
    pub grain_size_ms: Option<f64>,
    pub grain_count: Option<i64>,
    pub grain_pos: Option<f64>,
    pub grain_scatter: Option<f64>,
    pub scratch_points: Option<Vec<ScratchPoint>>,
    pub mono: Option<bool>,
    pub enabled: Option<bool>,
    pub effects: Option<Vec<Effect>>,
    pub sidechain: Option<Sidechain>,
    #[serde(default)]
    pub patterns: Vec<Pattern>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub slots: HashMap<String, String>,
    pub solo_track_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainItem {
    pub scene_id: String,
    pub bars: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MasterNoise {
    Off,
    White,
    Pink,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    pub version: u32,
    pub bpm: f64,
    pub title: Option<String>,
    pub master_volume: f64,
    pub master_pan: Option<f64>,
    pub master_noise: Option<MasterNoise>,
    pub master_noise_level: Option<f64>,
    pub master_comp: Option<f64>,
    pub follow_chain: bool,
    #[serde(default)]
    pub scenes: Vec<Scene>,
    #[serde(default)]
    pub chain: Vec<ChainItem>,
    #[serde(default)]
    pub tracks: Vec<Track>,
}

/// Порт scaleOf: базовая шкала + октавы, пересечения схлопываются,
/// итог сортирован. Строки нотного стана.
pub fn scale_of(track: &Track) -> Vec<f64> {
    let up = track.scale_oct_up.unwrap_or(0);
    let down = track.scale_oct_down.unwrap_or(0);
    let mut seen = std::collections::HashSet::new();
    let mut rows: Vec<f64> = Vec::new();
    for o in -down..=up {
        let k = 2f64.powi(o as i32);
        for &r in &track.scale {
            let v = format!("{:.9}", r * k).parse::<f64>().unwrap_or(r * k);
            if seen.insert(v.to_bits()) {
                rows.push(v);
            }
        }
    }
    rows.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    rows
}

/// Частоты всех нот шага (аккорда); пусто — пауза.
pub fn step_freqs(track: &Track, step: &Step) -> Vec<f64> {
    let rows = scale_of(track);
    let max = rows.len().saturating_sub(1) as i64;
    step.notes
        .iter()
        .map(|nt| {
            let idx = nt.n.clamp(0, max) as usize;
            track.freq * rows.get(idx).copied().unwrap_or(1.0)
        })
        .collect()
}

/// Паттерн трека в конкретной сцене (fallback — первый).
pub fn pattern_in_scene<'a>(track: &'a Track, scene: Option<&Scene>) -> Option<&'a Pattern> {
    let wanted = scene.and_then(|s| s.slots.get(&track.id));
    track
        .patterns
        .iter()
        .find(|p| Some(&p.id) == wanted)
        .or_else(|| track.patterns.first())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_patch_json() -> &'static str {
        r#"{
            "version": 29, "bpm": 118, "masterVolume": 0.9, "followChain": false,
            "scenes": [{"id": "s1", "name": "A", "slots": {"t1": "p1"}}],
            "chain": [{"sceneId": "s1", "bars": 2}],
            "tracks": [{
                "id": "t1", "name": "бас", "rate": 4, "phase": 0,
                "waveform": "supersaw", "scale": [1, 1.2], "freq": 55,
                "pitchDrop": 1.3, "pitchTime": 0.3, "filterLow": 20,
                "filterFreq": 800, "filterQ": 6, "attack": 0.005, "decay": 1.8,
                "sustain": 0.85, "volume": 0.7, "pan": 0.5, "mods": [],
                "effects": [{"type": "dist", "drive": 5, "mix": 0.65}],
                "patterns": [{"id": "p1", "name": "A", "length": 2,
                    "steps": [{"notes": [{"n": 0, "vel": 0.8, "prob": 1}]}, {"notes": []}]}]
            }]
        }"#
    }

    #[test]
    fn patch_roundtrip_camel_case() {
        let patch: Patch = serde_json::from_str(minimal_patch_json()).unwrap();
        assert_eq!(patch.bpm, 118.0);
        let t = &patch.tracks[0];
        assert_eq!(t.waveform, Waveform::Supersaw);
        assert_eq!(t.filter_q, Some(6.0));
        assert_eq!(t.sustain, Some(0.85));
        match &t.effects.as_deref().unwrap_or(&[])[..] {
            [Effect::Dist { drive, mix, .. }] => {
                assert_eq!(*drive, 5.0);
                assert_eq!(*mix, 0.65);
            }
            other => panic!("эффект не распознан: {other:?}"),
        }
        assert_eq!(t.patterns[0].steps[0].notes[0].n, 0);
        // сериализация обратно сохраняет camelCase-поля
        let json = serde_json::to_value(&patch).unwrap();
        assert!(json["tracks"][0].get("filterQ").is_some());
        assert!(json["tracks"][0].get("pitchDrop").is_some());
    }

    #[test]
    fn scale_octaves_dedupe_sorted() {
        let mut t: Track = serde_json::from_value(serde_json::json!({
            "id": "t", "name": "t", "rate": 1, "phase": 0, "waveform": "sine",
            "scale": [1.0, 1.5, 2.0], "freq": 220, "pitchDrop": 1,
            "pitchTime": 0.08, "filterLow": 20, "filterFreq": 8000,
            "attack": 0.002, "decay": 0.25, "volume": 0.8, "pan": 0.5,
            "mods": [], "scaleOctUp": 1, "patterns": []
        }))
        .unwrap();
        assert_eq!(scale_of(&t), vec![1.0, 1.5, 2.0, 3.0, 4.0]);
        t.scale = vec![1.0, 1.5];
        t.scale_oct_up = Some(0);
        t.scale_oct_down = Some(0);
        assert_eq!(scale_of(&t), vec![1.0, 1.5]);
    }

    #[test]
    fn scene_slot_resolves_pattern() {
        let patch: Patch = serde_json::from_str(minimal_patch_json()).unwrap();
        let t = &patch.tracks[0];
        let scene = patch.scenes.first();
        assert_eq!(pattern_in_scene(t, scene).unwrap().id, "p1");
    }
}
