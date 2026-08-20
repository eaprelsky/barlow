// Нативный аудио-бэкенд: реализация контракта AudioBackend поверх
// Tauri-команд Rust-движка (этап 10 кампании порта). Часы приходят
// событием audio-clock (~30 Гц), уровни — поллингом (кэш для rAF).
// Оффлайн-рендер и пики сэмплов пока делегируются web-движку (WebView
// всегда рядом); скрэтч-превью — тоже web.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Patch, Track } from '../types';
import type { AudioBackend } from './backend';
import type { TrackClock } from './timing';
import { AudioEngine } from './engine';

interface ClockSnapshot {
  playing: boolean;
  now: number;
  scene_id: string;
  chain_pos: number;
  clocks: Record<string, TrackClock>;
}

export class RustAudioBackend implements AudioBackend {
  private snap: ClockSnapshot = {
    playing: false,
    now: 0,
    scene_id: '',
    chain_pos: 0,
    clocks: {},
  };
  private unlisten: (() => void) | null = null;
  private levelsTimer: number | null = null;
  private levels: Record<string, number> = {};
  private webRenderer = new AudioEngine();

  async init(): Promise<void> {
    this.unlisten = await listen<ClockSnapshot>('audio-clock', (e) => {
      this.snap = { ...e.payload, clocks: e.payload.clocks ?? {} };
    });
    this.levelsTimer = window.setInterval(() => {
      void invoke<Record<string, number>>('audio_track_levels')
        .then((l) => {
          this.levels = l ?? {};
        })
        .catch(() => {
          /* вывод не запущен */
        });
    }, 33);
  }

  dispose(): void {
    this.unlisten?.();
    if (this.levelsTimer !== null) window.clearInterval(this.levelsTimer);
    this.unlisten = null;
    this.levelsTimer = null;
  }

  get playing(): boolean {
    return this.snap.playing;
  }

  get currentSceneId(): string {
    return this.snap.scene_id;
  }

  get currentChainPos(): number {
    return this.snap.chain_pos;
  }

  get now(): number {
    return this.snap.now;
  }

  play(patch: Patch, sceneId: string): void {
    void (async () => {
      try {
        await invoke('audio_play', { patchJson: JSON.stringify(patch), sceneId });
      } catch {
        // Вывод не поднят (после перезапуска приложения) — поднимаем с
        // сохранёнными настройками и повторяем.
        try {
          const st = await invoke<{ device: string | null; exclusive: boolean; buffer: number }>(
            'audio_settings',
          );
          await invoke('audio_output_start', {
            device: st.device,
            exclusive: st.exclusive,
            bufferFrames: st.buffer,
          });
          await invoke('audio_play', { patchJson: JSON.stringify(patch), sceneId });
        } catch (e) {
          console.error('нативный вывод не поднялся:', e);
        }
      }
    })();
  }

  stop(): void {
    void invoke('audio_engine_stop').catch(() => undefined);
  }

  setPatch(patch: Patch): void {
    void invoke('audio_set_patch', { patchJson: JSON.stringify(patch) }).catch(
      () => undefined,
    );
  }

  setScene(id: string): void {
    void invoke('audio_set_scene', { id }).catch(() => undefined);
  }

  setFollowChain(on: boolean): void {
    void invoke('audio_set_follow', { on }).catch(() => undefined);
  }

  setBpm(bpm: number): void {
    void invoke('audio_set_bpm', { bpm }).catch(() => undefined);
  }

  clockOf(trackId: string): TrackClock | undefined {
    return this.snap.clocks[trackId];
  }

  trackLevel(trackId: string): number {
    return Math.min(1, this.levels[trackId] ?? 0);
  }

  async ensureSamples(patch: Patch): Promise<void> {
    // Нативному движку сэмплы грузятся при audio_play; web-кэш — для
    // оффлайн-рендера и превью.
    await this.webRenderer.ensureSamples(patch).catch(() => undefined);
  }

  scratchBegin(track: Track, _pos0?: number): void {
    void invoke('audio_scratch_begin', { sampleId: track.sampleId ?? null }).catch(
      () => undefined,
    );
  }

  scratchMove(pos: number): void {
    void invoke('audio_scratch_move', { pos }).catch(() => undefined);
  }

  scratchEnd(): void {
    void invoke('audio_scratch_end').catch(() => undefined);
  }

  previewScratch(track: Track): void {
    this.webRenderer.previewScratch(track);
  }

  getSamplePeaks(id: string | undefined): Promise<number[] | null> {
    return this.webRenderer.getSamplePeaks(id);
  }

  renderToWav(patch: Patch, fallbackSceneId: string, fallbackBars?: number): Promise<Blob> {
    return this.webRenderer.renderToWav(patch, fallbackSceneId, fallbackBars);
  }
}
