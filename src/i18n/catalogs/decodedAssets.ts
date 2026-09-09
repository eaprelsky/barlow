export const decodedAssets = {
  "decodedAssets.theSampleLoadingQueueIsFullWait": {
    "ru": "Очередь загрузки сэмплов заполнена. Дождись завершения текущей загрузки.",
    "en": "The sample loading queue is full. Wait for the current load to finish."
  },
  "decodedAssets.theDecodedSampleExceedsMiBOrContains": {
    "ru": "Декодированный сэмпл больше {p0} МиБ или содержит некорректные данные. Сократи запись перед импортом.",
    "en": "The decoded sample exceeds {p0} MiB or contains invalid data. Shorten it before importing."
  },
  "decodedAssets.samplesInThisProjectOrExportExceed": {
    "ru": "Сэмплы текущего проекта/экспорта превышают бюджет {p0} МиБ PCM. Сократи записи или убери неиспользуемые сэмпловые инструменты.",
    "en": "Samples in this project or export exceed the {p0} MiB PCM budget. Shorten recordings or remove unused sample instruments."
  }
} as const;
