import { useState, useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mushroom } from './Mushroom'
import { JackalopeDecoy } from './JackalopeDecoy'

// Decoy data structure
interface DecoyData {
    id: string
    position: [number, number, number]
    rotation: number
    kind?: 'mushroom' | 'golden-trail'
}

// Access the global connection manager for multiplayer sync
declare global {
    interface Window {
        connectionManager?: {
            sendMushroomEaten: (mushroomId: string, decoyId: string, decoyPosition: [number, number, number], decoyRotation: number) => void
            sendMushroomDestroyed?: (mushroomId: string) => void
            sendGoldenTrailDecoy?: (decoyId: string, position: [number, number, number], rotation: number) => void
            sendDecoyDestroyed?: (decoyId: string) => void
            sendRainbowFlashbang?: (duration?: number) => void
            on: (event: string, handler: (data: any) => void) => void
            off: (event: string, handler: (data: any) => void) => void
        }
        __localPlayerPosition?: THREE.Vector3
        __localPlayerRotation?: number
        __playMushroomDestroySound?: () => void
    }
}

interface MushroomFieldProps {
    /** Callback when a mushroom is eaten */
    onMushroomEaten?: (id: string) => void
    /** Callback when a mushroom trail decoy is spawned */
    onGoldenTrailDecoySpawned?: (id: string) => void
    /** Callback when a mushroom is destroyed by projectile */
    onMushroomDestroyed?: (id: string) => void
    /** Callback when a decoy is destroyed by projectile */
    onDecoyDestroyed?: (id: string) => void
}

// Predefined mushroom spawn positions scattered around the level
const MUSHROOM_POSITIONS: [number, number, number][] = [
    // Near jackalope spawn point (-100, 7, 10)
    [-98, 0.1, 12],
    [-102, 0.1, 8],
    [-95, 0.1, 10],
    [-100, 0.1, 15],

    // Near the center area
    [-8, 0.1, -8],
    [8, 0.1, -8],
    [-8, 0.1, 8],
    [8, 0.1, 8],

    // Around the platforms
    [12, 0.1, -12],
    [-12, 0.1, -12],
    [12, 0.1, 12],
    [-12, 0.1, 12],

    // Near walls
    [-25, 0.1, 0],
    [25, 0.1, 0],
    [0, 0.1, -25],
    [0, 0.1, 25],

    // Scattered around outer area
    [-20, 0.1, -15],
    [20, 0.1, -15],
    [-20, 0.1, 15],
    [20, 0.1, 15],

    // More random positions
    [-15, 0.1, -5],
    [15, 0.1, -5],
    [-15, 0.1, 5],
    [15, 0.1, 5],

    // Near doorways
    [-5, 0.1, -28],
    [5, 0.1, -28],
    [-5, 0.1, 28],
    [5, 0.1, 28],
    [-28, 0.1, -5],
    [-28, 0.1, 5],
    [28, 0.1, -5],
    [28, 0.1, 5],

    // Additional positions in forest area (outside walls)
    [-40, 0.1, -35],
    [40, 0.1, -35],
    [-40, 0.1, 35],
    [40, 0.1, 35],
    [-35, 0.1, -40],
    [35, 0.1, -40],
    [-35, 0.1, 40],
    [35, 0.1, 40],
]

/**
 * MushroomField component - Manages all mushrooms in the game
 * Spawns mushrooms at predefined positions and handles eating logic
 */
