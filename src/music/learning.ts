import { makeTrackWithInstrument, makePattern, makeStep, makeScene, normalizePatch, PATCH_VERSION, type Patch, type Track, type Instrument } from '../types';
import { tableRecipe } from './wavetable';

export type Lesson = { title: string; goal: string; action: string; listen: string; term: string; check: (p: Patch) => boolean };
const anyPattern = (p: Patch, f: (s: Patch['tracks'][number]['patterns'][number]) => boolean) => p.tracks.some(t => t.patterns.some(f));
export const compositionLessons: Lesson[] = [
  { title:'Зерно идеи', goal:'Узнаваемый мотив связывает начало и финал.', action:'Открой эскиз дорожки «Мотив». Измени одну высоту или один акцент. Прослушай «Зерно» и «Возвращение».', listen:'Узнаётся ли герой после паузы? Слишком много изменений могут стереть сходство.', term:'Мотив — короткий жест, который можно узнать в новом окружении.', check:p => p.tracks.some(t => t.name === 'Мотив' && t.patterns.some(s => s.steps.some(n => n.notes.length))) },
  { title:'Опора и ответ', goal:'Бас и бочка оставляют друг другу место.', action:'В «Опоре» убери одну ноту баса рядом с бочкой. Сравни с исходником; затем попробуй вернуть её тише.', listen:'Появились ли ясность и дыхание, не пропал ли вес?', term:'Пауза — часть ритма, а не отсутствие материала.', check:p => p.tracks.filter(t => t.name === 'Бас' || t.name === 'Бочка').length === 2 },
  { title:'Нарушение ожидания', goal:'Независимый цикл меняет окружение устойчивой опоры.', action:'У «Осколков» сравни длины эскиза 7 и 8. Не меняй одновременно темп.', listen:'В каком варианте акценты каждый раз встречаются иначе?', term:'Полиритмия возникает при взаимодействии разных ритмических периодов.', check:p => new Set(p.tracks.flatMap(t => t.patterns.map(s => s.length))).size > 1 },
  { title:'Нарастание', goal:'Подними напряжение без подъёма мастера.', action:'В эскизе B «Мотива» нарисуй подъём автоматизации фильтра. Прослушай «Напряжение» перед паузой.', listen:'Есть ли направление, а не просто более громкая версия?', term:'Развитие — постепенное изменение знакомого материала.', check:p => anyPattern(p,s => !!s.automation?.some(a => a.target === 'filterFreq')) },
  { title:'Пустота', goal:'Сделай возвращение сильнее контрастом.', action:'В сцене «Пустота» оставь один голос. Сравни 2 и 4 такта в цепочке.', listen:'Пауза ещё создаёт ожидание или уже теряется связь с пьесой?', term:'Контраст даёт слуху новую точку отсчёта.', check:p => p.scenes.some(s => Object.values(s.slots).filter(v => !v.muted).length === 1) },
  { title:'Кульминация', goal:'Верни идею в изменённом виде.', action:'В «Вспышке» выбери B у мотива и добавь один ответ перкуссии. Сравни с «Опорой».', listen:'Кульминация отличается содержанием, а не только количеством голосов?', term:'Кульминация — момент максимального напряжения выбранной истории.', check:p => p.scenes.length >= 6 },
  { title:'Развязка', goal:'Закончи историю намеренно.', action:'В «Коде» оставь мотив и фон, проверь хвост общего пространства. Попробуй закончить на один ответ раньше.', listen:'Последний звук воспринимается завершением или обрывом?', term:'Кода — короткое завершение после главного события.', check:p => !!p.sceneSpace && p.chain.length >= 6 },
  { title:'Баланс и выпуск', goal:'Сохрани законченную вариацию.', action:'Сравни бас и мотив на тихой громкости. Проверь EQ и экспортируй цепочку в WAV с естественным хвостом через меню «Файл».', listen:'Все роли читаются? Хвост не обрезан? Прослушай начало и конец файла.', term:'Экспорт фиксирует выбранную аранжировку; он не оценивает художественное качество.', check:p => p.followChain && p.chain.length >= 6 },
];
export const soundLessons: Lesson[] = [
  { title:'Источник и обертоны', goal:'Сделай из мягкого звука яркий.', action:'На дорожке «Лаборатория» открой инструмент. Сравни синус, пилу и импульс в VA, оставляя громкость умеренной.', listen:'Обертоны добавляют яркость даже при одной высоте.', term:'Обертоны — составляющие выше основной частоты.', check:p => !!p.instruments[0]?.wave?.va },
  { title:'Форма ноты', goal:'Один источник превращается в удар или фон.', action:'Сравни короткий спад с длинной атакой. Затем включи MSEG и изогни один сегмент.', listen:'Как меняются жест и роль инструмента без смены источника?', term:'Огибающая — изменение параметра от начала до конца ноты.', check:p => !!p.instruments[0]?.ampMseg },
  { title:'Фильтр и EQ', goal:'Освободи место для соседнего голоса.', action:'Добавь EQ на дорожку. Сравни широкое ослабление середины с узким усилением. Выключай EQ для сравнения.', listen:'Становится ли звук яснее, или только громче?', term:'EQ меняет баланс частот; ширина полосы определяет область вмешательства.', check:p => p.tracks.some(t => t.effects?.some(e => e.type === 'eq')) },
  { title:'FM и движение', goal:'Получи упругий бас или негармоничный звон.', action:'Переключи синтез на операторы, добавь модулятор частоты. Сравни целое отношение частот с дробным.', listen:'Когда тон становится металлическим? Уменьши глубину, чтобы вернуть опору.', term:'FM меняет мгновенную частоту одного генератора сигналом другого.', check:p => !!p.instruments[0]?.wave?.partials.some(x => x.mod !== undefined) },
  { title:'Wavetable и PWM', goal:'Тембр движется внутри длинной ноты.', action:'Выбери wavetable, включи LFO позиции. Затем сравни с импульсом VA и PWM. Импорт собственной WAV-таблицы — дополнительное упражнение.', listen:'Похожи ли движения и чем отличаются?', term:'Wavetable смешивает кадры; PWM меняет ширину импульса.', check:p => p.instruments.some(i => !!i.wave?.wavetable?.positionLfo || !!i.wave?.va?.pwmDepth) },
  { title:'Слои и диапазоны', goal:'Сильная нота открывает дополнительную окраску.', action:'Добавь слой. В «обработке и диапазоне» ограничь его силу 70–100%, добавь локальный перегруз. Сравни слабую и сильную ноту.', listen:'Сохраняется ли основной характер, когда подключается слой?', term:'Диапазон силы ноты управляет участием голоса, а не общей громкостью проекта.', check:p => p.instruments.some(i => i.layers?.some(l => !!l.sound.voiceRange)) },
  { title:'Макрос и обмен', goal:'Преврати опыт в инструмент для музыки.', action:'Назначь макрос яркости, сохрани инструмент и экспортируй его. Собери несколько вариантов в пак через меню «Файл».', listen:'Понятен ли диапазон макроса без знания внутренней схемы?', term:'Макрос связывает несколько параметров с одним выразительным жестом.', check:p => p.instruments.some(i => !!i.macros?.length) },
];

