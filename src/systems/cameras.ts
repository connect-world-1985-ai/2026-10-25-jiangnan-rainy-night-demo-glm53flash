// Camera director: four cinematic presets (with eased transitions), a
// first-person walk controller with collision and pointer-lock mouse look,
// an orbit mode (OrbitControls) and a free-fly mode.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { easeInOut, clamp, aabbContains } from '../core/mathx';
import { TOWN_HALF, groundHeight, overWater, type AABB2 } from '../world/town';

export type CamMode = 'bridge' | 'boat' | 'alley' | 'overview' | 'walk' | 'orbit' | 'fly';

export const PRESET_ORDER: CamMode[] = ['bridge', 'boat', 'alley', 'overview'];

interface Target {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export class CameraDirector {
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  colliders: AABB2[];
  boat: THREE.Object3D;
  mode: CamMode = 'bridge';
  onModeChange?: (m: CamMode) => void;
  isLocked = false;

  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private vel = new THREE.Vector3();
  private bobPhase = 0;
  private controls: OrbitControls;
  private transT = -1; // <0 idle
  private transDur = 2.2;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private targetFn: (() => Target) | null = null;
  private tmpV = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private eyeH = 1.62;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, colliders: AABB2[], boat: THREE.Object3D) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;
    this.boat = boat;
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = 1.54;
    this.controls.target.set(0, 1.2, 0);
    this.controls.enabled = false;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    dom.addEventListener('click', () => {
      if ((this.mode === 'walk' || this.mode === 'fly') && document.pointerLockElement !== dom) {
        this.requestLook();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === dom;
      this.onModeChange?.(this.mode);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const s = 0.0021;
      this.yaw -= e.movementX * s;
      this.pitch = clamp(this.pitch - e.movementY * s, this.mode === 'fly' ? -1.55 : -1.45, 1.55);
    });
    // arrow keys turn the view too (no pointer lock required)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft') this.turning = -1;
      if (e.code === 'ArrowRight') this.turning = 1;
      if (e.code === 'ArrowUp') this.pitching = 1;
      if (e.code === 'ArrowDown') this.pitching = -1;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' && this.turning < 0) this.turning = 0;
      if (e.code === 'ArrowRight' && this.turning > 0) this.turning = 0;
      if (e.code === 'ArrowUp' && this.pitching > 0) this.pitching = 0;
      if (e.code === 'ArrowDown' && this.pitching < 0) this.pitching = 0;
    });
  }

  private turning = 0;
  private pitching = 0;

  // ------------------------------------------------------------------ modes
  setMode(m: CamMode, instant = false) {
    if (m === this.mode && !instant) return;
    const prev = this.mode;
    this.mode = m;
    this.controls.enabled = m === 'orbit';
    if (m === 'orbit' && prev !== 'orbit') {
      // anchor the orbit target a little ahead of the current view
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const t = this.camera.position.clone().add(dir.multiplyScalar(10));
      t.y = clamp(t.y, 0.5, 20);
      this.controls.target.copy(t);
    }
    if ((m === 'walk' || m === 'fly') && (prev === 'bridge' || prev === 'boat' || prev === 'alley' || prev === 'overview' || prev === 'orbit')) {
      this.enterGround(m === 'walk');
    }
    if (m === 'walk' || m === 'fly') {
      this.vel.set(0, 0, 0);
    } else if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (!instant && m !== 'walk' && m !== 'fly') this.beginTransition(this.targetFor(m), m === 'boat' ? 2.6 : 2.1);
    else this.snapTo(this.targetFor(m));
    this.onModeChange?.(m);
    if (m === 'walk' || m === 'fly') this.requestLook();
  }

  /** Pointer lock can reject (no user gesture, headless) — never let that abort a mode switch. */
  private requestLook() {
    if (new URLSearchParams(location.search).has('nolock')) return;
    try {
      const r = this.dom.requestPointerLock?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch {
      /* pointer lock unavailable — arrow keys still turn the view */
    }
  }

  /** Cinematic glide into the current preset (used after the splash gate). */
  intro(dur = 3.4) {
    this.beginTransition(this.targetFor(this.mode), dur);
  }

  /** Adopt the camera's current placement as the fly/walk state (QA helper). */
  syncFromCamera() {
    this.syncLookFromCamera();
    this.vel.set(0, 0, 0);
  }

  private enterGround(walk: boolean) {
    const p = this.camera.position;
    let x = clamp(p.x, -TOWN_HALF + 2, TOWN_HALF - 2);
    let z = clamp(p.z, -26, 26);
    if (walk) {
      const spot = this.findWalkable(x, z);
      x = spot.x;
      z = spot.z;
    }
    const gy = walk ? groundHeight(x, z) : Math.max(p.y - 1.62, 1);
    p.set(x, gy + this.eyeH, z);
    // derive yaw/pitch from the current orientation
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = walk ? clamp(Math.asin(clamp(dir.y, -1, 1)), -0.9, 0.9) : this.pitch;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  private findWalkable(x: number, z: number): { x: number; z: number } {
    const ok = (px: number, pz: number) => !overWater(px, pz) && !this.colliders.some((c) => aabbContains(c, px, pz, 0.45));
    if (ok(x, z)) return { x, z };
    for (let r = 1; r < 30; r += 0.8) {
      for (let a = 0; a < 12; a++) {
        const px = x + Math.cos((a / 12) * Math.PI * 2) * r;
        const pz = z + Math.sin((a / 12) * Math.PI * 2) * r;
        if (Math.abs(pz) > 28 || Math.abs(px) > TOWN_HALF - 1) continue;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return { x: 0, z: 5.2 };
  }

  // --------------------------------------------------------------- presets
  private targetFor(m: CamMode): () => Target {
    switch (m) {
      case 'bridge':
        return () => {
          const gy = groundHeight(0.8, 1.4);
          return { pos: new THREE.Vector3(0.8, gy + 1.66, 1.4), look: new THREE.Vector3(-46, 1.0, -1.4) };
        };
      case 'boat':
        return () => {
          const bp = this.boat.position;
          return {
            pos: new THREE.Vector3(bp.x - 7.4, bp.y + 3.4, bp.z - 5.4),
            look: new THREE.Vector3(bp.x + 4.5, bp.y + 0.5, bp.z),
          };
        };
      case 'alley':
        return () => ({ pos: new THREE.Vector3(14.7, 1.62, 9.2), look: new THREE.Vector3(13.7, 1.05, -26) });
      case 'overview':
        return () => ({ pos: new THREE.Vector3(27, 21, 31), look: new THREE.Vector3(-10, 0, -3) });
      case 'walk':
      case 'orbit':
      case 'fly':
        return () => ({ pos: this.camera.position.clone(), look: this.camera.position.clone().add(this.tmpV.set(0, 0, -1).applyQuaternion(this.camera.quaternion)) });
    }
  }

  private beginTransition(targetFn: () => Target, dur = 2.1) {
    this.targetFn = targetFn;
    this.transDur = dur;
    this.transT = 0;
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
  }

  private snapTo(fn: () => Target) {
    const t = fn();
    this.camera.position.copy(t.pos);
    this.camera.lookAt(t.look);
  }

  // ---------------------------------------------------------------- update
  update(dt: number, t: number) {
    if (this.transT >= 0 && this.targetFn) {
      this.transT += dt;
      const p = easeInOut(clamp(this.transT / this.transDur, 0, 1));
      const target = this.targetFn();
      // ease the look target too, then blend orientation
      this.tmpV.copy(target.look);
      const m = new THREE.Matrix4().lookAt(target.pos, target.look, this.up);
      const qTo = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.position.lerpVectors(this.fromPos, target.pos, p);
      this.camera.quaternion.slerpQuaternions(this.fromQuat, qTo, p);
      if (p >= 1) {
        this.transT = -1;
        this.targetFn = null;
        if (this.mode === 'walk' || this.mode === 'fly') this.syncLookFromCamera();
      }
      return;
    }

    switch (this.mode) {
      case 'bridge':
      case 'alley':
      case 'overview':
      case 'boat': {
        const target = this.targetFor(this.mode)();
        // gentle breathing drift keeps the frame alive
        target.pos.x += Math.sin(t * 0.31) * 0.35;
        target.pos.y += Math.sin(t * 0.23) * 0.18;
        target.pos.z += Math.cos(t * 0.27) * 0.3;
        this.camera.position.copy(target.pos);
        this.camera.lookAt(target.look);
        break;
      }
      case 'walk':
        this.updateWalk(dt);
        break;
      case 'fly':
        this.updateFly(dt);
        break;
      case 'orbit':
        this.controls.update();
        break;
    }
  }

  private syncLookFromCamera() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(clamp(dir.y, -1, 1));
  }

  private moveInput(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyW')) z += 1;
    if (this.keys.has('KeyS')) z -= 1;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    return { x, z };
  }

  private applyTurning(dt: number) {
    if (this.turning) this.yaw -= this.turning * dt * 2.4;
    if (this.pitching) this.pitch = clamp(this.pitch + this.pitching * dt * 1.7, this.mode === 'fly' ? -1.55 : -1.45, 1.55);
  }

  private updateWalk(dt: number) {
    this.applyTurning(dt);
    const inp = this.moveInput();
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? 5.6 : 3.1;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    const len = Math.hypot(inp.x, inp.z) || 1;
    const tx = ((fx * inp.z) / len + (rx * inp.x) / len) * speed;
    const tz = ((fz * inp.z) / len + (rz * inp.x) / len) * speed;
    const k = 1 - Math.exp(-dt * 9);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;

    const p = this.camera.position;
    const nx = p.x + this.vel.x * dt;
    const nz = p.z + this.vel.z * dt;
    if (this.canStand(nx, p.z)) p.x = nx;
    else this.vel.x = 0;
    if (this.canStand(p.x, nz)) p.z = nz;
    else this.vel.z = 0;

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bobPhase += dt * (2.1 + moving * 1.35);
    const bob = Math.sin(this.bobPhase * 2.2) * 0.032 * clamp(moving / 3.1, 0, 1);
    p.y = groundHeight(p.x, p.z) + this.eyeH + bob;

    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  private canStand(x: number, z: number): boolean {
    if (Math.abs(x) > TOWN_HALF + 3 || Math.abs(z) > 30) return false;
    if (overWater(x, z)) return false;
    for (const c of this.colliders) if (aabbContains(c, x, z, 0.42)) return false;
    return true;
  }

  private updateFly(dt: number) {
    this.applyTurning(dt);
    const inp = this.moveInput();
    const up = (this.keys.has('Space') ? 1 : 0) - (this.keys.has('KeyC') ? 1 : 0);
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? 17 : 8.5;
    const q = this.camera.quaternion;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const move = new THREE.Vector3()
      .addScaledVector(fwd, inp.z)
      .addScaledVector(right, inp.x)
      .addScaledVector(this.up, up);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    const k = 1 - Math.exp(-dt * 7);
    this.vel.lerp(move, k);
    const p = this.camera.position;
    p.addScaledVector(this.vel, dt);
    p.y = clamp(p.y, -0.7, 46);
    p.x = clamp(p.x, -140, 140);
    p.z = clamp(p.z, -140, 140);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
}
