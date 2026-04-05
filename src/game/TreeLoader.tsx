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
             filename.includes('wheat') || filename.includes('corn') || filename.includes('reed')) {
    return 'plant';
  } else if (filename.includes('rock') || filename.includes('stone')) {
    return 'rock';
  }
  return 'other';
}

// Scale factors by category for better visual proportions
const getCategoryScale = (category: 'tree' | 'bush' | 'plant' | 'rock' | 'other'): [number, number, number] => {
  switch (category) {
    case 'tree':
      return [3.2, 3.2, 3.2]
    case 'bush':
      return [2.2, 2.2, 2.2]
    case 'plant':
      return [2.6, 2.6, 2.6]
    case 'rock':
      return [2.4, 2.4, 2.4]
    default:
      return [2.5, 2.5, 2.5]
  }
}

interface TreeInstanceProps {
  path: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

const TreeInstance: React.FC<TreeInstanceProps> = ({ path, position, rotation = [0, 0, 0], scale }) => {
  const gltf = useGLTF(path)
  const cloned = useMemo(() => {
    const scene = gltf.scene.clone(true)
    scene.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return scene
  }, [gltf.scene])

  const category = getAssetCategory(path)
  const finalScale = scale || getCategoryScale(category)

  return (
    <RigidBody type="fixed" colliders="trimesh" position={position} rotation={rotation}>
      <primitive object={cloned} scale={finalScale} />
    </RigidBody>
  )
}

const fallbackGeometry = new THREE.ConeGeometry(1, 4, 8)
const fallbackMaterial = new THREE.MeshStandardMaterial({ color: '#3b6b3b' })

const FallbackTree: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <RigidBody type="fixed" colliders="cuboid" position={position}>
    <mesh geometry={fallbackGeometry} material={fallbackMaterial} castShadow receiveShadow position={[0, 2, 0]} />
  </RigidBody>
)

interface TreeLoaderProps {
  instances?: Array<{
    path: string
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
  }>
}

export const TreeLoader: React.FC<TreeLoaderProps> = ({ instances = [] }) => {
  return (
    <group>
      {instances.map((instance, index) => {
        if (!instance?.path) {
          return <FallbackTree key={`fallback-${index}`} position={instance.position || [0, 0, 0]} />
        }

        return (
          <React.Suspense key={`${instance.path}-${index}`} fallback={<FallbackTree position={instance.position} />}>
            <TreeInstance
              path={instance.path}
              position={instance.position}
              rotation={instance.rotation}
              scale={instance.scale}
            />
          </React.Suspense>
        )
      })}
    </group>
  )
}

export default TreeLoader
