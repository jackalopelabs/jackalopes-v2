import * as THREE from 'three'
import type { WaterslideLayout } from './cave-waterslide'

export const WATERSLIDE_PROFILE = [[-1.7, 1.25], [-1.65, 0.55], [-1.2, 0.06], [0, 0], [1.2, 0.06], [1.65, 0.55], [1.7, 1.25]] as const

/** Horizontal cross sections keep the open flume upright through every S-bend. */
export function waterslideRibbon(slide: WaterslideLayout, profile: readonly (readonly [number, number])[], colored = false, segments = 112) {
  const positions: number[] = [], uv: number[] = [], colors: number[] = []
  const gold = new THREE.Color('#e3bd6d'), coral = new THREE.Color('#d6816d')
  const centre = new THREE.Vector3(), tangent = new THREE.Vector3(), right = new THREE.Vector3()
  const add = (segment: number, cross: number, band: number) => {
    const t = segment / segments
    slide.curve.getPointAt(t, centre)
    slide.curve.getTangentAt(t, tangent)
    right.set(-tangent.z, 0, tangent.x).normalize()
    const [x, y] = profile[cross]
    positions.push(centre.x + right.x * x, centre.y + y, centre.z + right.z * x)
    uv.push(cross / (profile.length - 1), t * slide.length)
    if (colored) {
      const color = band % 14 < 3 ? gold : coral
      colors.push(color.r, color.g, color.b)
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < profile.length - 1; j++) {
    add(i, j, i); add(i, j + 1, i); add(i + 1, j + 1, i)
    add(i, j, i); add(i + 1, j + 1, i); add(i + 1, j, i)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  if (colored) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

