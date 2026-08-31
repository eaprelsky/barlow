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
  steps: GuideStep[];
}

export const GUIDES: Guide[] = [
  {
    id: 'main',
    title: 'вводный: собери бит',
    goal: 'Пуск → нота → слушаешь. Минуту — и бит твой',
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
    title: 'дорожка: анатомия',
    goal: 'Добавить инструмент, имя, соло, свернуть',
    steps: [
      {
        target: '[data-ob="add-track"]',
        say: 'Жми «+ трек» — откроется браузер звуков.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-cards"] .inst-card',
        say: 'Кликни звук — добавится дорожка.',
        expect: 'click',
        side: 'top',
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
        target: '[data-ob="ops"]',
        say: 'Три лица карточки: ноты, звук, волна.',
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
    id: 'instruments',
    title: 'браузер инструментов',
    goal: 'Выбрать готовый тембр одним кликом',
    steps: [
      {
        target: '[data-ob="add-track"]',
        say: 'Жми «+ трек» — откроется браузер звуков.',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-search"]',
        say: 'Ищи слово: «бочка», «воббл», «пила»…',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-cards"] .inst-card',
        say: 'Кликни карточку — звук применится. Услышь разницу!',
        expect: 'click',
        side: 'top',
      },
    ],
  },
  {
    id: 'sketches',
    title: 'эскизы и вариации',
    goal: 'Новый рисунок и копия-вариация за два клика',
    steps: [
      {
        target: '[data-ob="chips"]',
        say: 'Чипы — рисунки дорожки. Активный играет.',
        side: 'bottom',
      },
      {
        target: '[data-ob="chip-add"]',
        say: 'Жми + — пустой рисунок.',
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
        say: 'Длина — сколько шагов в цикле.',
        side: 'bottom',
      },
      {
        target: '[data-ob="rate"]',
        say: 'Шаг — скорость ступеней.',
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
    id: 'roll',
    title: 'нотный стан',
    goal: 'Нарисовать ноты, аккорды, перенос',
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
    title: 'заполнить и мутировать',
    goal: 'Узор одной кнопкой, доводка случайными правками',
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
        say: 'Жми «мутировать» — чуть случайных правок.',
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
    id: 'scales',
    title: 'шкала: свой строй',
    goal: 'Выбрать строй: слендро, N-ET, свои дроби',
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
    id: 'sound',
    title: 'звук дорожки',
    goal: 'Сменить инструмент, огибающая, тембр',
    steps: [
      {
        target: '[data-ob="ops-sound"]',
        say: 'Открой панель «звук» — иконка в дорожке.',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-pick"]',
        say: 'Жми «выбрать…» — браузер звуков.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="inst-cards"] .inst-card',
        say: 'Кликни звук — дорожка заиграет иначе.',
        expect: 'click',
        side: 'top',
      },
      {
        target: '[data-ob="tab-env"]',
        say: 'Вкладка «огибающая»: удар, спад, плато.',
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-timbre"]',
        say: 'Вкладка «тембр»: фильтры, вибрато, сайдчейн.',
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
    id: 'effects',
    title: 'эффекты и модуляции',
    goal: 'Эхо, реверб, перегруз; авторучки-LFO',
    steps: [
      {
        target: '[data-ob="ops-sound"]',
        say: 'Открой панель «звук» — иконка в дорожке.',
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-fx"]',
        say: 'Жми вкладку «эффекты».',
        expect: 'click',
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
        say: 'Порядок строк — цепочка. Mix — сколько эффекта.',
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-mods"]',
        say: 'Жми вкладку «модуляции».',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mods-add"]',
        say: 'Жми «+ модуляция» — ручка поедет сама.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mods-list"] .mod-row',
        say: 'Цель — что качать. «синхр» — скорость по темпу.',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'arp',
    title: 'арпеджиатор',
    goal: 'Аккорды играют по нотке — фигурой',
    steps: [
      {
        target: '[data-ob="ops-sound"]',
        say: 'Открой панель «звук» — иконка в дорожке.',
        hint: 'Галка арпеджиатора живёт во вкладке «тембр».',
        side: 'bottom',
      },
      {
        target: '[data-ob="tab-timbre"]',
        say: 'Жми вкладку «тембр».',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp"]',
        say: 'Жми галку «арпеджиатор» — включён.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp-mode"]',
        say: 'Тип — фигура: вверх, вниз, случайно…',
        side: 'bottom',
      },
      {
        target: '[data-ob="arp-speed"]',
        say: 'Скорость — событий на шаг. Октавы — повтор сверху.',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'arrangement',
    title: 'сцены и цепочка',
    goal: 'Из сцен — целая пьеса',
    steps: [
      {
        target: '[data-ob="scenes"] .scene-btn',
        say: 'Клик по сцене — играть её.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="scene-add"]',
        say: 'Жми + — новая сцена, копия текущей.',
        expect: 'click',
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
        say: 'Цепочка: порядок сцен и такты.',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'mix',
    title: 'микшер',
    goal: 'Громкости, панорамы, общий звук',
    steps: [
      {
        target: '[data-ob="mixer-btn"]',
        say: 'Жми «микшер» — откроется рэк.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="mix-master"]',
        open: 'mix',
        say: 'Мастер: шум и компрессия.',
        side: 'bottom',
      },
      {
        target: '[data-ob="mix-track"]',
        say: 'Дорожка: громкость, пан, полный выключатель.',
        side: 'bottom',
      },
      {
        target: '.master-vol',
        say: 'В шапке — общая громкость и пан.',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'samples',
    title: 'сэмплы',
    goal: 'Загрузить или сгенерировать звук',
    steps: [
      {
        target: '[data-ob="ops-sound"]',
        say: 'Открой панель «звук» — иконка в дорожке.',
        hint: 'Сэмплы живут у дорожек с волной «сэмпл».',
        side: 'bottom',
      },
      {
        target: '[data-ob="snd-sample"]',
        say: '«выбрать…» или «загрузить» — сэмпл в слот.',
        side: 'bottom',
      },
      {
        target: '[data-ob="sample-mode"]',
        say: 'Режимы: прямой, гранулы, скрэтч.',
        side: 'bottom',
      },
      {
        target: '[data-ob="gen-bar"]',
        say: 'Опиши словами — ИИ сделает звук.',
        side: 'top',
      },
      {
        target: '[data-ob="library-btn"]',
        say: 'Жми «сэмплы» — вся библиотека.',
        expect: 'click',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'scratch',
    title: 'скрэтч',
    goal: 'Записать движение мыши — нота его сыграет',
    steps: [
      {
        target: '[data-ob="ops-sound"]',
        say: 'Открой панель «звук» — иконка в дорожке.',
        hint: 'Нужна дорожка с волной «сэмпл».',
        side: 'bottom',
      },
      {
        target: '[data-ob="sample-mode"]',
        say: 'Поставь режим «скрэтч».',
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
    steps: [
      {
        target: '[data-ob="ops-wave"]',
        say: 'Жми иконку волны в дорожке — откроется редактор.',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-tabs"]',
        say: 'Две вкладки: «сэмпл» и «волна».',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-canvas"]',
        say: 'Выдели кусок волны мышью — «оставить кусок».',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-fft"] button',
        say: 'Жми «разложить в гармоники» — будет тембр-слепок.',
        expect: 'click',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-wave-tools"]',
        say: '«Рисовать форму» — тембр звучит прямо при рисовании.',
        side: 'bottom',
      },
      {
        target: '[data-ob="we-partials"]',
        say: 'Парциалы: ×2 — октава, ×1.5 — квинта.',
        side: 'top',
      },
    ],
  },
  {
    id: 'ai',
    title: 'ИИ-генерация',
    goal: 'Ключ — и звук по описанию',
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
        say: 'Вставь ключ с elevenlabs.io → API Keys.',
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
