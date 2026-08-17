# AGENTS.md — barlow

Инструмент алгоритмической музыки Егора (IDM, полиритмия, ИИ-узлы). Рабочее
название — barlow (Кларенс Барлоу), переименование возможно.

## Общение
- На «ты».

## Публикация
- Веб: `npm run deploy-web` — сборка + заливка на barlow.eaprelsky.ru
  (nocturna, nginx статика /var/www/barlow; серт Let's Encrypt, renew
  как у соседей). rsync на винтовой машине нет — tar-пайпом по ssh.
- Десктоп: `npm run desktop` — автозакрытие окна, tauri build, обновление
  установленной копии в %LOCALAPPDATA%/barlow и запуск.

## Команды
- `npm run dev` — dev-сервер (Vite), `npm run build` — прод-сборка + tsc.
- `npm run golden` — сверка синтеза с эталоном (fixtures/golden.json):
  фикс-патч → оффлайн-рендер → отпечаток RMS-блоков. Любое изменение
  звука = обновить эталон осознанно (`npm run golden -- --update`).
  Эталон детерминирован (осцилляторы/фильтры/delay/LFO) — шум, реверб,
  вероятность и сэмплы в фикс-патч не включать. Браузер — Edge,
  переопределяется BARLOW_BROWSER.
- Линтер — Oxlint (в конфиге Vite-шаблона).
- Десктоп: `npx tauri build` (exe + msi + nsis в `src-tauri/target/release`),
  быстрый прогон — `cargo check` в `src-tauri`. Rust-тулчейн ставится rustup;
  если сеть до static.rust-lang.org рвётся — прокси `HTTPS_PROXY` (локальный).
- Платформенные ветвления — только в `src/platform.ts` (isDesktop,
  saveBlob, pickProjectFile → invoke Rust-команд save_project/open_project
  в `src-tauri/src/lib.rs`, нативные диалоги через tauri-plugin-dialog).

## Принципы проекта
1. Патч = сериализуемый JSON (`src/types.ts`). UI, движок, ИИ-агент работают
   с одной моделью. Любая фича начинается с типов.
2. Формула тайминга едина: `stepIndexAt` в `src/audio/timing.ts` — движок
   и playhead в UI считают позицию одинаково. Портируется в Rust один в один.
3. Никакой привязки к 12 полутонам и тактовой сетке: частоты в Гц,
   независимые циклы треков, дробные rate.
4. Слои заменяемы: Web Audio сейчас → Rust-движок потом, без смены формата
   патча. Контракт движка — `AudioBackend` (`src/audio/backend.ts`); синтез —
   единая точка `triggerVoice` (`src/audio/voices.ts`), цепочки/мастер —
   `src/audio/fx.ts`, планировщик — `src/audio/engine.ts`. Сверка
   реализаций (в т.ч. с будущим Rust) — golden-рендеры, `npm run golden`.

## Роадмап
Готово: секвенсор, арранжмент, модуляции, эффекты, сэмплер, ИИ-генерация
(ElevenLabs, `src/ai/providers.ts` — провайдер-агностик). Дальше: fal.ai
вторым провайдером → агент MCP → Tauri/ASIO (ключи уйдут с клиента) →
Launchpad MK3 / VST. Архитектурные решения — docs/DESIGN.md.

## ИИ и ключи
- Ключ ElevenLabs в localStorage `barlow.ai.v1` (личный локальный инструмент).
- При публикации/Tauri ключи — за нативным слоем, не в браузере.

## Undo/редактирование
- Все правки патча идут через перехваченный setPatch в App (история:
  коалесценция 700 мс, 100 шагов). Прямой setPatchRaw — только undo/redo/import.
- Дискретные команды (notes-правки: клики/перенос/вставка/удаление; структура:
  треки/эскизы/сцены/цепочка/евклид/мутация/соло) — через `setPatchStep`
  (в App) / `onPatternCommand` (steps в TrackRow): каждый вызов = отдельный
  шаг истории. Слайдеры и колесо мыши остаются коалесцированными.
- Удаление трека — через свою модалку `confirmDialog` (`components/dialogs.ts`,
  хост `<DialogHost/>` в App); сцены/эскизы — без подтверждения (undo прикрывает).
  Сторонние эффекты (confirm и т.п.) НЕ звать внутри setPatch-updater'а:
  StrictMode в dev прогоняет апдейтеры дважды. window.alert/confirm не
  использовать — только alertDialog/confirmDialog.

## Грабли
- Темп меняется на ходу: `AudioBackend.setBpm` пере-якорит часы треков
  (дробная позиция сохраняется) — App зовёт его до setPatch, чтобы движок
  успел посчитать пропорцию по старому bpm.
- localStorage ключ `barlow.patch.v5` — при смене схемы патча поднимай версию
  и обновляй `normalizePatch` (v2 mul и v3 note переводятся в v4 автоматически).
- Высоты шага — индексы в track.scale (notes[]), несколько = аккорд. Частоты — `stepFreqs`.
- Колесо над нотным станом — нативный слушатель `passive: false` в TrackRow:
  React `onWheel` пассивный, `preventDefault` в нём не работает.
- TrackRow мемоизирован: колбэки из App должны быть стабильными (useCallback),
  иначе перерисовка всех треков каждый кадр playhead.
- Тестировать звук руками (Play в браузере); автотестов на аудио нет.
- Оффлайн-рендер WAV и live используют один `triggerVoice` — любое изменение
  синтеза должно проходить через него, иначе рендер разойдётся с live.
- Модель арранжмента: паттерн (эскиз) → сцена (slots: trackId→patternId) →
  цепочка (порядок сцен). Длина цикла — в паттерне, не в треке; шаг
  (rate) — на треке, но паттерн может переопределить (`pattern.rate`, как
  volume/pan/mods).
- Глушение, три уровня: `track.enabled=false` — мастер-выключатель (микшер,
  все сцены); `pattern.muted` — мьют партии; `scene.soloTrackId` —
  эксклюзивное соло сцены, живёт на сцене, НЕ на эскизе (v17).
- Копипаст нот: буфер `music/clip.ts` + `clip.activeTrackId` (стан, работавший
  последним, ловит Ctrl+C/V/D/Delete). Мультиселект — UI-состояние TrackRow.
- Горячие клавиши букв — по `event.code` (физическая клавиша), не `e.key`:
  на русской раскладке Ctrl+C даёт e.key «с», а code — всегда 'KeyC'.
- Смена набора модуляций пересобирает цепочку трека (modSig в engine).
- Сэмплы: контент — в IndexedDB (веб) или файлах (десктоп: Rust-команды
  sample_* в src-tauri); патч хранит SHA-256 id. Папка десктоп-библиотеки
  настраивается («сменить…» в панели сэмплов): путь в <appData>/settings.json,
  дефолт — <appData>/samples; при смене файлы переезжают, новая папка с
  готовым index.json подхватывается как есть. Ветвление — внутри
  `audio/library.ts` (isDesktop).
