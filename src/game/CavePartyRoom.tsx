import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getActiveGamepad } from '../common/hooks/use-gamepad'
import { caveCeilingAt, caveFloorAt } from './adventure-caves'
import type { TerrainLevelDocument } from './terrain/level-document'
import { createCavePartyPeer, createPartySwitchLatch, stepPartyBlend } from './cave-party-state'
import { PARTY_BALLOONS, PARTY_SWITCH, PARTY_FRONT_Z, canUsePartySwitch,
  createPartyAccentGeometry, createPartyProjectionGeometry, partyBeamFraction, partyQualityBudget } from './cave-party-room'
import { createGalaxyMaterial, createPartyRGBMaterial, createPartyStarGeometry,
  createPartyStarMaterial, createPartyBalloonMaterial } from './cave-party-materials'
import { createCaveSteamGeometry, createCaveSteamMaterial } from './cave-steam'

type PartyPeer = ReturnType<typeof createCavePartyPeer>
type PartyNetwork = {
  getPlayerId(): string | null
  sendMessage(message: unknown): unknown
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
}
type Props = {
  level: TerrainLevelDocument
  shell: readonly THREE.BufferGeometry[]
  quality: string
  /** Optional isolated harness inputs. Production uses the OS preference and live manager. */
  reducedMotion?: boolean
  network?: PartyNetwork | false
  controllerRef?: MutableRefObject<PartyPeer | null>
}

