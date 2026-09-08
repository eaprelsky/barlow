import { DEFAULT_MACROS, type InstrumentParameterId, type SoundMacro } from '../music/macros';
import { PARAMETERS } from '../parameters';
import { Knob } from './Knob';
const targets = Object.entries(PARAMETERS).filter(([id]) => id.startsWith('instrument.'));
const depthScale = (id: InstrumentParameterId) => PARAMETERS[id].scale !== 'log' && PARAMETERS[id].unit === '%' ? 100 : 1;
const depthLimit = (id: InstrumentParameterId) => PARAMETERS[id].scale === 'log' ? 16 : PARAMETERS[id].max - PARAMETERS[id].min;
export function MacroEditor({ macros, onChange }: { macros?: SoundMacro[]; onChange: (macros: SoundMacro[]) => void }) {
  const list = macros ?? [];
  const update = (index: number, value: Partial<SoundMacro>) => onChange(list.map((m, i) => i === index ? { ...m, ...value } : m));
  return <details className="macro-editor" data-help="macros">
    <summary>макросы {list.length > 0 ? `(${list.length})` : ''}</summary>
    <div className="macro-grid">{list.map((m, index) => <section key={m.id} className="macro-item" data-help="macro-tile">
      <div className="macro-head"><Knob help="macro-value" label={m.name} value={m.value * 100} min={0} max={100} step={1} onChange={value => update(index, { value: value / 100 })} />
        <div><span className="sub-cap">{m.bindings.length} назначений</span><button data-help="macro-center" onClick={() => update(index, { value: 0.5 })}>в центр</button></div>
      </div>
      <details data-help="macro-bindings"><summary>назначения</summary>
        <input data-help="macro-name" aria-label="имя макроса" maxLength={48} value={m.name} onChange={e => update(index, { name: e.target.value })} />
        {m.bindings.map((b, bi) => <div className="macro-binding" data-help="macro-binding" key={bi}>
          <select data-help="macro-target" aria-label={`параметр ${m.name}`} value={b.target} onChange={e => { const target = e.target.value as InstrumentParameterId; update(index, { bindings: m.bindings.map((x, j) => j === bi ? { ...x, target, depth: Math.max(-depthLimit(target), Math.min(depthLimit(target), x.depth)) } : x) }); }}>
            {targets.map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </select>
          <Knob help="macro-depth" label={`размах, ${PARAMETERS[b.target].scale === 'log' ? 'окт.' : PARAMETERS[b.target].unit || 'ед.'}`} title={`Размах назначения ${m.name}`} value={b.depth * depthScale(b.target)} min={-depthLimit(b.target) * depthScale(b.target)} max={depthLimit(b.target) * depthScale(b.target)} step={PARAMETERS[b.target].scale === 'log' ? .1 : PARAMETERS[b.target].step * depthScale(b.target)} bipolar
            onChange={depth => update(index, { bindings: m.bindings.map((x, j) => j === bi ? { ...x, depth: depth / depthScale(b.target) } : x) })} />
          <button data-help="macro-remove-binding" aria-label={`удалить назначение ${bi + 1}`} onClick={() => update(index, { bindings: m.bindings.filter((_, j) => j !== bi) })}>×</button>
        </div>)}
        <div className="macro-actions"><button data-help="macro-add-binding" disabled={m.bindings.length >= 8} onClick={() => update(index, { bindings: [...m.bindings, { target: 'instrument.filterFreq', depth: 1 }] })}>+ назначение</button>
          <button data-help="macro-delete" onClick={() => onChange(list.filter((_, i) => i !== index))}>удалить макрос</button></div>
      </details>
    </section>)}</div>
    <div className="macro-actions"><button data-help="macro-add" disabled={list.length >= 8} onClick={() => onChange([...list, { id: crypto.randomUUID(), name: 'макрос', value: 0.5, bindings: [{ target: 'instrument.filterFreq', depth: 1 }] }])}>+ макрос</button>
    {list.length === 0 && <button data-help="macro-defaults" onClick={() => onChange(structuredClone(DEFAULT_MACROS))}>яркость · длина · ширина</button>}</div>
  </details>;
}
