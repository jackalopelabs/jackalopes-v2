import { EVERLY_CASTLE_FLOOR, EVERLY_CASTLE_FRONT_WALLS, EVERLY_DRY_GROUND_CAPS, EVERLY_RIVER, EVERLY_RIVER_BANKS, everlyGroundRegionAt } from './everly-adventure'

export type FriendHome = { x: number; y: number; z: number; phase: number; yaw?: number }
export type FriendSample = { x: number; y: number; z: number; engaged: boolean; greetingCount: number; hopping: boolean; motion: 'idle' | 'walk' | 'run' }
export type EverlyFriendState = FriendSample & {
  homeX: number; homeY: number; homeZ: number; homeYaw: number; phase: number; localTime: number
  cooldownUntil: number; hopUntil: number; nextHopAt: number; heading: number
  recruited: boolean; following: boolean; waiting: boolean; waitingReason: string
  routeCursor: number; routeGeneration: number; routeSeeded: boolean; onTrail: boolean; routeX: number; routeZ: number
}

export const EVERLY_FRIEND_ENTER_RADIUS = 14
export const EVERLY_FRIEND_LEAVE_RADIUS = 19
export const EVERLY_FRIEND_VERTICAL_RANGE = 4.5
export const EVERLY_FRIEND_COOLDOWN = 3.5
export const EVERLY_FRIEND_HOP_DURATION = 0.72
const FROLIC_RADIUS = 2.35
const TRAIL_CAPACITY = 256
const RECORD_SPACING = 0.45
const DISCONTINUITY = 2.1
const JOIN_RADIUS = 14
const BODY_MARGIN = 0.55
const FOLLOW_SPEED = 8
const CATCHUP_SPEED = 13.2
const FOLLOW_GAPS = [3.8, 7.6, 11.4]
const FRONT_Z = -54
const BACK_Z = -82
const SIDE_WALL_X = [-14.35, 14.35]
const WALL_HALF_THICKNESS = 0.65
const DOOR_Z = -54.9
const DOOR_HALF_THICKNESS = 0.22
const DOOR_HALF_WIDTH = 3
const CASTLE_WALL_HALF_DEPTH = 14

export type EverlyFollowTrail = {
  x: Float32Array; z: Float32Array; distance: Float64Array; generationAt: Uint32Array
  nextSequence: number; totalDistance: number; lastX: number; lastZ: number
  hasLast: boolean; needsNewGeneration: boolean; discontinuity: boolean; waitingReason: string
  generation: number; segmentStartDistance: number
}

export function createEverlyFollowTrail(): EverlyFollowTrail {
  return { x: new Float32Array(TRAIL_CAPACITY), z: new Float32Array(TRAIL_CAPACITY), distance: new Float64Array(TRAIL_CAPACITY), generationAt: new Uint32Array(TRAIL_CAPACITY), nextSequence: 0, totalDistance: 0, lastX: 0, lastZ: 0, hasLast: false, needsNewGeneration: false, discontinuity: false, waitingReason: 'waiting', generation: 0, segmentStartDistance: 0 }
}

export function resetEverlyFollowTrail(trail: EverlyFollowTrail): void {
  trail.nextSequence = 0; trail.totalDistance = 0; trail.lastX = 0; trail.lastZ = 0
  trail.hasLast = false; trail.needsNewGeneration = false; trail.discontinuity = false
  trail.waitingReason = 'waiting'; trail.generation = 0; trail.segmentStartDistance = 0
}

