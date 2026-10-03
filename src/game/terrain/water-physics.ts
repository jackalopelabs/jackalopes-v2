import {
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  terrainHeightAtVertex,
  terrainVertexIndex,
  type TerrainLevelDocument,
} from './level-document'

/** The same whole-cell paint threshold used by the visible water mesh. */
export function isWaterCellPainted(level: TerrainLevelDocument, column: number, row: number): boolean {
  if (column < 0 || row < 0 || column >= TERRAIN_SEGMENTS || row >= TERRAIN_SEGMENTS) return false
  const a = level.waterMask[terrainVertexIndex(column, row)]
  const b = level.waterMask[terrainVertexIndex(column + 1, row)]
  const c = level.waterMask[terrainVertexIndex(column, row + 1)]
  const d = level.waterMask[terrainVertexIndex(column + 1, row + 1)]
  return Math.max(a, b, c, d) >= 0.12 && a + b + c + d >= 0.35
}

function terrainCellAt(x: number, z: number) {
  const halfSize = TERRAIN_SIZE / 2
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < -halfSize || x > halfSize || z < -halfSize || z > halfSize) return null
  const gridX = (x + halfSize) * TERRAIN_SEGMENTS / TERRAIN_SIZE
  const gridZ = (z + halfSize) * TERRAIN_SEGMENTS / TERRAIN_SIZE
  const column = Math.min(TERRAIN_SEGMENTS - 1, Math.floor(gridX))
  const row = Math.min(TERRAIN_SEGMENTS - 1, Math.floor(gridZ))
  return { column, row, u: gridX - column, v: gridZ - row }
}

/** Interpolate the two PlaneGeometry triangles, not a bilinear height field.
 * The gameplay terrain is lowered by 0.02m; this editor-height sample is
 * deliberately conservative by that amount for depth checks.
 */
export function terrainHeightAt(level: TerrainLevelDocument, x: number, z: number): number | null {
  const cell = terrainCellAt(x, z)
  if (!cell) return null
  const { column, row, u, v } = cell
  const topRight = terrainHeightAtVertex(level, column + 1, row)
  const bottomLeft = terrainHeightAtVertex(level, column, row + 1)
  if (u + v <= 1) {
    const topLeft = terrainHeightAtVertex(level, column, row)
    return topLeft * (1 - u - v) + topRight * u + bottomLeft * v
  }
  const bottomRight = terrainHeightAtVertex(level, column + 1, row + 1)
  return bottomRight * (u + v - 1) + bottomLeft * (1 - u) + topRight * (1 - v)
}

/** Return the painted surface only where it is actually above the terrain. */
export function waterSurfaceAt(level: TerrainLevelDocument, x: number, z: number): number | null {
  const cell = terrainCellAt(x, z)
  if (!cell || !Number.isFinite(level.waterLevel)) return null
  // A shared edge belongs to either neighboring rendered quad.
  const { column, row, u, v } = cell
  const painted = isWaterCellPainted(level, column, row)
    || (u === 0 && isWaterCellPainted(level, column - 1, row))
    || (v === 0 && isWaterCellPainted(level, column, row - 1))
    || (u === 0 && v === 0 && isWaterCellPainted(level, column - 1, row - 1))
  if (!painted) return null
  const ground = terrainHeightAt(level, x, z)
  return ground !== null && level.waterLevel > ground ? level.waterLevel : null
}

// Room for the jackalope's 1.85m feet offset while floating 0.35m below the surface.
export const MIN_SWIM_DEPTH = 2.3
export const SWIM_FLOAT_OFFSET = 0.35

/** Body-origin immersion, with a small exit band to avoid surface chatter. */
export function sampleSwimWater(
  level: TerrainLevelDocument,
  x: number,
  y: number,
  z: number,
  wasSwimming = false,
): number | null {
  if (!Number.isFinite(y)) return null
  const surface = waterSurfaceAt(level, x, z)
  if (surface === null) return null
  const ground = terrainHeightAt(level, x, z)!
  if (surface - ground < MIN_SWIM_DEPTH || y < ground) return null
  return y <= surface + (wasSwimming ? 0.25 : 0.05) ? surface : null
}
