import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { ConnectionManager } from '../network/ConnectionManager'
import { getActiveGamepad } from '../common/hooks/use-gamepad'
import { adventureDestructibles, destroyAdventureObject, getDestroyedAdventureObjectIds, applyDestroyedAdventureObjectIds } from './adventure-destructibles'
import { adventureCombatState } from './adventure-combat-state'

const RANGE = 24, INTERVAL = 180, PARTICLES = 128
const validVector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 2000)
type Shot = { event_type: 'adventure_fire'; shotId: string; player?: string; origin: [number, number, number]; direction: [number, number, number]; distance: number; target?: string; objectId?: string }

/** Short hitscan bursts plus a fixed visual pool: no projectile bodies or extra lights. */
export function AdventureCombat({ connectionManager, astronaut, playerRef }: { connectionManager: ConnectionManager; astronaut: boolean; playerRef: React.RefObject<any> }) {
  const { gl, camera, scene } = useThree()
  const { world, rapier } = useRapier()
  const wasShooting = useRef(false)
  const mouse = useRef(false), lastFire = useRef(0), counter = useRef(0)
  const particles = useRef<THREE.InstancedMesh>(null)
  const seen = useRef(new Set<string>())
  const bursts = useRef<{ at: number; origin: THREE.Vector3; direction: THREE.Vector3; distance: number }[]>([])
  const work = useMemo(() => ({ origin: new THREE.Vector3(), direction: new THREE.Vector3(), point: new THREE.Vector3(), aim: new THREE.Vector3(), centre: new THREE.Vector3(), ray: new THREE.Ray(), sphere: new THREE.Sphere(), dummy: new THREE.Object3D(), color: new THREE.Color() }), [])
  const process = (event: Shot) => {
    if (!event || event.event_type !== 'adventure_fire' || typeof event.shotId !== 'string' || event.shotId.length > 120 || !validVector(event.origin) || !validVector(event.direction) || seen.current.has(event.shotId)) return
    seen.current.add(event.shotId)
    if (seen.current.size > 256) seen.current.delete(seen.current.values().next().value!)
    const direction = new THREE.Vector3(...event.direction)
    if (direction.lengthSq() < .5 || direction.lengthSq() > 1.5) return
    direction.normalize()
    bursts.current.push({ at: performance.now(), origin: new THREE.Vector3(...event.origin), direction, distance: Math.max(.1, Math.min(RANGE, Number(event.distance) || RANGE)) })
    if (bursts.current.length > 8) bursts.current.shift()
    if (event.objectId && typeof event.objectId === 'string') destroyAdventureObject(event.objectId)
    if (event.target && typeof event.target === 'string') window.dispatchEvent(new CustomEvent('jackalopes:adventure-hit', { detail: { playerId: event.target, shotId: event.shotId } }))
  }
  const processRef = useRef(process); processRef.current = process
  useEffect(() => {
    const receive = (event: any) => {
      if (event?.event_type === 'adventure_world_request' && event.player !== connectionManager.getPlayerId()) {
        connectionManager.sendMessage({ type: 'game_event', event: { event_type: 'adventure_world_state', target: event.player, ids: getDestroyedAdventureObjectIds() } })
      } else if (event?.event_type === 'adventure_world_state' && event.target === connectionManager.getPlayerId()) applyDestroyedAdventureObjectIds(event.ids)
      else processRef.current(event)
    }
    const request = () => connectionManager.sendMessage({ type: 'game_event', event: { event_type: 'adventure_world_request' } })
    const first = setTimeout(request, 2000), retry = setTimeout(request, 7000)
    connectionManager.on('game_event', receive)
    return () => { connectionManager.off('game_event', receive); clearTimeout(first); clearTimeout(retry) }
  }, [connectionManager])
  useEffect(() => {
    const down = (event: PointerEvent) => { if (event.pointerType === 'mouse' && event.button === 0) mouse.current = true }
    const stop = () => { mouse.current = false }
    gl.domElement.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', stop); window.addEventListener('blur', stop); document.addEventListener('visibilitychange', stop)
    return () => { gl.domElement.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', stop); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop) }
  }, [gl])
  useEffect(() => { mouse.current = false }, [astronaut])
  useFrame(() => {
    const now = performance.now(), player = window.__localPlayerPosition
    const shooting = astronaut && player && Date.now() > adventureCombatState.deadUntil && document.visibilityState === 'visible' && (mouse.current || (getActiveGamepad()?.buttons[7]?.value || 0) > .1)
    if (shooting) {
      camera.getWorldDirection(work.direction).normalize()
      adventureCombatState.aimingUntil = Date.now() + 300
      adventureCombatState.aimHeading = Math.atan2(work.direction.x, work.direction.z) - Math.PI
      if (!wasShooting.current) lastFire.current = now - INTERVAL + 50
    }
    wasShooting.current = !!shooting
    if (shooting && now - lastFire.current >= INTERVAL) {
      lastFire.current = now
      camera.getWorldDirection(work.direction).normalize()
      camera.getWorldPosition(work.aim)
      work.ray.set(work.aim, work.direction)
      let aimDistance = RANGE + work.aim.distanceTo(player)
      const cameraSolid = world.castRay(new rapier.Ray(work.aim, work.direction), aimDistance, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, playerRef.current?.rigidBody, collider => !!collider.parent()?.isFixed())
      if (cameraSolid) aimDistance = cameraSolid.timeOfImpact
      for (const object of adventureDestructibles.values()) {
        const p = object.position(); if (!p) continue
        work.sphere.set(p, object.radius)
        const hit = work.ray.intersectSphere(work.sphere, work.point)
        if (hit) aimDistance = Math.min(aimDistance, hit.distanceTo(work.aim))
      }
      for (const data of Object.values((window as any).__livePlayerData || {}) as any[]) {
        if (!data.position) continue
        work.centre.set(data.position.x, data.position.y + .2, data.position.z)
        work.sphere.set(work.centre, 1)
        const hit = work.ray.intersectSphere(work.sphere, work.point)
        if (hit) aimDistance = Math.min(aimDistance, hit.distanceTo(work.aim))
      }
      work.aim.addScaledVector(work.direction, aimDistance)
      work.origin.set(player.x, player.y + .5, player.z).addScaledVector(work.direction, .9)
      // Use the hand-mounted muzzle when loaded, keeping the shot outside our own body.
      const model = scene.getObjectByName('adventure-astronaut')
      const muzzle = model?.getObjectByName('adventure-weapon-muzzle')
      if (muzzle) muzzle.getWorldPosition(work.origin)
      adventureCombatState.aimingUntil = Date.now() + 300
      adventureCombatState.aimHeading = Math.atan2(work.direction.x, work.direction.z) - Math.PI
      // A wall between the camera and muzzle must never turn a burst backwards.
      if (work.point.subVectors(work.aim, work.origin).dot(work.direction) <= .1) work.aim.copy(work.origin).addScaledVector(work.direction, RANGE)
      work.direction.subVectors(work.aim, work.origin).normalize()
      work.ray.set(work.origin, work.direction)
      let distance = RANGE, target: string | undefined, objectId: string | undefined
      const solid = world.castRay(new rapier.Ray(work.origin, work.direction), RANGE, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, playerRef.current?.rigidBody, collider => !!collider.parent()?.isFixed())
      if (solid) {
        distance = solid.timeOfImpact
        const id = (solid.collider.parent()?.userData as any)?.adventureDestructibleId
        if (typeof id === 'string' && adventureDestructibles.has(id)) objectId = id
      }
      for (const [id, object] of adventureDestructibles) {
        const p = object.position(); if (!p) continue
        work.sphere.set(p, object.radius)
        const hit = work.ray.intersectSphere(work.sphere, work.point)
        if (!hit) continue
        const d = hit.distanceTo(work.origin)
        if (d < distance && d <= RANGE) { distance = d; objectId = id; target = undefined }
      }
      const live = (window as any).__livePlayerData || {}
      for (const [id, data] of Object.entries(live) as [string, any][]) {
        if (!data.position || id === connectionManager.getPlayerId() || Date.now() - data.lastUpdate > 5000) continue
        work.centre.set(data.position.x, data.position.y, data.position.z)
        // Three stacked spheres approximate the standing capsule without triangle tests.
        for (const y of [-.7, .2, 1.0]) {
          work.sphere.set(work.centre, .85); work.sphere.center.y += y
          const hit = work.ray.intersectSphere(work.sphere, work.point)
          if (!hit) continue
          const d = hit.distanceTo(work.origin)
          if (d < distance) { distance = d; target = id; objectId = undefined }
        }
      }
      const shot: Shot = { event_type: 'adventure_fire', shotId: `${connectionManager.getPlayerId()}-${Date.now()}-${counter.current++}`, origin: work.origin.toArray() as any, direction: work.direction.toArray() as any, distance, target, objectId }
      processRef.current(shot)
      connectionManager.sendMessage({ type: 'game_event', event: shot })
    }
    if (!particles.current) return
    if (!bursts.current.some(burst => now - burst.at < 420)) { particles.current.count = 0; return }
    let index = 0
    for (const burst of bursts.current) {
      const age = (now - burst.at) / 1000
      if (age > .42) continue
      for (let i = 0; i < 16 && index < PARTICLES; i++) {
        const travel = Math.min(burst.distance, age * 65 + i * .12)
        work.dummy.position.copy(burst.origin).addScaledVector(burst.direction, travel)
        work.dummy.position.x += Math.sin(i * 9 + age * 17) * age * .65
        work.dummy.position.y += Math.cos(i * 7 + age * 13) * age * .65
        work.dummy.scale.setScalar((.11 + age * .5) * (1 - age / .42))
        work.dummy.updateMatrix(); particles.current.setMatrixAt(index, work.dummy.matrix)
        work.color.set(i % 3 ? '#ff6b20' : '#ffd879'); particles.current.setColorAt(index++, work.color)
      }
    }
    particles.current.count = index
    particles.current.instanceMatrix.needsUpdate = true
    if (particles.current.instanceColor) particles.current.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={particles} name="adventure-flame-pool" args={[undefined, undefined, PARTICLES]} frustumCulled={false} userData={{ holographicSkip: true }}>
    <icosahedronGeometry args={[1, 0]} /><meshBasicMaterial toneMapped={false} />
  </instancedMesh>
}
