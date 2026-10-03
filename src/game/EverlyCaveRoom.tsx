import { useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { caveFloorAt } from './adventure-caves'
import type { TerrainLevelDocument } from './terrain/level-document'

// The dry back-left corner, beyond the lake and its far shore.
export const EVERLY_BED_POSITION = { x: -16, z: -188.2 } as const

function heartShape() {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.34)
  shape.bezierCurveTo(-0.08, -0.24, -0.43, 0.02, -0.43, 0.24)
  shape.bezierCurveTo(-0.43, 0.53, -0.12, 0.58, 0, 0.35)
  shape.bezierCurveTo(0.12, 0.58, 0.43, 0.53, 0.43, 0.24)
  shape.bezierCurveTo(0.43, 0.02, 0.08, -0.24, 0, -0.34)
  shape.closePath()
  return shape
}

function starShape() {
  const shape = new THREE.Shape()
  for (let point = 0; point < 10; point++) {
    const angle = Math.PI / 2 + point * Math.PI / 5
    const radius = point % 2 === 0 ? 0.13 : 0.06
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
    if (point === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

/** The first piece of Everly's room: a small, solid bed on the dry grotto floor. */
export function EverlyCaveRoom({ level }: { level: TerrainLevelDocument }) {
  const floor = caveFloorAt(level, EVERLY_BED_POSITION.x, EVERLY_BED_POSITION.z)
  const heart = useMemo(heartShape, [])
  const star = useMemo(starShape, [])
  const heartOptions = useMemo(() => ({ depth: 0.16, bevelEnabled: true,
    bevelThickness: 0.055, bevelSize: 0.045, bevelSegments: 3, steps: 1 }), [])
  if (floor === null) return null

  return <group name="everly-cave-room" position={[EVERLY_BED_POSITION.x, floor, EVERLY_BED_POSITION.z]}
    userData={{ holographicSkip: true, excludeHolographicVision: true }}>
    {/* Flat, decorative rug: walking and jumping still use the cave's real floor. */}
    <mesh name="everly-pink-rug-border" position={[0, 0.025, 0.35]} scale={[2.17, 1, 2.83]} receiveShadow>
      <cylinderGeometry args={[1, 1, 0.035, 48]} />
      <meshStandardMaterial color="#df91b0" roughness={1} />
    </mesh>
    <mesh name="everly-soft-cream-rug" position={[0, 0.045, 0.35]} scale={[2.02, 1, 2.67]} receiveShadow>
      <cylinderGeometry args={[1, 1, 0.025, 48]} />
      <meshStandardMaterial color="#f4ddd5" roughness={1} emissive="#f4ddd5" emissiveIntensity={0.025} />
    </mesh>

    <RigidBody type="fixed" colliders={false} name="everly-pink-bed">
      <CuboidCollider args={[1.15, 0.42, 1.66]} position={[0, 0.59, 0]} friction={0.85} />
      <CuboidCollider args={[1.23, 0.84, 0.13]} position={[0, 1.08, -1.72]} />

      {[-0.92, 0.92].flatMap(x => [-1.31, 1.31].map(z =>
        <mesh key={`${x}:${z}`} position={[x, 0.19, z]}>
          <cylinderGeometry args={[0.085, 0.095, 0.28, 8]} />
          <meshStandardMaterial color="#d7b28b" roughness={0.75} />
        </mesh>))}
      <RoundedBox name="everly-blush-bed-frame" args={[2.3, 0.3, 3.35]} radius={0.09} smoothness={3}
        position={[0, 0.4, 0]} userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial color="#d77fa5" roughness={0.88} emissive="#d77fa5" emissiveIntensity={0.035} />
      </RoundedBox>
      <RoundedBox name="everly-rounded-pink-headboard" args={[2.46, 1.68, 0.25]} radius={0.12} smoothness={3}
        position={[0, 1.08, -1.72]} userData={{ caveSolid: true }} castShadow>
        <meshStandardMaterial color="#df98b6" roughness={0.94} emissive="#df98b6" emissiveIntensity={0.055} />
      </RoundedBox>
      <RoundedBox args={[2.1, 1.2, 0.065]} radius={0.025} smoothness={3}
        position={[0, 1.12, -1.57]}>
        <meshStandardMaterial color="#edb5ca" roughness={1} emissive="#edb5ca" emissiveIntensity={0.035} />
      </RoundedBox>
      <RoundedBox name="everly-cream-mattress" args={[2.12, 0.28, 3.1]} radius={0.11} smoothness={3}
        position={[0, 0.67, 0]} userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial color="#fff0e3" roughness={0.98} />
      </RoundedBox>
      <RoundedBox name="everly-pink-duvet" args={[2.18, 0.22, 2.22]} radius={0.1} smoothness={3}
        position={[0, 0.86, 0.35]} castShadow receiveShadow>
        <meshStandardMaterial color="#f1abc8" roughness={1} emissive="#f1abc8" emissiveIntensity={0.06} />
      </RoundedBox>
      <RoundedBox name="everly-folded-duvet" args={[2.17, 0.115, 0.32]} radius={0.05} smoothness={3}
        position={[0, 0.96, -0.6]}>
        <meshStandardMaterial color="#f8d5e1" roughness={1} />
      </RoundedBox>
      <RoundedBox name="everly-rose-blanket" args={[2.2, 0.12, 0.79]} radius={0.05} smoothness={3}
        position={[0, 0.99, 1.02]} castShadow>
        <meshStandardMaterial color="#d868a0" roughness={1} emissive="#d868a0" emissiveIntensity={0.05} />
      </RoundedBox>
      {[-0.53, 0.53].map(x => <RoundedBox key={x} name="everly-plump-pillow"
        args={[0.87, 0.25, 0.59]} radius={0.115} smoothness={3}
        position={[x, 0.95, -1.1]} rotation={[0.13, x * 0.09, 0]} castShadow>
        <meshStandardMaterial color="#ffeadf" roughness={1} emissive="#ffeadf" emissiveIntensity={0.035} />
      </RoundedBox>)}
      <mesh name="everly-heart-cushion" position={[0, 1.16, -1.02]} rotation={[-0.2, 0, 0]} castShadow>
        <extrudeGeometry args={[heart, heartOptions]} />
        <meshStandardMaterial color="#cf5b92" roughness={0.96} emissive="#cf5b92" emissiveIntensity={0.055} />
      </mesh>
      {[[-0.63, -0.22], [0.52, -0.05], [-0.22, 0.37], [0.73, 0.46]].map(([x, z], i) =>
        <mesh key={i} name="everly-duvet-star" position={[x, 0.973, z]}
          rotation={[-Math.PI / 2, 0, i * 0.4]}>
          <shapeGeometry args={[star]} />
          <meshStandardMaterial color="#fff1d3" roughness={1} side={THREE.DoubleSide} />
        </mesh>)}
    </RigidBody>

    <RigidBody type="fixed" colliders={false} name="everly-bedside-table">
      <CuboidCollider args={[0.35, 0.37, 0.35]} position={[1.76, 0.42, -1.06]} />
      <RoundedBox args={[0.7, 0.12, 0.7]} radius={0.04} smoothness={2} position={[1.76, 0.73, -1.06]} castShadow>
        <meshStandardMaterial color="#ddb89b" roughness={0.87} />
      </RoundedBox>
      <RoundedBox args={[0.59, 0.7, 0.59]} radius={0.045} smoothness={2} position={[1.76, 0.4, -1.06]}>
        <meshStandardMaterial color="#f1cfbb" roughness={0.92} />
      </RoundedBox>
      <mesh position={[1.76, 0.81, -1.06]}>
        <cylinderGeometry args={[0.17, 0.2, 0.07, 12]} />
        <meshStandardMaterial color="#ba8b60" roughness={0.62} metalness={0.2} />
      </mesh>
      <mesh position={[1.76, 1.04, -1.06]}>
        <cylinderGeometry args={[0.035, 0.035, 0.44, 8]} />
        <meshStandardMaterial color="#c19a69" roughness={0.65} metalness={0.2} />
      </mesh>
      <mesh name="everly-warm-pink-lampshade" position={[1.76, 1.3, -1.06]}>
        <cylinderGeometry args={[0.18, 0.31, 0.36, 16, 1, true]} />
        <meshStandardMaterial color="#f2bacb" emissive="#ffcea9" emissiveIntensity={0.6}
          roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    </RigidBody>
    <pointLight position={[1.76, 1.28, -1.06]} color="#ffd5af" intensity={9} distance={10} decay={1.5} />
    <pointLight position={[0, 2.8, 0.2]} color="#ffe6dc" intensity={13} distance={9} decay={1.5} />
  </group>
}
