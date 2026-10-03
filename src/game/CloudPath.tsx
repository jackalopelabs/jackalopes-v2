import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'

type CloudStep = {
    position: [number, number, number]
    rotation: number
    width: number
    depth: number
    challenge: boolean
}

const CLOUD_COUNT = 34
const CLOUD_SEED = 0x5eedc10d

function seededRandom(seed: number) {
    let state = seed >>> 0

    return () => {
        state += 0x6d2b79f5
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

function randomBetween(random: () => number, min: number, max: number) {
    return min + (max - min) * random()
}

function createCloudTrail(): CloudStep[] {
    const random = seededRandom(CLOUD_SEED)
    const clouds: CloudStep[] = []
    // Start close to the Adventure jackalope spawn so the first jump teaches the route.
    let x = -94
    let y = 0.55
    let z = 10
    let heading = 0

    for (let index = 0; index < CLOUD_COUNT; index += 1) {
        const challenge = index >= 5 && index % 6 === 0

        if (index > 0) {
            heading += randomBetween(random, -0.5, 0.5)

            // The smaller blue-white stones mark the deliberately longer jumps.
            const stride = challenge
                ? randomBetween(random, 10.2, 11.4)
                : randomBetween(random, 6.0, 7.25)

            x += Math.cos(heading) * stride
            z += Math.sin(heading) * stride
            y += challenge
                ? randomBetween(random, 1.05, 1.2)
                : randomBetween(random, 1.25, 1.45)
        }

        clouds.push({
            position: [x, y, z],
            rotation: randomBetween(random, -Math.PI, Math.PI),
            width: challenge
                ? randomBetween(random, 4.1, 4.6)
                : randomBetween(random, 5.2, 6.3),
            depth: challenge
                ? randomBetween(random, 3.5, 4.0)
                : randomBetween(random, 4.4, 5.4),
            challenge,
        })
    }

    return clouds
}

function CloudStone({ cloud, index }: { cloud: CloudStep; index: number }) {
    const cloudColor = cloud.challenge ? '#c8ecff' : '#f3f8ff'
    const undersideColor = cloud.challenge ? '#77cfff' : '#bfdcf2'

    return (
        <RigidBody
            type="fixed"
            colliders={false}
            position={cloud.position}
            rotation={[0, cloud.rotation, 0]}
            friction={0.9}
            restitution={0}
            name={`cloud-step-${index + 1}`}
        >
            <CuboidCollider
                args={[cloud.width * 0.48, 0.38, cloud.depth * 0.48]}
                position={[0, 0.04, 0]}
            />

            <mesh castShadow receiveShadow scale={[cloud.width * 0.58, 0.58, cloud.depth * 0.58]}>
                <sphereGeometry args={[0.72, 16, 10]} />
                <meshStandardMaterial
                    color={cloudColor}
                    emissive={undersideColor}
                    emissiveIntensity={cloud.challenge ? 0.24 : 0.1}
                    roughness={0.92}
                />
            </mesh>
            <mesh position={[-cloud.width * 0.26, 0.02, 0.05]} scale={[cloud.width * 0.3, 0.44, cloud.depth * 0.42]}>
                <sphereGeometry args={[0.72, 14, 9]} />
                <meshStandardMaterial color={cloudColor} roughness={0.95} />
            </mesh>
            <mesh position={[cloud.width * 0.25, -0.02, -0.08]} scale={[cloud.width * 0.32, 0.48, cloud.depth * 0.4]}>
                <sphereGeometry args={[0.72, 14, 9]} />
                <meshStandardMaterial color={cloudColor} roughness={0.95} />
            </mesh>

            {cloud.challenge && (
                <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.48, 0.68, 24]} />
                    <meshBasicMaterial color="#78d7ff" transparent opacity={0.72} />
                </mesh>
            )}
        </RigidBody>
    )
}

export function CloudPath() {
    const clouds = useMemo(() => createCloudTrail(), [])
    const summit = clouds[clouds.length - 1]

    return (
        <group name="adventure-cloud-path">
            {clouds.map((cloud, index) => (
                <CloudStone key={index} cloud={cloud} index={index} />
            ))}

            <RigidBody
                type="fixed"
                colliders={false}
                position={[
                    summit.position[0] + 7.5,
                    summit.position[1] + 1.15,
                    summit.position[2] + 1.5,
                ]}
                friction={0.95}
                name="cloud-summit"
            >
                <CuboidCollider args={[4.8, 0.45, 4.3]} position={[0, 0.05, 0]} />
                <mesh castShadow receiveShadow scale={[7.5, 0.8, 6.8]}>
                    <sphereGeometry args={[0.72, 20, 12]} />
                    <meshStandardMaterial
                        color="#fff7cf"
                        emissive="#ffd76a"
                        emissiveIntensity={0.2}
                        roughness={0.9}
                    />
                </mesh>
                <pointLight color="#ffd97c" intensity={2.4} distance={24} decay={2} position={[0, 2, 0]} />
            </RigidBody>
        </group>
    )
}
