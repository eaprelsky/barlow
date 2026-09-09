export const renderMemory = {
  "renderMemory.wavInvalidPCMFormat": {
    "ru": "WAV: некорректный формат PCM.",
    "en": "WAV: invalid PCM format."
  },
  "renderMemory.wavInvalidMemoryEstimate": {
    "ru": "WAV: некорректная оценка памяти.",
    "en": "WAV: invalid memory estimate."
  },
  "renderMemory.wavEstimatedWorkingBuffersExceedThe512": {
    "ru": "WAV: расчётные рабочие буферы превышают бюджет 512 МиБ. Сократи длину, хвосты эффектов или объём сэмплов; экспортируй частями.",
    "en": "WAV: estimated working buffers exceed the 512 MiB budget. Reduce duration, effect tails or sample size, or export in parts."
  },
  "renderMemory.theWAVMemoryReservationHasAlreadyBeen": {
    "ru": "Резервация WAV уже освобождена.",
    "en": "The WAV memory reservation has already been released."
  }
} as const;
