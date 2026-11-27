(function (global) {
  'use strict';

  const STORAGE_KEY = 'dsd_sim_ui_scale_v1';
  const VALID_MODES = ['auto', '0.8', '0.9', '1'];
  const TABLET_SCALE = 0.8;

  const WIDTH_LE_BREAKPOINTS = [1380, 1240, 1180, 1080, 1079, 960, 819, 768, 767, 759, 720, 640, 600, 560, 520, 400];
  const WIDTH_GE_BREAKPOINTS = [768, 820, 1080];
  const HEIGHT_LE_BREAKPOINTS = [560, 540, 520];

  function safeMatchMedia(query) {
    try {
      return Boolean(global.matchMedia && global.matchMedia(query).matches);
    } catch (_) {
      return false;
    }
  }

  function loadStoredMode() {
    try {
      const saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_MODES.includes(saved)) return saved;
    } catch (_) { }
    return 'auto';
  }

  function saveStoredMode(mode) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, mode);
      }
    } catch (_) { }
  }

  /**
   * Detect tablet-class viewports across browsers (including Android WebView / Native Alpha)
   * while excluding phones (<500px short edge), standard desktops, and already Chrome-zoomed 80% views.
   */
  function detectTabletEnvironment(env) {
    const e = env || {};
    const w = Number(e.width) || (global.innerWidth || (global.document && global.document.documentElement && global.document.documentElement.clientWidth) || 1280);
    const h = Number(e.height) || (global.innerHeight || (global.document && global.document.documentElement && global.document.documentElement.clientHeight) || 800);
    const shortSide = Math.min(w, h);
    const longSide = Math.max(w, h);

    if (shortSide < 500 || shortSide > 1100 || longSide < 760 || longSide > 1480) {
      return false;
    }

    const ua = String(e.userAgent !== undefined ? e.userAgent : ((global.navigator && global.navigator.userAgent) || ''));
    const maxTouch = Number(e.maxTouchPoints !== undefined ? e.maxTouchPoints : ((global.navigator && global.navigator.maxTouchPoints) || 0));
    const hasTouch = e.hasTouch !== undefined
      ? Boolean(e.hasTouch)
      : (('ontouchstart' in global) || maxTouch > 0);
    const coarsePointer = e.coarsePointer !== undefined
      ? Boolean(e.coarsePointer)
      : safeMatchMedia('(pointer: coarse)');
    const hoverNone = e.hoverNone !== undefined
      ? Boolean(e.hoverNone)
      : safeMatchMedia('(hover: none)');
    const anyCoarse = e.anyCoarse !== undefined
      ? Boolean(e.anyCoarse)
      : safeMatchMedia('(any-pointer: coarse)');

    const isAndroid = /android/i.test(ua);
    const isTabletUa = /ipad|tablet|playbook|silk/i.test(ua) ||
      (isAndroid && !/mobile/i.test(ua)) ||
      (/macintosh/i.test(ua) && maxTouch > 1);

    if (isTabletUa) return true;
    if (coarsePointer && hasTouch) return true;
    if (isAndroid && hasTouch) return true;
    if (anyCoarse && hasTouch && shortSide >= 560 && longSide <= 1380) return true;
    return false;
  }

  let currentMode = loadStoredMode();
  let lastSnapshot = null;

  function computeMetrics(modeOverride) {
    const mode = VALID_MODES.includes(modeOverride) ? modeOverride : currentMode;
    const docEl = global.document && global.document.documentElement;
    const rawW = Math.max(240, Math.round(global.innerWidth || (docEl && docEl.clientWidth) || 1280));
    const rawH = Math.max(240, Math.round(global.innerHeight || (docEl && docEl.clientHeight) || 800));
    const isTabletAuto = detectTabletEnvironment({ width: rawW, height: rawH });

    let scale = 1;
    if (mode === 'auto') {
      scale = isTabletAuto ? TABLET_SCALE : 1;
    } else {
      const parsed = Number(mode);
      scale = (Number.isFinite(parsed) && parsed > 0.4 && parsed <= 1.5) ? parsed : 1;
    }

    const uiW = scale === 1 ? rawW : Math.round(rawW / scale);
    const uiH = scale === 1 ? rawH : Math.round(rawH / scale);

    return {
      mode,
      scale,
      isTabletAuto,
      rawWidth: rawW,
      rawHeight: rawH,
      width: uiW,
      height: uiH
    };
  }

  function syncDocumentLayoutClasses(docEl, m) {
    if (!docEl || !docEl.classList) return;
    const cl = docEl.classList;
    const hasUiStage = Boolean(global.document && global.document.getElementById('ui-stage'));
    cl.toggle('ui-scaled', m.scale !== 1 && hasUiStage);

    for (let i = 0; i < WIDTH_LE_BREAKPOINTS.length; i++) {
      const bp = WIDTH_LE_BREAKPOINTS[i];
      cl.toggle('ui-w-le-' + bp, m.width <= bp);
    }
    for (let i = 0; i < WIDTH_GE_BREAKPOINTS.length; i++) {
      const bp = WIDTH_GE_BREAKPOINTS[i];
      cl.toggle('ui-w-ge-' + bp, m.width >= bp);
    }
    for (let i = 0; i < HEIGHT_LE_BREAKPOINTS.length; i++) {
      const bp = HEIGHT_LE_BREAKPOINTS[i];
      cl.toggle('ui-h-le-' + bp, m.height <= bp);
    }
    cl.toggle('ui-h-ge-561', m.height >= 561);

    const landscape = m.width >= m.height;
    cl.toggle('ui-landscape', landscape);
    cl.toggle('ui-portrait', !landscape);
    cl.toggle('ui-aspect-tall', (m.width / Math.max(1, m.height)) <= 0.75);
  }

  function apply() {
    const m = computeMetrics();
    const doc = global.document;
    const docEl = doc && doc.documentElement;
    const prev = lastSnapshot;
    lastSnapshot = m;

    if (docEl) {
      docEl.dataset.uiScaleMode = m.mode;
      docEl.dataset.uiScale = String(m.scale);
      if (m.scale !== 1) {
        docEl.style.setProperty('--ui-scale', String(m.scale));
        docEl.style.setProperty('--ui-w', m.width + 'px');
        docEl.style.setProperty('--ui-h', m.height + 'px');
        docEl.style.setProperty('--ui-vw', (m.width / 100) + 'px');
        docEl.style.setProperty('--ui-vh', (m.height / 100) + 'px');
      } else {
        docEl.style.removeProperty('--ui-scale');
        docEl.style.removeProperty('--ui-w');
        docEl.style.removeProperty('--ui-h');
        docEl.style.removeProperty('--ui-vw');
        docEl.style.removeProperty('--ui-vh');
      }
      syncDocumentLayoutClasses(docEl, m);
    }

    const changed = !prev ||
      prev.scale !== m.scale ||
      prev.width !== m.width ||
      prev.height !== m.height ||
      prev.mode !== m.mode;

    if (changed && typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      try {
        global.dispatchEvent(new global.CustomEvent('dsd-ui-scale-change', { detail: m }));
      } catch (_) { }
    }
    return m;
  }

  function setMode(nextMode) {
    const m = String(nextMode || 'auto').toLowerCase();
    currentMode = VALID_MODES.includes(m) ? m : 'auto';
    saveStoredMode(currentMode);
    return apply();
  }

  function cycleMode() {
    const idx = VALID_MODES.indexOf(currentMode);
    const next = VALID_MODES[(idx + 1) % VALID_MODES.length];
    return setMode(next);
  }

  function getSettings() {
    return Object.assign({}, lastSnapshot || apply());
  }

  function getScale() {
    return (lastSnapshot || apply()).scale;
  }

  function getViewport() {
    const m = lastSnapshot || apply();
    return {
      width: m.width,
      height: m.height,
      rawWidth: m.rawWidth,
      rawHeight: m.rawHeight,
      scale: m.scale
    };
  }

  function isUiScaledActive() {
    const docEl = global.document && global.document.documentElement;
    return Boolean(docEl && docEl.classList && docEl.classList.contains('ui-scaled'));
  }

  function toUiRect(rect) {
    if (!rect) return rect;
    const s = isUiScaledActive() ? getScale() : 1;
    if (s === 1) return rect;
    return {
      left: rect.left / s,
      top: rect.top / s,
      right: rect.right / s,
      bottom: rect.bottom / s,
      width: rect.width / s,
      height: rect.height / s,
      x: (rect.x !== undefined ? rect.x : rect.left) / s,
      y: (rect.y !== undefined ? rect.y : rect.top) / s
    };
  }

  function toUiPoint(x, y) {
    const s = isUiScaledActive() ? getScale() : 1;
    if (s === 1) return { x: Number(x) || 0, y: Number(y) || 0 };
    return {
      x: (Number(x) || 0) / s,
      y: (Number(y) || 0) / s
    };
  }

  // Apply synchronously on initial parse so CSS paints cleanly on frame 0.
  apply();

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('resize', apply);
    global.addEventListener('orientationchange', () => setTimeout(apply, 60));
    global.addEventListener('DOMContentLoaded', apply);
    if (global.matchMedia) {
      try {
        const mq = global.matchMedia('(pointer: coarse)');
        if (mq && typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', apply);
        }
      } catch (_) { }
    }
  }

  global.DSDUIScale = {
    detectTabletEnvironment,
    apply,
    refresh: apply,
    setMode,
    cycleMode,
    getSettings,
    getScale,
    getViewport,
    toUiRect,
    toUiPoint
  };
})(window);
