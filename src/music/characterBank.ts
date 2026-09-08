import type { InstrumentPreset } from './instrumentPresets';
import type { WavePartial } from '../types';
import { tableFrame } from './wavetable';

const bank: InstrumentPreset[] = [];
const sine = (ratio = 1, amp = 1, decay?: number): WavePartial => ({ type: 'sine', ratio, amp, ...(decay ? { decay } : {}) });
const noise = (amp: number, decay?: number): WavePartial => ({ type: 'noise', ratio: 1, amp, ...(decay ? { decay } : {}) });
function add(id: string, name: string, category: string, hz: number, hint: string, sound: InstrumentPreset['track'], tags: string[]) {
  bank.push({ id: `character-01-${id}`, packId: 'character-01', name, category, hint, tags,
    track: { waveform: 'wave', freq: hz, recommendedHz: hz, wave: { partials: [sine()] },
      attack: .025, decay: .7, sustain: .35, filterLow: 25, filterFreq: 5000,
      pitchDrop: 1, pitchTime: .08, ...sound } });
}
add('neuro-reese', 'нейро: движущийся Reese', 'бас', 49,
  'Широкий расстроенный бас с жёсткой серединой. Начни с 49 Гц и длинных нот; резонанс и частота фильтра меняют рычание. Для нейрофанка и тяжёлых переходов.',
  { wave: { partials: [sine()], va: { shape: 'saw', pulseWidth: .5 } }, unisonVoices: 3, unisonDetune: 18, unisonSpread: .4,
    foldDrive: 1.3, synthQuality: '4x', filterFreq: 1700, filterQ: 1.5,
    mods: [{ target: 'filterFreq', shape: 'sine', rate: .7, depth: .3 }] }, ['neurofunk', 'нейрофанк', 'reese', 'bass', 'бас']);
add('dubstep-vowel', 'дабстеп: говорящий бас', 'бас', 55,
  'Бас с гласной окраской: спектр проходит от мягкого к узкому импульсу. На 55 Гц короткие ноты дают «йой», длинные — протяжное рычание. Форманты выделяют характерные полосы звучания.',
  { wave: { partials: [sine()], wavetable: { frames: [tableFrame('triangle'), tableFrame('saw'), tableFrame('pulse', .12)], position: .1, sweep: .85 } },
    formants: [{ freq: 430, gain: 1.2 }, { freq: 1150, gain: .8 }], foldDrive: .8, synthQuality: '4x', decay: .55, filterFreq: 3200 },
  ['dubstep', 'дабстеп', 'growl', 'bass', 'форманты']);
add('neuro-stab', 'нейро: короткий рык', 'бас', 65,
  'Сухой FM-укол для пауз между бочкой и снейром. Около 65 Гц сохраняет низ; выше становится металлическим акцентом. Короткий модулятор быстро смягчает начало звука.',
  { wave: { partials: [sine(), { ...sine(1.5, 4.5, .11), mod: 0 }] }, decay: .24, sustain: 0, filterFreq: 2600,
    foldDrive: .6, synthQuality: '4x' }, ['neurofunk', 'нейрофанк', 'FM', 'bass', 'короткий']);
add('dubstep-pulse', 'дабстеп: пульсирующий низ', 'бас', 46,
  'Плотный низ с качающейся серединой. На длинной ноте слышно движение фильтра; скорость модуляции подстрой под ритм. Начальная частота 46 Гц.',
  { wave: { partials: [sine()], va: { shape: 'pulse', pulseWidth: .32 } }, decay: 1.4, sustain: .55, filterFreq: 1000, filterQ: 1.7,
    mods: [{ target: 'filterFreq', shape: 'sine', rate: 2, depth: .28 }], effects: [{ type: 'dist', drive: 2, mix: .35 }] },
  ['dubstep', 'дабстеп', 'wobble', 'bass', 'бас']);

