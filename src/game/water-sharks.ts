import { caveFloorAt, caveLayout, caveWaterSurfaceAt } from './adventure-caves'
import { sampleSwimWater, terrainHeightAt, waterSurfaceAt } from './terrain/water-physics'
import { TERRAIN_SEGMENTS, TERRAIN_SIZE, type TerrainLevelDocument } from './terrain/level-document'
import { SWIM_SPRINT_SPEED } from './terrain/swim-speeds'

export const SHARK_SPEED = SWIM_SPRINT_SPEED - .4
export const SHARK_BITE_EVENT = 'jackalopes:shark-bite'
export const sharkPlayerState = { caughtUntil: 0, immuneUntil: 0 }
export type SharkPoint = { x: number; y: number; z: number }
export type SharkSwimmer = SharkPoint & { enabled: boolean; swimming: boolean; riding: boolean; immune: boolean }
export type Shark = SharkPoint & { id: number; heading: number; homeX: number; homeZ: number; kind: 'cave' | 'surface'; target: string | null; returnUntil?: number }
const finitePoint = (p: SharkPoint) => p && [p.x, p.y, p.z].every(Number.isFinite)
const distance = (a: SharkPoint, b: SharkPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** Room for the whole shark, rather than letting its centre cross a shore or wall. */
export function sharkHabitat(level: TerrainLevelDocument, x: number, z: number, kind: Shark['kind']): { surface: number; bottom: number } | null {
  let bottom = -Infinity
  const surface = kind === 'cave' ? caveLayout(level).waterLevel : waterSurfaceAt(level, x, z)
  if (surface === null) return null
  for (const [dx, dz] of [[0, 0], [1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]]) {
    const ground = kind === 'cave' ? caveFloorAt(level, x + dx, z + dz) : terrainHeightAt(level, x + dx, z + dz)
    const water: number | null = kind === 'cave' ? caveWaterSurfaceAt(level, x + dx, surface - .7, z + dz) : waterSurfaceAt(level, x + dx, z + dz)
    if (ground === null || water !== surface || surface - ground < 3.3) return null
    bottom = Math.max(bottom, ground)
  }
  return { surface, bottom }
}

export function createSharks(level: TerrainLevelDocument): Shark[] {
  const sharks: Shark[] = []
  const add = (x: number, z: number, kind: Shark['kind']) => {
    const water = sharkHabitat(level, x, z, kind)
    if (water) sharks.push({ id: sharks.length, x, y: water.surface - .75, z, heading: 0, homeX: x, homeZ: z, kind, target: null })
  }
  add(-12, -110, 'cave'); add(12, -110, 'cave')
  add(-12, -132, 'cave'); add(12, -132, 'cave')
  // At most two outdoor sharks, spread across substantial painted swimming water.
  const cell = TERRAIN_SIZE / TERRAIN_SEGMENTS
  const maximum = sharks.length + 2
  for (let row = 1; row < TERRAIN_SEGMENTS - 1 && sharks.length < maximum; row++) {
    for (let col = 1; col < TERRAIN_SEGMENTS - 1 && sharks.length < maximum; col++) {
      const x = (col + .5) * cell - TERRAIN_SIZE / 2, z = (row + .5) * cell - TERRAIN_SIZE / 2
      if (sharks.some(s => s.kind === 'surface' && Math.hypot(s.x - x, s.z - z) < 55)) continue
      add(x, z, 'surface')
    }
  }
  return sharks
}

export function sharkCanChase(level: TerrainLevelDocument, shark: Shark, swimmer: SharkSwimmer) {
  if (!finitePoint(swimmer) || !swimmer.enabled || !swimmer.swimming || swimmer.riding || swimmer.immune) return false
  const water = shark.kind === 'cave'
    ? caveWaterSurfaceAt(level, swimmer.x, swimmer.y, swimmer.z, true)
    : sampleSwimWater(level, swimmer.x, swimmer.y, swimmer.z, true)
  return water !== null && swimmer.y < water + .25 && distance(shark, swimmer) < 32
    && Math.hypot(swimmer.x - shark.homeX, swimmer.z - shark.homeZ) < 28
}

/** Bounded, water-contained steering. All movement, including dives, shares one speed budget. */
export function stepSharks(level: TerrainLevelDocument, sharks: Shark[], swimmers: Map<string, SharkSwimmer>, dt: number, time: number) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > .25) return
  dt = Math.min(dt, .05)
  for (const shark of sharks) {
    let nearest: SharkSwimmer | undefined, best = Infinity
    shark.target = null
    for (const [actor, swimmer] of swimmers) {
      if (time < (shark.returnUntil ?? 0)) break
      if (!sharkCanChase(level, shark, swimmer)) continue
      const d = distance(shark, swimmer)
      if (d < best) { nearest = swimmer; best = d; shark.target = actor }
    }
    const angle = time * .19 + shark.id * 2.7
    const water = sharkHabitat(level, shark.x, shark.z, shark.kind)
    if (!water) continue
    const returning = !nearest && (time < (shark.returnUntil ?? 0)
      || Math.hypot(shark.x - shark.homeX, shark.z - shark.homeZ) > 9 || shark.y < water.surface - 1.5)
    const targetX = nearest?.x ?? shark.homeX + (returning ? 0 : Math.cos(angle) * 6)
    const targetZ = nearest?.z ?? shark.homeZ + (returning ? 0 : Math.sin(angle) * 5)
    const targetY = Math.max(water.bottom + 1, Math.min(water.surface - .65, nearest ? nearest.y - .4 : water.surface - .75))
    const dx = targetX - shark.x, dy = targetY - shark.y, dz = targetZ - shark.z
    const length = Math.hypot(dx, dy, dz)
    if (length < .01) continue
    const speed = nearest || returning ? SHARK_SPEED : 2.1
    const scale = Math.min(length, speed * dt) / length
    const nx = shark.x + dx * scale, ny = shark.y + dy * scale, nz = shark.z + dz * scale
    const nextWater = sharkHabitat(level, nx, nz, shark.kind)
    if (nextWater && ny > nextWater.bottom + .7 && ny < nextWater.surface - .5) {
      shark.x = nx; shark.y = ny; shark.z = nz
      shark.heading = Math.atan2(dx, dz)
    } else {
      // A shore cannot be crossed diagonally; turn back toward the patrol centre.
      const hx = shark.homeX - shark.x, hz = shark.homeZ - shark.z, h = Math.hypot(hx, hz)
      if (h < .1) continue
      const amount = Math.min(h, speed * dt) / h
      const bx = shark.x + hx * amount, bz = shark.z + hz * amount
      const backWater = sharkHabitat(level, bx, bz, shark.kind)
      if (backWater && shark.y > backWater.bottom + .7 && shark.y < backWater.surface - .5) {
        shark.x = bx; shark.z = bz; shark.heading = Math.atan2(hx, hz)
      } else {
        // Rise first if a sloping bed blocks the return; never swim underneath it.
        shark.y = Math.min(water.surface - .65, shark.y + speed * dt)
      }
    }
  }
}

