import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { caveFloorAt, caveCeilingAt } from './adventure-caves'
import { MINERAL_STONE_COLORS } from './cave-hot-tub'
import { RABBIT_HOLE_POSITION, RABBIT_HOLE_OUTLINE, isInRabbitHoleFootprint, splitRabbitHoleRimEdge } from './rabbit-hole-opening'
import { terrainHeightAt } from './terrain/water-physics'
import type { TerrainLevelDocument } from './terrain/level-document'

export const RABBIT_STEP_RADIUS = 1.1
export const RABBIT_STEP_MAX_RISE = .78
export type RabbitStep = { x: number; y: number; z: number; angle: number }
export type RabbitHoleLayout = { floor: number; roof: number; surface: number; top: number; rise: number;
  steps: RabbitStep[]; rim: { x: number; y: number; z: number }[]; exit: { x: number; y: number; z: number } }
const layoutCache = new WeakMap<TerrainLevelDocument, RabbitHoleLayout>()

export function rabbitHoleLayout(level: TerrainLevelDocument): RabbitHoleLayout {
  const cached = layoutCache.get(level)
  if (cached) return cached
  const { x, z } = RABBIT_HOLE_POSITION
  const floor = caveFloorAt(level, x, z)!
  const roof = caveCeilingAt(level, x, z)!
  const rim = RABBIT_HOLE_OUTLINE.flatMap((a, i) => {
    const edge = splitRabbitHoleRimEdge(a, RABBIT_HOLE_OUTLINE[(i + 1) % RABBIT_HOLE_OUTLINE.length])
    return edge.slice(0, -1).map(([px, pz]) => ({ x: px, y: terrainHeightAt(level, px, pz)! - .02, z: pz }))
  })
  const surface = Math.max(...rim.map(point => point.y))
  const top = surface + .18
  const count = Math.max(1, Math.ceil((top - floor - .32) / RABBIT_STEP_MAX_RISE))
  const rise = (top - floor - .32) / count
  // Finish on the high side of sculpted ground, avoiding a drop at the top landing.
  const highRim = rim.reduce((a, b) => b.y > a.y ? b : a)
  const exitAngle = Math.atan2(highRim.z - z, highRim.x - x)
  const initialAngle = Math.PI / 2, nominalTurn = count * Math.PI / 3
  const correction = Math.atan2(Math.sin(exitAngle - initialAngle - nominalTurn),
    Math.cos(exitAngle - initialAngle - nominalTurn))
  const angleStep = (nominalTurn + correction) / count
  const steps: RabbitStep[] = Array.from({ length: count + 1 }, (_, i) => {
    const angle = initialAngle + i * angleStep
    return { x: x + Math.cos(angle) * RABBIT_STEP_RADIUS, y: floor + .32 + i * rise,
      z: z + Math.sin(angle) * RABBIT_STEP_RADIUS, angle }
  })
  const last = steps[steps.length - 1]
  const exit = { x: x + Math.cos(last.angle) * 3.7, y: terrainHeightAt(level,
    x + Math.cos(last.angle) * 3.7, z + Math.sin(last.angle) * 3.7)! - .02,
    z: z + Math.sin(last.angle) * 3.7 }
  const layout = { floor, roof, surface, top, rise, steps, rim, exit }
  layoutCache.set(level, layout)
  return layout
}

export function isInRabbitHoleShaft(level: TerrainLevelDocument, point: { x: number; y: number; z: number }): boolean {
  return isInRabbitHoleFootprint(point.x, point.z) && Number.isFinite(point.y) &&
    point.y > rabbitHoleLayout(level).floor - .5 && point.y < rabbitHoleLayout(level).surface + 1.7
}