export const MushroomField: React.FC<MushroomFieldProps> = ({
    onMushroomEaten,
    onGoldenTrailDecoySpawned,
    onMushroomDestroyed,
    onDecoyDestroyed
}) => {
    // Track which mushrooms have been eaten (by their index)
    const [eatenMushrooms, setEatenMushrooms] = useState<Set<string>>(new Set())
    // Track which mushrooms have been destroyed by projectiles
    const [destroyedMushrooms, setDestroyedMushrooms] = useState<Set<string>>(new Set())

    // Track spawned decoys
    const [decoys, setDecoys] = useState<DecoyData[]>([])

    // Audio context for playing eat sound
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioBufferRef = useRef<AudioBuffer | null>(null)
    const goldenTrailRunsRef = useRef<Array<{ remaining: number; nextSpawnAt: number }>>([])
    const { camera } = useThree()

    // Load the eating sound effect
    useEffect(() => {
        // Create audio context lazily on first user interaction
        const initAudio = async () => {
            try {
                // Use existing audio context or create new one
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

                // Try to load the mushroom eating sound
                const response = await fetch('/audio/mushroom-eat.mp3')
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer()
                    audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer)
                    console.log('[MUSHROOM_FIELD] Loaded mushroom eating sound')
                } else {
                    console.log('[MUSHROOM_FIELD] Mushroom eating sound not found, will use fallback')
                }
            } catch (error) {
                console.log('[MUSHROOM_FIELD] Could not load mushroom eating sound:', error)
            }
        }

        initAudio()

        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close()
            }
        }
    }, [])

    // Play eating sound effect
    const playEatSound = useCallback(() => {
        if (!audioContextRef.current) {
            // Create audio context if not exists (for browsers that need user interaction first)
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
        }

        const audioContext = audioContextRef.current

        if (audioBufferRef.current) {
            // Play the loaded sound
            const source = audioContext.createBufferSource()
            source.buffer = audioBufferRef.current

            // Create gain node for volume control
            const gainNode = audioContext.createGain()
            gainNode.gain.value = 0.5 // 50% volume

            source.connect(gainNode)
            gainNode.connect(audioContext.destination)
            source.start(0)
        } else {
            // Fallback: generate a simple "chomp" sound using oscillators
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator.type = 'square'
            oscillator.frequency.setValueAtTime(300, audioContext.currentTime)
            oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.1)

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15)

            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)

            oscillator.start(audioContext.currentTime)
            oscillator.stop(audioContext.currentTime + 0.15)

            // Second "crunch" tone
            const oscillator2 = audioContext.createOscillator()
            const gainNode2 = audioContext.createGain()

            oscillator2.type = 'sawtooth'
            oscillator2.frequency.setValueAtTime(150, audioContext.currentTime + 0.05)
            oscillator2.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.12)

            gainNode2.gain.setValueAtTime(0.2, audioContext.currentTime + 0.05)
            gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15)

            oscillator2.connect(gainNode2)
            gainNode2.connect(audioContext.destination)

            oscillator2.start(audioContext.currentTime + 0.05)
            oscillator2.stop(audioContext.currentTime + 0.15)
        }
    }, [])

    // Expose playEatSound globally so sphere-tool can use it when destroying mushrooms/decoys
    useEffect(() => {
        window.__playMushroomDestroySound = playEatSound
        return () => {
            delete window.__playMushroomDestroySound
        }
    }, [playEatSound])

    // Spawn a decoy at the given position
    const spawnDecoy = useCallback((
        position: [number, number, number],
        rotation: number,
        kind: 'mushroom' | 'golden-trail' = 'mushroom',
        providedId?: string
    ) => {
        const decoyId = providedId || `${kind}-decoy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        console.log(`[MUSHROOM_FIELD] Spawning ${kind} decoy ${decoyId} at (${position.join(', ')})`)
        setDecoys(prev => {
            if (prev.some(d => d.id === decoyId)) return prev
            return [...prev, { id: decoyId, position, rotation, kind }]
        })
        if (kind === 'golden-trail') {
            onGoldenTrailDecoySpawned?.(decoyId)
        }
        return decoyId
    }, [onGoldenTrailDecoySpawned])

    // Handle mushroom destroyed by projectile
    const handleMushroomDestroyed = useCallback((id: string) => {
        console.log(`[MUSHROOM_FIELD] Mushroom ${id} was destroyed by projectile!`)
        setDestroyedMushrooms(prev => {
            const newSet = new Set(prev)
            newSet.add(id)
            return newSet
        })
        onMushroomDestroyed?.(id)
    }, [onMushroomDestroyed])

    // Handle decoy destroyed by projectile
    const handleDecoyDestroyed = useCallback((id: string) => {
        console.log(`[MUSHROOM_FIELD] Decoy ${id} was destroyed by projectile!`)
        setDecoys(prev => prev.filter(d => d.id !== id))
        window.connectionManager?.sendDecoyDestroyed?.(id)
        onDecoyDestroyed?.(id)
    }, [onDecoyDestroyed])

    // Mark a mushroom as eaten (called for both local and remote eating)
    const markMushroomEaten = useCallback((
        id: string,
        playSound: boolean,
        decoyId?: string,
        decoyPosition?: [number, number, number],
        decoyRotation?: number
    ) => {
        setEatenMushrooms(prev => {
            if (prev.has(id)) return prev // Already eaten
            const newSet = new Set(prev)
            newSet.add(id)
            return newSet
        })

        if (playSound) {
            playEatSound()
        }

        // Spawn a decoy if position is provided
        if (decoyPosition) {
            spawnDecoy(decoyPosition, decoyRotation ?? 0, 'mushroom', decoyId)
        }

        // Notify parent if callback provided
        onMushroomEaten?.(id)
    }, [playEatSound, onMushroomEaten, spawnDecoy])

    // Handle mushroom being eaten locally (by this player)
    const handleMushroomEaten = useCallback((id: string) => {
        console.log(`[MUSHROOM_FIELD] Mushroom ${id} was eaten locally!`)

        // Get current player position and rotation for decoy
        const playerPos = window.__localPlayerPosition
        const playerRot = window.__localPlayerRotation ?? 0
        const decoyRotation = playerRot + Math.PI

        // Calculate decoy position slightly behind the jackalope so it doesn't overlap movement.
        const backOffset = 0.9
        const decoyPosition: [number, number, number] = playerPos
            ? [
                playerPos.x - Math.sin(playerRot) * backOffset,
                0.1,
                playerPos.z - Math.cos(playerRot) * backOffset
            ]
            : [0, 0.1, 0]

        const sharedDecoyId = `mushroom-decoy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        // Mark as eaten, play sound, and spawn decoy
        markMushroomEaten(id, true, sharedDecoyId, decoyPosition, decoyRotation)

        // Broadcast to other players via network (include decoy data)
        if (window.connectionManager?.sendMushroomEaten) {
            window.connectionManager.sendMushroomEaten(id, sharedDecoyId, decoyPosition, decoyRotation)
        }
    }, [markMushroomEaten])

    // Golden egg effect: leave behind a persistent trail of static jackalope decoys.
    useEffect(() => {
        const startGoldenTrail = () => {
            console.log('[MUSHROOM_FIELD] Starting golden trail decoy sequence')
            goldenTrailRunsRef.current.push({
                remaining: 10,
                nextSpawnAt: performance.now()
            })
        }

        const clearGoldenTrail = () => {
            console.log('[MUSHROOM_FIELD] Clearing golden trail decoys for round reset')
            goldenTrailRunsRef.current = []
            setDecoys(prev => prev.filter(decoy => decoy.kind !== 'golden-trail'))
        }

        const resetField = () => {
            console.log('[MUSHROOM_FIELD] Resetting mushrooms and all decoys for new round')
            goldenTrailRunsRef.current = []
            setEatenMushrooms(new Set())
            setDestroyedMushrooms(new Set())
            setDecoys([])
        }

        window.addEventListener('golden_egg_trail_start', startGoldenTrail)
        window.addEventListener('timer_reset', resetField)
        window.addEventListener('jackalopesRoundReset', resetField)
        window.addEventListener('golden_trail_clear', clearGoldenTrail)

        return () => {
            goldenTrailRunsRef.current = []
            window.removeEventListener('golden_egg_trail_start', startGoldenTrail)
            window.removeEventListener('timer_reset', resetField)
            window.removeEventListener('jackalopesRoundReset', resetField)
            window.removeEventListener('golden_trail_clear', clearGoldenTrail)
        }
    }, [])

    useFrame(() => {
        const now = performance.now()
        if (goldenTrailRunsRef.current.length === 0) return

        goldenTrailRunsRef.current = goldenTrailRunsRef.current.flatMap(run => {
            if (now < run.nextSpawnAt) {
                return [run]
            }

            const playerPos = window.__localPlayerPosition
            const playerRot = window.__localPlayerRotation ?? 0
            const decoyRotation = playerRot + Math.PI

            // Spawn farther behind and slightly above the floor to avoid interfering
            // with the live jackalope's grounding while the trail is being generated.
            const backOffset = 1.8
            const sideJitter = (Math.random() - 0.5) * 0.5
            const trailPosition: [number, number, number] = playerPos
                ? [
                    playerPos.x - Math.sin(playerRot) * backOffset + Math.cos(playerRot) * sideJitter,
                    0.35,
                    playerPos.z - Math.cos(playerRot) * backOffset - Math.sin(playerRot) * sideJitter
                ]
                : [0, 0.35, 0]

            const sharedDecoyId = `golden-trail-decoy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            spawnDecoy(trailPosition, decoyRotation, 'golden-trail', sharedDecoyId)
            window.connectionManager?.sendGoldenTrailDecoy?.(sharedDecoyId, trailPosition, decoyRotation)

            if (run.remaining <= 1) {
                return []
            }

            return [{
                remaining: run.remaining - 1,
                nextSpawnAt: now + 1000
            }]
        })
    })

    // Listen for remote mushroom eaten events from other players
    useEffect(() => {
        const handleGameEvent = (event: any) => {
            if (event.event_type === 'mushroom_eaten') {
                console.log(`[MUSHROOM_FIELD] Remote player ate mushroom ${event.mushroomId}`)
                // Mark as eaten, don't play sound, but spawn the decoy at the remote player's position
                markMushroomEaten(
                    event.mushroomId,
                    false,
                    event.decoyId,
                    event.decoyPosition,
                    event.decoyRotation
                )
            }

            if (event.event_type === 'mushroom_destroyed') {
                console.log(`[MUSHROOM_FIELD] Remote mushroom destroyed: ${event.mushroomId}`)
                setDestroyedMushrooms(prev => {
                    if (prev.has(event.mushroomId)) return prev
                    const newSet = new Set(prev)
                    newSet.add(event.mushroomId)
                    return newSet
                })
            }

            if (event.event_type === 'golden_trail_decoy_spawn') {
                const localPlayerId = window.connectionManager?.playerId || window.connectionManager?.getPlayerId?.()
                if (event.player_id && localPlayerId && event.player_id === localPlayerId) {
                    return
                }

                console.log('[MUSHROOM_FIELD] Remote golden trail decoy spawn received')
                spawnDecoy(event.decoyPosition, event.decoyRotation, 'golden-trail', event.decoyId)
            }

            if (event.event_type === 'decoy_destroyed') {
                console.log(`[MUSHROOM_FIELD] Remote decoy destroyed: ${event.decoyId}`)
                setDecoys(prev => prev.filter(d => d.id !== event.decoyId))
            }
        }

        // Subscribe to game events
        if (window.connectionManager?.on) {
            window.connectionManager.on('game_event', handleGameEvent)
        }

        return () => {
            if (window.connectionManager?.off) {
                window.connectionManager.off('game_event', handleGameEvent)
            }
        }
    }, [markMushroomEaten, spawnDecoy])

    return (
        <group name="mushroom-field">
            {/* Render mushrooms */}
            {MUSHROOM_POSITIONS.map((pos, index) => {
                const id = `mushroom-${index}`

                // Skip if already eaten or destroyed
                if (eatenMushrooms.has(id) || destroyedMushrooms.has(id)) return null

                return (
                    <Mushroom
                        key={id}
                        id={id}
                        position={pos}
                        onEaten={handleMushroomEaten}
                        onDestroyed={handleMushroomDestroyed}
                    />
                )
            })}

            {/* Render jackalope decoys */}
            {decoys.map(decoy => (
                <JackalopeDecoy
                    key={decoy.id}
                    id={decoy.id}
                    position={decoy.position}
                    rotation={decoy.rotation}
                    onDestroyed={handleDecoyDestroyed}
                />
            ))}
        </group>
    )
}

export default MushroomField
