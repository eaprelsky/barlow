export const audioStatus = {
  "audioStatus.128Notes8192EstimatedVoiceNodes8192": {
    "ru": "{p0}: {p1}/128 нот, {p2}/8192 условных узлов голосов, {p3}/8192 событий. ",
    "en": "{p0}: {p1}/128 notes, {p2}/8192 estimated voice nodes, {p3}/8192 events. "
  },
  "audioStatus.effects192Chains8192EstimatedNodes96": {
    "ru": "Эффекты: {p0}/192 цепочек, {p1}/8192 условных узлов, {p2}/96 МиБ буферов (оценка). ",
    "en": "Effects: {p0}/192 chains, {p1}/8192 estimated nodes, {p2}/96 MiB of buffers (estimate). "
  },
  "audioStatus.sampleCache256MiBPCMSamplesPending": {
    "ru": "Кэш сэмплов: {p0}/256 МиБ PCM, {p1} записей, ожидают загрузки: {p2}. ",
    "en": "Sample cache: {p0}/256 MiB PCM, {p1} samples, pending loads: {p2}. "
  },
  "audioStatus.preparationMsJSSchedulerMaximumMsPasses": {
    "ru": "Подготовка: {p0} мс. Планировщик JS: максимум {p1} мс, проходов дольше 25 мс: {p2}. Это не измерение CPU аудиопотока.",
    "en": "Preparation: {p0} ms. JS scheduler: maximum {p1} ms, passes over 25 ms: {p2}. This is not audio-thread CPU usage."
  },
  "audioStatus.notPlaying": {
    "ru": " Не звучат: {p0}.",
    "en": " Not playing: {p0}."
  },
  "audioStatus.activeNotes": {
    "ru": "Активные ноты",
    "en": "Active notes"
  },
  "audioStatus.overloadSkipped": {
    "ru": " · перегрузка: пропущено {p0}",
    "en": " · overload: {p0} skipped"
  },
  "audioStatus.late": {
    "ru": " · опоздало {p0}",
    "en": " · late: {p0}"
  },
  "audioStatus.fxBudgetTracksBlocked": {
    "ru": " · бюджет FX: не звучат {p0} тр.",
    "en": " · FX budget: {p0} tracks blocked"
  }
} as const;
