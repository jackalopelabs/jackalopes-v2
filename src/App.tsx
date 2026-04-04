import { Canvas } from './common/components/canvas'
import { Crosshair } from './common/components/crosshair'
import { Instructions } from './common/components/instructions'
import { Environment, MeshReflectorMaterial, PerspectiveCamera, OrbitControls, useProgress } from '@react-three/drei'
import { EffectComposer, Vignette, ChromaticAberration, BrightnessContrast, ToneMapping, Bloom } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { useControls, folder, Leva } from 'leva'
import { useTexture } from '@react-three/drei'
import { useRef, useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import * as THREE from 'three'
import { Player, PlayerControls } from './game/player'
import { Jackalope } from './game/jackalope'
import { SphereTool, setSphereDarkMode } from './game/sphere-tool'
import { Platforms } from './game/platforms'
import { MultiplayerManager, useRemoteShots } from './network/MultiplayerManager'
import { NetworkStats } from './network/NetworkStats'
import { ConnectionManager } from './network/ConnectionManager'
import { ConnectionTest } from './components/ConnectionTest'
import { VirtualGamepad } from './components/VirtualGamepad'
import { RemotePlayer } from './game/RemotePlayer'
import { AudioController } from './components/AudioController' // Import the AudioController component
import { WeaponSoundEffects } from './components/WeaponSoundEffects' // Import the WeaponSoundEffects component
import { HealthBar } from './components/HealthBar' // Import the HealthBar component
import { AudioToggleButton } from './components/AudioToggleButton' // Import the AudioToggleButton component
import { initDebugSystem, DEBUG_LEVELS } from './utils/debugUtils';
import { PlayerPositionTracker } from './components/PlayerPositionTracker';
import entityStateObserver from './network/EntityStateObserver';
import soundManager from './components/SoundManager';
// Add import for MultiplayerSyncManager
import MultiplayerSyncManager from './network/MultiplayerSyncManager';
import { useGLTF } from '@react-three/drei';
import { MercModelPath, JackalopeModelPath } from './assets';
import { ModelLoader } from './components/ModelLoader';
import { ModelChecker } from './components/ModelChecker';
import ScoreDisplay from './components/ScoreDisplay'; // Import the new ScoreDisplay component
import { IntroScreenManager } from './components/IntroScreen';
import { GameOverScreen } from './components/GameOverScreen';
import { Crosshair as GameCrosshair } from './components/Crosshair';
import { KillFeed, emitKillFeed } from './components/KillFeed';
import { GameHUD } from './components/GameHUD';
import { ScreenShake, triggerScreenShake } from './components/ScreenShake';

// Add TypeScript declaration for window.__setGraphicsQuality
declare global {
    interface Window {
        __setGraphicsQuality?: (quality: 'auto' | 'high' | 'medium' | 'low') => void;
        __shotBroadcast?: ((shot: any) => any) | undefined;
        __setDebugLevel?: (level: number) => void; // Add debug level control
        __toggleNetworkLogs?: (verbose: boolean) => string; // Add network log control
        connectionManager?: any; // Make ConnectionManager accessible globally
        __networkManager?: {
            sendRespawnRequest: (playerId: string, spawnPosition?: [number, number, number]) => void;
        };
        jackalopesGame?: {
            playerType?: 'merc' | 'jackalope';
            levaPanelState?: 'open' | 'closed';
            flashlightOn?: boolean; // Add flashlight state
            debugLevel?: number; // Store debug level
            // Add spawn manager
            spawnManager?: {
                baseSpawnX: number;
                currentSpawnX: number;
                stepSize: number;
                minX: number;
                getNextSpawnPoint: () => [number, number, number];
                resetSpawnPoints: () => [number, number, number];
                getSpawnPoint: () => [number, number, number];
            };
            // Add other global game properties as needed
        };
        playerPositionTracker?: {
            updatePosition: (newPos: THREE.Vector3) => void;
        };
        __lastHitJackalope?: string;
    }
}

// Add Moon component
const Moon = ({ orbitRadius, height, orbitSpeed }: { orbitRadius: number, height: number, orbitSpeed: number }) => {
    const moonRef = useRef<THREE.Group>(null);
    const angle = useRef(0);

    // Create moon light - change to spotlight
    const moonLightRef = useRef<THREE.SpotLight>(null);

    useFrame(() => {
        if (!moonRef.current || !moonLightRef.current) return;

        // Increment angle for orbit - significantly slower
        angle.current += orbitSpeed * 0.005;

        // Calculate moon position in orbit around the center of the level
        // Using an elliptical orbit to spread on the x-axis
        const xRadius = orbitRadius * 2.5; // Make x-axis much wider for longer shadows
        const zRadius = orbitRadius * 1.2; // Also increase z-radius for more distance
        const x = Math.sin(angle.current) * xRadius;
        const z = Math.cos(angle.current) * zRadius;

        // Set moon position
        moonRef.current.position.set(x, height, z);

        // Light follows moon with slight offset to avoid z-fighting
        moonLightRef.current.position.set(x, height - 2, z);

        // Update spotlight target to point slightly downward
        if (moonLightRef.current.target) {
            moonLightRef.current.target.position.set(x, 0, z);
            moonLightRef.current.target.updateMatrixWorld();
        }
    });

    // Brighter glow effect
    const createGlowEffect = () => {
        return (
            <>
                {/* Core moon - make it brighter */}
                <mesh castShadow>
                    <sphereGeometry args={[4, 24, 24]} />
                    <meshStandardMaterial
                        color="#ffffff"
                        emissive="#ffffff"
                        emissiveIntensity={5}
                        toneMapped={false}
                    />
                </mesh>

                {/* Outer glow layer - make it brighter */}
                <mesh>
                    <sphereGeometry args={[6, 24, 24]} />
                    <meshBasicMaterial
                        color="#ffffff"
                        transparent={true}
                        opacity={0.5}
                    />
                </mesh>

                {/* Add additional bright core */}
                <mesh>
                    <sphereGeometry args={[3, 16, 16]} />
                    <meshBasicMaterial
                        color="#ffffff"
                        toneMapped={false}
                    />
                </mesh>
            </>
        );
    };

    return (
        <>
            {/* Moon with glow effect */}
            <group ref={moonRef} position={[orbitRadius, height, 0]}>
                {createGlowEffect()}
            </group>

            {/* Moon spotlight - replace pointLight */}
            <spotLight
                ref={moonLightRef}
                position={[orbitRadius, height - 2, 0]}
                intensity={15}
                color="#ffffff"
                distance={600}
                angle={Math.PI / 6} // 30 degrees cone
                penumbra={0.2} // Soft edge
                decay={1.0} // Lower decay for harder shadows (less falloff)
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.001}
                shadow-camera-near={1}
                shadow-camera-far={200}
                shadow-radius={1} // Smaller shadow radius for harder edges
            />
        </>
    );
};

// Add a Stars component using instanced meshes for performance
const Stars = ({ count = 1000, depth = 100, size = 0.2, color = "#ffffff", twinkle = true }: {
    count?: number;
    depth?: number;
    size?: number;
    color?: string;
    twinkle?: boolean;
}) => {
    // Reference to the instanced mesh
    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);

    // Create stars once using instanced meshes for efficiency
    useEffect(() => {
        if (!instancedMeshRef.current) return;

        const dummy = new THREE.Object3D();

        // Place stars in a hemisphere above the level
        for (let i = 0; i < count; i++) {
            // Random position in a hemisphere
            const theta = Math.random() * Math.PI * 2; // Around
            const phi = Math.acos((Math.random() * 2) - 1) * 0.5; // Up (hemisphere)
            const radius = depth * (0.5 + Math.random() * 0.5); // Vary the distance

            // Calculate position
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.cos(phi) + 20; // Offset upward
            const z = radius * Math.sin(phi) * Math.sin(theta);

            // Random scale for varied star sizes
            const scale = size * (0.3 + Math.random() * 0.7);

            // Set position and scale
            dummy.position.set(x, y, z);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();

            // Apply to instance
            instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        }

        // Update the instance matrix
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    }, [count, depth, size]);

    // Subtle twinkling animation using shader material
    const starMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(color) },
                twinkleEnabled: { value: twinkle ? 1.0 : 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                uniform float twinkleEnabled;
                varying vec2 vUv;

                void main() {
                    // Create a radial gradient for each star point
                    float dist = length(vUv - vec2(0.5, 0.5));

                    // Smooth falloff for star points
                    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);

                    // Simple noise-based twinkling
                    float twinkle = mix(
                        1.0,
                        0.75 + 0.25 * sin(time * 0.5 + gl_FragCoord.x * 0.01 + gl_FragCoord.y * 0.01),
                        twinkleEnabled
                    );

                    gl_FragColor = vec4(color * twinkle, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false // Improve performance by skipping depth write
        });
    }, [color, twinkle]);

    // Update time uniform for twinkling animation
    useFrame(({ clock }) => {
        if (starMaterial) {
            starMaterial.uniforms.time.value = clock.elapsedTime;
        }
    });

    return (
        <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, count]}>
            <sphereGeometry args={[1, 4, 4]} /> {/* Low-poly sphere for better performance */}
            <primitive object={starMaterial} attach="material" />
        </instancedMesh>
    );
};

const Scene = ({ playerRef }: { playerRef: React.RefObject<any> }) => {
    // Remove texture loading and replace with solid colors
    // const texture = useTexture('/final-texture.png')
    // texture.wrapS = texture.wrapT = THREE.RepeatWrapping

    // Ground color
    const groundColor = new THREE.Color('#575757')

    // Updated map dimensions for the base ground to match platforms.tsx
    const mapWidth = 800
    const mapDepth = 800

    return (
        <RigidBody type="fixed" position={[0, 0, 0]} colliders={false}>
            {/* Ground collider - updated to match the new visual floor size */}
            <CuboidCollider args={[mapWidth/2, 0.1, mapDepth/2]} position={[0, -0.1, 0]} />

            {/* Remove wall colliders - we don't need them anymore */}

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[mapWidth, mapDepth, 64, 64]} /> {/* Add more segments for better lighting detail */}
                <MeshReflectorMaterial
                    color={groundColor}
                    mirror={0}
                    roughness={0.7} // Reduced roughness
                    metalness={0.05} // Slight metalness to reduce harsh reflections
                    depthScale={0}
                    minDepthThreshold={0.9}
                    maxDepthThreshold={1}
                    dithering={true} // Enable dithering to reduce banding
                    resolution={1024} // Higher resolution for better quality
                    blur={[400, 100]} // Add blur to soften reflections
                    mixBlur={1}
                    mixStrength={0.5}
                    mixContrast={1}
                    reflectorOffset={0.01} // Small offset to prevent z-fighting
                />
            </mesh>

            {/* Remove border walls - they're replaced by our new walls with doorways */}
        </RigidBody>
    )
}

