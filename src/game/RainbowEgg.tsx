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

interface RainbowEggProps {
    position: [number, number, number]
    id: string
    onEaten?: (id: string) => void
}

export const RainbowEgg: React.FC<RainbowEggProps> = ({ position, id, onEaten }) => {
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
            console.log(`[RAINBOW_EGG] Egg ${id} eaten at distance ${distance.toFixed(2)}`)
            setIsEaten(true)
            onEaten?.(id)
        }

        lastInteractPressed.current = interactPressed

        if (shimmerRef.current) {
            shimmerRef.current.rotation.y = state.clock.elapsedTime * 1.2
            const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1
            shimmerRef.current.scale.setScalar(pulse)
        }
    })

    useEffect(() => {
        if (isEaten) setIsNearby(false)
    }, [isEaten])

    if (isEaten || destroyedByWeapon) return null

    const stripeColors = ['#ff4d4d', '#ff9f1c', '#ffe66d', '#4ecdc4', '#4d96ff', '#b36bff']

    return (
        <RigidBody
            type="fixed"
            position={position}
            colliders={false}
            name={`rainbow-egg-${id}`}
            userData={{ isRainbowEgg: true, rainbowEggId: id, adventureDestructibleId: id }}
        >
            <BallCollider args={[0.42]} position={[0, 0.58, 0]} />

            <group ref={eggRef}>
                <group ref={shimmerRef}>
                    <group position={[0, 0.58, 0]} scale={[0.72, 0.96, 0.72]}>
                        <mesh castShadow receiveShadow>
                            <sphereGeometry args={[0.4, 24, 24]} />
                            <meshStandardMaterial color="#ffffff" roughness={0.18} metalness={0.45} />
                        </mesh>

                        {stripeColors.map((color, index) => (
                            <mesh
                                key={color}
                                position={[0, 0.22 - index * 0.085, 0.27 - index * 0.015]}
                                rotation={[0.1, 0, 0]}
                                scale={[0.72 - index * 0.03, 0.12, 0.14]}
                                castShadow
                            >
                                <sphereGeometry args={[0.38, 18, 18]} />
                                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.2} metalness={0.4} />
                            </mesh>
                        ))}

                        <mesh position={[0, -0.2, 0]} scale={[0.62, 0.45, 0.62]} castShadow receiveShadow>
                            <sphereGeometry args={[0.22, 20, 20]} />
                            <meshStandardMaterial color="#e8dcff" roughness={0.25} metalness={0.35} />
                        </mesh>
                    </group>

                    <mesh position={[0.1, 0.82, 0.18]} rotation={[0.15, 0.4, -0.2]}>
                        <sphereGeometry args={[0.07, 10, 10]} />
                        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} />
                    </mesh>
                </group>

                {isNearby && (
                    <mesh position={[0, 0.58, 0]}>
                        <sphereGeometry args={[0.82, 18, 18]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.24} />
                    </mesh>
                )}
            </group>
        </RigidBody>
    )
}

export default RainbowEgg
