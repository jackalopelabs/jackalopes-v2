import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
const require = createRequire(import.meta.url)
const RAPIER = require('../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat/rapier.cjs.js')
await RAPIER.init()
const compiled = await build({stdin:{contents:`export * from './src/game/adventure-caves';export * from './src/game/terrain/level-document';`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false})
const { createCaveGeometries, cutCaveMouth, caveLayout, caveFloorAt, caveCeilingAt, caveWaterSurfaceAt, containsCave, normalizeTerrainLevel, createTerrainLevel, TERRAIN_SIZE, TERRAIN_SEGMENTS, terrainHeightAtVertex, terrainVertexIndex } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const savedPath = new URL('./fixtures/adventure-valley.json', import.meta.url)
const savedBytes = readFileSync(savedPath, 'utf8')
const savedLevel = () => normalizeTerrainLevel(JSON.parse(savedBytes))
function terrainGeometry(level) {
 const g=new THREE.PlaneGeometry(TERRAIN_SIZE,TERRAIN_SIZE,TERRAIN_SEGMENTS,TERRAIN_SEGMENTS)
 for(let i=0;i<g.attributes.position.count;i++)g.attributes.position.setZ(i,terrainHeightAtVertex(level,i%(TERRAIN_SEGMENTS+1),Math.floor(i/(TERRAIN_SEGMENTS+1))))
 return g
}
function mesh(g) {const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.updateMatrixWorld(true);return m}
function at(meshes,x,z){return new THREE.Raycaster(new THREE.Vector3(x,150,z),new THREE.Vector3(0,-1,0)).intersectObjects(meshes,false)[0]?.point.y}
function dispose(cave){for(const v of Object.values(cave))if(v?.isBufferGeometry)v.dispose()}

test('Adventure cuts only the central cells and replaces the surface with a real walkable opening',()=>{
 const level=createTerrainLevel();const saved=JSON.stringify(level);const cave=createCaveGeometries(level);const old=terrainGeometry(level);const before=old.index.count;cutCaveMouth(old);assert.equal(before-old.index.count,24)
 old.rotateX(-Math.PI/2);old.translate(0,-.02,0);const surfaces=[mesh(old),mesh(cave.surface)]
 assert.equal(at(surfaces,0,0),undefined);assert(Math.abs(at(surfaces,7,0)+.02)<1e-5)
 const ramp=at([mesh(cave.ramp)],0,0);assert(ramp< -2 && ramp> -5)
 assert.equal(JSON.stringify(level),saved);old.dispose();dispose(cave);surfaces.forEach(m=>m.material.dispose())
})

test('surface replacement preserves sculpted heights on the original triangle slopes',()=>{
 const level=createTerrainLevel();for(let r=34;r<=36;r++)for(let c=34;c<=36;c++)level.heightOffsets[terrainVertexIndex(c,r)]=(r*7+c*13)%9-4
 const old=terrainGeometry(level);old.rotateX(-Math.PI/2);old.translate(0,-.02,0);const cave=createCaveGeometries(level);const a=mesh(old),b=mesh(cave.surface)
 for(const[x,z]of[[7,3],[-7,-3],[2,9],[-2,-9],[10,7],[-10,7],[7,-10],[-7,-10]])assert(Math.abs(at([a],x,z)-at([b],x,z))<1e-5)
 a.material.dispose();b.material.dispose();old.dispose();dispose(cave)
})

for(const [name,makeLevel] of [['default terrain',createTerrainLevel],['actual saved terrain',savedLevel]])test(`Rapier walks original branches, lower lake bed, far dry grotto, and climbs back out on ${name}`,()=>{
 const level=makeLevel();const snapshot=JSON.stringify(level);const cave=createCaveGeometries(level);const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60
 for(const key of ['surface','floor','ramp','walls','ceiling']){
  const g=cave[key];const vertices=new Float32Array(g.attributes.position.array);const indices=g.index?new Uint32Array(g.index.array):Uint32Array.from({length:vertices.length/3},(_,i)=>i)
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices))
 }
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,cave.entranceY+1.96,8))
 const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.85,.35).setTranslation(0,-.65,0).setSensor(true),body)
 const controller=world.createCharacterController(.1);controller.enableAutostep(.5,.05,true);controller.enableSnapToGround(.5);controller.setSlideEnabled(true)
 world.step()
 function walk(x,z){
  let reached=false
  for(let frame=0;frame<1600;frame++){
   const p=body.translation(),dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz)
   if(d<.2){reached=true;break}
   const step=Math.min(d,4/60)
   controller.computeColliderMovement(collider,{x:dx/d*step,y:-.02,z:dz/d*step})
   const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step()
  }
  const p=body.translation();assert(reached,`blocked walking to ${x},${z}: ${JSON.stringify(p)}`)
  const expectedFloor=caveFloorAt(level,p.x,p.z)??cave.entranceY
  assert(p.y>expectedFloor+1.5,'never falls through floor')
  assert(Math.abs(p.y-(expectedFloor+1.95))<.3,`feet track sloping collider at ${x},${z}`)
 }
 const route=[[0,-26],[0,-40],[-20,-39],[-37,-37],[-20,-39],[0,-40],[-2,-64],[0,-40],[20,-40],[37,-39],[20,-40],[0,-40],[0,-64],[0,-75],[0,-90],[0,-110],[0,-125],[0,-140],[0,-155],[0,-170],[0,-181],[0,-170],[0,-155],[0,-140],[0,-125],[0,-110],[0,-90],[0,-75],[0,-64],[0,-40],[0,-26],[0,8]]
 for(const[x,z]of route)walk(x,z)
 assert(Math.abs(body.translation().y-(cave.entranceY+1.95))<.3,'returned to surface elevation')
 assert.equal(JSON.stringify(level),snapshot)
 assert.equal(readFileSync(savedPath,'utf8'),savedBytes,'saved map never rewritten')
 world.free();dispose(cave)
})

