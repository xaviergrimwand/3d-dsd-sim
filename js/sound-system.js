(function (global) {
  'use strict';

  /**
   * SoundSystem - Cohesive procedural Web Audio engine ("1996 Analog Dock & Hardware").
   * Routes all channels through category buses (SFX, UI, Ambience) into a DynamicsCompressor
   * and Master Gain, using shared filtered white/pink noise buffers and damped oscillators.
   */
  const AUDIO_STORAGE_KEY = 'dsd_sim_audio_v1';

  const SoundSystem = (function () {
    let audioCtx = null;
    let masterGain = null;
    let compressor = null;
    let sfxBus = null;
    let uiBus = null;
    let ambienceBus = null;

    let whiteNoiseBuf = null;
    let pinkNoiseBuf = null;
    let footstepDockBuf = null;
    let footstepTrailerBuf = null;

    let activeMotorNodes = [];
    let lastErrorBuzzMs = 0;
    let lastPalletBumpMs = 0;
    let lastJackHornMs = 0;

    // Continuous world audio nodes (started lazily on first active movement/cold-zone update)
    let jackLoopState = null;     // { osc, sub, filter, gain, active, lastPitch, lastModMs }
    let ambienceLoopState = null; // { src, osc, filter, gain, active, lastZone, lastModMs }
    let stepAccum = 0;
    let stepParity = 0;
    let lastResumeTryMs = 0;
    let noisePrngState = 0x9e3779b9;

    const settings = {
      muted: false,
      masterVolume: 0.85,
      sfxVolume: 1.0,
      uiVolume: 0.9,
      ambienceVolume: 0.55
    };

    function loadSettings() {
      try {
        if (!global.localStorage) return;
        const raw = global.localStorage.getItem(AUDIO_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        if (typeof parsed.muted === 'boolean') settings.muted = parsed.muted;
        if (Number.isFinite(Number(parsed.masterVolume))) {
          settings.masterVolume = Math.max(0, Math.min(1, Number(parsed.masterVolume)));
        }
        if (Number.isFinite(Number(parsed.sfxVolume))) {
          settings.sfxVolume = Math.max(0, Math.min(1, Number(parsed.sfxVolume)));
        }
        if (Number.isFinite(Number(parsed.uiVolume))) {
          settings.uiVolume = Math.max(0, Math.min(1, Number(parsed.uiVolume)));
        }
        if (Number.isFinite(Number(parsed.ambienceVolume))) {
          settings.ambienceVolume = Math.max(0, Math.min(1, Number(parsed.ambienceVolume)));
        }
      } catch (_) { }
    }

    function saveSettings() {
      try {
        if (!global.localStorage) return;
        global.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
      } catch (_) { }
    }

    loadSettings();

    function applyMixGains() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      if (masterGain && masterGain.gain) {
        masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, now, 0.02);
      }
      if (sfxBus && sfxBus.gain) {
        sfxBus.gain.setTargetAtTime(settings.sfxVolume, now, 0.02);
      }
      if (uiBus && uiBus.gain) {
        uiBus.gain.setTargetAtTime(settings.uiVolume, now, 0.02);
      }
      if (ambienceBus && ambienceBus.gain) {
        ambienceBus.gain.setTargetAtTime(settings.ambienceVolume, now, 0.04);
      }
    }

    function fastRand() {
      noisePrngState ^= noisePrngState << 13;
      noisePrngState ^= noisePrngState >>> 17;
      noisePrngState ^= noisePrngState << 5;
      return ((noisePrngState >>> 0) / 2147483648) - 1;
    }

    function ensureNoiseBuffers(ctx) {
      if (whiteNoiseBuf && pinkNoiseBuf) return;
      try {
        const sr = ctx.sampleRate || 44100;
        const len = Math.floor(sr * 0.55);
        whiteNoiseBuf = ctx.createBuffer(1, len, sr);
        const w = whiteNoiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          w[i] = fastRand();
        }

        pinkNoiseBuf = ctx.createBuffer(1, len, sr);
        const p = pinkNoiseBuf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
          const white = w[i];
          b0 = 0.997 * b0 + white * 0.099;
          b1 = 0.985 * b1 + white * 0.132;
          b2 = 0.950 * b2 + white * 0.210;
          p[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.45) * 0.18));
        }

        // Pre-baked 68ms boot-step buffers (concrete dock & hollow steel/wood trailer floor)
        // Eliminates per-step Oscillator + BiquadFilter allocations during walking.
        const stepLen = Math.max(256, Math.floor(sr * 0.068));
        const bakeStep = (startHz, gritAmp) => {
          const buf = ctx.createBuffer(1, stepLen, sr);
          const ch = buf.getChannelData(0);
          let phase = 0;
          let lp = 0;
          for (let i = 0; i < stepLen; i++) {
            const u = i / stepLen;
            const env = Math.exp(-u * 6.5) * Math.min(1, i / (sr * 0.004));
            const freq = 36 + (startHz - 36) * Math.exp(-u * 5.0);
            phase += (2 * Math.PI * freq) / sr;
            const thud = Math.sin(phase) * 0.65;
            lp = lp * 0.72 + (p[i % len] || 0) * 0.28;
            ch[i] = Math.max(-1, Math.min(1, (thud + lp * gritAmp) * env));
          }
          return buf;
        };
        footstepDockBuf = bakeStep(96, 1.15);
        footstepTrailerBuf = bakeStep(128, 1.55);
      } catch (_) { }
    }

    function getAudioContext(skipResume) {
      if (!audioCtx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try {
          audioCtx = new AC();
          masterGain = audioCtx.createGain();
          sfxBus = audioCtx.createGain();
          uiBus = audioCtx.createGain();
          ambienceBus = audioCtx.createGain();

          sfxBus.connect(masterGain);
          uiBus.connect(masterGain);
          ambienceBus.connect(masterGain);
          masterGain.connect(audioCtx.destination);

          applyMixGains();
          ensureNoiseBuffers(audioCtx);
        } catch (_) {
          audioCtx = null;
          return null;
        }
      }
      if (!skipResume && audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        const nowMs = Date.now();
        if (nowMs - lastResumeTryMs > 400) {
          lastResumeTryMs = nowMs;
          try {
            const p = audioCtx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => { });
          } catch (_) { }
        }
      }
      return audioCtx;
    }

    function connectFilteredNoise(ctx, dest, opts) {
      if (!whiteNoiseBuf && !pinkNoiseBuf) ensureNoiseBuffers(ctx);
      const buf = (opts && opts.pink && pinkNoiseBuf) ? pinkNoiseBuf : whiteNoiseBuf;
      if (!buf || typeof ctx.createBufferSource !== 'function') return null;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = Boolean(opts && opts.loop);
      const maxOff = Math.max(0.01, (buf.duration || 0.55) - 0.12);
      const startOffset = (opts && opts.offset !== undefined) ? opts.offset : (Math.random() * maxOff);
      const gain = ctx.createGain();
      let head = src;
      if (opts && opts.filterType && typeof ctx.createBiquadFilter === 'function') {
        const filter = ctx.createBiquadFilter();
        filter.type = opts.filterType;
        filter.frequency.setValueAtTime(opts.freq || 1200, opts.startTime || ctx.currentTime);
        if (opts.q) filter.Q.setValueAtTime(opts.q, opts.startTime || ctx.currentTime);
        src.connect(filter);
        head = filter;
        return { src, gain, filter, connectOut: () => { head.connect(gain); gain.connect(dest); }, offset: startOffset };
      }
      return { src, gain, filter: null, connectOut: () => { head.connect(gain); gain.connect(dest); }, offset: startOffset };
    }

    function stopActiveMotor() {
      if (activeMotorNodes.length > 0) {
        const ctx = getAudioContext();
        const stopTime = ctx ? ctx.currentTime + 0.04 : 0;
        activeMotorNodes.forEach((item) => {
          try {
            if (item.gainNode && ctx) {
              item.gainNode.gain.cancelScheduledValues(ctx.currentTime);
              item.gainNode.gain.setValueAtTime(Math.max(0.001, item.gainNode.gain.value), ctx.currentTime);
              item.gainNode.gain.linearRampToValueAtTime(0.001, stopTime);
            }
            if (item.source) {
              item.source.stop(stopTime);
            }
          } catch (_) { }
        });
        activeMotorNodes = [];
      }
    }

    function playThud(ctx, dest, opts) {
      const t = (opts && opts.at) || ctx.currentTime;
      const dur = (opts && opts.dur) || 0.14;
      const startHz = (opts && opts.startHz) || 140;
      const endHz = (opts && opts.endHz) || 44;
      const amp = (opts && opts.amp) || 0.26;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = (opts && opts.type) || 'sine';
      osc.frequency.setValueAtTime(startHz, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), t + dur);
      gain.gain.setValueAtTime(Math.max(0.001, amp), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.01);

      if (opts && opts.noiseAmp > 0) {
        const nz = connectFilteredNoise(ctx, dest, {
          pink: true,
          filterType: 'lowpass',
          freq: opts.noiseFreq || 680,
          startTime: t
        });
        if (nz) {
          nz.connectOut();
          const ndur = Math.min(dur, opts.noiseDur || 0.08);
          nz.gain.gain.setValueAtTime(opts.noiseAmp, t);
          nz.gain.gain.exponentialRampToValueAtTime(0.001, t + ndur);
          nz.src.start(t, nz.offset, ndur + 0.02);
        }
      }
    }

    return {
      getSettings: function () {
        return Object.assign({}, settings);
      },

      setSettings: function (patch) {
        if (!patch || typeof patch !== 'object') return this.getSettings();
        if (typeof patch.muted === 'boolean') settings.muted = patch.muted;
        if (patch.masterVolume !== undefined && Number.isFinite(Number(patch.masterVolume))) {
          settings.masterVolume = Math.max(0, Math.min(1, Number(patch.masterVolume)));
        }
        if (patch.sfxVolume !== undefined && Number.isFinite(Number(patch.sfxVolume))) {
          settings.sfxVolume = Math.max(0, Math.min(1, Number(patch.sfxVolume)));
        }
        if (patch.uiVolume !== undefined && Number.isFinite(Number(patch.uiVolume))) {
          settings.uiVolume = Math.max(0, Math.min(1, Number(patch.uiVolume)));
        }
        if (patch.ambienceVolume !== undefined && Number.isFinite(Number(patch.ambienceVolume))) {
          settings.ambienceVolume = Math.max(0, Math.min(1, Number(patch.ambienceVolume)));
        }
        applyMixGains();
        saveSettings();
        return this.getSettings();
      },

      toggleMute: function () {
        settings.muted = !settings.muted;
        applyMixGains();
        saveSettings();
        return settings.muted;
      },

      isMuted: function () {
        return Boolean(settings.muted);
      },

      // Crisp 1990s Zebra/Symbol barcode laser chirp
      playScanBeep: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const over = ctx.createOscillator();
        const overGain = ctx.createGain();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1840, t);
        osc.frequency.setValueAtTime(2460, t + 0.048);

        over.type = 'triangle';
        over.frequency.setValueAtTime(3680, t);
        over.frequency.setValueAtTime(4920, t + 0.048);
        overGain.gain.setValueAtTime(0.035, t);
        over.connect(overGain);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.006);
        gain.gain.setValueAtTime(0.16, t + 0.052);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.125);

        osc.connect(gain);
        overGain.connect(gain);
        gain.connect(uiBus || ctx.destination);
        osc.start(t);
        over.start(t);
        osc.stop(t + 0.13);
        over.stop(t + 0.13);
      },

      // Clean tactile UI / keyboard membrane tick (replaces harsh 800Hz square wave)
      playButtonClick: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = uiBus || ctx.destination;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(540, t);
        osc.frequency.exponentialRampToValueAtTime(190, t + 0.028);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.034);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.036);

        const nz = connectFilteredNoise(ctx, dest, {
          filterType: 'bandpass',
          freq: 2600,
          q: 1.8,
          startTime: t
        });
        if (nz) {
          nz.connectOut();
          nz.gain.gain.setValueAtTime(0.055, t);
          nz.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
          nz.src.start(t, nz.offset, 0.025);
        }
      },

      // Distinct hardware keypad clicks for 1990s DSD-9300 Scanner vs Amber CRT Terminal
      playKeypadBeep: function (variant) {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = uiBus || ctx.destination;
        const isTerminal = variant === 'terminal';

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isTerminal ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(isTerminal ? 760 : 1480, t);
        osc.frequency.exponentialRampToValueAtTime(isTerminal ? 280 : 1180, t + 0.026);
        gain.gain.setValueAtTime(isTerminal ? 0.12 : 0.11, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.032);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.035);

        const nz = connectFilteredNoise(ctx, dest, {
          filterType: 'bandpass',
          freq: isTerminal ? 2100 : 3200,
          q: 2.0,
          startTime: t
        });
        if (nz) {
          nz.connectOut();
          nz.gain.gain.setValueAtTime(isTerminal ? 0.09 : 0.04, t);
          nz.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.016);
          nz.src.start(t, nz.offset, 0.022);
        }
      },

      // Heavy NEMA 4X industrial wall pushbutton microswitch clack (Dock / Side doors)
      playWallSwitch: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        playThud(ctx, dest, { at: t, dur: 0.06, startHz: 250, endHz: 68, amp: 0.28, type: 'triangle', noiseAmp: 0.18, noiseFreq: 1650, noiseDur: 0.032 });

        // Crisp internal spring snap 35ms after press
        const snap = ctx.createOscillator();
        const sg = ctx.createGain();
        snap.type = 'sine';
        snap.frequency.setValueAtTime(1120, t + 0.032);
        snap.frequency.exponentialRampToValueAtTime(520, t + 0.058);
        sg.gain.setValueAtTime(0.09, t + 0.032);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        snap.connect(sg);
        sg.connect(dest);
        snap.start(t + 0.032);
        snap.stop(t + 0.064);
      },

      // Vinyl strip curtain / freezer impact door push-through
      playDoorSwing: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        playThud(ctx, dest, { at: t, dur: 0.26, startHz: 132, endHz: 42, amp: 0.22, type: 'triangle', noiseAmp: 0.12, noiseFreq: 520, noiseDur: 0.12 });

        const nz = connectFilteredNoise(ctx, dest, {
          pink: true,
          filterType: 'bandpass',
          freq: 920,
          q: 1.2,
          startTime: t
        });
        if (nz) {
          nz.connectOut();
          nz.gain.gain.setValueAtTime(0.001, t);
          nz.gain.gain.linearRampToValueAtTime(0.14, t + 0.04);
          nz.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          nz.src.start(t, nz.offset, 0.30);
        }
      },

      // Overhead roll-up chain hoist motor (warm filtered motor + slat rattle + end-stop clunk)
      playDoorMotor: function (duration) {
        const ctx = getAudioContext();
        if (!ctx) return;
        stopActiveMotor();

        const dur = (typeof duration === 'number' && duration > 0.1) ? duration : 1.8;
        const now = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        const motorFilter = (typeof ctx.createBiquadFilter === 'function') ? ctx.createBiquadFilter() : null;
        if (motorFilter) {
          motorFilter.type = 'lowpass';
          motorFilter.frequency.setValueAtTime(560, now);
          motorFilter.Q.setValueAtTime(0.9, now);
        }

        const masterMotorGain = ctx.createGain();
        masterMotorGain.gain.setValueAtTime(0.001, now);
        masterMotorGain.gain.linearRampToValueAtTime(0.20, now + Math.min(0.12, dur * 0.12));
        masterMotorGain.gain.setValueAtTime(0.20, now + Math.max(0.12, dur - 0.16));
        masterMotorGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        if (motorFilter) {
          motorFilter.connect(masterMotorGain);
        }
        masterMotorGain.connect(dest);
        const motorIn = motorFilter || masterMotorGain;

        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(66, now);
        osc1.frequency.linearRampToValueAtTime(76, now + Math.min(0.45, dur * 0.3));
        osc1.frequency.linearRampToValueAtTime(74, now + Math.max(0.1, dur - 0.22));
        osc1.frequency.linearRampToValueAtTime(48, now + dur);

        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(132, now);
        osc2.frequency.linearRampToValueAtTime(152, now + Math.min(0.45, dur * 0.3));
        osc2.frequency.linearRampToValueAtTime(148, now + Math.max(0.1, dur - 0.22));
        osc2.frequency.linearRampToValueAtTime(92, now + dur);

        const osc3 = ctx.createOscillator();
        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(215, now);
        osc3.frequency.linearRampToValueAtTime(240, now + Math.min(0.5, dur * 0.35));
        osc3.frequency.linearRampToValueAtTime(175, now + dur);

        const g3 = ctx.createGain();
        g3.gain.setValueAtTime(0.08, now);
        osc3.connect(g3);
        osc1.connect(motorIn);
        osc2.connect(motorIn);
        g3.connect(motorIn);

        const nodes = [
          { source: osc1, gainNode: masterMotorGain },
          { source: osc2, gainNode: masterMotorGain },
          { source: osc3, gainNode: g3 }
        ];

        // Subtle chain-slat mechanical friction layer
        const nz = connectFilteredNoise(ctx, motorIn, {
          pink: true,
          loop: true,
          filterType: 'bandpass',
          freq: 420,
          q: 1.5,
          startTime: now
        });
        if (nz) {
          nz.connectOut();
          nz.gain.gain.setValueAtTime(0.08, now);
          nz.src.start(now, nz.offset, dur);
          nodes.push({ source: nz.src, gainNode: nz.gain });
        }

        osc1.start(now); osc2.start(now); osc3.start(now);
        osc1.stop(now + dur); osc2.stop(now + dur); osc3.stop(now + dur);

        // Soft mechanical seat thud at end of door travel
        if (dur >= 0.4) {
          playThud(ctx, dest, { at: now + Math.max(0.1, dur - 0.07), dur: 0.11, startHz: 110, endHz: 40, amp: 0.16, noiseAmp: 0.08, noiseFreq: 420 });
        }

        activeMotorNodes = nodes;
      },

      // Dock / Side door security warning klaxon
      playDoorWarningAlarm: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        [0, 0.20].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filt = (typeof ctx.createBiquadFilter === 'function') ? ctx.createBiquadFilter() : null;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(740, t + delay);
          osc.frequency.setValueAtTime(590, t + delay + 0.06);
          if (filt) {
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(1400, t + delay);
            osc.connect(filt);
            filt.connect(gain);
          } else {
            osc.connect(gain);
          }
          gain.gain.setValueAtTime(0.14, t + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.14);
          gain.connect(dest);
          osc.start(t + delay);
          osc.stop(t + delay + 0.15);
        });
      },

      // Steel fork engagement & pallet hitch clank
      playHitchSound: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        playThud(ctx, dest, { at: t, dur: 0.12, startHz: 170, endHz: 58, amp: 0.24, type: 'triangle', noiseAmp: 0.14, noiseFreq: 1200, noiseDur: 0.05 });

        const clink = ctx.createOscillator();
        const cg = ctx.createGain();
        clink.type = 'triangle';
        clink.frequency.setValueAtTime(520, t + 0.05);
        clink.frequency.exponentialRampToValueAtTime(340, t + 0.14);
        cg.gain.setValueAtTime(0.10, t + 0.05);
        cg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        clink.connect(cg);
        cg.connect(dest);
        clink.start(t + 0.05);
        clink.stop(t + 0.16);
      },

      // Grounded impact thud ('cardboard' | 'plastic' | 'metal' | 'heavy')
      playDropSound: function (surface) {
        const ctx = getAudioContext();
        if (!ctx) return;
        const dest = sfxBus || ctx.destination;
        const s = surface || 'cardboard';
        if (s === 'metal') {
          playThud(ctx, dest, { dur: 0.18, startHz: 210, endHz: 68, amp: 0.28, noiseAmp: 0.14, noiseFreq: 1850, noiseDur: 0.07 });
          return;
        }
        if (s === 'plastic') {
          playThud(ctx, dest, { dur: 0.16, startHz: 195, endHz: 62, amp: 0.25, noiseAmp: 0.13, noiseFreq: 1100, noiseDur: 0.06 });
          return;
        }
        playThud(ctx, dest, { dur: 0.21, startHz: 150, endHz: 42, amp: 0.34, noiseAmp: 0.16, noiseFreq: 640, noiseDur: 0.08 });
      },

      // Softened industrial error buzz with 90ms deduplication cooldown so showAlert() never double-buzzes
      playErrorBuzzer: function () {
        const nowMs = Date.now();
        if (nowMs - lastErrorBuzzMs < 90) return;
        lastErrorBuzzMs = nowMs;

        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filt = (typeof ctx.createBiquadFilter === 'function') ? ctx.createBiquadFilter() : null;

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(132, t);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(186, t);

        if (filt) {
          filt.type = 'lowpass';
          filt.frequency.setValueAtTime(640, t);
          osc1.connect(filt);
          osc2.connect(filt);
          filt.connect(gain);
        } else {
          osc1.connect(gain);
          osc2.connect(gain);
        }

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.012);
        gain.gain.setValueAtTime(0.16, t + 0.11);
        gain.gain.linearRampToValueAtTime(0.06, t + 0.14);
        gain.gain.linearRampToValueAtTime(0.16, t + 0.17);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);

        gain.connect(dest);
        osc1.start(t); osc2.start(t);
        osc1.stop(t + 0.31); osc2.stop(t + 0.31);
      },

      // Warm warehouse completion triad (C5-E5-G5)
      playSuccessChime: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + idx * 0.075);
          gain.gain.setValueAtTime(0.001, t + idx * 0.075);
          gain.gain.linearRampToValueAtTime(0.16, t + idx * 0.075 + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.075 + 0.32);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t + idx * 0.075);
          osc.stop(t + idx * 0.075 + 0.34);
        });
      },

      // Short electric jack relay hum
      playElectricHum: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filt = (typeof ctx.createBiquadFilter === 'function') ? ctx.createBiquadFilter() : null;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(84, t);
        osc.frequency.linearRampToValueAtTime(106, t + 0.09);
        if (filt) {
          filt.type = 'lowpass';
          filt.frequency.setValueAtTime(340, t);
          osc.connect(filt);
          filt.connect(gain);
        } else {
          osc.connect(gain);
        }
        gain.gain.setValueAtTime(0.055, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.16);
      },

      // Hydraulic pump lift + fork raise
      playHydraulicLift: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(255, t + 0.34);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.40);

        const nz = connectFilteredNoise(ctx, dest, {
          pink: true,
          filterType: 'bandpass',
          freq: 1400,
          q: 1.4,
          startTime: t
        });
        if (nz) {
          nz.connectOut();
          nz.gain.gain.setValueAtTime(0.05, t);
          nz.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          nz.src.start(t, nz.offset, 0.30);
        }
      },

      // Hydraulic relief bleed hiss + pallet settle thud
      playHydraulicLower: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        const nz = connectFilteredNoise(ctx, dest, {
          pink: true,
          filterType: 'bandpass',
          freq: 2100,
          q: 1.0,
          startTime: t
        });
        if (nz) {
          nz.connectOut();
          nz.gain.gain.setValueAtTime(0.10, t);
          nz.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
          nz.src.start(t, nz.offset, 0.28);
        }
        playThud(ctx, dest, { at: t + 0.16, dur: 0.15, startHz: 140, endHz: 42, amp: 0.24, noiseAmp: 0.08, noiseFreq: 550 });
      },

      // Side door vendor arrival chime (warm harmonic bell D5 -> A4)
      playSideDoorChime: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        [587.33, 440.0].forEach((freq, idx) => {
          const start = t + idx * 0.26;
          const osc = ctx.createOscillator();
          const harm = ctx.createOscillator();
          const hg = ctx.createGain();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          harm.type = 'sine';
          harm.frequency.setValueAtTime(freq * 2, start);
          hg.gain.setValueAtTime(0.045, start);
          harm.connect(hg);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.24, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.62);

          osc.connect(gain);
          hg.connect(gain);
          gain.connect(dest);
          osc.start(start); harm.start(start);
          osc.stop(start + 0.64); harm.stop(start + 0.64);
        });
      },

      // Caster / pallet wheel rumble
      playCartRumble: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        playThud(ctx, dest, { at: t, dur: 0.14, startHz: 105, endHz: 68, amp: 0.09, type: 'triangle', noiseAmp: 0.07, noiseFreq: 420, noiseDur: 0.10 });
      },

      // Realistic bandpass-filtered paper flutter (replaces synthetic sawtooth zap)
      playPaperRustle: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        const nz = connectFilteredNoise(ctx, dest, {
          pink: true,
          filterType: 'bandpass',
          freq: 2500,
          q: 1.35,
          startTime: t
        });
        if (nz) {
          nz.connectOut();
          nz.filter.frequency.linearRampToValueAtTime(3600, t + 0.15);
          nz.gain.gain.setValueAtTime(0.001, t);
          nz.gain.gain.linearRampToValueAtTime(0.22, t + 0.025);
          nz.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          nz.src.start(t, nz.offset, 0.20);
        }
      },

      // Crisp ballpoint pen stroke + invoice sign/stamp thud
      playPenSign: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        [0, 0.075].forEach((d) => {
          const nz = connectFilteredNoise(ctx, dest, {
            filterType: 'bandpass',
            freq: 3400,
            q: 2.2,
            startTime: t + d
          });
          if (nz) {
            nz.connectOut();
            nz.gain.gain.setValueAtTime(0.11, t + d);
            nz.gain.gain.exponentialRampToValueAtTime(0.001, t + d + 0.055);
            nz.src.start(t + d, nz.offset, 0.065);
          }
        });
        playThud(ctx, dest, { at: t + 0.16, dur: 0.09, startHz: 185, endHz: 55, amp: 0.22, type: 'triangle', noiseAmp: 0.10, noiseFreq: 1200, noiseDur: 0.04 });
      },

      // 1996 9-pin dot-matrix receipt printer carriage burst + perforated paper tear
      playPrinterPrint: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        for (let i = 0; i < 4; i++) {
          const st = t + i * 0.105;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filt = (typeof ctx.createBiquadFilter === 'function') ? ctx.createBiquadFilter() : null;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(410 + (i % 2) * 38, st);
          if (filt) {
            filt.type = 'bandpass';
            filt.frequency.setValueAtTime(1600, st);
            filt.Q.setValueAtTime(1.2, st);
            osc.connect(filt);
            filt.connect(gain);
          } else {
            osc.connect(gain);
          }
          gain.gain.setValueAtTime(0.07, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.072);
          gain.connect(dest);
          osc.start(st);
          osc.stop(st + 0.078);
        }

        const tear = connectFilteredNoise(ctx, dest, {
          filterType: 'highpass',
          freq: 2700,
          startTime: t + 0.43
        });
        if (tear) {
          tear.connectOut();
          tear.gain.gain.setValueAtTime(0.16, t + 0.43);
          tear.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.54);
          tear.src.start(t + 0.43, tear.offset, 0.13);
        }
      },

      // Handheld label applicator / yellow UPC sticker snap (Label Cases F6)
      playLabelApply: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        const zip = connectFilteredNoise(ctx, dest, {
          filterType: 'bandpass',
          freq: 2900,
          q: 1.6,
          startTime: t
        });
        if (zip) {
          zip.connectOut();
          zip.gain.gain.setValueAtTime(0.15, t);
          zip.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          zip.src.start(t, zip.offset, 0.09);
        }
        playThud(ctx, dest, { at: t + 0.065, dur: 0.07, startHz: 240, endHz: 85, amp: 0.18, type: 'triangle', noiseAmp: 0.12, noiseFreq: 1900, noiseDur: 0.03 });
      },

      // Semi-truck / trailer air-brake release + dock bumper thump on arrival
      playTruckDockBrake: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;

        playThud(ctx, dest, { at: t, dur: 0.28, startHz: 96, endHz: 32, amp: 0.34, noiseAmp: 0.12, noiseFreq: 380 });

        const brake = connectFilteredNoise(ctx, dest, {
          filterType: 'bandpass',
          freq: 3100,
          q: 0.9,
          startTime: t + 0.08
        });
        if (brake) {
          brake.connectOut();
          brake.filter.frequency.exponentialRampToValueAtTime(1050, t + 0.55);
          brake.gain.gain.setValueAtTime(0.001, t + 0.08);
          brake.gain.gain.linearRampToValueAtTime(0.24, t + 0.11);
          brake.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.56);
          brake.src.start(t + 0.08, brake.offset, 0.50);
        }
      },

      // Industrial battery charger connector clunk + relay hum
      playChargerPlug: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        playThud(ctx, dest, { at: t, dur: 0.10, startHz: 230, endHz: 75, amp: 0.28, type: 'triangle', noiseAmp: 0.16, noiseFreq: 1900, noiseDur: 0.04 });

        const hum = ctx.createOscillator();
        const gain = ctx.createGain();
        hum.type = 'triangle';
        hum.frequency.setValueAtTime(120, t + 0.07);
        gain.gain.setValueAtTime(0.001, t + 0.07);
        gain.gain.linearRampToValueAtTime(0.11, t + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        hum.connect(gain);
        gain.connect(dest);
        hum.start(t + 0.07);
        hum.stop(t + 0.44);
      },

      // Metal drawer slide / file cabinet latch / trash receptacle clang
      playMetalClang: function () {
        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        playThud(ctx, dest, { at: t, dur: 0.16, startHz: 280, endHz: 95, amp: 0.22, type: 'triangle', noiseAmp: 0.15, noiseFreq: 2200, noiseDur: 0.07 });
      },

      // Soft cooldown-gated bump thud when a pallet or electric jack hits an obstacle
      playPalletBump: function () {
        const nowMs = Date.now();
        if (nowMs - lastPalletBumpMs < 360) return;
        lastPalletBumpMs = nowMs;

        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        playThud(ctx, dest, { at: t, dur: 0.10, startHz: 145, endHz: 48, amp: 0.15, type: 'triangle', noiseAmp: 0.08, noiseFreq: 680, noiseDur: 0.045 });
      },

      // Polite electric walkie-jack double-beep horn when a vendor NPC waits for an obstacle/player
      playJackHorn: function () {
        const nowMs = Date.now();
        if (nowMs - lastJackHornMs < 2800) return;
        lastJackHornMs = nowMs;

        const ctx = getAudioContext();
        if (!ctx) return;
        const t = ctx.currentTime;
        const dest = sfxBus || ctx.destination;
        [0, 0.14].forEach((offset) => {
          const osc = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc2.type = 'triangle';
          osc.frequency.setValueAtTime(520, t + offset);
          osc2.frequency.setValueAtTime(655, t + offset);
          gain.gain.setValueAtTime(0.001, t + offset);
          gain.gain.linearRampToValueAtTime(0.095, t + offset + 0.012);
          gain.gain.setValueAtTime(0.09, t + offset + 0.065);
          gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.09);
          osc.connect(gain);
          osc2.connect(gain);
          gain.connect(dest);
          osc.start(t + offset);
          osc2.start(t + offset);
          osc.stop(t + offset + 0.095);
          osc2.stop(t + offset + 0.095);
        });
      },

      // Continuous motion/zone updater (footsteps, jack motor drive, cold-room evaporator fan hum)
      updateMotionAudio: function (dt, opts) {
        if (settings.muted || !audioCtx || audioCtx.state !== 'running') {
          if (jackLoopState && jackLoopState.active && audioCtx) {
            jackLoopState.active = false;
            jackLoopState.gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.04);
          }
          if (ambienceLoopState && ambienceLoopState.active && audioCtx) {
            ambienceLoopState.active = false;
            ambienceLoopState.gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.06);
          }
          return;
        }

        const o = opts || {};
        const paused = Boolean(o.paused);
        const speed = Number(o.speed) || 0;
        const moving = Boolean(!paused && o.moving && speed > 0.2);
        const hasJack = Boolean(o.hasElectricJack);
        const zone = o.zone || 'dock';
        const isCold = (zone === 'freezer' || zone === 'cooler');
        const ctx = audioCtx;
        const now = ctx.currentTime;
        const nowMs = Date.now();

        // 1. Footsteps while walking on foot (single pre-baked buffer source, zero filter/osc allocations)
        if (moving && !hasJack) {
          const stepInterval = Math.max(0.32, Math.min(0.56, 1.95 / Math.max(2.0, speed)));
          stepAccum += Math.min(0.1, dt || 0.016);
          if (stepAccum >= stepInterval) {
            stepAccum -= stepInterval;
            stepParity = 1 - stepParity;
            const buf = (zone === 'trailer' && footstepTrailerBuf) ? footstepTrailerBuf : footstepDockBuf;
            if (buf && typeof ctx.createBufferSource === 'function') {
              try {
                const src = ctx.createBufferSource();
                src.buffer = buf;
                if (src.playbackRate) src.playbackRate.value = stepParity ? 1.04 : 0.96;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.085, now);
                src.connect(g);
                g.connect(sfxBus || ctx.destination);
                src.onended = () => {
                  try { src.disconnect(); g.disconnect(); } catch (_) { }
                };
                src.start(now);
              } catch (_) { }
            }
          }
        } else {
          stepAccum = Math.min(stepAccum, 0.18);
        }

        // 2. Electric Pallet Jack drive hum (state-change & throttled param updates only)
        if (!paused && hasJack && moving) {
          if (!jackLoopState && typeof ctx.createBiquadFilter === 'function') {
            try {
              const osc = ctx.createOscillator();
              const sub = ctx.createOscillator();
              const filter = ctx.createBiquadFilter();
              const gain = ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(92, now);
              sub.type = 'triangle';
              sub.frequency.setValueAtTime(46, now);
              filter.type = 'lowpass';
              filter.frequency.setValueAtTime(320, now);
              gain.gain.setValueAtTime(0.0001, now);
              osc.connect(filter);
              sub.connect(filter);
              filter.connect(gain);
              gain.connect(sfxBus || ctx.destination);
              osc.start(now);
              sub.start(now);
              jackLoopState = { osc, sub, filter, gain, active: false, lastPitch: 92, lastModMs: 0 };
            } catch (_) { }
          }
          if (jackLoopState) {
            const haulPitch = o.hitchedPallet ? 84 : 102;
            const loadScale = Math.min(1.2, speed / 4.8);
            const targetPitch = haulPitch + loadScale * 14;
            if (!jackLoopState.active) {
              jackLoopState.active = true;
              jackLoopState.gain.gain.setTargetAtTime(0.052, now, 0.05);
            }
            if (nowMs - jackLoopState.lastModMs > 90 && Math.abs(targetPitch - jackLoopState.lastPitch) > 1.5) {
              jackLoopState.lastModMs = nowMs;
              jackLoopState.lastPitch = targetPitch;
              jackLoopState.osc.frequency.setTargetAtTime(targetPitch, now, 0.06);
              jackLoopState.sub.frequency.setTargetAtTime(targetPitch * 0.5, now, 0.06);
            }
          }
        } else if (jackLoopState && jackLoopState.active) {
          jackLoopState.active = false;
          jackLoopState.gain.gain.setTargetAtTime(0.0001, now, 0.06);
        }

        // 3. Cold-room evaporator fan hum (Freezer / Cooler presence, transitions only)
        if (!paused && isCold) {
          if (!ambienceLoopState && typeof ctx.createBiquadFilter === 'function') {
            try {
              if (!pinkNoiseBuf) ensureNoiseBuffers(ctx);
              if (pinkNoiseBuf) {
                const src = ctx.createBufferSource();
                src.buffer = pinkNoiseBuf;
                src.loop = true;
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(60, now);
                const oscGain = ctx.createGain();
                oscGain.gain.setValueAtTime(0.012, now);
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(220, now);
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.0001, now);
                src.connect(filter);
                osc.connect(oscGain);
                oscGain.connect(filter);
                filter.connect(gain);
                gain.connect(ambienceBus || ctx.destination);
                src.start(now);
                osc.start(now);
                ambienceLoopState = { src, osc, filter, gain, active: false, lastZone: '' };
              }
            } catch (_) { }
          }
          if (ambienceLoopState && (!ambienceLoopState.active || ambienceLoopState.lastZone !== zone)) {
            ambienceLoopState.active = true;
            ambienceLoopState.lastZone = zone;
            const targetFreq = (zone === 'freezer') ? 260 : 185;
            const targetGain = (zone === 'freezer') ? 0.065 : 0.042;
            ambienceLoopState.filter.frequency.setTargetAtTime(targetFreq, now, 0.2);
            ambienceLoopState.gain.gain.setTargetAtTime(targetGain, now, 0.25);
          }
        } else if (ambienceLoopState && ambienceLoopState.active) {
          ambienceLoopState.active = false;
          ambienceLoopState.lastZone = '';
          ambienceLoopState.gain.gain.setTargetAtTime(0.0001, now, 0.22);
        }
      },

      stopAmbientLoops: function () {
        stopActiveMotor();
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (jackLoopState && jackLoopState.active && jackLoopState.gain) {
          jackLoopState.active = false;
          jackLoopState.gain.gain.setTargetAtTime(0.0001, now, 0.04);
        }
        if (ambienceLoopState && ambienceLoopState.active && ambienceLoopState.gain) {
          ambienceLoopState.active = false;
          ambienceLoopState.lastZone = '';
          ambienceLoopState.gain.gain.setTargetAtTime(0.0001, now, 0.06);
        }
      }
    };
  })();

  global.SoundSystem = SoundSystem;
})(window);
