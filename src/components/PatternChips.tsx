import { t as msg, useLocale } from '../i18n';
// Чипы эскизов дорожки + мьют-чип «M» первым: «не играть» как альтернатива
// выбору партии. Мьют — свойство слота сцены (v38): дорожка молчит в ЭТОЙ
// сцене, в других тот же эскиз играет как обычно. Выделено из TrackRow.

import type { Pattern, Track } from '../types';

interface Props {
  track: Track;
  pattern: Pattern;
  patternSceneCounts: Record<string, number>;
  /** В скольких сценах дорожка в мьюте — счётчик чипа M. */
  muteSceneCount: number;
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
  muteSceneCount,
  slotMuted,
  onToggleSlotMute,
  onSelectPattern,
  onAddPattern,
  onForkPattern,
  onRemovePattern,
}: Props) {
  useLocale();
  return (
    <div className="pattern-chips" data-ob="chips">
      {/* Мьют — «эскиз тишины» в том же ряду выбора: горит либо он,
          либо эскиз — подсветка всегда одна. Клик по эскизу выбирает
          партию, клик по M — тишину (часы партии идут). Счётчик —
          в скольких сценах мьют, как у эскизов. */}
      <button
        className={slotMuted ? 'chip mute on-m' : 'chip mute'}
        data-ob="chip-mute"
        title={
          msg("patternChips.muteThisTrackInTheCurrentScene") +
          (muteSceneCount > 1 ? msg("patternChips.mutedInScenes", {p0: muteSceneCount}) : '')
        }
        onClick={() => onToggleSlotMute(track.id)}
      >
        M
        {muteSceneCount > 1 && <sup className="scene-cnt">{muteSceneCount}</sup>}
      </button>
      {track.patterns.map((pt) => {
        const scenes = patternSceneCounts[pt.id] ?? 0;
        return (
          <button
            key={pt.id}
            className={'chip' + (pt.id === pattern.id && !slotMuted ? ' on' : '')}
            title={
              (pt.forkedFrom
                ? msg("patternChips.independentVariationClickToPlayInThis")
                : msg("patternChips.aClipSharedByEverySceneThat")) +
              (scenes > 1 ? msg("patternChips.usedInScenesEditsAffectAllOf", {p0: scenes}) : '')
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
      <button className="chip add" data-ob="chip-add" title={msg("patternChips.newEmptyClipUpTo128")} disabled={track.patterns.length >= 128} onClick={() => onAddPattern(track.id)}>
        +
      </button>
      {track.patterns.length > 1 && (
        <button
          className="chip del"
          title={msg("patternChips.deleteClipScenesUsingItWillSwitch", {p0: pattern.name})}
          onClick={() => onRemovePattern(track.id, pattern.id)}
        >
          ×
        </button>
      )}
    </div>
  );
}
