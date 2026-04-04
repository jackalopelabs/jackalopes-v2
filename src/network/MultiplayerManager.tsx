// Add global type declaration at the top of the file
declare global {
  interface Window { 
    __shotBroadcast?: (shot: any) => any;
    __processedShots?: Set<string>;
    __sendTestShot?: () => void;
    __playJackalopeHitSound?: () => void;
    __playMercHitSound?: () => void;
    __jackalopeAttachmentHandlers?: Record<string, (projectileData: {id: string, position: THREE.Vector3}) => boolean>;
    __disableStabilizationFor?: Record<string, boolean>;
  }
}

import React, { useState, useEffect, useRef, useImperativeHandle, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { ConnectionManager } from './ConnectionManager';
import { RemotePlayer, RemotePlayerMethods } from '../game/RemotePlayer';
import { RemoteShot } from '../game/sphere-tool';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

// Add a global debug level constant
// 0 = no logs, 1 = error only, 2 = important info, 3 = verbose 
const DEBUG_LEVEL = 1;

// Helper functions to convert between position types
const arrayToObjectPosition = (pos: [number, number, number]): { x: number, y: number, z: number } => {
  return { x: pos[0], y: pos[1], z: pos.length > 2 ? pos[2] : 0 };
};

const objectToArrayPosition = (pos: { x: number, y: number, z: number }): [number, number, number] => {
  return [pos.x, pos.y, pos.z];
};

// Types for multiplayer system
type RemotePlayerData = {
  playerId: string;
  position: { x: number, y: number, z: number };
  rotation: number;  // For simpler cases we use a single rotation value (yaw around Y axis)
  lastUpdate?: number;
  playerType?: 'merc' | 'jackalope';
  isMoving?: boolean;  // Flag to indicate if player is moving
  isRunning?: boolean; // Added flag to indicate if player is running
  isShooting?: boolean; // Added flag to indicate if player is shooting
  flashlightOn?: boolean; // Added flag to indicate if flashlight is on
  cameraPitch?: number; // Camera pitch angle for flashlight vertical aiming
};

// Interface for RemotePlayer props
interface RemotePlayerProps {
  id: string;
  initialPosition: [number, number, number];
  initialRotation: [number, number, number, number];
  ref?: React.RefObject<RemotePlayerMethods>;
}

// Extended RemoteShot type with additional fields for networking
interface NetworkRemoteShot extends RemoteShot {
  id: string;
  shotId: string;
  timestamp: number;
}

interface InitializedData {
  id: string;
  gameState: {
    players: Record<string, PlayerData>;
  };
}

// Types for prediction and reconciliation
interface PredictedState {
  timestamp: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  sequence: number;
  processed: boolean;
}

// Snapshot system interfaces
interface GameSnapshot {
  timestamp: number;
  sequence: number;
  players: Record<string, PlayerSnapshot>;
  events: GameEvent[];
}

interface PlayerSnapshot {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number];
  health: number;
}

interface GameEvent {
  type: string;
  timestamp: number;
  data: any;
}

interface ServerState {
  position: [number, number, number];
  timestamp: number;
  sequence: number;
}

type PlayerData = {
  position: [number, number, number];
  rotation: [number, number, number, number];
  health: number;
};

// Add this near the beginning of the file, where other interfaces are defined
interface PlayerUpdateData {
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number];
  sequence?: number;
}

// ReconciliationDebugOverlay component to show reconciliation metrics
const ReconciliationDebugOverlay = ({ metrics }: { metrics: {
  totalCorrections: number,
  averageError: number,
  lastError: number,
  lastCorrection: number,
  active: boolean
} }) => {
  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      fontFamily: 'monospace',
      width: '200px',
      zIndex: 1000,
    }}>
      <h3 style={{margin: '0 0 5px 0'}}>Reconciliation Metrics</h3>
      <div>Total Corrections: {metrics.totalCorrections}</div>
      <div>Avg Error: {metrics.averageError.toFixed(3)}</div>
      <div>Last Error: {metrics.lastError.toFixed(3)}</div>
      <div>Last Correction: {metrics.lastCorrection > 0 ? `${((Date.now() - metrics.lastCorrection) / 1000).toFixed(1)}s ago` : 'None'}</div>
    </div>
  );
};

