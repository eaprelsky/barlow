// Versioned raw IPC frame: BRL1 + u32 LE UTF-8 name length + name + bytes.
// Empty response means a cancelled picker / missing sample; an empty file
// still has a complete frame. This module has no Tauri or audio dependency.
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
pub const SAMPLE_LIMIT: usize = 64 * 1024 * 1024;
pub const PROJECT_LIMIT: usize = 128 * 1024 * 1024;
pub const SAVE_LIMIT: usize = 256 * 1024 * 1024;
const NAME_LIMIT: usize = 1024;
static SERIAL: AtomicU64 = AtomicU64::new(0);

pub fn unpack(bytes: &[u8], limit: usize) -> Result<(&str, &[u8]), String> {
    if bytes.len() < 8 || &bytes[..4] != b"BRL1" || bytes.len() > limit + NAME_LIMIT + 8 {
        return Err("BARLOW_PACKET_INVALID".into());
    }
    let len = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    if len == 0 || len > NAME_LIMIT || bytes.len() < 8 + len || bytes.len() - 8 - len > limit {
        return Err("BARLOW_PACKET_LENGTH".into());
    }
    let name = std::str::from_utf8(&bytes[8..8 + len]).map_err(|_| "BARLOW_FILENAME_UTF8")?;
    if name.contains('\0') { return Err("BARLOW_FILENAME_INVALID".into()); }
    Ok((name, &bytes[8 + len..]))
}
pub fn pack(name: &str, data: Vec<u8>, limit: usize) -> Result<Vec<u8>, String> {
    if name.is_empty() || name.len() > NAME_LIMIT || name.contains('\0') || data.len() > limit {
        return Err("BARLOW_FILE_LIMIT".into());
    }
    let mut out = Vec::with_capacity(8 + name.len() + data.len());
    out.extend_from_slice(b"BRL1"); out.extend_from_slice(&(name.len() as u32).to_le_bytes());
    out.extend_from_slice(name.as_bytes()); out.extend_from_slice(&data);
    Ok(out)
}
pub fn read_limited(path: &Path, limit: usize) -> std::io::Result<Vec<u8>> {
    let file = std::fs::File::open(path)?;
    if file.metadata()?.len() > limit as u64 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "BARLOW_READ_LIMIT"));
    }
    let mut data = Vec::new();
    // The file can grow after metadata: the reader also has a hard bound.
    file.take(limit as u64 + 1).read_to_end(&mut data)?;
    if data.len() > limit { return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "BARLOW_READ_LIMIT")); }
    Ok(data)
}
pub fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "BARLOW_DESTINATION_MISSING"))?;
    let tmp = parent.join(format!(".barlow-{}-{}.tmp", std::process::id(), SERIAL.fetch_add(1, Ordering::Relaxed)));
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&tmp)?;
    let result = (|| {
        file.write_all(data)?; file.sync_all()?; drop(file);
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() { let _ = std::fs::remove_file(&tmp); }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn binary_unicode_and_empty_file() {
        assert_eq!(pack("a", vec![0,255], 2).unwrap(), vec![66,82,76,49,1,0,0,0,97,0,255]);
        let encoded = pack("пьеса — IDM.wav", vec![0, 1, 128, 255], 4).unwrap();
        assert_eq!(unpack(&encoded, 4).unwrap(), ("пьеса — IDM.wav", &[0,1,128,255][..]));
        assert_eq!(unpack(&pack("empty.wav", vec![], 0).unwrap(), 0).unwrap().1.len(), 0);
    }
    #[test]
    fn reject_bad_headers_lengths_utf8_and_payloads() {
        for value in [vec![], b"BRL0xxxx".to_vec(), b"BRL1\xff\xff\xff\xff".to_vec(), b"BRL1\x01\0\0\0\xff".to_vec(), b"BRL1\x01\0\0\0\0".to_vec()] {
            assert!(unpack(&value, 10).is_err());
        }
        let encoded=pack("a", vec![1,2,3], 3).unwrap(); assert!(unpack(&encoded, 2).is_err());
        assert!(pack(&"x".repeat(1025), vec![], 1).is_err());
        assert!(pack("a", vec![0;4], 3).is_err());
    }
    #[test]
    fn bounded_read_and_atomic_replace() {
        let dir=std::env::temp_dir().join(format!("barlow-io-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();let path=dir.join("output.wav");
        write_atomic(&path,b"original").unwrap();assert!(read_limited(&path,3).is_err());
        assert_eq!(read_limited(&path,8).unwrap(), b"original");
        write_atomic(&path,b"new").unwrap();assert_eq!(read_limited(&path,8).unwrap(), b"new");
        let target_dir=dir.join("directory");std::fs::create_dir_all(&target_dir).unwrap();
        assert!(write_atomic(&target_dir,b"bad").is_err());assert!(target_dir.is_dir());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(),2);
        std::fs::remove_file(path).unwrap();std::fs::remove_dir(target_dir).unwrap();std::fs::remove_dir(dir).unwrap();
    }
}
