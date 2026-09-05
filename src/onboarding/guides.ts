// Гиды онбординга: данные сценариев + хранение отметок + шина запуска.
// Принцип для «полного новичка»: один шаг = одно действие. Шаг с expect
// завершается только когда пользователь кликнул подсвеченное; клики мимо
// перехватываются (карточка подсказывает). Текст — одна короткая фраза.

export interface GuideStep {
  /** Цель подсветки (CSS-селектор, обычно data-ob). Нет цели — карточка
   *  по центру (приветствие/финал). */
  target?: string;
  /** Одна короткая фраза: что сделать. */
  say: string;
  /** Вторая строка — только если без неё никак. */
  hint?: string;
  /** Шаг-действие: гид ждёт клик (или правый клик) по цели, клики мимо
   *  блокирует. Без expect — шаг «читать», листается «далее». */
  expect?: 'click' | 'contextmenu';
  /** С какой стороны карточка; по умолчанию сама выберет, где влезет. */
  side?: 'bottom' | 'top' | 'left' | 'right';
  /** Панель, которую надо раскрыть перед этим шагом («mix», «chain», «ai»). */
  open?: string;
  /** Своя надпись кнопке «далее» (приветствие: «поехали»). */
  nextLabel?: string;
}

export interface Guide {
  id: string;
  title: string;
  /** Короткая задача — видно в меню «?». */
  goal: string;
  /** Где в меню: путь музыканта (по порядку работы над треком) или
   *  отдельные умения. */
  section: 'path' | 'more';
  steps: GuideStep[];
}

