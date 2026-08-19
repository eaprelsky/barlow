// Нативный аудио-слой barlow. Кампания порта движка из WebAudio (WebView2)
// в Rust: контракт — docs/DESIGN.md, сверка — golden-рендеры. Первый этап —
// труба вывода WASAPI exclusive (напрямую драйверу, без виндового микшера,
// ресемплинга и системного лимитера) с fallback в shared. Источник звука
// пока тест-тон; на его место встанет микс движка.

pub mod chain;
pub mod dsp;
pub mod master;
pub mod output;
pub mod patch;
pub mod render;
pub mod timing;
pub mod voices;
