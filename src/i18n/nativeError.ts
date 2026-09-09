import { t } from './runtime.ts';
import { nativeErrors } from './catalogs/nativeErrors.ts';
/** Translate our error codes; retain OS and third-party diagnostics verbatim. */
export function nativeError(error: unknown): Error {
  const raw = String(error instanceof Error ? error.message : error);
  const key = `native.${raw.replace(/^BARLOW_/, '')}` as keyof typeof nativeErrors;
  return new Error(Object.hasOwn(nativeErrors,key) ? t(key) : raw);
}
