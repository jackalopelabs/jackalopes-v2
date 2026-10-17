import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import * as THREE from 'three'
const compiled = await build({ stdin: { contents: `export * from './src/game/cave-party-state'; export * from './src/game/cave-party-room'; export * from './src/game/cave-party-materials'; export * from './src/game/adventure-caves'; export * from './src/game/terrain/level-document'; export { canUseSaunaDoor } from './src/game/cave-sauna'; export * from './src/game/cave-steam';`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false })
const { INITIAL_CAVE_PARTY, PARTY_EVENTS, applyCavePartyState, createCavePartyPeer, createPartySwitchLatch,
  stepPartyBlend, PARTY_SWITCH, PARTY_FRONT_Z, PARTY_BALLOONS, partyQualityBudget, canUsePartySwitch, isPartyAir,
  createPartyProjectionGeometry, createPartyAccentGeometry, partyBeamFraction, createPartyStarGeometry,
  createTerrainLevel, createCaveGeometries, caveFloorAt, canUseSaunaDoor, createCaveSteamGeometry, createCaveSteamMaterial } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

// A two-peer relay with server-added player IDs, self echoes, queued delivery and targeted snapshots.
function relayFixture() {
  const peers = new Map(), queue = []
  const join = id => {
    const peer = createCavePartyPeer(id, event => queue.push({ ...event, player: id }), () => id, () => {})
    peers.set(id, peer); return peer
  }
  const deliver = () => { for (let event; (event = queue.shift());) for (const peer of peers.values()) peer.receive(event) }
  return { peers, queue, join, deliver }
}
test('party defaults OFF; two peers, echoes, stale messages, late join and reconnect converge', () => {
  const relay = relayFixture(), a = relay.join('a'), b = relay.join('b')
  assert.equal(a.state.on, false); assert.equal(b.state.on, false)
  a.set(true); relay.deliver(); assert.deepEqual(a.state, b.state)
  const staleOn = { ...a.state }
  b.set(false); relay.deliver(); assert.equal(a.state.on, false)
  a.receive({ event_type: PARTY_EVENTS.set, state: staleOn }); assert.equal(a.state.on, false)
  const late = relay.join('late'); late.request(); relay.deliver(); assert.deepEqual(late.state, a.state)
  relay.peers.delete('b'); a.set(true); relay.deliver()
  relay.peers.set('b', b); b.request(); relay.deliver(); assert.deepEqual(b.state, a.state)
  const before = a.state; a.receive({ event_type: PARTY_EVENTS.set, state: before }); assert.equal(a.state, before)
  assert.equal(relay.queue.length, 0, 'snapshots and echoes never create a relay loop')
})
test('simultaneous and reordered opposing absolute updates converge deterministically without double-toggles', () => {
  const relay = relayFixture(), a = relay.join('a'), b = relay.join('b')
  a.set(true); b.set(true); relay.queue.reverse(); relay.deliver()
  assert.deepEqual(a.state, b.state); assert.equal(a.state.on, true)
  const revision = a.state.revision + 1
  const off = { on: false, revision, actor: 'a' }, on = { on: true, revision, actor: 'b' }
  a.receive({ event_type: PARTY_EVENTS.set, state: off }); a.receive({ event_type: PARTY_EVENTS.set, state: on })
  b.receive({ event_type: PARTY_EVENTS.set, state: on }); b.receive({ event_type: PARTY_EVENTS.set, state: off })
  assert.deepEqual(a.state, b.state)
  a.receive({ event_type: PARTY_EVENTS.snapshot, target: 'someone-else', state: { on: false, revision: revision + 9, actor: 'z' } })
  assert.equal(a.state.on, true, 'snapshots are targeted')
  assert.equal(applyCavePartyState(INITIAL_CAVE_PARTY, { on: true, revision: 1, actor: 'clock-free' }).revision, 1)
  for (const invalid of [null, {}, { ...off, on: 1 }, { ...off, revision: NaN }, { ...off, revision: .5 }, { ...off, revision: -1 }, { ...off, actor: '' }, { ...off, actor: 'x'.repeat(121) }])
    assert.equal(applyCavePartyState(a.state, invalid), a.state)
  a.receive({ event_type: 'sauna_door', state: { on: false, revision: revision + 99, actor: 'z' } })
  assert.equal(a.state.on, true, 'sauna events do not affect party state')
})
test('one press is one toggle for held keyboard/controller/touch, including entering range while held', () => {
  const press = createPartySwitchLatch()
  assert(press(true, true, true))
  for (let i = 0; i < 180; i++) assert.equal(press(true, true, true), false)
  press(false, true, true); assert(press(true, true, true))
  press(false, false, true); assert.equal(press(true, false, true), false)
  assert.equal(press(true, true, true), false)
  press(false, true, true); assert.equal(press(true, true, false), false)
  assert.equal(press(true, true, true), false)
})
const level = createTerrainLevel(), floor = caveFloorAt(level, 0, -187)
test('wall switch is reachable by either avatar body origin, but not above the cave or at sauna door', () => {
  const player = { x: PARTY_SWITCH.x + 1, y: floor + 2.15, z: PARTY_SWITCH.z + 1 }
  assert(canUsePartySwitch(floor, player)); assert.equal(canUseSaunaDoor(floor, player), false)
  assert.equal(canUsePartySwitch(floor, { ...player, y: 0 }), false)
  assert.equal(canUsePartySwitch(floor, { ...player, x: NaN }), false)
  assert.equal(canUsePartySwitch(floor, { x: 8.5, y: floor + 2.15, z: -182 }), false)
  // Entire switch-use disk stays far outside the sauna's use region.
  for (let i = 0; i < 36; i++) assert.equal(canUseSaunaDoor(floor, { x: PARTY_SWITCH.x + Math.cos(i) * 2.8, y: player.y, z: PARTY_SWITCH.z + Math.sin(i) * 2.8 }), false)
})
test('copied galaxy projection follows the real shell and burrow opening, is room-clipped, and never mutates collision geometry', () => {
  const cave = createCaveGeometries(level)
  const before = [cave.walls, cave.ceiling].map(g => Array.from(g.attributes.position.array))
  const projection = createPartyProjectionGeometry([cave.walls, cave.ceiling])
  const points = projection.attributes.position
  assert(points.count > 30)
  for (let i = 0; i < points.count; i++) { assert(Number.isFinite(points.getY(i))); assert(points.getZ(i) <= PARTY_FRONT_Z + 1e-5) }
  const raycast = geometry => { const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld(); return mesh }
  const projected = raycast(projection), roof = raycast(cave.ceiling)
  for (const [x, z] of [[-15, -187], [0, -180], [16, -182], [0, -194]]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, floor + 2, z), new THREE.Vector3(0, 1, 0))
    const a = ray.intersectObject(roof)[0], b = ray.intersectObject(projected)[0]
    assert.equal(!!a, !!b, 'no new roof over the real burrow opening')
    if (a) assert(Math.abs(a.distance - b.distance) < 1e-5)
  }
  assert.deepEqual([cave.walls, cave.ceiling].map(g => Array.from(g.attributes.position.array)), before)
  projected.material.dispose(); roof.material.dispose(); projection.dispose()
  for (const g of Object.values(cave)) if (g?.isBufferGeometry) g.dispose()
})
test('sweeping beams terminate inside the room and before the sauna, never through rock or ceiling', () => {
  for (let i = 0; i < 240; i++) {
    const from = { x: i % 2 ? 7 : -7, y: floor + 5.8, z: i % 2 ? -178 : -190 }
    const angle = i * .19, to = { x: from.x + Math.sin(angle) * 40, y: floor + 2 + Math.cos(i) * 16, z: from.z + Math.cos(angle) * 40 }
    const fraction = partyBeamFraction(level, from, to)
    assert(fraction >= 0 && fraction <= 1)
    for (let j = 0; j <= 12; j++) {
      const t = fraction * j / 12
      assert(isPartyAir(level, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t }))
    }
  }
  const from = { x: 0, y: floor + 2, z: -181 }, to = { x: 8.5, y: floor + 2, z: -187 }
  assert(partyBeamFraction(level, from, to) < .75, 'conservative cabin blocking includes the door and glass')
})
test('stars, balloons and RGB accents are finite, bounded decorations; low quality reduces every budget', () => {
  const stars = createPartyStarGeometry(level), accent = createPartyAccentGeometry(level)
  for (let i = 0; i < stars.attributes.position.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(stars.attributes.position, i)
    assert(isPartyAir(level, p))
  }
  for (const [x, y, z] of PARTY_BALLOONS) for (const dx of [-.95, .95]) for (const dz of [-.75, .75])
    assert(isPartyAir(level, { x: x + dx, y: floor + y + 1, z: z + dz }))
  assert(accent.attributes.position.count > 0)
  for (const attribute of [stars.attributes.position, accent.attributes.position]) assert(Array.from(attribute.array).every(Number.isFinite))
  const low = partyQualityBudget('low'), full = partyQualityBudget('high')
  for (const key of Object.keys(low)) assert(low[key] < full[key])
  assert.equal(low.lights, 1); assert.equal(full.lights, 3)
  stars.dispose(); accent.dispose()
})
test('OFF reaches zero with modest frame-independent fades; shared normal steam retains its original settings', () => {
  for (const fps of [30, 60, 144]) {
    let blend = 0
    for (let i = 0; i < fps * 5; i++) blend = stepPartyBlend(blend, true, 1 / fps)
    assert.equal(blend, 1)
    for (let i = 0; i < fps * 5; i++) blend = stepPartyBlend(blend, false, 1 / fps)
    assert.equal(blend, 0)
  }
  const steam = createCaveSteamGeometry(), material = createCaveSteamMaterial(1.02)
  assert.equal(steam.attributes.position.count, 9 * 6)
  assert.equal(material.uniforms.amount.value, 1); assert.equal(material.uniforms.rise.value, 1.65)
  assert.equal(material.uniforms.waterHeight.value, 1.02)
  steam.dispose(); material.dispose()
})
