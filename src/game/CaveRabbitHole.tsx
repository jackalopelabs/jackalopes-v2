import { useEffect, useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { createRabbitHoleGeometries, createSpiralWaterslide } from './cave-rabbit-hole'
import { RABBIT_HOLE_POSITION } from './rabbit-hole-opening'
import { CaveWaterslide } from './CaveWaterslide'
import type { TerrainLevelDocument } from './terrain/level-document'

/** Spiral waterslide from the small surface burrow down into the spa bedroom. */
export function CaveRabbitHole({ level }: { level: TerrainLevelDocument }) {
  const geometry = useMemo(() => createRabbitHoleGeometries(level), [level])
  const slide = useMemo(() => createSpiralWaterslide(level), [level])
  const { floor, top } = geometry.layout, { x, z } = RABBIT_HOLE_POSITION
  useEffect(() => () => {
    for (const key of ['collar', 'shaft', 'guides', 'landing'] as const) geometry[key].dispose()
  }, [geometry])
  return <group name="cave-rabbit-hole-escape" userData={{ holographicSkip: true, excludeHolographicVision: true }}>
    <RigidBody type="fixed" colliders="trimesh" name="rabbit-hole-slide-opening">
      <mesh name="rabbit-hole-open-chimney" geometry={geometry.shaft} dispose={null} userData={{ caveSolid: true }}>
        <meshStandardMaterial color="#716958" roughness={1} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh name="rabbit-hole-surface-stone-collar" geometry={geometry.collar} dispose={null}
        userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={.96} flatShading />
      </mesh>
      <mesh name="rabbit-hole-slide-boarding-deck" geometry={geometry.landing} dispose={null}
        userData={{ caveSolid: true }} receiveShadow>
        <meshStandardMaterial color="#368e91" metalness={.12} roughness={.6} />
      </mesh>
    </RigidBody>
    <RigidBody type="fixed" colliders={false} name="rabbit-hole-slide-core">
      <CylinderCollider args={[(top - floor) / 2, .24]} position={[x, (top + floor) / 2, z]} />
      <mesh position={[x, (top + floor) / 2, z]} userData={{ caveSolid: true }}>
        <cylinderGeometry args={[.24, .24, top - floor, 10]} />
        <meshStandardMaterial color="#596e6c" metalness={.55} roughness={.45} />
      </mesh>
    </RigidBody>
    <CaveWaterslide layout={slide} compact label="SPIRAL SLIDE" name="rabbit-hole-spiral-waterslide" />
    <mesh name="rabbit-hole-slide-guide-lights" geometry={geometry.guides} dispose={null} raycast={() => {}}>
      <meshBasicMaterial color="#ffda92" toneMapped={false} />
    </mesh>
    <pointLight position={[x, floor + 6, z]} color="#ffe0b1" intensity={18} distance={10} decay={1.5} />
    <pointLight position={[x, floor + 14, z]} color="#dedcc3" intensity={16} distance={10} decay={1.5} />
  </group>
}
