(function (global) {
  'use strict';

  /**
   * DSDReceipts (Scanner Module) - 2-Phase Hand Scanner State Machine & LCD Renderer
   * Requires js/dsd-receipts.js to load first.
   */

  const api = global.DSDReceipts;
  const bridge = api && api._internal;
  if (!bridge) {
    throw new Error('DSDReceipts core (js/dsd-receipts.js) must be loaded before js/dsd-scanner.js.');
  }

  const state = bridge.state;
  const {
    getCatalog,
    getStats,
    playBeep,
    playLabel,
    playError,
    playSuccess,
    notify,
    escapeHtml,
    padDigits,
    getCreditInvoiceNo,
    getItemUnitsPerCase,
    enrichDelivery,
    getActiveDeliveryEnriched,
    isDeliveryCheckInReady,
    collectInsideDeliveryCandidates,
    getDeliveryById,
    findMatchingInsideDeliveryByHeaders,
    createInitialDamageState,
    createInitialSupplyState,
    createInitialLabelState,
    createInitialInventoryState,
    createReceipt,
    validateAndCreateBlankReceipt,
    getReceiptStatus,
    getInitialReceipts,
    resumeReceiptInScanner,
    syncReceiptItems,
    getCommittedInvoiceQtyForCode,
    getCommittedCreditQtyForCode,
    reconcileDeliveryDocStates,
    reconcileDeliveryBoxesFromReceipts,
    syncScannedBoxesForCode,
    syncCreditBoxesForCode,
    getPendingCounterpartTab,
    syncActiveDeliveryLinkForReceipt,
    findReceipt,
    printReceiptSlip
  } = bridge.core;

  function renderTerminalUI() {
    return typeof bridge.fn.renderTerminalUI === 'function' ? bridge.fn.renderTerminalUI.apply(null, arguments) : undefined;
  }
  function resolveNightDropByInvoiceNo() {
    return typeof bridge.fn.resolveNightDropByInvoiceNo === 'function' ? bridge.fn.resolveNightDropByInvoiceNo.apply(null, arguments) : undefined;
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
    sc.inventoryMenuIdx = 0;
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


  function getActiveScannerContext() {
    const sc = state.scanner;
    const isNear = typeof state.hooks.isScannerNearDelivery === 'function'
      ? Boolean(state.hooks.isScannerNearDelivery())
      : true;
    const rawD = getActiveDeliveryEnriched();

    // If Night Drop panel is open, keep scanner in general receipt entry mode
    if (state.nightDropPanelOpen) {
      return { delivery: null, isPalletTarget: false };
    }

    const inReceiptWorkScreen = Boolean(
      sc.activeReceiptNo ||
      ['scanning', 'list', 'totals', 'totals-edit', 'confirm-finalize', 'finalized'].includes(sc.screen)
    );
    if (inReceiptWorkScreen) {
      const headerMatch = findMatchingInsideDeliveryByHeaders(sc.headers);
      if (headerMatch) {
        sc.standaloneMode = false;
        return { delivery: headerMatch, isPalletTarget: false };
      }
      if (!sc.standaloneMode && sc.activeReceiptNo) {
        const rec = findReceipt(sc.activeReceiptNo);
        const recD = rec && rec.deliveryId ? getDeliveryById(rec.deliveryId) : null;
        if (recD && isDeliveryCheckInReady(recD)) {
          return { delivery: recD, isPalletTarget: false };
        }
      }
    }

    let delivery = null;
    if (!sc.standaloneMode && rawD && isDeliveryCheckInReady(rawD) && isNear) {
      delivery = rawD;
    }
    return { delivery: delivery, isPalletTarget: false };
  }

  const SCANNER_VALID_SCREENS = ['home', 'create', 'resume', 'scanning', 'list', 'totals', 'totals-edit', 'confirm-finalize', 'supply', 'supply-cart', 'supply-totals', 'supply-confirm', 'supply-done', 'inventory-menu', 'label-cases', 'inventory', 'inventory-list', 'inventory-confirm', 'inventory-done', 'damage', 'damage-cond', 'damage-disp', 'damage-ready'];
  const SCANNER_HOME_SCREENS = ['create', 'supply', 'inventory-menu', 'damage'];


  function isScannerDamageMode() {
    return ['damage', 'damage-cond', 'damage-disp', 'damage-ready'].includes(state.scanner.screen);
  }


  const SUPPLY_MAX_CASES_PER_SKU = 10;
  const SUPPLY_MAX_ORDER_COST = 300;

  function computeSupplyCartSummary(cart) {
    const list = Array.isArray(cart) ? cart : [];
    let totalCases = 0;
    let totalUnits = 0;
    let totalCost = 0;
    list.forEach((ci) => {
      const cs = Math.max(0, Number(ci && ci.cases) || 0);
      const upc = Math.max(1, Number(ci && ci.unitsPerCase) || 8);
      const price = Number(ci && ci.price) || 0;
      totalCases += cs;
      totalUnits += cs * upc;
      totalCost += cs * upc * price;
    });
    const roundedCost = Number(totalCost.toFixed(2));
    return {
      skus: list.length,
      totalCases: totalCases,
      totalUnits: totalUnits,
      totalCost: roundedCost,
      overBudget: roundedCost > SUPPLY_MAX_ORDER_COST
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
    return ['supply', 'supply-cart', 'supply-totals', 'supply-confirm', 'supply-done'].includes(state.scanner.screen);
  }


  function isScannerLabelMode() {
    return state.scanner.screen === 'label-cases';
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
    const validTargets = ['home', 'create', 'resume', 'supply', 'inventory', 'inventory-menu', 'inventory-audit', 'label-cases', 'damage'];
    let resolved = validTargets.includes(targetScreen) ? targetScreen : 'home';
    if (resolved === 'inventory') {
      resolved = 'inventory-menu';
    } else if (resolved === 'inventory-audit') {
      resolved = (sc.inventory && sc.inventory.finalized) ? 'inventory-done' : 'inventory';
    }

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

    const resolvedScreen = (resolved === 'supply' && sc.supply && sc.supply.submittedToday)
      ? 'supply-done'
      : resolved;
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
      notify('[[ico:thermometer]] Temp probe is only required for chilled/frozen deliveries.', 3000);
      return { ok: false, error: 'TEMP PROBE NOT REQUIRED' };
    }
    d.tempChecked = true;
    const actualTempStr = d.outOfTemp
      ? (d.tempZone === 'F' ? '+18.4°F (FAIL!)' : (d.tempZone === 'C' ? '+49.2°F (FAIL!)' : '68.0°F (FAIL!)'))
      : (d.expectedTemp || 'OK') + ' (PASS)';
    d.observedTemp = actualTempStr;
    if (d.outOfTemp) {
      playError();
      notify('[[ico:thermometer]] TEMP FAIL: ' + actualTempStr + ' — Click [REFUSE] on the Invoice window!', 5000);
    } else {
      playSuccess();
      notify('[[ico:thermometer]] TEMP PROBE OK: ' + actualTempStr, 3500);
    }
    if (typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
    return { ok: true, passed: !d.outOfTemp, observedTemp: actualTempStr };
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
      : state.processedReceipts.find((r) => !r.voided && r.finalized && (r.type === 'invoice' || r.type === 'po') && r.deliveryId === d.id);
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
      notify('[[ico:clipboard]] No physical shortage detected on this invoice.', 3200);
      return { ok: true, changed: false, message: 'No shortage detected.' };
    }
    const loggedMsg = syncDiscrepancyFlagsAndTotals(d, 'short');
    playSuccess();
    notify('[[ico:clipboard]] ' + (loggedMsg || 'Shortage stamped on paper invoice'), 4000);
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
      notify('[[ico:clipboard]] No overage cases detected on this pallet/cart.', 3200);
      return { ok: true, changed: false, message: 'No overage detected.' };
    }
    const loggedMsg = syncDiscrepancyFlagsAndTotals(d, 'over');
    playSuccess();
    notify('[[ico:box]] ' + (loggedMsg || 'Overage cases flagged on cart/pallet'), 4000);
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
      notify('[[ico:clipboard]] No physical shortage or overage detected on this invoice.', 3200);
      return { ok: true, changed: false, message: 'No physical shortage or overage.' };
    }
    const msg = handleDiscrepancyKey(d);
    return { ok: true, changed: true, message: msg };
  }

  function handleScannerKey(rawAction, val) {
    const action = rawAction === 'neg' ? 'minus' : (rawAction === 'done' ? 'plus' : rawAction);
    const ctx = getActiveScannerContext();
    let d = ctx.delivery;

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

    // F6: Label Print (Label Cases mode) or Print Finalized Receipt (optional shortcut)
    if (action === 'print') {
      if (isScannerLabelMode()) {
        return handleLabelScannerKey(action, val);
      }
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

    // Backroom Inventory Subsection Menu & Label Cases Mode (Option 3 -> 1 / 2)
    if (sc.screen === 'inventory-menu') {
      return handleInventoryMenuKey(action, val);
    }
    if (isScannerLabelMode()) {
      return handleLabelScannerKey(action, val);
    }

    // Daily Backroom Inventory Mode (Option 3 -> 2)
    if (isScannerInventoryMode()) {
      return handleInventoryScannerKey(action, val);
    }

    // Markdown Claims Mode (Option 4)
    if (isScannerDamageMode()) {
      return handleDamageScannerKey(action, val);
    }

    // Pressing Scan [R] / Scan button while aiming directly at a 3D delivery box works from Home/Create/List/Totals too
    if (action === 'scan' && ['home', 'create', 'list', 'totals'].includes(sc.screen)) {
      const hoveredBox = typeof state.hooks.getHoveredBox === 'function' ? state.hooks.getHoveredBox() : null;
      if (hoveredBox) {
        if (hoveredBox.deliveryId && typeof state.hooks.focusDeliveryById === 'function') {
          state.hooks.focusDeliveryById(hoveredBox.deliveryId);
        }
        const res = scanSpecificBox(hoveredBox);
        if (res && res.ok && (res.loaded || res.scanned) && typeof state.hooks.onBarcodeScanned === 'function') {
          state.hooks.onBarcodeScanned();
        }
        const curD = (hoveredBox.deliveryId ? getDeliveryById(hoveredBox.deliveryId) : null) ||
          getActiveDeliveryEnriched() ||
          d;
        if (curD && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(curD);
        return true;
      }
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
        } else if (resolvedTarget === 'inventory-menu') {
          sc.inventoryMenuIdx = 0;
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
        const targetD = (!state.nightDropPanelOpen ? (d || findMatchingInsideDeliveryByHeaders(sc.headers)) : null);

        const blankRes = validateAndCreateBlankReceipt({
          vendorNo: sc.headers.vendorNo,
          deptNo: sc.headers.deptNo,
          invoiceNo: sc.headers.invoiceNo,
          expectedUnits: expUnitsVal,
          expectedCost: expCostVal,
          source: 'scanner',
          deliveryId: targetD ? targetD.id : null
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
        sc.standaloneMode = !targetD;
        d = targetD;
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
        const hoveredBox = typeof state.hooks.getHoveredBox === 'function' ? state.hooks.getHoveredBox() : null;
        if (hoveredBox) {
          if (hoveredBox.deliveryId && typeof state.hooks.focusDeliveryById === 'function') {
            state.hooks.focusDeliveryById(hoveredBox.deliveryId);
          }
          const res = scanSpecificBox(hoveredBox);
          if (res && res.ok && (res.loaded || res.scanned) && typeof state.hooks.onBarcodeScanned === 'function') {
            state.hooks.onBarcodeScanned();
          }
          d = (hoveredBox.deliveryId ? getDeliveryById(hoveredBox.deliveryId) : null) ||
            getActiveDeliveryEnriched() ||
            d;
          if (d && typeof state.hooks.onReceiptUpdated === 'function') state.hooks.onReceiptUpdated(d);
          return true;
        }
        const scanDeliv = d || getActiveDeliveryEnriched();
        if (!scanDeliv) {
          playBeep();
          setScannerMessage('', 'info');
        } else {
          performPhysicalBoxScan(scanDeliv);
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
      notify('[[ico:flag]] Case is flagged as OVERAGE (excess — unflag to scan).', 2800);
      return;
    }
    const nextBox = explicitBox || (hovered && !hovered.overageFlagged
      ? hovered
      : autoPool.find((b) => !b.scanned && !b.overageFlagged && !b.notScannable));

    // Do not reveal or track whether all shipment cases have been scanned
    if (!nextBox) {
      if (!explicitBox && autoPool.some((b) => !b.scanned && !b.overageFlagged && b.notScannable)) {
        playError();
        setScannerMessage('PLU ONLY: KEY CODE', 'err');
      } else {
        playBeep();
        setScannerMessage('', 'info');
      }
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
    if (!explicitBox && typeof state.hooks.onBarcodeScanned === 'function') {
      state.hooks.onBarcodeScanned();
    } else if (!explicitBox) {
      playBeep();
    }
    setScannerMessage('', 'info');
    if (typeof state.hooks.onReceiptUpdated === 'function') {
      state.hooks.onReceiptUpdated(d);
    }
  }

  function scanSpecificBox(box) {
    if (box && box.deliveryId && typeof state.hooks.focusDeliveryById === 'function') {
      state.hooks.focusDeliveryById(box.deliveryId);
    }
    const d = (box && box.deliveryId ? getDeliveryById(box.deliveryId) : null) || getActiveDeliveryEnriched();
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

  function scanBackstockCaseForLabel(caseRec) {
    const sc = state.scanner;
    if (!sc.label) sc.label = createInitialLabelState();
    const lbl = sc.label;

    if (sc.screen !== 'label-cases') {
      sc.screen = 'label-cases';
      sc.phase = 'label-cases';
    }

    if (!caseRec) {
      playError();
      setScannerMessage('NO CASE SELECTED', 'err');
      renderScannerUI();
      return { ok: false, reason: 'not_found' };
    }

    const isSupply = Boolean(
      String(caseRec.deptNo || '') === '60' ||
      String(caseRec.vendorNo || '') === '601' ||
      caseRec.targetRackId === 'claims_steel'
    );
    if (isSupply) {
      lbl.pendingCaseId = null;
      lbl.pluTargetCaseId = null;
      lbl.productCode = String(caseRec.code || '');
      lbl.lastScannedLabel = String(caseRec.name || 'Supply Item');
      lbl.qtyPerCase = Number(caseRec.unitsPerCase) || 1;
      lbl.isPluCase = false;
      playError();
      setScannerMessage('DEPT 60 NO LABEL REQ', 'warn');
      renderScannerUI();
      return { ok: false, reason: 'supply_exempt' };
    }

    if (caseRec.labeled) {
      lbl.pendingCaseId = null;
      lbl.pluTargetCaseId = null;
      lbl.productCode = String(caseRec.code || '');
      lbl.lastScannedLabel = String(caseRec.name || 'Backstock Case');
      lbl.qtyPerCase = Number(caseRec.unitsPerCase) || 1;
      lbl.isPluCase = false;
      playBeep();
      setScannerMessage('ALREADY YELLOW UPC', 'warn');
      renderScannerUI();
      return { ok: false, reason: 'already_labeled' };
    }

    // Light-green PLU cases must be entered manually: read PLU -> type PLU -> ENT -> F6
    if (caseRec.notScannable) {
      lbl.pendingCaseId = null;
      lbl.pluTargetCaseId = caseRec.id;
      lbl.productCode = '';
      lbl.lastScannedLabel = '';
      lbl.qtyPerCase = 0;
      lbl.isPluCase = false;
      playError();
      setScannerMessage('PLU: TYPE CODE + ENT', 'warn');
      renderScannerUI();
      return { ok: true, loaded: false, isPlu: true };
    }

    lbl.pendingCaseId = caseRec.id;
    lbl.pluTargetCaseId = null;
    lbl.productCode = String(caseRec.code || '');
    lbl.lastScannedLabel = String(caseRec.name || 'Backstock Case');
    lbl.qtyPerCase = Number(caseRec.unitsPerCase) || 1;
    lbl.isPluCase = false;
    setScannerMessage('PRESS F6 TO PRINT', 'ok');
    renderScannerUI();
    return {
      ok: true,
      loaded: true,
      isPlu: false
    };
  }

  function handleInventoryMenuKey(action, val) {
    const sc = state.scanner;
    const openSubOption = (idx) => {
      sc.inventoryMenuIdx = idx;
      if (idx === 0) {
        if (!sc.label) sc.label = createInitialLabelState();
        sc.screen = 'label-cases';
        sc.phase = 'label-cases';
      } else {
        const nextScreen = (sc.inventory && sc.inventory.finalized) ? 'inventory-done' : 'inventory';
        sc.screen = nextScreen;
        sc.phase = nextScreen;
      }
      setScannerMessage('', 'info');
      playBeep();
    };

    if (action === 'back') {
      sc.screen = 'home';
      sc.phase = 'home';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'up' || action === 'down') {
      sc.inventoryMenuIdx = ((sc.inventoryMenuIdx || 0) + 1) % 2;
      playBeep();
    } else if (action === 'num') {
      const idx = parseInt(String(val), 10) - 1;
      if (idx === 0 || idx === 1) {
        openSubOption(idx);
      } else {
        playBeep();
      }
    } else if (action === 'enter') {
      openSubOption(sc.inventoryMenuIdx === 1 ? 1 : 0);
    } else {
      playBeep();
    }

    renderScannerUI();
    return true;
  }

  function handleLabelScannerKey(action, val) {
    const sc = state.scanner;
    if (!sc.label) sc.label = createInitialLabelState();
    const lbl = sc.label;
    const racks = global.BackstockRacks;

    if (action === 'back') {
      sc.screen = 'inventory-menu';
      sc.phase = 'inventory-menu';
      setScannerMessage('', 'info');
      playBeep();
      renderScannerUI();
      return true;
    }

    if (action === 'num') {
      const digit = String(val);
      if (lbl.productCode.length < 14) {
        lbl.productCode += digit;
        lbl.pendingCaseId = null;
        lbl.lastScannedLabel = '';
        lbl.qtyPerCase = 0;
        lbl.isPluCase = false;
      }
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'clear') {
      if (lbl.productCode.length > 0) {
        lbl.productCode = lbl.productCode.slice(0, -1);
      }
      lbl.pendingCaseId = null;
      lbl.lastScannedLabel = '';
      lbl.qtyPerCase = 0;
      lbl.isPluCase = false;
      if (!lbl.productCode) lbl.pluTargetCaseId = null;
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'scan') {
      const hovered = typeof state.hooks.getHoveredLabelCase === 'function'
        ? state.hooks.getHoveredLabelCase()
        : null;
      if (hovered) {
        const res = scanBackstockCaseForLabel(hovered);
        if (res && res.ok && res.loaded && typeof state.hooks.onBarcodeScanned === 'function') {
          state.hooks.onBarcodeScanned();
        }
        return true;
      }
      playBeep();
      setScannerMessage('CLICK CASE/TYPE PLU', 'info');
    } else if (action === 'enter') {
      if (!lbl.productCode) {
        playError();
        setScannerMessage('KEY PLU / CLICK CASE', 'err');
      } else {
        const hovered = typeof state.hooks.getHoveredLabelCase === 'function'
          ? state.hooks.getHoveredLabelCase()
          : null;
        const preferredId = lbl.pendingCaseId || lbl.pluTargetCaseId || (hovered ? hovered.id : null);
        const foundCase = racks && typeof racks.findBackstockCaseForLabelInput === 'function'
          ? racks.findBackstockCaseForLabelInput(lbl.productCode, preferredId)
          : null;
        if (!foundCase) {
          playError();
          setScannerMessage('NO UNLABELED MATCH', 'err');
        } else {
          lbl.pendingCaseId = foundCase.id;
          lbl.pluTargetCaseId = null;
          lbl.productCode = String(foundCase.code || '');
          lbl.lastScannedLabel = String(foundCase.name || 'Backstock Case');
          lbl.qtyPerCase = Number(foundCase.unitsPerCase) || 1;
          lbl.isPluCase = Boolean(foundCase.notScannable);
          playBeep();
          setScannerMessage('READY: F6 PRINT LBL', 'ok');
        }
      }
    } else if (action === 'print') {
      if (!lbl.pendingCaseId) {
        playError();
        setScannerMessage(lbl.productCode ? 'PRESS ENT THEN F6' : 'CLICK/KEY CASE FIRST', 'err');
      } else {
        const res = racks && typeof racks.labelCase === 'function'
          ? racks.labelCase(lbl.pendingCaseId)
          : null;
        if (!res || !res.ok) {
          playError();
          setScannerMessage((res && res.error) || 'LABEL PRINT FAILED', 'err');
        } else {
          lbl.printedCount = (lbl.printedCount || 0) + 1;
          lbl.pendingCaseId = null;
          lbl.pluTargetCaseId = null;
          lbl.productCode = '';
          lbl.lastScannedLabel = '';
          lbl.qtyPerCase = 0;
          lbl.isPluCase = false;
          playLabel();
          setScannerMessage(res.wasPlu ? 'PRINTED YELLOW UPC!' : 'YELLOW LABEL PRINTED', 'ok');
          notify('[[ico:tag]] Printed yellow UPC label for ' + res.caseRec.name + (res.wasPlu ? ' (PLU -> UPC).' : '.'), 2400);
        }
      }
    } else {
      playBeep();
    }

    renderScannerUI();
    return true;
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

    if (sc.screen !== 'supply') {
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
      const confirmSummary = computeSupplyCartSummary(cart);
      if (action === 'enter') {
        if (cart.length === 0) {
          playError();
          setScannerMessage('CART IS EMPTY', 'err');
        } else if (confirmSummary.overBudget) {
          playError();
          setScannerMessage('OVER $300: REDUCE CART', 'err');
        } else {
          if (!Array.isArray(sup.pendingOrders)) sup.pendingOrders = [];
          let submittedCases = 0;
          let submittedSkus = 0;
          cart.forEach((ci) => {
            const addCases = Math.min(SUPPLY_MAX_CASES_PER_SKU, Math.max(0, Math.round(Number(ci.cases) || 0)));
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
          notify('[[ico:truck]] Dept 60 order (' + submittedCases + ' case' + (submittedCases === 1 ? '' : 's') + ') finalized for Vendor #601 delivery on ' + etaInfo.mmddyyyy + '.', 4000);
        }
      } else if (action === 'slash') {
        sup.cartSelectedIdx = Math.max(0, cart.length - 1);
        sup.cartScroll = Math.max(0, cart.length - 5);
        sc.screen = 'supply-cart';
        sc.phase = 'supply-cart';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'star') {
        sup.totalsReturnScreen = 'supply';
        sc.screen = 'supply-totals';
        sc.phase = 'supply-totals';
        setScannerMessage('', 'info');
        playBeep();
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

    if (sc.screen === 'supply-totals') {
      const totSummary = computeSupplyCartSummary(cart);
      if (action === 'star' || action === 'back' || action === 'left') {
        const retScr = sup.totalsReturnScreen === 'supply-cart' ? 'supply-cart' : 'supply';
        sc.screen = retScr;
        sc.phase = retScr;
        setScannerMessage('', 'info');
        playBeep();
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
        } else if (totSummary.overBudget) {
          playError();
          setScannerMessage('OVER $300 LIMIT!', 'err');
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

    if (sc.screen === 'supply-cart') {
      const curIdx = Math.max(0, Math.min(Math.max(0, cart.length - 1), sup.cartSelectedIdx || 0));
      sup.cartSelectedIdx = curIdx;

      if (action === 'back' || action === 'slash') {
        sc.screen = 'supply';
        sc.phase = 'supply';
        setScannerMessage('', 'info');
        playBeep();
      } else if (action === 'star') {
        sup.totalsReturnScreen = 'supply-cart';
        sc.screen = 'supply-totals';
        sc.phase = 'supply-totals';
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
    } else if (action === 'star') {
      sup.totalsReturnScreen = 'supply';
      sc.screen = 'supply-totals';
      sc.phase = 'supply-totals';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'slash') {
      sup.cartSelectedIdx = Math.max(0, cart.length - 1);
      sup.cartScroll = Math.max(0, cart.length - 5);
      sc.screen = 'supply-cart';
      sc.phase = 'supply-cart';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'plus') {
      const supplySummary = computeSupplyCartSummary(cart);
      if (cart.length === 0) {
        playError();
        setScannerMessage('ADD ITEMS TO CART', 'err');
      } else if (supplySummary.overBudget) {
        playError();
        setScannerMessage('OVER $300 LIMIT!', 'err');
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
        setScannerMessage('', 'info');
        playBeep();
      } else {
        if (sup.qtyInput.length === 0 && digit === '0') {
          setScannerMessage('', 'info');
          playBeep();
        } else {
          const nextQtyStr = sup.qtyInput + digit;
          const nextQtyNum = parseInt(nextQtyStr, 10);
          if (!Number.isFinite(nextQtyNum) || nextQtyNum > SUPPLY_MAX_CASES_PER_SKU) {
            playError();
            setScannerMessage('MAX 10 CASES / SKU', 'err');
            renderScannerUI();
            return true;
          }
          sup.qtyInput = nextQtyStr;
          setScannerMessage('', 'info');
          playBeep();
        }
      }
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
      const hovered = typeof state.hooks.getHoveredSupplyCase === 'function'
        ? state.hooks.getHoveredSupplyCase()
        : null;
      if (hovered) {
        const res = scanSupplyBox(hovered);
        if (res && res.ok && res.loaded && typeof state.hooks.onBarcodeScanned === 'function') {
          state.hooks.onBarcodeScanned();
        }
        return true;
      }
      playBeep();
      setScannerMessage('SCAN DEPT 60 BOX', 'info');
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
        if (rawQty > SUPPLY_MAX_CASES_PER_SKU) {
          sup.qtyInput = '';
          playError();
          setScannerMessage('MAX 10 CASES / SKU', 'err');
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
          const curCases = existingIdx !== -1 ? (Number(cart[existingIdx].cases) || 0) : 0;
          const totalAfterAdd = curCases + deltaCases;
          if (totalAfterAdd > SUPPLY_MAX_CASES_PER_SKU) {
            sup.qtyInput = '';
            playError();
            setScannerMessage(
              existingIdx !== -1 ? ('MAX 10/SKU (HAS ' + curCases + 'cs)') : 'MAX 10 CASES / SKU',
              'err'
            );
            renderScannerUI();
            return true;
          }
          if (existingIdx !== -1) {
            cart[existingIdx].cases = totalAfterAdd;
            setScannerMessage('+' + deltaCases + 'cs ' + prod.code + ' (' + totalAfterAdd + ')', 'ok');
          } else {
            cart.push({
              code: String(prod.code),
              name: prod.name,
              cases: totalAfterAdd,
              size: prod.size || 'medium',
              unitsPerCase: Number(prod.unitsPerCase) || 8,
              price: Number(prod.price) || 0,
              type: prod.type || 'ambient'
            });
            setScannerMessage('ADD ' + deltaCases + 'cs ' + prod.code, 'ok');
          }
          const postAddSummary = computeSupplyCartSummary(cart);
          if (postAddSummary.overBudget) {
            playError();
            setScannerMessage('OVER $300 LIMIT!', 'err');
          } else {
            playSuccess();
          }
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

  function isClaimItemNotScannable(itemRec) {
    if (!itemRec) return false;
    if (itemRec.notScannable !== undefined) return Boolean(itemRec.notScannable);
    const cat = global.DSDCatalog;
    const prod = (cat && typeof cat.getProduct === 'function' && itemRec.code)
      ? cat.getProduct(String(itemRec.code))
      : null;
    if (prod && prod.notScannable !== undefined) return Boolean(prod.notScannable);
    const deptNo = String(itemRec.deptNo || '').padStart(2, '0');
    return deptNo === '01';
  }

  function loadClaimsItemToCondition(itemRec) {
    const sc = state.scanner;
    if (!sc.damage) sc.damage = createInitialDamageState();
    const dmg = sc.damage;
    const ct = global.ClaimsTotes;

    sc.screen = 'damage-cond';
    sc.phase = 'damage-cond';
    dmg.productCode = String(itemRec.code || '');
    dmg.pendingItemId = itemRec.id;
    dmg.pluTargetItemId = null;
    dmg.isPluItem = isClaimItemNotScannable(itemRec);
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
    return { ok: true, loaded: true, isPlu: dmg.isPluItem, itemId: itemRec.id };
  }

  function scanClaimsItem(itemRec) {
    const sc = state.scanner;
    if (!sc.damage) sc.damage = createInitialDamageState();
    const dmg = sc.damage;

    if (!itemRec || itemRec.claimed) {
      playError();
      setScannerMessage('ITEM ALREADY CLAIMED', 'err');
      renderScannerUI();
      return { ok: false, loaded: false, reason: 'invalid_item' };
    }

    if (itemRec.scannerConfirmed) {
      playBeep();
      setScannerMessage('ALREADY CONFIRMED', 'warn');
      renderScannerUI();
      return { ok: false, loaded: false, reason: 'already_confirmed' };
    }

    if (isClaimItemNotScannable(itemRec)) {
      sc.screen = 'damage';
      sc.phase = 'damage';
      dmg.pendingItemId = null;
      dmg.pluTargetItemId = itemRec.id;
      dmg.productCode = '';
      dmg.isPluItem = true;
      playError();
      setScannerMessage('PLU: TYPE CODE + ENT', 'warn');
      renderScannerUI();
      return { ok: true, loaded: false, isPlu: true, itemId: itemRec.id };
    }

    return loadClaimsItemToCondition(itemRec);
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
      dmg.productCode = '';
      dmg.pluTargetItemId = null;
      sc.screen = 'home';
      sc.phase = 'home';
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'num') {
      const digit = String(val);
      if (String(dmg.productCode || '').length < 4) {
        dmg.productCode = String(dmg.productCode || '') + digit;
        dmg.pendingItemId = null;
      }
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'clear') {
      if (dmg.productCode && dmg.productCode.length > 0) {
        dmg.productCode = dmg.productCode.slice(0, -1);
      }
      dmg.pendingItemId = null;
      if (!dmg.productCode) dmg.pluTargetItemId = null;
      setScannerMessage('', 'info');
      playBeep();
    } else if (action === 'enter') {
      if (!dmg.productCode) {
        playError();
        setScannerMessage('SCAN ITEM / ENTER PLU', 'err');
      } else {
        const hovered = typeof state.hooks.getHoveredClaimsItem === 'function'
          ? state.hooks.getHoveredClaimsItem()
          : null;
        const preferredId = dmg.pluTargetItemId || (hovered ? hovered.id : null);
        const foundItem = (ct && typeof ct.findClaimItemForCodeInput === 'function')
          ? ct.findClaimItemForCodeInput(dmg.productCode, preferredId)
          : null;
        if (!foundItem) {
          playError();
          setScannerMessage('NO ITEM MATCH', 'err');
        } else {
          playBeep();
          return loadClaimsItemToCondition(foundItem);
        }
      }
    } else if (action === 'scan') {
      const hovered = typeof state.hooks.getHoveredClaimsItem === 'function'
        ? state.hooks.getHoveredClaimsItem()
        : null;
      if (hovered) {
        if (hovered.scannerConfirmed || hovered.claimed) {
          playBeep();
          setScannerMessage('ALREADY CONFIRMED', 'warn');
        } else {
          const res = scanClaimsItem(hovered);
          if (res && res.ok && res.loaded && typeof state.hooks.onBarcodeScanned === 'function') {
            state.hooks.onBarcodeScanned();
          }
          return true;
        }
      } else {
        playBeep();
        setScannerMessage('SCAN ITEM / ENTER PLU', 'info');
      }
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
        notify('[[ico:clipboard]] Daily Backroom Inventory finalized (' + (summary.auditedCases || 0) + ' case' + (summary.auditedCases === 1 ? '' : 's') + ' audited).', 3600);
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
      sc.screen = 'inventory-menu';
      sc.phase = 'inventory-menu';
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
      const hovered = typeof state.hooks.getHoveredInventoryCase === 'function'
        ? state.hooks.getHoveredInventoryCase()
        : null;
      if (hovered) {
        if (hovered.notScannable && !hovered.labeled) {
          playError();
          setScannerMessage('PLU: TYPE CODE + ENT', 'warn');
        } else {
          const res = scanBackstockCase(hovered);
          if (res && res.ok && res.loaded && typeof state.hooks.onBarcodeScanned === 'function') {
            state.hooks.onBarcodeScanned();
          }
          return true;
        }
      } else {
        playBeep();
        setScannerMessage('CLICK SHELF CASE', 'info');
      }
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
    d = d || getActiveScannerContext().delivery || (!state.nightDropPanelOpen ? findMatchingInsideDeliveryByHeaders(sc.headers) : null);
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
      notify('[[ico:clipboard]] No physical shortage or overage on this shipment.', 3200);
      return 'No discrepancy.';
    }

    const loggedMsg = syncDiscrepancyFlagsAndTotals(d, 'both');

    playSuccess();
    notify('[[ico:clipboard]] ' + (loggedMsg || 'Discrepancy logged on paperwork'), 4000);
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
    d = d || getActiveScannerContext().delivery || (!state.nightDropPanelOpen ? findMatchingInsideDeliveryByHeaders(sc.headers) : null);
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
      notify('[[ico:checkCircle]] Receipt #' + rec.receiptNumber + ' finalized! Record Receipt # on paperwork.', 4500);
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
      notify('[[ico:claim]] Receipt #' + latestNo + ' saved, but header differs from paperwork! Edit Receipt Header in Terminal [2].', 'high');
    } else if (!bothDone) {
      playSuccess();
      const needsInvoice = Boolean(d.docStates.invoiceRequired && !d.docStates.invoiceCreated);
      const remainingLabel = needsInvoice ? 'Invoice' : 'Credit';
      setScannerMessage('', 'ok');
      notify('[[ico:checkCircle]] Receipt #' + latestNo + ' finalized! Press ENTER to continue for remaining ' + remainingLabel + ' receipt.', 4500);
    } else {
      playSuccess();
      d.receiptCreated = true;
      d.receiptNumber = d.lastReceiptNumber || latestNo;
      setScannerMessage('', 'ok');
      notify('[[ico:checkCircle]] Digital Receipt #' + latestNo + ' finalized! Record Receipt # and Sign on Paperwork.', 4500);
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
      notify('[[ico:crossCircle]] PENALTY (-300 pts): ' + reason, 'critical');
    } else {
      playSuccess();
      if (stats) {
        if (d.type === 'vendor_truck' || d.type === 'truck' || (d.role && d.role.toUpperCase().includes('TRUCK'))) {
          stats.increment('trucksProcessed', 1);
        } else {
          stats.increment('vendorsProcessed', 1);
        }
      }
      notify('[[ico:shield]] GOOD CATCH! Refused failed-temp shipment. No penalty!', 4500);
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
      const summary = computeSupplyCartSummary(cart);
      const skuDisp = formatLcdCell(sup.skuInput, 6, sup.activeField === 'sku');
      const qtyRaw = (sup.negativeMode ? '-' : '') + sup.qtyInput;
      const qtyDisp = formatLcdCell(qtyRaw, 5, sup.activeField === 'qty');
      const idxDisp = products.length > 0 ? ((match.idx + 1) + '/' + products.length) : '0/0';
      const itemLabel = selProd ? String(selProd.name || 'Supply Item').slice(0, 20) : (sup.skuInput ? 'Unknown SKU 6001-10' : 'Select/Key 6001-10');
      const unitCostEach = selProd ? Number(selProd.price || 0) : 0;
      const packSz = selProd ? Math.max(1, Number(selProd.unitsPerCase) || 8) : 8;
      const caseCostEach = unitCostEach * packSz;
      const priceLabel = selProd
        ? ('$' + caseCostEach.toFixed(2) + '/cs | ' + String(packSz) + 'u')
        : 'Vendor #601 Dept 60';
      const line2Sup = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : (summary.overBudget
          ? '<div class="lcd-scr-line notice">! OVER $300 LIMIT !</div>'
          : '<div class="lcd-scr-line">Cart:' + escapeHtml(String(summary.totalCases)) + 'cs $' + escapeHtml(summary.totalCost.toFixed(2)) + '</div>');
      const line7Sup = summary.overBudget
        ? '<div class="lcd-scr-line notice">' + escapeHtml(('OVER $300: $' + summary.totalCost.toFixed(2)).slice(0, 20)) + '</div>'
        : '<div class="lcd-scr-line">Up/Dn Item | - Adj</div>';

      linesHtml =
        '<div class="lcd-scr-line">DEPT 60 SUPPLY ORDER</div>' +
        line2Sup +
        '<div class="lcd-scr-line">SKU:   <span class="lcd-input-box' + (sup.activeField === 'sku' ? ' active' : '') + '">' + skuDisp + '</span> ' + escapeHtml(idxDisp) + '</div>' +
        '<div class="lcd-scr-line">Cases: <span class="lcd-input-box' + (sup.activeField === 'qty' ? ' active' : '') + '">' + qtyDisp + '</span> Stk:' + escapeHtml(String(curStockUnits)) + 'u</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(itemLabel) + '</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(priceLabel.slice(0, 20)) + '</div>' +
        line7Sup +
        '<div class="lcd-scr-line">F2 Totals | F3 Back</div>' +
        '<div class="lcd-scr-line">F4 Cart(' + escapeHtml(String(cart.length)) + ') | F5 ORDER</div>';
    } else if (sc.screen === 'supply-cart') {
      if (!sc.supply) sc.supply = createInitialSupplyState();
      const sup = sc.supply;
      const cart = Array.isArray(sup.cartItems) ? sup.cartItems : [];
      const summary = computeSupplyCartSummary(cart);
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
        : (summary.overBudget
          ? '<div class="lcd-scr-line notice">! OVER $300 LIMIT !</div>'
          : '<div class="lcd-scr-line">Item           Cases</div>');
      const line8Cart = (summary.overBudget && noticeText)
        ? '<div class="lcd-scr-line notice">' + escapeHtml(('OVER $300: $' + summary.totalCost.toFixed(2)).slice(0, 20)) + '</div>'
        : '<div class="lcd-scr-line">Up/Dn Nav | -/BKSP</div>';
      linesHtml =
        '<div class="lcd-scr-line">Supply Cart (' + escapeHtml(String(cart.length)) + ')</div>' +
        line2Cart +
        cartRows +
        line8Cart +
        '<div class="lcd-scr-line">F2 Totals | F3 Back</div>';
    } else if (sc.screen === 'supply-totals') {
      if (!sc.supply) sc.supply = createInitialSupplyState();
      const sup = sc.supply;
      const cart = Array.isArray(sup.cartItems) ? sup.cartItems : [];
      const summary = computeSupplyCartSummary(cart);
      const line2Tot = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : (summary.overBudget
          ? '<div class="lcd-scr-line notice">! OVER $300 LIMIT !</div>'
          : '<div class="lcd-scr-line">Vendor #601 Retail</div>');
      const statusTotLine = summary.overBudget
        ? '<div class="lcd-scr-line notice">' + escapeHtml(('OVER BY $' + (summary.totalCost - SUPPLY_MAX_ORDER_COST).toFixed(2)).slice(0, 20)) + '</div>'
        : '<div class="lcd-scr-line">Budget: WITHIN LIMIT</div>';
      linesHtml =
        '<div class="lcd-scr-line">SUPPLY TOTALS</div>' +
        line2Tot +
        '<div class="lcd-scr-line">SKUs:   ' + escapeHtml(String(summary.skus)) + '</div>' +
        '<div class="lcd-scr-line">Cases:  ' + escapeHtml(String(summary.totalCases)) + ' cs</div>' +
        '<div class="lcd-scr-line">Units:  ' + escapeHtml(String(summary.totalUnits)) + ' u</div>' +
        '<div class="lcd-scr-line">Cost:   $' + escapeHtml(summary.totalCost.toFixed(2)) + '</div>' +
        '<div class="lcd-scr-line">Limit:  $' + escapeHtml(SUPPLY_MAX_ORDER_COST.toFixed(2)) + ' Max</div>' +
        statusTotLine +
        '<div class="lcd-scr-line">F2/F3 Back | F4 Cart</div>';
    } else if (sc.screen === 'supply-confirm') {
      if (!sc.supply) sc.supply = createInitialSupplyState();
      const sup = sc.supply;
      const cart = Array.isArray(sup.cartItems) ? sup.cartItems : [];
      const summary = computeSupplyCartSummary(cart);
      const etaInfo = getNextSupplyEtaDateInfo();
      const line2Confirm = noticeText
        ? '<div class="lcd-scr-line notice">' + escapeHtml(noticeText) + '</div>'
        : '<div class="lcd-scr-line">Vendor #601 Retail</div>';
      const limitLine = summary.overBudget
        ? '<div class="lcd-scr-line notice">! OVER $300 BLOCKED !</div>'
        : '<div class="lcd-scr-line notice">LIMIT: 1 ORDER / DAY</div>';
      linesHtml =
        '<div class="lcd-scr-line">SEND SUPPLY ORDER?</div>' +
        line2Confirm +
        '<div class="lcd-scr-line">SKUs:  ' + escapeHtml(String(summary.skus)) + '</div>' +
        '<div class="lcd-scr-line">Cases: ' + escapeHtml(String(summary.totalCases)) + ' cs</div>' +
        '<div class="lcd-scr-line">Est:   $' + escapeHtml(summary.totalCost.toFixed(2)) + '</div>' +
        '<div class="lcd-scr-line">ETA:   ' + escapeHtml(etaInfo.mmddyyyy) + '</div>' +
        limitLine +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">' + (summary.overBudget ? 'F4 Cart | F3 Back' : 'ENT Confirm | F3 No') + '</div>';
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
    } else if (sc.screen === 'inventory-menu') {
      const subOptions = [
        '1. LABEL CASES',
        '2. AUDIT BACKROOM'
      ];
      const subIdx = sc.inventoryMenuIdx === 1 ? 1 : 0;
      sc.inventoryMenuIdx = subIdx;
      const subRows = subOptions.map((label, idx) => {
        const isSel = idx === subIdx;
        return '<div class="lcd-scr-line' + (isSel ? ' notice' : '') + '">' + escapeHtml(label.slice(0, 24)) + '</div>';
      }).join('');
      linesHtml =
        '<div class="lcd-scr-line">BACKROOM INVENTORY</div>' +
        line2Notice +
        subRows +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">1-2 or Up/Dn + ENT</div>' +
        '<div class="lcd-scr-line">F3 Back</div>';
    } else if (sc.screen === 'label-cases') {
      if (!sc.label) sc.label = createInitialLabelState();
      const lbl = sc.label;
      const codeDisp = formatLcdCell(lbl.productCode, 10, true);
      const qtyText = lbl.qtyPerCase > 0
        ? (String(lbl.qtyPerCase) + 'u/cs' + (lbl.isPluCase ? ' [PLU->UPC]' : ''))
        : '--';
      const prodNameText = lbl.lastScannedLabel ? lbl.lastScannedLabel.slice(0, 20) : ' ';
      linesHtml =
        '<div class="lcd-scr-line">LABEL CASES</div>' +
        line2Notice +
        '<div class="lcd-scr-line">Code: <span class="lcd-input-box active">' + codeDisp + '</span></div>' +
        '<div class="lcd-scr-line">Pack: ' + escapeHtml(qtyText.slice(0, 17)) + '</div>' +
        '<div class="lcd-scr-line">Product Name:</div>' +
        '<div class="lcd-scr-line">' + escapeHtml(prodNameText) + '</div>' +
        '<div class="lcd-scr-line">Click Case | Key PLU</div>' +
        '<div class="lcd-scr-line">ENT Load | F6 PRINT</div>' +
        '<div class="lcd-scr-line">F3 Back</div>';
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
        '<div class="lcd-scr-line">AUDIT BACKROOM</div>' +
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
      const dmg = sc.damage;
      const codeDisp = formatLcdCell(dmg.productCode || '', 5, true);
      linesHtml =
        '<div class="lcd-scr-line">MARKDOWN CLAIMS</div>' +
        line2Notice +
        '<div class="lcd-scr-line">Code: <span class="lcd-input-box active">' + codeDisp + '</span></div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">Scan Item or Enter PLU</div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line"> </div>' +
        '<div class="lcd-scr-line">ENT Load | F3 Back</div>' +
        '<div class="lcd-scr-line"> </div>';
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
        '<div class="lcd-scr-line">Up / Down Select</div>' +
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


  Object.assign(bridge.fn, {
    resetScannerSession,
    setScannerMessage,
    clearScannerMessage,
    renderScannerUI
  });

  Object.assign(api, {
    resetScannerSession,
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
    scanSpecificBox,
    isScannerLabelMode,
    scanBackstockCaseForLabel,
    scanBackstockCase,
    isScannerInventoryMode,
    isInventoryAuditFinalized() {
      return Boolean(state.scanner && state.scanner.inventory && state.scanner.inventory.finalized);
    },
    getScannerScreen() {
      return (state.scanner && state.scanner.screen) ? state.scanner.screen : 'home';
    },
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
    getScannerState() {
      return state.scanner;
    },
    isDiscrepancyShortageStamped(item) {
      return Boolean(item && item.shortageStamped);
    }
  });
})(window);
