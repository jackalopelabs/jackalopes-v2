import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { loadTerrainLevel, type TerrainLevelDocument } from './terrain/level-document'
import { caveAirWeight, createCaveFogLayer, createCaveFogOwner, partyLightScale, PARTY_AIR_DENSITY } from './cave-atmosphere'
import { stepPartyBlend } from './cave-party-state'

type Atmosphere = ReturnType<typeof createAtmosphere>
function createAtmosphere(scene: THREE.Scene) {
  const fog = createCaveFogOwner(scene), layer = createCaveFogLayer(10)
  return { fog, layer, clearPartyFog: () => { layer.fog = null; fog.update() }, on: false, blend: 0, air: 0, nightVision: false,
    reducedMotion: false, low: true, age: 0, time: 0 }
}
const CaveAtmosphereContext = createContext<Atmosphere | null>(null)
export const useCaveAtmosphere = () => useContext(CaveAtmosphereContext)

/** Frame order: blend -4, layer producers -3/-2, one fog owner -1, ordinary rendering 0. */
export function CaveAtmosphereProvider({ children, enabled = true, nightVision = false, level: suppliedLevel }: {
  children: ReactNode; enabled?: boolean; nightVision?: boolean; level?: TerrainLevelDocument
}) {
  const { scene } = useThree()
  const level = useMemo(() => suppliedLevel ?? loadTerrainLevel(), [suppliedLevel])
  const atmosphere = useMemo(() => createAtmosphere(scene), [scene])
  const partyFog = useMemo(() => new THREE.FogExp2('#696482', 0), [])
  const layer = atmosphere.layer
  // Each effect owns only its own lease. Never clear child/sauna registrations in
  // provider cleanup: StrictMode may replay their setup in a different order.
  useEffect(() => atmosphere.fog.register(layer), [atmosphere, layer])
  useFrame(({ camera }, delta) => {
    atmosphere.nightVision = nightVision
    atmosphere.blend = enabled ? stepPartyBlend(atmosphere.blend, atmosphere.on, delta) : 0
    atmosphere.air = enabled ? caveAirWeight(level, camera.position) : 0
    if (atmosphere.on) {
      atmosphere.age += Math.max(0, Math.min(delta, .1))
      if (!atmosphere.reducedMotion) atmosphere.time += Math.max(0, Math.min(delta, .1))
    } else if (!atmosphere.blend) atmosphere.age = atmosphere.time = 0
    const strength = atmosphere.blend * atmosphere.air * (nightVision ? 0 : 1)
    const arrival = Math.max(0, camera.position.z + 187) / 190 + Math.abs(camera.position.x) / 250
    const spread = THREE.MathUtils.smoothstep(atmosphere.age / 20 - arrival, 0, .2)
    partyFog.density = strength * spread * (atmosphere.low ? PARTY_AIR_DENSITY.low : PARTY_AIR_DENSITY.full)
    layer.fog = strength * spread > .001 ? partyFog : null
  }, -4)
  useFrame(() => atmosphere.fog.update(), -1)
  return <CaveAtmosphereContext.Provider value={atmosphere}>{children}</CaveAtmosphereContext.Provider>
}

/** Sauna is higher priority than party air. No component captures another layer as base fog. */
export function useCaveFogLayer(priority: number) {
  const atmosphere = useCaveAtmosphere(), { scene } = useThree()
  // Standalone room previews still get safe ownership without needing the App provider.
  const fallback = useMemo(() => atmosphere ? null : createCaveFogOwner(scene), [atmosphere, scene])
  const owner = atmosphere?.fog ?? fallback!
  const layer = useMemo(() => createCaveFogLayer(priority), [owner, priority])
  useFrame(() => { fallback?.update() }, -1)
  useEffect(() => owner.register(layer), [owner, layer])
  return layer
}

function useLightScale<T extends THREE.Light>(ref: RefObject<T>, base: number, fixture = false) {
  const atmosphere = useCaveAtmosphere()
  useFrame(() => {
    if (ref.current) ref.current.intensity = base * (atmosphere
      ? partyLightScale(atmosphere.blend, atmosphere.air, atmosphere.nightVision, fixture) : 1)
  })
  useEffect(() => () => { if (ref.current) ref.current.intensity = base }, [ref, base])
}
export function CaveAmbientLight(props: ThreeElements['ambientLight']) {
  const ref = useRef<THREE.AmbientLight>(null)
  useLightScale(ref, props.intensity ?? 1)
  return <ambientLight {...props} ref={ref} />
}
export function CaveHemisphereLight(props: ThreeElements['hemisphereLight']) {
  const ref = useRef<THREE.HemisphereLight>(null)
  useLightScale(ref, props.intensity ?? 1)
  return <hemisphereLight {...props} ref={ref} />
}
export function CaveDirectionalLight({ lightRef, ...props }: ThreeElements['directionalLight'] & { lightRef?: RefObject<THREE.DirectionalLight> }) {
  const ownRef = useRef<THREE.DirectionalLight>(null), ref = lightRef ?? ownRef
  useLightScale(ref, props.intensity ?? 1)
  return <directionalLight {...props} ref={ref} />
}
export function CaveFixtureLight(props: ThreeElements['pointLight']) {
  const ref = useRef<THREE.PointLight>(null)
  useLightScale(ref, props.intensity ?? 1, true)
  return <pointLight {...props} ref={ref} />
}
