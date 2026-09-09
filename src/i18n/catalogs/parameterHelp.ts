export const parameterHelp = {
  "parameterHelp.ringModulationMixMultiplyTheSourceBy": {
    "ru": "Доля кольцевой модуляции: перемножения исходного звука и дополнительной волны. Ноль оставляет исходник. Добавляй понемногу для металлических колокольчиков и индустриальной перкуссии.",
    "en": "Ring modulation mix: multiply the source by another waveform. Zero keeps the original. Add a little for metallic chimes and industrial percussion."
  },
  "parameterHelp.frequencyOfTheExtraWaveformRelativeTo": {
    "ru": "Частота дополнительной волны относительно сыгранной ноты. Целые отношения дают более связанный с нотой звон, дробные — необычные металлические призвуки. Слышно при ненулевой доле ring.",
    "en": "Frequency of the extra waveform relative to the played note. Integer ratios tend to sound more pitch-related; fractional ratios can give unusual metallic tones. Requires a nonzero ring mix."
  },
  "parameterHelp.wavefoldingAmountPeaksFoldInwardCreatingNew": {
    "ru": "Сила перегиба волны: её вершины складываются внутрь, создавая новые гармоники. Ноль выключает обработку. Повышай для шероховатого баса и резких лидов.",
    "en": "Wavefolding amount: peaks fold inward, creating new harmonics. Zero disables processing. Increase for rough basses and sharp leads."
  },
  "parameterHelp.combFilterMixVeryShortRepeatsEmphasize": {
    "ru": "Доля гребенчатого фильтра: очень коротких повторов, подчёркивающих ряд частот. Ноль выключает его. Подмешивай для пружинного или струнного оттенка.",
    "en": "Comb filter mix: very short repeats emphasize a series of frequencies. Zero disables it. Blend in for springy or string-like color."
  },
  "parameterHelp.combFilterFrequencyControlsTheSpacingOf": {
    "ru": "Частота резонанса гребенчатого фильтра. Определяет расстояние между подчёркнутыми областями спектра. Подбирай на слух под высоту или намеренно создавай несозвучный звон.",
    "en": "Comb filter frequency controls the spacing of emphasized spectral regions. Tune it to the note or deliberately create a dissonant ring."
  },
  "parameterHelp.amountFedBackIntoTheShortComb": {
    "ru": "Сколько звука возвращается в короткую петлю comb. Чем больше, тем дольше и заметнее звон. Для чёткой перкуссии уменьши, для резонансного хвоста увеличь.",
    "en": "Amount fed back into the short comb loop. More feedback makes the ring longer and stronger. Reduce for crisp percussion or raise for a resonant tail."
  },
  "parameterHelp.timeToGlideToTheNextSingle": {
    "ru": "Время плавного скольжения к высоте следующей одиночной ноты. Ноль выключает. Требует режима, в котором новая нота прерывает предыдущую; подходит для скользящего баса.",
    "en": "Time to glide to the next single note’s pitch. Zero disables glide. Requires new notes to cut off previous voices; useful for sliding bass lines."
  },
  "parameterHelp.balanceOfDryAndProcessedSoundZero": {
    "ru": "Баланс исходного и обработанного звука: ноль оставляет исходник, максимум — только эффект. Подмешивай постепенно, чтобы сохранить чёткость атаки.",
    "en": "Balance of dry and processed sound: zero keeps the original, maximum gives only the effect. Blend gradually to preserve the attack."
  },
  "parameterHelp.timeBeforeTheEchoRepeatsShortValues": {
    "ru": "Пауза до повторения эха. Короткая даёт уплотнение или дребезг, длинная — отдельные ответы. Подстрой под ритм или смести для ломаной пульсации.",
    "en": "Time before the echo repeats. Short values thicken or rattle; longer values produce separate replies. Match the rhythm or offset it for irregular pulsation."
  },
  "parameterHelp.fractionOfTheEchoFedBackFor": {
    "ru": "Доля эха, возвращаемая на новый повтор. Больше — длиннее цепочка повторов. Уменьши, если эхо забивает следующую фразу.",
    "en": "Fraction of the echo fed back for another repeat. Higher values extend the tail. Reduce if echoes obscure the next phrase."
  },
  "parameterHelp.tempoInBeatsPerMinuteSpeedsUp": {
    "ru": "Темп в ударах в минуту. Ускоряет или замедляет всю пьесу, сохраняя отношения независимых ритмов. Можно менять во время воспроизведения.",
    "en": "Tempo in beats per minute. Speeds up or slows down the project while preserving relationships between independent rhythms. Can be changed during playback."
  },
  "parameterHelp.finalProjectLevelAfterTheTracksAre": {
    "ru": "Итоговая громкость всей пьесы. Меняет уровень после сведения дорожек. Уменьши, если общий звук слишком громкий; баланс дорожек настрой в микшере.",
    "en": "Final project level after the tracks are mixed. Lower it if the output is too loud; balance individual tracks in the mixer."
  },
  "parameterHelp.trackLevelAcrossAllScenesUseIt": {
    "ru": "Громкость дорожки во всех сценах. Используй для общего баланса инструментов, например чтобы бас не перекрывал ударные.",
    "en": "Track level across all scenes. Use it to balance instruments, for example to keep bass from masking drums."
  },
  "parameterHelp.trackPositionBetweenTheLeftAndRight": {
    "ru": "Положение дорожки между левым и правым каналами. Центр оставляет звук посередине. Разведи дополнительные щелчки по сторонам, оставив бас и бочку в центре.",
    "en": "Track position between the left and right channels. Center keeps it in the middle. Spread additional clicks to the sides while leaving bass and kick centered."
  },
  "parameterHelp.trackTuningSRootFrequencyInHertz": {
    "ru": "Базовая частота строя дорожки в герцах. Ступени строя рассчитываются относительно неё. Меняй для транспозиции всей партии без ограничения двенадцатью полутонами.",
    "en": "Track tuning’s root frequency in hertz. All pitch ratios are calculated from it. Transpose the part without restricting it to twelve semitones."
  },
  "parameterHelp.trackCycleOffsetInStepsRelativeTo": {
    "ru": "Сдвиг позиции дорожки в шагах относительно общего начала. Позволяет сместить рисунок, не переставляя ноты вручную. Отрицательные и положительные значения дают разные совмещения акцентов.",
    "en": "Track cycle offset in steps relative to the shared start. Shift the pattern without moving notes. Positive and negative offsets change how accents line up."
  },
  "parameterHelp.durationOfNewlyDrawnNotesInThis": {
    "ru": "Длина новых нот при рисовании, измеренная в шагах этой партии. Уже написанные ноты сохраняют свою длину. Увеличь для тянущихся звуков, уменьши для коротких.",
    "en": "Duration of newly drawn notes, in this clip’s steps. Existing notes keep their lengths. Raise it for sustained sounds or lower it for short notes."
  },
  "parameterHelp.clipLevelMultipliedByTheTrackS": {
    "ru": "Уровень текущей партии поверх общей громкости дорожки. Позволяет сделать одну сцену тише, сохранив общий баланс остальных сцен.",
    "en": "Clip level multiplied by the track’s shared level. Lower one clip without changing other clips. Scenes that share this same clip also share its level."
  },
  "parameterHelp.durationOfOneClipStepRelativeTo": {
    "ru": "Длительность одного шага партии относительно общего времени. Дробные отношения позволяют ритмам двигаться с разной скоростью. Попробуй разные значения на двух дорожках для полиритмии.",
    "en": "Duration of one clip step relative to the shared clock. Fractional ratios let rhythms move at different rates. Try different values on two tracks."
  },
  "parameterHelp.numberOfStepsBeforeThePatternRepeats": {
    "ru": "Количество шагов до повторения рисунка. Разная длина циклов меняет сочетания ударов со временем: например, 7 шагов против 16.",
    "en": "Number of steps before the pattern repeats. Different cycle lengths change how hits combine over time, for example 7 against 16."
  },
  "parameterHelp.fadeInTimeForThePartAnd": {
    "ru": "Время плавного появления партии вместе с её эффектами в начале сцены. Увеличь для мягкого входа фонового слоя.",
    "en": "Fade-in time for the part and its track effects at scene start. Raise it for a soft pad entrance."
  },
  "parameterHelp.fadeOutTimeForThePartAnd": {
    "ru": "Время затухания партии и её локальных эффектов перед границей сцены. Следующая сцена начинает свою цепочку; общий реверб может сохранить хвост.",
    "en": "Fade-out time for the part and its track effects before the scene boundary. The next scene starts its own chain; shared reverb can keep its tail."
  },
  "parameterHelp.timeForAmplitudeToRiseFromSilence": {
    "ru": "Время появления звука от тишины до полной громкости. Короткая атака даёт чёткий удар; длинная — мягкое нарастание. Если нота короче атаки, движок сокращает её.",
    "en": "Time for amplitude to rise from silence to its peak. Short attack gives a sharp onset; long attack fades in. The engine shortens it if the note is shorter than the attack."
  },
  "parameterHelp.decayDurationForTheSimpleEnvelopeWhen": {
    "ru": "Длительность спада обычной огибающей, когда нота не имеет своей явной длины. Короткий спад разделяет удары, длинный оставляет протяжный хвост.",
    "en": "Decay duration for the simple envelope when the note has no explicit length. Short decay separates hits; long decay leaves a sustained tail."
  },
  "parameterHelp.proportionOfTimeAfterAttackHeldAt": {
    "ru": "Доля времени после атаки, в течение которой амплитуда держится на пике перед спадом. Это время удержания, не уровень sustain огибающей ADSR. Ноль даёт спад сразу после атаки.",
    "en": "Proportion of time after attack held at peak amplitude before decay. This is hold duration, not an ADSR sustain level. Zero starts decay immediately after attack."
  },
  "parameterHelp.startingPitchAsAMultipleOfThe": {
    "ru": "Во сколько раз выше начинается нота перед падением к основной высоте. Один выключает падение. Это создаёт характерный удар бочки или лазерный звук.",
    "en": "Starting pitch as a multiple of the target note frequency. One disables the drop. Creates a kick-like impact or a laser sound."
  },
  "parameterHelp.timeToFallFromTheRaisedStarting": {
    "ru": "Время падения от начальной повышенной частоты к высоте ноты. Попробуй 0,05–0,12 секунды для бочки, больше — для заметного звукового скольжения.",
    "en": "Time to fall from the raised starting pitch to the note frequency. Try 0.05–0.12 s for a kick, or longer for an audible slide."
  },
  "parameterHelp.lowerCutoffFrequenciesBelowItAreAttenuated": {
    "ru": "Нижняя граница пропускаемых частот. Всё ниже приглушается. Подними её, чтобы убрать гул у фона и освободить место для баса.",
    "en": "Lower cutoff: frequencies below it are attenuated. Raise it to remove pad rumble and make room for bass."
  },
  "parameterHelp.upperCutoffLowerValuesSoundDarkerAnd": {
    "ru": "Верхняя граница пропускаемых частот. Ниже — мягче и темнее, выше — ярче. Движение этой ручки открывает и закрывает тембр.",
    "en": "Upper cutoff: lower values sound darker and softer; higher values are brighter. Moving it opens and closes the sound."
  },
  "parameterHelp.emphasisNearTheLowPassCutoffLow": {
    "ru": "Подчёркивание частот около верхней границы фильтра. Малое значение звучит мягко, большое добавляет характерный свист. Увеличивай постепенно.",
    "en": "Emphasis near the low-pass cutoff. Low values are gentle; high values add a whistle-like peak. Increase gradually."
  },
  "parameterHelp.initialCutoffOffsetFromItsBaseValue": {
    "ru": "Отклонение частоты среза в начале ноты от её базового значения, в полутонах. Знак задаёт направление. Ноль отключает огибающую; ненулевой размах меняет яркость атаки.",
    "en": "Initial cutoff offset from its base value, in semitones. The sign sets direction. Zero disables the envelope; nonzero amounts shape attack brightness."
  },
  "parameterHelp.timeForCutoffToReturnToIts": {
    "ru": "Время возвращения частоты среза к базовому значению после атаки. Короткое время даёт отрывистый акцент, длинное — плавное изменение яркости.",
    "en": "Time for cutoff to return to its base value after attack. Short times give a clipped accent; longer times make brightness evolve smoothly."
  },
  "parameterHelp.pitchOscillationsPerSecondSlowerRatesSound": {
    "ru": "Количество покачиваний высоты в секунду. Медленные дают певучее движение, быстрые — нервную дрожь. Слышно при ненулевой глубине вибрато.",
    "en": "Pitch oscillations per second. Slower rates sound flowing; faster rates flutter. Requires nonzero vibrato depth."
  },
  "parameterHelp.pitchOscillationDepthInCents100Cents": {
    "ru": "Размах колебаний высоты в центах: 100 центов — полутон. Ноль выключает вибрато. Начни с небольшой глубины, чтобы оживить тянущуюся ноту.",
    "en": "Pitch oscillation depth in cents: 100 cents is an equal-tempered semitone. Zero disables vibrato. Start with a small depth to animate a held note."
  },
  "parameterHelp.timeForVibratoDepthToFadeIn": {
    "ru": "Время плавного нарастания глубины вибрато от нуля. Атака остаётся почти ровной, затем колебания становятся заметнее. Это не пауза перед включением вибрато.",
    "en": "Time for vibrato depth to fade in from zero. The attack stays nearly steady, then pitch movement becomes more pronounced. This is not a delay before vibrato starts."
  },
  "parameterHelp.numberOfNearlyIdenticalVoicesPlayingTogether": {
    "ru": "Количество почти одинаковых копий голоса, звучащих вместе. Один — без унисона; несколько создают плотность и биения. Больше голосов требует больше обработки.",
    "en": "Number of nearly identical voices playing together. One is a single voice; several create density and beating. More voices require more processing."
  },
  "parameterHelp.pitchSpreadBetweenUnisonCopiesInCents": {
    "ru": "Расхождение высоты копий унисона в центах. Малое оживляет звук, большое размывает строй. Слышно при нескольких голосах унисона.",
    "en": "Pitch spread between unison copies, in cents. A little adds movement; more blurs the tuning. Requires multiple unison voices."
  },
  "parameterHelp.stereoDistributionOfUnisonVoicesZeroCenters": {
    "ru": "Разведение голосов унисона по стереополю. Ноль собирает их в центре. Увеличь для широкого пэда; нужен унисон из нескольких голосов.",
    "en": "Stereo distribution of unison voices. Zero centers them. Raise for a wide pad; requires more than one unison voice."
  },
  "parameterHelp.fundamentalFrequencyOfTheOriginalSamplePitched": {
    "ru": "Частота ноты в исходной записи сэмпла. В тональном режиме сэмплер использует её, чтобы правильно играть другие высоты. Укажи реальную частоту записи, иначе мелодия будет транспонирована неверно.",
    "en": "Fundamental frequency of the original sample. Pitched playback uses it to calculate other note frequencies. Enter the recording’s actual pitch or transposition will be incorrect."
  },
  "parameterHelp.crossfadeBetweenTheSampleLoopSEnd": {
    "ru": "Длина плавного соединения конца и начала петли сэмпла. Помогает убрать щелчок на стыке; слишком длинное соединение может размыть ритмическую атаку.",
    "en": "Crossfade between the sample loop’s end and start. Reduces clicks at the join; very long crossfades can blur rhythmic attacks."
  },
  "parameterHelp.startOfTheSampleRegionInSeconds": {
    "ru": "Начало воспроизводимого участка записи в секундах. Сдвигай, чтобы убрать тишину перед атакой или выбрать другой фрагмент.",
    "en": "Start of the sample region, in seconds. Move it to skip silence before an attack or choose another part of the recording."
  },
  "parameterHelp.endOfTheSampleRegionInSeconds": {
    "ru": "Конец воспроизводимого участка записи в секундах. Вместе с началом выделяет нужный звук из длинной записи.",
    "en": "End of the sample region, in seconds. Together with start, selects a sound from a longer recording."
  },
  "parameterHelp.durationOfOneGrainAShortFragment": {
    "ru": "Длина отдельного зерна — короткого кусочка записи. Малые зёрна дают шершавую текстуру, длинные сохраняют больше характера исходника.",
    "en": "Duration of one grain, a short fragment of the recording. Short grains make rough textures; long grains preserve more of the source’s character."
  },
  "parameterHelp.grainsEmittedPerNoteMoreMakesThe": {
    "ru": "Количество зёрен в одной ноте. Больше делает облако плотнее и требует больше обработки. Небольшое число подходит для редких мерцающих текстур.",
    "en": "Grains emitted per note. More makes the cloud denser and costs more processing. Low counts suit sparse shimmering textures."
  },
  "parameterHelp.centerPositionOfTheGrainCloudWithin": {
    "ru": "Положение центра облака внутри выбранного участка сэмпла. Двигай, чтобы извлекать разную окраску из одной записи.",
    "en": "Center position of the grain cloud within the selected sample region. Move it to extract different colors from one recording."
  },
  "parameterHelp.howFarGrainsSpreadAroundTheCloud": {
    "ru": "Насколько далеко зёрна разбрасываются вокруг центра облака. Ноль повторяет один участок; увеличение даёт более изменчивую текстуру.",
    "en": "How far grains spread around the cloud’s center. Zero repeats one region; larger values create a more varied texture."
  },
  "parameterHelp.adjustByEarDoubleClickAKnob": {
    "ru": "Меняй значение на слух. Двойной щелчок по ручке или Enter открывает точный ввод; в числовом поле можно сразу печатать.",
    "en": "Adjust by ear. Double-click a knob or press Enter for exact numeric input; type directly in a numeric field."
  }
} as const;
