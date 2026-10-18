export const ADVENTURE_FIRE_INTERVAL = 180

/** Both installed Rapier versions return metres for normalized rays, under different names. */
export function adventureSolidDistance(hit: { toi?: number; timeOfImpact?: number } | null, limit: number) {
  const distance = hit?.timeOfImpact ?? hit?.toi
  return typeof distance === 'number' && Number.isFinite(distance) ? Math.max(0, Math.min(limit, distance)) : limit
}

export function canStartAdventureMouseFire(button: number, pointerType: string, onCanvas: boolean, gameLocked: boolean, onUI: boolean) {
  return button === 0 && pointerType !== 'touch' && !onUI && (onCanvas || gameLocked)
}

/** Keep a quick click until the next render, while sharing one cadence with RT/touch. */
export function createAdventureFireInput() {
  let held = false, pending = false, nextAt = -Infinity
  return {
    press() { held = true; pending = true },
    release() { held = false },
    reset() { held = pending = false },
    active(trigger: boolean) { return held || pending || trigger },
    consume(now: number, enabled: boolean, trigger: boolean) {
      if (!enabled) { held = pending = false; return false }
      if (!(held || pending || trigger) || now < nextAt) return false
      pending = false; nextAt = now + ADVENTURE_FIRE_INTERVAL
      return true
    },
  }
}

/** Pointer lock retargets mouse events to body, so canvas-only listeners miss Mac clicks. */
export function bindAdventureMouseFire(canvas: HTMLCanvasElement, input: ReturnType<typeof createAdventureFireInput>) {
  const capture = { capture: true }
  const down = (event: PointerEvent) => {
    const target = event.target as Element | null, lock = document.pointerLockElement
    const ui = !!target?.closest?.('button, a, input, select, textarea, [contenteditable="true"], [role="button"], [role="dialog"], [data-touch-controls]')
    const gameLocked = !!lock && (lock === canvas || lock.contains(canvas))
    if (canStartAdventureMouseFire(event.button, event.pointerType, target === canvas, gameLocked, ui)) input.press()
  }
  const up = () => input.release(), reset = () => input.reset()
  const lockChanged = () => { if (!document.pointerLockElement) reset() }
  window.addEventListener('pointerdown', down, capture)
  window.addEventListener('pointerup', up, capture)
  window.addEventListener('pointercancel', reset, capture)
  window.addEventListener('blur', reset)
  document.addEventListener('visibilitychange', reset)
  document.addEventListener('pointerlockchange', lockChanged)
  return () => {
    window.removeEventListener('pointerdown', down, capture)
    window.removeEventListener('pointerup', up, capture)
    window.removeEventListener('pointercancel', reset, capture)
    window.removeEventListener('blur', reset)
    document.removeEventListener('visibilitychange', reset)
    document.removeEventListener('pointerlockchange', lockChanged)
    reset()
  }
}
