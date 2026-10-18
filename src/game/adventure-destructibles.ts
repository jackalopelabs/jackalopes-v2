import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { getGameModeFromUrl } from './game-mode'

export type AdventureDestructible = {
  position: () => Vector3 | null
  radius: number
  destroy: () => void
  respawn?: () => void
}

export const adventureDestructibles = new Map<string, AdventureDestructible>()
const destroyed = new Set<string>()
// Adventure has no regular round reset. Sharks return after a short, shared cooldown.
export const SHARK_RESPAWN_MS = 60_000
const sharkDeaths = new Map<string, number>()
const sharkId = (id: unknown): id is string => typeof id === 'string' && /^water-shark-[0-5]$/.test(id)
export function refreshAdventureDestructions(now = Date.now()): void {
  for (const [id, killedAt] of sharkDeaths) {
    if (destroyed.has(id) && now >= killedAt + SHARK_RESPAWN_MS) {
      destroyed.delete(id)
      adventureDestructibles.get(id)?.respawn?.()
    }
  }
}
const registrations = new Map<string, Set<AdventureDestructible>>()
export const isAdventureObjectDestroyed = (id: string) => destroyed.has(id)
const validId = (id: unknown): id is string => typeof id === 'string' && id.length < 96 &&
  /^(?:(?:mushroom|golden-egg|green-egg|rainbow-egg)-\d{1,5}|golden-mushroom|cave-koi-[0-7]|water-shark-[0-5]|cave-lifeguard|vegetation-[0-9a-f]{1,8})$/.test(id)
export const getDestroyedAdventureObjectIds = () => {
  refreshAdventureDestructions()
  return [...destroyed].slice(0, 2048)
}
export function getAdventureDestructionState() {
  refreshAdventureDestructions()
  return { ids: [...destroyed].filter(id => !sharkId(id)).slice(0, 2048),
    sharkDeaths: [...sharkDeaths].map(([id, killedAt]) => ({ id, killedAt })) }
}

/** Keep the original death time, including expired records, so late replies cannot kill a respawn. */
export function applyAdventureSharkDeaths(records: unknown, now = Date.now()): void {
  if (!Array.isArray(records)) return
  for (const record of records.slice(0, 6)) {
    if (!record || !sharkId(record.id) || !Number.isFinite(record.killedAt) || record.killedAt <= 0 || record.killedAt > now + 5000) continue
    const killedAt = Math.min(record.killedAt, now)
    if (killedAt <= (sharkDeaths.get(record.id) ?? 0)) continue
    sharkDeaths.set(record.id, killedAt)
    if (now < killedAt + SHARK_RESPAWN_MS && !destroyed.has(record.id)) {
      destroyed.add(record.id)
      adventureDestructibles.get(record.id)?.destroy()
    }
  }
  refreshAdventureDestructions(now)
}

/** Legacy untimed replays apply only to permanent objects; sharks require their death timestamp. */
export function applyDestroyedAdventureObjectIds(ids: unknown): void {
  if (!Array.isArray(ids)) return
  for (const id of ids.slice(0, 2048)) {
    if (!validId(id) || sharkId(id) || destroyed.has(id) || destroyed.size >= 2048) continue
    destroyed.add(id)
    adventureDestructibles.get(id)?.destroy()
  }
}

/** Permanent objects last for the round; shark deaths retain a one-minute deadline. */
export function destroyAdventureObject(id: string, killedAt = Date.now()): boolean {
  refreshAdventureDestructions()
  if (!validId(id) || destroyed.has(id) || destroyed.size >= 2048) return false
  const target = adventureDestructibles.get(id)
  if (!target || !target.position()) return false
  if (sharkId(id)) {
    const now = Date.now()
    if (!Number.isFinite(killedAt) || killedAt <= (sharkDeaths.get(id) ?? 0) || killedAt + SHARK_RESPAWN_MS <= now || killedAt > now + 5000) return false
    sharkDeaths.set(id, Math.min(killedAt, now))
  }
  destroyed.add(id)
  target.destroy()
  return true
}

export function registerAdventureDestructible(id: string, target: AdventureDestructible) {
  refreshAdventureDestructions()
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
      respawn: () => { for (const entry of group) entry.respawn?.() },
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
  window.addEventListener('jackalopesRoundReset', () => { destroyed.clear(); sharkDeaths.clear() })
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
