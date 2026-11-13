import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createEverlyCloudTrail, EVERLY_CASTLE_FLOOR, EVERLY_CASTLE_FRONT_WALLS, EVERLY_DRY_GROUND_CAPS, EVERLY_GOALS, EVERLY_RIVER, EVERLY_RIVER_BANKS, everlyWaterSurfaceAt, isEverlyDoorPress, reachedEverlyGoals, resetEverlyGoals, type EverlyGoal } from './everly-adventure'

declare global {
  interface Window {
    __localPlayerPosition?: THREE.Vector3
    __localPlayerInteract?: boolean
  }
}

function CloudPath() {
  const clouds = useMemo(createEverlyCloudTrail, [])
  return <group name="everly-cloud-path">
    {clouds.map((cloud, index) => <RigidBody key={index} type="fixed" colliders={false} position={cloud.position} name={`everly-cloud-${index}`}>
      <CuboidCollider args={[cloud.width * .48, .45, cloud.depth * .48]} position={[0, -.03, 0]} friction={.9} />
      <mesh castShadow receiveShadow scale={[cloud.width * .57, .62, cloud.depth * .54]}>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color={index % 3 === 0 ? '#fff7ff' : '#fffafd'} emissive="#f2a9ff" emissiveIntensity={.12} roughness={.92} />
      </mesh>
    </RigidBody>)}
  </group>
}

function CastleDoors({ onOpened }: { onOpened: () => void }) {
  const left = useRef<RapierRigidBody>(null), right = useRef<RapierRigidBody>(null)
  const target = useRef(0), angle = useRef(0), held = useRef(false), nearRef = useRef(false)
  const [near, setNear] = useState(false), [opened, setOpened] = useState(false)
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const leftRotation = useMemo(() => new THREE.Quaternion(), []), rightRotation = useMemo(() => new THREE.Quaternion(), [])
  useFrame((_, delta) => {
    const p = window.__localPlayerPosition
    const isNear = !!p && Math.hypot(p.x, p.z + 54) < 7 && p.y < 13
    if (nearRef.current !== isNear) { nearRef.current = isNear; setNear(isNear) }
    const gamepadUse = !!(navigator.getGamepads?.() || []).some(pad => pad?.buttons[2]?.pressed)
    const pressed = !!window.__localPlayerInteract || gamepadUse
    if (isNear && isEverlyDoorPress(pressed, held.current)) {
      target.current = target.current ? 0 : 1
      setOpened(!!target.current)
      if (target.current) onOpened()
    }
    held.current = pressed
    angle.current = THREE.MathUtils.damp(angle.current, target.current, 4.5, Math.min(delta, .05))
    const swing = angle.current * 1.12
    leftRotation.setFromAxisAngle(axis, -swing)
    rightRotation.setFromAxisAngle(axis, swing)
    left.current?.setNextKinematicRotation(leftRotation)
    right.current?.setNextKinematicRotation(rightRotation)
  })
  return <group name="everly-opening-castle-doors">
    <RigidBody ref={left} type="kinematicPosition" colliders={false} position={[-3, 3.1, -54.9]} name="everly-castle-left-door">
      <CuboidCollider args={[1.5, 3.05, .22]} position={[1.5, 0, 0]} />
      <mesh position={[1.5, 0, 0]} castShadow><boxGeometry args={[3, 6.1, .42]} /><meshStandardMaterial color="#e64f9b" roughness={.5} /></mesh>
      <mesh position={[2.55, 0, .25]}><sphereGeometry args={[.14, 12, 8]} /><meshStandardMaterial color="#ffe18f" metalness={.65} /></mesh>
    </RigidBody>
    <RigidBody ref={right} type="kinematicPosition" colliders={false} position={[3, 3.1, -54.9]} name="everly-castle-right-door">
      <CuboidCollider args={[1.5, 3.05, .22]} position={[-1.5, 0, 0]} />
      <mesh position={[-1.5, 0, 0]} castShadow><boxGeometry args={[3, 6.1, .42]} /><meshStandardMaterial color="#e64f9b" roughness={.5} /></mesh>
      <mesh position={[-2.55, 0, .25]}><sphereGeometry args={[.14, 12, 8]} /><meshStandardMaterial color="#ffe18f" metalness={.65} /></mesh>
    </RigidBody>
    {near && <Html position={[0, 7.8, -54]} center distanceFactor={14} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}><div style={{ borderRadius: 14, padding: '9px 14px', color: '#692052', background: '#fff8fded', boxShadow: '0 4px 18px #9d397555', font: '700 14px system-ui' }}>{opened ? 'F / X / Use · Close castle doors' : 'F / X / Use · Open castle doors'}</div></Html>}
  </group>
}

