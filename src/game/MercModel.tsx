import React, { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

// Updated MercModel that uses proper GLB model with animations
export const MercModel = ({ 
  animation = 'idle',
  visible = true, 
  position = [0, 0, 0] as [number, number, number],
  rotation = [0, 0, 0] as [number, number, number],
  scale = [1, 1, 1] as [number, number, number]
}: {
  animation?: string;
  visible?: boolean;
  position?: [number, number, number] | THREE.Vector3;
  rotation?: [number, number, number] | THREE.Euler;
  scale?: [number, number, number];
}) => {
  const group = useRef<THREE.Group>(null);
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
            group.current.add(gltf.scene);
            
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

    // Resolve clip: requested → idle → first available
    const clip = animationClips[animation]
      || animationClips['idle']
      || Object.values(animationClips)[0];
    if (!clip) return; // no clips at all

    const nextAction = mixer.clipAction(clip);
    const prev = activeActionRef.current;

    if (prev && prev !== nextAction) {
      // Cross-fade from previous action
      nextAction.reset().setEffectiveWeight(1).play();
      prev.crossFadeTo(nextAction, 0.25, true);
    } else if (!prev) {
      nextAction.reset().play();
    }
    // If prev === nextAction, it's already playing — do nothing (no T-pose flicker)

    activeActionRef.current = nextAction;
  }, [animation, animationClips]);
  
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
          <meshStandardMaterial color="#CD5C5C" /> {/* Red color for merc */}
        </mesh>
        
        {/* Head */}
        <mesh castShadow receiveShadow position={[0, 1.0, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#CD5C5C" />
        </mesh>
        
        {/* Helmet/Hat */}
        <mesh castShadow position={[0, 1.25, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.15]} />
          <meshStandardMaterial color="#8B0000" />
        </mesh>
        
        {/* Arms */}
        <mesh castShadow receiveShadow position={[0.45, 0.6, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <meshStandardMaterial color="#A52A2A" />
        </mesh>
        
        <mesh castShadow receiveShadow position={[-0.45, 0.6, 0]}>
          <boxGeometry args={[0.2, 0.8, 0.2]} />
          <meshStandardMaterial color="#A52A2A" />
        </mesh>
        
        {/* Legs */}
        <mesh castShadow receiveShadow position={[0.2, -0.6, 0]}>
          <boxGeometry args={[0.25, 0.8, 0.25]} />
          <meshStandardMaterial color="#A52A2A" />
        </mesh>
        
        <mesh castShadow receiveShadow position={[-0.2, -0.6, 0]}>
          <boxGeometry args={[0.25, 0.8, 0.25]} />
          <meshStandardMaterial color="#A52A2A" />
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