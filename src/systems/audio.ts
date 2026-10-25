// Fully synthesised ambience (no audio files): filtered noise for rain on
// roofs and water, a slow swell for wind. Starts after the first user gesture.
export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private patterGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private muted = false;
  private rainLevel = 0.7;

  get started() {
    return this.ctx !== null;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    try {
      this.startAudio();
    } catch {
      this.ctx = null;
    }
  }

  private startAudio() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    master.connect(ctx.destination);
    this.master = master;

    const noise = (seconds: number) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02; // cheap pink-ish tilt
        d[i] = last * 3.2 + w * 0.25;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start();
      return src;
    };

    // steady rain wash
    const rainSrc = noise(3);
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = 'lowpass';
    rainLp.frequency.value = 3200;
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = 'highpass';
    rainHp.frequency.value = 350;
    const rainG = ctx.createGain();
    rainG.gain.value = 0.16 * this.rainLevel;
    rainSrc.connect(rainHp).connect(rainLp).connect(rainG).connect(master);
    this.rainGain = rainG;

    // patter on leaves and tiles
    const patSrc = noise(2);
    const patBp = ctx.createBiquadFilter();
    patBp.type = 'bandpass';
    patBp.frequency.value = 2400;
    patBp.Q.value = 0.6;
    const patG = ctx.createGain();
    patG.gain.value = 0.045 * this.rainLevel;
    patSrc.connect(patBp).connect(patG).connect(master);
    this.patterGain = patG;

    // canal lapping
    const watSrc = noise(4);
    const watLp = ctx.createBiquadFilter();
    watLp.type = 'lowpass';
    watLp.frequency.value = 240;
    const watG = ctx.createGain();
    watG.gain.value = 0.05;
    watSrc.connect(watLp).connect(watG).connect(master);
    this.waterGain = watG;

    // wind through the eaves
    const windSrc = noise(5);
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 520;
    const windG = ctx.createGain();
    windG.gain.value = 0.02;
    windSrc.connect(windLp).connect(windG).connect(master);
    this.windGain = windG;

    // slow swells
    const swell = (g: GainNode | null, base: number, rate: number, depth: number) => {
      if (!g) return;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = base * depth;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
    };
    swell(this.waterGain, 0.05, 0.13, 0.6);
    swell(this.windGain, 0.02, 0.07, 0.8);
    swell(this.rainGain, 0.16 * this.rainLevel, 0.05, 0.25);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15);
    }
  }

  get isMuted() {
    return this.muted;
  }

  setRain(level: number) {
    this.rainLevel = level;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.rainGain?.gain.setTargetAtTime(0.16 * level, t, 0.4);
      this.patterGain?.gain.setTargetAtTime(0.045 * level, t, 0.4);
    }
  }
}
