import { t as msg, useLocale } from '../i18n';
// Выбор шкалы трека: компактная выпадашка с поиском у кнопки «шкала» в
// тулбаре стана (была модалка — забивала экран; пресетов много, поэтому
// список с внутренним скроллом и мелким шрифтом, стан остаётся виден).
// Поиск по названию/группе/подсказке + те же инструменты: N-ET и своя
// шкала дробями. Закрытие: выбор, Esc, ✕, клик мимо.

import { useEffect, useMemo, useRef, useState } from 'react';
import { alertDialog } from './dialogs';
import { HelpHint } from '../onboarding/Onboarding';
import { scaleGroupName, SCALE_GROUP_ORDER, SCALE_PRESETS, parseRatios, presetName } from '../music/scales';

interface Props {
  current: number[];
  onPick: (ratios: number[]) => void;
  onClose: () => void;
}

export function ScalePicker({ current, onPick, onClose }: Props) {
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [etSteps, setEtSteps] = useState(12);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Клик мимо — закрыть. Клик по кнопке «шкала» не считается мимо:
    // её собственный onClick переключит выпадашку (общая обёртка
    // .rt-scale-wrap), иначе «закрыть кнопкой» ломалось бы двойным тогглом.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current?.contains(t)) return;
      if (t instanceof Element && t.closest('.rt-scale-wrap')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? SCALE_PRESETS.filter((p) => [p.name, p.sourceName, scaleGroupName(p.group), p.group, p.hint ?? ''].join(' ').toLowerCase().includes(q))
      : SCALE_PRESETS;
    return SCALE_GROUP_ORDER.map((g) => ({ g, items: filtered.filter((p) => p.group === g) })).filter(
      (x) => x.items.length > 0,
    );
  }, [query, locale]);

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
        msg("scalePicker.enterCommaSeparatedNumbersOrRatiosSuch"),
        msg("scalePicker.customScale"),
      );
      return;
    }
    pick(ratios);
  };

  return (
    <div className="scale-dd" ref={ref} role="dialog" aria-label={msg("scalePicker.chooseScale")} data-ob="scale-picker">
      <div className="scale-dd-head">
        {msg("scalePicker.gridTuning")}<HelpHint guide="scales" step={1} label={msg("scalePicker.tourScalesAndTuning")} />
        <span className="spacer" />
        <button className="scale-dd-close" title={msg("scalePicker.closeEsc")} onClick={onClose}>
          ✕
        </button>
      </div>
      <input
        className="browser-search"
        data-ob="scale-search"
        autoFocus
        placeholder={msg("scalePicker.searchSlendroShrutiFifthGamelan")}
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
                  key={p.sourceName}
                  className={'scale-item' + (presetName(current) === p.name ? ' sel' : '')}
                  title={msg("scalePicker.steps", {p0: p.hint ?? p.name, p1: p.ratios.length - 1})}
                  onClick={() => pick(p.ratios)}
                >
                  <span className="inst-name">{p.name}</span>
                  <span className="inst-hint">{p.hint ?? msg("scalePicker.steps8", {p0: p.ratios.length - 1})}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="empty">{msg("scalePicker.noMatches")}</p>}
      </div>
      <div className="scale-tools" data-ob="scale-tools">
        <label title={msg("scalePicker.nEqualStepsPerOctave12Gives")}>
          {msg("scalePicker.equalSteps")}<span className="inline">
            <input
              type="number"
              min={2}
              max={48}
              value={etSteps}
              onChange={(e) => setEtSteps(Number(e.target.value))}
            />
            <button onClick={applyEqualTemperament} title={msg("scalePicker.buildAScaleWithNEqualSteps")}>{msg("scalePicker.build")}</button>
          </span>
        </label>
        <label title={msg("scalePicker.customScaleFrequencyRatiosAsCommaSeparated")}>
          {msg("scalePicker.custom")}<span className="inline">
            <input
              className="scale-custom-input"
              placeholder={msg("scalePicker.eG19854")}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyCustom();
              }}
            />
            <button onClick={applyCustom} title={msg("scalePicker.applyOrPressEnter")}>{msg("scalePicker.apply")}</button>
          </span>
        </label>
      </div>
    </div>
  );
}
