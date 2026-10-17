import * as THREE from 'three'
import { caveCeilingAt, caveFloorAt, caveLayout, isWithinCaveFootprint } from './adventure-caves'
import type { TerrainLevelDocument } from './terrain/level-document'
import type { PartyPoint } from './cave-party-room'

export type SceneFog = THREE.Scene['fog']
export type FogLayer = { fog: SceneFog; priority: number }
/** Pure allocation: creating a layer during render never registers it or touches the scene. */
export const createCaveFogLayer = (priority: number): FogLayer => ({ fog: null, priority })
/** One scene.fog writer. Owned layers are never mistaken for the ordinary App fog. */
export function createCaveFogOwner(scene: { fog: SceneFog }) {
  let base = scene.fog, applied = scene.fog
  const layers = new Map<FogLayer, symbol>(), owned = new WeakSet<object>()
  const update = () => {
    if (scene.fog !== applied && (!scene.fog || !owned.has(scene.fog))) base = scene.fog
    let winner: FogLayer | undefined
    for (const layer of layers.keys()) {
      if (layer.fog) owned.add(layer.fog)
      if (layer.fog && (!winner || layer.priority > winner.priority)) winner = layer
    }
    scene.fog = applied = winner?.fog ?? base
  }
  return {
    /** Effect-scoped lease. A replay/stale cleanup cannot release a newer registration. */
    register(layer: FogLayer) {
      const token = Symbol('fog-layer-lease')
      layers.set(layer, token)
      return () => {
        if (layers.get(layer) !== token) return
        layers.delete(layer)
        update()
      }
    },
    update,
    dispose() {
      if (scene.fog !== applied && (!scene.fog || !owned.has(scene.fog))) base = scene.fog
      layers.clear()
      if (!scene.fog || scene.fog === applied || owned.has(scene.fog)) scene.fog = base
    },
  }
}

/** Exclude outdoors, underwater and the roof, including the open entrance ramp. */
export function caveAirWeight(level: TerrainLevelDocument, point: PartyPoint): number {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z) || !isWithinCaveFootprint(point.x, point.z)) return 0
  const floor = caveFloorAt(level, point.x, point.z), roof = caveCeilingAt(level, point.x, point.z)
  if (floor === null || roof === null) return 0
  const airFloor = Math.max(floor, caveLayout(level).waterLevel)
  const boundary = Math.min((point.y - airFloor) / .7, (roof - point.y) / .7, (-point.z - 7) / 8)
  return THREE.MathUtils.smoothstep(boundary, 0, 1)
}
export function partyLightScale(blend: number, air: number, nightVision: boolean, fixture = false): number {
  return 1 - THREE.MathUtils.clamp(blend * air, 0, 1) * (nightVision ? 0 : fixture ? .24 : .4)
}
export const PARTY_AIR_DENSITY = { low: .021, full: .028 } as const
