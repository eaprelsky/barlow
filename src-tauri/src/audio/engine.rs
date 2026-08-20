// Live-движок: транспорт + lookahead-планировщик внутри аудио-колбэка —
// порт engine.ts (сцены/цепочка, независимые часы треков, правки патча
// на лету, mono-retrigger, сайдчейн). Голоса рендерятся при триггере в
// свои буферы (render_osc_voice) и суммируются в текущие цепочки треков:
// замена цепочки не рвёт хвосты — стыки мягкие по построению.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use super::chain::TrackChain;
use super::master::MasterChain;
use super::patch::{pattern_in_scene, Patch};
use super::timing::{self, TrackClock, BAR_TICKS};
use super::voices::render_osc_voice;

const SCHEDULE_AHEAD: f64 = 0.12;

struct ActiveVoice {
    track_id: String,
    start_sample: u64,
    data: Arc<Vec<f32>>,
    pos: usize,
    /// Сэмпл, с которого голос экспоненциально гаснет (mono-retrigger).
    duck_at: Option<u64>,
}

#[derive(Default)]
struct ScratchLive {
    active: bool,
    pos: f64,
    smooth: f64,
    sample: Option<Arc<super::samples::SampleData>>,
}

struct LiveState {
    patch: Patch,
    scene_id: String,
    pending_scene: Option<String>,
    chain_pos: usize,
    manual: bool,
    scene_advance_sample: Option<u64>,
    clocks: HashMap<String, TrackClock>,
    chains: HashMap<String, TrackChain>,
    voices: Vec<ActiveVoice>,
    master: MasterChain,
}

pub struct LiveEngine {
    pub sr: f64,
    playing: AtomicBool,
    counter: AtomicU64,
    state: Mutex<LiveState>,
    meters: Mutex<HashMap<String, f32>>,
    samples: Mutex<HashMap<String, Arc<super::samples::SampleData>>>,
    scratch: Mutex<ScratchLive>,
    on_clock: Mutex<Box<dyn Fn(f64, &str, usize, bool) + Send>>,
}

impl LiveEngine {
    pub fn new(sr: f64) -> Arc<LiveEngine> {
        Arc::new(LiveEngine {
            sr,
            playing: AtomicBool::new(false),
            counter: AtomicU64::new(0),
            state: Mutex::new(LiveState {
                patch: empty_patch(),
                scene_id: String::new(),
                pending_scene: None,
                chain_pos: 0,
                manual: true,
                scene_advance_sample: None,
                clocks: HashMap::new(),
                chains: HashMap::new(),
                voices: Vec::new(),
                master: MasterChain::new(1.0, 0.0, sr),
            }),
            meters: Mutex::new(HashMap::new()),
            samples: Mutex::new(HashMap::new()),
            scratch: Mutex::new(ScratchLive::default()),
            on_clock: Mutex::new(Box::new(|_, _, _, _| {})),
        })
    }

    pub fn set_clock_callback(&self, f: Box<dyn Fn(f64, &str, usize, bool) + Send>) {
        *self.on_clock.lock().unwrap() = f;
    }

    pub fn put_sample(&self, id: String, sd: super::samples::SampleData) {
        self.samples.lock().unwrap().insert(id, Arc::new(sd));
    }

    pub fn playing(&self) -> bool {
        self.playing.load(Ordering::Relaxed)
    }

