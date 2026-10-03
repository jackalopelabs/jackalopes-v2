import React, { useRef, useEffect, useState } from 'react'
import { RigidBody, CylinderCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Declare global types for decoy destroy handlers
declare global {
    interface Window {
        __decoyDestroyHandlers?: Record<string, () => void>
    }
}

interface JackalopeDecoyProps {
    id: string
    position: [number, number, number]
    rotation: number // Y-axis rotation in radians
    onDestroyed?: (id: string) => void
}

/**
 * A static jackalope decoy/clone - like prop hunt decoys
 * Spawns when a jackalope eats a mushroom
 */
export const JackalopeDecoy: React.FC<JackalopeDecoyProps> = ({
    id,
    position,
    rotation,
    onDestroyed
}) => {
    const groupRef = useRef<THREE.Group>(null)
    const [modelLoaded, setModelLoaded] = useState(false)
    const [isDestroyed, setIsDestroyed] = useState(false)

    // Register destroy handler for projectile hits
    useEffect(() => {
        if (!window.__decoyDestroyHandlers) {
            window.__decoyDestroyHandlers = {}
        }

        window.__decoyDestroyHandlers[id] = () => {
            if (!isDestroyed) {
                console.log(`[DECOY] Decoy ${id} destroyed by projectile!`)
                setIsDestroyed(true)
                onDestroyed?.(id)
            }
        }

        return () => {
            if (window.__decoyDestroyHandlers) {
                delete window.__decoyDestroyHandlers[id]
            }
        }
    }, [id, isDestroyed, onDestroyed])

    // Load the jackalope model once
    useEffect(() => {
        if (!groupRef.current) return

        const loader = new GLTFLoader()
        loader.load(
            '/jackalope.glb',
            (gltf) => {
                if (!groupRef.current) return

                // Clear any existing children
                while (groupRef.current.children.length) {
                    groupRef.current.remove(groupRef.current.children[0])
                }

                // Clone the scene so each decoy has its own instance
                const model = gltf.scene.clone()

                // Set up shadows
                model.traverse((child: any) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true
                        child.receiveShadow = true
                    }
                })

                // Auto-ground the model
                const box = new THREE.Box3().setFromObject(model)
                model.position.y -= box.min.y

                groupRef.current.add(model)
                setModelLoaded(true)

                console.log(`[DECOY] Spawned jackalope decoy ${id} at (${position.join(', ')})`)
            },
            undefined,
            (error) => {
                console.error(`[DECOY] Failed to load jackalope model for decoy ${id}:`, error)
            }
        )
    }, [id, position])

    // Don't render if destroyed
    if (isDestroyed) return null

    return (
        <RigidBody
            type="fixed"
            position={position}
            rotation={[0, rotation, 0]}
            colliders={false}
            name={`jackalope-decoy-${id}`}
            userData={{ isDecoy: true, decoyId: id }}
        >
            {/* Solid collider so projectile onCollisionEnter can destroy the decoy */}
            <CylinderCollider args={[1.0, 0.5]} position={[0, 1.0, 0]} />

            <group
                ref={groupRef}
                scale={[2, 2, 2]}  // Match the jackalope character scale
            />
        </RigidBody>
    )
}

export default JackalopeDecoy
