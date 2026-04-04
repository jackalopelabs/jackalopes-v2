import React, { useEffect, useState, useRef } from 'react';
import { ConnectionManager } from '../network/ConnectionManager';

interface ConnectionTestProps {
  sharedConnectionManager?: ConnectionManager;
}

export const ConnectionTest: React.FC<ConnectionTestProps> = ({ sharedConnectionManager }) => {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'offline'>('disconnected');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [latency, setLatency] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [serverUrl, setServerUrl] = useState('ws://147.182.235.54:8082');
  const connectionManagerRef = useRef<ConnectionManager | null>(null);
  const [expanded, setExpanded] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().substr(11, 8);
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
  };

  // Function to set up common server URLs
  const setServerPreset = (preset: string) => {
    switch (preset) {
      case 'staging':
        setServerUrl('ws://147.182.235.54:8082');
        break;
      case 'staging-secure':
        setServerUrl('ws://147.182.235.54:8082');
        break;
      case 'local':
        setServerUrl('ws://localhost:8082');
        break;
      case 'offline':
        // Special case - go to offline mode immediately
        if (connectionManagerRef.current) {
          connectionManagerRef.current.forceReady();
          setConnectionStatus('offline');
          addLog('Switched to offline mode');
        }
        break;
    }
  };

  useEffect(() => {
    // Use the shared connection manager if provided, otherwise create a new one
    if (sharedConnectionManager) {
      connectionManagerRef.current = sharedConnectionManager;
      
      // Check current connection state
      if (sharedConnectionManager.isReadyToSend()) {
        if (sharedConnectionManager.isPlayerConnected()) {
          setConnectionStatus('connected');
          setPlayerId(sharedConnectionManager.getPlayerId() || null);
        } else {
          setConnectionStatus('offline');
          setPlayerId(sharedConnectionManager.getPlayerId() || null);
        }
      } else {
        setConnectionStatus('disconnected');
      }
      
      addLog(`Using shared connection manager (URL: ${sharedConnectionManager.getServerUrl()})`);
    } else {
      // Create and store the connection manager
      connectionManagerRef.current = new ConnectionManager(serverUrl);
      addLog(`Created new connection manager with URL: ${serverUrl}`);
      
      // Connect when component mounts with a new manager
      setConnectionStatus('connecting');
      connectionManagerRef.current.connect();
    }

    const connectionManager = connectionManagerRef.current;

    // Set up event listeners
    const handleConnected = () => {
      setConnectionStatus('connected');
      addLog('Connected to server');
    };

    const handleDisconnected = () => {
      // Only set to disconnected if not in offline mode
      if (connectionStatus !== 'offline') {
        setConnectionStatus('disconnected');
        addLog('Disconnected from server');
      }
    };

    const handleInitialized = (data: any) => {
      setPlayerId(data.id);
      
      // Check if we're in offline mode (player ID starts with 'offline-')
      if (data.id && data.id.startsWith('offline-')) {
        setConnectionStatus('offline');
        addLog(`Initialized in OFFLINE mode with ID: ${data.id}`);
      } else {
        addLog(`Initialized with player ID: ${data.id}`);
      }
    };
    
    const handleServerUnreachable = () => {
      setConnectionStatus('offline');
      addLog('Server unreachable. Switched to offline mode.');
    };

    const handleLatencyUpdate = (newLatency: number) => {
      setLatency(newLatency);
    };

    const handleMessageReceived = (message: any) => {
      addLog(`Received: ${message.type}`);
    };

    const handleMessageSent = (message: any) => {
      addLog(`Sent: ${message.type}`);
    };

    // Add event listeners
    connectionManager.on('connected', handleConnected);
    connectionManager.on('disconnected', handleDisconnected);
    connectionManager.on('initialized', handleInitialized);
    connectionManager.on('server_unreachable', handleServerUnreachable);
    connectionManager.on('latency_update', handleLatencyUpdate);
    connectionManager.on('message_received', handleMessageReceived);
    connectionManager.on('message_sent', handleMessageSent);

    // Cleanup on unmount
    return () => {
      // Remove event listeners
      connectionManager.off('connected', handleConnected);
      connectionManager.off('disconnected', handleDisconnected);
      connectionManager.off('initialized', handleInitialized);
      connectionManager.off('server_unreachable', handleServerUnreachable);
      connectionManager.off('latency_update', handleLatencyUpdate);
      connectionManager.off('message_received', handleMessageReceived);
      connectionManager.off('message_sent', handleMessageSent);
      
      // Only disconnect if we created our own manager
      if (!sharedConnectionManager) {
        connectionManager.disconnect();
        connectionManagerRef.current = null;
      }
    };
  }, [serverUrl, sharedConnectionManager]);

  const handleConnect = () => {
    if (connectionManagerRef.current) {
      setConnectionStatus('connecting');
      
      // Only create a new connection manager if we're not using a shared one
      if (!sharedConnectionManager) {
        connectionManagerRef.current.disconnect();
        connectionManagerRef.current = new ConnectionManager(serverUrl);
      }
      
      connectionManagerRef.current.connect();
      addLog(`Connecting to ${serverUrl}...`);
    }
  };

  const handleDisconnect = () => {
    if (connectionManagerRef.current) {
      connectionManagerRef.current.disconnect();
      addLog('Manually disconnected');
    }
    setConnectionStatus('disconnected');
  };

  const handleTestShot = () => {
    if (connectionManagerRef.current) {
      connectionManagerRef.current.sendShootEvent([0, 0, 0], [0, 0, 1]);
      addLog('Test shot sent');
    } else {
      addLog('Cannot send test shot: no connection manager');
    }
  };

  const handleForceOfflineMode = () => {
    if (connectionManagerRef.current) {
      connectionManagerRef.current.forceReady();
      setConnectionStatus('offline');
      addLog('Forced offline mode');
    } else {
      addLog('Cannot force offline mode: no connection manager');
    }
  };

  const handleGetConnectionState = () => {
    if (connectionManagerRef.current) {
      const isReady = connectionManagerRef.current.isReadyToSend();
      const playerId = connectionManagerRef.current.getPlayerId();
      const socketState = connectionManagerRef.current.getSocketState();
      
      addLog(`Connection State: ready=${isReady}, playerID=${playerId}, socket=${socketState}`);
    } else {
      addLog('Cannot get state: no connection manager');
    }
  };

  // Get status color based on connection status
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'offline': return 'bg-purple-500';
      case 'disconnected': 
      default: return 'bg-red-500';
    }
  };

  // Get status label with emoji
  const getStatusLabel = () => {
    switch (connectionStatus) {
      case 'connected': return '🟢 Connected';
      case 'connecting': return '🟠 Connecting...';
      case 'offline': return '🟣 Offline Mode';
      case 'disconnected': 
      default: return '🔴 Disconnected';
    }
  };

  // Return a styled UI that matches the Multiplayer Debug Panel
  return (
    <div style={{
      position: 'fixed',
      bottom: expanded ? '350px' : '10px', // Move up when expanded
      left: '10px', // Position on the left side
      backgroundColor: connectionStatus === 'offline' ? 'rgba(128, 0, 128, 0.8)' : 
                      connectionStatus === 'connected' ? 'rgba(0, 128, 0, 0.8)' : 
                      connectionStatus === 'connecting' ? 'rgba(255, 165, 0, 0.8)' : 
                      'rgba(0, 0, 0, 0.7)',
      padding: '10px',
      borderRadius: '4px',
      zIndex: 1000,
      maxWidth: '400px',
      maxHeight: expanded ? '80vh' : 'auto',
      overflowY: expanded ? 'auto' : 'hidden',
      border: connectionStatus === 'offline' ? '1px solid #d8bfd8' : 
              connectionStatus === 'connected' ? '1px solid #90ee90' : 
              connectionStatus === 'connecting' ? '1px solid #ffd700' :
              connectionStatus === 'disconnected' ? '1px solid #ff8a80' : 'none',
    }}>
      <div style={{ 
        fontSize: '14px', 
        color: 'white', 
        marginBottom: '10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          {getStatusLabel()} {latency ? `(${latency}ms)` : ''}
        </span>
        <button 
          onClick={() => setExpanded(!expanded)}
          style={{
            backgroundColor: '#333',
            color: 'white',
            border: 'none',
            padding: '3px 6px',
            borderRadius: '2px',
            fontSize: '10px',
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      
      {/* Connection controls */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={handleConnect}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: connectionStatus === 'connecting' ? 0.7 : 1,
          }}
          disabled={connectionStatus === 'connecting' || !!sharedConnectionManager}
        >
          Connect
        </button>
        <button
          onClick={handleDisconnect}
          style={{
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: connectionStatus === 'disconnected' ? 0.7 : 1,
          }}
          disabled={connectionStatus === 'disconnected' || !!sharedConnectionManager}
        >
          Disconnect
        </button>
        <button
          onClick={handleTestShot}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
          disabled={!connectionManagerRef.current?.isReadyToSend()}
        >
          Test Shot
        </button>
        <button
          onClick={handleForceOfflineMode}
          style={{
            backgroundColor: connectionStatus === 'offline' ? '#666' : '#9C27B0',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: connectionStatus === 'offline' ? 0.7 : 1,
          }}
          disabled={connectionStatus === 'offline'}
        >
          Force Offline
        </button>
      </div>
      
      {/* Expanded content */}
      {expanded && (
        <>
          {/* Server URL input (only if not using shared connection) */}
          {!sharedConnectionManager && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', color: 'white', marginBottom: '5px' }}>
                Server URL:
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  style={{ 
                    flex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    padding: '5px',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setServerPreset('staging')}
                  style={{
                    backgroundColor: '#333',
                    color: 'white',
                    border: 'none',
                    padding: '3px 6px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Staging (ws://)
                </button>
                <button
                  onClick={() => setServerPreset('staging-secure')}
                  style={{
                    backgroundColor: '#333',
                    color: 'white',
                    border: 'none',
                    padding: '3px 6px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Staging (wss://)
                </button>
                <button
                  onClick={() => setServerPreset('local')}
                  style={{
                    backgroundColor: '#333',
                    color: 'white',
                    border: 'none',
                    padding: '3px 6px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Local
                </button>
                <button
                  onClick={() => setServerPreset('offline')}
                  style={{
                    backgroundColor: '#333',
                    color: 'white',
                    border: 'none',
                    padding: '3px 6px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Offline Mode
                </button>
              </div>
            </div>
          )}
          
          {/* Connection details */}
          <div style={{
            marginTop: '10px',
            fontSize: '12px',
            color: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            padding: '8px',
            borderRadius: '4px',
          }}>
            <p style={{ margin: '5px 0' }}>
              <strong>Status:</strong> {getStatusLabel()}
            </p>
            <p style={{ margin: '5px 0' }}>
              <strong>Player ID:</strong> {playerId || 'None'}
            </p>
            <p style={{ margin: '5px 0' }}>
              <strong>Latency:</strong> {latency}ms
            </p>
            <p style={{ margin: '5px 0' }}>
              <strong>Connection:</strong> {sharedConnectionManager ? 'Shared' : 'Standalone'}
            </p>
          </div>
          
          {/* Log messages */}
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '12px', color: 'white', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Connection Log:</span>
              <button
                onClick={() => setLogs([])}
                style={{
                  backgroundColor: '#666',
                  color: 'white',
                  border: 'none',
                  padding: '2px 4px',
                  borderRadius: '2px',
                  fontSize: '9px',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>
            <div style={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              height: '150px',
              overflowY: 'auto',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'monospace'
            }}>
              {logs.length > 0 ? logs.map((log, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>{log}</div>
              )) : (
                <div style={{ color: '#888', fontStyle: 'italic' }}>No log messages yet</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}; 