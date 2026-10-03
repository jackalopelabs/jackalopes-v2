export const TERRAIN_SIZE = 800
export const TERRAIN_SEGMENTS = 70
export const TERRAIN_VERTEX_COUNT = (TERRAIN_SEGMENTS + 1) ** 2
export const TERRAIN_STORAGE_KEY = 'jackalopes.terrain.adventure-valley.v1'
export const TERRAIN_API_URL = '/api/terrain/adventure-valley'

export type TerrainTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'water' | 'erase-water'

export type TerrainLevelDocument = {
  format: 'jackalopes-terrain'
  version: 2
  name: string
  size: number
  segments: number
  updatedAt: string
  heightOffsets: number[]
  waterLevel: number
  waterMask: number[]
}

const MAP_SIZE = 60
const FOREST_PERIMETER = 80
const DIGITAL_DESERT_START = 100
const DESERT_RIM_START = 200
const RIM_PEAK = 280
const RIM_HEIGHT = 45
const VALLEY_BOTTOM = 380
const VALLEY_DEPTH = 100
const TERRAIN_NOISE_SCALE = 0.015

export function createTerrainLevel(name = 'Adventure Valley'): TerrainLevelDocument {
  return {
    format: 'jackalopes-terrain',
    version: 2,
    name,
    size: TERRAIN_SIZE,
    segments: TERRAIN_SEGMENTS,
    updatedAt: new Date().toISOString(),
    heightOffsets: Array(TERRAIN_VERTEX_COUNT).fill(0),
    waterLevel: 2,
    waterMask: Array(TERRAIN_VERTEX_COUNT).fill(0),
  }
}

export function normalizeTerrainLevel(value: unknown): TerrainLevelDocument {
  if (!value || typeof value !== 'object') return createTerrainLevel()

  const candidate = value as Partial<TerrainLevelDocument> & { version?: number }
  if (
    candidate.format !== 'jackalopes-terrain' ||
    (candidate.version !== 1 && candidate.version !== 2) ||
    candidate.size !== TERRAIN_SIZE ||
    candidate.segments !== TERRAIN_SEGMENTS ||
    !Array.isArray(candidate.heightOffsets) ||
    candidate.heightOffsets.length !== TERRAIN_VERTEX_COUNT
  ) {
    throw new Error('This terrain file does not match the current Jackalopes map grid.')
  }

  return {
    format: 'jackalopes-terrain',
    version: 2,
    name: typeof candidate.name === 'string' && candidate.name.trim()
      ? candidate.name.trim().slice(0, 80)
      : 'Adventure Valley',
    size: TERRAIN_SIZE,
    segments: TERRAIN_SEGMENTS,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    heightOffsets: candidate.heightOffsets.map((height) => {
      const numericHeight = Number(height)
      return Number.isFinite(numericHeight) ? Math.max(-120, Math.min(120, numericHeight)) : 0
    }),
    waterLevel: Number.isFinite(Number(candidate.waterLevel))
      ? Math.max(-100, Math.min(80, Number(candidate.waterLevel)))
      : 2,
    waterMask: Array.isArray(candidate.waterMask) && candidate.waterMask.length === TERRAIN_VERTEX_COUNT
      ? candidate.waterMask.map((amount) => {
          const numericAmount = Number(amount)
          return Number.isFinite(numericAmount) ? Math.max(0, Math.min(1, numericAmount)) : 0
        })
      : Array(TERRAIN_VERTEX_COUNT).fill(0),
  }
}

export function loadTerrainLevel(): TerrainLevelDocument {
  if (typeof window === 'undefined') return createTerrainLevel()

  try {
    const stored = window.localStorage.getItem(TERRAIN_STORAGE_KEY)
    return stored ? normalizeTerrainLevel(JSON.parse(stored)) : createTerrainLevel()
  } catch (error) {
    console.warn('[Terrain] Ignoring an invalid saved level.', error)
    return createTerrainLevel()
  }
}

export function loadStoredTerrainLevel(): TerrainLevelDocument | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(TERRAIN_STORAGE_KEY)
    return stored ? normalizeTerrainLevel(JSON.parse(stored)) : null
  } catch (error) {
    console.warn('[Terrain] Ignoring an invalid saved level.', error)
    return null
  }
}

