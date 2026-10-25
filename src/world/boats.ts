// 乌篷船 black-awninged sampan boats: lathe hulls, bamboo-mat canopies, oars,
// a moored fleet and one boat gliding through the mist along the canal.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, type Rng } from '../core/mathx';
import { bambooTexture, woodTexture } from '../core/textures';
import { WATER_Y, groundHeight } from './town';
import type { LanternAnchor } from './buildings';

export interface BoatsResult {
  group: THREE.Group;
  movingBoat: THREE.Group;
  boatLight: { pos: THREE.Vector3; color: THREE.Color; intensity: number };
  lanternAnchors: LanternAnchor[];
  update: (t: number) => void;
}

function hullGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.3, 0.02),
    new THREE.Vector2(0.58, 0.1),
    new THREE.Vector2(0.82, 0.28),
    new THREE.Vector2(0.94, 0.48),
    new THREE.Vector2(0.97, 0.56),
  ];
  const geo = new THREE.LatheGeometry(pts, 22);
  geo.scale(3.1, 1, 1.25);
  geo.computeVertexNormals();
  return geo;
}

function canopyGeometry(): THREE.BufferGeometry {
  // half-cylinder awning running along x
  const geo = new THREE.CylinderGeometry(0.66, 0.66, 2.5, 12, 1, true, 0, Math.PI);
  geo.rotateZ(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [geo];
  for (const x of [-0.9, 0, 0.9]) {
    const rib = new THREE.TorusGeometry(0.67, 0.025, 5, 14, Math.PI);
    rib.rotateY(Math.PI / 2);
    rib.translate(x, 0, 0);
    parts.push(rib);
  }
  return mergeGeometries(parts, false)!;
}

export function buildBoats(): BoatsResult {
  const rng = mulberry32(3141);
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ map: woodTexture(83, 0.4), roughness: 0.75, color: 0x6a5844 });
  const matMat = new THREE.MeshStandardMaterial({ map: bambooTexture(), roughness: 0.85, side: THREE.DoubleSide, color: 0x9a8a6c });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x17130e, roughness: 0.9 });

  function makeBoat(withBoatman: boolean, withBowLantern: boolean): { g: THREE.Group; anchor?: LanternAnchor } {
    const g = new THREE.Group();

    const hull = new THREE.Mesh(hullGeometry(), hullMat);
    hull.castShadow = true;
    g.add(hull);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.05, 6, 24), darkMat);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(3.1, 1.25, 1);
    rim.position.y = 0.56;
    g.add(rim);

    for (const bx of [-1.1, 1.35]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 1.7), hullMat);
      bench.position.set(bx, 0.52, 0);
      g.add(bench);
    }

    const canopy = new THREE.Mesh(canopyGeometry(), matMat);
    canopy.position.set(-0.25, 0.42, 0);
    canopy.castShadow = true;
    g.add(canopy);

    // sweep oar at the stern
    const oar = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.4, 6), darkMat);
    shaft.rotation.x = Math.PI / 2 - 0.5;
    shaft.position.set(0, 0.5, -0.6);
    oar.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.16), hullMat);
    blade.position.set(0, 0.02, -1.65);
    blade.rotation.x = 0.4;
    oar.add(blade);
    oar.position.set(1.7, 0.3, 0);
    g.add(oar);

    if (withBoatman) {
      const bm = makeSilhouette(0x14161c);
      bm.g.scale.setScalar(0.92);
      bm.g.position.set(1.15, 0.42, 0.15);
      bm.g.rotation.y = Math.PI / 2;
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.16, 10), bm.mat);
      hat.position.y = 1.62;
      bm.g.add(hat);
      g.add(bm.g);
    }

    let anchor: LanternAnchor | undefined;
    if (withBowLantern) {
      anchor = { pos: new THREE.Vector3(2.55, 1.05, 0.35), scale: 0.75 };
    }
    return { g, anchor };
  }

  // moored boats hugging the quays
  const mooredAnchors: LanternAnchor[] = [];
  const spots: Array<[number, number, number]> = [
    [-13, 2.1, 0.15],
    [-12.2, -2.3, -0.1],
    [31, 2.2, -0.2],
    [38, -2.1, 0.12],
    [52, 2.0, 0.05],
    [-44, -2.2, -0.08],
  ];
  for (const [x, z, tilt] of spots) {
    const { g, anchor } = makeBoat(rng() < 0.5, rng() < 0.5);
    g.position.set(x, WATER_Y + 0.14, z);
    g.rotation.z = tilt;
    g.rotation.y = rng() < 0.5 ? 0 : Math.PI;
    group.add(g);
    if (anchor) {
      const world = anchor.pos.clone().applyQuaternion(g.quaternion).add(g.position);
      mooredAnchors.push({ pos: world, scale: anchor.scale });
    }
  }

  // the gliding boat
  const moving = makeBoat(true, true);
  const movingBoat = moving.g;
  const boatLight = { pos: new THREE.Vector3(), color: new THREE.Color(0xffa050), intensity: 9 };
  group.add(movingBoat);

  const update = (t: number) => {
    const speed = 1.15;
    const x = -62 + ((t * speed) % 128);
    movingBoat.position.set(x, WATER_Y + 0.16 + Math.sin(t * 1.7) * 0.045, Math.sin(x * 0.06) * 0.55);
    movingBoat.rotation.z = Math.sin(t * 1.3) * 0.035;
    movingBoat.rotation.x = Math.sin(t * 1.1 + 1) * 0.02;
    if (moving.anchor) {
      moving.anchor.pos.set(x + 2.55, WATER_Y + 0.16 + 1.05, movingBoat.position.z + 0.35);
      boatLight.pos.copy(moving.anchor.pos).add(new THREE.Vector3(0, -0.1, 0));
    }
  };
  update(0);

  return { group, movingBoat, boatLight, lanternAnchors: mooredAnchors, update };
}

