// Every texture in this demo is generated procedurally on a <canvas> at
// startup — no image assets are downloaded. All functions are cheap enough
// (<= 512px) to run during the initial loading splash.
import * as THREE from 'three';
import { mulberry32, type Rng } from './mathx';

function makeCanvas(w: number, h = w): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return { c, g };
}

interface TexOpts {
  srgb?: boolean;
  repeat?: [number, number];
  aniso?: number;
}

function toTexture(c: HTMLCanvasElement, opts: TexOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 4;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- value noise
function makeNoise(seed: number): (x: number, y: number) => number {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    grad[i] = rng();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = grad[perm[perm[xi] + yi]];
    const ba = grad[perm[perm[xi + 1] + yi]];
    const ab = grad[perm[perm[xi] + yi + 1]];
    const bb = grad[perm[perm[xi + 1] + yi + 1]];
    return (aa * (1 - u) + ba * u) * (1 - v) + (ab * (1 - u) + bb * u) * v;
  };
}

function fillNoise(g: CanvasRenderingContext2D, w: number, h: number, seed: number, scale: number, strength: number) {
  const n = makeNoise(seed);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (n((x / w) * scale, (y / h) * scale) - 0.5) * strength;
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, d[i] + v));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
    }
  }
  g.putImageData(img, 0, 0);
}

function softBlobs(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, rMin: number, rMax: number, color: string, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = rMin + rng() * (rMax - rMin);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------- plaster
export function plasterTexture(seed = 7): THREE.CanvasTexture {
  const S = 512;
  const { c, g } = makeCanvas(S);
  g.fillStyle = '#e9e3d3';
  g.fillRect(0, 0, S, S);
  fillNoise(g, S, S, seed, 9, 26);
  const rng = mulberry32(seed + 1);
  softBlobs(g, rng, S, S, 26, 40, 150, 'rgba(176,168,148,1)', 0.16);
  softBlobs(g, rng, S, S, 14, 20, 60, 'rgba(210,202,184,1)', 0.2);
  // faint vertical rain streaks from eaves
  g.globalAlpha = 0.05;
  for (let i = 0; i < 40; i++) {
    const x = rng() * S;
    const w = 2 + rng() * 5;
    const len = 60 + rng() * 220;
    g.fillStyle = '#9a9484';
    g.fillRect(x, rng() * (S - len), w, len);
  }
  g.globalAlpha = 1;
  return toTexture(c);
}

// ----------------------------------------------------------------- roof tiles
export function roofTileTexture(seed = 11): THREE.CanvasTexture {
  const S = 512;
  const { c, g } = makeCanvas(S);
  const rng = mulberry32(seed);
  const rows = 16;
  const rowH = S / rows;
  g.fillStyle = '#181d23';
  g.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    // flat pan tile bed
    g.fillStyle = r % 2 ? '#1b2128' : '#1d232a';
    g.fillRect(0, y, S, rowH);
    // rounded pan tiles
    const cols = 16;
    const colW = S / cols;
    for (let i = 0; i < cols; i++) {
      const x = i * colW + (r % 2 ? colW / 2 : 0);
      const grad = g.createLinearGradient(x, y, x, y + rowH);
      grad.addColorStop(0, '#39424c');
      grad.addColorStop(0.45, '#232a32');
      grad.addColorStop(1, '#10151a');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse((x + colW / 2) % S, y + rowH / 2, colW * 0.42, rowH * 0.46, 0, 0, Math.PI * 2);
      g.fill();
    }
    // subtle row shadow
    g.fillStyle = 'rgba(5,8,10,0.55)';
    g.fillRect(0, y + rowH - 3, S, 3);
  }
  fillNoise(g, S, S, seed + 2, 24, 14);
  softBlobs(g, rng, S, S, 10, 20, 70, 'rgba(52,66,56,1)', 0.18); // moss hints
  return toTexture(c);
}

