import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface ScreenShakeProps {
  intensity?: number;
  decay?: number;
}

/**
 * ScreenShake component - add inside <Canvas> to enable screen shake.
 * Dispatch 'screenshake' custom event with { intensity, duration } to trigger.
 */
export const ScreenShake: React.FC<ScreenShakeProps> = ({
  intensity = 0.3,
  decay = 8,
}) => {
  const { camera } = useThree();
  const shakeIntensity = useRef(0);
  const shakeOffset = useRef(new THREE.Vector3());

  useEffect(() => {
    const handleShake = (e: CustomEvent) => {
      const detail = e.detail || {};
      shakeIntensity.current = Math.max(
        shakeIntensity.current,
        detail.intensity ?? intensity
      );
    };

    window.addEventListener('screenshake', handleShake as EventListener);
    return () => window.removeEventListener('screenshake', handleShake as EventListener);
  }, [intensity]);

  useFrame((_, delta) => {
    if (shakeIntensity.current > 0.001) {
      // Remove previous offset
      camera.position.sub(shakeOffset.current);

      // Calculate new shake
      const mag = shakeIntensity.current;
      shakeOffset.current.set(
        (Math.random() - 0.5) * 2 * mag,
        (Math.random() - 0.5) * 2 * mag * 0.5,
        (Math.random() - 0.5) * 2 * mag * 0.3,
      );

      // Apply
      camera.position.add(shakeOffset.current);

      // Decay
      shakeIntensity.current *= Math.max(0, 1 - decay * delta);
    } else if (shakeOffset.current.lengthSq() > 0) {
      camera.position.sub(shakeOffset.current);
      shakeOffset.current.set(0, 0, 0);
      shakeIntensity.current = 0;
    }
  });

  return null;
};

// Helper to trigger screen shake from anywhere
export const triggerScreenShake = (intensity = 0.3) => {
  window.dispatchEvent(new CustomEvent('screenshake', {
    detail: { intensity }
  }));
};

export default ScreenShake;
