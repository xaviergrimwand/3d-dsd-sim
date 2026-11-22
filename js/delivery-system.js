(function (global) {
  'use strict';

  function createController(ctx) {
    const SoundSystem = global.SoundSystem;
    const { gridToWorld } = global.WarehouseWorld;
    const { scene, world, models, dom, uiState, hooks } = ctx;
    const { dockDoors, sideRollupDoor, doorZ, doorWidth, SIDE_DOOR_DURATION, interactibles } = world;
    const {
      pallets,
      createPallet3D,
      removePallet3D,
      createElectricJackWorld,
      syncDeliveryBoxesVisuals,
      bindDeliveryBoxesToBayPallets,
      createHandCart3D,
      createCreditTote3D,
      createHumanoidDriver3D
    } = models;
    const {
      container,
      deliveryHudTitle,
      invoiceModal,
      closeInvoiceBtn,
      btnSignInvoice,
      btnInvTemp,
      btnInvShort,
      btnInvOver,
      btnInvRefuse,
      invCarrierTitle,
      invSubtitle,
      invVendorNum,
      invDeptNum,
      invDocLbl,
      invDocNum,
      invReceiptNum,
      invCreditReceiptPill,
      invCreditReceiptNum,
      invDocTabs,
      invDeliveryDate,
      invSealStatus,
      invCargoTemp,
      invItemsBody,
      invTotalUnits,
      invTotalCost,
      invDriverSig,
      invReceiverSig
    } = dom;

    // DELIVERY MANIFEST DATA & HELPER FUNCTIONS
    // ==========================================
    const DELIVERY_MANIFEST = [
      {
        id: 'delivery_sidedoor',
        type: 'sidedoor',
        driverName: 'Dave Miller',
        carrier: 'RIDGELINE CHIP CO.',
        subtitle: 'DIRECT STORE DELIVERY (SIDE DOOR HAND CART)',
        etaHour: 6,
        etaMinute: 15,
        etaText: '6:15 AM',
        vendorNo: '154',
        deptNo: '15',
        invoiceNo: '482109',
        docNum: '482109',
        seal: 'VERIFIED INTACT',
        tempZone: 'D',
        temp: 'Ambient (68°F)',
        expectedTemp: '60°-72°F',
        totalCases: 9,
        receiptCreated: false,
        casesScanned: 0,
        tempChecked: true, // Ambient items pass ambient check
        isFinalized: false,
        completed: false,
        refused: false,
        dialogueGreeting: "Hey there! Dave from Ridgeline Chip Co. Got 9 cases of chips and a small 2-item stale return credit. Here's Invoice #482109 and Credit #482110.",
        invoiceItems: [
          { code: '1531', name: 'Original Ridgeline Chips 9oz', qty: 3, physicalQty: 2, price: 3.99, type: 'ambient' },
          { code: '1532', name: 'Smoky BBQ Chips 9oz', qty: 4, physicalQty: 5, price: 3.99, type: 'ambient' },
          { code: '1533', name: 'Sour Cream & Onion Chips 9oz', qty: 2, physicalQty: 2, price: 3.99, type: 'ambient' }
        ],
        creditInvoiceNo: '482110',
        creditItems: [
          { code: '1531', name: 'Original Ridgeline Chips 9oz', qty: 1, price: 3.99, type: 'ambient' },
          { code: '1533', name: 'Sour Cream & Onion Chips 9oz', qty: 1, price: 3.99, type: 'ambient' }
        ]
      },
      {
        id: 'delivery_warehouse',
        type: 'warehouse',
        driverName: 'Marcus Vance',
        carrier: 'DAIRY DISTRIBUTORS / KGS FREIGHT',
        subtitle: 'REFRIGERATED COLD-CHAIN DELIVERY',
        etaHour: 7,
        etaMinute: 30,
        etaText: '7:30 AM',
        vendorNo: '201',
        deptNo: '20',
        invoiceNo: '884012',
        docNum: '884012',
        seal: 'KGS-SEAL-9921 [INTACT]',
        tempZone: 'C',
        temp: 'Chilled (36°F)',
        expectedTemp: '33°F to 38°F',
        totalCases: 8,
        receiptCreated: false,
        casesScanned: 0,
        tempChecked: false,
        isFinalized: false,
        completed: false,
        refused: false,
        dockBay: 4,
        dialogueGreeting: "Morning! Marcus with Trailer #804 at Bay 4 — refrigerated dairy skids inside. Grab the electric walkie to stage them, log temp & receipt on your scanner, and I'll sign off.",
        invoiceItems: [
          { code: '2001', name: 'Whole Milk Gallon', qty: 4, physicalQty: 4, price: 4.29, type: 'refrigerated' },
          { code: '2002', name: '2% Milk Gallon', qty: 4, physicalQty: 4, price: 4.19, type: 'refrigerated' }
        ],
        creditItems: []
      },
      {
        id: 'delivery_vendor_truck',
        type: 'vendor_truck',
        driverName: 'Ray Kowalski',
        carrier: 'BEVERAGE WHOLESALERS',
        subtitle: 'FULL TRUCKLOAD COMMERCIAL VENDOR',
        etaHour: 9,
        etaMinute: 15,
        etaText: '9:15 AM',
        vendorNo: '151',
        deptNo: '15',
        invoiceNo: '551024',
        docNum: '551024',
        seal: 'BW-8832 [VERIFIED]',
        tempZone: 'D',
        temp: 'Ambient (68°F)',
        expectedTemp: '60°-72°F',
        totalCases: 8,
        receiptCreated: false,
        casesScanned: 0,
        tempChecked: true,
        isFinalized: false,
        completed: false,
        refused: false,
        dockBay: 1,
        dialogueGreeting: "How's it going! Ray from Beverage Wholesalers at Bay 1. I'll unload the pallets onto the dock floor with your walkie, then check in Invoice #551024.",
        invoiceItems: [
          { code: '1501', name: 'Cola 12-Pack', qty: 3, physicalQty: 3, price: 5.99, type: 'ambient' },
          { code: '1502', name: 'Lemon-Lime Soda 12pk', qty: 3, physicalQty: 3, price: 5.99, type: 'ambient' },
          { code: '1503', name: 'Root Beer 12-Pack', qty: 2, physicalQty: 2, price: 5.49, type: 'ambient' }
        ],
        creditItems: []
      }
    ];

    // Off-lane waiting points keyed by dock bay; Bays 3 and 4 stay clear of the jack/charger between them.
    const WAREHOUSE_DRIVER_STANDS = {
      1: { x: -8.2, z: 2.6 }, // East side of Dock 1
      2: { x: -1.0, z: 2.6 }, // East side of Dock 2
      3: { x: 1.0, z: 2.8 },  // West side of Dock 3, away from the charger
      4: { x: 12.0, z: 2.8 }  // East side of Dock 4, away from the charger
    };

    uiState.currentInvoiceTab = 'invoice';
    let currentOpenedInvoiceDelivery = null;

    const invPaperSheetEl = document.querySelector('#invoice-modal .inv-paper-sheet');

    function renderInvoiceDocument(delivery, docTab) {
      if (window.DSDReceipts) window.DSDReceipts.enrichDelivery(delivery);
      const creditCount = (delivery.creditItems && delivery.creditItems.length) || 0;
      const hasCreditDoc = creditCount > 0;
      const activeTab = (docTab === 'credit' && hasCreditDoc) ? 'credit' : 'invoice';
      uiState.currentInvoiceTab = activeTab;
      if (invPaperSheetEl) {
        invPaperSheetEl.classList.toggle('credit-paper', activeTab === 'credit');
      }
      invCargoTemp.textContent = delivery.observedTemp || delivery.temp;
      const list = activeTab === 'credit' ? (delivery.creditItems || []) : (delivery.invoiceItems || []);

      if (invVendorNum) invVendorNum.textContent = `${delivery.vendorNo || '—'}`;
      if (invDeptNum) invDeptNum.textContent = `${delivery.deptNo || '—'}`;
      if (invDocLbl) invDocLbl.textContent = activeTab === 'credit' ? 'CREDIT MEMO #' : 'INVOICE #';
      if (activeTab === 'credit') {
        const fallbackPlusOne = (parseInt(delivery.invoiceNo || delivery.docNum || '0', 10) || 0) > 0
          ? String((parseInt(delivery.invoiceNo || delivery.docNum, 10) || 0) + 1).padStart(6, '0')
          : 'N/A';
        invDocNum.textContent = creditCount > 0 ? `${delivery.creditInvoiceNo || fallbackPlusOne}` : 'N/A (NO CREDIT)';
      } else {
        invDocNum.textContent = `${delivery.invoiceNo || delivery.docNum}`;
      }
      if (invReceiptNum) {
        const rNo = delivery.lastReceiptNumber || (delivery.docStates && delivery.docStates.invoiceCreated ? delivery.receiptNumber : '');
        invReceiptNum.textContent = rNo ? `#${rNo}` : 'Pending...';
        invReceiptNum.style.color = rNo ? '#4ade80' : '#fbbf24';
      }
      const hasCredit = creditCount > 0 || Boolean(delivery.docStates && delivery.docStates.creditRequired);
      if (invCreditReceiptPill) {
        invCreditReceiptPill.style.display = hasCredit ? '' : 'none';
      }
      if (invCreditReceiptNum) {
        const cNo = delivery.lastCreditReceiptNumber || '';
        invCreditReceiptNum.textContent = cNo ? `#${cNo}` : 'Pending...';
        invCreditReceiptNum.style.color = cNo ? '#4ade80' : '#fbbf24';
      }

      if (invDocTabs) {
        invDocTabs.style.display = 'flex';
        const creditStateClass = hasCreditDoc ? 'has-credit' : 'empty-credit';
        invDocTabs.innerHTML = `
      <button type="button" class="inv-doc-tab ${activeTab === 'invoice' ? 'active' : ''}" data-inv-tab="invoice">INVOICE</button>
      <button type="button" class="inv-doc-tab ${creditStateClass} ${activeTab === 'credit' ? 'active' : ''}" data-inv-tab="credit" ${hasCreditDoc ? '' : 'disabled title="No Credit Memo on this delivery"'}>CREDIT MEMO</button>
    `;
        invDocTabs.querySelectorAll('[data-inv-tab]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (btn.disabled) return;
            SoundSystem.playPaperRustle();
            renderInvoiceDocument(delivery, btn.getAttribute('data-inv-tab'));
          });
        });
      }

      invItemsBody.innerHTML = '';
      let billedTotalUnits = 0;
      let billedTotalCost = 0;
      let totalUnits = 0;
      let totalCost = 0;
      let hasAnyShort = false;
      const fmtMoney = (amt) => (amt < 0 ? `-$${Math.abs(amt).toFixed(2)}` : `$${amt.toFixed(2)}`);
      if (list.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.innerHTML = `<td colspan="6" style="text-align:center; color:#64748b; font-style:italic; padding:10px 6px;">No credit memo items on this delivery</td>`;
        invItemsBody.appendChild(emptyTr);
      } else {
        list.forEach(item => {
          const tr = document.createElement('tr');
          const pluBadge = item.notScannable ? ' <span style="background:#f59e0b; color:#000; font-size:8.5px; padding:0 3px; border-radius:2px; font-weight:800;">PLU</span>' : '';
          const shortStamp = item.shortageStamped ? '<span class="inv-short-stamp">SHORT</span>' : '';
          const unitCost = Number(item.price || 0);
          const packVal = activeTab === 'credit'
            ? 1
            : (delivery.type === 'warehouse'
              ? 1
              : (Number(item.unitsPerCase) || (window.DSDCatalog && typeof window.DSDCatalog.getUnitsPerCase === 'function' ? window.DSDCatalog.getUnitsPerCase(window.DSDCatalog.getProduct(item.code) || item) : 8)));
          const actualQty = Number(item.qty || 0);
          const origQty = item.billedQty !== undefined ? Number(item.billedQty) : actualQty;
          const isRowShort = activeTab === 'invoice' && Boolean(item.shortageStamped) && origQty !== actualQty;
          if (isRowShort) hasAnyShort = true;

          const signedBilled = activeTab === 'credit' ? -Math.abs(origQty) : origQty;
          const signedCount = activeTab === 'credit' ? -Math.abs(actualQty) : actualQty;
          const billedExt = signedBilled * unitCost;
          const lineCost = signedCount * unitCost;
          billedTotalUnits += signedBilled;
          billedTotalCost += billedExt;
          totalUnits += signedCount;
          totalCost += lineCost;

          const unitsCellHtml = isRowShort
            ? `<span class="arch-num-anchor"><span class="arch-short-billed">${signedBilled}</span><span class="arch-short-hand">${signedCount}</span></span>`
            : `${signedCount}`;
          const costCellHtml = isRowShort
            ? `<span class="arch-num-anchor"><span class="arch-short-billed">${fmtMoney(billedExt)}</span><span class="arch-short-hand">${fmtMoney(lineCost)}</span></span>`
            : fmtMoney(lineCost);

          if (activeTab === 'invoice' && uiState.shortageMode) {
            tr.classList.add('inv-short-pickable');
            tr.title = item.shortageStamped
              ? 'Click row to remove SHORT stamp'
              : 'Click row to open Shortage quantity popup';
          }

          tr.innerHTML = `
        <td style="font-weight: 700; color: #0f172a; font-family: monospace;">${item.code}${pluBadge}</td>
        <td class="num" style="color: #475569; font-weight: 700;">${packVal}</td>
        <td><span class="inv-desc-wrap">${shortStamp}${item.name}</span></td>
        <td class="num" style="font-weight: 700;">${unitsCellHtml}</td>
        <td class="num">$${unitCost.toFixed(2)}</td>
        <td class="num" style="font-weight: 800;">${costCellHtml}</td>
      `;

          if (activeTab === 'invoice' && uiState.shortageMode) {
            tr.addEventListener('click', () => {
              if (item.shortageStamped) {
                if (window.DSDReceipts && typeof window.DSDReceipts.clearInvoiceShortageFlag === 'function') {
                  window.DSDReceipts.clearInvoiceShortageFlag(delivery, item.code);
                }
                SoundSystem.playButtonClick();
                renderInvoiceDocument(delivery, 'invoice');
              } else {
                openShortageQtyModal(delivery, item);
              }
            });
          }
          invItemsBody.appendChild(tr);
        });
      }

      const invShortStampEl = document.getElementById('inv-sheet-short-stamp');
      if (invShortStampEl) {
        invShortStampEl.style.display = hasAnyShort ? 'block' : 'none';
      }

      if (invTotalUnits) {
        if (hasAnyShort && billedTotalUnits !== totalUnits) {
          invTotalUnits.innerHTML = `<span class="arch-num-anchor"><span class="arch-short-billed">${billedTotalUnits}</span><span class="arch-short-hand">${totalUnits}</span></span>`;
        } else {
          invTotalUnits.textContent = `${totalUnits}`;
        }
      }
      if (invTotalCost) {
        if (hasAnyShort && Math.abs(billedTotalCost - totalCost) > 0.001) {
          invTotalCost.innerHTML = `<span class="arch-num-anchor"><span class="arch-short-billed">${fmtMoney(billedTotalCost)}</span><span class="arch-short-hand">${fmtMoney(totalCost)}</span></span>`;
          invTotalCost.style.color = '#0f172a';
        } else {
          invTotalCost.textContent = fmtMoney(totalCost);
          invTotalCost.style.color = totalCost < 0 ? '#991b1b' : '#0f172a';
        }
      }

      const isChilledOrFrozen = Boolean(
        delivery &&
        (
          delivery.tempZone === 'C' ||
          delivery.tempZone === 'F' ||
          (delivery.invoiceItems || []).some((it) => it.type === 'refrigerated' || it.type === 'frozen')
        )
      );
      if (invCargoTemp) {
        invCargoTemp.style.color = !isChilledOrFrozen
          ? '#cbd5e1'
          : (delivery.tempChecked ? (delivery.outOfTemp ? '#f87171' : '#4ade80') : '#f8fafc');
      }
      if (btnInvTemp) {
        btnInvTemp.disabled = !isChilledOrFrozen;
        btnInvTemp.title = isChilledOrFrozen
          ? 'Run Cargo Temperature Audit'
          : 'Not required for non-chilled/frozen deliveries';
        btnInvTemp.classList.toggle('checked', isChilledOrFrozen && Boolean(delivery.tempChecked && !delivery.outOfTemp));
        btnInvTemp.classList.toggle('temp-fail', isChilledOrFrozen && Boolean(delivery.tempChecked && delivery.outOfTemp));
      }
      const invItemsList = (delivery && delivery.invoiceItems) || [];
      const stampedShortCount = invItemsList.filter((it) => Boolean(it.shortageStamped)).length;
      const flaggedOverBoxCount = ((delivery && delivery.physicalBoxes) || []).filter((b) => Boolean(b.overageFlagged)).length;
      if (btnInvShort) {
        btnInvShort.classList.toggle('active-mode', activeTab === 'invoice' && Boolean(uiState.shortageMode));
        btnInvShort.classList.toggle('resolved', !uiState.shortageMode && stampedShortCount > 0);
        btnInvShort.textContent = (activeTab === 'invoice' && uiState.shortageMode)
          ? 'STAMP SHORTAGE (ON)'
          : (stampedShortCount > 0 ? `SHORTAGE (${stampedShortCount})` : 'SHORTAGE');
      }
      if (btnInvOver) {
        const isOverOn = Boolean(uiState.overageDeliveryId && delivery && uiState.overageDeliveryId === delivery.id);
        btnInvOver.classList.toggle('active-mode', isOverOn);
        btnInvOver.classList.toggle('resolved', !isOverOn && flaggedOverBoxCount > 0);
        btnInvOver.textContent = flaggedOverBoxCount > 0 ? `OVERAGE (${flaggedOverBoxCount})` : 'OVERAGE';
      }
      if (btnToggleScannerFromInv) {
        btnToggleScannerFromInv.classList.toggle('scanner-active', Boolean(uiState.scannerModalOpen));
      }
    }

    function openInvoice(delivery) {
      if (delivery && delivery.type === 'warehouse') {
        openWarehouseBol(delivery);
        return;
      }
      if (hooks.getPlayer().hasElectricJack) {
        hooks.showAlert('⚠️ Hands occupied! Drop/park the Electric Jack [Space] before reviewing invoice paperwork.');
        return;
      }
      if (window.DSDReceipts) window.DSDReceipts.enrichDelivery(delivery);
      currentOpenedInvoiceDelivery = delivery;
      if (typeof DeliverySystem !== 'undefined' && DeliverySystem && typeof DeliverySystem.focusDelivery === 'function') {
        DeliverySystem.focusDelivery(delivery.id);
      }
      uiState.invoiceModalOpen = true;
      uiState.shortageMode = false;
      closeShortageQtyModal();
      uiState.overageDeliveryId = null;
      const pillEl = document.getElementById('overage-mode-pill');
      if (pillEl) pillEl.style.display = 'none';
      if (document.exitPointerLock) document.exitPointerLock();

      invCarrierTitle.textContent = delivery.carrier;
      invSubtitle.textContent = delivery.subtitle;
      if (invDeliveryDate) {
        let dateText = delivery.deliveryDate || '';
        if (!dateText && window.ShiftClock && typeof window.ShiftClock.getTimeSnapshot === 'function') {
          const snap = window.ShiftClock.getTimeSnapshot();
          const monIdx = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(String(snap.monthName || 'FEB').toUpperCase());
          const mm = String((monIdx >= 0 ? monIdx : 1) + 1).padStart(2, '0');
          const dd = String(snap.dayOfMonth || '01').padStart(2, '0');
          const yy = String(snap.year || 1996).slice(-2);
          dateText = `${mm}/${dd}/${yy}`;
        }
        invDeliveryDate.textContent = dateText || '02/01/96';
      }
      if (invSealStatus) invSealStatus.textContent = delivery.seal || 'VERIFIED';
      invCargoTemp.textContent = delivery.observedTemp || delivery.temp;
      invDriverSig.textContent = `${delivery.driverName}`;
      if (invReceiverSig) {
        invReceiverSig.textContent = 'Awaiting Sign-Off';
        invReceiverSig.style.color = '#64748b';
      }

      renderInvoiceDocument(delivery, delivery.preferredInvoiceTab || 'invoice');
      syncDeliveryBoxesVisuals(delivery);

      invoiceModal.classList.add('active');
      container.classList.add('invoice-open');
      hooks.updateLockHintDisplay();
      SoundSystem.playPaperRustle();
    }

    function closeInvoice(preserveOverage) {
      uiState.invoiceModalOpen = false;
      uiState.shortageMode = false;
      closeShortageQtyModal();
      if (!preserveOverage) {
        uiState.overageDeliveryId = null;
        const pillEl = document.getElementById('overage-mode-pill');
        if (pillEl) pillEl.style.display = 'none';
      }
      invoiceModal.classList.remove('active');
      container.classList.remove('invoice-open');
      hooks.updateLockHintDisplay();
      SoundSystem.playButtonClick();
    }

    let currentOpenedBolDelivery = null;
    let bolSigningInFlight = false;
    const bolModal = document.getElementById('bol-modal');
    const closeBolBtn = document.getElementById('close-bol-btn');
    const btnSignBol = document.getElementById('btn-sign-bol');

    function formatDocDateShort(delivery) {
      if (delivery && delivery.deliveryDate) return delivery.deliveryDate;
      if (window.ShiftClock && typeof window.ShiftClock.getTimeSnapshot === 'function') {
        const snap = window.ShiftClock.getTimeSnapshot();
        const monIdx = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
          .indexOf(String(snap.monthName || 'FEB').toUpperCase());
        const mm = String((monIdx >= 0 ? monIdx : 1) + 1).padStart(2, '0');
        const dd = String(snap.dayOfMonth || '01').padStart(2, '0');
        const yy = String(snap.year || 1996).slice(-2);
        return `${mm}/${dd}/${yy}`;
      }
      return '02/01/96';
    }

    function openWarehouseBol(delivery) {
      if (!delivery) return;
      if (hooks.getPlayer().hasElectricJack) {
        hooks.showAlert('⚠️ Hands occupied! Drop/park the Electric Jack [Space] before signing the Bill of Lading.');
        return;
      }
      currentOpenedBolDelivery = delivery;
      bolSigningInFlight = false;
      if (typeof DeliverySystem !== 'undefined' && DeliverySystem && typeof DeliverySystem.focusDelivery === 'function') {
        DeliverySystem.focusDelivery(delivery.id);
      }
      uiState.bolModalOpen = true;
      if (document.exitPointerLock) document.exitPointerLock();

      const subtitleEl = document.getElementById('bol-subtitle');
      const carrierEl = document.getElementById('bol-carrier-title');
      const deptEl = document.getElementById('bol-dept-num');
      const vendorEl = document.getElementById('bol-vendor-num');
      const docEl = document.getElementById('bol-doc-num');
      const baySealEl = document.getElementById('bol-bay-seal');
      const dateEl = document.getElementById('bol-delivery-date');
      const palletCntEl = document.getElementById('bol-pallet-count');
      const zoneStripEl = document.getElementById('bol-zone-breakdown');
      const itemsBodyEl = document.getElementById('bol-items-body');
      const totalCasesEl = document.getElementById('bol-total-cases');
      const totalCostEl = document.getElementById('bol-total-cost');
      const driverSigEl = document.getElementById('bol-driver-sig');
      const receiverSigEl = document.getElementById('bol-receiver-sig');

      if (subtitleEl) subtitleEl.textContent = `${delivery.carrier || 'APEX LOGISTICS'} · DEPT ${delivery.deptNo || '01'} · BAY ${delivery.dockBay || '4'}`;
      if (carrierEl) carrierEl.textContent = delivery.carrier || 'APEX LOGISTICS';
      if (deptEl) deptEl.textContent = delivery.deptNo || '01';
      if (vendorEl) vendorEl.textContent = delivery.vendorNo || '011';
      if (docEl) docEl.textContent = delivery.invoiceNo || delivery.docNum || '901100';
      if (baySealEl) baySealEl.textContent = `BAY ${delivery.dockBay || '4'} · ${delivery.seal || 'VERIFIED'}`;
      if (dateEl) dateEl.textContent = formatDocDateShort(delivery);

      const specs = Array.isArray(delivery.palletSpecs) ? delivery.palletSpecs : [];
      const totalPallets = delivery.totalPallets || specs.length || 0;
      const stagedCount = delivery.stagedCount !== undefined ? delivery.stagedCount : totalPallets;
      if (palletCntEl) palletCntEl.textContent = `${stagedCount} / ${totalPallets} ZONES OK ✓`;

      const counts = { F: 0, C: 0, D: 0 };
      specs.forEach((sp) => {
        const z = sp && sp.targetZone ? sp.targetZone : 'D';
        counts[z] = (counts[z] || 0) + 1;
      });
      if (zoneStripEl) {
        const badges = [];
        if (counts.F > 0) badges.push(`<span class="bol-zone-badge zone-f">❄️ FROZEN (F): ${counts.F} PALLETS ✓</span>`);
        if (counts.C > 0) badges.push(`<span class="bol-zone-badge zone-c">🧊 CHILLED (C): ${counts.C} PALLETS ✓</span>`);
        if (counts.D > 0) badges.push(`<span class="bol-zone-badge zone-d">📦 DRY (D): ${counts.D} PALLETS ✓</span>`);
        if (!badges.length) badges.push(`<span class="bol-zone-badge zone-d">📦 DEPT 01 PALLETS VERIFIED ✓</span>`);
        zoneStripEl.innerHTML = badges.join('');
      }

      let totalCases = 0;
      let totalCost = 0;
      if (itemsBodyEl) {
        itemsBodyEl.innerHTML = '';
        (delivery.invoiceItems || []).forEach((it) => {
          const q = Number(it.qty) || 0;
          const p = Number(it.price) || 0;
          const ext = q * p;
          totalCases += q;
          totalCost += ext;
          const tr = document.createElement('tr');
          tr.innerHTML = `
        <td style="font-weight:700; color:#0f172a; font-family:monospace;">${it.code || ''}</td>
        <td>${it.name || 'Freight Item'}</td>
        <td class="num" style="font-weight:700;">${q}</td>
        <td class="num">$${p.toFixed(2)}</td>
        <td class="num" style="font-weight:800;">$${ext.toFixed(2)}</td>
      `;
          itemsBodyEl.appendChild(tr);
        });
      }
      if (totalCasesEl) totalCasesEl.textContent = String(totalCases);
      if (totalCostEl) totalCostEl.textContent = `$${totalCost.toFixed(2)}`;
      if (driverSigEl) driverSigEl.textContent = delivery.driverName || 'Driver Signed';
      if (receiverSigEl) {
        receiverSigEl.textContent = 'Awaiting BOL Sign-Off';
        receiverSigEl.style.color = '#64748b';
      }
      if (btnSignBol) {
        btnSignBol.disabled = false;
        btnSignBol.classList.remove('signed');
      }

      if (bolModal) bolModal.classList.add('active');
      hooks.updateLockHintDisplay();
      SoundSystem.playPaperRustle();
    }

    function closeWarehouseBol() {
      uiState.bolModalOpen = false;
      bolSigningInFlight = false;
      if (bolModal) bolModal.classList.remove('active');
      hooks.updateLockHintDisplay();
      SoundSystem.playButtonClick();
    }

    if (closeBolBtn) {
      closeBolBtn.addEventListener('click', closeWarehouseBol);
    }
    if (btnSignBol) {
      btnSignBol.addEventListener('click', () => {
        if (bolSigningInFlight) return;
        const d = currentOpenedBolDelivery || DeliverySystem.activeDelivery;
        if (!d) return;
        bolSigningInFlight = true;
        btnSignBol.disabled = true;
        SoundSystem.playPenSign();
        const receiverSigEl = document.getElementById('bol-receiver-sig');
        if (receiverSigEl) {
          receiverSigEl.textContent = 'Receiver Signed ✓';
          receiverSigEl.style.color = '#15803d';
        }
        btnSignBol.classList.add('signed');
        setTimeout(() => {
          closeWarehouseBol();
          btnSignBol.classList.remove('signed');
          DeliverySystem.handleInvoiceSigned(d);
        }, 550);
      });
    }

    let activeShortageTarget = null;

    function resolveShortageCaseStep(delivery, item) {
      if (delivery && delivery.type === 'warehouse') return 1;
      const explicit = Number(item && item.unitsPerCase);
      if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
      if (window.DSDCatalog && typeof window.DSDCatalog.getUnitsPerCase === 'function') {
        const prod = typeof window.DSDCatalog.getProduct === 'function' ? window.DSDCatalog.getProduct(item && item.code) : null;
        return Math.max(1, window.DSDCatalog.getUnitsPerCase(prod || item));
      }
      return 8;
    }

    function stepShortageModalQty(dir) {
      if (!activeShortageTarget) return;
      const inputEl = document.getElementById('sqm-qty-input');
      const errEl = document.getElementById('sqm-error');
      if (!inputEl) return;
      const stepSize = Math.max(1, Number(activeShortageTarget.stepSize) || 1);
      const maxQty = Math.max(0, Number(activeShortageTarget.billedQty) || 0);
      const parsed = parseInt(inputEl.value, 10);
      const cur = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
      let next;
      if (dir < 0) {
        if (cur <= 0) {
          next = 0;
        } else if (cur % stepSize === 0) {
          next = Math.max(0, cur - stepSize);
        } else {
          next = Math.max(0, Math.floor(cur / stepSize) * stepSize);
        }
      } else {
        if (cur % stepSize === 0) {
          next = Math.min(maxQty, cur + stepSize);
        } else {
          next = Math.min(maxQty, Math.ceil(cur / stepSize) * stepSize);
        }
      }
      inputEl.value = String(next);
      if (errEl) errEl.textContent = '';
    }

    function openShortageQtyModal(delivery, item) {
      if (!delivery || !item) return;
      const modal = document.getElementById('shortage-qty-modal');
      const codeEl = document.getElementById('sqm-item-code');
      const billedEl = document.getElementById('sqm-billed-qty');
      const nameEl = document.getElementById('sqm-item-name');
      const inputEl = document.getElementById('sqm-qty-input');
      const errEl = document.getElementById('sqm-error');
      if (!modal || !inputEl) return;

      const stepSize = resolveShortageCaseStep(delivery, item);
      const billedQty = item.billedQty !== undefined ? Number(item.billedQty) : Number(item.qty || 0);
      activeShortageTarget = {
        delivery: delivery,
        code: String(item.code),
        stepSize: stepSize,
        billedQty: billedQty
      };
      if (codeEl) codeEl.textContent = 'ITEM #' + String(item.code || '');
      if (billedEl) billedEl.textContent = 'BILLED: ' + billedQty + 'u (' + stepSize + '/cs)';
      if (nameEl) nameEl.textContent = String(item.name || 'Item');
      if (errEl) errEl.textContent = '';
      inputEl.min = '0';
      inputEl.max = String(Math.max(0, billedQty));
      inputEl.step = String(stepSize);
      inputEl.value = String(Number(item.qty || 0));

      uiState.shortageModalOpen = true;
      modal.classList.add('active');
      SoundSystem.playButtonClick();
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 0);
    }

    function closeShortageQtyModal() {
      const modal = document.getElementById('shortage-qty-modal');
      if (modal) modal.classList.remove('active');
      const errEl = document.getElementById('sqm-error');
      if (errEl) errEl.textContent = '';
      uiState.shortageModalOpen = false;
      activeShortageTarget = null;
    }

    function submitShortageQtyModal() {
      if (!activeShortageTarget) {
        closeShortageQtyModal();
        return;
      }
      const inputEl = document.getElementById('sqm-qty-input');
      const errEl = document.getElementById('sqm-error');
      const rawStr = String(inputEl ? inputEl.value : '').trim();
      const stepSize = Math.max(1, Number(activeShortageTarget.stepSize) || 1);
      const maxQty = Math.max(0, Number(activeShortageTarget.billedQty) || 0);

      if (!/^\d+$/.test(rawStr)) {
        SoundSystem.playErrorBuzzer();
        if (errEl) errEl.textContent = `Enter a whole-number multiple of ${stepSize} (0 to ${maxQty})`;
        return;
      }
      const val = parseInt(rawStr, 10);
      if (isNaN(val) || val < 0 || val > maxQty || (val % stepSize !== 0)) {
        SoundSystem.playErrorBuzzer();
        if (errEl) {
          errEl.textContent = val > maxQty
            ? `Cannot exceed billed qty (${maxQty})`
            : `Must be a multiple of case size (${stepSize})`;
        }
        return;
      }
      const targetDeliv = activeShortageTarget.delivery;
      const targetCode = activeShortageTarget.code;
      if (window.DSDReceipts && typeof window.DSDReceipts.stampInvoiceShortageQty === 'function') {
        const res = window.DSDReceipts.stampInvoiceShortageQty(targetDeliv, targetCode, val);
        if (res && !res.ok) {
          SoundSystem.playErrorBuzzer();
          if (errEl) errEl.textContent = res.error || 'Invalid shortage quantity';
          return;
        }
      }
      closeShortageQtyModal();
      SoundSystem.playPenSign();
      renderInvoiceDocument(targetDeliv, 'invoice');
    }

    const sqmCloseBtn = document.getElementById('sqm-close-btn');
    if (sqmCloseBtn) {
      sqmCloseBtn.addEventListener('click', () => {
        SoundSystem.playButtonClick();
        closeShortageQtyModal();
      });
    }
    const sqmMinusBtn = document.getElementById('sqm-minus-btn');
    if (sqmMinusBtn) {
      sqmMinusBtn.addEventListener('click', () => {
        stepShortageModalQty(-1);
        SoundSystem.playButtonClick();
      });
    }
    const sqmPlusBtn = document.getElementById('sqm-plus-btn');
    if (sqmPlusBtn) {
      sqmPlusBtn.addEventListener('click', () => {
        stepShortageModalQty(1);
        SoundSystem.playButtonClick();
      });
    }
    const sqmZeroBtn = document.getElementById('sqm-zero-btn');
    if (sqmZeroBtn) {
      sqmZeroBtn.addEventListener('click', () => {
        const inputEl = document.getElementById('sqm-qty-input');
        const errEl = document.getElementById('sqm-error');
        if (inputEl) inputEl.value = '0';
        if (errEl) errEl.textContent = '';
        SoundSystem.playButtonClick();
      });
    }
    const sqmApplyBtn = document.getElementById('sqm-apply-btn');
    if (sqmApplyBtn) {
      sqmApplyBtn.addEventListener('click', submitShortageQtyModal);
    }
    const sqmQtyInput = document.getElementById('sqm-qty-input');
    if (sqmQtyInput) {
      sqmQtyInput.addEventListener('input', () => {
        const errEl = document.getElementById('sqm-error');
        if (errEl) errEl.textContent = '';
      });
      sqmQtyInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          ev.stopPropagation();
          stepShortageModalQty(1);
          SoundSystem.playButtonClick();
        } else if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          ev.stopPropagation();
          stepShortageModalQty(-1);
          SoundSystem.playButtonClick();
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          submitShortageQtyModal();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          SoundSystem.playButtonClick();
          closeShortageQtyModal();
        }
      });
    }

    function enterOverageFlagMode(d) {
      if (!d) return;
      uiState.shortageMode = false;
      closeShortageQtyModal();
      uiState.overageDeliveryId = d.id;
      closeInvoice(true);
      const pillEl = document.getElementById('overage-mode-pill');
      const txtEl = document.getElementById('overage-mode-text');
      if (txtEl) {
        txtEl.textContent = `🚩 OVERAGE MODE (${d.carrier}) — Aim & click excess case(s) on Cart/Pallet`;
      }
      if (pillEl) pillEl.style.display = 'flex';
      hooks.updateLockHintDisplay();
      hooks.showNotification(`🚩 Overage Mode active: click any excess case on ${d.carrier}'s cart/pallet to flag it.`);
    }

    function exitOverageFlagMode(reopenClipboard) {
      const prevId = uiState.overageDeliveryId;
      uiState.overageDeliveryId = null;
      const pillEl = document.getElementById('overage-mode-pill');
      if (pillEl) pillEl.style.display = 'none';
      hooks.updateLockHintDisplay();
      SoundSystem.playButtonClick();
      if (reopenClipboard && prevId) {
        const s = DeliverySystem.getSessionForDelivery(prevId);
        const targetDeliv = (s && s.delivery) || DeliverySystem.activeDelivery;
        if (targetDeliv) openInvoice(targetDeliv);
      }
    }

    const btnOverageDone = document.getElementById('btn-overage-done');
    if (btnOverageDone) {
      btnOverageDone.addEventListener('click', () => {
        exitOverageFlagMode(true);
      });
    }

    const btnToggleScannerFromInv = document.getElementById('btn-toggle-scanner-from-inv');
    if (btnToggleScannerFromInv) {
      btnToggleScannerFromInv.addEventListener('click', () => {
        hooks.toggleScanner();
      });
    }

    closeInvoiceBtn.addEventListener('click', () => closeInvoice(false));
    if (btnInvTemp) {
      btnInvTemp.addEventListener('click', () => {
        const d = currentOpenedInvoiceDelivery || DeliverySystem.activeDelivery;
        if (!d) return;
        const isColdChain = d.tempZone === 'C' || d.tempZone === 'F' ||
          (d.invoiceItems || []).some((it) => it.type === 'refrigerated' || it.type === 'frozen');
        if (!isColdChain) return;
        if (window.DSDReceipts && typeof window.DSDReceipts.runTempProbeForDelivery === 'function') {
          window.DSDReceipts.runTempProbeForDelivery(d);
        } else {
          d.tempChecked = true;
          SoundSystem.playSuccessChime();
        }
        invCargoTemp.textContent = d.observedTemp || d.temp;
        renderInvoiceDocument(d, uiState.currentInvoiceTab);
      });
    }
    if (btnInvShort) {
      btnInvShort.addEventListener('click', () => {
        const d = currentOpenedInvoiceDelivery || DeliverySystem.activeDelivery;
        if (!d) return;
        if (uiState.currentInvoiceTab === 'credit') {
          uiState.currentInvoiceTab = 'invoice';
          uiState.shortageMode = true;
        } else {
          uiState.shortageMode = !uiState.shortageMode;
        }
        closeShortageQtyModal();
        SoundSystem.playButtonClick();
        if (uiState.shortageMode) {
          hooks.showNotification('📝 Shortage Mode: click any invoice row to enter actual received quantity.');
        }
        renderInvoiceDocument(d, 'invoice');
      });
    }
    if (btnInvOver) {
      btnInvOver.addEventListener('click', () => {
        const d = currentOpenedInvoiceDelivery || DeliverySystem.activeDelivery;
        if (!d) return;
        if (uiState.overageDeliveryId === d.id) {
          exitOverageFlagMode(false);
        } else {
          enterOverageFlagMode(d);
        }
      });
    }
    if (btnInvRefuse) {
      btnInvRefuse.addEventListener('click', () => {
        const d = currentOpenedInvoiceDelivery || DeliverySystem.activeDelivery;
        if (!d) return;
        closeInvoice();
        if (window.DSDReceipts && typeof window.DSDReceipts.refuseDelivery === 'function') {
          window.DSDReceipts.refuseDelivery(d);
        } else {
          DeliverySystem.handleDeliveryRefused(d);
        }
      });
    }
    btnSignInvoice.addEventListener('click', () => {
      const d = currentOpenedInvoiceDelivery || DeliverySystem.activeDelivery;
      if (d) {
        if (!d.receiptCreated) {
          SoundSystem.playErrorBuzzer();
          const hasCred = Boolean(d.docStates && d.docStates.creditRequired);
          const invDone = Boolean(d.docStates && d.docStates.invoiceCreated);
          const credDone = Boolean(d.docStates && d.docStates.creditCreated);
          if (hasCred && invDone && !credDone) {
            alert(`⚠️ CREDIT MEMO STILL PENDING!\n\nMain Invoice #${d.invoiceNo} is receipted, but you still need to check in Credit Memo #${d.creditInvoiceNo} on the Handheld Scanner [F] (using [NEG] mode) and press [DONE] before signing.`);
          } else if (hasCred && credDone && !invDone) {
            alert(`⚠️ MAIN INVOICE STILL PENDING!\n\nCredit Memo #${d.creditInvoiceNo} is receipted, but you still need to check in Main Invoice #${d.invoiceNo} on the Handheld Scanner [F] and press [DONE] before signing.`);
          } else {
            alert(`⚠️ DSD CHECK-IN INCOMPLETE!\n\nStandard Receiving Protocol requires opening your Handheld Scanner [F] to create a digital receipt (Vendor #${d.vendorNo}, Dept #${d.deptNo}, Invoice #${d.invoiceNo || d.docNum}) and pressing [DONE] before signing.`);
          }
          return;
        }
        const nonOverageBoxes = (d.physicalBoxes || []).filter((b) => !b.overageFlagged);
        const scannedNonOver = nonOverageBoxes.filter((b) => b.scanned).length;
        if (scannedNonOver < nonOverageBoxes.length) {
          SoundSystem.playErrorBuzzer();
          alert(`⚠️ CARGO NOT FULLY SCANNED!\n\nOnly ${scannedNonOver} of ${nonOverageBoxes.length} unflagged cases verified. Aim your scanner [F] at the shipment and press [SCAN] (or key PLU + Qty) — or flag any excess cases under [OVERAGE].`);
          return;
        }
      }

      SoundSystem.playPenSign();
      if (invReceiverSig) {
        invReceiverSig.textContent = 'Receiver Signed';
        invReceiverSig.style.color = '#15803d';
      }
      btnSignInvoice.classList.add('signed');

      setTimeout(() => {
        closeInvoice();
        btnSignInvoice.classList.remove('signed');
        DeliverySystem.handleInvoiceSigned(d);
      }, 900);
    });

    function openSideDoor() {
      if (!sideRollupDoor.isOpen) {
        sideRollupDoor.isOpen = true;
        const remainingTravel = (1.0 - sideRollupDoor.currentProgress);
        const motorTime = Math.max(0.4, remainingTravel * SIDE_DOOR_DURATION);
        SoundSystem.playDoorMotor(motorTime);
      }
    }

    function closeSideDoor() {
      if (sideRollupDoor.isOpen) {
        sideRollupDoor.isOpen = false;
        const remainingTravel = sideRollupDoor.currentProgress;
        const motorTime = Math.max(0.4, remainingTravel * SIDE_DOOR_DURATION);
        SoundSystem.playDoorMotor(motorTime);
      }
    }


    // ==========================================
    // AUTONOMOUS VENDOR DELIVERY SYSTEM & STATE MACHINE
    // ==========================================
    // Matches the 2D simulator's Pending Deliveries icons (drawCartSymbol / drawFilledTruckSymbol / drawOpenTruckSymbol)
    function getDeliveryTypeSvg(modeType) {
      if (modeType === 'sidedoor') {
        return '<svg width="18" height="18" viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="19" x2="7" y2="3"/><path d="M7 3 Q7 0.5 10 0.5"/><line x1="8" y1="11" x2="17" y2="15"/><line x1="9" y1="19" x2="19" y2="19"/><rect x="12" y="13" width="7" height="6" fill="currentColor" stroke="none"/><rect x="13" y="8" width="6" height="5" fill="currentColor" stroke="none"/><circle cx="9" cy="21" r="2.2" fill="currentColor" stroke="none"/><circle cx="18" cy="21" r="2.2" fill="currentColor" stroke="none"/></svg>';
      }
      if (modeType === 'warehouse') {
        return '<svg width="22" height="15" viewBox="0 0 32 20" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="3" width="20" height="11"/><rect x="2" y="6" width="8" height="8"/><circle cx="5" cy="16" r="2.6" stroke="none"/><circle cx="25" cy="16" r="2.6" stroke="none"/></svg>';
      }
      return '<svg width="22" height="15" viewBox="0 0 32 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="11" y="3" width="16" height="11"/><rect x="3" y="6" width="8" height="8" fill="currentColor" stroke="none"/><circle cx="6" cy="16" r="2.6" fill="currentColor" stroke="none"/><circle cx="23" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>';
    }

    const pendingDeliveriesPanel = document.getElementById('pending-deliveries-panel');
    const pendingDeliveriesList = document.getElementById('pending-deliveries-list');
    const pendingToggleBtn = document.getElementById('pending-toggle-btn');

    function togglePendingDeliveriesPanel(forceCollapsed) {
      if (!pendingDeliveriesPanel || !pendingToggleBtn) return;
      const collapsed = (typeof forceCollapsed === 'boolean')
        ? forceCollapsed
        : !pendingDeliveriesPanel.classList.contains('collapsed');
      pendingDeliveriesPanel.classList.toggle('collapsed', collapsed);
      pendingToggleBtn.textContent = collapsed ? '▼' : '▲';
      if (typeof forceCollapsed !== 'boolean') {
        SoundSystem.playButtonClick();
      }
    }

    if (pendingToggleBtn && pendingDeliveriesPanel) {
      pendingToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePendingDeliveriesPanel();
      });
      const pdHeader = pendingDeliveriesPanel.querySelector('.pd-header');
      if (pdHeader) {
        pdHeader.addEventListener('click', (e) => {
          if (e.target && e.target.closest && e.target.closest('#pending-toggle-btn')) return;
          togglePendingDeliveriesPanel();
        });
      }
    }

    function renderPendingDeliveriesPanel() {
      if (!pendingDeliveriesList) return;
      const snap = window.ShiftClock ? window.ShiftClock.getTimeSnapshot() : { hour: 6, minute: 0 };
      const nowMins = snap.hour * 60 + snap.minute;
      const activeDel = (typeof DeliverySystem !== 'undefined' && DeliverySystem) ? DeliverySystem.activeDelivery : null;
      const activeSt = (typeof DeliverySystem !== 'undefined' && DeliverySystem) ? DeliverySystem.state : 'IDLE';

      const sourceRows = (window.WarehouseTrucks && typeof window.WarehouseTrucks.getScheduleRows === 'function')
        ? window.WarehouseTrucks.getScheduleRows()
        : DELIVERY_MANIFEST;
      const titleTxtEl = pendingDeliveriesPanel ? pendingDeliveriesPanel.querySelector('.pd-title-txt') : null;
      const barSummaryEl = pendingDeliveriesPanel ? pendingDeliveriesPanel.querySelector('.pd-bar-summary') : null;
      const alertDotEl = pendingDeliveriesPanel ? pendingDeliveriesPanel.querySelector('.pd-alert-dot') : null;

      const allOpen = sourceRows.filter((d) => !d.completed && !d.refused);
      if (titleTxtEl) {
        titleTxtEl.textContent = `PENDING DELIVERIES (${allOpen.length})`;
      }

      const visible = allOpen
        .slice()
        .sort((a, b) => ((a.etaHour * 60 + a.etaMinute) - (b.etaHour * 60 + b.etaMinute)))
        .slice(0, 4);

      if (barSummaryEl || alertDotEl) {
        let lateCount = 0;
        let firstLate = null;
        let firstArrived = null;
        allOpen.forEach((d) => {
          const etaMins = (d.etaHour || 6) * 60 + (d.etaMinute || 0);
          const session = (typeof DeliverySystem !== 'undefined' && DeliverySystem && typeof DeliverySystem.getSessionForDelivery === 'function')
            ? DeliverySystem.getSessionForDelivery(d.id)
            : null;
          const isWhActive = Boolean(d.type === 'warehouse' && (d.status === 'ARRIVED' || d.status === 'UNLOADING'));
          const isSessionActive = Boolean(session && session.state !== 'FINISHED');
          const isWaitingOutside = Boolean(session && session.state === 'OUTSIDE_WAITING');
          const isLate = (isWaitingOutside && nowMins > etaMins + 15) || (!isWhActive && !isSessionActive && nowMins > etaMins + 15);
          if (isLate) {
            lateCount++;
            if (!firstLate) firstLate = d;
          } else if ((isWhActive || isSessionActive) && !firstArrived) {
            firstArrived = d;
          }
        });
        if (barSummaryEl) {
          barSummaryEl.classList.remove('is-urgent', 'is-arrived');
          let summaryText = 'No pending deliveries';
          let summaryDelivery = null;
          if (lateCount > 0 && firstLate) {
            summaryText = `${lateCount} LATE · ${firstLate.carrier || 'TRUCK'}`;
            summaryDelivery = firstLate;
            barSummaryEl.classList.add('is-urgent');
          } else if (firstArrived) {
            summaryText = `AT DOOR · ${firstArrived.carrier || 'DELIVERY'}`;
            summaryDelivery = firstArrived;
            barSummaryEl.classList.add('is-arrived');
          } else if (visible.length > 0) {
            const nxt = visible[0];
            summaryText = `NEXT ${nxt.etaText || '6:00 AM'} · ${nxt.carrier || 'DELIVERY'}`;
            summaryDelivery = nxt;
          }
          const barIcoEl = barSummaryEl.querySelector('.pd-bar-ico');
          const barTxtEl = barSummaryEl.querySelector('.pd-bar-txt');
          if (barIcoEl && barTxtEl) {
            if (summaryDelivery && summaryDelivery.type) {
              const svgMarkup = getDeliveryTypeSvg(summaryDelivery.type);
              if (barIcoEl.dataset.delivType !== summaryDelivery.type) {
                barIcoEl.dataset.delivType = summaryDelivery.type;
                barIcoEl.innerHTML = svgMarkup;
              }
              barIcoEl.classList.add('active');
            } else {
              barIcoEl.dataset.delivType = '';
              barIcoEl.innerHTML = '';
              barIcoEl.classList.remove('active');
            }
            barTxtEl.textContent = summaryText;
          } else {
            barSummaryEl.textContent = summaryText;
          }
        }
        if (alertDotEl) {
          alertDotEl.classList.toggle('active', lateCount > 0);
        }
      }

      if (!visible.length) {
        pendingDeliveriesList.innerHTML = '<div class="pd-row" style="justify-content:center; color:#86efac;">No pending deliveries</div>';
        return;
      }

      pendingDeliveriesList.innerHTML = visible.map((d) => {
        const etaMins = (d.etaHour || 6) * 60 + (d.etaMinute || 0);
        const session = (typeof DeliverySystem !== 'undefined' && DeliverySystem && typeof DeliverySystem.getSessionForDelivery === 'function')
          ? DeliverySystem.getSessionForDelivery(d.id)
          : null;
        const isWh = d.type === 'warehouse';
        const isWhActive = Boolean(isWh && (d.status === 'ARRIVED' || d.status === 'UNLOADING'));
        const isSessionActive = Boolean(session && session.state !== 'FINISHED');
        const isActive = isWhActive || isSessionActive;
        const isWaitingOutside = Boolean(session && session.state === 'OUTSIDE_WAITING');
        const diff = etaMins - nowMins;

        let rowClass = 'pd-row';
        if (isWaitingOutside && nowMins > etaMins + 15) {
          rowClass += ' overdue';
        } else if (isActive) {
          rowClass += ' arrived';
        } else if (nowMins > etaMins + 15) {
          rowClass += ' overdue';
        } else if (diff <= 10) {
          rowClass += ' due-soon';
        }

        let doorTag = '-';
        if (session) {
          doorTag = session.doorKey;
        } else if (isActive) {
          if (d.type === 'sidedoor') doorTag = 'SD';
          else if (d.dockBay) doorTag = 'D' + d.dockBay;
        }

        let etaLabel = d.etaText || '6:00 AM';
        if (isWaitingOutside) {
          etaLabel = 'WAITNG';
        } else if (isWhActive) {
          etaLabel = `${d.stagedCount || 0}/${d.totalPallets || 0}`;
        } else if (isSessionActive) {
          etaLabel = 'HERE';
        } else if (d.queuedAtGate || nowMins >= etaMins) {
          etaLabel = 'QUEUED';
        }

        return `<div class="${rowClass}" title="${d.driverName} — ${d.carrier} (${d.etaText || ''})">` +
          `<span class="pd-eta">${etaLabel}</span>` +
          `<span class="pd-icon">${getDeliveryTypeSvg(d.type)}</span>` +
          `<span class="pd-supplier">${d.carrier}</span>` +
          `<span class="pd-door">${doorTag}</span>` +
          `</div>`;
      }).join('');
    }

    uiState.doorQueueModalOpen = false;
    const doorQueueModal = document.getElementById('door-queue-modal');
    const dqListEl = document.getElementById('dq-list');
    const dqSlotSummaryEl = document.getElementById('dq-slot-summary');
    const dqPriorityWarnEl = document.getElementById('dq-priority-warn');
    const dqCloseBtn = document.getElementById('dq-close-btn');
    const dqToggleAllBtn = document.getElementById('dq-toggle-all-btn');
    const dqLetAllBtn = document.getElementById('dq-let-all-btn');
    const dqLetSelectedBtn = document.getElementById('dq-let-selected-btn');

    const DOOR_SLOT_INDEX = { SD: 0, D1: 1, D2: 2, D3: 3, D4: 4 };
    const OUTSIDE_WAIT_POSITIONS = [
      { x: 15.65, z: 8.40 }, // Slot 0 (SD + cart)
      { x: 14.35, z: 7.65 }, // Slot 1 (D1)
      { x: 14.35, z: 9.15 }, // Slot 2 (D2)
      { x: 15.55, z: 7.35 }, // Slot 3 (D3)
      { x: 15.55, z: 9.45 }  // Slot 4 (D4)
    ];
    const INSIDE_CHECKIN_POSITIONS = [
      { x: 10.60, z: 8.40 }, // Slot 0 (SD + cart)
      { x: 11.00, z: 7.10 }, // Slot 1 (D1)
      { x: 11.00, z: 9.50 }, // Slot 2 (D2)
      { x: 9.50, z: 7.00 }, // Slot 3 (D3)
      { x: 9.50, z: 9.60 }  // Slot 4 (D4)
    ];

    const DeliverySystem = {
      sessions: [],
      focusedDeliveryId: null,
      selectedWaitingIds: new Set(),

      get activeDelivery() {
        const s = this.getFocusedSession();
        return s ? s.delivery : null;
      },
      set activeDelivery(d) {
        this.focusedDeliveryId = d ? d.id : null;
      },
      get activeDriver() {
        const s = this.getFocusedSession();
        return s ? s.driver : null;
      },
      get activeCart() {
        const s = this.getFocusedSession();
        return s ? s.cart : null;
      },
      get state() {
        const s = this.getFocusedSession();
        if (s) return s.state;
        const allDone = DELIVERY_MANIFEST.length > 0 && DELIVERY_MANIFEST.every((d) => d.completed || d.refused);
        return allDone ? 'FINISHED' : 'WAITING_SCHEDULE';
      },

      getSessionForDelivery: function (deliveryId) {
        return this.sessions.find((s) => s.delivery && s.delivery.id === deliveryId) || null;
      },

      getSessionForDoor: function (doorKey) {
        return this.sessions.find((s) => s.doorKey === doorKey) || null;
      },

      getSessionForBay: function (bayId) {
        return this.getSessionForDoor('D' + bayId);
      },

      getWaitingOutsideSessions: function () {
        return this.sessions.filter((s) => s.state === 'OUTSIDE_WAITING');
      },

      isSessionInSideDoorFrame: function (s) {
        if (!s || !s.driver || !s.driver.mesh) return false;
        const doorX = sideRollupDoor.worldX;
        const doorZ = sideRollupDoor.worldZ;
        const halfZ = (sideRollupDoor.width / 2) + 0.25;
        const dp = s.driver.mesh.position;
        if (Math.abs(dp.x - doorX) < 0.85 && Math.abs(dp.z - doorZ) < halfZ) {
          return true;
        }
        if (s.cart && s.cart.mesh) {
          const cp = s.cart.mesh.position;
          if (Math.abs(cp.x - doorX) < 1.0 && Math.abs(cp.z - doorZ) < halfZ) {
            return true;
          }
        }
        return false;
      },

      getMovingDoorSessions: function () {
        if (!sideRollupDoor.isOpen) return [];
        return this.sessions.filter((s) => this.isSessionInSideDoorFrame(s));
      },

      getWaitingExitSessions: function () {
        return this.sessions.filter((s) => s.state === 'WAITING_EXIT');
      },

      getInsideDeliveries: function () {
        return this.sessions
          .filter((s) => s.state !== 'OUTSIDE_WAITING' && s.state !== 'LEAVING' && s.delivery && !s.delivery.completed && !s.delivery.refused)
          .map((s) => s.delivery);
      },

      getFocusedSession: function () {
        if (this.focusedDeliveryId) {
          const found = this.getSessionForDelivery(this.focusedDeliveryId);
          if (found) return found;
        }
        return this.sessions.find((s) => !s.delivery.completed && !s.delivery.refused) || this.sessions[0] || null;
      },

      focusDelivery: function (deliveryId) {
        const s = this.getSessionForDelivery(deliveryId);
        if (!s) return null;
        const changed = this.focusedDeliveryId !== deliveryId;
        this.focusedDeliveryId = deliveryId;
        if (changed && window.DSDReceipts) {
          window.DSDReceipts.enrichDelivery(s.delivery);
          if (!s.delivery.receiptCreated && !s.delivery.isFinalized) {
            window.DSDReceipts.resetScannerSession(s.delivery);
          }
        }
        this.updateDeliveryHud();
        return s;
      },

      resolveFocusedDeliveryForPlayer: function () {
        if (uiState.hoveredPhysicalBox && uiState.hoveredBoxMesh && uiState.hoveredBoxMesh.userData && uiState.hoveredBoxMesh.userData.deliveryId) {
          const hoverSession = this.getSessionForDelivery(uiState.hoveredBoxMesh.userData.deliveryId);
          if (hoverSession) {
            if (this.focusedDeliveryId !== hoverSession.delivery.id) {
              this.focusDelivery(hoverSession.delivery.id);
            }
            return hoverSession.delivery;
          }
        }
        const inside = this.sessions.filter((s) =>
          s.state !== 'OUTSIDE_WAITING' && s.state !== 'LEAVING' && s.delivery && !s.delivery.completed && !s.delivery.refused
        );
        if (!inside.length) return this.activeDelivery;

        let best = null;
        let bestDist = Infinity;
        inside.forEach((s) => {
          let dMin = Infinity;
          if (s.cart && s.cart.mesh) {
            dMin = Math.min(dMin, Math.hypot(hooks.getPlayer().position.x - s.cart.mesh.position.x, hooks.getPlayer().position.z - s.cart.mesh.position.z));
          }
          if (s.driver && s.driver.mesh) {
            dMin = Math.min(dMin, Math.hypot(hooks.getPlayer().position.x - s.driver.mesh.position.x, hooks.getPlayer().position.z - s.driver.mesh.position.z));
          }
          pallets.forEach((p) => {
            if (p && p.data && (p.data.deliveryId === s.delivery.id || (s.delivery.dockBay && p.data.truck === s.delivery.dockBay))) {
              dMin = Math.min(dMin, Math.hypot(hooks.getPlayer().position.x - p.position.x, hooks.getPlayer().position.z - p.position.z));
            }
          });
          if (dMin < bestDist) {
            bestDist = dMin;
            best = s;
          }
        });

        if (best && bestDist < 6.5 && this.focusedDeliveryId !== best.delivery.id) {
          this.focusDelivery(best.delivery.id);
        }
        return best ? best.delivery : this.activeDelivery;
      },

      _arrivalTimeoutId: null,

      startShiftArrivals: function (delayMs) {
        if (this._arrivalTimeoutId) {
          clearTimeout(this._arrivalTimeoutId);
          this._arrivalTimeoutId = null;
        }
        const run = () => {
          this._arrivalTimeoutId = null;
          const snap = window.ShiftClock ? window.ShiftClock.getTimeSnapshot() : { hour: 6, minute: 0 };
          if (window.WarehouseTrucks && typeof window.WarehouseTrucks.tryArriveQueuedTrucks === 'function') {
            window.WarehouseTrucks.tryArriveQueuedTrucks(snap);
          }
          this.processArrivalQueues(snap);
          this.updateDeliveryHud();
        };
        if (delayMs && delayMs > 0) {
          this._arrivalTimeoutId = setTimeout(run, delayMs);
        } else {
          run();
        }
      },

      cancelPendingArrivals: function () {
        if (this._arrivalTimeoutId) {
          clearTimeout(this._arrivalTimeoutId);
          this._arrivalTimeoutId = null;
        }
      },

      init: function () {
        this.startShiftArrivals(1600);
      },

      clearAllSessions: function () {
        this.sessions.slice().forEach((s) => {
          if (s.driver) scene.remove(s.driver.mesh);
          if (s.cart) scene.remove(s.cart.mesh);
          if (s.creditTote) scene.remove(s.creditTote.mesh);
          if (s.vendorJack) scene.remove(s.vendorJack);
          if (s.interactible) {
            const idx = interactibles.indexOf(s.interactible);
            if (idx !== -1) interactibles.splice(idx, 1);
          }
        });
        this.sessions = [];
        this.focusedDeliveryId = null;
        this.selectedWaitingIds.clear();
        closeDoorQueueModal();
      },

      tryStartNextScheduledVendor: function (snap) {
        this.processArrivalQueues(snap);
      },

      processArrivalQueues: function (snap) {
        const s = snap || (window.ShiftClock ? window.ShiftClock.getTimeSnapshot() : { hour: 6, minute: 0 });
        const nowMins = s.hour * 60 + s.minute;

        DELIVERY_MANIFEST.forEach((d) => {
          if (!d || d.completed || d.refused || d.arrived) return;
          if (this.getSessionForDelivery(d.id)) return;
          const etaMins = (d.etaHour || 6) * 60 + (d.etaMinute || 0);
          if (nowMins < etaMins) return;

          if (d.type === 'sidedoor') {
            if (this.getSessionForDoor('SD') || this.getWaitingOutsideSessions().length >= 5) {
              d.queuedAtGate = true;
              return;
            }
            this.enqueueArrivedDelivery(d, 'SD');
          } else if (d.type === 'vendor_truck') {
            if (this.getWaitingOutsideSessions().length >= 5) {
              d.queuedAtGate = true;
              return;
            }
            const bay = (window.WarehouseTrucks && typeof window.WarehouseTrucks.assignBayOnArrival === 'function')
              ? window.WarehouseTrucks.assignBayOnArrival(d)
              : null;
            if (!bay || this.getSessionForDoor('D' + bay)) {
              d.queuedAtGate = true;
              return;
            }
            if (window.WarehouseTrucks) {
              window.WarehouseTrucks.ensureBayTrailerAndPalletsForVendorTruck(d);
            }
            bindDeliveryBoxesToBayPallets(d);
            this.enqueueArrivedDelivery(d, 'D' + bay);
          }
        });
        this.updateDeliveryHud();
      },

      enqueueArrivedDelivery: function (d, doorKey) {
        if (!d || !doorKey || this.getSessionForDelivery(d.id)) return null;
        if (this.getSessionForDoor(doorKey)) return null;

        d.arrived = true;
        d.queuedAtGate = false;
        if (window.DSDReceipts) {
          window.DSDReceipts.enrichDelivery(d);
        }
        if (d.type === 'warehouse') {
          d.dialogueGreeting = `Apex Logistics #${(d.invoiceNo || '400').slice(-3)} docked at Bay ${d.dockBay} (${d.totalPallets} pallets). May I come in to check in?`;
        }

        const slotIdx = (DOOR_SLOT_INDEX[doorKey] !== undefined) ? DOOR_SLOT_INDEX[doorKey] : 1;
        const spawnCoord = OUTSIDE_WAIT_POSITIONS[slotIdx] || OUTSIDE_WAIT_POSITIONS[1];
        const spawnPos = new THREE.Vector3(spawnCoord.x, 0, spawnCoord.z);
        const spawnYaw = -Math.PI / 2;

        const driverObj = createHumanoidDriver3D({
          variant: d.type,
          name: d.driverName,
          initialPos: spawnPos,
          initialYaw: spawnYaw
        });

        const session = {
          delivery: d,
          doorKey: doorKey,
          slotIdx: slotIdx,
          driver: driverObj,
          cart: null,
          creditTote: null,
          vendorJack: null,
          interactible: null,
          state: 'OUTSIDE_WAITING',
          waypoints: [],
          currentWaypointIdx: 0,
          vendorHasJack: false,
          vendorHitchedPallet: null,
          vendorDroppedCount: 0
        };

        session.interactible = {
          id: `driver_${d.id}`,
          type: 'driver',
          name: d.driverName,
          session: session,
          target: driverObj,
          mesh: driverObj.hitbox,
          get boxCenter() {
            return new THREE.Vector3(driverObj.mesh.position.x, 0.95, driverObj.mesh.position.z);
          },
          boxSize: new THREE.Vector3(1.1, 1.9, 1.1),
          getPrompt: () => {
            if (session.state === 'OUTSIDE_WAITING') {
              const wCount = DeliverySystem.getWaitingOutsideSessions().length;
              return wCount > 1
                ? `[E] Speak with ${d.driverName} (${doorKey}) — View ${wCount} Waiting Outside`
                : `[E] Speak with ${d.driverName} (${doorKey} · ${d.carrier}) — May I Come In?`;
            }
            if (session.state === 'WAITING_CHECKIN') {
              return d.type === 'warehouse'
                ? `[E] Check In Warehouse Driver (${d.driverName} · Bay ${d.dockBay})`
                : `[E] Review Invoice / Check In with ${d.driverName} (${doorKey} · ${d.carrier})`;
            }
            if (session.state === 'MOVING_TO_DOCK_STAND') {
              return `${d.driverName} is heading to Dock ${d.dockBay}`;
            }
            if (session.state === 'AWAITING_PLAYER_UNLOAD') {
              return `[E] Check Status with ${d.driverName} (Bay ${d.dockBay})`;
            }
            if (session.state === 'VENDOR_WAIT_DOOR_OPEN') {
              return `${d.driverName} waiting for Dock ${d.dockBay} door to open`;
            }
            if (session.state === 'WAREHOUSE_RETURNING_FOR_SIGN') {
              return `${d.driverName} walking to receiving area for BOL signature`;
            }
            if (session.state === 'WAITING_SIGN') {
              return d.type === 'warehouse'
                ? `[E] Sign Bill of Lading (${d.driverName} · Bay ${d.dockBay})`
                : `[E] Review & Sign Receipt (${d.carrier})`;
            }
            if (session.state === 'WALKING_TO_EXIT' || session.state === 'WAITING_EXIT') {
              if (window.DSDReceipts && !window.DSDReceipts.areAllRequiredReceiptsHanded(d)) {
                const info = window.DSDReceipts.getPendingReceiptHandoffInfo(d);
                if (info.heldMatchingCount > 0) {
                  return `[E] Hand Printed Receipt(s) to ${d.driverName}`;
                }
                return `[E] ${d.driverName} needs Printed Receipt (${info.missing.map((rn) => '#' + rn).join(', ')})`;
              }
              return `${d.driverName} waiting to exit — Open Side Door [E]`;
            }
            return `[E] Speak with ${d.driverName}`;
          },
          interact: () => {
            DeliverySystem.interactWithSession(session);
          }
        };
        interactibles.push(session.interactible);
        driverObj.hitbox.userData.interactible = session.interactible;

        if (d.type === 'sidedoor') {
          const cartPos = new THREE.Vector3(spawnPos.x + Math.sin(spawnYaw) * 1.05, 0, spawnPos.z + Math.cos(spawnYaw) * 1.05);
          session.cart = createHandCart3D(cartPos, spawnYaw + Math.PI, d);
          syncDeliveryBoxesVisuals(d);
        } else if (d.dockBay) {
          bindDeliveryBoxesToBayPallets(d);
          if (d.type === 'vendor_truck') {
            const dock = dockDoors.find((dd) => dd.id === d.dockBay);
            const bayX = dock ? dock.worldX : 7.20;
            const ownJack = createElectricJackWorld();
            // Stowed inside trailer rear (battery facing door, forks pointing deeper inside, clear of door at z = -0.45)
            ownJack.position.set(bayX, 0, -1.60);
            ownJack.rotation.y = 0;
            scene.add(ownJack);
            session.vendorJack = ownJack;
          }
        }

        this.sessions.push(session);
        if (!this.focusedDeliveryId) {
          this.focusedDeliveryId = d.id;
        }

        SoundSystem.playSideDoorChime();
        hooks.showNotification(`🔔 ${doorKey} Arrival: ${d.driverName} (${d.carrier}) is waiting outside the Side Door.`);
        this.updateDeliveryHud();
        return session;
      },

      updateDeliveryHud: function () {
        if (!deliveryHudTitle) return;
        const waitingCount = this.getWaitingOutsideSessions().length;
        const insideCount = this.getInsideDeliveries().length;
        const cur = this.getFocusedSession();

        if (waitingCount > 0 && insideCount === 0) {
          deliveryHudTitle.textContent = waitingCount === 1
            ? `${this.getWaitingOutsideSessions()[0].doorKey} Waiting at Side Door`
            : `${waitingCount} Drivers/Vendors Waiting Outside SD`;
        } else if (cur && cur.delivery) {
          const d = cur.delivery;
          let statusLabel = d.carrier;
          if (cur.state === 'OUTSIDE_WAITING') statusLabel = `${cur.doorKey} Waiting Outside`;
          else if (cur.state === 'ENTERING') statusLabel = `Entering (${cur.doorKey})`;
          else if (cur.state === 'WAITING_CHECKIN') {
            statusLabel = d.type === 'vendor_truck'
              ? `Waiting at Dock ${d.dockBay} (${cur.doorKey})`
              : `At Side Door (${cur.doorKey})`;
          }
          else if (cur.state === 'MOVING_TO_DOCK_STAND') statusLabel = `Walking to Dock ${d.dockBay}`;
          else if (cur.state === 'AWAITING_PLAYER_UNLOAD') statusLabel = `Unload Dock ${d.dockBay} with Walkie`;
          else if (cur.state === 'VENDOR_WAIT_DOOR_OPEN') statusLabel = `Open Dock ${d.dockBay} for Driver`;
          else if (cur.state === 'WAREHOUSE_RETURNING_FOR_SIGN') statusLabel = `Returning for BOL Sign`;
          else if (cur.state.startsWith('VENDOR_')) statusLabel = `Vendor Unloading Bay ${d.dockBay}`;
          else if (cur.state === 'WAITING_SIGN') statusLabel = `Ready to Sign (${cur.doorKey})`;
          else if (cur.state === 'WALKING_TO_EXIT' || cur.state === 'WAITING_EXIT') statusLabel = 'Waiting by Side Door to Exit';
          else if (cur.state === 'LEAVING') statusLabel = 'Exiting';
          const extra = this.sessions.length > 1 ? ` [+${this.sessions.length - 1} active]` : '';
          deliveryHudTitle.textContent = `${d.driverName}: ${statusLabel}${extra}`;
        } else {
          const pendingCount = DELIVERY_MANIFEST.filter((d) => !d.completed && !d.refused).length;
          deliveryHudTitle.textContent = pendingCount > 0 ? `${pendingCount} Delivery Queued / Scheduled` : 'All DSD Vendors Complete';
        }
        renderPendingDeliveriesPanel();
      },

      startWalkingIn: function (session) {
        if (!session || session.state !== 'OUTSIDE_WAITING') return;
        const d = session.delivery;
        const targetSpot = (d && d.type === 'vendor_truck' && d.dockBay && WAREHOUSE_DRIVER_STANDS[d.dockBay])
          ? WAREHOUSE_DRIVER_STANDS[d.dockBay]
          : (INSIDE_CHECKIN_POSITIONS[session.slotIdx] || INSIDE_CHECKIN_POSITIONS[0]);
        session.state = 'ENTERING';
        session.waypoints = [
          new THREE.Vector3(12.2, 0, 8.4),
          new THREE.Vector3(targetSpot.x, 0, targetSpot.z)
        ];
        session.currentWaypointIdx = 0;
        this.focusDelivery(d.id);
        hooks.showNotification(`🚶 Letting in ${d.driverName} (${session.doorKey} · ${d.carrier})`);
        this.updateDeliveryHud();
      },

      letSelectedIn: function (deliveryIds) {
        const ids = Array.isArray(deliveryIds) ? deliveryIds : [];
        const targets = this.getWaitingOutsideSessions().filter((s) => ids.indexOf(s.delivery.id) !== -1);
        if (!targets.length) return;
        openSideDoor();
        targets.forEach((s) => this.startWalkingIn(s));
      },

      interactWithSession: function (session) {
        if (!session || !session.delivery) return;
        const d = session.delivery;

        if (session.state === 'OUTSIDE_WAITING') {
          openDoorQueueModal(session);
          return;
        }

        this.focusDelivery(d.id);

        if (session.state === 'WAITING_CHECKIN') {
          if (d.type !== 'warehouse' && window.WarehouseTrucks) {
            window.WarehouseTrucks.checkPriorityViolation(d);
          }
          if (d.type === 'sidedoor') {
            openInvoice(d);
          } else if (d.type === 'warehouse') {
            hooks.showNotification(`📋 Checked in ${d.driverName}. Open Bay ${d.dockBay} dock door [E] so trailer opens!`);
            SoundSystem.playPaperRustle();
            session.state = 'MOVING_TO_DOCK_STAND';
            const stand = WAREHOUSE_DRIVER_STANDS[d.dockBay] || WAREHOUSE_DRIVER_STANDS[2];
            session.waypoints = [new THREE.Vector3(stand.x, 0, stand.z)];
            session.currentWaypointIdx = 0;
            this.updateDeliveryHud();
          } else if (d.type === 'vendor_truck') {
            const bay = d.dockBay || 3;
            SoundSystem.playPaperRustle();
            hooks.showNotification(`📋 Checked in ${d.driverName}. Open Bay ${bay} dock door [E] so vendor can open trailer & unload!`);
            this.startVendorUnload(session);
          }
        } else if (session.state === 'AWAITING_PLAYER_UNLOAD') {
          const bay = d.dockBay || 2;
          const bayPallets = pallets.filter((p) => p.data && p.data.truck === bay);
          const correctStaged = bayPallets.filter((p) => p.data.status === 'STAGED_CORRECT').length;
          if (correctStaged >= bayPallets.length) {
            openWarehouseBol(d);
          } else {
            hooks.showNotification(`⚡ Bay ${bay} warehouse unload: ${correctStaged}/${bayPallets.length} pallets staged into zones.`);
          }
        } else if (session.state === 'WAITING_SIGN') {
          if (d.type === 'warehouse') {
            openWarehouseBol(d);
          } else {
            openInvoice(d);
          }
        } else if (session.state === 'WAITING_EXIT' || session.state === 'WALKING_TO_EXIT') {
          if (window.DSDReceipts && !window.DSDReceipts.areAllRequiredReceiptsHanded(d)) {
            if (document.exitPointerLock) document.exitPointerLock();
            window.DSDReceipts.openHandReceiptDialog(d, {
              onComplete: (res) => {
                this.updateDeliveryHud();
                if (res && res.complete) {
                  if (session.state === 'WAITING_EXIT' && sideRollupDoor.isOpen && sideRollupDoor.currentProgress >= 0.65) {
                    hooks.showNotification(`📄 Handed printed receipt(s) to ${d.driverName} — exiting Side Door!`);
                  } else {
                    hooks.showNotification(`📄 Handed printed receipt(s) to ${d.driverName}! Press [E] on Side Rollup Door button to let them out.`);
                  }
                } else if (res && res.missing && res.missing.length > 0) {
                  hooks.showNotification(`📄 ${d.driverName} still needs printed receipt(s): ${res.missing.map((rn) => '#' + rn).join(', ')}.`);
                }
              }
            });
          } else {
            SoundSystem.playButtonClick();
            hooks.showNotification(`💬 ${d.driverName}: "Ready to head out — press [E] on the Side Rollup Door button when you can!"`);
          }
        }
      },

      interactWithDriver: function () {
        const s = this.getFocusedSession();
        if (s) this.interactWithSession(s);
      },

      spawnCreditToteIfNeeded: function (session) {
        if (!session || !session.delivery || session.creditTote) return;
        const d = session.delivery;
        if (window.DSDReceipts) window.DSDReceipts.enrichDelivery(d);
        if (!Array.isArray(d.creditBoxes) || d.creditBoxes.length === 0) return;
        if (typeof createCreditTote3D !== 'function') return;

        let totePos;
        if (d.type === 'sidedoor' && session.cart && session.cart.mesh) {
          totePos = new THREE.Vector3(session.cart.mesh.position.x, 0, session.cart.mesh.position.z + 0.88);
        } else if (d.type === 'vendor_truck' && d.dockBay && WAREHOUSE_DRIVER_STANDS[d.dockBay]) {
          const dockStand = WAREHOUSE_DRIVER_STANDS[d.dockBay];
          totePos = new THREE.Vector3(dockStand.x, 0, dockStand.z + 0.72);
        } else {
          const stand = INSIDE_CHECKIN_POSITIONS[session.slotIdx] || INSIDE_CHECKIN_POSITIONS[0];
          const zOff = (session.slotIdx === 2 || session.slotIdx === 4) ? -0.62 : 0.62;
          totePos = new THREE.Vector3(stand.x - 0.55, 0, stand.z + zOff);
        }
        session.creditTote = createCreditTote3D(totePos, d);
        syncDeliveryBoxesVisuals(d);
      },

      removeCreditTote: function (session) {
        if (session && session.creditTote) {
          if (session.creditTote.mesh) scene.remove(session.creditTote.mesh);
          session.creditTote = null;
        }
        if (session && session.delivery && Array.isArray(session.delivery.creditBoxes)) {
          session.delivery.creditBoxes.forEach((cb) => {
            if (cb) cb.mesh = null;
          });
        }
      },

      removeVendorJack: function (session) {
        if (session && session.vendorJack) {
          scene.remove(session.vendorJack);
          session.vendorJack = null;
          session.vendorHasJack = false;
          if (session.driver && typeof session.driver.setOperatingJack === 'function') {
            session.driver.setOperatingJack(false);
          }
        }
      },

      handleInvoiceSigned: function (targetDelivery) {
        const d = targetDelivery || this.activeDelivery;
        if (!d) return;
        const session = this.getSessionForDelivery(d.id);
        if (window.DSDReceipts) window.DSDReceipts.resetScannerSession(null);

        if (d.type === 'sidedoor') {
          d.completed = true;
          d.isFinalized = true;
          if (window.ShiftStats) window.ShiftStats.increment('vendorsProcessed', 1);
          const audit = (window.DSDReceipts && typeof window.DSDReceipts.auditCompletedDelivery === 'function')
            ? window.DSDReceipts.auditCompletedDelivery(d)
            : { ok: true, errors: [] };
          if (!audit.ok) {
            SoundSystem.playErrorBuzzer();
            const pts = audit.penaltyTotal || 100;
            hooks.showNotification(`⚠️ ${d.carrier} Completed WITH PENALTY (-${pts} pts): ${audit.errors.join(' · ')}`, 5500);
          } else {
            SoundSystem.playSuccessChime();
            hooks.showNotification(`✅ Side Door Delivery Accepted: ${d.carrier} (Receipt #${d.receiptNumber || 'DSD'})`);
          }
          if (session) this.startSideDoorExit(session);
        } else if (d.type === 'warehouse') {
          if (window.WarehouseTrucks && typeof window.WarehouseTrucks.finalizeWarehouseTruck === 'function') {
            window.WarehouseTrucks.finalizeWarehouseTruck(d);
          } else {
            d.completed = true;
            d.isFinalized = true;
            if (window.ShiftStats) window.ShiftStats.increment('warehouseTrucksProcessed', 1);
            SoundSystem.playSuccessChime();
          }
          if (session) this.startDriverExit(session);
        } else if (d.type === 'vendor_truck') {
          d.completed = true;
          d.isFinalized = true;
          this.removeVendorJack(session);
          if (window.ShiftStats) window.ShiftStats.increment('trucksProcessed', 1);
          const audit = (window.DSDReceipts && typeof window.DSDReceipts.auditCompletedDelivery === 'function')
            ? window.DSDReceipts.auditCompletedDelivery(d)
            : { ok: true, errors: [] };
          if (window.WarehouseTrucks && d.dockBay) window.WarehouseTrucks.clearVendorBayTrailer(d.dockBay);
          if (!audit.ok) {
            SoundSystem.playErrorBuzzer();
            const pts = audit.penaltyTotal || 100;
            hooks.showNotification(`⚠️ ${d.carrier} Signed WITH PENALTY (-${pts} pts): ${audit.errors.join(' · ')}`, 5500);
          } else {
            SoundSystem.playSuccessChime();
            hooks.showNotification(`✅ Receipt Signed & Verified: ${d.carrier} (Receipt #${d.receiptNumber || 'DSD'})`);
          }
          if (session) this.startDriverExit(session);
        }
        if (window.DSDGame) window.DSDGame.updateHud();
        this.updateDeliveryHud();
      },

      handleDeliveryRefused: function (d) {
        if (!d) return;
        const session = this.getSessionForDelivery(d.id);
        d.refused = true;
        d.isFinalized = true;
        if (d.type === 'vendor_truck' && window.WarehouseTrucks && d.dockBay) {
          this.removeVendorJack(session);
          window.WarehouseTrucks.clearVendorBayTrailer(d.dockBay);
        }
        if (window.DSDGame) window.DSDGame.updateHud();
        this.updateDeliveryHud();
        if (!session) return;
        if (d.type === 'sidedoor') {
          this.startSideDoorExit(session);
        } else {
          this.startDriverExit(session);
        }
      },

      onWarehouseUnloaded: function (truck) {
        if (!truck) return;
        const session = this.getSessionForDelivery(truck.id);
        if (!session || session.state === 'LEAVING' || session.state === 'WAITING_SIGN') return;
        const standSpot = INSIDE_CHECKIN_POSITIONS[session.slotIdx] || INSIDE_CHECKIN_POSITIONS[1];
        session.state = 'WAREHOUSE_RETURNING_FOR_SIGN';
        session.waypoints = [new THREE.Vector3(standSpot.x, 0, standSpot.z)];
        session.currentWaypointIdx = 0;
        this.updateDeliveryHud();
      },

      onWarehouseCompleted: function (truck) {
        if (!truck) return;
        const session = this.getSessionForDelivery(truck.id);
        if (session && !['LEAVING', 'WALKING_TO_EXIT', 'WAITING_EXIT'].includes(session.state)) {
          this.startDriverExit(session);
        } else {
          this.processArrivalQueues();
          if (window.WarehouseTrucks) window.WarehouseTrucks.tryArriveQueuedTrucks();
        }
      },

      beginPendingExit: function (session) {
        if (!session) return;
        const d = session.delivery;
        const receiptsReady = !d || !window.DSDReceipts || window.DSDReceipts.areAllRequiredReceiptsHanded(d);
        if (sideRollupDoor.isOpen && sideRollupDoor.currentProgress >= 0.65 && receiptsReady) {
          session.state = 'LEAVING';
          session.waypoints = [
            new THREE.Vector3(12.2, 0, 8.4),
            new THREE.Vector3(15.2, 0, 8.4)
          ];
          session.currentWaypointIdx = 0;
        } else {
          const zSlot = ((session.slotIdx || 0) % 3 - 1) * 0.50;
          session.state = 'WALKING_TO_EXIT';
          session.waypoints = [
            new THREE.Vector3(11.15, 0, 8.4 + zSlot)
          ];
          session.currentWaypointIdx = 0;
          if (!receiptsReady && d) {
            hooks.showNotification(`📄 ${d.driverName} is waiting by Side Door — hand over printed receipt(s) [E] before exit!`);
          }
        }
        this.updateDeliveryHud();
      },

      startSideDoorExit: function (session) {
        if (!session) return;
        if (session.cart && session.cart.cargoGroup) {
          session.cart.mesh.remove(session.cart.cargoGroup);
          session.cart.cargoGroup = null;
          session.cart.boxes.length = 0;
        }
        this.removeCreditTote(session);
        this.beginPendingExit(session);
      },

      getBackroomStagingSpot: function (bayId, dropIdx) {
        const colPairs = {
          1: [0.1, 1.3],
          2: [2.8, 4.0],
          3: [5.8, 7.0],
          4: [7.8, 9.0]
        };
        const pair = colPairs[bayId] || colPairs[3];
        const col = pair[dropIdx % 2];
        const row = 12.0 + Math.floor(dropIdx / 2) * 1.65;
        const world = gridToWorld(col, Math.min(14.2, row));
        return { x: world.x, z: world.z };
      },

      startVendorUnload: function (session) {
        if (!session) return;
        const bay = (session.delivery && session.delivery.dockBay) ? session.delivery.dockBay : 3;
        const dock = dockDoors.find((dd) => dd.id === bay);
        const bayX = dock ? dock.worldX : 7.20;
        session.vendorDroppedCount = 0;
        session.state = 'VENDOR_WALK_TO_BAY';
        session.waypoints = [new THREE.Vector3(bayX, 0, 2.0)];
        session.currentWaypointIdx = 0;
        this.updateDeliveryHud();
      },

      startDriverExit: function (session) {
        if (!session) return;
        const d = session.delivery;
        this.removeCreditTote(session);
        if (d && d.type === 'vendor_truck' && window.WarehouseTrucks && typeof window.WarehouseTrucks.clearDeliveryPallets === 'function') {
          this.removeVendorJack(session);
          window.WarehouseTrucks.clearDeliveryPallets(d.id);
        }
        this.beginPendingExit(session);
      },

      onDespawnDriver: function (session) {
        if (!session) return;
        const finishedDelivery = session.delivery;
        if (session.driver) scene.remove(session.driver.mesh);
        if (session.cart) scene.remove(session.cart.mesh);
        this.removeCreditTote(session);
        this.removeVendorJack(session);
        if (session.interactible) {
          const idx = interactibles.indexOf(session.interactible);
          if (idx !== -1) interactibles.splice(idx, 1);
        }
        const sIdx = this.sessions.indexOf(session);
        if (sIdx !== -1) this.sessions.splice(sIdx, 1);
        if (this.focusedDeliveryId === session.delivery.id) {
          this.focusedDeliveryId = this.sessions[0] ? this.sessions[0].delivery.id : null;
        }

        if (finishedDelivery && global.BackstockRacks && typeof global.BackstockRacks.spawnOverstockFromDelivery === 'function') {
          global.BackstockRacks.spawnOverstockFromDelivery(finishedDelivery);
        }

        const snap = window.ShiftClock ? window.ShiftClock.getTimeSnapshot() : { hour: 6, minute: 0 };
        if (window.WarehouseTrucks && typeof window.WarehouseTrucks.tryArriveQueuedTrucks === 'function') {
          window.WarehouseTrucks.tryArriveQueuedTrucks(snap);
        }
        this.processArrivalQueues(snap);
        this.updateDeliveryHud();

        if (this.sessions.length === 0 && DELIVERY_MANIFEST.every((d) => d.completed || d.refused)) {
          SoundSystem.playSuccessChime();
          hooks.showNotification('🎉 All scheduled DSD side-door & vendor truck deliveries handled!');
        }
      },

      updateSession: function (session, dt) {
        if (!session || !session.driver) return;

        if (session.state === 'OUTSIDE_WAITING') {
          session.driver.updateAnimation(false, dt);
          session.driver.trackPlayerGaze(hooks.getPlayer().position, dt);
          return;
        }

        if (session.state === 'VENDOR_WAIT_DOOR_OPEN') {
          session.driver.updateAnimation(false, dt);
          session.driver.trackPlayerGaze(hooks.getPlayer().position, dt);
          const bay = (session.delivery && session.delivery.dockBay) ? session.delivery.dockBay : 3;
          const dd = dockDoors.find((dItem) => dItem.id === bay);
          if (dd && dd.isOpen && dd.currentProgress >= 0.72 && dd.trailerDoorProgress >= 0.72) {
            session.state = 'VENDOR_GETTING_OWN_JACK';
            session.waypoints = [new THREE.Vector3(dd.worldX, 0, -0.95)];
            session.currentWaypointIdx = 0;
            this.updateDeliveryHud();
          }
          return;
        }

        if (session.state === 'WAITING_EXIT') {
          session.driver.updateAnimation(false, dt);
          session.driver.trackPlayerGaze(hooks.getPlayer().position, dt);
          const receiptsReady = !session.delivery || !window.DSDReceipts || window.DSDReceipts.areAllRequiredReceiptsHanded(session.delivery);
          if (sideRollupDoor.isOpen && sideRollupDoor.currentProgress >= 0.65 && receiptsReady) {
            session.state = 'LEAVING';
            session.waypoints = [
              new THREE.Vector3(12.2, 0, 8.4),
              new THREE.Vector3(15.2, 0, 8.4)
            ];
            session.currentWaypointIdx = 0;
            this.updateDeliveryHud();
          }
          return;
        }

        const isMovingState = (
          session.state === 'MOVING_TO_DOCK_STAND' || session.state === 'ENTERING' ||
          session.state === 'WALKING_TO_EXIT' || session.state === 'LEAVING' ||
          session.state === 'WAREHOUSE_RETURNING_FOR_SIGN' ||
          session.state === 'VENDOR_WALK_TO_BAY' ||
          session.state === 'VENDOR_GETTING_OWN_JACK' ||
          session.state === 'VENDOR_UNLOADING_DRIVE_IN' ||
          session.state === 'VENDOR_UNLOADING_DRIVE_OUT' ||
          session.state === 'VENDOR_RETURNING_JACK' ||
          session.state === 'VENDOR_RETURNING_TO_SIDE_DOOR'
        );

        if (isMovingState && session.currentWaypointIdx < session.waypoints.length) {
          const drvPos = session.driver.mesh.position;
          const needsDoorForEntry = session.state === 'ENTERING' && drvPos.x >= (sideRollupDoor.worldX - 0.9);
          const needsDoorForExit = session.state === 'LEAVING' && drvPos.x <= (sideRollupDoor.worldX + 0.9);
          if ((needsDoorForEntry || needsDoorForExit) && sideRollupDoor.currentProgress < 0.65) {
            session.driver.updateAnimation(false, dt);
            session.driver.trackPlayerGaze(hooks.getPlayer().position, dt);
            return;
          }

          const targetWp = session.waypoints[session.currentWaypointIdx];
          const curPos = session.driver.mesh.position;
          const dx = targetWp.x - curPos.x;
          const dz = targetWp.z - curPos.z;
          const dist = Math.hypot(dx, dz);
          const walkSpeed = session.vendorHasJack ? 2.4 : 3.0;

          if (dist > 0.08) {
            const dirX = dx / dist;
            const dirZ = dz / dist;
            const targetYaw = Math.atan2(dirX, dirZ);

            let angleDiff = targetYaw - session.driver.mesh.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            session.driver.mesh.rotation.y += angleDiff * Math.min(1.0, 10.0 * dt);

            const step = Math.min(dist, walkSpeed * dt);
            curPos.x += dirX * step;
            curPos.z += dirZ * step;
            session.driver.updateAnimation(true, dt);

            if (session.cart && session.state !== 'FINISHED') {
              const cyaw = session.driver.mesh.rotation.y;
              session.cart.mesh.position.set(
                curPos.x + Math.sin(cyaw) * 1.05,
                0,
                curPos.z + Math.cos(cyaw) * 1.05
              );
              session.cart.mesh.rotation.y = cyaw + Math.PI;
              session.cart.rollWheels(step);
            }

            if (session.vendorHasJack && session.vendorJack) {
              const jyaw = session.driver.mesh.rotation.y;
              session.vendorJack.position.set(
                curPos.x + Math.sin(jyaw) * 0.65,
                0,
                curPos.z + Math.cos(jyaw) * 0.65
              );
              session.vendorJack.rotation.y = jyaw + Math.PI;

              if (session.vendorHitchedPallet) {
                session.vendorHitchedPallet.position.set(
                  session.vendorJack.position.x + Math.sin(jyaw) * 1.25,
                  0.08,
                  session.vendorJack.position.z + Math.cos(jyaw) * 1.25
                );
                session.vendorHitchedPallet.mesh.position.copy(session.vendorHitchedPallet.position);
                session.vendorHitchedPallet.mesh.rotation.y = jyaw;
              }
            }
          } else {
            session.currentWaypointIdx++;
            if (session.currentWaypointIdx >= session.waypoints.length) {
              this.onSessionReachedPathEnd(session);
            }
          }
        } else {
          session.driver.updateAnimation(false, dt);
          session.driver.trackPlayerGaze(hooks.getPlayer().position, dt);
        }
      },

      onSessionReachedPathEnd: function (session) {
        const d = session.delivery;
        if (session.state === 'ENTERING') {
          session.state = 'WAITING_CHECKIN';
          if (d.type === 'vendor_truck' && d.dockBay) {
            const dock = dockDoors.find((dd) => dd.id === d.dockBay);
            session.driver.mesh.rotation.y = dock
              ? Math.atan2(dock.worldX - session.driver.mesh.position.x, dock.worldZ - session.driver.mesh.position.z)
              : 0;
          } else {
            session.driver.mesh.rotation.y = -Math.PI / 2;
          }
          if (session.cart) {
            session.cart.mesh.rotation.y = -Math.PI / 2 + Math.PI;
          }
          this.spawnCreditToteIfNeeded(session);
          hooks.showNotification(
            d.type === 'vendor_truck' && d.dockBay
              ? `💬 ${d.driverName} (${session.doorKey}) is waiting near Bay ${d.dockBay}: [E] to Check In`
              : `💬 ${d.driverName} (${session.doorKey}) is inside by the Side Door: [E] to Check In`
          );
          this.updateDeliveryHud();
        } else if (session.state === 'WALKING_TO_EXIT') {
          const receiptsReady = !d || !window.DSDReceipts || window.DSDReceipts.areAllRequiredReceiptsHanded(d);
          if (sideRollupDoor.isOpen && sideRollupDoor.currentProgress >= 0.65 && receiptsReady) {
            session.state = 'LEAVING';
            session.waypoints = [
              new THREE.Vector3(12.2, 0, 8.4),
              new THREE.Vector3(15.2, 0, 8.4)
            ];
            session.currentWaypointIdx = 0;
          } else {
            session.state = 'WAITING_EXIT';
            session.driver.mesh.rotation.y = Math.PI / 2;
            if (session.cart) {
              session.cart.mesh.rotation.y = Math.PI / 2 + Math.PI;
            }
            hooks.showNotification(
              receiptsReady
                ? `🚪 ${d.driverName} is waiting by the Side Door — push the Side Door button [E] to let them out.`
                : `📄 ${d.driverName} is waiting by the Side Door — hand over printed receipt(s) [E] before letting them out.`
            );
          }
          this.updateDeliveryHud();
        } else if (session.state === 'LEAVING') {
          this.onDespawnDriver(session);
        } else if (session.state === 'MOVING_TO_DOCK_STAND') {
          const dock = dockDoors.find((dd) => dd.id === d.dockBay);
          if (dock && session.driver) {
            session.driver.mesh.rotation.y = Math.atan2(dock.worldX - session.driver.mesh.position.x, dock.worldZ - session.driver.mesh.position.z);
          }
          session.state = 'AWAITING_PLAYER_UNLOAD';
          this.updateDeliveryHud();
          hooks.showNotification(`${d.driverName} standing clear beside Bay ${d.dockBay}.`);
        } else if (session.state === 'WAREHOUSE_RETURNING_FOR_SIGN') {
          session.state = 'WAITING_SIGN';
          session.driver.mesh.rotation.y = -Math.PI / 2;
          this.updateDeliveryHud();
          hooks.showNotification(`📋 ${d.driverName} ready at receiving area: [E] to sign Bill of Lading for Bay ${d.dockBay}!`);
        } else if (session.state === 'VENDOR_WALK_TO_BAY') {
          const bay = (d && d.dockBay) ? d.dockBay : 3;
          const dd = dockDoors.find((dItem) => dItem.id === bay);
          session.driver.mesh.rotation.y = Math.PI;
          if (dd && dd.isOpen && dd.currentProgress >= 0.72 && dd.trailerDoorProgress >= 0.72) {
            session.state = 'VENDOR_GETTING_OWN_JACK';
            session.waypoints = [new THREE.Vector3(dd.worldX, 0, -0.95)];
            session.currentWaypointIdx = 0;
          } else {
            session.state = 'VENDOR_WAIT_DOOR_OPEN';
            hooks.showNotification(`⏳ ${d.driverName} is at Bay ${bay} — open Dock Door ${bay} [E] so he can open his trailer.`);
          }
          this.updateDeliveryHud();
        } else if (session.state === 'VENDOR_GETTING_OWN_JACK') {
          const bay = (d && d.dockBay) ? d.dockBay : 3;
          const dock = dockDoors.find((dd) => dd.id === bay);
          const bayX = dock ? dock.worldX : 7.20;

          session.vendorHasJack = true;
          session.vendorDroppedCount = 0;
          if (session.driver && typeof session.driver.setOperatingJack === 'function') {
            session.driver.setOperatingJack(true);
          }
          SoundSystem.playHydraulicLift();
          SoundSystem.playElectricHum();

          const remainingBayPallets = pallets
            .filter((p) => p.data && p.data.truck === bay && p.data.status === 'UNLOADED')
            .sort((a, b) => b.position.z - a.position.z);

          if (remainingBayPallets.length === 0) {
            session.state = 'VENDOR_RETURNING_JACK';
            session.waypoints = [new THREE.Vector3(bayX, 0, -0.50)];
            session.currentWaypointIdx = 0;
            return;
          }

          const nextPallet = remainingBayPallets[0];
          hooks.showNotification(`⚡ ${d.driverName} using onboard jack in Bay ${bay} (${remainingBayPallets.length} pallet(s))`);

          session.state = 'VENDOR_UNLOADING_DRIVE_IN';
          session.waypoints = [
            new THREE.Vector3(nextPallet.position.x, 0, Math.min(-0.8, nextPallet.position.z + 2.35))
          ];
          session.currentWaypointIdx = 0;
        } else if (session.state === 'VENDOR_UNLOADING_DRIVE_IN') {
          const bay = (d && d.dockBay) ? d.dockBay : 3;
          const dock = dockDoors.find((dd) => dd.id === bay);
          const bayX = dock ? dock.worldX : 7.20;

          const remainingBayPallets = pallets
            .filter((p) => p.data && p.data.truck === bay && p.data.status === 'UNLOADED')
            .sort((a, b) => b.position.z - a.position.z);
          const bayPallet = remainingBayPallets[0];

          if (bayPallet) {
            session.vendorHitchedPallet = bayPallet;
            bayPallet.isHitched = true;
            bayPallet.data.status = 'IN_TRANSIT';
            SoundSystem.playHydraulicLift();
          }

          const dropPos = this.getBackroomStagingSpot(bay, session.vendorDroppedCount);
          hooks.showNotification(`⚡ ${d.driverName} hauling ${bayPallet ? bayPallet.data.po : 'pallet'} to backroom staging`);

          session.state = 'VENDOR_UNLOADING_DRIVE_OUT';
          session.waypoints = [
            new THREE.Vector3(bayX, 0, 1.5),
            new THREE.Vector3(dropPos.x, 0, 3.0),
            new THREE.Vector3(dropPos.x, 0, dropPos.z - 2.35)
          ];
          session.currentWaypointIdx = 0;
        } else if (session.state === 'VENDOR_UNLOADING_DRIVE_OUT') {
          const bay = (d && d.dockBay) ? d.dockBay : 3;
          const dock = dockDoors.find((dd) => dd.id === bay);
          const bayX = dock ? dock.worldX : 7.20;

          if (session.vendorHitchedPallet) {
            const p = session.vendorHitchedPallet;
            const dropPos = this.getBackroomStagingSpot(bay, session.vendorDroppedCount);
            p.isHitched = false;
            p.position.set(dropPos.x, 0, dropPos.z);
            p.mesh.position.set(dropPos.x, 0, dropPos.z);
            p.mesh.rotation.y = 0;
            p.data.status = 'STAGED_CORRECT';
            session.vendorHitchedPallet = null;
            session.vendorDroppedCount += 1;
            SoundSystem.playHydraulicLower();
            SoundSystem.playSuccessChime();
            hooks.updateStagedCounter();
            hooks.showNotification(`✅ ${d.driverName} staged ${p.data.po} in backroom`);
          }

          const remainingBayPallets = pallets
            .filter((p) => p.data && p.data.truck === bay && p.data.status === 'UNLOADED')
            .sort((a, b) => b.position.z - a.position.z);

          if (remainingBayPallets.length > 0) {
            const nextPallet = remainingBayPallets[0];
            session.state = 'VENDOR_UNLOADING_DRIVE_IN';
            session.waypoints = [
              new THREE.Vector3(bayX, 0, 2.5),
              new THREE.Vector3(nextPallet.position.x, 0, 0.5),
              new THREE.Vector3(nextPallet.position.x, 0, nextPallet.position.z + 2.35)
            ];
            session.currentWaypointIdx = 0;
          } else {
            hooks.showNotification(`⚡ All ${session.vendorDroppedCount} pallets unloaded! ${d.driverName} parking onboard jack on trailer.`);
            session.state = 'VENDOR_RETURNING_JACK';
            session.waypoints = [
              new THREE.Vector3(bayX, 0, 1.5),
              new THREE.Vector3(bayX, 0, -0.50)
            ];
            session.currentWaypointIdx = 0;
          }
        } else if (session.state === 'VENDOR_RETURNING_JACK') {
          const bay = (d && d.dockBay) ? d.dockBay : 3;
          const dock = dockDoors.find((dd) => dd.id === bay);
          const bayX = dock ? dock.worldX : 7.20;

          session.vendorHasJack = false;
          if (session.driver && typeof session.driver.setOperatingJack === 'function') {
            session.driver.setOperatingJack(false);
          }
          if (session.vendorJack) {
            session.vendorJack.position.set(bayX, 0, -1.60);
            session.vendorJack.rotation.y = 0;
          }
          SoundSystem.playDropSound();

          const dockStand = WAREHOUSE_DRIVER_STANDS[bay] || INSIDE_CHECKIN_POSITIONS[session.slotIdx] || INSIDE_CHECKIN_POSITIONS[1];
          hooks.showNotification(`⚡ Onboard jack stowed in trailer. ${d.driverName} stepping clear beside Bay ${bay} for sign-off.`);
          session.state = 'VENDOR_RETURNING_TO_SIDE_DOOR';
          session.waypoints = [
            new THREE.Vector3(bayX, 0, 2.2),
            new THREE.Vector3(dockStand.x, 0, dockStand.z)
          ];
          session.currentWaypointIdx = 0;
        } else if (session.state === 'VENDOR_RETURNING_TO_SIDE_DOOR') {
          session.state = 'WAITING_SIGN';
          session.driver.mesh.rotation.y = 0;
          this.updateDeliveryHud();
          hooks.showNotification(`📦 ${d.driverName} unloaded all pallets by Bay ${d.dockBay}! Scan cases [F], then [E] to sign.`);
        }
      },

      update: function (dt) {
        if (!this.sessions.length) return;
        this.sessions.slice().forEach((s) => this.updateSession(s, dt));
      },

      exportState: function () {
        return {
          focusedDeliveryId: this.focusedDeliveryId || null,
          selectedWaitingIds: Array.from(this.selectedWaitingIds || []),
          sessions: (this.sessions || []).map((s) => ({
            deliveryId: s.delivery ? s.delivery.id : null,
            doorKey: s.doorKey,
            slotIdx: Number(s.slotIdx) || 0,
            state: s.state,
            waypoints: (s.waypoints || []).map((wp) => ({
              x: Number(wp.x) || 0,
              y: Number(wp.y) || 0,
              z: Number(wp.z) || 0
            })),
            currentWaypointIdx: Number(s.currentWaypointIdx) || 0,
            vendorHasJack: Boolean(s.vendorHasJack),
            vendorDroppedCount: Number(s.vendorDroppedCount) || 0,
            vendorHitchedPalletId: s.vendorHitchedPallet && s.vendorHitchedPallet.data ? (s.vendorHitchedPallet.data.id || null) : null,
            driverPos: s.driver && s.driver.mesh ? {
              x: Number(s.driver.mesh.position.x) || 0,
              y: Number(s.driver.mesh.position.y) || 0,
              z: Number(s.driver.mesh.position.z) || 0
            } : null,
            driverYaw: s.driver && s.driver.mesh ? (Number(s.driver.mesh.rotation.y) || 0) : -Math.PI / 2,
            cartPos: s.cart && s.cart.mesh ? {
              x: Number(s.cart.mesh.position.x) || 0,
              y: Number(s.cart.mesh.position.y) || 0,
              z: Number(s.cart.mesh.position.z) || 0
            } : null,
            cartYaw: s.cart && s.cart.mesh ? (Number(s.cart.mesh.rotation.y) || 0) : 0,
            hasCart: Boolean(s.cart),
            hasCartCargo: Boolean(s.cart && s.cart.cargoGroup),
            hasCreditTote: Boolean(s.creditTote),
            hasVendorJack: Boolean(s.vendorJack),
            vendorJackPos: s.vendorJack ? {
              x: Number(s.vendorJack.position.x) || 0,
              y: Number(s.vendorJack.position.y) || 0,
              z: Number(s.vendorJack.position.z) || 0
            } : null,
            vendorJackYaw: s.vendorJack ? (Number(s.vendorJack.rotation.y) || 0) : 0
          }))
        };
      },

      importState: function (data) {
        if (!data || typeof data !== 'object') return false;
        this.cancelPendingArrivals();
        this.clearAllSessions();

        if (window.WarehouseTrucks && typeof window.WarehouseTrucks.getNonWarehouseQueue === 'function') {
          DELIVERY_MANIFEST.length = 0;
          DELIVERY_MANIFEST.push(...window.WarehouseTrucks.getNonWarehouseQueue());
        }

        const allSched = (window.WarehouseTrucks && typeof window.WarehouseTrucks.getScheduleRows === 'function')
          ? window.WarehouseTrucks.getScheduleRows()
          : [];

        const savedSessions = Array.isArray(data.sessions) ? data.sessions : [];
        savedSessions.forEach((ss) => {
          if (!ss || !ss.deliveryId) return;
          const d = allSched.find((e) => e && e.id === ss.deliveryId) || DELIVERY_MANIFEST.find((e) => e && e.id === ss.deliveryId);
          if (!d) return;
          if (window.DSDReceipts) window.DSDReceipts.enrichDelivery(d);

          const spawnPos = ss.driverPos
            ? new THREE.Vector3(Number(ss.driverPos.x) || 0, Number(ss.driverPos.y) || 0, Number(ss.driverPos.z) || 0)
            : new THREE.Vector3(15.65, 0, 8.40);
          const spawnYaw = Number.isFinite(Number(ss.driverYaw)) ? Number(ss.driverYaw) : -Math.PI / 2;

          const driverObj = createHumanoidDriver3D({
            variant: d.type,
            name: d.driverName,
            initialPos: spawnPos,
            initialYaw: spawnYaw
          });
          if (driverObj && typeof driverObj.setOperatingJack === 'function') {
            driverObj.setOperatingJack(Boolean(ss.vendorHasJack));
          }

          const doorKey = ss.doorKey || 'SD';
          const session = {
            delivery: d,
            doorKey: doorKey,
            slotIdx: Number(ss.slotIdx) || 0,
            driver: driverObj,
            cart: null,
            creditTote: null,
            vendorJack: null,
            interactible: null,
            state: ss.state || 'OUTSIDE_WAITING',
            waypoints: Array.isArray(ss.waypoints)
              ? ss.waypoints.map((wp) => new THREE.Vector3(Number(wp.x) || 0, Number(wp.y) || 0, Number(wp.z) || 0))
              : [],
            currentWaypointIdx: Number(ss.currentWaypointIdx) || 0,
            vendorHasJack: Boolean(ss.vendorHasJack),
            vendorHitchedPallet: null,
            vendorDroppedCount: Number(ss.vendorDroppedCount) || 0
          };

          session.interactible = {
            id: `driver_${d.id}`,
            type: 'driver',
            name: d.driverName,
            session: session,
            target: driverObj,
            mesh: driverObj.hitbox,
            get boxCenter() {
              return new THREE.Vector3(driverObj.mesh.position.x, 0.95, driverObj.mesh.position.z);
            },
            boxSize: new THREE.Vector3(1.1, 1.9, 1.1),
            getPrompt: () => {
              if (session.state === 'OUTSIDE_WAITING') {
                const wCount = DeliverySystem.getWaitingOutsideSessions().length;
                return wCount > 1
                  ? `[E] Speak with ${d.driverName} (${doorKey}) — View ${wCount} Waiting Outside`
                  : `[E] Speak with ${d.driverName} (${doorKey} · ${d.carrier}) — May I Come In?`;
              }
              if (session.state === 'WAITING_CHECKIN') {
                return d.type === 'warehouse'
                  ? `[E] Check In Warehouse Driver (${d.driverName} · Bay ${d.dockBay})`
                  : `[E] Review Invoice / Check In with ${d.driverName} (${doorKey} · ${d.carrier})`;
              }
              if (session.state === 'MOVING_TO_DOCK_STAND') {
                return `${d.driverName} is heading to Dock ${d.dockBay}`;
              }
              if (session.state === 'AWAITING_PLAYER_UNLOAD') {
                return `[E] Check Status with ${d.driverName} (Bay ${d.dockBay})`;
              }
              if (session.state === 'VENDOR_WAIT_DOOR_OPEN') {
                return `${d.driverName} waiting for Dock ${d.dockBay} door to open`;
              }
              if (session.state === 'WAREHOUSE_RETURNING_FOR_SIGN') {
                return `${d.driverName} walking to receiving area for BOL signature`;
              }
              if (session.state === 'WAITING_SIGN') {
                return d.type === 'warehouse'
                  ? `[E] Sign Bill of Lading (${d.driverName} · Bay ${d.dockBay})`
                  : `[E] Review & Sign Receipt (${d.carrier})`;
              }
              if (session.state === 'WALKING_TO_EXIT' || session.state === 'WAITING_EXIT') {
                if (window.DSDReceipts && !window.DSDReceipts.areAllRequiredReceiptsHanded(d)) {
                  const info = window.DSDReceipts.getPendingReceiptHandoffInfo(d);
                  if (info.heldMatchingCount > 0) {
                    return `[E] Hand Printed Receipt(s) to ${d.driverName}`;
                  }
                  return `[E] ${d.driverName} needs Printed Receipt (${info.missing.map((rn) => '#' + rn).join(', ')})`;
                }
                return `${d.driverName} waiting to exit — Open Side Door [E]`;
              }
              return `[E] Speak with ${d.driverName}`;
            },
            interact: () => {
              DeliverySystem.interactWithSession(session);
            }
          };
          interactibles.push(session.interactible);
          driverObj.hitbox.userData.interactible = session.interactible;

          if (d.type === 'sidedoor' && ss.hasCart) {
            const cartPos = ss.cartPos
              ? new THREE.Vector3(Number(ss.cartPos.x) || 0, Number(ss.cartPos.y) || 0, Number(ss.cartPos.z) || 0)
              : new THREE.Vector3(spawnPos.x + Math.sin(spawnYaw) * 1.05, 0, spawnPos.z + Math.cos(spawnYaw) * 1.05);
            session.cart = createHandCart3D(cartPos, Number.isFinite(Number(ss.cartYaw)) ? Number(ss.cartYaw) : (spawnYaw + Math.PI), d);
            if (!ss.hasCartCargo && session.cart && session.cart.cargoGroup) {
              session.cart.mesh.remove(session.cart.cargoGroup);
              session.cart.cargoGroup = null;
              session.cart.boxes.length = 0;
            } else {
              syncDeliveryBoxesVisuals(d);
            }
          } else if (d.dockBay) {
            bindDeliveryBoxesToBayPallets(d);
          }

          if (ss.hasCreditTote) {
            this.spawnCreditToteIfNeeded(session);
          }

          if (d.type === 'vendor_truck' && ss.hasVendorJack) {
            const ownJack = createElectricJackWorld();
            if (ss.vendorJackPos) {
              ownJack.position.set(Number(ss.vendorJackPos.x) || 0, Number(ss.vendorJackPos.y) || 0, Number(ss.vendorJackPos.z) || 0);
            }
            ownJack.rotation.y = Number(ss.vendorJackYaw) || 0;
            scene.add(ownJack);
            session.vendorJack = ownJack;
            if (ss.vendorHitchedPalletId) {
              const hp = pallets.find((p) => p && p.data && p.data.id === ss.vendorHitchedPalletId);
              if (hp) {
                session.vendorHitchedPallet = hp;
                hp.isHitched = true;
              }
            }
          }

          this.sessions.push(session);
        });

        this.focusedDeliveryId = data.focusedDeliveryId || null;
        this.selectedWaitingIds = new Set(Array.isArray(data.selectedWaitingIds) ? data.selectedWaitingIds : []);
        this.updateDeliveryHud();
        return true;
      }
    };

    function renderDoorQueueModal() {
      if (!dqListEl) return;
      const waiting = DeliverySystem.getWaitingOutsideSessions();
      if (dqSlotSummaryEl) {
        dqSlotSummaryEl.textContent = `WAITING OUTSIDE: ${waiting.length} / 5 (D1-D4 + SD)`;
      }
      const hasWh = waiting.some((s) => s.delivery && s.delivery.type === 'warehouse');
      if (dqPriorityWarnEl) {
        if (hasWh) {
          dqPriorityWarnEl.style.display = 'block';
          dqPriorityWarnEl.textContent = '★ HIGH PRIORITY WAREHOUSE TRUCK WAITING AT DOCK — PRIORITIZE CHECK-IN!';
        } else {
          dqPriorityWarnEl.style.display = 'none';
        }
      }
      if (!waiting.length) {
        dqListEl.innerHTML = '<div style="padding:18px; text-align:center; color:#94a3b8;">No drivers or vendors waiting outside the Side Door right now.</div>';
        if (dqLetSelectedBtn) dqLetSelectedBtn.disabled = true;
        if (dqLetAllBtn) dqLetAllBtn.disabled = true;
        return;
      }
      if (dqLetAllBtn) dqLetAllBtn.disabled = false;

      dqListEl.innerHTML = waiting.map((s) => {
        const d = s.delivery;
        const checked = DeliverySystem.selectedWaitingIds.has(d.id);
        const badgeCls = d.type === 'sidedoor' ? 'sd' : (d.type === 'warehouse' ? 'wh' : 'trk');
        const cargoInfo = d.type === 'warehouse'
          ? `${d.totalPallets || 0} Pallets (Dept 01)`
          : `${d.totalCases || 0} Cases (Inv #${d.invoiceNo || d.docNum})`;
        const askLine = d.type === 'sidedoor'
          ? `"Hi, I'm ${d.driverName} from ${d.carrier} with my hand cart — may I come in?"`
          : (d.type === 'warehouse'
            ? `"Apex Logistics docked at Bay ${d.dockBay} (${d.totalPallets} pallets) — may I come in?"`
            : `"${d.driverName} (${d.carrier}) docked at Bay ${d.dockBay} — may I come in to unload?"`);
        return `<div class="dq-row ${checked ? 'selected' : ''}" data-dq-id="${d.id}">` +
          `<input type="checkbox" ${checked ? 'checked' : ''} style="width:16px;height:16px;accent-color:#22c55e;cursor:pointer;">` +
          `<span class="dq-door-badge ${badgeCls}">${s.doorKey}</span>` +
          `<span style="color:#38bdf8; display:flex; align-items:center;">${getDeliveryTypeSvg(d.type)}</span>` +
          `<div>` +
          `<div style="font-size:12.5px; font-weight:800; color:#f8fafc;">${d.driverName} · <span style="color:#cbd5e1;">${d.carrier}</span></div>` +
          `<div style="font-size:11px; color:#94a3b8; margin-top:2px;">ETA ${d.etaText || '6:00 AM'} · ${cargoInfo}</div>` +
          `<div style="font-size:11px; color:#86efac; margin-top:3px; font-style:italic;">${askLine}</div>` +
          `</div>` +
          `</div>`;
      }).join('');

      dqListEl.querySelectorAll('.dq-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          const id = row.getAttribute('data-dq-id');
          if (!id) return;
          if (DeliverySystem.selectedWaitingIds.has(id)) {
            DeliverySystem.selectedWaitingIds.delete(id);
          } else {
            DeliverySystem.selectedWaitingIds.add(id);
          }
          SoundSystem.playButtonClick();
          renderDoorQueueModal();
        });
      });

      const selectedCount = waiting.filter((s) => DeliverySystem.selectedWaitingIds.has(s.delivery.id)).length;
      if (dqLetSelectedBtn) {
        dqLetSelectedBtn.disabled = selectedCount === 0;
        dqLetSelectedBtn.textContent = selectedCount > 0 ? `LET SELECTED IN (${selectedCount})` : 'LET SELECTED IN';
      }
      if (dqToggleAllBtn) {
        dqToggleAllBtn.textContent = selectedCount === waiting.length ? 'CLEAR ALL' : 'SELECT ALL';
      }
    }

    function openDoorQueueModal(clickedSession) {
      const waiting = DeliverySystem.getWaitingOutsideSessions();
      if (!waiting.length) return;
      DeliverySystem.selectedWaitingIds.clear();
      if (clickedSession && clickedSession.delivery) {
        DeliverySystem.selectedWaitingIds.add(clickedSession.delivery.id);
      } else {
        DeliverySystem.selectedWaitingIds.add(waiting[0].delivery.id);
      }
      uiState.doorQueueModalOpen = true;
      if (document.exitPointerLock) document.exitPointerLock();
      renderDoorQueueModal();
      if (doorQueueModal) doorQueueModal.classList.add('active');
      hooks.syncPhase2ContainerClasses();
      SoundSystem.playButtonClick();
    }

    function closeDoorQueueModal(silent) {
      const wasOpen = uiState.doorQueueModalOpen;
      uiState.doorQueueModalOpen = false;
      if (doorQueueModal) doorQueueModal.classList.remove('active');
      hooks.syncPhase2ContainerClasses();
      if (wasOpen && !silent) {
        SoundSystem.playButtonClick();
      }
    }

    if (dqCloseBtn) {
      dqCloseBtn.addEventListener('click', () => {
        closeDoorQueueModal();
      });
    }
    if (dqToggleAllBtn) {
      dqToggleAllBtn.addEventListener('click', () => {
        const waiting = DeliverySystem.getWaitingOutsideSessions();
        const allSelected = waiting.length > 0 && waiting.every((s) => DeliverySystem.selectedWaitingIds.has(s.delivery.id));
        DeliverySystem.selectedWaitingIds.clear();
        if (!allSelected) {
          waiting.forEach((s) => DeliverySystem.selectedWaitingIds.add(s.delivery.id));
        }
        SoundSystem.playButtonClick();
        renderDoorQueueModal();
      });
    }
    if (dqLetSelectedBtn) {
      dqLetSelectedBtn.addEventListener('click', () => {
        const ids = Array.from(DeliverySystem.selectedWaitingIds);
        closeDoorQueueModal(true);
        DeliverySystem.letSelectedIn(ids);
        SoundSystem.playSuccessChime();
      });
    }
    if (dqLetAllBtn) {
      dqLetAllBtn.addEventListener('click', () => {
        const ids = DeliverySystem.getWaitingOutsideSessions().map((s) => s.delivery.id);
        closeDoorQueueModal(true);
        DeliverySystem.letSelectedIn(ids);
        SoundSystem.playSuccessChime();
      });
    }


    return {
      DELIVERY_MANIFEST,
      DeliverySystem,
      renderInvoiceDocument,
      openInvoice,
      closeInvoice,
      openWarehouseBol,
      closeWarehouseBol,
      exitOverageFlagMode,
      closeShortageQtyModal,
      openSideDoor,
      closeSideDoor,
      renderPendingDeliveriesPanel,
      togglePendingDeliveriesPanel,
      renderDoorQueueModal,
      openDoorQueueModal,
      closeDoorQueueModal,
      btnToggleScannerFromInv
    };
  }

  global.WarehouseDelivery = {
    createController
  };
})(window);
