// Live-движок: транспорт + lookahead-планировщик внутри аудио-колбэка —
// порт engine.ts (сцены/цепочка, независимые часы треков, правки патча
// на лету, mono-retrigger, сайдчейн). Голоса рендерятся при триггере в
// свои буферы (render_osc_voice) и суммируются в текущие цепочки треков:
// замена цепочки не рвёт хвосты — стыки мягкие по построению.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
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
    last_sched: AtomicU64,
    /// Диагностика: сколько блоков отрендерено (смоук-тест/отладка).
    pub render_blocks: AtomicU64,
    /// Диагностика: фаза последнего блока (1..11), см. render_block.
    pub debug_phase: AtomicU8,
    /// Диагностика: сэмпл в теле блока (фаза 8).
    pub debug_i: std::sync::atomic::AtomicU32,
    /// Сколько сэмплов библиотеки загружено (диагностика UI).
    pub loaded_samples: std::sync::atomic::AtomicUsize,
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
            last_sched: AtomicU64::new(0),
            render_blocks: AtomicU64::new(0),
            debug_phase: AtomicU8::new(0),
            debug_i: std::sync::atomic::AtomicU32::new(0),
            loaded_samples: std::sync::atomic::AtomicUsize::new(0),
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
    /// Без аллокаций на сэмпл: голоса проходятся один раз на блок,
    /// миксы накапливаются в переиспользуемые буферы.
    pub fn render_block(&self, out: &mut [f32], frames: usize, channels: usize, block_start: u64) {
        self.debug_phase.store(1, Ordering::Relaxed);
        let block_end = block_start + frames as u64;
        // Планировщик — не чаще ~6 мс (как lookahead-проход web-движка).
        if self.playing.load(Ordering::Relaxed)
            && block_start.saturating_sub(self.last_sched.load(Ordering::Relaxed))
                >= (self.sr / 160.0) as u64
        {
            self.debug_phase.store(2, Ordering::Relaxed);
            self.schedule(block_start);
            self.last_sched.store(block_start, Ordering::Relaxed);
        }
        self.debug_phase.store(7, Ordering::Relaxed);
        let sr = self.sr;
        let mut st = self.state.lock().unwrap();
        self.debug_phase.store(8, Ordering::Relaxed);
        let master_pan = st.patch.master_pan.unwrap_or(0.5);
        let mut meters = self.meters.lock().unwrap();

        // 1) Голоса → моно-микс на трек (один проход на блок).
        let mut mix: HashMap<String, Vec<f32>> = HashMap::new();
        st.voices.retain(|v| v.start_sample + v.data.len() as u64 > block_start);
        for v in st.voices.iter_mut() {
            let v_start = v.start_sample;
            let v_end = v_start + v.data.len() as u64;
            if v_end <= block_start || v_start >= block_end {
                continue;
            }
            let from = block_start.saturating_sub(v_start) as usize;
            let mut di = v_start.saturating_sub(block_start) as usize;
            let mut k = from;
            let duck_dt = 1.0 / (0.004 * sr as f32);
            let entry = mix.entry(v.track_id.clone()).or_insert_with(|| vec![0.0; frames]);
            while di < frames && k < v.data.len() {
                let mut amp = 1.0f32;
                if let Some(d) = v.duck_at {
                    let abs = v_start + k as u64;
                    if abs >= d {
                        amp = (-((abs - d) as f32 * duck_dt)).exp().max(1e-5);
                    }
                }
                entry[di] += v.data[k] * amp;
                di += 1;
                k += 1;
            }
        }

        // 2) Живой скрэтч: буфер на блок, прямо в мастер.
        let mut scratch_buf = vec![0.0f32; frames];
        {
            let mut sc = self.scratch.lock().unwrap();
            if sc.active {
                if let Some(buf) = sc.sample.clone() {
                    let alpha = 1.0 - (-1.0 / (0.004 * sr)).exp();
                    for slot in scratch_buf.iter_mut() {
                        sc.smooth += (sc.pos - sc.smooth) * alpha;
                        let p = sc.smooth.clamp(0.0, 1.0) * (buf.mono.len().saturating_sub(2)) as f64;
                        let idx = p.floor() as usize;
                        let frac = (p - idx as f64) as f32;
                        *slot = (buf.mono[idx] + (buf.mono[idx + 1] - buf.mono[idx]) * frac) * 0.9;
                    }
                }
            }
        }

        // 3) Цепочки треков + мастер, посэмплово.
        let ids: Vec<String> = st.chains.keys().cloned().collect();
        let scratch_get = |i: usize| scratch_buf.get(i).copied().unwrap_or(0.0);
        for i in 0..frames {
            self.debug_i.store(i as u32, Ordering::Relaxed);
            let t = (block_start + i as u64) as f64 / sr;
            let mut l = scratch_get(i) as f64;
            let mut r = l;
            for tid in &ids {
                let mono = mix
                    .get(tid.as_str())
                    .and_then(|m| m.get(i).copied())
                    .unwrap_or(0.0) as f64;
                if let Some(chain) = st.chains.get_mut(tid) {
                    chain.tick_mods(sr);
                    let (cl, cr) = chain.process(mono, t, sr);
                    l += cl;
                    r += cr;
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
        // Тумбометры: RMS по блоку на трек.
        for tid in &ids {
            let mut sum = 0.0f64;
            if let Some(m) = mix.get(tid.as_str()) {
                for v in m {
                    sum += (*v as f64) * (*v as f64);
                }
            }
            let lvl = (sum / frames.max(1) as f64).sqrt() as f32;
            let e = meters.entry(tid.clone()).or_insert(0.0);
            *e = if lvl > *e { lvl } else { *e * 0.86 + lvl * 0.14 };
        }
        // Данные для события часов — под локами; сами локи отпускаем ДО
        // вызова callback: раньше здесь звался snapshot() и намертво
        // вешал поток рекурсивным state.lock() (render_block его держал).
        let scene_id_now = st.scene_id.clone();
        let chain_pos_now = st.chain_pos;
        drop(meters);
        drop(st);
        self.debug_phase.store(9, Ordering::Relaxed);
        // Часы наружу ~30 Гц
        let tick = (self.sr / 30.0) as u64;
        if block_start / tick != block_end / tick {
            let playing = self.playing.load(Ordering::Relaxed);
            if playing {
                let now = block_end as f64 / self.sr;
                (self.on_clock.lock().unwrap())(now, &scene_id_now, chain_pos_now, playing);
            }
        }
        self.render_blocks.fetch_add(1, Ordering::Relaxed);
        self.debug_phase.store(11, Ordering::Relaxed);
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
        let mut triggers: Vec<(super::patch::Track, f64, Vec<super::patch::Note>, f64)> = Vec::new();
        // Порт audibleSet: соло сцены оставляет только свою дорожку,
        // мьют партии и выключенный трек молчат. Соло на удалённую
        // дорожку игнорируем — иначе фильтр глушил бы всё подряд.
        let solo_track = scene.as_ref().and_then(|s| s.solo_track_id.clone()).filter(|solo| {
            tracks.iter().any(|t| &t.id == solo)
        });
        for track in &tracks {
            if track.enabled == Some(false) {
                continue;
            }
            if let Some(solo) = &solo_track {
                if &track.id != solo {
                    continue;
                }
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
            // Триггеры собираем под локом, голоса рендерим БЕЗ лока
            // (сотни тысяч сэмплов на голос не должны голодать остальных).
            let mut pending: Vec<(f64, Vec<super::patch::Note>)> = Vec::new();
            let mut guard = 0;
            while next_time < horizon && guard < 1024 {
                guard += 1;
                let at = next_time;
                let idx = next_idx;
                let step = pattern.steps.get(idx.rem_euclid(pattern.steps.len().max(1) as i64) as usize);
                if let Some(step) = step {
                    let notes: Vec<super::patch::Note> = step
                        .notes
                        .iter()
                        .filter(|n| n.prob >= 1.0)
                        .cloned()
                        .collect();
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
                        pending.push((at, notes));
                    }
                }
                next_idx = (idx + 1).rem_euclid(pattern.length.max(1) as i64);
                next_time += step_dur;
            }
            if let Some(clock) = st.clocks.get_mut(&track.id) {
                clock.next_step_time = next_time;
                clock.next_step_index = next_idx;
            }
            // Сайдчейны качают приёмников — тоже под локом, дёшево.
            for (at, _) in &pending {
                for rt in st.patch.tracks.clone() {
                    if let Some(sc) = &rt.sidechain {
                        if sc.source_id == track.id {
                            if let Some(chain) = st.chains.get_mut(&rt.id) {
                                chain.push_duck(*at, sc.amount, sc.release_sec);
                            }
                        }
                    }
                }
            }
            for (at, notes) in pending {
                triggers.push((track.clone(), at, notes, step_dur));
            }
        }
        // Голоса рендерим БЕЗ лока: сотни тысяч сэмплов на голос не
        // должны голодать главный поток и соседние блоки.
        self.debug_phase.store(5, Ordering::Relaxed);
        drop(st);
        let mut rendered: Vec<(String, f64, Vec<f32>)> = Vec::with_capacity(triggers.len());
        for (track, at, notes, step_dur) in triggers {
            let refs: Vec<&super::patch::Note> = notes.iter().collect();
            let sample = track
                .sample_id
                .as_ref()
                .and_then(|id| self.samples.lock().unwrap().get(id).cloned());
            let voice = render_osc_voice(&track, &refs, at, step_dur, sr, sample.as_deref());
            rendered.push((track.id.clone(), at, voice.samples));
        }
        self.debug_phase.store(6, Ordering::Relaxed);
        let mut st = self.state.lock().unwrap();
        for (track_id, at, data) in rendered {
            st.voices.push(ActiveVoice {
                track_id,
                start_sample: (at * sr).round() as u64,
                data: Arc::new(data),
                pos: 0,
                duck_at: None,
            });
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
