import Rapier from '@dimforge/rapier3d-compat'
import { PerspectiveCamera, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, RigidBodyProps, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react'
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

// Props for the Jackalope component
type JackalopeProps = RigidBodyProps & {
    walkSpeed?: number
    runSpeed?: number
    jumpForce?: number
    onMove?: (position: THREE.Vector3) => void
    connectionManager?: ConnectionManager
    visible?: boolean
    thirdPersonView?: boolean
}

// Keyboard controls type
type KeyControls = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
    sprint: boolean
}

export const Jackalope = forwardRef<EntityType, JackalopeProps>(({ 
    onMove, 
    walkSpeed = 0.12, 
    runSpeed = 0.22, 
    jumpForce = 0.8, 
    connectionManager, 
    visible = false, 
    thirdPersonView = false, 
    ...props 
}, ref) => {
    // Core references
    const jackalopeRef = useRef<EntityType>(null!)
    const jackalopeModelRef = useRef<THREE.Group>(null)
    const fpModelRef = useRef<THREE.Group>(null)
    
    // Physics
    const rapier = useRapier()
    const characterController = useRef<any>(null)
    
    // For direct position control
    const position = useRef(new THREE.Vector3())
    const velocity = useRef(new THREE.Vector3())
    const rotation = useRef(0)
    const targetRotation = useRef(0)
    
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
    const [isInvulnerable, setIsInvulnerable] = useState(false)
    const respawnEffectRef = useRef<boolean>(false)
    const respawnTargetPosition = useRef<THREE.Vector3 | null>(null); // Store target respawn position
    
    // Core setup
    const camera = useThree((state) => state.camera)
    const [, getKeyboardControls] = useKeyboardControls()
    const gamepadState = useGamepad()
    
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
            position.current.set(props.position[0], props.position[1] + 2.0, props.position[2])
        } else {
            // Default position if none provided - ensure we're high enough above ground
            position.current.y = 3.0 
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
                    position.current.y - 0.65,
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
        if (!isRespawning && !isInvulnerable && window.jackalopesGame?.playerType === 'jackalope') {
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
        
        // --- Normal Movement Logic ---
        // Get input state
        const { forward, backward, left, right, jump, sprint } = getKeyboardControls() as any
        
        // Combine keyboard and gamepad
        const moveForward = forward || (gamepadState?.leftStick?.y < 0)
        const moveBackward = backward || (gamepadState?.leftStick?.y > 0)
        const moveLeft = left || (gamepadState?.leftStick?.x < 0)
        const moveRight = right || (gamepadState?.leftStick?.x > 0)
        const isJumping = jump || gamepadState?.buttons?.jump
        const isSprinting = sprint || gamepadState?.buttons?.leftStickPress
        
        // Get movement direction from input
        const inputDir = new THREE.Vector3(
            (moveRight ? 1 : 0) - (moveLeft ? 1 : 0),
            0,
            (moveForward ? 1 : 0) - (moveBackward ? 1 : 0)
        ).normalize()
        
        // Convert to camera-relative direction
        const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        cameraDirection.y = 0 // Keep movement horizontal
        cameraDirection.normalize()
        
        const cameraSide = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
        cameraSide.y = 0
        cameraSide.normalize()
        
        // Calculate movement in camera space
        const moveDirection = new THREE.Vector3()
        
        if (inputDir.z !== 0 || inputDir.x !== 0) {
            moveDirection
                .addScaledVector(cameraDirection, inputDir.z)
                .addScaledVector(cameraSide, inputDir.x)
                .normalize()
            
            targetRotation.current = Math.atan2(moveDirection.x, moveDirection.z) + Math.PI
        }
        
        // Apply movement if we have input
        const hasMovementInput = Math.abs(inputDir.x) > 0.1 || Math.abs(inputDir.z) > 0.1
        
        // Check if we're on the ground (moved up)
        const groundCheck = characterController.current.computedGrounded()
        
        if (hasMovementInput) {
            // Calculate speed
            const speed = BASE_SPEED * (isSprinting ? RUN_MULTIPLIER : 1.0)
            
            // Apply horizontal movement
            velocity.current.x = moveDirection.x * speed
            velocity.current.z = moveDirection.z * speed
            
            // Set animation based on speed
            setAnimation(isSprinting ? 'run' : 'walk')
            
            // Auto-hopping system when moving
            hopTimer.current += delta
            if (hopTimer.current >= hopInterval.current && groundCheck) {
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
        
        // Create a target position including the desired movement
        const targetPosition = position.current.clone().add(
            velocity.current.clone().multiplyScalar(delta)
        )
        
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
        characterController.current.computeColliderMovement(collider, movement)
        const safeMovement = characterController.current.computedMovement()
        
        // Apply the safe movement to our position
        position.current.x += safeMovement.x
        position.current.y += safeMovement.y
        position.current.z += safeMovement.z
        
        // Prevent falling below ground level (y=0)
        if (position.current.y < 1.0) {
            position.current.y = 1.0
            
            // If we hit the ground or fall below it, ensure we bounce back up slightly
            // This helps prevent the jackalope from disappearing under the ground
            velocity.current.y = 0.5; // Small upward bounce
            console.log("[JACKALOPE] Preventing fall through ground - applying safety bounce");
        }
        
        // Sync the physics body to our position
        rigidBody.setNextKinematicTranslation(position.current)
        
        // Add failsafe - if model is too low or appears to have fallen through the floor, reset position
        if (visible && thirdPersonView && jackalopeModelRef.current) {
            const modelY = jackalopeModelRef.current.position.y;
            if (modelY < -10 || modelY > 1000) {
                console.log(`[JACKALOPE] Model position out of bounds (y=${modelY.toFixed(2)}), resetting position`);
                position.current.y = 3.0;
                velocity.current.set(0, 0, 0);
                jackalopeModelRef.current.position.y = position.current.y - 0.65;
                rigidBody.setNextKinematicTranslation(position.current);
            }
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
            // Update model position directly
            jackalopeModelRef.current.position.set(
                position.current.x,
                position.current.y - 0.65, // Reduce height offset to lower the model
                position.current.z
            )
            
            // Apply additional height adjustment for sprint leaning
            let heightOffset = 0;
            if (animation === 'run') {
                // When leaning at 45 degrees while sprinting, the model lifts up
                // Add extra downward offset to compensate - this keeps feet on ground
                heightOffset = 0.5; // Adjust this value as needed based on testing
                jackalopeModelRef.current.position.y -= heightOffset;
            }
            
            // BUGFIX: Apply animation-specific offset to maintain consistent pivot
            // When running/sprinting, adjust the Z position to counter the pivot shift
            if (animation === 'run') {
                // Apply a negative Z offset to counteract the forward-shifting pivot during sprinting
                // This makes the model rotate around its visual center consistently regardless of animation
                const sprintOffset = -0.3; // This value may need adjustment based on testing
                jackalopeModelRef.current.position.z += sprintOffset;
            }
            
            // Apply forward leaning based on animation state
            // Walking: 22.5 degrees forward lean
            // Running: 45 degrees forward lean
            // Idle: No lean (0 degrees)
            const walkLean = 22.5 * (Math.PI / 180); // Convert 22.5 degrees to radians
            const sprintLean = 45 * (Math.PI / 180); // Convert 45 degrees to radians
            
            // Set the lean amount based on animation state
            const leanAmount = animation === 'walk' ? walkLean : (animation === 'run' ? sprintLean : 0);
            
            // SIMPLER APPROACH - Using Euler angles in the correct order
            // This avoids quaternion composition issues
            
            // First apply Y rotation to match character orientation
            jackalopeModelRef.current.rotation.set(0, rotation.current + Math.PI, 0);
            
            // Then apply X rotation for forward lean
            if (animation === 'walk' || animation === 'run') {
                // Apply lean directly on the x-axis (forward tilt) after y rotation
                jackalopeModelRef.current.rotateX(leanAmount);
            } else if (jackalopeModelRef.current.rotation.x > 0.01) {
                // Gradually return to upright when idle
                jackalopeModelRef.current.rotation.x = Math.max(0, jackalopeModelRef.current.rotation.x - (0.1 * delta));
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
            (Date.now() - lastStateTime.current > 50)) { // 20 updates per second
            
            lastStateTime.current = Date.now()
            
            // Create rotation quaternion for network
            const rotationQuat = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(0, rotation.current, 0)
            )
            
            connectionManager.sendPlayerUpdate({
                position: [position.current.x, position.current.y, position.current.z],
                rotation: [rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w],
                velocity: [velocity.current.x, velocity.current.y, velocity.current.z],
                sequence: Date.now(),
                playerType: 'jackalope'
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

        // Ensure the model is always visible by directly setting its visibility
        if (jackalopeModelRef.current) {
            // Force visibility of all child objects
            jackalopeModelRef.current.traverse((child) => {
                if (child.type === 'Mesh') {
                    const mesh = child as THREE.Mesh;
                    mesh.visible = true;
                }
            });
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
                        <CapsuleCollider args={[1.0, 0.5]} position={[0, -0.65, 0]} />
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
            {visible && thirdPersonView && (
                <group 
                    ref={jackalopeModelRef} 
                    scale={[2, 2, 2]}
                    position={[position.current.x, position.current.y - 0.65, position.current.z]}
                    rotation={[0, rotation.current + Math.PI, 0]}
                >
                    <JackalopeModel
                        animation={animation}
                        visible={visible}
                        // Note: we don't pass position/rotation as props anymore
                        // The parent group will be manipulated directly in useFrame
                    />
                </group>
            )}
            
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