import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { caveCeilingAt, caveFloorAt, createCaveGeometries } from './adventure-caves'
import { CaveKoi } from './CaveKoi'
import { CaveWaterslide } from './CaveWaterslide'
import { EverlyCaveRoom } from './EverlyCaveRoom'
import { DaddyCaveRoom } from './DaddyCaveRoom'
import { loadTerrainLevel } from './terrain/level-document'

type Placement = { at: [number, number, number]; scale: [number, number, number]; turn?: number }

/** Merge small static decorations: no plant-like per-object updates or physics bodies. */
function mergeDecor(base: THREE.BufferGeometry, placements: Placement[]) {
  const pieces = placements.map(({ at, scale, turn = 0 }) => {
    const geometry = base.clone()
    geometry.scale(...scale)
    geometry.rotateY(turn)
    geometry.translate(...at)
    return geometry
  })
  const merged = mergeGeometries(pieces, false)!
  pieces.forEach(geometry => geometry.dispose())
  base.dispose()
  return merged
}

function crystalGeometry() {
  const positions: number[] = []
  const ring = (i: number, radius: number, height: number) => {
    const angle = i * Math.PI * 2 / 5
    return [Math.cos(angle) * radius, height, Math.sin(angle) * radius]
  }
  for (let i = 0; i < 5; i++) {
    const a = ring(i, 0.43, 0), b = ring(i + 1, 0.43, 0)
    const c = ring(i, 0.31, 0.76), d = ring(i + 1, 0.31, 0.76)
    positions.push(...a, ...c, ...b, ...b, ...c, ...d, ...c, 0, 1.35, 0, ...d)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function surveyMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: '#263e45', roughness: 0.92, metalness: 0.06,
    emissive: '#10282c', emissiveIntensity: 0.18,
    flatShading: true, side: THREE.DoubleSide,
  })
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCaveSurveyPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCaveSurveyPosition = (modelMatrix * vec4(position, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCaveSurveyPosition;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 caveCell = vCaveSurveyPosition.xz / 5.0;
        vec2 caveWidth = max(fwidth(caveCell), vec2(0.0001));
        vec2 caveLines = abs(fract(caveCell - 0.5) - 0.5) / caveWidth;
        float caveGrid = 1.0 - min(min(caveLines.x, caveLines.y), 1.0);
        float caveFade = 1.0 - smoothstep(18.0, 65.0, distance(cameraPosition, vCaveSurveyPosition));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.40, 0.38), caveGrid * caveFade * 0.35);
      `)
  }
  material.customProgramCacheKey = () => 'jackalopes-cave-survey-v1'
  return material
}

/** One transparent draw, no reflection cameras, render targets, or animated geometry. */
function lakeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deepColor: { value: new THREE.Color('#19464d') },
      edgeColor: { value: new THREE.Color('#62b7ae') },
    },
    vertexShader: `
      varying vec3 vLakePosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vLakePosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 deepColor;
      uniform vec3 edgeColor;
      varying vec3 vLakePosition;
      void main() {
        float waveA = vLakePosition.x * 0.43 + vLakePosition.z * 0.17 + time * 0.38;
        float waveB = vLakePosition.z * 0.57 - vLakePosition.x * 0.11 - time * 0.31;
        float ripple = sin(waveA) * 0.55 + sin(waveB) * 0.45;
        vec3 normal = normalize(vec3(cos(waveA) * 0.10, 1.0, cos(waveB) * 0.09));
        vec3 view = normalize(cameraPosition - vLakePosition);
        float fresnel = pow(1.0 - abs(dot(normal, view)), 3.0);
        float glint = smoothstep(0.79, 0.98, ripple);
        vec3 color = mix(deepColor, edgeColor, 0.25 + fresnel * 0.32 + ripple * 0.08);
        color += vec3(0.09, 0.19, 0.16) * glint;
        float opacity = 0.48 + fresnel * 0.22;
        if (!gl_FrontFacing) {
          color = mix(deepColor, edgeColor, 0.34 + ripple * 0.09);
          opacity = 0.30 + fresnel * 0.15;
        }
        gl_FragColor = vec4(color, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  })
}

