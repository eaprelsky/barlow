# Undo и правка патча

- Все правки патча идут через перехваченный setPatch в App (история:
  коалесценция 700 мс, 100 шагов). Прямой setPatchRaw — только
  undo/redo/import.
- Дискретные команды (notes-правки: клики/перенос/вставка/удаление;
  структура: треки/эскизы/сцены/цепочка/евклид/мутация/соло) — через
  `setPatchStep` (в App) / `onPatternCommand` (steps в TrackRow): каждый
  вызов = отдельный шаг истории. Слайдеры и колесо мыши остаются
  коалесцированными.
- Удаление трека — через свою модалку `confirmDialog` (`components/dialogs.ts`,
  хост `<DialogHost/>` в App); сцены/эскизы — без подтверждения (undo
  прикрывает). Сторонние эффекты (confirm и т.п.) НЕ звать внутри
  setPatch-updater'а: StrictMode в dev прогоняет апдейтеры дважды.
  window.alert/confirm не использовать — только alertDialog/confirmDialog.