// --------------------------------------------------------------- stone blocks
export function stoneBlockTexture(seed = 21): THREE.CanvasTexture {
  const S = 512;
  const { c, g } = makeCanvas(S);
  const rng = mulberry32(seed);
  g.fillStyle = '#31363a';
  g.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S) {
    const rowH = 34 + rng() * 30;
    let x = -rng() * 40;
    while (x < S) {
      const bw = 46 + rng() * 80;
      const v = 88 + rng() * 34;
      g.fillStyle = `rgb(${v},${v + 4},${v + 6})`;
      g.fillRect(x + 2, y + 2, bw - 4, rowH - 4);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + 2, y + 2, bw - 4, 3);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x + 2, y + rowH - 5, bw - 4, 3);
      x += bw;
    }
    y += rowH;
  }
  fillNoise(g, S, S, seed + 3, 16, 18);
  softBlobs(g, rng, S, S, 14, 24, 90, 'rgba(46,62,52,1)', 0.22); // moss
  softBlobs(g, rng, S, S, 10, 30, 110, 'rgba(20,24,26,1)', 0.2);
  return toTexture(c);
}

// --------------------------------------------------------- wet flagstone path
export interface PavingMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export function pavingTextures(seed = 31): PavingMaps {
  const S = 512;
  const { c, g } = makeCanvas(S);
  const rc = makeCanvas(S);
  const rg = rc.g;
  const rng = mulberry32(seed);
  g.fillStyle = '#43464a';
  g.fillRect(0, 0, S, S);
  rg.fillStyle = 'rgb(158,158,158)'; // mid roughness
  rg.fillRect(0, 0, S, S);
  // puddle blobs (shared between colour + roughness maps)
  const puddles: Array<[number, number, number]> = [];
  for (let i = 0; i < 22; i++) puddles.push([rng() * S, rng() * S, 26 + rng() * 70]);
  for (const [px, py, pr] of puddles) {
    const grad = g.createRadialGradient(px, py, pr * 0.2, px, py, pr);
    grad.addColorStop(0, 'rgba(16,20,26,0.85)');
    grad.addColorStop(1, 'rgba(16,20,26,0)');
    g.fillStyle = grad;
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    const rgrad = rg.createRadialGradient(px, py, pr * 0.2, px, py, pr);
    rgrad.addColorStop(0, 'rgb(14,14,14)');
    rgrad.addColorStop(0.75, 'rgb(40,40,40)');
    rgrad.addColorStop(1, 'rgba(158,158,158,0)');
    rg.fillStyle = rgrad;
    rg.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  // flagstone slabs laid on top
  const rows = 6;
  const rowH = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rng() * 60;
    const y = r * rowH;
    while (x < S) {
      const bw = 70 + rng() * 90;
      const v = 64 + rng() * 22;
      g.fillStyle = `rgb(${v},${v + 2},${v + 3})`;
      g.fillRect(x + 3, y + 3, bw - 6, rowH - 6);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x + 3, y + 3, bw - 6, 2);
      x += bw;
    }
    g.fillStyle = 'rgba(10,12,14,0.9)';
    g.fillRect(0, y, S, 4);
  }
  fillNoise(g, S, S, seed + 4, 18, 16);
  fillNoise(rg, S, S, seed + 5, 20, 26);
  return { map: toTexture(c), roughnessMap: toTexture(rc.c, { srgb: false }) };
}

// ----------------------------------------------------------------------- wood
export function woodTexture(seed = 41, dark = 0.42): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S);
  const rng = mulberry32(seed);
  const base = 96 * dark;
  g.fillStyle = `rgb(${base + 34},${base + 16},${base + 4})`;
  g.fillRect(0, 0, S, S);
  // grain
  for (let i = 0; i < 90; i++) {
    const x = rng() * S;
    g.strokeStyle = `rgba(${20 + rng() * 30},${12 + rng() * 20},${6 + rng() * 12},${0.25 + rng() * 0.3})`;
    g.lineWidth = 0.6 + rng() * 1.8;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= S; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
    g.stroke();
  }
  // plank gaps
  g.fillStyle = 'rgba(8,6,4,0.8)';
  for (let i = 0; i < 4; i++) g.fillRect(0, (i * S) / 4, S, 2);
  fillNoise(g, S, S, seed + 6, 12, 18);
  return toTexture(c);
}

