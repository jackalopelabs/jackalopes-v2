import { Canvas as ThreeCanvas, CanvasProps } from '@react-three/fiber'
import { Component, ReactNode, useState } from 'react'

export const compatibilityMode = new URLSearchParams(window.location.search).get('compat') === '1'

function Recovery({ reason = 'WebGL is unavailable on this browser.' }: { reason?: string }) {
  const url = new URL(window.location.href)
  url.searchParams.set('compat', '1')
  return <div role="alert" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: '#10242c', color: 'white', display: 'grid', placeContent: 'center', padding: 24, textAlign: 'center' }}>
    <h2>The game couldn’t start its graphics</h2>
    <p>Please send us the diagnostic below so we can identify the failure.</p>
    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 600, fontSize: 14 }}>JACKALOPE-02: {reason.slice(0, 600)}</pre>
    <a href={url.href} style={{ color: '#aee8dd', padding: 16 }}>Restart in lightweight mode</a>
  </div>
}

export class GameErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; reason: string }> {
  state = { failed: false, reason: '' }
  static getDerivedStateFromError(error: unknown) { return { failed: true, reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error) } }
  componentDidCatch(error: Error) { console.error('[Game startup]', error) }
  render() { return this.state.failed ? <Recovery reason={this.state.reason} /> : this.props.children }
}

export function Canvas({ children, onCreated, ...props }: CanvasProps) {
  const [lost, setLost] = useState(false)
  return <>
    <ThreeCanvas camera={{ position: [0, 0, 5], fov: 90 }} {...props}
      fallback={<Recovery />}
      onCreated={(state) => {
        state.gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault()
          setLost(true)
        }, { once: true })
        onCreated?.(state)
      }}>
      {children}
    </ThreeCanvas>
    {lost && <Recovery reason="WebGL context lost. The browser reset the graphics device, possibly due to memory pressure." />}
  </>
}
