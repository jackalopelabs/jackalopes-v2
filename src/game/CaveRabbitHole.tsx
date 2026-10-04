import { useEffect, useMemo } from 'react'
import { ConvexHullCollider, CylinderCollider, MeshCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { createRabbitHoleGeometries } from './cave-rabbit-hole'
import { RABBIT_HOLE_POSITION } from './rabbit-hole-opening'
import type { TerrainLevelDocument } from './terrain/level-document'

/** A real hopping staircase from the spa bedroom to a small surface burrow. */
export function CaveRabbitHole({ level }: { level: TerrainLevelDocument }) {
  const geometry = useMemo(() => createRabbitHoleGeometries(level), [level])
  const { floor, top } = geometry.layout, { x, z } = RABBIT_HOLE_POSITION
  useEffect(() => () => {
    for (const key of ['steps', 'pillar', 'collar', 'shaft', 'guides'] as const) geometry[key].dispose()
  }, [geometry])
  return <group name="cave-rabbit-hole-escape" userData={{ holographicSkip: true, excludeHolographicVision: true }}>
    <RigidBody type="fixed" colliders={false} friction={.85} name="rabbit-hole-stone-staircase">
      {geometry.treadPoints.map((points, i) => <ConvexHullCollider key={i} args={[points]} />)}
      <CylinderCollider args={[(top - floor - .6) / 2, .48]} position={[x, (top + floor - .6) / 2, z]} />
      <mesh name="rabbit-hole-mineral-jump-steps" geometry={geometry.steps} dispose={null}
        userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={.96} flatShading />
      </mesh>
      <mesh name="rabbit-hole-mineral-rock-spine" geometry={geometry.pillar} dispose={null}
        userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={.97} flatShading />
      </mesh>
      <MeshCollider type="trimesh">
        <mesh name="rabbit-hole-open-chimney" geometry={geometry.shaft} dispose={null} userData={{ caveSolid: true }}>
          <meshStandardMaterial color="#716958" roughness={1} flatShading side={THREE.DoubleSide} />
        </mesh>
        <mesh name="rabbit-hole-surface-stone-collar" geometry={geometry.collar} dispose={null}
          userData={{ caveSolid: true }} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={.96} flatShading />
        </mesh>
      </MeshCollider>
    </RigidBody>
    <mesh name="rabbit-hole-warm-step-markers" geometry={geometry.guides} dispose={null} raycast={() => {}}>
      <meshBasicMaterial color="#ffda92" toneMapped={false} />
    </mesh>
    <pointLight position={[x, floor + 6, z]} color="#ffe0b1" intensity={18} distance={10} decay={1.5} />
    <pointLight position={[x, floor + 14, z]} color="#dedcc3" intensity={16} distance={10} decay={1.5} />
  </group>
}
