// Rust-golden: фикс-патч (fixtures/fixture-patch.json — общий с web-golden)
// → оффлайн-рендер → отпечаток RMS-блоков + пик → сверка с эталоном
// fixtures/golden.json. Пороги те же, что у scripts/golden.mjs:
// RMS-блок ≤ 0.002, пик ≤ 0.01, длина совпала.
//
//   cargo test --test golden_check          — сверка
//   BARLOW_GOLDEN_UPDATE=1 cargo test ...   — перезаписать эталон (осознанно!)
//
// Живёт тестом, а не отдельным бином: второй бин пакета ломал раскладку
// release-хардлинков (barlow.exe получал содержимое golden). Пути — от
// CARGO_MANIFEST_DIR, запуск из любого каталога стабилен.

use barlow_lib::audio::patch::Patch;
use barlow_lib::audio::render::render_patch;

struct Fingerprint {
    blocks: Vec<f64>,
    peak: f64,
    samples: usize,
}

fn fingerprint(chans: &[Vec<f32>]) -> Fingerprint {
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
    }
}

fn fixtures_path(name: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures").join(name)
}

#[test]
fn golden_matches_web_reference() {
    let update = std::env::var("BARLOW_GOLDEN_UPDATE").is_ok();
    let patch_json = std::fs::read_to_string(fixtures_path("fixture-patch.json"))
        .expect("прочитать фикс-патч");
    let patch: Patch = serde_json::from_str(&patch_json).expect("разобрать фикс-патч");

    let (l, r) = render_patch(&patch, 44100.0);
    let fp = fingerprint(&[l, r]);

    let golden_path = fixtures_path("golden.json");
    if update {
        let out = serde_json::json!({
            "blocks": fp.blocks,
            "peak": fp.peak,
            "samples": fp.samples,
            "rate": 44100,
        });
        std::fs::write(&golden_path, format!("{out}\n")).expect("записать эталон");
        eprintln!("эталон(rust) записан: {}", golden_path.display());
        return;
    }

    let ref_json = std::fs::read_to_string(&golden_path).expect("прочитать эталон");
    let reference: serde_json::Value = serde_json::from_str(&ref_json).expect("разобрать эталон");
    let ref_blocks: Vec<f64> = reference["blocks"]
        .as_array()
        .expect("blocks в эталоне")
        .iter()
        .map(|v| v.as_f64().unwrap_or(0.0))
        .collect();
    let ref_peak = reference["peak"].as_f64().unwrap_or(0.0);
    let ref_samples = reference["samples"].as_u64().unwrap_or(0) as usize;

    let mut worst = 0.0f64;
    let mut worst_i = 0usize;
    for (i, b) in ref_blocks.iter().enumerate() {
        if let Some(f) = fp.blocks.get(i) {
            let dd = (b - f).abs();
            if dd > worst {
                worst = dd;
                worst_i = i;
            }
        }
    }
    let peak_drift = (ref_peak - fp.peak).abs();
    let ok = worst <= 0.002 && peak_drift <= 0.01 && ref_samples == fp.samples;
    eprintln!(
        "golden(rust): {} — макс. дрейф RMS-блока {:.2e} (блок {}), пик {:.2e} (rust {}), сэмплов {}",
        if ok { "PASS" } else { "FAIL" },
        worst,
        worst_i,
        peak_drift,
        fp.peak,
        fp.samples
    );
    assert!(ok, "rust-рендер разошёлся с web-эталоном (см. отчёт выше)");
}
