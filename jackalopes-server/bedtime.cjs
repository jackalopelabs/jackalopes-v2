const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ZONE = 'America/Denver';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function parts(time) {
  return Object.fromEntries(formatter.formatToParts(new Date(time)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
function localTime(date, hour) {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess);
    guess += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return guess;
}
function dateAt(time, offset = 0) {
  const p = parts(time);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + offset)).toISOString().slice(0, 10);
}
function nextDate(date) { return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10); }
function schedule(policy, now = Date.now()) {
  if (!policy) return { serverNow: now, enabled: false, locked: false };
  const dates = policy.recurrence === 'once' ? [policy.date] : Array.from({ length: 9 }, (_, i) => dateAt(now, i - 1));
  const periods = dates.map(date => ({ cutoffAt: localTime(date, 22), unlockAt: localTime(nextDate(date), 7) }));
  const current = periods.find(p => now >= p.cutoffAt && now < p.unlockAt);
  const next = periods.find(p => now < p.cutoffAt);
  return { serverNow: now, enabled: true, name: policy.name || 'Everly', timezone: ZONE,
    recurrence: policy.recurrence, locked: !!current, periods,
    cutoffAt: (current || next)?.cutoffAt ?? null, unlockAt: current?.unlockAt ?? null,
    validUntil: policy.recurrence === 'once' ? null : periods[periods.length - 1].unlockAt };
}
const validId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
function createBedtime({ stateFile = process.env.BEDTIME_STATE_FILE || path.join(__dirname, 'bedtime-state.json'), keyFile = process.env.BEDTIME_KEY_FILE || path.join(__dirname, '.bedtime-parent-key'), now = Date.now } = {}) {
  let state = { devices: {}, policy: null };
  if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const save = () => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(`${stateFile}.tmp`, stateFile);
  };
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const key = fs.readFileSync(keyFile, 'utf8').trim();
  function status(deviceId) { return schedule(validId(deviceId) && state.policy?.deviceId === deviceId ? state.policy : null, now()); }
  function register(deviceId, userAgent, metadata = {}) {
    if (!validId(deviceId)) throw new Error('Invalid device code');
    const previous = state.devices[deviceId];
    if (!previous && Object.keys(state.devices).length >= 128) throw new Error('Device list is full');
    const platform = /Windows/i.test(userAgent) ? 'Windows' : /Macintosh|Mac OS X/i.test(userAgent) ? 'Mac' : /Android/i.test(userAgent) ? 'Android' : /iPhone|iPad/i.test(userAgent) ? 'iPhone / iPad' : 'Other';
    state.devices[deviceId] = { id: deviceId, code: deviceId.slice(0, 6).toUpperCase(), platform,
      userAgent: String(userAgent).slice(0, 300), controller: String(metadata.controller || previous?.controller || '').slice(0, 160),
      lastSeen: now(), firstSeen: previous?.firstSeen || now() };
    if (!previous || now() - (previous.savedAt || 0) > 60000) {
      state.devices[deviceId].savedAt = now(); save();
    } else state.devices[deviceId].savedAt = previous.savedAt;
    return status(deviceId);
  }
  const allowedOrigin = origin => !origin || /^http:\/\/(147\.182\.235\.54:5173|localhost:\d+|127\.0\.0\.1:\d+)$/.test(origin);
  async function handleHttp(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/bedtime/')) return false;
    const origin = req.headers.origin;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    const reply = (code, value) => { res.writeHead(code); res.end(JSON.stringify(value)); };
    if (!allowedOrigin(origin)) { reply(403, { error: 'Origin not allowed' }); return true; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { reply(204, null); return true; }
    const admin = url.pathname === '/api/bedtime/admin';
    if (admin && req.headers.authorization !== `Bearer ${key}`) { reply(401, { error: 'Parent key required' }); return true; }
    try {
      if (admin && req.method === 'GET') {
        reply(200, { devices: Object.values(state.devices).sort((a, b) => b.lastSeen - a.lastSeen), policy: state.policy, serverNow: now() });
      } else if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) throw new Error('Request too large'); }
        const data = JSON.parse(body);
        if (admin) {
          if (!validId(data.deviceId) || !state.devices[data.deviceId]) throw new Error('Choose a registered device');
          if (!['nightly', 'once'].includes(data.recurrence)) throw new Error('Choose nightly or once');
          state.policy = { deviceId: data.deviceId, name: 'Everly', recurrence: data.recurrence, date: dateAt(now()) };
          save(); reply(200, status(data.deviceId));
        } else if (url.pathname === '/api/bedtime/register') {
          reply(200, register(data.deviceId, req.headers['user-agent'] || '', data));
        } else reply(404, { error: 'Not found' });
      } else reply(405, { error: 'Method not allowed' });
    } catch (err) { reply(400, { error: err.message }); }
    return true;
  }
  return { status, register, handleHttp };
}
module.exports = { createBedtime, schedule, localTime, dateAt };
