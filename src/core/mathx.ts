// Small deterministic helpers shared by the procedural generators.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function range(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

export interface AABB2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function aabbContains(b: AABB2, x: number, z: number, pad = 0): boolean {
  return x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
}

export function aabbsOverlap(a: AABB2, b: AABB2): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}
