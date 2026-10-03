import * as THREE from 'three'
import { TERRAIN_SEGMENTS, TERRAIN_SIZE, type TerrainLevelDocument } from './terrain/level-document'
import { MIN_SWIM_DEPTH, terrainHeightAt } from './terrain/water-physics'

export const CAVE_MOUTH = { halfWidth: 5, frontZ: 6, backZ: -6 } as const
export const CAVE_PATCH_HALF = TERRAIN_SIZE / TERRAIN_SEGMENTS
export const CAVE_RAMP_END_Z = -26
export const CAVE_ROOM_HEIGHT = 8
export const CAVE_BOUNDS = { minX: -52, maxX: 52, minZ: -192, maxZ: 6 } as const
export const CAVE_DEPTH_BREAKS = [-192, -170, -140, -110, -75, -26] as const

type Point = readonly [number, number]
type Vertex = readonly [number, number, number]

/** One continuous polygon, so the three branches have no hidden divider colliders. */
export const CAVE_BODY_OUTLINE: readonly Point[] = [
  [-5, -26], [-5, -30], [-14, -30], [-18, -35], [-24, -35],
  [-28, -29], [-38, -28], [-48, -35], [-46, -44], [-36, -48],
  [-27, -44], [-22, -42], [-17, -45], [-12, -49], [-10, -56],
  [-18, -59], [-20, -66], [-12, -73], [-10, -82], [-13, -94],
  [-30, -98], [-46, -105], [-52, -117], [-49, -132], [-37, -143],
  [-20, -149], [-10, -158], [-12, -171], [-26, -176], [-28, -184],
  [-18, -192], [4, -192], [22, -187], [25, -177], [12, -169],
  [10, -156], [22, -150], [39, -143], [50, -132], [52, -117],
  [43, -104], [26, -98], [12, -92], [10, -82], [11, -71],
  [15, -62], [9, -55], [11, -49], [18, -46], [23, -44],
  [29, -49], [40, -49], [48, -43], [46, -33], [36, -28],
  [27, -31], [23, -36], [16, -36], [12, -31], [5, -30], [5, -26],
]

const groundAt = (level: TerrainLevelDocument, x: number, z: number) =>
  (terrainHeightAt(level, x, z) ?? 0) - 0.02

const layoutCache = new WeakMap<TerrainLevelDocument, { entranceY: number; floorY: number; waterLevel: number }>()

/** Cut the existing XY PlaneGeometry before its -PI/2 world rotation. */
export function cutCaveMouth(terrain: THREE.BufferGeometry): void {
  const index = terrain.getIndex()
  if (!index) return
  const position = terrain.getAttribute('position')
  const kept: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2)
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3
    const z = -(position.getY(a) + position.getY(b) + position.getY(c)) / 3
    if (Math.abs(x) < CAVE_PATCH_HALF && Math.abs(z) < CAVE_PATCH_HALF) continue
    kept.push(a, b, c)
  }
  terrain.setIndex(kept)
}

export function isWithinCaveFootprint(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < CAVE_BOUNDS.minX || x > CAVE_BOUNDS.maxX || z < CAVE_BOUNDS.minZ || z > CAVE_BOUNDS.maxZ) return false
  if (Math.abs(x) <= CAVE_MOUTH.halfWidth && z >= CAVE_RAMP_END_Z && z <= CAVE_MOUTH.frontZ) return true
  let inside = false
  for (let i = 0, j = CAVE_BODY_OUTLINE.length - 1; i < CAVE_BODY_OUTLINE.length; j = i++) {
    const [ax, az] = CAVE_BODY_OUTLINE[i]
    const [bx, bz] = CAVE_BODY_OUTLINE[j]
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside
  }
  return inside
}

