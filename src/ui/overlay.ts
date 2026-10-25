// Tasteful ink-wash HUD: vertical title with a seal, camera plaques, quality,
// rain/fog sliders, sound toggle, help card, splash gate (also unlocks audio).
import type { CamMode } from '../systems/cameras';

export interface UIHooks {
  onCamera: (m: CamMode) => void;
  onQuality: (q: 'low' | 'medium' | 'high') => void;
  onRain: (v: number) => void;
  onFog: (v: number) => void;
  onMute: (m: boolean) => void;
  onEnter: () => void;
}

export interface UIHandle {
  setMode: (m: CamMode) => void;
  setQuality: (q: 'low' | 'medium' | 'high') => void;
  setMuted: (m: boolean) => void;
  setFps: (fps: number) => void;
  toast: (msg: string) => void;
  hideSplash: () => void;
  splashVisible: () => boolean;
}

const CAM_BUTTONS: Array<{ mode: CamMode; label: string; key: string }> = [
  { mode: 'bridge', label: '桥上观澜', key: '1' },
  { mode: 'boat', label: '舟行波上', key: '2' },
  { mode: 'alley', label: '深巷灯影', key: '3' },
  { mode: 'overview', label: '凭虚远眺', key: '4' },
  { mode: 'walk', label: '漫步长街', key: '5' },
  { mode: 'orbit', label: '环游俯仰', key: '6' },
  { mode: 'fly', label: '御风而行', key: '7' },
];

export function buildUI(root: HTMLElement, hooks: UIHooks): UIHandle {
  root.innerHTML = `
    <div id="splash">
      <div class="splash-inner">
        <div class="splash-title">夜雨江南</div>
        <div class="splash-seal">水乡</div>
        <div class="splash-sub">烟 波 江 畔 · 灯 火 雨 声</div>
        <button id="enter-btn" type="button">入&nbsp;&nbsp;画</button>
        <div class="splash-note">WebGL 实时渲染 · 请佩戴耳机听雨声</div>
      </div>
    </div>
    <div id="hud">
      <div id="title-block">
        <div class="vtitle">夜雨江南</div>
        <div class="seal">雨</div>
      </div>
      <div id="fps">— FPS</div>
      <div id="cambar"></div>
      <div id="sidepanel">
        <div class="panel-row" id="quality-row">
          <span class="panel-label">画 质</span>
          <button class="qbtn" data-q="low">简</button>
          <button class="qbtn" data-q="medium">雅</button>
          <button class="qbtn" data-q="high">华</button>
        </div>
        <div class="panel-row slider-row">
          <span class="panel-label">雨势</span>
          <input id="rain-slider" type="range" min="0" max="100" value="70" />
        </div>
        <div class="panel-row slider-row">
          <span class="panel-label">雾色</span>
          <input id="fog-slider" type="range" min="0" max="100" value="45" />
        </div>
        <div class="panel-row">
          <button id="sound-btn" class="mini-btn">静音</button>
          <button id="help-btn" class="mini-btn">键法</button>
        </div>
      </div>
      <div id="help-card" class="hidden">
        <div class="help-title">键 法</div>
        <div class="help-grid">
          <span>1 – 4</span><span>四处胜景</span>
          <span>5</span><span>漫步长街（点击画面锁视角）</span>
          <span>6</span><span>环游俯仰（拖拽旋转 · 滚轮远近）</span>
          <span>7</span><span>御风而行（空格升 · C 降）</span>
          <span>W A S D</span><span>行走</span>
          <span>Shift</span><span>疾行</span>
          <span>Esc</span><span>释放鼠标</span>
          <span>M</span><span>静音 / 有声</span>
          <span>H</span><span>收起此页</span>
        </div>
      </div>
      <div id="toast"></div>
    </div>
  `;

  const qs = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const splash = qs('#splash');
  const cambar = qs('#cambar');
  const toastEl = qs('#toast');
  const fpsEl = qs('#fps');
  const helpCard = qs('#help-card');

  for (const b of CAM_BUTTONS) {
    const btn = document.createElement('button');
    btn.className = 'cam-btn';
    btn.innerHTML = `<span class="cam-key">${b.key}</span>${b.label}`;
    btn.addEventListener('click', () => hooks.onCamera(b.mode));
    btn.dataset.mode = b.mode;
    cambar.appendChild(btn);
  }

  const qBtns = Array.from(root.querySelectorAll<HTMLButtonElement>('.qbtn'));
  qBtns.forEach((b) =>
    b.addEventListener('click', () => {
      hooks.onQuality(b.dataset.q as 'low' | 'medium' | 'high');
    }),
  );

  qs('#rain-slider').addEventListener('input', (e) => hooks.onRain(Number((e.target as HTMLInputElement).value) / 100));
  qs('#fog-slider').addEventListener('input', (e) => hooks.onFog(Number((e.target as HTMLInputElement).value) / 100));
  qs('#help-btn').addEventListener('click', () => helpCard.classList.toggle('hidden'));
  qs('#enter-btn').addEventListener('click', () => hooks.onEnter());

  let toastTimer = 0;
  let muted = false;

  const handle: UIHandle = {
    setMode(m: CamMode) {
      cambar.querySelectorAll('.cam-btn').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.mode === m));
    },
    setQuality(q) {
      qBtns.forEach((b) => b.classList.toggle('active', b.dataset.q === q));
    },
    setMuted(m) {
      muted = m;
      qs('#sound-btn').textContent = m ? '有声' : '静音';
    },
    setFps(fps: number) {
      fpsEl.textContent = `${Math.round(fps)} FPS`;
      fpsEl.classList.toggle('low', fps < 30);
    },
    toast(msg: string) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
    },
    hideSplash() {
      splash.classList.add('gone');
      window.setTimeout(() => splash.remove(), 900);
    },
    splashVisible: () => !!splash.isConnected,
  };

  // mute toggle (also reachable via M)
  qs('#sound-btn').addEventListener('click', () => {
    muted = !muted;
    hooks.onMute(muted);
  });

  return handle;
}
