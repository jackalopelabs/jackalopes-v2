const KEY = 'jackalopes-device-id-v1';
let deviceId: string | null = null;
export function getDeviceId(): string {
  if (deviceId) return deviceId;
  try { deviceId = localStorage.getItem(KEY); } catch { /* Session identity still works without storage. */ }
  if (!deviceId || !/^[a-f0-9]{32}$/.test(deviceId)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    deviceId = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(KEY, deviceId); } catch { /* Private browser storage may be unavailable. */ }
  }
  return deviceId;
}
export function controllerName(): string {
  return Array.from(navigator.getGamepads?.() || []).find(pad => pad?.connected)?.id || '';
}
export const bedtimeApi = `${window.location.protocol}//${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? window.location.hostname : '147.182.235.54'}:8082/api/bedtime`;
export type BedtimeStatus = {
  serverNow: number; enabled: boolean; locked: boolean; name?: string;
  recurrence?: 'nightly' | 'once'; cutoffAt?: number | null; unlockAt?: number | null;
  periods?: { cutoffAt: number; unlockAt: number }[]; validUntil?: number | null;
};
const CACHE = 'jackalopes-bedtime-v1';
export function readCachedStatus(): BedtimeStatus | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (!cached || cached.deviceId !== getDeviceId() || !cached.status.enabled) return null;
    return { ...cached.status, serverNow: cached.status.serverNow + Math.max(0, Date.now() - cached.savedAt) };
  } catch { return null; }
}
export function cacheStatus(status: BedtimeStatus) {
  try { localStorage.setItem(CACHE, JSON.stringify({ deviceId: getDeviceId(), status, savedAt: Date.now() })); } catch { /* Live server enforcement remains active. */ }
}