/** A real, walkable Adventure-only cave, reached by the central descending ramp. */
export function AdventureCaves({ surfaceMaterial }: { surfaceMaterial?: THREE.Material }) {
  const level = useMemo(() => loadTerrainLevel(), [])
  const cave = useMemo(() => createCaveGeometries(level), [level])
  const floorMaterial = useMemo(surveyMaterial, [])
  const waterMaterial = useMemo(lakeMaterial, [])
  useFrame(({ clock }) => { waterMaterial.uniforms.time.value = clock.elapsedTime })
  const decoration = useMemo(() => {
    const floor = cave.floorY
    const entrance = cave.entranceY
    // Crystals sit at the margins of each chamber, never across a passage.
    const colonies: [number, number, 'cyan' | 'violet'][] = [
      [-8, -40, 'cyan'], [8, -43, 'cyan'],
      [-41, -40, 'violet'], [-35, -43, 'violet'],
      [40, -43, 'cyan'], [43, -35, 'cyan'],
      [-7, -67, 'violet'], [4, -68, 'cyan'],
      [-6, -83, 'cyan'], [6, -97, 'cyan'],
      [-42, -115, 'cyan'], [43, -125, 'violet'],
      [-30, -140, 'violet'], [31, -141, 'cyan'],
      [-7, -155, 'cyan'], [7, -167, 'violet'],
      [-18, -181, 'violet'], [15, -180, 'cyan'], [-8, -187, 'cyan'],
    ]
    const cyan: Placement[] = [], violet: Placement[] = [], stones: Placement[] = []
    colonies.forEach(([x, z, color], colony) => {
      const colonyFloor = caveFloorAt(level, x, z)
      if (colonyFloor === null) return
      for (let i = 0; i < 5; i++) {
        const angle = i * 2.4 + colony
        const size = 0.7 + ((i * 3 + colony) % 5) * 0.27
        const px = x + Math.cos(angle) * i * 0.22
        const pz = z + Math.sin(angle) * i * 0.22
        const crystalFloor = caveFloorAt(level, px, pz)
        if (crystalFloor === null) continue
        const batch = color === 'cyan' ? cyan : violet
        batch.push({
          at: [px, crystalFloor - 0.04, pz],
          scale: [size * 0.8, size * (i === 0 ? 1.65 : 1), size * 0.8], turn: angle,
        })
      }
      stones.push({ at: [x, colonyFloor + 0.04, z], scale: [1.65, 0.38, 1.3], turn: colony })
    })
    // A broken, faceted stone collar reads as a burrow mouth from the surface.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        stones.push({ at: [side * 6.15, entrance + 0.35, 4 - i * 3.1],
          scale: [1.5, 1.25 + (i % 2) * 0.45, 2.0], turn: i * 0.7 })
      }
    }
    for (const x of [-3.8, 0, 3.8]) {
      stones.push({ at: [x, entrance + 0.3, -6.55], scale: [2.45, 1.25, 1.5], turn: x })
    }
    const lampFrames: Placement[] = [], lampFaces: Placement[] = []
    const lampStations = [3, -3, -9, -15, -21, -26, -43, -56, -69, -80, -90, -100, -111, -123, -135, -147, -159, -170, -180]
    for (const z of lampStations) {
      for (const side of [-1, 1]) {
        const x = side * (z < -108 && z > -148 ? 6 : z < -26 ? 3.8 : 4.5)
        const y = caveFloorAt(level, x, z)
        if (y === null) continue
        lampFrames.push({ at: [x, y + 0.18, z], scale: [0.26, 0.36, 0.65] })
        lampFaces.push({ at: [x, y + 0.39, z], scale: [0.19, 0.05, 0.5] })
      }
    }
    // Broad warm navigation dashes point up the ramp; no flashing or UI required.
    const routeMarks: Placement[] = []
    for (const z of [-29, -33, -37]) {
      routeMarks.push({ at: [0, floor + 0.045, z], scale: [0.1, 0.018, 0.85] })
    }
    // Paired amber chevrons point toward the entrance, including across the lake bed.
    for (const z of [-55, -72, -86, -100, -116, -132, -148, -164, -178]) {
      for (const side of [-1, 1]) {
        const x = side * 0.24
        const y = caveFloorAt(level, x, z)
        if (y === null) continue
        routeMarks.push({ at: [x, y + 0.13, z], scale: [0.09, 0.025, 0.72], turn: -side * 0.72 })
      }
    }
    // Ceiling teeth and worn outcrops hug chamber margins. Keep the broad centre route clear.
    const stalactites: Placement[] = []
    const rockMargins: [number, number][] = [
      [-10, -42], [10, -45], [-43, -35], [-41, -44], [42, -35], [43, -44],
      [-14, -64], [10, -66], [-7, -85], [7, -99],
      [-45, -116], [45, -123], [-42, -132], [34, -142],
      [-8, -154], [8, -164], [-22, -180], [21, -181],
    ]
    rockMargins.forEach(([x, z], index) => {
      const ground = caveFloorAt(level, x, z)
      const roof = caveCeilingAt(level, x, z)
      if (ground === null || roof === null) return
      const large = z < -100 ? 1.4 : 1
      stones.push({ at: [x, ground + 0.38, z], scale: [1.4 * large, 1.0 * large, 1.9 * large], turn: index * 0.73 })
      for (let i = 0; i < 3; i++) {
        const px = x + (i - 1) * 0.55
        const pz = z + Math.sin(index + i) * 0.5
        const ceiling = caveCeilingAt(level, px, pz)
        if (ceiling === null) continue
        const length = (1.3 + ((index * 7 + i * 3) % 6) * 0.28) * large
        stalactites.push({ at: [px, ceiling - length / 2 + 0.08, pz],
          scale: [(0.48 + i * 0.17) * large, length, (0.6 + i * 0.12) * large], turn: index + i })
      }
    })
    return {
      cyan: mergeDecor(crystalGeometry(), cyan),
      violet: mergeDecor(crystalGeometry(), violet),
      stones: mergeDecor(new THREE.IcosahedronGeometry(1, 0), stones),
      lampFrames: mergeDecor(new THREE.BoxGeometry(1, 1, 1), lampFrames),
      lampFaces: mergeDecor(new THREE.BoxGeometry(1, 1, 1), lampFaces),
      routeMarks: mergeDecor(new THREE.BoxGeometry(1, 1, 1), routeMarks),
      stalactites: mergeDecor(new THREE.ConeGeometry(1, 1, 5).rotateX(Math.PI), stalactites),
    }
  }, [cave, level])

  useEffect(() => () => {
    for (const name of ['surface', 'floor', 'walls', 'ceiling', 'ramp', 'water'] as const) cave[name].dispose()
    Object.values(decoration).forEach(geometry => geometry.dispose())
    floorMaterial.dispose()
    waterMaterial.dispose()
  }, [cave, decoration, floorMaterial, waterMaterial])

  return <group name="adventure-caves" userData={{ holographicScenery: true }}>
    <RigidBody type="fixed" colliders="trimesh" friction={0.85} name="adventure-cave-shell">
      <mesh name="cave-surface-ring" geometry={cave.surface} material={surfaceMaterial ?? floorMaterial}
        dispose={null} userData={{ caveSolid: true }} receiveShadow />
      <mesh name="cave-floor" geometry={cave.floor} material={floorMaterial}
        dispose={null} userData={{ caveSolid: true }} receiveShadow />
      <mesh name="cave-entrance-ramp" geometry={cave.ramp} material={floorMaterial}
        dispose={null} userData={{ caveSolid: true }} receiveShadow />
      <mesh name="cave-walls" geometry={cave.walls} userData={{ caveSolid: true }} receiveShadow>
        <meshStandardMaterial color="#334956" emissive="#163438" emissiveIntensity={0.15}
          roughness={0.96} metalness={0.06} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh name="cave-ceiling" geometry={cave.ceiling} userData={{ caveSolid: true }}>
        <meshStandardMaterial color="#263440" emissive="#1a2a37" emissiveIntensity={0.12}
          roughness={1} flatShading side={THREE.DoubleSide} />
      </mesh>
    </RigidBody>
    <CaveWaterslide />
    <CaveKoi waterLevel={cave.waterLevel} />
    <EverlyCaveRoom level={level} />
    <DaddyCaveRoom level={level} />

    <mesh name="cave-lake-water" geometry={cave.water} material={waterMaterial} dispose={null}
      renderOrder={4} userData={{ holographicSkip: true }} raycast={() => {}} />

    <mesh name="cave-rock-collar-and-bases" geometry={decoration.stones}>
      <meshStandardMaterial color="#42505a" roughness={0.96} flatShading />
    </mesh>
    <mesh name="cave-stalactites" geometry={decoration.stalactites}>
      <meshStandardMaterial color="#3b4b51" emissive="#142e31" emissiveIntensity={0.12} roughness={0.97} flatShading />
    </mesh>
    <mesh name="cave-cyan-crystals" geometry={decoration.cyan}>
      <meshStandardMaterial color="#90dddb" emissive="#278e97" emissiveIntensity={0.8}
        roughness={0.35} metalness={0.18} flatShading />
    </mesh>
    <mesh name="cave-amethyst-crystals" geometry={decoration.violet}>
      <meshStandardMaterial color="#b9a8e4" emissive="#655099" emissiveIntensity={0.75}
        roughness={0.4} metalness={0.12} flatShading />
    </mesh>
    <group userData={{ holographicSkip: true }}>
      <mesh geometry={decoration.lampFrames}>
        <meshStandardMaterial color="#333d42" roughness={0.85} />
      </mesh>
      <mesh geometry={decoration.lampFaces}>
        <meshBasicMaterial color="#f3c878" toneMapped={false} />
      </mesh>
      <mesh geometry={decoration.routeMarks}>
        <meshBasicMaterial color="#ae9362" toneMapped={false} />
      </mesh>
      <pointLight position={[0, cave.floorY + 5, -35]} color="#93d5d3" intensity={32} distance={34} decay={1.5} />
      <pointLight position={[-35, cave.floorY + 4, -38]} color="#b6a0de" intensity={24} distance={27} decay={1.5} />
      <pointLight position={[28, cave.floorY + 4, -42]} color="#76cdd7" intensity={22} distance={30} decay={1.5} />
      <pointLight position={[0, cave.waterLevel + 3, -124]} color="#73c2c3" intensity={44} distance={52} decay={1.5} />
      <pointLight position={[0, (caveFloorAt(level, 0, -178) ?? cave.floorY) + 6, -178]} color="#c4b1dd" intensity={32} distance={34} decay={1.5} />
    </group>
  </group>
}
