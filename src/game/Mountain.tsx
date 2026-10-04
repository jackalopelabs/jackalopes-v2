import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { createMountainGeometry, mountainRangeLayout, type MountainRangeOptions } from './mountain-geometry';
import { RigidBody } from '@react-three/rapier';

interface MountainProps {
  position: [number, number, number];
  scale?: number;
  height?: number;
  width?: number;
  depth?: number;
  color?: string;
  roughness?: number;
  seed?: number;
  adventureStyle?: boolean;
}

export const Mountain: React.FC<MountainProps> = ({
  position,
  scale = 1,
  height = 30,
  width = 20,
  depth = 20,
  color = '#4E342E',
  roughness = 0.9,
  adventureStyle = false,
  seed = Math.random() * 1000
}) => {
  const { geometry, rabbitHoleCut } = useMemo(() => createMountainGeometry({
    position, scale, height, width, depth, seed, color, roughness,
  }, adventureStyle), [width, depth, height, seed, scale, ...position, adventureStyle]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Create material
  const mountainMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      flatShading: true,
      side: THREE.DoubleSide
    });
  }, [color, roughness]);
  
  return (
    <RigidBody type="fixed" name={`mountain-${seed}`} position={position} colliders={rabbitHoleCut ? "trimesh" : "cuboid"}>
      <group scale={[scale, scale, scale]}>
        {/* Main mountain */}
        <mesh geometry={geometry} dispose={null} material={mountainMaterial} castShadow receiveShadow />
      </group>
    </RigidBody>
  );
};

// Create a mountain range (multiple mountains in a line)
interface MountainRangeProps extends MountainRangeOptions {
  adventureStyle?: boolean;
}

export const MountainRange: React.FC<MountainRangeProps> = ({
  position,
  count = 5,
  spread = 20,
  baseScale = 1,
  scaleVariation = 0.3,
  heightVariation = 0.4,
  adventureStyle = false
}) => {
  const mountains = useMemo(() => mountainRangeLayout({ position, count, spread, baseScale,
    scaleVariation, heightVariation }), [position, count, spread, baseScale, scaleVariation, heightVariation]);

  return <>{mountains.map(mountain => <Mountain key={mountain.seed} {...mountain} adventureStyle={adventureStyle} />)}</>;
}; 