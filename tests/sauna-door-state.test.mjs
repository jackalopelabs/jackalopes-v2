import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
const compiled = await build({ stdin: { contents: "export * from './src/game/sauna-door-state'; export * from './src/game/cave-sauna';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false })
const { INITIAL_SAUNA_DOOR, applySaunaDoorState, stepSaunaFog, CAVE_SAUNA_POSITION,
  canUseSaunaDoor, isInSaunaDoorSweep, isInsideSauna } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

test('peers and late joiners converge through closing, reopening, echoes and stale snapshots', () => {
  const close = { closed: true, changedAt: 10, actor: 'dad' }, open = { closed: false, changedAt: 11, actor: 'everly' }
  let dad = applySaunaDoorState(INITIAL_SAUNA_DOOR, close), everly = applySaunaDoorState(INITIAL_SAUNA_DOOR, close)
  assert.deepEqual(dad, everly)
  assert.deepEqual(applySaunaDoorState(INITIAL_SAUNA_DOOR, dad), dad, 'late joiner learns the closed state')
  everly = applySaunaDoorState(everly, open); dad = applySaunaDoorState(dad, open)
  assert.deepEqual(dad, everly); assert.equal(dad.closed, false)
  assert.equal(applySaunaDoorState(dad, close), dad); assert.equal(applySaunaDoorState(dad, open), dad)
  const concurrent = { closed: true, changedAt: 11, actor: 'z' }
  assert.deepEqual(applySaunaDoorState(dad, concurrent), applySaunaDoorState(concurrent, dad))
  for (const invalid of [null, {}, { ...open, closed: 'false' }, { ...open, changedAt: NaN }, { ...open, actor: 3 }])
    assert.equal(applySaunaDoorState(dad, invalid), dad)
})
test('door remains usable from inside dense fog and from either side without sweeping through players', () => {
  const floor = -22.02, { x, z } = CAVE_SAUNA_POSITION
  const inside = { x, y: floor + 1.95, z }, outside = { x, y: floor + 1.95, z: z + 5 }
  assert(canUseSaunaDoor(floor, inside)); assert(canUseSaunaDoor(floor, outside))
  assert(!isInSaunaDoorSweep(floor, inside)); assert(!isInSaunaDoorSweep(floor, outside))
  assert(isInSaunaDoorSweep(floor, { ...inside, z: z + 3 }))
  assert(!canUseSaunaDoor(floor, { ...inside, y: 0 }), 'cannot interact from terrain above cave')
  assert(!canUseSaunaDoor(floor, { ...inside, x: NaN }))
  assert(isInsideSauna(floor, { x, y: floor + 2.1, z }))
  assert(!isInsideSauna(floor, outside), 'sauna fog excludes the rest of the cave')
})
test('sealed sauna becomes very foggy and reopening clears it at common frame rates', () => {
  for (const fps of [30, 60, 144]) {
    let fog = 0
    for (let i = 0; i < fps * 5; i++) fog = stepSaunaFog(fog, true, 1 / fps)
    assert(fog > .97)
    for (let i = 0; i < fps * 3; i++) fog = stepSaunaFog(fog, false, 1 / fps)
    assert(fog < .002)
  }
})
