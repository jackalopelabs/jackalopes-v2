import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PerspectiveCamera, useKeyboardControls } from '@react-three/drei';
import { useGamepad } from '../common/hooks/use-gamepad';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

declare global {
  interface Window {
    jackalopesGame?: any;
    __localPlayerPosition?: THREE.Vector3;
  }
}

type KeyControls = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jump: boolean;
};

type MercDroneProps = {
  enabled: boolean;
};

const up = new THREE.Vector3(0, 1, 0);
const forwardVec = new THREE.Vector3();
const flatForward = new THREE.Vector3();
const sideVec = new THREE.Vector3();
const moveVec = new THREE.Vector3();
const targetPos = new THREE.Vector3();
const tempPos = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export const MercDrone: React.FC<MercDroneProps> = ({ enabled }) => {
  const groupRef = useRef<THREE.Group>(null);
  const modelGroupRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const propellerRefs = useRef<THREE.Mesh[]>([]);
  const positionRef = useRef(new THREE.Vector3(10, 10, 10));
  const initializedRef = useRef(false);
  const [, getKeyboardControls] = useKeyboardControls<KeyControls>();
  const gamepadState = useGamepad();
  const [collected, setCollected] = useState(!!window.jackalopesGame?.droneCollected);
  const [active, setActive] = useState(!!window.jackalopesGame?.droneActive);
  const [thermalActive, setThermalActive] = useState(!!window.jackalopesGame?.droneThermalActive);
  const [customModelLoaded, setCustomModelLoaded] = useState(false);
  const [customModelError, setCustomModelError] = useState(false);

  useEffect(() => {
    if (!collected || !modelGroupRef.current) return;

    const applyDroneTransform = (object: THREE.Object3D) => {
      if (!modelGroupRef.current) return;

      while (modelGroupRef.current.children.length) {
        modelGroupRef.current.remove(modelGroupRef.current.children[0]);
      }

      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 3.2;
      const scaleFactor = targetSize / maxDim;

      object.scale.setScalar(scaleFactor);
      object.position.sub(center.multiplyScalar(scaleFactor));
      object.rotation.set(-Math.PI / 2, Math.PI / 2, 0);

      object.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = new THREE.MeshStandardMaterial({
            color: '#9be7ff',
            emissive: '#1188aa',
            emissiveIntensity: 0.8,
            metalness: 0.35,
            roughness: 0.45,
            side: THREE.DoubleSide,
          });
          child.material.needsUpdate = true;
        }
      });

      modelGroupRef.current.add(object);
      setCustomModelLoaded(true);
      setCustomModelError(false);
    };

    const loadObjFallback = () => {
      const mtlLoader = new MTLLoader();
      mtlLoader.load(
        '/Model%203D/Dron%20DL-3%20MODEL%20RIGING.mtl',
        (materials) => {
          materials.preload();
          const objLoader = new OBJLoader();
          objLoader.setMaterials(materials);
          objLoader.load(
            '/Model%203D/Dron%20DL-3%20MODEL%20RIGING.obj',
            (obj) => applyDroneTransform(obj),
            undefined,
            (objError) => {
              console.error('Failed to load drone OBJ model:', objError);
              setCustomModelError(true);
            }
          );
        },
        undefined,
        (mtlError) => {
          console.error('Failed to load drone MTL:', mtlError);
          setCustomModelError(true);
        }
      );
    };

    const loader = new FBXLoader();
    loader.load(
      '/Model%203D/Dron%20DL-3%20MODEL%20RIGING.fbx',
      (fbx) => {
        applyDroneTransform(fbx);
      },
      undefined,
      (error) => {
        console.error('Failed to load drone FBX model:', error);
        loadObjFallback();
      }
    );
  }, [collected]);

  useEffect(() => {
    if (!window.jackalopesGame) window.jackalopesGame = {};
    if (!enabled) {
      window.jackalopesGame.droneActive = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.key === 't' || e.key === 'T') {
        if (!window.jackalopesGame?.droneActive) return;
        const nextThermal = !window.jackalopesGame?.droneThermalActive;
        window.jackalopesGame.droneThermalActive = nextThermal;
        setThermalActive(nextThermal);
        window.dispatchEvent(new CustomEvent('droneThermalToggled', { detail: { active: nextThermal } }));
        return;
      }

      if (e.key !== 'g' && e.key !== 'G' && e.key !== 'y' && e.key !== 'Y') return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (!window.jackalopesGame?.droneCollected) {
        window.dispatchEvent(new CustomEvent('droneToggleBlocked'));
        return;
      }

      const next = !window.jackalopesGame?.droneActive;
      window.jackalopesGame.droneActive = next;
      if (next) {
        window.jackalopesGame.droneThermalActive = true;
        setThermalActive(true);
        window.dispatchEvent(new CustomEvent('droneThermalToggled', { detail: { active: true } }));
      }
      setActive(next);
      window.dispatchEvent(new CustomEvent('droneModeToggled', { detail: { active: next } }));

      if (next && !initializedRef.current) {
        const localPos = window.__localPlayerPosition;
        if (localPos) {
          positionRef.current.set(localPos.x, localPos.y + 4.5, localPos.z);
        }
        initializedRef.current = true;
      }

      if (!next) {
        window.jackalopesGame.droneThermalActive = false;
        setThermalActive(false);
        window.dispatchEvent(new CustomEvent('droneThermalToggled', { detail: { active: false } }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  useEffect(() => {
    const handleCollected = () => {
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.droneCollected = true;
      setCollected(true);
    };

    const handleModeToggled = (event: Event) => {
      const customEvent = event as CustomEvent<{ active: boolean }>;
      setActive(!!customEvent.detail?.active);
    };

    const handleThermalToggled = (event: Event) => {
      const customEvent = event as CustomEvent<{ active: boolean }>;
      setThermalActive(!!customEvent.detail?.active);
    };

    const handleReset = () => {
      initializedRef.current = false;
      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.droneActive = false;
      window.jackalopesGame.droneCollected = false;
      window.jackalopesGame.droneThermalActive = false;
      setActive(false);
      setCollected(false);
      setThermalActive(false);
      window.dispatchEvent(new CustomEvent('droneModeToggled', { detail: { active: false } }));
      window.dispatchEvent(new CustomEvent('droneThermalToggled', { detail: { active: false } }));
    };

    window.addEventListener('droneCollected', handleCollected);
    window.addEventListener('droneModeToggled', handleModeToggled as EventListener);
    window.addEventListener('droneThermalToggled', handleThermalToggled as EventListener);
    window.addEventListener('jackalopesRoundReset', handleReset);
    return () => {
      window.removeEventListener('droneCollected', handleCollected);
      window.removeEventListener('droneModeToggled', handleModeToggled as EventListener);
      window.removeEventListener('droneThermalToggled', handleThermalToggled as EventListener);
      window.removeEventListener('jackalopesRoundReset', handleReset);
    };
  }, []);

  useFrame((state, delta) => {
    if (!enabled) return;

    if (gamepadState.buttons.droneToggle) {
      if (!window.jackalopesGame) window.jackalopesGame = {};
      if (window.jackalopesGame.droneCollected) {
        const next = !window.jackalopesGame.droneActive;
        window.jackalopesGame.droneActive = next;
        if (next) {
          window.jackalopesGame.droneThermalActive = true;
          setThermalActive(true);
          window.dispatchEvent(new CustomEvent('droneThermalToggled', { detail: { active: true } }));
        }
        setActive(next);
        window.dispatchEvent(new CustomEvent('droneModeToggled', { detail: { active: next } }));
        if (next && !initializedRef.current) {
          const localPos = window.__localPlayerPosition;
          if (localPos) {
            positionRef.current.set(localPos.x, localPos.y + 4.5, localPos.z);
          }
          initializedRef.current = true;
        }
        if (!next) {
          window.jackalopesGame.droneThermalActive = false;
          setThermalActive(false);
          window.dispatchEvent(new CustomEvent('droneThermalToggled', { detail: { active: false } }));
        }
      }
    }

    if (!active) return;

    if (!initializedRef.current) {
      const localPos = window.__localPlayerPosition;
      if (localPos) {
        positionRef.current.set(localPos.x, localPos.y + 4.5, localPos.z);
      }
      initializedRef.current = true;
    }

    const keys = getKeyboardControls() as KeyControls;
    const speed = keys.sprint ? 24 : 15;
    const verticalSpeed = keys.sprint ? 16 : 10;

    if (cameraRef.current) {
      cameraRef.current.getWorldDirection(forwardVec);
      flatForward.copy(forwardVec);
      flatForward.y = 0;
      if (flatForward.lengthSq() < 0.0001) {
        flatForward.set(0, 0, -1);
      }
      flatForward.normalize();
      sideVec.crossVectors(up, flatForward).normalize();

      moveVec.set(0, 0, 0);
      if (keys.forward) moveVec.add(flatForward);
      if (keys.backward) moveVec.sub(flatForward);
      if (keys.left) moveVec.add(sideVec);
      if (keys.right) moveVec.sub(sideVec);

      if (moveVec.lengthSq() > 0.0001) {
        moveVec.normalize().multiplyScalar(speed * delta);
        positionRef.current.add(moveVec);
      }

      if (keys.jump) positionRef.current.y += verticalSpeed * delta;
      if (keys.sprint) positionRef.current.y -= verticalSpeed * 0.8 * delta;
      positionRef.current.y = THREE.MathUtils.clamp(positionRef.current.y, 2.5, 90);

      if (groupRef.current) {
        groupRef.current.position.copy(positionRef.current);
        tempPos.copy(positionRef.current);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, cameraRef.current.rotation.y, Math.min(1, delta * 6));
      }

      if (!window.jackalopesGame) window.jackalopesGame = {};
      window.jackalopesGame.dronePosition = [positionRef.current.x, positionRef.current.y, positionRef.current.z];
      window.jackalopesGame.droneRotation = tempQuat.setFromEuler(cameraRef.current.rotation).toArray() as [number, number, number, number];
      window.jackalopesGame.droneThermalActive = thermalActive;
    }

    for (const propeller of propellerRefs.current) {
      if (!propeller) continue;
      propeller.rotation.y += delta * 28;
    }

    if (customModelLoaded && modelGroupRef.current) {
      modelGroupRef.current.rotation.y += delta * 0.15;
    }
  });

  const propellerPositions = useMemo(() => ([
    [0.55, 0.1, 0.42],
    [-0.55, 0.1, 0.42],
    [0.55, 0.1, -0.42],
    [-0.55, 0.1, -0.42],
  ] as [number, number, number][]), []);

  if (!enabled || !collected) return null;

  return (
    <group ref={groupRef} position={positionRef.current.toArray() as [number, number, number]}>
      {active && <PerspectiveCamera ref={cameraRef} makeDefault fov={102} position={[0, 0.14, 0.28]} rotation={[-0.03, 0, 0]} />}

      <group ref={modelGroupRef} visible={!active && customModelLoaded} />

      <mesh castShadow receiveShadow visible={!active && !customModelLoaded}>
        <boxGeometry args={[0.82, 0.24, 0.58]} />
        <meshStandardMaterial color="#1f2937" metalness={0.45} roughness={0.28} />
      </mesh>

      <mesh castShadow receiveShadow position={[0, 0.08, 0]} visible={!active && !customModelLoaded}>
        <boxGeometry args={[1.45, 0.04, 0.08]} />
        <meshStandardMaterial color="#67e8f9" emissive="#0ea5e9" emissiveIntensity={0.7} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.08, 0]} rotation={[0, Math.PI / 2, 0]} visible={!active && !customModelLoaded}>
        <boxGeometry args={[1.15, 0.04, 0.08]} />
        <meshStandardMaterial color="#67e8f9" emissive="#0ea5e9" emissiveIntensity={0.7} />
      </mesh>

      <mesh castShadow receiveShadow position={[0, 0.08, 0.34]} visible={!active && !customModelLoaded}>
        <boxGeometry args={[0.3, 0.14, 0.16]} />
        <meshStandardMaterial color="#dbeafe" emissive="#93c5fd" emissiveIntensity={1.2} />
      </mesh>

      {propellerPositions.map((pos, index) => (
        <group key={index} position={pos} visible={!active && !customModelLoaded}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.05, 12]} />
            <meshStandardMaterial color="#111827" metalness={0.55} roughness={0.3} />
          </mesh>
          <mesh
            ref={(el) => {
              if (el) propellerRefs.current[index] = el;
            }}
            position={[0, 0.05, 0]}
            rotation={[0, 0, 0]}
          >
            <boxGeometry args={[0.55, 0.015, 0.06]} />
            <meshBasicMaterial color="#d1fae5" transparent opacity={0.8} toneMapped={false} />
          </mesh>
        </group>
      ))}

      <pointLight color={thermalActive ? "#ff7b39" : "#7dd3fc"} intensity={active ? (thermalActive ? 8 : 4.5) : 2.6} distance={thermalActive ? 24 : 16} decay={1.6} visible={!active} />
    </group>
  );
};

export default MercDrone;
