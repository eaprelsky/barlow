use std::path::{Path, PathBuf};

/// Only a leaf audio filename; both content hashes and legacy slug-hash names.
pub fn valid_name(name: &str) -> bool {
    if name.len() > 160 { return false; }
    let Some((stem, ext)) = name.rsplit_once('.') else { return false; };
    !stem.is_empty()
        && stem.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        && matches!(ext, "wav" | "mp3" | "m4a" | "ogg" | "flac" | "weba" | "bin")
        && !matches!(stem.to_ascii_uppercase().as_str(), "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9" | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9")
}

pub fn checked_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) { return Err("BARLOW_SAMPLE_PATH".into()); }
    let root = dir.canonicalize().map_err(|e| e.to_string())?;
    let target = root.join(name);
    match std::fs::symlink_metadata(&target) {
        Ok(meta) => {
            if meta.file_type().is_symlink() || !meta.is_file() {
                return Err("BARLOW_SAMPLE_REGULAR".into());
            }
            if !target.canonicalize().map_err(|e| e.to_string())?.starts_with(&root) {
                return Err("BARLOW_SAMPLE_OUTSIDE".into());
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_and_hash_filenames() {
        assert!(valid_name("kick-a45c781b.wav"));
        assert!(valid_name(&format!("{}.flac", "a".repeat(64))));
    }
    #[test]
    fn rejects_escape_and_device_paths() {
        for name in ["../secret.wav", "..\\secret.wav", "C:\\secret.wav", "/tmp/a.wav", "x.wav:stream", "CON.wav", "a..wav", "index.json", "a.wav\0"] {
            assert!(!valid_name(name), "accepted {name}");
        }
    }
}
