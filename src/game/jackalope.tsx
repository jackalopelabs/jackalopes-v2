import { adventureCombatState, type AdventureHit } from './adventure-combat-state'
import { MercModel } from './MercModel'
import Rapier from '@dimforge/rapier3d-compat'
import { Html, PerspectiveCamera, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, RigidBodyProps, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useSwimming, swimVerticalVelocity } from './terrain/use-swimming'
import { createWaterslide, canBoardWaterslide, sampleWaterslideRide } from './cave-waterslide'
import { waterslideState } from './waterslide-state'
import { loadTerrainLevel } from './terrain/level-document'
import { useGamepad } from '../common/hooks/use-gamepad'
import * as THREE from 'three'
import { Component, Entity, EntityType } from './ecs'

// Import ConnectionManager for multiplayer support
import { ConnectionManager } from '../network/ConnectionManager'
import { JackalopeModel } from './JackalopeModel' // Import the JackalopeModel component

// Add global type declaration at the top of the file
declare global {
    interface Window {
        // Existing declarations
        connectionManager?: any;
        __sendRespawnRequest?: (playerId: string) => void;
        // Update jackalopesGame type
        jackalopesGame?: {
            playerType?: 'merc' | 'jackalope';
            flashlightOn?: boolean;
            levaPanelState?: 'open' | 'closed';
            debugLevel?: number;
            inventory?: {
                goldenEggs: number;
                rainbowEggs: number;
                greenNightVision: boolean;
            };
            spawnManager?: {
                baseSpawnX: number;
                currentSpawnX: number;
                stepSize: number;
                minX: number;
                getNextSpawnPoint: () => [number, number, number];
                resetSpawnPoints: () => [number, number, number];
                getSpawnPoint: () => [number, number, number];
            };
        };
        playerPositionTracker?: {
            updatePosition: (newPos: THREE.Vector3) => void;
        };
        __createSpawnEffect?: (position: THREE.Vector3, color: string, particleCount: number, radius: number) => void;
        __createExplosionEffect?: (position: THREE.Vector3, color: string, particleCount: number, radius: number) => void;
        __networkManager?: {
            sendRespawnRequest: (playerId: string, spawnPosition?: [number, number, number]) => void;
        };
        __localPlayerPosition?: THREE.Vector3;
        __localPlayerRotation?: number;
        __localPlayerInteract?: boolean;
        __lastLocalInteractAt?: number;
    }
}

// Animation system
const ANIMATION_SMOOTHING = 0.08;

// Direct movement constants
const BASE_SPEED = 6.8; // Doubled from 3.4 to make jackalope 2x faster
const RUN_MULTIPLIER = 1.8; // Keep this the same

// Jump handling adjustments
const JUMP_MULTIPLIER = 14.2; // Increased from 4 to make jumps higher
const GRAVITY_REDUCTION = 1; // Increased from 0.5 to make jumps shorter
const VOID_RECOVERY_Y = -160
const _inputDirection = new THREE.Vector3()
const _cameraDirection = new THREE.Vector3(0, 0, -1)
const _cameraSide = new THREE.Vector3(1, 0, 0)
const _moveDirection = new THREE.Vector3()
const _networkRotationQuat = new THREE.Quaternion()
const _networkRotationEuler = new THREE.Euler()
const _jackalopePos2D = new THREE.Vector3()
const _jackalopeMove2D = new THREE.Vector3()
const _mercPos2D = new THREE.Vector3()
const _toMerc = new THREE.Vector3()
const _mercForward = new THREE.Vector3()

// Props for the Jackalope component
type JackalopeProps = RigidBodyProps & {
    walkSpeed?: number
    runSpeed?: number
    jumpForce?: number
    onMove?: (position: THREE.Vector3) => void
    connectionManager?: ConnectionManager
    visible?: boolean
    thirdPersonView?: boolean
    adventureAvatar?: 'jackalope' | 'astronaut'
    adventureMode?: boolean
}

// Keyboard controls type
type KeyControls = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
    sprint: boolean
    interact: boolean
}

