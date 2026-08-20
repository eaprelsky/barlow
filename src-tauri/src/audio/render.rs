// Оффлайн-рендер патча — порт renderToWav (src/audio/engine.ts): те же
// цепочки на сцену, то же планирование шагов от 0.05 с, моно-голоса
// миксуются в цепочку трека, мастер — громкость → компрессия → лимитер →
// пан. Результат — стерео Float32 (WAV-обёртка — на этапе интеграции).

use super::chain::TrackChain;
use super::master::MasterChain;
use super::patch::{pattern_in_scene, step_freqs, Patch, Track};
use super::timing::{start_step_index, step_duration, tick_duration, BAR_TICKS};
use super::voices::render_osc_voice;

/// Эффективные параметры трека в партии (паттерн переопределяет).
fn effective(track: &Track, pattern: &super::patch::Pattern) -> (f64, f64, Vec<super::patch::Mod>) {
    (
        pattern.volume.unwrap_or(track.volume),
        pattern.pan.unwrap_or(track.pan),
        pattern.mods.clone().unwrap_or_else(|| track.mods.clone()),
    )
}

/// Слоты сцены, которые слышны (соло сцены глушит остальных).
fn audible_ids(patch: &Patch, scene: &super::patch::Scene) -> std::collections::HashSet<String> {
    let mut ids = std::collections::HashSet::new();
    match &scene.solo_track_id {
        Some(solo) => {
            for t in &patch.tracks {
                if let Some(p) = pattern_in_scene(t, Some(scene)) {
                    if &t.id == solo {
                        ids.insert(p.id.clone());
                    }
                }
            }
        }
        None => {
            for t in &patch.tracks {
                if t.enabled != Some(false) {
                    if let Some(p) = pattern_in_scene(t, Some(scene)) {
                        if p.muted != Some(true) {
                            ids.insert(p.id.clone());
                        }
                    }
                }
            }
        }
    }
    ids
}

/// Задержка мастер-лимитера WebAudio: WaveShaper с oversample '4x' в
/// Chromium вносит линейную задержку ~193 сэмпла (FIR апсемплинга без
/// компенсации — снято зондом). Нативный limiter_value задержки не имеет;
/// сдвиг нужен только для сэмпл-точной сверки с web-эталоном.
pub const WEB_SHAPER_4X_LATENCY: usize = 199;

