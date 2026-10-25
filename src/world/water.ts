// The canal: a planar-reflective water surface with a custom shader (raindrop
// rings, gentle swell, lantern light streaks, manual exponential fog), plus the
// stone embankments, water steps (埠头) and mooring posts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mulberry32 } from '../core/mathx';
import { rippleNormalTexture, stoneBlockTexture } from '../core/textures';
import { CANAL_HALF, TOWN_HALF, WATER_Y } from './town';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface LanternLightInfo {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
}

const waterVertex = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vUvRef;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vUvRef = textureMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const waterFragment = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 color;
  uniform float uTime;
  uniform float uRain;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec4 uLanterns[6];
  uniform vec3 uLanternCols[6];
  uniform vec3 uMoonDir;
  varying vec4 vUvRef;
  varying vec3 vWorld;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float dropField(vec2 p, float t) {
    float h = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 st = p * (1.1 + fi * 0.41) + fi * 19.7;
      float rate = 0.9 + fi * 0.5;
      float tt = t * rate;
      vec2 cell = floor(st);
      vec2 f = fract(st);
      float rnd = hash21(cell + floor(tt) * 7.13 + fi * 43.7);
      if (rnd > 0.35 + uRain * 0.55) continue;
      vec2 c = vec2(hash21(cell + 1.3), hash21(cell + 7.7)) * 0.8 + 0.1;
      float age = fract(tt * 0.55 + hash21(cell + 3.1));
      float d = length(f - c) * 2.2;
      float r = age * 0.75;
      h += exp(-pow((d - r) * 9.0, 2.0)) * pow(1.0 - age, 2.0);
    }
    return h;
  }

  void main() {
    vec2 xz = vWorld.xz;
    float hh = dropField(xz, uTime) * uRain;
    float hx = dropField(xz + vec2(0.06, 0.0), uTime) * uRain;
    float hz = dropField(xz + vec2(0.0, 0.06), uTime) * uRain;
    vec3 n = normalize(vec3((hh - hx) * 6.0, 1.0, (hh - hz) * 6.0));
    // gentle multi-directional swell
    float sw = sin(xz.x * 0.55 + uTime * 0.8 + xz.y * 0.35) + 0.6 * sin(xz.x * 1.3 - uTime * 0.6 + xz.y * 0.9);
    n.x += 0.09 * sw;
    n.z += 0.09 * cos(xz.y * 0.8 + uTime * 0.7 + xz.x * 0.2);
    n = normalize(n);

    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.08 + 0.9 * pow(1.0 - max(dot(n, V), 0.0), 3.0);

    vec2 ruv = (vUvRef.xy / vUvRef.w) + n.xz * vec2(0.09, 0.14) * (0.55 + uRain * 0.6);
    vec3 refl = texture2D(tDiffuse, ruv).rgb * 0.4;
    refl += 0.15 * (
      texture2D(tDiffuse, ruv + vec2(0.004, 0.0)).rgb +
      texture2D(tDiffuse, ruv - vec2(0.004, 0.0)).rgb +
      texture2D(tDiffuse, ruv + vec2(0.0, 0.007)).rgb +
      texture2D(tDiffuse, ruv - vec2(0.0, 0.007)).rgb
    );

    vec3 deep = vec3(0.02, 0.03, 0.04);
    vec3 col = mix(deep, refl * 1.7, clamp(fres, 0.0, 1.0));
    col += vec3(0.014, 0.02, 0.03) * fres; // faint ambient sheen
    col += vec3(0.03, 0.04, 0.055) * hh * 0.5; // rain rings catching light

    // lantern glitter: analytic light pillars + spec sparkle
    vec3 spec = vec3(0.0);
    vec2 cxz = cameraPosition.xz;
    for (int i = 0; i < 6; i++) {
      vec4 lp = uLanterns[i];
      if (lp.w <= 0.0) continue;
      float dist = max(distance(lp.xyz, vWorld), 0.001);
      float att = lp.w / (1.0 + 0.08 * dist * dist);
      // pillar: glow along the line of sight from camera toward the light
      vec2 dir = lp.xz - cxz;
      float len = max(length(dir), 0.001);
      dir /= len;
      vec2 rel = xz - cxz;
      float t = dot(rel, dir);
      float perp2 = dot(rel - dir * t, rel - dir * t);
      float band = exp(-perp2 * 0.9) * smoothstep(1.0, 3.5, t) * (1.0 - smoothstep(len * 0.8, len * 1.25, t));
      vec3 Lv = (lp.xyz - vWorld) / dist;
      vec3 H = normalize(Lv + V);
      float s = pow(max(dot(n, H), 0.0), 42.0);
      spec += uLanternCols[i] * (band * att * 0.22 + s * att * 0.45 + att * 0.0028);
    }
    // faint moon glitter
    vec3 Hm = normalize(uMoonDir + normalize(vec3(V.x, V.y * 0.2, V.z)));
    spec += vec3(0.5, 0.62, 0.8) * pow(max(dot(n, Hm), 0.0), 240.0) * 0.5;
    col += spec;

    float dist = distance(cameraPosition, vWorld);
    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    // the mirrored render is already fogged, so only tint lightly here
    col = mix(col, uFogColor, clamp(fogF * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const REFLECT_SIZE: Record<QualityLevel, number> = { low: 256, medium: 512, high: 768 };

export interface WaterResult {
  group: THREE.Group;
  update: (t: number, rain: number) => void;
  setLanterns: (lights: LanternLightInfo[]) => void;
  setQuality: (q: QualityLevel) => void;
  setFog: (color: THREE.Color, density: number) => void;
  debugUniforms: () => unknown;
  envMaterials: THREE.MeshStandardMaterial[];
}

export function buildWater(): WaterResult {
  const group = new THREE.Group();
  let reflector: Reflector | null = null;
  let quality: QualityLevel = 'medium';

  const fogColor = new THREE.Color(0x1a232e);
  let fogDensity = 0.03;

  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneBlockTexture(23), roughness: 0.92 });

  function makeReflector() {
    if (reflector) {
      group.remove(reflector);
      reflector.dispose();
    }
    const geo = new THREE.PlaneGeometry(TOWN_HALF * 2 + 14, CANAL_HALF * 2 + 3.4, 96, 12);
    reflector = new Reflector(geo, {
      textureWidth: REFLECT_SIZE[quality],
      textureHeight: REFLECT_SIZE[quality],
      clipBias: 0.003,
      color: 0xbfd0dd,
      shader: {
        name: 'JiangnanWater',
        uniforms: {
          color: { value: null },
          tDiffuse: { value: null },
          textureMatrix: { value: null },
          uTime: { value: 0 },
          uRain: { value: 0.7 },
          uFogColor: { value: fogColor },
          uFogDensity: { value: fogDensity },
          uLanterns: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) },
          uLanternCols: { value: Array.from({ length: 6 }, () => new THREE.Color()) },
          uMoonDir: { value: new THREE.Vector3(0.35, 0.8, -0.45).normalize() },
        },
        vertexShader: waterVertex,
        fragmentShader: waterFragment,
      },
    });
    reflector.position.set(0, WATER_Y, 0);
    reflector.rotation.x = -Math.PI / 2;
    reflector.name = 'water';
    group.add(reflector);
  }
  makeReflector();

  // ---- embankment walls both sides
  const stoneGeos: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const face = new THREE.BoxGeometry(TOWN_HALF * 2 + 10, 1.9, 0.4);
    face.translate(0, WATER_Y + 0.85, s * (CANAL_HALF + 0.2));
    stoneGeos.push(face);
    const coping = new THREE.BoxGeometry(TOWN_HALF * 2 + 10, 0.16, 0.62);
    coping.translate(0, WATER_Y + 1.9, s * (CANAL_HALF + 0.31));
    stoneGeos.push(coping);
    // hidden fill under the quay so nothing shows through gaps
    const fill = new THREE.BoxGeometry(TOWN_HALF * 2 + 10, 1.2, 3.2);
    fill.translate(0, WATER_Y + 0.1, s * (CANAL_HALF + 1.9));
    stoneGeos.push(fill);
  }
  const stoneMesh = new THREE.Mesh(mergeGeometries(stoneGeos, false)!, stoneMat);
  stoneMesh.receiveShadow = true;
  group.add(stoneMesh);

  // ---- water steps (埠头) descending into the canal
  const stepGeos: THREE.BufferGeometry[] = [];
  const stepSpots: Array<[number, 1 | -1]> = [
    [-26, 1],
    [-40, -1],
    [24, -1],
    [46, 1],
  ];
  for (const [sx, s] of stepSpots) {
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BoxGeometry(2.6, 0.34, 0.72);
      g.translate(sx, WATER_Y + 1.62 - i * 0.36, s * (CANAL_HALF + 0.62 + i * 0.68));
      stepGeos.push(g);
    }
  }
  const stepsMesh = new THREE.Mesh(mergeGeometries(stepGeos, false)!, stoneMat);
  group.add(stepsMesh);

  // ---- mooring posts
  const postGeos: THREE.BufferGeometry[] = [];
  for (let x = -60; x <= 60; x += 9.5) {
    for (const s of [1, -1]) {
      if (Math.abs(x) < 6) continue;
      const g = new THREE.CylinderGeometry(0.11, 0.14, 0.75, 7);
      g.translate(x + (s > 0 ? 2.3 : -2.3), WATER_Y + 1.95, s * (CANAL_HALF + 0.28));
      postGeos.push(g);
    }
  }
  const postsMesh = new THREE.Mesh(mergeGeometries(postGeos, false)!, stoneMat);
  group.add(postsMesh);

  // ---- puddles on the wet streets
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f14,
    roughness: 0.05,
    metalness: 0.25,
    normalMap: rippleNormalTexture(),
    envMapIntensity: 1.7,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const puddles: THREE.Mesh[] = [];
  const puddleGeo = new THREE.CircleGeometry(1, 20);
  puddleGeo.rotateX(-Math.PI / 2);
  const prng = mulberry32(77);
  for (let i = 0; i < 26; i++) {
    const x = (prng() - 0.5) * 2 * TOWN_HALF;
    const s = prng() > 0.5 ? 1 : -1;
    const z = s * (CANAL_HALF + 0.9 + prng() * 5.4);
    const m = new THREE.Mesh(puddleGeo, puddleMat);
    m.position.set(x, 0.015, z);
    m.scale.setScalar(0.55 + prng() * 0.9);
    m.scale.y = 1;
    m.receiveShadow = true;
    puddles.push(m);
    group.add(m);
  }

  let lastLights: LanternLightInfo[] = [];
  function setLanterns(lights: LanternLightInfo[]) {
    lastLights = lights;
    if (!reflector) return;
    const u = (reflector.material as THREE.ShaderMaterial).uniforms;
    for (let i = 0; i < 6; i++) {
      const l = lights[i];
      if (l) {
        u.uLanterns.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.intensity);
        u.uLanternCols.value[i].copy(l.color);
      } else {
        u.uLanterns.value[i].set(0, 0, 0, 0);
      }
    }
  }

  function update(t: number, rain: number) {
    if (!reflector) return;
    const u = (reflector.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = t;
    u.uRain.value = rain;
    u.uFogColor.value.copy(fogColor);
    u.uFogDensity.value = fogDensity;
    puddleMat.normalMap!.offset.set(t * 0.013, t * 0.017);
  }

  function setQuality(q: QualityLevel) {
    if (q === quality) return;
    quality = q;
    makeReflector();
    setLanterns(lastLights);
  }

  function debugUniforms() {
    if (!reflector) return null;
    const u = (reflector.material as THREE.ShaderMaterial).uniforms;
    return {
      lanterns: u.uLanterns.value.map((v: THREE.Vector4) => [v.x, v.y, v.z, v.w]),
      fogDensity: u.uFogDensity.value,
    };
  }

  function setFog(color: THREE.Color, density: number) {
    fogColor.copy(color);
    fogDensity = density;
  }

  return {
    group,
    update,
    setLanterns,
    setQuality,
    setFog,
    debugUniforms,
    envMaterials: [stoneMat, puddleMat],
  };
}
