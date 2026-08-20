// Смоук нативного стека: query_format → вывод WASAPI → play → рендер
// блоков. Watchdog убивает тест с указанием зависшей фазы и состояния
// движка (render_blocks/debug_phase) — зависание воспроизводится в
// консоли, а не на пользователе.

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use barlow_lib::audio::engine::LiveEngine;
use barlow_lib::audio::output;

#[test]
fn native_stack_smoke() {
    let phase = Arc::new(Mutex::new(String::new()));
    let ph = phase.clone();
    let watchdog_engine: Arc<Mutex<Option<Arc<LiveEngine>>>> = Arc::new(Mutex::new(None));
    let we = watchdog_engine.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(8));
        let p = ph.lock().unwrap().clone();
        let extra = we
            .lock()
            .unwrap()
            .as_ref()
            .map(|e| {
                format!(
                    " (render_blocks={}, phase={})",
                    e.render_blocks.load(Ordering::Relaxed),
                    e.debug_phase.load(Ordering::Relaxed)
                )
            })
            .unwrap_or_default();
        panic!("native stack завис на фазе: {p}{extra}");
    });

    macro_rules! stage {
        ($name:expr) => {
            *phase.lock().unwrap() = $name.to_string();
            eprintln!("фаза: {}", $name);
        };
    }

    stage!("query_format");
    let (rate, _ch) = output::query_format(None).expect("формат устройства");

    stage!("live_engine");
    let engine = LiveEngine::new(rate as f64);
    *watchdog_engine.lock().unwrap() = Some(engine.clone());

    stage!("wasapi_start");
    let handle = output::start(output::OutputConfig {
        device_id: None,
        exclusive: true,
        buffer_frames: 0,
        engine: Some(engine.clone()),
    })
    .expect("вывод поднялся");
    eprintln!(
        "вывод: {} Гц, exclusive={}",
        handle.info.rate, handle.info.exclusive
    );

    stage!("play");
    let patch_json = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/fixture-patch.json"),
    )
    .expect("фикс-патч");
    let patch: barlow_lib::audio::patch::Patch =
        serde_json::from_str(&patch_json).expect("разбор");
    engine.play(patch, None);

    stage!("realtime_2s");
    let t0 = Instant::now();
    let mut iter = 0;
    while t0.elapsed() < Duration::from_secs(2) {
        iter += 1;
        eprintln!(
            "тик {iter}, render_blocks={}, phase={}",
            engine.render_blocks.load(Ordering::Relaxed),
            engine.debug_phase.load(Ordering::Relaxed)
        );
        std::thread::sleep(Duration::from_millis(50));
        let _ = engine.snapshot();
        let _ = engine.levels();
    }
    eprintln!("цикл завершён, тиков {iter}");

    stage!("stop_engine");
    engine.stop();

    stage!("output_stop");
    handle.stop();

    stage!("done");
}

#[test]
fn engine_loop_without_wasapi() {
    // Изоляция движка: render_block вручную (без WASAPI-потока) +
    // параллельный «главный поток», дёргающий snapshot/levels.
    let patch_json = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/fixture-patch.json"),
    )
    .unwrap();
    let patch: barlow_lib::audio::patch::Patch = serde_json::from_str(&patch_json).unwrap();
    let engine = LiveEngine::new(48000.0);
    let we = engine.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        panic!(
            "engine_loop завис: render_blocks={}, phase={}, i={}",
            we.render_blocks.load(Ordering::Relaxed),
            we.debug_phase.load(Ordering::Relaxed),
            we.debug_i.load(Ordering::Relaxed)
        );
    });
    engine.play(patch, None);
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let st2 = stop.clone();
    let eng2 = engine.clone();
    let main_thread = std::thread::spawn(move || {
        let mut i = 0;
        while !st2.load(Ordering::Relaxed) {
            i += 1;
            if i % 20 == 0 {
                eprintln!("main-эму: тик {i}");
            }
            let _ = eng2.snapshot();
            let _ = eng2.levels();
            std::thread::sleep(Duration::from_millis(25));
        }
        i
    });
    let mut block = vec![0.0f32; 480 * 2];
    let t0 = Instant::now();
    let mut n: u64 = 0;
    while t0.elapsed() < Duration::from_secs(3) {
        engine.render_block(&mut block, 480, 2, n * 480);
        engine.advance_clock(480);
        n += 1;
        if n % 200 == 0 {
            eprintln!("audio-эму: блок {n}");
        }
    }
    stop.store(true, Ordering::Relaxed);
    let ticks = main_thread.join().unwrap();
    eprintln!("OK: блоков {n}, main-тиков {ticks}");
}

