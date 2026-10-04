import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const RAPIER = require('../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat/rapier.cjs.js')
await RAPIER.init()
const compiled = await build({ stdin: { contents: "export * from './src/game/character-physics';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false })
const { CHARACTER_CAPSULE: shape } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

for (const localType of ['jackalope', 'merc']) for (const type of ['jackalope', 'merc'])
test(`${localType} approaches a remote ${type} closely while scenery and hit detection stay solid`, () => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, .1, 20).setTranslation(0, -.1, 0))
  const localHeight = localType === 'merc' ? 1.3 : 1.95
  const remote = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, type === 'merc' ? -.3 : 1.95, 0))
  world.createCollider(RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius)
    .setTranslation(0, type === 'merc' ? 1.6 : -.65, 0), remote)
  // The existing generous combat volumes still participate in projectile queries.
  world.createCollider(RAPIER.ColliderDesc.ball(2.4).setTranslation(0, type === 'merc' ? 2.6 : 1.6, 0).setSensor(true), remote)
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-5, localHeight, 0))
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius)
    .setTranslation(0, localType === 'merc' ? 0 : -.65, 0).setSensor(true), body)
  const controller = world.createCharacterController(.1)
  controller.enableAutostep(.5, .05, true); controller.enableSnapToGround(.5)
  world.step()
  function approach(frames = 240) {
    let closest = Infinity
    for (let i = 0; i < frames; i++) {
      controller.computeColliderMovement(collider, { x: .05, y: -.02, z: 0 }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      const p = body.translation(), m = controller.computedMovement()
      body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }); world.step()
      const position = body.translation()
      closest = Math.min(closest, Math.hypot(position.x, position.z))
      assert(Math.abs(position.y - localHeight) < .15, 'characters remain grounded')
    }
    return closest
  }
  // Capsules may slide around each other, so check the closest horizontal distance,
  // rather than one axis of the final position.
  const separation = approach()
  assert(separation < 1 && separation > .7, `close contact without overlapping bodies: ${separation}`)
  const hit = world.castRay(new RAPIER.Ray({ x: 5, y: 1.95, z: 0 }, { x: -1, y: 0, z: 0 }), 10, true,
    undefined, undefined, undefined, body, candidate => candidate.isSensor())
  assert(hit && hit.timeOfImpact < 4, 'projectile can still hit the larger combat sensor')
  world.createCollider(RAPIER.ColliderDesc.cuboid(.1, 2, 1).setTranslation(1.5, 2, 3))
  body.setTranslation({ x: -5, y: localHeight, z: 3 }, true); world.step()
  approach()
  assert(body.translation().x < 1.05, 'solid scenery still blocks movement')
  world.free()
})
