(function (global) {
  'use strict';

  /**
   * DSDReceipts (Terminal Module) - 5-Screen CRT Workstation Terminal, Night Drops, Daily Filing & Archive
   * Requires js/dsd-receipts.js (and js/dsd-scanner.js) to load first.
   */

  const api = global.DSDReceipts;
  const bridge = api && api._internal;
  if (!bridge) {
    throw new Error('DSDReceipts core (js/dsd-receipts.js) must be loaded before js/dsd-terminal.js.');
  }

  const state = bridge.state;
  const {
    getCatalog,
    getClock,
    getWorkdayIndex,
    getStats,
    playBeep,
    playError,
    playSuccess,
    playPaper,
    notify,
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
    resolveReceiptDocType,
    createReceipt,
    validateAndCreateBlankReceipt,
    isPreviousDayReceipt,
    getReceiptStatus,
    getInitialReceipts,
    resumeReceiptInTerminal,
    syncReceiptItems,
    syncActiveDeliveryLinkForReceipt,
    getReceipts,
    findReceipt,
    updateReceiptHeader,
    voidReceipt,
    printReceiptSlip
  } = bridge.core;

  function resetScannerSession() {
    return typeof bridge.fn.resetScannerSession === 'function' ? bridge.fn.resetScannerSession.apply(null, arguments) : undefined;
  }
  function renderScannerUI() {
    return typeof bridge.fn.renderScannerUI === 'function' ? bridge.fn.renderScannerUI.apply(null, arguments) : undefined;
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
    if (screen === 'create') {
      return (state.manualDraft && state.manualDraft.phase === 'scanning') ? 'create' : 'createInitial';
    }
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
      state.terminalPage.createInitial = 0;
    } else if (state.currentScreen === 'receipts') {
      state.terminalPage.receipts = Number.MAX_SAFE_INTEGER;
      state.receiptsScrollToBottom = true;
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

    if (key === 'DEPT_PREV' || key === 'DEPT_NEXT') {
      if (screen === 'receipts') {
        const idx = RECEIPT_LEDGER_DEPT_GROUPS.findIndex((g) => g.key === state.receiptsDeptGroup);
        const curIdx = idx !== -1 ? idx : 0;
        const delta = key === 'DEPT_PREV' ? -1 : 1;
        const nextIdx = (curIdx + delta + RECEIPT_LEDGER_DEPT_GROUPS.length) % RECEIPT_LEDGER_DEPT_GROUPS.length;
        state.receiptsDeptGroup = RECEIPT_LEDGER_DEPT_GROUPS[nextIdx].key;
        state.terminalPage.receipts = 0;
        playBeep();
        renderTerminalUI();
        return true;
      }
      if (key === 'DEPT_PREV' && screen === 'suppliers' && !(state.supplierQuery || '').trim()) {
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
    // 1. Receipts (Initial, Final, Void, Clear)
    let initialCount = 0;
    let finalCount = 0;
    let voidCount = 0;
    let clearCount = 0;
    (state.processedReceipts || []).forEach((r) => {
      const st = getReceiptStatus(r);
      if (st === 'INITIAL') initialCount++;
      else if (st === 'FINAL') finalCount++;
      else if (st === 'VOID') voidCount++;
      else if (st === 'CLEAR') clearCount++;
    });
    const totalReceiptsCount = initialCount + finalCount + voidCount + clearCount;

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
      voidCount,
      clearCount,
      totalReceiptsCount,
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
      <div class="crt-sum-title">TERMINAL SUMMARY</div>

      <div class="crt-sum-group">
        <div class="crt-sum-hdr"><span>RECEIPTS</span>${numVal(snap.totalReceiptsCount)}</div>
        <div class="crt-sum-row"><span>Initial Receipts</span>${numVal(snap.initialCount)}</div>
        <div class="crt-sum-row"><span>Final Receipts</span>${numVal(snap.finalCount)}</div>
        <div class="crt-sum-row"><span>Void Receipts</span>${numVal(snap.voidCount)}</div>
        <div class="crt-sum-row"><span>Clear Receipts</span>${numVal(snap.clearCount)}</div>
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
      const allInitialRecs = getInitialReceipts();
      const initPg = paginateItems(allInitialRecs, 'createInitial', 4);
      const initialRows = initPg.items.map((ir) => {
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
      const resumeBlock = allInitialRecs.length > 0 ? `
        <div class="crt-section-hdr" style="margin-top:10px;">OR TAKE OVER OPEN INITIAL RECEIPT (${allInitialRecs.length})</div>
        <div class="crt-scroll-panel">
          <table class="crt-table">
            <thead><tr><th>RCPT #</th><th>D / V</th><th>INV #</th><th>UNITS</th><th>TOTAL</th><th>ACTION</th></tr></thead>
            <tbody>${initialRows}</tbody>
          </table>
        </div>
        ${renderTerminalPager(initPg)}
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

      bindTerminalPager(body, 'createInitial');

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

  const RECEIPT_LEDGER_DEPT_GROUPS = [
    { key: '01', label: 'Dept 01', match: (d) => d === '01' },
    { key: '1X', label: 'Depts 1X', match: (d) => d.startsWith('1') },
    { key: '2X', label: 'Depts 2X', match: (d) => d.startsWith('2') },
    { key: '3X', label: 'Depts 3X', match: (d) => d.startsWith('3') },
    { key: '4X', label: 'Depts 4X', match: (d) => d.startsWith('4') },
    { key: '50', label: 'Dept 50', match: (d) => d === '50' },
    { key: '60', label: 'Dept 60', match: (d) => d === '60' }
  ];

  function getActiveReceiptsDeptGroup() {
    const found = RECEIPT_LEDGER_DEPT_GROUPS.find((g) => g.key === state.receiptsDeptGroup);
    if (found) return found;
    state.receiptsDeptGroup = RECEIPT_LEDGER_DEPT_GROUPS[0].key;
    return RECEIPT_LEDGER_DEPT_GROUPS[0];
  }

  function renderTerminalReceipts(body) {
    const receipts = getReceipts(true);
    const eligibleDaily = receipts.filter(isDailyFilingReceiptEligible);
    const pendingStoreCount = eligibleDaily.filter((r) => !r.storeCopyPrinted).length;
    const activeGroup = getActiveReceiptsDeptGroup();

    const tabsHtml = RECEIPT_LEDGER_DEPT_GROUPS.map((grp) => {
      const grpCount = receipts.filter((r) => grp.match(padDigits(r && r.deptNo, 2))).length;
      const isActive = grp.key === activeGroup.key;
      return `<button type="button" class="crt-pill${isActive ? ' active' : ''}" data-rcpt-grp="${escapeHtml(grp.key)}" role="tab" aria-selected="${isActive ? 'true' : 'false'}">${escapeHtml(grp.label)} (${grpCount})</button>`;
    }).join('');

    const groupReceipts = receipts
      .filter((r) => activeGroup.match(padDigits(r && r.deptNo, 2)))
      .sort((a, b) => {
        const dA = formatIsoDateString((a && (a.dateIso || a.date)) || '');
        const dB = formatIsoDateString((b && (b.dateIso || b.date)) || '');
        if (dA !== dB) return dA.localeCompare(dB);
        return String((a && a.receiptNumber) || '').localeCompare(String((b && b.receiptNumber) || ''));
      });
    const pg = paginateItems(groupReceipts, 'receipts', 10);
    const listRows = pg.items.map((r) => {
      const totalCases = (r.items || []).reduce((sum, it) => sum + Math.abs(Number(it.qty) || 0), 0);
      const st = getReceiptStatus(r);
      const dateStr = formatIsoDateString(r.dateIso || r.date);
      const hoTag = isHomeOfficeTaskArchiveReceipt(r) ? ' <span style="color:#38bdf8;font-size:10px;font-weight:800;">[HO]</span>' : '';
      return `
        <tr class="crt-row-click" data-rec-no="${escapeHtml(r.receiptNumber)}">
          <td><strong>${escapeHtml(r.receiptNumber)}</strong></td>
          <td style="white-space:nowrap;">${escapeHtml(dateStr)}</td>
          <td style="white-space:nowrap;">${r.type === 'credit' ? '<span style="color:#f59e0b;">CRD</span>' : (r.type === 'po' ? '<span style="color:#38bdf8;">PO</span>' : 'INV')}${hoTag}</td>
          <td>D#${escapeHtml(r.deptNo)} / V#${escapeHtml(r.vendorNo)}</td>
          <td>#${escapeHtml(r.invoiceNo)}</td>
          <td>${totalCases}</td>
          <td>${formatMoney(r.totalAmount)}</td>
          <td>${formatReceiptStatusTag(st, false)}</td>
          <td style="text-align:right; white-space:nowrap;"><button class="crt-btn-sm" type="button" data-open-rec="${escapeHtml(r.receiptNumber)}">[ VIEW ]</button></td>
        </tr>
      `;
    }).join('');

    const printStoreBtnHtml = `<button id="crt-btn-print-all-store-copies" class="crt-btn-sm crt-btn-primary" type="button" ${pendingStoreCount === 0 ? 'disabled' : ''}>[ PRINT STORE COPIES ]</button>`;

    body.innerHTML = `
      <div class="crt-meta-bar">
        <span>PROCESSED RECEIPTS LEDGER (${escapeHtml(activeGroup.label)}: ${groupReceipts.length} / ALL: ${receipts.length})</span>
        <span>SELECT RECEIPT OR [VIEW] TO INSPECT</span>
      </div>
      <div class="crt-pill-bar crt-ledger-tabs" role="tablist" aria-label="Receipt Ledger Department Groups">
        ${tabsHtml}
      </div>
      <div class="crt-scroll-panel">
        <table class="crt-table crt-ledger-table">
          <colgroup>
            <col style="width:58px;">
            <col style="width:66px;">
            <col style="width:70px;">
            <col style="width:88px;">
            <col style="width:62px;">
            <col style="width:46px;">
            <col style="width:68px;">
            <col style="width:54px;">
            <col style="width:60px;">
          </colgroup>
          <thead><tr><th>RCPT #</th><th>DATE</th><th>TYPE</th><th>D/V</th><th>INV #</th><th>CASES</th><th>TOTAL</th><th>STATUS</th><th style="text-align:right;">ACTION</th></tr></thead>
          <tbody>
            ${listRows || `<tr><td colspan="9" style="text-align:center; opacity:0.65;">No receipts in ${escapeHtml(activeGroup.label)} yet this shift.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${renderTerminalPager(pg, printStoreBtnHtml)}
    `;

    if (state.receiptsScrollToBottom) {
      state.receiptsScrollToBottom = false;
      const scrollEl = body.querySelector('.crt-scroll-panel');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }

    bindTerminalPager(body, 'receipts');

    body.querySelectorAll('[data-rcpt-grp]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const nextGrp = tabBtn.getAttribute('data-rcpt-grp');
        if (!nextGrp) return;
        state.receiptsDeptGroup = nextGrp;
        state.terminalPage.receipts = Number.MAX_SAFE_INTEGER;
        state.receiptsScrollToBottom = true;
        playBeep();
        renderTerminalUI();
      });
    });

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
            <span style="font-size:11px; color:#86efac; margin-left:8px;">[${selected.type === 'credit' ? 'CREDIT' : (selected.type === 'po' ? 'PO' : 'INVOICE')} :: ${escapeHtml(selected.source.toUpperCase())} :: ${escapeHtml(selected.time)}]</span>
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
    const isDay1 = getWorkdayIndex() === 1;
    const minT = isDay1 ? 1 : (Number(cfg.minTasks) || 1);
    const maxT = isDay1 ? 1 : (Number(cfg.maxTasks) || 2);
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

    // First task arrives 1 minute into the shift (6:01 AM) so it populates the Message Log; remaining tasks arrive across morning window up to 11:25 AM (<= 690)
    const shiftStartMin = (Number(cfg.shiftStartHour) || 6) * 60;
    const firstTaskMin = shiftStartMin + 1;
    const maxReleaseMin = Math.min(685, cutoffMinute - 5);
    const releaseMinutes = [firstTaskMin];
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
      const releaseMin = isInitialShiftTask ? firstTaskMin : releaseMinutes[Math.min(i, releaseMinutes.length - 1)];

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
          released: false,
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
          released: false,
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
          released: false,
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
          notify('❌ Enter a valid affected unit count!', 'high');
          return;
        }
        state.terminalRecallCount = '';
        if (res.matched) {
          playSuccess();
          notify('🎉 RECALL COMPLETE! "' + res.productName + '" verified (+500 pts).', 'status');
        } else {
          playError();
          notify('⚠️ Recall count mismatch recorded. Task completed with error (-100 pts).', 'critical');
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

    const maxNd = getWorkdayIndex() === 1 ? 1 : 2;
    const count = Math.min(pool.length, 1 + Math.floor(Math.random() * maxNd)); // Day 1: max 1; Day 2+: 1 to 2 overnight vendor invoices
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
      panel.classList.remove('docked-scanner');
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
      const scanOpen = typeof state.hooks.isScannerOpen === 'function' && state.hooks.isScannerOpen();
      keyScanBtn.classList.toggle('is-active', scanOpen);
      keyScanBtn.addEventListener('click', () => {
        playBeep();
        if (typeof state.hooks.onToggleScanner === 'function') {
          state.hooks.onToggleScanner('nightdrop');
        } else if (typeof state.hooks.onOpenScanner === 'function') {
          state.hooks.onOpenScanner('nightdrop');
        }
      });
    }
    const keyBtn = document.getElementById('nd-key-terminal-btn');
    if (keyBtn) {
      const termOpen = typeof state.hooks.isTerminalOpen === 'function' && state.hooks.isTerminalOpen();
      keyBtn.classList.toggle('is-active', termOpen);
      keyBtn.addEventListener('click', () => {
        playBeep();
        if (typeof state.hooks.onToggleTerminalScreen === 'function') {
          state.hooks.onToggleTerminalScreen('create');
        } else if (typeof state.hooks.onOpenTerminalScreen === 'function') {
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
        docType: (padDigits(d.vendorNo, 3) === '011' || d.type === 'warehouse') ? 'po' : 'invoice',
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
    if (isHomeOfficeTaskArchiveReceipt(rec)) return { ok: false, error: 'Home Office archive corrections file automatically to the 90-Day Archive.' };

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

  function seedDummyReceiptsAllDepts() {
    const catalog = getCatalog();
    const deptsMap = (catalog && catalog.DEPARTMENTS) ? catalog.DEPARTMENTS : {};
    const catalogDeptKeys = Object.keys(deptsMap).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const deptList = catalogDeptKeys.length > 0
      ? catalogDeptKeys
      : ['01', '10', '11', '12', '13', '14', '15', '20', '21', '22', '23', '30', '31', '32', '40', '41', '42', '50', '60'];

    const usedInvs = new Set(state.processedReceipts.map((r) => String(r && r.invoiceNo || '')));
    let nextInvNum = 710100;
    const created = [];

    deptList.forEach((rawDept) => {
      const deptNo = padDigits(rawDept, 2);
      const deptObj = deptsMap[rawDept] || deptsMap[deptNo] || null;
      const vendorsMap = (deptObj && deptObj.vendors) ? deptObj.vendors : {};
      const vendorKeys = Object.keys(vendorsMap);
      const pickedVendor = vendorKeys.length > 0 ? vendorsMap[vendorKeys[0]] : null;
      const vendorNo = padDigits((pickedVendor && pickedVendor.vendorNo) || vendorKeys[0] || '101', 3);

      const prodMap = (pickedVendor && pickedVendor.products) ? pickedVendor.products : {};
      const prodList = Array.isArray(prodMap) ? prodMap : Object.values(prodMap);
      const pickedProds = prodList.slice(0, 2);
      const items = pickedProds.length > 0
        ? pickedProds.map((p, idx) => ({
          code: String(p.code || (deptNo + '0' + (idx + 1))),
          name: String(p.name || ('Dept ' + deptNo + ' Test Item ' + (idx + 1))),
          qty: idx === 0 ? 4 : 2,
          price: Number(p.price) || 2.50,
          notScannable: Boolean(p.notScannable),
          type: p.type || 'ambient'
        }))
        : [{
          code: deptNo + '01',
          name: 'Dept ' + deptNo + ' Test Item',
          qty: 4,
          price: 2.50,
          notScannable: deptNo === '01',
          type: 'ambient'
        }];

      while (usedInvs.has(String(nextInvNum))) {
        nextInvNum += 1;
      }
      const invoiceNo = String(nextInvNum).padStart(6, '0');
      usedInvs.add(invoiceNo);
      nextInvNum += 1;

      const expUnits = items.reduce((s, it) => s + Math.abs(Number(it.qty) || 0), 0);
      const expCost = Number(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0).toFixed(2));
      const rec = createReceipt({
        deptNo: deptNo,
        vendorNo: vendorNo,
        invoiceNo: invoiceNo,
        expectedUnits: expUnits,
        expectedCost: expCost,
        source: 'terminal',
        items: items,
        finalized: true,
        storeCopyPrinted: false,
        cleared: false,
        isPreviousDay: false
      });
      created.push(rec);
    });

    if (state.terminalOpen) {
      if (state.currentScreen === 'receipts') {
        state.terminalPage.receipts = Number.MAX_SAFE_INTEGER;
        state.receiptsScrollToBottom = true;
      }
      renderTerminalUI();
    }
    if (state.filingOpen) {
      populateFilingCards();
    }
    return { ok: true, count: created.length, receipts: created };
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
      if (inv.deliveryId && inv.docType !== 'credit') {
        folderByDeliveryId[inv.deliveryId] = folder;
      }
      vendorFolders.push(folder);
    });

    generateArchiveData(false);
    const archivedTodayEntry = {
      dateStr: snap.dateLabel + ' (FILED TODAY)',
      shortDate: formatShortDateFromSnap(snap),
      isToday: true,
      isCampaignDay: true,
      placeholder: false,
      colorHex: '#22c55e',
      vendors: vendorFolders
    };
    if (state.archiveData.length > 0 && state.archiveData[0].isToday) {
      state.archiveData[0] = archivedTodayEntry;
    } else {
      state.archiveData.unshift(archivedTodayEntry);
      if (state.archiveData.length > MAX_ARCHIVE_DAYS) {
        state.archiveData.length = MAX_ARCHIVE_DAYS;
      }
    }

    playSuccess();
    notify('📁 Daily Filing Complete! ' + state.filedReceiptsCount + ' receipt(s) filed to Top Drawer Archive.', 4500);
    renderFilingCards();
    if (state.archiveOpen) renderInvoiceArchive();
    notifyDeskStateChanged();
  }

  // ---- 90-DAY FILE CABINET ARCHIVE ----
  const MAX_ARCHIVE_DAYS = 90;
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

  function normalizeArchiveDayPayload(day) {
    const cloned = cloneArchiveDataPayload(day);
    if (cloned && Array.isArray(cloned.vendors)) {
      cloned.vendors.forEach((v) => {
        if (!v) return;
        const vNo = padDigits(v.vendorNo, 3);
        if (vNo === '011' && v.docType !== 'credit') {
          v.docType = 'po';
        }
        if (Array.isArray(v.receipts)) {
          v.receipts.forEach((rec) => {
            if (!rec) return;
            rec.type = resolveReceiptDocType(vNo, rec.items, rec.type);
          });
        }
      });
    }
    return cloned;
  }

  function syncArchiveReceiptsToLedger() {
    if (!Array.isArray(state.archiveData) || state.archiveData.length === 0) return 0;

    // Rebuild synced historical archive entries cleanly from current archiveData so Home Office mutations stay 1:1 without duplicates
    state.processedReceipts = state.processedReceipts.filter((r) => !(r && r.isArchiveReceipt));

    const existingRecNos = new Set();
    state.processedReceipts.forEach((r) => {
      if (r && r.receiptNumber) existingRecNos.add(String(r.receiptNumber));
    });

    const isFallbackSource = !(state.staticArchiveHistory && Array.isArray(state.staticArchiveHistory.days) && state.staticArchiveHistory.days.length > 0);
    let added = 0;

    state.archiveData.forEach((day) => {
      if (!day || day.isToday || day.placeholder || !Array.isArray(day.vendors)) return;
      const dayDate = String(day.dateStr || day.shortDate || '').trim();
      const dayDateIso = formatIsoDateString(dayDate || day.shortDate);

      day.vendors.forEach((vendor) => {
        if (!vendor || !Array.isArray(vendor.receipts)) return;
        const defaultVendorNo = padDigits(vendor.vendorNo, 3);
        const defaultDeptNo = padDigits(vendor.deptNo, 2);
        const defaultInvNo = padDigits(vendor.invoiceNo, 6);

        vendor.receipts.forEach((archRec) => {
          if (!archRec) return;
          const recNo = String(archRec.receiptNumber || '').trim();
          if (!recNo || existingRecNos.has(recNo)) return;
          existingRecNos.add(recNo);

          const vNo = padDigits(archRec.vendorNo || defaultVendorNo, 3);
          const dNo = padDigits(archRec.deptNo || defaultDeptNo, 2);
          const invNo = padDigits(archRec.invoiceNo || defaultInvNo, 6);
          const items = (archRec.items || []).map((it) => {
            const q = Number(it.qty) || 0;
            const upc = (q < 0 || dNo === '01') ? 1 : (it.unitsPerCase !== undefined ? Number(it.unitsPerCase) : getItemUnitsPerCase(it, 'sidedoor'));
            return {
              code: String(it.code),
              name: String(it.name || 'Item'),
              qty: q,
              unitsPerCase: upc,
              price: Number(it.price) || 0,
              notScannable: Boolean(it.notScannable || dNo === '01' || dNo === '12'),
              type: it.type || 'ambient'
            };
          });

          const recType = resolveReceiptDocType(vNo, items, archRec.type);
          const computedTotal = items.reduce((sum, it) => sum + (it.qty * it.price), 0);
          const totalAmount = archRec.totalAmount !== undefined
            ? Number(Number(archRec.totalAmount).toFixed(2))
            : Number(computedTotal.toFixed(2));
          const expectedUnits = items.reduce((sum, it) => sum + Math.abs(Number(it.qty) || 0), 0);
          const expectedCost = Number(Math.abs(totalAmount).toFixed(2));

          state.processedReceipts.push({
            receiptNumber: recNo,
            date: dayDate,
            dateIso: dayDateIso,
            time: String(archRec.time || vendor.time || '8:00 AM'),
            vendorNo: vNo,
            deptNo: dNo,
            invoiceNo: invNo,
            expectedUnits: expectedUnits,
            expectedCost: expectedCost,
            type: recType,
            source: (vendor.vendorType === 'warehouse' || vNo === '011') ? 'warehouse' : 'scanner',
            items: items,
            totalAmount: totalAmount,
            voided: false,
            finalized: true,
            cleared: true,
            storeCopyPrinted: true,
            isPreviousDay: true,
            isArchiveReceipt: true,
            isProceduralFallbackArchive: isFallbackSource && !day.isCampaignDay,
            outOfTemp: false,
            accurate: true,
            deliveryId: null
          });
          added++;
        });
      });
    });

    if (added > 0 && state.terminalOpen && state.currentScreen === 'receipts') {
      renderTerminalUI();
    }
    return added;
  }

  function hydrateStaticArchiveHistory(payload) {
    if (!payload || !Array.isArray(payload.days) || payload.days.length === 0) return null;
    state.staticArchiveHistory = payload;
    // Populate archive immediately if not already populated with historical days
    if (state.archiveData.length <= 1) {
      generateArchiveData(true);
      if (state.archiveOpen) renderInvoiceArchive();
    } else {
      restoreHistoricalArchiveDays();
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

  function isCampaignArchiveDay(day) {
    if (!day) return false;
    if (day.isToday || day.isCampaignDay) return true;
    const ds = String(day.dateStr || '');
    return !day.placeholder && /(?:FEB|MAR)\s+\d{1,2},\s+\d{4}/i.test(ds);
  }

  function restoreHistoricalArchiveDays() {
    const todayAndFiledCampaign = state.archiveData.filter(isCampaignArchiveDay);
    if (state.staticArchiveHistory && Array.isArray(state.staticArchiveHistory.days) && state.staticArchiveHistory.days.length > 0) {
      const freshJan = state.staticArchiveHistory.days.map((rawDay) => normalizeArchiveDayPayload(rawDay));
      state.archiveData = todayAndFiledCampaign.concat(freshJan);
    } else if (Array.isArray(state.proceduralArchiveSnapshot) && state.proceduralArchiveSnapshot.length > 0) {
      const freshJan = state.proceduralArchiveSnapshot.map((rawDay) => normalizeArchiveDayPayload(rawDay));
      state.archiveData = todayAndFiledCampaign.concat(freshJan);
    }
    if (state.archiveData.length > MAX_ARCHIVE_DAYS) {
      state.archiveData.length = MAX_ARCHIVE_DAYS;
    }
    syncArchiveReceiptsToLedger();
  }

  function generateArchiveData(forceHistorical) {
    const snap = getClock() ? getClock().getTimeSnapshot() : { dateLabel: 'THU FEB 01, 1996' };
    const existingToday = (state.archiveData.length > 0 && state.archiveData[0].isToday)
      ? state.archiveData[0]
      : {
        dateStr: snap.dateLabel + ' (TODAY)',
        isToday: true,
        isCampaignDay: true,
        placeholder: true,
        colorHex: '#22c55e',
        vendors: []
      };

    const existingFiledCampaign = state.archiveData.filter((day) => day && !day.isToday && isCampaignArchiveDay(day));
    const needsHistorical = Boolean(forceHistorical) || state.archiveData.length <= (1 + existingFiledCampaign.length);
    if (!needsHistorical) {
      state.archiveData[0] = existingToday;
      syncArchiveReceiptsToLedger();
      return;
    }

    state.archiveData = [existingToday].concat(existingFiledCampaign);

    // Prefer the loaded static January 1996 archive dataset (from dsd-archive-history.json / fallback)
    if (state.staticArchiveHistory && Array.isArray(state.staticArchiveHistory.days) && state.staticArchiveHistory.days.length > 0) {
      state.staticArchiveHistory.days.forEach((rawDay) => {
        state.archiveData.push(normalizeArchiveDayPayload(rawDay));
      });
      syncArchiveReceiptsToLedger();
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
        const vDocType = padDigits(pick.vendorNo, 3) === '011' ? 'po' : 'invoice';
        const receipts = [{
          receiptNumber: pick.deptNo + '-' + String(serialCounter).padStart(4, '0'),
          type: vDocType,
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
          docType: vDocType,
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
    syncArchiveReceiptsToLedger();
  }

  function toggleArchivePin(item) {
    const existsIdx = state.pinnedArchiveItems.findIndex(
      (p) => p.docNo === item.docNo && p.vendorNo === item.vendorNo && p.type === item.type
    );
    if (existsIdx !== -1) {
      state.pinnedArchiveItems.splice(existsIdx, 1);
      playBeep();
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

    let sidebarHtml = '<div class="arch-sidebar-hdr">90-DAY FILE CABINET ARCHIVE<br><span style="font-size:10px;color:#94a3b8;">PINNED DESK SLOT: ' + state.pinnedArchiveItems.length + '/1</span></div>';
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
      const isPo = !isCred && (rec.type === 'po' || padDigits(rec.vendorNo || currentVendor.vendorNo, 3) === '011');
      const corrBadge = isCorrectionToday
        ? (' <span style="background:' + (!hasHistoricalInCat ? '#0369a1' : '#15803d') + '; color:#fff; padding:1px 6px; border-radius:2px; font-size:9px; font-weight:800; margin-left:6px;">' + (!hasHistoricalInCat ? 'ADDED RECEIPT (TODAY)' : 'CORRECTION (TODAY)') + '</span>')
        : '';
      return '<div class="arch-doc-group ' + (isCred ? 'cat-credit-rcpt' : 'cat-receipt') + '">' +
        '<div class="arch-cat-bar">' +
        '<div class="arch-cat-tab">' +
        '<span>' + (isCred ? 'CREDIT MEMO RECEIPT' : (isPo ? 'PO RECEIPT' : 'INVOICE RECEIPT')) + '</span>' +
        '<span class="arch-cat-tab-num">#' + escapeHtml(rec.receiptNumber) + '</span>' +
        corrBadge +
        '</div>' +
        '<div class="arch-cat-meta">' +
        '<span>' + (isCred ? 'CRED #' : (isPo ? 'PO #' : 'INV #')) + escapeHtml(refDocNo) + (rcptTime ? ' · ' + escapeHtml(rcptTime) : '') + '</span>' +
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
        '<span>DOC TYPE: <b>' + (isCred ? 'CREDIT' : (isPo ? 'PO' : 'INVOICE')) + '</b></span>' +
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


  function bindTerminalEvents() {
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
  }

  Object.assign(bridge.fn, {
    updateTerminalClock,
    openTerminalScreen,
    handleTerminalKey,
    startManualDraft,
    renderTerminalUI,
    generateHomeOfficeTasksForShift,
    notifyDeskStateChanged,
    generateNightDropInvoices,
    resolveNightDropByInvoiceNo,
    closeNightDropPanel,
    closeFilingOverlay,
    syncArchiveReceiptsToLedger,
    loadArchiveHistory,
    isCampaignArchiveDay,
    restoreHistoricalArchiveDays,
    generateArchiveData,
    closeInvoiceArchive,
    bindTerminalEvents
  });

  Object.assign(api, {
    loadArchiveHistory,
    handleTerminalKey,
    openTerminalScreen,
    renderTerminalUI,
    updateTerminalClock,
    getTerminalSummarySnapshot,
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
    printSingleStoreCopy,
    printAllDailyStoreCopies,
    seedDummyReceiptsAllDepts
  });
})(window);
