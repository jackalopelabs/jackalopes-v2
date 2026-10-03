import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { caveFloorAt } from './adventure-caves'
import type { TerrainLevelDocument } from './terrain/level-document'

// The opposite dry corner; set forward to clear the angled back-right wall.
export const DADDY_BED_POSITION = { x: 16, z: -184.6 } as const

/** Daddy's restful cave corner, with dark wood, tailored bedding and a warm lamp. */
export function DaddyCaveRoom({ level }: { level: TerrainLevelDocument }) {
  const floor = caveFloorAt(level, DADDY_BED_POSITION.x, DADDY_BED_POSITION.z)
  if (floor === null) return null

  return <group name="daddy-cave-room" position={[DADDY_BED_POSITION.x, floor, DADDY_BED_POSITION.z]}
    userData={{ holographicSkip: true, excludeHolographicVision: true }}>
    <RoundedBox name="daddy-teal-rug-border" args={[5, 0.035, 5.4]} radius={0.012} smoothness={2}
      position={[0, 0.025, 0.2]} receiveShadow>
      <meshStandardMaterial color="#398c8b" roughness={1} />
    </RoundedBox>
    <RoundedBox name="daddy-charcoal-woven-rug" args={[4.76, 0.025, 5.16]} radius={0.01} smoothness={2}
      position={[0, 0.05, 0.2]} receiveShadow>
      <meshStandardMaterial color="#304447" roughness={1} />
    </RoundedBox>
    {[-1.9, -1.65, 1.65, 1.9].map(x => <mesh key={x} position={[x, 0.065, 0.2]}>
      <boxGeometry args={[0.045, 0.006, 4.92]} />
      <meshStandardMaterial color="#66817c" roughness={1} />
    </mesh>)}

    <RigidBody type="fixed" colliders={false} name="daddy-dark-wood-bed">
      <CuboidCollider args={[1.38, 0.46, 1.8]} position={[0, 0.63, 0]} friction={0.85} />
      <CuboidCollider args={[1.46, 0.85, 0.14]} position={[0, 1.13, -1.87]} />
      {[-1.12, 1.12].flatMap(x => [-1.5, 1.5].map(z => <mesh key={`${x}:${z}`} position={[x, 0.2, z]}>
        <boxGeometry args={[0.15, 0.3, 0.15]} />
        <meshStandardMaterial color="#252c31" roughness={0.65} metalness={0.35} />
      </mesh>))}
      <RoundedBox name="daddy-walnut-platform" args={[2.76, 0.32, 3.6]} radius={0.045} smoothness={2}
        position={[0, 0.43, 0]} userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial color="#594335" roughness={0.84} />
      </RoundedBox>
      <RoundedBox name="daddy-walnut-headboard" args={[2.92, 1.7, 0.28]} radius={0.04} smoothness={2}
        position={[0, 1.13, -1.87]} userData={{ caveSolid: true }} castShadow>
        <meshStandardMaterial color="#594335" roughness={0.84} />
      </RoundedBox>
      {[-0.88, 0, 0.88].map(x => <RoundedBox key={x} name="daddy-navy-headboard-panel"
        args={[0.82, 1.25, 0.1]} radius={0.045} smoothness={2} position={[x, 1.17, -1.7]} castShadow>
        <meshStandardMaterial color="#263b57" roughness={1} />
      </RoundedBox>)}
      <RoundedBox name="daddy-ivory-mattress" args={[2.56, 0.3, 3.35]} radius={0.12} smoothness={3}
        position={[0, 0.71, 0]} userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial color="#e4e5d9" roughness={1} />
      </RoundedBox>
      <RoundedBox name="daddy-teal-quilt" args={[2.64, 0.24, 2.5]} radius={0.11} smoothness={3}
        position={[0, 0.94, 0.35]} castShadow receiveShadow>
        <meshStandardMaterial color="#278b91" roughness={1} emissive="#278b91" emissiveIntensity={0.035} />
      </RoundedBox>
      {[-0.47, -0.15, 0.17, 0.49].map(z => <mesh key={z} name="daddy-quilt-stitch" position={[0, 1.063, z]}>
        <boxGeometry args={[2.4, 0.006, 0.018]} />
        <meshStandardMaterial color="#52a1a2" roughness={1} />
      </mesh>)}
      <RoundedBox name="daddy-navy-quilt-fold" args={[2.62, 0.11, 0.35]} radius={0.045} smoothness={3}
        position={[0, 1.085, -0.73]} castShadow>
        <meshStandardMaterial color="#294867" roughness={1} />
      </RoundedBox>
      <RoundedBox name="daddy-forest-green-throw" args={[2.68, 0.13, 0.88]} radius={0.045} smoothness={3}
        position={[0, 1.115, 1.13]} castShadow>
        <meshStandardMaterial color="#36634d" roughness={1} emissive="#36634d" emissiveIntensity={0.04} />
      </RoundedBox>
      {[0.84, 1.41].map(z => <mesh key={z} position={[0, 1.184, z]}>
        <boxGeometry args={[2.5, 0.008, 0.065]} />
        <meshStandardMaterial color="#729581" roughness={1} />
      </mesh>)}
      {[-0.65, 0.65].map(x => <RoundedBox key={x} name="daddy-navy-pillow" args={[1.04, 0.28, 0.64]}
        radius={0.125} smoothness={3} position={[x, 1.035, -1.22]} rotation={[0.12, x * 0.06, 0]} castShadow>
        <meshStandardMaterial color="#2c496a" roughness={1} />
      </RoundedBox>)}
      <RoundedBox name="daddy-green-lumbar-cushion" args={[1.14, 0.32, 0.42]} radius={0.13} smoothness={3}
        position={[0, 1.2, -0.98]} rotation={[0.15, 0, 0]} castShadow>
        <meshStandardMaterial color="#527c60" roughness={1} />
      </RoundedBox>
    </RigidBody>

    <RigidBody type="fixed" colliders={false} name="daddy-walnut-nightstand">
      <CuboidCollider args={[0.4, 0.41, 0.4]} position={[-2.05, 0.46, -1.22]} />
      <RoundedBox args={[0.8, 0.12, 0.8]} radius={0.035} smoothness={2}
        position={[-2.05, 0.82, -1.22]} userData={{ caveSolid: true }} castShadow>
        <meshStandardMaterial color="#6c5040" roughness={0.8} />
      </RoundedBox>
      <RoundedBox args={[0.71, 0.72, 0.71]} radius={0.025} smoothness={2}
        position={[-2.05, 0.44, -1.22]} userData={{ caveSolid: true }} castShadow>
        <meshStandardMaterial color="#48382f" roughness={0.88} />
      </RoundedBox>
      <mesh position={[-2.05, 0.57, -0.857]}>
        <boxGeometry args={[0.22, 0.045, 0.035]} />
        <meshStandardMaterial color="#b39769" roughness={0.5} metalness={0.55} />
      </mesh>
      <mesh position={[-2.05, 0.91, -1.22]}>
        <cylinderGeometry args={[0.2, 0.23, 0.07, 16]} />
        <meshStandardMaterial color="#263239" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[-2.05, 1.16, -1.22]}>
        <cylinderGeometry args={[0.035, 0.035, 0.46, 8]} />
        <meshStandardMaterial color="#b39769" roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh name="daddy-charcoal-lampshade" position={[-2.05, 1.44, -1.22]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.38, 20]} />
        <meshStandardMaterial color="#2c4248" roughness={0.95} />
      </mesh>
      <mesh position={[-2.05, 1.245, -1.22]}>
        <cylinderGeometry args={[0.3, 0.3, 0.015, 20]} />
        <meshStandardMaterial color="#f5d4a1" emissive="#ffd59b" emissiveIntensity={0.65} />
      </mesh>
    </RigidBody>
    <pointLight position={[-2.05, 1.22, -1.22]} color="#ffd5af" intensity={9} distance={10} decay={1.5} />
    <pointLight position={[0, 2.8, 0.2]} color="#ddeee5" intensity={13} distance={9} decay={1.5} />
  </group>
}
