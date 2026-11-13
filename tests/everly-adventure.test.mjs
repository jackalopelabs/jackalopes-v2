import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { build } from 'esbuild'

const compiled = await build({
  stdin: { contents: `export * from './src/game/game-mode'; export * from './src/game/everly-adventure';`, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const { parseGameMode, shouldInitializeSharedTerrain, shouldConnectToSharedSession, shouldReloadForModeEntry,
  EVERLY_GOALS, EVERLY_RIVER, EVERLY_RIVER_BANKS, EVERLY_DRY_GROUND_CAPS, EVERLY_CASTLE_FLOOR, EVERLY_CASTLE_FRONT_WALLS, EVERLY_RIVER_EXIT_RAMPS,
  everlyGroundRegionAt, everlyWaterSurfaceAt, everlyRampTopAtWorldX, createEverlyCloudTrail, reachedEverlyGoals, resetEverlyGoals, isEverlyDoorPress } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const [scene, app, menu, main, connection, intro] = await Promise.all([
  'src/game/EverlyAdventure.tsx', 'src/App.tsx', 'src/components/GameModeMenu.tsx', 'src/main.tsx',
  'src/network/ConnectionManager.ts', 'src/components/IntroScreen/IntroScreen.tsx',
].map(file => readFile(file, 'utf8')))

test('mode picker selects Everly; boot, menu transitions, and shared networking stay isolated', () => {
  assert.equal(parseGameMode('everly'), 'everly')
  assert.equal(parseGameMode('adventure'), 'adventure')
  assert.equal(shouldInitializeSharedTerrain('everly'), false)
  assert.equal(shouldInitializeSharedTerrain(null), false)
  assert.equal(shouldInitializeSharedTerrain('adventure'), true)
  assert.equal(shouldInitializeSharedTerrain(null, true), true, 'terrain editor remains supported')
  assert.equal(shouldConnectToSharedSession('everly'), false)
  assert.equal(shouldConnectToSharedSession(null), false, 'unselected picker never joins')
  assert.equal(shouldConnectToSharedSession('adventure'), true)
  assert.equal(shouldReloadForModeEntry('adventure', 'everly'), true, 'Adventure boots after shared-map initialization')
  assert.equal(shouldReloadForModeEntry('adventure', 'adventure'), false)
  assert.equal(shouldReloadForModeEntry('everly', 'adventure'), false)
  assert.match(main, /shouldInitializeSharedTerrain\(requestedMode, terrainEditorActive\)/)
  assert.match(connection, /if \(this\.connectionEnabled\) setTimeout\(\(\) => this\.connect\(\), 500\)/)
  assert.match(connection, /this\.connectionEnabled = false[\s\S]*this\.disconnect\(\)/)
  assert.match(app, /window\.location\.assign\(url\.href\)/)
  assert.match(app, /connectionManager\.setGameMode\(nextMode\)/)
  assert.match(menu, /everly/)
  assert.match(intro, /everly/i, 'Hunt onboarding is replaced for the child-friendly realm')
})

test('private river bounds, clear bank edges, bed and swim sampler are consistent', () => {
  assert.equal(EVERLY_RIVER_BANKS[0].centerX + EVERLY_RIVER_BANKS[0].halfWidth, EVERLY_RIVER.left)
  assert.equal(EVERLY_RIVER_BANKS[1].centerX - EVERLY_RIVER_BANKS[1].halfWidth, EVERLY_RIVER.right)
  assert.equal(everlyWaterSurfaceAt(0, 0, 20), EVERLY_RIVER.surface)
  assert.equal(everlyWaterSurfaceAt(0, -1.8, 20, true), EVERLY_RIVER.surface)
  assert.equal(everlyWaterSurfaceAt(0, -4.1, 20), null)
  assert.equal(everlyWaterSurfaceAt(8, 0, 20), null)
  assert.equal(everlyWaterSurfaceAt(0, 0, 60), null)
  assert.equal(EVERLY_RIVER.centerZ, (EVERLY_RIVER.nearZ + EVERLY_RIVER.farZ) / 2)
  assert.equal(EVERLY_RIVER.halfLength, (EVERLY_RIVER.farZ - EVERLY_RIVER.nearZ) / 2)
  assert.match(scene, /setColorAt\(index, new THREE\.Color\(color\)\)/)
  assert.match(scene, /instancedMesh ref=\{fish\}/)
  assert.match(scene, /makeEverlyFishGeometry/, 'fish geometry includes fins and visible eyes')
})

test('river endcaps and castle floor match real scene ground regions instead of a spanning hidden platform', () => {
  assert.equal(everlyGroundRegionAt(0, 20), null, 'the water channel remains open over its entire length')
  assert.equal(everlyGroundRegionAt(0, 54), 'river-exit', 'swimmers can climb to the dry exit landing')
  assert.equal(everlyGroundRegionAt(0, -51), 'castle-approach', 'dry approach reaches the doorway')
  assert.equal(everlyGroundRegionAt(0, -63), 'castle-floor', 'castle interior has solid ground')
  assert.equal(everlyGroundRegionAt(-38.5, 20), 'bank')
  assert.equal(everlyGroundRegionAt(0, NaN), null)
  assert.deepEqual(EVERLY_DRY_GROUND_CAPS.map(({ id }) => id), ['river-exit', 'castle-approach'])
  assert.equal(EVERLY_CASTLE_FLOOR.centerZ, -68)
})

test('river exit ramps meet the bed inside the bank, intercept floating feet before the wall, and reach deck height', () => {
  const capsule = { halfHeight: 0.85, radius: 0.35 }, floatingRootY = -0.2, colliderOffsetY = -0.65
  const floatingFeetY = floatingRootY + colliderOffsetY - capsule.halfHeight - capsule.radius
  for (const ramp of EVERLY_RIVER_EXIT_RAMPS) {
    const innerX = ramp.centerX - ramp.side * (ramp.halfWidth * Math.cos(Math.abs(ramp.rotationZ)) + ramp.halfHeight * Math.sin(Math.abs(ramp.rotationZ)))
    let low = innerX * ramp.side, high = EVERLY_RIVER.right
    for (let i = 0; i < 32; i++) {
      const middle = (low + high) / 2
      const surface = everlyRampTopAtWorldX(ramp, ramp.side * middle)
      if (surface !== null && surface < EVERLY_RIVER.bed) low = middle
      else high = middle
    }
    const bedCrossingX = ramp.side * ((low + high) / 2)
    const bedCrossingTop = everlyRampTopAtWorldX(ramp, bedCrossingX)
    const bankTop = everlyRampTopAtWorldX(ramp, ramp.side * EVERLY_RIVER.right)
    const beforeWallTop = everlyRampTopAtWorldX(ramp, ramp.side * (EVERLY_RIVER.right - capsule.radius))
    assert(innerX * ramp.side > 0 && innerX * ramp.side < EVERLY_RIVER.right, 'ramp begins inside the channel')
    assert(bedCrossingTop !== null && Math.abs(bedCrossingTop - EVERLY_RIVER.bed) < 0.1, 'ramp surface rises through the riverbed height inside the channel')
    assert(bankTop !== null && bankTop >= -0.1, 'outer ramp end reaches the bank deck')
    assert(beforeWallTop !== null && beforeWallTop > floatingFeetY, 'ramp catches a floating player before its capsule hits the vertical bank')
    assert(ramp.centerZ + ramp.halfDepth >= EVERLY_RIVER.farZ, 'ramp overlaps the dry exit landing')
  }
})

test('cloud trail is continuous, solid, broad and reaches the castle-height summit', () => {
  const clouds = createEverlyCloudTrail()
  assert.equal(clouds.length, 15)
  assert(clouds[0].position[0] < -25 && clouds[0].position[2] > 0)
  assert(clouds.at(-1).position[1] > 9 && clouds.at(-1).position[2] < -55)
  for (let i = 1; i < clouds.length; i++) {
    const a = clouds[i - 1].position, b = clouds[i].position
    assert(Math.hypot(a[0] - b[0], a[2] - b[2]) < 8, 'adjacent cloud footprints overlap for safe stepping')
    assert(b[1] > a[1], 'cloud route rises gently')
  }
  assert.match(scene, /type="fixed" colliders=\{false\} position=\{cloud\.position\}/)
  assert.match(scene, /CuboidCollider args=\{\[cloud\.width \* \.48, \.45, cloud\.depth \* \.48\]\}/)
})

test('castle front leaves a real 6m doorway; swinging kinematic leaves block until opened', () => {
  const left = EVERLY_CASTLE_FRONT_WALLS[0], right = EVERLY_CASTLE_FRONT_WALLS[1]
  assert.equal(left.centerX + left.halfWidth, -3)
  assert.equal(right.centerX - right.halfWidth, 3)
  assert.equal(right.centerX - right.halfWidth - (left.centerX + left.halfWidth), 6)
  assert.equal(isEverlyDoorPress(true, false), true)
  assert.equal(isEverlyDoorPress(true, true), false, 'held use only opens once')
  assert.equal(isEverlyDoorPress(false, true), false)
  assert.match(scene, /type="kinematicPosition" colliders=\{false\}/)
  assert.match(scene, /setNextKinematicRotation/)
  assert.match(scene, /F \/ X \/ Use · Open castle doors/)
  assert.match(scene, /onOpened\(\)/)
})

test('unicorn is a horse silhouette with exactly one central horn and seven separated rainbow bands', () => {
  const unicorn = scene.slice(scene.indexOf('function Unicorn'), scene.indexOf('function makeEverlyFishGeometry'))
  assert.match(unicorn, /four hooved legs/)
  assert.equal((unicorn.match(/<coneGeometry args=\{\[\.13, \.62/g) || []).length, 1)
  assert.match(unicorn, /side \* \.18, 2\.91, -\.9/, 'two colored ears remain')
  assert.match(unicorn, /tail-/)
  assert.match(scene, /colors\.map\(\(color, index\)/)
  assert.match(scene, /43 \+ index \* 3\.6/)
})

test('goals are local/resettable and opening, not standing near the castle, completes the castle goal', () => {
  assert(EVERLY_GOALS.some(goal => goal.id === 'flowers'))
  assert(EVERLY_GOALS.some(goal => goal.id === 'fish'))
  assert(EVERLY_GOALS.some(goal => goal.id === 'clouds'))
  assert(EVERLY_GOALS.some(goal => goal.id === 'castle'))
  assert.deepEqual(reachedEverlyGoals({ x: 0, y: 1.8, z: -62 }, new Set()), [], 'castle proximity alone does not complete it')
  assert.equal(resetEverlyGoals().size, 0)
  assert.match(scene, /const completeCastle = \(\) =>/)
  assert.match(scene, /<Castle onOpened=\{completeCastle\}/)
  assert.match(scene, /everly:reset-goals/)
  assert.match(app, /<EverlyAdventure \/>/)
})

test('picker keeps legacy Adventure/Hunt routes and its ordinary player controls; Everly has friendly onboarding', () => {
  assert.match(menu, /\['adventure', 'hunt', 'everly'\]/)
  assert.match(app, /EverlyAdventureHUD/)
  assert.match(app, /isolatedWaterSurfaceAt=\{everlyMode \? everlyWaterSurfaceAt : undefined\}/)
  assert.match(app, /adventureMode \? 'jackalope' : playerCharacterInfo\.type/)
  assert.match(app, /!everlyMode && <AdventureCombat/)
})