add('guitar-mute', 'перегруженная струна: глушёный удар', 'тоны и лиды', 82.4,
  'Короткий гитароподобный удар с перегрузом для рубленых риффов. Начни с 82 Гц и пауз между нотами. Это синтетическая окраска приглушённой струны; гитарные приёмы автоматически не воспроизводятся.',
  { wave: { partials: [sine(), sine(2, .5), sine(3, .3), sine(4, .15)] }, attack: .008, decay: .18, sustain: 0,
    filterFreq: 2900, filterEnvAmount: 12, filterEnvTime: .04, effects: [{ type: 'dist', drive: 5, mix: .8 }] },
  ['guitar', 'гитара', 'distortion', 'дисторшн', 'риф', 'palm mute']);
add('guitar-fifth', 'перегруженная струна: квинта', 'тоны и лиды', 82.4,
  'В одной ноте уже звучат основной тон, квинта и октава. Для тяжёлых риффов достаточно одноголосной партии; начни с 82 Гц. Перегруз объединяет голоса в гитароподобную стену.',
  { wave: { partials: [sine(), sine(1.5, .7), sine(2, .5), sine(3, .3), sine(4, .15)] }, decay: .85, sustain: .5,
    filterFreq: 3600, effects: [{ type: 'dist', drive: 4, mix: .8 }] }, ['guitar', 'гитара', 'distortion', 'дисторшн', 'power chord']);
add('guitar-sustain', 'перегруженная струна: поющий лид', 'тоны и лиды', 164.8,
  'Тянущийся гитароподобный голос для мелодий поверх жёсткой электроники. На 165 Гц звучит густо; вибрато вступает с задержкой. Увеличь длину ноты для протяжной фразы.',
  { wave: { partials: [sine(), sine(2, .45), sine(3, .22), sine(5, .08)] }, decay: 1.6, sustain: .7,
    vibratoRate: 5.1, vibratoDepth: 15, vibratoDelay: .4, filterFreq: 3400,
    effects: [{ type: 'dist', drive: 3.5, mix: .75 }, { type: 'delay', timeSec: .23, feedback: .2, mix: .14 }] },
  ['guitar', 'гитара', 'distortion', 'дисторшн', 'lead']);
add('organ-registers', 'орган: полные регистры', 'клавишные', 220,
  'Насыщенный орган с нижним регистром, квинтой и верхними обертонами. Уже одна нота на 220 Гц даёт плотный звук; аккорд делает его ещё шире. Подходит для протяжных гармоний и коротких синкоп.',
  { wave: { partials: [sine(.5, .6), sine(), sine(1.5, .4), sine(2, .65), sine(3, .35), sine(4, .2), sine(6, .1)] },
    attack: .018, decay: 1.1, sustain: .85, filterFreq: 6000, effects: [{ type: 'chorus', rate: .7, mix: .22 }] },
  ['organ', 'орган', 'keys', 'регистры']);

add('space-orbit', 'космос: дрейфующая орбита', 'фоны', 147,
  'Медленно меняющееся облако для вступлений и пауз. Начни с одной ноты на 147 Гц: волновая таблица и расстройка дают движение без сложной партии. Огибающая объединяет все составляющие.',
  { wave: { partials: [sine()], wavetable: { frames: [tableFrame('sine'), tableFrame('triangle'), tableFrame('pulse', .3)], position: 0, sweep: .65 } },
    unisonVoices: 3, unisonDetune: 11, unisonSpread: .8, filterFreq: 1900,
    ampMseg: { seconds: 4, points: [{ t: 0, v: 0 }, { t: .25, v: .7 }, { t: .55, v: 1 }, { t: 1, v: 0 }] },
    effects: [{ type: 'reverb', sizeSec: 2.5, mix: .25 }] }, ['space', 'космос', 'сюрреализм', 'pad', 'фон']);
add('space-message', 'космос: чужой передатчик', 'прочее', 330,
  'Негармоничный сигнал с двумя вспышками громкости. На 330 Гц — будто ответ далёкого аппарата; ниже — странный механический голос. Используй редко, как реплику между фразами.',
  { wave: { partials: [sine(), { ...sine(2.71, 2.2), mod: 0 }] }, ringMix: .35, ringRatio: .73,
    ampMseg: { seconds: 1.3, points: [{ t: 0, v: 0 }, { t: .04, v: 1 }, { t: .3, v: .05 }, { t: .5, v: .7 }, { t: 1, v: 0 }] },
    filterFreq: 4800, effects: [{ type: 'delay', timeSec: .31, feedback: .3, mix: .22 }] }, ['space', 'космос', 'сюрреализм', 'FX']);
