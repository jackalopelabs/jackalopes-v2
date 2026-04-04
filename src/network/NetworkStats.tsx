import React, { useState, useEffect } from 'react';
import { ConnectionManager } from './ConnectionManager';

type NetworkStatsProps = {
  connectionManager: ConnectionManager;
  visible?: boolean;
};

export const NetworkStats: React.FC<NetworkStatsProps> = ({ 
  connectionManager, 
  visible = false 
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [remotePlayers, setRemotePlayers] = useState(0);
  const [messagesSent, setMessagesSent] = useState(0);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [latency, setLatency] = useState(0);
  const [showStats, setShowStats] = useState(visible);

  useEffect(() => {
    setShowStats(visible);
  }, [visible]);

  useEffect(() => {
    if (!connectionManager) return;
    
    // Track connection state
    const handleConnected = () => {
      setIsConnected(true);
    };
    
    const handleDisconnected = () => {
      setIsConnected(false);
    };
    
    const handleInitialized = (data: { id: string }) => {
      setPlayerId(data.id);
    };
    
    const handlePlayerJoined = () => {
      setRemotePlayers(prev => prev + 1);
    };
    
    const handlePlayerLeft = () => {
      setRemotePlayers(prev => Math.max(0, prev - 1));
    };
    
    const handleMessageSent = () => {
      setMessagesSent(prev => prev + 1);
    };
    
    const handleMessageReceived = () => {
      setMessagesReceived(prev => prev + 1);
    };
    
    const handleLatencyUpdate = (newLatency: number) => {
      setLatency(newLatency);
    };
    
    // Add event listeners
    connectionManager.on('connected', handleConnected);
    connectionManager.on('disconnected', handleDisconnected);
    connectionManager.on('initialized', handleInitialized);
    connectionManager.on('player_joined', handlePlayerJoined);
    connectionManager.on('player_left', handlePlayerLeft);
    connectionManager.on('message_sent', handleMessageSent);
    connectionManager.on('message_received', handleMessageReceived);
    connectionManager.on('latency_update', handleLatencyUpdate);
    
    // Set initial state
    setIsConnected(connectionManager.isPlayerConnected());
    setPlayerId(connectionManager.getPlayerId());
    setLatency(connectionManager.getLatency());
    
    // Clean up
    return () => {
      connectionManager.off('connected', handleConnected);
      connectionManager.off('disconnected', handleDisconnected);
      connectionManager.off('initialized', handleInitialized);
      connectionManager.off('player_joined', handlePlayerJoined);
      connectionManager.off('player_left', handlePlayerLeft);
      connectionManager.off('message_sent', handleMessageSent);
      connectionManager.off('message_received', handleMessageReceived);
      connectionManager.off('latency_update', handleLatencyUpdate);
    };
  }, [connectionManager]);
  
  // Toggle stats display
  const toggleStats = () => {
    setShowStats(prev => !prev);
  };
  
  return (
    <>
      <div 
        style={{ 
          position: 'absolute', 
          top: '10px', 
          right: '10px', 
          background: 'rgba(0,0,0,0.5)', 
          color: 'white',
          padding: '5px',
          cursor: 'pointer',
          borderRadius: '4px',
          zIndex: 1000
        }}
        onClick={toggleStats}
      >
        {showStats ? 'Hide Stats' : 'Network'}
      </div>
      
      {showStats && (
        <div 
          style={{ 
            position: 'absolute', 
            top: '40px', 
            right: '10px', 
            background: 'rgba(0,0,0,0.7)', 
            color: 'white',
            padding: '10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            zIndex: 1000,
            width: '200px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span>Connection:</span>
            <span style={{ color: isConnected ? '#8f8' : '#f88' }}>
              {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span>Player ID:</span>
            <span>{playerId || 'N/A'}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span>Remote Players:</span>
            <span>{remotePlayers}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span>Messages Sent:</span>
            <span>{messagesSent}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span>Messages Received:</span>
            <span>{messagesReceived}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Latency:</span>
            <span>{latency}ms</span>
          </div>
        </div>
      )}
    </>
  );
}; 