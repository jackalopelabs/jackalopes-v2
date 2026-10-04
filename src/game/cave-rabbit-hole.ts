import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { caveFloorAt, caveCeilingAt } from './adventure-caves'
import { MINERAL_STONE_COLORS } from './cave-hot-tub'
import { RABBIT_HOLE_POSITION, RABBIT_HOLE_OUTLINE, isInRabbitHoleFootprint, splitRabbitHoleRimEdge } from './rabbit-hole-opening'
import { terrainHeightAt } from './terrain/water-physics'
import type { TerrainLevelDocument } from './terrain/level-document'
import type { WaterslideLayout } from './cave-waterslide'

export const SPIRAL_SLIDE_RADIUS = 1.25
export const SPIRAL_SLIDE_HALF_WIDTH = .72
export type RabbitHoleLayout = { floor: number; roof: number; surface: number; top: number;
  rim: { x: number; y: number; z: number }[]; entryAngle: number; entry: THREE.Vector3 }
const layoutCache = new WeakMap<TerrainLevelDocument, RabbitHoleLayout>()
const slideCache = new WeakMap<TerrainLevelDocument, WaterslideLayout>()

export function rabbitHoleLayout(level: TerrainLevelDocument): RabbitHoleLayout {
  const cached = layoutCache.get(level)
  if (cached) return cached
  const { x, z } = RABBIT_HOLE_POSITION
  const floor = caveFloorAt(level, x, z)!, roof = caveCeilingAt(level, x, z)!
  const rim = RABBIT_HOLE_OUTLINE.flatMap((a, i) => {
    const edge = splitRabbitHoleRimEdge(a, RABBIT_HOLE_OUTLINE[(i + 1) % RABBIT_HOLE_OUTLINE.length])
    return edge.slice(0, -1).map(([px, pz]) => ({ x: px, y: terrainHeightAt(level, px, pz)! - .02, z: pz }))
  })
  const surface = Math.max(...rim.map(point => point.y))
  const highRim = rim.reduce((a, b) => b.y > a.y ? b : a)
  const entryAngle = Math.atan2(highRim.z - z, highRim.x - x)
  const outward = new THREE.Vector3(Math.cos(entryAngle), 0, Math.sin(entryAngle))
  const across = new THREE.Vector3(-outward.z, 0, outward.x)
  const entry = new THREE.Vector3(x, 0, z).addScaledVector(across, SPIRAL_SLIDE_RADIUS).addScaledVector(outward, 3.4)
  let top = surface + .35
  // Keep the entire level boarding approach above the saved terrain, including its sides.
  for (let distance = .7; distance <= 3.7; distance += .15) for (const side of [-.8, 0, .8]) {
    const p = new THREE.Vector3(x, 0, z).addScaledVector(across, SPIRAL_SLIDE_RADIUS + side).addScaledVector(outward, distance)
    top = Math.max(top, terrainHeightAt(level, p.x, p.z)! + .12)
  }
  entry.y = top
  const layout = { floor, roof, surface, top, rim, entryAngle, entry }
  layoutCache.set(level, layout)
  return layout
}

/** A level surface lip, smooth descending helix, and gentle dry run-out behind the tub. */
export function createSpiralWaterslide(level: TerrainLevelDocument): WaterslideLayout {
  const cached = slideCache.get(level)
  if (cached) return cached
  const { floor, top, entryAngle, entry } = rabbitHoleLayout(level), { x, z } = RABBIT_HOLE_POSITION
  const outward = new THREE.Vector3(Math.cos(entryAngle), 0, Math.sin(entryAngle))
  const across = new THREE.Vector3(-outward.z, 0, outward.x)
  const knots = [entry.clone()]
  for (const distance of [2.5, 1.7, .85]) knots.push(new THREE.Vector3(x, top, z)
    .addScaledVector(across, SPIRAL_SLIDE_RADIUS).addScaledVector(outward, distance))
  const startAngle = entryAngle + Math.PI / 2
  const drop = top - floor - .15
  // At least six meters between turns leaves the bunny and raised channel walls clear.
  const turns = Math.max(2, Math.floor(drop / 6.5))
  const endAngle = Math.ceil((startAngle + turns * Math.PI * 2) / (Math.PI * 2)) * Math.PI * 2
  const angleLength = endAngle - startAngle
  const samples = Math.ceil(angleLength / (Math.PI / 18))
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, angle = startAngle + angleLength * t
    knots.push(new THREE.Vector3(x + Math.cos(angle) * SPIRAL_SLIDE_RADIUS, top - drop * t,
      z + Math.sin(angle) * SPIRAL_SLIDE_RADIUS))
  }
  for (const distance of [.7, 1.4, 2.15]) knots.push(new THREE.Vector3(x + SPIRAL_SLIDE_RADIUS,
    floor + .12, z + distance))
  const curve = new THREE.CatmullRomCurve3(knots, false, 'centripetal')
  curve.arcLengthDivisions = Math.max(1800, samples * 8); curve.updateArcLengths()
  const slide = { curve, length: curve.getLength(), start: curve.getPoint(0), end: curve.getPoint(1),
    waterLevel: floor + .12, halfWidth: SPIRAL_SLIDE_HALF_WIDTH, segments: Math.max(224, samples * 2), rideSpeed: 9.5 }
  slideCache.set(level, slide)
  return slide
}

