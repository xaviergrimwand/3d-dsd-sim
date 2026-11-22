(function (global) {
  'use strict';

  /**
   * DSDMenuUI - Controller for Classic Splash Main Menu, In-Game Pause Menu,
   * Save/Load Slot Picker Modal (localStorage + JSON Export/Import), Tutorial Notice, and About Modal.
   */
  const state = {
    initialized: false,
    slotModalMode: 'load', // 'load' | 'save'
    returnToOverlay: 'main' // 'main' | 'pause'
  };

  const dom = {};

  function cacheDom() {
    dom.mainOverlay = document.getElementById('main-menu-overlay');
    dom.btnNewGame = document.getElementById('btn-menu-new-game');
    dom.btnMainLoad = document.getElementById('btn-menu-load-game');
    dom.btnTutorial = document.getElementById('btn-menu-tutorial');
    dom.btnAbout = document.getElementById('btn-menu-about');
    dom.mainLoadBadge = document.getElementById('menu-load-badge');

    dom.hudPauseBtn = document.getElementById('pause-menu-btn');
    dom.pauseOverlay = document.getElementById('pause-menu-overlay');
    dom.pauseMetaText = document.getElementById('pause-shift-summary');
    dom.btnResume = document.getElementById('btn-pause-resume');
    dom.btnPauseSave = document.getElementById('btn-pause-save');
    dom.btnPauseLoad = document.getElementById('btn-pause-load');
    dom.btnReturnMain = document.getElementById('btn-pause-main-menu');
    dom.btnPauseMute = document.getElementById('btn-pause-mute');
    dom.pauseVolSlider = document.getElementById('pause-vol-slider');
    dom.pauseVolVal = document.getElementById('pause-vol-val');
    dom.btnPauseGfx = document.getElementById('btn-pause-gfx');
    dom.pauseFpsVal = document.getElementById('pause-fps-val');
    dom.btnPauseFpsHud = document.getElementById('btn-pause-fps-hud');

    dom.saveLoadModal = document.getElementById('save-load-modal');
    dom.slmTitle = document.getElementById('slm-title');
    dom.slmSubtitle = document.getElementById('slm-subtitle');
    dom.slmSlotsList = document.getElementById('slm-slots-list');
    dom.slmStatus = document.getElementById('slm-status-msg');
    dom.slmCloseBtn = document.getElementById('slm-close-btn');
    dom.slmExportBtn = document.getElementById('slm-export-btn');
    dom.slmImportBtn = document.getElementById('slm-import-btn');
    dom.slmImportFile = document.getElementById('slm-import-file');

    dom.infoModal = document.getElementById('menu-info-modal');
    dom.mimTitle = document.getElementById('mim-title');
    dom.mimBody = document.getElementById('mim-body');
    dom.mimCloseBtn = document.getElementById('mim-close-btn');
  }

  function playClick() {
    if (global.SoundSystem && typeof global.SoundSystem.playButtonClick === 'function') {
      global.SoundSystem.playButtonClick();
    }
  }

  function playSuccess() {
    if (global.SoundSystem && typeof global.SoundSystem.playSuccessChime === 'function') {
      global.SoundSystem.playSuccessChime();
    }
  }

  function playError() {
    if (global.SoundSystem && typeof global.SoundSystem.playErrorBuzzer === 'function') {
      global.SoundSystem.playErrorBuzzer();
    }
  }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatSavedTimestamp(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function syncAudioControls() {
    if (!global.SoundSystem || typeof global.SoundSystem.getSettings !== 'function') return;
    const s = global.SoundSystem.getSettings();
    if (dom.btnPauseMute) {
      dom.btnPauseMute.textContent = s.muted ? '🔇 MUTED' : '🔊 SOUND: ON';
      dom.btnPauseMute.classList.toggle('muted', Boolean(s.muted));
    }
    if (dom.pauseVolSlider) {
      const pct = Math.round((Number(s.masterVolume) || 0) * 100);
      dom.pauseVolSlider.value = String(pct);
      if (dom.pauseVolVal) dom.pauseVolVal.textContent = pct + '%';
    }
    if (global.DSDGraphics && typeof global.DSDGraphics.getSettings === 'function') {
      const gs = global.DSDGraphics.getSettings();
      if (dom.btnPauseGfx) {
        dom.btnPauseGfx.textContent = '🖥️ GFX: ' + String(gs.quality || 'balanced').toUpperCase();
      }
      if (dom.btnPauseFpsHud) {
        dom.btnPauseFpsHud.textContent = gs.showFps ? 'FPS HUD: ON' : 'FPS HUD: OFF';
        dom.btnPauseFpsHud.classList.toggle('active', Boolean(gs.showFps));
      }
      if (dom.pauseFpsVal && typeof global.DSDGraphics.getMetrics === 'function') {
        const m = global.DSDGraphics.getMetrics();
        dom.pauseFpsVal.textContent = m && m.fps > 0 ? `${m.fps} FPS · ${m.avgMs.toFixed(1)}ms` : '-- FPS';
      }
    }
  }

  function syncOverlaysFromGame() {
    const g = global.DSDGame;
    if (!g) return;
    const mainOpen = typeof g.isMainMenuOpen === 'function' ? g.isMainMenuOpen() : false;
    const pauseOpen = typeof g.isPauseMenuOpen === 'function' ? g.isPauseMenuOpen() : false;
    const saveOpen = typeof g.isSaveLoadModalOpen === 'function' ? g.isSaveLoadModalOpen() : false;
    const infoOpen = typeof g.isInfoModalOpen === 'function' ? g.isInfoModalOpen() : false;

    if (dom.mainOverlay) {
      dom.mainOverlay.classList.toggle('active', mainOpen);
      dom.mainOverlay.classList.toggle('submodal-open', mainOpen && saveOpen);
    }
    if (dom.pauseOverlay) {
      dom.pauseOverlay.classList.toggle('active', pauseOpen && !mainOpen);
      if (pauseOpen && dom.pauseMetaText && global.ShiftClock && global.ShiftStats) {
        const snap = global.ShiftClock.getTimeSnapshot();
        const score = global.ShiftStats.getLiveScore();
        const scoreStr = (score < 0 ? '-' : '+') + Math.abs(score) + ' pts';
        dom.pauseMetaText.textContent = `${snap.dayName} ${snap.dateLabel} · ${snap.formatted12h} · DAY ${snap.workdayIndex}/21 · ${scoreStr}`;
      }
    }
    if (dom.saveLoadModal) {
      dom.saveLoadModal.classList.toggle('active', saveOpen);
      dom.saveLoadModal.classList.toggle('from-main-menu', mainOpen);
    }
    if (dom.infoModal) {
      dom.infoModal.classList.toggle('active', infoOpen);
    }
    if (dom.hudPauseBtn) {
      dom.hudPauseBtn.style.display = mainOpen ? 'none' : 'flex';
    }
    if (dom.mainLoadBadge && global.SaveSystem && typeof global.SaveSystem.hasAnySave === 'function') {
      const hasSave = global.SaveSystem.hasAnySave();
      dom.mainLoadBadge.textContent = hasSave ? 'READY' : 'EMPTY';
      dom.mainLoadBadge.classList.toggle('has-save', hasSave);
    }
    syncAudioControls();
  }

  function setStatusMessage(msg, isError) {
    if (!dom.slmStatus) return;
    dom.slmStatus.textContent = msg || '';
    dom.slmStatus.style.color = isError ? '#f87171' : '#4ade80';
  }

  function renderSaveLoadSlots() {
    if (!dom.slmSlotsList || !global.SaveSystem) return;
    const slots = global.SaveSystem.listSlots();
    const isSave = state.slotModalMode === 'save';

    if (dom.slmTitle) {
      dom.slmTitle.textContent = isSave ? '💾 SAVE SHIFT PROGRESS' : '📂 LOAD SHIFT PROGRESS';
    }
    if (dom.slmSubtitle) {
      dom.slmSubtitle.textContent = isSave
        ? 'Choose a manual slot (1-3) to snapshot the full dock, clock, receipts, & backstock.'
        : 'Select any saved shift (Autosave or Slots 1-3), or import a .json backup file.';
    }
    if (dom.slmExportBtn) {
      dom.slmExportBtn.style.display = (isSave || global.SaveSystem.hasAnySave()) ? 'inline-flex' : 'none';
    }
    if (dom.slmImportBtn) {
      dom.slmImportBtn.style.display = isSave ? 'none' : 'inline-flex';
    }

    dom.slmSlotsList.innerHTML = slots.map((slot) => {
      const isAuto = slot.slotId === 'autosave';
      const disableRow = (isSave && isAuto) || (!isSave && (!slot.exists || slot.corrupted));
      let detailHtml = '<span class="slm-empty-note">Empty Save Slot</span>';

      if (slot.corrupted) {
        detailHtml = '<span class="slm-corrupt-note">Corrupted Save Data</span>';
      } else if (slot.exists && slot.meta) {
        const m = slot.meta;
        const scoreVal = Number(m.liveScore) || 0;
        const scoreTxt = (scoreVal < 0 ? '-' : '+') + Math.abs(scoreVal) + ' pts';
        const stamp = formatSavedTimestamp(slot.savedAt);
        detailHtml = `
          <div class="slm-meta-main">${escapeHtml(m.dayName || '')} ${escapeHtml(m.dateLabel || '')} · <strong>${escapeHtml(m.timeLabel || '')}</strong> · Day ${escapeHtml(m.workdayIndex || 1)}/21</div>
          <div class="slm-meta-sub">Score: <span style="color:${scoreVal < 0 ? '#f87171' : '#4ade80'};font-weight:800;">${scoreTxt}</span> · Deliveries: ${Number(m.deliveriesCompleted) || 0}/${Number(m.deliveriesTotal) || 0} · Receipts: ${Number(m.receiptsCount) || 0}${stamp ? ' · Saved ' + escapeHtml(stamp) : ''}</div>
        `;
      }

      const actionLabel = isSave
        ? (isAuto ? 'AUTO ONLY' : (slot.exists ? 'OVERWRITE' : 'SAVE HERE'))
        : (slot.exists && !slot.corrupted ? 'LOAD' : 'EMPTY');

      const showExportBtn = slot.exists && !slot.corrupted;
      const showDeleteBtn = Boolean(slot.exists);

      return `
        <div class="slm-slot-row ${isAuto ? 'is-auto' : ''} ${slot.exists ? 'has-data' : ''}">
          <div class="slm-slot-info">
            <div class="slm-slot-name">${escapeHtml(slot.label)}${isAuto ? ' <span class="slm-tag">AUTOMATIC</span>' : ''}</div>
            ${detailHtml}
          </div>
          <div class="slm-slot-actions">
            ${showExportBtn ? `<button type="button" class="slm-mini-btn" data-sl-export="${escapeHtml(slot.slotId)}" title="Export JSON">⬇ JSON</button>` : ''}
            ${showDeleteBtn ? `<button type="button" class="slm-mini-btn danger" data-sl-delete="${escapeHtml(slot.slotId)}" title="Delete Save">✕</button>` : ''}
            <button type="button" class="slm-primary-btn ${isSave && !isAuto ? 'save-btn' : ''}" data-sl-pick="${escapeHtml(slot.slotId)}" ${disableRow ? 'disabled' : ''}>${actionLabel}</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function openSaveLoadModal(mode, fromOverlay) {
    state.slotModalMode = (mode === 'save') ? 'save' : 'load';
    state.returnToOverlay = fromOverlay || (global.DSDGame && global.DSDGame.isMainMenuOpen() ? 'main' : 'pause');
    setStatusMessage('', false);
    if (global.DSDGame && typeof global.DSDGame.setSaveLoadModalOpen === 'function') {
      global.DSDGame.setSaveLoadModalOpen(true);
    }
    renderSaveLoadSlots();
    syncOverlaysFromGame();
    playClick();
  }

  function closeSaveLoadModal(silent) {
    if (global.DSDGame && typeof global.DSDGame.setSaveLoadModalOpen === 'function') {
      global.DSDGame.setSaveLoadModalOpen(false);
    }
    syncOverlaysFromGame();
    if (!silent) playClick();
  }

  function openInfoModal(kind) {
    const isTutorial = kind === 'tutorial';
    if (dom.mimTitle) {
      dom.mimTitle.textContent = isTutorial ? '📘 TRAINING TUTORIAL' : 'ℹ️ ABOUT 3D DSD RECEIVING SIMULATOR';
    }
    if (dom.mimBody) {
      if (isTutorial) {
        dom.mimBody.innerHTML = `
          <div class="mim-notice-box">
            <strong>Tutorial Mode — Not Implemented Yet</strong>
            <p>An interactive step-by-step training shift is planned for a future update.</p>
          </div>
          <div class="mim-section">
            <h4>QUICK FIELD BRIEFING</h4>
            <ul>
              <li><strong>Side Door &amp; Dock Trucks:</strong> Open doors with <code>[E]</code>, let drivers in, inspect temp &amp; verify items with Handheld Scanner <code>[F]</code>, then print &amp; hand over Store Receipts.</li>
              <li><strong>Warehouse Trucks (Dept 01):</strong> Prioritize Dept 01 trailers first to avoid Priority Adherence penalties. Hitch the Electric Walkie Jack with <code>[Space]</code> and haul pallets into matching <strong>F / C / D</strong> staging zones.</li>
              <li><strong>End-of-Shift Checklist:</strong> Resolve Night Drops, Backstock Putaway &amp; Audit, Claims Totes, Recall Cart, Home Office Tasks, and Daily Paper Filing before <strong>2:00 PM</strong>.</li>
            </ul>
          </div>
        `;
      } else {
        dom.mimBody.innerHTML = `
          <div class="mim-section">
            <h4>OVERVIEW</h4>
            <p><strong>3D DSD Receiving Simulator</strong> is a first-person 1996 backroom logistics simulation built around authentic Direct Store Delivery workflows, pallet staging, cold-chain compliance, claims sorting, and daily invoice auditing.</p>
          </div>
          <div class="mim-section">
            <h4>CONTROLS (DESKTOP &amp; MOBILE)</h4>
            <ul>
              <li><strong>Desktop:</strong> Click viewport to lock mouse · <code>WASD</code> Move · <code>[E]</code> Interact / Doors / Drivers / Terminal · <code>[Space]</code> Walkie Jack / Pallets · <code>[F]</code> Handheld Scanner · <code>[ESC]</code> Pause Menu.</li>
              <li><strong>Mobile / Touch:</strong> Left thumbpad to walk · Right screen drag to look · Context action buttons appear automatically above the dock bar · Tap <strong>MENU</strong> top-right to Pause or Save.</li>
            </ul>
          </div>
          <div class="mim-section">
            <h4>SAVING ON GITHUB PAGES</h4>
            <p>Progress auto-saves in your browser's local storage every 5 in-game minutes and when leaving/hiding the tab. Use <strong>Pause → Save Game → ⬇ JSON</strong> anytime to back up or move saves across devices.</p>
          </div>
        `;
      }
    }
    if (global.DSDGame && typeof global.DSDGame.setInfoModalOpen === 'function') {
      global.DSDGame.setInfoModalOpen(true);
    }
    syncOverlaysFromGame();
    playClick();
  }

  function closeInfoModal(silent) {
    if (global.DSDGame && typeof global.DSDGame.setInfoModalOpen === 'function') {
      global.DSDGame.setInfoModalOpen(false);
    }
    syncOverlaysFromGame();
    if (!silent) playClick();
  }

  function openPauseMenu() {
    if (!global.DSDGame) return;
    if (global.DSDGame.isMainMenuOpen() || global.DSDGame.isShiftSummaryOpen()) return;
    if (document.exitPointerLock) document.exitPointerLock();
    global.DSDGame.setPauseMenuOpen(true);
    syncOverlaysFromGame();
    playClick();
  }

  function closePauseMenu(silent) {
    if (!global.DSDGame) return;
    global.DSDGame.setSaveLoadModalOpen(false);
    global.DSDGame.setInfoModalOpen(false);
    global.DSDGame.setPauseMenuOpen(false);
    syncOverlaysFromGame();
    if (!silent) playClick();
  }

  function togglePauseMenu() {
    if (!global.DSDGame) return;
    if (global.DSDGame.isSaveLoadModalOpen()) {
      closeSaveLoadModal();
      return;
    }
    if (global.DSDGame.isInfoModalOpen()) {
      closeInfoModal();
      return;
    }
    if (global.DSDGame.isMainMenuOpen() || global.DSDGame.isShiftSummaryOpen()) return;
    if (global.DSDGame.isPauseMenuOpen()) {
      closePauseMenu();
    } else {
      openPauseMenu();
    }
  }

  function bindEvents() {
    if (dom.btnNewGame) {
      dom.btnNewGame.addEventListener('click', () => {
        playSuccess();
        if (global.DSDGame && typeof global.DSDGame.startNewGame === 'function') {
          global.DSDGame.startNewGame();
        }
        syncOverlaysFromGame();
      });
    }

    if (dom.btnMainLoad) {
      dom.btnMainLoad.addEventListener('click', () => {
        openSaveLoadModal('load', 'main');
      });
    }

    if (dom.btnTutorial) {
      dom.btnTutorial.addEventListener('click', () => {
        openInfoModal('tutorial');
      });
    }

    if (dom.btnAbout) {
      dom.btnAbout.addEventListener('click', () => {
        openInfoModal('about');
      });
    }

    if (dom.hudPauseBtn) {
      const handlePausePress = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPauseMenu();
      };
      dom.hudPauseBtn.addEventListener('click', handlePausePress);
      dom.hudPauseBtn.addEventListener('touchend', handlePausePress, { passive: false });
    }

    if (dom.btnResume) {
      dom.btnResume.addEventListener('click', () => {
        closePauseMenu();
      });
    }

    if (dom.btnPauseSave) {
      dom.btnPauseSave.addEventListener('click', () => {
        openSaveLoadModal('save', 'pause');
      });
    }

    if (dom.btnPauseLoad) {
      dom.btnPauseLoad.addEventListener('click', () => {
        openSaveLoadModal('load', 'pause');
      });
    }

    if (dom.btnReturnMain) {
      dom.btnReturnMain.addEventListener('click', () => {
        playClick();
        if (global.DSDGame && typeof global.DSDGame.returnToMainMenu === 'function') {
          global.DSDGame.returnToMainMenu();
        }
        syncOverlaysFromGame();
      });
    }

    if (dom.btnPauseMute) {
      dom.btnPauseMute.addEventListener('click', () => {
        if (global.SoundSystem && typeof global.SoundSystem.toggleMute === 'function') {
          global.SoundSystem.toggleMute();
          syncAudioControls();
          playClick();
        }
      });
    }

    if (dom.pauseVolSlider) {
      dom.pauseVolSlider.addEventListener('input', () => {
        if (global.SoundSystem && typeof global.SoundSystem.setSettings === 'function') {
          const v = Math.max(0, Math.min(1, Number(dom.pauseVolSlider.value) / 100));
          global.SoundSystem.setSettings({ masterVolume: v, muted: v === 0 ? true : false });
          syncAudioControls();
        }
      });
    }

    if (dom.btnPauseGfx) {
      dom.btnPauseGfx.addEventListener('click', () => {
        if (global.DSDGraphics && typeof global.DSDGraphics.cycleQuality === 'function') {
          global.DSDGraphics.cycleQuality();
          syncAudioControls();
          playClick();
        }
      });
    }

    if (dom.btnPauseFpsHud) {
      dom.btnPauseFpsHud.addEventListener('click', () => {
        if (global.DSDGraphics && typeof global.DSDGraphics.toggleFpsHud === 'function') {
          global.DSDGraphics.toggleFpsHud();
          syncAudioControls();
          playClick();
        }
      });
    }

    if (dom.slmCloseBtn) {
      dom.slmCloseBtn.addEventListener('click', () => closeSaveLoadModal());
    }

    if (dom.mimCloseBtn) {
      dom.mimCloseBtn.addEventListener('click', () => closeInfoModal());
    }

    if (dom.slmSlotsList) {
      dom.slmSlotsList.addEventListener('click', (e) => {
        const pickBtn = e.target.closest('[data-sl-pick]');
        if (pickBtn) {
          const slotId = pickBtn.getAttribute('data-sl-pick');
          if (state.slotModalMode === 'save') {
            const res = global.SaveSystem.saveGame(slotId);
            if (res.ok) {
              playSuccess();
              setStatusMessage(`Saved to ${res.label} (${res.meta.dateLabel} · ${res.meta.timeLabel})`, false);
              renderSaveLoadSlots();
            } else {
              playError();
              setStatusMessage('Save failed: ' + (res.error || 'Unknown error'), true);
            }
          } else {
            const res = global.SaveSystem.loadGame(slotId);
            if (res.ok) {
              playSuccess();
              closeSaveLoadModal(true);
              closePauseMenu(true);
              if (global.DSDGame && typeof global.DSDGame.syncAfterLoad === 'function') {
                global.DSDGame.syncAfterLoad();
              }
              syncOverlaysFromGame();
            } else {
              playError();
              setStatusMessage('Load failed: ' + (res.error || 'Unable to load slot'), true);
            }
          }
          return;
        }

        const expBtn = e.target.closest('[data-sl-export]');
        if (expBtn && global.SaveSystem) {
          const slotId = expBtn.getAttribute('data-sl-export');
          const res = global.SaveSystem.downloadSaveFile(slotId);
          if (res.ok) {
            playClick();
            setStatusMessage(`Exported ${res.filename}`, false);
          } else {
            playError();
            setStatusMessage('Export failed: ' + (res.error || 'Unknown error'), true);
          }
          return;
        }

        const delBtn = e.target.closest('[data-sl-delete]');
        if (delBtn && global.SaveSystem) {
          const slotId = delBtn.getAttribute('data-sl-delete');
          global.SaveSystem.deleteSave(slotId);
          playClick();
          setStatusMessage(`Deleted ${slotId.toUpperCase()}`, false);
          renderSaveLoadSlots();
          syncOverlaysFromGame();
        }
      });
    }

    if (dom.slmExportBtn && global.SaveSystem) {
      dom.slmExportBtn.addEventListener('click', () => {
        const res = global.SaveSystem.downloadSaveFile(null);
        if (res.ok) {
          playClick();
          setStatusMessage(`Downloaded ${res.filename}`, false);
        } else {
          playError();
          setStatusMessage('Export failed: ' + (res.error || 'Unknown error'), true);
        }
      });
    }

    if (dom.slmImportBtn && dom.slmImportFile) {
      dom.slmImportBtn.addEventListener('click', () => {
        playClick();
        dom.slmImportFile.value = '';
        dom.slmImportFile.click();
      });
      dom.slmImportFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const res = global.SaveSystem.importSaveJson(String(reader.result || ''), {
            targetSlot: 'autosave',
            loadImmediately: true
          });
          if (res.ok) {
            playSuccess();
            closeSaveLoadModal(true);
            closePauseMenu(true);
            if (global.DSDGame && typeof global.DSDGame.syncAfterLoad === 'function') {
              global.DSDGame.syncAfterLoad();
            }
            syncOverlaysFromGame();
          } else {
            playError();
            setStatusMessage('Import failed: ' + (res.error || 'Invalid save file'), true);
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function init() {
    cacheDom();
    if (!state.initialized) {
      state.initialized = true;
      bindEvents();
    }
    syncOverlaysFromGame();
  }

  global.DSDMenuUI = {
    init: init,
    syncOverlaysFromGame: syncOverlaysFromGame,
    openPauseMenu: openPauseMenu,
    closePauseMenu: closePauseMenu,
    togglePauseMenu: togglePauseMenu,
    openSaveLoadModal: openSaveLoadModal,
    closeSaveLoadModal: closeSaveLoadModal,
    openInfoModal: openInfoModal,
    closeInfoModal: closeInfoModal
  };
})(window);
