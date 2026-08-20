// WASAPI-вывод: exclusive-режим напрямую драйверу (нет виндового микшера,
// ресемплинга и лимитера), при невозможности — shared с autoconvert.
// Вся инициализация и цикл живут в одном потоке (COM-объекты wasapi не
// Send), связь с приложением — атомики и канал. Частота и каналы берутся
// из нативного формата устройства: движок обязан рендерить на них.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::JoinHandle;

use serde::Serialize;
use wasapi::*;

#[derive(Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub default: bool,
}

#[derive(Clone, Serialize)]
pub struct OutputInfo {
    pub device: String,
    pub rate: u32,
    pub channels: usize,
    pub exclusive: bool,
    pub period_frames: u32,
    pub format: String,
}

pub struct OutputConfig {
    /// WASAPI id устройства; None — по умолчанию.
    pub device_id: Option<String>,
    pub exclusive: bool,
    /// Желаемый период в фреймах; 0 — авто (~1.5× минимума драйвера).
    pub buffer_frames: u32,
    /// Live-движок как источник звука (иначе тест-тон).
    pub engine: Option<std::sync::Arc<super::engine::LiveEngine>>,
}

/// Активные рендер-устройства; дефолт первым. COM-вызовы — в собственном
/// потоке: потоки пула Tauri живут в STA, и CoInitializeEx(MTA) там
/// падает с RPC_E_CHANGED_MODE (0x80010106).
pub fn list_devices() -> Result<Vec<DeviceInfo>, String> {
    std::thread::scope(|s| {
        s.spawn(|| {
            let hr = initialize_mta();
            if hr.is_err() {
                return Err(format!("MTA: {hr:?}"));
            }
            let enumerator = DeviceEnumerator::new().map_err(|e| e.to_string())?;
            let mut out: Vec<DeviceInfo> = Vec::new();
            if let Ok(def) = enumerator.get_default_device(&Direction::Render) {
                if let (Ok(id), Ok(name)) = (def.get_id(), def.get_friendlyname()) {
                    out.push(DeviceInfo { id, name, default: true });
                }
            }
            if let Ok(collection) = enumerator.get_device_collection(&Direction::Render) {
                for idx in 0..collection.get_nbr_devices().unwrap_or(0) {
                    let Ok(dev) = collection.get_device_at_index(idx) else {
                        continue;
                    };
                    if !matches!(dev.get_state(), Ok(DeviceState::Active)) {
                        continue;
                    }
                    let (Ok(id), Ok(name)) = (dev.get_id(), dev.get_friendlyname()) else {
                        continue;
                    };
                    if out.iter().any(|d| d.id == id) {
                        continue;
                    }
                    out.push(DeviceInfo { id, name, default: false });
                }
            }
            Ok(out)
        })
        .join()
        .unwrap_or_else(|_| Err("поток перечисления устройств умер".into()))
    })
}

/// Нативный формат устройства (частота/каналы) — без открытия потока
/// вывода; в собственном потоке (см. list_devices).
pub fn query_format(device_id: Option<String>) -> Result<(u32, usize), String> {
    std::thread::scope(|s| {
        s.spawn(move || {
            let hr = initialize_mta();
            if hr.is_err() {
                return Err(format!("MTA: {hr:?}"));
            }
            let enumerator = DeviceEnumerator::new().map_err(|e| e.to_string())?;
            let device = match device_id {
                Some(id) => enumerator.get_device(&id).map_err(|e| e.to_string()),
                None => enumerator
                    .get_default_device(&Direction::Render)
                    .map_err(|e| e.to_string()),
            }?;
            let fmt = device.get_device_format().map_err(|e| e.to_string())?;
            Ok((fmt.get_samplespersec(), fmt.get_nchannels() as usize))
        })
        .join()
        .unwrap_or_else(|_| Err("поток опроса формата умер".into()))
    })
}

struct Shared {
    running: AtomicBool,
    tone_on: AtomicBool,
}

pub struct OutputHandle {
    pub info: OutputInfo,
    shared: Arc<Shared>,
    join: Option<JoinHandle<()>>,
    /// Поток шлёт сигнал по выходу — ждём с таймаутом, чтобы GUI не вис.
    done: mpsc::Receiver<()>,
}

impl Drop for OutputHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl OutputHandle {
    pub fn set_tone(&self, on: bool) {
        self.shared.tone_on.store(on, Ordering::Relaxed);
    }

