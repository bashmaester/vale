// Procedural Audio Engine
// WebAudio-based generative sound that connects to visual state
// All sounds are synthesized - no samples

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.nodes = new Map();
    this.enabled = false;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('WebAudio not available:', e);
    }
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.5 : 0, this.ctx.currentTime, 0.3);
    }
    return this.enabled;
  }

  // Create ambient pad (drones, atmosphere)
  createAmbient(params = {}) {
    const freq = params.frequency || 110;
    const type = params.type || 'sine';
    const detune = params.detune || 5;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();

    osc1.type = type;
    osc2.type = 'triangle';
    osc3.type = 'sine';

    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.5;
    osc3.frequency.value = freq * 0.5;

    osc2.detune.value = detune;
    osc3.detune.value = -detune;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = params.cutoff || 800;
    filter.Q.value = 2;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    osc1.start();
    osc2.start();
    osc3.start();

    // Slow modulation
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = freq * 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfo.start();

    const node = { osc1, osc2, osc3, lfo, filter, gain };
    this.nodes.set('ambient', node);
    return node;
  }

  // Rain noise
  createRain(intensity = 0.5) {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
        b6 = white * 0.115926;
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();

    const node = { source, filter, gain };
    this.nodes.set('rain', node);
    return node;
  }

  // Train rumble
  createTrainRumble() {
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      // Low rumble with rhythmic clatter
      const rumble = Math.sin(t * 30) * 0.3 + Math.sin(t * 45.7) * 0.2;
      const clatter = (Math.random() * 2 - 1) * 0.1 * (0.5 + 0.5 * Math.sin(t * 12));
      data[i] = (rumble + clatter) * 0.15;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();

    const node = { source, filter, gain };
    this.nodes.set('train', node);
    return node;
  }

  // Footstep sounds (rhythmic)
  createFootsteps(rate = 2) {
    const nextTime = this.ctx.currentTime;
    const interval = 1 / rate;

    const step = (time) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80 + Math.random() * 40, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(time);
      osc.stop(time + 0.15);
    };

    let timer = null;
    const start = () => {
      timer = setInterval(() => {
        if (this.ctx) step(this.ctx.currentTime);
      }, interval * 1000);
    };
    const stop = () => { if (timer) clearInterval(timer); };

    const node = { start, stop };
    this.nodes.set('footsteps', node);
    return node;
  }

  // Wind howl
  createWind() {
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 5;

    // LFO on filter for howling effect
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.3;
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();

    const node = { source, filter, gain, lfo };
    this.nodes.set('wind', node);
    return node;
  }

  // Update audio parameters based on scene state
  updateFromState(state) {
    if (!this.enabled) return;

    // Train proximity
    if (state.trainProximity !== undefined && this.nodes.has('train')) {
      const n = this.nodes.get('train');
      n.gain.gain.setTargetAtTime(state.trainProximity * 0.3, this.ctx.currentTime, 0.1);
    }

    // Rain intensity
    if (state.rainIntensity !== undefined && this.nodes.has('rain')) {
      const n = this.nodes.get('rain');
      n.gain.gain.setTargetAtTime(state.rainIntensity * 0.2, this.ctx.currentTime, 0.5);
    }

    // Ambient level
    if (state.ambientLevel !== undefined && this.nodes.has('ambient')) {
      const n = this.nodes.get('ambient');
      n.gain.gain.setTargetAtTime(state.ambientLevel * 0.15, this.ctx.currentTime, 1.0);
    }

    // Wind
    if (state.windLevel !== undefined && this.nodes.has('wind')) {
      const n = this.nodes.get('wind');
      n.gain.gain.setTargetAtTime(state.windLevel * 0.1, this.ctx.currentTime, 0.5);
    }
  }

  // Stop all sounds
  stopAll() {
    for (const [key, node] of this.nodes) {
      if (node.gain) {
        node.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      if (node.stop) node.stop();
    }
  }
}

export default AudioEngine;
