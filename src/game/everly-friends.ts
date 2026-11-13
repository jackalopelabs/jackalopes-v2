export type FriendHome = { x: number; y: number; z: number; phase: number; yaw?: number }

export type FriendSample = {
  x: number; y: number; z: number
  engaged: boolean
  greetingCount: number
  hopping: boolean
  motion: 'idle' | 'walk' | 'run'
}

export type EverlyFriendState = FriendSample & {
  homeX: number; homeY: number; homeZ: number; homeYaw: number; phase: number
  localTime: number
  engaged: boolean
  greetingCount: number
  cooldownUntil: number
  hopUntil: number
  nextHopAt: number
  heading: number
  motion: 'idle' | 'walk' | 'run'
  hopping: boolean
}

export const EVERLY_FRIEND_ENTER_RADIUS = 14
export const EVERLY_FRIEND_LEAVE_RADIUS = 19
export const EVERLY_FRIEND_VERTICAL_RANGE = 4.5
export const EVERLY_FRIEND_COOLDOWN = 3.5
export const EVERLY_FRIEND_HOP_DURATION = 0.72
const FROLIC_RADIUS = 2.35

export function createEverlyFriendState(home: FriendHome): EverlyFriendState {
  return {
    homeX: home.x, homeY: home.y, homeZ: home.z, homeYaw: home.yaw ?? 0, phase: home.phase, localTime: 0,
    x: home.x, y: home.y, z: home.z, engaged: false,
    greetingCount: 0, cooldownUntil: 0, hopUntil: 0, nextHopAt: 0,
    heading: home.yaw ?? 0, motion: 'idle', hopping: false,
  }
}

export function resetEverlyFriendState(state: EverlyFriendState): void {
  state.x = state.homeX; state.y = state.homeY; state.z = state.homeZ
  state.engaged = false; state.greetingCount = 0; state.cooldownUntil = 0
  state.hopUntil = 0; state.nextHopAt = 0; state.localTime = 0
  state.heading = state.homeYaw; state.hopping = false; state.motion = 'idle'
}

/** Mutates one friend state in place so the render loop creates no per-frame objects. */
export function updateEverlyFriend(
  state: EverlyFriendState,
  player: { x: number; y: number; z: number } | null,
  deltaSeconds: number,
): EverlyFriendState {
  const safePlayer = player && Number.isFinite(player.x) && Number.isFinite(player.y) && Number.isFinite(player.z) ? player : null
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0
  state.localTime += dt
  const now = state.localTime
  const dx = safePlayer ? safePlayer.x - state.homeX : 0
  const dz = safePlayer ? safePlayer.z - state.homeZ : 0
  const distance = Math.hypot(dx, dz)
  const heightOk = !!safePlayer && safePlayer.y >= -0.15 && Math.abs(safePlayer.y - state.homeY) <= EVERLY_FRIEND_VERTICAL_RANGE

  if (state.engaged) {
    if (!heightOk || distance > EVERLY_FRIEND_LEAVE_RADIUS) state.engaged = false
  } else if (heightOk && distance <= EVERLY_FRIEND_ENTER_RADIUS) {
    state.engaged = true
    if (now >= state.cooldownUntil) {
      state.greetingCount++
      state.cooldownUntil = now + EVERLY_FRIEND_COOLDOWN
      state.hopUntil = now + EVERLY_FRIEND_HOP_DURATION
      state.nextHopAt = now + 1.65
    } else state.nextHopAt = state.cooldownUntil
  }

  if (state.engaged && now >= state.nextHopAt) {
    state.hopUntil = now + EVERLY_FRIEND_HOP_DURATION
    state.nextHopAt = now + 2.35
  }

  const elapsed = now + state.phase
  let targetX = state.engaged ? state.homeX + Math.cos(elapsed * 1.22) * FROLIC_RADIUS : state.homeX
  let targetZ = state.engaged ? state.homeZ + Math.sin(elapsed * 1.57) * FROLIC_RADIUS : state.homeZ
  if (state.engaged && safePlayer) {
    let awayX = targetX - safePlayer.x, awayZ = targetZ - safePlayer.z
    let awayLength = Math.hypot(awayX, awayZ)
    if (awayLength < 2.25) {
      if (awayLength < 0.001) { awayX = -Math.sin(state.heading); awayZ = -Math.cos(state.heading); awayLength = 1 }
      targetX += awayX / awayLength * (2.25 - awayLength)
      targetZ += awayZ / awayLength * (2.25 - awayLength)
      const homeDx = targetX - state.homeX, homeDz = targetZ - state.homeZ, homeDistance = Math.hypot(homeDx, homeDz)
      if (homeDistance > FROLIC_RADIUS) { targetX = state.homeX + homeDx / homeDistance * FROLIC_RADIUS; targetZ = state.homeZ + homeDz / homeDistance * FROLIC_RADIUS }
    }
  }
  const blend = 1 - Math.exp(-dt * (state.engaged ? 3.1 : 4.4))
  state.x += (targetX - state.x) * blend
  state.z += (targetZ - state.z) * blend
  if (state.engaged && safePlayer) {
    let awayX = state.x - safePlayer.x, awayZ = state.z - safePlayer.z
    let awayLength = Math.hypot(awayX, awayZ)
    if (awayLength < 1.85) {
      if (awayLength < 0.001) { awayX = -Math.sin(state.heading); awayZ = -Math.cos(state.heading); awayLength = 1 }
      state.x += awayX / awayLength * (1.85 - awayLength)
      state.z += awayZ / awayLength * (1.85 - awayLength)
      const homeDx = state.x - state.homeX, homeDz = state.z - state.homeZ, homeDistance = Math.hypot(homeDx, homeDz)
      if (homeDistance > FROLIC_RADIUS) { state.x = state.homeX + homeDx / homeDistance * FROLIC_RADIUS; state.z = state.homeZ + homeDz / homeDistance * FROLIC_RADIUS }
    }
  }
  const hopProgress = (state.hopUntil - now) / EVERLY_FRIEND_HOP_DURATION
  state.hopping = hopProgress > 0 && hopProgress <= 1
  state.y = state.homeY + (state.hopping ? Math.sin((1 - hopProgress) * Math.PI) * 0.82 : 0)
  const faceX = safePlayer ? safePlayer.x - state.x : 0, faceZ = safePlayer ? safePlayer.z - state.z : 0
  const desiredHeading = state.engaged && safePlayer && heightOk && Math.hypot(faceX, faceZ) > 0.001 ? Math.atan2(faceX, faceZ) : state.homeYaw
  const turn = Math.atan2(Math.sin(desiredHeading - state.heading), Math.cos(desiredHeading - state.heading))
  state.heading += turn * (1 - Math.exp(-dt * 5))
  if (!state.engaged && !state.hopping) {
    const homeTurn = Math.atan2(Math.sin(state.homeYaw - state.heading), Math.cos(state.homeYaw - state.heading))
    state.heading += homeTurn * (1 - Math.exp(-dt * 3))
  }
  state.motion = state.engaged ? 'run' : (Math.abs(state.x - state.homeX) + Math.abs(state.z - state.homeZ) > 0.08 ? 'walk' : 'idle')
  return state
}
