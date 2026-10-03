import { useCallback } from 'react'

interface RespawnButtonProps {
  connectionManager: { getPlayerId: () => string | null; sendRespawnRequest: (id: string, pos?: [number, number, number]) => void } | null
}

export const RespawnButton = ({ connectionManager }: RespawnButtonProps) => {
  const handleRespawn = useCallback(() => {
    if (!connectionManager) return
    const playerId = connectionManager.getPlayerId()
    if (playerId) {
      console.log(`[RespawnButton] Requesting respawn for ${playerId}`)
      connectionManager.sendRespawnRequest(playerId)
    }
  }, [connectionManager])

  return (
    <button
      onClick={handleRespawn}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        padding: '12px 20px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        zIndex: 9999,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)'
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)'
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
      }}
    >
      Respawn
    </button>
  )
}
