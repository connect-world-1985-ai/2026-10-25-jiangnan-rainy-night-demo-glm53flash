// Procedural Jiangnan townhouses: white plaster walls (粉墙), black curved tile
// roofs (黛瓦), stepped 马头墙 gables, wooden lattice windows and glow paper panes.
// Everything is merged into a handful of draw calls; windows are instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, type Rng } from '../core/mathx';
import {
  plasterTexture,
  roofTileTexture,
  stoneBlockTexture,
  woodTexture,
  windowGlowTexture,
} from '../core/textures';
import { plan, QUAY_FRONT, type Block } from './town';

export interface LanternAnchor {
  pos: THREE.Vector3;
  scale: number;
}

export interface TownBuildResult {
  group: THREE.Group;
  lanternAnchors: LanternAnchor[];
  update: (t: number) => void;
}

// ------------------------------------------------------------------ helpers
function tint(geo: THREE.BufferGeometry, hex: number, jitter = 0): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  if (jitter > 0) {
    const j = (Math.random() - 0.5) * jitter;
    c.offsetHSL(0, 0, j);
  }
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// ------------------------------------------------------------- curved roof
// A gable roof with the classical Chinese profile: steep near the ridge,
// gentle at the eaves, upturned corners (起翘) and a slightly concave eave line.
function curvedRoofGeometry(w: number, d: number, rise: number, rng: Rng): THREE.BufferGeometry {
  const NU = 12;
  const NV = 9;
  const lift = 0.22 + rng() * 0.1;
  const cornerLift = 0.5 + rng() * 0.25;
  const spread = 0.22;

  const surf = (u: number, v: number, s: number): THREE.Vector3 => {
    const x = -w / 2 + u * w;
    const u2 = Math.abs(u - 0.5) * 2;
    const dHalf = d / 2 + spread * u2 * u2;
    const z = s * Math.pow(v, 0.92) * dHalf;
    let y = rise * Math.pow(1 - v, 1.35);
    y += lift * Math.pow(smoothstep2(0.8, 1.0, v), 2);
    y += cornerLift * Math.pow(u2, 3) * Math.pow(v, 2.5);
    return new THREE.Vector3(x, y, z);
  };
  function smoothstep2(a: number, b: number, x: number) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (const s of [1, -1]) {
    const base = pos.length / 3;
    for (let iv = 0; iv <= NV; iv++) {
      for (let iu = 0; iu <= NU; iu++) {
        const u = iu / NU;
        const v = iv / NV;
        const p = surf(u, v, s);
        pos.push(p.x, p.y, p.z);
        uvs.push(u * (w / 3.2), v * (d / 3.2));
      }
    }
    for (let iv = 0; iv < NV; iv++) {
      for (let iu = 0; iu < NU; iu++) {
        const a = base + iv * (NU + 1) + iu;
        const b = a + 1;
        const c = a + NU + 1;
        const d2 = c + 1;
        idx.push(a, c, b, b, c, d2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // If the normals ended up pointing into the roof, flip the winding.
  const nrm = geo.attributes.normal;
  let up = 0;
  for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0) {
    const ix = geo.getIndex()!;
    const arr = ix.array as ArrayLike<number>;
    const flipped: number[] = [];
    for (let i = 0; i < arr.length; i += 3) flipped.push(arr[i + 2], arr[i + 1], arr[i]);
    geo.setIndex(flipped);
    geo.computeVertexNormals();
  }
  return geo;
}

// Eave fascia (檐口) + drip-tile strip following the curved eave line.
function eaveStripsGeometry(w: number, d: number, rise: number, rng: Rng): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const N = 24;
  const lift = 0.26;
  const cornerLift = 0.6;
  const spread = 0.22;
  const eave = (u: number, s: number) => {
    const u2 = Math.abs(u - 0.5) * 2;
    const z = s * (d / 2 + spread * u2 * u2);
    const y = lift + cornerLift * Math.pow(u2, 3);
    return new THREE.Vector3(-w / 2 + u * w, y, z);
  };
  for (const s of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = eave(u, s);
      // fascia: small vertical band
      pos.push(p.x, p.y - 0.3, p.z - s * 0.02);
      pos.push(p.x, p.y, p.z);
      uvs.push(u * (w / 3), 0, u * (w / 3), 0.3);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  void rng;
  return geo;
}

// Slope-edge ridge boards (垂脊) as small chained boxes.
function hipRidgeGeometry(w: number, d: number, rise: number): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const N = 7;
  for (const sx of [-1, 1]) {
    for (const s of [1, -1]) {
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= N; i++) {
        const v = i / N;
        const u2 = 0; // at the gable end
        const dHalf = d / 2;
        const z = s * Math.pow(v, 0.92) * dHalf;
        let y = rise * Math.pow(1 - v, 1.35) + 0.26 * Math.pow(smoothstepf(0.8, 1, v), 2);
        y += cornerLiftf(0) * Math.pow(v, 2.5);
        const p = new THREE.Vector3((sx * w) / 2, y + 0.06, z);
        if (prev) {
          const mid = prev.clone().add(p).multiplyScalar(0.5);
          const len = prev.distanceTo(p) + 0.06;
          const ang = Math.atan2(p.y - prev.y, p.z - prev.z);
          const b = new THREE.BoxGeometry(0.22, 0.13, len);
          b.rotateX(-ang);
          b.translate(mid.x, mid.y, mid.z);
          geos.push(b);
        }
        prev = p;
      }
    }
  }
  return mergeGeometries(geos, false)!;
}
function smoothstepf(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function cornerLiftf(u2: number) {
  return 0.6 * Math.pow(u2, 3);
}

// ------------------------------------------------------------------ assembly
export function buildTown(): TownBuildResult {
  const rng = mulberry32(0xbeef01);
  const walls: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const trims: THREE.BufferGeometry[] = [];
  const stones: THREE.BufferGeometry[] = [];

  const latticeMatrices: THREE.Matrix4[] = [];
  const glowLit: THREE.Matrix4[] = [];
  const glowSoft: THREE.Matrix4[] = [];
  const glowDark: THREE.Matrix4[] = [];
  const brackets: THREE.Matrix4[] = [];
  const lanternAnchors: LanternAnchor[] = [];

  const teahouse: Block = { x: 9, z: 1 * (QUAY_FRONT + 7.6 / 2), w: 12.5, d: 7.6, side: 1, row: 0 };

  for (const b of plan.blocks) {
    const isTea = b.x === teahouse.x && b.side === teahouse.side && b.row === 0 && Math.abs(b.z - teahouse.z) < 0.1;
    addHouse(b, isTea);
  }

  function addHouse(b: Block, isTea: boolean) {
    const r = mulberry32(Math.floor(b.x * 731 + b.z * 977 + 7));
    const w = b.w;
    const d = b.d;
    const floors = isTea ? 2 : r() < 0.45 ? 2 : 1;
    const floorH = 3.05;
    const h = floors * floorH + 0.4;
    const rotY = b.side === 1 ? 0 : Math.PI;
    const zSign = b.side; // +1 north bank
    const frontLocal = -d / 2; // local front faces the canal

    const wallTint = new THREE.Color().setHSL(0.11, 0.12, 0.86 + (r() - 0.5) * 0.08);
    const roofTint = new THREE.Color().setHSL(0.58, 0.08, 0.5 + (r() - 0.5) * 0.12);

    // plinth
    stones.push(tint(new THREE.BoxGeometry(w + 0.14, 0.5, d + 0.14).translate(b.x, 0.25, b.z), 0x8f9296, 0.05));
    // body walls
    walls.push(tint(new THREE.BoxGeometry(w - 0.12, h, d - 0.12).translate(b.x, h / 2 + 0.4, b.z), wallTint.getHex()));
    // floor beams
    for (let f = 1; f <= floors; f++) {
      trims.push(tint(new THREE.BoxGeometry(w + 0.06, 0.2, d + 0.06).translate(b.x, f * floorH + 0.32, b.z), 0x4a382a, 0.06));
    }
    // corner posts
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        trims.push(
          tint(
            new THREE.BoxGeometry(0.22, h, 0.22).translate(b.x + sx * (w / 2 - 0.14), h / 2 + 0.4, b.z + sz * (d / 2 - 0.14)),
            0x3c2d20,
          ),
        );
      }
    }

    // ---- windows (lattice + glow) on the canal front, upper floors
    const winW = 1.06;
    const winH = 1.22;
    const count = Math.max(1, Math.floor((w - 2.2) / 1.55));
    const span = (count - 1) * 1.55;
    for (let f = 0; f < floors; f++) {
      const wy = 0.5 + f * floorH + 1.62;
      if (f === 0 && !isTea && r() < 0.55) continue; // ground floor often solid
      for (let i = 0; i < count; i++) {
        const lx = b.x - span / 2 + i * 1.55;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, zSign === 1 ? 0 : Math.PI, 0));
        // glow pane sits just inside the wall plane
        const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, wy, b.z - b.side * (d / 2 + 0.06)), q, new THREE.Vector3(1, 1, 1));
        const roll = r();
        if (roll < 0.42) glowLit.push(m);
        else if (roll < 0.72) glowSoft.push(m);
        else glowDark.push(m);
        const lm = new THREE.Matrix4().compose(new THREE.Vector3(lx, wy, b.z - b.side * (d / 2 + 0.1)), q, new THREE.Vector3(1, 1, 1));
        latticeMatrices.push(lm);
      }
    }
    // side windows facing the alley (row 0 side walls)
    if (r() < 0.6) {
      for (const sx of [-1, 1]) {
        if (r() < 0.5) continue;
        const lx = b.x + sx * (w / 2 + 0.04);
        const roll = r();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0));
        const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, 2.1, b.z), q, new THREE.Vector3(1, 1, 1));
        (roll < 0.5 ? glowLit : glowDark).push(m);
        latticeMatrices.push(
          new THREE.Matrix4().compose(new THREE.Vector3(lx + sx * 0.04, 2.1, b.z), q, new THREE.Vector3(1, 1, 1)),
        );
      }
    }

    // ---- door on the canal front
    const doorW = isTea ? 2.4 : 1.5 + r() * 0.3;
    const doorH = 2.5;
    const dz = b.z - b.side * (d / 2 + 0.05);
    trims.push(tint(new THREE.BoxGeometry(doorW + 0.3, doorH, 0.12).translate(b.x, doorH / 2 + 0.4, dz), 0x241a12));
    stones.push(tint(new THREE.BoxGeometry(doorW + 0.62, 0.28, 0.3).translate(b.x, 0.62, dz), 0x8a8d90, 0.05));
    // lintel board above the door
    trims.push(tint(new THREE.BoxGeometry(doorW + 0.8, 0.42, 0.1).translate(b.x, doorH + 0.62, dz), 0x33261a));

    // ---- roof
    const rise = Math.min(2.6, Math.max(1.7, d * 0.3));
    const roofW = w + 0.8;
    const roofD = d + 1.7; // generous overhang toward the canal
    const roofY = h + 0.42;
    const roof = curvedRoofGeometry(roofW, roofD, rise, r);
    roof.translate(b.x, roofY, b.z);
    roofs.push(tint(roof, roofTint.getHex()));
    const eaves = eaveStripsGeometry(roofW, roofD, rise, r);
    eaves.translate(b.x, roofY, b.z);
    trims.push(tint(eaves, 0x201812));
    const hips = hipRidgeGeometry(roofW, roofD, rise);
    hips.translate(b.x, roofY, b.z);
    roofs.push(tint(hips, 0x242a31));
    // ridge cap + end fins
    roofs.push(tint(new THREE.BoxGeometry(roofW + 0.5, 0.2, 0.52).translate(b.x, roofY + rise + 0.12, b.z), 0x1c2127));
    for (const sx of [-1, 1]) {
      const fin = new THREE.BoxGeometry(0.16, 0.5, 0.1);
      fin.rotateZ(sx * 0.7);
      fin.translate(b.x + sx * (roofW / 2 + 0.18), roofY + rise + 0.3, b.z);
      roofs.push(tint(fin, 0x1c2127));
    }

    // ---- 马头墙 stepped gables (about half of the houses)
    const matou = !isTea && r() < 0.55;
    if (matou) {
      const steps = 2 + (r() < 0.5 ? 1 : 0);
      let stepW = d * 0.94;
      let stepY = roofY + rise * 0.35;
      for (let sIdx = 0; sIdx < steps; sIdx++) {
        const sh = 0.62 + r() * 0.25;
        for (const sx of [-1, 1]) {
          walls.push(
            tint(
              new THREE.BoxGeometry(0.5, sh, stepW).translate(b.x + sx * (w / 2 - 0.28), stepY + sh / 2, b.z),
              wallTint.getHex(),
            ),
          );
          // tiled coping, two gentle slopes
          for (const sz of [-1, 1]) {
            const cap = new THREE.BoxGeometry(0.72, 0.12, stepW * 0.52);
            cap.rotateZ(0);
            cap.rotateX(sz * 0.12);
            cap.translate(b.x + sx * (w / 2 - 0.24), stepY + sh + 0.05, b.z + sz * (stepW * 0.26));
            roofs.push(tint(cap, 0x22272d));
          }
        }
        stepY += sh;
        stepW *= 0.72;
      }
    }

    // ---- eave brackets (斗拱 hint) along the canal front
    const nb = Math.floor(w / 0.62);
    for (let i = 0; i <= nb; i++) {
      const lx = b.x - w / 2 + (i * w) / nb;
      const q = new THREE.Quaternion();
      brackets.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(lx, roofY - 0.16, b.z - b.side * (d / 2 + 0.62)),
          q,
          new THREE.Vector3(1, 1, 1),
        ),
      );
    }

    // ---- lantern anchors under the front eave
    const nL = Math.max(2, Math.round(w / 4.2));
    for (let i = 0; i < nL; i++) {
      const lx = b.x - w / 2 + ((i + 0.5) * w) / nL;
      lanternAnchors.push({
        pos: new THREE.Vector3(lx, roofY - 0.42, b.z - b.side * (d / 2 + 0.85)),
        scale: 0.8 + r() * 0.35,
      });
    }
    if (isTea) {
      for (let i = 0; i < 4; i++) {
        lanternAnchors.push({
          pos: new THREE.Vector3(b.x - 5 + i * 3.3, roofY - 0.4, b.z - b.side * (d / 2 + 0.85)),
          scale: 1.05,
        });
      }
    }
  }

  // ---------------------------------------------------------- merge & meshes
  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({
    map: plasterTexture(),
    roughness: 0.94,
    vertexColors: true,
  });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTileTexture(), roughness: 0.72, vertexColors: true });
  const trimMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.82, vertexColors: true });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneBlockTexture(), roughness: 0.9, vertexColors: true });

  const addMerged = (list: THREE.BufferGeometry[], mat: THREE.Material, name: string) => {
    if (!list.length) return;
    const merged = mergeGeometries(list, false)!;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    list.forEach((g) => g.dispose());
  };
  addMerged(walls, wallMat, 'walls');
  addMerged(roofs, roofMat, 'roofs');
  addMerged(trims, trimMat, 'trims');
  addMerged(stones, stoneMat, 'stones');

  // lattice windows, instanced
  const lattice = latticeModuleGeometry();
  const latticeMesh = new THREE.InstancedMesh(lattice, trimMat.clone(), latticeMatrices.length);
  latticeMatrices.forEach((m, i) => latticeMesh.setMatrixAt(i, m));
  latticeMesh.instanceMatrix.needsUpdate = true;
  latticeMesh.name = 'lattice';
  group.add(latticeMesh);

  // window glow panes
  const glowGeo = new THREE.PlaneGeometry(1.0, 1.16);
  const glowMap = windowGlowTexture();
  const mkGlow = (mats: THREE.Matrix4[], intensity: number, name: string) => {
    if (!mats.length) return;
    const mat = new THREE.MeshStandardMaterial({
      map: glowMap,
      emissiveMap: glowMap,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: intensity,
      roughness: 0.9,
    });
    const mesh = new THREE.InstancedMesh(glowGeo, mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = name;
    group.add(mesh);
  };
  mkGlow(glowLit, 2.6, 'glowLit');
  mkGlow(glowSoft, 1.35, 'glowSoft');
  mkGlow(glowDark, 0.0, 'glowDark');

  const bracketGeo = new THREE.BoxGeometry(0.18, 0.24, 0.5);
  const bracketMesh = new THREE.InstancedMesh(bracketGeo, trimMat, brackets.length);
  brackets.forEach((m, i) => bracketMesh.setMatrixAt(i, m));
  bracketMesh.instanceMatrix.needsUpdate = true;
  group.add(bracketMesh);

  const update = (_t: number) => {
    void _t;
  };
  return { group, lanternAnchors, update };
}

