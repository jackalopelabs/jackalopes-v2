import { useAdventureDestructible, isAdventureObjectDestroyed } from './adventure-destructibles'
import { useRef, useState, useEffect } from 'react'
import { RigidBody, CylinderCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// Declare global types for live player data
declare global {
    interface Window {
        __localPlayerPosition?: THREE.Vector3
        __localPlayerInteract?: boolean
        __mushroomDestroyHandlers?: Record<string, () => void>
    }
}

interface MushroomProps {
    position: [number, number, number]
    id: string
    onEaten?: (id: string) => void
    onDestroyed?: (id: string) => void
}

/**
 * Mushroom component - A colorful toadstool that jackalopes can eat
 * Classic red cap with white spots design
 */
export const Mushroom: React.FC<MushroomProps> = ({
    position,
    id,
    onEaten,
    onDestroyed
}) => {
    const [isEaten, setIsEaten] = useState(false)
    const [isDestroyed, setIsDestroyed] = useState(false)
    const [isNearby, setIsNearby] = useState(false)
    const destroyedByWeapon = useAdventureDestructible(id, position, 0.65, !isEaten && !isDestroyed)
    const mushroomRef = useRef<THREE.Group>(null)
    const lastInteractPressed = useRef(false)

    // Interaction range in units
    const INTERACTION_RANGE = 2.5

    // Register destroy handler for projectile hits
    useEffect(() => {
        if (!window.__mushroomDestroyHandlers) {
            window.__mushroomDestroyHandlers = {}
        }

        window.__mushroomDestroyHandlers[id] = () => {
            if (!isEaten && !isDestroyed) {
                console.log(`[MUSHROOM] Mushroom ${id} destroyed by projectile!`)
                setIsDestroyed(true)
                onDestroyed?.(id)
            }
        }

        return () => {
            if (window.__mushroomDestroyHandlers) {
                delete window.__mushroomDestroyHandlers[id]
            }
        }
    }, [id, isEaten, isDestroyed, onDestroyed])

    // Check proximity to player and handle eating
    // CRITICAL: Read from window globals in useFrame, NOT from props (which are stale due to memoization)
    useFrame(() => {
        if (isEaten || destroyedByWeapon || isAdventureObjectDestroyed(id) || !mushroomRef.current) return

        // Read live player position from global (updated every frame by jackalope.tsx)
        const playerPosition = window.__localPlayerPosition
        if (!playerPosition) return

        // Read live interact state from global
        const interactPressed = window.__localPlayerInteract || false

        // Get mushroom world position
        const mushroomPos = new THREE.Vector3()
        mushroomRef.current.getWorldPosition(mushroomPos)

        // Calculate distance to player
        const distance = mushroomPos.distanceTo(playerPosition)
        const nowNearby = distance <= INTERACTION_RANGE

        setIsNearby(nowNearby)

        // Edge-triggered eating: only eat on the first frame interact is pressed while nearby
        if (nowNearby && interactPressed && !lastInteractPressed.current) {
            console.log(`[MUSHROOM] Eating mushroom ${id} at distance ${distance.toFixed(2)}`)
            setIsEaten(true)
            onEaten?.(id)
        }

        // Track last interact state for edge detection
        lastInteractPressed.current = interactPressed
    })

    // Don't render if eaten or destroyed
    if (isEaten || isDestroyed || destroyedByWeapon) return null

    return (
        <RigidBody
            type="fixed"
            position={position}
            colliders={false}
            name={`mushroom-${id}`}
            userData={{ isMushroom: true, mushroomId: id, adventureDestructibleId: id }}
        >
            {/* Cylinder collider roughly matching the mushroom shape */}
            <CylinderCollider args={[0.5, 0.35]} position={[0, 0.5, 0]} />

            <group ref={mushroomRef}>
                {/* Mushroom stem - white/cream colored cylinder */}
                <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
                    <cylinderGeometry args={[0.15, 0.2, 0.6, 8]} />
                    <meshStandardMaterial
                        color="#F5F5DC"
                        roughness={0.8}
                        metalness={0.1}
                    />
                </mesh>

                {/* Mushroom cap - red dome */}
                <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
                    <sphereGeometry args={[0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial
                        color="#DC143C"
                        roughness={0.6}
                        metalness={0.1}
                    />
                </mesh>

                {/* Cap underside - lighter color */}
                <mesh position={[0, 0.65, 0]} rotation={[Math.PI, 0, 0]} castShadow receiveShadow>
                    <coneGeometry args={[0.38, 0.15, 16]} />
                    <meshStandardMaterial
                        color="#FFE4C4"
                        roughness={0.9}
                        metalness={0.0}
                    />
                </mesh>

                {/* White spots on cap */}
                {[
                    [0, 0.85, 0.25],
                    [0.2, 0.78, -0.15],
                    [-0.18, 0.8, 0.12],
                    [0.12, 0.82, 0.18],
                    [-0.22, 0.75, -0.1],
                    [0.08, 0.88, -0.08],
                ].map((spotPos, idx) => (
                    <mesh
                        key={idx}
                        position={spotPos as [number, number, number]}
                        castShadow
                    >
                        <sphereGeometry args={[0.06 + Math.random() * 0.03, 8, 8]} />
                        <meshStandardMaterial
                            color="#FFFFFF"
                            roughness={0.7}
                            metalness={0.0}
                        />
                    </mesh>
                ))}

                {/* Glow effect when nearby */}
                {isNearby && (
                    <mesh position={[0, 0.5, 0]}>
                        <sphereGeometry args={[0.6, 16, 16]} />
                        <meshBasicMaterial
                            color="#FFD700"
                            transparent={true}
                            opacity={0.2}
                        />
                    </mesh>
                )}
            </group>
        </RigidBody>
    )
}

export default Mushroom
