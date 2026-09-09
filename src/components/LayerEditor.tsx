import { categoryLabel } from '../music/presetPresentation';
import { t as msg, useLocale } from '../i18n';
import { VoiceProcessing } from './VoiceProcessing';
import { useState } from 'react';
import { instrumentOfFields, uid, type Instrument, type InstrumentLayer } from '../types';
import { loadFactoryPresets, loadUserPresets } from '../music/instrumentPresets';
import { voiceSnapshot } from '../music/layers';
import { MSEG_SHAPES } from '../music/mseg';
import { MsegEditor } from './MsegEditor';
import { NumField } from './NumField';
import { Knob } from './Knob';

export function LayerEditor({ inst, onChange, onEditSource }: { inst: Instrument; onChange: (patch: Partial<Instrument>, command?: boolean) => void; onEditSource: (id: string) => void }) {
  useLocale();
  const [selected, select] = useState('');
  const layers = inst.layers ?? [], layer = layers.find(l => l.id === selected);
  const presets = [...loadUserPresets(), ...loadFactoryPresets()].filter(p => p.track.waveform !== 'sample' || p.track.sampleId || p.track.sampleZones?.length || p.track.sampleSlices?.length);
  const update = (id: string, patch: Partial<InstrumentLayer>, command = false) => onChange({ layers: layers.map(l => l.id === id ? { ...l, ...patch } : l) }, command);
  return <details className="layer-editor" data-ob="instrument-layers" open={layers.length ? true : undefined}>
    <summary data-help="instrument-layers">{msg("layerEditor.layers")}<span>{layers.length + 1}{msg("layerEditor.4Voices")}</span></summary>
    <div className="layer-row" data-help="layer-base"><span>{msg("layerEditor.mainVoiceEditorBelow")}</span><label data-help="layer-gain">{msg("layerEditor.level")}<NumField ariaLabel={msg("layerEditor.mainVoiceLevel")} value={(inst.baseVoiceGain ?? 1) * 100} min={0} max={100} step={1} onChange={v => onChange({ baseVoiceGain: v / 100 })} /> %</label><span /><span /></div>
    <VoiceProcessing sound={inst} onChange={onChange} />
    {layers.map(l => <div key={l.id} className={`layer-row ${selected === l.id ? 'selected' : ''}`}>
      <button data-help="layer-edit" className="layer-name" onClick={() => select(selected === l.id ? '' : l.id)} title={msg("layerEditor.editTheLayerSSourceAndEnvelope")}>{selected === l.id ? '▾' : '▸'} {l.name}</button>
      <label data-help="layer-gain">{msg("layerEditor.level")}<NumField ariaLabel={msg("layerEditor.layerLevel", {p0: l.name})} value={l.gain * 100} min={0} max={100} step={1} onChange={v => update(l.id, { gain: v / 100 })} /> %</label>
      <label data-help="layer-ratio">{msg("layerEditor.frequency")}<NumField ariaLabel={msg("layerEditor.layerFrequencyRatio", {p0: l.name})} value={l.ratio} min={.125} max={8} step={.001} w={65} onChange={ratio => update(l.id, { ratio })} /></label>
      <button data-help="layer-delete" aria-label={msg("layerEditor.removeLayer", {p0: l.name})} onClick={() => onChange({ layers: layers.filter(x => x.id !== l.id) }, true)}>×</button>
    </div>)}
    <div className="mseg-toolbar"><select data-help="layer-add" aria-label={msg("layerEditor.addALayerFromAPreset")} disabled={layers.length >= 3} value="" onChange={e => { const p = presets[+e.target.value], id = uid('layer'); onChange({ layers: [...layers, { id, name: p.name, gain: .5, ratio: 1, sound: voiceSnapshot(instrumentOfFields(p.track, 'snapshot', p.name)) }] }, true); select(id); }}>
      <option value="" disabled>{layers.length >= 3 ? msg("layerEditor.allFourVoicesInUse") : msg("layerEditor.voiceFromPreset")}</option>
      {presets.map((p, i) => <option key={p.id ?? i} value={i}>{categoryLabel(p.category)} · {p.name}</option>)}
    </select></div>
    {layer && <div className="layer-detail">
      <VoiceProcessing sound={layer.sound} onChange={(patch,command)=>update(layer.id,{sound:{...layer.sound,...patch}},command)} />
      <button data-help="layer-source-editor" onClick={() => onEditSource(layer.id)}>{msg("layerEditor.editSource")}</button>
      <div className="mseg-toolbar"><strong>{layer.name}</strong><select data-help="layer-source" aria-label={msg("layerEditor.replaceLayerSource")} value="" onChange={e => { const p = presets[+e.target.value]; update(layer.id, { name: p.name, sound: voiceSnapshot(instrumentOfFields(p.track, 'snapshot', p.name)) }, true); }}><option value="" disabled>{msg("layerEditor.replaceSound")}</option>{presets.map((p, i) => <option key={p.id ?? i} value={i}>{categoryLabel(p.category)} · {p.name}</option>)}</select>
      <select data-help="envelope-mode" aria-label={msg("layerEditor.layerEnvelope")} value={layer.sound.ampMseg ? 'points' : 'classic'} onChange={e => update(layer.id, { sound: { ...layer.sound, ampMseg: e.target.value === 'points' ? { seconds: .5, points: structuredClone(MSEG_SHAPES['удар']) } : undefined } }, true)}><option value="classic">{msg("layerEditor.attackHoldDecay")}</option><option value="points">{msg("layerEditor.breakpointsMSEG")}</option></select></div>
      {layer.sound.ampMseg ? <MsegEditor value={layer.sound.ampMseg} onChange={(ampMseg, command) => update(layer.id, { sound: { ...layer.sound, ampMseg } }, command)} /> : <div className="layer-envelope">
        <Knob help="attack" label={msg("layerEditor.attackMs")} value={layer.sound.attack * 1000} min={0} max={1000} step={1} onChange={v => update(layer.id, { sound: { ...layer.sound, attack: v / 1000 } })} />
        <Knob help="sustain" label={msg("layerEditor.hold")} value={(layer.sound.sustain ?? 0) * 100} min={0} max={100} step={1} onChange={v => update(layer.id, { sound: { ...layer.sound, sustain: v / 100 } })} />
        <Knob help="decay" label={msg("layerEditor.decayS")} value={layer.sound.decay} min={.01} max={4} step={.01} onChange={decay => update(layer.id, { sound: { ...layer.sound, decay } })} />
      </div>}
    </div>}
  </details>;
}
