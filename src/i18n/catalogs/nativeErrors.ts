export const nativeErrors = {
  "native.RAW_SAMPLE_REQUIRED": {
    "ru": "Ожидается бинарный пакет сэмпла",
    "en": "A binary sample packet is required."
  },
  "native.RAW_FILE_REQUIRED": {
    "ru": "Ожидается бинарный пакет файла",
    "en": "A binary file packet is required."
  },
  "native.INDEX_TOO_LARGE": {
    "ru": "Индекс библиотеки больше 4 МиБ",
    "en": "The library index exceeds 4 MiB."
  },
  "native.INDEX_ARRAY_REQUIRED": {
    "ru": "Индекс должен быть массивом",
    "en": "The library index must be an array."
  },
  "native.INDEX_PATH_INVALID": {
    "ru": "Недопустимый путь в индексе сэмплов",
    "en": "Invalid path in the sample index."
  },
  "native.PACKET_INVALID": {
    "ru": "Некорректный бинарный пакет или превышен лимит файла",
    "en": "Invalid binary packet or file size limit exceeded."
  },
  "native.PACKET_LENGTH": {
    "ru": "Некорректная длина бинарного пакета",
    "en": "Invalid binary packet length."
  },
  "native.FILENAME_UTF8": {
    "ru": "Имя файла должно быть UTF-8",
    "en": "The filename must use UTF-8."
  },
  "native.FILENAME_INVALID": {
    "ru": "Недопустимое имя файла",
    "en": "Invalid filename."
  },
  "native.FILE_LIMIT": {
    "ru": "Недопустимое имя или превышен лимит файла",
    "en": "Invalid filename or file size limit exceeded."
  },
  "native.READ_LIMIT": {
    "ru": "Файл превышает лимит чтения",
    "en": "The file exceeds the read limit."
  },
  "native.DESTINATION_MISSING": {
    "ru": "Нет папки назначения",
    "en": "No destination folder."
  },
  "native.SAMPLE_PATH": {
    "ru": "Недопустимое имя сэмпла",
    "en": "Invalid sample filename."
  },
  "native.SAMPLE_REGULAR": {
    "ru": "Сэмпл должен быть обычным файлом",
    "en": "The sample must be a regular file."
  },
  "native.SAMPLE_OUTSIDE": {
    "ru": "Файл находится вне библиотеки сэмплов",
    "en": "The file is outside the sample library."
  }
} as const;