    /// Остановить поток: максимум 1.5 c ожидания, дальше detach —
    /// интерфейс не имеет права зависнуть из-за аудио.
    fn shutdown(&mut self) {
        self.shared.running.store(false, Ordering::Relaxed);
        if self.done.recv_timeout(std::time::Duration::from_millis(1500)).is_ok() {
            if let Some(j) = self.join.take() {
                let _ = j.join();
            }
        } else if let Some(j) = self.join.take() {
            std::mem::forget(j); // detach: поток добьёт очистку сам
        }
    }

    pub fn stop(mut self) {
        self.shutdown();
    }
}

pub fn start(config: OutputConfig) -> Result<OutputHandle, String> {
    let (tx, rx) = mpsc::channel::<Result<OutputInfo, String>>();
    let (done_tx, done_rx) = mpsc::channel::<()>();
    let shared = Arc::new(Shared {
        running: AtomicBool::new(true),
        tone_on: AtomicBool::new(false),
    });
    let sh = Arc::clone(&shared);
    let join = std::thread::Builder::new()
        .name("barlow-audio-out".into())
        .spawn(move || {
            run_stream(&config, &sh, tx);
            let _ = done_tx.send(());
        })
        .map_err(|e| e.to_string())?;
    // Таймаут инициализации: если драйвер виснет в Initialize, не тянем
    // вызывающего дольше 3 с (поток добьёт очистку сам при drop JoinHandle).
    match rx.recv_timeout(std::time::Duration::from_secs(3)) {
        // Ok — поток доложил параметры и ушёл в цикл событий
        Ok(Ok(info)) => Ok(OutputHandle { info, shared, join: Some(join), done: done_rx }),
        Ok(Err(e)) => {
            let _ = join.join();
            Err(e)
        }
        Err(_) => Err("вывод не поднялся за 3 с — драйвер не отвечает (попробуйте shared-режим)".into()),
    }
}

fn pick_device(enumerator: &DeviceEnumerator, id: &Option<String>) -> Result<Device, String> {
    match id {
        Some(id) => enumerator.get_device(id).map_err(|e| e.to_string()),
        None => enumerator
            .get_default_device(&Direction::Render)
            .map_err(|e| e.to_string()),
    }
}

