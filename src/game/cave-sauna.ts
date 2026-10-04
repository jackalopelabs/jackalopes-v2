import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const CAVE_SAUNA_POSITION = { x: 8.5, z: -187 } as const
export type SaunaBox = { at: [number, number, number]; size: [number, number, number]; turn?: number }
type Box = SaunaBox

// Static cabin surfaces; the interactive door has its own kinematic body.
export const SAUNA_SOLIDS: readonly Box[] = [
  { at: [0, 0.045, 0], size: [4.9, 0.09, 4.8] },
  { at: [0, 1.7, -2.31], size: [4.8, 3.22, 0.18] },
  { at: [-2.31, 1.7, 0], size: [0.18, 3.22, 4.8] },
  { at: [2.31, 1.7, 0], size: [0.18, 3.22, 4.8] },
  { at: [0, 3.38, 0], size: [5, 0.18, 4.94] },
  { at: [-1.66, 1.7, 2.31], size: [1.32, 3.22, 0.18] },
  { at: [1.66, 1.7, 2.31], size: [1.32, 3.22, 0.18] },
  { at: [0, 3.04, 2.31], size: [2, 0.54, 0.18] },
  { at: [0, 0.94, -1.54], size: [3.94, 0.16, 0.82] },
  { at: [0, 0.44, -0.81], size: [3.94, 0.14, 0.53] },
  { at: [-1.76, 0.44, 0.25], size: [0.62, 0.14, 1.6] },
  { at: [1.4, 0.57, 0.66], size: [0.79, 0.96, 0.79] },
  { at: [1.4, 1.17, 0.66], size: [0.68, 0.26, 0.68] },
]

export const SAUNA_DOOR_HINGE = { x: -1, z: 2.31 } as const
export const SAUNA_DOOR_SIZE = [1.88, 2.68, .07] as const
export function saunaDoorPose(angle: number): SaunaBox {
  return { at: [SAUNA_DOOR_HINGE.x + Math.cos(angle) * .94, 1.43,
    SAUNA_DOOR_HINGE.z - Math.sin(angle) * .94], size: [...SAUNA_DOOR_SIZE], turn: angle }
}

type Position = { x: number; y: number; z: number }
export function canUseSaunaDoor(floor: number, player: Position): boolean {
  if (![floor, player.x, player.y, player.z].every(Number.isFinite)) return false
  const x = player.x - CAVE_SAUNA_POSITION.x, z = player.z - CAVE_SAUNA_POSITION.z
  if (player.y < floor + .4 || player.y > floor + 3.5) return false
  const inside = Math.abs(x) < 2.2 && Math.abs(z) < 2.2
  return inside || Math.hypot(x, z - SAUNA_DOOR_HINGE.z) < 3.2
}

export function isInSaunaDoorSweep(floor: number, player: Position): boolean {
  if (![floor, player.x, player.y, player.z].every(Number.isFinite) || player.y < floor + .4 || player.y > floor + 4) return false
  const x = player.x - CAVE_SAUNA_POSITION.x - SAUNA_DOOR_HINGE.x
  const z = player.z - CAVE_SAUNA_POSITION.z - SAUNA_DOOR_HINGE.z
  return x > -.55 && z > -.55 && Math.hypot(Math.max(0, x), Math.max(0, z)) < 2.43
}

export function isInsideSauna(floor: number, point: Position): boolean {
  return Number.isFinite(floor) && Math.abs(point.x - CAVE_SAUNA_POSITION.x) < 2.2 &&
    Math.abs(point.z - CAVE_SAUNA_POSITION.z) < 2.2 && point.y > floor + .08 && point.y < floor + 3.29
}

function batchBoxes(boxes: Box[], color: string) {
  const base = new THREE.Color(color)
  const pieces = boxes.map(({ at, size }, i) => {
    const piece = new THREE.BoxGeometry(...size).translate(...at)
    const tint = base.clone().multiplyScalar(0.91 + (Math.sin(i * 7.3) + 1) * 0.075)
    piece.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: piece.getAttribute('position').count }, () => [tint.r, tint.g, tint.b]).flat(), 3))
    return piece
  })
  const merged = mergeGeometries(pieces, false)!
  pieces.forEach(piece => piece.dispose())
  return merged
}

/** Static cedar boards are batched, with a separate open entrance and visible interior. */
export function createSaunaGeometries() {
  const walls: Box[] = [], floor: Box[] = [], benches: Box[] = [], trim: Box[] = []
  for (let i = 0; i < 21; i++) {
    const x = -2.2 + i * .22
    walls.push({ at: [x, 1.7, -2.31], size: [.211, 3.22, .18] })
    floor.push({ at: [x, .045, 0], size: [.211, .09, 4.8] })
    trim.push({ at: [x, 3.38, 0], size: [.211, .18, 4.94] })
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 21; i++) {
      const z = -2.2 + i * .22
      walls.push({ at: [side * 2.31, 1.7, z], size: [.18, 3.22, .211] })
    }
    // Solid lower panels and glass above make the cabin feel enclosed and welcoming.
    for (let i = 0; i < 6; i++) {
      walls.push({ at: [side * (1.1 + i * .22), .4, 2.31], size: [.211, .62, .18] })
    }
    trim.push({ at: [side * 1, 1.7, 2.31], size: [.12, 3.22, .24] },
      { at: [side * 2.31, 1.7, 2.31], size: [.16, 3.22, .24] })
  }
  trim.push({ at: [0, 3.04, 2.31], size: [4.8, .54, .24] },
    { at: [0, 3.36, 2.31], size: [5, .13, .32] })
  for (let i = 0; i < 5; i++) benches.push({ at: [0, .94, -1.86 + i * .16], size: [3.94, .16, .145] })
  for (let i = 0; i < 3; i++) benches.push({ at: [0, .44, -1 + i * .18], size: [3.94, .14, .16] })
  for (let i = 0; i < 3; i++) benches.push({ at: [-1.97 + i * .21, .44, .25], size: [.19, .14, 1.6] })
  for (const x of [-1.68, 1.68]) {
    trim.push({ at: [x, .5, -1.64], size: [.13, .86, .13] },
      { at: [x, .23, -.84], size: [.12, .37, .12] })
  }
  // Cedar backrests, with breathing gaps between the rails.
  for (const y of [1.27, 1.57, 1.87]) benches.push({ at: [0, y, -2.17], size: [3.94, .16, .07] })
  const stoneParts = Array.from({ length: 12 }, (_, i) => {
    const rock = new THREE.IcosahedronGeometry(1, 1)
    const ring = i < 7 ? .24 : .14, angle = i * 2.4
    rock.scale(.12 + i % 3 * .022, .11, .13)
    rock.rotateY(angle)
    rock.translate(1.4 + Math.cos(angle) * ring, i < 7 ? 1.08 : 1.2, .66 + Math.sin(angle) * ring)
    return rock
  })
  const stones = mergeGeometries(stoneParts, false)!
  stoneParts.forEach(piece => piece.dispose())
  return { walls: batchBoxes(walls, '#b87543'), floor: batchBoxes(floor, '#b8814e'),
    benches: batchBoxes(benches, '#dfae71'), trim: batchBoxes(trim, '#754a31'), stones }
}
