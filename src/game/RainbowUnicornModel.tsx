import { useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export type UnicornLocomotion = 'idle' | 'walk' | 'run' | 'swim'

export function RainbowUnicornModel({
  position = [0, 0, 0], scale = 1, yaw = 0, locomotion = 'idle', locomotionRef, phase = 0, ambient = false,
}: {
  position?: [number, number, number]
  scale?: number
  yaw?: number
  locomotion?: UnicornLocomotion
  locomotionRef?: MutableRefObject<UnicornLocomotion>
  phase?: number
  ambient?: boolean
}) {
  const root = useRef<THREE.Group>(null)
  const pose = useRef<THREE.Group>(null)
  const legs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + phase
    const currentLocomotion = locomotionRef?.current ?? locomotion
    const swimming = currentLocomotion === 'swim'
    const moving = currentLocomotion === 'walk' || currentLocomotion === 'run'
    const rate = currentLocomotion === 'run' ? 9 : currentLocomotion === 'walk' ? 5.5 : swimming ? 3.2 : 1.5
    const stride = currentLocomotion === 'run' ? .52 : currentLocomotion === 'walk' ? .34 : swimming ? .62 : .055
    legs.current.forEach((leg, index) => {
      if (leg) leg.rotation.x = Math.sin(t * rate + (index % 2) * Math.PI) * stride
    })
    if (pose.current) {
      pose.current.rotation.x = THREE.MathUtils.damp(pose.current.rotation.x, swimming ? -.16 : 0, 7, Math.min(delta, .05))
      pose.current.position.y = THREE.MathUtils.damp(pose.current.position.y, ambient ? Math.sin(t * 1.7) * .07 : (moving && !swimming ? Math.abs(Math.sin(t * rate)) * .08 : swimming ? Math.sin(t * rate) * .035 : 0), 8, Math.min(delta, .05))
    }
    if (root.current && ambient) root.current.position.y = position[1] + Math.sin(t * 1.3) * .08
  })
  const mane = ['#ff5d9d', '#ffb85e', '#fff06d', '#6de0a0', '#73dff4', '#a18bff']
  return <group ref={root} position={position} rotation={[0, yaw, 0]} scale={scale} name="rainbow-unicorn-model">
    {/* Local forward is +Z, matching the existing player group's +PI yaw convention. */}
    <group ref={pose} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 1.34, .05]} scale={[.58, .66, 1.22]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#fff0ea" roughness={.72} /></mesh>
      <mesh position={[0, 1.97, -.58]} rotation={[-.48, 0, 0]} scale={[.42, .84, .45]} castShadow><capsuleGeometry args={[.29, 1, 5, 10]} /><meshStandardMaterial color="#fff0ea" roughness={.72} /></mesh>
      <mesh position={[0, 2.54, -.93]} scale={[.36, .34, .52]} castShadow><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color="#fff0ea" roughness={.72} /></mesh>
      <mesh position={[0, 2.37, -1.28]} scale={[.28, .2, .34]} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#ffd9e7" roughness={.72} /></mesh>
      {[-1, 1].map(side => <group key={side}>
        <mesh position={[side * .25, 2.67, -1.04]}><sphereGeometry args={[.065, 8, 6]} /><meshStandardMaterial color="#562d4b" /></mesh>
        <mesh position={[side * .18, 2.91, -.9]} rotation={[side * -.18, 0, side * -.12]}><coneGeometry args={[.14, .44, 7]} /><meshStandardMaterial color={side < 0 ? '#ff8fbd' : '#b69aff'} roughness={.7} /></mesh>
      </group>)}
      <mesh position={[0, 3.02, -1.2]} rotation={[-.35, 0, 0]}><coneGeometry args={[.13, .62, 8]} /><meshStandardMaterial color="#fff4a5" emissive="#ffe795" emissiveIntensity={.34} metalness={.08} roughness={.36} /></mesh>
      {[-1, 1, -1, 1].map((side, index) => <group key={index} ref={node => { legs.current[index] = node }} position={[side * .34, .76, index < 2 ? -.66 : .79]}>
        <mesh position={[0, -.28, 0]} castShadow><capsuleGeometry args={[.115, .6, 4, 8]} /><meshStandardMaterial color="#fff0ea" roughness={.72} /></mesh>
        <mesh position={[0, -.66, -.025]} castShadow><boxGeometry args={[.27, .18, .32]} /><meshStandardMaterial color="#704766" roughness={.48} /></mesh>
      </group>)}
      {mane.map((shade, index) => <mesh key={shade} position={[0, 2.35 - index * .12, -.62 + index * .11]} scale={[.29, .2, .28]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={shade} roughness={.55} /></mesh>)}
      {mane.slice(0, 5).map((shade, index) => <mesh key={`tail-${shade}`} position={[0, 1.74 - index * .11, 1.17 + index * .1]} rotation={[.25, 0, 0]} scale={[.16, .16, .38]}><sphereGeometry args={[1, 9, 7]} /><meshStandardMaterial color={shade} roughness={.55} /></mesh>)}
    </group>
  </group>
}
