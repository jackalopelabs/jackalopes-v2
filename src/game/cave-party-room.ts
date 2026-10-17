import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CAVE_BODY_OUTLINE, caveFloorAt, caveCeilingAt, isWithinCaveFootprint } from './adventure-caves'
import type { TerrainLevelDocument } from './terrain/level-document'
import { CAVE_SAUNA_POSITION } from './cave-sauna'

const LOW_PARTY_BUDGET = { beams: 4, balloons: 3, stars: 44, haze: 6, lights: 1 } as const
const FULL_PARTY_BUDGET = { beams: 12, balloons: 5, stars: 132, haze: 18, lights: 3 } as const
export const partyQualityBudget = (quality: string) => quality === 'low' ? LOW_PARTY_BUDGET : FULL_PARTY_BUDGET
export const PARTY_FRONT_Z = -172
// Inset from the back-left diagonal rock wall, facing the hot tub/bedroom aisle.
export const PARTY_SWITCH = { x: -22.8, z: -187.75, height: 1.45, yaw: Math.atan2(.625, .781) } as const
export const PARTY_BALLOONS = [[-18, 4.3, -185], [-11, 5.5, -183], [-3, 4.8, -180], [14, 5.1, -179], [19, 4.6, -181]] as const
export type PartyPoint = { x: number; y: number; z: number }
export function canUsePartySwitch(floor: number, player: PartyPoint): boolean {
  return Number.isFinite(floor) && Number.isFinite(player.x) && Number.isFinite(player.y) && Number.isFinite(player.z)
    && player.y >= floor + .4 && player.y <= floor + 4.2
    && Math.hypot(player.x - PARTY_SWITCH.x, player.z - PARTY_SWITCH.z) < 2.8
    && isWithinCaveFootprint(player.x, player.z)
}
export function isPartyAir(level: TerrainLevelDocument, point: PartyPoint, margin = 0): boolean {
  const floor = caveFloorAt(level, point.x, point.z), roof = caveCeilingAt(level, point.x, point.z)
  return floor !== null && roof !== null && point.z < PARTY_FRONT_Z - margin
    && point.y > floor + margin && point.y < roof - margin
    && !(Math.abs(point.x - CAVE_SAUNA_POSITION.x) < 2.65 + margin &&
      Math.abs(point.z - CAVE_SAUNA_POSITION.z) < 2.65 + margin && point.y < floor + 3.7 + margin)
}

/** Clip copied shell triangles at the room entrance; keep the real walls, roof and burrow hole. */
export function createPartyProjectionGeometry(shell: readonly THREE.BufferGeometry[]) {
  const output: number[] = []
  for (const geometry of shell) {
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      let polygon: THREE.Vector3[] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i + k) : i + k))
      const clipped: THREE.Vector3[] = []
      for (let k = 0; k < polygon.length; k++) {
        const a = polygon[k], b = polygon[(k + 1) % polygon.length]
        if (a.z <= PARTY_FRONT_Z) clipped.push(a)
        if ((a.z < PARTY_FRONT_Z) !== (b.z < PARTY_FRONT_Z)) clipped.push(a.clone().lerp(b, (PARTY_FRONT_Z - a.z) / (b.z - a.z)))
      }
      polygon = clipped
      for (let k = 1; k < polygon.length - 1; k++) output.push(...polygon[0].toArray(), ...polygon[k].toArray(), ...polygon[k + 1].toArray())
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Thin RGB strips follow the actual rock perimeter, never a rectangle through the cave. */
export function createPartyAccentGeometry(level: TerrainLevelDocument) {
  const parts: THREE.BufferGeometry[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < CAVE_BODY_OUTLINE.length - 1; i++) {
    const [ax, az] = CAVE_BODY_OUTLINE[i], [bx, bz] = CAVE_BODY_OUTLINE[i + 1]
    if (az > -174 || bz > -174 || Math.abs(bx - ax) < .1) continue
    const start = new THREE.Vector3(ax, (caveFloorAt(level, ax + .01, az + .01) ?? caveFloorAt(level, 0, -187)!) + 3.8, az)
    const end = new THREE.Vector3(bx, start.y, bz)
    const direction = end.clone().sub(start)
    const inward = new THREE.Vector3(-direction.z, 0, direction.x).normalize()
    // The outline runs clockwise in XZ; pick the side that actually lies in the cave.
    if (!isWithinCaveFootprint((ax + bx) / 2 + inward.x * .2, (az + bz) / 2 + inward.z * .2)) inward.negate()
    const part = new THREE.CylinderGeometry(.022, .022, direction.length(), 5)
    part.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()))
    part.translate((ax + bx) / 2 + inward.x * .15, start.y, (az + bz) / 2 + inward.z * .15)
    parts.push(part)
  }
  const geometry = mergeGeometries(parts, false)!
  parts.forEach(part => part.dispose())
  return geometry
}

/** Segment clipping without raycast result arrays. Lasers stop inside rock/ceiling and before the sauna. */
export function partyBeamFraction(level: TerrainLevelDocument, from: PartyPoint, to: PartyPoint): number {
  if (!isPartyAir(level, from, .1)) return 0
  let t = 1
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z
  for (let i = 0; i < CAVE_BODY_OUTLINE.length; i++) {
    const a = CAVE_BODY_OUTLINE[i], b = CAVE_BODY_OUTLINE[(i + 1) % CAVE_BODY_OUTLINE.length]
    const ex = b[0] - a[0], ez = b[1] - a[1], cross = dx * ez - dz * ex
    if (Math.abs(cross) < 1e-8) continue
    const qx = a[0] - from.x, qz = a[1] - from.z
    const along = (qx * ez - qz * ex) / cross, edge = (qx * dz - qz * dx) / cross
    if (along > 0 && edge >= 0 && edge <= 1) t = Math.min(t, along)
  }
  if (dz > 0) t = Math.min(t, (PARTY_FRONT_Z - from.z) / dz)
  // The dry grotto has a flat floor and constant ceiling behind z=-172.
  const floor = caveFloorAt(level, from.x, from.z)!, roof = caveCeilingAt(level, from.x, from.z)!
  if (dy > 0) t = Math.min(t, (roof - .12 - from.y) / dy)
  if (dy < 0) t = Math.min(t, (floor + .12 - from.y) / dy)
  // Conservative closed cabin box, including roof. No light fans through its windows/door.
  const sx = CAVE_SAUNA_POSITION.x, sz = CAVE_SAUNA_POSITION.z
  const tx1 = (sx - 2.7 - from.x) / (dx || 1e-12), tx2 = (sx + 2.7 - from.x) / (dx || 1e-12)
  const ty1 = (floor - from.y) / (dy || 1e-12), ty2 = (floor + 3.75 - from.y) / (dy || 1e-12)
  const tz1 = (sz - 2.7 - from.z) / (dz || 1e-12), tz2 = (sz + 2.7 - from.z) / (dz || 1e-12)
  const near = Math.max(0, Math.min(tx1, tx2), Math.min(ty1, ty2), Math.min(tz1, tz2))
  const far = Math.min(1, Math.max(tx1, tx2), Math.max(ty1, ty2), Math.max(tz1, tz2))
  if (near <= far && near > 0) t = Math.min(t, near)
  // Leave a small gap at termination so the finite beam radius cannot protrude.
  return Math.max(0, Math.min(1, t - .06 / Math.max(.01, Math.hypot(dx, dy, dz))))
}
