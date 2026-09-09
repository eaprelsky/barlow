import { t as msg } from '../i18n/runtime.ts';
export const RENDER_MEMORY_LIMIT = 512 * 1048576;
export function renderMemoryBytes(seconds: number, channels = 2, sampleRate = 44100, extraBytes = 0): number {
  if (!Number.isInteger(channels) || channels < 1 || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new Error(msg("renderMemory.wavInvalidPCMFormat"));
  const frames = Math.ceil(seconds * sampleRate);
  // Two PCM32 buffers and two PCM16/WAV copies, plus known FX/assets.
  const bytes = frames * channels * 12 + 88 + extraBytes;
  if (!Number.isSafeInteger(bytes) || frames < 1 || channels < 1 || extraBytes < 0)
    throw new Error(msg("renderMemory.wavInvalidMemoryEstimate"));
  return bytes;
}
export function checkRenderMemory(bytes: number, limit = RENDER_MEMORY_LIMIT): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit)
    throw new Error(msg("renderMemory.wavEstimatedWorkingBuffersExceedThe512"));
}
/** Shared by simultaneous exports, including scratch renders. This is an
 * allocation estimate, not an assertion about total browser/process memory. */
export class RenderMemoryBudget {
  private used = 0;
  get bytes() { return this.used; }
  reserve(bytes: number) {
    checkRenderMemory(bytes);
    checkRenderMemory(this.used + bytes);
    this.used += bytes;
    let held = bytes, released = false;
    return {
      resize: (next: number) => {
        if (released) throw new Error(msg("renderMemory.theWAVMemoryReservationHasAlreadyBeen"));
        checkRenderMemory(next); checkRenderMemory(this.used - held + next);
        this.used += next - held; held = next;
      },
      release: () => { if (!released) { this.used -= held; released = true; } },
    };
  }
}
export const renderMemoryBudget = new RenderMemoryBudget();
