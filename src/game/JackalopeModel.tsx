import React, { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

// Updated JackalopeModel that uses proper GLB model with animations
export const JackalopeModel = ({ 
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
  
  // Load the jackalope.glb model
  useEffect(() => {
    try {
      const loader = new GLTFLoader();
      loader.load(
        '/jackalope.glb', 
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
            
            // Auto-ground: measure bounding box and shift model so feet touch Y=0
            const box = new THREE.Box3().setFromObject(gltf.scene);
            console.log(`🐰 JackalopeModel bounds: min.y=${box.min.y.toFixed(3)}, max.y=${box.max.y.toFixed(3)}, height=${(box.max.y - box.min.y).toFixed(3)}`);
            // Shift the scene so the bottom of the model sits at local Y=0
            gltf.scene.position.y -= box.min.y;
            console.log(`🐰 JackalopeModel auto-grounded: shifted Y by ${(-box.min.y).toFixed(3)}`);

            // Add the loaded model to our group
            group.current.add(gltf.scene);
            
            // If there are animations in the GLB, store them
            if (gltf.animations && gltf.animations.length > 0) {
              const clips: Record<string, THREE.AnimationClip> = {};
              gltf.animations.forEach((clip: THREE.AnimationClip) => {
                clips[clip.name] = clip;
              });
              setAnimationClips(clips);
              console.log('Loaded animations from jackalope.glb:', Object.keys(clips).join(', '));
            }
            
            setModelLoaded(true);
          }
        },
        // Progress callback
        (xhr: any) => {
          console.log(`Loading jackalope.glb: ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        // Error callback
        (error: any) => {
          console.error('Error loading jackalope.glb model:', error);
          setModelError(true);
        }
      );
      
    } catch (error) {
      console.error('Error in Jackalope model loading:', error);
      setModelError(true);
    }
  }, []);
  
  // Handle animations
  useEffect(() => {
    if (!group.current || !animationClips || Object.keys(animationClips).length === 0) return;
    
    // Create mixer
    const mixer = new THREE.AnimationMixer(group.current);
    let currentAction: THREE.AnimationAction | null = null;
    
    // If we have the requested animation
    if (animation && animationClips[animation]) {
      currentAction = mixer.clipAction(animationClips[animation]);
      currentAction.play();
    } else if (animationClips['idle']) {
      // Fall back to idle if available and requested animation doesn't exist
      currentAction = mixer.clipAction(animationClips['idle']);
      currentAction.play();
    }
    
    // Animation loop
    const clock = new THREE.Clock();
    const animateModel = () => {
      if (mixer) {
        mixer.update(clock.getDelta());
      }
      requestAnimationFrame(animateModel);
    };
    
    // Start animation loop
    const animationId = requestAnimationFrame(animateModel);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      if (currentAction) currentAction.stop();
      mixer.stopAllAction();
      if (group.current) {
        mixer.uncacheRoot(group.current);
      }
    };
  }, [animation, animationClips, modelLoaded]);
  
  // If you're inside the JackalopeModel component
  // Add better error logging and handling
  useEffect(() => {
    // Log when the component mounts
    console.log("JackalopeModel component mounted");
    
    // Check if model is loaded
    const checkModelLoaded = () => {
      if (group.current) {
        console.log("Loading jackalope.glb: 100% loaded");
      } else {
        console.warn("JackalopeModel not loaded yet, retrying...");
        // Try again in a short while
        setTimeout(checkModelLoaded, 500);
      }
    };
    
    // Start checking if model is loaded
    checkModelLoaded();
    
    return () => {
      console.log("JackalopeModel component unmounted");
    };
  }, []);
  
  // If there was an error loading the model, show a simplified version as fallback
  if (modelError) {
    return (
      <group 
        ref={group} 
        visible={visible}
        name="jackalope-fallback"
        position={finalPosition}
        rotation={finalRotation}
        scale={scale}
      >
        {/* Body */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.6, 1.4, 0.4]} />
          <meshStandardMaterial color="#4682B4" /> {/* Blue color for jackalope */}
        </mesh>
        
        {/* Head */}
        <mesh castShadow receiveShadow position={[0, 0.9, 0]}>
          <boxGeometry args={[0.35, 0.35, 0.35]} />
          <meshStandardMaterial color="#4682B4" />
        </mesh>
        
        {/* Antlers/Ears */}
        <group position={[0.15, 1.2, 0]} rotation={[0, 0, Math.PI/6]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.4]} />
            <meshStandardMaterial color="#6495ED" />
          </mesh>
        </group>
        
        <group position={[-0.15, 1.2, 0]} rotation={[0, 0, -Math.PI/6]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.4]} />
            <meshStandardMaterial color="#6495ED" />
          </mesh>
        </group>
        
        {/* Arms */}
        <mesh castShadow receiveShadow position={[0.4, 0.5, 0]}>
          <boxGeometry args={[0.15, 0.7, 0.15]} />
          <meshStandardMaterial color="#4169E1" />
        </mesh>
        
        <mesh castShadow receiveShadow position={[-0.4, 0.5, 0]}>
          <boxGeometry args={[0.15, 0.7, 0.15]} />
          <meshStandardMaterial color="#4169E1" />
        </mesh>
        
        {/* Legs */}
        <mesh castShadow receiveShadow position={[0.2, -0.5, 0]}>
          <boxGeometry args={[0.2, 0.7, 0.2]} />
          <meshStandardMaterial color="#4169E1" />
        </mesh>
        
        <mesh castShadow receiveShadow position={[-0.2, -0.5, 0]}>
          <boxGeometry args={[0.2, 0.7, 0.2]} />
          <meshStandardMaterial color="#4169E1" />
        </mesh>
      </group>
    );
  }
  
  // Return the group that will hold the loaded model
  return (
    <group 
      ref={group} 
      visible={visible}
      name="jackalope"
      position={finalPosition}
      rotation={finalRotation}
      scale={scale}
    />
  );
};

/*
 * ANIMATION SUPPORT - COMMENTED OUT FOR FUTURE USE
 * 
 * To enable animations:
 * 1. Import useAnimations from '@react-three/drei'
 * 2. Uncomment the animation-related code below and in the component
 * 3. Add animations to the jackalope.glb model
 */

/*
import { useAnimations } from '@react-three/drei'

// In the component:
const { scene, animations } = useGLTF(JackalopeModelPath);
const { actions, mixer } = useAnimations(animations, scene);
const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);

// Handle animation changes
useEffect(() => {
  if (!mixer || !actions) return;
  
  // Log the requested animation
  console.log(`Jackalope animation requested: "${animation}"`);
  console.log(`Available jackalope actions:`, Object.keys(actions));
  
  // Handle animations directly based on name
  // Special handling for idle - always use 'idle' animation
  if (animation === 'idle') {
    if (actions['idle']) {
      console.log(`Playing exact jackalope idle animation`);
      const idleAction = actions['idle'];
      
      // Check if already playing this animation
      if (currentAnimation !== 'idle') {
        // If walk is currently playing, fade it out
        if (actions['walk'] && actions['walk'].isRunning()) {
          // Longer fade for smoother transition (0.5s)
          actions['walk'].fadeOut(0.5);
        }
        
        // Start idle with fade-in
        idleAction.reset().fadeIn(0.5).play();
        idleAction.timeScale = 1.0;
        setCurrentAnimation('idle');
      } else {
        // Already playing idle, just ensure it's active
        if (!idleAction.isRunning()) {
          idleAction.reset().fadeIn(0.3).play();
          idleAction.timeScale = 1.0;
        }
      }
    } else {
      console.warn('Idle animation not found for jackalope');
    }
  } 
  // For walk animation
  else if (animation === 'walk') {
    // ... similar handling for walk
  }
  // For run animation 
  else if (animation === 'run') {
    // ... similar handling for run
  }
}, [animation, actions, mixer]);
*/ 