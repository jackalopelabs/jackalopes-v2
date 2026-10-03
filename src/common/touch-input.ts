/** Local touch input, sampled through the same gamepad path as physical controllers.
 * No synthetic keyboard events, timers, or per-move React renders.
 */
export type TouchAction = 'jump' | 'swimDown' | 'sprint' | 'interact' | 'shoot' | 'ability' | 'droneToggle'
const buttonIndices: Record<TouchAction, number> = {
  jump: 0, ability: 1, interact: 2, droneToggle: 3, sprint: 4, swimDown: 6, shoot: 7,
}
let enabled = false
const lookDelta = { x: 0, y: 0 }
export function addTouchLookDelta(x: number, y: number) {
  if (enabled) { lookDelta.x += x; lookDelta.y += y }
}
export function consumeTouchLookDelta() {
  const delta = { ...lookDelta }; lookDelta.x = lookDelta.y = 0; return delta
}
const axes = [0, 0, 0, 0]
const buttons = Array<boolean>(17).fill(false)
const virtualPad = {
  id: 'Jackalopes touch controls', index: -1, connected: true, mapping: 'standard',
  timestamp: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  vibrationActuator: null,
} as unknown as Gamepad

export function resetTouchInput() {
  lookDelta.x = lookDelta.y = 0
  axes.fill(0)
  buttons.fill(false)
}
export function setTouchEnabled(value: boolean) {
  enabled = value
  resetTouchInput()
}
export function setTouchStick(stick: 'move' | 'look', x: number, y: number) {
  if (!enabled) return
  x = Number.isFinite(x) ? x : 0
  y = Number.isFinite(y) ? y : 0
  const length = Math.hypot(x, y)
  const scale = length > 1 ? 1 / length : 1
  const offset = stick === 'move' ? 0 : 2
  axes[offset] = x * scale
  axes[offset + 1] = y * scale
}
export function setTouchButton(action: TouchAction, pressed: boolean) {
  if (enabled) buttons[buttonIndices[action]] = pressed
}

/** Active touch axes override only their own stick. Idle touch never masks an Ally pad. */
export function mergeTouchGamepad(physical: Gamepad | null): Gamepad | null {
  if (!enabled) return physical
  const resultAxes = virtualPad.axes as number[]
  for (const offset of [0, 2]) {
    const touchActive = Math.hypot(axes[offset], axes[offset + 1]) > 0.15
    resultAxes[offset] = touchActive ? axes[offset] : (physical?.axes[offset] ?? 0)
    resultAxes[offset + 1] = touchActive ? axes[offset + 1] : (physical?.axes[offset + 1] ?? 0)
  }
  virtualPad.buttons.forEach((button, index) => {
    const physicalButton = physical?.buttons[index]
    const mutable = button as { pressed: boolean; touched: boolean; value: number }
    mutable.pressed = buttons[index] || !!physicalButton?.pressed
    mutable.touched = buttons[index] || !!physicalButton?.touched
    mutable.value = buttons[index] ? 1 : (physicalButton?.value ?? 0)
  })
  return virtualPad
}
