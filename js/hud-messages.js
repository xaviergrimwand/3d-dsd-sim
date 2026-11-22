(function (global) {
  'use strict';

  /**
   * DSDMessages — Session-only Command Bar Message Center (LOG drawer + downward-stacking live alerts).
   * Intentionally keeps message history in memory for the current play session only (not saved/loaded).
   */
  const MAX_HISTORY = 60;
  const MAX_LIVE_STACK = 3;
  const LIVE_TOAST_MS = 4200;

  const history = [];
  let nextId = 1;
  let unreadCount = 0;
  let isOpen = false;
  let activeFilter = 'all';
  let wired = false;

  const dom = {};

  function cacheDom() {
    dom.wrap = document.getElementById('hud-msg-center');
    dom.bar = document.getElementById('hud-msg-bar');
    dom.badge = document.getElementById('hud-msg-badge');
    dom.preview = document.getElementById('hud-msg-preview');
    dom.unreadDot = document.getElementById('hud-msg-unread-dot');
    dom.chevron = document.getElementById('hud-msg-chevron');
    dom.filters = document.getElementById('hud-msg-filters');
    dom.list = document.getElementById('hud-msg-list');
    dom.liveStack = document.getElementById('hud-msg-live-stack');
  }

  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(msg) {
    return String(msg === undefined || msg === null ? '' : msg)
      .replace(/\r?\n+/g, ' · ')
      .trim();
  }

  function normalizeExplicitPriority(val) {
    if (!val || typeof val !== 'string') return null;
    const k = val.toLowerCase().trim();
    if (k === 'critical' || k === 'alert' || k === 'alerts') return 'critical';
    if (k === 'high' || k === 'warn' || k === 'warning' || k === 'warnings') return 'high';
    if (k === 'status' || k === 'info') return 'status';
    if (k === 'low' || k === 'task' || k === 'tasks') return 'low';
    return null;
  }

  function classifyPriority(message, explicitPriority) {
    const forced = normalizeExplicitPriority(explicitPriority);
    if (forced) return forced;

    const upper = String(message || '').toUpperCase();

    // 1. ALERTS ('critical'): Rule breaks, point penalties, temp failures, recalls, staging/disposal errors
    if (
      upper.includes('PRODUCT RECALL ALERT') ||
      upper.includes('SECURITY PENALTY') ||
      upper.includes('PRIORITY ADHERENCE VIOLATION') ||
      upper.includes('SUPPLY OUT OF STOCK') ||
      upper.includes('PENALTY (') ||
      upper.includes('WITH PENALTY') ||
      upper.includes('TEMP FAIL:') ||
      upper.includes('OUT OF TEMP') ||
      upper.includes('RECALL COUNT MISMATCH') ||
      upper.includes('MISPLACED!') ||
      upper.includes('BLOCKED TRANSIT LANE') ||
      upper.includes('NO STAGING ZONE') ||
      upper.includes('WRONG CONTAINER') ||
      upper.includes('WRONG RECEPTACLE')
    ) {
      return 'critical';
    }

    // 2. TASKS ('low'): Actionable paperwork/ops dispatches, Home Office tasks, BOLs, Filing, Inventory, Milestones
    if (
      upper.includes('📬') ||
      upper.includes('RECEIVING TASK') ||
      upper.includes('DNR CONFIRMED') ||
      upper.includes('TRUE VENDOR SHORTAGE') ||
      upper.includes('TASK VERIFIED') ||
      upper.includes('MISSING RECEIPT VERIFIED') ||
      upper.includes('RECALL COMPLETE') ||
      upper.includes('HIGH PRIORITY WAREHOUSE TRUCK') ||
      upper.includes('WAREHOUSE BOL SIGNED') ||
      upper.includes('BILL OF LADING') ||
      upper.includes('NIGHT DROP INVOICE') ||
      upper.includes('DAILY FILING COMPLETE') ||
      upper.includes('DAILY FILING FOLDER') ||
      upper.includes('PRINT ALL STORE COPIES') ||
      upper.includes('DAILY BACKROOM INVENTORY FINALIZED') ||
      upper.includes('DEPT 60 ORDER') ||
      upper.includes('DEPT 60 SUPPLY DELIVERY') ||
      upper.includes('SUPPLIES STOCKED') ||
      upper.includes('SHIFT RECEIVING COMPLETE') ||
      upper.includes('ALL SCHEDULED DSD') ||
      upper.includes('ALL CLAIMS PROCESSED') ||
      upper.includes('PHASE 2 ACTIVE') ||
      upper.includes('21 WORKING DAYS')
    ) {
      return 'low';
    }

    // 3. WARNINGS ('high'): Advisories, stock depletion, header/filing gates, and interaction/control blockers
    if (
      upper.includes('SECURITY ADVISORY') ||
      upper.includes('SHIFT RECEIVING IN PROGRESS') ||
      upper.includes('DEPT 60 DEPLETED') ||
      upper.includes('VENDORS ONLY') ||
      upper.includes('HANDS OCCUPIED') ||
      upper.includes('PARK THE ELECTRIC PALLET JACK') ||
      upper.includes('ELECTRIC PALLET JACK REQUIRED') ||
      upper.includes('ALREADY HAULING') ||
      upper.includes('LOWER AND DROP THE PALLET') ||
      upper.includes('STAND CLEAR') ||
      upper.includes('TRAILER DOOR CLOSED') ||
      upper.includes('TRAILER DOOR SEALED') ||
      upper.includes('CANNOT PLACE CASE HERE') ||
      upper.includes('PULL TOP CASES') ||
      upper.includes('BELONGS TO ANOTHER DELIVERY') ||
      upper.includes('HEADER DIFFERS') ||
      upper.includes('TYPE MISMATCH') ||
      upper.includes('CANNOT PAIR') ||
      upper.includes('DAILY FILING IS LOCKED') ||
      upper.includes('BEFORE FILING') ||
      upper.includes('FINISH COLLECTING') ||
      upper.includes('VALID AFFECTED UNIT COUNT') ||
      upper.includes('CANNOT BE FLAGGED') ||
      upper.includes('STAYS UPRIGHT') ||
      upper.includes('⚠️') ||
      upper.includes('🔒')
    ) {
      return 'high';
    }

    // 4. INFO ('status'): Routine dock/freight/door/jack/printer/claims updates
    return 'status';
  }

  function prioCss(priority) {
    if (priority === 'critical') return 'n-item-crit';
    if (priority === 'high') return 'n-item-warn';
    if (priority === 'status') return 'n-item-stat';
    return 'n-item-task';
  }

  function prioLabel(priority) {
    if (priority === 'critical') return 'ALERT';
    if (priority === 'high') return 'WARNING';
    if (priority === 'status') return 'INFO';
    return 'TASK';
  }

  function getClockTime() {
    if (global.ShiftClock && typeof global.ShiftClock.getTimeSnapshot === 'function') {
      const snap = global.ShiftClock.getTimeSnapshot();
      if (snap && snap.formatted12h) return snap.formatted12h;
    }
    return '06:00 AM';
  }

  function render() {
    if (!dom.wrap) cacheDom();
    if (!dom.wrap) return;

    const filtered = activeFilter === 'all'
      ? history
      : history.filter((item) => item.priority === activeFilter);

    if (dom.list) {
      if (filtered.length === 0) {
        dom.list.innerHTML = '<div style="text-align:center;padding:14px;color:#64748b;font-size:11px;">No messages in this filter</div>';
      } else {
        dom.list.innerHTML = filtered.map((m, idx) =>
          `<div class="hud-msg-item ${prioCss(m.priority)} ${idx < unreadCount ? 'unread' : ''}">` +
          `<div class="hud-msg-meta"><span>${prioLabel(m.priority)}</span><span>${escapeHtml(m.time)}</span></div>` +
          `<div>${escapeHtml(m.text)}</div></div>`
        ).join('');
      }
    }

    if (dom.badge) {
      dom.badge.textContent = unreadCount > 0
        ? `(${history.length} · ${unreadCount}!)`
        : `(${history.length})`;
    }
    if (dom.preview) {
      dom.preview.textContent = history[0]
        ? `${history[0].time} · ${history[0].text}`
        : 'Ready — session alerts & updates';
    }
    if (dom.unreadDot) {
      dom.unreadDot.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
  }

  function spawnLiveToast(entry) {
    if (!dom.liveStack || isOpen) return;
    const el = document.createElement('div');
    el.className = `hud-msg-toast ${prioCss(entry.priority)}`;
    el.innerHTML = `<span>${escapeHtml(entry.text)}</span><span class="hud-msg-toast-time">${escapeHtml(entry.time)}</span>`;
    dom.liveStack.prepend(el);
    while (dom.liveStack.children.length > MAX_LIVE_STACK) {
      dom.liveStack.removeChild(dom.liveStack.lastElementChild);
    }
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.28s ease';
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, LIVE_TOAST_MS);
  }

  function push(rawMsg, explicitPriority) {
    const text = normalizeText(rawMsg);
    if (!text) return null;
    if (!dom.wrap) cacheDom();

    const priority = classifyPriority(text, explicitPriority);
    const entry = {
      id: nextId++,
      priority,
      time: getClockTime(),
      text
    };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;

    if (!isOpen) unreadCount++;
    render();
    spawnLiveToast(entry);
    return entry;
  }

  function setOpen(open) {
    if (!dom.wrap) cacheDom();
    isOpen = Boolean(open);
    if (dom.wrap) dom.wrap.classList.toggle('open', isOpen);
    if (dom.chevron) dom.chevron.textContent = isOpen ? '▲' : '▼';
    if (isOpen) {
      unreadCount = 0;
      render();
    }
  }

  function toggle() {
    setOpen(!isOpen);
    if (global.SoundSystem && typeof global.SoundSystem.playButtonClick === 'function') {
      global.SoundSystem.playButtonClick();
    }
  }

  function clearSession() {
    history.length = 0;
    unreadCount = 0;
    activeFilter = 'all';
    if (dom.filters) {
      dom.filters.querySelectorAll('.hud-msg-filter-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.filter === 'all');
      });
    }
    if (dom.liveStack) dom.liveStack.innerHTML = '';
    setOpen(false);
    render();
  }

  function wireDom() {
    if (wired) return;
    cacheDom();
    if (!dom.wrap) return;
    wired = true;

    if (dom.bar) {
      dom.bar.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
      });
    }

    if (dom.filters) {
      dom.filters.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target && e.target.closest ? e.target.closest('.hud-msg-filter-btn') : null;
        if (!btn) return;
        activeFilter = btn.dataset.filter || 'all';
        dom.filters.querySelectorAll('.hud-msg-filter-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        if (global.SoundSystem && typeof global.SoundSystem.playButtonClick === 'function') {
          global.SoundSystem.playButtonClick();
        }
        render();
      });
    }

    if (dom.list) {
      dom.list.addEventListener('click', (e) => e.stopPropagation());
    }

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireDom);
  } else {
    wireDom();
  }

  global.DSDMessages = {
    push,
    toggle,
    setOpen,
    clearSession,
    isOpen: () => isOpen,
    getHistory: () => history.slice(),
    getUnreadCount: () => unreadCount,
    classifyPriority
  };
})(window);