function tint(geometry: THREE.BufferGeometry, index: number, pale = .35) {
  geometry.deleteAttribute('uv')
  const color = new THREE.Color(MINERAL_STONE_COLORS.rock).lerp(new THREE.Color(MINERAL_STONE_COLORS.pale), pale)
  if (index % 4 === 0) color.lerp(new THREE.Color(MINERAL_STONE_COLORS.mineral), .3)
  color.multiplyScalar(.92 + Math.sin(index * 7.1) * .08)
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(
    Array.from({ length: geometry.getAttribute('position').count }, () => [color.r, color.g, color.b]).flat(), 3))
  return geometry
}

/** Flat, worn mineral-stone treads have matching convex collision hulls. */
function tread(step: RabbitStep, index: number, radialWidth = 1.25, tangentialWidth = 1, thickness = .44) {
  const geometry = new THREE.CylinderGeometry(1, 1.035, thickness, 10)
  const vertices = geometry.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i), wear = 1 + Math.sin(x * 7 + z * 5 + index) * .015
    vertices.setXYZ(i, x * wear, vertices.getY(i), z * wear)
  }
  geometry.scale(tangentialWidth / 2, 1, radialWidth / 2)
    .rotateY(-step.angle - Math.PI / 2).translate(step.x, step.y - thickness / 2, step.z)
  geometry.computeVertexNormals()
  return tint(geometry, index, .48)
}

function mergeAndDispose(parts: THREE.BufferGeometry[]) {
  const result = mergeGeometries(parts, false)!
  parts.forEach(part => part.dispose())
  return result
}

export function createRabbitHoleGeometries(level: TerrainLevelDocument) {
  const layout = rabbitHoleLayout(level), { x, z } = RABBIT_HOLE_POSITION
  const stepParts = layout.steps.map((step, i) => tread(step, i))
  const last = layout.steps[layout.steps.length - 1]
  // A short stone landing joins the final hop to the ordinary surface terrain.
  stepParts.push(tread({ ...last, x: x + Math.cos(last.angle) * 1.9,
    z: z + Math.sin(last.angle) * 1.9 }, stepParts.length, 2.15, 1.35, .28))
  const treadPoints = stepParts.map(part => new Float32Array(part.getAttribute('position').array))
  const steps = mergeAndDispose(stepParts)
  const pillar: THREE.BufferGeometry[] = [], collar: THREE.BufferGeometry[] = []
  for (let y = layout.floor + .5, i = 0; y < layout.top - .8; y += 1.15, i++) {
    const rock = new THREE.IcosahedronGeometry(1, 1).scale(.46, .76, .46)
      .rotateY(i * .71).translate(x, y, z)
    pillar.push(tint(rock, i, .22))
  }
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI * 2 / 16, px = x + Math.cos(angle) * 2.62, pz = z + Math.sin(angle) * 2.62
    const y = terrainHeightAt(level, px, pz)! - .02
    const rock = new THREE.IcosahedronGeometry(1, 1).scale(.38, .26 + i % 3 * .025, .35)
      .rotateY(angle + i * .37).translate(px, y + .12, pz)
    collar.push(tint(rock, i, .48))
  }
  const shaftVertices: number[] = []
  for (let i = 0; i < layout.rim.length; i++) {
    const a = layout.rim[i], b = layout.rim[(i + 1) % layout.rim.length]
    // The existing bedroom walls remain below this chimney; only its roof is opened.
    shaftVertices.push(a.x, layout.roof, a.z, b.x, layout.roof, b.z, b.x, b.y, b.z,
      a.x, layout.roof, a.z, b.x, b.y, b.z, a.x, a.y, a.z)
  }
  const shaft = new THREE.BufferGeometry()
  shaft.setAttribute('position', new THREE.Float32BufferAttribute(shaftVertices, 3)); shaft.computeVertexNormals()
  const guides = layout.steps.filter((_, i) => i % 3 === 0).map(step =>
    new THREE.IcosahedronGeometry(.07, 0).translate(x + Math.cos(step.angle) * .49, step.y + .08,
      z + Math.sin(step.angle) * .49))
  return { layout, steps, pillar: mergeAndDispose(pillar), collar: mergeAndDispose(collar), shaft,
    guides: mergeAndDispose(guides), treadPoints }
}
