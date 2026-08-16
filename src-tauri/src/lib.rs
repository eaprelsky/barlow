use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

/// Папка библиотеки сэмплов: <appData>/samples (создаётся по требованию).
/// Контент — файлы <sha256>.<ext>, имена и даты — в samples/index.json.
fn samples_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("samples");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
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

/// Нативный «открыть проект»: диалог + чтение. None — отмена.
#[tauri::command]
fn open_project(app: AppHandle) -> Result<Option<(String, Vec<u8>)>, String> {
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
    Ok(Some((name, data)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            reveal_samples_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
