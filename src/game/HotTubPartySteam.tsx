import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCaveAtmosphere } from './CaveAtmosphere'
import { createHotTubSteamResources, createHotTubSteamMaterial, STEAM_BUDGET } from './hot-tub-party-steam'
import type { TerrainLevelDocument } from './terrain/level-document'

/** One GPU draw for every source-to-corridor wisp; no per-puff objects, lights or React updates. */
export function HotTubPartySteam({ level, quality }: { level: TerrainLevelDocument; quality: string }) {
  const atmosphere = useCaveAtmosphere()
  const mesh = useRef<THREE.Mesh>(null)
  const resources = useMemo(() => createHotTubSteamResources(level), [level])
  const material = useMemo(() => createHotTubSteamMaterial(resources, level), [resources, level])
  useEffect(() => () => {
    resources.geometry.dispose(); resources.trajectory.dispose(); resources.air.dispose(); material.dispose()
  }, [resources, material])
  useFrame(() => {
    if (!mesh.current) return
    const amount = atmosphere ? atmosphere.blend * atmosphere.air : 0
    mesh.current.visible = amount > 0
    if (!amount || !atmosphere) return
    resources.geometry.setDrawRange(0, (quality === 'low' ? STEAM_BUDGET.low : STEAM_BUDGET.full) * 6)
    material.uniforms.time.value = atmosphere.time
    material.uniforms.fill.value = Math.min(1.06, atmosphere.age / 20)
    material.uniforms.amount.value = amount * (atmosphere.nightVision ? .55 : 1)
  })
  return <mesh ref={mesh} name="party-hot-tub-source-steam" geometry={resources.geometry} material={material}
    visible={false} dispose={null} frustumCulled={false} renderOrder={6} raycast={() => {}} />
}
