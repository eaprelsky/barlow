import { t as msg, useLocale } from '../i18n';
import type { Note, NoteLocks, NoteLockParameter, SoundingTrack } from '../types';
import { NOTE_LOCK_FIELDS, NOTE_LOCK_LIMIT, lockApplicable, lockSpec } from '../music/noteLocks';
import { resolveMacros } from '../music/macros';
import { NumField } from './NumField';

export function NoteLocksEditor({ note, sounding, onChange }: {
  note: Note; sounding: SoundingTrack; onChange: (locks: NoteLocks | undefined, command: boolean) => void;
}) {
  useLocale();
  const values = note.locks ?? {}, fields = Object.keys(values) as NoteLockParameter[];
  const st = resolveMacros(sounding);
  const available = NOTE_LOCK_FIELDS.filter(field => values[field] === undefined && lockApplicable(field, st));
  const remove = (field: NoteLockParameter) => {
    const next = { ...values }; delete next[field]; onChange(Object.keys(next).length ? next : undefined, true);
  };
  return <details data-ob="note-locks" className="note-locks" data-note-locks={note.n}>
    <summary>{msg("noteLocksEditor.thisNoteSSound")}{fields.length ? ` (${fields.length})` : ''}</summary>

    <div className="note-lock-list">
      {fields.map(field => {
        const spec = lockSpec(field);
        const scale = spec.unit === '%' ? 100 : 1;
        return <div className="note-lock" key={field}>
          <label>{spec.label}{spec.unit && `, ${spec.unit}`} <NumField value={values[field]! * scale}
            min={spec.min * scale} max={spec.max * scale} step={spec.step * scale} w={75} onChange={v => onChange({ ...values, [field]: v / scale }, false)} /></label>
          {!lockApplicable(field, st) && <span>{msg("noteLocksEditor.inactiveInThisSourceMode")}</span>}
          <button aria-label={msg("noteLocksEditor.removeParameterLock", {p0: spec.label})} onClick={() => remove(field)}>{msg("noteLocksEditor.remove")}</button>
        </div>;
      })}
    </div>
    <select aria-label={msg("noteLocksEditor.addParameterForNote", {p0: note.n + 1})} value="" disabled={fields.length >= NOTE_LOCK_LIMIT || !available.length}
      onChange={e => { const field = e.target.value as NoteLockParameter; if (!field) return; onChange({ ...values, [field]: st[field] ?? lockSpec(field).initial }, true); }}>
      <option value="">{msg("noteLocksEditor.noteParameter")}</option>
      {available.map(field => <option key={field} value={field}>{lockSpec(field).label}</option>)}
    </select>
  </details>;
}
