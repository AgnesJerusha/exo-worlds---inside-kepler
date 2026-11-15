/**
 * Web Audio Procedural Sound Effects Engine — EXO WORLDS
 * Pure Web Audio API: no audio files, no external APIs.
 *
 * Requirements:
 * - One constant SFX_VOLUME at the top of the file to turn effects up or down.
 * - Master gain keeping peaks quiet (about 0.3 to 0.35 of full volume).
 * - Ducking to about 40% while narrator is speaking.
 * - Hyperspace warp: rising whoosh (white noise BP 200 Hz -> 4 kHz),
 *   sawtooth rising (60 Hz -> 400 Hz w/ slight vibrato), deep sub rumble,
 *   fast attack, peak near end of warp, ~0.5s fade as next scene lands, subtle stereo movement.
 * - Rocket launch: short ignition crackle (~0.6s high-passed noise burst),
 *   then roar over ~3s (brown noise LP 150 Hz -> 900 Hz with rising gain),
 *   low rumble around 40-70 Hz with slow tremolo, rising air-rush layer.
 *   Keeps going while rocket rises, cuts with 0.2s fade at hard cut to black.
 *   Syncs to visual liftoff, not slide start.
 * - Clean stop on slide change, Previous press, or audio turned OFF.
 */

export const SFX_VOLUME = 0.32; // Master SFX volume setting (peaks around 0.3 - 0.35)

let audioCtx = null;
let masterGain = null;
let duckGain = null;
let isAudioEnabled = true;

// Active SFX nodes references to allow clean stopping/fading
let activeWarp = null;
let activeRocket = null;

/**
 * Returns or initializes the shared AudioContext for SFX
 */
export function getSfxAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      _setupMasterChain();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function _setupMasterChain() {
  if (!audioCtx) return;
  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(isAudioEnabled ? SFX_VOLUME : 0, audioCtx.currentTime);

  duckGain = audioCtx.createGain();
  duckGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

  duckGain.connect(masterGain);
  masterGain.connect(audioCtx.destination);
}

/**
 * Set master audio enabled state (controlled by Narrator Audio button)
 */
export function setSfxEnabled(enabled) {
  isAudioEnabled = !!enabled;
  if (!isAudioEnabled) {
    stopAllSfx(true); // immediate stop
  }
  if (audioCtx && masterGain) {
    const t = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(isAudioEnabled ? SFX_VOLUME : 0, t + 0.05);
  }
}

/**
 * Duck the sound effects to ~40% while the narrator is speaking
 */
export function setNarratorSpeaking(isSpeaking) {
  if (!audioCtx || !duckGain) return;
  const t = audioCtx.currentTime;
  duckGain.gain.cancelScheduledValues(t);
  duckGain.gain.setValueAtTime(duckGain.gain.value, t);
  const target = isSpeaking ? 0.4 : 1.0;
  duckGain.gain.linearRampToValueAtTime(target, t + 0.15);
}

/**
 * Helper to build noise buffers (white, pink, brown)
 */
function createNoiseBuffer(ctx, type = 'white', seconds = 4) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else if (type === 'brown') {
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Compensate for brown noise attenuation
    }
  }
  return buffer;
}

/**
 * a) Hyperspace Warp Sound Effect
 * @param {number} durationMs - total warp duration in ms (matching visual warp animation, e.g. 1900ms)
 */
