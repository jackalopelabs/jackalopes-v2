import * as THREE from 'three'
/** Cheap soft cylindrical envelopes around existing clipped laser cores, not a postprocess. */
export function createPartyBeamGlow() {
  return new THREE.ShaderMaterial({
    uniforms: { amount: { value: 0 } }, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: `varying vec3 vColor;varying float vFacing;varying vec2 vUv;
      void main(){vec3 p=position;p.xz*=6.0;
        vec4 view=modelViewMatrix*instanceMatrix*vec4(p,1.0);
        vFacing=abs(dot(normalize(normalMatrix*mat3(instanceMatrix)*normal),normalize(-view.xyz)));
        vUv=uv;
        #ifdef USE_INSTANCING_COLOR
          vColor=instanceColor;
        #else
          vColor=vec3(.4,.7,1.0);
        #endif
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `uniform float amount;varying vec3 vColor;varying float vFacing;varying vec2 vUv;
      void main(){float endFade=smoothstep(0.0,.06,vUv.y)*(1.0-smoothstep(.92,1.0,vUv.y));
        gl_FragColor=vec4(vColor,amount*.16*vFacing*vFacing*endFade);
        #include <colorspace_fragment>
      }`,
  })
}
