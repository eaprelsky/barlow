// Публично для бина golden (и будущих CLI-рендеров): модель патча и тайминг.
pub mod audio;

use std::sync::Mutex;
use tauri::AppHandle;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

fn default_true() -> bool {
    true
}

/// Настройки приложения: <appData>/settings.json.
#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(default)]
struct Settings {
    samples_dir: Option<String>,
    /// Вывод: WASAPI id устройства (None — по умолчанию), exclusive-режим
    /// (напрямую драйверу), желаемый период в фреймах (0 — авто).
    audio_device: Option<String>,
    #[serde(default = "default_true")]
    audio_exclusive: bool,
    #[serde(default)]
    audio_buffer: u32,
}

#[derive(serde::Serialize)]
struct AudioSettings {
    device: Option<String>,
    exclusive: bool,
    buffer: u32,
}

/// Живой поток вывода (этап 1 кампании: WASAPI exclusive/shared, тест-тон).
struct AudioState {
    output: Mutex<Option<audio::output::OutputHandle>>,
}

/// Нативный live-движок (этап 9-10): создаётся при запуске вывода.
struct NativeState {
    engine: Mutex<Option<std::sync::Arc<audio::engine::LiveEngine>>>,
}

#[derive(serde::Serialize, Clone)]
struct NativeClock {
    playing: bool,
    now: f64,
    scene_id: String,
    chain_pos: usize,
    clocks: std::collections::HashMap<String, audio::timing::TrackClock>,
}