function Castle({ onOpened }: { onOpened: () => void }) {
  return <group name="everly-pink-castle">
    <RigidBody type="fixed" colliders={false}>
      {EVERLY_CASTLE_FRONT_WALLS.map(wall => <CuboidCollider key={wall.centerX} args={[wall.halfWidth, 6, .65]} position={[wall.centerX, 6, -54]} />)}
      <CuboidCollider args={[15, 6, .65]} position={[0, 6, -82]} />
      <CuboidCollider args={[.65, 6, 14]} position={[-14.35, 6, -68]} />
      <CuboidCollider args={[.65, 6, 14]} position={[14.35, 6, -68]} />
      <CuboidCollider args={[EVERLY_CASTLE_FLOOR.halfWidth, EVERLY_CASTLE_FLOOR.halfHeight, EVERLY_CASTLE_FLOOR.halfDepth]} position={[EVERLY_CASTLE_FLOOR.centerX, EVERLY_CASTLE_FLOOR.centerY, EVERLY_CASTLE_FLOOR.centerZ]} friction={.9} />
      {EVERLY_CASTLE_FRONT_WALLS.map(wall => <mesh key={wall.centerX} position={[wall.centerX, 6, -54]} castShadow><boxGeometry args={[wall.halfWidth * 2, 12, 1.3]} /><meshStandardMaterial color="#ff9bcf" roughness={.78} /></mesh>)}
      <mesh position={[0, 6, -82]} castShadow><boxGeometry args={[30, 12, 1.3]} /><meshStandardMaterial color="#f786c0" roughness={.78} /></mesh>
      <mesh position={[-14.35, 6, -68]} castShadow><boxGeometry args={[1.3, 12, 28]} /><meshStandardMaterial color="#f786c0" roughness={.78} /></mesh>
      <mesh position={[14.35, 6, -68]} castShadow><boxGeometry args={[1.3, 12, 28]} /><meshStandardMaterial color="#f786c0" roughness={.78} /></mesh>
      <mesh position={[EVERLY_CASTLE_FLOOR.centerX, EVERLY_CASTLE_FLOOR.centerY, EVERLY_CASTLE_FLOOR.centerZ]} receiveShadow><boxGeometry args={[EVERLY_CASTLE_FLOOR.halfWidth * 2, EVERLY_CASTLE_FLOOR.halfHeight * 2, EVERLY_CASTLE_FLOOR.halfDepth * 2]} /><meshStandardMaterial color="#ffcae6" roughness={.9} /></mesh>
    </RigidBody>
    <CastleDoors onOpened={onOpened} />
    {[-12.5, 12.5].map((x, i) => <group key={x} position={[x, 0, -57]}>
      <mesh position={[0, 7, 0]} castShadow><cylinderGeometry args={[2.4, 3, 14, 8]} /><meshStandardMaterial color={i ? '#ffb0d6' : '#f594c8'} roughness={.66} /></mesh>
      <mesh position={[0, 14.2, 0]}><coneGeometry args={[2.3, 4, 8]} /><meshStandardMaterial color={i ? '#c99af9' : '#ff83b9'} roughness={.6} /></mesh>
      <mesh position={[0, 16.5, 0]}><sphereGeometry args={[.38, 12, 8]} /><meshStandardMaterial color="#fff0a9" emissive="#ffd8ef" emissiveIntensity={.6} /></mesh>
    </group>)}
    {[-7, 0, 7].map(x => <mesh key={x} position={[x, 12.5, -53.3]}><boxGeometry args={[1.1, 1.2, .18]} /><meshStandardMaterial color="#fff3c7" emissive="#ffb9de" emissiveIntensity={.35} /></mesh>)}
    <mesh position={[0, 10.8, -53.1]}><planeGeometry args={[5.7, 1.25]} /><meshBasicMaterial color="#fff9fe" /></mesh>
    <Html position={[0, 10.8, -53]} center transform distanceFactor={12} style={{ pointerEvents: 'none' }}><div style={{ font: '900 19px system-ui', letterSpacing: 2, color: '#9e3e7a', whiteSpace: 'nowrap' }}>EVERLY'S CASTLE</div></Html>
  </group>
}