add('space-tide', 'космос: прилив металла', 'фоны', 110,
  'Тёмный металлический наплыв без резкого удара. Одна нота на 110 Гц постепенно раскрывается и растворяется; подходит для напряжения перед сменой сцены.',
  { wave: { partials: [sine(), sine(1.37, .35), sine(2.71, .2), noise(.025)] }, ringMix: .25, ringRatio: 1.618,
    ampMseg: { seconds: 4.5, points: [{ t: 0, v: 0 }, { t: .45, v: 1 }, { t: .65, v: .7 }, { t: 1, v: 0 }] },
    filterFreq: 2500, effects: [{ type: 'reverb', sizeSec: 3, mix: .2 }] }, ['space', 'космос', 'сюрреализм', 'metal', 'фон']);

add('bilo', 'било: низкая металлическая пластина', 'перкуссия', 196,
  'Удар по воображаемой подвешенной металлической пластине: ясное начало и несколько негармоничных затухающих тонов. Начни с 196 Гц и редких ударов, оставляя хвосту место.',
  { wave: { partials: [sine(1, 1, 2.2), sine(2.43, .45, 1.3), sine(4.17, .25, .75), sine(6.8, .1, .24), noise(.07, .012)] },
    attack: .003, decay: 2.3, sustain: 0, filterFreq: 7500 }, ['било', 'bilo', 'metal', 'пластина', 'перкуссия']);
add('tabla-dayan', 'табла: звонкий правый барабан', 'перкуссия', 220,
  'Синтетическая стилизация звонкого удара табла: настроенный корпус и короткий шлепок. Начни с 220 Гц; чередуй с низким баяном и меняй силу ударов. Разные ручные артикуляции здесь не моделируются.',
  { wave: { partials: [sine(1, 1, .42), sine(2, .45, .22), sine(3, .2, .12), noise(.12, .015)] },
    attack: .004, decay: .45, sustain: 0, pitchDrop: 1.08, pitchTime: .025, filterFreq: 4800 }, ['tabla', 'табла', 'индийский', 'барабан']);
add('tabla-bayan', 'табла: булькающий басовый баян', 'перкуссия', 85,
  'Низкий барабан пары табла, а не клавишный баян. Падение высоты создаёт «бульк»: начни с 85 Гц и коротких ответов звонкому барабану. Падение тона и его время регулируют глубину жеста.',
  { wave: { partials: [sine(1, 1, .48), sine(2, .23, .17), sine(3, .1, .07), noise(.045, .014)] },
    attack: .007, decay: .5, sustain: 0, pitchDrop: 1.8, pitchTime: .16, filterFreq: 2300 }, ['tabla', 'табла', 'bayan', 'индийский', 'булькающий', 'барабан']);
add('gong', 'большой шумовой гонг', 'перкуссия', 73,
  'Тёмный металлический удар, который разрастается в широкий шумовой хвост. Начни с 73 Гц и оставь несколько секунд тишины после удара. Это отдельный звук от барабанного тома.',
  { wave: { partials: [sine(1, .4), sine(1.41, .3), sine(1.93, .23), sine(2.71, .18), sine(4.13, .12), noise(.5)] },
    ringMix: .55, ringRatio: 1.73, filterFreq: 3800,
    ampMseg: { seconds: 4.2, points: [{ t: 0, v: 0 }, { t: .008, v: .55 }, { t: .12, v: 1 }, { t: .5, v: .3 }, { t: 1, v: 0 }] },
    effects: [{ type: 'reverb', sizeSec: 2, mix: .16 }] }, ['gong', 'гонг', 'там-там', 'metal', 'шум']);
export const CHARACTER_BANK: readonly InstrumentPreset[] = bank;
