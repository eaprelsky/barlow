export const explanations = {
  "explanations.soundWorkshop": {
    "ru": "Мастерская звука",
    "en": "Sound workshop"
  },
  "explanations.turnARecordingIntoAPortableInstrument": {
    "ru": "Преврати запись в переносимый инструмент: открой аудио, выдели фрагмент и сохрани сэмплер. Проект в редакторе не меняется.",
    "en": "Turn a recording into a portable instrument: open audio, select a region and save a sampler. The editor’s project stays unchanged."
  },
  "explanations.advancedActionsAreSeparateSourceSeparationAnd": {
    "ru": "Расширенные действия раскрываются отдельно: разделение источников и приближённая модель. Сэмплер сохраняет запись, модель — синтетические кадры и огибающую. Закрытие отменяет текущую обработку и освобождает загруженные записи; перед выходом сохрани нужный результат.",
    "en": "Advanced actions are separate: source separation and approximate modeling. A sampler keeps the recording; a model stores synthesized frames and an envelope. Closing cancels processing and releases loaded audio, so save the result you want first."
  },
  "explanations.selectARegion": {
    "ru": "Выделение фрагмента",
    "en": "Select a region"
  },
  "explanations.dragAcrossTheWaveformOrEnterExact": {
    "ru": "Потяни по волне от начала к концу или введи точные секунды. Для обработки нужен фрагмент 0,03–30 секунд.",
    "en": "Drag across the waveform or enter exact times. Processing requires a region of 0.03–30 seconds."
  },
  "explanations.openRecordingsUpTo32MiBAnd": {
    "ru": "Можно открыть запись до 32 МиБ и 10 минут. Для сэмплера на краях добавляется затухание 3 мс против щелчков. Выделенная область, а не вся запись, уходит на разделение. Для модели лучше отдельная устойчивая нота без соседних инструментов.",
    "en": "Open recordings up to 32 MiB and 10 minutes. Sampler regions get 3 ms edge fades to reduce clicks. Source separation sends only the selected region. For modeling, use a steady isolated note without other instruments."
  },
  "explanations.regionRootFrequency": {
    "ru": "Основная частота фрагмента",
    "en": "Region root frequency"
  },
  "explanations.theOriginalNoteSPitchInHertz": {
    "ru": "Высота исходной ноты в герцах. От неё сэмплер рассчитывает транспонирование, а анализатор — положения гармоник.",
    "en": "The original note’s pitch in hertz. The sampler uses it for transposition; the analyzer uses it to locate harmonics."
  },
  "explanations.detectEstimatesAStablePeriodNearThe": {
    "ru": "«Определить» оценивает устойчивый период в центре фрагмента. Аккорд, шум, удар или скольжение могут дать ошибку, в том числе на октаву. Проверь на слух и поправь число; это не распознавание всех нот записи.",
    "en": "Detect estimates a stable period near the region’s center. Chords, noise, transients or glides can cause errors, including octave errors. Check by ear and correct the value. This does not recognize every note in a recording."
  },
  "explanations.sourceSeparation": {
    "ru": "Разделение источников",
    "en": "Source separation"
  },
  "explanations.demucsThroughFalAiSeparatesVocalsDrums": {
    "ru": "Demucs через fal.ai выделяет вокал, ударные, бас и остальное. Он не гарантирует отдельную дорожку каждого синтезатора; возможны примеси и артефакты.",
    "en": "Demucs through fal.ai separates vocals, drums, bass and other audio. It does not guarantee a separate stem for each synthesizer, and leakage or artifacts are possible."
  },
  "explanations.thisActionSendsTheSelectedRegionTo": {
    "ru": "Кнопка отправляет только выбранный фрагмент во внешний платный сервис с твоим ключом. Обычный сэмплер и моделирование работают локально. Отмена прекращает ожидание и запрашивает отмену очереди; уже запущенная обработка сервиса может завершиться и тарифицироваться. Готовые дорожки выбираются кнопками. Внешний готовый stem можно открыть как обычное аудио.",
    "en": "This action sends the selected region to a paid external service using your key. Sampling and modeling run locally. Cancel stops waiting and requests queue cancellation; a running service job may still finish and be charged. Choose returned stems with the buttons. You can also open an externally prepared stem as ordinary audio."
  },
  "explanations.approximateSoundModel": {
    "ru": "Приближённая модель тембра",
    "en": "Approximate sound model"
  },
  "explanations.buildEightHarmonicFramesAndAnAmplitude": {
    "ru": "Из одной ноты строятся восемь гармонических кадров и амплитудная огибающая. Получается редактируемый синтезатор, а не точная копия исходного оборудования.",
    "en": "Build eight harmonic frames and an amplitude envelope from one note. The result is an editable synthesizer, not an exact copy of the original equipment."
  },
  "explanations.setTheRootFrequencyAndCompareThe": {
    "ru": "Задай основную частоту и сравни фрагмент с моделью на умеренной громкости. Фазы, шум, пространственные эффекты и полифония не восстанавливаются. Длинная огибающая ограничена 16 секундами. Если важна точность исходной записи, сохрани сэмплер. Восприятие громкости автоматически не выравнивается.",
    "en": "Set the root frequency and compare the region with the model at a moderate level. Phase, noise, spatial effects and polyphony are not reconstructed. Envelope duration is limited to 16 seconds. Save a sampler if preserving the recording matters most. Perceived loudness is not matched automatically."
  },
  "explanations.learningStudio": {
    "ru": "Учебная студия",
    "en": "Learning studio"
  },
  "explanations.twoPathsACompleteIDMMiniatureWith": {
    "ru": "Два маршрута: законченная IDM-миниатюра с драматургией и лаборатория звукового дизайна. Выбирай урок, пробуй в обычном редакторе и возвращайся сюда через «Справку».",
    "en": "Two paths: a complete IDM miniature with musical development, and a sound-design lab. Choose a lesson, experiment in the normal editor, then return here through Help."
  },
  "explanations.startingALearningCopyFirstStoresYour": {
    "ru": "Новая учебная копия сначала откладывает текущий проект локально. «Вернуться к проекту» сохраняет учебную работу отдельно; «Продолжить копию» открывает её снова. Перед новой копией сохрани нужный предыдущий опыт через возврат. Отметки уроков — твоя самооценка, проверка элементов не оценивает музыку.",
    "en": "Starting a learning copy first stores your current project locally. Return to project saves the lesson work separately; resume copy reopens it. Return and save your experiment before starting another copy. Lesson checkmarks are self-assessments; interface checks do not judge the music."
  },
  "explanations.beforeAndAfterComparison": {
    "ru": "Сравнение до и после",
    "en": "Before-and-after comparison"
  },
  "explanations.rememberACapturesTheCurrentPatchIn": {
    "ru": "«Запомнить A» фиксирует текущий патч в открытой учебной студии. После изменений «Сравнить с A» временно возвращает его, «Вернуть B» восстанавливает вариант.",
    "en": "Remember A captures the current patch in the open learning studio. After editing, compare with A temporarily recalls it; return to B restores your variation."
  },
  "explanations.switchingStopsPlaybackListenToBothVersions": {
    "ru": "Переключение останавливает воспроизведение; слушай обе версии с одинаковым мастером. Автоматического выравнивания воспринимаемой громкости нет. Снимки A/B сохраняются на время сеанса приложения; нужный вариант сохраняй как проект.",
    "en": "Switching stops playback. Listen to both versions with the same master setting; perceived loudness is not matched automatically. A/B snapshots last for the app session. Save any version you want to keep as a project."
  },
  "explanations.importAWavetable": {
    "ru": "Импорт таблицы волн",
    "en": "Import a wavetable"
  },
  "explanations.theWAVMustContainConsecutiveCyclesOf": {
    "ru": "WAV должен содержать последовательные циклы одинаковой длины. Укажи число отсчётов в исходном цикле по описанию пака. Обычная запись мелодии для такого импорта не подходит.",
    "en": "The WAV must contain consecutive cycles of equal length. Set the samples per source cycle from the pack’s documentation. An ordinary melody recording is not suitable for this import."
  },
  "explanations.select28EvenlySpacedFramesFrom": {
    "ru": "Из файла равномерно выбираются 2–8 кадров. Каждый преобразуется в 128 отсчётов: постоянная составляющая и гармоники выше 63-й удаляются, амплитуда нормируется общим множителем. Стерео складывается в моно. Перед применением видны размеры и форма. Метаданные производителя автоматически не определяются.",
    "en": "Select 2–8 evenly spaced frames from the file. Each becomes 128 samples: DC and harmonics above the 63rd are removed, and a shared amplitude normalization factor is applied. Stereo is summed to mono. Preview dimensions and shapes before applying. Manufacturer metadata is not detected automatically."
  },
  "explanations.pulseWidthModulation": {
    "ru": "Движение ширины импульса",
    "en": "Pulse-width modulation"
  },
  "explanations.pwmChangesTheFractionOfEachPeriod": {
    "ru": "PWM меняет долю периода, в которой импульс положителен. Тембр становится подвижным и полым.",
    "en": "PWM changes the fraction of each period spent positive, creating a moving, hollow timbre."
  },
  "explanations.amountSetsTheDeviationFromTheChosen": {
    "ru": "Размах задаёт отклонение от выбранной ширины, скорость — число колебаний в секунду. Рабочая ширина ограничена 5–95%. Здесь используется плавное смешивание восьми аналитических форм, а не моделирование электронной схемы или audio-rate PWM.",
    "en": "Amount sets the deviation from the chosen pulse width; rate sets cycles per second. Effective width is limited to 5–95%. This blends eight analytic shapes smoothly; it does not model an electronic circuit or audio-rate PWM."
  },
  "explanations.slowPitchDrift": {
    "ru": "Медленный дрейф высоты",
    "en": "Slow pitch drift"
  },
  "explanations.gentlePitchMovementInCents100Cents": {
    "ru": "Лёгкое плавное отклонение высоты в центах: 100 центов соответствуют полутону. Придаёт унисону движение.",
    "en": "Gentle pitch movement in cents: 100 cents equals an equal-tempered semitone. Adds motion to unison voices."
  },
  "explanations.try13CentsEachUnisonVoice": {
    "ru": "Попробуй 1–3 цента. Каждый голос унисона имеет свою медленную скорость. Движение повторяемое, начинается с каждой атаки; это не случайная нестабильность аппаратного генератора.",
    "en": "Try 1–3 cents. Each unison voice has its own slow rate. Motion is repeatable and restarts with each attack, rather than reproducing random hardware oscillator instability."
  },
  "explanations.singleVoiceProcessing": {
    "ru": "Обработка одного голоса",
    "en": "Single-voice processing"
  },
  "explanations.setEffectsAndThePlayingRangeFor": {
    "ru": "Здесь настраиваются эффекты и область звучания только этого голоса. У основного источника и каждого слоя свои настройки.",
    "en": "Set effects and the playing range for this voice only. The main source and each layer have separate settings."
  },
  "explanations.theseSettingsAreSavedWithTheInstrument": {
    "ru": "Сохраняются вместе с инструментом. Сначала звучит источник со своей обработкой, затем голоса смешиваются и проходят общие эффекты дорожки.",
    "en": "These settings are saved with the instrument. Each source passes through its own processing; the voices are then mixed and sent through the shared track effects."
  },
  "explanations.voiceRange": {
    "ru": "Диапазон голоса",
    "en": "Voice range"
  },
  "explanations.theVoicePlaysOnlyWhenBothNote": {
    "ru": "Голос звучит только при совпадении частоты и силы ноты с обоими диапазонами. Частота считается после множителя слоя; сила — исходное значение ноты от 0 до 100%. Границы включены.",
    "en": "The voice plays only when both note frequency and velocity fall within their ranges. Frequency includes the layer’s multiplier; velocity is the original note value from 0–100%. Boundaries are inclusive."
  },
  "explanations.assignLowNotesToOneVoiceHigh": {
    "ru": "Так можно отдать низ одному голосу, верх другому, а сильные ноты — шумному слою. Пересечения дают совместное звучание; плавного перехода на границе пока нет. Снятая галочка снимает ограничения.",
    "en": "Assign low notes to one voice, high notes to another, or strong notes to a noisy layer. Overlapping ranges play together; there is no boundary crossfade. Clear the checkbox to remove range restrictions."
  },
  "explanations.voiceEffects": {
    "ru": "Эффекты голоса",
    "en": "Voice effects"
  },
  "explanations.upToFourEffectsInSequenceFor": {
    "ru": "До четырёх последовательных эффектов выбранного голоса: эквалайзер, дилей, реверберация, дисторшн, хорус или биткрашер.",
    "en": "Up to four effects in sequence for this voice: EQ, delay, reverb, distortion, chorus or bitcrusher."
  },
  "explanations.delayRepeatsTheSoundFeedbackExtendsThe": {
    "ru": "Дилей повторяет звук; обратная связь продлевает повторы. Хвост реверберации задаётся в секундах, драйв меняет перегруз, биты — квантование амплитуды. Стрелки меняют порядок. Обработка создаётся для каждой атаки: перегруз нот независим, длинные хвосты требуют больше ресурсов. Правки слышны со следующей ноты; автоматизация этой цепочки не поддерживается.",
    "en": "Delay repeats the sound; feedback extends the repeats. Reverb tail is measured in seconds, drive controls distortion, and bits control amplitude quantization. Arrows change order. Processing is created per attack: each note’s distortion is independent and long tails use more resources. Edits take effect on the next note; this chain does not support automation."
  },
  "explanations.portableInstrumentPacks": {
    "ru": "Переносимые паки",
    "en": "Portable instrument packs"
  },
  "explanations.aNamedArchiveContainingSeveralInstrumentsAnd": {
    "ru": "Именованный архив нескольких инструментов вместе со всеми записями. Это способ поделиться набором звуков, а не проектом с нотами и сценами.",
    "en": "A named archive containing several instruments and all their recordings. Share a set of sounds rather than a project with notes and scenes."
  },
  "explanations.createAPackOrOpenAnExisting": {
    "ru": "Создай набор или открой готовый. Одиночный файл инструмента остаётся отдельной командой. Импортированные паки доступны в списке подборок библиотеки.",
    "en": "Create a pack or open an existing one. Single-instrument files keep their own import command. Imported packs appear in the browser’s collection list."
  },
  "explanations.openAPack": {
    "ru": "Открытие пака",
    "en": "Open a pack"
  },
  "explanations.chooseABarlowPackZipFileAnd": {
    "ru": "Выбирает файл .barlow-pack.zip и проверяет его целиком до добавления в библиотеку.",
    "en": "Choose a .barlow-pack.zip file and validate the whole archive before adding anything to the instrument library."
  },
  "explanations.afterValidationSelectTheInstrumentsToAdd": {
    "ru": "После проверки отметь нужные инструменты и добавь их. Обычный проект и одиночный инструмент открываются своими командами меню «Файл».",
    "en": "After validation, select the instruments to add. Projects and single instruments have separate File menu commands."
  },
  "explanations.packNameAndDescription": {
    "ru": "Название и описание пака",
    "en": "Pack name and description"
  },
  "explanations.aNameHelpsIdentifyThePackIts": {
    "ru": "Название помогает найти набор, описание может объяснять его музыкальную задачу и происхождение.",
    "en": "A name helps identify the pack; its description can explain its musical purpose and origin."
  },
  "explanations.metadataTravelsWithTheArchiveAndIs": {
    "ru": "Эти данные передаются с архивом и участвуют в поиске библиотеки. У открытого пака они доступны для чтения; новый пак создаётся отдельной командой.",
    "en": "Metadata travels with the archive and is searchable in the library. An opened pack’s metadata is read-only; create a new pack with the separate command."
  },
  "explanations.packContents": {
    "ru": "Состав пака",
    "en": "Pack contents"
  },
  "explanations.select164InstrumentsSearchNarrowsThe": {
    "ru": "Отметь от одного до 64 инструментов. Поиск сужает список, но не снимает уже сделанные отметки. «Выбрать найденные» заменяет выбор первыми 64 результатами.",
    "en": "Select 1–64 instruments. Search narrows the list without clearing your selection. Select matching replaces the selection with the first 64 results."
  },
  "explanations.importPreviewsANewNameOnThe": {
    "ru": "При импорте справа показано новое имя, если такое уже есть. Импорт всегда добавляет копии, не перезаписывает старые инструменты и избранное.",
    "en": "Import previews a new name on the right if one already exists. It always adds copies without overwriting existing instruments or favorites."
  },
  "explanations.transferSelectedInstruments": {
    "ru": "Перенос выбранных инструментов",
    "en": "Transfer selected instruments"
  },
  "explanations.exportCreatesOneArchiveAndStoresShared": {
    "ru": "Экспорт собирает один архив, общие записи хранятся в нём один раз. Импорт добавляет только отмеченные инструменты и нужные им записи.",
    "en": "Export creates one archive and stores shared recordings only once. Import adds only the selected instruments and the recordings they need."
  },
  "explanations.progressReflectsValidationAndPackingStagesCancel": {
    "ru": "Прогресс отражает этапы проверки и упаковки. Отмена останавливает операцию до публикации инструментов. При отмене или сбое после записи сэмплов они могут остаться в библиотеке; повторный импорт переиспользует их. Проект не меняется.",
    "en": "Progress reflects validation and packing stages. Cancel stops before publishing instruments. Samples already written before a cancellation or failure may remain in the library; a retry reuses them. The project stays unchanged."
  },
  "explanations.sharedSceneReverb": {
    "ru": "Общий реверб сцен",
    "en": "Shared scene reverb"
  },
  "explanations.oneReverbForTheWholeProjectEach": {
    "ru": "Одна реверберация для всего проекта. Посыл каждой дорожки задаёт, сколько её звука попадает в пространство; возврат — громкость общего хвоста.",
    "en": "One reverb for the whole project. Each track’s send controls how much signal reaches it; return controls the shared tail’s level."
  },
  "explanations.enableSharedReverbInTheMasterAnd": {
    "ru": "Включи общий реверб в мастере и подними посылы дорожек. При смене сцены новый звук и прежний хвост встречаются в одной шине. Stop гасит всё. Изменение длительности заменяет обработку и может прервать прежний хвост; локальные эффекты дорожки завершаются со сценой.",
    "en": "Enable shared reverb in the master and raise track sends. Across scene changes, new audio and the previous tail meet in one bus. Stop silences everything. Changing tail duration replaces the processing and may interrupt the old tail; local track effects still end with the scene."
  },
  "explanations.recordParameterMovement": {
    "ru": "Запись движения",
    "en": "Record parameter movement"
  },
  "explanations.duringPlaybackRecordManualMovementOfThe": {
    "ru": "Во время воспроизведения записывает ручное движение регулятора выбранного параметра в кривую активного эскиза. Точки привязаны к шагам, как и исполнение существующей автоматизации.",
    "en": "During playback, record manual movement of the selected parameter into the active clip’s automation curve. Points snap to steps, matching automation playback."
  },
  "explanations.startRecordingMoveTheControlThatAppears": {
    "ru": "Нажми запись, двигай появившийся регулятор и закончи дубль. Повторный проход перезаписывает посещённые шаги. Дубль отменяется одной командой или кнопкой отмены. Смена параметра/эскиза завершает запись. Это запись регулятора в панели автоматизации, не всех ручек DAW сразу.",
    "en": "Start recording, move the control that appears, then finish the take. Another pass overwrites visited steps. Undo the take with one command or discard it with the cancel button. Changing parameter or clip finishes recording. This records the automation panel’s control, not every knob in the DAW."
  },
  "explanations.recordedParameterValue": {
    "ru": "Значение записываемого параметра",
    "en": "Recorded parameter value"
  },
  "explanations.0100IsANormalizedScaleFor": {
    "ru": "0–100% — нормированная шкала выбранной цели. Для громкости это множитель уровня партии; для панорамы середина — центр. Для фильтра и времени эха шкала логарифмическая.",
    "en": "0–100% is a normalized scale for the selected target. For volume it multiplies clip level; for pan the midpoint is center. Filter frequency and delay time use logarithmic scales."
  },
  "explanations.theKnobAppearsDuringRecordingDoubleClick": {
    "ru": "Ручка появляется на время записи. Двойной щелчок открывает число. Линия меняется по ходу дубля; существующие модуляции продолжают добавляться к ней.",
    "en": "The knob appears during recording. Double-click for numeric entry. The curve updates throughout the take, while existing modulation continues to be added."
  },
  "explanations.equalizer": {
    "ru": "Эквалайзер",
    "en": "Equalizer"
  },
  "explanations.shapeTheFrequencyBalanceRemoveRumbleMake": {
    "ru": "Меняет баланс частот: убирает гул, освобождает место басу или добавляет яркость. Полосы обрабатывают звук последовательно.",
    "en": "Shape the frequency balance: remove rumble, make room for bass or add brightness. Bands process the sound in sequence."
  },
  "explanations.selectABandShapeAndFrequencyStart": {
    "ru": "Выбери полосу, форму и частоту. Начни с небольшого изменения уровня. Эффект дорожки обрабатывает все её голоса; порядок эффектов влияет на результат.",
    "en": "Select a band, shape and frequency. Start with small gain changes. A track EQ processes all its voices, and its position in the effects chain matters."
  },
  "explanations.frequencyResponse": {
    "ru": "Частотная характеристика",
    "en": "Frequency response"
  },
  "explanations.lowFrequenciesAreOnTheLeftHigh": {
    "ru": "Слева низкие частоты, справа высокие. Линия выше нуля усиливает, ниже ослабляет. Это отклик включённых полос, а не спектр играющей музыки.",
    "en": "Low frequencies are on the left, high frequencies on the right. Above zero boosts; below zero cuts. This shows the enabled bands’ response, not the spectrum of the playing music."
  },
  "explanations.theGraphIsCalculatedAt48KHz": {
    "ru": "График рассчитан при 48 кГц для полностью обработанного сигнала; микс и обход здесь не отражены. На другой частоте дискретизации верхняя часть может отличаться.",
    "en": "The graph is calculated at 48 kHz for the fully processed signal; mix and bypass are not reflected. At other sample rates, the high-frequency response may differ."
  },
  "explanations.eqBands": {
    "ru": "Полосы эквалайзера",
    "en": "EQ bands"
  },
  "explanations.eachNumberSelectsASeparateProcessingBand": {
    "ru": "Каждый номер — отдельная область обработки. Выбор номера показывает её настройки. Можно добавить до шести полос или удалить лишнюю.",
    "en": "Each number selects a separate processing band and reveals its settings. Add up to six bands or remove unwanted ones."
  },
  "explanations.forExampleOneBandRemovesLowRumble": {
    "ru": "Например: первая полоса убирает низкий гул, вторая смягчает резкость, третья добавляет воздух.",
    "en": "For example, one band removes low rumble, another softens harshness and a third adds air."
  },
  "explanations.enableABand": {
    "ru": "Включение полосы",
    "en": "Enable a band"
  },
  "explanations.temporarilyRemoveThisBandFromProcessingWhile": {
    "ru": "Временно исключает одну полосу из обработки, сохраняя её настройки.",
    "en": "Temporarily remove this band from processing while keeping its settings."
  },
  "explanations.compareWithAndWithoutItsCorrectionOther": {
    "ru": "Сравни звучание с коррекцией и без неё. Остальные полосы продолжают работать.",
    "en": "Compare with and without its correction. Other bands continue processing."
  },
  "explanations.bandShape": {
    "ru": "Форма полосы",
    "en": "Band shape"
  },
  "explanations.bellChangesARegionAroundItsCenter": {
    "ru": "Колокол меняет область вокруг частоты. Полки меняют весь низ или верх. Срез низких пропускает верхние частоты, срез высоких — нижние.",
    "en": "Bell changes a region around its center frequency. Shelves affect the low or high end. Low cut passes higher frequencies; high cut passes lower frequencies."
  },
  "explanations.cutFiltersRemoveUnwantedSpectrumEdgesBell": {
    "ru": "Срезы убирают лишний край спектра; колокол помогает убрать резонанс, полка — изменить общую яркость. Срезы имеют склон 12 дБ на октаву.",
    "en": "Cut filters remove unwanted spectrum edges. Bell can tame a resonance; shelves reshape overall brightness. Cut filters have a 12 dB-per-octave slope."
  },
  "explanations.bandFrequency": {
    "ru": "Частота полосы",
    "en": "Band frequency"
  },
  "explanations.bellCenterFrequencyOrAShelfCut": {
    "ru": "Центр колокола или граница полки и среза, в герцах.",
    "en": "Bell center frequency, or a shelf/cut filter’s transition frequency, in hertz."
  },
  "explanations.turnTheKnobWhileListeningToThe": {
    "ru": "Крути ручку и слушай нужную область. Двойной щелчок открывает точный ввод; музыкальный строй не ограничен полутонами.",
    "en": "Turn the knob while listening to the relevant range. Double-click for exact numeric entry; frequency is not limited to semitone steps."
  },
  "explanations.bandGain": {
    "ru": "Усиление полосы",
    "en": "Band gain"
  },
  "explanations.positiveDecibelsBoostTheRegionNegativeDecibels": {
    "ru": "Положительные децибелы усиливают область, отрицательные ослабляют; ноль оставляет её без изменения.",
    "en": "Positive decibels boost the region; negative decibels attenuate it. Zero leaves its level unchanged."
  },
  "explanations.smallChangesHelpWithMixingStrongBoosts": {
    "ru": "Небольшие изменения полезны для сведения. Сильное усиление может перегрузить следующие эффекты и мастер.",
    "en": "Small changes help with mixing. Strong boosts can overload subsequent effects or the master."
  },
  "explanations.qBandwidthAndResonance": {
    "ru": "Добротность: ширина и резонанс",
    "en": "Q: bandwidth and resonance"
  },
  "explanations.forABellHigherQNarrowsThe": {
    "ru": "У колокола больше Q — уже область, меньше Q — шире. У среза Q задаёт резонанс возле границы; около 0,71 даёт ровный переход.",
    "en": "For a bell, higher Q narrows the band and lower Q widens it. For a cut filter, Q sets resonance near the cutoff; about 0.71 gives a smooth response."
  },
  "explanations.useANarrowBellForAResonance": {
    "ru": "Узкий колокол пригоден для резонанса, широкий — для окраски. Полки имеют фиксированную плавность.",
    "en": "Use a narrow bell for a resonance and a broad bell for tonal color. Shelf slopes are fixed."
  },
  "explanations.bypassEQ": {
    "ru": "Обход эквалайзера",
    "en": "Bypass EQ"
  },
  "explanations.disableTheEntireEqualizerWhileKeepingIts": {
    "ru": "Отключает весь эквалайзер, сохраняя полосы.",
    "en": "Disable the entire equalizer while keeping its bands."
  },
  "explanations.compareByEarAtSimilarLoudnessPress": {
    "ru": "Сравни результат на слух при похожей громкости. Повторное нажатие возвращает обработку.",
    "en": "Compare by ear at similar loudness. Press again to restore processing."
  },
  "explanations.repeatableSound": {
    "ru": "Повторяемость звучания",
    "en": "Repeatable sound"
  },
  "explanations.randomElementsNormallyVaryBetweenRunsRepeatable": {
    "ru": "Обычно случайные элементы меняются при повторном запуске. «Повторяемый звук» фиксирует вариант случайности.",
    "en": "Random elements normally vary between runs. Repeatable sound fixes the random seed."
  },
  "explanations.keepOneSeedWhenComparingEditsAnd": {
    "ru": "Выбери один вариант для сравнения правок и экспорта. Новый вариант меняет случайные решения, сохраняя написанную партию.",
    "en": "Keep one seed when comparing edits and exports. A new seed changes random decisions without replacing your written notes."
  },
  "explanations.lightTheme": {
    "ru": "Светлая тема",
    "en": "Light theme"
  },
  "explanations.changeTheAppearanceOfWorkAreasGraphs": {
    "ru": "Переключает оформление всех рабочих областей, графиков и справки. На звук и содержимое проекта не влияет.",
    "en": "Change the appearance of work areas, graphs and help. Sound and project content are unaffected."
  },
  "explanations.enableLightThemeInSettingsForA": {
    "ru": "В меню «Настройки» включи «Светлая тема», чтобы работать на светлом фоне. Повторное нажатие возвращает тёмный. Выбор сохраняется на этом устройстве и применяется при следующем запуске.",
    "en": "Enable Light theme in Settings for a light background. Press again to return to dark. The choice is saved on this device and restored at the next launch."
  },
  "explanations.mainMenu": {
    "ru": "Главное меню",
    "en": "Main menu"
  },
  "explanations.applicationCommandsForFilesEditHistoryWork": {
    "ru": "Команды приложения: файлы, история правок, вид рабочих областей, настройки и справка.",
    "en": "Application commands for files, edit history, work-area views, settings and help."
  },
  "explanations.tabFocusesTheMenuArrowsChooseA": {
    "ru": "Tab переводит фокус в меню, стрелки выбирают раздел и команду, Enter выполняет, Escape закрывает. В меню «Вид» галочка означает открытую область. Поиск справки — Ctrl+/, объяснение элемента — F1.",
    "en": "Tab focuses the menu; arrows choose a section and command, Enter runs it, and Escape closes it. A checkmark in View means a panel is open. Ctrl+/ searches help; F1 explains an element."
  },
  "explanations.trackEffects": {
    "ru": "Эффекты дорожки",
    "en": "Track effects"
  },
  "explanations.aProcessingChainSharedByAllClips": {
    "ru": "Общая цепочка обработки для всех эскизов этой дорожки.",
    "en": "A processing chain shared by all clips on this track."
  },
  "explanations.addAnEffectAndAdjustItsParameters": {
    "ru": "Добавь эффект и настрой его параметры. Перестановка эффектов меняет порядок обработки. Для движения параметров во времени используй автоматизацию.",
    "en": "Add an effect and adjust its parameters. Reordering effects changes the processing order. Use automation to move parameters over time."
  },
  "explanations.showOrHidePanels": {
    "ru": "Показать или скрыть панели",
    "en": "Show or hide panels"
  },
  "explanations.aHighlightedButtonMeansItsPanelIs": {
    "ru": "Подсвеченная кнопка означает, что панель открыта. Инструменты появляются слева, микшер — под транспортом.",
    "en": "A highlighted button means its panel is open. Instruments appear on the left; the mixer appears below the transport."
  },
  "explanations.pressAgainToFreeUpSpaceOnly": {
    "ru": "Нажми повторно, чтобы освободить место. Это меняет только вид: звук и настройки сохраняются. Цепочка сцен включается рядом со сценами.",
    "en": "Press again to free up space. Only the view changes; sound and settings remain. Open the scene sequence beside the scenes."
  },
  "explanations.trackMutedInThisScene": {
    "ru": "Дорожка выключена в этой сцене",
    "en": "Track muted in this scene"
  },
  "explanations.soundIsMutedButTheClipS": {
    "ru": "Звук выключен, но позиция партии продолжает двигаться.",
    "en": "Sound is muted, but the clip’s playback position keeps moving."
  },
  "explanations.releaseMToResumeTheCurrentClip": {
    "ru": "Сними M у дорожки: текущий эскиз продолжится с той же фазы, а не начнётся заново.",
    "en": "Release M to resume the current clip at the same phase, rather than restarting it."
  },
  "explanations.dropTheBassForAFewBars": {
    "ru": "Можно убрать бас на несколько тактов и вернуть его в общий ритм.",
    "en": "Drop the bass for a few bars, then bring it back in time with the arrangement."
  },
  "explanations.whatChangesDuringANote": {
    "ru": "Что меняется во время ноты",
    "en": "What changes during a note"
  },
  "explanations.amplitudePitchAndLocalFilterHaveIndependent": {
    "ru": "У амплитуды, высоты и локального фильтра независимые формы. Переключение кнопок меняет только вид редактора. Точка рядом с названием означает включённую огибающую.",
    "en": "Amplitude, pitch and local filter have independent shapes. Switching tabs only changes the editor view. A dot beside a name means its envelope is enabled."
  },
  "explanations.startWithAmplitudeThenAddAPitch": {
    "ru": "Начни с амплитуды, затем добавь подъём высоты или открытие фильтра для райзера.",
    "en": "Start with amplitude, then add a pitch rise or an opening filter for a riser."
  },
  "explanations.auditionTheResult": {
    "ru": "Послушать результат",
    "en": "Audition the result"
  },
  "explanations.playANoteWithAllEnabledEnvelopes": {
    "ru": "Играет ноту со всеми включёнными огибающими и эффектами. Переключение цели редактора не отключает остальные формы.",
    "en": "Play a note with all enabled envelopes and effects. Switching the editor’s target does not disable the other shapes."
  },
  "explanations.pitchBreakpoints": {
    "ru": "Высота по точкам",
    "en": "Pitch breakpoints"
  },
  "explanations.raiseOrLowerPitchRelativeToThe": {
    "ru": "Плавно поднимает или опускает тон относительно частоты ноты. Размах задан в октавах: +1 удваивает частоту на верхней точке графика, −1 уменьшает вдвое. Падение тона, портаменто и вибрато продолжают действовать вместе с этой формой.",
    "en": "Raise or lower pitch relative to the note frequency. Amount is in octaves: +1 doubles the frequency at the graph’s maximum, while −1 halves it. Pitch drop, portamento and vibrato remain active alongside this shape."
  },
  "explanations.tryARampUpWith2Octaves": {
    "ru": "Включи форму «подъём» с размахом +2 для райзера. Длину задай самой ноте. Работает на тональных операторах, VA, wavetable, прямом и гранулярном сэмпле. Шумовые операторы и скрэтч сохраняют своё движение; управляющие LFO не ускоряются.",
    "en": "Try a ramp up with +2 octaves for a riser, and set the duration on the note. Works with pitched operators, VA, wavetable, direct and granular samples. Noise operators and scratch keep their own movement; control LFOs do not speed up."
  },
  "explanations.localFilterBreakpoints": {
    "ru": "Локальный фильтр по точкам",
    "en": "Local-filter breakpoints"
  },
  "explanations.eachNoteAndLayerHasItsOwn": {
    "ru": "У каждой ноты и слоя свой фильтр, который убирает верхние частоты. База — частота при нулевом уровне формы; положительный размах открывает фильтр, отрицательный закрывает. Этот режим заменяет простую фильтровую огибающую, её настройки сохраняются для возврата.",
    "en": "Each note and layer has its own low-pass filter. Base is the cutoff at zero envelope level; positive amount opens it and negative amount closes it. This mode replaces the simple filter envelope, whose settings are kept for switching back."
  },
  "explanations.forANoiseRiserTryA400": {
    "ru": "Для шумового райзера попробуй базу 400 Гц, размах +4 и форму «подъём». Общий фильтр дорожки продолжает ограничивать верх: открой его, если локальное движение слишком глухое.",
    "en": "For a noise riser, try a 400 Hz base, +4 octaves and ramp up. The shared track filter still limits the high end; open it if local movement sounds too muffled."
  },
  "explanations.modulationAmountInOctaves": {
    "ru": "Размах движения в октавах",
    "en": "Modulation amount in octaves"
  },
  "explanations.theGraphLevelMultipliesTheAmountZero": {
    "ru": "Уровень графика умножается на размах. Ноль не сдвигает частоту; 100% даёт полный размах. Плюс повышает высоту или открывает фильтр, минус понижает или закрывает.",
    "en": "The graph level multiplies the amount. Zero leaves frequency unchanged; 100% applies the full amount. Positive raises pitch or opens the filter; negative lowers pitch or closes the filter."
  },
  "explanations.doubleClickTheKnobForNumericInput": {
    "ru": "Двойной щелчок по ручке открывает точный ввод. Дробные октавы позволяют небольшие отклонения без привязки к нотной сетке.",
    "en": "Double-click the knob for numeric input. Fractional octaves allow small deviations without snapping to notes."
  },
  "explanations.localFilterBaseFrequency": {
    "ru": "Базовая частота локального фильтра",
    "en": "Local filter base frequency"
  },
  "explanations.cutoffAtZeroEnvelopeLevelWith2": {
    "ru": "Частота среза при нулевом уровне формы. При размахе +2 и уровне 100% она становится в четыре раза выше. Реальный срез ограничен безопасным диапазоном 40–18000 Гц и частотой дискретизации.",
    "en": "Cutoff at zero envelope level. With +2 octaves and 100% level, it becomes four times higher. Actual cutoff is limited to 40–18000 Hz and by the sample rate."
  },
  "explanations.breakpointMovement": {
    "ru": "Движение по точкам",
    "en": "Breakpoint movement"
  },
  "explanations.theLineControlsPitchOrFilterMovement": {
    "ru": "Линия задаёт изменение высоты или фильтра внутри ноты. Начало и конец могут иметь любой уровень: райзер может закончиться наверху. Без удержания вся форма растягивается на ноту; секунды нужны для подхода и релиза при удержании.",
    "en": "The line controls pitch or filter movement within a note. Either endpoint can have any level, so a riser can finish high. Without sustain, the shape stretches to the note; with sustain, seconds set the approach and release timing."
  },
  "explanations.thisShapeDoesNotExtendTheSound": {
    "ru": "Эта форма сама не продлевает звук. Для слышимого релиза оставь его в амплитудной огибающей. После конца формы частота остаётся на последнем уровне до окончания голоса.",
    "en": "This shape does not extend the sound by itself. Leave a release in the amplitude envelope if you want to hear it. After the shape ends, frequency stays at its last value until the voice ends."
  },
  "explanations.modulationLevel": {
    "ru": "Уровень движения",
    "en": "Modulation level"
  },
  "explanations.zeroMeansTheBaseFrequency100Means": {
    "ru": "Ноль — базовая частота, 100% — полный размах. Можно менять и крайние точки: время начала и конца фиксировано, их уровень свободен.",
    "en": "Zero means the base frequency; 100% means the full amount. Endpoint times are fixed, but their levels can be edited."
  },
  "explanations.toRiseFromALowPitchTo": {
    "ru": "Для подъёма от низкого тона к основной ноте выбери форму «спад» и отрицательный размах.",
    "en": "To rise from a low pitch to the target note, use ramp down with a negative amount."
  },
  "explanations.incomingSegmentCurve": {
    "ru": "Изгиб перехода к точке",
    "en": "Incoming segment curve"
  },
  "explanations.shapeTheTransitionFromThePreviousPoint": {
    "ru": "Меняет скорость движения между предыдущей и выбранной точкой. Ноль — ровная линия. Минус — большая часть изменения происходит в начале перехода; плюс — ближе к его концу.",
    "en": "Shape the transition from the previous point to the selected point. Zero is linear. Negative values put more movement near the start; positive values put it near the end."
  },
  "explanations.selectThePointToTheRightOf": {
    "ru": "Выбери точку справа от нужного участка и поверни ручку. Двойной щелчок открывает число. Так можно сделать резкую атаку с мягким завершением или медленный разгон.",
    "en": "Select the point to the right of a segment and turn the curve knob. Double-click for numeric entry. Make a sharp attack with a gentle finish or a slow build-up."
  },
  "explanations.envelopeTimeScale": {
    "ru": "Временной масштаб формы",
    "en": "Envelope time scale"
  },
  "explanations.withoutSustainThisIsTheFallbackDuration": {
    "ru": "Без удержания это запасная длительность для нот без заданной длины; на стане форма растягивается на ноту. При удержании проценты точек всегда отсчитываются от этого времени: оно задаёт скорость подхода и затухания.",
    "en": "Without sustain, this is the fallback duration for notes without an explicit length; grid notes stretch the shape to their duration. With sustain, point percentages always refer to this time scale, setting approach and release speed."
  },
  "explanations.forExampleA1SScaleWith": {
    "ru": "Например, при масштабе 1 с и удержании на 40% подход занимает 0,4 с, а часть после удержания — ещё 0,6 с после конца ноты.",
    "en": "For example, a 1 s scale with sustain at 40% takes 0.4 s to reach sustain, then uses 0.6 s for release after note end."
  },
  "explanations.howTheEnvelopeFollowsANote": {
    "ru": "Как огибающая проходит ноту",
    "en": "How the envelope follows a note"
  },
  "explanations.stretchTheWholeShapeToTheNote": {
    "ru": "Вся форма может растягиваться на длину ноты или доходить до выбранной точки и ждать конца ноты. После ожидания проигрывается оставшаяся часть формы.",
    "en": "Stretch the whole shape to the note, or reach a selected point and wait for note end. After waiting, play the remaining part of the shape."
  },
  "explanations.useSustainForHeldSoundsIfThe": {
    "ru": "Включай удержание для тянущихся звуков. Если нота короче подхода к точке, затухание начинается с достигнутого уровня без скачка.",
    "en": "Use sustain for held sounds. If the note ends before reaching the sustain point, release begins from the current level without a jump."
  },
  "explanations.sustainPoint": {
    "ru": "Точка удержания",
    "en": "Sustain point"
  },
  "explanations.reachThisPointAtTheSpeedSet": {
    "ru": "До этой точки форма идёт со скоростью, заданной масштабом в секундах. Затем уровень удерживается до конца ноты; оставшиеся точки задают затухание после её окончания.",
    "en": "Reach this point at the speed set by the time scale, then hold its level until note end. Remaining points shape the release afterward."
  },
  "explanations.chooseAnInteriorPointNoneStretchesThe": {
    "ru": "Выбери внутреннюю точку. «Нет» возвращает растягивание всей формы на ноту. При удалении точки удержания этот режим выключается. Stop и глушение голосов по-прежнему могут прервать звук.",
    "en": "Choose an interior point. None stretches the full shape to the note again. Deleting the sustain point disables sustain. Stop and voice choking can still interrupt the sound."
  },
  "explanations.pingPongLoop": {
    "ru": "Повтор туда-обратно",
    "en": "Ping-pong loop"
  },
  "explanations.insteadOfHoldingStillTheEnvelopeTravels": {
    "ru": "Вместо неподвижного удержания звук проходит от точки удержания назад к началу цикла и возвращается. На стыке нет скачка уровня. Все повторы умещаются между достижением удержания и концом ноты.",
    "en": "Instead of holding still, the envelope travels backward from sustain to the loop start, then forward again without a level jump. Repeats fit between reaching sustain and note end."
  },
  "explanations.forPulsationChooseALowerLevelPoint": {
    "ru": "Для пульсации выбери точку с меньшим уровнем началом цикла и задай число повторов. На короткой ноте, которая не успела дойти до удержания, цикла не будет.",
    "en": "For pulsation, choose a lower-level point as loop start and set the repeat count. A note too short to reach sustain does not loop."
  },
  "explanations.loopStart": {
    "ru": "Начало повторяемого участка",
    "en": "Loop start"
  },
  "explanations.theLeftBoundaryOfTheSegmentEnding": {
    "ru": "Левая граница участка между этой точкой и точкой удержания. Подсветка на графике показывает, какая часть формы повторится.",
    "en": "The left boundary of the segment ending at the sustain point. Highlighting shows which part of the shape repeats."
  },
  "explanations.chooseAnyEarlierPointDeletingThisBoundary": {
    "ru": "Можно выбрать любую более раннюю точку. Удаление этой границы выключает цикл; остальные точки продолжают работать.",
    "en": "Choose any earlier point. Deleting this boundary disables the loop; other points keep working."
  },
  "explanations.repeatsPerNote": {
    "ru": "Число повторов внутри ноты",
    "en": "Repeats per note"
  },
  "explanations.oneRepeatIsAFullBackwardAnd": {
    "ru": "Один повтор — полный путь назад и вперёд. От 1 до 32 повторов делят доступное время удержания. Чем длиннее нота, тем медленнее то же число повторов.",
    "en": "One repeat is a full backward-and-forward trip. Between 1 and 32 repeats divide the available sustain time. A longer note makes the same repeat count slower."
  },
  "explanations.try12ForASlowBreathing": {
    "ru": "Для размеренного дыхания начни с 1–2, для дробной пульсации попробуй 4–8. Это число на ноту, не скорость в герцах.",
    "en": "Try 1–2 for a slow breathing motion, or 4–8 for faster pulsation. This is a count per note, not a rate in hertz."
  },
  "explanations.layerSourceEditor": {
    "ru": "Редактор источника слоя",
    "en": "Layer source editor"
  },
  "explanations.editOnlyTheSelectedAdditionalVoiceOperators": {
    "ru": "Здесь меняется только выбранный дополнительный голос: волна и FM, кадры wavetable, аналоговые формы, сэмпл, огибающая и окраска. Исходный пресет и остальные голоса сохраняются.",
    "en": "Edit only the selected additional voice: operators/FM, wavetable frames, VA, sample, envelope and coloration. The original preset and other voices stay unchanged."
  },
  "explanations.useTheSameSoundControlsAsThe": {
    "ru": "Правь знакомые ручки. Рисунок волны сначала становится черновиком: прослушай и примени. «В составе» слушает весь инструмент с правками, «только слой» — выбранный голос. «К инструменту» возвращает состав. Ctrl+Z отменяет правки.",
    "en": "Use the same sound controls as the main editor. Waveform drawings first become a draft: audition, then apply. With layers auditions the complete instrument with your edits; solo layer auditions only this voice. Back to instrument returns to the layer list. Ctrl+Z undoes edits."
  },
  "explanations.buildABassFromASineSub": {
    "ru": "Собери бас из синуса, рычащей середины и шумовой атаки. Сохраняй итог целиком из основного редактора. ИИ-обработка, живая запись скрэтча и его заморозка доступны в основном голосе; в слое можно редактировать точки готового жеста.",
    "en": "Build a bass from a sine sub, growling midrange and noise attack. Save the complete result from the main editor. AI processing, live scratch recording and scratch rendering are available for the main voice; layers can edit an existing gesture’s points."
  },
  "explanations.auditionOnlyThisLayer": {
    "ru": "Послушать только слой",
    "en": "Audition only this layer"
  },
  "explanations.hearTheSelectedVoiceWithItsLevel": {
    "ru": "Проверяет выбранный голос отдельно, с его уровнем и отношением частоты, в строе дорожки и через общие эффекты. Остальные голоса не участвуют в этой пробной ноте.",
    "en": "Hear the selected voice with its level and frequency ratio, in the track’s tuning and through shared effects. Other voices do not participate in this audition."
  },
  "explanations.compareWithTheFullInstrumentSumNormalization": {
    "ru": "Сравни с «в составе». При выключенных соседях нормализация суммы может сделать голос громче; это прослушивание не меняет микс проекта.",
    "en": "Compare with the full instrument. Sum normalization can make a soloed layer louder when other voices are absent. This audition does not change the project mix."
  },
  "explanations.layerFilterEnvelopeBase": {
    "ru": "База фильтровой огибающей слоя",
    "en": "Layer filter-envelope base"
  },
  "explanations.frequencyThisVoiceSLocalFilterSettles": {
    "ru": "Частота, к которой приходит локальный фильтр этого голоса. Действует, когда размах «огиб. ↑↓» отличается от нуля. Общие срезы низа и верха настраиваются у основного инструмента.",
    "en": "Frequency this voice’s local filter settles at. Active when envelope amount is nonzero. Shared low and high cuts are set in the main instrument editor."
  },
  "explanations.forAPluckUsePositiveAmountAnd": {
    "ru": "Для щипка поставь положительный размах и короткое время. Для постепенного открытия — отрицательный размах и более длинное время.",
    "en": "For a pluck, use positive amount and short time. For a gradual opening, use negative amount and longer time."
  },
  "explanations.waveformInteraction": {
    "ru": "Работа с рисунком волны",
    "en": "Waveform interaction"
  },
  "explanations.dragToSelectARegionInA": {
    "ru": "В записи сэмпла перетаскивание выделяет фрагмент; в режиме рисования синтетической волны меняет её форму. Колесо приближает и отдаляет вид.",
    "en": "Drag to select a region in a recording or draw a shape in synthetic waveform mode. The wheel zooms in and out."
  },
  "explanations.zoomIntoThePartYouNeedAll": {
    "ru": "Приблизь нужный участок. «Весь» возвращает полный вид; двойной щелчок выделяет всю запись. Изменение масштаба не меняет звук.",
    "en": "Zoom into the part you need. All restores the complete view; double-click selects the whole recording. Zoom does not change the sound."
  },
  "explanations.instrumentInOneFile": {
    "ru": "Инструмент одним файлом",
    "en": "Instrument in one file"
  },
  "explanations.saveThisSoundWithItsRecordingsLayers": {
    "ru": "Сохраняет текущий тембр вместе с записями, слоями, эффектами и модуляциями в переносимый архив. Ноты и сцены не входят.",
    "en": "Save this sound with its recordings, layers, effects and modulation in a portable archive. Notes and scenes are excluded."
  },
  "explanations.shareTheFileWithAnotherBarlowUser": {
    "ru": "Передай файл другому пользователю barlow. Он импортирует его через меню «Файл» или кнопку импорта в библиотеке. Неприменённый рисунок волны тоже войдёт в архив.",
    "en": "Share the file with another barlow user. They import it through File or the browser’s import button. An unapplied waveform draft is also included."
  },
  "explanations.importAnInstrumentFile": {
    "ru": "Добавить инструмент из файла",
    "en": "Import an instrument file"
  },
  "explanations.validateABarlowArchiveAndAddThe": {
    "ru": "Проверяет архив barlow и добавляет тембр в «Мои инструменты» вместе со всеми нужными записями.",
    "en": "Validate a barlow archive and add the sound to my instruments together with all required recordings."
  },
  "explanations.chooseAFileReviewTheNameAnd": {
    "ru": "Выбери файл, проверь имя и нажми «добавить». Одноимённый инструмент сохранится, новый получит номер. Затем прослушай или примени его обычными кнопками.",
    "en": "Choose a file, review the name and add it. An existing instrument with the same name is kept; the new one gets a number. Then audition or apply it normally."
  },
  "explanations.cancelFileValidation": {
    "ru": "Отменить проверку файла",
    "en": "Cancel file validation"
  },
  "explanations.cancelBeforeAddingToTheLibraryThe": {
    "ru": "Отменяет добавление до записи в библиотеку. Текущий проект не меняется.",
    "en": "Cancel before adding to the library. The current project stays unchanged."
  },
  "explanations.onceInstallationStartsWaitForItTo": {
    "ru": "После начала добавления дождись завершения; готовый инструмент можно удалить из «Моих инструментов».",
    "en": "Once installation starts, wait for it to finish. You can delete the installed instrument from my instruments."
  },
  "explanations.sceneASectionOfThePiece": {
    "ru": "Сцена — часть пьесы",
    "en": "Scene — a section of the piece"
  },
  "explanations.clickToSelectASceneDragTo": {
    "ru": "Щелчок выбирает сцену, перетаскивание меняет её место в списке. Двойной щелчок или F2 открывает имя прямо в чипе.",
    "en": "Click to select a scene, drag to reorder it, or double-click/F2 to edit its name directly in the badge."
  },
  "explanations.typeANameAndPressEnterEscape": {
    "ru": "Введи имя и нажми Enter; Escape отменяет ввод. Назови части «вступление», «развитие», «финал».",
    "en": "Type a name and press Enter; Escape cancels. Try names such as introduction, development and finale."
  },
  "explanations.deleteCurrentScene": {
    "ru": "Удалить текущую сцену",
    "en": "Delete current scene"
  },
  "explanations.deleteTheSelectedSceneAndItsEntries": {
    "ru": "Удаляет выбранную сцену и её вхождения в цепочку. Единственную сцену удалить нельзя.",
    "en": "Delete the selected scene and its entries in the sequence. You cannot delete the only remaining scene."
  },
  "explanations.ctrlZRestoresTheDeletedScene": {
    "ru": "Ctrl+Z вернёт удалённую сцену.",
    "en": "Ctrl+Z restores the deleted scene."
  },
  "explanations.showSceneSequence": {
    "ru": "Показать цепочку сцен",
    "en": "Show scene sequence"
  },
  "explanations.showOrHideTheOrderAndDuration": {
    "ru": "Открывает или скрывает порядок частей пьесы и их длительности. Это вид панели, не переключение режима воспроизведения.",
    "en": "Show or hide the order and duration of the piece’s sections. This controls panel visibility, not playback mode."
  },
  "explanations.arrangeDevelopmentAndAFinaleThenSelect": {
    "ru": "Составь развитие и финал, затем выбери режим «цепочка» для исполнения всей пьесы.",
    "en": "Arrange development and a finale, then select sequence playback to perform the whole piece."
  },
  "explanations.parameterMovement": {
    "ru": "Движение параметра",
    "en": "Parameter movement"
  },
  "explanations.aDrawnCurveChangesAParameterOver": {
    "ru": "Нарисованная кривая задаёт изменение параметра. Клик ставит точку на границе шага, Shift позволяет поставить её свободно. «+ модуляция» добавляет автоматическое колебание или шум.",
    "en": "A drawn curve changes a parameter over time. Click adds a point on a step boundary; Shift allows free placement. Add modulation creates an automatic oscillation or noise source."
  },
  "explanations.modulationIsDrawnAsADashedLine": {
    "ru": "Модуляция показана штрихом поверх дорожки кривой. Можно сочетать медленное изменение с ритмическим колебанием.",
    "en": "Modulation is drawn as a dashed line over the curve. Combine a slow change with a rhythmic oscillation."
  },
  "explanations.whichTracksToShow": {
    "ru": "Какие дорожки показывать",
    "en": "Which tracks to show"
  },
  "explanations.filtersRemoveTracksFromViewWithoutChanging": {
    "ru": "Фильтры убирают лишние дорожки с экрана, но не меняют музыку, мьют или порядок дорожек.",
    "en": "Filters remove tracks from view without changing music, mute settings or track order."
  },
  "explanations.combineNameSearchWithHidingMutedTracks": {
    "ru": "Совмести поиск по имени и скрытие мьюта, чтобы сосредоточиться на нужной группе. Сброс возвращает все дорожки.",
    "en": "Combine name search with hiding muted tracks to focus on a group. Reset restores every track."
  },
  "explanations.findATrackByName": {
    "ru": "Найти дорожку по имени",
    "en": "Find a track by name"
  },
  "explanations.showTracksWhoseNamesContainTheQuery": {
    "ru": "Оставляет на экране дорожки, в названии которых есть введённый текст. Регистр и различие е/ё не важны.",
    "en": "Show tracks whose names contain the query. Matching ignores case and the Russian е/ё distinction."
  },
  "explanations.typePartOfABassTrackS": {
    "ru": "Введи «бас», чтобы работать с басовыми партиями. Звучание остальных дорожек продолжается.",
    "en": "Type part of a bass track’s name to focus on it. Other tracks keep playing."
  },
  "explanations.hideTracksMutedInThisScene": {
    "ru": "Скрыть мьют текущей сцены",
    "en": "Hide tracks muted in this scene"
  },
  "explanations.hideTracksWhoseSlotsAreMutedIn": {
    "ru": "Прячет дорожки, у которых выбран мьют партии именно в открытой сцене. При смене сцены список пересчитывается.",
    "en": "Hide tracks whose slots are muted in the selected scene. The list updates when you change scenes."
  },
  "explanations.thisOnlyFiltersTheViewItDoes": {
    "ru": "Это фильтр вида: он не выключает звук и не скрывает дорожки только из-за соло или общего выключателя.",
    "en": "This only filters the view. It does not mute audio or hide tracks merely because of solo or the global track switch."
  },
  "explanations.showEveryTrack": {
    "ru": "Показать все дорожки",
    "en": "Show every track"
  },
  "explanations.clearTheNameSearchAndDisableHiding": {
    "ru": "Очищает поиск по имени и выключает скрытие мьюта.",
    "en": "Clear the name search and disable hiding muted tracks."
  },
  "explanations.useThisToFindATrackMissing": {
    "ru": "Используй, чтобы найти пропавшую с экрана дорожку. Ноты и настройки останутся прежними.",
    "en": "Use this to find a track missing from view. Notes and settings stay unchanged."
  },
  "explanations.operatorRingingTail": {
    "ru": "Звонкий хвост оператора",
    "en": "Operator ringing tail"
  },
  "explanations.timeForThisPartialToDecayBy": {
    "ru": "Время затухания этой составляющей волны на 60 дБ. Она может звенеть дольше обычной огибающей ноты; MSEG ограничивает весь голос.",
    "en": "Time for this partial to decay by 60 dB. It can ring beyond the simple note envelope; amplitude MSEG limits the whole voice."
  },
  "explanations.giveBellPartialsDifferentTailsHighOvertones": {
    "ru": "Для колокола оставь разные хвосты у разных составляющих: высокие призвуки могут исчезать раньше низких.",
    "en": "Give bell partials different tails: high overtones can disappear before lower ones."
  },
  "explanations.rateOfChange": {
    "ru": "Скорость изменения",
    "en": "Rate of change"
  },
  "explanations.howQuicklyAnEffectOrModulationOscillates": {
    "ru": "Как быстро повторяется колебание эффекта или модуляции. В режиме синхронизации скорость связана с темпом.",
    "en": "How quickly an effect or modulation oscillates. In sync mode, its rate follows the tempo."
  },
  "explanations.slowRatesCreateGradualMovementFastRates": {
    "ru": "Медленное изменение создаёт плавное движение, быстрое — дрожание или ритмическую пульсацию.",
    "en": "Slow rates create gradual movement; fast rates produce flutter or rhythmic pulsation."
  },
  "explanations.findAnExplanationAndControl": {
    "ru": "Найти объяснение и настройку",
    "en": "Find an explanation and control"
  },
  "explanations.searchHelpAndGuidesIncludingCurrentlyHidden": {
    "ru": "Поиск по справке и гидам, включая скрытые сейчас настройки. Понимает распространённые названия и небольшие опечатки; работает без интернета.",
    "en": "Search help and guides, including currently hidden settings. Supports common terms and small typos, and works offline."
  },
  "explanations.chooseSearchHelpOrPressCtrlEnter": {
    "ru": "Нажми «найти в справке» или Ctrl+/. Введи термин, прочитай объяснение и путь. «Показать в интерфейсе» открывает доступный раздел; настройки звука не включаются автоматически.",
    "en": "Choose Search help or press Ctrl+/. Enter a term, read the explanation and path, then show it in the interface. Navigation opens an available section without automatically enabling sound settings."
  },
  "explanations.whatToSearchFor": {
    "ru": "Что искать",
    "en": "What to search for"
  },
  "explanations.enterATermSuchAsPortamentoOr": {
    "ru": "Введи название, например «портаменто», portamento или «скольжение». Можно искать слова из объяснения или задачу. Стрелки выбирают результат, Enter переводит фокус к статье.",
    "en": "Enter a term such as portamento or glide. Search explanation words or describe a task. Arrow keys select a result; Enter moves focus to the article."
  },
  "explanations.searchResults": {
    "ru": "Найденные объяснения",
    "en": "Search results"
  },
  "explanations.selectAResultOnTheLeftTo": {
    "ru": "Выбери результат слева, чтобы прочитать статью справа. Поиск использует те же тексты, что режим вопроса, а также существующие гиды.",
    "en": "Select a result on the left to read its article on the right. Search uses the same explanations as contextual help, plus the guides."
  },
  "explanations.explanationAndPath": {
    "ru": "Объяснение и путь",
    "en": "Explanation and path"
  },
  "explanations.readWhatTheControlMeansHowTo": {
    "ru": "Здесь собраны смысл настройки, способ использования, пример и, где известен, путь к контролу. Переход не включает функции и не меняет звук.",
    "en": "Read what the control means, how to use it, an example and, when known, its interface path. Navigation does not enable functions or change the sound."
  },
  "explanations.whereToShowTheSetting": {
    "ru": "Где показать настройку",
    "en": "Where to show the setting"
  },
  "explanations.chooseTheTrackInWhichToLocate": {
    "ru": "Выбери дорожку, в которой нужно найти контрол. Названия дорожек не входят в поисковый индекс справки.",
    "en": "Choose the track in which to locate the control. Track names are not part of the help search index."
  },
  "explanations.goToTheSetting": {
    "ru": "Перейти к настройке",
    "en": "Go to the setting"
  },
  "explanations.openTheRelevantSectionAndHighlightThe": {
    "ru": "Открывает соответствующий раздел и подсвечивает контрол. Если он ещё скрыт, выделяет ближайшую группу и показывает условия появления.",
    "en": "Open the relevant section and highlight the control. If it is still hidden, highlight the nearest group and explain how to reveal it."
  },
  "explanations.forPortamentoFirstEnableNewNotesCutting": {
    "ru": "Для портаменто сначала включи «новая нота глушит предыдущую». Поиск не делает этого за тебя, чтобы не менять музыку.",
    "en": "For portamento, first enable new notes cutting off previous voices. Search leaves this choice to you because it changes the music."
  },
  "explanations.launchTheRelatedGuide": {
    "ru": "Запустить связанный гид",
    "en": "Launch the related guide"
  },
  "explanations.closeSearchAndOpenAStepBy": {
    "ru": "Закрывает поиск и открывает пошаговый сценарий по выбранной теме.",
    "en": "Close search and open a step-by-step walkthrough for this topic."
  },
  "explanations.closeSearch": {
    "ru": "Закрыть поиск",
    "en": "Close search"
  },
  "explanations.returnToTheWorkspaceEscapeAlsoCloses": {
    "ru": "Возвращает в рабочее окно. Escape тоже закрывает поиск; проект сохраняется без изменений.",
    "en": "Return to the workspace. Escape also closes search without changing the project."
  },
  "explanations.searchDestination": {
    "ru": "Куда привёл поиск",
    "en": "Search destination"
  },
  "explanations.highlightTheControlOrItsNearestAvailable": {
    "ru": "Подсветка отмечает контрол или ближайшую доступную группу. Текст объясняет путь и условия появления скрытой настройки. Крестик убирает подсказку и подсветку.",
    "en": "Highlight the control or its nearest available group. The text describes the path and how to reveal hidden settings. The cross clears the explanation and highlight."
  },
  "explanations.moveThroughWavetableFrames": {
    "ru": "Движение тембра среди кадров",
    "en": "Move through wavetable frames"
  },
  "explanations.startSetsTheInitialFrameBlendScan": {
    "ru": "Начало выбирает смесь кадров; проход задаёт сдвиг от неё. Можно пройти один раз, вернуться несколько раз или добавить покачивание LFO. Высота ноты от этого не меняется.",
    "en": "Start sets the initial frame blend; scan sets the offset from it. Make one pass, repeat a round trip or add an LFO. Note pitch is unaffected."
  },
  "explanations.forRhythmicBassTryStartAt10": {
    "ru": "Для ритмичного баса выбери начало 10%, проход +70% и 2–4 цикла туда-обратно. Для живого фона добавь медленный LFO с небольшим размахом.",
    "en": "For rhythmic bass, try start at 10%, scan +70% and 2–4 ping-pong cycles. For an animated pad, add a slow, shallow LFO."
  },
  "explanations.onePassOrPingPong": {
    "ru": "Один проход или туда-обратно",
    "en": "One pass or ping-pong"
  },
  "explanations.onePassMovesFromTheStartPosition": {
    "ru": "Один проход ведёт от начальной позиции к конечной за звучащую ноту. Туда-обратно возвращается к началу без скачка и повторяет маршрут заданное число раз.",
    "en": "One pass moves from the start position to the end over the sounding note. Ping-pong returns smoothly to the start and repeats the route the chosen number of times."
  },
  "explanations.theScanIsLimitedByTableEdges": {
    "ru": "Проход ограничен краями таблицы. Это движение между выбранными позициями, а не переход с последнего кадра сразу на первый.",
    "en": "The scan is limited by table edges. It travels between positions rather than wrapping directly from the final frame to the first."
  },
  "explanations.cyclesPerNote": {
    "ru": "Циклов за ноту",
    "en": "Cycles per note"
  },
  "explanations.oneCycleTravelsFromScanStartTo": {
    "ru": "Один цикл — путь от начала к концу прохода и назад. Все 1–32 цикла умещаются в звучащую ноту, включая амплитудный релиз. Длиннее нота — медленнее движение.",
    "en": "One cycle travels from scan start to end and back. All 1–32 cycles fit within the sounding note, including amplitude release. Longer notes make the movement slower."
  },
  "explanations.chooseFourCyclesAndANoteDuration": {
    "ru": "Задай 4 цикла и длину ноты в шагах, чтобы движение следовало музыкальной длительности. Двойной щелчок по ручке открывает точное число.",
    "en": "Choose four cycles and a note duration in steps to make the motion follow musical length. Double-click the knob for an exact value."
  },
  "explanations.positionLFO": {
    "ru": "Покачивание позиции — LFO",
    "en": "Position LFO"
  },
  "explanations.aSlowControlWaveformMovesTheFrame": {
    "ru": "Медленная управляющая волна смещает смесь кадров вокруг текущей позиции прохода. Работает вместе с одним проходом или циклами. На каждой ноте начинается заново с выбранной фазы; унисон движется согласованно.",
    "en": "A slow control waveform moves the frame blend around the current scan position. It works alongside a single pass or repeated cycles. Each note restarts at the selected phase; unison voices move together."
  },
  "explanations.forMovementAroundTheMiddleSetStart": {
    "ru": "Для покачивания вокруг середины поставь начало 50%, проход 0%, размах 25%. Скорость в герцах не меняется вместе с темпом; для движения по длине ноты используй циклы.",
    "en": "For movement around the middle, set start to 50%, scan to 0% and amount to 25%. Rate in hertz does not follow tempo; use cycles for note-length-based movement."
  },
  "explanations.lfoWaveform": {
    "ru": "Форма покачивания",
    "en": "LFO waveform"
  },
  "explanations.sineSlowsSmoothlyNearItsExtremesTriangle": {
    "ru": "Синус плавно замедляется у крайних позиций. Треугольник идёт почти равномерно и разворачивается быстрее.",
    "en": "Sine slows smoothly near its extremes. Triangle moves at nearly constant speed and turns more abruptly."
  },
  "explanations.sineSuitsSoftPadsTriangleSuitsRhythmic": {
    "ru": "Синус удобен для мягких фонов, треугольник — для ритмичного движения тембра. Это форма управления, а не слышимый осциллятор.",
    "en": "Sine suits soft pads; triangle suits rhythmic timbral movement. This is a control waveform, not an audible oscillator."
  },
  "explanations.lfoRate": {
    "ru": "Скорость LFO",
    "en": "LFO rate"
  },
  "explanations.completeOscillationsPerSecondFrom005": {
    "ru": "Число полных покачиваний за секунду: 0,05–20 Гц. 1 Гц — один цикл в секунду, 0,25 Гц — один за четыре секунды.",
    "en": "Complete oscillations per second, from 0.05 to 20 Hz. 1 Hz means one cycle per second; 0.25 Hz means one cycle every four seconds."
  },
  "explanations.lowRatesCreateGradualDevelopmentHighRates": {
    "ru": "Малая скорость даёт неспешное развитие, высокая — дрожание тембра. Двойной щелчок открывает число.",
    "en": "Low rates create gradual development; high rates make the timbre flutter. Double-click for numeric input."
  },
  "explanations.lfoAmount": {
    "ru": "Размах покачивания",
    "en": "LFO amount"
  },
  "explanations.deviationInEitherDirectionFromTheCurrent": {
    "ru": "Отклонение от текущей позиции в каждую сторону, в процентах всей таблицы. Размах 25% вокруг 50% проходит от 25 до 75%.",
    "en": "Deviation in either direction from the current position, as a percentage of the whole table. An amount of 25% centered at 50% travels from 25% to 75%."
  },
  "explanations.positionIsClampedAtTheEdgesExcessive": {
    "ru": "На краях позиция ограничивается: при слишком большом размахе движение задерживается у первого или последнего кадра. Уменьши размах для ровного покачивания.",
    "en": "Position is clamped at the edges. Excessive depth can make movement linger on the first or last frame. Reduce depth for an even sweep."
  },
  "explanations.lfoStartingPhase": {
    "ru": "Откуда начинается покачивание",
    "en": "LFO starting phase"
  },
  "explanations.phaseChoosesWhereTheCycleBegins0": {
    "ru": "Фаза выбирает начальное место в цикле: 0% — середина и движение вверх, 25% — верх, 50% — середина вниз, 75% — низ. На каждой ноте отсчёт начинается заново.",
    "en": "Phase chooses where the cycle begins: 0% is the middle rising, 25% the top, 50% the middle falling, and 75% the bottom. Every note restarts from this phase."
  },
  "explanations.differentPhasesAcrossLayersSeparateTheirTimbral": {
    "ru": "В слоях разные фазы позволяют развести движения тембров. Это фаза LFO, не фаза звуковой волны.",
    "en": "Different phases across layers separate their timbral movements. This is LFO phase, not audio-waveform phase."
  },
  "explanations.sceneEntryTempo": {
    "ru": "Темп вхождения сцены",
    "en": "Scene-entry tempo"
  },
  "explanations.sharedUsesTheProjectSBPMAnd": {
    "ru": "«Общий» берёт BPM из шапки проекта; рядом показано его текущее значение. «Свой» задаёт 30–300 BPM только для этой позиции цепочки. Повтор той же сцены может иметь другой темп.",
    "en": "Shared uses the project’s BPM and shows its current value. Custom sets 30–300 BPM for this sequence entry only. Another occurrence of the same scene can use a different tempo."
  },
  "explanations.chooseCustomAndEnterAValueEnter": {
    "ru": "Выбери «свой» и введи число. Enter или переход к другому полю завершает ввод, Escape отменяет, Ctrl+Z возвращает прежнее значение. Для возврата к общему темпу выбери «общий», вводить ноль не нужно.",
    "en": "Choose custom and enter a value. Enter or leaving the field commits it, Escape cancels, and Ctrl+Z restores the previous value. Choose shared to follow project tempo again; do not enter zero."
  },
  "explanations.sceneAtThisPosition": {
    "ru": "Сцена в этой позиции",
    "en": "Scene at this position"
  },
  "explanations.chooseWhichScenePlaysAtThisPosition": {
    "ru": "Выбирает, какая сцена прозвучит на этом месте цепочки. Сама сцена и её партии не копируются и не меняются.",
    "en": "Choose which scene plays at this position in the sequence. The scene and its clips are not copied or altered."
  },
  "explanations.repeatASceneInSeveralTilesWith": {
    "ru": "Повтори сцену в нескольких плитках с разной длительностью или темпом, чтобы построить развитие и возвращение темы.",
    "en": "Repeat a scene in several tiles with different lengths or tempos to develop and return to a theme."
  },
  "explanations.playbackOrder": {
    "ru": "Порядок исполнения",
    "en": "Playback order"
  },
  "explanations.theNumberMarksThisEntrySSequence": {
    "ru": "Число показывает место в цепочке. Сцены идут слева направо, затем по следующей строке.",
    "en": "The number marks this entry’s sequence position. Scenes play left to right, then on the next row."
  },
  "explanations.dragTheDottedHandleOnTheLeft": {
    "ru": "Перетащи ручку с точками слева к нужной плитке. С клавиатуры используй доступные кнопки перестановки. Ctrl+Z отменяет изменение порядка.",
    "en": "Drag the dotted handle on the left to the desired tile. Use the reorder buttons from the keyboard. Ctrl+Z undoes the reorder."
  },
  "explanations.entryDuration": {
    "ru": "Длительность позиции",
    "en": "Entry duration"
  },
  "explanations.howManyBarsThisSceneEntryPlays": {
    "ru": "Сколько тактов играет это вхождение сцены — от 1 до 256. Один такт цепочки равен четырём долям; независимые циклы дорожек продолжают свой рисунок.",
    "en": "How many bars this scene entry plays, from 1 to 256. A sequence bar contains four beats; independent track cycles keep their own patterns."
  },
  "explanations.lengthenForDevelopmentOrShortenForA": {
    "ru": "Увеличь число для развития, сократи для вставки или перехода. При собственном BPM длительность в секундах рассчитывается по нему.",
    "en": "Lengthen for development or shorten for a fill or transition. With custom BPM, duration in seconds follows that entry’s tempo."
  },
  "explanations.removeAnEntry": {
    "ru": "Убрать позицию",
    "en": "Remove an entry"
  },
  "explanations.removeOnlyThisOccurrenceFromTheSequence": {
    "ru": "Удаляет только это вхождение из цепочки. Сцена, дорожки и другие её вхождения сохраняются. Единственную позицию удалить нельзя.",
    "en": "Remove only this occurrence from the sequence. The scene, tracks and other occurrences remain. You cannot remove the only entry."
  },
  "explanations.ctrlZRestoresTheDeletedTile": {
    "ru": "Ctrl+Z возвращает удалённую плитку.",
    "en": "Ctrl+Z restores the deleted tile."
  },
  "explanations.addAnEntry": {
    "ru": "Добавить позицию",
    "en": "Add an entry"
  },
  "explanations.appendATileUsingTheFirstScene": {
    "ru": "Добавляет в конец цепочки плитку с первой сценой, восемью тактами и общим темпом.",
    "en": "Append a tile using the first scene, eight bars and shared tempo."
  },
  "explanations.chooseTheSceneDurationAndOptionalCustom": {
    "ru": "Выбери нужную сцену, длительность и при необходимости свой BPM.",
    "en": "Choose the scene, duration and optional custom BPM."
  },
  "explanations.undoAnEdit": {
    "ru": "Отменить правку",
    "en": "Undo an edit"
  },
  "explanations.restoreTheProjectToItsStateBefore": {
    "ru": "Возвращает состояние проекта до последнего действия. Перетаскивание ручки или рисунок одним жестом отменяются целиком.",
    "en": "Restore the project to its state before the last action. A knob drag or drawing gesture is undone as a whole."
  },
  "explanations.ctrlZDoesTheSameCtrlShift": {
    "ru": "Ctrl+Z делает то же самое; Ctrl+Shift+Z возвращает отменённое.",
    "en": "Ctrl+Z does the same; Ctrl+Shift+Z redoes it."
  },
  "explanations.redoAnEdit": {
    "ru": "Повторить отменённую правку",
    "en": "Redo an edit"
  },
  "explanations.restoreTheLastUndoneActionANew": {
    "ru": "Возвращает последнее отменённое действие. Новая правка после отмены начинает другую ветку истории.",
    "en": "Restore the last undone action. A new edit after undo starts a different history branch."
  },
  "explanations.pressTheButtonOrCtrlShiftZ": {
    "ru": "Нажми кнопку или Ctrl+Shift+Z.",
    "en": "Press the button or Ctrl+Shift+Z."
  },
  "explanations.sceneName": {
    "ru": "Имя сцены",
    "en": "Scene name"
  },
  "explanations.nameASectionOfThePieceSuch": {
    "ru": "Название части пьесы: например, «вступление», «основа» или «развязка». Меняет подпись, а не звучание.",
    "en": "Name a section of the piece, such as introduction, main theme or resolution. This changes its label, not its sound."
  },
  "explanations.useAShortNameThatIsEasy": {
    "ru": "Введи короткое имя, чтобы узнавать сцену в цепочке.",
    "en": "Use a short name that is easy to recognize in the sequence."
  },
  "explanations.playOneScene": {
    "ru": "Играть одну сцену",
    "en": "Play one scene"
  },
  "explanations.loopTheSelectedSceneWithoutAutomaticallyAdvancing": {
    "ru": "Повторяет выбранную сцену без автоматического перехода по цепочке.",
    "en": "Loop the selected scene without automatically advancing through the sequence."
  },
  "explanations.useThisWhileWorkingOnOneSection": {
    "ru": "Используй для работы над одним фрагментом пьесы.",
    "en": "Use this while working on one section of the piece."
  },
  "explanations.playTheSceneSequence": {
    "ru": "Играть цепочку сцен",
    "en": "Play the scene sequence"
  },
  "explanations.playScenesInTheOrderAndDurations": {
    "ru": "Воспроизводит сцены в порядке и длительностях из панели цепочки.",
    "en": "Play scenes in the order and durations set in the sequence panel."
  },
  "explanations.openSequenceArrangeTheSectionsAndStart": {
    "ru": "Открой «цепочка», настрой порядок частей и нажми воспроизведение.",
    "en": "Open sequence, arrange the sections and start playback."
  },
  "explanations.expandATrack": {
    "ru": "Развернуть дорожку",
    "en": "Expand a track"
  },
  "explanations.openThisTrackSEditorCollapsingSaves": {
    "ru": "Открывает редактор этой дорожки. Свёрнутый вид экономит место и не останавливает звук.",
    "en": "Open this track’s editor. Collapsing saves space without stopping its sound."
  },
  "explanations.expandToEditNotesOrSettingsThe": {
    "ru": "Разверни, чтобы менять ноты или настройки; стрелка вниз снова свернёт.",
    "en": "Expand to edit notes or settings; the arrow collapses it again."
  },
  "explanations.wavefoldingQuality": {
    "ru": "Качество перегиба волны",
    "en": "Wavefolding quality"
  },
  "explanations.4OversamplingReducesWavefoldingAliasingByProcessing": {
    "ru": "Обработка 4× уменьшает цифровые призвуки wavefold, выполняя промежуточные вычисления чаще. 2× требует меньше ресурсов.",
    "en": "4× oversampling reduces wavefolding aliasing by processing at a higher intermediate rate. 2× uses fewer resources."
  },
  "explanations.keep4ForBrightSoundsCompareWith": {
    "ru": "Оставь 4× для ярких тембров; при высокой нагрузке сравни с 2×.",
    "en": "Keep 4× for bright sounds; compare with 2× if processing load is high."
  },
  "explanations.operatorWaveform": {
    "ru": "Форма оператора",
    "en": "Operator waveform"
  },
  "explanations.waveformOfOneSoundComponentSineIs": {
    "ru": "Форма одной составляющей звука: синус — мягкий, пила и импульс — яркие, шум — нетональный.",
    "en": "Waveform of one sound component: sine is soft, sawtooth and pulse are bright, and noise is unpitched."
  },
  "explanations.combineShapesAndFrequencyRatiosToBuild": {
    "ru": "Сочетай разные формы и отношения частот для собственного тембра.",
    "en": "Combine shapes and frequency ratios to build your sound."
  },
  "explanations.operatorFrequencyRatio": {
    "ru": "Отношение частоты оператора",
    "en": "Operator frequency ratio"
  },
  "explanations.frequencyOfThisComponentRelativeToThe": {
    "ru": "Высота этой составляющей относительно сыгранной ноты. Целые кратные дают гармоники, другие дроби — сложный звон.",
    "en": "Frequency of this component relative to the played note. Integer multiples are harmonics; other ratios can create more complex ringing."
  },
  "explanations.try12And3ForA": {
    "ru": "Попробуй 1, 2 и 3 для связанного тембра, 1,414 для металлического.",
    "en": "Try 1, 2 and 3 for a harmonic sound, or 1.414 for a metallic color."
  },
  "explanations.operatorLevel": {
    "ru": "Уровень оператора",
    "en": "Operator level"
  },
  "explanations.thisComponentSContributionToTheSum": {
    "ru": "Сила этой составляющей в сумме. Если строка направлена в другую строку, уровень задаёт силу частотной модуляции.",
    "en": "This component’s contribution to the sum. When routed to another operator, its level controls frequency-modulation depth."
  },
  "explanations.changeItGraduallyModulationCanQuicklyAdd": {
    "ru": "Меняй постепенно: модуляция может резко добавить яркость и сложные призвуки.",
    "en": "Change it gradually: modulation can quickly add brightness and complex overtones."
  },
  "explanations.operatorRouting": {
    "ru": "Маршрут оператора",
    "en": "Operator routing"
  },
  "explanations.sendThisRowToTheOutputOr": {
    "ru": "Направляет строку в общий звук или на управление частотой другой строки. Второй случай — FM, частотная модуляция.",
    "en": "Send this row to the output or use it to control another operator’s frequency. The latter is frequency modulation, or FM."
  },
  "explanations.chooseADestinationOperatorForMetallicOr": {
    "ru": "Выбери номер получателя для металлических или упругих тембров. Циклические связи не допускаются.",
    "en": "Choose a destination operator for metallic or rubbery sounds. Cyclic routing is not allowed."
  },
  "explanations.addAnOperator": {
    "ru": "Добавить оператор",
    "en": "Add an operator"
  },
  "explanations.addAComponentToTheWaveformTable": {
    "ru": "Добавляет составляющую в таблицу волны.",
    "en": "Add a component to the waveform table."
  },
  "explanations.setItsFrequencyLevelAndShapeAudition": {
    "ru": "Настрой частоту, уровень и форму; затем прослушай черновик и примени его.",
    "en": "Set its frequency, level and shape, audition the draft, then apply it."
  },
  "explanations.removeAnOperator": {
    "ru": "Удалить оператор",
    "en": "Remove an operator"
  },
  "explanations.removeTheSelectedWaveformComponent": {
    "ru": "Убирает выбранную составляющую из волны.",
    "en": "Remove the selected waveform component."
  },
  "explanations.listenForTheOvertoneThatDisappearsThis": {
    "ru": "Слушай, какой призвук исчезает. Это помогает разбирать сложный тембр на части.",
    "en": "Listen for the overtone that disappears. This helps you understand a complex sound’s parts."
  },
  "explanations.graphZoomAndPosition": {
    "ru": "Масштаб и положение рисунка",
    "en": "Graph zoom and position"
  },
  "explanations.theseButtonsZoomAndMoveTheVisible": {
    "ru": "Эти кнопки приближают, отдаляют и перемещают видимый участок графика. Звук от изменения масштаба не меняется.",
    "en": "These buttons zoom and move the visible graph region. Changing the view does not change the sound."
  },
  "explanations.allShowsTheCompleteWaveformZoomInto": {
    "ru": "«Весь» показывает целую волну; приблизь участок для точного выделения.",
    "en": "All shows the complete waveform. Zoom into a region for precise selection."
  },
  "explanations.editedFrame": {
    "ru": "Редактируемый кадр",
    "en": "Edited frame"
  },
  "explanations.chooseAWaveformFrameToViewAnd": {
    "ru": "Выбирает форму волны для просмотра и рисования. Выбор кадра не меняет стартовую позицию звучания.",
    "en": "Choose a waveform frame to view and draw. Selecting a frame does not change the playback start position."
  },
  "explanations.makeFramesDifferentThenSetStartAnd": {
    "ru": "Настрой разные кадры, затем задай «начало» и «проход» для движения между ними.",
    "en": "Make frames different, then set start and scan to move between them."
  },
  "explanations.frameShapePreset": {
    "ru": "Готовая форма кадра",
    "en": "Frame shape preset"
  },
  "explanations.replaceTheSelectedFrameWithSineTriangle": {
    "ru": "Заменяет выбранный кадр синусом, треугольником, пилой или импульсом. Остальные кадры сохраняются.",
    "en": "Replace the selected frame with sine, triangle, sawtooth or pulse. Other frames remain unchanged."
  },
  "explanations.startWithASimpleShapeAndDraw": {
    "ru": "Начни с простой формы и дорисуй её мышью.",
    "en": "Start with a simple shape and draw changes with the mouse."
  },
  "explanations.duplicateAFrame": {
    "ru": "Скопировать кадр",
    "en": "Duplicate a frame"
  },
  "explanations.appendACopyOfTheSelectedFrame": {
    "ru": "Добавляет копию выбранного кадра в конец таблицы, до восьми кадров.",
    "en": "Append a copy of the selected frame, up to eight frames total."
  },
  "explanations.editTheCopySoScanningBlendsBetween": {
    "ru": "Измени копию, чтобы плавный переход связывал два разных оттенка.",
    "en": "Edit the copy so scanning blends between two different colors."
  },
  "explanations.deleteAFrame": {
    "ru": "Удалить кадр",
    "en": "Delete a frame"
  },
  "explanations.removeTheSelectedFrameAtLeastTwo": {
    "ru": "Убирает выбранный кадр из таблицы. Должно остаться не меньше двух.",
    "en": "Remove the selected frame. At least two frames must remain."
  },
  "explanations.removeRedundantSimilarShapesToMakeThe": {
    "ru": "Удали лишние похожие формы, чтобы движение тембра было выразительнее.",
    "en": "Remove redundant similar shapes to make the timbral movement more distinctive."
  },
  "explanations.initialWavetablePosition": {
    "ru": "Начальная позиция в таблице",
    "en": "Initial wavetable position"
  },
  "explanations.theBlendBetweenTheFirstAndLast": {
    "ru": "Базовое положение между первым и последним кадрами в начале ноты. Между кадрами формы смешиваются; включённый LFO добавляет к позиции своё отклонение.",
    "en": "The blend between the first and last frames at note start. Shapes blend between frames; an enabled LFO adds its own offset."
  },
  "explanations.zeroIsTheFirstFrame100Is": {
    "ru": "Ноль — первый кадр, 100% — последний. Без прохода и LFO эта смесь остаётся неподвижной.",
    "en": "Zero is the first frame; 100% is the last. With no scan or LFO, the blend stays still."
  },
  "explanations.wavetableScan": {
    "ru": "Проход по таблице",
    "en": "Wavetable scan"
  },
  "explanations.distanceFromTheInitialToFinalPosition": {
    "ru": "Расстояние от начала до конечной позиции. Плюс ведёт к последним кадрам, минус — к первым. Один проход занимает всю ноту; в режиме туда-обратно этот участок повторяется. Ноль останавливает базовый проход, но LFO может продолжать движение.",
    "en": "Distance from the initial to final position. Positive moves toward later frames; negative toward earlier ones. One pass follows the whole note; ping-pong repeats the segment. Zero stops the base scan, but the LFO can still move the position."
  },
  "explanations.startAt0WithA100Scan": {
    "ru": "Начни с позиции 0% и прохода +100% для полного движения вперёд.",
    "en": "Start at 0% with a +100% scan to traverse the full table forward."
  },
  "explanations.envelopePoint": {
    "ru": "Точка огибающей",
    "en": "Envelope point"
  },
  "explanations.aPointSetsTheSelectedTargetS": {
    "ru": "Одна точка задаёт уровень выбранной цели в определённый момент ноты. Линии между точками образуют плавные переходы.",
    "en": "A point sets the selected target’s level at a moment in the note. Lines between points form smooth transitions."
  },
  "explanations.selectAPointDragItOrEnter": {
    "ru": "Выбери точку, перетащи или задай время и уровень числами. У амплитуды крайние точки нулевые; у высоты и фильтра их уровень свободен.",
    "en": "Select a point, drag it or enter time and level numerically. Amplitude endpoints are zero; pitch and filter endpoints can use any level."
  },
  "explanations.pointTime": {
    "ru": "Время точки",
    "en": "Point time"
  },
  "explanations.positionWithinTheShapeInPercentWithout": {
    "ru": "Положение внутри формы в процентах. Без удержания форма занимает длину ноты; с удержанием проценты относятся к масштабу в секундах. Точки не могут пересекаться.",
    "en": "Position within the shape, in percent. Without sustain, the shape spans the note; with sustain, percentages refer to the time scale in seconds. Points cannot cross."
  },
  "explanations.moveAnAttackEarlierOrCreateA": {
    "ru": "Передвинь атаку ближе к началу или создай паузу в середине.",
    "en": "Move an attack earlier or create a pause in the middle."
  },
  "explanations.pointAmplitude": {
    "ru": "Амплитуда точки",
    "en": "Point amplitude"
  },
  "explanations.voiceAmplitudeAtThisMomentZeroIs": {
    "ru": "Амплитуда голоса в этот момент: ноль — тишина, 100% — полный заданный уровень.",
    "en": "Voice amplitude at this moment: zero is silence; 100% is the full configured level."
  },
  "explanations.highPointsFollowingLowOnesCreateRepeated": {
    "ru": "Несколько высоких точек после тихих дают повторные атаки внутри одной ноты.",
    "en": "High points following low ones create repeated attacks within a note."
  },
  "explanations.addAPoint": {
    "ru": "Добавить точку",
    "en": "Add a point"
  },
  "explanations.insertAPointHalfwayThroughTheLongest": {
    "ru": "Добавляет точку посередине самого длинного сегмента. До 32 точек.",
    "en": "Insert a point halfway through the longest segment, up to 32 points."
  },
  "explanations.youCanAlsoDoubleClickTheDesired": {
    "ru": "На графике можно также дважды щёлкнуть в нужном месте.",
    "en": "You can also double-click the desired position on the graph."
  },
  "explanations.deleteAPoint": {
    "ru": "Удалить точку",
    "en": "Delete a point"
  },
  "explanations.removeTheSelectedInteriorPointAndConnect": {
    "ru": "Убирает выбранную внутреннюю точку и соединяет соседние с изгибом следующей точки. Начало и конец удалить нельзя.",
    "en": "Remove the selected interior point and connect its neighbors using the next point’s curve. Endpoints cannot be deleted."
  },
  "explanations.simplifyTheShapeCtrlZRestoresThe": {
    "ru": "Используй для упрощения формы; Ctrl+Z возвращает точку.",
    "en": "Simplify the shape; Ctrl+Z restores the point."
  },
  "explanations.zoneMinimumFrequency": {
    "ru": "Нижняя частота зоны",
    "en": "Zone minimum frequency"
  },
  "explanations.lowestNoteFrequencyThatSelectsThisRecording": {
    "ru": "Самая низкая нота, для которой выбирается эта запись.",
    "en": "Lowest note frequency that selects this recording."
  },
  "explanations.combineWithTheUpperBoundaryToSplit": {
    "ru": "Вместе с верхней границей раздели клавиатурный диапазон между несколькими сэмплами.",
    "en": "Combine with the upper boundary to split the pitch range across samples."
  },
  "explanations.zoneMaximumFrequency": {
    "ru": "Верхняя частота зоны",
    "en": "Zone maximum frequency"
  },
  "explanations.upperEdgeOfThisRecordingSFrequency": {
    "ru": "Верхний край частотного диапазона этой записи. При пересечении зон выбирается первая подходящая.",
    "en": "Upper edge of this recording’s frequency range. Where zones overlap, the first match wins."
  },
  "explanations.alignNeighboringZoneBoundariesSoNotesSelect": {
    "ru": "Согласуй границы соседних зон, чтобы нужные ноты попадали в нужную запись.",
    "en": "Align neighboring zone boundaries so notes select the desired recording."
  },
  "explanations.minimumNoteVelocity": {
    "ru": "Минимальная сила ноты",
    "en": "Minimum note velocity"
  },
  "explanations.lowerVelocityBoundaryForThisZoneFrom": {
    "ru": "Нижняя граница силы удара для этой зоны: от 0 до 1.",
    "en": "Lower velocity boundary for this zone, from 0 to 1."
  },
  "explanations.useSeparateZonesForSoftAndAccented": {
    "ru": "Используй отдельные зоны для тихих и акцентированных ударов.",
    "en": "Use separate zones for soft and accented hits."
  },
  "explanations.maximumNoteVelocity": {
    "ru": "Максимальная сила ноты",
    "en": "Maximum note velocity"
  },
  "explanations.upperVelocityBoundaryForThisZoneFrom": {
    "ru": "Верхняя граница силы удара для этой зоны: от 0 до 1.",
    "en": "Upper velocity boundary for this zone, from 0 to 1."
  },
  "explanations.togetherWithTheLowerBoundaryDeterminesWhich": {
    "ru": "Вместе с нижней границей определяет, при какой динамике звучит запись.",
    "en": "Together with the lower boundary, determines which dynamics use this recording."
  },
  "explanations.zoneRecording": {
    "ru": "Запись зоны",
    "en": "Zone recording"
  },
  "explanations.samplePlayedWhenANoteMatchesThis": {
    "ru": "Сэмпл, который прозвучит при попадании ноты в диапазон частоты и силы этой зоны.",
    "en": "Sample played when a note matches this zone’s frequency and velocity ranges."
  },
  "explanations.chooseALibraryRecordingAndCheckIts": {
    "ru": "Выбери запись из библиотеки и проверь её исходную частоту.",
    "en": "Choose a library recording and check its root frequency."
  },
  "explanations.moveAZoneUp": {
    "ru": "Поднять зону в списке",
    "en": "Move a zone up"
  },
  "explanations.changeZoneSelectionPriorityTheFirstMatching": {
    "ru": "Меняет порядок выбора зон. При пересечении диапазонов выигрывает первая подходящая зона.",
    "en": "Change zone selection priority. The first matching zone wins where ranges overlap."
  },
  "explanations.placeAMoreSpecificZoneBeforeA": {
    "ru": "Подними более специфическую зону перед общей.",
    "en": "Place a more specific zone before a general one."
  },
  "explanations.deleteAZone": {
    "ru": "Удалить зону",
    "en": "Delete a zone"
  },
  "explanations.removeTheRecordingSelectionRuleTheSample": {
    "ru": "Удаляет правило выбора записи. Сам файл сэмпла остаётся в библиотеке.",
    "en": "Remove the recording-selection rule. The sample file remains in the library."
  },
  "explanations.notesWillUseAnotherMatchingZoneOr": {
    "ru": "Ноты начнут использовать другую подходящую зону или основной сэмпл.",
    "en": "Notes will use another matching zone or the main sample."
  },
  "explanations.addAZone": {
    "ru": "Добавить зону",
    "en": "Add a zone"
  },
  "explanations.createANewPlayingRangeForA": {
    "ru": "Создаёт новый диапазон для записи из библиотеки.",
    "en": "Create a new playing range for a library recording."
  },
  "explanations.chooseASampleSetFrequencyAndVelocity": {
    "ru": "Выбери сэмпл, настрой частоты и силу ноты; затем прослушай несколько нот диапазона.",
    "en": "Choose a sample, set frequency and velocity bounds, then audition notes across the range."
  },
  "explanations.roundRobinRecordings": {
    "ru": "Чередование записей по кругу",
    "en": "Round-robin recordings"
  },
  "explanations.consecutiveNotesInTheZoneCycleThrough": {
    "ru": "Последовательные ноты зоны используют разные записи: первую, вторую и так далее, затем снова первую. До восьми записей.",
    "en": "Consecutive notes in the zone cycle through recordings: first, second and so on, then back to the first. Up to eight recordings."
  },
  "explanations.addSimilarHitsToCreateANatural": {
    "ru": "Добавь несколько похожих ударов для живого рисунка без механически одинаковых повторов.",
    "en": "Add similar hits to create a natural pattern without mechanically identical repeats."
  },
  "explanations.earlierInTheRotation": {
    "ru": "Раньше в чередовании",
    "en": "Earlier in the rotation"
  },
  "explanations.moveThisRecordingOnePlaceEarlierIn": {
    "ru": "Поднимает эту запись на одно место в круговой последовательности. Первая дополнительная может занять место основной.",
    "en": "Move this recording one place earlier in the round-robin sequence. The first variation can replace the main recording’s position."
  },
  "explanations.reorderRecordingsToGetTheDesiredAccent": {
    "ru": "Меняй порядок, чтобы получить нужное чередование акцентов.",
    "en": "Reorder recordings to get the desired accent pattern."
  },
  "explanations.removeAVariation": {
    "ru": "Убрать вариант",
    "en": "Remove a variation"
  },
  "explanations.removeTheRecordingFromThisZoneS": {
    "ru": "Удаляет запись из чередования этой зоны. Сам файл остаётся в библиотеке.",
    "en": "Remove the recording from this zone’s rotation. Its file stays in the library."
  },
  "explanations.useThisWhenOneVariationStandsOut": {
    "ru": "Используй, если один из повторов слишком выделяется по звуку.",
    "en": "Use this when one variation stands out too much."
  },
  "explanations.assistantConnectionCode": {
    "ru": "Код подключения помощника",
    "en": "Assistant connection code"
  },
  "explanations.aSessionSecretLinksThisTabTo": {
    "ru": "Одноразовый для запуска агента секрет связывает эту вкладку с доверенным локальным мостом. Он не попадает в файл проекта.",
    "en": "A session secret links this tab to a trusted local agent bridge. It is not saved in the project file."
  },
  "explanations.obtainTheCodeWithYourAgentS": {
    "ru": "Получи код командой live_status у своего агента и вставь сюда. Не используй чужой неизвестный мост.",
    "en": "Obtain the code with your agent’s live_status command and paste it here. Use only a bridge you trust."
  },
  "explanations.allowAssistantEdits": {
    "ru": "Разрешить правки помощнику",
    "en": "Allow assistant edits"
  },
  "explanations.allowTheConnectedAgentToChangeThe": {
    "ru": "Даёт подключённому агенту право менять проект. Без этого доступно только чтение.",
    "en": "Allow the connected agent to change the project. Without this permission, access is read-only."
  },
  "explanations.chooseThePermissionThenConnectToApply": {
    "ru": "Выбери разрешение и нажми «подключить», чтобы оно вступило в силу.",
    "en": "Choose the permission, then connect to apply it."
  },
  "explanations.allowPlaybackControl": {
    "ru": "Разрешить управление звуком",
    "en": "Allow playback control"
  },
  "explanations.allowTheAgentToStartAndStop": {
    "ru": "Позволяет агенту запускать и останавливать воспроизведение.",
    "en": "Allow the agent to start and stop playback."
  },
  "explanations.setThisSeparatelyFromEditingPermissionThen": {
    "ru": "Выбери отдельно от права редактирования и нажми «подключить».",
    "en": "Set this separately from editing permission, then connect."
  },
  "explanations.connectAnAgent": {
    "ru": "Подключить агента",
    "en": "Connect an agent"
  },
  "explanations.validateTheCodeAndConnectWithThe": {
    "ru": "Проверяет код и устанавливает связь с выбранными правами.",
    "en": "Validate the code and connect with the chosen permissions."
  },
  "explanations.connectAgainAfterChangingPermissions": {
    "ru": "Для изменения прав повторно нажми «подключить».",
    "en": "Connect again after changing permissions."
  },
  "explanations.disconnectAnAgent": {
    "ru": "Отключить агента",
    "en": "Disconnect an agent"
  },
  "explanations.closeTheConnectionAndRemoveTheCode": {
    "ru": "Закрывает связь и удаляет код из хранилища текущей вкладки.",
    "en": "Close the connection and remove the code from this tab’s storage."
  },
  "explanations.useAfterWorkingTogetherOrWhenChanging": {
    "ru": "Используй после совместной работы или при смене помощника.",
    "en": "Use after working together or when changing assistants."
  },
  "explanations.chooseAnInstrument": {
    "ru": "Выбрать инструмент",
    "en": "Choose an instrument"
  },
  "explanations.applyThisSoundToTheSelectedTarget": {
    "ru": "Применяет этот тембр к дорожке, выбранной в поле «в дорожку». Написанные ноты и строй сохраняются; пустая дорожка получает характерный регистр.",
    "en": "Apply this sound to the selected target track. Written notes and tuning are preserved; an empty track gets the preset’s recommended register."
  },
  "explanations.auditionItFirstWithPlayThenClick": {
    "ru": "Сначала нажми ▶ рядом, чтобы послушать. Затем нажми имя, если звук подходит.",
    "en": "Audition it first with play, then click its name to apply it."
  },
  "explanations.favoriteSound": {
    "ru": "Избранный звук",
    "en": "Favorite sound"
  },
  "explanations.theStarAddsOrRemovesAFavorite": {
    "ru": "Звёздочка добавляет звук в избранное или убирает его оттуда. Сам звук и проект не меняются.",
    "en": "The star adds or removes a favorite without changing the sound or project."
  },
  "explanations.starSoundsYouLikeAndUseFavorites": {
    "ru": "Отмечай удачные тембры и включай «только избранное» для быстрого поиска.",
    "en": "Star sounds you like and use favorites-only filtering to find them quickly."
  },
  "explanations.instrumentBrowserWidth": {
    "ru": "Ширина панели инструментов",
    "en": "Instrument browser width"
  },
  "explanations.giveLongNamesMoreRoomOrFree": {
    "ru": "Позволяет дать длинным названиям больше места или освободить экран для партии.",
    "en": "Give long names more room or free space for editing the part."
  },
  "explanations.dragThePanelSRightEdgeUse": {
    "ru": "Потяни правый край панели. С клавиатуры: стрелки влево/вправо, Shift — крупный шаг, Home/End — минимум/максимум. Двойной клик возвращает обычную ширину. Escape отменяет текущее перетаскивание. Ширина запоминается на этом устройстве; размер окна ограничивает её, чтобы партия оставалась доступной.",
    "en": "Drag the panel’s right edge. Use left/right arrows from the keyboard, Shift for larger steps, and Home/End for minimum/maximum. Double-click restores default width; Escape cancels a drag. Width is saved on this device and constrained by the window so the part remains accessible."
  },
  "explanations.renameAnInstrument": {
    "ru": "Переименовать инструмент",
    "en": "Rename an instrument"
  },
  "explanations.thePencilChangesItsNameInThe": {
    "ru": "Карандаш меняет название в библиотеке, поиске и экспорте пака. Тембр и избранное сохраняются. Имя дорожки и сохранённые файлы проекта не меняются.",
    "en": "The pencil changes its name in the library, search and pack exports. Sound and favorites are preserved. Track names and previously saved project files do not change."
  },
  "explanations.enterANameAndSaveEscapeCancels": {
    "ru": "Введи название и нажми «сохранить»; Escape отменяет ввод. У заводского звука это личное название на этом устройстве; кнопка со стрелкой рядом с карандашом возвращает исходное. Заводской звук можно найти и по прежнему названию. Свои и импортированные инструменты сохраняют новое имя при следующем экспорте. Названия должны быть непустыми и различаться.",
    "en": "Enter a name and save; Escape cancels. Factory sounds use a personal name on this device. The arrow beside the pencil restores the factory name in the current language. Factory sounds remain searchable by their original names. Saved and imported instruments use the new name in subsequent exports. Names must be nonempty and distinct."
  },
  "explanations.deleteASavedPreset": {
    "ru": "Удалить свой пресет",
    "en": "Delete a saved preset"
  },
  "explanations.removeASavedSoundFromMyInstruments": {
    "ru": "Убирает сохранённый тембр из раздела «мои». Инструменты, уже используемые в проекте, остаются.",
    "en": "Remove a saved sound from my instruments. Instruments already used in the project remain."
  },
  "explanations.removeAnUnwantedStartingPointToKeep": {
    "ru": "Удали ненужную заготовку, чтобы не засорять библиотеку.",
    "en": "Remove an unwanted starting point to keep the library organized."
  },
  "explanations.soundCategory": {
    "ru": "Категория звуков",
    "en": "Sound category"
  },
  "explanations.groupSimilarInstrumentsSuchAsDrumsBasses": {
    "ru": "Объединяет похожие инструменты: ударные, басы, пэды и другие.",
    "en": "Group similar instruments, such as drums, basses and pads."
  },
  "explanations.clickTheHeadingToCollapseOrExpand": {
    "ru": "Нажми заголовок, чтобы свернуть или раскрыть список. Во время поиска показываются найденные категории.",
    "en": "Click the heading to collapse or expand it. Search shows categories containing matches."
  },
  "explanations.instrumentCollections": {
    "ru": "Подборки инструментов",
    "en": "Instrument collections"
  },
  "explanations.groupSoundsByMusicalRoleRhythmBass": {
    "ru": "Группируют звуки по музыкальной задаче: ритм, бас, мелодия, атмосфера или жёсткая электроника. Один тембр может входить в несколько подборок. Внутри звуки разделены по типам инструментов.",
    "en": "Group sounds by musical role: rhythm, bass, melody, atmosphere or heavy electronics. A sound can belong to several collections. Sounds within each collection are grouped by instrument type."
  },
  "explanations.combineACollectionWithSearchAndFavorites": {
    "ru": "Сочетай подборку с поиском и избранным. «Все инструменты» снимает это ограничение. Подборка — фильтр библиотеки. В «Райзерах и обратных райзерах» собраны нарастания перед акцентом и спады после него. Кнопка прослушивания играет весь переход; в партии задай длинную ноту: 32 шага 1/16 при 120 BPM дают 4 секунды. Для переноса набора открой «Файл → Паки инструментов»; отдельный инструмент также можно сохранить со всеми слоями и записями.",
    "en": "Combine a collection with search and favorites. All instruments clears the collection filter. Risers and downlifters contains build-ups before accents and falling transitions afterward. Audition plays the full transition; use a long note in your clip. At 120 BPM, 32 steps of 1/16 last four seconds. File → Instrument packs transfers a set; single instruments can also be saved with all layers and recordings."
  },
  "explanations.favoritesOnly": {
    "ru": "Только избранное",
    "en": "Favorites only"
  },
  "explanations.showSoundsMarkedWithAStar": {
    "ru": "Показывает звуки, отмеченные звёздочкой.",
    "en": "Show sounds marked with a star."
  },
  "explanations.turnThisFilterOffToSeeThe": {
    "ru": "Выключи фильтр, чтобы вернуться ко всему банку.",
    "en": "Turn this filter off to see the whole bank again."
  },
  "explanations.resetFilters": {
    "ru": "Сбросить фильтры",
    "en": "Reset filters"
  },
  "explanations.clearTheQueryCollectionSelectionAndFavorites": {
    "ru": "Очищает поисковый запрос, выбор пакета и ограничение избранным.",
    "en": "Clear the query, collection selection and favorites-only filter."
  },
  "explanations.usefulWhenASoundUnexpectedlyDisappearsFrom": {
    "ru": "Полезно, если нужный звук неожиданно исчез из списка.",
    "en": "Useful when a sound unexpectedly disappears from the list."
  },
  "explanations.clearSearch": {
    "ru": "Очистить поиск",
    "en": "Clear search"
  },
  "explanations.removeTheQueryWhileKeepingOtherFilters": {
    "ru": "Убирает введённый поисковый запрос. Остальные фильтры остаются.",
    "en": "Remove the query while keeping other filters."
  },
  "explanations.useThisToStartANewSearch": {
    "ru": "Используй, чтобы начать новый поиск.",
    "en": "Use this to start a new search."
  },
  "explanations.hideAPanel": {
    "ru": "Скрыть панель",
    "en": "Hide a panel"
  },
  "explanations.closeThisPanelToFreeSpaceSettings": {
    "ru": "Закрывает эту панель и освобождает место. Настройки и звуки сохраняются.",
    "en": "Close this panel to free space. Settings and sounds are preserved."
  },
  "explanations.reopenThePanelUsingItsButtonOr": {
    "ru": "Панель можно снова открыть её кнопкой в шапке.",
    "en": "Reopen the panel using its button or the View menu."
  },
  "explanations.deleteATrack": {
    "ru": "Удалить дорожку",
    "en": "Delete a track"
  },
  "explanations.removeTheTrackAndItsClipsFrom": {
    "ru": "Убирает дорожку с её партиями из пьесы после подтверждения.",
    "en": "Remove the track and its clips from the project after confirmation."
  },
  "explanations.useForAnUnwantedInstrumentForTemporary": {
    "ru": "Используй для ненужного инструмента. Для временной тишины лучше выключить дорожку или её партию в сцене.",
    "en": "Use for an unwanted instrument. For temporary silence, switch the track off or mute its slot in the scene."
  },
  "explanations.reversePlayback": {
    "ru": "Обратное воспроизведение",
    "en": "Reverse playback"
  },
  "explanations.playTheSelectedRegionBackwardInDirect": {
    "ru": "Играет выбранный участок записи от конца к началу в прямом режиме сэмплера. Сам файл не меняется.",
    "en": "Play the selected region backward in direct sampler mode. The source file is unchanged."
  },
  "explanations.tryAHitOrNoiseTailTo": {
    "ru": "Попробуй на ударе или шумовом хвосте: получится нарастающий звук перед акцентом.",
    "en": "Try a hit or noise tail to create a rising sound before an accent."
  },
  "explanations.loopForNoteDuration": {
    "ru": "Петля на длину ноты",
    "en": "Loop for note duration"
  },
  "explanations.repeatTheSelectedRegionWhileTheNote": {
    "ru": "Повторяет выбранный участок записи, пока звучит нота. Работает в прямом режиме сэмплера.",
    "en": "Repeat the selected region while the note sounds. Works in direct sampler mode."
  },
  "explanations.adjustStartEndAndLoopCrossfadeFor": {
    "ru": "Подстрой начало, конец и сглаживание стыка, чтобы получить ровную тянущуюся текстуру.",
    "en": "Adjust start, end and loop crossfade for a smooth sustained texture."
  },
  "explanations.saveSelectionAsASlice": {
    "ru": "Сохранить выделение как фрагмент",
    "en": "Save selection as a slice"
  },
  "explanations.addTheSelectedWaveformRegionToThe": {
    "ru": "Добавляет выбранный на графике участок в список фрагментов. Исходная запись сохраняется целиком.",
    "en": "Add the selected waveform region to the slice list. The complete original recording is retained."
  },
  "explanations.selectAHitOrSyllableThenPress": {
    "ru": "Выдели удар или слог, затем нажми кнопку. Фрагмент можно назначить отдельной ноте.",
    "en": "Select a hit or syllable, then press the button. Assign the slice to an individual note."
  },
  "explanations.equalSliceCount": {
    "ru": "Количество равных частей",
    "en": "Equal slice count"
  },
  "explanations.numberOfRegionsCreatedWhenSlicingThe": {
    "ru": "На сколько фрагментов разделить исходную запись при нажатии «нарезать весь сэмпл».",
    "en": "Number of regions created when slicing the whole sample."
  },
  "explanations.chooseACountThatSuitsTheMaterial": {
    "ru": "Выбери число по структуре материала: например, восемь частей для короткого ритмического цикла.",
    "en": "Choose a count that suits the material, such as eight slices for a short rhythm loop."
  },
  "explanations.sliceTheWholeRecording": {
    "ru": "Нарезать всю запись",
    "en": "Slice the whole recording"
  },
  "explanations.addTheChosenNumberOfEqualSlices": {
    "ru": "Добавляет равные фрагменты по указанному количеству. Не ищет атаки автоматически и не меняет файл.",
    "en": "Add the chosen number of equal slices. This does not detect transients automatically or modify the file."
  },
  "explanations.afterSlicingRefineEachHitSBoundaries": {
    "ru": "После нарезки можно уточнить границы каждого удара числами.",
    "en": "After slicing, refine each hit’s boundaries numerically."
  },
  "explanations.clipFromSlices": {
    "ru": "Эскиз из фрагментов",
    "en": "Clip from slices"
  },
  "explanations.createANotePatternThatPlaysThe": {
    "ru": "Создаёт новый нотный рисунок, в котором фрагменты идут по порядку.",
    "en": "Create a note pattern that plays the slices in order."
  },
  "explanations.reorderRemoveOrRepeatNotesToCreate": {
    "ru": "Затем переставь, удали или повтори отдельные ноты для ломаного ритма.",
    "en": "Reorder, remove or repeat notes to create a broken rhythm."
  },
  "explanations.sliceName": {
    "ru": "Имя фрагмента",
    "en": "Slice name"
  },
  "explanations.aShortLabelForTheRecordingRegion": {
    "ru": "Короткая подпись участка записи. Помогает выбирать его в параметрах ноты.",
    "en": "A short label for the recording region, used when choosing it in note properties."
  },
  "explanations.nameItAfterItsContentSuchAs": {
    "ru": "Назови по содержанию: «бочка», «хэт», «вдох».",
    "en": "Name it after its content, such as kick, hat or breath."
  },
  "explanations.sliceStart": {
    "ru": "Начало фрагмента",
    "en": "Slice start"
  },
  "explanations.startTimeWithinTheOriginalFileIn": {
    "ru": "Время начала участка в исходном файле, в секундах.",
    "en": "Start time within the original file, in seconds."
  },
  "explanations.adjustItSoTheNoteBeginsAt": {
    "ru": "Подстрой, чтобы нота начиналась ровно с нужной атаки.",
    "en": "Adjust it so the note begins at the desired attack."
  },
  "explanations.sliceEnd": {
    "ru": "Конец фрагмента",
    "en": "Slice end"
  },
  "explanations.endTimeWithinTheOriginalFileIn": {
    "ru": "Время конца участка в исходном файле, в секундах.",
    "en": "End time within the original file, in seconds."
  },
  "explanations.trimAnUnwantedTailOrLeaveMore": {
    "ru": "Укороти лишний хвост или оставь больше пространства после удара.",
    "en": "Trim an unwanted tail or leave more space after the hit."
  },
  "explanations.auditionASlice": {
    "ru": "Прослушать фрагмент",
    "en": "Audition a slice"
  },
  "explanations.playOnlyTheSelectedRecordingRegionTo": {
    "ru": "Играет только выбранный участок записи для проверки границ.",
    "en": "Play only the selected recording region to check its boundaries."
  },
  "explanations.auditionAfterChangingStartOrEndBefore": {
    "ru": "Прослушивай после изменения начала и конца, прежде чем писать партию.",
    "en": "Audition after changing start or end before writing a part."
  },
  "explanations.deleteASlice": {
    "ru": "Удалить фрагмент",
    "en": "Delete a slice"
  },
  "explanations.removeTheSliceDefinitionWhileKeepingThe": {
    "ru": "Убирает определение фрагмента; исходный файл остаётся. Ноты, ссылающиеся на него, замолчат до выбора другого источника.",
    "en": "Remove the slice definition while keeping the original file. Notes referring to it fall silent until you choose another source."
  },
  "explanations.checkNotesUsingTheSliceCtrlZ": {
    "ru": "Проверь использующие его ноты. Ctrl+Z возвращает фрагмент.",
    "en": "Check notes using the slice. Ctrl+Z restores it."
  },
  "explanations.workspace": {
    "ru": "Рабочее пространство",
    "en": "Workspace"
  },
  "explanations.buildMusicFromTracksEachWithAn": {
    "ru": "Здесь ты собираешь музыку из дорожек. У каждой есть инструмент, нотный рисунок и настройки исполнения. Сцены объединяют рисунки, а цепочка задаёт их порядок.",
    "en": "Build music from tracks, each with an instrument, note pattern and playback settings. Scenes combine patterns; the sequence sets their order."
  },
  "explanations.startWithTrackChooseASoundAnd": {
    "ru": "Начни с «+ дорожка», выбери звук и расставь ноты. В режиме справки можно выбирать подписи, ручки, рисунки и целые панели.",
    "en": "Start with + track, choose a sound and add notes. Help mode explains labels, knobs, graphs and whole panels."
  },
  "explanations.forIDMTryDifferentCycleLengthsA": {
    "ru": "Для IDM попробуй циклы разной длины: бочка на 16 шагов, щелчки на 7.",
    "en": "For IDM, try different cycle lengths: a 16-step kick and 7-step clicks."
  },
  "explanations.whatSThis": {
    "ru": "Что это?",
    "en": "What’s this?"
  },
  "explanations.enableTheHelpCursorWhileActiveClicks": {
    "ru": "Включает справочный курсор. Пока он включён, щелчки объясняют элементы и не меняют музыку.",
    "en": "Enable the help cursor. While active, clicks explain elements instead of changing the music."
  },
  "explanations.pressOrF1ThenSelectAnElement": {
    "ru": "Нажми ? или F1, затем выбери элемент. Повторное нажатие ? выключает режим. Esc закрывает карточку, ещё один Esc — режим. Внутри карточки работают Tab и кнопки.",
    "en": "Press ? or F1, then select an element. Press ? again to exit. Escape closes the card, then exits the mode. Tab and buttons work within the card."
  },
  "explanations.taskGuides": {
    "ru": "Гиды по задачам",
    "en": "Task guides"
  },
  "explanations.stepByStepPathsForBuildingA": {
    "ru": "Пошаговые маршруты: собрать бит, изменить тембр, настроить эффекты или сохранить музыку.",
    "en": "Step-by-step paths for building a beat, shaping sounds, adjusting effects or saving music."
  },
  "explanations.chooseATaskAndFollowTheHighlight": {
    "ru": "Выбери задачу и следуй подсветке. Для объяснения отдельной ручки используй соседнюю кнопку ?.",
    "en": "Choose a task and follow the highlight. Use contextual help to explain an individual control."
  },
  "explanations.macros": {
    "ru": "Макросы",
    "en": "Macros"
  },
  "explanations.oneKnobMovesSeveralInstrumentPropertiesTogether": {
    "ru": "Одна ручка одновременно меняет несколько свойств инструмента. Это позволяет управлять характером звука одним движением.",
    "en": "One knob moves several instrument properties together, letting you shape the sound with one gesture."
  },
  "explanations.addAMacroOpenAssignmentsChooseParameters": {
    "ru": "Добавь макрос, открой «назначения», выбери параметры и их размах. Середина, 50%, сохраняет исходные настройки.",
    "en": "Add a macro, open assignments, choose parameters and set their amounts. The midpoint, 50%, preserves the base settings."
  },
  "explanations.aTensionMacroCouldOpenTheFilter": {
    "ru": "Ручка «напряжение» может открыть фильтр, усилить металлический призвук и укоротить спад.",
    "en": "A tension macro could open the filter, strengthen a metallic overtone and shorten decay."
  },
  "explanations.oneMacro": {
    "ru": "Один макрос",
    "en": "One macro"
  },
  "explanations.theTileGroupsAKnobAndAll": {
    "ru": "Плитка объединяет ручку и все её назначения. Каждый макрос управляет только перечисленными в нём параметрами.",
    "en": "The tile groups a knob and all its assignments. Each macro controls only its listed parameters."
  },
  "explanations.dragVerticallyToTurnTheKnobDouble": {
    "ru": "Вращай ручку вертикальным движением. Двойной щелчок или Enter открывает число. «Назначения» раскрывает настройки этой плитки.",
    "en": "Drag vertically to turn the knob. Double-click or Enter opens numeric input. Assignments expands this tile’s settings."
  },
  "explanations.macroPosition": {
    "ru": "Положение макроса",
    "en": "Macro position"
  },
  "explanations.50IsTheBaseSoundMovingToward": {
    "ru": "50% — исходный тембр. Движение к 100% прибавляет заданный размах, к 0% — вычитает. Отрицательный размах меняет направление.",
    "en": "50% is the base sound. Moving toward 100% adds the assigned amount; moving toward 0% subtracts it. Negative amounts reverse the direction."
  },
  "explanations.dragUpOrDownShiftSlowsMovement": {
    "ru": "Потяни ручку вверх или вниз; Shift замедляет движение. Двойной щелчок или Enter — точный ввод.",
    "en": "Drag up or down; Shift slows movement. Double-click or Enter opens exact numeric input."
  },
  "explanations.turnASoftBassBrightAndRough": {
    "ru": "Одним жестом переведи мягкий бас в яркий и шероховатый.",
    "en": "Turn a soft bass bright and rough with one gesture."
  },
  "explanations.macroAssignments": {
    "ru": "Назначения макроса",
    "en": "Macro assignments"
  },
  "explanations.parametersControlledByThisKnobLinkUp": {
    "ru": "Список параметров, которыми управляет эта ручка. Можно связать до восьми параметров с разными направлениями и силой изменения.",
    "en": "Parameters controlled by this knob. Link up to eight with different directions and amounts."
  },
  "explanations.chooseAParameterAndSetItsAmount": {
    "ru": "Выбери параметр и настрой размах. Настройки остальных макросов находятся в их плитках.",
    "en": "Choose a parameter and set its amount. Other macros have their own tiles."
  },
  "explanations.parameterBinding": {
    "ru": "Связь с параметром",
    "en": "Parameter binding"
  },
  "explanations.oneAssignmentLinksThisMacroToAn": {
    "ru": "Одно назначение связывает макрос с выбранной ручкой инструмента. Размах определяет изменение от центра к краю.",
    "en": "One assignment links this macro to an instrument parameter. Amount sets the change from the center to an edge."
  },
  "explanations.chooseTheSoundPropertyOnTheLeft": {
    "ru": "Слева выбери свойство звука, справа задай величину и знак изменения.",
    "en": "Choose the sound property on the left, then set the magnitude and sign on the right."
  },
  "explanations.assignmentTarget": {
    "ru": "Параметр назначения",
    "en": "Assignment target"
  },
  "explanations.chooseWhichSoundPropertyFollowsTheMacro": {
    "ru": "Выбирает, какое свойство звука будет двигаться вместе с макросом.",
    "en": "Choose which sound property follows the macro."
  },
  "explanations.selectAParameterThenCheckItsAmount": {
    "ru": "Выбери параметр из списка. После смены проверь размах: секунды, доли и октавы дают разный результат.",
    "en": "Select a parameter, then check its amount: seconds, fractions and octaves have different effects."
  },
  "explanations.linkOneMacroToFilterBrightnessAnd": {
    "ru": "Свяжи один макрос с яркостью фильтра и временем спада.",
    "en": "Link one macro to filter brightness and decay time."
  },
  "explanations.assignmentAmount": {
    "ru": "Размах назначения",
    "en": "Assignment amount"
  },
  "explanations.howFarTheParameterDeviatesFromIts": {
    "ru": "Насколько параметр отклоняется от исходного значения, когда макрос идёт от центра к краю. Минус разворачивает движение; ноль отключает влияние этой связи.",
    "en": "How far the parameter deviates from its base value as the macro moves from center to edge. Negative reverses direction; zero disables this binding’s influence."
  },
  "explanations.doubleClickForNumericInputLogarithmicParameters": {
    "ru": "Двойной щелчок по ручке — число. Для логарифмических параметров размах задан в октавах: +1 удваивает значение у правого края. Остальные используют указанные единицы.",
    "en": "Double-click for numeric input. Logarithmic parameters use octaves: +1 doubles the value at the right edge. Other parameters use their displayed units."
  },
  "explanations.a03SDecayAmountLengthens": {
    "ru": "Размах спада +0,3 с даёт более длинный звук справа от центра. Размах фильтра −1 октава делает его темнее.",
    "en": "A +0.3 s decay amount lengthens the sound to the right of center. A −1 octave filter amount makes it darker."
  },
  "explanations.centerTheMacro": {
    "ru": "Вернуть макрос в центр",
    "en": "Center the macro"
  },
  "explanations.setTheKnobTo50SoIts": {
    "ru": "Ставит ручку на 50%: её назначения перестают отклонять параметры. Другие макросы продолжают действовать.",
    "en": "Set the knob to 50%, so its bindings no longer offset parameters. Other macros remain active."
  },
  "explanations.compareWithTheBaseSoundWithoutDeleting": {
    "ru": "Используй для сравнения с исходным тембром без удаления назначений.",
    "en": "Compare with the base sound without deleting assignments."
  },
  "explanations.macroName": {
    "ru": "Имя макроса",
    "en": "Macro name"
  },
  "explanations.describeTheAudibleResultRatherThanNecessarily": {
    "ru": "Название описывает слышимый результат, а не обязательно один технический параметр.",
    "en": "Describe the audible result, rather than necessarily naming one technical parameter."
  },
  "explanations.useAShortNameSuchAsWarmth": {
    "ru": "Введи короткое имя, например «тепло», «звон» или «движение». Оно появится под ручкой.",
    "en": "Use a short name such as warmth, ring or motion. It appears below the knob."
  },
  "explanations.addAMacro": {
    "ru": "Добавить макрос",
    "en": "Add a macro"
  },
  "explanations.createACenteredKnobAssignedToThe": {
    "ru": "Создаёт новую ручку в центре с назначением на верхнюю границу фильтра. Всего доступно до восьми макросов.",
    "en": "Create a centered knob assigned to the low-pass cutoff. Up to eight macros are available."
  },
  "explanations.expandAssignmentsNameTheMacroAndChoose": {
    "ru": "Раскрой назначения, дай имя и выбери нужные свойства звука.",
    "en": "Expand assignments, name the macro and choose sound properties."
  },
  "explanations.threeStarterMacros": {
    "ru": "Три готовых макроса",
    "en": "Three starter macros"
  },
  "explanations.addBrightnessLengthAndWidthControllingThe": {
    "ru": "Добавляет яркость, длину и ширину: фильтр, спад и параметры унисона.",
    "en": "Add brightness, length and width, controlling the filter, decay and unison parameters."
  },
  "explanations.useThemAsStartingPointsAndAdjust": {
    "ru": "Используй как отправную точку и настрой размах под свой инструмент. Ширина слышна при нескольких голосах унисона.",
    "en": "Use them as starting points and adjust their amounts. Width needs multiple unison voices to be audible."
  },
  "explanations.addAnAssignment": {
    "ru": "Добавить назначение",
    "en": "Add an assignment"
  },
  "explanations.linkAnotherParameterToThisMacroUp": {
    "ru": "Присоединяет ещё один параметр к этому макросу, до восьми связей.",
    "en": "Link another parameter to this macro, up to eight bindings."
  },
  "explanations.chooseAPropertyAndAmountInThe": {
    "ru": "Выбери свойство и размах в новой строке. Одна ручка сможет менять несколько сторон тембра.",
    "en": "Choose a property and amount in the new row. One knob can shape several aspects of the sound."
  },
  "explanations.removeAnAssignment": {
    "ru": "Удалить назначение",
    "en": "Remove an assignment"
  },
  "explanations.removeOneParameterBindingTheMacroAnd": {
    "ru": "Разрывает одну связь с параметром. Макрос и его остальные назначения остаются.",
    "en": "Remove one parameter binding. The macro and its other assignments remain."
  },
  "explanations.useWhenAPropertyShouldNoLonger": {
    "ru": "Используй, если выбранное свойство больше не должно двигаться вместе с этой ручкой.",
    "en": "Use when a property should no longer follow this knob."
  },
  "explanations.deleteAMacro": {
    "ru": "Удалить макрос",
    "en": "Delete a macro"
  },
  "explanations.removeTheKnobAndAllItsAssignments": {
    "ru": "Удаляет ручку и все её назначения. Её отклонения больше не применяются к звуку.",
    "en": "Remove the knob and all its assignments. Its offsets no longer affect the sound."
  },
  "explanations.baseInstrumentParametersRemainCtrlZRestores": {
    "ru": "Исходные параметры инструмента сохраняются; Ctrl+Z возвращает удалённый макрос.",
    "en": "Base instrument parameters remain; Ctrl+Z restores the deleted macro."
  },
  "explanations.mainVoice": {
    "ru": "Основной голос",
    "en": "Main voice"
  },
  "explanations.theInstrumentSFirstSoundItsSource": {
    "ru": "Первый звук инструмента. Его источник и подробные настройки находятся в редакторе под слоями.",
    "en": "The instrument’s first sound. Its source and detailed settings are in the editor below the layers."
  },
  "explanations.lowerItsLevelToBlendWithAdditional": {
    "ru": "Уменьши уровень для смешивания с дополнительными голосами; ноль выключает его.",
    "en": "Lower its level to blend with additional voices; zero silences it."
  },
  "explanations.additionalVoiceSettings": {
    "ru": "Настройки дополнительного голоса",
    "en": "Additional voice settings"
  },
  "explanations.openThisLayerSSourceSelectionAnd": {
    "ru": "Открывает выбор тембра и огибающую этого слоя. Слой звучит одновременно с основным голосом.",
    "en": "Open this layer’s source selection and envelope. The layer plays alongside the main voice."
  },
  "explanations.clickTheNameToChooseASound": {
    "ru": "Нажми имя, выбери тембр или настрой атаку, удержание пика и спад. Повторное нажатие сворачивает настройки.",
    "en": "Click the name to choose a sound or adjust attack, peak hold and decay. Click again to collapse."
  },
  "explanations.voiceLevel": {
    "ru": "Уровень голоса",
    "en": "Voice level"
  },
  "explanations.thisVoiceSContributionToTheInstrument": {
    "ru": "Определяет долю этого голоса в общем тембре. Ноль выключает голос. Если сумма уровней выше 100%, смесь пропорционально ослабляется, чтобы оставить запас громкости.",
    "en": "This voice’s contribution to the instrument. Zero silences it. If the sum of gains exceeds 100%, the mix is reduced proportionally to preserve headroom."
  },
  "explanations.balanceVoicesWhileListeningToTheComplete": {
    "ru": "Настраивай баланс, слушая весь инструмент.",
    "en": "Balance voices while listening to the complete instrument."
  },
  "explanations.keepAFullBassAsTheMain": {
    "ru": "Оставь плотный бас основным, а короткую щелчковую атаку подмешай тихо.",
    "en": "Keep a full bass as the main voice and blend in a quiet click attack."
  },
  "explanations.layerFrequencyRatio": {
    "ru": "Отношение частоты слоя",
    "en": "Layer frequency ratio"
  },
  "explanations.multiplyEachNoteSFrequencyForThis": {
    "ru": "Умножает частоту каждой ноты только для этого голоса. ×1 — та же высота, ×2 — октава выше, ×0,5 — ниже. Разрешены дробные отношения.",
    "en": "Multiply each note’s frequency for this voice only. ×1 keeps pitch, ×2 raises an octave, ×0.5 lowers an octave. Fractional ratios are allowed."
  },
  "explanations.enterAMultiplierThisIsNotTempo": {
    "ru": "Введи множитель; это не настройка темпа или громкости.",
    "en": "Enter a multiplier; this is not tempo or level."
  },
  "explanations.15AddsAFifth1013": {
    "ru": "×1,5 добавляет созвучие, а ×1,013 — лёгкое биение с основным голосом.",
    "en": "×1.5 adds a fifth; ×1.013 creates gentle beating against the main voice."
  },
  "explanations.addAVoiceFromAPreset": {
    "ru": "Добавить голос из пресета",
    "en": "Add a voice from a preset"
  },
  "explanations.copyTheSelectedPresetSMainVoice": {
    "ru": "Копирует основной голос выбранного пресета в новый слой. Дополнительных голосов может быть до трёх. Вложенные слои и общая цепочка эффектов дорожки не копируются.",
    "en": "Copy the selected preset’s main voice into a new layer. Up to three additional voices are allowed. Nested layers and the shared track-effects chain are not copied."
  },
  "explanations.chooseAFactoryOrSavedSoundThen": {
    "ru": "Выбери заводской или свой сохранённый тембр, затем настрой уровень и отношение частот.",
    "en": "Choose a factory or saved sound, then set level and frequency ratio."
  },
  "explanations.replaceALayerSSound": {
    "ru": "Заменить тембр слоя",
    "en": "Replace a layer’s sound"
  },
  "explanations.replaceThisLayerSSourceAndSound": {
    "ru": "Заменяет источник и настройки звука выбранного слоя копией основного голоса пресета. Его уровень и отношение частоты сохраняются.",
    "en": "Replace this layer’s source and sound settings with a copy of a preset’s main voice. The layer’s level and frequency ratio are preserved."
  },
  "explanations.startFromAPresetThenEditSource": {
    "ru": "Можно начать с пресета, затем нажать «редактировать источник…» и менять его прямо в слое без сохранения в библиотеку.",
    "en": "Start from a preset, then edit source directly inside the layer without saving to the library first."
  },
  "explanations.deleteALayer": {
    "ru": "Удалить слой",
    "en": "Delete a layer"
  },
  "explanations.removeThisAdditionalVoiceTheMainVoice": {
    "ru": "Убирает этот дополнительный голос из инструмента. Основной и другие голоса остаются.",
    "en": "Remove this additional voice. The main voice and other layers remain."
  },
  "explanations.ctrlZRestoresTheLayerAndIts": {
    "ru": "Ctrl+Z возвращает слой вместе с настройками.",
    "en": "Ctrl+Z restores the layer and its settings."
  },
  "explanations.attack": {
    "ru": "Атака",
    "en": "Attack"
  },
  "explanations.timeForAmplitudeToRiseFromSilence": {
    "ru": "Время нарастания амплитуды от тишины до пика в начале ноты.",
    "en": "Time for amplitude to rise from silence to its peak at note start."
  },
  "explanations.reduceForSharpHitsOrIncreaseFor": {
    "ru": "Уменьшай для чётких ударов, увеличивай для мягкого появления. Двойной щелчок по ручке — точное число.",
    "en": "Reduce for sharp hits or increase for a soft entrance. Double-click the knob for an exact value."
  },
  "explanations.try15MsForAClick": {
    "ru": "Для щелчка начни с 1–5 мс, для плавного пэда — с 200 мс.",
    "en": "Try 1–5 ms for a click or 200 ms as a starting point for a soft pad."
  },
  "explanations.peakHold": {
    "ru": "Удержание пика",
    "en": "Peak hold"
  },
  "explanations.fractionOfTheRemainingTimeAfterAttack": {
    "ru": "Доля оставшегося после атаки времени, в течение которой амплитуда держится на пике перед спадом. Это длительность участка, а не уровень sustain в ADSR.",
    "en": "Fraction of the remaining time after attack held at peak amplitude before decay. This is a duration, not an ADSR sustain level."
  },
  "explanations.0StartsDecayImmediatelyHigherValuesHold": {
    "ru": "0% сразу начинает затухание; большее значение удерживает звук. Без заданной длины ноты 100% включает длинное удержание с защитным пределом 16 секунд.",
    "en": "0% starts decay immediately; higher values hold the sound. With no explicit note duration, 100% enables a long hold capped at 16 seconds."
  },
  "explanations.shortHoldSuitsPercussionLongHoldSuits": {
    "ru": "Короткое удержание подходит перкуссии, длинное — тянущемуся басу.",
    "en": "Short hold suits percussion; long hold suits sustained bass."
  },
  "explanations.decay": {
    "ru": "Спад",
    "en": "Decay"
  },
  "explanations.fadeOutDurationOfTheSimpleEnvelope": {
    "ru": "Задаёт длительность затухания в обычной огибающей, когда длина ноты не задана отдельно. Явная длина ноты определяет доступное время формы; эффекты могут звучать дольше.",
    "en": "Fade-out duration of the simple envelope when note length is not set separately. Explicit note length determines the available envelope time; effects can ring longer."
  },
  "explanations.shortValuesKeepTheSoundTightLong": {
    "ru": "Короткое значение делает звук собранным, длинное оставляет хвост. Двойной щелчок — ввод секунд.",
    "en": "Short values keep the sound tight; long values leave a tail. Double-click to enter seconds."
  },
  "explanations.shortDecaySeparatesRapidHitsLongDecay": {
    "ru": "Короткий спад разделяет быстрые удары; длинный связывает редкую мелодию.",
    "en": "Short decay separates rapid hits; long decay connects a sparse melody."
  },
  "explanations.newNoteCutsOffPreviousVoices": {
    "ru": "Новая нота прерывает предыдущую",
    "en": "New note cuts off previous voices"
  },
  "explanations.aNewAttackStopsNotesAlreadySounding": {
    "ru": "Новая атака останавливает звучащие ноты этой дорожки. Это не выключение дорожки: следующая нота продолжает играть.",
    "en": "A new attack stops notes already sounding on this track. This does not switch the track off: the next note still plays."
  },
  "explanations.enableWhenTailsClashSetPortamentoFor": {
    "ru": "Включи, когда хвосты мешают друг другу. Для скольжения между одиночными нотами настрой portamento.",
    "en": "Enable when tails clash. Set portamento for gliding between single notes."
  },
  "explanations.makeABassLineClearerByKeeping": {
    "ru": "Басовая линия станет разборчивее: предыдущая низкая нота не гудит под следующей.",
    "en": "Make a bass line clearer by keeping the previous low note from ringing beneath the next one."
  },
  "explanations.chokeGroup": {
    "ru": "Группа взаимного прерывания",
    "en": "Choke group"
  },
  "explanations.tracksSharingAGroupNumberStopEach": {
    "ru": "Дорожки с одинаковым номером останавливают предыдущие звуки друг друга при новой атаке. «Нет» оставляет дорожку независимой.",
    "en": "Tracks sharing a group number stop each other’s previous voices on new attacks. None keeps the track independent."
  },
  "explanations.assignTheSameNumberToRelatedSounds": {
    "ru": "Назначь один номер связанным звукам. При одновременных атаках учитывается приоритет.",
    "en": "Assign the same number to related sounds. Simultaneous attacks use priority."
  },
  "explanations.aClosedHiHatCutsOffAn": {
    "ru": "Закрытый хэт обрывает хвост открытого, как на настоящей ударной установке.",
    "en": "A closed hi-hat cuts off an open hi-hat’s tail, as on a drum kit."
  },
  "explanations.simultaneousAttackPriority": {
    "ru": "Приоритет одновременных атак",
    "en": "Simultaneous-attack priority"
  },
  "explanations.withinAChokeGroupChooseWhichTrack": {
    "ru": "В группе взаимного прерывания определяет, какая дорожка прозвучит, если несколько атак совпали по времени. Большее число выигрывает; при равенстве — дорожка ниже в списке.",
    "en": "Within a choke group, choose which track plays when attacks coincide. Higher numbers win; ties favor the lower track in the list."
  },
  "explanations.giveAClosedHiHatHigherPriority": {
    "ru": "Дай закрытому хэту больший приоритет, если он должен прерывать открытый даже при совпадении нот.",
    "en": "Give a closed hi-hat higher priority if it should cut off an open hat even on simultaneous notes."
  },
  "explanations.glidePortamento": {
    "ru": "Портаменто — скольжение высоты",
    "en": "Glide (portamento)"
  },
  "explanations.smoothTransitionFromThePreviousNoteS": {
    "ru": "Плавный переход от высоты предыдущей ноты к следующей. Подходит для скользящего баса или певучей мелодии.",
    "en": "Smooth transition from the previous note’s pitch to the next. Useful for sliding bass or flowing melodies."
  },
  "explanations.openTheTrackTabEnableNewNotes": {
    "ru": "Открой режим «дорожка» у нужной дорожки, включи «новая нота глушит предыдущую» и задай «скольжение, мс». Ноль выключает скольжение. Работает на одиночных нотах, не на аккордах и скрэтче; атака каждой ноты начинается заново.",
    "en": "Open the track tab, enable new notes cutting off previous voices, then set glide in milliseconds. Zero disables it. Single notes glide; chords and scratch do not. Each note retriggers its attack."
  },
  "explanations.try80150MsOnBassAlternating": {
    "ru": "Попробуй 80–150 мс на басу и чередуй близкие и далёкие высоты.",
    "en": "Try 80–150 ms on bass, alternating small and large pitch intervals."
  },
  "explanations.formantsVowelLikeColor": {
    "ru": "Форманты — голосовая окраска",
    "en": "Formants — vowel-like color"
  },
  "explanations.emphasizedSpectralRegionsResemblingVocalTractResonances": {
    "ru": "Усиленные области спектра, похожие на резонансы рта. Они меняют гласный оттенок звука, не задавая ноту.",
    "en": "Emphasized spectral regions resembling vocal-tract resonances. They change vowel color without setting the note’s pitch."
  },
  "explanations.addUpToFiveBandsAndSet": {
    "ru": "Добавь до пяти полос, выбери их частоты и уровни. Частоты остаются в герцах независимо от высоты партии.",
    "en": "Add up to five bands and set their frequencies and levels. Frequencies stay fixed in hertz regardless of the part’s pitch."
  },
  "explanations.bandsAround800And1200HzCan": {
    "ru": "Пара полос на 800 и 1200 Гц придаст яркой волне оттенок «а». Сдвиг полос позволяет искать «о» и «и».",
    "en": "Bands around 800 and 1200 Hz can add an “ah”-like color to a bright waveform. Move them to explore other vowels."
  },
  "explanations.formantFrequency": {
    "ru": "Частота форманты",
    "en": "Formant frequency"
  },
  "explanations.centerOfTheSpectralRegionEmphasizedBy": {
    "ru": "Центр области спектра, которую эта полоса подчёркивает. Это окраска тембра, а не высота сыгранной ноты.",
    "en": "Center of the spectral region emphasized by this band. This colors the timbre rather than setting note pitch."
  },
  "explanations.moveItWhileListeningToABright": {
    "ru": "Двигай частоту, слушая яркий источник: на чистом синусе эффект может быть слабым.",
    "en": "Move it while listening to a bright source. A pure sine may show little effect."
  },
  "explanations.formantLevel": {
    "ru": "Уровень форманты",
    "en": "Formant level"
  },
  "explanations.strengthOfThisResonanceBlendedWithThe": {
    "ru": "Сила выбранного резонанса в смеси с исходным звуком.",
    "en": "Strength of this resonance blended with the source."
  },
  "explanations.increaseGraduallySeveralStrongBandsCanSound": {
    "ru": "Увеличивай постепенно: несколько сильных полос могут сделать звук резким.",
    "en": "Increase gradually: several strong bands can sound harsh."
  },
  "explanations.addAFormant": {
    "ru": "Добавить форманту",
    "en": "Add a formant"
  },
  "explanations.addAnotherResonantBandBandsTogetherCreate": {
    "ru": "Добавляет ещё одну резонансную полосу. Вместе полосы создают более узнаваемый гласный оттенок.",
    "en": "Add another resonant band. Bands together create a more recognizable vowel color."
  },
  "explanations.setFrequencyAndLevelUpToFive": {
    "ru": "Настрой её частоту и уровень; всего можно добавить до пяти.",
    "en": "Set frequency and level; up to five bands are available."
  },
  "explanations.removeAFormant": {
    "ru": "Удалить форманту",
    "en": "Remove a formant"
  },
  "explanations.removeOneResonantBandLeavingTheRemaining": {
    "ru": "Убирает одну резонансную полосу. Остальная окраска сохраняется.",
    "en": "Remove one resonant band, leaving the remaining coloration."
  },
  "explanations.compareByEarCtrlZRestoresThe": {
    "ru": "Сравни результат на слух; Ctrl+Z возвращает полосу.",
    "en": "Compare by ear; Ctrl+Z restores the band."
  },
  "explanations.actionDialog": {
    "ru": "Окно действия",
    "en": "Action dialog"
  },
  "explanations.configureTheCurrentOperationAndConfirmIts": {
    "ru": "Здесь задаются параметры текущей операции и подтверждается результат.",
    "en": "Configure the current operation and confirm its result here."
  },
  "explanations.readTheTitleAndConditionsCancelCloses": {
    "ru": "Прочитай название и условия. «Отмена» закрывает окно без выполнения, основная кнопка выполняет указанное действие. F1 позволяет изучить элементы окна.",
    "en": "Read the title and conditions. Cancel closes without running the operation; the primary button performs it. F1 explains the dialog’s elements."
  },
  "explanations.cancelTheAction": {
    "ru": "Отменить действие",
    "en": "Cancel the action"
  },
  "explanations.closeThisDialogWithoutPerformingTheProposed": {
    "ru": "Закрывает это окно без выполнения предложенной операции.",
    "en": "Close this dialog without performing the proposed operation."
  },
  "explanations.useWhenYouWantToReturnTo": {
    "ru": "Используй, если нужно вернуться к проекту и сначала проверить настройки.",
    "en": "Use when you want to return to the project and check settings first."
  },
  "explanations.confirmTheAction": {
    "ru": "Подтвердить действие",
    "en": "Confirm the action"
  },
  "explanations.performTheOperationDescribedByThisDialog": {
    "ru": "Выполняет операцию, указанную в названии и тексте этого окна.",
    "en": "Perform the operation described by this dialog’s title and text."
  },
  "explanations.checkTheEnteredNameAndConditionsBefore": {
    "ru": "Проверь введённое имя и условия перед подтверждением. Если передумал — выбери «отмена».",
    "en": "Check the entered name and conditions before confirming. Choose cancel if you change your mind."
  },
  "explanations.audioStatus": {
    "ru": "Состояние звука",
    "en": "Audio status"
  },
  "explanations.showsEngineReadinessResourceUsageAndLimit": {
    "ru": "Показывает готовность аудиодвижка, занятые ресурсы и сообщения об ограничениях.",
    "en": "Shows engine readiness, resource usage and limit messages."
  },
  "explanations.ifNotesAreDroppedReduceUnisonLayers": {
    "ru": "Если часть нот пропускается, сократи унисон, число слоёв или тяжёлые эффекты.",
    "en": "If notes are dropped, reduce unison, layers or demanding effects."
  },
  "explanations.externalAssistant": {
    "ru": "Внешний помощник",
    "en": "External assistant"
  },
  "explanations.optionallyConnectAnAIAssistantOnThis": {
    "ru": "Необязательное подключение ИИ-помощника на этом компьютере: он сможет читать проект, а с твоего разрешения — редактировать его и управлять воспроизведением. Для обычной работы и генерации звуков подключение не требуется.",
    "en": "Optionally connect an AI assistant on this computer. It can read the project and, with your permission, edit and control playback. This connection is not needed for normal use or sound generation."
  },
  "explanations.configureBarlowMCPInTheAssistantThen": {
    "ru": "В помощнике должен быть настроен MCP barlow. Попроси его вызвать live_status и передать код. Вставь код, выбери права и нажми «подключить». Код хранится до закрытия вкладки, действует до перезапуска моста и не попадает в проект. Новые права применяются повторным подключением.",
    "en": "Configure barlow MCP in the assistant, then ask it to call live_status and provide the code. Paste it, choose permissions and connect. The code lasts for this tab session and until the bridge restarts; it is excluded from the project. Reconnect to apply changed permissions."
  },
  "explanations.samplerZones": {
    "ru": "Зоны сэмплера",
    "en": "Sampler zones"
  },
  "explanations.useDifferentRecordingsForDifferentFrequenciesOr": {
    "ru": "Разные записи могут звучать на разных частотах и при разной силе ноты. В одной зоне записи можно чередовать по кругу.",
    "en": "Use different recordings for different frequencies or velocities. Within a zone, recordings can rotate round-robin."
  },
  "explanations.addAZoneChooseItsRecordingSet": {
    "ru": "Добавь зону, выбери запись, задай границы частоты и силы, а также исходную частоту записи.",
    "en": "Add a zone, choose its recording, set frequency and velocity ranges, and enter the recording’s root frequency."
  },
  "explanations.softAndStrongHitsCanUseDifferent": {
    "ru": "Тихие и сильные удары могут использовать разные записи; чередование убирает эффект одинаковых повторов.",
    "en": "Soft and strong hits can use different recordings; rotation avoids identical repeated hits."
  },
  "explanations.exportAudioToWAV": {
    "ru": "Сохранить звучание в WAV",
    "en": "Export audio to WAV"
  },
  "explanations.renderASceneOrSequenceToAn": {
    "ru": "Создаёт аудиофайл из сцены или цепочки, чтобы слушать и использовать музыку вне barlow.",
    "en": "Render a scene or sequence to an audio file for listening or use outside barlow."
  },
  "explanations.chooseDurationAndTailModeNaturalPreserves": {
    "ru": "Выбери длительность и режим хвоста. «Естественный» сохраняет затухание последней сцены, «обрезать» подходит для точной петли. Оценка показывает размер и ограничение ресурса.",
    "en": "Choose duration and tail mode. Natural preserves the final scene’s decay; trim suits an exact loop. The estimate shows file size and resource limits."
  }
} as const;
