import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import * as THREE from 'three'

const compiled = await build({
  stdin: {
    contents: `export * from './src/game/cave-waterslide';export * from './src/game/adventure-caves';export * from './src/game/terrain/level-document';`,
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const {
  createWaterslide, sampleWaterslideRide, canBoardWaterslide,
  WATERSLIDE_RIDER_OFFSET, WATERSLIDE_HALF_WIDTH, WATERSLIDE_BOARDING_RANGE,
  caveFloorAt, caveCeilingAt, caveWaterSurfaceAt, createCaveGeometries,
  createTerrainLevel, normalizeTerrainLevel, terrainVertexIndex,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

const savedPath = new URL('../level-data/adventure-valley.json', import.meta.url)
const savedBytes = readFileSync(savedPath, 'utf8')
const savedLevel = () => normalizeTerrainLevel(JSON.parse(savedBytes))

for (const [label, createLevel] of [['default terrain', createTerrainLevel], ['saved terrain', savedLevel]]) {
  test(`slide starts at a walk-up lip and ends swimming on ${label}`, () => {
    const level = createLevel(), slide = createWaterslide(level)
    const startRide = sampleWaterslideRide(slide, 0), endRide = sampleWaterslideRide(slide, 1)
    assert.equal(slide.start.x, -5)
    assert.equal(slide.start.z, -70)
    assert(Math.abs(slide.start.y - caveFloorAt(level, -5, -70) - .12) < 1e-8)
    assert(canBoardWaterslide(slide, { x: -5, y: caveFloorAt(level, -5, -70) + 1.95, z: -69 }))
    assert.equal(caveWaterSurfaceAt(level, startRide.position.x, startRide.position.y, startRide.position.z), null)
    assert(Math.abs(endRide.position.y - (slide.waterLevel - .45)) < 1e-8)
    assert.equal(caveWaterSurfaceAt(level, endRide.position.x, endRide.position.y, endRide.position.z), slide.waterLevel)
    assert(slide.length > 85 && slide.length < 130, 'full twisting route, not a direct drop')
  })

  test(`entire flume, safety margin, and rider capsule clear real cave geometry on ${label}`, () => {
    const level = createLevel(), slide = createWaterslide(level), cave = createCaveGeometries(level)
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const meshes = [cave.floor, cave.ceiling].map(g => {
      const mesh = new THREE.Mesh(g, material)
      mesh.updateMatrixWorld(true)
      return mesh
    })
    for (let i = 0; i <= 600; i++) {
      const progress = i / 600, floorPoint = slide.curve.getPointAt(progress)
      const { position, direction } = sampleWaterslideRide(slide, progress)
      const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize()
      for (const lateral of [-WATERSLIDE_HALF_WIDTH - .6, -WATERSLIDE_HALF_WIDTH, 0, WATERSLIDE_HALF_WIDTH, WATERSLIDE_HALF_WIDTH + .6]) {
        const x = floorPoint.x + side.x * lateral, z = floorPoint.z + side.z * lateral
        const bottom = caveFloorAt(level, x, z), roof = caveCeilingAt(level, x, z)
        assert.notEqual(bottom, null, `flume leaves footprint at ${progress}, ${lateral}`)
        assert(floorPoint.y >= bottom + .08, `flume crosses solid floor at ${progress}, ${lateral}`)
        assert(roof - floorPoint.y >= 3, `flume lacks headroom at ${progress}, ${lateral}`)
        if (i % 10 === 0) {
          // Independently raycast the meshes actually given to Rapier, rather
          // than only comparing two formula-based lookup helpers.
          const ray = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0))
          assert(Math.abs(ray.intersectObject(meshes[0])[0].point.y - bottom) < 1e-4)
          assert(Math.abs(ray.intersectObject(meshes[1])[0].point.y - roof) < 1e-4)
        }
      }
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const x = position.x + Math.cos(angle) * .45, z = position.z + Math.sin(angle) * .45
        assert(position.y - 1.85 > caveFloorAt(level, x, z), 'capsule feet stay above floor')
        assert(position.y + .6 < caveCeilingAt(level, x, z), 'capsule head stays below roof')
      }
    }
    material.dispose()
    for (const value of Object.values(cave)) if (value?.isBufferGeometry) value.dispose()
  })
}

test('boarding rejects distant, upstairs, below-floor, and nonfinite player positions', () => {
  const slide = createWaterslide(savedLevel()), start = sampleWaterslideRide(slide, 0).position
  assert(canBoardWaterslide(slide, start))
  assert(canBoardWaterslide(slide, { ...start, x: start.x + WATERSLIDE_BOARDING_RANGE - .01 }))
  for (const position of [
    { ...start, x: start.x + WATERSLIDE_BOARDING_RANGE + .01 },
    { ...start, z: start.z + WATERSLIDE_BOARDING_RANGE + .01 },
    { ...start, y: 2 },
    { ...start, y: start.y - 4 },
    { ...start, x: NaN },
    { ...start, y: Infinity },
    { ...start, z: -Infinity },
  ]) assert.equal(canBoardWaterslide(slide, position), false)
})

test('arc-length ride sampling is smooth, normalized, clamped, and supplies model heading', () => {
  const slide = createWaterslide(savedLevel()), step = slide.length / 240
  let previous = sampleWaterslideRide(slide, 0), left = false, right = false
  for (let i = 1; i <= 240; i++) {
    const current = sampleWaterslideRide(slide, i / 240)
    assert(Math.abs(current.direction.length() - 1) < 1e-8)
    assert(Math.abs(current.horizontalDirection.length() - 1) < 1e-8)
    assert.equal(current.horizontalDirection.y, 0)
    assert.equal(current.heading, Math.atan2(current.direction.x, current.direction.z) + Math.PI)
    assert(current.position.distanceTo(previous.position) > step * .97, 'tight bends do not stall ride progress')
    assert(current.position.distanceTo(previous.position) < step * 1.03, 'no sudden ride-speed jumps')
    assert(current.direction.angleTo(previous.direction) < .3, 'no abrupt camera heading kink')
    assert(step / current.direction.angleTo(previous.direction) > WATERSLIDE_HALF_WIDTH + .8,
      'turn radius exceeds channel half-width, preventing the inner wall folding into itself')
    assert(current.position.z < previous.position.z, 'route always advances toward lake')
    left ||= current.direction.x < -.5
    right ||= current.direction.x > .5
    previous = current
  }
  assert(left && right, 'route has meaningful alternating S bends')
  assert.deepEqual(sampleWaterslideRide(slide, -1).position.toArray(), sampleWaterslideRide(slide, 0).position.toArray())
  assert.deepEqual(sampleWaterslideRide(slide, 2).position.toArray(), sampleWaterslideRide(slide, 1).position.toArray())
  assert.deepEqual(sampleWaterslideRide(slide, NaN).position.toArray(), sampleWaterslideRide(slide, 0).position.toArray())
})

test('deterministic route follows shifted cave elevation without mutating saved terrain', () => {
  const level = savedLevel(), before = JSON.stringify(level)
  const a = createWaterslide(level), b = createWaterslide(level)
  for (const t of [0, .1, .25, .5, .75, 1]) assert.deepEqual(a.curve.getPointAt(t).toArray(), b.curve.getPointAt(t).toArray())
  const sculpted = createTerrainLevel()
  for (let row = 20; row <= 24; row++) for (let column = 32; column <= 38; column++) {
    sculpted.heightOffsets[terrainVertexIndex(column, row)] = -25
  }
  const shifted = createWaterslide(sculpted)
  assert(shifted.start.y < a.start.y - 10)
  for (const t of [0, .1, .25, .5, .75, 1]) {
    const p = shifted.curve.getPointAt(t), original = a.curve.getPointAt(t)
    assert(Math.abs(p.x - original.x) < 1e-8 && Math.abs(p.z - original.z) < 1e-8)
    assert(p.y >= caveFloorAt(sculpted, p.x, p.z) + .08)
    assert(caveCeilingAt(sculpted, p.x, p.z) - p.y >= 3)
  }
  assert.equal(JSON.stringify(level), before)
  assert.equal(readFileSync(savedPath, 'utf8'), savedBytes)
})
