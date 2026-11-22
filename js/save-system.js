(function (global) {
  'use strict';

  /**
   * SaveSystem - Full mid-shift save/load via localStorage + portable JSON Export/Import
   * Schema v1: pure-JSON snapshots across ShiftClock, ShiftStats, WarehouseTrucks,
   * DeliverySystem, BackstockRacks, ClaimsTotes, DSDReceipts, and DockRuntime world state.
   */
  const SCHEMA_VERSION = 1;
  const SLOTS = [
    { id: 'autosave', key: 'dsd_sim_save_autosave_v1', label: 'Autosave' },
    { id: 'slot1', key: 'dsd_sim_save_slot_1_v1', label: 'Slot 1' },
    { id: 'slot2', key: 'dsd_sim_save_slot_2_v1', label: 'Slot 2' },
    { id: 'slot3', key: 'dsd_sim_save_slot_3_v1', label: 'Slot 3' }
  ];

  const state = {
    initialized: false,
    lastAutosaveMinuteKey: null,
    hooks: {
      canAutosave: null,
      exportWorldState: null,
      importWorldState: null,
      exportDeliveryState: null,
      importDeliveryState: null,
      relinkPallets: null,
      onAfterLoad: null
    }
  };

  function getSlotConfig(slotId) {
    const clean = String(slotId || 'autosave').toLowerCase();
    return SLOTS.find((s) => s.id === clean) || SLOTS[0];
  }

  function safeGetStorageItem(key) {
    try {
      return global.localStorage ? global.localStorage.getItem(key) : null;
    } catch (err) {
      return null;
    }
  }

  function safeSetStorageItem(key, val) {
    try {
      if (!global.localStorage) return { ok: false, error: 'localStorage unavailable' };
      global.localStorage.setItem(key, val);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Storage write failed' };
    }
  }

  function safeRemoveStorageItem(key) {
    try {
      if (global.localStorage) global.localStorage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  }

  function buildMetaSummary() {
    const clockSnap = (global.ShiftClock && typeof global.ShiftClock.getTimeSnapshot === 'function')
      ? global.ShiftClock.getTimeSnapshot()
      : { dateLabel: 'FEB 1, 1996', dayName: 'THU', formatted12h: '6:00 AM', workdayIndex: 1 };
    const liveScore = (global.ShiftStats && typeof global.ShiftStats.getLiveScore === 'function')
      ? global.ShiftStats.getLiveScore()
      : 0;
    const receiptsCount = (global.DSDReceipts && typeof global.DSDReceipts.getReceipts === 'function')
      ? (global.DSDReceipts.getReceipts() || []).filter((r) => r && !r.isPreviousDay).length
      : 0;
    const sched = (global.WarehouseTrucks && typeof global.WarehouseTrucks.getScheduleRows === 'function')
      ? (global.WarehouseTrucks.getScheduleRows() || [])
      : [];
    const deliveriesTotal = sched.length;
    const deliveriesCompleted = sched.filter((d) => d && (d.completed || d.refused)).length;

    return {
      dateLabel: clockSnap.dateLabel || 'FEB 1, 1996',
      dayName: clockSnap.dayName || 'THU',
      timeLabel: clockSnap.formatted12h || '6:00 AM',
      workdayIndex: Number(clockSnap.workdayIndex) || 1,
      liveScore: Number(liveScore) || 0,
      receiptsCount: receiptsCount,
      deliveriesCompleted: deliveriesCompleted,
      deliveriesTotal: deliveriesTotal
    };
  }

  function buildSavePayload(slotId) {
    const cfg = getSlotConfig(slotId);
    const modules = {
      clock: global.ShiftClock && typeof global.ShiftClock.exportState === 'function' ? global.ShiftClock.exportState() : null,
      stats: global.ShiftStats && typeof global.ShiftStats.exportState === 'function' ? global.ShiftStats.exportState() : null,
      trucks: global.WarehouseTrucks && typeof global.WarehouseTrucks.exportState === 'function' ? global.WarehouseTrucks.exportState() : null,
      backstock: global.BackstockRacks && typeof global.BackstockRacks.exportState === 'function' ? global.BackstockRacks.exportState() : null,
      claims: global.ClaimsTotes && typeof global.ClaimsTotes.exportState === 'function' ? global.ClaimsTotes.exportState() : null,
      receipts: global.DSDReceipts && typeof global.DSDReceipts.exportState === 'function' ? global.DSDReceipts.exportState() : null,
      delivery: typeof state.hooks.exportDeliveryState === 'function' ? state.hooks.exportDeliveryState() : null,
      world: typeof state.hooks.exportWorldState === 'function' ? state.hooks.exportWorldState() : null
    };

    return {
      schemaVersion: SCHEMA_VERSION,
      gameId: '3d-dsd-receiving-sim',
      slotId: cfg.id,
      savedAt: new Date().toISOString(),
      meta: buildMetaSummary(),
      modules: modules
    };
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: 'Invalid save payload format' };
    }
    if (Number(payload.schemaVersion) !== SCHEMA_VERSION) {
      return { ok: false, error: 'Unsupported save version: ' + String(payload.schemaVersion) };
    }
    if (!payload.modules || typeof payload.modules !== 'object') {
      return { ok: false, error: 'Missing modules section in save' };
    }
    return { ok: true };
  }

  function applySavePayload(payload) {
    const valid = validatePayload(payload);
    if (!valid.ok) return valid;

    try {
      const m = payload.modules;
      if (m.clock && global.ShiftClock && typeof global.ShiftClock.importState === 'function') {
        global.ShiftClock.importState(m.clock);
      }
      if (m.stats && global.ShiftStats && typeof global.ShiftStats.importState === 'function') {
        global.ShiftStats.importState(m.stats);
      }
      if (m.trucks && global.WarehouseTrucks && typeof global.WarehouseTrucks.importState === 'function') {
        global.WarehouseTrucks.importState(m.trucks);
      }
      if (m.world && typeof state.hooks.importWorldState === 'function') {
        state.hooks.importWorldState(m.world);
      }
      if (typeof state.hooks.relinkPallets === 'function') {
        state.hooks.relinkPallets();
      } else if (global.WarehouseTrucks && typeof global.WarehouseTrucks.relinkSpawnedPallets === 'function') {
        global.WarehouseTrucks.relinkSpawnedPallets();
      }
      if (m.delivery && typeof state.hooks.importDeliveryState === 'function') {
        state.hooks.importDeliveryState(m.delivery);
      }
      if (m.backstock && global.BackstockRacks && typeof global.BackstockRacks.importState === 'function') {
        global.BackstockRacks.importState(m.backstock);
      }
      if (m.claims && global.ClaimsTotes && typeof global.ClaimsTotes.importState === 'function') {
        global.ClaimsTotes.importState(m.claims);
      }
      if (m.receipts && global.DSDReceipts && typeof global.DSDReceipts.importState === 'function') {
        global.DSDReceipts.importState(m.receipts);
      }
      if (typeof state.hooks.onAfterLoad === 'function') {
        state.hooks.onAfterLoad(payload);
      }
      return {
        ok: true,
        slotId: payload.slotId || 'autosave',
        savedAt: payload.savedAt || null,
        meta: payload.meta || buildMetaSummary()
      };
    } catch (err) {
      console.error('SaveSystem.applySavePayload failed:', err);
      return { ok: false, error: err && err.message ? err.message : 'Failed to apply save data' };
    }
  }

  function saveGame(slotId) {
    const cfg = getSlotConfig(slotId);
    let json;
    let payload;
    try {
      payload = buildSavePayload(cfg.id);
      json = JSON.stringify(payload);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Serialization error' };
    }
    const res = safeSetStorageItem(cfg.key, json);
    if (!res.ok) return res;
    return {
      ok: true,
      slotId: cfg.id,
      label: cfg.label,
      savedAt: payload.savedAt,
      meta: payload.meta,
      sizeBytes: json.length
    };
  }

  function readSlotPayload(slotId) {
    const cfg = getSlotConfig(slotId);
    const raw = safeGetStorageItem(cfg.key);
    if (!raw) return { ok: false, missing: true, error: 'Empty slot' };
    try {
      const parsed = JSON.parse(raw);
      const valid = validatePayload(parsed);
      if (!valid.ok) return { ok: false, corrupted: true, error: valid.error };
      return { ok: true, payload: parsed, raw: raw };
    } catch (err) {
      return { ok: false, corrupted: true, error: 'Corrupted save JSON' };
    }
  }

  function loadGame(slotId) {
    const readRes = readSlotPayload(slotId);
    if (!readRes.ok) return readRes;
    return applySavePayload(readRes.payload);
  }

  function deleteSave(slotId) {
    const cfg = getSlotConfig(slotId);
    return safeRemoveStorageItem(cfg.key);
  }

  function listSlots() {
    return SLOTS.map((cfg) => {
      const raw = safeGetStorageItem(cfg.key);
      if (!raw) {
        return {
          slotId: cfg.id,
          storageKey: cfg.key,
          label: cfg.label,
          exists: false,
          corrupted: false,
          savedAt: null,
          meta: null,
          sizeBytes: 0
        };
      }
      try {
        const parsed = JSON.parse(raw);
        const valid = validatePayload(parsed);
        if (!valid.ok) {
          return {
            slotId: cfg.id,
            storageKey: cfg.key,
            label: cfg.label,
            exists: true,
            corrupted: true,
            savedAt: null,
            meta: null,
            sizeBytes: raw.length
          };
        }
        return {
          slotId: cfg.id,
          storageKey: cfg.key,
          label: cfg.label,
          exists: true,
          corrupted: false,
          savedAt: parsed.savedAt || null,
          meta: parsed.meta || null,
          sizeBytes: raw.length
        };
      } catch (err) {
        return {
          slotId: cfg.id,
          storageKey: cfg.key,
          label: cfg.label,
          exists: true,
          corrupted: true,
          savedAt: null,
          meta: null,
          sizeBytes: raw.length
        };
      }
    });
  }

  function hasAnySave() {
    return listSlots().some((s) => s.exists && !s.corrupted);
  }

  function exportSaveJson(slotId) {
    if (slotId) {
      const readRes = readSlotPayload(slotId);
      if (readRes.ok) {
        return {
          ok: true,
          json: JSON.stringify(readRes.payload, null, 2),
          filename: 'dsd-sim-' + getSlotConfig(slotId).id + '.json'
        };
      }
    }
    try {
      const payload = buildSavePayload('export');
      return {
        ok: true,
        json: JSON.stringify(payload, null, 2),
        filename: 'dsd-sim-day' + (payload.meta.workdayIndex || 1) + '.json'
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Export failed' };
    }
  }

  function downloadSaveFile(slotId) {
    const exp = exportSaveJson(slotId);
    if (!exp.ok || typeof document === 'undefined') return exp;
    try {
      const blob = new Blob([exp.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exp.filename || 'dsd-sim-save.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true, filename: exp.filename };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Download failed' };
    }
  }

  function importSaveJson(jsonText, opts) {
    const o = opts || {};
    let parsed;
    try {
      parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    } catch (err) {
      return { ok: false, error: 'Invalid JSON file' };
    }
    const valid = validatePayload(parsed);
    if (!valid.ok) return valid;

    const targetSlot = o.targetSlot || 'autosave';
    if (o.persist !== false) {
      const cfg = getSlotConfig(targetSlot);
      parsed.slotId = cfg.id;
      const writeRes = safeSetStorageItem(cfg.key, JSON.stringify(parsed));
      if (!writeRes.ok) return writeRes;
    }
    if (o.loadImmediately !== false) {
      return applySavePayload(parsed);
    }
    return { ok: true, slotId: targetSlot, meta: parsed.meta || null };
  }

  function triggerAutosave(reason) {
    if (typeof state.hooks.canAutosave === 'function' && !state.hooks.canAutosave()) {
      return { ok: false, skipped: true };
    }
    return saveGame('autosave');
  }

  function bindLifecycleListeners() {
    if (state.initialized || typeof document === 'undefined') return;
    state.initialized = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        triggerAutosave('visibility_hidden');
      }
    });
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('pagehide', () => {
        triggerAutosave('pagehide');
      });
    }
  }

  function init(hooks) {
    if (hooks && typeof hooks === 'object') {
      Object.keys(state.hooks).forEach((k) => {
        if (typeof hooks[k] === 'function') state.hooks[k] = hooks[k];
      });
    }
    bindLifecycleListeners();
  }

  global.SaveSystem = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    init: init,
    buildSavePayload: buildSavePayload,
    saveGame: saveGame,
    loadGame: loadGame,
    deleteSave: deleteSave,
    listSlots: listSlots,
    hasAnySave: hasAnySave,
    exportSaveJson: exportSaveJson,
    downloadSaveFile: downloadSaveFile,
    importSaveJson: importSaveJson,
    triggerAutosave: triggerAutosave
  };
})(window);
