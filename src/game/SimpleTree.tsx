import React from 'react'
import * as THREE from 'three'

export const SimpleTree = ({ 
  position = [0, 0, 0] as [number, number, number],
  trunkHeight = 5,
  trunkRadius = 0.5,
  leavesRadius = 3,
  trunkColor = '#8B4513', // Brown color for trunk
  leavesColor = '#2E8B57', // Sea green for leaves
  scale = 1,
}: {
  position?: [number, number, number];
  trunkHeight?: number;
  trunkRadius?: number;
  leavesRadius?: number;
  trunkColor?: string;
  leavesColor?: string;
  scale?: number;
}) => {
  // Apply scale to all dimensions
  const scaledTrunkHeight = trunkHeight * scale;
  const scaledTrunkRadius = trunkRadius * scale;
  const scaledLeavesRadius = leavesRadius * scale;
  
  // Calculate positions
  const trunkPosition: [number, number, number] = [
    position[0], 
    position[1] + scaledTrunkHeight / 2, 
    position[2]
  ];
  
  const leavesPosition: [number, number, number] = [
    position[0], 
    position[1] + scaledTrunkHeight + scaledLeavesRadius * 0.7, 
    position[2]
  ];
  
  return (
    <group>
      {/* Tree trunk */}
      <mesh position={trunkPosition} castShadow receiveShadow>
        <cylinderGeometry args={[scaledTrunkRadius, scaledTrunkRadius * 1.2, scaledTrunkHeight, 8]} />
        <meshStandardMaterial 
          color={trunkColor} 
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
      
      {/* Tree leaves (cone shape) */}
      <mesh position={leavesPosition} castShadow receiveShadow>
        <coneGeometry args={[scaledLeavesRadius, scaledLeavesRadius * 2, 8]} />
        <meshStandardMaterial 
          color={leavesColor} 
          roughness={0.8}
          metalness={0.0}
        />
      </mesh>
    </group>
  );
} 