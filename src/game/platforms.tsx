import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { SimpleTree } from './SimpleTree'
import { TreeLoader } from './TreeLoader'
import { useRef, useMemo } from 'react'
import { MountainRange } from './Mountain'

type BoxDimensions = [width: number, height: number, depth: number]

// Inner platform boxes (existing)
const boxes = [
    { position: [10, 0, -10] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [-10, 0, -10] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [30, 0, 10] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [-30, 0, 10] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [0, 0, 30] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [20, 0, -30] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [-20, 0, -30] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [40, 0, 40] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [-40, 0, 40] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [40, 0, -40] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [-40, 0, -40] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [15, 0, -35] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [-15, 0, 35] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [25, 0, 25] as const, size: [4, 4, 4] as BoxDimensions },
    { position: [-25, 0, -25] as const, size: [4, 4, 4] as BoxDimensions }
]

// Create walls
const createWallSegments = () => {
    const wallHeight = 8;
    const wallThickness = 2;
    const mapSize = 60; // Size of the inner area
    const doorWidth = 10; // Width of doorway openings
    const doorHeight = 6; // Height of doorway openings
    const segments = [];
    
    // Wall colors
    const wallColor = '#555555';
    
    // Create a continuous wall with 4 openings (N, S, E, W)
    
    // North wall (left segment)
    segments.push({
        position: [-mapSize/4 - doorWidth/2, wallHeight/2, -mapSize/2] as const,
        size: [mapSize/2 - doorWidth/2, wallHeight, wallThickness] as BoxDimensions,
        color: wallColor
    });
    
    // North wall (right segment)
    segments.push({
        position: [mapSize/4 + doorWidth/2, wallHeight/2, -mapSize/2] as const,
        size: [mapSize/2 - doorWidth/2, wallHeight, wallThickness] as BoxDimensions,
        color: wallColor
    });
    
    // South wall (left segment)
    segments.push({
        position: [-mapSize/4 - doorWidth/2, wallHeight/2, mapSize/2] as const,
        size: [mapSize/2 - doorWidth/2, wallHeight, wallThickness] as BoxDimensions,
        color: wallColor
    });
    
    // South wall (right segment)
    segments.push({
        position: [mapSize/4 + doorWidth/2, wallHeight/2, mapSize/2] as const,
        size: [mapSize/2 - doorWidth/2, wallHeight, wallThickness] as BoxDimensions,
        color: wallColor
    });
    
    // East wall (top segment)
    segments.push({
        position: [mapSize/2, wallHeight/2, -mapSize/4 - doorWidth/2] as const,
        size: [wallThickness, wallHeight, mapSize/2 - doorWidth/2] as BoxDimensions,
        color: wallColor
    });
    
    // East wall (bottom segment)
    segments.push({
        position: [mapSize/2, wallHeight/2, mapSize/4 + doorWidth/2] as const,
        size: [wallThickness, wallHeight, mapSize/2 - doorWidth/2] as BoxDimensions,
        color: wallColor
    });
    
    // West wall (top segment)
    segments.push({
        position: [-mapSize/2, wallHeight/2, -mapSize/4 - doorWidth/2] as const,
        size: [wallThickness, wallHeight, mapSize/2 - doorWidth/2] as BoxDimensions,
        color: wallColor
    });
    
    // West wall (bottom segment)
    segments.push({
        position: [-mapSize/2, wallHeight/2, mapSize/4 + doorWidth/2] as const,
        size: [wallThickness, wallHeight, mapSize/2 - doorWidth/2] as BoxDimensions,
        color: wallColor
    });
    
    // Add lintels (top bars) above each doorway
    
    // North doorway lintel
    segments.push({
        position: [0, doorHeight + (wallHeight-doorHeight)/2, -mapSize/2] as const,
        size: [doorWidth, wallHeight-doorHeight, wallThickness] as BoxDimensions,
        color: wallColor
    });
    
    // South doorway lintel
    segments.push({
        position: [0, doorHeight + (wallHeight-doorHeight)/2, mapSize/2] as const,
        size: [doorWidth, wallHeight-doorHeight, wallThickness] as BoxDimensions,
        color: wallColor
    });
    
    // East doorway lintel
    segments.push({
        position: [mapSize/2, doorHeight + (wallHeight-doorHeight)/2, 0] as const,
        size: [wallThickness, wallHeight-doorHeight, doorWidth] as BoxDimensions,
        color: wallColor
    });
    
    // West doorway lintel
    segments.push({
        position: [-mapSize/2, doorHeight + (wallHeight-doorHeight)/2, 0] as const,
        size: [wallThickness, wallHeight-doorHeight, doorWidth] as BoxDimensions,
        color: wallColor
    });
    
    // Add door frames (vertical posts) for more definition
    const frameWidth = 1;
    const frameColor = '#444444';
    
    // North door frames
    segments.push({
        position: [-doorWidth/2 - frameWidth/2, wallHeight/2, -mapSize/2] as const,
        size: [frameWidth, wallHeight, wallThickness*1.5] as BoxDimensions,
        color: frameColor
    });
    segments.push({
        position: [doorWidth/2 + frameWidth/2, wallHeight/2, -mapSize/2] as const,
        size: [frameWidth, wallHeight, wallThickness*1.5] as BoxDimensions,
        color: frameColor
    });
    
    // South door frames
    segments.push({
        position: [-doorWidth/2 - frameWidth/2, wallHeight/2, mapSize/2] as const,
        size: [frameWidth, wallHeight, wallThickness*1.5] as BoxDimensions,
        color: frameColor
    });
    segments.push({
        position: [doorWidth/2 + frameWidth/2, wallHeight/2, mapSize/2] as const,
        size: [frameWidth, wallHeight, wallThickness*1.5] as BoxDimensions,
        color: frameColor
    });
    
    // East door frames
    segments.push({
        position: [mapSize/2, wallHeight/2, -doorWidth/2 - frameWidth/2] as const,
        size: [wallThickness*1.5, wallHeight, frameWidth] as BoxDimensions,
        color: frameColor
    });
    segments.push({
        position: [mapSize/2, wallHeight/2, doorWidth/2 + frameWidth/2] as const,
        size: [wallThickness*1.5, wallHeight, frameWidth] as BoxDimensions,
        color: frameColor
    });
    
    // West door frames
    segments.push({
        position: [-mapSize/2, wallHeight/2, -doorWidth/2 - frameWidth/2] as const,
        size: [wallThickness*1.5, wallHeight, frameWidth] as BoxDimensions,
        color: frameColor
    });
    segments.push({
        position: [-mapSize/2, wallHeight/2, doorWidth/2 + frameWidth/2] as const,
        size: [wallThickness*1.5, wallHeight, frameWidth] as BoxDimensions,
        color: frameColor
    });
    
    return segments;
};

