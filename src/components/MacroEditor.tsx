import { t as msg, useLocale, pluralCategory } from '../i18n';
import { DEFAULT_MACROS, type InstrumentParameterId, type SoundMacro } from '../music/macros';
import { PARAMETERS } from '../parameters';
import { Knob } from './Knob';
const assignmentCount = (n: number) => {
  const form = pluralCategory(n);
  const key = form === 'one' ? 'macroEditor.count.one' : form === 'few' ? 'macroEditor.count.few' : form === 'many' ? 'macroEditor.count.many' : 'macroEditor.count.other';
  return msg(key, {p0: n});
};
const targets = Object.entries(PARAMETERS).filter(([id]) => id.startsWith('instrument.'));
const depthScale = (id: InstrumentParameterId) => PARAMETERS[id].scale !== 'log' && PARAMETERS[id].unit === '%' ? 100 : 1;
const depthLimit = (id: InstrumentParameterId) => PARAMETERS[id].scale === 'log' ? 16 : PARAMETERS[id].max - PARAMETERS[id].min;
export function MacroEditor({ macros, onChange }: { macros?: SoundMacro[]; onChange: (macros: SoundMacro[]) => void }) {
  useLocale();
  const list = macros ?? [];
  const update = (index: number, value: Partial<SoundMacro>) => onChange(list.map((m, i) => i === index ? { ...m, ...value } : m));
  return <details className="macro-editor" data-help="macros">
    <summary>{msg("macroEditor.macros")}{list.length > 0 ? `(${list.length})` : ''}</summary>
    <div className="macro-grid">{list.map((m, index) => <section key={m.id} className="macro-item" data-help="macro-tile">
      <div className="macro-head"><Knob help="macro-value" label={m.name} value={m.value * 100} min={0} max={100} step={1} onChange={value => update(index, { value: value / 100 })} />
        <div><span className="sub-cap">{assignmentCount(m.bindings.length)}</span><button data-help="macro-center" onClick={() => update(index, { value: 0.5 })}>{msg("macroEditor.center")}</button></div>
      </div>
      <details data-help="macro-bindings"><summary>{msg("macroEditor.assignments3")}</summary>
        <input data-help="macro-name" aria-label={msg("macroEditor.macroName")} maxLength={48} value={m.name} onChange={e => update(index, { name: e.target.value })} />
        {m.bindings.map((b, bi) => <div className="macro-binding" data-help="macro-binding" key={bi}>
          <select data-help="macro-target" aria-label={msg("macroEditor.parameterFor", {p0: m.name})} value={b.target} onChange={e => { const target = e.target.value as InstrumentParameterId; update(index, { bindings: m.bindings.map((x, j) => j === bi ? { ...x, target, depth: Math.max(-depthLimit(target), Math.min(depthLimit(target), x.depth)) } : x) }); }}>
            {targets.map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </select>
          <Knob help="macro-depth" label={msg("macroEditor.amount", {p0: PARAMETERS[b.target].scale === 'log' ? msg("macroEditor.oct") : PARAMETERS[b.target].unit || msg("macroEditor.units")})} title={msg("macroEditor.assignmentAmountFor", {p0: m.name})} value={b.depth * depthScale(b.target)} min={-depthLimit(b.target) * depthScale(b.target)} max={depthLimit(b.target) * depthScale(b.target)} step={PARAMETERS[b.target].scale === 'log' ? .1 : PARAMETERS[b.target].step * depthScale(b.target)} bipolar
            onChange={depth => update(index, { bindings: m.bindings.map((x, j) => j === bi ? { ...x, depth: depth / depthScale(b.target) } : x) })} />
          <button data-help="macro-remove-binding" aria-label={msg("macroEditor.removeAssignment", {p0: bi + 1})} onClick={() => update(index, { bindings: m.bindings.filter((_, j) => j !== bi) })}>×</button>
        </div>)}
        <div className="macro-actions"><button data-help="macro-add-binding" disabled={m.bindings.length >= 8} onClick={() => update(index, { bindings: [...m.bindings, { target: 'instrument.filterFreq', depth: 1 }] })}>{msg("macroEditor.assignment")}</button>
          <button data-help="macro-delete" onClick={() => onChange(list.filter((_, i) => i !== index))}>{msg("macroEditor.deleteMacro")}</button></div>
      </details>
    </section>)}</div>
    <div className="macro-actions"><button data-help="macro-add" disabled={list.length >= 8} onClick={() => onChange([...list, { id: crypto.randomUUID(), name: msg("macroEditor.macro"), value: 0.5, bindings: [{ target: 'instrument.filterFreq', depth: 1 }] }])}>{msg("macroEditor.macro12")}</button>
    {list.length === 0 && <button data-help="macro-defaults" onClick={() => onChange(structuredClone(DEFAULT_MACROS))}>{msg("macroEditor.brightnessLengthWidth")}</button>}</div>
  </details>;
}
