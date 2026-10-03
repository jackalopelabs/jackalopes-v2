import { useEffect, useState } from 'react'

export function HolographicSenseHUD({ until }: { until: number }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((until - Date.now()) / 1000)))
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [until])
  if (seconds <= 0) return null
  return <div role="status" data-testid="holographic-sense" style={{ position: 'fixed', top: 82, left: '50%', transform: 'translateX(-50%)', zIndex: 2100, pointerEvents: 'none', padding: '10px 19px', borderRadius: 14, border: '1px solid rgba(123,230,255,.42)', background: 'linear-gradient(110deg,rgba(11,39,57,.94),rgba(41,19,63,.88))', color: '#ccf7ff', textAlign: 'center', fontFamily: 'system-ui', boxShadow: '0 0 28px rgba(75,180,224,.12)' }}>
    <strong style={{ fontSize: 11, letterSpacing: '.16em' }}>HOLOGRAPHIC SENSE</strong>
    <span style={{ marginLeft: 12, color: '#ffdb91', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{seconds}s</span>
    <div style={{ marginTop: 3, fontSize: 10, color: '#bcaee7' }}>Follow the echoes. There’s more than meets the eye.</div>
  </div>
}
