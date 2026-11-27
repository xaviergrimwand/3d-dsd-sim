(function (global) {
  'use strict';

  /**
   * ShiftClock - In-game shift time (6:00 AM - 2:00 PM), Feb 1996 weekday calendar,
   * door-left-open security timers, and 3D wallClock synchronization.
   */
  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function getConfig() {
    return (global.DSDCatalog && global.DSDCatalog.SHIFT_CONFIG) || {
      shiftStartHour: 6,
      shiftDurationHours: 8,
      timeSpeedMultiplier: 1,
      msPerGameMinute: 6000,
      deliveryCutoffHour: 12,
      startDate: { month: 1, day: 1, year: 1996 },
      endCampaignDate: { month: 2, day: 1, year: 1996 }
    };
  }

  function createDoorTimerState() {
    return {
      active: false,
      startTotalMinutes: 0,
      warned5: false,
      penalized10: false,
      lastProlongedMark: 10
    };
  }

  const state = {
    hour: 6,
    minute: 0,
    second: 0,
    millisecond: 0,
    gameMinuteProgress: 0, // 0..1 fraction of current in-game minute
    date: { month: 1, day: 1, year: 1996 },
    workdayIndex: 1,
    tutorialMode: false,
    paused: false,
    systemPaused: false, // Reserved for a future in-game system/pause menu (not active yet)
    preEndWarned: false,
    shiftEndAlerted: false,
    lastOvertimeMark: 840,
    shiftEnded: false,
    campaignComplete: false,
    doorTimers: {
      side: createDoorTimerState(),
      dock1: createDoorTimerState(),
      dock2: createDoorTimerState(),
      dock3: createDoorTimerState(),
      dock4: createDoorTimerState()
    },
    listeners: {
      onShiftEnd: [],
      onPreShiftEndWarning: [],
      onOvertime: [],
      onDoorWarning: [],
      onDoorPenalty: [],
      onMinuteTick: []
    }
  };

  function emit(eventName, payload) {
    const list = state.listeners[eventName] || [];
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (err) {
        console.error('ShiftClock listener error (' + eventName + '):', err);
      }
    }
  }

  function on(eventName, fn) {
    if (state.listeners[eventName] && typeof fn === 'function') {
      state.listeners[eventName].push(fn);
    }
  }

  function getShiftStartMinutes() {
    return getConfig().shiftStartHour * 60;
  }

  function getShiftEndHour() {
    const cfg = getConfig();
    return cfg.shiftStartHour + cfg.shiftDurationHours; // Scheduled shift end (2:00 PM)
  }

  function getShiftEndMinutes() {
    return getShiftEndHour() * 60;
  }

  function getHardCutoffHour() {
    const cfg = getConfig();
    const otWindow = cfg.overtimeWindowHours !== undefined ? cfg.overtimeWindowHours : 1;
    return getShiftEndHour() + otWindow; // Hard cutoff (3:00 PM)
  }

  function getHardCutoffMinutes() {
    return getHardCutoffHour() * 60;
  }

  function getCurrentTotalMinutes() {
    return state.hour * 60 + state.minute;
  }

  function getExactTotalMinutes() {
    return state.hour * 60 + state.minute + state.gameMinuteProgress;
  }

  function isAfterNoon() {
    return state.hour >= (getConfig().deliveryCutoffHour || 12);
  }

  function isOvertime() {
    return getCurrentTotalMinutes() >= getShiftEndMinutes();
  }

  function isShiftOver() {
    return getCurrentTotalMinutes() >= getHardCutoffMinutes();
  }

  function resetClockToShiftStart() {
    const cfg = getConfig();
    state.hour = cfg.shiftStartHour;
    state.minute = 0;
    state.second = 0;
    state.millisecond = 0;
    state.gameMinuteProgress = 0;
    state.preEndWarned = false;
    state.shiftEndAlerted = false;
    state.lastOvertimeMark = getShiftEndMinutes();
    state.shiftEnded = false;
    Object.keys(state.doorTimers).forEach((k) => {
      state.doorTimers[k] = createDoorTimerState();
    });
  }

  function init(opts) {
    const o = opts || {};
    const cfg = getConfig();
    state.tutorialMode = Boolean(o.tutorialMode);
    state.date = {
      month: cfg.startDate.month,
      day: cfg.startDate.day,
      year: cfg.startDate.year
    };
    state.workdayIndex = state.tutorialMode ? 0 : 1;
    state.campaignComplete = false;
    state.paused = false;
    state.systemPaused = false;
    resetClockToShiftStart();
  }

  function isTutorialMode() {
    return Boolean(state.tutorialMode);
  }

  function setTutorialMode(enabled) {
    init({ tutorialMode: Boolean(enabled) });
    return state.tutorialMode;
  }

  function setTutorialTime(hour, minute, opts) {
    if (!state.tutorialMode) return false;
    const h = Math.max(0, Math.min(23, Math.floor(Number(hour) || 0)));
    const m = Math.max(0, Math.min(59, Math.floor(Number(minute) || 0)));
    state.hour = h;
    state.minute = m;
    state.second = 0;
    state.millisecond = 0;
    state.gameMinuteProgress = 0;
    const nowTotalMin = getCurrentTotalMinutes();
    const scheduledEndMin = getShiftEndMinutes();
    state.preEndWarned = nowTotalMin >= scheduledEndMin - 10;
    state.shiftEndAlerted = nowTotalMin >= scheduledEndMin;
    state.lastOvertimeMark = Math.max(
      scheduledEndMin,
      scheduledEndMin + Math.floor(Math.max(0, nowTotalMin - scheduledEndMin) / 10) * 10
    );
    state.shiftEnded = false;
    if (!(opts && opts.silent)) {
      emit('onMinuteTick', getTimeSnapshot());
    }
    return true;
  }

  function setPaused(paused) {
    state.paused = Boolean(paused);
  }

  function setSystemPaused(paused) {
    state.systemPaused = Boolean(paused);
  }

  function isSystemPaused() {
    return state.systemPaused;
  }

  function startDoorTimer(doorKey) {
    const timer = state.doorTimers[doorKey];
    if (!timer || timer.active) return;
    timer.active = true;
    timer.startTotalMinutes = getExactTotalMinutes();
    timer.warned5 = false;
    timer.penalized10 = false;
    timer.lastProlongedMark = 10;
  }

  function stopDoorTimer(doorKey) {
    const timer = state.doorTimers[doorKey];
    if (!timer || !timer.active) return;
    state.doorTimers[doorKey] = createDoorTimerState();
  }

  function getDoorTimerState(doorKey) {
    const timer = state.doorTimers[doorKey];
    if (!timer || !timer.active) {
      return { active: false, elapsedMinutes: 0, warned5: false, penalized10: false };
    }
    return {
      active: true,
      elapsedMinutes: Math.max(0, getExactTotalMinutes() - timer.startTotalMinutes),
      warned5: Boolean(timer.warned5),
      penalized10: Boolean(timer.penalized10)
    };
  }

  function checkDoorTimers() {
    const nowExactMin = getExactTotalMinutes();
    Object.keys(state.doorTimers).forEach((doorKey) => {
      const timer = state.doorTimers[doorKey];
      if (!timer.active) return;
      const elapsedMin = nowExactMin - timer.startTotalMinutes;

      if (elapsedMin >= 5 && !timer.warned5) {
        timer.warned5 = true;
        emit('onDoorWarning', { doorKey: doorKey, elapsedMinutes: elapsedMin });
      }
      if (elapsedMin >= 10 && !timer.penalized10) {
        timer.penalized10 = true;
        timer.lastProlongedMark = 10;
        emit('onDoorPenalty', { doorKey: doorKey, prolonged: false, elapsedMinutes: elapsedMin });
      } else if (elapsedMin >= timer.lastProlongedMark + 5) {
        timer.lastProlongedMark += 5;
        emit('onDoorPenalty', { doorKey: doorKey, prolonged: true, elapsedMinutes: elapsedMin });
      }
    });
  }

  function update(dtSeconds, externalPaused) {
    if (state.tutorialMode || state.paused || state.systemPaused || externalPaused || state.shiftEnded || state.campaignComplete) {
      return;
    }
    const cfg = getConfig();
    const safeDt = Math.max(0, Math.min(Number(dtSeconds) || 0, 0.25));
    const realSecPerGameMinute = (cfg.msPerGameMinute || 6000) / (1000 * (cfg.timeSpeedMultiplier || 1));
    if (realSecPerGameMinute <= 0) return;

    state.gameMinuteProgress += safeDt / realSecPerGameMinute;

    let minutesAdded = 0;
    while (state.gameMinuteProgress >= 1) {
      state.gameMinuteProgress -= 1;
      state.minute += 1;
      minutesAdded += 1;
      if (state.minute >= 60) {
        state.minute = 0;
        state.hour += 1;
        if (state.hour >= 24) {
          state.hour = 0;
        }
      }
    }

    const totalSecInMin = state.gameMinuteProgress * 60;
    state.second = Math.floor(totalSecInMin);
    state.millisecond = Math.floor((totalSecInMin - state.second) * 1000);

    if (minutesAdded > 0) {
      emit('onMinuteTick', getTimeSnapshot());
    }

    checkDoorTimers();

    const nowTotalMin = getCurrentTotalMinutes();
    const scheduledEndMin = getShiftEndMinutes();
    const hardCutoffMin = getHardCutoffMinutes();

    if (!state.preEndWarned && nowTotalMin >= scheduledEndMin - 10 && nowTotalMin < hardCutoffMin) {
      state.preEndWarned = true;
      emit('onPreShiftEndWarning', {
        minutesRemaining: Math.max(0, scheduledEndMin - nowTotalMin),
        time: getTimeSnapshot()
      });
    }

    if (!state.shiftEndAlerted && nowTotalMin >= scheduledEndMin) {
      state.shiftEndAlerted = true;
      emit('onOvertime', {
        isStart: true,
        isCutoff: false,
        overtimeMinutes: 0,
        penaltyPoints: 0,
        time: getTimeSnapshot()
      });
    }

    while (nowTotalMin >= state.lastOvertimeMark + 10 && state.lastOvertimeMark < hardCutoffMin) {
      state.lastOvertimeMark += 10;
      const otMin = Math.max(0, state.lastOvertimeMark - scheduledEndMin);
      emit('onOvertime', {
        isStart: false,
        isCutoff: state.lastOvertimeMark >= hardCutoffMin,
        overtimeMinutes: otMin,
        penaltyPoints: 100,
        time: getTimeSnapshot()
      });
    }

    if (isShiftOver() && !state.shiftEnded) {
      const cutoffHour = getHardCutoffHour();
      state.hour = Math.floor(cutoffHour);
      state.minute = Math.round((cutoffHour % 1) * 60);
      state.second = 0;
      state.millisecond = 0;
      state.gameMinuteProgress = 0;
      state.shiftEnded = true;
      emit('onShiftEnd', { reason: 'hard_cutoff_3pm', time: getTimeSnapshot() });
    }
  }

  function advanceWorkday() {
    if (state.tutorialMode) {
      return false;
    }
    const cfg = getConfig();
    const d = new Date(state.date.year, state.date.month, state.date.day);
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6); // Skip Sun (0) & Sat (6)

    const endCampaign = new Date(
      cfg.endCampaignDate.year,
      cfg.endCampaignDate.month,
      cfg.endCampaignDate.day
    );
    if (d >= endCampaign) {
      state.campaignComplete = true;
      return false;
    }

    state.date = { month: d.getMonth(), day: d.getDate(), year: d.getFullYear() };
    state.workdayIndex += 1;
    resetClockToShiftStart();
    return true;
  }

  function getNextShiftDateInfo() {
    const cfg = getConfig();
    const d = new Date(state.date.year, state.date.month, state.date.day);
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6); // Mon-Fri shifts only

    const endCampaign = new Date(
      cfg.endCampaignDate.year,
      cfg.endCampaignDate.month,
      cfg.endCampaignDate.day
    );
    const target = d >= endCampaign
      ? new Date(cfg.startDate.year, cfg.startDate.month, cfg.startDate.day)
      : d;
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const yyyy = String(target.getFullYear());
    return {
      month: target.getMonth(),
      day: target.getDate(),
      year: target.getFullYear(),
      dayName: DAY_NAMES[target.getDay()] || 'MON',
      mmddyyyy: mm + '/' + dd + '/' + yyyy
    };
  }

  function formatTime12h() {
    const h24 = state.hour;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const minStr = String(state.minute).padStart(2, '0');
    return h12 + ':' + minStr + ' ' + period;
  }

  function formatTime24h() {
    return String(state.hour).padStart(2, '0') + ':' + String(state.minute).padStart(2, '0');
  }

  function formatDateShort() {
    if (state.tutorialMode) {
      return 'TUTORIAL';
    }
    const d = new Date(state.date.year, state.date.month, state.date.day);
    const dow = DAY_NAMES[d.getDay()];
    const mon = MONTH_NAMES[state.date.month] || 'FEB';
    const dayStr = String(state.date.day).padStart(2, '0');
    return dow + ' ' + mon + ' ' + dayStr + ', ' + state.date.year;
  }

  function getTimeSnapshot() {
    const d = new Date(state.date.year, state.date.month, state.date.day);
    const h24 = state.hour;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const startMin = getShiftStartMinutes();
    const endMin = getShiftEndMinutes();
    const span = Math.max(1, endMin - startMin);
    const progressPct = Math.max(0, Math.min(1, (getExactTotalMinutes() - startMin) / span));

    return {
      hour: state.hour,
      hour12: h12,
      minute: state.minute,
      second: state.second,
      millisecond: state.millisecond,
      exactSecond: state.second + state.millisecond / 1000,
      amPm: h24 >= 12 ? 'PM' : 'AM',
      totalMinutes: getCurrentTotalMinutes(),
      progressPct: progressPct,
      formatted12h: formatTime12h(),
      formatted24h: formatTime24h(),
      dayName: state.tutorialMode ? 'TUTORIAL' : (DAY_NAMES[d.getDay()] || 'MON'),
      monthName: state.tutorialMode ? 'TUTORIAL' : (MONTH_NAMES[state.date.month] || 'JAN'),
      dayOfMonth: state.tutorialMode ? '' : String(state.date.day).padStart(2, '0'),
      year: state.tutorialMode ? '' : state.date.year,
      dateLabel: formatDateShort(),
      workdayIndex: state.workdayIndex,
      tutorialMode: Boolean(state.tutorialMode),
      afterNoon: isAfterNoon(),
      overtime: isOvertime(),
      overtimeMinutes: Math.max(0, getCurrentTotalMinutes() - getShiftEndMinutes()),
      shiftOver: isShiftOver(),
      shiftEnded: state.shiftEnded,
      campaignComplete: state.campaignComplete
    };
  }

  function exportState() {
    const timersCopy = {};
    Object.keys(state.doorTimers).forEach((k) => {
      const t = state.doorTimers[k] || createDoorTimerState();
      timersCopy[k] = {
        active: Boolean(t.active),
        startTotalMinutes: Number(t.startTotalMinutes) || 0,
        warned5: Boolean(t.warned5),
        penalized10: Boolean(t.penalized10),
        lastProlongedMark: Number.isFinite(Number(t.lastProlongedMark)) ? Number(t.lastProlongedMark) : 10
      };
    });
    return {
      hour: Number(state.hour),
      minute: Number(state.minute),
      second: Number(state.second) || 0,
      millisecond: Number(state.millisecond) || 0,
      gameMinuteProgress: Number(state.gameMinuteProgress) || 0,
      date: {
        month: Number(state.date.month) || 1,
        day: Number(state.date.day) || 1,
        year: Number(state.date.year) || 1996
      },
      workdayIndex: state.tutorialMode ? 0 : (Number(state.workdayIndex) || 1),
      tutorialMode: Boolean(state.tutorialMode),
      paused: Boolean(state.paused),
      preEndWarned: Boolean(state.preEndWarned),
      shiftEndAlerted: Boolean(state.shiftEndAlerted),
      lastOvertimeMark: Number(state.lastOvertimeMark) || getShiftEndMinutes(),
      shiftEnded: Boolean(state.shiftEnded),
      campaignComplete: Boolean(state.campaignComplete),
      doorTimers: timersCopy
    };
  }

  function importState(data) {
    if (!data || typeof data !== 'object') return false;
    const cfg = getConfig();
    state.hour = Number.isFinite(Number(data.hour)) ? Number(data.hour) : cfg.shiftStartHour;
    state.minute = Number.isFinite(Number(data.minute)) ? Number(data.minute) : 0;
    state.second = Number.isFinite(Number(data.second)) ? Number(data.second) : 0;
    state.millisecond = Number.isFinite(Number(data.millisecond)) ? Number(data.millisecond) : 0;
    state.gameMinuteProgress = Number.isFinite(Number(data.gameMinuteProgress)) ? Number(data.gameMinuteProgress) : 0;
    const d = data.date || {};
    state.date = {
      month: Number(d.month) || cfg.startDate.month,
      day: Number(d.day) || cfg.startDate.day,
      year: Number(d.year) || cfg.startDate.year
    };
    state.tutorialMode = Boolean(data.tutorialMode);
    state.workdayIndex = state.tutorialMode
      ? 0
      : (Number.isFinite(Number(data.workdayIndex)) ? Number(data.workdayIndex) : 1);
    state.paused = Boolean(data.paused);
    state.systemPaused = false;
    const scheduledEndMin = getShiftEndMinutes();
    const impTotalMin = getCurrentTotalMinutes();
    state.preEndWarned = data.preEndWarned !== undefined ? Boolean(data.preEndWarned) : (impTotalMin >= scheduledEndMin - 10);
    state.shiftEndAlerted = data.shiftEndAlerted !== undefined ? Boolean(data.shiftEndAlerted) : (impTotalMin >= scheduledEndMin);
    state.lastOvertimeMark = Number.isFinite(Number(data.lastOvertimeMark))
      ? Number(data.lastOvertimeMark)
      : Math.max(scheduledEndMin, scheduledEndMin + Math.floor(Math.max(0, impTotalMin - scheduledEndMin) / 10) * 10);
    state.shiftEnded = Boolean(data.shiftEnded);
    state.campaignComplete = Boolean(data.campaignComplete);
    const savedTimers = (data.doorTimers && typeof data.doorTimers === 'object') ? data.doorTimers : {};
    Object.keys(state.doorTimers).forEach((k) => {
      const base = createDoorTimerState();
      const src = savedTimers[k];
      if (src && typeof src === 'object') {
        base.active = Boolean(src.active);
        base.startTotalMinutes = Number(src.startTotalMinutes) || 0;
        base.warned5 = Boolean(src.warned5);
        base.penalized10 = Boolean(src.penalized10);
        base.lastProlongedMark = Number.isFinite(Number(src.lastProlongedMark)) ? Number(src.lastProlongedMark) : 10;
      }
      state.doorTimers[k] = base;
    });
    return true;
  }

  init();

  global.ShiftClock = {
    init: init,
    update: update,
    setPaused: setPaused,
    setSystemPaused: setSystemPaused,
    isSystemPaused: isSystemPaused,
    resetClockToShiftStart: resetClockToShiftStart,
    advanceWorkday: advanceWorkday,
    setTutorialMode: setTutorialMode,
    isTutorialMode: isTutorialMode,
    setTutorialTime: setTutorialTime,
    getShiftStartMinutes: getShiftStartMinutes,
    getShiftEndHour: getShiftEndHour,
    getShiftEndMinutes: getShiftEndMinutes,
    getHardCutoffHour: getHardCutoffHour,
    getHardCutoffMinutes: getHardCutoffMinutes,
    getCurrentTotalMinutes: getCurrentTotalMinutes,
    getExactTotalMinutes: getExactTotalMinutes,
    isAfterNoon: isAfterNoon,
    isOvertime: isOvertime,
    isShiftOver: isShiftOver,
    startDoorTimer: startDoorTimer,
    stopDoorTimer: stopDoorTimer,
    getDoorTimerState: getDoorTimerState,
    formatTime12h: formatTime12h,
    formatTime24h: formatTime24h,
    formatDateShort: formatDateShort,
    getNextShiftDateInfo: getNextShiftDateInfo,
    getTimeSnapshot: getTimeSnapshot,
    exportState: exportState,
    importState: importState,
    on: on
  };
})(window);

