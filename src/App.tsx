import { adventureCombatState } from './game/adventure-combat-state'
import { AdventureCombat } from './game/AdventureCombat'
import { Canvas, compatibilityMode } from './common/components/canvas'
import { Crosshair } from './common/components/crosshair'
import { Instructions } from './common/components/instructions'
import { Environment, MeshReflectorMaterial, PerspectiveCamera, OrbitControls, useProgress } from '@react-three/drei'
import { EffectComposer, Vignette, ChromaticAberration, BrightnessContrast, ToneMapping, Bloom } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
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
import { FoliageGrove } from './game/FoliageGrove';
import { waterslideState } from './game/waterslide-state';
import { caveLayout, isWithinCaveFootprint } from './game/adventure-caves';
import { loadTerrainLevel } from './game/terrain/level-document';
import { GROVE_STORAGE_KEY } from './game/foliage-grove';
import { AdventureAtmosphere } from './game/AdventureAtmosphere';
import { AdventureLighting } from './game/AdventureLighting';
import { GoldenMushroom } from './game/GoldenMushroom';
import { HolographicVision } from './game/HolographicVision';
import { HolographicSenseHUD } from './components/HolographicSenseHUD';
import { GOLDEN_VISION_DURATION_MS } from './game/golden-mushroom';
import { MushroomField } from './game/MushroomField'
import { GoldenEggField } from './game/GoldenEggField'
import { RainbowEggField } from './game/RainbowEggField'
import { GreenEggField } from './game/GreenEggField'
import { CloudPath } from './game/CloudPath'
import { MultiplayerManager, useRemoteShots } from './network/MultiplayerManager'
import { NetworkStats } from './network/NetworkStats'
import { ConnectionManager } from './network/ConnectionManager'
import { ConnectionTest } from './components/ConnectionTest'
import { VirtualGamepad } from './components/VirtualGamepad'
import { RemotePlayer } from './game/RemotePlayer'
import { WeaponSoundEffects } from './components/WeaponSoundEffects' // Import the WeaponSoundEffects component
import { HealthBar } from './components/HealthBar' // Import the HealthBar component
import { AudioCommsPanel } from './components/AudioCommsPanel'
import { FlashlightPickup } from './components/FlashlightPickup'
import { DronePickup } from './components/DronePickup'
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
import { IntroScreenManager } from './components/IntroScreen';
import { GameOverScreen } from './components/GameOverScreen';
import { Crosshair as GameCrosshair } from './components/Crosshair';
import { KillFeed, emitKillFeed } from './components/KillFeed';
import { GameHUD } from './components/GameHUD';
import { ScreenShake, triggerScreenShake } from './components/ScreenShake';
import { RespawnButton } from './components/RespawnButton';
import { MercDrone } from './game/MercDrone';
import { GameModeMenu } from './components/GameModeMenu';
import { SwimmingHUD } from './components/SwimmingHUD';
import { AdventureHUD } from './components/AdventureHUD';
import { getGameModeFromUrl, type GameMode } from './game/game-mode';
import { consumeTouchLookDelta } from './common/touch-input';
import { getActiveGamepad } from './common/hooks/use-gamepad';

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
            gameMode?: GameMode;
            playerType?: 'merc' | 'jackalope';
            levaPanelState?: 'open' | 'closed';
            flashlightOn?: boolean; // Add flashlight state
            flashlightCollected?: boolean;
            droneCollected?: boolean;
            droneActive?: boolean;
            dronePickupNearby?: boolean;
            dronePosition?: [number, number, number];
            droneRotation?: [number, number, number, number];
            droneThermalActive?: boolean;
            debugLevel?: number; // Store debug level
            inventory?: {
                goldenEggs: number;
                rainbowEggs: number;
                greenNightVision: boolean;
            };
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

const Scene = ({ playerRef, enabled = true }: { playerRef: React.RefObject<any>, enabled?: boolean }) => {
    // Remove texture loading and replace with solid colors
    // const texture = useTexture('/final-texture.png')
    // texture.wrapS = texture.wrapT = THREE.RepeatWrapping

    // Ground color
    const groundColor = new THREE.Color('#575757')

    // Updated map dimensions for the base ground to match platforms.tsx
    const mapWidth = 800
    const mapDepth = 800

    if (!enabled) return null

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
    adventureCaves = false,
    shoulderView = false,
    invertY = false, // Add invert Y option with default = false
}: {
    player: THREE.Vector3,
    cameraRef: React.RefObject<THREE.PerspectiveCamera>,
    enabled: boolean,
    distance: number,
    height: number,
    invertY?: boolean,
    adventureCaves?: boolean,
    shoulderView?: boolean,
}) => {
    // For tracking target position and rotation
    const targetRef = useRef(new THREE.Vector3());
    const cave = useMemo(() => caveLayout(loadTerrainLevel()), []);
    const caveRoot = useRef<THREE.Object3D | null>(null);
    const caveSolids = useRef<THREE.Object3D[]>([]);
    const cameraRay = useMemo(() => new THREE.Raycaster(), []);
    const rayDirection = useMemo(() => new THREE.Vector3(), []);
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
        const requestPointerLock = (event?: MouseEvent) => {
            // Touch look works without pointer lock, which iPad Safari does not provide.
            if (!document.body.requestPointerLock || navigator.maxTouchPoints > 0 ||
                (event?.target instanceof Element && event.target.closest('button, a, input, [data-touch-controls]'))) return;
            Promise.resolve(document.body.requestPointerLock()).catch(() => {});
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
                requestPointerLock();
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
    useFrame((state, delta) => {
        if (!enabled || !cameraRef.current) return;

        if (adventureCaves && waterslideState.active) {
            const yawDifference = Math.atan2(Math.sin(waterslideState.heading - rotationRef.current.y), Math.cos(waterslideState.heading - rotationRef.current.y));
            rotationRef.current.y += yawDifference * Math.min(1, delta * 7);
            rotationRef.current.x *= Math.max(0, 1 - delta * 5);
        }
        const touchLook = consumeTouchLookDelta();
        rotationRef.current.y -= touchLook.x * 0.003;
        rotationRef.current.x = THREE.MathUtils.clamp(rotationRef.current.x + touchLook.y * (invertY ? -0.003 : 0.003), -Math.PI / 3, Math.PI / 3);

        // Gamepad right stick camera control
        const gamepad = getActiveGamepad();
        if (gamepad) {
            const STICK_DEADZONE = 0.15;
            const CAMERA_SENSITIVITY_X = 0.05;
            const CAMERA_SENSITIVITY_Y = 0.035;

            const rawRightX = gamepad.axes[2] ?? 0;
            const rawRightY = gamepad.axes[3] ?? 0;
            const rightX = Math.abs(rawRightX) > STICK_DEADZONE ? rawRightX : 0;
            const rightY = Math.abs(rawRightY) > STICK_DEADZONE ? rawRightY : 0;

            if (rightX !== 0 || rightY !== 0) {
                // Update rotation based on right stick
                rotationRef.current.y -= rightX * CAMERA_SENSITIVITY_X;

                // Apply Y rotation with or without inversion
                if (invertY) {
                    rotationRef.current.x -= rightY * CAMERA_SENSITIVITY_Y;
                } else {
                    rotationRef.current.x += rightY * CAMERA_SENSITIVITY_Y;
                }

                // Clamp vertical rotation
                rotationRef.current.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, rotationRef.current.x));
            }
        }

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

                const underground = adventureCaves && player.y < cave.entranceY + 0.5 &&
                    isWithinCaveFootprint(player.x, player.z);
                const followDistance = shoulderView ? (underground ? 4 : 6) : underground ? Math.min(distance, 5) : distance;
                const followHeight = shoulderView ? 1 : underground ? Math.min(height, 1.8) : height;
                // A closer underground camera fits tunnels; shell raycasts keep it inside rock.
                const cameraOffset = new THREE.Vector3(
                    Math.sin(rotationRef.current.y) * followDistance,
                    followHeight + Math.sin(rotationRef.current.x) * followDistance,
                    Math.cos(rotationRef.current.y) * followDistance
                );

                if (shoulderView) {
                    cameraOffset.x += Math.cos(rotationRef.current.y) * .9;
                    cameraOffset.z -= Math.sin(rotationRef.current.y) * .9;
                }
                // Balance camera smoothness and responsiveness
                const newCamPos = new THREE.Vector3().copy(targetRef.current).add(cameraOffset);
                const cameraSmoothing = isJackalope ?
                    Math.min(delta * 25.0, 0.6) : // Responsive but still smooth for jackalope
                    Math.min(delta * 8.0, 0.4);   // Normal responsiveness for merc

                const constrainToCave = (candidate: THREE.Vector3) => {
                    if (!underground) return;
                    if (!caveRoot.current?.parent) {
                        caveRoot.current = state.scene.getObjectByName('adventure-caves') || null;
                        caveSolids.current = [];
                        caveRoot.current?.traverse(object => {
                            if (object.userData.caveSolid) caveSolids.current.push(object);
                        });
                    }
                    const length = rayDirection.copy(candidate).sub(targetRef.current).length();
                    if (length < 0.01) return;
                    cameraRay.set(targetRef.current, rayDirection.divideScalar(length));
                    cameraRay.far = length;
                    const hit = cameraRay.intersectObjects(caveSolids.current, false)[0];
                    if (hit) candidate.copy(targetRef.current).addScaledVector(rayDirection, Math.max(0.25, hit.distance - 0.25));
                };
                constrainToCave(newCamPos);
                cameraRef.current.position.lerp(newCamPos, cameraSmoothing);
                constrainToCave(cameraRef.current.position);

                // Look at player
                if (shoulderView) {
                    rayDirection.set(-Math.sin(rotationRef.current.y) * Math.cos(rotationRef.current.x), -Math.sin(rotationRef.current.x), -Math.cos(rotationRef.current.y) * Math.cos(rotationRef.current.x));
                    cameraRef.current.lookAt(rayDirection.multiplyScalar(40).add(cameraRef.current.position));
                } else cameraRef.current.lookAt(targetRef.current);
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

const MercFlashblindOverlay = ({ until }: { until: number }) => {
    const [now, setNow] = useState(Date.now())

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 50)
        return () => clearInterval(interval)
    }, [])

    const remaining = Math.max(0, until - now)
    if (remaining <= 0) return null

    const progress = remaining / 5000
    const opacity = 0.15 + progress * 0.85

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            pointerEvents: 'none',
            background: `rgba(255,255,255,${opacity})`,
            transition: 'background 50ms linear',
            boxShadow: 'inset 0 0 80px rgba(255,255,255,0.95)',
        }} />
    )
}