function RainbowSky() {
  const sky = useMemo(() => {
    const colors = ['#ff5c9e', '#ffad59', '#ffe66d', '#7de59b', '#65d9f3', '#8a9bff', '#cf78ee']
    return colors.map((color, index) => {
      const span = 43 + index * 3.6, height = 62 + index * 6.2
      const points = Array.from({ length: 41 }, (_, i) => {
        const t = i / 40
        return new THREE.Vector3(-span + 2 * span * t, height * Math.sin(Math.PI * t), 0)
      })
      const curve = new THREE.CatmullRomCurve3(points)
      return { geometry: new THREE.TubeGeometry(curve, 90, 1.35, 8, false), color, z: -116 + index * 1.8 }
    })
  }, [])
  useEffect(() => () => sky.forEach(arc => arc.geometry.dispose()), [sky])
  return <group name="rainbow-sky" position={[0, 33, -75]}>
    <mesh scale={260} renderOrder={-10}><sphereGeometry args={[1, 24, 16]} /><shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={{ horizon: { value: new THREE.Color('#fff1e9') }, zenith: { value: new THREE.Color('#a979ef') } }} vertexShader="varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}" fragmentShader="uniform vec3 horizon; uniform vec3 zenith; varying vec3 vPos; void main(){float h=smoothstep(-.12,.68,normalize(vPos).y);gl_FragColor=vec4(mix(horizon,zenith,h),1.0);}" /></mesh>
    {sky.map((arc, i) => <mesh key={i} geometry={arc.geometry} position={[0, 0, arc.z]}><meshBasicMaterial color={arc.color} toneMapped={false} /></mesh>)}
  </group>
}

function RainbowFlowers() {
  const count = 36, blooms = useRef<THREE.InstancedMesh>(null), stems = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: -39 + (i % 9) * 2.15 + Math.sin(i * 7) * .7,
    z: -1 + Math.floor(i / 9) * 5 + Math.cos(i * 4) * .8,
    color: ['#ff4f9c', '#ffb13d', '#ffe86c', '#89e28c', '#72dcf0', '#b593ff'][i % 6],
  })), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    if (!blooms.current || !stems.current) return
    data.forEach((flower, i) => {
      dummy.position.set(flower.x, .45, flower.z); dummy.scale.set(.25, .25, .25); dummy.updateMatrix(); blooms.current!.setMatrixAt(i, dummy.matrix)
      blooms.current!.setColorAt(i, new THREE.Color(flower.color))
      dummy.position.set(flower.x, .2, flower.z); dummy.scale.set(.055, .3, .055); dummy.updateMatrix(); stems.current!.setMatrixAt(i, dummy.matrix)
    })
    blooms.current.instanceMatrix.needsUpdate = true; blooms.current.instanceColor!.needsUpdate = true; stems.current.instanceMatrix.needsUpdate = true
  }, [data, dummy])
  return <group name="everly-rainbow-flower-garden"><instancedMesh ref={stems} args={[undefined, undefined, count]}><cylinderGeometry args={[1, 1, 1, 5]} /><meshStandardMaterial color="#68bb75" roughness={.8} /></instancedMesh><instancedMesh ref={blooms} args={[undefined, undefined, count]}><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial roughness={.58} /></instancedMesh></group>
}