// ------------------------------------------------------- silhouette figures
export function makeSilhouette(color = 0x1b1e24): { g: THREE.Group; mat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.62, 4, 10), mat);
  body.position.y = 0.95;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), mat);
  head.position.y = 1.5;
  g.add(head);
  return { g, mat };
}

export interface PeopleResult {
  group: THREE.Group;
  update: (t: number) => void;
}

export function buildPeople(): PeopleResult {
  const group = new THREE.Group();

  function makeUmbrella(): THREE.Group {
    const u = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.24, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xb8402e,
        roughness: 0.8,
        side: THREE.DoubleSide,
        emissive: 0x552211,
        emissiveIntensity: 0.4,
      }),
    );
    u.add(canopy);
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 1.05, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 }),
    );
    handle.position.y = -0.4;
    u.add(handle);
    return u;
  }

  // walker crossing the bridge with a bamboo hat and an umbrella
  const w1 = makeSilhouette(0x16181e);
  const walker1 = w1.g;
  const hat1 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.14, 10), w1.mat);
  hat1.position.y = 1.62;
  walker1.add(hat1);
  const umb1 = makeUmbrella();
  umb1.position.set(0.18, 1.72, 0.12);
  umb1.rotation.z = -0.12;
  walker1.add(umb1);
  group.add(walker1);

  // walker strolling the west quay
  const walker2 = makeSilhouette(0x1a1d24).g;
  const umb2 = makeUmbrella();
  umb2.position.set(0.16, 1.7, 0.1);
  umb2.rotation.z = -0.1;
  walker2.add(umb2);
  group.add(walker2);

  // a figure standing beneath the awning
  const stander = makeSilhouette(0x131619).g;
  stander.position.set(-34.5, 0, 4.6);
  stander.rotation.y = 2.4;
  group.add(stander);

  const update = (t: number) => {
    // bridge crossing, ~24s loop
    const z = -11 + ((t * 0.95) % 22);
    walker1.position.set(0.45 + Math.sin(t * 0.4) * 0.35, groundY(z), z);
    walker1.rotation.y = Math.PI / 2;
    walker1.position.y += Math.abs(Math.sin(t * 4.4)) * 0.045;
    umb1.position.y = 1.72 + Math.sin(t * 4.4) * 0.015;

    // quay stroll
    const x2 = -58 + ((t * 0.75) % 44);
    walker2.position.set(x2, 0.02 + Math.abs(Math.sin(t * 3.6)) * 0.04, 4.7);
    walker2.rotation.y = Math.PI / 2;
    umb2.position.y = 1.7 + Math.sin(t * 3.6) * 0.015;
  };
  update(0);

  return { group, update };
}

function groundY(z: number): number {
  return groundHeight(0.45, z);
}
