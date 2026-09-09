import { useEffect, useRef, useState } from 'react';

const KEY = 'barlow.library-width.v1';
const DEFAULT = 272;
const limit = () => Math.max(240, Math.min(560, window.innerWidth - 720));
const clamp = (value: number) => Math.max(240, Math.min(limit(), value));

export function useLibraryWidth(onError: (message: string) => void) {
  const [preferred, setPreferred] = useState(() => {
    try { const n = Number(localStorage.getItem(KEY)); return n >= 240 && n <= 560 ? n : DEFAULT; }
    catch { return DEFAULT; }
  });
  const [maximum, setMaximum] = useState(limit);
  const drag = useRef<{ x: number; width: number; before: number } | null>(null);
  const value = useRef(preferred);
  value.current = preferred;
  const change = (n: number) => { value.current = n; setPreferred(n); };
  const save = () => {
    try { localStorage.setItem(KEY, String(value.current)); }
    catch { onError('Не удалось сохранить ширину панели'); }
  };
  useEffect(() => {
    const resize = () => setMaximum(limit());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const width = Math.min(preferred, maximum);
  const separator = <div className="library-resize" role="separator" tabIndex={0}
    aria-label="Ширина панели инструментов" aria-orientation="vertical"
    aria-valuemin={240} aria-valuemax={maximum} aria-valuenow={width}
    data-help="library-width" title="Потяни для изменения ширины; двойной клик — сброс"
    onDoubleClick={() => { change(clamp(DEFAULT)); save(); }}
    onPointerDown={e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {x:e.clientX, width, before:preferred};
    }}
    onPointerMove={e => { if (drag.current) change(clamp(drag.current.width + e.clientX - drag.current.x)); }}
    onPointerUp={e => {
      if (!drag.current) return;
      drag.current = null; save(); e.currentTarget.releasePointerCapture(e.pointerId);
    }}
    onLostPointerCapture={() => { if (drag.current) { change(drag.current.before); drag.current = null; } }}
    onPointerCancel={() => { if (drag.current) { change(drag.current.before); drag.current = null; } }}
    onKeyDown={e => {
      if (e.key === 'Escape' && drag.current) { change(drag.current.before); drag.current = null; e.preventDefault(); return; }
      const n = e.key === 'ArrowRight' ? width + (e.shiftKey ? 40 : 16)
        : e.key === 'ArrowLeft' ? width - (e.shiftKey ? 40 : 16)
        : e.key === 'Home' ? 240 : e.key === 'End' ? maximum : null;
      if (n !== null) { e.preventDefault(); change(clamp(n)); save(); }
    }} />;
  return {width, separator};
}
