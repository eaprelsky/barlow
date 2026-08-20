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

/// Декод MP3 через symphonia → моно-микс (частота — из файла).
pub fn decode_mp3(bytes: &[u8]) -> Option<SampleData> {
    use symphonia::core::audio::{AudioBufferRef, Signal};
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let mss = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(bytes.to_vec())),
        Default::default(),
    );
    let mut probed = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .ok()?;
    let track = probed.format.tracks().first()?.clone();
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .ok()?;
    let rate = track.codec_params.sample_rate.unwrap_or(44100);
    let mut mono: Vec<f32> = Vec::new();
    loop {
        let packet = match probed.format.next_packet() {
            Ok(p) => p,
            Err(_) => break,
        };
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => break,
        };
        let spec = *decoded.spec();
        let n = decoded.frames();
        let ch_count = spec.channels.count();
        let buf: AudioBufferRef = decoded.into();
        let mut f32buf = buf.make_equivalent::<f32>();
        buf.convert(&mut f32buf);
        for i in 0..n {
            let v: f32 = (0..ch_count)
                .map(|c| f32buf.chan(c)[i])
                .sum::<f32>()
                / ch_count.max(1) as f32;
            mono.push(v);
        }
    }
    if mono.is_empty() {
        return None;
    }
    Some(SampleData { mono, rate })
}

