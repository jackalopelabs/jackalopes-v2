// MultiplayerSyncManager.tsx
// Ensures entities are consistently represented between systems

import React, { useEffect, useState, useRef } from 'react';
import { ConnectionManager } from './ConnectionManager';
import entityStateObserver from './EntityStateObserver';
import { RemotePlayer } from '../game/RemotePlayer';
import { log, DEBUG_LEVELS, isDebugEnabled } from '../utils/debugUtils';

// Add global type declaration
declare global {
  interface Window {
    jackalopesGame?: {
      playerType?: 'merc' | 'jackalope';
      levaPanelState?: 'open' | 'closed';
      flashlightOn?: boolean;
      debugLevel?: number;
      spawnManager?: {
        baseSpawnX: number;
        currentSpawnX: number;
        stepSize: number;
        minX: number;
        getNextSpawnPoint: () => [number, number, number];
        resetSpawnPoints: () => [number, number, number];
        getSpawnPoint: () => [number, number, number];
      };
    };
  }
}

interface MultiplayerSyncManagerProps {
  connectionManager: ConnectionManager;
}

/**
 * MultiplayerSyncManager ensures consistent entity representation 
 * across the network, sound, and visual systems
 */
export const MultiplayerSyncManager: React.FC<MultiplayerSyncManagerProps> = ({ 
  connectionManager 
}) => {
  // Track remote players
  const [remoteEntities, setRemoteEntities] = useState<Record<string, any>>({});
  const networkEventHandlersSet = useRef(false);
  const entityEventHandlersSet = useRef(false);
  
  // Set up network event listeners
  useEffect(() => {
    if (!connectionManager || networkEventHandlersSet.current) return;
    
    console.log('🔄 MultiplayerSyncManager: Setting up network event handlers');
    
    // When a player joins, ensure they're in the EntityStateObserver
    const handlePlayerJoined = (data: any) => {
      console.log('🔄 Player joined event received:', data);
      
      // Make sure it's not our own player
      if (data.id === connectionManager.getPlayerId()) {
        console.log('Ignoring join event for local player');
        return;
      }
      
      // Get the player type from the connection data
      const playerType = data.state?.playerType || data.playerType || 'unknown';
      
      // Determine player type using a more consistent approach
      let finalPlayerType: 'merc' | 'jackalope' = 'merc';
      
      if (playerType !== 'unknown' && (playerType === 'merc' || playerType === 'jackalope')) {
        // Use the explicitly provided type if valid
        finalPlayerType = playerType as 'merc' | 'jackalope';
        console.log(`🔄 Using explicitly provided player type: ${finalPlayerType}`);
      } else {
        // Fall back to player index parity (even = jackalope, odd = merc)
        // Use player ID hash for consistent assignment across sessions
        let playerIndex = 0;
        try {
          // Use a simple hash of the player ID
          const idSum = data.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
          playerIndex = idSum % 10; // Keep it to single digit for simplicity
        } catch (e) {
          console.error('Error generating player index from ID:', e);
        }
        
        finalPlayerType = playerIndex % 2 === 0 ? 'jackalope' : 'merc';
        console.log(`🔄 Assigned player type ${finalPlayerType} based on ID hash: ${playerIndex}`);
      }
      
      // Register the entity in the EntityStateObserver
      entityStateObserver.updateEntity({
        id: data.id,
        type: finalPlayerType,
        position: data.state?.position || [0, 1, 0],
        rotation: data.state?.rotation || 0,
        isMoving: false,
        isRunning: false,
        isShooting: false,
        health: 100
      });
      
      // Update our local state to trigger rendering
      setRemoteEntities(prev => {
        // Skip if entity already exists with the same type
        if (prev[data.id] && prev[data.id].type === finalPlayerType) {
          return prev;
        }
        
        return {
          ...prev,
          [data.id]: {
            id: data.id,
            type: finalPlayerType,
            position: data.state?.position || [0, 1, 0],
            rotation: data.state?.rotation || 0
          }
        };
      });
    };
    
    // When a player updates their state, update EntityStateObserver
    const handlePlayerUpdate = (data: any) => {
      // Skip updates from ourselves
      if (data.id === connectionManager.getPlayerId()) {
        return;
      }
      
      // Get the player type from the update data or defaults
      const playerType = data.playerType || data.state?.playerType;
      
      // We need at least a position to update
      if (data.position) {
        // Update the EntityStateObserver
        entityStateObserver.updateEntity({
          id: data.id,
          // Only include type if explicitly provided
          ...(playerType ? { type: playerType as 'merc' | 'jackalope' } : {}),
          position: data.position,
          rotation: data.rotation || 0,
          // Detect movement by position change
          isMoving: data.state?.velocity ? (
            Math.abs(data.state.velocity[0]) > 0.01 || 
            Math.abs(data.state.velocity[2]) > 0.01
          ) : undefined,
          // Detect running by velocity magnitude
          isRunning: data.state?.velocity ? (
            Math.sqrt(
              data.state.velocity[0] * data.state.velocity[0] + 
              data.state.velocity[2] * data.state.velocity[2]
            ) > 0.2
          ) : undefined
        });
      }
    };
    
    // When a player leaves, remove them from EntityStateObserver
    const handlePlayerLeft = (data: any) => {
      if (data.id) {
        // Remove from EntityStateObserver
        entityStateObserver.removeEntity(data.id);
        
        // Update our local state to remove the entity
        setRemoteEntities(prev => {
          const newEntities = { ...prev };
          delete newEntities[data.id];
          return newEntities;
        });
      }
    };
    
    // When a game event occurs, process it
    const handleGameEvent = (event: any) => {
      // Handle different event types
      if (event.event_type === 'player_shoot' || 
          event.type === 'player_shoot') {
        
        const playerId = event.player_id || event.player;
        
        // Skip our own shots
        if (playerId === connectionManager.getPlayerId()) {
          return;
        }
        
        console.log('🔄 Processing remote shot event:', event);
        
        // Ensure we have this player in EntityStateObserver
        const origin = event.origin || [0, 1, 0];
        const direction = event.direction || [1, 0, 0];
        
        // Get the player type for proper shot sound
        const playerType = event.playerType || 'merc';
        
        // Check if entity exists, create if needed
        const existingEntity = entityStateObserver.getEntity(playerId);
        if (!existingEntity) {
          // Register a new entity with the shot information
          entityStateObserver.updateEntity({
            id: playerId,
            type: playerType as 'merc' | 'jackalope',
            position: origin,
            rotation: 0,
            isMoving: false,
            isRunning: false,
            isShooting: true, 
            health: 100
          });
          
          console.log(`🔄 Created new entity for shooter: ${playerId} (${playerType})`);
        } else {
          // Record the shot in EntityStateObserver
          entityStateObserver.recordShot(playerId, origin, direction);
        }
      }
      // Handle player respawn events
      else if (event.event_type === 'player_respawn') {
        const respawnPlayerId = event.player_id;
        
        console.log(`🔄 [SyncManager] Received respawn event for player ${respawnPlayerId}:`, event);
        
        // Skip if it's not for an entity we're tracking
        if (!entityStateObserver.getEntity(respawnPlayerId)) {
          console.log(`🔄 [SyncManager] Cannot process respawn for unknown entity: ${respawnPlayerId}`);
          // Try to create the entity if it doesn't exist yet
          try {
            // Determine spawn position from spawnManager or fall back to event data
            let fallbackPosition: [number, number, number];
            if ((window.jackalopesGame as any)?.spawnManager) {
              fallbackPosition = (window.jackalopesGame as any).spawnManager.getSpawnPoint();
              console.log(`🔄 [SyncManager] Using spawn manager position: [${fallbackPosition.join(', ')}]`);
            } else {
              fallbackPosition = event.spawnPosition || [-100, 3, 10];
              console.log(`🔄 [SyncManager] Using server-provided position: [${fallbackPosition.join(', ')}]`);
            }

            console.log(`🔄 [SyncManager] Creating missing entity for respawn: ${respawnPlayerId}`);
            entityStateObserver.updateEntity({
              id: respawnPlayerId,
              type: 'jackalope', // Assume jackalope since only they respawn
              position: fallbackPosition,
              rotation: 0,
              isMoving: false,
              isRunning: false,
              isShooting: false,
              health: 100,
              isRespawning: true
            });
          } catch (err) {
            console.error(`🔄 [SyncManager] Error creating entity for respawn:`, err);
          }
        }
        
        // Determine the actual respawn position to use
        let spawnPosition: [number, number, number];
        
        // Priority 1: Use spawn manager if available (client-side control for progressive spawning)
        if ((window.jackalopesGame as any)?.spawnManager) {
          // If this is a local player respawn, get the next position with progression
          if (respawnPlayerId === connectionManager.getPlayerId()) {
            spawnPosition = (window.jackalopesGame as any).spawnManager.getNextSpawnPoint();
            console.log(`🔄 [SyncManager] Using next spawn point from manager: [${spawnPosition.join(', ')}]`);
          } else {
            // For remote players, just get the current position
            spawnPosition = (window.jackalopesGame as any).spawnManager.getSpawnPoint();
            console.log(`🔄 [SyncManager] Using current spawn point from manager: [${spawnPosition.join(', ')}]`);
          }
        }
        // Priority 2: Use position from event if provided by server
        else if (event.spawnPosition) {
          spawnPosition = event.spawnPosition;
          console.log(`🔄 [SyncManager] Using server-provided position: [${spawnPosition.join(', ')}]`);
        }
        // Priority 3: Fall back to default position
        else {
          spawnPosition = [-100, 3, 10];
          console.log(`🔄 [SyncManager] Using default fallback position: [${spawnPosition.join(', ')}]`);
        }
        
        console.log(`🔄 [SyncManager] Setting respawn position to: [${spawnPosition.join(', ')}]`);
        
        // IMPORTANT: Send an immediate position update for this entity
        // This ensures all clients see the new position right away
        try {
          // First set respawning flag to trigger death effect
          entityStateObserver.updateEntity({
            id: respawnPlayerId,
            isRespawning: true,
            health: 100 // Reset health on respawn
          });
          
          // Then after a short delay, update position and clear respawning flag
          setTimeout(() => {
            entityStateObserver.updateEntity({
              id: respawnPlayerId,
              position: spawnPosition,
              isRespawning: false,
              isMoving: false,
              isRunning: false,
              health: 100
            });
            console.log(`🔄 [SyncManager] Updated entity ${respawnPlayerId} final position to [${spawnPosition.join(', ')}]`);
          }, 300);
          
          console.log(`🔄 [SyncManager] Updated entity ${respawnPlayerId} to respawn state with position [${spawnPosition.join(', ')}]`);
        } catch (err) {
          console.error(`🔄 [SyncManager] Error updating entity state:`, err);
        }
        
        // If this is for our own player, handle our local respawn
        const localPlayerId = connectionManager.getPlayerId();
        console.log(`🔄 [SyncManager] Local player ID: ${localPlayerId}, Respawning player: ${respawnPlayerId}`);
        
        // IMPORTANT: Also broadcast the respawn via an additional immediate update message
        // This helps ensure the respawn is seen by all clients
        if (connectionManager && !event.noBroadcast) {
          try {
            // Send an immediate position update to ensure everyone sees the new position
            connectionManager.sendMessage({
              type: 'player_update',
              state: {
                position: spawnPosition,
                rotation: 0,
                sequence: Date.now(),
                isRespawning: false,
                playerType: 'jackalope'
              },
              player_id: respawnPlayerId
            });
            console.log(`🔄 [SyncManager] Sent immediate position update for respawned player ${respawnPlayerId}`);
          } catch (e) {
            console.error(`🔄 [SyncManager] Failed to send immediate update for respawn:`, e);
          }
        }
        
        if (respawnPlayerId === localPlayerId) {
          console.log(`🔄 [SyncManager] Dispatching local player_respawned event for ${respawnPlayerId}`);
          
          try {
            // Dispatch a local event to trigger respawn effects
            const respawnEvent = new CustomEvent('player_respawned', {
              detail: { position: spawnPosition }
            });
            window.dispatchEvent(respawnEvent);
            console.log(`🔄 [SyncManager] Successfully dispatched respawn event for local player ${respawnPlayerId}`);
            
            // Also try direct communication with the player entity if available
            if (window.jackalopesGame) {
              // Use a safer approach that doesn't require changing the type definition
              (window.jackalopesGame as any)._lastRespawnTime = Date.now();
              (window.jackalopesGame as any)._lastRespawnPosition = spawnPosition;
            }
          } catch (err) {
            console.error(`🔄 [SyncManager] Error dispatching respawn event:`, err);
          }
        } else {
          console.log(`🔄 [SyncManager] Remote player ${respawnPlayerId} will respawn, not dispatching local event`);
        }
      }
      // Handle score update events
      else if (event.event_type === 'game_score_update') {
        console.log('🏆 [SyncManager] Received score update event:', event);
        
        // Forward the score update event to anyone listening
        try {
          // Create a custom event to update the scores in App.tsx
          const scoreUpdateEvent = new CustomEvent('game_score_update', {
            detail: event
          });
          
          // Dispatch the event to the window so App.tsx can listen for it
          window.dispatchEvent(scoreUpdateEvent);
          console.log('🏆 [SyncManager] Dispatched score update event:', event);
        } catch (err) {
          console.error('🏆 [SyncManager] Error dispatching score update event:', err);
        }
      }
    };
    
    // Register event handlers
    connectionManager.on('player_joined', handlePlayerJoined);
    connectionManager.on('player_update', handlePlayerUpdate);
    connectionManager.on('player_left', handlePlayerLeft);
    connectionManager.on('game_event', handleGameEvent);
    
    // Set flag to prevent duplicate event registration
    networkEventHandlersSet.current = true;
    
    // Clean up on unmount
    return () => {
      if (connectionManager) {
        connectionManager.off('player_joined', handlePlayerJoined);
        connectionManager.off('player_update', handlePlayerUpdate);
        connectionManager.off('player_left', handlePlayerLeft);
        connectionManager.off('game_event', handleGameEvent);
      }
      networkEventHandlersSet.current = false;
    };
  }, [connectionManager]);
  
  // Set up entity event listeners
  useEffect(() => {
    if (entityEventHandlersSet.current) return;
    
    // When a new entity is added, add it to our local state
    const handleEntityAdded = (entity: any) => {
      console.log('🔄 Entity added from EntityStateObserver:', entity);
      
      // Skip our own entity
      if (entity.id === connectionManager?.getPlayerId()) {
        return;
      }
      
      // Update our local state to include this entity
      setRemoteEntities(prev => {
        // Skip if entity already exists with the same type
        if (prev[entity.id] && prev[entity.id].type === entity.type) {
          return prev;
        }
        
        return {
          ...prev,
          [entity.id]: {
            id: entity.id,
            type: entity.type,
            position: entity.position,
            rotation: entity.rotation
          }
        };
      });
    };
    
    // When an entity is removed, remove it from our local state
    const handleEntityRemoved = (entity: any) => {
      // Skip our own entity
      if (entity.id === connectionManager?.getPlayerId()) {
        return;
      }
      
      // Update our local state to remove the entity
      setRemoteEntities(prev => {
        const newEntities = { ...prev };
        delete newEntities[entity.id];
        return newEntities;
      });
    };
    
    // Register event handlers
    entityStateObserver.on('entityAdded', handleEntityAdded);
    entityStateObserver.on('entityRemoved', handleEntityRemoved);
    
    // Set flag to prevent duplicate event registration
    entityEventHandlersSet.current = true;
    
    // Clean up on unmount
    return () => {
      entityStateObserver.off('entityAdded', handleEntityAdded);
      entityStateObserver.off('entityRemoved', handleEntityRemoved);
      entityEventHandlersSet.current = false;
    };
  }, [connectionManager]);
  
  // Initialize local player in EntityStateObserver
  useEffect(() => {
    if (!connectionManager) return;
    
    // Get local player ID and type
    const playerId = connectionManager.getPlayerId();
    const playerType = connectionManager.getAssignedPlayerType();
    
    // Register the local player with EntityStateObserver
    if (playerId) {
      console.log(`🔄 Registering local player: ${playerId} (${playerType})`);
      
      entityStateObserver.setLocalPlayerId(playerId);
      entityStateObserver.updateEntity({
        id: playerId,
        type: playerType,
        position: [0, 1, 0], // Default position
        rotation: 0,
        isMoving: false,
        isRunning: false,
        isShooting: false,
        health: 100
      });
    }
  }, [connectionManager?.getPlayerId()]);
  
  // Log remote entities for debugging
  useEffect(() => {
    if (Object.keys(remoteEntities).length > 0 && isDebugEnabled(DEBUG_LEVELS.INFO)) {
      log.debug('Remote entities in MultiplayerSyncManager:', remoteEntities);
    }
  }, [remoteEntities]);
  
  // We don't need to render anything directly - this is just a sync manager
  return null;
};

export default MultiplayerSyncManager; 