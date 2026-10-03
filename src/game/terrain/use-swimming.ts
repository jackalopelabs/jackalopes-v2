import { useEffect, useMemo, useRef } from 'react'
import { loadTerrainLevel } from './level-document'
import { sampleSwimWater } from './water-physics'
import { caveWaterSurfaceAt } from '../adventure-caves'

export const SWIMMING_EVENT = 'jackalopes:swimming'
export type SwimmingStatus = { swimming: boolean; underwater: boolean; gamepad: boolean }

// The level is installed before the game mounts. Shared map updates reload the world.
export function useSwimming(adventureCaves = false) {
  const level = useMemo(() => loadTerrainLevel(), [])
  const status = useRef<SwimmingStatus>({ swimming: false, underwater: false, gamepad: false })
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent(SWIMMING_EVENT, {
      detail: { swimming: false, underwater: false, gamepad: false },
    }))
  }, [])

  return (position: { x: number; y: number; z: number }, cameraY: number, gamepad: boolean) => {
    const caveWater = adventureCaves ? caveWaterSurfaceAt(level, position.x, position.y, position.z, status.current.swimming) : null
    const surface = caveWater ?? sampleSwimWater(level, position.x, position.y, position.z, status.current.swimming)
    const next = { swimming: surface !== null, underwater: surface !== null && cameraY < surface - 0.1, gamepad }
    if (Object.keys(next).some(key => next[key as keyof SwimmingStatus] !== status.current[key as keyof SwimmingStatus])) {
      status.current = next
      window.dispatchEvent(new CustomEvent(SWIMMING_EVENT, { detail: next }))
    }
    return surface
  }
}

// Units per second, independent of rendering/physics frequency. Letting go gently
// floats toward the surface; holding up never launches a swimmer into the sky.
export function swimVerticalVelocity(y: number, surface: number, input: number, previous: number, dt: number) {
  const floatY = surface - 0.35
  const desired = input !== 0 ? input * 4 : Math.max(-1.2, Math.min(0.8, (floatY - y) * 2))
  const velocity = previous + (desired - previous) * (1 - Math.exp(-8 * dt))
  return Math.min(velocity, Math.max(0, floatY - y) / Math.max(dt, 0.001))
}
