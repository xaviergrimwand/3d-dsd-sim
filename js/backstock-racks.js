(function (global) {
  'use strict';

  /**
   * BackstockRacks (Phase 4 - Backroom Steel & Case Management)
   * Step 2 & Step 3: Manages floor overstock pallets near each steel rack, size-accurate 3D cases
   * (small/medium/large), shift-start seeding, ~10% post-delivery overstock spawning,
   * 1-case carrying, fine-tuned flush-front ghost placement, box-on-box stacking,
   * and shelf gravity when supporting lower boxes are removed.
   */
  const CASE_SIZE_SPECS = Object.freeze({
    small: { w: 0.24, h: 0.20, d: 0.22, units: 12 },
    medium: { w: 0.34, h: 0.26, d: 0.30, units: 8 },
    large: { w: 0.44, h: 0.34, d: 0.38, units: 4 }
  });

  // 2x2 footprint slots on a 1.20m x 1.00m GMA pallet
  const PALLET_QUADRANT_OFFSETS = [
    [-0.27, -0.22],
    [0.27, -0.22],
    [-0.27, 0.22],
    [0.27, 0.22]
  ];

  const OVERSTOCK_CHANCE_PER_CASE = 0.14;
  const SHELF_GRAVITY_ACCEL = 14.0;
  const LINK_GAP = 0.008;
  const SLIDE_SPEED = 4.5;

  const state = {
    initialized: false,
    scene: null,
    camera: null,
    world: null,
    showNotification: null,
    playDropSound: null,
    cases: [],
    palletStateById: {},
    palletIdsByRackId: {},
    racksById: {},
    shelfSlots: [],
    shelfHitMeshes: [],
    palletHitMeshes: [],
    fallingCases: [],
    slidingCases: [],
    heldCase: null,
    heldViewMesh: null,
    ghostGroup: null,
    ghostSolidMesh: null,
    ghostWireMesh: null,
    ghostMat: null,
    ghostWireMat: null,
    currentGhostPlacement: null,
    texCache: {},
    nextCaseSeq: 1,
    nextAuditGroupSeq: 1,
    inventoryFinalized: false
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function normalizeSize(rawSize) {
    const s = String(rawSize || '').toLowerCase();
    if (s === 'small' || s === 'medium' || s === 'large') return s;
    return 'medium';
  }

  function resolveCatalogProduct(code) {
    if (!code || !global.DSDCatalog || typeof global.DSDCatalog.getProduct !== 'function') return null;
    return global.DSDCatalog.getProduct(String(code));
  }

  function resolveCaseSize(item) {
    if (item && item.size) return normalizeSize(item.size);
    const prod = item && item.code ? resolveCatalogProduct(item.code) : null;
    return normalizeSize(prod && prod.size);
  }

  function resolveDeptNo(item, delivery) {
    if (item && item.deptNo) return String(item.deptNo).padStart(2, '0');
    if (item && item.code && global.DSDCatalog && typeof global.DSDCatalog.getProductDeptNo === 'function') {
      const fromCat = global.DSDCatalog.getProductDeptNo(item.code);
      if (fromCat) return String(fromCat).padStart(2, '0');
    }
    if (delivery && delivery.deptNo) return String(delivery.deptNo).padStart(2, '0');
    return '10';
  }

  function resolveRackIdForItem(item, delivery) {
    const deptNo = resolveDeptNo(item, delivery);
    const rawType = String((item && (item.temp || item.type)) || (delivery && delivery.tempZone) || 'ambient').toLowerCase();

    if (deptNo === '60') return 'claims_steel';
    if (rawType === 'frozen' || rawType === 'f' || deptNo.charAt(0) === '3') return 'freezer_steel';
    if (rawType === 'chilled' || rawType === 'refrigerated' || rawType === 'c' || deptNo.charAt(0) === '2') return 'cooler_steel';
    return 'dry_steel';
  }

  function getRackDisplayName(rackId) {
    const map = {
      dry_steel: 'Dry Backstock',
      cooler_steel: 'Cooler Steel',
      freezer_steel: 'Freezer Steel',
      claims_steel: 'Claims / Supplies'
    };
    return map[rackId] || rackId;
  }

  function getBoxTexture(code, name, type, notScannable, unitsPerCase, opts) {
    const qty = Math.max(0, Math.round(Number(unitsPerCase) || 0));
    const isLabeled = Boolean(opts && opts.labeled);
    const effectivePlu = Boolean(notScannable && !isLabeled);
    const key = `${code}|${type || 'ambient'}|${effectivePlu}|${isLabeled}|${qty}`;
    if (!state.texCache[key] && global.WarehouseTextures && typeof global.WarehouseTextures.createCardboardBoxTexture === 'function') {
      state.texCache[key] = global.WarehouseTextures.createCardboardBoxTexture(
        code,
        name,
        type,
        effectivePlu,
        qty,
        { labeled: isLabeled }
      );
    }
    return state.texCache[key] || null;
  }

  function getPalletRecord(palletKey) {
    if (!palletKey) return null;
    if (state.palletStateById[palletKey]) return state.palletStateById[palletKey];
    const ids = state.palletIdsByRackId[palletKey];
    if (Array.isArray(ids) && ids.length > 0) {
      return state.palletStateById[ids[0]] || null;
    }
    return null;
  }

  function getPalletRecordsForRack(rackId) {
    const ids = state.palletIdsByRackId[rackId] || [];
    return ids.map((id) => state.palletStateById[id]).filter(Boolean);
  }

  function pickTargetPalletForRack(rackId) {
    const recs = getPalletRecordsForRack(rackId);
    if (recs.length === 0) return null;
    let best = recs[0];
    for (let i = 1; i < recs.length; i++) {
      if (recs[i].cases.length < best.cases.length) {
        best = recs[i];
      }
    }
    return best;
  }

  function getSlotPlacementFrame(slot) {
    const rack = state.racksById[slot.rackId];
    const facing = rack ? rack.facing : 'N';
    const isNS = (facing === 'E' || facing === 'W');
    let rotY = 0;
    if (facing === 'E') rotY = Math.PI / 2;
    else if (facing === 'W') rotY = -Math.PI / 2;

    const spanMin = (isNS ? slot.minZ : slot.minX) + 0.015;
    const spanMax = (isNS ? slot.maxZ : slot.maxX) - 0.015;

    // Front edge of shelf deck/orange beam so box front face sits flush with aisle edge
    let frontEdge;
    let intoShelfDir;
    if (facing === 'E') {
      frontEdge = slot.maxX - 0.025;
      intoShelfDir = -1;
    } else if (facing === 'W') {
      frontEdge = slot.minX + 0.025;
      intoShelfDir = 1;
    } else {
      frontEdge = slot.minZ + 0.025;
      intoShelfDir = 1;
    }

    const rawDepth = isNS ? (slot.maxX - slot.minX) : (slot.maxZ - slot.minZ);
    const shelfDepth = Math.max(0.45, rawDepth - 0.035);

    // Determine overhead beam/ceiling height above this shelf slot
    let maxTopY = slot.deckY + 1.15;
    if (rack && Array.isArray(rack.slots)) {
      let nextHigherDeck = Infinity;
      rack.slots.forEach((other) => {
        if (other.segment === slot.segment && other.deckY > slot.deckY + 0.2 && other.deckY < nextHigherDeck) {
          nextHigherDeck = other.deckY;
        }
      });
      if (Number.isFinite(nextHigherDeck)) {
        // Subtract ~0.16m for steel beam + shelf deck above
        maxTopY = nextHigherDeck - 0.16;
      } else if (slot.rackId === 'dry_steel' || slot.rackId === 'claims_steel') {
        maxTopY = 3.95; // Below 4.10m top orange tie beams
      } else {
        maxTopY = 4.05; // Below 4.20m cold-room ceiling
      }
    }

    return {
      facing,
      isNS,
      rotY,
      spanMin,
      spanMax,
      frontEdge,
      intoShelfDir,
      shelfDepth,
      maxTopY
    };
  }

  function getCaseShelfSpan(caseRec) {
    if (!caseRec || !caseRec.rackSlot || !caseRec.mesh) return 0;
    const frame = getSlotPlacementFrame(caseRec.rackSlot);
    return frame.isNS ? caseRec.mesh.position.z : caseRec.mesh.position.x;
  }

  function getCaseDepthOffset(frame, caseRec) {
    if (!caseRec || !caseRec.mesh) return 0;
    const raw = frame.isNS ? caseRec.mesh.position.x : caseRec.mesh.position.z;
    return (raw - frame.frontEdge) * frame.intoShelfDir;
  }

  function getCaseDepthBounds(frame, caseRec) {
    const dims = (caseRec && caseRec.dims) || CASE_SIZE_SPECS.medium;
    const center = getCaseDepthOffset(frame, caseRec);
    return {
      center: center,
      start: center - dims.d / 2,
      end: center + dims.d / 2
    };
  }

  function syncCaseLabelTexture(caseRec, displayQty) {
    if (!caseRec || !caseRec.mesh || !caseRec.mesh.material) return;
    const targetQty = Math.max(1, Math.round(Number(displayQty) || caseRec.unitsPerCase || 1));
    const supply = isSupplyCase(caseRec);
    const isLabeled = Boolean(caseRec.labeled && !supply);
    const effectivePlu = Boolean(caseRec.notScannable && !isLabeled && !supply);
    const labelKey = `${targetQty}|${isLabeled ? 1 : 0}|${effectivePlu ? 1 : 0}`;
    if (caseRec.displayedLabelQty === targetQty && caseRec._displayedLabelKey === labelKey) return;
    const tex = getBoxTexture(caseRec.code, caseRec.name, caseRec.type, effectivePlu, targetQty, { labeled: isLabeled });
    if (tex) {
      caseRec.mesh.material.map = tex;
      caseRec.mesh.material.needsUpdate = true;
      caseRec.displayedLabelQty = targetQty;
      caseRec._displayedLabelKey = labelKey;
    }
  }

  function getChainContaining(slot, targetCase) {
    if (!slot || !targetCase || !Array.isArray(slot.placedCases)) return targetCase ? [targetCase] : [];
    const frame = getSlotPlacementFrame(slot);
    const tDims = targetCase.dims || CASE_SIZE_SPECS.medium;
    const tSpan = getCaseShelfSpan(targetCase);
    const tBotY = targetCase.mesh ? (targetCase.mesh.position.y - tDims.h / 2) : slot.deckY;

    const members = slot.placedCases.filter((c) => {
      if (!c || !c.mesh) return false;
      if (!codesMatch(c.code, targetCase.code)) return false;
      const cDims = c.dims || CASE_SIZE_SPECS.medium;
      const cSpan = getCaseShelfSpan(c);
      const cBotY = c.mesh.position.y - cDims.h / 2;
      return Math.abs(cSpan - tSpan) <= 0.06 && Math.abs(cBotY - tBotY) <= 0.04;
    });

    members.sort((a, b) => {
      const da = getCaseDepthOffset(frame, a);
      const db = getCaseDepthOffset(frame, b);
      if (Math.abs(da - db) > 0.005) return da - db;
      return (a.depthIdx || 0) - (b.depthIdx || 0);
    });

    return members.length > 0 ? members : [targetCase];
  }

  function getSlotRowChains(slot) {
    if (!slot || !Array.isArray(slot.placedCases)) return [];
    const visited = new Set();
    const chains = [];
    slot.placedCases.forEach((c) => {
      if (!c || !c.mesh || visited.has(c.id)) return;
      const chain = getChainContaining(slot, c);
      chain.forEach((m) => visited.add(m.id));
      chains.push(chain);
    });
    return chains;
  }

  function reflowSlotChains(slot, animateForward) {
    if (!slot || !Array.isArray(slot.placedCases)) return;
    const frame = getSlotPlacementFrame(slot);
    const chains = getSlotRowChains(slot);

    chains.forEach((chain) => {
      if (!chain.length) return;
      const sig = chain.map((c) => c.id).join(',');
      const changed = chain.some((c) => c._lastChainSig !== sig);
      if (changed && !state.inventoryFinalized) {
        chain.forEach((c) => {
          c.inventoried = false;
          c.auditedQty = null;
          c.auditMismatch = false;
        });
      }

      const alignedSpan = getCaseShelfSpan(chain[0]);
      const totalQty = chain.reduce((s, c) => s + Math.max(1, Number(c.unitsPerCase) || 1), 0);
      let cursorDepth = 0;

      chain.forEach((c, idx) => {
        const cDims = c.dims || CASE_SIZE_SPECS.medium;
        const depthCenter = frame.frontEdge + frame.intoShelfDir * (cursorDepth + cDims.d / 2);
        const targetX = frame.isNS ? depthCenter : alignedSpan;
        const targetZ = frame.isNS ? alignedSpan : depthCenter;

        c.depthIdx = idx;
        c.linkedCount = chain.length;
        c.linkedChainQty = (idx === 0) ? totalQty : c.unitsPerCase;
        c._lastChainSig = sig;
        c.targetSlideX = targetX;
        c.targetSlideZ = targetZ;

        if (animateForward && Math.hypot(targetX - c.mesh.position.x, targetZ - c.mesh.position.z) > 0.004) {
          if (state.slidingCases.indexOf(c) === -1) {
            state.slidingCases.push(c);
          }
        } else {
          c.mesh.position.x = targetX;
          c.mesh.position.z = targetZ;
          const sIdx = state.slidingCases.indexOf(c);
          if (sIdx !== -1) state.slidingCases.splice(sIdx, 1);
        }

        syncCaseLabelTexture(c, idx === 0 ? totalQty : c.unitsPerCase);
        cursorDepth += cDims.d + LINK_GAP;
      });
    });
  }

  function syncPalletVisibility(palletKey) {
    const palletRec = getPalletRecord(palletKey);
    if (!palletRec || !palletRec.pallet) return;
    const pallet = palletRec.pallet;
    const hasCases = Array.isArray(palletRec.cases) && palletRec.cases.length > 0;
    if (pallet.group) {
      pallet.group.visible = hasCases;
    }
    const solidWalls = state.world && Array.isArray(state.world.solidWalls) ? state.world.solidWalls : null;
    if (solidWalls && pallet.bounds) {
      const idx = solidWalls.indexOf(pallet.bounds);
      if (hasCases && idx === -1) {
        solidWalls.push(pallet.bounds);
      } else if (!hasCases && idx !== -1) {
        solidWalls.splice(idx, 1);
      }
    }
  }

  function relayoutPalletCargo(palletKey) {
    const palletRec = getPalletRecord(palletKey);
    if (!palletRec || !palletRec.pallet || !palletRec.pallet.cargoGroup) return;

    const heights = [0, 0, 0, 0];
    palletRec.columnHeights = heights;
    const cargoGroup = palletRec.pallet.cargoGroup;

    palletRec.cases.forEach((caseRec, idx) => {
      if (!caseRec || !caseRec.mesh) return;
      const dims = caseRec.dims || CASE_SIZE_SPECS.medium;
      let bestCol = 0;
      for (let i = 1; i < heights.length; i++) {
        if (heights[i] < heights[bestCol]) bestCol = i;
      }
      const qOff = PALLET_QUADRANT_OFFSETS[bestCol];
      const localY = heights[bestCol] + dims.h / 2;
      heights[bestCol] += dims.h + 0.004;

      if (caseRec.mesh.parent !== cargoGroup) {
        if (caseRec.mesh.parent) caseRec.mesh.parent.remove(caseRec.mesh);
        cargoGroup.add(caseRec.mesh);
      }
      caseRec.mesh.visible = true;
      caseRec.mesh.position.set(qOff[0], localY, qOff[1]);
      caseRec.mesh.rotation.set(0, ((idx % 5) - 2) * 0.025, 0);
      caseRec.palletCol = bestCol;
    });

    syncPalletVisibility(palletRec.palletId);
  }

  function getNextPalletDropPreview(pallet, dims) {
    const palletRec = pallet ? getPalletRecord(pallet.palletId || pallet.rackId) : null;
    if (!palletRec || !pallet.group) return null;
    const heights = palletRec.columnHeights || [0, 0, 0, 0];
    let bestCol = 0;
    for (let i = 1; i < heights.length; i++) {
      if (heights[i] < heights[bestCol]) bestCol = i;
    }
    const qOff = PALLET_QUADRANT_OFFSETS[bestCol];
    const localPos = new THREE.Vector3(qOff[0], pallet.topY + heights[bestCol] + dims.h / 2, qOff[1]);
    pallet.group.updateMatrixWorld();
    const worldPos = localPos.applyMatrix4(pallet.group.matrixWorld);
    return {
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z,
      rotY: pallet.rotY || 0,
      valid: true
    };
  }

  function applyShelfGravity(slot) {
    if (!slot || !Array.isArray(slot.placedCases) || slot.placedCases.length === 0) return;

    const frame = getSlotPlacementFrame(slot);

    // Sort bottom-to-top so supporting lower boxes settle before boxes above them
    const ordered = slot.placedCases
      .filter((c) => c && c.mesh)
      .slice()
      .sort((a, b) => a.mesh.position.y - b.mesh.position.y);

    const settled = [];
    ordered.forEach((caseRec) => {
      const dims = caseRec.dims || CASE_SIZE_SPECS.medium;
      const mySpan = getCaseShelfSpan(caseRec);
      const myHalfW = dims.w / 2;
      const myDepth = getCaseDepthBounds(frame, caseRec);

      let supportTopY = slot.deckY;
      settled.forEach((below) => {
        const bDims = below.dims || CASE_SIZE_SPECS.medium;
        const bSpan = getCaseShelfSpan(below);
        const bDepth = getCaseDepthBounds(frame, below);
        const overlapW = Math.min(mySpan + myHalfW, bSpan + bDims.w / 2) - Math.max(mySpan - myHalfW, bSpan - bDims.w / 2);
        const overlapD = Math.min(myDepth.end, bDepth.end) - Math.max(myDepth.start, bDepth.start);
        if (overlapW > 0.02 && overlapD > 0.02) {
          supportTopY = Math.max(supportTopY, below.restTopY);
        }
      });

      const targetCenterY = supportTopY + dims.h / 2;
      caseRec.restTopY = supportTopY + dims.h;
      settled.push(caseRec);

      if (caseRec.mesh.position.y > targetCenterY + 0.004) {
        caseRec.targetFallY = targetCenterY;
        if (typeof caseRec.fallVelY !== 'number') caseRec.fallVelY = 0;
        if (state.fallingCases.indexOf(caseRec) === -1) {
          state.fallingCases.push(caseRec);
        }
      } else {
        caseRec.mesh.position.y = targetCenterY;
        caseRec.targetFallY = targetCenterY;
        caseRec.fallVelY = 0;
      }
    });
  }

  function ensureGhostMeshes() {
    if (state.ghostGroup || !state.scene) return;
    state.ghostGroup = new THREE.Group();
    state.ghostGroup.visible = false;

    state.ghostMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.44,
      depthWrite: false
    });
    state.ghostSolidMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), state.ghostMat);
    state.ghostGroup.add(state.ghostSolidMesh);

    state.ghostWireMat = new THREE.MeshBasicMaterial({
      color: 0x86efac,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    state.ghostWireMesh = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), state.ghostWireMat);
    state.ghostGroup.add(state.ghostWireMesh);

    state.scene.add(state.ghostGroup);
  }

  function hideGhostPreview() {
    state.currentGhostPlacement = null;
    if (state.ghostGroup) {
      state.ghostGroup.visible = false;
    }
  }

  function buildShelfGhostValidation(slot, existing, dims, frame, spanCoord, resolvedBaseY, depthStart, depthEnd, caseRec, linkInfo) {
    const { isNS, rotY, frontEdge, intoShelfDir, shelfDepth, maxTopY } = frame;
    const myTopY = resolvedBaseY + dims.h;
    const fitsHeight = (myTopY <= maxTopY);
    const fitsDepth = (depthEnd <= shelfDepth + 0.002);
    const zoneMatches = (!caseRec || !caseRec.targetRackId || caseRec.targetRackId === slot.rackId);
    const requiredRackName = caseRec && caseRec.targetRackId ? getRackDisplayName(caseRec.targetRackId) : '';
    const labelOk = Boolean(!caseRec || isSupplyCase(caseRec) || caseRec.labeled);

    let hasSupport = (resolvedBaseY <= slot.deckY + 0.005);
    let supportReason = 'Needs solid support below';

    if (!hasSupport) {
      const targetDepthIdx = linkInfo ? linkInfo.depthIdx : 0;
      const lowerRow = existing
        .filter((b) => {
          const overlapW = Math.min(spanCoord + dims.w / 2, b.span + b.halfW) - Math.max(spanCoord - dims.w / 2, b.span - b.halfW);
          return overlapW > 0.025 && Math.abs(b.topY - resolvedBaseY) <= 0.03;
        })
        .sort((a, b) => a.depthCenter - b.depthCenter);

      if (targetDepthIdx >= 1) {
        if (lowerRow.length < targetDepthIdx + 1) {
          hasSupport = false;
          supportReason = `Lower row needs ${targetDepthIdx + 1} cases deep below`;
        } else {
          const requiredSlice = lowerRow.slice(0, targetDepthIdx + 1);
          const allSameSize = requiredSlice.every((lb) => !caseRec || lb.ref.size === caseRec.size);
          const rearSupport = requiredSlice[targetDepthIdx];
          const coversDepth = rearSupport && rearSupport.depthStart <= depthStart + 0.03 && rearSupport.depthEnd >= depthEnd - 0.03;
          if (!allSameSize) {
            hasSupport = false;
            supportReason = 'Lower row must match case size to link';
          } else if (!coversDepth) {
            hasSupport = false;
            supportReason = 'Needs lower-row linked case below';
          } else {
            hasSupport = true;
          }
        }
      } else if (lowerRow.length > 0) {
        const frontSup = lowerRow[0];
        const overlapW = Math.min(spanCoord + dims.w / 2, frontSup.span + frontSup.halfW) -
          Math.max(spanCoord - dims.w / 2, frontSup.span - frontSup.halfW);
        const fitsOnFrontDepth = (dims.d <= frontSup.d + 0.02);
        if (!fitsOnFrontDepth) {
          hasSupport = false;
          supportReason = 'Case too deep for lower box';
        } else {
          hasSupport = (overlapW >= Math.min(dims.w, frontSup.w) * 0.50);
        }
      }
    }

    let collides = false;
    existing.forEach((b) => {
      const overlapW = Math.min(spanCoord + dims.w / 2, b.span + b.halfW) - Math.max(spanCoord - dims.w / 2, b.span - b.halfW);
      const overlapD = Math.min(depthEnd, b.depthEnd) - Math.max(depthStart, b.depthStart);
      if (overlapW > 0.015 && overlapD > 0.015 && resolvedBaseY < b.topY - 0.008 && myTopY > b.botY + 0.008) {
        collides = true;
      }
    });

    const skuAllowed = (!linkInfo || linkInfo.skuMatches);
    const depthCenterWorld = frontEdge + intoShelfDir * ((depthStart + depthEnd) / 2);
    const x = isNS ? depthCenterWorld : spanCoord;
    const z = isNS ? spanCoord : depthCenterWorld;
    const y = resolvedBaseY + dims.h / 2;

    let reason = '';
    if (!labelOk) reason = 'Print yellow label (Scanner 3 -> 1) before slotting';
    else if (!zoneMatches) reason = `Wrong rack — must go on ${requiredRackName}`;
    else if (!skuAllowed) reason = 'Only identical cases can link back-to-back';
    else if (!fitsDepth) reason = 'Not enough shelf depth';
    else if (!fitsHeight) reason = 'Too tall for shelf';
    else if (!hasSupport) reason = supportReason;
    else if (collides) reason = 'Overlaps another case';

    return {
      type: 'slot',
      slot: slot,
      x: x,
      y: y,
      z: z,
      rotY: rotY,
      dims: dims,
      linkedRowQty: linkInfo ? linkInfo.newTotalQty : (caseRec ? caseRec.unitsPerCase : dims.units),
      linkedCount: linkInfo ? (linkInfo.depthIdx + 1) : 1,
      valid: Boolean(labelOk && zoneMatches && skuAllowed && fitsDepth && fitsHeight && hasSupport && !collides),
      reason: reason
    };
  }

  function computeShelfGhostPlacement(slot, hitPoint, hitObject, caseRec) {
    const dims = (caseRec && caseRec.dims) || CASE_SIZE_SPECS.medium;
    const frame = getSlotPlacementFrame(slot);
    const { isNS, spanMin, spanMax } = frame;

    const minAllowedSpan = spanMin + dims.w / 2;
    const maxAllowedSpan = spanMax - dims.w / 2;
    const rawHitSpan = isNS ? hitPoint.z : hitPoint.x;
    let spanCoord = THREE.MathUtils.clamp(rawHitSpan, minAllowedSpan, maxAllowedSpan);

    const existing = (Array.isArray(slot.placedCases) ? slot.placedCases : [])
      .filter((c) => c && c.mesh)
      .map((c) => {
        const cDims = c.dims || CASE_SIZE_SPECS.medium;
        const cSpan = isNS ? c.mesh.position.z : c.mesh.position.x;
        const cCy = c.mesh.position.y;
        const cDepth = getCaseDepthBounds(frame, c);
        return {
          ref: c,
          span: cSpan,
          halfW: cDims.w / 2,
          w: cDims.w,
          d: cDims.d,
          botY: cCy - cDims.h / 2,
          topY: cCy + cDims.h / 2,
          depthCenter: cDepth.center,
          depthStart: cDepth.start,
          depthEnd: cDepth.end
        };
      });

    const hitExistingCase = hitObject && hitObject.userData && hitObject.userData.backstockCaseRef;
    let baseY = slot.deckY;

    if (hitExistingCase && hitExistingCase.rackSlot === slot && hitExistingCase.mesh) {
      const hitChain = getChainContaining(slot, hitExistingCase);
      const chainFront = hitChain[0];
      const hDims = chainFront.dims || CASE_SIZE_SPECS.medium;
      const hSpan = isNS ? chainFront.mesh.position.z : chainFront.mesh.position.x;
      const hBotY = chainFront.mesh.position.y - hDims.h / 2;
      const hTopY = chainFront.mesh.position.y + hDims.h / 2;

      const isAimTop = (hitPoint.y >= hTopY - Math.min(0.10, hDims.h * 0.36));
      const isAimFrontCenter = (!isAimTop && Math.abs(rawHitSpan - hSpan) <= hDims.w * 0.36);

      // Check if there is already an upper box sitting directly above hitChain
      const upperBoxes = existing
        .filter((b) => {
          const overlapW = Math.min(hSpan + hDims.w / 2, b.span + b.halfW) - Math.max(hSpan - hDims.w / 2, b.span - b.halfW);
          return overlapW > 0.03 && Math.abs(b.botY - hTopY) <= 0.03;
        })
        .sort((a, b) => a.depthCenter - b.depthCenter);

      // Aiming on top of rear depth slots behind an already-placed upper box links into that upper row!
      if (isAimTop && upperBoxes.length > 0 && (hitExistingCase.depthIdx || 0) >= 1) {
        const upperChain = getChainContaining(slot, upperBoxes[0].ref);
        const uLast = upperChain[upperChain.length - 1];
        const uLastDepth = getCaseDepthBounds(frame, uLast);
        const nextDepthStart = uLastDepth.end + LINK_GAP;
        const nextDepthEnd = nextDepthStart + dims.d;
        const uFront = upperChain[0];
        const uDims = uFront.dims || CASE_SIZE_SPECS.medium;
        const uSpan = isNS ? uFront.mesh.position.z : uFront.mesh.position.x;
        const uBotY = uFront.mesh.position.y - uDims.h / 2;
        const currentQty = upperChain.reduce((s, c) => s + Math.max(1, Number(c.unitsPerCase) || 1), 0);
        return buildShelfGhostValidation(slot, existing, dims, frame, uSpan, uBotY, nextDepthStart, nextDepthEnd, caseRec, {
          depthIdx: upperChain.length,
          skuMatches: codesMatch(caseRec && caseRec.code, uFront.code),
          newTotalQty: currentQty + (caseRec ? caseRec.unitsPerCase : dims.units)
        });
      }

      // Aiming directly at the center/front face of a case -> Link back-to-back behind its chain
      if (isAimFrontCenter) {
        const lastInChain = hitChain[hitChain.length - 1];
        const lastDepth = getCaseDepthBounds(frame, lastInChain);
        const nextDepthStart = lastDepth.end + LINK_GAP;
        const nextDepthEnd = nextDepthStart + dims.d;
        const currentQty = hitChain.reduce((s, c) => s + Math.max(1, Number(c.unitsPerCase) || 1), 0);
        return buildShelfGhostValidation(slot, existing, dims, frame, hSpan, hBotY, nextDepthStart, nextDepthEnd, caseRec, {
          depthIdx: hitChain.length,
          skuMatches: codesMatch(caseRec && caseRec.code, chainFront.code),
          newTotalQty: currentQty + (caseRec ? caseRec.unitsPerCase : dims.units)
        });
      }

      if (isAimTop) {
        const sameSizeStack = Boolean(caseRec && chainFront.size === caseRec.size);
        if (sameSizeStack) {
          spanCoord = THREE.MathUtils.clamp(hSpan, minAllowedSpan, maxAllowedSpan);
        } else {
          const maxOverhang = Math.max(0.02, hDims.w * 0.45);
          spanCoord = THREE.MathUtils.clamp(
            spanCoord,
            Math.max(minAllowedSpan, hSpan - maxOverhang),
            Math.min(maxAllowedSpan, hSpan + maxOverhang)
          );
        }
        baseY = hTopY;
      } else {
        const sideDir = rawHitSpan >= hSpan ? 1 : -1;
        spanCoord = THREE.MathUtils.clamp(
          hSpan + sideDir * (hDims.w / 2 + dims.w / 2 + 0.005),
          minAllowedSpan,
          maxAllowedSpan
        );
        baseY = hBotY;
      }
    } else {
      // Aiming at shelf surface/backplane: check front boxes overlapping this span
      const overlappingAtAnyY = existing.filter((b) =>
        b.depthStart < dims.d + 0.02 &&
        Math.abs(spanCoord - b.span) < (dims.w / 2 + b.halfW - 0.01)
      );
      if (overlappingAtAnyY.length > 0) {
        let highestTop = slot.deckY;
        let highestTopBox = null;
        overlappingAtAnyY.forEach((b) => {
          if (b.topY > highestTop) {
            highestTop = b.topY;
            highestTopBox = b;
          }
        });
        if (hitPoint.y >= highestTop - 0.06) {
          if (highestTopBox && caseRec && highestTopBox.ref.size === caseRec.size) {
            spanCoord = THREE.MathUtils.clamp(highestTopBox.span, minAllowedSpan, maxAllowedSpan);
          }
          baseY = highestTop;
        } else {
          const nearest = overlappingAtAnyY[0];
          const sideDir = spanCoord >= nearest.span ? 1 : -1;
          spanCoord = THREE.MathUtils.clamp(
            nearest.span + sideDir * (nearest.halfW + dims.w / 2 + 0.005),
            minAllowedSpan,
            maxAllowedSpan
          );
          baseY = slot.deckY;
        }
      }
    }

    // Settle baseY cleanly onto actual front supporting boxes beneath [spanCoord - dims.w/2 .. spanCoord + dims.w/2]
    let resolvedBaseY = slot.deckY;
    existing
      .filter((b) => b.depthStart < dims.d + 0.02)
      .sort((a, b) => a.botY - b.botY)
      .forEach((b) => {
        const overlapW = Math.min(spanCoord + dims.w / 2, b.span + b.halfW) - Math.max(spanCoord - dims.w / 2, b.span - b.halfW);
        if (overlapW > 0.025 && b.botY <= resolvedBaseY + 0.02) {
          if (baseY >= b.topY - 0.06 || overlapW > 0.025) {
            if (b.topY > resolvedBaseY) {
              resolvedBaseY = b.topY;
            }
          }
        }
      });

    return buildShelfGhostValidation(slot, existing, dims, frame, spanCoord, resolvedBaseY, 0, dims.d, caseRec, null);
  }

  function updateGhostPreview(raycaster) {
    if (!state.heldCase || !raycaster) {
      hideGhostPreview();
      return null;
    }

    ensureGhostMeshes();
    const dims = state.heldCase.dims || CASE_SIZE_SPECS.medium;
    const targets = getPlaceableRaycastMeshes();
    if (targets.length === 0) {
      hideGhostPreview();
      return null;
    }

    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length === 0) {
      hideGhostPreview();
      return null;
    }

    const hit = hits[0];
    const ud = hit.object && hit.object.userData ? hit.object.userData : {};
    let placement = null;

    if (ud.backstockPalletRef) {
      const prev = getNextPalletDropPreview(ud.backstockPalletRef, dims);
      if (prev) {
        const palletZoneMatches = (!state.heldCase.targetRackId || state.heldCase.targetRackId === ud.backstockPalletRef.rackId);
        placement = {
          type: 'pallet',
          pallet: ud.backstockPalletRef,
          x: prev.x,
          y: prev.y,
          z: prev.z,
          rotY: prev.rotY,
          dims: dims,
          valid: palletZoneMatches,
          reason: palletZoneMatches ? '' : `Wrong pallet — must go on ${getRackDisplayName(state.heldCase.targetRackId)} pallet`
        };
      }
    } else if (ud.backstockSlotRef) {
      placement = computeShelfGhostPlacement(ud.backstockSlotRef, hit.point, hit.object, state.heldCase);
    } else if (ud.backstockCaseRef && ud.backstockCaseRef.placedOnRack && ud.backstockCaseRef.rackSlot) {
      placement = computeShelfGhostPlacement(ud.backstockCaseRef.rackSlot, hit.point, hit.object, state.heldCase);
    }

    if (!placement) {
      hideGhostPreview();
      return null;
    }

    state.currentGhostPlacement = placement;
    if (state.ghostGroup) {
      state.ghostGroup.visible = true;
      state.ghostGroup.position.set(placement.x, placement.y, placement.z);
      state.ghostGroup.rotation.set(0, placement.rotY || 0, 0);
      state.ghostGroup.scale.set(dims.w, dims.h, dims.d);
      state.ghostMat.color.setHex(placement.valid ? 0x22c55e : 0xef4444);
      state.ghostWireMat.color.setHex(placement.valid ? 0x86efac : 0xfca5a5);
    }

    return placement;
  }

  function addCaseToOverstockPallet(opts) {
    const targetRackId = opts.palletRackId || opts.rackId;
    const palletRec = opts.palletId
      ? getPalletRecord(opts.palletId)
      : pickTargetPalletForRack(targetRackId);
    if (!palletRec || !palletRec.pallet || !palletRec.pallet.cargoGroup) return null;

    const sizeKey = normalizeSize(opts.size);
    const dims = CASE_SIZE_SPECS[sizeKey] || CASE_SIZE_SPECS.medium;
    const unitsPerCase = Number(opts.unitsPerCase) || dims.units;
    const supply = Boolean(String(opts.deptNo || '') === '60' || String(opts.vendorNo || '') === '601' || opts.rackId === 'claims_steel');
    const effectivePlu = Boolean(opts.notScannable && !supply);
    const tex = getBoxTexture(opts.code, opts.name, opts.type, effectivePlu, unitsPerCase, { labeled: false });
    const mat = new THREE.MeshStandardMaterial({
      map: tex || undefined,
      color: tex ? 0xffffff : 0xc59f6b,
      roughness: 0.78
    });

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.d), mat);

    const caseRec = {
      id: `bs_${state.nextCaseSeq++}`,
      code: String(opts.code || '0000'),
      name: String(opts.name || 'Backstock Case'),
      deptNo: String(opts.deptNo || '10'),
      vendorNo: opts.vendorNo ? String(opts.vendorNo) : '',
      vendorName: String(opts.vendorName || ''),
      type: String(opts.type || 'ambient'),
      size: sizeKey,
      dims: dims,
      unitsPerCase: unitsPerCase,
      notScannable: Boolean(opts.notScannable),
      source: opts.source || 'shift_start',
      deliveryId: opts.deliveryId || null,
      targetRackId: opts.rackId,
      homePalletRackId: targetRackId,
      homePalletId: palletRec.palletId,
      placedOnRack: false,
      placedRackId: null,
      rackSlot: null,
      zoneMismatch: false,
      labeled: false,
      inventoried: false,
      auditedQty: null,
      auditMismatch: false,
      auditGroupId: null,
      palletCol: 0,
      targetFallY: 0,
      fallVelY: 0,
      targetSlideX: 0,
      targetSlideZ: 0,
      depthIdx: 0,
      linkedCount: 1,
      linkedChainQty: unitsPerCase,
      displayedLabelQty: unitsPerCase,
      _lastChainSig: null,
      mesh: mesh
    };

    mesh.userData.backstockCaseRef = caseRec;
    palletRec.cases.push(caseRec);
    state.cases.push(caseRec);
    relayoutPalletCargo(palletRec.palletId);
    return caseRec;
  }

  function clearHeldCaseView() {
    if (state.heldViewMesh && state.heldViewMesh.parent) {
      state.heldViewMesh.parent.remove(state.heldViewMesh);
    }
    state.heldViewMesh = null;
    state.heldCase = null;
    hideGhostPreview();
  }

  function showHeldCaseView(caseRec) {
    clearHeldCaseView();
    state.heldCase = caseRec;
    if (!state.camera || !caseRec || !caseRec.mesh) return;

    const dims = caseRec.dims || CASE_SIZE_SPECS.medium;
    const viewMesh = new THREE.Mesh(
      new THREE.BoxGeometry(dims.w, dims.h, dims.d),
      caseRec.mesh.material
    );
    viewMesh.scale.set(0.72, 0.72, 0.72);
    viewMesh.position.set(0.28, -0.34, -0.58);
    viewMesh.rotation.set(0.12, -0.24, 0.05);
    state.camera.add(viewMesh);
    state.heldViewMesh = viewMesh;
  }

  function canPickupCase(caseRec) {
    if (!caseRec) return { ok: false, reason: 'No case found' };
    if (state.heldCase) return { ok: false, reason: 'Already carrying a case' };
    if (!caseRec.placedOnRack || !caseRec.rackSlot || !caseRec.mesh) {
      return { ok: true };
    }

    const slot = caseRec.rackSlot;
    const myChain = getChainContaining(slot, caseRec);
    const frame = getSlotPlacementFrame(slot);
    const myChainSet = new Set(myChain.map((c) => c.id));

    let minSpan = Infinity;
    let maxSpan = -Infinity;
    let myTopY = -Infinity;
    myChain.forEach((c) => {
      const dims = c.dims || CASE_SIZE_SPECS.medium;
      const span = getCaseShelfSpan(c);
      minSpan = Math.min(minSpan, span - dims.w / 2);
      maxSpan = Math.max(maxSpan, span + dims.w / 2);
      myTopY = Math.max(myTopY, c.mesh.position.y + dims.h / 2);
    });

    const hasUpperCaseAbove = (slot.placedCases || []).some((other) => {
      if (!other || !other.mesh || myChainSet.has(other.id)) return false;
      const oDims = other.dims || CASE_SIZE_SPECS.medium;
      const oBotY = other.mesh.position.y - oDims.h / 2;
      if (oBotY < myTopY - 0.03) return false;
      const oSpan = frame.isNS ? other.mesh.position.z : other.mesh.position.x;
      const overlapW = Math.min(maxSpan, oSpan + oDims.w / 2) - Math.max(minSpan, oSpan - oDims.w / 2);
      return overlapW > 0.02;
    });

    if (hasUpperCaseAbove) {
      return { ok: false, reason: 'Pull top cases before removing bottom cases' };
    }

    return { ok: true };
  }

  function pickupCase(caseRec) {
    const check = canPickupCase(caseRec);
    if (!check.ok) return null;

    if (caseRec.placedOnRack && caseRec.rackSlot) {
      const oldSlot = caseRec.rackSlot;
      if (Array.isArray(oldSlot.placedCases)) {
        const idx = oldSlot.placedCases.indexOf(caseRec);
        if (idx !== -1) oldSlot.placedCases.splice(idx, 1);
      }
      const fIdx = state.fallingCases.indexOf(caseRec);
      if (fIdx !== -1) state.fallingCases.splice(fIdx, 1);
      const sIdx = state.slidingCases.indexOf(caseRec);
      if (sIdx !== -1) state.slidingCases.splice(sIdx, 1);
      if (caseRec.mesh && caseRec.mesh.parent) {
        caseRec.mesh.parent.remove(caseRec.mesh);
      }
      caseRec.placedOnRack = false;
      caseRec.placedRackId = null;
      caseRec.rackSlot = null;
      caseRec.zoneMismatch = false;
      caseRec.depthIdx = 0;
      caseRec.linkedCount = 1;
      caseRec.linkedChainQty = caseRec.unitsPerCase;
      caseRec._lastChainSig = null;
      syncCaseLabelTexture(caseRec, caseRec.unitsPerCase);
      if (!state.inventoryFinalized) {
        if (caseRec.auditGroupId) {
          unmarkAuditGroup(caseRec.auditGroupId, false);
        }
        caseRec.inventoried = false;
        caseRec.auditedQty = null;
        caseRec.auditMismatch = false;
        caseRec.auditGroupId = null;
      }
      if (caseRec.mesh && caseRec.mesh.material) {
        if (caseRec.mesh.material.color) {
          caseRec.mesh.material.color.setHex(caseRec.mesh.material.map ? 0xffffff : 0xc59f6b);
        }
        if (caseRec.mesh.material.emissive) {
          caseRec.mesh.material.emissive.setHex(0x000000);
          caseRec.mesh.material.emissiveIntensity = 0;
        }
      }
      applyShelfGravity(oldSlot);
      reflowSlotChains(oldSlot, true);
    } else {
      const pRec = getPalletRecord(caseRec.homePalletId || caseRec.homePalletRackId);
      if (pRec) {
        const idx = pRec.cases.indexOf(caseRec);
        if (idx !== -1) pRec.cases.splice(idx, 1);
        relayoutPalletCargo(pRec.palletId);
      }
      if (caseRec.mesh && caseRec.mesh.parent) {
        caseRec.mesh.parent.remove(caseRec.mesh);
      }
    }

    if (caseRec.mesh) caseRec.mesh.visible = false;
    showHeldCaseView(caseRec);
    return caseRec;
  }

  function placeHeldCaseAtPreview(preview) {
    const caseRec = state.heldCase;
    const p = preview || state.currentGhostPlacement;
    if (!caseRec || !p || !p.valid) return null;

    if (p.type === 'pallet' && p.pallet) {
      return placeHeldCaseOnPallet(p.pallet);
    }

    const slot = p.slot;
    if (!slot || slot.hasTotes) return null;
    if (caseRec && !isSupplyCase(caseRec) && !caseRec.labeled) return null;
    if (caseRec.targetRackId && slot.rackId !== caseRec.targetRackId) return null;
    if (!Array.isArray(slot.placedCases)) slot.placedCases = [];

    clearHeldCaseView();

    if (caseRec.mesh) {
      if (caseRec.mesh.parent !== state.scene && state.scene) {
        if (caseRec.mesh.parent) caseRec.mesh.parent.remove(caseRec.mesh);
        state.scene.add(caseRec.mesh);
      }
      caseRec.mesh.visible = true;
      caseRec.mesh.position.set(p.x, p.y, p.z);
      caseRec.mesh.rotation.set(0, p.rotY || 0, 0);
    }

    caseRec.placedOnRack = true;
    caseRec.placedRackId = slot.rackId;
    caseRec.rackSlot = slot;
    caseRec.zoneMismatch = (caseRec.targetRackId !== slot.rackId);
    caseRec.targetFallY = p.y;
    caseRec.fallVelY = 0;
    slot.placedCases.push(caseRec);
    reflowSlotChains(slot, false);

    return {
      caseRec: caseRec,
      slot: slot,
      zoneMismatch: caseRec.zoneMismatch,
      linkedCount: caseRec.linkedCount || 1,
      linkedRowQty: (getChainContaining(slot, caseRec)[0] || caseRec).linkedChainQty || caseRec.unitsPerCase
    };
  }

  function placeHeldCaseOnPallet(pallet) {
    const caseRec = state.heldCase;
    if (!caseRec || !pallet || !pallet.rackId) return null;
    if (caseRec.targetRackId && pallet.rackId !== caseRec.targetRackId) return null;
    const palletRec = getPalletRecord(pallet.palletId || pallet.rackId);
    if (!palletRec) return null;

    clearHeldCaseView();
    caseRec.placedOnRack = false;
    caseRec.placedRackId = null;
    caseRec.rackSlot = null;
    caseRec.zoneMismatch = false;
    caseRec.homePalletRackId = pallet.rackId;
    caseRec.homePalletId = palletRec.palletId;
    palletRec.cases.push(caseRec);
    relayoutPalletCargo(palletRec.palletId);
    return {
      caseRec: caseRec,
      pallet: pallet
    };
  }

  function update(dt) {
    const step = Math.min(0.05, Math.max(0.001, dt || 0.016));
    let anyLanded = false;

    for (let i = state.fallingCases.length - 1; i >= 0; i--) {
      const c = state.fallingCases[i];
      if (!c || !c.mesh || !c.placedOnRack) {
        state.fallingCases.splice(i, 1);
        continue;
      }
      c.fallVelY = (c.fallVelY || 0) + SHELF_GRAVITY_ACCEL * step;
      c.mesh.position.y -= c.fallVelY * step;
      if (c.mesh.position.y <= c.targetFallY) {
        c.mesh.position.y = c.targetFallY;
        c.fallVelY = 0;
        state.fallingCases.splice(i, 1);
        anyLanded = true;
      }
    }

    for (let i = state.slidingCases.length - 1; i >= 0; i--) {
      const c = state.slidingCases[i];
      if (!c || !c.mesh || !c.placedOnRack) {
        state.slidingCases.splice(i, 1);
        continue;
      }
      const dx = (c.targetSlideX !== undefined ? c.targetSlideX : c.mesh.position.x) - c.mesh.position.x;
      const dz = (c.targetSlideZ !== undefined ? c.targetSlideZ : c.mesh.position.z) - c.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const move = SLIDE_SPEED * step;
      if (dist <= move || dist < 0.002) {
        c.mesh.position.x += dx;
        c.mesh.position.z += dz;
        state.slidingCases.splice(i, 1);
      } else {
        c.mesh.position.x += (dx / dist) * move;
        c.mesh.position.z += (dz / dist) * move;
      }
    }

    if (anyLanded && typeof state.playDropSound === 'function') {
      state.playDropSound();
    }
  }

  function clearAllCases() {
    clearHeldCaseView();
    state.fallingCases = [];
    state.slidingCases = [];
    state.inventoryFinalized = false;

    state.shelfSlots.forEach((slot) => {
      if (Array.isArray(slot.placedCases)) {
        slot.placedCases.forEach((c) => {
          if (c && c.mesh && c.mesh.parent) c.mesh.parent.remove(c.mesh);
        });
        slot.placedCases = [];
      }
    });

    Object.keys(state.palletStateById).forEach((palletId) => {
      const rec = state.palletStateById[palletId];
      if (rec && rec.pallet && rec.pallet.cargoGroup) {
        while (rec.pallet.cargoGroup.children.length > 0) {
          rec.pallet.cargoGroup.remove(rec.pallet.cargoGroup.children[0]);
        }
      }
      if (rec) {
        rec.columnHeights = [0, 0, 0, 0];
        rec.cases = [];
      }
      syncPalletVisibility(palletId);
    });

    state.cases.forEach((c) => {
      if (c && c.mesh && c.mesh.parent) {
        c.mesh.parent.remove(c.mesh);
      }
    });
    state.cases = [];
  }

  function getCatalogProductsForDeptGroup(prefixOrExact, exactMatch) {
    if (!global.DSDCatalog || !Array.isArray(global.DSDCatalog.allVendorEntries)) return [];
    const prefixes = Array.isArray(prefixOrExact) ? prefixOrExact : [prefixOrExact];
    const results = [];
    const seenCodes = new Set();

    global.DSDCatalog.allVendorEntries.forEach((ve) => {
      if (!ve || (ve.type !== 'truck' && ve.type !== 'side_door')) return;
      if (!Array.isArray(ve.products)) return;
      const d = String(ve.deptNo || '').padStart(2, '0');
      const deptMatches = prefixes.some((pref) => (exactMatch ? (d === pref) : (d.charAt(0) === pref)));
      if (!deptMatches) return;

      ve.products.forEach((p) => {
        if (!p || p.warehouseOnly || seenCodes.has(p.code)) return;
        seenCodes.add(p.code);
        results.push(Object.assign({}, p, {
          deptNo: d,
          vendorNo: ve.vendorNo,
          vendorName: ve.name
        }));
      });
    });

    return results;
  }

  function shuffleCopy(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function spawnStartingBackstock() {
    clearAllCases();
    const spawnProdCase = (rackId, prod) => {
      addCaseToOverstockPallet({
        rackId: rackId,
        code: prod.code,
        name: prod.name,
        deptNo: prod.deptNo,
        vendorNo: prod.vendorNo,
        vendorName: prod.vendorName,
        type: prod.type,
        size: prod.size,
        unitsPerCase: prod.unitsPerCase,
        notScannable: prod.notScannable,
        source: 'shift_start'
      });
    };

    const starterPlan = [
      { rackId: 'claims_steel', pool: getCatalogProductsForDeptGroup('60', true), guaranteeAll: true },
      { rackId: 'dry_steel', pool: getCatalogProductsForDeptGroup(['1', '4', '5'], false), guaranteeAll: false, min: 7, max: 10 },
      { rackId: 'cooler_steel', pool: getCatalogProductsForDeptGroup('2', false), guaranteeAll: false, min: 6, max: 9 },
      { rackId: 'freezer_steel', pool: getCatalogProductsForDeptGroup('3', false), guaranteeAll: false, min: 6, max: 8 }
    ];

    starterPlan.forEach((plan) => {
      if (!plan.pool.length) return;
      const shuffledPool = shuffleCopy(plan.pool);

      if (plan.guaranteeAll) {
        // Seed exactly 1 starting case of every Dept 60 supply UPC
        shuffledPool.forEach((prod) => spawnProdCase(plan.rackId, prod));
        return;
      }

      // Pick random individual cases from the department pool without forcing duplicate multiples
      const count = randInt(plan.min, plan.max);
      for (let i = 0; i < count; i++) {
        spawnProdCase(plan.rackId, shuffledPool[i % shuffledPool.length]);
      }
    });
  }

  function collectDeliveredPhysicalCases(delivery) {
    const out = [];
    if (Array.isArray(delivery.physicalBoxes) && delivery.physicalBoxes.length > 0) {
      delivery.physicalBoxes.forEach((box) => {
        if (!box || box.flaggedOverage || box.overageFlagged) return;
        const cat = resolveCatalogProduct(box.code);
        out.push({
          code: box.code,
          name: box.name || (cat && cat.name) || 'DSD Item',
          type: box.type || (cat && cat.type) || 'ambient',
          size: resolveCaseSize(box),
          unitsPerCase: Number(box.unitsPerCase || (cat && cat.unitsPerCase)) || undefined,
          deptNo: resolveDeptNo(cat || box, delivery),
          vendorNo: (cat && cat.vendorNo) || delivery.vendorNo,
          vendorName: (cat && cat.vendorName) || delivery.carrier || delivery.vendorName || '',
          notScannable: Boolean(box.notScannable || (cat && cat.notScannable))
        });
      });
      return out;
    }

    const items = Array.isArray(delivery.invoiceItems) ? delivery.invoiceItems : [];
    items.forEach((it) => {
      const rawUnits = Math.max(0, Number(it.physicalQty !== undefined ? it.physicalQty : it.qty) || 0);
      const cat = resolveCatalogProduct(it.code);
      const sz = resolveCaseSize(it);
      const upc = Math.max(1, Number(it.unitsPerCase || (cat && cat.unitsPerCase)) || (SIZE_DIMS[sz] && SIZE_DIMS[sz].units) || 8);
      const caseCount = it.physicalCases !== undefined
        ? Math.max(0, Math.round(Number(it.physicalCases)))
        : (delivery.type === 'warehouse' ? rawUnits : (rawUnits <= 0 ? 0 : Math.max(1, Math.round(rawUnits / upc))));
      for (let q = 0; q < caseCount; q++) {
        out.push({
          code: it.code,
          name: it.name || (cat && cat.name) || 'DSD Item',
          type: it.type || (cat && cat.type) || 'ambient',
          size: sz,
          unitsPerCase: upc,
          deptNo: resolveDeptNo(cat || it, delivery),
          vendorNo: (cat && cat.vendorNo) || delivery.vendorNo,
          vendorName: (cat && cat.vendorName) || delivery.carrier || delivery.vendorName || '',
          notScannable: Boolean(it.notScannable || (cat && cat.notScannable))
        });
      }
    });
    return out;
  }

  function spawnOverstockFromDelivery(delivery) {
    if (!delivery || delivery.refused || delivery.backstockSpawned) return [];
    if (delivery.type === 'warehouse') return [];
    if (delivery._isNightDrop || delivery._isPinnedArchive || delivery._isTaskCorrection) return [];
    if (!delivery.completed && !delivery.isFinalized) return [];

    delivery.backstockSpawned = true;

    const deliveredCases = collectDeliveredPhysicalCases(delivery);
    if (!deliveredCases.length) return [];

    const isSupplyVendorDelivery = Boolean(
      String(delivery.deptNo || '') === '60' ||
      String(delivery.vendorNo || '') === '601'
    );

    const spawned = [];
    const racksTouched = new Set();

    deliveredCases.forEach((entry) => {
      const isSupplyEntry = isSupplyVendorDelivery || String(entry.deptNo || '') === '60';
      // Dept 60 is the only vendor with 100% overstock; standard DSD vendors roll 14% per case
      if (!isSupplyEntry && Math.random() >= OVERSTOCK_CHANCE_PER_CASE) return;
      const rackId = resolveRackIdForItem(entry, delivery);
      const created = addCaseToOverstockPallet({
        rackId: rackId,
        code: entry.code,
        name: entry.name,
        deptNo: entry.deptNo,
        vendorNo: entry.vendorNo || delivery.vendorNo,
        vendorName: entry.vendorName || delivery.carrier || delivery.vendorName || '',
        type: entry.type,
        size: entry.size,
        unitsPerCase: entry.unitsPerCase,
        notScannable: entry.notScannable,
        source: isSupplyEntry ? 'supply_delivery' : 'delivery',
        deliveryId: delivery.id
      });
      if (created) {
        spawned.push(created);
        racksTouched.add(rackId);
      }
    });

    if (spawned.length > 0 && typeof state.showNotification === 'function') {
      const names = Array.from(racksTouched).map((id) => getRackDisplayName(id)).join(', ');
      state.showNotification(`📦 Backstock left behind: ${spawned.length} case${spawned.length !== 1 ? 's' : ''} staged on floor pallet (${names}).`);
    }

    return spawned;
  }

  function cleanupPlacementTargets() {
    state.shelfHitMeshes.forEach((m) => {
      if (m && m.parent) m.parent.remove(m);
    });
    state.palletHitMeshes.forEach((m) => {
      if (m && m.parent) m.parent.remove(m);
    });
    state.shelfHitMeshes = [];
    state.palletHitMeshes = [];
  }

  function buildPlacementTargets() {
    cleanupPlacementTargets();
    if (!state.scene || !state.world) return;

    const hitMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    state.shelfSlots.forEach((slot) => {
      if (slot.hasTotes) return;
      const frame = getSlotPlacementFrame(slot);
      const sx = Math.max(0.3, slot.maxX - slot.minX);
      const sz = Math.max(0.3, slot.maxZ - slot.minZ);
      const bayClearH = Math.max(0.45, frame.maxTopY - slot.deckY);

      // 1. Horizontal shelf deck slab (for downward-angled aiming onto shelf surface)
      const deckPlane = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.03, sz), hitMat);
      deckPlane.position.set(slot.centerX, slot.deckY - 0.01, slot.centerZ);
      deckPlane.userData.backstockSlotRef = slot;
      state.scene.add(deckPlane);
      state.shelfHitMeshes.push(deckPlane);

      // 2. Vertical back-stop plane inside bay depth so eye-level or upward-angled shelf aiming hits accurately
      const backDepthPos = frame.isNS ? slot.centerX : slot.centerZ;
      const backGeo = frame.isNS
        ? new THREE.PlaneGeometry(sz, bayClearH)
        : new THREE.PlaneGeometry(sx, bayClearH);
      const backPlane = new THREE.Mesh(backGeo, hitMat);
      backPlane.position.set(
        frame.isNS ? backDepthPos : slot.centerX,
        slot.deckY + bayClearH / 2,
        frame.isNS ? slot.centerZ : backDepthPos
      );
      if (frame.isNS) backPlane.rotation.y = Math.PI / 2;
      backPlane.userData.backstockSlotRef = slot;
      state.scene.add(backPlane);
      state.shelfHitMeshes.push(backPlane);
    });

    const overstockPallets = Array.isArray(state.world.overstockPallets) ? state.world.overstockPallets : [];
    overstockPallets.forEach((pallet) => {
      if (!pallet || !pallet.bounds) return;
      const sx = Math.max(0.4, pallet.bounds.maxX - pallet.bounds.minX);
      const sz = Math.max(0.4, pallet.bounds.maxZ - pallet.bounds.minZ);
      const sy = 0.70;
      const hitMesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), hitMat);
      hitMesh.position.set(pallet.x, pallet.topY + sy / 2 - 0.06, pallet.z);
      hitMesh.userData.backstockPalletRef = pallet;
      state.scene.add(hitMesh);
      state.palletHitMeshes.push(hitMesh);
    });
  }

  function getPlaceableRaycastMeshes() {
    const placedMeshes = state.cases
      .filter((c) => c && c.placedOnRack && c.mesh && c !== state.heldCase)
      .map((c) => c.mesh);
    const activePalletHits = state.palletHitMeshes.filter((m) => {
      const p = m && m.userData ? m.userData.backstockPalletRef : null;
      return Boolean(p && p.group && p.group.visible);
    });
    return placedMeshes.concat(state.shelfHitMeshes, activePalletHits);
  }

  function rebuildRackAndPalletRegistries() {
    state.racksById = {};
    state.shelfSlots = [];
    const racks = (state.world && Array.isArray(state.world.steelRacks)) ? state.world.steelRacks : [];
    racks.forEach((rk) => {
      if (!rk || !rk.id) return;
      state.racksById[rk.id] = rk;
      if (Array.isArray(rk.slots)) {
        rk.slots.forEach((slot) => {
          if (!Array.isArray(slot.placedCases)) slot.placedCases = [];
          state.shelfSlots.push(slot);
        });
      }
    });

    state.palletStateById = {};
    state.palletIdsByRackId = {};
    const overstockPallets = (state.world && Array.isArray(state.world.overstockPallets))
      ? state.world.overstockPallets
      : [];
    overstockPallets.forEach((pallet, idx) => {
      if (!pallet || !pallet.rackId) return;
      const pId = pallet.palletId || `${pallet.rackId}_p${idx + 1}`;
      pallet.palletId = pId;
      state.palletStateById[pId] = {
        palletId: pId,
        pallet: pallet,
        columnHeights: [0, 0, 0, 0],
        cases: []
      };
      if (!Array.isArray(state.palletIdsByRackId[pallet.rackId])) {
        state.palletIdsByRackId[pallet.rackId] = [];
      }
      state.palletIdsByRackId[pallet.rackId].push(pId);
      syncPalletVisibility(pId);
    });
  }

  function init(ctx) {
    const c = ctx || {};
    state.scene = c.scene || state.scene;
    state.camera = c.camera || state.camera;
    state.world = c.world || state.world;
    state.showNotification = c.showNotification || state.showNotification;
    state.playDropSound = c.playDropSound || state.playDropSound;
    ensureGhostMeshes();
    rebuildRackAndPalletRegistries();
    buildPlacementTargets();
    state.initialized = true;
    spawnStartingBackstock();
  }

  function isInventoryEligibleRack(rackId) {
    return rackId === 'dry_steel' || rackId === 'cooler_steel' || rackId === 'freezer_steel';
  }

  function normalizeInventoryCode(rawCode) {
    const clean = String(rawCode || '').trim();
    const stripped = clean.replace(/^0+/, '');
    return { clean, stripped };
  }

  function codesMatch(caseCode, rawCode) {
    const a = normalizeInventoryCode(caseCode);
    const b = normalizeInventoryCode(rawCode);
    if (!a.clean || !b.clean) return false;
    return a.clean === b.clean || (a.stripped && a.stripped === b.stripped);
  }

  function getInventoryRackCases() {
    return state.cases.filter((c) => c && c.placedOnRack && c.rackSlot && isInventoryEligibleRack(c.rackSlot.rackId));
  }

  function getUnplacedInventoryCases() {
    return state.cases.filter((c) => c && !c.placedOnRack && isInventoryEligibleRack(c.targetRackId));
  }

  function getInventoryRaycastMeshes() {
    return state.cases
      .filter((c) => c && c.mesh && c.mesh.visible && c !== state.heldCase)
      .map((c) => c.mesh);
  }

  function findInventoryCaseForInput(rawCode, preferredCaseId, preferInventoried) {
    const rackCases = getInventoryRackCases()
      .slice()
      .sort((a, b) => (a.depthIdx || 0) - (b.depthIdx || 0));
    if (preferredCaseId) {
      const exact = rackCases.find((c) => c.id === preferredCaseId && (!rawCode || codesMatch(c.code, rawCode)));
      if (exact) return exact;
    }
    if (!rawCode) return null;
    if (preferInventoried) {
      const auditedMatch = rackCases.find((c) => c.inventoried && codesMatch(c.code, rawCode));
      if (auditedMatch) return auditedMatch;
    }
    const unInventoried = rackCases.find((c) => !c.inventoried && codesMatch(c.code, rawCode));
    if (unInventoried) return unInventoried;
    return rackCases.find((c) => codesMatch(c.code, rawCode)) || null;
  }

  function syncInventoryVisuals(active) {
    const show = Boolean(active);
    state.cases.forEach((caseRec) => {
      if (!caseRec || !caseRec.mesh || !caseRec.mesh.material) return;
      const mat = caseRec.mesh.material;
      const eligible = Boolean(
        caseRec.placedOnRack &&
        caseRec.rackSlot &&
        isInventoryEligibleRack(caseRec.rackSlot.rackId) &&
        caseRec.inventoried
      );
      if (show && eligible) {
        if (mat.color) mat.color.setHex(0x86efac);
        if (mat.emissive) {
          mat.emissive.setHex(0x22c55e);
          mat.emissiveIntensity = 0.65;
        }
      } else {
        if (mat.color) mat.color.setHex(mat.map ? 0xffffff : 0xc59f6b);
        if (mat.emissive) {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    });
  }

  function unmarkAuditGroup(groupId, visualActive) {
    if (!groupId) return;
    state.cases.forEach((c) => {
      if (c && c.auditGroupId === groupId) {
        c.inventoried = false;
        c.auditedQty = null;
        c.auditMismatch = false;
        c.auditGroupId = null;
      }
    });
    if (visualActive !== undefined) {
      syncInventoryVisuals(Boolean(visualActive));
    }
  }

  function getCaseAuditInfo(caseOrId) {
    const caseRec = typeof caseOrId === 'string'
      ? state.cases.find((c) => c && c.id === caseOrId)
      : caseOrId;
    if (!caseRec) {
      return { inventoried: false, auditedQty: 0, auditGroupId: null, groupCaseCount: 0 };
    }
    if (!caseRec.inventoried) {
      return { inventoried: false, auditedQty: 0, auditGroupId: null, groupCaseCount: 0 };
    }
    if (caseRec.auditGroupId) {
      const peers = state.cases.filter((c) => c && c.auditGroupId === caseRec.auditGroupId);
      const totalAudited = peers.reduce((s, c) => s + (Number(c.auditedQty) || 0), 0);
      return {
        inventoried: true,
        auditedQty: totalAudited,
        auditGroupId: caseRec.auditGroupId,
        groupCaseCount: peers.length
      };
    }
    return {
      inventoried: true,
      auditedQty: Number(caseRec.auditedQty) || 0,
      auditGroupId: null,
      groupCaseCount: 1
    };
  }

  function findExactChainSubset(chains, remainingQty, startIdx, picked) {
    if (remainingQty === 0) return picked.slice();
    if (remainingQty < 0 || startIdx >= chains.length) return null;
    for (let i = startIdx; i < chains.length; i++) {
      const ch = chains[i];
      if (ch.units <= remainingQty) {
        picked.push(ch);
        const found = findExactChainSubset(chains, remainingQty - ch.units, i + 1, picked);
        if (found) return found;
        picked.pop();
      }
    }
    return null;
  }

  function markCaseInventoried(caseId, enteredQty, visualActive) {
    const signedQty = Math.round(Number(enteredQty) || 0);
    let caseRec = state.cases.find((c) => c && c.id === caseId);
    if (!caseRec || !caseRec.placedOnRack || !caseRec.rackSlot || !isInventoryEligibleRack(caseRec.rackSlot.rackId)) {
      return { ok: false, error: 'NOT ON BACKSTOCK STEEL' };
    }

    let qty = signedQty;
    if (signedQty < 0) {
      if (!caseRec.inventoried) {
        const sameSlotAudited = (caseRec.rackSlot.placedCases || []).find(
          (c) => c && c.inventoried && codesMatch(c.code, caseRec.code)
        );
        if (!sameSlotAudited) {
          return { ok: false, error: 'NO COUNT TO ADJUST' };
        }
        caseRec = sameSlotAudited;
      }
      const prevInfo = getCaseAuditInfo(caseRec);
      const prevQty = Math.max(0, Number(prevInfo.auditedQty) || 0);
      const netQty = prevQty + signedQty;
      if (netQty < 0) {
        return { ok: false, error: `ADJ EXCEEDS ${prevQty}u` };
      }
      if (netQty === 0) {
        unmarkCaseInventoried(caseRec.id, visualActive);
        return {
          ok: true,
          removed: true,
          caseRec: caseRec,
          binLabel: formatSlotDesignation(caseRec.rackSlot),
          auditedQty: 0,
          deltaQty: signedQty,
          caseIds: [caseRec.id]
        };
      }
      qty = netQty;
    } else if (qty <= 0) {
      return { ok: false, error: 'ENTER UNITS > 0' };
    }

    // Re-keying or adjusting an audited case/group clears its prior audit entry cleanly before recalculating
    if (caseRec.inventoried) {
      unmarkCaseInventoried(caseRec.id, false);
    }

    const slot = caseRec.rackSlot;
    const clickedChain = getChainContaining(slot, caseRec);
    const clickedUnits = clickedChain.reduce((sum, c) => sum + Math.max(1, Number(c.unitsPerCase) || 1), 0);
    const clickedSpan = getCaseShelfSpan(clickedChain[0] || caseRec);

    let selectedChains = [clickedChain];
    if (qty > clickedUnits) {
      const clickedSet = new Set(clickedChain.map((c) => c.id));
      const slotChains = getSlotRowChains(slot);
      const otherChains = slotChains
        .filter((ch) => {
          if (!ch || ch.length === 0) return false;
          if (ch.some((c) => clickedSet.has(c.id))) return false;
          if (ch.some((c) => c.inventoried)) return false;
          return codesMatch(ch[0].code, caseRec.code);
        })
        .map((ch) => {
          const front = ch[0];
          const chSpan = getCaseShelfSpan(front);
          const spanDist = Math.abs(chSpan - clickedSpan);
          const sameStack = spanDist <= 0.12 ? 0 : 1;
          const botY = front.mesh ? front.mesh.position.y : 0;
          return {
            cases: ch,
            units: ch.reduce((sum, c) => sum + Math.max(1, Number(c.unitsPerCase) || 1), 0),
            sameStack: sameStack,
            spanDist: spanDist,
            botY: botY
          };
        })
        .sort((a, b) => {
          if (a.sameStack !== b.sameStack) return a.sameStack - b.sameStack;
          if (Math.abs(a.spanDist - b.spanDist) > 0.04) return a.spanDist - b.spanDist;
          return a.botY - b.botY;
        });

      const exactMatches = findExactChainSubset(otherChains, qty - clickedUnits, 0, []);
      if (exactMatches && exactMatches.length > 0) {
        selectedChains = selectedChains.concat(exactMatches.map((entry) => entry.cases));
      } else {
        let runningUnits = clickedUnits;
        for (let i = 0; i < otherChains.length && runningUnits < qty; i++) {
          selectedChains.push(otherChains[i].cases);
          runningUnits += otherChains[i].units;
        }
      }
    }

    const targetCases = [];
    selectedChains.forEach((ch) => {
      ch.forEach((c) => targetCases.push(c));
    });

    const outerCase = clickedChain[0] || targetCases[0] || caseRec;
    const expectedQty = targetCases.reduce((sum, c) => sum + Math.max(1, Number(c.unitsPerCase) || 1), 0);
    const mismatch = (qty !== expectedQty);
    const groupId = `ag_${state.nextAuditGroupSeq++}`;

    targetCases.forEach((c) => {
      c.inventoried = true;
      c.auditMismatch = mismatch;
      c.auditGroupId = groupId;
      c.auditedQty = (c === outerCase) ? qty : 0;
    });

    syncInventoryVisuals(visualActive !== false);
    return {
      ok: true,
      caseRec: outerCase,
      auditGroupId: groupId,
      caseIds: targetCases.map((c) => c.id),
      chainCount: targetCases.length,
      binLabel: formatSlotDesignation(outerCase.rackSlot),
      expectedQty,
      auditedQty: qty,
      mismatch: mismatch
    };
  }

  function unmarkCaseInventoried(caseId, visualActive) {
    const caseRec = state.cases.find((c) => c && c.id === caseId);
    if (!caseRec) return false;
    if (caseRec.auditGroupId) {
      unmarkAuditGroup(caseRec.auditGroupId, visualActive);
      return true;
    }
    const targets = (caseRec.placedOnRack && caseRec.rackSlot)
      ? getChainContaining(caseRec.rackSlot, caseRec)
      : [caseRec];
    targets.forEach((c) => {
      c.inventoried = false;
      c.auditedQty = null;
      c.auditMismatch = false;
      c.auditGroupId = null;
    });
    syncInventoryVisuals(Boolean(visualActive));
    return true;
  }

  function getInventorySummary() {
    const placedCases = getInventoryRackCases();
    const unplacedInventory = getUnplacedInventoryCases();
    const allUnplaced = state.cases.filter((c) => c && !c.placedOnRack);
    let auditedCases = 0;
    let missedPlaced = 0;
    let mismatchedQty = 0;
    let totalExpectedUnits = 0;
    let totalAuditedUnits = 0;

    placedCases.forEach((c) => {
      const expU = Math.max(1, Number(c.unitsPerCase) || 1);
      totalExpectedUnits += expU;
      if (c.inventoried) {
        auditedCases += 1;
        totalAuditedUnits += Math.max(0, Number(c.auditedQty) || 0);
        if (c.auditMismatch) mismatchedQty += 1;
      } else {
        missedPlaced += 1;
      }
    });

    return {
      totalPlaced: placedCases.length,
      auditedCases,
      missedPlaced,
      mismatchedQty,
      unplacedBackstock: allUnplaced.length,
      unplacedInventoryCases: unplacedInventory.length,
      totalExpectedUnits,
      totalAuditedUnits,
      finalized: Boolean(state.inventoryFinalized)
    };
  }

  function finalizeInventoryAudit() {
    state.inventoryFinalized = true;
    return getInventorySummary();
  }

  function formatSlotDesignation(slot) {
    if (!slot) return '';
    if (slot.binLabel) return slot.binLabel;
    return `Bay ${slot.segment + 1} · Shelf ${slot.level + 1}`;
  }

  function isSupplyCase(caseRec) {
    if (!caseRec) return false;
    return Boolean(
      String(caseRec.deptNo || '') === '60' ||
      String(caseRec.vendorNo || '') === '601' ||
      caseRec.targetRackId === 'claims_steel'
    );
  }

  function getSupplyCatalogProducts() {
    return getCatalogProductsForDeptGroup('60', true).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  }

  function getSupplyStockMap() {
    const products = getSupplyCatalogProducts();
    const byCode = {};
    products.forEach((prod) => {
      byCode[String(prod.code)] = {
        product: prod,
        shelfCases: [],
        shelfUnits: 0,
        floorCases: 0
      };
    });

    let totalOnShelfUnits = 0;
    let totalOnShelfCases = 0;
    let unplacedCount = 0;

    state.cases.forEach((c) => {
      if (!c || !isSupplyCase(c)) return;
      const code = String(c.code || '');
      if (!byCode[code]) {
        byCode[code] = {
          product: {
            code: code,
            name: c.name || 'Supply Item',
            size: c.size || 'medium',
            unitsPerCase: Math.max(1, Number(c.unitsPerCase) || 1),
            price: 0,
            deptNo: '60',
            vendorNo: '601',
            vendorName: 'Retail Solutions Inc.'
          },
          shelfCases: [],
          shelfUnits: 0,
          floorCases: 0
        };
      }
      const bucket = byCode[code];
      if (c.placedOnRack && c.placedRackId === 'claims_steel' && c.rackSlot) {
        const units = Math.max(0, Number(c.unitsPerCase) || 0);
        if (units > 0) {
          bucket.shelfCases.push(c);
          bucket.shelfUnits += units;
          totalOnShelfUnits += units;
          totalOnShelfCases += 1;
        }
      } else {
        bucket.floorCases += 1;
        unplacedCount += 1;
      }
    });

    const missingSkus = products.filter((p) => (byCode[String(p.code)] && byCode[String(p.code)].shelfUnits || 0) <= 0);
    return {
      products: products,
      byCode: byCode,
      totalOnShelfUnits: totalOnShelfUnits,
      totalOnShelfCases: totalOnShelfCases,
      unplacedCount: unplacedCount,
      missingSkus: missingSkus
    };
  }

  function getUnplacedSupplyCasesCount() {
    return state.cases.filter((c) => c && !c.placedOnRack && isSupplyCase(c)).length;
  }

  function removeCaseFromSystem(caseRec) {
    if (!caseRec) return;
    if (state.heldCase === caseRec) {
      clearHeldCaseView();
    }
    const idxAll = state.cases.indexOf(caseRec);
    if (idxAll !== -1) state.cases.splice(idxAll, 1);
    const idxFall = state.fallingCases.indexOf(caseRec);
    if (idxFall !== -1) state.fallingCases.splice(idxFall, 1);
    const idxSlide = state.slidingCases.indexOf(caseRec);
    if (idxSlide !== -1) state.slidingCases.splice(idxSlide, 1);

    const oldSlot = caseRec.rackSlot;
    if (caseRec.placedOnRack && oldSlot && Array.isArray(oldSlot.placedCases)) {
      const sIdx = oldSlot.placedCases.indexOf(caseRec);
      if (sIdx !== -1) oldSlot.placedCases.splice(sIdx, 1);
    } else {
      const palletRec = state.pallets.find((p) => Array.isArray(p.cases) && p.cases.indexOf(caseRec) !== -1);
      if (palletRec) {
        const pIdx = palletRec.cases.indexOf(caseRec);
        if (pIdx !== -1) palletRec.cases.splice(pIdx, 1);
        relayoutPalletCargo(palletRec.palletId);
      }
    }

    if (caseRec.mesh && caseRec.mesh.parent) {
      caseRec.mesh.parent.remove(caseRec.mesh);
    }
    caseRec.placedOnRack = false;
    caseRec.placedRackId = null;
    caseRec.rackSlot = null;

    if (oldSlot) {
      applyShelfGravity(oldSlot);
      reflowSlotChains(oldSlot, false);
    }
  }

  function applyDailySupplyUsage() {
    const products = getSupplyCatalogProducts();
    const outOfStock = [];
    const depleted = [];
    const nowEmptySkus = [];
    const consumed = [];

    products.forEach((prod) => {
      const stocked = state.cases.filter((c) => (
        c &&
        c.placedOnRack &&
        c.placedRackId === 'claims_steel' &&
        c.rackSlot &&
        codesMatch(c.code, prod.code) &&
        (Number(c.unitsPerCase) || 0) > 0
      ));

      if (stocked.length === 0) {
        outOfStock.push({ code: prod.code, name: prod.name });
        return;
      }

      // Prefer partialed cases (lowest unitsPerCase), breaking ties top-down then front-to-back
      stocked.sort((a, b) => {
        const ua = Number(a.unitsPerCase) || 0;
        const ub = Number(b.unitsPerCase) || 0;
        if (ua !== ub) return ua - ub;
        const ya = a.mesh ? a.mesh.position.y : 0;
        const yb = b.mesh ? b.mesh.position.y : 0;
        if (Math.abs(yb - ya) > 0.02) return yb - ya;
        return (a.depthIdx || 0) - (b.depthIdx || 0);
      });

      const target = stocked[0];
      const nextUnits = Math.max(0, (Number(target.unitsPerCase) || 1) - 1);
      target.unitsPerCase = nextUnits;
      consumed.push({ code: prod.code, name: prod.name, remainingUnits: nextUnits });

      if (nextUnits <= 0) {
        depleted.push({ code: prod.code, name: prod.name });
        removeCaseFromSystem(target);
        if (stocked.length === 1) {
          nowEmptySkus.push({ code: prod.code, name: prod.name });
        }
      } else {
        target.displayedLabelQty = -1;
        if (target.rackSlot) {
          reflowSlotChains(target.rackSlot, false);
        } else {
          syncCaseLabelTexture(target, nextUnits);
        }
      }
    });

    if (outOfStock.length > 0 && global.ShiftStats && typeof global.ShiftStats.increment === 'function') {
      global.ShiftStats.increment('supplyOutOfStockCount', outOfStock.length);
    }

    return {
      outOfStock: outOfStock,
      depleted: depleted,
      nowEmptySkus: nowEmptySkus,
      consumedCount: consumed.length
    };
  }

  function advanceShift() {
    state.inventoryFinalized = false;
    state.cases.forEach((c) => {
      if (!c) return;
      c.inventoried = false;
      c.auditedQty = null;
      c.auditMismatch = false;
      c.auditGroupId = null;
    });
    syncInventoryVisuals(false);
    if (state.heldCase) {
      clearHeldCaseView();
    }
    return applyDailySupplyUsage();
  }

  function canSlotCaseOnSteel(caseRec) {
    return Boolean(!caseRec || isSupplyCase(caseRec) || caseRec.labeled);
  }

  function labelCase(caseId) {
    const caseRec = state.cases.find((c) => c && c.id === caseId);
    if (!caseRec) return { ok: false, reason: 'not_found', error: 'CASE NOT FOUND' };
    if (isSupplyCase(caseRec)) return { ok: false, reason: 'supply_exempt', error: 'DEPT 60 NO LABEL REQ' };
    if (caseRec.labeled) return { ok: false, reason: 'already_labeled', error: 'ALREADY LABELED' };
    const wasPlu = Boolean(caseRec.notScannable);
    caseRec.labeled = true;
    caseRec._displayedLabelKey = null;
    syncCaseLabelTexture(caseRec, caseRec.unitsPerCase);
    return {
      ok: true,
      caseRec: caseRec,
      wasPlu: wasPlu
    };
  }

  function findBackstockCaseForLabelInput(rawCode, preferredCaseId) {
    const codeStr = String(rawCode || '').trim();
    if (!codeStr) return null;
    const candidates = state.cases.filter((c) => c && !c.labeled && !isSupplyCase(c));
    if (preferredCaseId) {
      const hoveredMatch = candidates.find((c) => c.id === preferredCaseId && codesMatch(c.code, codeStr));
      if (hoveredMatch) return hoveredMatch;
    }
    const palletMatch = candidates.find((c) => !c.placedOnRack && codesMatch(c.code, codeStr));
    if (palletMatch) return palletMatch;
    return candidates.find((c) => codesMatch(c.code, codeStr)) || null;
  }

  function resetForShift() {
    rebuildRackAndPalletRegistries();
    buildPlacementTargets();
    spawnStartingBackstock();
  }

  function exportState() {
    return {
      nextCaseSeq: Number(state.nextCaseSeq) || 1,
      nextAuditGroupSeq: Number(state.nextAuditGroupSeq) || 1,
      inventoryFinalized: Boolean(state.inventoryFinalized),
      heldCaseId: state.heldCase ? state.heldCase.id : null,
      cases: (state.cases || []).map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        deptNo: c.deptNo,
        vendorNo: c.vendorNo,
        vendorName: c.vendorName,
        type: c.type,
        size: c.size,
        unitsPerCase: Number(c.unitsPerCase) || 1,
        notScannable: Boolean(c.notScannable),
        source: c.source || 'shift_start',
        deliveryId: c.deliveryId || null,
        targetRackId: c.targetRackId || null,
        homePalletRackId: c.homePalletRackId || null,
        homePalletId: c.homePalletId || null,
        placedOnRack: Boolean(c.placedOnRack),
        placedRackId: c.placedRackId || null,
        slotKey: c.rackSlot ? `${c.rackSlot.rackId}|${c.rackSlot.segment}|${c.rackSlot.level}` : null,
        zoneMismatch: Boolean(c.zoneMismatch),
        labeled: Boolean(c.labeled),
        inventoried: Boolean(c.inventoried),
        auditedQty: c.auditedQty !== undefined ? c.auditedQty : null,
        auditMismatch: Boolean(c.auditMismatch),
        auditGroupId: c.auditGroupId || null,
        palletCol: Number(c.palletCol) || 0,
        depthIdx: Number(c.depthIdx) || 0,
        linkedCount: Number(c.linkedCount) || 1,
        linkedChainQty: Number(c.linkedChainQty) || Number(c.unitsPerCase) || 1,
        displayedLabelQty: Number(c.displayedLabelQty) || Number(c.unitsPerCase) || 1,
        pos: c.mesh ? { x: Number(c.mesh.position.x) || 0, y: Number(c.mesh.position.y) || 0, z: Number(c.mesh.position.z) || 0 } : null,
        rotY: c.mesh ? Number(c.mesh.rotation.y) || 0 : 0
      }))
    };
  }

  function importState(data) {
    if (!data || typeof data !== 'object') return false;
    clearAllCases();
    rebuildRackAndPalletRegistries();
    buildPlacementTargets();

    state.nextCaseSeq = Number.isFinite(Number(data.nextCaseSeq)) ? Number(data.nextCaseSeq) : 1;
    state.nextAuditGroupSeq = Number.isFinite(Number(data.nextAuditGroupSeq)) ? Number(data.nextAuditGroupSeq) : 1;
    state.inventoryFinalized = Boolean(data.inventoryFinalized);

    const slotByKey = {};
    state.shelfSlots.forEach((slot) => {
      if (slot && slot.rackId) {
        slotByKey[`${slot.rackId}|${slot.segment}|${slot.level}`] = slot;
      }
    });

    const heldId = data.heldCaseId || null;
    const savedCases = Array.isArray(data.cases) ? data.cases : [];

    savedCases.forEach((sc) => {
      if (!sc) return;
      const sizeKey = normalizeSize(sc.size);
      const dims = CASE_SIZE_SPECS[sizeKey] || CASE_SIZE_SPECS.medium;
      const unitsPerCase = Number(sc.unitsPerCase) || dims.units;
      const labelQty = Number(sc.displayedLabelQty) || unitsPerCase;
      const scSupply = Boolean(String(sc.deptNo || '') === '60' || String(sc.vendorNo || '') === '601' || sc.targetRackId === 'claims_steel');
      const scLabeled = Boolean(sc.labeled && !scSupply);
      const scEffectivePlu = Boolean(sc.notScannable && !scLabeled && !scSupply);
      const tex = getBoxTexture(sc.code, sc.name, sc.type, scEffectivePlu, labelQty, { labeled: scLabeled });
      const mat = new THREE.MeshStandardMaterial({
        map: tex || undefined,
        color: tex ? 0xffffff : 0xc59f6b,
        roughness: 0.78
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.d), mat);

      const palletRec = getPalletRecord(sc.homePalletId || sc.homePalletRackId);
      const caseRec = {
        id: sc.id || (`bs_${state.nextCaseSeq++}`),
        code: String(sc.code || '0000'),
        name: String(sc.name || 'Backstock Case'),
        deptNo: String(sc.deptNo || '10'),
        vendorNo: sc.vendorNo ? String(sc.vendorNo) : '',
        vendorName: String(sc.vendorName || ''),
        type: String(sc.type || 'ambient'),
        size: sizeKey,
        dims: dims,
        unitsPerCase: unitsPerCase,
        notScannable: Boolean(sc.notScannable),
        source: sc.source || 'shift_start',
        deliveryId: sc.deliveryId || null,
        targetRackId: sc.targetRackId || sc.placedRackId || null,
        homePalletRackId: sc.homePalletRackId || null,
        homePalletId: palletRec ? palletRec.palletId : (sc.homePalletId || null),
        placedOnRack: Boolean(sc.placedOnRack),
        placedRackId: sc.placedRackId || null,
        rackSlot: null,
        zoneMismatch: Boolean(sc.zoneMismatch),
        labeled: Boolean(sc.labeled),
        inventoried: Boolean(sc.inventoried),
        auditedQty: sc.auditedQty !== undefined ? sc.auditedQty : null,
        auditMismatch: Boolean(sc.auditMismatch),
        auditGroupId: sc.auditGroupId || null,
        palletCol: Number(sc.palletCol) || 0,
        targetFallY: sc.pos ? Number(sc.pos.y) || 0 : 0,
        fallVelY: 0,
        targetSlideX: sc.pos ? Number(sc.pos.x) || 0 : 0,
        targetSlideZ: sc.pos ? Number(sc.pos.z) || 0 : 0,
        depthIdx: Number(sc.depthIdx) || 0,
        linkedCount: Number(sc.linkedCount) || 1,
        linkedChainQty: Number(sc.linkedChainQty) || unitsPerCase,
        displayedLabelQty: labelQty,
        _lastChainSig: null,
        mesh: mesh
      };
      mesh.userData.backstockCaseRef = caseRec;

      if (heldId && caseRec.id === heldId) {
        caseRec.placedOnRack = false;
        caseRec.rackSlot = null;
        mesh.visible = false;
        state.cases.push(caseRec);
        showHeldCaseView(caseRec);
        return;
      }

      const targetSlot = sc.placedOnRack && sc.slotKey ? slotByKey[sc.slotKey] : null;
      if (sc.placedOnRack && targetSlot) {
        caseRec.placedOnRack = true;
        caseRec.placedRackId = targetSlot.rackId;
        caseRec.rackSlot = targetSlot;
        targetSlot.placedCases.push(caseRec);
        if (sc.pos) {
          mesh.position.set(Number(sc.pos.x) || 0, Number(sc.pos.y) || 0, Number(sc.pos.z) || 0);
        } else {
          mesh.position.set(targetSlot.centerX, targetSlot.deckY + dims.h / 2, targetSlot.centerZ);
        }
        mesh.rotation.set(0, Number(sc.rotY) || 0, 0);
        if (state.scene) state.scene.add(mesh);
      } else if (palletRec) {
        caseRec.placedOnRack = false;
        palletRec.cases.push(caseRec);
      }
      state.cases.push(caseRec);
    });

    Object.keys(state.palletStateById).forEach((pId) => {
      relayoutPalletCargo(pId);
    });
    state.shelfSlots.forEach((slot) => {
      if (slot && Array.isArray(slot.placedCases) && slot.placedCases.length > 0) {
        reflowSlotChains(slot, true);
      }
    });
    syncInventoryVisuals(state.inventoryFinalized);
    return true;
  }

  global.BackstockRacks = {
    CASE_SIZE_SPECS: CASE_SIZE_SPECS,
    OVERSTOCK_CHANCE_PER_CASE: OVERSTOCK_CHANCE_PER_CASE,
    init: init,
    resetForShift: resetForShift,
    exportState: exportState,
    importState: importState,
    advanceShift: advanceShift,
    update: update,
    spawnStartingBackstock: spawnStartingBackstock,
    spawnOverstockFromDelivery: spawnOverstockFromDelivery,
    resolveRackIdForItem: resolveRackIdForItem,
    getRackDisplayName: getRackDisplayName,
    formatSlotDesignation: formatSlotDesignation,
    isSupplyCase: isSupplyCase,
    canSlotCaseOnSteel: canSlotCaseOnSteel,
    labelCase: labelCase,
    findBackstockCaseForLabelInput: findBackstockCaseForLabelInput,
    getLabelableRaycastMeshes: () => state.cases
      .filter((c) => c && c.mesh && c.mesh.visible && c !== state.heldCase)
      .map((c) => c.mesh),
    getUnlabeledBackstockCount: () => state.cases.filter((c) => c && !c.labeled && !isSupplyCase(c)).length,
    getUnslottedOverstockCount: () => state.cases.filter((c) => c && !c.placedOnRack && !isSupplyCase(c)).length,
    getSupplyStockMap: getSupplyStockMap,
    getUnplacedSupplyCasesCount: getUnplacedSupplyCasesCount,
    applyDailySupplyUsage: applyDailySupplyUsage,
    isCarryingCase: () => Boolean(state.heldCase),
    getHeldCase: () => state.heldCase,
    canPickupCase: canPickupCase,
    pickupCase: pickupCase,
    updateGhostPreview: updateGhostPreview,
    hideGhostPreview: hideGhostPreview,
    getCurrentGhostPlacement: () => state.currentGhostPlacement,
    placeHeldCaseAtPreview: placeHeldCaseAtPreview,
    placeHeldCaseOnPallet: placeHeldCaseOnPallet,
    getPickableCaseMeshes: () => state.cases
      .filter((c) => c && c.mesh && c !== state.heldCase)
      .map((c) => c.mesh),
    getPlaceableTargetMeshes: getPlaceableRaycastMeshes,
    getInventoryRaycastMeshes: getInventoryRaycastMeshes,
    getInventoryRackCases: getInventoryRackCases,
    isInventoryEligibleRack: isInventoryEligibleRack,
    findInventoryCaseForInput: findInventoryCaseForInput,
    markCaseInventoried: markCaseInventoried,
    unmarkCaseInventoried: unmarkCaseInventoried,
    getCaseAuditInfo: getCaseAuditInfo,
    syncInventoryVisuals: syncInventoryVisuals,
    getInventorySummary: getInventorySummary,
    finalizeInventoryAudit: finalizeInventoryAudit,
    getFloorCases: () => state.cases.filter((c) => !c.placedOnRack && c !== state.heldCase),
    getPlacedCases: () => state.cases.filter((c) => c.placedOnRack),
    getAllCases: () => state.cases.slice(),
    clearAllCases: clearAllCases
  };
})(window);
