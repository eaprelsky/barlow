/** Read samples without decodeAudioData: resampling would move cycle boundaries. */
export function readTableWav(buffer: ArrayBuffer): Float32Array {
  if (buffer.byteLength > 16 * 1024 * 1024) throw Error('WAV больше 16 МиБ.');
  const v = new DataView(buffer), tag = (n: number) => String.fromCharCode(...new Uint8Array(buffer, n, 4));
  if (buffer.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw Error('Нужен WAV PCM или Float32.');
  let format = 0, channels = 0, bits = 0, block = 0, start = 0, bytes = 0;
  for (let p = 12; p + 8 <= v.byteLength;) {
    const size = v.getUint32(p + 4, true), next = p + 8 + size;
    if (next > v.byteLength) throw Error('Оборванный WAV.');
    if (tag(p) === 'fmt ' && size >= 16) { format = v.getUint16(p + 8, true); channels = v.getUint16(p + 10, true); block = v.getUint16(p + 20, true); bits = v.getUint16(p + 22, true); }
    if (tag(p) === 'data') { start = p + 8; bytes = size; }
    p = next + (size % 2);
  }
  if (![1, 2].includes(channels) || !((format === 1 && [16, 24, 32].includes(bits)) || (format === 3 && bits === 32)) || block !== channels * bits / 8 || !bytes || bytes % block) throw Error('Поддерживаются моно/стерео PCM16/24/32 и Float32.');
  const samples = new Float32Array(bytes / block);
  for (let i = 0; i < samples.length; i++) for (let c = 0; c < channels; c++) {
    const p = start + i * block + c * bits / 8;
    const x = format === 3 ? v.getFloat32(p, true) : bits === 16 ? v.getInt16(p, true) / 32768 : bits === 32 ? v.getInt32(p, true) / 2147483648 : ((v.getUint8(p) | v.getUint8(p + 1) << 8 | v.getInt8(p + 2) << 16) / 8388608);
    if (!Number.isFinite(x)) throw Error('WAV содержит некорректные значения.');
    samples[i] += x / channels;
  }
  return samples;
}

/** Fourier projection retains only harmonics representable by a 128-point frame. */
export function importTable(samples: Float32Array, size: number, count: number): number[][] {
  if (![128, 256, 512, 1024, 2048, 4096].includes(size) || samples.length % size || samples.length < size || !Number.isInteger(count) || count < 2 || count > 8) throw Error('Длина WAV должна быть кратна размеру кадра.');
  const sourceCount = samples.length / size;
  const frames = Array.from({ length: count }, (_, f) => {
    const offset = Math.round(f / (count - 1) * (sourceCount - 1)) * size;
    const real = new Float64Array(64), imag = new Float64Array(64);
    for (let k = 1; k < 64; k++) for (let n = 0; n < size; n++) {
      const a = 2 * Math.PI * k * n / size, x = samples[offset + n] * 2 / size;
      real[k] += x * Math.cos(a); imag[k] += x * Math.sin(a);
    }
    return Array.from({ length: 128 }, (_, n) => { let x = 0; for (let k = 1; k < 64; k++) x += real[k] * Math.cos(2 * Math.PI * k * n / 128) + imag[k] * Math.sin(2 * Math.PI * k * n / 128); return x; });
  });
  const peak = Math.max(...frames.flat().map(Math.abs));
  if (peak < 1e-8) throw Error('В таблице нет слышимого сигнала.');
  return frames.map(f => f.map(x => x / peak));
}
