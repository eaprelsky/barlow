// Браузер инструментов: сетка карточек-пресетов по категориям с поиском.
// Выпадающий список перестал масштабироваться (12 моделей голоса, дальше —
// плагины); сетка + поиск — как браузер инструментов в DAW.

import { useEffect, useMemo, useState } from 'react';
import type { InstrumentPreset } from '../music/instrumentPresets';
import { CATEGORY_ORDER, INSTRUMENT_PRESETS } from '../music/instrumentPresets';
import { WAVEFORM_LABELS } from '../types';

interface Props {
  title: string;
  // Что происходит по клику на карточку: добавить трек или сменить тембр.
  onPick: (preset: InstrumentPreset) => void;
  onClose: () => void;
}

export function InstrumentBrowser({ title, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? INSTRUMENT_PRESETS.filter((p) =>
          [p.name, p.hint, p.category, WAVEFORM_LABELS[p.track.waveform ?? 'sine']]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : INSTRUMENT_PRESETS;
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: filtered.filter((p) => p.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal browser" role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <input
          className="browser-search"
          autoFocus
          placeholder="поиск: имя, тембр, категория…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="browser-grid">
          {groups.map((g) => (
            <div className="browser-cat" key={g.cat}>
              <span className="browser-cat-label">{g.cat}</span>
              <div className="browser-cards">
                {g.items.map((p) => (
                  <button
                    key={p.name}
                    className="inst-card"
                    title={`${p.hint}\nволна: ${WAVEFORM_LABELS[p.track.waveform ?? 'sine']}`}
                    onClick={() => onPick(p)}
                  >
                    <span className="inst-name">{p.name}</span>
                    <span className="inst-wave">{WAVEFORM_LABELS[p.track.waveform ?? 'sine']}</span>
                    <span className="inst-hint">{p.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && <p className="empty">Ничего не нашлось</p>}
        </div>
        <div className="modal-btns">
          <span className="spacer" />
          <button onClick={onClose}>закрыть</button>
        </div>
      </div>
    </div>
  );
}
