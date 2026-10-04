import Rapier from '@dimforge/rapier3d-compat'
import { KeyboardControls, PerspectiveCamera, PointerLockControls, useKeyboardControls, useGLTF, useAnimations } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, RigidBodyProps, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { CHARACTER_CAPSULE } from './character-physics'
import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react'

declare global {
    interface Window {
        __localPlayerPosition?: THREE.Vector3
        __localPlayerInteract?: boolean
        __lastLocalInteractAt?: number
    }
}
import { useSwimming, swimVerticalVelocity } from './terrain/use-swimming'
import { consumeTouchLookDelta } from '../common/touch-input'
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
const _cameraEuler = new THREE.Euler()
const _cameraScale = new THREE.Vector3()
const _cameraQuaternion = new THREE.Quaternion()
const _rotationQuat = new THREE.Quaternion()
const _spotlightDirection = new THREE.Vector3(0, 0, -1)

const normalFov = 90
const sprintFov = 100

const characterShapeOffset = 0.1
const autoStepMaxHeight = 2
const autoStepMinWidth = 0.05
const accelerationTimeAirborne = 0.5
const accelerationTimeGrounded = 0.15
const velocityXZSmoothing = 0.25
const velocityXZMin = 0.001
// Simple fixed values for stable jumping
const jumpGravity = -0.025
const maxJumpVelocity = 0.18
const minJumpVelocity = 0.10

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
    
    useEffect(() => {
        armsModelReady.current = !!gltf?.scene;
        if (armsModelReady.current && playerType === 'merc' && !thirdPersonView) {
            requestAnimationFrame(() => repositionFpsArms());
        }
    }, [gltf?.scene, playerType, thirdPersonView]);

    useEffect(() => {
        const handleRespawned = (event: Event) => {
            if (playerType !== 'merc') return

            const detail = (event as CustomEvent<{ position?: [number, number, number] }>).detail
            const spawnCoords = detail?.position || [10, 7, 10]
            const characterRigidBody = playerRef.current?.rigidBody
            if (!characterRigidBody) return

            const nextPosition = new THREE.Vector3(spawnCoords[0], spawnCoords[1], spawnCoords[2])
            characterRigidBody.setNextKinematicTranslation(nextPosition)
            characterRigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true)

            if (!window.__localPlayerPosition) {
                window.__localPlayerPosition = new THREE.Vector3()
            }
            window.__localPlayerPosition.copy(nextPosition)
            camera.position.set(nextPosition.x, nextPosition.y + 2.42, nextPosition.z)
        }

        window.addEventListener('player_respawned', handleRespawned as EventListener)
        return () => {
            window.removeEventListener('player_respawned', handleRespawned as EventListener)
        }
    }, [camera, playerType]);
    
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

    // Create refs for the FPS arms to keep updates cheap and predictable
    const fpsArmsRef = useRef<THREE.Group>(null);
    const fpsPrimitiveRef = useRef<THREE.Object3D>(null);
    
    const repositionFpsArms = () => {
        if (!fpsArmsRef.current || thirdPersonView || playerType !== 'merc') return;

        fpsArmsRef.current.position.set(x, y, z);
        fpsArmsRef.current.rotation.set(0, 0, 0);
        fpsArmsRef.current.scale.set(scaleArms, scaleArms, scaleArms);

        if (fpsPrimitiveRef.current) {
            fpsPrimitiveRef.current.rotation.set(0, Math.PI, 0);
        }
    };
    
    useEffect(() => {
        if (!window.jackalopesGame) {
            window.jackalopesGame = {};
        }
        window.jackalopesGame.playerType = playerType;
        window.dispatchEvent(new CustomEvent('playerTypeChanged', {
            detail: {
                type: playerType,
                thirdPerson: thirdPersonView
            }
        }));

        if (playerType === 'merc' && !thirdPersonView && armsModelReady.current) {
            requestAnimationFrame(() => repositionFpsArms());
        }
    }, [playerType, thirdPersonView]);

    useEffect(() => {
        const handleArmsRefresh = () => requestAnimationFrame(() => repositionFpsArms());
        window.addEventListener('graphicsQualityChanged', handleArmsRefresh);
        window.addEventListener('cameraUpdateNeeded', handleArmsRefresh);
        window.addEventListener('forceArmsReset', handleArmsRefresh);
        window.addEventListener('forceCameraSync', handleArmsRefresh);

        return () => {
            window.removeEventListener('graphicsQualityChanged', handleArmsRefresh);
            window.removeEventListener('cameraUpdateNeeded', handleArmsRefresh);
            window.removeEventListener('forceArmsReset', handleArmsRefresh);
            window.removeEventListener('forceCameraSync', handleArmsRefresh);
        };
    }, [playerType, thirdPersonView, x, y, z, scaleArms]);

    useEffect(() => {
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = normalFov;
            camera.updateProjectionMatrix();
        }
        requestAnimationFrame(() => repositionFpsArms());
    }, [thirdPersonView, camera, x, y, z, scaleArms]);

    useFrame(() => {
        if (fpsArmsRef.current && !thirdPersonView && playerType === 'merc') {
            fpsArmsRef.current.position.set(x, y, z);
            fpsArmsRef.current.scale.set(scaleArms, scaleArms, scaleArms);
        }
    });

    const characterController = useRef<Rapier.KinematicCharacterController>(null!)

    const [, getKeyboardControls] = useKeyboardControls()
    const gamepadState = useGamepad()
    const sampleSwimming = useSwimming()
    const swimmingLastStep = useRef(false)
    const swimVelocity = useRef(0)
    const [isSwimming, setIsSwimming] = useState(false)

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

        if (window.jackalopesGame?.droneActive) {
            horizontalVelocity.current = { x: 0, z: 0 }
            return
        }

        const characterCollider = characterRigidBody.collider(0)

        const { forward, backward, left, right, jump, sprint, swimDown } = getKeyboardControls() as KeyControls
        
        // Combine keyboard and gamepad input
        const moveForward = forward || (gamepadState.leftStick.y < 0)
        const moveBackward = backward || (gamepadState.leftStick.y > 0)
        const moveLeft = left || (gamepadState.leftStick.x < 0)
        const moveRight = right || (gamepadState.leftStick.x > 0)
        // Edge-triggered jump (only fires on first frame of button press)
        const jumpPressed = jump || gamepadState.buttons.jump
        // Level-triggered jump held (true while button is held, for variable-height jumps)
        const isJumpHeld = jump || (gamepadState.connected && gamepadState.buttons.jumpHeld)
        const isSprinting = sprint || gamepadState.buttons.sprint

        // Store movement intent for prediction/reconciliation
        movementIntent.current = {
            forward: moveForward,
            backward: moveBackward,
            left: moveLeft,
            right: moveRight,
            jump: isJumpHeld,
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

        const translationBefore = characterRigidBody.translation()
        const surface = sampleSwimming(translationBefore, camera.getWorldPosition(_cameraPosition).y, gamepadState.connected)
        const swimming = surface !== null
        if (swimming !== swimmingLastStep.current) {
            swimmingLastStep.current = swimming
            setIsSwimming(swimming)
            swimVelocity.current = 0
            jumpVelocity.current = 0
            jumping.current = false
            if (swimming) {
                characterController.current.disableSnapToGround()
                characterController.current.disableAutostep()
            } else {
                characterController.current.enableSnapToGround(0.1)
                characterController.current.enableAutostep(autoStepMaxHeight, autoStepMinWidth, true)
            }
        }
        const grounded = characterController.current.computedGrounded()

        // x and z movement - align calculation with Jackalope
        _frontVector.set(0, 0, Number(moveForward) - Number(moveBackward))
        _sideVector.set(Number(moveLeft) - Number(moveRight), 0, 0)

        const cameraWorldDirection = camera.getWorldDirection(_cameraWorldDirection)
        const cameraYaw = Math.atan2(cameraWorldDirection.x, cameraWorldDirection.z)

        // Combine front/back and strafe vectors
        _direction.addVectors(_frontVector, _sideVector).normalize().multiplyScalar(speed)
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

        if (!swimming) {
        // jumping and gravity
        // Only trigger a new jump on the edge (first frame of press) while grounded
        if (jumpPressed && grounded) {
            jumping.current = true
            holdingJump.current = true
            jumpTime.current = clock.elapsedTime
            jumpVelocity.current = maxJumpVelocity * (jumpForce / 0.5) // Scale jump velocity based on jumpForce
        }

        if (!isJumpHeld && grounded) {
            jumping.current = false
        }

        // Variable-height jump: releasing the button early cuts the jump short
        if (jumping.current && holdingJump.current && !isJumpHeld) {
            if (jumpVelocity.current > minJumpVelocity) {
                jumpVelocity.current = minJumpVelocity
            }
        }

        if (!isJumpHeld && grounded) {
            jumpVelocity.current = 0
        } else {
            jumpVelocity.current += jumpGravity * 0.116
        }

        holdingJump.current = isJumpHeld
        }

        // compute movement direction
        const movementDirection = {
            x: horizontalVelocity.current.x,
            y: jumpVelocity.current,
            z: horizontalVelocity.current.z,
        }

        if (surface !== null) {
            const dt = Math.min(rapier.world.timestep, 0.05)
            const down = swimDown || (gamepadState.connected && gamepadState.buttons.swimDown)
            const verticalInput = Number(!!isJumpHeld) - Number(!!down)
            swimVelocity.current = swimVerticalVelocity(translationBefore.y, surface, verticalInput, swimVelocity.current, dt)
            // Existing land speeds are per physics step; swimming is in metres/second.
            const swimSpeed = isSprinting ? 6.5 : 4.5
            _direction.normalize().multiplyScalar(swimSpeed * dt)
            movementDirection.x = _direction.x
            movementDirection.z = _direction.z
            movementDirection.y = swimVelocity.current * dt
        }

        // compute collider movement and update rigid body
        characterController.current.computeColliderMovement(characterCollider, movementDirection, rapier.rapier.QueryFilterFlags.EXCLUDE_SENSORS)

        const translation = characterRigidBody.translation()
        const newPosition = _characterTranslation.copy(translation as THREE.Vector3)
        const movement = characterController.current.computedMovement()
        newPosition.add(movement)

        // Remote movement capsules provide close contact; combat sensors never push players.

        // If we need to reconcile with server position
        if (pendingReconciliation.current) {
            newPosition.lerp(serverPosition.current, reconciliationStrength.current)
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

        if (window.jackalopesGame?.droneActive) {
            const translation = characterRigidBody.translation()
            if (translation) {
                if (!window.__localPlayerPosition) {
                    window.__localPlayerPosition = new THREE.Vector3();
                }
                window.__localPlayerPosition.set(translation.x, translation.y, translation.z);

                if (playerModelRef.current) {
                    playerModelRef.current.position.set(translation.x, translation.y, translation.z);
                }
            }
            if (isWalking || isRunning) {
                setIsWalking(false)
                setIsRunning(false)
            }

            if (connectionManager && connectionManager.isReadyToSend() &&
                (Date.now() - lastStateTime.current > 33)) {
                lastStateTime.current = Date.now();
                const position = characterRigidBody.translation();
                const velocity = characterRigidBody.linvel();
                const droneRotation = window.jackalopesGame?.droneRotation;
                connectionManager.sendPlayerUpdate({
                    position: [position.x, position.y, position.z],
                    rotation: [0, 0, 0, 1],
                    velocity: [velocity.x, velocity.y, velocity.z],
                    sequence: Date.now(),
                    playerType: playerType,
                    flashlightOn: flashlightOn,
                    cameraPitch: 0,
                    isWalking: false,
                    isRunning: false,
                    droneActive: true,
                    dronePosition: window.jackalopesGame?.dronePosition,
                    droneRotation: Array.isArray(droneRotation) ? droneRotation : [0, 0, 0, 1],
                    droneThermalActive: !!window.jackalopesGame?.droneThermalActive,
                });
            }
            return
        }

        _characterLinvel.copy(characterRigidBody.linvel() as THREE.Vector3)
        const currentSpeed = _characterLinvel.length()

        const { forward, backward, left, right } = getKeyboardControls() as KeyControls
        const isMoving = forward || backward || left || right
        const isSprinting = getKeyboardControls().sprint || gamepadState.buttons.sprint || gamepadState.buttons.leftStickPress

        // Calculate velocity magnitude for better animation state detection
        const velocityMagnitude = Math.sqrt(
            Math.pow(horizontalVelocity.current.x, 2) + 
            Math.pow(horizontalVelocity.current.z, 2)
        );
        
        if (velocityMagnitude < 0.01 && !isMoving) {
            if (isWalking || isRunning) {
                setIsWalking(false);
                setIsRunning(false);
            }
        } else if (isMoving) {
            if (isSprinting && !isRunning) {
                setIsRunning(true);
                setIsWalking(false);
            } else if (!isSprinting && !isWalking) {
                setIsWalking(true);
                setIsRunning(false);
            }
        }

        const translation = characterRigidBody.translation()
        onMove?.(translation as THREE.Vector3)
        const cameraPosition = _cameraPosition.set(translation.x, translation.y + 2.42, translation.z)
        const cameraEuler = _cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ')
        
        // Different sensitivities for horizontal and vertical aiming (~20% increase)
        const CAMERA_SENSITIVITY_X = 0.048
        const CAMERA_SENSITIVITY_Y = 0.036
        
        const touchLook = thirdPersonView ? { x: 0, y: 0 } : consumeTouchLookDelta();
        cameraEuler.y -= touchLook.x * 0.003;
        cameraEuler.x = THREE.MathUtils.clamp(cameraEuler.x - touchLook.y * 0.003, -Math.PI / 2, Math.PI / 2);
        if (touchLook.x || touchLook.y) camera.quaternion.setFromEuler(cameraEuler);

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
            const targetFov = isSprinting && currentSpeed > 0.1 ? sprintFov : normalFov;
            const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, 5 * delta);
            if (Math.abs(nextFov - camera.fov) > 0.01) {
                camera.fov = nextFov;
                camera.updateProjectionMatrix();
            }
        }

        const position = characterRigidBody.translation();
        if (position) {
            if (!window.__localPlayerPosition) {
                window.__localPlayerPosition = new THREE.Vector3();
            }
            window.__localPlayerPosition.set(position.x, position.y, position.z);
        }

        const keyboardState = getKeyboardControls() as KeyControls;
        const interactPressed = !!keyboardState.interact || !!gamepadState?.buttons?.interact;
        window.__localPlayerInteract = interactPressed;
        if (interactPressed) {
            window.__lastLocalInteractAt = Date.now();
        }

        // Send position to multiplayer system if connected
        if (connectionManager && connectionManager.isReadyToSend() &&
            (Date.now() - lastStateTime.current > 33)) {
            lastStateTime.current = Date.now();
            
            const position = characterRigidBody.translation();
            // Get rotation from camera for player direction instead of rigid body
            // This better represents the direction the player is facing
            const cameraDirection = camera.getWorldDirection(_cameraWorldDirection);
            const cameraYaw = Math.atan2(cameraDirection.x, cameraDirection.z);
            const cameraPitch = Math.asin(-cameraDirection.y); // negative because -Y = looking up
            const rotationQuat = _rotationQuat.setFromAxisAngle(up, cameraYaw);
            
            const velocity = characterRigidBody.linvel();
            
            connectionManager.sendPlayerUpdate({
                position: [position.x, position.y, position.z],
                rotation: [rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w],
                velocity: [velocity.x, velocity.y, velocity.z],
                sequence: Date.now(),
                playerType: playerType,
                flashlightOn: flashlightOn,
                cameraPitch: cameraPitch,
                isWalking: isWalking,
                isRunning: isRunning,
                droneActive: !!window.jackalopesGame?.droneActive,
                dronePosition: window.jackalopesGame?.dronePosition,
                droneRotation: window.jackalopesGame?.droneRotation,
                droneThermalActive: !!window.jackalopesGame?.droneThermalActive,
            });
        }

        // Update player model position with smoothing
        if ((thirdPersonView || visible || droneModeActive) && playerModelRef.current && playerRef.current && playerRef.current.rigidBody) {
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
                        const lerpFactor = (thirdPersonView || droneModeActive) ? 0.15 : 0.5; // Slower in third-person/drone mode for stability
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
        setCurrentAnimation(isRunning ? 'run' : isWalking ? 'walk' : 'idle');
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
        if (!thirdPersonView && playerType === 'merc' && fpsCameraRef.current) {
            if (fpsCameraRef.current.parent && fpsCameraRef.current.parent.type === 'Object3D') {
                fpsCameraRef.current.position.set(0, 0.75, 0);
            }
        }
    });

    // Create refs for the flashlight and its target
    const spotlightRef = useRef<THREE.SpotLight>(null);
    const spotlightTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());
    
    // State to toggle flashlight
    const [flashlightOn, setFlashlightOn] = useState(false);
    const [droneModeActive, setDroneModeActive] = useState(!!window.jackalopesGame?.droneActive);
    const [droneThermalActive, setDroneThermalActive] = useState(!!window.jackalopesGame?.droneThermalActive);
    
    // Make flashlight state accessible globally
    useEffect(() => {
        // Make sure jackalopesGame exists
        if (!window.jackalopesGame) {
            window.jackalopesGame = {};
        }
        
        // Initialize collected state if missing
        if (window.jackalopesGame.flashlightCollected === undefined) {
            window.jackalopesGame.flashlightCollected = false;
        }

        // Add flashlight state to window for global access
        window.jackalopesGame.flashlightOn = flashlightOn;
    }, [flashlightOn]);
    
    useEffect(() => {
        const handleCollected = () => {
            setFlashlightOn(true);
            if (!window.jackalopesGame) window.jackalopesGame = {};
            window.jackalopesGame.flashlightCollected = true;
        };

        const handleDroneMode = (event: Event) => {
            const customEvent = event as CustomEvent<{ active: boolean }>;
            setDroneModeActive(!!customEvent.detail?.active);
        };

        const handleDroneThermal = (event: Event) => {
            const customEvent = event as CustomEvent<{ active: boolean }>;
            setDroneThermalActive(!!customEvent.detail?.active);
        };

        const handleReset = () => {
            setFlashlightOn(false);
            setDroneModeActive(false);
            setDroneThermalActive(false);
        };

        window.addEventListener('flashlightCollected', handleCollected);
        window.addEventListener('droneModeToggled', handleDroneMode as EventListener);
        window.addEventListener('droneThermalToggled', handleDroneThermal as EventListener);
        window.addEventListener('jackalopesRoundReset', handleReset);
        return () => {
            window.removeEventListener('flashlightCollected', handleCollected);
            window.removeEventListener('droneModeToggled', handleDroneMode as EventListener);
            window.removeEventListener('droneThermalToggled', handleDroneThermal as EventListener);
            window.removeEventListener('jackalopesRoundReset', handleReset);
        };
    }, []);

    // Toggle flashlight with F key, but only after pickup.
    // Ignore the pickup press itself so interact and toggle do not fight each other.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'f' && e.key !== 'F') return;
            if (e.repeat) return;

            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            const hasFlashlight = !!window.jackalopesGame?.flashlightCollected;
            const pickupStillNearby = !hasFlashlight && !!window.jackalopesGame?.flashlightPickupNearby;

            if (pickupStillNearby) {
                return;
            }

            if (!hasFlashlight) {
                window.dispatchEvent(new CustomEvent('flashlightToggleBlocked'));
                return;
            }

            setFlashlightOn(prev => {
                const next = !prev;
                if (!window.jackalopesGame) {
                    window.jackalopesGame = {};
                }
                window.jackalopesGame.flashlightOn = next;
                window.dispatchEvent(new CustomEvent('flashlightToggled', {
                    detail: { isOn: next }
                }));
                return next;
            });
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    
    // Update spotlight position to follow camera
    useFrame(() => {
        if (spotlightRef.current && spotlightTargetRef.current && !thirdPersonView && playerType === 'merc') {
            spotlightRef.current.target = spotlightTargetRef.current;
            
            if (fpsCameraRef.current) {
                _spotlightDirection.set(0, 0, -1);
                
                fpsCameraRef.current.matrixWorld.decompose(
                    _cameraPosition,
                    _cameraQuaternion,
                    _cameraScale
                );
                
                _spotlightDirection.applyQuaternion(_cameraQuaternion);
                
                // Position spotlight at camera position (gun tip offset forward)
                spotlightRef.current.position.copy(_cameraPosition);
                spotlightRef.current.position.addScaledVector(_spotlightDirection, 0.5);
                
                // Target 20 units ahead of camera
                spotlightTargetRef.current.position.copy(_cameraPosition);
                spotlightTargetRef.current.position.addScaledVector(_spotlightDirection, 20);
                
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
                        <CapsuleCollider args={[CHARACTER_CAPSULE.halfHeight, CHARACTER_CAPSULE.radius]} sensor />
                    </RigidBody>
                </Component>
            </Entity>
            
            {/* Add FootstepAudio component to handle spatial audio */}
            {playerType === 'merc' && (
                <FootstepAudio
                    playerRef={playerRef}
                    isWalking={isWalking && !isSwimming}
                    isRunning={isRunning && !isSwimming}
                />
            )}
            
            {/* Render local merc body when visible in third-person or while piloting the drone */}
            {(thirdPersonView || visible || droneModeActive) && playerType === 'merc' && (
                <group ref={playerModelRef}>
                    <MercModel 
                        animation={droneModeActive ? 'static' : currentAnimation} 
                        visible={true}
                        position={[0, -0.9, 0]}
                        rotation={[0, Math.PI, 0]}
                        scale={[5, 5, 5]}
                        thermalActive={droneThermalActive}
                    />
                </group>
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
            
            {!thirdPersonView && !droneModeActive && (
                <PerspectiveCamera
                    ref={fpsCameraRef}
                    makeDefault
                    fov={normalFov}
                    position={[0, 0.975, 0]}
                >
                    {/* Only render FPS arms if player type is merc */}
                    {playerType === 'merc' && (
                        <group ref={fpsArmsRef} position={[x, y, z]} rotation={[0, 0, 0]}>
                            <primitive 
                                ref={fpsPrimitiveRef}
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
                castShadow={false}
            />
            
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
    interact: boolean
    swimDown: boolean
}

const controls = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'sprint', keys: ['Shift'] },
    { name: 'swimDown', keys: ['KeyC', 'c', 'C'] },
    { name: 'interact', keys: ['KeyF', 'f', 'F'] },
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
            setPointerLockDisabled(false);
        }
    }, [thirdPersonView]);
    
    return (
        <KeyboardControls map={controls}>
            {children}
            {/* Only use pointer lock controls in first-person view */}
            {!thirdPersonView && !pointerLockDisabled && navigator.maxTouchPoints === 0 && typeof document.body.requestPointerLock === 'function' && <PointerLockControls ref={pointerLockRef} makeDefault />}
        </KeyboardControls>
    )
}

// Preload the model to ensure it's cached
useGLTF.preload(FpsArmsModelPath)
