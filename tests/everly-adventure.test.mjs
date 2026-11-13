import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { build } from 'esbuild'

const compiled = await build({
  stdin: { contents: `export * from './src/game/game-mode'; export * from './src/game/everly-adventure'; export * from './src/game/everly-friends';`, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const { parseGameMode, getAdventurePlayerAppearance, canShowEverlyRestartAction, shouldInitializeSharedTerrain, shouldConnectToSharedSession, shouldReloadForModeEntry,
  EVERLY_GOALS, EVERLY_RIVER, EVERLY_RIVER_BANKS, EVERLY_DRY_GROUND_CAPS, EVERLY_CASTLE_FLOOR, EVERLY_CASTLE_FRONT_WALLS, EVERLY_RIVER_EXIT_RAMPS,
  everlyGroundRegionAt, everlyWaterSurfaceAt, everlyRampTopAtWorldX, createEverlyCloudTrail, reachedEverlyGoals, resetEverlyGoals, isEverlyDoorPress,
  createEverlyFollowTrail, createEverlyFriendState, everlyFollowerSegmentSafe, recordEverlyPlayerTrail, resetEverlyFollowTrail,
  resetEverlyFriendState, updateEverlyFriend, EVERLY_FRIEND_ENTER_RADIUS, EVERLY_FRIEND_LEAVE_RADIUS, EVERLY_FRIEND_COOLDOWN } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const [scene, app, menu, main, connection, intro, player, unicornModel] = await Promise.all([
  'src/game/EverlyAdventure.tsx', 'src/App.tsx', 'src/components/GameModeMenu.tsx', 'src/main.tsx',
  'src/network/ConnectionManager.ts', 'src/components/IntroScreen/IntroScreen.tsx', 'src/game/jackalope.tsx', 'src/game/RainbowUnicornModel.tsx',
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

test('Everly always resolves to its playable unicorn while classic avatar preference remains unchanged', () => {
  assert.equal(getAdventurePlayerAppearance('everly', 'astronaut'), 'unicorn')
  assert.equal(getAdventurePlayerAppearance('everly', 'jackalope'), 'unicorn')
  assert.equal(getAdventurePlayerAppearance('adventure', 'astronaut'), 'astronaut')
  assert.equal(getAdventurePlayerAppearance('adventure', 'jackalope'), 'jackalope')
  assert.match(app, /getAdventurePlayerAppearance\(gameMode, savedAdventureAvatar\)/)
  assert.match(app, /playerAppearance === 'unicorn'/)
  assert.match(player, /rainbowUnicorn \? <RainbowUnicornModel/)
  assert.match(player, /const modelFootOffset = rainbowUnicorn \? 1\.95 : 2\.15/)
  assert.equal((player.match(/position\.current\.y - modelFootOffset/g) || []).length, 5, 'initial, resilient, repair, per-frame and JSX placements share the foot offset')
  assert.doesNotMatch(player, /position\.current\.y - 2\.15/)
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
  assert.match(unicornModel, /legs\.current\.forEach/)
  assert.equal((unicornModel.match(/<coneGeometry args=\{\[\.13, \.62/g) || []).length, 1)
  assert.match(unicornModel, /side \* \.18, 2\.91, -\.9/, 'two colored ears remain')
  assert.match(unicornModel, /rotation=\{\[-\.35, 0, 0\]\}/, 'single forehead horn points up and forward')
  assert.match(unicornModel, /tail-/)
  assert.match(unicornModel, /currentLocomotion === 'swim'/)
  assert.match(scene, /<RainbowUnicornModel locomotionRef=/, 'NPCs reuse the player model with ref-driven movement animation')
  assert.match(scene, /<EverlyFriend key={index} home={home}/)
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
  assert.doesNotMatch(app, /EverlyAdventureHUD/, 'no persistent Everly gameplay panel is mounted')
  assert.match(app, /isolatedWaterSurfaceAt=\{everlyMode \? everlyWaterSurfaceAt : undefined\}/)
  assert.match(app, /adventureMode \? 'jackalope' : playerCharacterInfo\.type/)
  assert.match(app, /!everlyMode && <AdventureCombat/)
})

test('Everly reset stays inside the existing menu and is absent during play', () => {
  assert.equal(canShowEverlyRestartAction('everly', true), true)
  assert.equal(canShowEverlyRestartAction('everly', false), false)
  assert.equal(canShowEverlyRestartAction('adventure', true), false)
  assert.match(menu, /canShowEverlyRestartAction/)
  assert.match(menu, /M \/ MENU/)
  assert.match(app, /onRestartEverly/)
  assert.match(app, /everly:reset-goals/)
})

test('Everly friends greet only nearby same-height players, with exit hysteresis and cooldown on return', () => {
  const home = { x: -21, y: 0, z: -38, phase: 0 }
  const friend = createEverlyFriendState(home)
  const tick = (player, seconds) => {
    const steps = Math.ceil(seconds / .05)
    for (let i = 0; i < steps; i++) updateEverlyFriend(friend, player, Math.min(.05, seconds / steps))
  }
  tick({ x: home.x + EVERLY_FRIEND_ENTER_RADIUS + 1, y: 0, z: home.z }, .1)
  assert.equal(friend.greetingCount, 0, 'far player does not trigger a greeting')
  tick({ x: home.x + 5, y: 0, z: home.z }, .05)
  assert.equal(friend.greetingCount, 1)
  assert.equal(friend.engaged, true)
  assert.equal(friend.hopping, true)
  tick({ x: home.x + 16, y: 0, z: home.z }, .05)
  assert.equal(friend.engaged, true, 'leave threshold provides hysteresis')
  tick({ x: home.x + EVERLY_FRIEND_LEAVE_RADIUS + .5, y: 0, z: home.z }, .05)
  assert.equal(friend.engaged, false)
  tick({ x: home.x + 4, y: 12, z: home.z }, .05)
  assert.equal(friend.greetingCount, 1, 'cloud-height player is ignored')
  tick({ x: home.x + 4, y: -1.8, z: home.z }, .05)
  assert.equal(friend.greetingCount, 1, 'underwater player is ignored')
  tick({ x: home.x + 4, y: 0, z: home.z }, .05)
  assert.equal(friend.greetingCount, 1, 'return inside cooldown does not repeat')
  tick({ x: home.x + 23, y: 0, z: home.z }, EVERLY_FRIEND_COOLDOWN + .2)
  tick({ x: home.x + 4, y: 0, z: home.z }, .05)
  assert.equal(friend.greetingCount, 2, 'a later return greets again')
})

test('Everly follower route joins at recruit range, follows a long dry route, and catches up at bounded speed', () => {
  const home = { x: -21, y: 0, z: -38, phase: 0 }
  const friend = createEverlyFriendState(home), trail = createEverlyFollowTrail()
  const player = { x: home.x, y: 1.95, z: home.z + 10 }
  recordEverlyPlayerTrail(trail, player, true)
  updateEverlyFriend(friend, player, .05, trail, true, 0)
  assert.equal(friend.recruited, true, 'approach at ten metres recruits inside the fourteen metre join range')
  const xStart = friend.x, zStart = friend.z
  let maxStep = 0
  for (let frame = 0; frame < 60 * 8; frame++) {
    const dt = 1 / 60
    player.z += 12.24 * dt
    recordEverlyPlayerTrail(trail, player, true)
    const oldX = friend.x, oldZ = friend.z
    updateEverlyFriend(friend, player, dt, trail, true, 0)
    maxStep = Math.max(maxStep, Math.hypot(friend.x - oldX, friend.z - oldZ) / dt)
  }
  assert(Math.hypot(friend.x - home.x, friend.z - home.z) > 30, 'friend follows well beyond its original frolic/home radius')
  assert(Math.hypot(player.x - friend.x, player.z - friend.z) >= 2.7, 'friend keeps a comfortable trailing gap')
  assert(maxStep <= 13.21, `catch-up remains bounded at ${maxStep.toFixed(2)}m/s`)
  assert(maxStep >= 12.2, `lagging friend can catch a sprinting player (max measured ${maxStep.toFixed(2)}m/s; route ${friend.routeCursor.toFixed(1)}/${trail.totalDistance.toFixed(1)}; state ${friend.waitingReason})`)
  assert(Math.hypot(friend.x - xStart, friend.z - zStart) > 30, 'the recruited follower leaves its home area')
  assert.equal(friend.motion, 'run')
})

test('freshly recruited friend preserves its gap while player pauses, then follows as a dry trail grows', () => {
  const home = { x: -21, y: 0, z: -38, phase: 0 }, friend = createEverlyFriendState(home), trail = createEverlyFollowTrail()
  const player = { x: -29, y: 1.95, z: -35 }
  recordEverlyPlayerTrail(trail, player, true); updateEverlyFriend(friend, player, .05, trail, true, 0)
  assert.equal(friend.recruited, true)
  for (let frame = 0; frame < 60 * 3; frame++) {
    recordEverlyPlayerTrail(trail, player, true)
    updateEverlyFriend(friend, player, 1 / 60, trail, true, 0)
  }
  assert(Math.hypot(player.x - friend.x, player.z - friend.z) >= 3, 'waiting at the initial trail point cannot overlap a standing player')
  const beforeWalk = { x: friend.x, z: friend.z }
  for (let frame = 0; frame < Math.ceil(30 / (6.8 / 60)); frame++) {
    player.z += 6.8 / 60
    recordEverlyPlayerTrail(trail, player, true)
    updateEverlyFriend(friend, player, 1 / 60, trail, true, 0)
  }
  assert(Math.hypot(friend.x - beforeWalk.x, friend.z - beforeWalk.z) > 3, 'friend begins following once the dry breadcrumb extends beyond its gap')
  assert(Math.hypot(player.x - friend.x, player.z - friend.z) >= 3, 'joining retains a safe player gap')
})

test('Everly following distance and gait are stable at 30 and 60 fps', () => {
  const simulate = fps => {
    const home = { x: -21, y: 0, z: -38, phase: .2 }, friend = createEverlyFriendState(home), trail = createEverlyFollowTrail()
    const player = { x: -21, y: 1.95, z: -28 }
    recordEverlyPlayerTrail(trail, player, true); updateEverlyFriend(friend, player, 1 / fps, trail, true, 0)
    let runFrames = 0
    for (let frame = 0; frame < fps * 4; frame++) {
      player.z += 12.24 / fps
      recordEverlyPlayerTrail(trail, player, true)
      updateEverlyFriend(friend, player, 1 / fps, trail, true, 0)
      if (friend.motion === 'run') runFrames++
    }
    return { friend, player, runFrames }
  }
  const at30 = simulate(30), at60 = simulate(60)
  assert(Math.abs(at30.friend.z - at60.friend.z) < 1.4, `position difference ${Math.abs(at30.friend.z - at60.friend.z).toFixed(2)}m`)
  assert(at30.runFrames > 0 && at60.runFrames > 0, 'gait follows measured speed, not a frame-specific displacement threshold')
  assert(Math.abs((at30.player.z - at30.friend.z) - (at60.player.z - at60.friend.z)) < 1.4)
})

test('Everly companions retain distinct trail offsets instead of stacking', () => {
  const home = { x: -21, y: 0, z: -38, phase: 0 }, trail = createEverlyFollowTrail()
  const friends = [0, 1, 2].map(() => createEverlyFriendState(home))
  const player = { x: -21, y: 1.95, z: -28 }
  recordEverlyPlayerTrail(trail, player, true)
  for (const [index, friend] of friends.entries()) updateEverlyFriend(friend, player, .05, trail, true, index)
  for (let frame = 0; frame < 60 * 7; frame++) {
    player.z += 6.8 / 60
    recordEverlyPlayerTrail(trail, player, true)
    friends.forEach((friend, index) => updateEverlyFriend(friend, player, 1 / 60, trail, true, index))
  }
  assert(Math.abs(friends[0].z - friends[1].z) >= 3.4, 'adult unicorn bodies keep a clear first-to-second following gap')
  assert(Math.abs(friends[1].z - friends[2].z) >= 3.4, 'adult unicorn bodies keep a clear second-to-third following gap')
  assert(friends[0].z > friends[1].z && friends[1].z > friends[2].z, 'companions follow in offset order behind the player')
})

test('Everly follower uses scene ground/slab geometry and never shortcuts water, closed doors, or castle walls', () => {
  assert.equal(everlyFollowerSegmentSafe(-8, 0, -12, 0, false), true, 'same-bank path is walkable with shore-edge margin')
  assert.equal(everlyFollowerSegmentSafe(-6.8, 0, -12, 0, false), false, 'body margin keeps the follower off the river edge')
  assert.equal(everlyFollowerSegmentSafe(0, -52, 0, -57, false), false, 'closed door leaves block the actual central doorway')
  assert.equal(everlyFollowerSegmentSafe(0, -52, 0, -57, true), true, 'open doorway connects the walkable approach and floor')
  assert.equal(everlyFollowerSegmentSafe(-8, -52, -8, -57, true), false, 'front wall slab remains solid outside the doorway')
  assert.equal(everlyFollowerSegmentSafe(13, -68, 17, -68, true), false, 'side wall prevents castle shortcut')
  assert.equal(everlyFollowerSegmentSafe(0, -80, 0, -84, true), false, 'back wall/exterior crossing is rejected')
  assert.equal(everlyFollowerSegmentSafe(-8, 0, 8, 0, true), false, 'route cannot cross the river')
})

test('Everly follower waits idle through water/cloud/teleport gaps and safely rejoins on nearby dry ground', () => {
  const home = { x: -21, y: 0, z: -38, phase: .4 }, friend = createEverlyFriendState(home), trail = createEverlyFollowTrail()
  const player = { x: -21, y: 1.95, z: -33 }
  recordEverlyPlayerTrail(trail, player, true); updateEverlyFriend(friend, player, .05, trail, true, 0)
  friend.motion = 'run'
  recordEverlyPlayerTrail(trail, { x: -21, y: -1.8, z: -30 }, true)
  updateEverlyFriend(friend, { x: -21, y: -1.8, z: -30 }, .05, trail, true, 0)
  assert.equal(friend.motion, 'idle', 'underwater player leaves follower waiting without stale run animation')
  const beforeGap = { x: friend.x, z: friend.z }
  recordEverlyPlayerTrail(trail, { x: -21, y: 12, z: -20 }, true)
  recordEverlyPlayerTrail(trail, { x: -21, y: 1.95, z: -32 }, true)
  assert.equal(trail.discontinuity, true, 'return creates a new grounded trail generation')
  for (let i = 0; i < 20; i++) updateEverlyFriend(friend, { x: -21, y: 1.95, z: -32 }, .05, trail, true, 0)
  assert(Math.hypot(friend.x - beforeGap.x, friend.z - beforeGap.z) < 13.21, 'rejoin uses bounded walking, never a snap')
  assert.equal(friend.routeGeneration, trail.generation)
  const x = friend.x, z = friend.z
  recordEverlyPlayerTrail(trail, { x: 400, y: 1.95, z: 400 }, true)
  updateEverlyFriend(friend, { x: 400, y: 1.95, z: 400 }, .05, trail, true, 0)
  assert(Math.hypot(friend.x - x, friend.z - z) <= .661, 'teleport cannot move a friend across the map')
})

test('Everly follower reset clears recruited route and cooldown state', () => {
  const friend = createEverlyFriendState({ x: -21, y: 0, z: -38, phase: 0 }), trail = createEverlyFollowTrail()
  const player = { x: -21, y: 1.95, z: -35 }
  recordEverlyPlayerTrail(trail, player, true); updateEverlyFriend(friend, player, .05, trail, true, 0)
  assert.equal(friend.recruited, true)
  assert(trail.nextSequence > 0)
  resetEverlyFriendState(friend); resetEverlyFollowTrail(trail)
  assert.equal(friend.recruited, false); assert.equal(friend.following, false); assert.equal(friend.routeSeeded, false)
  assert.equal(friend.cooldownUntil, 0); assert.equal(trail.nextSequence, 0); assert.equal(trail.generation, 0)
})

test('Everly bounded trail rollover waits instead of interpolating through pruned corners', () => {
  const home = { x: -21, y: 0, z: -135, phase: 0 }, friend = createEverlyFriendState(home), trail = createEverlyFollowTrail()
  const player = { x: -21, y: 1.95, z: -130 }
  recordEverlyPlayerTrail(trail, player, true); updateEverlyFriend(friend, player, .05, trail, true, 0)
  const homeX = friend.x, homeZ = friend.z
  for (let index = 1; index <= 290; index++) {
    player.z = -130 + index * 0.5
    recordEverlyPlayerTrail(trail, player, true)
  }
  assert(trail.nextSequence > 256, 'fixed-size breadcrumb ring rolled over')
  updateEverlyFriend(friend, player, .05, trail, true, 0)
  assert.equal(friend.routeSeeded, false, 'discarded route history is not interpolated across')
  assert.equal(friend.waiting, true)
  assert(Math.hypot(friend.x - homeX, friend.z - homeZ) <= .41, 'no snap or shortcut to a later route point')
})

test('Everly friends hop, frolic inside a small home radius, land, and reset cleanly', () => {
  const home = { x: 22, y: 0, z: -103, phase: 1.7 }
  const friend = createEverlyFriendState(home)
  updateEverlyFriend(friend, { x: home.x - 3, y: 1, z: home.z }, 10)
  assert(friend.localTime <= .05, 'large frame delta advances by at most one safe step')
  assert(Math.hypot(friend.x - home.x, friend.z - home.z) < 2.36, 'large frame delta stays within home radius')
  assert.equal(friend.hopping, true)
  assert.equal(friend.motion, 'run')
  for (let time = 0; time < 3.95; time += .05) updateEverlyFriend(friend, { x: home.x - 3, y: 1, z: home.z }, .05)
  assert(Math.hypot(friend.x - home.x, friend.z - home.z) <= 2.6, `frolic remains in a small safe area (${Math.hypot(friend.x - home.x, friend.z - home.z)})`)
  assert.equal(friend.hopping, false, 'hop returns to ground between playful jumps')
  const separationFriend = createEverlyFriendState(home)
  for (let time = 0; time < 2; time += .05) updateEverlyFriend(separationFriend, { x: home.x, y: 1.95, z: home.z }, .05)
  assert(Math.hypot(separationFriend.x - home.x, separationFriend.z - home.z) >= 1.8, 'a friend avoids standing directly on the player')
  assert(Math.hypot(separationFriend.x - home.x, separationFriend.z - home.z) <= 2.6, 'separation remains within the home play area')
  updateEverlyFriend(friend, null, .05)
  for (let time = 0; time < 2.85; time += .05) updateEverlyFriend(friend, null, .05)
  assert(Math.hypot(friend.x - home.x, friend.z - home.z) < .01, 'friend settles back at its home')
  friend.heading = 2; friend.cooldownUntil = 50; friend.greetingCount = 4; friend.engaged = true
  resetEverlyFriendState(friend)
  assert.equal(friend.greetingCount, 0)
  assert.equal(friend.engaged, false)
  assert.equal(friend.hopping, false)
  assert.equal(friend.cooldownUntil, 0)
  assert.equal(friend.heading, home.yaw ?? 0)
  updateEverlyFriend(friend, { x: NaN, y: 0, z: 0 }, .05)
  assert(Number.isFinite(friend.x) && Number.isFinite(friend.heading), 'invalid samples are ignored')
  updateEverlyFriend(friend, null, -1)
  assert.equal(friend.localTime, .05, 'negative time steps cannot rewind state')
})

test('Everly NPC reset listener is cleaned up, and QA readouts are opt-in', () => {
  assert(scene.includes("window.addEventListener('everly:reset-goals', reset)"))
  assert(scene.includes("window.removeEventListener('everly:reset-goals', reset)"))
  assert.match(scene, /qaFriendInspection = false/)
  assert(scene.includes('if (qaInspection)'))
  assert.match(scene, /qaFriendInspection/)
})
