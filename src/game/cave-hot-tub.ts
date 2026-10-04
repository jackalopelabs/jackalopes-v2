import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const CAVE_HOT_TUB_POSITION = { x: 0, z: -187 } as const
export const HOT_TUB_WATER_HEIGHT = 1.02

const SEGMENTS = 40
const outline = (angle: number) => 1 + Math.sin(angle * 3 + 0.6) * 0.045 + Math.cos(angle * 7) * 0.025

/** An irregular, open stone bowl; its inner wall and floor are real collision surfaces. */
export function createHotTubGeometries() {
  // Inner floor, inner wall, rounded lip, outer shoulder, grounded base.
  const profile = [[2.25, 1.6, 0.22], [2.55, 1.84, 1.2], [2.7, 1.98, 1.34],
    [3.15, 2.32, 1.28], [3.4, 2.5, 0.65], [3.45, 2.56, 0.04]]
  const points: THREE.Vector3[][] = profile.map(([rx, rz, y], band) =>
    Array.from({ length: SEGMENTS }, (_, i) => {
      const angle = i * Math.PI * 2 / SEGMENTS
      const variation = band === 0 || band === 5 ? 0 : Math.sin(angle * 5) * 0.06 + Math.cos(angle * 9) * 0.035
      const entrance = Math.sin(angle) > 0 ? 1 - THREE.MathUtils.smoothstep(Math.abs(Math.cos(angle)), 0.25, 0.5) : 0
      // A low, broad stone saddle joins the top tread and stays above the waterline.
      const height = band >= 1 && band <= 3 ? THREE.MathUtils.lerp(y + variation, 1.08, entrance) : y + variation
      return new THREE.Vector3(Math.cos(angle) * rx * outline(angle), height,
        Math.sin(angle) * rz * outline(angle))
    }))
  const positions: number[] = [], colors: number[] = []
  const rock = new THREE.Color('#837a68'), pale = new THREE.Color('#c6bea0'), mineral = new THREE.Color('#6c9182')
  for (let band = 0; band < profile.length - 1; band++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const next = (i + 1) % SEGMENTS
      const color = rock.clone().lerp(pale, band === 1 || band === 2 ? 0.52 : 0.12)
      if (Math.sin(i * 2.7 + band) > 0.65) color.lerp(mineral, 0.4)
      color.multiplyScalar(0.88 + (Math.sin(i * 7.1 + band * 2) + 1) * 0.1)
      for (const point of [points[band][i], points[band][next], points[band + 1][next],
        points[band][i], points[band + 1][next], points[band + 1][i]]) {
        positions.push(point.x, point.y, point.z)
        colors.push(color.r, color.g, color.b)
      }
    }
  }
  const shell = new THREE.BufferGeometry()
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  shell.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  shell.computeVertexNormals()
  const rocks = [shell]
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI * 2 / 16
    // Leave the entrance tread clear; outlying stones soften the basin's silhouette.
    if (Math.sin(angle) > 0.7) continue
    const upper = i % 3 === 0
    const rx = upper ? 2.96 : 3.3, rz = upper ? 2.18 : 2.4
    const boulder = new THREE.IcosahedronGeometry(1, 1)
    boulder.deleteAttribute('uv')
    const vertices = boulder.getAttribute('position')
    for (let v = 0; v < vertices.count; v++) {
      const x = vertices.getX(v), y = vertices.getY(v), z = vertices.getZ(v)
      const wear = 1 + Math.sin(x * 13 + y * 9 + z * 7 + i) * 0.12
      vertices.setXYZ(v, x * wear, y * wear, z * wear)
    }
    boulder.scale(upper ? 0.49 : 0.66, upper ? 0.22 : 0.45, upper ? 0.42 : 0.55)
    boulder.rotateY(angle + i * 0.37)
    boulder.translate(Math.cos(angle) * rx * outline(angle), upper ? 1.23 : 0.43,
      Math.sin(angle) * rz * outline(angle))
    boulder.computeVertexNormals()
    const tint = rock.clone().lerp(upper ? pale : mineral, upper ? 0.5 : 0.16)
    boulder.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: vertices.count }, () => [tint.r, tint.g, tint.b]).flat(), 3))
    rocks.push(boulder)
  }
  const stone = mergeGeometries(rocks, false)!
  rocks.forEach(part => part.dispose())

  const water = new THREE.BufferGeometry()
  const waterPositions: number[] = []
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * Math.PI * 2 / SEGMENTS, b = (i + 1) * Math.PI * 2 / SEGMENTS
    waterPositions.push(0, HOT_TUB_WATER_HEIGHT, 0,
      Math.cos(b) * 2.49 * outline(b), HOT_TUB_WATER_HEIGHT, Math.sin(b) * 1.79 * outline(b),
      Math.cos(a) * 2.49 * outline(a), HOT_TUB_WATER_HEIGHT, Math.sin(a) * 1.79 * outline(a))
  }
  water.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3))
  water.computeVertexNormals()

  const bottom = new THREE.CylinderGeometry(1, 1, 0.18, SEGMENTS).scale(2.3, 1, 1.66).translate(0, 0.13, 0)
  // Wide, flat stone treads allow the existing character controller to step over the rim.
  const treads = [
    { at: [0, 0.18, 3.63], size: [1.8, 0.36, 0.82] },
    { at: [0, 0.36, 3.03], size: [1.7, 0.72, 0.74] },
    { at: [0, 0.55, 2.43], size: [1.6, 1.1, 0.78] },
    { at: [0, 0.52, 1.65], size: [1.5, 1.04, 0.85] },
    { at: [0, 0.27, 1.05], size: [1.4, 0.54, 0.65] },
  ]
  const stepParts = treads.map(({ at, size }, i) => {
    const tread = new THREE.CylinderGeometry(1, 1.06, size[1], 10)
    const vertices = tread.getAttribute('position')
    for (let v = 0; v < vertices.count; v++) {
      const x = vertices.getX(v), z = vertices.getZ(v)
      const wear = 1 + Math.sin(x * 5 + z * 7 + i) * 0.035
      const approach = i < 3 ? z : -z
      // A worn, sloping front edge avoids a vertical face catching small characters.
      const bevelDepth = i === 2 ? 0.38 : i === 3 ? 0.5 : 0.32
      const bevel = Math.max(0, Math.min(1, (approach + 0.15) / 1.15)) * bevelDepth
      const y = vertices.getY(v) > 0 ? vertices.getY(v) - bevel : vertices.getY(v)
      vertices.setXYZ(v, x * wear, y, z * wear)
    }
    tread.scale(size[0] / 2, 1, size[2] / 2).translate(...at as [number, number, number])
    tread.computeVertexNormals()
    return tread
  })
  // Two submerged seats on either side of the bathing area.
  for (const side of [-1, 1]) {
    stepParts.push(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(0.65, 0.4, 0.85).translate(side * 1.65, 0.22, -0.25))
  }
  const steps = mergeGeometries(stepParts, false)!
  // Individual convex stones preserve the hollow basin and support the worn, sloping treads.
  const treadPoints = stepParts.map(part => new Float32Array(part.getAttribute('position').array))
  stepParts.forEach(part => part.dispose())
  return { shell: stone, bottom, steps, water, treadPoints }
}
