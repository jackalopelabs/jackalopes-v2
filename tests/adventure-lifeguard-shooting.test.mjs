import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import * as THREE from 'three'
globalThis.window = new EventTarget()
const result = await build({ stdin: { contents: `export * from './src/game/adventure-destructibles';export * from './src/game/cave-lifeguard';export * from './src/game/terrain/level-document'`, resolveDir: process.cwd() }, bundle:true, platform:'node', format:'esm', write:false })
const { LIFEGUARD, createLifeguardRules, createTerrainLevel, registerAdventureDestructible, destroyAdventureObject,
  getDestroyedAdventureObjectIds, applyDestroyedAdventureObjectIds } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const reset = () => window.dispatchEvent(new Event('jackalopesRoundReset'))
const point = () => {
  const p = createLifeguardRules(createTerrainLevel()).position
  return new THREE.Vector3(p.x, p.y + LIFEGUARD.hitHeight, p.z)
}

test('a single lifeguard hit is retained for both players and duplicate packets cannot repeat it', () => {
  reset(); let calls=0
  const remove=registerAdventureDestructible(LIFEGUARD.objectId,{radius:LIFEGUARD.hitRadius,position:point,destroy:()=>calls++})
  assert(destroyAdventureObject(LIFEGUARD.objectId)); assert.equal(calls,1)
  assert.equal(destroyAdventureObject(LIFEGUARD.objectId),false)
  applyDestroyedAdventureObjectIds([LIFEGUARD.objectId]); assert.equal(calls,1)
  assert(getDestroyedAdventureObjectIds().includes(LIFEGUARD.objectId)); remove()
})
test('late joins and remounts retain the eliminated guard, and the normal round reset clears it', () => {
  reset(); applyDestroyedAdventureObjectIds([LIFEGUARD.objectId,'cave-lifeguard-1','lifeguard','cave-main-pool-lifeguard'])
  let calls=0
  const target={radius:LIFEGUARD.hitRadius,position:point,destroy:()=>calls++}
  let remove=registerAdventureDestructible(LIFEGUARD.objectId,target)
  assert.equal(calls,1); remove()
  remove=registerAdventureDestructible(LIFEGUARD.objectId,target)
  assert.equal(calls,2); remove()
  assert.deepEqual(getDestroyedAdventureObjectIds(),[LIFEGUARD.objectId])
  reset(); remove=registerAdventureDestructible(LIFEGUARD.objectId,target)
  assert.equal(calls,2); assert.deepEqual(getDestroyedAdventureObjectIds(),[]); remove()
})
test('the hit target covers the jackalope body and head while a shot at the low chair misses', () => {
  const centre=point(), sphere=new THREE.Sphere(centre,LIFEGUARD.hitRadius)
  const shootAtHeight=y=>new THREE.Ray(new THREE.Vector3(centre.x,y,centre.z+8),new THREE.Vector3(0,0,-1)).intersectSphere(sphere,new THREE.Vector3())
  assert(shootAtHeight(centre.y)); assert(shootAtHeight(centre.y+.65))
  assert.equal(shootAtHeight(centre.y-LIFEGUARD.hitHeight+.65),null)
})