export function sharkMouthDistance(shark: Shark, swimmer: SharkPoint) {
  return Math.hypot(shark.x + Math.sin(shark.heading) * 1.55 - swimmer.x,
    shark.y - (swimmer.y - .45), shark.z + Math.cos(shark.heading) * 1.55 - swimmer.z)
}

export function createSharkBiteGate() {
  let protectedUntil = 0, readyAt = Infinity
  return {
    reset(now: number) { readyAt = now + 900 },
    protect(now: number) { protectedUntil = now + 5000 },
    tryBite(level: TerrainLevelDocument, sharks: Shark[], swimmer: SharkSwimmer, now: number, fresh: boolean) {
      if (!fresh || now < protectedUntil || now < readyAt) return null
      const shark = sharks.find(s => sharkCanChase(level, s, swimmer) &&
        (sharkMouthDistance(s, swimmer) < 1.35 || distance(s, swimmer) < .85))
      if (!shark) return null
      protectedUntil = now + 6000
      return shark.id
    },
  }
}

// A different flock layout must not elect a simulator from an older cached game.
export const SHARK_EVENTS = { peer: 'water_sharks_v2_peer', state: 'water_sharks_v2_state', chomp: 'water_sharks_v2_chomp' } as const
type Presence = { event_type: typeof SHARK_EVENTS.peer; actor: string; sequence: number; swimmer: SharkSwimmer }
type Snapshot = { event_type: typeof SHARK_EVENTS.state; actor: string; sequence: number; sharks: (SharkPoint & { heading: number })[] }
type Chomp = { event_type: typeof SHARK_EVENTS.chomp; actor: string; sequence: number; shark: number }
type SharkEvent = Presence | Snapshot | Chomp
const validActor = (actor: unknown): actor is string => typeof actor === 'string' && actor.length > 0 && actor.length < 100

