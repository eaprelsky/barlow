import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Канвас волны для редактора: пики min/max по колонкам с зумом колесом
// (как в Audacity), выделение драгом, подсветка обрезанного куска и режим
// рисования точек. Память: пирамида уровней пиков (минимум/максимум на 2^k
// сэмплов) строится лениво под текущий зум — глубокие уровни не живут
// без надобности.

interface Props {
  /** Моно-данные: канал сэмпла или один цикл своей волны (амплитуда 0..1). */
  data: Float32Array | null;
  /** Частота сэмпла — для подписей времени. У волны = длина цикла за 1 «с». */
  sampleRate: number;
  /** Волна: сколько циклов показывать (зум по повторениям). */
  cycles?: number;
  /** Выделение, доли 0..1 показанной длины. */
  sel?: [number, number] | null;
  onSel?: (a: number, b: number) => void;
  /** Закрашенная зона-регион (обрезка), доли 0..1. */
  region?: [number, number] | null;
  /** Режим рисования: тянешь мышью — задаёшь значения точек. */
  editable?: boolean;
  onDraw?: (xNorm: number, y: number) => void;
  height?: number;
}

const COL_BG = '#0e1319';
const COL_WAVE = '#f2b263';
const COL_DIM = 'rgba(242, 178, 99, 0.22)';
const COL_SEL = 'rgba(122, 190, 255, 0.14)';
const COL_SEL_EDGE = '#7abeff';
const COL_TEXT = 'rgba(255, 255, 255, 0.35)';

