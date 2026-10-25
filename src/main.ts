import './style.css';
import * as THREE from 'three';
import { buildTown } from './world/buildings';
import { buildWater, type LanternLightInfo, type QualityLevel } from './world/water';
import { buildBridge } from './world/bridge';
import { buildProps } from './world/props';
import { buildBoats, buildPeople } from './world/boats';
import { buildNature, tickWillows } from './world/nature';
import { buildRain } from './fx/rain';
import { buildPostFX } from './fx/postfx';
import { CameraDirector, PRESET_ORDER, type CamMode } from './systems/cameras';
import { Ambience } from './systems/audio';
import { buildUI } from './ui/overlay';
import { plan } from './world/town';
import { buildGround } from './world/ground';
import { lerp } from './core/mathx';

interface QualityConfig {
  dpr: number;
  rain: number;
  splash: number;
  fogSprites: number;
  shadow: boolean;
}

const QUALITY: Record<QualityLevel, QualityConfig> = {
  low: { dpr: 0.85, rain: 1800, splash: 150, fogSprites: 8, shadow: false },
  medium: { dpr: 1.25, rain: 4200, splash: 320, fogSprites: 16, shadow: false },
  high: { dpr: 1.6, rain: 8500, splash: 520, fogSprites: 28, shadow: true },
};

const FOG_COLOR = new THREE.Color(0x27313d);