export function learningProject(sound = false): Patch {
  const roles = sound ? ['Лаборатория'] : ['Бочка','Щелчок','Осколки','Бас','Мотив','Воздух'];
  const made = roles.map((name, i) => {
    const length = sound ? 8 : [16,16,7,8,5,16][i], rate = sound ? 1 : [1,1,1,2,2,4][i];
    const mask = sound ? [0] : [[0,4,8,11],[4,12],[0,2,5],[1,4,7],[0,2,4],[0]][i];
    const steps = Array.from({ length }, (_, n) => makeStep(mask.includes(n), i === 4 ? [0,2,1,4,2][n % 5] : 0, n % 4 === 0 ? .8 : .55));
    const a = makePattern('A',length,steps,rate), b = makePattern('B',length,steps.map((s,n) => n === length - 1 ? makeStep(true, i === 4 ? 3 : 0,.45) : structuredClone(s)),rate);
    if (i === 4) b.automation = [{ target:'filterFreq', points:[{t:0,v:.25},{t:1,v:.85}] }];
    const partial: Partial<Track & Instrument> & {id:string;name:string} = { id:`learn-track-${i}`,name,freq:sound ? 110 : [48,180,1800,55,220,110][i],scale:[1,1.2,1.5,1.8,2],volume:sound ? .35 : [.55,.22,.13,.3,.2,.1][i],attack:i === 5 ? .8 : .005,decay:i === 5 ? 2 : .2,sustain:i === 5 ? .5 : 0,pitchDrop:i === 0 && !sound ? 3 : 1,pitchTime:.08,waveform:'wave',wave:sound ? {partials:[],va:{shape:'saw',pulseWidth:.5}} : i === 1 || i === 2 ? {partials:[{type:'noise',amp:1,ratio:1}]} : i === 4 ? {partials:[],wavetable:tableRecipe()} : {partials:[{type:'sine',amp:1,ratio:1},{type:'sine',amp:.15,ratio:2}]},filterFreq:i === 3 ? 900 : 8000,spaceSend:i >= 4 ? .3 : .04,patterns:[a,b] };
    return makeTrackWithInstrument(partial);
  });
  const tracks = made.map(m => m.track);
  const names = sound ? ['Опыт'] : ['Зерно','Опора','Диалог','Напряжение','Пустота','Вспышка','Возвращение','Кода'];
  const scenes = names.map((name,i) => {
    const scene = makeScene(name,tracks,t => t.patterns[i === 3 || i === 5 ? 1 : 0].id);
    const active = [[4,5],[0,3,4],[0,1,2,3,4],[0,1,2,3,4,5],[5],[0,1,2,3,4,5],[0,3,4],[4,5]][i];
    if (!sound) tracks.forEach((t,n) => { if (!active.includes(n)) scene.slots[t.id].muted = true; });
    return scene;
  });
  return normalizePatch({version:PATCH_VERSION,title:sound ? 'Лаборатория тембра' : 'Осколки орбиты · учебная копия',bpm:120,masterVolume:.7,performanceSeed:42,followChain:!sound,sceneSpace:{sizeSec:2.5,level:.22},tracks,instruments:made.map(m=>m.instrument),scenes,chain:scenes.map((s,i)=>({sceneId:s.id,bars:sound ? 8 : [8,8,8,8,4,12,8,8][i]}))});
}

const RETURN_KEY = 'barlow.learning.return', WORK_KEY = 'barlow.learning.work';
export function beginLearning(current: Patch, sound: boolean): Patch {
  if (!localStorage.getItem(RETURN_KEY)) localStorage.setItem(RETURN_KEY, JSON.stringify(current));
  return learningProject(sound);
}
export function returnFromLearning(current: Patch): Patch | null {
  const saved = localStorage.getItem(RETURN_KEY); if (!saved) return null;
  const restored = normalizePatch(JSON.parse(saved));
  localStorage.setItem(WORK_KEY, JSON.stringify(current));
  return restored;
}
export function finishLearningReturn(): void { localStorage.removeItem(RETURN_KEY); }
export function resumeLearning(current: Patch): Patch | null {
  const saved = localStorage.getItem(WORK_KEY); if (!saved) return null;
  const work = normalizePatch(JSON.parse(saved));
  if (!localStorage.getItem(RETURN_KEY)) localStorage.setItem(RETURN_KEY, JSON.stringify(current));
  return work;
}
