// Run with: node --test tests/golden-mushroom.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import * as THREE from 'three'

const root = fileURLToPath(new URL('..', import.meta.url))
const compiled = await build({
  stdin: {
    contents: `export * from './src/game/golden-mushroom'; export * from './src/game/terrain/level-document'; export * from './src/game/terrain/water-physics';`,
    resolveDir: root,
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const {
  goldenMushroomPosition, canEatGoldenMushroom, GOLDEN_MUSHROOM_RANGE,
  GOLDEN_MUSHROOM_REGROW_MS, GOLDEN_VISION_DURATION_MS,
  createTerrainLevel, normalizeTerrainLevel, TERRAIN_SIZE, TERRAIN_SEGMENTS,
  terrainHeightAtVertex, terrainVertexIndex, waterSurfaceAt,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

// Independent render-mesh raycast checks placement against the actual triangle
// surface, rather than just repeating the helper's height lookup.
function renderedGroundAt(level, x, z) {
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i++) {
    positions.setZ(i, terrainHeightAtVertex(level, i % (TERRAIN_SEGMENTS + 1), Math.floor(i / (TERRAIN_SEGMENTS + 1))))
  }
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = -0.02 // Matches Platforms' terrain transform.
  mesh.updateMatrixWorld(true)
  const hits = new THREE.Raycaster(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)
  assert.ok(hits.length, 'pickup lies over a real terrain triangle')
  const ground = hits[0].point.y
  geometry.dispose()
  material.dispose()
  return ground
}

function assertGrounded(level, position) {
  const [x, y, z] = position
  assert.ok(position.every(Number.isFinite))
  assert.ok(Math.abs(y - renderedGroundAt(level, x, z) - 0.06) < 0.0001,
    'stem rests 6cm above gameplay terrain, including its 2cm terrain offset')
}

const savedPath = new URL('../level-data/adventure-valley.json', import.meta.url)
test('actual saved Adventure Valley places the mushroom on its sculpted terrain without changing the document', {
  skip: !existsSync(savedPath) && 'No local shared terrain document in this checkout',
}, () => {
  const saved = readFileSync(savedPath, 'utf8')
  const level = normalizeTerrainLevel(JSON.parse(saved))
  const snapshot = JSON.stringify(level)
  assertGrounded(level, goldenMushroomPosition(level))
  assert.equal(JSON.stringify(level), snapshot)
  assert.equal(readFileSync(savedPath, 'utf8'), saved)
})

test('sculpting a dry map changes pickup height instead of leaving it floating or buried', () => {
  const level = createTerrainLevel()
  const original = goldenMushroomPosition(level)
  level.heightOffsets.fill(17)
  const raised = goldenMushroomPosition(level)
  assert.equal(raised[0], original[0])
  assert.equal(raised[2], original[2])
  assert.ok(Math.abs(raised[1] - original[1] - 17) < 1e-10)
  assertGrounded(level, raised)
})

test('a flooded hiding place moves the pickup to a dry sculpted fallback', () => {
  const level = createTerrainLevel()
  level.waterLevel = 80
  level.waterMask.fill(1)
  // Submerge everything, then raise a small island at the last hiding spot.
  for (let row = 0; row <= TERRAIN_SEGMENTS; row++) {
    for (let column = 0; column <= TERRAIN_SEGMENTS; column++) {
      const index = terrainVertexIndex(column, row)
      level.heightOffsets[index] = -20 - terrainHeightAtVertex(level, column, row)
    }
  }
  const x = -114, z = 66
  const column = Math.floor((x + TERRAIN_SIZE / 2) * TERRAIN_SEGMENTS / TERRAIN_SIZE)
  const row = Math.floor((z + TERRAIN_SIZE / 2) * TERRAIN_SEGMENTS / TERRAIN_SIZE)
  for (const [c, r] of [[column, row], [column + 1, row], [column, row + 1], [column + 1, row + 1]]) {
    level.heightOffsets[terrainVertexIndex(c, r)] += 105
  }
  assert.notEqual(waterSurfaceAt(level, -73, 47), null)
  const position = goldenMushroomPosition(level)
  assert.deepEqual([position[0], position[2]], [x, z])
  assert.equal(waterSurfaceAt(level, position[0], position[2]), null)
  assertGrounded(level, position)
})

test('a completely flooded map still has a finite, grounded underwater pickup', () => {
  const level = createTerrainLevel()
  level.waterLevel = 80
  level.waterMask.fill(1)
  const position = goldenMushroomPosition(level)
  assert.notEqual(waterSurfaceAt(level, position[0], position[2]), null)
  assertGrounded(level, position)
})

test('only a nearby jackalope can eat, with distance checked vertically as well as horizontally', () => {
  const position = [0, 0, 0]
  const nearby = { x: 0, y: 0.9, z: 0 }
  assert.equal(canEatGoldenMushroom(nearby, position, true, 0, 100), true)
  assert.equal(canEatGoldenMushroom(nearby, position, false, 0, 100), false)
  assert.equal(canEatGoldenMushroom({ ...nearby, x: GOLDEN_MUSHROOM_RANGE }, position, true, 0, 100), true)
  assert.equal(canEatGoldenMushroom({ ...nearby, x: GOLDEN_MUSHROOM_RANGE + 0.01 }, position, true, 0, 100), false)
  assert.equal(canEatGoldenMushroom({ ...nearby, y: 0.9 + GOLDEN_MUSHROOM_RANGE + 0.01 }, position, true, 0, 100), false)
  assert.equal(canEatGoldenMushroom({ ...nearby, x: 2.5, z: 2.5 }, position, true, 0, 100), false)
  for (const x of [NaN, Infinity, -Infinity]) {
    assert.equal(canEatGoldenMushroom({ ...nearby, x }, position, true, 0, 100), false)
  }
})

test('the consumed mushroom stays unavailable through effect expiry and regrows only at cooldown', () => {
  const consumedAt = 1000
  const availableAt = consumedAt + GOLDEN_MUSHROOM_REGROW_MS
  const position = [0, 0, 0]
  const nearby = { x: 0, y: 0.9, z: 0 }
  assert.ok(GOLDEN_MUSHROOM_REGROW_MS > GOLDEN_VISION_DURATION_MS)
  for (const now of [consumedAt, consumedAt + GOLDEN_VISION_DURATION_MS, availableAt - 1]) {
    assert.equal(canEatGoldenMushroom(nearby, position, true, availableAt, now), false)
  }
  assert.equal(canEatGoldenMushroom(nearby, position, true, availableAt, availableAt), true)
})