// Create a hook for the multiplayer logic
export const useMultiplayer = (
  localPlayerRef: React.MutableRefObject<any>,
  connectionManager: ConnectionManager
) => {
  const [remotePlayers, setRemotePlayers] = useState<Record<string, RemotePlayerData>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  
  // Add state prediction buffer
  const stateBuffer = useRef<PredictedState[]>([]);
  const lastServerUpdateTime = useRef<number>(0);
  const serverTimeOffset = useRef<number>(0);
  const sequenceNumber = useRef<number>(0);
  
  // Add reconciliation tracking variables
  const accumulatedError = useRef<number>(0);
  const errorCount = useRef<number>(0);
  const lastCorrectionTime = useRef<number>(0);
  const pendingCorrection = useRef<boolean>(false);
  const correctionData = useRef<{
    position: THREE.Vector3;
    smoothingFactor: number;
    timestamp: number;
  } | null>(null);

  // New snapshot system state
  const snapshots = useRef<GameSnapshot[]>([]);
  const snapshotInterval = useRef<number>(100); // ms between snapshots
  const lastSnapshotTime = useRef<number>(0);
  const maxSnapshots = useRef<number>(60); // Keep at most 60 snapshots (6 seconds at 10 per second)

  const remotePlayerRefs = useRef<Record<string, RemotePlayerData>>({});
  const updateMethodsRef = useRef<Record<string, RemotePlayerMethods>>({});
  const { camera } = useThree();
  
  // Add refs for optimization
  const lastSentPosition = useRef<[number, number, number] | null>(null);
  const nextSequence = useRef<number>(0);
  
  // Get server time with offset
  const getServerTime = () => {
    return Date.now() + serverTimeOffset.current;
  };
  
  // Create a new game snapshot
  const createGameSnapshot = () => {
    if (!isConnected || !localPlayerRef.current || !playerId) return null;
    
    // Get current player states
    const players: Record<string, PlayerSnapshot> = {};
    
    // Add local player
    if (localPlayerRef.current.rigidBody) {
      const position = localPlayerRef.current.rigidBody.translation();
      const positionArray: [number, number, number] = [position.x, position.y, position.z];
      const rotationArray: [number, number, number, number] = camera.quaternion.toArray() as [number, number, number, number];
      
      players[playerId] = {
        id: playerId,
        position: positionArray,
        rotation: rotationArray,
        health: 100, // Assuming default health
      };
    }
    
    // Add remote players
    Object.entries(remotePlayerRefs.current).forEach(([id, data]) => {
      if (data && data.position) {
        players[id] = {
          id,
          position: objectToArrayPosition(data.position),
          rotation: [0, data.rotation, 0, 1], // Convert simple rotation to quaternion
          health: 100, // Assuming default health
        };
      }
    });
    
    // Create the snapshot
    const snapshot: GameSnapshot = {
      timestamp: getServerTime(),
      sequence: sequenceNumber.current,
      players,
      events: [] // No events in this basic snapshot
    };
    
    // Add to snapshot buffer
    snapshots.current.push(snapshot);
    
    // Limit buffer size
    if (snapshots.current.length > maxSnapshots.current) {
      snapshots.current.shift();
    }
    
    lastSnapshotTime.current = Date.now();
    
    return snapshot;
  };
  
  // Add function to send player position with prediction
  const sendPlayerPosition = (position: THREE.Vector3, rotation: THREE.Quaternion) => {
    if (!isConnected || !localPlayerRef.current) return;
    
    // Convert to arrays for network transmission
    const positionArray: [number, number, number] = [position.x, position.y, position.z];
    const rotationArray: [number, number, number, number] = [
      rotation.x, rotation.y, rotation.z, rotation.w
    ];

    // Store predicted state in buffer with sequence number
    const currentState: PredictedState = {
      position: new THREE.Vector3(position.x, position.y, position.z),
      velocity: new THREE.Vector3(0, 0, 0), // We'll track velocity later
      sequence: sequenceNumber.current,
      timestamp: getServerTime(),
      processed: false
    };
    
    // Add to prediction buffer
    stateBuffer.current.push(currentState);
    
    // Limit buffer size to prevent memory issues
    if (stateBuffer.current.length > 100) {
      stateBuffer.current = stateBuffer.current.slice(-100);
    }

    // Send to server with sequence number for reconciliation
    connectionManager.sendPlayerUpdate(
      positionArray, 
      rotationArray,
      sequenceNumber.current
    );
    
    // Increment sequence number for next update
    sequenceNumber.current++;
  };

  // Handle server reconciliation when we receive updates
  const handleServerReconciliation = (serverState: ServerState) => {
    // Find the matching prediction in our buffer
    const matchingPrediction = stateBuffer.current.find(
      state => state.sequence === serverState.sequence
    );
    
    if (matchingPrediction) {
      // Mark as processed
      matchingPrediction.processed = true;
      
      // Calculate position error between our prediction and server state
      const serverPosition = new THREE.Vector3(
        serverState.position[0],
        serverState.position[1],
        serverState.position[2]
      );
      
      const positionError = serverPosition.distanceTo(matchingPrediction.position);
      
      // Calculate error ratios for logging and adaptive correction
      const errorRatio = positionError / 0.1; // Based on threshold
      const shouldCorrect = positionError > 0.1;
      
      // Update error tracking for metrics
      accumulatedError.current += positionError;
      errorCount.current++;
      updateReconciliationMetrics(positionError);
      
      if (shouldCorrect && localPlayerRef.current?.rigidBody) {
        console.log(`Correcting position error: ${positionError.toFixed(3)} (${errorRatio.toFixed(1)}x threshold)`);
        
        // Choose a smoothing factor based on error size
        // Larger errors use stronger correction
        let smoothingFactor = 0.3; // Default
        
        if (errorRatio > 5) {
          // Very large error - snap immediately
          smoothingFactor = 1.0;
        } else if (errorRatio > 2) {
          // Large error - correct more strongly
          smoothingFactor = 0.7;
        } else if (errorRatio < 0.5) {
          // Minor error - gentle correction
          smoothingFactor = 0.1;
        }
        
        // Don't apply corrections too frequently (prevent jitter)
        const correctionTimeDiff = Date.now() - lastCorrectionTime.current;
        if (correctionTimeDiff > 50) { // At least 50ms between corrections
          // For Y-axis, we want to be careful not to interfere with jumps
          // Only correct Y if we're significantly off
          const yError = Math.abs(serverPosition.y - matchingPrediction.position.y);
          if (yError > 0.5) {
            // Major Y difference - include in correction
            correctPlayerPosition(serverPosition, smoothingFactor);
          } else {
            // Minor Y difference - only correct XZ
            const currentPosition = localPlayerRef.current.rigidBody.translation();
            const correctedPosition = new THREE.Vector3(
              serverPosition.x,
              currentPosition.y, // Keep current Y
              serverPosition.z
            );
            correctPlayerPosition(correctedPosition, smoothingFactor);
          }
          
          lastCorrectionTime.current = Date.now();
        }
      } else if (shouldCorrect) {
        console.warn("Cannot correct position: no rigidBody reference");
      } else {
        console.log(`Position accurate within threshold: ${positionError.toFixed(3)}`);
      }
    } else {
      console.log(`No matching prediction found for sequence ${serverState.sequence}`);
      
      // Handle orphaned server updates (no matching prediction)
      // This can happen due to packet loss or out-of-order delivery
      if (localPlayerRef.current?.rigidBody && serverState.position) {
        const serverPosition = new THREE.Vector3(
          serverState.position[0],
          serverState.position[1],
          serverState.position[2]
        );
        
        // Use a higher smoothing factor for orphaned updates
        correctPlayerPosition(serverPosition, 0.5);
      }
    }
    
    // Clean up old entries that have been processed
    stateBuffer.current = stateBuffer.current.filter(
      state => !state.processed || state.sequence > serverState.sequence - 30
    );
  };
  
  // Function to correct player position with proper error handling
  const correctPlayerPosition = (serverPosition: THREE.Vector3, smoothingFactor: number) => {
    try {
      // Store the correction for application in the physics step
      correctionData.current = {
        position: serverPosition.clone(),
        smoothingFactor,
        timestamp: Date.now()
      };
      
      // Schedule correction to be applied in next physics step
      pendingCorrection.current = true;
      
      // Update timestamp for synchronization
      lastServerUpdateTime.current = Date.now();
    } catch (error) {
      console.error("Error during position correction:", error);
    }
  };
  
  // Apply correction with proper physics integration
  const applyCorrection = () => {
    if (!correctionData.current || !localPlayerRef.current?.rigidBody) {
      pendingCorrection.current = false;
      return false;
    }
    
    try {
      const { position, smoothingFactor } = correctionData.current;
      const currentPosition = localPlayerRef.current.rigidBody.translation();
      
      // Calculate interpolated position
      const newX = currentPosition.x + (position.x - currentPosition.x) * smoothingFactor;
      const newY = currentPosition.y + (position.y - currentPosition.y) * smoothingFactor;
      const newZ = currentPosition.z + (position.z - currentPosition.z) * smoothingFactor;
      
      // Apply the correction to the physics body
      localPlayerRef.current.rigidBody.setTranslation(
        { x: newX, y: newY, z: newZ },
        true
      );
      
      // Log the correction
      console.log(`Applied position correction with factor ${smoothingFactor}`);
      
      // Clear the correction data
      correctionData.current = null;
      pendingCorrection.current = false;
      
      return true;
    } catch (error) {
      console.error("Error applying correction:", error);
      pendingCorrection.current = false;
    }
    
    return false;
  };
  
  // Track remote players
  useEffect(() => {
    if (!connectionManager) return;
    
    console.log("⚡ Setting up remote player tracking in MultiplayerManager");
    
    // Handle player joined event
    const handlePlayerJoined = (data: any) => {
      console.log("➕ Player joined:", data);
      
      // Skip joining for undefined IDs or local player
      if (!data.id || data.id === 'undefined' || data.id === connectionManager.getPlayerId()) {
        console.log('Ignoring join event for local player or undefined ID');
        return;
      }
      
      console.log(`Adding new remote player: ${data.id}`);
      
      // Get player type from the server data if available, or use a determinate assignment based on player count
      let playerType = data.playerType || data.state?.playerType || 'unknown';
      
      // If we don't have a specific player type from the server
      if (playerType === 'unknown') {
        // Count existing remote players to determine the next alternating type
        const remotePlayerCount = Object.keys(remotePlayers).length;
        playerType = remotePlayerCount % 2 === 0 ? 'jackalope' : 'merc';
        console.log(`No player type in data - assigning based on player count: ${playerType}`);
      }
      
      console.log(`Assigning player type ${playerType} to ${data.id}`);
      
      // Check if this aligns with expected alternating pattern and log any discrepancies
      const remotePlayerCount = Object.keys(remotePlayers).length;
      const expectedType = remotePlayerCount % 2 === 0 ? 'jackalope' : 'merc';
      if (playerType !== expectedType) {
        console.log(`⚠️ Player ${data.id} has type ${playerType} but expected ${expectedType} based on remote player count ${remotePlayerCount}`);
      }
      
      console.log(`Final player type assignment for ${data.id}: ${playerType}`);
      
      setRemotePlayers(prev => {
        // Skip if player already exists
        if (prev[data.id]) {
          console.log(`Player ${data.id} already exists in our list`);
          return prev;
        }
        
        // Convert position and rotation to the format expected by RemotePlayer
        const position = data.state?.position 
          ? arrayToObjectPosition(data.state.position) 
          : playerType === 'merc' ? { x: 10, y: 7, z: 10 } : { x: -100, y: 7, z: 10 };
          
        const rotation = data.state?.rotation 
          ? quaternionToAngle(data.state.rotation) 
          : 0;
        
        // Add the new player with their initial state
        return {
          ...prev,
          [data.id]: {
            playerId: data.id,
            position,
            rotation,
            lastUpdate: Date.now(),
            playerType: playerType as 'merc' | 'jackalope',
            isMoving: false, // Start as idle
            isRunning: false, // Start as not running
            isShooting: false, // Start as not shooting
            flashlightOn: data.state?.flashlightOn || false // Track flashlight state
          }
        };
      });
    };
    
    const handlePlayerLeft = (data: any) => {
      console.log("➖ Player left:", data);
      
      // Also clean up rate limiting data for this player
      if (playerUpdateThrottleRef.current[data.id]) {
        delete playerUpdateThrottleRef.current[data.id];
      }
      
      setRemotePlayers(prev => {
        if (!prev[data.id]) {
          return prev;
        }
        
        // Create a new object without this player
        const newPlayers = { ...prev };
        delete newPlayers[data.id];
        return newPlayers;
      });
    };
    
    const handlePlayerUpdate = (data: any) => {
      // Skip updates from ourselves or with undefined IDs
      if (data.id === connectionManager.getPlayerId() || !data.id || data.id === 'undefined') {
        return;
      }
      
      // Log playerType from incoming data
      if (DEBUG_LEVEL >= 2) {
        console.log(`🧩 Player update for ${data.id} with playerType: ${data.playerType || 'undefined'}, state.playerType: ${data.state?.playerType || 'undefined'}`);
      }
      
      // Debug logging every 60 updates
      if (Math.random() < 0.02 && DEBUG_LEVEL >= 2) {
        console.log(`📡 Remote player update for ${data.id}:`, data);
      }
      
      // Apply rate limiting for updates - skip some to avoid overwhelming the component
      const now = Date.now();
      
      setRemotePlayers(prev => {
        // If player doesn't exist yet, create them
        if (!prev[data.id]) {
          console.log(`Adding player ${data.id} from update - wasn't in our list`);
          
          // For new players, get the playerType from the data
          const newPlayerType = data.playerType || data.state?.playerType || 'merc';
          
          // Convert position and rotation
          const position = data.position 
            ? arrayToObjectPosition(data.position) 
            : newPlayerType === 'merc' ? { x: 10, y: 7, z: 10 } : { x: -100, y: 7, z: 10 };
            
          const rotation = data.rotation 
            ? quaternionToAngle(data.rotation) 
            : 0;
          
          console.log(`Creating new remote player with type: ${newPlayerType}`);
          
          return {
            ...prev,
            [data.id]: {
              playerId: data.id,
              position,
              rotation,
              lastUpdate: now,
              playerType: newPlayerType,
              isMoving: false,
              isRunning: false,
              isShooting: false,
              flashlightOn: data.state?.flashlightOn || false // Track flashlight state
            }
          };
        }
        
        // For existing players, ALWAYS use their existing playerType
        // This prevents flashing between character types
        const existingPlayer = prev[data.id];
        const existingPlayerType = existingPlayer.playerType;
        
        // Log if there's an attempt to change player type
        if ((data.playerType || data.state?.playerType) && 
            data.playerType !== existingPlayerType && 
            data.state?.playerType !== existingPlayerType) {
          console.log(`⚠️ Ignoring player type change for ${data.id}: Network wants to change from ${existingPlayerType} to ${data.playerType || data.state?.playerType}`);
        }
        
        // Convert position and rotation
        const position = data.position 
          ? arrayToObjectPosition(data.position) 
          : existingPlayer.position;
          
        const rotation = data.rotation 
          ? quaternionToAngle(data.rotation) 
          : existingPlayer.rotation;
        
        // Get flashlight state from update
        const flashlightOn = data.state?.flashlightOn !== undefined ? 
          data.state.flashlightOn : existingPlayer.flashlightOn;
        
        // Detect movement by calculating position change
        let isMoving = false;
        let isRunning = false;
        let timeDelta = 0.016; // Default to 60fps (~16ms)
        let speed = 0;
        
        // Calculate movement only if we have position data
        if (data.position && existingPlayer.position) {
          const prevPos = existingPlayer.position;
          const distance = Math.sqrt(
            Math.pow(position.x - prevPos.x, 2) + 
            Math.pow(position.y - prevPos.y, 2) + 
            Math.pow(position.z - prevPos.z, 2)
          );
          
          // Get the current moving state
          const wasMoving = existingPlayer.isMoving || false;
          const wasRunning = existingPlayer.isRunning || false;
          
          // Calculate speed if we have a previous update time
          if (existingPlayer.lastUpdate) {
            // Calculate time delta in seconds (max 1s to avoid giant jumps)
            timeDelta = Math.min((now - existingPlayer.lastUpdate) / 1000, 1);
            if (timeDelta > 0) {
              speed = distance / timeDelta;
            }
          }
          
          // Apply hysteresis - use different thresholds for starting vs stopping movement
          // IMPORTANT: Completely stopped detection
          if (distance < 0.02) {
            // Very little movement - considered stopped
            isMoving = false;
            isRunning = false;
          }
          // Significant movement - determine if walking or running
          else if (distance > 0.05 || wasMoving) {
            isMoving = true;
            
            // Determine running state based on speed with clearer threshold
            // Running when speed > 8.0 units/second
            if (speed > 8.0) {
              isRunning = true;
            } 
            // Walking when speed is between 0.2 and 8.0
            else if (speed > 0.2 && speed <= 8.0) {
              isRunning = false;
            }
            // For other cases, maintain previous running state with consistency checks
            else {
              isRunning = wasRunning;
              
              // But ensure we never have isRunning=true when speed is very low
              if (isRunning && speed < 0.2) {
                isRunning = false;
              }
            }
          }
          
          // Log movement state changes with clear indicators
          if ((existingPlayer.isMoving !== isMoving || existingPlayer.isRunning !== isRunning) && Math.random() < 0.3) {
            console.log(`💨 Player ${data.id} movement: ${isMoving ? (isRunning ? '🏃 RUNNING' : '🚶 WALKING') : '🧍 STOPPED'} (dist: ${distance.toFixed(3)}, speed: ${speed.toFixed(2)})`);
          }
        }
        
        // Update existing player but NEVER change the playerType
        return {
          ...prev,
          [data.id]: {
            ...existingPlayer,
            position,
            rotation,
            lastUpdate: now,
            isMoving,
            isRunning,
            // Explicitly preserve the existing player type
            playerType: existingPlayerType,
            flashlightOn,
            cameraPitch: data.state?.cameraPitch ?? existingPlayer.cameraPitch ?? 0
          }
        };
      });
    };
    
    // Register event handlers
    connectionManager.on('player_joined', handlePlayerJoined);
    connectionManager.on('player_left', handlePlayerLeft);
    connectionManager.on('player_update', handlePlayerUpdate);
    
    // When connected, request the player list to make sure we have everyone
    const handleConnected = () => {
      console.log("🔌 Connected to multiplayer server - requesting player list");
      
      // Only send player list request if not using the staging server
      if (connectionManager.isReadyToSend() && !connectionManager.getServerUrl().includes('DISABLED_CHECK')) {
        connectionManager.sendMessage({
          type: 'request_player_list'
        });
      } else {
        console.log('Skipping request_player_list for staging server - not supported');
      }
    };
    
    connectionManager.on('connected', handleConnected);
    
    // Also request player list when initialized
    const handleInitialized = () => {
      console.log("🔌 Initialized connection - requesting player list");
      
      // Wait a second before requesting the player list
      setTimeout(() => {
        // Only send player list request if not using the staging server
        if (connectionManager.isReadyToSend() && !connectionManager.getServerUrl().includes('DISABLED_CHECK')) {
          connectionManager.sendMessage({
            type: 'request_player_list'
          });
        } else {
          console.log('Skipping request_player_list for staging server - not supported');
        }
      }, 1000);
    };
    
    connectionManager.on('initialized', handleInitialized);
    
    // Request player list immediately if we're already connected
    if (connectionManager.isReadyToSend() && !connectionManager.getServerUrl().includes('DISABLED_CHECK')) {
      console.log("Already connected - requesting player list");
      connectionManager.sendMessage({
        type: 'request_player_list'
      });
    } else if (connectionManager.isReadyToSend()) {
      console.log('Skipping request_player_list for staging server - not supported');
    }
    
    // When component unmounts
    return () => {
      console.log('Cleaning up multiplayer connection...');
      // Ensure we disconnect properly when component unmounts
      connectionManager.disconnect();
      // Remove specific message handler
      connectionManager.off('message_received', (message: any) => {});
      // Reset states on unmount
      setIsConnected(false);
      setPlayerId(null);
      setRemotePlayers({});
      // Remove all event handlers
      connectionManager.off('player_joined', handlePlayerJoined);
      connectionManager.off('player_left', handlePlayerLeft);
      connectionManager.off('player_update', handlePlayerUpdate);
      connectionManager.off('connected', handleConnected);
      connectionManager.off('initialized', handleInitialized);
    };
  }, [connectionManager]);
  
  // Create and send snapshots periodically
  useEffect(() => {
    if (!isConnected || !localPlayerRef.current?.rigidBody) return;
    
    const snapshotTimer = setInterval(() => {
      const snapshot = createGameSnapshot();
      if (snapshot) {
        // Send snapshot to server if needed
        connectionManager.sendGameSnapshot(snapshot);
      }
    }, snapshotInterval.current);
    
    return () => {
      clearInterval(snapshotTimer);
    };
  }, [isConnected, localPlayerRef, connectionManager]);
  
  // Set up position update interval
  useEffect(() => {
    if (!connectionManager || !localPlayerRef.current || connectionManager.isOfflineMode()) {
      return;
    }
    
    console.log('Starting position update interval');
    
    // Store the last sent rotation to detect changes
    const lastSentRotation = {
      x: 0,
      y: 0,
      z: 0,
      w: 0
    };
    
    // Create a throttle mechanism to avoid sending too many updates
    let lastRotationUpdateTime = 0;
    const MIN_ROTATION_UPDATE_INTERVAL = 250; // Reduced from 500ms to 250ms - more frequent rotation updates
    
    // Track rotation stability
    let isRotationStable = true;
    let lastRotationCheckTime = 0;
    const rotationHistory: Array<[number, number, number, number]> = [];
    
    // Send position updates
    const intervalId = setInterval(() => {
      if (!localPlayerRef.current || !connectionManager.isReadyToSend()) {
        return;
      }

      let position, rotation, velocity;
      
      // Get camera rotation - critical source of player orientation
      // We get a clean, normalized copy of the camera quaternion
      // First we get a fresh copy to avoid reusing mutated quaternions
      rotation = camera.quaternion.clone();
      
      // Ensure it's normalized to prevent drift issues
      rotation.normalize();
      
      // Debug - log actual camera rotation values occasionally 
      if (Math.random() < 0.001) {
        console.log("CAMERA ROTATION ACTUAL:", 
          [rotation.x, rotation.y, rotation.z, rotation.w]);
      }
      
      // Get position data
      if (localPlayerRef.current.body && typeof localPlayerRef.current.body.translation === 'function') {
        position = localPlayerRef.current.body.translation();
        velocity = localPlayerRef.current.body.linvel();
      } else if (localPlayerRef.current.rigidBody && typeof localPlayerRef.current.rigidBody.translation === 'function') {
        position = localPlayerRef.current.rigidBody.translation();
        velocity = localPlayerRef.current.rigidBody.linvel();
      } else if (localPlayerRef.current.position && localPlayerRef.current.position.x !== undefined) {
        position = localPlayerRef.current.position;
      }
      
      if (!position || position.x === undefined || !rotation || rotation.x === undefined) {
        return;
      }
      
      // Track rotation history for stability detection
      const now = Date.now();
      if (now - lastRotationCheckTime > 100) { // Check every 100ms
        rotationHistory.push([rotation.x, rotation.y, rotation.z, rotation.w]);
        if (rotationHistory.length > 5) {
          rotationHistory.shift(); // Keep last 5 rotations
        }
        
        // Calculate rotation stability by comparing recent rotations
        if (rotationHistory.length >= 3) {
          let totalDelta = 0;
          for (let i = 1; i < rotationHistory.length; i++) {
            const prev = rotationHistory[i-1];
            const curr = rotationHistory[i];
            const dotProduct = 
              prev[0] * curr[0] + 
              prev[1] * curr[1] + 
              prev[2] * curr[2] + 
              prev[3] * curr[3];
            totalDelta += Math.abs(1 - Math.abs(dotProduct));
          }
          // Average change between recent rotations
          const avgChange = totalDelta / (rotationHistory.length - 1);
          // Mark as stable if changes are very small
          isRotationStable = avgChange < 0.01;
        }
        
        lastRotationCheckTime = now;
      }
      
      // Position change detection - threshold of 3cm (reduced from 5cm)
      const lastPos = lastSentPosition.current;
      const posChanged = !lastPos || 
        Math.abs(position.x - lastPos[0]) > 0.03 || 
        Math.abs(position.y - lastPos[1]) > 0.03 || 
        Math.abs(position.z - lastPos[2]) > 0.03;
      
      // Rotation change detection - slightly less strict (2.5% threshold)
      // Lower threshold means we'll send more rotation updates
      const rotationChanged = 
        Math.abs(rotation.x - lastSentRotation.x) > 0.025 || 
        Math.abs(rotation.y - lastSentRotation.y) > 0.025 || 
        Math.abs(rotation.z - lastSentRotation.z) > 0.025 || 
        Math.abs(rotation.w - lastSentRotation.w) > 0.025;
      
      // Force update minimum every 2 seconds (reduced from 3 seconds)
      const timeSinceLastUpdate = now - (lastUpdateTime.current || 0);
      const shouldSendForTime = timeSinceLastUpdate > 2000;
      
      // Check if enough time has passed since last rotation update
      const timeSinceLastRotation = now - lastRotationUpdateTime;
      const canSendRotationUpdate = timeSinceLastRotation > MIN_ROTATION_UPDATE_INTERVAL;
      
      // Send update if one of these is true:
      // 1. Position changed significantly, OR
      // 2. Rotation changed AND enough time passed AND player rotation is stable, OR
      // 3. It's been too long since last update
      if (posChanged || 
          (rotationChanged && canSendRotationUpdate && isRotationStable) || 
          shouldSendForTime) {
        
        // Create update data
        const updateData: PlayerUpdateData = {
          position: [position.x, position.y, position.z],
          rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
          sequence: nextSequence.current++
        };
        
        // Add velocity
        if (velocity) {
          updateData.velocity = [velocity.x, velocity.y, velocity.z];
        }
        
        // Send to server
        connectionManager.sendPlayerUpdate(updateData);
        
        // Update tracking variables
        lastSentPosition.current = [position.x, position.y, position.z];
        lastSentRotation.x = rotation.x;
        lastSentRotation.y = rotation.y;
        lastSentRotation.z = rotation.z;
        lastSentRotation.w = rotation.w;
        lastUpdateTime.current = now;
        
        // If rotation changed, update rotation timestamp
        if (rotationChanged) {
          lastRotationUpdateTime = now;
          if (Math.random() < 0.05) {
            console.log("Sent rotation update (stable:", isRotationStable, "):", 
              [rotation.x, rotation.y, rotation.z, rotation.w]);
          }
        }
      }
    }, 30); // Reduced from 50ms to 30ms - back to 33fps for more responsive updates
    
    return () => {
      clearInterval(intervalId);
      console.log('Cleared position update interval');
    };
  }, [connectionManager, localPlayerRef, camera]);
  
  // Handle ref updates for remote players
  const updatePlayerRef = (id: string, methods: RemotePlayerMethods) => {
    // Store methods in a separate structure, not as part of RemotePlayerData
    if (!remotePlayerRefs.current[id]) {
      remotePlayerRefs.current[id] = {
        playerId: id,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        lastUpdate: Date.now()
      };
    }
    
    // Store the update method in a separate ref map
    if (!updateMethodsRef.current) {
      updateMethodsRef.current = {};
    }
    
    updateMethodsRef.current[id] = methods;
  };
  
  // Apply correction during each frame and handle snapshot interpolation
  useFrame(() => {
    // Apply any pending corrections
    if (pendingCorrection.current) {
      applyCorrection();
    }
    
    // Snapshot management - check for stale data
    if (snapshots.current.length > 0) {
      const now = Date.now();
      // Clean up snapshots older than 10 seconds
      const oldestValidTime = now - 10000;
      snapshots.current = snapshots.current.filter(s => s.timestamp > oldestValidTime);
    }
  });
  
  // For reconciliation metrics
  const [reconciliationMetrics, setReconciliationMetrics] = useState({
    totalCorrections: 0,
    averageError: 0,
    lastError: 0,
    lastCorrection: 0,
    active: debugMode
  });
  
  // Update metrics when corrections happen
  const updateReconciliationMetrics = (error: number) => {
    setReconciliationMetrics(prev => {
      const totalCorrections = prev.totalCorrections + 1;
      const totalError = prev.averageError * prev.totalCorrections + error;
      const averageError = totalError / totalCorrections;
      
      return {
        totalCorrections,
        averageError,
        lastError: error,
        lastCorrection: Date.now(),
        active: debugMode
      };
    });
  };
  
  // Function to get a snapshot at a specific time
  const getSnapshotAtTime = (timestamp: number) => {
    if (snapshots.current.length === 0) {
      return null;
    }
    
    // Find the closest snapshots
    let before = snapshots.current[0];
    let after = snapshots.current[snapshots.current.length - 1];
    
    for (const snapshot of snapshots.current) {
      if (snapshot.timestamp <= timestamp && snapshot.timestamp > before.timestamp) {
        before = snapshot;
      }
      
      if (snapshot.timestamp >= timestamp && snapshot.timestamp < after.timestamp) {
        after = snapshot;
      }
    }
    
    // If we found exact match
    if (before.timestamp === timestamp) {
      return before;
    }
    
    // If the timestamp is out of range
    if (timestamp < before.timestamp) {
      return before;
    }
    
    if (timestamp > after.timestamp) {
      return after;
    }
    
    // Otherwise we need to interpolate
    return interpolateSnapshots(before, after, timestamp);
  };
  
  // Helper to interpolate between two snapshots
  const interpolateSnapshots = (before: GameSnapshot, after: GameSnapshot, timestamp: number) => {
    const t = (timestamp - before.timestamp) / (after.timestamp - before.timestamp);
    
    // Create a new interpolated snapshot
    const interpolated: GameSnapshot = {
      timestamp,
      sequence: Math.floor(before.sequence + (after.sequence - before.sequence) * t),
      players: {},
      events: [] // We don't interpolate events
    };
    
    // Interpolate player positions
    const playerIds = new Set([
      ...Object.keys(before.players),
      ...Object.keys(after.players)
    ]);
    
    playerIds.forEach(id => {
      const beforePlayer = before.players[id];
      const afterPlayer = after.players[id];
      
      if (beforePlayer && afterPlayer) {
        // Both snapshots have the player - interpolate
        const position: [number, number, number] = [
          beforePlayer.position[0] + (afterPlayer.position[0] - beforePlayer.position[0]) * t,
          beforePlayer.position[1] + (afterPlayer.position[1] - beforePlayer.position[1]) * t,
          beforePlayer.position[2] + (afterPlayer.position[2] - beforePlayer.position[2]) * t
        ];
        
        // Note: We should properly interpolate quaternions, but this is simplified
        const rotation = beforePlayer.rotation;
        
        interpolated.players[id] = {
          id,
          position,
          rotation,
          health: Math.floor(beforePlayer.health + (afterPlayer.health - beforePlayer.health) * t)
        };
      } else if (beforePlayer) {
        // Only in before snapshot - assume player was removed
        interpolated.players[id] = { ...beforePlayer };
      } else if (afterPlayer) {
        // Only in after snapshot - assume player was added
        interpolated.players[id] = { ...afterPlayer };
      }
    });
    
    return interpolated;
  };
  
  // Set up connection and event handlers
  useEffect(() => {
    console.log('Setting up multiplayer connection...');
    
    // Clean up any existing test players with undefined IDs
    setRemotePlayers(prev => {
      const newPlayers = {...prev};
      let found = false;
      
      Object.keys(newPlayers).forEach(id => {
        if (!id || id === 'undefined') {
          console.log('🧹 Removing test player with undefined ID');
          delete newPlayers[id];
          found = true;
        }
      });
      
      return found ? newPlayers : prev;
    });
    
    // Connection events
    connectionManager.on('connected', () => {
      console.log('Connected to multiplayer server');
      // Don't set isConnected here, wait for auth & session join
    });
    
    connectionManager.on('disconnected', () => {
      console.log('Disconnected from multiplayer server');
      setIsConnected(false);
    });
    
    connectionManager.on('initialized', (data: any) => {
      console.log('Initialized with ID:', data.id);
      setPlayerId(data.id);
      // Don't set isConnected here, wait for session join confirmation
    });

    // Add specific handler for join_success
    connectionManager.on('message_received', (message: any) => {
      if (message.type === 'join_success') {
        console.log('Successfully joined session:', message.session?.id);
        setIsConnected(true);
      }
    });
    
    // Connect to the server
    connectionManager.connect();
    
    // Debug log to check connection status after 5 seconds (no auto-reconnect to prevent storm)
    setTimeout(() => {
      console.log("🔍 MULTIPLAYER CONNECTION STATUS (after 5s):");
      console.log("- IsConnected:", isConnected);
      console.log("- Remote players:", Object.keys(remotePlayers).length);
      console.log("- Server URL:", connectionManager.getServerUrl());
      console.log("- Socket state:", connectionManager.isReadyToSend() ? "READY" : "NOT_READY");
      // Auto-reconnect removed to prevent connection storm
    }, 5000);
    
    return () => {
      console.log('Cleaning up multiplayer connection...');
      // Ensure we disconnect properly when component unmounts
      connectionManager.disconnect();
      // Remove specific message handler
      connectionManager.off('message_received', (message: any) => {});
      // Reset states on unmount
      setIsConnected(false);
      setPlayerId(null);
      setRemotePlayers({});
    };
  }, [connectionManager]);
  
  // Function to handle remote shots
  const handleRemoteShot = (shotData: any) => {
    try {
      if (!shotData || !shotData.id || !shotData.origin) {
        console.warn('Invalid shot data received:', shotData);
        return;
      }
      
      // Skip our own shots (they'll be handled by the local player)
      if (shotData.id === connectionManager.getPlayerId()) {
        return;
      }
      
      console.log(`Remote shot received from ${shotData.id} at position:`, shotData.origin);
      
      // Set shooting state for the remote player
      setRemotePlayers(prev => {
        // If we don't have this player, ignore the shot
        if (!prev[shotData.id]) {
          console.warn(`Shot received from unknown player: ${shotData.id}`);
          return prev;
        }
        
        console.log(`Updating remote player ${shotData.id} to shooting state`);
        
        // Create a copy with updated shooting state
        return {
          ...prev,
          [shotData.id]: {
            ...prev[shotData.id],
            isShooting: true,
            // Reset shooting state after a short delay
            lastShotTime: Date.now()
          }
        };
      });
      
      // Add a shot ID to ensure each shot event is unique
      const shotId = `${shotData.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Log shot details with timestamp
      console.log(`Processing remote shot event: ${shotId}`, {
        playerId: shotData.id,
        time: new Date().toISOString(), 
        position: shotData.origin
      });
      
      // Convert the origin array to an object for better event handling
      const position = {
        x: shotData.origin[0], 
        y: shotData.origin[1], 
        z: shotData.origin[2]
      };
      
      // Dispatch a custom event that RemotePlayerAudio will listen for
      const event = new CustomEvent('remoteShotFired', {
        detail: {
          playerId: shotData.id,
          shotId: shotId,
          timestamp: Date.now(),
          position
        }
      });
      
      console.log('Dispatching remoteShotFired event:', event.detail);
      
      // Also store the shot data in localStorage for cross-browser testing
      try {
        // This allows shots to be heard across browsers during testing
        localStorage.setItem('lastRemoteShot', JSON.stringify({
          playerId: shotData.id,
          shotId,
          timestamp: Date.now(),
          position
        }));
      } catch (e) {
        // Ignore localStorage errors
      }
      
      // Dispatch the event to trigger audio
      window.dispatchEvent(event);
      
      // Add a retry mechanism for shot events
      setTimeout(() => {
        console.log(`Sending retry shot event for ${shotData.id} (${shotId})`);
        window.dispatchEvent(new CustomEvent('remoteShotFired', {
          detail: {
            playerId: shotData.id,
            shotId: `${shotId}-retry`,
            timestamp: Date.now(),
            position
          }
        }));
      }, 100);
      
      // Store the broadcast function for debugging
      window.__shotBroadcast = (shot: any) => {
        const testEvent = new CustomEvent('remoteShotFired', {
          detail: shot
        });
        window.dispatchEvent(testEvent);
        return 'Shot event dispatched';
      };
      
      // Also store a test shot function for debugging
      window.__sendTestShot = () => {
        const testShot = {
          playerId: shotData.id,
          shotId: `test-${Date.now()}`,
          timestamp: Date.now(),
          position
        };
        window.__shotBroadcast?.(testShot);
        console.log('Test shot dispatched:', testShot);
        return 'Test shot dispatched';
      };
      
      // Reset shooting state after a short delay
      setTimeout(() => {
        setRemotePlayers(prev => {
          // If the player is gone, do nothing
          if (!prev[shotData.id]) {
            return prev;
          }
          
          // Reset shooting state
          return {
            ...prev,
            [shotData.id]: {
              ...prev[shotData.id],
              isShooting: false
            }
          };
        });
      }, 300); // Extended delay to ensure the animation and sound can play
    } catch (error) {
      console.error('Error handling remote shot:', error);
    }
  };
  
  // Listen for shots from the connection manager
  connectionManager.on('shot', handleRemoteShot);
  
  // Also listen for shots from localStorage (cross-browser testing)
  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'lastRemoteShot' && e.newValue) {
        try {
          const shotData = JSON.parse(e.newValue);
          console.log('Shot detected from localStorage:', shotData);
          
          // Dispatch sound event
          window.dispatchEvent(new CustomEvent('remoteShotFired', {
            detail: shotData
          }));
          
          // Also update the remote player state
          if (shotData.playerId) {
            setRemotePlayers(prev => {
              if (!prev[shotData.playerId]) return prev;
              
              return {
                ...prev,
                [shotData.playerId]: {
                  ...prev[shotData.playerId],
                  isShooting: true
                }
              };
            });
            
            // Reset shooting after delay
            setTimeout(() => {
              setRemotePlayers(prev => {
                if (!prev[shotData.playerId]) return prev;
                
                return {
                  ...prev,
                  [shotData.playerId]: {
                    ...prev[shotData.playerId],
                    isShooting: false
                  }
                };
              });
            }, 300);
          }
        } catch (error) {
          console.error('Error processing localStorage shot:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageEvent);
    
    // Setup debug helper functions
    window.__shotBroadcast = (shot: any) => {
      window.dispatchEvent(new CustomEvent('remoteShotFired', {
        detail: shot
      }));
      return 'Shot event dispatched';
    };
    
    window.__sendTestShot = () => {
      const playerId = Object.keys(remotePlayers)[0];
      if (!playerId) {
        console.error('No remote players available for test shot');
        return 'No remote players available';
      }
      
      const player = remotePlayers[playerId];
      const testShot = {
        playerId,
        shotId: `test-${Date.now()}`,
        timestamp: Date.now(),
        position: player.position
      };
      
      window.__shotBroadcast?.(testShot);
      console.log('Test shot dispatched:', testShot);
      
      // Also update player state
      setRemotePlayers(prev => ({
        ...prev,
        [playerId]: {
          ...prev[playerId],
          isShooting: true
        }
      }));
      
      // Reset after delay
      setTimeout(() => {
        setRemotePlayers(prev => ({
          ...prev,
          [playerId]: {
            ...prev[playerId],
            isShooting: false
          }
        }));
      }, 300);
      
      return `Test shot dispatched for player ${playerId}`;
    };
    
    return () => {
      console.log('Cleaning up remote shots listener');
      connectionManager.off('shot', handleRemoteShot);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [remotePlayers, connectionManager]);
  
  return {
    remotePlayers,
    handleShoot: (origin: [number, number, number], direction: [number, number, number]) => {
      if (isConnected) {
        console.log('handleShoot called in useMultiplayer, sending to connectionManager', { 
          origin, 
          direction,
          isConnected 
        });
        connectionManager.sendShootEvent(origin, direction);
      } else {
        console.log('Cannot send shoot event - not connected to server');
      }
    },
    updatePlayerRef,
    isConnected,
    playerId,
    sendPlayerPosition,
    // Add reconciliation controls
    setDebugMode,
    applyCorrection,
    pendingReconciliation: pendingCorrection,
    reconciliationMetrics,
    ReconciliationDebugOverlay,
    // Add snapshot system exports
    getSnapshotAtTime,
    createGameSnapshot,
    snapshots: snapshots.current,
    setSnapshotInterval: (interval: number) => {
      snapshotInterval.current = Math.max(50, interval); // Min 50ms
    }
  };
};

// Render remote players - use React.memo to prevent unnecessary re-renders
export const RemotePlayers = React.memo(({ 
  players 
}: { 
  players: Record<string, RemotePlayerData> 
}) => {
  // Reduce debug logging frequency
  const renderCount = useRef(0);
  renderCount.current++;
  if (renderCount.current % 10 === 1 && DEBUG_LEVEL >= 2) {
    console.log(`RemotePlayers rendering #${renderCount.current} with ${Object.keys(players).length} players`);
  }
  
  // DEBUG: render overlay showing remote player count + live data
  useEffect(() => {
    let div = document.getElementById('debug-remote-overlay');
    if (!div) {
      div = document.createElement('div');
      div.id = 'debug-remote-overlay';
      div.style.cssText = 'position:fixed;top:10px;left:10px;background:rgba(0,0,0,0.8);color:lime;font:12px monospace;padding:8px;z-index:99999;pointer-events:none;max-width:400px;';
      document.body.appendChild(div);
    }
    const interval = setInterval(() => {
      const entries = Object.entries(players);
      const liveStore = (window as any).__livePlayerData || {};
      div!.innerHTML = `Remote players: ${entries.length}<br>` + entries.map(([id, p]) => {
        const live = liveStore[id];
        const pos = live?.position || p.position;
        return `${id.slice(-6)}: ${p.playerType} pos=(${pos?.x?.toFixed(1)},${pos?.y?.toFixed(1)},${pos?.z?.toFixed(1)})`;
      }).join('<br>');
    }, 200);
    return () => { clearInterval(interval); div?.remove(); };
  });

  return (
    <>
      {Object.entries(players).filter(([id]) => id && id !== 'undefined')
        .map(([id, playerData]) => (
        <RemotePlayer
          key={`${id}-${playerData.playerType || 'merc'}`}
          playerId={id}
          position={playerData.position}
          rotation={playerData.rotation}
          playerType={playerData.playerType || 'merc'}
          isMoving={playerData.isMoving}
          isRunning={playerData.isRunning}
          isShooting={playerData.isShooting}
          flashlightOn={playerData.flashlightOn}
          cameraPitch={playerData.cameraPitch}
        />
      ))}
    </>
  );
});