export function Platforms() {
    // Platform colors
    const platformColor = new THREE.Color('#757575');
    const outsideFloorColor = new THREE.Color('#3A5F3A'); // Green-grey for outside floor
    
    // Define map dimensions
    const mapSize = 60; // Size of the inner area
    
    // Define outside floor dimensions - increased for more terrain
    const outsideFloorSize = 800; // Larger outdoor area (increased from 600)
    const outsideFloorThickness = 1;
    const outsideFloorY = -0.5; // Slightly lower than the interior
    
    // Parameters for low poly terrain
    const terrainSegments = 70; // Number of segments in the terrain grid (increased from 50)
    const terrainMaxHeight = 12; // Maximum height of terrain features (increased from 6)
    const terrainNoiseScale = 0.015; // Scale of the noise function (adjusted for larger area)
    
    // Create a low poly terrain with hills and valleys
    const terrainGeometry = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(
            outsideFloorSize, 
            outsideFloorSize, 
            terrainSegments, 
            terrainSegments
        );
        
        // Add some hills and valleys with a simple noise function
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];
            
            // Skip vertices near the center (keep playable area flat)
            const distFromCenter = Math.sqrt(x * x + z * z);
            if (distFromCenter < mapSize) {
                continue;
            }
            
            // Apply height based on simplex-like noise (using sine functions for simplicity)
            const nx = x * terrainNoiseScale;
            const nz = z * terrainNoiseScale;
            
            // Create several layers of noise for more interesting terrain
            let height = 0;
            
            // Primary noise layer (large features)
            height += Math.sin(nx) * Math.cos(nz) * 0.6;
            
            // Secondary noise layer (medium features)
            height += Math.sin(nx * 2.1) * Math.cos(nz * 1.7) * 0.3;
            
            // Tertiary noise layer (small details)
            height += Math.sin(nx * 4.2) * Math.cos(nz * 3.1) * 0.15;
            
            // Quaternary noise layer (micro details)
            height += Math.sin(nx * 8.3) * Math.cos(nz * 7.9) * 0.07;
            
            // Create ridge-like features along certain axes
            const ridgeX = Math.sin(nx * 0.8) * 0.2;
            const ridgeZ = Math.cos(nz * 0.8) * 0.2;
            height += Math.max(ridgeX, ridgeZ);
            
            // Apply a distance-based falloff to make terrain more pronounced further from center
            // Make this more dramatic with a steeper curve
            const falloffStart = mapSize;
            const falloffEnd = 300;
            let falloff = 0;
            
            if (distFromCenter > falloffStart) {
                // Create a more interesting falloff curve
                // First rapidly increase, then level off in the mid-distance, then increase again
                const normalizedDist = (distFromCenter - falloffStart) / (falloffEnd - falloffStart);
                falloff = Math.pow(normalizedDist, 0.7) * (1.0 + 0.2 * Math.sin(normalizedDist * Math.PI * 2));
                
                // Add occasional plateau areas
                if (Math.abs(Math.sin(nx * 0.5) * Math.cos(nz * 0.5)) < 0.2) {
                    height *= 0.3; // Flatten these areas
                }
                
                // Add occasional steep areas
                if (Math.abs(Math.sin(nx * 0.3) * Math.cos(nz * 0.4)) > 0.8) {
                    height *= 1.5; // Make these areas steeper
                }
            }
            
            // Apply height to the vertex with improved falloff
            positions[i + 1] = height * terrainMaxHeight * Math.min(1.0, falloff);
        }
        
        // Update normals
        geometry.computeVertexNormals();
        return geometry;
    }, [outsideFloorSize, terrainSegments, terrainMaxHeight, terrainNoiseScale, mapSize]);
    
    // Create a grid shader material with fade-out effect
    const floorGridMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            color1: { value: new THREE.Color('#324D32') }, // Darker green
            color2: { value: new THREE.Color('#3E5F3E') }, // Lighter green
            gridSize: { value: 5.0 },
            gridLineWidth: { value: 0.1 },
            center: { value: new THREE.Vector3(0, 0, 0) }, // Center for distance calculation
            fadeOutStartRadius: { value: outsideFloorSize * 0.6 }, // Start fading at 60% of the size
            fadeOutEndRadius: { value: outsideFloorSize * 0.95 }, // Fully faded near the edge (95%)
            fogColor: { value: new THREE.Color('#030812') } // Color to fade towards (similar to fog)
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPosition; // Pass world position to fragment shader
            void main() {
                vUv = uv;
                // Calculate world position
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color1;
            uniform vec3 color2;
            uniform float gridSize;
            uniform float gridLineWidth;
            uniform vec3 center;
            uniform float fadeOutStartRadius;
            uniform float fadeOutEndRadius;
            uniform vec3 fogColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition; // Receive world position

            void main() {
                vec2 scaledUv = vUv * ${outsideFloorSize.toFixed(1)}; // Use updated size
                vec2 grid = abs(fract(scaledUv / gridSize - 0.5) - 0.5) / fwidth(scaledUv / gridSize);
                float line = min(grid.x, grid.y);
                
                float gridMask = 1.0 - min(line, 1.0);
                gridMask = smoothstep(0.0, gridLineWidth, gridMask);
                
                vec3 baseColor = mix(color1, color2, gridMask);
                
                // Add some noise/variation to the base floor
                float noise = fract(sin(dot(floor(scaledUv), vec2(12.9898, 78.233))) * 43758.5453);
                baseColor = mix(baseColor, baseColor * (0.9 + 0.1 * noise), 0.2);

                // Calculate distance from the center in the xz plane
                float dist = length(vWorldPosition.xz - center.xz);
                
                // Calculate fade factor using smoothstep
                float fadeFactor = smoothstep(fadeOutStartRadius, fadeOutEndRadius, dist);
                
                // Mix base color with fog color based on fade factor
                vec3 finalColor = mix(baseColor, fogColor, fadeFactor);
                
                gl_FragColor = vec4(finalColor, 1.0); // Output final faded color
            }
        `,
        side: THREE.DoubleSide
    }), [outsideFloorSize]); // Add outsideFloorSize dependency
    
    return (
        <group>
            {/* Main platform boxes with trees */}
            {boxes.map(({ position, size }, index) => (
                <RigidBody 
                    key={index}
                    type="fixed" 
                    position={position}
                    colliders="cuboid"
                    friction={0.1}
                    restitution={0}
                >
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={size} />
                        <meshStandardMaterial 
                            color={platformColor}
                            side={THREE.DoubleSide}
                            roughness={0.65}
                            metalness={0.05}
                            envMapIntensity={0.8}
                            dithering={true}
                        />
                    </mesh>
                    
                    {/* Add a tree on top of each block */}
                    <TreeLoader 
                        position={[0, size[1] / 2, 0]}
                        scale={1.5}
                        treeType="tree"  // Only use actual trees on blocks
                    />
                </RigidBody>
            ))}
            
            {/* Black respawn circle in the center of the map */}
            <RigidBody
                type="fixed"
                position={[0, 0.5, 0]}
                colliders="hull"
                sensor={true}
                name="respawn-circle"
                userData={{ isRespawnCircle: true }}
            >
                <mesh castShadow receiveShadow>
                    <cylinderGeometry args={[5, 5, 0.2, 32]} />
                    <meshStandardMaterial
                        color="#000000"
                        side={THREE.DoubleSide}
                        roughness={0.9}
                        metalness={0.1}
                        emissive="#000000"
                        emissiveIntensity={0.5}
                    />
                </mesh>
            </RigidBody>
            
            {/* Low poly terrain outside - replace the flat floor */}
            <RigidBody
                type="fixed"
                position={[0, outsideFloorY, 0]}
                colliders="hull"  // Use hull for better performance with terrain
                friction={0.2}
                restitution={0}
            >
                <mesh geometry={terrainGeometry} receiveShadow rotation={[-Math.PI/2, 0, 0]}>
                    <primitive object={floorGridMaterial} attach="material" />
                </mesh>
            </RigidBody>
            
            {/* Wall segments with doorway openings */}
            {createWallSegments().map((segment, index) => (
                <RigidBody
                    key={`wall-${index}`}
                    type="fixed"
                    position={segment.position}
                    colliders="cuboid"
                    friction={0.1}
                    restitution={0}
                >
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={segment.size} />
                        <meshStandardMaterial
                            color={segment.color}
                            side={THREE.DoubleSide}
                            roughness={0.7}
                            metalness={0.2}
                        />
                    </mesh>
                </RigidBody>
            ))}
            
            {/* Path decorations - lanterns and stone formations */}
            {[
                [-5, 0, -mapSize/2 - 10], [5, 0, -mapSize/2 - 10], // North path
                [-5, 0, mapSize/2 + 10], [5, 0, mapSize/2 + 10], // South path
                [mapSize/2 + 10, 0, -5], [mapSize/2 + 10, 0, 5], // East path
                [-mapSize/2 - 10, 0, -5], [-mapSize/2 - 10, 0, 5], // West path
            ].map((position, idx) => (
                <RigidBody
                    key={`path-decor-${idx}`}
                    type="fixed"
                    position={position as [number, number, number]}
                    colliders="cuboid"
                >
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[1.5, 1.5, 1.5]} />
                        <meshStandardMaterial
                            color="#8B5A2B" // Brown stone color
                            roughness={0.7}
                            metalness={0.05}
                            envMapIntensity={0.7}
                            dithering={true}
                        />
                    </mesh>
                </RigidBody>
            ))}
            
            {/* Terrain features - rock formations and hills */}
            {[
                // North feature
                { position: [0, -0.5, -90], scale: 3.0, height: 10 },
                // East feature
                { position: [90, -0.5, 0], scale: 2.5, height: 8 },
                // South feature
                { position: [0, -0.5, 90], scale: 3.0, height: 10 },
                // West feature
                { position: [-90, -0.5, 0], scale: 2.5, height: 8 },
                // Random smaller hills
                { position: [45, -0.5, -45], scale: 1.8, height: 5 },
                { position: [-45, -0.5, 45], scale: 1.8, height: 5 },
                { position: [-45, -0.5, -45], scale: 1.8, height: 5 },
                { position: [45, -0.5, 45], scale: 1.8, height: 5 },
                
                // Additional hills for expanded terrain
                { position: [120, -0.5, -120], scale: 4.0, height: 15 },
                { position: [-120, -0.5, 120], scale: 4.0, height: 15 },
                { position: [-120, -0.5, -120], scale: 4.0, height: 15 },
                { position: [120, -0.5, 120], scale: 4.0, height: 15 },
                
                // Mountain-like features further out
                { position: [200, -0.5, 0], scale: 5.0, height: 20 },
                { position: [-200, -0.5, 0], scale: 5.0, height: 20 },
                { position: [0, -0.5, 200], scale: 5.0, height: 20 },
                { position: [0, -0.5, -200], scale: 5.0, height: 20 },
                
                // Random mid-sized hills
                { position: [150, -0.5, -80], scale: 3.2, height: 12 },
                { position: [-150, -0.5, 80], scale: 3.2, height: 12 },
                { position: [-80, -0.5, -150], scale: 3.2, height: 12 },
                { position: [80, -0.5, 150], scale: 3.2, height: 12 },
                { position: [170, -0.5, 170], scale: 3.5, height: 14 },
                { position: [-170, -0.5, -170], scale: 3.5, height: 14 },
                { position: [-170, -0.5, 170], scale: 3.5, height: 14 },
                { position: [170, -0.5, -170], scale: 3.5, height: 14 },
                
                // Valley features
                { position: [60, -0.5, -110], scale: 2.2, height: 7 },
                { position: [-60, -0.5, 110], scale: 2.2, height: 7 },
                { position: [-110, -0.5, -60], scale: 2.2, height: 7 },
                { position: [110, -0.5, 60], scale: 2.2, height: 7 },
                
                // Small hill clusters
                { position: [30, -0.5, -130], scale: 1.5, height: 4 },
                { position: [-30, -0.5, 130], scale: 1.5, height: 4 },
                { position: [-130, -0.5, -30], scale: 1.5, height: 4 },
                { position: [130, -0.5, 30], scale: 1.5, height: 4 },
                { position: [50, -0.5, -150], scale: 1.7, height: 5 },
                { position: [-50, -0.5, 150], scale: 1.7, height: 5 },
                { position: [-150, -0.5, -50], scale: 1.7, height: 5 },
                { position: [150, -0.5, 50], scale: 1.7, height: 5 },
                
                // Distant large features
                { position: [250, -0.5, 150], scale: 6.0, height: 25 },
                { position: [-250, -0.5, -150], scale: 6.0, height: 25 },
                { position: [150, -0.5, -250], scale: 6.0, height: 25 },
                { position: [-150, -0.5, 250], scale: 6.0, height: 25 },
            ].map((feature, idx) => (
                <RigidBody
                    key={`terrain-feature-${idx}`}
                    type="fixed"
                    position={feature.position as [number, number, number]}
                    colliders="hull"
                >
                    <mesh castShadow receiveShadow>
                        <coneGeometry args={[feature.scale * 10, feature.height, 8]} />
                        <meshStandardMaterial
                            color={idx % 3 === 0 ? "#3A5F3A" : idx % 3 === 1 ? "#34543A" : "#2D4A33"}
                            roughness={0.8}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                </RigidBody>
            ))}
            
            {/* Add more outside trees, widely distributed across the terrain */}
            {[
                // Original tree positions
                [-25, 0, -70], [25, 0, -70], // North area
                [-25, 0, 70], [25, 0, 70], // South area
                [70, 0, -25], [70, 0, 25], // East area
                [-70, 0, -25], [-70, 0, 25], // West area
                [-100, 0, -100], [100, 0, -100], [-100, 0, 100], [100, 0, 100], // Corners
                [-70, 0, -40], [70, 0, -40], [-70, 0, 40], [70, 0, 40], // Random positions
                
                // Additional trees further out in the terrain
                [-120, 0, -80], [120, 0, -80], [-120, 0, 80], [120, 0, 80],
                [-80, 0, -120], [80, 0, -120], [-80, 0, 120], [80, 0, 120],
                [-150, 0, -50], [150, 0, -50], [-150, 0, 50], [150, 0, 50],
                [-50, 0, -150], [50, 0, -150], [-50, 0, 150], [50, 0, 150],
                [-180, 0, -180], [180, 0, -180], [-180, 0, 180], [180, 0, 180],
                [-140, 0, -60], [140, 0, -60], [-140, 0, 60], [140, 0, 60],
                [-60, 0, -140], [60, 0, -140], [-60, 0, 140], [60, 0, 140],
                
                // Extended terrain trees (200-300 range)
                [-220, 0, -90], [220, 0, -90], [-220, 0, 90], [220, 0, 90],
                [-90, 0, -220], [90, 0, -220], [-90, 0, 220], [90, 0, 220],
                [-250, 0, -120], [250, 0, -120], [-250, 0, 120], [250, 0, 120],
                [-120, 0, -250], [120, 0, -250], [-120, 0, 250], [120, 0, 250],
                [-280, 0, -60], [280, 0, -60], [-280, 0, 60], [280, 0, 60],
                [-60, 0, -280], [60, 0, -280], [-60, 0, 280], [60, 0, 280],
                [-210, 0, -210], [210, 0, -210], [-210, 0, 210], [210, 0, 210],
                [-180, 0, -70], [180, 0, -70], [-180, 0, 70], [180, 0, 70],
                [-70, 0, -180], [70, 0, -180], [-70, 0, 180], [70, 0, 180],
                
                // Randomly spaced trees within 300 unit radius
                [225, 0, 75], [-225, 0, -75], [75, 0, -225], [-75, 0, 225],
                [240, 0, 140], [-240, 0, -140], [140, 0, -240], [-140, 0, 240],
                [190, 0, -30], [-190, 0, 30], [30, 0, 190], [-30, 0, -190],
                [170, 0, -110], [-170, 0, 110], [110, 0, 170], [-110, 0, -170],
                [270, 0, 30], [-270, 0, -30], [30, 0, -270], [-30, 0, 270],
                [200, 0, 200], [-200, 0, -200], [200, 0, -200], [-200, 0, 200],
            ].map((position, idx) => (
                <TreeLoader
                    key={`outside-tree-${idx}`}
                    position={position as [number, number, number]}
                    scale={(0.6 + Math.sin(idx * 0.1) * 0.2) * 10} // Varied scales multiplied by 10
                    treeType="tree" // Use only trees for these positions
                />
            ))}
            
            {/* Add more rocks throughout the terrain */}
            {[
                // Original rock positions
                [-35, 0, -60], [35, 0, -60], // North area
                [-35, 0, 60], [35, 0, 60], // South area
                [60, 0, -35], [60, 0, 35], // East area
                [-60, 0, -35], [-60, 0, 35], // West area
                [-90, 0, -90], [90, 0, -90], [-90, 0, 90], [90, 0, 90], // Corners
                [-50, 0, -30], [50, 0, -30], [-50, 0, 30], [50, 0, 30], // Random positions
                
                // Additional rocks scattered through the extended terrain
                [-110, 0, -45], [110, 0, -45], [-110, 0, 45], [110, 0, 45],
                [-45, 0, -110], [45, 0, -110], [-45, 0, 110], [45, 0, 110],
                [-130, 0, -65], [130, 0, -65], [-130, 0, 65], [130, 0, 65],
                [-65, 0, -130], [65, 0, -130], [-65, 0, 130], [65, 0, 130],
                [-170, 0, -90], [170, 0, -90], [-170, 0, 90], [170, 0, 90],
                [-90, 0, -170], [90, 0, -170], [-90, 0, 170], [90, 0, 170],
                [-80, 0, -40], [80, 0, -40], [-80, 0, 40], [80, 0, 40],
                [-40, 0, -80], [40, 0, -80], [-40, 0, 80], [40, 0, 80],
                
                // Rocks for further expanded terrain
                [-215, 0, -55], [215, 0, -55], [-215, 0, 55], [215, 0, 55],
                [-55, 0, -215], [55, 0, -215], [-55, 0, 215], [55, 0, 215],
                [-235, 0, -125], [235, 0, -125], [-235, 0, 125], [235, 0, 125],
                [-125, 0, -235], [125, 0, -235], [-125, 0, 235], [125, 0, 235],
                [-190, 0, -190], [190, 0, -190], [-190, 0, 190], [190, 0, 190],
                [-265, 0, -75], [265, 0, -75], [-265, 0, 75], [265, 0, 75],
                [-75, 0, -265], [75, 0, -265], [-75, 0, 265], [75, 0, 265],
                
                // Rock formations near hills
                [195, 0, 10], [-195, 0, -10], [10, 0, -195], [-10, 0, 195],
                [115, 0, -115], [-115, 0, 115], [155, 0, 155], [-155, 0, -155],
                [230, 0, 80], [-230, 0, -80], [80, 0, -230], [-80, 0, 230],
                [185, 0, -115], [-185, 0, 115], [115, 0, 185], [-115, 0, -185],
                [255, 0, 35], [-255, 0, -35], [35, 0, -255], [-35, 0, 255],
                [205, 0, 205], [-205, 0, -205], [205, 0, -205], [-205, 0, 205],
            ].map((position, idx) => (
                <TreeLoader
                    key={`rock-${idx}`}
                    position={position as [number, number, number]}
                    scale={(0.7 + Math.cos(idx * 0.2) * 0.3) * 10} // Varied scales multiplied by 10
                    treeType="rock" // Use only rocks for these positions
                />
            ))}
            
            {/* Add plants and bushes - original plus more for extended terrain */}
            {[
                // Original plant positions
                [-45, 0, -65], [45, 0, -65], [-15, 0, -55], [15, 0, -55], // North area
                [-45, 0, 65], [45, 0, 65], [-15, 0, 55], [15, 0, 55], // South area
                [65, 0, -45], [65, 0, 45], [55, 0, -15], [55, 0, 15], // East area
                [-65, 0, -45], [-65, 0, 45], [-55, 0, -15], [-55, 0, 15], // West area
                [-80, 0, -80], [80, 0, -80], [-80, 0, 80], [80, 0, 80], // Near corners
                [-40, 0, -20], [40, 0, -20], [-40, 0, 20], [40, 0, 20], // Random positions
                [-30, 0, -50], [30, 0, -50], [-30, 0, 50], [30, 0, 50], // More random positions
                
                // Additional plant positions for extended terrain
                [-95, 0, -75], [95, 0, -75], [-95, 0, 75], [95, 0, 75],
                [-75, 0, -95], [75, 0, -95], [-75, 0, 95], [75, 0, 95],
                [-120, 0, -55], [120, 0, -55], [-120, 0, 55], [120, 0, 55],
                [-55, 0, -120], [55, 0, -120], [-55, 0, 120], [55, 0, 120],
                [-160, 0, -75], [160, 0, -75], [-160, 0, 75], [160, 0, 75],
                [-75, 0, -160], [75, 0, -160], [-75, 0, 160], [75, 0, 160],
                [-140, 0, -140], [140, 0, -140], [-140, 0, 140], [140, 0, 140],
                [-85, 0, -35], [85, 0, -35], [-85, 0, 35], [85, 0, 35],
                [-35, 0, -85], [35, 0, -85], [-35, 0, 85], [35, 0, 85],
                
                // Further plants and bushes for the expanded terrain
                [-185, 0, -65], [185, 0, -65], [-185, 0, 65], [185, 0, 65],
                [-65, 0, -185], [65, 0, -185], [-65, 0, 185], [65, 0, 185],
                [-210, 0, -100], [210, 0, -100], [-210, 0, 100], [210, 0, 100],
                [-100, 0, -210], [100, 0, -210], [-100, 0, 210], [100, 0, 210],
                [-175, 0, -175], [175, 0, -175], [-175, 0, 175], [175, 0, 175],
                [-245, 0, -45], [245, 0, -45], [-245, 0, 45], [245, 0, 45],
                [-45, 0, -245], [45, 0, -245], [-45, 0, 245], [45, 0, 245],
                
                // Plants near the extended hills
                [205, 0, 15], [-205, 0, -15], [15, 0, -205], [-15, 0, 205],
                [125, 0, -125], [-125, 0, 125], [165, 0, 165], [-165, 0, -165],
                [240, 0, 90], [-240, 0, -90], [90, 0, -240], [-90, 0, 240],
                [195, 0, -125], [-195, 0, 125], [125, 0, 195], [-125, 0, -195],
                [260, 0, 40], [-260, 0, -40], [40, 0, -260], [-40, 0, 260],
                
                // Distant plants
                [225, 0, 225], [-225, 0, -225], [225, 0, -225], [-225, 0, 225],
                [275, 0, 135], [-275, 0, -135], [135, 0, -275], [-135, 0, 275],
                [290, 0, -50], [-290, 0, 50], [50, 0, 290], [-50, 0, -290],
                [230, 0, -170], [-230, 0, 170], [170, 0, 230], [-170, 0, -230],
                [255, 0, 255], [-255, 0, -255], [255, 0, -255], [-255, 0, 255],
            ].map((position, idx) => (
                <TreeLoader
                    key={`plant-${idx}`}
                    position={position as [number, number, number]}
                    scale={(0.5 + Math.sin(idx * 0.3) * 0.2) * 10} // Varied scales multiplied by 10
                    treeType={idx % 3 === 0 ? "plant" : idx % 3 === 1 ? "bush" : "rock"} // Mix of plant types
                />
            ))}

            {/* Add mountain ranges around the map boundary to create a natural barrier */}
            
            {/* North mountain range */}
            <MountainRange 
                position={[0, 0, -150]}
                count={8}
                spread={200}
                baseScale={1.5}
                scaleVariation={0.4}
                heightVariation={0.5}
            />
            
            {/* Northeast mountains */}
            <MountainRange 
                position={[130, 0, -130]}
                count={4}
                spread={80}
                baseScale={1.3}
                scaleVariation={0.3}
                heightVariation={0.4}
            />
            
            {/* East mountain range */}
            <MountainRange 
                position={[150, 0, 0]}
                count={6}
                spread={160}
                baseScale={1.4}
                scaleVariation={0.35}
                heightVariation={0.45}
            />
            
            {/* Southeast mountains */}
            <MountainRange 
                position={[130, 0, 130]}
                count={4}
                spread={70}
                baseScale={1.2}
                scaleVariation={0.3}
                heightVariation={0.4}
            />
            
            {/* South mountain range */}
            <MountainRange 
                position={[0, 0, 150]}
                count={8}
                spread={200}
                baseScale={1.5}
                scaleVariation={0.4}
                heightVariation={0.5}
            />
            
            {/* Southwest mountains */}
            <MountainRange 
                position={[-130, 0, 130]}
                count={4}
                spread={80}
                baseScale={1.3}
                scaleVariation={0.3}
                heightVariation={0.4}
            />
            
            {/* West mountain range */}
            <MountainRange 
                position={[-150, 0, 0]}
                count={6}
                spread={160}
                baseScale={1.4}
                scaleVariation={0.35}
                heightVariation={0.45}
            />
            
            {/* Northwest mountains */}
            <MountainRange 
                position={[-130, 0, -130]}
                count={4}
                spread={70}
                baseScale={1.2}
                scaleVariation={0.3}
                heightVariation={0.4}
            />
        </group>
    )
}