(function (global) {
  'use strict';

  /**
   * DSDTutorial — Decoupled 8-Chapter Tutorial Engine (Phase 3 Local Sandbox)
   * Provides Welcome Hub, Chapter Switcher, step evaluators, live dual-callout
   * spotlights (e.g. Paper Invoice -> Handheld Scanner fields), 3D objective
   * beacon target provider, and off-screen directional edge indicator.
   */

  const CHAPTERS = [
    { id: 'screen_tour', num: 1, icon: 'warehouse', label: 'SCREEN TOUR', sub: 'Controls, Command Bar, minimap & stations', firstStep: 'gui_controls' },
    { id: 'warehouse_trucks', num: 2, icon: 'truck', label: 'WAREHOUSE TRUCKS', sub: 'Side door check-in, Dock 1 escort, electric jack & staging', firstStep: 'wh_admit_driver' },
    { id: 'side_door_vendors', num: 3, icon: 'box', label: 'SIDE DOOR VENDORS', sub: 'Side rollup door, scanner check-in & receipts', firstStep: 'sd_open_door' },
    { id: 'temp_zones', num: 4, icon: 'thermometer', label: 'TEMP ZONES & PRODUCE', sub: 'Temp probes & non-scannable PLU produce', firstStep: 'tz_dock_driver' },
    { id: 'discrepancies_credits', num: 5, icon: 'flag', label: 'DISCREPANCIES & CREDITS', sub: 'Shortages, overage flags & credit memos', firstStep: 'dc_shortage' },
    { id: 'computer_desk', num: 6, icon: 'terminal', label: 'THE COMPUTER DESK', sub: 'Night drops, CRT terminal & HO archive tasks', firstStep: 'desk_night_drop' },
    { id: 'claims_recalls', num: 7, icon: 'claim', label: 'CLAIMS & RECALLS', sub: 'Dept 60 supplies, claims totes & recall sorting', firstStep: 'cl_supplies' },
    { id: 'backstock_end_day', num: 8, icon: 'shelf', label: 'BACKSTOCK & END-OF-DAY', sub: 'Overstock labeling, audit, filing & timeclock', firstStep: 'bk_label_cases' }
  ];

  function getChapterConfig(num) {
    return CHAPTERS.find((c) => c.num === Number(num)) || CHAPTERS[0];
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtIco(name, extraClass) {
    if (global.SvgIcons && typeof global.SvgIcons.render === 'function') {
      return global.SvgIcons.render(name, extraClass ? { className: extraClass } : undefined);
    }
    return '';
  }

  function fmtRichText(str) {
    return escapeHtml(str).replace(/\[\[ico:([a-zA-Z0-9_-]+)\]\]/g, (_, name) => fmtIco(name));
  }

  function formatInlineTokens(str) {
    return fmtRichText(str)
      .replace(/\[\[key:([^\]]+)\]\]/g, '<kbd class="tut-key">$1</kbd>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="tut-hl">$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function formatStepHtml(str) {
    const lines = String(str || '').split('\n');
    const blocks = [];
    let bulletBuf = [];
    const flushBullets = () => {
      if (!bulletBuf.length) return;
      blocks.push('<ul class="tut-bullets">' + bulletBuf.map((b) => '<li>' + formatInlineTokens(b) + '</li>').join('') + '</ul>');
      bulletBuf = [];
    };
    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        flushBullets();
        return;
      }
      if (/^-\s+/.test(line)) {
        bulletBuf.push(line.replace(/^-\s+/, ''));
      } else {
        flushBullets();
        blocks.push('<p class="tut-lead">' + formatInlineTokens(line) + '</p>');
      }
    });
    flushBullets();
    return blocks.join('');
  }

  function isElementVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const style = global.getComputedStyle ? global.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  // Maps Scanner active fields directly to their source field on the Paper Invoice
  function resolveScannerCreateCallouts(sc) {
    const fieldMap = {
      deptNo: { invSel: '#inv-dept-num', srcLbl: 'INV DEPT #', dstSel: '[data-tut="sc-field-deptNo"]', dstLbl: 'ENTER DEPT #' },
      vendorNo: { invSel: '#inv-vendor-num', srcLbl: 'INV VENDOR #', dstSel: '[data-tut="sc-field-vendorNo"]', dstLbl: 'ENTER VENDOR #' },
      invoiceNo: { invSel: '#inv-doc-num', srcLbl: 'INV DOC #', dstSel: '[data-tut="sc-field-invoiceNo"]', dstLbl: 'ENTER INVOICE #' },
      units: { invSel: '#inv-total-units', srcLbl: 'TOTAL UNITS', dstSel: '[data-tut="sc-field-units"]', dstLbl: 'ENTER UNITS' },
      cost: { invSel: '#inv-total-cost', srcLbl: 'TOTAL COST', dstSel: '[data-tut="sc-field-cost"]', dstLbl: 'ENTER COST' }
    };
    const active = sc && sc.activeField ? fieldMap[sc.activeField] : null;
    if (!active) return [{ selector: '#scanner-lcd', label: 'HANDHELD SCANNER', role: 'target' }];
    return [
      { selector: active.invSel, label: active.srcLbl, role: 'source' },
      { selector: active.dstSel, label: active.dstLbl, role: 'target' }
    ];
  }

  function getDeliveriesSnapshot() {
    if (global.WarehouseTrucks && typeof global.WarehouseTrucks.getScheduleRows === 'function') {
      return global.WarehouseTrucks.getScheduleRows() || [];
    }
    return [];
  }

  function findDelivery(id) {
    const list = getDeliveriesSnapshot();
    return list.find((d) => d && d.id === id) || null;
  }

  function seedSampleMessages() {
    const m = global.DSDMessages;
    if (!m || typeof m.push !== 'function') return;
    if (typeof m.clearSession === 'function') m.clearSession();
    m.push('[[ico:siren]] SAMPLE ALERT: Unattended open dock doors or expired cold temps trigger penalties.', 'critical', { silent: true });
    m.push('[[ico:claim]] REMINDER: Close dock doors promptly after unloading and plug in the Electric Jack.', 'high', { silent: true });
    m.push('[[ico:truck]] SCHEDULE: Warehouse Truck #010001, Vendor #201 & Vendor #143 queued for shift.', 'low', { silent: true });
    m.push('[[ico:checkCircle]] Tutorial Shift active — click Message Log filters above or tour the Command Bar.', 'status', { silent: true });
  }

  // =========================================================================
  // DETERMINISTIC CHAPTER SETUP SCRIPTS
  // =========================================================================
  const CHAPTER_SETUPS = {
    1: {
      time: { hour: 6, minute: 0 },
      spawn: { defaultSpawn: true },
      tutorialScript: {
        deliveries: [
          {
            id: 'tut_ch1_wh_sample',
            type: 'warehouse',
            driverName: 'Alex Mercer',
            driverGender: 'male',
            dockBay: 1,
            palletCount: 6,
            forcePattern: ['F', 'C', 'D'],
            etaHour: 11,
            etaMinute: 0,
            invoiceNo: '010001'
          },
          {
            id: 'tut_ch1_vt_sample',
            type: 'vendor_truck',
            vendorNo: '201',
            driverName: 'Marcus Vance',
            dockBay: 2,
            etaHour: 11,
            etaMinute: 25,
            invoiceNo: '900201'
          },
          {
            id: 'tut_ch1_sd_sample',
            type: 'sidedoor',
            vendorNo: '143',
            driverName: 'Jordan Reyes',
            etaHour: 11,
            etaMinute: 45,
            invoiceNo: '900143'
          }
        ],
        nightDrops: [],
        homeOfficeTasks: [],
        backstock: 'none',
        claimsItems: 'none'
      },
      arriveDeliveryIds: []
    },
    2: {
      time: { hour: 6, minute: 0 },
      spawn: { station: 'sideDoorButton', offsetX: -2.6, offsetZ: 1.0, lookAtStation: 'sideDoorButton' },
      tutorialScript: {
        deliveries: [
          {
            id: 'tut_ch2_wh',
            type: 'warehouse',
            driverName: 'Alex Mercer',
            driverGender: 'male',
            dockBay: 1,
            palletCount: 6,
            forcePattern: ['F', 'C', 'D'],
            etaHour: 6,
            etaMinute: 0,
            invoiceNo: '010011'
          }
        ],
        nightDrops: [],
        homeOfficeTasks: [],
        backstock: 'none',
        claimsItems: 'none'
      },
      arriveDeliveryIds: ['tut_ch2_wh']
    },
    3: {
      time: { hour: 6, minute: 5 },
      spawn: { station: 'sideDoorButton', offsetX: -2.6, offsetZ: 1.0, lookAtStation: 'sideDoorButton' },
      tutorialScript: {
        deliveries: [
          {
            id: 'tut_ch3_sd',
            type: 'sidedoor',
            vendorNo: '143',
            driverName: 'Jordan Reyes',
            etaHour: 6,
            etaMinute: 5,
            invoiceNo: '900143',
            hasCredit: false
          }
        ],
        nightDrops: [],
        homeOfficeTasks: [],
        backstock: 'none',
        claimsItems: 'none'
      },
      arriveDeliveryIds: ['tut_ch3_sd']
    },
    4: {
      time: { hour: 6, minute: 10 },
      spawn: { station: 'sideDoorButton', offsetX: -2.6, offsetZ: 1.0, lookAtStation: 'sideDoorButton' },
      tutorialScript: {
        deliveries: [
          {
            id: 'tut_ch4_vt',
            type: 'vendor_truck',
            vendorNo: '201',
            driverName: 'Marcus Vance',
            dockBay: 2,
            etaHour: 6,
            etaMinute: 10,
            invoiceNo: '900201',
            items: [
              { code: '20101', name: 'Organic Whole Milk Gal', qty: 16, cases: 2, unitsPerCase: 8, price: 4.50, type: 'refrigerated' },
              { code: '4011', name: 'Fresh Bananas 40lb Case', qty: 16, cases: 2, unitsPerCase: 8, price: 2.25, type: 'refrigerated', notScannable: true }
            ]
          }
        ],
        nightDrops: [],
        homeOfficeTasks: [],
        backstock: 'none',
        claimsItems: 'none'
      },
      arriveDeliveryIds: ['tut_ch4_vt']
    },
    5: {
      time: { hour: 6, minute: 20 },
      spawn: { station: 'sideDoorButton', offsetX: -2.6, offsetZ: 1.0, lookAtStation: 'sideDoorButton' },
      tutorialScript: {
        deliveries: [
          {
            id: 'tut_ch5_dc',
            type: 'sidedoor',
            vendorNo: '154',
            driverName: 'Carla Ortiz',
            etaHour: 6,
            etaMinute: 20,
            invoiceNo: '900154',
            items: [
              { code: '15401', name: 'Kettle Sea Salt Chips', qty: 24, cases: 3, unitsPerCase: 8, price: 3.25, type: 'ambient' },
              { code: '15402', name: 'BBQ Ridge Crisps', qty: 16, cases: 2, unitsPerCase: 8, price: 3.49, type: 'ambient' }
            ],
            shortage: { itemIndex: 0, dropCases: 1 },
            overage: { itemIndex: 1, addCases: 1 },
            hasCredit: true,
            creditQty: 2
          }
        ],
        nightDrops: [],
        homeOfficeTasks: [],
        backstock: 'none',
        claimsItems: 'none'
      },
      arriveDeliveryIds: ['tut_ch5_dc']
    },
    6: {
      time: { hour: 6, minute: 30 },
      spawn: { station: 'terminal', offsetX: -2.4, offsetZ: 0.0, lookAtStation: 'terminal' },
      tutorialScript: {
        deliveries: [],
        nightDrops: [{ vendorNo: '143', invoiceNo: '880143' }],
        homeOfficeTasks: [{ id: 'tut_ch6_ho1', type: 'shortage', isVendorShort: true, fromArchive: true, releaseMinute: 360 }],
        backstock: 'none',
        claimsItems: 'none'
      },
      arriveDeliveryIds: []
    },
    7: {
      time: { hour: 6, minute: 45 },
      spawn: { station: 'claimsSteel', offsetX: 0.0, offsetZ: -2.3, lookAtStation: 'claimsSteel' },
      tutorialScript: {
        deliveries: [],
        nightDrops: [],
        homeOfficeTasks: [],
        backstock: { seedSupply: true, supplyCount: 2, dry: 0, cooler: 0, freezer: 0 },
        claimsItems: [
          { toteIndex: 0, code: '10011', name: 'Crushed Cereal Box', deptNo: '01', price: 4.29, type: 'ambient', damageType: 'dented', conditionLabel: 'Dented' },
          { toteIndex: 4, code: '20011', name: 'Leaking Dairy Jug', deptNo: '20', vendorNo: '201', price: 4.50, type: 'refrigerated', damageType: 'leaking', conditionLabel: 'Leaking' }
        ],
        recall: { autoTrigger: false, count: 8 }
      },
      arriveDeliveryIds: []
    },
    8: {
      time: { hour: 12, minute: 0 },
      spawn: { station: 'drySteel', offsetX: 0.0, offsetZ: -2.3, lookAtStation: 'drySteel' },
      tutorialScript: {
        deliveries: [],
        nightDrops: [],
        homeOfficeTasks: [
          { id: 'tut_ch8_ho1', type: 'shortage', isVendorShort: true, fromArchive: true, releaseMinute: 360 },
          { id: 'tut_ch8_ho2', type: 'receipt_not_found', isDnr: true, fromArchive: true, releaseMinute: 360 }
        ],
        backstock: { seedSupply: false, dry: 1, cooler: 1, freezer: 0 },
        claimsItems: 'none'
      },
      arriveDeliveryIds: []
    }
  };

  const STEP_INTERACT_CONFIG = {
    gui_clock: { targetSel: '#retro-digital-clock', openSel: '#retro-digital-clock.calendar-open', keys: ['c'], triggerHover: true },
    gui_remaining_work: { targetSel: '#hud-remaining-tracker', openSel: '#hud-remaining-tracker.legend-open', keys: ['k'], triggerHover: true },
    gui_message_log: { targetSel: '#hud-msg-center', openSel: '#hud-msg-center.open', keys: ['m', 'l'], triggerHover: false },
    gui_pending_deliveries: { targetSel: '#pending-deliveries-panel', openSel: '#pending-deliveries-panel:not(.collapsed)', keys: ['p'], triggerHover: false },
    gui_doors_queue: { targetSel: '#door-lights-panel', openSel: '#door-lights-panel.beacons-open', keys: ['b'], triggerHover: true },
    gui_system_menu: { targetSel: '#pause-menu-btn', openSel: null, keys: ['escape'], triggerHover: false }
  };

  function resolveCommandBarSpotlight(parentSpec, subOpenSelector, subSpec, modalOverrideSpec) {
    if (typeof document !== 'undefined') {
      if (modalOverrideSpec && modalOverrideSpec.open && document.querySelector(modalOverrideSpec.selector)) {
        return [modalOverrideSpec];
      }
      if (subOpenSelector && document.querySelector(subOpenSelector) && document.querySelector(subSpec.selector)) {
        return [subSpec];
      }
    }
    return [parentSpec];
  }

  function hasInteractedWithControl(stepId) {
    if (state.seenActions[stepId]) return true;
    const cfg = STEP_INTERACT_CONFIG[stepId];
    if (!cfg || typeof document === 'undefined' || !cfg.openSel) return false;
    const isNowOpen = Boolean(document.querySelector(cfg.openSel));
    const wasInitiallyOpen = Boolean(state.stepInitialOpen && state.stepInitialOpen[stepId]);
    if (isNowOpen !== wasInitiallyOpen) {
      state.seenActions[stepId] = true;
      return true;
    }
    return false;
  }

  function markStepMinimized(stepId) {
    if (state.collapsed) {
      state.seenActions[stepId + '_minimized'] = true;
    }
  }

  function isStepMinimizedOrProgressed(stepId, progressed) {
    return Boolean(state.collapsed || state.seenActions[stepId + '_minimized'] || progressed);
  }

  function resolveMinimizeClearedSpotlights(stepId, defaultSpec, modalOverrideSpec) {
    if (modalOverrideSpec && modalOverrideSpec.open) {
      return [modalOverrideSpec];
    }
    if (state.collapsed || state.seenActions[stepId + '_minimized']) {
      return [];
    }
    return [defaultSpec];
  }

  // =========================================================================
  // 8-CHAPTER STEP DEFINITIONS
  // =========================================================================
  const STEPS = [
    // CHAPTER 1: SCREEN TOUR (Controls -> Command Bar Walkthrough -> Minimap & Stations)
    {
      id: 'gui_controls',
      chapter: 1,
      title: '1.1 Dock Controls: Movement & Mouse-Look',
      desc: 'Practice moving and looking around the 3D dock before touring the HUD:\n- Walk: [[key:W]] [[key:A]] [[key:S]] [[key:D]] or [[key:Arrow Keys]]\n- Mouse-Look: Click the 3D dock (or **Click to lock mouse**); hold [[key:Ctrl]] or press [[key:ESC]] to free cursor\n- Actions: [[key:E]] (or Left-Click) interact · [[key:F]] Scanner · [[key:Space]] Pallet Jack',
      hudSpotlights: () => {
        if (typeof document !== 'undefined') {
          const lh = document.querySelector('#lock-hint');
          if (lh && lh.style.display !== 'none') {
            const rect = lh.getBoundingClientRect ? lh.getBoundingClientRect() : null;
            if (rect && rect.width > 0 && rect.height > 0) {
              return [{ selector: '#lock-hint', label: 'MOUSE-LOOK TOGGLE', role: 'target' }];
            }
          }
        }
        return [{ selector: '#command-ribbon-bg', label: 'DOCK CONTROLS & HUD', role: 'target', padding: 0 }];
      },
      worldTarget: () => null,
      checklist: (rt) => {
        const init = state.stepInitialPlayer;
        const p = rt && rt.player;
        if (init && p) {
          if (Number.isFinite(p.x) && Number.isFinite(p.z) && Math.hypot(p.x - init.x, p.z - init.z) > 0.35) {
            state.seenActions.gui_controls_move = true;
          }
          if (
            (Number.isFinite(p.yaw) && Math.abs(p.yaw - init.yaw) > 0.08) ||
            (Number.isFinite(p.pitch) && Math.abs(p.pitch - init.pitch) > 0.06)
          ) {
            state.seenActions.gui_controls_look = true;
          }
        }
        return [
          { label: 'Walk around with W A S D or Arrow keys (optional)', done: Boolean(state.seenActions.gui_controls_move) },
          { label: 'Click 3D dock / pill & look with Mouse (optional), then click Next', done: Boolean(state.seenActions.gui_controls_look) }
        ];
      }
    },
    {
      id: 'gui_intro',
      chapter: 1,
      title: '1.2 Command Bar Overview',
      desc: 'Welcome to your **Command Bar** — your live dispatch ribbon across the top of the screen. Next, we will step through every panel from **left to right** so you know how each panel works and its shortcut key.',
      hudSpotlights: () => [{ selector: '#command-ribbon-bg', label: 'COMMAND BAR', role: 'target', padding: 0 }],
      worldTarget: () => null,
      checklist: () => [
        { label: 'Click Next to tour the Shift Clock [C] on the far left', done: false }
      ]
    },
    {
      id: 'gui_clock',
      chapter: 1,
      title: '1.3 Shift Clock & Calendar [C]',
      desc: 'Top-left shift timer and calendar panel:\n- Regular shift runs `6:00 AM` to `2:00 PM` (punch out free at `12:00 PM` when done)\n- Overtime (`2:00 PM` to `3:00 PM`) pulses red, ending in a forced clock-out at `3:00 PM`\n- Hover the clock or press [[key:C]] to view the **February 1996 Calendar** (`TUTORIAL` during training)',
      hudSpotlights: () => resolveCommandBarSpotlight(
        { selector: '#retro-digital-clock', label: 'SHIFT CLOCK [C]', role: 'target' },
        '#retro-digital-clock.calendar-open',
        { selector: '#hud-clock-calendar', label: 'FEBRUARY 1996 CALENDAR', role: 'target' }
      ),
      worldTarget: () => null,
      checklist: () => [
        { label: 'Hover Clock or press [C] for Calendar (optional), then click Next', done: hasInteractedWithControl('gui_clock') }
      ]
    },
    {
      id: 'gui_remaining_work',
      chapter: 1,
      title: '1.4 Remaining Work & Points [K]',
      desc: 'Live **PTS** score, total items **LEFT**, and category counters left to right:\n- Side-Door Vendors, Vendor Trucks, Warehouse Trucks, HO Tasks, Claims & Overstock\n- Daily checklists: Inventory (`N/Y`) and Filing (`N/Y`)\n- Hover the tracker or press [[key:K]] for the Work Guide',
      hudSpotlights: () => resolveCommandBarSpotlight(
        { selector: '#hud-remaining-tracker', label: 'REMAINING WORK [K]', role: 'target' },
        '#hud-remaining-tracker.legend-open',
        { selector: '#hud-remaining-legend', label: 'REMAINING WORK GUIDE', role: 'target' }
      ),
      worldTarget: () => null,
      checklist: () => [
        { label: 'Hover Tracker or press [K] for Work Legend (optional), then click Next', done: hasInteractedWithControl('gui_remaining_work') }
      ]
    },
    {
      id: 'gui_message_log',
      chapter: 1,
      title: '1.5 Message Log [M] / [L]',
      desc: 'Center dispatch bar showing live dock alerts, truck arrivals, door alarms, and compliance updates:\n- Click the bar or press [[key:M]] / [[key:L]] anytime to filter past messages',
      hudSpotlights: () => resolveCommandBarSpotlight(
        { selector: '#hud-msg-bar', label: 'MESSAGE LOG [M]', role: 'target' },
        '#hud-msg-center.open',
        { selector: '#hud-msg-drawer', label: 'MESSAGE LOG HISTORY', role: 'target' }
      ),
      worldTarget: () => null,
      checklist: () => [
        { label: 'Click Message Log or press [M] (optional), then click Next', done: hasInteractedWithControl('gui_message_log') }
      ]
    },
    {
      id: 'gui_pending_deliveries',
      chapter: 1,
      title: '1.6 Pending Deliveries [P]',
      desc: 'Tracks scheduled Warehouse Trucks and DSD Vendors with ETAs, assigned dock/door, priority warnings, and countdowns:\n- Click the panel or press [[key:P]] to expand the full schedule',
      hudSpotlights: () => resolveCommandBarSpotlight(
        { selector: '#pending-deliveries-panel', label: 'PENDING DELIVERIES [P]', role: 'target' },
        '#pending-deliveries-panel:not(.collapsed)',
        { selector: '#pending-deliveries-list', label: 'DELIVERY SCHEDULE LIST', role: 'target' }
      ),
      worldTarget: () => null,
      checklist: () => [
        { label: 'Click Pending Deliveries or press [P] (optional), then click Next', done: hasInteractedWithControl('gui_pending_deliveries') }
      ]
    },
    {
      id: 'gui_doors_queue',
      chapter: 1,
      title: '1.7 Dock Beacons & Queue [B]',
      desc: 'Live door status for **Docks `1`–`4`** and **Side Door**, plus **`WH` / `VT` / `SD`** arrival lights:\n- **Green:** Closed & empty · **Flashing Amber:** Driver waiting\n- **Amber:** Open & active · **Red / Flashing Red:** Open & empty (`5+ min` alarm)\n- Hover the panel or press [[key:B]] for the legend and queue count',
      hudSpotlights: (rt) => resolveCommandBarSpotlight(
        { selector: '#door-lights-panel', label: 'DOCK BEACONS & QUEUE [B]', role: 'target' },
        '#door-lights-panel.beacons-open',
        { selector: '#hud-door-lights-popup', label: 'SIDE DOOR QUEUE & KEY', role: 'target' },
        { open: Boolean(rt && rt.modals && rt.modals.doorQueueOpen), selector: '#door-queue-modal', label: 'SIDE DOOR ENTRY QUEUE', role: 'target' }
      ),
      worldTarget: () => null,
      checklist: () => [
        { label: 'Hover Dock Beacons or press [B] for key (optional), then click Next', done: hasInteractedWithControl('gui_doors_queue') }
      ]
    },
    {
      id: 'gui_system_menu',
      chapter: 1,
      title: '1.8 System & Pause Menu [ESC]',
      desc: 'Far-right pause and audio controls:\n- Click **SYSTEM MENU** or press [[key:ESC]] to pause, adjust SFX & Music sliders, or exit\n- Campaign Save & Load stay safely locked during Tutorial Mode',
      hudSpotlights: () => [{ selector: '#pause-menu-btn', label: 'SYSTEM MENU [ESC]', role: 'target' }],
      worldTarget: () => null,
      checklist: () => {
        if (!state.seenActions.gui_system_menu && global.DSDGame && typeof global.DSDGame.isPauseMenuOpen === 'function' && global.DSDGame.isPauseMenuOpen()) {
          state.seenActions.gui_system_menu = true;
        }
        return [
          { label: 'Click System Menu or press [ESC] (optional), then click Next for Dock Minimap', done: Boolean(state.seenActions.gui_system_menu) }
        ];
      }
    },
    {
      id: 'gui_minimap',
      chapter: 1,
      title: '1.9 Dock Minimap Overview',
      desc: 'Below **System Menu** sits your live **Dock Minimap** with blueprint callouts:\n- **North:** Docks `1`–`4` truck stalls & rollup doors\n- **Middle:** Dry Dock work floor, Side Door, Freezer & Cooler\n- **South:** Employee Hallway, Timeclock & your live facing arrow',
      hudSpotlights: () => [{ selector: '#minimap-container', label: 'DOCK MINIMAP', role: 'target' }],
      minimapCallouts: () => [
        {
          label: 'DOCKS 1–4',
          u: 1 / 11,
          v: 0.18,
          dropUs: [1 / 11, 4 / 11, 7 / 11, 10 / 11],
          dropV: 0.39,
          color: '#4ade80'
        },
        { label: 'DRY DOCK AREA', u: 0.44, v: 0.50, color: '#e2e8f0' },
        { label: 'SIDE DOOR', u: 0.96, v: 0.54, color: '#facc15' },
        { label: 'FREEZER', u: 0.18, v: 0.77, color: '#38bdf8' },
        { label: 'COOLER', u: 0.64, v: 0.82, color: '#2dd4bf' },
        { label: 'HALLWAY', u: 0.36, v: 0.94, color: '#cbd5e1' },
        { label: 'TIMECLOCK', u: 0.97, v: 0.96, side: 'south', color: '#fb923c' }
      ],
      worldTarget: () => null,
      checklist: () => [
        { label: 'Review the Dock Minimap zones, then click Next to locate Dock Stations', done: false }
      ]
    },
    {
      id: 'gui_stations_look',
      chapter: 1,
      title: '1.10 Locate Computer Desk & Side Door',
      desc: 'Walk onto the **Main Dock** to locate the **Computer Desk** and **Side Door** along the **East wall**:\n- Moving automatically docks this window to the **bottom-center** so your view stays clear\n- Click **▲** or that bottom bar anytime to reopen (also pops back up on arrival)',
      hudSpotlights: () => [],
      onTick: (rt) => {
        const p = rt && rt.player;
        const st = rt && rt.stations ? rt.stations : {};
        const t = st.terminal || null;
        const sd = st.sideDoor || st.sideDoorButton || null;
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
        const nearDesk = Boolean(t && Math.hypot(p.x - t.x, p.z - t.z) < 2.8);
        const nearSide = Boolean(sd && Math.hypot(p.x - sd.x, p.z - sd.z) < 2.8);
        let newlyReached = false;
        if (nearDesk && !state.seenActions.gui_stations_desk) {
          state.seenActions.gui_stations_desk = true;
          newlyReached = true;
        }
        if (nearSide && !state.seenActions.gui_stations_side) {
          state.seenActions.gui_stations_side = true;
          newlyReached = true;
        }
        const bothDone = Boolean(state.seenActions.gui_stations_desk && state.seenActions.gui_stations_side);
        if (newlyReached) {
          state.collapsed = false;
          state.seenActions.gui_stations_moveBase = { x: p.x, z: p.z };
          state.seenActions.gui_stations_hidThisLeg = false;
          return;
        }
        if (!bothDone && !nearDesk && !nearSide && !state.seenActions.gui_stations_hidThisLeg) {
          const base = state.seenActions.gui_stations_moveBase || state.stepInitialPlayer;
          if (base && Number.isFinite(base.x) && Number.isFinite(base.z) && Math.hypot(p.x - base.x, p.z - base.z) > 0.35) {
            state.seenActions.gui_stations_hidThisLeg = true;
            state.collapsed = true;
            if (!state.seenActions.gui_stations_notifiedHide) {
              state.seenActions.gui_stations_notifiedHide = true;
              if (global.DSDMessages && typeof global.DSDMessages.push === 'function') {
                global.DSDMessages.push('[[ico:book]] Tutorial docked to bottom-center while moving — click ▲ below anytime to reopen (auto-reopens at destination).', 'status', { silent: true });
              }
            }
          }
        }
      },
      worldTarget: (rt) => {
        const p = rt && rt.player;
        const st = rt && rt.stations ? rt.stations : {};
        const t = st.terminal || null;
        const sd = st.sideDoor || st.sideDoorButton || null;
        const nearDesk = Boolean(p && t && Math.hypot(p.x - t.x, p.z - t.z) < 2.8);
        const nearSide = Boolean(p && sd && Math.hypot(p.x - sd.x, p.z - sd.z) < 2.8);
        const deskDone = Boolean(state.seenActions.gui_stations_desk || nearDesk);
        const sideDone = Boolean(state.seenActions.gui_stations_side || nearSide);
        if (!deskDone) return t || sd;
        if (!sideDone) return sd || t;
        return null;
      },
      checklist: (rt) => {
        const p = rt && rt.player;
        const st = rt && rt.stations ? rt.stations : {};
        const t = st.terminal || null;
        const sd = st.sideDoor || st.sideDoorButton || null;
        if (p && t && Math.hypot(p.x - t.x, p.z - t.z) < 2.8) {
          state.seenActions.gui_stations_desk = true;
        }
        if (p && sd && Math.hypot(p.x - sd.x, p.z - sd.z) < 2.8) {
          state.seenActions.gui_stations_side = true;
        }
        return [
          { label: 'Locate & walk near the Computer Desk (East wall)', done: Boolean(state.seenActions.gui_stations_desk) },
          { label: 'Locate & walk near the Side Door (East wall)', done: Boolean(state.seenActions.gui_stations_side) }
        ];
      },
      isComplete: (rt) => {
        const p = rt && rt.player;
        const st = rt && rt.stations ? rt.stations : {};
        const t = st.terminal || null;
        const sd = st.sideDoor || st.sideDoorButton || null;
        if (p && t && Math.hypot(p.x - t.x, p.z - t.z) < 2.8) {
          state.seenActions.gui_stations_desk = true;
        }
        if (p && sd && Math.hypot(p.x - sd.x, p.z - sd.z) < 2.8) {
          state.seenActions.gui_stations_side = true;
        }
        return Boolean(state.seenActions.gui_stations_desk && state.seenActions.gui_stations_side);
      }
    },

    // CHAPTER 2: WAREHOUSE TRUCKS
    {
      id: 'wh_admit_driver',
      chapter: 2,
      title: '2.1 Open Side Door, Admit Driver & Close Behind',
      desc: 'A **Dept 01 Apex Logistics** trailer (`6` pallets) is at **Dock 1** and driver **Alex Mercer** is waiting outside the **Side Door**:\n- **Begin:** Hold [[key:Ctrl]] or press [[key:ESC]] to free your cursor, then click the down arrow **▼** (top-right) to minimize this window and clear your view\n- Press [[key:E]] on the switch to open the Side Door, click the driver [[key:E]] to let them inside, wait for them to clear the doorway, then press [[key:E]] to **close the Side Door behind them**',
      onTick: () => markStepMinimized('wh_admit_driver'),
      hudSpotlights: (rt) => resolveMinimizeClearedSpotlights(
        'wh_admit_driver',
        { selector: '#door-lights-panel', label: 'SD LIGHT AMBER · WH WAITING', role: 'target' },
        { open: Boolean(rt && rt.modals && rt.modals.doorQueueOpen), selector: '#door-queue-modal', label: 'CLICK LET IN TO ADMIT DRIVER', role: 'target' }
      ),
      worldTarget: (rt) => {
        const wh = findDelivery('tut_ch2_wh');
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        const admitted = Boolean((sess && sess.state !== 'OUTSIDE_WAITING') || (wh && wh.completed));
        const cleared = Boolean(
          (sess && !['OUTSIDE_WAITING', 'ENTERING'].includes(sess.state)) ||
          (sess && sess.state === 'ENTERING' && sess.driverPos && rt.stations.sideDoor && sess.driverPos.x < rt.stations.sideDoor.x - 1.0) ||
          (wh && wh.completed)
        );
        if (!admitted) {
          return !rt.sideDoor.isOpen ? rt.stations.sideDoorButton : ((sess && sess.driverPos) || rt.stations.sideDoor);
        }
        if (!cleared) return (sess && sess.driverPos) || rt.stations.sideDoor;
        if (rt.sideDoor.isOpen) return rt.stations.sideDoorButton;
        return (sess && sess.driverPos) || rt.stations.dockDoor1;
      },
      checklist: (rt) => {
        const wh = findDelivery('tut_ch2_wh');
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        const admitted = Boolean((sess && sess.state !== 'OUTSIDE_WAITING') || (wh && wh.completed));
        const cleared = Boolean(
          (sess && !['OUTSIDE_WAITING', 'ENTERING'].includes(sess.state)) ||
          (sess && sess.state === 'ENTERING' && sess.driverPos && rt.stations.sideDoor && sess.driverPos.x < rt.stations.sideDoor.x - 1.0) ||
          (wh && wh.completed)
        );
        const pastCheckin = Boolean((sess && !['OUTSIDE_WAITING', 'ENTERING', 'WAITING_CHECKIN'].includes(sess.state)) || (wh && wh.completed));
        const minimized = isStepMinimizedOrProgressed('wh_admit_driver', admitted || pastCheckin || (wh && wh.completed));
        return [
          { label: 'Free cursor & click ▼ to minimize tutorial window', done: minimized },
          { label: 'Open Side Rollup Door [E]', done: Boolean(rt.sideDoor.isOpen || admitted) },
          { label: 'Click Alex Mercer outside [E] & let them inside', done: admitted },
          { label: 'Close Side Door behind driver [E]', done: Boolean((cleared && !rt.sideDoor.isOpen) || pastCheckin) }
        ];
      },
      isComplete: (rt) => {
        const wh = findDelivery('tut_ch2_wh');
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        const admitted = Boolean((sess && sess.state !== 'OUTSIDE_WAITING') || (wh && wh.completed));
        const cleared = Boolean(
          (sess && !['OUTSIDE_WAITING', 'ENTERING'].includes(sess.state)) ||
          (sess && sess.state === 'ENTERING' && sess.driverPos && rt.stations.sideDoor && sess.driverPos.x < rt.stations.sideDoor.x - 1.0) ||
          (wh && wh.completed)
        );
        const pastCheckin = Boolean((sess && !['OUTSIDE_WAITING', 'ENTERING', 'WAITING_CHECKIN'].includes(sess.state)) || (wh && wh.completed));
        return Boolean((wh && wh.completed) || pastCheckin || (admitted && cleared && !rt.sideDoor.isOpen));
      }
    },
    {
      id: 'wh_open_bay',
      chapter: 2,
      title: '2.2 Check In Driver, Walk to Dock 1 & Open Door',
      desc: 'Check in the driver inside and open **Dock 1**:\n- **Begin:** Hold [[key:Ctrl]] or press [[key:ESC]] to free your cursor, then click **▼** (top-right) to minimize this window and clear your view\n- Click **Alex Mercer** [[key:E]] to check in for **Dock 1**, walk over to **Dock 1** together, and press [[key:E]] on Dock 1\'s green switch to open the trailer',
      onTick: () => markStepMinimized('wh_open_bay'),
      hudSpotlights: () => resolveMinimizeClearedSpotlights(
        'wh_open_bay',
        { selector: '#door-lights-panel', label: 'DOCK 1 AMBER = READY', role: 'target' }
      ),
      worldTarget: (rt) => {
        const bay1 = (rt.doors || []).find((d) => d.id === 1);
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        const checkedIn = Boolean(sess && !['OUTSIDE_WAITING', 'ENTERING', 'WAITING_CHECKIN'].includes(sess.state));
        if (!checkedIn && sess && sess.driverPos) return sess.driverPos;
        if (bay1 && !bay1.isOpen) return rt.stations.dockButton1;
        return rt.stations.dockDoor1;
      },
      checklist: (rt) => {
        const bay1 = (rt.doors || []).find((d) => d.id === 1);
        const wh = findDelivery('tut_ch2_wh');
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        const p = rt && rt.player;
        const d1 = rt && rt.stations ? rt.stations.dockDoor1 : null;
        const checkedIn = Boolean((sess && !['OUTSIDE_WAITING', 'ENTERING', 'WAITING_CHECKIN'].includes(sess.state)) || (wh && wh.completed));
        const nearBay1 = Boolean((bay1 && bay1.isOpen) || (checkedIn && p && d1 && Math.hypot(p.x - d1.x, p.z - d1.z) < 5.0) || (wh && wh.completed));
        const minimized = isStepMinimizedOrProgressed('wh_open_bay', checkedIn || (bay1 && bay1.isOpen) || (wh && wh.completed));
        return [
          { label: 'Free cursor & click ▼ to minimize tutorial window', done: minimized },
          { label: 'Click Alex Mercer [E] to check in for Dock 1', done: checkedIn },
          { label: 'Walk over to Dock 1 with the driver', done: nearBay1 },
          { label: 'Open Dock 1 door [E] to start unload', done: Boolean((bay1 && bay1.isOpen) || (wh && wh.completed)) }
        ];
      },
      isComplete: (rt) => {
        const bay1 = (rt.doors || []).find((d) => d.id === 1);
        const wh = findDelivery('tut_ch2_wh');
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        const checkedIn = Boolean((sess && !['OUTSIDE_WAITING', 'ENTERING', 'WAITING_CHECKIN'].includes(sess.state)) || (wh && wh.completed));
        return Boolean((wh && wh.completed) || (checkedIn && bay1 && bay1.isOpen));
      }
    },
    {
      id: 'wh_equip_jack',
      chapter: 2,
      title: '2.3 Trailer Temp Zones & Equip Walkie Jack',
      desc: 'Warehouse trailers carry **Frozen (`F`)**, **Chilled (`C`)**, and **Dry (`D`)** pallets inside:\n- Unload **Dry** pallets first so you can reach **Chilled** and **Frozen** behind the insulated curtains\n- Walk to the **West wall** charging station and press [[key:Space]] to equip the **Electric Pallet Jack**',
      hudSpotlights: () => [],
      worldTarget: (rt) => rt.player.hasElectricJack ? rt.stations.dockDoor1 : rt.stations.jackCharger,
      checklist: (rt) => [
        { label: 'Equip the Electric Pallet Jack [Space]', done: Boolean(rt.player.hasElectricJack) }
      ],
      isComplete: (rt) => Boolean(rt.player.hasElectricJack)
    },
    {
      id: 'wh_stage_pallets',
      chapter: 2,
      title: '2.4 Stage Dry (D), Cooler (C) & Freezer (F) Pallets',
      desc: 'Haul each pallet [[key:Space]] into its color-coded floor zone:\n- `D` Dry floor (drop Dry first to clear insulated curtains)\n- `C` Light Blue Cooler · `F` Dark Blue Freezer',
      hudSpotlights: () => [{ selector: '#hud-remaining-tracker', label: 'REMAINING PALLETS', role: 'target' }],
      worldTarget: (rt) => {
        const hitched = (rt.pallets || []).find((p) => p.isHitched);
        if (hitched) {
          if (hitched.targetZone === 'F') return rt.stations.freezerZone;
          if (hitched.targetZone === 'C') return rt.stations.coolerZone;
          return rt.stations.dryZone;
        }
        const nextPallet = (rt.pallets || []).find((p) => p.deliveryId === 'tut_ch2_wh' && p.status !== 'STAGED_CORRECT');
        if (nextPallet) return { x: nextPallet.x, y: 0.7, z: nextPallet.z };
        return rt.stations.dockDoor1;
      },
      checklist: (rt) => {
        const list = (rt.pallets || []).filter((p) => p.deliveryId === 'tut_ch2_wh');
        const staged = list.filter((p) => p.status === 'STAGED_CORRECT').length;
        const total = list.length || 6;
        return [
          { label: `Stage Warehouse pallets (${staged}/${total})`, done: list.length > 0 && staged >= total }
        ];
      },
      isComplete: (rt) => {
        const wh = findDelivery('tut_ch2_wh');
        const list = (rt.pallets || []).filter((p) => p.deliveryId === 'tut_ch2_wh');
        return Boolean((wh && wh.completed) || (list.length > 0 && list.every((p) => p.status === 'STAGED_CORRECT')));
      }
    },
    {
      id: 'wh_sign_close',
      chapter: 2,
      title: '2.5 Sign Warehouse BOL & Close Dock 1',
      desc: 'Wrap up the Dock 1 unload cleanly:\n- Walk up to the Warehouse driver [[key:E]] to open & sign the BOL\n- Let them head back out and close **Dock 1** [[key:E]] to avoid open-door alarms',
      hudSpotlights: (rt) => rt.modals.bolOpen ? [{ selector: '#bol-modal', label: 'SIGN BOL', role: 'target' }] : [],
      worldTarget: (rt) => {
        const whSess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        if (whSess && whSess.driverPos && !findDelivery('tut_ch2_wh')?.completed) return whSess.driverPos;
        return rt.stations.dockButton1;
      },
      checklist: (rt) => {
        const wh = findDelivery('tut_ch2_wh');
        const bay1 = (rt.doors || []).find((d) => d.id === 1);
        return [
          { label: 'Sign Warehouse BOL & complete delivery [E]', done: Boolean(wh && (wh.completed || wh.isFinalized)) },
          { label: 'Close Dock 1 door [E]', done: Boolean(wh && wh.completed && bay1 && !bay1.isOpen) }
        ];
      },
      isComplete: (rt) => {
        const wh = findDelivery('tut_ch2_wh');
        const bay1 = (rt.doors || []).find((d) => d.id === 1);
        return Boolean(wh && wh.completed && bay1 && !bay1.isOpen);
      }
    },

    // CHAPTER 3: SIDE DOOR VENDORS
    {
      id: 'sd_open_door',
      chapter: 3,
      title: '3.1 Open Side Rollup Door & Admit Vendor',
      desc: 'Dry vendor **V#143** is waiting outside the East **Side Rollup Door**:\n- Press [[key:E]] on the green switch to raise the door\n- Click the driver [[key:E]] to bring their cart inside',
      hudSpotlights: () => [{ selector: '#door-lights-panel', label: 'SD LIGHT AMBER', role: 'target' }],
      worldTarget: (rt) => {
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch3_sd');
        if (!rt.sideDoor.isOpen) return rt.stations.sideDoorButton;
        if (sess && sess.driverPos) return sess.driverPos;
        return rt.stations.sideDoor;
      },
      checklist: (rt) => {
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch3_sd');
        const d = findDelivery('tut_ch3_sd');
        const inCheckin = Boolean(sess && (sess.state === 'WAITING_SIGN' || sess.state === 'EXITING' || sess.state === 'COMPLETED')) || Boolean(d && (d.receiptCreated || d.completed));
        return [
          { label: 'Open Side Rollup Door [E]', done: Boolean(rt.sideDoor.isOpen || inCheckin) },
          { label: 'Let vendor roll cart to desk spot [E]', done: inCheckin }
        ];
      },
      isComplete: (rt) => {
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch3_sd');
        const d = findDelivery('tut_ch3_sd');
        return Boolean((sess && (sess.state === 'WAITING_SIGN' || sess.state === 'EXITING' || sess.state === 'COMPLETED')) || (d && (d.receiptCreated || d.completed)));
      }
    },
    {
      id: 'sd_scanner_header',
      chapter: 3,
      title: '3.2 Enter 5-Field Receipt Header on Scanner',
      desc: 'Open the invoice and create a receipt header:\n- Click the vendor or cart [[key:E]] for the **Paper Invoice**, then press [[key:F]] -> `1. CREATE RECEIPT`\n- Copy **Dept#, Vendor, Invoice, Units & Cost** into each highlighted field using [[key:ENT]]',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc) {
          if (sc.screen === 'create') return resolveScannerCreateCallouts(sc);
          if (sc.screen === 'home') return [{ selector: '[data-tut="sc-home-0"]', label: 'PRESS [1] CREATE RECEIPT', role: 'target' }];
        }
        if (rt.modals.invoiceOpen) {
          return [{ selector: '#btn-toggle-scanner-from-inv', label: 'OPEN SCANNER [F]', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => {
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch3_sd');
        return (sess && sess.driverPos) ? sess.driverPos : rt.stations.sideDoor;
      },
      checklist: () => {
        const d = findDelivery('tut_ch3_sd');
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        return [
          { label: 'Open Create Receipt on Scanner [F]', done: Boolean(sc && ['create', 'scanning', 'confirm-finalize', 'finalized'].includes(sc.screen)) },
          { label: 'Create Initial Receipt from Invoice header', done: Boolean(d && d.receiptCreated) }
        ];
      },
      isComplete: () => {
        const d = findDelivery('tut_ch3_sd');
        return Boolean(d && (d.receiptCreated || d.isFinalized || d.completed));
      }
    },
    {
      id: 'sd_scan_finalize_print',
      chapter: 3,
      title: '3.3 Scan Cases, Finalize [F5], Print [F6] & Hand Slip',
      desc: 'Scan and finalize the vendor cart:\n- Scan/click each box ([[key:SCAN]] / [[key:F]]), then press [[key:F5]] -> [[key:ENT]] to finalize\n- Press [[key:F6]] to print the Store Copy, collect from the printer, and hand to driver [[key:E]]',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc) {
          if (sc.screen === 'scanning') return [{ selector: '[data-tut="sc-scan-finalize"]', label: 'SCAN ITEMS THEN [F5] FINAL', role: 'target' }];
          if (sc.screen === 'finalized') return [{ selector: '#key-f6', label: 'PRESS [F6] PRINT', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => {
        const tray = global.DSDReceipts && global.DSDReceipts.getPrinterTrayCount ? global.DSDReceipts.getPrinterTrayCount() : 0;
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch3_sd');
        if (tray > 0) return rt.stations.printer;
        if (sess && sess.cartPos && !findDelivery('tut_ch3_sd')?.isFinalized) return sess.cartPos;
        if (sess && sess.driverPos && !findDelivery('tut_ch3_sd')?.completed) return sess.driverPos;
        return rt.stations.sideDoorButton;
      },
      checklist: (rt) => {
        const d = findDelivery('tut_ch3_sd');
        const handed = Boolean(d && d.isFinalized && global.DSDReceipts && global.DSDReceipts.areAllRequiredReceiptsHanded && global.DSDReceipts.areAllRequiredReceiptsHanded(d));
        return [
          { label: 'Scan boxes & finalize receipt [F5]', done: Boolean(d && d.isFinalized) },
          { label: 'Print [F6], collect slip & hand to driver [E]', done: handed },
          { label: 'Let driver exit & close Side Door [E]', done: Boolean(d && d.completed && !rt.sideDoor.isOpen) }
        ];
      },
      isComplete: (rt) => {
        const d = findDelivery('tut_ch3_sd');
        return Boolean(d && d.completed && !rt.sideDoor.isOpen);
      }
    },

    // CHAPTER 4: TEMP ZONES & PRODUCE
    {
      id: 'tz_dock_driver',
      chapter: 4,
      title: '4.1 Check In Cold Truck V#201 & Open Dock 2',
      desc: 'Refrigerated truck **V#201** is at **Dock 2** while the driver waits at the **Side Door**:\n- Open the **Side Door** [[key:E]] and click the driver to check them in\n- Open **Dock 2** [[key:E]] so their trailer door opens',
      hudSpotlights: () => [{ selector: '#door-lights-panel', label: 'SD & DOCK 2 LIGHTS', role: 'target' }],
      worldTarget: (rt) => {
        const bay2 = (rt.doors || []).find((d) => d.id === 2);
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch4_vt');
        if (sess && sess.state === 'OUTSIDE_WAITING') {
          return !rt.sideDoor.isOpen ? rt.stations.sideDoorButton : (sess.driverPos || rt.stations.sideDoor);
        }
        if (sess && (sess.state === 'ENTERING' || sess.state === 'WAITING_CHECKIN')) {
          return sess.driverPos || rt.stations.dockDoor2 || rt.stations.dockDoor1;
        }
        if (bay2 && !bay2.isOpen) return rt.stations.dockButton2 || rt.stations.dockDoor2 || rt.stations.dockDoor1;
        if (sess && sess.driverPos) return sess.driverPos;
        return rt.stations.dockDoor2 || rt.stations.dockDoor1;
      },
      checklist: (rt) => {
        const bay2 = (rt.doors || []).find((d) => d.id === 2);
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch4_vt');
        const d = findDelivery('tut_ch4_vt');
        const checkedIn = Boolean((sess && sess.state && !['OUTSIDE_WAITING', 'ENTERING', 'WAITING_CHECKIN'].includes(sess.state)) || (d && (d.receiptCreated || d.completed)));
        const atCheckin = Boolean((sess && (sess.state === 'WAITING_SIGN' || sess.state === 'EXITING' || sess.state === 'COMPLETED')) || (d && (d.receiptCreated || d.completed)));
        return [
          { label: 'Admit & check in V#201 driver at Side Door [E]', done: checkedIn },
          { label: 'Open Dock 2 [E] so pallet reaches check-in', done: Boolean((bay2 && bay2.isOpen) || atCheckin) }
        ];
      },
      isComplete: (rt) => {
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch4_vt');
        const d = findDelivery('tut_ch4_vt');
        return Boolean((sess && (sess.state === 'WAITING_SIGN' || sess.state === 'EXITING' || sess.state === 'COMPLETED')) || (d && (d.receiptCreated || d.completed)));
      }
    },
    {
      id: 'tz_probe_check',
      chapter: 4,
      title: '4.2 Mandatory Temp Probe Before Header Entry',
      desc: 'Cold deliveries (`C` Chilled / `F` Frozen) require a **Temp Probe check** first:\n- Open V#201\'s **Paper Invoice** [[key:E]] if closed\n- Click **[ TEMP PROBE ]** (`<= 40°F` Chilled, `<= 10°F` Frozen) before creating a receipt',
      hudSpotlights: () => [{ selector: '#btn-inv-temp', label: 'VERIFY COLD TEMP FIRST', role: 'target' }],
      worldTarget: (rt) => {
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch4_vt');
        return (sess && sess.driverPos) ? sess.driverPos : (rt.stations.dockDoor2 || null);
      },
      checklist: () => {
        const d = findDelivery('tut_ch4_vt');
        return [
          { label: 'Run Temp Probe on Paper Invoice', done: Boolean(d && (d.tempChecked || d.receiptCreated || d.completed)) }
        ];
      },
      isComplete: () => {
        const d = findDelivery('tut_ch4_vt');
        return Boolean(d && (d.tempChecked || d.receiptCreated || d.isFinalized || d.completed));
      }
    },
    {
      id: 'tz_plu_complete',
      chapter: 4,
      title: '4.3 Key Non-Scannable PLU Produce & Finish Delivery',
      desc: 'Receive produce items that lack a scannable UPC barcode:\n- Create the receipt on Scanner ([[key:1]]), then key **PLU code** `4011` manually for Bananas\n- Finalize, print, hand slip to driver, and close **Dock 2**',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc && sc.screen === 'scanning') {
          return [{ selector: '[data-tut="sc-field-productCode"]', label: 'KEY PLU CODE HERE', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => {
        const tray = global.DSDReceipts && global.DSDReceipts.getPrinterTrayCount ? global.DSDReceipts.getPrinterTrayCount() : 0;
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch4_vt');
        const d = findDelivery('tut_ch4_vt');
        const bay2 = (rt.doors || []).find((d2) => d2.id === 2);
        if (tray > 0) return rt.stations.printer;
        if (sess && sess.cartPos && d && !d.isFinalized) return sess.cartPos;
        if (sess && sess.driverPos && d && !d.completed) return sess.driverPos;
        if (bay2 && bay2.isOpen) return rt.stations.dockButton2 || rt.stations.dockDoor2;
        return rt.stations.dockDoor2 || rt.stations.dockDoor1;
      },
      checklist: (rt) => {
        const d = findDelivery('tut_ch4_vt');
        const bay2 = (rt.doors || []).find((d2) => d2.id === 2);
        return [
          { label: 'Create receipt & scan/key Chilled + PLU items', done: Boolean(d && d.isFinalized) },
          { label: 'Print, hand slip & close Dock 2 [E]', done: Boolean(d && d.completed && bay2 && !bay2.isOpen) }
        ];
      },
      isComplete: (rt) => {
        const d = findDelivery('tut_ch4_vt');
        const bay2 = (rt.doors || []).find((d2) => d2.id === 2);
        return Boolean(d && d.completed && bay2 && !bay2.isOpen);
      }
    },

    // CHAPTER 5: DISCREPANCIES & CREDITS
    {
      id: 'dc_shortage',
      chapter: 5,
      title: '5.1 Stamp Shortage & Flag Overage Case',
      desc: 'Admit vendor **V#154**, open their **Paper Invoice**, and audit physical cases:\n- Click **`- SHORT`** to stamp the 1 shorted case on line 1\n- Click **`+ OVER`** and flag the 1 extra physical box on the cart',
      hudSpotlights: (rt) => rt.modals.invoiceOpen
        ? [
          { selector: '#btn-inv-short', label: 'STAMP SHORTAGE', role: 'source' },
          { selector: '#btn-inv-over', label: 'FLAG OVERAGE CASE', role: 'target' }
        ]
        : [],
      worldTarget: (rt) => {
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch5_dc');
        if (!rt.sideDoor.isOpen) return rt.stations.sideDoorButton;
        return (sess && sess.driverPos) ? sess.driverPos : rt.stations.sideDoor;
      },
      checklist: () => {
        const d = findDelivery('tut_ch5_dc');
        const hasShort = Boolean(d && Array.isArray(d.invoiceItems) && d.invoiceItems.some((it) => it.shortageStamped));
        const hasOver = Boolean(d && Array.isArray(d.physicalBoxes) && d.physicalBoxes.some((b) => b.flaggedOverage || b.overageFlagged));
        return [
          { label: 'Stamp missing case on Invoice (- SHORT)', done: Boolean(hasShort || (d && (d.isFinalized || d.completed))) },
          { label: 'Flag excess box in world (+ OVER)', done: Boolean(hasOver || (d && (d.isFinalized || d.completed))) }
        ];
      },
      isComplete: () => {
        const d = findDelivery('tut_ch5_dc');
        const hasShort = Boolean(d && Array.isArray(d.invoiceItems) && d.invoiceItems.some((it) => it.shortageStamped));
        const hasOver = Boolean(d && Array.isArray(d.physicalBoxes) && d.physicalBoxes.some((b) => b.flaggedOverage || b.overageFlagged));
        return Boolean((hasShort && hasOver) || (d && (d.isFinalized || d.completed)));
      }
    },
    {
      id: 'dc_credit_memo',
      chapter: 5,
      title: '5.2 Scan Invoice Receipt & Minus [-] Credit Memo',
      desc: 'Handle returns cleanly on the **CREDIT** tab:\n- Finalize the regular receipt, then switch to the **CREDIT** tab on the invoice\n- Create & finalize a Credit Receipt using [[key:-]] for negative quantities\n- Print and hand both slips to the driver',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc && sc.screen === 'scanning') {
          return [{ selector: '[data-tut="sc-scan-credit"]', label: 'PRESS [-] FOR CREDIT', role: 'target' }];
        }
        if (rt.modals.invoiceOpen) {
          return [{ selector: '#inv-doc-tabs', label: 'SWITCH INVOICE / CREDIT TAB', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => {
        const tray = global.DSDReceipts && global.DSDReceipts.getPrinterTrayCount ? global.DSDReceipts.getPrinterTrayCount() : 0;
        const sess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch5_dc');
        if (tray > 0) return rt.stations.printer;
        return (sess && sess.creditTotePos) ? sess.creditTotePos : ((sess && sess.driverPos) ? sess.driverPos : rt.stations.sideDoorButton);
      },
      checklist: () => {
        const d = findDelivery('tut_ch5_dc');
        return [
          { label: 'Finalize regular receipt & negative Credit Memo', done: Boolean(d && d.docStates && d.docStates.invoiceCreated && d.docStates.creditCreated) },
          { label: 'Hand slips to driver & finish delivery', done: Boolean(d && d.completed) }
        ];
      },
      isComplete: () => Boolean(findDelivery('tut_ch5_dc')?.completed)
    },

    // CHAPTER 6: THE COMPUTER DESK
    {
      id: 'desk_night_drop',
      chapter: 6,
      title: '6.1 Night Drop Tray & Terminal [1] Create Receipt',
      desc: 'Process **Overnight / Night Drop** paperwork on the **East Desk**:\n- Inspect Night Drop invoices on the desk ([[key:E]])\n- Log into the **CRT Terminal** [[key:E]] -> `1. CREATE MANUAL RECEIPT` to key & finalize',
      hudSpotlights: (rt) => {
        const ts = global.DSDReceipts && global.DSDReceipts.getTerminalState ? global.DSDReceipts.getTerminalState() : null;
        if (rt.modals.terminalOpen && ts && ts.screen === 'menu') {
          return [{ selector: '[data-crt-nav="create"]', label: 'PRESS [1] CREATE RECEIPT', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => {
        const ndCnt = global.DSDReceipts && global.DSDReceipts.getNightDropCount ? global.DSDReceipts.getNightDropCount() : 0;
        return ndCnt > 0 ? rt.stations.nightDropTray : rt.stations.terminal;
      },
      checklist: () => {
        const ndCnt = global.DSDReceipts && global.DSDReceipts.getNightDropCount ? global.DSDReceipts.getNightDropCount() : 0;
        return [
          { label: 'Resolve & finalize Night Drop invoice in Terminal [1]', done: ndCnt === 0 }
        ];
      },
      isComplete: () => {
        const ndCnt = global.DSDReceipts && global.DSDReceipts.getNightDropCount ? global.DSDReceipts.getNightDropCount() : 0;
        return ndCnt === 0;
      }
    },
    {
      id: 'desk_archive_ho',
      chapter: 6,
      title: '6.2 File Cabinet Archive & Home Office Tasks [4]',
      desc: 'Audit past receipts for a Home Office inquiry:\n- Open the **File Cabinet Drawer** [[key:E]] and check for a red `SHORT` stamp\n- Resolve the open task under Terminal `4. RECEIVING TASKS & RECALLS`',
      hudSpotlights: (rt) => {
        const ts = global.DSDReceipts && global.DSDReceipts.getTerminalState ? global.DSDReceipts.getTerminalState() : null;
        if (rt.modals.terminalOpen && ts && ts.screen === 'menu') {
          return [{ selector: '[data-crt-nav="tasks"]', label: 'OPEN [4] TASKS & RECALLS', role: 'target' }];
        }
        if (rt.modals.terminalOpen && ts && ts.screen === 'tasks') {
          return [{ selector: '[data-tut="ho-btn-verify"]', label: 'VERIFY OR [ TRUE SHORTAGE ]', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => rt.modals.terminalOpen ? null : rt.stations.fileCabinet,
      checklist: () => {
        const pending = global.DSDReceipts && global.DSDReceipts.getPendingHomeOfficeTaskCount
          ? global.DSDReceipts.getPendingHomeOfficeTaskCount()
          : 0;
        return [
          { label: 'Verify or resolve Home Office Task in Terminal [4]', done: pending === 0 }
        ];
      },
      isComplete: () => {
        const pending = global.DSDReceipts && global.DSDReceipts.getPendingHomeOfficeTaskCount
          ? global.DSDReceipts.getPendingHomeOfficeTaskCount()
          : 0;
        return pending === 0;
      }
    },

    // CHAPTER 7: CLAIMS & RECALLS
    {
      id: 'cl_supplies',
      chapter: 7,
      title: '7.1 Slot Dept 60 Supplies & Order on Scanner [2]',
      desc: 'Restock store supplies:\n- Pick up floor **Dept 60 Supply cases** [[key:E]] and slot onto **Claims & Supplies Steel**\n- Open Scanner [[key:F]] -> `2. SUPPLY ORDERS` to submit a sample replenishment order',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc) {
          if (sc.screen === 'home') return [{ selector: '[data-tut="sc-home-1"]', label: 'PRESS [2] SUPPLY ORDERS', role: 'target' }];
          if (sc.screen === 'supply') return [{ selector: '[data-tut="sc-sup-order"]', label: 'ADD CASES THEN [F5] ORDER', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => rt.stations.claimsSteel,
      checklist: () => {
        const unplaced = global.BackstockRacks && global.BackstockRacks.getUnplacedSupplyCasesCount
          ? global.BackstockRacks.getUnplacedSupplyCasesCount()
          : 0;
        const ordered = global.DSDReceipts && global.DSDReceipts.isSupplyOrderSubmittedToday
          ? global.DSDReceipts.isSupplyOrderSubmittedToday()
          : false;
        return [
          { label: 'Slot Dept 60 supply cases on Claims Steel [E]', done: unplaced === 0 },
          { label: 'Submit Dept 60 order on Scanner Option 2', done: Boolean(ordered) }
        ];
      },
      isComplete: () => {
        const unplaced = global.BackstockRacks && global.BackstockRacks.getUnplacedSupplyCasesCount
          ? global.BackstockRacks.getUnplacedSupplyCasesCount()
          : 0;
        const ordered = global.DSDReceipts && global.DSDReceipts.isSupplyOrderSubmittedToday
          ? global.DSDReceipts.isSupplyOrderSubmittedToday()
          : false;
        return unplaced === 0 && Boolean(ordered);
      }
    },
    {
      id: 'cl_totes',
      chapter: 7,
      title: '7.2 Sort Damaged Claims Totes via Scanner [4]',
      desc: 'Process damaged merchandise:\n- Open gray shelf totes [[key:E]] and open Scanner [[key:F]] -> `4. MARKDOWN CLAIMS`\n- Scan each item for disposition, then drop it in the matching receptacle',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc) {
          if (sc.screen === 'home') return [{ selector: '[data-tut="sc-home-3"]', label: 'PRESS [4] MARKDOWN CLAIMS', role: 'target' }];
          if (sc.screen === 'damage') return [{ selector: '[data-tut="sc-dmg-code"]', label: 'SCAN OR KEY CLAIM CODE', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => rt.stations.claimsSteel,
      checklist: () => {
        const rem = global.ClaimsTotes && global.ClaimsTotes.getRemainingClaimsCount
          ? global.ClaimsTotes.getRemainingClaimsCount()
          : 0;
        return [
          { label: `Dispose remaining damaged claims items (${rem} left)`, done: rem === 0 }
        ];
      },
      isComplete: () => {
        const rem = global.ClaimsTotes && global.ClaimsTotes.getRemainingClaimsCount
          ? global.ClaimsTotes.getRemainingClaimsCount()
          : 0;
        return rem === 0;
      }
    },
    {
      id: 'cl_recall',
      chapter: 7,
      title: '7.3 Sort Triggered Product Recall & Submit Count',
      desc: 'Close out the active product recall:\n- Collect recalled units from the **Recall Cart** and dump the tote into its receptacle\n- Submit the exact count in CRT Terminal `4. RECEIVING TASKS & RECALLS`',
      onEnter: () => {
        const ct = global.ClaimsTotes;
        if (ct && typeof ct.getRecallState === 'function' && typeof ct.triggerDailyRecall === 'function') {
          const rec = ct.getRecallState();
          if (!rec || (!rec.active && !rec.completed)) {
            ct.triggerDailyRecall({ count: 8 });
          }
        }
      },
      hudSpotlights: (rt) => {
        const ts = global.DSDReceipts && global.DSDReceipts.getTerminalState ? global.DSDReceipts.getTerminalState() : null;
        if (rt.modals.terminalOpen && ts && ts.screen === 'tasks') {
          return [{ selector: '#crt-in-recall-count', label: 'ENTER EXACT RECALL COUNT', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => {
        const rec = global.ClaimsTotes && global.ClaimsTotes.getRecallState ? global.ClaimsTotes.getRecallState() : null;
        if (rec && rec.sorted) return rt.stations.terminal;
        return rt.stations.recallCart;
      },
      checklist: () => {
        const pending = global.ClaimsTotes && global.ClaimsTotes.hasPendingRecall ? global.ClaimsTotes.hasPendingRecall() : false;
        return [
          { label: 'Collect, dump & submit Recall unit count on Terminal [4]', done: !pending }
        ];
      },
      isComplete: () => !(global.ClaimsTotes && global.ClaimsTotes.hasPendingRecall && global.ClaimsTotes.hasPendingRecall())
    },

    // CHAPTER 8: BACKSTOCK & END-OF-DAY
    {
      id: 'bk_label_cases',
      chapter: 8,
      title: '8.1 Label Backstock Cases on Scanner [3 -> 1]',
      desc: 'Prepare overstock for steel binning:\n- Open Scanner [[key:F]] -> `3. BACKROOM INVENTORY` -> `1. LABEL CASES`\n- Scan/key floor backstock cases and press [[key:F6]] to apply labels',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc) {
          if (sc.screen === 'home') return [{ selector: '[data-tut="sc-home-2"]', label: 'PRESS [3] BACKROOM INVENTORY', role: 'target' }];
          if (sc.screen === 'inventory-menu') return [{ selector: '[data-tut="sc-inv-opt-0"]', label: 'SELECT [1] LABEL CASES', role: 'target' }];
          if (sc.screen === 'label-cases') return [{ selector: '[data-tut="sc-lbl-code"]', label: 'SCAN OR KEY CASE', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => rt.stations.drySteel,
      checklist: () => {
        const unlabeled = global.BackstockRacks && global.BackstockRacks.getUnlabeledBackstockCount
          ? global.BackstockRacks.getUnlabeledBackstockCount()
          : 0;
        return [
          { label: `Label floor backstock cases (${unlabeled} left)`, done: unlabeled === 0 }
        ];
      },
      isComplete: () => {
        const unlabeled = global.BackstockRacks && global.BackstockRacks.getUnlabeledBackstockCount
          ? global.BackstockRacks.getUnlabeledBackstockCount()
          : 0;
        return unlabeled === 0;
      }
    },
    {
      id: 'bk_slot_audit',
      chapter: 8,
      title: '8.2 Slot Steel Bins & Audit Backroom [3 -> 2]',
      desc: 'Bin overstock and audit backroom totals:\n- Pick up [[key:E]] and slot cases onto **Dry / Cooler Steel**\n- Open Scanner -> `2. AUDIT BACKROOM` and press [[key:F5]] to finalize',
      hudSpotlights: (rt) => {
        const sc = global.DSDReceipts && global.DSDReceipts.getScannerState ? global.DSDReceipts.getScannerState() : null;
        if (rt.modals.scannerOpen && sc && sc.screen === 'inventory') {
          return [{ selector: '[data-tut="sc-inv-upc"]', label: 'SCAN CASE -> [F5] FINALIZE', role: 'target' }];
        }
        return [];
      },
      worldTarget: (rt) => {
        const unslotted = global.BackstockRacks && global.BackstockRacks.getUnslottedOverstockCount
          ? global.BackstockRacks.getUnslottedOverstockCount()
          : 0;
        return unslotted > 0 ? rt.stations.drySteel : rt.stations.coolerSteel;
      },
      checklist: () => {
        const unslotted = global.BackstockRacks && global.BackstockRacks.getUnslottedOverstockCount
          ? global.BackstockRacks.getUnslottedOverstockCount()
          : 0;
        const audited = global.DSDReceipts && global.DSDReceipts.isInventoryAuditFinalized
          ? global.DSDReceipts.isInventoryAuditFinalized()
          : false;
        return [
          { label: `Slot backstock onto steel (${unslotted} unslotted)`, done: unslotted === 0 },
          { label: 'Finalize Backroom Inventory Audit [F5]', done: Boolean(audited) }
        ];
      },
      isComplete: () => {
        const unslotted = global.BackstockRacks && global.BackstockRacks.getUnslottedOverstockCount
          ? global.BackstockRacks.getUnslottedOverstockCount()
          : 0;
        const audited = global.DSDReceipts && global.DSDReceipts.isInventoryAuditFinalized
          ? global.DSDReceipts.isInventoryAuditFinalized()
          : false;
        return unslotted === 0 && Boolean(audited);
      }
    },
    {
      id: 'bk_closeout_punchout',
      chapter: 8,
      title: '8.3 Clear Closeout Tasks, Dock Jack & Punch Out',
      desc: 'Complete end-of-shift closeout:\n- Clear remaining Home Office tasks on Terminal `4. RECEIVING TASKS`\n- Return the Electric Jack to its charger and verify all dock doors are closed\n- Walk to the **Hallway Timeclock** (`12:00 PM` unlocked!) [[key:E]] to punch out',
      hudSpotlights: () => [{ selector: '#hud-remaining-tracker', label: 'VERIFY REMAINING WORK', role: 'target' }],
      worldTarget: (rt) => {
        const pendingHo = global.DSDReceipts && global.DSDReceipts.getPendingHomeOfficeTaskCount
          ? global.DSDReceipts.getPendingHomeOfficeTaskCount()
          : 0;
        if (pendingHo > 0) return rt.stations.terminal;
        if (!rt.jack.dockedAtCharger) return rt.stations.jackCharger;
        return rt.stations.timeclock;
      },
      checklist: (rt) => {
        const pendingHo = global.DSDReceipts && global.DSDReceipts.getPendingHomeOfficeTaskCount
          ? global.DSDReceipts.getPendingHomeOfficeTaskCount()
          : 0;
        const shiftOver = global.ShiftClock && global.ShiftClock.isShiftOver ? global.ShiftClock.isShiftOver() : false;
        const anyDoorOpen = Boolean(rt.sideDoor.isOpen || (Array.isArray(rt.doors) && rt.doors.some((d) => d && d.isOpen)));
        const items = [
          { label: `Resolve final Home Office Tasks (${pendingHo} open)`, done: pendingHo === 0 }
        ];
        if (!rt.jack.dockedAtCharger || anyDoorOpen) {
          items.push({ label: 'Return Jack to charger & close any open dock doors', done: false });
        }
        items.push({ label: 'Punch out at Hallway Timeclock [E]', done: Boolean(shiftOver) });
        return items;
      },
      isComplete: () => Boolean(global.ShiftClock && global.ShiftClock.isShiftOver && global.ShiftClock.isShiftOver())
    }
  ];

  // =========================================================================
  // RUNTIME CONTROLLER STATE & DOM
  // =========================================================================
  const state = {
    active: false,
    hubOpen: false,
    currentChapter: 1,
    currentStepIdx: 0,
    collapsed: false,
    tickTimerId: null,
    autoAdvanceTimerId: null,
    autoAdvanceLockStepId: null,
    seenActions: {},
    stepInitialOpen: {},
    stepInitialPlayer: null,
    interactBound: false,
    renderCache: {},
    rootEl: null,
    dom: {}
  };

  function getStep(idx) {
    if (idx < 0 || idx >= STEPS.length) return STEPS[0];
    return STEPS[idx];
  }

  function ensureOverlayMounted() {
    if (state.rootEl && state.rootEl.isConnected) return state.rootEl;
    if (typeof document === 'undefined' || !document.body) return null;

    const existing = document.getElementById('tutorial-overlay-root');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'tutorial-overlay-root';
    root.innerHTML = `
      <div id="tutorial-spotlight-layer" aria-hidden="true">
        <svg id="tutorial-spotlight-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="tut-spotlight-mask">
              <rect width="100%" height="100%" fill="white"></rect>
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(2, 6, 23, 0.56)" mask="url(#tut-spotlight-mask)"></rect>
          <g id="tut-spotlight-rings"></g>
        </svg>
        <div id="tutorial-callout-badges"></div>
      </div>

      <div id="tutorial-dir-edge" class="is-ahead" aria-live="polite">
        <span id="tut-dir-ico"></span>
        <span id="tut-dir-text">AHEAD · 0m</span>
      </div>

      <div id="tutorial-hud-card" role="region" aria-label="Tutorial Guidance">
        <div class="tut-card-hdr">
          <span class="tut-ch-pill" id="tut-ch-label">CHAPTER 1 OF 8</span>
          <div class="tut-hdr-right">
            <button type="button" class="tut-dock-toggle" id="tut-btn-collapse" title="Minimize tutorial window to bottom" aria-label="Minimize tutorial window">&#9660;</button>
          </div>
        </div>
        <div class="tut-card-body">
          <div class="tut-step-title" id="tut-step-title">Step Title</div>
          <div class="tut-step-desc" id="tut-step-desc"></div>
          <div class="tut-checklist" id="tut-checklist"></div>
        </div>
        <div class="tut-card-ftr">
          <button type="button" class="tut-btn tut-btn-danger" id="tut-btn-back"></button>
          <button type="button" class="tut-btn tut-btn-warn" id="tut-btn-chapters">Chapters</button>
          <button type="button" class="tut-btn tut-btn-info" id="tut-btn-exit">Main Menu</button>
          <button type="button" class="tut-btn tut-btn-primary" id="tut-btn-next"></button>
        </div>
      </div>

      <div id="tutorial-hub-modal" class="tut-modal-overlay" role="dialog" aria-modal="true" aria-label="Tutorial Chapters">
        <div class="tut-hub-box">
          <div class="tut-hub-hdr">
            <div>
              <div class="tut-hub-title" id="tut-hub-title">DSD RECEIVING TUTORIAL</div>
              <div class="tut-hub-sub">Self-contained Tutorial shift outside your February campaign · Saving &amp; loading are disabled · Jump between any of the 8 chapters below.</div>
            </div>
            <button type="button" class="tut-btn tut-btn-danger" id="hub-btn-exit">EXIT TO MENU</button>
          </div>
          <div class="tut-chapters-grid" id="hub-chapters-grid"></div>
          <div class="tut-hub-ftr">
            <span class="tut-hub-tip">Open <b>Chapters</b> anytime to skip ahead or replay a lesson.</span>
            <button type="button" class="tut-btn tut-btn-primary" id="hub-btn-play" style="padding:9px 18px; font-size:12px;"></button>
          </div>
        </div>
      </div>
    `;

    (document.getElementById('ui-stage') || document.body).appendChild(root);
    state.rootEl = root;
    state.dom = {
      spotlightLayer: document.getElementById('tutorial-spotlight-layer'),
      spotlightMask: document.getElementById('tut-spotlight-mask'),
      spotlightRings: document.getElementById('tut-spotlight-rings'),
      calloutBadges: document.getElementById('tutorial-callout-badges'),
      dirEdge: document.getElementById('tutorial-dir-edge'),
      dirIco: document.getElementById('tut-dir-ico'),
      dirText: document.getElementById('tut-dir-text'),
      hudCard: document.getElementById('tutorial-hud-card'),
      chLabel: document.getElementById('tut-ch-label'),
      stepTitle: document.getElementById('tut-step-title'),
      stepDesc: document.getElementById('tut-step-desc'),
      checklist: document.getElementById('tut-checklist'),
      btnBack: document.getElementById('tut-btn-back'),
      btnChapters: document.getElementById('tut-btn-chapters'),
      btnExit: document.getElementById('tut-btn-exit'),
      btnNext: document.getElementById('tut-btn-next'),
      btnCollapse: document.getElementById('tut-btn-collapse'),
      hubModal: document.getElementById('tutorial-hub-modal'),
      hubTitle: document.getElementById('tut-hub-title'),
      hubGrid: document.getElementById('hub-chapters-grid'),
      hubPlay: document.getElementById('hub-btn-play'),
      hubExit: document.getElementById('hub-btn-exit')
    };

    if (state.dom.hubTitle) {
      state.dom.hubTitle.innerHTML = fmtIco('book') + ' DSD RECEIVING TUTORIAL';
    }
    if (state.dom.btnBack) {
      state.dom.btnBack.innerHTML = fmtIco('arrowLeft') + ' Back';
      state.dom.btnBack.addEventListener('click', () => prevStep());
    }
    if (state.dom.btnChapters) {
      state.dom.btnChapters.addEventListener('click', () => openHub());
    }
    if (state.dom.btnExit) {
      state.dom.btnExit.addEventListener('click', () => exitToMainMenu());
    }
    if (state.dom.btnNext) {
      state.dom.btnNext.addEventListener('click', () => nextStep());
    }
    if (state.dom.btnCollapse) {
      syncCollapseButton();
      state.dom.btnCollapse.addEventListener('click', () => {
        state.collapsed = !state.collapsed;
        render();
      });
    }
    if (state.dom.hudCard) {
      const hdrEl = state.dom.hudCard.querySelector('.tut-card-hdr');
      if (hdrEl) {
        hdrEl.addEventListener('click', (e) => {
          if (!state.collapsed) return;
          if (e && e.target && e.target.closest && e.target.closest('#tut-btn-collapse')) return;
          state.collapsed = false;
          render();
        });
      }
    }
    if (state.dom.hubPlay) {
      state.dom.hubPlay.innerHTML = fmtIco('play') + ' START FULL TUTORIAL';
      state.dom.hubPlay.addEventListener('click', () => {
        state.hubOpen = false;
        jumpToChapter(1);
      });
    }
    if (state.dom.hubExit) {
      state.dom.hubExit.addEventListener('click', () => exitToMainMenu());
    }
    if (state.dom.hubGrid) {
      state.dom.hubGrid.innerHTML = CHAPTERS.map((ch) =>
        '<button type="button" class="tut-chap-btn" data-tut-ch="' + ch.num + '">' +
        '<div class="tut-chap-title">' + fmtIco(ch.icon) + ' <span>' + ch.num + '. ' + escapeHtml(ch.label) + '</span></div>' +
        '<div class="tut-chap-sub">' + escapeHtml(ch.sub) + '</div>' +
        '</button>'
      ).join('');
      state.dom.hubGrid.querySelectorAll('[data-tut-ch]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const chNum = parseInt(btn.getAttribute('data-tut-ch'), 10) || 1;
          state.hubOpen = false;
          jumpToChapter(chNum);
        });
      });
    }

    return root;
  }

  function getUiViewport() {
    if (global.DSDUIScale && typeof global.DSDUIScale.getViewport === 'function') {
      return global.DSDUIScale.getViewport();
    }
    return {
      width: global.innerWidth || 1280,
      height: global.innerHeight || 800,
      scale: 1
    };
  }

  function getUiRect(el) {
    const r = el.getBoundingClientRect();
    if (global.DSDUIScale && typeof global.DSDUIScale.toUiRect === 'function') {
      return global.DSDUIScale.toUiRect(r);
    }
    return r;
  }

  function buildMinimapBlueprintCallouts(step, vw, vh) {
    if (!step || typeof step.minimapCallouts !== 'function' || typeof document === 'undefined') {
      return { ringsHtml: '', badgesHtml: '' };
    }
    const items = step.minimapCallouts() || [];
    if (!items.length) return { ringsHtml: '', badgesHtml: '' };

    const containerEl = document.querySelector('#minimap-container');
    if (!isElementVisible(containerEl)) return { ringsHtml: '', badgesHtml: '' };
    const canvasEl = document.querySelector('#minimap-canvas');
    const cRect = getUiRect(containerEl);
    const mRect = isElementVisible(canvasEl) ? getUiRect(canvasEl) : cRect;

    // Place drafting callouts to the left of the right-docked minimap (or right if space on left is constrained).
    const projectLeft = cRect.left >= 180;
    const exitX = Math.round(projectLeft ? (cRect.left - 8) : (cRect.right + 8));
    const shelfX = projectLeft
      ? Math.max(96, Math.round(cRect.left - 34))
      : Math.min(vw - 96, Math.round(cRect.right + 34));
    const chamferX = Math.round((exitX + shelfX) * 0.5);

    const leftItems = items.filter((it) => it && it.side !== 'south');
    const southItems = items.filter((it) => it && it.side === 'south');

    const startY = Math.round(cRect.top + 8);
    const maxSpan = Math.max(cRect.height, Math.min(288, (vh || 800) - startY - 26));
    const stepY = leftItems.length > 1 ? Math.max(26, Math.min(48, Math.round(maxSpan / (leftItems.length - 1)))) : 0;

    let ringsHtml = '';
    let badgesHtml = '';

    leftItems.forEach((item, idx) => {
      const col = item.color || '#4ade80';
      const tx = Math.round(mRect.left + item.u * mRect.width);
      const ty = Math.round(mRect.top + item.v * mRect.height);
      const ly = Math.round(startY + idx * stepY);

      if (Array.isArray(item.dropUs) && item.dropUs.length > 0 && Number.isFinite(item.dropV)) {
        const dropY = Math.round(mRect.top + item.dropV * mRect.height);
        const dropXs = item.dropUs.map((du) => Math.round(mRect.left + du * mRect.width));
        const busMinX = Math.min.apply(null, dropXs);
        const busMaxX = Math.max.apply(null, dropXs);
        if (busMaxX > busMinX) {
          const busLine = `M ${busMinX} ${ty} L ${busMaxX} ${ty}`;
          ringsHtml += `<path d="${busLine}" class="tut-bp-halo"></path>`;
          ringsHtml += `<path d="${busLine}" class="tut-bp-bracket" stroke="${col}"></path>`;
        }
        dropXs.forEach((dx) => {
          const dropLine = `M ${dx} ${ty} L ${dx} ${dropY}`;
          ringsHtml += `<path d="${dropLine}" class="tut-bp-halo"></path>`;
          ringsHtml += `<path d="${dropLine}" class="tut-bp-dock-drop" stroke="${col}"></path>`;
          ringsHtml += `<circle cx="${dx}" cy="${dropY}" r="4" class="tut-bp-ring" stroke="${col}"></circle>`;
          ringsHtml += `<circle cx="${dx}" cy="${dropY}" r="2.2" fill="${col}"></circle>`;
        });
      }

      const pts = `${tx},${ty} ${exitX},${ty} ${chamferX},${ly} ${shelfX},${ly}`;
      ringsHtml += `<polyline points="${pts}" class="tut-bp-halo"></polyline>`;
      ringsHtml += `<polyline points="${pts}" class="tut-bp-leader" stroke="${col}"></polyline>`;
      if (!Array.isArray(item.dropUs) || item.dropUs.length === 0) {
        ringsHtml += `<circle cx="${tx}" cy="${ty}" r="5" class="tut-bp-ring" stroke="${col}"></circle>`;
        ringsHtml += `<circle cx="${tx}" cy="${ty}" r="2.6" fill="${col}"></circle>`;
      }

      const tagBg = item.label === 'COOLER' ? 'background:rgba(6,78,75,0.96);' : '';
      const tagCol = item.label === 'COOLER' ? '#6ee7b7' : col;
      const posStyle = projectLeft
        ? `right:${Math.max(6, vw - shelfX)}px;top:${ly}px;border-left:1px solid #475569;border-right:3px solid ${col};`
        : `left:${shelfX}px;top:${ly}px;border-right:1px solid #475569;border-left:3px solid ${col};`;
      badgesHtml += `<div class="tut-blueprint-tag" style="${posStyle}${tagBg}color:${tagCol};">${escapeHtml(item.label)}</div>`;
    });

    const exitY = Math.round(cRect.bottom + 8);
    const shelfY = Math.min((vh || 800) - 24, Math.round(cRect.bottom + 26));
    const chamferY = Math.round((exitY + shelfY) * 0.5);

    southItems.forEach((item) => {
      const col = item.color || '#fb923c';
      const tx = Math.round(mRect.left + item.u * mRect.width);
      const ty = Math.round(mRect.top + item.v * mRect.height);
      const lx = Math.min(vw - 44, Math.max(48, Math.round(tx - 16)));
      const pts = `${tx},${ty} ${tx},${exitY} ${lx},${chamferY} ${lx},${shelfY}`;
      ringsHtml += `<polyline points="${pts}" class="tut-bp-halo"></polyline>`;
      ringsHtml += `<polyline points="${pts}" class="tut-bp-leader" stroke="${col}"></polyline>`;
      ringsHtml += `<circle cx="${tx}" cy="${ty}" r="5" class="tut-bp-ring" stroke="${col}"></circle>`;
      ringsHtml += `<circle cx="${tx}" cy="${ty}" r="2.6" fill="${col}"></circle>`;

      const posStyle = `left:${lx}px;top:${shelfY}px;transform:translateX(-50%);border:1px solid #475569;border-top:3px solid ${col};`;
      badgesHtml += `<div class="tut-blueprint-tag is-south" style="${posStyle}color:${col};">${escapeHtml(item.label)}</div>`;
    });

    return { ringsHtml, badgesHtml };
  }

  function updateSpotlights(step, rtSnapshot) {
    const d = state.dom;
    if (!d.spotlightLayer || !d.spotlightMask || !d.spotlightRings || !d.calloutBadges) return;

    if (!state.active || state.hubOpen) {
      d.spotlightLayer.classList.remove('active');
      return;
    }

    const specs = (step && typeof step.hudSpotlights === 'function')
      ? (step.hudSpotlights(rtSnapshot) || [])
      : [];

    const uiVp = getUiViewport();
    const vw = uiVp.width || 1280;
    const vh = uiVp.height || 800;
    const rects = [];
    specs.forEach((sp) => {
      if (!sp || !sp.selector || typeof document === 'undefined') return;
      const el = document.querySelector(sp.selector);
      if (!isElementVisible(el)) return;
      const r = getUiRect(el);
      const pad = Number.isFinite(sp.padding) ? sp.padding : 4;
      const x = Math.max(3, Math.round(r.left - pad));
      const y = Math.max(3, Math.round(r.top - pad));
      const right = Math.min(vw - 3, Math.round(r.right + pad));
      const bottom = Math.min(vh - 3, Math.round(r.bottom + pad));
      const w = Math.max(12, right - x);
      const h = Math.max(12, bottom - y);
      rects.push({
        x: x,
        y: y,
        w: w,
        h: h,
        label: sp.label || '',
        role: sp.role || 'target'
      });
    });

    if (rects.length === 0) {
      d.spotlightLayer.classList.remove('active');
      if (state.renderCache.calloutBadgesHtml !== '') {
        state.renderCache.calloutBadgesHtml = '';
        d.calloutBadges.innerHTML = '';
      }
      state.renderCache.maskHtml = '';
      state.renderCache.ringsHtml = '';
      return;
    }

    d.spotlightLayer.classList.add('active');

    let maskHtml = '<rect width="100%" height="100%" fill="white"></rect>';
    let ringsHtml = '';
    let badgesHtml = '';

    rects.forEach((box) => {
      maskHtml += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="7" fill="black"></rect>`;
      const cls = box.role === 'source' ? 'tut-callout-pair-stroke' : 'tut-pulse-stroke';
      ringsHtml += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="7" class="${cls}"></rect>`;
      if (box.label) {
        const badgeTop = box.y > 28 ? (box.y - 24) : (box.y + box.h + 6);
        const badgeLeft = Math.max(6, Math.min(vw - 210, box.x));
        const icoHtml = box.role === 'source' ? fmtIco('receipt') : '';
        badgesHtml += `<div class="tut-callout-tag ${box.role === 'source' ? 'is-source' : ''}" style="left:${badgeLeft}px;top:${badgeTop}px;">${icoHtml}${escapeHtml(box.label)}</div>`;
      }
    });

    const bp = buildMinimapBlueprintCallouts(step, vw, vh);
    ringsHtml += bp.ringsHtml;
    badgesHtml += bp.badgesHtml;

    if (state.renderCache.maskHtml !== maskHtml) {
      state.renderCache.maskHtml = maskHtml;
      d.spotlightMask.innerHTML = maskHtml;
    }
    if (state.renderCache.ringsHtml !== ringsHtml) {
      state.renderCache.ringsHtml = ringsHtml;
      d.spotlightRings.innerHTML = ringsHtml;
    }
    if (state.renderCache.calloutBadgesHtml !== badgesHtml) {
      state.renderCache.calloutBadgesHtml = badgesHtml;
      d.calloutBadges.innerHTML = badgesHtml;
    }
  }

  function updateEdgeGuidance(target) {
    const d = state.dom;
    if (!d.dirEdge || !d.dirIco || !d.dirText) return;
    if (!state.active || state.hubOpen || !target) {
      d.dirEdge.classList.remove('active');
      return;
    }

    const guide = (global.DSDRuntime && typeof global.DSDRuntime.getDirectionalGuidance === 'function')
      ? global.DSDRuntime.getDirectionalGuidance(target)
      : null;
    if (!guide) {
      d.dirEdge.classList.remove('active');
      return;
    }

    const distStr = guide.distanceM.toFixed(1) + 'm';
    d.dirEdge.classList.remove('is-left', 'is-right', 'is-ahead');
    d.dirEdge.classList.add('active');

    if (guide.side === 'left') {
      d.dirEdge.classList.add('is-left');
      d.dirIco.innerHTML = fmtIco('arrowLeft');
      d.dirText.textContent = 'TURN LEFT (' + distStr + ')';
    } else if (guide.side === 'right') {
      d.dirEdge.classList.add('is-right');
      d.dirIco.innerHTML = fmtIco('arrowRight');
      d.dirText.textContent = 'TURN RIGHT (' + distStr + ')';
    } else {
      d.dirEdge.classList.add('is-ahead');
      d.dirIco.innerHTML = fmtIco('target');
      d.dirText.textContent = 'OBJECTIVE AHEAD (' + distStr + ')';
    }
  }

  function hasBlockingGameplayModalOpen(rt) {
    const m = (rt && rt.modals) ? rt.modals : {};
    const termState = (global.DSDReceipts && typeof global.DSDReceipts.getTerminalState === 'function')
      ? global.DSDReceipts.getTerminalState()
      : {};
    return Boolean(
      m.scannerOpen ||
      m.invoiceOpen ||
      m.bolOpen ||
      m.terminalOpen ||
      m.doorQueueOpen ||
      termState.nightDropOpen ||
      termState.filingOpen ||
      termState.archiveOpen ||
      termState.trashModalOpen ||
      termState.handModalOpen
    );
  }

  function isSystemOverlayBlockingTutorial() {
    const g = global.DSDGame;
    if (!g) return false;
    return Boolean(
      (typeof g.isPauseMenuOpen === 'function' && g.isPauseMenuOpen()) ||
      (typeof g.isShiftSummaryOpen === 'function' && g.isShiftSummaryOpen()) ||
      (typeof g.isSaveLoadModalOpen === 'function' && g.isSaveLoadModalOpen()) ||
      (typeof g.isInfoModalOpen === 'function' && g.isInfoModalOpen())
    );
  }

  function syncCollapseButton() {
    const btn = state.dom && state.dom.btnCollapse;
    if (!btn) return;
    btn.textContent = state.collapsed ? '\u25B2' : '\u25BC';
    const label = state.collapsed ? 'Restore tutorial window' : 'Minimize tutorial window to bottom';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function syncBottomDockLayout() {
    if (typeof document === 'undefined') return;
    const tutEl = state.dom && state.dom.hudCard ? state.dom.hudCard : document.getElementById('tutorial-hud-card');
    const prhEl = document.getElementById('printed-receipt-hud');
    if (tutEl) {
      tutEl.style.left = '';
      tutEl.style.right = '';
      tutEl.style.transform = '';
      tutEl.style.maxWidth = '';
    }
    if (prhEl) {
      prhEl.style.left = '';
      prhEl.style.right = '';
      prhEl.style.transform = '';
      prhEl.style.maxWidth = '';
    }

    const tutAtBottom = Boolean(
      state.active &&
      !state.hubOpen &&
      !isSystemOverlayBlockingTutorial() &&
      tutEl &&
      tutEl.classList.contains('active') &&
      (tutEl.classList.contains('is-collapsed') || tutEl.classList.contains('dock-bottom'))
    );
    if (!tutAtBottom && state.active && !state.hubOpen && !isSystemOverlayBlockingTutorial() && tutEl) {
      const curStep = getStep(state.currentStepIdx);
      const mapEl = document.getElementById('minimap-container');
      if (curStep && typeof curStep.minimapCallouts === 'function' && isElementVisible(mapEl)) {
        const cRect = getUiRect(mapEl);
        if (cRect.left >= 180) {
          const vwNow = getUiViewport().width || 1280;
          const tutWNow = Math.ceil(getUiRect(tutEl).width) || 530;
          const calloutReserveLeft = cRect.left - 164;
          const centeredRight = (vwNow + tutWNow) * 0.5;
          if (centeredRight > calloutReserveLeft - 14) {
            const shiftedLeft = Math.max(12, Math.round(calloutReserveLeft - 14 - tutWNow));
            tutEl.style.left = shiftedLeft + 'px';
            tutEl.style.transform = 'translateY(-50%)';
          }
        }
      }
    }
    const prhVisible = Boolean(prhEl && prhEl.style.display !== 'none' && isElementVisible(prhEl));
    if (!tutAtBottom || !prhVisible) return;

    const vw = getUiViewport().width || 1280;
    const gap = 14;
    const containerEl = document.getElementById('game-container');
    const scannerReserve = (containerEl && containerEl.classList.contains('scanner-open') && vw >= 820 && vw <= 1220) ? 352 : 12;
    const safeLeft = 12;
    const safeRight = Math.max(safeLeft + 260, vw - scannerReserve);
    const avail = safeRight - safeLeft;

    const prhRawW = Math.ceil(getUiRect(prhEl).width) || 318;
    const tutRawW = Math.ceil(getUiRect(tutEl).width) || (tutEl.classList.contains('is-collapsed') ? 340 : 470);
    let tutW = tutRawW;
    let prhW = prhRawW;

    if (tutW + gap + prhW > avail) {
      prhW = Math.min(prhRawW, Math.max(150, Math.floor((avail - gap) * 0.42)));
      tutW = Math.max(180, avail - gap - prhW);
      tutEl.style.maxWidth = tutW + 'px';
      prhEl.style.maxWidth = prhW + 'px';
      tutW = Math.min(tutW, Math.ceil(getUiRect(tutEl).width) || tutW);
      prhW = Math.min(prhW, Math.ceil(getUiRect(prhEl).width) || prhW);
    }

    const totalW = tutW + gap + prhW;
    const groupLeft = Math.max(safeLeft, Math.round(safeLeft + (avail - totalW) / 2));
    tutEl.style.left = groupLeft + 'px';
    tutEl.style.right = 'auto';
    tutEl.style.transform = 'none';
    prhEl.style.left = (groupLeft + tutW + gap) + 'px';
    prhEl.style.right = 'auto';
    prhEl.style.transform = 'none';
  }

  function render() {
    const d = state.dom;
    if (!d.hudCard || !d.hubModal) return;

    if (!state.active) {
      d.hubModal.classList.remove('active');
      d.hudCard.classList.remove('active');
      syncBottomDockLayout();
      if (d.spotlightLayer) d.spotlightLayer.classList.remove('active');
      if (d.dirEdge) d.dirEdge.classList.remove('active');
      return;
    }

    if (isSystemOverlayBlockingTutorial()) {
      d.hubModal.classList.remove('active');
      d.hudCard.classList.remove('active');
      syncBottomDockLayout();
      if (d.spotlightLayer) d.spotlightLayer.classList.remove('active');
      if (d.dirEdge) d.dirEdge.classList.remove('active');
      return;
    }

    if (state.hubOpen) {
      d.hubModal.classList.add('active');
      d.hudCard.classList.remove('active');
      syncBottomDockLayout();
      if (d.spotlightLayer) d.spotlightLayer.classList.remove('active');
      if (d.dirEdge) d.dirEdge.classList.remove('active');
      return;
    }

    d.hubModal.classList.remove('active');
    d.hudCard.classList.add('active');

    const step = getStep(state.currentStepIdx);
    const ch = getChapterConfig(step.chapter);
    const rt = (global.DSDRuntime && typeof global.DSDRuntime.getTutorialSnapshot === 'function')
      ? global.DSDRuntime.getTutorialSnapshot()
      : { player: {}, modals: {}, doors: [], sideDoor: {}, jack: {}, pallets: [], sessions: [], stations: {} };

    if (typeof step.onTick === 'function') {
      try { step.onTick(rt); } catch (_) { }
    }

    d.hudCard.classList.toggle('dock-bottom', hasBlockingGameplayModalOpen(rt));
    d.hudCard.classList.toggle('is-collapsed', Boolean(state.collapsed));
    syncCollapseButton();
    syncBottomDockLayout();
    const chText = state.collapsed
      ? 'TUTORIAL MINIMIZED AT BOTTOM · CLICK \u25B2 TO REOPEN'
      : ('CHAPTER ' + ch.num + ' OF ' + CHAPTERS.length + ' · ' + ch.label);
    if (state.renderCache.chLabel !== chText) {
      state.renderCache.chLabel = chText;
      d.chLabel.textContent = chText;
    }
    const titleHtml = fmtRichText(step.title);
    if (state.renderCache.stepTitle !== titleHtml) {
      state.renderCache.stepTitle = titleHtml;
      d.stepTitle.innerHTML = titleHtml;
    }
    const descHtml = formatStepHtml(step.desc);
    if (state.renderCache.stepDesc !== descHtml) {
      state.renderCache.stepDesc = descHtml;
      d.stepDesc.innerHTML = descHtml;
    }

    const chkItems = typeof step.checklist === 'function' ? (step.checklist(rt) || []) : [];
    if (d.checklist) {
      const chkHtml = chkItems.map((c) => {
        const ico = fmtIco(c.done ? 'checkCircle' : 'target');
        return '<div class="tut-chk-item ' + (c.done ? 'done' : 'todo') + '">' + ico + '<span>' + escapeHtml(c.label) + '</span></div>';
      }).join('');
      if (state.renderCache.checklistHtml !== chkHtml) {
        state.renderCache.checklistHtml = chkHtml;
        d.checklist.innerHTML = chkHtml;
      }
      d.checklist.style.display = chkItems.length > 0 ? 'flex' : 'none';
    }

    if (d.btnBack) d.btnBack.disabled = (state.currentStepIdx === 0);
    if (d.btnNext) {
      const isLast = state.currentStepIdx >= STEPS.length - 1;
      const nextHtml = (isLast ? 'Finish ' : 'Next ') + fmtIco('arrowRight');
      if (state.renderCache.btnNextHtml !== nextHtml) {
        state.renderCache.btnNextHtml = nextHtml;
        d.btnNext.innerHTML = nextHtml;
      }
    }

    updateSpotlights(step, rt);
    updateEdgeGuidance(getActiveWorldTarget());

    // Step auto-completion check
    if (typeof step.isComplete === 'function' && step.isComplete(rt) && state.autoAdvanceLockStepId !== step.id) {
      state.autoAdvanceLockStepId = step.id;
      if (state.autoAdvanceTimerId !== null) {
        clearTimeout(state.autoAdvanceTimerId);
        state.autoAdvanceTimerId = null;
      }
      if (state.currentStepIdx < STEPS.length - 1) {
        state.autoAdvanceTimerId = setTimeout(() => {
          state.autoAdvanceTimerId = null;
          if (state.active && !state.hubOpen && getStep(state.currentStepIdx).id === step.id) {
            nextStep();
          }
        }, 650);
      }
    }
  }

  function clearAutoAdvanceTimer() {
    if (state.autoAdvanceTimerId !== null) {
      clearTimeout(state.autoAdvanceTimerId);
      state.autoAdvanceTimerId = null;
    }
    state.autoAdvanceLockStepId = null;
  }

  function applyStepEnter(step) {
    clearAutoAdvanceTimer();
    state.collapsed = false;
    state.seenActions = {};
    state.stepInitialOpen = {};
    state.stepInitialPlayer = null;
    if (global.DSDRuntime && typeof global.DSDRuntime.getTutorialSnapshot === 'function') {
      try {
        const rt = global.DSDRuntime.getTutorialSnapshot();
        if (rt && rt.player && Number.isFinite(Number(rt.player.x)) && Number.isFinite(Number(rt.player.z))) {
          state.stepInitialPlayer = {
            x: Number(rt.player.x) || 0,
            z: Number(rt.player.z) || 0,
            yaw: Number(rt.player.yaw) || 0,
            pitch: Number(rt.player.pitch) || 0
          };
        }
      } catch (_) { }
    }
    if (step && step.id && STEP_INTERACT_CONFIG[step.id] && typeof document !== 'undefined') {
      const openSel = STEP_INTERACT_CONFIG[step.id].openSel;
      if (openSel) {
        state.stepInitialOpen[step.id] = Boolean(document.querySelector(openSel));
      }
    }
    if (step && typeof step.onEnter === 'function') {
      try {
        step.onEnter();
      } catch (err) {
        console.error('DSDTutorial step onEnter error:', err);
      }
    }
  }

  function jumpToChapter(chapterNum, jumpOpts) {
    const jOpts = jumpOpts || {};
    const chNum = Math.max(0, Math.min(CHAPTERS.length, parseInt(chapterNum, 10) || 0));
    if (!state.active) {
      start({ chapter: chNum });
      return true;
    }
    if (chNum === 0) {
      openHub();
      return true;
    }

    const chCfg = getChapterConfig(chNum);
    const setup = CHAPTER_SETUPS[chCfg.num] || CHAPTER_SETUPS[1];
    state.hubOpen = false;
    state.collapsed = false;
    state.currentChapter = chCfg.num;
    const stepIdx = STEPS.findIndex((s) => s.chapter === chCfg.num);
    state.currentStepIdx = stepIdx >= 0 ? stepIdx : 0;

    if (global.DSDRuntime && typeof global.DSDRuntime.resetTutorialChapterState === 'function') {
      const resetOpts = Object.assign({}, setup, {
        preservePlayerPos: Boolean(jOpts.preservePlayerPos)
      });
      global.DSDRuntime.resetTutorialChapterState(resetOpts);
    }
    if (chCfg.num === 1) {
      seedSampleMessages();
    }
    applyStepEnter(getStep(state.currentStepIdx));
    render();
    return true;
  }

  function nextStep() {
    if (!state.active) return false;
    if (state.currentStepIdx >= STEPS.length - 1) {
      exitToMainMenu();
      return true;
    }
    const prevChapter = getStep(state.currentStepIdx).chapter;
    const nextIdx = state.currentStepIdx + 1;
    const nextSt = getStep(nextIdx);
    if (nextSt.chapter !== prevChapter) {
      return jumpToChapter(nextSt.chapter, { preservePlayerPos: true });
    }
    state.currentStepIdx = nextIdx;
    applyStepEnter(nextSt);
    render();
    return true;
  }

  function prevStep() {
    if (!state.active) return false;
    if (state.currentStepIdx <= 0) {
      openHub();
      return true;
    }
    const curChapter = getStep(state.currentStepIdx).chapter;
    const prevIdx = state.currentStepIdx - 1;
    const prevSt = getStep(prevIdx);
    if (prevSt.chapter !== curChapter) {
      const targetCh = prevSt.chapter;
      jumpToChapter(targetCh);
      const lastInCh = STEPS.reduce((best, s, i) => (s.chapter === targetCh ? i : best), state.currentStepIdx);
      state.currentStepIdx = lastInCh;
      applyStepEnter(getStep(lastInCh));
      render();
      return true;
    }
    state.currentStepIdx = prevIdx;
    applyStepEnter(prevSt);
    render();
    return true;
  }

  function openHub() {
    if (!state.active) return;
    clearAutoAdvanceTimer();
    if (global.DSDRuntime && typeof global.DSDRuntime.closeAllGameplayModals === 'function') {
      global.DSDRuntime.closeAllGameplayModals(true);
    }
    if (typeof document !== 'undefined' && document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (_) { }
    }
    state.hubOpen = true;
    render();
  }

  function exitToMainMenu() {
    stop();
    if (global.DSDGame && typeof global.DSDGame.returnToMainMenu === 'function') {
      global.DSDGame.returnToMainMenu();
    }
    if (global.DSDMenuUI && typeof global.DSDMenuUI.syncOverlaysFromGame === 'function') {
      global.DSDMenuUI.syncOverlaysFromGame();
    }
  }

  function getActiveWorldTarget() {
    if (!state.active || state.hubOpen) return null;
    const step = getStep(state.currentStepIdx);
    if (!step || typeof step.worldTarget !== 'function') return null;
    const rt = (global.DSDRuntime && typeof global.DSDRuntime.getTutorialSnapshot === 'function')
      ? global.DSDRuntime.getTutorialSnapshot()
      : null;
    if (!rt) return null;
    try {
      return step.worldTarget(rt);
    } catch (_) {
      return null;
    }
  }

  function markCurrentStepInteracted(targetEl, keyLower, isHoverEvent) {
    if (!state.active || state.hubOpen) return;
    const step = getStep(state.currentStepIdx);
    const cfg = step && STEP_INTERACT_CONFIG[step.id];
    if (!cfg || state.seenActions[step.id]) return;
    if (isHoverEvent && !cfg.triggerHover) return;
    const hitKey = Boolean(keyLower && Array.isArray(cfg.keys) && cfg.keys.includes(keyLower));
    const hitEl = Boolean(targetEl && cfg.targetSel && targetEl.closest && targetEl.closest(cfg.targetSel));
    if (hitKey || hitEl) {
      state.seenActions[step.id] = true;
      render();
    }
  }

  function scheduleFastCommandBarRender() {
    if (!state.active || state.hubOpen || state.currentChapter !== 1) return;
    setTimeout(() => {
      if (state.active && !state.hubOpen && state.currentChapter === 1) render();
    }, 30);
  }

  function ensureInteractListeners() {
    if (state.interactBound || typeof document === 'undefined') return;
    state.interactBound = true;
    document.addEventListener('mouseover', (e) => {
      markCurrentStepInteracted(e && e.target, '', true);
      scheduleFastCommandBarRender();
    }, true);
    document.addEventListener('mouseout', () => scheduleFastCommandBarRender(), true);
    document.addEventListener('click', (e) => {
      markCurrentStepInteracted(e && e.target, '', false);
      scheduleFastCommandBarRender();
    }, true);
    document.addEventListener('keydown', (e) => {
      const k = e && e.key ? String(e.key).toLowerCase() : '';
      markCurrentStepInteracted(null, k, false);
      const curId = (state.active && !state.hubOpen) ? getStep(state.currentStepIdx).id : '';
      const isMoveKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k);
      if (curId === 'gui_controls' && !state.seenActions.gui_controls_move && isMoveKey) {
        state.seenActions.gui_controls_move = true;
        render();
      } else if (
        curId === 'gui_stations_look' &&
        isMoveKey &&
        !state.seenActions.gui_stations_hidThisLeg &&
        !(state.seenActions.gui_stations_desk && state.seenActions.gui_stations_side)
      ) {
        state.seenActions.gui_stations_hidThisLeg = true;
        state.collapsed = true;
        if (!state.seenActions.gui_stations_notifiedHide) {
          state.seenActions.gui_stations_notifiedHide = true;
          if (global.DSDMessages && typeof global.DSDMessages.push === 'function') {
            global.DSDMessages.push('[[ico:book]] Tutorial docked to bottom-center while moving — click ▲ below anytime to reopen (auto-reopens at destination).', 'status', { silent: true });
          }
        }
        render();
      }
      scheduleFastCommandBarRender();
    }, true);
    document.addEventListener('pointerlockchange', () => {
      if (
        state.active &&
        !state.hubOpen &&
        document.pointerLockElement &&
        getStep(state.currentStepIdx).id === 'gui_controls' &&
        !state.seenActions.gui_controls_look
      ) {
        state.seenActions.gui_controls_look = true;
        render();
      }
    });
    global.addEventListener('resize', () => {
      if (state.active) {
        syncBottomDockLayout();
        scheduleFastCommandBarRender();
      }
    });
    global.addEventListener('dsd-ui-scale-change', () => {
      if (state.active) render();
    });
  }

  function start(opts) {
    const o = opts || {};
    ensureOverlayMounted();
    ensureInteractListeners();
    state.active = true;
    state.collapsed = false;
    if (state.dom.hudCard) state.dom.hudCard.classList.remove('is-collapsed');
    syncCollapseButton();

    if (state.tickTimerId !== null) {
      clearInterval(state.tickTimerId);
      state.tickTimerId = null;
    }
    state.renderCache = {};
    state.tickTimerId = setInterval(() => {
      if (state.active) render();
    }, 180);

    const reqChapter = Number(o.chapter) || 0;
    if (reqChapter >= 1 && reqChapter <= CHAPTERS.length) {
      jumpToChapter(reqChapter);
    } else {
      state.hubOpen = true;
      state.currentChapter = 1;
      state.currentStepIdx = 0;
      if (global.DSDRuntime && typeof global.DSDRuntime.resetTutorialChapterState === 'function') {
        global.DSDRuntime.resetTutorialChapterState(CHAPTER_SETUPS[1]);
      }
      seedSampleMessages();
      render();
    }
    return true;
  }

  function stop() {
    state.active = false;
    state.hubOpen = false;
    state.seenActions = {};
    state.renderCache = {};
    clearAutoAdvanceTimer();
    if (state.tickTimerId !== null) {
      clearInterval(state.tickTimerId);
      state.tickTimerId = null;
    }
    if (state.rootEl) {
      render();
      if (state.rootEl.parentNode) {
        state.rootEl.parentNode.removeChild(state.rootEl);
      }
      state.rootEl = null;
      state.dom = {};
    }
  }

  global.DSDTutorial = {
    CHAPTERS: CHAPTERS.slice(),
    STEPS: STEPS,
    CHAPTER_SETUPS: CHAPTER_SETUPS,
    start: start,
    stop: stop,
    isActive: () => Boolean(state.active),
    isHubOpen: () => Boolean(state.hubOpen),
    openHub: openHub,
    jumpToChapter: jumpToChapter,
    nextStep: nextStep,
    prevStep: prevStep,
    exitToMainMenu: exitToMainMenu,
    getActiveWorldTarget: getActiveWorldTarget,
    getCurrentState: () => ({
      active: Boolean(state.active),
      hubOpen: Boolean(state.hubOpen),
      currentChapter: state.currentChapter,
      currentStepIdx: state.currentStepIdx,
      currentStepId: getStep(state.currentStepIdx).id
    }),
    syncBottomDockLayout: syncBottomDockLayout,
    render: render
  };
})(window);
