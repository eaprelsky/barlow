// Контракт аудио-движка: ровно то, что потребляет UI (App). Сегодня его
// реализует AudioEngine на Web Audio; завтра Rust-движок (ASIO) за этим
// же интерфейсом — через Tauri-команды и события. Пока контракт не
// выписан, «замена слоя» — надежда, а не план (см. docs/DESIGN.md).

import type { Patch, Track } from '../types';
import type { TrackClock } from './timing';

export interface AudioBackend {
  /** Транспорт играет (планировщик активен). */
  readonly playing: boolean;
  /** Сцена, которая звучит прямо сейчас (UI подсвечивает её). */
  readonly currentSceneId: string;
  /** Позиция в цепочке (для подсветки арранжмента). */
  readonly currentChainPos: number;
  /** Актуальное время аудио-часов — для расчёта playhead в UI. */
  readonly now: number;

  play(patch: Patch, sceneId: string): void;
  stop(): void;
  /** Обновить данные патча без остановки (правки на лету). */
  setPatch(patch: Patch): void;
  /** Ручное переключение сцены — применяется на ближайшей границе такта. */
  setScene(id: string): void;
  /** Вход в режим цепочки / выход из него на ходу. */
  setFollowChain(on: boolean): void;
  /** Смена темпа на ходу: часы пере-якорятся, позиция не сбивается. */
  setBpm(bpm: number): void;

  /** Часы трека (resetTime нужен playhead'у). */
  clockOf(trackId: string): TrackClock | undefined;
  /** Живой уровень дорожки 0..1 — тумбометры, вызывается из rAF. */
  trackLevel(trackId: string): number;

  /** Декодировать сэмплы, на которые ссылается патч (идемпотентно). */
  ensureSamples(patch: Patch): Promise<void>;

  // ---- Скрэтч-пэд ----
  scratchBegin(track: Track, pos0?: number): void;
  scratchMove(pos: number): void;
  scratchEnd(): void;
  previewScratch(track: Track): void;

  /** Пики волны сэмпла (64 сегмента, 0..1) для мини-карты скрэтч-пэда. */
  getSamplePeaks(id: string | undefined): Promise<number[] | null>;

  /** Оффлайн-рендер в WAV: по цепочке (арранжмент) или N тактов сцены. */
  renderToWav(patch: Patch, fallbackSceneId: string, fallbackBars?: number): Promise<Blob>;
}
