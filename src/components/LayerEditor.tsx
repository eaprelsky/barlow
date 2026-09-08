import { useState } from 'react';
import { instrumentOfFields, uid, type Instrument, type InstrumentLayer } from '../types';
import { INSTRUMENT_PRESETS, loadUserPresets } from '../music/instrumentPresets';
import { voiceSnapshot } from '../music/layers';
import { MSEG_SHAPES } from '../music/mseg';
import { MsegEditor } from './MsegEditor';
import { NumField } from './NumField';

export function LayerEditor({ inst, onChange }: { inst: Instrument; onChange: (patch: Partial<Instrument>, command?: boolean) => void }) {
  const [selected, select] = useState('');
  const layers = inst.layers ?? [], layer = layers.find(l => l.id === selected);
  const presets = [...loadUserPresets(), ...INSTRUMENT_PRESETS].filter(p => p.track.waveform !== 'sample' || p.track.sampleId || p.track.sampleZones?.length || p.track.sampleSlices?.length);
  const update = (id: string, patch: Partial<InstrumentLayer>, command = false) => onChange({ layers: layers.map(l => l.id === id ? { ...l, ...patch } : l) }, command);
  return <details className="layer-editor" data-ob="instrument-layers" open={layers.length ? true : undefined}>
    <summary>слои <span>{layers.length + 1}/4 голосов</span></summary>
    <div className="layer-row"><span>основной голос · редактор ниже</span><label>уровень <NumField ariaLabel="Уровень основного голоса, %" value={(inst.baseVoiceGain ?? 1) * 100} min={0} max={100} step={1} onChange={v => onChange({ baseVoiceGain: v / 100 })} /> %</label><span /><span /></div>
    {layers.map(l => <div key={l.id} className={`layer-row ${selected === l.id ? 'selected' : ''}`}>
      <button className="layer-name" onClick={() => select(selected === l.id ? '' : l.id)} title="Настроить источник и огибающую слоя">{selected === l.id ? '▾' : '▸'} {l.name}</button>
      <label>уровень <NumField ariaLabel={`Уровень слоя ${l.name}, %`} value={l.gain * 100} min={0} max={100} step={1} onChange={v => update(l.id, { gain: v / 100 })} /> %</label>
      <label>частота × <NumField ariaLabel={`Отношение частоты слоя ${l.name}`} value={l.ratio} min={.125} max={8} step={.001} w={65} onChange={ratio => update(l.id, { ratio })} /></label>
      <button aria-label={`Удалить слой ${l.name}`} onClick={() => onChange({ layers: layers.filter(x => x.id !== l.id) }, true)}>×</button>
    </div>)}
    <div className="mseg-toolbar"><select aria-label="Добавить слой из пресета" disabled={layers.length >= 3} value="" onChange={e => { const p = presets[+e.target.value], id = uid('layer'); onChange({ layers: [...layers, { id, name: p.name, gain: .5, ratio: 1, sound: voiceSnapshot(instrumentOfFields(p.track, 'snapshot', p.name)) }] }, true); select(id); }}>
      <option value="" disabled>{layers.length >= 3 ? 'все четыре голоса заняты' : '+ голос из пресета…'}</option>
      {presets.map((p, i) => <option key={p.id ?? i} value={i}>{p.category} · {p.name}</option>)}
    </select><span>Общие эффекты — на дорожке. Уровни смешиваются с запасом от перегруза.</span></div>
    {layer && <div className="layer-detail">
      <div className="mseg-toolbar"><strong>{layer.name}</strong><select aria-label="Заменить источник слоя" value="" onChange={e => { const p = presets[+e.target.value]; update(layer.id, { name: p.name, sound: voiceSnapshot(instrumentOfFields(p.track, 'snapshot', p.name)) }, true); }}><option value="" disabled>заменить тембр…</option>{presets.map((p, i) => <option key={p.id ?? i} value={i}>{p.category} · {p.name}</option>)}</select>
      <select aria-label="Огибающая слоя" value={layer.sound.ampMseg ? 'points' : 'classic'} onChange={e => update(layer.id, { sound: { ...layer.sound, ampMseg: e.target.value === 'points' ? { seconds: .5, points: structuredClone(MSEG_SHAPES['удар']) } : undefined } }, true)}><option value="classic">атака · плато · спад</option><option value="points">по точкам (MSEG)</option></select></div>
      {layer.sound.ampMseg ? <MsegEditor value={layer.sound.ampMseg} onChange={ampMseg => update(layer.id, { sound: { ...layer.sound, ampMseg } })} /> : <div className="mseg-toolbar">
        <label>атака, с <NumField ariaLabel="Атака слоя, с" value={layer.sound.attack} min={0} max={1} step={.001} onChange={attack => update(layer.id, { sound: { ...layer.sound, attack } })} /></label>
        <label>плато, % <NumField ariaLabel="Плато слоя, %" value={(layer.sound.sustain ?? 0) * 100} min={0} max={100} step={1} onChange={v => update(layer.id, { sound: { ...layer.sound, sustain: v / 100 } })} /></label>
        <label>спад, с <NumField ariaLabel="Спад слоя, с" value={layer.sound.decay} min={.01} max={4} step={.01} onChange={decay => update(layer.id, { sound: { ...layer.sound, decay } })} /></label>
      </div>}
      <span className="sub-cap">Для своей волны или сэмпла сначала сохрани отдельный инструмент в «мои», затем выбери его здесь. Из многослойного пресета берётся основной голос.</span>
    </div>}
  </details>;
}