    pub fn play(&self, patch: Patch, scene_id: Option<String>) {
        let mut st = self.state.lock().unwrap();
        st.master = MasterChain::new(patch.master_volume, patch.master_comp.unwrap_or(0.0), self.sr);
        st.scene_id = scene_id
            .filter(|id| patch.scenes.iter().any(|s| &s.id == id))
            .or_else(|| patch.scenes.first().map(|s| s.id.clone()))
            .unwrap_or_default();
        st.chain_pos = patch
            .chain
            .iter()
            .position(|it| it.scene_id == st.scene_id)
            .unwrap_or(0);
        st.manual = !patch.follow_chain;
        st.clocks.clear();
        st.chains.clear();
        st.voices.clear();
        st.scene_advance_sample = None;
        let start = self.counter.load(Ordering::Relaxed) + (0.1 * self.sr) as u64;
        let scene = patch.scenes.iter().find(|s| s.id == st.scene_id).cloned();
        for t in &patch.tracks {
            if let Some(p) = pattern_in_scene(t, scene.as_ref()) {
                st.clocks.insert(
                    t.id.clone(),
                    TrackClock {
                        next_step_index: timing::start_step_index(t, p),
                        next_step_time: start as f64 / self.sr,
                        reset_time: start as f64 / self.sr,
                    },
                );
            }
        }
        st.patch = patch;
        self.playing.store(true, Ordering::Relaxed);
    }

    pub fn stop(&self) {
        self.playing.store(false, Ordering::Relaxed);
        let mut st = self.state.lock().unwrap();
        st.voices.clear();
        st.clocks.clear();
    }

    pub fn set_patch(&self, patch: Patch) {
        let mut st = self.state.lock().unwrap();
        st.master = MasterChain::new(patch.master_volume, patch.master_comp.unwrap_or(0.0), self.sr);
        let alive: std::collections::HashSet<String> =
            patch.tracks.iter().map(|t| t.id.clone()).collect();
        st.chains.retain(|id, _| alive.contains(id));
        st.clocks.retain(|id, _| alive.contains(id));
        st.patch = patch;
    }

    pub fn set_scene(&self, id: String) {
        self.state.lock().unwrap().pending_scene = Some(id);
    }

    pub fn set_follow_chain(&self, on: bool) {
        self.state.lock().unwrap().manual = !on;
    }

    pub fn set_bpm(&self, bpm: f64) {
        let mut st = self.state.lock().unwrap();
        let old = st.patch.bpm;
        if (bpm - old).abs() < 1e-9 || bpm <= 0.0 {
            return;
        }
        let ratio = timing::tick_duration(bpm) / timing::tick_duration(old);
        let now = self.counter.load(Ordering::Relaxed) as f64 / self.sr;
        for c in st.clocks.values_mut() {
            c.next_step_time = now + (c.next_step_time - now) * ratio;
            c.reset_time = now + (c.reset_time - now) * ratio;
        }
        if let Some(adv) = st.scene_advance_sample {
            let adv_s = adv as f64 / self.sr;
            st.scene_advance_sample = Some((((adv_s - now) * ratio + now) * self.sr) as u64);
        }
        st.patch.bpm = bpm;
    }

    /// Снимок для UI: (playing, now, sceneId, chainPos, часы треков).
    pub fn snapshot(&self) -> (bool, f64, String, usize, HashMap<String, TrackClock>) {
        let st = self.state.lock().unwrap();
        (
            self.playing.load(Ordering::Relaxed),
            self.counter.load(Ordering::Relaxed) as f64 / self.sr,
            st.scene_id.clone(),
            st.chain_pos,
            st.clocks.clone(),
        )
    }

    pub fn levels(&self) -> HashMap<String, f32> {
        self.meters.lock().unwrap().clone()
    }

    pub fn scratch_begin(&self, sample_id: Option<String>) {
        let mut sc = self.scratch.lock().unwrap();
        sc.active = true;
        sc.smooth = sc.pos;
        sc.sample = sample_id.and_then(|id| self.samples.lock().unwrap().get(&id).cloned());
    }

    pub fn scratch_move(&self, pos: f64) {
        self.scratch.lock().unwrap().pos = pos.clamp(0.0, 1.0);
    }

    pub fn scratch_end(&self) {
        self.scratch.lock().unwrap().active = false;
    }

    /// Продвинуть часы вывода (вызывает аудио-поток после блока).
    pub fn advance_clock(&self, frames: u64) {
        self.counter.fetch_add(frames, Ordering::Relaxed);
    }