export function playHyperspaceWarp(durationMs = 1900) {
  if (!isAudioEnabled) return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;

  stopHyperspaceWarp(0.05);

  const dur = durationMs / 1000;
  const now = ctx.currentTime;
  const warpNodes = [];

  // Local output bus connecting into duckGain
  const warpOut = ctx.createGain();
  warpOut.gain.setValueAtTime(1.0, now);
  warpOut.connect(duckGain);

  // Stereo Panner (or ChannelMerger fallback)
  let panner = null;
  if (ctx.createStereoPanner) {
    panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(-0.4, now);
    panner.pan.linearRampToValueAtTime(0.4, now + dur * 0.85);
    panner.pan.linearRampToValueAtTime(0, now + dur);
    panner.connect(warpOut);
  } else {
    panner = warpOut;
  }

  // 1. White noise through band-pass sweeping from 200 Hz to 4 kHz
  const noiseBuf = createNoiseBuffer(ctx, 'white', dur + 0.8);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuf;

  const bpFilter = ctx.createBiquadFilter();
  bpFilter.type = 'bandpass';
  bpFilter.Q.value = 2.5;
  bpFilter.frequency.setValueAtTime(200, now);
  bpFilter.frequency.exponentialRampToValueAtTime(4000, now + dur * 0.9);
  bpFilter.frequency.linearRampToValueAtTime(2500, now + dur + 0.5);

  const noiseGain = ctx.createGain();
  // Fast attack, peak near end of warp, ~0.5s fade
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.7, now + 0.08); // fast attack
  noiseGain.gain.linearRampToValueAtTime(0.95, now + dur * 0.85); // peak near end
  noiseGain.gain.linearRampToValueAtTime(0.0001, now + dur + 0.5); // fade ~0.5s

  noiseSource.connect(bpFilter);
  bpFilter.connect(noiseGain);
  noiseGain.connect(panner);
  noiseSource.start(now);
  noiseSource.stop(now + dur + 0.6);
  warpNodes.push(noiseSource);

  // 2. Sawtooth tone rising from 60 Hz to 400 Hz with slight vibrato
  const sawOsc = ctx.createOscillator();
  sawOsc.type = 'sawtooth';
  sawOsc.frequency.setValueAtTime(60, now);
  sawOsc.frequency.exponentialRampToValueAtTime(400, now + dur * 0.9);
  sawOsc.frequency.linearRampToValueAtTime(200, now + dur + 0.5);

  // Vibrato LFO: ~6 Hz vibrato with depth ramping up
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(6, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(2, now);
  lfoGain.gain.linearRampToValueAtTime(14, now + dur * 0.9);
  lfo.connect(lfoGain);
  lfoGain.connect(sawOsc.frequency);
  lfo.start(now);
  lfo.stop(now + dur + 0.6);
  warpNodes.push(lfo);

  // Saw low-pass filter to smooth harsh highs
  const sawLp = ctx.createBiquadFilter();
  sawLp.type = 'lowpass';
  sawLp.frequency.setValueAtTime(450, now);
  sawLp.frequency.exponentialRampToValueAtTime(1800, now + dur * 0.85);

  const sawGain = ctx.createGain();
  sawGain.gain.setValueAtTime(0.001, now);
  sawGain.gain.exponentialRampToValueAtTime(0.35, now + 0.1);
  sawGain.gain.linearRampToValueAtTime(0.5, now + dur * 0.85);
  sawGain.gain.linearRampToValueAtTime(0.0001, now + dur + 0.5);

  sawOsc.connect(sawLp);
  sawLp.connect(sawGain);
  sawGain.connect(panner);
  sawOsc.start(now);
  sawOsc.stop(now + dur + 0.6);
  warpNodes.push(sawOsc);

  // 3. Deep sub rumble underneath (35 - 55 Hz sine/triangle)
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(40, now);
  subOsc.frequency.linearRampToValueAtTime(55, now + dur * 0.8);
  subOsc.frequency.linearRampToValueAtTime(32, now + dur + 0.5);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.001, now);
  subGain.gain.linearRampToValueAtTime(0.55, now + 0.12);
  subGain.gain.linearRampToValueAtTime(0.7, now + dur * 0.8);
  subGain.gain.linearRampToValueAtTime(0.0001, now + dur + 0.5);

  subOsc.connect(subGain);
  subGain.connect(warpOut);
  subOsc.start(now);
  subOsc.stop(now + dur + 0.6);
  warpNodes.push(subOsc);

  activeWarp = {
    gainNode: warpOut,
    nodes: warpNodes,
    stopTimer: setTimeout(() => {
      activeWarp = null;
    }, (dur + 0.6) * 1000)
  };
}