// Export main MultiplayerManager component
export const MultiplayerManager: React.FC<{ 
  localPlayerRef: React.RefObject<any>,
  connectionManager: ConnectionManager
}> = ({ localPlayerRef, connectionManager }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<Record<string, RemotePlayerData>>({});

  // Live position store — updated directly from network, NO React re-renders
  // RemotePlayer reads this via window.__livePlayerData
  const livePlayerData = useRef<Record<string, {
    position: { x: number; y: number; z: number };
    rotation: number;
    cameraPitch: number;
    flashlightOn: boolean;
    isMoving: boolean;
    isRunning: boolean;
    isShooting: boolean;
    lastUpdate: number;
  }>>({});

  // Expose on window so RemotePlayer can read it without prop drilling
  useEffect(() => {
    (window as any).__livePlayerData = livePlayerData.current;
    return () => { delete (window as any).__livePlayerData; };
  }, []);

  // For rate limiting player updates
  const playerUpdateThrottleRef = useRef<Record<string, { lastTime: number, minInterval: number }>>({});
  
  // Track last position/update time
  const lastSentPosition = useRef<[number, number, number] | null>(null);
  const lastUpdateTime = useRef<number>(0);
  const nextSequence = useRef<number>(0);
  
  const { camera } = useThree(); // Get the camera from useThree hook outside of the effect
  
  // Set up connection and event handlers
  useEffect(() => {
    console.log('Setting up multiplayer connection...');
    
    // Clean up any existing test players with undefined IDs
    setRemotePlayers(prev => {
      const newPlayers = {...prev};
      let found = false;
      
      Object.keys(newPlayers).forEach(id => {
        if (!id || id === 'undefined') {
          console.log('🧹 Removing test player with undefined ID');
          delete newPlayers[id];
          found = true;
        }
      });
      
      return found ? newPlayers : prev;
    });
    
    // Connection events
    connectionManager.on('connected', () => {
      console.log('Connected to multiplayer server');
      // Don't set isConnected here, wait for auth & session join
    });
    
    connectionManager.on('disconnected', () => {
      console.log('Disconnected from multiplayer server');
      setIsConnected(false);
    });
    
    connectionManager.on('initialized', (data: any) => {
      console.log('Initialized with ID:', data.id);
      setPlayerId(data.id);
      // Don't set isConnected here, wait for session join confirmation
    });

    // Add specific handler for join_success
    connectionManager.on('message_received', (message: any) => {
      if (message.type === 'join_success') {
        console.log('Successfully joined session:', message.session?.id);
        setIsConnected(true);
      }
    });
    
    // Connect to the server
    connectionManager.connect();
    
    // Debug log to check connection status after 5 seconds (no auto-reconnect to prevent storm)
    setTimeout(() => {
      console.log("🔍 MULTIPLAYER CONNECTION STATUS (after 5s):");
      console.log("- IsConnected:", isConnected);
      console.log("- Remote players:", Object.keys(remotePlayers).length);
      console.log("- Server URL:", connectionManager.getServerUrl());
      console.log("- Socket state:", connectionManager.isReadyToSend() ? "READY" : "NOT_READY");
      // Auto-reconnect removed to prevent connection storm
    }, 5000);
    
    return () => {
      console.log('Cleaning up multiplayer connection...');
      // Ensure we disconnect properly when component unmounts
      connectionManager.disconnect();
      // Remove specific message handler
      connectionManager.off('message_received', (message: any) => {});
      // Reset states on unmount
      setIsConnected(false);
      setPlayerId(null);
      setRemotePlayers({});
    };
  }, [connectionManager]);
  
  // Track remote players
  useEffect(() => {
    if (!connectionManager) return;
    
    console.log("⚡ Setting up remote player tracking in MultiplayerManager");
    
    // Handle player joined event
    const handlePlayerJoined = (data: any) => {
      console.log("➕ Player joined:", data);
      
      // Skip joining for undefined IDs or local player
      if (!data.id || data.id === 'undefined' || data.id === connectionManager.getPlayerId()) {
        console.log('Ignoring join event for local player or undefined ID');
        return;
      }
      
      console.log(`Adding new remote player: ${data.id}`);
      
      // Get player type from the server data if available, or use a determinate assignment based on player count
      let playerType = data.playerType || data.state?.playerType || 'unknown';
      
      // If we don't have a specific player type from the server
      if (playerType === 'unknown') {
        // Count existing remote players to determine the next alternating type
        const remotePlayerCount = Object.keys(remotePlayers).length;
        playerType = remotePlayerCount % 2 === 0 ? 'jackalope' : 'merc';
        console.log(`No player type in data - assigning based on player count: ${playerType}`);
      }
      
      console.log(`Assigning player type ${playerType} to ${data.id}`);
      
      // Check if this aligns with expected alternating pattern and log any discrepancies
      const remotePlayerCount = Object.keys(remotePlayers).length;
      const expectedType = remotePlayerCount % 2 === 0 ? 'jackalope' : 'merc';
      if (playerType !== expectedType) {
        console.log(`⚠️ Player ${data.id} has type ${playerType} but expected ${expectedType} based on remote player count ${remotePlayerCount}`);
      }
      
      console.log(`Final player type assignment for ${data.id}: ${playerType}`);
      
      setRemotePlayers(prev => {
        // Skip if player already exists
        if (prev[data.id]) {
          console.log(`Player ${data.id} already exists in our list`);
          return prev;
        }
        
        // Convert position and rotation to the format expected by RemotePlayer
        const position = data.state?.position 
          ? arrayToObjectPosition(data.state.position) 
          : playerType === 'merc' ? { x: 10, y: 7, z: 10 } : { x: -100, y: 7, z: 10 };
          
        const rotation = data.state?.rotation 
          ? quaternionToAngle(data.state.rotation) 
          : 0;
        
        // Add the new player with their initial state
        return {
          ...prev,
          [data.id]: {
            playerId: data.id,
            position,
            rotation,
            lastUpdate: Date.now(),
            playerType: playerType as 'merc' | 'jackalope',
            isMoving: false, // Start as idle
            isRunning: false, // Start as not running
            isShooting: false, // Start as not shooting
            flashlightOn: data.state?.flashlightOn || false // Track flashlight state
          }
        };
      });
    };
    
    const handlePlayerLeft = (data: any) => {
      console.log("➖ Player left:", data);
      
      // Also clean up rate limiting data for this player
      if (playerUpdateThrottleRef.current[data.id]) {
        delete playerUpdateThrottleRef.current[data.id];
      }
      
      setRemotePlayers(prev => {
        if (!prev[data.id]) {
          return prev;
        }
        
        // Create a new object without this player
        const newPlayers = { ...prev };
        delete newPlayers[data.id];
        return newPlayers;
      });
      // Also clean up live data
      delete livePlayerData.current[data.id];
    };
    
    const handlePlayerUpdate = (data: any) => {
      // Skip updates from ourselves or with undefined IDs
      if (data.id === connectionManager.getPlayerId() || !data.id || data.id === 'undefined') {
        return;
      }
      // DEBUG: log first 5 updates per player
      if (!((window as any).__debugUpdateCount)) (window as any).__debugUpdateCount = {};
      const dc = (window as any).__debugUpdateCount;
      dc[data.id] = (dc[data.id] || 0) + 1;
      if (dc[data.id] <= 5) {
        console.log(`[MM handlePlayerUpdate] id=${data.id}, pos=${JSON.stringify(data.position)}, hasState=${!!data.state}, statePos=${JSON.stringify(data.state?.position)}`);
      }

      const now = Date.now();

      // Convert position and rotation once
      const position = data.position
        ? arrayToObjectPosition(data.position)
        : livePlayerData.current[data.id]?.position || { x: 0, y: 0, z: 0 };
      const rotation = data.rotation
        ? quaternionToAngle(data.rotation)
        : livePlayerData.current[data.id]?.rotation ?? 0;
      const flashlightOn = data.state?.flashlightOn ?? livePlayerData.current[data.id]?.flashlightOn ?? false;
      const cameraPitch = data.state?.cameraPitch ?? livePlayerData.current[data.id]?.cameraPitch ?? 0;

      // Detect movement from position delta
      const prevLive = livePlayerData.current[data.id];
      let isMoving = false;
      let isRunning = false;
      if (position && prevLive?.position) {
        const dx = position.x - prevLive.position.x;
        const dy = position.y - prevLive.position.y;
        const dz = position.z - prevLive.position.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const timeDelta = Math.min((now - (prevLive.lastUpdate || now)) / 1000, 1);
        const speed = timeDelta > 0 ? distance / timeDelta : 0;
        if (distance >= 0.02) {
          isMoving = true;
          isRunning = speed > 8.0;
        }
      }

      // *** HOT PATH: write directly to ref store — NO React re-render ***
      livePlayerData.current[data.id] = {
        position,
        rotation,
        cameraPitch,
        flashlightOn,
        isMoving,
        isRunning,
        isShooting: data.state?.isShooting ?? prevLive?.isShooting ?? false,
        lastUpdate: now,
      };

      // *** COLD PATH: React re-render for new player OR playerType correction ***
      const incomingType = data.playerType || data.state?.playerType || null;
      setRemotePlayers(prev => {
        const existing = prev[data.id];
        
        // If player exists AND type matches (or no new type info), skip re-render
        if (existing && (!incomingType || existing.playerType === incomingType)) return prev;
        
        // Either new player or type correction needed
        const newPlayerType = incomingType || existing?.playerType || 'merc';
        if (existing) {
          console.log(`🔄 Correcting player ${data.id} type: ${existing.playerType} → ${newPlayerType}`);
        } else {
          console.log(`🧩 New player ${data.id} assigned type: ${newPlayerType}`);
        }

        return {
          ...prev,
          [data.id]: {
            ...(existing || {
              playerId: data.id,
              position,
              rotation,
              lastUpdate: now,
              isMoving: false,
              isRunning: false,
              isShooting: false,
              flashlightOn,
            }),
            playerType: newPlayerType,
          }
        };
      });
    };
    
    // Register event handlers
    connectionManager.on('player_joined', handlePlayerJoined);
    connectionManager.on('player_left', handlePlayerLeft);
    connectionManager.on('player_update', handlePlayerUpdate);
    
    // When connected, request the player list to make sure we have everyone
    const handleConnected = () => {
      console.log("🔌 Connected to multiplayer server - requesting player list");
      
      // Only send player list request if not using the staging server
      if (connectionManager.isReadyToSend() && !connectionManager.getServerUrl().includes('DISABLED_CHECK')) {
        connectionManager.sendMessage({
          type: 'request_player_list'
        });
      } else {
        console.log('Skipping request_player_list for staging server - not supported');
      }
    };
    
    connectionManager.on('connected', handleConnected);
    
    // Also request player list when initialized
    const handleInitialized = () => {
      console.log("🔌 Initialized connection - requesting player list");
      
      // Wait a second before requesting the player list
      setTimeout(() => {
        // Only send player list request if not using the staging server
        if (connectionManager.isReadyToSend() && !connectionManager.getServerUrl().includes('DISABLED_CHECK')) {
          connectionManager.sendMessage({
            type: 'request_player_list'
          });
        } else {
          console.log('Skipping request_player_list for staging server - not supported');
        }
      }, 1000);
    };
    
    connectionManager.on('initialized', handleInitialized);
    
    // Request player list immediately if we're already connected
    if (connectionManager.isReadyToSend() && !connectionManager.getServerUrl().includes('DISABLED_CHECK')) {
      console.log("Already connected - requesting player list");
      connectionManager.sendMessage({
        type: 'request_player_list'
      });
    } else if (connectionManager.isReadyToSend()) {
      console.log('Skipping request_player_list for staging server - not supported');
    }
    
    // When component unmounts
    return () => {
      console.log('Cleaning up multiplayer connection...');
      // Ensure we disconnect properly when component unmounts
      connectionManager.disconnect();
      // Remove specific message handler
      connectionManager.off('message_received', (message: any) => {});
      // Reset states on unmount
      setIsConnected(false);
      setPlayerId(null);
      setRemotePlayers({});
      // Remove all event handlers
      connectionManager.off('player_joined', handlePlayerJoined);
      connectionManager.off('player_left', handlePlayerLeft);
      connectionManager.off('player_update', handlePlayerUpdate);
      connectionManager.off('connected', handleConnected);
      connectionManager.off('initialized', handleInitialized);
    };
  }, [connectionManager]);
  
  // Set up position update interval
  useEffect(() => {
    if (!connectionManager || !localPlayerRef.current || connectionManager.isOfflineMode()) {
      return;
    }
    
    console.log('Starting position update interval');
    
    // Store the last sent rotation to detect changes
    const lastSentRotation = {
      x: 0,
      y: 0,
      z: 0,
      w: 0
    };
    
    // Create a throttle mechanism to avoid sending too many updates
    let lastRotationUpdateTime = 0;
    const MIN_ROTATION_UPDATE_INTERVAL = 250; // Reduced from 500ms to 250ms - more frequent rotation updates
    
    // Track rotation stability
    let isRotationStable = true;
    let lastRotationCheckTime = 0;
    const rotationHistory: Array<[number, number, number, number]> = [];
    
    // Send position updates
    const intervalId = setInterval(() => {
      if (!localPlayerRef.current || !connectionManager.isReadyToSend()) {
        return;
      }

      let position, rotation, velocity;
      
      // Get camera rotation - critical source of player orientation
      // We get a clean, normalized copy of the camera quaternion
      // First we get a fresh copy to avoid reusing mutated quaternions
      rotation = camera.quaternion.clone();
      
      // Ensure it's normalized to prevent drift issues
      rotation.normalize();
      
      // Debug - log actual camera rotation values occasionally 
      if (Math.random() < 0.001) {
        console.log("CAMERA ROTATION ACTUAL:", 
          [rotation.x, rotation.y, rotation.z, rotation.w]);
      }
      
      // Get position data
      if (localPlayerRef.current.body && typeof localPlayerRef.current.body.translation === 'function') {
        position = localPlayerRef.current.body.translation();
        velocity = localPlayerRef.current.body.linvel();
      } else if (localPlayerRef.current.rigidBody && typeof localPlayerRef.current.rigidBody.translation === 'function') {
        position = localPlayerRef.current.rigidBody.translation();
        velocity = localPlayerRef.current.rigidBody.linvel();
      } else if (localPlayerRef.current.position && localPlayerRef.current.position.x !== undefined) {
        position = localPlayerRef.current.position;
      }
      
      if (!position || position.x === undefined || !rotation || rotation.x === undefined) {
        return;
      }
      
      // Track rotation history for stability detection
      const now = Date.now();
      if (now - lastRotationCheckTime > 100) { // Check every 100ms
        rotationHistory.push([rotation.x, rotation.y, rotation.z, rotation.w]);
        if (rotationHistory.length > 5) {
          rotationHistory.shift(); // Keep last 5 rotations
        }
        
        // Calculate rotation stability by comparing recent rotations
        if (rotationHistory.length >= 3) {
          let totalDelta = 0;
          for (let i = 1; i < rotationHistory.length; i++) {
            const prev = rotationHistory[i-1];
            const curr = rotationHistory[i];
            const dotProduct = 
              prev[0] * curr[0] + 
              prev[1] * curr[1] + 
              prev[2] * curr[2] + 
              prev[3] * curr[3];
            totalDelta += Math.abs(1 - Math.abs(dotProduct));
          }
          // Average change between recent rotations
          const avgChange = totalDelta / (rotationHistory.length - 1);
          // Mark as stable if changes are very small
          isRotationStable = avgChange < 0.01;
        }
        
        lastRotationCheckTime = now;
      }
      
      // Position change detection - threshold of 3cm (reduced from 5cm)
      const lastPos = lastSentPosition.current;
      const posChanged = !lastPos || 
        Math.abs(position.x - lastPos[0]) > 0.03 || 
        Math.abs(position.y - lastPos[1]) > 0.03 || 
        Math.abs(position.z - lastPos[2]) > 0.03;
      
      // Rotation change detection - slightly less strict (2.5% threshold)
      // Lower threshold means we'll send more rotation updates
      const rotationChanged = 
        Math.abs(rotation.x - lastSentRotation.x) > 0.025 || 
        Math.abs(rotation.y - lastSentRotation.y) > 0.025 || 
        Math.abs(rotation.z - lastSentRotation.z) > 0.025 || 
        Math.abs(rotation.w - lastSentRotation.w) > 0.025;
      
      // Force update minimum every 2 seconds (reduced from 3 seconds)
      const timeSinceLastUpdate = now - (lastUpdateTime.current || 0);
      const shouldSendForTime = timeSinceLastUpdate > 2000;
      
      // Check if enough time has passed since last rotation update
      const timeSinceLastRotation = now - lastRotationUpdateTime;
      const canSendRotationUpdate = timeSinceLastRotation > MIN_ROTATION_UPDATE_INTERVAL;
      
      // Send update if one of these is true:
      // 1. Position changed significantly, OR
      // 2. Rotation changed AND enough time passed AND player rotation is stable, OR
      // 3. It's been too long since last update
      if (posChanged || 
          (rotationChanged && canSendRotationUpdate && isRotationStable) || 
          shouldSendForTime) {
        
        // Create update data
        const updateData: PlayerUpdateData = {
          position: [position.x, position.y, position.z],
          rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
          sequence: nextSequence.current++
        };
        
        // Add velocity
        if (velocity) {
          updateData.velocity = [velocity.x, velocity.y, velocity.z];
        }
        
        // Send to server
        connectionManager.sendPlayerUpdate(updateData);
        
        // Update tracking variables
        lastSentPosition.current = [position.x, position.y, position.z];
        lastSentRotation.x = rotation.x;
        lastSentRotation.y = rotation.y;
        lastSentRotation.z = rotation.z;
        lastSentRotation.w = rotation.w;
        lastUpdateTime.current = now;
        
        // If rotation changed, update rotation timestamp
        if (rotationChanged) {
          lastRotationUpdateTime = now;
          if (Math.random() < 0.05) {
            console.log("Sent rotation update (stable:", isRotationStable, "):", 
              [rotation.x, rotation.y, rotation.z, rotation.w]);
          }
        }
      }
    }, 30); // Reduced from 50ms to 30ms - back to 33fps for more responsive updates
    
    return () => {
      clearInterval(intervalId);
      console.log('Cleared position update interval');
    };
  }, [connectionManager, localPlayerRef, camera]);

  // Render remote players
  return (
    <>
      <RemotePlayers players={remotePlayers} />
    </>
  );
};

