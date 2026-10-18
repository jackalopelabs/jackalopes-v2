import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TerrainLevelDocument } from './terrain/level-document'
import { lifeguardMotion } from './cave-lifeguard'
import { adventureCombatState } from './adventure-combat-state'
import { SHARK_BITE_EVENT, SHARK_SPEED, createSharkBiteGate, createSharkPeer, sharkPlayerState, type Shark, type SharkSwimmer } from './water-sharks'

type Network = { sendMessage(message: unknown): unknown; on(event: string, fn: (event: unknown) => void): unknown;
  off(event: string, fn: (event: unknown) => void): unknown; isReadyToSend?(): boolean }
type Props = { level: TerrainLevelDocument; network?: Network | false;
  sample?: () => SharkSwimmer; onBite?: (shark: number) => void }

/** One shared vertex-coloured mesh: body, fins, eyes, gills and teeth. */
function sharkGeometry() {
  const pieces: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, color: string) => {
    const geometry = g.index ? g.toNonIndexed() : g
    if (geometry !== g) g.dispose()
    const c = new THREE.Color(color)
    geometry.deleteAttribute('uv')
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: geometry.getAttribute('position').count }, () => [c.r, c.g, c.b]).flat(), 3))
    pieces.push(geometry)
  }
  const body = new THREE.SphereGeometry(1, 16, 10); body.scale(.66, .55, 2)
  add(body, '#668b9d')
  const belly = new THREE.SphereGeometry(1, 14, 7); belly.scale(.58, .27, 1.7); belly.translate(0, -.28, .12)
  add(belly, '#d7e5df')
  const triangles = new THREE.BufferGeometry()
  triangles.setAttribute('position', new THREE.Float32BufferAttribute([
    0,.35,.1, 0,1.65,-.55, 0,.35,-1.1,
    -.4,-.12,.5, -1.9,-.28,-.8, -.42,-.14,-.6,
    .4,-.12,.5, .42,-.14,-.6, 1.9,-.28,-.8,
    0,.05,-1.7, 0,1.25,-2.85, 0,-.05,-2.45,
    0,-.05,-1.7, 0,-.05,-2.45, 0,-.85,-2.75,
  ], 3)); triangles.computeVertexNormals(); add(triangles, '#486c80')
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(.115, 7, 5); eye.translate(side * .43, .15, 1.37); add(eye, '#101e2a')
    const glint = new THREE.SphereGeometry(.035, 5, 3); glint.translate(side * .49, .19, 1.4); add(glint, '#f1ffff')
    for (let i = 0; i < 3; i++) {
      const gill = new THREE.BoxGeometry(.016, .26, .045); gill.rotateZ(side * -.22); gill.translate(side * .65, .02, .55 - i * .18); add(gill, '#284855')
    }
  }
  const mouth = new THREE.SphereGeometry(1, 10, 6); mouth.scale(.39, .13, .36); mouth.translate(0, -.24, 1.65); add(mouth, '#243442')
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.ConeGeometry(.055, .16, 3); tooth.rotateX(Math.PI); tooth.translate((i - 2) * .125, -.23, 1.86 - Math.abs(i - 2) * .04); add(tooth, '#fff5dd')
  }
  const geometry = mergeGeometries(pieces, false)!
  pieces.forEach(g => g.dispose())
  return geometry
}