function switchSign(on: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = '#151b2b'; context.fillRect(0, 0, 512, 256)
  context.textAlign = 'center'; context.textBaseline = 'middle'
  context.fillStyle = '#f0e9ff'; context.font = 'bold 47px sans-serif'
  context.fillText('PARTY / SLEEP', 256, 86)
  context.fillStyle = on ? '#8ff7ee' : '#edc69c'; context.font = '38px sans-serif'
  context.fillText(on ? 'PARTY · ON' : 'SLEEP · OFF', 256, 168)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Shared wall switch only adds its own visuals/lights. It never mutates scene lighting or fog. */
export function CavePartyRoom({ level, shell, quality, reducedMotion: overrideMotion, network, controllerRef }: Props) {
  const floor = caveFloorAt(level, PARTY_SWITCH.x, PARTY_SWITCH.z)
  const manager = useRef<PartyNetwork | undefined>()
  const [on, setOn] = useState(false), [near, setNear] = useState(false)
  const nearRef = useRef(false)
  const hintAnchor = useRef<THREE.Group>(null)
  const [osReduced, setOsReduced] = useState(false)
  const latch = useMemo(createPartySwitchLatch, [])
  const peer = useMemo(() => createCavePartyPeer(`party-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    event => manager.current?.sendMessage({ type: 'game_event', event }),
    () => manager.current?.getPlayerId(), state => setOn(state.on)), [])
  const sign = useMemo(() => switchSign(on), [on])
  useEffect(() => () => sign.dispose(), [sign])
  useEffect(() => {
    if (controllerRef) controllerRef.current = peer
    return () => { if (controllerRef?.current === peer) controllerRef.current = null }
  }, [controllerRef, peer])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setOsReduced(preference.matches)
    update(); preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (network === false) return
    let retries: ReturnType<typeof setTimeout>[] = []
    const request = () => {
      retries.forEach(clearTimeout)
      peer.request()
      retries = [750, 2500, 7000].map(delay => setTimeout(() => peer.request(), delay))
    }
    const detach = () => {
      manager.current?.off('game_event', peer.receive)
      manager.current?.off('initialized', request)
      manager.current?.off('connected', request)
      retries.forEach(clearTimeout); retries = []
    }
    const bind = () => {
      const next = network || (window as unknown as { connectionManager?: PartyNetwork }).connectionManager
      if (next === manager.current) return
      detach(); manager.current = next
      if (!next) return
      next.on('game_event', peer.receive)
      next.on('initialized', request)
      next.on('connected', request)
      request()
    }
    bind()
    const poll = setInterval(bind, 500)
    return () => { clearInterval(poll); detach(); manager.current = undefined }
  }, [network, peer])
  useFrame(({ camera }) => {
    // Fullscreen hints must have an anchor in front of the camera: Html otherwise
    // hides a world-origin anchor behind the player, even with calculatePosition.
    if (hintAnchor.current) {
      hintAnchor.current.position.copy(camera.position)
      hintAnchor.current.quaternion.copy(camera.quaternion)
      hintAnchor.current.translateZ(-1)
    }
    const globals = window as unknown as { __localPlayerPosition?: THREE.Vector3; __localPlayerInteract?: boolean }
    const inRange = floor !== null && !!globals.__localPlayerPosition && canUsePartySwitch(floor, globals.__localPlayerPosition)
    const down = !!globals.__localPlayerInteract || !!getActiveGamepad()?.buttons[2]?.pressed
    if (latch(down, inRange, document.visibilityState === 'visible')) peer.set(!peer.state.on)
    if (inRange !== nearRef.current) { nearRef.current = inRange; setNear(inRange) }
  })
  if (floor === null) return null
  return <group name="cave-party-room" userData={{ holographicSkip: true, excludeHolographicVision: true }}>
    <PartyVisuals {...{ level, shell, quality, on }} reducedMotion={overrideMotion ?? osReduced} />
    <group name="cave-party-wall-switch" position={[PARTY_SWITCH.x, floor, PARTY_SWITCH.z]} rotation={[0, PARTY_SWITCH.yaw, 0]}>
      <mesh position={[0, 1.74, 0]}><boxGeometry args={[1.45, 1.45, .09]} /><meshStandardMaterial color="#263044" roughness={.6} metalness={.35} /></mesh>
      <mesh name="party-sleep-label" position={[0, 2.04, .051]}>
        <planeGeometry args={[1.32, .66]} /><meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[0, PARTY_SWITCH.height, .07]}><boxGeometry args={[.35, .46, .08]} /><meshStandardMaterial color="#515d70" metalness={.55} roughness={.4} /></mesh>
      <mesh name={on ? 'party-switch-on' : 'party-switch-off'} position={[0, PARTY_SWITCH.height, .14]} rotation={[on ? -.26 : .26, 0, 0]}>
        <boxGeometry args={[.23, .33, .11]} /><meshStandardMaterial color={on ? '#8ceae0' : '#e4c8a0'} emissive={on ? '#31baad' : '#9a6533'} emissiveIntensity={.35} roughness={.42} />
      </mesh>
      <mesh position={[.43, PARTY_SWITCH.height, .08]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[.055, .055, .025, 12]} /><meshBasicMaterial color={on ? '#59f5df' : '#e7af6b'} toneMapped={false} />
      </mesh>
    </group>
    {near && <group ref={hintAnchor}><Html fullscreen calculatePosition={(_object, _camera, size) => [size.width / 2, size.height / 2]}
      zIndexRange={[10, 10]} style={{ pointerEvents: 'none' }}>
      <div role="status" data-testid="cave-party-prompt" style={{ position: 'absolute', bottom: 124, left: '50%',
        transform: 'translateX(-50%)', whiteSpace: 'nowrap', borderRadius: 12, padding: '10px 16px',
        background: '#17152beb', color: '#e5e0ff', font: '13px system-ui' }}>
        <strong>PARTY / SLEEP</strong><div>{on ? 'Sleep · turn party OFF' : 'Party · turn lights ON'} · F / X (□) · Touch Use</div>
      </div>
    </Html></group>}
  </group>
}

function PartyVisuals({ level, shell, quality, on, reducedMotion }: Pick<Props, 'level' | 'shell' | 'quality'> & { on: boolean; reducedMotion: boolean }) {
  const floor = caveFloorAt(level, 0, -187)!
  const root = useRef<THREE.Group>(null), beams = useRef<THREE.InstancedMesh>(null), balloons = useRef<THREE.InstancedMesh>(null)
  const lights = useRef<(THREE.PointLight | null)[]>([])
  const blend = useRef(0), phase = useRef(0)
  const walls = shell[0], ceiling = shell[1]
  const geometry = useMemo(() => ({
    projection: createPartyProjectionGeometry([walls, ceiling]), accent: createPartyAccentGeometry(level),
    stars: createPartyStarGeometry(level),
    haze: createCaveSteamGeometry(18, [[-16, -185], [-14, -184], [-10, -182], [-3, -180], [0, -181], [15, -179], [17, -181], [18, -183], [-20, -184]]),
  }), [walls, ceiling, level])
  const materials = useMemo(() => ({ galaxy: createGalaxyMaterial(), rgb: createPartyRGBMaterial(),
    stars: createPartyStarMaterial(), balloon: createPartyBalloonMaterial(), steam: createCaveSteamMaterial(.35),
  }), [])
  const work = useMemo(() => ({ dummy: new THREE.Object3D(), from: new THREE.Vector3(), to: new THREE.Vector3(),
    direction: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), color: new THREE.Color() }), [])
  useEffect(() => () => {
    Object.values(geometry).forEach(part => part.dispose())
  }, [geometry])
  useEffect(() => () => { Object.values(materials).forEach(material => material.dispose()) }, [materials])
  const animatedMaterials = useMemo(() => [materials.galaxy, materials.rgb, materials.stars, materials.balloon], [materials])
  const budget = partyQualityBudget(quality)
  const low = quality === 'low'
  useFrame(({ camera, gl }, delta) => {
    blend.current = stepPartyBlend(blend.current, on, delta)
    if (!reducedMotion && on) phase.current += Math.min(delta, .1)
    const amount = blend.current, time = phase.current
    // Effects can be seen across the room, but never from another elevation/through the roof.
    const cameraFloor = caveFloorAt(level, camera.position.x, camera.position.z)
    const cameraRoof = caveCeilingAt(level, camera.position.x, camera.position.z)
    const visible = amount > 0 && camera.position.z < PARTY_FRONT_Z + 6 && cameraFloor !== null && cameraRoof !== null &&
      camera.position.y > cameraFloor && camera.position.y < cameraRoof
    if (root.current) root.current.visible = visible
    if (!visible) return
    for (const material of animatedMaterials) {
      material.uniforms.time.value = time; material.uniforms.amount.value = amount
    }
    materials.stars.uniforms.pixelRatio.value = Math.min(gl.getPixelRatio(), 2)
    geometry.stars.setDrawRange(0, Math.min(budget.stars, geometry.stars.attributes.position.count))
    geometry.haze.setDrawRange(0, budget.haze * 6)
    materials.steam.uniforms.time.value = time
    materials.steam.uniforms.amount.value = amount * (low ? .65 : 1.1)
    materials.steam.uniforms.rise.value = 2.4
    materials.steam.uniforms.tint.value.setRGB(.48, .59, .88)
    if (beams.current) {
      const count = budget.beams
      beams.current.count = count
      ;(beams.current.material as THREE.MeshBasicMaterial).opacity = amount * .43
      for (let i = 0; i < count; i++) {
        const second = i >= count / 2, fan = i % (count / 2)
        work.from.set(second ? 7 : -7, floor + 5.8, second ? -178 : -190)
        const angle = (second ? Math.PI : 0) + (fan - (count / 2 - 1) / 2) * .19 + Math.sin(time * .22) * .45
        work.to.set(work.from.x + Math.sin(angle) * 32, floor + 4 + Math.sin(time * .19 + i * .4) * 2.8,
          work.from.z + Math.cos(angle) * 30)
        work.to.lerpVectors(work.from, work.to, partyBeamFraction(level, work.from, work.to))
        work.direction.subVectors(work.to, work.from)
        const length = work.direction.length()
        work.dummy.position.addVectors(work.from, work.to).multiplyScalar(.5)
        work.dummy.quaternion.setFromUnitVectors(work.up, work.direction.normalize())
        work.dummy.scale.set(.012, length, .012); work.dummy.updateMatrix()
        beams.current.setMatrixAt(i, work.dummy.matrix)
        work.color.setHSL(i / count + time * .012, .9, .65)
        beams.current.setColorAt(i, work.color)
      }
      beams.current.instanceMatrix.needsUpdate = true
      if (beams.current.instanceColor) beams.current.instanceColor.needsUpdate = true
    }
    if (balloons.current) {
      balloons.current.count = budget.balloons
      for (let i = 0; i < balloons.current.count; i++) {
        const [x, y, z] = PARTY_BALLOONS[i]
        work.dummy.position.set(x + Math.sin(time * .19 + i) * .22, floor + y + Math.sin(time * .31 + i * 2) * .35, z)
        work.dummy.quaternion.identity(); work.dummy.scale.setScalar(.48 + i % 3 * .09); work.dummy.updateMatrix()
        balloons.current.setMatrixAt(i, work.dummy.matrix)
      }
      balloons.current.instanceMatrix.needsUpdate = true
    }
    for (let i = 0; i < lights.current.length; i++) {
      const light = lights.current[i]
      if (!light) continue
      light.visible = i < budget.lights
      light.intensity = amount * (i === 0 ? 21 : 16)
      light.color.setHSL((i * .27 + time * .018 + .58) % 1, .78, .6)
    }
  })
  return <group ref={root} name="cave-galaxy-party-effects" visible={false}>
    <mesh name="party-rock-galaxy-projection" geometry={geometry.projection} material={materials.galaxy} dispose={null} raycast={() => {}} />
    <mesh name="party-rainbow-wall-strips" geometry={geometry.accent} material={materials.rgb} dispose={null} />
    <points name="party-dancing-sky-stars" geometry={geometry.stars} material={materials.stars} dispose={null} frustumCulled={false} />
    <mesh name="party-hot-tub-steam-haze" position={[0, floor, 0]} geometry={geometry.haze} material={materials.steam}
      dispose={null} frustumCulled={false} renderOrder={6} raycast={() => {}} />
    <instancedMesh ref={beams} name="party-clipped-laser-fans" args={[undefined, undefined, 12]} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 5]} /><meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={balloons} name="party-iridescent-bubble-balloons" args={[undefined, undefined, 5]} frustumCulled={false}>
      <sphereGeometry args={[1, 20, 12]} /><primitive object={materials.balloon} attach="material" />
    </instancedMesh>
    {[[0, 3.4, -181, 9], [-14, 3, -185, 7.5], [17, 3.2, -182, 6]].map(([x, y, z, distance], i) =>
      <pointLight key={i} ref={light => { lights.current[i] = light }} position={[x, floor + y, z]} intensity={0} distance={distance} decay={1.6} />)}
  </group>
}
