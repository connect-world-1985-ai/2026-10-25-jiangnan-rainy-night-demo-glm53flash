// Rain: GPU-instanced streaks that billboard around the vertical axis and
// splash rings on the open streets. One draw call each; density is a uniform
// driven by the quality preset and the rain slider.
import * as THREE from 'three';
import { splashTexture } from '../core/textures';
import { plan, groundHeight } from '../world/town';

export interface RainResult {
  group: THREE.Group;
  update: (t: number, camera: THREE.Camera) => void;
  setIntensity: (rain: number) => void;
  setCounts: (streaks: number, splashes: number) => void;
}

const MAX_STREAKS = 9000;
const MAX_SPLASHES = 620;

export function buildRain(scene: THREE.Scene): RainResult {
  const group = new THREE.Group();
  scene.add(group);

  // ------------------------------------------------------------ streaks
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;

  const offsets = new Float32Array(MAX_STREAKS * 3);
  const speeds = new Float32Array(MAX_STREAKS);
  const lens = new Float32Array(MAX_STREAKS);
  const phases = new Float32Array(MAX_STREAKS);
  for (let i = 0; i < MAX_STREAKS; i++) {
    offsets[i * 3] = (Math.random() - 0.5) * 150;
    offsets[i * 3 + 1] = Math.random() * 30;
    offsets[i * 3 + 2] = (Math.random() - 0.5) * 34;
    speeds[i] = 17 + Math.random() * 9;
    lens[i] = 0.5 + Math.random() * 0.85;
    phases[i] = Math.random();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geo.instanceCount = 4200;

  const streakUniforms = {
    uTime: { value: 0 },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamPos: { value: new THREE.Vector3() },
    uRain: { value: 0.7 },
    uWind: { value: new THREE.Vector2(0.12, 0.05) },
  };

  const streakMat = new THREE.ShaderMaterial({
    uniforms: streakUniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute float aSpeed;
      attribute float aLen;
      attribute float aPhase;
      uniform float uTime;
      uniform vec3 uCamRight;
      uniform vec3 uCamPos;
      uniform vec2 uWind;
      varying float vFade;
      varying vec2 vUvL;
      void main() {
        vec3 p = aOffset;
        float fall = uTime * aSpeed + aPhase * 93.0;
        p.y = 27.0 - mod(fall, 32.0);
        vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
        float halfW = 0.017 + aPhase * 0.013;
        vec3 corner = uCamRight * position.x * halfW + dir * position.y * aLen * 0.5;
        vec3 world = p + corner;
        float d = distance(world, uCamPos);
        vFade = smoothstep(0.4, 2.6, d) * (1.0 - smoothstep(34.0, 62.0, d));
        vUvL = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uRain;
      varying float vFade;
      varying vec2 vUvL;
      void main() {
        float a = (1.0 - abs(vUvL.y * 2.0 - 1.0));
        a *= a;
        a *= vFade * uRain;
        gl_FragColor = vec4(vec3(0.72, 0.82, 0.95) * a * 0.85, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const streaks = new THREE.Mesh(geo, streakMat);
  streaks.frustumCulled = false;
  streaks.renderOrder = 30;
  group.add(streaks);

  // ------------------------------------------------------------ splashes
  const pts = plan.splashPoints;
  const sGeo = new THREE.InstancedBufferGeometry();
  const sBase = new THREE.PlaneGeometry(1, 1);
  sBase.rotateX(-Math.PI / 2);
  sGeo.index = sBase.index;
  sGeo.attributes.position = sBase.attributes.position;
  sGeo.attributes.uv = sBase.attributes.uv;
  const MAXS = Math.min(pts.length, MAX_SPLASHES);
  const sPos = new Float32Array(MAXS * 3);
  const sPhase = new Float32Array(MAXS);
  const sDur = new Float32Array(MAXS);
  const sSize = new Float32Array(MAXS);
  for (let i = 0; i < MAXS; i++) {
    const [x, z] = pts[i % pts.length];
    sPos[i * 3] = x;
    sPos[i * 3 + 1] = groundHeight(x, z) + 0.02;
    sPos[i * 3 + 2] = z;
    sPhase[i] = Math.random();
    sDur[i] = 0.5 + Math.random() * 0.45;
    sSize[i] = 0.14 + Math.random() * 0.2;
  }
  sGeo.setAttribute('aPos', new THREE.InstancedBufferAttribute(sPos, 3));
  sGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(sPhase, 1));
  sGeo.setAttribute('aDur', new THREE.InstancedBufferAttribute(sDur, 1));
  sGeo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sSize, 1));
  sGeo.instanceCount = 320;

  const splashUniforms = { uTime: { value: 0 }, uRain: { value: 0.7 }, uTex: { value: splashTexture() } };
  const splashMat = new THREE.ShaderMaterial({
    uniforms: splashUniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aPos;
      attribute float aPhase;
      attribute float aDur;
      attribute float aSize;
      uniform float uTime;
      uniform float uRain;
      varying vec2 vUvS;
      varying float vA;
      void main() {
        float t = fract((uTime / aDur) + aPhase);
        float r = t * aSize * (0.4 + 0.6 * uRain);
        vec3 world = aPos + vec3(position.x * r * 4.0, 0.0, position.z * r * 4.0);
        vUvS = uv;
        vA = pow(1.0 - t, 1.6) * uRain;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      varying vec2 vUvS;
      varying float vA;
      void main() {
        vec4 tex = texture2D(uTex, vUvS);
        float a = tex.a * vA * 0.55;
        gl_FragColor = vec4(vec3(0.5, 0.62, 0.8) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const splashes = new THREE.Mesh(sGeo, splashMat);
  splashes.frustumCulled = false;
  splashes.renderOrder = 31;
  group.add(splashes);

  const camRight = new THREE.Vector3();
  const update = (t: number, camera: THREE.Camera) => {
    streakUniforms.uTime.value = t;
    splashUniforms.uTime.value = t;
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    streakUniforms.uCamRight.value.copy(camRight);
    streakUniforms.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
  };

  return {
    group,
    update,
    setIntensity: (r: number) => {
      streakUniforms.uRain.value = r;
      splashUniforms.uRain.value = r;
    },
    setCounts: (streakN: number, splashN: number) => {
      geo.instanceCount = Math.min(streakN, MAX_STREAKS);
      sGeo.instanceCount = Math.min(splashN, MAXS);
    },
  };
}
