(function (global) {
  'use strict';

  /**
   * DSDCatalog - Loads departments, vendors, products, PLUs, warehouse claim items,
   * and recall products from ./data/dsd-catalog.json and provides lookup helpers.
   */
  const SHIFT_CONFIG = Object.freeze({
    shiftStartHour: 6,
    shiftDurationHours: 8,
    timeSpeedMultiplier: 1,
    msPerGameMinute: 6000,
    deliveryCutoffHour: 12,
    minWarehouseTrucksPerDay: 1,
    maxWarehouseTrucksPerDay: 2,
    minDeliveriesPerDay: 8,
    maxDeliveriesPerDay: 10,
    maxDryPallets: 10,
    maxChilledPallets: 8,
    maxFrozenPallets: 8,
    minNightDrops: 0,
    maxNightDrops: 2,
    minNightDropCases: 2,
    maxNightDropCases: 4,
    minTasks: 2,
    maxTasks: 4,
    taskCutoffMinute: 690, // 11:30 AM stop dropping daily Home Office tasks
    taskFrequencySec: 180,
    discrepancyRate: 25,
    backstockPullMinPercent: 20,
    backstockPullMaxPercent: 50,
    startDate: { month: 1, day: 1, year: 1996 }, // Feb 1, 1996 (0-indexed month)
    endCampaignDate: { month: 2, day: 1, year: 1996 } // Past Feb 29, 1996 (21 working days)
  });

  const SCORING_CONFIG = Object.freeze({
    positive: Object.freeze({
      nightDropCheckin: 200,
      sideDoorCheckin: 150,
      truckCheckin: 200,
      warehouseUnload: 350,
      taskComplete: 250,
      recallComplete: 500,
      suppliesPutAway: 300,
      claimsAllDone: 400,
      backstockPutAway: 300,
      backstockInventoried: 300,
      filingComplete: 250
    }),
    negative: Object.freeze({
      refuseGoodMerch: -300,
      acceptOutOfTemp: -800,
      missedTempCheck: -150,
      inaccurateInvoice: -100,
      priorityViolation: -150,
      outstandingSideDoor: -200,
      outstandingTruck: -200,
      outstandingNightDrop: -150,
      warehouseNotUnloaded: -400,
      claimsNotDone: -300,
      suppliesNotPutAway: -200,
      backstockNotPutAway: -200,
      backstockNotInventoried: -200,
      recallNotDone: -500,
      taskNotDone: -250,
      doorLeftOpen: -200,
      doorLeftOpenProlonged: -100,
      supplyOutOfStock: -200,
      wrongClaimDisposition: -50,
      wrongHazwasteDisposition: -150,
      wrongTaskAction: -100
    })
  });

  const TEMP_MAP = { refrigerated: 'chilled', chilled: 'chilled', frozen: 'frozen', ambient: 'ambient' };
  const CASE_SIZE_BY_DIM = { small: 12, medium: 8, large: 4 };
  const CREDIT_DEPTS = [10, 11, 13, 14, 15, 20, 21, 23, 30, 31, 32, 60];
  const NO_CREDIT_PRODUCE_DEPTS = [12, 22];

  function resolveUnitsPerCase(prodOrSize, fallbackSize) {
    if (prodOrSize && typeof prodOrSize === 'object') {
      const explicit = Number(prodOrSize.unitsPerCase);
      if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
      const sz = String(prodOrSize.size || fallbackSize || 'medium').toLowerCase();
      return CASE_SIZE_BY_DIM[sz] || 8;
    }
    if (typeof prodOrSize === 'number' && Number.isFinite(prodOrSize) && prodOrSize > 0) {
      return Math.round(prodOrSize);
    }
    const sz = String(prodOrSize || fallbackSize || 'medium').toLowerCase();
    return CASE_SIZE_BY_DIM[sz] || 8;
  }

  let loaded = false;
  let loadPromise = null;

  const departments = {};
  const recallProducts = [];
  const warehouseClaimProducts = [];
  const allVendorEntries = [];
  const allProducts = [];
  const productsByCode = {};
  const vendorsByNo = {};
  const warehouseClaimProductsByCode = {};

  function clearObject(obj) {
    Object.keys(obj).forEach((k) => { delete obj[k]; });
  }

  function hydrate(data) {
    clearObject(departments);
    clearObject(productsByCode);
    clearObject(vendorsByNo);
    clearObject(warehouseClaimProductsByCode);
    recallProducts.length = 0;
    warehouseClaimProducts.length = 0;
    allVendorEntries.length = 0;
    allProducts.length = 0;

    const rawDepts = (data && data.departments) || {};
    Object.keys(rawDepts).forEach((deptNo) => {
      const dept = rawDepts[deptNo];
      departments[deptNo] = dept;
      if (!dept || !dept.vendors) return;
      const deptNumber = parseInt(deptNo, 10);

      Object.keys(dept.vendors).forEach((vendorNo) => {
        const vendor = dept.vendors[vendorNo];
        const vendorProducts = [];

        if (vendor.products) {
          Object.keys(vendor.products).forEach((code) => {
            const prod = vendor.products[code];
            const type = prod.type || 'ambient';
            const size = prod.size || 'medium';
            const unitsPerCase = deptNumber === 1 ? 1 : resolveUnitsPerCase(prod, size);
            const entry = {
              id: prod.id || code,
              name: prod.name,
              type: type,
              temp: prod.temp || TEMP_MAP[type] || 'ambient',
              size: size,
              unitsPerCase: unitsPerCase,
              price: Number(prod.price) || 0,
              code: String(code),
              deptNo: String(deptNo),
              notScannable: Boolean(prod.notScannable),
              claimKeywords: Array.isArray(prod.claimKeywords) ? prod.claimKeywords.slice() : []
            };
            vendorProducts.push(entry);
            if (!productsByCode[entry.code]) {
              productsByCode[entry.code] = entry;
              allProducts.push(entry);
            }
          });
        }

        const givesCredit = !NO_CREDIT_PRODUCE_DEPTS.includes(deptNumber) &&
          (vendor.givesCredit !== undefined ? Boolean(vendor.givesCredit) : CREDIT_DEPTS.includes(deptNumber));

        const vendorEntry = {
          vendorNo: String(vendorNo),
          name: vendor.name,
          type: vendor.type || 'side_door',
          deptNo: String(deptNo),
          deptName: dept.name,
          products: vendorProducts,
          givesCredit: givesCredit
        };
        allVendorEntries.push(vendorEntry);
        vendorsByNo[vendorEntry.vendorNo] = vendorEntry;
      });
    });

    const rawClaims = (data && Array.isArray(data.warehouseClaimProducts)) ? data.warehouseClaimProducts : [];
    rawClaims.forEach((p) => {
      const series = Math.floor(parseInt(p.deptNo, 10) / 10);
      const type = series === 3 ? 'frozen' : (series === 2 ? 'refrigerated' : 'ambient');
      const size = p.size || 'medium';
      const entry = {
        id: 'wcp_' + p.code,
        name: p.name,
        code: String(p.code),
        type: type,
        temp: TEMP_MAP[type],
        size: size,
        unitsPerCase: resolveUnitsPerCase(p, size),
        price: Number(p.price) || 0,
        notScannable: Boolean(p.notScannable),
        warehouseOnly: true,
        deptNo: String(p.deptNo),
        claimKeywords: []
      };
      warehouseClaimProducts.push(entry);
      warehouseClaimProductsByCode[entry.code] = entry;
      if (!productsByCode[entry.code]) {
        productsByCode[entry.code] = entry;
        allProducts.push(entry);
      }
    });

    const rawRecalls = (data && Array.isArray(data.recallProducts)) ? data.recallProducts : [];
    rawRecalls.forEach((r) => {
      recallProducts.push(Object.freeze({ key: r.key, name: r.name, bin: r.bin }));
    });

    loaded = true;
  }

  function loadFallbackScript(fallbackUrl) {
    if (global.__DSD_CATALOG_FALLBACK__) {
      hydrate(global.__DSD_CATALOG_FALLBACK__);
      return Promise.resolve(global.DSDCatalog);
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = fallbackUrl || './data/dsd-catalog-fallback.js';
      script.onload = () => {
        if (global.__DSD_CATALOG_FALLBACK__) {
          hydrate(global.__DSD_CATALOG_FALLBACK__);
        }
        resolve(global.DSDCatalog);
      };
      script.onerror = () => {
        console.warn('DSDCatalog failed to load fallback script:', script.src);
        resolve(global.DSDCatalog);
      };
      document.head.appendChild(script);
    });
  }

  function load(url) {
    if (loaded) return Promise.resolve(global.DSDCatalog);
    if (loadPromise) return loadPromise;

    const targetUrl = url || './data/dsd-catalog.json';

    // 1. Direct Astrocade gameConfig override if departments are provided there
    if (global.gameConfig && global.gameConfig.departments) {
      hydrate(global.gameConfig);
      return Promise.resolve(global.DSDCatalog);
    }

    // 2. Local file:// opening: browsers block fetch() via CORS, so load the JS fallback mirror
    if (global.location && global.location.protocol === 'file:') {
      loadPromise = loadFallbackScript('./data/dsd-catalog-fallback.js');
      return loadPromise;
    }

    // 3. Astrocade multi-file hosting & local HTTP server: fetch JSON directly, fallback on error
    loadPromise = fetch(targetUrl)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' loading ' + targetUrl);
        return res.json();
      })
      .then((json) => {
        hydrate(json);
        return global.DSDCatalog;
      })
      .catch((err) => {
        console.warn('DSDCatalog fetch failed for ' + targetUrl + ', using fallback:', err);
        return loadFallbackScript('./data/dsd-catalog-fallback.js');
      });

    return loadPromise;
  }

  function padDept(deptNo) {
    const clean = String(deptNo || '').replace(/\D/g, '');
    return clean ? clean.padStart(2, '0').slice(-2) : '';
  }

  function getDepartment(deptNo) {
    return departments[padDept(deptNo)] || departments[String(deptNo)] || null;
  }

  function getVendor(vendorNo) {
    return vendorsByNo[String(vendorNo)] || null;
  }

  function getVendorInDept(vendorNo, deptNo) {
    const cleanDept = padDept(deptNo);
    return allVendorEntries.find((v) => v.vendorNo === String(vendorNo) && padDept(v.deptNo) === cleanDept) || null;
  }

  function getVendorsByType(type) {
    return allVendorEntries.filter((v) => v.type === type);
  }

  function getProduct(code) {
    return productsByCode[String(code)] || null;
  }

  function getProductDeptNo(code) {
    const strCode = String(code);
    const ve = allVendorEntries.find((v) => v.products.some((p) => p.code === strCode));
    if (ve) return ve.deptNo;
    const wcp = warehouseClaimProductsByCode[strCode];
    return wcp ? wcp.deptNo : null;
  }

  function getTemperatureZone(tempOrType) {
    const val = String(tempOrType || 'ambient').toLowerCase();
    if (val === 'frozen' || val === 'f') return 'F';
    if (val === 'chilled' || val === 'refrigerated' || val === 'c') return 'C';
    return 'D';
  }

  function getBackstockRoom(deptNo) {
    const d = parseInt(deptNo, 10);
    if (d >= 10 && d <= 19) return 'dry';
    if (d >= 20 && d <= 29) return 'cooler';
    if (d >= 30 && d <= 39) return 'freezer';
    return null;
  }

  global.DSDCatalog = {
    SHIFT_CONFIG: SHIFT_CONFIG,
    SCORING_CONFIG: SCORING_CONFIG,
    DEPARTMENTS: departments,
    RECALL_PRODUCTS: recallProducts,
    WAREHOUSE_CLAIM_PRODUCTS: warehouseClaimProducts,
    allVendorEntries: allVendorEntries,
    allProducts: allProducts,
    load: load,
    isLoaded: () => loaded,
    getDepartment: getDepartment,
    getVendor: getVendor,
    getVendorInDept: getVendorInDept,
    getVendorsByType: getVendorsByType,
    getProduct: getProduct,
    getProductDeptNo: getProductDeptNo,
    getUnitsPerCase: resolveUnitsPerCase,
    getTemperatureZone: getTemperatureZone,
    getBackstockRoom: getBackstockRoom
  };
})(window);
