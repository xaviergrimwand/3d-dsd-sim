(function (global) {
  'use strict';

  /**
   * DSDGame - Host-facing orchestrator for New 3D Game (3D DSD Receiving Simulator).
   * Coordinates ShiftClock, ShiftStats, HUD updates, shift end/reset lifecycle,
   * and modular subsystem hooks (Phases 0-5).
   */
  const state = {
    initialized: false,
    shiftSummaryOpen: false,
    systemMenuOpen: false, // Reserved for a future in-game system/pause menu (not active yet)
    hooks: {
      showAlert: null,
      showNotification: null,
      playDoorAlarm: null,
      playSuccessChime: null,
      getUnfinishedWork: null,
      onResetShift: []
    },
    dom: {}
  };

  function cacheDom() {
    state.dom = {
      clockTime: document.getElementById('hud-shift-time'),
      clockDate: document.getElementById('hud-shift-date'),
      rdcLeadZero: document.getElementById('rdc-lead-zero'),
      rdcHourMain: document.getElementById('rdc-hour-main'),
      rdcMinute: document.getElementById('rdc-minute'),
      rdcColon: document.getElementById('rdc-colon'),
      rdcIndAm: document.getElementById('rdc-ind-am'),
      rdcIndPm: document.getElementById('rdc-ind-pm'),
      rdcProgress: document.getElementById('rdc-shift-progress'),
      rdcDow: document.getElementById('rdc-dow'),
      rdcMonDay: document.getElementById('rdc-mon-day'),
      rdcYear: document.getElementById('rdc-year'),
      scoreValue: document.getElementById('hud-shift-score'),
      endShiftBtn: document.getElementById('end-shift-btn'),
      summaryModal: document.getElementById('shift-summary-modal'),
      summarySubtitle: document.getElementById('summary-shift-subtitle'),
      summaryRank: document.getElementById('summary-shift-rank'),
      summaryVendors: document.getElementById('summary-vendors-val'),
      summaryTrucks: document.getElementById('summary-trucks-val'),
      summaryNightDrops: document.getElementById('summary-nightdrops-val'),
      summaryTasks: document.getElementById('summary-tasks-val'),
      summaryChecklist: document.getElementById('summary-checklist-val'),
      summaryCompliance: document.getElementById('summary-compliance-val'),
      summaryErrors: document.getElementById('summary-errors-val'),
      summaryTotal: document.getElementById('summary-total-val'),
      summaryWarnings: document.getElementById('summary-unfinished-list'),
      nextShiftBtn: document.getElementById('btn-next-shift')
    };
  }

  function updateHud() {
    if (!global.ShiftClock || !global.ShiftStats) return;
    const snap = global.ShiftClock.getTimeSnapshot();
    const score = global.ShiftStats.getLiveScore();
    const d = state.dom;

    if (d.clockTime) {
      d.clockTime.textContent = snap.formatted12h;
      d.clockTime.style.color = snap.afterNoon ? '#f59e0b' : '#38bdf8';
    }
    if (d.clockDate) {
      d.clockDate.textContent = snap.dateLabel + ' · DAY ' + snap.workdayIndex + '/21';
    }
    if (d.rdcHourMain) {
      const h12 = snap.hour12 || 6;
      if (d.rdcLeadZero) {
        d.rdcLeadZero.style.visibility = h12 < 10 ? 'visible' : 'hidden';
        d.rdcLeadZero.style.width = h12 < 10 ? 'auto' : '0px';
      }
      d.rdcHourMain.textContent = String(h12);
    }
    if (d.rdcMinute) {
      d.rdcMinute.textContent = String(snap.minute).padStart(2, '0');
    }
    if (d.rdcColon) {
      d.rdcColon.style.opacity = (Math.floor(Date.now() / 500) % 2 === 0) ? '1' : '0.28';
    }
    if (d.rdcIndAm) d.rdcIndAm.classList.toggle('on', snap.amPm === 'AM');
    if (d.rdcIndPm) d.rdcIndPm.classList.toggle('on', snap.amPm === 'PM');
    if (d.rdcProgress) {
      d.rdcProgress.style.width = Math.round((snap.progressPct || 0) * 100) + '%';
    }
    if (d.rdcDow) d.rdcDow.textContent = snap.dayName || 'MON';
    if (d.rdcMonDay) d.rdcMonDay.textContent = (snap.monthName || 'JAN') + ' ' + (snap.dayOfMonth || '01');
    if (d.rdcYear) d.rdcYear.textContent = String(snap.year || 1996);

    if (d.scoreValue) {
      d.scoreValue.textContent = (score < 0 ? '-' : '') + Math.abs(score) + ' pts';
      d.scoreValue.style.color = score < 0 ? '#ef4444' : '#22c55e';
    }
    if (d.endShiftBtn) {
      // Matches 2D game: END DAY button unlocks starting at 12:00 PM
      d.endShiftBtn.style.display = (snap.afterNoon && !snap.shiftEnded) ? 'inline-block' : 'none';
    }
  }

  function renderShiftSummary(summary, reason) {
    const d = state.dom;
    const snap = global.ShiftClock.getTimeSnapshot();
    const b = summary.breakdown;
    const st = summary.stats;

    if (d.summarySubtitle) {
      const reasonText = reason === 'clock_reached_end' ? 'SHIFT ENDED AT 2:00 PM' : 'SHIFT CONCLUDED EARLY';
      d.summarySubtitle.textContent = snap.dateLabel + ' (DAY ' + snap.workdayIndex + '/21) — ' + reasonText;
    }
    if (d.summaryRank) {
      d.summaryRank.textContent = summary.rank.label;
      d.summaryRank.style.color = summary.rank.color;
    }
    if (d.summaryVendors) d.summaryVendors.textContent = st.vendorsProcessed + ' (+' + b.vendorsScore + ')';
    if (d.summaryTrucks) d.summaryTrucks.textContent = (st.trucksProcessed + st.warehouseTrucksProcessed) + ' (+' + b.trucksScore + ')';
    if (d.summaryNightDrops) d.summaryNightDrops.textContent = st.nightDropsProcessed + ' (+' + b.nightDropScore + ')';
    if (d.summaryTasks) d.summaryTasks.textContent = (st.tasksCompleted + st.recallsCompleted) + ' (+' + b.tasksScore + ')';
    if (d.summaryChecklist) {
      const checks = [
        st.filingDone ? 'Filing ✓' : 'Filing ✗',
        st.backstockPutAway ? 'Putaway ✓' : 'Putaway ✗',
        st.backstockInventoried ? 'Audit ✓' : 'Audit ✗'
      ].join(' · ');
      d.summaryChecklist.textContent = checks + ' (+' + b.checklistScore + ')';
    }
    if (d.summaryCompliance) d.summaryCompliance.textContent = '-' + b.compliancePenalty + ' pts';
    if (d.summaryErrors) d.summaryErrors.textContent = '-' + b.operationalErrorsPenalty + ' pts';
    if (d.summaryTotal) {
      d.summaryTotal.textContent = summary.totalScore + ' pts';
      d.summaryTotal.style.color = summary.totalScore >= 0 ? '#22c55e' : '#ef4444';
    }

    if (d.summaryWarnings) {
      d.summaryWarnings.innerHTML = '';
      if (summary.endOfDayDetails.length > 0) {
        summary.endOfDayDetails.forEach((msg) => {
          const li = document.createElement('li');
          li.textContent = msg;
          d.summaryWarnings.appendChild(li);
        });
        d.summaryWarnings.style.display = 'block';
      } else {
        d.summaryWarnings.style.display = 'none';
      }
    }

    if (d.nextShiftBtn) {
      const isLastDay = snap.workdayIndex >= 21;
      d.nextShiftBtn.textContent = isLastDay ? 'COMPLETE FEBRUARY CAMPAIGN' : 'START NEXT SHIFT';
    }
  }

  function endShift(reason) {
    if (state.shiftSummaryOpen) return;
    state.shiftSummaryOpen = true;
    global.ShiftClock.setPaused(true);

    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (_) {}
    }

    const unfinished = Object.assign(
      {
        outstandingNightDrops: (global.DSDReceipts && typeof global.DSDReceipts.getOutstandingNightDropCount === 'function')
          ? global.DSDReceipts.getOutstandingNightDropCount()
          : 0
      },
      typeof state.hooks.getUnfinishedWork === 'function' ? state.hooks.getUnfinishedWork() : {}
    );
    const summary = global.ShiftStats.computeShiftSummary(unfinished);
    renderShiftSummary(summary, reason || 'manual');

    if (state.dom.summaryModal) {
      state.dom.summaryModal.style.display = 'flex';
    }
    if (typeof state.hooks.playSuccessChime === 'function') {
      state.hooks.playSuccessChime();
    }
    updateHud();
  }

  function startNextShift() {
    const advanced = global.ShiftClock.advanceWorkday();
    if (!advanced) {
      if (typeof state.hooks.showNotification === 'function') {
        state.hooks.showNotification('ALL 21 WORKING DAYS OF FEBRUARY 1996 COMPLETED! Starting new month.');
      }
      global.ShiftClock.init();
    }

    global.ShiftStats.resetDailyStats();
    state.shiftSummaryOpen = false;
    global.ShiftClock.setPaused(false);

    if (state.dom.summaryModal) {
      state.dom.summaryModal.style.display = 'none';
    }

    state.hooks.onResetShift.forEach((fn) => {
      try { fn(); } catch (err) { console.error('onResetShift error:', err); }
    });

    updateHud();
  }

  function formatDoorLabel(doorKey) {
    if (doorKey === 'side') return 'Side Rollup Door';
    if (doorKey && doorKey.indexOf('dock') === 0) return 'Dock Bay ' + doorKey.slice(4);
    return String(doorKey || 'Dock Door');
  }

  function bindEvents() {
    if (state.dom.endShiftBtn) {
      state.dom.endShiftBtn.addEventListener('click', () => endShift('manual'));
    }
    if (state.dom.nextShiftBtn) {
      state.dom.nextShiftBtn.addEventListener('click', startNextShift);
    }

    global.ShiftClock.on('onDoorWarning', (evt) => {
      if (typeof state.hooks.showAlert === 'function') {
        state.hooks.showAlert('SECURITY ADVISORY: ' + formatDoorLabel(evt.doorKey) + ' open unattended 5+ in-game min!');
      }
    });

    global.ShiftClock.on('onDoorPenalty', (evt) => {
      if (evt.prolonged) {
        global.ShiftStats.increment('doorOpenProlongedPenalties', 1);
      } else {
        global.ShiftStats.increment('doorOpenPenalties', 1);
      }
      if (typeof state.hooks.playDoorAlarm === 'function') {
        state.hooks.playDoorAlarm();
      }
      if (typeof state.hooks.showAlert === 'function') {
        const pts = evt.prolonged ? '-100' : '-200';
        state.hooks.showAlert('SECURITY PENALTY (' + pts + ' pts): ' + formatDoorLabel(evt.doorKey) + ' left open unattended!');
      }
      updateHud();
    });

    global.ShiftClock.on('onShiftEnd', (evt) => {
      endShift(evt.reason || 'clock_reached_end');
    });
  }

  function init(hooks) {
    if (hooks && typeof hooks === 'object') {
      if (hooks.showAlert) state.hooks.showAlert = hooks.showAlert;
      if (hooks.showNotification) state.hooks.showNotification = hooks.showNotification;
      if (hooks.playDoorAlarm) state.hooks.playDoorAlarm = hooks.playDoorAlarm;
      if (hooks.playSuccessChime) state.hooks.playSuccessChime = hooks.playSuccessChime;
      if (hooks.getUnfinishedWork) state.hooks.getUnfinishedWork = hooks.getUnfinishedWork;
      if (typeof hooks.onResetShift === 'function') state.hooks.onResetShift.push(hooks.onResetShift);
    }

    if (state.initialized) {
      updateHud();
      return;
    }
    state.initialized = true;
    cacheDom();
    bindEvents();
    updateHud();
  }

  function registerResetHandler(fn) {
    if (typeof fn === 'function') {
      state.hooks.onResetShift.push(fn);
    }
  }

  function isModalOpen() {
    return state.shiftSummaryOpen || state.systemMenuOpen;
  }

  function isSystemPaused() {
    return state.systemMenuOpen;
  }

  function setSystemPaused(paused) {
    state.systemMenuOpen = Boolean(paused);
    if (global.ShiftClock && typeof global.ShiftClock.setSystemPaused === 'function') {
      global.ShiftClock.setSystemPaused(state.systemMenuOpen);
    }
  }

  global.DSDGame = {
    init: init,
    updateHud: updateHud,
    endShift: endShift,
    startNextShift: startNextShift,
    registerResetHandler: registerResetHandler,
    isModalOpen: isModalOpen,
    isSystemPaused: isSystemPaused,
    setSystemPaused: setSystemPaused
  };
})(window);