function dryGroundAt(x: number, z: number): boolean {
  const region = everlyGroundRegionAt(x, z)
  if (!region) return false
  if (region === 'bank') {
    const margin = BODY_MARGIN
    for (const bank of EVERLY_RIVER_BANKS) {
      if (Math.abs(x - bank.centerX) > bank.halfWidth || Math.abs(z - bank.centerZ) > bank.halfDepth) continue
      const outer = bank.centerX < 0 ? bank.centerX - bank.halfWidth : bank.centerX + bank.halfWidth
      if (bank.centerX < 0 ? x < outer + margin : x > outer - margin) return false
      if (z > EVERLY_RIVER.nearZ + margin && z < EVERLY_RIVER.farZ - margin && Math.abs(Math.abs(x) - 7) < margin) return false
      if (z < bank.centerZ - bank.halfDepth + margin || z > bank.centerZ + bank.halfDepth - margin) return false
      return true
    }
    return false
  }
  if (region === 'river-exit' || region === 'castle-approach') {
    const cap = EVERLY_DRY_GROUND_CAPS[region === 'river-exit' ? 0 : 1]
    // The x edges join the neighboring bank/castle floor; only exposed z edges need clearance.
    return Math.abs(z - cap.centerZ) <= cap.halfDepth - BODY_MARGIN && Math.abs(x - cap.centerX) <= cap.halfWidth
  }
  if (region === 'castle-floor') {
    return Math.abs(x - EVERLY_CASTLE_FLOOR.centerX) <= EVERLY_CASTLE_FLOOR.halfWidth - BODY_MARGIN &&
      z >= EVERLY_CASTLE_FLOOR.centerZ - EVERLY_CASTLE_FLOOR.halfDepth + BODY_MARGIN &&
      z <= EVERLY_CASTLE_FLOOR.centerZ + EVERLY_CASTLE_FLOOR.halfDepth
  }
  return false
}

function segmentIntersectsRect(x0: number, z0: number, x1: number, z1: number, centerX: number, centerZ: number, halfX: number, halfZ: number): boolean {
  const minX = centerX - halfX - BODY_MARGIN, maxX = centerX + halfX + BODY_MARGIN
  const minZ = centerZ - halfZ - BODY_MARGIN, maxZ = centerZ + halfZ + BODY_MARGIN
  const dx = x1 - x0, dz = z1 - z0
  let t0 = 0, t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
    return true
  }
  return clip(-dx, x0 - minX) && clip(dx, maxX - x0) && clip(-dz, z0 - minZ) && clip(dz, maxZ - z0) && t0 <= t1
}

