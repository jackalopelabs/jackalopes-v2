import { caveWaterSurfaceAt } from './adventure-caves'
import { sampleSwimWater } from './terrain/water-physics'
import type { TerrainLevelDocument } from './terrain/level-document'

export type BubblePoint = { x: number; y: number; z: number }
export const BUBBLE_CAPACITY = 32
export const BUBBLE_MAX_SECONDS = 24

// Coordinates in the existing scale-2, feet-grounded avatar group. Astronaut
// includes MercModel's 1.8 scale; jackalope crown excludes the tall antlers.
export const BUBBLE_ANCHORS = {
  jackalope: { mouth: [0, 0.59, -0.23], crown: [0, 0.79, 0] },
  astronaut: { mouth: [0, 1.55, 0.16], crown: [0, 1.80, 0] },
} as const

export function bubbleWaterSurface(level: TerrainLevelDocument, head: BubblePoint, caves: boolean): number | null {
  return (caves ? caveWaterSurfaceAt(level, head.x, head.y, head.z) : null)
    ?? sampleSwimWater(level, head.x, head.y, head.z)
}

export function canEmitBubble(mouth: BubblePoint, crown: BubblePoint, surface: number | null): boolean {
  return surface !== null && Number.isFinite(surface)
    && Number.isFinite(mouth.x) && Number.isFinite(mouth.y) && Number.isFinite(mouth.z)
    && Number.isFinite(crown.x) && Number.isFinite(crown.y) && Number.isFinite(crown.z)
    && Math.max(mouth.y, crown.y) < surface - 0.08
}

/** Fixed reusable slots. Emitted positions and surface are copies, never avatar references. */
export function createBubblePool(random: () => number = Math.random) {
  const slots = Array.from({ length: BUBBLE_CAPACITY }, () => ({
    x: 0, y: 0, z: 0, surface: 0, age: 0, speed: 0, radius: 0, phase: 0, active: false,
  }))
  let untilNext = 0.25 + random() * 0.4
  let cursor = 0
  return {
    slots,
    step(dt: number, mouth: BubblePoint, crown: BubblePoint, surface: number | null, enabled = true) {
      if (!Number.isFinite(dt) || dt <= 0) return
      for (const bubble of slots) {
        if (!bubble.active) continue
        bubble.age += dt
        bubble.y += bubble.speed * dt
        if (bubble.y >= bubble.surface || bubble.age >= BUBBLE_MAX_SECONDS) bubble.active = false
      }
      if (!enabled || !canEmitBubble(mouth, crown, surface)) {
        untilNext = 0.25
        return
      }
      // Never catch up with a burst after a suspended tab or a slow frame.
      untilNext -= dt
      if (untilNext > 0) return
      untilNext = 0.65 + random() * 0.4
      const bubble = slots[cursor]
      cursor = (cursor + 1) % slots.length
      bubble.x = mouth.x
      bubble.y = mouth.y
      bubble.z = mouth.z
      bubble.surface = surface!
      bubble.age = 0
      // Even deep painted water reaches its own surface before the safety lifetime.
      bubble.speed = Math.max(0.7 + random() * 0.25, (surface! - mouth.y) / (BUBBLE_MAX_SECONDS - 1))
      bubble.radius = 0.035 + random() * 0.025
      bubble.phase = random() * Math.PI * 2
      bubble.active = true
    },
  }
}
