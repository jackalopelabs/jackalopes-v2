import { useThree, useFrame } from '@react-three/fiber';
import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Sounds } from '../assets';

interface FootstepAudioProps {
  playerRef: React.RefObject<any>;
  isWalking: boolean;
  isRunning: boolean;
}

interface AudioSettings {
  masterVolume: number;
  footstepsEnabled: boolean;
  walkingVolume: number;
  runningVolume: number;
  spatialAudioEnabled: boolean;
}

/**
 * FootstepAudio component creates spatial audio for player footsteps
 * It attaches to the player and plays different sounds for walking and running
 */
export const FootstepAudio: React.FC<FootstepAudioProps> = ({ playerRef, isWalking, isRunning }) => {
  // Get camera to attach audio listener
  const { camera } = useThree();
  
  // References for audio objects
  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const walkingSoundRef = useRef<THREE.PositionalAudio | null>(null);
  const runningSoundRef = useRef<THREE.PositionalAudio | null>(null);
  const audioLoaderRef = useRef<THREE.AudioLoader | null>(null);
  
  // Create a ref for the audio group to position it with the player
  const audioGroupRef = useRef<THREE.Group>(null);
  
  // Track when audio is loaded
  const [walkingAudioLoaded, setWalkingAudioLoaded] = useState(false);
  const [runningAudioLoaded, setRunningAudioLoaded] = useState(false);
  
  // Track audio settings
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    masterVolume: 1.0,
    footstepsEnabled: true,
    walkingVolume: 0.3,
    runningVolume: 0.4,
    spatialAudioEnabled: true
  });
  
  // Listen for audio settings changes
  useEffect(() => {
    const handleAudioSettingsChanged = (event: CustomEvent<AudioSettings>) => {
      setAudioSettings(event.detail);
      
      // Apply volume settings immediately
      if (walkingSoundRef.current) {
        walkingSoundRef.current.setVolume(event.detail.walkingVolume * event.detail.masterVolume);
      }
      
      if (runningSoundRef.current) {
        runningSoundRef.current.setVolume(event.detail.runningVolume * event.detail.masterVolume);
      }
    };
    
    // Register event listener
    window.addEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    };
  }, []);
  
  // Set up audio system on component mount
  useEffect(() => {
    if (!audioGroupRef.current) return;
    
    console.log('Setting up footstep audio system');
    console.log('Walking audio file path:', Sounds.Footsteps.MercWalking.path);
    console.log('Running audio file path:', Sounds.Footsteps.MercRunning.path);
    
    // Create audio listener if not already present on camera
    let listener: THREE.AudioListener;
    
    // Check for existing global audio listeners to prevent duplicates
    const existingListener = camera.children.find(child => child instanceof THREE.AudioListener);
    
    if (existingListener) {
      console.log('Using existing audio listener for footstep sounds');
      listener = existingListener as THREE.AudioListener;
    } else {
      console.log('Creating new audio listener for footstep sounds');
      listener = new THREE.AudioListener();
      camera.add(listener);
      // Mark this listener as the main audio listener for the app
      camera.userData.mainAudioListener = listener;
    }
    
    listenerRef.current = listener;
    
    // Create audio loader
    const audioLoader = new THREE.AudioLoader();
    audioLoaderRef.current = audioLoader;
    
    // Create positional audio for walking and add to audio group
    const walkingSound = new THREE.PositionalAudio(listener);
    audioGroupRef.current.add(walkingSound);
    walkingSoundRef.current = walkingSound;
    console.log('Created walking sound object');
    
    // Create positional audio for running and add to audio group
    const runningSound = new THREE.PositionalAudio(listener);
    audioGroupRef.current.add(runningSound);
    runningSoundRef.current = runningSound;
    console.log('Created running sound object');
    
    // Try alternative loading approach for browsers that might struggle with OGG files
    const tryAlternativeAudioLoading = (url: string, onSuccess: (buffer: AudioBuffer) => void, onError: (error: any) => void) => {
      console.log(`Trying alternative loading for ${url}`);
      
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          // Create AudioContext and decode the buffer
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(audioBuffer => {
          onSuccess(audioBuffer);
        })
        .catch(error => {
          console.error(`Alternative loading failed for ${url}:`, error);
          onError(error);
        });
    };
    
    // Load walking sound
    console.log('Loading walking sound from:', Sounds.Footsteps.MercWalking.path);
    audioLoader.load(Sounds.Footsteps.MercWalking.path, 
      (buffer) => {
        console.log('Walking sound buffer loaded successfully, size:', buffer.duration);
        walkingSound.setBuffer(buffer);
        walkingSound.setRefDistance(2); // Reduce reference distance for better spatialization
        walkingSound.setRolloffFactor(2); // Increase rolloff for more dramatic distance effect
        walkingSound.setMaxDistance(30); // Maximum distance at which the sound can be heard
        walkingSound.setLoop(true);
        walkingSound.setVolume(audioSettings.walkingVolume * audioSettings.masterVolume);
        setWalkingAudioLoaded(true);
        console.log('Walking sound configured successfully');
      }, 
      (progress) => {
        console.log('Walking sound loading progress:', Math.round(progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('Error loading walking sound:', error);
        console.log('Trying alternative loading method for walking sound');
        tryAlternativeAudioLoading(
          Sounds.Footsteps.MercWalking.path,
          (buffer) => {
            walkingSound.setBuffer(buffer);
            walkingSound.setRefDistance(2);
            walkingSound.setRolloffFactor(2);
            walkingSound.setMaxDistance(30);
            walkingSound.setLoop(true);
            walkingSound.setVolume(audioSettings.walkingVolume * audioSettings.masterVolume);
            setWalkingAudioLoaded(true);
            console.log('Walking sound loaded with alternative method');
          },
          (altError) => {
            console.error('Alternative walking sound loading also failed:', altError);
          }
        );
      }
    );
    
    // Load running sound
    console.log('Loading running sound from:', Sounds.Footsteps.MercRunning.path);
    audioLoader.load(Sounds.Footsteps.MercRunning.path, 
      (buffer) => {
        console.log('Running sound buffer loaded successfully, size:', buffer.duration);
        runningSound.setBuffer(buffer);
        runningSound.setRefDistance(3); // Reduce reference distance for better spatialization
        runningSound.setRolloffFactor(2); // Increase rolloff for more dramatic distance effect
        runningSound.setMaxDistance(40); // Maximum distance at which the sound can be heard
        runningSound.setLoop(true);
        runningSound.setVolume(audioSettings.runningVolume * audioSettings.masterVolume);
        setRunningAudioLoaded(true);
        console.log('Running sound configured successfully');
      },
      (progress) => {
        console.log('Running sound loading progress:', Math.round(progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('Error loading running sound:', error);
        console.log('Trying alternative loading method for running sound');
        tryAlternativeAudioLoading(
          Sounds.Footsteps.MercRunning.path,
          (buffer) => {
            runningSound.setBuffer(buffer);
            runningSound.setRefDistance(3);
            runningSound.setRolloffFactor(2);
            runningSound.setMaxDistance(40);
            runningSound.setLoop(true);
            runningSound.setVolume(audioSettings.runningVolume * audioSettings.masterVolume);
            setRunningAudioLoaded(true);
            console.log('Running sound loaded with alternative method');
          },
          (altError) => {
            console.error('Alternative running sound loading also failed:', altError);
          }
        );
      }
    );
    
    // Cleanup on unmount
    return () => {
      if (walkingSoundRef.current) {
        walkingSoundRef.current.stop();
        audioGroupRef.current?.remove(walkingSoundRef.current);
      }
      if (runningSoundRef.current) {
        runningSoundRef.current.stop();
        audioGroupRef.current?.remove(runningSoundRef.current);
      }
      // Only remove the listener if we created it
      if (listener && !camera.userData.persistentListener) {
        camera.remove(listener);
      }
    };
  }, [camera, audioGroupRef.current, audioSettings.masterVolume, audioSettings.walkingVolume, audioSettings.runningVolume]);
  
  // Update audio position and play/stop as needed
  useFrame(() => {
    if (!playerRef.current || !playerRef.current.rigidBody || !audioGroupRef.current) return;
    
    // Skip processing if footsteps are disabled
    if (!audioSettings.footstepsEnabled) {
      // Make sure all sounds are stopped
      if (walkingSoundRef.current?.isPlaying) walkingSoundRef.current.stop();
      if (runningSoundRef.current?.isPlaying) runningSoundRef.current.stop();
      return;
    }
    
    // Get player position
    const position = playerRef.current.rigidBody.translation();
    
    // Check if position is valid (not NaN or undefined)
    if (position && !Number.isNaN(position.x) && !Number.isNaN(position.y) && !Number.isNaN(position.z)) {
      // Update audio group position to match player
      audioGroupRef.current.position.set(position.x, position.y, position.z);
      
      // Debug position occasionally
      if (Math.random() < 0.001) {
        console.log('Footstep audio position:', position);
        console.log('Player state:', { isWalking, isRunning });
        console.log('Audio loaded state:', { walkingAudioLoaded, runningAudioLoaded });
        console.log('Audio playing state:', { 
          walkingPlaying: walkingSoundRef.current?.isPlaying,
          runningPlaying: runningSoundRef.current?.isPlaying
        });
      }
      
      // Handle walking sound - FIX: directly check the isWalking prop
      if (walkingSoundRef.current && walkingAudioLoaded) {
        // Play walking sound as soon as isWalking is true and we're not running
        if (isWalking && !isRunning) {
          if (!walkingSoundRef.current.isPlaying) {
            console.log('Starting walking sound - walking state detected');
            walkingSoundRef.current.play();
          }
        } 
        // Stop walking sound if we're not walking or if we're running
        else if ((!isWalking || isRunning) && walkingSoundRef.current.isPlaying) {
          console.log('Stopping walking sound - no longer walking or now running');
          walkingSoundRef.current.stop();
        }
      }
      
      // Handle running sound - same direct check approach
      if (runningSoundRef.current && runningAudioLoaded) {
        // Play running sound as soon as isRunning is true
        if (isRunning) {
          if (!runningSoundRef.current.isPlaying) {
            console.log('Starting running sound - running state detected');
            runningSoundRef.current.play();
          }
        } 
        // Stop running sound if we're not running
        else if (!isRunning && runningSoundRef.current.isPlaying) {
          console.log('Stopping running sound - no longer running');
          runningSoundRef.current.stop();
        }
      }
    }
  });
  
  // Render an audio group that we'll position with the player
  return <group ref={audioGroupRef} />;
}; 