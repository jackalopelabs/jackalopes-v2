import { useEffect, useRef, useState, type PointerEvent, type SyntheticEvent } from 'react'
import nipplejs from 'nipplejs'
import { addTouchLookDelta, resetTouchInput, setTouchButton, setTouchEnabled, setTouchStick } from '../common/touch-input'
import { SWIMMING_EVENT } from '../game/terrain/use-swimming'
import './VirtualGamepad.css'

interface VirtualGamepadProps {
  adventureWeapon?: boolean
  visible: boolean
  playerType?: 'jackalope' | 'merc'
}

type Action = Parameters<typeof setTouchButton>[0]
const stop = (event: SyntheticEvent) => { event.preventDefault(); event.stopPropagation() }

/** Shared input, not synthetic keys: both thumbs and held actions work together. */
export function VirtualGamepad({ visible, playerType = 'jackalope', adventureWeapon = false }: VirtualGamepadProps) {
  useEffect(() => { if (!adventureWeapon && playerType !== 'merc') setTouchButton('shoot', false) }, [adventureWeapon, playerType])
  const moveZone = useRef<HTMLDivElement>(null)
  const [swimming, setSwimming] = useState(false)
  const [more, setMore] = useState(false)
  const heldPointers = useRef(new Map<number, { action: Action; element: HTMLButtonElement }>())
  const [pressed, setPressed] = useState<Set<Action>>(() => new Set())

  useEffect(() => {
    let lookPointer: { id: number; x: number; y: number } | null = null
    const releaseAll = () => {
      lookPointer = null
      moveZone.current?.style.setProperty('--dx', '0px')
      moveZone.current?.style.setProperty('--dy', '0px')
      for (const [pointer, { element }] of heldPointers.current) {
        if (element.hasPointerCapture?.(pointer)) element.releasePointerCapture(pointer)
      }
      heldPointers.current.clear()
      setPressed(new Set())
      resetTouchInput()
    }
    if (!visible || !moveZone.current) {
      releaseAll()
      setTouchEnabled(false)
      return
    }

    let managers: ReturnType<typeof nipplejs.create>[] = []
    let layoutFrame = 0
    let viewportWidth = window.innerWidth
    let viewportHeight = window.innerHeight
    const createSticks = () => {
      managers.forEach(manager => manager.destroy())
      managers = []
      for (const [stick, zone] of [['move', moveZone.current]] as const) {
        if (!zone) continue
        const manager = nipplejs.create({
          zone, mode: 'static', position: { left: '50%', top: '50%' },
          dataOnly: true, size: 88, color: '#b7e0d7',
          restOpacity: 0.65, threshold: 0.08,
        })
        manager.on('move', event => {
          const data = event.data
          if (!data.vector || document.hidden) return
          // Nipple's up-positive Y is the opposite of a physical gamepad axis.
          setTouchStick(stick, data.vector.x, -data.vector.y)
          setTouchButton('sprint', Math.hypot(data.vector.x, data.vector.y) > 0.92)
          zone.style.setProperty('--dx', `${data.vector.x * 28}px`)
          zone.style.setProperty('--dy', `${-data.vector.y * 28}px`)
        })
        manager.on('end', () => { setTouchStick(stick, 0, 0); setTouchButton('sprint', false); zone.style.setProperty('--dx', '0px'); zone.style.setProperty('--dy', '0px') })
        managers.push(manager)
      }
    }
    const suspend = () => { releaseAll(); setTouchEnabled(false) }
    const resume = () => { if (!document.hidden) setTouchEnabled(true) }
    const visibilityChanged = () => { if (document.hidden) suspend(); else resume() }
    const orientationChanged = () => {
      releaseAll()
      cancelAnimationFrame(layoutFrame)
      layoutFrame = requestAnimationFrame(createSticks)
    }
    const viewportChanged = () => {
      if (window.innerWidth === viewportWidth && window.innerHeight === viewportHeight) return
      viewportWidth = window.innerWidth
      viewportHeight = window.innerHeight
      orientationChanged()
    }
    const canvas = document.querySelector('canvas')
    const oldTouchAction = canvas?.style.touchAction ?? ''
    if (canvas) canvas.style.touchAction = 'none'
    const lookStart = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'touch' || event.target !== canvas || event.clientX < window.innerWidth * 0.4 || lookPointer) return
      lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
      canvas?.setPointerCapture(event.pointerId)
      event.preventDefault()
    }
    const lookMove = (event: globalThis.PointerEvent) => {
      if (lookPointer?.id !== event.pointerId) return
      addTouchLookDelta(event.clientX - lookPointer.x, event.clientY - lookPointer.y)
      lookPointer.x = event.clientX; lookPointer.y = event.clientY
      event.preventDefault()
    }
    const lookEnd = (event: globalThis.PointerEvent) => { if (lookPointer?.id === event.pointerId) lookPointer = null }
    const swimChanged = (event: Event) => {
      const active = !!(event as CustomEvent).detail.swimming
      setSwimming(active)
      if (!active) setTouchButton('swimDown', false)
    }
    window.addEventListener('pointerdown', lookStart, { passive: false })
    window.addEventListener('pointermove', lookMove, { passive: false })
    window.addEventListener('pointerup', lookEnd)
    window.addEventListener('pointercancel', lookEnd)
    window.addEventListener('lostpointercapture', lookEnd)
    window.addEventListener(SWIMMING_EVENT, swimChanged)
    setTouchEnabled(!document.hidden)
    createSticks()
    window.addEventListener('blur', suspend)
    window.addEventListener('focus', resume)
    window.addEventListener('pagehide', suspend)
    window.addEventListener('pageshow', resume)
    window.addEventListener('orientationchange', orientationChanged)
    window.addEventListener('resize', viewportChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      if (canvas) canvas.style.touchAction = oldTouchAction
      window.removeEventListener('pointerdown', lookStart)
      window.removeEventListener('pointermove', lookMove)
      window.removeEventListener('pointerup', lookEnd)
      window.removeEventListener('pointercancel', lookEnd)
      window.removeEventListener('lostpointercapture', lookEnd)
      window.removeEventListener(SWIMMING_EVENT, swimChanged)
      setMore(false)
      cancelAnimationFrame(layoutFrame)
      managers.forEach(manager => manager.destroy())
      window.removeEventListener('blur', suspend)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pagehide', suspend)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('orientationchange', orientationChanged)
      window.removeEventListener('resize', viewportChanged)
      document.removeEventListener('visibilitychange', visibilityChanged)
      releaseAll()
      setTouchEnabled(false)
    }
  }, [visible])

  const releasePointer = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const held = heldPointers.current.get(event.pointerId)
    if (!held) return
    heldPointers.current.delete(event.pointerId)
    if (![...heldPointers.current.values()].some(value => value.action === held.action)) {
      setTouchButton(held.action, false)
      setPressed(previous => { const next = new Set(previous); next.delete(held.action); return next })
    }
    if (held.element.hasPointerCapture?.(event.pointerId)) held.element.releasePointerCapture(event.pointerId)
  }
  const holdButton = (event: PointerEvent<HTMLButtonElement>, action: Action) => {
    stop(event)
    if (event.pointerType === 'mouse' && event.button !== 0) return
    heldPointers.current.set(event.pointerId, { action, element: event.currentTarget })
    event.currentTarget.setPointerCapture(event.pointerId)
    setTouchButton(action, true)
    setPressed(previous => new Set(previous).add(action))
  }

  if (!visible) return null
  const actions: { action: Action; text: string; label: string }[] = [
    { action: 'jump', text: 'Jump ↑', label: 'Jump or swim up' },
    ...(swimming ? [{ action: 'swimDown' as const, text: 'Dive', label: 'Swim down' }] : []),
    { action: 'interact', text: 'Use', label: 'Use or eat nearby item' },
    ...(adventureWeapon ? [{ action: 'shoot' as const, text: 'Fire', label: 'Fire flame blaster' }] : []),
    ...(playerType === 'merc' ? [
      { action: 'shoot' as const, text: 'Shoot', label: 'Shoot' },
      ...(more ? [{ action: 'droneToggle' as const, text: 'Drone', label: 'Toggle drone' }] : []),
    ] : more ? [{ action: 'ability' as const, text: 'Power', label: 'Use special ability' }] : []),
  ]
  return <div className="virtual-gamepad" data-touch-controls data-testid="touch-controls" aria-label="Touch game controls"
    onClick={stop} onDoubleClick={stop} onContextMenu={stop}>
    <div className="touch-stick touch-stick-move">
      <div ref={moveZone} className="touch-stick-zone" data-testid="touch-move" aria-label="Move joystick; push fully to run"><span className="touch-stick-thumb" /></div>
    </div>
    <div className="touch-actions">
      <button type="button" className="touch-action touch-more" aria-label="More touch actions" aria-expanded={more}
        data-testid="touch-more" onClick={event => { stop(event); if (more) { setTouchButton('ability', false); setTouchButton('droneToggle', false) }; setMore(value => !value) }}>…</button>
      {actions.map(({ action, text, label }) => <button key={action} type="button"
        className={`touch-action${pressed.has(action) ? ' is-held' : ''}${action === 'jump' ? ' touch-action-primary' : ''}`}
        aria-label={label} aria-pressed={pressed.has(action)} data-testid={`touch-${action}`}
        onPointerDown={event => holdButton(event, action)} onPointerUp={releasePointer}
        onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}>
        {text}
      </button>)}
    </div>
    <span className="touch-look-hint" aria-hidden="true">Swipe to look</span>
  </div>
}