    /// Рендер блока: планирование + голоса + цепочки + мастер.
    pub fn render_block(&self, out: &mut [f32], frames: usize, channels: usize, block_start: u64) {
        if self.playing.load(Ordering::Relaxed) {
            self.schedule(block_start);
        }
        let sr = self.sr;
        let mut st = self.state.lock().unwrap();
        let master_pan = st.patch.master_pan.unwrap_or(0.5);
        let mut meters = self.meters.lock().unwrap();
        let alpha_scratch = 1.0 - (-1.0 / (0.004 * sr)).exp();
        for i in 0..frames {
            let t = (block_start + i as u64) as f64 / sr;
            let mut mix: HashMap<String, f32> = HashMap::new();
            let now_abs = block_start + i as u64;
            let mut alive = Vec::with_capacity(st.voices.len());
            for mut v in st.voices.drain(..) {
                let end = v.start_sample + v.data.len() as u64;
                if now_abs >= end
                    || now_abs >= v.start_sample.saturating_add((16.4 * sr) as u64)
                {
                    continue;
                }
                if now_abs >= v.start_sample && v.pos < v.data.len() {
                    let mut amp = 1.0f64;
                    if let Some(d) = v.duck_at {
                        if now_abs >= d {
                            amp = 1e-5f64.max((-((now_abs - d) as f64 / sr) / 0.004).exp());
                        }
                    }
                    *mix.entry(v.track_id.clone()).or_insert(0.0) +=
                        v.data[v.pos] as f32 * amp as f32;
                    v.pos += 1;
                }
                alive.push(v);
            }
            st.voices = alive;
            // Живой скрэтч: прямо в мастер, мимо цепочек.
            let mut scratch_s = 0.0f64;
            {
                let mut sc = self.scratch.lock().unwrap();
                if sc.active {
                    if let Some(buf) = sc.sample.clone() {
                        sc.smooth += (sc.pos - sc.smooth) * alpha_scratch;
                        let p = sc.smooth.clamp(0.0, 1.0) * (buf.mono.len().saturating_sub(2)) as f64;
                        let idx = p.floor() as usize;
                        let frac = (p - idx as f64) as f32;
                        scratch_s = (buf.mono[idx] + (buf.mono[idx + 1] - buf.mono[idx]) * frac) as f64 * 0.9;
                    }
                }
            }
            let mut l = scratch_s;
            let mut r = scratch_s;
            let ids: Vec<String> = st.chains.keys().cloned().collect();
            for tid in ids {
                let mono = mix.get(tid.as_str()).copied().unwrap_or(0.0) as f64;
                if let Some(chain) = st.chains.get_mut(&tid) {
                    chain.tick_mods(sr);
                    let (cl, cr) = chain.process(mono, t, sr);
                    l += cl;
                    r += cr;
                    let lvl = ((cl * cl + cr * cr) * 0.5).sqrt() as f32;
                    let e = meters.entry(tid.clone()).or_insert(0.0);
                    *e = if lvl > *e { lvl } else { *e * 0.86 + lvl * 0.14 };
                }
            }
            let (ml, mr) = st.master.process(l, r, master_pan);
            let off = i * channels;
            if channels >= 2 {
                out[off] = ml as f32;
                out[off + 1] = mr as f32;
            } else {
                out[off] = ((ml + mr) * 0.5) as f32;
            }
        }
        // Часы наружу ~30 Гц
        let tick = (self.sr / 30.0) as u64;
        if block_start / tick != (block_start + frames as u64) / tick {
            let (playing, now, scene, pos, _) = self.snapshot();
            if playing {
                (self.on_clock.lock().unwrap())(now, &scene, pos, playing);
            }
        }
    }