test('lower floor and ceiling triangles follow exact depth bands, with a dry far shore',()=>{
 const level=savedLevel(),cave=createCaveGeometries(level)
 const floor=mesh(cave.floor),roof=mesh(cave.ceiling),water=mesh(cave.water)
 assert.equal(cave.floorY,-16.02,'expansion preserves the saved map entrance slope')
 for(const[x,z]of[[0,-64],[4,-75],[-4,-76],[3,-90],[-6,-109.8],[0,-110],[35,-120],[-30,-139.9],[0,-140],[5,-155],[-3,-169.9],[0,-170],[0,-181]]){
  assert(Math.abs(at([floor],x,z)-caveFloorAt(level,x,z))<1e-4,`floor matches ${x},${z}`)
  assert(Math.abs(at([roof],x,z)-caveCeilingAt(level,x,z))<1e-4,`roof matches ${x},${z}`)
 }
 assert(Math.abs(at([floor],0,-125)-(cave.floorY-18))<1e-4)
 assert(Math.abs(at([floor],0,-181)-(cave.floorY-6))<1e-4)
 assert.equal(at([water],0,-80),undefined)
 assert.equal(at([water],0,-181),undefined)
 assert.equal(at([water],50,-90),undefined,'water cannot spill outside cave walls')
 for(const[x,z]of[[0,-93],[-30,-120],[30,-130],[0,-160]])assert(Math.abs(at([water],x,z)-cave.waterLevel)<1e-4)
 for(const geo of [cave.floor,cave.ceiling,cave.walls,cave.water]){
  const p=geo.attributes.position
  for(let i=0;i<p.count;i+=3){
   const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2)
   assert(b.sub(a).cross(c.sub(a)).length()>1e-7,'no degenerate collider or water triangles')
  }
 }
 for(const m of [floor,roof,water])m.material.dispose()
 dispose(cave)
})

test('cave swimming is depth-, footprint-, bottom-, ceiling-, and immersion-bounded',()=>{
 const level=savedLevel(),{waterLevel,floorY}=caveLayout(level)
 assert.equal(caveWaterSurfaceAt(level,0,waterLevel-.35,-125),waterLevel)
 assert.equal(caveWaterSurfaceAt(level,0,floorY-17,-125),waterLevel,'deep diving remains in water')
 assert.equal(caveWaterSurfaceAt(level,0,waterLevel+.1,-125),null)
 assert.equal(caveWaterSurfaceAt(level,0,waterLevel+.1,-125,true),waterLevel,'small hysteresis band prevents chatter')
 assert.equal(caveWaterSurfaceAt(level,0,waterLevel+.3,-125,true),null)
 assert.equal(caveWaterSurfaceAt(level,0,2,-125,true),null,'no phantom water for player on terrain above')
 assert.equal(caveWaterSurfaceAt(level,0,floorY-19,-125),null,'no water below solid bottom')
 assert.equal(caveWaterSurfaceAt(level,51,waterLevel-1,-90),null,'outside cave footprint')
 assert.equal(caveWaterSurfaceAt(level,0,waterLevel-1,-93),null,'shallow approach stays walkable')
 assert.equal(caveWaterSurfaceAt(level,0,waterLevel-1,-181),null,'far grotto stays dry')
 assert.equal(caveWaterSurfaceAt(level,NaN,waterLevel,-125),null)
 assert.equal(caveWaterSurfaceAt(level,0,NaN,-125),null)
 assert(containsCave(level,0,floorY-16,-125),'camera predicate reaches lower level')
 assert(!containsCave(level,0,0,-125),'camera predicate excludes upstairs terrain')
})

