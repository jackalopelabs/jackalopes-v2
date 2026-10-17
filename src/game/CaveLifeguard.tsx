import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { JackalopeModel } from './JackalopeModel'
import { createLifeguardRules, createGuardReactionGate, guardMessage, LIFEGUARD, lifeguardMotion,
  type GuardMotion, type GuardReason, type GuardEvent } from './cave-lifeguard'
import { createLifeguardWhistle } from './lifeguard-whistle'
import type { TerrainLevelDocument } from './terrain/level-document'

type Network = { sendMessage(message: unknown): unknown; on(event: string, fn: (value: unknown) => void): unknown;
  off(event: string, fn: (value: unknown) => void): unknown }
type Props = { level: TerrainLevelDocument; network?: Network | false;
  /** Inert scenario harness only; production reads the local adventure controller sample. */
  sample?: () => GuardMotion; onReaction?: (reason: GuardReason, remote: boolean) => void }
function guardSign() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192
  const c = canvas.getContext('2d')!
  c.fillStyle = '#f4eddf'; c.fillRect(0, 0, 512, 192)
  c.strokeStyle = '#ba3843'; c.lineWidth = 12; c.strokeRect(6, 6, 500, 180)
  c.textAlign = 'center'; c.fillStyle = '#b72837'; c.font = 'bold 58px sans-serif'; c.fillText('LIFEGUARD', 256, 82)
  c.fillStyle = '#254b52'; c.font = '29px sans-serif'; c.fillText('WALK · SLIDE DOWN · HAVE FUN', 256, 145)
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture
}