function Unicorn({ position, color, index }: { position: [number, number, number]; color: string; index: number }) {
  const root = useRef<THREE.Group>(null), legs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    const time = clock.elapsedTime * .95 + index * 1.7
    if (root.current) root.current.position.y = position[1] + Math.sin(time * 1.3) * .08
    legs.current.forEach((leg, i) => { if (leg) leg.rotation.x = Math.sin(time * 2.4 + (i % 2) * Math.PI) * .1 })
  })
  const mane = ['#ff5d9d', '#ffb85e', '#fff06d', '#6de0a0', '#73dff4', '#a18bff']
  return <group ref={root} position={position} rotation={[0, index === 1 ? Math.PI : -.28, 0]} name={`rainbow-unicorn-${index}`}>
    {/* Horse profile: long body, upright sloping neck, muzzle, mane, tail and four hooved legs. */}
    <mesh position={[0, 1.34, .05]} scale={[.58, .66, 1.22]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={color} roughness={.7} /></mesh>
    <mesh position={[0, 1.97, -.58]} rotation={[-.48, 0, 0]} scale={[.42, .84, .45]} castShadow><capsuleGeometry args={[.29, 1, 5, 10]} /><meshStandardMaterial color={color} roughness={.7} /></mesh>
    <mesh position={[0, 2.54, -.93]} scale={[.36, .34, .52]} castShadow><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={color} roughness={.7} /></mesh>
    <mesh position={[0, 2.37, -1.28]} scale={[.28, .2, .34]} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#fff0ed" roughness={.72} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .25, 2.67, -1.04]}><sphereGeometry args={[.065, 8, 6]} /><meshStandardMaterial color="#562d4b" /></mesh>
      <mesh position={[side * .18, 2.91, -.9]} rotation={[side * -.18, 0, side * -.12]}><coneGeometry args={[.14, .44, 7]} /><meshStandardMaterial color={color} roughness={.7} /></mesh>
    </group>)}
    <mesh position={[0, 3.02, -1.2]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[.13, .62, 8]} /><meshStandardMaterial color="#fff4a5" emissive="#ffe795" emissiveIntensity={.34} metalness={.12} roughness={.34} /></mesh>
    {[-1, 1, -1, 1].map((side, i) => <group key={i} ref={node => { legs.current[i] = node }} position={[side * .34, .76, i < 2 ? -.66 : .79]}>
      <mesh position={[0, -.28, 0]} castShadow><capsuleGeometry args={[.115, .6, 4, 8]} /><meshStandardMaterial color={color} roughness={.72} /></mesh>
      <mesh position={[0, -.66, -.025]} castShadow><boxGeometry args={[.27, .18, .32]} /><meshStandardMaterial color="#56395d" roughness={.42} /></mesh>
    </group>)}
    {mane.map((shade, i) => <mesh key={shade} position={[0, 2.35 - i * .12, -.62 + i * .11]} scale={[.29, .2, .28]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={shade} roughness={.55} /></mesh>)}
    {mane.slice(0, 5).map((shade, i) => <mesh key={`tail-${shade}`} position={[0, 1.74 - i * .11, 1.17 + i * .1]} rotation={[.25, 0, 0]} scale={[.16, .16, .38]}><sphereGeometry args={[1, 9, 7]} /><meshStandardMaterial color={shade} roughness={.55} /></mesh>)}
  </group>
}