test('Rapier swimmer crosses the lake, dives below its noncolliding surface, and climbs onto both shores',()=>{
 const level=savedLevel(),cave=createCaveGeometries(level),world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60
 for(const key of ['surface','floor','ramp','walls','ceiling']){
  const g=cave[key],vertices=new Float32Array(g.attributes.position.array)
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,Uint32Array.from({length:vertices.length/3},(_,i)=>i)))
 }
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,caveFloorAt(level,0,-90)+1.96,-90))
 const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.85,.35).setTranslation(0,-.65,0).setSensor(true),body)
 const controller=world.createCharacterController(.1);controller.enableAutostep(.5,.05,true);controller.enableSnapToGround(.5)
 let swimming=false,swimFrames=0
 world.step()
 function step(targetZ,vertical=0){
  const p=body.translation(),surface=caveWaterSurfaceAt(level,p.x,p.y,p.z,swimming)
  swimming=surface!==null;if(swimming)swimFrames++
  let dy=-.02
  if(surface!==null){
   const floatY=surface-.35
   dy=vertical?vertical*3/60:THREE.MathUtils.clamp((floatY-p.y)*2,-1.2,.8)/60
   dy=Math.min(dy,Math.max(0,floatY-p.y))
  }
  controller.computeColliderMovement(collider,{x:0,y:dy,z:THREE.MathUtils.clamp(targetZ-p.z,-4/60,4/60)})
  const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step()
 }
 function traverse(z){
  for(let i=0;i<1800&&Math.abs(body.translation().z-z)>.15;i++)step(z)
  assert(Math.abs(body.translation().z-z)<.15,`shore or lake blocked at ${JSON.stringify(body.translation())}`)
 }
 traverse(-125)
 assert(swimming)
 for(let i=0;i<140;i++)step(-125,-1)
 assert(body.translation().y<cave.waterLevel-5,'dive passes freely below water mesh')
 assert(body.translation().y>cave.floorY-18+1.5,'solid lake bed stops dive')
 for(let i=0;i<180;i++)step(-125,1)
 assert(Math.abs(body.translation().y-(cave.waterLevel-.35))<.1,'ascent stops at floating height')
 traverse(-181)
 assert(!swimming,'exits water on far dry shore')
 assert(Math.abs(body.translation().y-(caveFloorAt(level,0,-181)+1.95))<.3)
 traverse(-90)
 assert(!swimming,'climbs back onto the approach without a teleport')
 assert(swimFrames>500)
 world.free();dispose(cave)
})

test('expanded ceiling remains below saved or deeply sculpted terrain without changing the document',()=>{
 for(const makeLevel of [savedLevel,()=>{
  const level=createTerrainLevel()
  for(let row=19;row<=24;row++)for(let col=32;col<=38;col++)level.heightOffsets[terrainVertexIndex(col,row)]=-25
  return level
 }]){
  const level=makeLevel(),before=JSON.stringify(level),cave=createCaveGeometries(level)
  const g=terrainGeometry(level);g.rotateX(-Math.PI/2);g.translate(0,-.02,0);const ground=mesh(g)
  for(const[x,z]of[[0,-40],[0,-90],[-25,-120],[25,-130],[0,-155],[0,-181]]){
   assert(caveCeilingAt(level,x,z)<at([ground],x,z)-1.9,'at least 2m earth over each chamber')
  }
  assert.equal(JSON.stringify(level),before)
  ground.material.dispose();g.dispose();dispose(cave)
 }
 assert.equal(readFileSync(savedPath,'utf8'),savedBytes)
})
