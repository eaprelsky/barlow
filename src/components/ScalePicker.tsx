// Выбор шкалы трека: модалка с поиском. Пресетов стало много (западные,
// мировые, экспериментальные строи) — выпадашка перестала масштабироваться;
// поиск по названию/группе/подсказке плюс те же инструменты, что были
// в настройках: N-ET и своя шкала дробями.

import { useEffect, useMemo, useState } from 'react';
import { alertDialog } from './dialogs';
import { SCALE_GROUP_ORDER, SCALE_PRESETS, parseRatios, presetName } from '../music/scales';

interface Props {
  current: number[];
  onPick: (ratios: number[]) => void;
  onClose: () => void;
}

export function ScalePicker({ current, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [etSteps, setEtSteps] = useState(12);
  const [custom, setCustom] = useState('');

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
      ? SCALE_PRESETS.filter((p) => [p.name, p.group, p.hint ?? ''].join(' ').toLowerCase().includes(q))
      : SCALE_PRESETS;
    return SCALE_GROUP_ORDER.map((g) => ({ g, items: filtered.filter((p) => p.group === g) })).filter(
      (x) => x.items.length > 0,
    );
  }, [query]);

  const pick = (ratios: number[]) => {
    onPick(ratios);
    onClose();
  };

  const applyEqualTemperament = () => {
    const n = Math.round(etSteps);
    if (n < 2 || n > 48) return;
    pick(Array.from({ length: n + 1 }, (_, k) => +(2 ** (k / n)).toFixed(6)));
  };

  const applyCustom = () => {
    const ratios = parseRatios(custom);
    if (!ratios) {
      void alertDialog(
        'Не понял шкалу: числа или дроби (3/2) через запятую, каждое от 0 до 16, до 48 значений',
        'своя шкала',
      );
      return;
    }
    pick(ratios);
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal browser" role="dialog" aria-modal="true">
        <h3>шкала нотного стана</h3>
        <input
          className="browser-search"
          autoFocus
          placeholder="поиск: слендро, шрути, квинта, гамелан…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="scale-list">
          {groups.map((g) => (
            <div className="browser-cat" key={g.g}>
              <span className="browser-cat-label">{g.g}</span>
              <div className="scale-items">
                {g.items.map((p) => (
                  <button
                    key={p.name}
                    className={'scale-item' + (presetName(current) === p.name ? ' sel' : '')}
                    title={`${p.hint ?? p.name}\n${p.ratios.length - 1} ступеней`}
                    onClick={() => pick(p.ratios)}
                  >
                    <span className="inst-name">{p.name}</span>
                    <span className="inst-hint">{p.hint ?? `${p.ratios.length - 1} ступеней`}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && <p className="empty">Ничего не нашлось</p>}
        </div>
        <div className="scale-tools">
          <label title="Равномерно темперированная шкала: N равных ступеней в октаве. 12 — обычные полутоны, 24 — четвертитоны, 5 — как слендро, 17/19/22/31/53 — микрохроматика и турецкий строй">
            равных ступеней
            <span className="inline">
              <input
                type="number"
                min={2}
                max={48}
                value={etSteps}
                onChange={(e) => setEtSteps(Number(e.target.value))}
              />
              <button onClick={applyEqualTemperament} title="Построить шкалу из N равных ступеней">построить</button>
            </span>
          </label>
          <label title="Своя шкала: любые отношения частот — множители и дроби через запятую. Дроби дают чистые интервалы: 3/2 — квинта, 5/4 — большая терция">
            своя
            <span className="inline">
              <input
                className="scale-custom-input"
                placeholder="напр. 1, 9/8, 5/4, 3/2, 7/4, 2"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyCustom();
                }}
              />
              <button onClick={applyCustom} title="Применить (Enter тоже)">применить</button>
            </span>
          </label>
        </div>
        <div className="modal-btns">
          <span className="spacer" />
          <button onClick={onClose}>закрыть</button>
        </div>
      </div>
    </div>
  );
}
