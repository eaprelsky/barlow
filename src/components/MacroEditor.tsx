import { DEFAULT_MACROS, type InstrumentParameterId, type SoundMacro } from '../music/macros';
import { PARAMETERS } from '../parameters';
import { Knob } from './Knob';
import { NumField } from './NumField';
const targets = Object.entries(PARAMETERS).filter(([id]) => id.startsWith('instrument.'));
const depthLimit = (id: InstrumentParameterId) => PARAMETERS[id].scale === 'log' ? 16 : PARAMETERS[id].max - PARAMETERS[id].min;
export function MacroEditor({ macros, onChange }: { macros?: SoundMacro[]; onChange: (macros: SoundMacro[]) => void }) {
  const list = macros ?? [];
  const update = (index: number, value: Partial<SoundMacro>) => onChange(list.map((m, i) => i === index ? { ...m, ...value } : m));
  return <details className="macro-editor">
    <summary>макросы {list.length > 0 ? `(${list.length})` : ''}</summary>
    <p className="hint">Середина — исходный тембр. Размах — в единицах ручки, для частоты и размера зерна — в октавах.</p>
    <div className="inline">{list.map((m, index) => <div key={m.id} className="macro-item">
      <Knob label={m.name} value={m.value} min={0} max={1} step={0.01} onChange={(value) => update(index, { value })} />
      <details><summary>назначения</summary>
        <input aria-label="имя макроса" maxLength={48} value={m.name} onChange={(e) => update(index, { name: e.target.value })} />
        {m.bindings.map((b, bi) => <div className="inline" key={bi}>
          <select aria-label={`параметр ${m.name}`} value={b.target} onChange={(e) => update(index, { bindings: m.bindings.map((x, j) => j === bi ? { ...x, target: e.target.value as InstrumentParameterId } : x) })}>
            {targets.map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </select>
          <NumField ariaLabel={`размах ${m.name}`} value={b.depth} min={-depthLimit(b.target)} max={depthLimit(b.target)} step={0.1}
            onChange={(depth) => update(index, { bindings: m.bindings.map((x, j) => j === bi ? { ...x, depth } : x) })} />
          <button aria-label={`удалить назначение ${bi + 1}`} onClick={() => update(index, { bindings: m.bindings.filter((_, j) => j !== bi) })}>×</button>
        </div>)}
        <button disabled={m.bindings.length >= 8} onClick={() => update(index, { bindings: [...m.bindings, { target: 'instrument.filterFreq', depth: 1 }] })}>+ назначение</button>
        <button onClick={() => update(index, { value: 0.5 })}>центр</button>
        <button onClick={() => onChange(list.filter((_, i) => i !== index))}>удалить макрос</button>
      </details>
    </div>)}</div>
    <button disabled={list.length >= 8} onClick={() => onChange([...list, { id: crypto.randomUUID(), name: 'макрос', value: 0.5, bindings: [{ target: 'instrument.filterFreq', depth: 1 }] }])}>+ макрос</button>
    {list.length === 0 && <button onClick={() => onChange(structuredClone(DEFAULT_MACROS))}>яркость · длина · ширина</button>}
  </details>;
}