/** Only active visible peers elect a simulator. Each owner alone decides whether it was caught. */
export function createSharkPeer(level: TerrainLevelDocument, actor: string, send: (event: SharkEvent) => void) {
  const sharks = createSharks(level)
  const peers = new Map<string, { swimmer: SharkSwimmer; at: number; sequence: number }>()
  const receivedSequence = new Map<string, number>()
  let sequence = 0, announced = -Infinity, published = -Infinity, snapshotAt = -Infinity, leader = actor
  const leaderAt = (now: number) => {
    for (const [id, peer] of peers) if (now - peer.at > 2500) { peers.delete(id); receivedSequence.delete(id) }
    return [...peers.keys()].sort()[0] ?? actor
  }
  return {
    sharks,
    get leader() { return leader },
    fresh(now: number) { return leader === actor || now - snapshotAt < 650 },
    receive(value: unknown, now: number): number | null {
      if (!value || typeof value !== 'object') return null
      const event = value as SharkEvent
      if (!validActor(event.actor) || event.actor === actor || !Number.isSafeInteger(event.sequence) || event.sequence < 1) return null
      const key = `${event.actor}:${event.event_type}`
      if (event.sequence <= (receivedSequence.get(key) ?? 0)) return null
      if (event.event_type === SHARK_EVENTS.peer) {
        const p = event.swimmer
        if (!finitePoint(p) || !['enabled', 'swimming', 'riding', 'immune'].every(k => typeof p[k as keyof SharkSwimmer] === 'boolean')) return null
        if (!peers.has(event.actor) && peers.size >= 24) return null
        peers.set(event.actor, { swimmer: { ...p }, at: now, sequence: event.sequence })
      } else if (event.event_type === SHARK_EVENTS.state) {
        leader = leaderAt(now)
        if (event.actor !== leader || !Array.isArray(event.sharks) || event.sharks.length !== sharks.length) return null
        if (!event.sharks.every((p, i) => {
          if (!finitePoint(p) || !Number.isFinite(p.heading)) return false
          const water = sharkHabitat(level, p.x, p.z, sharks[i].kind)
          return water !== null && p.y > water.bottom + .7 && p.y < water.surface - .5
        })) return null
        event.sharks.forEach((p, i) => { sharks[i].x = p.x; sharks[i].y = p.y; sharks[i].z = p.z; sharks[i].heading = p.heading! })
        snapshotAt = now
      } else if (event.event_type === SHARK_EVENTS.chomp) {
        if (!peers.has(event.actor) || !Number.isInteger(event.shark) || event.shark < 0 || event.shark >= sharks.length) return null
        receivedSequence.set(key, event.sequence)
        sharks[event.shark].returnUntil = now / 1000 + 6
        return event.shark
      } else return null
      receivedSequence.set(key, event.sequence)
      // Keep sequence memory bounded even across repeated disconnects/remounts.
      if (receivedSequence.size > 96) receivedSequence.delete(receivedSequence.keys().next().value!)
      return null
    },
    step(swimmer: SharkSwimmer, now: number, dt: number, visible: boolean) {
      if (!visible) { peers.delete(actor); return }
      peers.set(actor, { swimmer: { ...swimmer }, at: now, sequence })
      leader = leaderAt(now)
      if (now - announced > 300) { announced = now; send({ event_type: SHARK_EVENTS.peer, actor, sequence: ++sequence, swimmer: { ...swimmer } }) }
      if (leader !== actor) return
      stepSharks(level, sharks, new Map([...peers].filter(([, p]) => now - p.at < 900).map(([id, p]) => [id, p.swimmer])), dt, now / 1000)
      if (now - published > 200) {
        published = now
        send({ event_type: SHARK_EVENTS.state, actor, sequence: ++sequence,
          sharks: sharks.map(s => ({ x: s.x, y: s.y, z: s.z, heading: s.heading })) })
      }
    },
    chomp(shark: number, now: number) {
      if (!sharks[shark]) return
      sharks[shark].returnUntil = now / 1000 + 6
      send({ event_type: SHARK_EVENTS.chomp, actor, sequence: ++sequence, shark })
    },
    reset() { peers.clear(); receivedSequence.clear(); announced = published = snapshotAt = -Infinity; leader = actor },
  }
}
