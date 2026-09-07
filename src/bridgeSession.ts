import { canonicalSecret, capabilities, validSecret, type BridgeCapability } from './bridgeProtocol';
export interface BridgeSession { secret: string; capabilities: BridgeCapability[] }
export interface BridgeStatus { phase: 'off' | 'waiting' | 'connecting' | 'connected' | 'error'; message: string }
export const BRIDGE_SESSION_KEY = 'barlow.bridge.session.v1';
export function loadBridgeSession(): BridgeSession | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(BRIDGE_SESSION_KEY) ?? 'null');
    if (!raw || !validSecret(raw.secret)) return null;
    return { secret: raw.secret, capabilities: ['read', ...capabilities(raw.capabilities).filter(c => c !== 'read')] };
  } catch { return null; }
}
export function saveBridgeSession(value: BridgeSession | null): void {
  if (value) sessionStorage.setItem(BRIDGE_SESSION_KEY, JSON.stringify({ ...value, secret: canonicalSecret(value.secret) }));
  else sessionStorage.removeItem(BRIDGE_SESSION_KEY);
}