#[test]
fn reverb_tail_is_audible() {
    let mut rv = barlow_lib::audio::chain::Schroeder::new(2.5, 48000.0);
    // Импульс → хвост: RMS первых 50 мс после импульса заметно выше нуля
    rv.process(1.0);
    rv.process(0.0);
    let mut sum = 0.0f64;
    for _ in 0..2400 {
        let (l, r) = rv.process(0.0);
        sum += l * l + r * r;
    }
    let rms = (sum / 4800.0).sqrt();
    assert!(rms > 0.005, "хвост реверба тихий: {rms}");
}

#[test]
fn decode_user_mp3() {
    let dir = std::path::Path::new(
        r"C:\Users\eaprelsky\AppData\Roaming\ru.eaprelsky.barlow\samples",
    );
    let Ok(entries) = std::fs::read_dir(dir) else {
        eprintln!("библиотеки нет — пропускаю");
        return;
    };
    for e in entries.flatten() {
        if e.path().extension().map(|x| x == "mp3").unwrap_or(false) {
            let bytes = std::fs::read(e.path()).unwrap();
            match barlow_lib::audio::samples::decode_mp3(&bytes) {
                Some(sd) => {
                    eprintln!("mp3: {} сэмплов, {} Гц", sd.mono.len(), sd.rate);
                    assert!(!sd.mono.is_empty());
                }
                None => panic!("mp3 не декодировался: {:?}", e.path()),
            }
        }
    }
}

#[test]
fn user_patch_renders() {
    // Патч Егора из localStorage: соло на сэмпла-треке, 6 дорожек.
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../fixtures/user-patch.json");
    let Ok(json) = std::fs::read_to_string(path) else {
        eprintln!("user-patch.json нет — пропускаю");
        return;
    };
    let patch: barlow_lib::audio::patch::Patch = serde_json::from_str(&json).unwrap();
    eprintln!(
        "парс: сцен {} цепочка {} треков {}",
        patch.scenes.len(),
        patch.chain.len(),
        patch.tracks.len()
    );
    for t in &patch.tracks {
        eprintln!(
            "  {} rate={} паттернов={} нот={}",
            t.name,
            t.rate,
            t.patterns.len(),
            t.patterns.iter().map(|p| p.steps.iter().map(|s| s.notes.len()).sum::<usize>()).sum::<usize>()
        );
    }
    let engine = LiveEngine::new(48000.0);
    // Сэмпл колокола — из библиотеки
    let dir = r"C:\Users\eaprelsky\AppData\Roaming\ru.eaprelsky.barlow\samples";
    for t in &patch.tracks {
        if let Some(id) = &t.sample_id {
            let sha8: String = id.chars().take(8).collect();
            if let Ok(entries) = std::fs::read_dir(dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    let stem = name.split('.').next().unwrap_or("").to_string();
                    if stem.contains(&sha8) {
                        if let Ok(bytes) = std::fs::read(e.path()) {
                            if let Some(sd) = barlow_lib::audio::samples::decode_wav(&bytes)
                                .or_else(|| barlow_lib::audio::samples::decode_mp3(&bytes))
                            {
                                engine.put_sample(id.clone(), sd);
                                eprintln!("сэмпл {stem}: загружен");
                            } else {
                                eprintln!("сэмпл {stem}: НЕ декодировался");
                            }
                        }
                    }
                }
            }
        }
    }
    engine.play(patch, None);
    let mut block = vec![0.0f32; 480 * 2];
    let mut t: u64 = 0;
    let mut peak = 0.0f32;
    for sec in 0..5u64 {
        for _ in 0..(48000 / 480) {
            engine.render_block(&mut block, 480, 2, t);
            engine.advance_clock(480);
            t += 480;
            peak = peak.max(block.iter().fold(0.0f32, |a, v| a.max(v.abs())));
        }
        eprintln!(
            "сек {sec}: пик {peak:.4}, голосов {}, блоков {}, sched={:?}",
            engine.debug_voices.load(Ordering::Relaxed),
            engine.render_blocks.load(Ordering::Relaxed),
            [0,1,2,3].map(|i| engine.debug_sched[i].load(Ordering::Relaxed))
        );
    }
    assert!(peak > 0.01, "патч юзера молчит: пик {peak}");
}
