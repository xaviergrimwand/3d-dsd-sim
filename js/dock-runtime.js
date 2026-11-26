(function (global) {
  'use strict';

  let initialized = false;

  global.createCtrlPointerHoldController = function createCtrlPointerHoldController(opts) {
    const cfg = opts || {};
    const heldControlCodes = new Set();
    let holdUnlockActive = false;

    function isControlEvent(e) {
      return Boolean(e && (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.key === 'Control'));
    }

    return {
      isHoldActive() {
        return holdUnlockActive;
      },
      hasHeldControl() {
        return heldControlCodes.size > 0;
      },
      onKeyDown(e) {
        if (!isControlEvent(e)) return false;
        if (e.altKey || e.shiftKey || e.metaKey) return false;
        const codeKey = e.code || 'ControlLeft';
        if (e.repeat) return holdUnlockActive;
        heldControlCodes.add(codeKey);
        const canUnlock = typeof cfg.isLocked === 'function' && cfg.isLocked() &&
          !(typeof cfg.isBlocked === 'function' && cfg.isBlocked());
        if (canUnlock && !holdUnlockActive) {
          holdUnlockActive = true;
          if (typeof cfg.unlock === 'function') cfg.unlock();
          if (typeof cfg.onStateChange === 'function') cfg.onStateChange();
          return true;
        }
        return false;
      },
      onKeyUp(e) {
        if (!isControlEvent(e)) return false;
        heldControlCodes.delete(e.code || 'ControlLeft');
        if (!e.ctrlKey) heldControlCodes.clear();
        if (holdUnlockActive && heldControlCodes.size === 0) {
          holdUnlockActive = false;
          const blocked = typeof cfg.isBlocked === 'function' && cfg.isBlocked();
          if (!blocked && typeof cfg.relock === 'function') {
            cfg.relock();
          }
          if (typeof cfg.onStateChange === 'function') cfg.onStateChange();
          return true;
        }
        return false;
      },
      onPointerLockAcquired() {
        if (holdUnlockActive) {
          holdUnlockActive = false;
          if (typeof cfg.onStateChange === 'function') cfg.onStateChange();
        }
      },
      reset() {
        const wasActive = holdUnlockActive || heldControlCodes.size > 0;
        heldControlCodes.clear();
        holdUnlockActive = false;
        if (wasActive && typeof cfg.onStateChange === 'function') cfg.onStateChange();
      }
    };
  };

  const HUD_TARGET_SELECTOR = [
    '#command-ribbon-bg',
    '#top-clock-cluster',
    '#retro-digital-clock',
    '#hud-clock-calendar',
    '#hud-remaining-tracker',
    '#hud-remaining-legend',
    '#hitch-status-card',
    '#door-lights-panel',
    '#hud-door-lights-popup',
    '#pause-menu-btn',
    '#hud-msg-bar',
    '#hud-msg-drawer',
    '.hud-msg-toast',
    '#pending-deliveries-panel .pd-header',
    '#pending-deliveries-panel:not(.collapsed) #pending-deliveries-list',
    '#minimap-container',
    '#bottom-left-controls',
    '#lock-hint',
    '#mobile-btn-dock .touch-btn',
    '#scanner-device',
    '#printed-receipt-hud',
    '#overage-mode-pill',
    '#invoice-modal',
    '#bol-modal',
    '#terminal-modal',
    '#door-queue-modal',
    '#night-drop-panel',
    '#filing-overlay',
    '#invoice-archive-overlay',
    '#trash-receipt-modal',
    '#hand-receipt-modal',
    '#shortage-qty-modal',
    '#game-alert-modal',
    '#main-menu-overlay',
    '#pause-menu-overlay',
    '#tutorial-hud-card.active',
    '#tutorial-hub-modal.active'
  ].join(', ');

  const HUD_RECT_SELECTOR = [
    '#command-ribbon-bg',
    '#top-clock-cluster',
    '#retro-digital-clock',
    '#hud-clock-calendar',
    '#hud-remaining-tracker',
    '#hud-remaining-legend',
    '#hitch-status-card',
    '#door-lights-panel',
    '#hud-door-lights-popup',
    '#pause-menu-btn',
    '#hud-msg-bar',
    '#hud-msg-drawer',
    '.hud-msg-toast',
    '#pending-deliveries-panel .pd-header',
    '#pending-deliveries-panel:not(.collapsed) #pending-deliveries-list',
    '#minimap-container',
    '#bottom-left-controls',
    '#mobile-btn-dock .touch-btn',
    '#scanner-device',
    '#printed-receipt-hud',
    '#overage-mode-pill',
    '#tutorial-hud-card.active',
    '#tutorial-hub-modal.active'
  ].join(', ');

  global.createHudOverlayPriorityChecker = function createHudOverlayPriorityChecker(opts) {
    const cfg = opts || {};

    function isElementVisibleForHud(el) {
      if (!el || !el.getBoundingClientRect) return false;
      const doc = el.ownerDocument || document;
      const win = (doc && doc.defaultView) || global;
      if (el.closest) {
        if (el.closest('#scanner-modal-overlay:not(.active)')) return false;
        if (el.closest('#door-lights-panel:not(.beacons-open) #hud-door-lights-popup')) return false;
        if (el.closest('#retro-digital-clock:not(.calendar-open) #hud-clock-calendar')) return false;
        if (el.closest('#hud-remaining-tracker:not(.legend-open) #hud-remaining-legend')) return false;
        if (el.closest('#hud-msg-center:not(.open) #hud-msg-drawer')) return false;
        if (el.closest('#tutorial-hud-card:not(.active), #tutorial-hub-modal:not(.active)')) return false;
      }
      if (win && typeof win.getComputedStyle === 'function') {
        const st = win.getComputedStyle(el);
        if (!st || st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0) {
          return false;
        }
      }
      const rect = el.getBoundingClientRect();
      return Boolean(rect && rect.width > 0 && rect.height > 0);
    }

    function isElementOverHud(el) {
      const canvasEl = typeof cfg.getCanvas === 'function' ? cfg.getCanvas() : null;
      const containerEl = typeof cfg.getContainer === 'function' ? cfg.getContainer() : null;
      const scannerEl = typeof cfg.getScanner === 'function' ? cfg.getScanner() : null;
      const doc = (el && el.ownerDocument) || document;
      if (!el || el === canvasEl || el === containerEl || el === doc.body || el === doc.documentElement) {
        return false;
      }
      if (el.closest) {
        if (el.closest('#scanner-modal-overlay:not(.active)')) return false;
        if (el.closest('#door-lights-panel:not(.beacons-open) #hud-door-lights-popup')) return false;
        if (el.closest('#retro-digital-clock:not(.calendar-open) #hud-clock-calendar')) return false;
        if (el.closest('#hud-remaining-tracker:not(.legend-open) #hud-remaining-legend')) return false;
        if (el.closest('#hud-msg-center:not(.open) #hud-msg-drawer')) return false;
        if (el.closest('#tutorial-hud-card:not(.active), #tutorial-hub-modal:not(.active)')) return false;
      }
      if (scannerEl && (el === scannerEl || (scannerEl.contains && scannerEl.contains(el)))) {
        return true;
      }
      return Boolean(el.closest && el.closest(HUD_TARGET_SELECTOR));
    }

    function isPointOverHud(clientX, clientY) {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || clientX < 0 || clientY < 0) return false;
      const doc = (typeof cfg.getDocument === 'function' ? cfg.getDocument() : null) || document;
      if (typeof doc.elementFromPoint === 'function') {
        const hitEl = doc.elementFromPoint(clientX, clientY);
        if (isElementOverHud(hitEl)) return true;
      }
      const hudNodes = doc.querySelectorAll(HUD_RECT_SELECTOR);
      for (let i = 0; i < hudNodes.length; i++) {
        const node = hudNodes[i];
        if (!isElementVisibleForHud(node)) continue;
        const rect = node.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          return true;
        }
      }
      return false;
    }

    return {
      isElementOverHud,
      isPointOverHud
    };
  };

  global.buildDoorQueuePopupRows = function buildDoorQueuePopupRows(opts) {
    const o = opts || {};
    const sessions = Array.isArray(o.sessions) ? o.sessions : [];
    const nowMinutes = Number.isFinite(Number(o.nowMinutes)) ? Number(o.nowMinutes) : 360;
    const exiters = [];
    const waiters = [];

    sessions.forEach((s) => {
      if (!s || !s.delivery) return;
      const d = s.delivery;
      const carrier = String(d.carrier || d.vendorName || 'Driver');
      const deliveryType = String(d.type || 'sidedoor');
      const isWh = deliveryType === 'warehouse';

      if (s.state === 'WAITING_EXIT' || s.state === 'WALKING_TO_EXIT') {
        exiters.push({
          direction: 'exit',
          badgeText: 'EXIT',
          carrier: carrier,
          deliveryType: deliveryType,
          detailText: s.state === 'WAITING_EXIT' ? '' : 'EXITING',
          isWh: isWh,
          isLate: false
        });
      } else if (s.state === 'OUTSIDE_WAITING') {
        const etaMins = (Number(d.etaHour) || 6) * 60 + (Number(d.etaMinute) || 0);
        const isLate = nowMinutes > etaMins + 15;
        waiters.push({
          direction: 'enter',
          badgeText: 'ENTER',
          carrier: carrier,
          deliveryType: deliveryType,
          detailText: '',
          isWh: isWh,
          isLate: isLate,
          etaMins: etaMins
        });
      }
    });

    waiters.sort((a, b) => {
      if (a.isWh !== b.isWh) return a.isWh ? -1 : 1;
      return a.etaMins - b.etaMins;
    });

    return exiters.concat(waiters);
  };

  global.countDoorQueueSessions = function countDoorQueueSessions(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s || !s.delivery) continue;
      if (s.state === 'OUTSIDE_WAITING' || s.state === 'WAITING_EXIT' || s.state === 'WALKING_TO_EXIT') {
        total++;
      }
    }
    return total;
  };

  /**
   * Returns whether at least one outside-waiting driver/vendor exists per delivery type.
   */
  global.getSideDoorWaitingTypeFlags = function getSideDoorWaitingTypeFlags(sessions) {
    const flags = { warehouse: false, vendor_truck: false, sidedoor: false };
    if (!Array.isArray(sessions) || sessions.length === 0) return flags;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s || s.state !== 'OUTSIDE_WAITING' || !s.delivery) continue;
      const dType = s.delivery.type || 'sidedoor';
      if (Object.prototype.hasOwnProperty.call(flags, dType)) {
        flags[dType] = true;
      }
    }
    return flags;
  };

  /**
   * Unified 2D XZ collision solver covering walking, empty Electric Jack,
   * Hitched Pallets (Warehouse, Vendor Truck, and Overstock), and Truck Trailers.
   */
  global.createDockCollisionSolver = function createDockCollisionSolver(env) {
    const cfg = env || {};
    const TILE_SIZE = Number(cfg.TILE_SIZE) || 2.4;
    const ORIGIN_X = Number(cfg.ORIGIN_X);
    const ORIGIN_Z = Number(cfg.ORIGIN_Z);
    const ROWS = Number(cfg.ROWS) || 25;
    const doorZ = Number(cfg.doorZ) || 0;
    const doorWidth = Number(cfg.doorWidth) || (TILE_SIZE * 2 - 0.2);
    const playerRadius = Number(cfg.playerRadius) || 0.45;
    const jackFloorOffset = Number(cfg.jackFloorOffset) || 0.75;
    const jackPalletForkOffset = Number(cfg.jackPalletForkOffset) || 0.96;
    const palletHalfW = Number(cfg.palletHalfW) || 0.60;
    const palletHalfD = Number(cfg.palletHalfD) || 0.50;

    function clamp(v, lo, hi) {
      return v < lo ? lo : (v > hi ? hi : v);
    }

    function normalizeAngle(a) {
      return Math.atan2(Math.sin(a), Math.cos(a));
    }

    function circleIntersectsAABB(cx, cz, r, b) {
      const qx = clamp(cx, b.minX, b.maxX);
      const qz = clamp(cz, b.minZ, b.maxZ);
      const dx = cx - qx;
      const dz = cz - qz;
      return (dx * dx + dz * dz) < (r * r - 1e-9);
    }

    function circleIntersectsOBB(cx, cz, r, ox, oz, rotY, hw, hd) {
      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const dx = cx - ox;
      const dz = cz - oz;
      const lx = dx * cosR - dz * sinR;
      const lz = dx * sinR + dz * cosR;
      const qx = clamp(lx, -hw, hw);
      const qz = clamp(lz, -hd, hd);
      const ex = lx - qx;
      const ez = lz - qz;
      return (ex * ex + ez * ez) < (r * r - 1e-9);
    }

    function obbIntersectsAABB(ox, oz, rotY, hw, hd, b) {
      const bMidX = (b.minX + b.maxX) * 0.5;
      const bMidZ = (b.minZ + b.maxZ) * 0.5;
      const bHw = (b.maxX - b.minX) * 0.5;
      const bHd = (b.maxZ - b.minZ) * 0.5;
      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const absCos = Math.abs(cosR);
      const absSin = Math.abs(sinR);
      const dx = ox - bMidX;
      const dz = oz - bMidZ;

      if (Math.abs(dx) >= (hw * absCos + hd * absSin) + bHw - 1e-5) return false;
      if (Math.abs(dz) >= (hw * absSin + hd * absCos) + bHd - 1e-5) return false;

      // Local OBB X axis: (cosR, -sinR)
      const projX = Math.abs(dx * cosR - dz * sinR);
      if (projX >= hw + bHw * absCos + bHd * absSin - 1e-5) return false;

      // Local OBB Z axis: (sinR, cosR)
      const projZ = Math.abs(dx * sinR + dz * cosR);
      if (projZ >= hd + bHw * absSin + bHd * absCos - 1e-5) return false;

      return true;
    }

    function obbIntersectsOBB(ax, az, aRot, aHw, aHd, bx, bz, bRot, bHw, bHd) {
      const ca = Math.cos(aRot);
      const sa = Math.sin(aRot);
      const cb = Math.cos(bRot);
      const sb = Math.sin(bRot);
      const uxA = ca, uzA = -sa;
      const vxA = sa, vzA = ca;
      const uxB = cb, uzB = -sb;
      const vxB = sb, vzB = cb;
      const dx = bx - ax;
      const dz = bz - az;

      // Axis uA
      if (Math.abs(dx * uxA + dz * uzA) >= aHw + bHw * Math.abs(uxA * uxB + uzA * uzB) + bHd * Math.abs(uxA * vxB + uzA * vzB) - 1e-5) return false;
      // Axis vA
      if (Math.abs(dx * vxA + dz * vzA) >= aHd + bHw * Math.abs(vxA * uxB + vzA * uzB) + bHd * Math.abs(vxA * vxB + vzA * vzB) - 1e-5) return false;
      // Axis uB
      if (Math.abs(dx * uxB + dz * uzB) >= bHw + aHw * Math.abs(uxB * uxA + uzB * uzA) + aHd * Math.abs(uxB * vxA + uzB * vzA) - 1e-5) return false;
      // Axis vB
      if (Math.abs(dx * vxB + dz * vzB) >= bHd + aHw * Math.abs(vxB * uxA + vzB * uzA) + aHd * Math.abs(vxB * vxA + vzB * vzA) - 1e-5) return false;

      return true;
    }

    function pointSetOutsideWorld(minWorldX, maxWorldX, minWorldZ, maxWorldZ, dockDoors, cx, cz, r, obbs) {
      if (cx + r > maxWorldX || cx - r < minWorldX || cz - r < minWorldZ || cz + r > maxWorldZ) {
        return { hit: true, eastHit: cx + r > maxWorldX };
      }
      const outsideDockBayCheck = (px, pz) => {
        if (pz >= doorZ - 0.22) return false;
        for (let i = 0; i < dockDoors.length; i++) {
          const dd = dockDoors[i];
          if (px >= dd.worldX - TILE_SIZE + 0.02 && px <= dd.worldX + TILE_SIZE - 0.02) {
            return false;
          }
        }
        return true;
      };
      if (outsideDockBayCheck(cx, cz - r) || outsideDockBayCheck(cx - r, cz) || outsideDockBayCheck(cx + r, cz)) {
        return { hit: true, eastHit: false };
      }

      for (let i = 0; i < obbs.length; i++) {
        const o = obbs[i];
        const ca = Math.cos(o.rotY);
        const sa = Math.sin(o.rotY);
        const ux = ca * o.hw;
        const uz = -sa * o.hw;
        const vx = sa * o.hd;
        const vz = ca * o.hd;
        const cornersX = [o.x + ux + vx, o.x + ux - vx, o.x - ux + vx, o.x - ux - vx];
        const cornersZ = [o.z + uz + vz, o.z + uz - vz, o.z - uz + vz, o.z - uz - vz];
        for (let c = 0; c < 4; c++) {
          const kx = cornersX[c];
          const kz = cornersZ[c];
          if (kx > maxWorldX || kx < minWorldX || kz < minWorldZ || kz > maxWorldZ) {
            return { hit: true, eastHit: kx > maxWorldX };
          }
          if (outsideDockBayCheck(kx, kz)) {
            return { hit: true, eastHit: false };
          }
        }
      }
      return { hit: false, eastHit: false };
    }

    function collectPhysicalPallets(excludePallet) {
      const list = [];
      const palletsArr = typeof cfg.getPallets === 'function' ? (cfg.getPallets() || []) : [];
      for (let i = 0; i < palletsArr.length; i++) {
        const p = palletsArr[i];
        if (!p || p === excludePallet) continue;
        if (p.mesh && p.mesh.visible === false) continue;
        const px = p.position ? p.position.x : (Number(p.x) || 0);
        const pz = p.position ? p.position.z : (Number(p.z) || 0);
        const ry = p.mesh ? (Number(p.mesh.rotation.y) || 0) : (Number(p.rotY) || 0);
        list.push({ ref: p, x: px, z: pz, rotY: ry, hw: palletHalfW, hd: palletHalfD });
      }
      const overstockArr = typeof cfg.getOverstockPallets === 'function' ? (cfg.getOverstockPallets() || []) : [];
      for (let i = 0; i < overstockArr.length; i++) {
        const op = overstockArr[i];
        if (!op || op === excludePallet) continue;
        if (op.group && op.group.visible === false) continue;
        const px = op.group ? op.group.position.x : (Number(op.x) || 0);
        const pz = op.group ? op.group.position.z : (Number(op.z) || 0);
        const ry = op.group ? (Number(op.group.rotation.y) || 0) : (Number(op.rotY) || 0);
        const hw = (Number(op.width) || (palletHalfW * 2)) * 0.5;
        const hd = (Number(op.depth) || (palletHalfD * 2)) * 0.5;
        list.push({ ref: op, x: px, z: pz, rotY: ry, hw, hd });
      }
      return list;
    }

    function buildRigShapes(px, pz, yaw, hasElectricJack, hitchedPallet) {
      const solidObbs = [];
      const forkObbs = [];
      if (hasElectricJack) {
        const fwdX = -Math.sin(yaw);
        const fwdZ = -Math.cos(yaw);
        const jx = px + fwdX * jackFloorOffset;
        const jz = pz + fwdZ * jackFloorOffset;
        solidObbs.push({ x: jx, z: jz, rotY: yaw, hw: 0.36, hd: 0.28, kind: 'jack_head' });
        if (hitchedPallet) {
          const hpDist = jackFloorOffset + jackPalletForkOffset;
          const hw = (hitchedPallet.width ? Number(hitchedPallet.width) * 0.5 : palletHalfW);
          const hd = (hitchedPallet.depth ? Number(hitchedPallet.depth) * 0.5 : palletHalfD);
          solidObbs.push({
            x: px + fwdX * hpDist,
            z: pz + fwdZ * hpDist,
            rotY: yaw,
            hw: hw,
            hd: hd,
            kind: 'hitched_pallet'
          });
        } else {
          // Bare forks block walls/doors/trailers/racks/parked-jack, but slide into grounded pallets
          forkObbs.push({
            x: jx + fwdX * 0.88,
            z: jz + fwdZ * 0.88,
            rotY: yaw,
            hw: 0.30,
            hd: 0.58,
            kind: 'jack_forks'
          });
        }
      }
      return { solidObbs, forkObbs };
    }

    function checkPose(opts) {
      const o = opts || {};
      const px = Number(o.x) || 0;
      const pz = Number(o.z) || 0;
      const yaw = Number(o.yaw) || 0;
      const hasElectricJack = Boolean(o.hasElectricJack);
      const hitchedPallet = o.hitchedPallet || null;
      const excludePallet = o.excludePallet !== undefined ? o.excludePallet : hitchedPallet;
      const emitWarnings = Boolean(o.emitWarnings);
      const r = o.radius !== undefined ? Number(o.radius) : playerRadius;

      const dockDoors = typeof cfg.getDockDoors === 'function' ? (cfg.getDockDoors() || []) : [];
      const sideRollupDoor = typeof cfg.getSideRollupDoor === 'function' ? cfg.getSideRollupDoor() : null;
      const solidWalls = typeof cfg.getSolidWalls === 'function' ? (cfg.getSolidWalls() || []) : [];
      const parkedJack = typeof cfg.getParkedJack === 'function' ? cfg.getParkedJack() : null;

      const minWorldX = ORIGIN_X + 0.1;
      const maxWorldX = -ORIGIN_X - 0.1;
      const minWorldZ = ORIGIN_Z + 0.1;
      const maxWorldZ = ORIGIN_Z + ROWS * TILE_SIZE - 0.1;

      const { solidObbs, forkObbs } = buildRigShapes(px, pz, yaw, hasElectricJack, hitchedPallet);
      const worldObbs = solidObbs.concat(forkObbs);

      // 1. Building perimeter & outside-bay guard
      const perim = pointSetOutsideWorld(minWorldX, maxWorldX, minWorldZ, maxWorldZ, dockDoors, px, pz, r, worldObbs);
      if (perim.hit) {
        if (emitWarnings && perim.eastHit && sideRollupDoor && sideRollupDoor.isOpen) {
          const atSideDoorZ = Math.abs(pz - sideRollupDoor.worldZ) < (sideRollupDoor.width / 2);
          if (atSideDoorZ && typeof cfg.onSideDoorBlocked === 'function') {
            cfg.onSideDoorBlocked();
          }
        }
        return true;
      }

      const rigHitsBox = (b) => {
        if (r > 0 && circleIntersectsAABB(px, pz, r, b)) return true;
        for (let k = 0; k < worldObbs.length; k++) {
          const ob = worldObbs[k];
          if (obbIntersectsAABB(ob.x, ob.z, ob.rotY, ob.hw, ob.hd, b)) return true;
        }
        return false;
      };

      // 2. Dock rollup doors, empty dock ledges & docked trailer bulkheads/sidewalls
      for (let i = 0; i < dockDoors.length; i++) {
        const dd = dockDoors[i];
        const doorMinX = dd.worldX - doorWidth / 2;
        const doorMaxX = dd.worldX + doorWidth / 2;

        if (!dd.isOpen || dd.currentProgress < 0.70) {
          if (rigHitsBox({ minX: doorMinX, maxX: doorMaxX, minZ: doorZ - 0.14, maxZ: doorZ + 0.14 })) {
            return true;
          }
        } else if (!dd.hasTrailer) {
          if (rigHitsBox({ minX: doorMinX - 0.1, maxX: doorMaxX + 0.1, minZ: ORIGIN_Z, maxZ: doorZ - 0.04 })) {
            return true;
          }
        } else {
          const vLen = (dd.trailerType === 'vendor_truck') ? (6 * TILE_SIZE) : (10 * TILE_SIZE);
          if (dd.trailerDoorProgress < 0.70) {
            if (rigHitsBox({ minX: dd.worldX - TILE_SIZE, maxX: dd.worldX + TILE_SIZE, minZ: doorZ - vLen, maxZ: doorZ - 0.36 })) {
              if (emitWarnings && typeof cfg.onSealedTrailerBlocked === 'function') {
                cfg.onSealedTrailerBlocked(dd);
              }
              return true;
            }
          }
          // Trailer sidewalls & front nose bulkhead
          if (rigHitsBox({ minX: dd.worldX - TILE_SIZE, maxX: dd.worldX - TILE_SIZE + 0.14, minZ: doorZ - vLen - 0.25, maxZ: doorZ })) {
            return true;
          }
          if (rigHitsBox({ minX: dd.worldX + TILE_SIZE - 0.14, maxX: dd.worldX + TILE_SIZE, minZ: doorZ - vLen - 0.25, maxZ: doorZ })) {
            return true;
          }
          if (rigHitsBox({ minX: dd.worldX - TILE_SIZE, maxX: dd.worldX + TILE_SIZE, minZ: doorZ - vLen - 0.25, maxZ: doorZ - vLen + 0.14 })) {
            return true;
          }
          // Active dynamic temperature curtains between warehouse trailer zones
          if (dd.trailerType === 'warehouse' && Array.isArray(dd.tempCurtains)) {
            for (let ci = 0; ci < dd.tempCurtains.length; ci++) {
              const tc = dd.tempCurtains[ci];
              if (!tc || !tc.active || tc.progress >= 0.70) continue;
              if (rigHitsBox({
                minX: dd.worldX - TILE_SIZE,
                maxX: dd.worldX + TILE_SIZE,
                minZ: tc.worldZ - 0.12,
                maxZ: tc.worldZ + 0.12
              })) {
                return true;
              }
            }
          }
        }
      }

      // 3. Facility walls, concrete piers, I-beams, bollards, racks & furniture
      for (let i = 0; i < solidWalls.length; i++) {
        const b = solidWalls[i];
        if (!b || b._isOverstockPallet) continue;
        if (rigHitsBox(b)) return true;
      }

      // 4. Parked Electric Pallet Jack (when player is not holding it)
      if (!hasElectricJack && parkedJack && parkedJack.visible) {
        const rot = parkedJack.rotY || 0;
        const jSin = Math.sin(rot);
        const jCos = Math.cos(rot);
        const fCx = parkedJack.x - jSin * 0.91;
        const fCz = parkedJack.z - jCos * 0.91;
        if (r > 0) {
          if (
            circleIntersectsOBB(px, pz, r, parkedJack.x, parkedJack.z, rot, 0.36, 0.29) ||
            circleIntersectsOBB(px, pz, r, fCx, fCz, rot, 0.30, 0.61)
          ) {
            return true;
          }
        }
        for (let k = 0; k < worldObbs.length; k++) {
          const ob = worldObbs[k];
          if (
            obbIntersectsOBB(ob.x, ob.z, ob.rotY, ob.hw, ob.hd, parkedJack.x, parkedJack.z, rot, 0.36, 0.29) ||
            obbIntersectsOBB(ob.x, ob.z, ob.rotY, ob.hw, ob.hd, fCx, fCz, rot, 0.30, 0.61)
          ) {
            return true;
          }
        }
      }

      // 5. Physical Pallets (Warehouse, Vendor Truck, & Overstock - unified OBB tests)
      const physPallets = collectPhysicalPallets(excludePallet);
      for (let i = 0; i < physPallets.length; i++) {
        const pal = physPallets[i];
        if (r > 0 && circleIntersectsOBB(px, pz, r, pal.x, pal.z, pal.rotY, pal.hw, pal.hd)) {
          return true;
        }
        for (let k = 0; k < solidObbs.length; k++) {
          const ob = solidObbs[k];
          if (obbIntersectsOBB(ob.x, ob.z, ob.rotY, ob.hw, ob.hd, pal.x, pal.z, pal.rotY, pal.hw, pal.hd)) {
            return true;
          }
        }
      }

      return false;
    }

    function resolveTurn(opts) {
      const o = opts || {};
      const px = Number(o.x) || 0;
      const pz = Number(o.z) || 0;
      const curYaw = Number(o.curYaw) || 0;
      const targetYaw = Number(o.targetYaw) || 0;
      const hasElectricJack = Boolean(o.hasElectricJack);
      const hitchedPallet = o.hitchedPallet || null;

      if (!hasElectricJack && !hitchedPallet) {
        return { yaw: targetYaw, blocked: false };
      }
      const delta = normalizeAngle(targetYaw - curYaw);
      if (Math.abs(delta) < 1e-6) {
        return { yaw: targetYaw, blocked: false };
      }

      const baseOpts = { x: px, z: pz, hasElectricJack, hitchedPallet, emitWarnings: Boolean(o.emitWarnings) };
      const curBlocked = checkPose(Object.assign({ yaw: curYaw }, baseOpts));
      const steps = Math.max(1, Math.min(16, Math.ceil(Math.abs(delta) / 0.10)));

      if (!curBlocked) {
        let lastFree = curYaw;
        for (let s = 1; s <= steps; s++) {
          const testYaw = curYaw + (delta * s) / steps;
          if (checkPose(Object.assign({ yaw: testYaw }, baseOpts))) {
            let lo = lastFree;
            let hi = testYaw;
            for (let b = 0; b < 10; b++) {
              const mid = (lo + hi) * 0.5;
              if (checkPose(Object.assign({ yaw: mid }, baseOpts))) {
                hi = mid;
              } else {
                lo = mid;
              }
            }
            return { yaw: lo, blocked: true };
          }
          lastFree = testYaw;
        }
        return { yaw: targetYaw, blocked: false };
      }

      // Escape fallback: if curYaw already started intersecting (e.g. closing door/save),
      // permit turning if targetYaw clears or does not deepen overlap.
      if (!checkPose(Object.assign({ yaw: targetYaw }, baseOpts))) {
        return { yaw: targetYaw, blocked: false };
      }
      return { yaw: curYaw, blocked: true };
    }

    function canParkJackAt(jx, jz, rotY, radiusCheck) {
      const r = radiusCheck !== undefined ? Number(radiusCheck) : 0;
      const fwdX = -Math.sin(rotY);
      const fwdZ = -Math.cos(rotY);
      // Park test represents the jack placed at (jx, jz) without player behind it; synthesize virtual rig origin 0.75m back
      const virtualPx = jx - fwdX * jackFloorOffset;
      const virtualPz = jz - fwdZ * jackFloorOffset;
      if (checkPose({
        x: virtualPx,
        z: virtualPz,
        yaw: rotY,
        radius: 0,
        hasElectricJack: true,
        hitchedPallet: null,
        emitWarnings: false
      })) {
        return false;
      }
      // Also prevent bare fork tips of parked jack from sticking through grounded pallets
      const forkTipX = jx + fwdX * 0.90;
      const forkTipZ = jz + fwdZ * 0.90;
      const physPallets = collectPhysicalPallets(null);
      for (let i = 0; i < physPallets.length; i++) {
        const pal = physPallets[i];
        if (obbIntersectsOBB(forkTipX, forkTipZ, rotY, 0.30, 0.58, pal.x, pal.z, pal.rotY, pal.hw, pal.hd)) {
          return false;
        }
      }
      if (r > 0) {
        return !checkPose({
          x: jx,
          z: jz,
          yaw: rotY,
          radius: r,
          hasElectricJack: false,
          hitchedPallet: null,
          emitWarnings: false
        });
      }
      return true;
    }

    return {
      circleIntersectsAABB,
      circleIntersectsOBB,
      obbIntersectsAABB,
      obbIntersectsOBB,
      checkPose,
      resolveTurn,
      canParkJackAt,
      collectPhysicalPallets
    };
  };

  /**
   * Filters and bounds raw pointer-lock / mouse-drag look deltas so Chromium/Windows
   * pointer-recenter spikes and post-hitch event bursts cannot snap the camera ~180 degrees.
   */
  global.createPointerLookController = function createPointerLookController(opts) {
    const o = opts || {};
    const mouseSens = Number(o.mouseSens) > 0 ? Number(o.mouseSens) : 0.0022;
    const maxEventDeltaPx = Number(o.maxEventDeltaPx) > 0 ? Number(o.maxEventDeltaPx) : 450;
    const outlierEventDeltaPx = Number(o.outlierEventDeltaPx) > 0 ? Number(o.outlierEventDeltaPx) : 550;
    const lockSettleWindowMs = Number(o.lockSettleWindowMs) >= 0 ? Number(o.lockSettleWindowMs) : 120;
    const lockSettleMaxPx = Number(o.lockSettleMaxPx) > 0 ? Number(o.lockSettleMaxPx) : 160;
    const maxFrameRad = Number(o.maxFrameRad) > 0 ? Number(o.maxFrameRad) : 1.35;

    let lockAcquiredMs = -Infinity;
    let skipFirstLockedMove = false;
    let frameYawRad = 0;
    let framePitchRad = 0;
    let rejectedSpikes = 0;

    function onLockAcquired(nowMs) {
      const t = (typeof nowMs === 'number' && Number.isFinite(nowMs)) ? nowMs : performance.now();
      lockAcquiredMs = t;
      skipFirstLockedMove = true;
    }

    function onLockReleased() {
      skipFirstLockedMove = false;
      lockAcquiredMs = -Infinity;
    }

    function beginFrame() {
      frameYawRad = 0;
      framePitchRad = 0;
    }

    function processDelta(rawDx, rawDy, optsIn) {
      const p = optsIn || {};
      const dx = Number(rawDx);
      const dy = Number(rawDy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return { dYaw: 0, dPitch: 0, rejected: true };
      }
      const isLocked = Boolean(p.isLocked);
      const nowMs = (typeof p.nowMs === 'number' && Number.isFinite(p.nowMs)) ? p.nowMs : performance.now();

      if (isLocked) {
        if (skipFirstLockedMove) {
          skipFirstLockedMove = false;
          if ((nowMs - lockAcquiredMs) <= lockSettleWindowMs && (Math.abs(dx) > lockSettleMaxPx || Math.abs(dy) > lockSettleMaxPx)) {
            rejectedSpikes += 1;
            return { dYaw: 0, dPitch: 0, rejected: true };
          }
        }
        if (Math.abs(dx) > outlierEventDeltaPx || Math.abs(dy) > outlierEventDeltaPx) {
          rejectedSpikes += 1;
          return { dYaw: 0, dPitch: 0, rejected: true };
        }
      } else if (Math.abs(dx) > outlierEventDeltaPx * 1.3 || Math.abs(dy) > outlierEventDeltaPx * 1.3) {
        rejectedSpikes += 1;
        return { dYaw: 0, dPitch: 0, rejected: true };
      }

      const clampedDx = Math.max(-maxEventDeltaPx, Math.min(maxEventDeltaPx, dx));
      const clampedDy = Math.max(-maxEventDeltaPx, Math.min(maxEventDeltaPx, dy));
      let dYaw = -clampedDx * mouseSens;
      let dPitch = -clampedDy * mouseSens;

      const remYawPos = Math.max(0, maxFrameRad - frameYawRad);
      const remYawNeg = Math.min(0, -maxFrameRad - frameYawRad);
      dYaw = Math.max(remYawNeg, Math.min(remYawPos, dYaw));
      frameYawRad += dYaw;

      const remPitchPos = Math.max(0, maxFrameRad - framePitchRad);
      const remPitchNeg = Math.min(0, -maxFrameRad - framePitchRad);
      dPitch = Math.max(remPitchNeg, Math.min(remPitchPos, dPitch));
      framePitchRad += dPitch;

      return { dYaw, dPitch, rejected: false };
    }

    function getStats() {
      return { rejectedSpikes, frameYawRad, framePitchRad };
    }

    return {
      onLockAcquired,
      onLockReleased,
      beginFrame,
      processDelta,
      getStats
    };
  };

  function init3DGame(mode) {
    if (initialized) return;
    initialized = true;

    const SoundSystem = global.SoundSystem;
    const {
      COLS,
      ROWS,
      TILE_SIZE,
      ORIGIN_X,
      ORIGIN_Z,
      DOCK_LAYOUT,
      gridToWorld,
      worldToGrid,
      getTileType
    } = global.WarehouseWorld;

    if (typeof lib !== 'undefined' && lib.log) {
      lib.log('New 3D Game DSD Dock Facility initialized in ' + (mode || 'play') + ' mode');
    }

    const container = document.getElementById('game-container');
    const lockHint = document.getElementById('lock-hint');
    const alertBanner = document.getElementById('alert-banner');
    const notifyBanner = document.getElementById('notify-banner');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');
    const doorLightEls = [
      document.getElementById('door-light-1'),
      document.getElementById('door-light-2'),
      document.getElementById('door-light-3'),
      document.getElementById('door-light-4'),
      document.getElementById('door-light-sd')
    ];
    const lastDoorLightColors = ['', '', '', '', ''];
    const stagedCounter = document.getElementById('staged-counter');
    const hitchStatusCard = document.getElementById('hitch-status-card');
    const hitchPalletName = document.getElementById('hitch-pallet-name');
    const deliveryHudCard = document.getElementById('delivery-hud-card');
    const deliveryHudTitle = document.getElementById('delivery-hud-title');
    const scannerModalOverlay = document.getElementById('scanner-modal-overlay');
    const scannerDevice = document.getElementById('scanner-device');
    const scannerLaserLens = document.getElementById('scanner-laser-lens');
    const scannerLcd = document.getElementById('scanner-lcd');
    const keyPwr = document.getElementById('key-pwr');
    const keyEnt = document.getElementById('key-ent');
    let gamePhase = 1; // 1: Dock & Pallet Staging, 2: Pallet & Item Audit / PO Reconciliation

    const terminalModal = document.getElementById('terminal-modal');
    const closeTerminalBtn = document.getElementById('close-terminal-btn');

    const invoiceModal = document.getElementById('invoice-modal');
    const closeInvoiceBtn = document.getElementById('close-invoice-btn');
    const btnSignInvoice = document.getElementById('btn-sign-invoice');
    const btnInvTemp = document.getElementById('btn-inv-temp');
    const btnInvShort = document.getElementById('btn-inv-short');
    const btnInvOver = document.getElementById('btn-inv-over');
    const btnInvRefuse = document.getElementById('btn-inv-refuse');
    const invCarrierTitle = document.getElementById('inv-carrier-title');
    const invSubtitle = document.getElementById('inv-subtitle');
    const invVendorNum = document.getElementById('inv-vendor-num');
    const invDeptNum = document.getElementById('inv-dept-num');
    const invDocLbl = document.getElementById('inv-doc-lbl');
    const invDocNum = document.getElementById('inv-doc-num');
    const invReceiptNum = document.getElementById('inv-receipt-num');
    const invCreditReceiptPill = document.getElementById('inv-credit-receipt-pill');
    const invCreditReceiptNum = document.getElementById('inv-credit-receipt-num');
    const invDocTabs = document.getElementById('inv-doc-tabs');
    const invDeliveryDate = document.getElementById('inv-delivery-date');
    const invSealStatus = document.getElementById('inv-seal-status');
    const invCargoTemp = document.getElementById('inv-cargo-temp');
    const invItemsBody = document.getElementById('inv-items-body');
    const invTotalUnits = document.getElementById('inv-total-units');
    const invTotalCost = document.getElementById('inv-total-cost');
    const invDriverSig = document.getElementById('inv-driver-sig');
    const invReceiverSig = document.getElementById('inv-receiver-sig');

    const mobileControls = document.getElementById('mobile-controls');
    const touchWalkZone = document.getElementById('touch-walk-zone');
    const joystickZone = document.getElementById('joystick-zone');
    const joystickKnob = document.getElementById('joystick-knob');
    const touchLookZone = document.getElementById('touch-look-zone');
    const mobileBtnDock = document.getElementById('mobile-btn-dock');
    const btnTouchAction = document.getElementById('btn-touch-action');
    const btnTouchDoor = document.getElementById('btn-touch-door');
    const btnTouchCaseScan = document.getElementById('btn-touch-case-scan');
    const btnTouchScan = document.getElementById('btn-touch-scan');

    let isTouchDevice = ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      (typeof lib !== 'undefined' && lib.shouldUseTouchControls && lib.shouldUseTouchControls());
    let usingTouchAim = isTouchDevice;
    let lastTouchInteractionMs = 0;

    function activateTouchControls() {
      isTouchDevice = true;
      usingTouchAim = true;
      lastTouchInteractionMs = Date.now();
      if (joystickZone) joystickZone.style.display = 'block';
      if (touchWalkZone) touchWalkZone.style.display = 'block';
      if (touchLookZone) touchLookZone.style.display = 'block';
      if (mobileControls) mobileControls.style.display = 'block';
      if (lockHint) lockHint.style.display = 'none';
    }

    if (isTouchDevice) {
      activateTouchControls();
    }

    window.addEventListener('touchstart', () => {
      lastTouchInteractionMs = Date.now();
      if (!isTouchDevice) {
        activateTouchControls();
      } else {
        usingTouchAim = true;
      }
    }, { passive: true });


    const uiState = {
      scannerModalOpen: false,
      invoiceModalOpen: false,
      bolModalOpen: false,
      terminalModalOpen: false,
      doorQueueModalOpen: false,
      shortageMode: false,
      shortageModalOpen: false,
      alertModalOpen: false,
      overageDeliveryId: null,
      currentInvoiceTab: 'invoice',
      hoveredPhysicalBox: null,
      hoveredBoxMesh: null
    };

    // --- Three.js Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111622);

    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

    const GFX_STORAGE_KEY = 'dsd_sim_gfx_v1';
    const gfxSettings = { quality: 'balanced', showFps: false };
    try {
      const savedGfx = global.localStorage && global.localStorage.getItem(GFX_STORAGE_KEY);
      if (savedGfx) {
        const parsedGfx = JSON.parse(savedGfx);
        if (parsedGfx && ['fast', 'balanced', 'high'].includes(parsedGfx.quality)) {
          gfxSettings.quality = parsedGfx.quality;
        }
        if (parsedGfx && typeof parsedGfx.showFps === 'boolean') {
          gfxSettings.showFps = parsedGfx.showFps;
        }
      }
    } catch (_) { }

    function saveGfxSettings() {
      try {
        if (global.localStorage) {
          global.localStorage.setItem(GFX_STORAGE_KEY, JSON.stringify(gfxSettings));
        }
      } catch (_) { }
    }

    function getTargetPixelRatio() {
      const dpr = window.devicePixelRatio || 1;
      if (gfxSettings.quality === 'fast') return 1;
      if (gfxSettings.quality === 'high') return Math.min(dpr, 1.5);
      return Math.min(dpr, 1.25);
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: gfxSettings.quality !== 'fast',
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(getTargetPixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    const liveFpsEl = document.createElement('div');
    liveFpsEl.id = 'live-fps-hud';
    liveFpsEl.style.display = gfxSettings.showFps ? 'block' : 'none';
    container.appendChild(liveFpsEl);

    const fpsMetrics = { fps: 0, avgMs: 16.7 };
    let fpsFrameCount = 0;
    let fpsWorkAccumMs = 0;
    let fpsWindowStartMs = performance.now();

    global.DSDGraphics = {
      getSettings: () => Object.assign({}, gfxSettings),
      getMetrics: () => Object.assign({}, fpsMetrics),
      setQuality: (q) => {
        if (!['fast', 'balanced', 'high'].includes(q)) return gfxSettings;
        gfxSettings.quality = q;
        saveGfxSettings();
        renderer.setPixelRatio(getTargetPixelRatio());
        renderer.setSize(window.innerWidth, window.innerHeight);
        return gfxSettings;
      },
      cycleQuality: () => {
        const order = ['balanced', 'fast', 'high'];
        const next = order[(order.indexOf(gfxSettings.quality) + 1) % order.length];
        return global.DSDGraphics.setQuality(next);
      },
      toggleFpsHud: () => {
        gfxSettings.showFps = !gfxSettings.showFps;
        saveGfxSettings();
        liveFpsEl.style.display = gfxSettings.showFps ? 'block' : 'none';
        return gfxSettings.showFps;
      }
    };

    const world = global.WarehouseWorld.buildFacilityScene(scene, {
      onOpenTerminal: () => openTerminal(),
      getTerminalModalOpen: () => uiState.terminalModalOpen,
      getDeliverySystem: () => DeliverySystem,
      onHitchPallet: (palletObj) => hitchPallet(palletObj),
      onPunchOutTimeclock: () => {
        if (window.DSDGame && typeof window.DSDGame.punchOutAtTimeclock === 'function') {
          window.DSDGame.punchOutAtTimeclock();
        }
      },
      showAlert: (...args) => showAlert(...args),
      showNotification: (...args) => showNotification(...args)
    });

    const {
      solidWalls,
      interactibles,
      dockDoors,
      sideRollupDoor,
      coldDoors,
      steelRacks,
      overstockPallets,
      recallCart,
      doorZ,
      doorWidth,
      doorHeight,
      DOCK_DOOR_DURATION,
      SIDE_DOOR_DURATION,
      topDrawerGroup,
      TOP_DRAWER_OPEN_X,
      drawerState,
      keyboard,
      invoicePaper,
      wallClock,
      hallwayTimeclock,
      batteryCharger,
      crtScreen,
      triggerPrinterPrint,
      syncPrinterTrayVisual
    } = world;

    function syncCrtMonitorDisplay(clockSnap) {
      if (!crtScreen || typeof crtScreen.draw !== 'function') return;
      const snap = clockSnap || (window.ShiftClock ? window.ShiftClock.getTimeSnapshot() : null);
      const summary = (window.DSDReceipts && typeof window.DSDReceipts.getTerminalSummarySnapshot === 'function')
        ? window.DSDReceipts.getTerminalSummarySnapshot()
        : {};
      crtScreen.draw({
        dateLabel: snap ? snap.dateLabel : 'FEB 1, 1996',
        timeLabel: snap ? snap.formatted12h : '6:00 AM',
        initialCount: summary.initialCount || 0,
        finalCount: summary.finalCount || 0,
        activeCount: summary.activeCount || 0,
        vendorTruckCount: summary.vendorTruckCount || 0,
        sideDoorCount: summary.sideDoorCount || 0,
        whTrucks: summary.whTrucks || [],
        recallCount: summary.recallCount || 0,
        shortageCount: summary.shortageCount || 0,
        overageCount: summary.overageCount || 0,
        missingCount: summary.missingCount || 0,
        totalUnhandled: summary.totalUnhandled || 0
      });
    }

    const models = global.WarehouseModels.createController({
      scene,
      camera,
      world,
      hooks: {
        onHitchPallet: (palletObj) => hitchPallet(palletObj),
        onClearHitchedPallet: (palletObj) => {
          if (player.hitchedPallet === palletObj) {
            player.hitchedPallet = null;
            if (typeof hitchStatusCard !== 'undefined' && hitchStatusCard) {
              hitchStatusCard.style.display = 'none';
            }
          }
        },
        onTakeElectricJack: () => takeElectricJack(),
        getDeliverySystem: () => DeliverySystem
      }
    });

    const {
      pallets,
      createPallet3D,
      removePallet3D,
      electricJackWorld,
      electricJackActiveFloor,
      electricJackViewmodel,
      syncDeliveryBoxesVisuals,
      getActiveDeliveryBoxMeshes
    } = models;

    const deliveryCtrl = global.WarehouseDelivery.createController({
      scene,
      world,
      models,
      uiState,
      dom: {
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
      },
      hooks: {
        getPlayer: () => player,
        showAlert: (...args) => showAlert(...args),
        showPopupModal: (...args) => showPopupModal(...args),
        showNotification: (...args) => showNotification(...args),
        updateLockHintDisplay: () => updateLockHintDisplay(),
        syncPhase2ContainerClasses: () => syncPhase2ContainerClasses(),
        updateStagedCounter: () => updateStagedCounter(),
        toggleScanner: () => toggleScanner()
      }
    });

    const {
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
    } = deliveryCtrl;
    global.DeliverySystem = DeliverySystem;

    // --- PLAYER STATE & CONTROLS ---
    const PLAYER_SPAWN = {
      x: 8.60,
      y: 1.65,
      z: ORIGIN_Z + 23 * TILE_SIZE + 2.35,
      yaw: -Math.PI * 0.36
    };
    const player = {
      position: new THREE.Vector3(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z),
      yaw: PLAYER_SPAWN.yaw,
      pitch: 0,
      radius: 0.45,
      speed: 4.8,
      hitchedPallet: null,
      hasElectricJack: false,
      scannerActive: false
    };

    let jackBattery = 100;
    let jackLowBatteryWarned = false;
    let jackDockedAtCharger = true;
    let lastJackGaugeSyncMs = -1;

    function syncElectricJackBatteryVisuals(nowMs, forceSync) {
      const nowTick = nowMs || performance.now();
      if (!forceSync && lastJackGaugeSyncMs >= 0 && (nowTick - lastJackGaugeSyncMs) < 160) {
        return;
      }
      lastJackGaugeSyncMs = nowTick;
      if (electricJackViewmodel && electricJackViewmodel.visible && typeof electricJackViewmodel.updateBatteryGauge === 'function') {
        electricJackViewmodel.updateBatteryGauge(jackBattery);
      }
      if (electricJackWorld && electricJackWorld.visible && typeof electricJackWorld.updateBatteryGauge === 'function') {
        electricJackWorld.updateBatteryGauge(jackBattery);
      }
      if (batteryCharger) {
        const blinkOn = Math.floor(nowTick / 550) % 2 === 0;
        batteryCharger.update({
          docked: jackDockedAtCharger,
          batteryPct: jackDockedAtCharger ? jackBattery : 0,
          blinkOn
        });
      }
    }

    const keys = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };

    let isPointerLocked = false;
    let isMouseDragging = false;
    let lastMousePos = { x: 0, y: 0 };
    let mouseDownPos = { x: 0, y: 0 };
    let mouseDragMoved = 0;
    const pointerNDC = new THREE.Vector2(0, 0);
    const CENTER_AIM_NDC = { x: 0, y: 0 };
    const lastPointerClient = { x: -1, y: -1 };
    let pointerOverUiOverlay = false;

    const mouseSens = 0.0022;

    function updatePointerNDC(clientX, clientY) {
      pointerNDC.x = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerNDC.y = -(clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    }

    const hudOverlayPriority = global.createHudOverlayPriorityChecker({
      getCanvas: () => renderer && renderer.domElement,
      getContainer: () => container,
      getScanner: () => scannerDevice,
      getDocument: () => document
    });

    function isElementOverOverlayUi(el) {
      return hudOverlayPriority.isElementOverHud(el);
    }

    let lastHudPointCheckMs = -Infinity;
    let lastHudPointCheckX = -999;
    let lastHudPointCheckY = -999;
    let lastHudPointOver = false;

    function isPointerCoveredByUiOverlay() {
      if (isPointerLocked || usingTouchAim || isTouchDevice) return false;
      if (pointerOverUiOverlay) return true;
      const cx = lastPointerClient.x;
      const cy = lastPointerClient.y;
      if (cx >= 0 && cy >= 0) {
        const nowMs = performance.now();
        if (cx === lastHudPointCheckX && cy === lastHudPointCheckY && (nowMs - lastHudPointCheckMs) < 48) {
          return lastHudPointOver;
        }
        lastHudPointCheckX = cx;
        lastHudPointCheckY = cy;
        lastHudPointCheckMs = nowMs;
        lastHudPointOver = hudOverlayPriority.isPointOverHud(cx, cy);
        if (lastHudPointOver) return true;
      }
      return false;
    }

    function getAimNDC() {
      return (isPointerLocked || usingTouchAim) ? CENTER_AIM_NDC : pointerNDC;
    }

    function updateLockHintDisplay() {
      if (isPointerLocked) {
        lockHint.classList.add('locked');
        lockHint.textContent = uiState.overageDeliveryId
          ? 'Overage Flag Mode: Click case to flag · Hold Ctrl / Esc to unlock'
          : 'Cursor Locked (Hold Ctrl or Esc to unlock)';
      } else if (ctrlPointerHold && ctrlPointerHold.isHoldActive()) {
        lockHint.classList.remove('locked');
        lockHint.textContent = 'Ctrl Held: Cursor Unlocked (Release Ctrl to relock)';
      } else {
        lockHint.classList.remove('locked');
        if (uiState.overageDeliveryId) {
          lockHint.textContent = 'Drag to pan · Click case to flag OVERAGE · Click here to lock look';
        } else {
          lockHint.textContent = (uiState.scannerModalOpen || uiState.invoiceModalOpen)
            ? 'Drag to pan · Click box to scan · Click here to lock look'
            : 'Click to lock mouse';
        }
      }
    }

    function isPhase2ModalOpen() {
      return Boolean(window.DSDReceipts && typeof window.DSDReceipts.isPhase2ModalOpen === 'function' && window.DSDReceipts.isPhase2ModalOpen());
    }

    function isBlockingModalOpen() {
      const tutHubOpen = Boolean(window.DSDTutorial && typeof window.DSDTutorial.isHubOpen === 'function' && window.DSDTutorial.isHubOpen());
      return Boolean(uiState.alertModalOpen || uiState.terminalModalOpen || uiState.doorQueueModalOpen || uiState.bolModalOpen || tutHubOpen || isPhase2ModalOpen() || (window.DSDGame && window.DSDGame.isModalOpen()));
    }

    function syncNightDropToolButtons() {
      const scanBtn = document.getElementById('nd-key-scanner-btn');
      const termBtn = document.getElementById('nd-key-terminal-btn');
      if (scanBtn) {
        scanBtn.classList.toggle('is-active', Boolean(uiState.scannerModalOpen));
      }
      if (termBtn) {
        termBtn.classList.toggle('is-active', Boolean(uiState.terminalModalOpen));
      }
    }

    function syncPhase2ContainerClasses() {
      const p2Open = isPhase2ModalOpen() || uiState.doorQueueModalOpen;
      container.classList.toggle('phase2-open', p2Open);
      const ndPanel = document.getElementById('night-drop-panel');
      const ndVisible = Boolean(ndPanel && ndPanel.style.display === 'flex');
      const dockTerm = Boolean(uiState.terminalModalOpen && ndVisible);
      const dockScan = Boolean(uiState.scannerModalOpen && !uiState.terminalModalOpen && ndVisible);
      container.classList.toggle('nightdrop-docked', dockTerm);
      container.classList.toggle('nightdrop-scanner-docked', dockScan);
      if (ndPanel) {
        ndPanel.classList.toggle('docked-terminal', dockTerm);
        ndPanel.classList.toggle('docked-scanner', dockScan);
      }
      syncNightDropToolButtons();
    }

    function isCarryingBackstockCase() {
      return Boolean(window.BackstockRacks && typeof window.BackstockRacks.isCarryingCase === 'function' && window.BackstockRacks.isCarryingCase());
    }

    function isHoldingClaimsItem() {
      return Boolean(window.ClaimsTotes && typeof window.ClaimsTotes.isHoldingItem === 'function' && window.ClaimsTotes.isHoldingItem());
    }

    function isHoldingRecallTote() {
      return Boolean(window.ClaimsTotes && typeof window.ClaimsTotes.isHoldingRecallTote === 'function' && window.ClaimsTotes.isHoldingRecallTote());
    }

    function isArrangingRecallItem() {
      return Boolean(window.ClaimsTotes && typeof window.ClaimsTotes.isArrangingRecallItem === 'function' && window.ClaimsTotes.isArrangingRecallItem());
    }

    function handleClaimsToteInteract(fromPointerClick, clientX, clientY) {
      if (!window.ClaimsTotes) return false;
      if (isBlockingModalOpen() || uiState.invoiceModalOpen || uiState.overageDeliveryId) return false;
      if (isCarryingBackstockCase()) return false;

      if (fromPointerClick && !isPointerLocked) {
        updatePointerNDC(clientX, clientY);
      }
      const rayNDC = (isPointerLocked || !fromPointerClick) ? { x: 0, y: 0 } : pointerNDC;
      interactRaycaster.setFromCamera(rayNDC, camera);
      interactRaycaster.far = 4.6;

      // 0. If moving a single recalled item to rearrange on top shelf, place it back at hovered top-shelf spot
      if (isArrangingRecallItem()) {
        const preview = (typeof window.ClaimsTotes.updateRecallArrangePreview === 'function')
          ? window.ClaimsTotes.updateRecallArrangePreview(interactRaycaster)
          : null;
        if (preview && preview.valid) {
          const placed = window.ClaimsTotes.placeArrangedRecallItem(preview);
          if (placed && placed.ok) {
            SoundSystem.playDropSound();
            return true;
          }
        }
        return !fromPointerClick;
      }

      // 1A. If holding the small gray Recall Tote, collect top-shelf items one-by-one, stow back on bottom shelf, or dump at disposal
      if (isHoldingRecallTote()) {
        // Check top shelf recalled items first
        const topItemMeshes = (typeof window.ClaimsTotes.getRecallTopItemMeshes === 'function')
          ? window.ClaimsTotes.getRecallTopItemMeshes()
          : [];
        const botDockMeshes = (typeof window.ClaimsTotes.getRecallBottomDockHitMeshes === 'function')
          ? window.ClaimsTotes.getRecallBottomDockHitMeshes()
          : [];
        const recMeshes = (typeof window.ClaimsTotes.getReceptacleHitMeshes === 'function')
          ? window.ClaimsTotes.getReceptacleHitMeshes()
          : [];

        const topHits = topItemMeshes.length > 0 ? interactRaycaster.intersectObjects(topItemMeshes, false) : [];
        const dockHits = botDockMeshes.length > 0 ? interactRaycaster.intersectObjects(botDockMeshes, false) : [];
        const recHits = recMeshes.length > 0 ? interactRaycaster.intersectObjects(recMeshes, false) : [];

        const bestTop = topHits.length > 0 ? topHits[0].distance : Infinity;
        const bestDock = dockHits.length > 0 ? dockHits[0].distance : Infinity;
        const bestRec = recHits.length > 0 ? recHits[0].distance : Infinity;

        if (bestTop <= bestDock && bestTop <= bestRec && topHits.length > 0 && topHits[0].object.userData && topHits[0].object.userData.recallItemRef) {
          const recItem = topHits[0].object.userData.recallItemRef;
          const res = window.ClaimsTotes.collectRecallItemIntoTote(recItem);
          if (res && res.ok) {
            SoundSystem.playButtonClick();
            if (res.allCollected) {
              const rs = window.ClaimsTotes.getRecallState();
              showNotification(`✓ Top shelf cleared — Carry Recall Tote to ${rs.correctBinLabel}!`, 3400);
            }
            return true;
          }
        }

        if (bestDock < bestRec && dockHits.length > 0) {
          const docked = window.ClaimsTotes.dockRecallToteOnBottomShelf();
          if (docked && docked.ok) {
            SoundSystem.playDropSound();
            if (uiState.terminalModalOpen && window.DSDReceipts && typeof window.DSDReceipts.renderTerminalUI === 'function') {
              window.DSDReceipts.renderTerminalUI();
            }
            return true;
          }
        }

        if (recHits.length > 0 && recHits[0].object && recHits[0].object.userData && recHits[0].object.userData.claimsReceptacle) {
          const recMeta = recHits[0].object.userData.claimsReceptacle;
          const dropRes = window.ClaimsTotes.dropRecallToteIntoReceptacle(recMeta.id);
          if (dropRes && !dropRes.ok && dropRes.reason === 'items_remaining_on_cart') {
            SoundSystem.playErrorBuzzer();
            showNotification('[[ico:claim]] Finish collecting all recalled units off the top shelf into the tote first!', 'high');
            return true;
          }
          if (dropRes && dropRes.ok) {
            if (!dropRes.isCorrect) {
              SoundSystem.playErrorBuzzer();
              const ptsTxt = dropRes.penaltyPoints ? ` (-${dropRes.penaltyPoints} pts)` : '';
              showNotification(`[[ico:claim]] Wrong container! "${dropRes.productName}" goes in ${dropRes.correctLabel}.${ptsTxt}`, 'critical');
            } else {
              SoundSystem.playSuccessChime();
              showNotification(`✓ Disposed "${dropRes.productName}" into ${dropRes.placedLabel}! Enter counted total on Terminal [4].`, 'low');
              if (uiState.terminalModalOpen && window.DSDReceipts && typeof window.DSDReceipts.renderTerminalUI === 'function') {
                window.DSDReceipts.renderTerminalUI();
              }
            }
            return true;
          }
        }
        return false;
      }

      // 1. If holding a scanned damaged item, place it into the targeted receptacle or Red Credit Tote
      if (isHoldingClaimsItem()) {
        const recMeshes = (typeof window.ClaimsTotes.getReceptacleHitMeshes === 'function')
          ? window.ClaimsTotes.getReceptacleHitMeshes()
          : [];
        if (recMeshes.length > 0) {
          const rHits = interactRaycaster.intersectObjects(recMeshes, false);
          if (rHits.length > 0 && rHits[0].object && rHits[0].object.userData && rHits[0].object.userData.claimsReceptacle) {
            const recMeta = rHits[0].object.userData.claimsReceptacle;
            const dropRes = window.ClaimsTotes.dropHeldItemIntoReceptacle(recMeta.id);
            if (dropRes && dropRes.ok) {
              if (!dropRes.isCorrect) {
                SoundSystem.playErrorBuzzer();
                const ptsTxt = dropRes.penaltyPoints ? ` (-${dropRes.penaltyPoints} pts)` : ' (Logged error)';
                showNotification(`[[ico:claim]] Wrong receptacle! ${dropRes.item.name} belongs in ${dropRes.correctLabel}.${ptsTxt}`, 'critical');
              } else if (dropRes.placedIn === 'vendor_credit') {
                SoundSystem.playSuccessChime();
              } else if (dropRes.placedIn === 'donate' || dropRes.placedIn === 'organics' || dropRes.placedIn === 'hazwaste') {
                SoundSystem.playSuccessChime();
              } else {
                SoundSystem.playDropSound();
              }
              if (dropRes.allDone) {
                setTimeout(() => {
                  SoundSystem.playSuccessChime();
                  showNotification('[[ico:trophy]] All Claims processed! (+400 pts)', 'status');
                }, 450);
              }
              return true;
            }
          }
        }
        return false;
      }

      // 2. Check Recall Top Items, Small Recall Tote, and open claims tote items
      const recallItemMeshes = (typeof window.ClaimsTotes.getRecallTopItemMeshes === 'function')
        ? window.ClaimsTotes.getRecallTopItemMeshes()
        : [];
      const recallToteMeshes = (typeof window.ClaimsTotes.getRecallToteHitMeshes === 'function')
        ? window.ClaimsTotes.getRecallToteHitMeshes()
        : [];
      const openItemMeshes = (typeof window.ClaimsTotes.getOpenToteItemMeshes === 'function')
        ? window.ClaimsTotes.getOpenToteItemMeshes()
        : [];
      const toteMeshes = window.ClaimsTotes.getInteractableToteMeshes();

      const rItemHits = recallItemMeshes.length > 0 ? interactRaycaster.intersectObjects(recallItemMeshes, false) : [];
      const rToteHits = recallToteMeshes.length > 0 ? interactRaycaster.intersectObjects(recallToteMeshes, false) : [];
      const itemHits = openItemMeshes.length > 0 ? interactRaycaster.intersectObjects(openItemMeshes, false) : [];
      const toteHits = (toteMeshes && toteMeshes.length > 0) ? interactRaycaster.intersectObjects(toteMeshes, false) : [];

      const bestRItemDist = rItemHits.length > 0 ? rItemHits[0].distance : Infinity;
      const bestRToteDist = rToteHits.length > 0 ? rToteHits[0].distance : Infinity;
      const bestItemDist = itemHits.length > 0 ? itemHits[0].distance : Infinity;
      const bestToteDist = toteHits.length > 0 ? toteHits[0].distance : Infinity;

      if (bestRItemDist <= bestRToteDist && bestRItemDist <= bestItemDist && bestRItemDist <= bestToteDist && rItemHits.length > 0) {
        if (player.hasElectricJack) {
          SoundSystem.playErrorBuzzer();
          showAlert('[[ico:claim]] Park the Electric Pallet Jack [Space] before handling recalled items!');
          return true;
        }
        const recItem = rItemHits[0].object && rItemHits[0].object.userData ? rItemHits[0].object.userData.recallItemRef : null;
        if (recItem) {
          const picked = window.ClaimsTotes.pickupRecallItemToArrange(recItem);
          if (picked && picked.ok) {
            SoundSystem.playButtonClick();
          }
          return true;
        }
      }

      if (bestRToteDist <= bestItemDist && bestRToteDist <= bestToteDist && rToteHits.length > 0) {
        if (player.hasElectricJack) {
          SoundSystem.playErrorBuzzer();
          showAlert('[[ico:claim]] Park the Electric Pallet Jack [Space] before taking the Recall Tote!');
          return true;
        }
        const pickedTote = window.ClaimsTotes.pickupRecallTote();
        if (pickedTote && pickedTote.ok) {
          SoundSystem.playButtonClick();
          showNotification(`[[ico:tote]] Carrying Recall Tote — Collect all "${pickedTote.productName}" off the top shelf, then take to ${pickedTote.correctBinLabel}.`, 3800);
          if (uiState.terminalModalOpen && window.DSDReceipts && typeof window.DSDReceipts.renderTerminalUI === 'function') {
            window.DSDReceipts.renderTerminalUI();
          }
        }
        return true;
      }

      if (bestItemDist <= bestToteDist && itemHits.length > 0) {
        const itemRec = itemHits[0].object && itemHits[0].object.userData ? itemHits[0].object.userData.claimsItemRef : null;
        if (itemRec) {
          if (player.hasElectricJack) {
            SoundSystem.playErrorBuzzer();
            showAlert('[[ico:claim]] Park the Electric Pallet Jack [Space] before picking up claims items!');
            return true;
          }
          if (!itemRec.scannerConfirmed) {
            openScanner({ screen: 'damage', claimItem: itemRec });
            return true;
          }
          const picked = window.ClaimsTotes.pickupItem(itemRec);
          if (picked && picked.ok) {
            SoundSystem.playButtonClick();
          }
          return true;
        }
      }

      if (toteHits.length === 0) {
        if (typeof window.ClaimsTotes.getReceptacleHitMeshes === 'function') {
          const floorMeshes = window.ClaimsTotes.getReceptacleHitMeshes()
            .filter((m) => m && m.userData && m.userData.claimsReceptacle && !m.userData.claimsReceptacle.toteRec);
          if (floorMeshes.length > 0) {
            const fHits = interactRaycaster.intersectObjects(floorMeshes, false);
            if (fHits.length > 0 && fHits[0].object && fHits[0].object.userData && fHits[0].object.userData.claimsReceptacle) {
              const rec = fHits[0].object.userData.claimsReceptacle;
              SoundSystem.playErrorBuzzer();
              showNotification(`[[ico:ban]] Hold a confirmed claims item first before placing into ${rec.label || 'Receptacle'}.`, 'medium');
              return true;
            }
          }
        }
        return false;
      }

      const tote = toteHits[0].object && toteHits[0].object.userData ? toteHits[0].object.userData.claimsToteRef : null;
      if (!tote) return false;

      if (tote.isRed) {
        SoundSystem.playErrorBuzzer();
        showNotification('[[ico:statusDotRed]] Credit Tote stays upright — credits are stored there until the vendor\'s next delivery.', 'high');
        return true;
      }

      const res = window.ClaimsTotes.toggleToteOpen(tote);
      if (!res || !res.ok) {
        SoundSystem.playErrorBuzzer();
        return true;
      }

      if (res.isOpen) {
        SoundSystem.playButtonClick();
      } else {
        SoundSystem.playDropSound();
      }
      return true;
    }

    function handleBackstockInteract(fromPointerClick, clientX, clientY) {
      if (!window.BackstockRacks) return false;
      if (isBlockingModalOpen() || uiState.invoiceModalOpen || uiState.overageDeliveryId) return false;
      if (isHoldingClaimsItem() || isHoldingRecallTote() || isArrangingRecallItem()) return false;

      if (fromPointerClick && !isPointerLocked) {
        updatePointerNDC(clientX, clientY);
      }
      const rayNDC = (isPointerLocked || !fromPointerClick) ? { x: 0, y: 0 } : pointerNDC;

      if (isCarryingBackstockCase()) {
        interactRaycaster.setFromCamera(rayNDC, camera);
        interactRaycaster.far = 5.2;
        const preview = window.BackstockRacks.updateGhostPreview(interactRaycaster);
        if (preview) {
          if (!preview.valid) {
            SoundSystem.playErrorBuzzer();
            showAlert(`[[ico:claim]] ${preview.reason || 'Cannot place case here!'}`);
            return true;
          }
          const res = window.BackstockRacks.placeHeldCaseAtPreview(preview);
          if (res) {
            SoundSystem.playDropSound();
            if (preview.type !== 'pallet' && preview.slot) {
              if (
                preview.slot.rackId === 'claims_steel' &&
                typeof window.BackstockRacks.isSupplyCase === 'function' &&
                window.BackstockRacks.isSupplyCase(res.caseRec) &&
                typeof window.BackstockRacks.getUnplacedSupplyCasesCount === 'function' &&
                window.BackstockRacks.getUnplacedSupplyCasesCount() === 0
              ) {
                if (window.ShiftStats) window.ShiftStats.setFlag('suppliesCompleted', true);
                showNotification('✓ All Dept 60 supplies stocked on Claims Steel!', 'status');
              }
            }
            return true;
          }
        }
        return !fromPointerClick;
      }

      // Picking up a backstock case from floor pallet or shelf
      const caseMeshes = window.BackstockRacks.getPickableCaseMeshes();
      if (caseMeshes.length === 0) return false;

      interactRaycaster.setFromCamera(rayNDC, camera);
      interactRaycaster.far = 4.6;
      const hits = interactRaycaster.intersectObjects(caseMeshes, false);
      if (hits.length === 0) return false;

      const caseRec = hits[0].object && hits[0].object.userData ? hits[0].object.userData.backstockCaseRef : null;
      if (!caseRec) return false;

      if (player.hasElectricJack) {
        SoundSystem.playErrorBuzzer();
        showAlert('[[ico:claim]] Park the Electric Pallet Jack [Space] before picking up cases!');
        return true;
      }

      if (typeof window.BackstockRacks.canPickupCase === 'function') {
        const pickCheck = window.BackstockRacks.canPickupCase(caseRec);
        if (pickCheck && !pickCheck.ok) {
          SoundSystem.playErrorBuzzer();
          showAlert(`[[ico:claim]] ${pickCheck.reason || 'Pull top cases before removing bottom cases'}`);
          return true;
        }
      }

      const picked = window.BackstockRacks.pickupCase(caseRec);
      if (!picked) {
        SoundSystem.playErrorBuzzer();
        return true;
      }
      SoundSystem.playButtonClick();
      return true;
    }

    function handleDirectBoxClick(clientX, clientY) {
      if (isCarryingBackstockCase() || isHoldingClaimsItem() || isHoldingRecallTote() || isArrangingRecallItem()) return false;
      if (isBlockingModalOpen()) return false;
      if (isPointerLocked && !uiState.scannerModalOpen && !uiState.invoiceModalOpen && !uiState.overageDeliveryId) return false;

      if (!isPointerLocked) updatePointerNDC(clientX, clientY);
      interactRaycaster.setFromCamera(isPointerLocked ? { x: 0, y: 0 } : pointerNDC, camera);
      interactRaycaster.far = 7.0;

      // Label Cases Mode (Hand Scanner Option 3 -> 1. LABEL CASES)
      if (
        uiState.scannerModalOpen &&
        !uiState.overageDeliveryId &&
        window.DSDReceipts &&
        typeof window.DSDReceipts.isScannerLabelMode === 'function' &&
        window.DSDReceipts.isScannerLabelMode() &&
        window.BackstockRacks &&
        typeof window.BackstockRacks.getLabelableRaycastMeshes === 'function'
      ) {
        const labelMeshes = window.BackstockRacks.getLabelableRaycastMeshes();
        if (labelMeshes.length > 0) {
          const labelHits = interactRaycaster.intersectObjects(labelMeshes, false);
          if (labelHits.length > 0 && labelHits[0].object && labelHits[0].object.userData && labelHits[0].object.userData.backstockCaseRef) {
            const caseRec = labelHits[0].object.userData.backstockCaseRef;
            const res = window.DSDReceipts.scanBackstockCaseForLabel(caseRec);
            if (res && res.ok && res.loaded) {
              if (SoundSystem && typeof SoundSystem.playScanBeep === 'function') {
                SoundSystem.playScanBeep();
              }
              scannerDevice.classList.add('scanning');
              scannerLcd.classList.add('scan-flash');
              if (scanPulseTimeout) clearTimeout(scanPulseTimeout);
              scanPulseTimeout = setTimeout(() => {
                scannerDevice.classList.remove('scanning');
                scannerLcd.classList.remove('scan-flash');
              }, 240);
            }
            return true;
          }
        }
      }

      // Daily Backroom Inventory Mode (Hand Scanner Option 3 -> 2. BACKROOM INVENTORY)
      if (
        uiState.scannerModalOpen &&
        !uiState.overageDeliveryId &&
        window.DSDReceipts &&
        typeof window.DSDReceipts.isScannerInventoryMode === 'function' &&
        window.DSDReceipts.isScannerInventoryMode() &&
        window.BackstockRacks &&
        typeof window.BackstockRacks.getInventoryRaycastMeshes === 'function'
      ) {
        const invMeshes = window.BackstockRacks.getInventoryRaycastMeshes();
        if (invMeshes.length > 0) {
          const invHits = interactRaycaster.intersectObjects(invMeshes, false);
          if (invHits.length > 0 && invHits[0].object && invHits[0].object.userData && invHits[0].object.userData.backstockCaseRef) {
            const caseRec = invHits[0].object.userData.backstockCaseRef;
            const res = window.DSDReceipts.scanBackstockCase(caseRec);
            if (res && res.ok && res.loaded) {
              if (SoundSystem && typeof SoundSystem.playScanBeep === 'function') {
                SoundSystem.playScanBeep();
              }
              scannerDevice.classList.add('scanning');
              scannerLcd.classList.add('scan-flash');
              if (scanPulseTimeout) clearTimeout(scanPulseTimeout);
              scanPulseTimeout = setTimeout(() => {
                scannerDevice.classList.remove('scanning');
                scannerLcd.classList.remove('scan-flash');
              }, 240);
            }
            return true;
          }
        }
      }

      // Dept 60 Supply Ordering Mode (Hand Scanner Option 2)
      if (
        uiState.scannerModalOpen &&
        !uiState.overageDeliveryId &&
        window.DSDReceipts &&
        typeof window.DSDReceipts.isScannerSupplyMode === 'function' &&
        window.DSDReceipts.isScannerSupplyMode() &&
        window.BackstockRacks &&
        typeof window.BackstockRacks.getPickableCaseMeshes === 'function'
      ) {
        const supMeshes = window.BackstockRacks.getPickableCaseMeshes();
        if (supMeshes.length > 0) {
          const supHits = interactRaycaster.intersectObjects(supMeshes, false);
          if (supHits.length > 0 && supHits[0].object && supHits[0].object.userData && supHits[0].object.userData.backstockCaseRef) {
            const caseRec = supHits[0].object.userData.backstockCaseRef;
            const res = window.DSDReceipts.scanSupplyBox(caseRec);
            if (res && res.ok && res.loaded) {
              if (SoundSystem && typeof SoundSystem.playScanBeep === 'function') {
                SoundSystem.playScanBeep();
              }
              scannerDevice.classList.add('scanning');
              scannerLcd.classList.add('scan-flash');
              if (scanPulseTimeout) clearTimeout(scanPulseTimeout);
              scanPulseTimeout = setTimeout(() => {
                scannerDevice.classList.remove('scanning');
                scannerLcd.classList.remove('scan-flash');
              }, 240);
            }
            return true;
          }
        }
      }

      // Markdown Claims Mode (Hand Scanner Option 4)
      if (
        uiState.scannerModalOpen &&
        !uiState.overageDeliveryId &&
        window.DSDReceipts &&
        typeof window.DSDReceipts.isScannerDamageMode === 'function' &&
        window.DSDReceipts.isScannerDamageMode() &&
        window.ClaimsTotes &&
        typeof window.ClaimsTotes.getOpenToteItemMeshes === 'function'
      ) {
        const dmgMeshes = window.ClaimsTotes.getOpenToteItemMeshes();
        if (dmgMeshes.length > 0) {
          const dmgHits = interactRaycaster.intersectObjects(dmgMeshes, false);
          if (dmgHits.length > 0 && dmgHits[0].object && dmgHits[0].object.userData && dmgHits[0].object.userData.claimsItemRef) {
            const itemRec = dmgHits[0].object.userData.claimsItemRef;
            if (itemRec.scannerConfirmed) {
              return false;
            }
            scanClaimsItemIntoScanner(itemRec);
            return true;
          }
        }
      }

      const boxMeshes = getActiveDeliveryBoxMeshes();
      if (boxMeshes.length === 0) return false;

      const hits = interactRaycaster.intersectObjects(boxMeshes, false);
      if (hits.length === 0) return false;

      const hitObj = hits[0].object;
      const box = hitObj && hitObj.userData ? hitObj.userData.physicalBoxRef : null;
      if (!box) return false;
      const boxDelivId = box.deliveryId || (hitObj.userData ? hitObj.userData.deliveryId : null);

      // Interactive OVERAGE Flagging Mode on 3D Carts & Pallets
      if (uiState.overageDeliveryId) {
        if (boxDelivId && boxDelivId !== uiState.overageDeliveryId) {
          SoundSystem.playErrorBuzzer();
          showAlert('[[ico:claim]] Case belongs to another delivery! Finish or return to the active invoice first.');
          return true;
        }
        if (box.isCredit) {
          SoundSystem.playErrorBuzzer();
          showNotification('[[ico:claim]] Credit Tote return boxes cannot be flagged as invoice overages.', 2800);
          return true;
        }
        const ds = DeliverySystem.getSessionForDelivery(uiState.overageDeliveryId);
        const targetDeliv = (ds && ds.delivery) || DeliverySystem.activeDelivery;
        if (!targetDeliv || !window.DSDReceipts) return false;
        const res = window.DSDReceipts.toggleBoxOverageFlag(targetDeliv, box);
        syncDeliveryBoxesVisuals(targetDeliv);
        SoundSystem.playButtonClick();
        if (res && res.ok) {
          showNotification(
            res.flagged
              ? `[[ico:flag]] Flagged ${box.name} as OVERAGE (excess kept on cart/pallet)`
              : `[[ico:returnKey]] Removed OVERAGE flag from ${box.name}`,
            2600
          );
        }
        return true;
      }

      if (boxDelivId) {
        DeliverySystem.focusDelivery(boxDelivId);
      }
      const d = DeliverySystem.activeDelivery;
      if (!d) return false;

      if (!uiState.scannerModalOpen) {
        openScanner();
      }
      if (window.DSDReceipts) {
        const res = window.DSDReceipts.scanSpecificBox(box);
        const syncedSess = boxDelivId ? DeliverySystem.getSessionForDelivery(boxDelivId) : null;
        syncDeliveryBoxesVisuals((syncedSess && syncedSess.delivery) || DeliverySystem.activeDelivery || d);
        if (res && res.ok) {
          const isValidScan = Boolean(res.loaded || res.scanned);
          if (isValidScan && SoundSystem && typeof SoundSystem.playScanBeep === 'function') {
            SoundSystem.playScanBeep();
          }
          scannerDevice.classList.add('scanning');
          scannerLcd.classList.add('scan-flash');
          if (scanPulseTimeout) clearTimeout(scanPulseTimeout);
          scanPulseTimeout = setTimeout(() => {
            scannerDevice.classList.remove('scanning');
            scannerLcd.classList.remove('scan-flash');
          }, 240);
        }
      }
      return true;
    }

    function requestLock() {
      if (isBlockingModalOpen()) return;
      const canvas = renderer.domElement;
      if (canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => { });
        } catch (_) { }
      }
    }

    const pointerLookCtrl = global.createPointerLookController({ mouseSens });
    let pendingJackYawDelta = 0;

    let lastTouchTapMs = 0;
    const ctrlPointerHold = global.createCtrlPointerHoldController({
      isLocked: () => Boolean(isPointerLocked || (renderer && renderer.domElement && document.pointerLockElement === renderer.domElement)),
      isBlocked: () => Boolean(isTouchDevice || isBlockingModalOpen()),
      unlock: () => {
        if (document.exitPointerLock) {
          try { document.exitPointerLock(); } catch (_) { }
        }
      },
      relock: () => requestLock(),
      onStateChange: () => updateLockHintDisplay()
    });
    lockHint.addEventListener('click', requestLock);
    renderer.domElement.addEventListener('click', (e) => {
      if (!isPointerLocked && hudOverlayPriority.isPointOverHud(e.clientX, e.clientY)) return;
      if (mouseDragMoved >= 6) return;
      if (Date.now() - lastTouchTapMs < 450) return;
      if (handleDirectBoxClick(e.clientX, e.clientY)) {
        return;
      }
      if (handleClaimsToteInteract(true, e.clientX, e.clientY)) {
        return;
      }
      if (handleBackstockInteract(true, e.clientX, e.clientY)) {
        return;
      }
      if (handleDirectInteractibleClick(e.clientX, e.clientY)) {
        return;
      }
      if (!isTouchDevice && !isPointerLocked && !ctrlPointerHold.isHoldActive() && !ctrlPointerHold.hasHeldControl() && !e.ctrlKey && !uiState.scannerModalOpen && !uiState.invoiceModalOpen && !isBlockingModalOpen()) {
        requestLock();
      }
    });
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      isPointerLocked = (document.pointerLockElement === renderer.domElement);
      if (isPointerLocked) {
        pointerOverUiOverlay = false;
        pointerLookCtrl.onLockAcquired();
        ctrlPointerHold.onPointerLockAcquired();
      } else {
        pointerLookCtrl.onLockReleased();
        pendingJackYawDelta = 0;
      }
      updateLockHintDisplay();
    });

    function applyFilteredMouseLook(rawDx, rawDy, locked) {
      const res = pointerLookCtrl.processDelta(rawDx, rawDy, { isLocked: locked });
      if (res.dYaw === 0 && res.dPitch === 0) return;
      if (!player.hasElectricJack && !player.hitchedPallet) {
        player.yaw += res.dYaw;
      } else {
        // Coalesce expensive 27-step jack/pallet turn collision solve to once per frame in updatePlayer
        pendingJackYawDelta += res.dYaw;
      }
      player.pitch += res.dPitch;
      clampPitch();
    }

    window.addEventListener('mousemove', (e) => {
      if (isBlockingModalOpen()) return;
      if (Date.now() - lastTouchInteractionMs > 600) {
        usingTouchAim = false;
      }
      lastPointerClient.x = e.clientX;
      lastPointerClient.y = e.clientY;
      pointerOverUiOverlay = !isPointerLocked && !isMouseDragging && isElementOverOverlayUi(e.target);
      if (!pointerOverUiOverlay && !isPointerLocked) {
        updatePointerNDC(e.clientX, e.clientY);
      }
      if (isPointerLocked) {
        applyFilteredMouseLook(e.movementX, e.movementY, true);
      } else if (isMouseDragging) {
        if ((e.buttons & 1) === 0 && (e.buttons & 2) === 0) {
          isMouseDragging = false;
          return;
        }
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        mouseDragMoved = Math.max(mouseDragMoved, Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y));
        lastMousePos.x = e.clientX;
        lastMousePos.y = e.clientY;
        applyFilteredMouseLook(dx, dy, false);
      }
    });

    renderer.domElement.addEventListener('mousedown', (e) => {
      if (isBlockingModalOpen() || (!isPointerLocked && hudOverlayPriority.isPointOverHud(e.clientX, e.clientY))) return;
      updatePointerNDC(e.clientX, e.clientY);
      mouseDownPos.x = e.clientX;
      mouseDownPos.y = e.clientY;
      mouseDragMoved = 0;
      if (!isPointerLocked && (e.button === 0 || e.button === 2)) {
        isMouseDragging = true;
        lastMousePos.x = e.clientX;
        lastMousePos.y = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDragging = false;
    });
    window.addEventListener('blur', () => {
      isMouseDragging = false;
      pendingJackYawDelta = 0;
    });

    function clampPitch() {
      const degToRad = Math.PI / 180;
      if (player.hasElectricJack) {
        const minJackPitch = -26 * degToRad;
        const maxJackPitch = 22 * degToRad;
        player.pitch = Math.max(minJackPitch, Math.min(maxJackPitch, player.pitch));
      } else {
        const maxPitch = 85 * degToRad;
        player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch));
      }
    }

    // --- SCANNER BUTTON FEEDBACK & PC KEYBIND LOGIC ---
    function flashKeyButton(dataKey) {
      const btn = scannerDevice.querySelector(`[data-key="${dataKey}"]`);
      if (btn) {
        btn.classList.add('key-pressed');
        setTimeout(() => btn.classList.remove('key-pressed'), 140);
      }
    }

    function triggerScanVisualFeedback() {
      if (SoundSystem && typeof SoundSystem.playScanBeep === 'function') {
        SoundSystem.playScanBeep();
      }
      scannerDevice.classList.add('scanning');
      scannerLcd.classList.add('scan-flash');
      if (scanPulseTimeout) clearTimeout(scanPulseTimeout);
      scanPulseTimeout = setTimeout(() => {
        scannerDevice.classList.remove('scanning');
        scannerLcd.classList.remove('scan-flash');
      }, 240);
    }

    function canTriggerContextScanAction() {
      if (
        isCarryingBackstockCase() ||
        isHoldingClaimsItem() ||
        isHoldingRecallTote() ||
        isArrangingRecallItem() ||
        player.hasElectricJack ||
        player.hitchedPallet ||
        uiState.bolModalOpen ||
        uiState.invoiceModalOpen ||
        uiState.overageDeliveryId ||
        isBlockingModalOpen()
      ) {
        return false;
      }
      return true;
    }

    function handleScannerKeyAction(action, val) {
      if (action === 'pwr') {
        flashKeyButton('pwr');
        toggleScanner();
        return;
      }
      let openedFreshForScan = false;
      let preScannedOnOpen = false;
      let hoveredBoxBeforeOpen = null;
      if (action === 'scan') {
        if (!canTriggerContextScanAction()) return;
        flashKeyButton('scan');
        if (uiState.hoveredPhysicalBox) {
          hoveredBoxBeforeOpen = uiState.hoveredPhysicalBox;
          const hbDelivId = hoveredBoxBeforeOpen.deliveryId ||
            (uiState.hoveredBoxMesh && uiState.hoveredBoxMesh.userData && uiState.hoveredBoxMesh.userData.deliveryId);
          if (hbDelivId) {
            DeliverySystem.focusDelivery(hbDelivId);
          }
        }
        if (!player.scannerActive) {
          openedFreshForScan = true;
          const openScreen = resolveScannerOpenContext();
          const hasPreClaims = Boolean(openScreen === 'damage' && (() => {
            const ct = getHoveredClaimsScannerTarget();
            return ct && ct.item && !ct.item.claimed;
          })());
          const hasPreSupply = Boolean(
            openScreen === 'supply' &&
            uiState.hoveredBackstockCase &&
            window.BackstockRacks &&
            typeof window.BackstockRacks.isSupplyCase === 'function' &&
            window.BackstockRacks.isSupplyCase(uiState.hoveredBackstockCase) &&
            !(window.DSDReceipts && typeof window.DSDReceipts.isSupplyOrderSubmittedToday === 'function' && window.DSDReceipts.isSupplyOrderSubmittedToday())
          );
          preScannedOnOpen = hasPreClaims || hasPreSupply;
          openScanner();
        }
      } else if (action === 'enter') {
        flashKeyButton('enter');
      } else if (action === 'num') {
        flashKeyButton(val);
        if (!player.scannerActive) openScanner();
      } else if (['clr', 'minus', 'star', 'slash', 'plus', 'back', 'home', 'print', 'f5', 'f6', 'f7', 'f8'].includes(action)) {
        flashKeyButton(action);
      } else if (action === 'nav') {
        flashKeyButton('arrow' + String(val || '').toLowerCase());
      }

      if (action === 'scan' && openedFreshForScan && preScannedOnOpen) {
        return;
      }
      if (action === 'scan' && hoveredBoxBeforeOpen && window.DSDReceipts && typeof window.DSDReceipts.scanSpecificBox === 'function') {
        const res = window.DSDReceipts.scanSpecificBox(hoveredBoxBeforeOpen);
        const hbDelivId = hoveredBoxBeforeOpen.deliveryId ||
          (uiState.hoveredBoxMesh && uiState.hoveredBoxMesh.userData && uiState.hoveredBoxMesh.userData.deliveryId);
        const hbSess = hbDelivId ? DeliverySystem.getSessionForDelivery(hbDelivId) : null;
        const targetDeliv = (hbSess && hbSess.delivery) || DeliverySystem.activeDelivery;
        if (targetDeliv) syncDeliveryBoxesVisuals(targetDeliv);
        if (res && res.ok && (res.loaded || res.scanned)) {
          triggerScanVisualFeedback();
        }
        return;
      }

      const mappedAction = action === 'clr' ? 'clear' : (action === 'nav' ? String(val || '').toLowerCase() : action);
      if (window.DSDReceipts) {
        window.DSDReceipts.handleScannerKey(mappedAction, val);
      }
    }

    // --- KEYBOARD CONTROLS (PC) ---
    function isEditableKeyTarget(target) {
      if (!target || !target.tagName) return false;
      const tag = String(target.tagName).toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target.isContentEditable);
    }

    window.addEventListener('keydown', (e) => {
      if (!isEditableKeyTarget(e.target) && ctrlPointerHold.onKeyDown(e)) {
        return;
      }
      if (uiState.alertModalOpen) {
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
          SoundSystem.playButtonClick();
          closePopupModal();
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (uiState.shortageModalOpen) {
        if (e.code === 'Escape' && typeof closeShortageQtyModal === 'function') {
          closeShortageQtyModal();
          e.preventDefault();
        }
        return;
      }
      if (window.DSDGame && window.DSDGame.isModalOpen()) {
        if (e.code === 'Escape' && window.DSDMenuUI && typeof window.DSDMenuUI.togglePauseMenu === 'function') {
          window.DSDMenuUI.togglePauseMenu();
          e.preventDefault();
        }
        return;
      }
      if (uiState.doorQueueModalOpen) {
        if (e.code === 'Escape') {
          closeDoorQueueModal();
          e.preventDefault();
        }
        return;
      }
      if (uiState.terminalModalOpen) {
        if (e.code === 'F2') {
          e.preventDefault();
          if (terminalPaperBtn) terminalPaperBtn.click();
          return;
        }
        if (e.code === 'F3') {
          e.preventDefault();
          closeTerminal();
          return;
        }
        if (e.code === 'F12') {
          e.preventDefault();
          if (window.DSDReceipts && typeof window.DSDReceipts.handleTerminalKey === 'function') {
            window.DSDReceipts.handleTerminalKey('F12');
          }
          return;
        }
        if (e.code === 'F7' || e.code === 'PageUp' || e.code === 'ArrowUp') {
          e.preventDefault();
          if (window.DSDReceipts && typeof window.DSDReceipts.handleTerminalKey === 'function') {
            window.DSDReceipts.handleTerminalKey('PGUP');
          }
          return;
        }
        if (e.code === 'F8' || e.code === 'PageDown' || e.code === 'ArrowDown') {
          e.preventDefault();
          if (window.DSDReceipts && typeof window.DSDReceipts.handleTerminalKey === 'function') {
            window.DSDReceipts.handleTerminalKey('PGDN');
          }
          return;
        }
        if (e.code === 'F9' || e.code === 'ArrowLeft') {
          e.preventDefault();
          if (window.DSDReceipts && typeof window.DSDReceipts.handleTerminalKey === 'function') {
            window.DSDReceipts.handleTerminalKey('DEPT_PREV');
          }
          return;
        }
        if (e.code === 'F10' || e.code === 'ArrowRight') {
          e.preventDefault();
          if (window.DSDReceipts && typeof window.DSDReceipts.handleTerminalKey === 'function') {
            window.DSDReceipts.handleTerminalKey('DEPT_NEXT');
          }
          return;
        }
        if (e.code === 'Escape') {
          if (window.DSDReceipts && typeof window.DSDReceipts.handleTerminalKey === 'function') {
            window.DSDReceipts.handleTerminalKey('ESC');
          } else {
            closeTerminal();
          }
          e.preventDefault();
          return;
        }
        if (window.DSDReceipts && typeof window.DSDReceipts.handleTerminalKey === 'function') {
          if (/^[0-9]$/.test(e.key) || /^[a-zA-Z]$/.test(e.key)) {
            window.DSDReceipts.handleTerminalKey(e.key);
            e.preventDefault();
          } else if (e.code === 'Space') {
            window.DSDReceipts.handleTerminalKey('SPACE');
            e.preventDefault();
          } else if (e.code === 'Backspace' || e.code === 'Delete') {
            window.DSDReceipts.handleTerminalKey('BKSP');
            e.preventDefault();
          } else if (e.code === 'Tab') {
            window.DSDReceipts.handleTerminalKey('TAB');
            e.preventDefault();
          } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            window.DSDReceipts.handleTerminalKey('ENTER');
            e.preventDefault();
          } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
            window.DSDReceipts.handleTerminalKey('NEG');
            e.preventDefault();
          }
        }
        return;
      }
      if (isPhase2ModalOpen()) {
        const filingEl = document.getElementById('filing-overlay');
        const archEl = document.getElementById('invoice-archive-overlay');
        const filingOrArchOpen = (filingEl && filingEl.style.display === 'flex') || (archEl && archEl.style.display === 'flex');
        const ndPanelEl = document.getElementById('night-drop-panel');
        const ndOnlyOpen = !filingOrArchOpen && ndPanelEl && ndPanelEl.style.display === 'flex';

        if (ndOnlyOpen && e.code === 'KeyF') {
          toggleScanner('nightdrop');
          e.preventDefault();
          return;
        }
        if (ndOnlyOpen && e.code === 'KeyT') {
          toggleTerminal('create');
          e.preventDefault();
          return;
        }
        if (e.code === 'Escape') {
          if (ndOnlyOpen && uiState.scannerModalOpen) {
            closeScanner();
          } else if (window.DSDReceipts) {
            window.DSDReceipts.closeHandReceiptDialog();
            window.DSDReceipts.closeTrashCanDialog();
            window.DSDReceipts.closeInvoiceArchive();
            window.DSDReceipts.closeFilingOverlay();
            window.DSDReceipts.closeNightDropPanel();
          }
          return;
        }
        // Allow Hand Scanner keys while Night Drop paper is open beside it
        if (!ndOnlyOpen || !uiState.scannerModalOpen) {
          return;
        }
      }

      // Scanner Dedicated PC Keybinds
      // [R]: Barcode scan shortcut (scans hovered/eligible case or opens scanner)
      if (e.code === 'KeyR') {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          handleScannerKeyAction('scan');
          e.preventDefault();
          return;
        }
      }

      // [P]: Toggle Pending Deliveries panel
      if (e.code === 'KeyP') {
        if (!uiState.invoiceModalOpen && typeof togglePendingDeliveriesPanel === 'function') {
          togglePendingDeliveriesPanel();
        }
        e.preventDefault();
        return;
      }

      // [L] / [M] / [N]: Toggle Command Bar Session Message Log
      if (e.code === 'KeyL' || e.code === 'KeyM' || e.code === 'KeyN') {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          if (!uiState.invoiceModalOpen && !uiState.terminalModalOpen && window.DSDMessages && typeof window.DSDMessages.toggle === 'function') {
            window.DSDMessages.toggle();
          }
          e.preventDefault();
          return;
        }
      }

      // [K]: Toggle Remaining Work Legend popover
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyK') {
        if (!isEditableKeyTarget(e.target) && !uiState.invoiceModalOpen && !uiState.terminalModalOpen &&
          window.DSDGame && typeof window.DSDGame.toggleRemainingLegend === 'function') {
          window.DSDGame.toggleRemainingLegend();
          e.preventDefault();
          return;
        }
      }

      // [C]: Toggle Digital Clock February Calendar popover
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyC') {
        if (!isEditableKeyTarget(e.target) && !uiState.invoiceModalOpen && !uiState.terminalModalOpen &&
          window.DSDGame && typeof window.DSDGame.toggleClockCalendar === 'function') {
          window.DSDGame.toggleClockCalendar();
          e.preventDefault();
          return;
        }
      }

      // [B]: Toggle Dock Beacons status popup
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyB') {
        if (!isEditableKeyTarget(e.target) && !uiState.invoiceModalOpen && !uiState.terminalModalOpen &&
          typeof toggleDoorLightsPopup === 'function') {
          toggleDoorLightsPopup();
          e.preventDefault();
          return;
        }
      }

      // [V]: Toggle held Receipts bar at bottom of screen while holding receipts
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyV') {
        if (!isEditableKeyTarget(e.target) && !uiState.terminalModalOpen && hasHeldReceiptSlips() &&
          window.DSDReceipts && typeof window.DSDReceipts.togglePrintedReceiptHud === 'function') {
          window.DSDReceipts.togglePrintedReceiptHud();
          e.preventDefault();
          return;
        }
      }

      // When scanner HUD is open, handle keypad keys (no literal F1-F8 keys; uses nav/edit cluster + numpad symbols)
      if (uiState.scannerModalOpen && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // [Enter] / [NumpadEnter]: ENT Confirm / Create
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          handleScannerKeyAction('enter');
          e.preventDefault();
          return;
        }
        // [Backspace]: CLR / BKSP Clear
        if (e.code === 'Backspace') {
          handleScannerKeyAction('clr');
          e.preventDefault();
          return;
        }
        // [Home]: F1 Home Screen
        if (e.code === 'Home') {
          handleScannerKeyAction('home');
          e.preventDefault();
          return;
        }
        // [-] / [NumpadSubtract]: - Sub / Credit Sign
        if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          handleScannerKeyAction('minus');
          e.preventDefault();
          return;
        }
        // [*] / [NumpadMultiply]: F2 Totals & Costs
        if (e.key === '*' || e.code === 'NumpadMultiply') {
          handleScannerKeyAction('star');
          e.preventDefault();
          return;
        }
        // [ArrowLeft]: F3 Universal Back / Cancel
        if (e.code === 'ArrowLeft') {
          handleScannerKeyAction('back');
          e.preventDefault();
          return;
        }
        // [/] / [NumpadDivide]: F4 Item List / Cart / Audit List
        if (e.key === '/' || e.code === 'Slash' || e.code === 'NumpadDivide') {
          handleScannerKeyAction('slash');
          e.preventDefault();
          return;
        }
        // [End] / [+] / [NumpadAdd]: F5 Finalize / Submit
        if (e.code === 'End' || e.key === '+' || e.code === 'NumpadAdd') {
          handleScannerKeyAction('plus');
          e.preventDefault();
          return;
        }
        // [Insert]: F6 Print Label / Print Receipt
        if (e.code === 'Insert') {
          handleScannerKeyAction('print');
          e.preventDefault();
          return;
        }
        // [ArrowRight]: F7 Resume Initial Receipt
        if (e.code === 'ArrowRight') {
          handleScannerKeyAction('f7');
          e.preventDefault();
          return;
        }
        // [Delete]: F8 Edit Expected Totals
        if (e.code === 'Delete') {
          handleScannerKeyAction('f8');
          e.preventDefault();
          return;
        }
        // [0-9] / [Numpad0-9]: Numeric keypad digits
        if (!e.shiftKey && /^(Digit|Numpad)[0-9]$/.test(e.code)) {
          const num = e.code.replace(/^(Digit|Numpad)/, '');
          handleScannerKeyAction('num', num);
          e.preventDefault();
          return;
        }
        // Up/Down arrow keys for scanner list/field navigation (WASD remains available for walking)
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
          handleScannerKeyAction('nav', e.code.replace('Arrow', '').toLowerCase());
          e.preventDefault();
          return;
        }
      }

      // [ArrowLeft]/[ArrowRight]: Switch held receipts when bottom Receipts bar is expanded
      if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        if (!isEditableKeyTarget(e.target) && window.DSDReceipts &&
          typeof window.DSDReceipts.isPrintedReceiptHudExpanded === 'function' &&
          window.DSDReceipts.isPrintedReceiptHudExpanded() &&
          typeof window.DSDReceipts.stepPrintedReceiptSlip === 'function') {
          if (window.DSDReceipts.stepPrintedReceiptSlip(e.code === 'ArrowLeft' ? -1 : 1)) {
            e.preventDefault();
            return;
          }
        }
      }

      // General Game Keybinds
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keys.right = true;
          break;
        case 'KeyE':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) handleInteractE();
          break;
        case 'Space':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            handlePalletAction();
            e.preventDefault();
          }
          break;
        case 'KeyF':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            toggleScanner();
            e.preventDefault();
          }
          break;
        case 'Escape':
          ctrlPointerHold.reset();
          if (uiState.scannerModalOpen) {
            closeScanner();
          } else if (uiState.overageDeliveryId && typeof exitOverageFlagMode === 'function') {
            exitOverageFlagMode(true);
          } else if (uiState.bolModalOpen) {
            closeWarehouseBol();
          } else if (uiState.invoiceModalOpen) {
            closeInvoice();
          } else if (uiState.terminalModalOpen) {
            closeTerminal();
          } else if (uiState.doorQueueModalOpen) {
            closeDoorQueueModal();
          } else if (window.DSDReceipts && typeof window.DSDReceipts.isPhase2ModalOpen === 'function' && window.DSDReceipts.isPhase2ModalOpen()) {
            if (window.DSDReceipts.closeNightDropPanel) window.DSDReceipts.closeNightDropPanel(true);
            if (window.DSDReceipts.closeFilingOverlay) window.DSDReceipts.closeFilingOverlay(true);
            if (window.DSDReceipts.closeInvoiceArchive) window.DSDReceipts.closeInvoiceArchive(true);
            if (window.DSDReceipts.closeTrashCanDialog) window.DSDReceipts.closeTrashCanDialog(true);
            if (window.DSDReceipts.closeHandReceiptDialog) window.DSDReceipts.closeHandReceiptDialog(true);
          } else if (window.DSDMenuUI && typeof window.DSDMenuUI.togglePauseMenu === 'function') {
            window.DSDMenuUI.togglePauseMenu();
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (ctrlPointerHold.onKeyUp(e)) {
        return;
      }
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keys.right = false;
          break;
      }
    });

    window.addEventListener('blur', () => {
      ctrlPointerHold.reset();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctrlPointerHold.reset();
    });

    // --- MOBILE TOUCH CONTROLS (JOYSTICK & TOUCH LOOK) ---
    let joystickTouchId = null;
    const joystickOrigin = { x: 0, y: 0 };
    const joystickDelta = { x: 0, y: 0 };
    const joystickMaxRadius = 45;

    function startJoystickTouch(e) {
      if (joystickTouchId !== null) return;
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;

      const rect = joystickZone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distToDefaultCenter = Math.hypot(touch.clientX - centerX, touch.clientY - centerY);

      if (distToDefaultCenter <= joystickMaxRadius * 1.5) {
        joystickOrigin.x = centerX;
        joystickOrigin.y = centerY;
      } else {
        // Floating joystick repositioning to touch location within walk quadrant
        const clampedX = Math.max(70, Math.min(touch.clientX, window.innerWidth * 0.45));
        const clampedY = Math.max(window.innerHeight * 0.35, Math.min(touch.clientY, window.innerHeight - 70));
        joystickOrigin.x = clampedX;
        joystickOrigin.y = clampedY;
        joystickZone.style.left = `${clampedX - 65}px`;
        joystickZone.style.top = `${clampedY - 65}px`;
        joystickZone.style.bottom = 'auto';
      }

      updateJoystick(touch.clientX, touch.clientY);
      if (e.cancelable) e.preventDefault();
    }

    joystickZone.addEventListener('touchstart', startJoystickTouch, { passive: false });
    if (touchWalkZone) {
      touchWalkZone.addEventListener('touchstart', startJoystickTouch, { passive: false });
    }

    function endJoystickTouch(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
          joystickTouchId = null;
          joystickDelta.x = 0;
          joystickDelta.y = 0;
          joystickKnob.style.transform = 'translate3d(0, 0, 0)';
          // Restore joystick base back to fixed bottom-left corner
          joystickZone.style.left = '24px';
          joystickZone.style.bottom = '24px';
          joystickZone.style.top = 'auto';
          break;
        }
      }
    }

    function updateJoystick(clientX, clientY) {
      const dx = clientX - joystickOrigin.x;
      const dy = clientY - joystickOrigin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const clampedDist = Math.min(dist, joystickMaxRadius);
      const knobX = Math.cos(angle) * clampedDist;
      const knobY = Math.sin(angle) * clampedDist;

      joystickKnob.style.transform = `translate3d(${knobX}px, ${knobY}px, 0)`;
      joystickDelta.x = knobX / joystickMaxRadius;
      joystickDelta.y = knobY / joystickMaxRadius;
    }

    // Camera Look Touch Handling & Tap-to-Scan on Mobile/Tablet
    let lookTouchId = null;
    let lastLookPos = { x: 0, y: 0 };
    let lookTouchStart = { x: 0, y: 0 };
    let lookTouchMaxMove = 0;
    let lookTouchHeldMs = 0;
    const touchLookSens = 0.0035;

    function startLookTouch(e) {
      if (lookTouchId !== null) return;
      const touch = e.changedTouches[0];
      lookTouchId = touch.identifier;
      lastLookPos.x = touch.clientX;
      lastLookPos.y = touch.clientY;
      lookTouchStart.x = touch.clientX;
      lookTouchStart.y = touch.clientY;
      lookTouchMaxMove = 0;
      lookTouchHeldMs = 0;
      usingTouchAim = true;
      lastTouchInteractionMs = Date.now();
      if (e.cancelable) e.preventDefault();
    }

    touchLookZone.addEventListener('touchstart', startLookTouch, { passive: false });
    renderer.domElement.addEventListener('touchstart', (e) => {
      usingTouchAim = true;
      lastTouchInteractionMs = Date.now();
      if (lookTouchId !== null || joystickTouchId !== null) return;
      const touch = e.changedTouches[0];
      const nearTippedTotes = Boolean(
        window.ClaimsTotes &&
        typeof window.ClaimsTotes.getOpenTotes === 'function' &&
        window.ClaimsTotes.getOpenTotes().length > 0
      );
      if (touch.clientX > window.innerWidth * 0.4 || uiState.scannerModalOpen || uiState.overageDeliveryId || nearTippedTotes) {
        startLookTouch(e);
      }
    }, { passive: false });

    function endLookTouch(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === lookTouchId) {
          lookTouchId = null;
          if (lookTouchMaxMove < 10 && lookTouchHeldMs < 350) {
            const tappedDirect =
              handleDirectBoxClick(t.clientX, t.clientY) ||
              handleClaimsToteInteract(true, t.clientX, t.clientY) ||
              handleBackstockInteract(true, t.clientX, t.clientY);
            handleBackstockInteract(true, t.clientX, t.clientY) ||
              handleDirectInteractibleClick(t.clientX, t.clientY);
            if (tappedDirect) {
              lastTouchTapMs = Date.now();
            } else if (
              (isCarryingBackstockCase() && uiState.hoveredBackstockTarget) ||
              (isArrangingRecallItem() && uiState.hoveredRecallArrangeSpot) ||
              ((isHoldingClaimsItem() || isHoldingRecallTote()) && (uiState.hoveredClaimsReceptacle || uiState.hoveredRecallBottomDock || uiState.hoveredRecallItem))
            ) {
              handleInteractE();
              lastTouchTapMs = Date.now();
            }
          }
          lookTouchHeldMs = 0;
          break;
        }
      }
    }

    // Unified Touch Move for smooth dual-thumb movement & camera control
    window.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
          updateJoystick(touch.clientX, touch.clientY);
          if (e.cancelable) e.preventDefault();
        } else if (touch.identifier === lookTouchId) {
          const dx = touch.clientX - lastLookPos.x;
          const dy = touch.clientY - lastLookPos.y;
          lookTouchMaxMove = Math.max(
            lookTouchMaxMove,
            Math.hypot(touch.clientX - lookTouchStart.x, touch.clientY - lookTouchStart.y)
          );
          lastLookPos.x = touch.clientX;
          lastLookPos.y = touch.clientY;

          setPlayerYawChecked(player.yaw - dx * touchLookSens);
          player.pitch -= dy * touchLookSens;
          clampPitch();
          if (e.cancelable) e.preventDefault();
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      endJoystickTouch(e);
      endLookTouch(e);
    }, { passive: true });

    window.addEventListener('touchcancel', (e) => {
      endJoystickTouch(e);
      endLookTouch(e);
    }, { passive: true });

    // Context-sensitive raised pill action buttons (bottom-to-top: Scanner [F], Use [E], Jack [Space])
    if (btnTouchAction) {
      btnTouchAction.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePalletAction();
      });
    }
    if (btnTouchDoor) {
      btnTouchDoor.addEventListener('click', (e) => {
        e.stopPropagation();
        handleInteractE();
      });
    }
    if (btnTouchCaseScan) {
      btnTouchCaseScan.addEventListener('click', (e) => {
        e.stopPropagation();
        handleScannerKeyAction('scan');
      });
    }
    if (btnTouchScan) {
      btnTouchScan.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleScanner();
      });
    }

    let alertTimeout = null;
    function showAlert(msg, priority) {
      SoundSystem.playErrorBuzzer();
      if (window.DSDMessages && typeof window.DSDMessages.push === 'function') {
        window.DSDMessages.push(msg, priority);
        return;
      }
      if (window.SvgIcons && typeof window.SvgIcons.formatHtml === 'function') {
        alertBanner.innerHTML = window.SvgIcons.formatHtml(msg);
      } else {
        alertBanner.textContent = msg;
      }
      alertBanner.style.display = 'block';
      if (alertTimeout) clearTimeout(alertTimeout);
      alertTimeout = setTimeout(() => {
        alertBanner.style.display = 'none';
      }, 3200);
    }

    const gameAlertModal = document.getElementById('game-alert-modal');
    const gameAlertTitle = document.getElementById('gam-title');
    const gameAlertBody = document.getElementById('gam-body');
    const gameAlertOkBtn = document.getElementById('gam-ok-btn');
    const gameAlertCloseBtn = document.getElementById('gam-close-btn');

    function closePopupModal() {
      if (!gameAlertModal) return;
      gameAlertModal.classList.remove('active');
      uiState.alertModalOpen = false;
      syncPhase2ContainerClasses();
    }

    function showPopupModal(optsOrMessage) {
      if (!gameAlertModal || !gameAlertBody) {
        showAlert(typeof optsOrMessage === 'string' ? optsOrMessage : (optsOrMessage && optsOrMessage.message) || '');
        return;
      }
      let title = '[[ico:claim]] NOTICE';
      let message = '';
      let tone = 'warn';
      let buttonText = 'OK';

      if (typeof optsOrMessage === 'string') {
        const raw = String(optsOrMessage || '').trim();
        const splitIdx = raw.indexOf('\n\n');
        if (splitIdx !== -1) {
          title = raw.slice(0, splitIdx).trim();
          message = raw.slice(splitIdx + 2).trim();
        } else {
          message = raw;
        }
        if (/^(?:🎉|🏆|✅|\[\[ico:(?:sparkle|trophy|checkCircle)\]\])/.test(title) || /^(?:🎉|🏆|✅|\[\[ico:(?:sparkle|trophy|checkCircle)\]\])/.test(message)) {
          tone = 'success';
        }
      } else if (optsOrMessage && typeof optsOrMessage === 'object') {
        if (optsOrMessage.title) title = String(optsOrMessage.title);
        if (optsOrMessage.message) message = String(optsOrMessage.message);
        if (optsOrMessage.tone) tone = String(optsOrMessage.tone);
        if (optsOrMessage.buttonText) buttonText = String(optsOrMessage.buttonText);
      }

      if (gameAlertTitle) {
        if (window.SvgIcons && typeof window.SvgIcons.formatHtml === 'function') {
          gameAlertTitle.innerHTML = window.SvgIcons.formatHtml(title);
        } else {
          gameAlertTitle.textContent = title;
        }
      }
      if (window.SvgIcons && typeof window.SvgIcons.formatHtml === 'function') {
        gameAlertBody.innerHTML = window.SvgIcons.formatHtml(message);
      } else {
        gameAlertBody.textContent = message;
      }
      if (gameAlertOkBtn) gameAlertOkBtn.textContent = buttonText;
      gameAlertModal.setAttribute('data-tone', tone);
      gameAlertModal.classList.add('active');
      uiState.alertModalOpen = true;
      if (document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
      syncPhase2ContainerClasses();
      if (gameAlertOkBtn && typeof gameAlertOkBtn.focus === 'function') {
        setTimeout(() => gameAlertOkBtn.focus(), 0);
      }
    }

    if (gameAlertOkBtn) {
      gameAlertOkBtn.addEventListener('click', () => {
        SoundSystem.playButtonClick();
        closePopupModal();
      });
    }
    if (gameAlertCloseBtn) {
      gameAlertCloseBtn.addEventListener('click', () => {
        SoundSystem.playButtonClick();
        closePopupModal();
      });
    }
    if (gameAlertModal) {
      gameAlertModal.addEventListener('click', (e) => {
        if (e.target === gameAlertModal) {
          SoundSystem.playButtonClick();
          closePopupModal();
        }
      });
    }
    global.DSDPopupModal = { show: showPopupModal, close: closePopupModal };

    let notifyTimeout = null;
    function showNotification(msg, durationOrPriority, explicitPriority) {
      if (window.DSDMessages && typeof window.DSDMessages.push === 'function') {
        const prio = explicitPriority || (typeof durationOrPriority === 'string' ? durationOrPriority : undefined);
        window.DSDMessages.push(msg, prio);
        return;
      }
      notifyBanner.textContent = msg;
      notifyBanner.style.display = 'block';
      if (notifyTimeout) clearTimeout(notifyTimeout);
      notifyTimeout = setTimeout(() => {
        notifyBanner.style.display = 'none';
      }, 3000);
    }


    let focusedInteractible = null;
    const interactRaycaster = new THREE.Raycaster();
    const CLICK_INTERACTIBLE_TYPES = new Set([
      'dock_button',
      'side_door_button',
      'terminal',
      'driver',
      'desk_papers',
      'filing_folder',
      'file_cabinet',
      'printer',
      'trash_can',
      'timeclock',
      'pallet'
    ]);

    function isWarehouseCargoPallet(palletObj) {
      const d = palletObj && palletObj.data ? palletObj.data : null;
      return Boolean(d && d.isWarehousePallet !== false && !d.isOverstockPallet && !Array.isArray(d.physicalBoxes));
    }

    function isVendorCheckinPallet(palletObj) {
      const d = palletObj && palletObj.data ? palletObj.data : null;
      if (!d || d.isOverstockPallet || d.isWarehousePallet !== false || !d.deliveryId) return false;
      const sess = DeliverySystem.getSessionForDelivery(d.deliveryId);
      if (!sess || !sess.delivery || sess.delivery.completed || sess.delivery.refused) return false;
      return Boolean(palletObj.position && palletObj.position.z >= doorZ - 0.1);
    }

    function openVendorCheckinFromPallet(palletObj) {
      if (!isVendorCheckinPallet(palletObj)) return false;
      const sess = DeliverySystem.getSessionForDelivery(palletObj.data.deliveryId);
      if (!sess || !sess.delivery) return false;
      DeliverySystem.focusDelivery(sess.delivery.id);
      openInvoice(sess.delivery);
      return true;
    }

    function getInteractibleFocusReach(item) {
      if (!item) return { maxDist: 4.8, maxRay: 4.0 };
      if (item.type === 'driver') {
        const waitingOutside = Boolean(item.session && item.session.state === 'OUTSIDE_WAITING');
        return waitingOutside ? { maxDist: 7.5, maxRay: 7.5 } : { maxDist: 5.2, maxRay: 5.0 };
      }
      return { maxDist: 4.8, maxRay: 4.0 };
    }

    function hasHeldReceiptSlips() {
      return Boolean(
        window.DSDReceipts &&
        typeof window.DSDReceipts.getPrintedSlipsCount === 'function' &&
        window.DSDReceipts.getPrintedSlipsCount() > 0
      );
    }

    const _tmpInteractCandidates = [];
    const _tmpClaimsTargets = [];

    function findFocusedInteractibleFromNDC(ndc) {
      if (isCarryingBackstockCase() || isHoldingClaimsItem() || isHoldingRecallTote() || isArrangingRecallItem()) {
        return { item: null, dist: Infinity };
      }
      const px = player.position.x;
      const pz = player.position.z;
      interactRaycaster.setFromCamera(ndc, camera);
      interactRaycaster.far = 7.5;

      _tmpInteractCandidates.length = 0;
      for (let i = 0; i < interactibles.length; i++) {
        const item = interactibles[i];
        if (item.type === 'electric_jack' && (player.hasElectricJack || !electricJackWorld.visible)) {
          continue;
        }
        if (item.type === 'pallet' && (item.target.isHitched || player.hitchedPallet || (item.target.group && !item.target.group.visible))) {
          continue;
        }
        if (
          item.type === 'driver' &&
          item.session &&
          item.session.state === 'OUTSIDE_WAITING' &&
          (!sideRollupDoor.isOpen || sideRollupDoor.currentProgress < 0.35)
        ) {
          continue; // Must push side door button to open door and speak with waiting drivers/vendors!
        }
        const center = item.boxCenter;
        const reach = getInteractibleFocusReach(item);
        const dist = Math.hypot(px - center.x, pz - center.z);
        if (dist < reach.maxDist) {
          _tmpInteractCandidates.push(item.mesh);
        }
      }

      const intersects = _tmpInteractCandidates.length > 0 ? interactRaycaster.intersectObjects(_tmpInteractCandidates, false) : null;
      if (intersects && intersects.length > 0) {
        const hit = intersects[0];
        const hitItem = hit.object && hit.object.userData ? hit.object.userData.interactible : null;
        const reach = getInteractibleFocusReach(hitItem);
        if (hitItem && hit.distance <= reach.maxRay) {
          return { item: hitItem, dist: hit.distance };
        }
      }
      return { item: null, dist: Infinity };
    }

    function triggerInteractibleAction(item) {
      if (!item || !CLICK_INTERACTIBLE_TYPES.has(item.type)) return false;
      if (item.type === 'trash_can' && !hasHeldReceiptSlips()) return false;
      if (item.type === 'pallet') {
        return openVendorCheckinFromPallet(item.target);
      }
      if (
        uiState.scannerModalOpen &&
        (item.type === 'filing_folder' || item.type === 'file_cabinet')
      ) {
        closeScanner();
      }
      item.interact();
      return true;
    }

    function handleDirectInteractibleClick(clientX, clientY) {
      if (isBlockingModalOpen() || uiState.invoiceModalOpen || uiState.overageDeliveryId) return false;
      if (isCarryingBackstockCase() || isHoldingClaimsItem() || isHoldingRecallTote() || isArrangingRecallItem()) return false;
      if (!isPointerLocked && typeof clientX === 'number' && typeof clientY === 'number') {
        updatePointerNDC(clientX, clientY);
      }
      const rayNDC = isPointerLocked ? { x: 0, y: 0 } : pointerNDC;
      const hit = findFocusedInteractibleFromNDC(rayNDC);
      return triggerInteractibleAction(hit.item);
    }

    // ==========================================
    // CRT GREEN GLOW FOCUS HIGHLIGHT OVERLAY
    // Translucent, pulsing CRT phosphor green mask over focused interactibles
    // ==========================================
    const focusHighlightGroup = new THREE.Group();
    focusHighlightGroup.visible = false;

    const crtMaskMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e, // Classic CRT phosphor green
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });
    const crtMaskBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), crtMaskMat);
    focusHighlightGroup.add(crtMaskBox);

    const crtWireMat = new THREE.MeshBasicMaterial({
      color: 0x86efac, // Luminous CRT raster highlight cage
      wireframe: true,
      transparent: true,
      opacity: 0.70,
      depthWrite: false,
      depthTest: true
    });
    const crtWireBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), crtWireMat);
    focusHighlightGroup.add(crtWireBox);

    const crtEdgeMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const crtEdgeTop = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 1.02), crtEdgeMat);
    crtEdgeTop.position.y = 0.5;
    focusHighlightGroup.add(crtEdgeTop);
    const crtEdgeBottom = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 1.02), crtEdgeMat);
    crtEdgeBottom.position.y = -0.5;
    focusHighlightGroup.add(crtEdgeBottom);

    scene.add(focusHighlightGroup);

    const reticle = document.getElementById('reticle');
    const hudInfotipEl = document.getElementById('hud-infotip');
    const _tmpHighlightPos = new THREE.Vector3();
    const _tmpHighlightQuat = new THREE.Quaternion();
    const _tmpHighlightOffset = new THREE.Vector3();
    const _infotipResolveCtx = {
      isBlockingModalOpen: false,
      isTouch: false,
      deliverySystem: null,
      overageDeliveryId: null,
      hoveredPhysicalBox: null,
      hoveredBoxMesh: null,
      hoveredLabelCase: null,
      hoveredInventoryCase: null,
      hoveredSupplyCase: null,
      hoveredBackstockTarget: null,
      hoveredBackstockCase: null,
      hoveredClaimsTote: null,
      hoveredClaimsItem: null,
      hoveredRecallItem: null,
      hoveredRecallArrangeSpot: null,
      hoveredRecallBottomDock: false,
      hoveredClaimsReceptacle: null,
      hoveredRecallTote: false,
      focusedInteractible: null,
      carryingBackstock: false,
      holdingClaimsItem: false,
      holdingRecallTote: false,
      arrangingRecallItem: false,
      recallState: null,
      hasElectricJack: false,
      hitchedPallet: null,
      jackBattery: 100,
      jackDockedAtCharger: false
    };
    const _infotipRenderOpts = { isTouch: false, isAimCenter: true, pointerNDC: null };
    const _infotipLastState = {};
    let _lastInfotipEvalMs = -1;

    function setReticleActive(active) {
      const flag = Boolean(active);
      if (reticle && reticle.classList && reticle.classList.contains('active') !== flag) {
        reticle.classList.toggle('active', flag);
      }
    }

    function updateNearbyInteractions(dt) {
      if (lookTouchId !== null && lookTouchMaxMove < 10) {
        lookTouchHeldMs += (dt || 0.016) * 1000;
      }

      if (isBlockingModalOpen() || (container && container.classList && container.classList.contains('main-menu-open'))) {
        focusHighlightGroup.visible = false;
        setReticleActive(false);
        if (window.InfotipRenderer && hudInfotipEl) {
          window.InfotipRenderer.renderToElement(hudInfotipEl, null);
        }
        return;
      }

      const aimNDC = getAimNDC();
      const px = player.position.x;
      const pz = player.position.z;
      const carryingBackstock = isCarryingBackstockCase();
      const holdingClaimsItem = isHoldingClaimsItem();
      const holdingRecallTote = isHoldingRecallTote();
      const arrangingRecallItem = isArrangingRecallItem();
      const pointerOccluded = isPointerCoveredByUiOverlay();
      focusedInteractible = null;
      let interactHitDist = Infinity;

      uiState.hoveredPhysicalBox = null;
      uiState.hoveredBoxMesh = null;
      uiState.hoveredLabelCase = null;
      uiState.hoveredLabelMesh = null;
      uiState.hoveredInventoryCase = null;
      uiState.hoveredInventoryMesh = null;
      uiState.hoveredSupplyCase = null;
      uiState.hoveredSupplyMesh = null;
      uiState.hoveredBackstockCase = null;
      uiState.hoveredBackstockCaseMesh = null;
      uiState.hoveredBackstockTarget = null;
      uiState.hoveredClaimsTote = null;
      uiState.hoveredClaimsToteMesh = null;
      uiState.hoveredClaimsItem = null;
      uiState.hoveredClaimsItemMesh = null;
      uiState.hoveredClaimsReceptacle = null;
      uiState.hoveredClaimsReceptacleMesh = null;
      uiState.hoveredRecallItem = null;
      uiState.hoveredRecallItemMesh = null;
      uiState.hoveredRecallTote = false;
      uiState.hoveredRecallBottomDock = false;
      uiState.hoveredRecallArrangeSpot = null;

      // Raycast over Backstock Cases when Scanner Option 3 -> 1. LABEL CASES is active
      const labelScannerActive = Boolean(
        !pointerOccluded &&
        !carryingBackstock &&
        !holdingClaimsItem &&
        !holdingRecallTote &&
        !arrangingRecallItem &&
        !isBlockingModalOpen() &&
        uiState.scannerModalOpen &&
        !uiState.overageDeliveryId &&
        window.DSDReceipts &&
        typeof window.DSDReceipts.isScannerLabelMode === 'function' &&
        window.DSDReceipts.isScannerLabelMode() &&
        window.BackstockRacks &&
        typeof window.BackstockRacks.getLabelableRaycastMeshes === 'function'
      );
      if (labelScannerActive) {
        const labelMeshes = window.BackstockRacks.getLabelableRaycastMeshes();
        if (labelMeshes.length > 0) {
          interactRaycaster.setFromCamera(aimNDC, camera);
          interactRaycaster.far = 7.0;
          const labelHits = interactRaycaster.intersectObjects(labelMeshes, false);
          if (labelHits.length > 0 && labelHits[0].object && labelHits[0].object.userData && labelHits[0].object.userData.backstockCaseRef) {
            uiState.hoveredLabelMesh = labelHits[0].object;
            uiState.hoveredLabelCase = uiState.hoveredLabelMesh.userData.backstockCaseRef;
          }
        }
      }

      // Raycast over Backroom Inventory Cases (when Scanner Option 3 Inventory mode is active)
      const invScannerActive = Boolean(
        !pointerOccluded &&
        !carryingBackstock &&
        !holdingClaimsItem &&
        !holdingRecallTote &&
        !arrangingRecallItem &&
        !isBlockingModalOpen() &&
        uiState.scannerModalOpen &&
        !uiState.overageDeliveryId &&
        window.DSDReceipts &&
        typeof window.DSDReceipts.isScannerInventoryMode === 'function' &&
        window.DSDReceipts.isScannerInventoryMode() &&
        window.BackstockRacks &&
        typeof window.BackstockRacks.getInventoryRaycastMeshes === 'function'
      );
      if (invScannerActive) {
        const invMeshes = window.BackstockRacks.getInventoryRaycastMeshes();
        if (invMeshes.length > 0) {
          interactRaycaster.setFromCamera(aimNDC, camera);
          interactRaycaster.far = 7.0;
          const invHits = interactRaycaster.intersectObjects(invMeshes, false);
          if (invHits.length > 0 && invHits[0].object && invHits[0].object.userData && invHits[0].object.userData.backstockCaseRef) {
            uiState.hoveredInventoryMesh = invHits[0].object;
            uiState.hoveredInventoryCase = uiState.hoveredInventoryMesh.userData.backstockCaseRef;
          }
        }
      }

      // Raycast over Dept 60 Supply Cases (when Scanner Option 2 Supply Ordering mode is active)
      const supScannerActive = Boolean(
        !pointerOccluded &&
        !carryingBackstock &&
        !holdingClaimsItem &&
        !holdingRecallTote &&
        !arrangingRecallItem &&
        !isBlockingModalOpen() &&
        uiState.scannerModalOpen &&
        !uiState.overageDeliveryId &&
        window.DSDReceipts &&
        typeof window.DSDReceipts.isScannerSupplyMode === 'function' &&
        window.DSDReceipts.isScannerSupplyMode() &&
        window.BackstockRacks &&
        typeof window.BackstockRacks.getPickableCaseMeshes === 'function'
      );
      if (supScannerActive) {
        const supMeshes = window.BackstockRacks.getPickableCaseMeshes();
        if (supMeshes.length > 0) {
          interactRaycaster.setFromCamera(aimNDC, camera);
          interactRaycaster.far = 7.0;
          const supHits = interactRaycaster.intersectObjects(supMeshes, false);
          if (supHits.length > 0 && supHits[0].object && supHits[0].object.userData && supHits[0].object.userData.backstockCaseRef) {
            uiState.hoveredSupplyMesh = supHits[0].object;
            uiState.hoveredSupplyCase = uiState.hoveredSupplyMesh.userData.backstockCaseRef;
          }
        }
      }

      // Raycast over Individual Delivery Boxes (only when NOT carrying a backstock case, operating/hitching the jack, or targeting a backstock/label/inventory/supply shelf case)
      if (!pointerOccluded && !carryingBackstock && !player.hasElectricJack && !player.hitchedPallet && !holdingClaimsItem && !holdingRecallTote && !arrangingRecallItem && !uiState.hoveredLabelCase && !uiState.hoveredInventoryCase && !uiState.hoveredSupplyCase && !isBlockingModalOpen()) {
        const boxMeshes = getActiveDeliveryBoxMeshes();
        if (boxMeshes.length > 0) {
          interactRaycaster.setFromCamera(aimNDC, camera);
          interactRaycaster.far = 7.0;
          const boxHits = interactRaycaster.intersectObjects(boxMeshes, false);
          if (boxHits.length > 0 && boxHits[0].object.userData && boxHits[0].object.userData.physicalBoxRef) {
            uiState.hoveredBoxMesh = boxHits[0].object;
            uiState.hoveredPhysicalBox = uiState.hoveredBoxMesh.userData.physicalBoxRef;
          }
        }
      }

      // 1. Raycast from reticle (or unlocked cursor) to detect interactible OR backstock target in focus
      if (!pointerOccluded) {
        interactRaycaster.setFromCamera(aimNDC, camera);
        const focusRes = findFocusedInteractibleFromNDC(aimNDC);
        focusedInteractible = focusRes.item;
        interactHitDist = focusRes.dist;
      }

      // Raycast open-tote damaged items whenever inspecting or scanning in Markdown Claims (Option 4)
      const claimsItemRayEligible = Boolean(
        !pointerOccluded &&
        !carryingBackstock &&
        !holdingClaimsItem &&
        !holdingRecallTote &&
        !arrangingRecallItem &&
        !uiState.hoveredPhysicalBox &&
        !uiState.hoveredInventoryCase &&
        !uiState.hoveredSupplyCase &&
        !isBlockingModalOpen() &&
        !uiState.invoiceModalOpen &&
        !uiState.overageDeliveryId &&
        window.ClaimsTotes &&
        typeof window.ClaimsTotes.getOpenToteItemMeshes === 'function'
      );
      if (claimsItemRayEligible) {
        const dmgMeshes = window.ClaimsTotes.getOpenToteItemMeshes();
        if (dmgMeshes.length > 0) {
          interactRaycaster.setFromCamera(aimNDC, camera);
          interactRaycaster.far = uiState.scannerModalOpen ? 7.0 : 4.6;
          const dHits = interactRaycaster.intersectObjects(dmgMeshes, false);
          if (dHits.length > 0 && dHits[0].distance < interactHitDist && dHits[0].object && dHits[0].object.userData && dHits[0].object.userData.claimsItemRef) {
            uiState.hoveredClaimsItem = dHits[0].object.userData.claimsItemRef;
            uiState.hoveredClaimsItemMesh = uiState.hoveredClaimsItem.mesh;
            interactHitDist = dHits[0].distance;
            focusedInteractible = null;
          }
        }
      }

      // Raycast top-shelf placement spot while rearranging a recalled item
      if (!pointerOccluded && arrangingRecallItem && window.ClaimsTotes && typeof window.ClaimsTotes.updateRecallArrangePreview === 'function') {
        interactRaycaster.setFromCamera(aimNDC, camera);
        interactRaycaster.far = 4.6;
        uiState.hoveredRecallArrangeSpot = window.ClaimsTotes.updateRecallArrangePreview(interactRaycaster);
      } else if (window.ClaimsTotes && typeof window.ClaimsTotes.updateRecallArrangePreview === 'function') {
        window.ClaimsTotes.updateRecallArrangePreview(null);
      }

      // Raycast top-shelf items / bottom-shelf dock / disposal receptacles while holding Small Recall Tote (or claims item)
      if (!pointerOccluded && (holdingClaimsItem || holdingRecallTote) && !isBlockingModalOpen() && !uiState.invoiceModalOpen && !uiState.overageDeliveryId && window.ClaimsTotes) {
        interactRaycaster.setFromCamera(aimNDC, camera);
        interactRaycaster.far = 4.6;
        let bestTop = Infinity;
        let bestDock = Infinity;
        let bestRec = Infinity;

        if (holdingRecallTote && typeof window.ClaimsTotes.getRecallTopItemMeshes === 'function') {
          const topMeshes = window.ClaimsTotes.getRecallTopItemMeshes();
          if (topMeshes.length > 0) {
            const th = interactRaycaster.intersectObjects(topMeshes, false);
            if (th.length > 0 && th[0].object && th[0].object.userData && th[0].object.userData.recallItemRef) {
              bestTop = th[0].distance;
              uiState.hoveredRecallItem = th[0].object.userData.recallItemRef;
              uiState.hoveredRecallItemMesh = uiState.hoveredRecallItem.mesh;
            }
          }
        }

        if (holdingRecallTote && typeof window.ClaimsTotes.getRecallBottomDockHitMeshes === 'function') {
          const dockMeshes = window.ClaimsTotes.getRecallBottomDockHitMeshes();
          if (dockMeshes.length > 0) {
            const dh = interactRaycaster.intersectObjects(dockMeshes, false);
            if (dh.length > 0 && dh[0].distance < bestTop && dh[0].object && dh[0].object.userData && dh[0].object.userData.recallBottomDock) {
              bestDock = dh[0].distance;
              uiState.hoveredRecallBottomDock = true;
              uiState.hoveredRecallItem = null;
              uiState.hoveredRecallItemMesh = null;
            }
          }
        }

        if (typeof window.ClaimsTotes.getReceptacleHitMeshes === 'function') {
          const recMeshes = window.ClaimsTotes.getReceptacleHitMeshes();
          if (recMeshes.length > 0) {
            const rHits = interactRaycaster.intersectObjects(recMeshes, false);
            if (rHits.length > 0 && rHits[0].distance < bestTop && rHits[0].distance < bestDock && rHits[0].object && rHits[0].object.userData && rHits[0].object.userData.claimsReceptacle) {
              bestRec = rHits[0].distance;
              uiState.hoveredClaimsReceptacle = rHits[0].object.userData.claimsReceptacle;
              uiState.hoveredClaimsReceptacleMesh = rHits[0].object;
              uiState.hoveredRecallItem = null;
              uiState.hoveredRecallItemMesh = null;
              uiState.hoveredRecallBottomDock = false;
            }
          }
        }
      }

      if ((pointerOccluded || holdingClaimsItem || holdingRecallTote || arrangingRecallItem) && window.BackstockRacks) {
        window.BackstockRacks.hideGhostPreview();
      } else if (!pointerOccluded && !holdingClaimsItem && !holdingRecallTote && !arrangingRecallItem && !isBlockingModalOpen() && !uiState.invoiceModalOpen && !uiState.overageDeliveryId) {
        if (carryingBackstock && window.BackstockRacks) {
          interactRaycaster.setFromCamera(aimNDC, camera);
          interactRaycaster.far = 5.2;
          const preview = window.BackstockRacks.updateGhostPreview(interactRaycaster);
          if (preview) {
            uiState.hoveredBackstockTarget = preview;
          }
        } else if (!uiState.hoveredPhysicalBox && !uiState.hoveredClaimsItem && !player.hasElectricJack) {
          if (window.BackstockRacks) window.BackstockRacks.hideGhostPreview();
          const focusedIsOverstockPallet = Boolean(
            focusedInteractible &&
            focusedInteractible.type === 'pallet' &&
            focusedInteractible.target &&
            focusedInteractible.target.data &&
            focusedInteractible.target.data.isOverstockPallet
          );
          let bestPickDist = focusedIsOverstockPallet ? Infinity : interactHitDist;
          if (window.BackstockRacks) {
            const pickables = window.BackstockRacks.getPickableCaseMeshes();
            if (pickables.length > 0) {
              interactRaycaster.far = 4.6;
              const cHits = interactRaycaster.intersectObjects(pickables, false);
              if (cHits.length > 0 && cHits[0].distance < bestPickDist && cHits[0].object.userData && cHits[0].object.userData.backstockCaseRef) {
                uiState.hoveredBackstockCaseMesh = cHits[0].object;
                uiState.hoveredBackstockCase = cHits[0].object.userData.backstockCaseRef;
                bestPickDist = cHits[0].distance;
                focusedInteractible = null;
              }
            }
          }
          if (window.ClaimsTotes) {
            _tmpClaimsTargets.length = 0;
            const cTargets = _tmpClaimsTargets;
            if (typeof window.ClaimsTotes.getInteractableToteMeshes === 'function') {
              const tList = window.ClaimsTotes.getInteractableToteMeshes();
              for (let i = 0; i < tList.length; i++) if (tList[i]) cTargets.push(tList[i]);
            }
            if (typeof window.ClaimsTotes.getRecallTopItemMeshes === 'function') {
              const riList = window.ClaimsTotes.getRecallTopItemMeshes();
              for (let i = 0; i < riList.length; i++) if (riList[i]) cTargets.push(riList[i]);
            }
            if (typeof window.ClaimsTotes.getRecallToteHitMeshes === 'function') {
              const rtList = window.ClaimsTotes.getRecallToteHitMeshes();
              for (let i = 0; i < rtList.length; i++) if (rtList[i]) cTargets.push(rtList[i]);
            }
            if (typeof window.ClaimsTotes.getReceptacleHitMeshes === 'function') {
              const recList = window.ClaimsTotes.getReceptacleHitMeshes();
              for (let i = 0; i < recList.length; i++) {
                const m = recList[i];
                if (m && m.userData && m.userData.claimsReceptacle && !m.userData.claimsReceptacle.toteRec) {
                  cTargets.push(m);
                }
              }
            }
            if (cTargets.length > 0) {
              interactRaycaster.far = 4.6;
              const cHits = interactRaycaster.intersectObjects(cTargets, false);
              if (cHits.length > 0 && cHits[0].distance < bestPickDist && cHits[0].object && cHits[0].object.userData) {
                const hitObj = cHits[0].object;
                const ud = hitObj.userData;
                if (ud.claimsToteRef) {
                  uiState.hoveredClaimsTote = ud.claimsToteRef;
                  uiState.hoveredClaimsToteMesh = uiState.hoveredClaimsTote.mesh;
                  uiState.hoveredBackstockCase = null;
                  uiState.hoveredBackstockCaseMesh = null;
                  bestPickDist = cHits[0].distance;
                  focusedInteractible = null;
                } else if (ud.recallItemRef) {
                  uiState.hoveredRecallItem = ud.recallItemRef;
                  uiState.hoveredRecallItemMesh = uiState.hoveredRecallItem.mesh;
                  uiState.hoveredBackstockCase = null;
                  uiState.hoveredBackstockCaseMesh = null;
                  bestPickDist = cHits[0].distance;
                  focusedInteractible = null;
                } else if (ud.recallToteRef) {
                  uiState.hoveredRecallTote = true;
                  uiState.hoveredBackstockCase = null;
                  uiState.hoveredBackstockCaseMesh = null;
                  bestPickDist = cHits[0].distance;
                  focusedInteractible = null;
                } else if (ud.claimsReceptacle) {
                  uiState.hoveredClaimsReceptacle = ud.claimsReceptacle;
                  uiState.hoveredClaimsReceptacleMesh = hitObj;
                  uiState.hoveredBackstockCase = null;
                  uiState.hoveredBackstockCaseMesh = null;
                  bestPickDist = cHits[0].distance;
                  focusedInteractible = null;
                }
              }
            }
          }
        } else if (window.BackstockRacks) {
          window.BackstockRacks.hideGhostPreview();
        }
      } else if (window.BackstockRacks) {
        window.BackstockRacks.hideGhostPreview();
      }

      const focusClickable = Boolean(
        focusedInteractible &&
        CLICK_INTERACTIBLE_TYPES.has(focusedInteractible.type) &&
        (focusedInteractible.type !== 'pallet' || isVendorCheckinPallet(focusedInteractible.target)) &&
        !(focusedInteractible.type === 'trash_can' && !hasHeldReceiptSlips())
      );
      const nextCursor = (uiState.hoveredPhysicalBox || uiState.hoveredInventoryCase || uiState.hoveredSupplyCase || uiState.hoveredBackstockCase || uiState.hoveredBackstockTarget || uiState.hoveredClaimsTote || uiState.hoveredClaimsItem || uiState.hoveredClaimsReceptacle || uiState.hoveredRecallItem || uiState.hoveredRecallTote || uiState.hoveredRecallBottomDock || uiState.hoveredRecallArrangeSpot || focusClickable) ? 'pointer' : '';
      if (renderer && renderer.domElement && lastCanvasCursor !== nextCursor) {
        lastCanvasCursor = nextCursor;
        renderer.domElement.style.cursor = nextCursor;
      }

      // 2. Pulse Animation: Oscillating old-school CRT green phosphor glow
      const now = performance.now() * 0.007; // ~1.1 Hz pulse
      const pulse = 0.32 + 0.18 * Math.sin(now); // sweeps smoothly between 0.14 and 0.50

      if (!uiState.hoveredClaimsTote && !(uiState.hoveredClaimsReceptacle && uiState.hoveredClaimsReceptacle.toteRec) && window.ClaimsTotes && typeof window.ClaimsTotes.setHoveredTote === 'function') {
        window.ClaimsTotes.setHoveredTote(null, 0);
      }

      if (uiState.hoveredPhysicalBox && uiState.hoveredBoxMesh) {
        focusHighlightGroup.visible = true;
        uiState.hoveredBoxMesh.getWorldPosition(_tmpHighlightPos);
        uiState.hoveredBoxMesh.getWorldQuaternion(_tmpHighlightQuat);
        const gp = uiState.hoveredBoxMesh.geometry.parameters || { width: 0.25, height: 0.26, depth: 0.35 };
        focusHighlightGroup.position.copy(_tmpHighlightPos);
        focusHighlightGroup.quaternion.copy(_tmpHighlightQuat);
        focusHighlightGroup.scale.set(gp.width + 0.025, gp.height + 0.025, gp.depth + 0.025);

        const boxOverageMode = Boolean(uiState.overageDeliveryId && !uiState.hoveredPhysicalBox.isCredit);
        crtMaskMat.color.setHex(
          uiState.hoveredPhysicalBox.overageFlagged || boxOverageMode
            ? 0xe879f9
            : (uiState.hoveredPhysicalBox.scanned ? 0x22c55e : 0x38bdf8)
        );
        crtMaskMat.opacity = (uiState.hoveredPhysicalBox.scanned || uiState.hoveredPhysicalBox.overageFlagged) ? 0.34 : pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        setReticleActive(true);
      } else if (uiState.hoveredLabelCase && uiState.hoveredLabelMesh) {
        const lc = uiState.hoveredLabelCase;
        const lm = uiState.hoveredLabelMesh;
        lm.getWorldPosition(_tmpHighlightPos);
        lm.getWorldQuaternion(_tmpHighlightQuat);
        const gp = (lm.geometry && lm.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(_tmpHighlightPos);
        focusHighlightGroup.quaternion.copy(_tmpHighlightQuat);
        focusHighlightGroup.scale.set(gp.width + 0.025, gp.height + 0.025, gp.depth + 0.025);

        const isSupplyLc = Boolean(String(lc.deptNo || '') === '60' || String(lc.vendorNo || '') === '601' || lc.targetRackId === 'claims_steel');
        const isPluLc = Boolean(lc.notScannable && !lc.labeled && !isSupplyLc);

        if (isSupplyLc) {
          crtMaskMat.color.setHex(0xf59e0b);
        } else if (lc.labeled) {
          crtMaskMat.color.setHex(0x22c55e);
        } else if (isPluLc) {
          crtMaskMat.color.setHex(0x4ade80);
        } else {
          crtMaskMat.color.setHex(0xfacc15);
        }
        crtMaskMat.opacity = lc.labeled ? 0.32 : pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        setReticleActive(true);
      } else if (uiState.hoveredInventoryCase && uiState.hoveredInventoryMesh) {
        const ic = uiState.hoveredInventoryCase;
        const im = uiState.hoveredInventoryMesh;
        im.getWorldPosition(_tmpHighlightPos);
        im.getWorldQuaternion(_tmpHighlightQuat);
        const gp = (im.geometry && im.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(_tmpHighlightPos);
        focusHighlightGroup.quaternion.copy(_tmpHighlightQuat);
        focusHighlightGroup.scale.set(gp.width + 0.025, gp.height + 0.025, gp.depth + 0.025);

        const isPlaced = Boolean(ic.placedOnRack && ic.rackSlot);
        const isEligibleRack = isPlaced && window.BackstockRacks && window.BackstockRacks.isInventoryEligibleRack(ic.rackSlot.rackId);
        const binLabel = isPlaced && window.BackstockRacks ? window.BackstockRacks.formatSlotDesignation(ic.rackSlot) : '';

        if (!isPlaced) {
          crtMaskMat.color.setHex(0xef4444);
        } else if (!isEligibleRack) {
          crtMaskMat.color.setHex(0xf59e0b);
        } else if (ic.inventoried) {
          crtMaskMat.color.setHex(0x22c55e);
        } else {
          crtMaskMat.color.setHex(0x38bdf8);
        }
        crtMaskMat.opacity = (isEligibleRack && ic.inventoried) ? 0.34 : pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        setReticleActive(true);
      } else if (uiState.hoveredSupplyCase && uiState.hoveredSupplyMesh) {
        const scBox = uiState.hoveredSupplyCase;
        const sm = uiState.hoveredSupplyMesh;
        sm.getWorldPosition(_tmpHighlightPos);
        sm.getWorldQuaternion(_tmpHighlightQuat);
        const gp = (sm.geometry && sm.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(_tmpHighlightPos);
        focusHighlightGroup.quaternion.copy(_tmpHighlightQuat);
        focusHighlightGroup.scale.set(gp.width + 0.025, gp.height + 0.025, gp.depth + 0.025);

        const isSupplyBox = Boolean(
          window.BackstockRacks &&
          typeof window.BackstockRacks.isSupplyCase === 'function' &&
          window.BackstockRacks.isSupplyCase(scBox)
        );
        const orderLockedToday = Boolean(
          window.DSDReceipts &&
          typeof window.DSDReceipts.isSupplyOrderSubmittedToday === 'function' &&
          window.DSDReceipts.isSupplyOrderSubmittedToday()
        );
        const isPlaced = Boolean(scBox.placedOnRack && scBox.rackSlot);
        const binLabel = isPlaced && window.BackstockRacks ? window.BackstockRacks.formatSlotDesignation(scBox.rackSlot) : 'PALLET';
        crtMaskMat.color.setHex(orderLockedToday ? 0xf59e0b : (isSupplyBox ? 0x22c55e : 0xf59e0b));
        crtMaskMat.opacity = pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        setReticleActive(true);
      } else if (uiState.hoveredBackstockTarget && carryingBackstock) {
        focusHighlightGroup.visible = false;
        setReticleActive(true);
      } else if (uiState.hoveredBackstockCase && uiState.hoveredBackstockCaseMesh) {
        const bc = uiState.hoveredBackstockCase;
        const bm = uiState.hoveredBackstockCaseMesh;
        const pickCheck = (window.BackstockRacks && typeof window.BackstockRacks.canPickupCase === 'function')
          ? window.BackstockRacks.canPickupCase(bc)
          : { ok: true };
        const isPickBlocked = Boolean(pickCheck && !pickCheck.ok);
        bm.getWorldPosition(_tmpHighlightPos);
        bm.getWorldQuaternion(_tmpHighlightQuat);
        const gp = (bm.geometry && bm.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(_tmpHighlightPos);
        focusHighlightGroup.quaternion.copy(_tmpHighlightQuat);
        focusHighlightGroup.scale.set(gp.width + 0.025, gp.height + 0.025, gp.depth + 0.025);
        crtMaskMat.color.setHex(isPickBlocked ? 0xef4444 : 0xf59e0b);
        crtMaskMat.opacity = pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        setReticleActive(true);
      } else if (uiState.hoveredClaimsTote && uiState.hoveredClaimsToteMesh) {
        const tote = uiState.hoveredClaimsTote;
        focusHighlightGroup.visible = false;
        if (window.ClaimsTotes && typeof window.ClaimsTotes.setHoveredTote === 'function') {
          window.ClaimsTotes.setHoveredTote(tote, pulse);
        }
        setReticleActive(true);
      } else if (uiState.hoveredClaimsItem && uiState.hoveredClaimsItemMesh) {
        const item = uiState.hoveredClaimsItem;
        const im = uiState.hoveredClaimsItemMesh;
        im.getWorldPosition(_tmpHighlightPos);
        im.getWorldQuaternion(_tmpHighlightQuat);
        if (item.localCenter) {
          _tmpHighlightOffset.copy(item.localCenter);
        } else {
          _tmpHighlightOffset.set(0, 0.06, 0);
        }
        _tmpHighlightOffset.applyQuaternion(_tmpHighlightQuat);
        const lSize = item.localSize || { x: 0.12, y: 0.12, z: 0.12 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(_tmpHighlightPos).add(_tmpHighlightOffset);
        focusHighlightGroup.quaternion.copy(_tmpHighlightQuat);
        focusHighlightGroup.scale.set(lSize.x + 0.014, lSize.y + 0.014, lSize.z + 0.014);
        crtMaskMat.color.setHex(item.scannerConfirmed ? 0x22c55e : 0x38bdf8);
        crtMaskMat.opacity = Math.min(0.20, pulse * 0.45);
        crtWireMat.opacity = Math.min(1.0, pulse + 0.45);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.55);
        setReticleActive(true);
      } else if (arrangingRecallItem) {
        focusHighlightGroup.visible = false;
        setReticleActive(Boolean(uiState.hoveredRecallArrangeSpot));
      } else if (uiState.hoveredRecallItem && uiState.hoveredRecallItemMesh) {
        const item = uiState.hoveredRecallItem;
        const im = uiState.hoveredRecallItemMesh;
        im.getWorldPosition(_tmpHighlightPos);
        im.getWorldQuaternion(_tmpHighlightQuat);
        if (item.localCenter) {
          _tmpHighlightOffset.copy(item.localCenter);
        } else {
          _tmpHighlightOffset.set(0, 0.06, 0);
        }
        _tmpHighlightOffset.applyQuaternion(_tmpHighlightQuat);
        const lSize = item.localSize || { x: 0.11, y: 0.12, z: 0.11 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(_tmpHighlightPos).add(_tmpHighlightOffset);
        focusHighlightGroup.quaternion.copy(_tmpHighlightQuat);
        focusHighlightGroup.scale.set(lSize.x + 0.014, lSize.y + 0.014, lSize.z + 0.014);
        crtMaskMat.color.setHex(holdingRecallTote ? 0x22c55e : 0xf59e0b);
        crtMaskMat.opacity = Math.min(0.22, pulse * 0.5);
        crtWireMat.opacity = Math.min(1.0, pulse + 0.45);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.55);
        setReticleActive(true);
      } else if (uiState.hoveredRecallBottomDock && recallCart) {
        const bottomY = (recallCart.tierTopY && recallCart.tierTopY[0]) || 0.156;
        focusHighlightGroup.visible = true;
        focusHighlightGroup.quaternion.set(0, 0, 0, 1);
        crtMaskMat.color.setHex(0x38bdf8);
        focusHighlightGroup.position.set(recallCart.x, bottomY + 0.10, recallCart.z);
        focusHighlightGroup.scale.set(0.42, 0.20, 0.54);
        crtMaskMat.opacity = pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        setReticleActive(true);
      } else if (uiState.hoveredClaimsReceptacle) {
        const rec = uiState.hoveredClaimsReceptacle;
        const recallState = (holdingRecallTote && window.ClaimsTotes && typeof window.ClaimsTotes.getRecallState === 'function')
          ? window.ClaimsTotes.getRecallState()
          : null;
        const toteReadyToDump = Boolean(recallState && recallState.allItemsCollected);
        const canDepositNow = Boolean(holdingClaimsItem || (holdingRecallTote && toteReadyToDump));
        if (rec.toteRec) {
          focusHighlightGroup.visible = false;
          if (window.ClaimsTotes && typeof window.ClaimsTotes.setHoveredTote === 'function') {
            window.ClaimsTotes.setHoveredTote(rec.toteRec, pulse, canDepositNow ? 0x22c55e : 0xef4444);
          }
        } else if (rec.boxCenter && rec.boxSize) {
          focusHighlightGroup.visible = true;
          focusHighlightGroup.quaternion.set(0, 0, 0, 1);
          focusHighlightGroup.position.copy(rec.boxCenter);
          focusHighlightGroup.scale.set(rec.boxSize.x + 0.04, rec.boxSize.y + 0.04, rec.boxSize.z + 0.04);
          crtMaskMat.color.setHex(canDepositNow ? 0x22c55e : (holdingRecallTote ? 0xf59e0b : 0xef4444));
          crtMaskMat.opacity = pulse;
          crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
          crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        }
        setReticleActive(true);
      } else if (holdingRecallTote || holdingClaimsItem) {
        focusHighlightGroup.visible = false;
        setReticleActive(false);
      } else if (uiState.hoveredRecallTote && recallCart) {
        const bottomY = (recallCart.tierTopY && recallCart.tierTopY[0]) || 0.156;
        focusHighlightGroup.visible = true;
        focusHighlightGroup.quaternion.set(0, 0, 0, 1);
        crtMaskMat.color.setHex(0x22c55e);
        focusHighlightGroup.position.set(recallCart.x, bottomY + 0.10, recallCart.z);
        focusHighlightGroup.scale.set(0.41, 0.21, 0.53);
        crtMaskMat.opacity = Math.min(0.24, pulse * 0.55);
        crtWireMat.opacity = Math.min(1.0, pulse + 0.45);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.55);
        setReticleActive(true);
      } else if (focusedInteractible) {
        focusHighlightGroup.visible = true;
        if (focusedInteractible.boxQuaternion) {
          focusHighlightGroup.quaternion.copy(focusedInteractible.boxQuaternion);
        } else if (focusedInteractible.type === 'pallet' && focusedInteractible.target && focusedInteractible.target.mesh) {
          focusHighlightGroup.quaternion.copy(focusedInteractible.target.mesh.quaternion);
        } else {
          focusHighlightGroup.quaternion.set(0, 0, 0, 1);
        }
        const isTimeclockBlocked = Boolean(
          focusedInteractible.type === 'timeclock' &&
          !(window.ShiftClock && typeof window.ShiftClock.isAfterNoon === 'function' && window.ShiftClock.isAfterNoon())
        );
        const isTrashBlocked = Boolean(focusedInteractible.type === 'trash_can' && !hasHeldReceiptSlips());
        crtMaskMat.color.setHex((isTimeclockBlocked || isTrashBlocked) ? 0xef4444 : 0x22c55e);
        focusHighlightGroup.position.copy(focusedInteractible.boxCenter);
        focusHighlightGroup.scale.copy(focusedInteractible.boxSize);
        crtMaskMat.opacity = pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        setReticleActive(true);
      } else {
        focusHighlightGroup.visible = false;
        setReticleActive(Boolean(player.hitchedPallet));
      }

      if (window.InfotipRenderer && window.InfotipAdapters && hudInfotipEl) {
        const blocking = isBlockingModalOpen() || pointerOccluded || (container && container.classList.contains('main-menu-open'));
        const isAimCenterNow = Boolean(isPointerLocked || usingTouchAim || isTouchDevice);
        const recallSt = (!blocking && window.ClaimsTotes && typeof window.ClaimsTotes.getRecallState === 'function')
          ? window.ClaimsTotes.getRecallState()
          : null;
        const battFloor = Math.floor(jackBattery);
        const infotipNowMs = performance.now();
        const stateChanged = (
          _infotipLastState.blocking !== blocking ||
          _infotipLastState.isTouch !== isTouchDevice ||
          _infotipLastState.isAimCenter !== isAimCenterNow ||
          _infotipLastState.overageDeliveryId !== uiState.overageDeliveryId ||
          _infotipLastState.hoveredPhysicalBox !== uiState.hoveredPhysicalBox ||
          _infotipLastState.hoveredBoxMesh !== uiState.hoveredBoxMesh ||
          _infotipLastState.hoveredLabelCase !== uiState.hoveredLabelCase ||
          _infotipLastState.hoveredInventoryCase !== uiState.hoveredInventoryCase ||
          _infotipLastState.hoveredSupplyCase !== uiState.hoveredSupplyCase ||
          _infotipLastState.hoveredBackstockTarget !== uiState.hoveredBackstockTarget ||
          _infotipLastState.hoveredBackstockCase !== uiState.hoveredBackstockCase ||
          _infotipLastState.hoveredClaimsTote !== uiState.hoveredClaimsTote ||
          _infotipLastState.hoveredClaimsItem !== uiState.hoveredClaimsItem ||
          _infotipLastState.hoveredRecallItem !== uiState.hoveredRecallItem ||
          _infotipLastState.hoveredRecallArrangeSpot !== uiState.hoveredRecallArrangeSpot ||
          _infotipLastState.hoveredRecallBottomDock !== uiState.hoveredRecallBottomDock ||
          _infotipLastState.hoveredClaimsReceptacle !== uiState.hoveredClaimsReceptacle ||
          _infotipLastState.hoveredRecallTote !== uiState.hoveredRecallTote ||
          _infotipLastState.focusedInteractible !== focusedInteractible ||
          _infotipLastState.carryingBackstock !== carryingBackstock ||
          _infotipLastState.holdingClaimsItem !== holdingClaimsItem ||
          _infotipLastState.holdingRecallTote !== holdingRecallTote ||
          _infotipLastState.arrangingRecallItem !== arrangingRecallItem ||
          _infotipLastState.hasElectricJack !== player.hasElectricJack ||
          _infotipLastState.hitchedPallet !== player.hitchedPallet ||
          _infotipLastState.battFloor !== battFloor ||
          _infotipLastState.jackDockedAtCharger !== jackDockedAtCharger ||
          (!isAimCenterNow && (_infotipLastState.ndcX !== aimNDC.x || _infotipLastState.ndcY !== aimNDC.y))
        );
        const hasActiveTarget = Boolean(
          !blocking && (
            uiState.hoveredPhysicalBox || uiState.hoveredLabelCase || uiState.hoveredInventoryCase ||
            uiState.hoveredSupplyCase || (uiState.hoveredBackstockTarget && carryingBackstock) ||
            uiState.hoveredBackstockCase || uiState.hoveredClaimsTote || uiState.hoveredClaimsItem ||
            arrangingRecallItem || uiState.hoveredRecallItem || uiState.hoveredRecallBottomDock ||
            uiState.hoveredClaimsReceptacle || uiState.hoveredRecallTote || focusedInteractible ||
            carryingBackstock || holdingClaimsItem || holdingRecallTote ||
            player.hasElectricJack || player.hitchedPallet
          )
        );
        const needsPeriodicRefresh = hasActiveTarget && (_lastInfotipEvalMs < 0 || (infotipNowMs - _lastInfotipEvalMs) >= 140);
        if (stateChanged || needsPeriodicRefresh) {
          _lastInfotipEvalMs = infotipNowMs;
          _infotipLastState.blocking = blocking;
          _infotipLastState.isTouch = isTouchDevice;
          _infotipLastState.isAimCenter = isAimCenterNow;
          _infotipLastState.overageDeliveryId = uiState.overageDeliveryId;
          _infotipLastState.hoveredPhysicalBox = uiState.hoveredPhysicalBox;
          _infotipLastState.hoveredBoxMesh = uiState.hoveredBoxMesh;
          _infotipLastState.hoveredLabelCase = uiState.hoveredLabelCase;
          _infotipLastState.hoveredInventoryCase = uiState.hoveredInventoryCase;
          _infotipLastState.hoveredSupplyCase = uiState.hoveredSupplyCase;
          _infotipLastState.hoveredBackstockTarget = uiState.hoveredBackstockTarget;
          _infotipLastState.hoveredBackstockCase = uiState.hoveredBackstockCase;
          _infotipLastState.hoveredClaimsTote = uiState.hoveredClaimsTote;
          _infotipLastState.hoveredClaimsItem = uiState.hoveredClaimsItem;
          _infotipLastState.hoveredRecallItem = uiState.hoveredRecallItem;
          _infotipLastState.hoveredRecallArrangeSpot = uiState.hoveredRecallArrangeSpot;
          _infotipLastState.hoveredRecallBottomDock = uiState.hoveredRecallBottomDock;
          _infotipLastState.hoveredClaimsReceptacle = uiState.hoveredClaimsReceptacle;
          _infotipLastState.hoveredRecallTote = uiState.hoveredRecallTote;
          _infotipLastState.focusedInteractible = focusedInteractible;
          _infotipLastState.carryingBackstock = carryingBackstock;
          _infotipLastState.holdingClaimsItem = holdingClaimsItem;
          _infotipLastState.holdingRecallTote = holdingRecallTote;
          _infotipLastState.arrangingRecallItem = arrangingRecallItem;
          _infotipLastState.hasElectricJack = player.hasElectricJack;
          _infotipLastState.hitchedPallet = player.hitchedPallet;
          _infotipLastState.battFloor = battFloor;
          _infotipLastState.jackDockedAtCharger = jackDockedAtCharger;
          _infotipLastState.ndcX = aimNDC.x;
          _infotipLastState.ndcY = aimNDC.y;

          let spec = null;
          if (!blocking && hasActiveTarget) {
            _infotipResolveCtx.isBlockingModalOpen = false;
            _infotipResolveCtx.isTouch = isTouchDevice;
            _infotipResolveCtx.deliverySystem = DeliverySystem;
            _infotipResolveCtx.overageDeliveryId = uiState.overageDeliveryId;
            _infotipResolveCtx.hoveredPhysicalBox = uiState.hoveredPhysicalBox;
            _infotipResolveCtx.hoveredBoxMesh = uiState.hoveredBoxMesh;
            _infotipResolveCtx.hoveredLabelCase = uiState.hoveredLabelCase;
            _infotipResolveCtx.hoveredInventoryCase = uiState.hoveredInventoryCase;
            _infotipResolveCtx.hoveredSupplyCase = uiState.hoveredSupplyCase;
            _infotipResolveCtx.hoveredBackstockTarget = uiState.hoveredBackstockTarget;
            _infotipResolveCtx.hoveredBackstockCase = uiState.hoveredBackstockCase;
            _infotipResolveCtx.hoveredClaimsTote = uiState.hoveredClaimsTote;
            _infotipResolveCtx.hoveredClaimsItem = uiState.hoveredClaimsItem;
            _infotipResolveCtx.hoveredRecallItem = uiState.hoveredRecallItem;
            _infotipResolveCtx.hoveredRecallArrangeSpot = uiState.hoveredRecallArrangeSpot;
            _infotipResolveCtx.hoveredRecallBottomDock = uiState.hoveredRecallBottomDock;
            _infotipResolveCtx.hoveredClaimsReceptacle = uiState.hoveredClaimsReceptacle;
            _infotipResolveCtx.hoveredRecallTote = uiState.hoveredRecallTote;
            _infotipResolveCtx.focusedInteractible = focusedInteractible;
            _infotipResolveCtx.carryingBackstock = carryingBackstock;
            _infotipResolveCtx.holdingClaimsItem = holdingClaimsItem;
            _infotipResolveCtx.holdingRecallTote = holdingRecallTote;
            _infotipResolveCtx.arrangingRecallItem = arrangingRecallItem;
            _infotipResolveCtx.recallState = recallSt;
            _infotipResolveCtx.hasElectricJack = player.hasElectricJack;
            _infotipResolveCtx.hitchedPallet = player.hitchedPallet;
            _infotipResolveCtx.jackBattery = jackBattery;
            _infotipResolveCtx.jackDockedAtCharger = jackDockedAtCharger;
            spec = window.InfotipAdapters.resolveActiveSpec(_infotipResolveCtx);
          }
          _infotipRenderOpts.isTouch = isTouchDevice;
          _infotipRenderOpts.isAimCenter = isAimCenterNow;
          _infotipRenderOpts.pointerNDC = aimNDC;
          window.InfotipRenderer.renderToElement(hudInfotipEl, spec, _infotipRenderOpts);
        }
      }

      // Action button stack: Scanner [F] on all devices; context action buttons (Use / Jack / Scan) on touch devices only
      if (mobileBtnDock) {
        const setBtnState = (el, label) => {
          if (!el) return;
          const d = label ? 'inline-flex' : 'none';
          if (el._lastDisp !== d) {
            el._lastDisp = d;
            el.style.display = d;
          }
          if (label && el._lastTxt !== label) {
            el._lastTxt = label;
            el.textContent = label;
          }
        };
        if (isBlockingModalOpen()) {
          if (mobileBtnDock._lastDisp !== 'none') {
            mobileBtnDock._lastDisp = 'none';
            mobileBtnDock.style.display = 'none';
          }
        } else {
          if (mobileBtnDock._lastDisp !== 'flex') {
            mobileBtnDock._lastDisp = 'flex';
            mobileBtnDock.style.display = 'flex';
          }
          let useLabel = '';
          let jackLabel = '';
          let caseScanLabel = '';

          if (isTouchDevice) {
            if (carryingBackstock) {
              if (uiState.hoveredBackstockTarget) useLabel = 'Place';
            } else if (arrangingRecallItem) {
              if (uiState.hoveredRecallArrangeSpot) useLabel = 'Place';
            } else if (holdingRecallTote) {
              if (uiState.hoveredRecallItem) useLabel = 'Collect';
              else if (uiState.hoveredRecallBottomDock) useLabel = 'Set Tote';
              else if (uiState.hoveredClaimsReceptacle) useLabel = 'Dump Tote';
            } else if (holdingClaimsItem) {
              if (uiState.hoveredClaimsReceptacle) useLabel = 'Place';
            } else if (focusedInteractible) {
              if (focusedInteractible.type === 'dock_button' || focusedInteractible.type === 'side_door_button') {
                useLabel = 'Door';
              } else if (focusedInteractible.type === 'terminal') {
                useLabel = 'Terminal';
              } else if (focusedInteractible.type === 'driver') {
                useLabel = 'Driver';
              } else if (
                ['desk_papers', 'filing_folder', 'file_cabinet', 'printer'].includes(focusedInteractible.type) ||
                (focusedInteractible.type === 'trash_can' && hasHeldReceiptSlips())
              ) {
                useLabel = 'Inspect';
              } else if (focusedInteractible.type === 'pallet' && isVendorCheckinPallet(focusedInteractible.target)) {
                useLabel = 'Check In';
              } else if (focusedInteractible.type === 'timeclock') {
                useLabel = (window.ShiftClock && typeof window.ShiftClock.isAfterNoon === 'function' && window.ShiftClock.isAfterNoon())
                  ? 'Punch Out'
                  : 'Timeclock';
              }
            }
            if (!useLabel && !carryingBackstock && !holdingClaimsItem && !holdingRecallTote && !arrangingRecallItem) {
              if (!player.hasElectricJack && uiState.hoveredBackstockCase) {
                useLabel = 'Pick Up';
              } else if (uiState.hoveredClaimsTote && !uiState.hoveredClaimsTote.isRed) {
                useLabel = uiState.hoveredClaimsTote.isOpen ? 'Close Tote' : 'Open Tote';
              } else if (!player.hasElectricJack && uiState.hoveredClaimsItem && uiState.hoveredClaimsItem.scannerConfirmed) {
                useLabel = 'Take Item';
              } else if (!player.hasElectricJack && uiState.hoveredRecallItem) {
                useLabel = 'Move Item';
              } else if (!player.hasElectricJack && uiState.hoveredRecallTote) {
                useLabel = 'Take Tote';
              }
            }

            if (player.hitchedPallet) {
              jackLabel = 'Drop Pallet';
            } else if (player.hasElectricJack) {
              jackLabel = (focusedInteractible && focusedInteractible.type === 'pallet') ? 'Hitch Pallet' : 'Park Jack';
            } else if (
              !carryingBackstock &&
              !holdingClaimsItem &&
              !holdingRecallTote &&
              !arrangingRecallItem &&
              !uiState.scannerModalOpen &&
              focusedInteractible &&
              focusedInteractible.type === 'electric_jack'
            ) {
              jackLabel = 'Take Jack';
            }

            if (canTriggerContextScanAction()) {
              const dr = window.DSDReceipts;
              const racks = window.BackstockRacks;
              const scr = (dr && typeof dr.getScannerScreen === 'function') ? dr.getScannerScreen() : 'home';
              const supplyDone = Boolean(dr && typeof dr.isSupplyOrderSubmittedToday === 'function' && dr.isSupplyOrderSubmittedToday());
              const invDone = Boolean(dr && typeof dr.isInventoryAuditFinalized === 'function' && dr.isInventoryAuditFinalized());

              if (uiState.hoveredPhysicalBox) {
                const hb = uiState.hoveredPhysicalBox;
                if (!hb.notScannable && !hb.overageFlagged) {
                  if (uiState.scannerModalOpen) {
                    if (['scanning', 'list', 'totals'].includes(scr)) caseScanLabel = 'Scan Box';
                  } else {
                    const sess = (hb.deliveryId && DeliverySystem.getSessionForDelivery)
                      ? DeliverySystem.getSessionForDelivery(hb.deliveryId)
                      : null;
                    const targetDeliv = (sess && sess.delivery) || DeliverySystem.activeDelivery;
                    if (targetDeliv && targetDeliv.receiptCreated && !targetDeliv.completed) {
                      caseScanLabel = 'Scan Box';
                    }
                  }
                }
              } else if (uiState.hoveredLabelCase) {
                const lc = uiState.hoveredLabelCase;
                const isSup = Boolean(String(lc.deptNo || '') === '60' || String(lc.vendorNo || '') === '601' || lc.targetRackId === 'claims_steel');
                if (!lc.labeled && !lc.notScannable && !isSup) caseScanLabel = 'Scan Case';
              } else if (uiState.hoveredInventoryCase) {
                const ic = uiState.hoveredInventoryCase;
                const isPlaced = Boolean(ic.placedOnRack && ic.rackSlot);
                const isEligible = isPlaced && racks && typeof racks.isInventoryEligibleRack === 'function' && racks.isInventoryEligibleRack(ic.rackSlot.rackId);
                if (isEligible && !(ic.notScannable && !ic.labeled) && !invDone) caseScanLabel = 'Scan Case';
              } else if (uiState.hoveredSupplyCase) {
                const scBox = uiState.hoveredSupplyCase;
                const isSup = Boolean(racks && typeof racks.isSupplyCase === 'function' && racks.isSupplyCase(scBox));
                if (isSup && !supplyDone) caseScanLabel = 'Scan SKU';
              } else if (uiState.hoveredClaimsItem) {
                if (!uiState.hoveredClaimsItem.claimed && !uiState.hoveredClaimsItem.scannerConfirmed) caseScanLabel = 'Scan Claim';
              } else if (!uiState.scannerModalOpen && uiState.hoveredBackstockCase) {
                const bc = uiState.hoveredBackstockCase;
                const isSup = Boolean(racks && typeof racks.isSupplyCase === 'function' && racks.isSupplyCase(bc));
                if (isSup) {
                  if (!supplyDone) caseScanLabel = 'Scan SKU';
                } else if (bc.placedOnRack && bc.rackSlot) {
                  const isEligible = racks && typeof racks.isInventoryEligibleRack === 'function' && racks.isInventoryEligibleRack(bc.rackSlot.rackId);
                  if (isEligible && !(bc.notScannable && !bc.labeled) && !invDone) caseScanLabel = 'Scan Case';
                } else if (!bc.labeled && !bc.notScannable) {
                  caseScanLabel = 'Scan Case';
                }
              } else if (uiState.scannerModalOpen) {
                if (scr === 'scanning') {
                  const ad = DeliverySystem.activeDelivery;
                  const phys = (ad && Array.isArray(ad.physicalBoxes)) ? ad.physicalBoxes : [];
                  const cred = (ad && Array.isArray(ad.creditBoxes)) ? ad.creditBoxes : [];
                  const hasNonPlu = phys.concat(cred).some((b) => b && !b.scanned && !b.overageFlagged && !b.notScannable);
                  if (hasNonPlu) caseScanLabel = 'Scan Box';
                } else if (scr === 'label-cases') {
                  caseScanLabel = 'Scan Case';
                } else if (scr === 'inventory' && !invDone) {
                  caseScanLabel = 'Scan Case';
                } else if ((scr === 'supply' || scr === 'supply-cart') && !supplyDone) {
                  caseScanLabel = 'Scan SKU';
                } else if (scr === 'damage') {
                  caseScanLabel = 'Scan Claim';
                }
              }
            }
          }

          let scanLabel = '';
          const scanBlocked = Boolean(
            carryingBackstock ||
            holdingClaimsItem ||
            holdingRecallTote ||
            arrangingRecallItem ||
            player.hasElectricJack ||
            player.hitchedPallet ||
            uiState.bolModalOpen
          );
          if (!scanBlocked) {
            scanLabel = uiState.scannerModalOpen ? 'Close Scan' : 'Scanner';
          }

          setBtnState(btnTouchDoor, useLabel);
          setBtnState(btnTouchAction, jackLabel);
          setBtnState(btnTouchCaseScan, caseScanLabel);
          setBtnState(btnTouchScan, scanLabel);
        }
      }

      // 3. Animate Dock Doors & 3-Lens Signal Beacons (2D DSD Sim Tutorial Standard)
      // Signal States:
      // - STEADY GREEN: Closed & empty (secure dock)
      // - FLASHING YELLOW: Closed, truck backed in and waiting
      // - STEADY YELLOW: Open, driver on dock / active unloading
      // - STEADY RED: Open with nobody there (< 5 in-game mins)
      // - FLASHING RED: Open 5+ in-game mins unattended (first warning level, before points are lost at 10 mins)
      dockDoors.forEach(dd => {
        const targetProg = dd.isOpen ? 1.0 : 0.0;
        if (dd.currentProgress < targetProg) {
          dd.currentProgress = Math.min(targetProg, dd.currentProgress + (dt / DOCK_DOOR_DURATION));
        } else if (dd.currentProgress > targetProg) {
          dd.currentProgress = Math.max(targetProg, dd.currentProgress - (dt / DOCK_DOOR_DURATION));
        }

        // Cosine ease-in-out for realistic motor start, steady travel, and braking
        if (dd._lastCurtainProg !== dd.currentProgress) {
          dd._lastCurtainProg = dd.currentProgress;
          const easedProg = 0.5 - 0.5 * Math.cos(dd.currentProgress * Math.PI);
          const openOffset = easedProg * (doorHeight - 0.2);
          dd.curtainMesh.position.y = doorHeight / 2 + openOffset;
          dd.curtainMesh.scale.y = Math.max(0.05, 1 - easedProg * 0.95);
        }

        // Sync 3D trailer & semi cab variant visibility strictly with docked state
        if (dd.trailerGroup) {
          dd.trailerGroup.visible = Boolean(dd.hasTrailer);
          if (dd.whSemiGroup) dd.whSemiGroup.visible = (dd.trailerType !== 'vendor_truck');
          if (dd.vendorSemiGroup) dd.vendorSemiGroup.visible = (dd.trailerType === 'vendor_truck');
        }

        // Determine if truck is waiting or driver is present on dock for this bay
        let bayHasTruckWaiting = false;
        let bayHasDriverPresent = false;
        let driverInsideAuthorized = false;

        if (typeof DeliverySystem !== 'undefined' && DeliverySystem && typeof DeliverySystem.getSessionForBay === 'function') {
          const baySession = DeliverySystem.getSessionForBay(dd.id);
          if (baySession && baySession.delivery && !baySession.delivery.completed && !baySession.delivery.refused) {
            const ad = baySession.delivery;
            if (ad.type === 'warehouse') {
              if (baySession.state === 'AWAITING_PLAYER_UNLOAD' || baySession.state === 'MOVING_TO_DOCK_STAND') {
                bayHasDriverPresent = true;
                driverInsideAuthorized = true;
              } else if (baySession.state === 'WAITING_CHECKIN' || baySession.state === 'OUTSIDE_WAITING') {
                bayHasTruckWaiting = true;
              }
            } else if (ad.type === 'vendor_truck') {
              if (
                baySession.state === 'VENDOR_WALK_TO_BAY' ||
                baySession.state === 'VENDOR_WAIT_DOOR_OPEN' ||
                baySession.state === 'VENDOR_GETTING_OWN_JACK' ||
                baySession.state === 'VENDOR_UNLOADING_DRIVE_IN' ||
                baySession.state === 'VENDOR_UNLOADING_DRIVE_OUT' ||
                baySession.state === 'VENDOR_RETURNING_JACK'
              ) {
                bayHasDriverPresent = true;
                driverInsideAuthorized = true;
              } else if (baySession.state === 'WAITING_CHECKIN' || baySession.state === 'OUTSIDE_WAITING') {
                bayHasTruckWaiting = true;
              }
            }
          }
        }

        // Trailer roll-up door remains CLOSED unless driver is checked in inside the building AND player opened dock door
        const prevTrailerOpen = Boolean(dd.trailerDoorOpen);
        dd.trailerDoorOpen = Boolean(dd.hasTrailer && dd.isOpen && dd.currentProgress >= 0.72 && driverInsideAuthorized);
        if (dd.trailerDoorOpen && !prevTrailerOpen) {
          SoundSystem.playDoorMotor(1.2);
        }
        const targetTrailerProg = (dd.hasTrailer && dd.trailerDoorOpen) ? 1.0 : 0.0;
        if (dd.trailerDoorProgress < targetTrailerProg) {
          dd.trailerDoorProgress = Math.min(targetTrailerProg, dd.trailerDoorProgress + (dt / 1.4));
        } else if (dd.trailerDoorProgress > targetTrailerProg) {
          dd.trailerDoorProgress = Math.max(targetTrailerProg, dd.trailerDoorProgress - (dt / 1.4));
        }
        if (dd.trailerDoorCurtain && dd._lastTrailerCurtainProg !== dd.trailerDoorProgress) {
          dd._lastTrailerCurtainProg = dd.trailerDoorProgress;
          const tH = dd.trailerDoorH || (doorHeight - 0.14);
          const easedTD = 0.5 - 0.5 * Math.cos(dd.trailerDoorProgress * Math.PI);
          dd.trailerDoorCurtain.position.y = tH / 2 + easedTD * (tH - 0.25);
          dd.trailerDoorCurtain.scale.y = Math.max(0.05, 1 - easedTD * 0.94);
        }

        // Dynamic warehouse trailer temperature curtains (auto-roll up when both front pallets are moved/removed)
        if (Array.isArray(dd.tempCurtains)) {
          for (let ci = 0; ci < dd.tempCurtains.length; ci++) {
            const tc = dd.tempCurtains[ci];
            if (!tc) continue;
            if (!tc.active || !dd.hasTrailer || dd.trailerType !== 'warehouse') {
              if (tc.group && tc.group.visible) tc.group.visible = false;
              continue;
            }
            if (tc.group && !tc.group.visible) tc.group.visible = true;

            if (!tc.isOpen && Array.isArray(tc.frontPallets) && tc.frontPallets.length > 0) {
              let occupiedCount = 0;
              for (let fi = 0; fi < tc.frontPallets.length; fi++) {
                const fp = tc.frontPallets[fi];
                const pObj = pallets.find((p) => p && p.data && p.data.id === fp.id);
                if (!pObj) continue;
                if (pObj.isHitched || pObj === player.hitchedPallet) continue;
                if (pObj.data && pObj.data.status !== 'UNLOADED') continue;
                if (Math.hypot(pObj.position.x - fp.slotX, pObj.position.z - fp.slotZ) > 0.85) continue;
                occupiedCount += 1;
              }
              if (occupiedCount === 0) {
                tc.isOpen = true;
                SoundSystem.playDoorMotor(1.0);
                const zTxt = tc.zoneBehind === 'F' ? 'Frozen (-10°F)' : 'Chilled (34°F)';
                showNotification(`[[ico:snowflake]] ${zTxt} bulkhead curtain rolling up!`, 'status');
              }
            }

            const targetTcProg = tc.isOpen ? 1.0 : 0.0;
            if (tc.progress < targetTcProg) {
              tc.progress = Math.min(targetTcProg, tc.progress + (dt / 1.1));
            } else if (tc.progress > targetTcProg) {
              tc.progress = Math.max(targetTcProg, tc.progress - (dt / 1.1));
            }
            if (tc.curtainMesh && tc._lastProg !== tc.progress) {
              tc._lastProg = tc.progress;
              const cH = tc.curtainH || (doorHeight - 0.14);
              const easedTc = 0.5 - 0.5 * Math.cos(tc.progress * Math.PI);
              tc.curtainMesh.position.y = cH / 2 + easedTc * (cH - 0.22);
              tc.curtainMesh.scale.y = Math.max(0.05, 1 - easedTc * 0.94);
              if (tc.pilotMat && tc.pilotMat.color) {
                tc.pilotMat.color.setHex(tc.progress >= 0.70 ? 0x22c55e : (tc.zoneBehind === 'F' ? 0x38bdf8 : 0x22d3ee));
              }
            }
          }
        }

        // Check if WarehouseTrucks has an active trailer or awaiting pallets on this bay
        if (window.WarehouseTrucks && typeof window.WarehouseTrucks.getBayState === 'function') {
          const whBay = window.WarehouseTrucks.getBayState(dd.id);
          if (whBay && whBay.warehouseActive) {
            if (whBay.waiting) bayHasTruckWaiting = true;
            else bayHasDriverPresent = true;
          }
        }

        // Any docked trailer or remaining bay pallets keeps the dock active (never an empty-door red warning)
        let hasUncollectedPallet = false;
        for (let pi = 0; pi < pallets.length; pi++) {
          const p = pallets[pi];
          if (p && p.data && p.data.truck === dd.id && p.data.status === 'UNLOADED') {
            hasUncollectedPallet = true;
            break;
          }
        }
        if ((dd.hasTrailer || hasUncollectedPallet) && !bayHasDriverPresent) {
          bayHasTruckWaiting = true;
        }
        const bayHasDeliveryOrTrailer = Boolean(dd.hasTrailer || bayHasDriverPresent || bayHasTruckWaiting);
        dd._hasActiveCargoOrTrailer = bayHasDeliveryOrTrailer;

        const flashOn = (Math.floor(performance.now() / 300) % 2 === 0);

        if (!dd.isOpen) {
          // DOOR IS CLOSED:
          dd.timeOpen = 0;
          if (window.ShiftClock) window.ShiftClock.stopDoorTimer('dock' + dd.id);
          if (bayHasTruckWaiting) {
            // Flashing Yellow: Truck waiting outside
            setBeaconSignals(dd, 'amber', flashOn, flashOn ? '#f59e0b' : '#334155');
          } else {
            // Steady Green: Closed & empty
            setBeaconSignals(dd, 'green', true, '#22c55e');
          }
        } else {
          // DOOR IS OPEN:
          if (bayHasDeliveryOrTrailer) {
            // Steady Yellow: Trailer, truck, driver, or active delivery is on this dock
            if (window.ShiftClock) window.ShiftClock.stopDoorTimer('dock' + dd.id);
            dd.timeOpen = 0;
            setBeaconSignals(dd, 'amber', true, '#f59e0b');
          } else {
            // Red warning ONLY when dock door is completely empty (no trailer, truck, driver, or delivery)
            if (window.ShiftClock) window.ShiftClock.startDoorTimer('dock' + dd.id);
            dd.timeOpen += dt;
            const doorTimer = (window.ShiftClock && typeof window.ShiftClock.getDoorTimerState === 'function')
              ? window.ShiftClock.getDoorTimerState('dock' + dd.id)
              : null;
            const isWarned5 = doorTimer ? (doorTimer.active && doorTimer.warned5) : (dd.timeOpen >= 20);
            if (isWarned5) {
              // Flashing Red: Empty dock door open 5+ in-game mins (first warning level, before 10-min penalty)
              setBeaconSignals(dd, 'red', flashOn, flashOn ? '#ef4444' : '#334155');
            } else {
              // Steady Red: Empty dock door open (< 5 in-game mins)
              setBeaconSignals(dd, 'red', true, '#ef4444');
            }
          }
        }
      });

      // 4. Animate Side Rollup Door & 3-Lens Signal Beacon (2D DSD Sim Tutorial Standard)
      // Signal States:
      // - STEADY GREEN: Closed & empty
      // - FLASHING YELLOW: Vendor waiting outside
      // - STEADY YELLOW: Vendor on dock / apron checking in or unloading
      // - STEADY RED: Open with nobody there (< 45s)
      // - FLASHING RED: Open 45s+ unattended! Security alarm!
      const targetSideProg = sideRollupDoor.isOpen ? 1.0 : 0.0;
      if (sideRollupDoor.currentProgress < targetSideProg) {
        sideRollupDoor.currentProgress = Math.min(targetSideProg, sideRollupDoor.currentProgress + (dt / SIDE_DOOR_DURATION));
      } else if (sideRollupDoor.currentProgress > targetSideProg) {
        sideRollupDoor.currentProgress = Math.max(targetSideProg, sideRollupDoor.currentProgress - (dt / SIDE_DOOR_DURATION));
      }

      if (sideRollupDoor._lastCurtainProg !== sideRollupDoor.currentProgress) {
        sideRollupDoor._lastCurtainProg = sideRollupDoor.currentProgress;
        const easedSideProg = 0.5 - 0.5 * Math.cos(sideRollupDoor.currentProgress * Math.PI);
        const sideOpenOffset = easedSideProg * (sideRollupDoor.height - 0.2);
        sideRollupDoor.curtainMesh.position.y = sideRollupDoor.height / 2 + sideOpenOffset;
        sideRollupDoor.curtainMesh.scale.y = Math.max(0.05, 1 - easedSideProg * 0.95);
      }

      const dsSessions = (typeof DeliverySystem !== 'undefined' && DeliverySystem && Array.isArray(DeliverySystem.sessions))
        ? DeliverySystem.sessions
        : null;
      const sideHasVendorWaiting = Boolean(dsSessions && dsSessions.some((s) => s && s.state === 'OUTSIDE_WAITING'));
      const sideHasDriverWaitingExit = Boolean(dsSessions && dsSessions.some((s) => s && s.state === 'WAITING_EXIT'));

      const sideHasDriverPresent = (
        typeof DeliverySystem !== 'undefined' &&
        DeliverySystem &&
        DeliverySystem.sessions.some((s) =>
          s.state === 'ENTERING' ||
          s.state === 'WAITING_CHECKIN' ||
          s.state === 'WAITING_SIGN' ||
          s.state === 'WALKING_TO_EXIT' ||
          s.state === 'WAITING_EXIT' ||
          s.state === 'VENDOR_RETURNING_TO_SIDE_DOOR' ||
          s.state === 'LEAVING' ||
          (s.driver && Math.hypot(s.driver.mesh.position.x - sideRollupDoor.worldX, s.driver.mesh.position.z - sideRollupDoor.worldZ) < 4.2)
        )
      );

      const flashSideOn = (Math.floor(performance.now() / 300) % 2 === 0);

      if (!sideRollupDoor.isOpen) {
        // SIDE DOOR CLOSED:
        sideRollupDoor.timeOpen = 0;
        if (window.ShiftClock) window.ShiftClock.stopDoorTimer('side');
        if (sideHasVendorWaiting || sideHasDriverWaitingExit) {
          // Flashing Yellow: Vendor waiting outside!
          setBeaconSignals(sideRollupDoor, 'amber', flashSideOn, flashSideOn ? '#f59e0b' : '#334155');
        } else {
          // Steady Green: Closed & empty
          setBeaconSignals(sideRollupDoor, 'green', true, '#22c55e');
        }
      } else {
        // SIDE DOOR OPEN:
        if (window.ShiftClock) {
          if (!sideHasDriverPresent && !sideHasVendorWaiting) {
            window.ShiftClock.startDoorTimer('side');
          } else {
            window.ShiftClock.stopDoorTimer('side');
          }
        }
        if (sideHasDriverPresent || sideHasVendorWaiting) {
          // Steady Yellow: Vendor on dock / apron
          sideRollupDoor.timeOpen = 0;
          setBeaconSignals(sideRollupDoor, 'amber', true, '#f59e0b');
        } else {
          // Open with nobody there!
          sideRollupDoor.timeOpen = (sideRollupDoor.timeOpen || 0) + dt;
          const sideTimer = (window.ShiftClock && typeof window.ShiftClock.getDoorTimerState === 'function')
            ? window.ShiftClock.getDoorTimerState('side')
            : null;
          const isSideWarned5 = sideTimer ? (sideTimer.active && sideTimer.warned5) : (sideRollupDoor.timeOpen >= 20);
          if (isSideWarned5) {
            // Flashing Red: Open 5+ in-game mins unattended (first warning level, before 10-min penalty)
            setBeaconSignals(sideRollupDoor, 'red', flashSideOn, flashSideOn ? '#ef4444' : '#334155');
          } else {
            // Steady Red: Open with nobody there (< 5 in-game mins)
            setBeaconSignals(sideRollupDoor, 'red', true, '#ef4444');
          }
        }
      }

      function applyLensLitState(lens, halo, lit, litHex, dimHex) {
        const isLit = Boolean(lit);
        if (lens && lens._lastLit === isLit) return;
        if (lens) lens._lastLit = isLit;
        if (lens && lens.material) {
          if (lens.material.color) lens.material.color.setHex(isLit ? litHex : dimHex);
          if (lens.material.emissive && typeof lens.material.emissive.setHex === 'function') {
            lens.material.emissive.setHex(isLit ? litHex : 0x000000);
          }
          lens.material.emissiveIntensity = isLit ? 1.65 : 0;
        }
        if (halo) halo.visible = isLit;
      }

      function setBeaconSignals(doorObj, activeChannel, isLit, beaconHex) {
        if (!doorObj) return;
        const bc = doorObj.beaconCtrl;
        applyLensLitState(doorObj.redLens, bc && bc.redHalo, isLit && activeChannel === 'red', 0xef4444, 0x450a0a);
        applyLensLitState(doorObj.amberLens, bc && bc.amberHalo, isLit && activeChannel === 'amber', 0xf59e0b, 0x451a03);
        applyLensLitState(doorObj.greenLens, bc && bc.greenHalo, isLit && activeChannel === 'green', 0x22c55e, 0x052e16);
        doorObj.beaconColor = beaconHex;
      }

      function syncDoorStationVisual(ctrl, beaconHex) {
        if (!ctrl) return;
        if (ctrl.pilotMat) {
          const c = beaconHex || '#22c55e';
          if (ctrl.lastPilotColor !== c) {
            ctrl.lastPilotColor = c;
            const num = parseInt(c.replace('#', ''), 16);
            if (!Number.isNaN(num)) {
              ctrl.pilotMat.color.setHex(num);
              if (ctrl.pilotMat.emissive && typeof ctrl.pilotMat.emissive.setHex === 'function') {
                ctrl.pilotMat.emissive.setHex(num);
              }
            }
          }
        }
        if (ctrl.pressAnim > 0) {
          ctrl.pressAnim = Math.max(0, ctrl.pressAnim - dt * 5.5);
        }
        const travel = ctrl.pressAnim > 0 ? (-0.011 * Math.sin(ctrl.pressAnim * Math.PI * 0.5)) : 0;
        if (ctrl.openBtnGroup) {
          ctrl.openBtnGroup.position.z = (ctrl.pressTarget === 'open') ? travel : 0;
        }
        if (ctrl.closeBtnGroup) {
          ctrl.closeBtnGroup.position.z = (ctrl.pressTarget === 'close') ? travel : 0;
        }
      }

      dockDoors.forEach((dd) => syncDoorStationVisual(dd.stationCtrl, dd.beaconColor));
      syncDoorStationVisual(sideRollupDoor.stationCtrl, sideRollupDoor.beaconColor);

      // Animate Double Swinging Black Impact Doors for Freezer & Cooler
      coldDoors.forEach(cd => {
        const dx = player.position.x - cd.worldX;
        const dz = player.position.z - cd.worldZ;
        // Detect when player approaches or enters the doorway
        const isNearDoor = (Math.abs(dx) < 1.7 && Math.abs(dz) < 2.8);

        if (isNearDoor) {
          // Lock in swing direction upon entering so doors NEVER reverse mid-crossing!
          // - Approaching from dock (Z < doorZ): swing South (+Z) into cold room (swingAway = -1)
          // - Approaching from inside cold room (Z >= doorZ): swing North (-Z) into dock (swingAway = 1)
          if (cd.activeDirection === 0) {
            cd.activeDirection = (player.position.z < cd.worldZ) ? -1 : 1;
            SoundSystem.playDoorSwing();
          }

          // Maintain locked direction throughout entire crossing
          cd.targetLeftAngle = cd.activeDirection * 1.40;
          cd.targetRightAngle = -cd.activeDirection * 1.40;
        } else {
          // Player has cleared the doorway: return doors to closed center
          cd.targetLeftAngle = 0;
          cd.targetRightAngle = 0;

          // Only unlock direction after doors have actually returned to closed position!
          const isReset = (Math.abs(cd.currentLeftAngle) < 0.06 && Math.abs(cd.currentRightAngle) < 0.06);
          if (isReset) {
            cd.activeDirection = 0;
          }
        }

        // Smooth spring return physics interpolation
        const swingSpeed = 0.14;
        cd.currentLeftAngle += (cd.targetLeftAngle - cd.currentLeftAngle) * swingSpeed;
        cd.currentRightAngle += (cd.targetRightAngle - cd.currentRightAngle) * swingSpeed;

        cd.leftHinge.rotation.y = cd.currentLeftAngle;
        cd.rightHinge.rotation.y = cd.currentRightAngle;
      });
    }

    function handleInteractE() {
      if (isCarryingBackstockCase()) {
        if (!handleBackstockInteract(false)) {
          showNotification('[[ico:box]] Aim at a steel shelf (or floor pallet) and press [E] / Click to place case.');
        }
        return;
      }
      if (isArrangingRecallItem()) {
        if (!handleClaimsToteInteract(false)) {
          showNotification('[[ico:box]] Aim at Recall Cart top shelf and press [E] / Click to place item down.');
        }
        return;
      }
      if (isHoldingRecallTote()) {
        if (!handleClaimsToteInteract(false)) {
          showNotification('[[ico:tote]] Collect top-shelf items, set tote on bottom shelf, or dump at disposal receptacle.');
        }
        return;
      }
      if (isHoldingClaimsItem()) {
        if (!handleClaimsToteInteract(false)) {
          showNotification('[[ico:tray]] Aim at Trash, Organics, Hazwaste, Donations, or Red Credit Tote and press [E] / Click.');
        }
        return;
      }
      if (uiState.invoiceModalOpen) {
        closeInvoice();
        return;
      }
      if (uiState.terminalModalOpen) {
        closeTerminal();
        return;
      }
      if (isPhase2ModalOpen() && window.DSDReceipts) {
        window.DSDReceipts.closeInvoiceArchive();
        window.DSDReceipts.closeFilingOverlay();
        window.DSDReceipts.closeNightDropPanel();
        return;
      }
      if ((uiState.hoveredRecallItem || uiState.hoveredRecallTote || uiState.hoveredClaimsItem || uiState.hoveredClaimsTote || uiState.hoveredClaimsReceptacle) && handleClaimsToteInteract(false)) {
        return;
      }
      if (uiState.hoveredBackstockCase && handleBackstockInteract(false)) {
        return;
      }
      if (focusedInteractible) {
        triggerInteractibleAction(focusedInteractible);
      }
    }

    function takeElectricJack() {
      if (isCarryingBackstockCase()) {
        showAlert('[[ico:claim]] Hands occupied carrying a case! Place the case on steel before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingRecallTote() || isArrangingRecallItem()) {
        showAlert('[[ico:claim]] Hands occupied with Recall work! Place the small gray tote on the Recall Cart bottom shelf before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingClaimsItem()) {
        showAlert('[[ico:claim]] Hands occupied carrying a damaged item! Place it in a receptacle before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (uiState.scannerModalOpen) {
        showAlert('[[ico:claim]] Hands occupied! Close the Hand Scanner [F] before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      player.hasElectricJack = true;
      clampPitch();
      jackDockedAtCharger = false;
      electricJackWorld.visible = false;
      if (typeof electricJackWorld.setOperatingMode === 'function') electricJackWorld.setOperatingMode(false);
      if (typeof electricJackWorld.setLifted === 'function') electricJackWorld.setLifted(false);
      electricJackViewmodel.visible = true;
      if (checkCollision(player.position.x, player.position.z, player.yaw, null, false)) {
        const jYaw = electricJackWorld.rotation.y || player.yaw;
        const candidates = [
          { x: electricJackWorld.position.x + Math.sin(jYaw) * JACK_FLOOR_OFFSET, z: electricJackWorld.position.z + Math.cos(jYaw) * JACK_FLOOR_OFFSET, yaw: jYaw },
          { x: player.position.x + Math.sin(player.yaw) * 0.35, z: player.position.z + Math.cos(player.yaw) * 0.35, yaw: player.yaw },
          { x: player.position.x + Math.sin(player.yaw) * 0.70, z: player.position.z + Math.cos(player.yaw) * 0.70, yaw: player.yaw }
        ];
        for (let ci = 0; ci < candidates.length; ci++) {
          const c = candidates[ci];
          if (!checkCollision(c.x, c.z, c.yaw, null, false)) {
            player.position.x = c.x;
            player.position.z = c.z;
            player.yaw = c.yaw;
            break;
          }
        }
      }
      syncActiveFloorJack();
      syncElectricJackBatteryVisuals(undefined, true);
      SoundSystem.playHydraulicLift();
    }

    const JACK_FLOOR_OFFSET = 0.75;
    const JACK_PALLET_FORK_OFFSET = 0.96;
    const JACK_LIFT_HEIGHT = 0.08;

    function canParkElectricJackAt(jx, jz, yaw) {
      return collisionSolver.canParkJackAt(jx, jz, yaw);
    }

    const JACK_HOME_POS = { x: -7.20, z: 2.08, yaw: 0 };

    function isNearJackRechargingZone(jx, jz) {
      const distJack = Math.hypot(jx - JACK_HOME_POS.x, jz - JACK_HOME_POS.z);
      const inZoneBox = Math.abs(player.position.x - JACK_HOME_POS.x) <= 1.45 &&
        player.position.z >= doorZ + 0.35 &&
        player.position.z <= 3.25;
      return distJack <= 1.45 || inZoneBox;
    }

    function dropElectricJack() {
      if (player.hitchedPallet) {
        showAlert('[[ico:claim]] Lower and drop the pallet first before parking the electric jack.');
        return;
      }
      player.hasElectricJack = false;
      electricJackViewmodel.visible = false;
      if (electricJackActiveFloor) {
        electricJackActiveFloor.visible = false;
        if (typeof electricJackActiveFloor.setLifted === 'function') electricJackActiveFloor.setLifted(false);
      }
      if (typeof electricJackWorld.setOperatingMode === 'function') electricJackWorld.setOperatingMode(false);
      if (typeof electricJackWorld.setLifted === 'function') electricJackWorld.setLifted(false);

      const sinYaw = Math.sin(player.yaw);
      const cosYaw = Math.cos(player.yaw);
      const fwdDirX = -sinYaw;
      const fwdDirZ = -cosYaw;
      const fwdX = player.position.x + fwdDirX * JACK_FLOOR_OFFSET;
      const fwdZ = player.position.z + fwdDirZ * JACK_FLOOR_OFFSET;

      // Snap cleanly into Recharging Station home dock when returned to its recharging zone
      if (isNearJackRechargingZone(fwdX, fwdZ)) {
        electricJackWorld.position.set(JACK_HOME_POS.x, 0, JACK_HOME_POS.z);
        electricJackWorld.rotation.y = JACK_HOME_POS.yaw;
        electricJackWorld.visible = true;
        jackDockedAtCharger = true;

        // If player stood inside the home dock collider when unhooking, step player clear of the handle
        if (checkCollision(player.position.x, player.position.z)) {
          const safeSpots = [
            { x: JACK_HOME_POS.x, z: 2.88 },
            { x: JACK_HOME_POS.x + 0.92, z: 2.08 },
            { x: JACK_HOME_POS.x - 0.92, z: 2.08 }
          ];
          for (let i = 0; i < safeSpots.length; i++) {
            if (!checkCollision(safeSpots[i].x, safeSpots[i].z)) {
              player.position.x = safeSpots[i].x;
              player.position.z = safeSpots[i].z;
              break;
            }
          }
        }

        syncElectricJackBatteryVisuals(undefined, true);
        if (SoundSystem.playChargerPlug) SoundSystem.playChargerPlug();
        else SoundSystem.playDropSound();
        const displayPct = jackBattery >= 99.99 ? 100 : Math.max(0, Math.min(99, Math.floor(jackBattery)));
        if (displayPct < 100) {
          showNotification(`[[ico:lightning]] Electric Pallet Jack plugged in & charging (${displayPct}%)`);
        } else {
          showNotification('[[ico:lightning]] Electric Pallet Jack plugged in (100% charged)');
        }
        return;
      }

      // Always park IN FRONT of the player (never behind)
      let dropX = fwdX;
      let dropZ = fwdZ;
      let dropYaw = player.yaw;
      let found = canParkElectricJackAt(dropX, dropZ, dropYaw);

      if (!found) {
        const yawOffsets = [0.35, -0.35, 0.70, -0.70, 1.15, -1.15, Math.PI / 2, -Math.PI / 2];
        for (let i = 0; i < yawOffsets.length; i++) {
          const tryYaw = player.yaw + yawOffsets[i];
          const tryX = player.position.x + fwdDirX * 0.95;
          const tryZ = player.position.z + fwdDirZ * 0.95;
          if (canParkElectricJackAt(tryX, tryZ, tryYaw)) {
            dropX = tryX;
            dropZ = tryZ;
            dropYaw = tryYaw;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        const stepBacks = [0.45, 0.90, 1.35];
        for (let i = 0; i < stepBacks.length; i++) {
          const backPx = player.position.x - fwdDirX * stepBacks[i];
          const backPz = player.position.z - fwdDirZ * stepBacks[i];
          if (checkCollision(backPx, backPz)) break;
          const tryX = backPx + fwdDirX * 0.95;
          const tryZ = backPz + fwdDirZ * 0.95;
          if (canParkElectricJackAt(tryX, tryZ, player.yaw)) {
            player.position.x = backPx;
            player.position.z = backPz;
            dropX = tryX;
            dropZ = tryZ;
            dropYaw = player.yaw;
            found = true;
            break;
          }
        }
      }

      electricJackWorld.position.set(dropX, 0, dropZ);
      electricJackWorld.rotation.y = dropYaw;
      electricJackWorld.visible = true;
      jackDockedAtCharger = false;
      syncElectricJackBatteryVisuals(undefined, true);

      SoundSystem.playDropSound();
    }

    function handlePalletAction() {
      if (isCarryingBackstockCase()) {
        showAlert('[[ico:claim]] Hands occupied carrying a case! Place the case on steel before using the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (player.hasElectricJack) {
        if (player.hitchedPallet) {
          dropPallet();
        } else if (focusedInteractible && focusedInteractible.type === 'pallet') {
          focusedInteractible.interact();
        } else {
          let closest = null;
          let minScore = 1.65;
          const fwdX = -Math.sin(player.yaw);
          const fwdZ = -Math.cos(player.yaw);
          const forkCenterX = player.position.x + fwdX * (JACK_FLOOR_OFFSET + JACK_PALLET_FORK_OFFSET);
          const forkCenterZ = player.position.z + fwdZ * (JACK_FLOOR_OFFSET + JACK_PALLET_FORK_OFFSET);
          const considerPalletCandidate = (p) => {
            const distToFork = Math.hypot(forkCenterX - p.position.x, forkCenterZ - p.position.z);
            const distToPlayer = Math.hypot(player.position.x - p.position.x, player.position.z - p.position.z);
            const score = Math.min(distToFork, distToPlayer * 0.92);
            if (distToFork <= 1.65 || distToPlayer <= 2.35) {
              if (score < minScore) {
                minScore = score;
                closest = p;
              }
            }
          };
          pallets.forEach(p => {
            if (p.isHitched) return;
            considerPalletCandidate(p);
          });
          if (Array.isArray(overstockPallets)) {
            overstockPallets.forEach(op => {
              if (!op || op.isHitched || (op.group && !op.group.visible)) return;
              considerPalletCandidate(op);
            });
          }
          if (closest) {
            hitchPallet(closest);
          } else {
            // Player pressed Space while operating jack without facing a pallet: drop/park the jack!
            dropElectricJack();
          }
        }
      } else {
        // Player is on foot
        if (focusedInteractible && focusedInteractible.type === 'electric_jack') {
          takeElectricJack();
        } else {
          const distToJack = Math.hypot(player.position.x - electricJackWorld.position.x, player.position.z - electricJackWorld.position.z);
          if (distToJack < 2.8) {
            takeElectricJack();
          } else {
            showAlert('[[ico:claim]] ELECTRIC PALLET JACK REQUIRED! You cannot move pallets by hand. Take the electric jack first.');
            SoundSystem.playErrorBuzzer();
            showNotification('[[ico:claim]] Take the Electric Pallet Jack staged between Docks 1 & 2 (or where parked).', 'high');
          }
        }
      }
    }

    function syncActiveFloorJack() {
      if (!electricJackActiveFloor) return;
      if (!player.hasElectricJack) {
        electricJackActiveFloor.visible = false;
        return;
      }
      const forwardX = -Math.sin(player.yaw);
      const forwardZ = -Math.cos(player.yaw);
      electricJackActiveFloor.visible = true;
      // Glued flush to floor (y = 0); rotates only left/right with player yaw, unaffected by head pitch
      electricJackActiveFloor.position.set(
        player.position.x + forwardX * JACK_FLOOR_OFFSET,
        0,
        player.position.z + forwardZ * JACK_FLOOR_OFFSET
      );
      electricJackActiveFloor.rotation.set(0, player.yaw, 0);
      if (typeof electricJackActiveFloor.setLifted === 'function') {
        electricJackActiveFloor.setLifted(Boolean(player.hitchedPallet));
      }
    }

    function positionHitchedPallet() {
      const pallet = player.hitchedPallet;
      if (!pallet) return;
      const forwardX = -Math.sin(player.yaw);
      const forwardZ = -Math.cos(player.yaw);
      const forkDistance = JACK_FLOOR_OFFSET + JACK_PALLET_FORK_OFFSET;
      pallet.position.set(
        player.position.x + forwardX * forkDistance,
        JACK_LIFT_HEIGHT,
        player.position.z + forwardZ * forkDistance
      );
      pallet.mesh.rotation.y = player.yaw;
      if (pallet.data && pallet.data.isOverstockPallet) {
        pallet.x = pallet.position.x;
        pallet.z = pallet.position.z;
        pallet.rotY = player.yaw;
      }
    }

    function findClearHitchPose(pallet) {
      const curX = player.position.x;
      const curZ = player.position.z;
      const curYaw = player.yaw;

      if (!collisionSolver.checkPose({
        x: curX,
        z: curZ,
        yaw: curYaw,
        hasElectricJack: true,
        hitchedPallet: pallet,
        excludePallet: pallet
      })) {
        return { x: curX, z: curZ, yaw: curYaw };
      }

      const palX = pallet.position ? pallet.position.x : (Number(pallet.x) || 0);
      const palZ = pallet.position ? pallet.position.z : (Number(pallet.z) || 0);
      const forkDist = JACK_FLOOR_OFFSET + JACK_PALLET_FORK_OFFSET;
      const fwdX = -Math.sin(curYaw);
      const fwdZ = -Math.cos(curYaw);

      // Candidate 1: Pull player slightly back along current facing without stepping through rear walls
      const pullSteps = [0.15, 0.30, 0.45, 0.65, 0.85];
      for (let i = 0; i < pullSteps.length; i++) {
        const step = pullSteps[i];
        const tryX = curX - fwdX * step;
        const tryZ = curZ - fwdZ * step;
        // Player body + empty jack must also be clear of obstructions at pullback spot
        if (collisionSolver.checkPose({
          x: tryX,
          z: tryZ,
          yaw: curYaw,
          hasElectricJack: true,
          hitchedPallet: null,
          excludePallet: pallet
        })) {
          break;
        }
        if (!collisionSolver.checkPose({
          x: tryX,
          z: tryZ,
          yaw: curYaw,
          hasElectricJack: true,
          hitchedPallet: pallet,
          excludePallet: pallet
        })) {
          return { x: tryX, z: tryZ, yaw: curYaw };
        }
      }

      // Candidate 2: Keep pallet near its grounded center & align jack cleanly behind an open face
      const approachYaw = Math.atan2(curX - palX, curZ - palZ);
      const yawTrials = [curYaw, approachYaw];
      const palBaseRot = pallet.mesh ? (Number(pallet.mesh.rotation.y) || 0) : (Number(pallet.rotY) || 0);
      for (let k = 0; k < 4; k++) {
        yawTrials.push(palBaseRot + k * (Math.PI * 0.5));
      }
      let best = null;
      let bestCost = Infinity;
      for (let i = 0; i < yawTrials.length; i++) {
        const ty = yawTrials[i];
        const deltaYaw = Math.abs(Math.atan2(Math.sin(ty - curYaw), Math.cos(ty - curYaw)));
        if (deltaYaw > 0.75) continue;
        const tx = palX + Math.sin(ty) * forkDist;
        const tz = palZ + Math.cos(ty) * forkDist;
        const shiftDist = Math.hypot(tx - curX, tz - curZ);
        if (shiftDist > 0.95) continue;
        if (collisionSolver.checkPose({
          x: tx,
          z: tz,
          yaw: ty,
          hasElectricJack: true,
          hitchedPallet: pallet,
          excludePallet: pallet
        })) {
          continue;
        }
        const cost = shiftDist + deltaYaw * 0.5;
        if (cost < bestCost) {
          bestCost = cost;
          best = { x: tx, z: tz, yaw: ty };
        }
      }
      return best;
    }

    function hitchPallet(pallet) {
      if (!pallet || pallet.isHitched) return;
      if (!player.hasElectricJack) {
        showAlert('[[ico:claim]] ELECTRIC PALLET JACK REQUIRED! You cannot move pallets by hand. Take the electric jack first.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (player.hitchedPallet) {
        showAlert('[[ico:claim]] Already hauling a pallet. Press [Space] to lower & drop it first.');
        return;
      }
      if (!(pallet.data && pallet.data.isOverstockPallet) && pallet.position.z < doorZ) {
        const bay = dockDoors.find((dd) => Math.abs(pallet.position.x - dd.worldX) <= TILE_SIZE);
        if (!bay || !bay.hasTrailer || !bay.trailerDoorOpen || bay.trailerDoorProgress < 0.70) {
          showAlert('[[ico:lock]] TRAILER DOOR CLOSED! Let the driver enter & open the dock door before unloading pallets.');
          SoundSystem.playErrorBuzzer();
          return;
        }
        if (bay.trailerType === 'warehouse' && Array.isArray(bay.tempCurtains)) {
          const blockingCurtain = bay.tempCurtains.find((tc) => tc && tc.active && tc.progress < 0.70 && pallet.position.z < tc.worldZ - 0.05);
          if (blockingCurtain) {
            showAlert('[[ico:snowflake]] THERMAL CURTAIN SEALED! Move both pallets in front of the curtain to raise it first.');
            SoundSystem.playErrorBuzzer();
            return;
          }
        }
      }

      const clearPose = findClearHitchPose(pallet);
      if (!clearPose) {
        showAlert('[[ico:ban]] NO CLEARANCE TO LIFT PALLET! Align the electric jack from an open side so the pallet clears nearby walls or racks.');
        SoundSystem.playErrorBuzzer();
        return;
      }

      player.position.x = clearPose.x;
      player.position.z = clearPose.z;
      player.yaw = clearPose.yaw;

      player.hitchedPallet = pallet;
      pallet.isHitched = true;
      pallet._preHitchStatus = pallet.data ? pallet.data.status : null;
      if (pallet.data) pallet.data.status = 'IN_TRANSIT';
      if (pallet.data && pallet.data.isOverstockPallet && typeof pallet.syncPlacement === 'function') {
        pallet.syncPlacement(false);
      }
      pallet.mesh.position.y = JACK_LIFT_HEIGHT; // Hydraulically elevated onto forks!
      syncActiveFloorJack();
      positionHitchedPallet();
      hitchStatusCard.style.display = 'flex';
      hitchPalletName.textContent = (pallet.data && pallet.data.name) || 'Pallet';
      jackBattery = Math.max(5, jackBattery - 0.2);
      if (SoundSystem.playHitchSound) SoundSystem.playHitchSound();
      SoundSystem.playHydraulicLift();
    }

    function getPalletCornerTileTypes(pallet) {
      const px = pallet.position.x;
      const pz = pallet.position.z;
      const ry = pallet.mesh ? (Number(pallet.mesh.rotation.y) || 0) : (Number(pallet.rotY) || 0);
      const ca = Math.cos(ry);
      const sa = Math.sin(ry);
      const hw = 0.50;
      const hd = 0.42;
      const offsets = [
        [0, 0],
        [hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]
      ];
      const types = [];
      for (let i = 0; i < offsets.length; i++) {
        const lx = offsets[i][0];
        const lz = offsets[i][1];
        const wx = px + lx * ca + lz * sa;
        const wz = pz - lx * sa + lz * ca;
        const g = worldToGrid(wx, wz);
        types.push({ grid: g, tile: getTileType(g.col, g.row), isCenter: i === 0 });
      }
      return types;
    }

    function dropPallet() {
      const pallet = player.hitchedPallet;
      if (!pallet) return;

      const samples = getPalletCornerTileTypes(pallet);
      const centerSample = samples[0];
      const grid = centerSample.grid;
      const tileType = centerSample.tile;
      const isWarehousePallet = isWarehouseCargoPallet(pallet);

      const inHallway = samples.some((s) => s.tile === 'H' || (s.grid.col === 10 && s.grid.row >= 17 && s.grid.row <= 22));
      if (inHallway) {
        showAlert('[[ico:ban]] EMPLOYEE HALLWAY: Pallets cannot be dropped in the employee hallway!');
        SoundSystem.playErrorBuzzer();
        return;
      }

      if (tileType === 'Y') {
        showAlert('[[ico:ban]] BLOCKED TRANSIT LANE! Pallets cannot be dropped on yellow transit tiles.');
        SoundSystem.playErrorBuzzer();
        return;
      }

      const inWall = samples.some((s) => s.tile === 'W');
      if (inWall || collisionSolver.checkPose({
        x: player.position.x,
        z: player.position.z,
        yaw: player.yaw,
        hasElectricJack: true,
        hitchedPallet: pallet,
        excludePallet: pallet
      })) {
        showAlert('[[ico:ban]] NO STAGING ZONE: Pallets cannot be placed inside walls, racking, or other pallets!');
        SoundSystem.playErrorBuzzer();
        return;
      }

      pallet.isHitched = false;
      player.hitchedPallet = null;
      // Drop straight to ground keeping the exact X/Z and yaw depicted in the 3D scene
      pallet.position.y = 0;
      pallet.mesh.position.y = 0;
      syncActiveFloorJack();
      hitchStatusCard.style.display = 'none';
      SoundSystem.playHydraulicLower();

      if (pallet.data && pallet.data.isOverstockPallet && typeof pallet.syncPlacement === 'function') {
        pallet.syncPlacement(true);
      }

      if (!isWarehousePallet) {
        if (pallet.data) {
          if (pallet.data.isOverstockPallet) {
            pallet.data.status = pallet._preHitchStatus || 'UNLOADED';
          } else {
            // Vendor truck pallet moved onto dock floor vs still inside trailer
            pallet.data.status = (tileType === 'T') ? 'UNLOADED' : 'STAGED_CORRECT';
            if (pallet.data.status === 'STAGED_CORRECT') {
              SoundSystem.playSuccessChime();
              showNotification(`[[ico:box]] ${pallet.data.name || 'Vendor Pallet'} staged on dock floor.`, 'status');
            }
          }
        }
        return;
      }

      if (tileType === pallet.data.targetZone) {
        pallet.data.status = 'STAGED_CORRECT';
        SoundSystem.playSuccessChime();
        let zoneName = 'Main Dock Ambient Staging';
        if (tileType === 'F') zoneName = 'Freezer (0°F) Staging';
        else if (tileType === 'C') zoneName = 'Cooler (36°F) Staging';
        showNotification(`[[ico:checkCircle]] PERFECT! ${pallet.data.po} correctly staged in ${zoneName}`, 'status');
        if (window.WarehouseTrucks && typeof window.WarehouseTrucks.onPalletStaged === 'function') {
          window.WarehouseTrucks.onPalletStaged(pallet);
        }
      } else if (tileType === 'T') {
        pallet.data.status = 'UNLOADED';
      } else {
        pallet.data.status = 'MISPLACED';
        SoundSystem.playErrorBuzzer();
        let correctZone = 'Main Dock';
        if (pallet.data.targetZone === 'F') correctZone = 'Freezer [Dark Blue]';
        else if (pallet.data.targetZone === 'C') correctZone = 'Cooler [Light Blue]';
        showAlert(`[[ico:claim]] MISPLACED! ${pallet.data.name} must be staged in ${correctZone}!`);
      }

      updateStagedCounter();
    }

    function updateStagedCounter() {
      if (!stagedCounter) return;
      const labelEl = document.getElementById('staged-counter-label');
      if (window.WarehouseTrucks && typeof window.WarehouseTrucks.getCounterSummary === 'function') {
        const sum = window.WarehouseTrucks.getCounterSummary();
        if (labelEl) labelEl.textContent = sum.label;
        stagedCounter.textContent = `${sum.staged} / ${sum.total}`;
        stagedCounter.style.color = (sum.total > 0 && sum.staged >= sum.total) ? '#38bdf8' : '#22c55e';
        return;
      }
      if (gamePhase === 1) {
        const correctCount = pallets.filter(p => p.data.status === 'STAGED_CORRECT' || p.data.status === 'AUDITED').length;
        stagedCounter.textContent = `${correctCount} / ${pallets.length}`;
      } else {
        const auditedCount = pallets.filter(p => p.data.status === 'AUDITED').length;
        stagedCounter.textContent = `${auditedCount} / ${pallets.length}`;
        if (auditedCount >= pallets.length) {
          stagedCounter.style.color = '#38bdf8';
        }
      }
    }

    let scanPulseTimeout = null;
    let lastScanFeedbackTime = 0;

    function resolveScannerAreaContext() {
      if (window.DSDGame && typeof window.DSDGame.getScannerAreaContext === 'function') {
        const ext = window.DSDGame.getScannerAreaContext(player.position);
        if (ext) return ext;
      }
      const zones = window.DSDScannerZones || [];
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (!z || !z.screen) continue;
        if (typeof z.contains === 'function' && z.contains(player.position)) {
          return z.screen;
        }
        if (
          typeof z.minX === 'number' && typeof z.maxX === 'number' &&
          typeof z.minZ === 'number' && typeof z.maxZ === 'number' &&
          player.position.x >= z.minX && player.position.x <= z.maxX &&
          player.position.z >= z.minZ && player.position.z <= z.maxZ
        ) {
          return z.screen;
        }
      }
      return null;
    }

    function getHoveredBackstockScannerTarget() {
      let bc = uiState.hoveredBackstockCase;
      if (!bc && window.BackstockRacks && !isCarryingBackstockCase()) {
        const pickables = window.BackstockRacks.getPickableCaseMeshes();
        if (pickables.length > 0) {
          interactRaycaster.setFromCamera(getAimNDC(), camera);
          interactRaycaster.far = 4.8;
          const hits = interactRaycaster.intersectObjects(pickables, false);
          if (hits.length > 0 && hits[0].object && hits[0].object.userData && hits[0].object.userData.backstockCaseRef) {
            bc = hits[0].object.userData.backstockCaseRef;
          }
        }
      }
      if (!bc) return null;

      // Dept 60 supply boxes / cases placed on or staged for Claims steel open directly to Supply Ordering (Option 2)
      if (
        bc.placedRackId === 'claims_steel' ||
        (!bc.placedOnRack && (bc.targetRackId === 'claims_steel' || bc.deptNo === '60')) ||
        (bc.deptNo === '60' && bc.placedRackId !== 'dry_steel' && bc.placedRackId !== 'cooler_steel' && bc.placedRackId !== 'freezer_steel')
      ) {
        return 'supply';
      }

      // Unlabeled overstock pallet case (excluding Dept 60): open directly to Label Cases (Option 3 -> 1)
      if (!bc.placedOnRack && !bc.labeled && String(bc.deptNo || '') !== '60') {
        return 'label-cases';
      }

      // Labeled case slotted in backroom steel: open directly to Audit Backroom (Option 3 -> 2)
      const rackId = bc.placedRackId || (bc.rackSlot && bc.rackSlot.rackId);
      const isBackroomSteel = Boolean(
        bc.placedOnRack &&
        window.BackstockRacks &&
        typeof window.BackstockRacks.isInventoryEligibleRack === 'function' &&
        window.BackstockRacks.isInventoryEligibleRack(rackId)
      );
      if (isBackroomSteel && bc.labeled) {
        return 'inventory-audit';
      }

      // General backstock cases open to Backroom Inventory menu (Option 3)
      return 'inventory';
    }

    function getHoveredClaimsScannerTarget() {
      if (uiState.hoveredClaimsItem || uiState.hoveredClaimsTote) {
        return { screen: 'damage', item: uiState.hoveredClaimsItem || null };
      }
      if (!window.ClaimsTotes) return null;
      interactRaycaster.setFromCamera(getAimNDC(), camera);
      interactRaycaster.far = 4.8;
      if (typeof window.ClaimsTotes.getOpenToteItemMeshes === 'function') {
        const itemMeshes = window.ClaimsTotes.getOpenToteItemMeshes();
        if (itemMeshes.length > 0) {
          const iHits = interactRaycaster.intersectObjects(itemMeshes, false);
          if (iHits.length > 0 && iHits[0].object && iHits[0].object.userData && iHits[0].object.userData.claimsItemRef) {
            return { screen: 'damage', item: iHits[0].object.userData.claimsItemRef };
          }
        }
      }
      if (typeof window.ClaimsTotes.getInteractableToteMeshes === 'function') {
        const toteMeshes = window.ClaimsTotes.getInteractableToteMeshes();
        if (toteMeshes.length > 0) {
          const tHits = interactRaycaster.intersectObjects(toteMeshes, false);
          if (tHits.length > 0 && tHits[0].object && tHits[0].object.userData && tHits[0].object.userData.claimsToteRef) {
            return { screen: 'damage', item: null };
          }
        }
      }
      return null;
    }

    function resolveScannerOpenContext(openOpts) {
      if (openOpts && typeof openOpts === 'object' && openOpts.screen) {
        return openOpts.screen;
      }
      if (openOpts === 'invoice' || uiState.invoiceModalOpen) {
        return 'create';
      }
      if (openOpts === 'nightdrop') {
        return 'create';
      }
      const ndPanelEl = document.getElementById('night-drop-panel');
      if (ndPanelEl && ndPanelEl.style.display === 'flex') {
        return 'create';
      }
      const hoveredClaimsTarget = getHoveredClaimsScannerTarget();
      if (hoveredClaimsTarget && hoveredClaimsTarget.screen) {
        return hoveredClaimsTarget.screen;
      }
      const hoveredBackstockScreen = getHoveredBackstockScannerTarget();
      if (hoveredBackstockScreen) {
        return hoveredBackstockScreen;
      }
      const areaScreen = resolveScannerAreaContext();
      if (areaScreen) {
        return areaScreen;
      }
      return 'home';
    }

    function scanClaimsItemIntoScanner(itemRec) {
      if (!itemRec || !window.DSDReceipts || typeof window.DSDReceipts.scanClaimsItem !== 'function') {
        return null;
      }
      const res = window.DSDReceipts.scanClaimsItem(itemRec);
      if (res && res.ok && res.loaded) {
        if (SoundSystem && typeof SoundSystem.playScanBeep === 'function') {
          SoundSystem.playScanBeep();
        }
        scannerDevice.classList.add('scanning');
        scannerLcd.classList.add('scan-flash');
        if (scanPulseTimeout) clearTimeout(scanPulseTimeout);
        scanPulseTimeout = setTimeout(() => {
          scannerDevice.classList.remove('scanning');
          scannerLcd.classList.remove('scan-flash');
        }, 240);
      } else if (res && res.ok && res.isPlu) {
        showNotification(`[[ico:claim]] PLU Item (${itemRec.name}): Type PLU code ${itemRec.code} & press ENT on Hand Scanner!`, 'high');
      }
      return res;
    }

    function openScanner(openOpts) {
      if (uiState.bolModalOpen) return;
      if (isCarryingBackstockCase()) {
        showAlert('[[ico:claim]] Hands occupied carrying a case! Place the case on steel before opening the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingRecallTote() || isArrangingRecallItem()) {
        showAlert('[[ico:claim]] Hands occupied with Recall work! Set the small gray tote on the Recall Cart bottom shelf before opening the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingClaimsItem()) {
        showAlert('[[ico:claim]] Hands occupied carrying a damaged item! Place it in a receptacle before opening the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (player.hasElectricJack) {
        showAlert('[[ico:claim]] Hands occupied operating Electric Jack! Drop/park the jack [Space] before using the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (uiState.terminalModalOpen) {
        closeTerminal(true);
      }
      const targetScannerScreen = resolveScannerOpenContext(openOpts);
      const claimsTargetInfo = (targetScannerScreen === 'damage') ? getHoveredClaimsScannerTarget() : null;
      const explicitClaimItem = (openOpts && typeof openOpts === 'object' && openOpts.claimItem) ? openOpts.claimItem : null;
      const hoveredClaimsItemPrefill = explicitClaimItem && !explicitClaimItem.claimed
        ? explicitClaimItem
        : ((claimsTargetInfo && claimsTargetInfo.item && !claimsTargetInfo.item.claimed) ? claimsTargetInfo.item : null);
      uiState.scannerModalOpen = true;
      player.scannerActive = true;
      if (document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
      scannerModalOverlay.classList.add('active');
      btnTouchScan.classList.add('scanner-open');
      container.classList.add('scanner-open');
      if (btnToggleScannerFromInv) btnToggleScannerFromInv.classList.add('scanner-active');
      updateLockHintDisplay();
      syncPhase2ContainerClasses();
      if (DeliverySystem.resolveFocusedDeliveryForPlayer) {
        DeliverySystem.resolveFocusedDeliveryForPlayer();
      }
      if (DeliverySystem.activeDelivery) syncDeliveryBoxesVisuals(DeliverySystem.activeDelivery);
      let hoveredSupplyPrefill = null;
      if (targetScannerScreen === 'supply' && window.BackstockRacks) {
        let cand = uiState.hoveredBackstockCase;
        if (!cand) {
          const pickables = window.BackstockRacks.getPickableCaseMeshes();
          if (pickables.length > 0) {
            interactRaycaster.setFromCamera(getAimNDC(), camera);
            interactRaycaster.far = 4.8;
            const hits = interactRaycaster.intersectObjects(pickables, false);
            if (hits.length > 0 && hits[0].object && hits[0].object.userData && hits[0].object.userData.backstockCaseRef) {
              cand = hits[0].object.userData.backstockCaseRef;
            }
          }
        }
        if (cand && typeof window.BackstockRacks.isSupplyCase === 'function' && window.BackstockRacks.isSupplyCase(cand)) {
          hoveredSupplyPrefill = cand;
        }
      }
      if (window.DSDReceipts && typeof window.DSDReceipts.openScannerForContext === 'function') {
        window.DSDReceipts.openScannerForContext(targetScannerScreen);
      }
      let suppressedOpenBeep = false;
      if (hoveredClaimsItemPrefill) {
        const claimsRes = scanClaimsItemIntoScanner(hoveredClaimsItemPrefill);
        suppressedOpenBeep = Boolean(claimsRes && claimsRes.isPlu);
      } else if (hoveredSupplyPrefill && window.DSDReceipts && typeof window.DSDReceipts.scanSupplyBox === 'function') {
        const supplyAlreadyOrdered = typeof window.DSDReceipts.isSupplyOrderSubmittedToday === 'function' && window.DSDReceipts.isSupplyOrderSubmittedToday();
        if (!supplyAlreadyOrdered) {
          window.DSDReceipts.scanSupplyBox(hoveredSupplyPrefill);
        }
      }
      if (window.BackstockRacks && typeof window.BackstockRacks.syncInventoryVisuals === 'function') {
        const isInv = Boolean(window.DSDReceipts && typeof window.DSDReceipts.isScannerInventoryMode === 'function' && window.DSDReceipts.isScannerInventoryMode());
        window.BackstockRacks.syncInventoryVisuals(isInv);
      }
      if (!suppressedOpenBeep) {
        SoundSystem.playScanBeep();
      }
      updateScannerDisplay(false);
    }

    function closeScanner(silent) {
      if (!uiState.scannerModalOpen) return;
      uiState.scannerModalOpen = false;
      player.scannerActive = false;
      pointerOverUiOverlay = false;
      if (lastPointerClient.x >= 0 && lastPointerClient.y >= 0) {
        updatePointerNDC(lastPointerClient.x, lastPointerClient.y);
      }
      scannerModalOverlay.classList.remove('active');
      btnTouchScan.classList.remove('scanner-open');
      container.classList.remove('scanner-open');
      if (btnToggleScannerFromInv) btnToggleScannerFromInv.classList.remove('scanner-active');
      if (window.BackstockRacks && typeof window.BackstockRacks.syncInventoryVisuals === 'function') {
        window.BackstockRacks.syncInventoryVisuals(false);
      }
      if (window.DSDReceipts && typeof window.DSDReceipts.clearScannerMessage === 'function') {
        window.DSDReceipts.clearScannerMessage();
      }
      updateLockHintDisplay();
      syncPhase2ContainerClasses();
      if (!silent) SoundSystem.playButtonClick();
    }

    function toggleScanner(openOpts) {
      if (uiState.scannerModalOpen) {
        closeScanner();
      } else {
        openScanner(openOpts);
      }
    }


    function isNearActiveDelivery() {
      const d = (typeof DeliverySystem.resolveFocusedDeliveryForPlayer === 'function')
        ? DeliverySystem.resolveFocusedDeliveryForPlayer()
        : DeliverySystem.activeDelivery;
      if (!d) return false;
      const s = DeliverySystem.getSessionForDelivery(d.id);
      const drv = s ? s.driver : DeliverySystem.activeDriver;
      const crt = s ? s.cart : DeliverySystem.activeCart;
      const tote = s ? s.creditTote : null;
      if (drv && drv.mesh) {
        const dp = drv.mesh.position;
        if (Math.hypot(player.position.x - dp.x, player.position.z - dp.z) < 5.5) return true;
      }
      if (crt && crt.mesh) {
        const cp = crt.mesh.position;
        if (Math.hypot(player.position.x - cp.x, player.position.z - cp.z) < 5.0) return true;
      }
      if (tote && tote.mesh) {
        const tp = tote.mesh.position;
        if (Math.hypot(player.position.x - tp.x, player.position.z - tp.z) < 4.8) return true;
      }
      for (let i = 0; i < pallets.length; i++) {
        const p = pallets[i];
        if (!p || !p.data) continue;
        if (p.data.deliveryId === d.id || (d.dockBay && p.data.truck === d.dockBay)) {
          if (Math.hypot(player.position.x - p.position.x, player.position.z - p.position.z) < 5.2) {
            return true;
          }
        }
      }
      if (d.dockBay) {
        const dock = dockDoors.find((dd) => dd.id === d.dockBay);
        const bayX = dock ? dock.worldX : 0;
        if (Math.hypot(player.position.x - bayX, player.position.z - 3.5) < 7.8) return true;
      }
      if (player.hitchedPallet !== null) return true;
      return false;
    }

    function isScannerFocusedOnDelivery() {
      const d = (typeof DeliverySystem.resolveFocusedDeliveryForPlayer === 'function')
        ? DeliverySystem.resolveFocusedDeliveryForPlayer()
        : DeliverySystem.activeDelivery;
      if (!d) return false;
      const s = DeliverySystem.getSessionForDelivery(d.id);
      const drv = s ? s.driver : DeliverySystem.activeDriver;
      const crt = s ? s.cart : DeliverySystem.activeCart;
      const tote = s ? s.creditTote : null;
      if (crt && crt.mesh) {
        const cp = crt.mesh.position;
        if (Math.hypot(player.position.x - cp.x, player.position.z - cp.z) < 4.8) return true;
      }
      if (tote && tote.mesh) {
        const tp = tote.mesh.position;
        if (Math.hypot(player.position.x - tp.x, player.position.z - tp.z) < 4.8) return true;
      }
      if (drv && drv.mesh) {
        const dp = drv.mesh.position;
        if (Math.hypot(player.position.x - dp.x, player.position.z - dp.z) < 4.5) return true;
      }
      if (d.type !== 'sidedoor') {
        return isNearActiveDelivery();
      }
      return false;
    }

    function updateScannerDisplay(isExplicitScan) {
      if (!player.scannerActive || !window.DSDReceipts) return;
      if (isExplicitScan) {
        window.DSDReceipts.handleScannerKey('scan');
      } else {
        window.DSDReceipts.renderScannerUI();
      }
    }

    // Attach Handheld Scanner GUI event listeners
    keyPwr.addEventListener('click', () => handleScannerKeyAction('pwr'));
    keyEnt.addEventListener('click', () => handleScannerKeyAction('enter'));

    // Tactile sound & actions on keypad buttons (numbers, function keys, clear, minus, navigation)
    const keypadBtns = scannerDevice.querySelectorAll('.key-num, .key-op, .key-fn, .nav-btn');
    keypadBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key');
        if (k === 'clr') {
          handleScannerKeyAction('clr');
        } else if (['minus', 'star', 'slash', 'plus', 'back', 'home', 'print', 'f5', 'f6', 'f7', 'f8'].includes(k)) {
          handleScannerKeyAction(k);
        } else if (k && k.startsWith('arrow')) {
          handleScannerKeyAction('nav', k.replace('arrow', ''));
        } else if (k && /^[0-9]$/.test(k)) {
          handleScannerKeyAction('num', k);
        }
      });
    });

    const terminalPaperBtn = document.getElementById('terminal-paper-btn');
    if (terminalPaperBtn) {
      terminalPaperBtn.addEventListener('click', () => {
        if (!window.DSDReceipts) return;
        const ndPanel = document.getElementById('night-drop-panel');
        const isOpen = ndPanel && ndPanel.style.display === 'flex';
        if (isOpen) {
          window.DSDReceipts.closeNightDropPanel();
        } else {
          window.DSDReceipts.openNightDropPanel(window.innerWidth >= 1080);
        }
      });
    }

    function openTerminal(initialScreen) {
      if (uiState.scannerModalOpen) {
        closeScanner(true);
      }
      uiState.terminalModalOpen = true;
      terminalModal.style.display = 'flex';
      if (document.exitPointerLock) document.exitPointerLock();
      if (terminalPaperBtn) {
        terminalPaperBtn.style.display = 'inline-block';
      }
      if (window.DSDReceipts) {
        window.DSDReceipts.openTerminalScreen(initialScreen || 'menu');
      }
      syncPhase2ContainerClasses();
      if (SoundSystem.playKeypadBeep) SoundSystem.playKeypadBeep('terminal');
      else SoundSystem.playButtonClick();
    }

    function closeTerminal(silent) {
      if (!uiState.terminalModalOpen) return;
      uiState.terminalModalOpen = false;
      terminalModal.style.display = 'none';
      syncPhase2ContainerClasses();
      if (!silent) SoundSystem.playButtonClick();
    }

    function toggleTerminal(initialScreen) {
      if (uiState.terminalModalOpen) {
        closeTerminal();
      } else {
        openTerminal(initialScreen);
      }
    }

    closeTerminalBtn.addEventListener('click', () => closeTerminal());

    function handleFinalizeReceivingClick() {
      if (window.WarehouseTrucks && typeof window.WarehouseTrucks.getScheduleRows === 'function') {
        const rows = window.WarehouseTrucks.getScheduleRows();
        const whRows = rows.filter(r => r.type === 'warehouse');
        const whDone = whRows.filter(r => r.completed).length;
        const dsdRows = rows.filter(r => r.type !== 'warehouse');
        const dsdDone = dsdRows.filter(r => r.completed || r.refused).length;
        if (whDone >= whRows.length && dsdDone >= dsdRows.length) {
          SoundSystem.playSuccessChime();
          closeTerminal();
          showNotification(`[[ico:trophy]] SHIFT RECEIVING COMPLETE!\n\nWarehouse Trucks: ${whDone}/${whRows.length} auto-posted.\nDSD Deliveries: ${dsdDone}/${dsdRows.length} signed.\n\nUse File Cabinet / End Shift to inspect full ledger!`, 'status');
        } else {
          SoundSystem.playErrorBuzzer();
          showAlert(`[[ico:claim]] SHIFT RECEIVING IN PROGRESS\n\nWarehouse Trucks Completed: ${whDone}/${whRows.length}\nDSD Side-Door / Vendor Trucks Completed: ${dsdDone}/${dsdRows.length}\n\nClear waiting bays & finish scheduled arrivals before shift end.`);
        }
        return;
      }
      if (gamePhase === 1) {
        const correct = pallets.filter(p => p.data.status === 'STAGED_CORRECT' || p.data.status === 'AUDITED').length;
        if (correct >= pallets.length) {
          gamePhase = 2;
          SoundSystem.playSuccessChime();
          closeTerminal();

          const badge = document.getElementById('phase-badge');
          if (badge) {
            badge.textContent = 'PHASE 2 ACTIVE';
            badge.style.background = '#8b5cf6';
          }
          const phaseTitle = document.getElementById('phase-title');
          if (phaseTitle) phaseTitle.textContent = 'ITEM AUDIT & PO RECONCILIATION';

          const counterLabel = document.getElementById('staged-counter-label');
          if (counterLabel) counterLabel.textContent = 'PALLETS AUDITED: ';
          updateStagedCounter();

          showNotification('[[ico:sparkle]] PHASE 2 ACTIVE: Scan each staged pallet with Hand Scanner [F] to verify items & temp specs!', 'low');
          showPopupModal({
            title: '[[ico:sparkle]] PHASE 1 DOCK & STAGING COMPLETE!',
            message: 'All 7 inbound pallets are staged in their correct temperature zones.\n\n▶ PHASE 2 INITIATED: AUDIT & PIECE VERIFICATION\nEquip your Hand Scanner [F], walk over to each staged pallet in the Cooler, Freezer, and Ambient Dock, and press [SCAN] to audit the 27 cases per pallet.',
            tone: 'success'
          });
        } else {
          SoundSystem.playErrorBuzzer();
          showPopupModal({
            title: '[[ico:claim]] RECEIVING INCOMPLETE',
            message: `Only ${correct} of ${pallets.length} pallets properly staged. Check trailers, stage in designated bays, and ensure yellow transit corridors remain unblocked.`,
            tone: 'warn'
          });
        }
      } else if (gamePhase === 2) {
        const audited = pallets.filter(p => p.data.status === 'AUDITED').length;
        if (audited >= pallets.length) {
          SoundSystem.playSuccessChime();
          showPopupModal({
            title: '[[ico:trophy]] SHIFT COMPLETE — 100% AUDIT ACCURACY!',
            message: 'All 7 inbound pallets (189 total cases) verified, barcode-certified, and temp-compliant!\n\nElectronic ASN & Bill of Lading transmitted to Central ERP.\n\nOutstanding work, Lead Receiver!',
            tone: 'success'
          });
        } else {
          SoundSystem.playErrorBuzzer();
          showPopupModal({
            title: '[[ico:claim]] AUDIT INCOMPLETE',
            message: `Only ${audited} of ${pallets.length} pallets audited. Use your Hand Scanner [F] to inspect and scan the remaining ${pallets.length - audited} pallets.`,
            tone: 'warn'
          });
        }
      }
    }

    // ==========================================
    // GRID COLLISION DETECTION
    // Trailer access allowed if trailer present;
    // Side Rollup Door EXIT strictly blocked for player!
    // ==========================================
    const boundaryWarnState = Object.create(null);
    function triggerBoundaryWarning(key, msg, cooldownMs = 3000) {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const entry = boundaryWarnState[key] || { active: false, lastAt: -1e9 };
      if (!entry.active && (now - entry.lastAt) >= cooldownMs) {
        entry.active = true;
        entry.lastAt = now;
        boundaryWarnState[key] = entry;
        showNotification(msg);
      } else {
        entry.active = true;
        boundaryWarnState[key] = entry;
      }
    }
    function updateBoundaryWarningReset(px, pz) {
      const r = player.radius;
      const maxWorldX = -ORIGIN_X - 0.1;
      const sideEntry = boundaryWarnState.side_door_vendors_only;
      if (sideEntry && sideEntry.active) {
        const atSideZ = Math.abs(pz - sideRollupDoor.worldZ) < (sideRollupDoor.width / 2 + 0.25);
        if (!sideRollupDoor.isOpen || !atSideZ || (px + r < maxWorldX - 0.35)) {
          sideEntry.active = false;
        }
      }
      for (let i = 0; i < dockDoors.length; i++) {
        const dd = dockDoors[i];
        const key = 'bay_trailer_sealed_' + dd.id;
        const entry = boundaryWarnState[key];
        if (entry && entry.active) {
          const inX = px >= dd.worldX - doorWidth / 2 - 0.25 && px <= dd.worldX + doorWidth / 2 + 0.25;
          if (dd.trailerDoorProgress >= 0.70 || !dd.hasTrailer || !inX || pz > (doorZ - 0.45) + r + 0.45) {
            entry.active = false;
          }
        }
      }
    }

    const collisionSolver = global.createDockCollisionSolver({
      TILE_SIZE,
      ORIGIN_X,
      ORIGIN_Z,
      ROWS,
      doorZ,
      doorWidth,
      playerRadius: player.radius,
      jackFloorOffset: JACK_FLOOR_OFFSET,
      jackPalletForkOffset: JACK_PALLET_FORK_OFFSET,
      palletHalfW: 0.60,
      palletHalfD: 0.50,
      getDockDoors: () => dockDoors,
      getSideRollupDoor: () => sideRollupDoor,
      getSolidWalls: () => solidWalls,
      getPallets: () => pallets,
      getOverstockPallets: () => overstockPallets,
      getParkedJack: () => (electricJackWorld ? {
        visible: Boolean(electricJackWorld.visible),
        x: electricJackWorld.position.x,
        z: electricJackWorld.position.z,
        rotY: electricJackWorld.rotation.y || 0
      } : null),
      onSideDoorBlocked: () => triggerBoundaryWarning('side_door_vendors_only', '[[ico:claim]] VENDORS ONLY: Receiving staff must remain on the dock.'),
      onSealedTrailerBlocked: (dd) => triggerBoundaryWarning('bay_trailer_sealed_' + dd.id, `[[ico:lock]] Bay ${dd.id} trailer door sealed! Let driver inside building to open trailer.`)
    });

    function triggerPalletBumpSound() {
      if (SoundSystem && typeof SoundSystem.playPalletBump === 'function') {
        SoundSystem.playPalletBump();
      }
    }

    function checkCollision(newX, newZ, testYaw, testHitchedPallet, emitWarnings = true) {
      return collisionSolver.checkPose({
        x: newX,
        z: newZ,
        yaw: testYaw !== undefined ? testYaw : player.yaw,
        hasElectricJack: player.hasElectricJack,
        hitchedPallet: testHitchedPallet !== undefined ? testHitchedPallet : player.hitchedPallet,
        emitWarnings: emitWarnings
      });
    }

    function setPlayerYawChecked(targetYaw) {
      if (!player.hasElectricJack && !player.hitchedPallet) {
        player.yaw = targetYaw;
        return true;
      }
      const res = collisionSolver.resolveTurn({
        x: player.position.x,
        z: player.position.z,
        curYaw: player.yaw,
        targetYaw: targetYaw,
        hasElectricJack: player.hasElectricJack,
        hitchedPallet: player.hitchedPallet,
        emitWarnings: false
      });
      player.yaw = res.yaw;
      if (res.blocked) {
        triggerPalletBumpSound();
        syncActiveFloorJack();
        positionHitchedPallet();
        return false;
      }
      return true;
    }

    // --- PLAYER & PALLET UPDATE LOOP ---
    const VIEWMODEL_BASE_Y = -0.34;
    let viewmodelBob = 0;
    let wasAudioPaused = true;

    function resolvePlayerAudioZone() {
      const g = worldToGrid(player.position.x, player.position.z);
      const t = getTileType(g.col, g.row);
      if (t === 'F') return 'freezer';
      if (t === 'C') return 'cooler';
      if (t === 'H') return 'hallway';
      if (t === 'T' || player.position.z < doorZ) return 'trailer';
      return 'dock';
    }

    function updatePlayer(dt) {
      const sysPaused = Boolean(window.DSDGame && typeof window.DSDGame.isSystemPaused === 'function' && window.DSDGame.isSystemPaused());
      if (sysPaused || isBlockingModalOpen()) {
        pendingJackYawDelta = 0;
        if (!wasAudioPaused && SoundSystem && typeof SoundSystem.stopAmbientLoops === 'function') {
          SoundSystem.stopAmbientLoops();
        }
        wasAudioPaused = true;
        return;
      }
      wasAudioPaused = false;

      if (Math.abs(pendingJackYawDelta) > 1e-6) {
        const jackDelta = pendingJackYawDelta;
        pendingJackYawDelta = 0;
        setPlayerYawChecked(player.yaw + jackDelta);
      }

      let forwardInput = 0;
      let strafeInput = 0;

      if (keys.forward) forwardInput += 1;
      if (keys.backward) forwardInput -= 1;
      if (keys.left) strafeInput -= 1;
      if (keys.right) strafeInput += 1;

      if (joystickTouchId !== null) {
        strafeInput += joystickDelta.x;
        forwardInput -= joystickDelta.y;
      }

      const inputLen = Math.sqrt(strafeInput * strafeInput + forwardInput * forwardInput);
      if (inputLen > 1) {
        strafeInput /= inputLen;
        forwardInput /= inputLen;
      }

      const currentSpeed = player.speed;

      if (inputLen > 0.01) {
        const sinYaw = Math.sin(player.yaw);
        const cosYaw = Math.cos(player.yaw);

        const moveX = (-sinYaw * forwardInput + cosYaw * strafeInput) * currentSpeed * dt;
        const moveZ = (-cosYaw * forwardInput - sinYaw * strafeInput) * currentSpeed * dt;

        const startedBlocked = checkCollision(player.position.x, player.position.z, player.yaw, player.hitchedPallet, false);
        const testX = player.position.x + moveX;
        let blockedMove = false;
        if (Math.abs(moveX) > 1e-6) {
          const canEscapeX = startedBlocked && !checkCollision(
            player.position.x + Math.sign(moveX) * 0.45,
            player.position.z,
            player.yaw,
            player.hitchedPallet,
            false
          );
          if (!checkCollision(testX, player.position.z) || canEscapeX) {
            player.position.x = testX;
          } else {
            blockedMove = true;
          }
        }

        const testZ = player.position.z + moveZ;
        if (Math.abs(moveZ) > 1e-6) {
          const canEscapeZ = startedBlocked && !checkCollision(
            player.position.x,
            player.position.z + Math.sign(moveZ) * 0.45,
            player.yaw,
            player.hitchedPallet,
            false
          );
          if (!checkCollision(player.position.x, testZ) || canEscapeZ) {
            player.position.z = testZ;
          } else {
            blockedMove = true;
          }
        }
        if (blockedMove && (player.hasElectricJack || player.hitchedPallet)) {
          triggerPalletBumpSound();
        }
      }
      updateBoundaryWarningReset(player.position.x, player.position.z);

      if (player.hasElectricJack) {
        const drainPerSec = inputLen > 0.01
          ? (player.hitchedPallet ? 0.063 : 0.043)
          : 0.008;
        jackBattery = Math.max(5, jackBattery - drainPerSec * dt);
        if (!jackLowBatteryWarned && jackBattery <= 25) {
          jackLowBatteryWarned = true;
          showNotification(`[[ico:claim]] ELECTRIC JACK BATTERY LOW (${Math.floor(jackBattery)}%) — Plug into Charger between Bays 1 & 2!`, 'high');
        }

        if (inputLen > 0.01) {
          viewmodelBob += dt * currentSpeed * 6.5;
          electricJackViewmodel.position.y = VIEWMODEL_BASE_Y + Math.sin(viewmodelBob) * 0.012;
          electricJackViewmodel.position.x = Math.cos(viewmodelBob * 0.5) * 0.008;
        } else {
          electricJackViewmodel.position.y = VIEWMODEL_BASE_Y;
          electricJackViewmodel.position.x = 0;
        }
      }

      if (SoundSystem && typeof SoundSystem.updateMotionAudio === 'function') {
        SoundSystem.updateMotionAudio(dt, {
          paused: false,
          moving: inputLen > 0.01,
          speed: currentSpeed * inputLen,
          hasElectricJack: player.hasElectricJack,
          hitchedPallet: Boolean(player.hitchedPallet),
          zone: resolvePlayerAudioZone()
        });
      }

      syncActiveFloorJack();
      positionHitchedPallet();

      syncCameraToPlayer();
    }

    // --- MINIMAP RENDERING ---
    let minimapBgCanvas = null;
    let minimapWorldCanvas = null;
    let minimapBgKey = '';
    let lastMinimapWorldMs = -1;
    let lastMinimapDrawMs = -1;
    let lastDoorLightsSyncMs = -1;
    let lastHudSyncMs = -1;
    let lastCanvasCursor = '';
    const playerEuler = (typeof THREE.Euler === 'function') ? new THREE.Euler(0, 0, 0, 'YXZ') : null;

    function syncCameraToPlayer() {
      camera.position.copy(player.position);
      if (playerEuler) {
        playerEuler.set(player.pitch, player.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(playerEuler);
      } else if (typeof THREE.Euler === 'function') {
        const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);
      }
    }
    syncCameraToPlayer();

    function buildMinimapStaticBg(cw, ch) {
      if (!minimapBgCanvas) {
        minimapBgCanvas = document.createElement('canvas');
      }
      if (minimapBgCanvas.width !== cw) minimapBgCanvas.width = cw;
      if (minimapBgCanvas.height !== ch) minimapBgCanvas.height = ch;
      const bgCtx = minimapBgCanvas.getContext('2d');
      if (!bgCtx) return;

      const cellW = cw / COLS;
      const cellH = ch / ROWS;
      bgCtx.clearRect(0, 0, cw, ch);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const type = DOCK_LAYOUT[r].charAt(c);
          const isHallTile = type === 'H' || (c === 10 && r >= 17 && r <= 22);
          if (r < 10) {
            bgCtx.fillStyle = '#0f172a';
            bgCtx.fillRect(c * cellW, r * cellH, cellW, cellH);
            continue;
          }

          let color = '#838a95';
          if (isHallTile) color = '#475569';
          else if (type === 'W') color = '#dc2626';
          else if (type === 'Y') color = '#786414';
          else if (type === 'F') color = '#0284c7';
          else if (type === 'C') color = '#7dd3fc';

          bgCtx.fillStyle = color;
          bgCtx.fillRect(c * cellW, r * cellH, cellW, cellH);
          bgCtx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
          bgCtx.lineWidth = 0.5;
          bgCtx.strokeRect(c * cellW, r * cellH, cellW, cellH);
        }
      }

      bgCtx.fillStyle = '#dc2626';
      bgCtx.fillRect(0, 10 * cellH - 1.5, cw, 2);

      // Draw 2D layout fixtures (West Sales Floor Doors + Hallway Fixtures across Rows 23-24)
      {
        const totalWorldW = COLS * TILE_SIZE;
        const totalWorldH = ROWS * TILE_SIZE;
        const toMx = (wx) => ((wx - ORIGIN_X) / totalWorldW) * cw;
        const toMz = (wz) => ((wz - ORIGIN_Z) / totalWorldH) * ch;
        const hNorthZ = ORIGIN_Z + 23 * TILE_SIZE;
        const hEndZ = ORIGIN_Z + ROWS * TILE_SIZE - 0.25;
        const hCenterZ = (hNorthZ + hEndZ) / 2;

        // Dock West-wall inset double black sales floor doors (Rows 13-14, Col 0)
        bgCtx.fillStyle = '#090d16';
        bgCtx.fillRect(0, toMz(8.05), 3.5, Math.max(4, toMz(11.15) - toMz(8.05)));

        // Hallway North wall fixtures: Vending (-3.45..-0.40), Coat rack (1.70..3.70), Lockers (4.16..9.76)
        bgCtx.fillStyle = '#ef4444';
        bgCtx.fillRect(toMx(-3.40), toMz(hNorthZ), toMx(-0.40) - toMx(-3.40), Math.max(2, toMz(hNorthZ + 0.87) - toMz(hNorthZ)));
        bgCtx.fillStyle = '#cbd5e1';
        bgCtx.fillRect(toMx(1.70), toMz(hNorthZ), toMx(3.70) - toMx(1.70), Math.max(2, toMz(hNorthZ + 0.35) - toMz(hNorthZ)));
        bgCtx.fillStyle = '#60a5fa';
        bgCtx.fillRect(toMx(4.16), toMz(hNorthZ), toMx(9.76) - toMx(4.16), Math.max(2.5, toMz(hNorthZ + 0.53) - toMz(hNorthZ)));
        // Expanded Timeclock Station on East corner wall
        bgCtx.fillStyle = '#f59e0b';
        bgCtx.fillRect(toMx(12.40), toMz(hCenterZ - 0.86), Math.max(2.5, toMx(12.95) - toMx(12.40)), Math.max(3, toMz(hCenterZ + 0.86) - toMz(hCenterZ - 0.86)));
        // Double black sales floor doors on West end of Hallway
        bgCtx.fillStyle = '#090d16';
        bgCtx.fillRect(toMx(-13.15), toMz(hCenterZ - 1.20), Math.max(2.5, toMx(-12.80) - toMx(-13.15)), Math.max(4, toMz(hCenterZ + 1.20) - toMz(hCenterZ - 1.20)));
        // South wall closed decorative doors + Fire Extinguisher & First Aid station
        bgCtx.fillStyle = '#dc2626';
        bgCtx.fillRect(toMx(-9.15), toMz(hEndZ - 0.20), Math.max(2.5, toMx(-8.05) - toMx(-9.15)), 2);
        bgCtx.fillStyle = '#92400e';
        bgCtx.fillRect(toMx(-3.08), toMz(hEndZ - 0.20), Math.max(2, toMx(-2.12) - toMx(-3.08)), 2);
        bgCtx.fillStyle = '#0d9488';
        bgCtx.fillRect(toMx(1.86), toMz(hEndZ - 0.20), Math.max(2, toMx(2.94) - toMx(1.86)), 2);
        bgCtx.fillStyle = '#94a3b8';
        bgCtx.fillRect(toMx(6.35), toMz(hEndZ - 0.20), Math.max(2, toMx(7.25) - toMx(6.35)), 2);
      }

      if (Array.isArray(steelRacks)) {
        const totalWorldW = COLS * TILE_SIZE;
        const totalWorldH = ROWS * TILE_SIZE;
        steelRacks.forEach((rk) => {
          const b = rk.bounds;
          const rx = ((b.minX - ORIGIN_X) / totalWorldW) * cw;
          const rz = ((b.minZ - ORIGIN_Z) / totalWorldH) * ch;
          const rw = ((b.maxX - b.minX) / totalWorldW) * cw;
          const rh = ((b.maxZ - b.minZ) / totalWorldH) * ch;
          bgCtx.fillStyle = 'rgba(15, 23, 42, 0.72)';
          bgCtx.fillRect(rx, rz, rw, rh);
          bgCtx.strokeStyle = rk.accentCss || '#ea580c';
          bgCtx.lineWidth = 1.2;
          bgCtx.strokeRect(rx + 0.5, rz + 0.5, Math.max(2, rw - 1), Math.max(2, rh - 1));
        });
      }
      minimapBgKey = `${cw}x${ch}`;
    }

    function renderMinimapWorldLayer(cw, ch) {
      if (!minimapWorldCanvas) {
        minimapWorldCanvas = document.createElement('canvas');
      }
      if (minimapWorldCanvas.width !== cw) minimapWorldCanvas.width = cw;
      if (minimapWorldCanvas.height !== ch) minimapWorldCanvas.height = ch;
      const wCtx = minimapWorldCanvas.getContext('2d');
      if (!wCtx) return;

      const cellW = cw / COLS;
      const cellH = ch / ROWS;
      wCtx.clearRect(0, 0, cw, ch);
      if (minimapBgCanvas) {
        wCtx.drawImage(minimapBgCanvas, 0, 0);
      }

      // Draw docked trailers in rows 0..9 + outline
      dockDoors.forEach((dd) => {
        if (dd.hasTrailer) {
          const trailerRows = (dd.trailerType === 'vendor_truck') ? 6 : 10;
          const startRow = 10 - trailerRows;
          const rx = dd.colStart * cellW;
          const ry = startRow * cellH;
          const rw = 2 * cellW;
          const rh = trailerRows * cellH;
          wCtx.fillStyle = '#9c6644';
          wCtx.fillRect(rx, ry, rw, rh);
          wCtx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
          wCtx.lineWidth = 0.5;
          for (let r = startRow; r < 10; r++) {
            for (let c = dd.colStart; c <= dd.colEnd; c++) {
              wCtx.strokeRect(c * cellW, r * cellH, cellW, cellH);
            }
          }
          wCtx.strokeStyle = '#cbd5e1';
          wCtx.lineWidth = 1;
          wCtx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
        }
      });

      // Draw dock doors with live beacon status matching 2D DSD tutorial signals
      dockDoors.forEach(dd => {
        const x1 = dd.colStart * cellW;
        const w = 2 * cellW;
        const y = 10 * cellH - 1.5;
        wCtx.fillStyle = dd.beaconColor || (dd.isOpen ? '#f59e0b' : '#22c55e');
        wCtx.fillRect(x1, y, w, 3.5);
      });

      // Draw Side Rollup Door on East Wall (Row 14.5, Col 10) with live beacon status
      const sdy = 13.5 * cellH;
      const sdx = 11 * cellW - 3.5;
      wCtx.fillStyle = sideRollupDoor.beaconColor || (sideRollupDoor.isOpen ? '#f59e0b' : '#22c55e');
      wCtx.fillRect(sdx, sdy - 4.5, 3.5, 9);

      // Draw Backstock Overstock Staging Pallets near each Steel Rack on minimap
      if (Array.isArray(overstockPallets)) {
        const totalWorldW = COLS * TILE_SIZE;
        const totalWorldH = ROWS * TILE_SIZE;
        overstockPallets.forEach((op) => {
          if (op.group && !op.group.visible) return;
          const b = op.bounds;
          const ox = ((b.minX - ORIGIN_X) / totalWorldW) * cw;
          const oz = ((b.minZ - ORIGIN_Z) / totalWorldH) * ch;
          const ow = ((b.maxX - b.minX) / totalWorldW) * cw;
          const oh = ((b.maxZ - b.minZ) / totalWorldH) * ch;
          wCtx.fillStyle = 'rgba(180, 130, 70, 0.85)';
          wCtx.fillRect(ox, oz, Math.max(2, ow), Math.max(2, oh));
          wCtx.strokeStyle = op.accentCss || '#f59e0b';
          wCtx.lineWidth = 1;
          wCtx.strokeRect(ox, oz, Math.max(2, ow), Math.max(2, oh));
        });
      }

      // Draw Recall Cart on minimap only while visible (active recall)
      if (recallCart && recallCart.bounds && recallCart.group && recallCart.group.visible) {
        const totalWorldW = COLS * TILE_SIZE;
        const totalWorldH = ROWS * TILE_SIZE;
        const rb = recallCart.bounds;
        const rx = ((rb.minX - ORIGIN_X) / totalWorldW) * cw;
        const rz = ((rb.minZ - ORIGIN_Z) / totalWorldH) * ch;
        const rw = ((rb.maxX - rb.minX) / totalWorldW) * cw;
        const rh = ((rb.maxZ - rb.minZ) / totalWorldH) * ch;
        wCtx.fillStyle = '#94a3b8';
        wCtx.fillRect(rx, rz, Math.max(2, rw), Math.max(3, rh));
        wCtx.strokeStyle = '#f59e0b';
        wCtx.lineWidth = 1;
        wCtx.strokeRect(rx, rz, Math.max(2, rw), Math.max(3, rh));
      }

      // Draw pallets on minimap
      pallets.forEach(p => {
        const normPx = (p.position.x - ORIGIN_X) / (COLS * TILE_SIZE);
        const normPz = (p.position.z - ORIGIN_Z) / (ROWS * TILE_SIZE);
        const mx = normPx * cw;
        const my = normPz * ch;

        let pCol = '#f8fafc';
        if (p.data.targetZone === 'F') pCol = '#0284c7';
        else if (p.data.targetZone === 'C') pCol = '#38bdf8';
        else if (p.data.targetZone === 'D') pCol = '#f59e0b';

        if (p.isHitched) pCol = '#eab308';

        wCtx.fillStyle = pCol;
        wCtx.fillRect(mx - 2.5, my - 2.5, 5, 5);
        wCtx.strokeStyle = '#000';
        wCtx.lineWidth = 1;
        wCtx.strokeRect(mx - 2.5, my - 2.5, 5, 5);
      });

      // Draw parked electric jack on minimap
      if (!player.hasElectricJack && electricJackWorld.visible) {
        const normJx = (electricJackWorld.position.x - ORIGIN_X) / (COLS * TILE_SIZE);
        const normJz = (electricJackWorld.position.z - ORIGIN_Z) / (ROWS * TILE_SIZE);
        const jx = normJx * cw;
        const jy = normJz * ch;
        wCtx.fillStyle = '#f59e0b';
        wCtx.fillRect(jx - 3.5, jy - 3.5, 7, 7);
        wCtx.strokeStyle = '#000000';
        wCtx.lineWidth = 1;
        wCtx.strokeRect(jx - 3.5, jy - 3.5, 7, 7);
      }

      // Draw all active delivery drivers and carts across door queues on minimap
      DeliverySystem.sessions.forEach((s) => {
        if (s.driver && s.driver.mesh && s.driver.mesh.parent) {
          const dPos = s.driver.mesh.position;
          const normDx = (dPos.x - ORIGIN_X) / (COLS * TILE_SIZE);
          const normDz = (dPos.z - ORIGIN_Z) / (ROWS * TILE_SIZE);
          const dmx = normDx * cw;
          const dmy = normDz * ch;

          let dCol = '#38bdf8'; // Blue for side door
          if (s.driver.variant === 'warehouse') dCol = '#22c55e'; // Green for warehouse
          else if (s.driver.variant === 'vendor_truck') dCol = '#94a3b8'; // Grey for vendor truck

          wCtx.fillStyle = dCol;
          wCtx.beginPath();
          wCtx.arc(dmx, dmy, 3.8, 0, Math.PI * 2);
          wCtx.fill();
          wCtx.strokeStyle = '#000000';
          wCtx.lineWidth = 1;
          wCtx.stroke();
        }

        if (s.cart && s.cart.mesh && s.cart.mesh.parent) {
          const cPos = s.cart.mesh.position;
          const normCx = (cPos.x - ORIGIN_X) / (COLS * TILE_SIZE);
          const normCz = (cPos.z - ORIGIN_Z) / (ROWS * TILE_SIZE);
          const cmx = normCx * cw;
          const cmy = normCz * ch;

          wCtx.fillStyle = '#f59e0b';
          wCtx.fillRect(cmx - 2.5, cmy - 3.5, 5, 7);
          wCtx.strokeStyle = '#000000';
          wCtx.lineWidth = 0.8;
          wCtx.strokeRect(cmx - 2.5, cmy - 3.5, 5, 7);
        }
      });
    }

    let tutorialBeacon = null;

    function ensureTutorialBeacon() {
      if (tutorialBeacon) return tutorialBeacon;
      if (typeof THREE === 'undefined' || !scene || typeof THREE.Group !== 'function') return null;

      const group = new THREE.Group();
      group.visible = false;

      const ringGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.04, 24, 1, true);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.72,
        depthWrite: false
      });
      if (THREE.DoubleSide !== undefined) ringMat.side = THREE.DoubleSide;
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.05;
      group.add(ringMesh);

      const discGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.02, 20);
      const discMat = new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
      });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.y = 0.03;
      group.add(discMesh);

      const pillarGeo = new THREE.CylinderGeometry(0.18, 0.42, 3.6, 16, 1, true);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.24,
        depthWrite: false
      });
      if (THREE.DoubleSide !== undefined) pillarMat.side = THREE.DoubleSide;
      const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
      pillarMesh.position.y = 1.85;
      group.add(pillarMesh);

      const capGeo = new THREE.SphereGeometry(0.18, 12, 12);
      const capMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.92
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.y = 2.3;
      group.add(capMesh);

      scene.add(group);
      tutorialBeacon = { group, ringMesh, ringMat, discMesh, discMat, pillarMesh, pillarMat, capMesh };
      return tutorialBeacon;
    }

    function getActiveTutorialWorldTarget() {
      if (!window.DSDTutorial || typeof window.DSDTutorial.getActiveWorldTarget !== 'function') {
        return null;
      }
      const target = window.DSDTutorial.getActiveWorldTarget();
      if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.z))) {
        return null;
      }
      return target;
    }

    function updateTutorialWorldGuidance(nowMs) {
      const target = getActiveTutorialWorldTarget();
      if (!target) {
        if (tutorialBeacon && tutorialBeacon.group) {
          tutorialBeacon.group.visible = false;
        }
        return;
      }
      const beacon = ensureTutorialBeacon();
      if (!beacon || !beacon.group) return;

      const t = (Number.isFinite(nowMs) ? nowMs : performance.now()) * 0.001;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      const colorHex = target.colorHex !== undefined ? target.colorHex : 0x22c55e;

      beacon.group.visible = true;
      beacon.group.position.set(
        Number(target.x) || 0,
        Number(target.y) || 0,
        Number(target.z) || 0
      );

      if (beacon.ringMat && beacon.ringMat.color && typeof beacon.ringMat.color.setHex === 'function') {
        beacon.ringMat.color.setHex(colorHex);
        beacon.ringMat.opacity = 0.45 + pulse * 0.45;
      }
      if (beacon.discMat && beacon.discMat.color && typeof beacon.discMat.color.setHex === 'function') {
        beacon.discMat.color.setHex(colorHex);
        beacon.discMat.opacity = 0.12 + pulse * 0.16;
      }
      if (beacon.pillarMat && beacon.pillarMat.color && typeof beacon.pillarMat.color.setHex === 'function') {
        beacon.pillarMat.color.setHex(colorHex);
        beacon.pillarMat.opacity = 0.14 + pulse * 0.16;
      }
      const ringScale = 0.85 + pulse * 0.35;
      beacon.ringMesh.scale.set(ringScale, 1, ringScale);
      beacon.capMesh.position.y = 2.0 + Math.sin(t * 3.4) * 0.25;
      beacon.pillarMesh.visible = target.showPillar !== false;
    }

    function renderMinimap(nowMs) {
      const cw = minimapCanvas.width;
      const ch = minimapCanvas.height;
      const tickMs = Number.isFinite(nowMs) ? nowMs : performance.now();

      if (!minimapBgCanvas || minimapBgKey !== `${cw}x${ch}`) {
        buildMinimapStaticBg(cw, ch);
        lastMinimapWorldMs = -1;
      }

      if (!minimapWorldCanvas || lastMinimapWorldMs < 0 || (tickMs - lastMinimapWorldMs) >= 220) {
        lastMinimapWorldMs = tickMs;
        renderMinimapWorldLayer(cw, ch);
      }

      minimapCtx.clearRect(0, 0, cw, ch);
      if (minimapWorldCanvas) {
        minimapCtx.drawImage(minimapWorldCanvas, 0, 0);
      } else if (minimapBgCanvas) {
        minimapCtx.drawImage(minimapBgCanvas, 0, 0);
      }

      // Draw pulsing Tutorial Objective ping on minimap when a tutorial world target is active
      const tutTarget = getActiveTutorialWorldTarget();
      if (tutTarget) {
        const tx = ((Number(tutTarget.x) - ORIGIN_X) / (COLS * TILE_SIZE)) * cw;
        const ty = ((Number(tutTarget.z) - ORIGIN_Z) / (ROWS * TILE_SIZE)) * ch;
        const pulse = 0.5 + 0.5 * Math.sin(tickMs * 0.008);
        minimapCtx.save();
        minimapCtx.strokeStyle = '#4ade80';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.arc(tx, ty, 5 + pulse * 5, 0, Math.PI * 2);
        minimapCtx.stroke();
        minimapCtx.fillStyle = '#facc15';
        minimapCtx.beginPath();
        minimapCtx.arc(tx, ty, 3.2, 0, Math.PI * 2);
        minimapCtx.fill();
        minimapCtx.restore();
      }

      // Draw player position and heading
      const normX = (player.position.x - ORIGIN_X) / (COLS * TILE_SIZE);
      const normZ = (player.position.z - ORIGIN_Z) / (ROWS * TILE_SIZE);

      const px = normX * cw;
      const py = normZ * ch;

      minimapCtx.save();
      minimapCtx.translate(px, py);
      minimapCtx.rotate(-player.yaw);

      minimapCtx.fillStyle = player.hasElectricJack ? '#f59e0b' : '#ffffff';
      minimapCtx.beginPath();
      minimapCtx.arc(0, 0, 4, 0, Math.PI * 2);
      minimapCtx.fill();

      minimapCtx.strokeStyle = '#ef4444';
      minimapCtx.lineWidth = 2.5;
      minimapCtx.beginPath();
      minimapCtx.moveTo(0, 0);
      minimapCtx.lineTo(0, -10);
      minimapCtx.stroke();

      minimapCtx.restore();
    }

    function mapBeaconToPanelColor(beaconColor) {
      if (beaconColor === '#f59e0b') return '#facc15';
      if (beaconColor === '#334155') return '#27272a';
      return beaconColor || '#22c55e';
    }

    const doorLightsPanelEl = document.getElementById('door-lights-panel');
    const doorLightsPopupEl = document.getElementById('hud-door-lights-popup');
    const doorLightsRowsEl = document.getElementById('hud-door-lights-rows');
    const doorLightsCountEl = document.getElementById('hud-door-lights-count');
    const sdQueueTxtEl = document.getElementById('dlp-sd-queue-txt');
    const whDriverTagEl = document.getElementById('dlp-wh-driver-tag');
    const vtDriverTagEl = document.getElementById('dlp-vt-driver-tag');
    const sdVendorTagEl = document.getElementById('dlp-sd-vendor-tag');
    let lastSdQueueCount = -1;
    const lastWaitingByType = { warehouse: null, vendor_truck: null, sidedoor: null };
    let lastBeaconsPopupKey = '';

    function escPopupHtml(s) {
      return String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function renderDoorLightsPopup(force) {
      if (!doorLightsRowsEl) return;
      const sessions = (typeof DeliverySystem !== 'undefined' && DeliverySystem && Array.isArray(DeliverySystem.sessions))
        ? DeliverySystem.sessions
        : [];
      const snap = (window.ShiftClock && typeof window.ShiftClock.getTimeSnapshot === 'function')
        ? window.ShiftClock.getTimeSnapshot()
        : { totalMinutes: 360 };
      const rows = global.buildDoorQueuePopupRows({
        sessions: sessions,
        nowMinutes: snap.totalMinutes
      });
      const key = rows.map((r) => r.direction + '|' + r.badgeText + '|' + r.carrier + '|' + (r.deliveryType || '') + '|' + r.detailText + '|' + (r.isLate ? 1 : 0)).join(';');
      if (!force && key === lastBeaconsPopupKey) return;
      lastBeaconsPopupKey = key;

      if (doorLightsCountEl) {
        doorLightsCountEl.textContent = rows.length > 0 ? (rows.length + ' WAITING') : 'CLEAR';
        doorLightsCountEl.classList.toggle('has-waiters', rows.length > 0);
      }

      if (rows.length === 0) {
        doorLightsRowsEl.innerHTML = '<div class="dlp-pop-empty">No one waiting to enter or exit.</div>';
        return;
      }

      doorLightsRowsEl.innerHTML = rows.map((r) => {
        const rowCls = r.direction === 'exit' ? 'is-exit' : (r.isWh ? 'is-wh' : '');
        const dirCls = r.direction === 'exit' ? 'exit' : 'enter';
        const lateHtml = r.isLate ? '<span class="dlp-pop-late">LATE</span>' : '';
        const typeIconHtml = (typeof global.getDeliveryTypeSvg === 'function' && r.deliveryType)
          ? '<span class="dlp-pop-type-ico" aria-hidden="true">' + global.getDeliveryTypeSvg(r.deliveryType) + '</span>'
          : '';
        const detailHtml = r.detailText ? '<span>' + escPopupHtml(r.detailText) + '</span>' : '';
        return (
          '<div class="dlp-pop-row ' + rowCls + '">' +
          '<span class="dlp-pop-left">' +
          '<span class="dlp-pop-dir ' + dirCls + '">' + escPopupHtml(r.badgeText) + '</span>' +
          '<span class="dlp-pop-name">' + escPopupHtml(r.carrier) + '</span>' +
          '</span>' +
          '<span class="dlp-pop-meta">' + lateHtml + typeIconHtml + detailHtml + '</span>' +
          '</div>'
        );
      }).join('');
    }

    function setDoorLightsPopupOpen(open) {
      if (!doorLightsPanelEl || !doorLightsPopupEl) return;
      const isOpen = Boolean(open);
      if (isOpen) {
        if (window.DSDGame && typeof window.DSDGame.closeAllCommandBarPopovers === 'function') {
          window.DSDGame.closeAllCommandBarPopovers(setDoorLightsPopupOpen);
        }
        renderDoorLightsPopup(true);
      }
      doorLightsPanelEl.classList.toggle('beacons-open', isOpen);
      doorLightsPanelEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      doorLightsPopupEl.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }

    function toggleDoorLightsPopup() {
      if (!doorLightsPanelEl) return false;
      const next = !doorLightsPanelEl.classList.contains('beacons-open');
      setDoorLightsPopupOpen(next);
      return next;
    }

    if (doorLightsPanelEl && doorLightsPopupEl && window.DSDGame && typeof window.DSDGame.bindCommandBarPopover === 'function') {
      window.DSDGame.bindCommandBarPopover(doorLightsPanelEl, doorLightsPopupEl, 'beacons-open', '#hud-door-lights-popup', setDoorLightsPopupOpen);
    }

    function renderDoorLightsPanel() {
      for (let i = 0; i < 4; i++) {
        const dd = dockDoors[i];
        const rawColor = dd ? (dd.beaconColor || (dd.isOpen ? '#f59e0b' : '#22c55e')) : '#22c55e';
        const color = mapBeaconToPanelColor(rawColor);
        if (doorLightEls[i] && lastDoorLightColors[i] !== color) {
          lastDoorLightColors[i] = color;
          doorLightEls[i].style.backgroundColor = color;
        }
      }
      const sdRaw = sideRollupDoor ? (sideRollupDoor.beaconColor || (sideRollupDoor.isOpen ? '#f59e0b' : '#22c55e')) : '#22c55e';
      const sdColor = mapBeaconToPanelColor(sdRaw);
      if (doorLightEls[4] && lastDoorLightColors[4] !== sdColor) {
        lastDoorLightColors[4] = sdColor;
        doorLightEls[4].style.backgroundColor = sdColor;
      }

      if (sdQueueTxtEl || whDriverTagEl || vtDriverTagEl || sdVendorTagEl) {
        const sessions = (typeof DeliverySystem !== 'undefined' && DeliverySystem && Array.isArray(DeliverySystem.sessions))
          ? DeliverySystem.sessions
          : [];
        const count = global.countDoorQueueSessions(sessions);
        if (sdQueueTxtEl && lastSdQueueCount !== count) {
          lastSdQueueCount = count;
          sdQueueTxtEl.textContent = String(count);
        }
        const waitingFlags = global.getSideDoorWaitingTypeFlags(sessions);
        [
          { key: 'warehouse', el: whDriverTagEl },
          { key: 'vendor_truck', el: vtDriverTagEl },
          { key: 'sidedoor', el: sdVendorTagEl }
        ].forEach((entry) => {
          if (entry.el && lastWaitingByType[entry.key] !== waitingFlags[entry.key]) {
            lastWaitingByType[entry.key] = waitingFlags[entry.key];
            entry.el.classList.toggle('active', waitingFlags[entry.key]);
          }
        });
      }

      if (doorLightsPanelEl && doorLightsPanelEl.classList.contains('beacons-open')) {
        renderDoorLightsPopup(false);
      }
    }

    // --- Main Animation Loop ---
    let lastTime = performance.now();
    let lastScannerUiSyncMs = -1;

    function animate(now) {
      requestAnimationFrame(animate);
      pointerLookCtrl.beginFrame();

      let dt = (now - lastTime) / 1000;
      if (dt > 0.11) dt = 0.11;
      if (dt < 0) dt = 0;
      lastTime = now;

      // In-game time runs continuously across all in-game modals/windows (Scanner, Invoice, CRT Terminal).
      // Only pause ShiftClock when a future in-game System/Pause Menu or Shift Summary is open.
      const isSystemPaused = Boolean(window.DSDGame && typeof window.DSDGame.isSystemPaused === 'function' && window.DSDGame.isSystemPaused());
      if (window.ShiftClock) {
        window.ShiftClock.update(dt, isSystemPaused);
        const clockSnap = window.ShiftClock.getTimeSnapshot();
        wallClock.setTime(clockSnap.hour, clockSnap.minute, clockSnap.second, clockSnap.millisecond, true);
        if (typeof hallwayTimeclock !== 'undefined' && player && player.position) {
          const px = Number(player.position.x) || 0;
          const pz = Number(player.position.z) || 0;
          if (pz >= 28.0 || (px >= 9.6 && pz >= 21.5)) {
            hallwayTimeclock.setTime(clockSnap.hour, clockSnap.minute);
          }
        }
      } else {
        wallClock.update();
      }
      if (window.DSDGame && (lastHudSyncMs < 0 || (now - lastHudSyncMs) >= 100)) {
        lastHudSyncMs = now;
        window.DSDGame.updateHud();
      }

      updatePlayer(dt);
      if (!isSystemPaused) {
        if (jackDockedAtCharger && jackBattery < 100) {
          jackBattery = Math.min(100, jackBattery + 1.2 * dt);
          if (jackBattery >= 35) jackLowBatteryWarned = false;
        }
        updateNearbyInteractions(dt);
        DeliverySystem.update(dt);
        if (window.BackstockRacks && typeof window.BackstockRacks.update === 'function') {
          window.BackstockRacks.update(dt);
        }
        if (window.ClaimsTotes && typeof window.ClaimsTotes.update === 'function') {
          window.ClaimsTotes.update(dt, player.position);
        }
      }
      syncElectricJackBatteryVisuals(now);
      if (typeof topDrawerGroup !== 'undefined' && topDrawerGroup) {
        const targetSlideX = drawerState.topDrawerSlideOpen ? TOP_DRAWER_OPEN_X : 0;
        topDrawerGroup.position.x += (targetSlideX - topDrawerGroup.position.x) * Math.min(1, 6.5 * dt);
        if (Math.abs(targetSlideX - topDrawerGroup.position.x) < 0.005) {
          topDrawerGroup.position.x = targetSlideX;
        }
        if (drawerState.pendingArchiveOpen) {
          drawerState.pendingArchiveTimer += dt;
          if (Math.abs(topDrawerGroup.position.x - TOP_DRAWER_OPEN_X) < 0.012 || drawerState.pendingArchiveTimer > 0.9) {
            topDrawerGroup.position.x = TOP_DRAWER_OPEN_X;
            drawerState.pendingArchiveOpen = false;
            drawerState.pendingArchiveTimer = 0;
            if (window.DSDReceipts) window.DSDReceipts.openInvoiceArchive();
          }
        }
      }
      if (player.scannerActive) {
        if (lastScannerUiSyncMs < 0 || (now - lastScannerUiSyncMs) >= 250) {
          lastScannerUiSyncMs = now;
          updateScannerDisplay();
        }
      } else {
        lastScannerUiSyncMs = -1;
      }
      if (!lastDoorLightsSyncMs || lastDoorLightsSyncMs < 0 || (now - lastDoorLightsSyncMs) >= 80) {
        lastDoorLightsSyncMs = now;
        renderDoorLightsPanel();
      }
      if (!lastMinimapDrawMs || lastMinimapDrawMs < 0 || (now - lastMinimapDrawMs) >= 66) {
        lastMinimapDrawMs = now;
        renderMinimap(now);
      }
      updateTutorialWorldGuidance(now);
      renderer.render(scene, camera);

      const frameWorkMs = performance.now() - now;
      fpsFrameCount += 1;
      fpsWorkAccumMs += frameWorkMs;
      const elapsedFpsMs = now - fpsWindowStartMs;
      if (elapsedFpsMs >= 500) {
        fpsMetrics.fps = Math.round((fpsFrameCount * 1000) / Math.max(1, elapsedFpsMs));
        fpsMetrics.avgMs = fpsWorkAccumMs / Math.max(1, fpsFrameCount);
        fpsFrameCount = 0;
        fpsWorkAccumMs = 0;
        fpsWindowStartMs = now;
        if (gfxSettings.showFps) {
          liveFpsEl.textContent = `${fpsMetrics.fps} FPS · ${fpsMetrics.avgMs.toFixed(1)}ms (${gfxSettings.quality.toUpperCase()})`;
        }
        const pauseFpsEl = document.getElementById('pause-fps-val');
        if (pauseFpsEl && isSystemPaused) {
          pauseFpsEl.textContent = `${fpsMetrics.fps} FPS · ${fpsMetrics.avgMs.toFixed(1)}ms`;
        }
      }
    }

    if (window.WarehouseTrucks) {
      window.WarehouseTrucks.init({
        dockDoors: dockDoors,
        pallets: pallets,
        createPallet3D: createPallet3D,
        removePallet3D: removePallet3D,
        updateStagedCounter: updateStagedCounter,
        getActiveVendorDelivery: () => DeliverySystem.activeDelivery,
        getActiveVendorDeliveries: () => DeliverySystem.sessions.map((s) => s.delivery),
        canAcceptWaitingDriver: (deliveryType) => DeliverySystem.canAcceptOutsideWaiting(deliveryType),
        onTruckArrived: (truck) => {
          if (truck && truck.dockBay) {
            DeliverySystem.enqueueArrivedDelivery(truck, 'D' + truck.dockBay);
          }
        },
        onWarehouseUnloaded: (truck) => {
          DeliverySystem.onWarehouseUnloaded(truck);
        },
        onWarehouseCompleted: (truck) => {
          DeliverySystem.onWarehouseCompleted(truck);
        },
        showNotification: showNotification,
        showAlert: showAlert,
        showPopupModal: showPopupModal,
        playSuccess: () => SoundSystem.playSuccessChime(),
        playError: () => SoundSystem.playErrorBuzzer(),
        playTruckDockBrake: () => { if (SoundSystem.playTruckDockBrake) SoundSystem.playTruckDockBrake(); },
        onScheduleUpdated: () => {
          renderPendingDeliveriesPanel();
          updateStagedCounter();
        }
      });
      DELIVERY_MANIFEST.length = 0;
      DELIVERY_MANIFEST.push(...window.WarehouseTrucks.getNonWarehouseQueue());
    }

    if (window.BackstockRacks) {
      window.BackstockRacks.init({
        scene: scene,
        camera: camera,
        world: world,
        showNotification: showNotification,
        playDropSound: () => SoundSystem.playDropSound()
      });
    }

    if (window.ClaimsTotes) {
      window.ClaimsTotes.init({
        scene: scene,
        camera: camera,
        world: world,
        onRecallTriggered: (rec) => {
          SoundSystem.playErrorBuzzer();
          setTimeout(() => SoundSystem.playButtonClick(), 260);
          showAlert(`[[ico:siren]] PRODUCT RECALL ALERT\n\n"${rec.productName}" has been recalled!\n1. Inspect & rearrange units on the Recall Cart top shelf to count them.\n2. Pick up the small gray tote on the bottom shelf & collect each unit into it.\n3. Dump in ${rec.correctBinLabel}, then submit your counted total on Computer Terminal [4].`);
          if (uiState.terminalModalOpen && window.DSDReceipts && typeof window.DSDReceipts.renderTerminalUI === 'function') {
            window.DSDReceipts.renderTerminalUI();
          }
        }
      });
    }

    let campaignStarted = false;

    function syncDoorMeshesImmediate() {
      dockDoors.forEach((dd) => {
        const easedProg = 0.5 - 0.5 * Math.cos((dd.currentProgress || 0) * Math.PI);
        const openOffset = easedProg * (doorHeight - 0.2);
        if (dd.curtainMesh) {
          dd.curtainMesh.position.y = doorHeight / 2 + openOffset;
          dd.curtainMesh.scale.y = Math.max(0.05, 1 - easedProg * 0.95);
        }
        if (dd.trailerGroup) {
          dd.trailerGroup.visible = Boolean(dd.hasTrailer);
          if (dd.whSemiGroup) dd.whSemiGroup.visible = (dd.trailerType !== 'vendor_truck');
          if (dd.vendorSemiGroup) dd.vendorSemiGroup.visible = (dd.trailerType === 'vendor_truck');
        }
        if (dd.trailerDoorCurtain) {
          const tH = dd.trailerDoorH || (doorHeight - 0.14);
          const easedTD = 0.5 - 0.5 * Math.cos((dd.trailerDoorProgress || 0) * Math.PI);
          dd.trailerDoorCurtain.position.y = tH / 2 + easedTD * (tH - 0.25);
          dd.trailerDoorCurtain.scale.y = Math.max(0.05, 1 - easedTD * 0.94);
        }
      });
      if (sideRollupDoor && sideRollupDoor.curtainMesh) {
        const easedSide = 0.5 - 0.5 * Math.cos((sideRollupDoor.currentProgress || 0) * Math.PI);
        sideRollupDoor.curtainMesh.position.y = sideRollupDoor.height / 2 + easedSide * (sideRollupDoor.height - 0.2);
        sideRollupDoor.curtainMesh.scale.y = Math.max(0.05, 1 - easedSide * 0.95);
      }
      renderDoorLightsPanel();
    }

    function resetAllForFreshCampaign(opts) {
      const o = opts || {};
      const isTut = Boolean(o.tutorialMode);
      const tutScript = o.tutorialScript !== undefined ? o.tutorialScript : null;

      DeliverySystem.cancelPendingArrivals();
      DeliverySystem.clearAllSessions();
      closeScanner();
      closeInvoice();
      closeWarehouseBol();
      closeTerminal();
      closeDoorQueueModal(true);

      if (window.ShiftClock) window.ShiftClock.init({ tutorialMode: isTut });
      if (window.ShiftStats) window.ShiftStats.resetDailyStats();
      if (window.DSDMessages && typeof window.DSDMessages.clearSession === 'function') {
        window.DSDMessages.clearSession();
      }
      if (typeof togglePendingDeliveriesPanel === 'function') {
        togglePendingDeliveriesPanel(true);
      }

      dockDoors.forEach((dd) => {
        dd.isOpen = false;
        dd.currentProgress = 0;
        dd.timeOpen = 0;
        dd.hasTrailer = false;
        dd.trailerType = null;
        dd.trailerDoorOpen = false;
        dd.trailerDoorProgress = 0;
      });
      sideRollupDoor.isOpen = false;
      sideRollupDoor.currentProgress = 0;
      sideRollupDoor.timeOpen = 0;
      drawerState.pendingArchiveOpen = false;
      drawerState.pendingArchiveTimer = 0;
      drawerState.topDrawerSlideOpen = false;

      pallets.slice().forEach((p) => removePallet3D(p));
      player.position.set(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z);
      player.yaw = PLAYER_SPAWN.yaw;
      player.pitch = 0;
      syncCameraToPlayer();
      player.hitchedPallet = null;
      player.hasElectricJack = false;
      if (hitchStatusCard) hitchStatusCard.style.display = 'none';

      jackBattery = 100;
      jackLowBatteryWarned = false;
      jackDockedAtCharger = true;
      electricJackViewmodel.visible = false;
      if (electricJackActiveFloor) {
        electricJackActiveFloor.visible = false;
        if (typeof electricJackActiveFloor.setLifted === 'function') electricJackActiveFloor.setLifted(false);
      }
      if (typeof electricJackWorld.setOperatingMode === 'function') electricJackWorld.setOperatingMode(false);
      if (typeof electricJackWorld.setLifted === 'function') electricJackWorld.setLifted(false);
      electricJackWorld.position.set(JACK_HOME_POS.x, 0, JACK_HOME_POS.z);
      electricJackWorld.rotation.y = JACK_HOME_POS.yaw;
      electricJackWorld.visible = true;
      syncElectricJackBatteryVisuals(undefined, true);

      if (window.WarehouseTrucks) {
        window.WarehouseTrucks.resetForShift({ tutorialScript: tutScript });
        DELIVERY_MANIFEST.length = 0;
        DELIVERY_MANIFEST.push(...window.WarehouseTrucks.getNonWarehouseQueue());
      }
      if (window.DSDReceipts) {
        window.DSDReceipts.init({ preserveNone: false, tutorialScript: tutScript });
      }
      if (window.BackstockRacks) {
        window.BackstockRacks.resetForShift({ tutorialScript: tutScript });
      }
      if (window.ClaimsTotes) {
        window.ClaimsTotes.resetForShift({ tutorialScript: tutScript });
      }
      syncDoorMeshesImmediate();
      updateStagedCounter();
      renderPendingDeliveriesPanel();
      syncCrtMonitorDisplay();
    }

    function exportWorldState() {
      return {
        player: {
          x: Number(player.position.x) || 0,
          y: Number(player.position.y) || 1.65,
          z: Number(player.position.z) || 0,
          yaw: Number(player.yaw) || 0,
          pitch: Number(player.pitch) || 0,
          hasElectricJack: Boolean(player.hasElectricJack),
          hitchedPalletId: (player.hitchedPallet && player.hitchedPallet.data) ? (player.hitchedPallet.data.id || null) : null
        },
        electricJack: {
          x: Number(electricJackWorld.position.x) || JACK_HOME_POS.x,
          y: Number(electricJackWorld.position.y) || 0,
          z: Number(electricJackWorld.position.z) || JACK_HOME_POS.z,
          yaw: Number(electricJackWorld.rotation.y) || JACK_HOME_POS.yaw,
          battery: Number(jackBattery),
          dockedAtCharger: Boolean(jackDockedAtCharger)
        },
        sideRollupDoor: {
          isOpen: Boolean(sideRollupDoor.isOpen),
          currentProgress: Number(sideRollupDoor.currentProgress) || 0,
          timeOpen: Number(sideRollupDoor.timeOpen) || 0
        },
        dockDoors: dockDoors.map((dd) => ({
          id: dd.id,
          isOpen: Boolean(dd.isOpen),
          currentProgress: Number(dd.currentProgress) || 0,
          timeOpen: Number(dd.timeOpen) || 0,
          hasTrailer: Boolean(dd.hasTrailer),
          trailerType: dd.trailerType || null,
          trailerDoorOpen: Boolean(dd.trailerDoorOpen),
          trailerDoorProgress: Number(dd.trailerDoorProgress) || 0
        })),
        drawerState: {
          pendingArchiveOpen: Boolean(drawerState.pendingArchiveOpen),
          pendingArchiveTimer: Number(drawerState.pendingArchiveTimer) || 0,
          topDrawerSlideOpen: Boolean(drawerState.topDrawerSlideOpen)
        },
        pallets: pallets.map((p) => ({
          data: (window.SaveSystem && typeof window.SaveSystem.cloneCleanData === 'function')
            ? window.SaveSystem.cloneCleanData(p.data || {}, ['mesh'])
            : JSON.parse(JSON.stringify(p.data || {}, (k, v) => (k === 'mesh' ? undefined : v))),
          x: Number(p.position.x) || 0,
          y: Number(p.position.y) || 0,
          z: Number(p.position.z) || 0,
          rotationY: p.mesh ? (Number(p.mesh.rotation.y) || 0) : 0
        }))
      };
    }

    function importWorldState(data) {
      if (!data || typeof data !== 'object') return false;
      campaignStarted = true;
      DeliverySystem.cancelPendingArrivals();

      if (uiState.scannerModalOpen) closeScanner();
      if (uiState.overageDeliveryId && typeof exitOverageFlagMode === 'function') exitOverageFlagMode(true);
      if (uiState.bolModalOpen) closeWarehouseBol();
      if (uiState.invoiceModalOpen) closeInvoice();
      if (uiState.terminalModalOpen) closeTerminal();
      if (uiState.doorQueueModalOpen) closeDoorQueueModal(true);
      if (window.DSDMessages && typeof window.DSDMessages.clearSession === 'function') {
        window.DSDMessages.clearSession();
      }
      if (typeof togglePendingDeliveriesPanel === 'function') {
        togglePendingDeliveriesPanel(true);
      }

      player.hitchedPallet = null;
      if (hitchStatusCard) hitchStatusCard.style.display = 'none';
      pallets.slice().forEach((p) => removePallet3D(p));

      const savedDoors = Array.isArray(data.dockDoors) ? data.dockDoors : [];
      dockDoors.forEach((dd) => {
        const sd = savedDoors.find((item) => item && item.id === dd.id);
        if (sd) {
          dd.isOpen = Boolean(sd.isOpen);
          dd.currentProgress = Number(sd.currentProgress) || 0;
          dd.timeOpen = Number(sd.timeOpen) || 0;
          dd.hasTrailer = Boolean(sd.hasTrailer);
          dd.trailerType = sd.trailerType || null;
          dd.trailerDoorOpen = Boolean(sd.trailerDoorOpen);
          dd.trailerDoorProgress = Number(sd.trailerDoorProgress) || 0;
        }
      });

      if (data.sideRollupDoor && typeof data.sideRollupDoor === 'object') {
        sideRollupDoor.isOpen = Boolean(data.sideRollupDoor.isOpen);
        sideRollupDoor.currentProgress = Number(data.sideRollupDoor.currentProgress) || 0;
        sideRollupDoor.timeOpen = Number(data.sideRollupDoor.timeOpen) || 0;
      }

      if (data.drawerState && typeof data.drawerState === 'object') {
        drawerState.pendingArchiveOpen = Boolean(data.drawerState.pendingArchiveOpen);
        drawerState.pendingArchiveTimer = Number(data.drawerState.pendingArchiveTimer) || 0;
        drawerState.topDrawerSlideOpen = Boolean(data.drawerState.topDrawerSlideOpen);
      }

      const savedPallets = Array.isArray(data.pallets) ? data.pallets : [];
      savedPallets.forEach((sp) => {
        if (!sp || !sp.data) return;
        const spec = (window.SaveSystem && typeof window.SaveSystem.cloneCleanData === 'function')
          ? window.SaveSystem.cloneCleanData(sp.data)
          : JSON.parse(JSON.stringify(sp.data));
        const created = createPallet3D(spec);
        if (created) {
          created.position.set(Number(sp.x) || 0, Number(sp.y) || 0, Number(sp.z) || 0);
          if (created.mesh) {
            created.mesh.position.copy(created.position);
            created.mesh.rotation.y = Number(sp.rotationY) || 0;
          }
          created.data.status = spec.status || created.data.status;
        }
      });

      const pl = data.player || {};
      player.position.set(
        Number.isFinite(Number(pl.x)) ? Number(pl.x) : 0,
        Number.isFinite(Number(pl.y)) ? Number(pl.y) : 1.65,
        Number.isFinite(Number(pl.z)) ? Number(pl.z) : (ORIGIN_Z + 13 * TILE_SIZE)
      );
      player.yaw = Number(pl.yaw) || 0;
      player.pitch = Number(pl.pitch) || 0;
      player.hasElectricJack = Boolean(pl.hasElectricJack);
      clampPitch();

      const ej = data.electricJack || {};
      jackBattery = Number.isFinite(Number(ej.battery)) ? Number(ej.battery) : 100;
      jackLowBatteryWarned = jackBattery <= 25;
      jackDockedAtCharger = ej.dockedAtCharger !== undefined ? Boolean(ej.dockedAtCharger) : true;
      electricJackWorld.position.set(
        Number.isFinite(Number(ej.x)) ? Number(ej.x) : JACK_HOME_POS.x,
        Number.isFinite(Number(ej.y)) ? Number(ej.y) : 0,
        Number.isFinite(Number(ej.z)) ? Number(ej.z) : JACK_HOME_POS.z
      );
      electricJackWorld.rotation.y = Number.isFinite(Number(ej.yaw)) ? Number(ej.yaw) : JACK_HOME_POS.yaw;
      electricJackWorld.visible = !player.hasElectricJack;
      if (typeof electricJackWorld.setOperatingMode === 'function') electricJackWorld.setOperatingMode(false);
      if (typeof electricJackWorld.setLifted === 'function') electricJackWorld.setLifted(false);
      electricJackViewmodel.visible = player.hasElectricJack;

      if (player.hasElectricJack && pl.hitchedPalletId) {
        const hitched = pallets.find((p) => p && p.data && p.data.id === pl.hitchedPalletId);
        if (hitched) {
          player.hitchedPallet = hitched;
          hitched.isHitched = true;
          if (hitchStatusCard && typeof hitchPalletName !== 'undefined' && hitchPalletName) {
            hitchPalletName.textContent = hitched.data.po || hitched.data.name || 'Pallet';
            hitchStatusCard.style.display = 'flex';
          }
        }
      }

      syncActiveFloorJack();
      positionHitchedPallet();
      camera.position.copy(player.position);
      camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
      syncElectricJackBatteryVisuals(undefined, true);
      syncDoorMeshesImmediate();
      return true;
    }

    if (window.DSDGame) {
      window.DSDGame.init({
        showAlert: showAlert,
        showNotification: showNotification,
        playDoorAlarm: () => SoundSystem.playDoorWarningAlarm(),
        playSuccessChime: () => SoundSystem.playSuccessChime(),
        playButtonClick: () => SoundSystem.playButtonClick(),
        onHudUpdate: renderDoorLightsPanel,
        onNewGame: () => {
          if (campaignStarted) {
            resetAllForFreshCampaign();
          }
          campaignStarted = true;
          DeliverySystem.startShiftArrivals(1200);
          if (window.SaveSystem && typeof window.SaveSystem.triggerAutosave === 'function') {
            setTimeout(() => window.SaveSystem.triggerAutosave('new_game'), 1600);
          }
        },
        onTutorialStart: (tutOpts) => {
          campaignStarted = true;
          resetAllForFreshCampaign(tutOpts || { tutorialMode: true });
          DeliverySystem.startShiftArrivals(400);
        },
        onMenuStateChange: (menuFlags) => {
          if (menuFlags && menuFlags.shiftSummaryOpen) {
            if (uiState.scannerModalOpen) closeScanner(true);
            if (uiState.overageDeliveryId && typeof exitOverageFlagMode === 'function') exitOverageFlagMode(true);
            if (uiState.bolModalOpen) closeWarehouseBol();
            if (uiState.invoiceModalOpen) closeInvoice();
            if (uiState.terminalModalOpen) closeTerminal(true);
            if (uiState.doorQueueModalOpen) closeDoorQueueModal(true);
            closePopupModal();
            if (window.DSDReceipts) {
              if (typeof window.DSDReceipts.closeNightDropPanel === 'function') window.DSDReceipts.closeNightDropPanel(true);
              if (typeof window.DSDReceipts.closeFilingOverlay === 'function') window.DSDReceipts.closeFilingOverlay();
              if (typeof window.DSDReceipts.closeInvoiceArchive === 'function') window.DSDReceipts.closeInvoiceArchive();
              if (typeof window.DSDReceipts.closeTrashCanDialog === 'function') window.DSDReceipts.closeTrashCanDialog(true);
              if (typeof window.DSDReceipts.closeHandReceiptDialog === 'function') window.DSDReceipts.closeHandReceiptDialog(true);
            }
          }
          const anyOverlay = Boolean(menuFlags && (menuFlags.mainMenuOpen || menuFlags.systemMenuOpen || menuFlags.saveLoadModalOpen || menuFlags.infoModalOpen || menuFlags.shiftSummaryOpen));
          container.classList.toggle('main-menu-open', Boolean(menuFlags && menuFlags.mainMenuOpen));
          container.classList.toggle('system-menu-open', Boolean(menuFlags && (menuFlags.systemMenuOpen || menuFlags.saveLoadModalOpen || menuFlags.infoModalOpen)));
          if (anyOverlay) {
            ctrlPointerHold.reset();
            if (document.exitPointerLock) {
              try { document.exitPointerLock(); } catch (_) { }
            }
          }
          updateLockHintDisplay();
          if (window.DSDMenuUI && typeof window.DSDMenuUI.syncOverlaysFromGame === 'function') {
            window.DSDMenuUI.syncOverlaysFromGame();
          }
        },
        getUnfinishedWork: () => {
          const insideSessions = DeliverySystem.sessions.filter((s) => s.state !== 'LEAVING');
          const whSummary = (window.WarehouseTrucks && typeof window.WarehouseTrucks.getUnfinishedSummary === 'function')
            ? window.WarehouseTrucks.getUnfinishedSummary()
            : { outstandingWarehouse: 0 };
          const whSessionIds = new Set(insideSessions.filter((s) => s.delivery.type === 'warehouse').map((s) => s.delivery.id));
          return {
            outstandingSideDoor: insideSessions.filter((s) => s.delivery.type === 'sidedoor').length,
            outstandingTrucks: insideSessions.filter((s) => s.delivery.type === 'vendor_truck').length,
            outstandingWarehouse: Math.max(whSummary.outstandingWarehouse || 0, whSessionIds.size),
            unplacedSupplies: (window.BackstockRacks && typeof window.BackstockRacks.getUnplacedSupplyCasesCount === 'function')
              ? window.BackstockRacks.getUnplacedSupplyCasesCount()
              : 0,
            unclaimedItems: (window.ClaimsTotes && typeof window.ClaimsTotes.getRemainingClaimsCount === 'function')
              ? window.ClaimsTotes.getRemainingClaimsCount()
              : 0,
            pendingRecall: Boolean(window.ClaimsTotes && typeof window.ClaimsTotes.hasPendingRecall === 'function' && window.ClaimsTotes.hasPendingRecall()),
            pendingTasks: (window.DSDReceipts && typeof window.DSDReceipts.getPendingHomeOfficeTaskCount === 'function')
              ? window.DSDReceipts.getPendingHomeOfficeTaskCount()
              : 0
          };
        },
        onResetShift: () => {
          dockDoors.forEach((dd) => {
            dd.isOpen = false;
            dd.timeOpen = 0;
            dd.trailerDoorOpen = false;
            dd.trailerDoorProgress = 0;
          });
          sideRollupDoor.isOpen = false;
          sideRollupDoor.timeOpen = 0;
          drawerState.pendingArchiveOpen = false;
          drawerState.pendingArchiveTimer = 0;
          drawerState.topDrawerSlideOpen = false;
          player.position.set(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z);
          player.yaw = PLAYER_SPAWN.yaw;
          player.pitch = 0;
          syncCameraToPlayer();
          player.hitchedPallet = null;
          player.hasElectricJack = false;
          jackBattery = 100;
          jackDockedAtCharger = true;
          electricJackViewmodel.visible = false;
          if (electricJackActiveFloor) {
            electricJackActiveFloor.visible = false;
            if (typeof electricJackActiveFloor.setLifted === 'function') electricJackActiveFloor.setLifted(false);
          }
          if (typeof electricJackWorld.setOperatingMode === 'function') electricJackWorld.setOperatingMode(false);
          if (typeof electricJackWorld.setLifted === 'function') electricJackWorld.setLifted(false);
          electricJackWorld.position.set(JACK_HOME_POS.x, 0, JACK_HOME_POS.z);
          electricJackWorld.rotation.y = JACK_HOME_POS.yaw;
          electricJackWorld.visible = true;
          syncElectricJackBatteryVisuals(undefined, true);
          DeliverySystem.clearAllSessions();
          const nextShiftSupplyOrders = (window.DSDReceipts && typeof window.DSDReceipts.consumePendingSupplyOrdersForNextShift === 'function')
            ? window.DSDReceipts.consumePendingSupplyOrdersForNextShift()
            : [];
          if (window.WarehouseTrucks) {
            window.WarehouseTrucks.resetForShift({ supplyOrderItems: nextShiftSupplyOrders });
            DELIVERY_MANIFEST.length = 0;
            DELIVERY_MANIFEST.push(...window.WarehouseTrucks.getNonWarehouseQueue());
          }
          // Guarantee any remaining staged/in-transit pallets despawn from the backroom at end of shift
          pallets.slice().forEach((p) => removePallet3D(p));
          updateStagedCounter();
          if (window.DSDReceipts) {
            window.DSDReceipts.resetDailyReceipts();
          }
          const supplyUsageReport = (window.BackstockRacks && typeof window.BackstockRacks.advanceShift === 'function')
            ? window.BackstockRacks.advanceShift()
            : (window.BackstockRacks ? (window.BackstockRacks.resetForShift(), null) : null);
          if (window.ClaimsTotes && typeof window.ClaimsTotes.resetForShift === 'function') {
            window.ClaimsTotes.resetForShift();
          }
          renderPendingDeliveriesPanel();
          DeliverySystem.init();
          syncCrtMonitorDisplay();
          if (nextShiftSupplyOrders.length > 0) {
            const totalSupCases = nextShiftSupplyOrders.reduce((s, it) => s + Math.max(0, Number(it.cases || it.qty) || 0), 0);
            showNotification(`[[ico:truck]] Vendor #601 Dept 60 supply delivery (${totalSupCases} case${totalSupCases === 1 ? '' : 's'}) scheduled today!`, 'low');
          }
          if (supplyUsageReport && Array.isArray(supplyUsageReport.outOfStock) && supplyUsageReport.outOfStock.length > 0) {
            const missingNames = supplyUsageReport.outOfStock.slice(0, 3).map((s) => s.name).join(', ');
            const extraMore = supplyUsageReport.outOfStock.length > 3 ? ` +${supplyUsageReport.outOfStock.length - 3} more` : '';
            const pts = supplyUsageReport.outOfStock.length * 200;
            showAlert(`[[ico:claim]] SUPPLY OUT OF STOCK (-${pts} pts): ${missingNames}${extraMore}. Order Dept 60 on Scanner #2!`, 'critical');
          } else if (supplyUsageReport && Array.isArray(supplyUsageReport.nowEmptySkus) && supplyUsageReport.nowEmptySkus.length > 0) {
            const emptyNames = supplyUsageReport.nowEmptySkus.slice(0, 3).map((s) => s.name).join(', ');
            const extraMore = supplyUsageReport.nowEmptySkus.length > 3 ? ` +${supplyUsageReport.nowEmptySkus.length - 3} more` : '';
            showNotification(`[[ico:claim]] Dept 60 depleted today: ${emptyNames}${extraMore}. Order on Scanner #2 before next shift!`, 'high');
          }
        }
      });
    }

    if (window.DSDReceipts) {
      window.DSDReceipts.init({
        getActiveDelivery: () => DeliverySystem.activeDelivery,
        getActiveInvoiceTab: () => uiState.currentInvoiceTab,
        getDeliveryManifest: () => (window.WarehouseTrucks && typeof window.WarehouseTrucks.getScheduleRows === 'function')
          ? window.WarehouseTrucks.getScheduleRows()
          : DELIVERY_MANIFEST,
        getPalletManifest: () => pallets.map((p) => {
          const st = p.data.status;
          let statusText = st;
          let statusColor = '#94a3b8';
          if (st === 'AUDITED') {
            statusText = 'AUDITED (27 Cs OK)';
            statusColor = '#38bdf8';
          } else if (st === 'STAGED_CORRECT') {
            statusText = 'STAGED CORRECT';
            statusColor = '#22c55e';
          } else if (st === 'IN_TRANSIT') {
            statusColor = '#f59e0b';
          } else if (st === 'MISPLACED') {
            statusColor = '#ef4444';
          }
          return {
            dock: 'DOCK ' + p.data.truck,
            po: p.data.po,
            commodity: p.data.name,
            zone: p.data.targetZone,
            delivered: st === 'STAGED_CORRECT' || st === 'AUDITED',
            statusText: statusText,
            statusColor: statusColor
          };
        }),
        getTargetZoneLabel: (z) => z === 'F' ? 'Freezer [0°F Sub-Zero]' : (z === 'C' ? 'Cooler [36°F Chilled]' : 'Dock Floor [Ambient]'),
        isDeliveryCheckInReady: (d) => {
          if (!d) return false;
          const s = DeliverySystem.getSessionForDelivery(d.id);
          return Boolean(s && ['WAITING_CHECKIN', 'AWAITING_PLAYER_UNLOAD', 'WAREHOUSE_RETURNING_FOR_SIGN', 'VENDOR_WALK_TO_BAY', 'VENDOR_WAIT_DOOR_OPEN', 'VENDOR_GETTING_OWN_JACK', 'VENDOR_UNLOADING_DRIVE_IN', 'VENDOR_UNLOADING_DRIVE_OUT', 'VENDOR_RETURNING_JACK', 'VENDOR_RETURNING_TO_SIDE_DOOR', 'WAITING_SIGN'].includes(s.state));
        },
        getDeliveryStatusLabel: (d) => {
          if (d.refused) return 'REFUSED';
          if (d.completed) return d.type === 'warehouse' ? 'BOL SIGNED ✓' : 'SIGNED ✓';
          const s = DeliverySystem.getSessionForDelivery(d.id);
          if (s) {
            if (s.state === 'OUTSIDE_WAITING') return `${s.doorKey} AT SIDE DOOR`;
            if (s.state === 'WALKING_TO_EXIT' || s.state === 'WAITING_EXIT') return `${s.doorKey} WAIT EXIT`;
            if (d.type === 'warehouse') return `BAY ${d.dockBay} UNLOADING (${d.stagedCount || 0}/${d.totalPallets || 0})`;
            if (d.receiptCreated) return `${s.doorKey} READY TO SIGN`;
            return `${s.doorKey} CHECK-IN`;
          }
          if (d.type === 'warehouse' && (d.status === 'ARRIVED' || d.status === 'UNLOADING')) {
            return `BAY ${d.dockBay} UNLOADING (${d.stagedCount || 0}/${d.totalPallets || 0})`;
          }
          return d.queuedAtGate ? 'QUEUED' : 'SCHEDULED';
        },
        isScannerNearDelivery: () => isNearActiveDelivery(),
        isScannerFocusedOnDelivery: () => isScannerFocusedOnDelivery(),
        getHoveredBox: () => uiState.hoveredPhysicalBox,
        getHoveredLabelCase: () => {
          if (uiState.hoveredLabelCase) return uiState.hoveredLabelCase;
          const bc = uiState.hoveredBackstockCase;
          if (!bc || bc.placedOnRack || bc.labeled) return null;
          if (String(bc.deptNo || '') === '60' || String(bc.vendorNo || '') === '601' || bc.targetRackId === 'claims_steel') return null;
          return bc;
        },
        getHoveredInventoryCase: () => {
          if (uiState.hoveredInventoryCase) return uiState.hoveredInventoryCase;
          const bc = uiState.hoveredBackstockCase;
          return (bc && bc.placedOnRack) ? bc : null;
        },
        getHoveredSupplyCase: () => {
          if (uiState.hoveredSupplyCase) return uiState.hoveredSupplyCase;
          const bc = uiState.hoveredBackstockCase;
          if (bc && window.BackstockRacks && typeof window.BackstockRacks.isSupplyCase === 'function' && window.BackstockRacks.isSupplyCase(bc)) {
            return bc;
          }
          return null;
        },
        getHoveredClaimsItem: () => uiState.hoveredClaimsItem,
        focusDeliveryById: (id) => {
          if (id) DeliverySystem.focusDelivery(id);
        },
        onBarcodeScanned: triggerScanVisualFeedback,
        isPalletTarget: () => false,
        onDeliveryRefused: (d) => {
          DeliverySystem.handleDeliveryRefused(d);
        },
        onReceiptUpdated: (d, opts) => {
          syncDeliveryBoxesVisuals(d);
          if (opts && opts.switchInvoiceTab && d) {
            uiState.currentInvoiceTab = opts.switchInvoiceTab;
          }
          if (uiState.invoiceModalOpen && d) {
            renderInvoiceDocument(d, uiState.currentInvoiceTab || 'invoice');
          }
        },
        onReceiptPrinted: () => {
          if (typeof triggerPrinterPrint === 'function') triggerPrinterPrint();
          if (SoundSystem.playPrinterPrint) SoundSystem.playPrinterPrint();
          else if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          DeliverySystem.updateDeliveryHud();
        },
        onReceiptCollected: () => {
          if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          DeliverySystem.updateDeliveryHud();
        },
        onReceiptDiscarded: () => {
          if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          DeliverySystem.updateDeliveryHud();
        },
        onReceiptHanded: (res) => {
          if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          if (res && res.complete && SoundSystem.playSuccessChime) SoundSystem.playSuccessChime();
          DeliverySystem.updateDeliveryHud();
        },
        onFinalizeReceiving: () => handleFinalizeReceivingClick(),
        onCloseTerminal: () => closeTerminal(),
        onOpenTerminalScreen: (scr) => openTerminal(scr || 'menu'),
        onToggleTerminalScreen: (scr) => toggleTerminal(scr || 'create'),
        isTerminalOpen: () => Boolean(uiState.terminalModalOpen),
        onOpenScanner: (ctx) => openScanner(ctx),
        onToggleScanner: (ctx) => toggleScanner(ctx),
        onCloseScanner: () => closeScanner(),
        isScannerOpen: () => Boolean(uiState.scannerModalOpen),
        onDeskStateChanged: (info) => {
          if (!info) return;
          if (typeof invoicePaper !== 'undefined' && invoicePaper) {
            invoicePaper.visible = (info.nightDropCount + info.pinnedCount) > 0;
          }
          if (typeof syncPrinterTrayVisual === 'function') {
            syncPrinterTrayVisual(info.printerTrayCount || 0);
          }
          drawerState.topDrawerSlideOpen = Boolean(info.archiveOpen || drawerState.pendingArchiveOpen);
        },
        onPhase2ModalChange: () => {
          syncPhase2ContainerClasses();
        },
        playBeep: (kind) => (SoundSystem.playKeypadBeep
          ? SoundSystem.playKeypadBeep(kind || (uiState.terminalModalOpen ? 'terminal' : 'scanner'))
          : SoundSystem.playButtonClick()),
        playLabel: () => (SoundSystem.playLabelApply ? SoundSystem.playLabelApply() : SoundSystem.playSuccessChime()),
        playError: () => SoundSystem.playErrorBuzzer(),
        playSuccess: () => SoundSystem.playSuccessChime(),
        playPaper: () => SoundSystem.playPaperRustle(),
        showNotification: showNotification,
        showAlert: showAlert,
        showPopupModal: showPopupModal
      });
    }

    if (window.ShiftClock && typeof window.ShiftClock.on === 'function') {
      window.ShiftClock.on('onMinuteTick', (snap) => {
        DeliverySystem.tryStartNextScheduledVendor(snap);
        if (window.DSDReceipts && typeof window.DSDReceipts.updateTerminalClock === 'function') {
          window.DSDReceipts.updateTerminalClock(snap);
        }
        if (window.SaveSystem && snap && snap.minute % 5 === 0) {
          window.SaveSystem.triggerAutosave('minute_5');
        }
      });
    }
    renderPendingDeliveriesPanel();
    updateStagedCounter();

    if (window.SaveSystem && typeof window.SaveSystem.init === 'function') {
      window.SaveSystem.init({
        canAutosave: () => Boolean(
          campaignStarted &&
          window.DSDGame &&
          (!window.DSDGame.isMainMenuOpen || !window.DSDGame.isMainMenuOpen()) &&
          (!window.DSDGame.isShiftSummaryOpen || !window.DSDGame.isShiftSummaryOpen()) &&
          (!window.ShiftClock || !window.ShiftClock.isShiftOver())
        ),
        exportWorldState: exportWorldState,
        importWorldState: importWorldState,
        exportDeliveryState: () => DeliverySystem.exportState(),
        importDeliveryState: (dState) => DeliverySystem.importState(dState),
        relinkPallets: () => {
          if (window.WarehouseTrucks && typeof window.WarehouseTrucks.relinkSpawnedPallets === 'function') {
            window.WarehouseTrucks.relinkSpawnedPallets(pallets);
          }
        },
        onAfterLoad: () => {
          campaignStarted = true;
          updateStagedCounter();
          renderPendingDeliveriesPanel();
          syncCrtMonitorDisplay();
          updateLockHintDisplay();
          showNotification('[[ico:folder]] Shift progress loaded!', 3200);
        }
      });
    }

    if (window.DSDMenuUI && typeof window.DSDMenuUI.init === 'function') {
      window.DSDMenuUI.init();
    }

    function readStationPos(pred, fallback) {
      const item = interactibles.find(pred);
      if (!item) return fallback;
      const center = typeof item.boxCenter === 'object' && item.boxCenter
        ? item.boxCenter
        : (item.mesh && item.mesh.position ? item.mesh.position : null);
      if (!center) return fallback;
      return {
        x: Number(center.x) || fallback.x,
        y: Number(center.y) || fallback.y,
        z: Number(center.z) || fallback.z
      };
    }

    function closeAllGameplayModals(silent) {
      try { if (uiState.scannerModalOpen) closeScanner(true); } catch (_) { }
      try { if (uiState.overageDeliveryId && typeof exitOverageFlagMode === 'function') exitOverageFlagMode(true); } catch (_) { }
      try { if (uiState.bolModalOpen) closeWarehouseBol(); } catch (_) { }
      try { if (uiState.invoiceModalOpen) closeInvoice(); } catch (_) { }
      try { if (uiState.terminalModalOpen) closeTerminal(true); } catch (_) { }
      try { if (uiState.doorQueueModalOpen) closeDoorQueueModal(true); } catch (_) { }
      try { closePopupModal(); } catch (_) { }
      if (window.DSDReceipts) {
        try { if (typeof window.DSDReceipts.closeNightDropPanel === 'function') window.DSDReceipts.closeNightDropPanel(true); } catch (_) { }
        try { if (typeof window.DSDReceipts.closeFilingOverlay === 'function') window.DSDReceipts.closeFilingOverlay(); } catch (_) { }
        try { if (typeof window.DSDReceipts.closeInvoiceArchive === 'function') window.DSDReceipts.closeInvoiceArchive(); } catch (_) { }
        try { if (typeof window.DSDReceipts.closeTrashCanDialog === 'function') window.DSDReceipts.closeTrashCanDialog(true); } catch (_) { }
        try { if (typeof window.DSDReceipts.closeHandReceiptDialog === 'function') window.DSDReceipts.closeHandReceiptDialog(true); } catch (_) { }
      }
      if (!silent) {
        try { updateLockHintDisplay(); } catch (_) { }
      }
    }

    function getTutorialStationsSnapshot() {
      const fZone = global.WarehouseWorld.gridToWorld(1.5, 19.5);
      const cZone = global.WarehouseWorld.gridToWorld(6.5, 19.5);
      const dZone = global.WarehouseWorld.gridToWorld(4.5, 13.5);
      const d1 = dockDoors && dockDoors[0] ? dockDoors[0] : { worldX: -9.6, worldZ: -2.4 };
      const d2 = dockDoors && dockDoors[1] ? dockDoors[1] : { worldX: -3.6, worldZ: -2.4 };
      const claimsRack = Array.isArray(steelRacks) ? steelRacks.find((r) => r && r.id === 'claims_steel') : null;
      const dryRack = Array.isArray(steelRacks) ? steelRacks.find((r) => r && r.id === 'dry_steel') : null;
      const coolerRack = Array.isArray(steelRacks) ? steelRacks.find((r) => r && r.id === 'cooler_steel') : null;
      const freezerRack = Array.isArray(steelRacks) ? steelRacks.find((r) => r && r.id === 'freezer_steel') : null;

      return {
        dockButton1: readStationPos((it) => it && it.type === 'dock_button' && (!it.door || it.door.id === 1), { x: d1.worldX - 1.5, y: 1.25, z: doorZ + 0.15 }),
        dockDoor1: { x: Number(d1.worldX) || -9.6, y: 1.0, z: Number(d1.worldZ) || doorZ },
        dockButton2: readStationPos((it) => it && it.type === 'dock_button' && it.door && it.door.id === 2, { x: d2.worldX - 1.5, y: 1.25, z: doorZ + 0.15 }),
        dockDoor2: { x: Number(d2.worldX) || -3.6, y: 1.0, z: Number(d2.worldZ) || doorZ },
        sideDoorButton: readStationPos((it) => it && it.type === 'side_door_button', { x: Number(sideRollupDoor.worldX) || 13.0, y: 1.25, z: Number(sideRollupDoor.worldZ) - 1.5 }),
        sideDoor: { x: Number(sideRollupDoor.worldX) || 13.0, y: 1.0, z: Number(sideRollupDoor.worldZ) || 8.4 },
        jackCharger: { x: JACK_HOME_POS.x, y: 0.9, z: JACK_HOME_POS.z },
        freezerZone: { x: fZone.x, y: 0.4, z: fZone.z },
        coolerZone: { x: cZone.x, y: 0.4, z: cZone.z },
        dryZone: { x: dZone.x, y: 0.4, z: dZone.z },
        terminal: readStationPos((it) => it && it.type === 'terminal', { x: 12.2, y: 1.35, z: 5.0 }),
        nightDropTray: readStationPos((it) => it && it.type === 'desk_papers', { x: 12.2, y: 1.15, z: 4.3 }),
        fileCabinet: readStationPos((it) => it && it.type === 'file_cabinet', { x: 11.9, y: 0.72, z: 4.3 }),
        filingFolder: readStationPos((it) => it && it.type === 'filing_folder', { x: 12.2, y: 1.15, z: 5.7 }),
        printer: readStationPos((it) => it && it.type === 'printer', { x: 12.3, y: 1.25, z: 4.3 }),
        claimsSteel: claimsRack && claimsRack.spanEdges
          ? { x: (claimsRack.spanEdges[0] + claimsRack.spanEdges[claimsRack.spanEdges.length - 1]) * 0.5, y: 1.1, z: Number(claimsRack.aisleEdge || 13.0) - 0.6 }
          : { x: 7.2, y: 1.1, z: 12.2 },
        drySteel: dryRack && dryRack.spanEdges
          ? { x: (dryRack.spanEdges[0] + dryRack.spanEdges[dryRack.spanEdges.length - 1]) * 0.5, y: 1.1, z: Number(dryRack.aisleEdge || 13.0) - 0.6 }
          : { x: -2.4, y: 1.1, z: 12.2 },
        coolerSteel: coolerRack && coolerRack.spanEdges
          ? { x: Number(coolerRack.aisleEdge || 7.2) - 0.6, y: 1.1, z: (coolerRack.spanEdges[0] + coolerRack.spanEdges[coolerRack.spanEdges.length - 1]) * 0.5 }
          : { x: 6.4, y: 1.1, z: 22.8 },
        freezerSteel: freezerRack && freezerRack.spanEdges
          ? { x: Number(freezerRack.aisleEdge || -12.0) + 0.6, y: 1.1, z: (freezerRack.spanEdges[0] + freezerRack.spanEdges[freezerRack.spanEdges.length - 1]) * 0.5 }
          : { x: -11.2, y: 1.1, z: 22.8 },
        recallCart: (typeof recallCart !== 'undefined' && recallCart)
          ? { x: Number(recallCart.x) || 9.0, y: 0.9, z: Number(recallCart.z) || 14.0 }
          : { x: 9.0, y: 0.9, z: 14.0 },
        timeclock: readStationPos((it) => it && it.type === 'timeclock', { x: -8.0, y: 1.4, z: 33.5 })
      };
    }

    const _fwdTmp = new THREE.Vector3();

    global.DSDRuntime = {
      closeAllGameplayModals: closeAllGameplayModals,
      resetTutorialChapterState: function (opts) {
        const o = opts || {};
        closeAllGameplayModals(true);
        campaignStarted = true;
        resetAllForFreshCampaign({
          tutorialMode: true,
          tutorialScript: o.tutorialScript !== undefined ? o.tutorialScript : null
        });
        if (window.ShiftClock && o.time && typeof window.ShiftClock.setTutorialTime === 'function') {
          window.ShiftClock.setTutorialTime(o.time.hour || 6, o.time.minute || 0, { silent: true });
        }
        if (Array.isArray(o.arriveDeliveryIds) && DeliverySystem && typeof DeliverySystem.forceArriveDelivery === 'function') {
          o.arriveDeliveryIds.forEach((delId) => DeliverySystem.forceArriveDelivery(delId));
        }
        if (window.DSDGame && typeof window.DSDGame.updateHud === 'function') {
          window.DSDGame.updateHud(true);
        }
        renderPendingDeliveriesPanel();
        syncCrtMonitorDisplay();
      },
      forceArriveDelivery: function (id) {
        return DeliverySystem && typeof DeliverySystem.forceArriveDelivery === 'function'
          ? DeliverySystem.forceArriveDelivery(id)
          : false;
      },
      getDirectionalGuidance: function (target) {
        if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.z))) {
          return null;
        }
        const tx = Number(target.x);
        const tz = Number(target.z);
        const dx = tx - player.position.x;
        const dz = tz - player.position.z;
        const distanceM = Math.hypot(dx, dz);
        let fx = -Math.sin(player.yaw);
        let fz = -Math.cos(player.yaw);
        if (camera && typeof camera.getWorldDirection === 'function') {
          camera.getWorldDirection(_fwdTmp);
          const fLen = Math.hypot(_fwdTmp.x, _fwdTmp.z);
          if (fLen > 1e-4) {
            fx = _fwdTmp.x / fLen;
            fz = _fwdTmp.z / fLen;
          }
        }
        const tLen = Math.max(1e-4, Math.hypot(dx, dz));
        const ux = dx / tLen;
        const uz = dz / tLen;
        const dot = Math.max(-1, Math.min(1, fx * ux + fz * uz));
        const crossY = fx * uz - fz * ux; // positive when target is to the right in (X-right, Z-back) view space
        const absAngleDeg = Math.round((Math.acos(dot) * 180) / Math.PI);
        const side = absAngleDeg <= 34 ? 'ahead' : (crossY > 0 ? 'right' : 'left');
        return {
          distanceM: distanceM,
          angleDeg: absAngleDeg,
          side: side,
          inFront: side === 'ahead'
        };
      },
      getTutorialSnapshot: function () {
        return {
          player: {
            x: Number(player.position.x) || 0,
            y: Number(player.position.y) || 1.65,
            z: Number(player.position.z) || 0,
            yaw: Number(player.yaw) || 0,
            pitch: Number(player.pitch) || 0,
            hasElectricJack: Boolean(player.hasElectricJack),
            hitchedPalletId: (player.hitchedPallet && player.hitchedPallet.data) ? player.hitchedPallet.data.id : null,
            scannerActive: Boolean(player.scannerActive)
          },
          modals: {
            scannerOpen: Boolean(uiState.scannerModalOpen),
            invoiceOpen: Boolean(uiState.invoiceModalOpen),
            bolOpen: Boolean(uiState.bolModalOpen),
            terminalOpen: Boolean(uiState.terminalModalOpen),
            doorQueueOpen: Boolean(uiState.doorQueueModalOpen),
            overageFlagMode: Boolean(uiState.overageDeliveryId)
          },
          doors: (dockDoors || []).map((dd) => ({
            id: dd.id,
            isOpen: Boolean(dd.isOpen),
            hasTrailer: Boolean(dd.hasTrailer),
            trailerType: dd.trailerType || null,
            currentProgress: Number(dd.currentProgress) || 0
          })),
          sideDoor: {
            isOpen: Boolean(sideRollupDoor.isOpen),
            currentProgress: Number(sideRollupDoor.currentProgress) || 0
          },
          jack: {
            dockedAtCharger: Boolean(jackDockedAtCharger),
            hasElectricJack: Boolean(player.hasElectricJack),
            battery: Number(jackBattery) || 0,
            x: Number(electricJackWorld.position.x) || JACK_HOME_POS.x,
            z: Number(electricJackWorld.position.z) || JACK_HOME_POS.z
          },
          pallets: (pallets || []).map((p) => ({
            id: p && p.data ? p.data.id : null,
            deliveryId: p && p.data ? p.data.deliveryId : null,
            targetZone: p && p.data ? p.data.targetZone : null,
            status: p && p.data ? p.data.status : null,
            isWarehousePallet: Boolean(p && p.data && p.data.isWarehousePallet),
            isHitched: Boolean(p && p.isHitched),
            x: p && p.position ? Number(p.position.x) || 0 : 0,
            z: p && p.position ? Number(p.position.z) || 0 : 0
          })),
          sessions: (DeliverySystem && Array.isArray(DeliverySystem.sessions))
            ? DeliverySystem.sessions.map((s) => ({
              deliveryId: s.delivery ? s.delivery.id : null,
              type: s.delivery ? s.delivery.type : null,
              state: s.state,
              doorKey: s.doorKey,
              driverPos: s.driver && s.driver.mesh ? { x: Number(s.driver.mesh.position.x) || 0, y: 1.1, z: Number(s.driver.mesh.position.z) || 0 } : null,
              cartPos: s.cart && s.cart.mesh ? { x: Number(s.cart.mesh.position.x) || 0, y: 0.7, z: Number(s.cart.mesh.position.z) || 0 } : null,
              creditTotePos: s.creditTote && s.creditTote.mesh ? { x: Number(s.creditTote.mesh.position.x) || 0, y: 0.4, z: Number(s.creditTote.mesh.position.z) || 0 } : null
            }))
            : [],
          stations: getTutorialStationsSnapshot()
        };
      }
    };
    container.classList.toggle('main-menu-open', Boolean(window.DSDGame && window.DSDGame.isMainMenuOpen && window.DSDGame.isMainMenuOpen()));
    syncCrtMonitorDisplay();

    // Pre-compile static Three.js shaders up front so rotating 360 degrees does not stutter on lazy GLSL compilation
    try {
      if (renderer && typeof renderer.compile === 'function') {
        renderer.compile(scene, camera);
      }
    } catch (_) { }

    requestAnimationFrame((now) => {
      lastTime = now;
      animate(now);
    });

    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
  }

  window.run = async function (mode) {
    if (window.DSDCatalog && typeof window.DSDCatalog.load === 'function') {
      await window.DSDCatalog.load();
    }
    if (window.DSDReceipts && typeof window.DSDReceipts.loadArchiveHistory === 'function') {
      await window.DSDReceipts.loadArchiveHistory();
    }
    init3DGame(mode);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.run('play');
    });
  } else {
    window.run('play');
  }

})(window);
