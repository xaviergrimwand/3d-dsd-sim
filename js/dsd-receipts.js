(function (global) {
  'use strict';

  /**
   * DSDReceipts - Phase 1: Authentic Receipt Creation (Hand Scanner & CRT Terminal)
   *
   * Implements:
   * - processedReceipts store with DD-SSSS numbering via ShiftStats
   * - Delivery DSD enrichment (vendorNo, deptNo, 6-digit invoiceNo, items, credits, PLU/barcode physical boxes, temp/discrepancy)
   * - 2-phase Hand Scanner state machine (Phase A: Headers -> Phase B: Scanning, PLU-only blocking, NEG credits, ERR shortage/overage, TEMP probe, REFUSE)
   * - 5-screen CRT Workstation Terminal (Main Menu, Create Receipt, View/Edit/Void Receipts, Schedule & Manifest, Home Office Tasks Stub, Suppliers & PLU Directory)
   */

  const state = {
    processedReceipts: [],
    currentScreen: 'menu', // 'menu' | 'create' | 'receipts' | 'receipt-detail' | 'schedule' | 'tasks' | 'suppliers'
    selectedReceiptNo: null,
    selectedDeptNo: null,
    selectedVendorNo: null,
    supplierQuery: '',
    manualDraft: null,
    terminalOpen: false,
    terminalActiveField: 'vendorNo', // create: 'vendorNo'|'deptNo'|'invoiceNo'|'productCode'|'quantity'; detail: 'vendorNo'|'deptNo'|'invoiceNo'; suppliers: 'search'
    terminalEditFields: null,
    terminalSupplierKeypadOpen: false,
    terminalAlphaMode: true,
    supplierTreeLevel: 'depts', // 'depts' | 'vendors' | 'items'
    terminalPage: {
      create: 0,
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
      onOpenScanner: null,
      onCloseScanner: null,
      onDeskStateChanged: null,
      onPhase2ModalChange: null,
      playBeep: null,
      playError: null,
      playSuccess: null,
      playPaper: null,
      showNotification: null,
      showAlert: null,
      renderScannerFallback: null
    }
  };

  function getCatalog() {
    return global.DSDCatalog || null;
  }

  function getClock() {
    return global.ShiftClock || null;
  }

  function getStats() {
    return global.ShiftStats || null;
  }

  function playBeep() {
    if (typeof state.hooks.playBeep === 'function') state.hooks.playBeep();
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

  function notify(msg, duration) {
    if (typeof state.hooks.showNotification === 'function') {
      state.hooks.showNotification(msg, duration || 3200);
    }
  }

  function alertMsg(msg) {
    if (typeof state.hooks.showAlert === 'function') {
      state.hooks.showAlert(msg);
    } else if (global.alert) {
      global.alert(msg);
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

  function formatShortDateFromSnap(snap, useFullYear) {
    const s = snap || (getClock() ? getClock().getTimeSnapshot() : null);
    if (!s) return useFullYear ? '02/01/1996' : '02/01/96';
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

  // =========================================================================
  // DELIVERY DSD ENRICHMENT
  // =========================================================================

  /**
   * Ensures a delivery manifest record has valid DSDCatalog vendor/dept/products,
   * 6-digit invoiceNo, physicalBoxes array, and temp/discrepancy flags.
   */
  function enrichDelivery(delivery) {
    if (!delivery) return null;
    if (delivery._dsdEnriched) return delivery;

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

  function createReceipt(params) {
    const stats = getStats();
    const clock = getClock();
    const snap = clock ? clock.getTimeSnapshot() : { dateLabel: 'FEB 1, 1996', formatted12h: '6:00 AM' };

    const deptNo = padDigits(params.deptNo, 2);
    const vendorNo = padDigits(params.vendorNo, 3);
    const invoiceNo = padDigits(params.invoiceNo, 6);
    const receiptNumber = stats
      ? stats.generateReceiptNumber(deptNo, state.processedReceipts)
      : (deptNo + '-' + String(state.processedReceipts.length + 1).padStart(4, '0'));

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

    // A credit receipt is simply any receipt whose line items all have negative quantities
    const isCreditReceipt = items.length > 0 && items.every((it) => it.qty < 0);
    const totalAmount = items.reduce((sum, it) => sum + (it.qty * it.price), 0);
    const receipt = {
      receiptNumber: receiptNumber,
      date: snap.dateLabel,
      time: snap.formatted12h,
      vendorNo: vendorNo,
      deptNo: deptNo,
      invoiceNo: invoiceNo,
      expectedUnits: params.expectedUnits !== undefined && params.expectedUnits !== null ? Number(params.expectedUnits) : null,
      expectedCost: params.expectedCost !== undefined && params.expectedCost !== null ? Number(params.expectedCost) : null,
      type: isCreditReceipt ? 'credit' : 'invoice',
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
    const matchesDelivery = Boolean(
      activeDelivery &&
      (rec.deliveryId === activeDelivery.id ||
        (rec.deptNo === activeDelivery.deptNo &&
          rec.vendorNo === activeDelivery.vendorNo &&
          (rec.invoiceNo === activeDelivery.invoiceNo || rec.invoiceNo === getCreditInvoiceNo(activeDelivery))))
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

    if (matchesDelivery && activeDelivery) {
      const isCreditDoc = sc.negativeMode ||
        rec.type === 'credit' ||
        (activeDelivery.docStates && activeDelivery.docStates.creditRequired && sc.headers.invoiceNo === getCreditInvoiceNo(activeDelivery));
      if (isCreditDoc) {
        sc.scannedItems.forEach((it) => {
          const committedCreditOther = getCommittedCreditQtyForCode(activeDelivery, it.code, rec.receiptNumber);
          syncCreditBoxesForCode(activeDelivery, it.code, committedCreditOther + Math.abs(Number(it.qty) || 0));
        });
      } else {
        sc.scannedItems.forEach((it) => {
          const committedOther = getCommittedInvoiceQtyForCode(activeDelivery, it.code, rec.receiptNumber);
          syncScannedBoxesForCode(activeDelivery, it.code, committedOther + Math.max(0, Number(it.qty) || 0));
        });
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

    const isCreditReceipt = rec.items.length > 0 && rec.items.every((it) => it.qty < 0);
    const totalAmount = rec.items.reduce((sum, it) => sum + (it.qty * it.price), 0);
    rec.type = isCreditReceipt ? 'credit' : 'invoice';
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
    return { ok: true, receipt: rec };
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
    return { ok: true, receipt: rec };
  }

  function resetDailyReceipts() {
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

    generateNightDropInvoices();

    if (prevFilingComplete && prevTodayEntry) {
      // Unshift a fresh Today placeholder while preserving completed shift folders & restoring clean historical January folders
      const snap = getClock() ? getClock().getTimeSnapshot() : { dateLabel: 'FEB 2, 1996' };
      prevTodayEntry.isToday = false;
      restoreHistoricalArchiveDays();
      state.archiveData.unshift({
        dateStr: snap.dateLabel + ' (TODAY)',
        isToday: true,
        placeholder: true,
        colorHex: '#22c55e',
        vendors: []
      });
      if (state.archiveData.length > 32) {
        state.archiveData.length = 32;
      }
      state.archiveSelectedDay = 1;
    } else {
      state.archiveSelectedDay = 1;
      generateArchiveData(true);
    }
    generateHomeOfficeTasksForShift();

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

  function renderPrintedReceiptHud() {
    const hud = document.getElementById('printed-receipt-hud');
    if (!hud) return;

    const slips = state.printedSlips;
    if (!Array.isArray(slips) || slips.length === 0) {
      state.activeSlipIndex = -1;
      hud.style.display = 'none';
      hud.innerHTML = '';
      return;
    }

    if (state.activeSlipIndex < 0 || state.activeSlipIndex >= slips.length) {
      state.activeSlipIndex = slips.length - 1;
    }

    hud.style.display = 'flex';
    const slip = slips[state.activeSlipIndex];

    if (state.printedHudMinimized) {
      hud.innerHTML = `
        <button type="button" class="prh-minimized-tab" id="prh-expand-btn">
          <span>🖨️</span>
          <span>RECEIPTS (${slips.length})</span>
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
            <button type="button" class="prh-btn" id="prh-prev-btn" ${slips.length <= 1 ? 'disabled' : ''}>◀</button>
            <span>${state.activeSlipIndex + 1}/${slips.length}</span>
            <button type="button" class="prh-btn" id="prh-next-btn" ${slips.length <= 1 ? 'disabled' : ''}>▶</button>
          </div>
          <span class="prh-copy-badge ${slip.isCopy ? 'is-copy' : ''}">${escapeHtml(copyLabel)}</span>
          <button type="button" class="prh-btn" id="prh-min-btn" title="Tuck Receipt Bar">▼</button>
        </div>

        <div class="prh-store-hdr">
          STORE #0412 · RECEIVING DOCK<br/>
          DSD ${slip.type === 'credit' ? 'CREDIT MEMO' : 'RECEIPT'} PRINT-OUT
        </div>

        <div class="prh-meta">
          <span>RCPT: #${escapeHtml(String(slip.receiptNumber || ''))}</span>
          <span>TIME: ${escapeHtml(String(slip.time || ''))}</span>
          <span>VEND: #${escapeHtml(String(slip.vendorNo || '--'))}</span>
          <span>DEPT: #${escapeHtml(String(slip.deptNo || '--'))}</span>
          <span>${slip.type === 'credit' ? 'CRED' : 'INV'}: #${escapeHtml(String(slip.invoiceNo || '--'))}</span>
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
      prevBtn.addEventListener('click', () => {
        playBeep();
        state.activeSlipIndex = (state.activeSlipIndex - 1 + slips.length) % slips.length;
        renderPrintedReceiptHud();
      });
    }
    const nextBtn = document.getElementById('prh-next-btn');
    if (nextBtn && slips.length > 1) {
      nextBtn.addEventListener('click', () => {
        playBeep();
        state.activeSlipIndex = (state.activeSlipIndex + 1) % slips.length;
        renderPrintedReceiptHud();
      });
    }
    const minBtn = document.getElementById('prh-min-btn');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        playBeep();
        state.printedHudMinimized = true;
        renderPrintedReceiptHud();
      });
    }
  }

  function togglePrintedReceiptHud(forceExpand) {
    if (!state.printedSlips || state.printedSlips.length === 0) {
      notify('🖨️ No printed receipts held. Receipts can be printed from Terminal [2].', 3200);
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
      notify('🖨️ Printed Receipt #' + rec.receiptNumber + copyTag + ' on Desk Dot-Matrix Printer.', 3600);
    } else {
      notify('🖨️ Sent Receipt #' + rec.receiptNumber + copyTag + ' to Desk Printer tray — pick up at desk.', 3600);
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

    const cnt = collected.length;
    notify('📄 Picked up ' + cnt + ' printed receipt' + (cnt > 1 ? 's' : '') + ' from Dot-Matrix Printer.', 3400);
    return cnt;
  }

  function discardActivePrintedReceipt() {
    if (!state.printedSlips || state.printedSlips.length === 0) {
      playBeep();
      notify('🗑️ No held receipt print-outs to discard in trash can.', 2800);
      return false;
    }
    const idx = Math.max(0, Math.min(state.activeSlipIndex, state.printedSlips.length - 1));
    const removed = state.printedSlips.splice(idx, 1)[0];
    state.activeSlipIndex = state.printedSlips.length > 0 ? Math.min(idx, state.printedSlips.length - 1) : -1;
    renderPrintedReceiptHud();
    if (typeof state.hooks.onReceiptDiscarded === 'function') state.hooks.onReceiptDiscarded([removed]);
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(null);
    notify('🗑️ Discarded receipt print-out #' + removed.receiptNumber + (removed.isCopy ? ' (Copy)' : '') + ' in trash can.', 3200);
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
      const typeTxt = slip.type === 'credit' ? 'CREDIT MEMO' : 'INVOICE RECEIPT';
      const invTag = (slip.type === 'credit' ? 'Cred #' : 'Inv #') + String(slip.invoiceNo || '--');
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
      notify('🗑️ Trash Can: You have no printed receipt slips held to discard.', 2800);
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

    if (discarded.length === 1) {
      const r = discarded[0];
      notify('🗑️ Discarded receipt #' + r.receiptNumber + (r.isCopy ? ' (Copy)' : '') + ' in trash can.', 3200);
    } else {
      notify('🗑️ Discarded ' + discarded.length + ' printed receipt slips in trash can.', 3200);
    }
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
      titleEl.textContent = d
        ? ('📄 HAND RECEIPTS TO ' + String(d.driverName || 'DRIVER').toUpperCase())
        : '📄 HAND RECEIPTS TO DRIVER';
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
      if (state.handStatusError) {
        warnEl.style.display = 'block';
        warnEl.textContent = state.handStatusError;
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
      const typeTxt = slip.type === 'credit' ? 'CREDIT' : 'INVOICE';
      const invTag = (slip.type === 'credit' ? 'Cred #' : 'Inv #') + String(slip.invoiceNo || '--');
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
      state.handStatusError = '⚠️ Receipt #' + wrongSlip.receiptNumber + ' does not match what ' + (d.driverName || 'this driver') + ' still needs!';
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
      state.handStatusError = '⚠️ Select only 1 slip for #' + dupSlip.receiptNumber + ' (discard extra copies in the Trash Can under the desk).';
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
  // 2-PHASE HAND SCANNER STATE MACHINE
  // =========================================================================

  function resetScannerSession(initialDelivery, targetScreen) {
    const sc = state.scanner;
    const nextScreen = targetScreen || 'home';
    sc.screen = nextScreen;
    sc.phase = nextScreen === 'home' ? 'home' : (nextScreen === 'create' ? 'headers' : nextScreen);
    sc.homeSelectedIdx = 0;
    sc.activeReceiptNo = null;
    sc.standaloneMode = !initialDelivery;
    sc.activeField = 'deptNo';
    sc.headers = { vendorNo: '', deptNo: '', invoiceNo: '' };
    sc.expectedUnitsStr = '';
    sc.expectedCostCents = '';
    sc.expectedNegative = false;
    sc.expectedUnits = 0;
    sc.expectedCost = 0;
    sc.productCode = '';
    sc.quantity = '';
    sc.pendingBoxId = null;
    sc.negativeMode = false;
    sc.currentDocType = 'invoice';
    sc.scannedItems = [];
    sc.scannedCredits = [];
    sc.listScroll = 0;
    sc.resumeScroll = 0;
    sc.resumeSelectedIdx = 0;
    sc.finalizedSnapshot = null;
    sc.finalizedPrinted = false;
    sc.lastScannedLabel = '';
    sc.statusMessage = '';
    sc.statusKind = 'info';

    if (initialDelivery) {
      enrichDelivery(initialDelivery);
      sc.currentDocType = (initialDelivery.docStates && initialDelivery.docStates.invoiceCreated) ? 'credit' : 'invoice';
    }
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

  function getActiveScannerContext() {
    const sc = state.scanner;
    const isNear = typeof state.hooks.isScannerNearDelivery === 'function'
      ? Boolean(state.hooks.isScannerNearDelivery())
      : true;
    const rawD = getActiveDeliveryEnriched();

    // If Night Drop is open or player already opened a standalone receipt, keep scanner in general receipt entry mode
    let delivery = null;
    if (!state.nightDropPanelOpen && !sc.standaloneMode && rawD && isDeliveryCheckInReady(rawD) && isNear) {
      delivery = rawD;
    }
    return { delivery: delivery, isPalletTarget: false };
  }

  const SCANNER_VALID_SCREENS = ['home', 'create', 'resume', 'scanning', 'list', 'totals', 'totals-edit', 'confirm-finalize', 'supply', 'supply-cart', 'supply-confirm', 'supply-done', 'inventory', 'inventory-list', 'inventory-confirm', 'inventory-done', 'damage', 'damage-cond', 'damage-disp', 'damage-ready'];
  const SCANNER_HOME_SCREENS = ['create', 'supply', 'inventory', 'damage'];

  function createInitialDamageState() {
    return {
      pendingItemId: null,
      selectedConditionIdx: 0,
      selectedConditionKey: 'leaking',
      computedDisposition: '',
      isVendorCredit: false
    };
  }

  function isScannerDamageMode() {
    return ['damage', 'damage-cond', 'damage-disp', 'damage-ready'].includes(state.scanner.screen);
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
      pendingOrders: [],
      submittedToday: false,
      submittedEtaDate: '',
      lastSubmittedCases: 0,
      lastSubmittedSkus: 0
    };
  }

  function isSupplyOrderSubmittedToday() {
    return Boolean(state.scanner && state.scanner.supply && state.scanner.supply.submittedToday);
  }

  function getNextSupplyEtaDateInfo() {
    if (global.ShiftClock && typeof global.ShiftClock.getNextShiftDateInfo === 'function') {
      return global.ShiftClock.getNextShiftDateInfo();
    }
    return { dayName: 'NEXT', mmddyyyy: 'NEXT SHIFT' };
  }

  function isScannerSupplyMode() {
    return ['supply', 'supply-cart', 'supply-confirm', 'supply-done'].includes(state.scanner.screen);
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

  function isScannerInventoryMode() {
    return ['inventory', 'inventory-list', 'inventory-confirm', 'inventory-done'].includes(state.scanner.screen);
  }

  function ensureScannerSession(d) {
    const sc = state.scanner;
    if (sc.screen === 'finalized') {
      return d;
    }

    if (!SCANNER_VALID_SCREENS.includes(sc.screen) || sc.phase === 'idle') {
      sc.screen = 'home';
      sc.phase = 'home';
      sc.homeSelectedIdx = 0;
      sc.activeReceiptNo = null;
      sc.standaloneMode = !d;
      sc.activeField = 'deptNo';
      sc.headers = { vendorNo: '', deptNo: '', invoiceNo: '' };
      sc.expectedUnitsStr = '';
      sc.expectedCostCents = '';
      sc.expectedNegative = false;
      sc.expectedUnits = 0;
      sc.expectedCost = 0;
      sc.scannedItems = [];
      sc.scannedCredits = [];
      sc.negativeMode = false;
      sc.listScroll = 0;
      sc.finalizedSnapshot = null;
      sc.currentDocType = (d && d.docStates && d.docStates.invoiceCreated) ? 'credit' : 'invoice';
      sc.statusMessage = '';
      sc.statusKind = 'info';
    }
    return d;
  }

  function openScannerForContext(targetScreen) {
    const d = getActiveDeliveryEnriched();
    ensureScannerSession(d);
    const sc = state.scanner;
    const validTargets = ['home', 'create', 'resume', 'supply', 'inventory', 'damage'];
    const resolved = validTargets.includes(targetScreen) ? targetScreen : 'home';

    // Keep an active open INITIAL receipt intact if the player holstered mid-scan
    const hasOpenReceipt = Boolean(
      sc.activeReceiptNo &&
      ['scanning', 'list', 'totals', 'totals-edit', 'confirm-finalize'].includes(sc.screen) &&
      (() => {
        const rec = findReceipt(sc.activeReceiptNo);
        return rec && getReceiptStatus(rec) === 'INITIAL';
      })()
    );
    if (hasOpenReceipt) {
      return;
    }

    if (sc.screen === 'finalized') {
      resetScannerSession(d && !d.completed ? d : null, resolved);
      return;
    }

    const resolvedScreen = (resolved === 'inventory' && sc.inventory && sc.inventory.finalized)
      ? 'inventory-done'
      : ((resolved === 'supply' && sc.supply && sc.supply.submittedToday) ? 'supply-done' : resolved);
    sc.screen = resolvedScreen;
    sc.phase = resolvedScreen === 'home' ? 'home' : (resolvedScreen === 'create' ? 'headers' : resolvedScreen);
    if (resolvedScreen === 'home') {
      sc.homeSelectedIdx = 0;
    }
    setScannerMessage('', 'info');
  }

  function setScannerMessage(msg, kind) {
    state.scanner.statusMessage = msg || '';
    state.scanner.statusKind = kind || 'info';
  }

  function clearScannerMessage() {
    setScannerMessage('', 'info');
    renderScannerUI();
  }

  function cycleHeaderField(dir) {
    const order = ['deptNo', 'vendorNo', 'invoiceNo', 'units', 'cost'];
    const sc = state.scanner;
    const idx = order.indexOf(sc.activeField);
    const baseIdx = idx === -1 ? 0 : idx;
    const nextIdx = (baseIdx + dir + order.length) % order.length;
    sc.activeField = order[nextIdx];
    playBeep();
  }

  function cycleScanField(dir) {
    const order = ['productCode', 'quantity'];
    const sc = state.scanner;
    const idx = order.indexOf(sc.activeField);
    const baseIdx = idx === -1 ? 0 : idx;
    const nextIdx = (baseIdx + dir + order.length) % order.length;
    sc.activeField = order[nextIdx];
    playBeep();
  }

  function getHeaderMaxLen(field) {
    if (field === 'deptNo') return 2;
    if (field === 'vendorNo') return 3;
    if (field === 'invoiceNo') return 6;
    if (field === 'units') return 4;
    if (field === 'cost') return 7;
    return 14;
  }

  function formatCostCents(centsDigits, isNeg) {
    const digits = String(centsDigits || '').replace(/\D/g, '');
    const centsVal = parseInt(digits || '0', 10) || 0;
    const absStr = (centsVal / 100).toFixed(2);
    return (isNeg ? '-' : '') + absStr;
  }

  function runTempProbeForDelivery(d) {
    if (!d) {
      playError();
      return { ok: false, error: 'NO ACTIVE DELIVERY FOR TEMP PROBE' };
    }
    enrichDelivery(d);
    if (!d.requiresTempCheck) {
      playBeep();
      notify('🌡️ Temp probe is only required for chilled/frozen deliveries.', 3000);
      return { ok: false, error: 'TEMP PROBE NOT REQUIRED' };
    }
    d.tempChecked = true;
    const actualTempStr = d.outOfTemp
      ? (d.tempZone === 'F' ? '+18.4°F (FAIL!)' : (d.tempZone === 'C' ? '+49.2°F (FAIL!)' : '68.0°F (FAIL!)'))
      : (d.expectedTemp || 'OK') + ' (PASS)';
    d.observedTemp = actualTempStr;
    if (d.outOfTemp) {
      playError();
      notify('🌡️ TEMP FAIL: ' + actualTempStr + ' — Click [REFUSE] on the Invoice window!', 5000);
    } else {
      playSuccess();
      notify('🌡️ TEMP PROBE OK: ' + actualTempStr, 3500);
    }
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return { ok: true, passed: !d.outOfTemp, observedTemp: actualTempStr };
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

  // Stamps a player-keyed Shortage qty onto the paper invoice ONLY (never auto-adjusts scanner receipts)
  function stampInvoiceShortageQty(d, code, newQty) {
    if (!d || !Array.isArray(d.invoiceItems)) {
      return { ok: false, error: 'NO DELIVERY INVOICE' };
    }
    const item = d.invoiceItems.find((it) => String(it.code) === String(code));
    if (!item) {
      return { ok: false, error: 'ITEM NOT FOUND ON INVOICE' };
    }
    if (item.billedQty === undefined) item.billedQty = item.qty;
    const upc = getItemUnitsPerCase(item, d.type);
    const parsed = Math.round(Number(newQty));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number(item.billedQty)) {
      return { ok: false, error: 'Quantity out of range (0 to ' + item.billedQty + ')' };
    }
    if (upc > 1 && (parsed % upc !== 0)) {
      return { ok: false, error: 'Quantity must be a multiple of ' + upc };
    }
    item.qty = parsed;
    item.shortageStamped = (parsed !== item.billedQty);
    d.hasDiscrepancy = d.invoiceItems.some((it) => it.physicalQty !== it.qty);
    d.discrepancyResolved = !d.hasDiscrepancy;
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return { ok: true, item: item, newQty: parsed, stamped: item.shortageStamped };
  }

  function clearInvoiceShortageFlag(d, code) {
    if (!d || !Array.isArray(d.invoiceItems)) {
      return { ok: false, error: 'NO DELIVERY INVOICE' };
    }
    const item = d.invoiceItems.find((it) => String(it.code) === String(code));
    if (!item) {
      return { ok: false, error: 'ITEM NOT FOUND ON INVOICE' };
    }
    if (item.billedQty !== undefined) {
      item.qty = Number(item.billedQty);
    }
    item.shortageStamped = false;
    d.hasDiscrepancy = d.invoiceItems.some((it) => it.physicalQty !== it.qty);
    d.discrepancyResolved = !d.hasDiscrepancy;
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return { ok: true, item: item, cleared: true };
  }

  // Flags/unflags a physical 3D box on cart/pallet as Overage (leaves box physically on cart/pallet; never edits scanner receipt)
  function toggleBoxOverageFlag(d, box) {
    if (!d || !box || box.isCredit) {
      return { ok: false, error: 'INVALID BOX FOR OVERAGE FLAG' };
    }
    box.overageFlagged = !box.overageFlagged;
    if (box.overageFlagged) {
      box.scanned = false;
    } else {
      reconcileDeliveryBoxesFromReceipts(d);
    }
    const boxes = d.physicalBoxes || [];
    d.totalCases = boxes.filter((b) => !b.overageFlagged).length;
    d.casesScanned = boxes.filter((b) => b.scanned && !b.overageFlagged).length;
    (d.invoiceItems || []).forEach((it) => {
      it.overageFlagged = boxes.some((b) => String(b.code) === String(it.code) && b.overageFlagged);
    });
    d.hasDiscrepancy = (d.invoiceItems || []).some((it) => {
      const billed = it.billedQty !== undefined ? it.billedQty : it.qty;
      const upc = getItemUnitsPerCase(it, d.type);
      const flaggedCnt = boxes.filter((b) => String(b.code) === String(it.code) && b.overageFlagged).length;
      const effectivePhys = it.physicalQty - (flaggedCnt * upc);
      return it.qty !== Math.min(billed, it.physicalQty) || effectivePhys !== billed;
    });
    d.discrepancyResolved = !d.hasDiscrepancy;
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return { ok: true, flagged: box.overageFlagged, box: box };
  }

  // Audits completed non-warehouse delivery at sign-off: compares paper shortage stamps, cart/pallet overage flags, and finalized receipts against truth
  function auditCompletedDelivery(d) {
    if (!d || d.type === 'warehouse' || d.refused) {
      return { ok: true, errors: [] };
    }
    if (d._auditResult) return d._auditResult;

    const errors = [];
    const boxes = d.physicalBoxes || [];
    const expectedInvoiceList = [];

    (d.invoiceItems || []).forEach((it) => {
      const upc = getItemUnitsPerCase(it, d.type);
      const billed = it.billedQty !== undefined ? Number(it.billedQty) : Number(it.qty);
      const phys = Number(it.physicalQty || 0);
      const trueAccepted = Math.min(billed, phys);
      const trueOverUnits = Math.max(0, phys - billed);
      const trueOverCases = Math.round(trueOverUnits / upc);
      const actualPaperQty = Number(it.qty || 0);
      const actualOverFlags = boxes.filter((b) => String(b.code) === String(it.code) && b.overageFlagged).length;

      if (actualPaperQty !== trueAccepted) {
        if (phys < billed) {
          errors.push('Shortage qty on ' + it.name + ' (stamped ' + actualPaperQty + 'u, actual ' + phys + 'u)');
        } else {
          errors.push('Wrong Shortage stamp on ' + it.name + ' (billed ' + billed + 'u arrived)');
        }
      }
      if (actualOverFlags !== trueOverCases) {
        if (phys > billed) {
          errors.push('Overage on ' + it.name + ' (flagged ' + actualOverFlags + 'cs, excess ' + trueOverCases + 'cs / ' + trueOverUnits + 'u)');
        } else {
          errors.push('Wrong Overage flag on ' + it.name + ' (no excess arrived)');
        }
      }
      if (trueAccepted > 0) {
        expectedInvoiceList.push({
          code: it.code,
          name: it.name,
          qty: trueAccepted,
          price: Number(it.price || 0)
        });
      }
    });

    // Verify finalized invoice receipt line items and edited inputted Totals/Cost
    const invRec = d.lastReceiptNumber
      ? findReceipt(d.lastReceiptNumber)
      : state.processedReceipts.find((r) => !r.voided && r.finalized && r.type === 'invoice' && r.deliveryId === d.id);
    if (!invRec || invRec.voided || !invRec.finalized) {
      errors.push('Missing finalized invoice receipt');
    } else {
      const itemsOk = evaluateListAccuracy(invRec.items || [], expectedInvoiceList, false);
      if (!itemsOk) {
        errors.push('Receipt #' + invRec.receiptNumber + ' item quantities not updated to match verified cargo');
      }
      const trueUnits = expectedInvoiceList.reduce((s, it) => s + it.qty, 0);
      const trueCost = Number((expectedInvoiceList.reduce((s, it) => s + it.qty * it.price, 0)).toFixed(2));
      const unitsMismatch = Number(invRec.expectedUnits || 0) !== trueUnits;
      const costMismatch = invRec.expectedCost !== null && invRec.expectedCost !== undefined &&
        Math.abs(Number(invRec.expectedCost) - trueCost) > 0.02;
      if (unitsMismatch || costMismatch) {
        errors.push('Receipt #' + invRec.receiptNumber + ' inputted Totals/Cost not edited to ' + trueUnits + 'u / $' + trueCost.toFixed(2));
      }
    }

    // Verify finalized credit receipt if credit memo was present
    if (d.docStates && d.docStates.creditRequired) {
      const credRec = d.lastCreditReceiptNumber
        ? findReceipt(d.lastCreditReceiptNumber)
        : state.processedReceipts.find((r) => !r.voided && r.finalized && r.type === 'credit' && r.deliveryId === d.id);
      if (!credRec || credRec.voided || !credRec.finalized || !evaluateListAccuracy(credRec.items || [], d.creditItems || [], true)) {
        errors.push('Credit memo receipt does not match credit items');
      }
    }

    const stats = getStats();
    const negCfg = (getCatalog() && getCatalog().SCORING_CONFIG && getCatalog().SCORING_CONFIG.negative) || {};
    let penaltyTotal = 0;

    if (errors.length > 0) {
      const invPen = Math.abs(negCfg.inaccurateInvoice !== undefined ? negCfg.inaccurateInvoice : 100);
      if (stats) stats.increment('inaccurateInvoices', 1);
      penaltyTotal += invPen;
    }

    const needsTemp = Boolean(
      d.requiresTempCheck ||
      d.tempZone === 'C' ||
      d.tempZone === 'F' ||
      (d.invoiceItems || []).some((it) => it && (it.type === 'refrigerated' || it.type === 'frozen'))
    );
    if (needsTemp && !d.tempChecked) {
      const missPen = Math.abs(negCfg.missedTempCheck !== undefined ? negCfg.missedTempCheck : 150);
      if (stats) stats.increment('missedTempChecks', 1);
      penaltyTotal += missPen;
      errors.push('Skipped required Temp Probe (-' + missPen + ' pts)');
    }
    if (d.outOfTemp) {
      const tempPen = Math.abs(negCfg.acceptOutOfTemp !== undefined ? negCfg.acceptOutOfTemp : 800);
      if (stats) stats.increment('acceptedOutOfTemp', 1);
      penaltyTotal += tempPen;
      errors.push('Accepted OUT-OF-TEMP delivery (-' + tempPen + ' pts)');
    }

    d._auditResult = { ok: errors.length === 0, errors: errors, penaltyTotal: penaltyTotal };
    return d._auditResult;
  }

  function syncDiscrepancyFlagsAndTotals(d, mode) {
    const doShort = mode === 'short' || mode === 'both';
    const doOver = mode === 'over' || mode === 'both';
    let loggedMsg = '';

    (d.invoiceItems || []).forEach((it) => {
      if (doShort && it.physicalQty < it.qty) {
        if (it.billedQty === undefined) it.billedQty = it.qty;
        it.qty = it.physicalQty;
        it.shortageStamped = true;
        loggedMsg = 'SHORTAGE STAMPED (' + it.name.slice(0, 16) + ' -> ' + it.physicalQty + ')';
      } else if (doOver && it.physicalQty > it.qty) {
        it.overageFlagged = true;
        const upc = getItemUnitsPerCase(it, d.type);
        let excessCases = Math.max(1, Math.round((it.physicalQty - it.qty) / upc));
        for (let i = (d.physicalBoxes || []).length - 1; i >= 0 && excessCases > 0; i--) {
          if (d.physicalBoxes[i].code === it.code && !d.physicalBoxes[i].overageFlagged) {
            d.physicalBoxes[i].overageFlagged = true;
            d.physicalBoxes[i].scanned = false;
            excessCases--;
          }
        }
        d.totalCases = (d.physicalBoxes || []).filter((b) => !b.overageFlagged).length;
        d.casesScanned = (d.physicalBoxes || []).filter((b) => b.scanned && !b.overageFlagged).length;
        loggedMsg = 'OVERAGE FLAGGED ON CART/PALLET';
      }
    });

    d.hasDiscrepancy = (d.invoiceItems || []).some((it) => it.physicalQty !== it.qty);
    d.discrepancyResolved = !d.hasDiscrepancy;
    return loggedMsg;
  }

  function applyShortageToDelivery(d) {
    if (!d) {
      playError();
      return { ok: false, error: 'NO ACTIVE DELIVERY FOR SHORTAGE CHECK' };
    }
    enrichDelivery(d);
    const hasShort = (d.invoiceItems || []).some((it) => it.physicalQty < it.qty);
    if (!hasShort) {
      playBeep();
      notify('📋 No physical shortage detected on this invoice.', 3200);
      return { ok: true, changed: false, message: 'No shortage detected.' };
    }
    const loggedMsg = syncDiscrepancyFlagsAndTotals(d, 'short');
    playSuccess();
    notify('📋 ' + (loggedMsg || 'Shortage stamped on paper invoice'), 4000);
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return { ok: true, changed: true, message: loggedMsg || 'Shortage stamped.' };
  }

  function applyOverageToDelivery(d) {
    if (!d) {
      playError();
      return { ok: false, error: 'NO ACTIVE DELIVERY FOR OVERAGE CHECK' };
    }
    enrichDelivery(d);
    const hasOver = (d.invoiceItems || []).some((it) => it.physicalQty > it.qty);
    if (!hasOver) {
      playBeep();
      notify('📋 No overage cases detected on this pallet/cart.', 3200);
      return { ok: true, changed: false, message: 'No overage detected.' };
    }
    const loggedMsg = syncDiscrepancyFlagsAndTotals(d, 'over');
    playSuccess();
    notify('📦 ' + (loggedMsg || 'Overage cases flagged on cart/pallet'), 4000);
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return { ok: true, changed: true, message: loggedMsg || 'Overage flagged.' };
  }

  function applyDiscrepancyToDelivery(d) {
    if (!d) {
      playError();
      return { ok: false, error: 'NO ACTIVE DELIVERY FOR DISCREPANCY CHECK' };
    }
    enrichDelivery(d);
    if (!d.hasDiscrepancy) {
      playBeep();
      notify('📋 No physical shortage or overage detected on this invoice.', 3200);
      return { ok: true, changed: false, message: 'No physical shortage or overage.' };
    }
    const msg = handleDiscrepancyKey(d);
    return { ok: true, changed: true, message: msg };
  }

  function handleScannerKey(rawAction, val) {
    const action = rawAction === 'neg' ? 'minus' : (rawAction === 'done' ? 'plus' : rawAction);
    const ctx = getActiveScannerContext();
    const d = ctx.delivery;

    ensureScannerSession(d);
    const sc = state.scanner;

    if (action === 'pwr') {
      clearScannerMessage();
      return false;
    }

    // F1: Universal Return to Home Screen
    if (action === 'home') {
      playBeep();
      if (['scanning', 'list', 'totals', 'totals-edit', 'confirm-finalize', 'finalized'].includes(sc.screen)) {
        resetScannerSession(d && !d.completed ? d : null, 'home');
      } else {
        sc.screen = 'home';
        sc.phase = 'home';
        setScannerMessage('', 'info');
      }
      renderScannerUI();
      if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
      return true;
    }

    // F6: Print Finalized Receipt (optional shortcut)
    if (action === 'print') {
      if (sc.screen === 'finalized' && sc.finalizedSnapshot && sc.finalizedSnapshot.receiptNumber) {
        const res = printReceiptSlip(sc.finalizedSnapshot.receiptNumber, { fromScanner: true });
        if (res.ok) {
          sc.finalizedPrinted = true;
          playSuccess();
          setScannerMessage('PRINTED #' + sc.finalizedSnapshot.receiptNumber, 'ok');
        } else {
          playError();
          setScannerMessage(res.error || 'PRINT FAILED', 'err');
        }
        renderScannerUI();
        if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
      } else {
        playBeep();
      }
      return true;
    }

    // F7 (outside Create Receipt) / F8 (outside Totals Edit trigger): Reserved function keys
    if ((action === 'f7' && sc.screen !== 'create') || (action === 'f8' && sc.screen !== 'totals')) {
      playBeep();
      return true;
    }

    // Screen 5: Logged & Finalized ("ENTER to continue." / F3 Back)
    if (sc.screen === 'finalized') {
      if (action === 'enter' || action === 'back') {
        playBeep();
        const continueToCreate = Boolean(d && !d.completed);
        resetScannerSession(continueToCreate ? d : null, continueToCreate ? 'create' : 'home');
      } else {
        playBeep();
      }
      renderScannerUI();
      if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
      return true;
    }

    // Screen 4B: Finalize Confirmation ("ENT Confirm | F3 No")
    if (sc.screen === 'confirm-finalize') {
      if (action === 'enter') {
        finalizeScannerDocument(d);
      } else if (action === 'back') {
        sc.screen = 'scanning';
        sc.phase = 'scanning';
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
      return true;
    }

    // Dept 60 Supply Ordering Mode (Option 2)
    if (isScannerSupplyMode()) {
      return handleSupplyScannerKey(action, val);
    }

    // Daily Backroom Inventory Mode (Option 3)
    if (isScannerInventoryMode()) {
      return handleInventoryScannerKey(action, val);
    }

    // Markdown Claims Mode (Option 4)
    if (isScannerDamageMode()) {
      return handleDamageScannerKey(action, val);
    }

    // Screen 0: Handheld Terminal Home Menu ("1-4 or Up/Dn + ENT")
    if (sc.screen === 'home') {
      const openHomeOption = (idx) => {
        const target = SCANNER_HOME_SCREENS[idx];
        if (!target) {
          playError();
          return;
        }
        sc.homeSelectedIdx = idx;
        const resolvedTarget = (target === 'inventory' && sc.inventory && sc.inventory.finalized)
          ? 'inventory-done'
          : ((target === 'supply' && sc.supply && sc.supply.submittedToday) ? 'supply-done' : target);
        sc.screen = resolvedTarget;
        sc.phase = resolvedTarget === 'create' ? 'headers' : resolvedTarget;
        if (resolvedTarget === 'create') {
          sc.activeField = 'deptNo';
        }
        setScannerMessage('', 'info');
        playBeep();
      };

      if (action === 'num') {
        const idx = parseInt(String(val), 10) - 1;
        if (idx >= 0 && idx < SCANNER_HOME_SCREENS.length) {
          openHomeOption(idx);
        } else {
          playBeep();
        }
      } else if (action === 'up') {
        sc.homeSelectedIdx = ((sc.homeSelectedIdx || 0) - 1 + SCANNER_HOME_SCREENS.length) % SCANNER_HOME_SCREENS.length;
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'down') {
        sc.homeSelectedIdx = ((sc.homeSelectedIdx || 0) + 1) % SCANNER_HOME_SCREENS.length;
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'enter') {
        openHomeOption(Math.max(0, Math.min(SCANNER_HOME_SCREENS.length - 1, sc.homeSelectedIdx || 0)));
      } else if (action === 'back') {
        sc.screen = 'home';
        sc.phase = 'home';
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    // Screen 4B-Edit: Modify Inputted Totals Cost & Units ("F2 Save | F3 Cancel")
    if (sc.screen === 'totals-edit') {
      if (action === 'back') {
        sc.screen = 'totals';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'star') {
        const newUnits = parseInt(sc.totalsEditUnitsStr || '0', 10) || 0;
        const rawCents = parseInt(sc.totalsEditCostCents || '0', 10) || 0;
        if (newUnits <= 0) {
          playError();
          sc.totalsEditField = 'units';
          setScannerMessage('ENTER UNITS > 0', 'err');
          renderScannerUI();
          return true;
        }
        const newCost = rawCents > 0 ? Number((rawCents / 100).toFixed(2)) : null;
        sc.expectedUnits = newUnits;
        sc.expectedUnitsStr = String(newUnits);
        sc.expectedCost = newCost;
        sc.expectedCostCents = rawCents > 0 ? String(rawCents) : '';

        const rec = sc.activeReceiptNo ? findReceipt(sc.activeReceiptNo) : null;
        if (rec) {
          rec.expectedUnits = newUnits;
          rec.expectedCost = newCost;
        }

        sc.screen = 'totals';
        setScannerMessage('TOTALS UPDATED', 'ok');
        playSuccess();
      } else if (action === 'up' || action === 'down' || action === 'left' || action === 'right' || action === 'enter') {
        sc.totalsEditField = sc.totalsEditField === 'cost' ? 'units' : 'cost';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'num') {
        const digit = String(val);
        if (sc.totalsEditField === 'cost') {
          const cur = sc.totalsEditCostCents || '';
          if (cur.length < getHeaderMaxLen('cost')) {
            if (cur.length === 0 && digit === '0') {
              playBeep();
            } else {
              sc.totalsEditCostCents = cur + digit;
              playBeep();
            }
          }
        } else {
          const cur = sc.totalsEditUnitsStr || '';
          if (cur.length < getHeaderMaxLen('units')) {
            if (cur.length === 0 && digit === '0') {
              playBeep();
            } else {
              sc.totalsEditUnitsStr = cur + digit;
              playBeep();
            }
          }
        }
        setScannerMessage('', 'info');
      } else if (action === 'clear') {
        if (sc.totalsEditField === 'cost') {
          const cur = sc.totalsEditCostCents || '';
          if (cur.length > 0) sc.totalsEditCostCents = cur.slice(0, -1);
        } else {
          const cur = sc.totalsEditUnitsStr || '';
          if (cur.length > 0) sc.totalsEditUnitsStr = cur.slice(0, -1);
        }
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    // Screen 4: Totals & Costs ("F2/F3 Back | F8 Edit")
    if (sc.screen === 'totals') {
      if (action === 'star' || action === 'left' || action === 'back') {
        sc.screen = 'scanning';
        sc.phase = 'scanning';
        setScannerMessage('', 'info');
        playBeep();
        renderScannerUI();
      } else if (action === 'f8') {
        const curCost = (sc.expectedCost !== null && sc.expectedCost !== undefined && sc.expectedCost > 0)
          ? String(Math.round(Math.abs(Number(sc.expectedCost)) * 100))
          : (sc.expectedCostCents || '');
        const curUnits = (sc.expectedUnits && sc.expectedUnits > 0)
          ? String(Math.abs(Number(sc.expectedUnits)))
          : (sc.expectedUnitsStr || '');
        sc.totalsEditCostCents = curCost;
        sc.totalsEditUnitsStr = curUnits;
        sc.totalsEditField = 'cost';
        sc.screen = 'totals-edit';
        setScannerMessage('', 'info');
        playBeep();
        renderScannerUI();
      } else {
        playBeep();
      }
      return true;
    }

    // Screen 3: Item Detail List ("F3 Back | Up/Dn Nav")
    if (sc.screen === 'list') {
      const maxScroll = Math.max(0, sc.scannedItems.length - 6);
      if (action === 'slash' || action === 'left' || action === 'back') {
        sc.screen = 'scanning';
        sc.phase = 'scanning';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'up') {
        sc.listScroll = Math.max(0, (sc.listScroll || 0) - 1);
        playBeep();
      } else if (action === 'down') {
        sc.listScroll = Math.min(maxScroll, (sc.listScroll || 0) + 1);
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    // Screen 1B: Take Over / Resume an open INITIAL receipt
    if (sc.screen === 'resume') {
      const initialRecs = getInitialReceipts();
      if (initialRecs.length === 0) {
        sc.screen = 'create';
        playBeep();
        renderScannerUI();
        return true;
      }
      const curIdx = Math.max(0, Math.min(initialRecs.length - 1, sc.resumeSelectedIdx || 0));
      if (action === 'slash' || action === 'left' || action === 'back') {
        sc.screen = 'create';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'up') {
        const nextIdx = Math.max(0, curIdx - 1);
        sc.resumeSelectedIdx = nextIdx;
        if (nextIdx < (sc.resumeScroll || 0)) sc.resumeScroll = nextIdx;
        playBeep();
      } else if (action === 'down') {
        const nextIdx = Math.min(initialRecs.length - 1, curIdx + 1);
        sc.resumeSelectedIdx = nextIdx;
        if (nextIdx >= (sc.resumeScroll || 0) + 5) sc.resumeScroll = nextIdx - 4;
        playBeep();
      } else if (action === 'enter' || action === 'right') {
        const chosen = initialRecs[curIdx];
        if (chosen && resumeReceiptInScanner(chosen, d)) {
          playSuccess();
        } else {
          playError();
        }
      } else {
        playBeep();
      }
      renderScannerUI();
      if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
      return true;
    }

    // Screen 1: Create Receipt ("Dept#, Vendor, Invoice, Units, Cost -> ENTER to create.")
    if (sc.screen === 'create') {
      if (action === 'num') {
        const digit = String(val);
        if (sc.activeField === 'deptNo' || sc.activeField === 'vendorNo' || sc.activeField === 'invoiceNo') {
          const maxLen = getHeaderMaxLen(sc.activeField);
          if (sc.headers[sc.activeField].length < maxLen) {
            sc.headers[sc.activeField] += digit;
            playBeep();
            if (sc.headers[sc.activeField].length === maxLen) {
              if (sc.activeField === 'deptNo') sc.activeField = 'vendorNo';
              else if (sc.activeField === 'vendorNo') sc.activeField = 'invoiceNo';
              else if (sc.activeField === 'invoiceNo') sc.activeField = 'units';
            }
          }
        } else if (sc.activeField === 'units') {
          if (sc.expectedUnitsStr.length < getHeaderMaxLen('units')) {
            if (sc.expectedUnitsStr.length === 0 && digit === '0') {
              playBeep();
            } else {
              sc.expectedUnitsStr += digit;
              playBeep();
            }
          }
        } else if (sc.activeField === 'cost') {
          if (sc.expectedCostCents.length < getHeaderMaxLen('cost')) {
            if (sc.expectedCostCents.length === 0 && digit === '0') {
              playBeep();
            } else {
              sc.expectedCostCents += digit;
              playBeep();
            }
          }
        }
        setScannerMessage('', 'info');
      } else if (action === 'minus') {
        // Negative (-) is only valid when keying items into a created receipt
        playBeep();
      } else if (action === 'dot') {
        playBeep();
      } else if (action === 'back') {
        sc.screen = 'home';
        sc.phase = 'home';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'clear') {
        if (sc.activeField === 'deptNo' || sc.activeField === 'vendorNo' || sc.activeField === 'invoiceNo') {
          const cur = sc.headers[sc.activeField];
          if (cur.length > 0) sc.headers[sc.activeField] = cur.slice(0, -1);
        } else if (sc.activeField === 'units') {
          if (sc.expectedUnitsStr.length > 0) sc.expectedUnitsStr = sc.expectedUnitsStr.slice(0, -1);
        } else if (sc.activeField === 'cost') {
          if (sc.expectedCostCents.length > 0) sc.expectedCostCents = sc.expectedCostCents.slice(0, -1);
        }
        playBeep();
        setScannerMessage('', 'info');
      } else if (action === 'up' || action === 'left') {
        cycleHeaderField(-1);
      } else if (action === 'down' || action === 'right') {
        cycleHeaderField(1);
      } else if (action === 'autofill' && d) {
        sc.headers.deptNo = d.deptNo;
        sc.headers.vendorNo = d.vendorNo;
        const focusedTab = typeof state.hooks.getActiveInvoiceTab === 'function' ? state.hooks.getActiveInvoiceTab() : null;
        const creditNeeded = Boolean(d.docStates && d.docStates.creditRequired && !d.docStates.creditCreated);
        const invoiceNeeded = Boolean(!d.docStates || (d.docStates.invoiceRequired && !d.docStates.invoiceCreated));
        const pickCredit = creditNeeded && (!invoiceNeeded || focusedTab === 'credit');
        sc.headers.invoiceNo = pickCredit ? getCreditInvoiceNo(d) : d.invoiceNo;
        const srcList = pickCredit ? (d.creditItems || []) : (d.invoiceItems || []);
        const totU = srcList.reduce((s, it) => s + Math.abs(Number(it.qty) || 0), 0);
        const totC = srcList.reduce((s, it) => s + Math.abs(Number(it.qty) || 0) * (Number(it.price) || 0), 0);
        sc.expectedNegative = false;
        sc.expectedUnitsStr = String(totU);
        sc.expectedCostCents = totC > 0 ? String(Math.round(totC * 100)) : '';
        playBeep();
      } else if (action === 'scan') {
        playError();
        setScannerMessage('CREATE RECEIPT FIRST', 'warn');
      } else if (action === 'f7') {
        const initialRecs = getInitialReceipts();
        if (initialRecs.length > 0) {
          sc.resumeSelectedIdx = 0;
          sc.resumeScroll = 0;
          sc.screen = 'resume';
          setScannerMessage('', 'info');
          playBeep();
        } else {
          playBeep();
        }
      } else if (action === 'enter') {
        // Advance sequentially through required header fields (Cost is optional and may be left blank)
        const missingReqField = !sc.headers.deptNo ? 'deptNo'
          : (!sc.headers.vendorNo ? 'vendorNo'
            : (!sc.headers.invoiceNo ? 'invoiceNo'
              : (!sc.expectedUnitsStr ? 'units' : null)));
        if (missingReqField && sc.activeField !== missingReqField && sc.activeField !== 'cost') {
          cycleHeaderField(1);
          renderScannerUI();
          return true;
        }
        // When on Units with all earlier fields filled and Cost still blank, advance once to Cost so player can enter it or hit Enter again to leave Cost blank
        if (sc.activeField === 'units' && sc.expectedUnitsStr && !sc.expectedCostCents) {
          cycleHeaderField(1);
          renderScannerUI();
          return true;
        }

        const rawU = parseInt(sc.expectedUnitsStr || '0', 10) || 0;
        const rawCents = parseInt(sc.expectedCostCents || '0', 10) || 0;
        if (rawU <= 0) {
          playError();
          sc.activeField = 'units';
          setScannerMessage('ENTER INVOICE UNITS', 'err');
          renderScannerUI();
          return true;
        }

        const expUnitsVal = rawU;
        const expCostVal = rawCents > 0 ? Number((rawCents / 100).toFixed(2)) : null;

        const blankRes = validateAndCreateBlankReceipt({
          vendorNo: sc.headers.vendorNo,
          deptNo: sc.headers.deptNo,
          invoiceNo: sc.headers.invoiceNo,
          expectedUnits: expUnitsVal,
          expectedCost: expCostVal,
          source: 'scanner',
          deliveryId: d ? d.id : null
        });
        if (!blankRes.ok) {
          playError();
          if (getStats() && (blankRes.error.startsWith('UNKNOWN') || blankRes.error.startsWith('BAD VENDOR'))) {
            getStats().increment('errorsMade', 1);
          }
          setScannerMessage(blankRes.error, 'err');
          renderScannerUI();
          return true;
        }

        const blankRec = blankRes.receipt;
        sc.headers.deptNo = blankRec.deptNo;
        sc.headers.vendorNo = blankRec.vendorNo;
        sc.headers.invoiceNo = blankRec.invoiceNo;
        sc.expectedUnits = expUnitsVal;
        sc.expectedCost = expCostVal;
        sc.expectedNegative = false;
        sc.activeReceiptNo = blankRec.receiptNumber;
        sc.standaloneMode = !d;
        sc.screen = 'scanning';
        sc.phase = 'scanning';
        sc.activeField = 'productCode';
        sc.productCode = '';
        sc.quantity = '';
        sc.lastScannedLabel = '';
        sc.scannedItems = [];
        sc.listScroll = 0;
        sc.negativeMode = false;
        sc.currentDocType = 'invoice';
        playSuccess();
        setScannerMessage('', 'info');
      }
      renderScannerUI();
      if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
      return true;
    }

    // Screen 2: Receipt Created / Scanning Items ("F4 List | F2 Total | F5 FINAL")
    if (sc.screen === 'scanning') {
      if (action === 'back') {
        playBeep();
        resetScannerSession(d && !d.completed ? d : null, 'create');
        renderScannerUI();
        if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
        return true;
      }
      if (action === 'minus') {
        sc.negativeMode = !sc.negativeMode;
        playBeep();
        setScannerMessage('', 'info');
      } else if (action === 'star') {
        sc.screen = 'totals';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'slash') {
        sc.listScroll = 0;
        sc.screen = 'list';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'plus') {
        const finalItems = (sc.scannedItems || []).filter((it) => it.qty !== 0);
        if (finalItems.length === 0) {
          playError();
          setScannerMessage('SCAN ITEMS FIRST', 'err');
        } else {
          sc.screen = 'confirm-finalize';
          sc.phase = 'confirm-finalize';
          setScannerMessage('', 'info');
          playBeep();
        }
      } else if (action === 'num') {
        if (sc.activeField === 'productCode') {
          if (sc.productCode.length < 14) {
            sc.productCode += String(val);
            sc.lastScannedLabel = '';
            playBeep();
          }
        } else {
          if (sc.quantity.length < 4) {
            sc.quantity += String(val);
            playBeep();
          }
        }
        setScannerMessage('', 'info');
      } else if (action === 'clear') {
        if (sc.activeField === 'quantity') {
          if (sc.quantity.length > 0) sc.quantity = sc.quantity.slice(0, -1);
        } else if (sc.productCode.length > 0) {
          sc.productCode = sc.productCode.slice(0, -1);
          sc.lastScannedLabel = '';
        }
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'up' || action === 'left') {
        cycleScanField(-1);
      } else if (action === 'down' || action === 'right') {
        cycleScanField(1);
      } else if (action === 'scan') {
        if (!d) {
          playBeep();
          setScannerMessage('', 'info');
        } else {
          performPhysicalBoxScan(d);
        }
      } else if (action === 'enter') {
        if (sc.activeField === 'productCode') {
          if (!sc.productCode) {
            playError();
            setScannerMessage('KEY UPC/PLU CODE', 'err');
            renderScannerUI();
            return true;
          }
          const prod = lookupProductForDelivery(d, sc.productCode);
          if (!prod) {
            sc.lastScannedLabel = '';
            playError();
            if (getStats()) getStats().increment('errorsMade', 1);
            setScannerMessage('UNKNOWN UPC: ' + sc.productCode, 'err');
            renderScannerUI();
            return true;
          }
          sc.activeField = 'quantity';
          sc.quantity = '';
          sc.lastScannedLabel = prod.name;
          playBeep();
          setScannerMessage('', 'info');
        } else {
          commitManualLineItem(d);
        }
      }
      renderScannerUI();
      if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
      return true;
    }

    return false;
  }

  function lookupProductForDelivery(delivery, rawCode) {
    const code = String(rawCode || '').trim();
    const catalog = getCatalog();
    if (catalog) {
      const catProd = catalog.getProduct(code);
      if (catProd) return catProd;
    }
    if (delivery) {
      const invMatch = (delivery.invoiceItems || []).find((it) => it.code === code);
      if (invMatch) return invMatch;
      const crdMatch = (delivery.creditItems || []).find((it) => it.code === code);
      if (crdMatch) return crdMatch;
    }
    return null;
  }

  function addScannedEntry(code, name, qtyDelta, price, notScannable, type) {
    const sc = state.scanner;
    const codeStr = String(code);
    const targetList = sc.scannedItems;
    const existing = targetList.find((it) => it.code === codeStr);
    if (existing) {
      existing.qty += qtyDelta;
      if (existing.qty === 0) {
        const idx = targetList.indexOf(existing);
        if (idx !== -1) targetList.splice(idx, 1);
      }
    } else if (qtyDelta !== 0) {
      targetList.push({
        code: codeStr,
        name: name,
        qty: qtyDelta,
        price: Number(price) || 0,
        notScannable: Boolean(notScannable),
        type: type || 'ambient'
      });
    }
    const hasItems = targetList.length > 0;
    sc.currentDocType = (hasItems && targetList.every((it) => it.qty < 0)) ? 'credit' : 'invoice';
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

  function performPhysicalBoxScan(d, explicitBox) {
    const isFocused = explicitBox ? true : (typeof state.hooks.isScannerFocusedOnDelivery === 'function'
      ? state.hooks.isScannerFocusedOnDelivery()
      : true);
    if (!isFocused) {
      return;
    }

    const sc = state.scanner;
    const hovered = !explicitBox && typeof state.hooks.getHoveredBox === 'function'
      ? state.hooks.getHoveredBox()
      : null;
    const inCreditContext = Boolean(
      sc.negativeMode ||
      sc.currentDocType === 'credit' ||
      (d.docStates && d.docStates.creditRequired && sc.headers.invoiceNo === getCreditInvoiceNo(d))
    );
    const autoPool = inCreditContext ? (d.creditBoxes || []) : (d.physicalBoxes || []);
    if (explicitBox && explicitBox.overageFlagged) {
      playError();
      notify('🚩 Case is flagged as OVERAGE (excess — unflag to scan).', 2800);
      return;
    }
    const nextBox = explicitBox || (hovered && !hovered.scanned && !hovered.overageFlagged
      ? hovered
      : autoPool.find((b) => !b.scanned && !b.overageFlagged));

    // Do not reveal or track whether all shipment cases have been scanned
    if (!nextBox) {
      playBeep();
      setScannerMessage('', 'info');
      return;
    }

    // Authentic 2D rule: Produce (notScannable: true, Depts 12/22) cannot be scanned by laser!
    if (nextBox.notScannable) {
      playError();
      sc.screen = 'scanning';
      sc.phase = 'scanning';
      sc.pendingBoxId = null;
      sc.activeField = 'productCode';
      sc.lastScannedLabel = '';
      if (nextBox.isCredit) sc.negativeMode = true;
      setScannerMessage('PLU ONLY: KEY ' + nextBox.code, 'err');
      return;
    }

    if (nextBox.scanned && !explicitBox) {
      playBeep();
      setScannerMessage('', 'info');
      return;
    }

    // Populate the clicked/scanned case's UPC and focus Units so the player keys the count -> [ENTER]
    sc.screen = 'scanning';
    sc.phase = 'scanning';
    sc.productCode = String(nextBox.code);
    sc.quantity = '';
    sc.activeField = 'quantity';
    sc.pendingBoxId = nextBox.boxId || nextBox.id || null;
    sc.lastScannedLabel = nextBox.name;
    if (nextBox.isCredit) {
      sc.negativeMode = true;
    }
    if (!explicitBox) {
      playBeep();
    }
    setScannerMessage('', 'info');
    if (typeof state.hooks.onReceiptUpdated === 'function') {
      state.hooks.onReceiptUpdated(d);
    }
  }

  function scanSpecificBox(box) {
    const d = getActiveDeliveryEnriched();
    if (!d || !isDeliveryCheckInReady(d)) {
      return { ok: false, reason: 'no_delivery' };
    }
    ensureScannerSession(d);
    const sc = state.scanner;

    if (!['scanning', 'list', 'totals', 'totals-edit', 'confirm-finalize', 'finalized'].includes(sc.screen)) {
      sc.screen = 'create';
      sc.phase = 'headers';
      playError();
      setScannerMessage('CREATE RECEIPT FIRST', 'warn');
      renderScannerUI();
      return { ok: false, reason: 'headers' };
    }
    if (sc.screen === 'confirm-finalize') {
      playError();
      setScannerMessage('CONFIRM OR F3 CANCEL', 'warn');
      renderScannerUI();
      return { ok: false, reason: 'confirm' };
    }
    if (sc.screen === 'finalized') {
      playBeep();
      setScannerMessage('', 'ok');
      renderScannerUI();
      return { ok: false, reason: 'complete' };
    }

    performPhysicalBoxScan(d, box);
    renderScannerUI();
    return {
      ok: true,
      loaded: Boolean(box && !box.notScannable),
      scanned: Boolean(box && box.scanned)
    };
  }

  function findKnownCatalogProduct(rawCode) {
    const clean = String(rawCode || '').trim();
    const stripped = clean.replace(/^0+/, '');
    const pool = (global.DSDCatalog && Array.isArray(global.DSDCatalog.allProducts))
      ? global.DSDCatalog.allProducts
      : [];
    return pool.find((p) => {
      if (!p || !p.code) return false;
      const pc = String(p.code).trim();
      const ps = pc.replace(/^0+/, '');
      return pc === clean || (stripped && ps === stripped);
    }) || null;
  }

  function syncBackstockInventoryEntriesFromRacks() {
    const sc = state.scanner;
    if (!sc.inventory) sc.inventory = createInitialInventoryState();
    const inv = sc.inventory;
    if (!global.BackstockRacks || typeof global.BackstockRacks.getInventoryRackCases !== 'function') return inv;
    const rackCases = global.BackstockRacks.getInventoryRackCases();
    const validIds = new Set(rackCases.filter((c) => c && c.inventoried).map((c) => c.id));
    inv.scannedEntries = (inv.scannedEntries || []).filter((e) => e && validIds.has(e.caseId));
    return inv;
  }

  function upsertInventoryEntry(res) {
    const inv = state.scanner.inventory;
    if (!inv || !res || !res.caseRec) return;
    const c = res.caseRec;
    const caseIds = Array.isArray(res.caseIds) && res.caseIds.length > 0 ? res.caseIds.slice() : [c.id];
    const idSet = new Set(caseIds);
    inv.scannedEntries = (inv.scannedEntries || []).filter((e) => {
      if (!e) return false;
      if (idSet.has(e.caseId)) return false;
      if (Array.isArray(e.caseIds) && e.caseIds.some((id) => idSet.has(id))) return false;
      return true;
    });
    inv.scannedEntries.push({
      caseId: c.id,
      caseIds: caseIds,
      auditGroupId: res.auditGroupId || null,
      code: String(c.code || ''),
      name: String(c.name || 'Backstock Item'),
      binLabel: String(res.binLabel || '--/--/--'),
      qty: Number(res.auditedQty) || 0,
      unitsPerCase: Number(res.expectedQty) || 1,
      mismatch: Boolean(res.mismatch)
    });
  }

  function scanBackstockCase(caseRec) {
    const sc = state.scanner;
    if (!sc.inventory) sc.inventory = createInitialInventoryState();
    const inv = sc.inventory;
    const racks = global.BackstockRacks;
    if (!racks) return { ok: false, reason: 'no_racks' };

    if (inv.finalized) {
      sc.screen = 'inventory-done';
      sc.phase = 'inventory-done';
      playError();
      setScannerMessage('AUDIT FINALIZED', 'warn');
      renderScannerUI();
      return { ok: false, reason: 'finalized' };
    }

    if (sc.screen !== 'inventory') {
      sc.screen = 'inventory';
      sc.phase = 'inventory';
    }

    if (!caseRec || !caseRec.placedOnRack || !caseRec.rackSlot) {
      playError();
      setScannerMessage('PUT ON STEEL FIRST', 'err');
      renderScannerUI();
      return { ok: false, reason: 'unplaced' };
    }

    if (!racks.isInventoryEligibleRack(caseRec.rackSlot.rackId)) {
      playError();
      setScannerMessage('DEPT 60: USE OPT 2', 'warn');
      renderScannerUI();
      return { ok: false, reason: 'wrong_zone' };
    }

    const binLabel = racks.formatSlotDesignation(caseRec.rackSlot);
    inv.binLabel = binLabel;
    inv.productCode = String(caseRec.code || '');
    inv.quantity = '';
    inv.pendingCaseId = caseRec.id;
    inv.pluTargetCaseId = null;
    inv.activeField = 'quantity';
    inv.lastScannedLabel = String(caseRec.name || 'Backstock Item');

    if (caseRec.inventoried) {
      const auditInfo = typeof racks.getCaseAuditInfo === 'function'
        ? racks.getCaseAuditInfo(caseRec)
        : { auditedQty: caseRec.auditedQty || 0 };
      playBeep();
      setScannerMessage('AUDITED ' + (auditInfo.auditedQty || 0) + 'u (RE-KEY)', 'warn');
    } else {
      setScannerMessage('', 'info');
    }

    renderScannerUI();
    return {
      ok: true,
      loaded: true,
      scanned: Boolean(caseRec.inventoried)
    };
  }

  function getSupplyCatalogProducts() {
    if (global.BackstockRacks && typeof global.BackstockRacks.getSupplyStockMap === 'function') {
      const map = global.BackstockRacks.getSupplyStockMap();
      if (map && Array.isArray(map.products) && map.products.length > 0) {
        return map.products;
      }
    }
    const catalog = global.DSDCatalog;
    if (!catalog) return [];
    const vendor = typeof catalog.getVendor === 'function' ? catalog.getVendor('601') : null;
    const raw = (vendor && Array.isArray(vendor.products)) ? vendor.products
      : (typeof catalog.getProductsForDepartment === 'function' ? catalog.getProductsForDepartment('60') : []);
    return raw.slice().sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''))).map((p) => ({
      code: String(p.code),
      name: p.name || 'Supply Item',
      size: p.size || 'medium',
      unitsPerCase: Number(p.unitsPerCase) || (p.size === 'large' ? 4 : (p.size === 'small' ? 12 : 8)),
      price: Number(p.price) || 0,
      type: p.type || 'ambient',
      deptNo: '60',
      vendorNo: '601'
    }));
  }

  function resolveSupplyCatalogProduct(rawCode, sup) {
    const products = getSupplyCatalogProducts();
    if (!products.length) return { product: null, idx: 0 };
    const clean = String(rawCode || '').trim();
    if (clean) {
      const exactIdx = products.findIndex((p) => String(p.code) === clean || (clean.length >= 4 && String(p.code).endsWith(clean)));
      if (exactIdx !== -1) {
        return { product: products[exactIdx], idx: exactIdx };
      }
      return { product: null, idx: Math.max(0, Math.min(products.length - 1, (sup && sup.selectedIdx) || 0)) };
    }
    const idx = Math.max(0, Math.min(products.length - 1, (sup && sup.selectedIdx) || 0));
    return { product: products[idx], idx: idx };
  }

  function scanSupplyBox(caseRec) {
    const sc = state.scanner;
    if (!sc.supply) sc.supply = createInitialSupplyState();
    const sup = sc.supply;
    if (sup.submittedToday) {
      sc.screen = 'supply-done';
      sc.phase = 'supply-done';
      playError();
      setScannerMessage('1 ORDER PER DAY', 'warn');
      renderScannerUI();
      return { ok: false, loaded: false, reason: 'submitted_today' };
    }
    const racks = global.BackstockRacks;
    const isSupply = Boolean(
      caseRec && (
        (racks && typeof racks.isSupplyCase === 'function' && racks.isSupplyCase(caseRec)) ||
        String(caseRec.deptNo || '') === '60' ||
        String(caseRec.vendorNo || '') === '601'
      )
    );
    if (!caseRec || !isSupply) {
      playError();
      setScannerMessage('NOT DEPT 60 SUPPLY', 'err');
      renderScannerUI();
      return { ok: false, loaded: false, reason: 'not_supply' };
    }

    if (!['supply', 'supply-cart'].includes(sc.screen)) {
      sc.screen = 'supply';
      sc.phase = 'supply';
    } else if (sc.screen === 'supply-cart') {
      sc.screen = 'supply';
      sc.phase = 'supply';
    }

    const res = resolveSupplyCatalogProduct(caseRec.code, sup);
    if (res.product) {
      sup.selectedIdx = res.idx;
      sup.skuInput = String(res.product.code);
    } else {
      sup.skuInput = String(caseRec.code || '');
    }
    sup.activeField = 'qty';
    sup.qtyInput = '';
    sup.negativeMode = false;
    setScannerMessage('LOAD SKU ' + sup.skuInput, 'ok');
    renderScannerUI();
    return { ok: true, loaded: true, code: sup.skuInput };
  }

  function consumePendingSupplyOrdersForNextShift() {
    const sc = state.scanner;
    if (!sc.supply || !Array.isArray(sc.supply.pendingOrders) || sc.supply.pendingOrders.length === 0) {
      return [];
    }
    const out = sc.supply.pendingOrders.map((item) => Object.assign({}, item));
    sc.supply.pendingOrders = [];
    return out;
  }

  function getPendingSupplyOrdersCount() {
    const sc = state.scanner;
    if (!sc.supply || !Array.isArray(sc.supply.pendingOrders)) return 0;
    return sc.supply.pendingOrders.reduce((s, it) => s + Math.max(0, Number(it.cases || it.qty) || 0), 0);
  }

  function handleSupplyScannerKey(action, val) {
    const sc = state.scanner;
    if (!sc.supply) sc.supply = createInitialSupplyState();
    const sup = sc.supply;
    const products = getSupplyCatalogProducts();
    const cart = Array.isArray(sup.cartItems) ? sup.cartItems : (sup.cartItems = []);

    if (sc.screen === 'supply-done' || sup.submittedToday) {
      if (sc.screen !== 'supply-done') {
        sc.screen = 'supply-done';
        sc.phase = 'supply-done';
        playError();
        setScannerMessage('1 ORDER PER DAY', 'warn');
      } else if (action === 'enter' || action === 'back') {
        sc.screen = 'home';
        sc.phase = 'home';
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    if (sc.screen === 'supply-confirm') {
      if (action === 'enter') {
        if (!Array.isArray(sup.pendingOrders)) sup.pendingOrders = [];
        let submittedCases = 0;
        let submittedSkus = 0;
        cart.forEach((ci) => {
          const addCases = Math.max(0, Math.round(Number(ci.cases) || 0));
          if (addCases <= 0) return;
          submittedCases += addCases;
          submittedSkus += 1;
          const existing = sup.pendingOrders.find((po) => String(po.code) === String(ci.code));
          if (existing) {
            existing.cases = (Number(existing.cases) || 0) + addCases;
            existing.qty = existing.cases;
          } else {
            sup.pendingOrders.push({
              code: String(ci.code),
              name: ci.name,
              cases: addCases,
              qty: addCases,
              size: ci.size || 'medium',
              unitsPerCase: Number(ci.unitsPerCase) || 8,
              price: Number(ci.price) || 0,
              type: ci.type || 'ambient'
            });
          }
        });
        const etaInfo = getNextSupplyEtaDateInfo();
        sup.submittedToday = true;
        sup.submittedEtaDate = etaInfo.mmddyyyy;
        sup.lastSubmittedCases = submittedCases;
        sup.lastSubmittedSkus = submittedSkus;
        sup.cartItems = [];
        sup.cartScroll = 0;
        sup.cartSelectedIdx = 0;
        sup.qtyInput = '';
        sup.negativeMode = false;
        sup.activeField = 'sku';
        sc.screen = 'supply-done';
        sc.phase = 'supply-done';
        setScannerMessage('ORDER QUEUED!', 'ok');
        playSuccess();
        notify('🚚 Dept 60 order (' + submittedCases + ' case' + (submittedCases === 1 ? '' : 's') + ') finalized for Vendor #601 delivery on ' + etaInfo.mmddyyyy + '.', 4000);
      } else if (action === 'back') {
        sc.screen = 'supply';
        sc.phase = 'supply';
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    if (sc.screen === 'supply-cart') {
      const curIdx = Math.max(0, Math.min(Math.max(0, cart.length - 1), sup.cartSelectedIdx || 0));
      sup.cartSelectedIdx = curIdx;

      if (action === 'back' || action === 'slash') {
        sc.screen = 'supply';
        sc.phase = 'supply';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'up') {
        if (cart.length > 0) {
          const nextIdx = Math.max(0, curIdx - 1);
          sup.cartSelectedIdx = nextIdx;
          if (nextIdx < (sup.cartScroll || 0)) sup.cartScroll = nextIdx;
        }
        playBeep();
      } else if (action === 'down') {
        if (cart.length > 0) {
          const nextIdx = Math.min(cart.length - 1, curIdx + 1);
          sup.cartSelectedIdx = nextIdx;
          if (nextIdx >= (sup.cartScroll || 0) + 5) sup.cartScroll = nextIdx - 4;
        }
        playBeep();
      } else if (action === 'minus') {
        if (cart.length > 0 && cart[curIdx]) {
          cart[curIdx].cases = Math.max(0, (Number(cart[curIdx].cases) || 0) - 1);
          if (cart[curIdx].cases <= 0) {
            const removed = cart.splice(curIdx, 1)[0];
            sup.cartSelectedIdx = Math.max(0, Math.min(curIdx, cart.length - 1));
            sup.cartScroll = Math.min(sup.cartScroll || 0, Math.max(0, cart.length - 5));
            setScannerMessage('DEL ' + (removed ? removed.code : 'ITEM'), 'warn');
          } else {
            setScannerMessage(cart[curIdx].code + ' -> ' + cart[curIdx].cases + 'cs', 'warn');
          }
        }
        playBeep();
      } else if (action === 'clear') {
        if (cart.length > 0) {
          const removed = cart.splice(curIdx, 1)[0];
          sup.cartSelectedIdx = Math.max(0, Math.min(curIdx, cart.length - 1));
          const maxScroll = Math.max(0, cart.length - 5);
          if ((sup.cartScroll || 0) > maxScroll) sup.cartScroll = maxScroll;
          setScannerMessage('DEL ' + (removed ? removed.code : 'ITEM'), 'warn');
        }
        playBeep();
      } else if (action === 'plus') {
        if (cart.length === 0) {
          playError();
          setScannerMessage('CART IS EMPTY', 'err');
        } else {
          sc.screen = 'supply-confirm';
          sc.phase = 'supply-confirm';
          setScannerMessage('', 'info');
          playBeep();
        }
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    // Screen: 'supply'
    if (action === 'back') {
      sup.negativeMode = false;
      sc.screen = 'home';
      sc.phase = 'home';
      setScannerMessage('', 'info');
      playBeep();
      renderScannerUI();
      return true;
    }

    if (action === 'minus') {
      sup.negativeMode = !sup.negativeMode;
      if (sup.negativeMode) sup.activeField = 'qty';
      playBeep();
      setScannerMessage(sup.negativeMode ? 'SUBTRACT CASES MODE' : '', sup.negativeMode ? 'warn' : 'info');
    } else if (action === 'slash') {
      sup.cartSelectedIdx = Math.max(0, cart.length - 1);
      sup.cartScroll = Math.max(0, cart.length - 5);
      sc.screen = 'supply-cart';
      sc.phase = 'supply-cart';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'plus') {
      if (cart.length === 0) {
        playError();
        setScannerMessage('ADD ITEMS TO CART', 'err');
      } else {
        sc.screen = 'supply-confirm';
        sc.phase = 'supply-confirm';
        setScannerMessage('', 'info');
        playBeep();
      }
    } else if (action === 'up' || action === 'down') {
      if (products.length > 0) {
        const delta = action === 'up' ? -1 : 1;
        sup.selectedIdx = ((sup.selectedIdx || 0) + delta + products.length) % products.length;
        const picked = products[sup.selectedIdx];
        sup.skuInput = picked ? String(picked.code) : '';
        sup.qtyInput = '';
        sup.negativeMode = false;
      }
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'left' || action === 'right') {
      sup.activeField = sup.activeField === 'sku' ? 'qty' : 'sku';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'num') {
      const digit = String(val);
      if (sup.activeField === 'sku') {
        if (sup.skuInput.length >= 4) {
          sup.skuInput = digit;
        } else {
          sup.skuInput += digit;
        }
        const match = resolveSupplyCatalogProduct(sup.skuInput, sup);
        if (match.product) {
          sup.selectedIdx = match.idx;
          if (sup.skuInput.length === 4) {
            sup.activeField = 'qty';
          }
        }
        playBeep();
      } else {
        if (sup.qtyInput.length < 3) {
          if (sup.qtyInput.length === 0 && digit === '0') {
            playBeep();
          } else {
            sup.qtyInput += digit;
            playBeep();
          }
        }
      }
      setScannerMessage('', 'info');
    } else if (action === 'clear') {
      if (sup.activeField === 'qty') {
        if (sup.qtyInput.length > 0) {
          sup.qtyInput = sup.qtyInput.slice(0, -1);
        } else if (sup.negativeMode) {
          sup.negativeMode = false;
        } else {
          sup.activeField = 'sku';
        }
      } else if (sup.skuInput.length > 0) {
        sup.skuInput = sup.skuInput.slice(0, -1);
      }
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'scan') {
      playBeep();
      setScannerMessage('CLICK DEPT 60 BOX', 'info');
    } else if (action === 'enter') {
      if (sup.activeField === 'sku') {
        if (!sup.skuInput && products[sup.selectedIdx]) {
          sup.skuInput = String(products[sup.selectedIdx].code);
        }
        const match = resolveSupplyCatalogProduct(sup.skuInput, sup);
        if (!match.product) {
          playError();
          setScannerMessage('UNKNOWN SKU (6001-10)', 'err');
          renderScannerUI();
          return true;
        }
        sup.selectedIdx = match.idx;
        sup.skuInput = String(match.product.code);
        sup.activeField = 'qty';
        sup.qtyInput = '';
        playBeep();
        setScannerMessage('', 'info');
      } else {
        const match = resolveSupplyCatalogProduct(sup.skuInput, sup);
        if (!match.product) {
          sup.activeField = 'sku';
          playError();
          setScannerMessage('SELECT SUPPLY SKU', 'err');
          renderScannerUI();
          return true;
        }
        const rawQty = parseInt(sup.qtyInput, 10);
        if (!rawQty || rawQty <= 0) {
          playError();
          setScannerMessage('ENTER CASES > 0', 'err');
          renderScannerUI();
          return true;
        }
        const prod = match.product;
        const deltaCases = sup.negativeMode ? -rawQty : rawQty;
        const existingIdx = cart.findIndex((ci) => String(ci.code) === String(prod.code));
        if (deltaCases < 0) {
          if (existingIdx === -1) {
            playError();
            setScannerMessage('NOT IN CART YET', 'err');
            renderScannerUI();
            return true;
          }
          const nextCases = (Number(cart[existingIdx].cases) || 0) + deltaCases;
          if (nextCases <= 0) {
            cart.splice(existingIdx, 1);
            setScannerMessage('RMV ' + prod.code + ' FROM CART', 'warn');
          } else {
            cart[existingIdx].cases = nextCases;
            setScannerMessage('ADJ ' + prod.code + ' -> ' + nextCases + 'cs', 'warn');
          }
          playBeep();
        } else {
          if (existingIdx !== -1) {
            cart[existingIdx].cases = Math.min(99, (Number(cart[existingIdx].cases) || 0) + deltaCases);
            setScannerMessage('+' + deltaCases + 'cs ' + prod.code + ' (' + cart[existingIdx].cases + ')', 'ok');
          } else {
            cart.push({
              code: String(prod.code),
              name: prod.name,
              cases: Math.min(99, deltaCases),
              size: prod.size || 'medium',
              unitsPerCase: Number(prod.unitsPerCase) || 8,
              price: Number(prod.price) || 0,
              type: prod.type || 'ambient'
            });
            setScannerMessage('ADD ' + deltaCases + 'cs ' + prod.code, 'ok');
          }
          playSuccess();
        }
        sup.qtyInput = '';
        sup.negativeMode = false;
        sup.activeField = 'sku';
      }
    } else {
      playBeep();
    }

    renderScannerUI();
    return true;
  }

  function scanClaimsItem(itemRec) {
    const sc = state.scanner;
    if (!sc.damage) sc.damage = createInitialDamageState();
    const dmg = sc.damage;
    const ct = global.ClaimsTotes;

    if (!itemRec || itemRec.claimed) {
      playError();
      setScannerMessage('ITEM ALREADY CLAIMED', 'err');
      renderScannerUI();
      return { ok: false, loaded: false, reason: 'invalid_item' };
    }

    sc.screen = 'damage-cond';
    sc.phase = 'damage-cond';
    dmg.pendingItemId = itemRec.id;
    dmg.selectedConditionIdx = 0;
    dmg.selectedConditionKey = 'leaking';
    dmg.computedDisposition = ct && typeof ct.computeDispositionForItem === 'function'
      ? ct.computeDispositionForItem(itemRec, 'leaking')
      : 'trash';
    dmg.isVendorCredit = ct && typeof ct.isItemVendorCreditEligible === 'function'
      ? ct.isItemVendorCreditEligible(itemRec)
      : false;
    setScannerMessage('SCANNED ' + String(itemRec.code || '').slice(0, 8), 'ok');
    renderScannerUI();
    return { ok: true, loaded: true, itemId: itemRec.id };
  }

  function handleDamageScannerKey(action, val) {
    const sc = state.scanner;
    if (!sc.damage) sc.damage = createInitialDamageState();
    const dmg = sc.damage;
    const ct = global.ClaimsTotes;
    const condList = (ct && Array.isArray(ct.DAMAGE_CONDITIONS) && ct.DAMAGE_CONDITIONS.length > 0)
      ? ct.DAMAGE_CONDITIONS
      : [
        { key: 'leaking', label: 'Leaking', short: 'Leaking' },
        { key: 'dented', label: 'Dented', short: 'Dented' },
        { key: 'wet_saturated', label: 'Wet/Saturated', short: 'Wet/Saturated' },
        { key: 'missing_label', label: 'Missing Label/Nutrition Info', short: 'Missing Label' }
      ];

    const activeItem = (ct && typeof ct.findItemById === 'function' && dmg.pendingItemId)
      ? ct.findItemById(dmg.pendingItemId)
      : null;

    if (sc.screen === 'damage-ready') {
      if (action === 'back') {
        sc.screen = 'home';
        sc.phase = 'home';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'enter') {
        dmg.pendingItemId = null;
        sc.screen = 'damage';
        sc.phase = 'damage';
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    if (sc.screen === 'damage-disp') {
      if (!activeItem || activeItem.claimed) {
        sc.screen = 'damage';
        sc.phase = 'damage';
        dmg.pendingItemId = null;
        setScannerMessage('ITEM NOT FOUND', 'err');
        playError();
        renderScannerUI();
        return true;
      }
      if (action === 'back') {
        sc.screen = 'damage-cond';
        sc.phase = 'damage-cond';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'enter') {
        const res = ct && typeof ct.confirmItemDisposition === 'function'
          ? ct.confirmItemDisposition(activeItem, dmg.selectedConditionKey)
          : null;
        if (res) {
          dmg.computedDisposition = res.disposition;
          dmg.isVendorCredit = res.isVendorCredit;
        }
        sc.screen = 'damage-ready';
        sc.phase = 'damage-ready';
        setScannerMessage('DISPOSITION COMPLETE', 'ok');
        playSuccess();
        const destTxt = res ? res.dispositionLabel : 'RECEPTACLE';
        notify('✓ Claims confirmed: ' + activeItem.name + ' -> Place in ' + destTxt + '.', 3800);
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    if (sc.screen === 'damage-cond') {
      if (!activeItem || activeItem.claimed) {
        sc.screen = 'damage';
        sc.phase = 'damage';
        dmg.pendingItemId = null;
        setScannerMessage('SCAN ITEM FIRST', 'err');
        playError();
        renderScannerUI();
        return true;
      }

      const selectCondition = (idx) => {
        const safeIdx = Math.max(0, Math.min(condList.length - 1, idx));
        const condObj = condList[safeIdx];
        dmg.selectedConditionIdx = safeIdx;
        dmg.selectedConditionKey = condObj.key;
        dmg.isVendorCredit = ct && typeof ct.isItemVendorCreditEligible === 'function'
          ? ct.isItemVendorCreditEligible(activeItem)
          : false;
        dmg.computedDisposition = ct && typeof ct.computeDispositionForItem === 'function'
          ? ct.computeDispositionForItem(activeItem, condObj.key)
          : 'trash';
        sc.screen = 'damage-disp';
        sc.phase = 'damage-disp';
        setScannerMessage('', 'info');
        playBeep();
      };

      if (action === 'back') {
        sc.screen = 'damage';
        sc.phase = 'damage';
        dmg.pendingItemId = null;
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'up') {
        dmg.selectedConditionIdx = ((dmg.selectedConditionIdx || 0) - 1 + condList.length) % condList.length;
        dmg.selectedConditionKey = condList[dmg.selectedConditionIdx].key;
        playBeep();
      } else if (action === 'down') {
        dmg.selectedConditionIdx = ((dmg.selectedConditionIdx || 0) + 1) % condList.length;
        dmg.selectedConditionKey = condList[dmg.selectedConditionIdx].key;
        playBeep();
      } else if (action === 'num') {
        const pickedIdx = parseInt(String(val), 10) - 1;
        if (pickedIdx >= 0 && pickedIdx < condList.length) {
          selectCondition(pickedIdx);
        } else {
          playBeep();
        }
      } else if (action === 'enter') {
        selectCondition(dmg.selectedConditionIdx || 0);
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    // Screen: 'damage'
    if (action === 'back') {
      sc.screen = 'home';
      sc.phase = 'home';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'scan') {
      playBeep();
      setScannerMessage('CLICK ITEM IN TOTE', 'info');
    } else {
      playBeep();
    }
    renderScannerUI();
    return true;
  }

  function handleInventoryScannerKey(action, val) {
    const sc = state.scanner;
    if (!sc.inventory) sc.inventory = createInitialInventoryState();
    const inv = syncBackstockInventoryEntriesFromRacks();
    const racks = global.BackstockRacks;

    if (sc.screen === 'inventory-done') {
      if (action === 'enter' || action === 'back') {
        sc.screen = 'home';
        sc.phase = 'home';
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    if (sc.screen === 'inventory-confirm') {
      if (action === 'enter') {
        const summary = racks && typeof racks.finalizeInventoryAudit === 'function'
          ? racks.finalizeInventoryAudit()
          : { totalPlaced: 0, auditedCases: inv.scannedEntries.length, totalAuditedUnits: 0 };
        inv.finalized = true;
        inv.auditSummary = summary;
        if (getStats()) {
          getStats().setFlag('backstockInventoried', true);
        }
        sc.screen = 'inventory-done';
        sc.phase = 'inventory-done';
        setScannerMessage('AUDIT LOGGED!', 'ok');
        playSuccess();
        notify('📋 Daily Backroom Inventory finalized (' + (summary.auditedCases || 0) + ' case' + (summary.auditedCases === 1 ? '' : 's') + ' audited).', 3600);
      } else if (action === 'back') {
        sc.screen = 'inventory';
        sc.phase = 'inventory';
        setScannerMessage('', 'info');
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    if (sc.screen === 'inventory-list') {
      const entries = inv.scannedEntries || [];
      const curIdx = Math.max(0, Math.min(Math.max(0, entries.length - 1), inv.listSelectedIdx || 0));
      inv.listSelectedIdx = curIdx;

      if (action === 'back' || action === 'slash') {
        sc.screen = 'inventory';
        sc.phase = 'inventory';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'up') {
        if (entries.length > 0) {
          const nextIdx = Math.max(0, curIdx - 1);
          inv.listSelectedIdx = nextIdx;
          if (nextIdx < (inv.listScroll || 0)) inv.listScroll = nextIdx;
        }
        playBeep();
      } else if (action === 'down') {
        if (entries.length > 0) {
          const nextIdx = Math.min(entries.length - 1, curIdx + 1);
          inv.listSelectedIdx = nextIdx;
          if (nextIdx >= (inv.listScroll || 0) + 5) inv.listScroll = nextIdx - 4;
        }
        playBeep();
      } else if (action === 'clear') {
        if (entries.length > 0) {
          const removed = entries.splice(curIdx, 1)[0];
          if (removed && racks && typeof racks.unmarkCaseInventoried === 'function') {
            racks.unmarkCaseInventoried(removed.caseId, true);
          }
          inv.listSelectedIdx = Math.max(0, Math.min(curIdx, entries.length - 1));
          const maxScroll = Math.max(0, entries.length - 5);
          if ((inv.listScroll || 0) > maxScroll) inv.listScroll = maxScroll;
          setScannerMessage('DEL ' + (removed ? removed.code : 'ENTRY'), 'warn');
        }
        playBeep();
      } else {
        playBeep();
      }
      renderScannerUI();
      return true;
    }

    // Screen: 'inventory'
    if (action === 'back') {
      inv.negativeMode = false;
      sc.screen = 'home';
      sc.phase = 'home';
      setScannerMessage('', 'info');
      playBeep();
      renderScannerUI();
      return true;
    }

    if (inv.finalized) {
      sc.screen = 'inventory-done';
      sc.phase = 'inventory-done';
      playBeep();
      renderScannerUI();
      return true;
    }

    if (action === 'minus') {
      inv.negativeMode = !inv.negativeMode;
      playBeep();
      setScannerMessage(inv.negativeMode ? 'NEGATIVE ADJ MODE' : '', inv.negativeMode ? 'warn' : 'info');
    } else if (action === 'slash') {
      inv.listSelectedIdx = Math.max(0, (inv.scannedEntries || []).length - 1);
      inv.listScroll = Math.max(0, (inv.scannedEntries || []).length - 5);
      sc.screen = 'inventory-list';
      sc.phase = 'inventory-list';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'plus') {
      const placedCases = racks && typeof racks.getInventoryRackCases === 'function'
        ? racks.getInventoryRackCases()
        : [];
      if (placedCases.length > 0 && inv.scannedEntries.length === 0) {
        playError();
        setScannerMessage('SCAN CASES FIRST', 'err');
      } else {
        sc.screen = 'inventory-confirm';
        sc.phase = 'inventory-confirm';
        setScannerMessage('', 'info');
        playBeep();
      }
    } else if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      inv.activeField = inv.activeField === 'productCode' ? 'quantity' : 'productCode';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'num') {
      const digit = String(val);
      if (inv.activeField === 'productCode') {
        if (inv.productCode.length < 14) {
          inv.productCode += digit;
          inv.pendingCaseId = null;
          if (!inv.pluTargetCaseId) inv.binLabel = '';
          inv.lastScannedLabel = '';
          playBeep();
        }
      } else {
        if (inv.quantity.length < 4) {
          if (inv.quantity.length === 0 && digit === '0') {
            playBeep();
          } else {
            inv.quantity += digit;
            playBeep();
          }
        }
      }
      setScannerMessage('', 'info');
    } else if (action === 'clear') {
      if (inv.activeField === 'quantity') {
        if (inv.quantity.length > 0) inv.quantity = inv.quantity.slice(0, -1);
      } else if (inv.productCode.length > 0) {
        inv.productCode = inv.productCode.slice(0, -1);
        inv.pendingCaseId = null;
        if (inv.productCode.length === 0) {
          inv.pluTargetCaseId = null;
          inv.binLabel = '';
          inv.lastScannedLabel = '';
        }
      }
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'scan') {
      playBeep();
      setScannerMessage('CLICK SHELF CASE', 'info');
    } else if (action === 'enter') {
      if (inv.activeField === 'productCode') {
        if (!inv.productCode) {
          playError();
          setScannerMessage('KEY UPC/PLU CODE', 'err');
          renderScannerUI();
          return true;
        }
        const preferredId = inv.pendingCaseId || inv.pluTargetCaseId;
        const foundCase = racks && typeof racks.findInventoryCaseForInput === 'function'
          ? racks.findInventoryCaseForInput(inv.productCode, preferredId, Boolean(inv.negativeMode))
          : null;
        if (!foundCase) {
          const catProd = findKnownCatalogProduct(inv.productCode);
          playError();
          if (catProd) {
            setScannerMessage('NOT ON STEEL RACKS', 'err');
          } else {
            setScannerMessage('UNKNOWN UPC: ' + inv.productCode.slice(0, 8), 'err');
          }
          renderScannerUI();
          return true;
        }
        inv.pendingCaseId = foundCase.id;
        inv.pluTargetCaseId = null;
        inv.productCode = String(foundCase.code);
        inv.binLabel = racks.formatSlotDesignation(foundCase.rackSlot);
        inv.lastScannedLabel = String(foundCase.name || 'Backstock Item');
        inv.activeField = 'quantity';
        inv.quantity = '';
        playBeep();
        if (foundCase.inventoried) {
          const auditInfo = typeof racks.getCaseAuditInfo === 'function'
            ? racks.getCaseAuditInfo(foundCase)
            : { auditedQty: foundCase.auditedQty || 0 };
          setScannerMessage('AUDITED ' + (auditInfo.auditedQty || 0) + 'u (RE-KEY)', 'warn');
        } else {
          setScannerMessage('', 'info');
        }
      } else {
        const rawQty = parseInt(inv.quantity, 10);
        if (!rawQty || rawQty <= 0) {
          playError();
          setScannerMessage('ENTER UNITS > 0', 'err');
          renderScannerUI();
          return true;
        }
        const signedQty = inv.negativeMode ? -rawQty : rawQty;
        const preferredId = inv.pendingCaseId || inv.pluTargetCaseId;
        const targetCase = racks && typeof racks.findInventoryCaseForInput === 'function'
          ? racks.findInventoryCaseForInput(inv.productCode, preferredId, Boolean(inv.negativeMode))
          : null;
        if (!targetCase) {
          inv.activeField = 'productCode';
          playError();
          setScannerMessage('SCAN/KEY CASE FIRST', 'err');
          renderScannerUI();
          return true;
        }
        const res = racks.markCaseInventoried(targetCase.id, signedQty, true);
        if (!res || !res.ok) {
          playError();
          setScannerMessage((res && res.error) || 'AUDIT FAILED', 'err');
          renderScannerUI();
          return true;
        }
        if (res.removed) {
          syncBackstockInventoryEntriesFromRacks();
        } else {
          upsertInventoryEntry(res);
        }
        inv.binLabel = res.binLabel;
        inv.lastScannedLabel = '';
        inv.productCode = '';
        inv.quantity = '';
        inv.negativeMode = false;
        inv.pendingCaseId = null;
        inv.pluTargetCaseId = null;
        inv.activeField = 'productCode';
        if (res.removed) {
          playBeep();
          setScannerMessage('ZEROED @ ' + res.binLabel, 'warn');
        } else {
          playSuccess();
          setScannerMessage(
            signedQty < 0 ? ('ADJ ' + signedQty + 'u -> ' + res.auditedQty + 'u') : ('OK ' + res.auditedQty + 'u @ ' + res.binLabel),
            'ok'
          );
        }
      }
    } else {
      playBeep();
    }

    renderScannerUI();
    return true;
  }

  function getBackstockInventorySummary() {
    const racks = global.BackstockRacks;
    const rackSummary = racks && typeof racks.getInventorySummary === 'function'
      ? racks.getInventorySummary()
      : { totalPlaced: 0, auditedCases: 0, missedPlaced: 0, mismatchedQty: 0, unplacedBackstock: 0, totalExpectedUnits: 0, totalAuditedUnits: 0, finalized: false };
    const inv = state.scanner.inventory;
    return Object.assign({}, rackSummary, {
      finalized: Boolean((inv && inv.finalized) || rackSummary.finalized),
      scannedEntryCount: inv && Array.isArray(inv.scannedEntries) ? inv.scannedEntries.length : rackSummary.auditedCases
    });
  }

  function commitManualLineItem(d) {
    const sc = state.scanner;
    const prod = lookupProductForDelivery(d, sc.productCode);
    if (!prod) {
      playError();
      setScannerMessage('INVALID UPC: ' + sc.productCode.slice(0, 8), 'err');
      return;
    }

    const rawQty = parseInt(sc.quantity, 10);
    if (!rawQty || rawQty <= 0) {
      playError();
      setScannerMessage('ENTER UNITS > 0', 'err');
      return;
    }

    const signedQty = sc.negativeMode ? -rawQty : rawQty;
    addScannedEntry(prod.code, prod.name, signedQty, prod.price, prod.notScannable, prod.type);

    const netItem = sc.scannedItems.find((it) => it.code === String(prod.code));
    const netQty = netItem ? netItem.qty : 0;
    const isCreditHeader = Boolean(d && d.docStates && d.docStates.creditRequired && sc.headers.invoiceNo === getCreditInvoiceNo(d));
    const isCreditEntry = sc.currentDocType === 'credit' || isCreditHeader || netQty < 0;
    if (d) {
      if (isCreditEntry) {
        const committedCreditOther = getCommittedCreditQtyForCode(d, prod.code, sc.activeReceiptNo);
        syncCreditBoxesForCode(d, prod.code, committedCreditOther + Math.abs(Math.min(0, netQty)), sc.pendingBoxId);
      } else {
        const committedOther = getCommittedInvoiceQtyForCode(d, prod.code, sc.activeReceiptNo);
        syncScannedBoxesForCode(d, prod.code, committedOther + Math.max(0, netQty), sc.pendingBoxId);
      }
    }

    // If working on a receipt that still has any positive quantity, return keypad to (+) after a negative correction
    if (sc.negativeMode && sc.scannedItems.some((it) => it.qty > 0)) {
      sc.negativeMode = false;
    }

    sc.lastScannedLabel = '';
    sc.productCode = '';
    sc.quantity = '';
    sc.pendingBoxId = null;
    sc.activeField = 'productCode';
    if (sc.activeReceiptNo) {
      syncReceiptItems(sc.activeReceiptNo, sc.scannedItems);
    }
    playSuccess();
    setScannerMessage('', 'info');

    if (d && typeof state.hooks.onReceiptUpdated === 'function') {
      state.hooks.onReceiptUpdated(d);
    }
  }

  function handleDiscrepancyKey(d) {
    if (!d.hasDiscrepancy) {
      playBeep();
      notify('📋 No physical shortage or overage on this shipment.', 3200);
      return 'No discrepancy.';
    }

    const loggedMsg = syncDiscrepancyFlagsAndTotals(d, 'both');

    playSuccess();
    notify('📋 ' + (loggedMsg || 'Discrepancy logged on paperwork'), 4000);
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return loggedMsg || 'DISCREPANCY LOGGED';
  }

  function evaluateListAccuracy(enteredList, expectedList, expectNegative) {
    if (enteredList.length !== expectedList.length) return false;
    for (let i = 0; i < expectedList.length; i++) {
      const exp = expectedList[i];
      const found = enteredList.find((it) => it.code === exp.code);
      if (!found) return false;
      const expectedSignedQty = expectNegative ? -Math.abs(exp.qty) : Math.abs(exp.qty);
      if (found.qty !== expectedSignedQty) return false;
    }
    return true;
  }

  function finalizeScannerDocument(d) {
    const sc = state.scanner;
    const stats = getStats();
    const finalItems = sc.scannedItems.filter((it) => it.qty !== 0);

    if (finalItems.length === 0) {
      playError();
      setScannerMessage('SCAN ITEMS FIRST', 'err');
      return;
    }

    const scannedUnits = finalItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const scannedCost = Number(finalItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2));

    // Standalone / Night Drop / Manual receipt mode (no live delivery attached)
    if (!d) {
      let rec = sc.activeReceiptNo ? findReceipt(sc.activeReceiptNo) : null;
      if (rec && !rec.voided) {
        syncReceiptItems(rec.receiptNumber, finalItems, { finalized: true });
      } else {
        const isCred = finalItems.every((it) => it.qty < 0);
        rec = createReceipt({
          vendorNo: sc.headers.vendorNo,
          deptNo: sc.headers.deptNo,
          invoiceNo: sc.headers.invoiceNo,
          expectedUnits: sc.expectedUnits,
          expectedCost: sc.expectedCost,
          type: isCred ? 'credit' : 'invoice',
          source: 'scanner',
          items: finalItems,
          finalized: true
        });
      }

      if (rec.items.length > 0) {
        resolveNightDropByInvoiceNo(rec.invoiceNo, rec.receiptNumber);
        syncActiveDeliveryLinkForReceipt(rec);
      }

      sc.finalizedSnapshot = {
        receiptNumber: rec.receiptNumber,
        deptNo: rec.deptNo,
        vendorNo: rec.vendorNo,
        invoiceNo: rec.invoiceNo,
        units: scannedUnits,
        cost: scannedCost
      };
      sc.activeReceiptNo = null;
      sc.standaloneMode = false;
      sc.scannedItems = [];
      sc.scannedCredits = [];
      sc.productCode = '';
      sc.quantity = '';
      sc.pendingBoxId = null;
      sc.negativeMode = false;
      sc.finalizedPrinted = false;
      sc.screen = 'finalized';
      sc.phase = 'complete';
      playSuccess();
      setScannerMessage('', 'ok');
      notify('✅ Receipt #' + rec.receiptNumber + ' finalized! Record Receipt # on paperwork.', 4500);
      return;
    }

    // A credit receipt is simply a receipt whose line items all have negative quantities
    const isCreditReceipt = finalItems.every((it) => it.qty < 0);
    const trueInvoiceExpected = (d.invoiceItems || []).map((it) => {
      const billed = it.billedQty !== undefined ? Number(it.billedQty) : Number(it.qty);
      const accepted = Math.min(billed, Number(it.physicalQty || 0));
      return { code: it.code, qty: accepted, price: Number(it.price || 0) };
    }).filter((it) => it.qty > 0);
    const trueUnits = trueInvoiceExpected.reduce((s, it) => s + it.qty, 0);
    const trueCost = Number((trueInvoiceExpected.reduce((s, it) => s + it.qty * it.price, 0)).toFixed(2));
    const totalsOk = isCreditReceipt || (
      Number(sc.expectedUnits || 0) === trueUnits &&
      (sc.expectedCost === null || sc.expectedCost === undefined || Math.abs(Number(sc.expectedCost) - trueCost) <= 0.02)
    );
    const accurate = isCreditReceipt
      ? evaluateListAccuracy(finalItems, d.creditItems || [], true)
      : (evaluateListAccuracy(finalItems, trueInvoiceExpected, false) && totalsOk);

    let rec = sc.activeReceiptNo ? findReceipt(sc.activeReceiptNo) : null;
    if (rec && !rec.voided) {
      syncReceiptItems(rec.receiptNumber, finalItems, {
        outOfTemp: d.outOfTemp,
        accurate: accurate,
        finalized: true
      });
    } else {
      rec = createReceipt({
        vendorNo: sc.headers.vendorNo,
        deptNo: sc.headers.deptNo,
        invoiceNo: sc.headers.invoiceNo,
        expectedUnits: sc.expectedUnits,
        expectedCost: sc.expectedCost,
        type: isCreditReceipt ? 'credit' : 'invoice',
        source: 'scanner',
        items: finalItems,
        finalized: true,
        outOfTemp: d.outOfTemp,
        accurate: accurate,
        deliveryId: d.id
      });
    }

    if (rec.items.length > 0) {
      resolveNightDropByInvoiceNo(rec.invoiceNo, rec.receiptNumber);
    }

    const expectedDocInvNo = isCreditReceipt
      ? (d.docStates && d.docStates.creditRequired ? getCreditInvoiceNo(d) : d.invoiceNo)
      : d.invoiceNo;
    const headerMatchesDelivery = (rec.vendorNo === d.vendorNo && rec.deptNo === d.deptNo && rec.invoiceNo === expectedDocInvNo);
    if (headerMatchesDelivery) {
      if (isCreditReceipt) {
        d.docStates.creditCreated = true;
        d.lastCreditReceiptNumber = rec.receiptNumber;
      } else {
        d.docStates.invoiceCreated = true;
        d.lastReceiptNumber = rec.receiptNumber;
      }
    }

    reconcileDeliveryDocStates(d);
    reconcileDeliveryBoxesFromReceipts(d);

    const bothDone = (!d.docStates.invoiceRequired || d.docStates.invoiceCreated) &&
      (!d.docStates.creditRequired || d.docStates.creditCreated);

    sc.finalizedSnapshot = {
      receiptNumber: rec.receiptNumber,
      deptNo: rec.deptNo,
      vendorNo: rec.vendorNo,
      invoiceNo: rec.invoiceNo,
      units: scannedUnits,
      cost: scannedCost
    };
    sc.activeReceiptNo = null;
    sc.standaloneMode = false;
    sc.scannedItems = [];
    sc.scannedCredits = [];
    sc.productCode = '';
    sc.quantity = '';
    sc.pendingBoxId = null;
    sc.negativeMode = false;
    sc.finalizedPrinted = false;
    sc.screen = 'finalized';
    sc.phase = 'complete';

    const latestNo = rec.receiptNumber;

    if (!headerMatchesDelivery) {
      playError();
      setScannerMessage('WRONG HEADER — EDIT IN [2]', 'warn');
      notify('⚠️ Receipt #' + latestNo + ' saved, but header differs from paperwork! Edit Receipt Header in Terminal [2].', 5000);
    } else if (!bothDone) {
      playSuccess();
      const needsInvoice = Boolean(d.docStates.invoiceRequired && !d.docStates.invoiceCreated);
      const remainingLabel = needsInvoice ? 'Invoice' : 'Credit';
      setScannerMessage('', 'ok');
      notify('✅ Receipt #' + latestNo + ' finalized! Press ENTER to continue for remaining ' + remainingLabel + ' receipt.', 4500);
    } else {
      playSuccess();
      d.receiptCreated = true;
      d.receiptNumber = d.lastReceiptNumber || latestNo;
      setScannerMessage('', 'ok');
      notify('✅ Digital Receipt #' + latestNo + ' finalized! Record Receipt # and Sign on Paperwork.', 4500);
    }
    const switchTab = headerMatchesDelivery ? getPendingCounterpartTab(d, isCreditReceipt) : null;
    if (switchTab) d.preferredInvoiceTab = switchTab;
    if (typeof state.hooks.onReceiptUpdated === 'function') {
      state.hooks.onReceiptUpdated(d, switchTab ? { switchInvoiceTab: switchTab } : undefined);
    }
  }

  function refuseActiveDelivery(d) {
    const stats = getStats();
    const validTempFail = Boolean(d.outOfTemp && (!d.requiresTempCheck || d.tempChecked));
    if (!validTempFail) {
      playError();
      if (stats) stats.increment('refusedGoodMerch', 1);
      const reason = (d.requiresTempCheck && !d.tempChecked)
        ? 'Refused cold delivery without running Temp Probe!'
        : 'Refused delivery when temp check did not fail!';
      notify('❌ PENALTY (-300 pts): ' + reason, 5000);
    } else {
      playSuccess();
      if (stats) {
        if (d.type === 'vendor_truck' || d.type === 'truck' || (d.role && d.role.toUpperCase().includes('TRUCK'))) {
          stats.increment('trucksProcessed', 1);
        } else {
          stats.increment('vendorsProcessed', 1);
        }
      }
      notify('🛡️ GOOD CATCH! Refused failed-temp shipment. No penalty!', 4500);
    }

    d.receiptCreated = false;
    d.refused = true;
    resetScannerSession(null);

    if (typeof state.hooks.onDeliveryRefused === 'function') {
      state.hooks.onDeliveryRefused(d);
    }
    if (typeof state.hooks.onCloseScanner === 'function') {
      state.hooks.onCloseScanner();
    }
  }

  // =========================================================================
  // SCANNER DOM RENDERER
  // =========================================================================

  let lastScannerBodyHtml = '';

  function formatLcdCell(val, width, cursorActive) {
    const raw = String(val || '');
    const cursorHtml = cursorActive ? '<span class="lcd-cursor">_</span>' : '';
    const visLen = raw.length + (cursorActive ? 1 : 0);
    const pad = ' '.repeat(Math.max(0, width - visLen));
    return escapeHtml(raw) + cursorHtml + pad;
  }

  function computeScannerTotalsSummary(sc) {
    const items = sc.scannedItems || [];
    const scUnits = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const scCost = Number(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2));
    const isCreditByItems = items.length > 0 && items.every((it) => (Number(it.qty) || 0) < 0);
    const rawExpUnits = Math.abs(Number(sc.expectedUnits) || 0);
    const dispExpUnits = (isCreditByItems && rawExpUnits > 0) ? -rawExpUnits : rawExpUnits;
    const rawExpCost = (sc.expectedCost !== null && sc.expectedCost !== undefined)
      ? Math.abs(Number(sc.expectedCost) || 0)
      : null;
    const signPrefix = isCreditByItems ? '-' : '';
    const invCostStr = rawExpCost !== null
      ? (signPrefix + rawExpCost.toFixed(2))
      : (signPrefix + '0.00');
    const scCostStr = (isCreditByItems && scCost === 0) ? '-0.00' : scCost.toFixed(2);
    return {
      scUnits,
      scCost,
      isCreditByItems,
      rawExpUnits,
      dispExpUnits,
      rawExpCost,
      invCostStr,
      scCostStr
    };
  }

  function renderComingSoonScreen(title, lineA, lineB, lineC, line2Notice) {
    return (
      '<div class="lcd-scr-line">' + escapeHtml(title.slice(0, 20)) + '</div>' +
      line2Notice +
      '<div class="lcd-scr-line">' + escapeHtml(lineA.slice(0, 20)) + '</div>' +
      '<div class="lcd-scr-line">' + escapeHtml(lineB.slice(0, 20)) + '</div>' +
      '<div class="lcd-scr-line">' + escapeHtml(lineC.slice(0, 20)) + '</div>' +
      '<div class="lcd-scr-line notice">  [ COMING SOON ]   </div>' +
      '<div class="lcd-scr-line"> </div>' +
      '<div class="lcd-scr-line"> </div>' +
      '<div class="lcd-scr-line">F3 Back</div>'
    );
  }

  function renderScannerUI() {
    const ctx = getActiveScannerContext();
    const d = ctx.delivery;

    const dsdView = document.getElementById('lcd-dsd-view');
    const bodyEl = document.getElementById('lcd-dsd-body');
    if (!dsdView || !bodyEl) return;

    ensureScannerSession(d);
    dsdView.style.display = 'flex';

    const sc = state.scanner;
    const noticeText = sc.statusMessage ? sc.statusMessage.slice(0, 20) : '';
    const line2Notice = noticeText
      ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
      : '<div class="lcd-scr-line"> </div>';

    let linesHtml = '';

    if (sc.screen === 'home') {
      const homeOptions = [
        '1. CREATE RECEIPT',
        '2. SUPPLY ORDERS',
        '3. BACKROOM INVENTORY',
        '4. MARKDOWN CLAIMS'
      ];
      const selIdx = Math.max(0, Math.min(homeOptions.length - 1, sc.homeSelectedIdx || 0));
      sc.homeSelectedIdx = selIdx;
      const optionRows = homeOptions.map((label, idx) => {
        const isSel = idx === selIdx;
        return '<div class="lcd-scr-line' + (isSel ? ' notice' : '') + '">' + escapeHtml(label.slice(0, 24)) + '</div>';
      }).join('');
      linesHtml =
        '<div class="lcd-scr-line">HANDHELD TERMINAL</div>' +
        line2Notice +
        optionRows +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">1-4 or Up/Dn + ENT</div>';
    } else if (sc.screen === 'supply') {
      if (!sc.supply) sc.supply = createInitialSupplyState();
      const sup = sc.supply;
      const products = getSupplyCatalogProducts();
      const match = resolveSupplyCatalogProduct(sup.skuInput, sup);
      const selProd = match.product || products[sup.selectedIdx] || null;
      const stockMap = (global.BackstockRacks && typeof global.BackstockRacks.getSupplyStockMap === 'function')
        ? global.BackstockRacks.getSupplyStockMap()
        : null;
      const selCode = selProd ? String(selProd.code) : String(sup.skuInput || '');
      const stockBucket = (stockMap && stockMap.byCode && stockMap.byCode[selCode]) ? stockMap.byCode[selCode] : null;
      const curStockUnits = stockBucket ? stockBucket.shelfUnits : 0;
      const cart = Array.isArray(sup.cartItems) ? sup.cartItems : [];
      const totalCartCases = cart.reduce((s, ci) => s + Math.max(0, Number(ci.cases) || 0), 0);
      const skuDisp = formatLcdCell(sup.skuInput, 6, sup.activeField === 'sku');
      const qtyRaw = (sup.negativeMode ? '-' : '') + sup.qtyInput;
      const qtyDisp = formatLcdCell(qtyRaw, 5, sup.activeField === 'qty');
      const idxDisp = products.length > 0 ? ((match.idx + 1) + '/' + products.length) : '0/0';
      const itemLabel = selProd ? String(selProd.name || 'Supply Item').slice(0, 20) : (sup.skuInput ? 'Unknown SKU 6001-10' : 'Select/Key 6001-10');
      const unitCostEach = Number(selProd.price || 0);
      const packSz = Math.max(1, Number(selProd.unitsPerCase) || 8);
      const caseCostEach = unitCostEach * packSz;
      const priceLabel = selProd
        ? ('$' + caseCostEach.toFixed(2) + '/cs | ' + String(packSz) + 'u')
        : 'Vendor #601 Dept 60';
      const line2Sup = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : '<div class="lcd-scr-line">Cart:' + escapeHtml(String(totalCartCases)) + 'cs | #601 Vnd</div>';

      linesHtml =
        '<div class="lcd-scr-line">DEPT 60 SUPPLY ORDER</div>' +
        line2Sup +
        '<div class="lcd-scr-line">SKU:   <span class="lcd-input-box' + (sup.activeField === 'sku' ? ' active' : '') + '">' + skuDisp + '</span> ' + escapeHtml(idxDisp) + '</div>' +
        '<div class="lcd-scr-line">Cases: <span class="lcd-input-box' + (sup.activeField === 'qty' ? ' active' : '') + '">' + qtyDisp + '</span> Stk:' + escapeHtml(String(curStockUnits)) + 'u</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(itemLabel) + '</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(priceLabel.slice(0, 20)) + '</div>' +
        '<div class="lcd-scr-line">Up/Dn Item | - Adj</div>' +
        '<div class="lcd-scr-line">F3 Back | F4 Cart(' + escapeHtml(String(cart.length)) + ')</div>' +
        '<div class="lcd-scr-line">F5 PLACE ORDER</div>';
    } else if (sc.screen === 'supply-cart') {
      if (!sc.supply) sc.supply = createInitialSupplyState();
      const sup = sc.supply;
      const cart = Array.isArray(sup.cartItems) ? sup.cartItems : [];
      const selIdx = Math.max(0, Math.min(Math.max(0, cart.length - 1), sup.cartSelectedIdx || 0));
      sup.cartSelectedIdx = selIdx;
      const scroll = Math.max(0, Math.min(Math.max(0, cart.length - 5), sup.cartScroll || 0));
      let cartRows = '';
      for (let i = 0; i < 5; i++) {
        const idx = scroll + i;
        const entry = cart[idx];
        if (entry) {
          const isSel = idx === selIdx;
          const namePart = String(entry.name || 'Supply').slice(0, 14).padEnd(14, ' ');
          const qtyPart = String(entry.cases || 0).padStart(3, ' ') + 'cs';
          cartRows += '<div class="lcd-scr-line' + (isSel ? ' notice' : '') + '">' + escapeHtml(namePart + ' ' + qtyPart) + '</div>';
        } else {
          cartRows += '<div class="lcd-scr-line"> </div>';
        }
      }
      const line2Cart = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : '<div class="lcd-scr-line">Item           Cases</div>';
      linesHtml =
        '<div class="lcd-scr-line">Supply Cart (' + escapeHtml(String(cart.length)) + ')</div>' +
        line2Cart +
        cartRows +
        '<div class="lcd-scr-line">Up/Dn Nav | -/BKSP</div>' +
        '<div class="lcd-scr-line">F3 Back | F5 ORDER</div>';
    } else if (sc.screen === 'supply-confirm') {
      if (!sc.supply) sc.supply = createInitialSupplyState();
      const sup = sc.supply;
      const cart = Array.isArray(sup.cartItems) ? sup.cartItems : [];
      const totalCases = cart.reduce((s, ci) => s + Math.max(0, Number(ci.cases) || 0), 0);
      const totalCost = cart.reduce((s, ci) => {
        const cs = Math.max(0, Number(ci.cases) || 0);
        const upc = Math.max(1, Number(ci.unitsPerCase) || 8);
        return s + (cs * upc * (Number(ci.price) || 0));
      }, 0);
      const etaInfo = getNextSupplyEtaDateInfo();
      linesHtml =
        '<div class="lcd-scr-line">SEND SUPPLY ORDER?</div>' +
        '<div class="lcd-scr-line">Vendor #601 Retail</div>' +
        '<div class="lcd-scr-line">SKUs:  ' + escapeHtml(String(cart.length)) + '</div>' +
        '<div class="lcd-scr-line">Cases: ' + escapeHtml(String(totalCases)) + ' cs</div>' +
        '<div class="lcd-scr-line">Est:   $' + escapeHtml(totalCost.toFixed(2)) + '</div>' +
        '<div class="lcd-scr-line">ETA:   ' + escapeHtml(etaInfo.mmddyyyy) + '</div>' +
        '<div class="lcd-scr-line notice">LIMIT: 1 ORDER / DAY</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">ENT Confirm | F3 No</div>';
    } else if (sc.screen === 'supply-done') {
      if (!sc.supply) sc.supply = createInitialSupplyState();
      const sup = sc.supply;
      const etaDate = sup.submittedEtaDate || getNextSupplyEtaDateInfo().mmddyyyy;
      const line2Done = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : '<div class="lcd-scr-line">Vendor #601 Truck</div>';
      linesHtml =
        '<div class="lcd-scr-line">SUPPLY ORDER FINAL</div>' +
        line2Done +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">Cases:  ' + escapeHtml(String(sup.lastSubmittedCases || 0)) + ' cs</div>' +
        '<div class="lcd-scr-line">SKUs:   ' + escapeHtml(String(sup.lastSubmittedSkus || 0)) + '</div>' +
        '<div class="lcd-scr-line">ETA:    ' + escapeHtml(etaDate) + '</div>' +
        '<div class="lcd-scr-line">Limit:  1 Order/Day</div>' +
        '<div class="lcd-scr-line">Status: FINALIZED</div>' +
        '<div class="lcd-scr-line">ENT Home | F3 Home</div>';
    } else if (sc.screen === 'inventory') {
      if (!sc.inventory) sc.inventory = createInitialInventoryState();
      const inv = syncBackstockInventoryEntriesFromRacks();
      const upcDisp = formatLcdCell(inv.productCode, 8, inv.activeField === 'productCode');
      const qtyRaw = (inv.negativeMode ? '-' : '') + inv.quantity;
      const qtyDisp = formatLcdCell(qtyRaw, 8, inv.activeField === 'quantity');
      const prodNameText = inv.lastScannedLabel ? inv.lastScannedLabel.slice(0, 20) : ' ';
      const binStr = (inv.binLabel || '--/--/--').slice(0, 14);
      const line2Inv = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : '<div class="lcd-scr-line">Audited Cases: ' + escapeHtml(String(inv.scannedEntries.length)) + '</div>';

      linesHtml =
        '<div class="lcd-scr-line">BACKROOM INVENTORY</div>' +
        line2Inv +
        '<div class="lcd-scr-line">Bin:   ' + escapeHtml(binStr) + '</div>' +
        '<div class="lcd-scr-line">UPC:   <span class="lcd-input-box' + (inv.activeField === 'productCode' ? ' active' : '') + '">' + upcDisp + '</span></div>' +
        '<div class="lcd-scr-line">Units: <span class="lcd-input-box' + (inv.activeField === 'quantity' ? ' active' : '') + '">' + qtyDisp + '</span></div>' +
        '<div class="lcd-scr-line">Product Name:</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(prodNameText) + '</div>' +
        '<div class="lcd-scr-line"> F3 Back | - Adj</div>' +
        '<div class="lcd-scr-line"> F4 List | F5 FINAL</div>';
    } else if (sc.screen === 'inventory-list') {
      if (!sc.inventory) sc.inventory = createInitialInventoryState();
      const inv = syncBackstockInventoryEntriesFromRacks();
      const entries = inv.scannedEntries || [];
      const selIdx = Math.max(0, Math.min(Math.max(0, entries.length - 1), inv.listSelectedIdx || 0));
      inv.listSelectedIdx = selIdx;
      const scroll = Math.max(0, Math.min(Math.max(0, entries.length - 5), inv.listScroll || 0));
      let listRows = '';
      for (let i = 0; i < 5; i++) {
        const idx = scroll + i;
        const entry = entries[idx];
        if (entry) {
          const isSel = idx === selIdx;
          const namePart = String(entry.name || 'Item').slice(0, 14).padEnd(14, ' ');
          const qtyPart = String(entry.qty || 0).padStart(4, ' ') + 'u';
          listRows += '<div class="lcd-scr-line' + (isSel ? ' notice' : '') + '">' + escapeHtml(namePart + ' ' + qtyPart) + '</div>';
        } else {
          listRows += '<div class="lcd-scr-line"> </div>';
        }
      }
      const line2List = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : '<div class="lcd-scr-line">Item          Units</div>';
      linesHtml =
        '<div class="lcd-scr-line">Audit List (' + escapeHtml(String(entries.length)) + ')</div>' +
        line2List +
        listRows +
        '<div class="lcd-scr-line">Up/Dn Nav | BKSP Del</div>' +
        '<div class="lcd-scr-line">F3 Back</div>';
    } else if (sc.screen === 'inventory-confirm') {
      const summary = getBackstockInventorySummary();
      linesHtml =
        '<div class="lcd-scr-line">FINALIZE INVENTORY?</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">Audited Cases: ' + escapeHtml(String(summary.auditedCases)) + '</div>' +
        '<div class="lcd-scr-line">Total Units:   ' + escapeHtml(String(summary.totalAuditedUnits)) + '</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line notice">IRREVERSIBLE ACTION!</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">ENT Confirm | F3 No</div>';
    } else if (sc.screen === 'inventory-done') {
      const inv = sc.inventory || createInitialInventoryState();
      const summary = inv.auditSummary || getBackstockInventorySummary();
      linesHtml =
        '<div class="lcd-scr-line">INVENTORY COMPLETE</div>' +
        '<div class="lcd-scr-line">Logged &amp; Audited</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">Cases:  ' + escapeHtml(String(summary.auditedCases || 0)) + '</div>' +
        '<div class="lcd-scr-line">Units:  ' + escapeHtml(String(summary.totalAuditedUnits || 0)) + '</div>' +
        '<div class="lcd-scr-line">Status: FINALIZED</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">ENT Home | F3 Home</div>';
    } else if (sc.screen === 'damage') {
      if (!sc.damage) sc.damage = createInitialDamageState();
      linesHtml =
        '<div class="lcd-scr-line">MARKDOWN CLAIMS</div>' +
        line2Notice +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">Scan item for</div>' +
        '<div class="lcd-scr-line">disposition:</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">F3 Back</div>';
    } else if (sc.screen === 'damage-cond') {
      if (!sc.damage) sc.damage = createInitialDamageState();
      const dmg = sc.damage;
      const ct = global.ClaimsTotes;
      const item = (ct && typeof ct.findItemById === 'function' && dmg.pendingItemId) ? ct.findItemById(dmg.pendingItemId) : null;
      const condList = (ct && Array.isArray(ct.DAMAGE_CONDITIONS) && ct.DAMAGE_CONDITIONS.length > 0)
        ? ct.DAMAGE_CONDITIONS
        : [
          { key: 'leaking', label: 'Leaking', short: 'Leaking' },
          { key: 'dented', label: 'Dented', short: 'Dented' },
          { key: 'wet_saturated', label: 'Wet/Saturated', short: 'Wet/Saturated' },
          { key: 'missing_label', label: 'Missing Label/Nutrition Info', short: 'Missing Label' }
        ];
      const selIdx = Math.max(0, Math.min(condList.length - 1, dmg.selectedConditionIdx || 0));
      const itemName = item ? String(item.name || 'Item').slice(0, 20) : 'Unknown Item';
      const skuCost = item ? ('SKU:' + String(item.code || '').slice(0, 6) + ' $' + Number(item.price || 0).toFixed(2)) : ' ';
      const condRows = condList.map((c, idx) => {
        const prefix = (idx + 1) + '. ' + c.short;
        return '<div class="lcd-scr-line' + (idx === selIdx ? ' notice' : '') + '">' + escapeHtml(prefix.slice(0, 20)) + '</div>';
      }).join('');
      linesHtml =
        '<div class="lcd-scr-line">ENTER ITEM CONDITION</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(itemName) + '</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(skuCost.slice(0, 20)) + '</div>' +
        condRows +
        '<div class="lcd-scr-line">1-4/UpDn+ENT | F3 No</div>';
    } else if (sc.screen === 'damage-disp') {
      if (!sc.damage) sc.damage = createInitialDamageState();
      const dmg = sc.damage;
      const ct = global.ClaimsTotes;
      const item = (ct && typeof ct.findItemById === 'function' && dmg.pendingItemId) ? ct.findItemById(dmg.pendingItemId) : null;
      const condObj = (ct && typeof ct.getConditionInfo === 'function')
        ? ct.getConditionInfo(dmg.selectedConditionKey)
        : { short: String(dmg.selectedConditionKey || '') };
      const itemName = item ? String(item.name || 'Item').slice(0, 20) : 'Item';
      const dispLabel = (ct && typeof ct.getReceptacleLabel === 'function')
        ? ct.getReceptacleLabel(dmg.computedDisposition)
        : String(dmg.computedDisposition || 'TRASH').toUpperCase();
      if (dmg.isVendorCredit) {
        linesHtml =
          '<div class="lcd-scr-line">VENDOR CREDIT ITEM</div>' +
          '<div class="lcd-scr-line">' + escapeHtml(itemName) + '</div>' +
          '<div class="lcd-scr-line">Cond: ' + escapeHtml(condObj.short.slice(0, 14)) + '</div>' +
          '<div class="lcd-scr-line">No store markdown.</div>' +
          '<div class="lcd-scr-line">Process with next</div>' +
          '<div class="lcd-scr-line">vendor delivery:</div>' +
          '<div class="lcd-scr-line notice">-> RED CREDIT TOTE</div>' +
          '<div class="lcd-scr-line"> </div>' +
          '<div class="lcd-scr-line">ENT Confirm | F3 Cancel</div>';
      } else {
        const mdPrice = item ? ('$' + Number(item.price || 0).toFixed(2)) : '$0.00';
        linesHtml =
          '<div class="lcd-scr-line">CLAIMS DISPOSITION</div>' +
          '<div class="lcd-scr-line">' + escapeHtml(itemName) + '</div>' +
          '<div class="lcd-scr-line">Cond: ' + escapeHtml(condObj.short.slice(0, 14)) + '</div>' +
          '<div class="lcd-scr-line">Action: MARKDOWN</div>' +
          '<div class="lcd-scr-line">Credit Value: ' + escapeHtml(mdPrice) + '</div>' +
          '<div class="lcd-scr-line">Place Damaged Item:</div>' +
          '<div class="lcd-scr-line notice">-> ' + escapeHtml(dispLabel.slice(0, 17)) + '</div>' +
          '<div class="lcd-scr-line"> </div>' +
          '<div class="lcd-scr-line">ENT Confirm | F3 Cancel</div>';
      }
    } else if (sc.screen === 'damage-ready') {
      if (!sc.damage) sc.damage = createInitialDamageState();
      const dmg = sc.damage;
      const ct = global.ClaimsTotes;
      const item = (ct && typeof ct.findItemById === 'function' && dmg.pendingItemId) ? ct.findItemById(dmg.pendingItemId) : null;
      const itemName = item ? String(item.name || 'Item').slice(0, 20) : 'Confirmed Item';
      const dispLabel = (ct && typeof ct.getReceptacleLabel === 'function')
        ? ct.getReceptacleLabel(dmg.computedDisposition)
        : String(dmg.computedDisposition || 'TRASH').toUpperCase();
      linesHtml =
        '<div class="lcd-scr-line">DISPOSITION COMPLETE</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(itemName) + '</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">Take &amp; place in:</div>' +
        '<div class="lcd-scr-line notice">' + escapeHtml(dispLabel.slice(0, 20)) + '</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">ENT Next | F3 Back</div>';
    } else if (sc.screen === 'create') {
      const deptDisp = formatLcdCell(sc.headers.deptNo, 2, sc.activeField === 'deptNo');
      const vendDisp = formatLcdCell(sc.headers.vendorNo, 3, sc.activeField === 'vendorNo');
      const invDisp = formatLcdCell(sc.headers.invoiceNo, 6, sc.activeField === 'invoiceNo');
      const unitsDisp = formatLcdCell(sc.expectedUnitsStr, 5, sc.activeField === 'units');
      const costRaw = sc.expectedCostCents ? formatCostCents(sc.expectedCostCents, false) : '';
      const costDisp = formatLcdCell(costRaw, 8, sc.activeField === 'cost');
      const initialRecs = getInitialReceipts();
      const resumeHintLine = initialRecs.length > 0
        ? '<div class="lcd-scr-line">F7 Resume Init (' + initialRecs.length + ')</div>'
        : '<div class="lcd-scr-line"> </div>';

      linesHtml =
        '<div class="lcd-scr-line">CREATE RECEIPT</div>' +
        line2Notice +
        '<div class="lcd-scr-line">Dept#:   <span class="lcd-input-box' + (sc.activeField === 'deptNo' ? ' active' : '') + '">' + deptDisp + '</span></div>' +
        '<div class="lcd-scr-line">Vendor:  <span class="lcd-input-box' + (sc.activeField === 'vendorNo' ? ' active' : '') + '">' + vendDisp + '</span></div>' +
        '<div class="lcd-scr-line">Invoice: <span class="lcd-input-box' + (sc.activeField === 'invoiceNo' ? ' active' : '') + '">' + invDisp + '</span></div>' +
        '<div class="lcd-scr-line">Units:   <span class="lcd-input-box' + (sc.activeField === 'units' ? ' active' : '') + '">' + unitsDisp + '</span></div>' +
        '<div class="lcd-scr-line">Cost:    <span class="lcd-input-box' + (sc.activeField === 'cost' ? ' active' : '') + '">' + costDisp + '</span></div>' +
        resumeHintLine +
        '<div class="lcd-scr-line">ENT Create | F3 Back</div>';
    } else if (sc.screen === 'resume') {
      const initialRecs = getInitialReceipts();
      const selIdx = Math.max(0, Math.min(Math.max(0, initialRecs.length - 1), sc.resumeSelectedIdx || 0));
      sc.resumeSelectedIdx = selIdx;
      const maxScroll = Math.max(0, initialRecs.length - 5);
      const scroll = Math.max(0, Math.min(maxScroll, sc.resumeScroll || 0));
      let pickRows = '';
      for (let i = 0; i < 5; i++) {
        const rec = initialRecs[scroll + i];
        if (rec) {
          const isSel = (scroll + i) === selIdx;
          const rowText = String(rec.receiptNumber).padEnd(8, ' ') + ' #' + String(rec.invoiceNo || '');
          pickRows += '<div class="lcd-scr-line' + (isSel ? ' notice' : '') + '">' + escapeHtml(rowText.slice(0, 20)) + '</div>';
        } else {
          pickRows += '<div class="lcd-scr-line"> </div>';
        }
      }
      const curRec = initialRecs[selIdx];
      const curItemsCount = curRec ? (curRec.items || []).reduce((s, it) => s + Math.abs(Number(it.qty) || 0), 0) : 0;
      const infoLine = curRec
        ? ('D#' + curRec.deptNo + ' V#' + curRec.vendorNo + ' ' + curItemsCount + 'u')
        : 'NONE OPEN';

      linesHtml =
        '<div class="lcd-scr-line">Resume Initial (' + initialRecs.length + ')</div>' +
        pickRows +
        '<div class="lcd-scr-line">' + escapeHtml(infoLine.slice(0, 20)) + '</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">ENT Take | F3 Back</div>';
    } else if (sc.screen === 'scanning') {
      const upcDisp = formatLcdCell(sc.productCode, 8, sc.activeField === 'productCode');
      const qtyRaw = (sc.negativeMode ? '-' : '') + sc.quantity;
      const qtyDisp = formatLcdCell(qtyRaw, 8, sc.activeField === 'quantity');
      const prodNameText = sc.lastScannedLabel ? sc.lastScannedLabel.slice(0, 20) : ' ';
      const line2Scan = (noticeText && sc.statusKind === 'err')
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : '<div class="lcd-scr-line"> </div>';

      linesHtml =
        '<div class="lcd-scr-line">Receipt: ' + escapeHtml(sc.activeReceiptNo || '--') + '</div>' +
        line2Scan +
        '<div class="lcd-scr-line">UPC:   <span class="lcd-input-box' + (sc.activeField === 'productCode' ? ' active' : '') + '">' + upcDisp + '</span></div>' +
        '<div class="lcd-scr-line">Units: <span class="lcd-input-box' + (sc.activeField === 'quantity' ? ' active' : '') + '">' + qtyDisp + '</span></div>' +
        '<div class="lcd-scr-line">Product Name:</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(prodNameText) + '</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> - Credit| F2 Total</div>' +
        '<div class="lcd-scr-line"> F4 List | F5 FINAL</div>';
    } else if (sc.screen === 'list') {
      const items = sc.scannedItems || [];
      const scroll = Math.max(0, Math.min(Math.max(0, items.length - 6), sc.listScroll || 0));
      let itemRows = '';
      for (let i = 0; i < 6; i++) {
        const it = items[scroll + i];
        if (it) {
          const nameCol = String(it.name || 'Item').slice(0, 14).padEnd(14, ' ');
          const qtyCol = String(it.qty).padStart(4, ' ');
          itemRows += '<div class="lcd-scr-line">' + escapeHtml(nameCol + ' ' + qtyCol) + '</div>';
        } else {
          itemRows += '<div class="lcd-scr-line"> </div>';
        }
      }
      linesHtml =
        '<div class="lcd-scr-line">Receipt: ' + escapeHtml(sc.activeReceiptNo || '--') + '</div>' +
        '<div class="lcd-scr-line">Item List:</div>' +
        itemRows +
        '<div class="lcd-scr-line">F3 Back | Up/Dn Nav</div>';
    } else if (sc.screen === 'totals-edit') {
      const editCostRaw = sc.totalsEditCostCents ? formatCostCents(sc.totalsEditCostCents, false) : '';
      const editCostDisp = formatLcdCell(editCostRaw, 8, sc.totalsEditField === 'cost');
      const editUnitsDisp = formatLcdCell(sc.totalsEditUnitsStr || '', 5, sc.totalsEditField === 'units');

      linesHtml =
        '<div class="lcd-scr-line">Receipt: ' + escapeHtml(sc.activeReceiptNo || '--') + '</div>' +
        line2Notice +
        '<div class="lcd-scr-line">Edit Expected Totals:</div>' +
        '<div class="lcd-scr-line">Cost:   <span class="lcd-input-box' + (sc.totalsEditField === 'cost' ? ' active' : '') + '">' + editCostDisp + '</span></div>' +
        '<div class="lcd-scr-line">Units:  <span class="lcd-input-box' + (sc.totalsEditField === 'units' ? ' active' : '') + '">' + editUnitsDisp + '</span></div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">F2 Save | F3 Cancel</div>';
    } else if (sc.screen === 'totals') {
      const tot = computeScannerTotalsSummary(sc);

      linesHtml =
        '<div class="lcd-scr-line">Receipt: ' + escapeHtml(sc.activeReceiptNo || '--') + '</div>' +
        line2Notice +
        '<div class="lcd-scr-line">Invoice</div>' +
        '<div class="lcd-scr-line">Cost:   ' + escapeHtml(tot.invCostStr) + '</div>' +
        '<div class="lcd-scr-line">Units:  ' + escapeHtml(String(tot.dispExpUnits)) + '</div>' +
        '<div class="lcd-scr-line">Scanned</div>' +
        '<div class="lcd-scr-line">Cost:   ' + escapeHtml(tot.scCostStr) + '</div>' +
        '<div class="lcd-scr-line">Units:  ' + escapeHtml(String(tot.scUnits)) + '</div>' +
        '<div class="lcd-scr-line">F2/F3 Back | F8 Edit</div>';
    } else if (sc.screen === 'confirm-finalize') {
      const tot = computeScannerTotalsSummary(sc);
      const expCostNumeric = tot.rawExpCost !== null ? (tot.isCreditByItems ? -tot.rawExpCost : tot.rawExpCost) : null;
      const unitsMismatch = tot.rawExpUnits > 0 && tot.dispExpUnits !== tot.scUnits;
      const costMismatch = expCostNumeric !== null && Math.abs(expCostNumeric - tot.scCost) > 0.01;
      const titleLine = tot.isCreditByItems ? 'FINALIZE CREDIT?' : 'FINALIZE RECEIPT?';
      const headerLine = 'V#' + String(sc.headers.vendorNo || '') + ' Inv#' + String(sc.headers.invoiceNo || '');
      const expLine = ('Exp:' + String(tot.dispExpUnits) + 'u ' + (tot.rawExpCost !== null ? tot.invCostStr : 'BLANK')).slice(0, 20);
      const scnLine = ('Scn:' + String(tot.scUnits) + 'u ' + tot.scCostStr).slice(0, 20);
      const warnLine = (unitsMismatch || costMismatch)
        ? '<div class="lcd-scr-line notice">! TOTALS MISMATCH !</div>'
        : '<div class="lcd-scr-line">Totals match entry.</div>';

      linesHtml =
        '<div class="lcd-scr-line">' + escapeHtml(titleLine) + '</div>' +
        '<div class="lcd-scr-line">Rcpt: ' + escapeHtml(sc.activeReceiptNo || '--') + '</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(headerLine.slice(0, 20)) + '</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(expLine) + '</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(scnLine) + '</div>' +
        warnLine +
        '<div class="lcd-scr-line notice">IRREVERSIBLE ACTION!</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">ENT Confirm | F3 No</div>';
    } else {
      // Screen 5: finalized ("Logged & Finalized")
      const snap = sc.finalizedSnapshot || {
        receiptNumber: (d && (d.receiptNumber || d.lastReceiptNumber || d.lastCreditReceiptNumber)) || '--',
        deptNo: sc.headers.deptNo,
        vendorNo: sc.headers.vendorNo,
        invoiceNo: sc.headers.invoiceNo,
        units: sc.expectedUnits,
        cost: sc.expectedCost
      };
      const finCostStr = Number(snap.cost || 0).toFixed(2);

      const finNoticeLine = sc.statusMessage
        ? '<div class="lcd-scr-line notice">' + escapeHtml(sc.statusMessage.slice(0, 20)) + '</div>'
        : '<div class="lcd-scr-line"> </div>';

      linesHtml =
        '<div class="lcd-scr-line">Receipt: ' + escapeHtml(snap.receiptNumber) + '</div>' +
        '<div class="lcd-scr-line">Logged &amp; Finalized</div>' +
        '<div class="lcd-scr-line">Dept#:   ' + escapeHtml(String(snap.deptNo || '').padEnd(2, ' ')) + '</div>' +
        '<div class="lcd-scr-line">Vendor:  ' + escapeHtml(String(snap.vendorNo || '').padEnd(3, ' ')) + '</div>' +
        '<div class="lcd-scr-line">Invoice: ' + escapeHtml(String(snap.invoiceNo || '').padEnd(6, ' ')) + '</div>' +
        '<div class="lcd-scr-line">Units:   ' + escapeHtml(String(snap.units || 0).padEnd(5, ' ')) + '</div>' +
        '<div class="lcd-scr-line">Cost:    ' + escapeHtml(finCostStr.padEnd(8, ' ')) + '</div>' +
        finNoticeLine +
        '<div class="lcd-scr-line">ENT Continue | F6 Print</div>';
    }

    const nextBodyHtml = linesHtml;
    if (nextBodyHtml !== lastScannerBodyHtml) {
      lastScannerBodyHtml = nextBodyHtml;
      bodyEl.innerHTML = nextBodyHtml;
    }

    if (global.BackstockRacks && typeof global.BackstockRacks.syncInventoryVisuals === 'function') {
      const overlayEl = document.getElementById('scanner-modal-overlay');
      const modalOpen = Boolean(overlayEl && overlayEl.classList.contains('active'));
      global.BackstockRacks.syncInventoryVisuals(modalOpen && isScannerInventoryMode());
    }
  }

  // =========================================================================
  // 5-SCREEN CRT WORKSTATION TERMINAL
  // =========================================================================

  function updateTerminalClock(snap) {
    updateHomeOfficeTasks(snap);
    const el = document.getElementById('crt-menu-clock');
    if (el) {
      const clock = getClock();
      const s = snap || (clock ? clock.getTimeSnapshot() : { formatted12h: '6:00 AM', dateLabel: 'FEB 1, 1996' });
      el.textContent = s.dateLabel + ' :: ' + s.formatted12h;
    }
    const sumEl = document.getElementById('crt-menu-summary');
    if (sumEl && (state.currentScreen || 'menu') === 'menu') {
      sumEl.innerHTML = buildTerminalMenuSummaryHtml();
    }
  }

  function getActiveTerminalListKey() {
    const screen = state.currentScreen || 'menu';
    if (screen === 'create' && state.manualDraft && state.manualDraft.phase === 'scanning') return 'create';
    if (screen === 'receipts') return 'receipts';
    if (screen === 'receipt-detail') return 'receiptDetail';
    if (screen === 'schedule') return 'schedule';
    if (screen === 'tasks') return 'tasks';
    if (screen === 'suppliers') {
      if ((state.supplierQuery || '').trim()) return 'suppliersSearch';
      if (state.supplierTreeLevel === 'items') return 'suppliersItems';
      if (state.supplierTreeLevel === 'vendors') return 'suppliersVendors';
      return 'suppliersDepts';
    }
    return null;
  }

  function paginateItems(arr, pageKey, pageSize) {
    const list = Array.isArray(arr) ? arr : [];
    const total = list.length;
    const size = Math.max(1, pageSize || 6);
    const totalPages = Math.max(1, Math.ceil(total / size));
    const cur = Math.max(0, Math.min(totalPages - 1, state.terminalPage[pageKey] || 0));
    state.terminalPage[pageKey] = cur;
    const startIdx = cur * size;
    const endIdx = Math.min(total, startIdx + size);
    return {
      items: list.slice(startIdx, endIdx),
      page: cur,
      totalPages: totalPages,
      startIdx: startIdx,
      endIdx: endIdx,
      total: total
    };
  }

  function renderTerminalPager(pg, leftHtml) {
    const prevDis = pg.page <= 0 ? ' disabled' : '';
    const nextDis = pg.page >= pg.totalPages - 1 ? ' disabled' : '';
    const rangeTxt = pg.total > 0
      ? ('PAGE ' + (pg.page + 1) + '/' + pg.totalPages + ' (' + (pg.startIdx + 1) + '-' + pg.endIdx + ' OF ' + pg.total + ')')
      : 'PAGE 1/1 (0)';
    return (
      '<div class="crt-pager-bar">' +
      '<div style="display:flex; gap:6px; align-items:center;">' +
      '<button type="button" class="crt-btn-sm" data-crt-pg="-1"' + prevDis + '>[ F7=PG UP ]</button>' +
      '<button type="button" class="crt-btn-sm" data-crt-pg="1"' + nextDis + '>[ F8=PG DN ]</button>' +
      (leftHtml || '') +
      '</div>' +
      '<span class="crt-pager-info">' + rangeTxt + '</span>' +
      '</div>'
    );
  }

  function bindTerminalPager(body, pageKey) {
    body.querySelectorAll('[data-crt-pg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.getAttribute('data-crt-pg'), 10) || 0;
        state.terminalPage[pageKey] = Math.max(0, (state.terminalPage[pageKey] || 0) + delta);
        playBeep();
        renderTerminalUI();
      });
    });
  }

  function openTerminalScreen(screenName) {
    state.currentScreen = screenName || 'menu';
    if (state.currentScreen === 'create') {
      if (!state.manualDraft) startManualDraft();
      state.terminalActiveField = state.manualDraft.phase === 'scanning' ? 'productCode' : 'deptNo';
      state.terminalSupplierKeypadOpen = false;
      state.terminalPage.create = 0;
    } else if (state.currentScreen === 'receipts') {
      state.terminalPage.receipts = 0;
      state.terminalSupplierKeypadOpen = false;
      state.terminalLedgerMsg = '';
    } else if (state.currentScreen === 'receipt-detail') {
      const selected = state.selectedReceiptNo ? findReceipt(state.selectedReceiptNo) : null;
      state.terminalEditFields = selected ? {
        receiptNumber: selected.receiptNumber,
        vendorNo: String(selected.vendorNo || ''),
        deptNo: String(selected.deptNo || ''),
        invoiceNo: String(selected.invoiceNo || '')
      } : null;
      state.terminalActiveField = 'vendorNo';
      state.terminalSupplierKeypadOpen = false;
      state.terminalPage.receiptDetail = 0;
    } else if (state.currentScreen === 'schedule') {
      state.terminalPage.schedule = 0;
      state.terminalSupplierKeypadOpen = false;
    } else if (state.currentScreen === 'suppliers') {
      state.terminalActiveField = 'search';
      state.terminalSupplierKeypadOpen = false;
      state.supplierTreeLevel = 'depts';
      state.terminalPage.suppliersSearch = 0;
      state.terminalPage.suppliersDepts = 0;
      state.terminalPage.suppliersVendors = 0;
      state.terminalPage.suppliersItems = 0;
    } else {
      state.terminalSupplierKeypadOpen = false;
    }
    renderTerminalUI();
  }

  function isRecallCountInputReady() {
    const rec = (global.ClaimsTotes && typeof global.ClaimsTotes.getRecallState === 'function')
      ? global.ClaimsTotes.getRecallState()
      : null;
    return Boolean(rec && rec.active && rec.sorted && !rec.completed);
  }

  function getTerminalFieldMeta(screen, field) {
    if (screen === 'suppliers') return { label: 'SEARCH SUPPLIER / UPC / PLU', maxLen: 24 };
    if (screen === 'tasks' || field === 'recallCount') return { label: 'AFFECTED UNIT COUNT', maxLen: 3 };
    if (field === 'vendorNo') return { label: 'VENDOR # (3 DIGITS)', maxLen: 3 };
    if (field === 'deptNo') return { label: 'DEPT # (2 DIGITS)', maxLen: 2 };
    if (field === 'invoiceNo') return { label: 'INVOICE # (6 DIGITS)', maxLen: 6 };
    if (field === 'productCode') return { label: 'UPC / 4-DIGIT PLU', maxLen: 14 };
    if (field === 'quantity') return { label: 'CASE QTY (+/-)', maxLen: 4 };
    return { label: 'TERMINAL INPUT', maxLen: 16 };
  }

  function flashTerminalKeyBtn(keyToken) {
    const section = document.getElementById('terminal-keypad-section');
    if (!section) return;
    const btn = section.querySelector('[data-tkey="' + String(keyToken) + '"]');
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 120);
    }
  }

  function syncTerminalFieldsDom() {
    const screen = state.currentScreen || 'menu';
    if (screen === 'create' && state.manualDraft) {
      const d = state.manualDraft;
      const vEl = document.getElementById('crt-in-vendor');
      const dEl = document.getElementById('crt-in-dept');
      const iEl = document.getElementById('crt-in-invoice');
      const cEl = document.getElementById('crt-in-code');
      const qEl = document.getElementById('crt-in-qty');
      if (vEl) vEl.value = d.vendorNo;
      if (dEl) dEl.value = d.deptNo;
      if (iEl) iEl.value = d.invoiceNo;
      if (cEl) cEl.value = d.productCode;
      if (qEl) qEl.value = d.qty;
    } else if (screen === 'receipt-detail' && state.terminalEditFields) {
      const ef = state.terminalEditFields;
      const vEl = document.getElementById('crt-edit-vendor');
      const dEl = document.getElementById('crt-edit-dept');
      const iEl = document.getElementById('crt-edit-invoice');
      if (vEl) vEl.value = ef.vendorNo;
      if (dEl) dEl.value = ef.deptNo;
      if (iEl) iEl.value = ef.invoiceNo;
    } else if (screen === 'suppliers') {
      const sEl = document.getElementById('crt-sup-search');
      if (sEl) sEl.value = state.supplierQuery;
    } else if (screen === 'tasks') {
      const rEl = document.getElementById('crt-in-recall-count');
      if (rEl) rEl.value = state.terminalRecallCount || '';
    }
    updateTerminalKeypadUI();
  }

  function updateTerminalKeypadUI() {
    const modal = document.getElementById('terminal-modal');
    const lbl = document.getElementById('terminal-keypad-field-lbl');
    const modeBtn = document.getElementById('terminal-mode-toggle-btn');
    if (!modal) return;

    const screen = state.currentScreen || 'menu';
    const selectedRec = (screen === 'receipt-detail' && state.selectedReceiptNo) ? findReceipt(state.selectedReceiptNo) : null;
    const selectedStatus = selectedRec ? getReceiptStatus(selectedRec) : '';
    const showKeypad = (screen === 'create') ||
      (screen === 'receipt-detail' && selectedRec && (selectedStatus === 'INITIAL' || selectedStatus === 'FINAL')) ||
      (screen === 'suppliers' && state.terminalSupplierKeypadOpen) ||
      (screen === 'tasks' && isRecallCountInputReady());
    const useAlpha = Boolean(screen === 'suppliers' && state.terminalSupplierKeypadOpen && state.terminalAlphaMode);

    modal.classList.toggle('has-keypad', Boolean(showKeypad));
    modal.classList.toggle('alpha-keypad', useAlpha);

    if (lbl) {
      const meta = getTerminalFieldMeta(screen, state.terminalActiveField);
      lbl.textContent = 'ACTIVE: ' + meta.label;
    }
    if (modeBtn) {
      modeBtn.style.display = (screen === 'suppliers' && state.terminalSupplierKeypadOpen) ? 'inline-block' : 'none';
      modeBtn.textContent = state.terminalAlphaMode ? 'SWITCH TO 123' : 'SWITCH TO ABC';
    }

    const negBtn = modal.querySelector('[data-tkey="NEG"]');
    if (negBtn) {
      const allowNeg = (screen === 'create' && state.terminalActiveField === 'quantity');
      negBtn.style.opacity = allowNeg ? '1' : '0.45';
    }

    modal.querySelectorAll('[data-term-field]').forEach((el) => {
      const f = el.getAttribute('data-term-field');
      const active = showKeypad && (f === state.terminalActiveField);
      el.classList.toggle('crt-field-active', active);
    });
  }

  function handleTerminalKey(rawKey) {
    const screen = state.currentScreen || 'menu';
    const key = String(rawKey || '').toUpperCase();
    flashTerminalKeyBtn(key);

    if (key === 'F12') {
      if (screen === 'receipt-detail') {
        playBeep();
        openTerminalScreen('receipts');
        return true;
      }
      if (screen !== 'menu') {
        playBeep();
        openTerminalScreen('menu');
        return true;
      }
      return false;
    }

    if (key === 'PGUP' || key === 'PGDN') {
      const pgKey = getActiveTerminalListKey();
      if (!pgKey) return false;
      const delta = key === 'PGUP' ? -1 : 1;
      state.terminalPage[pgKey] = Math.max(0, (state.terminalPage[pgKey] || 0) + delta);
      playBeep();
      renderTerminalUI();
      return true;
    }

    if (key === 'DEPT_PREV') {
      if (screen === 'suppliers' && !(state.supplierQuery || '').trim()) {
        if (state.supplierTreeLevel === 'items') {
          state.supplierTreeLevel = 'vendors';
          playBeep();
          renderTerminalUI();
          return true;
        }
        if (state.supplierTreeLevel === 'vendors') {
          state.supplierTreeLevel = 'depts';
          playBeep();
          renderTerminalUI();
          return true;
        }
      }
      return false;
    }
    if (key === 'DEPT_NEXT') {
      return false;
    }

    if (screen === 'menu') {
      if (key === '1') { playBeep(); openTerminalScreen('create'); }
      else if (key === '2') { playBeep(); openTerminalScreen('receipts'); }
      else if (key === '3') { playBeep(); openTerminalScreen('schedule'); }
      else if (key === '4') { playBeep(); openTerminalScreen('tasks'); }
      else if (key === '5') { playBeep(); openTerminalScreen('suppliers'); }
      else if (key === 'ESC') {
        if (typeof state.hooks.onCloseTerminal === 'function') state.hooks.onCloseTerminal();
      }
      return true;
    }

    if (screen === 'create') {
      if (!state.manualDraft) startManualDraft();
      const d = state.manualDraft;
      const isHeaders = d.phase !== 'scanning';
      const fields = isHeaders ? ['deptNo', 'vendorNo', 'invoiceNo'] : ['productCode', 'quantity'];
      if (!fields.includes(state.terminalActiveField)) {
        state.terminalActiveField = fields[0];
      }
      const f = state.terminalActiveField;
      const draftProp = (f === 'quantity') ? 'qty' : f;
      const meta = getTerminalFieldMeta('create', f);

      if (key === 'ESC') {
        playBeep();
        openTerminalScreen('menu');
        return true;
      }
      if (key === 'TAB') {
        const nextIdx = (fields.indexOf(f) + 1) % fields.length;
        state.terminalActiveField = fields[nextIdx];
        playBeep();
        syncTerminalFieldsDom();
        return true;
      }
      if (/^[0-9]$/.test(key)) {
        const cur = String(d[draftProp] || '');
        if (cur.replace('-', '').length < meta.maxLen) {
          d[draftProp] = cur + key;
          playBeep();
          syncTerminalFieldsDom();
        } else {
          playError();
        }
        return true;
      }
      if (key === 'BKSP') {
        d[draftProp] = String(d[draftProp] || '').slice(0, -1);
        playBeep();
        syncTerminalFieldsDom();
        return true;
      }
      if (key === 'NEG') {
        if (isHeaders) {
          playError();
          return true;
        }
        if (f !== 'quantity') {
          state.terminalActiveField = 'quantity';
          d.qty = String(d.qty || '').startsWith('-') ? String(d.qty || '') : ('-' + String(d.qty || ''));
        } else {
          const curQ = String(d.qty || '');
          d.qty = curQ.startsWith('-') ? curQ.slice(1) : ('-' + curQ);
        }
        playBeep();
        syncTerminalFieldsDom();
        return true;
      }
      if (key === 'ENTER') {
        if (isHeaders) {
          if (d.vendorNo && d.deptNo && d.invoiceNo) {
            createBlankTerminalReceipt();
          } else if (f !== 'invoiceNo') {
            state.terminalActiveField = fields[fields.indexOf(f) + 1];
            playBeep();
            syncTerminalFieldsDom();
          } else {
            createBlankTerminalReceipt();
          }
        } else if (f === 'productCode' && d.productCode && String(d.qty || '') === '') {
          state.terminalActiveField = 'quantity';
          playBeep();
          syncTerminalFieldsDom();
        } else {
          const addBtn = document.getElementById('crt-btn-add-line');
          if (addBtn) addBtn.click();
        }
        return true;
      }
      return false;
    }

    if (screen === 'receipt-detail') {
      const selected = state.selectedReceiptNo ? findReceipt(state.selectedReceiptNo) : null;
      const selectedSt = selected ? getReceiptStatus(selected) : '';
      if (!selected || selectedSt === 'VOID' || selectedSt === 'CLEAR') {
        if (key === 'ESC') {
          playBeep();
          openTerminalScreen('receipts');
          return true;
        }
        return false;
      }
      if (!state.terminalEditFields || state.terminalEditFields.receiptNumber !== selected.receiptNumber) {
        state.terminalEditFields = {
          receiptNumber: selected.receiptNumber,
          vendorNo: String(selected.vendorNo || ''),
          deptNo: String(selected.deptNo || ''),
          invoiceNo: String(selected.invoiceNo || '')
        };
      }
      const ef = state.terminalEditFields;
      const fields = ['vendorNo', 'deptNo', 'invoiceNo'];
      if (!fields.includes(state.terminalActiveField)) state.terminalActiveField = 'vendorNo';
      const f = state.terminalActiveField;
      const meta = getTerminalFieldMeta('receipt-detail', f);

      if (key === 'ESC') {
        playBeep();
        openTerminalScreen('receipts');
        return true;
      }
      if (key === 'TAB') {
        state.terminalActiveField = fields[(fields.indexOf(f) + 1) % fields.length];
        playBeep();
        syncTerminalFieldsDom();
        return true;
      }
      if (/^[0-9]$/.test(key)) {
        if (String(ef[f] || '').length < meta.maxLen) {
          ef[f] = String(ef[f] || '') + key;
          playBeep();
          syncTerminalFieldsDom();
        } else {
          playError();
        }
        return true;
      }
      if (key === 'BKSP') {
        ef[f] = String(ef[f] || '').slice(0, -1);
        playBeep();
        syncTerminalFieldsDom();
        return true;
      }
      if (key === 'ENTER') {
        const saveBtn = document.getElementById('crt-btn-save-hdr');
        if (saveBtn) saveBtn.click();
        return true;
      }
      return false;
    }

    if (screen === 'suppliers') {
      if (key === 'SWITCH_MODE') {
        state.terminalAlphaMode = !state.terminalAlphaMode;
        playBeep();
        updateTerminalKeypadUI();
        return true;
      }
      if (key === 'DONE' || key === 'ESC' || key === 'ENTER') {
        if (state.terminalSupplierKeypadOpen) {
          state.terminalSupplierKeypadOpen = false;
          playBeep();
          updateTerminalKeypadUI();
        } else if (key === 'ESC') {
          playBeep();
          openTerminalScreen('menu');
        }
        return true;
      }
      if (key === 'CLR') {
        state.supplierQuery = '';
        state.terminalPage.suppliersSearch = 0;
        playBeep();
        renderTerminalUI();
        return true;
      }
      if (key === 'BKSP') {
        state.terminalSupplierKeypadOpen = true;
        state.supplierQuery = String(state.supplierQuery || '').slice(0, -1);
        state.terminalPage.suppliersSearch = 0;
        playBeep();
        renderTerminalUI();
        return true;
      }
      if (key === 'SPACE') {
        state.terminalSupplierKeypadOpen = true;
        state.supplierQuery = String(state.supplierQuery || '') + ' ';
        state.terminalPage.suppliersSearch = 0;
        playBeep();
        renderTerminalUI();
        return true;
      }
      if (/^[A-Z0-9]$/.test(key)) {
        state.terminalSupplierKeypadOpen = true;
        if (String(state.supplierQuery || '').length < 24) {
          state.supplierQuery = String(state.supplierQuery || '') + key;
          state.terminalPage.suppliersSearch = 0;
          playBeep();
          renderTerminalUI();
        } else {
          playError();
        }
        return true;
      }
      return false;
    }

    if (screen === 'tasks') {
      if (key === 'ESC') {
        playBeep();
        openTerminalScreen('menu');
        return true;
      }
      if (!isRecallCountInputReady()) return false;
      if (/^[0-9]$/.test(key)) {
        const cur = String(state.terminalRecallCount || '');
        if (cur.length < 3) {
          state.terminalRecallCount = cur + key;
          playBeep();
          syncTerminalFieldsDom();
        } else {
          playError();
        }
        return true;
      }
      if (key === 'BKSP') {
        state.terminalRecallCount = String(state.terminalRecallCount || '').slice(0, -1);
        playBeep();
        syncTerminalFieldsDom();
        return true;
      }
      if (key === 'CLR') {
        state.terminalRecallCount = '';
        playBeep();
        syncTerminalFieldsDom();
        return true;
      }
      if (key === 'ENTER') {
        const subBtn = document.getElementById('crt-btn-submit-recall');
        if (subBtn) subBtn.click();
        return true;
      }
      return false;
    }

    if (key === 'ESC') {
      playBeep();
      openTerminalScreen('menu');
      return true;
    }
    return false;
  }

  function startManualDraft() {
    state.manualDraft = {
      phase: 'headers', // 'headers' -> ENTER creates blank receipt -> 'scanning'
      receiptNumber: null,
      vendorNo: '',
      deptNo: '',
      invoiceNo: '',
      type: 'invoice',
      productCode: '',
      qty: '',
      items: [],
      error: '',
      success: ''
    };
  }

  function createBlankTerminalReceipt() {
    if (!state.manualDraft) startManualDraft();
    const draft = state.manualDraft;
    const vEl = document.getElementById('crt-in-vendor');
    const dEl = document.getElementById('crt-in-dept');
    const iEl = document.getElementById('crt-in-invoice');
    if (vEl) draft.vendorNo = (vEl.value || '').replace(/\D/g, '').slice(0, 3);
    if (dEl) draft.deptNo = (dEl.value || '').replace(/\D/g, '').slice(0, 2);
    if (iEl) draft.invoiceNo = (iEl.value || '').replace(/\D/g, '').slice(0, 6);

    draft.error = '';
    draft.success = '';
    const blankRes = validateAndCreateBlankReceipt({
      vendorNo: draft.vendorNo,
      deptNo: draft.deptNo,
      invoiceNo: draft.invoiceNo,
      source: 'terminal'
    });
    if (!blankRes.ok) {
      playError();
      draft.error = blankRes.error;
      renderTerminalUI();
      return false;
    }

    const rec = blankRes.receipt;
    draft.receiptNumber = rec.receiptNumber;
    draft.vendorNo = rec.vendorNo;
    draft.deptNo = rec.deptNo;
    draft.invoiceNo = rec.invoiceNo;
    draft.phase = 'scanning';
    draft.productCode = '';
    draft.qty = '';
    draft.items = [];
    draft.success = 'BLANK RECEIPT #' + rec.receiptNumber + ' CREATED! NOW ENTER ITEMS & QTYS.';
    state.terminalActiveField = 'productCode';
    playSuccess();
    renderTerminalUI();
    return true;
  }

  function renderTerminalUI() {
    const body = document.getElementById('terminal-screen-body');
    const titleEl = document.getElementById('terminal-screen-title');
    const backBtn = document.getElementById('terminal-back-btn');
    if (!body) return;

    enrichAllDeliveries();

    const screen = state.currentScreen || 'menu';
    if (backBtn) {
      backBtn.style.display = screen === 'menu' ? 'none' : 'inline-block';
      backBtn.textContent = screen === 'receipt-detail' ? '[ F12=LIST ]' : '[ F12=MENU ]';
    }

    const titles = {
      menu: '+== AS/400 DSD RECEIVING SYSTEM :: MAIN MENU',
      create: '+== [1] CREATE MANUAL DSD RECEIPT',
      receipts: '+== [2] RECEIPTS LEDGER (' + state.processedReceipts.length + ')',
      'receipt-detail': '+== [2A] RECEIPT DETAIL' + (state.selectedReceiptNo ? ' :: #' + state.selectedReceiptNo : ''),
      schedule: '+== [3] SHIFT RECEIVING SCHEDULE',
      tasks: '+== [4] RECEIVING TASKS & RECALLS',
      suppliers: '+== [5] SUPPLIERS & ITEM DIRECTORY'
    };
    if (titleEl) titleEl.textContent = titles[screen] || titles.menu;

    if (screen === 'menu') {
      renderTerminalMenu(body);
    } else if (screen === 'create') {
      renderTerminalCreate(body);
    } else if (screen === 'receipts') {
      renderTerminalReceipts(body);
    } else if (screen === 'receipt-detail') {
      renderTerminalReceiptDetail(body);
    } else if (screen === 'schedule') {
      renderTerminalSchedule(body);
    } else if (screen === 'tasks') {
      renderTerminalTasks(body);
    } else if (screen === 'suppliers') {
      renderTerminalSuppliers(body);
    }
    updateTerminalKeypadUI();
  }

  function getTerminalSummarySnapshot() {
    // 1. Receipts (Today's Initial vs Final)
    let initialCount = 0;
    let finalCount = 0;
    (state.processedReceipts || []).forEach((r) => {
      const st = getReceiptStatus(r);
      if (st === 'INITIAL') initialCount++;
      else if (st === 'FINAL') finalCount++;
    });

    // 2. Scheduled Deliveries & Warehouse Trucks (Active / Uncompleted)
    const manifest = typeof state.hooks.getDeliveryManifest === 'function' ? (state.hooks.getDeliveryManifest() || []) : [];
    const activeDeliveries = manifest.filter((d) => d && !d.completed && !d.refused);
    const whTrucks = activeDeliveries
      .filter((d) => d.type === 'warehouse')
      .sort((a, b) => ((a.etaHour || 6) * 60 + (a.etaMinute || 0)) - ((b.etaHour || 6) * 60 + (b.etaMinute || 0)))
      .map((t) => {
        const specs = Array.isArray(t.palletSpecs) ? t.palletSpecs : [];
        let dry = 0;
        let chilled = 0;
        let frozen = 0;
        specs.forEach((p) => {
          const z = p && p.targetZone;
          if (z === 'F') frozen++;
          else if (z === 'C') chilled++;
          else dry++;
        });
        const totalPallets = specs.length > 0 ? specs.length : (Number(t.totalPallets) || 0);
        return {
          etaText: t.etaText || 'TBD',
          totalPallets,
          dry,
          chilled,
          frozen
        };
      });
    const sideDoorCount = activeDeliveries.filter((d) => d.type === 'sidedoor').length;
    const vendorTruckCount = activeDeliveries.filter((d) => d.type !== 'warehouse' && d.type !== 'sidedoor').length;

    // 3. Unhandled Tasks by Type
    const ct = global.ClaimsTotes;
    const recallCount = (ct && typeof ct.getPendingRecallCount === 'function')
      ? ct.getPendingRecallCount()
      : ((ct && typeof ct.hasPendingRecall === 'function' && ct.hasPendingRecall()) ? 1 : 0);
    const pendingHo = (state.homeOfficeTasks || []).filter((t) => t && t.released && t.status === 'pending');
    const shortageCount = pendingHo.filter((t) => t.type === 'shortage').length;
    const overageCount = pendingHo.filter((t) => t.type === 'overage').length;
    const missingCount = pendingHo.filter((t) => t.type === 'receipt_not_found').length;
    const totalUnhandled = recallCount + shortageCount + overageCount + missingCount;

    return {
      initialCount,
      finalCount,
      activeCount: activeDeliveries.length,
      vendorTruckCount,
      sideDoorCount,
      whTrucks,
      recallCount,
      shortageCount,
      overageCount,
      missingCount,
      totalUnhandled
    };
  }

  function buildTerminalMenuSummaryHtml() {
    const numVal = (n) => '<span class="crt-sum-val' + (n === 0 ? ' is-zero' : '') + '">' + n + '</span>';
    const snap = getTerminalSummarySnapshot();

    const whTruckRowsHtml = snap.whTrucks.length > 0
      ? snap.whTrucks.map((t, idx) => {
        return '<div class="crt-sum-subrow" style="color:#bbf7d0;"><span>Truck #' + (idx + 1) + ' (' + escapeHtml(t.etaText) + ')</span>' + numVal(t.totalPallets) + '</div>' +
          '<div class="crt-sum-subrow"><span>D ' + t.dry + ' &nbsp; C ' + t.chilled + ' &nbsp; F ' + t.frozen + '</span></div>';
      }).join('')
      : ('<div class="crt-sum-subrow" style="color:#bbf7d0;"><span>Pallets</span>' + numVal(0) + '</div>' +
        '<div class="crt-sum-subrow"><span>D 0 &nbsp; C 0 &nbsp; F 0</span></div>');

    return `
      <div class="crt-sum-title">SHIFT SUMMARY</div>

      <div class="crt-sum-group">
        <div class="crt-sum-hdr"><span>RECEIPTS</span>${numVal(snap.initialCount + snap.finalCount)}</div>
        <div class="crt-sum-row"><span>Initial Receipts</span>${numVal(snap.initialCount)}</div>
        <div class="crt-sum-row"><span>Final Receipts</span>${numVal(snap.finalCount)}</div>
      </div>

      <div class="crt-sum-group">
        <div class="crt-sum-hdr"><span>SCHEDULED DELIVERIES</span>${numVal(snap.activeCount)}</div>
        <div class="crt-sum-row"><span>Vendor Trucks</span>${numVal(snap.vendorTruckCount)}</div>
        <div class="crt-sum-row"><span>Side Door</span>${numVal(snap.sideDoorCount)}</div>
        <div class="crt-sum-row"><span>Warehouse Trucks</span>${numVal(snap.whTrucks.length)}</div>
        ${whTruckRowsHtml}
      </div>

      <div class="crt-sum-group">
        <div class="crt-sum-hdr"><span>UNHANDLED TASKS</span>${numVal(snap.totalUnhandled)}</div>
        <div class="crt-sum-row"><span>Recalls</span>${numVal(snap.recallCount)}</div>
        <div class="crt-sum-row"><span>Shortages</span>${numVal(snap.shortageCount)}</div>
        <div class="crt-sum-row"><span>Overages</span>${numVal(snap.overageCount)}</div>
        <div class="crt-sum-row"><span>Missing Receipts</span>${numVal(snap.missingCount)}</div>
      </div>
    `;
  }

  function renderTerminalMenu(body) {
    const clock = getClock();
    const snap = clock ? clock.getTimeSnapshot() : { formatted12h: '6:00 AM', dateLabel: 'FEB 1, 1996', workdayIndex: 1 };

    body.innerHTML = `
      <div class="crt-meta-bar">
        <span>STORE #0412 :: SYS:DSD96 :: OP:RCVR01</span>
        <span id="crt-menu-clock">${escapeHtml(snap.dateLabel)} :: ${escapeHtml(snap.formatted12h)}</span>
      </div>
      <div class="crt-menu-layout">
        <div class="crt-menu-grid">
          <button class="crt-menu-card" data-crt-nav="create">
            <div class="crt-key">[1]</div>
            <div class="crt-card-title">CREATE MANUAL RECEIPT</div>
          </button>
          <button class="crt-menu-card" data-crt-nav="receipts">
            <div class="crt-key">[2]</div>
            <div class="crt-card-title">RECEIPTS LEDGER</div>
          </button>
          <button class="crt-menu-card" data-crt-nav="schedule">
            <div class="crt-key">[3]</div>
            <div class="crt-card-title">SHIFT RECEIVING SCHEDULE</div>
          </button>
          <button class="crt-menu-card" data-crt-nav="tasks">
            <div class="crt-key">[4]</div>
            <div class="crt-card-title">RECEIVING TASKS &amp; RECALLS</div>
          </button>
          <button class="crt-menu-card" data-crt-nav="suppliers">
            <div class="crt-key">[5]</div>
            <div class="crt-card-title">SUPPLIERS &amp; ITEM DIRECTORY</div>
          </button>
        </div>
        <div id="crt-menu-summary" class="crt-menu-summary">
          ${buildTerminalMenuSummaryHtml()}
        </div>
      </div>
      <div class="crt-meta-bar" style="margin-top:auto; margin-bottom:0; color:#facc15;">
        <span>SELECTION ===&gt; [ PRESS KEY 1-5 ]</span>
        <span style="color:#86efac;">F2=PAPER  F12=MENU  F3=CLOSE</span>
      </div>
    `;

    body.querySelectorAll('[data-crt-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playBeep();
        openTerminalScreen(btn.getAttribute('data-crt-nav'));
      });
    });
  }

  function renderTerminalCreate(body) {
    if (!state.manualDraft) startManualDraft();
    let draft = state.manualDraft;
    const catalog = getCatalog();

    // If working on a blank/open receipt, verify it still exists and pick up any header edits made in [2] Receipts
    if (draft.phase === 'scanning' && draft.receiptNumber) {
      const liveRec = findReceipt(draft.receiptNumber);
      if (!liveRec || liveRec.voided) {
        startManualDraft();
        draft = state.manualDraft;
      } else {
        draft.vendorNo = liveRec.vendorNo;
        draft.deptNo = liveRec.deptNo;
        draft.invoiceNo = liveRec.invoiceNo;
      }
    }

    if (draft.phase !== 'scanning') {
      if (!['deptNo', 'vendorNo', 'invoiceNo'].includes(state.terminalActiveField)) {
        state.terminalActiveField = 'deptNo';
      }
      const initialRecs = getInitialReceipts().slice(0, 4);
      const initialRows = initialRecs.map((ir) => {
        const irUnits = (ir.items || []).reduce((s, it) => s + Math.abs(Number(it.qty) || 0), 0);
        return `
          <tr class="crt-row-click" data-resume-rec="${escapeHtml(ir.receiptNumber)}">
            <td><strong>${escapeHtml(ir.receiptNumber)}</strong></td>
            <td>D#${escapeHtml(ir.deptNo)} / V#${escapeHtml(ir.vendorNo)}</td>
            <td>#${escapeHtml(ir.invoiceNo)}</td>
            <td>${irUnits} u</td>
            <td>${formatMoney(ir.totalAmount)}</td>
            <td><button class="crt-btn-sm" type="button" data-resume-rec="${escapeHtml(ir.receiptNumber)}">[ RESUME &gt; ]</button></td>
          </tr>
        `;
      }).join('');
      const resumeBlock = initialRecs.length > 0 ? `
        <div class="crt-section-hdr" style="margin-top:10px;">OR TAKE OVER OPEN INITIAL RECEIPT (${initialRecs.length})</div>
        <div class="crt-scroll-panel">
          <table class="crt-table">
            <thead><tr><th>RCPT #</th><th>D / V</th><th>INV #</th><th>UNITS</th><th>TOTAL</th><th>ACTION</th></tr></thead>
            <tbody>${initialRows}</tbody>
          </table>
        </div>
      ` : '';

      body.innerHTML = `
        <div class="crt-panel">
          <div class="crt-section-hdr">STEP 1: ENTER 3-FIELD HEADER &amp; PRESS [ENTER] TO CREATE BLANK RECEIPT</div>
          <div class="crt-form-row">
            <label>DEPT #
              <input id="crt-in-dept" data-term-field="deptNo" type="text" readonly inputmode="none" maxlength="2" placeholder="e.g. 10" value="${escapeHtml(draft.deptNo)}">
            </label>
            <label>VENDOR #
              <input id="crt-in-vendor" data-term-field="vendorNo" type="text" readonly inputmode="none" maxlength="3" placeholder="e.g. 101" value="${escapeHtml(draft.vendorNo)}">
            </label>
            <label>INVOICE #
              <input id="crt-in-invoice" data-term-field="invoiceNo" type="text" readonly inputmode="none" maxlength="6" placeholder="e.g. 582104" value="${escapeHtml(draft.invoiceNo)}">
            </label>
          </div>
          ${draft.error ? '<div class="crt-msg-err">' + escapeHtml(draft.error) + '</div>' : ''}
          ${draft.success ? '<div class="crt-msg-ok">' + escapeHtml(draft.success) + '</div>' : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:10px;">
            <span style="font-size:11px; color:#86efac;">[ENTER] CREATES INITIAL #DD-SSSS RECEIPT FOR LINE ENTRY</span>
            <div style="display:flex; gap:8px;">
              <button id="crt-btn-clear-draft" class="crt-btn-sm" type="button">[ CLEAR ]</button>
              <button id="crt-btn-create-blank" class="crt-btn crt-btn-primary" type="button">[ ENTER=CREATE RECEIPT ]</button>
            </div>
          </div>
          ${resumeBlock}
        </div>
      `;

      body.querySelectorAll('[data-term-field]').forEach((el) => {
        el.addEventListener('click', () => {
          state.terminalActiveField = el.getAttribute('data-term-field');
          playBeep();
          updateTerminalKeypadUI();
        });
      });

      body.querySelectorAll('[data-resume-rec]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          resumeReceiptInTerminal(el.getAttribute('data-resume-rec'));
        });
      });

      const createBtn = document.getElementById('crt-btn-create-blank');
      if (createBtn) createBtn.addEventListener('click', createBlankTerminalReceipt);

      const clrBtn = document.getElementById('crt-btn-clear-draft');
      if (clrBtn) {
        clrBtn.addEventListener('click', () => {
          startManualDraft();
          state.terminalActiveField = 'deptNo';
          playBeep();
          renderTerminalUI();
        });
      }
      return;
    }

    if (!['productCode', 'quantity'].includes(state.terminalActiveField)) {
      state.terminalActiveField = 'productCode';
    }

    const allNegativeDraft = draft.items.length > 0 && draft.items.every((it) => it.qty < 0);
    const createPg = paginateItems(draft.items, 'create', 6);
    const itemsRows = createPg.items.map((it, idx) => {
      const realIdx = createPg.startIdx + idx;
      const packVal = (allNegativeDraft || draft.type === 'credit' || Number(it.qty) < 0)
        ? 1
        : (draft.deptNo === '01' ? 1 : getItemUnitsPerCase(it, 'sidedoor'));
      return `
      <tr>
        <td>${escapeHtml(it.code)}</td>
        <td style="text-align:right; color:#86efac;">${packVal}</td>
        <td>${escapeHtml(it.name)}</td>
        <td>${it.qty}</td>
        <td>${formatMoney(it.price)}</td>
        <td>${formatMoney(it.qty * it.price)}</td>
        <td><button class="crt-btn-sm crt-btn-danger" type="button" data-del-line="${realIdx}">[ DEL ]</button></td>
      </tr>
    `;
    }).join('');
    const total = draft.items.reduce((s, it) => s + (it.qty * it.price), 0);

    body.innerHTML = `
      <div class="crt-panel" style="display:flex; flex-direction:column; flex:1 1 auto; min-height:0; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; padding-bottom:6px; border-bottom:1px solid #166534; margin-bottom:8px;">
          <div>
            <strong style="color:#4ade80; font-size:13px;">OPEN RECEIPT #${escapeHtml(draft.receiptNumber)}</strong>
            <span style="font-size:11px; color:#facc15; margin-left:8px;">V#${escapeHtml(draft.vendorNo)} · D#${escapeHtml(draft.deptNo)} · INV #${escapeHtml(draft.invoiceNo)}</span>
          </div>
          <span style="font-size:10px; color:#94a3b8;">Wrong header? Edit in [2] View/Edit Receipts</span>
        </div>

        <div class="crt-section-hdr">STEP 2: ENTER ITEMS &amp; QTYS (SUM BY UPC/PLU, OR &plusmn; NEGATIVE TO SUBTRACT)</div>
        <div class="crt-form-row">
          <label style="flex:2;">UPC / PLU CODE
            <input id="crt-in-code" data-term-field="productCode" type="text" readonly inputmode="none" maxlength="14" placeholder="Enter UPC/PLU via keypad" value="${escapeHtml(draft.productCode)}">
          </label>
          <label style="flex:1;">QTY
            <input id="crt-in-qty" data-term-field="quantity" type="text" readonly inputmode="none" maxlength="4" placeholder="1 or -2" value="${escapeHtml(draft.qty)}">
          </label>
          <label style="flex:1;">DOC TYPE
            <button id="crt-in-doctype" type="button" class="crt-btn" style="height:31px; width:100%; background:${(allNegativeDraft || draft.type === 'credit') ? '#450a0a' : '#052e16'}; color:${(allNegativeDraft || draft.type === 'credit') ? '#fca5a5' : '#86efac'}; border-color:${(allNegativeDraft || draft.type === 'credit') ? '#ef4444' : '#22c55e'};">${(allNegativeDraft || draft.type === 'credit') ? '[ CREDIT (-) ]' : '[ INVOICE (+) ]'}</button>
          </label>
          <div style="display:flex; align-items:flex-end;">
            <button id="crt-btn-add-line" class="crt-btn" type="button">[ ADD LINE ]</button>
          </div>
        </div>

        ${draft.error ? '<div class="crt-msg-err">' + escapeHtml(draft.error) + '</div>' : ''}
        ${draft.success ? '<div class="crt-msg-ok">' + escapeHtml(draft.success) + '</div>' : ''}

        <div class="crt-scroll-panel" style="margin-top:8px;">
          <table class="crt-table">
            <thead>
              <tr><th>CODE</th><th style="text-align:right;">PACK</th><th>ITEM NAME</th><th>QTY</th><th>UNIT $</th><th>EXT $</th><th>ACT</th></tr>
            </thead>
            <tbody>
              ${itemsRows || '<tr><td colspan="7" style="text-align:center; opacity:0.65;">Blank receipt created — add items &amp; quantities above.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:6px;">
          <span style="color:#86efac; font-weight:700;">DOCUMENT TOTAL: ${formatMoney(total)}</span>
          <div style="display:flex; gap:8px;">
            <button id="crt-btn-clear-draft" class="crt-btn-sm" type="button">[ NEW RECEIPT ]</button>
            <button id="crt-btn-save-receipt" class="crt-btn crt-btn-primary" type="button">[ FINALIZE #${escapeHtml(draft.receiptNumber)} ]</button>
          </div>
        </div>
        ${renderTerminalPager(createPg)}
      </div>
    `;

    const syncInputs = () => {
      draft.productCode = (document.getElementById('crt-in-code').value || '').trim();
      draft.qty = (document.getElementById('crt-in-qty').value || '').trim();
    };

    const docTypeBtn = document.getElementById('crt-in-doctype');
    if (docTypeBtn) {
      docTypeBtn.addEventListener('click', () => {
        draft.type = draft.type === 'credit' ? 'invoice' : 'credit';
        playBeep();
        renderTerminalUI();
      });
    }

    body.querySelectorAll('[data-term-field]').forEach((el) => {
      el.addEventListener('click', () => {
        state.terminalActiveField = el.getAttribute('data-term-field');
        playBeep();
        updateTerminalKeypadUI();
      });
    });

    document.getElementById('crt-btn-add-line').addEventListener('click', () => {
      syncInputs();
      draft.error = '';
      draft.success = '';
      const prod = catalog ? catalog.getProduct(draft.productCode) : null;
      if (!prod) {
        playError();
        draft.error = 'Unknown UPC/PLU "' + draft.productCode + '". Look up valid codes in [5] Suppliers.';
        renderTerminalUI();
        return;
      }
      const rawQ = draft.qty === '' ? 1 : parseInt(draft.qty, 10);
      if (!rawQ || Number.isNaN(rawQ)) {
        playError();
        draft.error = 'Enter a non-zero quantity (e.g. 2 to add, or -2 to subtract).';
        renderTerminalUI();
        return;
      }
      const signedQty = (draft.type === 'credit' && rawQ > 0) ? -rawQ : rawQ;
      const existing = draft.items.find((it) => it.code === prod.code);
      if (existing) {
        existing.qty += signedQty;
        if (existing.qty === 0) {
          draft.items.splice(draft.items.indexOf(existing), 1);
        }
      } else {
        draft.items.push({ code: prod.code, name: prod.name, qty: signedQty, price: prod.price, notScannable: prod.notScannable, type: prod.type });
      }
      draft.type = (draft.items.length > 0 && draft.items.every((it) => it.qty < 0)) ? 'credit' : 'invoice';
      draft.productCode = '';
      draft.qty = '';
      state.terminalActiveField = 'productCode';
      syncReceiptItems(draft.receiptNumber, draft.items);
      playSuccess();
      renderTerminalUI();
    });

    body.querySelectorAll('[data-del-line]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncInputs();
        draft.items.splice(parseInt(btn.getAttribute('data-del-line'), 10), 1);
        draft.type = (draft.items.length > 0 && draft.items.every((it) => it.qty < 0)) ? 'credit' : 'invoice';
        syncReceiptItems(draft.receiptNumber, draft.items);
        playBeep();
        renderTerminalUI();
      });
    });

    document.getElementById('crt-btn-clear-draft').addEventListener('click', () => {
      startManualDraft();
      state.terminalActiveField = 'deptNo';
      playBeep();
      renderTerminalUI();
    });

    document.getElementById('crt-btn-save-receipt').addEventListener('click', () => {
      draft.error = '';
      draft.success = '';
      if (draft.items.length === 0) {
        playError();
        draft.error = 'Add at least 1 line item before finalizing receipt #' + draft.receiptNumber + '.';
        renderTerminalUI();
        return;
      }

      const rec = syncReceiptItems(draft.receiptNumber, draft.items, { finalized: true });
      if (!rec) {
        playError();
        draft.error = 'Receipt #' + draft.receiptNumber + ' is missing or voided.';
        renderTerminalUI();
        return;
      }

      resolveNightDropByInvoiceNo(rec.invoiceNo, rec.receiptNumber);
      syncActiveDeliveryLinkForReceipt(rec);

      playSuccess();
      const savedNo = rec.receiptNumber;
      startManualDraft();
      state.manualDraft.success = 'FINALIZED RECEIPT #' + savedNo + ' IN DAILY LEDGER.';
      state.terminalActiveField = 'deptNo';
      renderTerminalUI();
    });

    bindTerminalPager(body, 'create');
  }

  function formatReceiptStatusTag(status, bracketed) {
    const colors = {
      INITIAL: '#38bdf8',
      FINAL: '#4ade80',
      VOID: '#ef4444',
      CLEAR: '#94a3b8'
    };
    const color = colors[status] || '#4ade80';
    const label = bracketed ? '[' + status + ']' : status;
    return '<span style="color:' + color + '; font-weight:800;">' + label + '</span>';
  }

  function renderTerminalReceipts(body) {
    const receipts = getReceipts(true);
    const eligibleDaily = receipts.filter(isDailyFilingReceiptEligible);
    const printedStoreCount = eligibleDaily.filter((r) => Boolean(r.storeCopyPrinted)).length;
    const pendingStoreCount = eligibleDaily.length - printedStoreCount;
    const pg = paginateItems(receipts, 'receipts', 10);
    const listRows = pg.items.map((r) => {
      const totalCases = (r.items || []).reduce((sum, it) => sum + Math.abs(Number(it.qty) || 0), 0);
      const st = getReceiptStatus(r);
      const hoTag = isHomeOfficeTaskArchiveReceipt(r) ? ' <span style="color:#38bdf8;font-size:10px;font-weight:800;">[HO]</span>' : '';
      return `
        <tr class="crt-row-click" data-rec-no="${escapeHtml(r.receiptNumber)}">
          <td><strong>${escapeHtml(r.receiptNumber)}</strong></td>
          <td>${r.type === 'credit' ? '<span style="color:#f59e0b;">CRD</span>' : 'INV'}${hoTag}</td>
          <td>D#${escapeHtml(r.deptNo)} / V#${escapeHtml(r.vendorNo)}</td>
          <td>#${escapeHtml(r.invoiceNo)}</td>
          <td>${totalCases}</td>
          <td>${formatMoney(r.totalAmount)}</td>
          <td>${formatReceiptStatusTag(st, false)}</td>
          <td><button class="crt-btn-sm" type="button" data-open-rec="${escapeHtml(r.receiptNumber)}">[ VIEW ]</button></td>
        </tr>
      `;
    }).join('');

    body.innerHTML = `
      <div class="crt-meta-bar">
        <span>DAILY PROCESSED RECEIPTS LEDGER (${receipts.length})</span>
        <span>CLICK ANY RECEIPT OR [VIEW] TO INSPECT DETAILS</span>
      </div>
      <div class="crt-ledger-printbar">
        <div>
          <strong>STORE COPIES:</strong>
          <span style="color:${pendingStoreCount === 0 && eligibleDaily.length > 0 ? '#4ade80' : '#facc15'}; font-weight:900;">
            ${printedStoreCount}/${eligibleDaily.length}
          </span>
        </div>
        <button id="crt-btn-print-all-store-copies" class="crt-btn crt-btn-primary" type="button" ${pendingStoreCount === 0 ? 'disabled' : ''}>
          [ PRINT STORE COPIES ]
        </button>
      </div>
      <div class="crt-scroll-panel">
        <table class="crt-table">
          <thead><tr><th>RCPT #</th><th>TYPE</th><th>D/V</th><th>INV #</th><th>CASES</th><th>TOTAL</th><th>STATUS</th><th>ACTION</th></tr></thead>
          <tbody>
            ${listRows || '<tr><td colspan="8" style="text-align:center; opacity:0.65;">No receipts created yet this shift.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${renderTerminalPager(pg)}
    `;

    bindTerminalPager(body, 'receipts');

    const printAllBtn = document.getElementById('crt-btn-print-all-store-copies');
    if (printAllBtn) {
      printAllBtn.addEventListener('click', () => {
        const res = printAllDailyStoreCopies();
        if (res.newlyPrintedCount > 0) playSuccess();
        else playBeep();
        renderTerminalUI();
      });
    }

    const openDetail = (recNo) => {
      if (!recNo) return;
      state.selectedReceiptNo = recNo;
      playBeep();
      openTerminalScreen('receipt-detail');
    };

    body.querySelectorAll('[data-rec-no]').forEach((row) => {
      row.addEventListener('click', () => {
        openDetail(row.getAttribute('data-rec-no'));
      });
    });

    body.querySelectorAll('[data-open-rec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(btn.getAttribute('data-open-rec'));
      });
    });
  }

  function renderTerminalReceiptDetail(body) {
    const selected = state.selectedReceiptNo ? findReceipt(state.selectedReceiptNo) : null;
    if (!selected) {
      body.innerHTML = `
        <div class="crt-panel">
          <div style="margin-bottom:10px;">Receipt not found or no receipt selected.</div>
          <button id="crt-btn-back-receipts" class="crt-btn" type="button">[ F12=BACK TO RECEIPTS ]</button>
        </div>
      `;
      const backListBtn = document.getElementById('crt-btn-back-receipts');
      if (backListBtn) {
        backListBtn.addEventListener('click', () => {
          playBeep();
          openTerminalScreen('receipts');
        });
      }
      return;
    }

    const detailPg = paginateItems(selected.items, 'receiptDetail', 6);
    const lineRows = detailPg.items.map((it) => {
      const packVal = (selected.type === 'credit' || Number(it.qty) < 0)
        ? 1
        : (selected.deptNo === '01' ? 1 : getItemUnitsPerCase(it, 'sidedoor'));
      return `
      <tr>
        <td>${escapeHtml(it.code)}</td>
        <td style="text-align:right; color:#86efac;">${packVal}</td>
        <td>${escapeHtml(it.name)}</td>
        <td>${it.qty}</td>
        <td>${formatMoney(it.price)}</td>
        <td>${formatMoney(it.qty * it.price)}</td>
      </tr>
    `;
    }).join('');

    const status = getReceiptStatus(selected);
    const isInitial = status === 'INITIAL';
    const isLockedAll = status === 'VOID' || status === 'CLEAR';

    if (!state.terminalEditFields || state.terminalEditFields.receiptNumber !== selected.receiptNumber) {
      state.terminalEditFields = {
        receiptNumber: selected.receiptNumber,
        vendorNo: String(selected.vendorNo || ''),
        deptNo: String(selected.deptNo || ''),
        invoiceNo: String(selected.invoiceNo || '')
      };
    }
    const ef = state.terminalEditFields;
    const sectionNote = status === 'CLEAR'
      ? 'PROCESSED BY BILLING (CLEAR) — READ-ONLY'
      : (status === 'VOID'
        ? 'VOIDED RECEIPT — READ-ONLY'
        : (isInitial
          ? 'INITIAL RECEIPT — RESUME TO ADD/REMOVE ITEMS OR EDIT HEADER'
          : 'LINE ITEMS READ-ONLY (FINAL) — HEADER FIELDS MAY BE MODIFIED'));

    body.innerHTML = `
      <div class="crt-panel" style="display:flex; flex-direction:column; flex:1 1 auto; min-height:0; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px; border-bottom:1px solid #166534; padding-bottom:6px;">
          <div>
            <strong style="color:#4ade80; font-size:14px;">RECEIPT #${escapeHtml(selected.receiptNumber)}</strong>
            <span style="font-size:11px; color:#86efac; margin-left:8px;">[${selected.type === 'credit' ? 'CREDIT' : 'INVOICE'} :: ${escapeHtml(selected.source.toUpperCase())} :: ${escapeHtml(selected.time)}]</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span>${formatReceiptStatusTag(status, true)}</span>
            <button id="crt-btn-back-receipts" class="crt-btn-sm" type="button">[ F12=LIST ]</button>
          </div>
        </div>

        <div class="crt-form-row">
          <label>VENDOR # ${isLockedAll ? '(LOCKED)' : '(EDITABLE)'}
            <input id="crt-edit-vendor" data-term-field="vendorNo" type="text" readonly inputmode="none" maxlength="3" value="${escapeHtml(ef.vendorNo)}" ${isLockedAll ? 'disabled' : ''}>
          </label>
          <label>DEPT # ${isLockedAll ? '(LOCKED)' : '(EDITABLE)'}
            <input id="crt-edit-dept" data-term-field="deptNo" type="text" readonly inputmode="none" maxlength="2" value="${escapeHtml(ef.deptNo)}" ${isLockedAll ? 'disabled' : ''}>
          </label>
          <label>INVOICE # ${isLockedAll ? '(LOCKED)' : '(EDITABLE)'}
            <input id="crt-edit-invoice" data-term-field="invoiceNo" type="text" readonly inputmode="none" maxlength="6" value="${escapeHtml(ef.invoiceNo)}" ${isLockedAll ? 'disabled' : ''}>
          </label>
        </div>
        <div id="crt-edit-msg" style="min-height:16px; font-size:11px; margin-top:4px;"></div>

        <div class="crt-section-hdr" style="margin-top:4px;">${sectionNote}</div>
        <div class="crt-scroll-panel">
          <table class="crt-table">
            <thead><tr><th>CODE</th><th style="text-align:right;">PACK</th><th>ITEM</th><th>QTY</th><th>PRICE</th><th>TOTAL</th></tr></thead>
            <tbody>${lineRows || '<tr><td colspan="6" style="text-align:center; opacity:0.65;">No line items recorded.</td></tr>'}</tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:6px;">
          <span>TOTAL: <strong>${formatMoney(selected.totalAmount)}</strong></span>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${isInitial ? '<button id="crt-btn-resume-rec" class="crt-btn crt-btn-primary" type="button">[ RESUME INITIAL ]</button>' : ''}
            ${(selected.finalized && !selected.voided) ? `<button id="crt-btn-reprint-rec" class="crt-btn crt-btn-primary" type="button">[ ${(selected.printCount || 0) > 0 ? 'REPRINT RECEIPT' : 'PRINT RECEIPT'} ]</button>` : ''}
            ${isDailyFilingReceiptEligible(selected) ? `<button id="crt-btn-store-copy" class="crt-btn crt-btn-primary" type="button">[ ${selected.storeCopyPrinted ? 'REPRINT STORE COPY ✓' : 'PRINT STORE COPY'} ]</button>` : ''}
            ${isLockedAll ? '' : '<button id="crt-btn-void-rec" class="crt-btn-sm crt-btn-danger" type="button">[ VOID RECEIPT ]</button>'}
            ${isLockedAll ? '' : '<button id="crt-btn-save-hdr" class="crt-btn crt-btn-primary" type="button">[ SAVE HEADER ]</button>'}
          </div>
        </div>
        ${renderTerminalPager(detailPg)}
      </div>
    `;

    bindTerminalPager(body, 'receiptDetail');

    const storeCopyBtn = document.getElementById('crt-btn-store-copy');
    if (storeCopyBtn) {
      storeCopyBtn.addEventListener('click', () => {
        const res = printSingleStoreCopy(selected.receiptNumber);
        if (!res.ok) {
          playError();
          const msgEl = document.getElementById('crt-edit-msg');
          if (msgEl) msgEl.innerHTML = '<span style="color:#f87171;">[ERR] ' + escapeHtml(res.error) + '</span>';
        } else {
          playSuccess();
          renderTerminalUI();
          const newMsgEl = document.getElementById('crt-edit-msg');
          if (newMsgEl) {
            newMsgEl.innerHTML = '<span style="color:#4ade80;">[OK] Printed mini Store Copy #' + escapeHtml(selected.receiptNumber) + ' → sent directly to Daily Filing Folder.</span>';
          }
        }
      });
    }

    const reprintBtn = document.getElementById('crt-btn-reprint-rec');
    if (reprintBtn) {
      reprintBtn.addEventListener('click', () => {
        const res = printReceiptSlip(selected.receiptNumber, { fromTerminal: true });
        const msgEl = document.getElementById('crt-edit-msg');
        if (!res.ok) {
          playError();
          if (msgEl) msgEl.innerHTML = '<span style="color:#f87171;">[ERR] ' + escapeHtml(res.error) + '</span>';
        } else {
          playSuccess();
          renderTerminalUI();
          const newMsgEl = document.getElementById('crt-edit-msg');
          if (newMsgEl) {
            const copyTxt = res.slip.isCopy ? ('COPY #' + res.slip.copyNumber) : 'ORIGINAL';
            newMsgEl.innerHTML = '<span style="color:#4ade80;">[OK] Printed ' + escapeHtml(copyTxt) + ' #' + escapeHtml(selected.receiptNumber) + ' on Desk Printer.</span>';
          }
        }
      });
    }

    const resumeBtn = document.getElementById('crt-btn-resume-rec');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        resumeReceiptInTerminal(selected.receiptNumber);
      });
    }

    body.querySelectorAll('[data-term-field]').forEach((el) => {
      el.addEventListener('click', () => {
        if (isLockedAll) return;
        state.terminalActiveField = el.getAttribute('data-term-field');
        playBeep();
        updateTerminalKeypadUI();
      });
    });

    const backListBtn = document.getElementById('crt-btn-back-receipts');
    if (backListBtn) {
      backListBtn.addEventListener('click', () => {
        playBeep();
        openTerminalScreen('receipts');
      });
    }

    const saveHdrBtn = document.getElementById('crt-btn-save-hdr');
    if (saveHdrBtn) {
      saveHdrBtn.addEventListener('click', () => {
        const res = updateReceiptHeader(selected.receiptNumber, {
          vendorNo: document.getElementById('crt-edit-vendor').value,
          deptNo: document.getElementById('crt-edit-dept').value,
          invoiceNo: document.getElementById('crt-edit-invoice').value
        });
        const msgEl = document.getElementById('crt-edit-msg');
        if (!res.ok) {
          playError();
          if (msgEl) msgEl.innerHTML = '<span style="color:#f87171;">[ERR] ' + escapeHtml(res.error) + '</span>';
        } else {
          state.terminalEditFields = {
            receiptNumber: res.receipt.receiptNumber,
            vendorNo: res.receipt.vendorNo,
            deptNo: res.receipt.deptNo,
            invoiceNo: res.receipt.invoiceNo
          };
          playSuccess();
          renderTerminalUI();
        }
      });
    }

    const voidBtn = document.getElementById('crt-btn-void-rec');
    if (voidBtn) {
      voidBtn.addEventListener('click', () => {
        voidReceipt(selected.receiptNumber);
        playBeep();
        renderTerminalUI();
      });
    }
  }

  function renderTerminalSchedule(body) {
    const manifest = typeof state.hooks.getDeliveryManifest === 'function' ? state.hooks.getDeliveryManifest() : [];

    const sortedManifest = (manifest || []).slice().sort((a, b) => {
      const am = ((a.etaHour || 6) * 60 + (a.etaMinute || 0));
      const bm = ((b.etaHour || 6) * 60 + (b.etaMinute || 0));
      return am - bm;
    });

    const whAll = sortedManifest.filter((d) => d.type === 'warehouse');
    const whPending = whAll.filter((d) => !d.completed && !d.refused).length;
    const dsdPending = sortedManifest.filter((d) => d.type !== 'warehouse' && !d.completed && !d.refused).length;

    const schedPg = paginateItems(sortedManifest, 'schedule', 10);
    const dRows = schedPg.items.map((d) => {
      const isWh = d.type === 'warehouse';
      const isSideDoor = d.type === 'sidedoor';
      const statusText = typeof state.hooks.getDeliveryStatusLabel === 'function'
        ? state.hooks.getDeliveryStatusLabel(d)
        : (d.refused ? 'REFUSED' : (d.completed ? (isWh ? 'BOL SIGNED ✓' : 'SIGNED ✓') : (d.receiptCreated ? 'READY TO SIGN' : 'SCHEDULED')));

      const isDone = Boolean(d.completed || d.refused);
      const badgeColor = d.refused ? '#f87171' : (d.completed ? '#4ade80' : (isWh ? '#f87171' : (d.receiptCreated ? '#38bdf8' : '#facc15')));
      const rowBg = isWh && !isDone ? 'background: rgba(220, 38, 38, 0.14);' : (isDone ? 'opacity: 0.62;' : '');

      let typeBadge = '<span style="background:#b45309;color:#fef3c7;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:800;letter-spacing:0.4px;">VND TRUCK</span>';
      if (isWh) {
        typeBadge = '<span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:800;letter-spacing:0.4px;">WAREHOUSE</span>';
      } else if (isSideDoor) {
        typeBadge = '<span style="background:#15803d;color:#dcfce7;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:800;letter-spacing:0.4px;">SIDE DOOR</span>';
      }

      const supplierName = d.carrier || d.vendor || 'Supplier';
      const deptTag = d.deptNo ? `<span style="color:#86efac; font-size:11px; margin-left:5px;">D#${escapeHtml(d.deptNo)}</span>` : '';

      return `
        <tr style="${rowBg}">
          <td style="white-space:nowrap; font-weight:700; color:#e2e8f0;">${escapeHtml(d.etaText || '6:00 AM')}</td>
          <td style="white-space:nowrap;">${typeBadge}</td>
          <td><span style="font-weight:700;">${escapeHtml(supplierName)}</span>${deptTag}</td>
          <td style="white-space:nowrap; color:${badgeColor}; font-weight:800;">${escapeHtml(statusText)}</td>
        </tr>
      `;
    }).join('');

    body.innerHTML = `
      <div class="crt-meta-bar">
        <span>SHIFT RECEIVING SCHEDULE (06:00 - 12:00)</span>
        <span>WAREHOUSE: <strong style="color:#f87171;">${whPending}/${whAll.length}</strong> &nbsp;|&nbsp; DSD: <strong style="color:#facc15;">${dsdPending}</strong></span>
      </div>
      <div class="crt-scroll-panel">
        <table class="crt-table">
          <thead>
            <tr>
              <th>ETA</th>
              <th>TYPE</th>
              <th>SUPPLIER / DEPT</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>${dRows || '<tr><td colspan="4" style="text-align:center; opacity:0.65;">No scheduled deliveries.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="crt-meta-bar" style="margin-top:6px; margin-bottom:4px; color:#86efac;">
        <span>PRIORITY RULE: UNLOAD WAREHOUSE TRUCKS BEFORE DSD VENDORS (-150 PTS PENALTY).</span>
      </div>
      ${renderTerminalPager(schedPg)}
    `;
    bindTerminalPager(body, 'schedule');
  }

  function formatMinute12h(totalMins) {
    const mins = Math.max(0, Math.round(Number(totalMins) || 360));
    const h24 = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + suffix;
  }

  function isHomeOfficeTaskArchiveReceipt(rec) {
    if (!rec || !rec.invoiceNo) return false;
    const inv = padDigits(rec.invoiceNo, 6);
    const matchesTask = state.homeOfficeTasks.some((t) => t.released && t.invoiceNo === inv);
    if (!matchesTask) return false;
    if (state.nightDropInvoices.some((nd) => nd.invoiceNo === inv)) return false;
    if (state.resolvedNightDrops.some((nd) => nd.invoiceNo === inv)) return false;
    const manifest = typeof state.hooks.getDeliveryManifest === 'function'
      ? (state.hooks.getDeliveryManifest() || [])
      : [];
    const matchesDelivery = manifest.some((raw) => {
      const d = enrichDelivery(raw);
      return padDigits(d.invoiceNo, 6) === inv || getCreditInvoiceNo(d) === inv;
    });
    return !matchesDelivery;
  }

  function getPendingHomeOfficeTaskCount() {
    return state.homeOfficeTasks.filter((t) => t.released && t.status === 'pending').length;
  }

  function findArchivedVendorByInvoice(invoiceNo, vendorNo) {
    const inv = padDigits(invoiceNo, 6);
    const vStr = vendorNo ? padDigits(vendorNo, 3) : null;
    for (let i = 0; i < state.archiveData.length; i++) {
      const day = state.archiveData[i];
      if (!day || day.isToday || day.placeholder || !Array.isArray(day.vendors)) continue;
      for (let j = 0; j < day.vendors.length; j++) {
        const v = day.vendors[j];
        if (!v) continue;
        if (padDigits(v.invoiceNo, 6) === inv && (!vStr || padDigits(v.vendorNo, 3) === vStr)) {
          return { day: day, vendor: v, dayIdx: i, vendorIdx: j };
        }
      }
    }
    return null;
  }

  function updateHomeOfficeTasks(snap) {
    if (!Array.isArray(state.homeOfficeTasks) || state.homeOfficeTasks.length === 0) return;
    const clock = getClock();
    const s = snap || (clock ? clock.getTimeSnapshot() : null);
    if (!s) return;
    const curMinutes = (Number(s.hour) || 0) * 60 + (Number(s.minute) || 0);
    const cfg = (getCatalog() && getCatalog().SHIFT_CONFIG) || {};
    const cutoffMinute = Number(cfg.taskCutoffMinute) || 690; // 11:30 AM hard cutoff

    const newlyReleased = [];
    state.homeOfficeTasks.forEach((task) => {
      if (!task || task.released) return;
      if (task.releaseMinute > cutoffMinute) return;
      if (curMinutes >= task.releaseMinute) {
        task.released = true;
        newlyReleased.push(task);
      }
    });

    if (newlyReleased.length > 0) {
      playBeep();
      newlyReleased.forEach((task) => {
        const kindTag = task.type === 'shortage'
          ? 'SHORTAGE TASK'
          : (task.type === 'overage' ? 'OVERAGE TASK' : 'MISSING RECEIPT');
        notify('📬 RECEIVING TASK (' + kindTag + '): ' + task.vendorName + ' Inv #' + task.invoiceNo + ' — Terminal [4].', 4500);
      });
      if (state.terminalOpen && (state.currentScreen === 'tasks' || state.currentScreen === 'menu')) {
        renderTerminalUI();
      }
    }
  }

  function generateHomeOfficeTasksForShift() {
    state.homeOfficeTasks = [];
    state.terminalPage.tasks = 0;

    if (!Array.isArray(state.archiveData) || state.archiveData.length <= 1) return;

    const cfg = (getCatalog() && getCatalog().SHIFT_CONFIG) || {};
    const minT = Number(cfg.minTasks) || 2;
    const maxT = Number(cfg.maxTasks) || 4;
    const cutoffMinute = Number(cfg.taskCutoffMinute) || 690; // 11:30 AM
    const desiredCount = minT + Math.floor(Math.random() * (Math.max(minT, maxT) - minT + 1));

    // Collect clean historical January candidate folders (excluding Dept 01 warehouse and pre-existing static shorts)
    const candidates = [];
    const invoiceCounts = {};
    state.archiveData.forEach((day, dayIdx) => {
      if (!day || day.isToday || day.placeholder || !Array.isArray(day.vendors)) return;
      day.vendors.forEach((v) => {
        if (!v || !v.invoiceNo) return;
        const invKey = padDigits(v.invoiceNo, 6);
        invoiceCounts[invKey] = (invoiceCounts[invKey] || 0) + 1;
      });
    });

    state.archiveData.forEach((day, dayIdx) => {
      if (!day || day.isToday || day.placeholder || !Array.isArray(day.vendors)) return;
      day.vendors.forEach((v) => {
        if (!v || v.deptNo === '01' || v.hasShort || !Array.isArray(v.items) || v.items.length === 0) return;
        const invNo = padDigits(v.invoiceNo, 6);
        if ((invoiceCounts[invNo] || 0) !== 1) return;
        const primaryRec = (v.receipts || []).find((r) => r && r.type !== 'credit' && padDigits(r.invoiceNo, 6) === invNo);
        if (!primaryRec || !Array.isArray(primaryRec.items) || primaryRec.items.length === 0) return;
        candidates.push({ dayIdx: dayIdx, day: day, vendor: v, primaryRec: primaryRec });
      });
    });

    if (candidates.length === 0) return;
    const shuffled = candidates.slice().sort(() => Math.random() - 0.5);
    const taskCount = Math.min(desiredCount, shuffled.length);

    // First task starts immediately at 6:00 AM (360); remaining tasks arrive across morning window up to 11:25 AM (<= 690)
    const maxReleaseMin = Math.min(685, cutoffMinute - 5);
    const releaseMinutes = [360];
    for (let i = 1; i < taskCount; i++) {
      releaseMinutes.push(375 + Math.floor(Math.random() * Math.max(1, maxReleaseMin - 375 + 1)));
    }
    releaseMinutes.sort((a, b) => a - b);

    for (let i = 0; i < taskCount; i++) {
      const pick = shuffled[i];
      const day = pick.day;
      const v = pick.vendor;
      const rec = pick.primaryRec;
      const invNo = padDigits(v.invoiceNo, 6);
      const isInitialShiftTask = state.homeOfficeTasks.length === 0;
      const releaseMin = isInitialShiftTask ? 360 : releaseMinutes[Math.min(i, releaseMinutes.length - 1)];

      const roll = Math.random();
      const taskType = roll < 0.35 ? 'shortage' : (roll < 0.65 ? 'overage' : 'receipt_not_found');

      if (taskType === 'shortage') {
        let targetItem = v.items.slice().sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0))[0];
        if (!targetItem) continue;
        const upc = getItemUnitsPerCase(targetItem, v.deptNo === '01' ? 'warehouse' : 'sidedoor');
        if (Math.round((Number(targetItem.qty) || 0) / upc) < 2) {
          targetItem.qty = 3 * upc;
          targetItem.receivedQty = 3 * upc;
          targetItem.unitsPerCase = upc;
          v.totalAmount = Number(v.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2));
        }
        const invQty = Number(targetItem.qty) || (3 * upc);
        const billedCases = Math.max(2, Math.round(invQty / upc));
        const maxDropCases = Math.min(2, billedCases - 1);
        const diffCases = 1 + Math.floor(Math.random() * Math.max(1, maxDropCases));
        const diff = diffCases * upc;
        const reportedRecQty = invQty - diff;

        const recLine = rec.items.find((ri) => String(ri.code) === String(targetItem.code));
        if (!recLine) continue;
        recLine.qty = reportedRecQty;
        rec.totalAmount = Number(rec.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2));

        const isVendorShort = Math.random() < 0.5;
        if (isVendorShort) {
          v.hasShort = true;
          targetItem.archivedShort = true;
          targetItem.receivedQty = reportedRecQty;
        } else {
          v.hasShort = false;
          targetItem.archivedShort = false;
          targetItem.receivedQty = invQty;
        }

        state.homeOfficeTasks.push({
          id: 'ho_task_' + (i + 1) + '_' + invNo,
          type: 'shortage',
          isVendorShort: isVendorShort,
          dateStr: day.dateStr,
          shortDate: day.shortDate || day.dateStr,
          vendorName: v.vendorName,
          vendorNo: padDigits(v.vendorNo, 3),
          deptNo: padDigits(v.deptNo, 2),
          invoiceNo: invNo,
          receiptNumber: rec.receiptNumber,
          itemCode: String(targetItem.code),
          itemName: targetItem.name,
          invoiceQty: invQty,
          receiptQty: reportedRecQty,
          targetDelta: diff,
          releaseMinute: releaseMin,
          releaseTimeLabel: formatMinute12h(releaseMin),
          released: isInitialShiftTask,
          status: 'pending',
          failReason: '',
          feedbackMsg: '',
          feedbackKind: ''
        });
      } else if (taskType === 'overage') {
        const targetItem = v.items[Math.floor(Math.random() * v.items.length)];
        if (!targetItem) continue;
        const upc = getItemUnitsPerCase(targetItem, v.deptNo === '01' ? 'warehouse' : 'sidedoor');
        const invQty = Number(targetItem.qty) || upc;
        const overCases = 1 + Math.floor(Math.random() * 2);
        const overDiff = overCases * upc;
        const recordedRecQty = invQty + overDiff;

        const recLine = rec.items.find((ri) => String(ri.code) === String(targetItem.code));
        if (!recLine) continue;
        recLine.qty = recordedRecQty;
        rec.totalAmount = Number(rec.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2));
        v.hasShort = false;
        targetItem.archivedShort = false;
        targetItem.receivedQty = invQty;

        state.homeOfficeTasks.push({
          id: 'ho_task_' + (i + 1) + '_' + invNo,
          type: 'overage',
          isVendorShort: false,
          dateStr: day.dateStr,
          shortDate: day.shortDate || day.dateStr,
          vendorName: v.vendorName,
          vendorNo: padDigits(v.vendorNo, 3),
          deptNo: padDigits(v.deptNo, 2),
          invoiceNo: invNo,
          receiptNumber: rec.receiptNumber,
          itemCode: String(targetItem.code),
          itemName: targetItem.name,
          invoiceQty: invQty,
          receiptQty: recordedRecQty,
          targetDelta: -overDiff,
          releaseMinute: releaseMin,
          releaseTimeLabel: formatMinute12h(releaseMin),
          released: isInitialShiftTask,
          status: 'pending',
          failReason: '',
          feedbackMsg: '',
          feedbackKind: ''
        });
      } else {
        const isDnr = Math.random() < 0.35;
        const expectedItems = v.items.map((it) => ({
          code: String(it.code),
          name: it.name,
          qty: it.archivedShort ? (Number(it.receivedQty) || 0) : (Number(it.qty) || 0)
        }));

        if (isDnr) {
          const vIdx = day.vendors.indexOf(v);
          if (vIdx !== -1) day.vendors.splice(vIdx, 1);
        } else {
          v.receipts = (v.receipts || []).filter((r) => !(r && r.type !== 'credit' && padDigits(r.invoiceNo, 6) === invNo));
        }

        state.homeOfficeTasks.push({
          id: 'ho_task_' + (i + 1) + '_' + invNo,
          type: 'receipt_not_found',
          isDnr: isDnr,
          dateStr: day.dateStr,
          shortDate: day.shortDate || day.dateStr,
          vendorName: v.vendorName,
          vendorNo: padDigits(v.vendorNo, 3),
          deptNo: padDigits(v.deptNo, 2),
          invoiceNo: invNo,
          expectedItems: isDnr ? [] : expectedItems,
          releaseMinute: releaseMin,
          releaseTimeLabel: formatMinute12h(releaseMin),
          released: isInitialShiftTask,
          status: 'pending',
          failReason: '',
          feedbackMsg: '',
          feedbackKind: ''
        });
      }
    }

    const clock = getClock();
    if (clock && typeof clock.getTimeSnapshot === 'function') {
      updateHomeOfficeTasks(clock.getTimeSnapshot());
    }
  }

  function applyHomeOfficeTaskPenalty(reasonMsg) {
    const stats = getStats();
    if (stats) stats.increment('wrongTaskActions', 1);
    playError();
    if (reasonMsg) notify(reasonMsg, 4500);
  }

  function markHomeOfficeTaskDnr(taskId) {
    const task = state.homeOfficeTasks.find((t) => t.id === taskId);
    if (!task || !task.released || task.status !== 'pending' || task.type !== 'receipt_not_found') return;

    const existing = findArchivedVendorByInvoice(task.invoiceNo);
    if (!existing && task.isDnr) {
      task.status = 'completed';
      task.feedbackMsg = '';
      task.feedbackKind = 'ok';
      const stats = getStats();
      if (stats) stats.increment('tasksCompleted', 1);
      playSuccess();
      notify('✅ DNR confirmed for Inv #' + task.invoiceNo + ' (+250 pts).', 3600);
    } else {
      task.status = 'failed';
      task.failReason = 'Invoice #' + task.invoiceNo + ' exists in File Cabinet (' + (existing ? existing.day.dateStr : task.dateStr) + ') — needed receipt.';
      task.feedbackMsg = '(-100 pts) ' + task.failReason;
      task.feedbackKind = 'err';
      applyHomeOfficeTaskPenalty('❌ TASK FAILED: Inv #' + task.invoiceNo + ' exists in File Cabinet! (-100 pts)');
    }
    renderTerminalUI();
  }

  function markHomeOfficeTaskTrueShortage(taskId) {
    const task = state.homeOfficeTasks.find((t) => t.id === taskId);
    if (!task || !task.released || task.status !== 'pending' || task.type !== 'shortage') return;

    const existing = findArchivedVendorByInvoice(task.invoiceNo, task.vendorNo);
    const archItem = existing && existing.vendor && Array.isArray(existing.vendor.items)
      ? existing.vendor.items.find((it) => String(it.code) === String(task.itemCode))
      : null;
    const isGenuineShort = Boolean(
      task.isVendorShort &&
      existing &&
      existing.vendor &&
      existing.vendor.hasShort &&
      archItem &&
      archItem.archivedShort &&
      Number(archItem.receivedQty) === Number(task.receiptQty)
    );

    if (isGenuineShort) {
      task.status = 'completed';
      task.feedbackMsg = '';
      task.feedbackKind = 'ok';
      const stats = getStats();
      if (stats) stats.increment('tasksCompleted', 1);
      playSuccess();
      notify('✅ True Vendor Shortage verified for Inv #' + task.invoiceNo + ' (+250 pts).', 3600);
    } else {
      task.status = 'failed';
      task.failReason = 'No red SHORT stamp on Inv #' + task.invoiceNo + ' — receiver under-keyed receipt.';
      task.feedbackMsg = '(-100 pts) ' + task.failReason;
      task.feedbackKind = 'err';
      applyHomeOfficeTaskPenalty('❌ TASK FAILED: Inv #' + task.invoiceNo + ' has NO SHORT stamp! (-100 pts)');
    }
    renderTerminalUI();
  }

  function verifyHomeOfficeTask(taskId) {
    const task = state.homeOfficeTasks.find((t) => t.id === taskId);
    if (!task || !task.released || task.status !== 'pending') return;

    if (task.type === 'shortage' && task.isVendorShort) {
      task.feedbackKind = 'err';
      task.feedbackMsg = '(-100 pts) Paper invoice in File Cabinet is stamped SHORT — use [ TRUE SHORTAGE ] instead.';
      applyHomeOfficeTaskPenalty('❌ Inv #' + task.invoiceNo + ' is a True Vendor Shortage — use [ TRUE SHORTAGE ] (-100 pts).');
      renderTerminalUI();
      return;
    }
    if (task.type === 'receipt_not_found' && task.isDnr) {
      task.feedbackKind = 'err';
      task.feedbackMsg = '(-100 pts) No invoice exists in File Cabinet for ' + task.dateStr + ' — use [ DNR ] instead.';
      applyHomeOfficeTaskPenalty('❌ Inv #' + task.invoiceNo + ' does not exist in File Cabinet — use [ DNR ] (-100 pts).');
      renderTerminalUI();
      return;
    }

    const matchingToday = state.processedReceipts.filter(
      (r) => !r.voided && !isPreviousDayReceipt(r) && padDigits(r.invoiceNo, 6) === task.invoiceNo
    );
    const finalizedRecs = matchingToday.filter((r) => r.finalized);
    const initialRecs = matchingToday.filter((r) => !r.finalized);

    if (finalizedRecs.length === 0) {
      playError();
      task.feedbackKind = 'err';
      task.feedbackMsg = initialRecs.length > 0
        ? 'Receipt #' + initialRecs[0].receiptNumber + ' is still INITIAL — finalize it in [1] Create Receipt first.'
        : 'No finalized receipt found for Inv #' + task.invoiceNo + '. Create & finalize it in [1] first.';
      renderTerminalUI();
      return;
    }

    const headerBad = finalizedRecs.find((r) => padDigits(r.deptNo, 2) !== task.deptNo || padDigits(r.vendorNo, 3) !== task.vendorNo);
    if (headerBad) {
      task.feedbackKind = 'err';
      task.feedbackMsg = '(-100 pts) Header mismatch on #' + headerBad.receiptNumber + ' (got D#' + headerBad.deptNo + '/V#' + headerBad.vendorNo + ', need D#' + task.deptNo + '/V#' + task.vendorNo + '). Fix or void in [2].';
      applyHomeOfficeTaskPenalty('❌ Header mismatch on Receipt #' + headerBad.receiptNumber + ' (-100 pts).');
      renderTerminalUI();
      return;
    }

    const sumByCode = {};
    finalizedRecs.forEach((r) => {
      (r.items || []).forEach((it) => {
        const c = String(it.code);
        sumByCode[c] = (sumByCode[c] || 0) + (Number(it.qty) || 0);
      });
    });

    if (task.type === 'shortage' || task.type === 'overage') {
      const extraCodes = Object.keys(sumByCode).filter((c) => c !== task.itemCode && sumByCode[c] !== 0);
      if (extraCodes.length > 0) {
        task.feedbackKind = 'err';
        task.feedbackMsg = '(-100 pts) Unexpected SKU #' + extraCodes[0] + ' included on adjustment receipt. Void & correct in [2].';
        applyHomeOfficeTaskPenalty('❌ Extra SKU on correction receipt for Inv #' + task.invoiceNo + ' (-100 pts).');
        renderTerminalUI();
        return;
      }

      const netDelta = sumByCode[task.itemCode] || 0;
      const combinedQty = task.receiptQty + netDelta;
      if (netDelta !== task.targetDelta || combinedQty !== task.invoiceQty) {
        const signStr = task.targetDelta > 0 ? '+' + task.targetDelta : String(task.targetDelta);
        task.feedbackKind = 'err';
        task.feedbackMsg = '(-100 pts) Correction qty mismatch for #' + task.itemCode + ': got ' + (netDelta > 0 ? '+' + netDelta : netDelta) + 'u, expected ' + signStr + 'u (to equal ' + task.invoiceQty + 'u). Fix or void in [2].';
        applyHomeOfficeTaskPenalty('❌ Correction qty mismatch on Inv #' + task.invoiceNo + ' (-100 pts).');
        renderTerminalUI();
        return;
      }

      task.status = 'completed';
      task.feedbackMsg = '';
      task.feedbackKind = 'ok';
      const stats = getStats();
      if (stats) stats.increment('tasksCompleted', 1);
      playSuccess();
      notify('✅ Task verified for Inv #' + task.invoiceNo + ' (+250 pts)!', 3600);
      renderTerminalUI();
      return;
    }

    // receipt_not_found (!isDnr): verify EVERY item and quantity matches archived paper invoice
    const expectedMap = {};
    (task.expectedItems || []).forEach((ei) => {
      expectedMap[String(ei.code)] = (expectedMap[String(ei.code)] || 0) + (Number(ei.qty) || 0);
    });

    const allCodes = Array.from(new Set(Object.keys(expectedMap).concat(Object.keys(sumByCode))));
    const diffs = [];
    allCodes.forEach((c) => {
      const expQ = expectedMap[c] || 0;
      const gotQ = sumByCode[c] || 0;
      if (expQ !== gotQ) {
        diffs.push('#' + c + ' (got ' + gotQ + 'u, need ' + expQ + 'u)');
      }
    });

    if (diffs.length > 0) {
      task.feedbackKind = 'err';
      task.feedbackMsg = '(-100 pts) Receipt lines do not match Inv #' + task.invoiceNo + ': ' + diffs.slice(0, 2).join(', ') + '. Fix or void in [2].';
      applyHomeOfficeTaskPenalty('❌ Receipt lines mismatch for Inv #' + task.invoiceNo + ' (-100 pts).');
      renderTerminalUI();
      return;
    }

    task.status = 'completed';
    task.feedbackMsg = '';
    task.feedbackKind = 'ok';
    const stats = getStats();
    if (stats) stats.increment('tasksCompleted', 1);
    playSuccess();
    notify('✅ Missing receipt verified for Inv #' + task.invoiceNo + ' (+250 pts)!', 3600);
    renderTerminalUI();
  }

  function renderTerminalTasks(body) {
    const ct = global.ClaimsTotes;
    const rec = (ct && typeof ct.getRecallState === 'function') ? ct.getRecallState() : null;
    const hasPendingRecall = Boolean(rec && rec.active);
    const queuedRecallCount = rec ? (Number(rec.queuedCount) || 0) : 0;
    const completedRecallsList = (rec && Array.isArray(rec.completedRecalls) && rec.completedRecalls.length > 0)
      ? rec.completedRecalls
      : ((rec && rec.completed) ? [{ productName: rec.productName, submittedCount: rec.submittedCount, countMatched: rec.countMatched }] : []);

    const releasedTasks = state.homeOfficeTasks.filter((t) => t.released);
    const openHoTasks = releasedTasks.filter((t) => t.status === 'pending');
    const resolvedHoTasks = releasedTasks.filter((t) => t.status !== 'pending');
    const pendingCount = (hasPendingRecall ? 1 : 0) + queuedRecallCount + openHoTasks.length;

    if (hasPendingRecall && rec.sorted) {
      state.terminalActiveField = 'recallCount';
    }

    let recallHtml = '';
    if (hasPendingRecall) {
      let actionHtml = '';
      if (!rec.sorted) {
        actionHtml = rec.holdingTote
          ? `<div style="margin-top:5px; padding:5px 8px; background:rgba(245,158,11,0.12); border:1px solid #f59e0b; border-radius:2px; font-size:11px; color:#fef3c7;">TOTE IN HAND · Collect units off Recall Cart -> Dump in <strong>${escapeHtml(rec.correctBinLabel)}</strong></div>`
          : `<div style="margin-top:5px; padding:5px 8px; background:rgba(239,68,68,0.12); border:1px solid #ef4444; border-radius:2px; font-size:11px; color:#fecaca;">ACTION: Count cart top shelf -> Tote units -> Dump in <strong>${escapeHtml(rec.correctBinLabel)}</strong></div>`;
      } else {
        actionHtml = `
          <div class="crt-form-row" style="margin-top:5px; align-items:flex-end; gap:8px;">
            <div style="flex:1; min-width:140px;">
              <label for="crt-in-recall-count" style="display:block; font-size:10px; color:#86efac; margin-bottom:2px;">DISPOSED · ENTER UNIT COUNT:</label>
              <input id="crt-in-recall-count" data-term-field="recallCount" type="text" readonly inputmode="none" maxlength="3" placeholder="0" value="${escapeHtml(state.terminalRecallCount || '')}" style="width:100%; padding:4px 8px; font-size:14px; font-weight:800;">
            </div>
            <button id="crt-btn-submit-recall" class="crt-btn-sm crt-btn-primary" type="button" style="padding:6px 12px;">[ SUBMIT COUNT ]</button>
          </div>`;
      }
      const queuedNoteHtml = queuedRecallCount > 0
        ? `<div style="margin-top:5px; padding:3px 8px; background:rgba(245,158,11,0.14); border:1px dashed #f59e0b; color:#fde68a; font-size:10.5px; font-weight:700;">+${queuedRecallCount} QUEUED RECALL TASK — FINISH ACTIVE RECALL TO STAGE CART</div>`
        : '';

      recallHtml = `
        <div class="crt-panel" style="border-color:#ef4444; border-left:5px solid #ef4444; margin-bottom:8px; flex:0 0 auto; padding:8px 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
            <span style="font-weight:800; font-size:12px; color:#f87171;">🚨 ${escapeHtml(rec.productName)}</span>
            <span style="border:1px solid #ef4444; color:#f87171; padding:1px 6px; font-size:10px; font-weight:800;">RECALL TASK</span>
          </div>
          ${actionHtml}
          ${queuedNoteHtml}
        </div>`;
    }

    const pageSize = hasPendingRecall ? 1 : 2;
    const taskPg = paginateItems(openHoTasks, 'tasks', pageSize);
    let hoTasksHtml = '';

    if (openHoTasks.length > 0) {
      hoTasksHtml = taskPg.items.map((t) => {
        let badgeTxt = 'TASK';
        let badgeColor = '#facc15';
        let linesHtml = '';
        let extraActionBtn = '';

        if (t.type === 'shortage') {
          badgeTxt = 'SHORTAGE TASK';
          badgeColor = '#fb923c';
          linesHtml = `
            <div style="font-size:11px; color:#94a3b8;">${escapeHtml(t.dateStr)} · D#${escapeHtml(t.deptNo)} / V#${escapeHtml(t.vendorNo)} · RCPT #${escapeHtml(t.receiptNumber)}</div>
            <div style="font-size:11.5px; color:#e2e8f0; margin-top:2px;"><strong>#${escapeHtml(t.itemCode)} ${escapeHtml(t.itemName)}</strong> — RCPT: <strong style="color:#fca5a5;">${t.receiptQty}u</strong> vs INV: <strong>${t.invoiceQty}u</strong></div>`;
          extraActionBtn = `<button class="crt-btn-sm" type="button" data-ho-trueshort="${escapeHtml(t.id)}" style="border-color:#fb923c; color:#fdba74;">[ TRUE SHORTAGE ]</button>`;
        } else if (t.type === 'overage') {
          badgeTxt = 'OVERAGE TASK';
          badgeColor = '#38bdf8';
          linesHtml = `
            <div style="font-size:11px; color:#94a3b8;">${escapeHtml(t.dateStr)} · D#${escapeHtml(t.deptNo)} / V#${escapeHtml(t.vendorNo)} · RCPT #${escapeHtml(t.receiptNumber)}</div>
            <div style="font-size:11.5px; color:#e2e8f0; margin-top:2px;"><strong>#${escapeHtml(t.itemCode)} ${escapeHtml(t.itemName)}</strong> — RCPT: <strong style="color:#7dd3fc;">${t.receiptQty}u</strong> vs INV: <strong>${t.invoiceQty}u</strong></div>`;
        } else {
          badgeTxt = 'MISSING RECEIPT';
          badgeColor = '#facc15';
          linesHtml = `
            <div style="font-size:11px; color:#94a3b8;">${escapeHtml(t.dateStr)} · D#${escapeHtml(t.deptNo)} / V#${escapeHtml(t.vendorNo)} · INV #${escapeHtml(t.invoiceNo)}</div>
            <div style="font-size:11.5px; color:#e2e8f0; margin-top:2px;">No DSD receipt logged — check File Cabinet, key receipt or confirm DNR.</div>`;
          extraActionBtn = `<button class="crt-btn-sm crt-btn-danger" type="button" data-ho-dnr="${escapeHtml(t.id)}">[ DNR ]</button>`;
        }

        const feedbackHtml = t.feedbackMsg
          ? `<div style="margin-top:5px; padding:4px 8px; background:rgba(239,68,68,0.14); border:1px solid #ef4444; color:#fca5a5; font-size:11px;">⚠️ ${escapeHtml(t.feedbackMsg)}</div>`
          : '';

        return `
          <div class="crt-panel" style="border-color:${badgeColor}; border-left:5px solid ${badgeColor}; margin-bottom:8px; padding:8px 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:3px;">
              <span style="font-weight:800; font-size:12px; color:#fef08a;">${escapeHtml(t.vendorName)} · INV #${escapeHtml(t.invoiceNo)}</span>
              <span style="border:1px solid ${badgeColor}; color:${badgeColor}; padding:1px 6px; font-size:10px; font-weight:800; white-space:nowrap;">${badgeTxt} · ${escapeHtml(t.releaseTimeLabel)}</span>
            </div>
            ${linesHtml}
            ${feedbackHtml}
            <div style="display:flex; justify-content:flex-end; flex-wrap:wrap; gap:6px; margin-top:6px;">
              <button class="crt-btn-sm" type="button" data-ho-create="1">[ + RECEIPT [1] ]</button>
              ${extraActionBtn}
              <button class="crt-btn-sm crt-btn-primary" type="button" data-ho-verify="${escapeHtml(t.id)}">[ VERIFY ]</button>
            </div>
          </div>`;
      }).join('');
    } else if (!hasPendingRecall) {
      hoTasksHtml = `
        <div class="crt-panel" style="padding:10px 12px;">
          <div class="crt-section-hdr" style="margin-bottom:4px;">RECEIVING TASKS &amp; RECALL QUEUE CLEAR</div>
          <div style="font-size:11.5px; color:#bbf7d0; line-height:1.45;">
            No open receiving tasks or recalls right now. Corporate transmissions arrive through 11:30 AM.<br>
            <span style="color:#86efac;">Workflow: File Cabinet -> Terminal [1]/[2] -> Verify or [DNR]/[TRUE SHORTAGE] here.</span>
          </div>
        </div>`;
    }

    let completedHtml = '';
    const showCompletedSummary = (completedRecallsList.length > 0 || resolvedHoTasks.length > 0) && (!hasPendingRecall || openHoTasks.length === 0);
    if (showCompletedSummary) {
      const doneRows = [];
      completedRecallsList.forEach((cr) => {
        const badgeTxt = cr.countMatched ? '[DONE +500]' : '[ERR -100]';
        const badgeCol = cr.countMatched ? '#22c55e' : '#f59e0b';
        doneRows.push(`
          <div style="display:flex; justify-content:space-between; font-size:11px; padding:3px 8px; background:rgba(34,197,94,0.06); border:1px solid rgba(34,197,94,0.25); margin-bottom:3px;">
            <span style="text-decoration:line-through; color:#bbf7d0;">RECALL: ${escapeHtml(cr.productName)} (${escapeHtml(String(cr.submittedCount))}u)</span>
            <span style="color:${badgeCol}; font-weight:800;">${badgeTxt}</span>
          </div>`);
      });
      resolvedHoTasks.slice(-3).forEach((t) => {
        const isOk = t.status === 'completed';
        const col = isOk ? '#22c55e' : '#ef4444';
        const tag = isOk ? '[DONE +250]' : '[FAIL -100]';
        const kindShort = t.type === 'receipt_not_found' ? 'MISSING RCPT' : t.type.toUpperCase();
        doneRows.push(`
          <div style="display:flex; justify-content:space-between; font-size:11px; padding:3px 8px; background:${isOk ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)'}; border:1px solid ${isOk ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.35)'}; margin-bottom:3px;">
            <span style="text-decoration:line-through; color:${isOk ? '#bbf7d0' : '#fca5a5'};">${escapeHtml(t.vendorName)} · #${escapeHtml(t.invoiceNo)} (${kindShort})</span>
            <span style="color:${col}; font-weight:800;">${tag}</span>
          </div>`);
      });
      completedHtml = `
        <div style="border-top:1px dashed rgba(134,239,172,0.35); margin-top:6px; padding-top:5px; flex:0 0 auto;">
          <div style="font-size:10px; color:#86efac; opacity:0.8; margin-bottom:3px;">COMPLETED TODAY (${completedRecallsList.length + resolvedHoTasks.length}):</div>
          ${doneRows.join('')}
        </div>`;
    }

    const pagerHtml = openHoTasks.length > 0 ? renderTerminalPager(taskPg) : '';
    const clock = getClock();
    const snap = clock ? clock.getTimeSnapshot() : { dateLabel: 'FEB 1, 1996', formatted12h: '6:00 AM' };

    body.innerHTML = `
      <div class="crt-meta-bar">
        <span>RECEIVING TASKS &amp; RECALLS :: ${pendingCount > 0 ? '<strong style="color:#facc15;">' + pendingCount + ' PENDING</strong>' : 'CLEAR'}</span>
        <span>${escapeHtml(snap.dateLabel)} :: ${escapeHtml(snap.formatted12h)}</span>
      </div>
      ${recallHtml}
      <div class="crt-scroll-panel">
        ${hoTasksHtml}
      </div>
      ${completedHtml}
      ${pagerHtml}
    `;

    if (openHoTasks.length > 0) bindTerminalPager(body, 'tasks');

    const recallInput = document.getElementById('crt-in-recall-count');
    if (recallInput) {
      recallInput.addEventListener('click', () => {
        state.terminalActiveField = 'recallCount';
        playBeep();
        updateTerminalKeypadUI();
      });
    }
    const recallSubmitBtn = document.getElementById('crt-btn-submit-recall');
    if (recallSubmitBtn && ct && typeof ct.submitRecallCount === 'function') {
      recallSubmitBtn.addEventListener('click', () => {
        const res = ct.submitRecallCount(state.terminalRecallCount);
        if (!res || !res.ok) {
          playError();
          notify('❌ Enter a valid affected unit count!');
          return;
        }
        state.terminalRecallCount = '';
        if (res.matched) {
          playSuccess();
          notify('🎉 RECALL COMPLETE! "' + res.productName + '" verified (+500 pts).', 4200);
        } else {
          playError();
          notify('⚠️ Recall count mismatch recorded. Task completed with error (-100 pts).', 4200);
        }
        renderTerminalUI();
      });
    }

    body.querySelectorAll('[data-ho-create]').forEach((btn) => {
      btn.addEventListener('click', () => {
        playBeep();
        openTerminalScreen('create');
      });
    });
    body.querySelectorAll('[data-ho-verify]').forEach((btn) => {
      btn.addEventListener('click', () => {
        verifyHomeOfficeTask(btn.getAttribute('data-ho-verify'));
      });
    });
    body.querySelectorAll('[data-ho-dnr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        markHomeOfficeTaskDnr(btn.getAttribute('data-ho-dnr'));
      });
    });
    body.querySelectorAll('[data-ho-trueshort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        markHomeOfficeTaskTrueShortage(btn.getAttribute('data-ho-trueshort'));
      });
    });
  }

  function renderTerminalSuppliers(body) {
    const catalog = getCatalog();
    if (!catalog) {
      body.innerHTML = '<div class="crt-msg-err">DSDCatalog not loaded.</div>';
      return;
    }

    const depts = catalog.DEPARTMENTS || {};
    const deptKeys = Object.keys(depts).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (!state.selectedDeptNo || !depts[state.selectedDeptNo]) {
      state.selectedDeptNo = deptKeys[0] || null;
    }

    const query = (state.supplierQuery || '').trim().toLowerCase();

    const formatZoneTag = (t) => {
      const z = String(t || 'ambient').toUpperCase();
      if (z === 'FROZEN') return '<span style="color:#38bdf8; font-weight:800;">FROZEN</span>';
      if (z === 'REFRIGERATED' || z === 'CHILLED') return '<span style="color:#67e8f9; font-weight:800;">CHILLED</span>';
      return '<span style="color:#bbf7d0;">AMBIENT</span>';
    };

    const searchBarHtml =
      '<div class="crt-form-row" style="margin-bottom:5px; align-items:center;">' +
      '<input id="crt-sup-search" data-term-field="search" type="text" readonly inputmode="none" style="flex:1; min-width:140px; padding:4px 7px; font-size:12px;" placeholder="SEARCH VENDOR NAME, DEPT, UPC/PLU, OR ITEM..." value="' + escapeHtml(state.supplierQuery) + '">' +
      '<button id="crt-sup-kbd-btn" class="crt-btn-sm" type="button">' + (state.terminalSupplierKeypadOpen ? '[ HIDE KEYPAD ]' : '[ KEYPAD ]') + '</button>' +
      (query ? '<button id="crt-sup-clear" class="crt-btn-sm" type="button">[ CLEAR ]</button>' : '') +
      '</div>';

    if (query) {
      const deptMatches = [];
      const vendorMatches = [];
      const itemMatches = [];
      const seenItemKeys = new Set();

      deptKeys.forEach((dk) => {
        const dObj = depts[dk] || { name: '', vendors: {} };
        const dNoL = String(dk).toLowerCase();
        const dNameL = String(dObj.name || '').toLowerCase();
        if (dNoL.includes(query) || dNameL.includes(query)) {
          const vCount = Object.keys(dObj.vendors || {}).length;
          const iCount = Object.values(dObj.vendors || {}).reduce((s, vv) => s + Object.keys((vv && vv.products) || {}).length, 0);
          deptMatches.push({ kind: 'dept', deptNo: dk, name: dObj.name || '', vCount: vCount, iCount: iCount });
        }
      });

      const vendorList = Array.isArray(catalog.allVendorEntries) ? catalog.allVendorEntries : [];
      vendorList.forEach((v) => {
        const vNameL = String(v.name || '').toLowerCase();
        const vNoL = String(v.vendorNo || '').toLowerCase();
        const dNoL = String(v.deptNo || '').toLowerCase();
        const dNameL = String(v.deptName || '').toLowerCase();
        const vendorHits = vNameL.includes(query) || vNoL.includes(query) || dNoL.includes(query) || dNameL.includes(query);

        if (vendorHits) {
          vendorMatches.push({ kind: 'vendor', vendor: v });
        }

        (v.products || []).forEach((p) => {
          const pCodeL = String(p.code || '').toLowerCase();
          const pNameL = String(p.name || '').toLowerCase();
          if (vendorHits || pCodeL.includes(query) || pNameL.includes(query)) {
            const uniqKey = String(v.deptNo) + ':' + String(v.vendorNo) + ':' + String(p.code);
            if (!seenItemKeys.has(uniqKey)) {
              seenItemKeys.add(uniqKey);
              itemMatches.push({ kind: 'item', item: p, vendor: v });
            }
          }
        });
      });

      (catalog.allProducts || []).forEach((p) => {
        const pCodeL = String(p.code || '').toLowerCase();
        const pNameL = String(p.name || '').toLowerCase();
        const dNoL = String(p.deptNo || '').toLowerCase();
        if (pCodeL.includes(query) || pNameL.includes(query) || dNoL.includes(query)) {
          const ownerV = typeof catalog.findVendorForProduct === 'function' ? catalog.findVendorForProduct(p.code) : null;
          const vNo = ownerV ? ownerV.vendorNo : '';
          const uniqKey = String(p.deptNo) + ':' + String(vNo) + ':' + String(p.code);
          if (!seenItemKeys.has(uniqKey)) {
            seenItemKeys.add(uniqKey);
            itemMatches.push({ kind: 'item', item: p, vendor: ownerV });
          }
        }
      });

      const combinedMatches = deptMatches.concat(vendorMatches, itemMatches);
      const searchPg = paginateItems(combinedMatches, 'suppliersSearch', 10);

      const rows = searchPg.items.map((entry) => {
        if (entry.kind === 'dept') {
          return (
            '<tr class="crt-row-click" data-jump-dept="' + escapeHtml(entry.deptNo) + '">' +
            '<td><span class="crt-dir-tag crt-dir-tag-dept">DEPT</span></td>' +
            '<td><strong>#' + escapeHtml(entry.deptNo) + '</strong></td>' +
            '<td title="' + escapeHtml(entry.name) + '"><strong>' + escapeHtml(entry.name) + '</strong></td>' +
            '<td>' + entry.vCount + ' VND</td>' +
            '<td>' + entry.iCount + ' ITEM' + (entry.iCount === 1 ? '' : 'S') + '</td>' +
            '<td><button class="crt-btn-sm" type="button" data-jump-dept="' + escapeHtml(entry.deptNo) + '">[ OPEN &gt; ]</button></td>' +
            '</tr>'
          );
        }
        if (entry.kind === 'vendor') {
          const v = entry.vendor;
          const cnt = (v.products || []).length;
          return (
            '<tr class="crt-row-click" data-jump-dept="' + escapeHtml(v.deptNo) + '" data-jump-vendor="' + escapeHtml(v.vendorNo) + '">' +
            '<td><span class="crt-dir-tag crt-dir-tag-vendor">VENDOR</span></td>' +
            '<td><strong>V#' + escapeHtml(v.vendorNo) + '</strong></td>' +
            '<td title="' + escapeHtml(v.name) + '"><strong>' + escapeHtml(v.name) + '</strong></td>' +
            '<td>D#' + escapeHtml(v.deptNo) + '</td>' +
            '<td>' + cnt + ' ITEM' + (cnt === 1 ? '' : 'S') + '</td>' +
            '<td><button class="crt-btn-sm" type="button" data-jump-dept="' + escapeHtml(v.deptNo) + '" data-jump-vendor="' + escapeHtml(v.vendorNo) + '">[ ITEMS &gt; ]</button></td>' +
            '</tr>'
          );
        }
        const p = entry.item;
        const v = entry.vendor;
        const vLabel = v ? ('V#' + escapeHtml(v.vendorNo)) : '-';
        const jumpAttrs = v ? (' class="crt-row-click" data-jump-dept="' + escapeHtml(v.deptNo) + '" data-jump-vendor="' + escapeHtml(v.vendorNo) + '"') : '';
        const upc = getItemUnitsPerCase(p, p.deptNo === '01' ? 'warehouse' : 'sidedoor');
        return (
          '<tr' + jumpAttrs + '>' +
          '<td><span class="crt-dir-tag crt-dir-tag-item">ITEM</span></td>' +
          '<td><strong>' + escapeHtml(p.code) + '</strong></td>' +
          '<td title="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</td>' +
          '<td>D#' + escapeHtml(p.deptNo) + (v ? ' · ' + vLabel : '') + '</td>' +
          '<td>' + formatZoneTag(p.type) + (p.notScannable ? ' <span style="color:#f59e0b; font-weight:800;">PLU</span>' : '') + ' <span style="color:#94a3b8;">' + upc + 'u</span></td>' +
          '<td><strong>' + formatMoney(p.price) + '</strong></td>' +
          '</tr>'
        );
      }).join('');

      body.innerHTML = `
        <div class="crt-meta-bar">
          <span>SEARCH: ${deptMatches.length} DEPT${deptMatches.length === 1 ? '' : 'S'}, ${vendorMatches.length} VENDOR${vendorMatches.length === 1 ? '' : 'S'}, ${itemMatches.length} ITEM${itemMatches.length === 1 ? '' : 'S'}</span>
          <span>FILTER: "${escapeHtml(state.supplierQuery.toUpperCase())}"</span>
        </div>
        ${searchBarHtml}
        <div class="crt-scroll-panel">
          <table class="crt-table crt-dir-table">
            <colgroup>
              <col style="width:62px;">
              <col style="width:90px;">
              <col>
              <col style="width:88px;">
              <col style="width:92px;">
              <col style="width:100px;">
            </colgroup>
            <thead><tr><th>TYPE</th><th>CODE / #</th><th>DEPT, VENDOR OR ITEM</th><th>DEPT / V#</th><th>INFO</th><th>PRICE / ACT</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center; opacity:0.65;">No matching departments, vendors, or items found.</td></tr>'}</tbody>
          </table>
        </div>
        ${renderTerminalPager(searchPg)}
      `;
      bindTerminalPager(body, 'suppliersSearch');

      body.querySelectorAll('[data-jump-dept]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          state.selectedDeptNo = el.getAttribute('data-jump-dept');
          state.selectedVendorNo = el.getAttribute('data-jump-vendor');
          state.supplierQuery = '';
          state.supplierTreeLevel = state.selectedVendorNo ? 'items' : 'vendors';
          state.terminalPage.suppliersItems = 0;
          state.terminalPage.suppliersVendors = 0;
          state.terminalSupplierKeypadOpen = false;
          playBeep();
          renderTerminalUI();
        });
      });
    } else {
      const level = state.supplierTreeLevel || 'depts';
      const dept = depts[state.selectedDeptNo] || { name: '', vendors: {} };
      const vendors = dept.vendors || {};
      const vendorKeys = Object.keys(vendors);

      if (level === 'items' && (!state.selectedVendorNo || !vendors[state.selectedVendorNo])) {
        state.selectedVendorNo = vendorKeys[0] || null;
        if (!state.selectedVendorNo) state.supplierTreeLevel = 'vendors';
      }

      const activeLevel = state.supplierTreeLevel || 'depts';
      const vendor = state.selectedVendorNo ? vendors[state.selectedVendorNo] : null;

      let crumbHtml = '<button type="button" class="crt-btn-sm" data-tree-lvl="depts">ALL DEPTS</button>';
      if (activeLevel === 'vendors' || activeLevel === 'items') {
        crumbHtml += ' <span style="color:#4ade80;">&gt;</span> <button type="button" class="crt-btn-sm" data-tree-lvl="vendors">#' + escapeHtml(state.selectedDeptNo) + ' ' + escapeHtml(dept.name) + '</button>';
      }
      if (activeLevel === 'items' && vendor) {
        crumbHtml += ' <span style="color:#4ade80;">&gt;</span> <span style="color:#facc15; font-weight:800;">V#' + escapeHtml(state.selectedVendorNo) + ' ' + escapeHtml(vendor.name) + '</span>';
      }

      if (activeLevel === 'depts') {
        const deptPg = paginateItems(deptKeys, 'suppliersDepts', 10);
        const deptRows = deptPg.items.map((dk) => {
          const dObj = depts[dk] || { name: '', vendors: {} };
          const vCount = Object.keys(dObj.vendors || {}).length;
          const iCount = Object.values(dObj.vendors || {}).reduce((s, vv) => s + Object.keys((vv && vv.products) || {}).length, 0);
          return (
            '<tr class="crt-row-click" data-drill-dept="' + escapeHtml(dk) + '">' +
            '<td><strong>#' + escapeHtml(dk) + '</strong></td>' +
            '<td title="' + escapeHtml(dObj.name) + '"><strong>' + escapeHtml(dObj.name) + '</strong></td>' +
            '<td>' + vCount + '</td>' +
            '<td>' + iCount + '</td>' +
            '<td><button class="crt-btn-sm" type="button" data-drill-dept="' + escapeHtml(dk) + '">[ OPEN &gt; ]</button></td>' +
            '</tr>'
          );
        }).join('');

        body.innerHTML = `
          <div class="crt-meta-bar">
            <span style="display:flex; align-items:center; gap:4px; flex-wrap:nowrap; overflow:hidden;">TREE: ${crumbHtml}</span>
            <span>SELECT DEPARTMENT (${deptKeys.length})</span>
          </div>
          ${searchBarHtml}
          <div class="crt-scroll-panel">
            <table class="crt-table crt-dir-table">
              <colgroup>
                <col style="width:70px;">
                <col>
                <col style="width:74px;">
                <col style="width:64px;">
                <col style="width:100px;">
              </colgroup>
              <thead><tr><th>DEPT #</th><th>DEPARTMENT NAME</th><th>VENDORS</th><th>ITEMS</th><th>ACTION</th></tr></thead>
              <tbody>${deptRows || '<tr><td colspan="5" style="text-align:center; opacity:0.65;">No departments loaded.</td></tr>'}</tbody>
            </table>
          </div>
          ${renderTerminalPager(deptPg)}
        `;
        bindTerminalPager(body, 'suppliersDepts');
      } else if (activeLevel === 'vendors') {
        const vendPg = paginateItems(vendorKeys, 'suppliersVendors', 10);
        const vendRows = vendPg.items.map((vk) => {
          const vObj = vendors[vk];
          const iCount = Object.keys((vObj && vObj.products) || {}).length;
          const vType = String((vObj && vObj.type) || 'side_door').toUpperCase().replace('_', ' ');
          return (
            '<tr class="crt-row-click" data-drill-vendor="' + escapeHtml(vk) + '">' +
            '<td><strong>V#' + escapeHtml(vk) + '</strong></td>' +
            '<td title="' + escapeHtml(vObj.name) + '"><strong>' + escapeHtml(vObj.name) + '</strong></td>' +
            '<td>' + escapeHtml(vType) + '</td>' +
            '<td>' + iCount + '</td>' +
            '<td><button class="crt-btn-sm" type="button" data-drill-vendor="' + escapeHtml(vk) + '">[ ITEMS &gt; ]</button></td>' +
            '</tr>'
          );
        }).join('');

        const upBtnHtml = '<button type="button" class="crt-btn-sm" data-tree-lvl="depts">[ F9=&lt; DEPTS ]</button>';
        body.innerHTML = `
          <div class="crt-meta-bar">
            <span style="display:flex; align-items:center; gap:4px; flex-wrap:nowrap; overflow:hidden;">TREE: ${crumbHtml}</span>
            <span>VENDORS (${vendorKeys.length})</span>
          </div>
          ${searchBarHtml}
          <div class="crt-scroll-panel">
            <table class="crt-table crt-dir-table">
              <colgroup>
                <col style="width:78px;">
                <col>
                <col style="width:92px;">
                <col style="width:64px;">
                <col style="width:100px;">
              </colgroup>
              <thead><tr><th>VENDOR #</th><th>VENDOR NAME</th><th>CHANNEL</th><th>ITEMS</th><th>ACTION</th></tr></thead>
              <tbody>${vendRows || '<tr><td colspan="5" style="text-align:center; opacity:0.65;">No direct DSD vendors in this department.</td></tr>'}</tbody>
            </table>
          </div>
          ${renderTerminalPager(vendPg, upBtnHtml)}
        `;
        bindTerminalPager(body, 'suppliersVendors');
      } else {
        const prodObj = (vendor && vendor.products) || {};
        const allProdCodes = Object.keys(prodObj);
        const itemsPg = paginateItems(allProdCodes, 'suppliersItems', 10);
        const prodRows = itemsPg.items.map((code) => {
          const p = prodObj[code];
          const upc = getItemUnitsPerCase(p, state.selectedDeptNo === '01' ? 'warehouse' : 'sidedoor');
          return (
            '<tr>' +
            '<td><strong>' + escapeHtml(code) + '</strong></td>' +
            '<td title="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</td>' +
            '<td>' + upc + 'u</td>' +
            '<td>' + formatZoneTag(p.type) + '</td>' +
            '<td>' + (p.notScannable ? '<span style="color:#f59e0b; font-weight:800;">PLU ONLY</span>' : '<span style="color:#4ade80;">BARCODE</span>') + '</td>' +
            '<td>' + formatMoney(p.price) + '</td>' +
            '</tr>'
          );
        }).join('');

        const upBtnHtml = '<button type="button" class="crt-btn-sm" data-tree-lvl="vendors">[ F9=&lt; VENDORS ]</button>';
        body.innerHTML = `
          <div class="crt-meta-bar">
            <span style="display:flex; align-items:center; gap:4px; flex-wrap:nowrap; overflow:hidden;">TREE: ${crumbHtml}</span>
            <span>ITEMS (${allProdCodes.length})</span>
          </div>
          ${searchBarHtml}
          <div class="crt-scroll-panel">
            <table class="crt-table crt-dir-table">
              <colgroup>
                <col style="width:90px;">
                <col>
                <col style="width:52px;">
                <col style="width:72px;">
                <col style="width:78px;">
                <col style="width:70px;">
              </colgroup>
              <thead><tr><th>UPC / PLU</th><th>ITEM NAME</th><th>PACK</th><th>TEMP</th><th>INPUT</th><th>UNIT $</th></tr></thead>
              <tbody>${prodRows || '<tr><td colspan="6" style="text-align:center; opacity:0.65;">No items listed for this vendor.</td></tr>'}</tbody>
            </table>
          </div>
          ${renderTerminalPager(itemsPg, upBtnHtml)}
        `;
        bindTerminalPager(body, 'suppliersItems');
      }

      body.querySelectorAll('[data-tree-lvl]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.supplierTreeLevel = btn.getAttribute('data-tree-lvl');
          playBeep();
          renderTerminalUI();
        });
      });
      body.querySelectorAll('[data-drill-dept]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          state.selectedDeptNo = el.getAttribute('data-drill-dept');
          state.selectedVendorNo = null;
          state.supplierTreeLevel = 'vendors';
          state.terminalPage.suppliersVendors = 0;
          state.terminalPage.suppliersItems = 0;
          playBeep();
          renderTerminalUI();
        });
      });
      body.querySelectorAll('[data-drill-vendor]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          state.selectedVendorNo = el.getAttribute('data-drill-vendor');
          state.supplierTreeLevel = 'items';
          state.terminalPage.suppliersItems = 0;
          playBeep();
          renderTerminalUI();
        });
      });
    }

    const searchInput = document.getElementById('crt-sup-search');
    if (searchInput) {
      searchInput.addEventListener('click', () => {
        state.terminalActiveField = 'search';
        state.terminalSupplierKeypadOpen = true;
        playBeep();
        updateTerminalKeypadUI();
      });
    }
    const supKbdBtn = document.getElementById('crt-sup-kbd-btn');
    if (supKbdBtn) {
      supKbdBtn.addEventListener('click', () => {
        state.terminalActiveField = 'search';
        state.terminalSupplierKeypadOpen = !state.terminalSupplierKeypadOpen;
        supKbdBtn.textContent = state.terminalSupplierKeypadOpen ? '[ HIDE KEYPAD ]' : '[ KEYPAD ]';
        playBeep();
        updateTerminalKeypadUI();
      });
    }
    const clearBtn = document.getElementById('crt-sup-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.supplierQuery = '';
        state.terminalPage.suppliersSearch = 0;
        playBeep();
        renderTerminalUI();
      });
    }
  }

  // =========================================================================
  // PHASE 2: NIGHT DROPS, PINNED DESK DOC, DAILY FILING & 32-DAY ARCHIVE
  // =========================================================================

  function notifyDeskStateChanged() {
    if (typeof state.hooks.onDeskStateChanged === 'function') {
      state.hooks.onDeskStateChanged({
        nightDropCount: state.nightDropInvoices.length,
        pinnedCount: state.pinnedArchiveItems.length,
        filingComplete: state.filingComplete,
        unfiledReceipts: getUnfiledReceiptsCount(),
        archiveOpen: state.archiveOpen,
        printerTrayCount: (state.printerTraySlips || []).length
      });
    }
  }

  function notifyPhase2ModalChange() {
    if (typeof state.hooks.onPhase2ModalChange === 'function') {
      state.hooks.onPhase2ModalChange({
        nightDropOpen: state.nightDropPanelOpen,
        filingOpen: state.filingOpen,
        archiveOpen: state.archiveOpen
      });
    }
  }

  function getUnfiledReceiptsCount() {
    if (state.filingComplete) return 0;
    return state.processedReceipts.filter((r) => {
      const st = getReceiptStatus(r);
      return (st === 'INITIAL' || st === 'FINAL') && !isHomeOfficeTaskArchiveReceipt(r);
    }).length;
  }

  function getDsdVendorsPool(includeWarehouse) {
    const catalog = getCatalog();
    const pool = [];
    if (!catalog) return pool;

    if (Array.isArray(catalog.allVendorEntries) && catalog.allVendorEntries.length > 0) {
      catalog.allVendorEntries.forEach((v) => {
        const dNo = padDigits(v.deptNo, 2);
        if (!includeWarehouse && (dNo === '01' || v.type === 'warehouse')) return;
        if (Array.isArray(v.products) && v.products.length > 0) {
          pool.push({
            deptNo: dNo,
            deptName: v.deptName || '',
            vendorNo: padDigits(v.vendorNo, 3),
            vendorName: v.name,
            vendorType: v.type || 'side_door',
            products: v.products
          });
        }
      });
      return pool;
    }

    const depts = catalog.DEPARTMENTS || {};
    Object.keys(depts).forEach((rawDeptNo) => {
      const dept = depts[rawDeptNo];
      const dNo = padDigits(rawDeptNo, 2);
      if (!dept || (!includeWarehouse && dNo === '01')) return;
      const vMap = dept.vendors || {};
      Object.keys(vMap).forEach((rawVendorNo) => {
        const v = vMap[rawVendorNo];
        if (!v || (!includeWarehouse && v.type === 'warehouse')) return;
        const pMap = v.products || {};
        const products = Object.keys(pMap).map((code) => Object.assign({ code: String(code) }, pMap[code]));
        if (products.length > 0) {
          pool.push({
            deptNo: dNo,
            deptName: dept.name || '',
            vendorNo: padDigits(rawVendorNo, 3),
            vendorName: v.name,
            vendorType: v.type || 'side_door',
            products: products
          });
        }
      });
    });
    return pool;
  }

  function generateNightDropInvoices() {
    const pool = getDsdVendorsPool();
    state.nightDropInvoices = [];
    state.resolvedNightDrops = [];
    if (pool.length === 0) return;

    const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 2)); // 1 to 2 overnight vendor invoices
    const usedVendorKeys = new Set();
    const usedInvNos = new Set();

    while (state.nightDropInvoices.length < count && usedVendorKeys.size < pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const vKey = pick.deptNo + '-' + pick.vendorNo;
      if (usedVendorKeys.has(vKey)) continue;
      usedVendorKeys.add(vKey);

      let invNo;
      do {
        invNo = String(Math.floor(100000 + Math.random() * 899999));
      } while (usedInvNos.has(invNo));
      usedInvNos.add(invNo);

      const lineCount = Math.min(pick.products.length, 2 + Math.floor(Math.random() * 3));
      const shuffled = pick.products.slice().sort(() => Math.random() - 0.5);
      const items = shuffled.slice(0, lineCount).map((p) => {
        const upc = getItemUnitsPerCase(p, pick.deptNo === '01' ? 'warehouse' : 'sidedoor');
        const cases = 1 + Math.floor(Math.random() * 4);
        return {
          code: String(p.code),
          name: p.name,
          qty: cases * upc,
          cases: cases,
          unitsPerCase: upc,
          price: Number(p.price) || 0,
          notScannable: Boolean(p.notScannable),
          type: p.type || 'ambient'
        };
      });
      const totalAmount = items.reduce((s, it) => s + it.qty * it.price, 0);

      state.nightDropInvoices.push({
        id: 'nd_' + invNo,
        vendorNo: pick.vendorNo,
        deptNo: pick.deptNo,
        vendorName: pick.vendorName,
        deptName: pick.deptName,
        invoiceNo: invNo,
        deliveryDate: formatShortDateFromSnap(),
        items: items,
        totalAmount: Number(totalAmount.toFixed(2))
      });
    }
    state.activeNightDropTab = 0;
  }

  function resolveNightDropByInvoiceNo(invoiceNo, receiptNumber) {
    const cleanInv = padDigits(invoiceNo, 6);
    const idx = state.nightDropInvoices.findIndex((nd) => nd.invoiceNo === cleanInv);
    if (idx === -1) return false;

    const resolved = state.nightDropInvoices.splice(idx, 1)[0];
    if (!state.resolvedNightDrops.some((nd) => nd.invoiceNo === resolved.invoiceNo)) {
      state.resolvedNightDrops.push(resolved);
    }
    const stats = getStats();
    if (stats) stats.increment('nightDropsProcessed', 1);

    if (state.activeNightDropTab >= state.nightDropInvoices.length + state.pinnedArchiveItems.length) {
      state.activeNightDropTab = Math.max(0, state.nightDropInvoices.length + state.pinnedArchiveItems.length - 1);
    }

    playSuccess();
    notify('📄 Night Drop Invoice #' + resolved.invoiceNo + ' matched & cleared (' + receiptNumber + ')!', 4000);
    if (state.nightDropPanelOpen) renderNightDropPanel();
    if (state.filingOpen) populateFilingCards();
    notifyDeskStateChanged();
    return true;
  }

  function openNightDropPanel(dockedBesideTerminal) {
    if (state.nightDropInvoices.length === 0 && state.pinnedArchiveItems.length === 0) {
      playBeep();
      notify('📥 Inbox tray is empty — all Night Drop invoices are keyed and nothing is pinned.');
      return false;
    }
    state.nightDropPanelOpen = true;
    const panel = document.getElementById('night-drop-panel');
    if (panel) {
      panel.classList.toggle('docked-terminal', Boolean(dockedBesideTerminal));
      panel.style.display = 'flex';
    }
    renderNightDropPanel();
    playPaper();
    notifyPhase2ModalChange();
    return true;
  }

  function closeNightDropPanel(silent) {
    if (!state.nightDropPanelOpen) return;
    state.nightDropPanelOpen = false;
    const panel = document.getElementById('night-drop-panel');
    if (panel) {
      panel.style.display = 'none';
      panel.classList.remove('docked-terminal');
    }
    if (!silent) playBeep();
    notifyPhase2ModalChange();
  }

  function renderNightDropPanel() {
    const tabsEl = document.getElementById('night-drop-tabs');
    const contentEl = document.getElementById('night-drop-content');
    if (!tabsEl || !contentEl) return;

    const totalEntries = state.nightDropInvoices.length + state.pinnedArchiveItems.length;
    if (totalEntries === 0) {
      tabsEl.innerHTML = '';
      contentEl.innerHTML = '<div style="padding:18px;text-align:center;color:#64748b;font-weight:700;">ALL NIGHT DROP INVOICES KEYED & CLEAR</div>';
      return;
    }

    if (state.activeNightDropTab >= totalEntries) {
      state.activeNightDropTab = 0;
    }

    let tabsHtml = '';
    state.nightDropInvoices.forEach((nd, i) => {
      const active = i === state.activeNightDropTab;
      tabsHtml += '<button type="button" class="nd-tab ' + (active ? 'active' : '') + '" data-nd-tab="' + i + '">NIGHT DROP #' + escapeHtml(nd.invoiceNo) + '</button>';
    });
    state.pinnedArchiveItems.forEach((pin, j) => {
      const idx = state.nightDropInvoices.length + j;
      const active = idx === state.activeNightDropTab;
      tabsHtml += '<button type="button" class="nd-tab pinned ' + (active ? 'active' : '') + '" data-nd-tab="' + idx + '">PINNED #' + escapeHtml(pin.docNo) + '</button>';
    });
    tabsEl.innerHTML = tabsHtml;

    tabsEl.querySelectorAll('[data-nd-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeNightDropTab = parseInt(btn.getAttribute('data-nd-tab'), 10) || 0;
        playBeep();
        renderNightDropPanel();
      });
    });

    const isPinned = state.activeNightDropTab >= state.nightDropInvoices.length;
    const doc = isPinned
      ? state.pinnedArchiveItems[state.activeNightDropTab - state.nightDropInvoices.length]
      : state.nightDropInvoices[state.activeNightDropTab];

    if (!doc) return;

    const isCreditDoc = isPinned && doc.type === 'credit';
    let totalUnits = 0;
    let totalCost = 0;
    const rowsHtml = (doc.items || []).map((it) => {
      const rawQty = Number(it.qty) || 0;
      const signedQty = isCreditDoc ? -Math.abs(rawQty) : rawQty;
      const unitCost = Number(it.price) || 0;
      const packVal = isCreditDoc ? 1 : (doc.deptNo === '01' ? 1 : getItemUnitsPerCase(it, 'sidedoor'));
      const lineCost = signedQty * unitCost;
      totalUnits += signedQty;
      totalCost += lineCost;
      const lineCostStr = lineCost < 0 ? '-$' + Math.abs(lineCost).toFixed(2) : formatMoney(lineCost);
      const pluTag = it.notScannable
        ? ' <span style="background:#f59e0b; color:#000; font-size:8.5px; padding:0 3px; border-radius:2px; font-weight:800;">PLU</span>'
        : '';
      return '<tr>' +
        '<td style="font-weight:700; color:#0f172a; font-family:monospace;">' + escapeHtml(it.code) + pluTag + '</td>' +
        '<td class="num" style="color:#475569; font-weight:700;">' + packVal + '</td>' +
        '<td>' + escapeHtml(it.name) + '</td>' +
        '<td class="num" style="font-weight:700;">' + signedQty + '</td>' +
        '<td class="num">' + formatMoney(unitCost) + '</td>' +
        '<td class="num" style="font-weight:800;">' + lineCostStr + '</td>' +
        '</tr>';
    }).join('');

    const finalCost = doc.totalAmount !== undefined ? Number(doc.totalAmount) : totalCost;
    const finalCostStr = finalCost < 0 ? '-$' + Math.abs(finalCost).toFixed(2) : formatMoney(finalCost);
    const totalCostColor = finalCost < 0 ? '#991b1b' : '#0f172a';
    const docNumberStr = isPinned ? doc.docNo : doc.invoiceNo;
    const dateStr = isPinned
      ? (doc.shortDate || doc.dateLabel || formatShortDateFromSnap())
      : (doc.deliveryDate || formatShortDateFromSnap());
    const docNumLbl = isCreditDoc ? 'CREDIT MEMO #' : 'INVOICE #';
    const paperClass = 'inv-paper-sheet' + (isCreditDoc ? ' credit-paper' : '');

    const actionBtnHtml =
      (isPinned ? '<button id="nd-unpin-btn" class="inv-gui-btn nd-btn-unpin" type="button">UNPIN</button>' : '') +
      '<button id="nd-key-scanner-btn" class="inv-gui-btn nd-btn-scanner" type="button">SCANNER [F]</button>' +
      '<button id="nd-key-terminal-btn" class="inv-gui-btn nd-btn-terminal" type="button">TERMINAL [T]</button>';

    contentEl.innerHTML =
      '<div class="inv-scroll-wrap">' +
      '<div class="' + paperClass + '">' +
      '<div class="inv-paper-head">' +
      '<div class="inv-carrier-title">' + escapeHtml(doc.vendorName) + '</div>' +
      '</div>' +
      '<div class="inv-meta-grid">' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">DEPT #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(doc.deptNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">VENDOR #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(doc.vendorNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">' + docNumLbl + '</span>' +
      '<span class="inv-meta-val">' + escapeHtml(docNumberStr) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">DATE</span>' +
      '<span class="inv-meta-val">' + escapeHtml(dateStr) + '</span>' +
      '</div>' +
      '</div>' +
      '<table class="inv-table">' +
      '<thead>' +
      '<tr>' +
      '<th>CODE</th>' +
      '<th class="num">PACK</th>' +
      '<th>ITEM NAME</th>' +
      '<th class="num">UNITS</th>' +
      '<th class="num">UNIT $</th>' +
      '<th class="num">COST</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="inv-paper-totals">' +
      '<div class="inv-paper-total-item">' +
      '<span class="inv-paper-total-lbl">TOTAL UNITS:</span>' +
      '<span>' + totalUnits + '</span>' +
      '</div>' +
      '<div class="inv-paper-total-item">' +
      '<span class="inv-paper-total-lbl">TOTAL COST:</span>' +
      '<span style="color:' + totalCostColor + ';">' + finalCostStr + '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="inv-gui-zones">' +
      '<div class="inv-gui-zone nd-zone-tray">' +
      '<div class="inv-zone-lbl">ENTRY &amp; TRAY CONTROLS</div>' +
      '<div class="inv-zone-row">' + actionBtnHtml + '</div>' +
      '</div>' +
      '</div>';

    const keyScanBtn = document.getElementById('nd-key-scanner-btn');
    if (keyScanBtn) {
      keyScanBtn.addEventListener('click', () => {
        playBeep();
        const panel = document.getElementById('night-drop-panel');
        if (panel) {
          panel.classList.remove('docked-terminal');
          panel.classList.add('docked-scanner');
        }
        if (typeof state.hooks.onOpenScanner === 'function') {
          state.hooks.onOpenScanner('nightdrop');
        }
      });
    }
    const keyBtn = document.getElementById('nd-key-terminal-btn');
    if (keyBtn) {
      keyBtn.addEventListener('click', () => {
        playBeep();
        const panel = document.getElementById('night-drop-panel');
        if (panel) {
          panel.classList.remove('docked-scanner');
          panel.classList.add('docked-terminal');
        }
        if (typeof state.hooks.onOpenTerminalScreen === 'function') {
          state.hooks.onOpenTerminalScreen('create');
        } else {
          openTerminalScreen('create');
        }
      });
    }
    const unpinBtn = document.getElementById('nd-unpin-btn');
    if (unpinBtn) {
      unpinBtn.addEventListener('click', () => {
        state.pinnedArchiveItems = [];
        playBeep();
        notifyDeskStateChanged();
        if (state.nightDropInvoices.length === 0) {
          closeNightDropPanel(true);
        } else {
          renderNightDropPanel();
        }
        if (state.archiveOpen) renderInvoiceArchive();
      });
    }
  }

  // ---- DAILY FILING ----
  function getFilingSourceDocs() {
    const docs = [];
    // Include active/completed deliveries that were NOT refused
    const manifest = typeof state.hooks.getDeliveryManifest === 'function'
      ? (state.hooks.getDeliveryManifest() || [])
      : [];

    manifest.forEach((raw) => {
      const d = enrichDelivery(raw);
      const hasAnyRec = state.processedReceipts.some((r) => !r.voided && !r.cleared && !isPreviousDayReceipt(r) && r.deliveryId === d.id);
      if (d.refused) return;
      if (!d.completed && !d.receiptCreated && !hasAnyRec) return;

      docs.push({
        key: 'del_inv_' + d.id,
        docType: 'invoice',
        isNightDrop: false,
        isWarehouse: d.type === 'warehouse',
        deliveryId: d.id,
        vendorNo: padDigits(d.vendorNo, 3),
        deptNo: padDigits(d.deptNo, 2),
        vendorName: d.carrier || ('Vendor #' + d.vendorNo),
        docNo: padDigits(d.invoiceNo, 6),
        items: (d.invoiceItems || []).map((it) => Object.assign({}, it)),
        totalAmount: Number((d.invoiceItems || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2))
      });

      if (d.creditItems && d.creditItems.length > 0) {
        docs.push({
          key: 'del_crd_' + d.id,
          docType: 'credit',
          isNightDrop: false,
          deliveryId: d.id,
          vendorNo: padDigits(d.vendorNo, 3),
          deptNo: padDigits(d.deptNo, 2),
          vendorName: d.carrier || ('Vendor #' + d.vendorNo),
          docNo: getCreditInvoiceNo(d),
          items: (d.creditItems || []).map((it) => Object.assign({}, it, { qty: -Math.abs(Number(it.qty) || 0) })),
          totalAmount: Number((d.creditItems || []).reduce((s, it) => s - Math.abs(Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2))
        });
      }
    });

    // Include resolved Night Drops with their true original paper invoice items (whether keyed on Scanner or Terminal)
    state.resolvedNightDrops.forEach((nd) => {
      docs.push({
        key: 'nd_resolved_' + nd.invoiceNo + '_' + nd.vendorNo,
        docType: 'invoice',
        isNightDrop: true,
        pendingNightDrop: false,
        vendorNo: nd.vendorNo,
        deptNo: nd.deptNo,
        vendorName: nd.vendorName,
        docNo: nd.invoiceNo,
        items: (nd.items || []).map((it) => Object.assign({}, it)),
        totalAmount: nd.totalAmount
      });
    });

    // Include remaining unresolved Night Drops (cannot finish filing while unresolved)
    state.nightDropInvoices.forEach((nd) => {
      docs.push({
        key: 'nd_pending_' + nd.invoiceNo,
        docType: 'invoice',
        isNightDrop: true,
        pendingNightDrop: true,
        vendorNo: nd.vendorNo,
        deptNo: nd.deptNo,
        vendorName: nd.vendorName,
        docNo: nd.invoiceNo,
        items: (nd.items || []).map((it) => Object.assign({}, it)),
        totalAmount: nd.totalAmount
      });
    });

    // Include any other non-voided standalone receipts (scanner OR terminal) whose invoiceNo isn't already represented
    // (Skip Home Office archive correction/missing receipts so they link in January Archive instead of blocking Today's Daily Filing)
    const knownDocKeys = new Set(docs.map((doc) => doc.docType + '_' + doc.docNo + '_' + doc.vendorNo));
    state.processedReceipts.filter((r) => !r.voided && !r.cleared && !isPreviousDayReceipt(r) && !isHomeOfficeTaskArchiveReceipt(r) && r.items && r.items.length > 0).forEach((rec) => {
      const k = rec.type + '_' + rec.invoiceNo + '_' + rec.vendorNo;
      if (!knownDocKeys.has(k) && !docs.some((doc) => doc.docNo === rec.invoiceNo)) {
        const catalog = getCatalog();
        const vInfo = catalog ? catalog.getVendorInDept(rec.vendorNo, rec.deptNo) : null;
        docs.push({
          key: 'manual_' + rec.type + '_' + rec.invoiceNo + '_' + rec.vendorNo,
          docType: rec.type || 'invoice',
          isNightDrop: true,
          pendingNightDrop: false,
          vendorNo: rec.vendorNo,
          deptNo: rec.deptNo,
          vendorName: vInfo ? vInfo.name : ('Vendor #' + rec.vendorNo),
          docNo: rec.invoiceNo,
          items: (rec.items || []).map((it) => Object.assign({}, it)),
          totalAmount: rec.totalAmount
        });
        knownDocKeys.add(k);
      }
    });

    return docs;
  }

  function isDailyFilingReceiptEligible(r) {
    return Boolean(
      r &&
      !r.voided &&
      !r.cleared &&
      !isPreviousDayReceipt(r) &&
      !isHomeOfficeTaskArchiveReceipt(r) &&
      r.finalized
    );
  }

  function printSingleStoreCopy(receiptNo) {
    const rec = findReceipt(receiptNo);
    if (!rec) return { ok: false, error: 'Receipt not found.' };
    if (rec.voided) return { ok: false, error: 'Cannot print Store Copy of a VOID receipt.' };
    if (!rec.finalized) return { ok: false, error: 'Finalize INITIAL receipt before printing a Store Copy.' };
    if (isPreviousDayReceipt(rec) || rec.cleared) return { ok: false, error: 'Receipt already cleared from prior shift.' };
    if (isHomeOfficeTaskArchiveReceipt(rec)) return { ok: false, error: 'Home Office archive corrections file automatically to the 32-Day Archive.' };

    rec.storeCopyPrinted = true;
    if (typeof state.hooks.onReceiptPrinted === 'function') {
      state.hooks.onReceiptPrinted(null, { fromTerminal: true, storeCopy: true, receiptNumber: rec.receiptNumber });
    }
    if (state.filingOpen) populateFilingCards();
    notify('🖨️ Store Copy #' + rec.receiptNumber + ' printed & placed in Daily Filing folder.', 3400);
    return { ok: true, receipt: rec };
  }

  function printAllDailyStoreCopies() {
    const eligible = state.processedReceipts.filter(isDailyFilingReceiptEligible);
    const pending = eligible.filter((r) => !r.storeCopyPrinted);

    if (pending.length === 0) {
      return { ok: true, printedCount: 0, newlyPrintedCount: 0 };
    }

    pending.forEach((rec) => {
      rec.storeCopyPrinted = true;
    });

    if (typeof state.hooks.onReceiptPrinted === 'function') {
      state.hooks.onReceiptPrinted(null, { fromTerminal: true, storeCopy: true, batchCount: pending.length });
    }
    if (state.filingOpen) populateFilingCards();

    return { ok: true, printedCount: pending.length, newlyPrintedCount: pending.length };
  }

  function populateFilingCards() {
    // Preserve previous manual receipt links if receipt & invoice keys still exist
    const prevLinks = {};
    state.filingReceipts.forEach((r) => {
      if (r.linkedToKey) prevLinks[r.receiptNumber] = r.linkedToKey;
    });

    state.filingInvoices = getFilingSourceDocs();
    const validKeys = new Set(state.filingInvoices.map((inv) => inv.key));

    state.filingReceipts = state.processedReceipts
      .filter((r) => isDailyFilingReceiptEligible(r) && Boolean(r.storeCopyPrinted))
      .map((r) => ({
        receiptNumber: r.receiptNumber,
        vendorNo: r.vendorNo,
        deptNo: r.deptNo,
        invoiceNo: r.invoiceNo,
        type: r.type,
        source: r.source || 'scanner',
        isWarehouse: r.source === 'warehouse',
        totalAmount: r.totalAmount,
        items: (r.items || []).map((it) => Object.assign({}, it)),
        deliveryId: r.deliveryId || null,
        linkedToKey: (prevLinks[r.receiptNumber] && validKeys.has(prevLinks[r.receiptNumber])) ? prevLinks[r.receiptNumber] : null
      }));

    state.filingSelectedSide = null;
    state.filingSelectedIdx = -1;
    renderFilingCards();
  }

  function evaluateFilingInvoiceMatch(inv, linkedReceipts) {
    if (!linkedReceipts || linkedReceipts.length === 0) {
      return { status: 'unlinked', label: inv.pendingNightDrop ? 'KEY NIGHT DROP IN TERMINAL [1]' : 'UNLINKED', qtyDiff: 0 };
    }
    // Verify header compatibility on all linked receipts
    const headerMismatch = linkedReceipts.some((r) => r.invoiceNo !== inv.docNo || r.vendorNo !== inv.vendorNo || r.type !== inv.docType);
    if (headerMismatch) {
      return { status: 'mismatch', label: 'HEADER / DOC TYPE MISMATCH', qtyDiff: 0 };
    }
    if (inv.isWarehouse) {
      return { status: 'matched', label: '✓ MATCHED (BOL AUTO-FINALIZED)', qtyDiff: 0 };
    }

    const expectedMap = {};
    (inv.items || []).forEach((it) => {
      expectedMap[it.code] = (expectedMap[it.code] || 0) + (Number(it.qty) || 0);
    });
    const receivedMap = {};
    linkedReceipts.forEach((r) => {
      (r.items || []).forEach((it) => {
        receivedMap[it.code] = (receivedMap[it.code] || 0) + (Number(it.qty) || 0);
      });
    });

    let remaining = 0;
    let overage = 0;
    const allCodes = new Set(Object.keys(expectedMap).concat(Object.keys(receivedMap)));
    allCodes.forEach((code) => {
      const exp = expectedMap[code] || 0;
      const got = receivedMap[code] || 0;
      if (got < exp) remaining += (exp - got);
      if (got > exp) overage += (got - exp);
    });

    if (remaining > 0) {
      return { status: 'remaining', label: '⚠ REMAINING (' + remaining + ' CASES SHORT)', qtyDiff: -remaining };
    }
    if (overage > 0) {
      return { status: 'overage', label: '⚠ OVERAGE (+' + overage + ' EXCESS)', qtyDiff: overage };
    }
    return { status: 'matched', label: '✓ MATCHED (' + linkedReceipts.length + ' RCPT)', qtyDiff: 0 };
  }

  function linkFilingPair(invIdx, recIdx) {
    const inv = state.filingInvoices[invIdx];
    const rec = state.filingReceipts[recIdx];
    if (!inv || !rec) return;

    if (rec.invoiceNo !== inv.docNo || rec.vendorNo !== inv.vendorNo || rec.deptNo !== inv.deptNo) {
      playError();
      notify('⚠️ Receipt #' + rec.receiptNumber + ' (V#' + rec.vendorNo + ' D#' + rec.deptNo + ' Inv#' + rec.invoiceNo + ') does not match Invoice #' + inv.docNo + '!');
      state.filingSelectedSide = null;
      state.filingSelectedIdx = -1;
      renderFilingCards();
      return;
    }
    if (rec.type !== inv.docType) {
      playError();
      notify('⚠️ Type mismatch: cannot pair a ' + rec.type.toUpperCase() + ' receipt with a ' + inv.docType.toUpperCase() + ' card.');
      state.filingSelectedSide = null;
      state.filingSelectedIdx = -1;
      renderFilingCards();
      return;
    }

    rec.linkedToKey = inv.key;
    state.filingSelectedSide = null;
    state.filingSelectedIdx = -1;
    playSuccess();
    renderFilingCards();
  }

  function openFilingOverlay() {
    state.filingOpen = true;
    const overlay = document.getElementById('filing-overlay');
    if (overlay) overlay.style.display = 'flex';
    populateFilingCards();
    playPaper();
    notifyPhase2ModalChange();
  }

  function closeFilingOverlay() {
    if (!state.filingOpen) return;
    state.filingOpen = false;
    const overlay = document.getElementById('filing-overlay');
    if (overlay) overlay.style.display = 'none';
    playBeep();
    notifyPhase2ModalChange();
  }

  function renderFilingCards() {
    const invCol = document.getElementById('filing-invoices-col');
    const recCol = document.getElementById('filing-receipts-col');
    const statusBar = document.getElementById('filing-status-bar');
    const fileBtn = document.getElementById('filing-file-btn');
    if (!invCol || !recCol || !statusBar || !fileBtn) return;

    if (state.filingComplete) {
      statusBar.innerHTML = '<span style="color:#4ade80;font-weight:800;">✓ DAILY FILING COMPLETE — ' + state.filedReceiptsCount + ' RECEIPT(S) ARCHIVED INTO TODAY\'S FOLDER</span>';
      invCol.innerHTML = '<div class="filing-empty">All Shift Paperwork Filed & Verified</div>';
      recCol.innerHTML = '<div class="filing-empty">Archived into Top File Drawer (Index 0)</div>';
      fileBtn.disabled = true;
      fileBtn.textContent = 'FILED TO CABINET ✓';
      return;
    }

    const clock = getClock();
    const afterNoon = clock ? clock.isAfterNoon() : false;
    const snap = clock ? clock.getTimeSnapshot() : { formatted12h: '6:00 AM' };
    const shortDateStr = formatShortDateFromSnap(snap, true);
    const awaitingInvoiceDrop = state.filingSelectedSide === 'rec';

    const unprintedStoreCopies = state.processedReceipts.filter(
      (r) => isDailyFilingReceiptEligible(r) && !r.storeCopyPrinted
    );
    const initialUnfinalized = state.processedReceipts.filter(
      (r) => r && !r.voided && !r.cleared && !isPreviousDayReceipt(r) && !isHomeOfficeTaskArchiveReceipt(r) && !r.finalized
    );

    const buildMiniLinesHtml = (items, maxLines, docOpts) => {
      const list = Array.isArray(items) ? items : [];
      if (list.length === 0) {
        return '<div class="filing-mini-line"><span class="filing-mini-line-name">No line items</span><span class="filing-mini-line-qty">--</span></div>';
      }
      const dOpts = docOpts || {};
      const shown = list.slice(0, maxLines).map((it) => {
        const qty = Number(it.qty) || 0;
        const unitPrice = Number(it.price) || 0;
        const packVal = (dOpts.isCredit || qty < 0) ? 1 : (dOpts.isWarehouse ? 1 : getItemUnitsPerCase(it, 'sidedoor'));
        const ext = formatMoney(qty * unitPrice);
        return '<div class="filing-mini-line">' +
          '<span class="filing-mini-line-name">' + escapeHtml(String(it.code || '')) + ' [' + packVal + '] ' + escapeHtml(String(it.name || 'ITEM')) + '</span>' +
          '<span class="filing-mini-line-qty">' + qty + 'x · ' + ext + '</span>' +
          '</div>';
      }).join('');
      const extra = list.length > maxLines
        ? ('<div class="filing-mini-more">+ ' + (list.length - maxLines) + ' more line(s)</div>')
        : '';
      return shown + extra;
    };

    const renderMiniStoreCopyHtml = (rec, opts) => {
      const cfg = opts || {};
      const nested = Boolean(cfg.nested);
      const idx = cfg.idx !== undefined ? cfg.idx : -1;
      const isSelected = !nested && state.filingSelectedSide === 'rec' && state.filingSelectedIdx === idx;
      const isLinked = Boolean(rec.linkedToKey);
      const totalUnits = (rec.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
      const dragAttrs = nested
        ? ''
        : (' draggable="true" data-filing-side="rec" data-filing-idx="' + idx + '"');
      const actionBadge = nested
        ? ('<button class="filing-unlink-btn" type="button" data-unlink-rec="' + escapeHtml(rec.receiptNumber) + '" title="Move Store Copy back to loose stack">✕ UNCLIP</button>')
        : ('<span class="filing-mini-stamp ' + (isLinked ? 'matched' : '') + '">' + (isLinked ? '📎 CLIPPED ✓' : 'DRAG / CLICK → INV') + '</span>');

      return '<div class="filing-mini-doc filing-mini-receipt ' + (rec.type === 'credit' ? 'is-credit ' : '') + (nested ? 'nested matched ' : (isLinked ? 'matched ' : 'unlinked ')) + (isSelected ? 'selected' : '') + '"' + dragAttrs + '>' +
        '<div class="filing-dm-banner">' +
        '<span>*** STORE COPY · ' + (rec.type === 'credit' ? 'CREDIT' : (rec.isWarehouse ? 'AUTO WHSE' : 'DSD')) + ' ***</span>' +
        '<span>#' + escapeHtml(rec.receiptNumber) + '</span>' +
        '</div>' +
        '<div class="filing-dm-sub">' +
        '<span>INV #' + escapeHtml(rec.invoiceNo) + ' · V#' + escapeHtml(rec.vendorNo) + ' D#' + escapeHtml(rec.deptNo) + '</span>' +
        '<span>' + escapeHtml(shortDateStr) + '</span>' +
        '</div>' +
        '<div class="filing-mini-lines">' + buildMiniLinesHtml(rec.items, 2, { isCredit: rec.type === 'credit', isWarehouse: rec.isWarehouse || rec.deptNo === '01' }) + '</div>' +
        '<div class="filing-mini-ftr">' +
        '<span style="font-size:10px;font-weight:900;color:#0f172a;">UNITS: ' + totalUnits + ' · TOTAL: ' + formatMoney(rec.totalAmount) + '</span>' +
        actionBadge +
        '</div>' +
        '</div>';
    };

    const invHtml = state.filingInvoices.length === 0
      ? '<div class="filing-empty">No invoices ready to file yet. Process deliveries or key Night Drops in Terminal [1].</div>'
      : state.filingInvoices.map((inv, idx) => {
        const linkedRecs = state.filingReceipts.filter((r) => r.linkedToKey === inv.key);
        const evalRes = evaluateFilingInvoiceMatch(inv, linkedRecs);
        const isSelected = state.filingSelectedSide === 'inv' && state.filingSelectedIdx === idx;
        const pinnedMatch = state.pinnedArchiveItems.some((p) => p.docNo === inv.docNo && p.vendorNo === inv.vendorNo);
        const kindCls = inv.docType === 'credit' ? 'is-credit' : (inv.isWarehouse ? 'is-whse' : (inv.isNightDrop ? 'is-nightdrop' : ''));
        const tagCls = inv.docType === 'credit' ? 'credit' : (inv.isWarehouse ? 'whse' : (inv.isNightDrop ? 'nightdrop' : 'inv'));
        const tagLabel = inv.docType === 'credit' ? 'CREDIT MEMO' : (inv.isWarehouse ? 'WHSE BOL' : (inv.isNightDrop ? 'NIGHT DROP' : 'INVOICE'));
        const docTotalUnits = (inv.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

        const pinBtn = inv.pendingNightDrop
          ? '<button class="filing-pin-btn" data-pin-filing="' + idx + '">' + (pinnedMatch ? '📌 PINNED' : '📌 PIN TO DESK') + '</button>'
          : '';

        const invoiceSheetHtml = '<div class="filing-mini-doc filing-mini-invoice ' + kindCls + ' ' + evalRes.status + (isSelected ? ' selected' : '') + (awaitingInvoiceDrop ? ' awaiting-drop' : '') + '" draggable="true" data-filing-side="inv" data-filing-idx="' + idx + '">' +
          '<div class="filing-mini-hdr">' +
          '<div>' +
          '<span class="filing-tag ' + tagCls + '">' + tagLabel + '</span> ' +
          '<div class="filing-mini-vendor">' + escapeHtml(inv.vendorName) + '</div>' +
          '</div>' +
          '<div class="filing-mini-docno">#' + escapeHtml(inv.docNo) + '</div>' +
          '</div>' +
          '<div class="filing-mini-meta-grid">' +
          '<div class="filing-mini-meta-cell"><span>DEPT</span><strong>#' + escapeHtml(inv.deptNo) + '</strong></div>' +
          '<div class="filing-mini-meta-cell"><span>VEND</span><strong>#' + escapeHtml(inv.vendorNo) + '</strong></div>' +
          '<div class="filing-mini-meta-cell"><span>UNITS</span><strong>' + docTotalUnits + '</strong></div>' +
          '<div class="filing-mini-meta-cell"><span>TOTAL</span><strong>' + formatMoney(inv.totalAmount) + '</strong></div>' +
          '</div>' +
          '<div class="filing-mini-lines">' + buildMiniLinesHtml(inv.items, 3, { isCredit: inv.docType === 'credit', isWarehouse: inv.isWarehouse || inv.deptNo === '01' }) + '</div>' +
          '<div class="filing-mini-ftr">' +
          '<span class="filing-mini-stamp ' + evalRes.status + '">' + escapeHtml(evalRes.label) + '</span>' +
          pinBtn +
          '</div>' +
          '</div>';

        const stackedRecsHtml = linkedRecs.length > 0
          ? '<div class="filing-stacked-receipts">' +
          linkedRecs.map((r) => renderMiniStoreCopyHtml(r, { nested: true })).join('') +
          '</div>'
          : '';

        return '<div class="filing-folder-group ' + evalRes.status + '">' +
          '<div class="filing-folder-tabbar">' +
          '<span>📁 V#' + escapeHtml(inv.vendorNo) + ' · ' + tagLabel + ' #' + escapeHtml(inv.docNo) + '</span>' +
          '<span style="color:' + (linkedRecs.length > 0 ? '#4ade80' : '#94a3b8') + ';">' + linkedRecs.length + ' STORE COPY</span>' +
          '</div>' +
          invoiceSheetHtml +
          stackedRecsHtml +
          '</div>';
      }).join('');

    const unprintedBannerHtml = unprintedStoreCopies.length > 0
      ? '<div class="filing-unprinted-notice">' +
      '<strong>🖨️ ' + unprintedStoreCopies.length + ' STORE COPY RECEIPT(S) NOT PRINTED YET</strong><br>' +
      'Open <strong>Computer Terminal → [2] Receipt Ledger</strong> and press <strong>[ PRINT ALL STORE COPIES ]</strong> to send them to this Daily Filing folder.' +
      '</div>'
      : '';

    const looseReceipts = state.filingReceipts
      .map((rec, idx) => ({ rec, idx }))
      .filter((entry) => !entry.rec.linkedToKey);

    const recListHtml = looseReceipts.map((entry) => renderMiniStoreCopyHtml(entry.rec, { nested: false, idx: entry.idx })).join('');

    const recHtml = (unprintedBannerHtml + recListHtml) || (
      state.filingReceipts.length > 0
        ? '<div class="filing-empty" style="color:#4ade80;">✓ All ' + state.filingReceipts.length + ' Store Copy printout(s) matched &amp; stacked under their invoices on the left!</div>'
        : '<div class="filing-empty">No loose Store Copy printouts waiting. Print them from Terminal [2] Receipt Ledger.</div>'
    );

    invCol.innerHTML = invHtml;
    recCol.innerHTML = recHtml;

    const totalInv = state.filingInvoices.length;
    const pairedInvCount = state.filingInvoices.filter((inv) => state.filingReceipts.some((r) => r.linkedToKey === inv.key)).length;
    const unlinkedRecCount = state.filingReceipts.filter((r) => !r.linkedToKey).length;
    const readyToFile = afterNoon && totalInv > 0 && unprintedStoreCopies.length === 0 && initialUnfinalized.length === 0 && pairedInvCount === totalInv && unlinkedRecCount === 0 && state.nightDropInvoices.length === 0;

    if (!afterNoon) {
      statusBar.innerHTML = '<span style="color:#fbbf24;font-weight:700;">🔒 DAILY FILING LOCKED UNTIL 12:00 PM NOON (Current: ' + escapeHtml(snap.formatted12h) + ') — Print Store Copies in Terminal [2] &amp; pre-clip paperwork now.</span>';
    } else if (state.nightDropInvoices.length > 0) {
      statusBar.innerHTML = '<span style="color:#f87171;font-weight:700;">⚠ ' + state.nightDropInvoices.length + ' NIGHT DROP INVOICE(S) STILL UNKEYED — Key in Terminal [1] before filing.</span>';
    } else if (unprintedStoreCopies.length > 0) {
      statusBar.innerHTML = '<span style="color:#fbbf24;font-weight:700;">🖨️ ' + unprintedStoreCopies.length + ' RECEIPT(S) NEED STORE COPIES PRINTED — Use Terminal [2] Receipt Ledger → Print All Store Copies.</span>';
    } else if (initialUnfinalized.length > 0) {
      statusBar.innerHTML = '<span style="color:#fbbf24;font-weight:700;">⚠ ' + initialUnfinalized.length + ' INITIAL RECEIPT(S) UNFINALIZED — Finalize before printing Store Copies.</span>';
    } else if (pairedInvCount < totalInv || unlinkedRecCount > 0) {
      statusBar.innerHTML = '<span style="color:#93c5fd;font-weight:700;">CLIP EVERY STORE COPY TO ITS INVOICE (' + pairedInvCount + '/' + totalInv + ' invoices clipped, ' + unlinkedRecCount + ' loose store copies)</span>';
    } else {
      statusBar.innerHTML = '<span style="color:#4ade80;font-weight:800;">✓ ALL ' + totalInv + ' DOCUMENT PAIRS CLIPPED &amp; AFTER NOON — READY TO FILE!</span>';
    }

    fileBtn.disabled = !readyToFile;
    fileBtn.textContent = afterNoon ? 'FILE ALL LINKED PAIRS TO CABINET' : 'LOCKED UNTIL 12:00 PM';

    // Attach click + drag/drop handlers on cards
    const allCards = document.querySelectorAll('#filing-overlay [data-filing-side]');
    allCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-unlink-rec]') || e.target.closest('[data-pin-filing]')) return;
        const side = card.getAttribute('data-filing-side');
        const idx = parseInt(card.getAttribute('data-filing-idx'), 10);

        if (state.filingSelectedSide === null) {
          state.filingSelectedSide = side;
          state.filingSelectedIdx = idx;
          playBeep();
          renderFilingCards();
        } else if (state.filingSelectedSide === side) {
          if (state.filingSelectedIdx === idx) {
            state.filingSelectedSide = null;
            state.filingSelectedIdx = -1;
          } else {
            state.filingSelectedIdx = idx;
          }
          playBeep();
          renderFilingCards();
        } else {
          const invIdx = side === 'inv' ? idx : state.filingSelectedIdx;
          const recIdx = side === 'rec' ? idx : state.filingSelectedIdx;
          linkFilingPair(invIdx, recIdx);
        }
      });

      card.addEventListener('dragstart', () => {
        const side = card.getAttribute('data-filing-side');
        const idx = parseInt(card.getAttribute('data-filing-idx'), 10);
        state.filingSelectedSide = side;
        state.filingSelectedIdx = idx;
        if (side === 'rec') {
          document.querySelectorAll('#filing-invoices-col .filing-mini-invoice').forEach((el) => {
            el.classList.add('awaiting-drop');
          });
        }
      });
      card.addEventListener('dragend', () => {
        document.querySelectorAll('#filing-invoices-col .filing-mini-invoice.awaiting-drop').forEach((el) => {
          el.classList.remove('awaiting-drop');
        });
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const targetSide = card.getAttribute('data-filing-side');
        const targetIdx = parseInt(card.getAttribute('data-filing-idx'), 10);
        if (state.filingSelectedSide && state.filingSelectedSide !== targetSide) {
          const invIdx = targetSide === 'inv' ? targetIdx : state.filingSelectedIdx;
          const recIdx = targetSide === 'rec' ? targetIdx : state.filingSelectedIdx;
          linkFilingPair(invIdx, recIdx);
        }
      });
    });

    document.querySelectorAll('[data-unlink-rec]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rNo = btn.getAttribute('data-unlink-rec');
        const rec = state.filingReceipts.find((r) => r.receiptNumber === rNo);
        if (rec) rec.linkedToKey = null;
        playBeep();
        renderFilingCards();
      });
    });

    document.querySelectorAll('[data-pin-filing]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-pin-filing'), 10);
        const inv = state.filingInvoices[idx];
        if (!inv) return;
        toggleArchivePin({
          type: inv.docType,
          vendorName: inv.vendorName,
          vendorNo: inv.vendorNo,
          deptNo: inv.deptNo,
          docNo: inv.docNo,
          dateLabel: 'TODAY UNFILED',
          items: inv.items,
          totalAmount: inv.totalAmount
        });
        renderFilingCards();
      });
    });
  }

  function fileAllLinkedPairs() {
    const clock = getClock();
    if (clock && !clock.isAfterNoon()) {
      playError();
      notify('🔒 Daily Filing is locked until 12:00 PM noon.');
      return;
    }
    if (state.nightDropInvoices.length > 0) {
      playError();
      notify('⚠️ Key all Night Drop invoices on the Terminal [1] before filing.');
      return;
    }
    const unprintedStoreCopies = state.processedReceipts.filter(
      (r) => isDailyFilingReceiptEligible(r) && !r.storeCopyPrinted
    );
    if (unprintedStoreCopies.length > 0) {
      playError();
      notify('🖨️ Print all Store Copies in Terminal [2] Receipt Ledger before filing.');
      return;
    }
    const unlinkedRecs = state.filingReceipts.filter((r) => !r.linkedToKey);
    const unlinkedInvs = state.filingInvoices.filter((inv) => !state.filingReceipts.some((r) => r.linkedToKey === inv.key));
    if (unlinkedRecs.length > 0 || unlinkedInvs.length > 0 || state.filingInvoices.length === 0) {
      playError();
      notify('⚠️ Every invoice and receipt must be paired before filing.');
      return;
    }

    state.filingComplete = true;
    state.filedReceiptsCount = state.filingReceipts.length;

    // Mark processed today receipts as CLEAR (processed by billing — locked against edits)
    state.processedReceipts.forEach((r) => {
      if (!r.voided) r.cleared = true;
    });
    if (state.scanner.activeReceiptNo) {
      resetScannerSession(getActiveDeliveryEnriched());
      renderScannerUI();
    }
    if (state.manualDraft && state.manualDraft.receiptNumber) {
      startManualDraft();
    }

    const stats = getStats();
    if (stats) stats.setFlag('filingDone', true);

    // Build Today's Archived Day Entry (Archive index 0), grouping invoice + credit memo per delivery
    const snap = clock ? clock.getTimeSnapshot() : { dateLabel: 'FEB 1, 1996' };
    const vendorFolders = [];
    const folderByDeliveryId = {};

    const buildArchivedItems = (inv, linkedRecs) => {
      const netReceived = {};
      linkedRecs.forEach((r) => {
        (r.items || []).forEach((it) => {
          netReceived[it.code] = (netReceived[it.code] || 0) + (Number(it.qty) || 0);
        });
      });
      let anyShort = false;
      const items = (inv.items || []).map((it) => {
        const received = netReceived[it.code] !== undefined ? netReceived[it.code] : 0;
        const isShort = inv.docType === 'invoice' && received < it.qty;
        if (isShort) anyShort = true;
        return {
          code: it.code,
          name: it.name,
          qty: it.qty,
          receivedQty: isShort ? Math.max(0, received) : it.qty,
          price: it.price,
          archivedShort: isShort
        };
      });
      return { items, anyShort };
    };

    state.filingInvoices.forEach((inv) => {
      const linkedRecs = state.filingReceipts.filter((r) => r.linkedToKey === inv.key);
      if (inv.docType === 'credit' && inv.deliveryId && folderByDeliveryId[inv.deliveryId]) {
        const parentFolder = folderByDeliveryId[inv.deliveryId];
        parentFolder.creditDoc = {
          docNo: inv.docNo,
          items: (inv.items || []).map((it) => Object.assign({}, it)),
          totalAmount: inv.totalAmount
        };
        parentFolder.receipts = parentFolder.receipts.concat(linkedRecs);
        return;
      }

      const built = buildArchivedItems(inv, linkedRecs);
      const folder = {
        vendorName: inv.vendorName,
        vendorNo: inv.vendorNo,
        deptNo: inv.deptNo,
        invoiceNo: inv.docNo,
        docType: inv.docType,
        hasShort: built.anyShort,
        items: built.items,
        totalAmount: inv.totalAmount,
        creditDoc: null,
        receipts: linkedRecs.slice()
      };
      if (inv.deliveryId && inv.docType === 'invoice') {
        folderByDeliveryId[inv.deliveryId] = folder;
      }
      vendorFolders.push(folder);
    });

    if (state.archiveData.length > 0 && state.archiveData[0].isToday) {
      state.archiveData[0] = {
        dateStr: snap.dateLabel + ' (FILED TODAY)',
        shortDate: formatShortDateFromSnap(snap),
        isToday: true,
        placeholder: false,
        colorHex: '#22c55e',
        vendors: vendorFolders
      };
    }

    playSuccess();
    notify('📁 Daily Filing Complete! ' + state.filedReceiptsCount + ' receipt(s) filed to Top Drawer Archive.', 4500);
    renderFilingCards();
    if (state.archiveOpen) renderInvoiceArchive();
    notifyDeskStateChanged();
  }

  // ---- 32-DAY FILE CABINET ARCHIVE ----
  const ARCHIVE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function formatOffsetDateLabel(daysAgo) {
    const base = new Date(1996, 1, 1); // Feb 1, 1996
    const clock = getClock();
    const dayOffset = clock ? (clock.getTimeSnapshot().dayOffset || 0) : 0;
    base.setDate(base.getDate() + dayOffset - daysAgo);
    return MONTHS[base.getMonth()] + ' ' + base.getDate() + ', ' + base.getFullYear();
  }

  function cloneArchiveDataPayload(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function hydrateStaticArchiveHistory(payload) {
    if (!payload || !Array.isArray(payload.days) || payload.days.length === 0) return null;
    state.staticArchiveHistory = payload;
    // Populate archive immediately if not already populated with historical days
    if (state.archiveData.length <= 1) {
      generateArchiveData(true);
      if (state.archiveOpen) renderInvoiceArchive();
    }
    return state.staticArchiveHistory;
  }

  function loadArchiveHistoryFallbackScript(fallbackUrl) {
    if (global.__DSD_ARCHIVE_HISTORY_FALLBACK__) {
      hydrateStaticArchiveHistory(global.__DSD_ARCHIVE_HISTORY_FALLBACK__);
      return Promise.resolve(state.staticArchiveHistory);
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = fallbackUrl || './data/dsd-archive-history-fallback.js';
      script.onload = () => {
        if (global.__DSD_ARCHIVE_HISTORY_FALLBACK__) {
          hydrateStaticArchiveHistory(global.__DSD_ARCHIVE_HISTORY_FALLBACK__);
        }
        resolve(state.staticArchiveHistory);
      };
      script.onerror = () => {
        console.warn('DSDReceipts failed to load archive fallback script:', script.src);
        resolve(state.staticArchiveHistory);
      };
      document.head.appendChild(script);
    });
  }

  function loadArchiveHistory(url) {
    if (state.staticArchiveHistory) return Promise.resolve(state.staticArchiveHistory);
    if (state.archiveHistoryPromise) return state.archiveHistoryPromise;

    if (global.gameConfig && global.gameConfig.archiveHistory) {
      hydrateStaticArchiveHistory(global.gameConfig.archiveHistory);
      return Promise.resolve(state.staticArchiveHistory);
    }

    if (global.__DSD_ARCHIVE_HISTORY_FALLBACK__) {
      hydrateStaticArchiveHistory(global.__DSD_ARCHIVE_HISTORY_FALLBACK__);
      return Promise.resolve(state.staticArchiveHistory);
    }

    if (global.location && global.location.protocol === 'file:') {
      state.archiveHistoryPromise = loadArchiveHistoryFallbackScript('./data/dsd-archive-history-fallback.js');
      return state.archiveHistoryPromise;
    }

    const targetUrl = url || './data/dsd-archive-history.json';
    state.archiveHistoryPromise = fetch(targetUrl)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' loading ' + targetUrl);
        return res.json();
      })
      .then((json) => {
        hydrateStaticArchiveHistory(json);
        return state.staticArchiveHistory;
      })
      .catch((err) => {
        console.warn('DSDReceipts archive fetch failed for ' + targetUrl + ', using fallback:', err);
        return loadArchiveHistoryFallbackScript('./data/dsd-archive-history-fallback.js');
      });

    return state.archiveHistoryPromise;
  }

  function restoreHistoricalArchiveDays() {
    const todayAndFiledFeb = state.archiveData.filter((day) => day && (day.isToday || String(day.dateStr || '').startsWith('FEB')));
    if (state.staticArchiveHistory && Array.isArray(state.staticArchiveHistory.days) && state.staticArchiveHistory.days.length > 0) {
      const freshJan = state.staticArchiveHistory.days.map((rawDay) => cloneArchiveDataPayload(rawDay));
      state.archiveData = todayAndFiledFeb.concat(freshJan);
    } else if (Array.isArray(state.proceduralArchiveSnapshot) && state.proceduralArchiveSnapshot.length > 0) {
      const freshJan = state.proceduralArchiveSnapshot.map((rawDay) => cloneArchiveDataPayload(rawDay));
      state.archiveData = todayAndFiledFeb.concat(freshJan);
    }
    if (state.archiveData.length > 32) {
      state.archiveData.length = 32;
    }
  }

  function generateArchiveData(forceHistorical) {
    const snap = getClock() ? getClock().getTimeSnapshot() : { dateLabel: 'FEB 1, 1996' };
    const existingToday = (state.archiveData.length > 0 && state.archiveData[0].isToday)
      ? state.archiveData[0]
      : {
        dateStr: snap.dateLabel + ' (TODAY)',
        isToday: true,
        placeholder: true,
        colorHex: '#22c55e',
        vendors: []
      };

    const needsHistorical = Boolean(forceHistorical) || state.archiveData.length <= 1;
    if (!needsHistorical) {
      state.archiveData[0] = existingToday;
      return;
    }

    state.archiveData = [existingToday];

    // Prefer the loaded static January 1996 archive dataset (from dsd-archive-history.json / fallback)
    if (state.staticArchiveHistory && Array.isArray(state.staticArchiveHistory.days) && state.staticArchiveHistory.days.length > 0) {
      state.staticArchiveHistory.days.forEach((rawDay) => {
        state.archiveData.push(cloneArchiveDataPayload(rawDay));
      });
      return;
    }

    // Procedural safety fallback only if static files are not yet loaded
    const pool = getDsdVendorsPool(true);
    if (pool.length === 0) return;

    let serialCounter = 1200;
    for (let d = 1; d <= 31; d++) {
      const dateStr = formatOffsetDateLabel(d);
      const colorHex = ARCHIVE_COLORS[d % ARCHIVE_COLORS.length];
      const vendorCount = Math.min(pool.length, 2 + (d % 4));
      const dayVendors = [];
      const shuffled = pool.slice().sort(() => Math.random() - 0.5);

      for (let v = 0; v < vendorCount; v++) {
        const pick = shuffled[v];
        const invNo = String(200000 + ((d * 7919 + v * 131) % 780000));
        const prodCount = Math.min(pick.products.length, 2 + ((d + v) % 3));
        const hasShortStamp = pick.deptNo !== '01' && ((d + v) % 5 === 0);
        const items = pick.products.slice(0, prodCount).map((p, idx) => {
          const upc = getItemUnitsPerCase(p, pick.deptNo === '01' ? 'warehouse' : 'sidedoor');
          const origCases = 2 + ((d + idx) % 6);
          const isShort = hasShortStamp && idx === 0;
          const origQty = origCases * upc;
          return {
            code: String(p.code),
            name: p.name,
            qty: origQty,
            receivedQty: isShort ? Math.max(upc, (origCases - 1) * upc) : origQty,
            unitsPerCase: upc,
            price: Number(p.price) || 0,
            archivedShort: isShort
          };
        });

        const totalAmount = items.reduce((s, it) => s + it.qty * it.price, 0);
        const rItems = items.map((it) => ({
          code: it.code,
          name: it.name,
          qty: it.archivedShort ? it.receivedQty : it.qty,
          price: it.price
        }));
        const rTotal = rItems.reduce((s, it) => s + it.qty * it.price, 0);
        serialCounter++;

        const timeLabel = (7 + v) + ':' + String((d * 13) % 50).padStart(2, '0') + ' AM';
        const receipts = [{
          receiptNumber: pick.deptNo + '-' + String(serialCounter).padStart(4, '0'),
          type: 'invoice',
          invoiceNo: invNo,
          time: timeLabel,
          totalAmount: Number(rTotal.toFixed(2)),
          items: rItems
        }];

        let creditDoc = null;
        if (pick.deptNo !== '01' && pick.deptNo !== '12' && pick.deptNo !== '22' && (d + v) % 5 === 1 && pick.products.length > 0) {
          const cp = pick.products[0];
          const cQty = -1;
          const cInvNo = String(parseInt(invNo, 10) + 1);
          creditDoc = {
            docNo: cInvNo,
            items: [{ code: String(cp.code), name: cp.name, qty: cQty, price: Number(cp.price) || 0 }],
            totalAmount: Number((cQty * (Number(cp.price) || 0)).toFixed(2))
          };
          serialCounter++;
          receipts.push({
            receiptNumber: pick.deptNo + '-' + String(serialCounter).padStart(4, '0'),
            type: 'credit',
            invoiceNo: cInvNo,
            time: (7 + v) + ':45 AM',
            totalAmount: creditDoc.totalAmount,
            items: creditDoc.items
          });
        }

        dayVendors.push({
          vendorName: pick.vendorName,
          vendorNo: pick.vendorNo,
          deptNo: pick.deptNo,
          time: timeLabel,
          invoiceNo: invNo,
          docType: 'invoice',
          hasShort: hasShortStamp,
          items: items,
          totalAmount: Number(totalAmount.toFixed(2)),
          creditDoc: creditDoc,
          receipts: receipts
        });
      }

      state.archiveData.push({
        dateStr: dateStr,
        isToday: false,
        placeholder: false,
        colorHex: colorHex,
        vendors: dayVendors
      });
    }
    state.proceduralArchiveSnapshot = state.archiveData.slice(1).map((rawDay) => cloneArchiveDataPayload(rawDay));
  }

  function toggleArchivePin(item) {
    const existsIdx = state.pinnedArchiveItems.findIndex(
      (p) => p.docNo === item.docNo && p.vendorNo === item.vendorNo && p.type === item.type
    );
    if (existsIdx !== -1) {
      state.pinnedArchiveItems.splice(existsIdx, 1);
      playBeep();
      notify('📌 Document #' + item.docNo + ' unpinned from desk.');
    } else {
      // Strictly 1 pinned document slot to prevent desk clutter (matches 2D rule)
      state.pinnedArchiveItems = [{
        type: item.type || 'invoice',
        vendorName: item.vendorName,
        vendorNo: item.vendorNo,
        deptNo: item.deptNo,
        docNo: item.docNo,
        dateLabel: item.dateLabel || '',
        shortDate: item.shortDate || '',
        items: (item.items || []).map((it) => Object.assign({}, it)),
        totalAmount: Number(item.totalAmount) || 0
      }];
      playSuccess();
      notify('📌 Document #' + item.docNo + ' pinned to Desk Inbox Tray (1/1 slot)!', 3500);
    }
    notifyDeskStateChanged();
    if (state.archiveOpen) renderInvoiceArchive();
    if (state.nightDropPanelOpen) renderNightDropPanel();
  }

  function openInvoiceArchive() {
    generateArchiveData(false);
    if (state.archiveSelectedDay === 0 && state.archiveData[0] && state.archiveData[0].placeholder && state.archiveData.length > 1) {
      state.archiveSelectedDay = 1;
      state.archiveSelectedVendorIdx = 0;
    }
    state.archiveOpen = true;
    const overlay = document.getElementById('invoice-archive-overlay');
    if (overlay) overlay.style.display = 'flex';
    renderInvoiceArchive();
    playPaper();
    notifyDeskStateChanged();
    notifyPhase2ModalChange();
  }

  function closeInvoiceArchive() {
    if (!state.archiveOpen) return;
    state.archiveOpen = false;
    const overlay = document.getElementById('invoice-archive-overlay');
    if (overlay) overlay.style.display = 'none';
    playBeep();
    notifyDeskStateChanged();
    notifyPhase2ModalChange();
  }

  function renderInvoiceArchive() {
    const sidebar = document.getElementById('archive-sidebar');
    const viewer = document.getElementById('archive-viewer');
    if (!sidebar || !viewer) return;

    const dayIdx = Math.max(0, Math.min(state.archiveData.length - 1, state.archiveSelectedDay));
    const currentDay = state.archiveData[dayIdx];
    const vendors = currentDay ? currentDay.vendors : [];
    const vIdx = Math.max(0, Math.min(vendors.length - 1, state.archiveSelectedVendorIdx));
    const currentVendor = vendors[vIdx] || null;

    let sidebarHtml = '<div class="arch-sidebar-hdr">32-DAY FILE CABINET ARCHIVE<br><span style="font-size:10px;color:#94a3b8;">PINNED DESK SLOT: ' + state.pinnedArchiveItems.length + '/1</span></div>';
    state.archiveData.forEach((day, dIdx) => {
      const expanded = dIdx === dayIdx;
      const docCount = (day.vendors || []).reduce((s, v) => s + 1 + (v.creditDoc ? 1 : 0), 0);
      sidebarHtml += '<div class="arch-day-group">' +
        '<button class="arch-day-btn ' + (expanded ? 'active' : '') + '" data-arch-day="' + dIdx + '" style="border-left:5px solid ' + day.colorHex + ';">' +
        '<span>' + escapeHtml(day.dateStr) + '</span>' +
        '<span class="arch-count">' + (day.placeholder ? 'OPEN' : docCount + ' INV') + '</span>' +
        '</button>';

      if (expanded) {
        if (day.placeholder) {
          sidebarHtml += '<div class="arch-placeholder-note">Complete Daily Filing after 12:00 PM to archive today\'s folders here.</div>';
        } else {
          sidebarHtml += '<div class="arch-vendor-list">';
          day.vendors.forEach((v, idx) => {
            const vActive = idx === vIdx;
            const crBadge = v.creditDoc ? ' <span style="color:#f472b6;font-weight:800;">+CR</span>' : '';
            const shortBadge = v.hasShort ? ' <b style="color:#f87171;">SHORT</b>' : '';
            sidebarHtml += '<button class="arch-vendor-btn ' + (vActive ? 'active' : '') + '" data-arch-vendor="' + idx + '">' +
              '<div>' +
              '<div style="font-weight:700;">' + escapeHtml(v.vendorName) + '</div>' +
              '<div style="font-size:9px;opacity:0.78;">V#' + escapeHtml(v.vendorNo) + ' · D#' + escapeHtml(v.deptNo) + (v.time ? ' · ' + escapeHtml(v.time) : '') + '</div>' +
              '</div>' +
              '<span style="font-size:10px;opacity:0.9;white-space:nowrap;">#' + escapeHtml(v.invoiceNo) + crBadge + shortBadge + '</span>' +
              '</button>';
          });
          sidebarHtml += '</div>';
        }
      }
      sidebarHtml += '</div>';
    });
    sidebar.innerHTML = sidebarHtml;

    sidebar.querySelectorAll('[data-arch-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.archiveSelectedDay = parseInt(btn.getAttribute('data-arch-day'), 10) || 0;
        state.archiveSelectedVendorIdx = 0;
        playBeep();
        renderInvoiceArchive();
      });
    });
    sidebar.querySelectorAll('[data-arch-vendor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.archiveSelectedVendorIdx = parseInt(btn.getAttribute('data-arch-vendor'), 10) || 0;
        playBeep();
        renderInvoiceArchive();
      });
    });

    if (!currentDay || currentDay.placeholder || !currentVendor) {
      viewer.innerHTML = '<div class="arch-empty-viewer">' +
        '<div style="font-size:28px;margin-bottom:8px;">🗄️</div>' +
        '<div style="font-weight:800;font-size:15px;color:#e2e8f0;">' + (currentDay && currentDay.placeholder ? 'TODAY\'S FOLDER AWAITING FILING (AFTER 12:00 PM)' : 'SELECT A DATE & VENDOR FOLDER') + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;margin-top:6px;">Browse 31 historical days of invoices, shortage stamps, credit memos, and receipts — or pin one reference document to your desk tray.</div>' +
        '</div>';
      return;
    }

    const isInvPinned = state.pinnedArchiveItems.some(
      (p) => p.docNo === currentVendor.invoiceNo && p.vendorNo === currentVendor.vendorNo && p.type === 'invoice'
    );

    let origUnits = 0;
    let revUnits = 0;
    let revTotal = 0;
    const invRows = (currentVendor.items || []).map((it) => {
      const qty = Number(it.qty) || 0;
      const unitPrice = Number(it.price) || 0;
      const packVal = currentVendor.deptNo === '01' ? 1 : getItemUnitsPerCase(it, 'sidedoor');
      const origExt = qty * unitPrice;
      const effectiveQty = it.archivedShort ? (Number(it.receivedQty) || 0) : qty;
      const revExt = effectiveQty * unitPrice;
      origUnits += qty;
      revUnits += effectiveQty;
      revTotal += revExt;
      const pluTag = it.notScannable
        ? ' <span style="background:#f59e0b; color:#000; font-size:8.5px; padding:0 3px; border-radius:2px; font-weight:800;">PLU</span>'
        : '';
      const shortStamp = it.archivedShort ? '<span class="inv-short-stamp">SHORT</span>' : '';
      return '<tr>' +
        '<td style="font-weight:700; color:#0f172a; font-family:monospace;">' + escapeHtml(it.code) + pluTag + '</td>' +
        '<td class="num" style="color:#475569; font-weight:700;">' + packVal + '</td>' +
        '<td><span class="inv-desc-wrap">' + shortStamp + escapeHtml(it.name) + '</span></td>' +
        '<td class="num" style="font-weight:700;">' +
        (it.archivedShort
          ? '<span class="arch-num-anchor"><span class="arch-short-billed">' + qty + '</span><span class="arch-short-hand">' + effectiveQty + '</span></span>'
          : qty) +
        '</td>' +
        '<td class="num">' + formatMoney(unitPrice) + '</td>' +
        '<td class="num" style="font-weight:800;">' +
        (it.archivedShort
          ? '<span class="arch-num-anchor"><span class="arch-short-billed">' + formatMoney(origExt) + '</span><span class="arch-short-hand">' + formatMoney(revExt) + '</span></span>'
          : formatMoney(origExt)) +
        '</td>' +
        '</tr>';
    }).join('');

    const invUnitsHtml = (currentVendor.hasShort && origUnits !== revUnits)
      ? '<span><span class="arch-num-anchor"><span class="arch-short-billed">' + origUnits + '</span><span class="arch-short-hand">' + revUnits + '</span></span></span>'
      : '<span>' + origUnits + '</span>';

    const invTotalHtml = currentVendor.hasShort
      ? '<span><span class="arch-num-anchor"><span class="arch-short-billed">' + formatMoney(currentVendor.totalAmount) + '</span><span class="arch-short-hand">' + formatMoney(revTotal) + '</span></span></span>'
      : '<span>' + formatMoney(currentVendor.totalAmount) + '</span>';

    const isCreditPinned = currentVendor.creditDoc && state.pinnedArchiveItems.some(
      (p) => p.docNo === currentVendor.creditDoc.docNo && p.type === 'credit'
    );
    let creditTotalUnits = 0;
    let creditTotalCost = 0;
    const creditRowsHtml = currentVendor.creditDoc ? (currentVendor.creditDoc.items || []).map((ci) => {
      const signedQty = -Math.abs(Number(ci.qty) || 0);
      const unitPrice = Number(ci.price) || 0;
      const lineCost = signedQty * unitPrice;
      creditTotalUnits += signedQty;
      creditTotalCost += lineCost;
      const lineCostStr = lineCost < 0 ? '-$' + Math.abs(lineCost).toFixed(2) : formatMoney(lineCost);
      const pluTag = ci.notScannable
        ? ' <span style="background:#f59e0b; color:#000; font-size:8.5px; padding:0 3px; border-radius:2px; font-weight:800;">PLU</span>'
        : '';
      return '<tr>' +
        '<td style="font-weight:700; color:#0f172a; font-family:monospace;">' + escapeHtml(ci.code) + pluTag + '</td>' +
        '<td class="num" style="color:#475569; font-weight:700;">1</td>' +
        '<td>' + escapeHtml(ci.name) + '</td>' +
        '<td class="num" style="font-weight:700; color:#991b1b;">' + signedQty + '</td>' +
        '<td class="num">' + formatMoney(unitPrice) + '</td>' +
        '<td class="num" style="font-weight:800; color:#991b1b;">' + lineCostStr + '</td>' +
        '</tr>';
    }).join('') : '';

    const finalCreditCost = currentVendor.creditDoc && currentVendor.creditDoc.totalAmount !== undefined
      ? Number(currentVendor.creditDoc.totalAmount)
      : creditTotalCost;
    const finalCreditCostStr = finalCreditCost < 0 ? '-$' + Math.abs(finalCreditCost).toFixed(2) : formatMoney(finalCreditCost);
    const shortDateStr = currentDay.shortDate || currentDay.dateStr || '';
    const vendorTimeStr = currentVendor.time ? ' · ' + escapeHtml(currentVendor.time) : '';

    const creditHtml = currentVendor.creditDoc ? (
      '<div class="arch-doc-group cat-credit">' +
      '<div class="arch-cat-bar">' +
      '<div class="arch-cat-tab">' +
      '<span>CREDIT MEMO</span>' +
      '<span class="arch-cat-tab-num">#' + escapeHtml(currentVendor.creditDoc.docNo) + '</span>' +
      '</div>' +
      '<div class="arch-cat-meta">' +
      '<span>' + escapeHtml(currentDay.dateStr) + vendorTimeStr + '</span>' +
      '<button class="arch-pin-btn ' + (isCreditPinned ? 'pinned' : '') + '" id="arch-pin-credit-btn">' +
      (isCreditPinned ? '☑ PINNED TO DESK' : '☐ PIN CREDIT TO DESK') +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="arch-doc-tray">' +
      '<div class="inv-paper-sheet credit-paper">' +
      '<div class="inv-paper-head">' +
      '<div class="inv-carrier-title">' + escapeHtml(currentVendor.vendorName) + '</div>' +
      '</div>' +
      '<div class="inv-meta-grid">' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">DEPT #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(currentVendor.deptNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">VENDOR #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(currentVendor.vendorNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">CREDIT MEMO #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(currentVendor.creditDoc.docNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">DATE</span>' +
      '<span class="inv-meta-val">' + escapeHtml(shortDateStr) + '</span>' +
      '</div>' +
      '</div>' +
      '<table class="inv-table">' +
      '<thead>' +
      '<tr>' +
      '<th>CODE</th>' +
      '<th class="num">PACK</th>' +
      '<th>ITEM NAME</th>' +
      '<th class="num">UNITS</th>' +
      '<th class="num">UNIT $</th>' +
      '<th class="num">COST</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' + creditRowsHtml + '</tbody>' +
      '</table>' +
      '<div class="inv-paper-totals">' +
      '<div class="inv-paper-total-item">' +
      '<span class="inv-paper-total-lbl">TOTAL UNITS:</span>' +
      '<span style="color:#991b1b;">' + creditTotalUnits + '</span>' +
      '</div>' +
      '<div class="inv-paper-total-item">' +
      '<span class="inv-paper-total-lbl">CREDIT TOTAL:</span>' +
      '<span style="color:#991b1b;">' + finalCreditCostStr + '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>'
    ) : '';

    const targetInvNo = padDigits(currentVendor.invoiceNo, 6);
    const targetCredNo = currentVendor.creditDoc ? padDigits(currentVendor.creditDoc.docNo, 6) : '';
    const existingRecNos = new Set((currentVendor.receipts || []).map((r) => r && r.receiptNumber));
    const todaysMatching = state.processedReceipts.filter((r) => {
      if (!r || r.voided || isPreviousDayReceipt(r) || !r.finalized) return false;
      if (existingRecNos.has(r.receiptNumber)) return false;
      const recInv = padDigits(r.invoiceNo, 6);
      const matchesInv = recInv === targetInvNo || (targetCredNo && recInv === targetCredNo);
      return matchesInv &&
        padDigits(r.vendorNo, 3) === padDigits(currentVendor.vendorNo, 3) &&
        padDigits(r.deptNo, 2) === padDigits(currentVendor.deptNo, 2);
    });

    const allArchiveAndCorrectionReceipts = (currentVendor.receipts || []).map((rec) => ({ rec: rec, isCorrectionToday: false }))
      .concat(todaysMatching.map((rec) => ({ rec: rec, isCorrectionToday: true })));

    const isCreditReceiptEntry = (entry) => {
      const rec = entry && entry.rec;
      if (!rec) return false;
      if (rec.type === 'credit') return true;
      return Boolean(targetCredNo && padDigits(rec.invoiceNo, 6) === targetCredNo);
    };

    const invoiceReceiptEntries = allArchiveAndCorrectionReceipts.filter((entry) => !isCreditReceiptEntry(entry));
    const creditReceiptEntries = allArchiveAndCorrectionReceipts.filter((entry) => isCreditReceiptEntry(entry));
    const hasHistoricalInvoiceRcpt = invoiceReceiptEntries.some((e) => !e.isCorrectionToday);
    const hasHistoricalCreditRcpt = creditReceiptEntries.some((e) => !e.isCorrectionToday);

    const renderArchiveReceiptGroup = (entry, hasHistoricalInCat) => {
      const rec = entry.rec;
      const isCorrectionToday = entry.isCorrectionToday;
      const isCred = isCreditReceiptEntry(entry);
      const refDocNo = rec.invoiceNo || (isCred && currentVendor.creditDoc ? currentVendor.creditDoc.docNo : currentVendor.invoiceNo);
      const rcptTime = rec.time || currentVendor.time || '';
      let rcptUnits = 0;
      let rcptSum = 0;
      const rRows = (rec.items || []).map((ri) => {
        const qtyNum = Number(ri.qty) || 0;
        const signedQty = isCred ? -Math.abs(qtyNum) : qtyNum;
        const unitPrice = Number(ri.price) || 0;
        const packVal = (isCred || signedQty < 0) ? 1 : (currentVendor.deptNo === '01' ? 1 : getItemUnitsPerCase(ri, 'sidedoor'));
        const ext = signedQty * unitPrice;
        rcptUnits += signedQty;
        rcptSum += ext;
        const extStr = ext < 0 ? '-$' + Math.abs(ext).toFixed(2) : formatMoney(ext);
        return '<tr>' +
          '<td style="font-weight:700;">' + escapeHtml(ri.code) + '</td>' +
          '<td class="num" style="color:#475569; font-weight:700;">' + packVal + '</td>' +
          '<td>' + escapeHtml(ri.name) + '</td>' +
          '<td class="num" style="font-weight:700; color:' + (isCred ? '#6b21a8' : '#111827') + ';">' + signedQty + '</td>' +
          '<td class="num">' + formatMoney(unitPrice) + '</td>' +
          '<td class="num" style="font-weight:700; color:' + (isCred ? '#6b21a8' : '#111827') + ';">' + extStr + '</td>' +
          '</tr>';
      }).join('');
      const rcptTotal = rec.totalAmount !== undefined ? Number(rec.totalAmount) : rcptSum;
      const rcptTotalStr = rcptTotal < 0 ? '-$' + Math.abs(rcptTotal).toFixed(2) : formatMoney(rcptTotal);
      const corrBadge = isCorrectionToday
        ? (' <span style="background:' + (!hasHistoricalInCat ? '#0369a1' : '#15803d') + '; color:#fff; padding:1px 6px; border-radius:2px; font-size:9px; font-weight:800; margin-left:6px;">' + (!hasHistoricalInCat ? 'ADDED RECEIPT (TODAY)' : 'CORRECTION (TODAY)') + '</span>')
        : '';
      return '<div class="arch-doc-group ' + (isCred ? 'cat-credit-rcpt' : 'cat-receipt') + '">' +
        '<div class="arch-cat-bar">' +
        '<div class="arch-cat-tab">' +
        '<span>' + (isCred ? 'CREDIT MEMO RECEIPT' : 'INVOICE RECEIPT') + '</span>' +
        '<span class="arch-cat-tab-num">#' + escapeHtml(rec.receiptNumber) + '</span>' +
        corrBadge +
        '</div>' +
        '<div class="arch-cat-meta">' +
        '<span>' + (isCred ? 'CRED #' : 'INV #') + escapeHtml(refDocNo) + (rcptTime ? ' · ' + escapeHtml(rcptTime) : '') + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="arch-doc-tray">' +
        '<div class="arch-dotmatrix-sheet ' + (isCred ? 'credit' : '') + '">' +
        '<div class="arch-dm-banner">' +
        '<div class="arch-dm-sysrow">' +
        '<span>STORE #0412 :: AS/400 DSD SYSTEM</span>' +
        '<span>DATE: ' + escapeHtml(isCorrectionToday ? 'TODAY' : shortDateStr) + (rcptTime ? ' ' + escapeHtml(rcptTime) : '') + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="arch-dm-metagrid">' +
        '<span>RCPT #: <b>' + escapeHtml(rec.receiptNumber) + '</b></span>' +
        '<span>DOC TYPE: <b>' + (isCred ? 'CREDIT' : 'INVOICE') + '</b></span>' +
        '<span>REF #: <b>' + escapeHtml(refDocNo) + '</b></span>' +
        '<span>DEPT #: <b>' + escapeHtml(currentVendor.deptNo) + '</b></span>' +
        '<span>VEND #: <b>' + escapeHtml(currentVendor.vendorNo) + '</b></span>' +
        '<span>VENDOR: <b>' + escapeHtml(currentVendor.vendorName) + '</b></span>' +
        '</div>' +
        '<table class="arch-dm-table">' +
        '<thead><tr><th>CODE</th><th class="num">PACK</th><th>ITEM DESCRIPTION</th><th class="num">QTY</th><th class="num">UNIT $</th><th class="num">EXT $</th></tr></thead>' +
        '<tbody>' + rRows + '</tbody>' +
        '</table>' +
        '<div class="arch-dm-totals">' +
        '<span>LINES: ' + (rec.items || []).length + '</span>' +
        '<span>TOTAL UNITS: ' + rcptUnits + '</span>' +
        '<span style="color:' + (isCred ? '#6b21a8' : '#0f172a') + ';">' + (isCred ? 'TOTAL CREDIT: ' : 'TOTAL AMOUNT: ') + rcptTotalStr + '</span>' +
        '</div>' +
        '<div class="arch-dm-footer">' +
        '<span>STATUS: ' + (isCorrectionToday ? 'FINAL :: PENDING/POSTED TODAY' : 'CLEAR :: BILLING POSTED') + '</span>' +
        '<span>*** END OF PRINT ***</span>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    };

    const missingReceiptNoticeHtml = invoiceReceiptEntries.length === 0
      ? '<div class="arch-doc-group" style="margin-top:12px;"><div class="arch-doc-tray" style="background:#450a0a; border:2px dashed #ef4444; color:#fecaca; padding:12px; text-align:center; font-weight:800;">⚠️ NO INVOICE RECEIPT FOUND ON FILE FOR INVOICE #' + escapeHtml(currentVendor.invoiceNo) + '</div></div>'
      : '';

    const invoiceReceiptsHtml = missingReceiptNoticeHtml +
      invoiceReceiptEntries.map((entry) => renderArchiveReceiptGroup(entry, hasHistoricalInvoiceRcpt)).join('');
    const creditReceiptsHtml = creditReceiptEntries.map((entry) => renderArchiveReceiptGroup(entry, hasHistoricalCreditRcpt)).join('');

    viewer.innerHTML =
      '<div class="arch-doc-group cat-invoice">' +
      '<div class="arch-cat-bar">' +
      '<div class="arch-cat-tab">' +
      '<span>INVOICE</span>' +
      '<span class="arch-cat-tab-num">#' + escapeHtml(currentVendor.invoiceNo) + '</span>' +
      '</div>' +
      '<div class="arch-cat-meta">' +
      '<span>' + escapeHtml(currentDay.dateStr) + vendorTimeStr + '</span>' +
      '<button class="arch-pin-btn ' + (isInvPinned ? 'pinned' : '') + '" id="arch-pin-inv-btn">' + (isInvPinned ? '☑ PINNED TO DESK' : '☐ PIN TO DESK (0/1)') + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="arch-doc-tray">' +
      '<div class="inv-paper-sheet">' +
      (currentVendor.hasShort ? '<div class="arch-short-stamp">SHORT</div>' : '') +
      '<div class="inv-paper-head">' +
      '<div class="inv-carrier-title">' + escapeHtml(currentVendor.vendorName) + '</div>' +
      '</div>' +
      '<div class="inv-meta-grid">' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">DEPT #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(currentVendor.deptNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">VENDOR #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(currentVendor.vendorNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">INVOICE #</span>' +
      '<span class="inv-meta-val">' + escapeHtml(currentVendor.invoiceNo) + '</span>' +
      '</div>' +
      '<div class="inv-meta-cell">' +
      '<span class="inv-meta-lbl">DATE</span>' +
      '<span class="inv-meta-val">' + escapeHtml(shortDateStr) + '</span>' +
      '</div>' +
      '</div>' +
      '<table class="inv-table">' +
      '<thead>' +
      '<tr>' +
      '<th>CODE</th>' +
      '<th class="num">PACK</th>' +
      '<th>ITEM NAME</th>' +
      '<th class="num">UNITS</th>' +
      '<th class="num">UNIT $</th>' +
      '<th class="num">COST</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' + invRows + '</tbody>' +
      '</table>' +
      '<div class="inv-paper-totals">' +
      '<div class="inv-paper-total-item">' +
      '<span class="inv-paper-total-lbl">TOTAL UNITS:</span>' +
      invUnitsHtml +
      '</div>' +
      '<div class="inv-paper-total-item">' +
      '<span class="inv-paper-total-lbl">TOTAL COST:</span>' +
      invTotalHtml +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      invoiceReceiptsHtml +
      creditHtml +
      creditReceiptsHtml;

    const pinInvBtn = document.getElementById('arch-pin-inv-btn');
    if (pinInvBtn) {
      pinInvBtn.addEventListener('click', () => {
        toggleArchivePin({
          type: 'invoice',
          vendorName: currentVendor.vendorName,
          vendorNo: currentVendor.vendorNo,
          deptNo: currentVendor.deptNo,
          docNo: currentVendor.invoiceNo,
          dateLabel: currentDay.dateStr,
          shortDate: shortDateStr,
          items: currentVendor.items,
          totalAmount: currentVendor.totalAmount
        });
      });
    }
    const pinCredBtn = document.getElementById('arch-pin-credit-btn');
    if (pinCredBtn && currentVendor.creditDoc) {
      pinCredBtn.addEventListener('click', () => {
        toggleArchivePin({
          type: 'credit',
          vendorName: currentVendor.vendorName,
          vendorNo: currentVendor.vendorNo,
          deptNo: currentVendor.deptNo,
          docNo: currentVendor.creditDoc.docNo,
          dateLabel: currentDay.dateStr,
          shortDate: shortDateStr,
          items: currentVendor.creditDoc.items,
          totalAmount: currentVendor.creditDoc.totalAmount
        });
      });
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  global.DSDReceipts = {
    loadArchiveHistory,
    init(hooks) {
      Object.assign(state.hooks, hooks || {});
      enrichAllDeliveries();
      generateNightDropInvoices();
      if (!state.staticArchiveHistory) {
        loadArchiveHistory().then(() => {
          generateArchiveData(true);
          generateHomeOfficeTasksForShift();
        });
      }
      generateArchiveData(false);
      generateHomeOfficeTasksForShift();
      notifyDeskStateChanged();

      const backBtn = document.getElementById('terminal-back-btn');
      if (backBtn && !backBtn._dsdBound) {
        backBtn._dsdBound = true;
        backBtn.addEventListener('click', () => {
          playBeep();
          openTerminalScreen(state.currentScreen === 'receipt-detail' ? 'receipts' : 'menu');
        });
      }
      const ndClose = document.getElementById('night-drop-close');
      if (ndClose && !ndClose._dsdBound) {
        ndClose._dsdBound = true;
        ndClose.addEventListener('click', () => {
          closeNightDropPanel();
        });
      }
      const filingFileBtn = document.getElementById('filing-file-btn');
      if (filingFileBtn && !filingFileBtn._dsdBound) {
        filingFileBtn._dsdBound = true;
        filingFileBtn.addEventListener('click', fileAllLinkedPairs);
      }
      const filingCloseBtn = document.getElementById('filing-close-btn');
      if (filingCloseBtn && !filingCloseBtn._dsdBound) {
        filingCloseBtn._dsdBound = true;
        filingCloseBtn.addEventListener('click', () => {
          closeFilingOverlay();
        });
      }
      const archiveCloseBtn = document.getElementById('archive-close-btn');
      if (archiveCloseBtn && !archiveCloseBtn._dsdBound) {
        archiveCloseBtn._dsdBound = true;
        archiveCloseBtn.addEventListener('click', () => {
          closeInvoiceArchive();
        });
      }

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

      const termKeypadSection = document.getElementById('terminal-keypad-section');
      if (termKeypadSection && !termKeypadSection._dsdBound) {
        termKeypadSection._dsdBound = true;
        let lastTermTouchTime = 0;
        const onTermKeypadInput = (e, isTouch) => {
          const modeBtn = e.target.closest('#terminal-mode-toggle-btn');
          if (modeBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (!isTouch && (Date.now() - lastTermTouchTime < 420)) return;
            if (isTouch) lastTermTouchTime = Date.now();
            if (!handleTerminalKey('SWITCH_MODE')) playBeep();
            return;
          }
          const btn = e.target.closest('[data-tkey]');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          if (!isTouch && (Date.now() - lastTermTouchTime < 420)) return;
          if (isTouch) lastTermTouchTime = Date.now();
          if (!handleTerminalKey(btn.getAttribute('data-tkey'))) playBeep();
        };
        termKeypadSection.addEventListener('touchstart', (e) => onTermKeypadInput(e, true), { passive: false });
        termKeypadSection.addEventListener('mousedown', (e) => onTermKeypadInput(e, false));
      }
    },

    enrichDelivery,
    enrichAllDeliveries,
    resetDailyReceipts,
    resetScannerSession,
    getReceipts,
    getReceiptStatus,
    getInitialReceipts,
    resumeReceiptInTerminal,
    findReceipt,
    createReceipt,
    updateReceiptHeader,
    voidReceipt,

    handleScannerKey,
    runTempProbeForDelivery,
    stampInvoiceShortageQty,
    clearInvoiceShortageFlag,
    toggleBoxOverageFlag,
    auditCompletedDelivery,
    applyShortageToDelivery,
    applyOverageToDelivery,
    applyDiscrepancyToDelivery,
    refuseDelivery: refuseActiveDelivery,
    handleTerminalKey,
    scanSpecificBox,
    scanBackstockCase,
    isScannerInventoryMode,
    getBackstockInventorySummary,
    isScannerSupplyMode,
    isSupplyOrderSubmittedToday,
    scanSupplyBox,
    getSupplyCatalogProducts,
    consumePendingSupplyOrdersForNextShift,
    getPendingSupplyOrdersCount,
    isScannerDamageMode,
    scanClaimsItem,
    openScannerForContext,
    renderScannerUI,
    clearScannerMessage,
    openTerminalScreen,
    renderTerminalUI,
    updateTerminalClock,
    getTerminalSummarySnapshot,

    // Phase 2 Public API
    openNightDropPanel,
    closeNightDropPanel,
    renderNightDropPanel,
    openFilingOverlay,
    closeFilingOverlay,
    openInvoiceArchive,
    closeInvoiceArchive,
    getOutstandingNightDropCount() {
      return state.nightDropInvoices.length;
    },
    getPendingHomeOfficeTaskCount,
    getHomeOfficeTasks() {
      return state.homeOfficeTasks.slice();
    },
    getNightDropCount() {
      return state.nightDropInvoices.length;
    },
    getPinnedCount() {
      return state.pinnedArchiveItems.length;
    },
    isFilingComplete() {
      return state.filingComplete;
    },
    getUnfiledReceiptsCount,
    isPhase2ModalOpen() {
      return Boolean(state.nightDropPanelOpen || state.filingOpen || state.archiveOpen || state.trashModalOpen || state.handModalOpen);
    },

    getScannerState() {
      return state.scanner;
    },
    isDiscrepancyShortageStamped(item) {
      return Boolean(item && item.shortageStamped);
    },

    // Printed Receipt Slips & Handoff API
    printReceiptSlip,
    printSingleStoreCopy,
    printAllDailyStoreCopies,
    collectPrinterTraySlips,
    renderPrintedReceiptHud,
    togglePrintedReceiptHud,
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
    handPrintedReceiptsToDelivery
  };
})(window);
