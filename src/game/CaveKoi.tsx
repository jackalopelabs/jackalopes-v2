import { registerAdventureDestructible, isAdventureObjectDestroyed } from './adventure-destructibles'
import { getGameModeFromUrl } from './game-mode'
import { getActiveGamepad } from '../common/hooks/use-gamepad'
import { Html } from '@react-three/drei'
import { GOLDEN_MUSHROOM_REGROW_MS } from './golden-mushroom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const COUNT = 8

/** One shared, untextured low-poly fish; vertex colors form irregular koi patches. */
function koiGeometry() {
  const body = new THREE.SphereGeometry(1, 10, 6).toNonIndexed()
  body.scale(0.32, 0.27, 0.85)
  const positions = body.getAttribute('position')
  const colors: number[] = []
  const white = new THREE.Color('#f5e6c5'), orange = new THREE.Color('#f07828'), ink = new THREE.Color('#253331')
  for (let i = 0; i < positions.count; i += 3) {
    const z = positions.getZ(i), x = positions.getX(i)
    const patch = Math.sin(z * 9 + x * 13)
    const c = patch > 0.25 ? orange : patch < -0.8 && z < 0.2 ? ink : white
    for (let j = 0; j < 3; j++) colors.push(c.r, c.g, c.b)
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const fins = new THREE.BufferGeometry()
  fins.setAttribute('position', new THREE.Float32BufferAttribute([
    0,0,-0.65, -.42,.04,-1.25, 0,0,-1.1,
    0,0,-0.65, 0,0,-1.1, .42,.04,-1.25,
    -.18,0,.25, -.65,-.08,-.15, -.22,0,-.25,
    .18,0,.25, .22,0,-.25, .65,-.08,-.15,
    0,.2,.3, 0,.48,-.2, 0,.2,-.5,
  ], 3))
  fins.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 15 }, () => [orange.r, orange.g, orange.b]).flat(), 3))
  fins.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(30), 2))
  fins.computeVertexNormals()
  const eyes = [-1, 1].map(side => {
    const eye = new THREE.SphereGeometry(.055, 5, 3).toNonIndexed()
    eye.translate(side * .23, .10, .55)
    eye.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: eye.getAttribute('position').count }, () => [ink.r, ink.g, ink.b]).flat(), 3))
    return eye
  })
  const pieces = [body, fins, ...eyes]
  const merged = mergeGeometries(pieces, false)!
  pieces.forEach(piece => piece.dispose())
  merged.setAttribute('koiHue', new THREE.InstancedBufferAttribute(new Float32Array([0, .12, .3, .48, .62, .78, .9, 1]), 1))
  return merged
}