/** A friendly fixed shore lookout, not an AI actor or a movement collider. */
export function CaveLifeguard({ level, network, sample, onReaction }: Props) {
  const rules = useMemo(() => createLifeguardRules(level), [level]), sign = useMemo(guardSign, [])
  const receiveRef = useRef<(value: unknown, remote: boolean) => void>(() => {})
  const sendRef = useRef<Network>(), sound = useRef<ReturnType<typeof createLifeguardWhistle>>()
  const gate = useMemo(createGuardReactionGate, []), actor = useMemo(() => `guard-${Date.now()}-${Math.random().toString(36).slice(2)}`, [])
  const preference = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])
  const sequence = useRef(0), elapsed = useRef(0), warnedUntil = useRef(0), lookout = useRef<THREE.Group>(null)
  const [cue, setCue] = useState<GuardReason | null>(null)
  const cueRef = useRef<GuardReason | null>(null)
  const { x, y, z } = rules.position
  useEffect(() => { sound.current = createLifeguardWhistle(network !== false); return () => { sound.current?.dispose(); sound.current = undefined; rules.reset() } }, [rules, network])
  useEffect(() => () => sign.dispose(), [sign])
  receiveRef.current = (value, remote) => {
    if (document.visibilityState !== 'visible') return
    // Validate the claimed offense is actually in this cave, before consuming a reaction slot.
    const event = value as GuardEvent | null
    if (!event || !Array.isArray(event.position) || event.position.length !== 3 ||
      !rules.inCave({ x: event.position[0], y: event.position[1], z: event.position[2] })) return
    const now = performance.now(), accepted = gate(value, now)
    if (!accepted) return
    const local = sample?.() ?? lifeguardMotion
    if (!rules.inCave(local)) return
    const distance = Math.hypot(local.x - x, local.y - y - 2.7, local.z - z)
    if (distance > LIFEGUARD.range) return
    sound.current?.play(distance)
    warnedUntil.current = now + 2300
    cueRef.current = accepted.reason; setCue(accepted.reason)
    onReaction?.(accepted.reason, remote)
  }
  useEffect(() => {
    if (network === false) return
    let manager: Network | undefined
    const receive = (event: unknown) => receiveRef.current(event, true)
    const bind = () => {
      const next = network || (window as unknown as { connectionManager?: Network }).connectionManager
      if (manager === next) return
      manager?.off('game_event', receive); manager = next; sendRef.current = next
      manager?.on('game_event', receive)
    }
    bind(); const poll = setInterval(bind, 750)
    return () => { clearInterval(poll); manager?.off('game_event', receive); sendRef.current = undefined }
  }, [network])
  useFrame((_, dt) => {
    const now = performance.now()
    if (lookout.current) {
      const reduced = preference.matches
      lookout.current.rotation.y = -.65 + (!reduced && now < warnedUntil.current ? Math.sin((warnedUntil.current - now) / 400) * .13 : 0)
    }
    if (cueRef.current && now > warnedUntil.current) { cueRef.current = null; setCue(null) }
    elapsed.current += dt
    if (elapsed.current < .09) return
    elapsed.current = 0
    const motion = sample?.() ?? lifeguardMotion
    if (document.visibilityState !== 'visible') { rules.reset(); return }
    const reason = rules.step(motion, now)
    if (!reason) return
    const event: GuardEvent = { event_type: 'cave_lifeguard', id: `${actor}-${++sequence.current}`,
      reason, at: Date.now(), position: [motion.x, motion.y, motion.z] }
    receiveRef.current(event, false)
    sendRef.current?.sendMessage({ type: 'game_event', event })
  })
  return <group name="cave-main-pool-lifeguard" position={[x, y, z]} userData={{ holographicSkip: true }}>
    {/* A low lookout sits entirely at the shore margin, with no gameplay collider. */}
    <mesh position={[0, .65, 0]}><boxGeometry args={[2.6, .18, 2.4]} /><meshStandardMaterial color="#dfc7a1" roughness={.85} /></mesh>
    {[-1, 1].flatMap(a => [-.85, .85].map(b => <mesh key={`${a},${b}`} position={[a, .3, b]}><boxGeometry args={[.16, .65, .16]} /><meshStandardMaterial color="#8b6050" roughness={.9} /></mesh>))}
    <mesh position={[0, 1.28, .7]}><boxGeometry args={[1.6, 1.15, .15]} /><meshStandardMaterial color="#f0e6d6" roughness={.75} /></mesh>
    <mesh position={[0, .87, 0]}><boxGeometry args={[1.6, .18, 1.3]} /><meshStandardMaterial color="#c73d4c" roughness={.7} /></mesh>
    <group ref={lookout} position={[0, .96, -.18]} rotation={[0, -.65, 0]}>
      <JackalopeModel scale={[2.2, 2.2, 2.2]} />
      <mesh name="lifeguard-red-visor" position={[0, 1.55, -.28]} rotation={[.08, 0, 0]}><cylinderGeometry args={[.47, .47, .1, 16]} /><meshStandardMaterial color="#dd3f4e" roughness={.7} /></mesh>
      <mesh position={[0, 1.56, -.57]}><boxGeometry args={[.65, .06, .4]} /><meshStandardMaterial color="#dd3f4e" /></mesh>
      <mesh position={[0, 1.61, -.46]}><boxGeometry args={[.13, .025, .3]} /><meshBasicMaterial color="#fff6e8" /></mesh>
      <mesh name="lifeguard-lanyard" position={[0, 1.12, -.49]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.26, .025, 6, 18]} /><meshStandardMaterial color="#f8efe0" /></mesh>
      <mesh name="lifeguard-whistle" position={[0, .9, -.57]} rotation={[0, 0, -.25]}><boxGeometry args={[.17, .12, .22]} /><meshStandardMaterial color="#dbe1e3" metalness={.65} roughness={.25} /></mesh>
    </group>
    <mesh name="lifeguard-sign" position={[0, 2.8, .96]}><planeGeometry args={[3.2, 1.2]} /><meshBasicMaterial map={sign} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <mesh position={[1.25, 1.3, -.25]} rotation={[0, -.65, 0]}><torusGeometry args={[.44, .12, 8, 20]} /><meshStandardMaterial color="#e3545b" roughness={.55} /></mesh>
    {cue && <Html center position={[0, 4, 0]} zIndexRange={[25, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      <div role="status" style={{ padding: '8px 13px', background: '#f4eddfed', color: '#923340', border: '2px solid #c94e59', borderRadius: 12, font: 'bold 14px sans-serif' }}>♪ {guardMessage(cue)}</div>
    </Html>}
  </group>
}
