(function (global) {
  'use strict';

  /**
   * WarehouseTrucks (Phase 3)
   * Manages the dynamic 6:00 AM - 12:00 PM receiving schedule, high-priority
   * Warehouse Trucks (Vendor 011 / Dept 01 Apex Logistics) with wave-based
   * trailer pallet spawning, priority adherence enforcement (-150 pts),
   * bay beacon/trailer state, and automatic 01-SSSS receipt generation.
   */

  const BAY_PREFERENCE_WAREHOUSE = [1, 2, 3, 4];
  const BAY_PREFERENCE_VENDOR = [4, 3, 2, 1];

  const DRIVER_NAMES_POOL = [
    'Marcus Vance',
    'Ray Kowalski',
    'Elena Rostova',
    'Carlos Mendez',
    'terrence Cole',
    'Hannah Brooks',
    'Devon Brooks',
    'Victor Holloway',
    'Nadia Chen',
    'Garrett Pike'
  ];

  function capName(s) {
    if (!s) return 'Driver';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function formatEta(hour, minute) {
    const h24 = Number(hour) || 6;
    const m = Math.max(0, Math.min(59, Number(minute) || 0));
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function zoneFromTempType(tempType) {
    const t = String(tempType || '').toLowerCase();
    if (t === 'frozen' || t === 'f') return 'F';
    if (t === 'refrigerated' || t === 'chilled' || t === 'c') return 'C';
    return 'D';
  }

  function zoneDisplayInfo(zone) {
    if (zone === 'F') {
      return {
        zone: 'F',
        tempType: 'frozen',
        expectedTemp: '-6°F to 0°F',
        actualTemp: (-5 + Math.random() * 4).toFixed(1) + '°F',
        colorHex: '#0284c7',
        label: 'Frozen Freight Skids'
      };
    }
    if (zone === 'C') {
      return {
        zone: 'C',
        tempType: 'refrigerated',
        expectedTemp: '33°F to 38°F',
        actualTemp: (34 + Math.random() * 3).toFixed(1) + '°F',
        colorHex: '#38bdf8',
        label: 'Chilled Cold-Chain Skids'
      };
    }
    return {
      zone: 'D',
      tempType: 'ambient',
      expectedTemp: 'Ambient 60°-72°F',
      actualTemp: (65 + Math.random() * 5).toFixed(1) + '°F',
      colorHex: '#78716c',
      label: 'Dry Grocery / Bulk Pallets'
    };
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffleArray(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  const state = {
    initialized: false,
    hooks: {},
    schedule: [], // All scheduled deliveries (warehouse + vendor_truck + sidedoor) sorted by ETA
    palletCounter: 1,
    invoiceSeed: 901100,
    shiftLimits: {
      dryRemaining: 10,
      chilledRemaining: 8,
      frozenRemaining: 8
    },
    priorityWarnedDeliveryIds: {}
  };

  function getCatalogConfig() {
    if (global.DSDCatalog && global.DSDCatalog.SHIFT_CONFIG) {
      return global.DSDCatalog.SHIFT_CONFIG;
    }
    return {
      shiftStartHour: 6,
      deliveryCutoffHour: 12,
      shiftEndHour: 14,
      minWarehouseTrucksPerDay: 1,
      maxWarehouseTrucksPerDay: 2,
      maxDryPallets: 10,
      maxChilledPallets: 8,
      maxFrozenPallets: 8,
      warehouseMinPallets: 6,
      warehouseMaxPallets: 20
    };
  }

  function buildWarehouseCatalogPools() {
    const whProducts = (global.DSDCatalog && typeof global.DSDCatalog.getProductsForDepartment === 'function')
      ? global.DSDCatalog.getProductsForDepartment('01')
      : [];

    const byZone = { F: [], C: [], D: [] };
    whProducts.forEach((p) => {
      const z = zoneFromTempType(p.type);
      byZone[z].push(p);
    });

    if (!byZone.F.length) {
      byZone.F.push({ code: '0120', name: 'Frozen Bulk Freight Pallet', price: 89.99, type: 'frozen', canRefuse: false });
    }
    if (!byZone.C.length) {
      byZone.C.push({ code: '0109', name: 'Chilled Wholesale Dairy Skid', price: 64.99, type: 'refrigerated', canRefuse: false });
    }
    if (!byZone.D.length) {
      byZone.D.push({ code: '0101', name: 'Dry Wholesale Cereal Skid', price: 42.99, type: 'ambient', canRefuse: false });
    }
    return byZone;
  }

  function nextInvoiceNo() {
    state.invoiceSeed += randInt(7, 43);
    return String(state.invoiceSeed);
  }

  function pickDriverName(idx) {
    return capName(DRIVER_NAMES_POOL[idx % DRIVER_NAMES_POOL.length]);
  }

  /**
   * Allocates a warehouse trailer temperature plan:
   * - Total daily warehouse caps: 10 dry ('D'), 8 chilled ('C'), 8 frozen ('F') across all trucks
   * - Three pure warehouse truck types:
   *     1) All Dry: ['D'] (6-10 pallets)
   *     2) Frozen & Chilled: ['F', 'C'] (6-16 pallets)
   *     3) All Three: ['F', 'C', 'D'] (6-20 pallets)
   * - Pair-aligned counts per temp zone so side-by-side lanes stay uniform
   * - Strictly ordered ['F', 'C', 'D'] (frozen in back, chilled next, then dry toward dock door)
   */
  function allocatePalletPlan(requestedTotal, opts) {
    const lim = state.shiftLimits;
    const reserveNext = Boolean(opts && opts.reserveForNextTruck);
    const budgetFor = (z) => (z === 'F' ? lim.frozenRemaining : (z === 'C' ? lim.chilledRemaining : lim.dryRemaining));
    const takeFromBudget = (z, count) => {
      if (z === 'F') lim.frozenRemaining = Math.max(0, lim.frozenRemaining - count);
      else if (z === 'C') lim.chilledRemaining = Math.max(0, lim.chilledRemaining - count);
      else lim.dryRemaining = Math.max(0, lim.dryRemaining - count);
    };

    const candidatePatterns = [
      { zones: ['D'], weight: 0.25 },
      { zones: ['F', 'C'], weight: 0.25 },
      { zones: ['F', 'C', 'D'], weight: 0.50 }
    ];

    const canFitInPool = (zones, rem) => {
      let sum = 0;
      for (let i = 0; i < zones.length; i++) {
        const b = rem[zones[i]] || 0;
        if (b < 2) return false; // Every zone in the chosen truck type must appear (min 2 pallets = 1 pair)
        sum += b;
      }
      return sum >= 6; // A warehouse trailer carries at least 6 pallets
    };

    const leavesValidNextTruck = (usedCounts) => {
      if (!reserveNext) return true;
      const after = {
        D: lim.dryRemaining - usedCounts.D,
        C: lim.chilledRemaining - usedCounts.C,
        F: lim.frozenRemaining - usedCounts.F
      };
      return candidatePatterns.some((p) => canFitInPool(p.zones, after));
    };

    const poolNow = { D: lim.dryRemaining, C: lim.chilledRemaining, F: lim.frozenRemaining };
    const canChooseNow = (zones) => {
      if (!canFitInPool(zones, poolNow)) return false;
      if (!reserveNext) return true;
      const minUsed = { D: 0, C: 0, F: 0 };
      zones.forEach((z) => { minUsed[z] = 2; });
      const totalSeed = zones.length * 2;
      if (totalSeed < 6) {
        minUsed[zones[0]] += (6 - totalSeed);
      }
      return leavesValidNextTruck(minUsed);
    };

    let chosenPattern = null;
    if (opts && Array.isArray(opts.forcePattern) && canChooseNow(opts.forcePattern)) {
      chosenPattern = opts.forcePattern.slice();
    } else {
      const viable = candidatePatterns.filter((p) => canChooseNow(p.zones));
      if (!viable.length) return [];
      const totalW = viable.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * totalW;
      chosenPattern = viable[viable.length - 1].zones.slice();
      for (let i = 0; i < viable.length; i++) {
        r -= viable[i].weight;
        if (r <= 0) {
          chosenPattern = viable[i].zones.slice();
          break;
        }
      }
    }

    const patternBudget = chosenPattern.reduce((s, z) => s + budgetFor(z), 0);
    if (patternBudget < chosenPattern.length * 2) return [];

    const clampedTarget = Math.min(20, Math.max(6, Math.min(requestedTotal, patternBudget)));
    const counts = { F: 0, C: 0, D: 0 };

    // Split in even pairs (2 pallets per trailer row) strictly from zones in chosenPattern
    let pairsNeeded = Math.max(chosenPattern.length, Math.round(clampedTarget / 2));
    const maxPairsInPattern = Math.floor(patternBudget / 2);
    if (pairsNeeded > maxPairsInPattern) {
      pairsNeeded = maxPairsInPattern;
    }

    let placed = 0;
    // Seed 1 pair (2 pallets) of every zone in chosenPattern first so the truck contains all of its type's zones
    for (let i = 0; i < chosenPattern.length; i++) {
      const z = chosenPattern[i];
      if (budgetFor(z) - counts[z] >= 2) {
        counts[z] += 2;
        placed += 2;
      }
    }

    let guard = 0;
    while (placed < pairsNeeded * 2 && guard < 40) {
      guard++;
      let progressed = false;
      for (let i = 0; i < chosenPattern.length && placed < pairsNeeded * 2; i++) {
        const z = chosenPattern[i];
        if (budgetFor(z) - counts[z] >= 2) {
          const nextCounts = Object.assign({}, counts);
          nextCounts[z] += 2;
          if (placed >= 6 && !leavesValidNextTruck(nextCounts)) continue;
          counts[z] += 2;
          placed += 2;
          progressed = true;
        }
      }
      if (!progressed) break;
    }

    takeFromBudget('F', counts.F);
    takeFromBudget('C', counts.C);
    takeFromBudget('D', counts.D);

    // Build ordered list strictly: Frozen in back (row 0+), Chilled next, then Dry toward dock door.
    const plan = [];
    ['F', 'C', 'D'].forEach((z) => {
      for (let i = 0; i < counts[z]; i++) {
        plan.push(z);
      }
    });
    return plan;
  }

  function buildWarehouseTruckEntry(opts) {
    const cfg = getCatalogConfig();
    const whPools = buildWarehouseCatalogPools();
    const minP = Math.max(6, Number(cfg.warehouseMinPallets) || 6);
    const maxP = Math.max(minP, Math.min(20, Number(cfg.warehouseMaxPallets) || 20));
    const palletCount = opts.palletCount || randInt(minP, maxP);
    const zonePlan = allocatePalletPlan(palletCount, {
      forcePattern: opts.forcePattern,
      reserveForNextTruck: Boolean(opts.reserveForNextTruck)
    });
    if (!zonePlan.length) return null;
    const invoiceNo = opts.invoiceNo || nextInvoiceNo();
    const preferredBay = opts.dockBay || 1;

    const specs = [];
    const skuTotals = {};

    zonePlan.forEach((zone, idx) => {
      const pool = whPools[zone];
      const prod = pool[idx % pool.length];
      const zInfo = zoneDisplayInfo(zone);
      const poNum = `#WH-${invoiceNo.slice(-3)}-${idx + 1}`;
      const palletId = `WH_${opts.index}_${idx + 1}`;

      specs.push({
        id: palletId,
        truck: null,
        deliveryId: opts.id,
        isWarehousePallet: true,
        po: poNum,
        name: prod.name || zInfo.label,
        skuCode: prod.code,
        targetZone: zone,
        expectedTemp: zInfo.expectedTemp,
        actualTemp: zInfo.actualTemp,
        colorHex: zInfo.colorHex,
        status: 'PENDING_SPAWN'
      });

      if (!skuTotals[prod.code]) {
        skuTotals[prod.code] = {
          code: prod.code,
          name: prod.name,
          qty: 0,
          physicalQty: 0,
          price: Number(prod.price || 45),
          type: prod.type || zInfo.tempType,
          canRefuse: false
        };
      }
      const casesOnPallet = randInt(8, 16);
      skuTotals[prod.code].qty += casesOnPallet;
      skuTotals[prod.code].physicalQty += casesOnPallet;
    });

    const invoiceItems = Object.values(skuTotals);
    const totalCases = invoiceItems.reduce((sum, item) => sum + item.qty, 0);

    const whVendor = (global.DSDCatalog && typeof global.DSDCatalog.getVendor === 'function')
      ? global.DSDCatalog.getVendor('011')
      : null;
    const whCarrier = String((whVendor && whVendor.name) || 'Apex Logistics').toUpperCase();

    return {
      id: opts.id,
      type: 'warehouse',
      priority: 'HIGH',
      driverName: opts.driverName || `${(whVendor && whVendor.name) || 'Apex Logistics'} Dispatch`,
      carrier: whCarrier,
      subtitle: 'WAREHOUSE TRAILER (DEPT 01)',
      etaHour: opts.etaHour,
      etaMinute: opts.etaMinute,
      etaText: formatEta(opts.etaHour, opts.etaMinute),
      etaTotalMins: opts.etaHour * 60 + opts.etaMinute,
      vendorNo: '011',
      deptNo: '01',
      invoiceNo: invoiceNo,
      docNum: invoiceNo,
      seal: 'SEAL-' + String(randInt(1040, 9980)),
      preferredBay: preferredBay,
      dockBay: null,
      status: 'SCHEDULED', // SCHEDULED -> ARRIVED -> UNLOADING -> COMPLETE
      totalPallets: specs.length,
      spawnedCount: 0,
      stagedCount: 0,
      palletSpecs: specs,
      spawnedPallets: [],
      invoiceItems: invoiceItems,
      totalCases: totalCases,
      receiptCreated: false,
      receiptNumber: null,
      completed: false,
      refused: false,
      isFinalized: false
    };
  }

  function resolveUnitsPerCase(prod) {
    if (global.DSDCatalog && typeof global.DSDCatalog.getUnitsPerCase === 'function') {
      return global.DSDCatalog.getUnitsPerCase(prod);
    }
    if (prod && Number(prod.unitsPerCase) > 0) return Math.round(Number(prod.unitsPerCase));
    const sz = String((prod && prod.size) || 'medium').toLowerCase();
    return sz === 'large' ? 4 : (sz === 'small' ? 12 : 8);
  }

  function buildDynamicDsdEntry(opts) {
    const catalog = global.DSDCatalog;
    const isSideDoor = opts.type === 'sidedoor';
    const rawVendors = catalog && typeof catalog.getVendorsByType === 'function'
      ? catalog.getVendorsByType(isSideDoor ? 'side_door' : 'truck')
      : [];
    const vendors = rawVendors.filter((v) => v && v.deptNo !== '01' && v.deptNo !== '60');

    const fallbackVendor = isSideDoor
      ? { vendorNo: '154', name: 'Ridgeline Chip Co.', deptNo: '15', deptName: 'Beverages & Snacks', type: 'side_door' }
      : { vendorNo: '151', name: 'Beverage Wholesalers', deptNo: '15', deptName: 'Beverages & Snacks', type: 'truck' };

    let picked = fallbackVendor;
    if (opts.vendorEntry) {
      picked = opts.vendorEntry;
      if (opts.usedVendorNos && picked.vendorNo) opts.usedVendorNos.add(picked.vendorNo);
    } else if (vendors.length > 0) {
      const usedSet = opts.usedVendorNos;
      const unused = usedSet ? vendors.filter((v) => !usedSet.has(v.vendorNo)) : vendors;
      const pool = unused.length > 0 ? unused : vendors;
      picked = pool[(opts.vendorPickIdx || 0) % pool.length];
      if (usedSet && picked && picked.vendorNo) usedSet.add(picked.vendorNo);
    }

    const vendorProducts = (Array.isArray(picked.products) && picked.products.length > 0)
      ? picked.products
      : (catalog && typeof catalog.getProductsForDepartment === 'function'
        ? catalog.getProductsForDepartment(picked.deptNo)
        : []);
    const products = vendorProducts.slice(0, isSideDoor ? 4 : 6);

    const invoiceNo = opts.invoiceNo || nextInvoiceNo();
    let invoiceItems;
    if (Array.isArray(opts.customInvoiceItems) && opts.customInvoiceItems.length > 0) {
      invoiceItems = opts.customInvoiceItems.map((p) => {
        const upc = resolveUnitsPerCase(p);
        const cases = Math.max(1, Math.round(Number(p.cases !== undefined ? p.cases : p.qty) || 1));
        const qty = cases * upc;
        return {
          code: String(p.code),
          name: p.name || 'Supply Item',
          qty: qty,
          physicalQty: qty,
          cases: cases,
          physicalCases: cases,
          size: p.size || 'medium',
          unitsPerCase: upc,
          price: Number(p.price || 4.99),
          type: p.type || 'ambient',
          notScannable: Boolean(p.notScannable),
          canRefuse: p.canRefuse !== false
        };
      });
    } else {
      const minSkus = isSideDoor ? 2 : 3;
      const maxSkus = isSideDoor ? 3 : 4;
      const selectedProds = products.length > 0 ? products.slice(0, randInt(minSkus, Math.min(maxSkus, products.length))) : [
        { code: `${picked.deptNo}01`, name: `${picked.deptName || 'DSD'} Pack A`, price: 4.99, type: 'ambient', size: 'medium', unitsPerCase: 8 },
        { code: `${picked.deptNo}02`, name: `${picked.deptName || 'DSD'} Pack B`, price: 5.49, type: 'ambient', size: 'medium', unitsPerCase: 8 }
      ];

      invoiceItems = selectedProds.map((p) => {
        const upc = resolveUnitsPerCase(p);
        const cases = isSideDoor ? randInt(2, 5) : randInt(3, 9);
        const qty = cases * upc;
        return {
          code: p.code,
          name: p.name,
          qty: qty,
          physicalQty: qty,
          cases: cases,
          physicalCases: cases,
          size: p.size || 'medium',
          unitsPerCase: upc,
          price: Number(p.price || 4.99),
          type: p.type || 'ambient',
          notScannable: Boolean(p.notScannable),
          canRefuse: p.canRefuse !== false
        };
      });
    }

    const totalCases = invoiceItems.reduce((sum, item) => sum + (Number(item.physicalCases || item.cases) || 1), 0);
    const hasFrozen = invoiceItems.some((i) => i.type === 'frozen');
    const hasChilled = invoiceItems.some((i) => i.type === 'refrigerated');
    const tempZone = hasFrozen ? 'F' : (hasChilled ? 'C' : 'D');
    const tempText = tempZone === 'F' ? 'Frozen (-2°F)' : (tempZone === 'C' ? 'Chilled (36°F)' : 'Ambient (68°F)');
    const expectedTemp = tempZone === 'F' ? '-6°F to 0°F' : (tempZone === 'C' ? '33°F to 38°F' : '60°-72°F');

    const driverName = opts.driverName || pickDriverName(opts.seedIdx || 0);
    const carrier = String(picked.name || picked.vendorName || fallbackVendor.name).toUpperCase();
    const preferredBay = isSideDoor ? null : (opts.dockBay || null);

    return {
      id: opts.id,
      type: isSideDoor ? 'sidedoor' : 'vendor_truck',
      priority: 'NORMAL',
      driverName: driverName,
      carrier: carrier,
      subtitle: isSideDoor ? 'DIRECT STORE DELIVERY (SIDE DOOR HAND CART)' : 'FULL TRUCKLOAD COMMERCIAL VENDOR',
      etaHour: opts.etaHour,
      etaMinute: opts.etaMinute,
      etaText: formatEta(opts.etaHour, opts.etaMinute),
      etaTotalMins: opts.etaHour * 60 + opts.etaMinute,
      vendorNo: picked.vendorNo,
      deptNo: picked.deptNo,
      givesCredit: picked.givesCredit !== undefined ? Boolean(picked.givesCredit) : !['12', '22'].includes(String(picked.deptNo || '')),
      invoiceNo: invoiceNo,
      docNum: invoiceNo,
      seal: isSideDoor ? 'VERIFIED INTACT' : `SEAL-${invoiceNo.slice(-4)} [INTACT]`,
      tempZone: tempZone,
      temp: tempText,
      expectedTemp: expectedTemp,
      totalCases: totalCases,
      receiptCreated: false,
      casesScanned: 0,
      tempChecked: tempZone === 'D',
      outOfTemp: false,
      isFinalized: false,
      completed: false,
      refused: false,
      status: 'SCHEDULED',
      preferredBay: preferredBay,
      dockBay: null,
      dialogueGreeting: isSideDoor
        ? `Hey there! ${driverName} from ${carrier}. Got ${totalCases} cases for Dept ${picked.deptNo}. Here's Invoice #${invoiceNo}.`
        : `Morning! ${driverName} with ${carrier} checked in. Waiting for bay assignment to unload Invoice #${invoiceNo}.`,
      invoiceItems: invoiceItems,
      creditItems: []
    };
  }

  function generateDailySchedule(opts) {
    const scheduleOpts = opts || {};
    const cfg = getCatalogConfig();
    const catalog = global.DSDCatalog;
    state.shiftLimits = {
      dryRemaining: Number(cfg.maxDryPallets) || 10,
      chilledRemaining: Number(cfg.maxChilledPallets) || 8,
      frozenRemaining: Number(cfg.maxFrozenPallets) || 8
    };
    state.priorityWarnedDeliveryIds = {};

    const shiftStartMin = (Number(cfg.shiftStartHour) || 6) * 60;
    const cutoffHour = Number(cfg.deliveryCutoffHour) || 12;
    const endMin = cutoffHour * 60; // No deliveries after 12:00 PM
    const minWh = Math.max(1, Math.min(2, Number(cfg.minWarehouseTrucksPerDay) || 1));
    const maxWh = Math.max(minWh, Math.min(2, Number(cfg.maxWarehouseTrucksPerDay) || 2));
    const minDel = Math.max(6, Number(cfg.minDeliveriesPerDay) || 8);
    const maxDel = Math.max(minDel, Number(cfg.maxDeliveriesPerDay) || 10);
    const totalSlots = randInt(minDel, maxDel); // 8-10 total deliveries per day

    const sideDoorRaw = (catalog && typeof catalog.getVendorsByType === 'function')
      ? catalog.getVendorsByType('side_door').filter((v) => v && v.deptNo !== '01' && v.deptNo !== '60')
      : [];
    const truckRaw = (catalog && typeof catalog.getVendorsByType === 'function')
      ? catalog.getVendorsByType('truck').filter((v) => v && v.deptNo !== '01' && v.deptNo !== '60')
      : [];

    const shuffledSideDoor = shuffleArray(sideDoorRaw);
    const shuffledTruck = shuffleArray(truckRaw);
    const shuffledDrivers = shuffleArray(DRIVER_NAMES_POOL);
    const usedVendorNos = new Set();

    // 1. Plan 8-10 delivery slot types first, placing 1-2 evenly spaced Warehouse Trucks
    const desiredWh = randInt(minWh, maxWh);
    const slotTypes = new Array(totalSlots).fill(null);

    let lastWhSlot = -10;
    const chosenWhSlots = [];
    for (let b = 0; b < desiredWh; b++) {
      const bandStart = Math.max(b === 0 ? 1 : Math.floor((b * totalSlots) / desiredWh), lastWhSlot + 2);
      const bandEnd = Math.min(totalSlots - 1, (b === desiredWh - 1) ? Math.max(1, totalSlots - 2) : (Math.floor(((b + 1) * totalSlots) / desiredWh) - 1));
      const candidates = [];
      for (let idx = bandStart; idx <= bandEnd; idx++) {
        candidates.push(idx);
      }
      if (!candidates.length && lastWhSlot + 2 < totalSlots) {
        candidates.push(lastWhSlot + 2);
      }
      if (!candidates.length) continue;
      const pickSlot = candidates[randInt(0, candidates.length - 1)];
      slotTypes[pickSlot] = 'warehouse';
      chosenWhSlots.push(pickSlot);
      lastWhSlot = pickSlot;
    }

    // 2. Build weighted ETA timeline (6:15 AM - 12:00 PM) with extra ~50-65m unloading buffer after every Warehouse Truck
    const firstMin = shiftStartMin + 15;
    const lastMin = endMin - randInt(0, 15);
    const totalSpan = Math.max(60, lastMin - firstMin);
    const rawWeights = [];
    let weightSum = 0;
    for (let g = 0; g < totalSlots - 1; g++) {
      const baseW = slotTypes[g] === 'warehouse' ? 1.85 : 1.0;
      const w = baseW * (0.9 + Math.random() * 0.2);
      rawWeights.push(w);
      weightSum += w;
    }

    const timeSlots = [firstMin];
    let accumMin = firstMin;
    for (let g = 0; g < totalSlots - 1; g++) {
      const remainingSlots = (totalSlots - 1) - g;
      const idealGap = Math.round((rawWeights[g] / weightSum) * totalSpan);
      const minGap = slotTypes[g] === 'warehouse' ? 45 : 22;
      const maxAllowed = Math.max(minGap, (lastMin - accumMin) - (remainingSlots - 1) * 20);
      const clampedGap = (g === totalSlots - 2)
        ? Math.max(20, lastMin - accumMin)
        : Math.max(minGap, Math.min(maxAllowed, idealGap));
      accumMin += clampedGap;
      timeSlots.push(Math.min(endMin, accumMin));
    }

    // Build Warehouse Truck entries at the chosen wide-spaced slots (enforcing >= 90 min separation)
    const whEntriesBySlot = {};
    let whCount = 0;
    let lastWhMin = -1000;
    const validWhSlots = chosenWhSlots.filter((slotIdx) => {
      const totalMin = timeSlots[slotIdx];
      if (totalMin - lastWhMin < 90) {
        slotTypes[slotIdx] = null;
        return false;
      }
      lastWhMin = totalMin;
      return true;
    });
    validWhSlots.forEach((slotIdx, idxPos) => {
      const totalMin = timeSlots[slotIdx];
      const whIdxNum = whCount + 1;
      const trucksStillAfter = Math.max(0, validWhSlots.length - 1 - idxPos);
      const remBudget = state.shiftLimits.dryRemaining + state.shiftLimits.chilledRemaining + state.shiftLimits.frozenRemaining;
      const maxForTruck = Math.max(6, Math.min(20, remBudget - trucksStillAfter * 6));
      const whEntry = buildWarehouseTruckEntry({
        id: `wh_truck_${whIdxNum}_${slotIdx}`,
        index: whIdxNum,
        driverName: `Apex Logistics #${400 + randInt(1, 99)}`,
        etaHour: Math.floor(totalMin / 60),
        etaMinute: totalMin % 60,
        palletCount: randInt(6, maxForTruck),
        reserveForNextTruck: trucksStillAfter > 0
      });
      if (whEntry) {
        whEntriesBySlot[slotIdx] = whEntry;
        whCount += 1;
      } else {
        slotTypes[slotIdx] = null;
      }
    });

    // 3. Fill remaining slots with weighted 3:2 Side Door vs Truck mix and break streaks > 3 consecutive.
    const dsdWeights = ['side_door', 'side_door', 'side_door', 'truck', 'truck'];
    for (let ti = 0; ti < timeSlots.length; ti++) {
      if (!slotTypes[ti]) {
        slotTypes[ti] = dsdWeights[randInt(0, dsdWeights.length - 1)];
      }
    }

    let runType = null;
    let runLen = 0;
    for (let ti = 0; ti < slotTypes.length; ti++) {
      let t = slotTypes[ti];
      if (t === 'warehouse') {
        runType = 'warehouse';
        runLen = 1;
        continue;
      }
      if (t === runType) {
        if (runLen >= 3) {
          t = (runType === 'side_door') ? 'truck' : 'side_door';
          slotTypes[ti] = t;
          runType = t;
          runLen = 1;
        } else {
          runLen += 1;
        }
      } else {
        runType = t;
        runLen = 1;
      }
    }

    let sdIdx = 0;
    let trIdx = 0;
    let drvIdx = 0;
    const entries = [];

    function pickNextVendor(pool, idxRef) {
      if (!pool.length) return null;
      const unused = pool.filter((v) => !usedVendorNos.has(v.vendorNo));
      const src = unused.length > 0 ? unused : pool;
      const picked = src[idxRef % src.length];
      if (picked && picked.vendorNo) usedVendorNos.add(picked.vendorNo);
      return picked;
    }

    for (let ti = 0; ti < timeSlots.length; ti++) {
      const totalMin = timeSlots[ti];
      const etaHour = Math.floor(totalMin / 60);
      const etaMinute = totalMin % 60;
      const delType = slotTypes[ti];

      if (delType === 'warehouse' && whEntriesBySlot[ti]) {
        entries.push(whEntriesBySlot[ti]);
        continue;
      }

      const isSideDoor = delType === 'side_door';
      const vEntry = isSideDoor
        ? pickNextVendor(shuffledSideDoor, sdIdx++)
        : pickNextVendor(shuffledTruck, trIdx++);

      entries.push(buildDynamicDsdEntry({
        id: `dsd_${isSideDoor ? 'sd' : 'trk'}_${ti}_${etaHour}${String(etaMinute).padStart(2, '0')}`,
        type: isSideDoor ? 'sidedoor' : 'vendor_truck',
        vendorEntry: vEntry,
        driverName: capName(shuffledDrivers[drvIdx++ % shuffledDrivers.length]),
        etaHour: etaHour,
        etaMinute: etaMinute,
        usedVendorNos: usedVendorNos
      }));
    }

    entries.sort((a, b) => a.etaTotalMins - b.etaTotalMins);

    // Inject ordered Dept 60 Retail Solutions supply truck for today if requested from yesterday's shift
    const supplyItems = Array.isArray(scheduleOpts.supplyOrderItems) ? scheduleOpts.supplyOrderItems : [];
    if (supplyItems.length > 0) {
      const v601 = (catalog && typeof catalog.getVendor === 'function' ? catalog.getVendor('601') : null) || {
        vendorNo: '601',
        name: 'Retail Solutions Inc.',
        deptNo: '60',
        deptName: 'Store Supplies',
        type: 'truck'
      };
      const supTotalMin = shiftStartMin + randInt(18, 42);
      const supHour = Math.floor(supTotalMin / 60);
      const supMin = supTotalMin % 60;
      const supEntry = buildDynamicDsdEntry({
        id: `dsd_supply_601_${supHour}${String(supMin).padStart(2, '0')}`,
        type: 'vendor_truck',
        vendorEntry: v601,
        driverName: capName(shuffledDrivers[drvIdx++ % shuffledDrivers.length]),
        etaHour: supHour,
        etaMinute: supMin,
        usedVendorNos: usedVendorNos,
        customInvoiceItems: supplyItems
      });
      supEntry.subtitle = 'DEPT 60 STORE SUPPLY REPLENISHMENT';
      supEntry.isSupplyOrderDelivery = true;
      entries.push(supEntry);
      entries.sort((a, b) => a.etaTotalMins - b.etaTotalMins);
    }

    // Roll 15% chance independently per feature (credit memo, true shortage, overage) and 5% temp fail on cold DSD vendors
    entries.forEach((entry) => {
      if (!entry || entry.type === 'warehouse' || String(entry.deptNo || '') === '60' || entry.isSupplyOrderDelivery) {
        return;
      }
      const isColdVendor = entry.tempZone === 'C' || entry.tempZone === 'F' ||
        (Array.isArray(entry.invoiceItems) && entry.invoiceItems.some((it) => it && (it.type === 'refrigerated' || it.type === 'frozen')));
      if (isColdVendor && Math.random() < 0.05) {
        entry.outOfTemp = true;
      }
      applyDiscrepanciesToDsdEntry(entry, {
        shortageChance: 0.15,
        overageChance: 0.15
      });
      const creditAllowed = entry.givesCredit !== false && !['12', '22'].includes(String(entry.deptNo || ''));
      if (creditAllowed && (!entry.creditItems || entry.creditItems.length === 0) && Math.random() < 0.15) {
        const invNoNum = parseInt(entry.invoiceNo, 10) || 0;
        entry.creditInvoiceNo = invNoNum > 0
          ? String(invNoNum + 1).padStart(6, '0')
          : String(entry.invoiceNo || '');
        const srcItems = Array.isArray(entry.invoiceItems) ? entry.invoiceItems : [];
        const creditCount = Math.min(srcItems.length, randInt(1, 3));
        entry.creditItems = srcItems.slice(0, creditCount).map((it) => ({
          code: it.code,
          name: it.name,
          qty: randInt(1, 2),
          unitsPerCase: 1,
          price: Number(it.price || 4.99),
          type: it.type || 'ambient',
          notScannable: Boolean(it.notScannable)
        }));
        if (entry.creditItems.length > 0 && entry.dialogueGreeting) {
          entry.dialogueGreeting += ` I also have Credit Memo #${entry.creditInvoiceNo} (${entry.creditItems.length} item return).`;
        }
      }
    });

    state.schedule = entries;
    return entries;
  }

  // Applies random (or forced) short/over physical quantity variances onto distinct SKUs
  function applyDiscrepanciesToDsdEntry(entry, opts) {
    if (!entry || !Array.isArray(entry.invoiceItems) || entry.invoiceItems.length === 0) return;
    const o = opts || {};
    const items = entry.invoiceItems;
    const indices = items.map((_, i) => i);

    const doShort = Boolean(o.forceBoth) || (typeof o.shortageChance === 'number' && Math.random() < o.shortageChance);
    const doOver = Boolean(o.forceBoth) || (typeof o.overageChance === 'number' && Math.random() < o.overageChance);
    if (!doShort && !doOver) return;

    let shortIdx = -1;
    if (doShort) {
      const shortCandidates = indices.filter((i) => {
        const upc = Math.max(1, Number(items[i].unitsPerCase) || 1);
        return Math.round((Number(items[i].qty) || 0) / upc) >= 2;
      });
      shortIdx = shortCandidates.length > 0
        ? shortCandidates[randInt(0, shortCandidates.length - 1)]
        : 0;
      const upc = Math.max(1, Number(items[shortIdx].unitsPerCase) || 1);
      const billedCases = Math.max(1, Math.round((Number(items[shortIdx].qty) || upc) / upc));
      const maxDropCases = Math.max(1, Math.min(2, billedCases - 1));
      const dropCases = randInt(1, maxDropCases);
      const physCases = Math.max(0, billedCases - dropCases);
      items[shortIdx].physicalCases = physCases;
      items[shortIdx].physicalQty = physCases * upc;
    }

    if (doOver) {
      const overCandidates = indices.filter((i) => i !== shortIdx);
      if (overCandidates.length > 0) {
        const overIdx = overCandidates[randInt(0, overCandidates.length - 1)];
        const upc = Math.max(1, Number(items[overIdx].unitsPerCase) || 1);
        const billedCases = Math.max(1, Math.round((Number(items[overIdx].qty) || upc) / upc));
        const addCases = randInt(1, 2);
        const physCases = billedCases + addCases;
        items[overIdx].physicalCases = physCases;
        items[overIdx].physicalQty = physCases * upc;
      }
    }

    entry.totalCases = items.reduce((sum, it) => {
      const upc = Math.max(1, Number(it.unitsPerCase) || 1);
      const physCases = it.physicalCases !== undefined
        ? Number(it.physicalCases)
        : Math.round(Math.max(0, Number(it.physicalQty) || 0) / upc);
      return sum + Math.max(0, physCases);
    }, 0);
  }

  function findAvailableBay(preferredBay, preferenceOrder) {
    const docks = state.hooks.dockDoors || [];
    const activeDels = typeof state.hooks.getActiveVendorDeliveries === 'function'
      ? state.hooks.getActiveVendorDeliveries()
      : (typeof state.hooks.getActiveVendorDelivery === 'function' && state.hooks.getActiveVendorDelivery()
        ? [state.hooks.getActiveVendorDelivery()]
        : []);

    const busyBays = {};
    docks.forEach((dd) => {
      if (dd && dd.hasTrailer) busyBays[dd.id] = true;
    });
    (activeDels || []).forEach((d) => {
      if (d && d.dockBay && !d.completed && !d.refused) {
        busyBays[d.dockBay] = true;
      }
    });
    state.schedule.forEach((entry) => {
      if (entry.dockBay && !entry.completed && !entry.refused && entry.status !== 'SCHEDULED') {
        busyBays[entry.dockBay] = true;
      }
    });

    if (preferredBay && !busyBays[preferredBay]) return preferredBay;
    const order = preferenceOrder || BAY_PREFERENCE_WAREHOUSE;
    for (let i = 0; i < order.length; i++) {
      const b = order[i];
      if (!busyBays[b]) return b;
    }
    return null;
  }

  function assignBayOnArrival(delivery) {
    if (!delivery) return null;
    if (delivery.type === 'sidedoor') {
      delivery.status = 'ARRIVED';
      return null;
    }
    const order = delivery.type === 'warehouse' ? BAY_PREFERENCE_WAREHOUSE : BAY_PREFERENCE_VENDOR;
    const assigned = findAvailableBay(delivery.dockBay || delivery.preferredBay, order);
    if (!assigned) return null;
    delivery.dockBay = assigned;
    delivery.status = 'ARRIVED';
    if (delivery.type === 'vendor_truck') {
      delivery.dialogueGreeting = `Morning! ${delivery.driverName} with ${delivery.carrier} backed into Bay ${assigned}. May I come in to unload Invoice #${delivery.invoiceNo}?`;
    }
    return assigned;
  }

  /**
   * 2D-matched trailer slot coordinates inside the 2-wide x 10-deep bay grid (rows 0..9).
   * Row 0 is the back/nose wall of the trailer; Row 9 is the dock doorway end.
   * Even indices occupy the left lane (colStart) and odd indices occupy the right lane (colEnd)
   * so temperature zones stay cleanly side-by-side from back (frozen) -> middle (chilled) -> front (dry).
   */
  function getTrailerSlotCoords(bayId, slotIdx) {
    const docks = state.hooks.dockDoors || [];
    const dd = docks.find((d) => d.id === bayId);
    const colStart = dd ? dd.colStart : 0;
    const colEnd = dd ? dd.colEnd : (colStart + 1);
    const row = Math.min(9, Math.floor(slotIdx / 2));
    const col = (slotIdx % 2 === 0) ? colStart : colEnd;
    return { col: col, row: row };
  }

  function countUnloadedInBay(bayId) {
    const pallets = state.hooks.pallets || [];
    return pallets.filter((p) => p.data && p.data.truck === bayId && p.data.status === 'UNLOADED').length;
  }

  function loadWarehouseTrailer(truck) {
    if (!truck || truck.spawnedCount >= truck.totalPallets) return 0;
    const createPallet3D = state.hooks.createPallet3D;
    if (typeof createPallet3D !== 'function') return 0;

    let spawnedNow = 0;
    const maxSlots = Math.min(20, truck.palletSpecs.length);

    for (let i = 0; i < maxSlots; i++) {
      const spec = truck.palletSpecs[i];
      if (!spec || spec.status !== 'PENDING_SPAWN') continue;
      const coords = getTrailerSlotCoords(truck.dockBay, i);
      spec.truck = truck.dockBay;
      spec.startCol = coords.col;
      spec.startRow = coords.row;
      spec.status = 'UNLOADED';

      const created = createPallet3D(spec);
      if (created) {
        truck.spawnedPallets.push(created);
      }
      truck.spawnedCount += 1;
      spawnedNow += 1;
    }

    if (spawnedNow > 0 && typeof state.hooks.updateStagedCounter === 'function') {
      state.hooks.updateStagedCounter();
    }
    return spawnedNow;
  }

  function arriveWarehouseTruck(truck) {
    if (!truck || truck.status !== 'SCHEDULED') return false;
    const bay = findAvailableBay(truck.preferredBay || truck.dockBay, BAY_PREFERENCE_WAREHOUSE);
    if (!bay) return false;

    truck.dockBay = bay;
    truck.status = 'ARRIVED';

    const docks = state.hooks.dockDoors || [];
    const dd = docks.find((d) => d.id === truck.dockBay);
    if (dd) {
      dd.hasTrailer = true;
      dd.trailerType = 'warehouse';
    }

    loadWarehouseTrailer(truck);
    truck.status = 'UNLOADING';

    if (typeof state.hooks.onTruckArrived === 'function') {
      state.hooks.onTruckArrived(truck);
    }

    if (typeof state.hooks.showNotification === 'function') {
      state.hooks.showNotification(
        `🚨 HIGH PRIORITY WAREHOUSE TRUCK docked at Bay ${truck.dockBay} (${truck.totalPallets} pallets). Driver waiting at Side Door!`
      );
    }
    if (typeof state.hooks.onScheduleUpdated === 'function') {
      state.hooks.onScheduleUpdated();
    }
    return true;
  }

  function markWarehouseUnloaded(truck) {
    if (!truck || truck.stagedComplete) return;
    truck.stagedComplete = true;
    truck.casesScanned = truck.totalCases;
    truck.tempChecked = true;

    if (typeof state.hooks.playSuccess === 'function') state.hooks.playSuccess();
    if (typeof state.hooks.onWarehouseUnloaded === 'function') {
      state.hooks.onWarehouseUnloaded(truck);
    }
    if (typeof state.hooks.showNotification === 'function') {
      state.hooks.showNotification(
        `📦 BAY ${truck.dockBay} UNLOADED! Meet ${truck.driverName} to sign the Bill of Lading [E].`
      );
    }
    if (typeof state.hooks.updateStagedCounter === 'function') {
      state.hooks.updateStagedCounter();
    }
    if (typeof state.hooks.onScheduleUpdated === 'function') {
      state.hooks.onScheduleUpdated();
    }
  }

  function finalizeWarehouseTruck(truck) {
    if (!truck || truck.completed) return;
    if (!truck.stagedComplete) {
      markWarehouseUnloaded(truck);
    }

    let receipt = null;
    if (!truck.receiptCreated && global.DSDReceipts && typeof global.DSDReceipts.createReceipt === 'function') {
      receipt = global.DSDReceipts.createReceipt({
        vendorNo: truck.vendorNo,
        deptNo: truck.deptNo,
        invoiceNo: truck.invoiceNo,
        type: 'invoice',
        source: 'warehouse',
        driverName: truck.driverName,
        carrier: truck.carrier,
        items: truck.invoiceItems,
        finalized: true,
        accurate: true,
        deliveryId: truck.id
      });
      if (receipt) {
        truck.receiptCreated = true;
        truck.receiptNumber = receipt.receiptNumber;
      }
    }

    truck.status = 'COMPLETE';
    truck.completed = true;
    truck.isFinalized = true;
    truck.docStates = {
      invoiceRequired: true,
      creditRequired: false,
      invoiceCreated: Boolean(truck.receiptCreated),
      creditCreated: true
    };

    if (global.ShiftStats) {
      global.ShiftStats.increment('warehouseTrucksProcessed', 1);
    }

    // Clear staged pallets belonging to this completed warehouse load so F/C/D staging zones stay open for the next truck.
    if (typeof state.hooks.removePallet3D === 'function') {
      truck.spawnedPallets.slice().forEach((palletObj) => {
        state.hooks.removePallet3D(palletObj);
      });
    }
    truck.spawnedPallets = [];

    const docks = state.hooks.dockDoors || [];
    const dd = docks.find((d) => d.id === truck.dockBay);
    if (dd) {
      dd.hasTrailer = false;
      dd.trailerType = null;
      dd.trailerDoorOpen = false;
      dd.trailerDoorProgress = 0;
    }

    if (typeof state.hooks.playSuccess === 'function') state.hooks.playSuccess();
    if (typeof state.hooks.showNotification === 'function') {
      const recStr = truck.receiptNumber ? `#${truck.receiptNumber}` : '01-AUTO';
      state.hooks.showNotification(
        `🏭 WAREHOUSE BOL SIGNED! Receipt ${recStr} auto-finalized (+350 pts). Let ${truck.driverName} out Side Door!`
      );
    }
    if (typeof state.hooks.onWarehouseCompleted === 'function') {
      state.hooks.onWarehouseCompleted(truck);
    }
    if (typeof state.hooks.updateStagedCounter === 'function') {
      state.hooks.updateStagedCounter();
    }
    if (typeof state.hooks.onScheduleUpdated === 'function') {
      state.hooks.onScheduleUpdated();
    }
  }

  function onPalletStaged(palletObj) {
    if (!palletObj || !palletObj.data || !palletObj.data.isWarehousePallet) return false;
    const truck = state.schedule.find((e) => e.id === palletObj.data.deliveryId);
    if (!truck) return false;

    const stagedInSpecs = truck.palletSpecs.filter((s) => s.status === 'STAGED_CORRECT' || s.status === 'AUDITED').length;
    truck.stagedCount = stagedInSpecs;

    if (stagedInSpecs >= truck.totalPallets && !truck.stagedComplete) {
      markWarehouseUnloaded(truck);
      return true;
    }

    if (typeof state.hooks.onScheduleUpdated === 'function') {
      state.hooks.onScheduleUpdated();
    }
    return true;
  }

  function hasWaitingWarehouseTruck() {
    return state.schedule.some((e) =>
      e.type === 'warehouse' && (e.status === 'ARRIVED' || e.status === 'UNLOADING') && !e.completed
    );
  }

  function getActiveWarehouseTruck() {
    return state.schedule.find((e) =>
      e.type === 'warehouse' && (e.status === 'ARRIVED' || e.status === 'UNLOADING') && !e.completed
    ) || null;
  }

  /**
   * Called when player checks in / starts a lower-priority non-warehouse vendor.
   * Enforces -150 pt Priority Adherence penalty if a Warehouse Truck is actively waiting/unloading.
   */
  function checkPriorityViolation(delivery) {
    if (!delivery || delivery.type === 'warehouse') return false;
    const waitingWh = getActiveWarehouseTruck();
    if (!waitingWh) return false;
    if (state.priorityWarnedDeliveryIds[delivery.id]) return false;

    state.priorityWarnedDeliveryIds[delivery.id] = true;
    if (global.ShiftStats) {
      global.ShiftStats.increment('priorityAdherenceViolations', 1);
    }
    if (typeof state.hooks.playError === 'function') state.hooks.playError();
    if (typeof state.hooks.showAlert === 'function') {
      state.hooks.showAlert(
        `⚠️ PRIORITY ADHERENCE VIOLATION (-150 pts): High-Priority Warehouse Truck is waiting at Bay ${waitingWh.dockBay}! Prioritize Warehouse freight over ${delivery.carrier}.`
      );
    }
    return true;
  }

  function ensureBayTrailerAndPalletsForVendorTruck(delivery) {
    if (!delivery || delivery.type !== 'vendor_truck' || !delivery.dockBay) return;
    if (global.DSDReceipts && typeof global.DSDReceipts.enrichDelivery === 'function') {
      global.DSDReceipts.enrichDelivery(delivery);
    }

    const docks = state.hooks.dockDoors || [];
    const dd = docks.find((d) => d.id === delivery.dockBay);
    if (dd) {
      dd.hasTrailer = true;
      dd.trailerType = 'vendor_truck';
    }

    const pallets = state.hooks.pallets || [];
    const existing = pallets.filter((p) => p.data && p.data.deliveryId === delivery.id);
    if (existing.length > 0) return;

    const createPallet3D = state.hooks.createPallet3D;
    if (typeof createPallet3D !== 'function') return;

    const physicalBoxes = Array.isArray(delivery.physicalBoxes) ? delivery.physicalBoxes : [];
    const MAX_STACK_H = 4;
    const upcGroups = [];
    const groupMap = new Map();
    physicalBoxes.forEach((box) => {
      const code = String(box.code || '');
      let grp = groupMap.get(code);
      if (!grp) {
        grp = { code: code, boxes: [], stacks: [] };
        groupMap.set(code, grp);
        upcGroups.push(grp);
      }
      grp.boxes.push(box);
    });
    upcGroups.forEach((grp) => {
      for (let i = 0; i < grp.boxes.length; i += MAX_STACK_H) {
        grp.stacks.push(grp.boxes.slice(i, i + MAX_STACK_H));
      }
    });

    // Pack whole UPC groups onto pallets (4 cases high): max 8 outer stacks by default,
    // or 9 stacks only when the pallet contains a full 4-case stack for the center column.
    const palletChunks = [];
    let curBoxes = [];
    let curStacks = 0;
    let curHasFull = false;

    const flushPallet = () => {
      if (curBoxes.length > 0) {
        palletChunks.push(curBoxes);
        curBoxes = [];
        curStacks = 0;
        curHasFull = false;
      }
    };

    upcGroups.forEach((grp) => {
      const grpHasFull = grp.stacks.some((st) => st.length >= MAX_STACK_H);
      const maxSlotsWithGrp = (curHasFull || grpHasFull) ? 9 : 8;
      if (curStacks > 0 && curStacks + grp.stacks.length > maxSlotsWithGrp) {
        flushPallet();
      }
      grp.stacks.forEach((st) => {
        const limit = (curHasFull || st.length >= MAX_STACK_H) ? 9 : 8;
        if (curStacks + 1 > limit) {
          flushPallet();
        }
        curBoxes.push(...st);
        curStacks += 1;
        if (st.length >= MAX_STACK_H) curHasFull = true;
      });
    });
    flushPallet();

    if (palletChunks.length === 0) {
      palletChunks.push([]);
    }

    const zInfo = zoneDisplayInfo(delivery.tempZone || 'D');
    const colStart = dd ? dd.colStart : 6;
    const colEnd = dd ? dd.colEnd : 7;

    // Load pallets behind the doorway onboard electric jack zone inside the 6-row (rows 4..9) vendor trailer.
    palletChunks.forEach((chunk, i) => {
      const col = palletChunks.length === 1
        ? (colStart + 0.5)
        : ((i % 2 === 0) ? colStart : colEnd);
      const row = Math.max(4.6, 7.8 - Math.floor(i / 2) * 1.5);
      const spec = {
        id: `VTRK_${delivery.id}_${i + 1}`,
        truck: delivery.dockBay,
        deliveryId: delivery.id,
        isWarehousePallet: false,
        palletIndex: i,
        palletTotal: palletChunks.length,
        po: `#${(delivery.invoiceNo || '5500').slice(-4)}-${i + 1}`,
        name: `${delivery.carrier} (${chunk.length} Cs)`,
        targetZone: 'D',
        expectedTemp: zInfo.expectedTemp,
        actualTemp: zInfo.actualTemp,
        colorHex: '#78716c',
        startCol: col,
        startRow: row,
        physicalBoxes: chunk,
        status: 'UNLOADED'
      };
      createPallet3D(spec);
    });
  }

  function clearDeliveryPallets(deliveryId) {
    if (!deliveryId) return;
    const pallets = state.hooks.pallets || [];
    const removePallet3D = state.hooks.removePallet3D;
    if (typeof removePallet3D !== 'function') return;
    pallets.slice().forEach((p) => {
      if (p.data && p.data.deliveryId === deliveryId) {
        removePallet3D(p);
      }
    });
  }

  function clearVendorBayTrailer(bayId) {
    if (!bayId) return;
    const whUsingBay = state.schedule.some((e) =>
      e.type === 'warehouse' && e.dockBay === bayId && !e.completed
    );
    const docks = state.hooks.dockDoors || [];
    const dd = docks.find((d) => d.id === bayId);
    if (dd && !whUsingBay) {
      dd.hasTrailer = false;
      dd.trailerType = null;
      dd.trailerDoorOpen = false;
      dd.trailerDoorProgress = 0;
    }
  }

  function getBayState(bayId) {
    const wh = state.schedule.find((e) =>
      e.type === 'warehouse' && e.dockBay === bayId && !e.completed && (e.status === 'ARRIVED' || e.status === 'UNLOADING')
    );
    if (!wh) return { warehouseActive: false, waiting: false };
    return {
      warehouseActive: true,
      waiting: countUnloadedInBay(bayId) > 0,
      truck: wh
    };
  }

  function tryArriveQueuedTrucks(snap) {
    const s = snap || state.lastSnap || (global.ShiftClock ? global.ShiftClock.getTimeSnapshot() : { hour: 6, minute: 0 });
    const nowMins = (s && s.hour !== undefined) ? (s.hour * 60 + s.minute) : 360;
    state.schedule.forEach((entry) => {
      if (entry.type === 'warehouse' && entry.status === 'SCHEDULED' && nowMins >= entry.etaTotalMins) {
        arriveWarehouseTruck(entry);
      }
    });
  }

  function onMinuteTick(snap) {
    state.lastSnap = snap;
    tryArriveQueuedTrucks(snap);
  }

  function getScheduleRows() {
    return state.schedule.slice();
  }

  function getNonWarehouseQueue() {
    return state.schedule.filter((e) => e.type !== 'warehouse');
  }

  function getCounterSummary() {
    const activeWh = getActiveWarehouseTruck();
    const pallets = state.hooks.pallets || [];
    if (activeWh) {
      return {
        label: `BAY ${activeWh.dockBay} WAREHOUSE: `,
        staged: activeWh.stagedCount,
        total: activeWh.totalPallets,
        isWarehouse: true
      };
    }
    const whEntries = state.schedule.filter((e) => e.type === 'warehouse');
    const totalWhPallets = whEntries.reduce((s, e) => s + e.totalPallets, 0);
    const stagedWhPallets = whEntries.reduce((s, e) => s + e.stagedCount, 0);
    if (pallets.length > 0) {
      const stagedFloor = pallets.filter((p) => p.data && (p.data.status === 'STAGED_CORRECT' || p.data.status === 'AUDITED')).length;
      return {
        label: 'DOCK PALLETS: ',
        staged: stagedFloor,
        total: pallets.length,
        isWarehouse: false
      };
    }
    return {
      label: 'SHIFT WAREHOUSE: ',
      staged: stagedWhPallets,
      total: totalWhPallets,
      isWarehouse: true
    };
  }

  function getUnfinishedSummary() {
    const outstandingWarehouse = state.schedule.filter((e) =>
      e.type === 'warehouse' && (e.status === 'ARRIVED' || e.status === 'UNLOADING') && !e.completed
    ).length;
    return { outstandingWarehouse };
  }

  function clearAllSpawnedPallets() {
    const pallets = state.hooks.pallets || [];
    if (typeof state.hooks.removePallet3D === 'function') {
      pallets.slice().forEach((p) => state.hooks.removePallet3D(p));
    }
  }

  function resetForShift(opts) {
    clearAllSpawnedPallets();
    const docks = state.hooks.dockDoors || [];
    docks.forEach((dd) => {
      dd.hasTrailer = false;
      dd.trailerType = null;
      dd.trailerDoorOpen = false;
      dd.trailerDoorProgress = 0;
    });
    generateDailySchedule(opts);
    if (typeof state.hooks.updateStagedCounter === 'function') state.hooks.updateStagedCounter();
    if (typeof state.hooks.onScheduleUpdated === 'function') state.hooks.onScheduleUpdated();
  }

  function exportState() {
    const cleanSchedule = (state.schedule || []).map((entry) => {
      const copy = JSON.parse(JSON.stringify(entry, (k, v) => (k === 'spawnedPallets' || k === 'mesh' ? undefined : v)));
      copy.spawnedPallets = [];
      return copy;
    });
    return {
      palletCounter: Number(state.palletCounter) || 1,
      invoiceSeed: Number(state.invoiceSeed) || 901100,
      shiftLimits: Object.assign({}, state.shiftLimits),
      priorityWarnedDeliveryIds: Object.assign({}, state.priorityWarnedDeliveryIds),
      schedule: cleanSchedule
    };
  }

  function relinkSpawnedPallets(palletsList) {
    const list = Array.isArray(palletsList) ? palletsList : (state.hooks.pallets || []);
    (state.schedule || []).forEach((entry) => {
      if (!entry) return;
      entry.spawnedPallets = [];
      if (entry.type === 'warehouse') {
        list.forEach((p) => {
          if (p && p.data && p.data.deliveryId === entry.id) {
            entry.spawnedPallets.push(p);
          }
        });
      }
    });
    if (typeof state.hooks.updateStagedCounter === 'function') state.hooks.updateStagedCounter();
  }

  function importState(data) {
    if (!data || typeof data !== 'object') return false;
    clearAllSpawnedPallets();
    const docks = state.hooks.dockDoors || [];
    docks.forEach((dd) => {
      dd.hasTrailer = false;
      dd.trailerType = null;
      dd.trailerDoorOpen = false;
      dd.trailerDoorProgress = 0;
    });
    state.palletCounter = Number.isFinite(Number(data.palletCounter)) ? Number(data.palletCounter) : 1;
    state.invoiceSeed = Number.isFinite(Number(data.invoiceSeed)) ? Number(data.invoiceSeed) : 901100;
    const cfg = getCatalogConfig();
    const lim = data.shiftLimits || {};
    state.shiftLimits = {
      dryRemaining: Number.isFinite(Number(lim.dryRemaining)) ? Number(lim.dryRemaining) : Number(cfg.maxDryPallets || 10),
      chilledRemaining: Number.isFinite(Number(lim.chilledRemaining)) ? Number(lim.chilledRemaining) : Number(cfg.maxChilledPallets || 8),
      frozenRemaining: Number.isFinite(Number(lim.frozenRemaining)) ? Number(lim.frozenRemaining) : Number(cfg.maxFrozenPallets || 8)
    };
    state.priorityWarnedDeliveryIds = Object.assign({}, data.priorityWarnedDeliveryIds || {});
    state.schedule = Array.isArray(data.schedule)
      ? data.schedule.map((e) => {
        const cloned = JSON.parse(JSON.stringify(e));
        cloned.spawnedPallets = [];
        return cloned;
      })
      : [];
    if (typeof state.hooks.updateStagedCounter === 'function') state.hooks.updateStagedCounter();
    if (typeof state.hooks.onScheduleUpdated === 'function') state.hooks.onScheduleUpdated();
    return true;
  }

  function init(hooks) {
    state.hooks = hooks || {};
    if (!state.initialized) {
      state.initialized = true;
      if (global.ShiftClock && typeof global.ShiftClock.on === 'function') {
        global.ShiftClock.on('onMinuteTick', onMinuteTick);
      }
    }
    resetForShift();
  }

  global.WarehouseTrucks = {
    init: init,
    resetForShift: resetForShift,
    exportState: exportState,
    importState: importState,
    relinkSpawnedPallets: relinkSpawnedPallets,
    generateDailySchedule: generateDailySchedule,
    getScheduleRows: getScheduleRows,
    getNonWarehouseQueue: getNonWarehouseQueue,
    onPalletStaged: onPalletStaged,
    finalizeWarehouseTruck: finalizeWarehouseTruck,
    onMinuteTick: onMinuteTick,
    tryArriveQueuedTrucks: tryArriveQueuedTrucks,
    findAvailableBay: findAvailableBay,
    checkPriorityViolation: checkPriorityViolation,
    assignBayOnArrival: assignBayOnArrival,
    ensureBayTrailerAndPalletsForVendorTruck: ensureBayTrailerAndPalletsForVendorTruck,
    clearVendorBayTrailer: clearVendorBayTrailer,
    clearDeliveryPallets: clearDeliveryPallets,
    getBayState: getBayState,
    hasWaitingWarehouseTruck: hasWaitingWarehouseTruck,
    getActiveWarehouseTruck: getActiveWarehouseTruck,
    getCounterSummary: getCounterSummary,
    getUnfinishedSummary: getUnfinishedSummary
  };
})(window);
