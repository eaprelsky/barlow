export const cards = {
  "cards.synthesisMethod": {
    "ru": "способ синтеза",
    "en": "synthesis method"
  },
  "cards.operatorsAddAndModulateWaveformsWavetableBlends": {
    "ru": "Операторы складывают и модулируют волны. Wavetable плавно меняет форму между кадрами. VA даёт привычные яркие формы синтезатора. Переключение меняет источник основного голоса; его можно отменить Ctrl+Z.",
    "en": "Operators add and modulate waveforms. Wavetable blends between frames. VA provides familiar bright synth waveforms. Switching changes the main voice’s source; Ctrl+Z undoes it."
  },
  "cards.wavetableAnEvolvingWaveform": {
    "ru": "wavetable — движущаяся волна",
    "en": "wavetable — an evolving waveform"
  },
  "cards.selectAFrameAndDrawItOr": {
    "ru": "Выбери кадр и нарисуй его либо возьми готовую форму. «Начало» выбирает смесь кадров, «проход» задаёт сдвиг. Один проход занимает ноту, «туда-обратно» повторяет маршрут. LFO добавляет покачивание с независимыми скоростью, размахом и фазой. Все ручки имеют точный ввод по двойному щелчку. До восьми кадров; больше кадров и унисон требуют больше обработки.",
    "en": "Select a frame and draw it or choose a preset shape. Start sets the initial blend; scan sets its movement. One pass follows the note; ping-pong repeats the route. The position LFO adds motion with its own rate, depth and phase. Double-click knobs for exact values. Up to eight frames; more frames and unison voices require more processing."
  },
  "cards.vaAnalogStyleWaveforms": {
    "ru": "VA — аналогоподобные формы",
    "en": "VA — analog-style waveforms"
  },
  "cards.sawtoothIsBrightAndDenseTriangleIs": {
    "ru": "Пила — яркий плотный звук, треугольник — мягкий, импульс — полый или тонкий в зависимости от ширины. Это цифровые осцилляторы с ограничением верхних гармоник. Фильтр и его резонанс задаются во вкладке «тембр».",
    "en": "Sawtooth is bright and dense, triangle is soft, and pulse is hollow or thin depending on its width. These are digital oscillators with upper harmonics limited. Set the filter and resonance on the timbre tab."
  },
  "cards.ringModulationWavefoldingAndCombFiltering": {
    "ru": "ring, wavefold и comb",
    "en": "ring modulation, wavefolding and comb filtering"
  },
  "cards.ringModulationMultipliesTheSoundByAnother": {
    "ru": "Кольцевая модуляция умножает звук на другую волну и добавляет боковые частоты. Wavefold перегибает волну и меняет спектр; передискретизация 4× уменьшает алиасинг ценой обработки. Гребенчатый фильтр даёт короткие резонансные повторы: частота задаёт окраску, обратная связь продлевает хвост. Нулевой микс отключает соответствующую обработку. Параметры доступны макросам.",
    "en": "Ring modulation multiplies the sound by another wave, adding sidebands. Wavefolding folds the waveform and changes its spectrum; 4× oversampling reduces aliasing at a processing cost. A comb filter produces short resonant repeats: frequency shapes the color and feedback extends the tail. Zero mix disables the corresponding process. These parameters can be assigned to macros."
  },
  "cards.instrumentLayers": {
    "ru": "слои инструмента",
    "en": "instrument layers"
  },
  "cards.combineTheMainVoiceWithUpTo": {
    "ru": "Сложи основной голос и до трёх дополнительных: например, саб, ударную атаку и шум. Выбирай готовые или свои сохранённые тембры; нажатие на имя открывает огибающую и кнопку «редактировать источник…». Она позволяет менять голос без сохранения в библиотеку. Отношение частоты × допускает любые дроби. Уровень 0 выключает голос; сумма нормируется, когда сумма уровней больше 100%. Эффекты и фильтры дорожки общие. Из многослойного пресета берётся только основной голос; сэмпл для транспозиции должен быть тональным.",
    "en": "Combine the main voice with up to three layers: for example, a sub, a percussive attack and noise. Choose factory or saved presets. Click a layer’s name to open its envelope and source editor; no intermediate library save is needed. Frequency ratios can be fractional. Level 0 silences a voice; gains are normalized when their sum exceeds 100%. Track effects and filtering are shared. A layered preset contributes only its main voice. Enable pitched sample playback for frequency-based transposition."
  },
  "cards.amplitudeShape": {
    "ru": "форма амплитуды",
    "en": "amplitude shape"
  },
  "cards.theSimpleEnvelopeSetsAttackPeakHold": {
    "ru": "Простая огибающая задаёт атаку, удержание пика и спад. Режим «по точкам» позволяет сделать несколько атак или пауз внутри ноты. Переключение можно отменить через Ctrl+Z.",
    "en": "The simple envelope sets attack, peak hold and decay. Breakpoint mode creates multiple attacks or pauses within a note. Ctrl+Z undoes the mode change."
  },
  "cards.multiSegmentEnvelopeMSEG": {
    "ru": "огибающая по точкам (MSEG)",
    "en": "multi-segment envelope (MSEG)"
  },
  "cards.chooseAShapeOrDoubleClickTo": {
    "ru": "Выбери форму или добавь точки двойным кликом. Точки можно перетаскивать или задавать числами; ручка изгиба меняет переход. Без удержания форма растягивается на ноту, а при незаданной длине используется время в секундах. Точка удержания ждёт конца ноты, после неё идёт релиз. Цикл «туда-обратно» добавляет пульсацию. У амплитуды начало и конец нулевые. Высота и локальный фильтр имеют отдельные формы со свободными краями и размахом в октавах. Амплитудная MSEG заменяет простую огибающую и ограничивает хвосты операторов; хвосты эффектов остаются.",
    "en": "Choose a shape or double-click to add points. Drag points or enter numeric values; the curve knob shapes each transition. Without a sustain point, the shape stretches to the note, or uses the duration in seconds when note length is unspecified. A sustain point waits for note end, followed by release. A ping-pong loop adds pulsation. Amplitude starts and ends at zero; pitch and local filter use separate shapes with free endpoints and an amount in octaves. Amplitude MSEG replaces the simple envelope and limits operator tails; effect tails remain."
  },
  "cards.auditionAnInstrument": {
    "ru": "послушать инструмент",
    "en": "audition an instrument"
  },
  "cards.playOneNoteInThePresetS": {
    "ru": "Кнопка ▶ играет одну ноту в характерном регистре этого пресета. Частота, строй и громкость выбранной дорожки не мешают прослушиванию; сама дорожка не меняется.",
    "en": "Play one note in the preset’s recommended register. The selected track’s pitch, tuning and level do not affect auditioning, and the track is unchanged."
  },
  "cards.libraryAuditionFrequency": {
    "ru": "частота для библиотеки",
    "en": "library audition frequency"
  },
  "cards.theSoundAuditionButtonUsesThisFrequency": {
    "ru": "На этой частоте кнопка ▶ тембр показывает характер инструмента. Она сохраняется в пресете. Это не настройка тоники партии и не частота исходной записи сэмпла. Для изменения высоты сэмпла нужен тональный режим; скрэтч следует жесту.",
    "en": "The sound audition button uses this frequency to show the instrument’s character. It is saved in the preset. It does not set the track’s root or the source recording’s pitch. Samples need pitched mode for transposition; scratch follows its gesture."
  },
  "cards.auditionInTheClip": {
    "ru": "проверить в партии",
    "en": "audition in the clip"
  },
  "cards.hearTheInstrumentAtTheLowestRow": {
    "ru": "Слышишь инструмент на нижней строке строя этой дорожки, с её громкостью и длиной ноты. Полезно сравнить новый тембр с текущей партией. Неприменённый черновик волны тоже слышен.",
    "en": "Hear the instrument at the lowest row of this track’s tuning, with its level and note duration. Useful for comparing a sound with your part. An unapplied waveform draft is also included in auditioning."
  },
  "cards.auditionForTheLibrary": {
    "ru": "проверить для библиотеки",
    "en": "audition for the library"
  },
  "cards.playOneNoteAtTheAuditionFrequency": {
    "ru": "Одна нота на частоте «для библиотеки»: без строя и громкости дорожки. Подбери характерный регистр перед сохранением инструмента; черновик волны можно прослушать до применения.",
    "en": "Play one note at the audition frequency, independently of the track’s tuning and level. Choose a representative register before saving the instrument. Waveform drafts can be auditioned before applying."
  },
  "cards.glideAndVoiceChoking": {
    "ru": "скольжение и глушение",
    "en": "glide and voice choking"
  },
  "cards.newNoteCutsOffPreviousPreventsOverlapping": {
    "ru": "«Новая нота глушит предыдущую» убирает наложение хвостов, например у баса. Группа глушения связывает несколько дорожек: закрытый хэт может остановить открытый. При одновременных атаках выигрывает больший приоритет, затем нижняя дорожка.",
    "en": "“New note cuts off previous” prevents overlapping tails, for example in a bass line. A choke group links tracks so a closed hi-hat can stop an open one. Simultaneous attacks favor higher priority, then the lower track in the list."
  },
  "cards.glidePortamento": {
    "ru": "портаменто — скольжение высоты",
    "en": "glide (portamento)"
  },
  "cards.timeForASmoothPitchTransitionTo": {
    "ru": "Время плавного перехода к следующей ноте, в миллисекундах. 0 выключает скольжение. Работает для одиночных нот с включённым глушением; аккорды и скрэтч не скользят. Огибающая каждой ноты начинается заново.",
    "en": "Time for a smooth pitch transition to the next note, in milliseconds. 0 disables glide. It works for single notes with voice choking enabled; chords and scratch do not glide. Each note retriggers its envelope."
  },
  "cards.sampleSlicing": {
    "ru": "нарезка сэмпла",
    "en": "sample slicing"
  },
  "cards.saveTheSelectionAsASliceOr": {
    "ru": "Сохрани выделенный участок или раздели запись на равные фрагменты. Кнопка «новый эскиз» сразу раскладывает их по шагам; отдельно фрагмент выбирается в свойствах ноты. Исходная запись не меняется. Удалённый фрагмент оставляет назначенную ему ноту без звука до выбора другого фрагмента или обычного источника.",
    "en": "Save the selection as a slice or divide the recording into equal slices. “New clip” places them on consecutive steps; you can also choose a slice in a note’s properties. The original recording is unchanged. Deleting a slice leaves its assigned notes silent until you choose another slice or the normal source."
  },
  "cards.perNoteSound": {
    "ru": "тембр отдельной ноты",
    "en": "per-note sound"
  },
  "cards.changeAParameterSuchAsDecayOr": {
    "ru": "Здесь можно изменить, например, спад или унисон только у выбранной ноты. Остальные ноты сохранят обычный звук. Добавь параметр, задай значение; «снять» вернёт управление инструменту. До восьми параметров на ноту и её повторы; FX и фильтр дорожки остаются общими.",
    "en": "Change a parameter such as decay or unison for only the selected note. Other notes keep the normal sound. Add a parameter and set its value; remove it to return control to the instrument. Up to eight parameters per note, including its repeats. Track effects and filtering remain shared."
  },
  "cards.transport": {
    "ru": "▶ / ■ — транспорт",
    "en": "▶ / ■ — transport"
  },
  "cards.startOrStopTheWholeProjectYou": {
    "ru": "Пуск и остановка всего проекта. Во время воспроизведения можно редактировать; движок подхватывает правки на ходу.",
    "en": "Start or stop the whole project. You can edit during playback; the engine picks up changes as it plays."
  },
  "cards.tempo": {
    "ru": "темп",
    "en": "tempo"
  },
  "cards.beatsPerMinuteYouCanChangeTempo": {
    "ru": "Удары в минуту. Меняется на ходу: часы треков пере-якорятся, позиции не сбиваются.",
    "en": "Beats per minute. You can change tempo during playback: track clocks are re-anchored without losing their positions."
  },
  "cards.projectName": {
    "ru": "название проекта",
    "en": "project name"
  },
  "cards.theProjectNameIsAlsoTheBasis": {
    "ru": "Имя проекта — оно же основа имён файлов экспорта (wav, json, zip). Патч сохраняется сам.",
    "en": "The project name is also the basis for exported WAV, JSON and ZIP filenames. The patch saves automatically."
  },
  "cards.sceneSequence": {
    "ru": "цепочка",
    "en": "scene sequence"
  },
  "cards.arrangeScenesInOrderAndSetTheir": {
    "ru": "Арранжмент: порядок сцен и их длины в тактах, от начала до конца пьесы.",
    "en": "Arrange scenes in order and set their lengths in bars, from the start to the end of the piece."
  },
  "cards.mixer": {
    "ru": "микшер",
    "en": "mixer"
  },
  "cards.trackLevelsPanAndGlobalTrackSwitches": {
    "ru": "Рэк: громкости и паны дорожек, полные выключатели, мастер — шум и компрессия.",
    "en": "Track levels, pan and global track switches, plus master noise and compression."
  },
  "cards.instruments": {
    "ru": "инструменты",
    "en": "instruments"
  },
  "cards.instrumentPresetsAndSamplesInTheLeft": {
    "ru": "Пресеты тембров и сэмплы в одной панели слева: дерево по категориям, поиск, прослушивание до применения.",
    "en": "Instrument presets and samples in the left panel: categories, search and auditioning before application."
  },
  "cards.file": {
    "ru": "файл",
    "en": "file"
  },
  "cards.createOrOpenAProjectSaveA": {
    "ru": "Новый и открытие проекта, сохранение ZIP со всеми записями, экспорт WAV или JSON. Импорт отдельного инструмента не заменяет проект.",
    "en": "Create or open a project, save a ZIP with all recordings, or export WAV or JSON. Importing a single instrument does not replace the project."
  },
  "cards.help": {
    "ru": "«?» — помощь",
    "en": "“?” — help"
  },
  "cards.turnOnTheHelpCursorThenSelect": {
    "ru": "Включает справочный курсор: выбери элемент и прочитай, что он делает и как им пользоваться. Пошаговые задачи доступны в меню «Справка → Пошаговые гиды».",
    "en": "Turn on the help cursor, then select an element to learn what it does and how to use it. Step-by-step tasks are available under Help → Step-by-step guides."
  },
  "cards.scenes": {
    "ru": "сцены",
    "en": "scenes"
  },
  "cards.sectionsOfAPieceEachSelectingOne": {
    "ru": "Части пьесы: снимки ансамбля — по партии на каждый трек. Клик играет сцену.",
    "en": "Sections of a piece, each selecting one clip per track. Click to select a scene for playback."
  },
  "cards.scene": {
    "ru": "+ сцена",
    "en": "+ scene"
  },
  "cards.createASceneFromTheCurrentScene": {
    "ru": "Новая сцена — снимок текущей: все партии, как слышно сейчас.",
    "en": "Create a scene from the current scene’s clip assignments."
  },
  "cards.sceneName": {
    "ru": "имя сцены",
    "en": "scene name"
  },
  "cards.renameOrDeleteAScene": {
    "ru": "Переименовать или удалить сцену.",
    "en": "Rename or delete a scene."
  },
  "cards.sequence": {
    "ru": "цепочка ▸",
    "en": "sequence ▸"
  },
  "cards.enableAutomaticProgressionThroughTheSceneList": {
    "ru": "Включить авто-переход по списку сцен: сцены идут сами по своим тактам.",
    "en": "Enable automatic progression through the scene list, following each entry’s bar count."
  },
  "cards.sceneSequencePanel": {
    "ru": "панель цепочки",
    "en": "scene sequence panel"
  },
  "cards.tilesReadLeftToRightThenRow": {
    "ru": "Плитки читаются слева направо, затем по строкам: сверху сцена, снизу такты и BPM. Общий темп наследуется от проекта, свой задаётся для конкретного вхождения. Меняй порядок за ручку с точками слева или кнопками со стрелками.",
    "en": "Tiles read left to right, then row by row: scene name above, bars and BPM below. Shared tempo follows the project; custom tempo belongs to this sequence entry. Reorder with the dotted handle on the left or the arrow buttons."
  },
  "cards.track": {
    "ru": "+ трек",
    "en": "+ track"
  },
  "cards.addATrackWithASineWave": {
    "ru": "Новая дорожка: синус и 12 полутонов; панель инструментов сразу предложит тембр — можно закрыть и остаться на дефолте.",
    "en": "Add a track with a sine wave and 12 equal-tempered semitones. The instrument browser opens so you can choose a sound, or close it to keep the default."
  },
  "cards.collapse": {
    "ru": "▾ свернуть",
    "en": "▾ collapse"
  },
  "cards.collapseTheTrackCardToASingle": {
    "ru": "Карточка дорожки сворачивается в строку — удобно, когда треков много.",
    "en": "Collapse the track card to a single row, useful when many tracks are open."
  },
  "cards.trackName": {
    "ru": "имя дорожки",
    "en": "track name"
  },
  "cards.typeANameDirectlyInThisField": {
    "ru": "Пиши прямо сюда.",
    "en": "Type a name directly in this field."
  },
  "cards.sSceneSolo": {
    "ru": "S — соло сцены",
    "en": "S — scene solo"
  },
  "cards.hearOnlyThisTrackInTheCurrent": {
    "ru": "В этой сцене слышна только эта дорожка. Живёт на сцене, не переносится на другие.",
    "en": "Hear only this track in the current scene. The solo setting belongs to that scene and does not carry over to others."
  },
  "cards.clipTrackInstrument": {
    "ru": "эскиз / трек / инструмент",
    "en": "clip / track / instrument"
  },
  "cards.chooseWhichPartOfTheTrackCard": {
    "ru": "Переключатель сущности карточки: партия (ноты), сведение дорожки (громкость, эффекты) или большой редактор тембра инструмента.",
    "en": "Choose which part of the track card to edit: clip notes, track mixing and effects, or the instrument’s sound."
  },
  "cards.instrumentBadge": {
    "ru": "чип инструмента",
    "en": "instrument badge"
  },
  "cards.theTrackSCurrentSoundNameAlso": {
    "ru": "Имя текущего тембра дорожки — видно и в свёрнутой карточке. Клик — панель инструментов, подсветит текущий пресет.",
    "en": "The track’s current sound name, also visible when collapsed. Click to open the browser and highlight its preset."
  },
  "cards.clipBadges": {
    "ru": "чипы эскизов",
    "en": "clip badges"
  },
  "cards.reusablePartsForThisTrackTheScene": {
    "ru": "Партии дорожки: какой эскиз играет — решает сцена. Правый клик — копия-вариация.",
    "en": "Reusable parts for this track. The scene chooses which one plays. Right-click to make a variation copy."
  },
  "cards.clip": {
    "ru": "+ эскиз",
    "en": "+ clip"
  },
  "cards.createAnEmptyClipOnThisTrack": {
    "ru": "Новый пустой эскиз дорожки.",
    "en": "Create an empty clip on this track."
  },
  "cards.mMuteInThisScene": {
    "ru": "M — мьют в этой сцене",
    "en": "M — mute in this scene"
  },
  "cards.silenceThisTrackSSlotInThe": {
    "ru": "Дорожка молчит, пока сцена держит этот эскиз; в других сценах он играет. Часы идут — снимешь мьют, войдёшь в фазе.",
    "en": "Silence this track’s slot in the current scene. The clip can still play in other scenes. Its clock keeps running, so unmuting returns in phase."
  },
  "cards.cycleLength": {
    "ru": "длина цикла",
    "en": "cycle length"
  },
  "cards.numberOfStepsInTheClipS": {
    "ru": "Число шагов в цикле эскиза. Разные длины создают независимые повторяющиеся рисунки; их соотношение зависит также от длительности шага.",
    "en": "Number of steps in the clip’s cycle. Different lengths create independent repeating patterns; their relationship also depends on step duration."
  },
  "cards.stepDuration": {
    "ru": "шаг",
    "en": "step duration"
  },
  "cards.clipStepDuration11618": {
    "ru": "Длительность шага эскиза: 1/16, 1/8, длительности с точкой и другие отношения. Длительность с точкой в полтора раза больше исходной; сочетание разных шагов меняет взаимное движение циклов.",
    "en": "Clip step duration: 1/16, 1/8, dotted values and other ratios. A dotted duration is one and a half times the original. Different step durations change how cycles move against each other."
  },
  "cards.clipPanel": {
    "ru": "плашка эскиза",
    "en": "clip panel"
  },
  "cards.everythingAboutThePartClipsControlsNote": {
    "ru": "Всё о партии: эскизы, регуляторы, нотная сетка и автоматизация — кривые и модуляции.",
    "en": "Everything about the part: clips, controls, note grid and automation curves or modulation."
  },
  "cards.noteGrid": {
    "ru": "нотная сетка",
    "en": "note grid"
  },
  "cards.columnsAreCycleStepsRowsArePitches": {
    "ru": "Столбцы — шаги цикла, строки — высоты строя. Клик добавляет ноту, несколько нот в столбце дают аккорд. Тяни ноту для переноса, правый клик удаляет, колесо меняет силу ноты.",
    "en": "Columns are cycle steps; rows are pitches from the tuning. Click to add a note; multiple notes in a column form a chord. Drag to move, right-click to delete, and use the wheel to change velocity."
  },
  "cards.noteGridRows": {
    "ru": "строки нотной сетки",
    "en": "note-grid rows"
  },
  "cards.ratiosToTheRootFrequency15": {
    "ru": "Отношения к основной частоте: ×1,5 — чистая квинта, ×2 — октава. Строй может выходить за пределы 12 равномерных полутонов.",
    "en": "Ratios to the root frequency: ×1.5 is a perfect fifth, ×2 an octave. Tunings are not limited to 12 equal-tempered semitones."
  },
  "cards.octaves": {
    "ru": "октавы",
    "en": "octaves"
  },
  "cards.theOctaveButtonsAddOrRemoveRows": {
    "ru": "+окт/− добавляют и убирают октавы по краям стана — это диапазон, где живут ноты. ▲/▼ между ними просто листают окно стана: ноты и диапазон не меняются, высота окна и шаг — поля «высота» и «лист» в тулбаре стана.",
    "en": "+oct/− add and remove octaves at the grid edges — the range where notes can live. The ▲/▼ arrows between them only scroll the window: notes and the range stay put; the window height and scroll step are the 'height' and 'scroll' fields in the grid toolbar."
  },
  "cards.staffHeight": {
    "ru": "высота стана",
    "en": "grid height"
  },
  "cards.visibleRowsOfTheGridHowManyRows": {
    "ru": "Сколько строк нотного стана видно одновременно: настройка вида, а не патч — общая для дорожек, сохраняется между сессиями. Число не меньше диапазона трека раскрывает стан целиком.",
    "en": "How many note-grid rows are visible at once: a view setting, not part of the patch — shared across tracks and persisted. A number beyond the track's range shows the whole grid."
  },
  "cards.scrollingStep": {
    "ru": "шаг листания",
    "en": "scroll step"
  },
  "cards.howManyRowsTheUpDownArrows": {
    "ru": "Сколько строк стана проезжает за одно нажатие ▲/▼ у краёв стана. По умолчанию — октава текущей шкалы. Листание никогда не меняет ноты или диапазон.",
    "en": "How many rows the ▲/▼ arrows at the grid edges scroll per press. Defaults to the current scale's octave. Scrolling never changes notes or the range."
  },
  "cards.noteGridToolbar": {
    "ru": "панель нотной сетки",
    "en": "note-grid toolbar"
  },
  "cards.tuningAndRootFrequencyNoteDurationAnd": {
    "ru": "Строй и основная частота, длина ноты и фаза, высота стана и шаг листания, генерация и мутация рисунка.",
    "en": "Tuning and root frequency, note duration and phase, grid height and scroll step, pattern generation and mutation."
  },
  "cards.pitchScale": {
    "ru": "шкала",
    "en": "pitch scale"
  },
  "cards.chooseATuningFromTheSearchableList": {
    "ru": "Строй стана: выпадашка с поиском — мировые строи, N равных ступеней, свои дроби.",
    "en": "Choose a tuning from the searchable list, divide an octave into N equal steps, or enter your own ratios."
  },
  "cards.rootFrequency": {
    "ru": "основная частота",
    "en": "root frequency"
  },
  "cards.frequencyInHertzFromWhichTheTuning": {
    "ru": "Частота в герцах, от которой рассчитываются остальные высоты строя. Низкие значения подходят басу, более высокие — верхним партиям. Это не FM-несущая и не обязательно тоника тональности.",
    "en": "Frequency in hertz from which the tuning’s other pitches are calculated. Low values suit bass parts; higher values suit upper registers. This is not an FM carrier or necessarily a tonal tonic."
  },
  "cards.phase": {
    "ru": "фаза",
    "en": "phase"
  },
  "cards.offsetTheCycleInStepsKeepThe": {
    "ru": "Сдвиг цикла в шагах: тот же рисунок, но стартует позже — треки расползаются по такту.",
    "en": "Offset the cycle in steps: keep the same pattern but change where it starts relative to other tracks."
  },
  "cards.automation": {
    "ru": "автоматизация",
    "en": "automation"
  },
  "cards.chooseAParameterInThePanelBelow": {
    "ru": "Панель под станом: вкладка выбирает параметр, дальше два способа — кривая точками по шагам цикла или модуляция «формулой» (LFO, шумы). «→ в кривую» запекает модуляцию точками.",
    "en": "Choose a parameter in the panel below the note grid, then use a step-based breakpoint curve or a modulation source such as LFO or noise. “→ to curve” bakes modulation into points."
  },
  "cards.fill": {
    "ru": "заполнить",
    "en": "fill"
  },
  "cards.generateAPatternByChoosingTimingAnd": {
    "ru": "Генерация узора: время и тон по кнопкам, мутация с уровнем, очистка.",
    "en": "Generate a pattern by choosing timing and pitch rules, mutate it with adjustable intensity, or clear it."
  },
  "cards.patternTools": {
    "ru": "инструменты заполнения",
    "en": "pattern tools"
  },
  "cards.chooseTheNoteCountEvenlySpacedOr": {
    "ru": "Нот N, время: равномерно/случайно; тон: лестница/случайно/×1; мутация и очистка.",
    "en": "Choose the note count, evenly spaced or random timing, and ascending, random or root-only pitch. Mutation and clear are also available."
  },
  "cards.evenlySpaced": {
    "ru": "равномерно",
    "en": "evenly spaced"
  },
  "cards.euclideanPlacementOfNNotesAroundA": {
    "ru": "Евклидово раскладывание N нот по циклу: 3 по 8 — тресильо.",
    "en": "Euclidean placement of N notes around a cycle. Three hits across eight steps gives a tresillo pattern."
  },
  "cards.mutate": {
    "ru": "мутировать",
    "en": "mutate"
  },
  "cards.applyRandomEditsAlongTheEnabledDimensions": {
    "ru": "Щепотка случайных правок по включённым осям: слушай — оставляй или снова.",
    "en": "Apply random edits along the enabled dimensions. Listen, keep the result or try again."
  },
  "cards.clear": {
    "ru": "очистить",
    "en": "clear"
  },
  "cards.removeEveryNoteFromThisClipCtrl": {
    "ru": "Убрать все ноты этого эскиза. Ctrl+Z вернёт.",
    "en": "Remove every note from this clip. Ctrl+Z restores them."
  },
  "cards.stepPanel": {
    "ru": "панель шага",
    "en": "step panel"
  },
  "cards.velocityTriggerProbabilityAndDurationForEach": {
    "ru": "Сила, вероятность срабатывания и длительность каждой ноты шага.",
    "en": "Velocity, trigger probability and duration for each note on the step."
  },
  "cards.instrumentEditor": {
    "ru": "редактор инструмента",
    "en": "instrument editor"
  },
  "cards.editTheMainSourceOperatorsFMWavetable": {
    "ru": "Редактор тембра: основной источник — операторы/FM, wavetable, VA или сэмпл; до трёх дополнительных голосов, огибающая и окраска. Пресет из панели инструментов переставляет эти же ручки.",
    "en": "Edit the main source — operators/FM, wavetable, VA or sample — plus up to three additional voices, envelopes and coloration. Applying a browser preset changes these same controls."
  },
  "cards.source": {
    "ru": "источник",
    "en": "source"
  },
  "cards.chooseSynthesisOrSamplePlaybackOperatorSynthesis": {
    "ru": "Волна или сэмпл. Волна — таблица строк-операторов со всеми гармониками тембра: правки — черновиком, «применить» делает их инструментом.",
    "en": "Choose synthesis or sample playback. Operator synthesis uses a table of partials and modulation routes. Waveform edits remain a draft until you apply them."
  },
  "cards.waveformOrSample": {
    "ru": "волна или сэмпл",
    "en": "waveform or sample"
  },
  "cards.chooseAnOperatorBasedSoundOrA": {
    "ru": "Источник тембра: таблица строк-операторов — или сэмпл из библиотеки. Возврат со сэмпла восстановит прежнюю таблицу.",
    "en": "Choose an operator-based sound or a library sample. Switching back from a sample restores the previous operator setup."
  },
  "cards.envelope": {
    "ru": "огибающая",
    "en": "envelope"
  },
  "cards.attackPeakHoldAndDecayOrA": {
    "ru": "Атака, удержание пика и спад либо амплитудная огибающая по точкам (MSEG). Здесь же доступны независимые огибающие высоты и локального фильтра.",
    "en": "Attack, peak hold and decay, or a breakpoint amplitude envelope (MSEG). Independent pitch and local-filter envelopes are also available here."
  },
  "cards.timbre": {
    "ru": "тембр",
    "en": "timbre"
  },
  "cards.filtersAndTheirEnvelopePlusTheTrack": {
    "ru": "Фильтры (с огибающей) и арпеджиатор; вибрато и унисон — правой панелью на «источнике».",
    "en": "Filters and their envelope, plus the track arpeggiator. Unison and vibrato are on the source tab."
  },
  "cards.saveInstrument": {
    "ru": "сохранить инструмент",
    "en": "save instrument"
  },
  "cards.saveTheCurrentSoundAndAuditionFrequency": {
    "ru": "Сохранить текущий тембр и частоту прослушивания в «мои». Черновик волны тоже сохранится; чтобы изменить звучание партии, отдельно нажми «применить».",
    "en": "Save the current sound and audition frequency under my instruments. The waveform draft is also saved; separately click apply to use it in the playing clip."
  },
  "cards.sampleSlot": {
    "ru": "слот сэмпла",
    "en": "sample slot"
  },
  "cards.chooseAStoredSampleOrImportA": {
    "ru": "Выбрать из хранилища сэмплов или загрузить файл; режимы и обрезка — ниже на этой же вкладке.",
    "en": "Choose a stored sample or import a file. Playback modes and region trimming are below on the same tab."
  },
  "cards.sampleMode": {
    "ru": "режим сэмпла",
    "en": "sample mode"
  },
  "cards.directPlaysTheRecordingGranularCreatesA": {
    "ru": "Прямой — плеер; гранулярный — облако осколков; скрэтч — жест иглы.",
    "en": "Direct plays the recording; granular creates a cloud of fragments; scratch follows a needle gesture."
  },
  "cards.filters": {
    "ru": "фильтры",
    "en": "filters"
  },
  "cards.lowCutAndHighCutControlsWith": {
    "ru": "Крутилки: обрезка низа/верха (лог-шкала), резонанс, огибающая фильтра.",
    "en": "Low-cut and high-cut controls with logarithmic frequency scales, resonance and filter envelope."
  },
  "cards.unison": {
    "ru": "унисон",
    "en": "unison"
  },
  "cards.detunedCopiesThickenAndWidenANote": {
    "ru": "N расстроенных копий ноты — любой волны и сэмпла: жирнее и шире (супер-пила = пила + унисон). Разброс — по каналам.",
    "en": "Detuned copies thicken and widen a note. Sawtooth plus unison creates a supersaw. Stereo spread distributes voices between channels; sample playback modes apply unison differently."
  },
  "cards.formants": {
    "ru": "форманты",
    "en": "formants"
  },
  "cards.resonantSpectralRegionsAtFixedFrequenciesGive": {
    "ru": "Резонансные области спектра на заданных частотах придают гласную окраску независимо от высоты ноты. Пустой список выключает формантную обработку.",
    "en": "Resonant spectral regions at fixed frequencies give vowel-like color independently of note pitch. An empty list disables formant processing."
  },
  "cards.waveformRecipe": {
    "ru": "заготовка волны",
    "en": "waveform recipe"
  },
  "cards.buildADraftOperatorSetupFromA": {
    "ru": "Пересобрать таблицу строк из готового тембра (колокол, струна, FM, орган…) — ляжет черновиком, огибающая остаётся.",
    "en": "Build a draft operator setup from a sound recipe such as bell, string, FM or organ, while keeping the note envelope."
  },
  "cards.arpeggiator": {
    "ru": "арпеджиатор",
    "en": "arpeggiator"
  },
  "cards.playTheChordOnAStepOne": {
    "ru": "Аккорд шага играет по нотке — вверх, вниз, случайно. Свойство дорожки.",
    "en": "Play the chord on a step one note at a time, for example ascending, descending or randomly. This is a track-level setting."
  },
  "cards.enableChordPlaybackAsAnArpeggio": {
    "ru": "Включить дробление аккордов в фигуры.",
    "en": "Enable chord playback as an arpeggio."
  },
  "cards.arpeggioOrder": {
    "ru": "тип арпеджио",
    "en": "arpeggio order"
  },
  "cards.chooseTheFigureSNoteOrderUp": {
    "ru": "Фигура перелива: вверх, вниз, вверх-вниз, как сыграно, случайно.",
    "en": "Choose the figure’s note order: up, down, up/down, as played or random."
  },
  "cards.subdivision": {
    "ru": "дробление",
    "en": "subdivision"
  },
  "cards.numberOfEqualSubdivisionsWithinTheOriginal": {
    "ru": "Число равных частей внутри исходной ноты, по которым движется арпеджио.",
    "en": "Number of equal subdivisions within the original note over which the arpeggio plays."
  },
  "cards.aiGeneration": {
    "ru": "ИИ-генерация",
    "en": "AI generation"
  },
  "cards.describeASoundToGenerateASample": {
    "ru": "Опиши звук словами — сэмпл сгенерируется и сядет в слот.",
    "en": "Describe a sound to generate a sample and assign it to the slot."
  },
  "cards.trackPanel": {
    "ru": "панель трека",
    "en": "track panel"
  },
  "cards.trackMixingLevelPanVoiceChokingEffects": {
    "ru": "Сведение дорожки: громкость, панорама, глушение предыдущих нот, эффекты и сайдчейн. Строй и время партии — на панели нотной сетки.",
    "en": "Track mixing: level, pan, voice choking, effects and sidechain. Tuning and clip timing are in the note-grid toolbar."
  },
  "cards.general": {
    "ru": "общее",
    "en": "general"
  },
  "cards.trackLevelAndPanApplyToAll": {
    "ru": "Громкость/пан трека — общие для всех эскизов; моно-режим.",
    "en": "Track level and pan apply to all its clips, along with the monophonic voice setting."
  },
  "cards.effect": {
    "ru": "+ эффект",
    "en": "+ effect"
  },
  "cards.addDelayReverbChorusDistortionBitcrusherOr": {
    "ru": "Добавить обработку в цепочку дорожки: дилей, реверберацию, хорус, дисторшн, биткрашер или эквалайзер.",
    "en": "Add delay, reverb, chorus, distortion, bitcrusher or EQ to the track’s effects chain."
  },
  "cards.trackEffects": {
    "ru": "эффекты дорожки",
    "en": "track effects"
  },
  "cards.rowsShowProcessingOrderDragTheHandle": {
    "ru": "Порядок строк — цепочка, тяни за ⠿. Эффекты общие для всех эскизов дорожки.",
    "en": "Rows show processing order; drag the handle to reorder them. Effects are shared by all clips on this track."
  },
  "cards.modulation": {
    "ru": "+ модуляция",
    "en": "+ modulation"
  },
  "cards.addAnLFOSampleAndHoldOr": {
    "ru": "Добавляет источник LFO, S&H или шум Перлина для движения выбранного параметра.",
    "en": "Add an LFO, sample-and-hold or Perlin-noise source to move the selected parameter."
  },
  "cards.parameterModulation": {
    "ru": "модуляции вкладки",
    "en": "parameter modulation"
  },
  "cards.setRateAndDepthWithKnobsSync": {
    "ru": "Скорость и глубина — крутилками; «синхр» — скорость по темпу; «→ в кривую» запекает ход точками на дорожке под станом.",
    "en": "Set rate and depth with knobs. Sync follows the tempo; “→ to curve” bakes the motion into points below the note grid."
  },
  "cards.modulationSource": {
    "ru": "источник модуляции",
    "en": "modulation source"
  },
  "cards.lfoIsAPeriodicWaveformSuchAs": {
    "ru": "LFO — периодическая волна (синус, пила…), ровная и предсказуемая. Ступени S&H (sample & hold) — случайное значение держится мгновение и прыгает: лестница. Перлин — плавно блуждающий шум: случайные холмы без скачков.",
    "en": "LFO is a periodic waveform such as sine or sawtooth. Sample and hold keeps a random value until the next jump, creating steps. Perlin noise moves smoothly through random-looking hills without abrupt jumps."
  },
  "cards.sceneFadeIn": {
    "ru": "вход в сцену",
    "en": "scene fade-in"
  },
  "cards.fadeInThePartTogetherWithIts": {
    "ru": "Плавное появление партии вместе с её эффектами. Работает независимо от фейдера и кривой громкости. Если вход и выход не помещаются в сцену, они пропорционально сокращаются.",
    "en": "Fade in the part together with its track effects, independently of the fader and volume curve. If fade-in and fade-out exceed scene length, both are shortened proportionally."
  },
  "cards.sceneFadeOut": {
    "ru": "выход из сцены",
    "en": "scene fade-out"
  },
  "cards.fadeThePartAndItsTrackEffects": {
    "ru": "Уводит партию и её локальные эффекты к границе сцены. Следующая сцена запускает новую цепочку дорожки; хвост общей шины реверберации может продолжаться. Даже при нуле остаётся защитный спад 5 мс.",
    "en": "Fade the part and its track effects toward the scene boundary. The next scene starts a new track chain; the shared reverb tail can continue. Even a zero setting keeps a protective 5 ms fade."
  },
  "cards.editorTabs": {
    "ru": "вкладки редактора",
    "en": "editor tabs"
  },
  "cards.sourceEnvelopeAndTimbreGroupTheInstrument": {
    "ru": "Источник (таблица строк-операторов или сэмпл), огибающая, тембр — ручки инструмента.",
    "en": "Source, envelope and timbre group the instrument’s sound controls."
  },
  "cards.sampleWaveform": {
    "ru": "волна сэмпла",
    "en": "sample waveform"
  },
  "cards.dragToSelectARegionUseRegion": {
    "ru": "Выдели кусок мышью — «оставить кусок» обрежет сэмпл.",
    "en": "Drag to select a region. Use region makes the instrument play that part of the sample."
  },
  "cards.harmonicAnalysis": {
    "ru": "разложить в гармоники",
    "en": "harmonic analysis"
  },
  "cards.convertTheSampleSAverageFFTSpectrum": {
    "ru": "FFT-слепок сэмпла → черновик таблицы строк: сравни с звучащим и примени.",
    "en": "Convert the sample’s average FFT spectrum into a draft operator setup. Compare it with the recording before applying; this does not reconstruct all details of the source."
  },
  "cards.waveformDraft": {
    "ru": "черновик волны",
    "en": "waveform draft"
  },
  "cards.drawAShapeOnTheCanvasTo": {
    "ru": "«Рисовать форму» — мышью поверх канваса (разложится в строки). Правки — в черновике: «▶ нота» в шапке слушает его, «применить» делает таблицей инструмента.",
    "en": "Draw a shape on the canvas to decompose it into operator rows. Edits stay in the draft. Audition it in the editor, then apply to make it the instrument’s waveform."
  },
  "cards.operatorRows": {
    "ru": "строки-операторы",
    "en": "operator rows"
  },
  "cards.eachRowHasAFrequencyRatioTo": {
    "ru": "Каждая строка: множитель к ноте (×2 — октава, ×1.5 — квинта), громкость, форма, хвост (звон, переживает ноту) и маршрут — в сумму или модулировать другую строку (FM).",
    "en": "Each row has a frequency ratio to the note, level or modulation depth, waveform, independent tail and routing to the output or another operator’s frequency. ×2 is an octave, ×1.5 a perfect fifth."
  },
  "cards.waveform": {
    "ru": "форма волны",
    "en": "waveform"
  },
  "cards.theSumOfTheOperatorRowsBright": {
    "ru": "Сумма всех строк: яркая линия — черновик, приглушённая — звучащий тембр, пока черновик не применён.",
    "en": "The sum of the operator rows. Bright line is the draft; dim line is the current sound until you apply the draft."
  },
  "cards.unisonVibratoAndFormants": {
    "ru": "унисон, вибрато и форманты",
    "en": "unison, vibrato and formants"
  },
  "cards.sharedColorationControlsIndependentOfIndividualOperators": {
    "ru": "Общие настройки окраски, не привязанные к отдельному оператору. Они не создают дополнительные редактируемые слои инструмента; действие зависит от режима источника.",
    "en": "Shared coloration controls, independent of individual operators. They do not create additional editable instrument layers; their behavior depends on source mode."
  },
  "cards.recordGesture": {
    "ru": "записать жест",
    "en": "record gesture"
  },
  "cards.recordMouseMovementOnThePadA": {
    "ru": "Запись движения мыши по пэду — нота сыграет этот жест иглой.",
    "en": "Record mouse movement on the pad. A note plays back that needle gesture."
  },
  "cards.scratchPad": {
    "ru": "скрэтч-пэд",
    "en": "scratch pad"
  },
  "cards.moveUpwardTowardTheSampleSEnd": {
    "ru": "Веди мышь: вверх — к концу сэмпла, круче наклон — быстрее игла.",
    "en": "Move upward toward the sample’s end. A steeper trajectory means faster needle movement."
  },
  "cards.audition": {
    "ru": "послушать",
    "en": "audition"
  },
  "cards.playTheGestureAsOneNote": {
    "ru": "Жест сыграет нотой.",
    "en": "Play the gesture as one note."
  },
  "cards.renderToSample": {
    "ru": "в сэмпл",
    "en": "render to sample"
  },
  "cards.nameAndRenderASuccessfulGestureTo": {
    "ru": "Назвать и заморозить удачную настройку: жест отрендерится в WAV и ляжет в библиотеку — готовый скрэтч без пэда и точек.",
    "en": "Name and render a successful gesture to WAV in the sample library. The result plays as a finished scratch recording without the pad or points."
  },
  "cards.sampleName": {
    "ru": "имя сэмпла",
    "en": "sample name"
  },
  "cards.appearsWhenRenderingToASampleThe": {
    "ru": "Появляется после «в сэмпл»: файл в библиотеке будет называться ровно так — «ок» сохраняет.",
    "en": "Appears when rendering to a sample. The library file uses this name; OK saves it."
  },
  "cards.instrumentBrowser": {
    "ru": "панель инструментов",
    "en": "instrument browser"
  },
  "cards.presetsAndSamplesHaveSeparateTabsClick": {
    "ru": "Пресеты и сэмплы на двух вкладках: клик по пресету — применить к дорожке, ▶ — послушать в рекомендуемом регистре до применения.",
    "en": "Presets and samples have separate tabs. Click a preset to apply it to the track, or play to audition it at its recommended frequency first."
  },
  "cards.presetsTab": {
    "ru": "вкладка «пресеты»",
    "en": "presets tab"
  },
  "cards.instrumentPresetsGroupedByCategoryStartersAre": {
    "ru": "Пресеты-инструменты по категориям. «Стартовые» — архетипы с рецептом; «мои» — сохранённое тобой.",
    "en": "Instrument presets grouped by category. Starters are basic sound recipes; my instruments contains your saved sounds."
  },
  "cards.samplesTab": {
    "ru": "вкладка «сэмплы»",
    "en": "samples tab"
  },
  "cards.allStoredRecordingsClickANameTo": {
    "ru": "Все сэмплы: клик по имени сажает сэмпл в дорожку как волну «сэмпл».",
    "en": "All stored recordings. Click a name to assign it to the track as a sample source."
  },
  "cards.search": {
    "ru": "поиск",
    "en": "search"
  },
  "cards.searchNamesCategoriesAndDescriptionsForExample": {
    "ru": "По имени, тембру, категории — и по пояснениям («дабстеп» найдёт воббл). Крестик справа очищает.",
    "en": "Search names, categories and descriptions. For example, dubstep finds wobble sounds. The cross clears the query."
  },
  "cards.presets": {
    "ru": "пресеты",
    "en": "presets"
  },
  "cards.collapseCategoriesAsNeededClickAPreset": {
    "ru": "Категории схлопываются. Клик применяет пресет к дорожке из селектора «в дорожку»; текущий пресет дорожки подсвечен.",
    "en": "Collapse categories as needed. Click a preset to apply it to the selected target track. The track’s current preset is highlighted."
  },
  "cards.samples": {
    "ru": "сэмплы",
    "en": "samples"
  },
  "cards.auditionAssignARecordingByClickingIts": {
    "ru": "Все сэмплы: ▶ прослушать, клик по имени — посадить в дорожку, ⭳ скачать, × удалить.",
    "en": "Audition, assign a recording by clicking its name, export it, or delete it."
  },
  "cards.trackChannelsAndTheMasterSection": {
    "ru": "Рэк громкостей: дорожки и мастер.",
    "en": "Track channels and the master section."
  },
  "cards.mixerChannel": {
    "ru": "дорожка в микшере",
    "en": "mixer channel"
  },
  "cards.trackLevelPanAndTheGlobalTrack": {
    "ru": "Громкость, пан, полный выключатель — не зависят от сцен и эскизов.",
    "en": "Track level, pan and the global track switch apply across scenes and clips."
  },
  "cards.master": {
    "ru": "мастер",
    "en": "master"
  },
  "cards.noiseAddsAirOrTapeLikeTexture": {
    "ru": "Шум — воздух и лента; компрессия — плотность. После — мягкий лимитер.",
    "en": "Noise adds air or tape-like texture; compression controls dynamics. A soft limiter follows."
  },
  "cards.aiSettings": {
    "ru": "настройки ИИ",
    "en": "AI settings"
  },
  "cards.chooseAServiceAndProvideItsKey": {
    "ru": "Выбор сервиса и его ключ: ElevenLabs — генерация звуков по описанию, fal.ai — генерация и морфинг сэмпла.",
    "en": "Choose a service and provide its key. ElevenLabs generates sounds from descriptions; fal.ai supports generation and audio-to-audio transformation."
  },
  "cards.aiService": {
    "ru": "сервис ИИ",
    "en": "AI service"
  },
  "cards.elevenlabsGeneratesSoundsFromTextFalAi": {
    "ru": "ElevenLabs — генерация звуков по описанию; fal.ai — генерация и морфинг: преобразование сэмпла в слоте по описанию (audio-to-audio).",
    "en": "ElevenLabs generates sounds from text. fal.ai also transforms a sample from the slot according to a description (audio-to-audio)."
  },
  "cards.aiKey": {
    "ru": "ключ ИИ",
    "en": "AI key"
  },
  "cards.yourPersonalServiceKeyStoredLocally": {
    "ru": "Личный ключ, хранится локально.",
    "en": "Your personal service key, stored locally."
  },
  "cards.findTuning": {
    "ru": "поиск шкалы",
    "en": "find tuning"
  },
  "cards.trySlendroShrutiOrMaqam": {
    "ru": "«слендро», «шрути», «макам»…",
    "en": "Try slendro, shruti or maqam."
  },
  "cards.tuningTools": {
    "ru": "инструменты шкалы",
    "en": "tuning tools"
  },
  "cards.divideAnOctaveIntoNEqualSteps": {
    "ru": "N равных ступеней или своя шкала дробями.",
    "en": "Divide an octave into N equal steps or enter custom frequency ratios."
  }
} as const;
