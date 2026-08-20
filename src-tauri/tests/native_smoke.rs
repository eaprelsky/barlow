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
