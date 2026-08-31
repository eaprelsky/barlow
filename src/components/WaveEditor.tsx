import { useEffect, useMemo, useRef, useState } from 'react';
import type { Track, WaveDef, WavePartial } from '../types';
import { PARTIAL_TYPE_LABELS } from '../types';
import { NumField } from './NumField';
import { WaveCanvas } from './WaveCanvas';
import { alertDialog } from './dialogs';
import { HelpHint } from '../onboarding/Onboarding';
import { cycleToPartials, renderWaveCycle, sampleToPartials } from '../music/fft';

// Редактор волны дорожки: «раздвинутый» режим карточки трека. Две вкладки:
// «сэмпл» — обрезка куска, который играет нота (и скрэтч); «волна» —
// свой тембр из парциалов с живой картинкой цикла и режимом точек
// (рисуешь форму — FFT превращает её в гармоники).

interface Props {
  track: Track;
  onChange: (patch: Partial<Track>) => void;
  onClose: () => void;
  getBuffer: (id?: string) => Promise<AudioBuffer | null>;
  onPreviewRegion: (track: Track, fromSec: number, toSec: number) => void;
  onPreviewNote: (track: Track) => void;
  onTransformSample: (trackId: string, prompt: string, strength: number) => void;
  busy: boolean;
}

const CYCLE_N = 2048;

