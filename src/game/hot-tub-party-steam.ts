import * as THREE from 'three'
import { caveCeilingAt, caveFloorAt, caveLayout, isWithinCaveFootprint } from './adventure-caves'
import { CAVE_HOT_TUB_POSITION, HOT_TUB_WATER_HEIGHT } from './cave-hot-tub'
import { createCaveSteamGeometry, CAVE_STEAM_SOFTNESS } from './cave-steam'
import type { TerrainLevelDocument } from './terrain/level-document'

export const STEAM_PATH_NODES = 48
export const STEAM_BUDGET = { low: 32, full: 80 } as const
// All routes share one water source and a vertical rise before entering connected cave air.
const trunk = [[0, -180], [0, -170], [0, -150], [0, -124]] as const
const routes = [
  [[-7, -185], [-16, -186], [-21, -183]],
  [[0, -181], [4, -178], [16, -179], [19, -182]],
  [...trunk, [-24, -128], [-38, -119]],
  [...trunk, [25, -128], [43, -119]],
  [...trunk, [0, -105], [0, -80], [0, -55], [0, -35], [-25, -39], [-33, -38]],
  [...trunk, [0, -105], [0, -80], [0, -55], [0, -35], [25, -39], [35, -38]],
  [...trunk, [0, -105], [0, -80], [0, -55], [0, -30], [0, -12]],
  [[-5, -181], [-9, -176], [0, -170], [0, -150], [0, -128]],
] as const

export function steamAirFloor(level: TerrainLevelDocument, x: number, z: number) {
  const floor = caveFloorAt(level, x, z)
  return floor === null ? null : Math.max(floor, caveLayout(level).waterLevel)
}
export function steamPointInside(level: TerrainLevelDocument, p: { x: number; y: number; z: number }) {
  const floor = steamAirFloor(level, p.x, p.z), roof = caveCeilingAt(level, p.x, p.z)
  const saunaFloor = caveFloorAt(level, 8.5, -187)!
  return floor !== null && roof !== null && p.y > floor + .04 && p.y < roof - .1 &&
    !(Math.abs(p.x - 8.5) < 2.65 && Math.abs(p.z + 187) < 2.65 && p.y < saunaFloor + 3.65)
}
export function createHotTubSteamPaths(level: TerrainLevelDocument) {
  const { x, z } = CAVE_HOT_TUB_POSITION, floor = caveFloorAt(level, x, z)!
  const source = new THREE.Vector3(x, floor + HOT_TUB_WATER_HEIGHT + .08, z)
  return routes.map(route => {
    const points = [source.clone(), new THREE.Vector3(x, floor + 2.5, z), new THREE.Vector3(x, floor + 4.5, z)]
    for (const [px, pz] of route) {
      const air = steamAirFloor(level, px, pz)!, roof = caveCeilingAt(level, px, pz)!
      points.push(new THREE.Vector3(px, Math.min(air + 4.5, roof - 2), pz))
    }
    const lengths = [0]
    for (let i = 2; i < points.length; i++) lengths.push(lengths[lengths.length - 1] + points[i].distanceTo(points[i - 1]))
    return { points, lengths, life: 28 + lengths[lengths.length - 1] * .45 }
  })
}
/** Match the GPU's piecewise interpolation; early life is reserved for a visible rise over water. */
export function sampleHotTubSteamPath(path: ReturnType<typeof createHotTubSteamPaths>[number], t: number, out: THREE.Vector3) {
  const points = path.points
  if (t <= .18) return out.lerpVectors(points[0], points[1], Math.max(0, t) / .18)
  const distance = Math.min(1, (t - .18) / .82) * path.lengths[path.lengths.length - 1]
  let segment = 1
  while (segment < path.lengths.length - 1 && distance > path.lengths[segment]) segment++
  const start = path.lengths[segment - 1], end = path.lengths[segment]
  return out.lerpVectors(points[segment], points[segment + 1], (distance - start) / Math.max(.001, end - start))
}