export function isInRabbitHoleShaft(level: TerrainLevelDocument, point: { x: number; y: number; z: number }): boolean {
  return isInRabbitHoleFootprint(point.x, point.z) && Number.isFinite(point.y) &&
    point.y > rabbitHoleLayout(level).floor - .5 && point.y < rabbitHoleLayout(level).top + 1.7
}

function tint(geometry: THREE.BufferGeometry, index: number) {
  geometry.deleteAttribute('uv')
  const color = new THREE.Color(MINERAL_STONE_COLORS.rock).lerp(new THREE.Color(MINERAL_STONE_COLORS.pale), .48)
  if (index % 4 === 0) color.lerp(new THREE.Color(MINERAL_STONE_COLORS.mineral), .3)
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(
    Array.from({ length: geometry.getAttribute('position').count }, () => [color.r, color.g, color.b]).flat(), 3))
  return geometry
}
function mergeAndDispose(parts: THREE.BufferGeometry[]) {
  const result = mergeGeometries(parts, false)!
  parts.forEach(part => part.dispose())
  return result
}

export function createRabbitHoleGeometries(level: TerrainLevelDocument) {
  const layout = rabbitHoleLayout(level), { x, z } = RABBIT_HOLE_POSITION
  const collar: THREE.BufferGeometry[] = [], guides: THREE.BufferGeometry[] = []
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI * 2 / 16, px = x + Math.cos(angle) * 2.62, pz = z + Math.sin(angle) * 2.62
    // Leave a gap for the new boarding ramp instead of placing stones through the flume.
    const outward = (px - x) * Math.cos(layout.entryAngle) + (pz - z) * Math.sin(layout.entryAngle)
    const across = -(px - x) * Math.sin(layout.entryAngle) + (pz - z) * Math.cos(layout.entryAngle)
    if (outward > .4 && Math.abs(across - SPIRAL_SLIDE_RADIUS) < 1.1) continue
    const y = terrainHeightAt(level, px, pz)! - .02
    collar.push(tint(new THREE.IcosahedronGeometry(1, 1).scale(.38, .26 + i % 3 * .025, .35)
      .rotateY(angle + i * .37).translate(px, y + .12, pz), i))
  }
  const shaftVertices: number[] = []
  for (let i = 0; i < layout.rim.length; i++) {
    const a = layout.rim[i], b = layout.rim[(i + 1) % layout.rim.length]
    shaftVertices.push(a.x, layout.roof, a.z, b.x, layout.roof, b.z, b.x, b.y, b.z,
      a.x, layout.roof, a.z, b.x, b.y, b.z, a.x, a.y, a.z)
  }
  const shaft = new THREE.BufferGeometry()
  shaft.setAttribute('position', new THREE.Float32BufferAttribute(shaftVertices, 3)); shaft.computeVertexNormals()
  for (let y = layout.floor + 2; y < layout.top; y += 6.5)
    guides.push(new THREE.TorusGeometry(.29, .035, 4, 12).rotateX(Math.PI / 2).translate(x, y, z))
  const slide = createSpiralWaterslide(level), direction = slide.curve.getTangentAt(0)
  const deck = new THREE.BoxGeometry(1.75, .22, 1.8).rotateY(Math.atan2(direction.x, direction.z))
    .translate(slide.start.x, slide.start.y - .11, slide.start.z)
  const outward = new THREE.Vector3(Math.cos(layout.entryAngle), 0, Math.sin(layout.entryAngle))
  const across = new THREE.Vector3(-outward.z, 0, outward.x)
  const ramp = new THREE.PlaneGeometry(1.75, 6)
  const vertices = ramp.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const lateral = vertices.getX(i), t = (vertices.getY(i) + 3) / 6
    const p = slide.start.clone().addScaledVector(across, lateral).addScaledVector(outward, .9 + t * 6)
    const far = slide.start.clone().addScaledVector(across, lateral).addScaledVector(outward, 6.9)
    const approachHeight = terrainHeightAt(level, far.x, far.z)! + .06
    vertices.setXYZ(i, p.x, THREE.MathUtils.lerp(slide.start.y, approachHeight, t), p.z)
  }
  ramp.computeVertexNormals()
  const landing = mergeAndDispose([deck, ramp])
  return { layout, collar: mergeAndDispose(collar), shaft, guides: mergeAndDispose(guides), landing }
}