export function WaterSharks({ level, network, sample, onBite }: Props) {
  const manager = useRef<Network>()
  const peer = useMemo(() => createSharkPeer(level, `shark-${Date.now()}-${Math.random().toString(36).slice(2)}`, event => {
    if (manager.current?.isReadyToSend?.() !== false) manager.current?.sendMessage({ type: 'game_event', event })
  }), [level])
  const displayed = useMemo(() => peer.sharks.map(s => ({ ...s })), [peer])
  const biteGate = useMemo(createSharkBiteGate, [peer])
  const geometry = useMemo(sharkGeometry, [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5,
    metalness: .08, side: THREE.DoubleSide, emissive: '#31556a', emissiveIntensity: .3 }), [])
  const time = useMemo(() => ({ value: 0 }), [])
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const chomps = useRef<number[]>([])
  const cueUntil = useRef(0), [caught, setCaught] = useState(false)
  const cue = useRef<THREE.Group>(null)
  const lastFrame = useRef(0)
  const sampleRef = useRef(sample); sampleRef.current = sample
  useEffect(() => {
    material.onBeforeCompile = shader => {
      shader.uniforms.sharkTime = time
      shader.vertexShader = 'uniform float sharkTime;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.x += sin(sharkTime * 4.6 + position.z * 2.2) * .3 * smoothstep(.7, 2.7, -position.z);`)
    }
    material.customProgramCacheKey = () => 'water-shark-tail-v1'
    return () => { geometry.dispose(); material.dispose() }
  }, [geometry, material, time])
  useEffect(() => {
    biteGate.reset(performance.now())
    let bound: Network | undefined
    const receive = (event: unknown) => {
      const id = peer.receive(event, performance.now())
      if (id !== null) chomps.current[id] = performance.now() + 700
    }
    const bind = () => {
      const next = network === false ? undefined : network || window.connectionManager
      if (next === bound) return
      bound?.off('game_event', receive); bound = next; manager.current = next
      peer.reset(); biteGate.reset(performance.now())
      bound?.on('game_event', receive)
    }
    const reset = () => { peer.reset(); biteGate.reset(performance.now()); biteGate.protect(performance.now()) }
    const visibility = () => { biteGate.reset(performance.now()); lastFrame.current = 0 }
    bind(); const timer = setInterval(bind, 750)
    window.addEventListener('player_respawned', reset)
    window.addEventListener('jackalopesRoundReset', reset)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearInterval(timer); bound?.off('game_event', receive); manager.current = undefined; peer.reset()
      window.removeEventListener('player_respawned', reset); window.removeEventListener('jackalopesRoundReset', reset)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [peer, network, biteGate])
  useFrame((_, delta) => {
    const now = performance.now(), visible = document.visibilityState === 'visible'
    const paused = !lastFrame.current || now - lastFrame.current > 250
    lastFrame.current = now
    if (paused) biteGate.reset(now)
    const source = sampleRef.current?.() ?? {
      x: lifeguardMotion.x, y: lifeguardMotion.y, z: lifeguardMotion.z,
      enabled: lifeguardMotion.enabled && now - lifeguardMotion.at < 250,
      swimming: lifeguardMotion.swimming, riding: lifeguardMotion.riding,
      immune: Date.now() < sharkPlayerState.immuneUntil || Date.now() < adventureCombatState.immuneUntil,
    }
    peer.step(source, now, paused ? 0 : delta, visible)
    time.value = now / 1000
    const dt = Math.min(.05, Math.max(0, delta))
    for (let i = 0; i < peer.sharks.length; i++) {
      const state = peer.sharks[i], shown = displayed[i], mesh = meshes.current[i]
      if (!mesh) continue
      // Snapshot interpolation has the same absolute speed cap as the simulator.
      const dx = state.x - shown.x, dy = state.y - shown.y, dz = state.z - shown.z, length = Math.hypot(dx, dy, dz)
      const amount = length > .00001 ? Math.min(1, SHARK_SPEED * dt / length) : 0
      shown.x += dx * amount; shown.y += dy * amount; shown.z += dz * amount
      shown.heading = state.heading
      mesh.position.set(shown.x, shown.y, shown.z)
      mesh.rotation.y = shown.heading
      const chomp = Math.max(0, (chomps.current[i] - now) / 700) || 0
      mesh.rotation.x = -Math.sin(chomp * Math.PI * 2) * .12
      mesh.scale.set(1, 1 + Math.sin(chomp * Math.PI) * .14, 1)
    }
    if (cue.current) cue.current.position.set(source.x, source.y + 2.2, source.z)
    if (caught && now > cueUntil.current) setCaught(false)
    if (!visible || paused) return
    const id = biteGate.tryBite(level, displayed, source, now, peer.fresh(now))
    if (id === null) return
    chomps.current[id] = now + 700; cueUntil.current = now + 2400; setCaught(true)
    peer.chomp(id, now)
    if (onBite) onBite(id)
    else window.dispatchEvent(new CustomEvent(SHARK_BITE_EVENT, { detail: { shark: id } }))
  })
  return <group name="water-sharks" userData={{ holographicSkip: true }}>
    {displayed.map((shark: Shark, i: number) => <mesh key={shark.id} ref={el => { meshes.current[i] = el }}
      name={`water-shark-${shark.id}`} geometry={geometry} material={material} dispose={null} frustumCulled={false} />)}
    <group ref={cue}>{caught && <Html center style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }} zIndexRange={[26, 0]}>
      <div role="status" style={{ background: '#102f47ee', color: '#e6faff', border: '2px solid #69b9cc', borderRadius: 14,
        padding: '9px 14px', font: 'bold 14px sans-serif' }}>🦈 Chomp! A shark got you!</div>
    </Html>}</group>
  </group>
}