// Remote shots hook for use in the sphere tool component
export const useRemoteShots = (connectionManager: ConnectionManager) => {
  const [shots, setShots] = useState<RemoteShot[]>([]);
  const processedShots = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!connectionManager) return;
    
    console.log('Setting up remote shots listener on connection manager:', connectionManager);
    
    // Create a handler for shots from other players
    const handleShot = (shotData: any) => {
      console.log('Remote shot received:', shotData);
      
      // Create a consistent shotId if one doesn't exist
      const shotId = shotData.shotId || 
        `${shotData.id}-${shotData.origin?.join(',') || '0,0,0'}-${shotData.timestamp || Date.now()}`;
      
      // Skip if we've already processed this shot
      if (processedShots.current.has(shotId)) {
        console.log('Shot already processed, skipping:', shotId);
        return;
      }
      
      // Add to processed shots to prevent duplicates
      processedShots.current.add(shotId);
      console.log('Adding shot to processed shots, new size:', processedShots.current.size);
      
      // Save the original shotId to the shot data for consistent tracking
      const remoteShot: RemoteShot & { shotId?: string } = {
        id: shotData.id || 'unknown',
        origin: shotData.origin || shotData.position || [0, 0, 0],
        direction: shotData.direction || [0, 1, 0],
        shotId: shotId // Add the shotId to help with deduplication
      };
      
      // Add the shot to our state
      setShots(prev => [...prev, remoteShot]);
    };
    
    // Setup cross-browser communication for shots
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'jackalopes_shot_events' && e.newValue) {
        try {
          const shotData = JSON.parse(e.newValue);
          console.log('Shot received from localStorage:', shotData);
          handleShot(shotData);
        } catch (error) {
          console.error('Error processing shot from localStorage:', error);
        }
      }
    };
    
    // Initialize or reuse the global processed shots set
    if (!window.__processedShots) {
      window.__processedShots = new Set<string>();
    }
    
    // Sync our local set with the global one
    processedShots.current = window.__processedShots;
    
    // Listen for shots from the connection manager
    connectionManager.on('shot', handleShot);
    
    // Also listen for shots from localStorage (cross-browser testing)
    window.addEventListener('storage', handleStorageEvent);
    
    // Make the localStorage broadcast function available globally
    window.__shotBroadcast = (shotData: any) => {
      // Ensure the shot has a consistent ID
      if (!shotData.shotId) {
        shotData.shotId = `${shotData.id}-${shotData.origin?.join(',') || '0,0,0'}-${Date.now()}`;
      }
      
      console.log('Shot broadcasted to localStorage:', shotData);
      localStorage.setItem('jackalopes_shot_events', JSON.stringify(shotData));
      
      // Also process it locally for the current window
      handleShot(shotData);
    };
    
    // Set up a function for sending test shots directly
    // This allows testing without the server connection
    const sendTestShot = () => {
      const testShotData = {
        id: 'test-player',
        shotId: `test-player-${Date.now()}`,
        origin: [0, 0, 0],
        direction: [0, 1, 0],
        timestamp: Date.now()
      };
      
      console.log('Sending test shot directly to useRemoteShots hook');
      handleShot(testShotData);
    };
    
    // Add the test function to the window for debugging
    window.__sendTestShot = sendTestShot;
    
    // Clean up on unmount
    return () => {
      console.log('Cleaning up remote shots listener');
      connectionManager.off('shot', handleShot);
      window.removeEventListener('storage', handleStorageEvent);
      
      // Clean up global functions but preserve processed shots
      delete window.__shotBroadcast;
      delete window.__sendTestShot;
    };
  }, [connectionManager]);
  
  return shots;
};

