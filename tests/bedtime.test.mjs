import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect as connectSocket } from 'node:net';
import { randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const { schedule, localTime, createBedtime } = require('../jackalopes-server/bedtime.cjs');
const policy = { deviceId: 'a'.repeat(32), name: 'Everly', recurrence: 'nightly', date: '2026-10-17' };
const at = iso => Date.parse(iso);

test('Denver cutoff is exact and unlocks at 7 a.m., including midnight', () => {
  assert.equal(localTime('2026-10-17', 22), at('2026-10-18T04:00:00Z'));
  assert.equal(schedule(policy, at('2026-10-18T03:59:59.999Z')).locked, false);
  assert.equal(schedule(policy, at('2026-10-18T04:00:00Z')).locked, true);
  assert.equal(schedule(policy, at('2026-10-18T06:01:00Z')).locked, true);
  assert.equal(schedule(policy, at('2026-10-18T12:59:59.999Z')).locked, true);
  assert.equal(schedule(policy, at('2026-10-18T13:00:00Z')).locked, false);
  assert.equal(schedule(policy, at('2026-10-19T04:00:00Z')).locked, true);
});
test('Denver daylight saving changes keep 10 p.m. and 7 a.m. local times', () => {
  const spring = schedule(policy, at('2026-03-08T08:00:00Z'));
  assert(spring.locked); assert.equal(spring.unlockAt, at('2026-03-08T13:00:00Z'));
  const fall = schedule(policy, at('2026-11-01T08:30:00Z'));
  assert(fall.locked); assert.equal(fall.unlockAt, at('2026-11-01T14:00:00Z'));
  assert.equal(localTime('2026-11-01', 22), at('2026-11-02T05:00:00Z'));
});
test('tonight only expires, while unselected devices have no restriction', () => {
  assert.equal(schedule({ ...policy, recurrence: 'once' }, at('2026-10-18T04:00:00Z')).locked, true);
  assert.equal(schedule({ ...policy, recurrence: 'once' }, at('2026-10-19T04:00:00Z')).locked, false);
  assert.deepEqual(schedule(null, 123), { enabled: false, locked: false, serverNow: 123 });
});

test('only the saved browser is restricted; parent API is protected and selection persists', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'bedtime-api-'));
  const stateFile = join(dir, 'state.json'), keyFile = join(dir, 'key');
  const service = createBedtime({ stateFile, keyFile, now: () => at('2026-10-18T04:00:00Z') });
  const server = createServer(async (req, res) => { if (!await service.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/api/bedtime`;
  const post = (route, body, headers = {}) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const child = policy.deviceId, parent = 'b'.repeat(32);
  assert.equal((await post('/register', { deviceId: child }, { 'User-Agent': 'Windows NT 10.0', Origin: 'http://147.182.235.54:5173' })).status, 200);
  await post('/register', { deviceId: parent }, { 'User-Agent': 'Macintosh' });
  assert.equal((await fetch(url + '/admin')).status, 401);
  assert.equal((await post('/admin', { deviceId: child, recurrence: 'nightly' })).status, 401);
  const auth = { Authorization: `Bearer ${readFileSync(keyFile, 'utf8').trim()}` };
  assert.equal((await post('/admin', { deviceId: child, recurrence: 'nightly' }, { ...auth, Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await post('/admin', { deviceId: 'bogus', recurrence: 'nightly' }, auth)).status, 400);
  assert.equal((await post('/admin', { deviceId: child, recurrence: 'nightly' }, auth)).status, 200);
  assert.equal((await (await post('/register', { deviceId: child })).json()).locked, true);
  assert.equal((await (await post('/register', { deviceId: parent })).json()).enabled, false);
  const restored = createBedtime({ stateFile, keyFile, now: () => at('2026-10-18T04:00:00Z') });
  assert.equal(restored.status(child).locked, true); assert.equal(restored.status(parent).enabled, false);
  const devices = await (await fetch(url + '/admin', { headers: auth })).json();
  assert.equal(devices.devices.find(d => d.id === child).platform, 'Other'); // registration reflects current request UA
  assert.equal(devices.policy.deviceId, child);
});

test('real websocket server removes a selected player at cutoff and denies rejoining, while the Mac keeps playing', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'bedtime-ws-'));
  const stateFile = join(dir, 'state.json'), keyFile = join(dir, 'key'), clockFile = join(dir, 'clock');
  writeFileSync(stateFile, JSON.stringify({ devices: {}, policy }));
  writeFileSync(clockFile, String(at('2026-10-18T03:59:59Z')));
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const script = `const fs=require('fs');Date.now=()=>Number(fs.readFileSync(${JSON.stringify(clockFile)},'utf8'));require(${JSON.stringify(require.resolve('../jackalopes-server/server.js'))})`;
  const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, SERVER_PORT: String(port), BEDTIME_STATE_FILE: stateFile, BEDTIME_KEY_FILE: keyFile }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill('SIGTERM'); await once(child, 'exit'); rmSync(dir, { recursive: true, force: true }); });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  for (let i = 0; i < 100; i++) { if (output.includes('Server running at')) break; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert(output.includes('Server running at'), output);
  const connect = async (id, name) => {
    const socket = connectSocket(port, '127.0.0.1'); const messages = [];
    await once(socket, 'connect');
    let buffer = Buffer.alloc(0), upgraded = false;
    const ws = { readyState: 1, terminate: () => socket.destroy(), send: text => {
      const payload = Buffer.from(text), mask = randomBytes(4);
      const header = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length]) : Buffer.from([0x81, 0xfe, payload.length >> 8, payload.length & 255]);
      const masked = Buffer.from(payload); for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
      socket.write(Buffer.concat([header, mask, masked]));
    } };
    socket.on('close', () => { ws.readyState = 3; });
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      if (!upgraded) { const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return; assert(buffer.toString().startsWith('HTTP/1.1 101')); buffer = buffer.subarray(end + 4); upgraded = true; }
      while (buffer.length >= 2) {
        let length = buffer[1] & 127, offset = 2;
        if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
        if (buffer.length < offset + length) return;
        const opcode = buffer[0] & 15, payload = buffer.subarray(offset, offset + length); buffer = buffer.subarray(offset + length);
        if (opcode === 1) messages.push(JSON.parse(payload.toString()));
        if (opcode === 8) { ws.readyState = 3; socket.end(); }
      }
    });
    socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`);
    for (let i = 0; i < 100 && !upgraded; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert(upgraded);
    ws.send(JSON.stringify({ type: 'auth', deviceId: id, playerName: name, persistentId: id }));
    return { ws, messages };
  };
  const waitFor = async (client, type) => { for (let i = 0; i < 100; i++) { const message = client.messages.find(m => m.type === type); if (message) return message; await new Promise(resolve => setTimeout(resolve, 20)); } assert.fail(`No ${type}: ${JSON.stringify(client.messages)}`); };
  const ally = await connect(policy.deviceId, 'Everly'); const mac = await connect('b'.repeat(32), 'Parent');
  t.after(() => { ally.ws.terminate(); mac.ws.terminate(); });
  await waitFor(ally, 'auth_success'); await waitFor(mac, 'auth_success');
  for (const client of [ally, mac]) client.ws.send(JSON.stringify({ type: 'join_session', sessionKey: 'BEDTIME-QA', gameMode: 'adventure' }));
  const allyJoin = await waitFor(ally, 'join_success'); const macJoin = await waitFor(mac, 'join_success');
  assert.equal(allyJoin.session.id, macJoin.session.id);
  writeFileSync(clockFile, String(at('2026-10-18T04:00:00Z')));
  assert.equal((await waitFor(ally, 'bedtime')).locked, true);
  assert.equal(mac.ws.readyState, 1);
  const rejoin = await connect(policy.deviceId, 'Everly'); t.after(() => rejoin.ws.terminate());
  await waitFor(rejoin, 'bedtime'); assert(!rejoin.messages.some(m => m.type === 'auth_success'));
  mac.ws.send(JSON.stringify({ type: 'request_player_list' }));
  const list = await waitFor(mac, 'player_list'); assert.equal(Object.keys(list.players).length, 0);
});
