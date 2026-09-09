export const engine = {
  "engine.invalidSampleSHA256Hash": {
    "ru": "Некорректный SHA-256 сэмпла.",
    "en": "Invalid sample SHA-256 hash."
  },
  "engine.sampleIsMissingFromTheLibrary": {
    "ru": "Нет записи «{p0}» в библиотеке",
    "en": "Sample “{p0}” is missing from the library"
  },
  "engine.theSampleFileExceeds64MiB": {
    "ru": "Файл сэмпла больше 64 МиБ.",
    "en": "The sample file exceeds 64 MiB."
  },
  "engine.scratch": {
    "ru": "Скрэтч: {p0}",
    "en": "Scratch: {p0}"
  },
  "engine.theProjectHasNotLoadedYet": {
    "ru": "патч ещё не загружен",
    "en": "The project has not loaded yet"
  },
  "engine.couldNotLoadTheSample": {
    "ru": "Сэмпл не загрузился: {p0}",
    "en": "Could not load the sample: {p0}"
  },
  "engine.noSampleIsAssignedToTheTrack": {
    "ru": "в слоте дорожки нет сэмпла",
    "en": "No sample is assigned to the track"
  },
  "engine.theAudioGraphIsNotReady": {
    "ru": "звуковой граф не поднят",
    "en": "The audio graph is not ready"
  },
  "engine.theSampleSelectionIsAlmostEmptyExpand": {
    "ru": "обрезка сэмпла почти пустая — расширь кусок в редакторе волны",
    "en": "The sample selection is almost empty — expand it in the waveform editor"
  },
  "engine.audioError": {
    "ru": "ошибка звука: {p0}",
    "en": "Audio error: {p0}"
  },
  "engine.theProjectIsNotLoaded": {
    "ru": "патч не загружен",
    "en": "The project is not loaded"
  },
  "engine.wavTheGestureMustNotExceed10": {
    "ru": "WAV: жест должен быть не длиннее 10 минут.",
    "en": "WAV: the gesture must not exceed 10 minutes."
  },
  "engine.noSampleIsAssigned": {
    "ru": "в слоте нет сэмпла",
    "en": "No sample is assigned"
  },
  "engine.samplePreview": {
    "ru": "Прослушивание сэмпла: {p0}",
    "en": "Sample preview: {p0}"
  },
  "engine.noSampleIsAssignedToTheTrack15": {
    "ru": "В слоте дорожки нет сэмпла — «▶ нота» молчит",
    "en": "No sample is assigned to the track — note preview is silent"
  },
  "engine.voiceBudgetExceededReduceUnisonOrThe": {
    "ru": "Превышен бюджет голосов. Уменьши унисон/число операторов или останови транспорт для прослушивания.",
    "en": "Voice budget exceeded. Reduce unison or the number of operators, or stop playback before previewing."
  },
  "engine.theNoteDidNotPlay": {
    "ru": "Нота не прозвучала: {p0}",
    "en": "The note did not play: {p0}"
  },
  "engine.wavPolyphonyLimitExceeded128Notes8": {
    "ru": "WAV: превышена полифония (128 нот / 8192 условных узла). Уменьши длину нот, унисон или плотность арпеджио.",
    "en": "WAV: polyphony limit exceeded (128 notes / 8,192 estimated nodes). Reduce note length, unison or arpeggio density."
  },
  "engine.wavInvalidSignalWhileRenderingTheTail": {
    "ru": "WAV: некорректный сигнал при рендере хвоста.",
    "en": "WAV: invalid signal while rendering the tail."
  },
  "engine.wavTheSoundDidNotDecayWithin": {
    "ru": "WAV: звук не успел затихнуть в расчётное время. Файл не обрезан и не сохранён. Уменьши feedback или выбери точную границу.",
    "en": "WAV: the sound did not decay within the estimated time. The file was neither truncated nor saved. Reduce feedback or choose an exact end."
  }
} as const;
