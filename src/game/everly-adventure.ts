export type EverlyGoal = 'flowers' | 'fish' | 'clouds' | 'castle'
export const EVERLY_GOALS: readonly { id: EverlyGoal; label: string; target: [number, number, number]; radius: number }[] = [
  { id: 'flowers', label: 'Find the rainbow flowers', target: [-30, 0, 8], radius: 5 },
  { id: 'fish', label: 'Say hello to the river fish', target: [0, -1.2, 20], radius: 7 },
  { id: 'clouds', label: 'Reach the castle clouds', target: [-4, 9.35, -59], radius: 5.2 },
  { id: 'castle', label: 'Open the castle doors', target: [0, 1.8, -62], radius: 6 },
]

export const EVERLY_RIVER = { left: -7, right: 7, nearZ: -48, farZ: 46, centerZ: -1, halfLength: 47, surface: 0.15, bed: -4 } as const
export const EVERLY_RIVER_BANKS = [
  { centerX: -38.5, centerZ: -20, halfWidth: 31.5, halfDepth: 150 },
  { centerX: 38.5, centerZ: -20, halfWidth: 31.5, halfDepth: 150 },
] as const
export const EVERLY_DRY_GROUND_CAPS = [
  { id: 'river-exit', centerX: 0, centerZ: 54, halfWidth: 7, halfDepth: 8 },
  { id: 'castle-approach', centerX: 0, centerZ: -53, halfWidth: 7, halfDepth: 5 },
] as const
/** Rotated solid ramps start inside the channel so a floating avatar climbs before the bank wall. */
export const EVERLY_RIVER_EXIT_RAMPS = [
  { side: -1, centerX: -4.8, centerY: -2, centerZ: 42, halfWidth: 3.6, halfHeight: 0.28, halfDepth: 4.5, rotationZ: -0.65 },
  { side: 1, centerX: 4.8, centerY: -2, centerZ: 42, halfWidth: 3.6, halfHeight: 0.28, halfDepth: 4.5, rotationZ: 0.65 },
] as const
export const EVERLY_CASTLE_FLOOR = { centerX: 0, centerY: 0.05, centerZ: -68, halfWidth: 14, halfDepth: 13, halfHeight: 0.1 } as const
export const EVERLY_CASTLE_FRONT_WALLS = [
  { centerX: -7.5, halfWidth: 4.5 },
  { centerX: 7.5, halfWidth: 4.5 },
] as const

export function isEverlyDoorPress(pressed: boolean, wasPressed: boolean): boolean {
  return pressed && !wasPressed
}

/** Walkable solid ground regions represented by fixed scene colliders. */
export function everlyGroundRegionAt(x: number, z: number): string | null {
  if (![x, z].every(Number.isFinite)) return null
  if (EVERLY_RIVER_BANKS.some(bank => Math.abs(x - bank.centerX) <= bank.halfWidth && Math.abs(z - bank.centerZ) <= bank.halfDepth)) return 'bank'
  if (Math.abs(x - EVERLY_CASTLE_FLOOR.centerX) <= EVERLY_CASTLE_FLOOR.halfWidth &&
      Math.abs(z - EVERLY_CASTLE_FLOOR.centerZ) <= EVERLY_CASTLE_FLOOR.halfDepth) return 'castle-floor'
  const cap = EVERLY_DRY_GROUND_CAPS.find(region => Math.abs(x - region.centerX) <= region.halfWidth && Math.abs(z - region.centerZ) <= region.halfDepth)
  return cap?.id ?? null
}

/** World-space top of the rotated ramp, or null outside its top-face span. */
export function everlyRampTopAtWorldX(ramp: typeof EVERLY_RIVER_EXIT_RAMPS[number], x: number): number | null {
  const sine = Math.sin(ramp.rotationZ), cosine = Math.cos(ramp.rotationZ)
  const localX = (x - ramp.centerX + ramp.halfHeight * sine) / cosine
  if (Math.abs(localX) > ramp.halfWidth) return null
  return ramp.centerY + localX * sine + ramp.halfHeight * cosine
}

/** Body-origin swim sample for Everly's private river. It never reads the shared terrain document. */
export function everlyWaterSurfaceAt(x: number, y: number, z: number, wasSwimming = false): number | null {
  if (![x, y, z].every(Number.isFinite) || x < EVERLY_RIVER.left || x > EVERLY_RIVER.right ||
      z < EVERLY_RIVER.nearZ || z > EVERLY_RIVER.farZ || y < EVERLY_RIVER.bed ||
      y > EVERLY_RIVER.surface + (wasSwimming ? 0.25 : 0.05)) return null
  return EVERLY_RIVER.surface
}

export function reachedEverlyGoals(position: { x: number; y: number; z: number }, completed: ReadonlySet<EverlyGoal>): EverlyGoal[] {
  return EVERLY_GOALS.filter(goal => goal.id !== 'castle' && !completed.has(goal.id) &&
    Math.hypot(position.x - goal.target[0], position.y - goal.target[1], position.z - goal.target[2]) <= goal.radius)
    .map(goal => goal.id)
}

export function resetEverlyGoals(): Set<EverlyGoal> { return new Set() }

/** Deterministic broad cloud stepping stones from the near shore to the castle approach. */
export function createEverlyCloudTrail() {
  return Array.from({ length: 15 }, (_, index) => {
    const t = index / 14
    return {
      position: [-31 + t * 27 + Math.sin(index * 0.72) * 1.7, 0.65 + t * 8.7, 8 - t * 67] as [number, number, number],
      width: index === 14 ? 8 : 6.2,
      depth: index === 14 ? 7 : 5.6,
    }
  })
}

export function isEverlyMode(value: string | null | undefined): boolean { return value === 'everly' }
