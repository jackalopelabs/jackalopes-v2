import { useEffect, useState } from 'react'
import { SWIMMING_EVENT, type SwimmingStatus } from '../game/terrain/use-swimming'

export function SwimmingHUD() {
  const [status, setStatus] = useState<SwimmingStatus>({ swimming: false, underwater: false, gamepad: false })
  useEffect(() => {
    const update = (event: Event) => setStatus((event as CustomEvent<SwimmingStatus>).detail)
    window.addEventListener(SWIMMING_EVENT, update)
    return () => window.removeEventListener(SWIMMING_EVENT, update)
  }, [])
  if (!status.swimming) return null
  return <>
    {status.underwater && <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 900, background: 'rgba(8, 105, 145, 0.14)', boxShadow: 'inset 0 0 110px rgba(5, 70, 105, 0.35)' }} />}
    <div role="status" data-testid="swimming-hud" style={{ position: 'fixed', ...(navigator.maxTouchPoints > 0 ? { top: 85 } : { bottom: 90 }), left: '50%', transform: 'translateX(-50%)', zIndex: 2000, pointerEvents: 'none', padding: '10px 18px', borderRadius: 14, background: 'rgba(5, 38, 57, 0.88)', border: '1px solid rgba(103,232,249,0.35)', color: '#cffafe', fontFamily: 'system-ui, sans-serif', textAlign: 'center', maxWidth: '90vw' }}>
      <strong style={{ fontSize: 12, letterSpacing: '0.12em' }}>{status.underwater ? 'UNDERWATER' : 'SWIMMING'}</strong>
      <div style={{ fontSize: 12, marginTop: 4 }}>{navigator.maxTouchPoints > 0 ? 'Move: swim · Jump / Up: rise · Dive: down' : status.gamepad ? 'Left stick: swim · A / Cross: up · LT / L2: dive' : 'WASD: swim · Space: up · C: dive'}</div>
      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>Let go to float toward the surface</div>
    </div>
  </>
}
