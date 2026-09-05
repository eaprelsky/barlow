// Чипы эскизов дорожки + мьют-чип «M» первым: «не играть» как альтернатива
// выбору партии. Мьют — свойство слота сцены (v38): дорожка молчит в ЭТОЙ
// сцене, в других тот же эскиз играет как обычно. Выделено из TrackRow.

import type { Pattern, Track } from '../types';

interface Props {
  track: Track;
  pattern: Pattern;
  patternSceneCounts: Record<string, number>;
  /** Мьют слота текущей сцены. */
  slotMuted: boolean;
  onToggleSlotMute: (trackId: string) => void;
  onSelectPattern: (trackId: string, patternId: string) => void;
  onAddPattern: (trackId: string) => void;
  onForkPattern: (trackId: string, patternId: string) => void;
  onRemovePattern: (trackId: string, patternId: string) => void;
}

export function PatternChips({
  track,
  pattern,
  patternSceneCounts,
  slotMuted,
  onToggleSlotMute,
  onSelectPattern,
  onAddPattern,
  onForkPattern,
  onRemovePattern,
}: Props) {
  return (
    <div className="pattern-chips" data-ob="chips">
      {/* Мьют — «эскиз тишины» в том же ряду выбора: горит либо он,
          либо эскиз — подсветка всегда одна. Клик по эскизу выбирает
          партию, клик по M — тишину (часы партии идут). */}
      <button
        className={slotMuted ? 'chip mute on-m' : 'chip mute'}
        data-ob="chip-mute"
        title="Тишина в этой сцене — как пустой эскиз: дорожка молчит, но часы партии идут — сняв мьют, войдёшь в фазе. В других сценах эскиз играет как обычно"
        onClick={() => onToggleSlotMute(track.id)}
      >
        M
      </button>
      {track.patterns.map((pt) => {
        const scenes = patternSceneCounts[pt.id] ?? 0;
        return (
          <button
            key={pt.id}
            className={'chip' + (pt.id === pattern.id && !slotMuted ? ' on' : '')}
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
      <button className="chip add" data-ob="chip-add" title="Новый пустой эскиз" onClick={() => onAddPattern(track.id)}>
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
