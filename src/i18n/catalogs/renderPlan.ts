export const renderPlan = {
  "renderPlan.wavDurationMustBeBetweenOneBar": {
    "ru": "WAV: длина должна быть от одного такта до 10 минут. Сократи цепочку для экспорта.",
    "en": "WAV: duration must be between one bar and 10 minutes. Shorten the export chain."
  },
  "renderPlan.wavTheChainContainsMoreThan512": {
    "ru": "WAV: больше 512 партий в цепочке. Экспортируй её частями.",
    "en": "WAV: the chain contains more than 512 clip instances. Export it in parts."
  },
  "renderPlan.wavInvalidStepDuration": {
    "ru": "WAV: недопустимая длительность шага.",
    "en": "WAV: invalid step duration."
  },
  "renderPlan.wavMoreThan200000StepsReduce": {
    "ru": "WAV: больше 200 000 шагов. Уменьши плотность или длину цепочки.",
    "en": "WAV: more than 200,000 steps. Reduce the density or chain length."
  },
  "renderPlan.wavSynthesisBudgetExceeded20000Events": {
    "ru": "WAV: превышен бюджет синтеза (20 000 событий / 100 000 условных узлов). Сократи унисон, арпеджио или цепочку.",
    "en": "WAV: synthesis budget exceeded (20,000 events / 100,000 estimated nodes). Reduce unison, arpeggiation or chain length."
  },
  "renderPlan.wavSynthesisBudgetExceeded100000Estimated": {
    "ru": "WAV: превышен бюджет синтеза (100 000 условных узлов). Сократи унисон, арпеджио или цепочку.",
    "en": "WAV: synthesis budget exceeded (100,000 estimated nodes). Reduce unison, arpeggiation or chain length."
  },
  "renderPlan.wavTheEstimatedTailExceeds120Seconds": {
    "ru": "WAV: расчётный хвост больше 120 секунд. Уменьши длину нот, время задержки или обратную связь эха либо выбери точную границу.",
    "en": "WAV: the estimated tail exceeds 120 seconds. Reduce note length, delay time or feedback, or choose an exact end."
  }
} as const;
