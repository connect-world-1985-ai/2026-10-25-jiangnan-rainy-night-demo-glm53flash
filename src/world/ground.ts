// Wet flagstone streets: one broad paved plane for the town core, dark earth
// beyond it, and the canal-edge curbs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pavingTextures } from '../core/textures';
import { CANAL_HALF, TOWN_HALF } from './town';

export interface GroundResult {
  group: THREE.Group;
  envMaterials: THREE.MeshStandardMaterial[];
}

export function buildGround(): GroundResult {
  const group = new THREE.Group();
  const { map, roughnessMap } = pavingTextures();
  map.repeat.set(46, 14);
  roughnessMap.repeat.set(46, 14);

  const paveMat = new THREE.MeshStandardMaterial({
    map,
    roughnessMap,
    roughness: 1,
    color: 0xbfc2c6,
    envMapIntensity: 0.55,
  });
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(TOWN_HALF * 2 + 60, 34.5), paveMat);
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(0, 0, 20.75);
  pave.receiveShadow = true;
  group.add(pave);
  const pave2 = pave.clone();
  pave2.position.z = -20.75;
  group.add(pave2);

  // dark earth far beyond the paved core
  // dark earth far beyond the paved core — split around the canal so the
  // water surface stays visible
  const earthMat = new THREE.MeshStandardMaterial({ color: 0x0d1116, roughness: 1 });
  for (const s of [1, -1]) {
    const earth = new THREE.Mesh(new THREE.PlaneGeometry(900, 446.5), earthMat);
    earth.rotation.x = -Math.PI / 2;
    earth.position.set(0, -0.06, s * (CANAL_HALF + 223.25));
    group.add(earth);
  }

  // curb line of long stones along both water edges
  const curbGeos: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const g = new THREE.BoxGeometry(TOWN_HALF * 2 + 10, 0.18, 0.5);
    g.translate(0, 0.09, s * (CANAL_HALF + 0.25));
    curbGeos.push(g);
  }
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x565a5e, roughness: 0.55, envMapIntensity: 1.1 });
  group.add(new THREE.Mesh(mergeBoxes(curbGeos), curbMat));

  return { group, envMaterials: [paveMat, curbMat] };
}

function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(list, false)!;
}