// One wooden lattice window module (frame + grid), merged once, instanced.
function latticeModuleGeometry(): THREE.BufferGeometry {
  const W = 1.0;
  const H = 1.16;
  const t = 0.055;
  const depth = 0.06;
  const parts: THREE.BufferGeometry[] = [];
  const bar = (w: number, h: number, x: number, y: number) => {
    const g = new THREE.BoxGeometry(w, h, depth);
    g.translate(x, y, 0);
    parts.push(g);
  };
  bar(W, t, 0, H / 2 - t / 2);
  bar(W, t, 0, -H / 2 + t / 2);
  bar(t, H, -W / 2 + t / 2, 0);
  bar(t, H, W / 2 - t / 2, 0);
  const nx = 4;
  const ny = 5;
  for (let i = 1; i < nx; i++) bar(0.03, H - t * 2, -W / 2 + (i * W) / nx, 0);
  for (let j = 1; j < ny; j++) bar(W - t * 2, 0.03, 0, -H / 2 + (j * H) / ny);
  // centre medallion
  const dia = new THREE.BoxGeometry(0.3, 0.03, depth * 0.9);
  dia.rotateZ(Math.PI / 4);
  parts.push(dia);
  const dia2 = dia.clone();
  dia2.rotateZ(Math.PI / 2);
  parts.push(dia2);
  return mergeGeometries(parts, false)!;
}

