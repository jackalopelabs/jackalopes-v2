import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
const require = createRequire(import.meta.url)
const RAPIER = require('../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat/rapier.cjs.js')
await RAPIER.init()
const compiled = await build({ stdin: { contents: `
  export * from './src/game/cave-rabbit-hole'; export * from './src/game/rabbit-hole-opening';
  export * from './src/game/adventure-caves'; export * from './src/game/cave-hot-tub';
  export * from './src/game/terrain/level-document'; export * from './src/game/terrain-formations';
  export * from './src/game/mountain-geometry';
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false })
const { createRabbitHoleGeometries, RABBIT_HOLE_POSITION, RABBIT_HOLE_RADIUS, RABBIT_STEP_MAX_RISE,
  cutRabbitHole, isInRabbitHoleShaft, createCaveGeometries, cutCaveMouth, createHotTubGeometries, CAVE_HOT_TUB_POSITION,
  createTerrainLevel, normalizeTerrainLevel, TERRAIN_SIZE, TERRAIN_SEGMENTS, terrainHeightAtVertex, terrainFormations, NORTH_MOUNTAIN_RANGE, mountainRangeLayout, createMountainGeometry } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const savedBytes = readFileSync(new URL('./fixtures/adventure-valley.json', import.meta.url), 'utf8')
const savedLevel = () => normalizeTerrainLevel(JSON.parse(savedBytes))
function terrainGeometry(level) {
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  for (let i = 0; i < geometry.attributes.position.count; i++) geometry.attributes.position.setZ(i,
    terrainHeightAtVertex(level, i % (TERRAIN_SEGMENTS + 1), Math.floor(i / (TERRAIN_SEGMENTS + 1))))
  return geometry
}
const dispose = (...sets) => sets.forEach(set => Object.values(set).forEach(value => value?.isBufferGeometry && value.dispose()))

test('small roof and surface openings preserve surrounding sculpted terrain triangles and UVs', () => {
  const level = savedLevel()
  for (let row = 17; row <= 19; row++) for (let column = 34; column <= 36; column++)
    level.heightOffsets[row * (TERRAIN_SEGMENTS + 1) + column] = (row * 3 + column * 7) % 8
  const snapshot = JSON.stringify(level), original = terrainGeometry(level), cut = original.clone()
  cutRabbitHole(cut)
  for (const geometry of [original, cut]) geometry.rotateX(-Math.PI / 2).translate(0, -.02, 0)
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const a = new THREE.Mesh(original, material), b = new THREE.Mesh(cut, material)
  a.updateMatrixWorld(); b.updateMatrixWorld()
  const at = (mesh, x, z) => new THREE.Raycaster(new THREE.Vector3(x, 150, z), new THREE.Vector3(0, -1, 0))
    .intersectObject(mesh)[0]
  const { x, z } = RABBIT_HOLE_POSITION
  assert.equal(at(b, x, z), undefined, 'surface is genuinely open')
  for (const [px, pz] of [[x + 2.5, z], [x - 2.5, z], [x, z - 2.5], [x, z + 2.5], [8, -198], [-12, -190], [20, 20]]) {
    const before = at(a, px, pz), after = at(b, px, pz)
    assert(Math.abs(before.point.y - after.point.y) < 1e-4, 'surrounding slopes are preserved')
    assert(before.uv.distanceTo(after.uv) < 1e-6, 'terrain UVs are preserved')
  }
  const cave = createCaveGeometries(level)
  assert.equal(at(new THREE.Mesh(cave.ceiling, material), x, z), undefined, 'cave roof is open too')
  const hole = createRabbitHoleGeometries(level)
  for (const point of hole.layout.rim) {
    assert(isInRabbitHoleShaft(level, { ...point, y: point.y - 1 }))
    assert(isInRabbitHoleShaft(level, { ...point, y: hole.layout.surface - 1 }), 'camera stays constrained until the full sloped rim clears')
  }
  assert(!isInRabbitHoleShaft(level, { x, z, y: hole.layout.surface + 3 }), 'camera leaves shaft constraints on the surface')
  assert.equal(JSON.stringify(level), snapshot, 'runtime opening leaves the editor document intact')
  original.dispose(); cut.dispose(); material.dispose(); dispose(cave, hole)
})

for (const [name, makeLevel, fps = 60] of [['default terrain', createTerrainLevel], ['saved terrain', savedLevel],
  ['saved terrain at 30 FPS', savedLevel, 30], ['saved terrain at the game’s 120 Hz physics', savedLevel, 120],
  ['raised terrain', () => { const level = savedLevel(); level.heightOffsets = level.heightOffsets.map(h => h + 10); return level }]]) {
  test(`Rapier bunny hops every stone from behind the hot tub onto ${name} and can return`, () => {
    const level = makeLevel(), snapshot = JSON.stringify(level), hole = createRabbitHoleGeometries(level)
    const cave = createCaveGeometries(level), tub = createHotTubGeometries()
    const terrain = terrainGeometry(level); cutCaveMouth(terrain); cutRabbitHole(terrain)
    terrain.rotateX(-Math.PI / 2).translate(0, -.02, 0)
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / fps
    function addMesh(geometry, position = { x: 0, y: 0, z: 0 }) {
      const vertices = new Float32Array(geometry.attributes.position.array)
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, geometry.index ? new Uint32Array(geometry.index.array) :
        Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i)).setTranslation(position.x, position.y, position.z))
    }
    for (const key of ['surface', 'floor', 'ramp', 'walls', 'ceiling']) addMesh(cave[key])
    addMesh(terrain); addMesh(hole.shaft); addMesh(hole.collar)
    // Include every solid rock formation from Platforms, especially the mesa whose
    // underside previously sealed the staircase even though both roof cuts were open.
    for (const feature of terrainFormations(true)) {
      const mesa = new THREE.ConeGeometry(feature.scale * 10, feature.height, 8)
      world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(mesa.attributes.position.array))
        .setTranslation(...feature.position))
      mesa.dispose()
    }
    // North-range mountains formerly used full boxes, another invisible ceiling
    // inside the chimney. Exercise the same cut geometry and collider selection.
    for (const mountain of mountainRangeLayout(NORTH_MOUNTAIN_RANGE)) {
      const { geometry, rabbitHoleCut } = createMountainGeometry(mountain, true)
      geometry.scale(mountain.scale, mountain.scale, mountain.scale)
        .translate(...mountain.position)
      if (rabbitHoleCut) addMesh(geometry)
      else {
        geometry.computeBoundingBox()
        const center = geometry.boundingBox.getCenter(new THREE.Vector3())
        const half = geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5)
        world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
          .setTranslation(center.x, center.y, center.z))
      }
      geometry.dispose()
    }
    const { floor, top, steps, exit } = hole.layout, { x, z } = RABBIT_HOLE_POSITION
    for (const points of hole.treadPoints) world.createCollider(RAPIER.ColliderDesc.convexHull(points))
    world.createCollider(RAPIER.ColliderDesc.cylinder((top - floor - .6) / 2, .48)
      .setTranslation(x, (top + floor - .6) / 2, z))
    const tubPosition = { ...CAVE_HOT_TUB_POSITION, y: floor }
    for (const key of ['shell', 'bottom']) addMesh(tub[key], tubPosition)
    for (const points of tub.treadPoints) world.createCollider(RAPIER.ColliderDesc.convexHull(points).setTranslation(tubPosition.x, floor, tubPosition.z))
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-4.5, floor + 1.96, -188))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.85, .35).setTranslation(0, -.65, 0).setSensor(true), body)
    const controller = world.createCharacterController(.1)
    controller.enableAutostep(.5, .05, true); controller.enableSnapToGround(.5); controller.setSlideEnabled(true)
    world.step()
    let vertical = 0
    function frame(target, jump = false) {
      const p = body.translation(), dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz)
      if (jump && controller.computedGrounded()) vertical = .5 * .8 * 14.2 // Actual default bunny jump.
      else if (!controller.computedGrounded()) vertical -= 9.8 / fps
      else if (vertical < 0) vertical = 0
      const speed = Math.min(distance, 3 / fps)
      controller.computeColliderMovement(collider, { x: distance ? dx / distance * speed : 0,
        y: vertical / fps, z: distance ? dz / distance * speed : 0 }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      const m = controller.computedMovement()
      body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }); world.step()
    }
    function reach(target, hop = false, heightTolerance = .15) {
      for (let i = 0; i < fps * 3; i++) {
        const p = body.translation()
        if (Math.hypot(p.x - target.x, p.z - target.z) < .12 &&
          Math.abs(p.y - target.y - 1.95) < heightTolerance && controller.computedGrounded()) return
        frame(target, hop && i === 0)
      }
      assert.fail(`Blocked reaching ${JSON.stringify(target)} from ${JSON.stringify(body.translation())}`)
    }
    // Walk behind the tub instead of spawning on or teleporting between the treads.
    reach({ x: -4.5, y: floor, z: -191.3 })
    reach(steps[0])
    for (let i = 1; i < steps.length; i++) {
      assert(steps[i].y - steps[i - 1].y <= RABBIT_STEP_MAX_RISE + 1e-8)
      reach(steps[i], true)
    }
    // On slopes the capsule touches uphill of its center, above the point-sampled ground.
    reach(exit, false, .6)
    assert(body.translation().y > exit.y + 1.7, 'bunny is standing on the surface')
    reach(steps.at(-1), true)
    for (const step of steps.slice(0, -1).reverse()) reach(step)
    reach({ x: -4.5, y: floor, z: -191.3 })
    reach({ x: -4.5, y: floor, z: -188 })
    assert.equal(JSON.stringify(level), snapshot)
    assert.equal(readFileSync(new URL('./fixtures/adventure-valley.json', import.meta.url), 'utf8'), savedBytes)
    world.free(); terrain.dispose(); dispose(hole, cave, tub)
  })
}
