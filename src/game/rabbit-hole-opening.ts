import * as THREE from 'three'
import { TERRAIN_SEGMENTS, TERRAIN_SIZE } from './terrain/level-document'

export const RABBIT_HOLE_POSITION = { x: 0, z: -193 } as const
export const RABBIT_HOLE_RADIUS = 2.25
export type FootprintPoint = readonly [number, number]
export const RABBIT_HOLE_OUTLINE: readonly FootprintPoint[] = Array.from({ length: 16 }, (_, i) => {
  const angle = i * Math.PI * 2 / 16
  return [RABBIT_HOLE_POSITION.x + Math.cos(angle) * RABBIT_HOLE_RADIUS,
    RABBIT_HOLE_POSITION.z + Math.sin(angle) * RABBIT_HOLE_RADIUS] as const
})

const side = (point: FootprintPoint, a: FootprintPoint, b: FootprintPoint) =>
  (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])

export function isInRabbitHoleFootprint(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && RABBIT_HOLE_OUTLINE.every((a, i) =>
    side([x, z], a, RABBIT_HOLE_OUTLINE[(i + 1) % RABBIT_HOLE_OUTLINE.length]) >= -1e-8)
}

/** Partition outside pieces, then discard the remaining convex hole interior. */
export function subtractRabbitHole<T extends readonly number[]>(polygon: T[], footprint: (point: T) => FootprintPoint): T[][] {
  const points = polygon.map(footprint)
  if (Math.max(...points.map(p => p[0])) < RABBIT_HOLE_POSITION.x - RABBIT_HOLE_RADIUS ||
    Math.min(...points.map(p => p[0])) > RABBIT_HOLE_POSITION.x + RABBIT_HOLE_RADIUS ||
    Math.max(...points.map(p => p[1])) < RABBIT_HOLE_POSITION.z - RABBIT_HOLE_RADIUS ||
    Math.min(...points.map(p => p[1])) > RABBIT_HOLE_POSITION.z + RABBIT_HOLE_RADIUS) return [polygon]
  const pieces: T[][] = []
  let remaining = polygon
  for (let edge = 0; edge < RABBIT_HOLE_OUTLINE.length && remaining.length >= 3; edge++) {
    const a = RABBIT_HOLE_OUTLINE[edge], b = RABBIT_HOLE_OUTLINE[(edge + 1) % RABBIT_HOLE_OUTLINE.length]
    const inside: T[] = [], outside: T[] = []
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i], q = remaining[(i + 1) % remaining.length]
      const dp = side(footprint(p), a, b), dq = side(footprint(q), a, b)
      ;(dp >= 0 ? inside : outside).push(p)
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq)
        const intersection = p.map((value, index) => THREE.MathUtils.lerp(value, q[index], t)) as unknown as T
        inside.push(intersection); outside.push(intersection)
      }
    }
    if (outside.length >= 3) pieces.push(outside)
    remaining = inside
  }
  return pieces
}

/** Precise runtime cut: preserve original terrain slopes and interpolate their UVs. */
export function cutRabbitHole(terrain: THREE.BufferGeometry): void {
  const source = terrain.index ? terrain.toNonIndexed() : terrain.clone()
  const positions = source.getAttribute('position'), uv = source.getAttribute('uv')
  const output: number[] = [], texcoords: number[] = []
  for (let i = 0; i < positions.count; i += 3) {
    const triangle = [i, i + 1, i + 2].map(index => [positions.getX(index), positions.getY(index),
      positions.getZ(index), uv?.getX(index) ?? 0, uv?.getY(index) ?? 0])
    for (const piece of subtractRabbitHole(triangle, p => [p[0], -p[1]])) {
      for (let j = 1; j < piece.length - 1; j++) {
        const [a, b, c] = [piece[0], piece[j], piece[j + 1]]
        if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9) continue
        for (const point of [a, b, c]) { output.push(...point.slice(0, 3)); texcoords.push(...point.slice(3)) }
      }
    }
  }
  source.dispose()
  terrain.setIndex(null)
  terrain.setAttribute('position', new THREE.Float32BufferAttribute(output, 3))
  terrain.setAttribute('uv', new THREE.Float32BufferAttribute(texcoords, 2))
  terrain.deleteAttribute('normal'); terrain.computeVertexNormals()
  terrain.computeBoundingBox(); terrain.computeBoundingSphere()
}

/** Split rim edges at every terrain triangle boundary so the shaft meets sculpted ground exactly. */
export function splitRabbitHoleRimEdge(a: FootprintPoint, b: FootprintPoint): FootprintPoint[] {
  const step = TERRAIN_SIZE / TERRAIN_SEGMENTS, cuts = [0, 1]
  for (const [start, end, offset] of [[a[0], b[0], -TERRAIN_SIZE / 2], [a[1], b[1], -TERRAIN_SIZE / 2],
    [a[0] + a[1], b[0] + b[1], -TERRAIN_SIZE]]) {
    if (Math.abs(end - start) < 1e-8) continue
    const first = Math.ceil((Math.min(start, end) - offset) / step)
    const last = Math.floor((Math.max(start, end) - offset) / step)
    for (let grid = first; grid <= last; grid++) {
      const t = (offset + grid * step - start) / (end - start)
      if (t > 1e-8 && t < 1 - 1e-8) cuts.push(t)
    }
  }
  return [...new Set(cuts)].sort((x, y) => x - y).map(t =>
    [THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t)] as const)
}
