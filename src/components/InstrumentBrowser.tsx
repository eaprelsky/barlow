// Браузер инструментов: сетка карточек-пресетов по категориям с поиском.
// Выпадающий список перестал масштабироваться (12 моделей голоса, дальше —
// плагины); сетка + поиск — как браузер инструментов в DAW. Первыми идут
// свои пресеты (категория «мои», сохраняются с панели трека).

import { useEffect, useMemo, useState } from 'react';
import type { InstrumentPreset } from '../music/instrumentPresets';
import {
  CATEGORY_ORDER,
  INSTRUMENT_PRESETS,
  USER_CATEGORY,
  deleteUserPreset,
  loadUserPresets,
} from '../music/instrumentPresets';
import { WAVEFORM_LABELS } from '../types';
import { confirmDialog } from './dialogs';

interface Props {
  title: string;
  // Что происходит по клику на карточку: добавить трек или сменить тембр.
  onPick: (preset: InstrumentPreset) => void;
  onClose: () => void;
}

export function InstrumentBrowser({ title, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  // Удаление своего пресета перечитывает список из хранилища.
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const all = useMemo(
    () => [...loadUserPresets(), ...INSTRUMENT_PRESETS],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listVersion],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Поиск смотрит и в пояснение встроенных — «дабстеп» находит воббл.
    const filtered = q
      ? all.filter((p) =>
          [p.name, p.hint ?? '', p.category, WAVEFORM_LABELS[p.track.waveform ?? 'sine']]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : all;
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: filtered.filter((p) => p.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [all, query]);

  const removeUser = async (name: string) => {
    const ok = await confirmDialog({
      title: 'удалить пресет?',
      text: `«${name}» исчезнет из категории «мои». Дорожки, где он уже применён, не изменятся.`,
      okLabel: 'удалить',
      danger: true,
    });
    if (!ok) return;
    deleteUserPreset(name);
    setListVersion((v) => v + 1);
  };

  const waveOf = (p: InstrumentPreset) => WAVEFORM_LABELS[p.track.waveform ?? 'sine'];

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
                {g.items.map((p) =>
                  p.category === USER_CATEGORY ? (
                    // div: внутри карточки кнопка удаления, button в button нельзя
                    <div
                      key={p.name}
                      className="inst-card user"
                      role="button"
                      tabIndex={0}
                      title={`волна: ${waveOf(p)}`}
                      onClick={() => onPick(p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onPick(p);
                      }}
                    >
                      <span className="inst-name">{p.name}</span>
                      <button
                        className="inst-del"
                        title="Удалить пресет"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeUser(p.name);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      key={p.name}
                      className="inst-card"
                      title={`волна: ${waveOf(p)}`}
                      onClick={() => onPick(p)}
                    >
                      <span className="inst-name">{p.name}</span>
                    </button>
                  ),
                )}
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
