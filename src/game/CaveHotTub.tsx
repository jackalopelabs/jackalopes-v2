import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConvexHullCollider, MeshCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { caveFloorAt } from './adventure-caves'
import { CAVE_HOT_TUB_POSITION, HOT_TUB_WATER_HEIGHT, createHotTubGeometries } from './cave-hot-tub'
import type { TerrainLevelDocument } from './terrain/level-document'

function mineralWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vWaterPoint;
      varying vec3 vWorldPoint;
      void main() {
        vWaterPoint = position;
        vWorldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 vWaterPoint;
      varying vec3 vWorldPoint;
      void main() {
        vec2 p = vWaterPoint.xz;
        float wave = sin(p.x * 4.0 + time * 0.7) * sin(p.y * 5.0 - time * 0.5);
        vec3 normal = normalize(vec3(cos(p.x * 4.0 + time * 0.7) * 0.06, 1.0,
          cos(p.y * 5.0 - time * 0.5) * 0.06));
        float fresnel = pow(1.0 - abs(dot(normal, normalize(cameraPosition - vWorldPoint))), 2.0);
        float ripple = 0.0;
        for (int i = 0; i < 3; i++) {
          float f = float(i);
          vec2 source = vec2(sin(f * 2.8) * 1.2, cos(f * 2.3) * 0.65);
          float radius = length(p - source);
          float ring = sin(radius * 24.0 - time * 1.8 + f * 2.0);
          ripple += smoothstep(0.93, 1.0, ring) * exp(-radius * 1.9) * 0.12;
        }
        vec3 color = mix(vec3(0.08, 0.37, 0.32), vec3(0.48, 0.81, 0.69),
          0.3 + fresnel * 0.35 + wave * 0.035 + ripple);
        gl_FragColor = vec4(color, 0.77 + fresnel * 0.12);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/** A single inexpensive draw of soft steam wisps, with no textures or particle objects. */
function steamGeometry() {
  const positions: number[] = [], seeds: number[] = [], origins: number[] = [], uv: number[] = []
  for (let puff = 0; puff < 9; puff++) {
    const angle = puff * 2.4
    for (const [x, y] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, -.5], [.5, .5], [-.5, .5]]) {
      positions.push(x, y, 0)
      uv.push(x + .5, y + .5)
      seeds.push(puff / 9)
      origins.push(Math.cos(angle) * (0.55 + puff % 3 * 0.48), Math.sin(angle) * 0.95)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
  geometry.setAttribute('origin', new THREE.Float32BufferAttribute(origins, 2))
  return geometry
}

export function CaveHotTub({ level }: { level: TerrainLevelDocument }) {
  const floor = caveFloorAt(level, CAVE_HOT_TUB_POSITION.x, CAVE_HOT_TUB_POSITION.z)
  const geometry = useMemo(createHotTubGeometries, [])
  const waterMaterial = useMemo(mineralWaterMaterial, [])
  const steam = useMemo(steamGeometry, [])
  const steamUniforms = useMemo(() => ({ time: { value: 0 }, waterHeight: { value: HOT_TUB_WATER_HEIGHT } }), [])
  const effects = useRef<THREE.Group>(null)
  const reducedMotion = useRef(false)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => () => {
    Object.values(geometry).forEach(part => { if (part instanceof THREE.BufferGeometry) part.dispose() })
    waterMaterial.dispose()
    steam.dispose()
  }, [geometry, waterMaterial, steam])
  useFrame(({ clock, camera }) => {
    const time = reducedMotion.current ? 0 : clock.elapsedTime
    waterMaterial.uniforms.time.value = time
    steamUniforms.time.value = time
    if (effects.current && floor !== null) effects.current.visible =
      Math.hypot(camera.position.x - CAVE_HOT_TUB_POSITION.x, camera.position.y - floor,
        camera.position.z - CAVE_HOT_TUB_POSITION.z) < 35
  })
  if (floor === null) return null

  return <group name="cave-mineral-hot-tub" position={[CAVE_HOT_TUB_POSITION.x, floor, CAVE_HOT_TUB_POSITION.z]}
    userData={{ holographicSkip: true, excludeHolographicVision: true }}>
    <RigidBody type="fixed" colliders={false} friction={0.85} name="hot-tub-stone-basin">
      <MeshCollider type="trimesh">
        <mesh name="hot-tub-natural-rock-rim" geometry={geometry.shell} dispose={null}
          userData={{ caveSolid: true }} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.96} flatShading side={THREE.DoubleSide} />
        </mesh>
        <mesh name="hot-tub-mineral-basin-floor" geometry={geometry.bottom} dispose={null}
          userData={{ caveSolid: true }} receiveShadow>
          <meshStandardMaterial color="#a6b59a" roughness={0.88} />
        </mesh>
      </MeshCollider>
      {geometry.treadPoints.map((points, i) => <ConvexHullCollider key={i} args={[points]} />)}
      <mesh name="hot-tub-stone-steps-and-seats" geometry={geometry.steps} dispose={null}
        userData={{ caveSolid: true }} castShadow receiveShadow>
        <meshStandardMaterial color="#9c927c" roughness={0.98} flatShading />
      </mesh>
    </RigidBody>
    <mesh name="hot-tub-turquoise-mineral-water" geometry={geometry.water} material={waterMaterial}
      dispose={null} renderOrder={5} raycast={() => {}} />
    <group ref={effects}>
      <mesh name="hot-tub-gentle-steam" geometry={steam} dispose={null} frustumCulled={false}
        renderOrder={6} raycast={() => {}}>
        <shaderMaterial uniforms={steamUniforms} transparent depthWrite={false} side={THREE.DoubleSide}
          vertexShader={`
            uniform float time;
            uniform float waterHeight;
            attribute float seed;
            attribute vec2 origin;
            varying vec2 vUv;
            varying float vFade;
            void main() {
              float age = fract(time * 0.11 + seed);
              vec3 center = vec3(origin.x + sin(age * 4.0 + seed * 12.0) * 0.22,
                waterHeight + 0.25 + age * 1.65, origin.y);
              vec4 view = modelViewMatrix * vec4(center, 1.0);
              view.xy += position.xy * vec2(0.7 + age * 0.6, 0.95 + age * 0.85);
              gl_Position = projectionMatrix * view;
              vUv = uv;
              vFade = sin(age * 3.14159) * 0.16;
            }
          `}
          fragmentShader={`
            varying vec2 vUv;
            varying float vFade;
            void main() {
              vec2 p = (vUv - 0.5) * 2.0;
              p.x += sin(p.y * 5.0) * 0.1;
              float softness = exp(-dot(p, p) * 4.5) * (1.0 - smoothstep(0.6, 1.0, length(p)));
              gl_FragColor = vec4(0.82, 0.9, 0.85, softness * vFade);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }
          `} />
      </mesh>
    </group>
    <pointLight position={[-1.2, 2.8, -1.6]} color="#ffddb0" intensity={18} distance={11} decay={1.5} />
  </group>
}