export function installTerrainLevel(level: TerrainLevelDocument): TerrainLevelDocument {
  const normalized = normalizeTerrainLevel(level)
  window.localStorage.setItem(TERRAIN_STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent('jackalopes:terrain-synced', { detail: normalized }))
  return normalized
}

export function saveTerrainLevel(level: TerrainLevelDocument): TerrainLevelDocument {
  const normalized = normalizeTerrainLevel({
    ...level,
    updatedAt: new Date().toISOString(),
  })
  window.localStorage.setItem(TERRAIN_STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent('jackalopes:terrain-saved', { detail: normalized }))
  return normalized
}

export async function loadSharedTerrainLevel(): Promise<TerrainLevelDocument | null> {
  try {
    const response = await window.fetch(TERRAIN_API_URL, { cache: 'no-store' })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Shared terrain request failed (${response.status})`)
    return normalizeTerrainLevel(await response.json())
  } catch (error) {
    console.warn('[Terrain] Shared level is unavailable; using the browser copy.', error)
    return null
  }
}

export async function publishTerrainLevel(level: TerrainLevelDocument): Promise<TerrainLevelDocument> {
  const response = await window.fetch(TERRAIN_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeTerrainLevel(level)),
  })

  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(result?.error || `Shared terrain save failed (${response.status})`)
  }

  return installTerrainLevel(normalizeTerrainLevel(await response.json()))
}

export async function syncSharedTerrainLevel(): Promise<boolean> {
  const shared = await loadSharedTerrainLevel()
  if (!shared) return false

  const local = loadStoredTerrainLevel()
  const sharedTime = Date.parse(shared.updatedAt)
  const localTime = local ? Date.parse(local.updatedAt) : Number.NEGATIVE_INFINITY
  if (local && Number.isFinite(localTime) && sharedTime <= localTime) return false

  installTerrainLevel(shared)
  return true
}

export async function initializeSharedTerrainLevel(): Promise<void> {
  const shared = await loadSharedTerrainLevel()
  const local = loadStoredTerrainLevel()

  if (shared) {
    const sharedTime = Date.parse(shared.updatedAt)
    const localTime = local ? Date.parse(local.updatedAt) : Number.NEGATIVE_INFINITY
    if (!local || !Number.isFinite(localTime) || sharedTime > localTime) installTerrainLevel(shared)
    return
  }

  // One-time migration from the original browser-only editor. An untouched
  // default map is never promoted, so another player's empty browser cannot
  // overwrite Mason's existing sculpted terrain during rollout.
  if (
    local?.heightOffsets.some((height) => Math.abs(height) > 0.001) ||
    local?.waterMask.some((amount) => amount > 0.01)
  ) {
    try {
      await publishTerrainLevel(local)
    } catch (error) {
      console.warn('[Terrain] Existing browser map could not be promoted to the shared level.', error)
    }
  }
}

export function clearTerrainLevel(): TerrainLevelDocument {
  if (typeof window !== 'undefined') window.localStorage.removeItem(TERRAIN_STORAGE_KEY)
  return createTerrainLevel()
}

export function terrainVertexIndex(column: number, row: number): number {
  return row * (TERRAIN_SEGMENTS + 1) + column
}

export function terrainVertexWorldPosition(column: number, row: number): [number, number] {
  const step = TERRAIN_SIZE / TERRAIN_SEGMENTS
  return [
    -TERRAIN_SIZE / 2 + column * step,
    -TERRAIN_SIZE / 2 + row * step,
  ]
}

export function sampleBaseTerrainHeight(x: number, worldZ: number): number {
  const distFromCenter = Math.sqrt(x * x + worldZ * worldZ)
  if (distFromCenter < MAP_SIZE) return 0

  const nx = x * TERRAIN_NOISE_SCALE
  const nz = worldZ * TERRAIN_NOISE_SCALE
  let height = 0

  if (distFromCenter < FOREST_PERIMETER) {
    const progress = (distFromCenter - MAP_SIZE) / (FOREST_PERIMETER - MAP_SIZE)
    height = Math.sin(nx * 2) * Math.cos(nz * 2) * 0.2 * progress
    height += Math.sin(nx * 4) * Math.cos(nz * 3) * 0.1 * progress
  } else if (distFromCenter < DIGITAL_DESERT_START) {
    const progress = (distFromCenter - FOREST_PERIMETER) / (DIGITAL_DESERT_START - FOREST_PERIMETER)
    height = Math.sin(nx * 2) * Math.cos(nz * 2) * 0.15 * (1 - progress)
  } else if (distFromCenter < DESERT_RIM_START) {
    height = Math.sin(nx * 0.5) * Math.cos(nz * 0.3) * 0.05
    height += Math.sin(nx * 8) * Math.cos(nz * 7) * 0.02
  } else if (distFromCenter < RIM_PEAK) {
    const progress = (distFromCenter - DESERT_RIM_START) / (RIM_PEAK - DESERT_RIM_START)
    const eased = progress * progress * (3 - 2 * progress)
    height = eased * RIM_HEIGHT

    const mountainBase = Math.sin(nx * 0.8) * Math.cos(nz * 0.7) * 1.2
    const ridges = Math.abs(Math.sin(nx * 1.5 + nz * 0.3)) * Math.abs(Math.cos(nz * 1.2 + nx * 0.4)) * 0.8
    const peaks = Math.abs(Math.sin(nx * 2.5) * Math.cos(nz * 2.2)) * 0.6
    const rockDetail = Math.sin(nx * 6) * Math.cos(nz * 5) * 0.2
    const crags = Math.abs(Math.sin(nx * 4 + nz * 3)) * 0.4
    height += (mountainBase + ridges + peaks + rockDetail + crags) * eased * 12

    const spireNoise = Math.sin(nx * 3.7) * Math.cos(nz * 3.3)
    if (spireNoise > 0.7) height += (spireNoise - 0.7) * 30 * eased
  } else if (distFromCenter < VALLEY_BOTTOM) {
    const progress = (distFromCenter - RIM_PEAK) / (VALLEY_BOTTOM - RIM_PEAK)
    const eased = progress * progress * (3 - 2 * progress)
    height = RIM_HEIGHT - eased * (RIM_HEIGHT + VALLEY_DEPTH)

    const cliffBase = Math.sin(nx * 0.9) * Math.cos(nz * 0.8)
    const cliffEdges = Math.abs(Math.sin(nx * 2 + nz * 0.5)) * 0.7
    const striations = Math.abs(Math.sin(nx * 3.5) * Math.cos(nz * 3)) * 0.5
    const outcrops = Math.sin(nx * 5) * Math.cos(nz * 4.5) * 0.25
    const inverse = 1 - eased
    height += (cliffBase + cliffEdges + striations + outcrops) * (0.4 + inverse * 0.6) * 15

    const ridgeNoise = Math.abs(Math.sin(nx * 0.6 + nz * 0.5))
    if (ridgeNoise > 0.6) height += (ridgeNoise - 0.6) * 20 * inverse
  } else {
    height = -VALLEY_DEPTH
    const floorNoise = Math.sin(nx * 1.2) * Math.cos(nz * 0.9) * 0.4
    const floorDetail = Math.sin(nx * 3) * Math.cos(nz * 2.8) * 0.2
    height += (floorNoise + floorDetail) * 12

    const channelNoise = Math.sin(nx * 0.3 + nz * 0.2)
    if (Math.abs(channelNoise) < 0.15) height -= 8

    const edgeDist = TERRAIN_SIZE * 0.45
    if (distFromCenter > edgeDist) {
      const edgeFade = (distFromCenter - edgeDist) / (TERRAIN_SIZE * 0.5 - edgeDist)
      height *= 1 - Math.min(1, edgeFade)
    }
  }

  return height
}

export function terrainHeightAtVertex(level: TerrainLevelDocument, column: number, row: number): number {
  const [x, z] = terrainVertexWorldPosition(column, row)
  return sampleBaseTerrainHeight(x, z) + level.heightOffsets[terrainVertexIndex(column, row)]
}
