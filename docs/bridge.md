# Дебаг-мост (ИИ-агент ↔ приложение)

MCP-интерфейс для агента: живое управление патчем и прослушивание.

- MCP-сервер `scripts/mcp-barlow.mjs` (подключён в `.zcode/config.json`,
  локально, в gitignore) поднимает WebSocket-хост `127.0.0.1:22756`
  («barlow» на телефоне; порт — `BARLOW_BRIDGE_PORT`). Приложение
  (`src/bridge.ts`, интеграция в App) коннектится само и тихо
  переподключается: нет хоста — нет моста. Клиентов держим одного —
  последняя вкладка выигрывает.
- Поток: приложение шлёт hello/patch/transport/notes (ноты — `noteSink`
  движка, только live-планировщик, оффлайн-рендер молчит; частоты хост
  считает по патчу сам). Команды с ack: `set_patch` (замена, как импорт
  файла), `set_param` (JSON-указатель RFC 6901), `transport`
  (play/stop/scene/bpm).
- Все агентские правки идут через перехваченный setPatch/setPatchStep —
  undo-история общая с ручными. Путь `set_param` валидируется на копии
  патча ДО setPatch: исключение в апдейтере уронило бы рендер уже после
  положительного ack (грабли, пойманы smoke-bridge).
- Тулзы MCP: `analyze_patch`/`probe_sound` (по JSON-файлу; probe — таблица
  «время → частоты + RMS» оффлайн-рендера) и `live_*` (status/patch/
  set_param/set_patch/transport/notes); `probe_sound {live:true}` рендерит
  текущий патч моста.
- Смоук: `npm run smoke-bridge` — мост+vite+headless-браузер, проверяет
  круг (hello, set_param → localStorage, отказ битого пути, play → события
  нот, stop). Порт смоука свой (22856), приложению подсовывается через
  `window.__BARLOW_BRIDGE_PORT`.
