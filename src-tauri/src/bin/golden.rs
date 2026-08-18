// Rust-golden: фикс-патч (fixtures/fixture-patch.json — общий с web-golden)
// → оффлайн-рендер → отпечаток RMS-блоков + пик → сверка с эталоном
// fixtures/golden.json. Пороги те же, что у scripts/golden.mjs:
// RMS-блок ≤ 0.002, пик ≤ 0.01, длина совпала.
//
//   cargo run --bin golden            — сверка
//   cargo run --bin golden -- --update — перезаписать эталон (осознанно!)
//
// Пока рендер — заглушка этапа 2 (тишина): сверка честно красная до порта
// синтеза (этапы 3–6 кампании). Длина и структура отпечатка уже финальные.

use std::path::{Path, PathBuf};

use barlow_lib::audio::patch::Patch;

struct Fingerprint {
    blocks: Vec<f64>,
    peak: f64,
    samples: usize,
    rate: u32,
}

/// Отпечаток стерео-рендера: RMS по 200 блокам первого канала + пик обоих.
fn fingerprint(chans: &[Vec<f32>], rate: u32) -> Fingerprint {
    const BLOCKS: usize = 200;
    let d = &chans[0];
    let size = d.len() / BLOCKS;
    let mut blocks = Vec::with_capacity(BLOCKS);
    for b in 0..BLOCKS {
        let mut sum = 0.0f64;
        for &v in &d[b * size..(b + 1) * size] {
            sum += (v as f64) * (v as f64);
        }
        let rms = (sum / size as f64).sqrt();
        blocks.push(format!("{rms:.6}").parse::<f64>().unwrap_or(rms));
    }
    let mut peak = 0.0f64;
    for ch in chans {
        for &v in ch {
            peak = peak.max(v.abs() as f64);
        }
    }
    Fingerprint {
        blocks,
        peak: format!("{peak:.6}").parse::<f64>().unwrap_or(peak),
        samples: d.len(),
        rate,
    }
}

/// Этап 2: рендер-заглушка — тишина нужной длины (по эталону, чтобы
/// сверка структуры уже работала). Этап 3+ заменит на настоящий синтез.
fn render_stub(samples: usize) -> Vec<Vec<f32>> {
    vec![vec![0.0; samples], vec![0.0; samples]]
}

fn find_upwards(name: &str) -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    for _ in 0..4 {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

fn main() {
    let update = std::env::args().any(|a| a == "--update");
    let patch_path = find_upwards("fixtures/fixture-patch.json")
        .expect("fixtures/fixture-patch.json не найден (запускай из репо или src-tauri)");
    let golden_path = Path::new(&patch_path)
        .parent()
        .unwrap()
        .join("golden.json");

    let patch_json = std::fs::read_to_string(&patch_path).expect("прочитать фикс-патч");
    let patch: Patch = serde_json::from_str(&patch_json).expect("разобрать фикс-патч");
    println!(
        "фикс-патч: {} трек(ов), bpm {}",
        patch.tracks.len(),
        patch.bpm
    );

    // Эталон задаёт длину рендера (web-golden рендерит 2 такта сцены s1).
    let ref_json = std::fs::read_to_string(&golden_path).expect("прочитать эталон");
    let reference: serde_json::Value = serde_json::from_str(&ref_json).expect("разобрать эталон");
    let samples = reference["samples"].as_u64().expect("samples в эталоне") as usize;
    let rate = reference["rate"].as_u64().unwrap_or(44100) as u32;

    let chans = render_stub(samples);
    let fp = fingerprint(&chans, rate);

    if update {
        let out = serde_json::json!({
            "blocks": fp.blocks,
            "peak": fp.peak,
            "samples": fp.samples,
            "rate": fp.rate,
        });
        std::fs::write(&golden_path, format!("{out}\n")).expect("записать эталон");
        println!("эталон записан: {} (заглушка этапа 2!)", golden_path.display());
        return;
    }

    let ref_blocks: Vec<f64> = reference["blocks"]
        .as_array()
        .expect("blocks в эталоне")
        .iter()
        .map(|v| v.as_f64().unwrap_or(0.0))
        .collect();
    let ref_peak = reference["peak"].as_f64().unwrap_or(0.0);
    let mut worst = 0.0f64;
    for (i, b) in ref_blocks.iter().enumerate() {
        if let Some(f) = fp.blocks.get(i) {
            worst = worst.max((b - f).abs());
        }
    }
    let peak_drift = (ref_peak - fp.peak).abs();
    let ok = worst <= 0.002 && peak_drift <= 0.01 && samples == fp.samples;
    println!(
        "golden(rust): {} — макс. дрейф RMS-блока {:.2e}, пик {:.2e}, сэмплов {} (рендер — заглушка этапа 2, зелёным станет на этапе 3+)",
        if ok { "PASS" } else { "FAIL" },
        worst,
        peak_drift,
        fp.samples
    );
    std::process::exit(if ok { 0 } else { 1 });
}
