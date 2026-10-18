import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
globalThis.window = new EventTarget()
const result = await build({ stdin: { contents: `export * from './src/game/adventure-fire';export * from './src/game/adventure-destructibles';export * from './src/game/water-sharks';export * from './src/game/terrain/level-document'`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false })
const { adventureSolidDistance, canStartAdventureMouseFire, createAdventureFireInput, bindAdventureMouseFire, registerAdventureDestructible,
  destroyAdventureObject, getDestroyedAdventureObjectIds, applyDestroyedAdventureObjectIds,
  createSharks, stepSharks, sharkCanChase, createSharkBiteGate, createTerrainLevel } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const reset = () => window.dispatchEvent(new Event('jackalopesRoundReset'))

test('Mac body-pointer-lock clicks and normal canvas clicks fire; UI, touch and other pages stay quiet', () => {
  assert(canStartAdventureMouseFire(0, 'mouse', true, false, false))
  assert(canStartAdventureMouseFire(0, 'mouse', false, true, false))
  for (const args of [[0,'mouse',false,false,false], [0,'mouse',false,true,true], [0,'mouse',true,false,true],
    [2,'mouse',true,true,false], [0,'touch',true,false,false]]) assert.equal(canStartAdventureMouseFire(...args), false)
})
test('a short trackpad click fires once even when down and up happen between rendered frames', () => {
  const input = createAdventureFireInput(); input.press(); input.release()
  assert(input.consume(1000, true, false))
  assert.equal(input.consume(1200, true, false), false)
})
test('the actual mouse listener accepts body-retargeted input under game pointer lock and cleans up', () => {
  const doc = new EventTarget(), canvas = {}, body = { contains: element => element === canvas, closest: () => null }
  globalThis.document = doc; doc.pointerLockElement = body
  const input = createAdventureFireInput(), unbind = bindAdventureMouseFire(canvas, input)
  const down = target => {
    const event = new Event('pointerdown')
    Object.defineProperties(event, { target: {value:target}, button:{value:0}, pointerType:{value:'mouse'} })
    window.dispatchEvent(event)
  }
  try {
    down(body); window.dispatchEvent(new Event('pointerup')); assert(input.consume(0,true,false))
    down(body); window.dispatchEvent(new Event('blur')); assert.equal(input.consume(200,true,false),false)
    doc.pointerLockElement = null; down(body); assert.equal(input.consume(400,true,false),false)
    doc.pointerLockElement = body
    down({closest:()=>({})}); assert.equal(input.consume(600,true,false),false)
    down(body); doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange'))
    assert.equal(input.consume(800,true,false),false)
    unbind(); doc.pointerLockElement = body; down(body); assert.equal(input.consume(1000,true,false),false)
  } finally { unbind(); delete globalThis.document }
})
test('mouse hold and controller RT use the same bounded fire cadence', () => {
  for (const controller of [false, true]) {
    const input = createAdventureFireInput(); if (!controller) input.press()
    const shots = []
    for (let now = 0; now <= 600; now += 10) if (input.consume(now, true, controller)) shots.push(now)
    assert.deepEqual(shots, [0,180,360,540])
    input.release(); assert.equal(input.consume(800, true, false), false)
  }
})
test('blur/cancel/unlock reset and jackalope/hidden/knocked-out gates cannot leave a shot queued', () => {
  const input = createAdventureFireInput()
  input.press(); input.reset(); assert.equal(input.consume(0, true, false), false)
  input.press(); assert.equal(input.consume(100, false, true), false)
  assert.equal(input.consume(300, true, false), false)
  input.press(); assert(input.consume(500, true, false))
})
test('the installed Rapier ray API supplies a finite wall distance and blocks a shark behind it', async () => {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,0,-4))
  world.createCollider(RAPIER.ColliderDesc.cuboid(2,2,1), body); world.step()
  const hit = world.castRay(new RAPIER.Ray({x:0,y:0,z:0},{x:0,y:0,z:-1}), 24, true)
  const distance = adventureSolidDistance(hit, 24)
  assert(Math.abs(distance - 3) < 1e-5)
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0,0,-1))
  const point = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(0,0,-8), 1.65), new THREE.Vector3())
  assert(point.length() > distance)
  assert.equal(adventureSolidDistance(null, 24), 24)
  assert.equal(adventureSolidDistance({ toi: NaN }, 24), 24)
  world.free()
})
test('one valid astronaut hit destroys each registered shark once and is included in world replay', () => {
  reset()
  for (let i = 0; i < 6; i++) {
    let calls = 0, alive = true
    const id = `water-shark-${i}`
    const unregister = registerAdventureDestructible(id, { radius: 1.65, position: () => alive ? new THREE.Vector3() : null,
      destroy: () => { calls++; alive = false } })
    assert(destroyAdventureObject(id)); assert.equal(destroyAdventureObject(id), false)
    assert.equal(calls, 1); assert(getDestroyedAdventureObjectIds().includes(id)); unregister()
  }
})
test('a late join or remount receives the shark death before model registration, with invalid IDs rejected', () => {
  reset(); applyDestroyedAdventureObjectIds(['water-shark-2', 'water-shark-6', 'water-shark--1', 'anything'])
  let calls = 0
  const unregister = registerAdventureDestructible('water-shark-2', { radius: 1.65, position: () => new THREE.Vector3(), destroy: () => calls++ })
  assert.equal(calls, 1)
  applyDestroyedAdventureObjectIds(['water-shark-2']); assert.equal(calls, 1)
  assert.deepEqual(getDestroyedAdventureObjectIds(), ['water-shark-2'])
  unregister(); reset(); assert.deepEqual(getDestroyedAdventureObjectIds(), [])
})
test('dead sharks cannot move, chase, or bite a swimmer even at mouth contact', () => {
  const level = createTerrainLevel(), sharks = createSharks(level), s = sharks[0]
  s.dead = true
  const swimmer = { x:s.x, y:s.y+.45, z:s.z, enabled:true, swimming:true, riding:false, immune:false }
  assert.equal(sharkCanChase(level, s, swimmer), false)
  const before = {x:s.x,y:s.y,z:s.z}
  for (let i=0;i<100;i++) stepSharks(level, sharks, new Map([['p',swimmer]]), .05, i*.05)
  assert.deepEqual({x:s.x,y:s.y,z:s.z}, before)
  const gate = createSharkBiteGate(); gate.reset(0)
  assert.equal(gate.tryBite(level, [s], swimmer, 2000, true), null)
})
