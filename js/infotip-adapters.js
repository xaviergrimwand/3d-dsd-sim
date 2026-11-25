(function (global) {
  'use strict';

  /**
   * InfotipAdapters - Maps live runtime entities (DSD boxes, backroom/supply cases,
   * claims/recall props, facility/door controls, equipment, drivers, and held states)
   * into normalized Tabulated Infotip spec objects for InfotipRenderer.
   */

  function resolveDeptLabel(deptNo, catalog) {
    const clean = String(deptNo || '').replace(/\D/g, '').padStart(2, '0').slice(-2);
    if (!clean || clean === '00') return '';
    const dObj = catalog && typeof catalog.getDepartment === 'function' ? catalog.getDepartment(clean) : null;
    const dName = dObj && dObj.name ? String(dObj.name) : '';
    return dName ? (`D${clean} ${dName}`) : (`D${clean}`);
  }

  function buildCaseMeta(item, extra, ctx) {
    const c = item || {};
    const x = extra || {};
    const context = ctx || {};
    const catalog = context.catalog || global.DSDCatalog || null;
    const code = String(c.code || '').trim();
    const prod = (catalog && code && typeof catalog.getProduct === 'function') ? catalog.getProduct(code) : null;

    const unitsPerCase = Math.max(1, Number(c.unitsPerCase || (prod && prod.unitsPerCase) || 1));
    const unitCostRaw = c.unitCost !== undefined
      ? Number(c.unitCost)
      : (c.price !== undefined ? Number(c.price) : (prod && prod.price !== undefined ? Number(prod.price) : NaN));
    const unitCost = Number.isFinite(unitCostRaw) ? unitCostRaw : undefined;
    const caseCostRaw = c.caseCost !== undefined
      ? Number(c.caseCost)
      : (unitCost !== undefined ? unitCost * unitsPerCase : NaN);
    const caseCost = Number.isFinite(caseCostRaw) ? caseCostRaw : undefined;

    let deptNo = c.deptNo || (c.delivery && c.delivery.deptNo) || '';
    if (!deptNo && code && catalog && typeof catalog.getProductDeptNo === 'function') {
      deptNo = catalog.getProductDeptNo(code) || '';
    }
    let vendorNo = String(c.vendorNo || (x.vendorNo || '') || (c.delivery && c.delivery.vendorNo) || '').trim();
    let vendorName = String(c.vendorName || x.vendorName || (c.delivery && (c.delivery.carrier || c.delivery.vendor)) || '').trim();
    if (!vendorNo && code && catalog && Array.isArray(catalog.allVendorEntries)) {
      const ve = catalog.allVendorEntries.find((v) => v && Array.isArray(v.products) && v.products.some((p) => String(p.code) === code));
      if (ve) {
        vendorNo = String(ve.vendorNo || '').trim();
        if (!vendorName) vendorName = String(ve.name || '').trim();
      }
    }
    if (!vendorNo && prod && prod.warehouseOnly) {
      const cleanD = String(deptNo || '').padStart(2, '0');
      vendorNo = cleanD === '60' ? '601' : '011';
    }
    if (!vendorName && vendorNo && catalog && typeof catalog.getVendor === 'function') {
      const vObj = catalog.getVendor(vendorNo);
      if (vObj && vObj.name) vendorName = vObj.name;
    }
    if (!vendorName && vendorNo === '011') vendorName = 'Apex Logistics';

    const meta = {
      dept: x.dept || resolveDeptLabel(deptNo, catalog) || undefined,
      vendorNo: vendorNo || undefined,
      vendorName: vendorName || undefined,
      unitsPerCase: unitsPerCase,
      unitCost: unitCost,
      caseCost: caseCost
    };

    if (Number(x.stackCases) > 1) {
      meta.stackCases = Number(x.stackCases);
      meta.stackUnits = Number(x.stackUnits) || (meta.stackCases * unitsPerCase);
    }
    if (x.binState) meta.binState = x.binState;
    if (x.binCode) meta.binCode = x.binCode;
    if (typeof x.labeled === 'boolean') meta.labeled = x.labeled;
    if (typeof x.inventoried === 'boolean') meta.inventoried = x.inventoried;
    if (Number.isFinite(Number(x.auditedQty))) meta.auditedQty = Number(x.auditedQty);
    if (x.supply) meta.supply = true;
    return meta;
  }

  function resolveBoxDelivery(box, ctx) {
    const context = ctx || {};
    const ds = context.deliverySystem || global.DeliverySystem || null;
    const delivId = box && (box.deliveryId || (context.hoveredBoxMesh && context.hoveredBoxMesh.userData && context.hoveredBoxMesh.userData.deliveryId));
    if (ds && delivId && typeof ds.getSessionForDelivery === 'function') {
      const sess = ds.getSessionForDelivery(delivId);
      if (sess && sess.delivery) return sess.delivery;
    }
    return (ds && ds.activeDelivery) || null;
  }

  function adaptPhysicalBox(hb, ctx) {
    if (!hb) return null;
    const context = ctx || {};
    const deliv = resolveBoxDelivery(hb, context);
    const overageMode = Boolean(context.overageDeliveryId);
    const isCredit = Boolean(hb.isCredit);
    const isPlu = Boolean(hb.notScannable);
    const code = String(hb.code || '0000');
    const codeChip = { cls: isPlu ? 'plu' : 'mono', text: (isPlu ? 'PLU ' : 'UPC ') + code };
    const subtitle = (deliv && (deliv.carrier || deliv.vendor))
      ? `${deliv.carrier || deliv.vendor}${deliv.type === 'sidedoor' ? ' DSD Cart' : (deliv.dockBay ? ' · Dock ' + deliv.dockBay : '')}`
      : 'DSD Delivery Freight';

    const meta = buildCaseMeta(hb, {
      dept: deliv && deliv.deptNo ? resolveDeptLabel(deliv.deptNo, context.catalog) : undefined,
      vendorNo: deliv && deliv.vendorNo ? String(deliv.vendorNo) : undefined,
      vendorName: deliv && (deliv.carrier || deliv.vendor) ? String(deliv.carrier || deliv.vendor) : undefined
    }, context);

    if (isCredit) {
      return {
        tone: 'credit',
        icon: 'tote',
        title: hb.name || 'Vendor Credit Item',
        subtitle: subtitle || 'Red Credit Tote Return',
        catChip: 'CREDIT 1u',
        meta: meta,
        chips: [codeChip, { cls: 'status-credit', text: hb.scanned ? '✓ CREDIT LOGGED' : 'NEG VENDOR CREDIT' }],
        actions: [{
          key: 'Click',
          touch: 'SCAN BOX',
          touchCls: 'scan',
          verb: hb.scanned ? 'Credit Return Recorded' : 'Scan Return Credit Item'
        }]
      };
    }

    if (overageMode) {
      return {
        tone: 'overage',
        icon: 'flag',
        title: hb.name || 'DSD Case',
        subtitle: subtitle,
        catChip: hb.overageFlagged ? 'OVERAGE FLAGGED' : 'OVERAGE MODE',
        meta: meta,
        chips: [codeChip],
        actions: [{
          key: 'Click',
          touch: 'OVERAGE',
          touchCls: 'use',
          verb: hb.overageFlagged ? 'Unflag Overage Case' : 'Flag Case as Overage'
        }]
      };
    }

    if (hb.overageFlagged) {
      return {
        tone: 'overage',
        icon: 'flag',
        title: hb.name || 'DSD Case',
        subtitle: subtitle,
        catChip: 'OVERAGE',
        meta: meta,
        chips: [codeChip, { cls: 'status-overage', text: 'OVERAGE FLAGGED' }],
        actions: [{
          key: 'Click',
          touch: 'INFO',
          touchCls: 'neutral',
          verb: 'Leave Excess Freight on Cart / Pallet'
        }]
      };
    }

    if (hb.scanned) {
      return {
        tone: 'ok',
        icon: 'barcode',
        title: hb.name || 'DSD Case',
        subtitle: subtitle,
        catChip: 'SCANNED',
        catChipCls: 'hdr-ok',
        meta: meta,
        chips: [codeChip, { cls: 'status-ok', text: '✓ INPUTTED' }],
        actions: [{
          key: 'Click',
          touch: 'SCAN BOX',
          touchCls: 'scan',
          verb: 'Scan Next Duplicate Case'
        }]
      };
    }

    if (isPlu) {
      return {
        tone: 'ok',
        icon: 'plu',
        title: hb.name || 'Produce Case',
        subtitle: subtitle,
        catChip: 'PLU ONLY',
        meta: meta,
        chips: [codeChip, { text: 'NO BARCODE' }],
        actions: [{
          key: 'Type PLU',
          touch: 'KEYPAD',
          touchCls: 'scan',
          verb: `Enter PLU ${code} + ENT on Scanner`
        }]
      };
    }

    return {
      tone: 'info',
      icon: 'barcode',
      title: hb.name || 'DSD Case',
      subtitle: subtitle,
      catChip: 'DSD CASE',
      meta: meta,
      chips: [codeChip, { text: 'PENDING SCAN' }],
      actions: [
        { key: 'Click', touch: 'SCAN BOX', touchCls: 'scan', verb: 'Scan Case Barcode' },
        { key: 'F', touch: 'SCANNER', touchCls: 'scan', verb: 'Open Handheld Scanner' }
      ]
    };
  }

  function isCaseSupply(c, racks) {
    if (!c) return false;
    if (racks && typeof racks.isSupplyCase === 'function') {
      return Boolean(racks.isSupplyCase(c));
    }
    return Boolean(String(c.deptNo || '') === '60' || String(c.vendorNo || '') === '601' || c.targetRackId === 'claims_steel');
  }

  function formatBinLabel(c, racks) {
    if (!c || !c.placedOnRack || !c.rackSlot) return '';
    if (racks && typeof racks.formatSlotDesignation === 'function') {
      return racks.formatSlotDesignation(c.rackSlot);
    }
    return '';
  }

  function adaptLabelCase(lc, ctx) {
    if (!lc) return null;
    const context = ctx || {};
    const racks = context.racks || global.BackstockRacks || null;
    const isSupply = isCaseSupply(lc, racks);
    const isPlu = Boolean(lc.notScannable && !lc.labeled && !isSupply);
    const isTouch = Boolean(context.isTouch);
    const code = String(lc.code || '0000');
    const codeChip = { cls: isPlu ? 'plu' : 'mono', text: (isSupply ? 'SKU ' : (isPlu ? 'PLU ' : 'UPC ')) + code };
    const meta = buildCaseMeta(lc, {
      binState: (lc.placedOnRack && lc.rackSlot) ? 'binned' : 'unbinned',
      binCode: formatBinLabel(lc, racks) || undefined,
      labeled: isSupply ? undefined : Boolean(lc.labeled),
      supply: isSupply
    }, context);

    if (isSupply) {
      return {
        tone: 'warn',
        icon: 'tag',
        title: lc.name || 'Store Supply Case',
        subtitle: 'Dept 60 Store Supply',
        catChip: 'EXEMPT',
        catChipCls: 'hdr-warn',
        meta: meta,
        chips: [codeChip, { cls: 'cond-warn', text: 'STAYS WHITE · NO LABEL REQ' }],
        actions: [{ key: 'Info', touch: 'INFO', touchCls: 'neutral', verb: 'No Barcode Labeling Required' }]
      };
    }

    if (lc.labeled) {
      return {
        tone: 'ok',
        icon: 'tag',
        title: lc.name || 'Labeled Case',
        subtitle: meta.binState === 'binned' ? 'Backstock Steel' : 'Floor Pallet',
        catChip: 'LABELED',
        catChipCls: 'hdr-ok',
        meta: meta,
        chips: [{ cls: 'mono', text: 'UPC ' + code }, { cls: 'status-ok', text: '✓ YELLOW INVENTORY STICKER' }],
        actions: [{ key: 'Done', touch: 'LABELED', touchCls: 'neutral', verb: 'Ready for Receiving & Audit' }]
      };
    }

    if (isPlu) {
      return {
        tone: 'label',
        icon: 'tag',
        title: lc.name || 'Produce Case',
        subtitle: 'Manual PLU Sticker Required',
        catChip: 'LABELING',
        meta: meta,
        chips: [codeChip, { text: 'YELLOW LABEL REQ' }],
        actions: [{
          key: 'Click',
          touch: 'SCAN CASE',
          touchCls: 'scan',
          verb: isTouch ? `Pull Info -> Keypad PLU ${code} + ENT + Print` : `Pull Info -> Type PLU ${code} + ENT + [F6]`
        }]
      };
    }

    return {
      tone: 'label',
      icon: 'tag',
      title: lc.name || 'Unlabeled Case',
      subtitle: meta.binState === 'binned' ? 'Backstock Steel' : 'Floor Pallet',
      catChip: 'LABELING',
      meta: meta,
      chips: [codeChip, { text: 'YELLOW LABEL REQ' }],
      actions: [{ key: 'Click', touch: 'SCAN CASE', touchCls: 'scan', verb: 'Scan Case to Print Yellow UPC Label' }]
    };
  }

  function adaptInventoryCase(ic, ctx) {
    if (!ic) return null;
    const context = ctx || {};
    const racks = context.racks || global.BackstockRacks || null;
    const isPlaced = Boolean(ic.placedOnRack && ic.rackSlot);
    const isEligible = isPlaced && racks && typeof racks.isInventoryEligibleRack === 'function'
      ? racks.isInventoryEligibleRack(ic.rackSlot.rackId)
      : isPlaced;
    const binLabel = formatBinLabel(ic, racks);
    const isSupply = isCaseSupply(ic, racks);
    const auditInfo = (racks && typeof racks.getCaseAuditInfo === 'function')
      ? racks.getCaseAuditInfo(ic)
      : { auditedQty: ic.auditedQty || 0 };
    const stackCases = Math.max(1, Number(ic.linkedCount) || 1);
    const unitsPerCase = Math.max(1, Number(ic.unitsPerCase) || 1);
    const code = String(ic.code || '0000');

    const meta = buildCaseMeta(ic, {
      stackCases: stackCases,
      stackUnits: Number(ic.linkedChainQty) || (stackCases * unitsPerCase),
      binState: isPlaced ? 'binned' : 'unbinned',
      binCode: binLabel || undefined,
      labeled: isSupply ? undefined : Boolean(ic.labeled),
      inventoried: isSupply ? undefined : Boolean(ic.inventoried),
      auditedQty: auditInfo && Number.isFinite(Number(auditInfo.auditedQty)) ? Number(auditInfo.auditedQty) : undefined,
      supply: isSupply
    }, context);

    if (!isPlaced) {
      return {
        tone: 'crit',
        icon: 'shelf',
        title: ic.name || 'Unplaced Case',
        subtitle: 'Still on Floor Pallet',
        catChip: 'BLOCKED',
        catChipCls: 'hdr-crit',
        meta: meta,
        chips: [{ cls: ic.notScannable ? 'plu' : 'mono', text: (ic.notScannable ? 'PLU ' : 'UPC ') + code }, { cls: 'cond-crit', text: 'UNPLACED ON STEEL' }],
        actions: [{ key: 'E / Click', touch: 'PICK UP', touchCls: 'use', verb: 'Pick Up & Place on Steel First' }]
      };
    }

    if (!isEligible || isSupply) {
      return {
        tone: 'warn',
        icon: 'box',
        title: ic.name || 'Store Supply Case',
        subtitle: 'Claims & Supplies Steel',
        catChip: 'DEPT 60 SUPPLY',
        catChipCls: 'hdr-warn',
        meta: meta,
        chips: [{ cls: 'mono', text: 'SKU ' + code }, { cls: 'cond-warn', text: 'NOT AUDITABLE — USE SUPPLY ORDER' }],
        actions: [{ key: 'F', touch: 'SCAN SKU', touchCls: 'scan', verb: 'Use Supply Order Mode on Scanner' }]
      };
    }

    if (ic.notScannable && !ic.labeled) {
      return {
        tone: 'label',
        icon: 'tag',
        title: ic.name || 'Unlabeled PLU Case',
        subtitle: 'Backstock Steel · Needs Label First',
        catChip: 'NEEDS LABEL',
        meta: meta,
        chips: [{ cls: 'plu', text: 'PLU ' + code }, { text: 'YELLOW LABEL REQ' }],
        actions: [{ key: 'Blocked', touch: 'BLOCKED', touchCls: 'use', verb: 'Print Yellow Label Before Audit' }]
      };
    }

    if (ic.inventoried) {
      const qty = Number(auditInfo && auditInfo.auditedQty) || meta.stackUnits || unitsPerCase;
      return {
        tone: 'ok',
        icon: 'shelf',
        title: ic.name || 'Audited Case',
        subtitle: 'Backstock Steel · Count Verified',
        catChip: 'INVENTORIED',
        catChipCls: 'hdr-ok',
        meta: meta,
        chips: [{ cls: 'mono', text: 'UPC ' + code }],
        actions: [{ key: 'Click', touch: 'SCAN CASE', touchCls: 'scan', verb: `Adjust Audited Count (${qty}u)` }]
      };
    }

    return {
      tone: 'info',
      icon: 'shelf',
      title: ic.name || 'Backstock Case',
      subtitle: 'Backstock Steel · Ready for Count',
      catChip: 'BIN ' + (binLabel || 'BACKSTOCK'),
      meta: meta,
      chips: [{ cls: ic.notScannable ? 'plu' : 'mono', text: (ic.notScannable ? 'PLU ' : 'UPC ') + code }],
      actions: [{ key: 'Click', touch: 'SCAN CASE', touchCls: 'scan', verb: 'Scan & Submit Shelf Count' }]
    };
  }

  function adaptSupplyCase(scBox, ctx) {
    if (!scBox) return null;
    const context = ctx || {};
    const racks = context.racks || global.BackstockRacks || null;
    const dr = context.receipts || global.DSDReceipts || null;
    const isSupply = isCaseSupply(scBox, racks);
    const orderLocked = context.supplyLocked !== undefined
      ? Boolean(context.supplyLocked)
      : Boolean(dr && typeof dr.isSupplyOrderSubmittedToday === 'function' && dr.isSupplyOrderSubmittedToday());
    const isPlaced = Boolean(scBox.placedOnRack && scBox.rackSlot);
    const binLabel = formatBinLabel(scBox, racks);
    const stackCases = Math.max(1, Number(scBox.linkedCount) || 1);
    const code = String(scBox.code || '6000');
    const meta = buildCaseMeta(scBox, {
      stackCases: stackCases,
      stackUnits: Number(scBox.linkedChainQty) || (stackCases * Math.max(1, Number(scBox.unitsPerCase) || 1)),
      binState: isPlaced ? 'binned' : 'unbinned',
      binCode: binLabel || undefined,
      supply: isSupply
    }, context);

    if (!isSupply) {
      return {
        tone: 'warn',
        icon: 'box',
        title: scBox.name || 'Merchandise Case',
        subtitle: 'Backstock Inventory Item',
        catChip: 'WRONG MODE',
        catChipCls: 'hdr-warn',
        meta: meta,
        chips: [{ cls: scBox.notScannable ? 'plu' : 'mono', text: (scBox.notScannable ? 'PLU ' : 'UPC ') + code }, { cls: 'cond-warn', text: 'NOT DEPT 60 SUPPLY — USE INVENTORY' }],
        actions: [{ key: 'Blocked', touch: 'BLOCKED', touchCls: 'use', verb: 'Use Backroom Inventory Mode on Scanner' }]
      };
    }

    if (orderLocked) {
      return {
        tone: 'warn',
        icon: 'box',
        title: scBox.name || 'Store Supply Case',
        subtitle: isPlaced ? 'Claims & Supplies Steel' : 'Supply Delivery Floor Pallet',
        catChip: 'LOCKED',
        catChipCls: 'hdr-warn',
        meta: meta,
        chips: [{ cls: 'mono', text: 'SKU ' + code }, { cls: 'cond-warn', text: 'ORDER FINALIZED TODAY' }],
        actions: [{ key: 'Next Shift', touch: 'FINALIZED', touchCls: 'scan', verb: 'Supply Order Locked Until Next Shift' }]
      };
    }

    return {
      tone: 'ok',
      icon: 'barcode',
      title: scBox.name || 'Store Supply Case',
      subtitle: isPlaced ? 'Claims & Supplies Steel' : 'Supply Delivery Floor Pallet',
      catChip: 'SUPPLY SKU',
      catChipCls: 'hdr-ok',
      meta: meta,
      chips: [{ cls: 'mono', text: 'SKU ' + code }, { cls: 'status-ok', text: 'READY TO ORDER' }],
      actions: [{ key: 'Click', touch: 'SCAN SKU', touchCls: 'scan', verb: 'Scan SKU into Next-Day Order' }]
    };
  }

  function adaptBackstockCase(bc, ctx) {
    if (!bc) return null;
    const context = ctx || {};
    const racks = context.racks || global.BackstockRacks || null;
    const dr = context.receipts || global.DSDReceipts || null;
    const pickCheck = (racks && typeof racks.canPickupCase === 'function')
      ? racks.canPickupCase(bc)
      : { ok: true };
    const isPickBlocked = Boolean(pickCheck && !pickCheck.ok);
    const isSupply = isCaseSupply(bc, racks);
    const isPlaced = Boolean(bc.placedOnRack && bc.rackSlot);
    const binLabel = formatBinLabel(bc, racks);
    const stackCases = Math.max(1, Number(bc.linkedCount) || 1);
    const unitsPerCase = Math.max(1, Number(bc.unitsPerCase) || 1);
    const auditInfo = (racks && typeof racks.getCaseAuditInfo === 'function')
      ? racks.getCaseAuditInfo(bc)
      : { auditedQty: bc.auditedQty || 0 };
    const code = String(bc.code || '0000');

    const meta = buildCaseMeta(bc, {
      stackCases: stackCases,
      stackUnits: Number(bc.linkedChainQty) || (stackCases * unitsPerCase),
      binState: isPlaced ? 'binned' : 'unbinned',
      binCode: binLabel || undefined,
      labeled: isSupply ? undefined : Boolean(bc.labeled),
      inventoried: isSupply ? undefined : Boolean(bc.inventoried),
      auditedQty: auditInfo && Number.isFinite(Number(auditInfo.auditedQty)) ? Number(auditInfo.auditedQty) : undefined,
      supply: isSupply
    }, context);

    if (isPickBlocked) {
      return {
        tone: 'crit',
        icon: 'claim',
        title: bc.name || 'Backstock Case',
        subtitle: isPlaced ? `Shelf ${binLabel || ''}` : 'Floor Pallet',
        catChip: 'BLOCKED',
        catChipCls: 'hdr-crit',
        meta: meta,
        chips: [{ cls: 'mono', text: (isSupply ? 'SKU ' : 'UPC ') + code }, { cls: 'cond-crit', text: pickCheck.reason || 'PULL TOP CASES FIRST' }],
        actions: [{ key: 'Blocked', touch: 'BLOCKED', touchCls: 'use', verb: pickCheck.reason || 'Pull Top Cases First' }]
      };
    }

    if (isSupply) {
      const orderLocked = context.supplyLocked !== undefined
        ? Boolean(context.supplyLocked)
        : Boolean(dr && typeof dr.isSupplyOrderSubmittedToday === 'function' && dr.isSupplyOrderSubmittedToday());
      const actions = [{ key: 'E / Click', touch: 'PICK UP', touchCls: 'use', verb: isPlaced ? `Pull Supply Case from ${binLabel || '060'}` : 'Pick Up & Slot on 060 Steel' }];
      if (!orderLocked) actions.push({ key: 'F', touch: 'SCAN SKU', touchCls: 'scan', verb: 'Order SKU in Supply Mode' });
      return {
        tone: isPlaced ? 'info' : 'warn',
        icon: isPlaced ? 'shelf' : 'box',
        title: bc.name || 'Store Supply Case',
        subtitle: isPlaced ? 'Claims & Supplies Steel' : 'Supply Delivery Floor Pallet',
        catChip: isPlaced ? (`BIN ${binLabel || '060'}`) : 'UNBINNED',
        meta: meta,
        chips: [{ cls: 'mono', text: 'SKU ' + code }],
        actions: actions
      };
    }

    const actions = [{
      key: 'E / Click',
      touch: 'PICK UP',
      touchCls: 'use',
      verb: isPlaced ? 'Pull Top Case from Shelf' : 'Pick Up & Slot on Matching Room Steel'
    }];

    if (isPlaced) {
      const invDone = context.inventoryLocked !== undefined
        ? Boolean(context.inventoryLocked)
        : Boolean(dr && typeof dr.isInventoryAuditFinalized === 'function' && dr.isInventoryAuditFinalized());
      if (!(bc.notScannable && !bc.labeled) && !invDone) {
        actions.push({ key: 'F', touch: 'SCAN CASE', touchCls: 'scan', verb: 'Audit Shelf Count on Scanner' });
      }
      return {
        tone: bc.inventoried ? 'ok' : (bc.labeled ? 'info' : 'label'),
        icon: 'shelf',
        title: bc.name || 'Backstock Case',
        subtitle: 'Backstock Steel',
        catChip: bc.inventoried ? 'INVENTORIED' : (`BIN ${binLabel || ''}`),
        catChipCls: bc.inventoried ? 'hdr-ok' : '',
        meta: meta,
        chips: [{ cls: bc.notScannable ? 'plu' : 'mono', text: (bc.notScannable ? 'PLU ' : 'UPC ') + code }],
        actions: actions
      };
    }

    if (!bc.labeled && !bc.notScannable) {
      actions.push({ key: 'F', touch: 'SCAN CASE', touchCls: 'scan', verb: 'Print Yellow Label on Scanner' });
    }
    return {
      tone: bc.labeled ? 'ok' : 'label',
      icon: bc.labeled ? 'box' : 'tag',
      title: bc.name || 'Backstock Case',
      subtitle: 'Floor Pallet',
      catChip: bc.labeled ? 'UNBINNED · LABELED' : 'UNBINNED · UNLABELED',
      meta: meta,
      chips: [{ cls: bc.notScannable ? 'plu' : 'mono', text: (bc.notScannable ? 'PLU ' : 'UPC ') + code }],
      actions: actions
    };
  }

  function adaptBackstockTarget(tgt, ctx) {
    if (!tgt) return null;
    const context = ctx || {};
    const racks = context.racks || global.BackstockRacks || null;
    const held = context.heldCase || (racks && typeof racks.getHeldCase === 'function' ? racks.getHeldCase() : null);

    if (tgt.type === 'slot' && tgt.slot) {
      const binCode = racks && typeof racks.formatSlotDesignation === 'function'
        ? racks.formatSlotDesignation(tgt.slot)
        : '';
      const rackName = racks && typeof racks.getRackDisplayName === 'function'
        ? racks.getRackDisplayName(tgt.slot.rackId)
        : 'Backstock Steel';

      if (!tgt.valid) {
        return {
          tone: 'crit',
          icon: 'shelf',
          title: `${rackName}${binCode ? ' ' + binCode : ''}`,
          subtitle: held ? `Carrying: ${held.name}` : 'Steel Shelf Slot',
          catChip: 'BLOCKED',
          catChipCls: 'hdr-crit',
          chips: [{ cls: 'cond-crit', text: tgt.reason || 'CANNOT PLACE CASE HERE' }],
          actions: [{ key: 'Blocked', touch: 'BLOCKED', touchCls: 'use', verb: tgt.reason || 'Match Storage Room / Size' }]
        };
      }

      const linkedCount = Number(tgt.linkedCount) || 1;
      const linkedQty = Number(tgt.linkedRowQty) || (held ? Number(held.unitsPerCase) || 1 : 0);
      return {
        tone: 'ok',
        icon: 'shelf',
        title: `${rackName}${binCode ? ' ' + binCode : ''}`,
        subtitle: held ? `Carrying: ${held.name}` : 'Valid Steel Slot',
        catChip: 'VALID SLOT',
        catChipCls: 'hdr-ok',
        chips: [
          linkedCount > 1
            ? { cls: 'status-ok', text: `LINK ROW ×${linkedCount} · ${linkedQty}u` }
            : { cls: 'status-ok', text: 'SLOT READY' },
          binCode ? { text: `BIN ${binCode}` } : null
        ].filter(Boolean),
        actions: [{ key: 'E / Click', touch: 'PLACE', touchCls: 'use', verb: linkedCount > 1 ? 'Place & Link Case on Shelf' : 'Place Case on Shelf' }]
      };
    }

    const palletLabel = (tgt.pallet && tgt.pallet.label) || 'Pallet';
    return {
      tone: tgt.valid === false ? 'crit' : 'info',
      icon: 'box',
      title: palletLabel,
      subtitle: held ? `Carrying: ${held.name}` : 'Backstock Floor Pallet',
      catChip: tgt.valid === false ? 'BLOCKED' : 'SET BACK',
      catChipCls: tgt.valid === false ? 'hdr-crit' : '',
      chips: tgt.valid === false ? [{ cls: 'cond-crit', text: tgt.reason || 'CANNOT SET BACK HERE' }] : [],
      actions: [{
        key: tgt.valid === false ? 'Blocked' : 'E / Click',
        touch: tgt.valid === false ? 'BLOCKED' : 'PLACE',
        touchCls: 'use',
        verb: tgt.valid === false ? (tgt.reason || 'Cannot place here') : `Set Case Back on ${palletLabel}`
      }]
    };
  }

  function getClaimsApi(ctx) {
    return (ctx && ctx.claims) || global.ClaimsTotes || null;
  }

  function adaptClaimsTote(tote, ctx) {
    if (!tote) return null;
    const claims = getClaimsApi(ctx);
    if (tote.isRed) {
      return {
        tone: 'credit',
        icon: 'tote',
        title: tote.label || 'Red Vendor Credit Tote',
        subtitle: 'Fixed on Shelf · Vendor Credit Storage',
        catChip: 'CREDIT TOTE',
        chips: [{ cls: 'status-credit', text: 'STORED UNTIL VENDOR\'S NEXT DELIVERY' }],
        actions: [{
          key: 'Blocked',
          touch: 'BLOCKED',
          touchCls: 'use',
          verb: 'Credits Are Stored Here Until Vendor\'s Next Delivery'
        }]
      };
    }

    const summary = (claims && typeof claims.getGrayToteSummary === 'function')
      ? claims.getGrayToteSummary(tote)
      : null;
    const itemCount = summary ? Number(summary.itemCount || 0) : 0;
    return {
      tone: tote.isOpen ? 'warn' : 'info',
      icon: 'tote',
      title: `${tote.label || 'Shelf'} Gray Claims Tote`,
      subtitle: `${itemCount} Damaged / Returned Item${itemCount === 1 ? '' : 's'}`,
      catChip: tote.isOpen ? 'TIPPED OPEN' : 'CLOSED TOTE',
      catChipCls: tote.isOpen ? 'hdr-warn' : '',
      chips: [
        { text: `${itemCount} ITEM${itemCount === 1 ? '' : 'S'} INSIDE` },
        { text: tote.isOpen ? 'OPENED FORWARD' : 'CLOSED UPRIGHT' }
      ],
      actions: [{
        key: 'E / Click',
        touch: tote.isOpen ? 'CLOSE TOTE' : 'OPEN TOTE',
        touchCls: 'use',
        verb: tote.isOpen ? 'Push Tote Back Upright' : 'Tip Tote Forward to Inspect'
      }]
    };
  }

  function adaptClaimsItem(item, ctx) {
    if (!item) return null;
    const context = ctx || {};
    const claims = getClaimsApi(context);
    const condText = item.conditionLabel || 'Damaged';
    const dispText = (item.scannerConfirmed && claims && typeof claims.getReceptacleLabel === 'function')
      ? claims.getReceptacleLabel(item.confirmedDisposition)
      : (item.confirmedDisposition ? String(item.confirmedDisposition).toUpperCase() : '');

    const codeStr = String(item.code || '').trim();
    const isPlu = Boolean(item.notScannable);
    const isSupply = Boolean(String(item.deptNo || '') === '60' || String(item.vendorNo || '') === '601');
    const codePrefix = isPlu ? 'PLU ' : (isSupply ? 'SKU ' : 'UPC ');
    const codeChip = codeStr ? { cls: isPlu ? 'plu' : 'mono', text: codePrefix + codeStr } : null;
    const meta = buildCaseMeta(item, { supply: isSupply || undefined }, context);

    if (item.scannerConfirmed) {
      return {
        tone: 'ok',
        icon: 'claim',
        title: item.name || 'Claim Item',
        subtitle: 'Disposition Verified via Scanner',
        catChip: 'CONFIRMED',
        catChipCls: 'hdr-ok',
        meta: meta,
        chips: [
          codeChip,
          { cls: 'cond-crit', text: `CONDITION: ${condText.toUpperCase()}` },
          { cls: 'status-ok', text: dispText ? `✓ -> ${dispText}` : '✓ CONFIRMED' }
        ].filter(Boolean),
        actions: [{ key: 'E / Click', touch: 'TAKE ITEM', touchCls: 'use', verb: `Pick Up & Carry to ${dispText || 'Receptacle'}` }]
      };
    }

    return {
      tone: isPlu ? 'label' : 'info',
      icon: 'claim',
      title: item.name || 'Damaged / Claim Item',
      subtitle: isPlu ? 'Tipped Claims Tote · PLU Item (Key Code)' : 'Tipped Claims Tote Item · Needs Scan',
      catChip: isPlu ? 'PLU · UNSCANNED' : 'UNSCANNED',
      meta: meta,
      chips: [
        codeChip,
        { cls: 'cond-warn', text: `CONDITION: ${condText.toUpperCase()}` },
        isPlu ? { cls: 'cond-warn', text: 'MUST TYPE PLU CODE ON SCANNER' } : null
      ].filter(Boolean),
      actions: [{
        key: 'Click / F',
        touch: 'SCAN CLAIM',
        touchCls: 'scan',
        verb: isPlu ? 'Open Claims & Type PLU Code' : 'Scan UPC & Confirm Disposition'
      }]
    };
  }

  function adaptRecallItem(item, ctx) {
    if (!item) return null;
    const context = ctx || {};
    const holdingTote = Boolean(context.holdingRecallTote);
    if (holdingTote) {
      return {
        tone: 'ok',
        icon: 'tote',
        title: item.name || 'Recalled Product',
        subtitle: 'Recall Cart Top Shelf',
        catChip: 'COLLECT',
        catChipCls: 'hdr-ok',
        chips: [{ cls: 'status-ok', text: 'RECALL TOTE IN HAND' }],
        actions: [{ key: 'E / Click', touch: 'COLLECT', touchCls: 'use', verb: `Collect ${item.name || 'Unit'} into Recall Tote` }]
      };
    }
    return {
      tone: 'warn',
      icon: 'box',
      title: item.name || 'Recalled Product',
      subtitle: 'Recall Cart Top Shelf · Audit Prep',
      catChip: 'RECALL ITEM',
      catChipCls: 'hdr-warn',
      chips: [{ cls: 'cond-warn', text: 'PICK UP GRAY TOTE BELOW OR MOVE TO COUNT' }],
      actions: [{ key: 'E / Click', touch: 'MOVE ITEM', touchCls: 'use', verb: 'Move Unit on Shelf to Count Stock' }]
    };
  }

  function adaptRecallArrangeSpot(rs) {
    const itemName = (rs && rs.movingItemName) ? rs.movingItemName : 'Item';
    return {
      tone: 'info',
      icon: 'shelf',
      title: 'Recall Cart Top Shelf',
      subtitle: `Holding: ${itemName}`,
      catChip: 'PLACE ON SHELF',
      actions: [{ key: 'E / Click', touch: 'PLACE', touchCls: 'use', verb: `Set ${itemName} Back on Top Shelf` }]
    };
  }

  function adaptRecallBottomDock() {
    return {
      tone: 'info',
      icon: 'tote',
      title: 'Recall Cart Bottom Shelf',
      subtitle: 'Recall Tote Staging Dock',
      catChip: 'SET TOTE',
      actions: [{ key: 'E / Click', touch: 'SET TOTE', touchCls: 'use', verb: 'Set Recall Tote on Bottom Shelf' }]
    };
  }

  function adaptRecallTote(ctx) {
    const claims = getClaimsApi(ctx);
    const rs = (claims && typeof claims.getRecallState === 'function') ? claims.getRecallState() : null;
    return {
      tone: 'ok',
      icon: 'tote',
      title: 'Small Gray Recall Tote',
      subtitle: (rs && rs.productName) ? `Active Recall: ${rs.productName}` : 'Recall Cart Bottom Shelf',
      catChip: 'RECALL TOTE',
      catChipCls: 'hdr-ok',
      actions: [{ key: 'E / Click', touch: 'TAKE TOTE', touchCls: 'use', verb: 'Pick Up Gray Recall Tote' }]
    };
  }

  function adaptClaimsReceptacle(rec, ctx) {
    if (!rec) return null;
    const context = ctx || {};
    const claims = getClaimsApi(ctx);
    const label = String(rec.label || 'RECEPTACLE');
    const isHaz = /HAZWASTE/i.test(label);
    const isOrg = /ORGANICS/i.test(label);

    if (context.holdingRecallTote) {
      const rs = (claims && typeof claims.getRecallState === 'function') ? claims.getRecallState() : null;
      const ready = Boolean(rs && rs.allItemsCollected);
      return {
        tone: ready ? 'ok' : 'warn',
        icon: 'bin',
        title: `${label} Receptacle`,
        subtitle: (rs && rs.productName) ? `Recall Tote: ${rs.productName}` : 'Carrying Recall Tote',
        catChip: ready ? 'DUMP TOTE' : 'INCOMPLETE',
        catChipCls: ready ? 'hdr-ok' : 'hdr-warn',
        chips: [
          ready ? { cls: 'status-ok', text: `${label} READY FOR DUMP` } : { cls: 'cond-warn', text: 'COLLECT REMAINING TOP SHELF ITEMS FIRST' }
        ],
        actions: [{
          key: ready ? 'E / Click' : 'Blocked',
          touch: ready ? 'DUMP TOTE' : 'BLOCKED',
          touchCls: 'use',
          verb: ready ? `Dump Recall Tote in ${label}` : 'Collect All Top Shelf Items First'
        }]
      };
    }

    const heldItem = context.heldClaimsItem || (claims && typeof claims.getHeldItem === 'function' ? claims.getHeldItem() : null);
    if (!heldItem) {
      return {
        tone: isHaz ? 'crit' : 'warn',
        icon: 'bin',
        title: `${label} Receptacle`,
        subtitle: 'Claims Disposal Station · Hold Confirmed Item First',
        catChip: isHaz ? 'HAZWASTE' : (isOrg ? 'ORGANICS' : 'DISPOSAL'),
        catChipCls: isHaz ? 'hdr-crit' : 'hdr-warn',
        chips: [{ text: label }],
        actions: [{
          key: 'Blocked',
          touch: 'BLOCKED',
          touchCls: 'use',
          verb: `Hold Confirmed Claim Item to Place in ${label}`
        }]
      };
    }

    return {
      tone: isHaz ? 'crit' : 'ok',
      icon: 'bin',
      title: `${label} Receptacle`,
      subtitle: `Carrying: ${heldItem.name}`,
      catChip: isHaz ? 'HAZWASTE' : (isOrg ? 'ORGANICS' : 'DISPOSAL'),
      catChipCls: isHaz ? 'hdr-crit' : 'hdr-ok',
      chips: [
        { text: `READY TO PLACE: ${label}` }
      ],
      actions: [{ key: 'E / Click', touch: 'PLACE', touchCls: 'use', verb: `Deposit ${heldItem.name} in ${label}` }]
    };
  }

  function buildDoorDriverTypeTokens(sessions) {
    const list = Array.isArray(sessions) ? sessions : [];
    const seen = new Set();
    const out = [];
    list.forEach((s) => {
      const tp = (s && s.delivery && s.delivery.type) || (s && s.type) || 'sidedoor';
      if (seen.has(tp)) return;
      seen.add(tp);
      if (tp === 'warehouse') out.push({ cls: 'ti-deliv-wh', text: 'WAREHOUSE TRUCK' });
      else if (tp === 'vendor_truck') out.push({ cls: 'ti-deliv-vt', text: 'VENDOR TRUCK' });
      else out.push({ cls: 'ti-deliv-sd', text: 'SIDE DOOR VENDOR' });
    });
    return out;
  }

  function buildDoorAlarmTokens(doorKeyLabel, elapsedWarn5, kindLabel) {
    const is5 = Boolean(elapsedWarn5);
    return {
      tone: 'crit',
      catChip: is5 ? '5M+ ALARM' : 'UNATTENDED',
      catChipCls: 'hdr-crit',
      subtitle: is5
        ? `Security Advisory Triggered — Close Empty ${kindLabel} Before 10m Penalty`
        : `Dock Security — Unattended ${kindLabel} Timer Running (Warn 5m · -200 pt at 10m)`,
      tokens: [
        { cls: 'ti-st-crit', text: is5 ? 'OPEN - ALARM 5M+ (-200 PT)' : 'OPEN - UNATTENDED (<5M)' },
        { cls: 'ti-st-neutral', text: kindLabel === 'Side Door' ? 'NO DRIVER' : 'NO TRAILER' }
      ],
      chips: is5 ? [{ cls: 'cond-crit', text: `SECURITY ADVISORY: CLOSE ${doorKeyLabel} NOW` }] : []
    };
  }

  function adaptDockDoorButton(inter, ctx) {
    const context = ctx || {};
    const dd = (inter && inter.target) || {};
    const bayId = Number(dd.id) || 2;
    const sc = context.shiftClock || global.ShiftClock || null;
    const timer = (sc && typeof sc.getDoorTimerState === 'function') ? sc.getDoorTimerState('dock' + bayId) : null;
    const isWarn5 = timer ? Boolean(timer.active && timer.warned5) : (Number(dd.timeOpen) >= 20);
    const hasTrailer = Boolean(dd.hasTrailer);
    const isWhTrailer = hasTrailer && dd.trailerType !== 'vendor_truck';
    const trailerToken = hasTrailer
      ? (isWhTrailer ? { cls: 'ti-wh-priority', text: 'WH TRAILER DOCKED' } : { cls: 'ti-deliv-vt', text: 'VENDOR TRUCK DOCKED' })
      : null;

    if (!dd.isOpen) {
      if (hasTrailer) {
        return {
          tone: 'warn',
          icon: 'door',
          title: `Dock Door ${bayId} Control Box`,
          subtitle: 'Dock Security — Trailer Waiting Outside Dock',
          catChip: 'TRUCK WAITING',
          catChipCls: 'hdr-warn',
          facts: [{
            key: `DOCK ${bayId}`,
            tokens: [{ cls: 'ti-st-warn', text: 'CLOSED - TRUCK WAITING' }, trailerToken]
          }],
          actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: `Push Button to Open Dock Door ${bayId}` }]
        };
      }
      return {
        tone: 'ok',
        icon: 'door',
        title: `Dock Door ${bayId} Control Box`,
        subtitle: 'Dock Security — Keep Empty Docks Closed (5m Warn · -200 pt at 10m)',
        catChip: 'SECURED',
        catChipCls: 'hdr-ok',
        facts: [{ key: `DOCK ${bayId}`, tokens: [{ cls: 'ti-st-ok', text: 'CLOSED - SECURED' }] }],
        actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: `Push Button to Open Dock Door ${bayId}` }]
      };
    }

    if (hasTrailer) {
      return {
        tone: 'warn',
        icon: 'door',
        title: `Dock Door ${bayId} Control Box`,
        subtitle: 'Dock Security — Close Dock Once Trailer Unload Completes',
        catChip: 'OPEN · ACTIVE',
        catChipCls: 'hdr-warn',
        facts: [{
          key: `DOCK ${bayId}`,
          tokens: [{ cls: 'ti-st-warn', text: 'OPEN - ACTIVE DELIVERY' }, trailerToken]
        }],
        actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: `Push Button to Close Dock Door ${bayId}` }]
      };
    }

    const alarm = buildDoorAlarmTokens(`DOCK ${bayId}`, isWarn5, 'Dock');
    return {
      tone: alarm.tone,
      icon: 'door',
      title: `Dock Door ${bayId} Control Box`,
      subtitle: alarm.subtitle,
      catChip: alarm.catChip,
      catChipCls: alarm.catChipCls,
      facts: [{ key: `DOCK ${bayId}`, tokens: alarm.tokens }],
      chips: alarm.chips,
      actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: `Close Empty Dock Door ${bayId}` }]
    };
  }

  function adaptSideDoorButton(inter, ctx) {
    const context = ctx || {};
    const sd = (inter && inter.target) || {};
    const ds = context.deliverySystem || global.DeliverySystem || null;
    const sc = context.shiftClock || global.ShiftClock || null;
    const waiting = (ds && typeof ds.getWaitingOutsideSessions === 'function') ? ds.getWaitingOutsideSessions() : [];
    const waitingExit = (ds && typeof ds.getWaitingExitSessions === 'function') ? ds.getWaitingExitSessions() : [];
    const moving = (ds && typeof ds.getMovingDoorSessions === 'function') ? ds.getMovingDoorSessions() : [];

    if (moving.length > 0) {
      return {
        tone: 'crit',
        icon: 'door',
        title: 'Side Rollup Door Control',
        subtitle: 'Stand Clear — Wait Until Driver Steps Through Door Threshold',
        catChip: 'OBSTRUCTED',
        catChipCls: 'hdr-crit',
        facts: [{ key: 'SIDE', tokens: [{ cls: 'ti-st-crit', text: 'OBSTRUCTED - DRIVER IN FRAME' }] }],
        chips: [{ cls: 'cond-crit', text: 'SIDE DOOR OBSTRUCTED — DRIVER IN FRAME' }],
        actions: [{ key: 'Blocked', touch: 'BLOCKED', touchCls: 'use', verb: 'Wait for Driver to Clear Doorway' }]
      };
    }

    if (!sd.isOpen) {
      if (waitingExit.length > 0) {
        const exitTokens = buildDoorDriverTypeTokens(waitingExit);
        return {
          tone: 'warn',
          icon: 'door',
          title: 'Side Rollup Door Control',
          subtitle: 'Paperwork Complete — Open Side Door for Exiting Drivers',
          catChip: 'EXIT READY',
          catChipCls: 'hdr-warn',
          facts: [
            { key: 'SIDE', tokens: [{ cls: 'ti-st-warn', text: 'CLOSED - DRIVER(S) EXITING' }] },
            exitTokens.length ? { key: 'EXITING', tokens: exitTokens } : null
          ].filter(Boolean),
          actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: 'Open Side Door for Exiting Drivers' }]
        };
      }
      if (waiting.length > 0) {
        const waitTokens = buildDoorDriverTypeTokens(waiting);
        return {
          tone: 'warn',
          icon: 'door',
          title: 'Side Rollup Door Control',
          subtitle: 'Open Side Door, Then Speak with Waiting Drivers to Admit',
          catChip: 'DRIVERS WAITING',
          catChipCls: 'hdr-warn',
          facts: [
            { key: 'SIDE', tokens: [{ cls: 'ti-st-warn', text: 'CLOSED - DRIVER(S) WAITING' }] },
            waitTokens.length ? { key: 'WAITING', tokens: waitTokens } : null
          ].filter(Boolean),
          actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: 'Open Side Door for Waiting Drivers' }]
        };
      }
      return {
        tone: 'ok',
        icon: 'door',
        title: 'Side Rollup Door Control',
        subtitle: 'Dock Security — Keep Empty Side Door Closed (5m Warn · -200 pt at 10m)',
        catChip: 'SECURED',
        catChipCls: 'hdr-ok',
        facts: [{ key: 'SIDE', tokens: [{ cls: 'ti-st-ok', text: 'CLOSED - SECURED' }] }],
        actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: 'Push Button to Open Side Rollup Door' }]
      };
    }

    const rawSessions = (ds && Array.isArray(ds.sessions))
      ? ds.sessions
      : ((ds && typeof ds.getInsideDeliveries === 'function') ? ds.getInsideDeliveries() : []);
    const sideActiveStates = new Set([
      'ENTERING',
      'WAITING_CHECKIN',
      'WAITING_SIGN',
      'WALKING_TO_EXIT',
      'WAITING_EXIT',
      'VENDOR_RETURNING_TO_SIDE_DOOR',
      'LEAVING'
    ]);
    const hasSideWorldPos = Number.isFinite(Number(sd.worldX)) && Number.isFinite(Number(sd.worldZ));
    const activeNearSide = rawSessions.filter((s) => {
      if (!s) return false;
      if (sideActiveStates.has(s.state)) return true;
      if (hasSideWorldPos && s.driver && s.driver.mesh && s.driver.mesh.position) {
        return Math.hypot(s.driver.mesh.position.x - sd.worldX, s.driver.mesh.position.z - sd.worldZ) < 4.2;
      }
      return false;
    });
    const driverNearSide = Boolean(waiting.length > 0 || waitingExit.length > 0 || activeNearSide.length > 0);
    if (driverNearSide) {
      const activeTokens = buildDoorDriverTypeTokens(waiting.concat(waitingExit, activeNearSide));
      return {
        tone: 'warn',
        icon: 'door',
        title: 'Side Rollup Door Control',
        subtitle: 'Drivers Active on Apron / Side Door — Close After Entry or Exit',
        catChip: 'OPEN · ACTIVE',
        catChipCls: 'hdr-warn',
        facts: [
          { key: 'SIDE', tokens: [{ cls: 'ti-st-warn', text: 'OPEN - DRIVER ON DOCK' }] },
          activeTokens.length ? { key: 'DRIVER', tokens: activeTokens } : null
        ].filter(Boolean),
        actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: 'Push Button to Close Side Rollup Door' }]
      };
    }

    const sideTimer = (sc && typeof sc.getDoorTimerState === 'function') ? sc.getDoorTimerState('side') : null;
    const isWarn5 = sideTimer ? Boolean(sideTimer.active && sideTimer.warned5) : (Number(sd.timeOpen) >= 20);
    const alarm = buildDoorAlarmTokens('SIDE DOOR', isWarn5, 'Side Door');
    return {
      tone: alarm.tone,
      icon: 'door',
      title: 'Side Rollup Door Control',
      subtitle: alarm.subtitle,
      catChip: alarm.catChip,
      catChipCls: alarm.catChipCls,
      facts: [{ key: 'SIDE', tokens: alarm.tokens }],
      chips: alarm.chips,
      actions: [{ key: 'E / Click', touch: 'DOOR', touchCls: 'use', verb: 'Close Empty Side Rollup Door' }]
    };
  }

  function adaptFacilityInteractible(inter, ctx) {
    if (!inter) return null;
    const context = ctx || {};
    const dr = context.receipts || global.DSDReceipts || null;
    const sc = context.shiftClock || global.ShiftClock || null;
    const wt = context.warehouseTrucks || global.WarehouseTrucks || null;
    const type = inter.type;

    if (type === 'dock_button') return adaptDockDoorButton(inter, context);
    if (type === 'side_door_button') return adaptSideDoorButton(inter, context);

    if (type === 'terminal') {
      const nd = (dr && typeof dr.getNightDropCount === 'function') ? dr.getNightDropCount() : 0;
      const tasks = (dr && typeof dr.getPendingHomeOfficeTaskCount === 'function') ? dr.getPendingHomeOfficeTaskCount() : 0;
      const sched = (wt && typeof wt.getScheduleRows === 'function') ? wt.getScheduleRows().filter((r) => r && !r.completed && !r.refused).length : 0;
      return {
        tone: 'info',
        icon: 'terminal',
        title: 'Receiving Computer Terminal',
        subtitle: 'Process night drops, print and manage receipts, view inbound delivery schedules, and report recalls and tasks.',
        catChip: 'ONLINE',
        facts: [{
          key: 'QUEUE',
          tokens: [
            { cls: nd > 0 ? 'ti-st-warn' : 'ti-st-ok', text: `${nd} NIGHT DROP${nd === 1 ? '' : 'S'}` },
            { cls: sched > 0 ? 'ti-bin-placed' : 'ti-st-ok', text: `${sched} PENDING DELIV${sched === 1 ? '' : 'S'}` },
            { cls: tasks > 0 ? 'ti-st-warn' : 'ti-st-neutral', text: `${tasks} TASK${tasks === 1 ? '' : 'S'} DUE` }
          ]
        }],
        actions: [{ key: 'E / Click', touch: 'TERMINAL', touchCls: 'use', verb: 'Access Receiving Terminal' }]
      };
    }

    if (type === 'desk_papers') {
      const nd = (dr && typeof dr.getNightDropCount === 'function') ? dr.getNightDropCount() : 0;
      const pin = (dr && typeof dr.getPinnedCount === 'function') ? dr.getPinnedCount() : 0;
      return {
        tone: nd > 0 ? 'warn' : 'info',
        icon: 'tray',
        title: 'Desk Inbox Tray',
        subtitle: 'Key Night Drops on Terminal Before Daily Filing',
        catChip: nd > 0 ? `${nd} WAITING` : 'CLEAR',
        catChipCls: nd > 0 ? 'hdr-warn' : 'hdr-ok',
        facts: [{
          key: 'DOCS',
          tokens: [
            { cls: nd > 0 ? 'ti-st-warn' : 'ti-st-ok', text: `${nd} UNKEYED NIGHT DROP${nd === 1 ? '' : 'S'}` },
            { cls: 'ti-bin-placed', text: `${pin} PINNED REF DOC${pin === 1 ? '' : 'S'}` }
          ]
        }],
        actions: [{ key: 'E / Click', touch: 'INSPECT', touchCls: 'use', verb: 'Inspect Night Drops & Pinned Docs' }]
      };
    }

    if (type === 'filing_folder') {
      const afterNoon = context.afterNoon !== undefined ? Boolean(context.afterNoon) : Boolean(sc && typeof sc.isAfterNoon === 'function' && sc.isAfterNoon());
      const done = Boolean(dr && typeof dr.isFilingComplete === 'function' && dr.isFilingComplete());
      const unfiled = (dr && typeof dr.getUnfiledReceiptsCount === 'function') ? dr.getUnfiledReceiptsCount() : 0;
      return {
        tone: done ? 'ok' : (afterNoon ? 'info' : 'warn'),
        icon: 'folder',
        title: 'Daily Filing Folder',
        subtitle: 'Pair Signed Invoices with Printed Store Copies',
        catChip: done ? 'COMPLETE' : (afterNoon ? 'OPEN' : 'PRE-NOON'),
        catChipCls: done ? 'hdr-ok' : (afterNoon ? '' : 'hdr-warn'),
        facts: [{
          key: 'STATUS',
          tokens: [
            done ? { cls: 'ti-st-ok', text: '✓ ALL RECEIPTS FILED' } : { cls: afterNoon ? 'ti-st-warn' : 'ti-st-neutral', text: `${unfiled} UNFILED LEFT` },
            { cls: 'ti-st-neutral', text: 'OPENS 12:00 PM' }
          ]
        }],
        chips: done
          ? [{ cls: 'status-ok', text: '✓ DAILY FILING COMPLETE' }]
          : (afterNoon ? [{ cls: 'status-ok', text: 'FILING UNLOCKED' }] : [{ cls: 'cond-warn', text: 'FILES AFTER 12:00 PM NOON' }]),
        actions: [{ key: 'E / Click', touch: 'INSPECT', touchCls: 'use', verb: 'Open Daily Filing Board' }]
      };
    }

    if (type === 'file_cabinet') {
      return {
        tone: 'info',
        icon: 'cabinet',
        title: '90-Day File Cabinet Archive',
        subtitle: 'Pin Reference Docs to Desk Tray · Audit Historical Receipts',
        catChip: '90-DAY',
        facts: [{
          key: 'ARCHIVE',
          tokens: [
            { cls: 'ti-code', text: '90-DAY LOGS' },
            { cls: 'ti-st-neutral', text: 'READ-ONLY LOOKUP' }
          ]
        }],
        actions: [{ key: 'E / Click', touch: 'INSPECT', touchCls: 'use', verb: 'Pull Drawer & Browse Archive' }]
      };
    }

    if (type === 'printer') {
      const tray = (dr && typeof dr.getPrinterTrayCount === 'function') ? dr.getPrinterTrayCount() : 0;
      const slips = (dr && typeof dr.getPrintedSlipsCount === 'function') ? dr.getPrintedSlipsCount() : 0;
      return {
        tone: tray > 0 ? 'ok' : 'info',
        icon: 'printer',
        title: 'Dot-Matrix Receipt Printer',
        subtitle: 'Print Driver & Store Copies from Terminal Ledger',
        catChip: tray > 0 ? `${tray} IN TRAY` : 'READY',
        catChipCls: tray > 0 ? 'hdr-ok' : '',
        facts: [{
          key: 'TRAY',
          tokens: [
            { cls: tray > 0 ? 'ti-st-ok' : 'ti-st-neutral', text: `${tray} READY TO PICK UP` },
            { cls: 'ti-st-neutral', text: `${slips} SLIP${slips === 1 ? '' : 'S'} HELD` }
          ]
        }],
        actions: [{ key: 'E / Click', touch: 'INSPECT', touchCls: 'use', verb: tray > 0 ? 'Pick Up Printed Receipts' : 'Check Printer Queue' }]
      };
    }

    if (type === 'trash_can') {
      const slips = (dr && typeof dr.getPrintedSlipsCount === 'function') ? dr.getPrintedSlipsCount() : 0;
      const hasSlips = slips > 0;
      return {
        tone: hasSlips ? 'info' : 'crit',
        icon: 'trash',
        title: 'Under-Desk Wastebasket',
        subtitle: 'Safe Cleanup — Ledger Records Are Never Deleted',
        catChip: `${slips} HELD SLIP${slips === 1 ? '' : 'S'}`,
        catChipCls: hasSlips ? '' : 'hdr-crit',
        facts: [{
          key: 'HELD',
          tokens: [
            { cls: hasSlips ? 'ti-st-ok' : 'ti-st-neutral', text: `${slips} PRINT-OUT${slips === 1 ? '' : 'S'} HELD` },
            hasSlips
              ? { cls: 'ti-bin-placed', text: 'SELECT SLIP TO DISCARD' }
              : { cls: 'ti-st-crit', text: 'NONE HELD TO DISCARD' }
          ]
        }],
        actions: [{
          key: hasSlips ? 'E / Click' : 'Blocked',
          touch: hasSlips ? 'INSPECT' : 'BLOCKED',
          touchCls: 'use',
          verb: hasSlips ? 'Choose Receipt Print-Out to Discard' : 'Hold a Receipt Print-Out to Discard'
        }]
      };
    }

    if (type === 'timeclock') {
      const afterNoon = context.afterNoon !== undefined ? Boolean(context.afterNoon) : Boolean(sc && typeof sc.isAfterNoon === 'function' && sc.isAfterNoon());
      return {
        tone: afterNoon ? 'ok' : 'crit',
        icon: 'clock',
        title: 'Employee Timeclock',
        subtitle: 'Required Physical Punch-Out · Finalizes Shift KPI',
        catChip: afterNoon ? 'OPEN' : 'LOCKED',
        catChipCls: afterNoon ? 'hdr-ok' : 'hdr-crit',
        facts: [{
          key: 'SHIFT',
          tokens: [
            { cls: 'ti-code', text: 'END 2:00 PM' },
            { cls: 'ti-st-warn', text: 'CUTOFF 3:00 PM' },
            { cls: 'ti-st-neutral', text: 'UNLOCKS 12:00 PM' }
          ]
        }],
        chips: [
          afterNoon ? { cls: 'status-ok', text: '✓ PUNCH-OUT AVAILABLE' } : { cls: 'cond-crit', text: 'OPENS AT 12:00 PM NOON' }
        ],
        actions: [{
          key: afterNoon ? 'E / Click' : 'Blocked',
          touch: afterNoon ? 'PUNCH OUT' : 'BLOCKED',
          touchCls: 'use',
          verb: afterNoon ? 'Punch Out & View Daily KPI' : 'Punch-Out Opens at 12:00 PM Noon'
        }]
      };
    }

    if (type === 'electric_jack') return adaptElectricJack(inter, context);
    if (type === 'pallet') return adaptPallet(inter, context);
    if (type === 'driver') return adaptDriver(inter, context);

    return null;
  }

  function adaptElectricJack(inter, ctx) {
    const context = ctx || {};
    const batt = Number.isFinite(Number(context.jackBattery)) ? Math.max(0, Math.min(100, Math.floor(Number(context.jackBattery)))) : 100;
    const docked = Boolean(context.jackDockedAtCharger);
    const low = batt <= 25;
    return {
      tone: low ? 'crit' : 'warn',
      icon: 'jack',
      title: 'Crown Electric Pallet Jack',
      subtitle: 'Park at Charger Between Unloads to Recharge',
      catChip: `BATT ${batt}%`,
      catChipCls: low ? 'hdr-crit' : '',
      facts: [{
        key: 'POWER',
        tokens: [
          { cls: low ? 'ti-st-crit' : 'ti-st-ok', text: `🔋 ${batt}% CHARGE` },
          { cls: docked ? 'ti-bin-placed' : 'ti-st-neutral', text: docked ? 'CHARGER DOCKED' : 'ON DOCK FLOOR' },
          { cls: 'ti-st-neutral', text: 'REQUIRED FOR PALLETS' }
        ]
      }],
      actions: [{ key: 'Space', touch: 'TAKE JACK', touchCls: 'jack', verb: 'Operate Electric Pallet Jack' }]
    };
  }

  function adaptPallet(inter, ctx) {
    const context = ctx || {};
    const pallet = (inter && inter.target) || {};
    const data = pallet.data || pallet || {};
    const zone = String(data.targetZone || 'D').toUpperCase();
    const zoneCls = zone === 'F' ? 'ti-zone-f' : (zone === 'C' ? 'ti-zone-c' : 'ti-zone-d');
    const zoneLabel = zone === 'F' ? 'FREEZER (F)' : (zone === 'C' ? 'COOLER (C)' : 'DRY (D)');
    const hasJack = Boolean(context.hasElectricJack);
    const po = String(data.po || data.id || '4091');
    const caseCount = Number(data.totalCases || data.cases || data.caseCount || (Array.isArray(data.physicalBoxes) ? data.physicalBoxes.length : 0)) || 0;
    const actualTxt = data.actualTemp !== undefined ? String(data.actualTemp) : '';
    const expectedTxt = String(data.expectedTemp || '');

    if (data.isOverstockPallet) {
      const rackLabel = data.rackId ? String(data.rackId).replace(/_/g, ' ').toUpperCase() : 'BACKROOM STEEL';
      const osTokens = [{ cls: zoneCls, text: zoneLabel }];
      if (caseCount > 0) osTokens.push({ cls: 'ti-units-hero', text: `${caseCount} CASE${caseCount === 1 ? '' : 'S'}` });
      osTokens.push({ cls: 'ti-st-neutral', text: rackLabel });
      return {
        tone: hasJack ? 'info' : 'crit',
        icon: 'pallet',
        title: String(data.name || 'Overstock Floor Pallet'),
        subtitle: 'Backroom Overstock Skid · Relocate with Electric Jack',
        catChip: hasJack ? 'OVERSTOCK' : 'NEED JACK',
        catChipCls: hasJack ? '' : 'hdr-crit',
        facts: [{ key: 'LOAD', tokens: osTokens }],
        chips: [hasJack ? { cls: 'status-ok', text: '✓ JACK READY' } : { cls: 'cond-crit', text: 'ELECTRIC JACK REQUIRED' }],
        actions: [{
          key: 'Space',
          touch: hasJack ? 'HITCH PALLET' : 'NEED JACK',
          touchCls: 'jack',
          verb: hasJack ? 'Lift & Move Overstock Pallet' : 'Grab Electric Jack First'
        }]
      };
    }

    const isVendorPallet = Boolean(data.isWarehousePallet === false || (data.deliveryId && Array.isArray(data.physicalBoxes)));
    if (isVendorPallet) {
      const offloaded = pallet.position ? Number(pallet.position.z) >= -0.1 : true;
      const vTokens = [{ cls: 'ti-code', text: `INV ${po}` }];
      if (caseCount > 0) vTokens.push({ cls: 'ti-units-hero', text: `${caseCount} CASES` });
      vTokens.push({ cls: zoneCls, text: zoneLabel });
      const actions = [];
      if (offloaded) {
        actions.push({ key: 'E / Click', touch: 'CHECK IN', touchCls: 'use', verb: 'Open DSD Check-In Window' });
      }
      actions.push({
        key: 'Space',
        touch: hasJack ? 'HITCH PALLET' : 'NEED JACK',
        touchCls: 'jack',
        verb: hasJack ? 'Lift & Move Vendor Pallet' : 'Grab Electric Jack First'
      });
      return {
        tone: hasJack ? 'ok' : 'info',
        icon: 'pallet',
        title: `${data.name || ('Vendor Pallet ' + po)}`,
        subtitle: `${data.truck ? `Dock ${data.truck} ` : ''}Vendor Delivery · Open Check-In or Move Skid`,
        catChip: 'VENDOR PALLET',
        catChipCls: hasJack ? 'hdr-ok' : '',
        facts: [
          { key: 'LOAD', tokens: vTokens },
          {
            key: 'STATUS',
            tokens: [
              offloaded
                ? { cls: 'ti-bin-placed', text: 'OFFLOADED ON DOCK' }
                : { cls: 'ti-st-warn', text: 'IN VENDOR TRAILER' }
            ]
          }
        ],
        chips: hasJack ? [{ cls: 'status-ok', text: '✓ JACK READY' }] : [],
        actions: actions
      };
    }

    const loadTokens = [{ cls: 'ti-code', text: `PO #${po}` }];
    if (caseCount > 0) loadTokens.push({ cls: 'ti-units-hero', text: `${caseCount} CASES` });
    loadTokens.push({ cls: zoneCls, text: zoneLabel });

    const facts = [{ key: 'LOAD', tokens: loadTokens }];
    if (actualTxt || expectedTxt) {
      const tempTokens = [];
      if (actualTxt) tempTokens.push({ cls: 'ti-bin-placed', text: `ACTUAL ${actualTxt}` });
      if (expectedTxt) tempTokens.push({ cls: 'ti-st-neutral', text: `TARGET ${expectedTxt}` });
      facts.push({ key: 'TEMP', tokens: tempTokens });
    }

    return {
      tone: hasJack ? 'ok' : 'crit',
      icon: 'pallet',
      title: `Pallet #${po}${data.name ? ' (' + data.name + ')' : ''}`,
      subtitle: data.truck ? `Dock ${data.truck} Warehouse Trailer` : 'Inbound Warehouse Pallet',
      catChip: zone === 'F' ? 'FROZEN · P1' : (zone === 'C' ? 'CHILLED · P1' : 'DRY · P1'),
      catChipCls: hasJack ? 'hdr-ok' : 'hdr-crit',
      facts: facts,
      chips: [hasJack ? { cls: 'status-ok', text: '✓ JACK READY' } : { cls: 'cond-crit', text: 'ELECTRIC JACK REQUIRED' }],
      actions: [{
        key: 'Space',
        touch: hasJack ? 'HITCH PALLET' : 'NEED JACK',
        touchCls: 'jack',
        verb: hasJack ? 'Lift & Hitch Pallet' : 'Grab Electric Jack First'
      }]
    };
  }

  function adaptDriver(inter, ctx) {
    if (!inter) return null;
    const context = ctx || {};
    const session = inter.session || (inter.target && inter.target.session) || {};
    const d = session.delivery || {};
    const st = String(session.state || 'WAITING_CHECKIN');
    const dr = context.receipts || global.DSDReceipts || null;
    const ds = context.deliverySystem || global.DeliverySystem || null;

    const dType = d.type || 'sidedoor';
    const isWh = dType === 'warehouse';
    const isVt = dType === 'vendor_truck';
    const typeToken = isWh
      ? { cls: 'ti-deliv-wh', text: 'WAREHOUSE TRUCK' }
      : (isVt ? { cls: 'ti-deliv-vt', text: 'VENDOR TRUCK' } : { cls: 'ti-deliv-sd', text: 'SIDE DOOR VENDOR' });
    const title = isWh ? 'Warehouse Truck Driver' : (isVt ? 'Vendor Truck Driver' : 'Side Door Vendor');
    const carrierLabel = d.carrier || d.vendor || d.driverName || title;
    const dockLabel = d.dockBay ? `DOCK ${d.dockBay}` : 'SIDE DOOR';

    const physBoxes = Array.isArray(d.physicalBoxes) ? d.physicalBoxes : [];
    const overageCount = physBoxes.filter((b) => b && b.overageFlagged).length;
    const nonOverBoxes = physBoxes.filter((b) => b && !b.overageFlagged);
    const scannedCount = nonOverBoxes.filter((b) => b && b.scanned).length;
    const shortageCount = (Array.isArray(d.invoiceItems) ? d.invoiceItems : []).filter((it) => it && it.shortageStamped).length;
    const receivingStarted = Boolean(d._receivingStarted || d.casesScanned > 0 || d.tempChecked || d.receiptCreated || overageCount > 0 || shortageCount > 0 || scannedCount > 0);
    const tempOk = Boolean(d.tempChecked || d.tempZone === 'D' || (!d.tempZone || d.tempZone === 'ambient'));

    if (st === 'OUTSIDE_WAITING') {
      const waitCount = (ds && typeof ds.getWaitingOutsideSessions === 'function') ? ds.getWaitingOutsideSessions().length : 1;
      return {
        tone: isWh ? 'crit' : 'warn',
        icon: 'driver',
        title: title,
        subtitle: isWh
          ? 'Highest Priority (Dept 01) — Admit Before DSD Vendors (-150 pt)'
          : `Waiting Outside Side Door${waitCount > 1 ? ` (${waitCount} Total Waiting)` : ''}`,
        catChip: isWh ? 'OUTSIDE · WH' : (isVt ? 'OUTSIDE · VT' : 'OUTSIDE · SD'),
        catChipCls: isWh ? 'hdr-crit' : 'hdr-warn',
        facts: [
          { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: 'OUTSIDE SIDE DOOR' }] },
          { key: 'LOAD', tokens: [
            { cls: 'ti-dept-tag', text: d.vendorNo ? `#${d.vendorNo} ${carrierLabel}` : carrierLabel },
            { cls: 'ti-st-neutral', text: dockLabel }
          ] }
        ],
        chips: isWh ? [{ cls: 'cond-warn', text: 'PRIORITY #1 — OPEN SIDE DOOR QUEUE TO ADMIT' }] : [],
        actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'View Side Door Queue / Admit' }]
      };
    }

    if (st === 'ENTERING' || st === 'WAITING_CHECKIN') {
      if (isWh) {
        return {
          tone: 'warn',
          icon: 'driver',
          title: title,
          subtitle: `Check In Driver, Then Open Dock Door ${d.dockBay || 2} for Trailer`,
          catChip: 'CHECK-IN',
          catChipCls: 'hdr-warn',
          facts: [
            { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: 'INSIDE · NEEDS CHECK-IN' }] },
            { key: 'LOAD', tokens: [
              { cls: 'ti-st-neutral', text: dockLabel },
              d.seal ? { cls: 'ti-code', text: String(d.seal) } : null,
              { cls: 'ti-st-neutral', text: 'DEPT 01 AUTO-POST' }
            ].filter(Boolean) }
          ],
          actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: `Check In & Send to ${dockLabel}` }]
        };
      }
      if (isVt) {
        return {
          tone: 'warn',
          icon: 'driver',
          title: title,
          subtitle: `Authorize Check-In, Then Open Dock Door ${d.dockBay || 3} for Driver`,
          catChip: 'CHECK-IN',
          catChipCls: 'hdr-warn',
          facts: [
            { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: `BY ${dockLabel} · CHECK IN` }] },
            { key: 'LOAD', tokens: [
              { cls: 'ti-dept-tag', text: carrierLabel },
              { cls: 'ti-st-neutral', text: dockLabel },
              { cls: 'ti-st-neutral', text: 'OWN WALKIE JACK' }
            ] }
          ],
          actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: `Check In & Authorize ${dockLabel} Unload` }]
        };
      }
      if (receivingStarted) {
        const verifyTokens = [
          d.invoiceNo ? { cls: 'ti-code', text: `INV #${d.invoiceNo}` } : null,
          { cls: scannedCount >= nonOverBoxes.length && nonOverBoxes.length > 0 ? 'ti-st-ok' : 'ti-st-warn', text: `${scannedCount} / ${nonOverBoxes.length || d.totalCases || 0} SCANNED` }
        ].filter(Boolean);
        if (overageCount > 0) verifyTokens.push({ cls: 'ti-st-overage', text: `${overageCount} OVERAGE` });
        if (shortageCount > 0) verifyTokens.push({ cls: 'ti-st-crit', text: `${shortageCount} SHORTAGE` });
        if (!tempOk) verifyTokens.push({ cls: 'ti-st-warn', text: 'TEMP PENDING' });
        return {
          tone: 'warn',
          icon: 'driver',
          title: title,
          subtitle: 'Verify Cart Cases or Re-Open Check-In Window for Shortages / Overages',
          catChip: 'RECEIVING',
          catChipCls: 'hdr-warn',
          facts: [
            { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: 'CHECK-IN IN PROGRESS' }] },
            { key: 'VERIFY', tokens: verifyTokens }
          ],
          actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Re-Open Check-In Window' }]
        };
      }
      return {
        tone: 'info',
        icon: 'driver',
        title: title,
        subtitle: 'Open Check-In Window to Begin Verifying Invoice & Hand Cart',
        catChip: 'CHECK-IN READY',
        facts: [
          { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: 'AT SIDE DOOR · NOT CHECKED IN' }] },
          { key: 'CART', tokens: [
            d.invoiceNo ? { cls: 'ti-code', text: `INV #${d.invoiceNo}` } : null,
            { cls: 'ti-units-hero', text: `${nonOverBoxes.length || d.totalCases || 0} CASES` },
            { cls: 'ti-st-neutral', text: `0 / ${nonOverBoxes.length || d.totalCases || 0} SCANNED` }
          ].filter(Boolean) }
        ],
        actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Open Check-In Window' }]
      };
    }

    if (st === 'MOVING_TO_DOCK_STAND' || st === 'AWAITING_PLAYER_UNLOAD' || st === 'WAREHOUSE_RETURNING_FOR_SIGN') {
      const totalP = Number(d.totalPallets) || 6;
      const stagedP = Number(d.stagedCount) || 0;
      return {
        tone: 'warn',
        icon: 'driver',
        title: title,
        subtitle: 'Use Electric Walkie Jack to Stage Pallets in F / C / D Zones',
        catChip: 'UNLOADING',
        catChipCls: 'hdr-warn',
        facts: [
          { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: `STAGED ${stagedP} / ${totalP} PALLETS` }] },
          { key: dockLabel, tokens: [{ cls: 'ti-st-neutral', text: 'ELECTRIC JACK REQ.' }] }
        ],
        actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: `Check ${dockLabel} Unload Progress` }]
      };
    }

    if (st === 'VENDOR_WAIT_DOOR_OPEN' || st.startsWith('VENDOR_')) {
      return {
        tone: 'info',
        icon: 'driver',
        title: title,
        subtitle: `Open Dock Door ${d.dockBay || 3} — Driver Unloads Pallets Using Own Jack`,
        catChip: 'DOCK UNLOAD',
        facts: [
          { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: `WAITING / UNLOADING ${dockLabel}` }] },
          { key: 'NEXT', tokens: [
            { cls: 'ti-st-neutral', text: `OPEN DOCK DOOR ${d.dockBay || 3}` },
            { cls: 'ti-st-neutral', text: 'AUDIT TEMP & SCAN CASES' }
          ] }
        ],
        actions: [{ key: 'Info', touch: 'INFO', touchCls: 'neutral', verb: `Open Dock Door ${d.dockBay || 3} So Driver Unloads` }]
      };
    }

    if (st === 'WAITING_SIGN') {
      if (isWh) {
        return {
          tone: 'ok',
          icon: 'driver',
          title: title,
          subtitle: 'All Pallets Staged in Zones — Sign Bill of Lading',
          catChip: 'SIGN BOL',
          catChipCls: 'hdr-ok',
          facts: [
            { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-ok', text: 'PALLETS STAGED · BOL READY' }] },
            { key: 'DOCS', tokens: [
              { cls: 'ti-st-neutral', text: dockLabel },
              d.seal ? { cls: 'ti-code', text: String(d.seal) } : null,
              { cls: 'ti-st-ok', text: 'NO PRINTED RECEIPT REQ.' }
            ].filter(Boolean) }
          ],
          actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Open & Sign Bill of Lading' }]
        };
      }
      const readyToSign = (nonOverBoxes.length === 0 || scannedCount >= nonOverBoxes.length) && tempOk;
      if (!readyToSign) {
        const vTokens = [
          { cls: scannedCount >= nonOverBoxes.length ? 'ti-st-ok' : 'ti-st-warn', text: `${scannedCount} / ${nonOverBoxes.length} SCANNED` }
        ];
        if (overageCount > 0) vTokens.push({ cls: 'ti-st-overage', text: `${overageCount} OVERAGE` });
        if (shortageCount > 0) vTokens.push({ cls: 'ti-st-crit', text: `${shortageCount} SHORTAGE` });
        if (!tempOk) vTokens.push({ cls: 'ti-st-warn', text: 'TEMP PENDING' });
        return {
          tone: 'warn',
          icon: 'driver',
          title: title,
          subtitle: 'Re-Open Check-In Window to Verify Shortages, Overages & Temp',
          catChip: 'RECEIVING',
          catChipCls: 'hdr-warn',
          facts: [
            { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-warn', text: 'CHECK-IN IN PROGRESS' }] },
            { key: 'VERIFY', tokens: vTokens }
          ],
          actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Re-Open Check-In Window' }]
        };
      }
      return {
        tone: 'ok',
        icon: 'driver',
        title: title,
        subtitle: 'Cases Scanned & Verified — Review & Sign Vendor Invoice',
        catChip: 'SIGN INVOICE',
        catChipCls: 'hdr-ok',
        facts: [
          { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-ok', text: 'VERIFIED · SIGN READY' }] },
          { key: 'DOCS', tokens: [
            { cls: 'ti-st-neutral', text: dockLabel },
            d.invoiceNo ? { cls: 'ti-code', text: `INV #${d.invoiceNo}` } : null,
            { cls: 'ti-st-ok', text: 'CASES VERIFIED' }
          ].filter(Boolean) }
        ],
        actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Review & Sign Vendor Invoice' }]
      };
    }

    if (st === 'WALKING_TO_EXIT' || st === 'WAITING_EXIT' || st === 'LEAVING') {
      if (!isWh && dr && typeof dr.areAllRequiredReceiptsHanded === 'function' && !dr.areAllRequiredReceiptsHanded(d)) {
        const info = (typeof dr.getPendingReceiptHandoffInfo === 'function')
          ? dr.getPendingReceiptHandoffInfo(d)
          : { heldMatchingCount: 0, missing: [] };
        const missingList = Array.isArray(info.missing) ? info.missing : [];
        const numLabel = missingList.length ? missingList.map((rn) => '#' + rn).join(', ') : 'RECEIPT';
        if (info.heldMatchingCount > 0) {
          return {
            tone: 'ok',
            icon: 'driver',
            title: title,
            subtitle: 'Holding Printed Receipt — Hand Slip Over, Then Open Side Door',
            catChip: 'IN HAND',
            catChipCls: 'hdr-ok',
            facts: [
              { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-ok', text: '✓ INVOICE SIGNED' }] },
              { key: 'HANDOFF', tokens: [
                { cls: 'ti-st-ok', text: 'SLIP READY TO HAND' },
                { cls: 'ti-code', text: numLabel }
              ] }
            ],
            actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Hand Printed Receipt to Driver' }]
          };
        }
        return {
          tone: 'warn',
          icon: 'driver',
          title: title,
          subtitle: `Print Receipt ${numLabel} on Terminal & Pick Up from Printer`,
          catChip: 'NEEDS RECEIPT',
          catChipCls: 'hdr-warn',
          facts: [
            { key: 'TYPE', tokens: [typeToken, { cls: 'ti-st-ok', text: '✓ INVOICE SIGNED' }, { cls: 'ti-st-warn', text: 'BY SIDE DOOR' }] },
            { key: 'HANDOFF', tokens: [
              { cls: 'ti-st-crit', text: 'MISSING PRINTED RECEIPT' },
              { cls: 'ti-code', text: numLabel }
            ] }
          ],
          chips: [{ cls: 'cond-warn', text: `PRINT & COLLECT RECEIPT ${numLabel} BEFORE EXIT` }],
          actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Check Required Printed Receipt' }]
        };
      }

      return {
        tone: 'ok',
        icon: 'driver',
        title: title,
        subtitle: `${isWh ? 'BOL Signed' : 'Receipt Handed Off'} — Open Side Rollup Door Button to Let Exit`,
        catChip: 'EXIT READY',
        catChipCls: 'hdr-ok',
        facts: [{
          key: 'TYPE',
          tokens: [
            typeToken,
            { cls: 'ti-st-ok', text: isWh ? '✓ BOL SIGNED' : '✓ RECEIPT HANDED' },
            { cls: 'ti-st-warn', text: 'WAITING BY SIDE DOOR' }
          ]
        }],
        chips: [{ cls: 'status-ok', text: isWh ? 'NO TERMINAL RECEIPT NEEDED — OPEN SIDE DOOR' : 'OPEN SIDE DOOR BUTTON TO LET VENDOR EXIT' }],
        actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: 'Driver Ready — Use Side Door Button' }]
      };
    }

    return {
      tone: 'info',
      icon: 'driver',
      title: title,
      subtitle: carrierLabel,
      catChip: 'ACTIVE',
      facts: [{ key: 'TYPE', tokens: [typeToken] }],
      actions: [{ key: 'E / Click', touch: 'DRIVER', touchCls: 'use', verb: `Speak with ${carrierLabel}` }]
    };
  }

  function adaptHeldState(ctx) {
    const context = ctx || {};
    const racks = context.racks || global.BackstockRacks || null;
    const claims = getClaimsApi(context);

    if (context.carryingBackstock) {
      const held = context.heldCase || (racks && typeof racks.getHeldCase === 'function' ? racks.getHeldCase() : null);
      return {
        tone: 'info',
        icon: 'box',
        minimal: true,
        title: held ? held.name : 'Carrying Backstock Case',
        catChip: held && held.unitsPerCase ? `${held.unitsPerCase}u` : 'CARRYING',
        facts: [{ key: 'HOLD', tokens: [{ cls: 'ti-st-neutral', text: 'AIM AT MATCHING STEEL SHELF SLOT' }] }],
        actions: [{ key: 'E / Click', touch: 'PLACE', touchCls: 'use', verb: 'Place Case on Shelf' }]
      };
    }

    if (context.hitchedPallet) {
      const pData = (context.hitchedPallet && context.hitchedPallet.data) || {};
      const po = pData.po || 'PALLET';
      return {
        tone: 'warn',
        icon: 'pallet',
        minimal: true,
        title: `Hauling Pallet #${po}`,
        catChip: pData.targetZone ? `ZONE ${pData.targetZone}` : 'HAULING',
        actions: [{ key: 'Space', touch: 'DROP PALLET', touchCls: 'jack', verb: `Lower & Drop Pallet #${po}` }]
      };
    }

    if (context.hasElectricJack) {
      const batt = Number.isFinite(Number(context.jackBattery)) ? Math.floor(Number(context.jackBattery)) : 100;
      return {
        tone: 'warn',
        icon: 'jack',
        minimal: true,
        title: 'Operating Electric Jack',
        catChip: `BATT ${batt}%`,
        actions: [{ key: 'Space', touch: 'PARK JACK', touchCls: 'jack', verb: 'Drop / Park Electric Jack' }]
      };
    }

    if (context.holdingRecallTote) {
      const rs = (claims && typeof claims.getRecallState === 'function') ? claims.getRecallState() : null;
      const done = Boolean(rs && rs.allItemsCollected);
      return {
        tone: done ? 'ok' : 'warn',
        icon: 'tote',
        minimal: true,
        title: `Recall Tote${rs && rs.productName ? ': ' + rs.productName : ''}`,
        catChip: done ? 'READY TO DUMP' : 'COLLECTING',
        catChipCls: done ? 'hdr-ok' : 'hdr-warn',
        facts: [{
          key: 'NEXT',
          tokens: [{ cls: done ? 'ti-st-ok' : 'ti-st-warn', text: done ? `DUMP IN ${rs.correctBinLabel || 'RECEPTACLE'}` : 'COLLECT TOP SHELF ITEMS OR SET ON CART' }]
        }]
      };
    }

    if (context.arrangingRecallItem) {
      const rs = (claims && typeof claims.getRecallState === 'function') ? claims.getRecallState() : null;
      return {
        tone: 'info',
        icon: 'box',
        minimal: true,
        title: `Holding ${(rs && rs.movingItemName) || 'Recall Item'}`,
        catChip: 'ARRANGING',
        facts: [{ key: 'NEXT', tokens: [{ cls: 'ti-st-neutral', text: 'AIM AT RECALL CART TOP SHELF TO PLACE' }] }]
      };
    }

    if (context.holdingClaimsItem) {
      const item = context.heldClaimsItem || (claims && typeof claims.getHeldItem === 'function' ? claims.getHeldItem() : null);
      const dest = (item && claims && typeof claims.getReceptacleLabel === 'function')
        ? claims.getReceptacleLabel(item.confirmedDisposition)
        : 'RECEPTACLE';
      return {
        tone: 'ok',
        icon: 'claim',
        minimal: true,
        title: `Carrying ${(item && item.name) || 'Claim Item'}`,
        catChip: dest,
        catChipCls: 'hdr-ok',
        facts: [{ key: 'NEXT', tokens: [{ cls: 'ti-st-ok', text: `WALK TO ${dest} & PLACE` }] }]
      };
    }

    return null;
  }

  function resolveActiveSpec(ctx) {
    const c = ctx || {};
    if (c.isBlockingModalOpen) return null;
    if (c.hoveredPhysicalBox) return adaptPhysicalBox(c.hoveredPhysicalBox, c);
    if (c.hoveredLabelCase) return adaptLabelCase(c.hoveredLabelCase, c);
    if (c.hoveredInventoryCase) return adaptInventoryCase(c.hoveredInventoryCase, c);
    if (c.hoveredSupplyCase) return adaptSupplyCase(c.hoveredSupplyCase, c);
    if (c.hoveredBackstockTarget && c.carryingBackstock) return adaptBackstockTarget(c.hoveredBackstockTarget, c);
    if (c.hoveredBackstockCase) return adaptBackstockCase(c.hoveredBackstockCase, c);
    if (c.hoveredClaimsTote) return adaptClaimsTote(c.hoveredClaimsTote, c);
    if (c.hoveredClaimsItem) return adaptClaimsItem(c.hoveredClaimsItem, c);
    if (c.arrangingRecallItem) {
      return c.hoveredRecallArrangeSpot ? adaptRecallArrangeSpot(c.recallState) : adaptHeldState(c);
    }
    if (c.hoveredRecallItem) return adaptRecallItem(c.hoveredRecallItem, c);
    if (c.hoveredRecallBottomDock) return adaptRecallBottomDock(c);
    if (c.hoveredClaimsReceptacle) return adaptClaimsReceptacle(c.hoveredClaimsReceptacle, c);
    if (c.holdingRecallTote || c.holdingClaimsItem) return adaptHeldState(c);
    if (c.hoveredRecallTote) return adaptRecallTote(c);
    if (c.focusedInteractible) return adaptFacilityInteractible(c.focusedInteractible, c);
    return adaptHeldState(c);
  }

  global.InfotipAdapters = {
    resolveDeptLabel: resolveDeptLabel,
    buildCaseMeta: buildCaseMeta,
    adaptPhysicalBox: adaptPhysicalBox,
    adaptLabelCase: adaptLabelCase,
    adaptInventoryCase: adaptInventoryCase,
    adaptSupplyCase: adaptSupplyCase,
    adaptBackstockCase: adaptBackstockCase,
    adaptBackstockTarget: adaptBackstockTarget,
    adaptClaimsTote: adaptClaimsTote,
    adaptClaimsItem: adaptClaimsItem,
    adaptRecallItem: adaptRecallItem,
    adaptRecallArrangeSpot: adaptRecallArrangeSpot,
    adaptRecallBottomDock: adaptRecallBottomDock,
    adaptRecallTote: adaptRecallTote,
    adaptClaimsReceptacle: adaptClaimsReceptacle,
    adaptFacilityInteractible: adaptFacilityInteractible,
    adaptElectricJack: adaptElectricJack,
    adaptPallet: adaptPallet,
    adaptDriver: adaptDriver,
    adaptHeldState: adaptHeldState,
    resolveActiveSpec: resolveActiveSpec
  };
})(window);
