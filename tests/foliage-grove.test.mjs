import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import * as THREE from 'three'
const compiled = await build({ stdin: { contents: `export * from './src/game/foliage-grove';export * from './src/game/terrain/level-document';`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false })
const { createGrovePlacements, GROVE_CENTER, GROVE_RADIUS, createTerrainLevel, TERRAIN_SEGMENTS, TERRAIN_SIZE, terrainHeightAtVertex } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

test('grove is bounded, deterministic, budgeted and never modifies the shared terrain', () => {
  const level = createTerrainLevel(); const saved = JSON.stringify(level)
  const a = createGrovePlacements(level)
  assert.deepEqual(a, createGrovePlacements(level))
  assert.equal(JSON.stringify(level), saved)
  assert(a.grass.length > 1000 && a.grass.length <= 1800)
  assert(a.ferns.length > 20 && a.ferns.length <= 70)
  for (const p of [...a.grass, ...a.ferns]) {
    assert(Object.values(p).every(Number.isFinite))
    assert(Math.hypot(p.x-GROVE_CENTER.x,p.z-GROVE_CENTER.z) <= GROVE_RADIUS)
    assert(Math.hypot(p.x+100,p.z-10) >= 3.5, 'spawn clearing stays open')
  }
})

test('flooding the grove removes decorative foliage without lowering water or terrain', () => {
  const level = createTerrainLevel(); level.waterMask.fill(1); level.waterLevel = 80
  const saved = JSON.stringify(level)
  assert.deepEqual(createGrovePlacements(level), { grass: [], ferns: [] })
  assert.equal(JSON.stringify(level), saved)
})

test('a raised sculpted grove grounds roots against actual terrain triangles', () => {
  const level = createTerrainLevel(); level.heightOffsets.fill(7)
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  const position = geometry.attributes.position
  for (let i=0;i<position.count;i++) position.setZ(i,terrainHeightAtVertex(level,i%(TERRAIN_SEGMENTS+1),Math.floor(i/(TERRAIN_SEGMENTS+1))))
  geometry.rotateX(-Math.PI/2)
  const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide})
  const terrain = new THREE.Mesh(geometry,material);terrain.position.y=-0.02;terrain.updateMatrixWorld(true)
  const plants = createGrovePlacements(level)
  for (const p of [...plants.grass.slice(0,12), ...plants.ferns.slice(0,6)]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(p.x,200,p.z),new THREE.Vector3(0,-1,0)).intersectObject(terrain)[0]
    assert(hit);assert(Math.abs(hit.point.y-p.y-0.01)<1e-5, 'roots are buried only 1cm in rendered ground')
  }
  geometry.dispose();material.dispose()
})