const NightVisionOverlay = ({ active }: { active: boolean }) => {
    const [noiseTick, setNoiseTick] = useState(0)
    const [blowout, setBlowout] = useState(0)

    useEffect(() => {
        if (!active) {
            setNoiseTick(0)
            return
        }

        const interval = window.setInterval(() => setNoiseTick(Date.now()), 75)
        return () => window.clearInterval(interval)
    }, [active])

    useEffect(() => {
        if (!active) {
            setBlowout(0)
            return
        }

        let frameId = 0
        const localTarget = new THREE.Vector3()
        const mercOrigin = new THREE.Vector3()
        const samplePoint = new THREE.Vector3()
        const toSample = new THREE.Vector3()
        const beamDirection = new THREE.Vector3()
        const sampleHeights = [2.8, 4.6, 6.2]

        const evaluate = () => {
            const liveData = (window as any).__livePlayerData || {}
            const localPos = window.__localPlayerPosition
            let strongestHit = 0

            if (localPos) {
                localTarget.set(localPos.x, localPos.y ?? 0, localPos.z)

                for (const player of Object.values(liveData) as Array<any>) {
                    if (player?.playerType !== 'merc' || !player?.flashlightOn || !player?.position) continue

                    mercOrigin.set(
                        player.position.x,
                        (player.position.y ?? 0) + 6,
                        player.position.z
                    )

                    beamDirection.set(
                        Math.sin(player.rotation || 0) * Math.cos(player.cameraPitch || 0),
                        -Math.sin(player.cameraPitch || 0),
                        Math.cos(player.rotation || 0) * Math.cos(player.cameraPitch || 0)
                    ).normalize()

                    for (const height of sampleHeights) {
                        samplePoint.set(localTarget.x, localTarget.y + height, localTarget.z)
                        toSample.copy(samplePoint).sub(mercOrigin)

                        const alongBeam = toSample.dot(beamDirection)
                        if (alongBeam <= 0.5 || alongBeam > 55) continue

                        const distanceSq = toSample.lengthSq()
                        const perpendicularSq = Math.max(0, distanceSq - alongBeam * alongBeam)
                        const perpendicular = Math.sqrt(perpendicularSq)
                        const coneRadius = Math.max(1.2, Math.tan(0.72) * alongBeam)
                        if (perpendicular > coneRadius) continue

                        const centerFactor = THREE.MathUtils.clamp(1 - perpendicular / Math.max(0.8, coneRadius * 0.42), 0, 1)
                        const distanceFactor = THREE.MathUtils.clamp(1 - (alongBeam - 4) / 34, 0, 1)
                        const candidate = centerFactor * distanceFactor

                        if (candidate > strongestHit) {
                            strongestHit = candidate
                        }
                    }
                }
            }

            setBlowout(prev => {
                const next = THREE.MathUtils.lerp(prev, strongestHit, strongestHit > prev ? 0.42 : 0.22)
                return Math.abs(next - prev) < 0.005 ? prev : next
            })

            frameId = window.requestAnimationFrame(evaluate)
        }

        frameId = window.requestAnimationFrame(evaluate)
        return () => window.cancelAnimationFrame(frameId)
    }, [active])

    if (!active) return null

    const grainOffsetA = `${(noiseTick * 0.11) % 37}px ${(noiseTick * 0.07) % 29}px`
    const grainOffsetB = `${(noiseTick * -0.08) % 31}px ${(noiseTick * 0.13) % 41}px`
    const baseTintOpacity = 0.22 + blowout * 0.08
    const grainOpacity = 0.12 + blowout * 0.16
    const blowoutOpacity = Math.min(1, blowout * 1.15)

    return (
        <>
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 4800,
                pointerEvents: 'none',
                background: `radial-gradient(circle at center, rgba(72, 110, 72, ${baseTintOpacity}) 0%, rgba(18, 34, 18, ${baseTintOpacity + 0.16}) 55%, rgba(2, 6, 2, ${Math.min(0.88, baseTintOpacity + 0.42)}) 100%)`,
                boxShadow: `inset 0 0 160px rgba(4, 10, 4, ${0.86 - blowout * 0.18})`,
            }} />
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 4801,
                pointerEvents: 'none',
                opacity: grainOpacity,
                backgroundImage: `
                    repeating-linear-gradient(0deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 3px),
                    repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 2px),
                    repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 4px)
                `,
                backgroundSize: '3px 3px, 2px 2px, 4px 4px',
                backgroundPosition: `${grainOffsetA}, ${grainOffsetB}, 0px 0px`,
                mixBlendMode: 'screen',
            }} />
            <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 4802,
                pointerEvents: 'none',
                opacity: blowoutOpacity,
                transition: 'opacity 50ms linear',
                background: `radial-gradient(circle at center, rgba(255,255,250, ${0.74 + blowout * 0.22}) 0%, rgba(245,255,235, ${0.36 + blowout * 0.28}) 22%, rgba(210,255,210, 0.18) 46%, rgba(255,255,255,0) 78%)`,
                boxShadow: `inset 0 0 ${180 + blowout * 220}px rgba(255,255,240, ${0.22 + blowout * 0.58})`,
            }} />
        </>
    )
}

    // Create a new component for the flashlight UI indicator
    const FlashlightUI = () => {
        const [isOn, setIsOn] = useState(false);
        const [visible, setVisible] = useState(false);
        const [collected, setCollected] = useState(false);
        const [hint, setHint] = useState('');
        const [nearPickup, setNearPickup] = useState(false);

        useEffect(() => {
            if (window.jackalopesGame?.flashlightOn !== undefined) {
                setIsOn(window.jackalopesGame.flashlightOn);
            }
            setCollected(!!window.jackalopesGame?.flashlightCollected);
            setVisible(window.jackalopesGame?.playerType === 'merc');

            const handleFlashlightToggle = (event: CustomEvent<{isOn: boolean}>) => {
                setIsOn(event.detail.isOn);
            };

            const handlePlayerTypeChange = () => {
                setVisible(window.jackalopesGame?.playerType === 'merc');
            };

            const handlePickupChanged = (event: CustomEvent<{collected: boolean}>) => {
                setCollected(event.detail.collected);
                if (!event.detail.collected) {
                    setIsOn(false);
                }
            };

            const handleBlocked = () => {
                setHint('Find the flashlight first');
                window.setTimeout(() => setHint(''), 1400);
            };

            const handlePickupNearby = (event: CustomEvent<{nearby: boolean, playerType?: string}>) => {
                const isMercNearby = event.detail.playerType === 'merc' || event.detail.playerType === undefined;
                setNearPickup(isMercNearby && event.detail.nearby);
            };

            window.addEventListener('flashlightToggled', handleFlashlightToggle as EventListener);
            window.addEventListener('playerTypeChanged', handlePlayerTypeChange);
            window.addEventListener('flashlightPickupChanged', handlePickupChanged as EventListener);
            window.addEventListener('flashlightToggleBlocked', handleBlocked as EventListener);
            window.addEventListener('flashlightPickupNearby', handlePickupNearby as EventListener);

            return () => {
                window.removeEventListener('flashlightToggled', handleFlashlightToggle as EventListener);
                window.removeEventListener('playerTypeChanged', handlePlayerTypeChange);
                window.removeEventListener('flashlightPickupChanged', handlePickupChanged as EventListener);
                window.removeEventListener('flashlightToggleBlocked', handleBlocked as EventListener);
                window.removeEventListener('flashlightPickupNearby', handlePickupNearby as EventListener);
            };
        }, []);

        if (!visible) return null;

        const label = collected ? `Flashlight: ${isOn ? 'ON' : 'OFF'} [F / X]` : 'Objective: Find the flashlight';
        const backgroundColor = collected
            ? (isOn ? 'rgba(255, 255, 0, 0.3)' : 'rgba(100, 100, 100, 0.3)')
            : 'rgba(255, 214, 102, 0.18)';
        const color = collected ? (isOn ? '#ffff00' : '#aaaaaa') : '#ffe08a';
        const border = collected ? `1px solid ${isOn ? '#ffff00' : '#666666'}` : '1px solid rgba(255, 224, 138, 0.55)';

        return (
            <div style={{
                position: 'absolute',
                bottom: '20px',
                left: '20px',
                padding: '6px 11px',
                backgroundColor,
                color,
                border,
                borderRadius: '4px',
                pointerEvents: 'none',
                fontSize: '12px',
                fontWeight: 'bold',
                userSelect: 'none',
                zIndex: 1000
            }}>
                <div>{label}</div>
                {!collected && !nearPickup && <div style={{ fontSize: '11px', opacity: 0.85, marginTop: 3 }}>It now spawns inside the walls, closer to center.</div>}
                {!collected && nearPickup && <div style={{ fontSize: '11px', color: '#fff3b0', marginTop: 3 }}>Press F or X to pick up flashlight</div>}
                {hint && <div style={{ fontSize: '11px', color: '#ffd1a1', marginTop: 3 }}>{hint}</div>}
            </div>
        );
    };
    const DroneUI = () => {
        const [visible, setVisible] = useState(false);
        const [collected, setCollected] = useState(false);
        const [active, setActive] = useState(false);
        const [nearPickup, setNearPickup] = useState(false);
        const [thermalActive, setThermalActive] = useState(false);
        const [hint, setHint] = useState('');

        useEffect(() => {
            const sync = () => {
                setVisible(window.jackalopesGame?.playerType === 'merc');
                setCollected(!!window.jackalopesGame?.droneCollected);
                setActive(!!window.jackalopesGame?.droneActive);
                setThermalActive(!!window.jackalopesGame?.droneThermalActive);
            };

            sync();

            const handlePlayerTypeChange = () => sync();
            const handlePickupChanged = (event: CustomEvent<{collected: boolean}>) => {
                setCollected(!!event.detail?.collected);
                if (!event.detail?.collected) setActive(false);
            };
            const handleModeToggled = (event: CustomEvent<{active: boolean}>) => {
                setActive(!!event.detail?.active);
            };
            const handlePickupNearby = (event: CustomEvent<{nearby: boolean}>) => {
                setNearPickup(!!event.detail?.nearby);
            };
            const handleThermalToggled = (event: CustomEvent<{active: boolean}>) => {
                setThermalActive(!!event.detail?.active);
            };
            const handleBlocked = () => {
                setHint('Find the drone first');
                window.setTimeout(() => setHint(''), 1400);
            };

            window.addEventListener('playerTypeChanged', handlePlayerTypeChange);
            window.addEventListener('dronePickupChanged', handlePickupChanged as EventListener);
            window.addEventListener('droneModeToggled', handleModeToggled as EventListener);
            window.addEventListener('dronePickupNearby', handlePickupNearby as EventListener);
            window.addEventListener('droneThermalToggled', handleThermalToggled as EventListener);
            window.addEventListener('droneToggleBlocked', handleBlocked as EventListener);
            return () => {
                window.removeEventListener('playerTypeChanged', handlePlayerTypeChange);
                window.removeEventListener('dronePickupChanged', handlePickupChanged as EventListener);
                window.removeEventListener('droneModeToggled', handleModeToggled as EventListener);
                window.removeEventListener('dronePickupNearby', handlePickupNearby as EventListener);
                window.removeEventListener('droneThermalToggled', handleThermalToggled as EventListener);
                window.removeEventListener('droneToggleBlocked', handleBlocked as EventListener);
            };
        }, []);

        if (!visible) return null;

        const label = collected
            ? `Drone: ${active ? 'FLYING' : 'READY'} [G]`
            : 'Objective: Find the drone';
        const backgroundColor = collected
            ? (active ? 'rgba(80, 220, 255, 0.26)' : 'rgba(90, 90, 110, 0.28)')
            : 'rgba(102, 214, 255, 0.16)';
        const color = collected ? (active ? '#9df6ff' : '#c7d2fe') : '#8be9fd';
        const border = collected
            ? `1px solid ${active ? '#67e8f9' : '#818cf8'}`
            : '1px solid rgba(103, 232, 249, 0.55)';

        return (
            <div style={{
                position: 'absolute',
                bottom: '76px',
                left: '20px',
                padding: '6px 11px',
                backgroundColor,
                color,
                border,
                borderRadius: '4px',
                pointerEvents: 'none',
                fontSize: '12px',
                fontWeight: 'bold',
                userSelect: 'none',
                zIndex: 1000
            }}>
                <div>{label}</div>
                {!collected && !nearPickup && <div style={{ fontSize: '11px', opacity: 0.85, marginTop: 3 }}>Hidden near the flashlight zone, inside the walls.</div>}
                {!collected && nearPickup && <div style={{ fontSize: '11px', color: '#d9fbff', marginTop: 3 }}>Press F or X to pick up drone</div>}
                {collected && active && <div style={{ fontSize: '11px', color: '#d9fbff', marginTop: 3 }}>WASD steer, Space up, Shift down, G exit, T thermal {thermalActive ? 'ON' : 'OFF'}</div>}
                {collected && !active && <div style={{ fontSize: '11px', color: '#d9fbff', marginTop: 3 }}>Press G to enter drone mode</div>}
                {hint && <div style={{ fontSize: '11px', color: '#ffd1a1', marginTop: 3 }}>{hint}</div>}
            </div>
        );
    };
    const DroneThermalOverlay = () => {
        const [active, setActive] = useState(false);
        const [noiseTick, setNoiseTick] = useState(0);

        useEffect(() => {
            const sync = () => {
                setActive(!!window.jackalopesGame?.droneActive && !!window.jackalopesGame?.droneThermalActive);
            };
            sync();
            const handleMode = () => sync();
            const handleThermal = () => sync();
            window.addEventListener('droneModeToggled', handleMode as EventListener);
            window.addEventListener('droneThermalToggled', handleThermal as EventListener);
            return () => {
                window.removeEventListener('droneModeToggled', handleMode as EventListener);
                window.removeEventListener('droneThermalToggled', handleThermal as EventListener);
            };
        }, []);

        useEffect(() => {
            if (!active) {
                setNoiseTick(0);
                return;
            }
            const interval = window.setInterval(() => setNoiseTick(Date.now()), 70);
            return () => window.clearInterval(interval);
        }, [active]);

        if (!active) return null;

        const grainOffsetA = `${(noiseTick * 0.13) % 43}px ${(noiseTick * 0.08) % 31}px`;
        const grainOffsetB = `${(noiseTick * -0.09) % 37}px ${(noiseTick * 0.16) % 47}px`;

        return (
            <>
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    pointerEvents: 'none',
                    zIndex: 980,
                    background: 'radial-gradient(circle at center, rgba(255,248,220,0.34) 0%, rgba(255,170,70,0.26) 18%, rgba(255,90,20,0.24) 42%, rgba(80,10,0,0.58) 68%, rgba(6,0,0,0.84) 100%)',
                    boxShadow: 'inset 0 0 260px rgba(255,120,40,0.34)'
                }} />
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 981,
                    pointerEvents: 'none',
                    opacity: 0.38,
                    backgroundImage: `
                        repeating-linear-gradient(0deg, rgba(255,220,180,0.14) 0px, rgba(255,220,180,0.14) 1px, transparent 1px, transparent 4px),
                        repeating-linear-gradient(90deg, rgba(255,120,70,0.08) 0px, rgba(255,120,70,0.08) 1px, transparent 1px, transparent 3px),
                        repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 5px)
                    `,
                    backgroundSize: '4px 4px, 3px 3px, 5px 5px',
                    backgroundPosition: `${grainOffsetA}, ${grainOffsetB}, 0px 0px`,
                    mixBlendMode: 'screen'
                }} />
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    pointerEvents: 'none',
                    zIndex: 982,
                    background: 'linear-gradient(180deg, rgba(255,210,140,0.12) 0%, rgba(255,110,40,0.06) 32%, rgba(0,0,0,0) 54%, rgba(255,100,40,0.10) 100%)',
                    mixBlendMode: 'screen'
                }} />
                <div style={{
                    position: 'fixed',
                    top: '16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'none',
                    zIndex: 983,
                    color: '#fff0cf',
                    fontSize: '12px',
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    background: 'rgba(55, 12, 0, 0.78)',
                    border: '1px solid rgba(255,180,120,0.54)',
                    borderRadius: '999px',
                    padding: '7px 14px',
                    boxShadow: '0 0 30px rgba(255,120,60,0.32)'
                }}>Thermal Vision Active [T]</div>
                <div style={{
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '34px',
                    height: '34px',
                    border: '1px solid rgba(255,235,205,0.92)',
                    borderRadius: '999px',
                    boxShadow: '0 0 22px rgba(255,150,80,0.55)',
                    zIndex: 984,
                    pointerEvents: 'none'
                }} />
                <div style={{
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '160px',
                    height: '1px',
                    background: 'rgba(255,225,190,0.62)',
                    zIndex: 984,
                    pointerEvents: 'none'
                }} />
                <div style={{
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '1px',
                    height: '160px',
                    background: 'rgba(255,225,190,0.62)',
                    zIndex: 984,
                    pointerEvents: 'none'
                }} />
            </>
        );
    };
