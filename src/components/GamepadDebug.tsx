import { useState, useEffect } from 'react'

export const GamepadDebug = () => {
  const [pressedButtons, setPressedButtons] = useState<string[]>([])
  const [axes, setAxes] = useState<string[]>([])
  const [gamepadId, setGamepadId] = useState('No gamepad')

  useEffect(() => {
    const interval = setInterval(() => {
      const gamepad = navigator.getGamepads()[0]
      if (!gamepad) {
        setGamepadId('No gamepad')
        setPressedButtons(['No buttons'])
        setAxes(['No axes'])
        return
      }

      setGamepadId(gamepad.id || 'Unknown gamepad')

      const pressed: string[] = []
      gamepad.buttons.forEach((button, index) => {
        if (button.pressed || button.value > 0.1) {
          pressed.push(`B${index}=${button.value.toFixed(2)}`)
        }
      })

      if (pressed.length === 0) {
        pressed.push('Press buttons...')
      }

      const axisLines = gamepad.axes.map((value, index) => `A${index}=${value.toFixed(2)}`)

      setPressedButtons(pressed)
      setAxes(axisLines)
    }, 100)

    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      background: 'rgba(0,0,0,0.9)',
      color: '#0f0',
      padding: '15px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '16px',
      zIndex: 9999,
      minWidth: '260px',
      border: '2px solid #0f0',
      lineHeight: 1.4,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#ff0' }}>
        GAMEPAD DEBUG
      </div>

      <div style={{ marginBottom: '10px', fontSize: '12px', color: '#8fd3ff', wordBreak: 'break-word' }}>
        {gamepadId}
      </div>

      <div style={{ marginBottom: '6px', color: '#ff9' }}>AXES</div>
      {axes.map((axis, i) => (
        <div key={`axis-${i}`} style={{ marginBottom: '3px' }}>{axis}</div>
      ))}

      <div style={{ marginTop: '10px', marginBottom: '6px', color: '#ff9' }}>BUTTONS</div>
      {pressedButtons.map((btn, i) => (
        <div key={`btn-${i}`} style={{ marginBottom: '3px' }}>{btn}</div>
      ))}

      <div style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
        A=B0, B=B1, X=B2, RT=B7
      </div>
    </div>
  )
}