/// Рендер цепочки сцен (арранжмент) в стерео. Сверка с WebAudio — через
/// golden (RMS-блоки + пик), частота рендера 44100 как в web-эталоне.
pub fn render_patch(patch: &Patch, sr: f64) -> (Vec<f32>, Vec<f32>) {
    let tick = tick_duration(patch.bpm);
    let total: f64 = patch
        .chain
        .iter()
        .map(|it| it.bars as f64 * BAR_TICKS as f64 * tick)
        .sum::<f64>()
        + 1.0;
    let n = (total * sr).ceil() as usize;

    // Цепочки (трек:сцена) — как в renderToWav, чтобы дак находил приёмников.
    let mut chains: Vec<(String, String, TrackChain)> = Vec::new();
    for track in &patch.tracks {
        for item in &patch.chain {
            let scene = patch.scenes.iter().find(|s| s.id == item.scene_id);
            let Some(pattern) = pattern_in_scene(track, scene) else {
                continue;
            };
            let (vol, pan, mods) = effective(track, pattern);
            chains.push((
                track.id.clone(),
                item.scene_id.clone(),
                TrackChain::new(track, vol, pan, &mods, sr),
            ));
        }
    }

    // Голоса: моно-микс на (трек, сцена).
    let mut voice_mix: std::collections::HashMap<(String, String), Vec<f32>> =
        std::collections::HashMap::new();
    let mut duck_targets: Vec<((String, String), f64, f64, f64)> = Vec::new();

    for track in &patch.tracks {
        let mut t = 0.05f64;
        for item in &patch.chain {
            let scene = patch.scenes.iter().find(|s| s.id == item.scene_id);
            let Some(pattern) = pattern_in_scene(track, scene) else {
                continue;
            };
            let audible = scene
                .map(|s| audible_ids(patch, s).contains(&pattern.id))
                .unwrap_or(true);
            let step_dur = step_duration(track, patch.bpm, Some(pattern));
            let item_dur = item.bars as f64 * BAR_TICKS as f64 * tick;
            let mut idx = start_step_index(track, pattern).rem_euclid(pattern.length.max(1) as i64) as usize;
            let mut tt = t;
            while tt < t + item_dur - 0.001 {
                let step = &pattern.steps[idx % pattern.steps.len().max(1)];
                let notes: Vec<&super::patch::Note> = step
                    .notes
                    .iter()
                    .filter(|nt| nt.prob >= 1.0)
                    .collect();
                if !notes.is_empty() && audible && track.enabled != Some(false) {
                    let voice = render_osc_voice(track, &notes, tt, step_dur, sr, None);
                    let mix = voice_mix
                        .entry((track.id.clone(), item.scene_id.clone()))
                        .or_default();
                    TrackChain::mix_voice(mix, &voice);
                    // Сайдчейн: ноты этой дорожки качают приглушаемых.
                    for rt in &patch.tracks {
                        if let Some(sc) = &rt.sidechain {
                            if sc.source_id == track.id {
                                duck_targets.push((
                                    (rt.id.clone(), item.scene_id.clone()),
                                    tt,
                                    sc.amount,
                                    sc.release_sec,
                                ));
                            }
                        }
                    }
                }
                idx = (idx + 1) % pattern.length.max(1);
                tt += step_dur;            }
            t += item_dur;
        }
    }

    // Дак-события в цепочки приёмников.
    for ((tid, sid), at, amount, release) in duck_targets {
        if let Some((_, _, chain)) = chains.iter_mut().find(|(t, s, _)| *t == tid && *s == sid) {
            chain.ducks.push((at, amount, release));
        }
    }

    let mut master = MasterChain::new(patch.master_volume, patch.master_comp.unwrap_or(0.0), sr);
    let master_pan = patch.master_pan.unwrap_or(0.5);
    let mut out_l = vec![0.0f32; n];
    let mut out_r = vec![0.0f32; n];
    let mix_len = voice_mix.values().map(|v| v.len()).max().unwrap_or(0);
    for i in 0..mix_len.max(n.min(mix_len)) {
        let t = i as f64 / sr;
        let mut l = 0.0f64;
        let mut r = 0.0f64;
        for (tid, sid, chain) in chains.iter_mut() {
            chain.tick_mods(sr);
            let mono = voice_mix
                .get(&(tid.clone(), sid.clone()))
                .and_then(|v| v.get(i).copied())
                .unwrap_or(0.0) as f64;
            let (cl, cr) = chain.process(mono, t, sr);
            l += cl;
            r += cr;
        }
        let (ml, mr) = master.process(l, r, master_pan);
        if i + WEB_SHAPER_4X_LATENCY < n {
            out_l[i + WEB_SHAPER_4X_LATENCY] = ml as f32;
            out_r[i + WEB_SHAPER_4X_LATENCY] = mr as f32;
        }
    }
    (out_l, out_r)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_for_empty_patch() {
        let patch: Patch = serde_json::from_value(serde_json::json!({
            "version": 1, "bpm": 120, "masterVolume": 1, "followChain": false,
            "scenes": [], "chain": [], "tracks": []
        }))
        .unwrap();
        let (l, r) = render_patch(&patch, 44100.0);
        // Пустая цепочка → только хвост 1 с
        assert_eq!(l.len(), 44100);
        assert!(l.iter().all(|&v| v == 0.0));
        assert_eq!(l.len(), r.len());
    }

    #[test]
    fn render_fixture_patch_is_audible() {
        let json = std::fs::read_to_string("../fixtures/fixture-patch.json")
            .or_else(|_| std::fs::read_to_string("fixtures/fixture-patch.json"))
            .expect("fixture-patch.json");
        let patch: Patch = serde_json::from_str(&json).unwrap();
        let (l, _) = render_patch(&patch, 44100.0);
        assert_eq!(l.len(), 220500);
        let peak = l.iter().fold(0.0f32, |a, v| a.max(v.abs()));
        assert!(peak > 0.1, "рендер пуст, пик {peak}");
        let freqs = step_freqs(&patch.tracks[0], &patch.tracks[0].patterns[0].steps[0]);
        assert!((freqs[0] - 220.0).abs() < 1e-9);
    }
}
