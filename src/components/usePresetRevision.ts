import { useEffect, useState } from 'react';
import { PRESET_NAMES_KEY, USER_PRESETS_EVENT } from '../music/instrumentPresets';

/** Library names also appear on memoized track rows and in the current selection. */
export function usePresetRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision(n => n + 1);
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === PRESET_NAMES_KEY || event.key === 'barlow.instruments.v1') bump();
    };
    window.addEventListener(USER_PRESETS_EVENT, bump);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(USER_PRESETS_EVENT, bump); window.removeEventListener('storage', storage); };
  }, []);
  return revision;
}
