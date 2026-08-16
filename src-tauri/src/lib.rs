use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

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
        .invoke_handler(tauri::generate_handler![save_project, open_project])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