export function caveLayout(level: TerrainLevelDocument) {
  const cached = layoutCache.get(level)
  if (cached) return cached
  const entranceY = groundAt(level, 0, CAVE_MOUTH.frontZ)
  let lowestGround = entranceY
  // Include the complete interior, not just the outline: saved sculpting can
  // put a depression over the middle of a chamber. Two-metre samples plus all
  // terrain vertices inside the bounds conservatively place the roof below it.
  for (let z = CAVE_BOUNDS.minZ; z <= -6; z += 2) {
    for (let x = CAVE_BOUNDS.minX; x <= CAVE_BOUNDS.maxX; x += 2) {
      if (isWithinCaveFootprint(x, z)) lowestGround = Math.min(lowestGround, groundAt(level, x, z))
    }
  }
  const firstRow = Math.floor((CAVE_BOUNDS.minZ + TERRAIN_SIZE / 2) / CAVE_PATCH_HALF)
  const lastRow = Math.ceil((CAVE_BOUNDS.maxZ + TERRAIN_SIZE / 2) / CAVE_PATCH_HALF)
  const firstColumn = Math.floor((CAVE_BOUNDS.minX + TERRAIN_SIZE / 2) / CAVE_PATCH_HALF)
  const lastColumn = Math.ceil((CAVE_BOUNDS.maxX + TERRAIN_SIZE / 2) / CAVE_PATCH_HALF)
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const x = column * CAVE_PATCH_HALF - TERRAIN_SIZE / 2
      const z = row * CAVE_PATCH_HALF - TERRAIN_SIZE / 2
      lowestGround = Math.min(lowestGround, groundAt(level, x, z))
    }
  }
  // The highest ceiling is the far dry grotto: floorY - 6 + 16.
  // Including every enclosing grid vertex is conservative for the original
  // piecewise-linear terrain, even where saved sculpting crosses our boundary.
  const floorY = Math.min(entranceY - 16, lowestGround - 12)
  const layout = { entranceY, floorY, waterLevel: floorY - 9 }
  layoutCache.set(level, layout)
  return layout
}

function rampHeight(level: TerrainLevelDocument, floorY: number, x: number, z: number) {
  const progress = THREE.MathUtils.clamp((CAVE_MOUTH.frontZ - z) / (CAVE_MOUTH.frontZ - CAVE_RAMP_END_Z), 0, 1)
  return THREE.MathUtils.lerp(groundAt(level, x, CAVE_MOUTH.frontZ), floorY, progress)
}

/** Continuous grades, with exact breakpoints also used by the collision mesh. */
export function caveFloorOffset(z: number): number {
  if (z >= -75) return 0
  if (z >= -110) return (z + 75) * 18 / 35
  if (z >= -140) return -18
  if (z >= -170) return -18 + (-140 - z) * 12 / 30
  return -6
}

export function caveHeadroom(z: number): number {
  return THREE.MathUtils.lerp(CAVE_ROOM_HEIGHT, 16, THREE.MathUtils.clamp((-75 - z) / 35, 0, 1))
}

export function caveFloorAt(level: TerrainLevelDocument, x: number, z: number): number | null {
  if (!isWithinCaveFootprint(x, z)) return null
  const { floorY } = caveLayout(level)
  return z >= CAVE_RAMP_END_Z ? rampHeight(level, floorY, x, z) : floorY + caveFloorOffset(z)
}

export function caveCeilingAt(level: TerrainLevelDocument, x: number, z: number): number | null {
  const floor = caveFloorAt(level, x, z)
  if (floor === null) return null
  if (z > CAVE_MOUTH.backZ) return groundAt(level, x, z) + 2
  if (z >= CAVE_RAMP_END_Z) return Math.min(groundAt(level, x, z) - 0.1, floor + CAVE_ROOM_HEIGHT)
  return floor + caveHeadroom(z)
}

/** Local underground water, never an infinite plane affecting surface players. */
export function caveWaterSurfaceAt(level: TerrainLevelDocument, x: number, y: number, z: number, wasSwimming = false): number | null {
  if (!Number.isFinite(y)) return null
  const bottom = caveFloorAt(level, x, z)
  if (bottom === null || y < bottom) return null
  const { waterLevel } = caveLayout(level)
  const roof = caveCeilingAt(level, x, z)!
  if (waterLevel - bottom < MIN_SWIM_DEPTH || waterLevel >= roof || y >= roof) return null
  return y <= waterLevel + (wasSwimming ? 0.25 : 0.05) ? waterLevel : null
}

export function containsCave(level: TerrainLevelDocument, x: number, y: number, z: number): boolean {
  const floor = caveFloorAt(level, x, z)
  if (floor === null || y < floor - 0.5) return false
  const roof = caveCeilingAt(level, x, z)!
  return y < roof + 0.5
}

function geometry(positions: number[]) {
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  result.computeVertexNormals()
  result.computeBoundingBox()
  result.computeBoundingSphere()
  return result
}

