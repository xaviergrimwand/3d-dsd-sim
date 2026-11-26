(function (global) {
  'use strict';

  /**
   * MusicSystem - Code-driven Tone.js interactive soundtrack engine.
   * Synthesizes 3 procedural themes routed cleanly into SoundSystem's musicBus:
   *   - 'menu'    : "Aisle 4 Pop" (114 BPM warm 90s grocery store remix)
   *   - 'shift'   : "Scan & Stage" (116 BPM crisp electro-focus dock groove)
   *   - 'summary' : "After Hours Cooldown" (74 BPM lush end-of-shift wind-down)
   */

  const TRACK_CONFIGS = Object.freeze({
    menu: {
      title: 'Aisle 4 Pop',
      bpm: 114,
      loopBars: '4m',
      palette: 'acoustic_90s',
      warmCutoff: 3200,
      // Warm 90s grocery store pop: Em9 -> Cmaj7 -> Am9 -> B7sus
      chords: [
        ['0:0:0', ['E3', 'G3', 'B3', 'D4'], '4n', 0.48],
        ['0:2:2', ['E3', 'G3', 'B3', 'F#4'], '8n', 0.42],
        ['1:0:0', ['C3', 'E3', 'G3', 'B3'], '4n', 0.48],
        ['1:2:2', ['C3', 'G3', 'B3', 'D4'], '8n', 0.42],
        ['2:0:0', ['A3', 'C4', 'E4', 'G4'], '4n', 0.48],
        ['2:2:2', ['A3', 'C4', 'E4', 'B4'], '8n', 0.42],
        ['3:0:0', ['B3', 'E4', 'F#4', 'A4'], '4n', 0.48],
        ['3:2:0', ['B3', 'D#4', 'F#4', 'A4'], '8n.', 0.46]
      ],
      bass: [
        ['0:0:0', 'E2', '8n', 0.88], ['0:0:2', 'B2', '8n', 0.68], ['0:1:2', 'E2', '8n', 0.80], ['0:2:0', 'G2', '8n', 0.78], ['0:3:0', 'B2', '8n', 0.76], ['0:3:2', 'D3', '8n', 0.72],
        ['1:0:0', 'C2', '8n', 0.88], ['1:0:2', 'G2', '8n', 0.68], ['1:1:2', 'C2', '8n', 0.80], ['1:2:0', 'E2', '8n', 0.78], ['1:3:0', 'G2', '8n', 0.76], ['1:3:2', 'B2', '8n', 0.72],
        ['2:0:0', 'A1', '8n', 0.88], ['2:0:2', 'E2', '8n', 0.68], ['2:1:2', 'A1', '8n', 0.80], ['2:2:0', 'C2', '8n', 0.78], ['2:3:0', 'E2', '8n', 0.76], ['2:3:2', 'G2', '8n', 0.72],
        ['3:0:0', 'B1', '8n', 0.88], ['3:1:0', 'F#2', '8n', 0.76], ['3:2:0', 'B1', '8n', 0.88], ['3:3:0', 'D#2', '8n', 0.78]
      ],
      lead: [
        ['0:0:0', 'B4', '8n', 0.58], ['0:1:0', 'D5', '8n', 0.56], ['0:1:2', 'B4', '8n', 0.54], ['0:2:2', 'G4', '4n', 0.56],
        ['1:0:0', 'G4', '8n', 0.58], ['1:1:0', 'C5', '8n', 0.56], ['1:1:2', 'B4', '8n', 0.54], ['1:2:2', 'G4', '4n', 0.56],
        ['2:0:0', 'E4', '8n', 0.58], ['2:1:0', 'A4', '8n', 0.56], ['2:1:2', 'G4', '8n', 0.54], ['2:2:2', 'E4', '4n', 0.56],
        ['3:0:0', 'F#4', '8n', 0.56], ['3:1:0', 'A4', '8n', 0.58], ['3:2:0', 'B4', '8n', 0.60], ['3:3:0', 'G4', '8n', 0.54]
      ],
      kickBeats: [
        ['0:0:0', 0.84], ['0:2:0', 0.82], ['0:3:2', 0.64],
        ['1:0:0', 0.84], ['1:2:0', 0.82],
        ['2:0:0', 0.84], ['2:2:0', 0.82], ['2:3:2', 0.64],
        ['3:0:0', 0.84], ['3:2:0', 0.82]
      ],
      hatBeats: [
        ['0:0:2', 0.14], ['0:1:0', 0.20], ['0:1:2', 0.14], ['0:2:2', 0.14], ['0:3:0', 0.20], ['0:3:2', 0.14],
        ['1:0:2', 0.14], ['1:1:0', 0.20], ['1:1:2', 0.14], ['1:2:2', 0.14], ['1:3:0', 0.20], ['1:3:2', 0.14],
        ['2:0:2', 0.14], ['2:1:0', 0.20], ['2:1:2', 0.14], ['2:2:2', 0.14], ['2:3:0', 0.20], ['2:3:2', 0.14],
        ['3:0:2', 0.14], ['3:1:0', 0.20], ['3:1:2', 0.14], ['3:2:2', 0.14], ['3:3:0', 0.20], ['3:3:2', 0.14]
      ],
      hatVel: 0.16
    },

    shift: {
      title: 'Scan & Stage',
      bpm: 116,
      loopBars: '4m',
      // Em9 -> Cmaj7 -> Am9 -> B7sus
      chords: [
        ['0:0:0', ['E3', 'G3', 'B3', 'F#4'], '4n', 0.56],
        ['0:2:2', ['E3', 'G3', 'B3', 'D4'], '8n.', 0.50],
        ['1:0:0', ['C3', 'G3', 'B3', 'E4'], '4n', 0.56],
        ['1:2:2', ['C3', 'E3', 'G3', 'B3'], '8n.', 0.50],
        ['2:0:0', ['A3', 'C4', 'E4', 'B4'], '4n', 0.56],
        ['2:2:2', ['A3', 'C4', 'E4', 'G4'], '8n.', 0.50],
        ['3:0:0', ['B3', 'E4', 'F#4', 'A4'], '4n', 0.58],
        ['3:2:0', ['B3', 'D#4', 'F#4', 'A4'], '4n', 0.62]
      ],
      bass: [
        ['0:0:0', 'E2', '16n', 0.90], ['0:0:2', 'E2', '16n', 0.72], ['0:1:0', 'E2', '16n', 0.85], ['0:1:2', 'E3', '16n', 0.68],
        ['0:2:0', 'E2', '16n', 0.90], ['0:2:2', 'E2', '16n', 0.72], ['0:3:0', 'G2', '8n', 0.82], ['0:3:2', 'B2', '8n', 0.82],
        ['1:0:0', 'C2', '16n', 0.90], ['1:0:2', 'C2', '16n', 0.72], ['1:1:0', 'C2', '16n', 0.85], ['1:1:2', 'C3', '16n', 0.68],
        ['1:2:0', 'C2', '16n', 0.90], ['1:2:2', 'C2', '16n', 0.72], ['1:3:0', 'E2', '8n', 0.82], ['1:3:2', 'G2', '8n', 0.82],
        ['2:0:0', 'A1', '16n', 0.90], ['2:0:2', 'A1', '16n', 0.72], ['2:1:0', 'A1', '16n', 0.85], ['2:1:2', 'A2', '16n', 0.68],
        ['2:2:0', 'A1', '16n', 0.90], ['2:2:2', 'A1', '16n', 0.72], ['2:3:0', 'C2', '8n', 0.82], ['2:3:2', 'E2', '8n', 0.82],
        ['3:0:0', 'B1', '8n', 0.92], ['3:1:0', 'F#2', '8n', 0.80], ['3:2:0', 'B1', '8n', 0.92], ['3:3:0', 'D#2', '8n', 0.85]
      ],
      lead: [
        ['0:0:0', 'B4', '8n', 0.74], ['0:1:0', 'F#5', '8n', 0.80], ['0:1:2', 'E5', '8n', 0.76], ['0:2:2', 'B4', '4n', 0.72],
        ['1:0:0', 'G4', '8n', 0.74], ['1:1:0', 'E5', '8n', 0.80], ['1:1:2', 'D5', '8n', 0.76], ['1:2:2', 'B4', '4n', 0.72],
        ['2:0:0', 'E4', '8n', 0.74], ['2:1:0', 'C5', '8n', 0.80], ['2:1:2', 'B4', '8n', 0.76], ['2:2:2', 'A4', '4n', 0.72],
        ['3:0:0', 'F#4', '8n', 0.78], ['3:1:0', 'B4', '8n', 0.82], ['3:2:0', 'D#5', '8n', 0.86], ['3:3:0', 'F#5', '8n', 0.88]
      ],
      kickBeats: [
        ['0:0:0', 0.92], ['0:1:0', 0.80], ['0:2:0', 0.92], ['0:3:0', 0.80],
        ['1:0:0', 0.92], ['1:1:0', 0.80], ['1:2:0', 0.92], ['1:3:0', 0.80],
        ['2:0:0', 0.92], ['2:1:0', 0.80], ['2:2:0', 0.92], ['2:3:0', 0.80],
        ['3:0:0', 0.92], ['3:1:0', 0.80], ['3:2:0', 0.94], ['3:3:0', 0.84]
      ],
      hatBeats: [
        '0:0:2', '0:1:2', '0:2:2', '0:3:2',
        '1:0:2', '1:1:2', '1:2:2', '1:3:2',
        '2:0:2', '2:1:2', '2:2:2', '2:3:2',
        '3:0:2', '3:1:2', '3:2:2', '3:3:2'
      ],
      hatVel: 0.28
    },

    summary: {
      title: 'After Hours Cooldown',
      bpm: 74,
      loopBars: '4m',
      // Ebmaj9 -> Cm11 -> Abmaj9 -> Bb13sus
      chords: [
        ['0:0:0', ['Eb3', 'G3', 'Bb3', 'D4', 'F4'], '1n'],
        ['1:0:0', ['C3', 'G3', 'Bb3', 'Eb4', 'F4'], '1n'],
        ['2:0:0', ['Ab3', 'C4', 'Eb4', 'G4', 'Bb4'], '1n'],
        ['3:0:0', ['Bb3', 'Eb4', 'F4', 'Ab4', 'C5'], '1n']
      ],
      bass: [
        ['0:0:0', 'Eb2', '1n'],
        ['1:0:0', 'C2', '1n'],
        ['2:0:0', 'Ab1', '2n.'],
        ['2:3:0', 'G1', '4n'],
        ['3:0:0', 'Bb1', '1n']
      ],
      lead: [
        ['0:1:0', 'G5', '4n'], ['0:2:2', 'F5', '4n'], ['0:3:2', 'D5', '4n'],
        ['1:1:0', 'Eb5', '2n'], ['1:3:0', 'Bb4', '4n'],
        ['2:1:0', 'C5', '4n'], ['2:2:2', 'Eb5', '4n'], ['2:3:2', 'G5', '4n'],
        ['3:0:2', 'F5', '2n'], ['3:3:0', 'D5', '4n']
      ],
      kickBeats: ['0:0:0', '1:0:0', '2:0:0', '3:0:0'],
      hatBeats: ['0:2:0', '1:2:0', '2:2:0', '3:2:0'],
      hatVel: 0.1
    }
  });

  const state = {
    initialized: false,
    unlocked: false,
    toneReady: false,
    desiredTrack: 'menu',
    activeTrack: null,
    ducked: false,
    playing: false,
    contextBound: false,
    instruments: null,
    activeParts: []
  };

  const CUSTOM_TRACK_CONFIGS = {};

  function resolveTrackConfig(trackKey) {
    return CUSTOM_TRACK_CONFIGS[trackKey] || TRACK_CONFIGS[trackKey] || null;
  }

  function getAllTrackKeys() {
    return Object.keys(TRACK_CONFIGS).concat(Object.keys(CUSTOM_TRACK_CONFIGS));
  }

  function hasToneLibrary() {
    return Boolean(global.Tone && typeof global.Tone.Transport !== 'undefined' && typeof global.Tone.PolySynth === 'function');
  }

  function clearActiveParts() {
    state.activeParts.forEach((p) => {
      try {
        if (p && typeof p.stop === 'function') p.stop(0);
        if (p && typeof p.dispose === 'function') p.dispose();
      } catch (_) { }
    });
    state.activeParts = [];
  }

  function computeTargetLinearGain() {
    const ss = global.SoundSystem;
    const s = (ss && typeof ss.getSettings === 'function')
      ? ss.getSettings()
      : { muted: false, masterVolume: 0.85, musicMuted: false, musicVolume: 0.55 };
    if (s.muted || s.musicMuted) return 0;
    const master = Math.max(0, Math.min(1, Number(s.masterVolume !== undefined ? s.masterVolume : 0.85)));
    const music = Math.max(0, Math.min(1, Number(s.musicVolume !== undefined ? s.musicVolume : 0.55)));
    const duckScale = state.ducked ? 0.34 : 1.0;
    return Math.max(0, Math.min(1.2, master * music * duckScale * 0.85));
  }

  function applyTrackPalette(cfg) {
    if (!state.instruments) return;
    const inst = state.instruments;
    const isWarm = Boolean(cfg && cfg.palette === 'acoustic_90s');
    try {
      if (inst.delay && inst.delay.wet) {
        inst.delay.wet.value = isWarm ? 0.08 : 0.14;
      }
    } catch (_) { }
  }

  function applyPauseFilterAndGain() {
    if (!state.instruments) return;
    try {
      const activeCfg = resolveTrackConfig(state.activeTrack || state.desiredTrack);
      const normalCutoff = (activeCfg && Number.isFinite(Number(activeCfg.warmCutoff)))
        ? Number(activeCfg.warmCutoff)
        : (activeCfg && activeCfg.palette === 'acoustic_90s' ? 3200 : 5800);
      const targetCutoff = state.ducked ? Math.min(1800, normalCutoff) : normalCutoff;
      const linGain = computeTargetLinearGain();
      if (state.instruments.warmFilter && state.instruments.warmFilter.frequency) {
        state.instruments.warmFilter.frequency.rampTo(targetCutoff, 0.14);
      }
      if (state.instruments.musicOut && state.instruments.musicOut.gain) {
        state.instruments.musicOut.gain.rampTo(linGain, 0.12);
      }
    } catch (_) { }
  }

  function setupToneGraph() {
    if (state.toneReady) return true;
    if (!hasToneLibrary()) return false;

    try {
      const T = global.Tone;
      const musicOut = new T.Gain(computeTargetLinearGain()).toDestination();
      const warmFilter = new T.Filter(5800, 'lowpass').connect(musicOut);
      const delay = new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.14, maxDelay: 1, wet: 0.14 }).connect(warmFilter);
      const hatFilter = new T.Filter(2400, 'highpass').connect(musicOut);

      // Instrument 1: Warm 1996 electric piano / chord pad (20 voices prevents voice-steal clicks on overlapping 4-note chords)
      const keys = new T.PolySynth(T.Synth, {
        maxPolyphony: 20,
        volume: -4,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.028, decay: 0.38, sustain: 0.50, release: 0.55 }
      }).connect(delay);

      // Instrument 2A: Warm analog sub / synth bass
      const bass = new T.MonoSynth({
        volume: -3,
        oscillator: { type: 'sawtooth' },
        filter: { Q: 1.5, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.015, decay: 0.25, sustain: 0.50, release: 0.22 },
        filterEnvelope: { attack: 0.012, decay: 0.22, sustain: 0.4, release: 0.22, baseFrequency: 200, octaves: 2.5 }
      }).connect(warmFilter);

      // Instrument 2B: Soft 90s electric bass guitar (polyphonic release avoids zero-crossing re-trigger clicks)
      const warmBass = new T.PolySynth(T.Synth, {
        maxPolyphony: 6,
        volume: -1,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.018, decay: 0.22, sustain: 0.55, release: 0.20 }
      }).connect(warmFilter);

      // Instrument 3A: Soft bell / Rhodes FM top voice
      const lead = new T.PolySynth(T.FMSynth, {
        maxPolyphony: 8,
        volume: -5,
        harmonicity: 2,
        modulationIndex: 2.0,
        oscillator: { type: 'sine' },
        modulation: { type: 'triangle' },
        envelope: { attack: 0.014, decay: 0.35, sustain: 0.28, release: 0.50 }
      }).connect(delay);

      // Instrument 3B: Silky midrange sine electric-piano / marimba lead (zero FM overtones or sharp clicks)
      const warmLead = new T.PolySynth(T.Synth, {
        maxPolyphony: 8,
        volume: -3,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.022, decay: 0.30, sustain: 0.32, release: 0.45 }
      }).connect(delay);

      // Instrument 4: Soft punchy kick drum
      const kick = new T.MembraneSynth({
        volume: -4,
        pitchDecay: 0.04,
        octaves: 4,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.004, decay: 0.22, sustain: 0.0, release: 0.18 }
      }).connect(warmFilter);

      // Instrument 5: Soft brushed shaker / hi-hat (high-passed cleanly so lowpass filters never turn it into vinyl crackle)
      const hat = new T.NoiseSynth({
        volume: -14,
        noise: { type: 'pink' },
        envelope: { attack: 0.008, decay: 0.045, sustain: 0, release: 0.03 }
      }).connect(hatFilter);

      state.instruments = { musicOut, warmFilter, delay, hatFilter, keys, bass, warmBass, lead, warmLead, kick, hat };
      state.toneReady = true;
      return true;
    } catch (err) {
      console.warn('MusicSystem Tone setup warning:', err);
      return false;
    }
  }

  function scheduleAndStartTrack(trackKey) {
    const cfg = resolveTrackConfig(trackKey) || TRACK_CONFIGS.menu;
    if (!state.toneReady || !state.instruments) return false;

    const T = global.Tone;
    const inst = state.instruments;
    const transport = typeof T.getTransport === 'function' ? T.getTransport() : T.Transport;

    try {
      transport.stop();
      transport.cancel(0);
      clearActiveParts();

      transport.bpm.value = cfg.bpm;
      transport.loop = true;
      transport.loopStart = 0;
      transport.loopEnd = cfg.loopBars;
      applyTrackPalette(cfg);

      const chordPart = new T.Part((time, ev) => {
        const vel = ev.vel !== undefined ? ev.vel : (trackKey === 'shift' ? 0.62 : 0.58);
        inst.keys.triggerAttackRelease(ev.notes, ev.dur, time, vel);
      }, cfg.chords.map(([time, notes, dur, vel]) => ({ time, notes, dur, vel })));
      chordPart.loop = true;
      chordPart.loopEnd = cfg.loopBars;
      chordPart.start(0);

      const useWarmVoices = Boolean(cfg && cfg.palette === 'acoustic_90s');
      const activeBass = (useWarmVoices && inst.warmBass) ? inst.warmBass : inst.bass;
      const activeLead = (useWarmVoices && inst.warmLead) ? inst.warmLead : inst.lead;

      const bassPart = new T.Part((time, ev) => {
        const vel = ev.vel !== undefined ? ev.vel : 0.85;
        activeBass.triggerAttackRelease(ev.note, ev.dur, time, vel);
      }, cfg.bass.map(([time, note, dur, vel]) => ({ time, note, dur, vel })));
      bassPart.loop = true;
      bassPart.loopEnd = cfg.loopBars;
      bassPart.start(0);

      const leadPart = new T.Part((time, ev) => {
        const vel = ev.vel !== undefined ? ev.vel : 0.72;
        activeLead.triggerAttackRelease(ev.note, ev.dur, time, vel);
      }, cfg.lead.map(([time, note, dur, vel]) => ({ time, note, dur, vel })));
      leadPart.loop = true;
      leadPart.loopEnd = cfg.loopBars;
      leadPart.start(0);

      const kickPart = new T.Part((time, ev) => {
        const vel = ev.vel !== undefined ? ev.vel : (trackKey === 'summary' ? 0.65 : 0.88);
        inst.kick.triggerAttackRelease('C1', '8n', time, vel);
      }, cfg.kickBeats.map((entry) => (typeof entry === 'string' ? { time: entry } : { time: entry[0], vel: entry[1] })));
      kickPart.loop = true;
      kickPart.loopEnd = cfg.loopBars;
      kickPart.start(0);

      const hatPart = new T.Part((time, ev) => {
        const vel = ev.vel !== undefined ? ev.vel : Math.min(1, (cfg.hatVel || 0.18) * 1.4);
        inst.hat.triggerAttackRelease('32n', time, vel);
      }, cfg.hatBeats.map((entry) => (typeof entry === 'string' ? { time: entry } : { time: entry[0], vel: entry[1] })));
      hatPart.loop = true;
      hatPart.loopEnd = cfg.loopBars;
      hatPart.start(0);

      state.activeParts.push(chordPart, bassPart, leadPart, kickPart, hatPart);
      state.activeTrack = trackKey;
      state.playing = true;

      transport.position = 0;
      transport.start();
      applyPauseFilterAndGain();
      return true;
    } catch (err) {
      console.warn('MusicSystem track start warning:', err);
      return false;
    }
  }

  function ensurePlayingDesiredTrack() {
    if (!state.unlocked || !state.toneReady) return false;
    const T = global.Tone;
    const transport = typeof T.getTransport === 'function' ? T.getTransport() : T.Transport;
    if (state.activeTrack !== state.desiredTrack || !state.playing) {
      return scheduleAndStartTrack(state.desiredTrack);
    }
    if (transport && transport.state !== 'started') {
      try { transport.start(); } catch (_) { }
    }
    applyPauseFilterAndGain();
    return true;
  }

  function unlock() {
    if (global.SoundSystem && typeof global.SoundSystem.ensureUnlocked === 'function') {
      global.SoundSystem.ensureUnlocked();
    }
    state.unlocked = true;
    if (!hasToneLibrary()) return false;

    const T = global.Tone;
    if (!state.toneReady) {
      setupToneGraph();
    }

    if (typeof T.start === 'function') {
      try {
        const p = T.start();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            ensurePlayingDesiredTrack();
          }).catch(() => { });
        }
      } catch (_) { }
    }

    const ctx = typeof T.getContext === 'function' ? T.getContext() : null;
    if (ctx && ctx.state !== 'running' && typeof ctx.resume === 'function') {
      try {
        const rp = ctx.resume();
        if (rp && typeof rp.then === 'function') {
          rp.then(() => ensurePlayingDesiredTrack()).catch(() => { });
        }
      } catch (_) { }
    }

    return ensurePlayingDesiredTrack();
  }

  function setTrack(trackName) {
    const key = resolveTrackConfig(trackName) ? trackName : 'menu';
    state.desiredTrack = key;
    if (!state.unlocked || !state.toneReady) return false;
    if (state.activeTrack === key && state.playing) {
      applyPauseFilterAndGain();
      return true;
    }
    if (!state.activeTrack || !state.playing) {
      return scheduleAndStartTrack(key);
    }
    if (state.instruments && state.instruments.musicOut && state.instruments.musicOut.gain) {
      try {
        state.instruments.musicOut.gain.rampTo(0, 0.14);
      } catch (_) { }
    }
    setTimeout(() => {
      if (state.desiredTrack === key && state.unlocked) {
        scheduleAndStartTrack(key);
      }
    }, 150);
    return true;
  }

  function setSceneState(flags) {
    const f = flags || {};
    state.ducked = Boolean(f.systemMenuOpen || f.saveLoadModalOpen || f.infoModalOpen);
    let targetTrack = 'shift';
    if (f.shiftSummaryOpen) targetTrack = 'summary';
    else if (f.mainMenuOpen) targetTrack = 'menu';

    const changed = targetTrack !== state.desiredTrack;
    state.desiredTrack = targetTrack;
    if (state.unlocked && state.toneReady) {
      if (changed || !state.playing) {
        setTrack(targetTrack);
      } else {
        applyPauseFilterAndGain();
      }
    }
    return targetTrack;
  }

  function bindUnlockListeners() {
    if (state.contextBound || typeof document === 'undefined') return;
    state.contextBound = true;
    const onFirstGesture = () => {
      unlock();
    };
    ['pointerdown', 'click', 'keydown', 'touchstart', 'touchend'].forEach((evtName) => {
      document.addEventListener(evtName, onFirstGesture, { passive: true, capture: true });
    });
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    bindUnlockListeners();
  }

  init();

  global.MusicSystem = {
    TRACKS: Object.freeze(Object.keys(TRACK_CONFIGS)),
    TRACK_CONFIGS: TRACK_CONFIGS,
    init: init,
    unlock: unlock,
    setTrack: setTrack,
    setSceneState: setSceneState,
    setDucked: function (ducked) {
      state.ducked = Boolean(ducked);
      applyPauseFilterAndGain();
      return state.ducked;
    },
    setBpm: function (bpmVal) {
      if (!hasToneLibrary()) return false;
      const clamped = Math.max(45, Math.min(200, Number(bpmVal) || 90));
      const tr = typeof global.Tone.getTransport === 'function' ? global.Tone.getTransport() : global.Tone.Transport;
      if (tr && tr.bpm) {
        tr.bpm.value = clamped;
        return true;
      }
      return false;
    },
    registerTrack: function (key, cfg) {
      if (!key || !cfg || typeof cfg !== 'object') return false;
      CUSTOM_TRACK_CONFIGS[String(key)] = cfg;
      return true;
    },
    getTrackList: function () {
      return getAllTrackKeys();
    },
    getTrackConfig: function (key) {
      return resolveTrackConfig(key);
    },
    getInstruments: function () {
      return state.instruments;
    },
    syncVolume: applyPauseFilterAndGain,
    stop: function () {
      state.playing = false;
      state.activeTrack = null;
      if (hasToneLibrary()) {
        const tr = typeof global.Tone.getTransport === 'function' ? global.Tone.getTransport() : global.Tone.Transport;
        if (tr && typeof tr.stop === 'function') {
          try { tr.stop(); } catch (_) { }
        }
      }
      clearActiveParts();
    },
    getState: function () {
      return {
        initialized: Boolean(state.initialized),
        unlocked: Boolean(state.unlocked),
        hasTone: hasToneLibrary(),
        toneReady: Boolean(state.toneReady),
        desiredTrack: state.desiredTrack,
        activeTrack: state.activeTrack,
        ducked: Boolean(state.ducked),
        playing: Boolean(state.playing),
        trackCount: getAllTrackKeys().length
      };
    }
  };
})(window);
