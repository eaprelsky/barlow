export const instrumentFile = {
  "instrumentFile.instrumentSettingsAreMissing": {
    "ru": "Нет настроек инструмента",
    "en": "Instrument settings are missing"
  },
  "instrumentFile.theFileUsesUnknownSoundSettingsUpdate": {
    "ru": "Файл использует неизвестные настройки звука. Обнови barlow.",
    "en": "The file uses unknown sound settings. Update barlow."
  },
  "instrumentFile.invalidInstrumentParametersEffectsOrReferences": {
    "ru": "Некорректные параметры, эффекты или ссылки инструмента",
    "en": "Invalid instrument parameters, effects or references"
  },
  "instrumentFile.theNameMustContain1To160": {
    "ru": "Имя должно содержать от 1 до 160 символов",
    "en": "The name must contain 1 to 160 characters"
  },
  "instrumentFile.theDescriptionExceeds600Characters": {
    "ru": "Пояснение длиннее 600 символов",
    "en": "The description exceeds 600 characters"
  },
  "instrumentFile.tooManyTagsOrTagsAreToo": {
    "ru": "Слишком много или слишком длинные теги",
    "en": "Too many tags or tags are too long"
  },
  "instrumentFile.tooManySamplesInTheInstrument": {
    "ru": "Слишком много записей в инструменте",
    "en": "Too many samples in the instrument"
  },
  "instrumentFile.sampleWasNotFoundTheInstrumentWas": {
    "ru": "Не найдена запись {p0}: инструмент не сохранён",
    "en": "Sample {p0} was not found: the instrument was not saved"
  },
  "instrumentFile.theSampleExceeds64MiB": {
    "ru": "Запись больше 64 МиБ",
    "en": "The sample exceeds 64 MiB"
  },
  "instrumentFile.theSampleIsDamagedSHA256Mismatch": {
    "ru": "Запись повреждена: SHA-256 не совпадает",
    "en": "The sample is damaged: SHA-256 mismatch"
  },
  "instrumentFile.theUnpackedInstrumentExceeds256MiB": {
    "ru": "Инструмент больше 256 МиБ после распаковки",
    "en": "The unpacked instrument exceeds 256 MiB"
  },
  "instrumentFile.instrumentSettingsExceed8MiB": {
    "ru": "Настройки инструмента больше 8 МиБ",
    "en": "Instrument settings exceed 8 MiB"
  },
  "instrumentFile.theInstrumentExceeds256MiB": {
    "ru": "Инструмент больше 256 МиБ",
    "en": "The instrument exceeds 256 MiB"
  },
  "instrumentFile.theInstrumentFileExceeds128MiB": {
    "ru": "Файл инструмента больше 128 МиБ",
    "en": "The instrument file exceeds 128 MiB"
  },
  "instrumentFile.theArchiveExceeds128MiB": {
    "ru": "Архив больше 128 МиБ",
    "en": "The archive exceeds 128 MiB"
  },
  "instrumentFile.invalidArchivePathDuplicateEntryOrFile": {
    "ru": "Недопустимый путь, повтор или размер файла в архиве",
    "en": "Invalid archive path, duplicate entry or file size"
  },
  "instrumentFile.thisIsNotABarlowInstrumentFile": {
    "ru": "Это не файл инструмента barlow",
    "en": "This is not a barlow instrument file"
  },
  "instrumentFile.theInstrumentSettingsInTheFileAre": {
    "ru": "Настройки в файле инструмента повреждены",
    "en": "The instrument settings in the file are damaged"
  },
  "instrumentFile.unsupportedInstrumentVersionUpdateBarlow": {
    "ru": "Неподдерживаемая версия инструмента. Обнови barlow.",
    "en": "Unsupported instrument version. Update barlow."
  },
  "instrumentFile.invalidInstrumentName": {
    "ru": "Некорректное имя инструмента",
    "en": "Invalid instrument name"
  },
  "instrumentFile.invalidDescription": {
    "ru": "Некорректное пояснение",
    "en": "Invalid description"
  },
  "instrumentFile.invalidTags": {
    "ru": "Некорректные теги",
    "en": "Invalid tags"
  },
  "instrumentFile.invalidSampleList": {
    "ru": "Некорректный список записей",
    "en": "Invalid sample list"
  },
  "instrumentFile.duplicateOrUnexpectedSampleReference": {
    "ru": "Повтор или лишняя ссылка записи",
    "en": "Duplicate or unexpected sample reference"
  },
  "instrumentFile.invalidSampleMetadata": {
    "ru": "Некорректные метаданные записи",
    "en": "Invalid sample metadata"
  },
  "instrumentFile.aRequiredSampleIsMissingFromThe": {
    "ru": "В архиве отсутствует нужная запись",
    "en": "A required sample is missing from the archive"
  },
  "instrumentFile.sampleSHA256Mismatch": {
    "ru": "SHA-256 записи не совпадает",
    "en": "Sample SHA-256 mismatch"
  },
  "instrumentFile.theArchiveIsMissingRequiredSamplesOr": {
    "ru": "Архив содержит не все нужные записи или лишние файлы",
    "en": "The archive is missing required samples or contains unexpected files"
  },
  "instrumentFile.couldNotSaveTheInstrumentToMy": {
    "ru": "Не удалось сохранить инструмент в «Мои». {p0}{p1}",
    "en": "Could not save the instrument to My instruments. {p0}{p1}"
  },
  "instrumentFile.theSamplesAreAlreadyInTheLibrary": {
    "ru": "Записи уже доступны в библиотеке; повторный импорт переиспользует их. ",
    "en": "The samples are already in the library; importing again will reuse them. "
  }
} as const;
