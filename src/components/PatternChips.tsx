// Чипы эскизов дорожки + мьют-чип «M» первым: «не играть» как альтернатива
// выбору партии. Выделено из TrackRow (механически, без изменений логики).

import type { Pattern, Track } from '../types';

interface Props {
  track: Track;
  pattern: Pattern;
  patternSceneCounts: Record<string, number>;
  onPatternChange: (trackId: string, patternId: string, upd: Partial<Pattern>) => void;
  onSelectPattern: (trackId: string, patternId: string) => void;
  onAddPattern: (trackId: string) => void;
  onForkPattern: (trackId: string, patternId: string) => void;
  onRemovePattern: (trackId: string, patternId: string) => void;
}

export function PatternChips({
  track,
  pattern,
  patternSceneCounts,
  onPatternChange,
  onSelectPattern,
  onAddPattern,
  onForkPattern,
  onRemovePattern,
}: Props) {
  return (
    <div className="pattern-chips">
      {/* Мьют — «отрицательный эскиз»: вместо выбора партии трек молчит,
          пока выбран этот эскиз (во всех сценах, где он играет). */}
      <button
        className={pattern.muted ? 'chip mute on-m' : 'chip mute'}
        title="Мьют вместо эскиза: трек молчит, пока играет этот эскиз (во всех сценах, где он выбран). Часы идут — сняв мьют, войдёшь в фазе"
        onClick={() => onPatternChange(track.id, pattern.id, { muted: !pattern.muted })}
      >
        M
      </button>
      {track.patterns.map((pt) => {
        const scenes = patternSceneCounts[pt.id] ?? 0;
        return (
          <button
            key={pt.id}
            className={
              'chip' +
              (pt.id === pattern.id ? ' on' : '') +
              (pattern.muted ? ' dim' : '')
            }
            title={
              (pt.forkedFrom
                ? 'вариация (форк). Клик — играть в этой сцене, правый клик — новая вариация от этого'
                : 'эскиз дорожки — общий для всех сцен, где играет. Клик — играть, правый клик — независимая копия (форк)') +
              (scenes > 1 ? `. Играет в ${scenes} сценах — правка эскиза меняет его во всех них` : '')
            }
            onClick={() => onSelectPattern(track.id, pt.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onForkPattern(track.id, pt.id);
            }}
          >
            {pt.name}
            {scenes > 1 && <sup className="scene-cnt">{scenes}</sup>}
          </button>
        );
      })}
      <button className="chip add" title="Новый пустой эскиз" onClick={() => onAddPattern(track.id)}>
        +
      </button>
      {track.patterns.length > 1 && (
        <button
          className="chip del"
          title={`Удалить эскиз «${pattern.name}» — сцены, где он играл, перейдут на первый оставшийся`}
          onClick={() => onRemovePattern(track.id, pattern.id)}
        >
          ×
        </button>
      )}
    </div>
  );
}