function boot() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    const fb = document.getElementById('fallback');
    if (fb) {
      fb.style.display = 'flex';
      fb.textContent = '此演示需要支持 WebGL 的浏览器 · A WebGL-capable browser is required';
    }
    console.error(e);
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e13);
  scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.024);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(64, 30, 76);
  camera.lookAt(0, 0, 0);

  // ------------------------------------------------------------- lighting
  const hemi = new THREE.HemisphereLight(0x37455a, 0x1a1512, 0.7);
  scene.add(hemi);
  const moonDir = new THREE.DirectionalLight(0x8fa7c8, 0.9);
  moonDir.position.set(60, 90, -50);
  moonDir.castShadow = false;
  moonDir.shadow.mapSize.set(2048, 2048);
  moonDir.shadow.camera.left = -80;
  moonDir.shadow.camera.right = 80;
  moonDir.shadow.camera.top = 60;
  moonDir.shadow.camera.bottom = -60;
  moonDir.shadow.camera.far = 260;
  moonDir.shadow.bias = -0.0006;
  moonDir.shadow.radius = 5;
  scene.add(moonDir);

  // ---------------------------------------------------------------- world
  const town = buildTown();
  scene.add(town.group);

  const ground = buildGround();
  scene.add(ground.group);

  const boats = buildBoats();
  scene.add(boats.group);

  const bridge = buildBridge();
  scene.add(bridge.group);

  const people = buildPeople();
  scene.add(people.group);

  const props = buildProps([...town.lanternAnchors, ...bridge.lanternAnchors, ...boats.lanternAnchors]);
  scene.add(props.group);

  const nature = buildNature(scene);
  const rain = buildRain(scene);
  const water = buildWater();
  scene.add(water.group);

  // --------------------------------------------------------------- postfx
  const postfx = buildPostFX(renderer, scene, camera);

  // static environment reflection for wet stone / puddles
  const cubeRT = new THREE.WebGLCubeRenderTarget(128);
  const cubeCam = new THREE.CubeCamera(0.5, 320, cubeRT);
  cubeCam.position.set(0, 2.6, 7);
  scene.add(cubeCam);
  cubeCam.update(renderer, scene);
  scene.environment = cubeRT.texture;
  scene.environmentIntensity = 0.22;

  // ------------------------------------------------------------ director
  const director = new CameraDirector(camera, renderer.domElement, plan.colliders, boats.movingBoat);

  // ----------------------------------------------------------------- audio
  const audio = new Ambience();
  let rainLevel = 0.7;

  // -------------------------------------------------------------------- ui
  let quality: QualityLevel = 'medium';
  let autoDowngraded = false;
  const qParam = new URLSearchParams(location.search).get('q');
  const instantParam = new URLSearchParams(location.search).has('instant');
  const instantIfRequested = (m: CamMode) => director.setMode(m, instantParam);
  if (qParam === 'low' || qParam === 'medium' || qParam === 'high') {
    quality = qParam;
    autoDowngraded = true; // manual override: never auto-downgrade
  } else if ((navigator.hardwareConcurrency ?? 8) <= 4) {
    quality = 'low'; // modest device: start cheap, let the user raise it
    autoDowngraded = true;
  }
  const ui = buildUI(document.getElementById('app')!, {
    onCamera: (m: CamMode) => instantIfRequested(m),
    onQuality: (q) => {
      quality = q;
      ui.setQuality(q);
      applyQuality(q);
    },
    onRain: (v) => {
      rainLevel = v;
      rain.setIntensity(v);
      audio.setRain(v);
    },
    onFog: (v) => {
      const d = lerp(0.008, 0.05, v);
      (scene.fog as THREE.FogExp2).density = d;
      water.setFog(FOG_COLOR, d);
    },
    onMute: (m) => {
      audio.setMuted(m);
      ui.setMuted(m);
    },
    onEnter: () => {
      ui.hideSplash();
      try {
        audio.start();
      } catch {
        /* audio unavailable — visuals continue silently */
      }
      const camParam = new URLSearchParams(location.search).get('cam');
      if (instantParam) director.setMode('bridge', true);
      else director.intro(3.6);
      if (camParam) {
        const [x, y, z, lx, ly, lz] = camParam.split(',').map(Number);
        director.setMode('fly', true);
        camera.position.set(x, y, z);
        camera.lookAt(lx, ly, lz);
        director.syncFromCamera();
      }
    },
  });
  ui.setQuality(quality);
  water.setFog(FOG_COLOR, (scene.fog as THREE.FogExp2).density);
  if (new URLSearchParams(location.search).has('nofog')) {
    (scene.fog as THREE.FogExp2).density = 0.0004;
    water.setFog(FOG_COLOR, 0.0004);
  }

  function applyQuality(q: QualityLevel) {
    const cfg = QUALITY[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cfg.dpr));
    onResize();
    rain.setCounts(cfg.rain, cfg.splash);
    water.setQuality(q);
    nature.setFogSpriteCount(cfg.fogSprites);
    moonDir.castShadow = cfg.shadow;
  }
  applyQuality(quality);

  // key-light list for the water shader: 6 nearest to the camera each frame
  const lightPool: LanternLightInfo[] = props.lights.map((l) => ({ pos: l.position, color: l.color, intensity: l.intensity }));
  for (const a of boats.lanternAnchors) {
    const l = new THREE.PointLight(0xffa050, 7, 10, 2);
    l.position.copy(a.pos);
    scene.add(l);
    lightPool.push({ pos: l.position, color: l.color, intensity: 7 });
  }
  lightPool.push({ pos: boats.boatLight.pos, color: boats.boatLight.color, intensity: boats.boatLight.intensity });
  const nearest: LanternLightInfo[] = [];
  const updateWaterLights = () => {
    for (let i = 0; i < props.lights.length; i++) lightPool[i].intensity = props.lights[i].intensity;
    nearest.length = 0;
    for (const li of lightPool) nearest.push(li);
    nearest.sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
    water.setLanterns(nearest.slice(0, 6));
  };

  director.onModeChange = (m) => {
    ui.setMode(m);
    const hints: Partial<Record<CamMode, string>> = {
      walk: 'W A S D 行走 · 鼠标环顾 · Esc 释放鼠标',
      fly: 'W A S D 御风 · 空格升 · C 降',
      orbit: '拖拽旋转 · 滚轮远近',
      bridge: '桥上观澜 · 雨丝斜织灯影',
      boat: '舟行波上 · 桨声灯影',
      alley: '深巷灯影 · 青石生苔',
      overview: '凭虚远眺 · 粉墙黛瓦如画',
    };
    if (hints[m]) ui.toast(hints[m]!);
  };

  window.addEventListener('keydown', (e) => {
    if (ui.splashVisible()) {
      if (e.code === 'Enter' || e.code === 'Space') (document.getElementById('enter-btn') as HTMLButtonElement)?.click();
      return;
    }
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (idx >= 0) instantIfRequested(PRESET_ORDER[idx]);
    else if (e.code === 'Digit5') instantIfRequested('walk');
    else if (e.code === 'Digit6') instantIfRequested('orbit');
    else if (e.code === 'Digit7') instantIfRequested('fly');
    else if (e.code === 'KeyM') {
      const m = !audio.isMuted;
      audio.setMuted(m);
      ui.setMuted(m);
    } else if (e.code === 'KeyH') (document.getElementById('help-btn') as HTMLButtonElement)?.click();
    else if (e.code === 'KeyF') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }
  });

  // -------------------------------------------------------------- resizing
  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    postfx.setSize(innerWidth, innerHeight);
  }
  window.addEventListener('resize', onResize);
  onResize();

  // ------------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let fpsAcc = 0;
  let fpsN = 0;
  let fpsTimer = 0;
  let runtime = 0;
  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });

  const stats: { fps: number; calls: number; tris: number; pos: number[]; water?: unknown; frames?: number } = {
    fps: 0,
    calls: 0,
    tris: 0,
    pos: [0, 0, 0],
    frames: 0,
  };
  (window as unknown as { __jiangnanStats: object }).__jiangnanStats = stats;
  (window as unknown as { __jiangnanCam: THREE.PerspectiveCamera; __jiangnanDirector: CameraDirector }).__jiangnanCam = camera;
  (window as unknown as { __jiangnanDirector: CameraDirector }).__jiangnanDirector = director;

  renderer.setAnimationLoop(() => {
    try {
      frameTick();
    } catch (err) {
      console.error('[loop]', err);
      throw err;
    }
  });

  let frameNo = 0;
  function frameTick() {
    frameNo++;
    renderer.info.reset();
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    runtime += dt;

    boats.update(t);
    people.update(t);
    props.update(t);
    nature.update(t);
    tickWillows(t);
    rain.update(t, camera);
    water.update(t, rainLevel);
    postfx.update(t);
    if (ui.splashVisible()) {
      // slow drift while the splash is up
      camera.position.y = 30 + Math.sin(t * 0.2) * 1.5;
      camera.lookAt(0, 0, 0);
    } else {
      director.update(dt, t);
      updateWaterLights();
    }

    postfx.composer.render();

    // fps
    fpsAcc += dt;
    fpsN++;
    fpsTimer += dt;
    if (fpsTimer > 0.5) {
      const fps = fpsN / fpsAcc;
      stats.fps = fps;
      stats.frames = frameNo;
      stats.calls = renderer.info.render.calls;
      stats.tris = renderer.info.render.triangles;
      stats.pos = [camera.position.x, camera.position.y, camera.position.z];
      stats.water = water.debugUniforms?.();
      ui.setFps(fps);
      fpsAcc = 0;
      fpsN = 0;
      fpsTimer = 0;
      if (!autoDowngraded && !ui.splashVisible() && runtime > 6 && quality === 'medium' && fps < 24) {
        autoDowngraded = true;
        quality = 'low';
        ui.setQuality('low');
        applyQuality('low');
        ui.toast('已自动调至「简」画质以保持流畅');
      }
    }
  }
}

boot();
