import { useEffect, useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { caveFloorAt } from './adventure-caves'
import { CAVE_SAUNA_POSITION, SAUNA_SOLIDS, createSaunaGeometries } from './cave-sauna'
import type { TerrainLevelDocument } from './terrain/level-document'
import { SaunaDoor } from './SaunaDoor'

function cedarMaterial(grainDirection: 'walls' | 'floor' | 'benches') {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88 })
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCedarPoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCedarPoint = position;')
    const grain = grainDirection === 'walls' ? '(vCedarPoint.x + vCedarPoint.z) * 74.0 + sin(vCedarPoint.y * 2.0) * 1.8' :
      grainDirection === 'floor' ? 'vCedarPoint.x * 74.0 + sin(vCedarPoint.z * 1.9) * 1.8' :
        'vCedarPoint.z * 84.0 + sin(vCedarPoint.x * 2.1) * 1.8'
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCedarPoint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = sin(${grain});
        diffuseColor.rgb *= 0.96 + grain * 0.04;
      `)
  }
  material.customProgramCacheKey = () => `jackalopes-sauna-cedar-${grainDirection}`
  return material
}

function saunaSign() {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 128
  const context = canvas.getContext('2d')!
  context.fillStyle = '#382c25'; context.fillRect(0, 0, 512, 128)
  context.fillStyle = '#f4d8a1'; context.font = '500 64px sans-serif'
  context.textAlign = 'center'; context.textBaseline = 'middle'
  context.fillText('S A U N A', 256, 67)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A warm cedar cabin with a shared interactive door and real, walkable interior. */
export function CaveSauna({ level }: { level: TerrainLevelDocument }) {
  const floor = caveFloorAt(level, CAVE_SAUNA_POSITION.x, CAVE_SAUNA_POSITION.z)
  const geometry = useMemo(createSaunaGeometries, [])
  const materials = useMemo(() => ({ walls: cedarMaterial('walls'), floor: cedarMaterial('floor'),
    benches: cedarMaterial('benches'), trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .84 }) }), [])
  const sign = useMemo(saunaSign, [])
  useEffect(() => () => {
    Object.values(geometry).forEach(part => part.dispose())
    Object.values(materials).forEach(material => material.dispose())
    sign.dispose()
  }, [geometry, materials, sign])
  if (floor === null) return null

  return <group name="cave-cedar-sauna" position={[CAVE_SAUNA_POSITION.x, floor, CAVE_SAUNA_POSITION.z]}
    userData={{ holographicSkip: true, excludeHolographicVision: true }}>
    <RigidBody type="fixed" colliders={false} friction={.85} name="sauna-cabin-and-benches">
      {SAUNA_SOLIDS.map(({ at, size, turn = 0 }, i) => <CuboidCollider key={i}
        args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={at} rotation={[0, turn, 0]} />)}
      {(['walls', 'floor', 'benches', 'trim'] as const).map(part =>
        <mesh key={part} name={`sauna-cedar-${part}`} geometry={geometry[part]} material={materials[part]}
          dispose={null} userData={{ caveSolid: true }} castShadow receiveShadow />)}
      {[-1, 1].map(side => <mesh key={side} name="sauna-front-glass-window" position={[side * 1.66, 1.72, 2.32]}
        userData={{ caveSolid: true }}>
        <boxGeometry args={[1.2, 2.03, .04]} />
        <meshStandardMaterial color="#bdcfc0" opacity={.17} transparent roughness={.18} metalness={.1} depthWrite={false} />
      </mesh>)}
      <RoundedBox name="sauna-charcoal-stone-heater" args={[.79, .96, .79]} radius={.06} smoothness={2}
        position={[1.4, .57, .66]} userData={{ caveSolid: true }} castShadow>
        <meshStandardMaterial color="#303735" roughness={.86} metalness={.3} />
      </RoundedBox>
      <mesh name="sauna-heater-stones" geometry={geometry.stones} dispose={null} userData={{ caveSolid: true }} castShadow>
        <meshStandardMaterial color="#62685e" roughness={.96} flatShading />
      </mesh>
      {[-.2, 0, .2].map(x => <mesh key={x} position={[1.4 + x, .6, 1.06]}>
        <boxGeometry args={[.035, .44, .018]} />
        <meshStandardMaterial color="#f4a65f" emissive="#ed863e" emissiveIntensity={.55} roughness={.8} />
      </mesh>)}
    </RigidBody>
    <SaunaDoor floor={floor} />
    <mesh name="sauna-sign" position={[0, 3.06, 2.443]}>
      <planeGeometry args={[1.72, .43]} />
      <meshStandardMaterial map={sign} roughness={.9} emissive="#c8a076" emissiveIntensity={.12} />
    </mesh>
    <mesh name="sauna-warm-bench-light" position={[0, .83, -1.13]}>
      <boxGeometry args={[3.6, .025, .025]} />
      <meshBasicMaterial color="#ffca82" toneMapped={false} />
    </mesh>
    <RoundedBox name="sauna-folded-towel" args={[.65, .12, .36]} radius={.045} smoothness={2}
      position={[-1.25, 1.08, -1.5]} rotation={[0, -.1, 0]}>
      <meshStandardMaterial color="#e8e2cd" roughness={1} />
    </RoundedBox>
    <mesh name="sauna-cedar-water-bucket" position={[1.48, .7, -.91]}>
      <cylinderGeometry args={[.18, .21, .32, 12, 1, true]} />
      <meshStandardMaterial color="#c79861" roughness={.9} side={THREE.DoubleSide} />
    </mesh>
    {[.6, .8].map(y => <mesh key={y} position={[1.48, y, -.91]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[y === .6 ? .2 : .185, .014, 4, 16]} />
      <meshStandardMaterial color="#52584e" roughness={.7} metalness={.4} />
    </mesh>)}
    <mesh name="sauna-wooden-ladle" position={[1.51, .94, -.89]} rotation={[0, 0, -.55]}>
      <cylinderGeometry args={[.018, .018, .47, 8]} />
      <meshStandardMaterial color="#dfb580" roughness={.9} />
    </mesh>
    <pointLight position={[0, 2.65, -1.6]} color="#ffc584" intensity={20} distance={9} decay={1.5} />
    <pointLight position={[1.4, 1.35, .66]} color="#ffad68" intensity={4} distance={4} decay={1.5} />
  </group>
}
