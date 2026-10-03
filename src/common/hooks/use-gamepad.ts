import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeTouchGamepad } from '../touch-input'

// Optimized deadzone values for better control
const STICK_DEADZONE = 0.15
const TRIGGER_DEADZONE = 0.1

export const getActiveGamepad = (): Gamepad | null => {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return mergeTouchGamepad(null)

  const connectedGamepads = Array.from(navigator.getGamepads()).filter(
    (gamepad): gamepad is Gamepad => !!gamepad && gamepad.connected
  )

  // Windows handhelds can leave a ghost controller at index 0 after Armoury Crate
  // changes control mode. Prefer a standard-mapped pad, then any connected pad.
  return mergeTouchGamepad(connectedGamepads.find(gamepad => gamepad.mapping === 'standard')
    || connectedGamepads[0]
    || null)
}

// Stick response curve for more precise aiming
const applyCurve = (value: number): number => {
  const sign = Math.sign(value)
  const abs = Math.abs(value)
  return sign * Math.pow(abs, 1.5) // Exponential response curve for better precision
}

export type GamepadState = {
  leftStick: { x: number; y: number }
  rightStick: { x: number; y: number }
  buttons: {
    jump: boolean        // True only on the frame the button is first pressed (edge-triggered)
    swimDown: boolean    // LT/L2 held, used only while swimming
    jumpHeld: boolean    // True while the button is held down (level-triggered)
    sprint: boolean      // LB/L1 (button 4) - true while held
    leftStickPress: boolean
    shoot: boolean
    interact: boolean    // X button (button 2) - edge-triggered for mushroom eating
    ability: boolean     // B button (button 1) - edge-triggered for rainbow egg flashbang
    droneToggle: boolean // Y button (button 3) - edge-triggered for merc drone mode
    dpadUp: boolean
    dpadDown: boolean
    dpadLeft: boolean
    dpadRight: boolean
  }
  connected: boolean
}

export function useGamepad() {
  const [, forceRender] = useState(0)
  const gamepadStateRef = useRef<GamepadState>({
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    buttons: {
      jump: false,
      jumpHeld: false,
      swimDown: false,
      sprint: false,
      leftStickPress: false,
      shoot: false,
      interact: false,
      ability: false,
      droneToggle: false,
      dpadUp: false,
      dpadDown: false,
      dpadLeft: false,
      dpadRight: false
    },
    connected: false
  })

  const previousButtonStates = useRef({
    jump: false,
    sprint: false,
    leftStickPress: false,
    shoot: false,
    interact: false,
    ability: false,
    droneToggle: false
  })

  useFrame(() => {
    const gamepad = getActiveGamepad()
    if (!gamepad) {
      const state = gamepadStateRef.current
      state.connected = false
      state.leftStick.x = state.leftStick.y = state.rightStick.x = state.rightStick.y = 0
      for (const key of Object.keys(state.buttons) as Array<keyof GamepadState['buttons']>) state.buttons[key] = false
      for (const key of Object.keys(previousButtonStates.current) as Array<keyof typeof previousButtonStates.current>) previousButtonStates.current[key] = false
      return
    }

    // Process movement stick with deadzone
    const rawLeftX = gamepad.axes[0] ?? 0
    const rawLeftY = gamepad.axes[1] ?? 0
    const rawRightX = gamepad.axes[2] ?? 0
    const rawRightY = gamepad.axes[3] ?? 0
    const leftX = Math.abs(rawLeftX) > STICK_DEADZONE ? rawLeftX : 0
    const leftY = Math.abs(rawLeftY) > STICK_DEADZONE ? rawLeftY : 0

    // Process aim stick with response curve for better precision
    const rightX = Math.abs(rawRightX) > STICK_DEADZONE ? applyCurve(rawRightX) : 0
    const rightY = Math.abs(rawRightY) > STICK_DEADZONE ? applyCurve(rawRightY) : 0

    // Map gamepad buttons to actions
    const jumpButtonPressed = gamepad.buttons[0]?.pressed || false // A button
    const sprintButton = gamepad.buttons[4]?.pressed || false // LB/L1 button
    const leftStickPress = gamepad.buttons[10]?.pressed || false // L3 button
    const shootButton = (gamepad.buttons[7]?.value || 0) > TRIGGER_DEADZONE // RT button with analog support
    const interactButtonPressed = gamepad.buttons[2]?.pressed || false // X button
    const abilityButtonPressed = gamepad.buttons[1]?.pressed || false // B button
    const droneToggleButtonPressed = gamepad.buttons[3]?.pressed || false // Y button
    const dpadUpPressed = gamepad.buttons[12]?.pressed || false
    const dpadDownPressed = gamepad.buttons[13]?.pressed || false
    const dpadLeftPressed = gamepad.buttons[14]?.pressed || false
    const dpadRightPressed = gamepad.buttons[15]?.pressed || false

    // Edge detection: jump is only true on the first frame the button is pressed
    const jumpEdge = jumpButtonPressed && !previousButtonStates.current.jump
    const interactEdge = interactButtonPressed && !previousButtonStates.current.interact
    const abilityEdge = abilityButtonPressed && !previousButtonStates.current.ability
    const droneToggleEdge = droneToggleButtonPressed && !previousButtonStates.current.droneToggle

    const state = gamepadStateRef.current
    state.leftStick.x = leftX
    state.leftStick.y = leftY
    state.rightStick.x = rightX
    state.rightStick.y = rightY
    state.buttons.jump = jumpEdge
    state.buttons.jumpHeld = jumpButtonPressed
    state.buttons.swimDown = (gamepad.buttons[6]?.value || 0) > TRIGGER_DEADZONE
    state.buttons.sprint = sprintButton
    state.buttons.leftStickPress = leftStickPress
    state.buttons.shoot = shootButton
    state.buttons.interact = interactEdge
    state.buttons.ability = abilityEdge
    state.buttons.droneToggle = droneToggleEdge
    state.buttons.dpadUp = dpadUpPressed
    state.buttons.dpadDown = dpadDownPressed
    state.buttons.dpadLeft = dpadLeftPressed
    state.buttons.dpadRight = dpadRightPressed
    state.connected = true

    // Store current button states for next frame
    previousButtonStates.current = {
      jump: jumpButtonPressed,
      sprint: sprintButton,
      leftStickPress: leftStickPress,
      shoot: shootButton,
      interact: interactButtonPressed,
      ability: abilityButtonPressed,
      droneToggle: droneToggleButtonPressed
    }
  })

  useEffect(() => {
    const handleGamepadConnected = (e: GamepadEvent) => {
      console.log('Gamepad connected:', e.gamepad.id)
      gamepadStateRef.current.connected = true
      forceRender(v => v + 1)
    }

    const handleGamepadDisconnected = (e: GamepadEvent) => {
      console.log('Gamepad disconnected:', e.gamepad.id)
      gamepadStateRef.current.connected = false
      forceRender(v => v + 1)
    }

    window.addEventListener('gamepadconnected', handleGamepadConnected)
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected)

    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected)
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected)
    }
  }, [])

  return gamepadStateRef.current
}
