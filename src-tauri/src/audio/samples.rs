// Сэмплы для нативного движка: декод WAV (hound) и ресемплинг к частоте
// вывода. Формат библиотеки: файлы <sha>.<ext> в папке сэмплов; патч
// хранит SHA-256 id. MP3/OGG/FLAC — потом (symphonia); WAV покрывает
// рендеры и большинство библиотечных звуков.

use hound::{SampleFormat, WavReader};

pub struct SampleData {
    /// Моно-микс (стерео усредняется; нативные голоса моно-канальные).
    pub mono: Vec<f32>,
    pub rate: u32,
}

pub fn decode_wav(bytes: &[u8]) -> Option<SampleData> {
    let cursor = std::io::Cursor::new(bytes.to_vec());
    let reader = WavReader::new(cursor).ok()?;
    let spec = reader.spec();
    if spec.channels == 0 {
        return None;
    }
    let sum: Vec<f32> = match spec.sample_format {
        SampleFormat::Float => reader
            .into_samples::<f32>()
            .map(|s| s.unwrap_or(0.0))
            .collect(),
        SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .into_samples::<i32>()
                .map(|s| s.map(|v| v as f32 / max).unwrap_or(0.0))
                .collect()
        }
    };
    let mono = sum.chunks(spec.channels as usize).map(|ch| {
        ch.iter().sum::<f32>() / ch.len() as f32
    }).collect();
    Some(SampleData { mono, rate: spec.sample_rate })
}

/// Линейный ресемплинг к частоте вывода (idempotent при совпадении).
pub fn resample(sd: &SampleData, target: f64) -> Vec<f32> {
    if sd.rate as f64 == target || sd.mono.is_empty() {
        return sd.mono.clone();
    }
    let ratio = sd.rate as f64 / target;
    let len = (sd.mono.len() as f64 / ratio).ceil() as usize;
    let mut out = Vec::with_capacity(len);
    let mut pos = 0.0f64;
    while pos < sd.mono.len() as f64 - 1.0 && out.len() < len {
        let i = pos.floor() as usize;
        let frac = (pos - i as f64) as f32;
        out.push(sd.mono[i] + (sd.mono[i + 1] - sd.mono[i]) * frac);
        pos += ratio;
    }
    out
}

/// Имя файла сэмпла в библиотеке по id (SHA-256) — как slug-имена в
/// library.ts: <sha>.<ext>; точное имя ищет вызывающий по каталогу.
pub fn matches_id(file_name: &str, id: &str) -> bool {
    file_name.starts_with(id)
}
