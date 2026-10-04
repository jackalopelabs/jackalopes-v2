import * as THREE from 'three'
import { caveLayout } from './adventure-caves'
import type { TerrainLevelDocument } from './terrain/level-document'

export const WATERSLIDE_RIDER_OFFSET = 1.95
export const WATERSLIDE_HALF_WIDTH = 1.7
export const WATERSLIDE_BOARDING_RANGE = 2.4

export type WaterslideLayout = {
  /** Open-channel bottom, in world coordinates. Not the rider's body origin. */
  curve: THREE.CatmullRomCurve3
  length: number
  start: THREE.Vector3
  end: THREE.Vector3
  waterLevel: number
  halfWidth?: number
  segments?: number
  rideSpeed?: number
}

type Position = { x: number; y: number; z: number }

/** Fixed authored bends are identical for every client and terrain revision.
 * Only the cave's base elevation changes. Keeping the first run level avoids
 * burying a smooth spline in the flat upper room before the descent begins.
 * The final channel is submerged enough to hand off directly to swimming.
 * Renderer owns its mesh/collider geometries; this helper allocates no GPU data.
 */
export function createWaterslide(level: TerrainLevelDocument): WaterslideLayout {
  const { floorY, waterLevel } = caveLayout(level)
  const knots: [number, number, number][] = [
    [-5, 0.12, -70],
    [-5.4, 0.12, -74.5],
    [-5.8, -0.05, -78],
    [-6, -0.9, -83],
    [-4, -3, -94],
    [6, -6.6, -106],
    [-6, -8.2, -122],
    [5, -9.5, -135],
    [0, -11.4, -145],
  ]
  const curve = new THREE.CatmullRomCurve3(knots.map(([x, y, z]) => new THREE.Vector3(x, floorY + y, z)), false, 'centripetal')
  curve.arcLengthDivisions = 800
  curve.updateArcLengths()
  return { curve, length: curve.getLength(), start: curve.getPoint(0), end: curve.getPoint(1), waterLevel }
}

export function canBoardWaterslide(layout: WaterslideLayout, position: Position): boolean {
  if (![position.x, position.y, position.z].every(Number.isFinite)) return false
  return Math.hypot(position.x - layout.start.x, position.z - layout.start.z) <= WATERSLIDE_BOARDING_RANGE
    && Math.abs(position.y - layout.start.y - WATERSLIDE_RIDER_OFFSET) <= WATERSLIDE_BOARDING_RANGE
}

/** Arc-length sampling gives a steady ride speed through the tighter S-bends. */
export function sampleWaterslideRide(layout: WaterslideLayout, progress: number) {
  const t = THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1)
  const position = layout.curve.getPointAt(t)
  position.y += WATERSLIDE_RIDER_OFFSET
  const direction = layout.curve.getTangentAt(t).normalize()
  const horizontalDirection = new THREE.Vector3(direction.x, 0, direction.z).normalize()
  return { position, direction, horizontalDirection, heading: Math.atan2(direction.x, direction.z) + Math.PI }
}