// ----------------------------------------------------------------- bamboo mat
export function bambooTexture(seed = 51): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S);
  g.fillStyle = '#5d4a2e';
  g.fillRect(0, 0, S, S);
  const cell = 16;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const over = ((x / cell + y / cell) % 2) === 0;
      g.fillStyle = over ? '#8a6c3e' : '#6d5530';
      g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      g.fillStyle = 'rgba(255,240,200,0.16)';
      g.fillRect(x + 1, y + 1, cell - 2, 3);
      g.fillStyle = 'rgba(20,12,4,0.5)';
      if (over) g.fillRect(x + 1, y + cell - 4, cell - 2, 3);
    }
  }
  fillNoise(g, S, S, seed + 7, 20, 16);
  return toTexture(c);
}

// ---------------------------------------------------------- lantern / windows
export function lanternTexture(seed = 61): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S);
  const grad = g.createRadialGradient(S / 2, S * 0.62, 8, S / 2, S / 2, S * 0.62);
  grad.addColorStop(0, '#ffcf8a');
  grad.addColorStop(0.55, '#e0512e');
  grad.addColorStop(1, '#8f1f16');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // silk ribs
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * S;
    g.fillStyle = 'rgba(60,10,8,0.28)';
    g.fillRect(x, 0, 2.5, S);
  }
  softBlobs(g, mulberry32(seed + 1), S, S, 8, 20, 80, 'rgba(255,190,110,1)', 0.25);
  fillNoise(g, S, S, seed, 14, 12);
  return toTexture(c);
}

export function windowGlowTexture(seed = 71): THREE.CanvasTexture {
  const S = 128;
  const { c, g } = makeCanvas(S);
  const grad = g.createRadialGradient(S * 0.5, S * 0.55, 4, S * 0.5, S * 0.5, S * 0.75);
  grad.addColorStop(0, '#ffe3ae');
  grad.addColorStop(0.5, '#f5a95c');
  grad.addColorStop(1, '#8a4a1e');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // candle flicker blotches
  softBlobs(g, mulberry32(seed + 1), S, S, 6, 10, 34, 'rgba(255,236,190,1)', 0.5);
  fillNoise(g, S, S, seed, 8, 22);
  return toTexture(c);
}

// ------------------------------------------------------------ oil-paper umbrella
export function umbrellaTexture(seed = 81): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S);
  const wedges = 12;
  for (let i = 0; i < wedges; i++) {
    const a0 = (i / wedges) * Math.PI * 2;
    const a1 = ((i + 1) / wedges) * Math.PI * 2;
    g.fillStyle = i % 2 ? '#b8402e' : '#d8b98a';
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    g.arc(S / 2, S / 2, S / 2, a0, a1);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,30,18,0.75)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    g.lineTo(S / 2 + Math.cos(a0) * S * 0.5, S / 2 + Math.sin(a0) * S * 0.5);
    g.stroke();
  }
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,220,160,0.35)');
  grad.addColorStop(1, 'rgba(40,20,10,0.4)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  fillNoise(g, S, S, seed, 16, 14);
  return toTexture(c);
}

