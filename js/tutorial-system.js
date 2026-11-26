(function (global) {
  'use strict';

  /**
   * DSDTutorial — Decoupled 8-Chapter Tutorial Engine (Phase 3 Local Sandbox)
   * Provides Welcome Hub, Chapter Switcher, step evaluators, live dual-callout
   * spotlights (e.g. Paper Invoice -> Handheld Scanner fields), 3D objective
   * beacon target provider, and off-screen directional edge indicator.
   */

  const CHAPTERS = [
    { id: 'screen_tour', num: 1, icon: 'warehouse', label: 'SCREEN TOUR', sub: 'HUD Command Bar, beacons, minimap & stations', firstStep: 'gui_intro' },
    { id: 'warehouse_trucks', num: 2, icon: 'truck', label: 'WAREHOUSE TRUCKS', sub: 'Bay doors, electric jack, curtains & staging', firstStep: 'wh_open_bay' },
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

  function formatStepHtml(str) {
    return fmtRichText(str)
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="tut-hl">$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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

  // =========================================================================
  // 8-CHAPTER STEP DEFINITIONS
  // =========================================================================
  const STEPS = [
    // CHAPTER 1: SCREEN TOUR (Command Bar Overview + Left-to-Right Walkthrough)
    {
      id: 'gui_intro',
      chapter: 1,
      title: '1.1 Command Bar Overview',
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
      title: '1.2 Shift Clock & Calendar [C]',
      desc: 'On the far left is your **Shift Clock**. Shifts run `6:00 AM` to `2:00 PM`, and you can punch out with no penalty starting at `12:00 PM` once all work is finished. Overtime accrues from `2:00 PM` to `3:00 PM` (pulsing red), ending in a forced clock-out at `3:00 PM`. During training, the date reads `TUTORIAL`; hover or press `[C]` to open the **February 1996 Calendar**.',
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
      title: '1.3 Remaining Work & Points [K]',
      desc: '**Remaining Work** displays your live **PTS** score, total items **LEFT**, and category counters left to right: Side-Door Vendors, Vendor Trucks, Warehouse Trucks, HO Tasks, Claims, Overstock, Inventory (`N/Y`), and Filing (`N/Y`). Hover or press `[K]` for the guide.',
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
      title: '1.4 Message Log [M] / [L]',
      desc: 'In the center sits the **Message Log**. All dock alerts, truck arrivals, door alarms, and compliance updates appear here. Click the bar or press `[M]` (or `[L]`) anytime to review and filter past messages.',
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
      title: '1.5 Pending Deliveries [P]',
      desc: '**Pending Deliveries** lists scheduled Warehouse Trucks and DSD Vendors with ETAs, carrier names, assigned bay/door, priority warnings, and countdown timers. Click the panel or press `[P]` to expand the full schedule.',
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
      title: '1.6 Dock Beacons & Queue [B]',
      desc: '**Dock Beacons** (`D1`–`D4` and Side Door `SD`) show live status: **Steady Green** (closed & empty), **Flashing Amber** (driver/vendor waiting to enter or exit), **Steady Amber** (open & active with driver/trailer), **Steady Red** (open & empty), and **Flashing Red** (5+ min alarm). Also shows the **`WH DRIVER`** badge and Side Door queue (hover or press `[B]`).',
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
      title: '1.7 System & Pause Menu [ESC]',
      desc: 'On the far right is **SYSTEM MENU**. Click it or press `[ESC]` to pause the simulation, adjust SFX & Music sliders, check controls, or return to the Main Menu (Campaign Save & Load stay safely locked during Tutorial Mode).',
      hudSpotlights: () => [{ selector: '#pause-menu-btn', label: 'SYSTEM MENU [ESC]', role: 'target' }],
      worldTarget: () => null,
      checklist: () => {
        if (!state.seenActions.gui_system_menu && global.DSDGame && typeof global.DSDGame.isPauseMenuOpen === 'function' && global.DSDGame.isPauseMenuOpen()) {
          state.seenActions.gui_system_menu = true;
        }
        return [
          { label: 'Review controls above, then click Next for Dock Minimap', done: Boolean(state.seenActions.gui_system_menu) }
        ];
      }
    },
    {
      id: 'gui_stations_look',
      chapter: 1,
      title: '1.8 Dock Minimap & 3D Walk-Around',
      desc: 'Below System Menu sits your **Dock Minimap**, showing player facing, doors, and Tutorial objective pings. Click the 3D dock to steer (`WASD` move, `[E]` interact, `[Space]` Pallet Jack, `[F]` Scanner) and walk to the **Computer Desk** (or click **Next**) to start **Chapter 2**.',
      hudSpotlights: () => [{ selector: '#minimap-container', label: 'DOCK MINIMAP', role: 'target' }],
      worldTarget: (rt) => rt.stations ? rt.stations.terminal : null,
      checklist: (rt) => {
        const p = rt.player;
        const t = rt.stations && rt.stations.terminal;
        const nearDesk = p && t && Math.hypot(p.x - t.x, p.z - t.z) < 4.5;
        return [
          { label: 'Approach the Computer Desk or press Next to start Chapter 2', done: Boolean(nearDesk) }
        ];
      },
      isComplete: (rt) => {
        const p = rt.player;
        const t = rt.stations && rt.stations.terminal;
        return Boolean(p && t && Math.hypot(p.x - t.x, p.z - t.z) < 3.4);
      }
    },

    // CHAPTER 2: WAREHOUSE TRUCKS
    {
      id: 'wh_open_bay',
      chapter: 2,
      title: '2.1 Open Bay 1 & Admit Warehouse Driver',
      desc: 'A **Dept 01 Apex Logistics** trailer has backed into **Bay 1** (`F`, `C`, `D` zones). Open Bay 1 using `[E]` on the green switch, then click the driver outside `[E]` to let them stage the pallets.',
      hudSpotlights: () => [{ selector: '#door-lights-panel', label: 'BAY 1 AMBER = READY', role: 'target' }],
      worldTarget: (rt) => {
        const bay1 = (rt.doors || []).find((d) => d.id === 1);
        const whSess = (rt.sessions || []).find((s) => s.type === 'warehouse');
        if (bay1 && !bay1.isOpen) return rt.stations.dockButton1;
        if (whSess && whSess.driverPos) return whSess.driverPos;
        return rt.stations.dockDoor1;
      },
      checklist: (rt) => {
        const bay1 = (rt.doors || []).find((d) => d.id === 1);
        const wh = findDelivery('tut_ch2_wh');
        const whSess = (rt.sessions || []).find((s) => s.deliveryId === 'tut_ch2_wh');
        const driverIn = Boolean(whSess && whSess.state !== 'OUTSIDE_WAITING') || Boolean(wh && (wh.spawnedCount || 0) > 0);
        return [
          { label: 'Open Dock Bay 1 door [E]', done: Boolean(bay1 && bay1.isOpen) },
          { label: 'Admit Warehouse driver [E] to stage pallets', done: driverIn }
        ];
      },
      isComplete: (rt) => {
        const wh = findDelivery('tut_ch2_wh');
        return Boolean(wh && ((wh.spawnedCount || 0) >= (wh.palletSpecs ? wh.palletSpecs.length : 6) || wh.completed));
      }
    },
    {
      id: 'wh_equip_jack',
      chapter: 2,
      title: '2.2 Equip the Electric Walkie Jack',
      desc: 'Walk to the charging station along the West wall and press `[Space]` to grab the **Electric Pallet Jack**.',
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
      title: '2.3 Stage Dry (D), Cooler (C) & Freezer (F) Pallets',
      desc: 'Haul each pallet `[Space]` into its color-coded zone (`D` Dry floor, `C` Light Blue Cooler, `F` Dark Blue Freezer). Drop Dry first to clear insulated trailer curtains.',
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
      title: '2.4 Sign Warehouse BOL & Close Bay 1',
      desc: 'Walk up to the Warehouse driver `[E]` to open & sign the BOL, let them exit, and close **Bay 1** `[E]` to avoid open-door penalties.',
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
          { label: 'Close Dock Bay 1 door [E]', done: Boolean(wh && wh.completed && bay1 && !bay1.isOpen) }
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
      desc: 'Dry vendor **V#143** is waiting outside the East **Side Rollup Door**. Press `[E]` on the switch to raise the door, then click the driver `[E]` to bring their cart inside.',
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
      desc: 'Click the vendor/cart `[E]` for Paper Invoice, open Scanner `[F]` -> `1. CREATE RECEIPT`, and copy **Dept#, Vendor, Invoice, Units & Cost** from the Invoice into the highlighted Scanner field (`ENT`).',
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
      desc: 'Scan/click every box on the vendor cart (`[SCAN]`/`F`), press `F5` -> `ENT` to finalize, press `F6` to print the Store Copy, collect from the printer, and hand to driver `[E]`.',
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
      title: '4.1 Check In Cold Truck V#201 & Open Bay 2',
      desc: 'Commercial refrigerated truck **V#201** has backed into **Bay 2** and the driver is waiting at the **Side Door**. Open the Side Door `[E]` to check them in, then open **Bay 2** `[E]` so their trailer opens.',
      hudSpotlights: () => [{ selector: '#door-lights-panel', label: 'SD & BAY 2 LIGHTS', role: 'target' }],
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
          { label: 'Open Dock Bay 2 [E] so pallet reaches check-in', done: Boolean((bay2 && bay2.isOpen) || atCheckin) }
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
      desc: 'Open V#201\'s **Paper Invoice** `[E]` if closed. Cold deliveries (`C` Chilled / `F` Frozen) require a **Temp Probe check** before creating a receipt (`<= 40°F` Chilled, `<= 10°F` Frozen). Click `[ TEMP PROBE ]`.',
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
      desc: 'Create the receipt on Scanner (`1`), then key in the **PLU code** (`4011` for Bananas) manually since produce lacks a scannable UPC barcode. Finalize, print, hand slip, and close Bay 2.',
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
          { label: 'Print, hand slip & close Bay 2 [E]', done: Boolean(d && d.completed && bay2 && !bay2.isOpen) }
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
      desc: 'Admit vendor **V#154**, open their Paper Invoice, and audit physical cases: click **`- SHORT`** to stamp the 1 shorted case on line 1, then click **`+ OVER`** and flag the 1 extra physical box.',
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
      desc: 'Switch to the **CREDIT** tab on the invoice, finalize the regular receipt, then create & finalize a Credit Receipt using the `-` key for negative quantities before printing and handing both slips.',
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
      desc: 'Inspect **Overnight / Night Drop** invoices on the desk (`[E]`), then log into the **CRT Terminal** `[E]` -> **`[1] CREATE MANUAL RECEIPT`** to key & finalize the Night Drop.',
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
      desc: 'Open the **File Cabinet Drawer** `[E]` to verify past paperwork (check for a red `SHORT` stamp), then resolve the open task under Terminal **`[4] RECEIVING TASKS & RECALLS`**.',
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
      desc: 'Pick up the floor **Dept 60 Supply cases** `[E]` and slot them onto **Claims & Supplies Steel**, then open Scanner `[F]` -> **`2. SUPPLY ORDERS`** to submit a sample replenishment order.',
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
      desc: 'Open gray shelf totes `[E]`, switch Scanner `[F]` -> **`4. MARKDOWN CLAIMS`**, scan each damaged item to confirm condition & disposition, then drop it in the matching receptacle.',
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
      desc: 'Collect recalled units from the **Recall Cart**, dump the tote into its designated receptacle, then submit the exact count in CRT Terminal **`[4] RECEIVING TASKS & RECALLS`**.',
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
      desc: 'Open Scanner `[F]` -> **`3. BACKROOM INVENTORY`** -> **`1. LABEL CASES`**, scan/key floor backstock cases, and press `[F6]` to apply case labels.',
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
      desc: 'Pick up `[E]` and slot backstock cases onto **Dry / Cooler Steel**, then finalize **`2. AUDIT BACKROOM`** (`[F5]`) on your Scanner.',
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
      desc: 'Clear remaining Home Office tasks on Terminal `[4]`, return the Electric Jack to its charger, verify all dock doors are closed, and walk to the **Hallway Timeclock** (`12:00 PM` unlocked!) `[E]` to finish the Tutorial!',
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

    document.body.appendChild(root);
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
        if (state.dom.hudCard) {
          state.dom.hudCard.classList.toggle('is-collapsed', state.collapsed);
        }
        syncCollapseButton();
        syncBottomDockLayout();
      });
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

    const vw = global.innerWidth || 1280;
    const vh = global.innerHeight || 800;
    const rects = [];
    specs.forEach((sp) => {
      if (!sp || !sp.selector || typeof document === 'undefined') return;
      const el = document.querySelector(sp.selector);
      if (!isElementVisible(el)) return;
      const r = el.getBoundingClientRect();
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
        const badgeLeft = Math.max(6, Math.min((global.innerWidth || 1000) - 210, box.x));
        const icoHtml = box.role === 'source' ? fmtIco('receipt') : '';
        badgesHtml += `<div class="tut-callout-tag ${box.role === 'source' ? 'is-source' : ''}" style="left:${badgeLeft}px;top:${badgeTop}px;">${icoHtml}${escapeHtml(box.label)}</div>`;
      }
    });

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
    const prhVisible = Boolean(prhEl && prhEl.style.display !== 'none' && isElementVisible(prhEl));
    if (!tutAtBottom || !prhVisible) return;

    const vw = global.innerWidth || 1280;
    const gap = 14;
    const containerEl = document.getElementById('game-container');
    const scannerReserve = (containerEl && containerEl.classList.contains('scanner-open') && vw >= 820 && vw <= 1220) ? 352 : 12;
    const safeLeft = 12;
    const safeRight = Math.max(safeLeft + 260, vw - scannerReserve);
    const avail = safeRight - safeLeft;

    const prhRawW = Math.ceil(prhEl.getBoundingClientRect().width) || 318;
    const tutRawW = Math.ceil(tutEl.getBoundingClientRect().width) || (tutEl.classList.contains('is-collapsed') ? 340 : 470);
    let tutW = tutRawW;
    let prhW = prhRawW;

    if (tutW + gap + prhW > avail) {
      prhW = Math.min(prhRawW, Math.max(150, Math.floor((avail - gap) * 0.42)));
      tutW = Math.max(180, avail - gap - prhW);
      tutEl.style.maxWidth = tutW + 'px';
      prhEl.style.maxWidth = prhW + 'px';
      tutW = Math.min(tutW, Math.ceil(tutEl.getBoundingClientRect().width) || tutW);
      prhW = Math.min(prhW, Math.ceil(prhEl.getBoundingClientRect().width) || prhW);
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

    d.hudCard.classList.toggle('dock-bottom', hasBlockingGameplayModalOpen(rt));
    d.hudCard.classList.toggle('is-collapsed', Boolean(state.collapsed));
    syncCollapseButton();
    syncBottomDockLayout();
    const chText = 'CHAPTER ' + ch.num + ' OF ' + CHAPTERS.length + ' · ' + ch.label;
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
    state.seenActions = {};
    state.stepInitialOpen = {};
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

  function jumpToChapter(chapterNum) {
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
    state.currentChapter = chCfg.num;
    const stepIdx = STEPS.findIndex((s) => s.chapter === chCfg.num);
    state.currentStepIdx = stepIdx >= 0 ? stepIdx : 0;

    if (global.DSDRuntime && typeof global.DSDRuntime.resetTutorialChapterState === 'function') {
      global.DSDRuntime.resetTutorialChapterState(setup);
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
      return jumpToChapter(nextSt.chapter);
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
      markCurrentStepInteracted(null, e && e.key ? String(e.key).toLowerCase() : '', false);
      scheduleFastCommandBarRender();
    }, true);
    global.addEventListener('resize', () => {
      if (state.active) syncBottomDockLayout();
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
