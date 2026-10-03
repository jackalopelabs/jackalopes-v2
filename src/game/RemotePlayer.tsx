import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Html, Clone, useGLTF } from '@react-three/drei';
import { useFrame, RootState } from '@react-three/fiber';
import { Points, BufferGeometry, NormalBufferAttributes, Material } from 'three';
import { MercModelPath, JackalopeModelPath } from '../assets'; // Import model paths instead of components
import { RemotePlayerAudio } from '../components/RemotePlayerAudio'; // Import RemotePlayerAudio component
import { log, DEBUG_LEVELS, isDebugEnabled } from '../utils/debugUtils'; // Import new debug utilities
import { RigidBody, CapsuleCollider, BallCollider, CuboidCollider } from '@react-three/rapier'; // Import Rapier physics components
import { MercModel } from './MercModel';
import { JackalopeModel } from './JackalopeModel';
import entityStateObserver from '../network/EntityStateObserver'; // Import entityStateObserver
import './PlayerMarker.css';

// Add window type declaration at the top of the file with all custom properties
declare global {
  interface Window {
    __fallbackModels?: Record<string, THREE.Object3D>;
    __jackalopeAttachmentHandlers?: Record<string, (projectileData: {id: string, position: THREE.Vector3}) => boolean>;
    __jackalopeHitHandlers?: Record<string, (projectileId: string, shooterId: string) => boolean>;
    __createExplosionEffect?: (position: THREE.Vector3, color: string, particleCount: number, radius: number) => void;
    __createSpawnEffect?: (position: THREE.Vector3, color: string, particleCount: number, radius: number) => void;
    __networkManager?: {
      sendRespawnRequest: (playerId: string, spawnPosition?: [number, number, number]) => void;
    };
    __lastHitJackalope?: string;
  }
}

// Define the RemotePlayerData interface locally to match MultiplayerManager
interface RemotePlayerData {
  playerId: string;
  position: { x: number, y: number, z: number };
  rotation: number;
  playerType?: 'merc' | 'jackalope';
  isMoving?: boolean;
  isRunning?: boolean;
  isShooting?: boolean;
  flashlightOn?: boolean; // Add flashlight state
  droneActive?: boolean;
  dronePosition?: { x: number, y: number, z: number };
  droneRotation?: number;
  droneThermalActive?: boolean;
}

// Interface for RemotePlayer props
export interface RemotePlayerProps {
  adventureAvatar?: 'jackalope' | 'astronaut';
  playerId: string;
  position: THREE.Vector3;
  rotation: number;
  playerType: 'merc' | 'jackalope';
  isMoving?: boolean;
  isRunning?: boolean;
  isShooting?: boolean;
  flashlightOn?: boolean; // Add flashlight state
  cameraPitch?: number; // Camera pitch for flashlight vertical aim
  droneActive?: boolean;
  dronePosition?: { x: number, y: number, z: number };
  droneRotation?: number;
  droneThermalActive?: boolean;
  audioListener?: THREE.AudioListener;
}

// Interface for the exposed methods
export interface RemotePlayerMethods {
  updateTransform: (position: [number, number, number], rotation: [number, number, number, number]) => void;
}

const PlayerMarker = ({
  playerId,
  playerType,
  position,
  height,
  visible = true,
}: {
  playerId: string;
  playerType: 'merc' | 'jackalope';
  position: { x: number; y: number; z: number };
  height: number;
  visible?: boolean;
}) => {
  const markerRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const distanceRef = useRef<HTMLSpanElement>(null);

  useFrame(({ camera }) => {
    if (!markerRef.current) return;

    const livePosition = (window as any).__livePlayerData?.[playerId]?.position || position;
    markerRef.current.position.set(livePosition.x, livePosition.y + height, livePosition.z);

    const gameMode = window.jackalopesGame?.gameMode;
    const localPlayerType = window.jackalopesGame?.playerType;
    markerRef.current.visible = visible && (
      gameMode === 'adventure' || localPlayerType === playerType
    );

    if (markerRef.current.visible && distanceRef.current) {
      distanceRef.current.textContent = `${Math.round(camera.position.distanceTo(markerRef.current.position))}m`;
    }
    if (markerRef.current.visible && labelRef.current) {
      labelRef.current.textContent = gameMode === 'adventure' ? 'FRIEND' : 'TEAM';
    }
  });

  return (
    <group ref={markerRef}>
      <Html center zIndexRange={[120, 20]} style={{ pointerEvents: 'none' }}>
        <div className={`player-marker${playerType === 'merc' ? ' player-marker--merc' : ''}`}>
          <span className="player-marker__beacon">
            <span className="player-marker__pulse" />
            <span className="player-marker__diamond" />
          </span>
          <span className="player-marker__meta">
            <span ref={labelRef}>TEAM</span>
            <span ref={distanceRef} className="player-marker__distance">--m</span>
          </span>
        </div>
      </Html>
    </group>
  );
};

