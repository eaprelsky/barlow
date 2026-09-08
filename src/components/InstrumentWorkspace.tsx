import { useCallback, useEffect, useRef, useState } from 'react';
import type { Instrument } from '../types';
import { voiceSnapshot } from '../music/layers';
import { putSample, type SampleMeta } from '../audio/library';
import { alertDialog } from './dialogs';
import { SamplePicker } from './SamplePicker';
import { InstrumentEditor, type InstrumentEditorProps, type InstEditorTab } from './InstrumentEditor';

/** UI selection is not part of Patch. Every edit targets a stable layer ID;
 * async sample work reads the latest instrument instead of a stale snapshot. */
export function InstrumentWorkspace(props: InstrumentEditorProps) {
  const [selected, select] = useState('');
  const [tab, setTab] = useState<InstEditorTab>('snd');
  const [picker, showPicker] = useState(false);
  const sampleRequest = useRef(0);
  const latest = useRef(props);
  latest.current = props;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const layer = props.inst.layers?.find(l => l.id === selected);
  useEffect(() => { if (selected && !layer) { select(''); showPicker(false); } }, [selected, layer]);

  const update = (patch: Partial<Instrument>, command = false) => {
    const current = latest.current;
    if (!mounted.current || !current.inst.layers?.some(l => l.id === selected)) return;
    current.onChangeInst({ layers: current.inst.layers.map(l => l.id === selected
      ? { ...l, sound: voiceSnapshot({ ...l.sound, ...patch, id: l.id, name: l.name }) } : l) }, command);
  };
  const preview = (sound: Instrument, solo = false) => {
    const current = latest.current;
    const layers = current.inst.layers?.map(l => l.id === selected ? { ...l, sound: voiceSnapshot(sound) } : l);
    current.onPreviewNote({ ...current.inst, layers: solo ? layers?.filter(l => l.id === selected) : layers,
      baseVoiceGain: solo ? 0 : current.inst.baseVoiceGain });
  };
  const pick = (meta: SampleMeta) => {
    ++sampleRequest.current;
    update({ sampleId: meta.id, sampleName: meta.name, sampleStart: undefined, sampleEnd: undefined }, true);
    showPicker(false);
  };
  const load = async (file: File) => {
    const request = ++sampleRequest.current;
    const owner = props.inst.id, original = layer?.sound;
    try {
      const meta = await putSample(file, file.name);
      const current = latest.current;
      const sound = current.inst.layers?.find(l => l.id === selected)?.sound;
      // Never redirect an old upload after navigation or source replacement.
      if (mounted.current && request === sampleRequest.current && current.inst.id === owner && sound
        && sound.sampleId === original?.sampleId && sound.waveform === original?.waveform
        && JSON.stringify(sound.wave) === JSON.stringify(original?.wave)) pick(meta);
    } catch { if (mounted.current) void alertDialog('Не удалось сохранить сэмпл в хранилище', 'сэмпл слоя'); }
  };
  const sampleId = layer?.sound.sampleId;
  const { getPCM } = props;
  const peaks = useCallback(async () => {
    if (!sampleId) return null;
    const pcm = await getPCM(sampleId);
    if (!pcm) return null;
    const bins = 100, samples = pcm.channels[0], result: number[] = [];
    for (let i = 0; i < bins; i++) {
      let peak = 0;
      const start = Math.floor(i * samples.length / bins), end = Math.floor((i + 1) * samples.length / bins);
      const stride = Math.max(1, Math.floor((end - start) / 64));
      for (let j = start; j < end; j += stride) peak = Math.max(peak, Math.abs(samples[j]));
      result.push(peak);
    }
    return { peaks: result, duration: pcm.duration };
  }, [sampleId, getPCM]);

  if (!layer) return <InstrumentEditor {...props} key="base" onEditLayer={id => { ++sampleRequest.current; select(id); setTab('snd'); }} />;
  const source: Instrument = { ...layer.sound, id: `${props.inst.id}/${layer.id}`, name: layer.name };
  return <>
    <InstrumentEditor {...props} key={layer.id} layerSource inst={source} tab={tab} onTab={setTab}
      onChangeInst={update} onClose={() => { ++sampleRequest.current; select(''); showPicker(false); }}
      onPreviewNote={i => preview(i)} onPreviewSolo={i => preview(i, true)}
      onPickSample={() => showPicker(true)} onLoadSampleFile={f => void load(f)}
      onPreviewRegion={(i, a, b) => props.onPreviewRegion({ ...i, layers: undefined, baseVoiceGain: undefined }, a, b)}
      onScratchPeaks={peaks} onScratchPreview={() => preview(source)} busy={false} />
    {picker && <SamplePicker currentId={sampleId} onPick={pick} onClose={() => showPicker(false)} />}
  </>;
}