function makeEverlyFishGeometry() {
  const body = new THREE.SphereGeometry(1, 12, 8).toNonIndexed(); body.scale(.32, .22, .72)
  const positions: number[] = [], colors: number[] = []
  const finColor = new THREE.Color('#ffffff')
  const tri = (a: number[], b: number[], c: number[]) => { positions.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) colors.push(finColor.r, finColor.g, finColor.b) }
  tri([0, 0, .46], [-.28, .04, .98], [0, 0, .78]); tri([0, 0, .46], [0, 0, .78], [.28, .04, .98])
  tri([-.08, .12, .1], [-.4, .42, -.03], [.04, .16, -.12]); tri([.08, .12, .1], [-.04, .16, -.12], [.4, .42, -.03])
  const fins = new THREE.BufferGeometry(); fins.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const eyes = [-1, 1].flatMap(side => {
    const white = new THREE.SphereGeometry(.075, 8, 6); white.translate(side * .245, .105, -.39)
    const pupil = new THREE.SphereGeometry(.032, 7, 5); pupil.translate(side * .277, .11, -.43)
    return [white, pupil]
  })
  const parts = [body, fins, ...eyes]
  const merged = new THREE.BufferGeometry(), allPos: number[] = [], allColors: number[] = []
  parts.forEach((part, partIndex) => {
    const p = part.getAttribute('position').array
    allPos.push(...Array.from(p))
    const shade = partIndex === 0 ? [1, .98, 1] : partIndex === 1 ? [1, 1, 1] : partIndex === 2 || partIndex === 4 ? [1, 1, 1] : [.12, .08, .16]
    for (let i = 0; i < p.length / 3; i++) allColors.push(...shade)
  })
  merged.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3))
  merged.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3))
  merged.computeVertexNormals()
  parts.forEach(part => part.dispose())
  return merged
}

function River() {
  const fish = useRef<THREE.InstancedMesh>(null), dummy = useMemo(() => new THREE.Object3D(), [])
  const colors = useMemo(() => ['#ff6fa8', '#ffd45e', '#76dcff', '#c497ff', '#84e9ad', '#ff9c62'], [])
  const fishGeometry = useMemo(makeEverlyFishGeometry, [])
  useEffect(() => {
    if (!fish.current) return
    colors.forEach((color, index) => fish.current!.setColorAt(index, new THREE.Color(color)))
    if (fish.current.instanceColor) fish.current.instanceColor.needsUpdate = true
  }, [colors])
  useEffect(() => () => fishGeometry.dispose(), [fishGeometry])
  useFrame(({ clock }) => {
    if (!fish.current) return
    for (let i = 0; i < colors.length; i++) {
      const phase = clock.elapsedTime * (.34 + i * .018) + i * 1.13
      dummy.position.set(Math.sin(phase) * 4.2, -1.05 - (i % 3) * .66 + Math.sin(phase * 2) * .16, -39 + i * 13.2)
      dummy.rotation.set(0, Math.cos(phase) > 0 ? 0 : Math.PI, Math.sin(phase * 2) * .08)
      dummy.scale.set(1.15 + (i % 3) * .13, .75, 1.75); dummy.updateMatrix(); fish.current.setMatrixAt(i, dummy.matrix)
    }
    fish.current.instanceMatrix.needsUpdate = true
  })
  return <group name="everly-river">
    <mesh position={[0, EVERLY_RIVER.surface - .18, EVERLY_RIVER.centerZ]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[14, EVERLY_RIVER.halfLength * 2]} /><meshStandardMaterial color="#62d9f0" emissive="#32a9d6" emissiveIntensity={.24} transparent opacity={.78} roughness={.22} metalness={.12} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <mesh position={[0, EVERLY_RIVER.bed + .02, EVERLY_RIVER.centerZ]}><boxGeometry args={[14, .35, EVERLY_RIVER.halfLength * 2]} /><meshStandardMaterial color="#eaa8d7" roughness={1} /></mesh>
    <pointLight position={[0, -1.1, 5]} color="#8beaff" intensity={18} distance={30} decay={2} />
    <instancedMesh ref={fish} args={[fishGeometry, undefined, colors.length]}><meshStandardMaterial vertexColors roughness={.4} metalness={.08} /></instancedMesh>
    {/* Small ripples mark the safe shore and shallow entry. */}
    {[-1, 1].map(side => <mesh key={side} position={[side * 7.6, .04, EVERLY_RIVER.centerZ]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.1, EVERLY_RIVER.halfLength * 2]} /><meshStandardMaterial color="#ffb1dc" roughness={.72} /></mesh>)}
  </group>
}

