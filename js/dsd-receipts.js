(function (global) {
  'use strict';

  /**
   * DSDReceipts (Core Store) - Receipts, Delivery Enrichment, Printing & Handoff
   *
   * Companion modules (must load after this file in order):
   * - js/dsd-scanner.js  (2-Phase Hand Scanner State Machine & LCD Renderer)
   * - js/dsd-terminal.js (5-Screen CRT Terminal, Night Drops, Filing & Archive)
   */

  const state = {
    processedReceipts: [],
    currentScreen: 'menu', // 'menu' | 'create' | 'receipts' | 'receipt-detail' | 'schedule' | 'tasks' | 'suppliers'
    selectedReceiptNo: null,
    selectedDeptNo: null,
    selectedVendorNo: null,
    supplierQuery: '',
    receiptsDeptGroup: '01',
    manualDraft: null,
    terminalOpen: false,
    terminalActiveField: 'vendorNo', // create: 'vendorNo'|'deptNo'|'invoiceNo'|'productCode'|'quantity'; detail: 'vendorNo'|'deptNo'|'invoiceNo'; suppliers: 'search'
    terminalEditFields: null,
    terminalSupplierKeypadOpen: false,
    terminalAlphaMode: true,
    supplierTreeLevel: 'depts', // 'depts' | 'vendors' | 'items'
    terminalPage: {
      create: 0,
      createInitial: 0,
      receipts: 0,
      receiptDetail: 0,
      schedule: 0,
      tasks: 0,
      suppliersSearch: 0,
      suppliersDepts: 0,
      suppliersVendors: 0,
      suppliersItems: 0
    },

    // Phase 2: Night Drops, Pinned Desk Document, Daily Filing, and 32-Day Archive
    nightDropInvoices: [],
    resolvedNightDrops: [],
    pinnedArchiveItems: [], // Max 1 pinned archive doc on desk
    nightDropPanelOpen: false,
    activeNightDropTab: 0,

    filingOpen: false,
    filingInvoices: [],
    filingReceipts: [],
    filingComplete: false,
    filedReceiptsCount: 0,
    filingSelectedSide: null, // 'inv' | 'rec' | null
    filingSelectedIdx: -1,

    archiveOpen: false,
    archiveData: [],
    archiveSelectedDay: 1,
    archiveSelectedVendorIdx: 0,
    staticArchiveHistory: null,
    archiveHistoryPromise: null,

    // Hand Scanner multi-screen static LCD state
    scanner: {
      screen: 'home', // 'home' | 'create' | 'resume' | 'scanning' | 'list' | 'totals' | 'confirm-finalize' | 'finalized' | 'supply' | 'inventory' | 'damage'
      phase: 'home', // 'idle' | 'home' | 'headers' | 'scanning' | 'confirm-finalize' | 'complete' | 'supply' | 'inventory' | 'damage'
      homeSelectedIdx: 0,
      activeReceiptNo: null,
      standaloneMode: false,
      activeField: 'deptNo', // create: 'deptNo'|'vendorNo'|'invoiceNo'|'units'|'cost'; scanning: 'productCode'|'quantity'
      headers: { vendorNo: '', deptNo: '', invoiceNo: '' },
      expectedUnitsStr: '',
      expectedCostCents: '',
      expectedNegative: false,
      expectedUnits: 0,
      expectedCost: 0,
      productCode: '',
      quantity: '',
      pendingBoxId: null,
      negativeMode: false,
      currentDocType: 'invoice', // 'invoice' | 'credit'
      scannedItems: [], // { code, name, qty, price, notScannable, type }
      scannedCredits: [],
      listScroll: 0,
      resumeScroll: 0,
      resumeSelectedIdx: 0,
      finalizedSnapshot: null,
      statusMessage: '',
      statusKind: 'info', // 'info' | 'ok' | 'warn' | 'err'
      lastScannedLabel: '',
      finalizedPrinted: false,
      supply: {
        skuInput: '',
        qtyInput: '',
        negativeMode: false,
        activeField: 'sku',
        selectedIdx: 0,
        cartItems: [],
        cartScroll: 0,
        cartSelectedIdx: 0,
        pendingOrders: [],
        submittedToday: false,
        submittedEtaDate: '',
        lastSubmittedCases: 0,
        lastSubmittedSkus: 0
      },
      damage: {
        pendingItemId: null,
        selectedConditionIdx: 0,
        selectedConditionKey: 'leaking',
        computedDisposition: '',
        isVendorCredit: false
      },
      inventoryMenuIdx: 0,
      label: {
        productCode: '',
        pendingCaseId: null,
        pluTargetCaseId: null,
        lastScannedLabel: '',
        qtyPerCase: 0,
        isPluCase: false,
        printedCount: 0
      },
      inventory: {
        binLabel: '',
        productCode: '',
        quantity: '',
        activeField: 'productCode',
        pendingCaseId: null,
        pluTargetCaseId: null,
        lastScannedLabel: '',
        scannedEntries: [],
        listScroll: 0,
        listSelectedIdx: 0,
        finalized: false,
        auditSummary: null
      }
    },

    // Printed dot-matrix paper slips held by the player (bottom-center HUD)
    printedSlips: [],
    printerTraySlips: [],
    activeSlipIndex: -1,
    printedHudMinimized: false,
    trashModalOpen: false,
    selectedTrashSlipIds: new Set(),
    handModalOpen: false,
    handTargetDelivery: null,
    handOnComplete: null,
    handStatusError: '',
    selectedHandSlipIds: new Set(),
    terminalRecallCount: '',
    terminalLedgerMsg: '',
    homeOfficeTasks: [],
    proceduralArchiveSnapshot: null,

    hooks: {
      getActiveDelivery: null,
      getDeliveryManifest: null,
      getPalletManifest: null,
      getTargetZoneLabel: null,
      isDeliveryCheckInReady: null,
      getDeliveryStatusLabel: null,
      isScannerNearDelivery: null,
      isScannerFocusedOnDelivery: null,
      getHoveredBox: null,
      isPalletTarget: null,
      onDeliveryCompleted: null,
      onDeliveryRefused: null,
      onReceiptUpdated: null,
      onReceiptPrinted: null,
      onReceiptCollected: null,
      onReceiptDiscarded: null,
      onReceiptHanded: null,
      onFinalizeReceiving: null,
      onCloseTerminal: null,
      onOpenTerminalScreen: null,
      onToggleTerminalScreen: null,
      isTerminalOpen: null,
      onOpenScanner: null,
      onToggleScanner: null,
      onCloseScanner: null,
      isScannerOpen: null,
      onDeskStateChanged: null,
      onPhase2ModalChange: null,
      playBeep: null,
      playError: null,
      playSuccess: null,
      playPaper: null,
      showNotification: null,
      showAlert: null,
      renderScannerFallback: null,
      getHoveredLabelCase: null
    }
  };

  // =========================================================================
  // CROSS-MODULE BRIDGE (Core <-> Scanner <-> Terminal)
  // =========================================================================

  const bridge = {
    state: state,
    core: null,
    fn: {}
  };

  function invokeBridge(fnName, args) {
    const fn = bridge.fn[fnName];
    return typeof fn === 'function' ? fn.apply(null, args) : undefined;
  }

  // Late-bound Scanner & Terminal forwarders invoked by Core
  function resetScannerSession() { return invokeBridge('resetScannerSession', arguments); }
  function setScannerMessage() { return invokeBridge('setScannerMessage', arguments); }
  function renderScannerUI() { return invokeBridge('renderScannerUI', arguments); }
  function updateTerminalClock() { return invokeBridge('updateTerminalClock', arguments); }
  function openTerminalScreen() { return invokeBridge('openTerminalScreen', arguments); }
  function startManualDraft() { return invokeBridge('startManualDraft', arguments); }
  function renderTerminalUI() { return invokeBridge('renderTerminalUI', arguments); }
  function generateHomeOfficeTasksForShift() { return invokeBridge('generateHomeOfficeTasksForShift', arguments); }
  function notifyDeskStateChanged() { return invokeBridge('notifyDeskStateChanged', arguments); }
  function generateNightDropInvoices() { return invokeBridge('generateNightDropInvoices', arguments); }
  function resolveNightDropByInvoiceNo() { return invokeBridge('resolveNightDropByInvoiceNo', arguments); }
  function closeNightDropPanel() { return invokeBridge('closeNightDropPanel', arguments); }
  function closeFilingOverlay() { return invokeBridge('closeFilingOverlay', arguments); }
  function syncArchiveReceiptsToLedger() { return invokeBridge('syncArchiveReceiptsToLedger', arguments); }
  function loadArchiveHistory() { return invokeBridge('loadArchiveHistory', arguments); }
  function isCampaignArchiveDay() { return invokeBridge('isCampaignArchiveDay', arguments); }
  function restoreHistoricalArchiveDays() { return invokeBridge('restoreHistoricalArchiveDays', arguments); }
  function generateArchiveData() { return invokeBridge('generateArchiveData', arguments); }
  function closeInvoiceArchive() { return invokeBridge('closeInvoiceArchive', arguments); }
  function bindTerminalEvents() { return invokeBridge('bindTerminalEvents', arguments); }
  function getCatalog() {
    return global.DSDCatalog || null;
  }

  function getClock() {
    return global.ShiftClock || null;
  }

  function getWorkdayIndex() {
    const clock = getClock();
    const snap = clock && typeof clock.getTimeSnapshot === 'function' ? clock.getTimeSnapshot() : null;
    const idx = Number(snap && snap.workdayIndex);
    return Number.isFinite(idx) && idx >= 1 ? idx : 1;
  }

  function getStats() {
    return global.ShiftStats || null;
  }

  function playBeep(kind) {
    if (typeof state.hooks.playBeep === 'function') state.hooks.playBeep(kind);
  }

  function playLabel() {
    if (typeof state.hooks.playLabel === 'function') {
      state.hooks.playLabel();
    } else {
      playSuccess();
    }
  }

  function playError() {
    if (typeof state.hooks.playError === 'function') state.hooks.playError();
  }

  function playSuccess() {
    if (typeof state.hooks.playSuccess === 'function') state.hooks.playSuccess();
  }

  function playPaper() {
    if (typeof state.hooks.playPaper === 'function') state.hooks.playPaper();
  }

  function notify(msg, durationOrPriority, explicitPriority) {
    if (typeof state.hooks.showNotification === 'function') {
      state.hooks.showNotification(msg, durationOrPriority || 3200, explicitPriority);
    }
  }

  function alertMsg(msg) {
    if (typeof state.hooks.showPopupModal === 'function') {
      state.hooks.showPopupModal(msg);
    } else if (typeof state.hooks.showAlert === 'function') {
      state.hooks.showAlert(msg);
    } else {
      notify(msg, 4000);
    }
  }

  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function padDigits(val, len) {
    const clean = String(val || '').replace(/\D/g, '');
    return clean.padStart(len, '0').slice(-len);
  }

  function formatMoney(num) {
    return '$' + (Number(num) || 0).toFixed(2);
  }

  function formatIsoDateString(rawDate, snapFallback) {
    const raw = String(rawDate || '').trim();
    const isoM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (isoM) return raw;
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const txtM = /(?:^|\s)([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})/i.exec(raw);
    if (txtM) {
      const mIdx = months.indexOf(txtM[1].toUpperCase());
      if (mIdx !== -1) {
        return txtM[3] + '-' + String(mIdx + 1).padStart(2, '0') + '-' + String(parseInt(txtM[2], 10)).padStart(2, '0');
      }
    }
    const slashM = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw);
    if (slashM) {
      const yr = slashM[3].length === 2 ? ('19' + slashM[3]) : slashM[3];
      return yr + '-' + String(parseInt(slashM[1], 10)).padStart(2, '0') + '-' + String(parseInt(slashM[2], 10)).padStart(2, '0');
    }
    const s = snapFallback || (getClock() ? getClock().getTimeSnapshot() : null);
    if (s) {
      if (s.tutorialMode) return '1996-02-01';
      const mIdx = months.indexOf(String(s.monthName || 'FEB').toUpperCase());
      const mm = String((mIdx >= 0 ? mIdx : 1) + 1).padStart(2, '0');
      const dd = String(s.dayOfMonth || '01').padStart(2, '0');
      return String(s.year || 1996) + '-' + mm + '-' + dd;
    }
    return '1996-02-01';
  }

  function formatShortDateFromSnap(snap, useFullYear) {
    const s = snap || (getClock() ? getClock().getTimeSnapshot() : null);
    if (!s) return useFullYear ? '02/01/1996' : '02/01/96';
    if (s.tutorialMode) return 'TUTORIAL';
    const monIdx = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(String(s.monthName || 'FEB').toUpperCase());
    const mm = String((monIdx >= 0 ? monIdx : 1) + 1).padStart(2, '0');
    const dd = String(s.dayOfMonth || '01').padStart(2, '0');
    const yr = useFullYear ? String(s.year || 1996) : String(s.year || 1996).slice(-2);
    return mm + '/' + dd + '/' + yr;
  }

  function getCreditInvoiceNo(delivery) {
    if (!delivery) return '';
    if (delivery.creditInvoiceNo) return padDigits(delivery.creditInvoiceNo, 6);
    const base = parseInt(delivery.invoiceNo || delivery.docNum || '0', 10);
    return base > 0 ? padDigits(base + 1, 6) : '';
  }


  function getItemUnitsPerCase(itemOrCode, deliveryType) {
    if (deliveryType === 'warehouse' || deliveryType === 'credit') return 1;
    if (itemOrCode && typeof itemOrCode === 'object') {
      const explicit = Number(itemOrCode.unitsPerCase);
      if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
    }
    const cat = getCatalog();
    const code = (itemOrCode && typeof itemOrCode === 'object') ? itemOrCode.code : itemOrCode;
    const prod = (cat && code && typeof cat.getProduct === 'function') ? cat.getProduct(String(code)) : null;
    if (prod && Number(prod.unitsPerCase) > 0) return Math.round(Number(prod.unitsPerCase));
    if (cat && typeof cat.getUnitsPerCase === 'function') {
      return Math.max(1, cat.getUnitsPerCase(prod || itemOrCode));
    }
    return 8;
  }

  function getActiveDeliveryEnriched() {
    const d = typeof state.hooks.getActiveDelivery === 'function'
      ? state.hooks.getActiveDelivery()
      : null;
    return d ? enrichDelivery(d) : null;
  }

  function isDeliveryCheckInReady(d) {
    if (!d || d.refused || d.completed) return false;
    if (typeof state.hooks.isDeliveryCheckInReady === 'function') {
      return Boolean(state.hooks.isDeliveryCheckInReady(d));
    }
    return true;
  }

  function collectInsideDeliveryCandidates() {
    const list = [];
    const seenIds = new Set();
    const pushCand = (entry) => {
      if (!entry) return;
      const e = enrichDelivery(entry);
      if (!e || (e.id && seenIds.has(e.id))) return;
      if (e.id) seenIds.add(e.id);
      list.push(e);
    };
    pushCand(getActiveDeliveryEnriched());
    if (typeof state.hooks.getDeliveryManifest === 'function') {
      (state.hooks.getDeliveryManifest() || []).forEach(pushCand);
    }
    return list;
  }

  function getDeliveryById(deliveryId) {
    if (!deliveryId) return null;
    return collectInsideDeliveryCandidates().find((d) => d && d.id === deliveryId) || null;
  }

  function findMatchingInsideDeliveryByHeaders(headers) {
    if (!headers || !headers.deptNo || !headers.vendorNo || !headers.invoiceNo) return null;
    const deptNo = padDigits(headers.deptNo, 2);
    const vendorNo = padDigits(headers.vendorNo, 3);
    const invoiceNo = padDigits(headers.invoiceNo, 6);
    const candidates = collectInsideDeliveryCandidates();
    return candidates.find((d) => {
      if (!isDeliveryCheckInReady(d)) return false;
      if (d.deptNo !== deptNo || d.vendorNo !== vendorNo) return false;
      const creditInv = d.docStates && d.docStates.creditRequired ? getCreditInvoiceNo(d) : '';
      return d.invoiceNo === invoiceNo || (creditInv && creditInv === invoiceNo);
    }) || null;
  }

  function createInitialDamageState() {
    return {
      productCode: '',
      pendingItemId: null,
      pluTargetItemId: null,
      isPluItem: false,
      selectedConditionIdx: 0,
      selectedConditionKey: 'leaking',
      computedDisposition: '',
      isVendorCredit: false
    };
  }

  function createInitialSupplyState() {
    return {
      skuInput: '',
      qtyInput: '',
      negativeMode: false,
      activeField: 'sku',
      selectedIdx: 0,
      cartItems: [],
      cartScroll: 0,
      cartSelectedIdx: 0,
      totalsReturnScreen: 'supply',
      pendingOrders: [],
      submittedToday: false,
      submittedEtaDate: '',
      lastSubmittedCases: 0,
      lastSubmittedSkus: 0
    };
  }

  function createInitialLabelState() {
    return {
      productCode: '',
      pendingCaseId: null,
      pluTargetCaseId: null,
      lastScannedLabel: '',
      qtyPerCase: 0,
      isPluCase: false,
      printedCount: 0
    };
  }

  function createInitialInventoryState() {
    return {
      binLabel: '',
      productCode: '',
      quantity: '',
      negativeMode: false,
      activeField: 'productCode',
      pendingCaseId: null,
      pluTargetCaseId: null,
      lastScannedLabel: '',
      scannedEntries: [],
      listScroll: 0,
      listSelectedIdx: 0,
      finalized: false,
      auditSummary: null
    };
  }

  function syncBoxListForCode(boxList, code, targetCount, pendingBoxId) {
    const boxes = (boxList || []).filter((b) => b.code === String(code) && !b.overageFlagged);
    const desired = Math.max(0, Math.min(boxes.length, Number(targetCount) || 0));
    const currentlyScanned = boxes.filter((b) => b.scanned);

    if (currentlyScanned.length < desired) {
      if (pendingBoxId) {
        const pendingBox = boxes.find((b) => (b.boxId === pendingBoxId || b.id === pendingBoxId) && !b.scanned);
        if (pendingBox) {
          pendingBox.scanned = true;
          currentlyScanned.push(pendingBox);
        }
      }
      for (let i = 0; i < boxes.length && currentlyScanned.length < desired; i++) {
        if (!boxes[i].scanned) {
          boxes[i].scanned = true;
          currentlyScanned.push(boxes[i]);
        }
      }
    } else if (currentlyScanned.length > desired) {
      for (let i = currentlyScanned.length - 1; i >= desired; i--) {
        currentlyScanned[i].scanned = false;
      }
    }
  }

  function syncScannedBoxesForCode(d, code, netQty, pendingBoxId) {
    const invItem = (d && Array.isArray(d.invoiceItems))
      ? d.invoiceItems.find((it) => String(it.code) === String(code))
      : null;
    const boxMatch = (d && Array.isArray(d.physicalBoxes))
      ? d.physicalBoxes.find((b) => String(b.code) === String(code))
      : null;
    const upc = getItemUnitsPerCase(invItem || boxMatch || code, d && d.type);
    const scannedCases = Math.floor(Math.max(0, Number(netQty) || 0) / Math.max(1, upc));
    syncBoxListForCode(d.physicalBoxes, code, scannedCases, pendingBoxId);
    d.totalCases = (d.physicalBoxes || []).filter((b) => !b.overageFlagged).length;
    d.casesScanned = (d.physicalBoxes || []).filter((b) => b.scanned && !b.overageFlagged).length;
  }

  function syncCreditBoxesForCode(d, code, absQty, pendingBoxId) {
    syncBoxListForCode(d.creditBoxes, code, absQty, pendingBoxId);
  }

  // =========================================================================
  // DELIVERY DSD ENRICHMENT
  // =========================================================================

  /**
   * Ensures a delivery manifest record has valid DSDCatalog vendor/dept/products,
   * 6-digit invoiceNo, physicalBoxes array, and temp/discrepancy flags.
   */
  function enrichDelivery(delivery) {
    if (!delivery) return null;
    if (delivery._dsdEnriched) {
      const delivId = delivery.id || null;
      if (delivId) {
        if (Array.isArray(delivery.physicalBoxes)) {
          delivery.physicalBoxes.forEach((b) => { if (b && !b.deliveryId) b.deliveryId = delivId; });
        }
        if (Array.isArray(delivery.creditBoxes)) {
          delivery.creditBoxes.forEach((b) => { if (b && !b.deliveryId) b.deliveryId = delivId; });
        }
      }
      return delivery;
    }

    const catalog = getCatalog();
    const vendorEntry = catalog ? catalog.getVendor(delivery.vendorNo) : null;

    if (vendorEntry) {
      delivery.vendorNo = vendorEntry.vendorNo;
      delivery.deptNo = delivery.deptNo || vendorEntry.deptNo;
      if (!delivery.vendor || delivery.vendor === 'Vendor') {
        delivery.vendor = vendorEntry.name;
      }
      delivery.dept = (catalog.getDepartment(delivery.deptNo) || {}).name || delivery.dept || vendorEntry.deptName;
    } else {
      delivery.vendorNo = padDigits(delivery.vendorNo || '101', 3);
      delivery.deptNo = padDigits(delivery.deptNo || '10', 2);
    }

    // Authentic DSD invoice number: strictly 6 numeric digits (no PO/ASN prefixes)
    const rawDigits = String(delivery.invoiceNo || delivery.docNum || '').replace(/\D/g, '');
    if (rawDigits.length === 6) {
      delivery.invoiceNo = rawDigits;
    } else {
      const seed = parseInt(delivery.vendorNo, 10) * 1000 + parseInt(delivery.deptNo, 10) * 13 + 480000;
      delivery.invoiceNo = String(seed).padStart(6, '0').slice(-6);
    }
    delivery.docNum = delivery.invoiceNo;

    const resolveItemUnits = (itemOrProd, isCredOrWhse) => {
      if (isCredOrWhse) return 1;
      const explicit = Number(itemOrProd && itemOrProd.unitsPerCase);
      if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
      const codeProd = (catalog && itemOrProd && itemOrProd.code && typeof catalog.getProduct === 'function')
        ? catalog.getProduct(itemOrProd.code)
        : null;
      if (codeProd && Number(codeProd.unitsPerCase) > 0) return Math.round(Number(codeProd.unitsPerCase));
      if (catalog && typeof catalog.getUnitsPerCase === 'function') {
        return Math.max(1, catalog.getUnitsPerCase(codeProd || itemOrProd));
      }
      const sz = String((itemOrProd && itemOrProd.size) || (codeProd && codeProd.size) || 'medium').toLowerCase();
      return sz === 'large' ? 4 : (sz === 'small' ? 12 : 8);
    };

    // Build invoiceItems from catalog products if not explicitly provided
    if (!Array.isArray(delivery.invoiceItems) || delivery.invoiceItems.length === 0) {
      const catalogProducts = vendorEntry && Array.isArray(vendorEntry.products) ? vendorEntry.products : [];
      const fallbackItemCount = Math.max(2, Math.min(3, catalogProducts.length || 2));
      const baseCases = Math.max(fallbackItemCount, Number(delivery.totalCases) || 6);
      delivery.invoiceItems = [];

      for (let i = 0; i < fallbackItemCount; i++) {
        const prod = catalogProducts[i] || {
          name: delivery.commodity || 'General DSD Case',
          code: '00049000' + String(100 + i),
          price: 18.5,
          size: 'medium',
          type: delivery.tempZone === 'F' ? 'frozen' : (delivery.tempZone === 'C' ? 'refrigerated' : 'ambient'),
          temp: delivery.expectedTemp || 'ambient',
          notScannable: false
        };
        const share = i === 0 ? Math.ceil(baseCases / fallbackItemCount) : Math.floor(baseCases / fallbackItemCount);
        const cases = Math.max(1, share);
        const upc = resolveItemUnits(prod, delivery.type === 'warehouse');
        const qty = cases * upc;
        delivery.invoiceItems.push({
          name: prod.name,
          code: String(prod.code),
          qty: qty,
          billedQty: qty,
          physicalQty: qty,
          cases: cases,
          physicalCases: cases,
          unitsPerCase: upc,
          size: prod.size || 'medium',
          price: Number(prod.price) || 15.0,
          type: prod.type || 'ambient',
          temp: prod.temp || 'ambient',
          notScannable: Boolean(prod.notScannable),
          shortageStamped: false,
          overageFlagged: false
        });
      }
    } else {
      delivery.invoiceItems = delivery.invoiceItems.map((it) => {
        const prod = catalog ? catalog.getProduct(it.code) : null;
        const upc = resolveItemUnits(it.unitsPerCase ? it : (prod || it), delivery.type === 'warehouse');
        const qty = Math.max(1, Number(it.qty) || upc);
        const billedQty = it.billedQty !== undefined ? Math.max(1, Number(it.billedQty)) : qty;
        const physicalQty = it.physicalQty !== undefined ? Math.max(0, Number(it.physicalQty)) : qty;
        const cases = it.cases !== undefined ? Math.max(1, Math.round(Number(it.cases))) : Math.max(1, Math.round(billedQty / upc));
        const physicalCases = it.physicalCases !== undefined
          ? Math.max(0, Math.round(Number(it.physicalCases)))
          : (physicalQty <= 0 ? 0 : Math.max(1, Math.round(physicalQty / upc)));
        return {
          name: it.name || (prod ? prod.name : 'DSD Product'),
          code: String(it.code || (prod ? prod.code : '00000000000')),
          qty: qty,
          billedQty: billedQty,
          physicalQty: physicalQty,
          cases: cases,
          physicalCases: physicalCases,
          unitsPerCase: upc,
          size: it.size || (prod ? prod.size : 'medium'),
          price: Number(it.price !== undefined ? it.price : (prod ? prod.price : 15.0)),
          type: it.type || (prod ? prod.type : 'ambient'),
          temp: it.temp || (prod ? prod.temp : 'ambient'),
          notScannable: it.notScannable !== undefined ? Boolean(it.notScannable) : Boolean(prod && prod.notScannable),
          shortageStamped: Boolean(it.shortageStamped),
          overageFlagged: Boolean(it.overageFlagged)
        };
      });
    }

    if (!Array.isArray(delivery.creditItems)) {
      delivery.creditItems = [];
    } else {
      delivery.creditItems = delivery.creditItems.map((it) => {
        const prod = catalog ? catalog.getProduct(it.code) : null;
        return {
          name: it.name || (prod ? prod.name : 'Damaged/Credit Return'),
          code: String(it.code || (prod ? prod.code : '00000000000')),
          qty: Math.max(1, Math.abs(Number(it.qty) || 1)),
          unitsPerCase: 1,
          price: Number(it.price !== undefined ? it.price : (prod ? prod.price : 10.0)),
          type: it.type || (prod ? prod.type : 'ambient'),
          notScannable: it.notScannable !== undefined ? Boolean(it.notScannable) : Boolean(prod && prod.notScannable)
        };
      });
    }

    // Warehouse trucks (Dept 01) verify by pallet staging zones, not individual carton barcode scanning or DSD temp probe
    if (delivery.type === 'warehouse') {
      delivery.physicalBoxes = [];
      delivery.creditBoxes = [];
      delivery.totalCases = Number(delivery.totalCases) || delivery.invoiceItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
      delivery.casesScanned = delivery.totalCases;
      delivery.hasDiscrepancy = false;
      delivery.discrepancyResolved = true;
      delivery.outOfTemp = false;
      delivery.requiresTempCheck = false;
      delivery.docStates = {
        invoiceRequired: delivery.invoiceItems.length > 0,
        creditRequired: false,
        invoiceCreated: Boolean(delivery.receiptCreated),
        creditCreated: true
      };
      delivery._dsdEnriched = true;
      return delivery;
    }

    // Build physical boxes for 3D barcode / PLU scanning (1 physical box mesh = 1 case)
    const boxes = [];
    let boxSeq = 1;
    delivery.invoiceItems.forEach((it) => {
      const upc = Math.max(1, Number(it.unitsPerCase) || 1);
      const physCases = it.physicalCases !== undefined
        ? Math.max(0, Math.round(Number(it.physicalCases)))
        : (Number(it.physicalQty || 0) <= 0 ? 0 : Math.max(1, Math.round(Number(it.physicalQty || 0) / upc)));
      for (let q = 0; q < physCases; q++) {
        boxes.push({
          boxId: 'B' + boxSeq++,
          deliveryId: delivery.id || null,
          code: it.code,
          name: it.name,
          price: it.price,
          type: it.type,
          unitsPerCase: upc,
          notScannable: Boolean(it.notScannable),
          scanned: false
        });
      }
    });
    delivery.physicalBoxes = boxes;

    const crdBoxes = [];
    let crdSeq = 1;
    delivery.creditItems.forEach((it) => {
      const cQty = Math.max(1, Math.abs(Number(it.qty) || 1));
      for (let q = 0; q < cQty; q++) {
        crdBoxes.push({
          boxId: 'C' + crdSeq++,
          deliveryId: delivery.id || null,
          code: it.code,
          name: it.name,
          price: it.price,
          type: it.type,
          unitsPerCase: 1,
          notScannable: Boolean(it.notScannable),
          isCredit: true,
          scanned: false
        });
      }
    });
    delivery.creditBoxes = crdBoxes;

    delivery.totalCases = boxes.length;
    delivery.casesScanned = 0;
    delivery.hasDiscrepancy = delivery.invoiceItems.some((it) => it.physicalQty !== it.qty);
    delivery.discrepancyResolved = !delivery.hasDiscrepancy;
    delivery.outOfTemp = Boolean(delivery.outOfTemp);
    delivery.requiresTempCheck = delivery.tempZone === 'C' || delivery.tempZone === 'F' ||
      delivery.invoiceItems.some((it) => it.type === 'refrigerated' || it.type === 'frozen');
    delivery.docStates = {
      invoiceRequired: delivery.invoiceItems.length > 0,
      creditRequired: delivery.creditItems.length > 0,
      invoiceCreated: false,
      creditCreated: delivery.creditItems.length === 0
    };
    if (delivery.docStates.creditRequired) {
      delivery.creditInvoiceNo = getCreditInvoiceNo(delivery);
    }
    delivery._dsdEnriched = true;
    return delivery;
  }

  function enrichAllDeliveries() {
    const manifest = typeof state.hooks.getDeliveryManifest === 'function'
      ? state.hooks.getDeliveryManifest()
      : null;
    if (Array.isArray(manifest)) {
      manifest.forEach(enrichDelivery);
    }
  }

  // =========================================================================
  // RECEIPT STORE (CREATE / EDIT HEADER / VOID)
  // =========================================================================

  function resolveReceiptDocType(vendorNo, items, explicitType) {
    const list = Array.isArray(items) ? items : [];
    const isCredit = explicitType === 'credit' || (list.length > 0 && list.every((it) => Number(it.qty) < 0));
    if (isCredit) return 'credit';
    const vNo = padDigits(vendorNo, 3);
    if (vNo === '011' || explicitType === 'po') return 'po';
    return 'invoice';
  }

  function createReceipt(params) {
    const stats = getStats();
    const clock = getClock();
    const snap = clock ? clock.getTimeSnapshot() : { dateLabel: 'FEB 1, 1996', formatted12h: '6:00 AM' };

    const deptNo = padDigits(params.deptNo, 2);
    const vendorNo = padDigits(params.vendorNo, 3);
    const invoiceNo = padDigits(params.invoiceNo, 6);
    const receiptNumber = params.receiptNumber || (stats
      ? stats.generateReceiptNumber(deptNo, state.processedReceipts)
      : (deptNo + '-' + String(state.processedReceipts.length + 1).padStart(4, '0')));

    const items = (params.items || [])
      .filter((it) => (Number(it.qty) || 0) !== 0)
      .map((it) => {
        const q = Number(it.qty) || 0;
        const upc = (q < 0 || deptNo === '01') ? 1 : getItemUnitsPerCase(it, 'sidedoor');
        return {
          code: String(it.code),
          name: String(it.name || 'Item'),
          qty: q,
          unitsPerCase: upc,
          price: Number(it.price) || 0,
          notScannable: Boolean(it.notScannable),
          type: it.type || 'ambient'
        };
      });

    // Credit receipts have all negative quantities; V011 warehouse deliveries default to type 'po'
    const resolvedType = resolveReceiptDocType(vendorNo, items, params.type);
    const totalAmount = items.reduce((sum, it) => sum + (it.qty * it.price), 0);
    const recDate = params.date || snap.dateLabel;
    const recDateIso = params.dateIso || formatIsoDateString(recDate, snap);
    const receipt = {
      receiptNumber: receiptNumber,
      date: recDate,
      dateIso: recDateIso,
      time: params.time || snap.formatted12h,
      vendorNo: vendorNo,
      deptNo: deptNo,
      invoiceNo: invoiceNo,
      expectedUnits: params.expectedUnits !== undefined && params.expectedUnits !== null ? Number(params.expectedUnits) : null,
      expectedCost: params.expectedCost !== undefined && params.expectedCost !== null ? Number(params.expectedCost) : null,
      type: resolvedType,
      source: params.source || 'scanner',
      items: items,
      totalAmount: Number(totalAmount.toFixed(2)),
      voided: false,
      finalized: params.finalized !== undefined ? Boolean(params.finalized) : (items.length > 0),
      cleared: Boolean(params.cleared),
      storeCopyPrinted: Boolean(params.storeCopyPrinted),
      isPreviousDay: Boolean(params.isPreviousDay),
      outOfTemp: Boolean(params.outOfTemp),
      accurate: params.accurate !== false,
      deliveryId: params.deliveryId || null
    };

    state.processedReceipts.push(receipt);
    if (receipt.items.length > 0) {
      resolveNightDropByInvoiceNo(receipt.invoiceNo, receipt.receiptNumber);
    }
    return receipt;
  }

  function validateAndCreateBlankReceipt(params) {
    const catalog = getCatalog();
    const rawV = String((params && params.vendorNo) || '').trim();
    const rawD = String((params && params.deptNo) || '').trim();
    const rawI = String((params && params.invoiceNo) || '').trim();
    const vNo = padDigits(rawV, 3);
    const dNo = padDigits(rawD, 2);
    const invNo = padDigits(rawI, 6);

    if (!rawV || !rawD || !rawI) {
      return { ok: false, error: 'FILL DEPT/VEND/INV' };
    }
    if (!/^\d{6}$/.test(invNo) || invNo === '000000') {
      return { ok: false, error: 'INVOICE MUST BE 6D' };
    }
    if (catalog && !catalog.getDepartment(dNo)) {
      return { ok: false, error: 'UNKNOWN DEPT #' + dNo };
    }
    if (catalog && !catalog.getVendorInDept(vNo, dNo)) {
      return { ok: false, error: 'BAD VENDOR #' + vNo };
    }

    const rec = createReceipt({
      vendorNo: vNo,
      deptNo: dNo,
      invoiceNo: invNo,
      expectedUnits: params && params.expectedUnits,
      expectedCost: params && params.expectedCost,
      source: (params && params.source) || 'scanner',
      items: [],
      finalized: false,
      deliveryId: (params && params.deliveryId) || null
    });
    return { ok: true, receipt: rec };
  }

  function isPreviousDayReceipt(rec) {
    if (!rec) return false;
    if (rec.isPreviousDay) return true;
    const clock = getClock();
    const today = clock ? clock.getTimeSnapshot().dateLabel : null;
    return Boolean(today && rec.date && rec.date !== today);
  }

  function getReceiptStatus(rec) {
    if (!rec) return 'VOID';
    if (rec.voided) return 'VOID';
    if (rec.cleared || isPreviousDayReceipt(rec)) return 'CLEAR';
    if (rec.finalized) return 'FINAL';
    return 'INITIAL';
  }

  function getInitialReceipts() {
    return state.processedReceipts
      .slice()
      .reverse()
      .filter((r) => getReceiptStatus(r) === 'INITIAL');
  }

  function resumeReceiptInTerminal(receiptNumber) {
    const rec = findReceipt(receiptNumber);
    if (!rec || getReceiptStatus(rec) !== 'INITIAL') return false;

    // Detach from scanner if currently open there so ownership moves cleanly to terminal
    if (state.scanner.activeReceiptNo === rec.receiptNumber) {
      resetScannerSession(getActiveDeliveryEnriched());
      renderScannerUI();
    }

    state.manualDraft = {
      phase: 'scanning',
      receiptNumber: rec.receiptNumber,
      vendorNo: rec.vendorNo,
      deptNo: rec.deptNo,
      invoiceNo: rec.invoiceNo,
      type: rec.type || 'invoice',
      productCode: '',
      qty: '',
      items: (rec.items || []).map((it) => Object.assign({}, it)),
      error: '',
      success: 'RESUMED INITIAL RECEIPT #' + rec.receiptNumber + '.'
    };
    state.currentScreen = 'create';
    state.terminalActiveField = 'productCode';
    state.terminalSupplierKeypadOpen = false;
    state.terminalPage.create = 0;
    playBeep();
    renderTerminalUI();
    return true;
  }

  function resumeReceiptInScanner(rec, activeDelivery) {
    if (!rec || getReceiptStatus(rec) !== 'INITIAL') return false;

    // Detach from terminal draft if currently open there so ownership moves cleanly to scanner
    if (state.manualDraft && state.manualDraft.receiptNumber === rec.receiptNumber) {
      startManualDraft();
      if (state.currentScreen === 'create') renderTerminalUI();
    }

    const sc = state.scanner;
    const matchedDelivery = (rec.deliveryId ? getDeliveryById(rec.deliveryId) : null) ||
      findMatchingInsideDeliveryByHeaders({ deptNo: rec.deptNo, vendorNo: rec.vendorNo, invoiceNo: rec.invoiceNo }) ||
      (activeDelivery ? enrichDelivery(activeDelivery) : null);
    const matchesDelivery = Boolean(
      matchedDelivery &&
      isDeliveryCheckInReady(matchedDelivery) &&
      (rec.deliveryId === matchedDelivery.id ||
        (rec.deptNo === matchedDelivery.deptNo &&
          rec.vendorNo === matchedDelivery.vendorNo &&
          (rec.invoiceNo === matchedDelivery.invoiceNo || rec.invoiceNo === getCreditInvoiceNo(matchedDelivery))))
    );

    sc.screen = 'scanning';
    sc.phase = 'scanning';
    sc.activeReceiptNo = rec.receiptNumber;
    sc.standaloneMode = !matchesDelivery;
    sc.activeField = 'productCode';
    sc.headers.deptNo = rec.deptNo;
    sc.headers.vendorNo = rec.vendorNo;
    sc.headers.invoiceNo = rec.invoiceNo;
    sc.expectedUnits = rec.expectedUnits !== null && rec.expectedUnits !== undefined ? Math.abs(Number(rec.expectedUnits)) : 0;
    sc.expectedCost = rec.expectedCost !== null && rec.expectedCost !== undefined ? Math.abs(Number(rec.expectedCost)) : null;
    sc.expectedNegative = false;
    sc.expectedUnitsStr = sc.expectedUnits ? String(sc.expectedUnits) : '';
    sc.expectedCostCents = sc.expectedCost !== null ? String(Math.round(sc.expectedCost * 100)) : '';
    sc.productCode = '';
    sc.quantity = '';
    sc.pendingBoxId = null;
    sc.lastScannedLabel = '';
    sc.negativeMode = Boolean(rec.items && rec.items.length > 0 && rec.items.every((it) => Number(it.qty) < 0));
    sc.currentDocType = rec.type || 'invoice';
    sc.scannedItems = (rec.items || []).map((it) => Object.assign({}, it));
    sc.listScroll = 0;

    if (matchesDelivery && matchedDelivery) {
      const isCreditDoc = sc.negativeMode ||
        rec.type === 'credit' ||
        (matchedDelivery.docStates && matchedDelivery.docStates.creditRequired && sc.headers.invoiceNo === getCreditInvoiceNo(matchedDelivery));
      if (isCreditDoc) {
        sc.scannedItems.forEach((it) => {
          const committedCreditOther = getCommittedCreditQtyForCode(matchedDelivery, it.code, rec.receiptNumber);
          syncCreditBoxesForCode(matchedDelivery, it.code, committedCreditOther + Math.abs(Number(it.qty) || 0));
        });
      } else {
        sc.scannedItems.forEach((it) => {
          const committedOther = getCommittedInvoiceQtyForCode(matchedDelivery, it.code, rec.receiptNumber);
          syncScannedBoxesForCode(matchedDelivery, it.code, committedOther + Math.max(0, Number(it.qty) || 0));
        });
      }
      if (typeof state.hooks.onReceiptUpdated === 'function') {
        state.hooks.onReceiptUpdated(matchedDelivery);
      }
    }

    setScannerMessage('', 'info');
    return true;
  }

  function syncReceiptItems(receiptNumber, rawItems, meta) {
    const rec = findReceipt(receiptNumber);
    if (!rec || getReceiptStatus(rec) !== 'INITIAL') return null;

    rec.items = (rawItems || [])
      .filter((it) => (Number(it.qty) || 0) !== 0)
      .map((it) => {
        const q = Number(it.qty) || 0;
        const upc = (q < 0 || rec.deptNo === '01') ? 1 : getItemUnitsPerCase(it, 'sidedoor');
        return {
          code: String(it.code),
          name: String(it.name || 'Item'),
          qty: q,
          unitsPerCase: upc,
          price: Number(it.price) || 0,
          notScannable: Boolean(it.notScannable),
          type: it.type || 'ambient'
        };
      });

    const totalAmount = rec.items.reduce((sum, it) => sum + (it.qty * it.price), 0);
    rec.type = resolveReceiptDocType(rec.vendorNo, rec.items, rec.items.length === 0 ? rec.type : undefined);
    rec.totalAmount = Number(totalAmount.toFixed(2));

    if (meta) {
      if (meta.outOfTemp !== undefined) rec.outOfTemp = Boolean(meta.outOfTemp);
      if (meta.accurate !== undefined) rec.accurate = Boolean(meta.accurate);
      if (meta.finalized !== undefined) rec.finalized = Boolean(meta.finalized);
    }
    return rec;
  }

  function isReceiptForDelivery(rec, d) {
    if (!rec || !d || rec.voided || rec.cleared || isPreviousDayReceipt(rec)) return false;
    if (rec.deliveryId && rec.deliveryId === d.id) return true;
    if (rec.vendorNo !== d.vendorNo || rec.deptNo !== d.deptNo) return false;
    const creditInv = getCreditInvoiceNo(d);
    return rec.invoiceNo === d.invoiceNo || (Boolean(creditInv) && rec.invoiceNo === creditInv);
  }

  function getCommittedInvoiceQtyForCode(d, code, excludeReceiptNo) {
    if (!d) return 0;
    const codeStr = String(code);
    const excludeNo = excludeReceiptNo ? String(excludeReceiptNo) : null;
    let sum = 0;
    state.processedReceipts.forEach((r) => {
      if (!isReceiptForDelivery(r, d)) return;
      if (excludeNo && r.receiptNumber === excludeNo) return;
      if (r.type === 'credit') return;
      if (d.docStates && d.docStates.creditRequired && r.invoiceNo === getCreditInvoiceNo(d) && r.invoiceNo !== d.invoiceNo) return;
      (r.items || []).forEach((it) => {
        if (String(it.code) === codeStr && (Number(it.qty) || 0) > 0) {
          sum += Number(it.qty) || 0;
        }
      });
    });
    return sum;
  }

  function getCommittedCreditQtyForCode(d, code, excludeReceiptNo) {
    if (!d) return 0;
    const codeStr = String(code);
    const excludeNo = excludeReceiptNo ? String(excludeReceiptNo) : null;
    let sum = 0;
    const creditInv = getCreditInvoiceNo(d);
    state.processedReceipts.forEach((r) => {
      if (!isReceiptForDelivery(r, d)) return;
      if (excludeNo && r.receiptNumber === excludeNo) return;
      const isCreditRec = r.type === 'credit' || (d.docStates && d.docStates.creditRequired && r.invoiceNo === creditInv && r.invoiceNo !== d.invoiceNo);
      if (!isCreditRec) return;
      (r.items || []).forEach((it) => {
        if (String(it.code) === codeStr && (Number(it.qty) || 0) < 0) {
          sum += Math.abs(Number(it.qty) || 0);
        }
      });
    });
    return sum;
  }

  function reconcileDeliveryDocStates(d) {
    if (!d) return;
    enrichDelivery(d);
    const creditInv = getCreditInvoiceNo(d);
    const matchingFinals = state.processedReceipts.filter((r) =>
      getReceiptStatus(r) === 'FINAL' &&
      !r.cleared &&
      !isPreviousDayReceipt(r) &&
      r.items &&
      r.items.length > 0 &&
      r.vendorNo === d.vendorNo &&
      r.deptNo === d.deptNo
    );

    const invRec = matchingFinals.filter((r) => r.type !== 'credit' && r.invoiceNo === d.invoiceNo).slice(-1)[0] || null;
    if (invRec) {
      d.docStates.invoiceCreated = true;
      d.lastReceiptNumber = invRec.receiptNumber;
    }

    if (d.docStates && d.docStates.creditRequired) {
      const crdRec = matchingFinals.filter((r) => r.type === 'credit' && r.invoiceNo === creditInv).slice(-1)[0] || null;
      if (crdRec) {
        d.docStates.creditCreated = true;
        d.lastCreditReceiptNumber = crdRec.receiptNumber;
      }
    }

    if ((!d.docStates.invoiceRequired || d.docStates.invoiceCreated) &&
      (!d.docStates.creditRequired || d.docStates.creditCreated)) {
      d.receiptCreated = true;
      d.receiptNumber = d.lastReceiptNumber || d.lastCreditReceiptNumber || d.receiptNumber;
    }
  }

  function reconcileDeliveryBoxesFromReceipts(d) {
    if (!d) return;
    const sc = state.scanner;
    const creditInv = getCreditInvoiceNo(d);
    const isActiveCreditForD = Boolean(
      sc &&
      sc.activeReceiptNo &&
      (sc.currentDocType === 'credit' || (creditInv && sc.headers.invoiceNo === creditInv)) &&
      sc.headers.deptNo === d.deptNo &&
      sc.headers.vendorNo === d.vendorNo
    );
    const isActiveInvoiceForD = Boolean(
      sc &&
      sc.activeReceiptNo &&
      !isActiveCreditForD &&
      sc.headers.deptNo === d.deptNo &&
      sc.headers.vendorNo === d.vendorNo &&
      sc.headers.invoiceNo === d.invoiceNo
    );
    if (Array.isArray(d.physicalBoxes)) {
      const codes = new Set(d.physicalBoxes.map((b) => String(b.code)));
      codes.forEach((code) => {
        const committed = getCommittedInvoiceQtyForCode(d, code, isActiveInvoiceForD ? sc.activeReceiptNo : null);
        let activeQty = 0;
        if (isActiveInvoiceForD) {
          const activeIt = (sc.scannedItems || []).find((it) => String(it.code) === code);
          if (activeIt && (Number(activeIt.qty) || 0) > 0) activeQty = Number(activeIt.qty) || 0;
        }
        syncScannedBoxesForCode(d, code, committed + activeQty);
      });
      d.totalCases = d.physicalBoxes.filter((b) => !b.overageFlagged).length;
      d.casesScanned = d.physicalBoxes.filter((b) => b.scanned && !b.overageFlagged).length;
    }
    if (Array.isArray(d.creditBoxes)) {
      const crdCodes = new Set(d.creditBoxes.map((b) => String(b.code)));
      crdCodes.forEach((code) => {
        const committed = getCommittedCreditQtyForCode(d, code, isActiveCreditForD ? sc.activeReceiptNo : null);
        let activeQty = 0;
        if (isActiveCreditForD) {
          const activeIt = (sc.scannedItems || []).find((it) => String(it.code) === code);
          if (activeIt && (Number(activeIt.qty) || 0) < 0) activeQty = Math.abs(Number(activeIt.qty) || 0);
        }
        syncCreditBoxesForCode(d, code, committed + activeQty);
      });
    }
  }

  function getPendingCounterpartTab(d, wasCredit) {
    if (!d || !d.docStates) return null;
    if (!wasCredit && d.docStates.creditRequired && !d.docStates.creditCreated) return 'credit';
    if (wasCredit && d.docStates.invoiceRequired && !d.docStates.invoiceCreated) return 'invoice';
    return null;
  }

  function syncActiveDeliveryLinkForReceipt(rec) {
    if (!rec || getReceiptStatus(rec) !== 'FINAL' || rec.items.length === 0) {
      return false;
    }
    const candidates = [];
    const activeD = getActiveDeliveryEnriched();
    if (activeD) candidates.push(activeD);
    if (typeof state.hooks.getDeliveryManifest === 'function') {
      const all = state.hooks.getDeliveryManifest() || [];
      all.forEach((entry) => {
        if (entry && entry !== activeD) candidates.push(enrichDelivery(entry));
      });
    }
    const targetD = candidates.find((d) => {
      if (!isDeliveryCheckInReady(d)) return false;
      if (rec.vendorNo !== d.vendorNo || rec.deptNo !== d.deptNo) return false;
      const expectedInv = rec.type === 'credit' && d.docStates && d.docStates.creditRequired
        ? getCreditInvoiceNo(d)
        : d.invoiceNo;
      return rec.invoiceNo === expectedInv;
    });
    if (!targetD) return false;

    if (rec.type === 'credit') {
      targetD.docStates.creditCreated = true;
      targetD.lastCreditReceiptNumber = rec.receiptNumber;
    } else {
      targetD.docStates.invoiceCreated = true;
      targetD.lastReceiptNumber = rec.receiptNumber;
    }
    reconcileDeliveryDocStates(targetD);
    reconcileDeliveryBoxesFromReceipts(targetD);
    const switchTab = getPendingCounterpartTab(targetD, rec.type === 'credit');
    if (switchTab) targetD.preferredInvoiceTab = switchTab;
    if (typeof state.hooks.onReceiptUpdated === 'function') {
      state.hooks.onReceiptUpdated(targetD, switchTab ? { switchInvoiceTab: switchTab } : undefined);
    }
    return true;
  }

  function getReceipts(includeVoided) {
    const list = state.processedReceipts.slice().reverse();
    return includeVoided === false ? list.filter((r) => !r.voided) : list;
  }

  function findReceipt(receiptNumber) {
    return state.processedReceipts.find((r) => r.receiptNumber === receiptNumber) || null;
  }

  function updateReceiptHeader(receiptNumber, patch) {
    const rec = findReceipt(receiptNumber);
    if (!rec) return { ok: false, error: 'Receipt not found.' };
    const st = getReceiptStatus(rec);
    if (st === 'VOID') return { ok: false, error: 'Cannot edit a VOID receipt.' };
    if (st === 'CLEAR') return { ok: false, error: 'Cannot edit a CLEAR receipt (billing processed).' };

    const catalog = getCatalog();
    const deptNo = padDigits(patch.deptNo !== undefined ? patch.deptNo : rec.deptNo, 2);
    const vendorNo = padDigits(patch.vendorNo !== undefined ? patch.vendorNo : rec.vendorNo, 3);
    const invoiceNo = padDigits(patch.invoiceNo !== undefined ? patch.invoiceNo : rec.invoiceNo, 6);

    if (catalog && !catalog.getDepartment(deptNo)) {
      return { ok: false, error: 'Invalid Department #' + deptNo + ' in catalog.' };
    }
    if (catalog && !catalog.getVendorInDept(vendorNo, deptNo)) {
      return { ok: false, error: 'Vendor #' + vendorNo + ' is not assigned to Dept #' + dNoSafe(deptNo) + '.' };
    }
    if (!/^\d{6}$/.test(invoiceNo) || invoiceNo === '000000') {
      return { ok: false, error: 'Invoice # must be a valid 6-digit number.' };
    }

    // Header fields are editable; line items remain strictly read-only per 2D rules.
    rec.deptNo = deptNo;
    rec.vendorNo = vendorNo;
    rec.invoiceNo = invoiceNo;
    rec.type = resolveReceiptDocType(vendorNo, rec.items, rec.items.length === 0 && rec.type === 'credit' ? 'credit' : undefined);
    rec.edited = true;

    // Keep open Scanner / Terminal header display synced if this receipt is currently open
    if (state.scanner.activeReceiptNo === rec.receiptNumber) {
      state.scanner.headers.vendorNo = vendorNo;
      state.scanner.headers.deptNo = deptNo;
      state.scanner.headers.invoiceNo = invoiceNo;
      renderScannerUI();
    }
    if (state.manualDraft && state.manualDraft.receiptNumber === rec.receiptNumber) {
      state.manualDraft.vendorNo = vendorNo;
      state.manualDraft.deptNo = deptNo;
      state.manualDraft.invoiceNo = invoiceNo;
    }

    if (rec.items.length > 0) {
      resolveNightDropByInvoiceNo(rec.invoiceNo, rec.receiptNumber);
      syncActiveDeliveryLinkForReceipt(rec);
    }
    reconcileDeliveriesForReceipt(rec, true);
    return { ok: true, receipt: rec };
  }

  function reconcileDeliveriesForReceipt(rec, clearLinkedFlags) {
    if (!rec) return;
    const candidates = collectInsideDeliveryCandidates();
    candidates.forEach((d) => {
      if (!isDeliveryCheckInReady(d)) return;
      const creditInv = getCreditInvoiceNo(d);
      const linkedInv = d.lastReceiptNumber === rec.receiptNumber;
      const linkedCred = d.lastCreditReceiptNumber === rec.receiptNumber;
      const headerMatches = (
        rec.vendorNo === d.vendorNo &&
        rec.deptNo === d.deptNo &&
        (rec.invoiceNo === d.invoiceNo || (creditInv && rec.invoiceNo === creditInv))
      );
      if (!linkedInv && !linkedCred && rec.deliveryId !== d.id && !headerMatches) return;

      if (clearLinkedFlags && d.docStates) {
        if (linkedInv && (rec.voided || rec.invoiceNo !== d.invoiceNo || rec.vendorNo !== d.vendorNo || rec.deptNo !== d.deptNo)) {
          d.docStates.invoiceCreated = false;
          d.lastReceiptNumber = null;
        }
        if (linkedCred && (rec.voided || rec.invoiceNo !== creditInv || rec.vendorNo !== d.vendorNo || rec.deptNo !== d.deptNo)) {
          d.docStates.creditCreated = false;
          d.lastCreditReceiptNumber = null;
        }
        if (d.docStates.invoiceRequired && !d.docStates.invoiceCreated) {
          d.receiptCreated = false;
        } else if (d.docStates.creditRequired && !d.docStates.creditCreated) {
          d.receiptCreated = false;
        }
      }
      reconcileDeliveryDocStates(d);
      reconcileDeliveryBoxesFromReceipts(d);
      if (typeof state.hooks.onReceiptUpdated === 'function') {
        state.hooks.onReceiptUpdated(d);
      }
    });
  }

  function dNoSafe(val) {
    return padDigits(val, 2);
  }

  function voidReceipt(receiptNumber) {
    const rec = findReceipt(receiptNumber);
    if (!rec) return { ok: false, error: 'Receipt not found.' };
    const st = getReceiptStatus(rec);
    if (st === 'VOID') return { ok: false, error: 'Already voided.' };
    if (st === 'CLEAR') return { ok: false, error: 'Cannot void a CLEAR receipt.' };
    rec.voided = true;
    if (state.scanner.activeReceiptNo === receiptNumber) {
      resetScannerSession(getActiveDeliveryEnriched());
      renderScannerUI();
    }
    if (state.manualDraft && state.manualDraft.receiptNumber === receiptNumber) {
      startManualDraft();
    }
    reconcileDeliveriesForReceipt(rec, true);
    return { ok: true, receipt: rec };
  }

  function resetDailyReceipts(opts) {
    const o = opts || {};
    const tutScript = o.tutorialScript !== undefined ? o.tutorialScript : null;
    state.tutorialScript = tutScript;
    const prevFilingComplete = state.filingComplete;
    const prevTodayEntry = (state.archiveData.length > 0 && state.archiveData[0].isToday && !state.archiveData[0].placeholder)
      ? state.archiveData[0]
      : null;

    // Carry over previous days' receipts marked CLEAR (VOID stays VOID) since billing clears prior days
    state.processedReceipts = state.processedReceipts.map((r) => Object.assign({}, r, {
      isPreviousDay: true,
      cleared: r.voided ? Boolean(r.cleared) : true
    }));
    startManualDraft();
    state.selectedReceiptNo = null;
    state.pinnedArchiveItems = [];
    state.nightDropPanelOpen = false;
    state.activeNightDropTab = 0;
    state.filingOpen = false;
    state.filingInvoices = [];
    state.filingReceipts = [];
    state.filingComplete = false;
    state.filedReceiptsCount = 0;
    state.filingSelectedSide = null;
    state.filingSelectedIdx = -1;
    state.archiveOpen = false;
    state.archiveSelectedVendorIdx = 0;
    state.printedSlips = [];
    state.printerTraySlips = [];
    state.activeSlipIndex = -1;
    state.printedHudMinimized = false;
    state.terminalRecallCount = '';
    state.terminalLedgerMsg = '';
    closeTrashCanDialog();
    closeHandReceiptDialog();

    generateNightDropInvoices(tutScript);

    const snap = getClock() ? getClock().getTimeSnapshot() : { dateLabel: 'FRI FEB 02, 1996' };
    if (prevTodayEntry && (prevFilingComplete || (Array.isArray(prevTodayEntry.vendors) && prevTodayEntry.vendors.length > 0))) {
      prevTodayEntry.isToday = false;
      prevTodayEntry.isCampaignDay = true;
      prevTodayEntry.dateStr = String(prevTodayEntry.dateStr || '').replace(/\s*\((?:FILED TODAY|TODAY)\)\s*$/i, '').trim() || snap.dateLabel;
    } else if (state.archiveData.length > 0 && state.archiveData[0].isToday && state.archiveData[0].placeholder) {
      state.archiveData.shift();
    }

    state.archiveData.unshift({
      dateStr: snap.dateLabel + ' (TODAY)',
      isToday: true,
      isCampaignDay: true,
      placeholder: true,
      colorHex: '#22c55e',
      vendors: []
    });
    restoreHistoricalArchiveDays();
    if (state.archiveData.length <= 1) {
      generateArchiveData(true);
    }
    state.archiveSelectedDay = 1;
    generateHomeOfficeTasksForShift(tutScript);
    syncArchiveReceiptsToLedger();

    state.scanner.inventoryMenuIdx = 0;
    state.receiptsDeptGroup = '01';
    state.scanner.label = createInitialLabelState();
    state.scanner.inventory = createInitialInventoryState();
    state.scanner.supply = createInitialSupplyState();
    state.scanner.damage = createInitialDamageState();
    if (global.BackstockRacks && typeof global.BackstockRacks.syncInventoryVisuals === 'function') {
      global.BackstockRacks.syncInventoryVisuals(false);
    }
    resetScannerSession();
    renderPrintedReceiptHud();
    notifyDeskStateChanged();
  }

  // =========================================================================
  // DOT-MATRIX RECEIPT PRINTING, HUD STRIP & TRASH / DRIVER HANDOFF
  // =========================================================================

  function syncTutorialBottomDock() {
    if (global.DSDTutorial && typeof global.DSDTutorial.syncBottomDockLayout === 'function') {
      global.DSDTutorial.syncBottomDockLayout();
    }
  }

  function renderPrintedReceiptHud() {
    const hud = document.getElementById('printed-receipt-hud');
    if (!hud) return;

    const slips = state.printedSlips;
    if (!Array.isArray(slips) || slips.length === 0) {
      state.activeSlipIndex = -1;
      hud.style.display = 'none';
      hud.innerHTML = '';
      syncTutorialBottomDock();
      return;
    }

    if (state.activeSlipIndex < 0 || state.activeSlipIndex >= slips.length) {
      state.activeSlipIndex = slips.length - 1;
    }

    hud.style.display = 'flex';
    const slip = slips[state.activeSlipIndex];

    if (state.printedHudMinimized) {
      const printerSvg = (global.SvgIcons && typeof global.SvgIcons.render === 'function')
        ? global.SvgIcons.render('printer')
        : '';
      hud.innerHTML = `
        <button type="button" class="prh-minimized-tab" id="prh-expand-btn" title="Expand Receipt Bar [V]">
          ${printerSvg}
          <span>RECEIPTS (${slips.length}) [V]</span>
          <span>▲</span>
        </button>
      `;
      const expandBtn = document.getElementById('prh-expand-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          playBeep();
          state.printedHudMinimized = false;
          renderPrintedReceiptHud();
        });
      }
      syncTutorialBottomDock();
      return;
    }

    const totalUnits = Number(slip.totalUnits || 0);
    const totalAmtStr = formatMoney(slip.totalAmount || 0);
    const copyLabel = slip.isCopy ? ('COPY #' + (slip.copyNumber || 2)) : 'ORIGINAL';
    const rowsHtml = (slip.items || []).map((it) => {
      const q = Number(it.qty) || 0;
      const p = Number(it.price) || 0;
      const packVal = (slip.type === 'credit' || q < 0) ? 1 : (slip.deptNo === '01' ? 1 : getItemUnitsPerCase(it, 'sidedoor'));
      const ext = formatMoney(q * p);
      return `
        <div class="prh-item-row">
          <span class="prh-item-name">${escapeHtml(String(it.code || ''))} [${packVal}] ${escapeHtml(String(it.name || 'ITEM'))} (${q})</span>
          <span class="prh-item-amt">${escapeHtml(ext)}</span>
        </div>
      `;
    }).join('') || '<div class="prh-item-row"><span>NO LINE ITEMS</span><span>0.00</span></div>';

    hud.innerHTML = `
      <div class="prh-sheet">
        <div class="prh-topbar">
          <div class="prh-pager">
            <button type="button" class="prh-btn" id="prh-prev-btn" title="Previous Receipt [←]" ${slips.length <= 1 ? 'disabled' : ''}>◀</button>
            <span>${state.activeSlipIndex + 1}/${slips.length}</span>
            <button type="button" class="prh-btn" id="prh-next-btn" title="Next Receipt [→]" ${slips.length <= 1 ? 'disabled' : ''}>▶</button>
          </div>
          <span class="prh-copy-badge ${slip.isCopy ? 'is-copy' : ''}">${escapeHtml(copyLabel)}</span>
          <button type="button" class="prh-btn" id="prh-min-btn" title="Toggle Receipt Bar [V]">▼</button>
        </div>

        <div class="prh-store-hdr">
          STORE #0412 · RECEIVING DOCK<br/>
          DSD ${slip.type === 'credit' ? 'CREDIT MEMO' : (slip.type === 'po' ? 'PO RECEIPT' : 'RECEIPT')} PRINT-OUT
        </div>

        <div class="prh-meta">
          <span>RCPT: #${escapeHtml(String(slip.receiptNumber || ''))}</span>
          <span>TIME: ${escapeHtml(String(slip.time || ''))}</span>
          <span>VEND: #${escapeHtml(String(slip.vendorNo || '--'))}</span>
          <span>DEPT: #${escapeHtml(String(slip.deptNo || '--'))}</span>
          <span>${slip.type === 'credit' ? 'CRED' : (slip.type === 'po' ? 'PO' : 'INV')}: #${escapeHtml(String(slip.invoiceNo || '--'))}</span>
          <span>DATE: ${escapeHtml(String(slip.dateStr || '02/01/1996'))}</span>
        </div>

        <div class="prh-items">${rowsHtml}</div>

        <div class="prh-totals">
          <span>UNITS: ${totalUnits}</span>
          <span>TOTAL: ${escapeHtml(totalAmtStr)}</span>
        </div>

        <div class="prh-footer-note">HAND TO VENDOR/DRIVER TO EXIT · TRASH EXTRAS UNDER DESK</div>
      </div>
    `;

    const prevBtn = document.getElementById('prh-prev-btn');
    if (prevBtn && slips.length > 1) {
      prevBtn.addEventListener('click', () => stepPrintedReceiptSlip(-1));
    }
    const nextBtn = document.getElementById('prh-next-btn');
    if (nextBtn && slips.length > 1) {
      nextBtn.addEventListener('click', () => stepPrintedReceiptSlip(1));
    }
    const minBtn = document.getElementById('prh-min-btn');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        playBeep();
        state.printedHudMinimized = true;
        renderPrintedReceiptHud();
      });
    }
    syncTutorialBottomDock();
  }

  function stepPrintedReceiptSlip(delta) {
    const slips = state.printedSlips;
    if (!Array.isArray(slips) || slips.length <= 1) return false;
    const step = Number(delta) < 0 ? -1 : 1;
    state.activeSlipIndex = (state.activeSlipIndex + step + slips.length) % slips.length;
    playBeep();
    renderPrintedReceiptHud();
    return true;
  }

  function isPrintedReceiptHudExpanded() {
    return Boolean(Array.isArray(state.printedSlips) && state.printedSlips.length > 0 && !state.printedHudMinimized);
  }

  function togglePrintedReceiptHud(forceExpand) {
    if (!state.printedSlips || state.printedSlips.length === 0) {
      notify('[[ico:printer]] No printed receipts held. Receipts can be printed from Terminal [2].', 'high');
      playBeep();
      return;
    }
    state.printedHudMinimized = forceExpand === true ? false : !state.printedHudMinimized;
    playBeep();
    renderPrintedReceiptHud();
  }

  function printReceiptSlip(receiptNo, opts) {
    const rec = findReceipt(receiptNo);
    if (!rec) return { ok: false, error: 'Receipt not found.' };
    if (rec.voided) return { ok: false, error: 'Cannot print a VOID receipt.' };
    if (!rec.finalized) return { ok: false, error: 'Finalize receipt before printing.' };

    rec.printCount = (rec.printCount || 0) + 1;
    const isCopy = rec.printCount > 1;
    const itemsCopy = (rec.items || []).map((it) => Object.assign({}, it));
    const totalUnits = itemsCopy.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const snapClock = getClock() ? getClock().getTimeSnapshot() : null;

    const slip = {
      slipId: 'SLP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      receiptNumber: rec.receiptNumber,
      type: rec.type || 'invoice',
      vendorNo: rec.vendorNo,
      deptNo: rec.deptNo,
      invoiceNo: rec.invoiceNo,
      time: rec.time || (snapClock ? snapClock.formatted12h : '6:00 AM'),
      dateStr: formatShortDateFromSnap(snapClock, true),
      deliveryId: rec.deliveryId || null,
      items: itemsCopy,
      totalUnits: totalUnits,
      totalAmount: Number(rec.totalAmount || 0),
      copyNumber: rec.printCount,
      isCopy: isCopy
    };

    const toTray = !(opts && opts.fromTerminal);
    const copyTag = isCopy ? (' (Copy #' + rec.printCount + ')') : '';

    if (toTray) {
      state.printerTraySlips.push(slip);
    } else {
      state.printedSlips.push(slip);
      state.activeSlipIndex = state.printedSlips.length - 1;
      state.printedHudMinimized = false;
    }

    if (
      state.scanner.screen === 'finalized' &&
      state.scanner.finalizedSnapshot &&
      state.scanner.finalizedSnapshot.receiptNumber === rec.receiptNumber
    ) {
      state.scanner.finalizedPrinted = true;
      renderScannerUI();
    }

    if (typeof state.hooks.onReceiptPrinted === 'function') {
      state.hooks.onReceiptPrinted(slip, opts || {});
    }
    notifyDeskStateChanged();
    if (!toTray) {
      renderPrintedReceiptHud();
      notify('[[ico:printer]] Printed Receipt #' + rec.receiptNumber + copyTag + ' on Desk Dot-Matrix Printer.', 3600);
    } else {
      notify('[[ico:printer]] Sent Receipt #' + rec.receiptNumber + copyTag + ' to Desk Printer tray — pick up at desk.', 3600);
    }
    return { ok: true, slip, toTray };
  }

  function collectPrinterTraySlips() {
    if (!state.printerTraySlips || state.printerTraySlips.length === 0) {
      togglePrintedReceiptHud(true);
      return 0;
    }
    const collected = state.printerTraySlips.splice(0, state.printerTraySlips.length);
    collected.forEach((slip) => state.printedSlips.push(slip));
    state.activeSlipIndex = state.printedSlips.length - 1;
    state.printedHudMinimized = false;

    if (typeof state.hooks.onReceiptCollected === 'function') {
      state.hooks.onReceiptCollected(collected);
    }
    renderPrintedReceiptHud();
    notifyDeskStateChanged();

    return collected.length;
  }

  function discardActivePrintedReceipt() {
    if (!state.printedSlips || state.printedSlips.length === 0) {
      playBeep();
      return false;
    }
    const idx = Math.max(0, Math.min(state.activeSlipIndex, state.printedSlips.length - 1));
    const removed = state.printedSlips.splice(idx, 1)[0];
    state.activeSlipIndex = state.printedSlips.length > 0 ? Math.min(idx, state.printedSlips.length - 1) : -1;
    renderPrintedReceiptHud();
    if (typeof state.hooks.onReceiptDiscarded === 'function') state.hooks.onReceiptDiscarded([removed]);
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(null);
    return true;
  }

  function renderTrashCanDialog() {
    const listEl = document.getElementById('trm-list');
    const summaryEl = document.getElementById('trm-summary');
    const toggleAllBtn = document.getElementById('trm-toggle-all-btn');
    const trashSelBtn = document.getElementById('trm-trash-selected-btn');
    if (!listEl) return;

    const slips = state.printedSlips || [];
    if (summaryEl) {
      summaryEl.textContent = 'HELD PRINT-OUTS: ' + slips.length;
    }

    if (slips.length === 0) {
      listEl.innerHTML = '<div style="padding:18px; text-align:center; color:#94a3b8;">You are not holding any printed receipts right now.</div>';
      if (trashSelBtn) {
        trashSelBtn.disabled = true;
        trashSelBtn.textContent = 'DISCARD SELECTED';
      }
      if (toggleAllBtn) toggleAllBtn.textContent = 'SELECT ALL';
      return;
    }

    listEl.innerHTML = slips.map((slip) => {
      const checked = state.selectedTrashSlipIds.has(slip.slipId);
      const copyTag = slip.isCopy ? ('COPY #' + (slip.copyNumber || 2)) : 'ORIGINAL';
      const badgeCls = slip.isCopy ? 'wh' : 'sd';
      const typeTxt = slip.type === 'credit' ? 'CREDIT MEMO' : (slip.type === 'po' ? 'PO RECEIPT' : 'INVOICE RECEIPT');
      const invTag = (slip.type === 'credit' ? 'Cred #' : (slip.type === 'po' ? 'PO #' : 'Inv #')) + String(slip.invoiceNo || '--');
      const totalStr = formatMoney(slip.totalAmount || 0);
      return '<div class="trm-row ' + (checked ? 'selected' : '') + '" data-slip-id="' + escapeHtml(slip.slipId) + '">' +
        '<input type="checkbox" ' + (checked ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#ef4444;cursor:pointer;">' +
        '<span class="dq-door-badge ' + badgeCls + '">' + escapeHtml(copyTag) + '</span>' +
        '<div>' +
        '<div style="font-size:12.5px; font-weight:800; color:#f8fafc;">Receipt #' + escapeHtml(slip.receiptNumber) + ' <span style="color:#94a3b8; font-weight:700;">(' + escapeHtml(typeTxt) + ')</span></div>' +
        '<div style="font-size:11px; color:#94a3b8; margin-top:2px;">Vend #' + escapeHtml(slip.vendorNo || '--') + ' · Dept #' + escapeHtml(slip.deptNo || '--') + ' · ' + escapeHtml(invTag) + ' · ' + escapeHtml(String(slip.time || '')) + '</div>' +
        '<div style="font-size:11px; color:#cbd5e1; margin-top:2px;">' + escapeHtml(String(slip.totalUnits || 0)) + ' units · Total ' + escapeHtml(totalStr) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    listEl.querySelectorAll('.trm-row').forEach((row) => {
      row.addEventListener('click', () => {
        const sid = row.getAttribute('data-slip-id');
        if (!sid) return;
        if (state.selectedTrashSlipIds.has(sid)) {
          state.selectedTrashSlipIds.delete(sid);
        } else {
          state.selectedTrashSlipIds.add(sid);
        }
        playBeep();
        renderTrashCanDialog();
      });
    });

    const selectedCount = slips.filter((s) => state.selectedTrashSlipIds.has(s.slipId)).length;
    if (trashSelBtn) {
      trashSelBtn.disabled = selectedCount === 0;
      trashSelBtn.textContent = selectedCount > 0 ? ('DISCARD SELECTED (' + selectedCount + ')') : 'DISCARD SELECTED';
    }
    if (toggleAllBtn) {
      toggleAllBtn.textContent = (slips.length > 0 && selectedCount === slips.length) ? 'CLEAR ALL' : 'SELECT ALL';
    }
  }

  function openTrashCanDialog() {
    const slips = state.printedSlips || [];
    if (slips.length === 0) {
      playBeep();
      return false;
    }

    state.selectedTrashSlipIds.clear();
    // Pre-select duplicate copies if present, or if only 1 slip is held pre-select it for quick confirmation
    const copies = slips.filter((s) => s.isCopy);
    if (copies.length > 0) {
      copies.forEach((c) => state.selectedTrashSlipIds.add(c.slipId));
    } else if (slips.length === 1) {
      state.selectedTrashSlipIds.add(slips[0].slipId);
    }

    state.trashModalOpen = true;
    const modalEl = document.getElementById('trash-receipt-modal');
    if (modalEl) modalEl.classList.add('active');
    renderTrashCanDialog();
    playBeep();
    if (typeof state.hooks.onPhase2ModalChange === 'function') state.hooks.onPhase2ModalChange();
    return true;
  }

  function closeTrashCanDialog(silent) {
    if (!state.trashModalOpen) return;
    state.trashModalOpen = false;
    const modalEl = document.getElementById('trash-receipt-modal');
    if (modalEl) modalEl.classList.remove('active');
    if (!silent) playBeep();
    if (typeof state.hooks.onPhase2ModalChange === 'function') state.hooks.onPhase2ModalChange();
  }

  function discardSelectedPrintedReceipts() {
    const slips = state.printedSlips || [];
    const discarded = [];
    const kept = [];
    slips.forEach((s) => {
      if (state.selectedTrashSlipIds.has(s.slipId)) {
        discarded.push(s);
      } else {
        kept.push(s);
      }
    });

    if (discarded.length === 0) {
      playBeep();
      return 0;
    }

    state.printedSlips = kept;
    state.activeSlipIndex = kept.length > 0 ? Math.min(Math.max(0, state.activeSlipIndex), kept.length - 1) : -1;
    state.selectedTrashSlipIds.clear();
    closeTrashCanDialog(true);
    renderPrintedReceiptHud();

    if (typeof state.hooks.onReceiptDiscarded === 'function') state.hooks.onReceiptDiscarded(discarded);
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(null);

    return discarded.length;
  }

  function renderHandReceiptDialog() {
    const titleEl = document.getElementById('hrm-title');
    const summaryEl = document.getElementById('hrm-summary');
    const neededBadgeEl = document.getElementById('hrm-needed-badge');
    const warnEl = document.getElementById('hrm-status-warn');
    const listEl = document.getElementById('hrm-list');
    const toggleBtn = document.getElementById('hrm-toggle-matching-btn');
    const giveBtn = document.getElementById('hrm-give-selected-btn');
    if (!listEl) return;

    const d = state.handTargetDelivery;
    const slips = state.printedSlips || [];
    const info = d ? getPendingReceiptHandoffInfo(d) : { required: [], missing: [], heldMatchingCount: 0, complete: true };

    if (titleEl) {
      const fmtHdr = (global.SvgIcons && typeof global.SvgIcons.formatHtml === 'function')
        ? global.SvgIcons.formatHtml
        : escapeHtml;
      titleEl.innerHTML = fmtHdr(
        d
          ? ('[[ico:document]] HAND RECEIPTS TO ' + String(d.driverName || 'DRIVER').toUpperCase())
          : '[[ico:document]] HAND RECEIPTS TO DRIVER'
      );
    }
    if (summaryEl) {
      summaryEl.textContent = d
        ? (String(d.carrier || 'DSD') + ' · HELD SLIPS: ' + slips.length)
        : ('HELD SLIPS: ' + slips.length);
    }
    if (neededBadgeEl) {
      neededBadgeEl.textContent = info.missing.length > 0
        ? ('NEEDED: ' + info.missing.map((rn) => '#' + rn).join(', '))
        : 'ALL RECEIVED ✓';
    }

    if (warnEl) {
      const fmtWarn = (global.SvgIcons && typeof global.SvgIcons.formatHtml === 'function')
        ? global.SvgIcons.formatHtml
        : escapeHtml;
      if (state.handStatusError) {
        warnEl.style.display = 'block';
        warnEl.innerHTML = fmtWarn(state.handStatusError);
      } else if (info.missing.length > 0) {
        warnEl.style.display = 'block';
        warnEl.textContent = 'Driver needs printed receipt(s): ' + info.missing.map((rn) => '#' + rn).join(', ') +
          (slips.length === 0 ? ' — Print/reprint in Terminal [2].' : '');
      } else {
        warnEl.style.display = 'none';
      }
    }

    if (slips.length === 0) {
      const trayCount = (state.printerTraySlips || []).length;
      const trayHint = trayCount > 0
        ? ('<span style="color:#4ade80; font-size:11px;">' + trayCount + ' printed receipt' + (trayCount > 1 ? 's' : '') + ' waiting on Desk Dot-Matrix Printer tray — pick up at desk!</span>')
        : '<span style="color:#fde68a; font-size:11px;">Receipts can be printed or reprinted from Terminal [2].</span>';
      listEl.innerHTML = '<div style="padding:18px; text-align:center; color:#94a3b8;">You are not holding any printed receipt slips right now.<br>' + trayHint + '</div>';
      if (giveBtn) {
        giveBtn.disabled = true;
        giveBtn.textContent = 'HAND SELECTED';
      }
      if (toggleBtn) toggleBtn.disabled = true;
      return;
    }

    if (toggleBtn) toggleBtn.disabled = false;

    listEl.innerHTML = slips.map((slip) => {
      const isNeeded = info.missing.includes(slip.receiptNumber);
      const checked = state.selectedHandSlipIds.has(slip.slipId);
      const badgeCls = isNeeded ? 'wh' : 'trk';
      const badgeTxt = isNeeded ? 'NEEDED ✓' : 'OTHER DOC';
      const copyTag = slip.isCopy ? ('COPY #' + (slip.copyNumber || 2)) : 'ORIGINAL';
      const typeTxt = slip.type === 'credit' ? 'CREDIT' : (slip.type === 'po' ? 'PO' : 'INVOICE');
      const invTag = (slip.type === 'credit' ? 'Cred #' : (slip.type === 'po' ? 'PO #' : 'Inv #')) + String(slip.invoiceNo || '--');
      const totalStr = formatMoney(slip.totalAmount || 0);
      return '<div class="hrm-row ' + (checked ? 'selected ' : '') + (isNeeded ? '' : 'is-other') + '" data-hand-slip-id="' + escapeHtml(slip.slipId) + '">' +
        '<input type="checkbox" ' + (checked ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:#22c55e;cursor:pointer;">' +
        '<span class="dq-door-badge ' + badgeCls + '">' + escapeHtml(badgeTxt) + '</span>' +
        '<div>' +
        '<div style="font-size:12.5px; font-weight:800; color:#f8fafc;">Receipt #' + escapeHtml(slip.receiptNumber) + ' <span style="color:#94a3b8; font-weight:700;">(' + escapeHtml(typeTxt) + ' · ' + escapeHtml(copyTag) + ')</span></div>' +
        '<div style="font-size:11px; color:#94a3b8; margin-top:2px;">Vend #' + escapeHtml(slip.vendorNo || '--') + ' · Dept #' + escapeHtml(slip.deptNo || '--') + ' · ' + escapeHtml(invTag) + ' · ' + escapeHtml(String(slip.time || '')) + '</div>' +
        '<div style="font-size:11px; color:#cbd5e1; margin-top:2px;">' + escapeHtml(String(slip.totalUnits || 0)) + ' units · Total ' + escapeHtml(totalStr) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    listEl.querySelectorAll('.hrm-row').forEach((row) => {
      row.addEventListener('click', () => {
        const sid = row.getAttribute('data-hand-slip-id');
        if (!sid) return;
        state.handStatusError = '';
        if (state.selectedHandSlipIds.has(sid)) {
          state.selectedHandSlipIds.delete(sid);
        } else {
          state.selectedHandSlipIds.add(sid);
        }
        playBeep();
        renderHandReceiptDialog();
      });
    });

    const selectedCount = slips.filter((s) => state.selectedHandSlipIds.has(s.slipId)).length;
    if (giveBtn) {
      giveBtn.disabled = selectedCount === 0;
      giveBtn.textContent = selectedCount > 0 ? ('HAND SELECTED (' + selectedCount + ')') : 'HAND SELECTED';
    }
    if (toggleBtn) {
      const matchingSlips = slips.filter((s) => info.missing.includes(s.receiptNumber));
      const allNeededSelected = matchingSlips.length > 0 && info.missing.every((rn) =>
        slips.some((s) => s.receiptNumber === rn && state.selectedHandSlipIds.has(s.slipId))
      );
      toggleBtn.textContent = allNeededSelected ? 'CLEAR SELECTION' : 'SELECT NEEDED';
    }
  }

  function selectNeededHandSlips(d, info) {
    state.selectedHandSlipIds.clear();
    const slips = state.printedSlips || [];
    info.missing.forEach((rn) => {
      // Pick one slip per needed receipt number (prefer original if available)
      const orig = slips.find((s) => s.receiptNumber === rn && !s.isCopy);
      const any = orig || slips.find((s) => s.receiptNumber === rn);
      if (any) state.selectedHandSlipIds.add(any.slipId);
    });
  }

  function openHandReceiptDialog(d, opts) {
    if (!d) return false;
    state.handTargetDelivery = d;
    state.handOnComplete = (opts && typeof opts.onComplete === 'function') ? opts.onComplete : null;
    state.handStatusError = '';

    const info = getPendingReceiptHandoffInfo(d);
    selectNeededHandSlips(d, info);

    state.handModalOpen = true;
    const modalEl = document.getElementById('hand-receipt-modal');
    if (modalEl) modalEl.classList.add('active');
    renderHandReceiptDialog();
    playBeep();
    if (typeof state.hooks.onPhase2ModalChange === 'function') state.hooks.onPhase2ModalChange();
    return true;
  }

  function closeHandReceiptDialog(silent) {
    if (!state.handModalOpen) return;
    state.handModalOpen = false;
    state.handTargetDelivery = null;
    state.handOnComplete = null;
    state.handStatusError = '';
    const modalEl = document.getElementById('hand-receipt-modal');
    if (modalEl) modalEl.classList.remove('active');
    if (!silent) playBeep();
    if (typeof state.hooks.onPhase2ModalChange === 'function') state.hooks.onPhase2ModalChange();
  }

  function confirmHandSelectedReceipts() {
    const d = state.handTargetDelivery;
    if (!d) return;

    const slips = state.printedSlips || [];
    const chosen = slips.filter((s) => state.selectedHandSlipIds.has(s.slipId));
    if (chosen.length === 0) {
      playBeep();
      return;
    }

    const req = getRequiredReceiptNumbersForDelivery(d);
    d.receiptsHanded = d.receiptsHanded || {};
    const missingSet = new Set(req.filter((rn) => !d.receiptsHanded[rn]));

    const wrongSlip = chosen.find((s) => !missingSet.has(s.receiptNumber));
    if (wrongSlip) {
      playError();
      state.handStatusError = '[[ico:claim]] Receipt #' + wrongSlip.receiptNumber + ' does not match what ' + (d.driverName || 'this driver') + ' still needs!';
      renderHandReceiptDialog();
      return;
    }

    // Prevent accidentally handing duplicate copies of the exact same receipt number at once
    const seenNos = new Set();
    const dupSlip = chosen.find((s) => {
      if (seenNos.has(s.receiptNumber)) return true;
      seenNos.add(s.receiptNumber);
      return false;
    });
    if (dupSlip) {
      playError();
      state.handStatusError = '[[ico:claim]] Select only 1 slip for #' + dupSlip.receiptNumber + ' (discard extra copies in the Trash Can under the desk).';
      renderHandReceiptDialog();
      return;
    }

    // Remove handed slips and mark handed on delivery
    const handedIds = new Set(chosen.map((s) => s.slipId));
    chosen.forEach((s) => {
      d.receiptsHanded[s.receiptNumber] = true;
    });
    state.printedSlips = slips.filter((s) => !handedIds.has(s.slipId));
    state.activeSlipIndex = state.printedSlips.length > 0
      ? Math.min(Math.max(0, state.activeSlipIndex), state.printedSlips.length - 1)
      : -1;

    const remaining = req.filter((rn) => !d.receiptsHanded[rn]);
    const res = {
      handedCount: chosen.length,
      missing: remaining,
      complete: remaining.length === 0
    };

    const cb = state.handOnComplete;
    state.selectedHandSlipIds.clear();
    closeHandReceiptDialog(true);
    renderPrintedReceiptHud();

    if (typeof state.hooks.onReceiptHanded === 'function') state.hooks.onReceiptHanded(res);
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    if (typeof cb === 'function') cb(res);
  }

  function getRequiredReceiptNumbersForDelivery(d) {
    if (!d || d.type === 'warehouse' || d.refused) return [];
    reconcileDeliveryDocStates(d);
    const req = [];
    const pushUnique = (rn) => {
      if (!rn) return;
      const rec = findReceipt(rn);
      if (rec && rec.finalized && !rec.voided && !req.includes(rn)) {
        req.push(rn);
      }
    };
    if (d.docStates && d.docStates.invoiceCreated && d.lastReceiptNumber) {
      pushUnique(d.lastReceiptNumber);
    }
    if (d.docStates && d.docStates.creditRequired && d.docStates.creditCreated && d.lastCreditReceiptNumber) {
      pushUnique(d.lastCreditReceiptNumber);
    }
    return req;
  }

  function areAllRequiredReceiptsHanded(d) {
    if (!d || d.type === 'warehouse' || d.refused) return true;
    const req = getRequiredReceiptNumbersForDelivery(d);
    if (req.length === 0) return true;
    const handedMap = d.receiptsHanded || {};
    return req.every((rn) => Boolean(handedMap[rn]));
  }

  function getPendingReceiptHandoffInfo(d) {
    if (!d || d.type === 'warehouse' || d.refused) {
      return { required: [], missing: [], heldMatchingCount: 0, complete: true };
    }
    const req = getRequiredReceiptNumbersForDelivery(d);
    const handedMap = d.receiptsHanded || {};
    const missing = req.filter((rn) => !handedMap[rn]);
    const heldMatchingCount = missing.filter((rn) => state.printedSlips.some((s) => s.receiptNumber === rn)).length;
    return {
      required: req,
      missing: missing,
      heldMatchingCount: heldMatchingCount,
      complete: missing.length === 0
    };
  }

  function handPrintedReceiptsToDelivery(d) {
    if (!d || d.type === 'warehouse' || d.refused) {
      return { handedCount: 0, missing: [], complete: true };
    }
    d.receiptsHanded = d.receiptsHanded || {};
    const req = getRequiredReceiptNumbersForDelivery(d);
    let handedCount = 0;

    req.forEach((rn) => {
      if (d.receiptsHanded[rn]) return;
      const idx = state.printedSlips.findIndex((s) => s.receiptNumber === rn);
      if (idx !== -1) {
        state.printedSlips.splice(idx, 1);
        d.receiptsHanded[rn] = true;
        handedCount += 1;
      }
    });

    if (handedCount > 0) {
      state.activeSlipIndex = state.printedSlips.length > 0
        ? Math.min(Math.max(0, state.activeSlipIndex), state.printedSlips.length - 1)
        : -1;
      renderPrintedReceiptHud();
    }

    const missing = req.filter((rn) => !d.receiptsHanded[rn]);
    return {
      handedCount: handedCount,
      missing: missing,
      complete: missing.length === 0
    };
  }


  // =========================================================================
  // PUBLIC API
  // =========================================================================

  function deepCloneData(val) {
    if (val === undefined) return undefined;
    if (val === null || typeof val !== 'object') return val;
    if (global.SaveSystem && typeof global.SaveSystem.cloneCleanData === 'function') {
      return global.SaveSystem.cloneCleanData(val);
    }
    return JSON.parse(JSON.stringify(val));
  }

  function exportState() {
    const archiveFebDays = (state.archiveData || [])
      .filter(isCampaignArchiveDay)
      .map((day) => deepCloneData(day));

    return {
      processedReceipts: deepCloneData(state.processedReceipts || []),
      currentScreen: state.currentScreen || 'menu',
      selectedReceiptNo: state.selectedReceiptNo || null,
      selectedDeptNo: state.selectedDeptNo || null,
      selectedVendorNo: state.selectedVendorNo || null,
      supplierQuery: state.supplierQuery || '',
      supplierTreeLevel: state.supplierTreeLevel || 'depts',
      manualDraft: state.manualDraft ? deepCloneData(state.manualDraft) : null,
      terminalActiveField: state.terminalActiveField || 'vendorNo',
      terminalAlphaMode: Boolean(state.terminalAlphaMode),
      terminalPage: deepCloneData(state.terminalPage || {}),
      nightDropInvoices: deepCloneData(state.nightDropInvoices || []),
      resolvedNightDrops: deepCloneData(state.resolvedNightDrops || []),
      pinnedArchiveItems: deepCloneData(state.pinnedArchiveItems || []),
      activeNightDropTab: Number(state.activeNightDropTab) || 0,
      filingInvoices: deepCloneData(state.filingInvoices || []),
      filingReceipts: deepCloneData(state.filingReceipts || []),
      filingComplete: Boolean(state.filingComplete),
      filedReceiptsCount: Number(state.filedReceiptsCount) || 0,
      archiveFebDays: archiveFebDays,
      archiveSelectedDay: Number(state.archiveSelectedDay) || 1,
      archiveSelectedVendorIdx: Number(state.archiveSelectedVendorIdx) || 0,
      scanner: deepCloneData(state.scanner),
      printedSlips: deepCloneData(state.printedSlips || []),
      printerTraySlips: deepCloneData(state.printerTraySlips || []),
      activeSlipIndex: Number.isFinite(Number(state.activeSlipIndex)) ? Number(state.activeSlipIndex) : -1,
      printedHudMinimized: Boolean(state.printedHudMinimized),
      terminalRecallCount: String(state.terminalRecallCount || ''),
      terminalLedgerMsg: String(state.terminalLedgerMsg || ''),
      homeOfficeTasks: deepCloneData(state.homeOfficeTasks || [])
    };
  }

  function importState(data) {
    if (!data || typeof data !== 'object') return false;
    state.restoredFromSave = true;

    state.processedReceipts = Array.isArray(data.processedReceipts)
      ? deepCloneData(data.processedReceipts).map((r) => {
        if (!r || typeof r !== 'object') return r;
        r.type = resolveReceiptDocType(r.vendorNo, r.items, r.type);
        return r;
      })
      : [];
    state.currentScreen = data.currentScreen || 'menu';
    state.selectedReceiptNo = data.selectedReceiptNo || null;
    state.selectedDeptNo = data.selectedDeptNo || null;
    state.selectedVendorNo = data.selectedVendorNo || null;
    state.supplierQuery = data.supplierQuery || '';
    state.supplierTreeLevel = data.supplierTreeLevel || 'depts';
    state.manualDraft = data.manualDraft ? deepCloneData(data.manualDraft) : null;
    state.terminalActiveField = data.terminalActiveField || 'vendorNo';
    state.terminalAlphaMode = data.terminalAlphaMode !== undefined ? Boolean(data.terminalAlphaMode) : true;
    state.terminalOpen = false;
    state.terminalEditFields = null;
    state.terminalSupplierKeypadOpen = false;
    if (data.terminalPage && typeof data.terminalPage === 'object') {
      state.terminalPage = Object.assign({
        create: 0, createInitial: 0, receipts: 0, receiptDetail: 0, schedule: 0, tasks: 0,
        suppliersSearch: 0, suppliersDepts: 0, suppliersVendors: 0, suppliersItems: 0
      }, deepCloneData(data.terminalPage));
    }

    state.nightDropInvoices = Array.isArray(data.nightDropInvoices) ? deepCloneData(data.nightDropInvoices) : [];
    state.resolvedNightDrops = Array.isArray(data.resolvedNightDrops) ? deepCloneData(data.resolvedNightDrops) : [];
    state.pinnedArchiveItems = Array.isArray(data.pinnedArchiveItems) ? deepCloneData(data.pinnedArchiveItems) : [];
    state.nightDropPanelOpen = false;
    state.activeNightDropTab = Number(data.activeNightDropTab) || 0;

    state.filingOpen = false;
    state.filingInvoices = Array.isArray(data.filingInvoices) ? deepCloneData(data.filingInvoices) : [];
    state.filingReceipts = Array.isArray(data.filingReceipts) ? deepCloneData(data.filingReceipts) : [];
    state.filingComplete = Boolean(data.filingComplete);
    state.filedReceiptsCount = Number(data.filedReceiptsCount) || 0;
    state.filingSelectedSide = null;
    state.filingSelectedIdx = -1;

    state.archiveOpen = false;
    state.archiveSelectedDay = Number(data.archiveSelectedDay) || 1;
    state.archiveSelectedVendorIdx = Number(data.archiveSelectedVendorIdx) || 0;
    const savedFebDays = Array.isArray(data.archiveFebDays) ? deepCloneData(data.archiveFebDays) : [];
    if (savedFebDays.length > 0) {
      state.archiveData = savedFebDays;
      restoreHistoricalArchiveDays();
      if (!state.staticArchiveHistory) {
        loadArchiveHistory().then(() => {
          restoreHistoricalArchiveDays();
        });
      }
    } else {
      state.archiveData = [];
      generateArchiveData(true);
    }

    const baseDamage = createInitialDamageState();
    const baseSupply = createInitialSupplyState();
    const baseLabel = createInitialLabelState();
    const baseInv = createInitialInventoryState();
    const sc = (data.scanner && typeof data.scanner === 'object') ? deepCloneData(data.scanner) : {};
    state.scanner = Object.assign({}, {
      screen: 'home',
      phase: 'home',
      homeSelectedIdx: 0,
      inventoryMenuIdx: 0,
      activeReceiptNo: null,
      standaloneMode: false,
      activeField: 'deptNo',
      headers: { vendorNo: '', deptNo: '', invoiceNo: '' },
      expectedUnitsStr: '',
      expectedCostCents: '',
      expectedNegative: false,
      expectedUnits: 0,
      expectedCost: 0,
      productCode: '',
      quantity: '',
      pendingBoxId: null,
      negativeMode: false,
      currentDocType: 'invoice',
      scannedItems: [],
      scannedCredits: [],
      listScroll: 0,
      resumeScroll: 0,
      resumeSelectedIdx: 0,
      finalizedSnapshot: null,
      statusMessage: '',
      statusKind: 'info',
      lastScannedLabel: '',
      finalizedPrinted: false
    }, sc, {
      supply: Object.assign({}, baseSupply, sc.supply || {}),
      damage: Object.assign({}, baseDamage, sc.damage || {}),
      label: Object.assign({}, baseLabel, sc.label || {}),
      inventory: Object.assign({}, baseInv, sc.inventory || {})
    });

    state.printedSlips = Array.isArray(data.printedSlips) ? deepCloneData(data.printedSlips) : [];
    state.printerTraySlips = Array.isArray(data.printerTraySlips) ? deepCloneData(data.printerTraySlips) : [];
    state.activeSlipIndex = Number.isFinite(Number(data.activeSlipIndex)) ? Number(data.activeSlipIndex) : (state.printedSlips.length > 0 ? state.printedSlips.length - 1 : -1);
    state.printedHudMinimized = Boolean(data.printedHudMinimized);

    state.trashModalOpen = false;
    state.selectedTrashSlipIds = new Set();
    state.handModalOpen = false;
    state.handTargetDelivery = null;
    state.handOnComplete = null;
    state.handStatusError = '';
    state.selectedHandSlipIds = new Set();

    state.terminalRecallCount = String(data.terminalRecallCount || '');
    state.terminalLedgerMsg = String(data.terminalLedgerMsg || '');
    state.homeOfficeTasks = Array.isArray(data.homeOfficeTasks) ? deepCloneData(data.homeOfficeTasks) : [];

    if (global.BackstockRacks && typeof global.BackstockRacks.syncInventoryVisuals === 'function') {
      global.BackstockRacks.syncInventoryVisuals(Boolean(state.scanner.inventory && state.scanner.inventory.finalized));
    }
    if (typeof document !== 'undefined' && document.getElementById('printed-receipt-hud')) {
      renderPrintedReceiptHud();
    }
    notifyDeskStateChanged();
    return true;
  }


  bridge.core = {
    getCatalog,
    getClock,
    getWorkdayIndex,
    getStats,
    playBeep,
    playLabel,
    playError,
    playSuccess,
    playPaper,
    notify,
    alertMsg,
    escapeHtml,
    padDigits,
    formatMoney,
    formatIsoDateString,
    formatShortDateFromSnap,
    getCreditInvoiceNo,
    getItemUnitsPerCase,
    enrichDelivery,
    enrichAllDeliveries,
    getActiveDeliveryEnriched,
    isDeliveryCheckInReady,
    collectInsideDeliveryCandidates,
    getDeliveryById,
    findMatchingInsideDeliveryByHeaders,
    createInitialDamageState,
    createInitialSupplyState,
    createInitialLabelState,
    createInitialInventoryState,
    resolveReceiptDocType,
    createReceipt,
    validateAndCreateBlankReceipt,
    isPreviousDayReceipt,
    getReceiptStatus,
    getInitialReceipts,
    resumeReceiptInTerminal,
    resumeReceiptInScanner,
    syncReceiptItems,
    isReceiptForDelivery,
    getCommittedInvoiceQtyForCode,
    getCommittedCreditQtyForCode,
    reconcileDeliveryDocStates,
    reconcileDeliveryBoxesFromReceipts,
    syncBoxListForCode,
    syncScannedBoxesForCode,
    syncCreditBoxesForCode,
    getPendingCounterpartTab,
    syncActiveDeliveryLinkForReceipt,
    getReceipts,
    findReceipt,
    updateReceiptHeader,
    reconcileDeliveriesForReceipt,
    dNoSafe,
    voidReceipt,
    resetDailyReceipts,
    renderPrintedReceiptHud,
    togglePrintedReceiptHud,
    stepPrintedReceiptSlip,
    isPrintedReceiptHudExpanded,
    printReceiptSlip,
    collectPrinterTraySlips,
    discardActivePrintedReceipt,
    openTrashCanDialog,
    closeTrashCanDialog,
    openHandReceiptDialog,
    closeHandReceiptDialog,
    getRequiredReceiptNumbersForDelivery,
    areAllRequiredReceiptsHanded,
    getPendingReceiptHandoffInfo,
    handPrintedReceiptsToDelivery,
    deepCloneData,
    exportState,
    importState
  };

  global.DSDReceipts = {
    init(hooks) {
      state.restoredFromSave = false;
      const tutScript = (hooks && hooks.tutorialScript !== undefined) ? hooks.tutorialScript : null;
      state.tutorialScript = tutScript;
      const isFreshReset = Boolean(hooks && hooks.preserveNone === false);
      if (isFreshReset) {
        state.processedReceipts = [];
        state.homeOfficeTasks = [];
        state.archiveData = [];
        state.selectedReceiptNo = null;
        state.receiptsDeptGroup = '01';
        state.resolvedNightDrops = [];
        state.pinnedArchiveItems = [];
        state.nightDropPanelOpen = false;
        state.activeNightDropTab = 0;
        state.filingOpen = false;
        state.filingInvoices = [];
        state.filingReceipts = [];
        state.filingComplete = false;
        state.filedReceiptsCount = 0;
        state.filingSelectedSide = null;
        state.filingSelectedIdx = -1;
        state.archiveOpen = false;
        state.archiveSelectedDay = 1;
        state.archiveSelectedVendorIdx = 0;
        state.printedSlips = [];
        state.printerTraySlips = [];
        state.activeSlipIndex = -1;
        state.printedHudMinimized = false;
        state.terminalRecallCount = '';
        state.terminalLedgerMsg = '';
        closeTrashCanDialog();
        closeHandReceiptDialog();
        startManualDraft();
        state.scanner.inventoryMenuIdx = 0;
        state.scanner.label = createInitialLabelState();
        state.scanner.inventory = createInitialInventoryState();
        state.scanner.supply = createInitialSupplyState();
        state.scanner.damage = createInitialDamageState();
        resetScannerSession();
        renderPrintedReceiptHud();
      }
      Object.assign(state.hooks, hooks || {});
      enrichAllDeliveries();
      generateNightDropInvoices(tutScript);
      if (!state.staticArchiveHistory) {
        const archiveHistPromise = loadArchiveHistory();
        if (archiveHistPromise && typeof archiveHistPromise.then === 'function') {
          archiveHistPromise.then(() => {
            if (state.restoredFromSave) {
              restoreHistoricalArchiveDays();
            } else {
              generateArchiveData(true);
              generateHomeOfficeTasksForShift(state.tutorialScript);
              syncArchiveReceiptsToLedger();
            }
          });
        }
      }
      generateArchiveData(isFreshReset);
      generateHomeOfficeTasksForShift(tutScript);
      syncArchiveReceiptsToLedger();
      notifyDeskStateChanged();

      // Terminal / Night Drop / Filing / Archive DOM bindings live in dsd-terminal.js
      bindTerminalEvents();

      const trmCloseBtn = document.getElementById('trm-close-btn');
      if (trmCloseBtn && !trmCloseBtn._dsdBound) {
        trmCloseBtn._dsdBound = true;
        trmCloseBtn.addEventListener('click', () => {
          closeTrashCanDialog();
        });
      }
      const trmToggleAllBtn = document.getElementById('trm-toggle-all-btn');
      if (trmToggleAllBtn && !trmToggleAllBtn._dsdBound) {
        trmToggleAllBtn._dsdBound = true;
        trmToggleAllBtn.addEventListener('click', () => {
          const slips = state.printedSlips || [];
          const allSelected = slips.length > 0 && slips.every((s) => state.selectedTrashSlipIds.has(s.slipId));
          state.selectedTrashSlipIds.clear();
          if (!allSelected) {
            slips.forEach((s) => state.selectedTrashSlipIds.add(s.slipId));
          }
          playBeep();
          renderTrashCanDialog();
        });
      }
      const trmTrashSelBtn = document.getElementById('trm-trash-selected-btn');
      if (trmTrashSelBtn && !trmTrashSelBtn._dsdBound) {
        trmTrashSelBtn._dsdBound = true;
        trmTrashSelBtn.addEventListener('click', () => {
          discardSelectedPrintedReceipts();
        });
      }

      const hrmCloseBtn = document.getElementById('hrm-close-btn');
      if (hrmCloseBtn && !hrmCloseBtn._dsdBound) {
        hrmCloseBtn._dsdBound = true;
        hrmCloseBtn.addEventListener('click', () => {
          closeHandReceiptDialog();
        });
      }
      const hrmToggleBtn = document.getElementById('hrm-toggle-matching-btn');
      if (hrmToggleBtn && !hrmToggleBtn._dsdBound) {
        hrmToggleBtn._dsdBound = true;
        hrmToggleBtn.addEventListener('click', () => {
          const d = state.handTargetDelivery;
          const slips = state.printedSlips || [];
          const info = d ? getPendingReceiptHandoffInfo(d) : { missing: [] };
          const allNeededSelected = info.missing.length > 0 && info.missing.every((rn) =>
            slips.some((s) => s.receiptNumber === rn && state.selectedHandSlipIds.has(s.slipId))
          );
          state.handStatusError = '';
          if (allNeededSelected) {
            state.selectedHandSlipIds.clear();
          } else {
            selectNeededHandSlips(d, info);
          }
          playBeep();
          renderHandReceiptDialog();
        });
      }
      const hrmGiveBtn = document.getElementById('hrm-give-selected-btn');
      if (hrmGiveBtn && !hrmGiveBtn._dsdBound) {
        hrmGiveBtn._dsdBound = true;
        hrmGiveBtn.addEventListener('click', () => {
          confirmHandSelectedReceipts();
        });
      }

    },

    enrichDelivery,
    enrichAllDeliveries,
    resetDailyReceipts,
    exportState,
    importState,
    getReceipts,
    getReceiptStatus,
    getInitialReceipts,
    resumeReceiptInTerminal,
    findReceipt,
    createReceipt,
    updateReceiptHeader,
    voidReceipt,

    // Printed Receipt Slips & Handoff API
    printReceiptSlip,
    collectPrinterTraySlips,
    renderPrintedReceiptHud,
    togglePrintedReceiptHud,
    stepPrintedReceiptSlip,
    isPrintedReceiptHudExpanded,
    openTrashCanDialog,
    closeTrashCanDialog,
    openHandReceiptDialog,
    closeHandReceiptDialog,
    discardActivePrintedReceipt,
    getPrinterTrayCount() {
      return Array.isArray(state.printerTraySlips) ? state.printerTraySlips.length : 0;
    },
    getPrintedSlipsCount() {
      return Array.isArray(state.printedSlips) ? state.printedSlips.length : 0;
    },
    hasPrintedSlips() {
      return Boolean(Array.isArray(state.printedSlips) && state.printedSlips.length > 0);
    },
    getRequiredReceiptNumbersForDelivery,
    areAllRequiredReceiptsHanded,
    getPendingReceiptHandoffInfo,
    handPrintedReceiptsToDelivery,
    formatShortDateFromSnap
  };

  Object.defineProperty(global.DSDReceipts, '_internal', {
    value: bridge,
    enumerable: false,
    configurable: false,
    writable: false
  });
})(window);
