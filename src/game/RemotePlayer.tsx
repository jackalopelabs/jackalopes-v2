import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Html, Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Points, BufferGeometry, NormalBufferAttributes, Material } from 'three';
import { RemotePlayerAudio } from '../components/RemotePlayerAudio';
import { log, DEBUG_LEVELS, isDebugEnabled } from '../utils/debugUtils';
import { RigidBody, CapsuleCollider, BallCollider, CuboidCollider } from '@react-three/rapier';
import { MercModel } from './MercModel';
import { JackalopeModel } from './JackalopeModel';
import entityStateObserver from '../network/EntityStateObserver';

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
  flashlightOn?: boolean;
}

// Interface for RemotePlayer props
export interface RemotePlayerProps {
  playerId: string;
  position: THREE.Vector3;
  rotation: number;
  playerType: 'merc' | 'jackalope';
  isMoving?: boolean;
  isRunning?: boolean;
  isShooting?: boolean;
  flashlightOn?: boolean;
  cameraPitch?: number;
  audioListener?: THREE.AudioListener;
}

// Interface for the exposed methods
export interface RemotePlayerMethods {
  updateTransform: (position: [number, number, number], rotation: [number, number, number, number]) => void;
}

// FlamethrowerFlame component for the particle effect
const FlamethrowerFlame = () => {
  const particlesRef = useRef<Points<BufferGeometry<NormalBufferAttributes>, Material | Material[]>>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const count = 15;

  const initialPositions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const spread = 0.03;
      positions[i * 3] = 0.1 + Math.random() * 0.1;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    return positions;
  }, [count]);

  useFrame(() => {
    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

      for (let i = 0; i < count; i++) {
        positions[i * 3] += 0.02 + Math.random() * 0.01;
        positions[i * 3 + 1] += (Math.random() - 0.5) * 0.01;
        positions[i * 3 + 2] += (Math.random() - 0.5) * 0.01;

        if (positions[i * 3] > 0.3) {
          positions[i * 3] = 0.05 + Math.random() * 0.05;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 0.03;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
        }
      }

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
  playerId, position, rotation, playerType = 'merc', isMoving, isRunning, isShooting, flashlightOn, cameraPitch = 0, audioListener
}) => {
  // ============================================================
  // ALL HOOKS MUST BE DECLARED HERE AT THE TOP LEVEL
  // No hooks inside if/else blocks or after early returns
  // ============================================================

  // --- Refs for both player types ---
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const spotlightRef = useRef<THREE.SpotLight>(null);
  const spotlightTargetRef = useRef<THREE.Object3D>(null);
  const lastAnimationChangeTime = useRef<number>(Date.now());
  const pendingAnimationChange = useRef<string | null>(null);
  const lastPosition = useRef<THREE.Vector3 | null>(null);
  const lastMoveTimestamp = useRef<number>(Date.now());
  const currentAnimation = useRef("idle");

  // Refs for smooth position/rotation interpolation
  const latestPositionRef = useRef<typeof position>(position);
  const latestRotationRef = useRef<number>(rotation || 0);
  const latestCameraPitchRef = useRef<number>(cameraPitch);
  const latestIsMovingRef = useRef<boolean>(isMoving || false);
  const latestIsRunningRef = useRef<boolean>(isRunning || false);
  const latestFlashlightRef = useRef<boolean>(flashlightOn || false);

  // Merc-specific refs
  const mercRigidBodyRef = useRef<any>(null);
  const mercSmoothedPos = useRef(new THREE.Vector3(position?.x || 0, position?.y || 0, position?.z || 0));
  const mercCurrentRotation = useRef(rotation || 0);

  // Jackalope-specific refs
  const jackalopeRigidBodyRef = useRef<any>(null);
  const jackalopeSmoothedPos = useRef(new THREE.Vector3(position?.x || 0, position?.y || 0, position?.z || 0));
  const jackalopeCurrentRotation = useRef(rotation || 0);
  const attachedProjectilesRef = useRef<{id: string, position: THREE.Vector3}[]>([]);
  const invulnerableTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timing refs
  const lastMovementSyncTime = useRef(0);

  // --- State for both player types ---
  const [modelError, setModelError] = useState(false);
  const [localIsMoving, setLocalIsMoving] = useState(isMoving || false);
  const [localIsRunning, setLocalIsRunning] = useState(isRunning || false);

  // Jackalope-specific state
  const [attachedProjectiles, setAttachedProjectiles] = useState<{id: string, position: THREE.Vector3}[]>([]);
  const [isHit, setIsHit] = useState(false);
  const [isRespawning, setIsRespawning] = useState(false);
  const [isInvulnerable, setIsInvulnerable] = useState(false);

  // --- Memoized values ---
  const playerColor = useMemo(() => {
    return playerType === 'merc' ? 'red' : 'blue';
  }, [playerType]);

  const walkingOnly = localIsMoving && !localIsRunning;
  const running = localIsRunning;

  // --- Callbacks (must be at top level) ---
  const createFallbackModel = useCallback(() => {
    const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
    const material = new THREE.MeshStandardMaterial({
      color: playerColor,
      roughness: 0.7,
      metalness: 0.3
    });
    return new THREE.Mesh(geometry, material);
  }, [playerColor]);

  const getFallbackModel = useCallback((type: 'merc' | 'jackalope'): THREE.Object3D => {
    const color = type === 'merc' ? 'red' : 'blue';
    if (typeof window !== 'undefined' && window.__fallbackModels && window.__fallbackModels[color]) {
      return window.__fallbackModels[color].clone();
    }

    const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
    const material = new THREE.MeshStandardMaterial({
      color: type === 'merc' ? 0xff0000 : 0x0000ff,
      roughness: 0.7,
      metalness: 0.3
    });

    return new THREE.Mesh(geometry, material);
  }, []);

  // Jackalope hit handler callback
  const handleJackalopeHit = useCallback((projectileId: string, shooterId: string): boolean => {
    if (playerType !== 'jackalope') return false;
    if (isHit || isRespawning || isInvulnerable) {
      return false;
    }

    window.__lastHitJackalope = playerId;

    setIsHit(true);

    // Dispatch scoring event
    try {
      const scoringEvent = new CustomEvent('merc_scored', {
        detail: {
          mercId: shooterId,
          jackalopeId: playerId,
          shotId: projectileId,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(scoringEvent);
    } catch (err) {
      // Silent fail
    }

    // Play hit sound
    try {
      const hitSound = new Audio('/audio/jackalope-hit.mp3');
      hitSound.play().catch(() => {});
    } catch (err) {
      // Silent fail
    }

    // Create explosion effect
    if (typeof window !== 'undefined' && window.__createExplosionEffect && position) {
      try {
        window.__createExplosionEffect(
          new THREE.Vector3(position.x, position.y, position.z),
          '#4682B4',
          30,
          0.3
        );
      } catch (err) {
        // Silent fail
      }
    }

    // After a short delay, trigger respawn
    setTimeout(() => {
      setIsHit(false);
      setIsRespawning(true);

      if (typeof window !== 'undefined') {
        if (window.__lastHitJackalope === playerId) {
          if (window.__networkManager) {
            const spawnPosition: [number, number, number] = [-100, 3, 10];
            window.__networkManager.sendRespawnRequest(playerId, spawnPosition);
          } else if (window.connectionManager) {
            const spawnPosition: [number, number, number] = [-100, 3, 10];
            window.connectionManager.sendRespawnRequest(playerId, spawnPosition);
          }
          window.__lastHitJackalope = undefined;
        }
      }

      setTimeout(() => {
        setIsRespawning(false);
        setIsInvulnerable(true);

        if (invulnerableTimeoutRef.current) {
          clearTimeout(invulnerableTimeoutRef.current);
        }

        invulnerableTimeoutRef.current = setTimeout(() => {
          setIsInvulnerable(false);
          invulnerableTimeoutRef.current = null;
        }, 3000);

        if (typeof window !== 'undefined' && window.__createSpawnEffect && position) {
          try {
            window.__createSpawnEffect(
              new THREE.Vector3(position.x, position.y, position.z),
              '#4682B4',
              20,
              0.2
            );
          } catch (err) {
            // Silent fail
          }
        }
      }, 1500);
    }, 200);

    return true;
  }, [playerId, position, isHit, isRespawning, isInvulnerable, playerType]);

  const handleAttachProjectile = useCallback((projectileData: {id: string, position: THREE.Vector3}): boolean => {
    if (playerType !== 'jackalope') return false;
    if (isHit || isRespawning || isInvulnerable) return false;
    return true;
  }, [isHit, isRespawning, isInvulnerable, playerType]);

  // ============================================================
  // SINGLE UNIFIED useFrame FOR POSITION/ROTATION SYNC
  // Handles both merc and jackalope kinematic body updates
  // ============================================================
  useFrame((_, delta) => {
    // Read from live store (updated 60x/sec by MultiplayerManager)
    const liveStore = (window as any).__livePlayerData;
    const live = liveStore?.[playerId];

    if (live) {
      latestPositionRef.current = live.position;
      latestRotationRef.current = live.rotation;
      latestCameraPitchRef.current = live.cameraPitch;
      latestIsMovingRef.current = live.isMoving;
      latestIsRunningRef.current = live.isRunning;
      latestFlashlightRef.current = live.flashlightOn;
    }

    const latestPos = live?.position || latestPositionRef.current;
    const latestRot = live?.rotation ?? latestRotationRef.current;

    if (!latestPos) return;

    // --- MERC KINEMATIC POSITION SYNC ---
    if (playerType === 'merc' && mercRigidBodyRef.current) {
      const targetPos = new THREE.Vector3(latestPos.x, latestPos.y - 1.6, latestPos.z);
      const dist = mercSmoothedPos.current.distanceTo(targetPos);

      let speed: number;
      if (dist > 5) speed = 1.0;
      else if (dist > 2) speed = Math.min(1, delta * 20);
      else if (dist > 0.1) speed = Math.min(1, delta * 15);
      else speed = Math.min(1, delta * 12);

      mercSmoothedPos.current.lerp(targetPos, speed);
      mercRigidBodyRef.current.setNextKinematicTranslation({
        x: mercSmoothedPos.current.x,
        y: mercSmoothedPos.current.y,
        z: mercSmoothedPos.current.z
      });

      // Angle-wrap aware rotation lerp
      let angleDiff = latestRot - mercCurrentRotation.current;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      const rotSpeed = Math.min(delta * 20, 0.5);
      mercCurrentRotation.current += angleDiff * rotSpeed;
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mercCurrentRotation.current);
      mercRigidBodyRef.current.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }

    // --- JACKALOPE KINEMATIC POSITION SYNC ---
    if (playerType === 'jackalope' && jackalopeRigidBodyRef.current) {
      const targetPos = new THREE.Vector3(latestPos.x, latestPos.y + 0.3, latestPos.z);
      const dist = jackalopeSmoothedPos.current.distanceTo(targetPos);

      let speed: number;
      if (dist > 5) speed = 1.0;
      else if (dist > 2) speed = Math.min(1, delta * 20);
      else if (dist > 0.1) speed = Math.min(1, delta * 15);
      else speed = Math.min(1, delta * 12);

      jackalopeSmoothedPos.current.lerp(targetPos, speed);
      jackalopeRigidBodyRef.current.setNextKinematicTranslation({
        x: jackalopeSmoothedPos.current.x,
        y: jackalopeSmoothedPos.current.y,
        z: jackalopeSmoothedPos.current.z
      });

      // Angle-wrap aware rotation lerp (jackalope faces +PI from merc)
      const targetRot = latestRot + Math.PI;
      let angleDiff = targetRot - jackalopeCurrentRotation.current;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      const rotSpeed = Math.min(delta * 20, 0.5);
      jackalopeCurrentRotation.current += angleDiff * rotSpeed;
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), jackalopeCurrentRotation.current);
      jackalopeRigidBodyRef.current.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }

    // --- FLASHLIGHT UPDATE (merc only) ---
    if (playerType === 'merc' && flashlightOn && spotlightRef.current && spotlightTargetRef.current) {
      const pos = latestPositionRef.current;
      const yaw = latestRotationRef.current;
      const pitch = latestCameraPitchRef.current;

      if (pos) {
        const dirX = Math.sin(yaw);
        const dirZ = Math.cos(yaw);

        const lightHeight = pos.y + 6;
        spotlightRef.current.position.set(
          pos.x + dirX * 1,
          lightHeight,
          pos.z + dirZ * 1
        );

        const targetDist = 20;
        const verticalOffset = -Math.sin(pitch) * targetDist;
        spotlightTargetRef.current.position.set(
          pos.x + dirX * targetDist,
          lightHeight + verticalOffset,
          pos.z + dirZ * targetDist
        );
        spotlightTargetRef.current.updateMatrixWorld();
        spotlightRef.current.target = spotlightTargetRef.current;
      }
    }

    // --- MOVEMENT STATE SYNC (throttled to ~15hz) ---
    const now = Date.now();
    if (now - lastMovementSyncTime.current >= 66) {
      lastMovementSyncTime.current = now;

      const liveMoving = latestIsMovingRef.current;
      const liveRunning = latestIsRunningRef.current;

      if (liveMoving !== localIsMoving || liveRunning !== localIsRunning) {
        const timeSinceLastChange = now - lastAnimationChangeTime.current;
        if (timeSinceLastChange >= 300) {
          setLocalIsMoving(liveMoving);
          setLocalIsRunning(liveRunning);
          lastAnimationChangeTime.current = now;
        }
      }
    }

    // --- PENDING ANIMATION CHANGES ---
    if (pendingAnimationChange.current !== null) {
      const now = Date.now();
      const timeSinceLastChange = now - lastAnimationChangeTime.current;

      if (timeSinceLastChange >= 200) {
        const newAnim = pendingAnimationChange.current;
        setLocalIsMoving(newAnim === "walk");
        currentAnimation.current = newAnim;
        lastAnimationChangeTime.current = now;
        pendingAnimationChange.current = null;
      }
    }
  });

  // ============================================================
  // EFFECTS
  // ============================================================

  // Update local isMoving/isRunning when props change
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastChange = now - lastAnimationChangeTime.current;
    const MIN_STATE_CHANGE_INTERVAL = 500;

    if (timeSinceLastChange < MIN_STATE_CHANGE_INTERVAL) {
      return;
    }

    if (isMoving === true && isRunning === true) {
      setLocalIsMoving(true);
      setLocalIsRunning(true);
      lastAnimationChangeTime.current = now;
    } else if (isMoving === true && isRunning !== true) {
      setLocalIsMoving(true);
      setLocalIsRunning(false);
      lastAnimationChangeTime.current = now;
    } else if (isMoving === false) {
      setLocalIsMoving(false);
      setLocalIsRunning(false);
      lastAnimationChangeTime.current = now;
    }
  }, [isMoving, isRunning]);

  // Expose jackalope hit handler to window
  useEffect(() => {
    if (playerType !== 'jackalope') return;

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
  }, [playerId, handleJackalopeHit, playerType]);

  // Jackalope respawn position update listener
  useEffect(() => {
    if (playerType !== 'jackalope') return;

    const checkForRespawnEvent = () => {
      const entity = entityStateObserver.getEntity(playerId);
      if (entity?.isRespawning && !isRespawning && !isHit) {
        setIsHit(true);

        if (typeof window !== 'undefined' && window.__createExplosionEffect && position) {
          window.__createExplosionEffect(
            new THREE.Vector3(position.x, position.y, position.z),
            '#4682B4',
            30,
            0.3
          );
        }

        setTimeout(() => {
          setIsHit(false);
          setIsRespawning(true);

          setTimeout(() => {
            const updatedEntity = entityStateObserver.getEntity(playerId);

            let newX = position?.x || 0;
            let newY = position?.y || 0;
            let newZ = position?.z || 0;

            if (updatedEntity && updatedEntity.position) {
              newX = updatedEntity.position[0];
              newY = updatedEntity.position[1];
              newZ = updatedEntity.position[2];
            }

            setIsRespawning(false);
            setIsInvulnerable(true);

            if (invulnerableTimeoutRef.current) {
              clearTimeout(invulnerableTimeoutRef.current);
            }

            invulnerableTimeoutRef.current = setTimeout(() => {
              setIsInvulnerable(false);
              invulnerableTimeoutRef.current = null;
            }, 3000);

            if (typeof window !== 'undefined' && window.__createSpawnEffect) {
              window.__createSpawnEffect(
                new THREE.Vector3(newX, newY, newZ),
                '#4682B4',
                20,
                0.2
              );
            }
          }, 500);
        }, 200);
      }
    };

    checkForRespawnEvent();
    const intervalId = setInterval(checkForRespawnEvent, 500);

    return () => clearInterval(intervalId);
  }, [playerId, position, isHit, isRespawning, playerType]);

  // Keep attachedProjectilesRef in sync with state
  useEffect(() => {
    attachedProjectilesRef.current = attachedProjectiles;
  }, [attachedProjectiles]);

  // Clean up invulnerable timeout on unmount
  useEffect(() => {
    return () => {
      if (invulnerableTimeoutRef.current) {
        clearTimeout(invulnerableTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================
  // MEMOIZED RENDER HELPERS
  // ============================================================

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

  const renderedProjectiles = useMemo(() => {
    if (playerType !== 'jackalope') return null;
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
      </group>
    ));
  }, [attachedProjectiles, position, playerType]);

  // ============================================================
  // RENDER BRANCHES
  // Note: These contain NO hook declarations, only JSX
  // ============================================================

  // --- MERC RENDER ---
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
          <CapsuleCollider args={[7.5, 4]} position={[0, 7.5, 0]} sensor={false} />
          <CuboidCollider args={[4, 7.5, 4]} position={[0, 7.5, 0]} sensor={false} />
          <BallCollider args={[3]} position={[0, 12.5, 0]} sensor={false} />

          <MercModel
            position={[0, 0, 0]}
            rotation={[0, 0, 0]}
            scale={[5, 5, 5]}
            animation={localIsRunning ? 'run' : localIsMoving ? 'walk' : 'idle'}
          />
        </RigidBody>

        {/* Remote player flashlight */}
        {flashlightOn && (
          <group position={[0,0,0]}>
            <spotLight
              ref={spotlightRef}
              color={0xffffdd}
              intensity={40}
              distance={80}
              angle={0.7}
              penumbra={0.5}
              decay={1.2}
              castShadow
            />
            <object3D ref={spotlightTargetRef} />
          </group>
        )}

        {/* Player ID tag */}
        <Html position={[position?.x || 0, (position?.y || 0) + 12, position?.z || 0]} center>
          {window.jackalopesGame?.playerType === 'merc' && (
            <div style={{
              background: 'rgba(0,0,0,0.5)',
              padding: '2px 6px',
              borderRadius: '4px',
              color: 'white',
              fontSize: '14px',
              fontFamily: 'Arial, sans-serif'
            }}>
              {playerId?.split('-')[0]}
            </div>
          )}
        </Html>

        {audioComponent}
      </>
    );
  }

  // --- JACKALOPE RENDER ---
  if (playerType === 'jackalope') {
    return (
      <>
        <RigidBody
          ref={jackalopeRigidBodyRef}
          type="kinematicPosition"
          position={position ? [position.x, position.y + 0.3, position.z] : [0, 0.3, 0]}
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
          ccd={true}
          collisionGroups={0xFFFFFFFF}
          restitution={0.1}
        >
          {!isHit && (
            <>
              <CapsuleCollider args={[2.4, 2.0]} position={[0, 1.2, 0]} sensor={false} friction={1} restitution={0.1} />
              <CuboidCollider args={[2.0, 2.0, 2.0]} position={[0, 1.2, 0]} sensor={false} friction={1} restitution={0.1} />
              <BallCollider args={[1.4]} position={[0, 3.0, 0]} sensor={false} friction={1} restitution={0.1} />
              <BallCollider args={[2.4]} position={[0, 1.6, 0]} sensor={false} friction={1} restitution={0.1} />

              <JackalopeModel
                position={[0, -0.9, 0]}
                rotation={[0, 0, 0]}
                scale={[2, 2, 2]}
              />

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

              {renderedProjectiles}
            </>
          )}
        </RigidBody>

        {!isHit && !isRespawning && (
          <Html position={[position?.x || 0, (position?.y || 0) + 5, position?.z || 0]} center>
            {window.jackalopesGame?.playerType === 'jackalope' && (
              <div style={{
                background: 'rgba(0,0,0,0.5)',
                padding: '2px 6px',
                borderRadius: '4px',
                color: 'white',
                fontSize: '12px',
                fontFamily: 'Arial, sans-serif'
              }}>
                {playerId?.split('-')[0]}
                {isInvulnerable && ' (Invulnerable)'}
              </div>
            )}
          </Html>
        )}

        {!isHit && !isRespawning && audioComponent}
      </>
    );
  }

  // --- FALLBACK RENDER (should not normally reach here) ---
  const color = useMemo(() => {
    if (!playerId) {
      return new THREE.Color('#888888');
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

  return (
    <group
      ref={groupRef}
      position={[position.x, position.y, position.z]}
      rotation={[0, rotation, 0]}
      name={`remote-player-${playerId}`}
    >
      {isDebugEnabled(DEBUG_LEVELS.VERBOSE) && (
        <mesh>
          <boxGeometry args={[0.5, 1.8, 0.5]} />
          <meshBasicMaterial wireframe color={playerType === 'jackalope' ? "blue" : "red"} />
        </mesh>
      )}

      <mesh
        ref={meshRef}
        position={[0, playerType === 'jackalope' ? -0.9 : 0, 0]}
        scale={playerType === 'jackalope' ? [2, 2, 2] : [5, 5, 5]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        {playerType === 'merc' ? (
          <MercModel
            position={[0, 0, 0]}
            rotation={[0, 0, 0]}
            scale={[5, 5, 5]}
          />
        ) : (
          <JackalopeModel
            position={[0, -0.9, 0]}
            rotation={[0, 0, 0]}
            scale={[2, 2, 2]}
          />
        )}
      </mesh>

      {window.jackalopesGame?.playerType === playerType && (
        <Billboard
          position={[0, playerType === 'merc' ? 7 : 2.2, 0]}
          follow={true}
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          <Text
            fontSize={playerType === 'merc' ? 0.5 : 0.2}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {playerId?.split('-')[0]}
            {playerType === 'jackalope' ? ' (Jackalope)' : ' (Merc)'}
          </Text>
        </Billboard>
      )}

      {audioComponent}
    </group>
  );
};

// Custom comparison function for React.memo
const compareRemotePlayers = (prevProps: RemotePlayerData, nextProps: RemotePlayerData) => {
  return prevProps.playerId === nextProps.playerId;
};

export const RemotePlayerMemo = React.memo(RemotePlayer, compareRemotePlayers);
