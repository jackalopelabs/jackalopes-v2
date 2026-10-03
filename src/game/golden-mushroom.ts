import { terrainHeightAt, waterSurfaceAt } from './terrain/water-physics'
import type { TerrainLevelDocument } from './terrain/level-document'

export const GOLDEN_VISION_DURATION_MS = 60_000
export const GOLDEN_MUSHROOM_REGROW_MS = 90_000
export const GOLDEN_MUSHROOM_RANGE = 3.2

// Tucked behind the western forest, away from the ordinary mushroom trail.
// Try nearby hiding spots if a sculpted map has flooded the original spot.
export function goldenMushroomPosition(level: TerrainLevelDocument): [number, number, number] {
  const spots = [[-73, 47], [-66, 54], [-58, 62], [-106, 54], [-114, 66]]
  for (const [x, z] of spots) {
    const ground = terrainHeightAt(level, x, z)
    if (ground !== null && waterSurfaceAt(level, x, z) === null) return [x, ground + 0.04, z]
  }
  // Still discoverable by swimming if all the hiding spots were flooded.
  const [x, z] = spots[0]
  return [x, (terrainHeightAt(level, x, z) ?? 0) + 0.04, z]
}

export function canEatGoldenMushroom(
  player: { x: number; y: number; z: number },
  mushroom: [number, number, number],
  isJackalope: boolean,
  availableAt: number,
  now: number,
) {
  return isJackalope && now >= availableAt && Math.hypot(
    player.x - mushroom[0], player.y - mushroom[1] - 0.9, player.z - mushroom[2],
  ) <= GOLDEN_MUSHROOM_RANGE
}