export function EverlyAdventure() {
  const [completed, setCompleted] = useState<Set<EverlyGoal>>(resetEverlyGoals)
  const completedRef = useRef(completed); completedRef.current = completed
  const completeCastle = () => {
    setCompleted(previous => new Set(previous).add('castle'))
    window.dispatchEvent(new CustomEvent('everly:goal-complete', { detail: { ids: ['castle'] } }))
  }
  useFrame(() => {
    const position = window.__localPlayerPosition
    if (!position) return
    const found = reachedEverlyGoals(position, completedRef.current)
      .filter(id => id !== 'fish' || everlyWaterSurfaceAt(position.x, position.y, position.z, true) !== null)
    if (found.length) {
      setCompleted(previous => new Set([...previous, ...found]))
      window.dispatchEvent(new CustomEvent('everly:goal-complete', { detail: { ids: found } }))
    }
  })
  useEffect(() => {
    const resetGoals = () => setCompleted(resetEverlyGoals())
    window.addEventListener('everly:reset-goals', resetGoals)
    return () => window.removeEventListener('everly:reset-goals', resetGoals)
  }, [])
  return <>
    <RainbowSky />
    <RigidBody type="fixed" colliders={false} name="everly-ground">
      {EVERLY_RIVER_BANKS.map(bank => <CuboidCollider key={bank.centerX} args={[bank.halfWidth, .5, bank.halfDepth]} position={[bank.centerX, -.5, bank.centerZ]} friction={1} />)}
      {EVERLY_RIVER_BANKS.map(bank => <mesh key={bank.centerX} position={[bank.centerX, -.52, bank.centerZ]} receiveShadow><boxGeometry args={[bank.halfWidth * 2, 1, bank.halfDepth * 2]} /><meshStandardMaterial color="#f7a9d4" roughness={.93} /></mesh>)}
      <CuboidCollider args={[7, .2, EVERLY_RIVER.halfLength]} position={[0, -4.15, EVERLY_RIVER.centerZ]} friction={.85} />
      {EVERLY_DRY_GROUND_CAPS.map(cap => <group key={cap.id}>
        <CuboidCollider args={[cap.halfWidth, .5, cap.halfDepth]} position={[cap.centerX, -.5, cap.centerZ]} friction={.9} />
        <mesh position={[cap.centerX, -.52, cap.centerZ]} receiveShadow><boxGeometry args={[cap.halfWidth * 2, 1, cap.halfDepth * 2]} /><meshStandardMaterial color="#f7a9d4" roughness={.88} /></mesh>
      </group>)}
      <mesh position={[0, EVERLY_RIVER.bed + .02, EVERLY_RIVER.centerZ]}><boxGeometry args={[14, .35, EVERLY_RIVER.halfLength * 2]} /><meshStandardMaterial color="#d58dbd" roughness={1} /></mesh>
    </RigidBody>
    {[-1, 1].map(side => <RigidBody key={side} type="fixed" colliders={false} position={[side * 9.2, -2.05, 42]} rotation={[0, 0, side * .72]} name={`everly-river-shore-ramp-${side}`}>
      <CuboidCollider args={[3.9, .28, 4.5]} friction={.9} />
      <mesh castShadow receiveShadow><boxGeometry args={[7.8, .5, 9]} /><meshStandardMaterial color="#ffc1e4" roughness={.82} /></mesh>
    </RigidBody>)}
    <River />
    <Castle onOpened={completeCastle} />
    <CloudPath />
    <RainbowFlowers />
    <Unicorn position={[-21, 0, -38]} color="#ff83ba" index={0} />
    <Unicorn position={[22, 0, -103]} color="#9c8aff" index={1} />
    <Unicorn position={[-48, 0, -112]} color="#76dfee" index={2} />
    <mesh position={[-30, 1.3, 8]}><torusGeometry args={[2.3, .12, 8, 32]} /><meshStandardMaterial color="#ffe78b" emissive="#ffb6d8" emissiveIntensity={.4} /></mesh>
    <mesh position={[0, .25, 47]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[12, 20, 32]} /><meshStandardMaterial color="#fff1f9" emissive="#f7a9dc" emissiveIntensity={.2} roughness={.8} /></mesh>
  </>
}