/// Загрузить сэмплы патча в нативный движок (WAV из папки библиотеки,
/// ресемплинг к частоте вывода). Возвращает число загруженных.
fn load_samples_into_engine(app: &AppHandle, engine: &std::sync::Arc<audio::engine::LiveEngine>, patch: &serde_json::Value) -> usize {
    let sr = engine.sr;
    let dir = match samples_dir(app) {
        Ok(d) => d,
        Err(_) => return 0,
    };
    let mut loaded = 0;
    if let Some(tracks) = patch["tracks"].as_array() {
        for t in tracks {
            let Some(id) = t["sampleId"].as_str() else { continue };
            let mut found = false;
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    if name.starts_with(id) {
                        if let Ok(bytes) = std::fs::read(e.path()) {
                            if let Some(sd) = audio::samples::decode_wav(&bytes) {
                                let mono = audio::samples::resample(&sd, sr);
                                engine.put_sample(id.to_string(), audio::samples::SampleData { mono, rate: sr as u32 });
                                loaded += 1;
                            }
                        }
                        found = true;
                        break;
                    }
                }
            }
            let _ = found;
        }
    }
    loaded
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_settings(app: &AppHandle, st: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(st).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Папка библиотеки сэмплов: настраиваемая (settings.json) или дефолтная
/// <appData>/samples (создаётся по требованию). Контент — файлы
/// <sha256>.<ext>, имена и даты — в samples/index.json.
fn samples_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = match read_settings(app).samples_dir {
        Some(p) => std::path::PathBuf::from(p),
        None => app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("samples"),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Перенос файлов библиотеки в другую папку (rename, между дисками — copy).
fn move_library(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let target = to.join(entry.file_name());
        if std::fs::rename(entry.path(), &target).is_err() {
            std::fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
            std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Сменить папку библиотеки: нативный диалог. Если в выбранной папке уже
/// есть своя библиотека (index.json) — подхватываем её как есть; иначе
/// переносим текущие сэмплы. None — отмена.
#[tauri::command]
fn samples_dir_pick(app: AppHandle) -> Result<Option<String>, String> {
    let Some(folder) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let new_dir = folder.into_path().map_err(|e| e.to_string())?;
    if !new_dir.join("index.json").is_file() {
        let old = samples_dir(&app)?;
        if old != new_dir && old.join("index.json").is_file() {
            move_library(&old, &new_dir)?;
        }
    }
    std::fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;
    let path = new_dir.to_string_lossy().into_owned();
    let mut st = read_settings(&app);
    st.samples_dir = Some(path.clone());
    write_settings(&app, &st)?;
    Ok(Some(path))
}

#[tauri::command]
fn samples_dir_path(app: AppHandle) -> Result<String, String> {
    Ok(samples_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn sample_write(app: AppHandle, name: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(samples_dir(&app)?.join(name), &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn sample_read(app: AppHandle, name: String) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(samples_dir(&app)?.join(name)) {
        Ok(d) => Ok(Some(d)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn sample_delete(app: AppHandle, name: String) -> Result<(), String> {
    match std::fs::remove_file(samples_dir(&app)?.join(name)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn sample_index_read(app: AppHandle) -> Result<Option<String>, String> {
    match std::fs::read_to_string(samples_dir(&app)?.join("index.json")) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn sample_index_write(app: AppHandle, json: String) -> Result<(), String> {
    std::fs::write(samples_dir(&app)?.join("index.json"), json).map_err(|e| e.to_string())
}

/// Открыть папку библиотеки в системном файловом менеджере.
#[tauri::command]
fn reveal_samples_dir(app: AppHandle) -> Result<(), String> {
    let dir = samples_dir(&app)?;
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "linux")]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(&dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Нативный «сохранить как»: диалог + запись файла. None — пользователь отменил.
#[tauri::command]
fn save_project(app: AppHandle, name: String, data: Vec<u8>) -> Result<Option<String>, String> {
    let Some(file) = app.dialog().file().set_file_name(&name).blocking_save_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Открытый файл: структура (кортеж сериализовался бы в JSON-массив,
/// а фронт ждёт объект с полями).
#[derive(serde::Serialize)]
struct OpenedFile {
    name: String,
    data: Vec<u8>,
}/// Нативный «открыть проект»: диалог + чтение. None — отмена.
#[tauri::command]
fn open_project(app: AppHandle) -> Result<Option<OpenedFile>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("barlow: проект и патч", &["zip", "json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "project".into());
    Ok(Some(OpenedFile { name, data }))
}

// ---- Нативный вывод (этап 1: WASAPI exclusive/shared + тест-тон) ----

/// Активные рендер-устройства; дефолт первым.
#[tauri::command]
fn audio_devices() -> Result<Vec<audio::output::DeviceInfo>, String> {
    audio::output::list_devices()
}

/// Сохранённые настройки вывода.
#[tauri::command]
fn audio_settings(app: AppHandle) -> AudioSettings {
    let st = read_settings(&app);
    AudioSettings {
        device: st.audio_device,
        exclusive: st.audio_exclusive,
        buffer: st.audio_buffer,
    }
}

/// Запустить вывод (предыдущий поток останавливается) и запомнить выбор.
/// Создаёт нативный live-движок на частоте устройства; часы идут наружу
/// событием audio-clock (~30 Гц).
#[tauri::command]
fn audio_output_start(
    app: AppHandle,
    device: Option<String>,
    exclusive: bool,
    buffer_frames: u32,
) -> Result<audio::output::OutputInfo, String> {
    {
        let mut st = read_settings(&app);
        st.audio_device = device.clone();
        st.audio_exclusive = exclusive;
        st.audio_buffer = buffer_frames;
        write_settings(&app, &st)?;
    }
    let native: tauri::State<NativeState> = app.state();
    {
        let mut guard = native.engine.lock().map_err(|e| e.to_string())?;
        if let Some(old) = guard.take() {
            old.stop();
        }
    }
    let audio_state: tauri::State<AudioState> = app.state();
    let mut guard = audio_state.output.lock().map_err(|e| e.to_string())?;
    if let Some(old) = guard.take() {
        old.stop();
    }
    // Формат устройства — лёгким запросом (без открытия вывода): probe-старт
    // конкурировал бы за устройство с финальным запуском.
    let (rate, _channels) = audio::output::query_format(device.clone())?;
    let engine = audio::engine::LiveEngine::new(rate as f64);
    {
        let app2 = app.clone();
        engine.set_clock_callback(Box::new(move |now, scene, pos, playing| {
            let _ = app2.emit(
                "audio-clock",
                NativeClock {
                    playing,
                    now,
                    scene_id: scene.to_string(),
                    chain_pos: pos,
                    clocks: Default::default(),
                },
            );
        }));
    }
    *native.engine.lock().map_err(|e| e.to_string())? = Some(engine.clone());
    let handle = audio::output::start(audio::output::OutputConfig {
        device_id: device,
        exclusive,
        buffer_frames,
        engine: Some(engine),
    })?;
    let info = handle.info.clone();
    *guard = Some(handle);
    Ok(info)
}

#[tauri::command]
fn audio_output_stop(app: AppHandle) -> Result<(), String> {
    let state: tauri::State<AudioState> = app.state();
    let mut guard = state.output.lock().map_err(|e| e.to_string())?;
    if let Some(old) = guard.take() {
        old.stop();
    }
    Ok(())
}

#[tauri::command]
fn audio_test_tone(app: AppHandle, on: bool) -> Result<(), String> {
    let state: tauri::State<AudioState> = app.state();
    let guard = state.output.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(h) => {
            h.set_tone(on);
            Ok(())
        }
        None => Err("вывод не запущен".into()),
    }
}

#[tauri::command]
fn audio_output_status(app: AppHandle) -> Result<Option<audio::output::OutputInfo>, String> {
    let state: tauri::State<AudioState> = app.state();
    let guard = state.output.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|h| h.info.clone()))
}

// ---- Нативный live-движок (этап 9-10) ----

#[tauri::command]
fn audio_play(app: AppHandle, patch_json: String, scene_id: Option<String>) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    let Some(engine) = guard.as_ref() else {
        return Err("вывод не запущен".into());
    };
    let patch: audio::patch::Patch =
        serde_json::from_str(&patch_json).map_err(|e| e.to_string())?;
    load_samples_into_engine(&app, engine, &serde_json::to_value(&patch).unwrap_or_default());
    engine.play(patch, scene_id);
    Ok(())
}

#[tauri::command]
fn audio_engine_stop(app: AppHandle) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = guard.as_ref() {
        engine.stop();
    }
    Ok(())
}

#[tauri::command]
fn audio_set_patch(app: AppHandle, patch_json: String) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    let Some(engine) = guard.as_ref() else {
        return Ok(());
    };
    let patch: audio::patch::Patch =
        serde_json::from_str(&patch_json).map_err(|e| e.to_string())?;
    engine.set_patch(patch);
    Ok(())
}

#[tauri::command]
fn audio_set_scene(app: AppHandle, id: String) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = guard.as_ref() {
        engine.set_scene(id);
    }
    Ok(())
}

#[tauri::command]
fn audio_set_follow(app: AppHandle, on: bool) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = guard.as_ref() {
        engine.set_follow_chain(on);
    }
    Ok(())
}

#[tauri::command]
fn audio_set_bpm(app: AppHandle, bpm: f64) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = guard.as_ref() {
        engine.set_bpm(bpm);
    }
    Ok(())
}

#[tauri::command]
fn audio_state(app: AppHandle) -> Result<NativeClock, String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    let Some(engine) = guard.as_ref() else {
        return Ok(NativeClock {
            playing: false,
            now: 0.0,
            scene_id: String::new(),
            chain_pos: 0,
            clocks: Default::default(),
        });
    };
    let (playing, now, scene_id, chain_pos, clocks) = engine.snapshot();
    Ok(NativeClock { playing, now, scene_id, chain_pos, clocks })
}

#[tauri::command]
fn audio_track_levels(app: AppHandle) -> Result<std::collections::HashMap<String, f32>, String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|e| e.levels()).unwrap_or_default())
}

#[tauri::command]
fn audio_scratch_begin(app: AppHandle, sample_id: Option<String>) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = guard.as_ref() {
        engine.scratch_begin(sample_id);
    }
    Ok(())
}

#[tauri::command]
fn audio_scratch_move(app: AppHandle, pos: f64) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = guard.as_ref() {
        engine.scratch_move(pos);
    }
    Ok(())
}

#[tauri::command]
fn audio_scratch_end(app: AppHandle) -> Result<(), String> {
    let native: tauri::State<NativeState> = app.state();
    let guard = native.engine.lock().map_err(|e| e.to_string())?;
    if let Some(engine) = guard.as_ref() {
        engine.scratch_end();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AudioState {
            output: Mutex::new(None),
        })
        .manage(NativeState {
            engine: Mutex::new(None),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_project,
            open_project,
            samples_dir_path,
            sample_write,
            sample_read,
            sample_delete,
            sample_index_read,
            sample_index_write,
            samples_dir_pick,
            reveal_samples_dir,
            audio_devices,
            audio_settings,
            audio_play,
            audio_engine_stop,
            audio_set_patch,
            audio_set_scene,
            audio_set_follow,
            audio_set_bpm,
            audio_state,
            audio_track_levels,
            audio_scratch_begin,
            audio_scratch_move,
            audio_scratch_end,
            audio_output_start,
            audio_output_stop,
            audio_test_tone,
            audio_output_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
