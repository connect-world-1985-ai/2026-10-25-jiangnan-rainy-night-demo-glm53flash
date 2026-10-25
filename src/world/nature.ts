// Ink-wash backdrop (sky gradient, layered mountain silhouettes, moon haze),
// weeping willows with swaying strands, and drifting mist cards.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, range, type Rng } from '../core/mathx';
import { mountainTexture, radialGlowTexture, willowLeafTexture, woodTexture } from '../core/textures';

export interface NatureResult {
  group: THREE.Group;
  update: (t: number) => void;
  setFogSpriteCount: (n: number) => void;
}

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const skyFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    vec3 horizon = vec3(0.042, 0.051, 0.064);
    vec3 zenith = vec3(0.007, 0.011, 0.018);
    vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
    // slow rain-cloud bands
    vec2 p = vDir.xz / max(vDir.y + 0.25, 0.08);
    float cl = noise(p * 2.2 + vec2(uTime * 0.012, uTime * 0.004));
    cl += 0.5 * noise(p * 4.8 - vec2(uTime * 0.02, 0.0));
    col += vec3(0.016, 0.02, 0.026) * smoothstep(0.55, 1.15, cl) * (1.0 - max(h, 0.0) * 0.7);
    // faint cold glow low on the horizon (distant town haze)
    col += vec3(0.02, 0.023, 0.024) * pow(1.0 - abs(vDir.y), 7.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function buildNature(scene: THREE.Scene): NatureResult {
  const group = new THREE.Group();
  const rng = mulberry32(0x5eed);

  // ---- sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 12),
    new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: { uTime: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  group.add(sky);

  // ---- moon behind thin cloud
  const moonTex = radialGlowTexture('rgba(225,235,248,0.95)', 'rgba(190,205,228,0.28)');
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, color: 0xbfd0e8, transparent: true, opacity: 0.42, depthWrite: false, fog: false }));
  moon.position.set(-125, 95, -165);
  moon.scale.setScalar(80);
  group.add(moon);

  // ---- layered mountain silhouettes (ink-wash), no fog so they stay pale
  const layers: Array<[number, string, number, number]> = [
    [1, '#46525d', -215, 150],
    [2, '#3c4753', -215, 245],
    [3, '#414c58', 215, 170],
    [4, '#37424e', 215, 255],
    [5, '#3f4a56', -265, 40],
  ];
  for (const [seed, color, x, z] of layers) {
    const tex = mountainTexture(seed, color);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(620, 100), mat);
    m.position.set(x, 30, z);
    m.lookAt(0, 16, 0);
    m.renderOrder = -5;
    group.add(m);
  }

  // ---- weeping willows
  const willowSpots: Array<[number, number, number]> = [
    [-18.4, 5.0, 1.1],
    [33.5, -5.1, 0.95],
    [-52, -5.0, 1.2],
    [21, 5.1, 0.9],
    [-22.6, 16.5, 1.15],
    [44, -16.5, 1.0],
  ];
  for (const [x, z, s] of willowSpots) buildWillow(x, z, s, rng, group);

  // ---- drifting mist cards
  const mistTex = radialGlowTexture('rgba(200,216,230,0.5)', 'rgba(190,208,224,0.16)');
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.1, depthWrite: false, color: 0x9db0be, side: THREE.DoubleSide });
  const mistCards: THREE.Mesh[] = [];
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mistMat.clone());
    const w = range(rng, 14, 42);
    m.scale.set(w, w * range(rng, 0.28, 0.5), 1);
    m.position.set(range(rng, -75, 75), range(rng, 0.4, 6.5), range(rng, -12, 12));
    m.rotation.y = rng() * Math.PI;
    (m.material as THREE.MeshBasicMaterial).opacity = range(rng, 0.04, 0.1);
    m.userData.drift = range(rng, 0.25, 0.7) * (rng() > 0.5 ? 1 : -1);
    m.userData.phase = rng() * 10;
    m.renderOrder = 15;
    mistCards.push(m);
    group.add(m);
  }
  // two denser walls of mist at the ends of the canal
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mistMat.clone());
    m.scale.set(90, 30, 1);
    m.position.set(s * 82, 6, 0);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.13;
    m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    m.renderOrder = 15;
    mistCards.push(m);
    group.add(m);
  }

  scene.add(group);

  const update = (t: number) => {
    (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    for (const m of mistCards) {
      m.position.x += m.userData.drift * 0.016 * (1 + Math.sin(t * 0.23 + m.userData.phase) * 0.4);
      if (m.position.x > 88) m.position.x = -88;
      if (m.position.x < -88) m.position.x = 88;
      m.quaternion.copy(mistFaceQuat(m.position, m.userData.drift));
    }
  };

  let visibleCount = mistCards.length;
  const setFogSpriteCount = (n: number) => {
    visibleCount = n;
    mistCards.forEach((m, i) => {
      m.visible = i < n || m.scale.x > 60;
    });
  };

  return { group: group, update, setFogSpriteCount };
}