export function stopHyperspaceWarp(fadeSec = 0.3) {
  if (!activeWarp) return;
  if (activeWarp.stopTimer) clearTimeout(activeWarp.stopTimer);
  if (audioCtx && activeWarp.gainNode) {
    const t = audioCtx.currentTime;
    activeWarp.gainNode.gain.cancelScheduledValues(t);
    activeWarp.gainNode.gain.setValueAtTime(activeWarp.gainNode.gain.value, t);
    activeWarp.gainNode.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
    const nodes = activeWarp.nodes;
    setTimeout(() => {
      nodes.forEach(n => {
        try { n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      });
    }, fadeSec * 1000 + 50);
  }
  activeWarp = null;
}

/**
 * b) Rocket Launch Sound Effect
 * - Ignition crackle: burst of high-passed noise (~0.6s)
 * - Roar: grows over ~3s (brown noise LP 150 Hz -> 900 Hz with rising gain)
 * - Low rumble around 40 to 70 Hz with slow tremolo
 * - Rising air-rush layer
 * - Keeps going while rocket rises, cuts with 0.2s fade at hard cut to black
 */
export function playRocketLaunch() {
  if (!isAudioEnabled) return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;

  stopRocketLaunch(0.05);

  const now = ctx.currentTime;
  const rocketNodes = [];

  const rocketOut = ctx.createGain();
  rocketOut.gain.setValueAtTime(1.0, now);
  rocketOut.connect(duckGain);

  // 1. Ignition crackle: burst of high-passed noise, about 0.6 s
  const crackleBuf = createNoiseBuffer(ctx, 'white', 1.0);
  const crackleSource = ctx.createBufferSource();
  crackleSource.buffer = crackleBuf;

  const crackleHp = ctx.createBiquadFilter();
  crackleHp.type = 'highpass';
  crackleHp.frequency.setValueAtTime(1800, now);

  const crackleGain = ctx.createGain();
  crackleGain.gain.setValueAtTime(0.001, now);
  crackleGain.gain.linearRampToValueAtTime(0.55, now + 0.05);
  crackleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

  crackleSource.connect(crackleHp);
  crackleHp.connect(crackleGain);
  crackleGain.connect(rocketOut);
  crackleSource.start(now);
  crackleSource.stop(now + 0.65);
  rocketNodes.push(crackleSource);

  // 2. Roar that grows over ~3 seconds (brown noise through low-pass sweeping 150 Hz -> 900 Hz with rising gain)
  // Continuous buffer looped or long enough (e.g. 15s)
  const brownBuf = createNoiseBuffer(ctx, 'brown', 16.0);
  const roarSource = ctx.createBufferSource();
  roarSource.buffer = brownBuf;
  roarSource.loop = true;

  const roarLp = ctx.createBiquadFilter();
  roarLp.type = 'lowpass';
  roarLp.frequency.setValueAtTime(150, now);
  roarLp.frequency.exponentialRampToValueAtTime(900, now + 3.2);

  const roarGain = ctx.createGain();
  roarGain.gain.setValueAtTime(0.05, now);
  roarGain.gain.linearRampToValueAtTime(0.75, now + 3.0);

  roarSource.connect(roarLp);
  roarLp.connect(roarGain);
  roarGain.connect(rocketOut);
  roarSource.start(now + 0.1);
  rocketNodes.push(roarSource);

  // 3. Low rumble around 40 to 70 Hz with slow tremolo
  const rumbleOsc = ctx.createOscillator();
  rumbleOsc.type = 'sawtooth';
  rumbleOsc.frequency.setValueAtTime(45, now);
  rumbleOsc.frequency.linearRampToValueAtTime(65, now + 3.5);

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(110, now);

  // Slow tremolo: ~4-5 Hz amplitude modulation
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.frequency.setValueAtTime(4.5, now);

  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.setValueAtTime(0.18, now);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.2, now);
  rumbleGain.gain.linearRampToValueAtTime(0.65, now + 3.0);

  tremoloLfo.connect(tremoloDepth);
  tremoloDepth.connect(rumbleGain.gain);

  rumbleOsc.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(rocketOut);

  rumbleOsc.start(now);
  tremoloLfo.start(now);
  rocketNodes.push(rumbleOsc, tremoloLfo);

  // 4. Rising air-rush layer (bandpass filtered white noise rising in frequency and volume)
  const airBuf = createNoiseBuffer(ctx, 'white', 16.0);
  const airSource = ctx.createBufferSource();
  airSource.buffer = airBuf;
  airSource.loop = true;

  const airBp = ctx.createBiquadFilter();
  airBp.type = 'bandpass';
  airBp.Q.value = 1.8;
  airBp.frequency.setValueAtTime(300, now);
  airBp.frequency.exponentialRampToValueAtTime(1400, now + 4.5);

  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0.001, now);
  airGain.gain.linearRampToValueAtTime(0.35, now + 3.5);

  airSource.connect(airBp);
  airBp.connect(airGain);
  airGain.connect(rocketOut);
  airSource.start(now + 0.3);
  rocketNodes.push(airSource);

  activeRocket = {
    gainNode: rocketOut,
    nodes: rocketNodes
  };
}

/**
 * Cuts rocket sound with 0.2 second fade (e.g. at the hard cut to black or slide exit)
 */
export function stopRocketLaunch(fadeSec = 0.2) {
  if (!activeRocket) return;
  if (audioCtx && activeRocket.gainNode) {
    const t = audioCtx.currentTime;
    activeRocket.gainNode.gain.cancelScheduledValues(t);
    activeRocket.gainNode.gain.setValueAtTime(activeRocket.gainNode.gain.value, t);
    activeRocket.gainNode.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
    const nodes = activeRocket.nodes;
    setTimeout(() => {
      nodes.forEach(n => {
        try { n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      });
    }, fadeSec * 1000 + 50);
  }
  activeRocket = null;
}

/**
 * Stop all active procedural sound effects
 */
export function stopAllSfx(immediate = false) {
  const fade = immediate ? 0.02 : 0.2;
  stopHyperspaceWarp(fade);
  stopRocketLaunch(fade);
}
