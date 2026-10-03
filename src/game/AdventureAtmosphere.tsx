import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

declare global {
    interface Window {
        __localPlayerPosition?: THREE.Vector3
    }
}

const skyVertex = /* glsl */ `
    varying vec3 vDirection;
    void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const skyFragment = /* glsl */ `
    varying vec3 vDirection;
    uniform vec3 zenith;
    uniform vec3 horizon;
    uniform vec3 nadir;
    uniform vec3 dusk;
    void main() {
        vec3 direction = normalize(vDirection);
        float height = direction.y;
        // A broad, continuous twilight falloff, without bands or a visible sun.
        float overhead = pow(clamp(height, 0.0, 1.0), 0.48);
        vec3 color = mix(horizon, zenith, overhead);
        color = mix(color, nadir, smoothstep(0.0, 0.65, -height));
        float rim = exp(-pow((height - 0.065) / 0.24, 2.0));
        float west = pow(max(dot(direction, normalize(vec3(-0.8, 0.0, -0.6))), 0.0), 4.0);
        color += dusk * rim * west * 0.28;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
    }
`

const moteVertex = /* glsl */ `
    uniform float elapsed;
    uniform float pixelRatio;
    uniform vec3 anchor;
    attribute float seed;
    varying float vAlpha;
    varying float vWarmth;
    void main() {
        vec3 world = position;
        world.x += sin(elapsed * 0.13 + seed * 19.0) * 1.4;
        world.z += cos(elapsed * 0.09 + seed * 31.0) * 1.4;
        world.xz = mod(world.xz - anchor.xz + 32.0, 64.0) - 32.0 + anchor.xz;
        world.y += anchor.y + sin(elapsed * 0.22 + seed * 23.0) * 0.45;
        vec4 view = viewMatrix * vec4(world, 1.0);
        float distanceToAnchor = length(world.xz - anchor.xz);
        vAlpha = (1.0 - smoothstep(19.0, 29.0, distanceToAnchor)) *
            smoothstep(1.5, 5.0, -view.z) * 0.48;
        vWarmth = step(0.35, seed);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(36.0 / max(1.0, -view.z), 1.5, 4.5) * pixelRatio;
    }
`

const moteFragment = /* glsl */ `
    varying float vAlpha;
    varying float vWarmth;
    uniform vec3 cool;
    uniform vec3 warm;
    void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        if (radius > 1.0) discard;
        float glow = pow(1.0 - radius, 2.0);
        gl_FragColor = vec4(mix(cool, warm, vWarmth), glow * vAlpha);
        #include <colorspace_fragment>
    }
`

/** Two inexpensive draw calls; JSX-owned geometries and materials dispose on unmount. */
export function AdventureAtmosphere({ motes = true }: { motes?: boolean }) {
    const sky = useRef<THREE.Mesh>(null)
    const skyUniforms = useMemo(() => ({
        zenith: { value: new THREE.Color('#080f23') },
        horizon: { value: new THREE.Color('#344f61') },
        nadir: { value: new THREE.Color('#142d39') },
        dusk: { value: new THREE.Color('#aa8270') },
    }), [])
    const moteUniforms = useMemo(() => ({
        elapsed: { value: 0 },
        pixelRatio: { value: 1 },
        anchor: { value: new THREE.Vector3() },
        cool: { value: new THREE.Color('#8ac9cc') },
        warm: { value: new THREE.Color('#ddbd75') },
    }), [])
    const particles = useMemo(() => {
        const positions = new Float32Array(42 * 3)
        const seeds = new Float32Array(42)
        // Stable scatter: reloads and React renders never relocate the particles.
        let randomState = 7919
        const random = () => {
            randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
            return randomState / 4294967296
        }
        for (let index = 0; index < seeds.length; index++) {
            positions[index * 3] = random() * 64
            positions[index * 3 + 1] = 0.8 + random() * 8
            positions[index * 3 + 2] = random() * 64
            seeds[index] = random()
        }
        return { positions, seeds }
    }, [])

    useFrame(({ camera, clock, gl }) => {
        if (sky.current) {
            sky.current.position.copy(camera.position)
            // Always remain inside the active camera's far clip, including editor zoom.
            const far = (camera as THREE.PerspectiveCamera).far
            sky.current.scale.setScalar(far * 0.9)
        }
        if (!motes) return
        moteUniforms.elapsed.value = clock.elapsedTime
        moteUniforms.pixelRatio.value = Math.min(gl.getPixelRatio(), 2)
        const player = window.__localPlayerPosition
        if (player) moteUniforms.anchor.value.copy(player)
        else moteUniforms.anchor.value.copy(camera.position)
    })

    return <group userData={{ holographicSkip: true }}>
        <mesh ref={sky} frustumCulled={false} renderOrder={-1000} raycast={() => {}}>
            <sphereGeometry args={[1, 32, 16]} />
            <shaderMaterial
                uniforms={skyUniforms} vertexShader={skyVertex} fragmentShader={skyFragment}
                side={THREE.BackSide} depthWrite={false} depthTest={false} fog={false} toneMapped={false}
            />
        </mesh>
        {motes && <points frustumCulled={false} raycast={() => {}}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={42} array={particles.positions} itemSize={3} />
                <bufferAttribute attach="attributes-seed" count={42} array={particles.seeds} itemSize={1} />
            </bufferGeometry>
            <shaderMaterial
                uniforms={moteUniforms} vertexShader={moteVertex} fragmentShader={moteFragment}
                transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false}
            />
        </points>}
    </group>
}
