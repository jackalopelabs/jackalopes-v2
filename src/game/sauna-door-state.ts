export type SaunaDoorState = { closed: boolean; changedAt: number; actor: string }
export const INITIAL_SAUNA_DOOR: SaunaDoorState = { closed: false, changedAt: 0, actor: '' }

/** Monotonic versions make echoes and late-join snapshots safe to replay. */
export function applySaunaDoorState(current: SaunaDoorState, candidate: unknown): SaunaDoorState {
  if (!candidate || typeof candidate !== 'object') return current
  const state = candidate as SaunaDoorState
  if (typeof state.closed !== 'boolean' || !Number.isSafeInteger(state.changedAt) || state.changedAt < 0 ||
    typeof state.actor !== 'string' || state.actor.length > 120) return current
  if (state.changedAt < current.changedAt || (state.changedAt === current.changedAt && state.actor <= current.actor)) return current
  return { closed: state.closed, changedAt: state.changedAt, actor: state.actor }
}

export function stepSaunaFog(current: number, sealed: boolean, delta: number): number {
  const dt = Math.max(0, Math.min(.1, Number.isFinite(delta) ? delta : 0))
  return current + ((sealed ? 1 : 0) - current) * (1 - Math.exp(-dt / (sealed ? 1.3 : .45)))
}