/** Tests the same walkable ground regions and castle slab extents as the actual scene. */
export function everlyFollowerSegmentSafe(x0: number, z0: number, x1: number, z1: number, doorsOpen: boolean): boolean {
  if (![x0, z0, x1, z1].every(Number.isFinite) || !dryGroundAt(x0, z0) || !dryGroundAt(x1, z1)) return false
  for (const wall of EVERLY_CASTLE_FRONT_WALLS) {
    if (segmentIntersectsRect(x0, z0, x1, z1, wall.centerX, FRONT_Z, wall.halfWidth, WALL_HALF_THICKNESS)) return false
  }
  if (!doorsOpen && segmentIntersectsRect(x0, z0, x1, z1, 0, DOOR_Z, DOOR_HALF_WIDTH, DOOR_HALF_THICKNESS)) return false
  for (const x of SIDE_WALL_X) if (segmentIntersectsRect(x0, z0, x1, z1, x, (FRONT_Z + BACK_Z) / 2, WALL_HALF_THICKNESS, CASTLE_WALL_HALF_DEPTH)) return false
  if (segmentIntersectsRect(x0, z0, x1, z1, 0, BACK_Z, EVERLY_CASTLE_FLOOR.halfWidth + 1, WALL_HALF_THICKNESS)) return false
  const distance = Math.hypot(x1 - x0, z1 - z0), samples = Math.ceil(distance / 0.35)
  for (let i = 1; i < samples; i++) {
    const t = i / samples
    if (!dryGroundAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false
  }
  return true
}

function appendTrailPoint(trail: EverlyFollowTrail, x: number, z: number): void {
  const sequence = trail.nextSequence, slot = sequence % TRAIL_CAPACITY
  if (trail.hasLast) trail.totalDistance += Math.hypot(x - trail.lastX, z - trail.lastZ)
  trail.x[slot] = x; trail.z[slot] = z; trail.distance[slot] = trail.totalDistance; trail.generationAt[slot] = trail.generation
  trail.nextSequence++; trail.lastX = x; trail.lastZ = z; trail.hasLast = true
}

/** Records only grounded, connected player breadcrumbs in a fixed-size ring. */
export function recordEverlyPlayerTrail(trail: EverlyFollowTrail, player: { x: number; y: number; z: number } | null, doorsOpen: boolean): void {
  trail.discontinuity = false
  const valid = !!player && [player.x, player.y, player.z].every(Number.isFinite)
  const reason = !valid ? 'invalid' : player!.y > 4.5 ? 'cloud' : player!.y < -0.15 ? 'water' : !dryGroundAt(player!.x, player!.z) ? 'off-ground' : ''
  if (reason) {
    trail.waitingReason = reason; trail.needsNewGeneration ||= trail.hasLast; trail.hasLast = false
    return
  }
  if (!trail.hasLast) {
    if (trail.needsNewGeneration) {
      trail.generation++; trail.totalDistance += 0.01; trail.segmentStartDistance = trail.totalDistance
      trail.discontinuity = true; trail.needsNewGeneration = false
    }
    appendTrailPoint(trail, player!.x, player!.z)
    trail.waitingReason = trail.discontinuity ? 'rejoined on dry ground' : ''
    return
  }
  const dx = player!.x - trail.lastX, dz = player!.z - trail.lastZ, distance = Math.hypot(dx, dz)
  if (distance > DISCONTINUITY) {
    trail.generation++; trail.totalDistance += 0.01; trail.segmentStartDistance = trail.totalDistance
    trail.discontinuity = true
    const slot = trail.nextSequence % TRAIL_CAPACITY
    trail.x[slot] = player!.x; trail.z[slot] = player!.z; trail.distance[slot] = trail.totalDistance; trail.generationAt[slot] = trail.generation
    trail.nextSequence++; trail.lastX = player!.x; trail.lastZ = player!.z; trail.waitingReason = 'rejoined on dry ground'
    return
  }
  if (distance < RECORD_SPACING) { trail.waitingReason = ''; return }
  if (!everlyFollowerSegmentSafe(trail.lastX, trail.lastZ, player!.x, player!.z, doorsOpen)) {
    trail.waitingReason = doorsOpen ? 'blocked path' : 'closed door or unsafe path'; trail.needsNewGeneration = true; trail.hasLast = false; return
  }
  appendTrailPoint(trail, player!.x, player!.z); trail.waitingReason = ''
}

function trailPointAt(trail: EverlyFollowTrail, wantedDistance: number, generation: number, out: { routeX: number; routeZ: number }): boolean {
  const first = Math.max(0, trail.nextSequence - TRAIL_CAPACITY)
  let firstSeq = -1, lastSeq = -1
  for (let seq = first; seq < trail.nextSequence; seq++) {
    if (trail.generationAt[seq % TRAIL_CAPACITY] === generation) { if (firstSeq < 0) firstSeq = seq; lastSeq = seq }
  }
  if (firstSeq < 0) return false
  const firstSlot = firstSeq % TRAIL_CAPACITY
  if (wantedDistance <= trail.distance[firstSlot]) { out.routeX = trail.x[firstSlot]; out.routeZ = trail.z[firstSlot]; return true }
  for (let seq = firstSeq + 1; seq <= lastSeq; seq++) {
    const slot = seq % TRAIL_CAPACITY, prior = (seq - 1) % TRAIL_CAPACITY
    if (trail.distance[slot] >= wantedDistance) {
      const span = trail.distance[slot] - trail.distance[prior]
      const t = span > 0 ? Math.max(0, Math.min(1, (wantedDistance - trail.distance[prior]) / span)) : 0
      out.routeX = trail.x[prior] + (trail.x[slot] - trail.x[prior]) * t
      out.routeZ = trail.z[prior] + (trail.z[slot] - trail.z[prior]) * t
      return true
    }
  }
  const last = lastSeq % TRAIL_CAPACITY
  out.routeX = trail.x[last]; out.routeZ = trail.z[last]
  return true
}

function seedFollowerAtNearestRoute(state: EverlyFriendState, trail: EverlyFollowTrail, doorsOpen: boolean): boolean {
  const first = Math.max(0, trail.nextSequence - TRAIL_CAPACITY)
  let nearest = JOIN_RADIUS, cursor = -1
  for (let seq = first; seq < trail.nextSequence; seq++) {
    const slot = seq % TRAIL_CAPACITY
    if (trail.generationAt[slot] !== trail.generation) continue
    const distance = Math.hypot(trail.x[slot] - state.x, trail.z[slot] - state.z)
    if (distance < nearest && everlyFollowerSegmentSafe(state.x, state.z, trail.x[slot], trail.z[slot], doorsOpen)) { nearest = distance; cursor = trail.distance[slot] }
  }
  if (cursor < 0) return false
  state.routeCursor = cursor; state.routeGeneration = trail.generation; state.routeSeeded = true; state.onTrail = false
  trailPointAt(trail, cursor, trail.generation, state)
  if (Math.hypot(state.x - state.routeX, state.z - state.routeZ) <= 0.75) state.onTrail = true
  return true
}

function seedFollowerAtOldestRoute(state: EverlyFriendState, trail: EverlyFollowTrail, doorsOpen: boolean): boolean {
  const first = Math.max(0, trail.nextSequence - TRAIL_CAPACITY)
  for (let seq = first; seq < trail.nextSequence; seq++) {
    const slot = seq % TRAIL_CAPACITY
    if (trail.generationAt[slot] !== state.routeGeneration) continue
    if (Math.hypot(trail.x[slot] - state.x, trail.z[slot] - state.z) > JOIN_RADIUS ||
        !everlyFollowerSegmentSafe(state.x, state.z, trail.x[slot], trail.z[slot], doorsOpen)) return false
    state.routeCursor = trail.distance[slot]; state.routeSeeded = true; state.onTrail = false
    state.routeX = trail.x[slot]; state.routeZ = trail.z[slot]
    if (Math.hypot(state.x - state.routeX, state.z - state.routeZ) <= 0.75) state.onTrail = true
    return true
  }
  return false
}

function updateFollowing(state: EverlyFriendState, trail: EverlyFollowTrail, dt: number, doorsOpen: boolean, friendIndex: number): void {
  state.following = false; state.waiting = false; state.waitingReason = ''
  if (!state.recruited) { state.motion = 'idle'; return }
  if (trail.waitingReason && trail.waitingReason !== 'rejoined on dry ground') {
    state.waiting = true; state.waitingReason = trail.waitingReason; state.motion = 'idle'; return
  }
  if ((!state.routeSeeded || state.routeGeneration !== trail.generation) && !seedFollowerAtNearestRoute(state, trail, doorsOpen)) {
    state.waiting = true; state.waitingReason = trail.discontinuity ? 'route gap' : 'finding safe route'; state.motion = 'idle'; return
  }
  const oldest = Math.max(0, trail.nextSequence - TRAIL_CAPACITY)
  let oldestRouteDistance = Infinity
  for (let seq = oldest; seq < trail.nextSequence; seq++) {
    const slot = seq % TRAIL_CAPACITY
    if (trail.generationAt[slot] === state.routeGeneration) { oldestRouteDistance = trail.distance[slot]; break }
  }
  if (state.routeCursor < oldestRouteDistance - RECORD_SPACING && !seedFollowerAtOldestRoute(state, trail, doorsOpen)) {
    state.routeSeeded = false; state.waiting = true; state.waitingReason = 'route history rolled over'; state.motion = 'idle'; return
  }
  if (!state.onTrail) {
    if (!trailPointAt(trail, state.routeCursor, state.routeGeneration, state) || !everlyFollowerSegmentSafe(state.x, state.z, state.routeX, state.routeZ, doorsOpen)) {
      state.routeSeeded = false; state.waiting = true; state.waitingReason = 'finding safe route'; state.motion = 'idle'; return
    }
    const dx = state.routeX - state.x, dz = state.routeZ - state.z, distance = Math.hypot(dx, dz), step = Math.min(distance, (state.routeCursor < trail.totalDistance - 8 ? CATCHUP_SPEED : FOLLOW_SPEED) * dt)
    if (distance > 1e-5 && step > 0) { state.x += dx / distance * step; state.z += dz / distance * step }
    if (distance <= step + 1e-4) state.onTrail = true
    const angle = Math.atan2(Math.sin(Math.atan2(dx, dz) - state.heading), Math.cos(Math.atan2(dx, dz) - state.heading))
    state.heading += angle * (1 - Math.exp(-dt * 5))
    state.following = step > 0.001; state.motion = dt > 1e-5 && step / dt > 6.8 ? 'run' : step > 0.001 ? 'walk' : 'idle'
    return
  }
  const gap = FOLLOW_GAPS[Math.max(0, Math.min(FOLLOW_GAPS.length - 1, friendIndex))]
  const goal = Math.max(trail.segmentStartDistance, trail.totalDistance - gap)
  if (goal <= state.routeCursor + 0.02) { state.waiting = true; state.waitingReason = trail.waitingReason || 'keeping a friendly gap'; state.motion = 'idle'; return }
  const lag = goal - state.routeCursor, speed = lag > 8 ? CATCHUP_SPEED : FOLLOW_SPEED
  const arcStep = Math.min(goal - state.routeCursor, speed * dt), nextCursor = state.routeCursor + arcStep
  if (!trailPointAt(trail, nextCursor, state.routeGeneration, state) || !everlyFollowerSegmentSafe(state.x, state.z, state.routeX, state.routeZ, doorsOpen)) {
    state.waiting = true; state.waitingReason = doorsOpen ? 'unsafe route' : 'closed door'; state.motion = 'idle'; return
  }
  const dx = state.routeX - state.x, dz = state.routeZ - state.z, distance = Math.hypot(dx, dz), step = Math.min(distance, speed * dt)
  if (distance > 1e-5 && step > 0) { state.x += dx / distance * step; state.z += dz / distance * step }
  const ratio = distance > 1e-5 ? step / distance : 1
  state.routeCursor += arcStep * ratio
  const actualSpeed = dt > 1e-5 ? step / dt : 0
  const desired = Math.atan2(dx, dz), angle = Math.atan2(Math.sin(desired - state.heading), Math.cos(desired - state.heading))
  state.heading += angle * (1 - Math.exp(-dt * 5))
  state.following = step > 0.001
  state.motion = actualSpeed > 6.8 ? 'run' : actualSpeed > 0.15 ? 'walk' : 'idle'
}

export function createEverlyFriendState(home: FriendHome): EverlyFriendState {
  return {
    homeX: home.x, homeY: home.y, homeZ: home.z, homeYaw: home.yaw ?? 0, phase: home.phase, localTime: 0,
    x: home.x, y: home.y, z: home.z, engaged: false, greetingCount: 0, cooldownUntil: 0, hopUntil: 0, nextHopAt: 0,
    heading: home.yaw ?? 0, motion: 'idle', hopping: false, recruited: false, following: false, waiting: false, waitingReason: '',
    routeCursor: 0, routeGeneration: 0, routeSeeded: false, onTrail: false, routeX: home.x, routeZ: home.z,
  }
}

export function resetEverlyFriendState(state: EverlyFriendState): void {
  state.x = state.homeX; state.y = state.homeY; state.z = state.homeZ
  state.engaged = false; state.greetingCount = 0; state.cooldownUntil = 0; state.hopUntil = 0; state.nextHopAt = 0; state.localTime = 0
  state.heading = state.homeYaw; state.hopping = false; state.motion = 'idle'; state.recruited = false
  state.following = false; state.waiting = false; state.waitingReason = ''; state.routeCursor = 0; state.routeGeneration = 0
  state.routeSeeded = false; state.onTrail = false; state.routeX = state.homeX; state.routeZ = state.homeZ
}

/** Mutates one friend state in place so the render loop creates no per-frame objects. */
export function updateEverlyFriend(state: EverlyFriendState, player: { x: number; y: number; z: number } | null, deltaSeconds: number, trail: EverlyFollowTrail | null = null, doorsOpen = false, friendIndex = 0): EverlyFriendState {
  const valid = !!player && [player.x, player.y, player.z].every(Number.isFinite)
  const safePlayer = valid ? player : null
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0
  state.localTime += dt
  const now = state.localTime
  const dx = safePlayer ? safePlayer.x - state.homeX : 0, dz = safePlayer ? safePlayer.z - state.homeZ : 0
  const distance = Math.hypot(dx, dz)
  const heightOk = !!safePlayer && safePlayer.y >= -0.15 && safePlayer.y <= 4.5 && Math.abs(safePlayer.y - state.homeY) <= EVERLY_FRIEND_VERTICAL_RANGE
  if (state.engaged) { if (!heightOk || distance > EVERLY_FRIEND_LEAVE_RADIUS) state.engaged = false }
  else if (heightOk && distance <= EVERLY_FRIEND_ENTER_RADIUS) {
    state.engaged = true
    if (now >= state.cooldownUntil) {
      state.greetingCount++; state.recruited = true; state.cooldownUntil = now + EVERLY_FRIEND_COOLDOWN
      state.hopUntil = now + EVERLY_FRIEND_HOP_DURATION; state.nextHopAt = now + 1.65
    } else state.nextHopAt = state.cooldownUntil
  }
  if (state.engaged && now >= state.nextHopAt) { state.hopUntil = now + EVERLY_FRIEND_HOP_DURATION; state.nextHopAt = now + 2.35 }

  if (state.recruited && trail) {
    updateFollowing(state, trail, dt, doorsOpen, friendIndex)
    if (now >= state.nextHopAt) { state.hopUntil = now + EVERLY_FRIEND_HOP_DURATION; state.nextHopAt = now + 4.8 + (state.phase % 1.2) }
    const hop = (state.hopUntil - now) / EVERLY_FRIEND_HOP_DURATION
    state.hopping = hop > 0 && hop <= 1; state.y = state.homeY + (state.hopping ? Math.sin((1 - hop) * Math.PI) * 0.72 : 0)
    return state
  }
  const elapsed = now + state.phase
  let targetX = state.engaged ? state.homeX + Math.cos(elapsed * 1.22) * FROLIC_RADIUS : state.homeX
  let targetZ = state.engaged ? state.homeZ + Math.sin(elapsed * 1.57) * FROLIC_RADIUS : state.homeZ
  if (state.engaged && safePlayer) {
    let awayX = targetX - safePlayer.x, awayZ = targetZ - safePlayer.z, awayLength = Math.hypot(awayX, awayZ)
    if (awayLength < 2.25) {
      if (awayLength < 0.001) { awayX = -Math.sin(state.heading); awayZ = -Math.cos(state.heading); awayLength = 1 }
      targetX += awayX / awayLength * (2.25 - awayLength)
      targetZ += awayZ / awayLength * (2.25 - awayLength)
      const hx = targetX - state.homeX, hz = targetZ - state.homeZ, homeDistance = Math.hypot(hx, hz)
      if (homeDistance > FROLIC_RADIUS) { targetX = state.homeX + hx / homeDistance * FROLIC_RADIUS; targetZ = state.homeZ + hz / homeDistance * FROLIC_RADIUS }
    }
  }
  const blend = 1 - Math.exp(-dt * (state.engaged ? 3.1 : 4.4))
  state.x += (targetX - state.x) * blend; state.z += (targetZ - state.z) * blend
  if (state.engaged && safePlayer) {
    let awayX = state.x - safePlayer.x, awayZ = state.z - safePlayer.z, awayLength = Math.hypot(awayX, awayZ)
    if (awayLength < 1.85) {
      if (awayLength < 0.001) { awayX = -Math.sin(state.heading); awayZ = -Math.cos(state.heading); awayLength = 1 }
      state.x += awayX / awayLength * (1.85 - awayLength); state.z += awayZ / awayLength * (1.85 - awayLength)
      const hx = state.x - state.homeX, hz = state.z - state.homeZ, homeDistance = Math.hypot(hx, hz)
      if (homeDistance > FROLIC_RADIUS) { state.x = state.homeX + hx / homeDistance * FROLIC_RADIUS; state.z = state.homeZ + hz / homeDistance * FROLIC_RADIUS }
    }
  }
  const hop = (state.hopUntil - now) / EVERLY_FRIEND_HOP_DURATION
  state.hopping = hop > 0 && hop <= 1; state.y = state.homeY + (state.hopping ? Math.sin((1 - hop) * Math.PI) * 0.82 : 0)
  const faceX = safePlayer ? safePlayer.x - state.x : 0, faceZ = safePlayer ? safePlayer.z - state.z : 0
  const desired = state.engaged && safePlayer && heightOk && Math.hypot(faceX, faceZ) > 0.001 ? Math.atan2(faceX, faceZ) : state.homeYaw
  const turn = Math.atan2(Math.sin(desired - state.heading), Math.cos(desired - state.heading))
  state.heading += turn * (1 - Math.exp(-dt * 5))
  if (!state.engaged && !state.hopping) { const homeTurn = Math.atan2(Math.sin(state.homeYaw - state.heading), Math.cos(state.homeYaw - state.heading)); state.heading += homeTurn * (1 - Math.exp(-dt * 3)) }
  const speed = dt > 1e-5 ? Math.hypot(targetX - state.x, targetZ - state.z) / dt : 0
  state.motion = state.engaged ? 'run' : speed > 0.15 ? 'walk' : 'idle'
  return state
}
