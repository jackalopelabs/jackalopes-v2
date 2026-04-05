import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

declare global {
  interface Window {
    __localPlayerPosition?: THREE.Vector3;
    __localPlayerInteract?: boolean;
    jackalopesGame?: any;
  }
}

type FlashlightPickupProps = {
  enabled: boolean;
  connectionManager?: any;
};

const SPAWN_POINTS: [number, number, number][] = [
  [-55, 2.4, -18],
  [-42, 2.4, 24],
  [-68, 2.4, 8],
  [-32, 2.4, -36],
  [-78, 2.4, -8],
  [-26, 2.4, 36],
];

const INTERACTION_RANGE = 3.2;

export const FlashlightPickup: React.FC<FlashlightPickupProps> = ({ enabled, connectionManager }) => {
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
      const pickup = window.jackalopesGame?.flashlightPickup;
      if (pickup?.spawnPoint) {
        const idx = SPAWN_POINTS.findIndex(point => (
          point[0] === pickup.spawnPoint[0] &&
          point[1] === pickup.spawnPoint[1] &&
          point[2] === pickup.spawnPoint[2]
        ));
        if (idx >= 0) setSpawnIndex(idx);
      }
      setCollected(!!window.jackalopesGame?.flashlightCollected || !!pickup?.collected);
    };

    syncFromWindow();

    const handleServerPickup = (event: CustomEvent<any>) => {
      const pickup = event.detail?.flashlightPickup || event.detail;
      if (!pickup) return;
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.flashlightPickup = pickup;
      window.jackalopesGame.flashlightCollected = !!pickup.collected;
      if (pickup.collected) {
        window.jackalopesGame.flashlightOn = true;
        window.dispatchEvent(new CustomEvent('flashlightPickupChanged', { detail: { collected: true } }));
        window.dispatchEvent(new CustomEvent('flashlightToggled', { detail: { isOn: true } }));
        window.dispatchEvent(new CustomEvent('flashlightCollected'));
      }
      syncFromWindow();
    };

    const handleRoundReset = () => {
      const nextIndex = Math.floor(Math.random() * SPAWN_POINTS.length);
      setSpawnIndex(nextIndex);
      setCollected(false);
      nearbyRef.current = false;
      announcedPickupRef.current = false;
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.flashlightCollected = false;
      window.jackalopesGame.flashlightOn = false;
      window.jackalopesGame.flashlightPickupNearby = false;
      window.dispatchEvent(new CustomEvent('flashlightPickupChanged', { detail: { collected: false } }));
      window.dispatchEvent(new CustomEvent('flashlightPickupNearby', { detail: { nearby: false } }));
      window.dispatchEvent(new CustomEvent('flashlightToggled', { detail: { isOn: false } }));
    };

    window.addEventListener('flashlightPickupState', handleServerPickup as EventListener);
    window.addEventListener('jackalopesRoundReset', handleRoundReset);
    return () => {
      window.removeEventListener('flashlightPickupState', handleServerPickup as EventListener);
      window.removeEventListener('jackalopesRoundReset', handleRoundReset);
    };
  }, []);

  useEffect(() => {
    if (!collected) return;
    nearbyRef.current = false;
    if (!window.jackalopesGame) window.jackalopesGame = {};
    window.jackalopesGame.flashlightPickupNearby = false;
    window.dispatchEvent(new CustomEvent('flashlightPickupNearby', { detail: { nearby: false } }));
  }, [collected]);

  useFrame((state) => {
    if (!enabled || collected || !groupRef.current) return;

    groupRef.current.rotation.y += 0.02;
    groupRef.current.position.y = spawnPoint[1] + Math.sin(state.clock.elapsedTime * 2.2) * 0.2;

    if (shimmerRef.current) {
      shimmerRef.current.rotation.y = state.clock.elapsedTime * 0.8;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.08;
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
    const interactPressed = window.__localPlayerInteract || false;

    if (nowNearby !== nearbyRef.current) {
      nearbyRef.current = nowNearby;
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.flashlightPickupNearby = nowNearby;
      window.dispatchEvent(new CustomEvent('flashlightPickupNearby', { detail: { nearby: nowNearby } }));
    }

    if (nowNearby && interactPressed && !lastInteractPressed.current && !announcedPickupRef.current) {
      announcedPickupRef.current = true;
      if (connectionManager) {
        connectionManager.sendFlashlightPickup();
      } else {
        setCollected(true);
        if (!window.jackalopesGame) window.jackalopesGame = {};
        window.jackalopesGame.flashlightCollected = true;
        window.jackalopesGame.flashlightOn = true;
        window.dispatchEvent(new CustomEvent('flashlightPickupChanged', { detail: { collected: true } }));
        window.dispatchEvent(new CustomEvent('flashlightToggled', { detail: { isOn: true } }));
        window.dispatchEvent(new CustomEvent('flashlightCollected'));
      }
    }

    lastInteractPressed.current = interactPressed;
  });

  if (!enabled || collected) return null;

  return (
    <group ref={groupRef} position={spawnPoint}>
      <group ref={shimmerRef}>
        <mesh castShadow receiveShadow rotation={[0.25, 0, 0.9]}>
          <cylinderGeometry args={[0.13, 0.16, 0.8, 18]} />
          <meshStandardMaterial color="#23262b" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0.28, 0.02, 0]} rotation={[0.25, 0, 0.9]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.25, 16]} />
          <meshStandardMaterial color="#f8fafc" emissive="#fff7cc" emissiveIntensity={3.8} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshBasicMaterial color="#fff4bf" transparent opacity={0.92} toneMapped={false} />
        </mesh>
      </group>

      <pointLight color="#fff3b0" intensity={18} distance={22} decay={1.25} />
      <mesh position={[0, 10, 0]}>
        <cylinderGeometry args={[0.55, 0.18, 20, 24, 1, true]} />
        <meshBasicMaterial color="#fff4bf" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 9.5, 0]}>
        <cylinderGeometry args={[1.1, 1.8, 19, 24, 1, true]} />
        <meshBasicMaterial color="#fff4bf" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.25, 48]} />
        <meshBasicMaterial color="#fff7cc" transparent opacity={0.72} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.34, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 32]} />
        <meshBasicMaterial color="#fff1a8" transparent opacity={0.35} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={auraRef} position={[0, 0.5, 0]} visible={false}>
        <sphereGeometry args={[1.15, 18, 18]} />
        <meshBasicMaterial color="#fff4bf" transparent opacity={0.16} toneMapped={false} />
      </mesh>
    </group>
  );
};

export default FlashlightPickup;
