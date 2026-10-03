import { useAdventureDestructible } from './adventure-destructibles'
import React, { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Environment } from '../assets'
import * as THREE from 'three'
import { RigidBody } from '@react-three/rapier'

type AssetKind = 'tree' | 'bush' | 'plant' | 'rock' | 'log' | 'other'

type TreeLoaderInstance = {
  path: string
  position: [number, number, number]
  worldPosition?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
}

interface TreeLoaderProps {
  instances?: TreeLoaderInstance[]
  position?: [number, number, number]
  worldPosition?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
  treeType?: AssetKind
  adventureStyle?: boolean
}

const getAssetCategory = (path: string): AssetKind => {
  const filename = path.split('/').pop()?.toLowerCase() || ''

  if (filename.includes('woodlog') || filename.includes('treestump')) return 'log'
  if (filename.includes('tree') || filename.includes('willow') || filename.includes('palm')) return 'tree'
  if (filename.includes('bush') || filename.includes('cactus')) return 'bush'
  if (
    filename.includes('plant') ||
    filename.includes('flower') ||
    filename.includes('grass') ||
    filename.includes('wheat') ||
    filename.includes('corn') ||
    filename.includes('reed')
  ) {
    return 'plant'
  }
  if (filename.includes('rock') || filename.includes('stone')) return 'rock'
  return 'other'
}

const getCategoryScale = (category: AssetKind): [number, number, number] => {
  switch (category) {
    case 'tree':
      return [3.2, 3.2, 3.2]
    case 'bush':
      return [2.2, 2.2, 2.2]
    case 'plant':
      return [2.6, 2.6, 2.6]
    case 'rock':
      return [2.4, 2.4, 2.4]
    case 'log':
      return [2.8, 2.8, 2.8]
    default:
      return [2.5, 2.5, 2.5]
  }
}

const toScaleTuple = (
  scale: [number, number, number] | number | undefined,
  fallback: [number, number, number]
): [number, number, number] => {
  if (Array.isArray(scale)) return scale
  if (typeof scale === 'number') return [scale, scale, scale]
  return fallback
}

const hashPosition = (position: [number, number, number]) => {
  const [x, y, z] = position
  return Math.abs(Math.floor(x * 13 + y * 7 + z * 17))
}

const getPathsForKind = (kind: AssetKind): string[] => {
  const paths = Environment.Trees.LowpolyTrees
  return paths.filter((path) => {
    const category = getAssetCategory(path)
    if (kind === 'other') return true
    if (kind === 'log') return category === 'log'
    if (kind === 'tree') return category === 'tree'
    if (kind === 'bush') return category === 'bush'
    if (kind === 'plant') return category === 'plant'
    if (kind === 'rock') return category === 'rock'
    return false
  })
}

const buildLegacyInstance = (
  position: [number, number, number],
  rotation: [number, number, number] | undefined,
  scale: [number, number, number] | number | undefined,
  treeType: AssetKind | undefined
): TreeLoaderInstance | null => {
  const kind = treeType || 'tree'
  const candidates = getPathsForKind(kind)
  if (candidates.length === 0) return null

  const selectedPath = candidates[hashPosition(position) % candidates.length]
  const defaultScale = getCategoryScale(kind)

  let finalRotation = rotation || [0, 0, 0]
  if (kind === 'log') {
    finalRotation = [0, (hashPosition(position) % 8) * (Math.PI / 8), Math.PI / 2]
  }

  return {
    path: selectedPath,
    position,
    rotation: finalRotation,
    scale: toScaleTuple(scale, defaultScale),
  }
}