// Гиды названы от задачи музыканта и идут в порядке работы над треком:
// добавь инструмент → поменяй звук → заполни нотами → сделай вариации →
// собери сцену → навесь эффекты («комната») → под конец сведение
// (шум, компрессия). Отдельные умения (шкалы, сэмплы, ИИ…) — в конце меню.
export const GUIDES: Guide[] = [
  {
    id: 'main',
    title: 'вводный: собери бит',
    goal: 'Пуск → нота → слушаешь. Минуту — и бит твой',
    section: 'path',
    steps: [
      {
        // цели нет — карточка по центру
        say: 'Соберём твой первый бит. Я показываю — ты жмёшь.',
        hint: 'В любой момент можно выйти: Esc или крестик.',
        nextLabel: 'поехали ▶',
      },
      {
        target: '[data-ob="play"]',
        say: 'Нажми ▶ — заиграет музыка.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="play"]',
        say: 'А теперь нажми ■ — останови.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="roll"] .cell',
        say: 'Кликни по клетке — поставишь ноту.',
        hint: 'Клетки — в подсвеченной сетке.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="play"]',
        say: 'Снова ▶ — послушай свою ноту.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scenes"]',
        say: 'Сверху — сцены, части пьесы. Переключай кликом.',
        side: 'bottom',
      },
      {
        target: '[data-ob="help"]',
        say: 'Рядом с любым местом есть «?» — жми, если что.',
        hint: 'Нажми «?» — и вводный закончится.',
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'tracks',
    title: 'добавить инструмент',
    goal: 'Первый звук в проекте: «+ трек» — и он играет',
    section: 'path',
    steps: [
      {
        target: '[data-ob="add-track"]',
        say: 'Жми «+ трек» — дорожка появится сразу, а панель инструментов предложит тембр (можно закрыть и остаться с синусом).',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="track-name"]',
        say: 'Имя дорожки — пиши прямо сюда.',
        side: 'bottom',
      },
      {
        target: '[data-ob="solo"]',
        say: 'Жми S — услышишь только эту дорожку.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mode"]',
        say: 'Переключатель «эскиз / трек / инструмент»: эскиз — ноты партии, трек — общее, инструмент — тембр.',
        side: 'bottom',
      },
      {
        target: '[data-ob="fold"]',
        say: 'Жми ▾ — карточка свернётся в строку.',
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'sound',
    title: 'поменять звук',
    goal: 'Другой тембр, огибающая, свой пресет',
    section: 'path',
    steps: [
      {
        target: '[data-ob="inst-chip"]',
        say: 'Жми чип инструмента в шапке дорожки — панель инструментов.',
        hint: 'Чип всегда под рукой: и в развёрнутой карточке, и в свёрнутой. Панель подсветит текущий пресет.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-cards"] .inst-card',
        say: 'Кликни звук — дорожка заиграет иначе. ▶ слушает тембр ещё до применения.',
        hint: 'Ноты и ритм останутся твоими.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="mode-inst"]',
        say: 'Жми «инструмент» — откроется большой редактор тембра: пресет переставил его ручки, здесь их крутят.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-env"]',
        say: 'Вкладка «огибающая»: удар, плато, спад — и график с кнопкой «послушать».',
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-timbre"]',
        say: 'Вкладка «тембр»: фильтры, вибрато, унисон — крутилками, как на приборе.',
        side: 'bottom',
      },
      {
        target: '[data-ob="save-inst"]',
        say: 'Дискета — твой звук в категорию «мои».',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'roll',
    title: 'заполнить нотами',
    goal: 'Нарисовать ноты, аккорды, перенести',
    section: 'path',
    steps: [
      {
        target: '[data-ob="roll"] .cell',
        say: 'Клик — нота. Ещё клик — убрать.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="roll"] .cell',
        say: 'Столбик клеток — аккорд. Кликни ещё одну строку в том же столбце.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="scale-rows"]',
        say: 'Строки — высоты: отношения к тонике.',
        side: 'left',
      },
      {
        target: '.roll .col-num',
        say: 'Номер шага — громкость и шанс его нот.',
        hint: 'Колесо над нотой — громкость.',
        side: 'top',
      },
      {
        target: '[data-ob="roll"]',
        say: 'Рамка с пустой клетки — выделить. Тянуть — перенести.',
        hint: 'Ctrl+C / V — копипаст, Delete — стереть.',
        side: 'top',
      },
      {
        target: '[data-ob="roll"] .note-bar',
        say: 'Тяни правый край бара — длина ноты.',
        side: 'top',
      },
    ],
  },
  {
    id: 'generators',
    title: 'ноты без рисования',
    goal: 'Узор одной кнопкой, доводка мутацией',
    section: 'path',
    steps: [
      {
        target: '[data-ob="fill-btn"]',
        say: 'Жми «заполнить» — соберёт узор.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fill-even"]',
        say: 'Жми «равномерно» — раскидает ноты по кругу.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fill-mutate"]',
        say: 'Жми «мутировать» — чуть случайных правок. Слушай — оставляй или снова.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fill-clear"]',
        say: '«Очистить» — пустой стан. Ctrl+Z вернёт.',
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'sketches',
    title: 'сделать вариации',
    goal: 'Копия-вариация, свой рисунок и ручки',
    section: 'path',
    steps: [
      {
        target: '[data-ob="chips"]',
        say: 'Чипы — эскизы дорожки: партии. Активный играет.',
        side: 'bottom',
      },
      {
        target: '[data-ob="chip-add"]',
        say: 'Жми + — пустой эскиз.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="chips"] .chip:not(.mute):not(.add):not(.del)',
        say: 'Кликни чип правой кнопкой — будет копия-вариация.',
        expect: 'contextmenu',
        side: 'bottom',
      },
      {
        target: '[data-ob="length"]',
        say: 'Длина — сколько шагов в цикле этой партии.',
        side: 'bottom',
      },
      {
        target: '[data-ob="rate"]',
        say: 'Шаг — скорость ступеней этой партии.',
        side: 'bottom',
      },
      {
        target: '[data-ob="chip-mute"]',
        say: 'Жми M — тишина на этот рисунок.',
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'arp',
    title: 'перелив: арпеджиатор',
    goal: 'Нота дробится на доли — играет фигуру',
    section: 'path',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        say: 'Жми «инструмент» на дорожке — откроется редактор тембра.',
        side: 'bottom',
        hint: 'Арпеджиатор живёт во вкладке «тембр».',

      },
      {
        target: '[data-ob="tab-timbre"]',
        say: 'Жми вкладку «тембр».',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp"]',
        say: 'Поставь аккорд из 2–3 нот и жми галку «арпеджиатор».',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp-mode"]',
        say: 'Тип — фигура перелива: вверх, вниз, случайно…',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp-speed"]',
        say: 'Дробление — на сколько долей делится шаг. Перелив умещается внутри ноты.',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'arrangement',
    title: 'собрать сцену',
    goal: 'Вариации партий — в часть пьесы',
    section: 'path',
    steps: [
      {
        target: '[data-ob="scenes"] .scene-btn',
        say: 'Клик по сцене — играть её.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scene-add"]',
        say: 'Жми + — новая сцена, снимок текущей.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scenes"] .scene-btn',
        say: 'Перетащи сцену за кнопку — поменяешь их порядок.',
        side: 'bottom',
      },
      {
        target: '[data-ob="scene-edit"]',
        say: 'Здесь имя сцены и удаление.',
        side: 'bottom',
      },
      {
        target: '[data-ob="follow-chain"]',
        say: 'Жми «цепочка» — сцены пойдут по списку сами.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="chain-panel"]',
        open: 'chain',
        say: 'Цепочка: порядок сцен и такты. Пункты тоже перетаскиваются.',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'effects',
    title: 'комната: эффекты',
    goal: 'Эхо, реверб, перегруз; порядок = цепочка',
    section: 'path',
    steps: [
      {
        target: '[data-ob="mode-track"]',
        expect: 'click',
        say: 'Жми «трек» на дорожке — там комната эффектов.',
        side: 'bottom',
      },
      {
        target: '[data-ob="fx-add"]',
        say: 'Жми «+ эффект» — добавится в цепочку.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="fx-list"] .mod-row',
        say: 'Порядок строк — цепочка. Тяни за ⠿ — поменяется. Mix — сколько эффекта.',
        side: 'bottom',
      },
      {
        target: '[data-ob="fx-list"]',
        say: 'Эффекты — общие для эскизов дорожки: комната одна.',
        side: 'bottom',
      },
      {
        target: '[data-ob="mode-sketch"]',
        say: 'Вернись к «эскизу» — автоматизация живёт на партии.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="auto-toggle"]',
        say: 'Раскрой «автоматизация» — кривые и модуляции партии.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="mods-add"]',
        say: 'Жми «+ модуляция» — ручка поедет сама.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mods-list"] .mod-row',
        say: 'Крутилки — скорость и глубина; «синхр» — скорость по темпу.',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'mix',
    title: 'сведение: шум, компрессия',
    goal: 'Выровнять микс и дожать мастер',
    section: 'path',
    steps: [
      {
        target: '[data-ob="mixer-btn"]',
        say: 'Жми «микшер» — откроется рэк.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mix-track"]',
        say: 'Дорожка: громкость, пан, полный выключатель.',
        side: 'bottom',
      },
      {
        target: '[data-ob="mix-master"]',
        open: 'mix',
        say: 'Мастер: шум — воздух и лента, компрессия — плотность.',
        side: 'bottom',
      },
      {
        target: '.master-vol',
        say: 'В шапке — общая громкость и пан.',
        side: 'bottom',
      },
    ],
  },

  // ---- Отдельные умения ----
  {
    id: 'auto',
    title: 'автоматизация партии',
    goal: 'Громкость, фильтр, пан — кривой или модуляцией',
    section: 'more',
    steps: [
      {
        target: '[data-ob="auto-toggle"]',
        say: 'Жми «автоматизация» — под станом появятся дорожка кривой и модуляции.',
        expect: 'click',
        side: 'top',
      },
      {
        target: 'svg.auto-lane',
        say: 'Клик по дорожке — точка на границе шага. От двух точек параметр едет по циклу.',
        hint: 'Shift — свободная позиция; правый клик — убрать точку.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '.auto-box .seg button:not(.on)',
        say: 'Переключай параметр: громкость, фильтр, пан — кривая и модуляции у каждого свои.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '.auto-lane [data-ob="fade-in"]',
        say: 'На громкости по краям — рампы входа/выхода сцены: тяни вершину, меняя мягкость вступления.',
        side: 'top',
      },
      {
        target: '[data-ob="mods-add"]',
        say: 'Жми «+ модуляция» — параметр вкладки поедет сам: LFO, ступени или перлин.',
        hint: 'Ход модуляции виден штрихом на дорожке кривой.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="mods-list"] .mod-row',
        say: 'Скорость и глубина — крутилками; «синхр» — по темпу. «→ в кривую» запечёт ход точками — правь руками.',
        side: 'top',
      },
    ],
  },
  {
    id: 'browser',
    title: 'панель инструментов',
    goal: 'Пресеты и сэмплы: найти, послушать, применить',
    section: 'more',
    steps: [
      {
        target: '[data-ob="library-btn"]',
        say: 'Жми «инструменты» — панель слева: пресеты и сэмплы.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-search"]',
        say: 'Поиск смотрит в имя, тембр и пояснение: «дабстеп» найдёт воббл. Крестик справа очищает.',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-cards"] .inst-card',
        say: 'Клик по пресету применяет его к дорожке из селектора «в дорожку». ▶ — послушать до применения.',
        hint: '«Стартовые» — архетипы с рецептом в подсказке.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="sb-tab-samples"]',
        say: 'Жми вкладку «сэмплы» — все сэмплы.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="library"]',
        say: 'Сэмплы: ▶ — прослушать, клик по имени — посадить в дорожку волной «сэмпл».',
        side: 'top',
      },
    ],
  },
  {
    id: 'scales',
    title: 'шкала: свой строй',
    goal: 'Слендро, N-ET, свои дроби',
    section: 'more',
    steps: [
      {
        target: '[data-ob="scale-btn"]',
        say: 'Жми кнопку шкалы — откроется список.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scale-search"]',
        say: 'Ищи: «слендро», «шрути», «макам»…',
        side: 'bottom',
      },
      {
        target: '.scale-item',
        say: 'Кликни строй — он сразу применится.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scale-tools"]',
        say: 'Здесь N равных ступеней или своя шкала дробями.',
        side: 'top',
      },
    ],
  },
  {
    id: 'samples',
    title: 'сэмплы',
    goal: 'Загрузить или сгенерировать звук',
    section: 'more',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        say: 'Жми «инструмент» на дорожке — откроется большой редактор тембра.',
        side: 'bottom',
        hint: 'Сэмплы живут у дорожек с волной «сэмпл».',
      },
      {
        target: '[data-ob="snd-sample"]',
        say: '«выбрать…» или «загрузить» — сэмпл в слот.',
        side: 'bottom',
      },
      {
        target: '[data-ob="sample-mode"]',
        say: 'Режимы: прямой, гранулы, скрэтч — всё на вкладке «источник».',
        hint: 'Там же: обрезка куска, разложение в гармоники, генерация.',
        side: 'bottom',
      },
      {
        target: '[data-ob="gen-bar"]',
        say: 'Опиши словами — ИИ сделает звук.',
        side: 'top',
      },
      {
        target: '[data-ob="library-btn"]',
        say: 'Жми «инструменты» — пресеты и сэмплы в одной панели.',
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'scratch',
    title: 'скрэтч',
    goal: 'Записать движение мыши — нота его сыграет',
    section: 'more',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        say: 'Жми «инструмент» на дорожке — откроется большой редактор тембра.',
        side: 'bottom',
        hint: 'Нужна дорожка с волной «сэмпл».',
      },
      {
        target: '[data-ob="sample-mode"]',
        say: 'На вкладке «источник» поставь режим «скрэтч».',
        side: 'bottom',
      },
      {
        target: '[data-ob="scratch-rec"]',
        say: 'Жми «записать жест».',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scratch-pad"]',
        say: 'Веди мышь по пэду — путь запишется.',
        hint: 'Вверх — к концу сэмпла. Круче наклон — быстрее игла.',
        side: 'top',
      },
      {
        target: '[data-ob="scratch-play"]',
        say: 'Жми «послушать» — жест сыграет нотой.',
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'wave',
    title: 'редактор волны',
    goal: 'Обрезать сэмпл, сварить тембр из гармоник',
    section: 'more',
    steps: [
      {
        target: '[data-ob="mode-inst"]',
        expect: 'click',
        say: 'Жми «инструмент» — редактор тембра, где живёт волна.',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-canvas"]',
        say: 'Выдели кусок волны мышью — «оставить кусок».',
        hint: 'Кусок, разложение и скрэтч живут на вкладке «источник».',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-fft"] button',
        say: 'Жми «сэмпл → в волну» — слепок уйдёт черновиком на вкладку «волна».',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-wave-tools"]',
        say: 'Правки — в черновике: «▶ нота» слушает его, «применить» делает волной инструмента.',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-partials"]',
        say: 'Гармоники: ×2 — октава, ×1.5 — квинта.',
        side: 'top',
      },
    ],
  },
  {
    id: 'ai',
    title: 'ИИ-генерация',
    goal: 'Ключ — и звук по описанию',
    section: 'more',
    steps: [
      {
        target: '[data-ob="ai-btn"]',
        say: 'Жми шестерёнку — там ключ ИИ.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="ai-key"]',
        open: 'ai',
        say: 'Выбери сервис и вставь его ключ (fal.ai — Keys, ElevenLabs — Profile → API Keys).',
        side: 'bottom',
      },
      {
        target: '[data-ob="gen-bar"]',
        say: 'Опиши звук словами — сэмпл готов.',
        side: 'top',
      },
    ],
  },
  {
    id: 'files',
    title: 'сохраниться и поделиться',
    goal: 'Wav, json, zip — и ничего не потерять',
    section: 'more',
    steps: [
      {
        target: '[data-ob="title"]',
        say: 'Сохраняется само. Имя пьесы — имя файлов.',
        side: 'bottom',
      },
      {
        target: '[data-ob="file-menu"]',
        say: 'Жми «файл».',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="file-menu"]',
        say: '«записать wav» — аудио. «проект zip» — всё со сэмплами.',
        hint: 'Импорт понимает и json, и zip.',
        side: 'bottom',
      },
    ],
  },
];

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id);

// ---- Отметки прохождения (localStorage) ----

const STORE_KEY = 'barlow.onboarding.v1';

interface ObStore {
  /** Приглашение к гидам показано — пульс на кнопке «?» снят. */
  invited?: boolean;
  seen: Record<string, true>;
}

function readStore(): ObStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ObStore>;
      if (parsed && typeof parsed.seen === 'object' && parsed.seen) {
        return { invited: parsed.invited, seen: parsed.seen };
      }
    }
  } catch {
    /* отметки необязательны */
  }
  return { seen: {} };
}

function writeStore(s: ObStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* приватный режим — переживём */
  }
}

/** Онбординг ни разу не открывали — при первом заходе стартует вводный. */
export const onboardingUntouched = (): boolean => {
  const s = readStore();
  return !s.invited && Object.keys(s.seen).length === 0;
};

export const needsInvite = (): boolean => !readStore().invited;

export const markInvited = (): void => {
  const s = readStore();
  if (s.invited) return;
  writeStore({ ...s, invited: true });
};

export const isGuideSeen = (id: string): boolean => !!readStore().seen[id];

/** Гид считается пройденным, когда его закончили (даже мгновенно). */
export const markGuideSeen = (id: string): void => {
  const s = readStore();
  if (s.seen[id]) return;
  writeStore({ ...s, seen: { ...s.seen, [id]: true } });
};

// ---- Шина запуска ----

export interface GuideStart {
  scope?: string;
  step?: number;
}

type StartFn = (guideId: string, opts?: GuideStart) => void;

// HelpHint'ы разбросаны по компонентам; протаскивать колбэк через все
// пропсы ради статичной кнопки — шум. Приложение регистрирует стартер,
// кнопки зовут launchGuide.
let starter: StartFn = () => {};

export const registerGuideStarter = (fn: StartFn): void => {
  starter = fn;
};

export const launchGuide = (guideId: string, opts?: GuideStart): void => {
  starter(guideId, opts);
};
