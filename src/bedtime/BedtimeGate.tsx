import { type ReactNode, useEffect, useState } from 'react';
import { bedtimeApi, cacheStatus, controllerName, getDeviceId, readCachedStatus, type BedtimeStatus } from './device';
import './bedtime.css';

type Clock = { status: BedtimeStatus; receivedAt: number };
function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function BedtimeGate({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState<Clock | null>(() => {
    const cached = readCachedStatus();
    return cached ? { status: cached, receivedAt: performance.now() } : null;
  });
  const [tick, setTick] = useState(performance.now());
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    let busy = false;
    const accept = (status: BedtimeStatus) => {
      if (!alive) return;
      cacheStatus(status); setClock({ status, receivedAt: performance.now() }); setReady(true); setOffline(false);
    };
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(`${bedtimeApi}/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: getDeviceId(), controller: controllerName() }), signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) throw new Error('Bedtime check unavailable');
        accept(await response.json());
      } catch { if (alive) { setReady(true); setOffline(true); } }
      finally { busy = false; }
    };
    const onBedtime = (event: Event) => accept((event as CustomEvent<BedtimeStatus>).detail);
    const interval = window.setInterval(() => void refresh(), 5000);
    const ticker = window.setInterval(() => setTick(performance.now()), 250);
    window.addEventListener('jackalopes-bedtime', onBedtime);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    void refresh();
    return () => {
      alive = false; clearInterval(interval); clearInterval(ticker);
      window.removeEventListener('jackalopes-bedtime', onBedtime);
      window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh);
    };
  }, []);
  const status = clock?.status;
  const now = clock ? clock.status.serverNow + Math.max(0, tick - clock.receivedAt) : 0;
  const current = status?.periods?.find(period => now >= period.cutoffAt && now < period.unlockAt);
  const next = status?.periods?.find(period => now < period.cutoffAt);
  const expired = !!status?.enabled && !!status.validUntil && now >= status.validUntil;
  const locked = !!status?.enabled && (!!current || expired);
  useEffect(() => { if (locked && document.pointerLockElement) void document.exitPointerLock(); }, [locked]);
  if (locked) return <main className="bedtime-screen" data-bedtime="locked">
    <div className="bedtime-card"><div className="bedtime-moon" aria-hidden="true">☾</div>
      <p className="bedtime-eyebrow">JACKALOPES · GOOD NIGHT</p>
      <h1>Sweet dreams, {status?.name || 'Everly'}.</h1>
      <p>{expired ? 'Connect to the game server to check your play time.' : 'It’s 10 p.m. in Denver. Your adventure is tucked in for tonight.'}</p>
      <div className="bedtime-unlock">{expired ? 'Waiting for connection' : 'Play again at 7 a.m. Denver time'}</div>
      <small>Your jackalope will be ready for another adventure tomorrow.</small>
    </div>
  </main>;
  if (!ready && !status) return <main className="bedtime-screen"><p>Getting your adventure ready…</p></main>;
  return <>{children}{status?.enabled && next ? <aside className={`bedtime-timer ${next.cutoffAt - now < 300000 ? 'bedtime-soon' : ''}`} role="timer" aria-label="Time until bedtime" data-bedtime="countdown">
    <span>☾ {status.name}’s bedtime</span><strong>{countdown(next.cutoffAt - now)}</strong>
    <small>10 p.m. Denver · back at 7 a.m.{offline ? ' · offline' : ''}</small>
  </aside> : <span className="bedtime-device-code">Device {getDeviceId().slice(0, 6).toUpperCase()}</span>}</>;
}

type Device = { id: string; code: string; platform: string; controller: string; lastSeen: number };
export function BedtimeParent() {
  const [key] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const incoming = fragment.get('key');
    if (incoming) { sessionStorage.setItem('jackalopes-parent-key', incoming); history.replaceState(null, '', window.location.pathname + window.location.search); }
    return incoming || sessionStorage.getItem('jackalopes-parent-key') || '';
  });
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('Loading devices…');
  const [saving, setSaving] = useState(false);
  const refresh = async () => {
    try {
      const response = await fetch(`${bedtimeApi}/admin`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(response.status === 401 ? 'Open your private parent link to manage bedtime.' : 'Cannot reach game server.');
      const data = await response.json(); setDevices(data.devices); setSelected(data.policy?.deviceId || ''); setMessage('Select Everly’s ROG Ally. Match the device code shown in her game.');
    } catch (error) { setMessage((error as Error).message); }
  };
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [key]);
  const select = async (deviceId: string) => {
    setSaving(true);
    try {
      const response = await fetch(`${bedtimeApi}/admin`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, recurrence: 'nightly' }), signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('Could not save bedtime.');
      setSelected(deviceId); setMessage('Saved. Everly’s timer will appear within 5 seconds.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };
  return <main className="bedtime-screen"><div className="bedtime-card bedtime-parent">
    <p className="bedtime-eyebrow">JACKALOPES · PARENT SETTINGS</p><h1>Everly’s bedtime</h1>
    <p>Every night, 10 p.m.–7 a.m. · Denver time</p><p className="bedtime-message" role="status">{message}</p>
    <div className="bedtime-devices">{devices.map(device => <button key={device.id} disabled={saving} className={selected === device.id ? 'selected' : ''} onClick={() => void select(device.id)}>
      <strong>{device.platform} · {device.code}{selected === device.id ? ' ✓ Everly' : ''}</strong>
      <span>{device.controller || 'No controller detected yet'}</span>
      <small>{Date.now() - device.lastSeen < 20000 ? 'Online now' : `Last seen ${new Date(device.lastSeen).toLocaleTimeString()}`}{device.id === getDeviceId() ? ' · This device' : ''}</small>
    </button>)}</div><a href="/?mode=adventure">Back to the adventure</a>
  </div></main>;
}