// ---------------------------------------------------------------- willow leaves
export function willowLeafTexture(seed = 91): THREE.CanvasTexture {
  const W = 128;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const rng = mulberry32(seed);
  g.clearRect(0, 0, W, H);
  // drooping leaf clusters; v axis = along strand
  for (let i = 0; i < 240; i++) {
    const y = rng() * H;
    const side = rng() > 0.5 ? 1 : -1;
    const x = W / 2 + side * (6 + rng() * 48);
    const len = 10 + rng() * 22;
    const ang = side > 0 ? 0.9 : Math.PI - 0.9;
    g.save();
    g.translate(x, y);
    g.rotate(ang + (rng() - 0.5) * 0.5);
    const hue = 78 + rng() * 30;
    const lit = 22 + rng() * 20;
    g.fillStyle = `hsla(${hue},${28 + rng() * 18}%,${lit}%,${0.75 + rng() * 0.25})`;
    g.beginPath();
    g.ellipse(len / 2, 0, len / 2, 1.6 + rng() * 1.2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

// ------------------------------------------------------------------ soft blobs
export function radialGlowTexture(inner = 'rgba(255,255,255,0.9)', mid = 'rgba(255,255,255,0.25)', size = 256): THREE.CanvasTexture {
  const { c, g } = makeCanvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, mid);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return toTexture(c);
}

export function splashTexture(): THREE.CanvasTexture {
  const S = 128;
  const { c, g } = makeCanvas(S);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.32, 0, Math.PI * 2);
  g.stroke();
  g.filter = 'blur(3px)';
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.32, 0, Math.PI * 2);
  g.stroke();
  g.filter = 'none';
  const rng = mulberry32(5);
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const r = S * (0.36 + rng() * 0.12);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1.6 + rng() * 2, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

// ------------------------------------------------------------------- mountains
export function mountainTexture(seed: number, fill: string): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  const rng = mulberry32(seed);
  const n = makeNoise(seed + 9);
  g.clearRect(0, 0, W, H);
  const ridge: number[] = [];
  const baseY = H * 0.52;
  for (let x = 0; x <= W; x += 4) {
    const t = x / W;
    let y =
      baseY -
      Math.sin(t * Math.PI * 3 + seed) * 22 -
      Math.sin(t * Math.PI * 9 + seed * 2) * 12 -
      n(t * 6, seed) * 46 -
      n(t * 17, seed * 3) * 14;
    y = Math.max(H * 0.08, y);
    ridge.push(y);
  }
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, fill);
  grad.addColorStop(0.85, fill);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, H);
  ridge.forEach((y, i) => g.lineTo(i * 4, y));
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  // soft mist at the ridge line
  g.globalAlpha = 0.35;
  g.filter = 'blur(6px)';
  g.strokeStyle = fill;
  g.lineWidth = 10;
  g.beginPath();
  ridge.forEach((y, i) => (i === 0 ? g.moveTo(0, y) : g.lineTo(i * 4, y)));
  g.stroke();
  g.filter = 'none';
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ calligraphy
const CN_FONT = '"Kaiti SC","STKaiti","KaiTi","BiauKai","Noto Serif SC","Noto Serif CJK SC","SimSun",serif';

export function bannerTexture(chars: string, cloth = '#25313e', ink = '#e6dcc2'): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = cloth;
  g.fillRect(0, 0, W, H);
  fillNoise(g, W, H, chars.length * 131, 10, 18);
  // woven border
  g.strokeStyle = 'rgba(220,205,170,0.8)';
  g.lineWidth = 8;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.strokeStyle = 'rgba(180,160,120,0.5)';
  g.lineWidth = 2;
  g.strokeRect(22, 22, W - 44, H - 44);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const n = chars.length;
  const step = (H - 120) / Math.max(n, 1);
  for (let i = 0; i < n; i++) {
    g.font = `${Math.min(150, step * 0.92)}px ${CN_FONT}`;
    g.fillText(chars[i], W / 2, 80 + step * (i + 0.5));
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function plaqueTexture(chars: string): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#171310';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#8a6a34';
  g.lineWidth = 6;
  g.strokeRect(6, 6, W - 12, H - 12);
  g.fillStyle = '#caa54e';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `86px ${CN_FONT}`;
  const n = chars.length;
  const step = (W - 80) / Math.max(n, 1);
  for (let i = 0; i < n; i++) g.fillText(chars[i], 40 + step * (i + 0.5), H / 2 + 4);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// -------------------------------------------------------------- ripple normals
export function rippleNormalTexture(seed = 101): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S);
  g.fillStyle = '#8080ff';
  g.fillRect(0, 0, S, S);
  const rng = mulberry32(seed);
  for (let i = 0; i < 90; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 6 + rng() * 22;
    const strength = 0.25 + rng() * 0.5;
    for (const [dx, col] of [
      [-1, 'rgba(60,60,255,1)'],
      [1, 'rgba(200,200,255,1)'],
    ] as Array<[number, string]>) {
      const grad = g.createRadialGradient(x + dx * r * 0.6, y, 0, x + dx * r * 0.6, y, r);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(128,128,255,0)');
      g.globalAlpha = strength * 0.4;
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  g.globalAlpha = 1;
  return toTexture(c, { srgb: false });
}
