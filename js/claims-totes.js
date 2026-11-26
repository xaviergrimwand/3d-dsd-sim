(function (global) {
  'use strict';

  /**
   * ClaimsTotes (Phase 5 - Claims & Damages Inspection + Disposition)
   * Manages the 7 gray department claims totes + 1 red Vendor Credit Tote + 4 floor receptacles:
   * - Generates daily damaged items across all 7 gray department totes
   * - Represents each item with basic recognizable 3D geometry & damage cues
   *   ('leaking', 'dented', 'wet_saturated', 'missing_label')
   * - Clicking or pressing [E] on a gray tote slides it slightly forward & tips it down 45 deg
   *   directly on Claims Steel so hands stay free to inspect & scan items
   * - Supports tight bounding box + emissive item highlighting, disposition resolution,
   *   picking up confirmed items, and placing them into Trash / Organics / Hazwaste / Donate / Credit Tote
   */

  const TOTE_FLOOR_Y = 0.026;
  const TILT_TARGET_RAD = Math.PI / 4; // 45 deg forward tilt toward North aisle
  const TOTE_OPEN_OFFSET_Y = 0.18;
  const TOTE_OPEN_OFFSET_Z = -0.36;

  // 2 cols x 3 rows inside 0.65m W x 0.78m D open tote cavity
  const ITEM_SLOT_POSITIONS = [
    [-0.145, -0.21],
    [0.145, -0.21],
    [-0.145, 0.0],
    [0.145, 0.0],
    [-0.145, 0.21],
    [0.145, 0.21]
  ];

  const TOTE_DEPT_FILTERS = [
    (d) => d === '01',
    (d) => { const n = parseInt(d, 10); return n >= 10 && n <= 19; },
    (d) => { const n = parseInt(d, 10); return n >= 20 && n <= 29; },
    (d) => { const n = parseInt(d, 10); return n >= 30 && n <= 39; },
    (d) => { const n = parseInt(d, 10); return n >= 40 && n <= 49; },
    (d) => d === '50',
    (d) => d === '60'
  ];

  const DAMAGE_CONDITIONS = Object.freeze([
    { key: 'leaking', label: 'Leaking', short: 'Leaking' },
    { key: 'dented', label: 'Dented', short: 'Dented' },
    { key: 'wet_saturated', label: 'Wet/Saturated', short: 'Wet/Saturated' },
    { key: 'missing_label', label: 'Missing Label/Nutrition Info', short: 'Missing Label' }
  ]);

  const RECEPTACLE_LABELS = Object.freeze({
    trash: 'TRASH',
    organics: 'ORGANICS',
    hazwaste: 'HAZWASTE',
    donate: 'DONATE',
    vendor_credit: 'RED CREDIT TOTE'
  });

  const CLAIMS_HAZWASTE_KEYWORDS = ['chemicals', 'flammables', 'aerosols'];

  const PALETTE_SWATCHES = [
    0xdc2626, // Crimson
    0x2563eb, // Royal Blue
    0x16a34a, // Emerald
    0xd97706, // Amber/Gold
    0x9333ea, // Violet
    0x0d9488, // Teal
    0xea580c, // Tangy Orange
    0xbe185d  // Berry
  ];

  const state = {
    initialized: false,
    scene: null,
    camera: null,
    world: null,
    totes: [],
    hitMeshes: [],
    receptacles: [], // [{ id, label, mesh, hitMeshes, centerPos, boxSize, toteRec }]
    receptacleHitMeshes: [],
    heldItem: null,
    heldItemTote: null,
    heldViewMesh: null,
    populated: false,
    nextItemSeq: 1,
    matCache: {},
    hooks: {
      onRecallTriggered: null
    },
    recall: null
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function hashString(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function getMat(hex, opts) {
    const o = opts || {};
    const rough = o.roughness !== undefined ? o.roughness : 0.55;
    const metal = o.metalness !== undefined ? o.metalness : 0.08;
    const trans = Boolean(o.transparent);
    const op = o.opacity !== undefined ? o.opacity : 1;
    const key = `${hex}|${rough.toFixed(2)}|${metal.toFixed(2)}|${trans ? 1 : 0}|${op.toFixed(2)}`;
    if (!state.matCache[key]) {
      state.matCache[key] = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough,
        metalness: metal,
        transparent: trans,
        opacity: op
      });
    }
    return state.matCache[key];
  }

  function getConditionInfo(key) {
    const found = DAMAGE_CONDITIONS.find((c) => c.key === key);
    return found || DAMAGE_CONDITIONS[0];
  }

  function getReceptacleLabel(id) {
    return RECEPTACLE_LABELS[id] || String(id || 'RECEPTACLE').toUpperCase();
  }

  function getItemHazardKeywords(item) {
    if (!item) return [];
    const nameLC = String(item.name || '').toLowerCase();
    const keywords = [];
    const legacyHazardMap = {
      chemical: 'chemicals',
      chemicals: 'chemicals',
      spray: 'aerosols',
      aerosol: 'aerosols',
      aerosols: 'aerosols',
      flammable: 'flammables',
      flammables: 'flammables',
      bleach: 'chemicals',
      cleaner: 'chemicals',
      repellent: 'aerosols',
      sanitizer: 'chemicals',
      chlorine: 'chemicals',
      ammonia: 'chemicals',
      acid: 'chemicals',
      solvent: 'chemicals',
      'lighter fluid': 'flammables'
    };
    const add = (val) => {
      const clean = String(val || '').trim().toLowerCase();
      const canonical = legacyHazardMap[clean] || clean;
      if (canonical && keywords.indexOf(canonical) === -1) keywords.push(canonical);
    };

    const cat = global.DSDCatalog;
    const prod = (cat && typeof cat.getProduct === 'function') ? cat.getProduct(String(item.code)) : null;
    (item.claimKeywords || (prod && prod.claimKeywords) || []).forEach(add);

    [
      ['bleach', 'chemicals'], ['cleaner', 'chemicals'], ['dish soap', 'chemicals'],
      ['detergent', 'chemicals'], ['sanitizer', 'chemicals'], ['hand soap', 'chemicals'],
      ['spray', 'aerosols'], ['repellent', 'aerosols'], ['aerosol', 'aerosols'],
      ['deodorant', 'aerosols'], ['chlorine', 'chemicals'], ['ammonia', 'chemicals'],
      ['acid', 'chemicals'], ['solvent', 'chemicals'], ['lighter fluid', 'flammables'],
      ['citronella', 'flammables']
    ].forEach(([needle, kw]) => {
      if (nameLC.includes(needle)) add(kw);
    });

    if (nameLC.includes('repellent')) {
      add('chemicals');
      add('aerosols');
    }
    return keywords;
  }

  function isItemVendorCreditEligible(item) {
    if (!item) return false;
    const cat = global.DSDCatalog;
    if (!cat) return false;
    const prod = typeof cat.getProduct === 'function' ? cat.getProduct(String(item.code)) : null;
    if (prod && prod.warehouseOnly) return false;
    const rawDept = item.deptNo || (typeof cat.getProductDeptNo === 'function' ? cat.getProductDeptNo(item.code) : '0');
    const deptNo = parseInt(rawDept, 10) || 0;
    if (deptNo === 12 || deptNo === 22) return false; // Dry/Chilled produce never vendor credit
    if (Array.isArray(cat.allVendorEntries)) {
      const ve = cat.allVendorEntries.find((v) => v && Array.isArray(v.products) && v.products.some((p) => String(p.code) === String(item.code)));
      if (ve) return Boolean(ve.givesCredit || ve.deptNo === '60');
    }
    return false;
  }

  function computeDispositionForItem(item, conditionKey) {
    if (!item) return 'trash';
    if (isItemVendorCreditEligible(item)) return 'vendor_credit';

    const cat = global.DSDCatalog;
    const rawDept = item.deptNo || (cat && typeof cat.getProductDeptNo === 'function' ? cat.getProductDeptNo(item.code) : '0');
    const deptNo = parseInt(rawDept, 10) || 0;

    // Frozen items (3X) that don't receive vendor credit go to trash
    if (deptNo >= 30 && deptNo <= 39) return 'trash';

    // Chemicals, flammables & aerosols always require hazwaste
    const kws = getItemHazardKeywords(item);
    if (CLAIMS_HAZWASTE_KEYWORDS.some((kw) => kws.includes(kw))) {
      return 'hazwaste';
    }

    // Perishable non-frozen produce / meat / dairy -> organics
    const organicDepts = [1, 12, 20, 21, 22, 23];
    if (organicDepts.includes(deptNo)) return 'organics';

    // Non-frozen ambient items with minor denting (label still intact) -> donate
    const cond = conditionKey || item.damageType;
    const prod = (cat && typeof cat.getProduct === 'function') ? cat.getProduct(String(item.code)) : null;
    const prodType = String((item.type || (prod && prod.type) || 'ambient')).toLowerCase();
    const isAmbient = prodType === 'ambient';
    if (cond === 'dented' && isAmbient) return 'donate';

    // Leaking, Wet/Saturated, or Missing Label/Nutrition Info -> trash
    return 'trash';
  }

  function classifyItemShape(prod) {
    const n = String((prod && prod.name) || '').toLowerCase();
    const deptNo = String((prod && prod.deptNo) || '');

    if (n.includes('egg')) return 'eggs';
    if (n.includes('pizza') || n.includes('pot pie') || n.includes('dinner') || n.includes('burrito') || n.includes('lasagna') || n.includes('waffle') || n.includes('chicken pack') || n.includes('deli meat')) return 'pizza';
    if (n.includes('bread') || n.includes('loaf') || n.includes('bun') || n.includes('bagel') || n.includes('muffin') || n.includes('croissant') || n.includes('tortilla') || n.includes('ciabatta') || n.includes('focaccia') || n.includes('brioche') || n.includes('rye') || n.includes('pumpernickel')) return 'bread';
    if (n.includes('peanut butter') || n.includes('almond butter') || n.includes('mayo') || n.includes('jam') || n.includes('jelly') || n.includes('honey') || n.includes('pickle') || n.includes('salsa') || n.includes('coconut oil') || n.includes('marinara') || n.includes('alfredo') || n.includes('pesto') || n.includes('olive')) return 'jar';
    if (n.includes('spray') || n.includes('aerosol') || n.includes('repellent') || n.includes('sanitizer') || n.includes('air fresh')) return 'can';
    if (n.includes('gallon') || n.includes('gal') || n.includes('milk') || n.includes('bleach') || n.includes('detergent') || n.includes('cleaner') || n.includes('jug') || n.includes('coolant')) return 'jug';
    if (n.includes('broth') || n.includes('stock') || n.includes('carton') || n.includes('oat milk') || n.includes('almond milk') || n.includes('kefir')) return 'carton';
    if (n.includes('ice cream') || n.includes('yogurt') || n.includes('cottage') || n.includes('hummus') || n.includes('sour cream') || n.includes('cream cheese') || n.includes('butter') || n.includes('whipped') || n.includes('tub') || n.includes('dip')) return 'tub';
    if (n.includes('soup') || n.includes('bean') || n.includes('canned') || n.includes('tomato sauce') || n.includes('tuna') || n.includes('corn') || n.includes('peas') || n.includes('tin') || n.includes('can ') || n.includes(' can') || n.includes('formula') || n.includes('soda') || n.includes('energy') || n.includes('sparkling') || n.includes('shot') || n.includes('4pk')) return 'can';
    if (n.includes('juice') || n.includes('oil') || n.includes('vinegar') || n.includes('bottle') || n.includes('wine') || n.includes('ketchup') || n.includes('mustard') || n.includes('syrup') || n.includes('dressing') || n.includes('sauce') || n.includes('water') || n.includes('shampoo') || n.includes('lotion') || n.includes('wash') || n.includes('soap')) return 'bottle';
    if (n.includes('bagged') || n.includes('bag ') || n.includes('bag') || n.includes('chip') || n.includes('dog food') || n.includes('cat food') || n.includes('rice') || n.includes('flour') || n.includes('sugar') || n.includes('pretzel') || n.includes('popcorn') || n.includes('trail mix') || n.includes('kibble') || n.includes('litter') || n.includes('candy') || n.includes('gummy') || n.includes('jerky') || n.includes('taffy') || n.includes('caramel') || n.includes('licorice') || n.includes('belt') || n.includes('worm') || n.includes('onion') || n.includes('potato')) return 'bag';
    if (n.includes('pasta') || n.includes('penne') || n.includes('spaghetti') || n.includes('cereal') || n.includes('cracker') || n.includes('cookie') || n.includes('granola') || n.includes('bar') || n.includes('tea') || n.includes('tissue') || n.includes('mix') || n.includes('quinoa') || n.includes('oat') || n.includes('box') || n.includes('tape') || n.includes('label') || n.includes('glove') || n.includes('blade') || n.includes('paper') || n.includes('wrap')) return 'box';
    if (n.includes('banana') || n.includes('avocado') || n.includes('apple') || n.includes('orange') || n.includes('mango') || n.includes('pineapple') || n.includes('garlic') || n.includes('tomato') || n.includes('lemon') || n.includes('lime') || n.includes('pepper') || deptNo === '01') return 'produce';
    return 'box';
  }

  function resolveAccentColor(item) {
    const n = String((item && item.name) || '').toLowerCase();
    if (n.includes('tomato') || n.includes('ketchup') || n.includes('marinara') || n.includes('salsa') || n.includes('strawberry') || n.includes('apple')) return 0xdc2626;
    if (n.includes('banana') || n.includes('lemon') || n.includes('mustard') || n.includes('corn') || n.includes('pineapple') || n.includes('pasta') || n.includes('penne')) return 0xeab308;
    if (n.includes('avocado') || n.includes('pickle') || n.includes('green') || n.includes('lime') || n.includes('matcha') || n.includes('mint')) return 0x16a34a;
    if (n.includes('milk') || n.includes('oat') || n.includes('flour') || n.includes('rice') || n.includes('sugar') || n.includes('yogurt')) return 0xf1f5f9;
    if (n.includes('chocolate') || n.includes('peanut') || n.includes('almond') || n.includes('coffee') || n.includes('cocoa') || n.includes('brown')) return 0x92400e;
    if (n.includes('orange') || n.includes('carrot') || n.includes('mango') || n.includes('peach')) return 0xf97316;
    if (n.includes('water') || n.includes('blue') || n.includes('cleaner') || n.includes('glass')) return 0x0284c7;
    if (n.includes('grape') || n.includes('berry') || n.includes('plum')) return 0x9333ea;
    return PALETTE_SWATCHES[hashString(item && item.code ? item.code : item && item.name) % PALETTE_SWATCHES.length];
  }

  function createDamagedItemMesh(item) {
    const group = new THREE.Group();
    const shape = item.shapeKind || classifyItemShape(item);
    const accentHex = resolveAccentColor(item);
    const isWet = item.damageType === 'wet_saturated';
    const hideLabel = item.damageType === 'missing_label';

    const accentMat = getMat(accentHex, { roughness: isWet ? 0.22 : 0.45 });
    const paperMat = getMat(isWet ? 0xdbeafe : 0xf8fafc, { roughness: isWet ? 0.25 : 0.65 });
    const kraftMat = getMat(isWet ? 0x8c6239 : 0xc59f6b, { roughness: isWet ? 0.30 : 0.78 });
    const metalMat = getMat(0xcbd5e1, { roughness: 0.28, metalness: 0.75 });
    const darkCapMat = getMat(0x1e293b, { roughness: 0.4 });
    const goldCrustMat = getMat(0xb45309, { roughness: 0.72 });

    const isSpray = String(item.name || '').toLowerCase().match(/spray|aerosol|repellent|air fresh|sanitizer/);

    if (shape === 'can') {
      const h = isSpray ? 0.145 : 0.108;
      const r = isSpray ? 0.033 : 0.044;
      const metalBody = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), metalMat);
      metalBody.position.y = h / 2;
      group.add(metalBody);

      if (!hideLabel) {
        const labelH = h * 0.78;
        const labelCyl = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0015, r + 0.0015, labelH, 14), accentMat);
        labelCyl.position.y = h / 2;
        group.add(labelCyl);

        const stripeCyl = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0022, r + 0.0022, labelH * 0.34, 14), paperMat);
        stripeCyl.position.y = h * 0.56;
        group.add(stripeCyl);
      }

      if (isSpray) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r * 0.72, 0.028, 12), paperMat);
        cap.position.y = h + 0.014;
        group.add(cap);
      }
    } else if (shape === 'jar') {
      const h = 0.11;
      const r = 0.046;
      const bodyMat = getMat(accentHex, { roughness: 0.25, metalness: 0.05 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, h, 14), bodyMat);
      body.position.y = h / 2;
      group.add(body);

      if (!hideLabel) {
        const label = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0018, r + 0.0018, h * 0.52, 14), paperMat);
        label.position.y = h * 0.48;
        group.add(label);
      }

      const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.84, r * 0.84, 0.022, 14), metalMat);
      lid.position.y = h + 0.011;
      group.add(lid);
    } else if (shape === 'bottle') {
      const bodyH = 0.105;
      const r = 0.037;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, bodyH, 12), accentMat);
      body.position.y = bodyH / 2;
      group.add(body);

      if (!hideLabel) {
        const label = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0015, r + 0.0015, bodyH * 0.52, 12), paperMat);
        label.position.y = bodyH * 0.50;
        group.add(label);
      }

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.015, r * 0.92, 0.042, 12), accentMat);
      neck.position.y = bodyH + 0.021;
      group.add(neck);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.018, 10), darkCapMat);
      cap.position.y = bodyH + 0.050;
      group.add(cap);
    } else if (shape === 'jug') {
      const w = 0.115;
      const h = 0.145;
      const d = 0.088;
      const jugMat = getMat(accentHex === 0xf1f5f9 ? 0xe2e8f0 : accentHex, { roughness: 0.35 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), jugMat);
      body.position.y = h / 2;
      group.add(body);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.024, 10), jugMat);
      neck.position.set(-w * 0.18, h + 0.012, 0);
      group.add(neck);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.016, 10), getMat(0xdc2626, { roughness: 0.4 }));
      cap.position.set(-w * 0.18, h + 0.030, 0);
      group.add(cap);

      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, h * 0.52, 0.026), jugMat);
      handle.position.set(w * 0.5 + 0.012, h * 0.58, 0);
      group.add(handle);

      if (!hideLabel) {
        const label = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, h * 0.52, d + 0.003), paperMat);
        label.position.set(0, h * 0.46, 0);
        group.add(label);
      }
    } else if (shape === 'carton') {
      const w = 0.082;
      const h = 0.135;
      const d = 0.082;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), accentMat);
      body.position.y = h / 2;
      group.add(body);

      if (!hideLabel) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.002, h * 0.36, d + 0.002), paperMat);
        band.position.y = h * 0.55;
        group.add(band);
      }

      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 0.035, 4), accentMat);
      roof.position.y = h + 0.0175;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
    } else if (shape === 'eggs') {
      const pulpMat = getMat(0xe7e5e4, { roughness: 0.85 });
      const baseTray = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.038, 0.095), pulpMat);
      baseTray.position.y = 0.019;
      group.add(baseTray);

      if (!hideLabel) {
        const topLabel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.008, 0.068), accentMat);
        topLabel.position.y = 0.041;
        group.add(topLabel);
      }

      for (let ex = -0.052; ex <= 0.053; ex += 0.034) {
        [-0.02, 0.02].forEach((ez) => {
          const bump = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), pulpMat);
          bump.position.set(ex, 0.038, ez);
          bump.scale.y = 0.65;
          group.add(bump);
        });
      }
    } else if (shape === 'tub') {
      const h = 0.082;
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.048, h, 14), accentMat);
      tub.position.y = h / 2;
      group.add(tub);

      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.014, 14), hideLabel ? accentMat : paperMat);
      lid.position.y = h + 0.004;
      group.add(lid);
    } else if (shape === 'pizza') {
      const w = 0.175;
      const h = 0.032;
      const d = 0.165;
      const carton = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isWet ? kraftMat : accentMat);
      carton.position.y = h / 2;
      group.add(carton);

      if (!hideLabel) {
        const labelTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.004, d * 0.62), paperMat);
        labelTop.position.y = h + 0.002;
        group.add(labelTop);
      }
    } else if (shape === 'bread') {
      const w = 0.165;
      const h = 0.072;
      const d = 0.088;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), goldCrustMat);
      body.position.y = h / 2;
      group.add(body);

      if (!hideLabel) {
        const wrapBand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, h + 0.003, d + 0.003), accentMat);
        wrapBand.position.y = h / 2;
        group.add(wrapBand);
      }

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.46, d * 0.46, w * 0.96, 10), goldCrustMat);
      crown.rotation.z = Math.PI / 2;
      crown.position.y = h * 0.85;
      group.add(crown);
    } else if (shape === 'bag') {
      const w = 0.125;
      const h = 0.135;
      const d = 0.056;
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), accentMat);
      pouch.position.y = h / 2;
      group.add(pouch);

      const crimp = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.016, 0.014), hideLabel ? accentMat : paperMat);
      crimp.position.y = h + 0.005;
      group.add(crimp);

      if (!hideLabel) {
        const frontPatch = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.46, d + 0.003), paperMat);
        frontPatch.position.y = h * 0.52;
        group.add(frontPatch);
      }
    } else if (shape === 'produce') {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.115), getMat(0x84cc16, { roughness: 0.78 }));
      tray.position.y = 0.011;
      group.add(tray);

      const offsets = [
        [-0.036, -0.018],
        [0.034, -0.016],
        [0.0, 0.024]
      ];
      offsets.forEach(([ox, oz]) => {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 8), accentMat);
        fruit.position.set(ox, 0.044, oz);
        fruit.scale.set(1.05, 0.88, 1.0);
        group.add(fruit);
      });
    } else {
      const isSupply = String(item.deptNo || '') === '60';
      const w = isSupply ? 0.135 : 0.118;
      const h = isSupply ? 0.095 : 0.152;
      const d = isSupply ? 0.11 : 0.048;
      const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isSupply ? kraftMat : accentMat);
      boxMesh.position.y = h / 2;
      group.add(boxMesh);

      if (!hideLabel) {
        const frontBand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, h * 0.48, d + 0.003), paperMat);
        frontBand.position.y = h * 0.56;
        group.add(frontBand);

        const topStrip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, 0.005, d * 0.55), isSupply ? accentMat : kraftMat);
        topStrip.position.y = h + 0.002;
        group.add(topStrip);
      }
    }

    // Visual condition cue per condition key
    if (item.damageType === 'dented') {
      group.scale.set(1.06, 0.84, 1.04);
      group.rotation.z = (hashString(item.id) % 2 === 0 ? 1 : -1) * 0.12;
    } else if (item.damageType === 'leaking') {
      const puddle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.072, 0.003, 12),
        getMat(accentHex, { roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.75 })
      );
      puddle.position.y = 0.0015;
      group.add(puddle);
    } else if (item.damageType === 'wet_saturated') {
      const wetBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.076, 0.076, 0.003, 12),
        getMat(0x334155, { roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.55 })
      );
      wetBase.position.y = 0.0015;
      group.add(wetBase);
    }

    // Compute exact tight local bounds before moving into tote coordinates
    group.updateMatrixWorld(true);
    const localBox = new THREE.Box3().setFromObject(group);
    const localSize = new THREE.Vector3();
    const localCenter = new THREE.Vector3();
    localBox.getSize(localSize);
    localBox.getCenter(localCenter);
    item.localSize = localSize;
    item.localCenter = localCenter;

    return group;
  }

  function getCatalogProductsForToteFilter(filterFn, sourceList) {
    const cat = global.DSDCatalog;
    if (!cat || typeof cat.getProductDeptNo !== 'function') return [];
    const src = Array.isArray(sourceList) ? sourceList : (Array.isArray(cat.allProducts) ? cat.allProducts : []);
    return src.filter((p) => {
      if (!p || !p.code) return false;
      const d = p.deptNo || cat.getProductDeptNo(p.code);
      return Boolean(d && filterFn(String(d).padStart(2, '0')));
    });
  }

  function pickFallbackProductsForTote(toteIdx) {
    const fallbacks = [
      [
        { code: '0101', name: 'Bananas Bunch', deptNo: '01', type: 'ambient', price: 1.99, size: 'medium' },
        { code: '0104', name: 'Avocados 4ct', deptNo: '01', type: 'ambient', price: 4.49, size: 'small' },
        { code: '0102', name: 'Russet Potatoes 5lb', deptNo: '01', type: 'ambient', price: 3.99, size: 'large' }
      ],
      [
        { code: '9101', name: 'Bulk Pancake Mix 32oz', deptNo: '10', type: 'ambient', price: 4.99, size: 'large' },
        { code: '9103', name: 'Canned Pears 15oz', deptNo: '10', type: 'ambient', price: 1.89, size: 'small' },
        { code: '9104', name: 'Saltine Crackers 16oz', deptNo: '10', type: 'ambient', price: 2.99, size: 'medium' },
        { code: '1003', name: 'Penne Pasta 16oz', deptNo: '10', type: 'ambient', price: 2.29, size: 'small' }
      ],
      [
        { code: '9201', name: 'Bulk Butter Solids 5lb', deptNo: '20', type: 'refrigerated', price: 16.99, size: 'large' },
        { code: '9204', name: 'Liquid Egg Whites 32oz', deptNo: '20', type: 'refrigerated', price: 5.49, size: 'medium' },
        { code: '9221', name: 'Salad Kit Case', deptNo: '22', type: 'refrigerated', price: 14.99, size: 'large' }
      ],
      [
        { code: '9301', name: 'Frozen Onion Rings 32oz', deptNo: '30', type: 'frozen', price: 4.99, size: 'large' },
        { code: '9304', name: 'Frozen Cherry Pie', deptNo: '30', type: 'frozen', price: 6.49, size: 'medium' },
        { code: '9312', name: 'Frozen Chicken Nuggets 5lb', deptNo: '31', type: 'frozen', price: 15.99, size: 'large' }
      ],
      [
        { code: '4003', name: 'Glass Cleaner Spray', deptNo: '40', type: 'ambient', price: 4.49, size: 'medium' }
      ],
      [
        { code: '5004', name: 'Bug Spray Aerosol', deptNo: '50', type: 'ambient', price: 5.99, size: 'small' }
      ],
      [
        { code: '6001', name: 'Receipt Paper Rolls 10pk', deptNo: '60', type: 'ambient', price: 14.99, size: 'small' }
      ]
    ];
    return fallbacks[toteIdx] || fallbacks[1];
  }

  function clearToteItemMeshes(tote) {
    if (!tote || !tote.itemsGroup) return;
    while (tote.itemsGroup.children.length > 0) {
      const childRoot = tote.itemsGroup.children[0];
      if (childRoot && typeof childRoot.traverse === 'function') {
        childRoot.traverse((m) => {
          if (m && m.userData && m.userData._claimClonedMat && m.material && typeof m.material.dispose === 'function') {
            m.material.dispose();
          }
        });
      }
      tote.itemsGroup.remove(childRoot);
    }
    tote.items = [];
  }

  function resolveClaimItemNotScannable(prodOrItem) {
    if (!prodOrItem) return false;
    if (prodOrItem.notScannable !== undefined) return Boolean(prodOrItem.notScannable);
    const cat = global.DSDCatalog;
    const prod = (cat && typeof cat.getProduct === 'function' && prodOrItem.code)
      ? cat.getProduct(String(prodOrItem.code))
      : null;
    if (prod && prod.notScannable !== undefined) return Boolean(prod.notScannable);
    const deptNo = String(prodOrItem.deptNo || '').padStart(2, '0');
    return deptNo === '01';
  }

  function resolveClaimItemVendorInfo(prodOrItem) {
    if (!prodOrItem) return { vendorNo: '', vendorName: '' };
    if (prodOrItem.vendorNo) {
      return {
        vendorNo: String(prodOrItem.vendorNo),
        vendorName: String(prodOrItem.vendorName || '')
      };
    }
    const cat = global.DSDCatalog;
    const codeStr = String(prodOrItem.code || '');
    if (cat && Array.isArray(cat.allVendorEntries) && codeStr) {
      const ve = cat.allVendorEntries.find((v) => v && Array.isArray(v.products) && v.products.some((p) => String(p.code) === codeStr));
      if (ve) {
        return {
          vendorNo: String(ve.vendorNo || ''),
          vendorName: String(ve.name || '')
        };
      }
    }
    const deptNo = String(prodOrItem.deptNo || '').padStart(2, '0');
    if (deptNo === '60') {
      const v601 = (cat && typeof cat.getVendor === 'function') ? cat.getVendor('601') : null;
      return { vendorNo: '601', vendorName: String((v601 && v601.name) || 'Retail Solutions Inc.') };
    }
    const whVend = (cat && typeof cat.getVendor === 'function') ? cat.getVendor('011') : null;
    return { vendorNo: '011', vendorName: String((whVend && whVend.name) || 'Apex Logistics') };
  }

  function addGeneratedClaimItemToTote(tote, prod) {
    if (!tote || !prod || tote.items.length >= ITEM_SLOT_POSITIONS.length) return null;
    const prodType = String(prod.type || 'ambient').toLowerCase();
    const condObj = DAMAGE_CONDITIONS[randInt(0, DAMAGE_CONDITIONS.length - 1)];
    const cat = global.DSDCatalog;
    const deptNo = (cat && typeof cat.getProductDeptNo === 'function')
      ? (cat.getProductDeptNo(prod.code) || prod.deptNo || '10')
      : (prod.deptNo || '10');
    const vendInfo = resolveClaimItemVendorInfo({ code: prod.code, deptNo: deptNo, vendorNo: prod.vendorNo, vendorName: prod.vendorName });
    const catProd = (cat && typeof cat.getProduct === 'function') ? cat.getProduct(String(prod.code)) : null;
    const unitsPerCase = Math.max(1, Number(prod.unitsPerCase || (catProd && catProd.unitsPerCase) || 1));

    const itemRec = {
      id: 'claim_item_' + state.nextItemSeq++,
      toteIndex: tote.index,
      toteLabel: tote.label,
      code: String(prod.code),
      name: String(prod.name || 'Damaged Item'),
      deptNo: String(deptNo).padStart(2, '0'),
      vendorNo: vendInfo.vendorNo,
      vendorName: vendInfo.vendorName,
      unitsPerCase: unitsPerCase,
      price: Number(prod.price) || 0,
      size: prod.size || 'medium',
      type: prodType,
      notScannable: resolveClaimItemNotScannable({ code: prod.code, deptNo: deptNo, notScannable: prod.notScannable }),
      damageType: condObj.key,
      conditionLabel: condObj.label,
      claimKeywords: Array.isArray(prod.claimKeywords) ? prod.claimKeywords.slice() : [],
      claimed: false,
      scannerConfirmed: false,
      confirmedCondition: null,
      confirmedDisposition: null,
      isVendorCredit: false,
      shapeKind: classifyItemShape(prod),
      mesh: null,
      hitMeshes: [],
      localSize: new THREE.Vector3(0.12, 0.12, 0.12),
      localCenter: new THREE.Vector3(0, 0.06, 0)
    };

    const itemMesh = createDamagedItemMesh(itemRec);
    const [sx, sz] = ITEM_SLOT_POSITIONS[tote.items.length];
    itemMesh.position.set(
      sx + (Math.random() - 0.5) * 0.025,
      TOTE_FLOOR_Y,
      sz + (Math.random() - 0.5) * 0.025
    );
    itemMesh.rotation.y = (Math.random() - 0.5) * 0.65;

    const itemHits = [];
    itemMesh.traverse((child) => {
      if (child && child.isMesh) {
        child.userData = child.userData || {};
        child.userData.claimsItemRef = itemRec;
        itemHits.push(child);
      }
    });
    itemRec.hitMeshes = itemHits;
    itemRec.homePos = itemMesh.position.clone();
    itemRec.homeRot = itemMesh.rotation.clone();

    tote.itemsGroup.add(itemMesh);
    itemRec.mesh = itemMesh;
    tote.items.push(itemRec);
    return itemRec;
  }

  function generateDailyClaimsItems() {
    const cat = global.DSDCatalog;
    const isLoaded = Boolean(cat && typeof cat.isLoaded === 'function' && cat.isLoaded());
    const hiddenClaimsSrc = (cat && Array.isArray(cat.WAREHOUSE_CLAIM_PRODUCTS)) ? cat.WAREHOUSE_CLAIM_PRODUCTS : [];
    const allSrc = (cat && Array.isArray(cat.allProducts)) ? cat.allProducts : [];
    const vendorOnlySrc = allSrc.filter((p) => p && !p.warehouseOnly);

    state.totes.forEach((tote) => clearToteItemMeshes(tote));

    const grayTotes = state.totes.filter((t) => t && !t.isRed);
    const usedCodesByTote = grayTotes.map(() => new Set());
    let totalHiddenAdded = 0;

    // 1. Seed ~80% hidden warehouse claim items across the totes backed by warehouseClaimProducts (1X, 2X, 3X)
    grayTotes.forEach((tote, idx) => {
      const filterFn = TOTE_DEPT_FILTERS[tote.index] || (() => false);
      const hiddenPool = getCatalogProductsForToteFilter(filterFn, hiddenClaimsSrc)
        .slice()
        .sort(() => Math.random() - 0.5);
      if (hiddenPool.length === 0) return;

      const count = randInt(4, Math.min(5, hiddenPool.length));
      for (let i = 0; i < count; i++) {
        const prod = hiddenPool[i];
        if (!prod || usedCodesByTote[idx].has(prod.code)) continue;
        usedCodesByTote[idx].add(prod.code);
        if (addGeneratedClaimItemToTote(tote, prod)) {
          totalHiddenAdded += 1;
        }
      }
    });

    // If catalog hasn't finished loading yet, fall back cleanly on first tick
    if (!isLoaded || totalHiddenAdded === 0) {
      grayTotes.forEach((tote) => {
        const fallback = pickFallbackProductsForTote(tote.index);
        fallback.slice(0, tote.index === 6 ? 1 : 2).forEach((prod) => addGeneratedClaimItemToTote(tote, prod));
      });
      state.populated = isLoaded;
      return;
    }

    // 2. Seed ~20% vendor items across department totes (e.g. 3-4 vendor items for ~12-15 hidden items)
    const targetVendorCount = Math.max(2, Math.round(totalHiddenAdded * 0.25)); // 25% of hidden ~= 20% of total
    const vendorOrder = [0, 4, 5, 6, 1, 2, 3].sort(() => Math.random() - 0.5);
    let vendorAdded = 0;
    let pass = 0;
    while (vendorAdded < targetVendorCount && pass < 3) {
      for (let vi = 0; vi < vendorOrder.length && vendorAdded < targetVendorCount; vi++) {
        const tIdx = vendorOrder[vi];
        const tote = grayTotes[tIdx];
        if (!tote || tote.items.length >= ITEM_SLOT_POSITIONS.length) continue;
        const filterFn = TOTE_DEPT_FILTERS[tote.index] || (() => false);
        const vPool = getCatalogProductsForToteFilter(filterFn, vendorOnlySrc)
          .filter((p) => !usedCodesByTote[tIdx].has(p.code))
          .sort(() => Math.random() - 0.5);
        if (vPool.length === 0) continue;
        const picked = vPool[0];
        usedCodesByTote[tIdx].add(picked.code);
        if (addGeneratedClaimItemToTote(tote, picked)) {
          vendorAdded += 1;
        }
      }
      pass += 1;
    }

    state.populated = isLoaded;
  }

  function registerShelfTotesAndReceptacles() {
    state.totes = [];
    state.hitMeshes = [];
    state.receptacles = [];
    state.receptacleHitMeshes = [];

    if (!state.world || !Array.isArray(state.world.steelRacks)) return;
    const claimsRack = state.world.steelRacks.find((r) => r && r.id === 'claims_steel');
    if (!claimsRack) return;

    if (Array.isArray(claimsRack.shelfTotes)) {
      claimsRack.shelfTotes.forEach((raw, idx) => {
        if (!raw || !raw.mesh) return;
        const hitList = [];
        const highlightMats = [];
        const highlightMatSet = new Set();
        const edgeLines = [];
        const edgeMat = new THREE.LineBasicMaterial({
          color: raw.isRed ? 0xef4444 : 0x38bdf8,
          transparent: true,
          opacity: 0.9
        });

        raw.mesh.traverse((child) => {
          if (child && child.isMesh && !(child.userData && child.userData.isToteEdge)) {
            child.userData = child.userData || {};
            child.userData.claimsToteRef = null;
            hitList.push(child);

            if (child.material && !child.material.map) {
              if (child.material.emissive && !highlightMatSet.has(child.material)) {
                highlightMatSet.add(child.material);
                highlightMats.push(child.material);
              }
              if (child.geometry) {
                const edgeLine = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 25), edgeMat);
                edgeLine.visible = false;
                edgeLine.scale.set(1.004, 1.004, 1.004);
                edgeLine.userData.isToteEdge = true;
                child.add(edgeLine);
                edgeLines.push(edgeLine);
              }
            }
          }
        });

        const itemsGroup = new THREE.Group();
        raw.mesh.add(itemsGroup);

        const toteRec = {
          index: idx,
          rackId: raw.rackId || 'claims_steel',
          segment: raw.segment,
          level: raw.level,
          indexInBay: raw.indexInBay,
          label: raw.label || (raw.isRed ? 'CREDIT TOTE' : `Tote ${idx + 1}`),
          isRed: Boolean(raw.isRed),
          mesh: raw.mesh,
          hitMeshes: hitList,
          highlightMats: highlightMats,
          edgeMat: edgeMat,
          edgeLines: edgeLines,
          homePos: raw.mesh.position.clone(),
          homeRot: raw.mesh.rotation.clone(),
          homeScale: raw.mesh.scale.clone(),
          itemsGroup: itemsGroup,
          items: [],
          isOpen: false,
          openProgress: 0
        };

        hitList.forEach((m) => {
          m.userData.claimsToteRef = toteRec;
          state.hitMeshes.push(m);
        });

        if (toteRec.isRed) {
          const recObj = {
            id: 'vendor_credit',
            label: 'RED CREDIT TOTE',
            mesh: raw.mesh,
            hitMeshes: hitList,
            toteRec: toteRec
          };
          hitList.forEach((m) => {
            m.userData.claimsReceptacle = recObj;
            state.receptacleHitMeshes.push(m);
          });
          state.receptacles.push(recObj);
        }

        state.totes.push(toteRec);
      });
    }

    if (Array.isArray(claimsRack.floorPallets)) {
      claimsRack.floorPallets.forEach((fp) => {
        const mesh = fp && fp.cargoMesh;
        const meta = mesh && mesh.userData ? mesh.userData.claimsReceptacle : null;
        if (!mesh || !meta) return;
        const rHits = [];
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const bSize = new THREE.Vector3();
        const bCenter = new THREE.Vector3();
        box.getSize(bSize);
        box.getCenter(bCenter);

        const recObj = {
          id: meta.id,
          label: meta.label,
          mesh: mesh,
          hitMeshes: rHits,
          boxCenter: bCenter,
          boxSize: bSize,
          toteRec: null
        };
        mesh.traverse((child) => {
          if (child && child.isMesh) {
            child.userData = child.userData || {};
            child.userData.claimsReceptacle = recObj;
            rHits.push(child);
            state.receptacleHitMeshes.push(child);
          }
        });
        state.receptacles.push(recObj);
      });
    }
  }

  function applyToteHighlight(tote, active, colorHex, pulseVal) {
    if (!tote) return;
    const mats = tote.highlightMats || [];
    const lines = tote.edgeLines || [];
    if (active) {
      const glow = 0.22 + (pulseVal || 0.3) * 0.65;
      mats.forEach((mat) => {
        if (!mat || !mat.emissive) return;
        mat.emissive.setHex(colorHex);
        mat.emissiveIntensity = glow;
      });
      if (tote.edgeMat) {
        tote.edgeMat.color.setHex(colorHex);
        tote.edgeMat.opacity = Math.min(1.0, 0.45 + (pulseVal || 0.3));
      }
      lines.forEach((ln) => { ln.visible = true; });
    } else {
      mats.forEach((mat) => {
        if (!mat || !mat.emissive) return;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      });
      lines.forEach((ln) => { ln.visible = false; });
    }
  }

  function setHoveredTote(targetTote, pulseVal, overrideHex) {
    const targetHex = overrideHex || (targetTote
      ? (targetTote.isRed ? 0xef4444 : (targetTote.isOpen ? 0xf59e0b : 0x22c55e))
      : 0x000000);
    state.totes.forEach((t) => {
      if (!t) return;
      if (t === targetTote) {
        applyToteHighlight(t, true, targetHex, pulseVal);
      } else {
        applyToteHighlight(t, false, 0x000000, 0);
      }
    });
  }

  function applyTotePoseFromProgress(tote) {
    if (!tote || !tote.mesh) return;
    const t = Math.max(0, Math.min(1, tote.openProgress || 0));
    const ease = t < 0.5 ? (4 * t * t * t) : (1 - Math.pow(-2 * t + 2, 3) / 2);
    tote.mesh.position.set(
      tote.homePos.x,
      tote.homePos.y + TOTE_OPEN_OFFSET_Y * ease,
      tote.homePos.z + TOTE_OPEN_OFFSET_Z * ease
    );
    tote.mesh.rotation.set(
      tote.homeRot.x - TILT_TARGET_RAD * ease,
      tote.homeRot.y,
      tote.homeRot.z
    );
    tote.mesh.scale.copy(tote.homeScale);
  }

  function setToteOpen(tote, open) {
    if (!tote) return { ok: false, reason: 'missing_tote' };
    if (tote.isRed) return { ok: false, reason: 'credit_tote_fixed' };
    const nextOpen = Boolean(open);
    if (nextOpen) {
      // Mutually exclusive: opening a gray tote automatically tips any previously open gray tote back up
      state.totes.forEach((other) => {
        if (other && other !== tote && !other.isRed && other.isOpen) {
          other.isOpen = false;
        }
      });
    }
    tote.isOpen = nextOpen;
    return { ok: true, tote: tote, isOpen: tote.isOpen };
  }

  function toggleToteOpen(tote) {
    if (!tote) return { ok: false, reason: 'missing_tote' };
    if (tote.isRed) return { ok: false, reason: 'credit_tote_fixed' };
    return setToteOpen(tote, !tote.isOpen);
  }

  function closeAllTotes(instant) {
    state.totes.forEach((t) => {
      if (!t || t.isRed) return;
      t.isOpen = false;
      if (instant) {
        t.openProgress = 0;
        applyTotePoseFromProgress(t);
      }
    });
  }

  function findItemById(itemId) {
    if (!itemId) return null;
    if (state.heldItem && state.heldItem.id === itemId) return state.heldItem;
    for (let i = 0; i < state.totes.length; i++) {
      const t = state.totes[i];
      if (!t || !Array.isArray(t.items)) continue;
      const hit = t.items.find((it) => it && it.id === itemId);
      if (hit) return hit;
    }
    return null;
  }

  function claimCodesMatch(a, b) {
    const cleanA = String(a || '').replace(/\D+/g, '');
    const cleanB = String(b || '').replace(/\D+/g, '');
    if (!cleanA || !cleanB) return false;
    return cleanA === cleanB || cleanA.replace(/^0+/, '') === cleanB.replace(/^0+/, '');
  }

  function findClaimItemForCodeInput(rawCode, preferredItemId) {
    const codeStr = String(rawCode || '').trim();
    if (!codeStr) return null;
    const openCandidates = [];
    for (let i = 0; i < state.totes.length; i++) {
      const t = state.totes[i];
      if (!t || t.isRed || !t.isOpen || !Array.isArray(t.items)) continue;
      t.items.forEach((it) => {
        if (it && !it.claimed && !it.scannerConfirmed && claimCodesMatch(it.code, codeStr)) {
          openCandidates.push(it);
        }
      });
    }
    if (preferredItemId) {
      const pref = openCandidates.find((it) => it.id === preferredItemId);
      if (pref) return pref;
    }
    return openCandidates[0] || null;
  }

  function syncProcessedClaimVisual(item) {
    if (!item || !Array.isArray(item.hitMeshes)) return;
    const highlightActive = Boolean(item.scannerConfirmed && !item.claimed);
    item.hitMeshes.forEach((m) => {
      if (!m || !m.material) return;
      if (highlightActive) {
        if (!m.userData._claimOrigMat) {
          m.userData._claimOrigMat = m.material;
          m.material = m.material.clone();
          m.userData._claimClonedMat = true;
        }
        if (m.material.color) m.material.color.setHex(0xf9a8d4);
        if (m.material.emissive) {
          m.material.emissive.setHex(0xdb2777);
          m.material.emissiveIntensity = 0.65;
        }
      } else if (m.userData._claimClonedMat && m.userData._claimOrigMat) {
        const cloned = m.material;
        m.material = m.userData._claimOrigMat;
        delete m.userData._claimOrigMat;
        delete m.userData._claimClonedMat;
        if (cloned && typeof cloned.dispose === 'function') cloned.dispose();
      }
    });
  }

  function confirmItemDisposition(itemOrId, conditionKey) {
    const item = typeof itemOrId === 'string' ? findItemById(itemOrId) : itemOrId;
    if (!item || item.claimed) return null;
    const chosenCond = getConditionInfo(conditionKey || item.damageType);
    const disp = computeDispositionForItem(item, chosenCond.key);
    item.scannerConfirmed = true;
    item.confirmedCondition = chosenCond.key;
    item.confirmedConditionLabel = chosenCond.label;
    item.confirmedDisposition = disp;
    item.isVendorCredit = (disp === 'vendor_credit');
    syncProcessedClaimVisual(item);
    return {
      item: item,
      conditionKey: chosenCond.key,
      conditionLabel: chosenCond.label,
      disposition: disp,
      dispositionLabel: getReceptacleLabel(disp),
      isVendorCredit: item.isVendorCredit
    };
  }

  function clearHeldItemView() {
    if (state.heldViewMesh && state.heldViewMesh.parent) {
      state.heldViewMesh.parent.remove(state.heldViewMesh);
    }
    state.heldViewMesh = null;
    state.heldItem = null;
    state.heldItemTote = null;
  }

  function pickupItem(itemRec) {
    if (!itemRec || itemRec.claimed) return { ok: false, reason: 'invalid_item' };
    if (state.heldItem) return { ok: false, reason: 'already_holding_item' };
    if (!itemRec.scannerConfirmed) return { ok: false, reason: 'not_scanned' };

    const tote = state.totes[itemRec.toteIndex] || null;
    if (itemRec.mesh && itemRec.mesh.parent) {
      itemRec.mesh.parent.remove(itemRec.mesh);
    }
    state.heldItem = itemRec;
    state.heldItemTote = tote;

    if (state.camera && itemRec.mesh) {
      itemRec.mesh.position.set(0.24, -0.27, -0.52);
      itemRec.mesh.rotation.set(0.18, -0.35, 0.04);
      itemRec.mesh.scale.set(1.15, 1.15, 1.15);
      itemRec.mesh.visible = true;
      state.camera.add(itemRec.mesh);
      state.heldViewMesh = itemRec.mesh;
    }

    return { ok: true, item: itemRec };
  }

  function dropHeldItemIntoReceptacle(receptacleId) {
    const item = state.heldItem;
    if (!item) return { ok: false, reason: 'not_holding_item' };

    const trueDisp = computeDispositionForItem(item, item.damageType);
    const chosenId = String(receptacleId || '').toLowerCase();
    const isCorrect = (chosenId === trueDisp);

    clearHeldItemView();

    item.claimed = true;
    item.placedReceptacle = chosenId;
    syncProcessedClaimVisual(item);

    let penaltyPoints = 0;
    if (!isCorrect) {
      const isHazwaste = (trueDisp === 'hazwaste');
      penaltyPoints = isHazwaste ? 150 : 50;
      if (global.ShiftStats && typeof global.ShiftStats.increment === 'function') {
        global.ShiftStats.increment('errorsMade', 1);
        global.ShiftStats.increment(isHazwaste ? 'wrongHazwasteDispositions' : 'wrongClaimDispositions', 1);
      }
    }

    const remainingCount = getRemainingClaimsCount();
    if (remainingCount === 0 && global.ShiftStats && typeof global.ShiftStats.setFlag === 'function') {
      global.ShiftStats.setFlag('claimsAllDone', true);
    }

    // Random display credit amount when returned to Vendor Credit Tote (not persisted across shifts)
    const displayCredit = isCorrect && chosenId === 'vendor_credit'
      ? Number(((Number(item.price) || 2.5) * (0.85 + Math.random() * 0.35)).toFixed(2))
      : 0;

    return {
      ok: true,
      item: item,
      placedIn: chosenId,
      placedLabel: getReceptacleLabel(chosenId),
      correctDisposition: trueDisp,
      correctLabel: getReceptacleLabel(trueDisp),
      isCorrect: isCorrect,
      penaltyPoints: penaltyPoints,
      displayCredit: displayCredit,
      remainingCount: remainingCount,
      allDone: remainingCount === 0
    };
  }

  // ==========================================
  // ==========================================
  // PRODUCT RECALL SYSTEM (0-2 PER SHIFT: 50% NONE / 25% 1 / 25% 2; 6:00 AM - 11:30 AM ONLY)
  // ==========================================
  const RECALL_START_MINUTE = 360; // 6:00 AM
  const RECALL_CUTOFF_MINUTE = 690; // 11:30 AM
  const RECALL_TOP_BOUNDS = { minX: -0.195, maxX: 0.195, minZ: -0.425, maxZ: 0.425 };
  const RECALL_TOTE_INSIDE_SLOTS = [
    [-0.085, -0.14], [0.085, -0.14],
    [-0.085, -0.05], [0.085, -0.05],
    [-0.085, 0.05],  [0.085, 0.05],
    [-0.085, 0.14],  [0.085, 0.14]
  ];

  function rollDailyRecallCount() {
    const roll = Math.random();
    if (roll < 0.50) return 0; // 50% chance no recall
    if (roll < 0.75) return 1; // 25% chance 1 recall
    return 2;                  // 25% chance 2 recalls
  }

  function buildDailyRecallSchedule() {
    const count = rollDailyRecallCount();
    if (count <= 0) return [];
    const pool = getRecallProductsPool().slice().sort(() => Math.random() - 0.5);
    const times = count === 1
      ? [randInt(RECALL_START_MINUTE + 5, RECALL_CUTOFF_MINUTE - 5)]
      : [
        randInt(RECALL_START_MINUTE + 5, 505), // 6:05 AM - 8:25 AM
        randInt(525, RECALL_CUTOFF_MINUTE - 5) // 8:45 AM - 11:25 AM
      ];
    const schedule = [];
    for (let i = 0; i < count; i++) {
      schedule.push({
        index: i + 1,
        triggerMinute: times[i],
        triggered: false,
        product: pool[i % pool.length] || pool[0]
      });
    }
    return schedule;
  }

  function createInitialRecallState() {
    const schedule = buildDailyRecallSchedule();
    return {
      triggered: false,
      active: false,
      sorted: false,
      holdingTote: false,
      toteOnBottomShelf: true,
      toteDespawned: false,
      movingItem: null,
      completed: false,
      triggerMinute: schedule.length > 0 ? schedule[0].triggerMinute : null,
      scheduledRecalls: schedule,
      queuedRecalls: [],
      completedRecalls: [],
      usedProductKeys: [],
      productKey: null,
      productName: '',
      correctBin: 'trash',
      totalCount: 0,
      collectedCount: 0,
      submittedCount: 0,
      countMatched: null,
      items: [],
      cartGroup: null,
      topDeckHitMesh: null,
      bottomDockHitMesh: null,
      toteGroup: null,
      toteItemsGroup: null,
      toteHitMeshes: [],
      heldItemViewMesh: null,
      arrangeGhostMesh: null
    };
  }

  function getRecallProductsPool() {
    const cat = global.DSDCatalog;
    if (cat && Array.isArray(cat.RECALL_PRODUCTS) && cat.RECALL_PRODUCTS.length > 0) {
      return cat.RECALL_PRODUCTS;
    }
    return [
      { key: 'recall_product_1', name: 'Baby Formula Can', bin: 'trash' },
      { key: 'recall_product_2', name: 'Peanut Butter Jar', bin: 'trash' },
      { key: 'recall_product_3', name: 'Bagged Salad Mix', bin: 'organics' },
      { key: 'recall_product_4', name: 'Frozen Chicken Pack', bin: 'organics' },
      { key: 'recall_product_5', name: 'All-Purpose Cleaner Spray', bin: 'hazwaste' },
      { key: 'recall_product_6', name: 'Breakfast Cereal Box', bin: 'trash' },
      { key: 'recall_product_7', name: 'Bleach Jug', bin: 'hazwaste' },
      { key: 'recall_product_8', name: 'Orange Juice Bottle', bin: 'organics' },
      { key: 'recall_product_9', name: 'Deli Meat Package', bin: 'organics' },
      { key: 'recall_product_10', name: 'Canned Soup', bin: 'trash' }
    ];
  }

  function setRecallCartVisible(visible) {
    const cartRec = state.world && state.world.recallCart ? state.world.recallCart : null;
    if (!cartRec) return;
    if (typeof cartRec.setVisible === 'function') {
      cartRec.setVisible(Boolean(visible));
    } else if (cartRec.group) {
      cartRec.group.visible = Boolean(visible);
    }
  }

  function clearHeldRecallArrangeView() {
    if (!state.recall) return;
    if (state.recall.heldItemViewMesh && state.recall.heldItemViewMesh.parent) {
      state.recall.heldItemViewMesh.parent.remove(state.recall.heldItemViewMesh);
    }
    state.recall.heldItemViewMesh = null;
    if (state.recall.arrangeGhostMesh) {
      state.recall.arrangeGhostMesh.visible = false;
    }
  }

  function clearRecallToteVisuals() {
    if (!state.recall) return;
    if (state.recall.toteGroup && state.recall.toteGroup.parent) {
      state.recall.toteGroup.parent.remove(state.recall.toteGroup);
    }
    state.recall.toteGroup = null;
    state.recall.toteItemsGroup = null;
    state.recall.toteHitMeshes = [];
  }

  function clearRecallCartMeshes() {
    if (!state.recall) return;
    clearHeldRecallArrangeView();
    if (state.recall.cartGroup) {
      while (state.recall.cartGroup.children.length > 0) {
        const ch = state.recall.cartGroup.children[0];
        state.recall.cartGroup.remove(ch);
      }
    }
    state.recall.items = [];
    state.recall.arrangeGhostMesh = null;
  }

  function setupRecallCartAnchors() {
    if (!state.recall) state.recall = createInitialRecallState();
    const cartRec = state.world && state.world.recallCart ? state.world.recallCart : null;
    if (!cartRec || !cartRec.group) return;

    const tierTopY = (Array.isArray(cartRec.tierTopY) && cartRec.tierTopY.length >= 2)
      ? cartRec.tierTopY
      : [0.156, 0.876];
    const bottomY = tierTopY[0];
    const topY = tierTopY[tierTopY.length - 1];

    if (!state.recall.cartGroup) {
      state.recall.cartGroup = new THREE.Group();
      cartRec.group.add(state.recall.cartGroup);
    }

    if (!state.recall.topDeckHitMesh) {
      const topPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.54, 1.04),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
      );
      topPlane.rotation.x = -Math.PI / 2;
      topPlane.position.set(0, topY + 0.004, 0);
      topPlane.userData = { recallTopDeck: true };
      cartRec.group.add(topPlane);
      state.recall.topDeckHitMesh = topPlane;
    }

    if (!state.recall.bottomDockHitMesh) {
      const botBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.30, 0.98),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      botBox.position.set(0, bottomY + 0.15, 0);
      botBox.userData = { recallBottomDock: true };
      cartRec.group.add(botBox);
      state.recall.bottomDockHitMesh = botBox;
    }
  }

  function buildSmallRecallTote() {
    const toteGroup = new THREE.Group();
    const tw = 0.38;
    const th = 0.185;
    const td = 0.50;
    const wallT = 0.018;

    const matGrayBody = getMat(0x64748b, { roughness: 0.72, metalness: 0.08 });
    const matGrayRim = getMat(0x94a3b8, { roughness: 0.58, metalness: 0.12 });
    const matInside = getMat(0x334155, { roughness: 0.85 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(tw, wallT, td), matGrayBody);
    base.position.y = wallT / 2;
    toteGroup.add(base);

    const floorPad = new THREE.Mesh(new THREE.BoxGeometry(tw - wallT * 2, 0.006, td - wallT * 2), matInside);
    floorPad.position.y = wallT + 0.002;
    toteGroup.add(floorPad);

    [-td / 2 + wallT / 2, td / 2 - wallT / 2].forEach((wz) => {
      const endWall = new THREE.Mesh(new THREE.BoxGeometry(tw, th, wallT), matGrayBody);
      endWall.position.set(0, th / 2, wz);
      toteGroup.add(endWall);
    });
    [-tw / 2 + wallT / 2, tw / 2 - wallT / 2].forEach((wx) => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, th, td - wallT * 2), matGrayBody);
      sideWall.position.set(wx, th / 2, 0);
      toteGroup.add(sideWall);
    });

    // Flared molded rim rails
    const rimH = 0.020;
    const rimPad = 0.014;
    [-td / 2 + wallT / 2, td / 2 - wallT / 2].forEach((rz) => {
      const rBar = new THREE.Mesh(new THREE.BoxGeometry(tw + rimPad, rimH, wallT + 0.012), matGrayRim);
      rBar.position.set(0, th + rimH / 2 - 0.004, rz);
      toteGroup.add(rBar);
    });
    [-tw / 2 + wallT / 2, tw / 2 - wallT / 2].forEach((rx) => {
      const rSide = new THREE.Mesh(new THREE.BoxGeometry(wallT + 0.012, rimH, td - wallT), matGrayRim);
      rSide.position.set(rx, th + rimH / 2 - 0.004, 0);
      toteGroup.add(rSide);
    });

    const itemsGroup = new THREE.Group();
    itemsGroup.position.set(0, wallT + 0.006, 0);
    toteGroup.add(itemsGroup);

    const hitMeshes = [];
    toteGroup.traverse((child) => {
      if (child && child.isMesh) {
        child.userData = child.userData || {};
        child.userData.recallToteRef = true;
        hitMeshes.push(child);
      }
    });

    return {
      group: toteGroup,
      itemsGroup: itemsGroup,
      hitMeshes: hitMeshes
    };
  }

  function resetRecallForShift() {
    clearHeldRecallArrangeView();
    clearRecallToteVisuals();
    const existingCartGroup = state.recall ? state.recall.cartGroup : null;
    const existingTopDeck = state.recall ? state.recall.topDeckHitMesh : null;
    const existingBottomDock = state.recall ? state.recall.bottomDockHitMesh : null;

    state.recall = createInitialRecallState();
    state.recall.cartGroup = existingCartGroup;
    state.recall.topDeckHitMesh = existingTopDeck;
    state.recall.bottomDockHitMesh = existingBottomDock;

    setupRecallCartAnchors();
    clearRecallCartMeshes();
    setRecallCartVisible(false);
  }

  function triggerDailyRecall(opts) {
    if (!state.recall) resetRecallForShift();
    const rec = state.recall;
    const o = opts || {};
    if (rec.active && !o.forceSpawnNext) {
      const pool = getRecallProductsPool();
      const queuedProd = o.product || pool[randInt(0, pool.length - 1)] || pool[0];
      rec.queuedRecalls.push({ triggerMinute: rec.triggerMinute, triggered: true, product: queuedProd });
      return getRecallState();
    }

    setupRecallCartAnchors();
    clearRecallCartMeshes();
    clearRecallToteVisuals();

    const pool = getRecallProductsPool();
    const available = pool.filter((p) => p && !rec.usedProductKeys.includes(p.key));
    const pickPool = available.length > 0 ? available : pool;
    const picked = o.product || pickPool[randInt(0, pickPool.length - 1)] || pool[0];
    const totalCount = randInt(8, 16);

    rec.triggered = true;
    rec.active = true;
    rec.sorted = false;
    rec.holdingTote = false;
    rec.toteOnBottomShelf = true;
    rec.toteDespawned = false;
    rec.movingItem = null;
    rec.completed = false;
    rec.productKey = picked.key || 'recall_product_1';
    if (!rec.usedProductKeys.includes(rec.productKey)) {
      rec.usedProductKeys.push(rec.productKey);
    }
    rec.productName = picked.name || 'Recalled Product';
    rec.correctBin = String(picked.bin || 'trash').toLowerCase();
    rec.totalCount = totalCount;
    rec.collectedCount = 0;
    rec.submittedCount = 0;
    rec.countMatched = null;
    rec.items = [];

    const cartRec = state.world && state.world.recallCart ? state.world.recallCart : null;
    const tierTopY = (cartRec && Array.isArray(cartRec.tierTopY) && cartRec.tierTopY.length >= 2)
      ? cartRec.tierTopY
      : [0.156, 0.876];
    const bottomY = tierTopY[0];
    const topY = tierTopY[tierTopY.length - 1];

    setRecallCartVisible(true);

    // 1. Spawn small gray collection tote on the bottom shelf
    const toteBuilt = buildSmallRecallTote();
    rec.toteGroup = toteBuilt.group;
    rec.toteItemsGroup = toteBuilt.itemsGroup;
    rec.toteHitMeshes = toteBuilt.hitMeshes;
    rec.toteGroup.position.set(0, bottomY, 0);
    if (cartRec && cartRec.group) {
      cartRec.group.add(rec.toteGroup);
    }

    // 2. Scatter all recalled items ONLY on the top shelf in a disorganized random pattern
    if (rec.cartGroup) {
      const placedCoords = [];
      for (let i = 0; i < totalCount; i++) {
        let bestX = (Math.random() - 0.5) * (RECALL_TOP_BOUNDS.maxX - RECALL_TOP_BOUNDS.minX);
        let bestZ = (Math.random() - 0.5) * (RECALL_TOP_BOUNDS.maxZ - RECALL_TOP_BOUNDS.minZ);
        let bestMinSep = -1;

        for (let attempt = 0; attempt < 24; attempt++) {
          const cx = RECALL_TOP_BOUNDS.minX + Math.random() * (RECALL_TOP_BOUNDS.maxX - RECALL_TOP_BOUNDS.minX);
          const cz = RECALL_TOP_BOUNDS.minZ + Math.random() * (RECALL_TOP_BOUNDS.maxZ - RECALL_TOP_BOUNDS.minZ);
          let minSep = Infinity;
          for (let j = 0; j < placedCoords.length; j++) {
            const d = Math.hypot(cx - placedCoords[j].x, cz - placedCoords[j].z);
            if (d < minSep) minSep = d;
          }
          if (placedCoords.length === 0 || minSep >= 0.115) {
            bestX = cx;
            bestZ = cz;
            bestMinSep = minSep;
            break;
          }
          if (minSep > bestMinSep) {
            bestX = cx;
            bestZ = cz;
            bestMinSep = minSep;
          }
        }
        placedCoords.push({ x: bestX, z: bestZ });

        const itemRec = {
          id: 'recall_unit_' + i,
          index: i,
          code: rec.productKey,
          name: rec.productName,
          damageType: 'recall',
          collected: false,
          mesh: null,
          hitMeshes: [],
          localSize: new THREE.Vector3(0.11, 0.12, 0.11),
          localCenter: new THREE.Vector3(0, 0.06, 0)
        };
        const mesh = createDamagedItemMesh(itemRec);
        mesh.position.set(bestX, topY, bestZ);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        if (Math.random() < 0.25) {
          mesh.rotation.z = (Math.random() - 0.5) * 0.16;
        }
        const itemHits = [];
        mesh.traverse((child) => {
          if (child && child.isMesh) {
            child.userData = child.userData || {};
            child.userData.recallItemRef = itemRec;
            itemHits.push(child);
          }
        });
        itemRec.mesh = mesh;
        itemRec.hitMeshes = itemHits;
        rec.cartGroup.add(mesh);
        rec.items.push(itemRec);
      }

      // Preview box shown when rearranging an individual item across the top shelf
      const ghostMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.85
      });
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
      ghost.visible = false;
      rec.cartGroup.add(ghost);
      rec.arrangeGhostMesh = ghost;
    }

    if (typeof state.hooks.onRecallTriggered === 'function') {
      state.hooks.onRecallTriggered(getRecallState());
    }
    return getRecallState();
  }

  function getRecallState() {
    const rec = state.recall || createInitialRecallState();
    const hasTopItems = Array.isArray(rec.items) && rec.items.some((it) => it && !it.collected && it !== rec.movingItem);
    return {
      triggered: Boolean(rec.triggered),
      active: Boolean(rec.active),
      sorted: Boolean(rec.sorted),
      holdingTote: Boolean(rec.holdingTote),
      toteOnBottomShelf: Boolean(rec.toteOnBottomShelf),
      toteDespawned: Boolean(rec.toteDespawned),
      isArrangingItem: Boolean(rec.movingItem),
      movingItemName: rec.movingItem ? rec.movingItem.name : '',
      hasTopItemsRemaining: hasTopItems,
      allItemsCollected: Boolean(rec.totalCount > 0 && rec.collectedCount >= rec.totalCount),
      completed: Boolean(rec.completed),
      triggerMinute: rec.triggerMinute,
      productKey: rec.productKey,
      productName: rec.productName,
      correctBin: rec.correctBin,
      correctBinLabel: getReceptacleLabel(rec.correctBin),
      submittedCount: rec.submittedCount,
      countMatched: rec.countMatched,
      queuedCount: Array.isArray(rec.queuedRecalls) ? rec.queuedRecalls.length : 0,
      completedRecalls: Array.isArray(rec.completedRecalls) ? rec.completedRecalls.slice() : [],
      scheduledRecalls: Array.isArray(rec.scheduledRecalls) ? rec.scheduledRecalls.map((s) => ({ index: s.index, triggerMinute: s.triggerMinute, triggered: s.triggered })) : []
    };
  }

  const _recallTopItemMeshesBuf = [];

  function getRecallTopItemMeshes() {
    _recallTopItemMeshesBuf.length = 0;
    const rec = state.recall;
    if (!rec || !rec.active || rec.sorted || rec.movingItem) return _recallTopItemMeshesBuf;
    const items = rec.items || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || item.collected || item === rec.movingItem || !Array.isArray(item.hitMeshes)) continue;
      for (let j = 0; j < item.hitMeshes.length; j++) {
        _recallTopItemMeshesBuf.push(item.hitMeshes[j]);
      }
    }
    return _recallTopItemMeshesBuf;
  }

  function getRecallToteHitMeshes() {
    const rec = state.recall;
    if (!rec || !rec.active || rec.sorted || rec.holdingTote || !rec.toteOnBottomShelf || rec.toteDespawned) {
      return [];
    }
    return Array.isArray(rec.toteHitMeshes) ? rec.toteHitMeshes : [];
  }

  function getRecallBottomDockHitMeshes() {
    const rec = state.recall;
    if (!rec || !rec.active || rec.sorted || !rec.holdingTote || rec.toteDespawned || !rec.bottomDockHitMesh) {
      return [];
    }
    return [rec.bottomDockHitMesh];
  }

  function updateRecallArrangePreview(raycaster) {
    const rec = state.recall;
    if (!rec || !rec.active || !rec.movingItem || !rec.topDeckHitMesh || !raycaster) {
      if (rec && rec.arrangeGhostMesh) rec.arrangeGhostMesh.visible = false;
      return null;
    }
    const cartRec = state.world && state.world.recallCart ? state.world.recallCart : null;
    const hits = raycaster.intersectObject(rec.topDeckHitMesh, false);
    if (!hits || hits.length === 0 || !cartRec || !cartRec.group) {
      if (rec.arrangeGhostMesh) rec.arrangeGhostMesh.visible = false;
      return null;
    }
    const localPt = cartRec.group.worldToLocal(hits[0].point.clone());
    const cx = Math.max(RECALL_TOP_BOUNDS.minX, Math.min(RECALL_TOP_BOUNDS.maxX, localPt.x));
    const cz = Math.max(RECALL_TOP_BOUNDS.minZ, Math.min(RECALL_TOP_BOUNDS.maxZ, localPt.z));
    const tierTopY = (Array.isArray(cartRec.tierTopY) && cartRec.tierTopY.length >= 2) ? cartRec.tierTopY : [0.156, 0.876];
    const topY = tierTopY[tierTopY.length - 1];

    if (rec.arrangeGhostMesh) {
      const ls = rec.movingItem.localSize || new THREE.Vector3(0.11, 0.12, 0.11);
      const lc = rec.movingItem.localCenter || new THREE.Vector3(0, 0.06, 0);
      rec.arrangeGhostMesh.scale.set(ls.x + 0.015, ls.y + 0.015, ls.z + 0.015);
      rec.arrangeGhostMesh.position.set(cx + lc.x, topY + lc.y, cz + lc.z);
      rec.arrangeGhostMesh.visible = true;
    }
    return { valid: true, x: cx, y: topY, z: cz };
  }

  function pickupRecallItemToArrange(recItem) {
    const rec = state.recall;
    if (!rec || !rec.active || rec.sorted || rec.holdingTote || rec.movingItem || !recItem || recItem.collected) {
      return { ok: false, reason: 'cannot_arrange_item' };
    }
    if (state.heldItem) return { ok: false, reason: 'already_holding_item' };

    if (recItem.mesh && recItem.mesh.parent) {
      recItem.mesh.parent.remove(recItem.mesh);
    }
    rec.movingItem = recItem;

    if (state.camera && recItem.mesh) {
      recItem.mesh.position.set(0.22, -0.25, -0.48);
      recItem.mesh.rotation.set(0.15, -0.32, 0.02);
      state.camera.add(recItem.mesh);
      rec.heldItemViewMesh = recItem.mesh;
    }

    return { ok: true, item: recItem };
  }

  function placeArrangedRecallItem(preview) {
    const rec = state.recall;
    if (!rec || !rec.movingItem || !preview) return { ok: false, reason: 'no_moving_item' };
    const item = rec.movingItem;

    clearHeldRecallArrangeView();
    if (rec.cartGroup && item.mesh) {
      item.mesh.position.set(preview.x, preview.y, preview.z);
      item.mesh.rotation.set(0, 0, 0);
      rec.cartGroup.add(item.mesh);
    }
    rec.movingItem = null;
    return { ok: true, item: item };
  }

  function pickupRecallTote() {
    const rec = state.recall;
    if (!rec || !rec.active || rec.sorted || rec.holdingTote || rec.toteDespawned || !rec.toteGroup) {
      return { ok: false, reason: 'no_recall_tote' };
    }
    if (rec.movingItem || state.heldItem) {
      return { ok: false, reason: 'hands_occupied' };
    }

    if (rec.toteGroup.parent) {
      rec.toteGroup.parent.remove(rec.toteGroup);
    }
    rec.holdingTote = true;
    rec.toteOnBottomShelf = false;

    if (state.camera) {
      rec.toteGroup.position.set(0.26, -0.31, -0.56);
      rec.toteGroup.rotation.set(0.22, -0.36, 0.05);
      state.camera.add(rec.toteGroup);
    }

    return {
      ok: true,
      productName: rec.productName,
      correctBinLabel: getReceptacleLabel(rec.correctBin)
    };
  }

  function dockRecallToteOnBottomShelf() {
    const rec = state.recall;
    if (!rec || !rec.active || !rec.holdingTote || rec.toteDespawned || !rec.toteGroup) {
      return { ok: false, reason: 'not_holding_tote' };
    }
    const cartRec = state.world && state.world.recallCart ? state.world.recallCart : null;
    const tierTopY = (cartRec && Array.isArray(cartRec.tierTopY) && cartRec.tierTopY.length >= 2) ? cartRec.tierTopY : [0.156, 0.876];

    if (rec.toteGroup.parent) {
      rec.toteGroup.parent.remove(rec.toteGroup);
    }
    rec.toteGroup.position.set(0, tierTopY[0], 0);
    rec.toteGroup.rotation.set(0, 0, 0);
    if (cartRec && cartRec.group) {
      cartRec.group.add(rec.toteGroup);
    }
    rec.holdingTote = false;
    rec.toteOnBottomShelf = true;

    return { ok: true, productName: rec.productName };
  }

  function collectRecallItemIntoTote(recItem) {
    const rec = state.recall;
    if (!rec || !rec.active || rec.sorted || !rec.holdingTote || !recItem || recItem.collected) {
      return { ok: false, reason: 'cannot_collect' };
    }

    recItem.collected = true;
    if (recItem.mesh && recItem.mesh.parent) {
      recItem.mesh.parent.remove(recItem.mesh);
    }

    const idxInTote = rec.collectedCount;
    rec.collectedCount += 1;

    if (rec.toteItemsGroup) {
      const slotIdx = idxInTote % RECALL_TOTE_INSIDE_SLOTS.length;
      const layer = Math.floor(idxInTote / RECALL_TOTE_INSIDE_SLOTS.length);
      const [tx, tz] = RECALL_TOTE_INSIDE_SLOTS[slotIdx];
      const mini = createDamagedItemMesh({
        id: 'recall_tote_unit_' + idxInTote,
        code: rec.productKey,
        name: rec.productName,
        damageType: 'recall'
      });
      mini.scale.set(0.55, 0.55, 0.55);
      mini.position.set(tx, layer * 0.068, tz);
      mini.rotation.y = (idxInTote % 3 - 1) * 0.2;
      rec.toteItemsGroup.add(mini);
    }

    return {
      ok: true,
      productName: rec.productName,
      allCollected: rec.collectedCount >= rec.totalCount
    };
  }

  function dropRecallToteIntoReceptacle(receptacleId) {
    const rec = state.recall;
    if (!rec || !rec.active || !rec.holdingTote) {
      return { ok: false, reason: 'not_holding_recall_tote' };
    }
    if (rec.collectedCount < rec.totalCount) {
      return {
        ok: false,
        reason: 'items_remaining_on_cart',
        productName: rec.productName
      };
    }

    const chosenId = String(receptacleId || '').toLowerCase();
    const isCorrect = (chosenId === rec.correctBin);

    if (!isCorrect) {
      const isHazwaste = (rec.correctBin === 'hazwaste');
      const penaltyPoints = isHazwaste ? 150 : 50;
      if (global.ShiftStats && typeof global.ShiftStats.increment === 'function') {
        global.ShiftStats.increment('errorsMade', 1);
        global.ShiftStats.increment(isHazwaste ? 'wrongHazwasteDispositions' : 'wrongClaimDispositions', 1);
      }
      return {
        ok: true,
        isCorrect: false,
        placedIn: chosenId,
        placedLabel: getReceptacleLabel(chosenId),
        correctBin: rec.correctBin,
        correctLabel: getReceptacleLabel(rec.correctBin),
        productName: rec.productName,
        penaltyPoints: penaltyPoints
      };
    }

    clearRecallToteVisuals();
    rec.holdingTote = false;
    rec.toteOnBottomShelf = false;
    rec.toteDespawned = true;
    rec.sorted = true;

    return {
      ok: true,
      isCorrect: true,
      placedIn: chosenId,
      placedLabel: getReceptacleLabel(chosenId),
      productName: rec.productName
    };
  }

  function submitRecallCount(enteredCount) {
    const rec = state.recall;
    if (!rec || !rec.active || !rec.sorted || rec.completed) {
      return { ok: false, reason: 'recall_not_ready' };
    }
    const count = parseInt(String(enteredCount || ''), 10);
    if (!Number.isFinite(count) || count <= 0) {
      return { ok: false, reason: 'invalid_count' };
    }

    const matched = (count === rec.totalCount);
    const prevName = rec.productName;
    rec.submittedCount = count;
    rec.countMatched = matched;
    rec.completedRecalls.push({
      productName: prevName,
      submittedCount: count,
      countMatched: matched,
      totalCount: rec.totalCount
    });

    if (global.ShiftStats && typeof global.ShiftStats.increment === 'function') {
      global.ShiftStats.increment('recallsCompleted', 1);
      if (!matched) {
        global.ShiftStats.increment('errorsMade', 1);
        global.ShiftStats.increment('inaccurateInvoices', 1);
      }
    }

    clearRecallCartMeshes();
    clearRecallToteVisuals();

    if (Array.isArray(rec.queuedRecalls) && rec.queuedRecalls.length > 0) {
      const nextSlot = rec.queuedRecalls.shift();
      rec.active = false;
      triggerDailyRecall({ product: nextSlot.product, forceSpawnNext: true });
      return {
        ok: true,
        matched: matched,
        enteredCount: count,
        productName: prevName,
        nextRecallStarted: true,
        nextProductName: rec.productName
      };
    }

    rec.completed = true;
    rec.active = false;
    setRecallCartVisible(false);

    return {
      ok: true,
      matched: matched,
      enteredCount: count,
      productName: prevName
    };
  }

  function update(dt, playerPos) {
    if (!state.populated && global.DSDCatalog && typeof global.DSDCatalog.isLoaded === 'function' && global.DSDCatalog.isLoaded()) {
      generateDailyClaimsItems();
    }

    if (
      state.initialized &&
      state.recall &&
      Array.isArray(state.recall.scheduledRecalls) &&
      state.recall.scheduledRecalls.length > 0 &&
      global.DSDCatalog &&
      typeof global.DSDCatalog.isLoaded === 'function' &&
      global.DSDCatalog.isLoaded() &&
      global.ShiftClock &&
      typeof global.ShiftClock.getCurrentTotalMinutes === 'function'
    ) {
      const curMin = global.ShiftClock.getCurrentTotalMinutes();
      if (curMin >= RECALL_START_MINUTE && curMin <= RECALL_CUTOFF_MINUTE) {
        state.recall.scheduledRecalls.forEach((slot) => {
          if (!slot || slot.triggered) return;
          if (slot.triggerMinute <= RECALL_CUTOFF_MINUTE && curMin >= slot.triggerMinute) {
            slot.triggered = true;
            triggerDailyRecall({ product: slot.product });
          }
        });
      }
    }

    const tileSize = (global.WarehouseWorld && Number(global.WarehouseWorld.TILE_SIZE)) || 2.4;
    const maxOpenDistance = tileSize * 2;
    const safeDt = Math.min(0.05, Math.max(0.001, dt || 0.016));
    const animSpeed = 5.5;

    state.totes.forEach((tote) => {
      if (!tote || tote.isRed || !tote.mesh) return;
      if (tote.isOpen && playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
        const dist = Math.hypot(playerPos.x - tote.homePos.x, playerPos.z - tote.homePos.z);
        if (dist > maxOpenDistance) {
          tote.isOpen = false;
        }
      }
      const target = tote.isOpen ? 1 : 0;
      if (tote.openProgress !== target) {
        if (tote.openProgress < target) {
          tote.openProgress = Math.min(target, tote.openProgress + safeDt * animSpeed);
        } else {
          tote.openProgress = Math.max(target, tote.openProgress - safeDt * animSpeed);
        }
        applyTotePoseFromProgress(tote);
      }
    });
  }

  const _interactableToteMeshesBuf = [];
  const _openToteItemMeshesBuf = [];

  function getInteractableToteMeshes() {
    _interactableToteMeshesBuf.length = 0;
    const totes = state.totes;
    for (let i = 0; i < totes.length; i++) {
      const t = totes[i];
      if (!t || !Array.isArray(t.hitMeshes)) continue;
      for (let j = 0; j < t.hitMeshes.length; j++) {
        _interactableToteMeshesBuf.push(t.hitMeshes[j]);
      }
    }
    return _interactableToteMeshesBuf;
  }

  function getOpenToteItemMeshes() {
    _openToteItemMeshesBuf.length = 0;
    const totes = state.totes;
    for (let i = 0; i < totes.length; i++) {
      const t = totes[i];
      if (!t || t.isRed || !t.isOpen || !Array.isArray(t.items)) continue;
      for (let j = 0; j < t.items.length; j++) {
        const item = t.items[j];
        if (!item || item.claimed || item === state.heldItem || !Array.isArray(item.hitMeshes)) continue;
        for (let k = 0; k < item.hitMeshes.length; k++) {
          _openToteItemMeshesBuf.push(item.hitMeshes[k]);
        }
      }
    }
    return _openToteItemMeshesBuf;
  }

  function getReceptacleHitMeshes() {
    return state.receptacleHitMeshes;
  }

  function getRemainingClaimsCount() {
    let remaining = 0;
    state.totes.forEach((t) => {
      if (!t || t.isRed || !Array.isArray(t.items)) return;
      t.items.forEach((it) => {
        if (it && !it.claimed) remaining += 1;
      });
    });
    return remaining;
  }

  function getRemainingClaimsList() {
    const list = [];
    state.totes.forEach((t) => {
      if (!t || t.isRed || !Array.isArray(t.items)) return;
      t.items.forEach((it) => {
        if (it && !it.claimed) list.push(it);
      });
    });
    return list;
  }

  function getGrayToteSummary(tote) {
    if (!tote) return null;
    const unClaimed = (tote.items || []).filter((it) => !it.claimed);
    return {
      index: tote.index,
      label: tote.label,
      isRed: tote.isRed,
      isOpen: Boolean(tote.isOpen),
      itemCount: unClaimed.length,
      items: unClaimed
    };
  }

  function init(hooks) {
    const h = hooks || {};
    state.scene = h.scene || null;
    state.camera = h.camera || null;
    state.world = h.world || null;
    state.hooks = {
      onRecallTriggered: typeof h.onRecallTriggered === 'function' ? h.onRecallTriggered : null
    };
    clearHeldItemView();
    resetRecallForShift();
    registerShelfTotesAndReceptacles();
    generateDailyClaimsItems();
    state.initialized = true;
  }

  function resetForShift() {
    clearHeldItemView();
    resetRecallForShift();
    closeAllTotes(true);
    generateDailyClaimsItems();
  }

  function exportState() {
    const rec = state.recall;
    return {
      populated: Boolean(state.populated),
      nextItemSeq: Number(state.nextItemSeq) || 1,
      heldItemId: state.heldItem ? state.heldItem.id : null,
      totes: (state.totes || []).map((tote) => ({
        index: tote.index,
        isOpen: Boolean(tote.isOpen),
        openProgress: Number(tote.openProgress) || 0,
        items: (tote.items || []).map((it) => ({
          id: it.id,
          toteIndex: it.toteIndex,
          toteLabel: it.toteLabel,
          code: it.code,
          name: it.name,
          deptNo: it.deptNo,
          vendorNo: it.vendorNo || '',
          vendorName: it.vendorName || '',
          unitsPerCase: Number(it.unitsPerCase) || 1,
          price: Number(it.price) || 0,
          size: it.size || 'medium',
          type: it.type || 'ambient',
          notScannable: Boolean(it.notScannable),
          damageType: it.damageType,
          conditionLabel: it.conditionLabel,
          confirmedCondition: it.confirmedCondition || null,
          confirmedConditionLabel: it.confirmedConditionLabel || null,
          confirmedDisposition: it.confirmedDisposition || null,
          isVendorCredit: Boolean(it.isVendorCredit),
          claimed: Boolean(it.claimed),
          placedReceptacle: it.placedReceptacle || null,
          scannerConfirmed: Boolean(it.scannerConfirmed),
          claimKeywords: Array.isArray(it.claimKeywords) ? it.claimKeywords.slice() : [],
          shapeKind: it.shapeKind || null,
          homePos: it.homePos ? { x: Number(it.homePos.x) || 0, y: Number(it.homePos.y) || 0, z: Number(it.homePos.z) || 0 } : null,
          homeRotY: it.homeRot ? Number(it.homeRot.y) || 0 : 0
        }))
      })),
      recall: rec ? {
        triggered: Boolean(rec.triggered),
        active: Boolean(rec.active),
        sorted: Boolean(rec.sorted),
        holdingTote: Boolean(rec.holdingTote),
        toteOnBottomShelf: Boolean(rec.toteOnBottomShelf),
        toteDespawned: Boolean(rec.toteDespawned),
        completed: Boolean(rec.completed),
        triggerMinute: rec.triggerMinute !== undefined ? rec.triggerMinute : null,
        scheduledRecalls: (rec.scheduledRecalls || []).map((s) => ({
          index: s.index,
          triggerMinute: s.triggerMinute,
          triggered: Boolean(s.triggered),
          product: s.product ? Object.assign({}, s.product) : null
        })),
        queuedRecalls: (rec.queuedRecalls || []).map((q) => ({
          triggerMinute: q.triggerMinute,
          triggered: Boolean(q.triggered),
          product: q.product ? Object.assign({}, q.product) : null
        })),
        completedRecalls: Array.isArray(rec.completedRecalls) ? rec.completedRecalls.map((c) => Object.assign({}, c)) : [],
        usedProductKeys: Array.isArray(rec.usedProductKeys) ? rec.usedProductKeys.slice() : [],
        productKey: rec.productKey || null,
        productName: rec.productName || '',
        correctBin: rec.correctBin || 'trash',
        totalCount: Number(rec.totalCount) || 0,
        collectedCount: Number(rec.collectedCount) || 0,
        submittedCount: Number(rec.submittedCount) || 0,
        countMatched: rec.countMatched !== undefined ? rec.countMatched : null,
        items: (rec.items || []).map((ri) => ({
          id: ri.id,
          index: ri.index,
          code: ri.code,
          name: ri.name,
          damageType: ri.damageType || 'recall',
          collected: Boolean(ri.collected),
          pos: ri.mesh ? { x: Number(ri.mesh.position.x) || 0, y: Number(ri.mesh.position.y) || 0, z: Number(ri.mesh.position.z) || 0 } : null,
          rotY: ri.mesh ? Number(ri.mesh.rotation.y) || 0 : 0,
          rotZ: ri.mesh ? Number(ri.mesh.rotation.z) || 0 : 0
        }))
      } : null
    };
  }

  function importState(data) {
    if (!data || typeof data !== 'object') return false;
    clearHeldItemView();
    resetRecallForShift();

    state.populated = Boolean(data.populated);
    state.nextItemSeq = Number.isFinite(Number(data.nextItemSeq)) ? Number(data.nextItemSeq) : 1;

    // Rebuild shelf totes & items
    state.totes.forEach((tote) => clearToteItemMeshes(tote));
    const savedTotes = Array.isArray(data.totes) ? data.totes : [];
    const heldId = data.heldItemId || null;

    savedTotes.forEach((st) => {
      if (!st) return;
      const tote = state.totes.find((t) => t && t.index === st.index);
      if (!tote) return;
      tote.isOpen = tote.isRed ? false : Boolean(st.isOpen);
      tote.openProgress = tote.isRed ? 0 : (Number(st.openProgress) || 0);
      applyTotePoseFromProgress(tote);

      const savedItems = Array.isArray(st.items) ? st.items : [];
      savedItems.forEach((si, idx) => {
        if (!si) return;
        const impDept = String(si.deptNo || '10').padStart(2, '0');
        const impVend = resolveClaimItemVendorInfo({ code: si.code, deptNo: impDept, vendorNo: si.vendorNo, vendorName: si.vendorName });
        const itemRec = {
          id: si.id || ('claim_item_' + state.nextItemSeq++),
          toteIndex: tote.index,
          toteLabel: si.toteLabel || tote.label,
          code: String(si.code || ''),
          name: String(si.name || 'Damaged Item'),
          deptNo: impDept,
          vendorNo: impVend.vendorNo,
          vendorName: impVend.vendorName,
          unitsPerCase: Math.max(1, Number(si.unitsPerCase) || 1),
          price: Number(si.price) || 0,
          size: si.size || 'medium',
          type: String(si.type || 'ambient').toLowerCase(),
          notScannable: resolveClaimItemNotScannable(si),
          damageType: si.damageType || DAMAGE_CONDITIONS[0].key,
          conditionLabel: si.conditionLabel || getConditionInfo(si.damageType).label,
          confirmedCondition: si.confirmedCondition || null,
          confirmedConditionLabel: si.confirmedConditionLabel || null,
          confirmedDisposition: si.confirmedDisposition || null,
          isVendorCredit: Boolean(si.isVendorCredit),
          claimed: Boolean(si.claimed),
          placedReceptacle: si.placedReceptacle || null,
          scannerConfirmed: Boolean(si.scannerConfirmed),
          claimKeywords: Array.isArray(si.claimKeywords) ? si.claimKeywords.slice() : [],
          shapeKind: si.shapeKind || classifyItemShape(si),
          mesh: null,
          hitMeshes: [],
          localSize: new THREE.Vector3(0.12, 0.12, 0.12),
          localCenter: new THREE.Vector3(0, 0.06, 0)
        };

        const slotPos = ITEM_SLOT_POSITIONS[idx % ITEM_SLOT_POSITIONS.length] || [0, 0];
        const px = si.homePos && Number.isFinite(Number(si.homePos.x)) ? Number(si.homePos.x) : slotPos[0];
        const py = si.homePos && Number.isFinite(Number(si.homePos.y)) ? Number(si.homePos.y) : TOTE_FLOOR_Y;
        const pz = si.homePos && Number.isFinite(Number(si.homePos.z)) ? Number(si.homePos.z) : slotPos[1];
        const ry = Number.isFinite(Number(si.homeRotY)) ? Number(si.homeRotY) : 0;

        const itemMesh = createDamagedItemMesh(itemRec);
        itemMesh.position.set(px, py, pz);
        itemMesh.rotation.y = ry;
        const itemHits = [];
        itemMesh.traverse((child) => {
          if (child && child.isMesh) {
            child.userData = child.userData || {};
            child.userData.claimsItemRef = itemRec;
            itemHits.push(child);
          }
        });
        itemRec.mesh = itemMesh;
        itemRec.hitMeshes = itemHits;
        itemRec.homePos = itemMesh.position.clone();
        itemRec.homeRot = itemMesh.rotation.clone();

        tote.items.push(itemRec);
        if (!itemRec.claimed) {
          if (itemRec.scannerConfirmed) syncProcessedClaimVisual(itemRec);
          if (heldId && itemRec.id === heldId) {
            state.heldItem = itemRec;
            state.heldItemTote = tote;
            if (state.camera && itemRec.mesh) {
              itemRec.mesh.position.set(0.24, -0.27, -0.52);
              itemRec.mesh.rotation.set(0.18, -0.35, 0.04);
              itemRec.mesh.scale.set(1.15, 1.15, 1.15);
              itemRec.mesh.visible = true;
              state.camera.add(itemRec.mesh);
              state.heldViewMesh = itemRec.mesh;
            }
          } else if (tote.itemsGroup) {
            tote.itemsGroup.add(itemMesh);
          }
        }
      });
    });

    // Rebuild recall state & cart visuals
    const sr = data.recall;
    if (sr && typeof sr === 'object' && state.recall) {
      const rec = state.recall;
      rec.triggered = Boolean(sr.triggered);
      rec.active = Boolean(sr.active);
      rec.sorted = Boolean(sr.sorted);
      rec.holdingTote = Boolean(sr.holdingTote);
      rec.toteOnBottomShelf = Boolean(sr.toteOnBottomShelf);
      rec.toteDespawned = Boolean(sr.toteDespawned);
      rec.completed = Boolean(sr.completed);
      rec.triggerMinute = sr.triggerMinute !== undefined ? sr.triggerMinute : null;
      rec.scheduledRecalls = Array.isArray(sr.scheduledRecalls) ? sr.scheduledRecalls.map((s) => ({
        index: s.index,
        triggerMinute: s.triggerMinute,
        triggered: Boolean(s.triggered),
        product: s.product ? Object.assign({}, s.product) : null
      })) : [];
      rec.queuedRecalls = Array.isArray(sr.queuedRecalls) ? sr.queuedRecalls.map((q) => ({
        triggerMinute: q.triggerMinute,
        triggered: Boolean(q.triggered),
        product: q.product ? Object.assign({}, q.product) : null
      })) : [];
      rec.completedRecalls = Array.isArray(sr.completedRecalls) ? sr.completedRecalls.map((c) => Object.assign({}, c)) : [];
      rec.usedProductKeys = Array.isArray(sr.usedProductKeys) ? sr.usedProductKeys.slice() : [];
      rec.productKey = sr.productKey || null;
      rec.productName = sr.productName || '';
      rec.correctBin = sr.correctBin || 'trash';
      rec.totalCount = Number(sr.totalCount) || 0;
      rec.collectedCount = Number(sr.collectedCount) || 0;
      rec.submittedCount = Number(sr.submittedCount) || 0;
      rec.countMatched = sr.countMatched !== undefined ? sr.countMatched : null;
      rec.items = [];

      if (rec.active) {
        setupRecallCartAnchors();
        clearRecallCartMeshes();
        clearRecallToteVisuals();
        const cartRec = state.world && state.world.recallCart ? state.world.recallCart : null;
        const tierTopY = (cartRec && Array.isArray(cartRec.tierTopY) && cartRec.tierTopY.length >= 2) ? cartRec.tierTopY : [0.156, 0.876];
        const bottomY = tierTopY[0];
        const topY = tierTopY[tierTopY.length - 1];

        setRecallCartVisible(true);

        if (!rec.toteDespawned) {
          const toteBuilt = buildSmallRecallTote();
          rec.toteGroup = toteBuilt.group;
          rec.toteItemsGroup = toteBuilt.itemsGroup;
          rec.toteHitMeshes = toteBuilt.hitMeshes;
          for (let ci = 0; ci < rec.collectedCount; ci++) {
            if (rec.toteItemsGroup) {
              const slotIdx = ci % RECALL_TOTE_INSIDE_SLOTS.length;
              const layer = Math.floor(ci / RECALL_TOTE_INSIDE_SLOTS.length);
              const [tx, tz] = RECALL_TOTE_INSIDE_SLOTS[slotIdx];
              const mini = createDamagedItemMesh({
                id: 'recall_tote_unit_' + ci,
                code: rec.productKey,
                name: rec.productName,
                damageType: 'recall'
              });
              mini.scale.set(0.55, 0.55, 0.55);
              mini.position.set(tx, layer * 0.068, tz);
              mini.rotation.y = (ci % 3 - 1) * 0.2;
              rec.toteItemsGroup.add(mini);
            }
          }
          if (rec.holdingTote && state.camera) {
            rec.toteGroup.position.set(0.26, -0.31, -0.56);
            rec.toteGroup.rotation.set(0.22, -0.36, 0.05);
            state.camera.add(rec.toteGroup);
          } else {
            rec.toteGroup.position.set(0, bottomY, 0);
            rec.toteGroup.rotation.set(0, 0, 0);
            rec.toteOnBottomShelf = true;
            if (cartRec && cartRec.group) cartRec.group.add(rec.toteGroup);
          }
        }

        const savedItems = Array.isArray(sr.items) ? sr.items : [];
        savedItems.forEach((sri, i) => {
          if (!sri) return;
          const itemRec = {
            id: sri.id || ('recall_unit_' + i),
            index: sri.index !== undefined ? sri.index : i,
            code: sri.code || rec.productKey,
            name: sri.name || rec.productName,
            damageType: sri.damageType || 'recall',
            collected: Boolean(sri.collected),
            mesh: null,
            hitMeshes: [],
            localSize: new THREE.Vector3(0.11, 0.12, 0.11),
            localCenter: new THREE.Vector3(0, 0.06, 0)
          };
          if (!itemRec.collected && rec.cartGroup) {
            const mesh = createDamagedItemMesh(itemRec);
            const px = sri.pos && Number.isFinite(Number(sri.pos.x)) ? Number(sri.pos.x) : 0;
            const py = sri.pos && Number.isFinite(Number(sri.pos.y)) ? Number(sri.pos.y) : topY;
            const pz = sri.pos && Number.isFinite(Number(sri.pos.z)) ? Number(sri.pos.z) : 0;
            mesh.position.set(px, py, pz);
            mesh.rotation.y = Number(sri.rotY) || 0;
            mesh.rotation.z = Number(sri.rotZ) || 0;
            const itemHits = [];
            mesh.traverse((child) => {
              if (child && child.isMesh) {
                child.userData = child.userData || {};
                child.userData.recallItemRef = itemRec;
                itemHits.push(child);
              }
            });
            itemRec.mesh = mesh;
            itemRec.hitMeshes = itemHits;
            rec.cartGroup.add(mesh);
          }
          rec.items.push(itemRec);
        });

        if (rec.cartGroup) {
          const ghostMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.85
          });
          const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
          ghost.visible = false;
          rec.cartGroup.add(ghost);
          rec.arrangeGhostMesh = ghost;
        }
      } else {
        setRecallCartVisible(false);
      }
    }
    return true;
  }

  global.ClaimsTotes = {
    DAMAGE_CONDITIONS: DAMAGE_CONDITIONS,
    init: init,
    update: update,
    resetForShift: resetForShift,
    exportState: exportState,
    importState: importState,
    toggleToteOpen: toggleToteOpen,
    setToteOpen: setToteOpen,
    closeAllTotes: closeAllTotes,
    setHoveredTote: setHoveredTote,
    findItemById: findItemById,
    findClaimItemForCodeInput: findClaimItemForCodeInput,
    getConditionInfo: getConditionInfo,
    getReceptacleLabel: getReceptacleLabel,
    isItemVendorCreditEligible: isItemVendorCreditEligible,
    computeDispositionForItem: computeDispositionForItem,
    confirmItemDisposition: confirmItemDisposition,
    isHoldingItem: () => Boolean(state.heldItem),
    getHeldItem: () => state.heldItem,
    pickupItem: pickupItem,
    dropHeldItemIntoReceptacle: dropHeldItemIntoReceptacle,
    getInteractableToteMeshes: getInteractableToteMeshes,
    getOpenToteItemMeshes: getOpenToteItemMeshes,
    getReceptacleHitMeshes: getReceptacleHitMeshes,
    getRemainingClaimsCount: getRemainingClaimsCount,
    getRemainingClaimsList: getRemainingClaimsList,
    getAllTotes: () => state.totes.slice(),
    getOpenTotes: () => state.totes.filter((t) => t && t.isOpen),
    getGrayToteSummary: getGrayToteSummary,
    isHoldingRecallTote: () => Boolean(state.recall && state.recall.holdingTote),
    isArrangingRecallItem: () => Boolean(state.recall && state.recall.movingItem),
    hasPendingRecall: () => Boolean(state.recall && (state.recall.active || (Array.isArray(state.recall.queuedRecalls) && state.recall.queuedRecalls.length > 0))),
    getPendingRecallCount: () => {
      if (!state.recall) return 0;
      return (state.recall.active ? 1 : 0) + (Array.isArray(state.recall.queuedRecalls) ? state.recall.queuedRecalls.length : 0);
    },
    getRecallState: getRecallState,
    getRecallTopItemMeshes: getRecallTopItemMeshes,
    getRecallToteHitMeshes: getRecallToteHitMeshes,
    getRecallBottomDockHitMeshes: getRecallBottomDockHitMeshes,
    updateRecallArrangePreview: updateRecallArrangePreview,
    pickupRecallItemToArrange: pickupRecallItemToArrange,
    placeArrangedRecallItem: placeArrangedRecallItem,
    pickupRecallTote: pickupRecallTote,
    dockRecallToteOnBottomShelf: dockRecallToteOnBottomShelf,
    collectRecallItemIntoTote: collectRecallItemIntoTote,
    dropRecallToteIntoReceptacle: dropRecallToteIntoReceptacle,
    submitRecallCount: submitRecallCount
  };
})(window);
