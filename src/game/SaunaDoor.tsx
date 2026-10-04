import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { ConnectionManager } from '../network/ConnectionManager'
import { getActiveGamepad } from '../common/hooks/use-gamepad'
import { SAUNA_DOOR_HINGE, SAUNA_DOOR_SIZE,
  canUseSaunaDoor, isInSaunaDoorSweep, isInsideSauna } from './cave-sauna'
import { INITIAL_SAUNA_DOOR, applySaunaDoorState, stepSaunaFog, type SaunaDoorState } from './sauna-door-state'

const OPEN_ANGLE = -Math.PI / 2
const fogVertex = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
const fogFragment = `
  uniform float humidity;
  varying vec2 vUv;
  void main() {
    float cloud = 0.7 + sin(vUv.x * 14.0 + sin(vUv.y * 9.0)) * 0.07;
    gl_FragColor = vec4(0.63, 0.65, 0.55, humidity * cloud);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Shared, reversible door action. Thick fog stays inside the sauna and clears when opened. */
export function SaunaDoor({ floor }: { floor: number }) {
  const { scene } = useThree()
  const body = useRef<RapierRigidBody>(null)
  const angle = useRef(OPEN_ANGLE)
  const door = useRef<SaunaDoorState>({ ...INITIAL_SAUNA_DOOR })
  const [closed, setClosed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const hintRef = useRef<string | null>(null)
  const held = useRef(false), reducedMotion = useRef(false)
  const humidity = useRef(0)
  const uniforms = useMemo(() => ({ humidity: { value: 0 } }), [])
  const saunaFog = useMemo(() => new THREE.FogExp2('#c7c9b5', 0), [])
  const ordinaryFog = useRef<THREE.Fog | THREE.FogExp2 | null>(scene.fog)
  // The development game also runs over plain HTTP, where randomUUID is unavailable.
  const offlineId = useMemo(() => `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`, [])

  const accept = (candidate: unknown) => {
    const next = applySaunaDoorState(door.current, candidate)
    if (next === door.current) return
    door.current = next
    setClosed(next.closed)
  }
  useEffect(() => {
    let manager: ConnectionManager | undefined
    let retries: ReturnType<typeof setTimeout>[] = []
    const request = () => manager?.sendMessage({ type: 'game_event', event: { event_type: 'sauna_state_request' } })
    const receive = (event: any) => {
      if (!event) return
      if (event.event_type === 'sauna_door') accept(event.state)
      if (event.event_type === 'sauna_state' && event.target === manager?.getPlayerId()) accept(event.state)
      if (event.event_type === 'sauna_state_request' && typeof event.player === 'string' && event.player !== manager?.getPlayerId()) {
        manager?.sendMessage({ type: 'game_event', event: {
          event_type: 'sauna_state', target: event.player, state: door.current,
        } })
      }
    }
    const detach = () => {
      manager?.off('game_event', receive)
      manager?.off('initialized', request)
      manager?.off('connected', request)
      retries.forEach(clearTimeout); retries = []
    }
    const bind = () => {
      const next = window.connectionManager as ConnectionManager | undefined
      if (next === manager) return
      detach(); manager = next
      if (!manager) return
      manager.on('game_event', receive)
      manager.on('initialized', request)
      manager.on('connected', request)
      retries = [setTimeout(request, 2000), setTimeout(request, 7000)]
    }
    bind()
    const poll = setInterval(bind, 500)
    return () => { clearInterval(poll); detach() }
  }, [])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update(); preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => () => { if (scene.fog === saunaFog) scene.fog = ordinaryFog.current }, [scene, saunaFog])

  const doorwayOccupied = () => {
    const local = window.__localPlayerPosition
    if (local && isInSaunaDoorSweep(floor, local)) return true
    return Object.values((window as any).__livePlayerData || {}).some((player: any) =>
      player.position && Date.now() - player.lastUpdate < 5000 && isInSaunaDoorSweep(floor, player.position))
  }
  useBeforePhysicsStep(world => {
    if (!body.current) return
    const target = door.current.closed ? 0 : OPEN_ANGLE
    if (Math.abs(target - angle.current) > .001 && !doorwayOccupied()) {
      const step = Math.min(world.timestep, .05) * 2.4
      angle.current = reducedMotion.current ? target : angle.current + THREE.MathUtils.clamp(target - angle.current, -step, step)
    }
    body.current.setNextKinematicRotation({ x: 0, y: Math.sin(angle.current / 2), z: 0, w: Math.cos(angle.current / 2) })
  })
  useFrame(({ camera }, delta) => {
    const player = window.__localPlayerPosition
    const interact = !!window.__localPlayerInteract || !!getActiveGamepad()?.buttons[2]?.pressed
    const pressed = interact && !held.current
    held.current = interact
    const near = !!player && canUseSaunaDoor(floor, player)
    const blocked = near && doorwayOccupied()
    if (near && pressed && !blocked && document.visibilityState === 'visible') {
      const manager = window.connectionManager as ConnectionManager | undefined
      const state = { closed: !door.current.closed, changedAt: Math.max(Date.now(), door.current.changedAt + 1),
        actor: manager?.getPlayerId() || offlineId }
      accept(state)
      manager?.sendMessage({ type: 'game_event', event: { event_type: 'sauna_door', state } })
    }
    const text = near ? blocked ? 'Step clear of the swinging door' :
      `${door.current.closed ? 'Open' : 'Close'} sauna · F / X (□) · Touch Use` : null
    if (text !== hintRef.current) { hintRef.current = text; setHint(text) }
    humidity.current = stepSaunaFog(humidity.current, door.current.closed && Math.abs(angle.current) < .04, delta)
    uniforms.humidity.value = humidity.current
    if (scene.fog !== saunaFog) ordinaryFog.current = scene.fog
    if (humidity.current > .01 && isInsideSauna(floor, camera.position)) {
      saunaFog.density = humidity.current * .7
      scene.fog = saunaFog
    } else if (scene.fog === saunaFog) scene.fog = ordinaryFog.current
  })

  return <>
    <RigidBody ref={body} name="sauna-interactive-door" type="kinematicPosition" colliders={false}
      position={[SAUNA_DOOR_HINGE.x, 0, SAUNA_DOOR_HINGE.z]} rotation={[0, OPEN_ANGLE, 0]}>
      <CuboidCollider args={[SAUNA_DOOR_SIZE[0] / 2, SAUNA_DOOR_SIZE[1] / 2, SAUNA_DOOR_SIZE[2] / 2]}
        position={[.94, 1.43, 0]} />
      <group name={closed ? 'sauna-closed-glass-door' : 'sauna-open-glass-door'}>
        <mesh position={[.94, 1.43, 0]} userData={{ caveSolid: true }}>
          <boxGeometry args={[1.74, 2.54, .035]} />
          <meshStandardMaterial color="#bfd1c2" opacity={.2} transparent roughness={.18} metalness={.1} depthWrite={false} />
        </mesh>
        <mesh name="sauna-steamy-door-glass" position={[.94, 1.43, .022]} raycast={() => {}}>
          <planeGeometry args={[1.74, 2.54]} />
          <shaderMaterial uniforms={uniforms} vertexShader={fogVertex} fragmentShader={fogFragment}
            transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {[.035, 1.845].map(x => <mesh key={x} position={[x, 1.43, 0]} userData={{ caveSolid: true }}>
          <boxGeometry args={[.07, 2.68, .07]} /><meshStandardMaterial color="#754a31" roughness={.83} />
        </mesh>)}
        {[.125, 2.735].map(y => <mesh key={y} position={[.94, y, 0]} userData={{ caveSolid: true }}>
          <boxGeometry args={[1.88, .07, .07]} /><meshStandardMaterial color="#754a31" roughness={.83} />
        </mesh>)}
        <mesh position={[1.58, 1.38, .1]}>
          <cylinderGeometry args={[.035, .035, .44, 8]} /><meshStandardMaterial color="#d6a56e" roughness={.75} />
        </mesh>
      </group>
    </RigidBody>
    {[-1, 1].map(side => <mesh key={side} name="sauna-steamy-window-glass" position={[side * 1.66, 1.72, 2.347]}
      raycast={() => {}}>
      <planeGeometry args={[1.2, 2.03]} />
      <shaderMaterial uniforms={uniforms} vertexShader={fogVertex} fragmentShader={fogFragment}
        transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>)}
    {/* Screen-space hint stays readable even when the door is behind the camera. */}
    {hint && <Html fullscreen calculatePosition={(_object, _camera, size) => [size.width / 2, size.height / 2]}
      onOcclude={() => {}} zIndexRange={[10, 10]} style={{ pointerEvents: 'none' }}>
      <div role="status" data-testid="sauna-door-prompt" style={{ position: 'absolute', bottom: 124, left: '50%',
        transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: '#211a14eb', color: '#ffe1ae',
        border: '1px solid #b78653', borderRadius: 12, padding: '10px 16px', font: '13px system-ui' }}>
        <strong>Sauna door</strong><div>{hint}</div>
      </div>
    </Html>}
  </>
}
