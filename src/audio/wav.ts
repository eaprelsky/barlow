// Кодировщик AudioBuffer → WAV (16-bit PCM, без зависимостей).

export function audioBufferToWav(buffer: AudioBuffer, region?: { from: number; to: number; fadeFrames?: number }): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const from = Math.min(buffer.length, Math.max(0, Math.round(region?.from ?? 0)));
  const len = Math.max(0, Math.min(buffer.length, Math.round(region?.to ?? buffer.length)) - from);
  const fade = Math.min(len, Math.max(0, Math.round(region?.fadeFrames ?? 0)));
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // размер chunk fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // бит на сэмпл
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const gain = fade > 1 && i >= len - fade ? (len - 1 - i) / (fade - 1) : 1;
      const v = Math.max(-1, Math.min(1, chans[c][from + i] * gain));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
