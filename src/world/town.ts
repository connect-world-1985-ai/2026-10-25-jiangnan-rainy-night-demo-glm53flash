// Shared town layout: dimensions, the street/canal plan, collision boxes and
// the walkable-ground height field used by the first-person controller.
import { aabbContains, type AABB2, type Rng } from '../core/mathx';

export type { AABB2 };

export const CANAL_HALF = 3.5; // water spans |z| < CANAL_HALF
export const WATER_Y = -1.35;
export const TOWN_HALF = 66; // town extends x in [-TOWN_HALF, TOWN_HALF]
export const QUAY_FRONT = 7.2; // canal-side building front (|z|)
export const QUAY_BACK = 13.2; // second row front (|z|); alley between rows
export const BRIDGE_HALF_SPAN = 8.2; // deck runs |z| <= BRIDGE_HALF_SPAN at x ~ 0
export const BRIDGE_HALF_WIDTH = 2.1;
export const BRIDGE_RISE = 2.35;

export interface Block {
  x: number; // centre
  z: number; // centre
  w: number; // width along x
  d: number; // depth along z
  side: 1 | -1; // which bank
  row: 0 | 1; // 0 = canal-front row, 1 = back row
}

export interface TownPlan {
  blocks: Block[];
  colliders: AABB2[];
  footprints: AABB2[];
  splashPoints: Array<[number, number]>;
  alleyXs: number[];
}

// Alleys cut through the rows at these x positions.
export const ALLEY_XS = [-46, -22, 14, 44];

export function planTown(rng: Rng): TownPlan {
  const blocks: Block[] = [];
  const footprints: AABB2[] = [];

  const addRow = (side: 1 | -1, row: 0 | 1) => {
    const front = row === 0 ? QUAY_FRONT : QUAY_BACK;
    const d = row === 0 ? 7.6 : 7.0;
    let x = -TOWN_HALF + 2;
    while (x < TOWN_HALF - 2) {
      const w = 6.4 + rng() * 5.4;
      const inAlley = ALLEY_XS.some((ax) => Math.abs(x + w / 2 - ax) < 3.6);
      if (!inAlley) {
        const z = side * (front + d / 2);
        blocks.push({ x: x + w / 2, z, w, d, side, row });
        footprints.push({ minX: x, maxX: x + w, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      x += w + 0.3;
    }
  };
  addRow(1, 0);
  addRow(-1, 0);
  addRow(1, 1);
  addRow(-1, 1);

  const colliders: AABB2[] = footprints.map((f) => ({ ...f }));

  // Bridge parapets keep walkers on the deck.
  for (const sx of [-1, 1]) {
    colliders.push({
      minX: sx * BRIDGE_HALF_WIDTH - (sx < 0 ? 0.35 : 0),
      maxX: sx * BRIDGE_HALF_WIDTH + (sx > 0 ? 0.35 : 0),
      minZ: -BRIDGE_HALF_SPAN,
      maxZ: BRIDGE_HALF_SPAN,
    });
  }

  // Splash spawn candidates: quay + alleys + back streets, minus footprints.
  const splashPoints: Array<[number, number]> = [];
  const zone = (x0: number, x1: number, z0: number, z1: number) => {
    for (let i = 0; i < 90; i++) {
      const x = x0 + rng() * (x1 - x0);
      const z = z0 + rng() * (z1 - z0);
      if (footprints.some((f) => aabbContains(f, x, z, 0.4))) continue;
      splashPoints.push([x, z]);
    }
  };
  for (const side of [1, -1]) {
    zone(-TOWN_HALF, TOWN_HALF, side * (CANAL_HALF + 0.3), side * QUAY_FRONT);
    zone(-TOWN_HALF, TOWN_HALF, side * (QUAY_BACK + 0.2), side * (QUAY_BACK + 7));
  }
  for (const ax of ALLEY_XS) {
    zone(ax - 1.6, ax + 1.6, -QUAY_BACK - 7, QUAY_BACK + 7);
  }
  zone(-BRIDGE_HALF_WIDTH + 0.3, BRIDGE_HALF_WIDTH - 0.3, -BRIDGE_HALF_SPAN + 1, BRIDGE_HALF_SPAN - 1);

  return { blocks, colliders, footprints, splashPoints, alleyXs: ALLEY_XS };
}

export const plan = planTown(mulberry32(20261025));
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inBridgeDeck = (x: number, z: number) =>
  Math.abs(x) <= BRIDGE_HALF_WIDTH - 0.15 && Math.abs(z) <= BRIDGE_HALF_SPAN;

/** Walkable ground height (streets = 0, bridge deck arches over the canal). */
export function groundHeight(x: number, z: number): number {
  if (!inBridgeDeck(x, z)) return 0;
  const t = Math.abs(z) / BRIDGE_HALF_SPAN;
  const ramp = Math.min(1, (BRIDGE_HALF_SPAN - Math.abs(z)) / 1.6);
  return (0.12 + BRIDGE_RISE * (1 - t * t)) * ramp;
}

/** True when a walker standing at (x,z) would be over open water. */
export function overWater(x: number, z: number): boolean {
  if (inBridgeDeck(x, z)) return false;
  return Math.abs(z) < CANAL_HALF + 0.15;
}