export const Jackalope = forwardRef<EntityType, JackalopeProps>(({ 
    onMove, 
    walkSpeed = 0.12, 
    runSpeed = 0.22, 
    jumpForce = 0.8, 
    connectionManager, 
    visible = false, 
    thirdPersonView = false,
    adventureMode = false,
    adventureAvatar = 'jackalope', 
    ...props 
}, ref) => {
    // Core references
    const jackalopeRef = useRef<EntityType>(null!)
    const jackalopeModelRef = useRef<THREE.Group>(null)
    const jackalopeLeanRef = useRef<THREE.Group>(null)
    const fpModelRef = useRef<THREE.Group>(null)
    
    // Physics
    const rapier = useRapier()
    const characterController = useRef<any>(null)
    
    // For direct position control
    const position = useRef(new THREE.Vector3())
    const velocity = useRef(new THREE.Vector3())
    const rotation = useRef(0)
    const targetRotation = useRef(0)
    const lastMercTakedownAt = useRef(0)
    const recoveryPosition = useRef(new THREE.Vector3(-100, 7, 10))
    
    // Animation
    const animations = useRef({})
    const [animation, setAnimation] = useState('idle')
    const currentAnimation = useRef('')
    
    // For hopping
    const hopTimer = useRef(0)
    const hopInterval = useRef(0.6)
    const hopHeight = useRef(0.4)
    const isHopping = useRef(false)

    // For respawning
    const [isRespawning, setIsRespawning] = useState(false)
    const [combatDead, setCombatDead] = useState(false)
    const [flinchUntil, setFlinchUntil] = useState(0)
    useEffect(() => {
        if (!adventureMode) return
        let timer: ReturnType<typeof setTimeout> | undefined
        const hit = (event: Event) => {
            const detail = (event as CustomEvent<AdventureHit>).detail
            if (detail.playerId !== connectionManager?.getPlayerId()) return
            if (adventureAvatar === 'astronaut') { setFlinchUntil(Date.now() + 350); return }
            if (Date.now() < adventureCombatState.immuneUntil) return
            adventureCombatState.deadUntil = Date.now() + 1400
            adventureCombatState.immuneUntil = Date.now() + 5000
            setCombatDead(true)
            timer = setTimeout(() => {
                setCombatDead(false)
                adventureCombatState.deadUntil = 0
                window.dispatchEvent(new CustomEvent('player_respawned', { detail: {} }))
            }, 1400)
        }
        window.addEventListener('jackalopes:adventure-hit', hit)
        return () => { window.removeEventListener('jackalopes:adventure-hit', hit); if (timer) clearTimeout(timer); adventureCombatState.deadUntil = 0; setCombatDead(false) }
    }, [adventureMode, adventureAvatar, connectionManager])

    const [isInvulnerable, setIsInvulnerable] = useState(false)
    const respawnEffectRef = useRef<boolean>(false)
    const respawnTargetPosition = useRef<THREE.Vector3 | null>(null); // Store target respawn position
    
    // Core setup
    const camera = useThree((state) => state.camera)
    const [, getKeyboardControls] = useKeyboardControls()
    const gamepadState = useGamepad()
    const sampleSwimming = useSwimming(adventureMode)
    const wasSwimming = useRef(false)
    const slideLayout = useMemo(() => adventureMode ? createWaterslide(loadTerrainLevel()) : null, [adventureMode])
    const slideRide = useRef<{ progress: number; elapsed: number; origin: THREE.Vector3 } | null>(null)
    const slideInteractHeld = useRef(false)
    useEffect(() => () => { slideRide.current = null; waterslideState.active = false }, [adventureMode])
    
    // Track last server sync
    const lastStateTime = useRef(0)
    
    // Initialize position and physics controller
    useEffect(() => {
        // Create physics character controller
        const { world } = rapier
        characterController.current = world.createCharacterController(0.1)
        characterController.current.enableAutostep(0.5, 0.05, true)
        characterController.current.setSlideEnabled(true)
        characterController.current.enableSnapToGround(0.5)
        
        // Set initial position from props - ensure we start higher above ground to avoid clipping
        if (props.position && Array.isArray(props.position)) {
            position.current.set(props.position[0], Math.max(props.position[1] + 2.0, 3.2), props.position[2])
            recoveryPosition.current.copy(position.current)
        } else {
            // Default position if none provided - ensure we're high enough above ground
            position.current.y = 3.2
            recoveryPosition.current.copy(position.current)
        }
        
        // Set initial rigid body position if it exists
        if (jackalopeRef.current?.rigidBody) {
            jackalopeRef.current.rigidBody.setNextKinematicTranslation(position.current)
        }
        
        // Also initialize the model position directly
        if (jackalopeModelRef.current && thirdPersonView) {
            jackalopeModelRef.current.position.copy(position.current)
            jackalopeModelRef.current.position.y -= 0.65 // Apply the height offset
        }
        
        return () => {
            world.removeCharacterController(characterController.current)
        }
    }, [])
    
    // Ensure rigid body is properly positioned once it's available
    useEffect(() => {
        const checkAndSetPosition = () => {
            if (jackalopeRef.current?.rigidBody) {
                jackalopeRef.current.rigidBody.setNextKinematicTranslation(position.current)
            }
        }
        
        // Try to set position immediately
        checkAndSetPosition()
        
        // And also try after a short delay to ensure everything is loaded
        // Use multiple attempts with increasing delays for better reliability
        const timers = [100, 300, 500, 1000, 2000].map(delay => 
            setTimeout(checkAndSetPosition, delay)
        );
        
        return () => timers.forEach(timer => clearTimeout(timer));
    }, [])
    
    // Add a resilient initialization effect for the 3D model
    useEffect(() => {
        // Only run for third person view
        if (!thirdPersonView || !visible) return;
        
        const initializeModel = () => {
            if (jackalopeModelRef.current) {
                console.log("[JACKALOPE] Ensuring model initialization");
                
                // Force the model to be at the correct position
                jackalopeModelRef.current.position.set(
                    position.current.x,
                    position.current.y - 2.15,
                    position.current.z
                );
                
                // Make sure rotation is set
                jackalopeModelRef.current.rotation.y = rotation.current + Math.PI;
                
                // Force visibility of all meshes
                jackalopeModelRef.current.traverse((child) => {
                    if (child.type === 'Mesh') {
                        (child as THREE.Mesh).visible = true;
                    }
                });
                
                // Make sure the model itself is visible
                jackalopeModelRef.current.visible = true;
            }
        };
        
        // Run initialization multiple times with increasing delays
        const timers = [50, 200, 500, 1000, 2000].map(delay => 
            setTimeout(initializeModel, delay)
        );
        
        return () => timers.forEach(timer => clearTimeout(timer));
    }, [thirdPersonView, visible]);
    
    // Listen for respawn event - only affects local player
    const handleRespawn = useCallback((event: CustomEvent) => {
        try {
            const localPlayerId = connectionManager?.getPlayerId();
            
            // IMPORTANT: In some cases propPlayerId might be undefined, but we should still handle
            // respawn for our local player
            console.log(`[Jackalope] Received player_respawned event. Local ID: ${localPlayerId}, Event Detail:`, event.detail);

            // If this was sent for our player ID, handle the respawn
            // Skip the propPlayerId check as it's causing problems
            if (localPlayerId) {
                slideRide.current = null; waterslideState.active = false; velocity.current.set(0, 0, 0);
                console.log('🐰 Jackalope processing respawn event', event.detail);
                
                // Use provided position from event, or use the spawnManager
                let spawnCoords: [number, number, number];
                
                if (event.detail?.position) {
                    // Use position from the event if provided
                    spawnCoords = event.detail.position;
                } else if (window.jackalopesGame?.spawnManager) {
                    // Get next spawn point with progressive movement 
                    spawnCoords = (window.jackalopesGame as any).spawnManager.getNextSpawnPoint();
                } else {
                    // Fallback to default
                    spawnCoords = [-100, 3, 10];
                }
                
                console.log(`🐰 Spawn coordinates: [${spawnCoords.join(', ')}]`);
                
                // Create a new THREE.Vector3 from spawn coordinates
                respawnTargetPosition.current = new THREE.Vector3(spawnCoords[0], spawnCoords[1], spawnCoords[2]);
                
                // IMPORTANT: Apply the respawn position IMMEDIATELY
                // Don't wait for useFrame, directly set the position
                if (jackalopeRef.current?.rigidBody) {
                    console.log(`🐰 Immediately setting position to [${spawnCoords.join(', ')}]`);
                    
                    // Update our tracked position
                    position.current.set(spawnCoords[0], spawnCoords[1], spawnCoords[2]);
                    
                    // Direct teleport
                    jackalopeRef.current.rigidBody.setNextKinematicTranslation(position.current);
                    jackalopeRef.current.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true); // Reset velocity
                }
                
                // Also update character controller if available
                if (characterController.current && typeof characterController.current.setTranslation === 'function') {
                    characterController.current.setTranslation({
                        x: spawnCoords[0],
                        y: spawnCoords[1],
                        z: spawnCoords[2]
                    });
                } else {
                    console.log(`🐰 Character controller not available or doesn't have setTranslation method`);
                }
                
                // Set respawning state 
                setIsRespawning(true);
                respawnEffectRef.current = true; // Trigger visual effect
                
                // Create spawn effect immediately
                if (typeof window !== 'undefined' && window.__createSpawnEffect) {
                    window.__createSpawnEffect(
                        new THREE.Vector3(spawnCoords[0], spawnCoords[1], spawnCoords[2]),
                        '#4682B4', // Blue color for Jackalope
                        20, // Particles for spawn effect
                        0.2 // Radius
                    );
                }
                
                // Set invulnerable state after a short delay
                setTimeout(() => {
                    setIsRespawning(false);
                    setIsInvulnerable(true);
                    
                    // Remove invulnerability after 3 seconds
                    setTimeout(() => {
                        setIsInvulnerable(false);
                    }, 3000);
                }, 300);
            }
        } catch (error) {
            console.error(`🐰 Error handling respawn after scoring:`, error);
        }
    }, [connectionManager]);
    
    useEffect(() => {
        // Add event listener
        window.addEventListener('player_respawned', handleRespawn as EventListener);
        
        return () => {
            window.removeEventListener('player_respawned', handleRespawn as EventListener);
        };
    }, [handleRespawn]);
    
    // Process respawn in useFrame
    useEffect(() => {
        if (isRespawning && respawnTargetPosition.current) {
            console.log(`[Jackalope] Processing respawn to position:`, respawnTargetPosition.current);
            
            // Teleport to respawn position again in case the first attempt failed
            if (jackalopeRef.current?.rigidBody) {
                position.current.copy(respawnTargetPosition.current);
                jackalopeRef.current.rigidBody.setNextKinematicTranslation(position.current);
                jackalopeRef.current.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
            
            // Use the character controller to teleport to the respawn position
            if (characterController.current && typeof characterController.current.setTranslation === 'function') {
                characterController.current.setTranslation({
                    x: respawnTargetPosition.current.x,
                    y: respawnTargetPosition.current.y,
                    z: respawnTargetPosition.current.z
                });
            }
        }
    }, [isRespawning, respawnTargetPosition.current]);
    
    // Main update - directly updates both the visual model and physics
    useFrame((state, delta) => {
        // Early return if refs aren't ready
        if (!jackalopeRef.current?.rigidBody) return

        // Check for respawn effect visual trigger
        if (respawnEffectRef.current) {
            respawnEffectRef.current = false;
            
            // Create spawn effect
            if (window.__createSpawnEffect) {
                window.__createSpawnEffect(
                    position.current.clone(),
                    '#4682B4', // Blue color for Jackalope
                    20, // Particles
                    0.5 // Radius
                );
            }
        }
        
        // Check for collision with circle in center (only for jackalope players) - for scoring only
        if (!adventureMode && !isRespawning && !isInvulnerable && window.jackalopesGame?.playerType === 'jackalope') {
            const circlePosition = new THREE.Vector3(0, 0.5, 0); // Center of circle
            const distanceToCircle = position.current.distanceTo(circlePosition);
            
            // If jackalope is within 5 units of the circle center
            if (distanceToCircle < 5) {
                console.log('🐰 Jackalope touched center circle, scoring a point!');
                
                // Only trigger score event if we're a local player
                if (connectionManager) {
                    try {
                        // Create particle effect at current position for visual feedback
                        if (window.__createExplosionEffect) {
                            window.__createExplosionEffect(
                                position.current.clone(),
                                '#4682B4', // Blue color for Jackalope
                                20, // More particles for a scoring effect
                                0.2 // Small explosion radius
                            );
                        }
                        
                        // Dispatch scoring event
                        const scoringEvent = new CustomEvent('jackalope_scored');
                        window.dispatchEvent(scoringEvent);
                        
                        // Get local player ID for respawn
                        const localPlayerId = connectionManager.getPlayerId();
                        
                        // Get respawn position from the global spawn manager
                        let spawnPosition: [number, number, number];
                        if (window.jackalopesGame?.spawnManager) {
                            spawnPosition = (window.jackalopesGame as any).spawnManager.getNextSpawnPoint();
                        } else {
                            // Fallback to default
                            spawnPosition = [-100, 3, 10];
                        }
                        console.log(`🐰 Using spawn position: [${spawnPosition.join(', ')}]`);
                        
                        try {
                            // Trigger respawn through network manager
                            if (window.__networkManager && localPlayerId) {
                                window.__networkManager.sendRespawnRequest(localPlayerId, spawnPosition);
                                console.log(`🐰 Respawn request sent for jackalope ${localPlayerId}`);
                            } else if (connectionManager && localPlayerId) {
                                // Fallback to connection manager if __networkManager isn't available
                                connectionManager.sendRespawnRequest(localPlayerId, spawnPosition);
                                console.log(`🐰 Respawn request sent via connectionManager for ${localPlayerId}`);
                            } else {
                                console.log('🐰 No player ID available for respawn request');
                            }
                            
                            // Apply respawn immediately to avoid delay
                            // Create a new THREE.Vector3 from spawn coordinates
                            respawnTargetPosition.current = new THREE.Vector3(spawnPosition[0], spawnPosition[1], spawnPosition[2]);
                            
                            // Update tracked position
                            position.current.set(spawnPosition[0], spawnPosition[1], spawnPosition[2]);
                            
                            // Direct teleport
                            jackalopeRef.current.rigidBody.setNextKinematicTranslation(position.current);
                            jackalopeRef.current.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true); // Reset velocity
                            
                            // Set respawning state
                            setIsRespawning(true);
                            respawnEffectRef.current = true; // Trigger visual effect
                            
                            // Set invulnerable state after a short delay
                            setTimeout(() => {
                                setIsRespawning(false);
                                setIsInvulnerable(true);
                                
                                // Remove invulnerability after 3 seconds
                                setTimeout(() => {
                                    setIsInvulnerable(false);
                                }, 3000);
                            }, 300);
                        } catch (error) {
                            console.error(`🐰 Error handling respawn after scoring:`, error);
                        }
                        
                    } catch (error) {
                        console.error(`🐰 Error handling scoring:`, error);
                    }
                } else {
                    console.log('🐰 No connection manager available for scoring');
                }
            }
        }
        
        if (adventureMode && Date.now() < adventureCombatState.deadUntil) {
            velocity.current.set(0, 0, 0)
            window.__localPlayerInteract = false
            return
        }
        // --- Normal Movement Logic ---
        // Get input state
        const { forward, backward, left, right, jump, sprint, interact, swimDown } = getKeyboardControls() as any

        // Cap a delayed render step so returning to the tab cannot fling the player.
        delta = Math.min(delta, 0.05)
        const surface = sampleSwimming(position.current, camera.getWorldPosition(_cameraDirection).y, gamepadState.connected)
        const swimming = surface !== null
        if (swimming !== wasSwimming.current) {
            velocity.current.y = 0
            hopTimer.current = 0
            isHopping.current = false
            if (swimming) {
                characterController.current.disableSnapToGround()
                characterController.current.disableAutostep()
            } else {
                characterController.current.enableSnapToGround(0.5)
                characterController.current.enableAutostep(0.5, 0.05, true)
            }
            wasSwimming.current = swimming
        }

        // Combine keyboard and gamepad
        const keyboardX = (right ? 1 : 0) - (left ? 1 : 0)
        const keyboardZ = (forward ? 1 : 0) - (backward ? 1 : 0)
        const dpadX = (gamepadState?.buttons?.dpadRight ? 1 : 0) - (gamepadState?.buttons?.dpadLeft ? 1 : 0)
        const dpadZ = (gamepadState?.buttons?.dpadUp ? 1 : 0) - (gamepadState?.buttons?.dpadDown ? 1 : 0)
        const gamepadX = gamepadState?.leftStick?.x ?? 0
        const gamepadZ = -(gamepadState?.leftStick?.y ?? 0)
        // Edge-triggered jump (for initiating jump)
        const jumpPressed = jump || gamepadState?.buttons?.jump
        // Level-triggered jump held (for variable-height jumps)
        const isJumpHeld = jump || (gamepadState.connected && gamepadState.buttons.jumpHeld)
        const isJumping = jumpPressed // Use edge-triggered for jump initiation
        const isSprinting = sprint || gamepadState?.buttons?.sprint
        // Edge-triggered interact (for mushroom eating)
        const interactPressed = interact || gamepadState?.buttons?.interact

        const boardPressed = interactPressed && !slideInteractHeld.current
        slideInteractHeld.current = !!interactPressed
        if (slideLayout && !slideRide.current && !isRespawning && boardPressed && canBoardWaterslide(slideLayout, position.current)) {
            slideRide.current = { progress: 0, elapsed: 0, origin: position.current.clone() }
            waterslideState.active = true
            velocity.current.set(0, 0, 0)
        }

        // Update global interact state for mushroom detection
        window.__localPlayerInteract = interactPressed
        if (interactPressed) {
            window.__lastLocalInteractAt = Date.now()
        }

        // Dispatch interact event with player position for mushroom eating
        if (interactPressed) {
            window.dispatchEvent(new CustomEvent('jackalope_interact', {
                detail: {
                    position: position.current.clone(),
                    playerId: connectionManager?.getPlayerId()
                }
            }))
        }
        
        // Get movement direction from input
        const inputDir = _inputDirection.set(
            Math.max(-1, Math.min(1, keyboardX + dpadX + gamepadX)),
            0,
            Math.max(-1, Math.min(1, keyboardZ + dpadZ + gamepadZ))
        )

        if (inputDir.lengthSq() > 1) {
            inputDir.normalize()
        }
        
        // Convert to camera-relative direction
        const cameraDirection = _cameraDirection.set(0, 0, -1).applyQuaternion(camera.quaternion)
        cameraDirection.y = 0 // Keep movement horizontal
        cameraDirection.normalize()
        
        const cameraSide = _cameraSide.set(1, 0, 0).applyQuaternion(camera.quaternion)
        cameraSide.y = 0
        cameraSide.normalize()
        
        // Calculate movement in camera space
        const moveDirection = _moveDirection.set(0, 0, 0)
        
        if (inputDir.z !== 0 || inputDir.x !== 0) {
            moveDirection
                .addScaledVector(cameraDirection, inputDir.z)
                .addScaledVector(cameraSide, inputDir.x)
                .normalize()

            // Rotate to face movement direction, matching keyboard/WASD feel.
            targetRotation.current = Math.atan2(moveDirection.x, moveDirection.z) + Math.PI
        }
        
        // Apply movement if we have input
        const hasMovementInput = Math.abs(inputDir.x) > 0.1 || Math.abs(inputDir.z) > 0.1
        
        // Check if we're on the ground (moved up)
        const groundCheck = characterController.current.computedGrounded()
        
        if (hasMovementInput) {
            // Calculate speed
            const speed = swimming ? (isSprinting ? 6.5 : 4.5) : BASE_SPEED * (isSprinting ? RUN_MULTIPLIER : 1.0)
            
            // Apply horizontal movement
            velocity.current.x = moveDirection.x * speed
            velocity.current.z = moveDirection.z * speed
            
            // Set animation based on speed
            setAnimation(isSprinting ? 'run' : 'walk')
            
            // Auto-hopping system when moving
            hopTimer.current += delta
            if (!swimming && hopTimer.current >= hopInterval.current && groundCheck) {
                // Time to hop - apply upward velocity if we're on the ground
                // Make hops faster and lower during sprinting for a quick-hopping effect
                velocity.current.y = jumpForce * hopHeight.current
                // Reduce hop interval when sprinting for faster, quick hops
                hopInterval.current = isSprinting ? 0.4 : 0.8
                hopTimer.current = 0
                isHopping.current = true
            }
        } else {
            // Slow down if no input
            velocity.current.x *= 0.8
            velocity.current.z *= 0.8
            
            // Reset hop timer when not moving
            hopTimer.current = 0
            isHopping.current = false
            
            // Clamp small velocities to 0
            if (Math.abs(velocity.current.x) < 0.01) velocity.current.x = 0
            if (Math.abs(velocity.current.z) < 0.01) velocity.current.z = 0
            
            // Switch to idle animation if basically stopped
            if (Math.sqrt(velocity.current.x * velocity.current.x + velocity.current.z * velocity.current.z) < 0.1) {
                setAnimation('idle')
            }
        }
        
        if (surface !== null) {
            const down = swimDown || (gamepadState.connected && gamepadState.buttons.swimDown)
            const verticalInput = Number(!!isJumpHeld) - Number(!!down)
            velocity.current.y = swimVerticalVelocity(position.current.y, surface, verticalInput, velocity.current.y, delta)
            isHopping.current = false
            hopTimer.current = 0
        } else {
        // Jump handling
        if (isJumping && groundCheck) {
            velocity.current.y = jumpForce * JUMP_MULTIPLIER
            isHopping.current = false // Reset hopping state on manual jump
            hopTimer.current = 0 // Reset hop timer on manual jump
        }
        
        // Apply gravity if not on ground
        if (!groundCheck) {
            velocity.current.y -= 9.8 * delta * GRAVITY_REDUCTION // Reduced gravity effect for higher/longer jumps
        } else if (velocity.current.y < 0) {
            velocity.current.y = 0 // Stop falling if on ground
        }
        
        }

        // Create a target position including the desired movement
        const targetPosition = position.current.clone().add(
            velocity.current.clone().multiplyScalar(delta)
        )
        
        // A boarded rider follows the open flume's centre rail. Ordinary movement and
        // network/model updates remain shared; only collision steering is bypassed on the ride.
        const riding = slideRide.current && slideLayout
        if (riding) {
            const ride = slideRide.current!
            ride.elapsed += delta
            const speed = THREE.MathUtils.lerp(8, 15, Math.min(1, ride.elapsed / 2))
            ride.progress = Math.min(1, ride.progress + speed * delta / slideLayout!.length)
            const sample = sampleWaterslideRide(slideLayout!, ride.progress)
            const blend = THREE.MathUtils.smoothstep(ride.elapsed, 0, 0.35)
            targetPosition.lerpVectors(ride.origin, sample.position, blend)
            velocity.current.copy(targetPosition).sub(position.current).divideScalar(Math.max(delta, 0.001))
            targetRotation.current = sample.heading
            waterslideState.heading = sample.heading
            hopTimer.current = 0
            isHopping.current = false
            setAnimation('idle')
            if (ride.progress === 1) {
                slideRide.current = null
                waterslideState.active = false
                velocity.current.multiplyScalar(0.2)
                velocity.current.y = 0
                window.dispatchEvent(new CustomEvent('jackalopes:slide-splash', { detail: {
                    position: [sample.position.x, slideLayout!.waterLevel, sample.position.z],
                } }))
            }
        }

        // Handle collision with the character controller
        const rigidBody = jackalopeRef.current.rigidBody
        const collider = rigidBody.collider(0)
        
        // Calculate the movement vector (target - current)
        const movement = {
            x: targetPosition.x - position.current.x,
            y: targetPosition.y - position.current.y,
            z: targetPosition.z - position.current.z
        }
        
        // Check for valid collision movement
        if (!riding) characterController.current.computeColliderMovement(collider, movement)
        const safeMovement = riding ? movement : characterController.current.computedMovement()
        
        // Apply the safe movement to our position
        position.current.x += safeMovement.x
        position.current.y += safeMovement.y
        position.current.z += safeMovement.z

        // No direct player-vs-player push here.
        // Player colliders are sensors, so hard blocking is gone.
        // Keeping this disabled avoids the invisible force-field feel around the merc.

        // Let the player genuinely fall off the map. Only recover after they have dropped
        // well below the Great Valley, and return them to a valid spawn rather than keeping
        // their out-of-bounds X/Z coordinates on an invisible floor.
        if (position.current.y < VOID_RECOVERY_Y) {
            position.current.copy(recoveryPosition.current)
            velocity.current.set(0, 0, 0)
            respawnEffectRef.current = true
        }
        
        // Sync the physics body to our position
        rigidBody.setNextKinematicTranslation(position.current)

        // Update global player position and rotation for mushroom proximity detection and decoy spawning
        window.__localPlayerPosition = position.current
        window.__localPlayerRotation = rotation.current

        if (
            connectionManager?.isReadyToSend?.() &&
            !isRespawning &&
            !isInvulnerable &&
            hasMovementInput &&
            isSprinting &&
            Date.now() - lastMercTakedownAt.current > 900
        ) {
            const livePlayers = (window as any).__livePlayerData || {}
            _jackalopePos2D.set(position.current.x, 0, position.current.z)
            _jackalopeMove2D.set(velocity.current.x, 0, velocity.current.z)

            if (_jackalopeMove2D.lengthSq() > 0.04) {
                _jackalopeMove2D.normalize()

                for (const [mercId, playerData] of Object.entries(livePlayers) as Array<[string, any]>) {
                    if (playerData?.playerType !== 'merc' || !playerData?.position) continue

                    _mercPos2D.set(playerData.position.x, 0, playerData.position.z)
                    _toMerc.subVectors(_mercPos2D, _jackalopePos2D)
                    const distance = _toMerc.length()
                    if (distance < 0.001 || distance > 3.6) continue

                    _toMerc.normalize()
                    _mercForward.set(
                        Math.sin(playerData.rotation || 0),
                        0,
                        Math.cos(playerData.rotation || 0)
                    ).normalize()

                    const behindFactor = _mercForward.dot(_toMerc)
                    const pursuitFactor = _jackalopeMove2D.dot(_toMerc)
                    if (behindFactor < 0.45 || pursuitFactor < 0.45) continue

                    connectionManager.sendMessage({
                        type: 'game_event',
                        event: {
                            event_type: 'player_respawn',
                            respawnId: `merc-takedown-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            player_id: mercId,
                            requestedBy: connectionManager.getPlayerId(),
                            timestamp: Date.now(),
                            spawnPosition: [10, 7, 10],
                            playerType: 'merc',
                            source: 'jackalope_sprint_takedown'
                        }
                    })

                    lastMercTakedownAt.current = Date.now()

                    if (window.__createExplosionEffect) {
                        window.__createExplosionEffect(
                            new THREE.Vector3(playerData.position.x, playerData.position.y ?? 3, playerData.position.z),
                            '#ff6a00',
                            18,
                            0.18
                        )
                    }

                    break
                }
            }
        }
        
        // Only repair corrupted positions here. Normal negative Y values are real falling now.
        if (visible && thirdPersonView && jackalopeModelRef.current) {
            const modelY = jackalopeModelRef.current.position.y;
            if (!Number.isFinite(modelY) || modelY > 1000) {
                console.log(`[JACKALOPE] Model position out of bounds (y=${modelY.toFixed(2)}), resetting position`);
                position.current.copy(recoveryPosition.current);
                velocity.current.set(0, 0, 0);
                jackalopeModelRef.current.position.y = position.current.y - 2.15;
                rigidBody.setNextKinematicTranslation(position.current);
            }
        }
        
        if (adventureMode && adventureAvatar === 'astronaut' && Date.now() < adventureCombatState.aimingUntil) {
            rotation.current = adventureCombatState.aimHeading
            targetRotation.current = adventureCombatState.aimHeading
        }
        // Smoothly rotate the model to face the movement direction
        const rotDiff = Math.atan2(
            Math.sin(targetRotation.current - rotation.current),
            Math.cos(targetRotation.current - rotation.current)
        )
        rotation.current += rotDiff * Math.min(1, 10 * delta)
        
        // DIRECT MODEL UPDATES - no React props involved
        
        // 1. Third-person model
        if (jackalopeModelRef.current && thirdPersonView) {
            // Outer group handles world position and yaw only.
            jackalopeModelRef.current.position.set(
                position.current.x,
                position.current.y - 2.15,
                position.current.z
            )
            jackalopeModelRef.current.rotation.set(0, rotation.current + Math.PI, 0)

            // Inner group handles local forward lean around a cleaner pivot.
            if (jackalopeLeanRef.current) {
                const walkLeanDeg = 10
                const sprintLeanDeg = 18
                const walkLean = walkLeanDeg * (Math.PI / 180)
                const sprintLean = sprintLeanDeg * (Math.PI / 180)
                const leanAmount = waterslideState.active ? -0.18 : animation === 'walk' ? walkLean : (animation === 'run' ? sprintLean : 0)

                jackalopeLeanRef.current.position.set(0, 0, 0)
                jackalopeLeanRef.current.rotation.set(leanAmount, 0, 0)
            }
            
            // Debug - occasionally log rotation to verify leaning is correct
            if (Math.random() < 0.005 && (window.jackalopesGame?.debugLevel || 0) >= 3) {
                console.log(
                    `[JACKALOPE ROTATION] Rotation: (${THREE.MathUtils.radToDeg(jackalopeModelRef.current.rotation.x).toFixed(1)}°, ` +
                    `${THREE.MathUtils.radToDeg(jackalopeModelRef.current.rotation.y).toFixed(1)}°, ` +
                    `${THREE.MathUtils.radToDeg(jackalopeModelRef.current.rotation.z).toFixed(1)}°) | ` +
                    `Animation: ${animation} | Height Offset: ${heightOffset.toFixed(2)}`
                );
            }
            
            // Debug - occasionally log position to verify model is where it should be
            if (Math.random() < 0.01 && (window.jackalopesGame?.debugLevel || 0) >= 3) {
                console.log(
                    `[JACKALOPE MODEL] Position: (${jackalopeModelRef.current.position.x.toFixed(2)}, ${jackalopeModelRef.current.position.y.toFixed(2)}, ${jackalopeModelRef.current.position.z.toFixed(2)}) | ` +
                    `Physics: (${position.current.x.toFixed(2)}, ${position.current.y.toFixed(2)}, ${position.current.z.toFixed(2)})`
                );
            }
        }
        
        // 2. First-person model
        if (fpModelRef.current && !thirdPersonView) {
            fpModelRef.current.position.set(
                position.current.x,
                position.current.y,
                position.current.z
            )
            fpModelRef.current.rotation.y = rotation.current
        }
        
        // Inform parent of movement
        if (onMove) {
            onMove(position.current.clone())
        }
        
        // Send multiplayer updates at fixed intervals
        if (connectionManager && connectionManager.isReadyToSend() &&
            (Date.now() - lastStateTime.current > 16)) { // 60 updates per second
            
            lastStateTime.current = Date.now()
            
            // Create rotation quaternion for network
            const rotationQuat = _networkRotationQuat.setFromEuler(
                _networkRotationEuler.set(0, rotation.current, 0)
            )
            
            connectionManager.sendPlayerUpdate({
                position: [position.current.x, position.current.y, position.current.z],
                rotation: [rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w],
                velocity: [velocity.current.x, velocity.current.y, velocity.current.z],
                sequence: Date.now(),
                playerType: 'jackalope',
                adventureAvatar: adventureMode ? adventureAvatar : undefined,
                isWalking: animation === 'walk',
                isRunning: animation === 'run'
            })
        }
        
        // Add debug log occasionally - reduced frequency and only if debug level is high enough
        if (Math.random() < 0.002 && (window.jackalopesGame?.debugLevel || 0) >= 3) {
            console.log(`[JACKALOPE] Pos: (${position.current.x.toFixed(2)}, ${position.current.y.toFixed(2)}, ${position.current.z.toFixed(2)}) | Vel: (${velocity.current.x.toFixed(2)}, ${velocity.current.y.toFixed(2)}, ${velocity.current.z.toFixed(2)}) | Anim: ${animation}`)
        }
        
        // Update the position for camera tracking immediately on each movement
        if (onMove) {
            onMove(position.current);
        }

        // Keep the root model visible without per-frame scene traversal
        if (jackalopeModelRef.current) {
            jackalopeModelRef.current.visible = true;
        }
    })
    
    // Expose methods to parent through ref
    useImperativeHandle(ref, () => ({
        ...jackalopeRef.current,
        getPosition: () => {
            return position.current.clone()
        },
        getRotation: () => {
            return new THREE.Quaternion().setFromEuler(
                new THREE.Euler(0, rotation.current, 0)
            )
        }
    }))
    
    // Create a direct update function for the camera
    const updateCameraPosition = useCallback(() => {
        if (position.current && thirdPersonView) {
            // Check if we have a global position tracker (set up in App.tsx)
            if (window.playerPositionTracker && typeof window.playerPositionTracker.updatePosition === 'function') {
                // Directly update the camera tracking position
                window.playerPositionTracker.updatePosition(position.current.clone());
            }
        }
    }, [thirdPersonView]);

    // Call this function on every frame as a high priority
    useFrame(() => {
        // Update camera position on every frame for more immediate response
        if (thirdPersonView) {
            updateCameraPosition();
        }
    }, -10); // High priority to run early

    useEffect(() => {
        // Announce player type for camera control
        if (thirdPersonView) {
            try {
                // Set a global property that the ThirdPersonCameraControls component checks
                if (window.jackalopesGame) {
                    window.jackalopesGame.playerType = 'jackalope';
                    console.log('[JACKALOPE] Set global player type to jackalope for camera system');
                }
                
                // Force camera update a few times to ensure proper initialization
                const updateTimes = [0, 100, 300, 600, 1000];
                updateTimes.forEach(time => {
                    setTimeout(() => {
                        updateCameraPosition();
                        // Also dispatch an event to force camera update
                        const event = new CustomEvent('cameraUpdateNeeded', {
                            detail: { position: position.current.clone() }
                        });
                        window.dispatchEvent(event);
                    }, time);
                });
            } catch (err) {
                console.warn('[JACKALOPE] Could not set global player type:', err);
            }
        }
    }, [thirdPersonView, updateCameraPosition]);

    return (
        <>
            {/* Physics body - for collision only */}
            <Entity isPlayer ref={jackalopeRef}>
                <Component name="rigidBody">
                    <RigidBody
                        {...props}
                        colliders={false}
                        mass={1}
                        type="kinematicPosition"
                        enabledRotations={[false, false, false]}
                        position={[position.current.x, position.current.y, position.current.z]}
                        name="jackalope-player"
                    >
                        <object3D name="jackalope" />
                        <CapsuleCollider args={[0.85, 0.35]} position={[0, -0.65, 0]} sensor />
                    </RigidBody>
                </Component>
            </Entity>
            
            {/* First person model - we manipulate this directly in useFrame */}
            {visible && !thirdPersonView && (
                <group ref={fpModelRef}>
                    <mesh position={[0, 0.3, 0]} castShadow>
                        <capsuleGeometry args={[0.3, 0.4, 4, 8]} />
                        <meshStandardMaterial color="#ffffff" />
                    </mesh>
                    
                    <mesh position={[0, 0.8, 0.2]} castShadow>
                        <sphereGeometry args={[0.25, 16, 16]} />
                        <meshStandardMaterial color="#ffffff" />
                    </mesh>
                    
                    <group>
                        <mesh position={[-0.1, 1.1, 0.2]} rotation={[0.2, 0, -0.1]} castShadow>
                            <capsuleGeometry args={[0.03, 0.4, 4, 8]} />
                            <meshStandardMaterial color="#ffffff" />
                        </mesh>
                        <mesh position={[0.1, 1.1, 0.2]} rotation={[0.2, 0, 0.1]} castShadow>
                            <capsuleGeometry args={[0.03, 0.4, 4, 8]} />
                            <meshStandardMaterial color="#ffffff" />
                        </mesh>
                    </group>
                </group>
            )}
            
            {/* Third person model - create with initial position to avoid flashing */}
            {visible && thirdPersonView && !combatDead && (
                <group 
                    ref={jackalopeModelRef} 
                    scale={[2, 2, 2]}
                    position={[position.current.x, position.current.y - 2.15, position.current.z]}
                    rotation={[0, rotation.current + Math.PI, 0]}
                >
                    <group ref={jackalopeLeanRef}>
                        {adventureMode && adventureAvatar === 'astronaut' ? <group name="adventure-astronaut">
                            <MercModel adventureStyle flinchUntil={flinchUntil} animation={animation} scale={[1.8, 1.8, 1.8]} />
                        </group> : <JackalopeModel
                            animation={animation}
                            visible={visible}
                            // Note: we don't pass position/rotation as props anymore
                            // The parent group will be manipulated directly in useFrame
                        />}
                    </group>
                </group>
            )}
            
            {combatDead && <Html fullscreen style={{ pointerEvents: 'none', display: 'grid', placeItems: 'center' }}><div role="status" data-testid="adventure-knocked-out" style={{ padding: 18, borderRadius: 12, background: '#241814dd', color: '#ffe4ce', fontFamily: 'system-ui' }}>You were hit · Respawning…</div></Html>}
            {/* Invulnerability shield effect */}
            {isInvulnerable && (
                <mesh position={[position.current.x, position.current.y, position.current.z]}>
                    <sphereGeometry args={[3, 32, 32]} />
                    <meshStandardMaterial 
                        color="#4682B4"
                        transparent={true}
                        opacity={0.3}
                        emissive="#4682B4"
                        emissiveIntensity={0.5}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            )}
        </>
    )
})