fn run_stream(config: &OutputConfig, shared: &Shared, tx: mpsc::Sender<Result<OutputInfo, String>>) {
    let report = |r: Result<OutputInfo, String>| {
        let _ = tx.send(r);
    };
    if initialize_mta().is_err() {
        return report(Err("MTA: не удалось инициализировать COM".into()));
    }
    let enumerator = match DeviceEnumerator::new() {
        Ok(e) => e,
        Err(e) => return report(Err(e.to_string())),
    };
    let device = match pick_device(&enumerator, &config.device_id) {
        Ok(d) => d,
        Err(e) => return report(Err(format!("устройство: {e}"))),
    };
    let dev_name = device.get_friendlyname().unwrap_or_default();
    let mut audio_client = match device.get_iaudioclient() {
        Ok(c) => c,
        Err(e) => return report(Err(e.to_string())),
    };
    // Нативный формат устройства — рендерим на его частоте и каналах.
    let mix = match device.get_device_format() {
        Ok(m) => m,
        Err(e) => return report(Err(format!("формат устройства: {e}"))),
    };
    let rate = mix.get_samplespersec();
    let channels = mix.get_nchannels() as usize;

    // Exclusive пробуем во float; часть драйверов принимает только int —
    // тогда 24-в-32. Не вышло и это — тихий fallback в shared.
    let mut exclusive = config.exclusive;
    let mut format =
        WaveFormat::new(32, 32, &SampleType::Float, rate as usize, channels, None);
    if exclusive {
        match audio_client.is_supported_exclusive_with_quirks(&format) {
            Ok(f) => format = f,
            Err(_) => {
                let f24 = WaveFormat::new(24, 32, &SampleType::Int, rate as usize, channels, None);
                match audio_client.is_supported_exclusive_with_quirks(&f24) {
                    Ok(f) => format = f,
                    Err(_) => exclusive = false,
                }
            }
        }
    }
    let (def_period, min_period) = match audio_client.get_device_period() {
        Ok(p) => p,
        Err(e) => return report(Err(format!("период: {e}"))),
    };
    let want_hns = if config.buffer_frames > 0 {
        config.buffer_frames as i64 * 10_000_000 / rate as i64
    } else {
        3 * min_period / 2
    };
    let mode = if exclusive {
        let period = audio_client
            .calculate_aligned_period_near(want_hns.max(min_period), Some(128), &format)
            .unwrap_or(want_hns.max(min_period));
        StreamMode::EventsExclusive {
            period_hns: period,
        }
    } else {
        StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: want_hns.max(def_period),
        }
    };
    if let Err(e) = audio_client.initialize_client(&format, &Direction::Render, &mode) {
        return report(Err(format!("initialize ({:?}): {e}", mode_name(&mode))));
    }
    let h_event = match audio_client.set_get_eventhandle() {
        Ok(h) => h,
        Err(e) => return report(Err(e.to_string())),
    };
    let render_client = match audio_client.get_audiorenderclient() {
        Ok(r) => r,
        Err(e) => return report(Err(e.to_string())),
    };

    let bits = format.get_bitspersample();
    let valid = {
        let v = format.get_validbitspersample();
        if v == 0 { bits } else { v }
    };
    let is_float = matches!(format.get_subformat(), Ok(SampleType::Float));
    let format_name = if is_float {
        format!("float{bits}")
    } else {
        format!("int{valid}-in-{bits}")
    };
    let period_frames = (match &mode {
        StreamMode::EventsExclusive { period_hns } => period_hns * rate as i64 / 10_000_000,
        _ => want_hns * rate as i64 / 10_000_000,
    }) as u32;
    let info = OutputInfo {
        device: dev_name,
        rate,
        channels,
        exclusive,
        period_frames,
        format: format_name,
    };
    report(Ok(info.clone()));

    // Источник: live-движок или тест-тон (этап 1).
    let mut phase: f64 = 0.0;
    let step = 440.0 / rate as f64;
    let mut counter: u64 = 0;
    let mut write = |frames: usize| -> bool {
        let mut pcm: Vec<f32> = Vec::with_capacity(frames * channels);
        let tone = shared.tone_on.load(Ordering::Relaxed);
        if let Some(engine) = &config.engine {
            let block_start = counter;
            pcm.resize(frames * channels, 0.0);
            engine.render_block(&mut pcm, frames, channels, block_start);
            engine.advance_clock(frames as u64);
            if tone {
                // Тон работает и поверх движка — тракт проверяется в любом режиме.
                for frame in pcm.chunks_exact_mut(channels) {
                    phase += step;
                    if phase >= 1.0 {
                        phase -= 1.0;
                    }
                    let s = (phase * std::f64::consts::TAU).sin() as f32 * 0.2;
                    for ch in frame.iter_mut() {
                        *ch += s;
                    }
                }
            }
        } else {
            for _ in 0..frames {
                phase += step;
                if phase >= 1.0 {
                    phase -= 1.0;
                }
                let s = if tone { (phase * std::f64::consts::TAU).sin() as f32 * 0.2 } else { 0.0 };
                for _ in 0..channels {
                    pcm.push(s);
                }
            }
        }
        counter += frames as u64;
        let bytes = samples_to_bytes(&pcm, is_float, bits, valid);
        render_client.write_to_device(frames, &bytes, None).is_ok()
    };

    // Префилл, чтобы поток стартовал с реальным звуком, а не тишиной.
    if let Ok(space) = audio_client.get_available_space_in_frames() {
        write(space as usize);
    }
    if audio_client.start_stream().is_err() {
        return;
    }
    while shared.running.load(Ordering::Relaxed) {
        if h_event.wait_for_event(1000).is_err() {
            break;
        }
        let Ok(frames) = audio_client.get_available_space_in_frames() else {
            break;
        };
        if !write(frames as usize) {
            break;
        }
    }
    let _ = audio_client.stop_stream();
}

fn mode_name(mode: &StreamMode) -> &'static str {
    match mode {
        StreamMode::EventsShared { .. } | StreamMode::PollingShared { .. } => "shared",
        StreamMode::EventsExclusive { .. } | StreamMode::PollingExclusive { .. } => "exclusive",
    }
}

/// Interleaved f32 → байты формата устройства. Int: значащие биты —
/// младшие, dword little-endian усекается до контейнера (3 байта для 24).
fn samples_to_bytes(samples: &[f32], is_float: bool, bits: u16, valid: u16) -> Vec<u8> {
    if is_float {
        return samples.iter().flat_map(|s| s.to_le_bytes()).collect();
    }
    let max = 2f64.powi(valid as i32 - 1) - 1.0;
    let shift = (bits.saturating_sub(valid)) as usize;
    let nbytes = (bits / 8) as usize;
    let mut out = Vec::with_capacity(samples.len() * nbytes);
    for &s in samples {
        let v = ((s as f64) * max).round().clamp(-max - 1.0, max) as i32;
        let word = ((v as u32) << shift).to_le_bytes();
        out.extend_from_slice(&word[..nbytes]);
    }
    out
}
