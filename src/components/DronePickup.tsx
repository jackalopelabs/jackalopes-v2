import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

declare global {
  interface Window {
    __localPlayerPosition?: THREE.Vector3;
    __localPlayerInteract?: boolean;
    __lastLocalInteractAt?: number;
    jackalopesGame?: any;
  }
}

type DronePickupProps = {
  enabled: boolean;
};

const SPAWN_POINTS: [number, number, number][] = [
  [-58, 2.4, -14],
  [-46, 2.4, 20],
  [-66, 2.4, 10],
  [-34, 2.4, -30],
  [-74, 2.4, -4],
  [-28, 2.4, 32],
];

const INTERACTION_RANGE = 3.2;

export const DronePickup: React.FC<DronePickupProps> = ({ enabled }) => {
  const groupRef = useRef<THREE.Group>(null);
  const shimmerRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const lastInteractPressed = useRef(false);
  const announcedPickupRef = useRef(false);
  const nearbyRef = useRef(false);

  const [collected, setCollected] = useState(false);
  const [spawnIndex, setSpawnIndex] = useState(() => Math.floor(Math.random() * SPAWN_POINTS.length));

  const spawnPoint = useMemo(() => SPAWN_POINTS[spawnIndex], [spawnIndex]);

  useEffect(() => {
    const syncFromWindow = () => {
      setCollected(!!window.jackalopesGame?.droneCollected);
    };

    const handleRoundReset = () => {
      const nextIndex = Math.floor(Math.random() * SPAWN_POINTS.length);
      setSpawnIndex(nextIndex);
      setCollected(false);
      nearbyRef.current = false;
      announcedPickupRef.current = false;
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.droneCollected = false;
      window.jackalopesGame.droneActive = false;
      window.jackalopesGame.dronePickupNearby = false;
      window.dispatchEvent(new CustomEvent('dronePickupChanged', { detail: { collected: false } }));
      window.dispatchEvent(new CustomEvent('dronePickupNearby', { detail: { nearby: false } }));
      window.dispatchEvent(new CustomEvent('droneModeToggled', { detail: { active: false } }));
    };

    syncFromWindow();
    window.addEventListener('jackalopesRoundReset', handleRoundReset);
    return () => {
      window.removeEventListener('jackalopesRoundReset', handleRoundReset);
    };
  }, []);

  useEffect(() => {
    if (!collected) return;
    nearbyRef.current = false;
    if (!window.jackalopesGame) window.jackalopesGame = {};
    window.jackalopesGame.dronePickupNearby = false;
    window.dispatchEvent(new CustomEvent('dronePickupNearby', { detail: { nearby: false } }));
  }, [collected]);

  useFrame((state) => {
    if (!enabled || collected || !groupRef.current) return;

    groupRef.current.rotation.y += 0.016;
    groupRef.current.position.y = spawnPoint[1] + Math.sin(state.clock.elapsedTime * 1.8) * 0.18;

    if (shimmerRef.current) {
      shimmerRef.current.rotation.y = state.clock.elapsedTime * 1.1;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4.1) * 0.08;
      shimmerRef.current.scale.setScalar(pulse);
    }

    if (auraRef.current) {
      auraRef.current.visible = nearbyRef.current;
    }

    const playerPosition = window.__localPlayerPosition;
    if (!playerPosition) return;

    const pickupPos = new THREE.Vector3(spawnPoint[0], groupRef.current.position.y, spawnPoint[2]);
    const distance = pickupPos.distanceTo(playerPosition);
    const nowNearby = distance <= INTERACTION_RANGE;
    const interactPressed = !!window.__localPlayerInteract || (Date.now() - (window.__lastLocalInteractAt || 0) < 150);

    if (nowNearby !== nearbyRef.current) {
      nearbyRef.current = nowNearby;
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.dronePickupNearby = nowNearby;
      window.dispatchEvent(new CustomEvent('dronePickupNearby', { detail: { nearby: nowNearby } }));
    }

    if (nowNearby && interactPressed && !lastInteractPressed.current && !announcedPickupRef.current) {
      announcedPickupRef.current = true;
      setCollected(true);
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.droneCollected = true;
      window.dispatchEvent(new CustomEvent('droneCollected'));
      window.dispatchEvent(new CustomEvent('dronePickupChanged', { detail: { collected: true } }));
    }

    lastInteractPressed.current = interactPressed;
  });

  if (!enabled || collected) return null;

  return (
    <group ref={groupRef} position={spawnPoint}>
      <group ref={shimmerRef}>
        <mesh castShadow receiveShadow position={[0, 0.26, 0]}>
          <boxGeometry args={[0.5, 0.16, 0.35]} />
          <meshStandardMaterial color="#2c3440" metalness={0.45} roughness={0.3} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.26, 0]}>
          <boxGeometry args={[0.9, 0.04, 0.04]} />
          <meshStandardMaterial color="#6ee7ff" emissive="#1fb6ff" emissiveIntensity={1.2} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.26, 0]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.9, 0.04, 0.04]} />
          <meshStandardMaterial color="#6ee7ff" emissive="#1fb6ff" emissiveIntensity={1.2} />
        </mesh>
        {[
          [0.42, 0.34, 0.16],
          [-0.42, 0.34, 0.16],
          [0.42, 0.34, -0.16],
          [-0.42, 0.34, -0.16],
        ].map((propPos, index) => (
          <mesh key={index} position={propPos as [number, number, number]} rotation={[-Math.PI / 2, 0, stateSafeRotation(stateClockSeed(index))]}>
            <cylinderGeometry args={[0.18, 0.18, 0.015, 18]} />
            <meshBasicMaterial color="#bffcff" transparent opacity={0.75} toneMapped={false} />
          </mesh>
        ))}
      </group>

      <pointLight color="#69d2ff" intensity={10} distance={14} decay={1.5} />
      <mesh position={[0, 6.5, 0]}>
        <cylinderGeometry args={[0.3, 0.15, 13, 18, 1, true]} />
        <meshBasicMaterial color="#69d2ff" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.75, 1.15, 40]} />
        <meshBasicMaterial color="#6ee7ff" transparent opacity={0.55} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={auraRef} position={[0, 0.3, 0]} visible={false}>
        <sphereGeometry args={[1.05, 18, 18]} />
        <meshBasicMaterial color="#69d2ff" transparent opacity={0.14} toneMapped={false} />
      </mesh>
    </group>
  );
};

function stateClockSeed(index: number) {
  return index * 0.6;
}

function stateSafeRotation(seed: number) {
  return seed;
}

export default DronePickup;