/** Decorative local animation: no physics, textures, lights, or network messages. */
export function CaveKoi({ waterLevel }: { waterLevel: number }) {
  const fishPositions = useMemo(() => Array.from({ length: COUNT }, () => new THREE.Vector3()), [])
  const positionsReady = useRef(false)
  const availableAt = useRef(0)
  const held = useRef(false)
  const nearRef = useRef(false)
  const [near, setNear] = useState(false)
  const prompt = useRef<THREE.Group>(null)
  useEffect(() => {
    const reset = () => { availableAt.current = 0; held.current = false }
    window.addEventListener('jackalopesRoundReset', reset)
    return () => window.removeEventListener('jackalopesRoundReset', reset)
  }, [])
  const mesh = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    if (getGameModeFromUrl() !== 'adventure') return
    const unregister = fishPositions.map((point, i) => registerAdventureDestructible(`cave-koi-${i}`, {
      radius: 1.1,
      position: () => positionsReady.current && !isAdventureObjectDestroyed(`cave-koi-${i}`) &&
        (i !== COUNT - 1 || Date.now() >= availableAt.current) ? point : null,
      destroy: () => {
        // Immediately hide this instance. No eating event, reward, physics, or debris.
        mesh.current?.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0))
        if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true
        if (i === COUNT - 1) { nearRef.current = false; setNear(false) }
      },
    }))
    return () => unregister.forEach(remove => remove())
  }, [fishPositions])
  const geometry = useMemo(koiGeometry, [])
  const time = useMemo(() => ({ value: 0 }), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock, camera }) => {
    time.value = clock.elapsedTime
    if (!mesh.current) return
    mesh.current.visible = camera.position.y < waterLevel + 16 && Math.abs(camera.position.z + 126) < 85
    const interact = !!window.__localPlayerInteract || !!getActiveGamepad()?.buttons[2]?.pressed
    const pressed = interact && !held.current
    held.current = interact
    if (!mesh.current.visible) {
      if (nearRef.current) { nearRef.current = false; setNear(false) }
    }
    for (let i = 0; i < COUNT; i++) {
      const angle = clock.elapsedTime * (0.075 + i * 0.003) + i * 2.4
      const rx = 8 + i * 0.65, rz = 10 + i * 0.6
      dummy.position.set(12 + Math.cos(angle) * rx, waterLevel - 1.1 - (i % 3) * 0.65 + Math.sin(angle * 2) * .18, -125 + Math.sin(angle) * rz)
      fishPositions[i].copy(dummy.position)
      dummy.rotation.set(0, Math.atan2(-rx * Math.sin(angle), rz * Math.cos(angle)), Math.sin(clock.elapsedTime * 3 + i) * .035)
      dummy.scale.setScalar(.85 + (i % 4) * .13)
      if (i === COUNT - 1) {
        const player = window.__localPlayerPosition
        const available = !isAdventureObjectDestroyed(`cave-koi-${i}`) && Date.now() >= availableAt.current
        const close = available && window.jackalopesGame?.playerType === 'jackalope' && !!player &&
          Math.hypot(player.x - dummy.position.x, player.y - dummy.position.y, player.z - dummy.position.z) < 3.2
        if (prompt.current) prompt.current.position.copy(dummy.position)
        if (close && pressed) {
          availableAt.current = Date.now() + GOLDEN_MUSHROOM_REGROW_MS
          window.dispatchEvent(new CustomEvent('jackalopes:rainbow-koi-eaten'))
        }
        const showPrompt = close && Date.now() >= availableAt.current
        if (showPrompt !== nearRef.current) { nearRef.current = showPrompt; setNear(showPrompt) }
        if (Date.now() < availableAt.current) dummy.scale.setScalar(0)
      }
      if (isAdventureObjectDestroyed(`cave-koi-${i}`)) dummy.scale.setScalar(0)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    positionsReady.current = true
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <group userData={{ excludeHolographicVision: true }}>
  <instancedMesh ref={mesh} name="cave-koi-school" args={[geometry, undefined, COUNT]} frustumCulled={false}>
    <meshStandardMaterial vertexColors roughness={.65} metalness={0} side={THREE.DoubleSide}
      emissive="#b6aa8b" emissiveIntensity={.28}
      onBeforeCompile={shader => {
        shader.uniforms.koiTime = time
        shader.vertexShader = 'uniform float koiTime; attribute float koiHue; varying float vKoiHue; varying vec3 vKoiPosition;\n' + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvKoiHue = koiHue; vKoiPosition = position; transformed.x += sin(position.z * 6.0 + koiTime * 4.0 + instanceMatrix[3].x) * 0.12 * smoothstep(0.1, 1.1, -position.z);')
        shader.fragmentShader = 'uniform float koiTime; varying float vKoiHue; varying vec3 vKoiPosition;\n' + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          float hue = vKoiHue * 6.2831853;
          vec3 axis = normalize(vec3(1.0));
          vec3 base = diffuseColor.rgb;
          diffuseColor.rgb = clamp(base * cos(hue) + cross(axis, base) * sin(hue) + axis * dot(axis, base) * (1.0 - cos(hue)), 0.0, 1.0);
          if (vKoiHue > 0.99) {
            vec3 rainbow = 0.5 + 0.5 * cos(vec3(0.0, 2.094, 4.188) + vKoiPosition.z * 3.5 + koiTime * 1.6);
            float scan = 0.8 + 0.2 * sin(vKoiPosition.y * 70.0 + koiTime * 4.0);
            diffuseColor.rgb = rainbow * scan;
          }
        `).replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          if (vKoiHue > 0.99) totalEmissiveRadiance = diffuseColor.rgb * 0.85;
        `)
      }} />
  </instancedMesh>
  <group ref={prompt}>
    {near && <Html center position={[0, 1.3, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      <div data-testid="rainbow-koi-prompt" style={{ background: 'rgba(12,25,40,.9)', border: '1px solid #9cdde5', borderRadius: 10, color: '#dcefff', padding: '8px 12px', textAlign: 'center', fontSize: 12 }}>
        <strong>Rainbow koi</strong><div>F / X · Eat · Touch Use</div>
      </div>
    </Html>}
  </group>
  </group>
}
