import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Small, texture-free prop: three draw calls, no lights or particles. Units match merc.glb. */
export function createAdventureWeapon() {
  const gun = new THREE.Group()
  gun.name = 'adventure-flamethrower'
  const dark: THREE.BufferGeometry[] = []
  const brass: THREE.BufferGeometry[] = []
  const red: THREE.BufferGeometry[] = []
  function box(parts: THREE.BufferGeometry[], size: number[], at: number[]) {
    parts.push(new THREE.BoxGeometry(...size as [number, number, number]).translate(...at as [number, number, number]))
  }
  function cylinder(parts: THREE.BufferGeometry[], radius: number, length: number, at: number[], horizontal = false) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 8)
    if (horizontal) geometry.rotateX(Math.PI / 2)
    parts.push(geometry.translate(...at as [number, number, number]))
  }
  // The grip is the origin; the nozzle points along model +Z.
  box(dark, [.065, .14, .075], [0, 0, 0])
  box(dark, [.14, .105, .25], [0, .1, .035])
  cylinder(dark, .045, .29, [0, .1, .285], true)
  cylinder(brass, .065, .07, [0, .1, .445], true)
  cylinder(brass, .055, .035, [0, .1, .19], true)
  cylinder(red, .065, .19, [.105, .005, .06])
  cylinder(brass, .04, .03, [.105, .11, .06])
  box(brass, [.025, .022, .24], [0, .17, .095])
  for (const [parts, color] of [[dark, '#222a28'], [brass, '#bc9250'], [red, '#944a30']] as const) {
    const geometry = mergeGeometries(parts)
    parts.forEach(part => part.dispose())
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .22, flatShading: true }))
    mesh.userData.adventureWeapon = true
    gun.add(mesh)
  }
  const muzzle = new THREE.Object3D()
  muzzle.name = 'adventure-weapon-muzzle'
  muzzle.position.set(0, .1, .49)
  gun.add(muzzle)
  return gun
}

export function disposeAdventureWeapon(gun: THREE.Group) {
  gun.removeFromParent()
  gun.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach(material => material.dispose())
    }
  })
}
