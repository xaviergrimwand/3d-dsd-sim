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
    systemMenuOpen: false,
    mainMenuOpen: true,
    saveLoadModalOpen: false,
    infoModalOpen: false,
    noonPunchOutNotified: false,
    hooks: {
      showAlert: null,
      showNotification: null,
      playDoorAlarm: null,
      playSuccessChime: null,
      playButtonClick: null,
      getUnfinishedWork: null,
      onNewGame: null,
      onMenuStateChange: null,
      onHudUpdate: null,
      onResetShift: []
    },
    dom: {}
  };

  function cacheDom() {
    state.dom = {
      clockTime: document.getElementById('hud-shift-time'),
      clockDate: document.getElementById('hud-shift-date'),
      retroClock: document.getElementById('retro-digital-clock'),
      clockCalendar: document.getElementById('hud-clock-calendar'),
      clockCalGrid: document.getElementById('hud-clock-cal-grid'),
      clockCalWorkday: document.getElementById('hud-cal-workday'),
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
      statNd: document.getElementById('hud-stat-nd'),
      statSd: document.getElementById('hud-stat-sd'),
      statVt: document.getElementById('hud-stat-vt'),
      statWh: document.getElementById('hud-stat-wh'),
      statTs: document.getElementById('hud-stat-ts'),
      remPill: document.getElementById('hud-rem-pill'),
      remPillLbl: document.getElementById('hud-rem-pill-lbl'),
      remTotal: document.getElementById('hud-rem-total'),
      remSd: document.getElementById('hud-rem-sd'),
      remVt: document.getElementById('hud-rem-vt'),
      remWh: document.getElementById('hud-rem-wh'),
      remTs: document.getElementById('hud-rem-ts'),
      remCl: document.getElementById('hud-rem-cl'),
      remOs: document.getElementById('hud-rem-os'),
      remInv: document.getElementById('hud-rem-inv'),
      remFile: document.getElementById('hud-rem-file'),
      remTracker: document.getElementById('hud-remaining-tracker'),
      remLegend: document.getElementById('hud-remaining-legend'),
      remLegendGrid: document.getElementById('hud-rem-legend-grid'),
      scoreValue: document.getElementById('hud-shift-score'),
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

  function updateRemainingCell(valEl, count, isFlag) {
    if (!valEl) return;
    let done = false;
    let remaining = 0;
    let text = '';
    if (isFlag) {
      done = Boolean(count);
      remaining = done ? 0 : 1;
      text = done ? 'Y' : 'N';
    } else {
      remaining = Math.max(0, Number(count) || 0);
      done = remaining === 0;
      text = done ? '✓' : String(remaining);
    }
    const remStr = String(remaining);
    if (valEl.dataset.count !== remStr || valEl.textContent !== text) {
      valEl.textContent = text;
      valEl.dataset.count = remStr;
      const cell = valEl.closest ? valEl.closest('.rem-cell') : valEl.parentElement;
      if (cell) cell.classList.toggle('is-done', done);
    }
  }

  let lastHudTimeKey = '';
  let lastHudStatsKey = '';
  let lastCalRenderKey = '';

  function buildFebruaryCalendarCells(snap) {
    const s = snap || {};
    const mon = String(s.monthName || 'FEB').toUpperCase();
    const curDay = mon === 'FEB' ? (parseInt(s.dayOfMonth, 10) || 1) : (mon === 'MAR' ? 30 : 0);
    const shiftDone = Boolean(s.shiftEnded || s.campaignComplete);
    const cells = [];

    // 5-week grid for February 1996 starting Sunday Jan 28 through Saturday Mar 2 (35 cells)
    for (let offset = -3; offset <= 31; offset++) {
      const dt = new Date(1996, 1, offset); // month 1 = Feb (offset <= 0 gives Jan 28..31; offset >= 30 gives Mar 1..2)
      const cellMonth = dt.getMonth();
      const dayNum = dt.getDate();
      const dow = dt.getDay();
      const isWeekend = (dow === 0 || dow === 6);
      const isPrevJan = cellMonth === 0;
      const isFeb = cellMonth === 1;
      const isTrailing = cellMonth === 2;
      const isWorkday = !isWeekend && (isFeb || isPrevJan);
      const isToday = Boolean(isFeb && mon === 'FEB' && dayNum === curDay);
      const isCompleted = isPrevJan
        ? !isWeekend
        : (isFeb && !isWeekend && (dayNum < curDay || (dayNum === curDay && shiftDone)));

      cells.push({
        month: cellMonth,
        day: dayNum,
        dow: dow,
        isWeekend: isWeekend,
        isPrevJan: isPrevJan,
        isFeb: isFeb,
        isTrailing: isTrailing,
        isWorkday: isWorkday,
        isToday: isToday,
        completed: isCompleted
      });
    }
    return cells;
  }

  function renderClockCalendar(snap) {
    const d = state.dom;
    if (!d.clockCalGrid) return;
    const s = snap || (global.ShiftClock ? global.ShiftClock.getTimeSnapshot() : {});
    const curDay = parseInt(s.dayOfMonth, 10) || 1;
    const calKey = `${s.monthName || 'FEB'}|${curDay}|${s.workdayIndex || 1}|${s.shiftEnded ? 1 : 0}|${s.campaignComplete ? 1 : 0}`;
    if (calKey === lastCalRenderKey && d.clockCalGrid.children.length > 0) return;
    lastCalRenderKey = calKey;

    if (d.clockCalWorkday) {
      d.clockCalWorkday.textContent = 'DAY ' + (s.workdayIndex || 1) + '/21';
    }

    const cells = buildFebruaryCalendarCells(s);
    const svgNs = 'http://www.w3.org/2000/svg';
    d.clockCalGrid.innerHTML = '';

    cells.forEach((cell) => {
      const el = document.createElement('div');
      const cls = ['cal-cell'];
      if (cell.isWeekend) cls.push('is-weekend');
      if (cell.isWorkday) cls.push('is-workday');
      if (cell.isPrevJan) cls.push('is-other-month');
      if (cell.isTrailing) cls.push('is-trailing');
      if (cell.isToday) cls.push('is-today');
      if (cell.completed) cls.push('is-completed');
      el.className = cls.join(' ');
      el.setAttribute('data-cal-month', String(cell.month));
      el.setAttribute('data-cal-day', String(cell.day));

      const numSpan = document.createElement('span');
      numSpan.className = 'cal-day-num';
      numSpan.textContent = String(cell.day);
      el.appendChild(numSpan);

      if (cell.completed) {
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('class', 'cal-x-mark');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', 'M5 5L19 19M19 5L5 19');
        svg.appendChild(path);
        el.appendChild(svg);
      }

      d.clockCalGrid.appendChild(el);
    });
  }

  let lastHudColonOn = null;

  function updateHud(force) {
    if (!global.ShiftClock || !global.ShiftStats) return;
    const snap = global.ShiftClock.getTimeSnapshot();
    const st = global.ShiftStats.getStats();
    const score = global.ShiftStats.getLiveScore();
    const d = state.dom;

    const colonOn = (Math.floor(Date.now() / 500) % 2 === 0);
    if (d.rdcColon && (force || colonOn !== lastHudColonOn)) {
      lastHudColonOn = colonOn;
      d.rdcColon.style.opacity = colonOn ? '1' : '0.28';
    }
    const pctInt = Math.round((snap.progressPct || 0) * 100);
    const timeKey = `${snap.formatted12h}|${snap.dateLabel}|${snap.workdayIndex}|${pctInt}|${snap.afterNoon ? 1 : 0}|${snap.overtime ? 1 : 0}|${snap.shiftEnded ? 1 : 0}`;
    if (force || timeKey !== lastHudTimeKey) {
      lastHudTimeKey = timeKey;
      if (d.clockTime) {
        d.clockTime.textContent = snap.formatted12h;
      }
      if (d.retroClock) {
        d.retroClock.classList.toggle('is-overtime', Boolean(snap.overtime));
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
      if (d.rdcIndAm) d.rdcIndAm.classList.toggle('on', snap.amPm === 'AM');
      if (d.rdcIndPm) d.rdcIndPm.classList.toggle('on', snap.amPm === 'PM');
      if (d.rdcProgress) {
        d.rdcProgress.style.width = pctInt + '%';
      }
      if (d.rdcDow) d.rdcDow.textContent = snap.dayName || 'MON';
      if (d.rdcMonDay) d.rdcMonDay.textContent = (snap.monthName || 'JAN') + ' ' + (snap.dayOfMonth || '01');
      if (d.rdcYear) d.rdcYear.textContent = String(snap.year || 1996);
      renderClockCalendar(snap);
      if (snap.afterNoon && !snap.shiftEnded && !state.noonPunchOutNotified) {
        state.noonPunchOutNotified = true;
        if (typeof state.hooks.showNotification === 'function') {
          state.hooks.showNotification('[[ico:clock]] 12:00 PM — Walk to the Hallway Timeclock [E] when ready to punch out for end of shift.', 'high');
        }
      }
    }

    const rows = (global.WarehouseTrucks && typeof global.WarehouseTrucks.getScheduleRows === 'function')
      ? global.WarehouseTrucks.getScheduleRows()
      : [];
    let remSd = 0;
    let remVt = 0;
    let remWh = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.completed || r.refused) continue;
      if (r.type === 'sidedoor') remSd += 1;
      else if (r.type === 'vendor_truck') remVt += 1;
      else if (r.type === 'warehouse') remWh += 1;
    }
    const remTs = (global.DSDReceipts && typeof global.DSDReceipts.getPendingHomeOfficeTaskCount === 'function')
      ? global.DSDReceipts.getPendingHomeOfficeTaskCount()
      : 0;
    const remCl = (global.ClaimsTotes && typeof global.ClaimsTotes.getRemainingClaimsCount === 'function')
      ? global.ClaimsTotes.getRemainingClaimsCount()
      : 0;
    const remOs = (global.BackstockRacks && typeof global.BackstockRacks.getUnslottedOverstockCount === 'function')
      ? global.BackstockRacks.getUnslottedOverstockCount()
      : 0;
    const invDone = Boolean(st.backstockInventoried);
    const fileDone = Boolean(st.filingDone);
    const remTotal = remSd + remVt + remWh + remTs + remCl + remOs + (invDone ? 0 : 1) + (fileDone ? 0 : 1);

    const statsKey = `${st.nightDropsProcessed}|${st.vendorsProcessed}|${st.trucksProcessed}|${st.warehouseTrucksProcessed}|${st.tasksCompleted}|${score}|${remSd}|${remVt}|${remWh}|${remTs}|${remCl}|${remOs}|${invDone ? 1 : 0}|${fileDone ? 1 : 0}`;
    if (force || statsKey !== lastHudStatsKey) {
      lastHudStatsKey = statsKey;
      if (d.statNd) d.statNd.textContent = String(Number(st.nightDropsProcessed) || 0);
      if (d.statSd) d.statSd.textContent = String(Number(st.vendorsProcessed) || 0);
      if (d.statVt) d.statVt.textContent = String(Number(st.trucksProcessed) || 0);
      if (d.statWh) d.statWh.textContent = String(Number(st.warehouseTrucksProcessed) || 0);
      if (d.statTs) d.statTs.textContent = String(Number(st.tasksCompleted) || 0);
      if (d.scoreValue) {
        d.scoreValue.textContent = (score < 0 ? '-' : '') + Math.abs(score);
        d.scoreValue.style.color = score < 0 ? '#ef4444' : '#22c55e';
      }
      if (d.remTotal || d.remSd || d.remVt || d.remWh || d.remTs || d.remCl || d.remOs || d.remInv || d.remFile) {
        updateRemainingCell(d.remSd, remSd, false);
        updateRemainingCell(d.remVt, remVt, false);
        updateRemainingCell(d.remWh, remWh, false);
        updateRemainingCell(d.remTs, remTs, false);
        updateRemainingCell(d.remCl, remCl, false);
        updateRemainingCell(d.remOs, remOs, false);
        updateRemainingCell(d.remInv, invDone, true);
        updateRemainingCell(d.remFile, fileDone, true);
        if (d.remTotal) {
          d.remTotal.textContent = String(remTotal);
        }
        if (d.remPill) {
          d.remPill.classList.toggle('is-all-clear', remTotal === 0);
        }
        if (d.remPillLbl) {
          d.remPillLbl.textContent = remTotal === 0 ? '✓ CLEAR' : 'LEFT';
        }
      }
    }
    if (typeof state.hooks.onHudUpdate === 'function') {
      state.hooks.onHudUpdate(snap, st, score);
    }
  }

  function renderShiftSummary(summary, reason) {
    const d = state.dom;
    const snap = global.ShiftClock.getTimeSnapshot();
    const b = summary.breakdown;
    const st = summary.stats;

    if (d.summarySubtitle) {
      let reasonText = 'SHIFT CONCLUDED (' + snap.formatted12h + ')';
      if (reason === 'hard_cutoff_3pm' || reason === 'clock_reached_end') {
        reasonText = '3:00 PM HARD CUTOFF (AUTO PUNCH-OUT)';
      } else if (reason === 'timeclock') {
        reasonText = 'PUNCHED OUT AT TIMECLOCK (' + snap.formatted12h + (snap.overtime ? ' · OVERTIME' : '') + ')';
      }
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
      try { document.exitPointerLock(); } catch (_) { }
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
    renderShiftSummary(summary, reason || 'timeclock');

    if (state.dom.summaryModal) {
      state.dom.summaryModal.style.display = 'flex';
    }
    syncClockPauseFlag();
    if (typeof state.hooks.playSuccessChime === 'function') {
      state.hooks.playSuccessChime();
    }
    updateHud(true);
  }

  function startNextShift() {
    if (typeof state.hooks.playButtonClick === 'function') {
      state.hooks.playButtonClick();
    }
    const advanced = global.ShiftClock.advanceWorkday();
    if (!advanced) {
      if (typeof state.hooks.showNotification === 'function') {
        state.hooks.showNotification('ALL 21 WORKING DAYS OF FEBRUARY 1996 COMPLETED! Starting new month.');
      }
      global.ShiftClock.init();
    }

    global.ShiftStats.resetDailyStats();
    state.shiftSummaryOpen = false;
    state.noonPunchOutNotified = false;
    global.ShiftClock.setPaused(false);
    syncClockPauseFlag();

    if (state.dom.summaryModal) {
      state.dom.summaryModal.style.display = 'none';
    }

    state.hooks.onResetShift.forEach((fn) => {
      try { fn(); } catch (err) { console.error('onResetShift error:', err); }
    });

    if (global.SaveSystem && typeof global.SaveSystem.triggerAutosave === 'function') {
      global.SaveSystem.triggerAutosave('shift_transition');
    }

    updateHud();
  }

  function formatDoorLabel(doorKey) {
    if (doorKey === 'side') return 'Side Rollup Door';
    if (doorKey && doorKey.indexOf('dock') === 0) return 'Dock Bay ' + doorKey.slice(4);
    return String(doorKey || 'Dock Door');
  }

  const popoverClosers = [];

  function registerCommandBarPopoverCloser(fn) {
    if (typeof fn === 'function' && !popoverClosers.includes(fn)) {
      popoverClosers.push(fn);
    }
  }

  function closeAllCommandBarPopovers(exceptFn) {
    popoverClosers.forEach((fn) => {
      if (fn !== exceptFn) fn(false);
    });
  }

  function setRemainingLegendOpen(open) {
    const tracker = state.dom.remTracker;
    const legend = state.dom.remLegend;
    if (!tracker || !legend) return;
    const isOpen = Boolean(open);
    if (isOpen) closeAllCommandBarPopovers(setRemainingLegendOpen);
    tracker.classList.toggle('legend-open', isOpen);
    tracker.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    legend.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  function setClockCalendarOpen(open) {
    const clockEl = state.dom.retroClock;
    const calEl = state.dom.clockCalendar;
    if (!clockEl || !calEl) return;
    const isOpen = Boolean(open);
    if (isOpen) {
      closeAllCommandBarPopovers(setClockCalendarOpen);
      renderClockCalendar();
    }
    clockEl.classList.toggle('calendar-open', isOpen);
    clockEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    calEl.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  function toggleRemainingLegend() {
    const tracker = state.dom.remTracker;
    if (!tracker) return false;
    const next = !tracker.classList.contains('legend-open');
    setRemainingLegendOpen(next);
    return next;
  }

  function toggleClockCalendar() {
    const clockEl = state.dom.retroClock;
    if (!clockEl) return false;
    const next = !clockEl.classList.contains('calendar-open');
    setClockCalendarOpen(next);
    return next;
  }

  function bindCommandBarPopover(host, popover, openClass, popoverSelector, setOpenFn) {
    if (!host || !popover || host.dataset.popoverBound === '1') return;
    host.dataset.popoverBound = '1';
    registerCommandBarPopoverCloser(setOpenFn);

    let lastTouchMs = 0;
    function isTouchOnlyMode() {
      if (Date.now() - lastTouchMs < 900) return true;
      if (global.matchMedia && global.matchMedia('(pointer: coarse)').matches && !global.matchMedia('(any-pointer: fine)').matches) {
        return true;
      }
      return false;
    }

    host.addEventListener('touchstart', () => {
      lastTouchMs = Date.now();
    }, { passive: true });

    host.addEventListener('mouseenter', () => {
      if (isTouchOnlyMode()) return;
      setOpenFn(true);
    });
    host.addEventListener('mouseleave', () => {
      if (isTouchOnlyMode()) return;
      setOpenFn(false);
    });

    host.addEventListener('click', (e) => {
      if (e && e.target && e.target.closest && e.target.closest(popoverSelector)) return;
      if (!isTouchOnlyMode()) return;
      e.stopPropagation();
      const next = !host.classList.contains(openClass);
      setOpenFn(next);
      if (next && typeof host.focus === 'function') {
        try { host.focus({ preventScroll: true }); } catch (_) { host.focus(); }
      }
    });

    host.addEventListener('focusout', (e) => {
      if (e && e.relatedTarget && host.contains(e.relatedTarget)) return;
      setOpenFn(false);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!host.classList.contains(openClass)) return;
      if (!e || !e.target || !host.contains(e.target)) {
        setOpenFn(false);
      }
    }, true);
    global.addEventListener('blur', () => setOpenFn(false));
    global.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && host.classList.contains(openClass)) {
        setOpenFn(false);
      }
    });
  }

  function bindRemainingLegend() {
    const tracker = state.dom.remTracker;
    const legend = state.dom.remLegend;
    const grid = state.dom.remLegendGrid;
    if (!tracker || !legend || tracker.dataset.popoverBound === '1') return;

    if (grid && grid.children.length === 0) {
      tracker.querySelectorAll('.rem-table .rem-cell').forEach((cell) => {
        const catCls = Array.from(cell.classList).find((c) => c.indexOf('rem-cat-') === 0) || '';
        const ico = cell.querySelector('.rem-ico svg');
        const label = cell.getAttribute('data-legend') || cell.getAttribute('aria-label') || '';
        const item = document.createElement('div');
        item.className = 'rem-leg-item ' + catCls;
        const icoSpan = document.createElement('span');
        icoSpan.className = 'rem-ico';
        if (ico) icoSpan.appendChild(ico.cloneNode(true));
        const txtSpan = document.createElement('span');
        txtSpan.className = 'rem-leg-txt';
        txtSpan.textContent = label;
        item.appendChild(icoSpan);
        item.appendChild(txtSpan);
        grid.appendChild(item);
      });
    }

    bindCommandBarPopover(tracker, legend, 'legend-open', '#hud-remaining-legend', setRemainingLegendOpen);
  }

  function bindClockCalendar() {
    bindCommandBarPopover(state.dom.retroClock, state.dom.clockCalendar, 'calendar-open', '#hud-clock-calendar', setClockCalendarOpen);
  }

  function bindEvents() {
    bindRemainingLegend();
    bindClockCalendar();
    if (state.dom.nextShiftBtn) {
      state.dom.nextShiftBtn.addEventListener('click', startNextShift);
    }

    global.ShiftClock.on('onPreShiftEndWarning', () => {
      if (typeof state.hooks.showNotification === 'function') {
        state.hooks.showNotification('[[ico:claim]] 1:50 PM: 10 minutes until 2:00 PM shift end! Wrap up tasks & punch out at the Hallway Timeclock [E] before overtime.', 'high');
      }
    });

    global.ShiftClock.on('onOvertime', (evt) => {
      if (!evt) return;
      if (evt.isStart) {
        if (typeof state.hooks.playDoorAlarm === 'function') state.hooks.playDoorAlarm();
        if (typeof state.hooks.showNotification === 'function') {
          state.hooks.showNotification('[[ico:siren]] 2:00 PM OVERTIME ALERT: Scheduled shift ended! Punch out at the Hallway Timeclock [E] now — overtime penalties accrue every 10 min until 3:00 PM.', 'critical');
        }
        updateHud(true);
        return;
      }

      global.ShiftStats.increment('overtimePenalties', 1);
      if (typeof state.hooks.playDoorAlarm === 'function') state.hooks.playDoorAlarm();
      if (typeof state.hooks.showNotification === 'function') {
        if (evt.isCutoff) {
          const totalOtPts = (global.ShiftStats.getStats().overtimePenalties || 1) * (Number(evt.penaltyPoints) || 100);
          state.hooks.showNotification('[[ico:siren]] 3:00 PM HARD CUTOFF: Kicked off timeclock! Shift force-ended with -' + totalOtPts + ' pts in overtime penalties.', 'critical');
        } else {
          const timeLbl = evt.time && evt.time.formatted12h ? evt.time.formatted12h : ('2:' + String(evt.overtimeMinutes).padStart(2, '0') + ' PM');
          state.hooks.showNotification('[[ico:siren]] OVERTIME PENALTY (-' + (Number(evt.penaltyPoints) || 100) + ' pts): ' + timeLbl + ' (' + evt.overtimeMinutes + 'm past 2:00 PM). Punch out at Timeclock [E] before 3:00 PM!', 'critical');
        }
      }
      updateHud(true);
    });

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

  function syncClockPauseFlag() {
    if (isModalOpen()) {
      closeAllCommandBarPopovers(null);
    }
    if (global.ShiftClock && typeof global.ShiftClock.setSystemPaused === 'function') {
      global.ShiftClock.setSystemPaused(isSystemPaused());
    }
    if (typeof state.hooks.onMenuStateChange === 'function') {
      state.hooks.onMenuStateChange({
        mainMenuOpen: state.mainMenuOpen,
        systemMenuOpen: state.systemMenuOpen,
        saveLoadModalOpen: state.saveLoadModalOpen,
        infoModalOpen: state.infoModalOpen,
        shiftSummaryOpen: state.shiftSummaryOpen
      });
    }
  }

  function init(hooks) {
    if (hooks && typeof hooks === 'object') {
      if (hooks.showAlert) state.hooks.showAlert = hooks.showAlert;
      if (hooks.showNotification) state.hooks.showNotification = hooks.showNotification;
      if (hooks.playDoorAlarm) state.hooks.playDoorAlarm = hooks.playDoorAlarm;
      if (hooks.playSuccessChime) state.hooks.playSuccessChime = hooks.playSuccessChime;
      if (hooks.playButtonClick) state.hooks.playButtonClick = hooks.playButtonClick;
      if (hooks.getUnfinishedWork) state.hooks.getUnfinishedWork = hooks.getUnfinishedWork;
      if (typeof hooks.onNewGame === 'function') state.hooks.onNewGame = hooks.onNewGame;
      if (typeof hooks.onMenuStateChange === 'function') state.hooks.onMenuStateChange = hooks.onMenuStateChange;
      if (typeof hooks.onHudUpdate === 'function') state.hooks.onHudUpdate = hooks.onHudUpdate;
      if (typeof hooks.onResetShift === 'function') state.hooks.onResetShift.push(hooks.onResetShift);
    }

    if (!state.initialized) {
      state.initialized = true;
      cacheDom();
      bindEvents();
    }
    syncClockPauseFlag();
    updateHud(true);
  }

  function registerResetHandler(fn) {
    if (typeof fn === 'function') {
      state.hooks.onResetShift.push(fn);
    }
  }

  function isModalOpen() {
    return state.shiftSummaryOpen || state.systemMenuOpen || state.mainMenuOpen || state.saveLoadModalOpen || state.infoModalOpen;
  }

  function isShiftSummaryOpen() {
    return state.shiftSummaryOpen;
  }

  function isSystemPaused() {
    return Boolean(state.systemMenuOpen || state.mainMenuOpen || state.shiftSummaryOpen || state.saveLoadModalOpen || state.infoModalOpen);
  }

  function setSystemPaused(paused) {
    state.systemMenuOpen = Boolean(paused);
    syncClockPauseFlag();
  }

  function isMainMenuOpen() {
    return state.mainMenuOpen;
  }

  function setMainMenuOpen(open) {
    state.mainMenuOpen = Boolean(open);
    syncClockPauseFlag();
  }

  function isPauseMenuOpen() {
    return state.systemMenuOpen;
  }

  function setPauseMenuOpen(open) {
    state.systemMenuOpen = Boolean(open);
    syncClockPauseFlag();
  }

  function isSaveLoadModalOpen() {
    return state.saveLoadModalOpen;
  }

  function setSaveLoadModalOpen(open) {
    state.saveLoadModalOpen = Boolean(open);
    syncClockPauseFlag();
  }

  function isInfoModalOpen() {
    return state.infoModalOpen;
  }

  function setInfoModalOpen(open) {
    state.infoModalOpen = Boolean(open);
    syncClockPauseFlag();
  }

  function startNewGame() {
    state.shiftSummaryOpen = false;
    state.systemMenuOpen = false;
    state.saveLoadModalOpen = false;
    state.infoModalOpen = false;
    state.mainMenuOpen = false;
    state.noonPunchOutNotified = false;
    if (state.dom.summaryModal) {
      state.dom.summaryModal.style.display = 'none';
    }
    if (typeof state.hooks.onNewGame === 'function') {
      state.hooks.onNewGame();
    }
    if (global.ShiftClock) {
      global.ShiftClock.setPaused(false);
    }
    syncClockPauseFlag();
    updateHud(true);
  }

  function returnToMainMenu() {
    if (global.SaveSystem && typeof global.SaveSystem.triggerAutosave === 'function') {
      global.SaveSystem.triggerAutosave('return_to_menu');
    }
    state.shiftSummaryOpen = false;
    state.systemMenuOpen = false;
    state.saveLoadModalOpen = false;
    state.infoModalOpen = false;
    state.mainMenuOpen = true;
    if (state.dom.summaryModal) {
      state.dom.summaryModal.style.display = 'none';
    }
    syncClockPauseFlag();
  }

  function syncAfterLoad() {
    state.shiftSummaryOpen = false;
    state.systemMenuOpen = false;
    state.saveLoadModalOpen = false;
    state.infoModalOpen = false;
    state.mainMenuOpen = false;
    if (state.dom.summaryModal) {
      state.dom.summaryModal.style.display = 'none';
    }
    if (global.ShiftClock) {
      global.ShiftClock.setPaused(false);
    }
    syncClockPauseFlag();
    updateHud(true);
  }

  function punchOutAtTimeclock() {
    if (state.shiftSummaryOpen) return false;
    const snap = global.ShiftClock && typeof global.ShiftClock.getTimeSnapshot === 'function'
      ? global.ShiftClock.getTimeSnapshot()
      : null;
    if (snap && snap.shiftEnded) return false;
    if (!snap || !snap.afterNoon) {
      if (typeof state.hooks.playButtonClick === 'function') state.hooks.playButtonClick();
      if (typeof state.hooks.showNotification === 'function') {
        state.hooks.showNotification('[[ico:clock]] Timeclock punch-out opens at 12:00 PM noon.', 'high');
      }
      return false;
    }
    if (typeof state.hooks.playSuccessChime === 'function') {
      state.hooks.playSuccessChime();
    }
    endShift('timeclock');
    return true;
  }

  global.DSDGame = {
    init: init,
    updateHud: updateHud,
    endShift: endShift,
    punchOutAtTimeclock: punchOutAtTimeclock,
    startNextShift: startNextShift,
    registerResetHandler: registerResetHandler,
    isModalOpen: isModalOpen,
    isShiftSummaryOpen: isShiftSummaryOpen,
    isSystemPaused: isSystemPaused,
    setSystemPaused: setSystemPaused,
    isMainMenuOpen: isMainMenuOpen,
    setMainMenuOpen: setMainMenuOpen,
    isPauseMenuOpen: isPauseMenuOpen,
    setPauseMenuOpen: setPauseMenuOpen,
    isSaveLoadModalOpen: isSaveLoadModalOpen,
    setSaveLoadModalOpen: setSaveLoadModalOpen,
    isInfoModalOpen: isInfoModalOpen,
    setInfoModalOpen: setInfoModalOpen,
    startNewGame: startNewGame,
    returnToMainMenu: returnToMainMenu,
    syncAfterLoad: syncAfterLoad,
    buildFebruaryCalendarCells: buildFebruaryCalendarCells,
    renderClockCalendar: renderClockCalendar,
    toggleRemainingLegend: toggleRemainingLegend,
    toggleClockCalendar: toggleClockCalendar,
    bindCommandBarPopover: bindCommandBarPopover,
    closeAllCommandBarPopovers: closeAllCommandBarPopovers
  };
})(window);
