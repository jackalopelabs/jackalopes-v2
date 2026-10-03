import { useMemo, useState, useCallback, useEffect } from 'react'
import { RainbowEgg } from './RainbowEgg'

interface RainbowEggFieldProps {
    eggCount?: number
    seed?: number
    onEggEaten?: (id: string) => void
}

const DEFAULT_EGG_COUNT = 4
const MIN_DISTANCE_BETWEEN_EGGS = 28
const INNER_SAFE_RADIUS = 70
const OUTER_SAFE_RADIUS = 300

function createSeededRandom(seed: number) {
    let value = seed >>> 0
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0
        return value / 4294967296
    }
}

function generateEggPositions(count: number, seed: number): [number, number, number][] {
    const random = createSeededRandom(seed)
    const positions: [number, number, number][] = []
    let attempts = 0
    const maxAttempts = count * 200

    while (positions.length < count && attempts < maxAttempts) {
        attempts++
        const angle = random() * Math.PI * 2
        const radius = INNER_SAFE_RADIUS + random() * (OUTER_SAFE_RADIUS - INNER_SAFE_RADIUS)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius

        const tooClose = positions.some(([px, , pz]) => {
            const dx = px - x
            const dz = pz - z
            return Math.sqrt(dx * dx + dz * dz) < MIN_DISTANCE_BETWEEN_EGGS
        })

        if (tooClose) continue
        positions.push([x, 1.25, z])
    }

    return positions
}

export const RainbowEggField: React.FC<RainbowEggFieldProps> = ({
    eggCount = DEFAULT_EGG_COUNT,
    seed = 20260406,
    onEggEaten
}) => {
    const [eatenEggs, setEatenEggs] = useState<Set<string>>(new Set())
    const [roundSeedOffset, setRoundSeedOffset] = useState(0)

    const eggPositions = useMemo(
        () => generateEggPositions(eggCount, seed + roundSeedOffset),
        [eggCount, seed, roundSeedOffset]
    )

    useEffect(() => {
        const resetField = () => {
            console.log('[RAINBOW_EGG_FIELD] Resetting rainbow eggs for new round')
            setEatenEggs(new Set())
            setRoundSeedOffset(prev => prev + 1)
        }

        window.addEventListener('timer_reset', resetField)
        window.addEventListener('jackalopesRoundReset', resetField)
        return () => {
            window.removeEventListener('timer_reset', resetField)
            window.removeEventListener('jackalopesRoundReset', resetField)
        }
    }, [])

    const handleEggEaten = useCallback((id: string) => {
        console.log(`[RAINBOW_EGG_FIELD] Rainbow egg ${id} was eaten!`)
        setEatenEggs(prev => {
            if (prev.has(id)) return prev
            const next = new Set(prev)
            next.add(id)
            return next
        })
        onEggEaten?.(id)
    }, [onEggEaten])

    return (
        <group name="rainbow-egg-field">
            {eggPositions.map((position, index) => {
                const id = `rainbow-egg-${index}`
                if (eatenEggs.has(id)) return null

                return (
                    <RainbowEgg
                        key={`${roundSeedOffset}-${id}`}
                        id={id}
                        position={position}
                        onEaten={handleEggEaten}
                    />
                )
            })}
        </group>
    )
}

export default RainbowEggField