const AIR_WIDTH = 112, AIR_HEIGHT = 208
export function createSteamAirTexture(level: TerrainLevelDocument) {
  const data = new Float32Array(AIR_WIDTH * AIR_HEIGHT * 4)
  for (let row = 0; row < AIR_HEIGHT; row++) for (let col = 0; col < AIR_WIDTH; col++) {
    const x = -56 + col + .5, z = -200 + row + .5, offset = (row * AIR_WIDTH + col) * 4
    const floor = steamAirFloor(level, x, z), roof = caveCeilingAt(level, x, z)
    const inside = floor !== null && roof !== null &&
      isWithinCaveFootprint(x - .5, z - .5) && isWithinCaveFootprint(x + .5, z - .5) &&
      isWithinCaveFootprint(x - .5, z + .5) && isWithinCaveFootprint(x + .5, z + .5)
    // Conservative cell extrema stop even the billboard edges at sloped floors/roofs.
    let bottom = floor ?? 0, top = roof ?? 0
    if (inside) for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) {
      bottom = Math.max(bottom, steamAirFloor(level, x + dx, z + dz) ?? bottom)
      top = Math.min(top, caveCeilingAt(level, x + dx, z + dz) ?? top)
    }
    data[offset] = bottom; data[offset + 1] = top; data[offset + 2] = inside ? 1 : 0
  }
  const texture = new THREE.DataTexture(data, AIR_WIDTH, AIR_HEIGHT, THREE.RGBAFormat, THREE.FloatType)
  texture.needsUpdate = true
  return texture
}
export function createHotTubSteamResources(level: TerrainLevelDocument) {
  const paths = createHotTubSteamPaths(level), data = new Float32Array(STEAM_PATH_NODES * paths.length * 4)
  const point = new THREE.Vector3()
  for (let route = 0; route < paths.length; route++) for (let node = 0; node < STEAM_PATH_NODES; node++) {
    const progress = node / (STEAM_PATH_NODES - 1), offset = (route * STEAM_PATH_NODES + node) * 4
    sampleHotTubSteamPath(paths[route], progress, point)
    data[offset] = point.x; data[offset + 1] = point.y; data[offset + 2] = point.z
    data[offset + 3] = .35 + Math.min(1, progress / .35) * (route < 2 ? 1.5 : 2.4)
  }
  const trajectory = new THREE.DataTexture(data, STEAM_PATH_NODES, paths.length, THREE.RGBAFormat, THREE.FloatType)
  trajectory.needsUpdate = true
  const air = createSteamAirTexture(level), geometry = createCaveSteamGeometry(STEAM_BUDGET.full)
  const streams: number[] = []
  // Interleaving routes lets the low-quality prefix retain every connected stream.
  for (let i = 0; i < STEAM_BUDGET.full; i++) for (let v = 0; v < 6; v++) streams.push(i % paths.length, paths[i % paths.length].life)
  geometry.setAttribute('stream', new THREE.Float32BufferAttribute(streams, 2))
  for (let i = 0; i < STEAM_BUDGET.full; i++) for (let v = 0; v < 6; v++) geometry.attributes.seed.setX(i * 6 + v, .02 + ((Math.floor(i / 8) * .381966 + (i % 8) * .113) % 1) * .96)
  return { trajectory, air, geometry }
}

export function createHotTubSteamMaterial(resources: ReturnType<typeof createHotTubSteamResources>, level: TerrainLevelDocument) {
  return new THREE.ShaderMaterial({
    uniforms: { trajectory: { value: resources.trajectory }, air: { value: resources.air },
      time: { value: 0 }, fill: { value: 0 }, amount: { value: 0 }, saunaFloor: { value: caveFloorAt(level, 8.5, -187) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform sampler2D trajectory;uniform float time;uniform float fill;
      attribute float seed;attribute vec2 stream;varying vec2 vUv;varying float vFade;
      varying float vAge;varying vec3 vWorld;
      void main(){
        float age=fract(time/stream.y+seed);float node=age*47.0;float a=floor(node);
        vec4 p=mix(texture2D(trajectory,vec2((a+.5)/48.0,(stream.x+.5)/8.0)),
          texture2D(trajectory,vec2((min(47.0,a+1.0)+.5)/48.0,(stream.x+.5)/8.0)),fract(node));
        float spread=smoothstep(.15,.55,age);
        p.x+=sin(age*8.0+seed*43.0)*(.13+spread*.35);
        p.z+=cos(age*6.0+seed*37.0)*(.13+spread*.35);
        vec4 centerView=viewMatrix*vec4(p.xyz,1.0);
        float nearFade=smoothstep(.7,2.2,-centerView.z);
        // Bound near-camera coverage, rather than letting a wisp become a giant screen quad.
        float radius=min(p.w,max(.1,-centerView.z)*.22)*nearFade;
        vec2 offset=position.xy*radius*2.0;
        vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
        vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vWorld=p.xyz+right*offset.x+up*offset.y;
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
        vUv=uv;vAge=age;
        vFade=nearFade*smoothstep(0.0,.05,age)*(1.0-smoothstep(.84,1.0,age))*
          (1.0-smoothstep(fill-.06,fill,age));
      }`,
    fragmentShader: `uniform sampler2D air;uniform float saunaFloor;uniform float amount;
      varying vec2 vUv;varying float vFade;varying float vAge;varying vec3 vWorld;
      void main(){
        vec2 cell=(vWorld.xz-vec2(-56.0,-200.0))/vec2(112.0,208.0);
        if(any(lessThan(cell,vec2(0.0)))||any(greaterThan(cell,vec2(1.0))))discard;
        vec4 bounds=texture2D(air,cell);
        if(bounds.z<.5||vWorld.y<bounds.x+.04||vWorld.y>bounds.y-.12)discard;
        if(abs(vWorld.x-8.5)<2.65&&abs(vWorld.z+187.0)<2.65&&vWorld.y<saunaFloor+3.65)discard;
        ${CAVE_STEAM_SOFTNESS}
        vec3 warm=vec3(.78,.72,.64), violet=vec3(.33,.25,.55), cyan=vec3(.24,.49,.56);
        vec3 colored=mix(violet,cyan,.5+.5*sin(vWorld.x*.12+vWorld.z*.07));
        vec3 tint=mix(warm,colored,smoothstep(.12,.45,vAge));
        gl_FragColor=vec4(tint,softness*vFade*amount*.15);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}