    /// Планировщик: ноты до горизонта (порт scheduler() движка TS).
    fn schedule(&self, block_start: u64) {
        let now = block_start as f64 / self.sr;
        let horizon = now + SCHEDULE_AHEAD;
        let sr = self.sr;
        let mut st = self.state.lock().unwrap();

        // Ручная сцена: применяется на ближайшей границе такта.
        if let Some(pending) = st.pending_scene.clone() {
            st.pending_scene = None;
            if st.patch.scenes.iter().any(|s| s.id == pending) && pending != st.scene_id {
                let bar_dur = BAR_TICKS as f64 * timing::tick_duration(st.patch.bpm);
                let boundary = st
                    .clocks
                    .values()
                    .map(|c| {
                        let elapsed = (now - c.reset_time).max(0.0);
                        c.reset_time + (elapsed / bar_dur).ceil() * bar_dur
                    })
                    .min_by(|a, b| a.partial_cmp(b).unwrap())
                    .unwrap_or(now);
                st.scene_id = pending.clone();
                st.chain_pos = st
                    .patch
                    .chain
                    .iter()
                    .position(|it| it.scene_id == pending)
                    .unwrap_or(0);
                let scene = st.patch.scenes.iter().find(|s| s.id == pending).cloned();
                for t in st.patch.tracks.clone() {
                    if let Some(c) = st.clocks.get_mut(&t.id) {
                        c.next_step_time = boundary;
                        c.reset_time = boundary;
                        if let Some(p) = pattern_in_scene(&t, scene.as_ref()) {
                            c.next_step_index = timing::start_step_index(&t, p);
                        }
                    }
                }
                st.scene_advance_sample = None;
                st.manual = true;
            }
        }

        // Автопродвижение цепочки на границе сцены.
        if let Some(adv) = st.scene_advance_sample {
            let adv_s = adv as f64 / sr;
            if adv_s < horizon && !st.patch.chain.is_empty() {
                st.chain_pos = (st.chain_pos + 1) % st.patch.chain.len();
                st.scene_id = st.patch.chain[st.chain_pos].scene_id.clone();
                let scene = st
                    .patch
                    .scenes
                    .iter()
                    .find(|s| s.id == st.scene_id)
                    .cloned();
                for t in st.patch.tracks.clone() {
                    if let Some(c) = st.clocks.get_mut(&t.id) {
                        c.next_step_time = adv_s;
                        c.reset_time = adv_s;
                        if let Some(p) = pattern_in_scene(&t, scene.as_ref()) {
                            c.next_step_index = timing::start_step_index(&t, p);
                        }
                    }
                }
                let bars = st.patch.chain[st.chain_pos].bars;
                st.scene_advance_sample = Some(
                    adv + (bars as f64 * BAR_TICKS as f64 * timing::tick_duration(st.patch.bpm) * sr) as u64,
                );
            }
        } else if st.patch.follow_chain && !st.patch.chain.is_empty() {
            let bars = st.patch.chain[st.chain_pos].bars;
            st.scene_advance_sample = Some(
                block_start + (bars as f64 * BAR_TICKS as f64 * timing::tick_duration(st.patch.bpm) * sr) as u64,
            );
        }

        let scene = st.patch.scenes.iter().find(|s| s.id == st.scene_id).cloned();
        let tracks = st.patch.tracks.clone();
        for track in &tracks {
            if track.enabled == Some(false) {
                continue;
            }
            let Some(pattern) = pattern_in_scene(track, scene.as_ref()) else {
                continue;
            };
            if pattern.muted == Some(true) {
                continue;
            }
            // Цепочка: создать при смене сигнатуры, иначе обновить параметры.
            let eff_mods = pattern.mods.clone().unwrap_or_else(|| track.mods.clone());
            let eff_volume = pattern.volume.unwrap_or(track.volume);
            let eff_pan = pattern.pan.unwrap_or(track.pan);
            if st.chains.get(&track.id).map(|c| c.sig() != chain_sig(track, &eff_mods)).unwrap_or(true) {
                st.chains.insert(
                    track.id.clone(),
                    TrackChain::new(track, eff_volume, eff_pan, &eff_mods, sr),
                );
            } else if let Some(chain) = st.chains.get_mut(&track.id) {
                chain.set_params(eff_volume, eff_pan);
            }
            let step_dur = timing::step_duration(track, st.patch.bpm, Some(&pattern));
            if !st.clocks.contains_key(&track.id) {
                st.clocks.insert(
                    track.id.clone(),
                    TrackClock {
                        next_step_index: timing::start_step_index(track, &pattern),
                        next_step_time: now + 0.05,
                        reset_time: now + 0.05,
                    },
                );
            }
            let Some(clock) = st.clocks.get_mut(&track.id) else { continue };
            if clock.next_step_time < now {
                clock.next_step_time = now + 0.005;
            }
            // Локальная выноска часов: внутри цикла мутабельны голоса/цепочки.
            let mut next_time = clock.next_step_time;
            let mut next_idx = clock.next_step_index;
            let mut guard = 0;
            while next_time < horizon && guard < 1024 {
                guard += 1;
                let at = next_time;
                let idx = next_idx;
                let step = pattern.steps.get(idx.rem_euclid(pattern.steps.len().max(1) as i64) as usize);
                if let Some(step) = step {
                    let notes: Vec<&super::patch::Note> =
                        step.notes.iter().filter(|n| n.prob >= 1.0).collect();
                    if !notes.is_empty() {
                        if track.mono == Some(true) {
                            let new_start = (at * sr) as u64;
                            for v in st.voices.iter_mut() {
                                if v.track_id == track.id && v.duck_at.is_none() {
                                    let end = v.start_sample + v.data.len() as u64;
                                    if end > new_start {
                                        v.duck_at = Some(new_start);
                                    }
                                }
                            }
                        }
                        let sample = track
                            .sample_id
                            .as_ref()
                            .and_then(|id| self.samples.lock().unwrap().get(id).cloned());
                        let voice = render_osc_voice(track, &notes, at, step_dur, sr, sample.as_deref());
                        st.voices.push(ActiveVoice {
                            track_id: track.id.clone(),
                            start_sample: (at * sr).round() as u64,
                            data: Arc::new(voice.samples),
                            pos: 0,
                            duck_at: None,
                        });
                        for rt in st.patch.tracks.clone() {
                            if let Some(sc) = &rt.sidechain {
                                if sc.source_id == track.id {
                                    if let Some(chain) = st.chains.get_mut(&rt.id) {
                                        chain.push_duck(at, sc.amount, sc.release_sec);
                                    }
                                }
                            }
                        }
                    }
                }
                next_idx = (idx + 1).rem_euclid(pattern.length.max(1) as i64);
                next_time += step_dur;
            }
            if let Some(clock) = st.clocks.get_mut(&track.id) {
                clock.next_step_time = next_time;
                clock.next_step_index = next_idx;
            }
        }
        // Голоса, кончившиеся давно, убираем (потолок 16.4 с).
        st.voices
            .retain(|v| v.start_sample + v.data.len() as u64 > block_start);
    }
}

/// Сигнатура набора модуляций/эффектов (порт modSig).
fn chain_sig(track: &super::patch::Track, mods: &[super::patch::Mod]) -> String {
    let mods_s = mods
        .iter()
        .map(|m| format!("{}:{:?}:{:?}", m.target, m.source, m.shape))
        .collect::<Vec<_>>()
        .join(",");
    let fx_s = track
        .effects
        .as_ref()
        .map(|fx| {
            fx.iter()
                .map(|e| serde_json::to_string(e).unwrap_or_default())
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_default();
    format!("{mods_s}|{fx_s}")
}

fn empty_patch() -> Patch {
    serde_json::from_value(serde_json::json!({
        "version": 0, "bpm": 120, "masterVolume": 1, "followChain": false,
        "scenes": [], "chain": [], "tracks": []
    }))
    .unwrap()
}