// Function to convert quaternion to rotation angle
const quaternionToAngle = (quat: [number, number, number, number]): number => {
  // Extract yaw (y-axis rotation) from quaternion
  // This is a simplified conversion assuming we only care about y-rotation
  const q = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]);
  
  // Normalize the quaternion to prevent issues with accumulated error
  q.normalize();

  // Special case handling for rotations near 180 degrees
  // This detects quaternions that represent a Y-rotation close to PI (180 degrees)
  // which can cause flipping due to numerical precision issues
  // If this is a nearly-pure Y rotation with w near zero, handle specially
  if (Math.abs(q.w) < 0.1 && Math.abs(q.y) > 0.9) {
    // For these special cases, we use the sign of y to determine direction
    // This prevents flipping between positive and negative representations of the same angle
    const angle = Math.PI * Math.sign(q.y);
    
    // Debug occasional logging
    if (Math.random() < 0.01) {
      console.log(`Special case quaternion handling: (${quat[0].toFixed(2)}, ${quat[1].toFixed(2)}, ${quat[2].toFixed(2)}, ${quat[3].toFixed(2)}) => ${angle.toFixed(2)}`);
    }
    
    return angle;
  }
  
  // Normal case - extract Euler Y angle
  const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  
  // Debug occasional logging to verify rotation
  if (Math.random() < 0.01) {
    console.log(`Quaternion (${quat[0].toFixed(2)}, ${quat[1].toFixed(2)}, ${quat[2].toFixed(2)}, ${quat[3].toFixed(2)}) converted to Euler Y: ${euler.y.toFixed(2)}`);
  }
  
  return euler.y;
}; 