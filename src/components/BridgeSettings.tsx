import { t as msg, useLocale } from '../i18n';
import { useState } from 'react';
import { canonicalSecret, validSecret } from '../bridgeProtocol';
import type { BridgeSession, BridgeStatus } from '../bridgeSession';

export function BridgeSettings({ session, status, onConnect, onDisconnect }: {
  session: BridgeSession | null; status: BridgeStatus;
  onConnect: (value: BridgeSession) => void; onDisconnect: () => void;
}) {
  useLocale();
  const [code, setCode] = useState(session?.secret ?? '');
  const [write, setWrite] = useState(session?.capabilities.includes('write') ?? false);
  const [transport, setTransport] = useState(session?.capabilities.includes('transport') ?? false);
  const [error, setError] = useState('');
  return <details className="bridge-settings" data-help="bridge">
    <summary>{msg("bridgeSettings.externalAssistant")}{status.phase === 'connected' ? msg("bridgeSettings.connected") : msg("bridgeSettings.notConnected")}</summary>
    <form onSubmit={e => {
      e.preventDefault(); const secret = canonicalSecret(code);
      if (!validSecret(secret)) { setError(msg("bridgeSettings.pasteA32CharacterCodeUsingDigits")); return; }
      try { onConnect({ secret, capabilities: ['read', ...(write ? ['write' as const] : []), ...(transport ? ['transport' as const] : [])] }); setError(''); }
      catch { setError(msg("bridgeSettings.couldNotSaveThisTabSConnection")); }
    }}>
      <label title={msg("bridgeSettings.askYourAssistantToCallLiveStatus")}>{msg("bridgeSettings.assistantCode")}<input data-help="bridge-code" type="password" autoComplete="off" spellCheck={false} value={code} maxLength={80}
        onChange={e => setCode(e.target.value)} /></label>
      <label><input data-help="bridge-write" type="checkbox" checked={write} onChange={e => setWrite(e.target.checked)} />{msg("bridgeSettings.editProject")}</label>
      <label><input data-help="bridge-transport" type="checkbox" checked={transport} onChange={e => setTransport(e.target.checked)} />{msg("bridgeSettings.controlPlayback")}</label>
      <button data-help="bridge-connect" type="submit">{msg("bridgeSettings.connect")}</button>
      {session && <button data-help="bridge-disconnect" type="button" onClick={() => {
        try { onDisconnect(); setCode(''); setError(''); }
        catch { setError(msg("bridgeSettings.disconnectedButCouldNotRemoveTheCode")); }
      }}>{msg("bridgeSettings.disconnectAndForgetCode")}</button>}
    </form>
    <p role="status">{error || status.message}</p>
  </details>;
}
