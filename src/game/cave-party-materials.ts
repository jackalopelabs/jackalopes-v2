import { isPartyAir } from './cave-party-room'
import { isWithinCaveFootprint, caveFloorAt } from './adventure-caves'
import type { TerrainLevelDocument } from './terrain/level-document'
import * as THREE from 'three'

const palette = `vec3 galaxy(float t) {
  return 0.48 + 0.45 * cos(6.28318 * (t + vec3(0.02, 0.36, 0.66)));
}`
const worldVertex = `varying vec3 vWorld;
  void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}`
export function createGalaxyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amount: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: worldVertex,
    fragmentShader: `uniform float time; uniform float amount; varying vec3 vWorld;
      void main() {
        vec2 p=vec2(vWorld.x*.13+vWorld.y*.07, vWorld.z*.14-vWorld.y*.09);
        float flow=sin(p.x*1.5+time*.14+sin(p.y*2.0-time*.09))*.5+.5;
        float cloud=sin(p.x*3.0+p.y*2.0+sin(p.y*3.5+time*.12));
        float dust=sin(p.x*9.0+p.y*7.0+cloud*2.0-time*.08)*.5+.5;
        vec3 purple=vec3(.25,.025,.65), magenta=vec3(.78,.045,.46), cyan=vec3(.015,.55,.85);
        vec3 color=mix(purple,magenta,smoothstep(.25,.8,flow));
        color=mix(color,cyan,smoothstep(.25,.95,cloud)*.8);
        color+=vec3(.07,.10,.22)*dust;
        float edge=(1.0-smoothstep(-176.0,-172.0,vWorld.z));
        gl_FragColor=vec4(color,amount*edge*.86);
        #include <colorspace_fragment>
      }`,
  })
}
export function createPartyRGBMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amount: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: worldVertex,
    fragmentShader: `uniform float time;uniform float amount;varying vec3 vWorld;${palette}
      void main(){
        gl_FragColor=vec4(galaxy(vWorld.x*.025+vWorld.z*.02-time*.025),amount*.9);
        #include <colorspace_fragment>
      }`,
  })
}
export function createPartyStarGeometry(level: TerrainLevelDocument) {
  const positions: number[] = [], seeds: number[] = []
  const levelFloor = caveFloorAt(level, 0, -187)!
  // Stable, softly radial cool stars related to the existing sky, not flashing pixels.
  for (let i = 0; i < 132; i++) {
    const x = Math.sin(i * 78.233) * 19, z = -180 - (Math.sin(i * 12.9898) * .5 + .5) * 9
    const y = levelFloor + 7 + (Math.sin(i * 9.2) * .5 + .5) * 6
    if (!isPartyAir(level, { x, y, z }, 1) || !isWithinCaveFootprint(x - .6, z - .6) || !isWithinCaveFootprint(x + .6, z + .6)) continue
    positions.push(x, y, z)
    seeds.push(i * .618033 % 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
  return geometry
}
export function createPartyStarMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amount: { value: 0 }, pixelRatio: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float time;uniform float pixelRatio;attribute float seed;varying float vTwinkle;
      void main(){vec3 p=position;
        p.x+=sin(time*.3+seed*19.0)*.45;p.z+=cos(time*.25+seed*31.0)*.4;p.y+=sin(time*.4+seed*21.0)*.28;
        vec4 view=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(80.0/max(1.0,-view.z),2.0,7.0)*pixelRatio;
        vTwinkle=.72+.28*sin(time*.5+seed*40.0);}`,
    fragmentShader: `uniform float amount;varying float vTwinkle;
      void main(){float d=length(gl_PointCoord-.5)*2.0;if(d>1.0)discard;
        float alpha=1.0-smoothstep(0.0,1.0,d);
        gl_FragColor=vec4(vec3(.71,.83,1.0)*vTwinkle,alpha*amount*.85);
        #include <colorspace_fragment>
      }`,
  })
}
export function createPartyBalloonMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amount: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vNormal;varying vec3 vView;varying vec3 vWorld;
      void main(){vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);vWorld=world.xyz;
        vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);vView=cameraPosition-world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float time;uniform float amount;varying vec3 vNormal;varying vec3 vView;varying vec3 vWorld;${palette}
      void main(){vec3 n=normalize(vNormal),v=normalize(vView);float facing=abs(dot(n,v));float rim=pow(1.0-facing,2.0);
        vec3 color=galaxy(n.y*.35+n.x*.2+vWorld.x*.04+time*.014);
        float gloss=pow(max(0.0,dot(reflect(-v,n),normalize(vec3(-.4,.9,.3)))),28.0);
        color=mix(color,vec3(.9,.98,1.0),gloss*.85);
        gl_FragColor=vec4(color,amount*(.10+rim*.46+gloss*.25));
        #include <colorspace_fragment>
      }`,
  })
}
