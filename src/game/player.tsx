import Rapier from '@dimforge/rapier3d-compat'
import { KeyboardControls, PerspectiveCamera, PointerLockControls, useKeyboardControls, useGLTF, useAnimations } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, RigidBodyProps, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useGamepad } from '../common/hooks/use-gamepad'
import { useControls } from 'leva'
import * as THREE from 'three'
import { Component, Entity, EntityType } from './ecs'

// Update import to use MultiplayerManager
import { ConnectionManager } from '../network/ConnectionManager'
import { useMultiplayer } from '../network/MultiplayerManager'
import { MercModel } from './MercModel' // Import our new MercModel component
import { JackalopeModel } from './JackalopeModel' // Import the JackalopeModel
import { FpsArmsModelPath } from '../assets' // Import FPS arms model path
import { FootstepAudio } from '../components/FootstepAudio' // Import our new FootstepAudio component

const _direction = new THREE.Vector3()
const _frontVector = new THREE.Vector3()
const _sideVector = new THREE.Vector3()
const _characterLinvel = new THREE.Vector3()
const _characterTranslation = new THREE.Vector3()
const _cameraWorldDirection = new THREE.Vector3()
const _cameraPosition = new THREE.Vector3()

const normalFov = 90
const sprintFov = 100

const characterShapeOffset = 0.1
const autoStepMaxHeight = 2
const autoStepMinWidth = 0.05
const accelerationTimeAirborne = 0.5
const accelerationTimeGrounded = 0.15
const timeToJumpApex = 2
const maxJumpHeight = 0.5
const minJumpHeight = 0.2
const velocityXZSmoothing = 0.25
const velocityXZMin = 0.001
const jumpGravity = -(2 * maxJumpHeight) / Math.pow(timeToJumpApex, 3)
const maxJumpVelocity = Math.abs(jumpGravity) * timeToJumpApex
const minJumpVelocity = Math.sqrt(2 * Math.abs(jumpGravity) * minJumpHeight)

const up = new THREE.Vector3(0, 1, 0)

// Add these outside the component for rotation calculation
const _playerDirection = new THREE.Vector3();
const _lastModelPosition = new THREE.Vector3();
const _modelTargetPosition = new THREE.Vector3();

export type PlayerControls = {
    children: React.ReactNode
}

export type PlayerProps = RigidBodyProps & {
    onMove?: (position: THREE.Vector3) => void
    walkSpeed?: number
    runSpeed?: number
    jumpForce?: number
    connectionManager?: ConnectionManager // Add optional ConnectionManager for multiplayer
    visible?: boolean // Add visibility option for third-person view
    thirdPersonView?: boolean // Flag for third-person camera mode
    playerType?: 'merc' | 'jackalope' // Add player type to determine which model to use
}

