import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { getGameModeFromUrl } from './game-mode'

export type AdventureDestructible = {
  position: () => Vector3 | null
  radius: number
  destroy: () => void
}

export const adventureDestructibles = new Map<string, AdventureDestructible>()
const destroyed = new Set<string>()
const registrations = new Map<string, Set<AdventureDestructible>>()
export const isAdventureObjectDestroyed = (id: string) => destroyed.has(id)
const validId = (id: unknown): id is string => typeof id === 'string' && id.length < 96 &&
  /^(?:(?:mushroom|golden-egg|green-egg|rainbow-egg)-\d{1,5}|golden-mushroom|cave-koi-[0-7]|vegetation-[0-9a-f]{1,8})$/.test(id)
export const getDestroyedAdventureObjectIds = () => [...destroyed].slice(0, 2048)

/** State replay can arrive before asset loading completes. Registration applies pending IDs. */
export function applyDestroyedAdventureObjectIds(ids: unknown): void {
  if (!Array.isArray(ids)) return
  for (const id of ids.slice(0, 2048)) {
    if (!validId(id) || destroyed.has(id) || destroyed.size >= 2048) continue
    destroyed.add(id)
    adventureDestructibles.get(id)?.destroy()
  }
}

/** One round's destruction is retained across component remounts and duplicate packets. */
export function destroyAdventureObject(id: string): boolean {
  if (!validId(id) || destroyed.has(id) || destroyed.size >= 2048) return false
  const target = adventureDestructibles.get(id)
  if (!target || !target.position()) return false
  destroyed.add(id)
  target.destroy()
  return true
}

export function registerAdventureDestructible(id: string, target: AdventureDestructible) {
  let entries = registrations.get(id)
  if (!entries) {
    entries = new Set()
    registrations.set(id, entries)
    const group = entries
    adventureDestructibles.set(id, {
      get radius() { let radius = 0; for (const entry of group) radius = Math.max(radius, entry.radius); return radius },
      position: () => {
        for (const entry of group) { const p = entry.position(); if (p) return p }
        return null
      },
      destroy: () => { for (const entry of group) entry.destroy() },
    })
  }
  entries.add(target)
  if (destroyed.has(id)) target.destroy()
  return () => {
    entries.delete(target)
    if (entries.size === 0 && registrations.get(id) === entries) {
      registrations.delete(id)
      adventureDestructibles.delete(id)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('jackalopesRoundReset', () => destroyed.clear())
}

/** Fixed collectibles need no frame-by-frame registry updates or added physics. */
export function useAdventureDestructible(id: string, position: [number, number, number], radius: number, available = true, height = 0.6, enabled = true) {
  const [hidden, setHidden] = useState(() => destroyed.has(id))
  const live = useRef({ position, available, height })
  live.current = { position, available, height }
  useEffect(() => {
    if (!enabled || getGameModeFromUrl() !== 'adventure') return
    const point = new Vector3()
    const unregister = registerAdventureDestructible(id, {
      radius,
      position: () => {
        if (!live.current.available || destroyed.has(id)) return null
        return point.set(...live.current.position).addScaledVector(up, live.current.height)
      },
      destroy: () => setHidden(true),
    })
    const reset = () => setHidden(false)
    window.addEventListener('jackalopesRoundReset', reset)
    return () => { unregister(); window.removeEventListener('jackalopesRoundReset', reset) }
  }, [id, radius, enabled])
  return hidden
}

const up = new Vector3(0, 1, 0)
