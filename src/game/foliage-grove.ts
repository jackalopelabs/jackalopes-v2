import type { TerrainLevelDocument } from './terrain/level-document'
import { terrainHeightAt, waterSurfaceAt } from './terrain/water-physics'

export const GROVE_CENTER = { x: -110, z: -22 }
export const GROVE_RADIUS = 14
export const GROVE_STORAGE_KEY = 'jackalopes.foliage-grove.v1'
export type GrovePlant = { x: number; y: number; z: number; rotation: number; scale: number; tint: number }

// A meandering, three-metre clearing keeps the original survey grid visible.
export function grovePathDistance(x: number, z: number) {
  return Math.abs(x - (GROVE_CENTER.x + Math.sin((z - GROVE_CENTER.z) * 0.13) * 3))
}

export function groveGround(level: TerrainLevelDocument, x: number, z: number): number | null {
  if (Math.hypot(x - GROVE_CENTER.x, z - GROVE_CENTER.z) > GROVE_RADIUS || grovePathDistance(x, z) < 1.6) return null
  const y = terrainHeightAt(level, x, z)
  if (y === null || waterSurfaceAt(level, x, z) !== null) return null
  // Leave the starting spot and nearby existing scenery's root footprints clear.
  const exclusions = [[-100, 10, 3.5], [-70, 25, 5], [-70, 40, 5], [-80, 40, 7], [-110, 45, 7], [-85, 35, 1.8], [-70, -25, 5], [-70, -40, 5], [-80, -40, 7], [-110, -45, 7], [-85, -35, 1.8]]
  if (exclusions.some(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) < radius)) return null
  // Existing western conical outcrop, narrowed to its footprint at this elevation.
  const outcropRadius = y < 7.5 ? 25 * Math.max(0, 1 - (y + 0.5) / 8) + 0.6 : 0
  if (Math.hypot(x + 90, z) < outcropRadius) return null
  // Never grow on steep sculpted banks or across a painted water edge.
  for (const [dx, dz] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
    const neighbor = terrainHeightAt(level, x + dx, z + dz)
    if (neighbor === null || Math.abs(neighbor - y) > 0.3 || waterSurfaceAt(level, x + dx, z + dz) !== null) return null
  }
  return y - 0.03 // Visible terrain has a -0.02m offset; gently bury the root.
}

/** Local, deterministic scenery. No saved-level writes, networking, or colliders. */
export function createGrovePlacements(level: TerrainLevelDocument) {
  let state = 42619
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const place = (count: number, fern: boolean): GrovePlant[] => {
    const plants: GrovePlant[] = []
    for (let attempt = 0; attempt < count * 12 && plants.length < count; attempt++) {
      const angle = random() * Math.PI * 2
      const radius = Math.sqrt(random()) * GROVE_RADIUS
      const x = GROVE_CENTER.x + Math.cos(angle) * radius
      const z = GROVE_CENTER.z + Math.sin(angle) * radius
      const edge = Math.min(1, (GROVE_RADIUS - radius) / 3)
      const patch = 0.65 + Math.sin(x * 0.47 + Math.sin(z * 0.2)) * Math.cos(z * 0.38) * 0.3
      if (random() > edge * patch) continue
      const y = groveGround(level, x, z)
      if (y === null || (fern && grovePathDistance(x, z) < 2.4)) continue
      plants.push({ x, y, z, rotation: random() * Math.PI * 2,
        scale: fern ? 0.6 + random() * 0.42 : 0.65 + random() * 0.65,
        tint: 0.85 + random() * 0.3 })
    }
    return plants
  }
  return { grass: place(1800, false), ferns: place(70, true) }
}
