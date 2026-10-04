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
  export * from './src/game/mountain-geometry'; export * from './src/game/cave-waterslide';
  export * from './src/game/waterslide-geometry'; export * from './src/game/terrain/water-physics';
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false })
const { createRabbitHoleGeometries, RABBIT_HOLE_POSITION, RABBIT_HOLE_RADIUS, createSpiralWaterslide, canBoardWaterslide, sampleWaterslideRide, waterslideRibbon, WATERSLIDE_PROFILE,
  cutRabbitHole, isInRabbitHoleShaft, createCaveGeometries, cutCaveMouth, createHotTubGeometries, CAVE_HOT_TUB_POSITION,
  createTerrainLevel, normalizeTerrainLevel, TERRAIN_SIZE, TERRAIN_SEGMENTS, terrainHeightAtVertex, terrainHeightAt, terrainFormations, NORTH_MOUNTAIN_RANGE, mountainRangeLayout, createMountainGeometry } =
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

for (const [name, makeLevel] of [['default terrain', createTerrainLevel], ['saved terrain', savedLevel],
  ['raised terrain', () => { const level = savedLevel(); level.heightOffsets = level.heightOffsets.map(h => h + 10); return level }]]) {
  test(`spiral slide is open, rideable, and hands control back on the dry bedroom floor on ${name}`, () => {
    const level = makeLevel(), snapshot = JSON.stringify(level), hole = createRabbitHoleGeometries(level)
    const slide = createSpiralWaterslide(level), cave = createCaveGeometries(level), tub = createHotTubGeometries()
    const terrain = terrainGeometry(level); cutCaveMouth(terrain); cutRabbitHole(terrain)
    terrain.rotateX(-Math.PI / 2).translate(0, -.02, 0)
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 120
    function addMesh(geometry, position = { x: 0, y: 0, z: 0 }) {
      const vertices = new Float32Array(geometry.attributes.position.array)
      return world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, geometry.index ? new Uint32Array(geometry.index.array) :
        Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i)).setTranslation(position.x, position.y, position.z))
    }
    for (const key of ['surface', 'floor', 'ramp', 'walls', 'ceiling']) addMesh(cave[key])
    addMesh(terrain); addMesh(hole.shaft); addMesh(hole.collar); addMesh(hole.landing)
    for (const feature of terrainFormations(true)) {
      const mesa = new THREE.ConeGeometry(feature.scale * 10, feature.height, 8)
      world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(mesa.attributes.position.array))
        .setTranslation(...feature.position))
      mesa.dispose()
    }
    for (const mountain of mountainRangeLayout(NORTH_MOUNTAIN_RANGE)) {
      const { geometry, rabbitHoleCut } = createMountainGeometry(mountain, true)
      geometry.scale(mountain.scale, mountain.scale, mountain.scale).translate(...mountain.position)
      if (rabbitHoleCut) addMesh(geometry)
      else {
        geometry.computeBoundingBox()
        const center = geometry.boundingBox.getCenter(new THREE.Vector3())
        const half = geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5)
        world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(center.x, center.y, center.z))
      }
      geometry.dispose()
    }
    const { floor, top } = hole.layout, { x, z } = RABBIT_HOLE_POSITION
    world.createCollider(RAPIER.ColliderDesc.cylinder((top - floor) / 2, .24).setTranslation(x, (top + floor) / 2, z))
    const tubPosition = { ...CAVE_HOT_TUB_POSITION, y: floor }
    for (const key of ['shell', 'bottom']) addMesh(tub[key], tubPosition)
    for (const points of tub.treadPoints) world.createCollider(RAPIER.ColliderDesc.convexHull(points).setTranslation(tubPosition.x, floor, tubPosition.z))
    const profile = WATERSLIDE_PROFILE.map(([x,y]) => [x * slide.halfWidth / 1.7,y])
    const channel = waterslideRibbon(slide, profile, false, slide.segments)
    const channelCollider = addMesh(channel)
    const start = sampleWaterslideRide(slide, 0).position
    const outward = new THREE.Vector3(Math.cos(hole.layout.entryAngle),0,Math.sin(hole.layout.entryAngle))
    const approach = slide.start.clone().addScaledVector(outward,8)
    approach.y=terrainHeightAt(level,approach.x,approach.z)+2.1
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(approach.x,approach.y,approach.z))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.85,.35).setTranslation(0,-.65,0).setSensor(true),body)
    const controller = world.createCharacterController(.1)
    controller.enableAutostep(.5,.05,true); controller.enableSnapToGround(.5); controller.setSlideEnabled(true)
    world.step()
    let approachVertical=0, reachedBoarding=false
    for(let i=0;i<120*8;i++) {
      const p=body.translation(), distance=Math.hypot(p.x-start.x,p.z-start.z)
      if(distance<1.4 && canBoardWaterslide(slide,p)){reachedBoarding=true;break}
      approachVertical=controller.computedGrounded()?0:approachVertical-9.8/120
      controller.computeColliderMovement(collider,{x:(start.x-p.x)/distance*3/120,y:approachVertical/120,z:(start.z-p.z)/distance*3/120},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step()
    }
    assert(reachedBoarding,`bunny walks from terrain onto the boarding ramp: ${JSON.stringify(body.translation())}`)
    assert(canBoardWaterslide(slide,start),'surface boarding is available')
    assert(!canBoardWaterslide(slide,{...start,y:floor+1.95}),'cave floor cannot board the surface slide')
    assert(slide.start.y > slide.end.y + 20,'slide descends the tall chimney')
    let previous = start, turns = 0, priorAngle = Math.atan2(start.z-z,start.x-x)
    for (let i=0;i<=1200;i++) {
      const progress=i/1200, sample=sampleWaterslideRide(slide,progress), p=sample.position
      assert(p.distanceTo(previous)<slide.length/1200*1.08+.001,'ride is continuous and follows arc length')
      assert(p.y<=previous.y+.02,'water flows downhill')
      // The guided rider may touch its own channel, but must never pass through
      // the world: roof, terrain, collar, core, tub, or the previously missed scenery.
      const footCenter={x:p.x,y:p.y-.65,z:p.z}
      const hit=world.intersectionWithShape(footCenter,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.85,.35),
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,channelCollider)
      assert.equal(hit,null,`rider hits world at progress ${progress}: ${JSON.stringify(p)}`)
      // Allow the feet to rest against the sloping channel while checking that
      // the torso/head never clips its sides or a different turn above it.
      const upperHit=world.intersectionWithShape({x:p.x,y:p.y-.45,z:p.z},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.65,.35),
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      assert.equal(upperHit,null,`rider torso hits the flume at ${progress}`)
      const angle=Math.atan2(p.z-z,p.x-x)
      turns+=Math.atan2(Math.sin(angle-priorAngle),Math.cos(angle-priorAngle))
      priorAngle=angle; previous=p
    }
    assert(turns > Math.PI*4,'meaningful spiral turns')
    const end=sampleWaterslideRide(slide,1).position
    assert(Math.abs(end.y-floor-2.07)<.01,'dry run-out remains just above cave floor')
    body.setTranslation(end,true); world.step()
    let vertical=0, wasGrounded=false
    for(let i=0;i<180;i++) {
      const p=body.translation(); vertical=controller.computedGrounded()?0:vertical-9.8/120
      controller.computeColliderMovement(collider,{x:0,y:vertical/120,z:0},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      const m=controller.computedMovement(); body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step()
      wasGrounded ||= controller.computedGrounded()
    }
    assert(wasGrounded,'normal collision and gravity resume after the ride')
    assert(Math.abs(body.translation().y-floor-2.07)<.15,'bunny stands on the exit flume')
    // Walk through the open end before turning aside, keeping clear of the tub.
    for(let i=0;i<24;i++) {
      const p=body.translation(); vertical=controller.computedGrounded()?0:vertical-9.8/120
      controller.computeColliderMovement(collider,{x:0,y:vertical/120,z:3/120},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step()
    }
    for(let i=0;i<180;i++) {
      const p=body.translation();vertical=controller.computedGrounded()?0:vertical-9.8/120
      controller.computeColliderMovement(collider,{x:3/120,y:vertical/120,z:0},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
      const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step()
    }
    assert(body.translation().x>4,'bunny walks away from the slide')
    assert.equal(JSON.stringify(level),snapshot)
    world.free(); terrain.dispose(); channel.dispose(); dispose(hole,cave,tub)
  })
}
