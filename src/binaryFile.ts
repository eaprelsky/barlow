/** BRL1 raw IPC frame shared with src-tauri/src/native_binary.rs. */
export const BINARY_LIMITS = { sample: 64 * 1048576, project: 128 * 1048576, save: 256 * 1048576, name: 1024 };
export function encodeBinaryFile(name: string, data: Uint8Array, limit: number): Uint8Array<ArrayBuffer> {
  const title = new TextEncoder().encode(name);
  if (!title.length || title.length > BINARY_LIMITS.name || name.includes('\0') || data.byteLength > limit)
    throw new Error('Недопустимое имя или превышен лимит файла.');
  const out = new Uint8Array(8 + title.length + data.byteLength);
  out.set([66, 82, 76, 49]);new DataView(out.buffer).setUint32(4, title.length, true);
  out.set(title, 8);out.set(data, 8 + title.length);return out;
}
export function decodeBinaryFile(input: ArrayBuffer | number[], limit: number): { name: string; data: Uint8Array<ArrayBuffer> } | null {
  // Tauri's fallback transport can return a numeric array on other platforms.
  // Bound and validate it before allocating a typed copy; Windows normally
  // delivers application/octet-stream as ArrayBuffer through its custom protocol.
  if (Array.isArray(input)) {
    if (input.length > limit + BINARY_LIMITS.name + 8 || input.some(n => !Number.isInteger(n) || n < 0 || n > 255))
      throw new Error('Некорректный бинарный ответ.');
    input = Uint8Array.from(input).buffer;
  }
  if (!(input instanceof ArrayBuffer)) throw new Error('Нативный ответ должен содержать бинарные данные.');
  if (input.byteLength === 0) return null;
  const bytes = new Uint8Array(input);
  if (bytes.length < 8 || bytes.length > limit + BINARY_LIMITS.name + 8 || bytes[0] !== 66 || bytes[1] !== 82 || bytes[2] !== 76 || bytes[3] !== 49)
    throw new Error('Некорректный бинарный пакет или превышен лимит файла.');
  const length = new DataView(input).getUint32(4, true);
  if (!length || length > BINARY_LIMITS.name || 8 + length > bytes.length || bytes.length - 8 - length > limit)
    throw new Error('Некорректная длина бинарного пакета.');
  const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8, 8 + length));
  if (name.includes('\0')) throw new Error('Недопустимое имя файла.');
  return { name, data: bytes.subarray(8 + length) };
}