const SnapshotDebugOverlay = ({
  snapshots,
  getSnapshotAtTime
}: {
  snapshots: any[],
  getSnapshotAtTime: (timestamp: number) => any
}) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);

  // Update selected snapshot when snapshots change
  useEffect(() => {
    if (snapshots.length > 0 && !selectedSnapshot) {
      setSelectedSnapshot(snapshots[snapshots.length - 1]);
    }
  }, [snapshots, selectedSnapshot]);

  if (!snapshots || snapshots.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      fontFamily: 'monospace',
      width: expanded ? '400px' : '200px',
      zIndex: 1000,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '8px',
        borderBottom: '1px solid #555',
        paddingBottom: '4px'
      }}>
        <h3 style={{margin: 0}}>Snapshot System</h3>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div>Snapshots: {snapshots.length}</div>
      {expanded && snapshots.length > 0 && (
        <>
          <div style={{marginTop: '8px'}}>
            <div>Latest Snapshot:</div>
            <div>Time: {new Date(snapshots[snapshots.length - 1].timestamp).toISOString().substr(11, 8)}</div>
            <div>Seq: {snapshots[snapshots.length - 1].sequence}</div>
            <div>Players: {Object.keys(snapshots[snapshots.length - 1].players).length}</div>
            <div>Events: {snapshots[snapshots.length - 1].events?.length || 0}</div>
          </div>

          {selectedSnapshot && (
            <div style={{
              marginTop: '8px',
              padding: '8px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '4px'
            }}>
              <div>Selected Snapshot:</div>
              <div>Time: {new Date(selectedSnapshot.timestamp).toISOString().substr(11, 8)}</div>
              <div>Sequence: {selectedSnapshot.sequence}</div>
              <div>
                Players: {Object.keys(selectedSnapshot.players).map(id => (
                  <div key={id} style={{paddingLeft: '8px', fontSize: '10px'}}>
                    {id}: {JSON.stringify(selectedSnapshot.players[id].position).substring(0, 20)}...
                  </div>
                ))}
              </div>
              {selectedSnapshot.events && selectedSnapshot.events.length > 0 && (
                <div>
                  Events: {selectedSnapshot.events.map((event: any, i: number) => (
                    <div key={i} style={{paddingLeft: '8px', fontSize: '10px'}}>
                      {event.type}: {event.timestamp}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{marginTop: '8px'}}>
            <div>Timeline:</div>
            <div style={{
              height: '20px',
              background: '#333',
              position: 'relative',
              borderRadius: '4px',
              marginTop: '4px'
            }}>
              {snapshots.map((snapshot, i) => {
                // Calculate relative position
                const startTime = snapshots[0].timestamp;
                const endTime = snapshots[snapshots.length - 1].timestamp;
                const range = endTime - startTime;
                const position = range > 0 ? ((snapshot.timestamp - startTime) / range) * 100 : 0;

                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${position}%`,
                      top: '0',
                      width: '2px',
                      height: '100%',
                      background: selectedSnapshot && snapshot.sequence === selectedSnapshot.sequence ? '#ff0' : '#0af',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedSnapshot(snapshot)}
                    title={`Snapshot ${snapshot.sequence} at ${new Date(snapshot.timestamp).toISOString()}`}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Add a MultiplayerDebugPanel component for testing
const MultiplayerDebugPanel = ({
  connectionManager,
  visible,
  isOfflineMode,
  setPlayerCharacterInfo
}: {
  connectionManager: any,
  visible: boolean,
  isOfflineMode: boolean,
  setPlayerCharacterInfo: (info: { type: 'merc' | 'jackalope', thirdPerson: boolean }) => void
}) => {
  const [shots, setShots] = useState(0);
  const [universals, setUniversals] = useState(0);
  const [forceMercCharacter, setForceMercCharacter] = useState(false);

  // Insert a toggle button for testing character type override
  const [characterTypeOverride, setCharacterTypeOverride] = useState<'merc' | 'jackalope' | null>(null);

  // Track forces
  const [forceCount, setForceCount] = useState(0);

  useEffect(() => {
    if (!connectionManager || !characterTypeOverride) return;

    // Force character type using our new helper method
    const characterInfo = connectionManager.forceCharacterType(characterTypeOverride);
    console.log(`🎮 Forced character type to ${characterTypeOverride}:`, characterInfo);

    // Increment force count to trigger our dependency
    setForceCount(prev => prev + 1);

    // Reset override
    setCharacterTypeOverride(null);
  }, [connectionManager, characterTypeOverride]);

  const sendTestShot = () => {
    if (!connectionManager) return;

    // Generate a random shot direction
    const randomAngle = Math.random() * Math.PI * 2;
    const randomDirection: [number, number, number] = [
      Math.sin(randomAngle),
      0, // No vertical component
      Math.cos(randomAngle)
    ];

    // Player's current position (hardcoded for test)
    const origin: [number, number, number] = [0, 1, 0];

    // Send the shot through the connection manager
    try {
      connectionManager.sendShootEvent(origin, randomDirection);
      setShots(s => s + 1);
      console.log('Test shot sent');
    } catch (error) {
      console.error('Error sending test shot:', error);
    }
  };

  const sendUniversalBroadcast = () => {
    // Use the browser broadcast API if window.__shotBroadcast is available
    if (window.__shotBroadcast) {
      const testShotData = {
        id: 'test-player-universal',
        origin: [0, 1, 0] as [number, number, number],
        direction: [1, 0, 0] as [number, number, number],
        color: '#ff0000',
        timestamp: Date.now(),
        shotId: `universal-${Date.now()}`
      };

      try {
        window.__shotBroadcast(testShotData);
        setUniversals(u => u + 1);
        console.log('Universal broadcast sent');
      } catch (error) {
        console.error('Error sending universal broadcast:', error);
      }
    } else {
      console.error('Universal broadcast not available - window.__shotBroadcast is not defined');
    }
  };

  const forceOfflineMode = () => {
    if (connectionManager && connectionManager.forceReady) {
      connectionManager.forceReady();
    }
  };

  const resetPlayerCount = () => {
    if (connectionManager && connectionManager.resetPlayerCount) {
      connectionManager.resetPlayerCount();
      console.log('🔄 Reset player count - next reload will assign new player types');

      // After reset, force a reload to get a new player type
      if (confirm('Reset player count successful! Reload now to get a new player type?')) {
        window.location.reload();
      }
    }
  };

  return visible ? (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 1000,
      width: '300px',
      fontFamily: 'monospace'
    }}>
      <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>Multiplayer Test Panel</div>

      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={sendTestShot}
          style={{
            backgroundColor: '#4CAF50',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            margin: '0 5px 5px 0',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          TEST SHOT
        </button>
        <span>Shots: {shots}</span>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={sendUniversalBroadcast}
          style={{
            backgroundColor: '#2196F3',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            margin: '0 5px 5px 0',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          UNIVERSAL BROADCAST
        </button>
        <span>Sent: {universals}</span>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={forceOfflineMode}
          style={{
            backgroundColor: '#FF9800',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            margin: '0 5px 5px 0',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          FORCE OFFLINE MODE
        </button>
        <span>{isOfflineMode ? '✅ OFFLINE' : '❌ ONLINE'}</span>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={() => setCharacterTypeOverride('merc')}
          style={{
            backgroundColor: '#E91E63',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            margin: '0 5px 5px 0',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          FORCE MERC
        </button>
        <button
          onClick={() => setCharacterTypeOverride('jackalope')}
          style={{
            backgroundColor: '#9C27B0',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            margin: '0 5px 5px 0',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          FORCE JACKALOPE
        </button>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={resetPlayerCount}
          style={{
            backgroundColor: '#F44336',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            margin: '0 5px 5px 0',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          RESET PLAYER COUNT
        </button>
      </div>

      <div style={{ fontSize: '10px', opacity: 0.8 }}>
        Connection: {connectionManager ? 'Ready' : 'Not initialized'}<br />
        Mode: {isOfflineMode ? 'Offline (LocalStorage)' : 'Online (WebSocket)'}<br />
        Forces: {forceCount}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <button
          onClick={() => {
            if (connectionManager && connectionManager.resetAndCorrectCharacterType) {
              // Force character type correction
              const characterInfo = connectionManager.resetAndCorrectCharacterType();
              console.log(`🎮 Force corrected character type: ${characterInfo.type}`);
              setPlayerCharacterInfo(characterInfo);
            }
          }}
          style={{
            backgroundColor: '#673AB7',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            margin: '0 5px 5px 0',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          CORRECT CHARACTER TYPE
        </button>
      </div>
    </div>
  ) : null;
};

// Simplified ThirdPersonCameraControls component without OrbitControls
const ThirdPersonCameraControls = ({
    player,
    cameraRef,
    enabled,
    distance,
    height,
    invertY = false, // Add invert Y option with default = false
}: {
    player: THREE.Vector3,
    cameraRef: React.RefObject<THREE.PerspectiveCamera>,
    enabled: boolean,
    distance: number,
    height: number,
    invertY?: boolean,
}) => {
    // For tracking target position and rotation
    const targetRef = useRef(new THREE.Vector3());
    const isInitializedRef = useRef(false);
    const rotationRef = useRef({ x: 0, y: 0 });
    const pointerLockActiveRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const playerType = useRef<'merc' | 'jackalope'>('merc');

    // Get player character type from the App
    useEffect(() => {
        // Try to determine player type based on the global state
        try {
            const appPlayerType = window.jackalopesGame?.playerType;
            if (appPlayerType === 'jackalope') {
                playerType.current = 'jackalope';
                console.log("ThirdPersonCamera: Detected jackalope player type");
            } else {
                playerType.current = 'merc';
            }
        } catch (err) {
            console.warn("ThirdPersonCamera: Could not determine player type");
        }
    }, []);

    // Set up initial camera position based on player position
    useEffect(() => {
        if (!cameraRef.current || !enabled) return;

        // Make sure player position is valid
        if (!(player instanceof THREE.Vector3)) {
            console.error("Player position is not a Vector3:", player);
            return;
        }

        // Initialize position and target only once
        if (!isInitializedRef.current) {
            console.log("Initializing simplified third-person camera");

            // Initialize target position
            targetRef.current.copy(player);

            // Initialize camera position directly behind player
            const cameraPos = new THREE.Vector3().copy(player);
            cameraPos.y += height;
            cameraPos.z += distance;
            cameraRef.current.position.copy(cameraPos);

            // Look at player
            cameraRef.current.lookAt(player);
            isInitializedRef.current = true;

            // Reset rotation
            rotationRef.current = { x: 0, y: 0 };
        }

        // Handle pointer lock for fps-style mouse movement
        const requestPointerLock = () => {
            document.body.requestPointerLock();
        };

        const handlePointerLockChange = () => {
            pointerLockActiveRef.current = document.pointerLockElement === document.body;
            console.log("Pointer lock state:", pointerLockActiveRef.current ? "ACTIVE" : "INACTIVE");
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (pointerLockActiveRef.current) {
                // Use movementX/Y for pointer lock (fps style)
                const deltaX = e.movementX;
                const deltaY = e.movementY;

                // Update rotation based on mouse movement
                rotationRef.current.y -= deltaX * 0.003; // increased from 0.002 for faster rotation

                // Apply Y rotation with or without inversion
                if (invertY) {
                    rotationRef.current.x -= deltaY * 0.003; // increased from 0.002
                } else {
                    rotationRef.current.x += deltaY * 0.003; // increased from 0.002
                }

                // Clamp vertical rotation to avoid flipping
                rotationRef.current.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, rotationRef.current.x));
            }
        };

        // Set up pointer lock when third person mode is enabled
        if (enabled) {
            // Request pointer lock on first click
            document.addEventListener('click', requestPointerLock);
            document.addEventListener('pointerlockchange', handlePointerLockChange);
            document.addEventListener('mousemove', handleMouseMove);

            // Request pointer lock immediately if it's not active yet
            if (!pointerLockActiveRef.current) {
                document.body.requestPointerLock();
            }
        }

        // Clean up
        return () => {
            console.log("Cleaning up simplified third-person camera");
            document.removeEventListener('click', requestPointerLock);
            document.removeEventListener('pointerlockchange', handlePointerLockChange);
            document.removeEventListener('mousemove', handleMouseMove);

            // Exit pointer lock when component unmounts
            if (pointerLockActiveRef.current && document.exitPointerLock) {
                document.exitPointerLock();
            }
        };
    }, [enabled, player, cameraRef, distance, height, invertY]);

    // Reset initialization when disabled
    useEffect(() => {
        if (!enabled) {
            isInitializedRef.current = false;

            // Exit pointer lock when disabled
            if (pointerLockActiveRef.current && document.exitPointerLock) {
                document.exitPointerLock();
                pointerLockActiveRef.current = false;
            }
        }
    }, [enabled]);

    // Use frame loop to update the camera smoothly
    useFrame((_, delta) => {
        if (!enabled || !cameraRef.current) return;

        try {
            // Only update with valid player position
            if (player instanceof THREE.Vector3 && !Number.isNaN(player.x) &&
                !Number.isNaN(player.y) && !Number.isNaN(player.z)) {

                // Use different interpolation speeds for different player types
                // For jackalope, balance between responsiveness and smoothness
                const isJackalope = playerType.current === 'jackalope';

                // Balance between smoothness and responsiveness
                // Not too direct (causes jitter) but not too smooth (causes lag)
                // Use deltaTime-based interpolation for consistent smoothing across frame rates
                const targetSmoothing = isJackalope ?
                    Math.min(delta * 20.0, 0.5) : // Good balance for jackalope
                    Math.min(delta * 4.0, 0.25);  // Normal responsiveness for merc

                // Log camera state occasionally for debugging
                if (Math.random() < 0.01 && (window.jackalopesGame?.debugLevel || 0) >= 3) {
                    console.log(`[CAMERA] Delta: ${delta.toFixed(4)}, Smoothing: ${targetSmoothing.toFixed(2)}`);
                    console.log(`[CAMERA] Target: (${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)})`);
                    console.log(`[CAMERA] Current: (${targetRef.current.x.toFixed(2)}, ${targetRef.current.y.toFixed(2)}, ${targetRef.current.z.toFixed(2)})`);
                }

                targetRef.current.lerp(player, targetSmoothing);

                // Calculate camera position based on rotation around target
                const cameraOffset = new THREE.Vector3(
                    Math.sin(rotationRef.current.y) * distance,
                    height + Math.sin(rotationRef.current.x) * distance,
                    Math.cos(rotationRef.current.y) * distance
                );

                // Balance camera smoothness and responsiveness
                const newCamPos = new THREE.Vector3().copy(targetRef.current).add(cameraOffset);
                const cameraSmoothing = isJackalope ?
                    Math.min(delta * 25.0, 0.6) : // Responsive but still smooth for jackalope
                    Math.min(delta * 8.0, 0.4);   // Normal responsiveness for merc

                cameraRef.current.position.lerp(newCamPos, cameraSmoothing);

                // Look at player
                cameraRef.current.lookAt(targetRef.current);
            }
        } catch (error) {
            console.error("Error in ThirdPersonCameraControls frame update:", error);
        }
    });

    return null; // No need to render any elements
};

// Add PerformanceStats component
const PerformanceStats = () => {
    const [fps, setFps] = useState(0);
    const [memory, setMemory] = useState<{
        geometries: number;
        textures: number;
        triangles: number;
        jsHeap?: number;
    }>({
        geometries: 0,
        textures: 0,
        triangles: 0
    });
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    const frameTimeHistory = useRef<number[]>([]);
    const maxHistoryLength = 30; // Store 30 frames of history for smoother display

    // Get renderer info from three.js
    const { gl } = useThree();
    const rendererInfo = useMemo(() => gl.info, [gl]);

    useEffect(() => {
        // Function to update performance stats
        const updateStats = () => {
            frameCount.current++;
            const now = performance.now();
            const elapsed = now - lastTime.current;

            // Update FPS approximately every 500ms for more stable reading
            if (elapsed >= 500) {
                // Calculate FPS
                const currentFps = Math.round((frameCount.current * 1000) / elapsed);

                // Add to history for smoothing
                frameTimeHistory.current.push(currentFps);
                // Keep history at max length
                if (frameTimeHistory.current.length > maxHistoryLength) {
                    frameTimeHistory.current.shift();
                }

                // Calculate average FPS from history
                const avgFps = Math.round(
                    frameTimeHistory.current.reduce((sum, fps) => sum + fps, 0) /
                    frameTimeHistory.current.length
                );

                setFps(avgFps);

                // Update memory stats
                const memoryStats = {
                    geometries: rendererInfo.memory.geometries,
                    textures: rendererInfo.memory.textures,
                    triangles: rendererInfo.render.triangles,
                    // Add JS heap size if performance.memory is available (Chrome only)
                    jsHeap: (performance as any).memory?.usedJSHeapSize / (1024 * 1024) // Convert to MB
                };

                setMemory(memoryStats);

                // Reset for next update
                frameCount.current = 0;
                lastTime.current = now;
            }

            requestAnimationFrame(updateStats);
        };

        const animationId = requestAnimationFrame(updateStats);

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, [rendererInfo]);

    return (
        <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: fps < 30 ? '#ff5252' : fps < 50 ? '#ffbd52' : '#52ff7a',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            userSelect: 'none',
            zIndex: 2000,
            textAlign: 'right',
            lineHeight: '1.4'
        }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                {fps} FPS
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '10px' }}>
                Triangles: {memory.triangles.toLocaleString()}<br />
                Geometries: {memory.geometries}<br />
                Textures: {memory.textures}
                {memory.jsHeap && (<><br />Memory: {memory.jsHeap.toFixed(1)} MB</>)}
            </div>
        </div>
    );
};

// ... existing code ...

// Split the performance stats into two components:
// 1. StatsCollector - inside Canvas to collect data
// 2. StatsDisplay - outside Canvas to display data
interface PerformanceData {
    fps: number;
    triangles: number;
    geometries: number;
    textures: number;
    jsHeap?: number;
}

// Create a state to share data between components
const performanceState = {
    listeners: [] as ((data: PerformanceData) => void)[],
    subscribe(listener: (data: PerformanceData) => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    },
    notify(data: PerformanceData) {
        this.listeners.forEach(listener => listener(data));
    }
};

// This component goes inside the Canvas
const StatsCollector = () => {
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    const frameTimeHistory = useRef<number[]>([]);
    const maxHistoryLength = 30;

    // Get renderer info from three.js
    const { gl } = useThree();
    const rendererInfo = useMemo(() => gl.info, [gl]);

    useFrame(() => {
        frameCount.current++;
        const now = performance.now();
        const elapsed = now - lastTime.current;

        // Update stats every 500ms
        if (elapsed >= 500) {
            // Calculate FPS
            const currentFps = Math.round((frameCount.current * 1000) / elapsed);

            // Add to history for smoothing
            frameTimeHistory.current.push(currentFps);
            if (frameTimeHistory.current.length > maxHistoryLength) {
                frameTimeHistory.current.shift();
            }

            // Calculate average FPS from history
            const avgFps = Math.round(
                frameTimeHistory.current.reduce((sum, fps) => sum + fps, 0) /
                frameTimeHistory.current.length
            );

            // Get memory stats
            const jsHeap = (performance as any).memory?.usedJSHeapSize / (1024 * 1024);

            // Notify subscribers with new data
            performanceState.notify({
                fps: avgFps,
                triangles: rendererInfo.render.triangles,
                geometries: rendererInfo.memory.geometries,
                textures: rendererInfo.memory.textures,
                jsHeap
            });

            // Reset for next update
            frameCount.current = 0;
            lastTime.current = now;
        }
    });

    return null;
};

// This component goes outside the Canvas
const StatsDisplay = () => {
    const [stats, setStats] = useState<PerformanceData>({
        fps: 0,
        triangles: 0,
        geometries: 0,
        textures: 0
    });

    // Get the showFpsCounter setting
    const { showFpsCounter } = useControls('Performance', {}) as { showFpsCounter: boolean };

    useEffect(() => {
        // Subscribe to performance updates
        return performanceState.subscribe(data => {
            setStats(data);
        });
    }, []);

    // Don't render if showFpsCounter is false
    if (!showFpsCounter) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: stats.fps < 30 ? '#ff5252' : stats.fps < 50 ? '#ffbd52' : '#52ff7a',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            userSelect: 'none',
            zIndex: 2000,
            textAlign: 'right',
            lineHeight: '1.4'
        }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                {stats.fps} FPS
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '10px' }}>
                Triangles: {stats.triangles.toLocaleString()}<br />
                Geometries: {stats.geometries}<br />
                Textures: {stats.textures}
                {stats.jsHeap && (<><br />Memory: {stats.jsHeap.toFixed(1)} MB</>)}
            </div>
        </div>
    );
};

// Add a helper function to explicitly reconnect the camera to fix third person view
const forceCameraReconnection = (trigger: string) => {
    console.log(`[CAMERA] Force reconnection triggered by: ${trigger}`);

    // Dispatch multiple events to ensure proper camera update
    window.dispatchEvent(new CustomEvent('cameraUpdateNeeded'));

    // Add a slight delay to allow for DOM updates
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('forceArmsReset'));
        window.dispatchEvent(new CustomEvent('forceCameraSync', {
            detail: {
                timestamp: Date.now(),
                operation: 'panel_toggle'
            }
        }));
    }, 100);

    // Additional updates with increasing delays for reliability
    setTimeout(() => window.dispatchEvent(new CustomEvent('cameraUpdateNeeded')), 300);
    setTimeout(() => window.dispatchEvent(new CustomEvent('cameraUpdateNeeded')), 800);
};

// Add this component to preload models
const ModelPreloader = () => {
  useEffect(() => {
    console.log("ModelPreloader mounted - using direct THREE.js geometry now");

    // No need to create fallback models or preload GLB models
    // Since we're using built-in geometry directly

    // Remove these lines
    // if (window.__initializeFallbackModels) {
    //   window.__initializeFallbackModels();
    // }

    // Remove these lines
    // try {
    //   useGLTF.preload(MercModelPath);
    //   useGLTF.preload(JackalopeModelPath);
    //   console.log("Model preloading initiated");
    // } catch (error) {
    //   console.warn("Error preloading models:", error);
    // }
  }, []);

  return null;
};

export function App() {
    // Replace useLoadingAssets with useProgress implementation
    const { active } = useProgress()
    const [loading, setLoading] = useState(true)

    // Add state to control Leva panel visibility
    const [levaVisible, setLevaVisible] = useState(false);

    // Handle loading state
    useEffect(() => {
        if (!active) {
            const timeout = setTimeout(() => {
                setLoading(false)
            }, 500)
            return () => clearTimeout(timeout)
        } else {
            setLoading(true)
        }
    }, [active])

    // Add key handler for 'O' key to toggle Leva panel
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Toggle Leva panel when O key is pressed
            if (e.key === 'o' || e.key === 'O') {
                setLevaVisible(prev => !prev);

                // Also update the global state for consistency
                if (window.jackalopesGame) {
                    window.jackalopesGame.levaPanelState = !levaVisible ? 'open' : 'closed';
                }

                // Force camera reconnection when toggling the panel
                forceCameraReconnection('leva_key_toggle');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [levaVisible]);

    const directionalLightRef = useRef<THREE.DirectionalLight>(null)

    // Initialize fallback models as early as possible
    useEffect(() => {
        console.log("App mounted - using direct THREE.js geometry");
        // No fallback models needed when using direct geometry
    }, []);

    // Move playerRef to App component scope
    const playerRef = useRef<any>(null);
    // Add a state to track if playerRef is ready
    const [playerRefReady, setPlayerRefReady] = useState(false);

    // Add this inside the App component
    const playerPosition = useRef<THREE.Vector3>(new THREE.Vector3(0, 7, 10));

    // Add health state
    const [playerHealth, setPlayerHealth] = useState(100);

    // Add score state
    const [jackalopesScore, setJackalopesScore] = useState(0);
    const [mercsScore, setMercsScore] = useState(0);

    // Game round state
    const [gameOver, setGameOver] = useState(false);
    const [hitMarker, setHitMarker] = useState(false);
    const hitMarkerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hit marker helper
    const showHitMarker = useCallback(() => {
        setHitMarker(true);
        if (hitMarkerTimer.current) clearTimeout(hitMarkerTimer.current);
        hitMarkerTimer.current = setTimeout(() => setHitMarker(false), 200);
        triggerScreenShake(0.15);
    }, []);

    // Round end handler
    const handleRoundEnd = useCallback(() => {
        setGameOver(true);
    }, []);

    // Play again handler
    const handlePlayAgain = useCallback(() => {
        setGameOver(false);
        setJackalopesScore(0);
        setMercsScore(0);
        localStorage.setItem('jackalopes_score', '0');
        localStorage.setItem('mercs_score', '0');

        // Broadcast reset
        if (enableMultiplayer && connectionManager?.isReadyToSend()) {
            connectionManager.sendMessage({
                type: 'game_event',
                event: {
                    event_type: 'game_score_update',
                    source: 'round_reset',
                    jackalopesScore: 0,
                    mercsScore: 0,
                    timestamp: Date.now(),
                    shotId: `reset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
                }
            });
        }
    }, [enableMultiplayer, connectionManager]);

    // Host tracking for score and timer synchronization
    const [isHost, setIsHost] = useState(false);

    // Add a ref to track the last time a score was updated
    const lastScoreTime = useRef<number>(0);

    // Track which jackalopes have been hit to avoid double-counting
    // This is shared between both scoring mechanisms
    const scoredJackalopesRef = useRef(new Set<string>());

    // Track mercs that have been scored (for jackalope scoring)
    const scoredMercsRef = useRef(new Set<string>());

    // Log current tracking state for debugging
    useEffect(() => {
      try {
        const storedJackalopes = localStorage.getItem('scored_jackalopes');
        console.log(`🎯 APP INIT: Tracked jackalopes from localStorage: ${storedJackalopes || 'none'}`);
      } catch (err) {
        console.error('Error checking localStorage:', err);
      }

      // Log at startup what jackalopes are already in the tracking set
      console.log(`🎯 APP INIT: Current tracked jackalopes: ${Array.from(scoredJackalopesRef.current).join(', ') || 'none'} (count: ${scoredJackalopesRef.current.size})`);
    }, []);

    // Initialize scored jackalopes tracking from localStorage
    useEffect(() => {
      try {
        const storedScoredJackalopes = localStorage.getItem('scored_jackalopes');
        if (storedScoredJackalopes) {
          const parsedJackalopes = JSON.parse(storedScoredJackalopes);
          if (Array.isArray(parsedJackalopes)) {
            scoredJackalopesRef.current = new Set(parsedJackalopes);
            console.log(`📊 Loaded ${scoredJackalopesRef.current.size} previously scored jackalopes from localStorage`);
          }
        }
      } catch (err) {
        console.error('Error loading scored jackalopes from localStorage:', err);
      }
    }, []);

    // Helper function to save scored jackalopes to localStorage
    const saveScoredJackalopes = () => {
      try {
        const jackalopesArray = Array.from(scoredJackalopesRef.current);
        localStorage.setItem('scored_jackalopes', JSON.stringify(jackalopesArray));
      } catch (err) {
        console.error('Error saving scored jackalopes to localStorage:', err);
      }
    };

    // Helper function to clear tracking for a specific jackalope
    const clearScoredJackalope = (jackalopeId: string) => {
      if (scoredJackalopesRef.current.has(jackalopeId)) {
        console.log(`🎯 Clearing scored tracking for respawned jackalope ${jackalopeId}`);
        scoredJackalopesRef.current.delete(jackalopeId);
        saveScoredJackalopes();
      }
    };

    // Initialize debug system
    useEffect(() => {
        // Initialize the debug system with a default level
        const debugSystem = initDebugSystem();

        // Set default level to errors only
        debugSystem.setDebugLevel(DEBUG_LEVELS.ERROR);

        // Add the network logging control function
        window.__toggleNetworkLogs = (verbose: boolean = false) => {
            if (!window.connectionManager) {
                console.warn('Connection manager not available');
                return 'Connection manager not available';
            }

            if (verbose) {
                window.connectionManager.enableVerboseLogging();
                return 'Network logging: VERBOSE - all messages shown';
            } else {
                window.connectionManager.disableVerboseLogging();
                return 'Network logging: NORMAL - player_update messages filtered';
            }
        };

        return () => {
            // Clean up debug system if needed
            if (window.__setDebugLevel) {
                delete window.__setDebugLevel;
            }
            if (window.__toggleNetworkLogs) {
                delete window.__toggleNetworkLogs;
            }
        };
    }, []);

    // Create a shared ConnectionManager instance with the staging server URL
    const [connectionManager] = useState(() => new ConnectionManager('ws://147.182.235.54:8082'));
    // Add state to track if we're in offline mode
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    // Track if notification is visible
    const [showOfflineNotification, setShowOfflineNotification] = useState(false);

    // Add state for the virtual gamepad
    const [showVirtualGamepad, setShowVirtualGamepad] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Current key state tracking for gamepad
    const currentKeys = useRef<Record<string, boolean>>({
        'w': false, 's': false, 'a': false, 'd': false, ' ': false
    });

    // Use a ref to track if shoot is on cooldown
    const shootCooldownRef = useRef(false);

    // Detect mobile devices on component mount
    useEffect(() => {
        // Check for mobile devices
        const checkMobile = () => {
            const userAgent = navigator.userAgent.toLowerCase();
            const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
            const hasTouchScreen = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

            // Set mobile status
            const isOnMobile = isMobileDevice || hasTouchScreen;
            console.log(`Mobile device detected: ${isOnMobile ? 'Yes' : 'No'}`);
            setIsMobile(isOnMobile);

            // Auto-show gamepad for mobile devices
            if (isOnMobile) {
                setShowVirtualGamepad(true);

                // Also update Leva control if available
                try {
                    // This is just a best-effort approach - don't rely on it
                    if (window && (window as any).__leva && (window as any).__leva.virtualGamepad !== undefined) {
                        (window as any).__leva.virtualGamepad = true;
                    }
                } catch (e) {
                    // Ignore errors
                }
            }
        };

        checkMobile();

        // Resize listener to handle orientation changes
        window.addEventListener('resize', checkMobile);
        return () => {
            window.removeEventListener('resize', checkMobile);
        };
    }, []);

    // Auto-show gamepad on mobile devices
    useEffect(() => {
        if (isMobile) {
            setShowVirtualGamepad(true);
        }
    }, [isMobile]);

    // Use an effect to track when the playerRef becomes available
    useEffect(() => {
        if (playerRef.current && !playerRefReady) {
            setPlayerRefReady(true);
        }
    }, [playerRef.current, playerRefReady]);

    // Listen for connection status changes
    useEffect(() => {
        const handleServerUnreachable = () => {
            console.log('App received server_unreachable event, showing notification');
            setIsOfflineMode(true);
            setShowOfflineNotification(true);
            // Auto-hide notification after 7 seconds
            setTimeout(() => setShowOfflineNotification(false), 7000);
        };

        const handleConnected = () => {
            console.log('App received connected event, hiding notification');
            setIsOfflineMode(false);
            setShowOfflineNotification(false);

            // Check if we should be the host
            const clientId = connectionManager.getClientId();
            const isFirstClient = connectionManager.isFirstClient();

            if (isFirstClient) {
                console.log(`🎮 This client (${clientId}) is designated as the HOST`);
                setIsHost(true);
                // Mark as host in localStorage for cross-tab awareness
                localStorage.setItem('jackalopes_host', 'true');
                localStorage.setItem('jackalopes_host_timestamp', Date.now().toString());
                localStorage.setItem('jackalopes_host_id', clientId || 'unknown');
            } else {
                console.log(`🎮 This client (${clientId}) is a regular CLIENT`);
                setIsHost(false);
                localStorage.removeItem('jackalopes_host');
            }
        };

        const handleDisconnected = () => {
            console.log('App received disconnected event');
            // When disconnected, check if we should become host for local gameplay
            const shouldBecomeHost = !localStorage.getItem('jackalopes_host') ||
                Date.now() - parseInt(localStorage.getItem('jackalopes_host_timestamp') || '0', 10) > 10000;

            if (shouldBecomeHost) {
                console.log('🎮 Becoming HOST in offline mode');
                setIsHost(true);
                localStorage.setItem('jackalopes_host', 'true');
                localStorage.setItem('jackalopes_host_timestamp', Date.now().toString());
            } else {
                console.log('🎮 Another client is already HOST in offline mode');
                setIsHost(false);
            }
        };

        // Add listeners for storage events to detect host changes across tabs
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'jackalopes_host_timestamp' && e.newValue) {
                // Another tab declared itself host
                const hostId = localStorage.getItem('jackalopes_host_id');
                const myClientId = connectionManager.getClientId() || 'unknown';

                if (hostId && hostId !== myClientId) {
                    console.log(`🎮 Another client (${hostId}) became host, I (${myClientId}) am now a client`);
                    setIsHost(false);
                }
            }

            // Also watch for timer resets
            if (e.key === 'timer_remaining' && e.newValue) {
                // Check if this was from a host
                const hostId = localStorage.getItem('timer_host_id');
                if (hostId === 'host' && !isHost) {
                    console.log('⏱️ Timer updated by host via localStorage');
                }
            }
        };

        // Listen for storage events to detect host changes
        window.addEventListener('storage', handleStorageChange);

        // Register connection manager event handlers
        connectionManager.on('server_unreachable', handleServerUnreachable);
        connectionManager.on('connected', handleConnected);
        connectionManager.on('disconnected', handleDisconnected);

        // Check on component mount if we should be the host
        if (connectionManager.isReadyToSend()) {
            handleConnected();
        } else {
            handleDisconnected();
        }

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            connectionManager.off('server_unreachable', handleServerUnreachable);
            connectionManager.off('connected', handleConnected);
            connectionManager.off('disconnected', handleDisconnected);
        };
    }, [connectionManager]);

    // Listen for host death and takeover if needed
    useEffect(() => {
        const hostHeartbeatInterval = setInterval(() => {
            if (isHost) {
                // Update heartbeat as host
                localStorage.setItem('jackalopes_host_timestamp', Date.now().toString());
                localStorage.setItem('jackalopes_host_id', connectionManager.getClientId() || 'unknown');
            } else {
                // Check if current host is still alive
                const lastHeartbeat = parseInt(localStorage.getItem('jackalopes_host_timestamp') || '0', 10);
                const now = Date.now();

                // If no heartbeat for 10 seconds, take over as host
                if (now - lastHeartbeat > 10000) {
                    console.log('🎮 Current host appears inactive, taking over as new host');
                    setIsHost(true);
                    localStorage.setItem('jackalopes_host', 'true');
                    localStorage.setItem('jackalopes_host_timestamp', now.toString());
                    localStorage.setItem('jackalopes_host_id', connectionManager.getClientId() || 'unknown');
                }
            }
        }, 5000);

        return () => {
            clearInterval(hostHeartbeatInterval);
        };
    }, [isHost, connectionManager]);

    // Add multiplayer controls to Leva panel and track its state change
    const { enableMultiplayer } = useControls('Multiplayer', {
        enableMultiplayer: {
            value: true,
            label: 'Enable Connection'
        }
    }, {
        collapsed: true,
        order: 997
    });

    // Set to false initially to hide the panel by default
    const [showMultiplayerTools, setShowMultiplayerTools] = useState(false);

    // Use an effect to properly handle multiplayer enabling/disabling with proper cleanup timing
    useEffect(() => {
        let timeoutId: number | null = null;
        let forceReadyTimeoutId: ReturnType<typeof setTimeout> | null = null;

        if (enableMultiplayer) {
            // When enabling, set immediately
            console.log('Multiplayer enabled');

            // Add a fallback for connection issues by forcing ready state after 8 seconds (increased from 4)
            forceReadyTimeoutId = setTimeout(() => {
                console.log('Checking if connection is ready, forcing if needed...');
                if (connectionManager && !connectionManager.isReadyToSend()) {
                    console.log('⚠️ Connection not fully established after 8s, forcing ready state for testing');
                    connectionManager.forceReady();
                    setIsOfflineMode(true);
                    setShowOfflineNotification(true);
                    // Auto-hide notification after 5 seconds
                    setTimeout(() => setShowOfflineNotification(false), 5000);
                }
            }, 8000); // Increased from 4000 to 8000ms for slower connections

            // Cleanup function to clear both timeouts
            return () => {
                if (timeoutId) {
                    window.clearTimeout(timeoutId);
                }
                if (forceReadyTimeoutId) {
                    clearTimeout(forceReadyTimeoutId);
                }
            };
        } else {
            // When disabling, add a delay to allow for cleanup
            console.log('Disabling multiplayer with cleanup delay...');
            timeoutId = window.setTimeout(() => {
                console.log('Multiplayer disabled after cleanup');
            }, 500); // Half-second delay for proper cleanup

            // Cleanup function to clear the timeout
            return () => {
                if (timeoutId) {
                    window.clearTimeout(timeoutId);
                }
                if (forceReadyTimeoutId) {
                    clearTimeout(forceReadyTimeoutId);
                }
            };
        }
    }, [enableMultiplayer, connectionManager]);

    const {
        walkSpeed,
        runSpeed,
        jumpForce
    } = useControls('Character', {
        walkSpeed: { value: 0.11, min: 0.05, max: 0.2, step: 0.01 },
        runSpeed: { value: 0.15, min: 0.1, max: 0.3, step: 0.01 },
        jumpForce: { value: 0.5, min: 0.3, max: 0.8, step: 0.1 }
    }, {
        collapsed: true,
        order: 998
    })

    const {
        fogEnabled,
        fogColor,
        fogNear,
        fogFar,
        ambientIntensity,
        directionalIntensity,
        directionalHeight,
        directionalDistance,
        enablePostProcessing,
        vignetteEnabled,
        vignetteOffset,
        vignetteDarkness,
        chromaticAberrationEnabled,
        chromaticAberrationOffset,
        brightnessContrastEnabled,
        brightness,
        contrast,
        colorGradingEnabled,
        toneMapping,
        toneMappingExposure,
        moonOrbit,
        moonOrbitSpeed,
        highQualityShadows,
        moonVisible,
        bloomEnabled,
        bloomIntensity,
        bloomLuminanceThreshold,
        starsEnabled,
        starsCount,
        starsSize,
        starsColor,
        starsTwinkle
    } = useControls({
        fog: folder({
            fogEnabled: true,
            fogColor: '#030812', // Darker blue color for night sky
            fogNear: { value: 0, min: 0, max: 100, step: 1 },
            fogFar: { value: 140, min: 0, max: 500, step: 5 } // Increased render distance
        }, { collapsed: true }),
        lighting: folder({
            ambientIntensity: { value: 0.05, min: 0, max: 2, step: 0.1 },
            directionalIntensity: { value: 2.0, min: 0, max: 5, step: 0.1 },
            directionalHeight: { value: 100, min: 5, max: 120, step: 1 },
            directionalDistance: { value: 100, min: 5, max: 140, step: 1 },
            moonOrbit: { value: true, label: 'Moon Orbits Level' },
            moonOrbitSpeed: { value: 0.002, min: 0.001, max: 0.1, step: 0.001, label: 'Orbit Speed' },
            moonVisible: { value: true, label: 'Show Moon Mesh' },
            highQualityShadows: { value: true, label: 'High Quality Shadows' },
        }, { collapsed: true }),
        stars: folder({
            starsEnabled: { value: true, label: 'Show Stars' },
            starsCount: { value: 1000, min: 200, max: 3000, step: 100, label: 'Star Count' },
            starsSize: { value: 0.2, min: 0.05, max: 0.5, step: 0.05, label: 'Star Size' },
            starsColor: { value: '#ffffff', label: 'Star Color' },
            starsTwinkle: { value: true, label: 'Twinkling Effect' }
        }, { collapsed: true }),
        postProcessing: folder({
            enablePostProcessing: true,
            vignetteEnabled: true,
            vignetteOffset: { value: 0.5, min: 0, max: 1, step: 0.1 },
            vignetteDarkness: { value: 0.5, min: 0, max: 1, step: 0.1 },
            chromaticAberrationEnabled: true,
            chromaticAberrationOffset: { value: 0.0025, min: 0, max: 0.01, step: 0.0001 },
            brightnessContrastEnabled: true,
            brightness: { value: -0.3, min: -1, max: 1, step: 0.1 },
            contrast: { value: 0, min: -1, max: 1, step: 0.1 },
            colorGradingEnabled: true,
            toneMapping: {
                value: THREE.ACESFilmicToneMapping,
                options: {
                    'ACESFilmic': THREE.ACESFilmicToneMapping,
                    'Reinhard': THREE.ReinhardToneMapping,
                    'Cineon': THREE.CineonToneMapping,
                    'Linear': THREE.LinearToneMapping
                }
            },
            toneMappingExposure: { value: 1.2, min: 0, max: 2, step: 0.1 },
            bloomEnabled: { value: true, label: 'Bloom Effect' },
            bloomIntensity: { value: 0.5, min: 0, max: 2, step: 0.1 },
            bloomLuminanceThreshold: { value: 0.6, min: 0, max: 1, step: 0.1 }
        }, { collapsed: true })
    }, {
        collapsed: true,
        persist: true,
        order: 995
    })

    // Update the Game UI controls to include virtual gamepad toggle
    const { showTools, showConnectionTest, virtualGamepad, thirdPersonView, characterType, darkMode, forceDarkLevel, ...restControls } = useControls('Game UI', {
        showTools: {
            value: false,
            label: 'Show Multiplayer Tools'
        },
        showConnectionTest: {
            value: false,
            label: 'Show Connection Test'
        },
        virtualGamepad: {
            value: false,
            label: 'Show Virtual Controls'
        },
        thirdPersonView: {
            value: false,
            label: 'Third Person Camera'
        },
        characterType: {
            value: 'jackalope', // Changed default to jackalope
            options: ['merc', 'jackalope'],
            label: 'Character Type'
        },
        darkMode: {
            value: false,
            label: 'Dark Mode'
        },
        forceDarkLevel: {
            value: true, // Keep this true for a nice dark environment to see the moon
            label: 'Dark Level Lighting'
        }
    }, { collapsed: true });

    // Get the setter from the returned controls object
    const setControls = (restControls as any).set;

    // Set showMultiplayerTools based on the control panel toggle
    useEffect(() => {
        // Only update the UI visibility, not the connection status
        setShowMultiplayerTools(showTools);
    }, [showTools]);

    // Update virtual gamepad visibility based on the control panel toggle
    useEffect(() => {
        // On mobile devices, always show virtual gamepad regardless of toggle setting
        if (isMobile) {
            setShowVirtualGamepad(true);
        } else {
            // On desktop, follow the control panel setting
            setShowVirtualGamepad(virtualGamepad);
        }
    }, [virtualGamepad, isMobile]);

    // Handle virtual gamepad inputs
    const handleVirtualMove = (x: number, y: number) => {
        // Map virtual joystick to keyboard events for WASD movement
        // Forward/backward (W/S) mapped to Y axis
        const forwardKey = y < -0.3 ? 'w' : null;
        const backwardKey = y > 0.3 ? 's' : null;

        // Left/right (A/D) mapped to X axis
        const leftKey = x < -0.3 ? 'a' : null;
        const rightKey = x > 0.3 ? 'd' : null;

        // Helper to update key states
        const updateKey = (key: string | null, isPressed: boolean) => {
            if (!key) {
                // Release all keys that might be in this direction
                if (key === forwardKey) {
                    if (currentKeys.current['w']) {
                        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
                        currentKeys.current['w'] = false;
                    }
                } else if (key === backwardKey) {
                    if (currentKeys.current['s']) {
                        window.dispatchEvent(new KeyboardEvent('keyup', { key: 's', bubbles: true }));
                        currentKeys.current['s'] = false;
                    }
                } else if (key === leftKey) {
                    if (currentKeys.current['a']) {
                        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
                        currentKeys.current['a'] = false;
                    }
                } else if (key === rightKey) {
                    if (currentKeys.current['d']) {
                        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
                        currentKeys.current['d'] = false;
                    }
                }
                return;
            }

            // Only send event if the state changed
            if (isPressed && !currentKeys.current[key]) {
                // Dispatch keydown event
                window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
                currentKeys.current[key] = true;
            } else if (!isPressed && currentKeys.current[key]) {
                // Dispatch keyup event
                window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
                currentKeys.current[key] = false;
            }
        };

        // Update WASD keys based on joystick position
        updateKey('w', !!forwardKey);
        updateKey('s', !!backwardKey);
        updateKey('a', !!leftKey);
        updateKey('d', !!rightKey);

        // If joystick is released (x and y are 0), release all keys
        if (Math.abs(x) < 0.1 && Math.abs(y) < 0.1) {
            if (currentKeys.current['w']) {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
                currentKeys.current['w'] = false;
            }
            if (currentKeys.current['s']) {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: 's', bubbles: true }));
                currentKeys.current['s'] = false;
            }
            if (currentKeys.current['a']) {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
                currentKeys.current['a'] = false;
            }
            if (currentKeys.current['d']) {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
                currentKeys.current['d'] = false;
            }
        }
    };

    const handleVirtualJump = () => {
        console.log("Virtual jump handler triggered!");

        // Prevent repeated keydown events
        if (!currentKeys.current[' ']) {
            // Trigger space key for jump
            const keydownEvent = new KeyboardEvent('keydown', {
                key: ' ',
                code: 'Space',
                bubbles: true,
                cancelable: true
            });
            window.dispatchEvent(keydownEvent);
            document.dispatchEvent(keydownEvent); // Also dispatch to document in case game is listening there
            currentKeys.current[' '] = true;

            console.log("Sent jump keydown event (space)");

            // Release key after a short delay
            setTimeout(() => {
                const keyupEvent = new KeyboardEvent('keyup', {
                    key: ' ',
                    code: 'Space',
                    bubbles: true,
                    cancelable: true
                });
                window.dispatchEvent(keyupEvent);
                document.dispatchEvent(keyupEvent); // Also dispatch to document
                currentKeys.current[' '] = false;
                console.log("Sent jump keyup event (space)");
            }, 200);
        }
    };

    const handleVirtualShoot = () => {
        console.log("Virtual shoot handler triggered!");

        // Prevent rapid-fire
        if (!shootCooldownRef.current) {
            shootCooldownRef.current = true;

            // Simulate mouse click for shooting
            const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                button: 0, // Left button
                view: window
            });
            document.dispatchEvent(mouseDownEvent);
            console.log("Sent shoot mousedown event");

            // Also trigger sound directly
            if (window.__playMercShot) {
                console.log("Directly triggering weapon sound");
                window.__playMercShot();
            } else {
                console.log("Global weapon sound function not available");
                // Also dispatch a shotFired event as a fallback
                window.dispatchEvent(new CustomEvent('shotFired'));
            }

            // Release after a short delay
            setTimeout(() => {
                const mouseUpEvent = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                    view: window
                });
                document.dispatchEvent(mouseUpEvent);
                console.log("Sent shoot mouseup event");

                // Add cooldown to prevent spamming
                setTimeout(() => {
                    shootCooldownRef.current = false;
                }, 300);
            }, 100);
        }
    };

    // Get remote shots from the connection manager (always call the hook to maintain hook order)
    const allRemoteShots = useRemoteShots(connectionManager);
    // Only use the shots when multiplayer is enabled, not affected by UI visibility
    const remoteShots = enableMultiplayer ? allRemoteShots : [];

    // Debug logging for remote shots
    useEffect(() => {
        if (remoteShots.length > 0) {
            console.log('Remote shots in App:', remoteShots);
        }
    }, [remoteShots]);

    const { showDebug } = useControls('Game Settings', {
        showDebug: { value: false }
    }, {
        collapsed: true,
        order: 999
    });

    // Add third-person camera controls
    const {
        cameraDistance,
        cameraHeight,
        cameraSmoothing,
        invertYAxis
    } = useControls('Third Person Camera', {
        cameraDistance: { value: 5, min: 2, max: 10, step: 0.5 },
        cameraHeight: { value: 2.5, min: 1, max: 5, step: 0.5 },
        cameraSmoothing: { value: 0.1, min: 0.01, max: 1, step: 0.01 },
        invertYAxis: { value: false, label: 'Invert Y-Axis' }
    }, {
        collapsed: true,
        order: 994
    });

    // Updated reference for the third-person camera
    const thirdPersonCameraRef = useRef<THREE.PerspectiveCamera>(null);
    const lastCameraPosition = useRef(new THREE.Vector3());

    // Update the camera position update function to use the controls
    const updateThirdPersonCamera = (playerPosition: THREE.Vector3, playerRotation: THREE.Quaternion) => {
        if (!thirdPersonView || !thirdPersonCameraRef.current) return;

        // Don't update camera position when using OrbitControls
        // OrbitControls will handle camera positioning instead

        // Just make sure the camera is looking at the player
        const lookAtPosition = new THREE.Vector3().copy(playerPosition);
        lookAtPosition.y += 1; // Look at player's head level
        thirdPersonCameraRef.current.lookAt(lookAtPosition);
    };

    // Add this to the Player component props
    const playerVisibility = thirdPersonView;

    // Add this inside the App component
    useEffect(() => {
        // Log when third-person view is activated or deactivated
        console.log(`Third-person view ${thirdPersonView ? 'enabled' : 'disabled'}`);

        // Reset camera position tracker when switching views
        if (!thirdPersonView && playerPosition.current) {
            // Reset to current position without interpolation to prevent glitches
            // when switching back to third-person view
            playerPosition.current.copy(
                playerRef.current?.rigidBody?.translation() ||
                new THREE.Vector3(0, 7, 10)
            );
        }
    }, [thirdPersonView, playerRef]);

    // Add a light position stabilization function
    const updateDirectionalLight = (position: THREE.Vector3) => {
        if (!directionalLightRef.current) return;

        // Use a more stable target position (player's center)
        // This helps prevent shadow/light flickering
        directionalLightRef.current.target.position.set(position.x, position.y, position.z);
        directionalLightRef.current.target.updateMatrixWorld();

        // Position calculation is now handled by MoonOrbit if enabled
        if (!moonOrbit) {
            // Only update light position, not target - more stable for shadows
            directionalLightRef.current.position.set(
                position.x + directionalDistance,
                directionalHeight,
                position.z + directionalDistance
            );
        }
    };

    // Simplified StableLightUpdater to just position the light
    const StableLightUpdater = () => {
        // Single setup effect rather than frame-by-frame updates for better performance
        useEffect(() => {
            if (directionalLightRef.current) {
                // Set a fixed position for best shadow coverage over the level
                directionalLightRef.current.position.set(
                    -directionalDistance,
                    directionalHeight,
                    -directionalDistance
                );

                // Set target to center of level
                directionalLightRef.current.target.position.set(0, 0, 0);
                directionalLightRef.current.target.updateMatrixWorld();

                // Optimize shadows
                directionalLightRef.current.shadow.bias = -0.001;
                directionalLightRef.current.shadow.normalBias = 0.05;
                directionalLightRef.current.shadow.radius = highQualityShadows ? 1 : 2; // Softer shadows in low quality mode
                directionalLightRef.current.shadow.mapSize.width = highQualityShadows ? 2048 : 1024;
                directionalLightRef.current.shadow.mapSize.height = highQualityShadows ? 2048 : 1024;
            }
        }, [directionalHeight, directionalDistance, highQualityShadows]);

        return null;
    };

    // Add this inside the App component
    useEffect(() => {
        // Log when character type changes
        console.log(`Character type changed to ${characterType}`);
    }, [characterType]);

    // Add moon orbit component for when orbiting is enabled
    const MoonOrbit = () => {
        const angle = useRef(0);

        useFrame(() => {
            if (!moonOrbit || !directionalLightRef.current) return;

            // Increment angle for orbit - significantly slower
            angle.current += moonOrbitSpeed * 0.005;

            // Calculate light position in orbit around the center of the level
            // Using an elliptical orbit to spread on the x-axis
            const xRadius = Math.max(directionalDistance * 2.5, 50); // Much wider on x-axis
            const zRadius = Math.max(directionalDistance * 1.2, 25); // Also wider on z-axis
            const x = Math.sin(angle.current) * xRadius;
            const z = Math.cos(angle.current) * zRadius;

            // Set light position with higher elevation for more dramatic shadows
            directionalLightRef.current.position.set(
                x,
                directionalHeight * 1.2, // Make it higher for more dramatic shadows
                z
            );

            // Update directional light target to focus on level center
            // This creates more interesting and varied shadows as the moon orbits
            directionalLightRef.current.target.position.set(0, 0, 0);
            directionalLightRef.current.target.updateMatrixWorld();
        });

        return null;
    };

    // Graphics quality settings
    const performanceSettings = useControls('Performance', {
        graphicsQuality: {
            value: 'low' as const, // Changed from 'auto' to 'low'
            label: 'Graphics Quality',
            options: ['auto', 'high', 'medium', 'low'] as const,
            onChange: (value: 'auto' | 'high' | 'medium' | 'low') => {
                // Only included if window.__setGraphicsQuality is defined
                if (typeof window !== 'undefined' && window.__setGraphicsQuality) {
                    window.__setGraphicsQuality(value);
                }
            }
        },
        showFpsCounter: {
            value: false,
            label: 'Show FPS Counter'
        }
    }, {
        collapsed: true,
        order: 999
    });

    // Extract graphicsQuality with proper type assertion
    const graphicsQuality = (performanceSettings as any)?.graphicsQuality || 'low'; // Changed default fallback from 'auto' to 'low'

    // Add global rendering quality parameters controlled by graphics quality
    const [globalQualityParams, setGlobalQualityParams] = useState({
        shadowMapSize: 2048,
        bloomQuality: 'medium' as 'high' | 'medium' | 'low',
        effectsEnabled: true,
        environmentResolution: 64,
        maxParticles: 10000,
        cullingDistance: 100
    });

    // Effect to apply graphics quality to global rendering parameters
    useEffect(() => {
        // Function to apply quality settings
        const applyQualitySettings = (quality: 'auto' | 'high' | 'medium' | 'low') => {
            console.log(`[GRAPHICS] Applying global quality settings: ${quality}`);

            if (quality === 'auto') {
                // Keep current settings
                return;
            }

            // Apply settings based on quality level
            switch (quality) {
                case 'high':
                    setGlobalQualityParams({
                        shadowMapSize: 2048,
                        bloomQuality: 'high',
                        effectsEnabled: true,
                        environmentResolution: 128,
                        maxParticles: 10000,
                        cullingDistance: 300
                    });
                    // Also update Leva controls if needed
                    if (setControls) {
                        setControls({
                            highQualityShadows: true,
                            bloomIntensity: 0.7,
                            starsCount: 1500
                        });
                    }
                    break;

                case 'medium':
                    setGlobalQualityParams({
                        shadowMapSize: 1024,
                        bloomQuality: 'medium',
                        effectsEnabled: true,
                        environmentResolution: 64,
                        maxParticles: 5000,
                        cullingDistance: 200
                    });
                    // Also update Leva controls if needed
                    if (setControls) {
                        setControls({
                            highQualityShadows: false,
                            bloomIntensity: 0.5,
                            starsCount: 1000
                        });
                    }
                    break;

                case 'low':
                    setGlobalQualityParams({
                        shadowMapSize: 512,
                        bloomQuality: 'low',
                        effectsEnabled: false,
                        environmentResolution: 32,
                        maxParticles: 2000,
                        cullingDistance: 150
                    });
                    // Also update Leva controls if needed
                    if (setControls) {
                        setControls({
                            highQualityShadows: false,
                            enablePostProcessing: false,
                            starsCount: 500
                        });
                    }
                    break;
            }

            // Force camera update to prevent FPS arms disconnection
            // Use multiple attempts with increasing delays to ensure stability
            const triggerCameraUpdate = () => {
                console.log('[GRAPHICS] Triggering camera update to fix FPS arms position');
                const cameraUpdateEvent = new CustomEvent('cameraUpdateNeeded');
                window.dispatchEvent(cameraUpdateEvent);
            };

            // Multiple attempts with different delays
            setTimeout(triggerCameraUpdate, 100);
            setTimeout(triggerCameraUpdate, 500);
            setTimeout(triggerCameraUpdate, 1000);
        };

        // Apply settings when quality changes
        applyQualitySettings(graphicsQuality);

        // Also listen for the custom event from sphere-tool.tsx
        const handleQualityChange = (event: CustomEvent<{quality: 'auto' | 'high' | 'medium' | 'low'}>) => {
            applyQualitySettings(event.detail.quality);
        };

        window.addEventListener('graphicsQualityChanged', handleQualityChange as EventListener);

        return () => {
            window.removeEventListener('graphicsQualityChanged', handleQualityChange as EventListener);
        };
    }, [graphicsQuality, setControls]);

    // Add state to track player character info based on connection order
    // URL param override: ?role=merc or ?role=jackalope
    const urlRole = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        const role = params.get('role');
        if (role === 'merc' || role === 'jackalope') return role;
        return null;
    }, []);
    
    const [playerCharacterInfo, _setPlayerCharacterInfo] = useState<{ type: 'merc' | 'jackalope', thirdPerson: boolean }>(() => {
        if (urlRole) {
            console.log(`🎮 URL OVERRIDE: role=${urlRole}`);
            return { type: urlRole, thirdPerson: urlRole === 'jackalope' };
        }
        return { type: 'jackalope', thirdPerson: true };
    });
    
    // Track whether role is locked (URL override or server assigned)
    const serverAssignedType = useRef(!!urlRole);
    const urlRoleLocked = useRef(!!urlRole); // URL override is absolute - nothing can change it
    
    // Guarded setter - URL override blocks everything; otherwise server can override client
    const setPlayerCharacterInfo = useCallback((info: { type: 'merc' | 'jackalope', thirdPerson: boolean }, fromServer = false) => {
        if (urlRoleLocked.current) {
            return; // URL override - NOTHING can change this
        }
        if (serverAssignedType.current && !fromServer) {
            return; // Server assigned - ignore client-side overrides
        }
        console.log(`\u{1F3AE} setPlayerCharacterInfo: ${info.type} (server=${fromServer})`);
        _setPlayerCharacterInfo(info);
    }, []);
    
    // Server-synced match timer
    const [matchTimerData, setMatchTimerData] = useState<{ matchStartTime: number, matchDuration: number, serverTime: number } | null>(null);

    // Listen for server-authoritative player type assignment
    useEffect(() => {
        if (!connectionManager || !enableMultiplayer) return;
        
        const handleTypeAssigned = (data: { type: string, index: number }) => {
            console.log(`🎮 SERVER ASSIGNED: ${data.type} (index ${data.index})`);
            serverAssignedType.current = true;
            setPlayerCharacterInfo({
                type: data.type as 'merc' | 'jackalope',
                thirdPerson: data.type === 'jackalope'
            }, true);
        };
        
        const handleMatchTimer = (data: { matchStartTime: number, matchDuration: number, serverTime: number }) => {
            console.log('⏱️ Server match timer received:', data);
            setMatchTimerData(data);
        };
        
        connectionManager.on('player_type_assigned', handleTypeAssigned);
        connectionManager.on('match_timer', handleMatchTimer);
        return () => {
            connectionManager.off('player_type_assigned', handleTypeAssigned);
            connectionManager.off('match_timer', handleMatchTimer);
        };
    }, [connectionManager, enableMultiplayer]);

    // Non-multiplayer: sync characterType from Leva controls
    useEffect(() => {
        if (!enableMultiplayer && !serverAssignedType.current) {
            setPlayerCharacterInfo({
                type: characterType as 'merc' | 'jackalope',
                thirdPerson: characterType === 'jackalope'
            });
        }
    }, [characterType, enableMultiplayer]);

    // Add a conditional class to the body element for dark mode
    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }, [darkMode]);

    // Update sphere tool lighting when dark mode changes
    useEffect(() => {
        // Use the exported setSphereDarkMode function to enhance lighting in dark mode
        setSphereDarkMode(darkMode);
    }, [darkMode]);

    // Debug controls for forcing character types
    const debugSettings = useControls('Debug Options', {
        force_merc_fps: {
            value: false,
            label: 'Force Merc (FPS) Mode'
        },
        force_jackalope_third: {
            value: false,
            label: 'Force Jackalope (3rd Person)'
        },
        disable_character_correction: {
            value: false,
            label: 'Disable Auto Character Correction'
        },
        debugLevel: {
            value: 0,
            options: {
                'None': 0,
                'Errors Only': 1,
                'Important Events': 2,
                'Verbose': 3
            },
            label: 'Debug Log Level'
        }
    }, {
        collapsed: true,
        order: 990
    });

    // Debug force character type overrides
    useEffect(() => {
        if (!enableMultiplayer) return;
        if (debugSettings.force_merc_fps) {
            urlRoleLocked.current = false; // allow debug override
            serverAssignedType.current = false;
            setPlayerCharacterInfo({ type: 'merc', thirdPerson: false });
            if (connectionManager) connectionManager.setPlayerType('merc');
            window.dispatchEvent(new CustomEvent('cameraUpdateNeeded'));
            window.dispatchEvent(new CustomEvent('forceArmsReset'));
        }
    }, [debugSettings.force_merc_fps, enableMultiplayer, connectionManager]);

    useEffect(() => {
        if (!enableMultiplayer) return;
        if (debugSettings.force_jackalope_third) {
            urlRoleLocked.current = false;
            serverAssignedType.current = false;
            setPlayerCharacterInfo({ type: 'jackalope', thirdPerson: true });
            if (connectionManager) connectionManager.setPlayerType('jackalope');
            window.dispatchEvent(new CustomEvent('cameraUpdateNeeded'));
        }
    }, [debugSettings.force_jackalope_third, enableMultiplayer, connectionManager]);

    // Update debug level when it changes
    useEffect(() => {
        console.log(`Debug level changed to: ${debugSettings.debugLevel}`);

        if (typeof window !== 'undefined') {
            // Set the debug level directly
            if (window.jackalopesGame) {
                window.jackalopesGame.debugLevel = debugSettings.debugLevel;
            }

            // Use the global setter function if available
            if (window.__setDebugLevel) {
                window.__setDebugLevel(debugSettings.debugLevel);
            }

            // Also set it directly on the EntityStateObserver if available
            if (window.__entityStateObserver) {
                window.__entityStateObserver.setDebugLevel(debugSettings.debugLevel);
            }

            // Update ConnectionManager log level if available
            if (connectionManager) {
                // Map our debug levels (0-3) to ConnectionManager's LogLevel
                // 0 = NONE, 1 = ERROR, 2 = INFO, 3 = VERBOSE
                const logLevelMap = [0, 1, 3, 5]; // Map to LogLevel enum values
                connectionManager.setLogLevel(logLevelMap[debugSettings.debugLevel] || 0);
            }
        }
    }, [debugSettings.debugLevel, connectionManager]);

    // Force arms reset on initial load
    useEffect(() => {
        const timer = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('forceArmsReset'));
            window.dispatchEvent(new CustomEvent('cameraUpdateNeeded'));
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    // Handle forceDarkLevel changes - reset arms position for visibility in dark environments
    useEffect(() => {
        if (forceDarkLevel !== undefined) { // Run for both true and false changes
            console.log(`[DEBUG] Force dark level ${forceDarkLevel ? 'enabled' : 'disabled'} - resetting arms position`);

            // Function to trigger all needed updates
            const resetCameraAndArms = () => {
                // First dispatch camera update event
                window.dispatchEvent(new CustomEvent('cameraUpdateNeeded'));

                // Then dispatch arms reset event (with small delay)
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('forceArmsReset'));
                }, 50);

                // Finally force a camera position sync with detailed info
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('forceCameraSync', {
                        detail: {
                            forceDarkLevel,
                            timestamp: Date.now(),
                            operation: 'toggle_dark_level'
                        }
                    }));
                }, 100);
            };

            // Execute several times with increasing delays for reliability
            // This improves chances of successful sync across various frame timings
            resetCameraAndArms();
            for (let i = 1; i <= 5; i++) {
                setTimeout(resetCameraAndArms, i * 300);
            }
        }
    }, [forceDarkLevel]);

    // Add effect to track player type for global access
    useEffect(() => {
        // Create global game state object if it doesn't exist
        if (!window.jackalopesGame) {
            window.jackalopesGame = {};
        }

        // Update player type in global state
        window.jackalopesGame.playerType = enableMultiplayer
            ? playerCharacterInfo.type
            : (thirdPersonView ? 'jackalope' : 'merc');

        console.log(`Set global player type: ${window.jackalopesGame.playerType}`);

        return () => {
            // Cleanup
            delete window.jackalopesGame?.playerType;
        };
    }, [enableMultiplayer, playerCharacterInfo.type, thirdPersonView]);

    // Enhanced Leva panel toggle detection
    useEffect(() => {
        // Initialize global state tracking for Leva panel
        if (!window.jackalopesGame) {
            window.jackalopesGame = {};
        }
        window.jackalopesGame.levaPanelState = 'closed'; // Default to closed

        // Function to check if panel is collapsed based on DOM
        const isPanelCollapsed = () => {
            const levaRoot = document.getElementById('leva__root');
            if (!levaRoot) return true; // Default to collapsed if not found

            // Look for the collapsed class on any child element
            const collapsedElement = levaRoot.querySelector('[class*="leva-c-"][class*="collapsed"]');
            return !!collapsedElement;
        };

        // Function to handle manual trigger for camera update
        const handleLevaToggle = (isOpen?: boolean) => {
            console.log("Leva panel toggle detected - forcing camera update");

            // Update global state based on DOM if not explicitly provided
            const newState = isOpen !== undefined ? isOpen : !isPanelCollapsed();
            window.jackalopesGame!.levaPanelState = newState ? 'open' : 'closed';
            console.log(`Leva panel is now ${window.jackalopesGame!.levaPanelState}`);

            forceCameraReconnection('leva_toggle');

            // Reset player position tracking to avoid jumps
            if (playerRef.current?.rigidBody) {
                const position = playerRef.current.rigidBody.translation();
                if (position && playerPosition.current) {
                    playerPosition.current.set(position.x, position.y, position.z);
                }
            }
        };

        // Function to handle clicks on the Leva panel button
        const handleLevaBtnClick = (e: MouseEvent) => {
            const target = e.target as Element;
            // Check for clicks on the toggle button or drag handle
            if (target && (
                target.closest('.leva__panel__draggable') ||
                target.closest('#leva__root button') ||
                // Also look for specific Leva classes
                target.closest('[class*="leva-c-"][class*="titleBar"]') ||
                target.closest('[class*="leva-c-"][class*="titleButton"]')
            )) {
                // Short delay to let DOM update
                setTimeout(() => handleLevaToggle(), 50);
            }
        };

        // Add click listener for the Leva button with capture phase
        document.addEventListener('click', handleLevaBtnClick, true);

        // Create a mutation observer with more reliable detection
        const observer = new MutationObserver((mutations) => {
            // Filter for mutations that might indicate panel state change
            const relevantMutation = mutations.some(mutation => {
                // Check for class changes
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target as Element;
                    return target.className &&
                        (target.className.includes('leva-c-') ||
                         target.className.includes('collapsed') ||
                         target.className.includes('titleBar'));
                }
                return false;
            });

            if (relevantMutation) {
                // Short delay to let DOM update
                setTimeout(() => handleLevaToggle(), 50);
            }
        });

        // Find the Leva panel root element and observe it
        const setupObserver = () => {
            const levaRoot = document.getElementById('leva__root');
            if (levaRoot) {
                observer.observe(levaRoot, {
                    attributes: true,
                    childList: true,
                    subtree: true
                });
                console.log("Observing Leva panel for changes");

                // Initial check for panel state
                const initialState = !isPanelCollapsed();
                window.jackalopesGame!.levaPanelState = initialState ? 'open' : 'closed';
                console.log(`Initial Leva panel state: ${window.jackalopesGame!.levaPanelState}`);
            } else {
                // Retry if not found
                setTimeout(setupObserver, 500);
            }
        };

        // Setup the observer
        setupObserver();

        // Make sure camera is updated on initial load
        setTimeout(() => forceCameraReconnection('initial_setup'), 1500);

        // Force additional camera resets if Dark Level is enabled
        if (forceDarkLevel) {
            // Multiple attempts with increasing delays for better reliability
            for (let i = 1; i <= 5; i++) {
                setTimeout(() => {
                    console.log(`[DEBUG] Initial Dark Level camera reconnection attempt ${i}`);
                    window.dispatchEvent(new CustomEvent('cameraUpdateNeeded'));
                    window.dispatchEvent(new CustomEvent('forceArmsReset'));
                    window.dispatchEvent(new CustomEvent('forceCameraSync', {
                        detail: {
                            forceDarkLevel: true,
                            timestamp: Date.now(),
                            operation: 'initial_dark_level'
                        }
                    }));
                }, 2000 + (i * 500)); // Start after initial setup with increasing delays
            }
        }

        return () => {
            observer.disconnect();
            document.removeEventListener('click', handleLevaBtnClick, true);
        };
    }, [forceDarkLevel]);

    // Add a special effect to ensure camera is properly connected when character type changes
    useEffect(() => {
        // Only run for jackalope character type
        if (playerCharacterInfo.type === 'jackalope' || thirdPersonView) {
            console.log("Character type or view changed - ensuring camera reconnection");

            // Force immediate reconnection
            forceCameraReconnection('character_type_change');

            // Add additional reconnection attempts with increasing delays for reliability
            setTimeout(() => forceCameraReconnection('character_delayed_1'), 500);
            setTimeout(() => forceCameraReconnection('character_delayed_2'), 1000);
            setTimeout(() => forceCameraReconnection('character_delayed_3'), 2000);
        }
    }, [playerCharacterInfo.type, thirdPersonView]);

    // Add effect to track player type for global access
    useEffect(() => {
        // Create global game state object if it doesn't exist
        if (!window.jackalopesGame) {
            window.jackalopesGame = {};
        }

        // Update player type in global state
        window.jackalopesGame.playerType = enableMultiplayer
            ? playerCharacterInfo.type
            : (thirdPersonView ? 'jackalope' : 'merc');

        console.log(`Set global player type: ${window.jackalopesGame.playerType}`);

        return () => {
            // Cleanup
            delete window.jackalopesGame?.playerType;
        };
    }, [enableMultiplayer, playerCharacterInfo.type, thirdPersonView]);

    // Create a new component for the flashlight UI indicator
    const FlashlightUI = () => {
        const [isOn, setIsOn] = useState(false);
        const [visible, setVisible] = useState(false);

        useEffect(() => {
            // Initialize with current state if available
            if (window.jackalopesGame?.flashlightOn !== undefined) {
                setIsOn(window.jackalopesGame.flashlightOn);
            }

            // Check if we're in first person as merc
            if (window.jackalopesGame?.playerType === 'merc') {
                setVisible(true);
            } else {
                setVisible(false);
            }

            // Listen for flashlight toggle events
            const handleFlashlightToggle = (event: CustomEvent<{isOn: boolean}>) => {
                setIsOn(event.detail.isOn);
            };

            // Listen for player type changes
            const handlePlayerTypeChange = () => {
                setVisible(window.jackalopesGame?.playerType === 'merc');
            };

            window.addEventListener('flashlightToggled', handleFlashlightToggle as EventListener);
            window.addEventListener('playerTypeChanged', handlePlayerTypeChange);

            return () => {
                window.removeEventListener('flashlightToggled', handleFlashlightToggle as EventListener);
                window.removeEventListener('playerTypeChanged', handlePlayerTypeChange);
            };
        }, []);

        if (!visible) return null;

        return (
            <div style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                padding: '5px 10px',
                backgroundColor: isOn ? 'rgba(255, 255, 0, 0.3)' : 'rgba(100, 100, 100, 0.3)',
                color: isOn ? '#ffff00' : '#aaaaaa',
                border: `1px solid ${isOn ? '#ffff00' : '#666666'}`,
                borderRadius: '4px',
                pointerEvents: 'none',
                fontSize: '12px',
                fontWeight: 'bold',
                userSelect: 'none',
                zIndex: 1000
            }}>
                Flashlight: {isOn ? 'ON' : 'OFF'} [F]
            </div>
        );
    };

    // Add effect to handle health test (pressing 'H' key reduces health)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'h' || e.key === 'H') {
                // Reduce health by 10 on H press
                setPlayerHealth(prev => Math.max(0, prev - 10));
            }

            // Press 'R' to reset health
            if (e.key === 'r' || e.key === 'R') {
                setPlayerHealth(100);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Make connectionManager available globally
    useEffect(() => {
      if (connectionManager) {
        window.connectionManager = connectionManager;

        // Also set window.__networkManager for respawn functionality
        window.__networkManager = {
          sendRespawnRequest: (playerId: string, spawnPosition?: [number, number, number]) => {
            if (connectionManager) {
              console.log(`[App] Sending respawn request for player ${playerId} with default spawn position [-100, 3, 10]`);
              connectionManager.sendRespawnRequest(playerId, spawnPosition);
            } else {
              console.error('[App] Cannot send respawn request: connectionManager is not initialized');
            }
          }
        };

        // Clean up on unmount
        return () => {
          delete window.connectionManager;
          delete window.__networkManager;
        };
      }
    }, [connectionManager, mercsScore]);

    // Initialize EntityStateObserver and SoundManager
    useEffect(() => {
        console.log('🔄 Initializing entity tracking and sound systems');

        // Set debug level based on the debug settings instead of hardcoding to true
        entityStateObserver.setDebugLevel(debugSettings?.debugLevel ?? 0);

        // Update sound settings based on user preferences
        soundManager.updateSettings({
            masterVolume: 0.8,
            footstepsEnabled: true,
            spatialAudioEnabled: true,
            remoteSoundsEnabled: true
        });

        // Clean up
        return () => {
            console.log('Cleaning up entity and sound systems');
        };
    }, [debugSettings?.debugLevel]);

    // Add a frame processor component to handle sound updates
    const SoundProcessor = () => {
        useFrame(() => {
            // Update sound positions based on entity positions
            soundManager.update();
        });

        return null;
    };

    useEffect(() => {
        // Initialize the global game object with default settings
        if (typeof window !== 'undefined') {
            window.jackalopesGame = window.jackalopesGame || {};
            window.jackalopesGame.debugLevel = window.jackalopesGame.debugLevel || 0; // Default to no logging (was 1)

            // Expose functions to change debug level
            window.__setDebugLevel = (level: number) => {
                if (window.jackalopesGame) {
                    window.jackalopesGame.debugLevel = level;
                    console.log(`Debug level set to ${level}`);

                    // Also update EntityStateObserver debug level if it exists
                    if (window.__entityStateObserver) {
                        window.__entityStateObserver.setDebugLevel(level);
                    }

                    // Return message about debug level
                    return `Debug level set to ${level}: ${level === 0 ? 'None' : level === 1 ? 'Errors only' : level === 2 ? 'Important events' : 'Verbose'}`;
                }
            };
        }
    }, []);

    // Add listener for circle collisions to update Jackalope score
    useEffect(() => {
      // Handler for jackalope scoring points when touching the center circle
      const handleJackalopeScored = () => {
        // Only increment score if the local player is a jackalope
        if (window.jackalopesGame?.playerType === 'jackalope') {
          const newScore = jackalopesScore + 1;
          setJackalopesScore(newScore);
          // Update last score time to prevent timer resets from overriding
          lastScoreTime.current = Date.now();
          console.log('🐰 Jackalope scored a point! New score:', newScore);
          emitKillFeed('score', '🐰 Jackalope reached the void!', '#4682B4');

          // Store the updated score in localStorage
          try {
            localStorage.setItem('jackalopes_score', String(newScore));
            localStorage.setItem('scores_last_updated', String(Date.now()));
          } catch (err) {
            console.error('Error storing score in localStorage:', err);
          }

          // Broadcast score update to all players if in multiplayer mode
          if (enableMultiplayer && connectionManager && connectionManager.isReadyToSend()) {
            // Use a direct broadcast message with a unique format for better reliability
            console.log('📣 Broadcasting jackalope score:', newScore);
            connectionManager.sendMessage({
              type: 'game_event',
              event: {
                event_type: 'game_score_update', // More specific event type
                source: 'jackalope_scored',
                scoreType: 'jackalope', // Explicitly mark which score is being updated
                jackalopesScore: newScore,
                mercsScore: mercsScore,
                timestamp: Date.now(),
                shotId: `score-j-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
              }
            });
          }
        }
      };

      // Create a custom event for jackalope scoring
      window.addEventListener('jackalope_scored', handleJackalopeScored);

      return () => {
        window.removeEventListener('jackalope_scored', handleJackalopeScored);
      };
    }, [jackalopesScore, mercsScore, enableMultiplayer, connectionManager]);

    // Add listener for merc scoring when hitting a jackalope
    useEffect(() => {
      // Handler for merc scoring points when hitting a jackalope
      const handleMercScored = (event: CustomEvent) => {
        // Only increment score if the local player is a merc
        if (window.jackalopesGame?.playerType === 'merc') {
          // Extract jackalope ID from the event
          const jackalopeId = event.detail?.jackalopeId;
          const mercId = event.detail?.mercId;
          const shotId = event.detail?.shotId;

          if (!jackalopeId) {
            console.log(`🎯 Missing jackalopeId in merc_scored event:`, event.detail);
            return;
          }

          console.log(`🎯 Processing scoring event: Merc ${mercId} hit Jackalope ${jackalopeId} with shot ${shotId}`);

          // Skip if we've already scored for this jackalope
          if (scoredJackalopesRef.current.has(jackalopeId)) {
            console.log(`🎯 Already scored for jackalope ${jackalopeId}, not incrementing score`);
            return;
          }

          // Mark this jackalope as scored
          scoredJackalopesRef.current.add(jackalopeId);
          console.log(`🎯 Adding jackalope ${jackalopeId} to scored list (total: ${scoredJackalopesRef.current.size})`);

          // If the set gets too large, clear older entries (after 100 entries)
          if (scoredJackalopesRef.current.size > 100) {
            console.log('🎯 Clearing old scored jackalopes from tracking');
            scoredJackalopesRef.current.clear();
          } else {
            // Save updated list to localStorage
            saveScoredJackalopes();
          }

          const newScore = mercsScore + 1;
          setMercsScore(newScore);
          // Update last score time to prevent timer resets from overriding
          lastScoreTime.current = Date.now();
          console.log(`🎯 Merc scored a point! Current score: ${mercsScore}, updating to: ${newScore}`);
          emitKillFeed('kill', '🎯 Merc took down a Jackalope!', '#ff4500');
          showHitMarker();

          // Store the updated score in localStorage
          try {
            localStorage.setItem('mercs_score', String(newScore));
            localStorage.setItem('scores_last_updated', String(Date.now()));
            localStorage.setItem('last_score_time', Date.now().toString());
          } catch (err) {
            console.error('Error storing score in localStorage:', err);
          }

          // Broadcast score update to all players if in multiplayer mode
          if (enableMultiplayer && connectionManager && connectionManager.isReadyToSend()) {
            // Generate a unique event ID to prevent duplicate processing
            const scoreEventId = `score-m-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // Use a direct broadcast message with a unique format for better reliability
            console.log('📣 Broadcasting merc score:', newScore);
            connectionManager.sendMessage({
              type: 'game_event',
              event: {
                event_type: 'game_score_update',
                source: 'merc_scored_direct_hit',
                scoreType: 'merc', // Explicitly mark which score is being updated
                jackalopesScore: jackalopesScore,
                mercsScore: newScore,
                eliminatedJackalopeId: jackalopeId, // Include which jackalope was eliminated
                mercId: mercId,
                hitShotId: shotId, // Original shot ID that caused the hit
                scored_time: Date.now(), // Add timestamp to help with race conditions
                scoredJackalopes: Array.from(scoredJackalopesRef.current), // Share which jackalopes have been scored
                timestamp: Date.now(),
                shotId: scoreEventId
              }
            });

            // Also broadcast via window event for cross-tab communication
            window.dispatchEvent(new CustomEvent('game_score_update', {
              detail: {
                event_type: 'game_score_update',
                source: 'merc_scored_local',
                scoreType: 'merc',
                jackalopesScore: jackalopesScore,
                mercsScore: newScore,
                scored_time: Date.now(),
                shotId: `score-m-local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
              }
            }));

            // Mark this score update as processed
            processedScoreUpdates.add(scoreEventId);
          }
        }
      };

      // Listen for the merc_scored event
      window.addEventListener('merc_scored', handleMercScored as EventListener);

      return () => {
        window.removeEventListener('merc_scored', handleMercScored as EventListener);
      };
    }, [mercsScore, jackalopesScore, enableMultiplayer, connectionManager]);

    // Initialize scores from localStorage if available
    useEffect(() => {
      try {
        const storedJackalopesScore = localStorage.getItem('jackalopes_score');
        const storedMercsScore = localStorage.getItem('mercs_score');

        if (storedJackalopesScore) {
          const parsedScore = parseInt(storedJackalopesScore, 10);
          if (!isNaN(parsedScore) && parsedScore > jackalopesScore) {
            console.log(`📊 Loading jackalopes score from localStorage: ${parsedScore}`);
            setJackalopesScore(parsedScore);
          }
        }

        if (storedMercsScore) {
          const parsedScore = parseInt(storedMercsScore, 10);
          if (!isNaN(parsedScore) && parsedScore > mercsScore) {
            console.log(`📊 Loading mercs score from localStorage: ${parsedScore}`);
            setMercsScore(parsedScore);
          }
        }
      } catch (err) {
        console.error('Error loading scores from localStorage:', err);
      }
    }, []);

    // Listen for localStorage changes to sync scores between tabs
    useEffect(() => {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'jackalopes_score') {
          const newScore = parseInt(e.newValue || '0', 10);
          if (!isNaN(newScore) && newScore > jackalopesScore) {
            console.log(`📊 Updating jackalopes score from localStorage: ${newScore}`);
            setJackalopesScore(newScore);
          }
        } else if (e.key === 'mercs_score') {
          const newScore = parseInt(e.newValue || '0', 10);
          if (!isNaN(newScore) && newScore > mercsScore) {
            console.log(`📊 Updating mercs score from localStorage: ${newScore}`);
            setMercsScore(newScore);
          }
        }
      };

      window.addEventListener('storage', handleStorageChange);

      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }, [jackalopesScore, mercsScore]);

    // Add listener for score update events from other players
    useEffect(() => {
      // Only set up handler when multiplayer is enabled
      if (!enableMultiplayer || !connectionManager) return;

      // Track processed score updates to avoid duplicates
      const processedScoreUpdates = new Set<string>();

      // Handle the game event messages from the server
      const handleGameEvent = (data: any) => {
        // Check if this is a score update event
        if (data && data.event && data.event.event_type === 'game_score_update' && data.event.shotId) {
          const event = data.event;

          console.log('📊 Received score update event:', event);

          // Skip if we've already processed this score update
          if (processedScoreUpdates.has(event.shotId)) {
            console.log('⏩ Skipping duplicate score update:', event.shotId);
            return;
          }

          // Mark this update as processed
          processedScoreUpdates.add(event.shotId);

          // Limit the size of the processed set to avoid memory leaks
          if (processedScoreUpdates.size > 100) {
            // Remove oldest entries
            const updatesArray = Array.from(processedScoreUpdates);
            processedScoreUpdates.clear();
            updatesArray.slice(-50).forEach(id => processedScoreUpdates.add(id));
          }

          console.log(`📊 Received score update from network: J=${event.jackalopesScore}, M=${event.mercsScore}, source=${event.source || 'unknown'}`);

          // Handle score updates by source type
          if (event.source === 'timer_reset') {
            // Only apply timer resets if our scores aren't more recent
            if (!event.reset_time || Date.now() - event.reset_time < 5000) {
              console.log('📊 Processing timer reset from network');
              setJackalopesScore(0);
              setMercsScore(0);
              localStorage.setItem('jackalopes_score', '0');
              localStorage.setItem('mercs_score', '0');
            } else {
              console.log('📊 Ignoring old timer reset event');
            }
          }
          else if (event.source && (event.source.includes('merc_scored') || event.source.includes('jackalope_scored'))) {
            // Direct scoring events - always apply these with priority
            console.log('📊 Processing direct scoring event from network');

            // If this is a merc scoring event, update merc score
            if (event.source.includes('merc_scored') && event.mercsScore > mercsScore) {
              setMercsScore(event.mercsScore);
              // Update last score time
              lastScoreTime.current = Date.now();
              localStorage.setItem('mercs_score', String(event.mercsScore));
            }

            // If this is a jackalope scoring event, update jackalope score
            if (event.source.includes('jackalope_scored') && event.jackalopesScore > jackalopesScore) {
              setJackalopesScore(event.jackalopesScore);
              // Update last score time
              lastScoreTime.current = Date.now();
              localStorage.setItem('jackalopes_score', String(event.jackalopesScore));
            }

            // Update scored jackalopes tracking if provided
            if (event.scoredJackalopes && Array.isArray(event.scoredJackalopes)) {
              console.log(`📊 Updating scored jackalopes list with ${event.scoredJackalopes.length} entries from network`);

              // Merge the received list with our current list
              event.scoredJackalopes.forEach((id: string) => {
                scoredJackalopesRef.current.add(id);
              });

              // Save to localStorage
              saveScoredJackalopes();
            }

            // If a single jackalope was eliminated, add it to our tracking
            if (event.eliminatedJackalopeId) {
              console.log(`📊 Adding jackalope ${event.eliminatedJackalopeId} to scored list from network event`);
              scoredJackalopesRef.current.add(event.eliminatedJackalopeId);
              saveScoredJackalopes();
            }
          }
          else {
            // Other score updates (periodic sync, etc)
            console.log('📊 Processing general score update from network');

            // For general updates, take the higher score
            const newJackalopesScore = Math.max(jackalopesScore, event.jackalopesScore || 0);
            const newMercsScore = Math.max(mercsScore, event.mercsScore || 0);

            if (newJackalopesScore !== jackalopesScore || newMercsScore !== mercsScore) {
              console.log(`📊 Updating scores to higher values: J=${newJackalopesScore}, M=${newMercsScore}`);

              if (newJackalopesScore !== jackalopesScore) {
                setJackalopesScore(newJackalopesScore);
                localStorage.setItem('jackalopes_score', String(newJackalopesScore));
              }

              if (newMercsScore !== mercsScore) {
                setMercsScore(newMercsScore);
                localStorage.setItem('mercs_score', String(newMercsScore));
              }

              // Update last score time if either score changed
              lastScoreTime.current = Date.now();
            } else {
              console.log('📊 No score changes needed - our scores are higher or equal');
            }
          }

          // Announce the score update to make it very clear
          if (event.scoreType === 'jackalope') {
            console.log(`🐰 Jackalope scored! Current scores: J=${jackalopesScore}, M=${mercsScore}`);
          } else if (event.scoreType === 'merc') {
            console.log(`🎯 Merc scored! Current scores: J=${jackalopesScore}, M=${mercsScore}`);
          }
        }
      };

      // Handle the custom window events dispatched by MultiplayerSyncManager
      const handleWindowScoreEvent = (e: Event) => {
        const event = (e as CustomEvent).detail;
        if (!event || !event.shotId) return;

        console.log('📊 Received score update from window event:', event);

        // Skip if we've already processed this score update
        if (processedScoreUpdates.has(event.shotId)) {
          console.log('⏩ Skipping duplicate score update from window event:', event.shotId);
          return;
        }

        // Mark this update as processed
        processedScoreUpdates.add(event.shotId);

        console.log(`📊 Updating scores from window event: J=${event.jackalopesScore}, M=${event.mercsScore}, source=${event.source || 'unknown'}`);

        // Handle score updates by source type
        if (event.source === 'timer_reset') {
          // Only apply timer resets if our scores aren't more recent
          if (!event.reset_time || Date.now() - event.reset_time < 5000) {
            console.log('📊 Processing timer reset from window event');
            setJackalopesScore(0);
            setMercsScore(0);
            localStorage.setItem('jackalopes_score', '0');
            localStorage.setItem('mercs_score', '0');
          } else {
            console.log('📊 Ignoring old timer reset window event');
          }
        }
        else if (event.source && (event.source.includes('merc_scored') || event.source.includes('jackalope_scored'))) {
          // Direct scoring events - always apply these with priority
          console.log('📊 Processing direct scoring event from window');

          // If this is a merc scoring event, update merc score
          if (event.source.includes('merc_scored') && event.mercsScore > mercsScore) {
            setMercsScore(event.mercsScore);
            // Update last score time
            lastScoreTime.current = Date.now();
            localStorage.setItem('mercs_score', String(event.mercsScore));
          }

          // If this is a jackalope scoring event, update jackalope score
          if (event.source.includes('jackalope_scored') && event.jackalopesScore > jackalopesScore) {
            setJackalopesScore(event.jackalopesScore);
            // Update last score time
            lastScoreTime.current = Date.now();
            localStorage.setItem('jackalopes_score', String(event.jackalopesScore));
          }

          // Update scored jackalopes tracking if provided
          if (event.scoredJackalopes && Array.isArray(event.scoredJackalopes)) {
            console.log(`📊 Updating scored jackalopes list with ${event.scoredJackalopes.length} entries from window event`);

            // Merge the received list with our current list
            event.scoredJackalopes.forEach((id: string) => {
              scoredJackalopesRef.current.add(id);
            });

            // Save to localStorage
            saveScoredJackalopes();
          }

          // If a single jackalope was eliminated, add it to our tracking
          if (event.eliminatedJackalopeId) {
            console.log(`📊 Adding jackalope ${event.eliminatedJackalopeId} to scored list from window event`);
            scoredJackalopesRef.current.add(event.eliminatedJackalopeId);
            saveScoredJackalopes();
          }
        }
        else {
          // Other score updates (periodic sync, etc)
          console.log('📊 Processing general score update from window');

          // For general updates, take the higher score
          const newJackalopesScore = Math.max(jackalopesScore, event.jackalopesScore || 0);
          const newMercsScore = Math.max(mercsScore, event.mercsScore || 0);

          if (newJackalopesScore !== jackalopesScore || newMercsScore !== mercsScore) {
            console.log(`📊 Updating scores to higher values: J=${newJackalopesScore}, M=${newMercsScore}`);

            if (newJackalopesScore !== jackalopesScore) {
              setJackalopesScore(newJackalopesScore);
              localStorage.setItem('jackalopes_score', String(newJackalopesScore));
            }

            if (newMercsScore !== mercsScore) {
              setMercsScore(newMercsScore);
              localStorage.setItem('mercs_score', String(newMercsScore));
            }

            // Update last score time if either score changed
            lastScoreTime.current = Date.now();
          } else {
            console.log('📊 No score changes needed - our scores are higher or equal');
          }
        }

        // Announce the score update to make it very clear
        if (event.scoreType === 'jackalope') {
          console.log(`🐰 Jackalope scored! Current scores: J=${jackalopesScore}, M=${mercsScore}`);
        } else if (event.scoreType === 'merc') {
          console.log(`🎯 Merc scored! Current scores: J=${jackalopesScore}, M=${mercsScore}`);
        }
      };

      // Listen for window events as well for better cross-client synchronization
      window.addEventListener('game_score_update', handleWindowScoreEvent);

      // Add listener for game events
      connectionManager.on('game_event', handleGameEvent);

      // Request current scores from all players when we connect
      if (connectionManager.isReadyToSend()) {
        console.log('🔄 Requesting current scores from all players...');
        setTimeout(() => {
          connectionManager.sendMessage({
            type: 'game_event',
            event: {
              event_type: 'game_score_request', // More specific event type
              timestamp: Date.now(),
              shotId: `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
            }
          });
        }, 1000); // Delay to ensure connection is ready
      }

      // Listen for score requests and respond with our scores
      const handleScoreRequest = (data: any) => {
        if (data && data.event && data.event.event_type === 'game_score_request') {
          console.log('📡 Received score request, sending our scores...');
          if (connectionManager.isReadyToSend()) {
            connectionManager.sendMessage({
              type: 'game_event',
              event: {
                event_type: 'game_score_update',
                source: 'score_request_response',
                jackalopesScore: jackalopesScore,
                mercsScore: mercsScore,
                timestamp: Date.now(),
                shotId: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
              }
            });
          }
        }
      };

      // Add this as a separate handler
      connectionManager.on('game_event', handleScoreRequest);

      // Also implement a periodic score synchronization
      const syncInterval = setInterval(() => {
        if (connectionManager && connectionManager.isReadyToSend()) {
          // Send our current scores every 10 seconds to ensure synchronization
          connectionManager.sendMessage({
            type: 'game_event',
            event: {
              event_type: 'game_score_update',
              source: 'periodic_sync',
              jackalopesScore: jackalopesScore,
              mercsScore: mercsScore,
              timestamp: Date.now(),
              shotId: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
            }
          });
        }
      }, 10000); // Sync every 10 seconds

      return () => {
        // Clean up the subscriptions
        connectionManager.off('game_event', handleGameEvent);
        connectionManager.off('game_event', handleScoreRequest);
        window.removeEventListener('game_score_update', handleWindowScoreEvent);
        clearInterval(syncInterval);
      };
    }, [enableMultiplayer, connectionManager, jackalopesScore, mercsScore]);

    // Add handler for respawn events from server
    useEffect(() => {
      const handleRespawnEvent = (event: CustomEvent) => {
        const respawnedPlayerId = event.detail?.playerId;
        if (respawnedPlayerId) {
          // Clear tracking for this jackalope when it respawns from a network event
          clearScoredJackalope(respawnedPlayerId);
          console.log(`🔄 Cleared tracking for respawned jackalope: ${respawnedPlayerId}`);
        }
      };

      window.addEventListener('player_respawn', handleRespawnEvent as EventListener);

      return () => {
        window.removeEventListener('player_respawn', handleRespawnEvent as EventListener);
      };
    }, []);

    // Add this near the top of the App function component where other refs are defined
    const processedScoreUpdates = useRef(new Set<string>()).current;
    // Add this after lastScoreTime ref
    const lastBroadcastTime = useRef(Date.now());

    // Update handleJackalopeScored function
    const handleJackalopeScored = (event: CustomEvent) => {
      // Only increment score if the local player is a jackalope
      if (window.jackalopesGame?.playerType === 'jackalope') {
        const mercId = event.detail?.mercId;

        if (!mercId) {
          console.log(`🐰 Missing mercId in jackalope_scored event:`, event.detail);
          return;
        }

        console.log(`🐰 Processing scoring event: Jackalope scored against Merc ${mercId}`);

        // Skip if we've already scored for this merc (in the last minute)
        const mercKey = `merc-${mercId}-${Math.floor(Date.now() / 60000)}`;

        if (scoredMercsRef.current.has(mercKey)) {
          console.log(`🐰 Already scored for merc ${mercId} recently, not incrementing score`);
          return;
        }

        // Mark this merc as scored against
        scoredMercsRef.current.add(mercKey);
        console.log(`🐰 Adding merc ${mercId} to scored list (total: ${scoredMercsRef.current.size})`);

        // If the set gets too large, clear older entries
        if (scoredMercsRef.current.size > 100) {
          console.log('🐰 Clearing old scored mercs from tracking');
          scoredMercsRef.current.clear();
        }

        const newScore = jackalopesScore + 1;
        setJackalopesScore(newScore);
        // Update last score time to prevent timer resets from overriding
        lastScoreTime.current = Date.now();
        console.log(`🐰 Jackalope scored a point! Current score: ${jackalopesScore}, updating to: ${newScore}`);

        // Store the updated score in localStorage
        try {
          localStorage.setItem('jackalopes_score', String(newScore));
          localStorage.setItem('scores_last_updated', String(Date.now()));
          localStorage.setItem('last_score_time', Date.now().toString());
        } catch (err) {
          console.error('Error storing score in localStorage:', err);
        }

        // Broadcast score update to all players if in multiplayer mode
        if (enableMultiplayer && connectionManager && connectionManager.isReadyToSend()) {
          // Generate a unique event ID to prevent duplicate processing
          const scoreEventId = `score-j-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          // Use a direct broadcast message with a unique format for better reliability
          console.log('📣 Broadcasting jackalope score:', newScore);
          connectionManager.sendMessage({
            type: 'game_event',
            event: {
              event_type: 'game_score_update',
              source: 'jackalope_scored_direct_hit',
              scoreType: 'jackalope', // Explicitly mark which score is being updated
              jackalopesScore: newScore,
              mercsScore: mercsScore,
              targetMercId: mercId, // Include which merc was the target
              scored_time: Date.now(), // Add timestamp to help with race conditions
              timestamp: Date.now(),
              shotId: scoreEventId
            }
          });

          // Also broadcast via window event for cross-tab communication
          window.dispatchEvent(new CustomEvent('game_score_update', {
            detail: {
              event_type: 'game_score_update',
              source: 'jackalope_scored_local',
              scoreType: 'jackalope',
              jackalopesScore: newScore,
              mercsScore: mercsScore,
              scored_time: Date.now(),
              shotId: `score-j-local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
            }
          }));

          // Mark this score update as processed
          processedScoreUpdates.add(scoreEventId);
        }
      }
    };

    // Add periodic score sync function
    const syncScoresWithNetwork = useCallback(() => {
      // Only broadcast every 5 seconds at most
      const now = Date.now();
      if (now - lastBroadcastTime.current < 5000) {
        return;
      }

      lastBroadcastTime.current = now;

      // Don't broadcast if both scores are 0
      if (jackalopesScore === 0 && mercsScore === 0) {
        return;
      }

      // Broadcast current scores to all players if in multiplayer mode
      if (enableMultiplayer && connectionManager && connectionManager.isReadyToSend()) {
        console.log('📣 Broadcasting periodic score sync');

        // Generate a unique event ID to prevent duplicate processing
        const syncEventId = `sync-${now}-${Math.random().toString(36).substring(2, 9)}`;

        connectionManager.sendMessage({
          type: 'game_event',
          event: {
            event_type: 'game_score_update',
            source: 'periodic_sync',
            jackalopesScore: jackalopesScore,
            mercsScore: mercsScore,
            timestamp: now,
            shotId: syncEventId
          }
        });

        // Mark this sync as processed
        processedScoreUpdates.add(syncEventId);

        // Also broadcast via window event for cross-tab communication
        window.dispatchEvent(new CustomEvent('game_score_update', {
          detail: {
            source: 'periodic_sync',
            jackalopesScore: jackalopesScore,
            mercsScore: mercsScore,
            timestamp: now,
            shotId: `sync-window-${now}-${Math.random().toString(36).substring(2, 9)}`
          }
        }));
      }
    }, [jackalopesScore, mercsScore, enableMultiplayer, connectionManager]);

    // Add this effect to sync scores periodically
    useEffect(() => {
      // Set up periodic score sync to ensure all clients have latest scores
      const syncInterval = setInterval(syncScoresWithNetwork, 15000);

      return () => clearInterval(syncInterval);
    }, [syncScoresWithNetwork]);

    // Listen for timer reset events
    useEffect(() => {
      const handleTimerReset = (e: Event) => {
        const event = (e as CustomEvent).detail;
        if (!event || !event.id) return;

        console.log('⏱️ Received timer reset event from ScoreDisplay:', event);

        // Skip if we've already processed this reset
        if (processedScoreUpdates.has(event.id)) {
          return;
        }

        // Mark this reset as processed
        processedScoreUpdates.add(event.id);

        // Check if scores were updated recently
        const timeSinceLastScore = Date.now() - lastScoreTime.current;
        if (timeSinceLastScore > 5000 && (jackalopesScore > 0 || mercsScore > 0)) {
          // Reset scores if it's been more than 5 seconds since the last score update
          console.log('⏱️ Resetting scores from timer event');
          setJackalopesScore(0);
          setMercsScore(0);
          localStorage.setItem('jackalopes_score', '0');
          localStorage.setItem('mercs_score', '0');
          localStorage.setItem('scores_reset_time', Date.now().toString());

          // Broadcast score reset
          if (enableMultiplayer && connectionManager && connectionManager.isReadyToSend()) {
            const resetEventId = `reset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            connectionManager.sendMessage({
              type: 'game_event',
              event: {
                event_type: 'game_score_update',
                source: 'timer_reset',
                jackalopesScore: 0,
                mercsScore: 0,
                reset_time: Date.now(),
                timestamp: Date.now(),
                shotId: resetEventId
              }
            });

            // Mark this reset as processed
            processedScoreUpdates.add(resetEventId);
          }
        } else {
          console.log(`⏱️ Not resetting scores from timer event - scores were updated ${timeSinceLastScore}ms ago`);
        }
      };

      window.addEventListener('timer_reset', handleTimerReset as EventListener);

      return () => {
        window.removeEventListener('timer_reset', handleTimerReset as EventListener);
      };
    }, [jackalopesScore, mercsScore, enableMultiplayer, connectionManager]);

    // Initialize scores from localStorage
    useEffect(() => {
        try {
            const storedJackalopesScore = localStorage.getItem('jackalopes_score');
            const storedMercsScore = localStorage.getItem('mercs_score');

            if (storedJackalopesScore) {
                setJackalopesScore(parseInt(storedJackalopesScore, 10));
            }

            if (storedMercsScore) {
                setMercsScore(parseInt(storedMercsScore, 10));
            }

            console.log(`📊 Loaded scores from localStorage: Jackalopes ${storedJackalopesScore || 0}, Mercs ${storedMercsScore || 0}`);
        } catch (err) {
            console.error('Error loading scores from localStorage:', err);
        }

        // Add listeners for host-based score synchronization
        const handleHostScoreUpdate = (e: CustomEvent) => {
            if (!isHost) {
                console.log('📊 Received score update from host:', e.detail);
                setJackalopesScore(e.detail.jackalopesScore);
                setMercsScore(e.detail.mercsScore);
                lastScoreTime.current = e.detail.timestamp || Date.now();
            }
        };

        window.addEventListener('host_score_update', handleHostScoreUpdate as EventListener);

        return () => {
            window.removeEventListener('host_score_update', handleHostScoreUpdate as EventListener);
        };
    }, [isHost]);

    // Create network manager functions to expose in global scope
    const networkManager = {
      sendRespawnRequest: (playerId: string, spawnPosition?: [number, number, number]) => {
        if (connectionManager) {
          console.log(`[App] Sending respawn request for player ${playerId} with default spawn position [-100, 3, 10]`);
          connectionManager.sendRespawnRequest(playerId, spawnPosition);
        } else {
          console.error('[App] Cannot send respawn request: connectionManager is not initialized');
        }
      }
    };

    // Hook up respawn request function with optional spawn position to ConnectionManager
    const handleRespawnRequest = (playerId: string, spawnPosition?: [number, number, number]) => {
      if (!connectionManager) {
        console.error('[App] Cannot send respawn request: connectionManager not initialized');
        return;
      }

      const defaultSpawnPosition: [number, number, number] = [-100, 3, 10];

      // Use provided position or default
      const finalSpawnPosition = spawnPosition || defaultSpawnPosition;

      console.log(`[App] Sending respawn request with position [${finalSpawnPosition.join(', ')}]`);

      // Send the respawn request to server
      connectionManager.sendRespawnRequest(playerId, finalSpawnPosition);
    }

    // Make game properties accessible globally
    window.jackalopesGame = {
        playerType: playerCharacterInfo.type,
        levaPanelState: 'closed',
        flashlightOn: false,
        debugLevel: 1
    } as any; // Use type assertion to bypass type check

    // Create a jackalope spawn position manager
    if (typeof window !== 'undefined' && window.jackalopesGame && !window.jackalopesGame.spawnManager) {
        window.jackalopesGame.spawnManager = {
            baseSpawnX: -100,
            currentSpawnX: -100,
            stepSize: 50,
            minX: -500, // Changed from -50 to -500 to allow going further out
            getNextSpawnPoint: function(): [number, number, number] {
                // Adjust X to move further away by stepSize (subtract instead of add)
                this.currentSpawnX = Math.max(this.minX, this.currentSpawnX - this.stepSize);
                console.log(`🐰 [SpawnManager] Next spawn at X: ${this.currentSpawnX}`);
                return [this.currentSpawnX, 3, 10];
            },
            resetSpawnPoints: function() {
                console.log(`🐰 [SpawnManager] Resetting spawn positions to base X: ${this.baseSpawnX}`);
                this.currentSpawnX = this.baseSpawnX;
                return [this.currentSpawnX, 3, 10];
            },
            getSpawnPoint: function(): [number, number, number] {
                return [this.currentSpawnX, 3, 10];
            }
        };
    }

    // Set up player position tracker for third-person camera
    useEffect(() => {
        // Log when third-person view is activated or deactivated
        console.log(`Third-person view ${thirdPersonView ? 'enabled' : 'disabled'}`);

        // Reset camera position tracker when switching views
        if (!thirdPersonView && playerPosition.current) {
            // Reset to current position without interpolation to prevent glitches
            // when switching back to third-person view
            playerPosition.current.copy(
                playerRef.current?.rigidBody?.translation() ||
                new THREE.Vector3(0, 7, 10)
            );
        }
    }, [thirdPersonView, playerRef]);

    // Add state for intro screen visibility
    const [showIntroScreen, setShowIntroScreen] = useState(false);

    // Add effect to show intro screen when player type changes
    useEffect(() => {
        // Check if we've already shown the intro for this player type
        const introKey = `intro_shown_${playerCharacterInfo.type}`;
        const introShown = localStorage.getItem(introKey) === 'true';

        let timerId: ReturnType<typeof setTimeout>;

        if (!introShown && playerCharacterInfo.type) {
            console.log(`Showing intro screen for ${playerCharacterInfo.type}`);
            // Show intro after a short delay to let the game initialize
            timerId = setTimeout(() => {
                setShowIntroScreen(true);
            }, 1000);
        }

        return () => {
            if (timerId) clearTimeout(timerId);
        };
    }, [playerCharacterInfo.type]);

    // Function to handle closing the intro screen
    const handleCloseIntro = () => {
        setShowIntroScreen(false);

        // Remember that we've shown this intro
        if (playerCharacterInfo.type) {
            const introKey = `intro_shown_${playerCharacterInfo.type}`;
            localStorage.setItem(introKey, 'true');
        }
    };

    return (
        <>
            {/* Add styles to fix Leva panel positioning and prevent UI disruption */}
            <style>
                {`
                /* Fix positioning of Leva panel and ensure it doesn't disrupt other UI */
                #leva__root {
                    z-index: 2000 !important;
                    top: 10px !important;
                    right: 10px !important;
                }

                /* Ensure Leva panel has consistent width to prevent layout shifts */
                div[class*="leva-c-"][class*="titleRow"] {
                    min-width: 250px;
                }

                /* Make sure the panel doesn't overlap with important UI elements */
                div[class*="leva-c-"][class*="root"] {
                    max-height: 90vh !important;
                    overflow-y: auto !important;
                }

                /* Animation for the settings hint */
                @keyframes fadeInOut {
                    0% { opacity: 0; }
                    10% { opacity: 1; }
                    70% { opacity: 1; }
                    100% { opacity: 0; }
                }
                `}
            </style>

            {/* Remove model tester component */}
            {/* {showModelTester && <ModelTester />} */}

            <div style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'rgba(255, 255, 255, 0.75)',
                fontSize: '13px',
                fontFamily: 'monospace',
                userSelect: 'none',
                zIndex: 1000
            }}>
                <div style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    letterSpacing: '0.5px',
                    whiteSpace: 'nowrap'
                }}>
                    WASD to move | SPACE to jump | SHIFT to run
                    {thirdPersonView ? ' | Mouse to rotate camera | ESC to release mouse' : ''}
                </div>
            </div>

            {/* Only show ammo display for merc character */}
            {playerCharacterInfo.type === 'merc' && (
                <div id="ammo-display" style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    color: 'rgba(255, 255, 255, 0.75)',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    userSelect: 'none',
                    zIndex: 1000
                }}>
                    AMMO: 50/50
                </div>
            )}

            <Canvas>
                {fogEnabled && <fog attach="fog" args={[forceDarkLevel ? '#050a14' : (darkMode ? '#111111' : fogColor), forceDarkLevel ? fogNear * 0.5 : fogNear, forceDarkLevel ? (fogFar * 0.3) : (darkMode ? (fogFar * 0.5) : fogFar)]} />}
                <Environment
                    preset={forceDarkLevel ? "night" : "sunset"}
                    background
                    blur={forceDarkLevel ? 0.8 : 0.4} // Increased blur for dark level
                    resolution={globalQualityParams.environmentResolution} // Use quality-based resolution
                />

                {/* Add stars to night sky */}
                {(starsEnabled || darkMode || forceDarkLevel) && <Stars
                    count={forceDarkLevel ? 4000 : (darkMode ? Math.min(starsCount * 1.5, 3000) : starsCount)}
                    size={forceDarkLevel ? starsSize * 1.5 : (darkMode ? starsSize * 1.2 : starsSize)}
                    color={forceDarkLevel ? "#8abbff" : (darkMode ? "#c4e1ff" : starsColor)}
                    twinkle={starsTwinkle}
                    depth={forceDarkLevel ? 150 : (darkMode ? 120 : 100)} // Even deeper stars in force dark level
                />}

                {/* Add Stats Collector - must be inside Canvas */}
                <StatsCollector />

                <ambientLight intensity={forceDarkLevel ? 0.005 : (darkMode ? 0.02 : ambientIntensity)} />
                <directionalLight
                    castShadow
                    position={[-directionalDistance, directionalHeight, -directionalDistance]}
                    ref={directionalLightRef}
                    intensity={forceDarkLevel ? 0.02 : (darkMode ? 0.1 : directionalIntensity)}
                    shadow-mapSize={[globalQualityParams.shadowMapSize, globalQualityParams.shadowMapSize]}
                    shadow-camera-left={-80}
                    shadow-camera-right={80}
                    shadow-camera-top={80}
                    shadow-camera-bottom={-80}
                    shadow-camera-near={1}
                    shadow-camera-far={400}
                    shadow-bias={-0.001}
                    shadow-normalBias={0.05}
                    shadow-radius={highQualityShadows ? 1 : 2} // Softer shadows in low quality mode
                    color={forceDarkLevel ? "#5577aa" : "#fff"} // Bluish tint for dark level mode
                />

                {/* Only show moon if visibility is enabled */}
                {moonVisible && moonOrbit && <Moon
                    orbitRadius={Math.max(directionalDistance, 50)}
                    height={directionalHeight + 10}
                    orbitSpeed={moonOrbitSpeed}
                />}

                {/* Add MultiplayerSyncManager when multiplayer is enabled */}
                {enableMultiplayer && connectionManager && (
                    <MultiplayerSyncManager connectionManager={connectionManager} />
                )}

                {/* Screen shake effect */}
                <ScreenShake intensity={0.3} decay={8} />

                <Physics
                    debug={false}
                    paused={loading}
                    timeStep={1/240} // Increased physics rate to 240Hz for smoother movement
                    interpolate={true}
                    gravity={[0, -9.81, 0]}>
                    <PlayerControls thirdPersonView={enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView}>
                        {/* Conditionally render either the Player (merc) or Jackalope */}
                        {enableMultiplayer ? (
                            playerCharacterInfo.type === 'merc' ? (
                                <Player
                                    ref={playerRef}
                                    position={[10, 7, 10]}
                                    walkSpeed={0.02}
                                    runSpeed={0.025}
                                    jumpForce={jumpForce * 0.7}
                                    visible={playerCharacterInfo.thirdPerson}
                                    thirdPersonView={playerCharacterInfo.thirdPerson}
                                    playerType={playerCharacterInfo.type}
                                    connectionManager={enableMultiplayer ? connectionManager : undefined}
                                    onMove={(position) => {
                                        // Update player position for camera tracking
                                        if (playerPosition.current) {
                                            playerPosition.current.copy(position);
                                        }
                                        if (directionalLightRef.current && !playerCharacterInfo.thirdPerson) {
                                            const light = directionalLightRef.current;
                                            light.position.x = position.x + directionalDistance;
                                            light.position.z = position.z + directionalDistance;
                                            light.target.position.copy(position);
                                            light.target.updateMatrixWorld();
                                        }
                                    }}
                                />
                            ) : (
                                <Jackalope
                                    ref={playerRef}
                                    position={[-100, 7, 10]}
                                    walkSpeed={0.56}
                                    runSpeed={1.0}
                                    jumpForce={jumpForce * 0.8}
                                    visible={playerCharacterInfo.thirdPerson}
                                    thirdPersonView={playerCharacterInfo.thirdPerson}
                                    connectionManager={enableMultiplayer ? connectionManager : undefined}
                                    onMove={(position) => {
                                        // Update player position for camera tracking
                                        if (playerPosition.current) {
                                            playerPosition.current.copy(position);
                                        }
                                        if (directionalLightRef.current && !playerCharacterInfo.thirdPerson) {
                                            const light = directionalLightRef.current;
                                            light.position.x = position.x + directionalDistance;
                                            light.position.z = position.z + directionalDistance;
                                            light.target.position.copy(position);
                                            light.target.updateMatrixWorld();
                                        }
                                    }}
                                />
                            )
                        ) : (
                            characterType === 'merc' ? (
                                <Player
                                    ref={playerRef}
                                    position={[10, 7, 10]}
                                    walkSpeed={0.02}
                                    runSpeed={0.025}
                                    jumpForce={jumpForce * 0.7}
                                    visible={thirdPersonView}
                                    thirdPersonView={thirdPersonView}
                                    playerType={characterType}
                                    connectionManager={enableMultiplayer ? connectionManager : undefined}
                                    onMove={(position) => {
                                        if (directionalLightRef.current && !thirdPersonView) {
                                            // Only update light directly in first-person mode
                                            // In third-person, StableLightUpdater handles it
                                            const light = directionalLightRef.current;
                                            light.position.x = position.x + directionalDistance;
                                            light.position.z = position.z + directionalDistance;
                                            light.target.position.copy(position);
                                            light.target.updateMatrixWorld();
                                        }
                                    }}
                                />
                            ) : (
                                <Jackalope
                                    ref={playerRef}
                                    position={[-100, 7, 10]} // Different spawn position for jackalope
                                    walkSpeed={0.56}
                                    runSpeed={1.0}
                                    jumpForce={jumpForce * 0.8}
                                    visible={thirdPersonView}
                                    thirdPersonView={thirdPersonView}
                                    connectionManager={enableMultiplayer ? connectionManager : undefined}
                                    onMove={(position) => {
                                        if (directionalLightRef.current && !thirdPersonView) {
                                            // Only update light directly in first-person mode
                                            // In third-person, StableLightUpdater handles it
                                            const light = directionalLightRef.current;
                                            light.position.x = position.x + directionalDistance;
                                            light.position.z = position.z + directionalDistance;
                                            light.target.position.copy(position);
                                            light.target.updateMatrixWorld();
                                        }
                                    }}
                                />
                            )
                        )}
                    </PlayerControls>
                    <Platforms />

                    <Scene playerRef={playerRef} />

                    {/* Show SphereTool only for merc character - jackalobes don't shoot */}
                    {(enableMultiplayer ? playerCharacterInfo.type === 'merc' : characterType === 'merc') && (
                        <SphereTool
                            onShoot={enableMultiplayer ?
                                (origin, direction) => {
                                    console.log('App: onShoot called with', { origin, direction });
                                    try {
                                        connectionManager.sendShootEvent(origin, direction);
                                        console.log('App: successfully sent shoot event');
                                    } catch (error) {
                                        console.error('App: error sending shoot event:', error);
                                    }
                                }
                                : undefined
                            }
                            remoteShots={remoteShots}
                            thirdPersonView={enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView}
                            playerPosition={enableMultiplayer ?
                                (playerCharacterInfo.thirdPerson ? playerPosition.current : null) :
                                (thirdPersonView ? playerPosition.current : null)}
                        />
                    )}

                    {/* Use enableMultiplayer instead of showMultiplayerTools for the actual multiplayer functionality */}
                    {enableMultiplayer && playerRefReady && (
                        <MultiplayerManager
                            localPlayerRef={playerRef}
                            connectionManager={connectionManager}
                        />
                    )}
                </Physics>

                {/* Only use this fallback camera when NO player FPS camera is active */}
                <PerspectiveCamera
                    makeDefault={enableMultiplayer ? false : !thirdPersonView}
                    position={[0, 10, 10]}
                    rotation={[0, 0, 0]}
                    near={0.1}
                    far={500}
                    fov={90}
                />

                {/* Add third-person camera when needed */}
                {(enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView) && (
                    <PerspectiveCamera
                        ref={thirdPersonCameraRef}
                        makeDefault
                        position={[0, cameraHeight, cameraDistance]}
                        near={0.1}
                        far={500} // Increased far plane
                        fov={75}
                    />
                )}

                {/* Add simplified ThirdPersonCameraControls */}
                {(enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView) && playerPosition.current && (
                    <ThirdPersonCameraControls
                        player={playerPosition.current}
                        cameraRef={thirdPersonCameraRef}
                        enabled={enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView}
                        distance={cameraDistance}
                        height={cameraHeight}
                        invertY={invertYAxis}
                    />
                )}

                {/* Simplified - just add StableLightUpdater once */}
                <StableLightUpdater />

                {/* Add position tracker component */}
                <PlayerPositionTracker playerRef={playerRef} playerPosition={playerPosition} />

                {/* Add MoonOrbit component if orbiting is enabled */}
                {moonOrbit && <MoonOrbit />}

                {/* Add WeaponSoundEffects component if player is merc */}
                {(enableMultiplayer ? playerCharacterInfo.type === 'merc' : characterType === 'merc') && (
                    <WeaponSoundEffects />
                )}

                {enablePostProcessing && globalQualityParams.effectsEnabled && (
                    <EffectComposer>
                        {bloomEnabled ? (
                            <Bloom
                                intensity={forceDarkLevel ? bloomIntensity * 4.0 : (darkMode ? bloomIntensity * 2.0 : bloomIntensity)}
                                luminanceThreshold={forceDarkLevel ? 0.01 : (darkMode ? 0.03 : bloomLuminanceThreshold)}
                                luminanceSmoothing={forceDarkLevel ? 0.5 : (darkMode ? 0.7 : 0.9)}
                                mipmapBlur={globalQualityParams.bloomQuality !== 'low'}
                            />
                        ) : <></>}
                        <Vignette
                            offset={vignetteEnabled ? (forceDarkLevel ? 0.0 : (darkMode ? 0.1 : vignetteOffset)) : 0}
                            darkness={vignetteEnabled ? (forceDarkLevel ? 0.98 : (darkMode ? 0.95 : vignetteDarkness)) : 0}
                            eskil={false}
                        />
                        <ChromaticAberration
                            offset={new THREE.Vector2(
                                chromaticAberrationEnabled ? (forceDarkLevel ? chromaticAberrationOffset * 2 : chromaticAberrationOffset) : 0,
                                chromaticAberrationEnabled ? (forceDarkLevel ? chromaticAberrationOffset * 2 : chromaticAberrationOffset) : 0
                            )}
                            radialModulation={false}
                            modulationOffset={0}
                        />
                        <BrightnessContrast
                            brightness={brightnessContrastEnabled ? (forceDarkLevel ? -0.95 : (darkMode ? -0.9 : brightness)) : 0}
                            contrast={brightnessContrastEnabled ? (forceDarkLevel ? 0.6 : (darkMode ? 0.4 : contrast)) : 0}
                        />
                        <ToneMapping
                            blendFunction={BlendFunction.NORMAL}
                            mode={toneMapping}
                        />
                    </EffectComposer>
                )}

                {/* Add the SoundProcessor component inside Canvas */}
                <SoundProcessor />
                <ModelPreloader />
            </Canvas>

            {/* Old crosshair replaced by GameCrosshair in HUD section above */}

            {/* Stats Display - must be outside Canvas */}
            <StatsDisplay />

            {/* Add NetworkStats component - only affects UI visibility */}
            {showMultiplayerTools && enableMultiplayer && (
                <NetworkStats connectionManager={connectionManager} visible={true} />
            )}

            {showMultiplayerTools && showDebug && connectionManager && (
                <MultiplayerDebugPanel
                    connectionManager={connectionManager}
                    visible={showMultiplayerTools}
                    isOfflineMode={connectionManager?.isOfflineMode?.() || false}
                    setPlayerCharacterInfo={setPlayerCharacterInfo}
                />
            )}

            {showMultiplayerTools && showDebug && connectionManager &&
              // Check if snapshots exist on connectionManager before using them
              'snapshots' in connectionManager && 'getSnapshotAtTime' in connectionManager && (
                <SnapshotDebugOverlay
                    snapshots={(connectionManager as any).snapshots}
                    getSnapshotAtTime={(connectionManager as any).getSnapshotAtTime}
                />
            )}

            {/* Offline Mode Notification - tied to enableMultiplayer for functionality, showMultiplayerTools for visibility */}
            {enableMultiplayer && showMultiplayerTools && showOfflineNotification && (
                <div style={{
                    position: 'fixed',
                    top: '50px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#f44336',
                    color: 'white',
                    padding: '10px 15px',
                    borderRadius: '4px',
                    zIndex: 2000,
                    fontSize: '14px',
                    textAlign: 'center',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    maxWidth: '80%'
                }}>
                    <p style={{ margin: '0', fontWeight: 'bold' }}>
                        Server connection failed. Running in offline mode.
                    </p>
                    <p style={{ margin: '5px 0 0', fontSize: '12px' }}>
                        Cross-browser shots are enabled using localStorage
                    </p>
                </div>
            )}

            {/* Lobby Full Notification */}
            {enableMultiplayer && connectionManager?.isLobbyFull?.() && (
                <div style={{
                    position: 'fixed',
                    top: showOfflineNotification ? '110px' : '50px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    padding: '10px 15px',
                    borderRadius: '4px',
                    zIndex: 2000,
                    fontSize: '14px',
                    textAlign: 'center',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    maxWidth: '80%'
                }}>
                    <p style={{ margin: '0', fontWeight: 'bold' }}>
                        Lobby Full: Maximum of 4 players reached
                    </p>
                    <p style={{ margin: '5px 0 0', fontSize: '12px' }}>
                        You can still play, but team balancing may be affected
                    </p>
                </div>
            )}

            {/* Remove the redundant Instructions component */}
            {/* Pass the shared connection manager to ConnectionTest */}
            {showConnectionTest && (
                <ConnectionTest sharedConnectionManager={connectionManager} />
            )}

            {/* Add debugging panel for multiplayer testing - only affects UI visibility */}
            {showMultiplayerTools && enableMultiplayer && (
                <MultiplayerDebugPanel
                    connectionManager={connectionManager}
                    visible={true}
                    isOfflineMode={isOfflineMode}
                    setPlayerCharacterInfo={setPlayerCharacterInfo}
                />
            )}

            {/* Add Audio Controller */}
            <AudioController />

            {/* Add Virtual Gamepad */}
            <VirtualGamepad
                visible={showVirtualGamepad}
                onMove={handleVirtualMove}
                onJump={handleVirtualJump}
                onShoot={handleVirtualShoot}
            />

            {/* Mobile detected indicator */}
            {isMobile && (
                <div style={{
                    position: 'fixed',
                    top: '10px',
                    left: '10px',
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    zIndex: 1000
                }}>
                    Mobile device detected
                </div>
            )}

            {/* Debug indicator for player character assignment - removed */}

            {/* Add Leva panel with hidden prop to keep it completely hidden until 'O' key is pressed */}
            <Leva
                hidden={!levaVisible}
                collapsed={true}
                titleBar={{ title: "Game Settings", filter: true }}
                theme={{
                    sizes: { rootWidth: "280px" },
                    colors: {
                        highlight1: '#ff9800',
                        highlight2: '#ff7043',
                        highlight3: '#ffab91'
                    }
                }}
                fill={false}
                flat={false}
                oneLineLabels={false}
            />

            {/* Add the flashlight UI component */}
            <FlashlightUI />

            {/* Add Settings Hint */}
            {!levaVisible && (
                <div style={{
                    position: 'fixed',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    animation: 'fadeInOut 5s forwards',
                }}>
                    Press 'O' for Settings
                </div>
            )}

            {/* Game HUD - top center scoreboard */}
            <GameHUD
                jackalopesScore={jackalopesScore}
                mercsScore={mercsScore}
                playerType={playerCharacterInfo.type}
                isHost={isHost}
                matchStartTime={matchTimerData?.matchStartTime}
                matchDuration={matchTimerData?.matchDuration}
                serverTime={matchTimerData?.serverTime}
                onTimerEnd={handleRoundEnd}
            />

            {/* Crosshair for mercs */}
            {playerCharacterInfo.type === 'merc' && !gameOver && (
                <GameCrosshair hitMarker={hitMarker} size={28} />
            )}

            {/* Kill feed */}
            <KillFeed />

            {/* Add AudioToggleButton for easy audio control - custom positioning when virtual gamepad is shown */}
            {showVirtualGamepad ? (
                <div style={{
                    position: 'fixed',
                    right: '5px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 1000
                }}>
                    <AudioToggleButton />
                </div>
            ) : (
                <AudioToggleButton position="bottom-right" />
            )}

            {/* Jackalope Logo Link */}
            <a
                href="https://jackalope.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    position: 'fixed',
                    top: '15px',
                    left: '15px',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s ease',
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                <svg className="h-8 w-8 mr-2 p-1" height="28" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 33" style={{ fill: 'white', opacity: 0.5 }}>
                    <path d="M12.7 14.6c-2 0-3.9.3-5.8 1.2-2.1 1-3.2 3.4-4.2 5.4-.3.8-.5 1.7-.7 2.5-.1.9.1 1.8-.1 2.7-2.4-.4-1.2 5.9.6 4.1-.2 1.5.6 1.6 1.7 1.1 1-.5 1.9-.6 3-.8.8-.1.7-.2 1.1-.8.1-.3.6-1 1.1-.7.6.3-.2 2.1-.1 2.8.1 1.1 1.2.7 2.2.8.9 0 1.8.2 2.7.1.5 0 1.1 0 1.4-.4.3-.5.1-1-.2-1.3-.7-.5-1.9-.3-2.8-.2-1.2.1-1.9-.2-1.4-1.5.4-1 .9-1.9 1.3-2.8.4-1 .3-2.4 1.6-2.1 1.4.4 1.5 1.2 1.7 2.5.3 1.4 1.2 5.6 3.1 5.1.2 0 .2-.7.4-.9.3 0 .6.6 1 .6.8-.2.5-.5.1-1-.9-1.1-.9-1.9-1.1-3.2-.2-1.1-.9-2.4-.8-3.4 0-1 1.3-1.6 2-2.2.9-.8 1.4-1.6 1.7-2.7.1-.5.2-1.2.6-1.5.4-.3.9 0 1.3-.1.9-.1 1.9-.6 2-1.6.1-1.1-.5-1.9-.5-2.8 0-.8.4-.8-.3-1.4-.4-.3-1-.4-.8-1 .1-.5.8-1.3 1.2-1.6.4-.4.7-.8 1.1-1.2.9-1 2-.5 3.1-1.9-.7-.2-1.8 1.4-2.2.5-.2-.5.7-2.5 1.1-3 .5-1 1.4-1.9 0-3.8-.2.9.1 1.1-.1 2.1-.2 1.1-.7 2-1.4 2.9-.6 1-1.2 2-1.7 3.1-.3.5-1.2 2.6-1.9 2.7-1 .1 0-2.3.2-2.9.4-1.1.8-2.1 1-3.2.1-.9.5-2.3 0-3.2-.5-1-2-1.1-2.5 0-.8 1.8 1 4.7-.2 6.3-1 1.4-1-1-.9-1.6.2-1.1-.5-1.7-.7-2.9-.1-.6-.1-1.3-.2-1.9-.4.4-.5 1-.4 1.4-.5.1-.7-.6-1.1-.8-.5-.2-1.1 0-1.4.3-.9.7-.4 2.1-.1 3 .4 1.1.7 2.1 1.1 3.2.5 1.1 1.2 2.1 1.6 3.2.3 1-.6 2.2-1.6 2.3"></path>
                </svg>
            </a>

            {/* Bonsai Logo Link */}
            <a
                href="https://bonsai.so"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    position: 'fixed',
                    top: '15px',
                    right: '15px',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s ease',
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                <svg className="h-8 w-8 mr-3" viewBox="0 0 731 731.2" style={{ fill: 'white', opacity: 0.5, height: '28px' }}>
                    <path d="M647.1 172.7L396 27.7a56.727 56.727 0 0 0-56.9 0l-251 144.9c-17.6 10.2-28.4 28.9-28.4 49.3v289.9c0 20.3 10.8 39.1 28.4 49.3l251 144.9c17.6 10.2 39.3 10.2 56.9 0l251-144.9c17.6-10.2 28.4-28.9 28.4-49.3V222c.1-20.4-10.7-39.2-28.3-49.3zM542.6 447.1c-14.9 16.8-41.5 14.9-52.4 4.3-4.9 2.8-17.9 9.7-31.2 8.3l-96.7 55.5c-1.3.8-2.9 1.2-4.4 1.2h-48.6c-2.5 0-3.4-3.3-1.2-4.6l107.7-62.7c9.7-5.7 9.7-19.7 0-25.4l-41-23.9-32.1-4.7s-98.3 28.5-133.9 12.2c-35.5-16.3-45 0-45 0s-15 13-37.5 3.1c-11.4-15.9 0-25.6 15.2-20.4-1.8-10.1 7.4-13 14.9-20.5-9.1-1.4-7.5-14.2-10.3-22.9-10.4-12.5-1.4-29.1 10.3-29.1-5.7-29.8 11.9-31.6 30-27.7 2.2-28.4 22.6-42.9 52.6-29.9-4.2-41.7 47.8-26 47.8-26s-16-15.5-2.8-26c13.1-10.5 18 0 18 0 16.6-19.5 49.5-4.7 51.2 8.7 1.3-4.6 20.6-4.2 20.6-4.2 36.5-28.2 79.4-4.5 75.3 17.2 63.3-24.8 54.8 56.4 54.8 56.4 14.8-13.5 13.8.6 27.8 8.7 34.9 10.4 19.4 23.5 19.4 23.5 37.7-7.1 59.3 19.9 44 41.1 18.4 11.9 17.9 25 10.5 33.6 6.6 7.2 7.9 19.3-2.8 32.5 4 29.4-28.1 33.4-60.2 21.7z"></path>
                </svg>
            </a>

            {/* Add IntroScreen */}
            <IntroScreenManager
                playerType={playerCharacterInfo.type}
            />

            {/* Game Over screen */}
            <GameOverScreen
                visible={gameOver}
                jackalopesScore={jackalopesScore}
                mercsScore={mercsScore}
                playerType={playerCharacterInfo.type}
                onPlayAgain={handlePlayAgain}
            />
        </>
    );
}

export default App