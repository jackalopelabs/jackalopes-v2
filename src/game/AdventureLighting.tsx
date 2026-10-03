import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadTerrainLevel } from './terrain/level-document'
import { terrainHeightAt } from './terrain/water-physics'

/** Readable dusk: cool sky fill, a rim on silhouettes, and inexpensive grounding. */
export function AdventureLighting({ lightRef, nightVision = false }: {
  lightRef: RefObject<THREE.DirectionalLight>
  nightVision?: boolean
}) {
  const contact = useRef<THREE.Mesh>(null)
  const contactMaterial = useRef<THREE.ShaderMaterial>(null)
  const level = useMemo(() => loadTerrainLevel(), [])
  const { gl } = useThree()
  const uniforms = useMemo(() => ({ opacity: { value: 0.24 } }), [])
  useEffect(() => {
    const previousExposure = gl.toneMappingExposure
    gl.toneMappingExposure = 1.05
    return () => { gl.toneMappingExposure = previousExposure }
  }, [gl])

  useFrame(() => {
    const player = window.__localPlayerPosition
    if (!player) return
    const light = lightRef.current
    if (light) {
      // Stable, small shadow coverage follows exploration rather than staying at map centre.
      const x = Math.round(player.x / 4) * 4
      const z = Math.round(player.z / 4) * 4
      light.position.set(x - 70, player.y + 100, z - 60)
      light.target.position.set(x, player.y, z)
      light.target.updateMatrixWorld()
    }
    if (!contact.current || !contactMaterial.current) return
    const ground = terrainHeightAt(level, player.x, player.z)
    const gap = ground === null ? Infinity : Math.max(0, player.y - 1.85 - ground)
    contact.current.visible = gap < 4 && ground !== null
    if (ground === null) return
    contact.current.position.set(player.x, ground + 0.035, player.z)
    contact.current.scale.setScalar(1 + Math.min(gap, 4) * 0.12)
    contactMaterial.current.uniforms.opacity.value = (1 - Math.min(gap / 4, 1)) * 0.25
  })

  return <group userData={{ holographicSkip: true }}>
    <hemisphereLight args={['#a0c9d0', '#292838', nightVision ? 0.14 : 0.7]} />
    <directionalLight position={[130, 85, 60]} color="#79cbd6" intensity={nightVision ? 0.1 : 0.65} />
    <mesh ref={contact} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={() => {}}>
      <planeGeometry args={[3.6, 3.6]} />
      <shaderMaterial ref={contactMaterial} uniforms={uniforms} transparent depthWrite={false}
        vertexShader={'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
        fragmentShader={'varying vec2 vUv; uniform float opacity; void main(){float r=length((vUv-.5)*2.0);float a=(1.0-smoothstep(.08,1.0,r))*opacity;gl_FragColor=vec4(.018,.032,.04,a);}'} />
    </mesh>
  </group>
}