function mistFaceQuat(pos: THREE.Vector3, _drift: number): THREE.Quaternion {
  // face roughly toward origin (cheap billboard for mist cards)
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(pos.x * 0.2, pos.y, 0), new THREE.Vector3(0, 1, 0));
  q.setFromRotationMatrix(m);
  return q;
}

// ------------------------------------------------------------------ willow
function buildWillow(x: number, z: number, scale: number, rng: Rng, parent: THREE.Object3D) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rng() * Math.PI * 2;
  g.scale.setScalar(scale);

  const trunkMat = new THREE.MeshStandardMaterial({ map: woodTexture(97, 0.5), color: 0x5a5148, roughness: 0.95 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 3.4, 8), trunkMat);
  trunk.position.y = 1.7;
  trunk.rotation.z = range(rng, -0.1, 0.1);
  trunk.castShadow = true;
  g.add(trunk);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.1, 6), trunkMat);
  fork.position.set(0.15, 3.6, 0);
  fork.rotation.z = -0.5;
  g.add(fork);

  // drooping strands
  const strandGeos: THREE.BufferGeometry[] = [];
  const nStrands = 15;
  for (let i = 0; i < nStrands; i++) {
    const a = (i / nStrands) * Math.PI * 2 + rng() * 0.5;
    const start = new THREE.Vector3(Math.cos(a) * 0.35, 3.75 + rng() * 0.5, Math.sin(a) * 0.35);
    const out = range(rng, 1.1, 2.1);
    const mid = new THREE.Vector3(Math.cos(a) * out * 0.75, 3.3 + rng() * 0.4, Math.sin(a) * out * 0.75);
    const end = new THREE.Vector3(Math.cos(a) * out, 3.75 - range(rng, 2.6, 4.1), Math.sin(a) * out);
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const tube = new THREE.TubeGeometry(curve, 10, 0.023, 4, false);
    // sway weight grows toward the tip (v goes 0..1 along the strand)
    const cnt = tube.attributes.position.count;
    const sway = new Float32Array(cnt);
    const uv = tube.attributes.uv;
    for (let vi = 0; vi < cnt; vi++) {
      const vY = uv.getY(vi);
      sway[vi] = vY * vY;
    }
    tube.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    strandGeos.push(tube);
  }
  const strandsGeo = mergeGeometries(strandGeos, false)!;
  const leafTex = willowLeafTexture(Math.floor(rng() * 1000));
  leafTex.repeat.set(1, 7);
  const strandMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaMap: leafTex,
    transparent: false,
    alphaTest: 0.42,
    color: 0x71825c,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  strandMat.userData.uTime = { value: 0 };
  strandMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = strandMat.userData.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         attribute float aSway;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.x += sin(uTime * 1.4 + position.z * 1.7 + position.y * 0.8) * 0.16 * aSway;
         transformed.z += cos(uTime * 1.1 + position.x * 1.3) * 0.14 * aSway;`,
      );
  };
  const strands = new THREE.Mesh(strandsGeo, strandMat);
  strands.castShadow = true;
  g.add(strands);

  parent.add(g);
  willowTickers.push(strandMat);
}

const willowTickers: THREE.MeshStandardMaterial[] = [];
export function tickWillows(t: number) {
  for (const m of willowTickers) m.userData.uTime.value = t;
}