const SoundProcessor = () => {
    useFrame(() => {
        soundManager.update();
    });
    return null;
};

const MoonOrbit = ({ moonOrbit, moonOrbitSpeed, directionalDistance, directionalHeight, directionalLightRef }: any) => {
    const angle = useRef(0);
    useFrame(() => {
        if (!moonOrbit || !directionalLightRef.current) return;
        angle.current += moonOrbitSpeed * 0.005;
        const xRadius = Math.max(directionalDistance * 2.5, 50);
        const zRadius = Math.max(directionalDistance * 1.2, 25);
        const x = Math.sin(angle.current) * xRadius;
        const z = Math.cos(angle.current) * zRadius;
        directionalLightRef.current.position.set(x, directionalHeight * 1.2, z);
        directionalLightRef.current.target.position.set(0, 0, 0);
    });
    return null;
};

const StableLightUpdater = ({ directionalLightRef, directionalHeight, directionalDistance, highQualityShadows }: any) => {
    useEffect(() => {
        if (directionalLightRef.current) {
            directionalLightRef.current.position.set(-directionalDistance, directionalHeight, -directionalDistance);
            directionalLightRef.current.target.position.set(0, 0, 0);
            directionalLightRef.current.shadow.bias = -0.001;
            directionalLightRef.current.shadow.normalBias = 0.05;
            directionalLightRef.current.shadow.radius = highQualityShadows ? 1 : 2;
            directionalLightRef.current.shadow.mapSize.width = highQualityShadows ? 2048 : 1024;
            directionalLightRef.current.shadow.mapSize.height = highQualityShadows ? 2048 : 1024;
        }
    }, [directionalHeight, directionalDistance, highQualityShadows, directionalLightRef]);
    return null;
};

