import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createGrovePlacements, GROVE_CENTER, type GrovePlant } from './foliage-grove'
import { loadTerrainLevel } from './terrain/level-document'

type Vertex = [number, number, number]

/** Opaque, shaped leaves rather than alpha cards: no texture fetches or overdraw stacks. */
function plantGeometry(fern: boolean) {
    const positions: number[] = []
    const colors: number[] = []
    const rootColor = new THREE.Color(fern ? '#285a4b' : '#344f36')
    const tipColor = new THREE.Color(fern ? '#91b981' : '#b0b975')
    const color = new THREE.Color()
    const triangle = (a: Vertex, b: Vertex, c: Vertex, warmth = 1) => {
        for (const vertex of [a, b, c]) {
            positions.push(...vertex)
            color.copy(rootColor).lerp(tipColor, THREE.MathUtils.clamp(vertex[1] / 0.7, 0, 1))
                .multiplyScalar(warmth)
            colors.push(color.r, color.g, color.b)
        }
    }
    const rotated = (radial: number, height: number, lateral: number, angle: number): Vertex => [
        Math.cos(angle) * radial - Math.sin(angle) * lateral,
        height,
        Math.sin(angle) * radial + Math.cos(angle) * lateral,
    ]

    if (!fern) {
        // Six different curved blades, with the tip narrowing to a real point.
        for (let blade = 0; blade < 6; blade++) {
            const angle = blade * 2.39996323
            const height = 0.38 + ((blade * 7) % 5) * 0.055
            const reach = 0.18 + (blade % 3) * 0.035
            const root = (blade % 2) * 0.055
            const stages = [0, 0.38, 0.74, 1]
            const widths = [0.024, 0.042, 0.025, 0]
            for (let stage = 0; stage < 3; stage++) {
                const t = stages[stage]
                const next = stages[stage + 1]
                const a = rotated(root + reach * t * t, height * t, -widths[stage], angle)
                const b = rotated(root + reach * t * t, height * t, widths[stage], angle)
                const c = rotated(root + reach * next * next, height * next, -widths[stage + 1], angle)
                const d = rotated(root + reach * next * next, height * next, widths[stage + 1], angle)
                triangle(a, b, c, 0.92 + blade * 0.025)
                if (stage < 2) triangle(b, d, c, 0.92 + blade * 0.025)
            }
        }
    } else {
        // Six arcing fronds with paired, folded lanceolate leaflets.
        for (let frond = 0; frond < 6; frond++) {
            const angle = frond * 2.39996323
            const reach = 0.53 + (frond % 3) * 0.07
            const height = 0.43 + (frond % 2) * 0.08
            const stem = (t: number, side = 0): Vertex => rotated(
                reach * t, Math.sin(t * Math.PI * 0.83) * height + t * 0.07, side, angle,
            )
            for (let section = 0; section < 3; section++) {
                const start = section / 3
                const end = (section + 1) / 3
                triangle(stem(start, -0.008), stem(start, 0.008), stem(end, -0.005))
                triangle(stem(start, 0.008), stem(end, 0.005), stem(end, -0.005))
            }
            for (let pair = 0; pair < 5; pair++) {
                const t = 0.22 + pair * 0.145
                const halfWidth = (0.14 - pair * 0.018) * (1 + (frond % 2) * 0.1)
                for (const side of [-1, 1]) {
                    const base = stem(t)
                    const bladeTip = stem(Math.min(t + 0.16, 1), side * halfWidth)
                    const lower = stem(t + 0.015, side * halfWidth * 0.52)
                    const upper = stem(t + 0.10, side * halfWidth * 0.60)
                    // A small fold catches the cool fill light without smoothing away the facets.
                    lower[1] -= 0.022
                    upper[1] -= 0.014
                    bladeTip[1] -= 0.035
                    triangle(base, lower, bladeTip, 0.94)
                    triangle(base, bladeTip, upper, 1.04)
                }
            }
            triangle(stem(0.87), stem(0.94, -0.04), stem(1.08))
            triangle(stem(0.87), stem(1.08), stem(0.94, 0.04))
        }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    return geometry
}

function plantMaterial(time: { value: number }, motion: { value: number }, fern: boolean) {
    const material = new THREE.MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, roughness: 0.91, metalness: 0,
        side: THREE.DoubleSide, flatShading: true,
        emissive: '#476650', emissiveIntensity: 0.11,
    })
    material.onBeforeCompile = shader => {
        shader.uniforms.groveTime = time
        shader.uniforms.groveMotion = motion
        shader.vertexShader = `uniform float groveTime;\nuniform float groveMotion;\n${shader.vertexShader}`
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
            #include <begin_vertex>
            #ifdef USE_INSTANCING
                vec3 groveRoot = instanceMatrix[3].xyz;
                float grovePhase = groveRoot.x * 0.47 + groveRoot.z * 0.31;
                float groveBend = pow(clamp(position.y / 0.72, 0.0, 1.0), 1.65);
                float groveWave = sin(groveTime * 1.45 + grovePhase) * 0.72
                    + sin(groveTime * 2.1 + grovePhase * 1.7) * 0.28;
                transformed.x += groveWave * groveBend * groveMotion * ${fern ? '0.048' : '0.068'};
                transformed.z += cos(groveTime * 1.1 + grovePhase) * groveBend * groveMotion * 0.028;
            #endif
        `)
    }
    material.customProgramCacheKey = () => `foliage-grove-wind-v1-${fern ? 'fern' : 'grass'}`
    return material
}

function populate(mesh: THREE.InstancedMesh, plants: GrovePlant[]) {
    const transform = new THREE.Object3D()
    const tint = new THREE.Color()
    plants.forEach((plant, index) => {
        transform.position.set(plant.x, plant.y, plant.z)
        transform.rotation.set(0, plant.rotation, 0)
        transform.scale.setScalar(plant.scale)
        transform.updateMatrix()
        mesh.setMatrixAt(index, transform.matrix)
        tint.setRGB(plant.tint, plant.tint, plant.tint)
        mesh.setColorAt(index, tint)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    // Include GPU wind in the otherwise static instance bounds.
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.3
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.userData.holographicSkip = true
    mesh.raycast = () => {}
}

/** Local decoration only: two draws, no physics bodies, network state or alpha textures. */
export function FoliageGrove({ quality }: { quality: string }) {
    const group = useRef<THREE.Group>(null)
    const motion = useMemo(() => ({ value: 1 }), [])
    const time = useMemo(() => ({ value: 0 }), [])
    const placements = useMemo(() => createGrovePlacements(loadTerrainLevel()), [])
    const resources = useMemo(() => {
        const grassGeometry = plantGeometry(false)
        const fernGeometry = plantGeometry(true)
        const grassMaterial = plantMaterial(time, motion, false)
        const fernMaterial = plantMaterial(time, motion, true)
        const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, placements.grass.length)
        const ferns = new THREE.InstancedMesh(fernGeometry, fernMaterial, placements.ferns.length)
        populate(grass, placements.grass)
        populate(ferns, placements.ferns)
        grass.name = 'grove-instanced-grass'
        ferns.name = 'grove-instanced-ferns'
        return { grass, ferns, grassGeometry, fernGeometry, grassMaterial, fernMaterial }
    }, [placements, time, motion])

    useEffect(() => {
        // Preserve deterministic positions across quality changes; only reduce the tail.
        resources.grass.count = Math.floor(placements.grass.length * (quality === 'low' ? 0.60 : 1))
        resources.ferns.count = Math.floor(placements.ferns.length * (quality === 'low' ? 0.65 : 1))
    }, [quality, resources, placements])

    useEffect(() => {
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => { motion.value = preference.matches ? 0 : 1 }
        update()
        preference.addEventListener('change', update)
        return () => preference.removeEventListener('change', update)
    }, [motion])

    useEffect(() => () => {
        resources.grass.dispose()
        resources.ferns.dispose()
        resources.grassGeometry.dispose()
        resources.fernGeometry.dispose()
        resources.grassMaterial.dispose()
        resources.fernMaterial.dispose()
    }, [resources])

    useFrame(({ camera, clock }) => {
        time.value = clock.elapsedTime
        if (group.current) {
            const dx = camera.position.x - GROVE_CENTER.x
            const dz = camera.position.z - GROVE_CENTER.z
            group.current.visible = dx * dx + dz * dz < 90 * 90
        }
    })

    return <group name="foliage-test-grove" ref={group} userData={{ holographicSkip: true }} dispose={null}>
        <primitive object={resources.grass} />
        <primitive object={resources.ferns} />
    </group>
}
