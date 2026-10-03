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
 * FootstepAudio component creates spatial audio for player footsteps.
 * Keep it lightweight, this runs on the local merc and can easily become a perf tax.
 */
export const FootstepAudio: React.FC<FootstepAudioProps> = ({ playerRef, isWalking, isRunning }) => {
  const { camera } = useThree();

  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const walkingSoundRef = useRef<THREE.PositionalAudio | null>(null);
  const runningSoundRef = useRef<THREE.PositionalAudio | null>(null);
  const audioGroupRef = useRef<THREE.Group>(null);
  const walkingLoadedRef = useRef(false);
  const runningLoadedRef = useRef(false);

  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    masterVolume: 1.0,
    footstepsEnabled: true,
    walkingVolume: 0.3,
    runningVolume: 0.4,
    spatialAudioEnabled: true
  });

  useEffect(() => {
    const handleAudioSettingsChanged = (event: CustomEvent<AudioSettings>) => {
      setAudioSettings(event.detail);
    };

    window.addEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    return () => {
      window.removeEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (walkingSoundRef.current) {
      walkingSoundRef.current.setVolume(audioSettings.walkingVolume * audioSettings.masterVolume);
    }
    if (runningSoundRef.current) {
      runningSoundRef.current.setVolume(audioSettings.runningVolume * audioSettings.masterVolume);
    }
  }, [audioSettings.masterVolume, audioSettings.walkingVolume, audioSettings.runningVolume]);

  useEffect(() => {
    if (!audioGroupRef.current) return;

    let listener: THREE.AudioListener;
    let createdListener = false;

    const existingListener = camera.children.find(child => child instanceof THREE.AudioListener);
    if (existingListener) {
      listener = existingListener as THREE.AudioListener;
    } else {
      listener = new THREE.AudioListener();
      camera.add(listener);
      createdListener = true;
      camera.userData.mainAudioListener = listener;
    }

    listenerRef.current = listener;

    const audioLoader = new THREE.AudioLoader();

    const walkingSound = new THREE.PositionalAudio(listener);
    const runningSound = new THREE.PositionalAudio(listener);
    audioGroupRef.current.add(walkingSound);
    audioGroupRef.current.add(runningSound);
    walkingSoundRef.current = walkingSound;
    runningSoundRef.current = runningSound;

    const configureWalking = (buffer: AudioBuffer) => {
      walkingSound.setBuffer(buffer);
      walkingSound.setRefDistance(2);
      walkingSound.setRolloffFactor(2);
      walkingSound.setMaxDistance(30);
      walkingSound.setLoop(true);
      walkingSound.setVolume(audioSettings.walkingVolume * audioSettings.masterVolume);
      walkingLoadedRef.current = true;
    };

    const configureRunning = (buffer: AudioBuffer) => {
      runningSound.setBuffer(buffer);
      runningSound.setRefDistance(3);
      runningSound.setRolloffFactor(2);
      runningSound.setMaxDistance(40);
      runningSound.setLoop(true);
      runningSound.setVolume(audioSettings.runningVolume * audioSettings.masterVolume);
      runningLoadedRef.current = true;
    };

    const tryAlternativeAudioLoading = (
      url: string,
      onSuccess: (buffer: AudioBuffer) => void,
      onError: (error: any) => void
    ) => {
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(audioBuffer => {
          onSuccess(audioBuffer);
        })
        .catch(onError);
    };

    audioLoader.load(
      Sounds.Footsteps.MercWalking.path,
      configureWalking,
      undefined,
      (error) => {
        tryAlternativeAudioLoading(Sounds.Footsteps.MercWalking.path, configureWalking, (altError) => {
          console.error('Failed to load walking sound:', error, altError);
        });
      }
    );

    audioLoader.load(
      Sounds.Footsteps.MercRunning.path,
      configureRunning,
      undefined,
      (error) => {
        tryAlternativeAudioLoading(Sounds.Footsteps.MercRunning.path, configureRunning, (altError) => {
          console.error('Failed to load running sound:', error, altError);
        });
      }
    );

    return () => {
      if (walkingSoundRef.current) {
        if (walkingSoundRef.current.isPlaying) walkingSoundRef.current.stop();
        audioGroupRef.current?.remove(walkingSoundRef.current);
      }
      if (runningSoundRef.current) {
        if (runningSoundRef.current.isPlaying) runningSoundRef.current.stop();
        audioGroupRef.current?.remove(runningSoundRef.current);
      }
      walkingLoadedRef.current = false;
      runningLoadedRef.current = false;
      walkingSoundRef.current = null;
      runningSoundRef.current = null;

      if (createdListener) {
        camera.remove(listener);
      }
    };
  }, [camera]);

  useFrame(() => {
    if (!playerRef.current || !playerRef.current.rigidBody || !audioGroupRef.current) return;

    if (!audioSettings.footstepsEnabled) {
      if (walkingSoundRef.current?.isPlaying) walkingSoundRef.current.stop();
      if (runningSoundRef.current?.isPlaying) runningSoundRef.current.stop();
      return;
    }

    const position = playerRef.current.rigidBody.translation();
    if (!position || Number.isNaN(position.x) || Number.isNaN(position.y) || Number.isNaN(position.z)) {
      return;
    }

    audioGroupRef.current.position.set(position.x, position.y, position.z);

    if (walkingSoundRef.current && walkingLoadedRef.current) {
      if (isWalking && !isRunning) {
        if (!walkingSoundRef.current.isPlaying) {
          walkingSoundRef.current.play();
        }
      } else if (walkingSoundRef.current.isPlaying) {
        walkingSoundRef.current.stop();
      }
    }

    if (runningSoundRef.current && runningLoadedRef.current) {
      if (isRunning) {
        if (!runningSoundRef.current.isPlaying) {
          runningSoundRef.current.play();
        }
      } else if (runningSoundRef.current.isPlaying) {
        runningSoundRef.current.stop();
      }
    }
  });

  return <group ref={audioGroupRef} />;
};