export const Player = forwardRef<EntityType, PlayerProps>(({ onMove, walkSpeed = 0.1, runSpeed = 0.15, jumpForce = 0.5, connectionManager, visible = false, thirdPersonView = false, playerType = 'merc', ...props }, ref) => {
    const playerRef = useRef<EntityType>(null!)
    const gltf = useGLTF(FpsArmsModelPath)
    const { actions } = useAnimations(gltf.animations, gltf.scene)
    
    // Add a flag to track when arms model is ready to use
    const armsModelReady = useRef(false);
    
    // Get required hooks early to avoid linter errors
    const rapier = useRapier()
    const camera = useThree((state) => state.camera)
    const clock = useThree((state) => state.clock)
    
    // Debug log for FPS arms model loading
    useEffect(() => {
        if (gltf?.scene) {
            console.log('FPS arms model loaded successfully:', gltf.scene);
            console.log('FPS arms animations:', Object.keys(actions));
            armsModelReady.current = true;
            
            // Immediately position the arms when model loads successfully
            if (playerType === 'merc' && !thirdPersonView) {
                console.log('[FPS ARMS] Model loaded, applying initial positioning');
                // Add slight delay to ensure model is fully processed
                setTimeout(repositionFpsArms, 10);
                setTimeout(repositionFpsArms, 50);
                setTimeout(repositionFpsArms, 100);
                
                // Also trigger a full reset
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('forceArmsReset'));
                }, 200);
            }
        } else {
            console.error('Failed to load FPS arms model');
            armsModelReady.current = false;
        }
    }, [gltf.scene, actions]);
    
    // For client-side prediction
    const lastStateTime = useRef(0)
    const pendingReconciliation = useRef(false)
    const reconciliationStrength = useRef(0.3) // Default reconciliation strength
    const serverPosition = useRef(new THREE.Vector3())
    const movementIntent = useRef({ forward: false, backward: false, left: false, right: false, jump: false, sprint: false })
    
    // Add a ref for the player's rotation (for the third-person camera)
    const playerRotation = useRef(new THREE.Quaternion())

    // Arms position controls
    const { x, y, z, scaleArms } = useControls('Arms Position', {
        x: { value: 0, min: -1, max: 1, step: 0.01 },
        y: { value: -1, min: -2, max: 1, step: 0.01 },
        z: { value: -0.05, min: -2, max: 0, step: 0.01 },
        scaleArms: { value: 1.2, min: 0.5, max: 3, step: 0.1 },
    }, {
        collapsed: true,
        order: 1
    })

    // Create a ref for the FPS arms to ensure position consistency
    const fpsArmsRef = useRef<THREE.Group>(null);
    
    // Function to reposition FPS arms (extracted to make it reusable)
    const repositionFpsArms = () => {
        if (fpsArmsRef.current && !thirdPersonView && playerType === 'merc') {
            try {
                // Fix rotation issues - adjust rotation to correct the upside-down and backwards orientation
                fpsArmsRef.current.position.set(x, y, z);
                // Just reset the group rotation and let the primitive handle rotation
                fpsArmsRef.current.rotation.set(0, 0, 0);
                fpsArmsRef.current.scale.set(scaleArms, scaleArms, scaleArms);
                console.log('[FPS ARMS] Repositioned FPS arms with rotation:', { x, y, z, rotation: 'Group: X:0, Y:0, Z:0', scale: scaleArms });
                
                // Ensure primitive rotation is set properly too
                try {
                    // Access the primitive directly if needed
                    const primitive = fpsArmsRef.current.children.find(child => child.type === 'Group' && child.userData?.type === 'primitive');
                    if (primitive) {
                        // Fix upside-down issue by rotating 180° on Z axis instead of X axis
                        primitive.rotation.set(0, Math.PI, 0);
                    }
                } catch (e) {
                    // Ignore errors accessing children
                }
            } catch (err) {
                console.error('[FPS ARMS] Error repositioning arms:', err);
            }
        }
    };
    
    // Add an effect to ensure FPS arms stay positioned correctly after graphics quality changes
    useEffect(() => {
        // Position FPS arms consistently when visible
        if (playerType === 'merc' && !thirdPersonView) {
            repositionFpsArms();
        }
    }, [x, y, z, scaleArms, thirdPersonView, playerType]);
    
    // Add an effect for when the player type changes to handle the arms visibility
    useEffect(() => {
        console.log(`[PLAYER] Player type changed to ${playerType}, third person: ${thirdPersonView}`);
        
        // Update global player type
        if (!window.jackalopesGame) {
            window.jackalopesGame = {};
        }
        window.jackalopesGame.playerType = playerType;
        
        // Dispatch event to notify other components about the player type change
        window.dispatchEvent(new CustomEvent('playerTypeChanged', { 
            detail: { 
                type: playerType,
                thirdPerson: thirdPersonView 
            } 
        }));
        
        // When switching to merc in first person, make sure arms are repositioned
        if (playerType === 'merc' && !thirdPersonView) {
            if (armsModelReady.current) {
                console.log('[FPS ARMS] Player type is merc in first person, repositioning arms');
                
                // Multiple attempts to reposition
                setTimeout(repositionFpsArms, 0);
                setTimeout(repositionFpsArms, 50);
                setTimeout(repositionFpsArms, 150);
                
                // Also dispatch arms reset event
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('forceArmsReset'));
                }, 200);
            } else {
                console.log('[FPS ARMS] Arms model not ready yet for repositioning');
            }
        }
    }, [playerType, thirdPersonView]);
    
    // This will detect when the component has mounted after a page load/reload
    useEffect(() => {
        console.log('[FPS ARMS] Triggering automatic reset after page load/reload');
        // Use a short delay to allow everything to initialize
        const initialLoadTimer = setTimeout(() => {
            // Dispatch force arms reset event
            window.dispatchEvent(new CustomEvent('forceArmsReset'));
        }, 500);
        
        return () => clearTimeout(initialLoadTimer);
    }, []); // Empty dependency array means this runs once on mount
    
    // Listen for graphics quality changes and camera update events
    useEffect(() => {
        const handleQualityChange = () => {
            // Ensure FPS arms are positioned correctly after quality change
            if (fpsArmsRef.current && !thirdPersonView && playerType === 'merc') {
                // Use multiple delayed attempts to ensure rendering pipeline has updated
                setTimeout(repositionFpsArms, 50);
                setTimeout(repositionFpsArms, 100);
                setTimeout(repositionFpsArms, 300);
            }
        };
        
        // Also listen for camera update events
        const handleCameraUpdate = () => {
            if (fpsArmsRef.current && !thirdPersonView && playerType === 'merc') {
                // Multiple attempts at repositioning
                setTimeout(repositionFpsArms, 50);
                setTimeout(repositionFpsArms, 100);
                setTimeout(repositionFpsArms, 300);
                setTimeout(() => {
                    repositionFpsArms();
                    
                    // Also update camera FOV to default to ensure consistency
                    if (camera instanceof THREE.PerspectiveCamera) {
                        camera.fov = normalFov;
                        camera.updateProjectionMatrix();
                    }
                }, 500);
            }
        };
        
        // Handle force arms reset event (more aggressive reset)
        const handleForceArmsReset = () => {
            console.log('[FPS ARMS] Received force arms reset command - executing complete reset');
            
            // If we're not currently in the right mode, this will prepare for when we switch
            setTimeout(() => {
                if (fpsArmsRef.current) {
                    // Force extreme reset with completely fresh positioning
                    try {
                        // Use vanilla DOM methods to access and reset the arms model
                        fpsArmsRef.current.position.set(x, y, z);
                        fpsArmsRef.current.rotation.set(0, 0, 0);
                        fpsArmsRef.current.scale.set(scaleArms, scaleArms, scaleArms);
                        
                        // Find all child objects and reset them as well
                        fpsArmsRef.current.traverse((child) => {
                            if (child.type === 'Group' && child.userData?.type === 'primitive') {
                                // Fix upside-down issue by rotating 180° on Y axis only
                                child.rotation.set(0, Math.PI, 0);
                                console.log('[FPS ARMS] Set primitive rotation to [0, Math.PI, 0]');
                            }
                        });
                        
                        console.log('[FPS ARMS] Forced complete arms reset successful');
                    } catch (err) {
                        console.error('[FPS ARMS] Error during forced reset:', err);
                    }
                } else {
                    console.log('[FPS ARMS] Arms ref not available for reset yet');
                }
            }, 200);
            
            // Multiple aggressive timed attempts
            for (let i = 1; i <= 5; i++) {
                setTimeout(repositionFpsArms, i * 200);
            }
        };
        
        // Handle forceCameraSync event specifically for dark level changes
        const handleForceCameraSync = (event: CustomEvent) => {
            if (!thirdPersonView && playerType === 'merc' && fpsArmsRef.current) {
                console.log('[FPS ARMS] Forcing camera sync due to lighting changes');
                
                // More aggressive positioning with timing attempts
                setTimeout(() => {
                    if (fpsArmsRef.current) {
                        fpsArmsRef.current.position.set(x, y, z);
                        fpsArmsRef.current.rotation.set(0, 0, 0);
                        fpsArmsRef.current.scale.set(scaleArms, scaleArms, scaleArms);
                        
                        // Make sure FOV is also reset
                        if (camera instanceof THREE.PerspectiveCamera) {
                            camera.fov = normalFov;
                            camera.updateProjectionMatrix();
                        }
                        
                        // Request pointer lock again if it was lost
                        if (!document.pointerLockElement && document.body && !thirdPersonView) {
                            try {
                                console.log('[FPS CAMERA] Re-acquiring pointer lock after dark level change');
                                document.body.requestPointerLock();
                            } catch (e) {
                                console.error('[FPS CAMERA] Failed to request pointer lock:', e);
                            }
                        }
                        
                        console.log('[FPS ARMS] Camera and arms sync complete');
                    }
                }, 100);
                
                // Add multiple attempts to ensure pointer lock and camera sync
                for (let i = 2; i <= 5; i++) {
                    setTimeout(() => {
                        if (!document.pointerLockElement && document.body && !thirdPersonView) {
                            try {
                                document.body.requestPointerLock();
                            } catch (e) {
                                // Ignore errors in retry attempts
                            }
                        }
                    }, i * 200);
                }
            }
        };
        
        // Listen for our custom events
        window.addEventListener('graphicsQualityChanged', handleQualityChange);
        window.addEventListener('cameraUpdateNeeded', handleCameraUpdate);
        window.addEventListener('forceArmsReset', handleForceArmsReset);
        window.addEventListener('forceCameraSync', handleForceCameraSync as EventListener);
        
        return () => {
            window.removeEventListener('graphicsQualityChanged', handleQualityChange);
            window.removeEventListener('cameraUpdateNeeded', handleCameraUpdate);
            window.removeEventListener('forceArmsReset', handleForceArmsReset);
            window.removeEventListener('forceCameraSync', handleForceCameraSync as EventListener);
        };
    }, [playerType, thirdPersonView, camera, x, y, z, scaleArms]);
    
    // Add special handling for the camera FOV to prevent glitches
    useEffect(() => {
        // Reset FOV when switching to/from third person view
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = normalFov;
            camera.updateProjectionMatrix();
            
            if (!thirdPersonView) {
                // Force position update for FPS arms when switching to first-person
                setTimeout(repositionFpsArms, 50);
                setTimeout(repositionFpsArms, 200);
                setTimeout(repositionFpsArms, 500);
            }
        }
    }, [thirdPersonView, camera]);

    // Ensure FPS arms are updated every frame to stay attached to the camera
    useFrame(() => {
        if (fpsArmsRef.current && !thirdPersonView && playerType === 'merc') {
            // Position the arms on every frame
            fpsArmsRef.current.position.set(x, y, z);
            fpsArmsRef.current.scale.set(scaleArms, scaleArms, scaleArms);
            
            // Ensure primitive rotation is correct on every frame
            fpsArmsRef.current.traverse((child) => {
                if (child.type === 'Group' && child.userData?.type === 'primitive') {
                    child.rotation.set(0, Math.PI, 0);
                }
            });
        }
    });

    const characterController = useRef<Rapier.KinematicCharacterController>(null!)

    const [, getKeyboardControls] = useKeyboardControls()
    const gamepadState = useGamepad()

    const horizontalVelocity = useRef({ x: 0, z: 0 })
    const jumpVelocity = useRef(0)
    const holdingJump = useRef(false)
    const jumpTime = useRef(0)
    const jumping = useRef(false)

    // Animation states
    const [isWalking, setIsWalking] = useState(false)
    const [isRunning, setIsRunning] = useState(false)

    // For tracking the last animation state change time to prevent flicker
    const lastAnimationChange = useRef(0)
    const animationChangeDebounce = 300 // ms

    // Animation state for Mixamo model
    const [currentAnimation, setCurrentAnimation] = useState('idle')
    
    // Add logging when animation state changes
    useEffect(() => {
        console.log(`Animation state changed: walking=${isWalking}, running=${isRunning}, animation=${currentAnimation}`);
    }, [isWalking, isRunning, currentAnimation])

    // Add a reference for the model
    const playerModelRef = useRef<THREE.Group>(null);

    useEffect(() => {
        const { world } = rapier

        characterController.current = world.createCharacterController(characterShapeOffset)
        characterController.current.enableAutostep(autoStepMaxHeight, autoStepMinWidth, true)
        characterController.current.setSlideEnabled(true)
        characterController.current.enableSnapToGround(0.1)
        characterController.current.setApplyImpulsesToDynamicBodies(true)

        // Stop all animations initially
        Object.values(actions).forEach(action => action?.stop())
        
        // Initialize with idle animation
        console.log('Initializing with idle animation');
        setIsWalking(false);
        setIsRunning(false);
        setCurrentAnimation('idle');

        return () => {
            world.removeCharacterController(characterController.current)
            characterController.current = null!
        }
    }, [])

    // Handle shooting animation
    useEffect(() => {
        const handleShoot = () => {
            if (document.pointerLockElement) {
                const fireAction = actions['Rig|Saiga_Fire']
                if (fireAction) {
                    fireAction.setLoop(THREE.LoopOnce, 1)
                    fireAction.reset().play()
                }
                
                // For now, continue using the walk animation for shooting
                // until a shoot animation is added
                setCurrentAnimation('walk')
            }
        }

        window.addEventListener('pointerdown', handleShoot)
        return () => window.removeEventListener('pointerdown', handleShoot)
    }, [actions])

    useBeforePhysicsStep(() => {
        const characterRigidBody = playerRef.current.rigidBody

        if (!characterRigidBody) return

        const characterCollider = characterRigidBody.collider(0)

        const { forward, backward, left, right, jump, sprint } = getKeyboardControls() as KeyControls
        
        // Combine keyboard and gamepad input
        const moveForward = forward || (gamepadState.leftStick.y < 0)
        const moveBackward = backward || (gamepadState.leftStick.y > 0)
        const moveLeft = left || (gamepadState.leftStick.x < 0)
        const moveRight = right || (gamepadState.leftStick.x > 0)
        const isJumping = jump || gamepadState.buttons.jump
        const isSprinting = sprint || gamepadState.buttons.leftStickPress

        // Store movement intent for prediction/reconciliation
        movementIntent.current = {
            forward: moveForward,
            backward: moveBackward,
            left: moveLeft, 
            right: moveRight,
            jump: isJumping,
            sprint: isSprinting
        }

        const speed = walkSpeed * (isSprinting ? runSpeed / walkSpeed : 1)
        
        // Update movement state for animations with velocity threshold
        const isMoving = moveForward || moveBackward || moveLeft || moveRight
        
        // Add a velocity-based check to make sure we're actually moving
        // This prevents animation flicker when keys are released
        const velocity = Math.sqrt(
            Math.pow(horizontalVelocity.current.x, 2) + 
            Math.pow(horizontalVelocity.current.z, 2)
        )
        
        // FIX: Immediately update walking state based on input intent
        // This ensures the walking sound starts as soon as movement keys are pressed
        if (isMoving) {
            if (isSprinting) {
                setIsRunning(true);
                setIsWalking(false);
            } else {
                setIsWalking(true);
                setIsRunning(false);
            }
        } else if (velocity < 0.01) {
            // Reset to idle state when truly stopped
            setIsWalking(false); 
            setIsRunning(false);
        }

        const grounded = characterController.current.computedGrounded()

        // x and z movement - align calculation with Jackalope
        _frontVector.set(0, 0, Number(moveForward) - Number(moveBackward))
        _sideVector.set(Number(moveRight) - Number(moveLeft), 0, 0)

        const cameraWorldDirection = camera.getWorldDirection(_cameraWorldDirection)
        const cameraYaw = Math.atan2(cameraWorldDirection.x, cameraWorldDirection.z)

        // Modified to match Jackalope implementation
        _direction.subVectors(_frontVector, _sideVector).normalize().multiplyScalar(speed)
        _direction.applyAxisAngle(up, cameraYaw)

        const horizontalVelocitySmoothing = velocityXZSmoothing * (grounded ? accelerationTimeGrounded : accelerationTimeAirborne)
        const horizontalVelocityLerpFactor = 1 - Math.pow(horizontalVelocitySmoothing, 0.116)
        horizontalVelocity.current = {
            x: THREE.MathUtils.lerp(horizontalVelocity.current.x, _direction.x, horizontalVelocityLerpFactor),
            z: THREE.MathUtils.lerp(horizontalVelocity.current.z, _direction.z, horizontalVelocityLerpFactor),
        }

        if (Math.abs(horizontalVelocity.current.x) < velocityXZMin) {
            horizontalVelocity.current.x = 0
        }
        if (Math.abs(horizontalVelocity.current.z) < velocityXZMin) {
            horizontalVelocity.current.z = 0
        }

        // jumping and gravity
        if (isJumping && grounded) {
            jumping.current = true
            holdingJump.current = true
            jumpTime.current = clock.elapsedTime
            jumpVelocity.current = maxJumpVelocity * (jumpForce / 0.5) // Scale jump velocity based on jumpForce
        }

        if (!isJumping && grounded) {
            jumping.current = false
        }

        if (jumping.current && holdingJump.current && !isJumping) {
            if (jumpVelocity.current > minJumpVelocity) {
                jumpVelocity.current = minJumpVelocity
            }
        }

        if (!isJumping && grounded) {
            jumpVelocity.current = 0
        } else {
            jumpVelocity.current += jumpGravity * 0.116
        }

        holdingJump.current = isJumping

        // compute movement direction
        const movementDirection = {
            x: horizontalVelocity.current.x,
            y: jumpVelocity.current,
            z: horizontalVelocity.current.z,
        }

        // compute collider movement and update rigid body
        characterController.current.computeColliderMovement(characterCollider, movementDirection)

        const translation = characterRigidBody.translation()
        const newPosition = _characterTranslation.copy(translation as THREE.Vector3)
        const movement = characterController.current.computedMovement()
        newPosition.add(movement)

        // If we need to reconcile with server position
        if (pendingReconciliation.current) {
            // Blend between our predicted position and server position with appropriate strength
            newPosition.lerp(serverPosition.current, reconciliationStrength.current)
            
            // Debug output
            if (reconciliationStrength.current > 0.1) {
                console.log(`Applied reconciliation with strength ${reconciliationStrength.current.toFixed(2)}`);
                console.log(`New position: (${newPosition.x.toFixed(2)}, ${newPosition.y.toFixed(2)}, ${newPosition.z.toFixed(2)})`);
            }
            
            // Reset flags - reconciliation applied
            pendingReconciliation.current = false;
            reconciliationStrength.current = 0.3; // Reset to default
        }

        characterRigidBody.setNextKinematicTranslation(newPosition)
    })

    // Call this in useFrame to ensure frequent checks
    useFrame((_, delta) => {
        const characterRigidBody = playerRef.current.rigidBody
        if (!characterRigidBody) {
            return
        }

        _characterLinvel.copy(characterRigidBody.linvel() as THREE.Vector3)
        const currentSpeed = _characterLinvel.length()

        const { forward, backward, left, right } = getKeyboardControls() as KeyControls
        const isMoving = forward || backward || left || right
        const isSprinting = getKeyboardControls().sprint || gamepadState.buttons.leftStickPress

        // Calculate velocity magnitude for better animation state detection
        const velocityMagnitude = Math.sqrt(
            Math.pow(horizontalVelocity.current.x, 2) + 
            Math.pow(horizontalVelocity.current.z, 2)
        );
        
        // Log velocity occasionally for debugging
        if (Math.random() < 0.01) {
            console.log(`Player velocity: ${velocityMagnitude.toFixed(4)}`);
        }
        
        // FIX: Secondary velocity check for animation state updates
        // This ensures that if keys are still pressed but velocity drops, we maintain correct state
        if (velocityMagnitude < 0.01 && !isMoving) {
            if (isWalking || isRunning) {
                console.log(`Player stopped moving, velocity: ${velocityMagnitude.toFixed(4)}`);
                setIsWalking(false);
                setIsRunning(false);
            }
        } 
        // Enhanced check for movement states with press feedback
        else if (isMoving) {
            if (isSprinting && !isRunning) {
                console.log(`Player started running, velocity: ${velocityMagnitude.toFixed(4)}`);
                setIsRunning(true);
                setIsWalking(false);
            } else if (!isSprinting && !isWalking) {
                console.log(`Player started walking, velocity: ${velocityMagnitude.toFixed(4)}`);
                setIsWalking(true);
                setIsRunning(false);
            }
        }

        const translation = characterRigidBody.translation()
        onMove?.(translation as THREE.Vector3)
        const cameraPosition = _cameraPosition.set(translation.x, translation.y + 2.42, translation.z)
        const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
        
        // Different sensitivities for horizontal and vertical aiming
        const CAMERA_SENSITIVITY_X = 0.04
        const CAMERA_SENSITIVITY_Y = 0.03
        
        // Apply gamepad right stick for camera rotation
        if (gamepadState.connected && (Math.abs(gamepadState.rightStick.x) > 0 || Math.abs(gamepadState.rightStick.y) > 0)) {
            // Update Euler angles
            cameraEuler.y -= gamepadState.rightStick.x * CAMERA_SENSITIVITY_X
            cameraEuler.x = THREE.MathUtils.clamp(
                cameraEuler.x - gamepadState.rightStick.y * CAMERA_SENSITIVITY_Y,
                -Math.PI / 2,
                Math.PI / 2
            )
            
            // Apply the new rotation while maintaining up vector
            camera.quaternion.setFromEuler(cameraEuler)
        }
        
        camera.position.lerp(cameraPosition, delta * 30)
        
        // FOV change for sprint with improved stability
        if (camera instanceof THREE.PerspectiveCamera) {
            // Make FOV change more stable with less interpolation
            const targetFov = isSprinting && currentSpeed > 0.1 ? sprintFov : normalFov;
            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 5 * delta); // Reduced from 10 to 5 for more stability
            camera.updateProjectionMatrix();
            
            // Ensure FPS arms follow camera immediately if they exist
            if (fpsArmsRef.current && !thirdPersonView && playerType === 'merc') {
                // Keep arms attached to camera at all times
                fpsArmsRef.current.position.set(x, y, z);
                
                // Also ensure primitive rotation is maintained correctly on every frame
                fpsArmsRef.current.traverse((child) => {
                    if (child.type === 'Group' && child.userData?.type === 'primitive') {
                        // Fix upside-down issue by rotating 180° on Y axis
                        child.rotation.set(0, Math.PI, 0);
                    }
                });
            }
        }

        // Send position to multiplayer system if connected
        if (connectionManager && connectionManager.isReadyToSend() &&
            (Date.now() - lastStateTime.current > 16)) { // 60 updates per second
            lastStateTime.current = Date.now();
            
            const position = characterRigidBody.translation();
            // Get rotation from camera for player direction instead of rigid body
            // This better represents the direction the player is facing
            const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
            const cameraYaw = Math.atan2(cameraDirection.x, cameraDirection.z);
            const cameraPitch = Math.asin(-cameraDirection.y); // negative because -Y = looking up
            const rotationQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
            
            const velocity = characterRigidBody.linvel();
            
            connectionManager.sendPlayerUpdate({
                position: [position.x, position.y, position.z],
                rotation: [rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w],
                velocity: [velocity.x, velocity.y, velocity.z],
                sequence: Date.now(),
                playerType: playerType,
                flashlightOn: flashlightOn,
                cameraPitch: cameraPitch
            });
        }

        // Update player model position with smoothing
        if ((thirdPersonView || visible) && playerModelRef.current && playerRef.current && playerRef.current.rigidBody) {
            try {
                const position = playerRef.current.rigidBody.translation();
                
                // Only update if the position is valid
                if (position && !Number.isNaN(position.x) && !Number.isNaN(position.y) && !Number.isNaN(position.z)) {
                    // Create target position
                    _modelTargetPosition.set(position.x, position.y, position.z);
                    
                    // First time setup
                    if (_lastModelPosition.lengthSq() === 0) {
                        _lastModelPosition.copy(_modelTargetPosition);
                        playerModelRef.current.position.copy(_modelTargetPosition);
                    } else {
                        // Smoother interpolation for position - use slower rate for more stability
                        const lerpFactor = thirdPersonView ? 0.15 : 0.5; // Slower in third-person for stability
                        playerModelRef.current.position.lerp(_modelTargetPosition, lerpFactor);
                        _lastModelPosition.copy(playerModelRef.current.position);
                    }
                    
                    if (thirdPersonView) {
                        // Get camera direction for model rotation but only in third-person mode
                        const cameraWorldDirection = camera.getWorldDirection(_playerDirection);
                        
                        // Only use X and Z components for yaw calculation to prevent tipping
                        const cameraYaw = Math.atan2(cameraWorldDirection.x, cameraWorldDirection.z);
                        
                        // Smoothly interpolate rotation to prevent jittering
                        const currentYaw = playerModelRef.current.rotation.y;
                        const targetYaw = cameraYaw;
                        
                        // Calculate shortest path for rotation
                        let deltaYaw = targetYaw - currentYaw;
                        while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
                        while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
                        
                        // Very slow rotation interpolation for stability
                        playerModelRef.current.rotation.y = currentYaw + deltaYaw * 0.08;
                    }
                }
            } catch (error) {
                console.error("Error updating player model position:", error);
            }
        }
    })
    
    // Set the current animation based on movement state
    useEffect(() => {
        // Update animation based on movement state
        if (isRunning) {
            console.log('Setting run animation');
            setCurrentAnimation('run');
        } else if (isWalking) {
            console.log('Setting walk animation');
            setCurrentAnimation('walk');
        } else {
            console.log('Setting idle animation');
            setCurrentAnimation('idle');
        }
        
        // Log the current animation state for debugging
        console.log(`Animation state changed: walking=${isWalking}, running=${isRunning}, animation=${currentAnimation}`);
    }, [isWalking, isRunning]);

    // Handle movement animations
    useEffect(() => {
        const walkAction = actions['Rig|Saiga_Walk']
        const runAction = actions['Rig|Saiga_Run']

        if (isRunning) {
            walkAction?.stop()
            runAction?.play()
        } else if (isWalking) {
            runAction?.stop()
            walkAction?.play()
        } else {
            walkAction?.stop()
            runAction?.stop()
        }
    }, [isWalking, isRunning, actions])

    // Set up reconciliation handler if connection manager is provided
    useEffect(() => {
        if (connectionManager) {
            // Listen for server state updates to reconcile
            const handleServerState = (state: any) => {
                // Check if we need to apply corrections
                if (state.serverCorrection || (state.positionError && state.positionError > 0.25)) {
                    console.log(`Applying server correction - Error: ${state.positionError?.toFixed(3) || 'unknown'}`);
                
                    // We got an authoritative update from server
                    serverPosition.current.set(
                        state.position[0],
                        state.position[1],
                        state.position[2]
                    );
                    
                    // Calculate correction strength based on error magnitude
                    const correctionStrength = Math.min(0.8, Math.max(0.1, 
                        state.positionError ? state.positionError * 0.2 : 0.3
                    ));
                    
                    console.log(`Correction strength: ${correctionStrength.toFixed(2)}`);
                    
                    // Apply with appropriate strength
                    if (pendingReconciliation.current) {
                        // Already waiting for a correction, make this one stronger
                        pendingReconciliation.current = true;
                        reconciliationStrength.current = Math.max(reconciliationStrength.current, correctionStrength);
                    } else {
                        // First correction for this update
                        pendingReconciliation.current = true;
                        reconciliationStrength.current = correctionStrength;
                    }
                } else if (state.position) {
                    // No major correction needed, but store server position anyway
                    // for smaller corrections
                    serverPosition.current.set(
                        state.position[0],
                        state.position[1],
                        state.position[2]
                    );
                    
                    // Small correction (less than threshold)
                    if (state.positionError && state.positionError > 0.05) {
                        // Use a gentler correction for small errors
                        pendingReconciliation.current = true;
                        reconciliationStrength.current = 0.05;
                    }
                }
            };
            
            connectionManager.on('server_state_update', handleServerState);
            
            return () => {
                connectionManager.off('server_state_update', handleServerState);
            };
        }
    }, [connectionManager]);

    // Add getRotationQuaternion method to the player's ref
    useImperativeHandle(ref, () => ({
        ...playerRef.current,
        getRotationQuaternion: () => {
            // Calculate rotation based on camera direction
            const cameraWorldDirection = camera.getWorldDirection(new THREE.Vector3());
            const cameraYaw = Math.atan2(cameraWorldDirection.x, cameraWorldDirection.z);
            
            // Create and return a quaternion
            return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
        }
    }), [camera]);

    // Expose the ref
    useEffect(() => {
        if (ref) {
            // @ts-ignore - TypeScript doesn't handle this pattern well
            ref.current = playerRef.current;
        }
    }, [ref]);

    useEffect(() => {
        // Lock/unlock pointer based on view mode
        if (thirdPersonView) {
            // Exit pointer lock when switching to third-person
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        }
    }, [thirdPersonView]);

    // Keep a stable reference to the PerspectiveCamera
    const fpsCameraRef = useRef<THREE.PerspectiveCamera>(null);
    
    // Special frame handler just for camera stability
    useFrame(() => {
        // Ensure camera remains properly connected to the player's position
        if (!thirdPersonView && playerType === 'merc' && fpsCameraRef.current) {
            // Maintain stability by resetting camera position if needed
            if (fpsCameraRef.current.parent && fpsCameraRef.current.parent.type === 'Object3D') {
                // Camera should always be positioned at player's head height
                fpsCameraRef.current.position.set(0, 0.75, 0);
                
                // Ensure camera has correct FOV (could be changed by sprint)
                if (fpsCameraRef.current.fov !== normalFov) {
                    fpsCameraRef.current.fov = normalFov;
                    fpsCameraRef.current.updateProjectionMatrix();
                }
            }
        }
    });

    // Create refs for the flashlight and its target
    const spotlightRef = useRef<THREE.SpotLight>(null);
    const spotlightTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());
    
    // State to toggle flashlight
    const [flashlightOn, setFlashlightOn] = useState(true);
    
    // Make flashlight state accessible globally
    useEffect(() => {
        // Make sure jackalopesGame exists
        if (!window.jackalopesGame) {
            window.jackalopesGame = {};
        }
        
        // Add flashlight state to window for global access
        window.jackalopesGame.flashlightOn = flashlightOn;
    }, [flashlightOn]);
    
    // Toggle flashlight with F key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'f' || e.key === 'F') {
                setFlashlightOn(prev => !prev);
                
                // Dispatch event to update flashlight UI elsewhere
                window.dispatchEvent(new CustomEvent('flashlightToggled', { 
                    detail: { isOn: !flashlightOn } 
                }));
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [flashlightOn]);
    
    // Update spotlight position to follow camera
    useFrame(() => {
        if (spotlightRef.current && spotlightTargetRef.current && !thirdPersonView && playerType === 'merc') {
            spotlightRef.current.target = spotlightTargetRef.current;
            
            if (fpsCameraRef.current) {
                const cameraDirection = new THREE.Vector3(0, 0, -1);
                const cameraQuaternion = new THREE.Quaternion();
                const cameraScale = new THREE.Vector3();
                
                fpsCameraRef.current.matrixWorld.decompose(
                    _cameraPosition,
                    cameraQuaternion,
                    cameraScale
                );
                
                cameraDirection.applyQuaternion(cameraQuaternion);
                
                // Position spotlight at camera position (gun tip offset forward)
                spotlightRef.current.position.copy(_cameraPosition);
                spotlightRef.current.position.addScaledVector(cameraDirection, 0.5);
                
                // Target 20 units ahead of camera
                spotlightTargetRef.current.position.copy(_cameraPosition);
                spotlightTargetRef.current.position.addScaledVector(cameraDirection, 20);
                
                spotlightTargetRef.current.updateMatrixWorld(true);
            }
        }
    });

    // Expose player state directly instead of using a memoized object
    // This is for components that need to access player state
    const playerState = {
        isWalking,
        isRunning
    };

    return (
        <>
            <Entity isPlayer ref={playerRef}>
                <Component name="rigidBody">
                    <RigidBody
                        {...props}
                        colliders={false}
                        mass={1}
                        type="kinematicPosition"
                        enabledRotations={[false, false, false]}
                    >
                        <object3D name="player" />
                        <CapsuleCollider args={[1, 0.5]} />
                    </RigidBody>
                </Component>
            </Entity>
            
            {/* Add FootstepAudio component to handle spatial audio */}
            {playerType === 'merc' && (
                <FootstepAudio
                    playerRef={playerRef}
                    isWalking={isWalking}
                    isRunning={isRunning}
                />
            )}
            
            {/* Render player model when in third-person view or visible is true */}
            {(thirdPersonView || visible) && playerType === 'merc' && (
                <group ref={playerModelRef}>
                    {/* Player head */}
                    <mesh position={[0, 1.7, 0]} castShadow>
                        <sphereGeometry args={[0.4, 16, 16]} />
                        <meshStandardMaterial color="#4287f5" />
                    </mesh>
                    
                    {/* Player body */}
                    <mesh position={[0, 0.9, 0]} castShadow>
                        <capsuleGeometry args={[0.4, 1.2, 4, 8]} />
                        <meshStandardMaterial color="#4287f5" />
                    </mesh>
                    
                    {/* Player arm - left */}
                    <mesh position={[-0.6, 0.9, 0]} rotation={[0, 0, -Math.PI / 4]} castShadow>
                        <capsuleGeometry args={[0.15, 0.6, 4, 8]} />
                        <meshStandardMaterial color="#4287f5" />
                    </mesh>
                    
                    {/* Player arm - right - adjusted position for holding a weapon */}
                    <mesh position={[0.55, 0.95, 0.3]} rotation={[0.3, 0, Math.PI / 4]} castShadow>
                        <capsuleGeometry args={[0.15, 0.6, 4, 8]} />
                        <meshStandardMaterial color="#4287f5" />
                    </mesh>
                    
                    {/* Weapon model */}
                    <group position={[0.7, 0.95, 0.6]} rotation={[-0.1, 0, 0]}>
                        {/* Main body of the weapon */}
                        <mesh castShadow position={[0.3, 0, 0]}>
                            <cylinderGeometry args={[0.08, 0.12, 0.5, 8]} />
                            <meshStandardMaterial color="#333333" metalness={0.8} roughness={0.2} />
                        </mesh>
                        
                        {/* Handle */}
                        <mesh castShadow position={[0.15, -0.1, 0]} rotation={[0, 0, Math.PI/2 - 0.5]}>
                            <cylinderGeometry args={[0.03, 0.03, 0.2, 8]} />
                            <meshStandardMaterial color="#222222" metalness={0.3} roughness={0.7} />
                        </mesh>
                    </group>
                </group>
            )}
            
            {visible && thirdPersonView && playerType === 'merc' && ( // Show the Mixamo model in third-person view for merc
                <MercModel 
                    animation={currentAnimation} 
                    visible={visible}
                    position={[0, -0.9, 0]} // Adjusted position to better match the ground
                    rotation={[0, Math.PI, 0]} // Rotated to face forward
                />
            )}
            
            {visible && thirdPersonView && playerType === 'jackalope' && ( // Show the Jackalope model in third-person view
                <JackalopeModel
                    animation={currentAnimation}
                    visible={visible}
                    position={[0, 0, 0]} // Position for jackalope model
                    rotation={[0, Math.PI, 0]} // Rotated to face forward
                    scale={[1, 1, 1]} // Default scale
                />
            )}
            
            {!thirdPersonView && (
                <PerspectiveCamera
                    ref={fpsCameraRef}
                    makeDefault
                    fov={normalFov}
                    position={[0, 0.975, 0]}
                >
                    {/* Only render FPS arms if player type is merc */}
                    {playerType === 'merc' && (
                        <group ref={fpsArmsRef} position={[x, y, z]} rotation={[0, 0, 0]}>
                            {/* Add a debug sphere to help visualize the position */}
                            <mesh position={[0, 0, 0]}>
                                <sphereGeometry args={[0.05, 16, 16]} />
                                <meshStandardMaterial color="red" />
                            </mesh>
                            
                            <primitive 
                                object={gltf.scene} 
                                position={[0, 0, 0]}
                                rotation={[0, Math.PI, 0]} // Fixed rotation that solves the upside-down issue
                                scale={scaleArms}
                                userData={{ type: 'primitive' }} // Add a marker to find this child
                            />
                            
                        </group>
                    )}
                </PerspectiveCamera>
            )}
            
            {/* Flashlight - OUTSIDE the camera/arms hierarchy so position is in world space */}
            <spotLight
                ref={spotlightRef}
                color={0xffffdd}
                intensity={flashlightOn ? 18 : 0}
                distance={50}
                angle={0.6}
                penumbra={0.7}
                decay={1.5}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-near={0.5}
                shadow-camera-far={50}
                shadow-bias={-0.0005}
                shadow-radius={5}
                shadow-normalBias={0.05}
            />
            
            {document.pointerLockElement && !thirdPersonView && (
                <PointerLockControls />
            )}
        </>
    )
})

