/** Independent room register. Logical versions avoid client clock skew; actor breaks ties. */
export type CavePartyState = { on: boolean; revision: number; actor: string }
export const INITIAL_CAVE_PARTY: CavePartyState = { on: false, revision: 0, actor: '' }
export const PARTY_EVENTS = { set: 'cave_party_set', request: 'cave_party_request', snapshot: 'cave_party_snapshot' } as const

export function applyCavePartyState(current: CavePartyState, candidate: unknown): CavePartyState {
  if (!candidate || typeof candidate !== 'object') return current
  const next = candidate as CavePartyState
  if (typeof next.on !== 'boolean' || !Number.isSafeInteger(next.revision) || next.revision < 1 ||
    typeof next.actor !== 'string' || !next.actor || next.actor.length > 120) return current
  if (next.revision < current.revision || (next.revision === current.revision && next.actor <= current.actor)) return current
  return { on: next.on, revision: next.revision, actor: next.actor }
}

type PartyEvent = { event_type: string; state?: unknown; target?: string; player?: string }
/** The same peer request/snapshot relay as the sauna, with its own event namespace. */
export function createCavePartyPeer(actor: string, send: (event: PartyEvent) => void,
  playerId: () => string | null | undefined, changed: (state: CavePartyState) => void) {
  let state = { ...INITIAL_CAVE_PARTY }
  const accept = (candidate: unknown) => {
    const next = applyCavePartyState(state, candidate)
    if (next !== state) { state = next; changed(next) }
  }
  return {
    get state() { return state },
    set(on: boolean) {
      if (state.on === on || state.revision >= Number.MAX_SAFE_INTEGER) return
      accept({ on, revision: state.revision + 1, actor })
      send({ event_type: PARTY_EVENTS.set, state })
    },
    request() { send({ event_type: PARTY_EVENTS.request }) },
    receive(candidate: unknown) {
      if (!candidate || typeof candidate !== 'object') return
      const event = candidate as PartyEvent
      if (event.event_type === PARTY_EVENTS.set) accept(event.state)
      if (event.event_type === PARTY_EVENTS.snapshot && event.target === playerId() && !!event.target) accept(event.state)
      if (event.event_type === PARTY_EVENTS.request && typeof event.player === 'string' &&
        event.player && event.player.length <= 120 && event.player !== playerId()) {
        send({ event_type: PARTY_EVENTS.snapshot, target: event.player, state })
      }
    },
  }
}

/** Consume the edge even when away/hidden: walking into range while held cannot toggle. */
export function createPartySwitchLatch() {
  let held = false
  return (down: boolean, near: boolean, visible: boolean) => {
    const edge = down && !held
    held = down
    return edge && near && visible
  }
}

export function stepPartyBlend(current: number, on: boolean, delta: number): number {
  const dt = Math.max(0, Math.min(.1, Number.isFinite(delta) ? delta : 0))
  const next = current + ((on ? 1 : 0) - current) * (1 - Math.exp(-dt / .55))
  return Math.abs(next - (on ? 1 : 0)) < .001 ? (on ? 1 : 0) : next
}