export function WaveCanvas({
  data,
  sampleRate,
  cycles = 1,
  sel = null,
  onSel,
  region = null,
  editable = false,
  onDraw,
  height = 220,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Вид: доли 0..1 показанной длины (data × cycles).
  const [view, setView] = useState<[number, number]>([0, 1]);
  // Пирамида пиков: уровень k = блок 2^k сэмплов, пары [min, max].
  const pyramid = useRef<Map<number, Float32Array>>(new Map());
  const dragSel = useRef<{ x0: number; moved: boolean } | null>(null);

  // Данные сменились (гармоники, новый сэмпл, правка точек) — старые
  // уровни пиков больше не про эту волну, иначе картинка «не двигается».
  useEffect(() => {
    pyramid.current.clear();
  }, [data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, w, h);
    const mid = h / 2;
    if (!data || data.length === 0) {
      ctx.strokeStyle = COL_TEXT;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      return;
    }
    const total = data.length * cycles;
    const from = Math.floor(view[0] * total);
    const to = Math.ceil(view[1] * total);
    const span = Math.max(1, to - from);

    // Регион-подсветка (обрезка): вне региона — приглушённый цвет.
    const paintCol = (x: number) => {
      if (!region) return COL_WAVE;
      const midp = (from + (x + 0.5) * perPx) / total;
      return midp >= region[0] && midp <= region[1] ? COL_WAVE : COL_DIM;
    };

    const perPx = span / w;
    if (perPx < 1) {
      // Глубокий зум: линия по точкам.
      ctx.strokeStyle = paintCol(0);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const i = Math.min(data.length * cycles - 1, Math.round(from + x * perPx));
        const v = data[i % data.length];
        const y = mid - v * (h / 2 - 6);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      // Пики: уровень k = log2(сэмплов на колонку); соседние бакеты
      // агрегируем по пикам. Кэш чистится при смене данных (см. выше).
      const level = Math.max(0, Math.round(Math.log2(perPx)));
      let lvl = pyramid.current.get(level);
      if (!lvl) {
        const block = 2 ** level;
        const n = Math.ceil(data.length / block);
        lvl = new Float32Array(n * 2);
        for (let b = 0; b < n; b++) {
          let mn = 0;
          let mx = 0;
          for (let i = b * block; i < Math.min((b + 1) * block, data.length); i++) {
            const v = data[i];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          lvl[b * 2] = mn;
          lvl[b * 2 + 1] = mx;
        }
        pyramid.current.set(level, lvl);
        if (pyramid.current.size > 6) pyramid.current.delete(pyramid.current.keys().next().value as number);
      }
      const block = 2 ** level;
      for (let x = 0; x < w; x++) {
        const i0 = Math.floor(from + x * perPx);
        const i1 = Math.floor(from + (x + 1) * perPx);
        let mn = 0;
        let mx = 0;
        // Данные повторяются циклами: индекс по модулю длины цикла.
        for (let i = i0; i <= Math.min(i1, from + span); i += block) {
          const ci = ((i % data.length) + data.length) % data.length;
          const b = Math.floor(ci / block);
          if (b * 2 + 1 >= lvl.length) continue;
          const lo = lvl[b * 2];
          const hi = lvl[b * 2 + 1];
          if (lo < mn) mn = lo;
          if (hi > mx) mx = hi;
        }
        ctx.strokeStyle = paintCol(x);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const y0 = mid - mx * (h / 2 - 6);
        const y1 = mid - mn * (h / 2 - 6);
        ctx.moveTo(x + 0.5, Math.min(y0, y1));
        ctx.lineTo(x + 0.5, Math.max(y0, y1, mid - 0.5));
        ctx.stroke();
      }
    }

    // Линия центра.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    // Выделение.
    if (sel && sel[1] > sel[0]) {
      const xa = ((sel[0] - view[0]) / (view[1] - view[0])) * w;
      const xb = ((sel[1] - view[0]) / (view[1] - view[0])) * w;
      ctx.fillStyle = COL_SEL;
      ctx.fillRect(xa, 0, xb - xa, h);
      ctx.strokeStyle = COL_SEL_EDGE;
      ctx.beginPath();
      ctx.moveTo(xa + 0.5, 0);
      ctx.lineTo(xa + 0.5, h);
      ctx.moveTo(xb - 0.5, 0);
      ctx.lineTo(xb - 0.5, h);
      ctx.stroke();
    }

    // Линейка времени: шаг красивый по зуму.
    const spanSec = span / sampleRate;
    const stepCandidates = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
    const step = stepCandidates.find((s) => (s * w) / spanSec > 70) ?? 60;
    ctx.fillStyle = COL_TEXT;
    ctx.font = '10px ui-monospace, monospace';
    const first = Math.ceil(spanSec * view[0] / step) * step;
    for (let t = first; t < spanSec * view[1]; t += step) {
      const x = ((t / spanSec - view[0]) / (view[1] - view[0])) * w;
      ctx.fillRect(x, 0, 1, 4);
      ctx.fillText(t >= 10 ? `${Math.round(t)}с` : t.toFixed(t % 1 ? 2 : 0) + 'с', x + 3, 11);
    }
  }, [data, sampleRate, cycles, view, sel, region, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // Зум колесом — нативный слушатель (React onWheel пассивный,
  // preventDefault в нём не работает; см. AGENTS).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const factor = e.deltaY < 0 ? 1 / 1.25 : 1.25;
      setView(([a, b]) => {
        const span = b - a;
        const next = Math.min(1, span * factor);
        const focus = a + x * span;
        let na = focus - x * next;
        let nb = na + next;
        if (na < 0) { na = 0; nb = next; }
        if (nb > 1) { nb = 1; na = 1 - next; }
        return [na, nb] as [number, number];
      });
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  // Драг: выделение (или рисование в режиме точек).
  const xNorm = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  // Доля в данных (с учётом зума): рисование маппится в видимую область.
  const xData = (e: React.PointerEvent) => view[0] + xNorm(e) * (view[1] - view[0]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (editable && onDraw) {
      const x = xData(e);
      const r = wrapRef.current!.getBoundingClientRect();
      onDraw(x, 1 - (e.clientY - r.top) / r.height);
      dragSel.current = { x0: xNorm(e), moved: true };
      return;
    }
    dragSel.current = { x0: xNorm(e), moved: false };
    onSel?.(xNorm(e), xNorm(e));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragSel.current;
    if (!d) return;
    const x = xNorm(e);
    if (editable && onDraw) {
      const r = wrapRef.current!.getBoundingClientRect();
      const y = 1 - (e.clientY - r.top) / r.height;
      // Интерполяция между соседними событиями мыши — без дырок в линии.
      const steps = Math.max(1, Math.ceil(Math.abs(x - d.x0) * 600));
      for (let i = 1; i <= steps; i++) {
        const xx = d.x0 + (x - d.x0) * (i / steps);
        onDraw(view[0] + xx * (view[1] - view[0]), y);
      }
      dragSel.current = { x0: x, moved: true };
      return;
    }
    if (!d.moved && Math.abs(x - d.x0) < 0.003) return;
    d.moved = true;
    onSel?.(Math.min(d.x0, x), Math.max(d.x0, x));
  };

  const zoomBy = (factor: number) =>
    setView(([a, b]) => {
      const mid = (a + b) / 2;
      const next = Math.min(1, (b - a) * factor);
      let na = mid - next / 2;
      let nb = na + next;
      if (na < 0) { na = 0; nb = next; }
      if (nb > 1) { nb = 1; na = 1 - next; }
      return [na, nb] as [number, number];
    });

  const zoomToSel = () => {
    if (sel && sel[1] - sel[0] > 0.001) setView([sel[0], sel[1]]);
  };

  const toolBtn = (label: string, title: string, fn: () => void) => (
    <button className="wc-btn" title={title} onClick={fn}>{label}</button>
  );

  const zoomLabel = useMemo(() => {
    if (!data) return '';
    const span = (view[1] - view[0]) * (data.length * cycles);
    return span > sampleRate * 3
      ? `${(span / sampleRate).toFixed(1)} с`
      : span > sampleRate / 100
        ? `${Math.round(span)} фр`
        : `${span.toFixed(1)} фр`;
  }, [view, data, cycles, sampleRate]);

  return (
    <div className="wave-canvas-wrap">
      <div className="wc-toolbar" data-help="wave-view">
        {toolBtn('−', 'Отдалить', () => zoomBy(1.6))}
        {toolBtn('+', 'Приблизить', () => zoomBy(1 / 1.6))}
        {toolBtn('⟶', 'Прокрутить вправо', () =>
          setView(([a, b]) => {
            const d = (b - a) * 0.3;
            return [Math.min(1 - (b - a), a + d), Math.min(1, b + d)] as [number, number];
          }))}
        {toolBtn('⟵', 'Прокрутить влево', () =>
          setView(([a, b]) => {
            const d = (b - a) * 0.3;
            return [Math.max(0, a - d), Math.max(b - a, b - d)] as [number, number];
          }))}
        {sel !== null && sel !== undefined && toolBtn('⤢ к выделению', 'Показать только выделение', zoomToSel)}
        {toolBtn('весь', 'Показать всё', () => setView([0, 1]))}
        <span className="wc-zoom">{zoomLabel}</span>
        <span className="wc-hint">
          {editable ? 'рисование — протяни · зум — колесо' : 'выделение — протяни · зум — колесо'}
        </span>
      </div>
      <div
        ref={wrapRef}
        className={'wave-canvas' + (editable ? ' editable' : '')}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { dragSel.current = null; }}
        onPointerCancel={() => { dragSel.current = null; }}
        onDoubleClick={() => onSel?.(0, 1)}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
}