type KeyControls = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    sprint: boolean
    jump: boolean
}

const controls = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'sprint', keys: ['Shift'] },
]

type PlayerControlsProps = {
    children: React.ReactNode
    thirdPersonView?: boolean
}

export const PlayerControls = ({ children, thirdPersonView = false }: PlayerControlsProps) => {
    // Track whether pointer lock was released due to third-person toggle
    const [pointerLockDisabled, setPointerLockDisabled] = useState(false);
    const pointerLockRef = useRef<any>(null);
    
    // Effect to handle mode switching
    useEffect(() => {
        if (thirdPersonView) {
            setPointerLockDisabled(true);
            
            // When switching to third-person, release pointer lock
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        } else {
            // Add a small delay before re-enabling pointer lock
            // to prevent immediately re-locking when toggling modes
            const timeout = setTimeout(() => {
                setPointerLockDisabled(false);
                
                // Re-acquire pointer lock if we're in first-person mode
                if (!document.pointerLockElement && document.body && !thirdPersonView) {
                    try {
                        document.body.requestPointerLock();
                    } catch (e) {
                        console.error('[CONTROLS] Failed to request pointer lock:', e);
                    }
                }
            }, 500);
            
            return () => clearTimeout(timeout);
        }
    }, [thirdPersonView]);
    
    // Listen for dark level changes
    useEffect(() => {
        const handleDarkLevelChange = (event: CustomEvent) => {
            // When dark level changes, ensure pointer lock is maintained
            if (!thirdPersonView && !pointerLockDisabled) {
                // If pointer lock is lost, try to reacquire it
                if (!document.pointerLockElement && document.body) {
                    try {
                        console.log('[CONTROLS] Reacquiring pointer lock after dark level change');
                        document.body.requestPointerLock();
                    } catch (e) {
                        console.error('[CONTROLS] Failed to request pointer lock:', e);
                    }
                }
            }
        };
        
        // Listen for force dark level changes
        window.addEventListener('forceCameraSync', handleDarkLevelChange as EventListener);
        
        return () => {
            window.removeEventListener('forceCameraSync', handleDarkLevelChange as EventListener);
        };
    }, [thirdPersonView, pointerLockDisabled]);
    
    return (
        <KeyboardControls map={controls}>
            {children}
            {/* Only use pointer lock controls in first-person view */}
            {!thirdPersonView && !pointerLockDisabled && <PointerLockControls ref={pointerLockRef} makeDefault />}
        </KeyboardControls>
    )
}

// Preload the model to ensure it's cached
useGLTF.preload(FpsArmsModelPath)