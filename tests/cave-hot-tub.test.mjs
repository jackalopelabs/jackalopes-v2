import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const RAPIER = require('../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat/rapier.cjs.js')
await RAPIER.init()
const compiled = await build({ stdin: { contents: `
  export * from './src/game/cave-hot-tub';
  export * from './src/game/adventure-caves';
  export * from './src/game/terrain/level-document';
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false })
const { createHotTubGeometries, CAVE_HOT_TUB_POSITION, HOT_TUB_WATER_HEIGHT, createCaveGeometries,
  caveFloorAt, caveCeilingAt, caveWaterSurfaceAt, createTerrainLevel, normalizeTerrainLevel } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const savedBytes = readFileSync(new URL('./fixtures/adventure-valley.json', import.meta.url), 'utf8')

for (const [name, makeLevel] of [['default terrain', createTerrainLevel],
  ['saved terrain', () => normalizeTerrainLevel(JSON.parse(savedBytes))]]) {
  test(`hot tub fits the dry bedroom and Rapier walks in and out on ${name}`, () => {
    const level = makeLevel(), snapshot = JSON.stringify(level)
    const tub = createHotTubGeometries(), cave = createCaveGeometries(level)
    const { x, z } = CAVE_HOT_TUB_POSITION, floor = caveFloorAt(level, x, z)
    for (const geometry of Object.values(tub)) {
      if (!geometry?.isBufferGeometry) continue
      const points = geometry.getAttribute('position')
      for (let i = 0; i < points.count; i++) {
        const px = x + points.getX(i), pz = z + points.getZ(i)
        assert.equal(caveFloorAt(level, px, pz), floor, 'entire fixture sits on the flat dry grotto')
        assert(caveCeilingAt(level, px, pz) > floor + points.getY(i) + 2)
      }
    }
    assert.equal(caveWaterSurfaceAt(level, x, floor + HOT_TUB_WATER_HEIGHT, z), null,
      'shallow hot tub does not accidentally activate lake swimming')
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.timestep = 1 / 60
    function addMesh(geometry, position = { x: 0, y: 0, z: 0 }) {
      const vertices = new Float32Array(geometry.attributes.position.array)
      const indices = geometry.index ? new Uint32Array(geometry.index.array) :
        Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i)
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setTranslation(position.x, position.y, position.z))
    }
    for (const key of ['floor', 'walls', 'ceiling']) addMesh(cave[key])
    for (const key of ['shell', 'bottom']) addMesh(tub[key], { x, y: floor, z })
    for (const points of tub.treadPoints) world.createCollider(
      RAPIER.ColliderDesc.convexHull(points).setTranslation(x, floor, z))
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, floor + 1.96, -181))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.85, .35).setTranslation(0, -.65, 0).setSensor(true), body)
    const controller = world.createCharacterController(.1)
    controller.enableAutostep(.5, .05, true)
    controller.enableSnapToGround(.5)
    controller.setSlideEnabled(true)
    world.step()
    function walk(targetX, targetZ) {
      for (let frame = 0; frame < 900; frame++) {
        const p = body.translation(), dx = targetX - p.x, dz = targetZ - p.z, distance = Math.hypot(dx, dz)
        if (distance < .12) return
        const step = Math.min(distance, 3 / 60)
        controller.computeColliderMovement(collider, { x: dx / distance * step, y: -.035, z: dz / distance * step })
        const movement = controller.computedMovement()
        body.setNextKinematicTranslation({ x: p.x + movement.x, y: p.y + movement.y, z: p.z + movement.z })
        world.step()
        assert(body.translation().y > floor + 1.5, 'solid basin and cave floor support the player')
      }
      assert.fail(`Blocked on the hot tub steps: ${JSON.stringify(body.translation())}`)
    }
    walk(x, z)
    assert(Math.abs(body.translation().y - (floor + .22 + 1.95)) < .12, 'standing inside the shallow basin')
    walk(1.65, z - .25)
    assert(Math.abs(body.translation().y - (floor + .62 + 1.95)) < .12, 'submerged stone seat supports the player')
    walk(x, z)
    walk(x, -181)
    assert(Math.abs(body.translation().y - (floor + 1.95)) < .3, 'walked back onto the bedroom floor')
    // The route back to the lake remains usable around the new fixture.
    walk(5, -181)
    walk(0, -178)
    assert.equal(JSON.stringify(level), snapshot, 'adding a tub never changes the saved terrain')
    world.free()
    for (const geometry of [...Object.values(tub), ...Object.values(cave)]) if (geometry?.isBufferGeometry) geometry.dispose()
  })
}