export function EverlyAdventureHUD({ avatar, onToggleAvatar }: { avatar: 'jackalope' | 'astronaut'; onToggleAvatar: () => void }) {
  const [completed, setCompleted] = useState<Set<EverlyGoal>>(resetEverlyGoals)
  useEffect(() => {
    const onGoals = (event: Event) => {
      const ids = (event as CustomEvent<{ ids?: EverlyGoal[] }>).detail?.ids
      if (Array.isArray(ids)) setCompleted(previous => new Set([...previous, ...ids]))
    }
    const onReset = () => setCompleted(resetEverlyGoals())
    window.addEventListener('everly:goal-complete', onGoals)
    window.addEventListener('everly:reset-goals', onReset)
    return () => { window.removeEventListener('everly:goal-complete', onGoals); window.removeEventListener('everly:reset-goals', onReset) }
  }, [])
  const reset = () => window.dispatchEvent(new CustomEvent('everly:reset-goals'))
  const controls = 'Move: WASD / stick / touch · Jump: Space / A · Swim: move · Dive: C / L2 · Use: F / X / Touch Use'
  return <section data-testid="everly-adventure-hud" aria-label="Everly's Adventure" style={{ position: 'fixed', left: 18, top: 18, zIndex: 2050, width: 'min(320px,calc(100vw - 36px))', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 20, color: '#59284d', background: 'linear-gradient(145deg,rgba(255,248,253,.96),rgba(255,224,243,.91))', boxShadow: '0 10px 36px #8e3f7250', fontFamily: 'system-ui,sans-serif', pointerEvents: 'auto' }}>
    <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 900, color: '#ad4c92' }}>A LITTLE MAGICAL JOURNEY</div><strong style={{ display: 'block', fontSize: 23, lineHeight: 1.15, margin: '4px 0 9px' }}>Everly&apos;s Adventure</strong>
    <div style={{ fontSize: 13, color: '#7e4d71', marginBottom: 9 }}>Find the flowers, meet the fish, follow the clouds, and open the castle!</div>
    {EVERLY_GOALS.map(goal => <div key={goal.id} style={{ fontSize: 13, padding: '3px 0', color: completed.has(goal.id) ? '#438763' : '#855779' }}>{completed.has(goal.id) ? '✓' : '○'}  {goal.label}</div>)}
    <div style={{ borderTop: '1px solid #dc9dc944', marginTop: 10, paddingTop: 8, fontSize: 10, lineHeight: 1.5, color: '#885e7d' }}>{controls}</div>
    <button type="button" onClick={onToggleAvatar} aria-label={avatar === 'jackalope' ? 'Switch to astronaut' : 'Switch to jackalope'} style={{ marginTop: 8, marginRight: 7, border: 0, borderRadius: 10, background: '#ecc5ec', color: '#692a56', padding: '6px 10px', fontWeight: 750, cursor: 'pointer' }}>{avatar === 'jackalope' ? 'Try astronaut' : 'Try jackalope'}</button>
    <button type="button" onClick={reset} style={{ marginTop: 8, border: 0, borderRadius: 10, background: '#f5b5d8', color: '#692a56', padding: '6px 10px', fontWeight: 750, cursor: 'pointer' }}>Start the journey over</button>
  </section>
}
