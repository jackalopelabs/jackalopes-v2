import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const RANGE = 70
const MAX_OVERLAYS = 64
const MAX_SOURCE_VERTICES = 12000

type Echo = {
    source: THREE.Mesh
    lines: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>
}

// Only explicitly tagged static scenery can echo. Player models, pickups,
// particles and HUDs never become candidates, even when built from plain meshes.
function isSceneryMesh(object: THREE.Object3D): object is THREE.Mesh {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false
    const vertices = mesh.geometry?.getAttribute('position')?.count ?? 0
    if (!vertices || vertices > MAX_SOURCE_VERTICES) return false
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (materials.some(material => !material.visible || material.transparent || (material as THREE.ShaderMaterial).isShaderMaterial)) return false
    let ancestor: THREE.Object3D | null = mesh
    let tagged = false
    while (ancestor) {
        if (!ancestor.visible || ancestor.userData.holographicSkip) return false
        if (ancestor.userData.holographicScenery) tagged = true
        ancestor = ancestor.parent
    }
    return tagged
}

/** A local, short-range sonar echo. Original materials/geometries are never altered. */
export function HolographicVision({ active }: { active: boolean }) {
    const { scene } = useThree()
    const runtime = useRef<{ tick: (elapsed: number, delta: number, enabled: boolean) => void } | null>(null)

    useEffect(() => {
        const group = new THREE.Group()
        group.name = 'golden-mushroom-sonar'
        group.userData.holographicSkip = true
        scene.add(group)
        const echoes = new Map<number, Echo>()
        const center = new THREE.Vector3()
        const bounds = new THREE.Sphere()
        const cyan = new THREE.Color('#50edff')
        const violet = new THREE.Color('#b784ff')
        let strength = 0
        let refreshIn = 0

        const remove = (id: number, echo: Echo) => {
            group.remove(echo.lines)
            echo.lines.geometry.dispose()
            echo.lines.material.dispose()
            echoes.delete(id)
        }
        const clear = () => { for (const [id, echo] of echoes) remove(id, echo) }

        runtime.current = {
            tick(elapsed, delta, enabled) {
                const player = window.__localPlayerPosition
                strength = THREE.MathUtils.damp(strength, enabled && !!player ? 1 : 0, 3, delta)
                if (strength < 0.001) {
                    clear()
                    refreshIn = 0
                    return
                }
                if (!player) return
                refreshIn -= delta
                if (refreshIn <= 0) {
                    refreshIn = 0.75
                    const candidates: { mesh: THREE.Mesh; distance: number }[] = []
                    scene.updateMatrixWorld(true)
                    scene.traverseVisible(object => {
                        if (!isSceneryMesh(object)) return
                        if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere()
                        bounds.copy(object.geometry.boundingSphere!).applyMatrix4(object.matrixWorld)
                        // Test bounds, not the origin: large rocks/tree crowns
                        // may be close even when their object origins are not.
                        const distance = Math.max(0, bounds.center.distanceTo(player) - bounds.radius)
                        if (distance < RANGE) candidates.push({ mesh: object, distance })
                    })
                    candidates.sort((a, b) => a.distance - b.distance)
                    const selected = candidates.slice(0, MAX_OVERLAYS)
                    const ids = new Set(selected.map(({ mesh }) => mesh.id))
                    for (const [id, echo] of echoes) if (!ids.has(id)) remove(id, echo)
                    for (const { mesh } of selected) {
                        if (echoes.has(mesh.id)) continue
                        const geometry = new THREE.EdgesGeometry(mesh.geometry, 24)
                        const material = new THREE.LineBasicMaterial({
                            color: cyan, transparent: true, opacity: 0,
                            depthTest: false, depthWrite: false,
                            blending: THREE.AdditiveBlending, toneMapped: false,
                        })
                        const lines = new THREE.LineSegments(geometry, material)
                        lines.matrixAutoUpdate = false
                        lines.renderOrder = 30
                        lines.raycast = () => {}
                        group.add(lines)
                        echoes.set(mesh.id, { source: mesh, lines })
                    }
                }
                for (const { source, lines } of echoes.values()) {
                    lines.visible = isSceneryMesh(source) && !!source.parent
                    if (!lines.visible) continue
                    lines.matrix.copy(source.matrixWorld)
                    bounds.copy(source.geometry.boundingSphere!).applyMatrix4(source.matrixWorld)
                    center.copy(bounds.center)
                    const distance = Math.max(0, center.distanceTo(player) - bounds.radius)
                    const rangeFade = 1 - THREE.MathUtils.smoothstep(distance, 40, RANGE)
                    // One broad, slow pulse every eight seconds. No flashes.
                    const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI / 4 - distance * 0.075)
                    lines.material.opacity = strength * rangeFade * (0.10 + pulse * 0.23)
                    lines.material.color.copy(cyan).lerp(violet, 0.5 + 0.5 * Math.sin(elapsed * 0.35 + distance * 0.045))
                }
            },
        }
        return () => {
            runtime.current = null
            clear()
            scene.remove(group)
        }
    }, [scene])

    useFrame(({ clock }, delta) => runtime.current?.tick(clock.elapsedTime, delta, active))
    return null
}
