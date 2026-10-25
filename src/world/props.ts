// Street furniture & lights: hanging lanterns (instanced, with real point
// lights at key spots), cloth banners with calligraphy, a covered walkway
// (廊棚), stone tables, wine jars and hearth smoke.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, type Rng } from '../core/mathx';
import {
  bannerTexture,
  lanternTexture,
  plaqueTexture,
  radialGlowTexture,
  stoneBlockTexture,
  woodTexture,
} from '../core/textures';
import { CANAL_HALF, QUAY_FRONT } from './town';
import type { LanternAnchor } from './buildings';

export interface PropsResult {
  group: THREE.Group;
  lights: THREE.PointLight[];
  update: (t: number) => void;
}

export function buildProps(anchors: LanternAnchor[]): PropsResult {
  const rng = mulberry32(9871);
  const group = new THREE.Group();
  const extraAnchors: LanternAnchor[] = [];
  const tickers: Array<(t: number) => void> = [];
  const lights: THREE.PointLight[] = [];
  const lightBases: number[] = [];

  buildBannersAndFurniture();
  buildAwning();
  const smokes = buildSmoke();
  const allAnchors = [...anchors, ...extraAnchors];
  const { update: updateLanterns } = buildLanterns(allAnchors);
  buildKeyLights();

  function updateAll(t: number) {
    updateLanterns(t);
    for (const fn of tickers) fn(t);
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      const cycle = (t * 0.07 + s.userData.phase) % 1;
      s.position.y = s.userData.baseY + cycle * 7.5;
      s.position.x = s.userData.baseX + Math.sin(t * 0.3 + s.userData.phase * 6.3) * 1.1 + cycle * 2.4;
      (s.material as THREE.MeshBasicMaterial).opacity = 0.12 * Math.sin(cycle * Math.PI);
    }
  }

  return { group, lights, update: updateAll };

  // ---------------------------------------------------------------- parts
  function buildLanterns(list: LanternAnchor[]) {
    const bodyGeo = latheLanternBody();
    const trimGeo = latheLanternTrim();
    const lanternMat = new THREE.MeshStandardMaterial({
      map: lanternTexture(),
      emissiveMap: lanternTexture(),
      emissive: 0xffffff,
      emissiveIntensity: 2.3,
      roughness: 0.55,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.8 });
    const bodyMesh = new THREE.InstancedMesh(bodyGeo, lanternMat, list.length);
    const trimMesh = new THREE.InstancedMesh(trimGeo, trimMat, list.length);
    const phases: number[] = [];
    list.forEach(() => phases.push(rng() * Math.PI * 2));
    const m4 = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const scl = new THREE.Vector3();
    const updateLanterns = (t: number) => {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const sway = Math.sin(t * 1.1 + phases[i]) * 0.07 + Math.sin(t * 2.7 + phases[i] * 1.7) * 0.03;
        eu.set(0, 0, sway);
        qt.setFromEuler(eu);
        scl.setScalar(a.scale);
        m4.compose(a.pos, qt, scl);
        bodyMesh.setMatrixAt(i, m4);
        trimMesh.setMatrixAt(i, m4);
      }
      bodyMesh.instanceMatrix.needsUpdate = true;
      trimMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        const base = lightBases[i];
        l.intensity =
          base *
          (0.86 + 0.14 * Math.sin(t * 9.3 + i * 2.1) + 0.07 * Math.sin(t * 23.7 + i * 5.3) + 0.05 * Math.sin(t * 3.1 + i));
      }
    };
    group.add(bodyMesh, trimMesh);
    return { update: updateLanterns };
  }

  function buildKeyLights() {
    const spots: Array<[number, number, number, number]> = [
      [0, 3.7, 4.6, 26],
      [0, 3.7, -4.6, 26],
      [9, 3.3, 7.6, 28],
      [-22, 3.0, 5.4, 15],
      [14, 3.0, -5.4, 15],
      [14, 3.0, 5.4, 12],
      [-40, 3.0, 5.4, 12],
      [40, 3.0, -5.4, 12],
      [-8, 3.0, 5.4, 12],
    ];
    for (const [x, y, z, intensity] of spots) {
      const l = new THREE.PointLight(0xffab5e, intensity, 22, 2);
      l.position.set(x, y, z);
      lights.push(l);
      lightBases.push(intensity);
      group.add(l);
    }

    // low lantern poles leaning over the water on both embankments — their
    // reflections streak across the canal even from bridge height
    const poleSpots: Array<[number, 1 | -1]> = [
      [-12, 1],
      [-2, -1],
      [8, 1],
      [22, -1],
      [-30, -1],
      [36, 1],
      [50, -1],
      [-48, 1],
    ];
    const poleMat = new THREE.MeshStandardMaterial({ map: woodTexture(73, 0.5), roughness: 0.9 });
    for (const [px, s] of poleSpots) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.9, 6), poleMat);
      pole.position.set(px, 0.95, s * (CANAL_HALF + 0.1));
      pole.rotation.x = s * 0.28;
      group.add(pole);
      const lanternPos = new THREE.Vector3(px, 1.28, s * (CANAL_HALF - 0.22));
      extraAnchors.push({ pos: lanternPos, scale: 0.66 });
      const l = new THREE.PointLight(0xffa050, 8, 11, 2);
      l.position.copy(lanternPos);
      lights.push(l);
      lightBases.push(8);
      group.add(l);
    }
    return lights;
  }

  function buildSmoke(): THREE.Mesh[] {
    const smokes: THREE.Mesh[] = [];
    const tex = radialGlowTexture('rgba(255,255,255,0.5)', 'rgba(255,255,255,0.16)');
    for (const [sx, sz] of [
      [-38, 11.5],
      [26, -11.5],
      [2, 12.2],
    ]) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 7),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.1, color: 0x8b929c, depthWrite: false }),
      );
      s.position.set(sx, 4, sz);
      s.userData = { baseX: sx, baseY: 4, phase: rng() };
      s.renderOrder = 20;
      smokes.push(s);
      group.add(s);
    }
    return smokes;
  }

  function buildBannersAndFurniture() {
    const x = 9;
    const frontZ = QUAY_FRONT; // north bank canal-front wall plane

    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshStandardMaterial({ map: plaqueTexture('听雨茶楼'), roughness: 0.7 }),
    );
    plaque.position.set(x, 3.65, frontZ - 0.09);
    plaque.rotation.y = Math.PI;
    group.add(plaque);

    const banner = makeBanner('茶', '#223142');
    banner.position.set(x - 3.4, 5.6, frontZ - 0.7);
    group.add(banner);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 4.4, 6),
      new THREE.MeshStandardMaterial({ map: woodTexture(53, 0.5), roughness: 0.9 }),
    );
    pole.position.set(x + 4.2, 2.2, frontZ - 0.55);
    pole.rotation.z = 0.05;
    group.add(pole);
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), pole.material);
    cross.rotation.z = Math.PI / 2;
    cross.position.set(x + 4.2, 4.35, frontZ - 0.55);
    group.add(cross);
    const flag = makeBanner('雨前', '#5a2a22');
    flag.position.set(x + 4.05, 3.3, frontZ - 0.75);
    flag.scale.setScalar(0.72);
    group.add(flag);

    const jarMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const jar = new THREE.Mesh(latheJar(), jarMat);
      jar.position.set(x + 2.4 + i * 0.6, 0.02, frontZ - 0.45 - i * 0.1);
      jar.scale.setScalar(0.85 + rng() * 0.3);
      group.add(jar);
    }

    // wine pole on the quay
    const wx = -30;
    const wz = CANAL_HALF + 1.15;
    const wpole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 5.2, 6),
      new THREE.MeshStandardMaterial({ map: woodTexture(59, 0.45), roughness: 0.9 }),
    );
    wpole.position.set(wx, 2.6, wz);
    wpole.rotation.z = 0.04;
    group.add(wpole);
    const wcross = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), wpole.material);
    wcross.rotation.z = Math.PI / 2;
    wcross.position.set(wx, 4.9, wz);
    group.add(wcross);
    const wflag = makeBanner('酒', '#2a3a30');
    wflag.position.set(wx + 0.72, 3.95, wz);
    wflag.scale.set(0.75, 0.9, 0.9);
    group.add(wflag);
    extraAnchors.push({ pos: new THREE.Vector3(wx, 4.55, wz + 0.1), scale: 1.0 });

    // stone table + stools under the big quay willow
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneBlockTexture(71), roughness: 0.95 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.44, 0.55, 10), stoneMat);
    table.position.set(-18.6, 0.28, 4.9);
    group.add(table);
    for (const [dx, dz] of [
      [0.9, 0.25],
      [-0.75, -0.5],
      [0.1, -1.05],
    ]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.36, 8), stoneMat);
      stool.position.set(-18.6 + dx, 0.18, 4.9 + dz);
      group.add(stool);
    }
  }

  function makeBanner(chars: string, cloth: string): THREE.Mesh {
    const tex = bannerTexture(chars, cloth);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.32,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(0.85, 2.5, 6, 12);
    const mesh = new THREE.Mesh(geo, mat);
    injectWave(mesh, chars.length * 1.7);
    return mesh;
  }

  function injectWave(mesh: THREE.Mesh, phase: number) {
    const uniforms = { uTime: { value: 0 }, uPhase: { value: phase } };
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uPhase = uniforms.uPhase;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uPhase;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float sway = sin(uTime * 1.8 + uPhase + position.y * 2.4) * 0.085
                      + sin(uTime * 3.7 + uPhase * 1.3) * 0.03;
           float weight = 1.0 - uv.y;
           transformed.x += sway * weight;
           transformed.z += sway * weight * 0.4;`,
        );
    };
    tickers.push((t) => {
      uniforms.uTime.value = t;
    });
  }

  function buildAwning() {
    const x0 = -60;
    const x1 = -16;
    const zPost = CANAL_HALF + 0.8;
    const postMat = new THREE.MeshStandardMaterial({ map: woodTexture(63, 0.5), roughness: 0.9 });
    const frameGeos: THREE.BufferGeometry[] = [];
    const n = Math.floor((x1 - x0) / 3.1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (i * (x1 - x0)) / n;
      const post = new THREE.CylinderGeometry(0.09, 0.11, 2.7, 7);
      post.translate(x, 1.35, zPost);
      frameGeos.push(post);
    }
    const beam = new THREE.BoxGeometry(x1 - x0, 0.14, 0.18);
    beam.translate((x0 + x1) / 2, 2.62, zPost);
    frameGeos.push(beam);

    const roofGeos: THREE.BufferGeometry[] = [];
    const slope = new THREE.BoxGeometry(x1 - x0, 0.1, 3.7);
    slope.rotateX(-0.17);
    slope.translate((x0 + x1) / 2, 3.42, zPost + 1.5);
    roofGeos.push(slope);
    const ridgeCap = new THREE.BoxGeometry(x1 - x0, 0.14, 0.3);
    ridgeCap.translate((x0 + x1) / 2, 3.74, zPost + 3.35);
    roofGeos.push(ridgeCap);

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.8 });
    const frame = new THREE.Mesh(mergeGeometries(frameGeos, false)!, postMat);
    const roofM = new THREE.Mesh(mergeGeometries(roofGeos, false)!, roofMat);
    frame.castShadow = roofM.castShadow = true;
    group.add(frame, roofM);
    for (let i = 0; i <= n; i += 2) {
      const x = x0 + (i * (x1 - x0)) / n;
      extraAnchors.push({ pos: new THREE.Vector3(x, 2.35, zPost), scale: 0.9 });
    }
  }
}

function latheLanternBody(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.001, -0.32),
    new THREE.Vector2(0.12, -0.28),
    new THREE.Vector2(0.23, -0.12),
    new THREE.Vector2(0.265, 0.05),
    new THREE.Vector2(0.22, 0.22),
    new THREE.Vector2(0.1, 0.3),
    new THREE.Vector2(0.001, 0.32),
  ];
  return new THREE.LatheGeometry(pts, 14);
}

function latheLanternTrim(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const top = new THREE.CylinderGeometry(0.09, 0.11, 0.09, 10);
  top.translate(0, 0.33, 0);
  parts.push(top);
  const bottom = new THREE.CylinderGeometry(0.11, 0.09, 0.09, 10);
  bottom.translate(0, -0.33, 0);
  parts.push(bottom);
  const tassel = new THREE.ConeGeometry(0.045, 0.18, 8);
  tassel.rotateX(Math.PI);
  tassel.translate(0, -0.46, 0);
  parts.push(tassel);
  const ring = new THREE.TorusGeometry(0.05, 0.012, 6, 10);
  ring.translate(0, 0.4, 0);
  parts.push(ring);
  return mergeGeometries(parts, false)!;
}

function latheJar(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.16, 0.02),
    new THREE.Vector2(0.24, 0.18),
    new THREE.Vector2(0.2, 0.4),
    new THREE.Vector2(0.12, 0.46),
    new THREE.Vector2(0.13, 0.52),
    new THREE.Vector2(0.09, 0.54),
  ];
  return new THREE.LatheGeometry(pts, 12);
}