// FlamethrowerFlame component for the particle effect
const FlamethrowerFlame = () => {
  const particlesRef = useRef<Points<BufferGeometry<NormalBufferAttributes>, Material | Material[]>>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const count = 15; // Number of particles
  
  // Generate initial random positions for particles 
  const initialPositions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Start particles from the nozzle with forward direction
      const spread = 0.03;
      positions[i * 3] = 0.1 + Math.random() * 0.1; // Forward from nozzle
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread; // Slight up/down spread
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread; // Slight left/right spread
    }
    return positions;
  }, [count]);
  
  // Animate particles for flame effect
  useFrame(() => {
    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < count; i++) {
        // Move particles outward from nozzle
        positions[i * 3] += 0.02 + Math.random() * 0.01;
        
        // Add some random movement
        positions[i * 3 + 1] += (Math.random() - 0.5) * 0.01;
        positions[i * 3 + 2] += (Math.random() - 0.5) * 0.01;
        
        // Reset particles that have gone too far
        if (positions[i * 3] > 0.3) {
          positions[i * 3] = 0.05 + Math.random() * 0.05;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 0.03;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
        }
      }
      
      // Pulsing glow effect for the flame
      if (materialRef.current) {
        materialRef.current.size = 0.02 + Math.sin(Date.now() * 0.01) * 0.005;
        materialRef.current.opacity = 0.7 + Math.sin(Date.now() * 0.008) * 0.2;
      }
      
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  
  return (
    <points ref={particlesRef} position={[0.6, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={initialPositions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.02}
        color="#ff7700"
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// PilotLight component for the animated pilot light
const PilotLight = () => {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  
  // Animate the pilot light intensity
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = 2 + Math.sin(Date.now() * 0.01) * 0.5;
    }
  });
  
  return (
    <mesh position={[0.63, 0.03, 0]}>
      <sphereGeometry args={[0.02, 8, 8]} />
      <meshStandardMaterial 
        ref={materialRef}
        color="#ff9500" 
        emissive="#ff5500" 
        emissiveIntensity={2}
        toneMapped={false} 
      />
    </mesh>
  );
};

// Remote Player Component
export const RemotePlayer: React.FC<RemotePlayerProps> = ({ 
  playerId, position, rotation, adventureAvatar = 'jackalope', playerType = 'merc', isMoving, isRunning, isShooting, flashlightOn, cameraPitch = 0, droneActive, dronePosition, droneRotation, droneThermalActive, audioListener
}) => {
  // Add debug logging for player type
  if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
    log.player(`RemotePlayer ${playerId} rendering with playerType: ${playerType || 'undefined'}`);
  }
  
  const [combatFlinchUntil, setCombatFlinchUntil] = useState(0);
  const [combatHidden, setCombatHidden] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hit = (event: Event) => {
      if ((event as CustomEvent).detail?.playerId !== playerId) return;
      if (adventureAvatar === 'astronaut') setCombatFlinchUntil(Date.now() + 350);
      else { setCombatHidden(true); if (timer) clearTimeout(timer); timer = setTimeout(() => setCombatHidden(false), 1400); }
    };
    window.addEventListener('jackalopes:adventure-hit', hit);
    return () => { window.removeEventListener('jackalopes:adventure-hit', hit); if (timer) clearTimeout(timer); setCombatHidden(false); };
  }, [playerId, adventureAvatar]);
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const mercRigidBodyRef = useRef<any>(null);
  const mercSmoothedPos = useRef(new THREE.Vector3(position?.x || 0, position?.y || 0, position?.z || 0));
  const spotlightRef = useRef<THREE.SpotLight>(null);
  const spotlightTargetRef = useRef<THREE.Object3D>(null);
  const flashlightGroupRef = useRef<THREE.Group>(null);
  const flashlightGlowRef = useRef<THREE.Mesh>(null); // Visible glow source for the flashlight
  const flashlightPointLightRef = useRef<THREE.PointLight>(null); // Point light for fog penetration
  const droneGroupRef = useRef<THREE.Group>(null);
  const thermalGroupRef = useRef<THREE.Group>(null);
  const lastAnimationChangeTime = useRef<number>(Date.now());
  const pendingAnimationChange = useRef<string | null>(null);
  const lastPosition = useRef<THREE.Vector3 | null>(null);
  const lastMoveTimestamp = useRef<number>(Date.now());
  const currentAnimation = useRef("idle"); // Default to idle
  
  // Add ref to track when to log flashlight debug info
  const lastFlashlightLogTime = useRef<number>(0);
  
  // Add reference for smooth rotation
  const currentRotation = useRef<number>(rotation || 0);

  // Read live data directly from the shared ref store (bypasses React re-renders)
  // Falls back to props if store isn't available yet
  const latestPositionRef = useRef<typeof position>(position);
  const latestRotationRef = useRef<number>(rotation || 0);
  const latestCameraPitchRef = useRef<number>(cameraPitch);
  const latestIsMovingRef = useRef<boolean>(isMoving || false);
  const latestIsRunningRef = useRef<boolean>(isRunning || false);
  const latestFlashlightRef = useRef<boolean>(flashlightOn || false);
  const latestDroneActiveRef = useRef<boolean>(droneActive || false);
  const latestDronePositionRef = useRef<{ x: number, y: number, z: number } | undefined>(dronePosition);
  const latestDroneRotationRef = useRef<number>(droneRotation || 0);
  const latestDroneThermalRef = useRef<boolean>(droneThermalActive || false);

  // Sync from live store every render (synchronous, before useFrame)
  const liveStore = (window as any).__livePlayerData;
  const live = liveStore?.[playerId];
  if (live) {
    latestPositionRef.current = live.position;
    latestRotationRef.current = live.rotation;
    latestCameraPitchRef.current = live.cameraPitch;
    latestIsMovingRef.current = live.isMoving;
    latestIsRunningRef.current = live.isRunning;
    latestFlashlightRef.current = live.flashlightOn;
    latestDroneActiveRef.current = live.droneActive || false;
    latestDronePositionRef.current = live.dronePosition;
    latestDroneRotationRef.current = live.droneRotation || 0;
    latestDroneThermalRef.current = live.droneThermalActive || false;
  } else {
    latestPositionRef.current = position;
    latestRotationRef.current = rotation || 0;
    latestCameraPitchRef.current = cameraPitch;
    latestIsMovingRef.current = isMoving || false;
    latestIsRunningRef.current = isRunning || false;
    latestFlashlightRef.current = flashlightOn || false;
    latestDroneActiveRef.current = droneActive || false;
    latestDronePositionRef.current = dronePosition;
    latestDroneRotationRef.current = droneRotation || 0;
    latestDroneThermalRef.current = droneThermalActive || false;
  }
  
  const MIN_ANIMATION_CHANGE_INTERVAL = 200; // ms
  
  // Inside the RemotePlayer component, add better error handling
  // Add a state to track model loading errors
  const [modelError, setModelError] = useState(false);
  
  // Add effect for flashlight rotation debugging
  useEffect(() => {
    if (playerType === 'merc' && flashlightOn && rotation !== undefined && Math.random() < 0.05) {
      console.log(`🔦 Flashlight rotation: ${rotation?.toFixed(2)}, sin=${Math.sin(rotation || 0).toFixed(2)}, cos=${Math.cos(rotation || 0).toFixed(2)}`);
    }
  }, [rotation, flashlightOn, playerType]);
  
  // Determine player color based on type
  const playerColor = useMemo(() => {
    return playerType === 'merc' ? 'red' : 'blue';
  }, [playerType]);
  
  // Create a fallback model if needed
  const createFallbackModel = useCallback(() => {
    const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
    const material = new THREE.MeshStandardMaterial({ 
      color: playerColor,
      roughness: 0.7,
      metalness: 0.3
    });
    return new THREE.Mesh(geometry, material);
  }, [playerColor]);
  
  // Get local state for animation scheduling
  const [localIsMoving, setLocalIsMoving] = useState(isMoving || false);
  const [localIsRunning, setLocalIsRunning] = useState(isRunning || false);
  
  // Log every state update to debug movement sound issues
  useEffect(() => {
    if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
      log.player(`RemotePlayer ${playerId} received props update: ${JSON.stringify({ 
        isMoving, 
        isRunning, 
        isShooting,
        localIsMoving,
        localIsRunning
      })}`);
    }
  }, [isMoving, isRunning, isShooting, localIsMoving, localIsRunning, playerId]);
  
  // Sync movement state from live store (bypasses React props entirely)
  // Polls at ~15hz via useFrame to avoid re-render storms
  // CRITICAL: Must read from __livePlayerData INSIDE useFrame because React.memo blocks re-renders
  const lastMovementSyncTime = useRef(0);
  useFrame(() => {
    const now = Date.now();
    if (now - lastMovementSyncTime.current < 66) return; // ~15hz
    lastMovementSyncTime.current = now;

    // Read live store INSIDE useFrame (component is memoized, render-time sync only runs once)
    const moveLive = (window as any).__livePlayerData?.[playerId];
    const liveMoving = moveLive?.isMoving ?? false;
    const liveRunning = moveLive?.isRunning ?? false;

    // Also update the refs for other useFrame hooks that might need them
    if (moveLive) {
      latestIsMovingRef.current = liveMoving;
      latestIsRunningRef.current = liveRunning;
    }

    if (liveMoving !== localIsMoving || liveRunning !== localIsRunning) {
      const timeSinceLastChange = now - lastAnimationChangeTime.current;
      if (timeSinceLastChange >= 300) {
        setLocalIsMoving(liveMoving);
        setLocalIsRunning(liveRunning);
        lastAnimationChangeTime.current = now;
      }
    }
  });

  // Force re-check movement state when props change (fallback)
  useEffect(() => {
    // Add hysteresis to prevent rapid toggling between states
    const now = Date.now();
    const timeSinceLastChange = now - lastAnimationChangeTime.current;
    const MIN_STATE_CHANGE_INTERVAL = 500; // Require 500ms between state changes
    
    // If it's too soon for another state change, ignore this update
    if (timeSinceLastChange < MIN_STATE_CHANGE_INTERVAL) {
      if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
        log.player(`${playerId}: Ignoring movement state change - too frequent (${timeSinceLastChange}ms)`);
      }
      return;
    }
    
    // Don't let walking and running both be true at the same time
    if (isMoving === true && isRunning === true) {
      // Running takes precedence
      if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
        log.player(`${playerId}: Both moving and running flags are true - setting to RUNNING`);
      }
      setLocalIsMoving(true);
      setLocalIsRunning(true);
      lastAnimationChangeTime.current = now;
    } else if (isMoving === true && isRunning !== true) {
      // Walking only - make sure isRunning is explicitly FALSE
      if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
        log.player(`${playerId}: Moving=true, Running!=true - setting to WALKING`);
      }
      setLocalIsMoving(true);
      setLocalIsRunning(false);
      lastAnimationChangeTime.current = now;
    } else if (isMoving === false) {
      // Not moving - stop all movement
      if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
        log.player(`${playerId}: Moving=false - setting to STOPPED`);
      }
      setLocalIsMoving(false);
      setLocalIsRunning(false);
      lastAnimationChangeTime.current = now;
    }
  }, [isMoving, isRunning, playerId]);
  
  // Calculate local walking and running state properly
  const walkingOnly = localIsMoving && !localIsRunning;
  const running = localIsRunning;
  
  // Log changes in the calculated audio states
  useEffect(() => {
    if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
      log.player(`${playerId} audio states calculated: ${JSON.stringify({
        walkingOnly,
        running,
        shouldPlayWalkSound: walkingOnly,
        shouldPlayRunSound: running,
      })}`);
    }
  }, [walkingOnly, running, playerId]);
  
  // Update local isMoving state when the prop changes, with rate limiting
  useEffect(() => {
    if (isMoving !== undefined) {
      const now = Date.now();
      const timeSinceLastChange = now - lastAnimationChangeTime.current;
      
      if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
        log.player(`RemotePlayer ${playerId} movement state update: isMoving=${isMoving}, isRunning=${isRunning}`);
      }
      
      // Apply rate limiting to prevent animation flicker
      if (timeSinceLastChange < MIN_ANIMATION_CHANGE_INTERVAL) {
        // Too soon for another animation change, store it as pending
        pendingAnimationChange.current = isMoving ? "walk" : "idle";
        if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
          log.player(`Animation change too frequent for ${playerId}, queueing ${pendingAnimationChange.current}`);
        }
      } else {
        // Apply animation change immediately
        setLocalIsMoving(isMoving);
        currentAnimation.current = isMoving ? "walk" : "idle";
        lastAnimationChangeTime.current = now;
        if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
          log.player(`Remote player ${playerId} animation set to ${isMoving ? "walk" : "idle"} from props`);
        }
      }
    }
    
    // Update running state
    if (isRunning !== undefined) {
      setLocalIsRunning(isRunning);
      if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
        log.player(`RemotePlayer ${playerId} running state set to ${isRunning}`);
      }
    }
  }, [isMoving, isRunning, playerId]);
  
  // Add debug output to monitor state changes
  useEffect(() => {
    if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
      log.player(`RemotePlayer ${playerId} state updated: localIsMoving=${localIsMoving}, localIsRunning=${localIsRunning}`);
    }
  }, [localIsMoving, localIsRunning, playerId]);
  
  // Apply any pending animation changes
  useFrame((_, delta) => {
    // Check if there's a pending animation change and enough time has passed
    if (pendingAnimationChange.current !== null) {
      const now = Date.now();
      const timeSinceLastChange = now - lastAnimationChangeTime.current;
      
      if (timeSinceLastChange >= MIN_ANIMATION_CHANGE_INTERVAL) {
        // Apply the pending animation change
        const newAnim = pendingAnimationChange.current;
        setLocalIsMoving(newAnim === "walk");
        currentAnimation.current = newAnim;
        lastAnimationChangeTime.current = now;
        pendingAnimationChange.current = null;
        if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
          log.player(`Applied pending animation change for ${playerId}: ${newAnim}`);
        }
      }
    }
    
    if (!meshRef.current) return;
    
    const position = latestPositionRef.current;
    const rotation = latestRotationRef.current;

    // Safely update position with error checking
    if (position && typeof position.x === 'number' && 
        typeof position.y === 'number' && 
        typeof position.z === 'number') {
      
      // Set initial last position if undefined
      if (!lastPosition.current) {
        lastPosition.current = new THREE.Vector3(position.x, position.y, position.z);
      }
      
      // Create current position vector for comparison
      const currentPos = new THREE.Vector3(position.x, position.y, position.z);
      
      // IMPROVED POSITION INTERPOLATION
      // Get current mesh position
      const meshPos = meshRef.current.position;
      
      // Calculate the distance to the target position
      const distanceToTarget = meshPos.distanceTo(currentPos);
      
      // Determine interpolation speed based on distance
      // Faster interpolation when further away to catch up quickly
      let moveSpeed;
      if (distanceToTarget > 5) {
        // Very far behind - snap to position
        moveSpeed = 1.0;
      } else if (distanceToTarget > 2) {
        // Far behind - catch up quickly
        moveSpeed = Math.min(1, delta * 15);
      } else if (distanceToTarget > 0.5) {
        // Medium distance - moderate catch-up
        moveSpeed = Math.min(1, delta * 8);
      } else {
        // Close - smooth movement
        moveSpeed = Math.min(1, delta * 6);
      }
      
      // Apply interpolation - faster than before to reduce lag
      meshPos.lerp(currentPos, moveSpeed);
      
      // Only check for movement when isMoving is undefined (fallback to local detection)
      if (lastPosition.current && isMoving === undefined) {
        const distance = lastPosition.current.distanceTo(currentPos);
        const now = Date.now();
        const timeDelta = Math.min((now - lastMoveTimestamp.current) / 1000, 1);
        lastMoveTimestamp.current = now;
        
        // Calculate speed for determining running vs walking
        const speed = distance / timeDelta;
        
        // Add state transition debouncing
        const MIN_STATE_CHANGE_TIME = 300; // ms
        const timeSinceLastStateChange = now - lastAnimationChangeTime.current;
        const canChangeState = timeSinceLastStateChange > MIN_STATE_CHANGE_TIME;
        
        // If player moved more than a threshold, set state to moving
        // Using a higher threshold (0.03) to avoid micro-movements
        if (distance > 0.03) {
          if (!localIsMoving && canChangeState) {
            setLocalIsMoving(true);
            currentAnimation.current = "walk";
            lastAnimationChangeTime.current = now;
            if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
              log.player(`Remote player ${playerId} started moving: ${distance.toFixed(4)} at speed ${speed.toFixed(2)}`);
            }
          }
          
          // Check if player is running based on speed with higher threshold
          // Increase running threshold to 8.0 to match what's mentioned in SPATIALAUDIO.md
          if (speed > 8.0 && !localIsRunning && canChangeState) {
            setLocalIsRunning(true);
            lastAnimationChangeTime.current = now;
            if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
              log.player(`Remote player ${playerId} is now running at speed ${speed.toFixed(2)}`);
            }
          } else if (speed < 6.0 && localIsRunning && canChangeState) {
            // Use a lower threshold for turning off running (hysteresis)
            setLocalIsRunning(false);
            lastAnimationChangeTime.current = now;
            if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
              log.player(`Remote player ${playerId} is now walking at speed ${speed.toFixed(2)}`);
            }
          }
        } else {
          // If player has stopped moving for a while, set state to idle
          if (localIsMoving && canChangeState) {
            setLocalIsMoving(false);
            setLocalIsRunning(false);
            currentAnimation.current = "idle";
            lastAnimationChangeTime.current = now;
            if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
              log.player(`Remote player ${playerId} stopped moving: ${distance.toFixed(4)}`);
            }
          }
        }
      }
      
      // Update last position - but use the target position to track actual movement
      lastPosition.current.copy(currentPos);
    }
    
    // IMPROVED ROTATION HANDLING - much more stable now
    // We're now getting normalized rotation values from EntityStateObserver
    if (rotation !== undefined && rotation !== null) {
      // Since rotation is now consistently a single value (yaw angle in radians),
      // we can directly apply it to the Y axis rotation
      const targetRotation = playerType === 'jackalope' ? rotation + Math.PI : rotation;
      
      // Smoothly interpolate to the target rotation with angle wrapping
      const rotationSpeed = Math.min(delta * 15, 0.5);
      
      // Angle-wrap aware interpolation to avoid spinning the long way around
      let rotDiff = targetRotation - meshRef.current.rotation.y;
      while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
      while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
      meshRef.current.rotation.y += rotDiff * rotationSpeed;
    }
  });

  // Update merc RigidBody kinematically from live store (Bug 2 fix)
  useFrame((_, delta) => {
    if (playerType !== 'merc' || !mercRigidBodyRef.current) return;

    // Read live store INSIDE useFrame (component is memoized, render-time sync only runs once)
    const mLive = (window as any).__livePlayerData?.[playerId];
    if (mLive) {
      latestPositionRef.current = mLive.position;
      latestRotationRef.current = mLive.rotation;
    }

    const pos = latestPositionRef.current;
    const rot = latestRotationRef.current;
    if (!pos) return;

    // Smooth position interpolation
    const targetPos = new THREE.Vector3(pos.x, pos.y - 1.6, pos.z);
    const dist = mercSmoothedPos.current.distanceTo(targetPos);
    let speed: number;
    if (dist > 5) speed = 1.0;
    else if (dist > 2) speed = Math.min(1, delta * 15);
    else if (dist > 0.1) speed = Math.min(1, delta * 10);
    else speed = Math.min(1, delta * 8);
    mercSmoothedPos.current.lerp(targetPos, speed);
    mercRigidBodyRef.current.setNextKinematicTranslation({
      x: mercSmoothedPos.current.x,
      y: mercSmoothedPos.current.y,
      z: mercSmoothedPos.current.z
    });

    // Smooth rotation with angle wrapping
    const targetRot = rot || 0;
    let rotDiff = targetRot - currentRotation.current;
    while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
    while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
    currentRotation.current += rotDiff * Math.min(delta * 15, 0.5);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentRotation.current);
    mercRigidBodyRef.current.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
  });

  // Initialize flashlight when component mounts or flashlight state changes
  useEffect(() => {
    if (playerType === 'merc' && flashlightOn) {
      // Ensure refs are available in the next frame
      requestAnimationFrame(() => {
        const pos = latestPositionRef.current;
        const rot = latestRotationRef.current;
        if (spotlightRef.current && spotlightTargetRef.current && pos) {
          const normalizedRotation = (rot % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          const dirX = Math.sin(normalizedRotation);
          const dirZ = Math.cos(normalizedRotation);
          spotlightTargetRef.current.position.set(
            pos.x + dirX * 30,
            pos.y - 2,
            pos.z + dirZ * 30
          );
          spotlightTargetRef.current.updateMatrixWorld();
          spotlightRef.current.target = spotlightTargetRef.current;
        }
      });
    }
  }, [playerType, flashlightOn, playerId]);

  // Update remote flashlight position in world space each frame
  useFrame(() => {
    if (playerType !== 'merc' || !spotlightRef.current || !spotlightTargetRef.current) {
      return;
    }

    // Read live store inside useFrame for fresh data (component is memoized, props don't update)
    const fLive = (window as any).__livePlayerData?.[playerId];
    if (fLive) {
      latestPositionRef.current = fLive.position;
      latestRotationRef.current = fLive.rotation;
      latestCameraPitchRef.current = fLive.cameraPitch;
      latestFlashlightRef.current = fLive.flashlightOn;
      latestDroneActiveRef.current = fLive.droneActive || false;
      latestDronePositionRef.current = fLive.dronePosition;
      latestDroneRotationRef.current = fLive.droneRotation || 0;
      latestDroneThermalRef.current = fLive.droneThermalActive || false;
    }

    const isFlashlightOn = latestFlashlightRef.current;

    // Control flashlight intensity based on state (since we can't conditionally render due to React.memo)
    spotlightRef.current.intensity = isFlashlightOn ? 40 : 0;

    // Control glow visibility - scale to 0 when off, normal when on
    if (flashlightGlowRef.current) {
      const glowScale = isFlashlightOn ? 1 : 0;
      flashlightGlowRef.current.scale.setScalar(glowScale);
    }

    // Control point light intensity for fog visibility
    if (flashlightPointLightRef.current) {
      flashlightPointLightRef.current.intensity = isFlashlightOn ? 8 : 0;
    }

    // Only update position if flashlight is on
    if (!isFlashlightOn) return;

    const pos = latestPositionRef.current;
    const yaw = latestRotationRef.current;
    const pitch = latestCameraPitchRef.current;

    if (!pos) return;

    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);

    // Position light at player's chest/gun height (world space)
    const lightHeight = pos.y + 6;
    const glowX = pos.x + dirX * 1;
    const glowZ = pos.z + dirZ * 1;

    spotlightRef.current.position.set(glowX, lightHeight, glowZ);

    // Position the visible glow source and point light at the same location as the spotlight
    if (flashlightGlowRef.current) {
      flashlightGlowRef.current.position.set(glowX, lightHeight, glowZ);
    }
    if (flashlightPointLightRef.current) {
      flashlightPointLightRef.current.position.set(glowX, lightHeight, glowZ);
    }

    // Use cameraPitch for vertical aiming
    // pitch > 0 = looking down, pitch < 0 = looking up
    const targetDist = 20;
    const verticalOffset = -Math.sin(pitch) * targetDist;
    spotlightTargetRef.current.position.set(
      pos.x + dirX * targetDist,
      lightHeight + verticalOffset,
      pos.z + dirZ * targetDist
    );
    spotlightTargetRef.current.updateMatrixWorld();
    spotlightRef.current.target = spotlightTargetRef.current;

    if (droneGroupRef.current) {
      const hasDronePosition = !!latestDronePositionRef.current;
      droneGroupRef.current.visible = hasDronePosition;
      if (hasDronePosition && latestDronePositionRef.current) {
        droneGroupRef.current.position.set(
          latestDronePositionRef.current.x,
          latestDronePositionRef.current.y,
          latestDronePositionRef.current.z
        );
        droneGroupRef.current.rotation.set(0, latestDroneRotationRef.current, 0);
      }
    }

    if (thermalGroupRef.current) {
      thermalGroupRef.current.visible = !!window.jackalopesGame?.droneThermalActive;
      const thermalPos = latestPositionRef.current;
      if (thermalPos) {
        thermalGroupRef.current.position.set(thermalPos.x, thermalPos.y, thermalPos.z);
      }
    }
  });

  // Common component for all player types with explicit states
  const audioComponent = (
    <RemotePlayerAudio
      playerId={playerId}
      position={position} 
      isWalking={walkingOnly}
      isRunning={running}
      isShooting={isShooting}
      playerType={playerType}
    />
  );

  // Update the getFallbackModel function to use the correct window typing
  const getFallbackModel = (type: 'merc' | 'jackalope'): THREE.Object3D => {
    // 1. Try to get from window.__fallbackModels
    const color = type === 'merc' ? 'red' : 'blue';
    if (typeof window !== 'undefined' && window.__fallbackModels && window.__fallbackModels[color]) {
      console.log(`Using global fallback model for ${type}`);
      return window.__fallbackModels[color].clone();
    }
    
    // 2. Create one on the fly if not available
    console.log(`Creating on-demand fallback for ${type}`);
    const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
    const material = new THREE.MeshStandardMaterial({ 
      color: type === 'merc' ? 0xff0000 : 0x0000ff,
      roughness: 0.7,
      metalness: 0.3
    });
    
    return new THREE.Mesh(geometry, material);
  };

  // For merc type, use the MercModel
  if (playerType === 'merc') {
    return (
      <>
        <RigidBody 
          ref={mercRigidBodyRef}
          type="kinematicPosition" 
          position={position ? [position.x, position.y - 1.6, position.z] : [0, -1.6, 0]}
          rotation={[0, rotation || 0, 0]}
          colliders={false}
          name={`remote-merc-${playerId}`}
          userData={{ isMerc: true, playerId }}
          friction={1}
          sensor={false}
          includeInvisible={true}
          ccd={true}
          collisionGroups={0xFFFFFFFF}
        >
          {/* Keep merc hit volumes tight so jackalopes can actually close distance. */}
          <CapsuleCollider args={[3.9, 1.25]} position={[0, 4.2, 0]} sensor={true} />
          
          {/* Add a smaller torso box for reliable hit registration without the old force field. */}
          <CuboidCollider args={[1.5, 3.9, 1.5]} position={[0, 4.2, 0]} sensor={true} />
          
          {/* Add a tighter head collider */}
          <BallCollider args={[1.35]} position={[0, 9.4, 0]} sensor={true} />
          
          {/* Use primitive for the model */}
          <MercModel 
            position={[0, 0, 0]} 
            rotation={[0, 0, 0]} 
            scale={[5, 5, 5]}
            animation={localIsRunning ? 'run' : localIsMoving ? 'walk' : 'idle'}
            thermalActive={!!window.jackalopesGame?.droneThermalActive}
          />
          
        </RigidBody>
        {/* Remote player flashlight - always render the group, control visibility via intensity
            This is needed because React.memo blocks re-renders, so we can't conditionally render based on props.
            Instead, we keep the spotlight mounted and the useFrame hook controls its intensity. */}
        <group position={[0,0,0]}>
          <spotLight
            ref={spotlightRef}
            color={0xffffdd}
            intensity={0}
            distance={80}
            angle={0.7}
            penumbra={0.5}
            decay={1.2}
            castShadow={false}
          />
          <object3D ref={spotlightTargetRef} />
        </group>
        {/* Visible flashlight glow source - jackalopes can see this from a distance in the fog */}
        <mesh ref={flashlightGlowRef} scale={0}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshBasicMaterial
            color={0xffffcc}
            transparent
            opacity={0.9}
          />
        </mesh>
        {/* Add a point light at the glow position for extra visibility through fog */}
        <pointLight
          ref={flashlightPointLightRef}
          color={0xffffaa}
          intensity={0}
          distance={20}
          decay={1.5}
        />
        <PlayerMarker playerId={playerId} playerType="merc" position={position} height={10} />
        {/* Add spatial audio for remote merc player */}
        {audioComponent}
        <group ref={thermalGroupRef} visible={false} />
        <group ref={droneGroupRef} visible={false}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.82, 0.24, 0.58]} />
              <meshStandardMaterial color="#1f2937" metalness={0.45} roughness={0.28} emissive="#0ea5e9" emissiveIntensity={0.25} />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
              <boxGeometry args={[1.45, 0.04, 0.08]} />
              <meshStandardMaterial color="#67e8f9" emissive="#0ea5e9" emissiveIntensity={0.6} />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 0.08, 0]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[1.15, 0.04, 0.08]} />
              <meshStandardMaterial color="#67e8f9" emissive="#0ea5e9" emissiveIntensity={0.6} />
            </mesh>
            {[
              [0.55, 0.1, 0.42],
              [-0.55, 0.1, 0.42],
              [0.55, 0.1, -0.42],
              [-0.55, 0.1, -0.42],
            ].map((propPos, index) => (
              <group key={index} position={propPos as [number, number, number]}>
                <mesh castShadow receiveShadow>
                  <cylinderGeometry args={[0.06, 0.06, 0.05, 12]} />
                  <meshStandardMaterial color="#111827" metalness={0.55} roughness={0.3} />
                </mesh>
                <mesh rotation={[0, index * 0.3, 0]}>
                  <boxGeometry args={[0.55, 0.015, 0.06]} />
                  <meshBasicMaterial color="#d1fae5" transparent opacity={0.8} toneMapped={false} />
                </mesh>
              </group>
            ))}
            <pointLight color="#7dd3fc" intensity={3.2} distance={14} decay={1.7} />
          </group>
      </>
    );
  }

  // For jackalope type, use the new JackalopeModel
  if (playerType === 'jackalope') {
    // Debug output occasionally to help diagnose position issues
    if (Date.now() % 50000 < 20 && (window.jackalopesGame?.debugLevel || 0) >= 3) {
      log.player(`Remote jackalope position: (${position?.x.toFixed(2)}, ${position?.y.toFixed(2)}, ${position?.z.toFixed(2)}), rotation: ${rotation?.toFixed(2)}`);
    }
    
    // Track attached projectiles with a ref
    const [attachedProjectiles, setAttachedProjectiles] = useState<{id: string, position: THREE.Vector3}[]>([]);
    const attachedProjectilesRef = useRef<{id: string, position: THREE.Vector3}[]>([]);
    const rigidBodyRef = useRef<any>(null);
    const jackalopeModelGroupRef = useRef<THREE.Group>(null);
    
    // Refs to latest prop values — always fresh in useFrame (avoids stale closure lag)
    const jackalopePositionRef = useRef<{ x: number; y: number; z: number } | null>(null);
    const jackalopeRotationRef = useRef<number>(rotation || 0);
    const jackalopeSmoothedPos = useRef(new THREE.Vector3(position?.x || 0, position?.y || 0, position?.z || 0));
    const jackalopeCurrentRotation = useRef(rotation || 0);

    // Mirror from live store (bypasses React props) or fall back to props
    const jackalopeLive = (window as any).__livePlayerData?.[playerId];
    if (jackalopeLive) {
      jackalopePositionRef.current = jackalopeLive.position;
      jackalopeRotationRef.current = jackalopeLive.rotation;
    } else {
      jackalopePositionRef.current = position && typeof position.x === 'number' ? position : jackalopePositionRef.current;
      jackalopeRotationRef.current = rotation ?? jackalopeRotationRef.current;
    }

    // Interpolate position & rotation for remote jackalope every frame
    useFrame((_, delta) => {
      if (!rigidBodyRef.current) return;

      // Read live store INSIDE useFrame (component is memoized, render-time sync only runs once)
      const jLive = (window as any).__livePlayerData?.[playerId];
      if (jLive) {
        jackalopePositionRef.current = jLive.position;
        jackalopeRotationRef.current = jLive.rotation;
      }

      const latestPos = jackalopePositionRef.current;
      if (!latestPos) return;

      const targetPos = new THREE.Vector3(latestPos.x, latestPos.y, latestPos.z);
      const dist = jackalopeSmoothedPos.current.distanceTo(targetPos);

      // Aggressive lerp — prioritise low latency over buttery smoothness
      let speed: number;
      if (dist > 5) speed = 1.0;                           // Snap
      else if (dist > 2) speed = Math.min(1, delta * 20);
      else if (dist > 0.1) speed = Math.min(1, delta * 15);
      else speed = Math.min(1, delta * 12);

      jackalopeSmoothedPos.current.lerp(targetPos, speed);
      rigidBodyRef.current.setNextKinematicTranslation(
        { x: jackalopeSmoothedPos.current.x, y: jackalopeSmoothedPos.current.y, z: jackalopeSmoothedPos.current.z }
      );

      // Smooth rotation with angle wrapping (Bug 3 fix)
      const targetRot = jackalopeRotationRef.current + Math.PI;
      const rotSpeed = Math.min(delta * 20, 0.5);
      let jRotDiff = targetRot - jackalopeCurrentRotation.current;
      while (jRotDiff > Math.PI) jRotDiff -= 2 * Math.PI;
      while (jRotDiff < -Math.PI) jRotDiff += 2 * Math.PI;
      jackalopeCurrentRotation.current += jRotDiff * rotSpeed;
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), jackalopeCurrentRotation.current);
      rigidBodyRef.current.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });

      // Update model group in world space — OUTSIDE the RigidBody, matching local jackalope exactly
      // Local: group position = [physicsX, physicsY - 0.65, physicsZ], rotation = current + PI
      if (jackalopeModelGroupRef.current) {
        jackalopeModelGroupRef.current.position.set(
          jackalopeSmoothedPos.current.x,
          jackalopeSmoothedPos.current.y - 2.15,
          jackalopeSmoothedPos.current.z
        );
        jackalopeModelGroupRef.current.rotation.set(0, jackalopeCurrentRotation.current, 0);
      }
    });

    // Add state for managing hit and respawn
    const [isHit, setIsHit] = useState(false);
    const [isRespawning, setIsRespawning] = useState(false);
    const [isInvulnerable, setIsInvulnerable] = useState(false);
    const invulnerableTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Function to handle when a jackalope is hit by a projectile
    const handleJackalopeHit = useCallback((projectileId: string, shooterId: string): boolean => {
      // Only process if not already hit or invulnerable
      if (isHit || isRespawning || isInvulnerable) {
        console.log(`[RemotePlayer] Jackalope ${playerId} already hit or invulnerable - skipping hit`);
        return false;
      }
      
      console.log(`[RemotePlayer] Jackalope ${playerId} hit by projectile ${projectileId} from ${shooterId}`);
      
      // Set a specific flag for this jackalope that was hit
      window.__lastHitJackalope = playerId;
      console.log(`[RemotePlayer] Setting last hit jackalope to ${playerId}`);
      
      // Check if this jackalope has already been scored for and clear it if needed
      try {
        const scoredJackalopesStr = localStorage.getItem('scored_jackalopes');
        if (scoredJackalopesStr) {
          const scoredJackalopes = JSON.parse(scoredJackalopesStr);
          if (Array.isArray(scoredJackalopes) && scoredJackalopes.includes(playerId)) {
            console.log(`[RemotePlayer] Jackalope ${playerId} already scored - removing from tracking to allow scoring on respawn`);
            // Don't block the scoring, just log the data
          }
        }
      } catch (err) {
        console.error('[RemotePlayer] Error checking scored jackalopes:', err);
      }
      
      // Set hit state to trigger vanishing effect
      setIsHit(true);
      
      // Trigger a scoring event for the merc who hit the jackalope
      try {
        // Dispatch a custom event to update the merc's score
        const scoringEvent = new CustomEvent('merc_scored', {
          detail: { 
            mercId: shooterId, 
            jackalopeId: playerId,
            shotId: projectileId,
            timestamp: Date.now()
          }
        });
        window.dispatchEvent(scoringEvent);
        console.log(`🎯 Dispatched scoring event for merc ${shooterId} hitting jackalope ${playerId}`);
      } catch (err) {
        console.error('Error dispatching merc scoring event:', err);
      }
      
      // Play hit sound
      try {
        const hitSound = new Audio('/audio/jackalope-hit.mp3');
        hitSound.play().catch(err => console.error('Error playing hit sound:', err));
      } catch (err) {
        console.error('Error playing hit sound:', err);
      }
      
      // Create particles at position before vanishing
      if (typeof window !== 'undefined' && window.__createExplosionEffect && position) {
        try {
          window.__createExplosionEffect(
            new THREE.Vector3(position.x, position.y, position.z),
            '#4682B4', // Blue color for Jackalope
            30, // More particles for a bigger effect
            0.3 // Larger explosion radius
          );
        } catch (err) {
          console.error('Error creating explosion effect:', err);
        }
      }
      
      // After a short delay, trigger respawn
      setTimeout(() => {
        setIsHit(false);
        setIsRespawning(true);
        
        // Tell the server we need to respawn this jackalope
        if (typeof window !== 'undefined') {
          // Check if this jackalope was the last one hit to prevent multiple respawns
          if (window.__lastHitJackalope === playerId) {
            if (window.__networkManager) {
              console.log(`[RemotePlayer] Sending respawn request for jackalope: ${playerId}`);
              try {
                // Add detailed info about target
                console.log(`Hit detection: Jackalope ${playerId} was hit`);
                
                // Create a spawn position for respawn
                const spawnPosition: [number, number, number] = [-100, 3, 10];
                window.__networkManager.sendRespawnRequest(playerId, spawnPosition);
              } catch (error: any) {
                console.error(`[RemotePlayer] Error sending respawn request: ${error.message}`);
              }
            } else if (window.connectionManager) {
              // Fallback to connectionManager global if __networkManager isn't available
              console.log(`[RemotePlayer] Using connectionManager fallback for respawn request: ${playerId}`);
              try {
                // Add detailed info about target
                console.log(`Hit detection: Jackalope ${playerId} was hit`);
                
                // Create a spawn position for respawn
                const spawnPosition: [number, number, number] = [-100, 3, 10];
                window.connectionManager.sendRespawnRequest(playerId, spawnPosition);
              } catch (error: any) {
                console.error(`[RemotePlayer] Error sending respawn via connectionManager: ${error.message}`);
              }
            } else {
              console.error(`[RemotePlayer] Cannot send respawn request: no network manager available!`);
            }
            
            // Clear the flag after we've handled this jackalope's respawn
            window.__lastHitJackalope = undefined;
          } else {
            console.log(`[RemotePlayer] Skipping respawn request for ${playerId} as it was not the last hit jackalope (${window.__lastHitJackalope || 'none'})`);
          }
        }
        
        // For demo/testing, we'll just simulate a respawn after a delay
        // In production, the server would tell us where to respawn
        setTimeout(() => {
          setIsRespawning(false);
          setIsInvulnerable(true);
          
          // Give temporary invulnerability
          if (invulnerableTimeoutRef.current) {
            clearTimeout(invulnerableTimeoutRef.current);
          }
          
          invulnerableTimeoutRef.current = setTimeout(() => {
            setIsInvulnerable(false);
            invulnerableTimeoutRef.current = null;
          }, 3000); // 3 seconds of invulnerability
          
          // Create spawn effect at new position
          if (typeof window !== 'undefined' && window.__createSpawnEffect && position) {
            try {
              window.__createSpawnEffect(
                new THREE.Vector3(position.x, position.y, position.z),
                '#4682B4', // Blue color for Jackalope
                20, // Particles for spawn effect
                0.2 // Radius
              );
            } catch (err) {
              console.error('Error creating spawn effect:', err);
            }
          }
        }, 1500); // 1.5 seconds "dead" before respawning
      }, 200); // Short delay to allow the hit effect to be seen
      
      return true;
    }, [playerId, position, isHit, isRespawning, isInvulnerable]);
    
    // Expose the hit handler function to window so projectiles can trigger it
    useEffect(() => {
      if (typeof window !== 'undefined') {
        if (!window.__jackalopeHitHandlers) {
          window.__jackalopeHitHandlers = {};
        }
        window.__jackalopeHitHandlers[playerId] = handleJackalopeHit;
      }
      
      return () => {
        if (typeof window !== 'undefined' && window.__jackalopeHitHandlers) {
          delete window.__jackalopeHitHandlers[playerId];
        }
      };
    }, [playerId, handleJackalopeHit]);
    
    // Respawn position update listener
    useEffect(() => {
      // Check if this player's entity is marked as respawning in the EntityStateObserver
      const checkForRespawnEvent = () => {
        const entity = entityStateObserver.getEntity(playerId);
        if (entity?.isRespawning && !isRespawning && !isHit) {
          console.log(`🔄 Detected respawn flag for jackalope ${playerId}`);
          
          // Process respawn
          setIsHit(true);
          
          // Create explosion effect at current position
          if (typeof window !== 'undefined' && window.__createExplosionEffect && position) {
            window.__createExplosionEffect(
              new THREE.Vector3(position.x, position.y, position.z),
              '#4682B4', // Blue color for Jackalope
              30, // More particles for a bigger effect
              0.3 // Larger explosion radius
            );
          }
          
          // After a short delay, trigger respawn
          setTimeout(() => {
            setIsHit(false);
            setIsRespawning(true);
            
            // For demo/testing, we'll just simulate a respawn after a delay
            setTimeout(() => {
              // IMPORTANT: Get updated position from entity state
              const updatedEntity = entityStateObserver.getEntity(playerId);
              
              // Get position for respawn
              let newX = position?.x || 0;
              let newY = position?.y || 0;
              let newZ = position?.z || 0;
              
              if (updatedEntity && updatedEntity.position) {
                // Use spawn position from entity state if available
                console.log(`🔄 Using respawn position from entity: [${updatedEntity.position.join(', ')}]`);
                newX = updatedEntity.position[0];
                newY = updatedEntity.position[1];
                newZ = updatedEntity.position[2];
              } else {
                console.log(`🔄 No updated position in entity, using default respawn position`);
              }
              
              // Clear respawning state
              setIsRespawning(false);
              setIsInvulnerable(true);
              
              // Give temporary invulnerability
              if (invulnerableTimeoutRef.current) {
                clearTimeout(invulnerableTimeoutRef.current);
              }
              
              invulnerableTimeoutRef.current = setTimeout(() => {
                setIsInvulnerable(false);
                invulnerableTimeoutRef.current = null;
              }, 3000); // 3 seconds of invulnerability
              
              // Create spawn effect at new position
              if (typeof window !== 'undefined' && window.__createSpawnEffect) {
                window.__createSpawnEffect(
                  new THREE.Vector3(newX, newY, newZ),
                  '#4682B4', // Blue color for Jackalope
                  20, // Particles for spawn effect
                  0.2 // Radius
                );
              }
            }, 500); // Reduced from 1500ms to 500ms for faster respawn visibility
          }, 200); // Short delay to allow the hit effect to be seen 
        }
      };
      
      // Check on mount and when position changes
      checkForRespawnEvent();
      
      // Create an interval to check periodically
      const intervalId = setInterval(checkForRespawnEvent, 500); // More frequent checks (500ms instead of 1000ms)
      
      return () => clearInterval(intervalId);
    }, [playerId, position, isHit, isRespawning]);
    
    // Function to handle projectile attachments
    const handleAttachProjectile = useCallback((projectileData: {id: string, position: THREE.Vector3}): boolean => {
      // Skip if we're already hit, respawning, or invulnerable
      if (isHit || isRespawning || isInvulnerable) return false;
      
      // Implement the logic to attach a projectile to the jackalope
      // This is a placeholder and should be replaced with the actual implementation
      console.log(`Attaching projectile ${projectileData.id} to jackalope ${playerId}`);
      return true;
    }, [isHit, isRespawning, isInvulnerable, playerId]);
    
    // Clean up timeout on unmount
    useEffect(() => {
      return () => {
        if (invulnerableTimeoutRef.current) {
          clearTimeout(invulnerableTimeoutRef.current);
        }
      };
    }, []);
    
    // Keep ref in sync with state
    useEffect(() => {
      attachedProjectilesRef.current = attachedProjectiles;
    }, [attachedProjectiles]);
    
    // Render the attached projectiles more efficiently
    const renderedProjectiles = useMemo(() => {
      return attachedProjectiles.map(projectile => (
        <group 
          key={projectile.id} 
          position={[
            projectile.position.x - (position?.x || 0), 
            projectile.position.y - (position?.y || 0) - 0.3, 
            projectile.position.z - (position?.z || 0)
          ]}
          name={`attached-projectile-${projectile.id}`}
        >
          <mesh>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial 
              emissive="#ff4500" 
              emissiveIntensity={3} 
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial 
              color="#ff7f00"
              transparent={true}
              opacity={0.6}
              emissive="#ff7f00"
              emissiveIntensity={1.5}
            />
          </mesh>
          {/* Disable point light for performance - use emissive materials instead */}
        </group>
      ));
    }, [attachedProjectiles, position]);
    
    return (
      <>
        <RigidBody 
          ref={rigidBodyRef}
          type="kinematicPosition" 
          position={position ? [position.x, position.y, position.z] : [0, 0, 0]}
          rotation={[0, (rotation || 0) + Math.PI, 0]}
          colliders={false}
          name={`remote-jackalope-${playerId}`}
          userData={{ 
            isJackalope: true, 
            playerId, 
            playerType: 'jackalope', 
            jackalopeId: playerId,
            isHit,
            isRespawning
          }}
          friction={1}
          sensor={false}
          includeInvisible={true}
          ccd={true} // Add continuous collision detection
          collisionGroups={0xFFFFFFFF} // Collide with everything
          restitution={0.1} // Make collisions less bouncy
        >
          {/* Only render mesh contents when not hit/respawning */}
          {!isHit && (
            <>
              {/* Use multiple colliders to ensure good collision detection */}
              {/* Main body collider - enlarged for better hit detection */}
              <CapsuleCollider args={[2.4, 2.0]} position={[0, 1.2, 0]} sensor={false} friction={1} restitution={0.1} />
              
              {/* Add a box collider to ensure hits register */}
              <CuboidCollider args={[2.0, 2.0, 2.0]} position={[0, 1.2, 0]} sensor={false} friction={1} restitution={0.1} />
              
              {/* Add a collider for the head area */}
              <BallCollider args={[1.4]} position={[0, 3.0, 0]} sensor={false} friction={1} restitution={0.1} />
              
              {/* Extra collider to catch projectiles */}
              <BallCollider args={[2.4]} position={[0, 1.6, 0]} sensor={false} friction={1} restitution={0.1} />
              
              {/* Show invulnerability effect when necessary */}
              {isInvulnerable && (
                <mesh>
                  <sphereGeometry args={[3, 32, 32]} />
                  <meshStandardMaterial 
                    color="#4682B4"
                    transparent={true}
                    opacity={0.3}
                    emissive="#4682B4"
                    emissiveIntensity={0.5}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
              
              {/* Render all attached projectiles directly as children of the jackalope */}
              {renderedProjectiles}
            </>
          )}
        </RigidBody>

        {/* Model group OUTSIDE RigidBody — positioned in world space, matching local jackalope */}
        {!isHit && (
          <group
            ref={jackalopeModelGroupRef}
            visible={!combatHidden}
            scale={[2, 2, 2]}
            position={position ? [position.x, position.y - 2.15, position.z] : [0, -2.15, 0]}
            rotation={[0, (rotation || 0) + Math.PI, 0]}
          >
            {adventureAvatar === 'astronaut' ? <group name="remote-adventure-astronaut">
              <MercModel adventureStyle flinchUntil={combatFlinchUntil} animation={localIsRunning ? 'run' : localIsMoving ? 'walk' : 'idle'} scale={[1.8, 1.8, 1.8]} />
            </group> : <JackalopeModel position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]} />}
          </group>
        )}
        
        <PlayerMarker
          playerId={playerId}
          playerType="jackalope"
          position={position}
          height={5}
          visible={!isHit && !isRespawning}
        />
        
        {/* Add spatial audio for remote jackalope player */}
        {!isHit && !isRespawning && audioComponent}
      </>
    );
  }

  // For other player types, use the geometric representation
  const color = useMemo(() => {
    // Generate a consistent color based on the player ID
    if (!playerId) {
      return new THREE.Color('#888888'); // Default gray color if no playerId
    }
    
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
      hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const r = (hash & 0xff0000) >> 16;
    const g = (hash & 0x00ff00) >> 8;
    const b = hash & 0x0000ff;
    
    return new THREE.Color(`rgb(${r}, ${g}, ${b})`);
  }, [playerId]);

  // Fix the useEffect that checks for fallback models
  useEffect(() => {
    // Debug log when component mounts
    console.log(`RemotePlayer ${playerId} mounted with type: ${playerType}`);
    
    // Check if fallback models are available
    if (typeof window !== 'undefined' && window.__fallbackModels) {
      console.log(`Fallback models available: ${Object.keys(window.__fallbackModels).join(', ')}`);
    } else {
      console.warn(`No fallback models available for player ${playerId}`);
    }
    
    return () => {
      console.log(`RemotePlayer ${playerId} unmounting`);
    };
  }, [playerId, playerType]);

  // FALLBACK PATH — if we reach here, playerType didn't match 'merc' or 'jackalope'
  console.warn(`⚠️ RemotePlayer ${playerId} hit FALLBACK renderer! playerType='${playerType}'`);

  return (
    <>
      <group
        ref={groupRef}
        position={[position.x, position.y, position.z]}
        rotation={[0, rotation, 0]}
        name={`remote-player-${playerId}`}
      >
      {/* Debug visuals */}
      {isDebugEnabled(DEBUG_LEVELS.VERBOSE) && (
        <mesh>
          <boxGeometry args={[0.5, 1.8, 0.5]} />
          <meshBasicMaterial wireframe color={playerType === 'jackalope' ? "blue" : "red"} />
        </mesh>
      )}
      
      {/* The actual character model */}
      <mesh
        ref={meshRef}
        position={[0, playerType === 'jackalope' ? -0.9 : 0, 0]}
        scale={playerType === 'jackalope' ? [2, 2, 2] : [5, 5, 5]} // Increase jackalope scale to 2x
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        {playerType === 'merc' ? (
          <MercModel 
            position={[0, 0, 0]} 
            rotation={[0, 0, 0]} 
            scale={[5, 5, 5]} // Use consistent 5x scale
          />
        ) : (
          <JackalopeModel 
            position={[0, -2.15, 0]} 
            rotation={[0, 0, 0]} 
            scale={[2, 2, 2]}
          />
        )}
      </mesh>
      
        {/* Add spatial audio for remote fallback player */}
        {audioComponent}
      </group>

      <PlayerMarker
        playerId={playerId}
        playerType={playerType}
        position={position}
        height={playerType === 'merc' ? 10 : 5}
      />
    </>
  );
};

// Custom comparison function for React.memo
// Only re-render if player ID changes, ignore position/rotation changes
const compareRemotePlayers = (prevProps: RemotePlayerData, nextProps: RemotePlayerData) => {
  return prevProps.playerId === nextProps.playerId;
};

export const RemotePlayerMemo = React.memo(RemotePlayer, compareRemotePlayers); 
