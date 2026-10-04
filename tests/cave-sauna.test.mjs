import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const RAPIER = require('../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat/rapier.cjs.js')
await RAPIER.init()
const compiled = await build({ stdin: { contents: `
  export * from './src/game/cave-sauna';
  export * from './src/game/cave-hot-tub';
  export * from './src/game/adventure-caves';
  export * from './src/game/terrain/level-document';
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false })
const { CAVE_SAUNA_POSITION, SAUNA_SOLIDS, SAUNA_DOOR_HINGE, SAUNA_DOOR_SIZE, createSaunaGeometries, createHotTubGeometries,
  CAVE_HOT_TUB_POSITION, createCaveGeometries, caveFloorAt, caveCeilingAt, createTerrainLevel, normalizeTerrainLevel } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const savedBytes = readFileSync(new URL('./fixtures/adventure-valley.json', import.meta.url), 'utf8')

for (const [name, makeLevel] of [['default terrain', createTerrainLevel],
  ['saved terrain', () => normalizeTerrainLevel(JSON.parse(savedBytes))]]) {
  test(`sauna fits the grotto and Rapier enters, exits, and passes the spa on ${name}`, () => {
    const level = makeLevel(), snapshot = JSON.stringify(level)
    const sauna = createSaunaGeometries(), cave = createCaveGeometries(level), tub = createHotTubGeometries()
    const { x, z } = CAVE_SAUNA_POSITION, floor = caveFloorAt(level, x, z)
    for (const geometry of Object.values(sauna)) {
      const points = geometry.getAttribute('position')
      for (let i = 0; i < points.count; i++) {
        const px = x + points.getX(i), pz = z + points.getZ(i)
        assert.equal(caveFloorAt(level, px, pz), floor, 'sauna remains inside the dry cave footprint')
        assert(caveCeilingAt(level, px, pz) > floor + points.getY(i))
      }
    }
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.timestep = 1 / 60
    function addMesh(geometry, position = { x: 0, y: 0, z: 0 }) {
      const vertices = new Float32Array(geometry.attributes.position.array)
      const indices = geometry.index ? new Uint32Array(geometry.index.array) :
        Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i)
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setTranslation(position.x, position.y, position.z))
    }
    for (const key of ['floor', 'walls', 'ceiling']) addMesh(cave[key])
    for (const { at, size, turn = 0 } of SAUNA_SOLIDS) world.createCollider(
      RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setTranslation(x + at[0], floor + at[1], z + at[2])
        .setRotation({ x: 0, y: Math.sin(turn / 2), z: 0, w: Math.cos(turn / 2) }))
    const door = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x + SAUNA_DOOR_HINGE.x, floor, z + SAUNA_DOOR_HINGE.z)
      .setRotation({ x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }))
    world.createCollider(RAPIER.ColliderDesc.cuboid(...SAUNA_DOOR_SIZE.map(n => n / 2))
      .setTranslation(.94, 1.43, 0), door)
    const tubPosition = { x: CAVE_HOT_TUB_POSITION.x, y: floor, z: CAVE_HOT_TUB_POSITION.z }
    for (const key of ['shell', 'bottom']) addMesh(tub[key], tubPosition)
    for (const points of tub.treadPoints) world.createCollider(RAPIER.ColliderDesc.convexHull(points)
      .setTranslation(tubPosition.x, floor, tubPosition.z))
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, floor + 1.96, -181))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.85, .35).setTranslation(0, -.65, 0).setSensor(true), body)
    const controller = world.createCharacterController(.1)
    controller.enableAutostep(.5, .05, true)
    controller.enableSnapToGround(.5)
    controller.setSlideEnabled(true)
    world.step()
    function move(targetX, targetZ, frames = 900) {
      for (let frame = 0; frame < frames; frame++) {
        const p = body.translation(), dx = targetX - p.x, dz = targetZ - p.z, distance = Math.hypot(dx, dz)
        if (distance < .12) return true
        const step = Math.min(distance, 3 / 60)
        controller.computeColliderMovement(collider, { x: dx / distance * step, y: -.035, z: dz / distance * step },
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
        const movement = controller.computedMovement()
        body.setNextKinematicTranslation({ x: p.x + movement.x, y: p.y + movement.y, z: p.z + movement.z })
        world.step()
        assert(body.translation().y > floor + 1.5, 'sauna and cave floors support the character')
      }
      return false
    }
    function walk(px, pz) { assert(move(px, pz), `Blocked at ${JSON.stringify(body.translation())}`) }
    walk(x, z)
    assert(Math.abs(body.translation().y - (floor + .09 + 1.95)) < .12, 'standing on the sauna floor')
    walk(x, z + 1.7)
    assert.equal(move(x + 4, z + 1.7, 150), false, 'solid side wall blocks passage')
    assert(body.translation().x < x + 2, 'stays inside the cabin wall')
    walk(x, z + 1.7)
    door.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 }); world.step()
    assert.equal(move(x, -181, 150), false, 'closed sauna door blocks the character')
    assert(body.translation().z < z + 2, 'closed door keeps the player inside')
    door.setNextKinematicRotation({ x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }); world.step()
    walk(x, -181)
    walk(5, -181)
    walk(5, -187)
    walk(5, -181)
    walk(0, -178)
    walk(13, -181)
    assert.equal(JSON.stringify(level), snapshot, 'saved map is unchanged')
    world.free()
    for (const geometry of [...Object.values(sauna), ...Object.values(tub), ...Object.values(cave)])
      if (geometry?.isBufferGeometry) geometry.dispose()
  })
}
