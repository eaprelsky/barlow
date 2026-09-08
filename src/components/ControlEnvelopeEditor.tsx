import type { Instrument } from '../types';
import { CONTROL_MSEG_SHAPES } from '../music/mseg';
import { MsegEditor } from './MsegEditor';
import { Knob } from './Knob';

export function ControlEnvelopeEditor({ target, inst, onChange }: {
  target: 'pitch' | 'filter'; inst: Instrument;
  onChange: (change: Partial<Instrument>, command?: boolean) => void;
}) {
  const field = target === 'pitch' ? 'pitchMseg' : 'filterMseg';
  const route = inst[field];
  const update = (change: object, command?: boolean) => onChange({ [field]: { ...route, ...change } }, command);
  return <div className="control-envelope" data-help={target === 'pitch' ? 'mseg-pitch' : 'mseg-filter'}>
    <div className="mseg-toolbar">
      <label><input type="checkbox" aria-label="Включить огибающую цели" checked={!!route} onChange={e => onChange({ [field]: e.target.checked ? { envelope: { seconds: 1, points: structuredClone(CONTROL_MSEG_SHAPES['подъём']) }, depthOctaves: 2, ...(target === 'filter' ? { baseHz: 400 } : {}) } : undefined }, true)} />по точкам</label>
      {route && <>
        <Knob help="mseg-depth" label="размах, октавы" value={route.depthOctaves} min={-4} max={4} step={.01} bipolar onChange={depthOctaves => update({ depthOctaves })} />
        {target === 'filter' && inst.filterMseg && <Knob help="mseg-filter-base" label="база, Гц" value={inst.filterMseg.baseHz} min={40} max={18000} step={1} log onChange={baseHz => update({ baseHz })} />}
      </>}
    </div>
    {route && <MsegEditor control value={route.envelope} onChange={(envelope, command) => update({ envelope }, command)} />}
  </div>;
}