export function App() {
    // Replace useLoadingAssets with useProgress implementation
    const { active } = useProgress()
    const [loading, setLoading] = useState(true)

    const initialGameMode = useMemo(() => getGameModeFromUrl(), []);
    const [gameMode, setGameMode] = useState<GameMode | null>(initialGameMode);
    const [showGameModeMenu, setShowGameModeMenu] = useState(initialGameMode === null);
    const adventureMode = gameMode === 'adventure';
    const [lushGrove, setLushGrove] = useState(() => {
        try { return localStorage.getItem(GROVE_STORAGE_KEY) !== 'off'; } catch { return true; }
    });
    const toggleLushGrove = () => setLushGrove(current => !current);
    useEffect(() => {
        try { localStorage.setItem(GROVE_STORAGE_KEY, lushGrove ? 'on' : 'off'); } catch { /* Session-only comparison still works. */ }
    }, [lushGrove]);
    useEffect(() => {
        if (!adventureMode) return;
        const compareGrove = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (event.code !== 'KeyG' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
                target?.isContentEditable || target?.closest('input, textarea, select')) return;
            event.preventDefault();
            setLushGrove(current => !current);
        };
        window.addEventListener('keydown', compareGrove);
        return () => window.removeEventListener('keydown', compareGrove);
    }, [adventureMode]);

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
            if (e.key === 'm' || e.key === 'M') {
                const target = e.target as HTMLElement | null;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                    return;
                }
                if (document.pointerLockElement) document.exitPointerLock();
                setShowGameModeMenu(true);
                return;
            }

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
    const [goldenEggCount, setGoldenEggCount] = useState(0);
    const [rainbowEggCount, setRainbowEggCount] = useState(0);
    const [greenNightVisionActive, setGreenNightVisionActive] = useState(false);
    const [goldenVisionUntil, setGoldenVisionUntil] = useState(0);
    const [adventureAvatar, setAdventureAvatar] = useState<'jackalope' | 'astronaut'>(() => {
        try { return localStorage.getItem('jackalopes.adventure-avatar') === 'astronaut' ? 'astronaut' : 'jackalope'; } catch { return 'jackalope'; }
    });
    const toggleAdventureAvatar = () => setAdventureAvatar(previous => {
        if (Date.now() < adventureCombatState.deadUntil) return previous;
        const next = previous === 'astronaut' ? 'jackalope' : 'astronaut';
        try { localStorage.setItem('jackalopes.adventure-avatar', next); } catch { /* Session-only selection. */ }
        return next;
    });
    useEffect(() => {
        const eatKoi = () => { if (adventureMode) setGoldenVisionUntil(Date.now() + GOLDEN_VISION_DURATION_MS); };
        window.addEventListener('jackalopes:rainbow-koi-eaten', eatKoi);
        return () => window.removeEventListener('jackalopes:rainbow-koi-eaten', eatKoi);
    }, [adventureMode]);
    const goldenVisionActive = adventureMode && goldenVisionUntil > Date.now();
    useEffect(() => {
        if (!goldenVisionUntil) return;
        const timeout = window.setTimeout(() => setGoldenVisionUntil(0), Math.max(0, goldenVisionUntil - Date.now()));
        return () => window.clearTimeout(timeout);
    }, [goldenVisionUntil]);
    useEffect(() => {
        setGoldenVisionUntil(0);
        const reset = () => setGoldenVisionUntil(0);
        window.addEventListener('jackalopesRoundReset', reset);
        window.addEventListener('player_respawned', reset);
        return () => {
            window.removeEventListener('jackalopesRoundReset', reset);
            window.removeEventListener('player_respawned', reset);
        };
    }, [adventureMode]);

    const [mercFlashblindUntil, setMercFlashblindUntil] = useState(0);

    // Add score state
    const [jackalopesScore, setJackalopesScore] = useState(0);
    const [mercsScore, setMercsScore] = useState(0);

    // Game round state
    const [gameOver, setGameOver] = useState(false);
    const [roundKey, setRoundKey] = useState(0);
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
        if (adventureMode) return;
        setGameOver(true);
    }, [adventureMode]);

    // Host tracking for score and timer synchronization
    const [isHost, setIsHost] = useState(false);

    // Add a ref to track the last time a score was updated
    const lastScoreTime = useRef<number>(0);
    const lastScoreResetTime = useRef<number>(0);

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

    // Play again handler (needs enableMultiplayer + connectionManager)
    const handlePlayAgain = useCallback(() => {
        setGameOver(false);
        setRoundKey(k => k + 1);
        setJackalopesScore(0);
        setMercsScore(0);
        setGoldenEggCount(0);
        setRainbowEggCount(0);
        setGreenNightVisionActive(false);
        window.dispatchEvent(new CustomEvent('golden_trail_clear'))
        localStorage.setItem('jackalopes_score', '0');
        localStorage.setItem('mercs_score', '0');

        if (enableMultiplayer && connectionManager?.isReadyToSend()) {
            connectionManager.sendMessage({
                type: 'game_event',
                event: {
                    event_type: 'game_score_update',
                    source: 'timer_reset',
                    reset_time: Date.now(),
                    jackalopesScore: 0,
                    mercsScore: 0,
                    timestamp: Date.now(),
                    shotId: `reset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
                }
            });
        }
    }, [enableMultiplayer, connectionManager]);

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



    // Add this inside the App component
    useEffect(() => {
        // Log when character type changes
        console.log(`Character type changed to ${characterType}`);
    }, [characterType]);



    // Graphics quality settings
    const performanceSettings = useControls('Performance', {
        graphicsQuality: {
            value: 'low' as const, // Changed from 'auto' to 'low'
            label: 'Graphics Quality',
            transient: false, // Keep the selected quality available to the rendering rig.
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
    const graphicsQuality = compatibilityMode ? 'low' : ((performanceSettings as any)?.graphicsQuality || 'low'); // Changed default fallback from 'auto' to 'low'

    // Add global rendering quality parameters controlled by graphics quality
    const [globalQualityParams, setGlobalQualityParams] = useState({
        shadowMapSize: 512,
        bloomQuality: 'low' as 'high' | 'medium' | 'low',
        effectsEnabled: false,
        environmentResolution: 32,
        maxParticles: 2000,
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
        if (initialGameMode === 'adventure') {
            return { type: 'jackalope', thirdPerson: true };
        }
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

    const selectGameMode = useCallback((nextMode: GameMode) => {
        if (document.pointerLockElement) document.exitPointerLock();

        const url = new URL(window.location.href);
        url.searchParams.set('mode', nextMode);
        if (nextMode === 'adventure') {
            url.searchParams.delete('role');
        }
        window.history.replaceState({}, '', url);

        connectionManager.setGameMode(nextMode);
        serverAssignedType.current = false;

        const nextType = nextMode === 'adventure' ? 'jackalope' : (urlRole || 'jackalope');
        _setPlayerCharacterInfo({ type: nextType, thirdPerson: nextType === 'jackalope' });
        setGameMode(nextMode);
        setShowGameModeMenu(false);
        setGameOver(false);
        setRoundKey(key => key + 1);
        setJackalopesScore(0);
        setMercsScore(0);

        window.dispatchEvent(new CustomEvent('jackalopesGameModeChanged', {
            detail: { mode: nextMode, timestamp: Date.now() }
        }));
    }, [connectionManager, urlRole]);
    
    // Server-synced match timer
    const [matchTimerData, setMatchTimerData] = useState<{ matchStartTime: number, matchDuration: number, serverTime: number } | null>(null);
    const [roundTimeRemaining, setRoundTimeRemaining] = useState(300);
    const serverClockOffsetRef = useRef<number | null>(null);
    const clampVisualTimer = useCallback((value: number) => Math.max(240, Math.min(300, value)), []);

    // Listen for server-authoritative player type assignment
    useEffect(() => {
        if (!connectionManager || !enableMultiplayer) return;
        
        const handleTypeAssigned = (data: { type: string, index: number }) => {
            console.log(`🎮 SERVER ASSIGNED: ${data.type} (index ${data.index})`);
            serverAssignedType.current = true;
            const assignedType = adventureMode ? 'jackalope' : data.type as 'merc' | 'jackalope';
            setPlayerCharacterInfo({
                type: assignedType,
                thirdPerson: assignedType === 'jackalope'
            }, true);
        };
        
        const handleMatchTimer = (data: { matchStartTime: number, matchDuration: number, serverTime: number }) => {
            console.log('⏱️ Server match timer received:', data);
            serverClockOffsetRef.current = data.serverTime ? (Date.now() - data.serverTime) : null;
            setMatchTimerData(data);
        };
        
        connectionManager.on('player_type_assigned', handleTypeAssigned);
        connectionManager.on('match_timer', handleMatchTimer);
        return () => {
            connectionManager.off('player_type_assigned', handleTypeAssigned);
            connectionManager.off('match_timer', handleMatchTimer);
        };
    }, [adventureMode, connectionManager, enableMultiplayer, setPlayerCharacterInfo]);

    useEffect(() => {
        const applyVisualTimer = (value: number) => {
            const visualTime = clampVisualTimer(value);
            setRoundTimeRemaining(prev => prev === visualTime ? prev : visualTime);
        };

        const computeInitialRemainingTime = () => {
            if (matchTimerData?.matchStartTime && matchTimerData?.matchDuration) {
                const clockOffset = serverClockOffsetRef.current ?? 0;
                const serverNow = Date.now() - clockOffset;
                const elapsed = Math.floor((serverNow - matchTimerData.matchStartTime) / 1000);
                applyVisualTimer(Math.max(0, matchTimerData.matchDuration - elapsed));
                return;
            }

            try {
                const savedTime = localStorage.getItem('timer_remaining');
                const savedTimestamp = localStorage.getItem('timer_timestamp');

                if (savedTime && savedTimestamp) {
                    const elapsedSeconds = Math.floor((Date.now() - parseInt(savedTimestamp, 10)) / 1000);
                    const remainingTime = Math.max(0, parseInt(savedTime, 10) - elapsedSeconds);
                    applyVisualTimer(remainingTime);
                    return;
                }
            } catch (err) {
                console.error('Error reading round timer for lighting transition:', err);
            }

            setRoundTimeRemaining(prev => prev === 300 ? prev : 300);
        };

        const handleFullTimerSync = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.timeRemaining !== undefined) {
                applyVisualTimer(detail.timeRemaining);
            }
        };

        const handleTimerTick = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.timeRemaining !== undefined) {
                applyVisualTimer(detail.timeRemaining);
            }
        };

        const handleTimerReset = () => {
            setRoundTimeRemaining(prev => prev === 300 ? prev : 300);
        };

        computeInitialRemainingTime();
        window.addEventListener('host_timer_full_sync', handleFullTimerSync as EventListener);
        window.addEventListener('jackalopes_timer_tick', handleTimerTick as EventListener);
        window.addEventListener('timer_reset', handleTimerReset);

        return () => {
            window.removeEventListener('host_timer_full_sync', handleFullTimerSync as EventListener);
            window.removeEventListener('jackalopes_timer_tick', handleTimerTick as EventListener);
            window.removeEventListener('timer_reset', handleTimerReset);
        };
    }, [clampVisualTimer, matchTimerData]);

    const introLightingProgress = useMemo(() => {
        const clampedTime = Math.max(0, Math.min(300, roundTimeRemaining));
        return THREE.MathUtils.clamp((300 - clampedTime) / 60, 0, 1);
    }, [roundTimeRemaining]);

    const jackalopeNightVisionActive = greenNightVisionActive && playerCharacterInfo.type === 'jackalope';
    const NIGHT_VISION_PROGRESS = 0.68;
    // Exploration stays at an intentional twilight; Hunt keeps its timed darkness.
    const normalAdventure = adventureMode && !jackalopeNightVisionActive;
    const visualLightingProgress = jackalopeNightVisionActive ? NIGHT_VISION_PROGRESS : (adventureMode ? 0.42 : introLightingProgress);
    const nightVisionTintStrength = jackalopeNightVisionActive ? 0.52 : 0;

    const dynamicFogColor = useMemo(() => {
        if (normalAdventure) return '#142d39';
        if (!forceDarkLevel) return darkMode ? '#111111' : fogColor;
        const baseColor = new THREE.Color('#4b3f52').lerp(new THREE.Color('#050a14'), visualLightingProgress);
        if (!jackalopeNightVisionActive) return `#${baseColor.getHexString()}`;
        return `#${baseColor.lerp(new THREE.Color('#173624'), nightVisionTintStrength).getHexString()}`;
    }, [normalAdventure, forceDarkLevel, darkMode, fogColor, jackalopeNightVisionActive, nightVisionTintStrength, visualLightingProgress]);

    const dynamicFogNear = normalAdventure ? 70 : forceDarkLevel
        ? THREE.MathUtils.lerp(Math.max(0, fogNear * 0.9), fogNear * 0.5, visualLightingProgress)
        : (darkMode ? fogNear : fogNear);

    const dynamicFogFar = normalAdventure ? 340 : forceDarkLevel
        ? THREE.MathUtils.lerp(Math.max(fogFar * 0.7, fogNear + 1), fogFar * 0.3, visualLightingProgress)
        : (darkMode ? (fogFar * 0.5) : fogFar);

    const dynamicEnvironmentPreset = forceDarkLevel && visualLightingProgress < 0.98 ? 'sunset' : (forceDarkLevel ? 'night' : 'sunset');
    const dynamicEnvironmentBlur = forceDarkLevel
        ? THREE.MathUtils.lerp(0.28, 0.8, visualLightingProgress)
        : 0.4;

    const dynamicStarsCount = forceDarkLevel
        ? Math.round(THREE.MathUtils.lerp(900, 4000, visualLightingProgress))
        : (darkMode ? Math.min(starsCount * 1.5, 3000) : starsCount);

    const dynamicStarsSize = forceDarkLevel
        ? THREE.MathUtils.lerp(starsSize * 0.9, starsSize * 1.5, visualLightingProgress)
        : (darkMode ? starsSize * 1.2 : starsSize);

    const dynamicStarsColor = useMemo(() => {
        if (!forceDarkLevel) return darkMode ? '#c4e1ff' : starsColor;
        const baseColor = new THREE.Color('#ffd7a3').lerp(new THREE.Color('#8abbff'), visualLightingProgress);
        if (!jackalopeNightVisionActive) return `#${baseColor.getHexString()}`;
        return `#${baseColor.lerp(new THREE.Color('#aaffbb'), 0.55).getHexString()}`;
    }, [forceDarkLevel, darkMode, starsColor, jackalopeNightVisionActive, visualLightingProgress]);

    const dynamicStarsDepth = forceDarkLevel
        ? THREE.MathUtils.lerp(95, 150, visualLightingProgress)
        : (darkMode ? 120 : 100);

    const dynamicAmbientIntensity = normalAdventure ? 0.2 : forceDarkLevel
        ? THREE.MathUtils.lerp(0.26, 0.005, visualLightingProgress) * (jackalopeNightVisionActive ? 0.12 : 1)
        : (darkMode ? 0.02 : ambientIntensity);

    const dynamicDirectionalIntensity = normalAdventure ? 1.65 : forceDarkLevel
        ? THREE.MathUtils.lerp(Math.max(2.8, directionalIntensity * 1.15), 0.02, visualLightingProgress) * (jackalopeNightVisionActive ? 0.11 : 1)
        : (darkMode ? 0.1 : directionalIntensity);

    const dynamicDirectionalColor = useMemo(() => {
        if (normalAdventure) return '#efcda5';
        if (!forceDarkLevel) return '#fff';
        const baseColor = new THREE.Color('#ffb46b').lerp(new THREE.Color('#5577aa'), visualLightingProgress);
        if (!jackalopeNightVisionActive) return `#${baseColor.getHexString()}`;
        return `#${baseColor.lerp(new THREE.Color('#9eff9f'), 0.7).getHexString()}`;
    }, [normalAdventure, forceDarkLevel, jackalopeNightVisionActive, visualLightingProgress]);

    const dynamicBloomIntensity = normalAdventure ? 0.3 : forceDarkLevel
        ? THREE.MathUtils.lerp(bloomIntensity * 0.9, bloomIntensity * 4.0, visualLightingProgress) * (jackalopeNightVisionActive ? 0.08 : 1)
        : (darkMode ? bloomIntensity * 2.0 : bloomIntensity);

    const dynamicBloomThreshold = normalAdventure ? 0.8 : forceDarkLevel
        ? THREE.MathUtils.lerp(0.18, 0.01, visualLightingProgress)
        : (darkMode ? 0.03 : bloomLuminanceThreshold);

    const dynamicBloomSmoothing = forceDarkLevel
        ? THREE.MathUtils.lerp(0.85, 0.5, visualLightingProgress)
        : (darkMode ? 0.7 : 0.9);

    const dynamicVignetteOffset = normalAdventure ? 0.35 : forceDarkLevel
        ? THREE.MathUtils.lerp(0.28, 0.0, visualLightingProgress)
        : (darkMode ? 0.1 : vignetteOffset);

    const dynamicVignetteDarkness = normalAdventure ? 0.32 : forceDarkLevel
        ? THREE.MathUtils.lerp(0.24, 0.98, visualLightingProgress) + (jackalopeNightVisionActive ? 0.18 : 0)
        : (darkMode ? 0.95 : vignetteDarkness);

    const dynamicChromaticAberration = normalAdventure ? 0.0002 : forceDarkLevel
        ? THREE.MathUtils.lerp(chromaticAberrationOffset * 0.75, chromaticAberrationOffset * 2, visualLightingProgress) * (jackalopeNightVisionActive ? 0.6 : 1)
        : chromaticAberrationOffset;

    const dynamicBrightness = normalAdventure ? -0.035 : forceDarkLevel
        ? THREE.MathUtils.lerp(0.02, -0.95, visualLightingProgress) - (jackalopeNightVisionActive ? 0.52 : 0)
        : (darkMode ? -0.9 : brightness);

    const dynamicContrast = normalAdventure ? 0.1 : forceDarkLevel
        ? THREE.MathUtils.lerp(0.02, 0.6, visualLightingProgress) + (jackalopeNightVisionActive ? 0.08 : 0)
        : (darkMode ? 0.4 : contrast);

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
        window.jackalopesGame.gameMode = gameMode || undefined;
        window.jackalopesGame.playerType = adventureMode
            ? 'jackalope'
            : enableMultiplayer
            ? playerCharacterInfo.type
            : (thirdPersonView ? 'jackalope' : 'merc');

        console.log(`Set global player type: ${window.jackalopesGame.playerType}`);

        return () => {
            // Cleanup
            delete window.jackalopesGame?.playerType;
            delete window.jackalopesGame?.gameMode;
        };
    }, [adventureMode, enableMultiplayer, gameMode, playerCharacterInfo.type, thirdPersonView]);

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
        window.jackalopesGame.gameMode = gameMode || undefined;
        window.jackalopesGame.playerType = adventureMode
            ? 'jackalope'
            : enableMultiplayer
            ? playerCharacterInfo.type
            : (thirdPersonView ? 'jackalope' : 'merc');

        console.log(`Set global player type: ${window.jackalopesGame.playerType}`);

        return () => {
            // Cleanup
            delete window.jackalopesGame?.playerType;
            delete window.jackalopesGame?.gameMode;
        };
    }, [adventureMode, enableMultiplayer, gameMode, playerCharacterInfo.type, thirdPersonView]);

    // Jackalope icon SVG component
    const JackalopeIcon: React.FC<{ size?: number; opacity?: number }> = ({ size = 24, opacity = 0.9 }) => (
        <svg height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 33" style={{ fill: 'white', opacity }}>
            <path d="M12.7 14.6c-2 0-3.9.3-5.8 1.2-2.1 1-3.2 3.4-4.2 5.4-.3.8-.5 1.7-.7 2.5-.1.9.1 1.8-.1 2.7-2.4-.4-1.2 5.9.6 4.1-.2 1.5.6 1.6 1.7 1.1 1-.5 1.9-.6 3-.8.8-.1.7-.2 1.1-.8.1-.3.6-1 1.1-.7.6.3-.2 2.1-.1 2.8.1 1.1 1.2.7 2.2.8.9 0 1.8.2 2.7.1.5 0 1.1 0 1.4-.4.3-.5.1-1-.2-1.3-.7-.5-1.9-.3-2.8-.2-1.2.1-1.9-.2-1.4-1.5.4-1 .9-1.9 1.3-2.8.4-1 .3-2.4 1.6-2.1 1.4.4 1.5 1.2 1.7 2.5.3 1.4 1.2 5.6 3.1 5.1.2 0 .2-.7.4-.9.3 0 .6.6 1 .6.8-.2.5-.5.1-1-.9-1.1-.9-1.9-1.1-3.2-.2-1.1-.9-2.4-.8-3.4 0-1 1.3-1.6 2-2.2.9-.8 1.4-1.6 1.7-2.7.1-.5.2-1.2.6-1.5.4-.3.9 0 1.3-.1.9-.1 1.9-.6 2-1.6.1-1.1-.5-1.9-.5-2.8 0-.8.4-.8-.3-1.4-.4-.3-1-.4-.8-1 .1-.5.8-1.3 1.2-1.6.4-.4.7-.8 1.1-1.2.9-1 2-.5 3.1-1.9-.7-.2-1.8 1.4-2.2.5-.2-.5.7-2.5 1.1-3 .5-1 1.4-1.9 0-3.8-.2.9.1 1.1-.1 2.1-.2 1.1-.7 2-1.4 2.9-.6 1-1.2 2-1.7 3.1-.3.5-1.2 2.6-1.9 2.7-1 .1 0-2.3.2-2.9.4-1.1.8-2.1 1-3.2.1-.9.5-2.3 0-3.2-.5-1-2-1.1-2.5 0-.8 1.8 1 4.7-.2 6.3-1 1.4-1-1-.9-1.6.2-1.1-.5-1.7-.7-2.9-.1-.6-.1-1.3-.2-1.9-.4.4-.5 1-.4 1.4-.5.1-.7-.6-1.1-.8-.5-.2-1.1 0-1.4.3-.9.7-.4 2.1-.1 3 .4 1.1.7 2.1 1.1 3.2.5 1.1 1.2 2.1 1.6 3.2.3 1-.6 2.2-1.6 2.3"></path>
        </svg>
    );

    // Merc/Astronaut icon SVG component
    const MercIcon: React.FC<{ size?: number; opacity?: number }> = ({ size = 24, opacity = 0.9 }) => (
        <svg height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ fill: 'white', opacity }}>
            {/* Astronaut helmet */}
            <path d="M12 2C9.24 2 7 4.24 7 7v2.59c-1.76.77-3 2.53-3 4.59v1.41c0 1.44.73 2.72 1.84 3.48-.11.31-.18.63-.18.98 0 1.66 1.34 3 3 3h6.68c1.66 0 3-1.34 3-3 0-.35-.07-.67-.18-.98C19.27 18.31 20 17.03 20 15.59v-1.41c0-2.06-1.24-3.82-3-4.59V7c0-2.76-2.24-5-5-5zm0 2c1.65 0 3 1.35 3 3v2h-6V7c0-1.65 1.35-3 3-3zm-4 7h8c1.1 0 2 .9 2 2v1.59c0 .89-.46 1.69-1.17 2.15-.35-.45-.9-.74-1.51-.74h-6.64c-.61 0-1.16.29-1.51.74-.71-.46-1.17-1.26-1.17-2.15V13c0-1.1.9-2 2-2zm0 2.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm8 0c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm-6.32 3.5h6.64c.55 0 1 .45 1 1s-.45 1-1 1H9.68c-.55 0-1-.45-1-1s.45-1 1-1z"/>
        </svg>
    );

    // Player count display component for HUD corners - shows repeated icons
    const PlayerCountDisplay: React.FC<{ playerType: 'jackalope' | 'merc'; position: 'left' | 'right' }> = ({ playerType, position }) => {
        const [count, setCount] = useState(0);

        useEffect(() => {
            const updateCount = () => {
                const liveData = (window as any).__livePlayerData;
                // Count remote players of this type
                let remoteCount = 0;
                if (liveData) {
                    remoteCount = Object.values(liveData).filter(
                        (p: any) => p?.playerType === playerType
                    ).length;
                }
                // Add 1 if local player is this type
                const localIsThisType = window.jackalopesGame?.playerType === playerType;
                setCount(remoteCount + (localIsThisType ? 1 : 0));
            };

            updateCount();
            const interval = setInterval(updateCount, 500); // Update more frequently
            return () => clearInterval(interval);
        }, [playerType]);

        const isJackalope = playerType === 'jackalope';
        const color = isJackalope ? '#4682B4' : '#ff4500';

        // Don't render if count is 0
        if (count === 0) return null;

        // Create array of icons to render
        const icons = Array.from({ length: Math.min(count, 8) }, (_, i) => (
            <span key={i} style={{ display: 'flex' }}>
                {isJackalope ? <JackalopeIcon size={22} /> : <MercIcon size={22} />}
            </span>
        ));

        return (
            <div style={{
                position: 'fixed',
                top: '15px',
                [position]: '15px',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                background: `linear-gradient(180deg, ${color}35 0%, ${color}10 100%)`,
                border: `1px solid ${color}50`,
                borderRadius: '6px',
                userSelect: 'none',
                pointerEvents: 'none',
            }}>
                {icons}
                {count > 8 && (
                    <span style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#fff',
                        marginLeft: '2px',
                        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                    }}>
                        +{count - 8}
                    </span>
                )}
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

    useEffect(() => {
        const resetGreenNightVision = () => {
            setGreenNightVisionActive(false)
        }

        window.addEventListener('timer_reset', resetGreenNightVision)
        window.addEventListener('jackalopesRoundReset', resetGreenNightVision)
        return () => {
            window.removeEventListener('timer_reset', resetGreenNightVision)
            window.removeEventListener('jackalopesRoundReset', resetGreenNightVision)
        }
    }, [])

    // Rainbow egg flashbang ability
    useEffect(() => {
        const useRainbowEgg = () => {
            if (playerCharacterInfo.type !== 'jackalope') return
            if (rainbowEggCount <= 0) return

            console.log('[RAINBOW_EGG] Jackalope used rainbow egg flashbang')
            setRainbowEggCount(prev => Math.max(0, prev - 1))

            const duration = 5000

            // Local event for same-client testing / offline play
            window.dispatchEvent(new CustomEvent('rainbow_flashbang_triggered', {
                detail: { timestamp: Date.now(), duration }
            }))

            // Network event so remote mercs get flashed too
            if (enableMultiplayer && connectionManager?.sendRainbowFlashbang) {
                connectionManager.sendRainbowFlashbang(duration)
            }
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'b' || e.key === 'B') {
                useRainbowEgg()
            }
        }

        const handleMouseDown = (e: MouseEvent) => {
            if (playerCharacterInfo.type === 'jackalope' && e.button === 0) {
                useRainbowEgg()
            }
        }

        const handleFlashbang = (e: Event) => {
            const detail = (e as CustomEvent).detail || {}
            if (playerCharacterInfo.type === 'merc') {
                const duration = typeof detail.duration === 'number' ? detail.duration : 5000
                setMercFlashblindUntil(Date.now() + duration)
            }
        }

        const handleNetworkGameEvent = (event: any) => {
            if (event?.event_type === 'rainbow_flashbang' && playerCharacterInfo.type === 'merc') {
                const duration = typeof event.duration === 'number' ? event.duration : 5000
                console.log(`[RAINBOW_EGG] Merc received remote flashbang for ${duration}ms`)
                setMercFlashblindUntil(Date.now() + duration)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('mousedown', handleMouseDown)
        window.addEventListener('rainbow_flashbang_triggered', handleFlashbang as EventListener)
        connectionManager?.on?.('game_event', handleNetworkGameEvent)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('rainbow_flashbang_triggered', handleFlashbang as EventListener)
            connectionManager?.off?.('game_event', handleNetworkGameEvent)
        }
    }, [playerCharacterInfo.type, rainbowEggCount, enableMultiplayer, connectionManager]);

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
              lastScoreResetTime.current = Date.now();
              setJackalopesScore(0);
              setMercsScore(0);
              localStorage.setItem('jackalopes_score', '0');
              localStorage.setItem('mercs_score', '0');
              window.dispatchEvent(new CustomEvent('jackalopesRoundReset', {
                detail: {
                  id: event.shotId || `round-reset-${Date.now()}`,
                  timestamp: event.reset_time || event.timestamp || Date.now(),
                  source: 'network_timer_reset'
                }
              }));
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

            // For a brief window after a timer reset, ignore stale general score syncs
            // so old scores cannot resurrect themselves.
            if (Date.now() - lastScoreResetTime.current < 3000) {
              console.log('📊 Ignoring general network score sync during reset protection window');
              return;
            }

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
            lastScoreResetTime.current = Date.now();
            setJackalopesScore(0);
            setMercsScore(0);
            localStorage.setItem('jackalopes_score', '0');
            localStorage.setItem('mercs_score', '0');
            window.dispatchEvent(new CustomEvent('jackalopesRoundReset', {
              detail: {
                id: event.shotId || `round-reset-${Date.now()}`,
                timestamp: event.reset_time || event.timestamp || Date.now(),
                source: 'window_timer_reset'
              }
            }));
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

          // For a brief window after a timer reset, ignore stale general score syncs
          // so old scores cannot resurrect themselves.
          if (Date.now() - lastScoreResetTime.current < 3000) {
            console.log('📊 Ignoring general window score sync during reset protection window');
            return;
          }

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

        console.log('⏱️ Resetting scores from timer event');
        lastScoreResetTime.current = Date.now();
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
        gameMode: gameMode || undefined,
        playerType: adventureMode ? 'jackalope' : playerCharacterInfo.type,
        levaPanelState: 'closed',
        flashlightOn: false,
        flashlightCollected: false,
        droneCollected: window.jackalopesGame?.droneCollected || false,
        droneActive: window.jackalopesGame?.droneActive || false,
        dronePickupNearby: window.jackalopesGame?.dronePickupNearby || false,
        dronePosition: window.jackalopesGame?.dronePosition,
        droneRotation: window.jackalopesGame?.droneRotation,
        droneThermalActive: window.jackalopesGame?.droneThermalActive || false,
        debugLevel: 1,
        inventory: {
            goldenEggs: goldenEggCount,
            rainbowEggs: rainbowEggCount,
            greenNightVision: greenNightVisionActive,
        }
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

    useEffect(() => {
        if (!connectionManager) return;

        const handleFlashlightPickupEvent = (event: any) => {
            if (event?.event_type !== 'flashlight_pickup') return;
            if (!window.jackalopesGame) window.jackalopesGame = {};
            const existingPickup = window.jackalopesGame.flashlightPickup || {};
            const nextPickup = {
                ...existingPickup,
                collected: true,
                collectedBy: event.player,
                collectedAt: event.timestamp || Date.now(),
            };
            window.jackalopesGame.flashlightPickup = nextPickup;
            window.jackalopesGame.flashlightCollected = true;
            window.dispatchEvent(new CustomEvent('flashlightPickupState', { detail: { flashlightPickup: nextPickup } }));
            window.dispatchEvent(new CustomEvent('flashlightCollected'));
        };

        connectionManager.on('game_event', handleFlashlightPickupEvent);
        return () => {
            connectionManager.off('game_event', handleFlashlightPickupEvent);
        };
    }, [connectionManager]);

    useEffect(() => {
        const forwardRoundReset = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            window.dispatchEvent(new CustomEvent('jackalopesRoundReset', {
                detail: {
                    ...detail,
                    timestamp: detail.timestamp || Date.now(),
                    source: detail.source || 'local_timer_reset'
                }
            }));
        };

        window.addEventListener('timer_reset', forwardRoundReset as EventListener);
        return () => {
            window.removeEventListener('timer_reset', forwardRoundReset as EventListener);
        };
    }, []);

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

            <Canvas shadows={adventureMode && graphicsQuality !== 'low'} dpr={graphicsQuality === 'low' ? 1 : [1, 1.5]} gl={{ antialias: graphicsQuality !== 'low', powerPreference: 'default' }}>
                {fogEnabled && <fog attach="fog" args={[dynamicFogColor, dynamicFogNear, dynamicFogFar]} />}
                {!compatibilityMode && <Environment
                    preset={adventureMode ? 'night' : dynamicEnvironmentPreset}
                    background={!adventureMode}
                    blur={dynamicEnvironmentBlur}
                    resolution={globalQualityParams.environmentResolution} // Use quality-based resolution
                />}

                {adventureMode && <AdventureAtmosphere motes={graphicsQuality !== 'low'} />}
                {adventureMode && <AdventureLighting lightRef={directionalLightRef} nightVision={jackalopeNightVisionActive} />}

                {/* Add stars to night sky */}
                {(starsEnabled || darkMode || forceDarkLevel) && <Stars
                    count={adventureMode ? 260 : dynamicStarsCount}
                    size={adventureMode ? 0.09 : dynamicStarsSize}
                    color={adventureMode ? '#b5cbd8' : dynamicStarsColor}
                    twinkle={starsTwinkle}
                    depth={dynamicStarsDepth}
                />}

                {/* Add Stats Collector - must be inside Canvas */}
                <StatsCollector />

                <ambientLight intensity={dynamicAmbientIntensity} />
                <directionalLight
                    castShadow
                    position={[-directionalDistance, directionalHeight, -directionalDistance]}
                    ref={directionalLightRef}
                    intensity={dynamicDirectionalIntensity}
                    shadow-mapSize={[globalQualityParams.shadowMapSize, globalQualityParams.shadowMapSize]}
                    shadow-camera-left={adventureMode ? -60 : -80}
                    shadow-camera-right={adventureMode ? 60 : 80}
                    shadow-camera-top={adventureMode ? 60 : 80}
                    shadow-camera-bottom={adventureMode ? -60 : -80}
                    shadow-camera-near={1}
                    shadow-camera-far={400}
                    shadow-bias={adventureMode ? -0.00025 : -0.001}
                    shadow-normalBias={adventureMode ? 0.12 : 0.05}
                    shadow-radius={highQualityShadows ? 1 : 2} // Softer shadows in low quality mode
                    color={dynamicDirectionalColor}
                />

                {/* Only show moon if visibility is enabled */}
                {!adventureMode && moonVisible && moonOrbit && <Moon
                    orbitRadius={Math.max(directionalDistance, 50)}
                    height={directionalHeight + 10}
                    orbitSpeed={moonOrbitSpeed}
                />}

                {/* Add MultiplayerSyncManager when multiplayer is enabled */}
                {enableMultiplayer && connectionManager && gameMode && (
                    <MultiplayerSyncManager key={gameMode} connectionManager={connectionManager} />
                )}

                {/* Screen shake effect */}
                <ScreenShake intensity={0.3} decay={8} />

                <Physics
                    debug={false}
                    paused={loading}
                    timeStep={1/120}
                    interpolate={true}
                    gravity={[0, -9.81, 0]}>
                    <PlayerControls thirdPersonView={adventureMode || (enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView)}>
                        {/* Conditionally render either the Player (merc) or Jackalope */}
                        {enableMultiplayer ? (
                            !adventureMode && playerCharacterInfo.type === 'merc' ? (
                                <>
                                    <Player
                                        ref={playerRef}
                                        position={[10, 7, 10]}
                                        walkSpeed={0.03}
                                        runSpeed={0.0375}
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
                                        }}
                                    />
                                    <FlashlightPickup
                                        playerRef={playerRef}
                                        enabled={playerCharacterInfo.type === 'merc'}
                                        connectionManager={connectionManager}
                                    />
                                    <DronePickup enabled={playerCharacterInfo.type === 'merc'} />
                                    <MercDrone enabled={playerCharacterInfo.type === 'merc'} />
                                </>
                            ) : (
                                <Jackalope
                                    adventureMode={adventureMode}
                                    adventureAvatar={adventureAvatar}
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
                                    }}
                                />
                            )
                        ) : (
                            !adventureMode && characterType === 'merc' ? (
                                <>
                                    <Player
                                        ref={playerRef}
                                        position={[10, 7, 10]}
                                        walkSpeed={0.03}
                                        runSpeed={0.0375}
                                        jumpForce={jumpForce * 0.7}
                                        visible={thirdPersonView}
                                        thirdPersonView={thirdPersonView}
                                        playerType={characterType}
                                        connectionManager={enableMultiplayer ? connectionManager : undefined}
                                        onMove={(position) => {
                                            if (playerPosition.current) {
                                                playerPosition.current.copy(position);
                                            }
                                        }}
                                    />
                                    <FlashlightPickup
                                        playerRef={playerRef}
                                        enabled={characterType === 'merc'}
                                        connectionManager={connectionManager}
                                    />
                                    <DronePickup enabled={characterType === 'merc'} />
                                    <MercDrone enabled={characterType === 'merc'} />
                                </>
                            ) : (
                                <Jackalope
                                    adventureMode={adventureMode}
                                    adventureAvatar={adventureAvatar}
                                    ref={playerRef}
                                    position={[-100, 7, 10]} // Different spawn position for jackalope
                                    walkSpeed={0.56}
                                    runSpeed={1.0}
                                    jumpForce={jumpForce * 0.8}
                                    visible={adventureMode || thirdPersonView}
                                    thirdPersonView={adventureMode || thirdPersonView}
                                    connectionManager={enableMultiplayer ? connectionManager : undefined}
                                    onMove={(position) => {
                                        if (playerPosition.current) {
                                            playerPosition.current.copy(position);
                                        }
                                    }}
                                />
                            )
                        )}
                    </PlayerControls>
                    {adventureMode && <AdventureCombat connectionManager={connectionManager} astronaut={adventureAvatar === 'astronaut'} playerRef={playerRef} />}
                    <Platforms adventureStyle={adventureMode} holographicVision={goldenVisionActive} />
                    {adventureMode && lushGrove && !compatibilityMode && <FoliageGrove quality={graphicsQuality} />}
                    <HolographicVision active={goldenVisionActive} />
                    {adventureMode && <GoldenMushroom onEat={() => setGoldenVisionUntil(Date.now() + GOLDEN_VISION_DURATION_MS)} />}
                    {adventureMode && <CloudPath />}

                    {/* Mushroom field - visible to all players, but only jackalopes can eat them */}
                    <MushroomField
                        onMushroomEaten={(id) => {
                            console.log(`[APP] Mushroom ${id} was eaten!`);
                            // Could add score/power-up logic here in the future
                        }}
                        onGoldenTrailDecoySpawned={(id) => {
                            console.log(`[APP] Golden trail decoy ${id} spawned`)
                        }}
                    />

                    {/* Golden easter egg hunt - random hidden collectibles for future jackalope magic */}
                    <GoldenEggField
                        eggCount={7}
                        onEggEaten={(id) => {
                            console.log(`[APP] Golden egg ${id} was eaten!`)
                            setGoldenEggCount(prev => prev + 1)
                            window.dispatchEvent(new CustomEvent('golden_egg_trail_start'))
                        }}
                    />

                    <RainbowEggField
                        eggCount={4}
                        onEggEaten={(id) => {
                            console.log(`[APP] Rainbow egg ${id} was eaten!`)
                            setRainbowEggCount(prev => prev + 1)
                        }}
                    />

                    <GreenEggField
                        eggCount={3}
                        onEggEaten={(id) => {
                            console.log(`[APP] Green egg ${id} was eaten!`)
                            setGreenNightVisionActive(true)
                        }}
                    />

                    <Scene playerRef={playerRef} enabled={!adventureMode} />

                    {/* Adventure has no weapon/projectile layer; Hunt keeps the original shooting system. */}
                    {!adventureMode && <SphereTool
                        onShoot={((enableMultiplayer ? playerCharacterInfo.type === 'merc' : characterType === 'merc')) ?
                            ((origin, direction) => {
                                console.log('App: onShoot called with', { origin, direction });
                                try {
                                    connectionManager.sendShootEvent(origin, direction);
                                    console.log('App: successfully sent shoot event');
                                } catch (error) {
                                    console.error('App: error sending shoot event:', error);
                                }
                            })
                            : undefined
                        }
                        remoteShots={remoteShots}
                        thirdPersonView={enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView}
                        playerPosition={enableMultiplayer ?
                            (playerCharacterInfo.thirdPerson ? playerPosition.current : null) :
                            (thirdPersonView ? playerPosition.current : null)}
                        allowLocalShooting={enableMultiplayer ? playerCharacterInfo.type === 'merc' : characterType === 'merc'}
                    />}

                    {/* Use enableMultiplayer instead of showMultiplayerTools for the actual multiplayer functionality */}
                    {enableMultiplayer && playerRefReady && gameMode && (
                        <MultiplayerManager
                            key={gameMode}
                            localPlayerRef={playerRef}
                            connectionManager={connectionManager}
                        />
                    )}
                </Physics>

                {/* Only use this fallback camera when NO player FPS camera is active */}
                <PerspectiveCamera
                    makeDefault={!adventureMode && (enableMultiplayer ? false : !thirdPersonView)}
                    position={[0, 10, 10]}
                    rotation={[0, 0, 0]}
                    near={0.1}
                    far={500}
                    fov={90}
                />

                {/* Add third-person camera when needed */}
                {(adventureMode || (enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView)) && (
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
                {(adventureMode || (enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView)) && playerPosition.current && (
                    <ThirdPersonCameraControls
                        adventureCaves={adventureMode}
                        shoulderView={adventureMode && adventureAvatar === 'astronaut'}
                        player={playerPosition.current}
                        cameraRef={thirdPersonCameraRef}
                        enabled={adventureMode || (enableMultiplayer ? playerCharacterInfo.thirdPerson : thirdPersonView)}
                        distance={cameraDistance}
                        height={cameraHeight}
                        invertY={invertYAxis}
                    />
                )}

                {/* Simplified - just add StableLightUpdater once */}
                {!adventureMode && <StableLightUpdater
                    directionalLightRef={directionalLightRef}
                    directionalHeight={directionalHeight}
                    directionalDistance={directionalDistance}
                    highQualityShadows={highQualityShadows}
                />}

                {/* Add position tracker component */}
                <PlayerPositionTracker playerRef={playerRef} playerPosition={playerPosition} />

                {/* Add MoonOrbit component if orbiting is enabled */}
                {!adventureMode && moonOrbit && <MoonOrbit
                    moonOrbit={moonOrbit}
                    moonOrbitSpeed={moonOrbitSpeed}
                    directionalDistance={directionalDistance}
                    directionalHeight={directionalHeight}
                    directionalLightRef={directionalLightRef}
                />}

                {/* Add WeaponSoundEffects component if player is merc */}
                {!adventureMode && (enableMultiplayer ? playerCharacterInfo.type === 'merc' : characterType === 'merc') && (
                    <WeaponSoundEffects />
                )}

                {enablePostProcessing && globalQualityParams.effectsEnabled && (
                    <EffectComposer>
                        {bloomEnabled ? (
                            <Bloom
                                intensity={goldenVisionActive ? 0.9 : dynamicBloomIntensity}
                                luminanceThreshold={goldenVisionActive ? 0.45 : dynamicBloomThreshold}
                                luminanceSmoothing={dynamicBloomSmoothing}
                                mipmapBlur={globalQualityParams.bloomQuality !== 'low'}
                            />
                        ) : <></>}
                        <Vignette
                            offset={vignetteEnabled ? dynamicVignetteOffset : 0}
                            darkness={vignetteEnabled ? (goldenVisionActive ? 0.4 : dynamicVignetteDarkness) : 0}
                            eskil={false}
                        />
                        <ChromaticAberration
                            offset={new THREE.Vector2(
                                chromaticAberrationEnabled ? dynamicChromaticAberration : 0,
                                chromaticAberrationEnabled ? dynamicChromaticAberration : 0
                            )}
                            radialModulation={false}
                            modulationOffset={0}
                        />
                        <BrightnessContrast
                            brightness={brightnessContrastEnabled ? (goldenVisionActive ? -0.08 : dynamicBrightness) : 0}
                            contrast={brightnessContrastEnabled ? (goldenVisionActive ? 0.12 : dynamicContrast) : 0}
                        />
                        <ToneMapping
                            blendFunction={BlendFunction.NORMAL}
                            mode={adventureMode ? ToneMappingMode.ACES_FILMIC : toneMapping}
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

            {adventureMode && adventureAvatar === 'astronaut' && <div aria-hidden="true" style={{ position: 'fixed', left: '50%', top: '50%', width: 5, height: 5, marginLeft: -2, marginTop: -2, borderRadius: '50%', border: '1px solid #ffe5b4', background: '#ffac6355', pointerEvents: 'none', zIndex: 1000 }} />}
            {/* Add Virtual Gamepad */}
            <VirtualGamepad
                adventureWeapon={adventureMode && adventureAvatar === 'astronaut'}
                visible={showVirtualGamepad && !!gameMode && !showGameModeMenu}
                playerType={adventureMode ? 'jackalope' : playerCharacterInfo.type}
            />

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
            <DroneUI />
            <DroneThermalOverlay />

            <GameModeMenu
                currentMode={gameMode}
                visible={showGameModeMenu || gameMode === null}
                onOpen={() => {
                    if (document.pointerLockElement) document.exitPointerLock();
                    setShowGameModeMenu(true);
                }}
                onClose={() => setShowGameModeMenu(false)}
                onSelect={selectGameMode}
            />

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

            <SwimmingHUD />
            {goldenVisionActive && <HolographicSenseHUD until={goldenVisionUntil} />}
            {adventureMode ? (
                <AdventureHUD
                    avatar={adventureAvatar}
                    onToggleAvatar={toggleAdventureAvatar}
                    lushGrove={lushGrove}
                    onToggleGrove={toggleLushGrove}
                    goldenEggs={goldenEggCount}
                    rainbowEggs={rainbowEggCount}
                    greenNightVision={greenNightVisionActive}
                    onEditMap={() => {
                        if (document.pointerLockElement) document.exitPointerLock();
                        window.location.href = '/?mode=adventure&editor=terrain';
                    }}
                />
            ) : gameMode === 'hunt' ? (
                <GameHUD
                    jackalopesScore={jackalopesScore}
                    mercsScore={mercsScore}
                    playerType={playerCharacterInfo.type}
                    isHost={isHost}
                    matchStartTime={matchTimerData?.matchStartTime}
                    matchDuration={matchTimerData?.matchDuration}
                    serverTime={matchTimerData?.serverTime}
                    onTimerEnd={handleRoundEnd}
                    roundKey={roundKey}
                    inventory={{ goldenEggs: goldenEggCount, rainbowEggs: rainbowEggCount, greenNightVision: greenNightVisionActive }}
                />
            ) : null}

            {/* Crosshair for mercs */}
            {!adventureMode && playerCharacterInfo.type === 'merc' && !gameOver && (
                <GameCrosshair hitMarker={hitMarker} size={28} />
            )}

            {/* Kill feed */}
            {!adventureMode && <KillFeed />}

            <AudioCommsPanel
                connectionManager={connectionManager}
                enabled={true}
                playerType={adventureMode ? 'jackalope' : playerCharacterInfo.type}
                position={showVirtualGamepad ? 'top-right' : 'bottom-right'}
            />

            {/* Jackalope Player Count - Top Left */}
            {!adventureMode && <PlayerCountDisplay playerType="jackalope" position="left" />}

            {/* Merc Player Count - Top Right */}
            {!adventureMode && <PlayerCountDisplay playerType="merc" position="right" />}

            {/* Add IntroScreen */}
            <IntroScreenManager
                playerType={adventureMode ? 'jackalope' : playerCharacterInfo.type}
                gameMode={gameMode || 'hunt'}
            />

            {/* Game Over screen */}
            {!adventureMode && (
                <GameOverScreen
                    visible={gameOver}
                    jackalopesScore={jackalopesScore}
                    mercsScore={mercsScore}
                    playerType={playerCharacterInfo.type}
                    onPlayAgain={handlePlayAgain}
                />
            )}

            <RespawnButton connectionManager={connectionManager} />

            {/* Merc flashblind overlay from rainbow egg flashbang */}
            {!adventureMode && playerCharacterInfo.type === 'merc' && mercFlashblindUntil > Date.now() && (
                <MercFlashblindOverlay until={mercFlashblindUntil} />
            )}

            {playerCharacterInfo.type === 'jackalope' && (
                <NightVisionOverlay active={greenNightVisionActive && !goldenVisionActive} />
            )}
        </>
    );
}

export default App
