import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { SimpleTree } from './SimpleTree'
import { TreeLoader } from './TreeLoader'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { MountainRange } from './Mountain'
import {
    loadTerrainLevel,
    sampleBaseTerrainHeight,
    TERRAIN_SEGMENTS,
    TERRAIN_SIZE,
    terrainVertexIndex,
} from './terrain/level-document'
import { AdventureCaves } from './AdventureCaves'
import { cutCaveMouth } from './adventure-caves'
import { cutRabbitHole } from './rabbit-hole-opening'
import { WaterSurface } from './terrain/WaterSurface'

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

export function Platforms({ holographicVision = false, adventureStyle = false }: {
    holographicVision?: boolean
    adventureStyle?: boolean
}) {
    // Platform colors
    const platformColor = new THREE.Color(adventureStyle ? '#526777' : '#757575');
    const outsideFloorColor = new THREE.Color('#3A5F3A'); // Green-grey for outside floor
    
    // Define map dimensions
    const mapSize = 60; // Size of the inner area
    const level = useMemo(() => loadTerrainLevel(), []);
    
    // Define outside floor dimensions - increased for more terrain
    const outsideFloorSize = TERRAIN_SIZE; // Shared with the level editor and terrain document
    const outsideFloorThickness = 1;
    const outsideFloorY = -0.02; // Keep the terrain visually flush with the main floor without obvious under-floor gap
    
    // Parameters for low poly terrain
    const terrainSegments = TERRAIN_SEGMENTS; // Shared with the level editor and terrain document
    const terrainMaxHeight = 12; // Maximum height of terrain features (increased from 6)
    const terrainNoiseScale = 0.015; // Scale of the noise function (adjusted for larger area)
    
    // Terrain zone boundaries
    const forestPerimeter = 80;      // Where trees end
    const digitalDesertStart = 100;  // Start of flat desert area
    const desertRimStart = 200;      // Where desert starts sloping UP to the rim
    const rimPeak = 280;             // The peak of the rim/ridge surrounding the map
    const rimHeight = 45;            // How high the rim rises above the desert
    const valleyBottom = 380;        // Where valley reaches its lowest point
    const valleyDepth = 100;         // How deep the valley goes below the rim peak

    // Create a low poly terrain with the Digital Desert, Rim, and Great Valley
    const terrainGeometry = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(
            outsideFloorSize,
            outsideFloorSize,
            terrainSegments,
            terrainSegments
        );

        // PlaneGeometry is in XY plane. When rotated -PI/2 on X:
        // - local X -> world X
        // - local Y -> world -Z
        // - local Z -> world Y (height)
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const worldZ = -y;
            const vertexIndex = terrainVertexIndex(i / 3 % (terrainSegments + 1), Math.floor((i / 3) / (terrainSegments + 1)));
            positions[i + 2] = sampleBaseTerrainHeight(x, worldZ) + level.heightOffsets[vertexIndex];
        }

        if (adventureStyle) { cutCaveMouth(geometry); cutRabbitHole(geometry); }
        geometry.computeVertexNormals();
        return geometry;
    }, [outsideFloorSize, terrainSegments, terrainNoiseScale, mapSize, forestPerimeter, digitalDesertStart, desertRimStart, rimPeak, rimHeight, valleyBottom, valleyDepth, adventureStyle]);
    
    // Create a grid shader material with zone-based coloring
    const floorGridMaterial = useMemo(() => new THREE.ShaderMaterial({
        extensions: { derivatives: true },
        uniforms: {
            adventureStyle: { value: adventureStyle ? 1 : 0 },
            sanctuaryForest: { value: new THREE.Color('#355451') },
            sanctuaryDesert: { value: new THREE.Color('#78664f') },
            sanctuaryRim: { value: new THREE.Color('#526373') },
            sanctuaryValley: { value: new THREE.Color('#474f6a') },
            sanctuaryGrid: { value: new THREE.Color('#699d95') },
            sanctuaryCopper: { value: new THREE.Color('#b69a70') },
            sanctuaryFog: { value: new THREE.Color('#142d39') },
            // Keep original zone colors for Hunt and golden-mushroom vision.
            // Forest zone colors (green)
            forestColor1: { value: new THREE.Color('#324D32') },
            forestColor2: { value: new THREE.Color('#3E5F3E') },
            // Desert zone colors (tan/sandy)
            desertColor1: { value: new THREE.Color('#8B7355') },
            desertColor2: { value: new THREE.Color('#A08060') },
            // Rim zone colors (rocky grey/brown)
            rimColor1: { value: new THREE.Color('#5C5040') },
            rimColor2: { value: new THREE.Color('#6B5D4D') },
            // Valley zone colors (reddish brown)
            valleyColor1: { value: new THREE.Color('#6B4423') },
            valleyColor2: { value: new THREE.Color('#8B5A2B') },
            gridSize: { value: 5.0 },
            gridLineWidth: { value: 0.1 },
            center: { value: new THREE.Vector3(0, 0, 0) },
            visionStrength: { value: 0 },
            visionTime: { value: 0 },
            visionOrigin: { value: new THREE.Vector3() },
            // Zone boundaries
            forestEnd: { value: forestPerimeter },
            desertStart: { value: digitalDesertStart },
            rimStart: { value: desertRimStart },
            rimPeakDist: { value: rimPeak },
            valleyStart: { value: rimPeak },
            fadeOutStartRadius: { value: outsideFloorSize * 0.8 },
            fadeOutEndRadius: { value: outsideFloorSize * 0.95 },
            fogColor: { value: new THREE.Color('#030812') }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform float adventureStyle;
            uniform vec3 sanctuaryForest;
            uniform vec3 sanctuaryDesert;
            uniform vec3 sanctuaryRim;
            uniform vec3 sanctuaryValley;
            uniform vec3 sanctuaryGrid;
            uniform vec3 sanctuaryCopper;
            uniform vec3 sanctuaryFog;
            uniform vec3 forestColor1;
            uniform vec3 forestColor2;
            uniform vec3 desertColor1;
            uniform vec3 desertColor2;
            uniform vec3 rimColor1;
            uniform vec3 rimColor2;
            uniform vec3 valleyColor1;
            uniform vec3 valleyColor2;
            uniform float gridSize;
            uniform float gridLineWidth;
            uniform vec3 center;
            uniform float visionStrength;
            uniform float visionTime;
            uniform vec3 visionOrigin;
            uniform float forestEnd;
            uniform float desertStart;
            uniform float rimStart;
            uniform float rimPeakDist;
            uniform float valleyStart;
            uniform float fadeOutStartRadius;
            uniform float fadeOutEndRadius;
            uniform vec3 fogColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition;

            // World-sized lines with a one-pixel antialiasing footprint. The
            // coverage correction prevents distant subpixel lines becoming a solid wash.
            float surveyGrid(vec2 worldXZ, float spacing, float width) {
                vec2 cell = worldXZ / spacing;
                vec2 footprint = max(fwidth(cell), vec2(0.00001));
                vec2 edge = abs(fract(cell - 0.5) - 0.5);
                vec2 halfWidth = vec2(width / spacing);
                vec2 aaWidth = max(footprint * 0.7, halfWidth);
                vec2 coverage = (1.0 - smoothstep(halfWidth, halfWidth + aaWidth, edge))
                    * min(vec2(1.0), (halfWidth * 2.0) / footprint);
                return max(coverage.x, coverage.y);
            }

            void main() {
                vec2 scaledUv = vUv * ${outsideFloorSize.toFixed(1)};
                vec2 grid = abs(fract(scaledUv / gridSize - 0.5) - 0.5) / fwidth(scaledUv / gridSize);
                float line = min(grid.x, grid.y);

                float gridMask = 1.0 - min(line, 1.0);
                gridMask = smoothstep(0.0, gridLineWidth, gridMask);

                // Calculate distance from center
                float dist = length(vWorldPosition.xz - center.xz);

                // Determine zone colors based on distance
                vec3 color1, color2;

                if (dist < forestEnd) {
                    // Forest zone
                    color1 = forestColor1;
                    color2 = forestColor2;
                } else if (dist < desertStart) {
                    // Transition from forest to desert
                    float t = smoothstep(forestEnd, desertStart, dist);
                    color1 = mix(forestColor1, desertColor1, t);
                    color2 = mix(forestColor2, desertColor2, t);
                } else if (dist < rimStart) {
                    // Flat desert zone (Digital Desert)
                    color1 = desertColor1;
                    color2 = desertColor2;
                } else if (dist < rimPeakDist) {
                    // Slope up to rim - transition to rocky colors
                    float t = smoothstep(rimStart, rimPeakDist, dist);
                    color1 = mix(desertColor1, rimColor1, t);
                    color2 = mix(desertColor2, rimColor2, t);
                } else if (dist < valleyStart + 60.0) {
                    // Rim peak and descent - transition to valley colors
                    float t = smoothstep(rimPeakDist, valleyStart + 60.0, dist);
                    color1 = mix(rimColor1, valleyColor1, t);
                    color2 = mix(rimColor2, valleyColor2, t);
                } else {
                    // Valley zone (Great Valley)
                    color1 = valleyColor1;
                    color2 = valleyColor2;
                }

                vec3 baseColor = mix(color1, color2, gridMask);

                // Add noise variation
                float noise = fract(sin(dot(floor(scaledUv), vec2(12.9898, 78.233))) * 43758.5453);
                baseColor = mix(baseColor, baseColor * (0.9 + 0.1 * noise), 0.2);

                // The default Adventure world is a quiet topographic simulation.
                // Its own branch leaves the original golden-vision palette and grid intact.
                vec3 sanctuaryColor = sanctuaryForest;
                sanctuaryColor = mix(sanctuaryColor, sanctuaryDesert, smoothstep(forestEnd, desertStart + 15.0, dist));
                sanctuaryColor = mix(sanctuaryColor, sanctuaryRim, smoothstep(rimStart, rimPeakDist, dist));
                sanctuaryColor = mix(sanctuaryColor, sanctuaryValley, smoothstep(rimPeakDist, valleyStart + 65.0, dist));

                vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
                if (faceNormal.y < 0.0) faceNormal = -faceNormal;
                float sunward = max(dot(faceNormal, normalize(vec3(-0.45, 0.8, -0.35))), 0.0);
                float skyward = clamp(faceNormal.y, 0.0, 1.0);
                float slope = 1.0 - skyward;
                float elevation = smoothstep(-25.0, 60.0, vWorldPosition.y);
                sanctuaryColor *= 0.65 + sunward * 0.48 + skyward * 0.12;
                sanctuaryColor = mix(sanctuaryColor, sanctuaryRim * 0.72, slope * 0.3);
                sanctuaryColor *= 0.91 + elevation * 0.17;
                // Broad, continuous variation avoids noisy swimming pixels on the floor.
                sanctuaryColor *= 0.97 + 0.03 * sin(vWorldPosition.x * 0.075) * cos(vWorldPosition.z * 0.064);

                float cameraDistance = distance(vWorldPosition, cameraPosition);
                float minorGrid = surveyGrid(vWorldPosition.xz, 5.0, 0.045)
                    * (1.0 - smoothstep(35.0, 145.0, cameraDistance));
                float majorGrid = surveyGrid(vWorldPosition.xz, 25.0, 0.085)
                    * (1.0 - smoothstep(105.0, 280.0, cameraDistance));
                float desertTint = smoothstep(75.0, 130.0, dist) * (1.0 - smoothstep(200.0, 300.0, dist));
                vec3 surveyColor = mix(sanctuaryGrid, sanctuaryCopper, desertTint);
                sanctuaryColor = mix(sanctuaryColor, surveyColor, minorGrid * 0.35);
                sanctuaryColor = mix(sanctuaryColor, surveyColor * 1.12, majorGrid * 0.58);

                // Fine contour marks appear only on slopes, revealing sculpted relief.
                float contourHeight = vWorldPosition.y / 5.0;
                float contourEdge = abs(fract(contourHeight - 0.5) - 0.5);
                float contourAA = max(fwidth(contourHeight), 0.001);
                float contour = 1.0 - smoothstep(0.008, 0.008 + contourAA, contourEdge);
                contour *= min(1.0, 0.024 / contourAA) * smoothstep(0.04, 0.4, slope);
                contour *= 1.0 - smoothstep(60.0, 180.0, cameraDistance);
                sanctuaryColor = mix(sanctuaryColor, surveyColor, contour * 0.2);

                // Preserve the full legacy effect at full vision strength.
                float sanctuaryStrength = adventureStyle * (1.0 - visionStrength);
                // Composite the linear Adventure palette at output, after legacy vision math.

                // The golden mushroom reveals the existing grid, without
                // replacing terrain, its sculpted heights, or its zone colors.
                float visionDistance = distance(vWorldPosition, visionOrigin);
                float visionRange = 1.0 - smoothstep(55.0, 150.0, visionDistance);
                float hueWave = 0.5 + 0.5 * sin(visionDistance * 0.075 - visionTime * 0.55);
                vec3 cyan = vec3(0.10, 1.15, 1.30);
                vec3 violet = vec3(0.85, 0.28, 1.30);
                vec3 gold = vec3(1.30, 0.88, 0.25);
                vec3 hologramColor = mix(cyan, violet, hueWave);
                float goldWave = pow(0.5 + 0.5 * sin(vWorldPosition.x * 0.025 + vWorldPosition.z * 0.018 + visionTime * 0.30), 5.0);
                hologramColor = mix(hologramColor, gold, goldWave * 0.65);
                float scanPhase = fract(visionDistance / 72.0 - visionTime / 8.0);
                float scanWave = 1.0 - smoothstep(0.0, 0.10, abs(scanPhase - 0.5));
                float reveal = visionStrength * visionRange;
                baseColor = mix(baseColor, baseColor * 0.85 + hologramColor * 0.065, reveal);
                baseColor = mix(baseColor, hologramColor * (0.65 + scanWave * 0.35), gridMask * reveal);
                baseColor += hologramColor * scanWave * reveal * 0.07;

                // Edge fade
                float fadeFactor = smoothstep(fadeOutStartRadius, fadeOutEndRadius, dist);
                vec3 finalColor = mix(baseColor, fogColor, fadeFactor);

                // Distance is relative to the camera, never to the center of the map.
                // Match the Adventure lighting rig's atmospheric color and range.
                float depthFog = smoothstep(70.0, 340.0, cameraDistance);
                vec3 sanctuaryOutput = linearToOutputTexel(vec4(mix(sanctuaryColor, sanctuaryFog, depthFog), 1.0)).rgb;
                finalColor = mix(finalColor, sanctuaryOutput, sanctuaryStrength);
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        side: THREE.DoubleSide
    }), [outsideFloorSize, forestPerimeter, digitalDesertStart, desertRimStart, rimPeak, adventureStyle]);

    useEffect(() => () => floorGridMaterial.dispose(), [floorGridMaterial]);

    useFrame(({ clock }, delta) => {
        const uniforms = floorGridMaterial.uniforms;
        uniforms.visionTime.value = clock.elapsedTime;
        const target = holographicVision ? 1 : 0;
        const strength = THREE.MathUtils.damp(uniforms.visionStrength.value, target, 3, delta);
        uniforms.visionStrength.value = Math.abs(strength - target) < 0.001 ? target : strength;
        if (window.__localPlayerPosition) uniforms.visionOrigin.value.copy(window.__localPlayerPosition);
    });
    
    return (
        <group name="adventure-scenery" userData={{ holographicScenery: true }}>
            {/* Decorative tree pedestals only - no collision so they don't create invisible block zones */}
            {boxes.map(({ position, size }, index) => (
                <group key={index} position={position}>
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
                        adventureStyle={adventureStyle}
                        position={[0, size[1] / 2, 0]}
                        worldPosition={[position[0], position[1] + size[1] / 2, position[2]]}
                        scale={1.5}
                        treeType="tree"  // Only use actual trees on blocks
                    />
                </group>
            ))}
            
            {/* Hunt keeps its scoring circle; Adventure has a walkable cave mouth. */}
            {adventureStyle && <AdventureCaves surfaceMaterial={floorGridMaterial} />}
            {!adventureStyle && <RigidBody
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
                        color={adventureStyle ? '#172c35' : '#000000'}
                        side={THREE.DoubleSide}
                        roughness={0.9}
                        metalness={0.1}
                        emissive={adventureStyle ? '#315e69' : '#000000'}
                        emissiveIntensity={adventureStyle ? 0.12 : 0.5}
                    />
                </mesh>
            </RigidBody>}
            
            {/* Low poly terrain outside - with valley */}
            <RigidBody
                type="fixed"
                position={[0, outsideFloorY, 0]}
                colliders="trimesh"  // Use trimesh for concave terrain (valley)
                friction={0.3}
                restitution={0}
            >
                <mesh geometry={terrainGeometry} receiveShadow rotation={[-Math.PI/2, 0, 0]}>
                    <primitive object={floorGridMaterial} attach="material" />
                </mesh>
            </RigidBody>

            {/* Painted water is intentionally visual-only. Rapier continues to
                ground characters against the sculpted terrain beneath it. */}
            <WaterSurface level={level} />
            
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
                            color={adventureStyle ? (segment.color === '#444444' ? '#354d5a' : '#657681') : segment.color}
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
                            color={adventureStyle ? '#a18158' : '#8B5A2B'}
                            emissive={adventureStyle ? '#be8549' : '#000000'}
                            emissiveIntensity={adventureStyle ? 0.1 : 0}
                            roughness={0.7}
                            metalness={0.05}
                            envMapIntensity={0.7}
                            dithering={true}
                        />
                    </mesh>
                </RigidBody>
            ))}
            
            {/* Terrain features - rock formations in forest and desert areas (before valley) */}
            {[
                // Forest perimeter features (near the tree line)
                { position: [0, -0.5, -90], scale: 3.0, height: 10, zone: 'forest' },
                { position: [90, -0.5, 0], scale: 2.5, height: 8, zone: 'forest' },
                { position: [0, -0.5, 90], scale: 3.0, height: 10, zone: 'forest' },
                { position: [-90, -0.5, 0], scale: 2.5, height: 8, zone: 'forest' },

                // Digital Desert rock formations (scattered mesas and buttes)
                { position: [130, -0.5, 0], scale: 4.0, height: 18, zone: 'desert' },
                { position: [-130, -0.5, 0], scale: 4.0, height: 18, zone: 'desert' },
                { position: [0, -0.5, 130], scale: 4.0, height: 18, zone: 'desert' },
                { position: [0, -0.5, -130], scale: 4.0, height: 18, zone: 'desert' },

                // Desert corner formations
                { position: [120, -0.5, 120], scale: 3.5, height: 15, zone: 'desert' },
                { position: [-120, -0.5, 120], scale: 3.5, height: 15, zone: 'desert' },
                { position: [120, -0.5, -120], scale: 3.5, height: 15, zone: 'desert' },
                { position: [-120, -0.5, -120], scale: 3.5, height: 15, zone: 'desert' },

                // Smaller desert outcrops
                { position: [160, -0.5, 60], scale: 2.5, height: 10, zone: 'desert' },
                { position: [-160, -0.5, -60], scale: 2.5, height: 10, zone: 'desert' },
                { position: [60, -0.5, -160], scale: 2.5, height: 10, zone: 'desert' },
                { position: [-60, -0.5, 160], scale: 2.5, height: 10, zone: 'desert' },

                // Mesa formations near the valley edge (these will look like cliffs)
                { position: [200, -0.5, 0], scale: 5.0, height: 25, zone: 'desert' },
                { position: [-200, -0.5, 0], scale: 5.0, height: 25, zone: 'desert' },
                { position: [0, -0.5, 200], scale: 5.0, height: 25, zone: 'desert' },
                { position: [0, -0.5, -200], scale: 5.0, height: 25, zone: 'desert' },

                // Diagonal edge formations
                { position: [150, -0.5, 150], scale: 4.5, height: 22, zone: 'desert' },
                { position: [-150, -0.5, -150], scale: 4.5, height: 22, zone: 'desert' },
                { position: [-150, -0.5, 150], scale: 4.5, height: 22, zone: 'desert' },
                { position: [150, -0.5, -150], scale: 4.5, height: 22, zone: 'desert' },
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
                            color={adventureStyle
                                ? (feature.zone === 'forest'
                                    ? ['#405a5b', '#4b6260', '#3a5359'][idx % 3]
                                    : ['#8c795f', '#746c61', '#a08b6c'][idx % 3])
                                : feature.zone === 'forest'
                                ? (idx % 3 === 0 ? "#3A5F3A" : idx % 3 === 1 ? "#34543A" : "#2D4A33")
                                : (idx % 3 === 0 ? "#8B6914" : idx % 3 === 1 ? "#A0522D" : "#CD853F")}
                            roughness={0.8}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                </RigidBody>
            ))}
            
            {/* Trees in forest and desert areas (before valley at 250) */}
            {[
                // Forest perimeter trees (60-100 range)
                [-25, 0, -70], [25, 0, -70], // North area
                [-25, 0, 70], [25, 0, 70], // South area
                [70, 0, -25], [70, 0, 25], // East area
                [-70, 0, -25], [-70, 0, 25], // West area
                [-70, 0, -40], [70, 0, -40], [-70, 0, 40], [70, 0, 40],

                // Digital Desert scattered trees (100-200 range) - sparse desert vegetation
                [-100, 0, -100], [100, 0, -100], [-100, 0, 100], [100, 0, 100],
                [-120, 0, -80], [120, 0, -80], [-120, 0, 80], [120, 0, 80],
                [-80, 0, -120], [80, 0, -120], [-80, 0, 120], [80, 0, 120],
                [-150, 0, -50], [150, 0, -50], [-150, 0, 50], [150, 0, 50],
                [-50, 0, -150], [50, 0, -150], [-50, 0, 150], [50, 0, 150],
                [-140, 0, -60], [140, 0, -60], [-140, 0, 60], [140, 0, 60],
                [-60, 0, -140], [60, 0, -140], [-60, 0, 140], [60, 0, 140],
                [-180, 0, -70], [180, 0, -70], [-180, 0, 70], [180, 0, 70],
                [-70, 0, -180], [70, 0, -180], [-70, 0, 180], [70, 0, 180],

                // Desert edge trees (near valley rim, 180-220 range)
                [-180, 0, -180], [180, 0, -180], [-180, 0, 180], [180, 0, 180],
                [190, 0, -30], [-190, 0, 30], [30, 0, 190], [-30, 0, -190],
                [170, 0, -110], [-170, 0, 110], [110, 0, 170], [-110, 0, -170],
                [-200, 0, 0], [200, 0, 0], [0, 0, -200], [0, 0, 200],
            ].map((position, idx) => (
                <TreeLoader
                    adventureStyle={adventureStyle}
                    key={`outside-tree-${idx}`}
                    position={position as [number, number, number]}
                    scale={(0.6 + Math.sin(idx * 0.1) * 0.2) * 10}
                    treeType="tree"
                />
            ))}

            {/* Dead/sparse trees in the valley (below the rim) - at lower Y positions */}
            {[
                [-280, -40, -60], [280, -40, -60], [-280, -40, 60], [280, -40, 60],
                [-60, -40, -280], [60, -40, -280], [-60, -40, 280], [60, -40, 280],
                [-300, -50, 0], [300, -50, 0], [0, -50, -300], [0, -50, 300],
                [-250, -35, -150], [250, -35, -150], [-250, -35, 150], [250, -35, 150],
            ].map((position, idx) => (
                <TreeLoader
                    adventureStyle={adventureStyle}
                    key={`valley-tree-${idx}`}
                    position={position as [number, number, number]}
                    scale={(0.4 + Math.sin(idx * 0.15) * 0.15) * 8} // Smaller, sparser valley trees
                    treeType="tree"
                />
            ))}
            
            {/* Rocks in forest and desert areas */}
            {[
                // Forest perimeter rocks
                [-35, 0, -60], [35, 0, -60],
                [-35, 0, 60], [35, 0, 60],
                [60, 0, -35], [60, 0, 35],
                [-60, 0, -35], [-60, 0, 35],
                [-90, 0, -90], [90, 0, -90], [-90, 0, 90], [90, 0, 90],
                [-50, 0, -30], [50, 0, -30], [-50, 0, 30], [50, 0, 30],
                [-80, 0, -40], [80, 0, -40], [-80, 0, 40], [80, 0, 40],
                [-40, 0, -80], [40, 0, -80], [-40, 0, 80], [40, 0, 80],

                // Desert rocks
                [-110, 0, -45], [110, 0, -45], [-110, 0, 45], [110, 0, 45],
                [-45, 0, -110], [45, 0, -110], [-45, 0, 110], [45, 0, 110],
                [-130, 0, -65], [130, 0, -65], [-130, 0, 65], [130, 0, 65],
                [-65, 0, -130], [65, 0, -130], [-65, 0, 130], [65, 0, 130],
                [-170, 0, -90], [170, 0, -90], [-170, 0, 90], [170, 0, 90],
                [-90, 0, -170], [90, 0, -170], [-90, 0, 170], [90, 0, 170],
                [195, 0, 10], [-195, 0, -10], [10, 0, -195], [-10, 0, 195],
                [115, 0, -115], [-115, 0, 115], [155, 0, 155], [-155, 0, -155],
                [185, 0, -115], [-185, 0, 115], [115, 0, 185], [-115, 0, -185],
                [-190, 0, -190], [190, 0, -190], [-190, 0, 190], [190, 0, 190],
            ].map((position, idx) => (
                <TreeLoader
                    adventureStyle={adventureStyle}
                    key={`rock-${idx}`}
                    position={position as [number, number, number]}
                    scale={(0.7 + Math.cos(idx * 0.2) * 0.3) * 10}
                    treeType="rock"
                />
            ))}

            {/* Valley floor boulders - at lower Y positions matching valley depth */}
            {[
                [-265, -45, -75], [265, -45, -75], [-265, -45, 75], [265, -45, 75],
                [-75, -45, -265], [75, -45, -265], [-75, -45, 265], [75, -45, 265],
                [-300, -55, -100], [300, -55, -100], [-300, -55, 100], [300, -55, 100],
                [-320, -55, 0], [320, -55, 0], [0, -55, -320], [0, -55, 320],
                [-280, -50, -200], [280, -50, -200], [-280, -50, 200], [280, -50, 200],
            ].map((position, idx) => (
                <TreeLoader
                    adventureStyle={adventureStyle}
                    key={`valley-rock-${idx}`}
                    position={position as [number, number, number]}
                    scale={(1.0 + Math.cos(idx * 0.3) * 0.4) * 12}
                    treeType="rock"
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
                
                // Desert vegetation (sparse, within 200 range)
                [-185, 0, -65], [185, 0, -65], [-185, 0, 65], [185, 0, 65],
                [-65, 0, -185], [65, 0, -185], [-65, 0, 185], [65, 0, 185],
                [-175, 0, -175], [175, 0, -175], [-175, 0, 175], [175, 0, 175],
                [195, 0, 15], [-195, 0, -15], [15, 0, -195], [-15, 0, 205],
                [125, 0, -125], [-125, 0, 125], [165, 0, 165], [-165, 0, -165],
            ].map((position, idx) => (
                <TreeLoader
                    adventureStyle={adventureStyle}
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
