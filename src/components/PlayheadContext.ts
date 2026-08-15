import { createContext } from 'react';
import type { Track } from '../types';

export interface Playhead {
  getStepIndex: (track: Track) => number;
}

export const PlayheadContext = createContext<Playhead | null>(null);
