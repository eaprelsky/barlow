import { t as msg } from './i18n/runtime.ts';
/** Mutual session authentication. Neither peer transmits the pairing secret. */
export const BRIDGE_PROTOCOL = 1;
export const BRIDGE_MAX_BYTES = 8 * 1024 * 1024;
export type BridgeCapability = 'read' | 'write' | 'transport';
export const ALL_CAPABILITIES: BridgeCapability[] = ['read', 'write', 'transport'];
export const pairingSecret = () => randomNonce();
export function randomNonce(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export const canonicalSecret = (secret: string) => secret.replace(/[\s-]/g, '').toLowerCase();
export const validSecret = (secret: unknown): secret is string => typeof secret === 'string' && /^[a-f0-9]{32}$/.test(secret);
export function capabilities(value: unknown): BridgeCapability[] {
  return Array.isArray(value) ? ALL_CAPABILITIES.filter(c => value.includes(c)) : [];
}
function payload(role: 'client' | 'server', challenge: string, nonce: string, caps: BridgeCapability[]): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`barlow-bridge/v1/${role}/${challenge}/${nonce}/${capabilities(caps).join(',')}`);
}
async function key(secret: string) {
  if (!validSecret(secret)) throw new Error(msg("bridgeProtocol.thePairingCodeMustContain32Hexadecimal"));
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function authProof(secret: string, role: 'client' | 'server', challenge: string, nonce: string, caps: BridgeCapability[]): Promise<string> {
  if (!validSecret(challenge) || !validSecret(nonce)) throw new Error(msg("bridgeProtocol.invalidBridgeHandshake"));
  const proof = await crypto.subtle.sign('HMAC', await key(secret), payload(role, challenge, nonce, caps));
  return [...new Uint8Array(proof)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function verifyProof(secret: string, proof: unknown, role: 'client' | 'server', challenge: string, nonce: string, caps: BridgeCapability[]): Promise<boolean> {
  if (!validSecret(challenge) || !validSecret(nonce) || typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof)) return false;
  const bytes = Uint8Array.from(proof.match(/../g)!, hex => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', await key(secret), bytes, payload(role, challenge, nonce, caps));
}
