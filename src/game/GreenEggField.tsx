import { useMemo, useState, useCallback, useEffect } from 'react'
import { GreenEgg } from './GreenEgg'

interface GreenEggFieldProps {
    eggCount?: number
    seed?: number
    onEggEaten?: (id: string) => void
}

const DEFAULT_EGG_COUNT = 3
const MIN_DISTANCE_BETWEEN_EGGS = 20
const INNER_SAFE_RADIUS = 45
const OUTER_SAFE_RADIUS = 170

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
    const maxAttempts = count * 240

    while (positions.length < count && attempts < maxAttempts) {
        attempts++
        const angle = random() * Math.PI * 2
        const radius = INNER_SAFE_RADIUS + random() * (OUTER_SAFE_RADIUS - INNER_SAFE_RADIUS)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius

        if (Math.abs(x) < 18 && Math.abs(z) < 18) continue

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

export const GreenEggField: React.FC<GreenEggFieldProps> = ({
    eggCount = DEFAULT_EGG_COUNT,
    seed = 20260410,
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
            console.log('[GREEN_EGG_FIELD] Resetting green eggs for new round')
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
        console.log(`[GREEN_EGG_FIELD] Green egg ${id} was eaten!`)
        setEatenEggs(prev => {
            if (prev.has(id)) return prev
            const next = new Set(prev)
            next.add(id)
            return next
        })
        onEggEaten?.(id)
    }, [onEggEaten])

    return (
        <group name="green-egg-field">
            {eggPositions.map((position, index) => {
                const id = `green-egg-${index}`
                if (eatenEggs.has(id)) return null

                return (
                    <GreenEgg
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

export default GreenEggField
