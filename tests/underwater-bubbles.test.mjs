import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
const compiled = await build({ stdin: { contents: `export * from './src/game/underwater-bubbles'; export * from './src/game/terrain/level-document'; export { caveLayout } from './src/game/adventure-caves';`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false })
const { createBubblePool, canEmitBubble, bubbleWaterSurface, createTerrainLevel, caveLayout, BUBBLE_CAPACITY, BUBBLE_MAX_SECONDS } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const point = (x = 40, y = 2, z = 40) => ({ x, y, z })

test('head fully underwater is required even when the mouth is wet; no camera input', () => {
  assert(canEmitBubble(point(), point(40, 3), 5))
  for (const surface of [null, NaN, Infinity]) assert.equal(canEmitBubble(point(), point(), surface), false)
  for (const headY of [4.93, 5, 6, NaN]) assert.equal(canEmitBubble(point(), point(40, headY), 5), false)
  assert.equal(canEmitBubble(point(40, 5), point(40, 3), 5), false)
})

test('painted water and the negative-elevation cave lake use their actual local surface', () => {
  const level = createTerrainLevel(); level.waterMask.fill(1); level.waterLevel = 5
  assert.equal(bubbleWaterSurface(level, point(), true), 5)
  const surface = caveLayout(level).waterLevel
  assert(surface < 0)
  assert.equal(bubbleWaterSurface(level, point(0, surface - 3, -120), true), surface)
  assert.equal(bubbleWaterSurface(level, point(0, surface - 3, -120), false), null, 'surface paint cannot leak through the cave roof')
  assert.equal(bubbleWaterSurface(level, point(90, surface - 3, -120), true), null, 'outside cave footprint')
  level.waterMask.fill(0)
  assert.equal(bubbleWaterSurface(level, point(), true), null)
})

test('still avatars emit, then detached bubbles rise at their old world position after moving and surfacing', () => {
  const pool = createBubblePool(() => 0.5), mouth = point(), crown = point(40, 3)
  pool.step(0.6, mouth, crown, 5)
  const bubble = pool.slots.find(b => b.active)
  assert(bubble)
  mouth.x = 90; mouth.y = 9; crown.x = 90; crown.y = 10
  pool.step(1, mouth, crown, null)
  assert.equal(bubble.x, 40)
  assert.equal(bubble.z, 40)
  assert(bubble.y > 2 && bubble.y < 5)
  assert.equal(bubble.surface, 5)
  assert.equal(pool.slots.filter(b => b.active).length, 1)
  pool.step(4, mouth, crown, null)
  assert.equal(bubble.active, false, 'pops at its original surface without requiring continued submersion')
})

test('no bubbles cross the water surface or outlive their bounded lifetime, even in deep water', () => {
  const pool = createBubblePool(() => 0.5)
  pool.step(0.6, point(40, -95), point(40, -94), 5)
  const bubble = pool.slots.find(b => b.active)
  assert(bubble)
  for (let i = 0; i < BUBBLE_MAX_SECONDS * 60; i++) {
    pool.step(1 / 60, point(), point(), null)
    if (bubble.active) assert(bubble.y < 5)
  }
  assert.equal(bubble.active, false)
  assert(bubble.age < BUBBLE_MAX_SECONDS)
})

test('pool stays bounded, no catch-up burst, and reduced-motion suppression lets old bubbles finish', () => {
  const pool = createBubblePool(() => 0.5), slots = [...pool.slots]
  pool.step(60, point(), point(), 5)
  assert.equal(pool.slots.filter(b => b.active).length, 1, 'resume emits at most one bubble')
  pool.step(0.1, point(), point(), 5, false)
  assert.equal(pool.slots.filter(b => b.active).length, 1)
  pool.step(10, point(), point(), 5, false)
  assert.equal(pool.slots.filter(b => b.active).length, 0)
  for (let i = 0; i < 6000; i++) pool.step(1 / 60, point(), point(), 5)
  assert.equal(pool.slots.length, BUBBLE_CAPACITY)
  assert(pool.slots.every((b, i) => b === slots[i]))
  const before = JSON.stringify(pool.slots)
  for (const dt of [0, -1, NaN, Infinity]) pool.step(dt, point(), point(), 5)
  assert.equal(JSON.stringify(pool.slots), before)
})
