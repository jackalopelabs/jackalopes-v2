import * as THREE from 'three'

export const CAVE_STEAM_SOFTNESS = `vec2 p = (vUv - 0.5) * 2.0;
              p.x += sin(p.y * 5.0) * 0.1;
              float softness = exp(-dot(p, p) * 4.5) * (1.0 - smoothstep(0.6, 1.0, length(p)));`

/** A single inexpensive draw of soft steam wisps, with no textures or particle objects. */
export function createCaveSteamGeometry(count = 9, centers?: readonly (readonly [number, number])[]) {
  const positions: number[] = [], seeds: number[] = [], origins: number[] = [], uv: number[] = []
  for (let puff = 0; puff < count; puff++) {
    const angle = puff * 2.4
    for (const [x, y] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, -.5], [.5, .5], [-.5, .5]]) {
      positions.push(x, y, 0)
      uv.push(x + .5, y + .5)
      seeds.push(puff / count)
      origins.push(centers ? centers[puff % centers.length][0] : Math.cos(angle) * (0.55 + puff % 3 * 0.48),
        centers ? centers[puff % centers.length][1] : Math.sin(angle) * 0.95)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1))
  geometry.setAttribute('origin', new THREE.Float32BufferAttribute(origins, 2))
  return geometry
}

export function createCaveSteamMaterial(height: number) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, waterHeight: { value: height }, rise: { value: 1.65 },
      amount: { value: 1 }, tint: { value: new THREE.Color().setRGB(.82, .9, .85) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
            uniform float time;
            uniform float waterHeight;
            uniform float rise;
            attribute float seed;
            attribute vec2 origin;
            varying vec2 vUv;
            varying float vFade;
            void main() {
              float age = fract(time * 0.11 + seed);
              vec3 center = vec3(origin.x + sin(age * 4.0 + seed * 12.0) * 0.22,
                waterHeight + 0.25 + age * rise, origin.y);
              vec4 view = modelViewMatrix * vec4(center, 1.0);
              view.xy += position.xy * vec2(0.7 + age * 0.6, 0.95 + age * 0.85);
              gl_Position = projectionMatrix * view;
              vUv = uv;
              vFade = sin(age * 3.14159) * 0.16;
            }
          `,
    fragmentShader: `
            uniform float amount;
            uniform vec3 tint;
            varying vec2 vUv;
            varying float vFade;
            void main() {
              ${CAVE_STEAM_SOFTNESS}
              gl_FragColor = vec4(tint, softness * vFade * amount);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }
          `,
  })
}
