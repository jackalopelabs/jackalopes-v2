import * as THREE from 'three'
import { caveCeilingAt, caveFloorAt } from './adventure-caves'
import { createWaterslide, WATERSLIDE_RIDER_OFFSET } from './cave-waterslide'
import type { TerrainLevelDocument } from './terrain/level-document'

export type GuardReason = 'run' | 'up-slide'
export type GuardMotion = { x: number; y: number; z: number; at: number; sprint: boolean;
  grounded: boolean; autoHop: boolean; swimming: boolean; riding: boolean; enabled: boolean }
/** Local controller-owned sample, shared by BOTH adventure avatar appearances. Never networked. */
export const lifeguardMotion: GuardMotion = { x: 0, y: 0, z: 0, at: -Infinity, sprint: false,
  grounded: false, autoHop: false, swimming: false, riding: false, enabled: false }
export const LIFEGUARD = { x: 8.5, z: -87, range: 72, cooldown: 8 } as const
export const guardMessage = (reason: GuardReason) => reason === 'run' ? 'Walk, please!' : 'Down the slide, please!'

/** Prebaked arc-length polyline: projection follows the actual curved trough, not global Z. */
export function createLifeguardRules(level: TerrainLevelDocument) {
  const slide = createWaterslide(level), nodes = slide.curve.getSpacedPoints(160)
  const projection = { progress: 0, distance: Infinity, y: 0 }
  const project = (p: { x: number; y: number; z: number }) => {
    let best = Infinity
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1], dx = b.x - a.x, dz = b.z - a.z
      const t = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1)
      const d = (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2
      if (d < best) { best = d; projection.progress = (i + t) / 160; projection.y = a.y + t * (b.y - a.y) }
    }
    projection.distance = Math.sqrt(best)
    return projection
  }
  const inCave = (p: { x: number; y: number; z: number }) => {
    if (![p.x, p.y, p.z].every(Number.isFinite) || p.z > -60 || p.z < -158 || Math.abs(p.x) > 55) return false
    const floor = caveFloorAt(level, p.x, p.z), roof = caveCeilingAt(level, p.x, p.z)
    return floor !== null && roof !== null && p.y > floor && p.y < roof - .2
  }
  const dryPoolside = (p: { x: number; y: number; z: number }) => {
    if (!inCave(p) || p.z > -65 || p.z < -103 || Math.abs(p.x) > 22) return false
    const floor = caveFloorAt(level, p.x, p.z)!
    return floor > slide.waterLevel + .35 && Math.abs(p.y - floor - 1.85) < 1.1
  }
  let previous: GuardMotion | undefined, progress = 0, persistence = 0, quiet = 0, armed = true
  let lastGround = -Infinity, lastTweet = -Infinity, reason: GuardReason | null = null
  return {
    slide, project, inCave, dryPoolside,
    position: { x: LIFEGUARD.x, y: caveFloorAt(level, LIFEGUARD.x, LIFEGUARD.z)!, z: LIFEGUARD.z },
    reset() { previous = undefined; armed = true; persistence = quiet = 0; reason = null; lastGround = -Infinity },
    step(sample: GuardMotion, now: number): GuardReason | null {
      const old = previous
      const dt = old ? (sample.at - old.at) / 1000 : 0
      const valid = sample.enabled && now - sample.at >= 0 && now - sample.at < 250 && inCave(sample)
      const path = project(sample), nextProgress = path.progress
      const onSlide = path.distance < 1.45 && Math.abs(sample.y - path.y - WATERSLIDE_RIDER_OFFSET) < .85
      previous = { ...sample }; const oldProgress = progress; progress = nextProgress
      const distance = old ? Math.hypot(sample.x - old.x, sample.y - old.y, sample.z - old.z) : 0
      if (!valid || !old || dt <= 0 || dt > .2 || distance > 20 * dt + .15) {
        armed = true; persistence = quiet = 0; reason = null; lastGround = -Infinity; return null
      }
      if (sample.grounded) lastGround = now
      // Natural small locomotion hops retain ground contact briefly; manual jumps/falls do not.
      const onFoot = sample.grounded || sample.autoHop && now - lastGround < 550
      const speed = Math.hypot(sample.x - old.x, sample.z - old.z) / dt
      let candidate: GuardReason | null = null
      if (onFoot && !sample.swimming && !sample.riding) {
        if (onSlide && nextProgress > .065 && nextProgress < .94 &&
          (oldProgress - nextProgress) * slide.length / dt > .7 && speed > .8) candidate = 'up-slide'
        else if (!onSlide && dryPoolside(sample) && sample.sprint && speed > 8.4) candidate = 'run'
      }
      if (candidate) {
        quiet = 0; persistence = reason === candidate ? persistence + dt : dt; reason = candidate
        if (armed && persistence >= .55 && now - lastTweet >= LIFEGUARD.cooldown * 1000) {
          armed = false; lastTweet = now; return candidate
        }
      } else {
        persistence = 0; reason = null; quiet += dt
        if (quiet > 1.25) armed = true
      }
      return null
    },
  }
}

export type GuardEvent = { event_type: 'cave_lifeguard'; id: string; reason: GuardReason; at: number; position: number[] }
/** Transient reaction only: bounded dedup and shared-NPC cooldown, no persistent room state. */
export function createGuardReactionGate() {
  const seen = new Set<string>(); let last = -Infinity
  return (value: unknown, now: number): GuardEvent | null => {
    if (!value || typeof value !== 'object') return null
    const e = value as GuardEvent
    if (e.event_type !== 'cave_lifeguard' || typeof e.id !== 'string' || !e.id || e.id.length > 160 ||
      !['run', 'up-slide'].includes(e.reason) || !Number.isFinite(e.at) || Math.abs(Date.now() - e.at) > 15000 ||
      !Array.isArray(e.position) || e.position.length !== 3 || !e.position.every(Number.isFinite) || seen.has(e.id)) return null
    seen.add(e.id); if (seen.size > 32) seen.delete(seen.values().next().value!)
    if (now - last < 3500) return null
    last = now; return e
  }
}
