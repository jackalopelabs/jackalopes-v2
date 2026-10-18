import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
const result = await build({ stdin: { contents: `export * from './src/game/water-sharks'; export * from './src/game/terrain/swim-speeds';export * from './src/game/adventure-caves';export * from './src/game/terrain/level-document'`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false })
const { SHARK_SPEED, SWIM_SPEED, SWIM_SPRINT_SPEED, createSharks, stepSharks, sharkHabitat, sharkCanChase,
  createSharkBiteGate, createSharkPeer, caveLayout, normalizeTerrainLevel } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const level = normalizeTerrainLevel(JSON.parse(readFileSync(new URL('./fixtures/adventure-valley.json', import.meta.url))))
const water = caveLayout(level).waterLevel
const swimmer = (x = 0, z = -120) => ({ x, y: water - .35, z, enabled: true, swimming: true, riding: false, immune: false })
const nearMouth = s => ({ ...swimmer(), x: s.x + Math.sin(s.heading) * 1.55, y: s.y + .45, z: s.z + Math.cos(s.heading) * 1.55 })

test('sharks use a shared swim speed and are slightly slower than sprint, faster than normal swim', () => {
  assert.equal(SWIM_SPRINT_SPEED, 6.5); assert.equal(SHARK_SPEED, 6.1)
  assert(SHARK_SPEED < SWIM_SPRINT_SPEED); assert(SHARK_SPEED > SWIM_SPEED)
})
test('bounded sharks spawn with whole-body water clearance in the actual cave and painted water', () => {
  const sharks = createSharks(level)
  assert(sharks.length >= 2 && sharks.length <= 4)
  assert.equal(sharks.filter(s => s.kind === 'cave').length, 2)
  for (const shark of sharks) assert(sharkHabitat(level, shark.x, shark.z, shark.kind))
})
test('both avatar appearances are eligible; shore, slide, disabled, immune and sky players are safe', () => {
  const shark = createSharks(level)[0]
  for (const avatar of ['jackalope', 'astronaut']) assert(sharkCanChase(level, shark, { ...nearMouth(shark), avatar }))
  for (const p of [{ ...nearMouth(shark), swimming: false }, { ...nearMouth(shark), riding: true },
    { ...nearMouth(shark), immune: true }, { ...nearMouth(shark), enabled: false },
    { ...nearMouth(shark), y: 3 }, { ...nearMouth(shark), x: 4, z: -87 }]) assert.equal(sharkCanChase(level, shark, p), false)
})
test('all pursuit displacement, including diving and boundary turns, obeys 6.1 speed cap', () => {
  const sharks = createSharks(level).filter(s => s.kind === 'cave')
  for (let i = 0; i < 2000; i++) {
    const previous = sharks.map(s => ({ ...s }))
    const p = { ...swimmer(Math.sin(i / 120) * 40, -125 + Math.cos(i / 120) * 14), y: water - 3 }
    stepSharks(level, sharks, new Map([['p', p]]), .05, i * .05)
    sharks.forEach((s, j) => {
      assert(Math.hypot(s.x - previous[j].x, s.y - previous[j].y, s.z - previous[j].z) <= SHARK_SPEED * .05 + 1e-8)
      assert(sharkHabitat(level, s.x, s.z, s.kind))
    })
  }
})
test('sprinting straight increases the gap while normal swimming is caught', () => {
  for (const speed of [SWIM_SPEED, SWIM_SPRINT_SPEED]) {
    const sharks = [createSharks(level)[0]], s = sharks[0]
    s.x = -25; s.z = -122; s.heading = Math.PI / 2
    const p = swimmer(-19, -122), gate = createSharkBiteGate(); gate.reset(-2000)
    let caught = false
    for (let i = 0; i < 150; i++) {
      p.x += speed * .05
      stepSharks(level, sharks, new Map([['p', p]]), .05, i * .05)
      if (gate.tryBite(level, sharks, p, i * 50, true) !== null) caught = true
    }
    if (speed === SWIM_SPEED) assert(caught)
    else { assert.equal(caught, false); assert(p.x - s.x > 6) }
  }
})
test('eating checks the real mouth proximity, fresh state and cooldown, then re-arms', () => {
  const sharks = createSharks(level), p = nearMouth(sharks[0]), gate = createSharkBiteGate(); gate.reset(0)
  assert.equal(gate.tryBite(level, sharks, p, 500, true), null)
  assert.equal(gate.tryBite(level, sharks, p, 1000, false), null)
  assert.equal(gate.tryBite(level, sharks, { ...p, x: p.x + 5 }, 1000, true), null)
  assert.equal(gate.tryBite(level, sharks, p, 1000, true), sharks[0].id)
  assert.equal(gate.tryBite(level, sharks, p, 2000, true), null)
  gate.protect(7000); assert.equal(gate.tryBite(level, sharks, p, 11000, true), null)
  assert.equal(gate.tryBite(level, sharks, p, 12500, true), sharks[0].id)
})
test('pause/large, negative and invalid deltas cannot advance sharks', () => {
  const sharks = createSharks(level), before = structuredClone(sharks)
  for (const dt of [10, -.05, NaN, Infinity, 0]) stepSharks(level, sharks, new Map([['p', swimmer()]]), dt, 100)
  assert.deepEqual(sharks, before)
})
test('a swimmer already overlapping the body is caught, including stationary entry', () => {
  const sharks = createSharks(level), s = sharks[0], gate = createSharkBiteGate(); gate.reset(0)
  assert.equal(gate.tryBite(level, sharks, { ...swimmer(s.x, s.z), y: s.y + .45 }, 1000, true), s.id)
})
test('two peers elect one simulator, converge, reject echoes, and take over after its departure', () => {
  const qa = [], qb = []
  const a = createSharkPeer(level, 'a', event => qa.push(event)), b = createSharkPeer(level, 'b', event => qb.push(event))
  for (let now = 0; now < 3000; now += 50) {
    a.step(swimmer(-12), now, .05, true); b.step(swimmer(12), now, .05, true)
    while (qa.length) b.receive(qa.shift(), now)
    while (qb.length) a.receive(qb.shift(), now)
  }
  assert.equal(a.leader, 'a'); assert.equal(b.leader, 'a')
  assert(Math.hypot(a.sharks[0].x - b.sharks[0].x, a.sharks[0].z - b.sharks[0].z) < 1.3)
  assert(b.fresh(3000)); assert.equal(b.fresh(5000), false)
  for (let now = 3000; now < 6100; now += 50) b.step(swimmer(12), now, .05, true)
  assert.equal(b.leader, 'b'); assert(b.fresh(6100))
})
test('malformed/stale snapshots cannot relocate sharks; chomp messages never grant a catch', () => {
  const peer = createSharkPeer(level, 'b', () => {}), before = structuredClone(peer.sharks)
  peer.receive({ event_type: 'water_sharks_state', actor: 'a', sequence: 1, sharks: [] }, 0)
  peer.receive({ event_type: 'water_sharks_peer', actor: 'a', sequence: 1, swimmer: swimmer() }, 0)
  assert.equal(peer.receive({ event_type: 'water_sharks_chomp', actor: 'a', sequence: 2, shark: 0 }, 1), 0)
  assert.equal(peer.receive({ event_type: 'water_sharks_chomp', actor: 'a', sequence: 2, shark: 0 }, 2), null)
  peer.receive({ event_type: 'water_sharks_state', actor: 'a', sequence: 3, sharks: before.map(s => ({ ...s, x: NaN })) }, 2)
  peer.receive({ event_type: 'water_sharks_state', actor: 'a', sequence: 4, sharks: before.map(s => ({ ...s, y: 1000 })) }, 3)
  assert.deepEqual(peer.sharks, before)
})
