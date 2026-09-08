import { useState } from 'react';
import { canonicalSecret, validSecret } from '../bridgeProtocol';
import type { BridgeSession, BridgeStatus } from '../bridgeSession';

export function BridgeSettings({ session, status, onConnect, onDisconnect }: {
  session: BridgeSession | null; status: BridgeStatus;
  onConnect: (value: BridgeSession) => void; onDisconnect: () => void;
}) {
  const [code, setCode] = useState(session?.secret ?? '');
  const [write, setWrite] = useState(session?.capabilities.includes('write') ?? false);
  const [transport, setTransport] = useState(session?.capabilities.includes('transport') ?? false);
  const [error, setError] = useState('');
  return <details className="bridge-settings" data-help="bridge">
    <summary>Локальный агент · {status.phase === 'connected' ? 'подключён' : 'отключён'}</summary>
    <p>Получи код командой live_status у локального агента. Подключение разрешает чтение проекта; дополнительные права выбери ниже.</p>
    <form onSubmit={e => {
      e.preventDefault(); const secret = canonicalSecret(code);
      if (!validSecret(secret)) { setError('Вставь код из 32 символов (цифры и a–f).'); return; }
      try { onConnect({ secret, capabilities: ['read', ...(write ? ['write' as const] : []), ...(transport ? ['transport' as const] : [])] }); setError(''); }
      catch { setError('Не удалось сохранить подключение для этой вкладки. Проверь разрешение на хранилище.'); }
    }}>
      <label>Код подключения <input data-help="bridge-code" type="password" autoComplete="off" spellCheck={false} value={code} maxLength={80}
        onChange={e => setCode(e.target.value)} /></label>
      <label><input data-help="bridge-write" type="checkbox" checked={write} onChange={e => setWrite(e.target.checked)} />редактировать проект</label>
      <label><input data-help="bridge-transport" type="checkbox" checked={transport} onChange={e => setTransport(e.target.checked)} />управлять воспроизведением</label>
      <button data-help="bridge-connect" type="submit">подключить</button>
      {session && <button data-help="bridge-disconnect" type="button" onClick={() => {
        try { onDisconnect(); setCode(''); setError(''); }
        catch { setError('Отключено, но код не удалось удалить из хранилища вкладки.'); }
      }}>отключить и забыть код</button>}
    </form>
    <p role="status">{error || status.message}</p>
    <small>Код хранится до закрытия вкладки и действует до перезапуска локального агента. В файл проекта он не попадает. Изменения прав вступают в силу после нажатия «подключить».</small>
  </details>;
}
