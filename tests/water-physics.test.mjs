// Run with: node --test tests/water-physics.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import * as THREE from 'three'

// Use Vite's existing TypeScript compiler dependency without adding a test runner.
const compiled = await build({
  stdin: {
    contents: `export * from './src/game/terrain/water-physics'; export * from './src/game/terrain/level-document'; export { swimVerticalVelocity } from './src/game/terrain/use-swimming';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
})
const {
  createTerrainLevel, terrainVertexIndex, terrainVertexWorldPosition,
  terrainHeightAtVertex, TERRAIN_SIZE, TERRAIN_SEGMENTS,
  isWaterCellPainted, terrainHeightAt, waterSurfaceAt, sampleSwimWater, swimVerticalVelocity,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

function fixture() {
  const level = createTerrainLevel()
  level.waterLevel = 5
  for (const [c, r] of [[35, 35], [36, 35], [35, 36], [36, 36]]) {
    level.waterMask[terrainVertexIndex(c, r)] = 1
  }
  return level
}

test('render paint threshold requires both a strong enough vertex and enough total paint', () => {
  const level = createTerrainLevel()
  const indices = [[35, 35], [36, 35], [35, 36], [36, 36]].map(([c, r]) => terrainVertexIndex(c, r))
  for (const index of indices) level.waterMask[index] = 0.1
  assert.equal(isWaterCellPainted(level, 35, 35), false)
  level.waterMask.fill(0)
  level.waterMask[indices[0]] = 0.34
  assert.equal(isWaterCellPainted(level, 35, 35), false)
  level.waterMask[indices[0]] = 0.35
  assert.equal(isWaterCellPainted(level, 35, 35), true)
  assert.equal(waterSurfaceAt(level, 10, 10), 2, 'paint covers the entire visible quad, not just near its painted vertex')
})

test('dry cells, map bounds and invalid coordinates do not contain water', () => {
  const level = fixture()
  assert.equal(waterSurfaceAt(level, 5, 5), 5)
  for (const [x, z] of [[30, 30], [-401, 0], [401, 0], [0, 401], [0, -401], [NaN, 0], [0, Infinity]]) {
    assert.equal(waterSurfaceAt(level, x, z), null)
    assert.equal(sampleSwimWater(level, x, 3, z, true), null)
  }
  level.waterMask.fill(1)
  assert.equal(waterSurfaceAt(level, 400, 400), 5, 'outermost painted edge is inside the mesh')
  assert.equal(waterSurfaceAt(level, -400, -400), 5)
})

test('painted quad edge remains wet even when the adjacent quad is dry', () => {
  const level = createTerrainLevel()
  level.waterMask[terrainVertexIndex(34, 34)] = 1
  assert.equal(waterSurfaceAt(level, 0, -5), 2)
  assert.equal(waterSurfaceAt(level, 0.001, -5), null)
})

test('terrain samples both real mesh triangles, including a nonplanar sculpted cell', () => {
  const level = fixture()
  level.heightOffsets[terrainVertexIndex(36, 36)] = 8
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i++) {
    positions.setZ(i, terrainHeightAtVertex(level, i % (TERRAIN_SEGMENTS + 1), Math.floor(i / (TERRAIN_SEGMENTS + 1))))
  }
  geometry.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const step = TERRAIN_SIZE / TERRAIN_SEGMENTS
  for (const [u, v, expected] of [[0.25, 0.25, 0], [0.75, 0.75, 4], [0.25, 0.75, 0]]) {
    const x = u * step
    const z = v * step
    assert.ok(Math.abs(terrainHeightAt(level, x, z) - expected) < 1e-10)
    const hits = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)
    assert.ok(hits.length > 0)
    assert.ok(Math.abs(terrainHeightAt(level, x, z) - hits[0].point.y) < 1e-5)
  }
  const [x, z] = terrainVertexWorldPosition(36, 36)
  assert.ok(Math.abs(terrainHeightAt(level, x, z) - 8) < 1e-10)
  geometry.dispose()
  mesh.material.dispose()
})

test('buried water and shallow puddles never activate swimming', () => {
  const level = fixture()
  level.waterLevel = -1
  assert.equal(waterSurfaceAt(level, 5, 5), null)
  assert.equal(sampleSwimWater(level, 5, -1, 5), null)
  level.waterLevel = 0
  assert.equal(waterSurfaceAt(level, 5, 5), null)
  level.waterLevel = 2.29
  assert.equal(waterSurfaceAt(level, 5, 5), 2.29)
  assert.equal(sampleSwimWater(level, 5, 2, 5), null)
  assert.equal(sampleSwimWater(level, 5, 2, 5, true), null)
  level.waterLevel = 2.3
  assert.equal(sampleSwimWater(level, 5, 2, 5), 2.3)
})

test('entry and exit immersion bands prevent floating in air or surface chatter', () => {
  const level = fixture()
  assert.equal(sampleSwimWater(level, 5, 5.04, 5), 5)
  assert.equal(sampleSwimWater(level, 5, 5.1, 5), null)
  assert.equal(sampleSwimWater(level, 5, 5.1, 5, true), 5)
  assert.equal(sampleSwimWater(level, 5, 5.26, 5, true), null)
  assert.equal(sampleSwimWater(level, 5, 4.65, 5, true), 5)
  assert.equal(sampleSwimWater(level, 5, 1, 5), 5)
  assert.equal(sampleSwimWater(level, 5, -0.1, 5), null)
  assert.equal(sampleSwimWater(level, 5, NaN, 5), null)
  level.waterMask.fill(0)
  assert.equal(sampleSwimWater(level, 5, 4, 5, true), null, 'erasing water takes effect immediately')
})

test('raising or lowering the editor water line immediately changes immersion', () => {
  const level = fixture()
  assert.equal(sampleSwimWater(level, 5, 4, 5), 5)
  level.waterLevel = 3
  assert.equal(sampleSwimWater(level, 5, 4, 5, true), null)
  assert.equal(sampleSwimWater(level, 5, 2.65, 5), 3)
})

function simulateSwim({ y = -10, surface = 5, input = 0, velocity = 0, seconds = 2, dt = 1 / 60 }) {
  let highest = y
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) {
    const step = Math.min(dt, seconds - elapsed)
    velocity = swimVerticalVelocity(y, surface, input, velocity, step)
    y += velocity * step
    highest = Math.max(highest, y)
  }
  return { y, velocity, highest }
}

test('ascent and descent have the same controllable speed at 30, 60 and 144 Hz', () => {
  for (const input of [-1, 1]) {
    const results = [1 / 30, 1 / 60, 1 / 144].map(dt => simulateSwim({ input, dt }))
    for (const result of results) {
      assert.ok(Math.abs(result.velocity - input * 4) < 0.001)
      assert.ok((result.y + 10) * input > 7, 'held input makes meaningful progress in its requested direction')
    }
    assert.ok(Math.max(...results.map(result => result.y)) - Math.min(...results.map(result => result.y)) < 0.06)
  }
})

test('letting go floats gently up and settles at the surface without overshoot', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const result = simulateSwim({ y: 3, dt, seconds: 10 })
    assert.ok(Math.abs(result.y - 4.65) < 0.001)
    assert.ok(Math.abs(result.velocity) < 0.001)
    assert.ok(result.highest <= 4.65)
    const enteredAboveFloat = simulateSwim({ y: 5.04, dt, seconds: 10 })
    assert.ok(Math.abs(enteredAboveFloat.y - 4.65) < 0.001, 'entry from above settles down into the float position')
  }
})

test('holding ascend cannot launch above the surface even with upward momentum or a long frame', () => {
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.05]) {
    const result = simulateSwim({ y: 4.64, input: 1, velocity: 20, dt })
    assert.ok(result.highest <= 4.65 + 1e-12)
    assert.ok(Math.abs(result.y - 4.65) < 1e-12)
    assert.equal(result.velocity, 0)
    assert.equal(swimVerticalVelocity(4.8, 5, 1, 4, dt), 0, 'an above-float swimmer cannot continue rising')
  }
})

test('descending from a float works and releasing descent reverses into gentle buoyancy', () => {
  const descended = simulateSwim({ y: 4.65, input: -1, seconds: 1 })
  assert.ok(descended.y < 1.5)
  assert.ok(descended.velocity < -3.9)
  const released = simulateSwim({ y: descended.y, velocity: descended.velocity, input: 0, seconds: 2 })
  assert.ok(released.velocity > 0 && released.velocity <= 0.8)
  assert.ok(released.y > descended.y)
})