function triangle(out: number[], a: Vertex, b: Vertex, c: Vertex, normalY?: number) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2]
  const areaSquared = (aby * acz - abz * acy) ** 2 + (abz * acx - abx * acz) ** 2 + (abx * acy - aby * acx) ** 2
  if (areaSquared < 1e-12) return
  const crossY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
  if (normalY !== undefined && crossY * normalY < 0) out.push(...a, ...c, ...b)
  else out.push(...a, ...b, ...c)
}

function wall(out: number[], a: Vertex, b: Vertex, topA: Vertex, topB: Vertex, reverse = false) {
  if (reverse) { wall(out, b, a, topB, topA); return }
  triangle(out, a, b, topB)
  triangle(out, a, topB, topA)
}

function clip(poly: Point[], axis: 0 | 1, boundary: number, keepGreater: boolean): Point[] {
  const output: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const aInside = keepGreater ? a[axis] >= boundary : a[axis] <= boundary
    const bInside = keepGreater ? b[axis] >= boundary : b[axis] <= boundary
    if (aInside) output.push(a)
    if (aInside !== bInside) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis])
      output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return output
}

/** Caller owns and disposes every returned geometry. Positions are world-space. */
export function createCaveGeometries(level: TerrainLevelDocument) {
  const { entranceY, floorY, waterLevel } = caveLayout(level)
  const surface: number[] = [], floor: number[] = [], walls: number[] = [], ceiling: number[] = [], ramp: number[] = [], water: number[] = []
  const s = CAVE_PATCH_HALF
  // Clip each of the original eight triangles separately. This preserves the
  // terrain's actual piecewise-linear height, diagonals, and edge midpoints,
  // even when an editor has sculpted the central four cells.
  const rectangles = [
    [-s, -5, -s, s], [5, s, -s, s], [-5, 5, -s, -6], [-5, 5, 6, s],
  ]
  for (const x of [-s, 0]) for (const z of [-s, 0]) {
    const triangles: Point[][] = [
      [[x, z], [x + s, z], [x, z + s]],
      [[x + s, z], [x + s, z + s], [x, z + s]],
    ]
    for (const original of triangles) for (const [xmin, xmax, zmin, zmax] of rectangles) {
      let poly = clip(original, 0, xmin, true)
      poly = clip(poly, 0, xmax, false)
      poly = clip(poly, 1, zmin, true)
      poly = clip(poly, 1, zmax, false)
      const vertices = poly.map(([px, pz]): Vertex => [px, groundAt(level, px, pz), pz])
      for (let i = 1; i < vertices.length - 1; i++) {
        const a = vertices[0], b = vertices[i], c = vertices[i + 1]
        if (Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) > 1e-8) triangle(surface, a, b, c, 1)
      }
    }
  }

  const contour = CAVE_BODY_OUTLINE.map(([x, z]) => new THREE.Vector2(x, z))
  const bodyFloor = (z: number) => floorY + caveFloorOffset(z)
  const bodyRoof = (z: number) => bodyFloor(z) + caveHeadroom(z)
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const original = [a, b, c].map((index): Point => [contour[index].x, contour[index].y])
    for (let band = 0; band < CAVE_DEPTH_BREAKS.length - 1; band++) {
      let poly = clip(original, 1, CAVE_DEPTH_BREAKS[band], true)
      poly = clip(poly, 1, CAVE_DEPTH_BREAKS[band + 1], false)
      for (let i = 1; i < poly.length - 1; i++) {
        const pts = [poly[0], poly[i], poly[i + 1]]
        const f = pts.map(([x, z]): Vertex => [x, bodyFloor(z), z])
        const r = pts.map(([x, z]): Vertex => [x, bodyRoof(z), z])
        triangle(floor, f[0], f[1], f[2], 1)
        triangle(ceiling, r[0], r[1], r[2], -1)
      }
      // Clip this already-linear floor polygon against the water elevation.
      // This exactly follows both shores without a rectangular water spill.
      const submerged: Point[] = []
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length]
        const py = bodyFloor(p[1]), qy = bodyFloor(q[1])
        if (py < waterLevel) submerged.push(p)
        if ((py < waterLevel) !== (qy < waterLevel)) {
          const t = (waterLevel - py) / (qy - py)
          submerged.push([THREE.MathUtils.lerp(p[0], q[0], t), THREE.MathUtils.lerp(p[1], q[1], t)])
        }
      }
      const wet = submerged.map(([x, z]): Vertex => [x, waterLevel, z])
      for (let i = 1; i < wet.length - 1; i++) triangle(water, wet[0], wet[i], wet[i + 1], 1)
    }
  }
  const clockwise = THREE.ShapeUtils.isClockWise(contour)
  // Deliberately omit the closing edge: it is the open ramp-to-hub connection.
  for (let i = 0; i < CAVE_BODY_OUTLINE.length - 1; i++) {
    const [ax, az] = CAVE_BODY_OUTLINE[i], [bx, bz] = CAVE_BODY_OUTLINE[i + 1]
    const cuts = [0, 1]
    if (az !== bz) for (const depth of CAVE_DEPTH_BREAKS) {
      const t = (depth - az) / (bz - az)
      if (t > 0 && t < 1) cuts.push(t)
    }
    cuts.sort((a, b) => a - b)
    for (let j = 0; j < cuts.length - 1; j++) {
      const x1 = THREE.MathUtils.lerp(ax, bx, cuts[j]), z1 = THREE.MathUtils.lerp(az, bz, cuts[j])
      const x2 = THREE.MathUtils.lerp(ax, bx, cuts[j + 1]), z2 = THREE.MathUtils.lerp(az, bz, cuts[j + 1])
      wall(walls, [x1, bodyFloor(z1), z1], [x2, bodyFloor(z2), z2], [x1, bodyRoof(z1), z1], [x2, bodyRoof(z2), z2], clockwise)
    }
  }

  const roofAt = (x: number, z: number) => Math.min(groundAt(level, x, z) - 0.1, rampHeight(level, floorY, x, z) + 8)
  for (let z = CAVE_MOUTH.frontZ; z > CAVE_RAMP_END_Z; z -= 2) {
    const nextZ = z - 2
    const a: Vertex = [-5, rampHeight(level, floorY, -5, z), z]
    const b: Vertex = [5, rampHeight(level, floorY, 5, z), z]
    const c: Vertex = [5, rampHeight(level, floorY, 5, nextZ), nextZ]
    const d: Vertex = [-5, rampHeight(level, floorY, -5, nextZ), nextZ]
    const mid: Vertex = [0, rampHeight(level, floorY, 0, z), z]
    const nextMid: Vertex = [0, rampHeight(level, floorY, 0, nextZ), nextZ]
    triangle(ramp, a, mid, nextMid, 1); triangle(ramp, a, nextMid, d, 1)
    triangle(ramp, mid, b, c, 1); triangle(ramp, mid, c, nextMid, 1)
    const sideTop = (x: number, pz: number) => pz >= -6 ? groundAt(level, x, pz) : roofAt(x, pz)
    wall(walls, d, a, [-5, sideTop(-5, nextZ), nextZ], [-5, sideTop(-5, z), z], true)
    wall(walls, b, c, [5, sideTop(5, z), z], [5, sideTop(5, nextZ), nextZ], true)
    if (z <= CAVE_MOUTH.backZ) {
      const ra: Vertex = [-5, roofAt(-5, z), z], rb: Vertex = [5, roofAt(5, z), z]
      const rc: Vertex = [5, roofAt(5, nextZ), nextZ], rd: Vertex = [-5, roofAt(-5, nextZ), nextZ]
      triangle(ceiling, ra, rb, rc, -1); triangle(ceiling, ra, rc, rd, -1)
    }
  }
  wall(walls, [-5, roofAt(-5, -6), -6], [5, roofAt(5, -6), -6], [-5, groundAt(level, -5, -6), -6], [5, groundAt(level, 5, -6), -6])
  const surfaceGeometry = geometry(surface)
  const uv: number[] = []
  for (let i = 0; i < surface.length; i += 3) {
    uv.push((surface[i] + TERRAIN_SIZE / 2) / TERRAIN_SIZE, (TERRAIN_SIZE / 2 - surface[i + 2]) / TERRAIN_SIZE)
  }
  surfaceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return { surface: surfaceGeometry, floor: geometry(floor), walls: geometry(walls), ceiling: geometry(ceiling), ramp: geometry(ramp), water: geometry(water), entranceY, floorY, waterLevel }
}
