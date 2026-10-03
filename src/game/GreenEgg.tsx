import { useAdventureDestructible, isAdventureObjectDestroyed } from './adventure-destructibles'
import { useRef, useState, useEffect } from 'react'
import { RigidBody, BallCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

declare global {
    interface Window {
        __localPlayerPosition?: THREE.Vector3
        __localPlayerInteract?: boolean
        jackalopesGame?: {
            playerType?: 'merc' | 'jackalope'
        }
    }
}

interface GreenEggProps {
    position: [number, number, number]
    id: string
    onEaten?: (id: string) => void
}

export const GreenEgg: React.FC<GreenEggProps> = ({ position, id, onEaten }) => {
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
        const isJackalope = window.jackalopesGame?.playerType === 'jackalope'

        const eggPos = new THREE.Vector3()
        eggRef.current.getWorldPosition(eggPos)

        const distance = eggPos.distanceTo(playerPosition)
        const nowNearby = distance <= INTERACTION_RANGE && isJackalope
        setIsNearby(nowNearby)

        if (nowNearby && interactPressed && !lastInteractPressed.current) {
            console.log(`[GREEN_EGG] Egg ${id} eaten at distance ${distance.toFixed(2)}`)
            setIsEaten(true)
            onEaten?.(id)
        }

        lastInteractPressed.current = interactPressed

        if (shimmerRef.current) {
            shimmerRef.current.rotation.y = state.clock.elapsedTime * 1.1
            shimmerRef.current.position.y = 0.12 + Math.sin(state.clock.elapsedTime * 2.2) * 0.18
            const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.5) * 0.09
            shimmerRef.current.scale.setScalar(pulse)
        }
    })

    useEffect(() => {
        if (isEaten) setIsNearby(false)
    }, [isEaten])

    if (isEaten || destroyedByWeapon) return null

    return (
        <RigidBody
            type="fixed"
            position={position}
            colliders={false}
            name={`green-egg-${id}`}
            userData={{ isGreenEgg: true, greenEggId: id, adventureDestructibleId: id }}
        >
            <BallCollider args={[0.42]} position={[0, 0.58, 0]} />

            <group ref={eggRef}>
                <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.7, 1.2, 32]} />
                    <meshBasicMaterial color="#6CFF7C" transparent opacity={0.45} side={THREE.DoubleSide} />
                </mesh>

                <mesh position={[0, 2.8, 0]}>
                    <cylinderGeometry args={[0.18, 0.45, 4.8, 12, 1, true]} />
                    <meshBasicMaterial color="#72FF8A" transparent opacity={0.16} depthWrite={false} />
                </mesh>

                <group ref={shimmerRef}>
                    <group position={[0, 0.58, 0]} scale={[0.9, 1.18, 0.9]}>
                        <mesh castShadow receiveShadow>
                            <sphereGeometry args={[0.4, 24, 24]} />
                            <meshStandardMaterial
                                color="#9BFF7A"
                                emissive="#67FF63"
                                emissiveIntensity={1.4}
                                roughness={0.18}
                                metalness={0.32}
                            />
                        </mesh>

                        <mesh position={[0, 0.16, 0]} scale={[0.82, 0.9, 0.82]} castShadow receiveShadow>
                            <sphereGeometry args={[0.26, 20, 20]} />
                            <meshStandardMaterial
                                color="#4EDB61"
                                emissive="#51D86B"
                                emissiveIntensity={0.7}
                                roughness={0.2}
                                metalness={0.28}
                            />
                        </mesh>

                        <mesh position={[0, -0.2, 0]} scale={[0.62, 0.45, 0.62]} castShadow receiveShadow>
                            <sphereGeometry args={[0.22, 20, 20]} />
                            <meshStandardMaterial
                                color="#2F9F4A"
                                roughness={0.25}
                                metalness={0.2}
                            />
                        </mesh>
                    </group>

                    <mesh position={[0.11, 0.82, 0.18]} rotation={[0.15, 0.4, -0.2]}>
                        <sphereGeometry args={[0.07, 10, 10]} />
                        <meshBasicMaterial color="#E8FFD8" transparent opacity={0.9} />
                    </mesh>

                    <mesh position={[0, 0.62, 0]}>
                        <sphereGeometry args={[0.92, 20, 20]} />
                        <meshBasicMaterial color="#7AFF8E" transparent opacity={0.12} depthWrite={false} />
                    </mesh>
                </group>

                {isNearby && (
                    <mesh position={[0, 0.58, 0]}>
                        <sphereGeometry args={[0.82, 18, 18]} />
                        <meshBasicMaterial color="#76FF7A" transparent opacity={0.24} />
                    </mesh>
                )}
            </group>
        </RigidBody>
    )
}

export default GreenEgg
