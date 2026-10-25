// Post chain: RenderPass -> UnrealBloom (lantern glow) -> ink-wash grade
// (cool shadows, gentle desaturation, vignette, paper grain) -> OutputPass
// (ACES tone mapping + sRGB).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualityLevel } from '../world/water';

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uWarmth: { value: 0.55 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uWarmth;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // ink-wash: cool the shadows toward blue-grey, keep lantern warmth
      col = mix(col * vec3(0.78, 0.87, 1.04), col, smoothstep(0.02, 0.55, l));
      col = mix(vec3(l), col, 0.92);
      col = clamp(col * 1.06 - 0.012, 0.0, 4.0);
      // breathing lantern warmth in the middle of frame
      vec2 q = vUv - 0.5;
      col += vec3(0.055, 0.032, 0.012) * uWarmth * (1.0 - dot(q, q) * 2.4);
      // vignette
      col *= 1.0 - 0.42 * dot(q, q);
      // paper grain, strongest in the darks
      float g = fract(sin(dot(vUv + fract(uTime * 0.11) * 0.13, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.02 * (1.0 - smoothstep(0.0, 0.55, l));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface PostFXResult {
  composer: EffectComposer;
  update: (t: number) => void;
  setSize: (w: number, h: number) => void;
  setQuality: (q: QualityLevel) => void;
}

export function buildPostFX(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): PostFXResult {
  let quality: QualityLevel = 'medium';
  const size = new THREE.Vector2();
  renderer.getSize(size);
  let composer = makeComposer(renderer, scene, camera, quality, size.x, size.y);

  function makeComposer(r: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.Camera, q: QualityLevel, w: number, h: number): EffectComposer {
    const samples = q === 'high' ? 4 : q === 'medium' ? 2 : 0;
    const rt = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
      type: THREE.HalfFloatType,
      samples,
    });
    const comp = new EffectComposer(r, rt);
    comp.addPass(new RenderPass(s, c));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.6, 0.8);
    comp.addPass(bloom);
    const grade = new ShaderPass(gradeShader);
    comp.addPass(grade);
    comp.addPass(new OutputPass());
    comp.setSize(w, h);
    return comp;
  }

  return {
    composer,
    update: (t: number) => {
      gradeShader.uniforms.uTime.value = t;
    },
    setSize: (w: number, h: number) => {
      composer.setSize(w, h);
    },
    setQuality: (q: QualityLevel) => {
      if (q === quality) return;
      quality = q;
      const old = composer;
      composer = makeComposer(renderer, scene, camera, q, size.x, size.y);
      old.dispose();
    },
  };
}
