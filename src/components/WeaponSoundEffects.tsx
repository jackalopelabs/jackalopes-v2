import { useThree } from '@react-three/fiber';
import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Sounds } from '../assets';

// Add a global volume control for weapon sounds
// This can be adjusted from anywhere in the app
export const WeaponSoundSettings = {
  volume: 0.1, // Default volume (quieter than before)
  masterMuted: false, // Add a flag to track if all audio is muted
  setVolume: (value: number) => {
    // Ensure volume is between 0 and 1
    WeaponSoundSettings.volume = Math.min(1, Math.max(0, value));
    console.log(`Weapon sound volume set to: ${WeaponSoundSettings.volume}`);
  },
  setMuted: (muted: boolean) => {
    WeaponSoundSettings.masterMuted = muted;
    console.log(`Weapon sounds ${muted ? 'muted' : 'unmuted'}`);
  }
};

/**
 * WeaponSoundEffects component handles weapon-related sound effects
 */
export const WeaponSoundEffects = () => {
  // Get camera to attach audio listener
  const { camera } = useThree();
  
  // Track if audio is loaded
  const [shotAudioLoaded, setShotAudioLoaded] = useState(false);
  // Track mute state
  const [audioMuted, setAudioMuted] = useState(false);
  
  // Web Audio API context and buffer
  const audioContextRef = useRef<AudioContext | null>(null);
  const shotBufferRef = useRef<AudioBuffer | null>(null);
  const isAudioInitializedRef = useRef(false);
  
  // Listen for audio settings changes from AudioController
  useEffect(() => {
    const handleAudioSettingsChanged = (event: CustomEvent<{masterVolume: number, muteAll?: boolean}>) => {
      const isMuted = event.detail.masterVolume === 0 || event.detail.muteAll === true;
      setAudioMuted(isMuted);
      WeaponSoundSettings.setMuted(isMuted);
      
      console.log(`Weapon sound settings updated from event: muted=${isMuted}`);
    };
    
    // Register for global audio settings changes
    window.addEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    
    return () => {
      window.removeEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    };
  }, []);
  
  // Initialize audio context properly
  useEffect(() => {
    // Create the audio context only when needed
    const initializeAudio = () => {
      if (isAudioInitializedRef.current) return;
      
      try {
        // Create a new audio context
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('Audio context created:', audioContextRef.current.state);
        
        // Load weapon sound
        fetch(Sounds.Weapons.MercShot.path)
          .then(response => {
            console.log('Shot sound file fetch response:', response.status, response.statusText);
            if (!response.ok) {
              throw new Error(`Failed to fetch sound: ${response.status} ${response.statusText}`);
            }
            return response.arrayBuffer();
          })
          .then(arrayBuffer => {
            console.log('Decoding audio data, size:', arrayBuffer.byteLength);
            if (!audioContextRef.current) {
              throw new Error('Audio context not available');
            }
            return audioContextRef.current.decodeAudioData(arrayBuffer);
          })
          .then(audioBuffer => {
            if (!audioBuffer) {
              throw new Error('Failed to decode audio buffer');
            }
            console.log('Audio data decoded successfully, duration:', audioBuffer.duration);
            shotBufferRef.current = audioBuffer;
            setShotAudioLoaded(true);
            isAudioInitializedRef.current = true;
            
            // Test play once
            setTimeout(() => {
              console.log('Testing shot sound...');
              playShotSound(WeaponSoundSettings.volume * 0.5); // Half of current volume for test
            }, 1000);
          })
          .catch(error => {
            console.error('Error loading shot sound:', error);
          });
          
        // Function to resume audio context on user interaction
        const resumeAudioContext = () => {
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume().then(() => {
              console.log('Audio context resumed');
            });
          }
        };
        
        // Add event listeners for user interaction to resume audio context
        const events = ['click', 'touchstart', 'keydown'];
        events.forEach(event => {
          document.addEventListener(event, resumeAudioContext, { once: true });
        });
        
        // Clean up event listeners
        return () => {
          events.forEach(event => {
            document.removeEventListener(event, resumeAudioContext);
          });
        };
      } catch (error) {
        console.error('Failed to initialize audio:', error);
      }
    };
    
    // Delay audio initialization until first interaction
    const handleFirstInteraction = () => {
      initializeAudio();
      // Remove event listeners once audio is initialized
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    
    // Set up event listeners for first interaction
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);
  
  // Modify the playShotSound function
  const playShotSound = (volume = 0.05) => {
    // Skip if audio is muted
    if (WeaponSoundSettings.masterMuted) {
      console.log('Shot sound skipped - audio is muted');
      return;
    }
    
    // Skip if audio is not initialized or context is not running
    if (!isAudioInitializedRef.current || !audioContextRef.current || !shotBufferRef.current) {
      console.log('Cannot play shot sound - audio not fully initialized');
      return;
    }
    
    // Skip if audio context is not running
    if (audioContextRef.current.state !== 'running') {
      console.log('Cannot play shot sound - audio context not running, attempting to resume');
      audioContextRef.current.resume().then(() => {
        console.log('Audio context resumed, retrying sound play');
        // Try again after resuming
        setTimeout(() => playShotSound(volume), 100);
      });
      return;
    }
    
    try {
      // Create source and gain node
      const source = audioContextRef.current.createBufferSource();
      const gainNode = audioContextRef.current.createGain();
      
      // Set up nodes
      source.buffer = shotBufferRef.current;
      gainNode.gain.value = volume;
      
      // Connect nodes
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      // Play sound
      source.start(0);
      console.log(`Shot sound played with Web Audio API (volume: ${volume})`);
    } catch (error) {
      console.error('Error playing shot sound:', error);
    }
  };
  
  // Expose the playShotSound function globally
  useEffect(() => {
    window.__playMercShot = () => {
      playShotSound(0.1); // Slightly higher volume for merc shots
    };
    
    // Listen for shot events
    const handleShotFired = () => {
      console.log('shotFired event received');
      playShotSound(0.1);
    };
    window.addEventListener('shotFired', handleShotFired);
    
    // Clean up
    return () => {
      delete window.__playMercShot;
      window.removeEventListener('shotFired', handleShotFired);
    };
  }, []);
  
  // Test shot sound
  useEffect(() => {
    // Test sound 1 second after component mounts
    if (isAudioInitializedRef.current) {
      setTimeout(() => {
        console.log('Testing shot sound...');
        playShotSound(0.05);
      }, 1000);
    }
  }, [isAudioInitializedRef.current]);
  
  // Test shot event dispatch
  useEffect(() => {
    if (isAudioInitializedRef.current) {
      setTimeout(() => {
        console.log('Testing shot event dispatch...');
        window.dispatchEvent(new Event('shotFired'));
      }, 2000);
    }
  }, [isAudioInitializedRef.current]);
  
  // This component doesn't render anything
  return null;
};

// Add TypeScript declaration for window.__playMercShot and __setWeaponVolume
declare global {
  interface Window {
    __playMercShot?: () => void;
    __setWeaponVolume?: (volume: number) => void;
    __getWeaponVolume?: () => number;
  }
} 