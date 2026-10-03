import { useAdventureDestructible, isAdventureObjectDestroyed } from './adventure-destructibles'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { loadTerrainLevel } from './terrain/level-document'
import { canEatGoldenMushroom, goldenMushroomPosition, GOLDEN_MUSHROOM_REGROW_MS } from './golden-mushroom'

export function GoldenMushroom({ onEat }: { onEat: () => void }) {
  const position = useMemo(() => goldenMushroomPosition(loadTerrainLevel()), [])
  const { world, rapier } = useRapier()
  const cap = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)
  const [nearby, setNearby] = useState(false)
  const nearbyRef = useRef(false)
  const lastInteract = useRef(false)
  const availableAt = useRef(0)
  const [available, setAvailable] = useState(true)
  const destroyedByWeapon = useAdventureDestructible('golden-mushroom', position, 0.9, available, 0.9)
  const rayDirection = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const reset = () => { availableAt.current = 0; setAvailable(true); lastInteract.current = false }
    window.addEventListener('jackalopesRoundReset', reset)
    return () => window.removeEventListener('jackalopesRoundReset', reset)
  }, [])

  useFrame(({ clock }) => {
    if (destroyedByWeapon || isAdventureObjectDestroyed('golden-mushroom')) return
    const now = Date.now()
    if (!available && now >= availableAt.current) setAvailable(true)
    const player = window.__localPlayerPosition
    const interact = !!window.__localPlayerInteract
    let close = !!player && canEatGoldenMushroom(player, position,
      window.jackalopesGame?.playerType === 'jackalope', availableAt.current, now)
    if (close && player) {
      rayDirection.set(position[0] - player.x, position[1] + 0.9 - player.y, position[2] - player.z)
      const distance = rayDirection.length()
      if (distance > 0.01) {
        rayDirection.normalize()
        const hit = world.castRay(new rapier.Ray(player, rayDirection), distance, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS)
        if (hit && hit.timeOfImpact < distance - 0.1) close = false
      }
    }
    if (close !== nearbyRef.current) { nearbyRef.current = close; setNearby(close) }
    if (close && interact && !lastInteract.current) {
      // Set the ref immediately: a held button or duplicate frame cannot consume twice.
      availableAt.current = now + GOLDEN_MUSHROOM_REGROW_MS
      setAvailable(false)
      setNearby(false)
      nearbyRef.current = false
      onEat()
    }
    lastInteract.current = interact
    if (cap.current) cap.current.position.y = Math.sin(clock.elapsedTime * 1.8) * 0.035
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.5) * 0.1)
  })

  if (!available || destroyedByWeapon) return null
  return <group name="golden-mushroom" position={position} userData={{ excludeHolographicVision: true }}>
    <mesh position={[0, 0.4, 0]} castShadow>
      <cylinderGeometry args={[0.16, 0.24, 0.8, 9]} />
      <meshStandardMaterial color="#ead4a1" emissive="#7d4812" emissiveIntensity={0.3} roughness={0.65} />
    </mesh>
    <group ref={cap}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <sphereGeometry args={[0.72, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ffd25a" emissive="#ffb727" emissiveIntensity={1.3} metalness={0.55} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.83, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 20]} />
        <meshBasicMaterial color="#bd791b" side={THREE.DoubleSide} />
      </mesh>
      {[[0, 1.51, 0], [0.36, 1.34, 0.24], [-0.3, 1.4, 0.22], [0.22, 1.4, -0.3]].map((spot, index) => <mesh key={index} position={spot as [number, number, number]}>
        <sphereGeometry args={[0.065, 7, 7]} /><meshBasicMaterial color="#fff0b0" />
      </mesh>)}
    </group>
    <mesh ref={halo} position={[0, 0.9, 0]}>
      <sphereGeometry args={[0.95, 16, 12]} />
      <meshBasicMaterial color="#ffbd42" transparent opacity={0.055} depthWrite={false} />
    </mesh>
    <pointLight position={[0, 1.2, 0]} color="#ffcb55" intensity={2} distance={7} decay={2} />
    {nearby && <Html center position={[0, 2.4, 0]} occlude style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      <div style={{ padding: '9px 13px', borderRadius: 12, color: '#fff0b3', border: '1px solid #ad873e', background: 'rgba(26,21,13,.92)', fontFamily: 'system-ui', textAlign: 'center', fontSize: 12 }}>
        <strong>Golden mushroom</strong><div style={{ marginTop: 3 }}>F / X (Square) · Eat</div>
      </div>
    </Html>}
  </group>
}
