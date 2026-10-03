import React, { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { createAdventureWeapon, disposeAdventureWeapon } from './adventure-weapon-model'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

// Updated MercModel that uses proper GLB model with animations
export const MercModel = ({ 
  animation = 'idle',
  visible = true, 
  position = [0, 0, 0] as [number, number, number],
  rotation = [0, 0, 0] as [number, number, number],
  scale = [1, 1, 1] as [number, number, number],
  thermalActive = false,
  adventureStyle = false,
  flinchUntil = 0,
}: {
  animation?: string;
  visible?: boolean;
  position?: [number, number, number] | THREE.Vector3;
  rotation?: [number, number, number] | THREE.Euler;
  scale?: [number, number, number];
  thermalActive?: boolean;
  adventureStyle?: boolean;
  /** Local Date.now() deadline; a hit normally sets this to Date.now() + 350. */
  flinchUntil?: number;
}) => {
  const group = useRef<THREE.Group>(null);
  const flinchGroup = useRef<THREE.Group | null>(null);
  const weaponRef = useRef<THREE.Group | null>(null);
  const handRef = useRef<THREE.Object3D | null>(null);
  const weaponQuaternions = useRef({ hand: new THREE.Quaternion(), model: new THREE.Quaternion() });
  useFrame(() => {
    if (flinchGroup.current) {
      const remaining = adventureStyle ? THREE.MathUtils.clamp((flinchUntil - Date.now()) / 350, 0, 1) : 0;
      flinchGroup.current.rotation.x = -.16 * Math.sin(remaining * Math.PI);
      flinchGroup.current.rotation.z = .06 * Math.sin(remaining * Math.PI * 2);
    }
    // Keep the nozzle facing forward while the grip follows the animated hand.
    if (weaponRef.current && handRef.current && group.current) {
      const q = weaponQuaternions.current;
      handRef.current.getWorldQuaternion(q.hand);
      group.current.getWorldQuaternion(q.model);
      weaponRef.current.quaternion.copy(q.hand.invert()).multiply(q.model);
    }
  });
  const [animationClips, setAnimationClips] = useState<Record<string, THREE.AnimationClip>>({});
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState(false);
  
  // Determine final position and rotation format
  const finalPosition = position instanceof THREE.Vector3 
    ? [position.x, position.y, position.z] as [number, number, number]
    : position;
    
  const finalRotation = rotation instanceof THREE.Euler
    ? [rotation.x, rotation.y, rotation.z] as [number, number, number] 
    : rotation;
  
  // Load the merc.glb model
  useEffect(() => {
    try {
      const loader = new GLTFLoader();
      loader.load(
        '/merc.glb', 
        (gltf: any) => {
          if (group.current) {
            // Clear existing children
            while (group.current.children.length) {
              group.current.remove(group.current.children[0]);
            }
            
            // Add the model to the group
            gltf.scene.traverse((child: any) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            
            // Add the loaded model to our group
            const recoil = new THREE.Group();
            recoil.name = 'merc-flinch';
            recoil.add(gltf.scene);
            group.current.add(recoil);
            flinchGroup.current = recoil;
            
            // If there are animations in the GLB, store them
            if (gltf.animations && gltf.animations.length > 0) {
              const clips: Record<string, THREE.AnimationClip> = {};
              gltf.animations.forEach((clip: THREE.AnimationClip) => {
                clips[clip.name] = clip;
              });
              setAnimationClips(clips);
              console.log('Loaded animations from merc.glb:', Object.keys(clips).join(', '));
            }
            
            setModelLoaded(true);
          }
        },
        // Progress callback
        (xhr: any) => {
          console.log(`Loading merc.glb: ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        // Error callback
        (error: any) => {
          console.error('Error loading merc.glb model:', error);
          setModelError(true);
        }
      );
      
      // Load walking animation
      const fbxLoader = new FBXLoader();
      fbxLoader.load('/assets/characters/animations/walk.fbx', (fbx: THREE.Group) => {
        const walkAnimation = fbx.animations?.[0];
        
        // Rename animation for easier access
        if (walkAnimation) {
          walkAnimation.name = 'walk';
          console.log('Loaded walk animation:', walkAnimation);
          
          // Store animation in state
          setAnimationClips(prev => ({
            ...prev,
            walk: walkAnimation
          }));
        }
      });
      
    } catch (error) {
      console.error('Error in Merc model loading:', error);
      setModelError(true);
    }
  }, []);
  
  useEffect(() => {
    if (!adventureStyle || !modelLoaded || !group.current) return;
    let hand: THREE.Object3D | undefined;
    group.current.traverse(child => {
      // GLTFLoader sanitizes the colon; choose the visible merc skeleton, not the spare walk rig.
      if (!hand && /RightHand$/.test(child.name)) hand = child;
    });
    if (!hand) return;
    const weapon = createAdventureWeapon();
    // merc.glb's armature is centimetres under a .01 root scale.
    weapon.scale.setScalar(100);
    weapon.position.set(0, 3, 0);
    hand.add(weapon);
    handRef.current = hand;
    weaponRef.current = weapon;
    return () => {
      weaponRef.current = null;
      handRef.current = null;
      disposeAdventureWeapon(weapon);
    };
  }, [adventureStyle, modelLoaded]);

  // Persistent mixer ref so we can cross-fade instead of teardown/rebuild
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const animFrameRef = useRef<number>(0);

  // Create mixer once when model loads
  useEffect(() => {
    if (!group.current || !modelLoaded) return;

    const mixer = new THREE.AnimationMixer(group.current);
    mixerRef.current = mixer;

    const clock = new THREE.Clock();
    const animate = () => {
      mixer.update(clock.getDelta());
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      mixer.stopAllAction();
      if (group.current) mixer.uncacheRoot(group.current);
      mixerRef.current = null;
      activeActionRef.current = null;
    };
  }, [modelLoaded]);

  // Cross-fade to requested animation (or hold last pose)
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || Object.keys(animationClips).length === 0) return;

    if (animation === 'static') {
      mixer.stopAllAction();
      activeActionRef.current = null;
      return;
    }

    // Resolve clip: requested → idle → first available
    const clip = animationClips[animation]
      || (animation === 'run' ? animationClips['walk'] : undefined)
      || animationClips['idle']
      || Object.values(animationClips)[0];
    if (!clip) return; // no clips at all

    const nextAction = mixer.clipAction(clip);
    nextAction.setEffectiveTimeScale(animation === 'run' && !animationClips['run'] ? 1.75 : 1);
    const prev = activeActionRef.current;

    if (prev && prev !== nextAction) {
      // Cross-fade from previous action
      nextAction.reset().setEffectiveWeight(1).play();
      prev.crossFadeTo(nextAction, 0.25, !adventureStyle);
    } else if (!prev) {
      nextAction.reset().play();
    }
    // If prev === nextAction, it's already playing — do nothing (no T-pose flicker)

    activeActionRef.current = nextAction;
  }, [animation, animationClips]);

  useEffect(() => {
    if (!group.current || !modelLoaded) return;

    group.current.traverse((child: any) => {
      if (!(child instanceof THREE.Mesh) || !child.material || child.userData.adventureWeapon) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material: any) => {
        if (!material) return;

        if (!material.userData.__thermalOriginal) {
          material.userData.__thermalOriginal = {
            color: material.color?.clone?.(),
            emissive: material.emissive?.clone?.(),
            emissiveIntensity: material.emissiveIntensity ?? 0,
            metalness: material.metalness,
            roughness: material.roughness,
          };
        }

        const original = material.userData.__thermalOriginal;

        if (thermalActive) {
          if (material.color) material.color.set('#ffd27a');
          if (material.emissive) material.emissive.set('#ff6a2a');
          material.emissiveIntensity = 1.7;
          if (typeof material.metalness === 'number') material.metalness = 0.1;
          if (typeof material.roughness === 'number') material.roughness = 0.45;
        } else if (original) {
          if (material.color && original.color) material.color.copy(original.color);
          if (material.emissive && original.emissive) material.emissive.copy(original.emissive);
          material.emissiveIntensity = original.emissiveIntensity ?? 0;
          if (typeof material.metalness === 'number' && original.metalness !== undefined) material.metalness = original.metalness;
          if (typeof material.roughness === 'number' && original.roughness !== undefined) material.roughness = original.roughness;
        }

        if (adventureStyle && !thermalActive) {
          material.metalness = 0.05;
          material.roughness = 0.72;
          if (material.emissive) material.emissive.set('#171410');
          material.emissiveMap = null;
          material.emissiveIntensity = 0.12;
        }
        material.needsUpdate = true;
      });
    });
  }, [modelLoaded, thermalActive, adventureStyle]);
  
  // If there was an error loading the model, show a simplified version as fallback
  if (modelError) {
    return (
      <group 
        ref={group} 
        visible={visible}
        name="merc-fallback"
        position={finalPosition}
        rotation={finalRotation}
        scale={scale}
      >
        {/* Body */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.7, 1.6, 0.5]} />
          <meshStandardMaterial color={thermalActive ? "#ffd27a" : "#CD5C5C"} emissive={thermalActive ? "#ff6a2a" : "#000000"} emissiveIntensity={thermalActive ? 1.4 : 0} /> {/* Red color for merc */}
        </mesh>
        
        {/* Head */}
        <mesh castShadow receiveShadow position={[0, 1.0, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color={thermalActive ? "#ffe6b8" : "#CD5C5C"} emissive={thermalActive ? "#ff7a36" : "#000000"} emissiveIntensity={thermalActive ? 1.5 : 0} />
        </mesh>
        
        {/* Helmet/Hat */}
        <mesh castShadow position={[0, 1.25, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.15]} />
          <meshStandardMaterial color={thermalActive ? "#ffb36b" : "#8B0000"} emissive={thermalActive ? "#ff5a1f" : "#000000"} emissiveIntensity={thermalActive ? 1.2 : 0} />
        </mesh>
        
        {/* Arms */}
        <mesh castShadow receiveShadow position={[0.45, 0.6, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <meshStandardMaterial color={thermalActive ? "#ffc47d" : "#A52A2A"} emissive={thermalActive ? "#ff6a2a" : "#000000"} emissiveIntensity={thermalActive ? 1.1 : 0} />
        </mesh>
        
        <mesh castShadow receiveShadow position={[-0.45, 0.6, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <meshStandardMaterial color={thermalActive ? "#ffc47d" : "#A52A2A"} emissive={thermalActive ? "#ff6a2a" : "#000000"} emissiveIntensity={thermalActive ? 1.1 : 0} />
        </mesh>
        
        {/* Legs */}
        <mesh castShadow receiveShadow position={[0.2, -0.6, 0]}>
          <boxGeometry args={[0.25, 0.8, 0.25]} />
          <meshStandardMaterial color={thermalActive ? "#ffc47d" : "#A52A2A"} emissive={thermalActive ? "#ff6a2a" : "#000000"} emissiveIntensity={thermalActive ? 1.1 : 0} />
        </mesh>
        
        <mesh castShadow receiveShadow position={[-0.2, -0.6, 0]}>
          <boxGeometry args={[0.25, 0.8, 0.25]} />
          <meshStandardMaterial color={thermalActive ? "#ffc47d" : "#A52A2A"} emissive={thermalActive ? "#ff6a2a" : "#000000"} emissiveIntensity={thermalActive ? 1.1 : 0} />
        </mesh>
      </group>
    );
  }
  
  // Return the group that will hold the loaded model
  return (
    <group 
      ref={group} 
      visible={visible}
      name="merc"
      position={finalPosition}
      rotation={finalRotation}
      scale={scale}
    />
  );
}; 