/** Микс в моно для канваса (рисуем один канал суммы). */
function monoOf(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const a = buf.getChannelData(0);
  const b = buf.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

const genPartials = (kind: 'sine' | 'saw' | 'square' | 'noise'): WaveDef =>
  kind === 'sine'
    ? { partials: [{ ratio: 1, amp: 1, type: 'sine' }] }
    : kind === 'noise'
      ? { partials: [{ ratio: 1, amp: 0.8, type: 'noise' }], noiseGrainMs: 40 }
      : kind === 'saw'
        ? {
            partials: Array.from({ length: 16 }, (_, i) => ({
              ratio: i + 1,
              amp: Math.pow(i + 1, -1),
              type: 'sine' as const,
            })),
          }
        : {
            // Меандр: нечётные гармоники 1/k.
            partials: Array.from({ length: 8 }, (_, i) => ({
              ratio: i * 2 + 1,
              amp: 1 / (i * 2 + 1),
              type: 'sine' as const,
            })),
          };

export function WaveEditor({
  track,
  onChange,
  onClose,
  getBuffer,
  onPreviewRegion,
  onPreviewNote,
  onTransformSample,
  busy,
}: Props) {
  const [tab, setTab] = useState<'sample' | 'wave'>(track.waveform === 'sample' ? 'sample' : 'wave');
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  // Режим точек: локальная таблица (в патч уходит конвертацией в гармоники).
  const [points, setPoints] = useState<Float32Array | null>(null);
  const pointsRef = useRef<Float32Array | null>(null);
  pointsRef.current = points;
  // Точность разложения сэмпла (максимум гармоник) и ручной f0 (0 = авто).
  const [fftK, setFftK] = useState(64);
  const [f0Manual, setF0Manual] = useState(0);
  // ИИ-преобразование сэмпла по описанию (audio-to-audio).
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStrength, setAiStrength] = useState(0.5);

  useEffect(() => {
    if (tab !== 'sample' || !track.sampleId) {
      if (tab === 'sample') setBuffer(null);
      return;
    }
    let alive = true;
    void getBuffer(track.sampleId).then((b) => {
      if (alive) setBuffer(b);
    });
    return () => {
      alive = false;
    };
  }, [tab, track.sampleId, getBuffer]);

  const mono = useMemo(() => (buffer ? monoOf(buffer) : null), [buffer]);
  const dur = buffer?.duration ?? 0;
  const regStart = track.sampleStart ?? 0;
  const regEnd = track.sampleEnd ?? dur;
  const selSec: [number, number] | null =
    sel && sel[1] - sel[0] > 0.0005 && dur > 0
      ? [sel[0] * dur, sel[1] * dur]
      : null;

  const wave: WaveDef = track.wave ?? { partials: [{ ratio: 1, amp: 1, type: 'sine' }] };
  const cycle = useMemo(() => renderWaveCycle(wave, CYCLE_N), [wave]);
  // Любая правка волны делает её волной дорожки: редактор — это инструмент
  // этого трека, отдельная кнопка «применить» только путала (звук не звучал).
  const setWave = (upd: Partial<WaveDef>) =>
    onChange({ waveform: 'wave', wave: { ...wave, ...upd } });
  const setPartial = (i: number, upd: Partial<WavePartial>) =>
    setWave({ partials: wave.partials.map((p, j) => (j === i ? { ...p, ...upd } : p)) });
  const removePartial = (i: number) =>
    setWave({ partials: wave.partials.filter((_, j) => j !== i) });
  const addPartial = () => {
    const used = new Set(wave.partials.map((p) => p.ratio));
    let r = 1;
    while (used.has(r) && r < 64) r++;
    setWave({ partials: [...wave.partials, { ratio: r, amp: 0.5, type: 'sine' }] });
  };

  /** Штрих мышью: точка в таблице точек + живой перевод в гармоники —
   *  тембр меняется прямо во время рисования (и в live, и в «▶ нота»). */
  const drawPoint = (x: number, y: number) => {
    const amp = Math.min(1, Math.max(-1, (y - 0.5) * 2));
    const pts = Float32Array.from(pointsRef.current ?? cycle);
    const idx = Math.min(CYCLE_N - 1, Math.max(0, Math.round(x * CYCLE_N)));
    pts[idx] = amp;
    pointsRef.current = pts;
    setPoints(pts);
    const partials = cycleToPartials(pts, 64);
    if (partials.length > 0) onChange({ waveform: 'wave', wave: { partials } });
  };

  /** Сэмпл → огрублённый набор гармоник: тембровый слепок куска.
   *  Дальше его можно крутить волновыми ручками — сценарий «взял файл,
   *  перевёл в гармоники, двигай точки тембра». */
  const decompose = () => {
    if (!mono || !buffer) return;
    const from = selSec?.[0] ?? 0;
    const to = selSec?.[1] ?? buffer.duration;
    const { partials, f0 } = sampleToPartials(mono, buffer.sampleRate, from, to, {
      maxPartials: fftK,
      f0: f0Manual > 20 ? f0Manual : undefined,
    });
    if (partials.length === 0) {
      void alertDialog(
        'Не нашла основную частоту' +
          (f0Manual > 20 ? '' : ' — задай «f0, Гц» вручную') +
          '. Нетональный материал лучше играет гранулярным режимом сэмпла',
        'разложение в гармоники',
      );
      return;
    }
    onChange({ waveform: 'wave', wave: { partials } });
    setF0Manual(Math.round(f0 * 10) / 10);
    setTab('wave');
  };

  const hasNoise = wave.partials.some((p) => p.type === 'noise');

  return (
    <div className="wave-editor" data-ob="wave-editor">
      <div className="we-head">
        <span className="we-title">
          редактор волны — {track.name}
          {tab === 'sample' && buffer ? ` · ${(buffer.duration).toFixed(2)} с · ${buffer.sampleRate} Гц` : ''}
        </span>
        <span className="tabs we-tabs" data-ob="we-tabs">
          <button className={tab === 'sample' ? 'tab on' : 'tab'} onClick={() => setTab('sample')}>сэмпл</button>
          <button className={tab === 'wave' ? 'tab on' : 'tab'} onClick={() => setTab('wave')}>волна</button>
        </span>
        <span className="spacer" />
        <HelpHint
          guide="wave"
          scope={`[data-track-id="${track.id}"]`}
          label="Гид: обрезка сэмпла и свой тембр"
        />
        <button
          className="on"
          title="Вернуть дорожку в обычный режим"
          onClick={onClose}
        >
          закрыть
        </button>
      </div>

      {tab === 'sample' && (
        <div className="we-body">
          {!track.sampleId || !buffer ? (
            <p className="empty">
              {track.sampleId
                ? 'сэмпл ещё грузится…'
                : 'в слоте нет сэмпла — выбери его на вкладке «звук» панели трека'}
            </p>
          ) : (
            <>
              <div data-ob="we-canvas">
                <WaveCanvas
                  data={mono}
                  sampleRate={buffer.sampleRate}
                  sel={sel}
                  onSel={(a, b) => setSel([a, b])}
                  region={
                    track.sampleStart !== undefined || track.sampleEnd !== undefined
                      ? [regStart / dur, regEnd / dur]
                      : null
                  }
                />
              </div>
              <div className="we-row">
                <button
                  disabled={!selSec}
                  title="Прослушать выделенный кусок"
                  onClick={() => selSec && onPreviewRegion(track, selSec[0], selSec[1])}
                >
                  ▶ выделение
                </button>
                <button
                  disabled={!selSec}
                  title="Ноты (и скрэтч) будут играть только этот кусок сэмпла"
                  onClick={() =>
                    selSec &&
                    onChange({
                      sampleStart: +selSec[0].toFixed(4),
                      sampleEnd: +selSec[1].toFixed(4),
                    })
                  }
                >
                  оставить кусок
                </button>
                <button
                  disabled={track.sampleStart === undefined && track.sampleEnd === undefined}
                  title="Убрать обрезку — играть сэмпл целиком"
                  onClick={() => onChange({ sampleStart: undefined, sampleEnd: undefined })}
                >
                  сброс
                </button>
                <span className="we-sep" />
                <label title="Начало куска, с">
                  старт
                  <NumField
                    value={Math.round(regStart * 1000) / 1000} min={0} max={Math.max(0.001, dur - 0.001)} step={0.01} narrow
                    onChange={(v) => onChange({ sampleStart: +v.toFixed(4) })}
                  />
                </label>
                <label title="Конец куска, с">
                  конец
                  <NumField
                    value={Math.round(regEnd * 1000) / 1000} min={0.001} max={dur} step={0.01} narrow
                    onChange={(v) => onChange({ sampleEnd: +v.toFixed(4) })}
                  />
                </label>
                {selSec && (
                  <span className="mini-info">
                    выделено {(selSec[1] - selSec[0]).toFixed(2)} с ({selSec[0].toFixed(2)}–{selSec[1].toFixed(2)})
                  </span>
                )}
              </div>
              <div className="we-row" data-ob="we-fft">
                <button
                  title="Тембровый слепок куска (или всего сэмпла): усреднённый спектр → гармоники. Дальше крути их как свою волну"
                  onClick={decompose}
                >
                  разложить в гармоники
                </button>
                <label title="Максимум гармоник: 64 — на слух почти оригинал и копеечная нагрузка, 128–256 — точнее, дороже">
                  точность
                  <NumField
                    value={fftK} min={8} max={256} step={8} narrow
                    onChange={(v) => setFftK(Math.round(v))}
                  />
                </label>
                <label title="Основная частота, Гц: 0 — определить автоматически (автокорреляция). Нетональному материалу задай сам">
                  f0, Гц
                  <NumField
                    value={Math.round(f0Manual)} min={0} max={2000} step={5} narrow
                    onChange={(v) => setF0Manual(v)}
                  />
                </label>
              </div>
              <div className="we-row ai-transform">
                <input
                  className="gen-prompt"
                  placeholder="преобразовать по описанию: темнее, с реверберацией, замедленно…"
                  title="ИИ-преобразование сэмпла (audio-to-audio): опиши, что сделать с этим звуком — результат ляжет в слот новым сэплом"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) onTransformSample(track.id, aiPrompt.trim(), aiStrength);
                  }}
                />
                <label title="Сила преобразования: 20% — лёгкая приправа, 80% — почти новый звук">
                  сила
                  <NumField
                    value={Math.round(aiStrength * 100)} min={5} max={100} step={5} narrow
                    onChange={(v) => setAiStrength(v / 100)}
                  />%
                </label>
                <button
                  disabled={!aiPrompt.trim() || busy}
                  onClick={() => onTransformSample(track.id, aiPrompt.trim(), aiStrength)}
                >
                  {busy ? 'преобразую…' : 'преобразовать'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'wave' && (
        <div className="we-body">
          {points ? (
            <div data-ob="we-canvas">
              <WaveCanvas data={points} sampleRate={CYCLE_N} editable onDraw={drawPoint} />
            </div>
          ) : (
            <div data-ob="we-canvas">
              <WaveCanvas data={cycle} sampleRate={CYCLE_N} cycles={4} />
            </div>
          )}
          <div className="we-row" data-ob="we-wave-tools">
            <span className="we-cap">заготовка:</span>
            {(['sine', 'saw', 'square', 'noise'] as const).map((k) => (
              <button
                key={k}
                title={`Пересобрать тембр: ${PARTIAL_TYPE_LABELS[k]}${k === 'noise' ? ' (зерно — размер крупы)' : ''}`}
                onClick={() => {
                  pointsRef.current = null;
                  setPoints(null);
                  onChange({ waveform: 'wave', wave: genPartials(k) });
                }}
              >
                {PARTIAL_TYPE_LABELS[k]}
              </button>
            ))}
            <span className="we-sep" />
            {points ? (
              <button
                title="Рисунок уже переведён в гармоники и звучит — это возврат к их виду"
                onClick={() => {
                  pointsRef.current = null;
                  setPoints(null);
                }}
              >
                к гармоникам
              </button>
            ) : (
              <button
                title="Нарисовать форму мышью — тембр меняется прямо во время рисования"
                onClick={() => {
                  const pts = new Float32Array(cycle);
                  pointsRef.current = pts;
                  setPoints(pts);
                }}
              >
                рисовать форму
              </button>
            )}
            <span className="we-sep" />
            <button
              title="Прослушать одну ноту этим тембром (тоника шкалы дорожки)"
              onClick={() => onPreviewNote({ ...track, waveform: 'wave', wave })}
            >
              ▶ нота
            </button>
          </div>

          <div className="we-partials" data-ob="we-partials">
            {wave.partials.map((p, i) => (
              <div className="partial-row" key={i}>
                <button className="remove" title="Убрать парциал" onClick={() => removePartial(i)}>×</button>
                <label title="Множитель к ноте: 2 — октава выше, 1.5 — квинта, дроби — микротюнинг тембра">
                  ×
                  <NumField
                    value={Math.round(p.ratio * 100) / 100} min={0.25} max={64} step={0.25} narrow
                    onChange={(v) => setPartial(i, { ratio: Math.round(v * 100) / 100 })}
                  />
                </label>
                <label title="Амплитуда парциала, %">
                  <NumField
                    value={Math.round(p.amp * 100)} min={0} max={100} step={5} narrow
                    onChange={(v) => setPartial(i, { amp: v / 100 })}
                  />%
                </label>
                <select
                  value={p.type}
                  title="Форма парциала"
                  onChange={(e) => setPartial(i, { type: e.target.value as WavePartial['type'] })}
                >
                  {(Object.keys(PARTIAL_TYPE_LABELS) as WavePartial['type'][]).map((t) => (
                    <option key={t} value={t}>{PARTIAL_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="we-row">
              <button onClick={addPartial} title="Добавить парциал">+ парциал</button>
              {hasNoise && (
                <label title="Размер зерна шумовых парциалов, мс: 10 — пыль, 100 — крупа, 300 — лоскуты">
                  зерно шума, мс
                  <NumField
                    value={Math.round(wave.noiseGrainMs ?? 40)} min={5} max={500} step={5}
                    onChange={(v) => setWave({ noiseGrainMs: Math.round(v) })}
                  />
                </label>
              )}
              <span className="mini-info">{wave.partials.length}/64 парциалов</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
