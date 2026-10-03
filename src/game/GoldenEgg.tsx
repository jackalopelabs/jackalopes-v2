import { useAdventureDestructible, isAdventureObjectDestroyed } from './adventure-destructibles'
import { useRef, useState, useEffect } from 'react'
import { RigidBody, BallCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

declare global {
    interface Window {
        __localPlayerPosition?: THREE.Vector3
        __localPlayerInteract?: boolean
    }
}

interface GoldenEggProps {
    position: [number, number, number]
    id: string
    onEaten?: (id: string) => void
}

/**
 * Golden easter egg collectible for jackalopes.
 * Eaten with the same interact flow as mushrooms, but reserved for future magic powers.
 */
export const GoldenEgg: React.FC<GoldenEggProps> = ({
    position,
    id,
    onEaten
}) => {
    const [isEaten, setIsEaten] = useState(false)
    const [isNearby, setIsNearby] = useState(false)
    const destroyedByWeapon = useAdventureDestructible(id, position, 0.65, !isEaten)
    const eggRef = useRef<THREE.Group>(null)
    const shimmerRef = useRef<THREE.Group>(null)
    const lastInteractPressed = useRef(false)

    const INTERACTION_RANGE = 2.5

    useFrame((state) => {
        if (isEaten || destroyedByWeapon || isAdventureObjectDestroyed(id) || !eggRef.current) return

        const playerPosition = window.__localPlayerPosition
        if (!playerPosition) return

        const interactPressed = window.__localPlayerInteract || false

        const eggPos = new THREE.Vector3()
        eggRef.current.getWorldPosition(eggPos)

        const distance = eggPos.distanceTo(playerPosition)
        const nowNearby = distance <= INTERACTION_RANGE
        setIsNearby(nowNearby)

        if (nowNearby && interactPressed && !lastInteractPressed.current) {
            console.log(`[GOLDEN_EGG] Egg ${id} eaten at distance ${distance.toFixed(2)}`)
            setIsEaten(true)
            onEaten?.(id)
        }

        lastInteractPressed.current = interactPressed

        if (shimmerRef.current) {
            shimmerRef.current.rotation.y = state.clock.elapsedTime * 0.8
            const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.08
            shimmerRef.current.scale.setScalar(pulse)
        }
    })

    useEffect(() => {
        if (isEaten) {
            setIsNearby(false)
        }
    }, [isEaten])

    if (isEaten || destroyedByWeapon) return null

    return (
        <RigidBody
            type="fixed"
            position={position}
            colliders={false}
            name={`golden-egg-${id}`}
            userData={{ isGoldenEgg: true, goldenEggId: id, adventureDestructibleId: id }}
        >
            <BallCollider args={[0.42]} position={[0, 0.58, 0]} />

            <group ref={eggRef}>
                <group ref={shimmerRef}>
                    <group position={[0, 0.58, 0]} scale={[0.72, 0.96, 0.72]}>
                        <mesh castShadow receiveShadow>
                            <sphereGeometry args={[0.4, 24, 24]} />
                            <meshStandardMaterial
                                color="#FFD54A"
                                emissive="#FFCC33"
                                emissiveIntensity={0.8}
                                roughness={0.22}
                                metalness={0.65}
                            />
                        </mesh>

                        <mesh position={[0, 0.16, 0]} scale={[0.82, 0.9, 0.82]} castShadow receiveShadow>
                            <sphereGeometry args={[0.26, 20, 20]} />
                            <meshStandardMaterial
                                color="#E7A900"
                                roughness={0.25}
                                metalness={0.72}
                            />
                        </mesh>

                        <mesh position={[0, -0.2, 0]} scale={[0.62, 0.45, 0.62]} castShadow receiveShadow>
                            <sphereGeometry args={[0.22, 20, 20]} />
                            <meshStandardMaterial
                                color="#D99600"
                                roughness={0.28}
                                metalness={0.6}
                            />
                        </mesh>
                    </group>

                    <mesh position={[0.11, 0.82, 0.18]} rotation={[0.15, 0.4, -0.2]}>
                        <sphereGeometry args={[0.07, 10, 10]} />
                        <meshBasicMaterial color="#FFF7C2" transparent opacity={0.85} />
                    </mesh>
                </group>

                {isNearby && (
                    <mesh position={[0, 0.58, 0]}>
                        <sphereGeometry args={[0.78, 18, 18]} />
                        <meshBasicMaterial
                            color="#FFD700"
                            transparent
                            opacity={0.22}
                        />
                    </mesh>
                )}
            </group>
        </RigidBody>
    )
}

export default GoldenEgg
