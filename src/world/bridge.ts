// The arched stone bridge (拱桥) crossing the canal: a stone mass extruded
// with an arch opening, a cambered deck, balustrades with lantern posts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { stoneBlockTexture, woodTexture } from '../core/textures';
import { BRIDGE_HALF_SPAN, BRIDGE_HALF_WIDTH, BRIDGE_RISE, WATER_Y, groundHeight } from './town';
import type { LanternAnchor } from './buildings';

export interface BridgeResult {
  group: THREE.Group;
  lanternAnchors: LanternAnchor[];
}

export function buildBridge(): BridgeResult {
  const group = new THREE.Group();
  const lanternAnchors: LanternAnchor[] = [];

  const stoneTex = stoneBlockTexture(43);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(45, 0.5), roughness: 0.85 });

  const deckY = (z: number) => groundHeight(0, z);

  // ---- bridge body: extruded profile with an arch opening
  const span = BRIDGE_HALF_SPAN + 0.4;
  const shape = new THREE.Shape();
  shape.moveTo(-span, WATER_Y - 0.35);
  shape.lineTo(-span, deckY(-span));
  const N = 40;
  for (let i = 1; i <= N; i++) {
    const z = -span + (i / N) * span * 2;
    shape.lineTo(-z, deckY(z) - 0.02); // shape x maps to -world z after rotation
  }
  shape.lineTo(span, WATER_Y - 0.35);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, WATER_Y + 1.05, 2.95, 0, Math.PI, false);
  hole.closePath();
  shape.holes.push(hole);

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: BRIDGE_HALF_WIDTH * 2,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  });
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.translate(-BRIDGE_HALF_WIDTH, 0, 0);
  // give the stone a subtle per-vertex tone variation
  const posAttr = bodyGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const v = 0.8 + Math.random() * 0.25 - Math.max(0, (WATER_Y + 0.4 - y)) * 0.35;
    c.setRGB(v, v * 1.01, v * 0.98);
    if (y < WATER_Y + 0.5) c.offsetHSL(0.25, 0.12, -0.06); // mossy near waterline
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  stoneMat.vertexColors = true;
  const body = new THREE.Mesh(bodyGeo, stoneMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // ---- deck surface with step-band shading
  const deckGeo = new THREE.PlaneGeometry(BRIDGE_HALF_WIDTH * 2, span * 2, 1, 48);
  deckGeo.rotateX(-Math.PI / 2);
  const dp = deckGeo.attributes.position;
  const dColors = new Float32Array(dp.count * 3);
  for (let i = 0; i < dp.count; i++) {
    const z = dp.getZ(i);
    dp.setY(i, deckY(z) + 0.02);
    const tread = Math.abs(((z / 0.42) % 1) - 0.5) * 2; // 0 centre of tread, 1 at edge
    const v = 0.92 - tread * 0.22;
    dColors[i * 3] = v;
    dColors[i * 3 + 1] = v;
    dColors[i * 3 + 2] = v * 1.02;
  }
  deckGeo.setAttribute('color', new THREE.BufferAttribute(dColors, 3));
  deckGeo.computeVertexNormals();
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8, vertexColors: true }));
  deck.receiveShadow = true;
  deck.position.y = 0;
  group.add(deck);

  // ---- balustrades: rails + posts + lantern posts following the deck curve
  const parts: THREE.BufferGeometry[] = [];
  const postTops: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    const M = 26;
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= M; i++) {
      const z = -span + 0.3 + ((span * 2 - 0.6) * i) / M;
      const p = new THREE.Vector3(sx * (BRIDGE_HALF_WIDTH - 0.12), deckY(z) + 0.72, z);
      if (prev) {
        const mid = prev.clone().add(p).multiplyScalar(0.5);
        const len = prev.distanceTo(p) + 0.05;
        const rail = new THREE.BoxGeometry(0.14, 0.1, len);
        rail.rotateX(Math.atan2(p.y - prev.y, p.z - prev.z));
        rail.translate(mid.x, mid.y, mid.z);
        parts.push(rail);
      }
      prev = p;
      // posts every other sample
      if (i % 2 === 0) {
        const post = new THREE.BoxGeometry(0.18, 0.66, 0.18);
        post.translate(sx * (BRIDGE_HALF_WIDTH - 0.12), deckY(z) + 0.36, z);
        parts.push(post);
        const cap = new THREE.BoxGeometry(0.26, 0.08, 0.26);
        cap.translate(sx * (BRIDGE_HALF_WIDTH - 0.12), deckY(z) + 0.72, z);
        parts.push(cap);
        postTops.push(new THREE.Vector3(sx * (BRIDGE_HALF_WIDTH - 0.12), deckY(z) + 0.85, z));
      }
    }
  }
  const balustrade = new THREE.Mesh(mergeGeometries(parts, false)!, woodMat);
  balustrade.castShadow = true;
  group.add(balustrade);

  // lanterns hang from alternating posts
  postTops.forEach((p, i) => {
    if (i % 2 === 0) lanternAnchors.push({ pos: p.clone().add(new THREE.Vector3(0, -0.22, 0)), scale: 0.72 });
  });

  // ---- approach steps on the quays
  const stepGeos: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BoxGeometry(BRIDGE_HALF_WIDTH * 2 + 0.7, 0.16, 0.55);
      g.translate(0, 0.08 + (2 - i) * 0.16, s * (span + 0.3 + i * 0.55));
      stepGeos.push(g);
    }
  }
  const steps = new THREE.Mesh(mergeGeometries(stepGeos, false)!, stoneMat);
  steps.receiveShadow = true;
  group.add(steps);

  return { group, lanternAnchors };
}