const TreeInstance: React.FC<TreeLoaderInstance & { adventureStyle?: boolean }> = ({
  path, position, worldPosition, rotation = [0, 0, 0], scale, adventureStyle = false,
}) => {
  const gltf = useGLTF(path)
  const { cloned, ownedMaterials } = useMemo(() => {
    const scene = gltf.scene.clone(true)
    const materialCopies = new Map<THREE.Material, THREE.Material>()
    const category = getAssetCategory(path)
    const tint = new THREE.Color(category === 'rock' ? '#7d929d'
      : category === 'log' ? '#a18a6d' : '#71978a')
    const polishMaterial = (source: THREE.Material): THREE.Material => {
      const existing = materialCopies.get(source)
      if (existing) return existing
      // GLTF scenes share cached materials. Only this instance's clones are
      // modified/disposed; maps and vertex colors remain the artist's originals.
      const copy = source.clone()
      if (copy instanceof THREE.MeshStandardMaterial) {
        copy.color.lerp(tint, 0.09)
        copy.roughness = Math.max(copy.roughness, 0.82)
        copy.metalness = Math.min(copy.metalness, 0.12)
        copy.flatShading = true
        copy.dithering = true
        copy.needsUpdate = true
      }
      materialCopies.set(source, copy)
      return copy
    }
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (adventureStyle) {
          child.material = Array.isArray(child.material)
            ? child.material.map(polishMaterial)
            : polishMaterial(child.material)
        }
      }
    })
    return { cloned: scene, ownedMaterials: [...materialCopies.values()] }
  }, [gltf.scene, path, adventureStyle])

  useEffect(() => () => {
    ownedMaterials.forEach((material) => material.dispose())
  }, [ownedMaterials])

  const category = getAssetCategory(path)
  const finalScale = toScaleTuple(scale, getCategoryScale(category))
  const useCollider = category === 'rock' || category === 'tree'
  const destructible = adventureStyle && ['tree', 'bush', 'plant'].includes(category)
  const targetPosition = worldPosition || position
  const target = useMemo(() => {
    // Stable across clients, independent of asset load or instance ordering.
    const key = `${path}:${targetPosition.join(',')}`
    let hash = 2166136261
    for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619)
    const id = `vegetation-${(hash >>> 0).toString(16)}`
    if (category === 'tree') return { id, position: targetPosition, height: 1.5, radius: 1.1 }
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...targetPosition),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...finalScale))
    const bounds = new THREE.Box3().setFromObject(gltf.scene).applyMatrix4(transform)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    return { id, position: center.toArray() as [number, number, number], height: 0,
      radius: Math.max(0.3, Math.min(1.5, size.length() * 0.4)) }
  }, [path, targetPosition[0], targetPosition[1], targetPosition[2], rotation[0], rotation[1], rotation[2],
    finalScale[0], finalScale[1], finalScale[2], category, gltf.scene])
  const destroyedByWeapon = useAdventureDestructible(target.id, target.position, target.radius,
    destructible, target.height, destructible)
  if (destructible && destroyedByWeapon) return null


  if (!useCollider) {
    return <primitive object={cloned} position={position} rotation={rotation} scale={finalScale} />
  }

  return (
    <RigidBody type="fixed" colliders="trimesh" position={position} rotation={rotation} userData={destructible ? { adventureDestructibleId: target.id } : undefined}>
      <primitive object={cloned} scale={finalScale} />
    </RigidBody>
  )
}

const fallbackGeometry = new THREE.ConeGeometry(1, 4, 8)
const fallbackMaterial = new THREE.MeshStandardMaterial({ color: '#3b6b3b' })

const FallbackTree: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <mesh geometry={fallbackGeometry} material={fallbackMaterial} castShadow receiveShadow position={[position[0], position[1] + 2, position[2]]} />
)

export const TreeLoader: React.FC<TreeLoaderProps> = ({
  instances = [],
  position,
  worldPosition,
  rotation,
  scale,
  treeType,
  adventureStyle = false,
}) => {
  const normalizedInstances = useMemo(() => {
    if (instances.length > 0) return instances
    if (position) {
      const legacyInstance = buildLegacyInstance(position, rotation, scale, treeType)
      return legacyInstance ? [{ ...legacyInstance, worldPosition }] : []
    }
    return []
  }, [instances, position, worldPosition, rotation, scale, treeType])

  return (
    <group>
      {normalizedInstances.map((instance, index) => {
        if (!instance?.path) {
          return <FallbackTree key={`fallback-${index}`} position={instance.position || [0, 0, 0]} />
        }

        return (
          <React.Suspense key={`${instance.path}-${index}`} fallback={<FallbackTree position={instance.position} />}>
            <TreeInstance
              adventureStyle={adventureStyle}
              path={instance.path}
              position={instance.position}
              worldPosition={instance.worldPosition}
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
