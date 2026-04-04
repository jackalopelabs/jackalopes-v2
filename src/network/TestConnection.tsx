import React, { useState, useEffect } from 'react';
import { ConnectionManager } from './ConnectionManager';

export const TestConnection: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<Record<string, any>>({});

  useEffect(() => {
    // Helper function to log with timestamp
    const log = (message: string) => {
      const timestamp = new Date().toISOString().substr(11, 8);
      setLogs(prevLogs => [`[${timestamp}] ${message}`, ...prevLogs].slice(0, 100));
    };

    log('Initializing connection manager...');
    const connectionManager = new ConnectionManager();

    // Set up event listeners
    connectionManager.on('connected', () => {
      log('Connected to server');
      setIsConnected(true);
    });

    connectionManager.on('disconnected', () => {
      log('Disconnected from server');
      setIsConnected(false);
    });

    connectionManager.on('initialized', (data) => {
      log(`Initialized with player ID: ${data.id}`);
      setPlayerId(data.id);
      
      // Initialize remote players
      const players = Object.entries(data.gameState.players)
        .filter(([id]) => id !== data.id)
        .reduce((acc, [id, player]) => {
          acc[id] = player;
          return acc;
        }, {} as Record<string, any>);
      
      setRemotePlayers(players);
      log(`Initial remote players: ${Object.keys(players).length}`);
    });

    connectionManager.on('player_joined', (data) => {
      log(`Player joined: ${data.id}`);
      setRemotePlayers(prev => ({
        ...prev,
        [data.id]: data.state
      }));
    });

    connectionManager.on('player_left', (data) => {
      log(`Player left: ${data.id}`);
      setRemotePlayers(prev => {
        const newPlayers = { ...prev };
        delete newPlayers[data.id];
        return newPlayers;
      });
    });

    connectionManager.on('player_update', (data) => {
      setRemotePlayers(prev => ({
        ...prev,
        [data.id]: {
          ...prev[data.id],
          position: data.position,
          rotation: data.rotation
        }
      }));
    });

    connectionManager.on('player_shoot', (data) => {
      log(`Player ${data.id} shot from ${JSON.stringify(data.origin)} in direction ${JSON.stringify(data.direction)}`);
    });

    connectionManager.on('error', (error) => {
      log(`Error: ${error}`);
    });

    // Connect to the server
    log('Connecting to server...');
    connectionManager.connect();

    // Generate random position every 500ms to simulate movement
    const intervalId = setInterval(() => {
      if (isConnected && connectionManager && connectionManager.isReadyToSend()) {
        // Generate a random position within the arena
        const randomPos: [number, number, number] = [
          10 * (Math.random() - 0.5),
          Math.random() * 2 + 1, // 1-3 units high
          10 * (Math.random() - 0.5)
        ];
        
        // Generate a random rotation
        const randomRot: [number, number, number, number] = [
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ];
        
        // Normalize the rotation quaternion
        const length = Math.sqrt(
          randomRot[0] * randomRot[0] + 
          randomRot[1] * randomRot[1] + 
          randomRot[2] * randomRot[2] + 
          randomRot[3] * randomRot[3]
        );
        randomRot[0] /= length;
        randomRot[1] /= length;
        randomRot[2] /= length;
        randomRot[3] /= length;
        
        // Send the update
        connectionManager.sendPlayerUpdate({
          position: randomPos,
          rotation: randomRot,
          sequence: Date.now()
        });
      }
    }, 500);

    return () => {
      clearInterval(intervalId);
      connectionManager.disconnect();
    };
  }, []);

  return (
    <div style={{ 
      fontFamily: 'monospace', 
      padding: '20px', 
      maxWidth: '800px', 
      margin: '0 auto' 
    }}>
      <h1>WebSocket Connection Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <div>
          <strong>Connection Status:</strong> {isConnected ? '✅ Connected' : '❌ Disconnected'}
        </div>
        <div>
          <strong>Player ID:</strong> {playerId || 'Not assigned'}
        </div>
        <div>
          <strong>Remote Players:</strong> {Object.keys(remotePlayers).length}
        </div>
      </div>
      
      <h2>Log:</h2>
      <div style={{ 
        height: '400px', 
        overflowY: 'scroll', 
        border: '1px solid #ccc', 
        padding: '10px',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px'
      }}>
        {logs.map((log, index) => (
          <div key={index} style={{ marginBottom: '4px' }}>{log}</div>
        ))}
      </div>
    </div>
  );
}; 