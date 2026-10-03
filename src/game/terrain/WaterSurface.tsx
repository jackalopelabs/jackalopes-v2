import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  TERRAIN_SEGMENTS,
  terrainVertexWorldPosition,
  type TerrainLevelDocument,
} from './level-document'
import { isWaterCellPainted } from './water-physics'

type WaterSurfaceProps = {
  level: TerrainLevelDocument
  revision?: number
  editor?: boolean
}

function buildWaterGeometry(level: TerrainLevelDocument): THREE.BufferGeometry {
  const vertices: number[] = []
  const waterY = level.waterLevel

  const addVertex = (column: number, row: number) => {
    const [x, z] = terrainVertexWorldPosition(column, row)
    vertices.push(x, waterY, z)
  }

  for (let row = 0; row < TERRAIN_SEGMENTS; row += 1) {
    for (let column = 0; column < TERRAIN_SEGMENTS; column += 1) {
      if (!isWaterCellPainted(level, column, row)) continue

      addVertex(column, row)
      addVertex(column, row + 1)
      addVertex(column + 1, row)
      addVertex(column + 1, row)
      addVertex(column, row + 1)
      addVertex(column + 1, row + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export function WaterSurface({ level, revision = 0, editor = false }: WaterSurfaceProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => buildWaterGeometry(level), [level.waterMask, level.waterLevel, revision])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      shallowColor: { value: new THREE.Color(editor ? '#22d3ee' : '#16b8c7') },
      deepColor: { value: new THREE.Color(editor ? '#155e75' : '#075985') },
      opacity: { value: editor ? 0.62 : 0.54 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 shallowColor;
      uniform vec3 deepColor;
      uniform float opacity;
      varying vec3 vWorldPosition;

      void main() {
        float rippleA = sin(vWorldPosition.x * 0.105 + time * 0.65);
        float rippleB = sin(vWorldPosition.z * 0.13 - time * 0.48);
        float rippleC = sin((vWorldPosition.x + vWorldPosition.z) * 0.045 + time * 0.26);
        float ripple = (rippleA + rippleB + rippleC) / 3.0;
        float glint = smoothstep(0.52, 0.98, ripple * 0.5 + 0.5);
        vec3 color = mix(deepColor, shallowColor, 0.58 + ripple * 0.12);
        color += glint * vec3(0.18, 0.34, 0.36);
        if (!gl_FrontFacing) color = mix(deepColor, color, 0.38);
        gl_FragColor = vec4(color, opacity + glint * 0.08);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [editor])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.uniforms.time.value = clock.elapsedTime
  })

  if (geometry.attributes.position.count === 0) return null

  return (
    <mesh
      geometry={geometry}
      renderOrder={4}
      raycast={editor ? () => undefined : undefined}
    >
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  )
}
