import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { caveFloorAt } from './adventure-caves'
import { canBoardWaterslide, createWaterslide, type WaterslideLayout } from './cave-waterslide'
import { waterslideState } from './waterslide-state'
import { waterslideRibbon, WATERSLIDE_PROFILE } from './waterslide-geometry'
import { loadTerrainLevel } from './terrain/level-document'

const SEGMENTS = 112
const SPLASH_COUNT = 22
function makeSign(label: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 384; canvas.height = 112
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#173e47'; ctx.fillRect(0, 0, 384, 112)
  ctx.strokeStyle = '#d5b674'; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 378, 106)
  ctx.fillStyle = '#e3f4e8'; ctx.font = `700 ${label.length > 8 ? 36 : 55}px system-ui, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 192, 57)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Fixed, rideable open channel. Boarding and movement live in the player controller. */
export function CaveWaterslide({ layout, compact = false, label = 'SLIDE', name = 'cave-waterslide' }: {
  layout?: WaterslideLayout; compact?: boolean; label?: string; name?: string
} = {}) {
  const level = useMemo(() => loadTerrainLevel(), [])
  const slide = useMemo(() => layout ?? createWaterslide(level), [level, layout])
  const sign = useMemo(() => makeSign(label), [label])
  const [boardingHint, setBoardingHint] = useState(false)
  const hintVisible = useRef(false)
  const touchControls = useMemo(() => navigator.maxTouchPoints > 0, [])
  const splash = useRef<THREE.InstancedMesh>(null)
  const splashMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const splashAge = useRef(1)
  const splashOrigin = useRef(new THREE.Vector3())
  const matrix = useMemo(() => new THREE.Object3D(), [])
  const geometry = useMemo(() => {
    const widthScale = (slide.halfWidth ?? 1.7) / 1.7
    const segments = slide.segments ?? SEGMENTS
    const profile = (points: readonly (readonly [number, number])[]) => points.map(([x, y]) => [x * widthScale, y] as const)
    const ribbon = (points: readonly (readonly [number, number])[], colored = false) =>
      waterslideRibbon(slide, profile(points), colored, segments)
    const channel = ribbon(WATERSLIDE_PROFILE)
    const leftRim = ribbon([[-1.77, 1.27], [-1.62, 1.27]], true)
    const rightRim = ribbon([[1.62, 1.27], [1.77, 1.27]], true)
    const rims = mergeGeometries([leftRim, rightRim], false)!
    leftRim.dispose(); rightRim.dispose()
    const water = ribbon([[-1.12, 0.11], [1.12, 0.11]])
    const legs: THREE.BufferGeometry[] = []
    const centre = new THREE.Vector3(), tangent = new THREE.Vector3(), right = new THREE.Vector3()
    for (let i = 7; !compact && i < SEGMENTS; i += 11) {
      const t = i / SEGMENTS
      slide.curve.getPointAt(t, centre); slide.curve.getTangentAt(t, tangent)
      right.set(-tangent.z, 0, tangent.x).normalize()
      for (const side of [-1, 1]) {
        const x = centre.x + right.x * side * 1.15
        const z = centre.z + right.z * side * 1.15
        const ground = caveFloorAt(level, x, z)
        if (ground === null || centre.y - ground < 0.4) continue
        const height = centre.y - ground
        legs.push(new THREE.CylinderGeometry(0.15, 0.21, height, 5)
          .translate(x, ground + height / 2, z))
      }
    }
    const supports = legs.length ? mergeGeometries(legs, false)! : new THREE.BufferGeometry()
    legs.forEach(leg => leg.dispose())
    return { channel, rims, water, supports }
  }, [slide, level, compact])
  const waterMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vSlideUv;
      void main() { vSlideUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vSlideUv;
      void main() {
        float flow = sin(vSlideUv.y * 1.8 - time * 5.4 + sin(vSlideUv.x * 16.0) * 0.6);
        float filament = smoothstep(0.82, 1.0, flow);
        float edge = smoothstep(0.28, 0.49, abs(vSlideUv.x - 0.5));
        vec3 color = mix(vec3(0.035, 0.30, 0.34), vec3(0.32, 0.78, 0.73), 0.35 + filament * 0.3 + edge * 0.18);
        gl_FragColor = vec4(color, 0.68 + filament * 0.12);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [])

  useEffect(() => {
    const onSplash = (event: Event) => {
      const position = (event as CustomEvent<{ position?: unknown }>).detail?.position
      if (!Array.isArray(position) || position.length !== 3 || !position.every(value => typeof value === 'number' && Number.isFinite(value))) return
      if (Math.hypot(position[0] - slide.end.x, position[2] - slide.end.z) > 4) return
      splashOrigin.current.set(position[0], position[1], position[2])
      splashAge.current = 0
    }
    window.addEventListener('jackalopes:slide-splash', onSplash)
    return () => window.removeEventListener('jackalopes:slide-splash', onSplash)
  }, [slide])
  useEffect(() => () => {
    Object.values(geometry).forEach(value => value.dispose())
    waterMaterial.dispose(); sign.dispose()
  }, [geometry, waterMaterial, sign])

  useFrame(({ clock }, delta) => {
    waterMaterial.uniforms.time.value = clock.elapsedTime
    const player = window.__localPlayerPosition
    const nearEntry = !waterslideState.active && !!player && canBoardWaterslide(slide, player)
    if (hintVisible.current !== nearEntry) {
      hintVisible.current = nearEntry
      setBoardingHint(nearEntry)
    }
    if (!splash.current) return
    splashAge.current += Math.min(delta, 0.1)
    const age = splashAge.current
    splash.current.visible = age < 0.8
    if (age >= 0.8) return
    if (splashMaterial.current) splashMaterial.current.opacity = 0.8 * (1 - age / 0.8)
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const angle = i * 2.399963
      const speed = 1.7 + (i % 5) * 0.36
      matrix.position.set(splashOrigin.current.x + Math.cos(angle) * speed * age,
        splashOrigin.current.y + (2.3 + (i % 4) * 0.3) * age - 4.8 * age * age,
        splashOrigin.current.z + Math.sin(angle) * speed * age)
      matrix.scale.setScalar(0.8 + (i % 3) * 0.2)
      matrix.updateMatrix()
      splash.current.setMatrixAt(i, matrix.matrix)
    }
    splash.current.instanceMatrix.needsUpdate = true
  })

  const direction = slide.curve.getTangentAt(0)
  const entryRotation = Math.atan2(-direction.x, -direction.z)
  return <group name={name} userData={{ holographicScenery: true }}>
    <RigidBody type="fixed" colliders="trimesh" name={`${name}-channel`} friction={0.4}>
      <mesh name="waterslide-solid-channel" geometry={geometry.channel} userData={{ caveSolid: true }}>
        <meshStandardMaterial color="#368e91" roughness={0.52} metalness={0.12}
          emissive="#17383a" emissiveIntensity={0.23} side={THREE.DoubleSide} flatShading />
      </mesh>
    </RigidBody>
    <mesh name="waterslide-supports" geometry={geometry.supports}>
      <meshStandardMaterial color="#42595d" roughness={0.84} metalness={0.15} flatShading />
    </mesh>
    <group userData={{ holographicSkip: true }}>
      <mesh name="waterslide-rim-bands" geometry={geometry.rims}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh name="waterslide-flowing-water" geometry={geometry.water} material={waterMaterial}
        dispose={null} renderOrder={3} raycast={() => {}} />
      <group position={[slide.start.x, slide.start.y, slide.start.z]} rotation={[0, entryRotation, 0]}>
        {(compact ? [-1.05, 1.05] : [-2, 2]).map(x => <mesh key={x} position={[x, 2.25, 0]}>
          <cylinderGeometry args={[0.11, 0.15, 4.5, 6]} />
          <meshStandardMaterial color="#9abbb4" metalness={0.18} roughness={0.6} />
        </mesh>)}
        <mesh position={[0, 4.15, 0]}>
          <boxGeometry args={[compact ? 2.3 : 4.25, 0.18, 0.2]} />
          <meshStandardMaterial color="#d7ad67" roughness={0.6} />
        </mesh>
        <mesh position={[0, 4.25, 0.13]}>
          <planeGeometry args={[compact ? 2.2 : 2.6, 0.76]} />
          <meshBasicMaterial map={sign} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {boardingHint && <Html center position={[slide.start.x, slide.start.y + 2.9, slide.start.z]}
        style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }} zIndexRange={[30, 0]}>
        <span data-testid="waterslide-prompt" style={{ display: 'block', padding: '7px 11px', borderRadius: 8,
          background: 'rgba(15, 37, 43, .88)', color: '#dcefe7', border: '1px solid #759f95',
          font: '600 12px system-ui, sans-serif', pointerEvents: 'none' }}>
          {touchControls ? 'Use · Ride slide' : 'F / X · Ride slide'}
        </span>
      </Html>}
      <instancedMesh ref={splash} name="waterslide-splash" args={[undefined, undefined, SPLASH_COUNT]}
        visible={false} frustumCulled={false} raycast={() => {}}>
        <icosahedronGeometry args={[0.12, 0]} />
        <meshBasicMaterial ref={splashMaterial} color="#b7ebe3" transparent opacity={0.8} depthWrite={false} />
      </instancedMesh>
    </group>
  </group>
}
