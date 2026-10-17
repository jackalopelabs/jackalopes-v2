import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { loadTerrainLevel, type TerrainLevelDocument } from './terrain/level-document'
import { BUBBLE_ANCHORS, BUBBLE_CAPACITY, bubbleWaterSurface, createBubblePool } from './underwater-bubbles'

type Props = {
  avatar: keyof typeof BUBBLE_ANCHORS
  /** Existing rendered avatar group, including its scale, lean and interpolated pose. */
  source: RefObject<THREE.Object3D>
  /** Body-origin fallback for first-person, where no third-person model is mounted. */
  body?: RefObject<THREE.Vector3>
  yaw?: RefObject<number>
  caves?: boolean
  enabled?: boolean
  level?: TerrainLevelDocument
}

/** Mount beside the avatar, not inside its moving group: particles stay in world space. */
export function UnderwaterBubbles({ avatar, source, body, yaw, caves = false, enabled = true, level: suppliedLevel }: Props) {
  const level = useMemo(() => suppliedLevel ?? loadTerrainLevel(), [suppliedLevel])
  const pool = useMemo(() => createBubblePool(), [])
  const points = useRef<THREE.Points>(null)
  const reducedMotion = useRef(false)
  const work = useMemo(() => ({ mouth: new THREE.Vector3(), crown: new THREE.Vector3(),
    viewport: new THREE.Vector2(), origin: new THREE.Vector3(), scale: new THREE.Vector3(2, 2, 2),
    rotation: new THREE.Quaternion(), euler: new THREE.Euler(), matrix: new THREE.Matrix4(),
    positions: new Float32Array(BUBBLE_CAPACITY * 3), sizes: new Float32Array(BUBBLE_CAPACITY),
  }), [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = media.matches }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useFrame((_, dt) => {
    if (!points.current) return
    let ready = enabled
    if (source.current) {
      source.current.updateWorldMatrix(true, false)
      work.matrix.copy(source.current.matrixWorld)
    } else if (body?.current) {
      work.origin.copy(body.current); work.origin.y -= 2.15
      work.rotation.setFromEuler(work.euler.set(0, (yaw?.current ?? 0) + Math.PI, 0))
      work.matrix.compose(work.origin, work.rotation, work.scale)
    } else ready = false
    const anchors = BUBBLE_ANCHORS[avatar]
    work.mouth.fromArray(anchors.mouth).applyMatrix4(work.matrix)
    work.crown.fromArray(anchors.crown).applyMatrix4(work.matrix)
    const surface = ready ? bubbleWaterSurface(level, work.crown, caves) : null
    pool.step(dt, work.mouth, work.crown, surface, ready && !reducedMotion.current)
    let count = 0
    for (const bubble of pool.slots) {
      if (!bubble.active) continue
      const drift = Math.min(bubble.age, 2) * 0.045
      work.positions[count * 3] = bubble.x + Math.sin(bubble.age * 1.3 + bubble.phase) * drift
      work.positions[count * 3 + 1] = bubble.y
      work.positions[count * 3 + 2] = bubble.z + Math.cos(bubble.age + bubble.phase) * drift
      // Fade/pop in the last few centimetres, with no sprite above the surface.
      work.sizes[count] = Math.min(bubble.radius * (1 + Math.min(bubble.age, 4) * 0.05), (bubble.surface - bubble.y) * 0.5)
      count++
    }
    points.current.geometry.setDrawRange(0, count)
    points.current.geometry.attributes.position.needsUpdate = true
    points.current.geometry.attributes.radius.needsUpdate = true
  })

  // Declarative geometry/material are owned and disposed by R3F on unmount.
  return <points ref={points} name="underwater-bubbles" frustumCulled={false} userData={{ holographicSkip: true }}
    onBeforeRender={(renderer, _scene, _camera, _geometry, material) => {
      (material as THREE.ShaderMaterial).uniforms.viewportHeight.value = renderer.getDrawingBufferSize(work.viewport).y * 0.5
    }}>
    <bufferGeometry drawRange={{ start: 0, count: 0 }}>
      <bufferAttribute attach="attributes-position" args={[work.positions, 3]} usage={THREE.DynamicDrawUsage} />
      <bufferAttribute attach="attributes-radius" args={[work.sizes, 1]} usage={THREE.DynamicDrawUsage} />
    </bufferGeometry>
    <shaderMaterial transparent depthWrite={false} toneMapped={false}
      vertexShader={`
        attribute float radius;
        uniform float viewportHeight;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = max(1.0, radius * 2.0 * projectionMatrix[1][1] * viewportHeight / max(0.1, -view.z));
        }
      `}
      uniforms={{ viewportHeight: { value: 1 } }}
      fragmentShader={`
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float rim = smoothstep(0.65, 0.84, r) * (1.0 - smoothstep(0.84, 1.0, r));
          float glint = exp(-length(p - vec2(-0.3, 0.35)) * 16.0);
          gl_FragColor = vec4(vec3(0.64, 0.94, 0.96) + glint * 0.25, 0.06 + rim * 0.44 + glint * 0.4);
        }
      `}
    />
  </points>
}
