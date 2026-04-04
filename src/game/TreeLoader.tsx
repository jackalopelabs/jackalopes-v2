import React, { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Environment } from '../assets'
import * as THREE from 'three'
import { RigidBody } from '@react-three/rapier'

// Helper function to categorize assets for scaling
const getAssetCategory = (path: string): 'tree' | 'bush' | 'plant' | 'rock' | 'other' => {
  const filename = path.split('/').pop()?.toLowerCase() || '';
  
  if (filename.includes('tree') || filename.includes('willow') || filename.includes('palm')) {
    return 'tree';
  } else if (filename.includes('bush') || filename.includes('cactus')) {
    return 'bush';
  } else if (filename.includes('plant') || filename.includes('flower') || filename.includes('grass') || 
             filename.includes('wheat') || filename.includes('corn') || filename.includes('lilypad')) {
    return 'plant';
  } else if (filename.includes('rock') || filename.includes('stump') || filename.includes('log')) {
    return 'rock';
  } else {
    return 'other';
  }
};

// Helper function to get appropriate scale based on asset type
const getAssetScale = (path: string, baseScale: number): number => {
  const category = getAssetCategory(path);
  
  switch (category) {
    case 'tree':
      return baseScale;
    case 'bush':
      return baseScale * 0.8;
    case 'plant':
      return baseScale * 0.6;
    case 'rock':
      return baseScale * 0.7;
    default:
      return baseScale;
  }
};

export const TreeLoader = ({ 
  position = [0, 0, 0] as [number, number, number],
  scale = 1,
  treeIndex = -1,
  treeType = '',  // Optional parameter to filter by type (e.g. 'tree', 'bush', etc)
}: {
  position?: [number, number, number];
  scale?: number;
  treeIndex?: number;
  treeType?: string;
}) => {
  // Filter assets by type if specified
  const availableAssets = useMemo(() => {
    if (!treeType) return Environment.Trees.LowpolyTrees;
    
    return Environment.Trees.LowpolyTrees.filter(path => {
      const category = getAssetCategory(path);
      return treeType === 'tree' 
        ? category === 'tree'
        : treeType === 'bush' 
          ? category === 'bush'
          : treeType === 'plant'
            ? category === 'plant'
            : treeType === 'rock'
              ? category === 'rock'
              : true;
    });
  }, [treeType]);
  
  // Generate a stable random index for this asset based on its position
  const stableAssetIndex = useMemo(() => {
    if (treeIndex >= 0) return treeIndex % availableAssets.length;
    
    // Create a deterministic hash from the position
    const positionHash = position[0] * 10000 + position[1] * 1000 + position[2] * 100;
    const hashValue = Math.abs(Math.sin(positionHash) * 10000);
    return Math.floor(hashValue % availableAssets.length);
  }, [position, treeIndex, availableAssets.length]);
  
  // Handle edge case where no assets match the filter
  if (availableAssets.length === 0) {
    console.warn(`No assets available for tree type: ${treeType}`);
    return null;
  }
  
  // Get the model path for the selected asset
  const modelPath = availableAssets[stableAssetIndex];
  
  // Calculate appropriate scale based on asset type
  const adjustedScale = getAssetScale(modelPath, scale);
  
  // Load the model with error handling
  const { scene } = useGLTF(modelPath);
  
  // Handle loading errors
  const modelScene = useMemo(() => {
    try {
      // Check if scene loaded properly
      if (!scene) {
        console.warn(`Failed to load model: ${modelPath}`);
        // Return a simple fallback box for the model
        return createFallbackModel(getAssetCategory(modelPath));
      }
      
      // Clone the scene to avoid reference issues
      return scene.clone();
    } catch (error) {
      console.error(`Error processing model: ${modelPath}`, error);
      // Return a simple fallback box as a last resort
      return createFallbackModel(getAssetCategory(modelPath));
    }
  }, [scene, modelPath]);
  
  // Determine if we need to adjust the Y position based on asset type
  const yOffset = useMemo(() => {
    const category = getAssetCategory(modelPath);
    return category === 'plant' || category === 'rock' ? -0.5 : 0;
  }, [modelPath]);
  
  const adjustedPosition: [number, number, number] = [
    position[0],
    position[1] + yOffset,
    position[2]
  ];
  
  return (
    <RigidBody 
      type="fixed" 
      position={adjustedPosition} 
      scale={adjustedScale}
      colliders="hull"
      friction={0.5}
      restitution={0.1}
    >
      <group>
        <primitive object={modelScene} />
      </group>
    </RigidBody>
  );
}

// Create a simple fallback model when asset loading fails
const createFallbackModel = (category: string) => {
  const fallbackScene = new THREE.Group();
  
  let geometry;
  let material;
  
  // Create different fallbacks based on category
  switch (category) {
    case 'tree':
      geometry = new THREE.ConeGeometry(0.5, 2, 5);
      material = new THREE.MeshStandardMaterial({ color: '#2D4A33' });
      break;
    case 'bush':
      geometry = new THREE.SphereGeometry(0.5, 6, 6);
      material = new THREE.MeshStandardMaterial({ color: '#3A5F3A' });
      break;
    case 'plant':
      geometry = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 5);
      material = new THREE.MeshStandardMaterial({ color: '#4F7942' });
      break;
    case 'rock':
      geometry = new THREE.DodecahedronGeometry(0.5, 0);
      material = new THREE.MeshStandardMaterial({ color: '#808080' });
      break;
    default:
      geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      material = new THREE.MeshStandardMaterial({ color: '#A0A0A0' });
  }
  
  const mesh = new THREE.Mesh(geometry, material);
  fallbackScene.add(mesh);
  
  return fallbackScene;
};

// Use try-catch when preloading to avoid breaking the application for missing assets
try {
  // Preload all asset models to prevent loading glitches
  Environment.Trees.LowpolyTrees.forEach(path => {
    useGLTF.preload(path);
  });
} catch (error) {
  console.warn('Failed to preload some tree assets', error);
}