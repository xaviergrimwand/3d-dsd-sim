(function (global) {
  'use strict';

  let initialized = false;

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
    const promptDoor = document.getElementById('prompt-door');
    const promptSideDoor = document.getElementById('prompt-side-door');
    const promptPallet = document.getElementById('prompt-pallet');
    const promptTerminal = document.getElementById('prompt-terminal');
    const promptDesk = document.getElementById('prompt-desk');
    const promptDriver = document.getElementById('prompt-driver');
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

    // --- PLAYER STATE & CONTROLS ---
    const player = {
      position: new THREE.Vector3(0, 1.65, ORIGIN_Z + 13 * TILE_SIZE),
      yaw: 0,
      pitch: 0,
      radius: 0.45,
      speed: 4.8,
      hitchedPallet: null,
      hasElectricJack: false,
      scannerActive: false
    };

    let jackBattery = 100;
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

    const mouseSens = 0.0022;

    function updatePointerNDC(clientX, clientY) {
      pointerNDC.x = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerNDC.y = -(clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    }

    function getAimNDC() {
      return (isPointerLocked || usingTouchAim) ? CENTER_AIM_NDC : pointerNDC;
    }

    function positionBoxHoverPill(pillEl, aimNDC, rightMargin) {
      const margin = rightMargin || 250;
      const pxScreen = ((aimNDC.x + 1) * 0.5) * window.innerWidth;
      const pyScreen = ((1 - aimNDC.y) * 0.5) * window.innerHeight;
      pillEl.style.display = 'block';
      pillEl.style.left = Math.min(window.innerWidth - margin, Math.max(10, pxScreen + 14)) + 'px';
      pillEl.style.top = Math.max(46, pyScreen - 34) + 'px';
    }

    function updateLockHintDisplay() {
      if (isPointerLocked) {
        lockHint.classList.add('locked');
        lockHint.textContent = uiState.overageDeliveryId
          ? 'Overage Flag Mode: Click case to flag · Esc to unlock/return'
          : 'Cursor Locked (Esc to unlock)';
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
      return Boolean(uiState.terminalModalOpen || uiState.doorQueueModalOpen || uiState.bolModalOpen || isPhase2ModalOpen() || (window.DSDGame && window.DSDGame.isModalOpen()));
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
            showNotification('📥 Set Recall Tote back on bottom shelf of Recall Cart.');
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
            showNotification('⚠️ Finish collecting all recalled units off the top shelf into the tote first!', 3400);
            return true;
          }
          if (dropRes && dropRes.ok) {
            if (!dropRes.isCorrect) {
              SoundSystem.playErrorBuzzer();
              const ptsTxt = dropRes.penaltyPoints ? ` (-${dropRes.penaltyPoints} pts)` : '';
              showNotification(`⚠️ Wrong container! "${dropRes.productName}" goes in ${dropRes.correctLabel}.${ptsTxt}`, 3800);
            } else {
              SoundSystem.playSuccessChime();
              showNotification(`✓ Disposed "${dropRes.productName}" into ${dropRes.placedLabel}! Enter your counted total on Computer Terminal [4].`, 4200);
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
                showNotification(`⚠️ Wrong receptacle! ${dropRes.item.name} belongs in ${dropRes.correctLabel}.${ptsTxt}`, 3600);
              } else if (dropRes.placedIn === 'vendor_credit') {
                SoundSystem.playSuccessChime();
                showNotification(`🔴 Placed ${dropRes.item.name} in RED CREDIT TOTE for next vendor delivery (Credit: $${dropRes.displayCredit.toFixed(2)}).`, 3600);
              } else if (dropRes.placedIn === 'donate') {
                SoundSystem.playSuccessChime();
                showNotification(`🎁 Donated ${dropRes.item.name} cleanly.`, 2800);
              } else if (dropRes.placedIn === 'organics') {
                SoundSystem.playSuccessChime();
                showNotification(`♻️ Placed ${dropRes.item.name} in ORGANICS barrel.`, 2800);
              } else if (dropRes.placedIn === 'hazwaste') {
                SoundSystem.playSuccessChime();
                showNotification(`☢️ Stored ${dropRes.item.name} safely in HAZWASTE drum.`, 2800);
              } else {
                SoundSystem.playDropSound();
                showNotification(`🗑️ Discarded ${dropRes.item.name} in TRASH barrel.`, 2800);
              }
              if (dropRes.allDone) {
                setTimeout(() => {
                  SoundSystem.playSuccessChime();
                  showNotification('🏆 All Claims processed! (+400 pts)');
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
          showAlert('⚠️ Park the Electric Pallet Jack [Space] before handling recalled items!');
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
          showAlert('⚠️ Park the Electric Pallet Jack [Space] before taking the Recall Tote!');
          return true;
        }
        const pickedTote = window.ClaimsTotes.pickupRecallTote();
        if (pickedTote && pickedTote.ok) {
          SoundSystem.playButtonClick();
          showNotification(`🧺 Carrying Recall Tote — Collect all "${pickedTote.productName}" off the top shelf, then take to ${pickedTote.correctBinLabel}.`, 3800);
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
            showAlert('⚠️ Park the Electric Pallet Jack [Space] before picking up claims items!');
            return true;
          }
          if (!itemRec.scannerConfirmed) {
            SoundSystem.playErrorBuzzer();
            showNotification('📱 Open Hand Scanner [F] to Markdown Claims (#4) & confirm disposition before taking item!', 3400);
            return true;
          }
          const picked = window.ClaimsTotes.pickupItem(itemRec);
          if (picked && picked.ok) {
            SoundSystem.playButtonClick();
            const destLabel = window.ClaimsTotes.getReceptacleLabel(itemRec.confirmedDisposition);
            showNotification(`🖐️ Carrying ${itemRec.name} — Place in ${destLabel}.`);
          }
          return true;
        }
      }

      if (toteHits.length === 0) return false;

      const tote = toteHits[0].object && toteHits[0].object.userData ? toteHits[0].object.userData.claimsToteRef : null;
      if (!tote) return false;

      if (tote.isRed) {
        SoundSystem.playErrorBuzzer();
        showNotification('🔴 Credit Tote stays upright on the shelf — it receives eligible vendor returns.', 2800);
        return true;
      }

      const res = window.ClaimsTotes.toggleToteOpen(tote);
      if (!res || !res.ok) {
        SoundSystem.playErrorBuzzer();
        return true;
      }

      const summary = window.ClaimsTotes.getGrayToteSummary(tote);
      const count = summary ? summary.itemCount : 0;
      if (res.isOpen) {
        SoundSystem.playButtonClick();
        showNotification(`🧺 Tipped ${tote.label} claims tote forward (${count} item${count === 1 ? '' : 's'}) — Hover for condition, [F] to scan.`);
      } else {
        SoundSystem.playDropSound();
        showNotification(`📥 Returned ${tote.label} claims tote upright onto shelf.`);
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
            showAlert(`⚠️ ${preview.reason || 'Cannot place case here!'}`);
            return true;
          }
          const res = window.BackstockRacks.placeHeldCaseAtPreview(preview);
          if (res) {
            SoundSystem.playDropSound();
            if (preview.type === 'pallet' && preview.pallet) {
              showNotification(`📦 Set ${res.caseRec.name} back on ${preview.pallet.label}`);
            } else if (preview.slot) {
              const rackLabel = window.BackstockRacks.getRackDisplayName(preview.slot.rackId);
              const binLoc = window.BackstockRacks.formatSlotDesignation(preview.slot);
              if (res.linkedCount && res.linkedCount > 1) {
                showNotification(`🔗 Linked ${res.caseRec.name} (×${res.linkedCount} · ${res.linkedRowQty}u) on ${rackLabel} (${binLoc})`);
              } else {
                showNotification(`📦 Placed ${res.caseRec.name} on ${rackLabel} (${binLoc})`);
              }
              if (
                preview.slot.rackId === 'claims_steel' &&
                typeof window.BackstockRacks.isSupplyCase === 'function' &&
                window.BackstockRacks.isSupplyCase(res.caseRec) &&
                typeof window.BackstockRacks.getUnplacedSupplyCasesCount === 'function' &&
                window.BackstockRacks.getUnplacedSupplyCasesCount() === 0
              ) {
                if (window.ShiftStats) window.ShiftStats.setFlag('suppliesCompleted', true);
                showNotification('✓ All Dept 60 supplies stocked on Claims Steel!');
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
        showAlert('⚠️ Park the Electric Pallet Jack [Space] before picking up cases!');
        return true;
      }

      if (typeof window.BackstockRacks.canPickupCase === 'function') {
        const pickCheck = window.BackstockRacks.canPickupCase(caseRec);
        if (pickCheck && !pickCheck.ok) {
          SoundSystem.playErrorBuzzer();
          showAlert(`⚠️ ${pickCheck.reason || 'Pull top cases before removing bottom cases'}`);
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
            }
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
      const boxDelivId = hitObj.userData.deliveryId;

      // Interactive OVERAGE Flagging Mode on 3D Carts & Pallets
      if (uiState.overageDeliveryId) {
        if (boxDelivId && boxDelivId !== uiState.overageDeliveryId) {
          SoundSystem.playErrorBuzzer();
          showAlert('⚠️ Case belongs to another delivery! Finish or return to the active invoice first.');
          return true;
        }
        if (box.isCredit) {
          SoundSystem.playErrorBuzzer();
          showNotification('⚠️ Credit Tote return boxes cannot be flagged as invoice overages.', 2800);
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
              ? `🚩 Flagged ${box.name} as OVERAGE (excess kept on cart/pallet)`
              : `↩️ Removed OVERAGE flag from ${box.name}`,
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
        syncDeliveryBoxesVisuals(d);
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

    let lastTouchTapMs = 0;
    lockHint.addEventListener('click', requestLock);
    renderer.domElement.addEventListener('click', (e) => {
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
      if (!isTouchDevice && !isPointerLocked && !uiState.scannerModalOpen && !uiState.invoiceModalOpen && !isBlockingModalOpen()) {
        requestLock();
      }
    });
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      isPointerLocked = (document.pointerLockElement === renderer.domElement);
      updateLockHintDisplay();
    });

    window.addEventListener('mousemove', (e) => {
      if (isBlockingModalOpen()) return;
      if (Date.now() - lastTouchInteractionMs > 600) {
        usingTouchAim = false;
      }
      updatePointerNDC(e.clientX, e.clientY);
      if (isPointerLocked) {
        player.yaw -= e.movementX * mouseSens;
        player.pitch -= e.movementY * mouseSens;
        clampPitch();
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
        player.yaw -= dx * mouseSens;
        player.pitch -= dy * mouseSens;
        clampPitch();
      }
    });

    renderer.domElement.addEventListener('mousedown', (e) => {
      if (isBlockingModalOpen()) return;
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

    function clampPitch() {
      const maxPitch = 85 * (Math.PI / 180);
      player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch));
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
          if (hoveredBoxBeforeOpen.deliveryId) {
            DeliverySystem.focusDelivery(hoveredBoxBeforeOpen.deliveryId);
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
        const targetDeliv = DeliverySystem.activeDelivery;
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
    window.addEventListener('keydown', (e) => {
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
          handleInteractE();
          break;
        case 'Space':
          handlePalletAction();
          e.preventDefault();
          break;
        case 'KeyF':
          toggleScanner();
          e.preventDefault();
          break;
        case 'Escape':
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

          player.yaw -= dx * touchLookSens;
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
      alertBanner.textContent = msg;
      alertBanner.style.display = 'block';
      if (alertTimeout) clearTimeout(alertTimeout);
      alertTimeout = setTimeout(() => {
        alertBanner.style.display = 'none';
      }, 3200);
    }

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
    const boxHoverPill = document.getElementById('box-hover-pill');

    function setElDisp(el, disp) {
      if (el && el.style.display !== disp) {
        el.style.display = disp;
      }
    }

    function setElText(el, txt) {
      if (el && el.textContent !== txt) {
        el.textContent = txt;
      }
    }

    function setReticleActive(active) {
      const flag = Boolean(active);
      if (reticle && reticle.classList && reticle.classList.contains('active') !== flag) {
        reticle.classList.toggle('active', flag);
      }
    }

    function hideOtherPrompts(exceptEl) {
      if (exceptEl !== promptDoor) setElDisp(promptDoor, 'none');
      if (exceptEl !== promptSideDoor) setElDisp(promptSideDoor, 'none');
      if (exceptEl !== promptTerminal) setElDisp(promptTerminal, 'none');
      if (exceptEl !== promptDesk) setElDisp(promptDesk, 'none');
      if (exceptEl !== promptPallet) setElDisp(promptPallet, 'none');
      if (exceptEl !== promptDriver) setElDisp(promptDriver, 'none');
    }

    function updateNearbyInteractions(dt) {
      if (lookTouchId !== null && lookTouchMaxMove < 10) {
        lookTouchHeldMs += (dt || 0.016) * 1000;
      }

      const aimNDC = getAimNDC();
      const px = player.position.x;
      const pz = player.position.z;
      const carryingBackstock = isCarryingBackstockCase();
      const holdingClaimsItem = isHoldingClaimsItem();
      const holdingRecallTote = isHoldingRecallTote();
      const arrangingRecallItem = isArrangingRecallItem();

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
      if (!carryingBackstock && !player.hasElectricJack && !player.hitchedPallet && !holdingClaimsItem && !holdingRecallTote && !arrangingRecallItem && !uiState.hoveredLabelCase && !uiState.hoveredInventoryCase && !uiState.hoveredSupplyCase && !isBlockingModalOpen()) {
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
      interactRaycaster.setFromCamera(aimNDC, camera);
      interactRaycaster.far = 5.2;

      focusedInteractible = null;
      let interactHitDist = Infinity;
      if (!carryingBackstock && !holdingClaimsItem && !holdingRecallTote && !arrangingRecallItem) {
        const candidateMeshes = [];
        interactibles.forEach(item => {
          if (item.type === 'electric_jack' && (player.hasElectricJack || !electricJackWorld.visible)) {
            return;
          }
          if (item.type === 'pallet' && (item.target.isHitched || player.hitchedPallet)) {
            return;
          }
          if (item.type === 'driver' && item.session && item.session.state === 'OUTSIDE_WAITING' && (!sideRollupDoor.isOpen || sideRollupDoor.currentProgress < 0.35)) {
            return; // Must push side door button to open door and speak with waiting drivers/vendors!
          }
          const center = item.boxCenter;
          const dist = Math.hypot(px - center.x, pz - center.z);
          const maxDist = item.type === 'driver' ? 5.2 : 4.8;
          if (dist < maxDist) {
            candidateMeshes.push(item.mesh);
          }
        });

        const intersects = interactRaycaster.intersectObjects(candidateMeshes, false);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const hitItem = hit.object && hit.object.userData ? hit.object.userData.interactible : null;
          const maxRay = (hitItem && hitItem.type === 'driver') ? 5.0 : 4.0;
          if (hit.distance <= maxRay && hitItem) {
            focusedInteractible = hitItem;
            interactHitDist = hit.distance;
          }
        }
      }

      // Raycast open-tote damaged items whenever inspecting or scanning in Markdown Claims (Option 4)
      const claimsItemRayEligible = Boolean(
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
      if (arrangingRecallItem && window.ClaimsTotes && typeof window.ClaimsTotes.updateRecallArrangePreview === 'function') {
        interactRaycaster.setFromCamera(aimNDC, camera);
        interactRaycaster.far = 4.6;
        uiState.hoveredRecallArrangeSpot = window.ClaimsTotes.updateRecallArrangePreview(interactRaycaster);
      } else if (window.ClaimsTotes && typeof window.ClaimsTotes.updateRecallArrangePreview === 'function') {
        window.ClaimsTotes.updateRecallArrangePreview(null);
      }

      // Raycast top-shelf items / bottom-shelf dock / disposal receptacles while holding Small Recall Tote (or claims item)
      if ((holdingClaimsItem || holdingRecallTote) && !isBlockingModalOpen() && !uiState.invoiceModalOpen && !uiState.overageDeliveryId && window.ClaimsTotes) {
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

      if ((holdingClaimsItem || holdingRecallTote || arrangingRecallItem) && window.BackstockRacks) {
        window.BackstockRacks.hideGhostPreview();
      } else if (!holdingClaimsItem && !holdingRecallTote && !arrangingRecallItem && !isBlockingModalOpen() && !uiState.invoiceModalOpen && !uiState.overageDeliveryId) {
        if (carryingBackstock && window.BackstockRacks) {
          interactRaycaster.far = 5.2;
          const preview = window.BackstockRacks.updateGhostPreview(interactRaycaster);
          if (preview) {
            uiState.hoveredBackstockTarget = preview;
          }
        } else if (!uiState.hoveredPhysicalBox && !uiState.hoveredClaimsItem) {
          if (window.BackstockRacks) window.BackstockRacks.hideGhostPreview();
          let bestPickDist = interactHitDist;
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
          if (window.ClaimsTotes && typeof window.ClaimsTotes.getInteractableToteMeshes === 'function') {
            const toteMeshes = window.ClaimsTotes.getInteractableToteMeshes();
            if (toteMeshes.length > 0) {
              interactRaycaster.far = 4.6;
              const tHits = interactRaycaster.intersectObjects(toteMeshes, false);
              if (tHits.length > 0 && tHits[0].distance < bestPickDist && tHits[0].object.userData && tHits[0].object.userData.claimsToteRef) {
                uiState.hoveredClaimsTote = tHits[0].object.userData.claimsToteRef;
                uiState.hoveredClaimsToteMesh = uiState.hoveredClaimsTote.mesh;
                uiState.hoveredBackstockCase = null;
                uiState.hoveredBackstockCaseMesh = null;
                bestPickDist = tHits[0].distance;
                focusedInteractible = null;
              }
            }
          }
          if (window.ClaimsTotes && typeof window.ClaimsTotes.getRecallTopItemMeshes === 'function') {
            const rItemMeshes = window.ClaimsTotes.getRecallTopItemMeshes();
            if (rItemMeshes.length > 0) {
              interactRaycaster.far = 4.6;
              const riHits = interactRaycaster.intersectObjects(rItemMeshes, false);
              if (riHits.length > 0 && riHits[0].distance < bestPickDist && riHits[0].object.userData && riHits[0].object.userData.recallItemRef) {
                uiState.hoveredRecallItem = riHits[0].object.userData.recallItemRef;
                uiState.hoveredRecallItemMesh = uiState.hoveredRecallItem.mesh;
                uiState.hoveredClaimsTote = null;
                uiState.hoveredClaimsToteMesh = null;
                uiState.hoveredBackstockCase = null;
                uiState.hoveredBackstockCaseMesh = null;
                bestPickDist = riHits[0].distance;
                focusedInteractible = null;
              }
            }
          }
          if (window.ClaimsTotes && typeof window.ClaimsTotes.getRecallToteHitMeshes === 'function') {
            const rToteMeshes = window.ClaimsTotes.getRecallToteHitMeshes();
            if (rToteMeshes.length > 0) {
              interactRaycaster.far = 4.6;
              const rtHits = interactRaycaster.intersectObjects(rToteMeshes, false);
              if (rtHits.length > 0 && rtHits[0].distance < bestPickDist && rtHits[0].object.userData && rtHits[0].object.userData.recallToteRef) {
                uiState.hoveredRecallTote = true;
                uiState.hoveredRecallItem = null;
                uiState.hoveredRecallItemMesh = null;
                uiState.hoveredClaimsTote = null;
                uiState.hoveredClaimsToteMesh = null;
                uiState.hoveredBackstockCase = null;
                uiState.hoveredBackstockCaseMesh = null;
                focusedInteractible = null;
              }
            }
          }
        } else if (window.BackstockRacks) {
          window.BackstockRacks.hideGhostPreview();
        }
      } else if (window.BackstockRacks) {
        window.BackstockRacks.hideGhostPreview();
      }

      const nextCursor = (uiState.hoveredPhysicalBox || uiState.hoveredInventoryCase || uiState.hoveredSupplyCase || uiState.hoveredBackstockCase || uiState.hoveredBackstockTarget || uiState.hoveredClaimsTote || uiState.hoveredClaimsItem || uiState.hoveredClaimsReceptacle || uiState.hoveredRecallItem || uiState.hoveredRecallTote || uiState.hoveredRecallBottomDock || uiState.hoveredRecallArrangeSpot) ? 'pointer' : '';
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
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        uiState.hoveredBoxMesh.getWorldPosition(wp);
        uiState.hoveredBoxMesh.getWorldQuaternion(wq);
        const gp = uiState.hoveredBoxMesh.geometry.parameters || { width: 0.25, height: 0.26, depth: 0.35 };
        focusHighlightGroup.position.copy(wp);
        focusHighlightGroup.quaternion.copy(wq);
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

        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptPallet.style.display = 'none';
        promptDriver.style.display = 'none';

        if (boxHoverPill) {
          const hb = uiState.hoveredPhysicalBox;
          const boxUnitTag = hb.isCredit
            ? ' (1u CREDIT)'
            : (Number(hb.unitsPerCase) > 0 ? ` (${Number(hb.unitsPerCase)}u/cs)` : '');
          positionBoxHoverPill(boxHoverPill, aimNDC, 220);
          if (boxOverageMode) {
            boxHoverPill.style.borderColor = '#e879f9';
            boxHoverPill.style.color = '#fae8ff';
            boxHoverPill.textContent = hb.overageFlagged
              ? `🚩 OVERAGE FLAGGED — CLICK TO UNFLAG (${hb.code}${boxUnitTag})`
              : `🚩 CLICK TO FLAG OVERAGE: ${hb.code} · ${hb.name}${boxUnitTag}`;
          } else if (hb.overageFlagged) {
            boxHoverPill.style.borderColor = '#e879f9';
            boxHoverPill.style.color = '#f5d0fe';
            boxHoverPill.textContent = `🚩 OVERAGE FLAGGED: ${hb.code} · ${hb.name}${boxUnitTag}`;
          } else {
            boxHoverPill.style.borderColor = hb.scanned ? '#22c55e' : (hb.notScannable ? '#f59e0b' : '#38bdf8');
            boxHoverPill.style.color = hb.scanned ? '#86efac' : '#f8fafc';
            boxHoverPill.textContent = hb.scanned
              ? `✓ ${hb.code} · ${hb.name}${boxUnitTag} (INPUTTED)`
              : (hb.notScannable
                ? `PLU ${hb.code} · ${hb.name}${boxUnitTag} (KEY PLU)`
                : `CLICK TO SCAN: ${hb.code} · ${hb.name}${boxUnitTag}`);
          }
        }
      } else if (uiState.hoveredLabelCase && uiState.hoveredLabelMesh) {
        const lc = uiState.hoveredLabelCase;
        const lm = uiState.hoveredLabelMesh;
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        lm.getWorldPosition(wp);
        lm.getWorldQuaternion(wq);
        const gp = (lm.geometry && lm.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(wp);
        focusHighlightGroup.quaternion.copy(wq);
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

        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptPallet.style.display = 'none';
        promptDriver.style.display = 'none';

        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 260);
          if (isSupplyLc) {
            boxHoverPill.style.borderColor = '#f59e0b';
            boxHoverPill.style.color = '#fef3c7';
            boxHoverPill.textContent = `📦 DEPT 60 SUPPLY (${lc.code}) — STAYS WHITE (NO LABEL REQ)`;
          } else if (lc.labeled) {
            boxHoverPill.style.borderColor = '#22c55e';
            boxHoverPill.style.color = '#86efac';
            boxHoverPill.textContent = `🏷️ YELLOW UPC LABELED: ${lc.code} · ${lc.name} (${lc.unitsPerCase || 1}u)`;
          } else if (isPluLc) {
            boxHoverPill.style.borderColor = '#4ade80';
            boxHoverPill.style.color = '#bbf7d0';
            boxHoverPill.textContent = `PLU ${lc.code} · ${lc.name} (${lc.unitsPerCase || 1}u) — TYPE PLU + ENT + F6`;
          } else {
            boxHoverPill.style.borderColor = '#facc15';
            boxHoverPill.style.color = '#fef9c3';
            boxHoverPill.textContent = `CLICK TO PULL INFO: UPC ${lc.code} · ${lc.name} (${lc.unitsPerCase || 1}u)`;
          }
        }
      } else if (uiState.hoveredInventoryCase && uiState.hoveredInventoryMesh) {
        const ic = uiState.hoveredInventoryCase;
        const im = uiState.hoveredInventoryMesh;
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        im.getWorldPosition(wp);
        im.getWorldQuaternion(wq);
        const gp = (im.geometry && im.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(wp);
        focusHighlightGroup.quaternion.copy(wq);
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

        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptPallet.style.display = 'none';
        promptDriver.style.display = 'none';

        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 260);
          if (!isPlaced) {
            boxHoverPill.style.borderColor = '#ef4444';
            boxHoverPill.style.color = '#fecaca';
            boxHoverPill.textContent = `⚠️ UNPLACED (${ic.code}) — PLACE ON STEEL FIRST`;
          } else if (!isEligibleRack) {
            boxHoverPill.style.borderColor = '#f59e0b';
            boxHoverPill.style.color = '#fef3c7';
            boxHoverPill.textContent = `📦 DEPT 60 SUPPLY (${binLabel}) — USE OPT 2`;
          } else if (ic.inventoried) {
            const auditInfo = (window.BackstockRacks && typeof window.BackstockRacks.getCaseAuditInfo === 'function')
              ? window.BackstockRacks.getCaseAuditInfo(ic)
              : { auditedQty: ic.auditedQty || 0 };
            boxHoverPill.style.borderColor = '#22c55e';
            boxHoverPill.style.color = '#86efac';
            boxHoverPill.textContent = `✓ AUDITED (${auditInfo.auditedQty || 0}u): ${ic.code} · ${ic.name} [${binLabel}]`;
          } else {
            boxHoverPill.style.borderColor = '#38bdf8';
            boxHoverPill.style.color = '#f8fafc';
            boxHoverPill.textContent = `CLICK TO AUDIT: ${ic.code} · ${ic.name} [${binLabel}]`;
          }
        }
      } else if (uiState.hoveredSupplyCase && uiState.hoveredSupplyMesh) {
        const scBox = uiState.hoveredSupplyCase;
        const sm = uiState.hoveredSupplyMesh;
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        sm.getWorldPosition(wp);
        sm.getWorldQuaternion(wq);
        const gp = (sm.geometry && sm.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(wp);
        focusHighlightGroup.quaternion.copy(wq);
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

        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptPallet.style.display = 'none';
        promptDriver.style.display = 'none';

        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 260);
          if (orderLockedToday) {
            boxHoverPill.style.borderColor = '#f59e0b';
            boxHoverPill.style.color = '#fef3c7';
            boxHoverPill.textContent = `✓ SUPPLY ORDER FINALIZED TODAY — NEXT SHIFT`;
          } else if (isSupplyBox) {
            boxHoverPill.style.borderColor = '#22c55e';
            boxHoverPill.style.color = '#86efac';
            boxHoverPill.textContent = `CLICK TO ORDER SKU: ${scBox.code} · ${scBox.name} [${binLabel}]`;
          } else {
            boxHoverPill.style.borderColor = '#f59e0b';
            boxHoverPill.style.color = '#fef3c7';
            boxHoverPill.textContent = `⚠️ NOT DEPT 60 SUPPLY (${scBox.code}) — USE OPT 3`;
          }
        }
      } else if (uiState.hoveredBackstockTarget && carryingBackstock) {
        const tgt = uiState.hoveredBackstockTarget;
        // Let BackstockRacks' exact 3D ghost preview box highlight the spot cleanly without a giant bay cage
        focusHighlightGroup.visible = false;
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        const held = window.BackstockRacks.getHeldCase();
        promptPallet.style.display = 'block';
        const slotLoc = tgt.type === 'slot' ? window.BackstockRacks.formatSlotDesignation(tgt.slot) : '';
        const slotRackName = tgt.type === 'slot' ? window.BackstockRacks.getRackDisplayName(tgt.slot.rackId) : '';
        if (!tgt.valid) {
          promptPallet.textContent = `⚠️ ${tgt.reason || 'Cannot place case here'}`;
        } else {
          promptPallet.textContent = tgt.type === 'slot'
            ? (tgt.linkedCount > 1
              ? `🔗 [E / Click] Link ${held ? held.name : 'Case'} (×${tgt.linkedCount} · ${tgt.linkedRowQty}u) on ${slotRackName} (${slotLoc})`
              : `📥 [E / Click] Place on ${slotRackName} (${slotLoc})`)
            : `📦 [E / Click] Set ${held ? held.name : 'Case'} back on ${tgt.pallet.label}`;
        }
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 250);
          if (!tgt.valid) {
            boxHoverPill.style.borderColor = '#ef4444';
            boxHoverPill.style.color = '#fecaca';
            boxHoverPill.textContent = `⚠️ ${tgt.reason || 'BLOCKED'}`;
          } else {
            boxHoverPill.style.borderColor = '#22c55e';
            boxHoverPill.style.color = '#dcfce7';
            boxHoverPill.textContent = tgt.type === 'slot'
              ? (tgt.linkedCount > 1
                ? `🔗 LINK ROW (×${tgt.linkedCount} · ${tgt.linkedRowQty}u): ${slotRackName} (${slotLoc})`
                : `📥 PLACE HERE: ${slotRackName} (${slotLoc})`)
              : `📦 SET BACK ON PALLET: ${tgt.pallet.label}`;
          }
        }
      } else if (uiState.hoveredBackstockCase && uiState.hoveredBackstockCaseMesh) {
        const bc = uiState.hoveredBackstockCase;
        const bm = uiState.hoveredBackstockCaseMesh;
        const pickCheck = (window.BackstockRacks && typeof window.BackstockRacks.canPickupCase === 'function')
          ? window.BackstockRacks.canPickupCase(bc)
          : { ok: true };
        const isPickBlocked = Boolean(pickCheck && !pickCheck.ok);
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        bm.getWorldPosition(wp);
        bm.getWorldQuaternion(wq);
        const gp = (bm.geometry && bm.geometry.parameters) || { width: 0.34, height: 0.26, depth: 0.30 };
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(wp);
        focusHighlightGroup.quaternion.copy(wq);
        focusHighlightGroup.scale.set(gp.width + 0.025, gp.height + 0.025, gp.depth + 0.025);
        crtMaskMat.color.setHex(isPickBlocked ? 0xef4444 : 0xf59e0b);
        crtMaskMat.opacity = pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        promptPallet.style.display = 'block';
        const linkNote = (bc.placedOnRack && (bc.linkedCount || 1) > 1 && (bc.depthIdx || 0) === 0)
          ? ` ×${bc.linkedCount} · ${bc.linkedChainQty}u`
          : ` ${bc.unitsPerCase}u`;
        promptPallet.textContent = isPickBlocked
          ? `⚠️ ${pickCheck.reason || 'Pull top cases before removing bottom cases'}`
          : (bc.placedOnRack
            ? `📦 [E / Click] Pull Case from Shelf: ${bc.name} (${linkNote.trim()})`
            : `📦 [E / Click] Pick Up Case: ${bc.name} (${bc.unitsPerCase}u · ${bc.size.toUpperCase()})`);
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 250);
          boxHoverPill.style.borderColor = isPickBlocked ? '#ef4444' : '#f59e0b';
          boxHoverPill.style.color = isPickBlocked ? '#fecaca' : '#fef3c7';
          boxHoverPill.textContent = isPickBlocked
            ? `⚠️ ${pickCheck.reason || 'BLOCKED'}`
            : `📦 [E / CLICK] ${bc.placedOnRack ? 'PULL' : 'PICK UP'}: ${bc.code} · ${bc.name}${bc.placedOnRack ? ` (${linkNote.trim()})` : ''}`;
        }
      } else if (uiState.hoveredClaimsTote && uiState.hoveredClaimsToteMesh) {
        const tote = uiState.hoveredClaimsTote;
        // Highlight only the physical molded tote body & rim (no box spanning the open top!)
        focusHighlightGroup.visible = false;
        if (window.ClaimsTotes && typeof window.ClaimsTotes.setHoveredTote === 'function') {
          window.ClaimsTotes.setHoveredTote(tote, pulse);
        }
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        promptPallet.style.display = 'block';
        const summary = (window.ClaimsTotes && typeof window.ClaimsTotes.getGrayToteSummary === 'function')
          ? window.ClaimsTotes.getGrayToteSummary(tote)
          : null;
        const itemCount = summary ? summary.itemCount : 0;
        if (tote.isRed) {
          promptPallet.textContent = '🔴 CREDIT TOTE — Vendor Returns Only (Stays on shelf)';
        } else if (tote.isOpen) {
          promptPallet.textContent = `📥 [E / Click] Push Tote Back: ${tote.label} (${itemCount} item${itemCount === 1 ? '' : 's'})`;
        } else {
          promptPallet.textContent = `🧺 [E / Click] Tip Tote Forward: ${tote.label} (${itemCount} item${itemCount === 1 ? '' : 's'})`;
        }
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 250);
          boxHoverPill.style.borderColor = tote.isRed ? '#ef4444' : (tote.isOpen ? '#f59e0b' : '#38bdf8');
          boxHoverPill.style.color = tote.isRed ? '#fecaca' : (tote.isOpen ? '#fef3c7' : '#e0f2fe');
          boxHoverPill.textContent = tote.isRed
            ? '🔴 CREDIT TOTE (FIXED ON SHELF)'
            : (tote.isOpen
              ? `📥 [E / CLICK] PUSH BACK: ${tote.label} (${itemCount} item${itemCount === 1 ? '' : 's'})`
              : `🧺 [E / CLICK] TIP FORWARD: ${tote.label} (${itemCount} item${itemCount === 1 ? '' : 's'})`);
        }
      } else if (uiState.hoveredClaimsItem && uiState.hoveredClaimsItemMesh) {
        const item = uiState.hoveredClaimsItem;
        const im = uiState.hoveredClaimsItemMesh;
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        im.getWorldPosition(wp);
        im.getWorldQuaternion(wq);
        const lCenter = (item.localCenter ? item.localCenter.clone() : new THREE.Vector3(0, 0.06, 0)).applyQuaternion(wq);
        const lSize = item.localSize || new THREE.Vector3(0.12, 0.12, 0.12);
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(wp).add(lCenter);
        focusHighlightGroup.quaternion.copy(wq);
        focusHighlightGroup.scale.set(lSize.x + 0.014, lSize.y + 0.014, lSize.z + 0.014);
        crtMaskMat.color.setHex(item.scannerConfirmed ? 0x22c55e : 0x38bdf8);
        crtMaskMat.opacity = Math.min(0.20, pulse * 0.45);
        crtWireMat.opacity = Math.min(1.0, pulse + 0.45);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.55);
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        const condText = item.conditionLabel || 'Damaged';
        const dispText = (item.scannerConfirmed && window.ClaimsTotes)
          ? window.ClaimsTotes.getReceptacleLabel(item.confirmedDisposition)
          : '';
        if (item.scannerConfirmed || !uiState.scannerModalOpen) {
          promptPallet.style.display = 'block';
          promptPallet.textContent = item.scannerConfirmed
            ? `🖐️ [E / Click] Take ${item.name} (${condText}) -> ${dispText}`
            : `🔍 ${item.name} · Condition: ${condText} · [F] Scan Markdown Claims`;
        } else {
          promptPallet.style.display = 'none';
        }
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 280);
          boxHoverPill.style.borderColor = item.scannerConfirmed ? '#22c55e' : '#38bdf8';
          boxHoverPill.style.color = item.scannerConfirmed ? '#86efac' : '#e0f2fe';
          const inDmgScan = Boolean(uiState.scannerModalOpen && window.DSDReceipts && typeof window.DSDReceipts.isScannerDamageMode === 'function' && window.DSDReceipts.isScannerDamageMode());
          if (item.scannerConfirmed) {
            boxHoverPill.textContent = `✓ ${item.name} · ${condText} -> ${dispText} ([E / Click] Take)`;
          } else if (inDmgScan) {
            boxHoverPill.textContent = `CLICK TO SCAN: ${item.name} · Condition: ${condText}`;
          } else {
            boxHoverPill.textContent = `${item.name} · Condition: ${condText} ([E / F] Scan Claims)`;
          }
        }
      } else if (arrangingRecallItem) {
        focusHighlightGroup.visible = false;
        reticle.classList.toggle('active', Boolean(uiState.hoveredRecallArrangeSpot));
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        promptPallet.style.display = 'block';
        const rs = (window.ClaimsTotes && typeof window.ClaimsTotes.getRecallState === 'function') ? window.ClaimsTotes.getRecallState() : null;
        promptPallet.textContent = uiState.hoveredRecallArrangeSpot
          ? `📦 [E / Click] Place ${rs ? rs.movingItemName : 'Item'} on top shelf`
          : `🔍 Aim at Recall Cart top shelf & [E / Click] to place down`;
        if (boxHoverPill) {
          if (uiState.hoveredRecallArrangeSpot) {
            positionBoxHoverPill(boxHoverPill, aimNDC, 260);
            boxHoverPill.style.borderColor = '#38bdf8';
            boxHoverPill.style.color = '#e0f2fe';
            boxHoverPill.textContent = '📦 [E / CLICK] PLACE ON TOP SHELF';
          } else {
            boxHoverPill.style.display = 'none';
          }
        }
      } else if (uiState.hoveredRecallItem && uiState.hoveredRecallItemMesh) {
        const item = uiState.hoveredRecallItem;
        const im = uiState.hoveredRecallItemMesh;
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        im.getWorldPosition(wp);
        im.getWorldQuaternion(wq);
        const lCenter = (item.localCenter ? item.localCenter.clone() : new THREE.Vector3(0, 0.06, 0)).applyQuaternion(wq);
        const lSize = item.localSize || new THREE.Vector3(0.11, 0.12, 0.11);
        focusHighlightGroup.visible = true;
        focusHighlightGroup.position.copy(wp).add(lCenter);
        focusHighlightGroup.quaternion.copy(wq);
        focusHighlightGroup.scale.set(lSize.x + 0.014, lSize.y + 0.014, lSize.z + 0.014);
        crtMaskMat.color.setHex(holdingRecallTote ? 0x22c55e : 0xf59e0b);
        crtMaskMat.opacity = Math.min(0.22, pulse * 0.5);
        crtWireMat.opacity = Math.min(1.0, pulse + 0.45);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.55);
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        promptPallet.style.display = 'block';
        promptPallet.textContent = holdingRecallTote
          ? `🧺 [E / Click] Collect ${item.name} into Recall Tote`
          : `🖐️ [E / Click] Move ${item.name} on shelf to count`;
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 280);
          boxHoverPill.style.borderColor = holdingRecallTote ? '#22c55e' : '#f59e0b';
          boxHoverPill.style.color = holdingRecallTote ? '#86efac' : '#fef3c7';
          boxHoverPill.textContent = holdingRecallTote
            ? `🧺 [E / CLICK] COLLECT: ${item.name}`
            : `🖐️ [E / CLICK] MOVE TO COUNT: ${item.name}`;
        }
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
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        promptPallet.style.display = 'block';
        promptPallet.textContent = '📥 [E / Click] Set Recall Tote on Bottom Shelf';
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 260);
          boxHoverPill.style.borderColor = '#38bdf8';
          boxHoverPill.style.color = '#e0f2fe';
          boxHoverPill.textContent = '📥 [E / CLICK] SET TOTE DOWN';
        }
      } else if (uiState.hoveredClaimsReceptacle) {
        const rec = uiState.hoveredClaimsReceptacle;
        const heldItem = window.ClaimsTotes ? window.ClaimsTotes.getHeldItem() : null;
        const recallState = (holdingRecallTote && window.ClaimsTotes && typeof window.ClaimsTotes.getRecallState === 'function')
          ? window.ClaimsTotes.getRecallState()
          : null;
        const toteReadyToDump = Boolean(recallState && recallState.allItemsCollected);
        if (rec.toteRec) {
          focusHighlightGroup.visible = false;
          if (window.ClaimsTotes && typeof window.ClaimsTotes.setHoveredTote === 'function') {
            window.ClaimsTotes.setHoveredTote(rec.toteRec, pulse, 0x22c55e);
          }
        } else if (rec.boxCenter && rec.boxSize) {
          focusHighlightGroup.visible = true;
          focusHighlightGroup.quaternion.set(0, 0, 0, 1);
          focusHighlightGroup.position.copy(rec.boxCenter);
          focusHighlightGroup.scale.set(rec.boxSize.x + 0.04, rec.boxSize.y + 0.04, rec.boxSize.z + 0.04);
          crtMaskMat.color.setHex((holdingRecallTote && !toteReadyToDump) ? 0xf59e0b : 0x22c55e);
          crtMaskMat.opacity = pulse;
          crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
          crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);
        }
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        promptPallet.style.display = 'block';
        if (holdingRecallTote) {
          promptPallet.textContent = toteReadyToDump
            ? `🚨 [E / Click] Dump Recall Tote (${recallState.productName}) in ${rec.label}`
            : `⚠️ Collect all items off the Recall Cart top shelf before dumping!`;
        } else {
          promptPallet.textContent = `📥 [E / Click] Place ${heldItem ? heldItem.name : 'Claim Item'} in ${rec.label}`;
        }
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 260);
          boxHoverPill.style.borderColor = (holdingRecallTote && !toteReadyToDump) ? '#f59e0b' : '#22c55e';
          boxHoverPill.style.color = (holdingRecallTote && !toteReadyToDump) ? '#fef3c7' : '#86efac';
          boxHoverPill.textContent = holdingRecallTote
            ? (toteReadyToDump ? `🚨 [E / CLICK] DUMP IN ${rec.label}` : '⚠️ COLLECT REMAINING TOP ITEMS FIRST')
            : `📥 [E / CLICK] PLACE IN ${rec.label}`;
        }
      } else if (holdingRecallTote) {
        if (boxHoverPill) boxHoverPill.style.display = 'none';
        focusHighlightGroup.visible = false;
        reticle.classList.remove('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        const recallState = (window.ClaimsTotes && typeof window.ClaimsTotes.getRecallState === 'function')
          ? window.ClaimsTotes.getRecallState()
          : null;
        promptPallet.style.display = 'block';
        promptPallet.textContent = (recallState && recallState.allItemsCollected)
          ? `🚨 Carrying Recall Tote (${recallState.productName}) -> Dump in ${recallState.correctBinLabel} & [E / Click]`
          : `🧺 Carrying Recall Tote -> Collect top-shelf items (or set on bottom shelf)`;
      } else if (holdingClaimsItem) {
        if (boxHoverPill) boxHoverPill.style.display = 'none';
        focusHighlightGroup.visible = false;
        reticle.classList.remove('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        const heldItem = window.ClaimsTotes ? window.ClaimsTotes.getHeldItem() : null;
        const destLabel = (heldItem && window.ClaimsTotes)
          ? window.ClaimsTotes.getReceptacleLabel(heldItem.confirmedDisposition)
          : 'RECEPTACLE';
        promptPallet.style.display = 'block';
        promptPallet.textContent = `🖐️ Carrying ${heldItem ? heldItem.name : 'Claim'} -> Walk to ${destLabel} & [E / Click]`;
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
        reticle.classList.add('active');
        promptDoor.style.display = 'none';
        promptSideDoor.style.display = 'none';
        promptTerminal.style.display = 'none';
        promptDesk.style.display = 'none';
        promptDriver.style.display = 'none';
        promptPallet.style.display = 'block';
        promptPallet.textContent = '🧺 [E / Click] Pick Up Small Gray Recall Tote';
        if (boxHoverPill) {
          positionBoxHoverPill(boxHoverPill, aimNDC, 260);
          boxHoverPill.style.borderColor = '#22c55e';
          boxHoverPill.style.color = '#86efac';
          boxHoverPill.textContent = '🧺 [E / CLICK] PICK UP RECALL TOTE';
        }
      } else if (focusedInteractible) {
        setElDisp(boxHoverPill, 'none');
        focusHighlightGroup.visible = true;
        if (focusedInteractible.boxQuaternion) {
          focusHighlightGroup.quaternion.copy(focusedInteractible.boxQuaternion);
        } else if (focusedInteractible.type === 'pallet' && focusedInteractible.target && focusedInteractible.target.mesh) {
          focusHighlightGroup.quaternion.copy(focusedInteractible.target.mesh.quaternion);
        } else {
          focusHighlightGroup.quaternion.set(0, 0, 0, 1);
        }
        crtMaskMat.color.setHex(0x22c55e);
        focusHighlightGroup.position.copy(focusedInteractible.boxCenter);
        focusHighlightGroup.scale.copy(focusedInteractible.boxSize);

        crtMaskMat.opacity = pulse;
        crtWireMat.opacity = Math.min(1.0, pulse + 0.35);
        crtEdgeMat.opacity = Math.min(1.0, pulse + 0.45);

        setReticleActive(true);

        if (focusedInteractible.type === 'dock_button' || focusedInteractible.type === 'side_door_button') {
          setElDisp(promptDoor, 'block');
          setElText(promptDoor, focusedInteractible.getPrompt());
          hideOtherPrompts(promptDoor);
        } else if (focusedInteractible.type === 'terminal') {
          setElDisp(promptTerminal, 'block');
          setElText(promptTerminal, focusedInteractible.getPrompt());
          hideOtherPrompts(promptTerminal);
        } else if (
          focusedInteractible.type === 'desk_papers' ||
          focusedInteractible.type === 'filing_folder' ||
          focusedInteractible.type === 'file_cabinet' ||
          focusedInteractible.type === 'printer' ||
          focusedInteractible.type === 'trash_can'
        ) {
          setElDisp(promptDesk, 'block');
          setElText(promptDesk, focusedInteractible.getPrompt());
          hideOtherPrompts(promptDesk);
        } else if (focusedInteractible.type === 'driver') {
          setElDisp(promptDriver, 'block');
          setElText(promptDriver, focusedInteractible.getPrompt());
          hideOtherPrompts(promptDriver);
        } else if (focusedInteractible.type === 'electric_jack') {
          setElDisp(promptPallet, 'block');
          setElText(promptPallet, focusedInteractible.getPrompt());
          hideOtherPrompts(promptPallet);
        } else if (focusedInteractible.type === 'pallet') {
          setElDisp(promptPallet, 'block');
          setElText(
            promptPallet,
            !player.hasElectricJack ? '[Space] Electric Jack Required to Move Pallet' : focusedInteractible.getPrompt()
          );
          hideOtherPrompts(promptPallet);
        }
      } else {
        setElDisp(boxHoverPill, 'none');
        focusHighlightGroup.visible = false;

        if (carryingBackstock) {
          const held = window.BackstockRacks.getHeldCase();
          setReticleActive(false);
          hideOtherPrompts(promptPallet);
          setElDisp(promptPallet, 'block');
          setElText(promptPallet, `📦 Carrying: ${held ? held.name : 'Case'} (${held ? held.unitsPerCase + 'u' : ''}) — Aim at Steel Shelf & Click / [E] to Place`);
        } else if (player.hitchedPallet) {
          setReticleActive(true);
          hideOtherPrompts(promptPallet);
          setElDisp(promptPallet, 'block');
          setElText(promptPallet, `[Space] Lower & Drop Pallet (${player.hitchedPallet.data.po})`);
        } else if (player.hasElectricJack) {
          setReticleActive(false);
          hideOtherPrompts(promptPallet);
          setElDisp(promptPallet, 'block');
          setElText(promptPallet, '[Space] Drop / Park Electric Jack');
        } else {
          setReticleActive(false);
          hideOtherPrompts(null);
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
                ['desk_papers', 'filing_folder', 'file_cabinet', 'printer', 'trash_can'].includes(focusedInteractible.type)
              ) {
                useLabel = 'Inspect';
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
          const baySess = DeliverySystem.getSessionForBay(dd.id);
          const drvName = baySess && baySess.delivery ? baySess.delivery.driverName : 'Driver';
          showNotification(`🚛 ${drvName} opened trailer roll-up door at Bay ${dd.id}.`);
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
          showNotification('📦 Aim at a steel shelf (or floor pallet) and press [E] / Click to place case.');
        }
        return;
      }
      if (isArrangingRecallItem()) {
        if (!handleClaimsToteInteract(false)) {
          showNotification('📦 Aim at Recall Cart top shelf and press [E] / Click to place item down.');
        }
        return;
      }
      if (isHoldingRecallTote()) {
        if (!handleClaimsToteInteract(false)) {
          showNotification('🧺 Collect top-shelf items, set tote on bottom shelf, or dump at disposal receptacle.');
        }
        return;
      }
      if (isHoldingClaimsItem()) {
        if (!handleClaimsToteInteract(false)) {
          showNotification('📥 Aim at Trash, Organics, Hazwaste, Donations, or Red Credit Tote and press [E] / Click.');
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
      if ((uiState.hoveredRecallItem || uiState.hoveredRecallTote || uiState.hoveredClaimsItem || uiState.hoveredClaimsTote) && handleClaimsToteInteract(false)) {
        return;
      }
      if (uiState.hoveredBackstockCase && handleBackstockInteract(false)) {
        return;
      }
      if (focusedInteractible) {
        if (
          focusedInteractible.type === 'dock_button' ||
          focusedInteractible.type === 'side_door_button' ||
          focusedInteractible.type === 'terminal' ||
          focusedInteractible.type === 'driver' ||
          focusedInteractible.type === 'desk_papers' ||
          focusedInteractible.type === 'filing_folder' ||
          focusedInteractible.type === 'file_cabinet' ||
          focusedInteractible.type === 'printer' ||
          focusedInteractible.type === 'trash_can'
        ) {
          if (
            uiState.scannerModalOpen &&
            (focusedInteractible.type === 'filing_folder' || focusedInteractible.type === 'file_cabinet')
          ) {
            closeScanner();
          }
          focusedInteractible.interact();
        }
      }
    }

    promptDoor.addEventListener('click', handleInteractE);
    promptSideDoor.addEventListener('click', handleInteractE);
    promptTerminal.addEventListener('click', handleInteractE);
    promptDesk.addEventListener('click', handleInteractE);
    promptDriver.addEventListener('click', handleInteractE);
    promptPallet.addEventListener('click', () => {
      if (
        player.hasElectricJack ||
        player.hitchedPallet ||
        (focusedInteractible && (focusedInteractible.type === 'electric_jack' || focusedInteractible.type === 'pallet'))
      ) {
        handlePalletAction();
      } else if (uiState.hoveredClaimsItem && !uiState.hoveredClaimsItem.scannerConfirmed) {
        toggleScanner();
      } else {
        handleInteractE();
      }
    });

    function takeElectricJack() {
      if (isCarryingBackstockCase()) {
        showAlert('⚠️ Hands occupied carrying a case! Place the case on steel before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingRecallTote() || isArrangingRecallItem()) {
        showAlert('⚠️ Hands occupied with Recall work! Place the small gray tote on the Recall Cart bottom shelf before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingClaimsItem()) {
        showAlert('⚠️ Hands occupied carrying a damaged item! Place it in a receptacle before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (uiState.scannerModalOpen) {
        showAlert('⚠️ Hands occupied! Close the Hand Scanner [F] before taking the Electric Jack.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      player.hasElectricJack = true;
      jackDockedAtCharger = false;
      electricJackWorld.visible = false;
      electricJackViewmodel.visible = true;
      syncElectricJackBatteryVisuals(undefined, true);
      SoundSystem.playHydraulicLift();
      showNotification('⚡ Operating Electric Pallet Jack — Move with WASD, [Space] to Hitch Pallet or Drop Jack');
    }

    function canParkElectricJackAt(jx, jz, yaw) {
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      // Sample powerhead center (0,0) and fork tips (0,-1.35) in local space
      const pts = [
        { x: jx, z: jz, r: 0.36 },
        { x: jx - sinY * 1.35, z: jz - cosY * 1.35, r: 0.26 }
      ];
      const minX = ORIGIN_X + 0.1;
      const maxX = -ORIGIN_X - 0.1;
      const maxZ = ORIGIN_Z + ROWS * TILE_SIZE - 0.1;
      for (let pIdx = 0; pIdx < pts.length; pIdx++) {
        const pt = pts[pIdx];
        if (pt.x - pt.r < minX || pt.x + pt.r > maxX || pt.z - pt.r < doorZ + 0.05 || pt.z + pt.r > maxZ) {
          return false;
        }
        for (let i = 0; i < solidWalls.length; i++) {
          const b = solidWalls[i];
          if (pt.x + pt.r > b.minX && pt.x - pt.r < b.maxX &&
            pt.z + pt.r > b.minZ && pt.z - pt.r < b.maxZ) {
            return false;
          }
        }
      }
      return true;
    }

    const JACK_HOME_POS = { x: -7.20, z: 1.95, yaw: 0 };

    function isNearJackRechargingZone(jx, jz) {
      const distJack = Math.hypot(jx - JACK_HOME_POS.x, jz - JACK_HOME_POS.z);
      const inZoneBox = Math.abs(player.position.x - JACK_HOME_POS.x) <= 1.45 &&
        player.position.z >= doorZ + 0.35 &&
        player.position.z <= 3.10;
      return distJack <= 1.45 || inZoneBox;
    }

    function dropElectricJack() {
      if (player.hitchedPallet) {
        showAlert('⚠️ Lower and drop the pallet first before parking the electric jack.');
        return;
      }
      player.hasElectricJack = false;
      electricJackViewmodel.visible = false;

      const sinYaw = Math.sin(player.yaw);
      const cosYaw = Math.cos(player.yaw);
      const fwdDirX = -sinYaw;
      const fwdDirZ = -cosYaw;
      const fwdX = player.position.x + fwdDirX * 0.95;
      const fwdZ = player.position.z + fwdDirZ * 0.95;

      // Snap cleanly into Recharging Station home dock when returned to its recharging zone
      if (isNearJackRechargingZone(fwdX, fwdZ)) {
        electricJackWorld.position.set(JACK_HOME_POS.x, 0, JACK_HOME_POS.z);
        electricJackWorld.rotation.y = JACK_HOME_POS.yaw;
        electricJackWorld.visible = true;
        jackDockedAtCharger = true;

        // If player stood inside the home dock collider when unhooking, step player clear of the handle
        if (checkCollision(player.position.x, player.position.z)) {
          const safeSpots = [
            { x: JACK_HOME_POS.x, z: 2.75 },
            { x: JACK_HOME_POS.x + 0.92, z: 1.95 },
            { x: JACK_HOME_POS.x - 0.92, z: 1.95 }
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
          showNotification(`⚡ Electric Pallet Jack plugged in & charging (${displayPct}%)`);
        } else {
          showNotification('⚡ Electric Pallet Jack plugged in (100% charged)');
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
      showNotification('⚡ Electric Pallet Jack parked');
    }

    function handlePalletAction() {
      if (isCarryingBackstockCase()) {
        showAlert('⚠️ Hands occupied carrying a case! Place the case on steel before using the Electric Jack.');
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
          let minDist = 2.4;
          pallets.forEach(p => {
            if (p.isHitched) return;
            const d = Math.hypot(player.position.x - p.position.x, player.position.z - p.position.z);
            if (d < minDist) {
              minDist = d;
              closest = p;
            }
          });
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
            showAlert('⚠️ ELECTRIC PALLET JACK REQUIRED! You cannot move pallets by hand. Take the electric jack first.');
            SoundSystem.playErrorBuzzer();
            showNotification('⚡ Take the Electric Pallet Jack staged between Docks 1 & 2 (or where parked).');
          }
        }
      }
    }

    function positionHitchedPallet() {
      const pallet = player.hitchedPallet;
      if (!pallet) return;
      const forwardX = -Math.sin(player.yaw);
      const forwardZ = -Math.cos(player.yaw);
      const forkDistance = 1.55;
      pallet.position.set(
        player.position.x + forwardX * forkDistance,
        0.08,
        player.position.z + forwardZ * forkDistance
      );
      pallet.mesh.rotation.y = player.yaw;
    }

    function hitchPallet(pallet) {
      if (!pallet || pallet.isHitched) return;
      if (!player.hasElectricJack) {
        showAlert('⚠️ ELECTRIC PALLET JACK REQUIRED! You cannot move pallets by hand. Take the electric jack first.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (player.hitchedPallet) {
        showAlert('⚠️ Already hauling a pallet. Press [Space] to lower & drop it first.');
        return;
      }
      if (pallet.position.z < doorZ) {
        const bay = dockDoors.find((dd) => Math.abs(pallet.position.x - dd.worldX) <= TILE_SIZE);
        if (!bay || !bay.hasTrailer || !bay.trailerDoorOpen || bay.trailerDoorProgress < 0.70) {
          showAlert('🔒 TRAILER DOOR CLOSED! Let the driver enter & open the dock door before unloading pallets.');
          SoundSystem.playErrorBuzzer();
          return;
        }
      }
      player.hitchedPallet = pallet;
      pallet.isHitched = true;
      pallet.data.status = 'IN_TRANSIT';
      pallet.mesh.position.y = 0.08; // Hydraulically elevated onto forks!
      positionHitchedPallet();
      hitchStatusCard.style.display = 'flex';
      hitchPalletName.textContent = pallet.data.name;
      jackBattery = Math.max(5, jackBattery - 0.2);
      if (SoundSystem.playHitchSound) SoundSystem.playHitchSound();
      SoundSystem.playHydraulicLift();
      showNotification(`⚡ Hitched ${pallet.data.po}: ${pallet.data.name} (Forks raised)`);
    }

    function dropPallet() {
      const pallet = player.hitchedPallet;
      if (!pallet) return;

      const grid = worldToGrid(pallet.position.x, pallet.position.z);
      const tileType = getTileType(grid.col, grid.row);

      if (tileType === 'Y') {
        showAlert('🚫 BLOCKED TRANSIT LANE! Pallets cannot be dropped on yellow transit tiles.');
        return;
      }

      if (tileType === 'W' || tileType === 'H') {
        showAlert('🚫 NO STAGING ZONE: Pallets cannot be staged on red grid tiles or walls!');
        return;
      }

      pallet.isHitched = false;
      player.hitchedPallet = null;
      pallet.position.y = 0; // Lower back to ground level
      pallet.mesh.position.y = 0;
      hitchStatusCard.style.display = 'none';
      SoundSystem.playHydraulicLower();

      if (tileType === pallet.data.targetZone) {
        pallet.data.status = 'STAGED_CORRECT';
        SoundSystem.playSuccessChime();
        let zoneName = 'Main Dock Ambient Staging';
        if (tileType === 'F') zoneName = 'Freezer (0°F) Staging';
        else if (tileType === 'C') zoneName = 'Cooler (36°F) Staging';
        showNotification(`✅ PERFECT! ${pallet.data.po} correctly staged in ${zoneName}`);
        if (window.WarehouseTrucks && typeof window.WarehouseTrucks.onPalletStaged === 'function') {
          window.WarehouseTrucks.onPalletStaged(pallet);
        }
      } else if (tileType === 'T') {
        pallet.data.status = 'UNLOADED';
        showNotification(`📦 Pallet ${pallet.data.po} returned to trailer`);
      } else {
        pallet.data.status = 'MISPLACED';
        SoundSystem.playErrorBuzzer();
        let correctZone = 'Main Dock';
        if (pallet.data.targetZone === 'F') correctZone = 'Freezer [Dark Blue]';
        else if (pallet.data.targetZone === 'C') correctZone = 'Cooler [Light Blue]';
        showAlert(`⚠️ MISPLACED! ${pallet.data.name} must be staged in ${correctZone}!`);
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

    function openScanner(openOpts) {
      if (uiState.bolModalOpen) return;
      if (isCarryingBackstockCase()) {
        showAlert('⚠️ Hands occupied carrying a case! Place the case on steel before opening the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingRecallTote() || isArrangingRecallItem()) {
        showAlert('⚠️ Hands occupied with Recall work! Set the small gray tote on the Recall Cart bottom shelf before opening the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (isHoldingClaimsItem()) {
        showAlert('⚠️ Hands occupied carrying a damaged item! Place it in a receptacle before opening the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (player.hasElectricJack) {
        showAlert('⚠️ Hands occupied operating Electric Jack! Drop/park the jack [Space] before using the Hand Scanner.');
        SoundSystem.playErrorBuzzer();
        return;
      }
      if (uiState.terminalModalOpen) {
        closeTerminal(true);
      }
      const targetScannerScreen = resolveScannerOpenContext(openOpts);
      const claimsTargetInfo = (targetScannerScreen === 'damage') ? getHoveredClaimsScannerTarget() : null;
      const hoveredClaimsItemPrefill = (claimsTargetInfo && claimsTargetInfo.item && !claimsTargetInfo.item.claimed) ? claimsTargetInfo.item : null;
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
      if (hoveredClaimsItemPrefill && window.DSDReceipts && typeof window.DSDReceipts.scanClaimsItem === 'function') {
        window.DSDReceipts.scanClaimsItem(hoveredClaimsItemPrefill);
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
      SoundSystem.playScanBeep();
      updateScannerDisplay(false);
    }

    function closeScanner(silent) {
      if (!uiState.scannerModalOpen) return;
      uiState.scannerModalOpen = false;
      player.scannerActive = false;
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
      syncCrtMonitorDisplay();
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
          showNotification(`🏆 SHIFT RECEIVING COMPLETE!\n\nWarehouse Trucks: ${whDone}/${whRows.length} auto-posted.\nDSD Deliveries: ${dsdDone}/${dsdRows.length} signed.\n\nUse File Cabinet / End Shift to inspect full ledger!`, 'low');
        } else {
          SoundSystem.playErrorBuzzer();
          showAlert(`⚠️ SHIFT RECEIVING IN PROGRESS\n\nWarehouse Trucks Completed: ${whDone}/${whRows.length}\nDSD Side-Door / Vendor Trucks Completed: ${dsdDone}/${dsdRows.length}\n\nClear waiting bays & finish scheduled arrivals before shift end.`);
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

          showNotification('🚀 PHASE 2 ACTIVE: Scan each staged pallet with Hand Scanner [F] to verify items & temp specs!');
          alert('🎉 PHASE 1 DOCK & STAGING COMPLETE!\n\nAll 7 inbound pallets are staged in their correct temperature zones.\n\n▶ PHASE 2 INITIATED: AUDIT & PIECE VERIFICATION\nEquip your Hand Scanner [F], walk over to each staged pallet in the Cooler, Freezer, and Ambient Dock, and press [SCAN] to audit the 27 cases per pallet.');
        } else {
          SoundSystem.playErrorBuzzer();
          alert(`⚠️ RECEIVING INCOMPLETE\n\nOnly ${correct} of ${pallets.length} pallets properly staged. Check trailers, stage in designated bays, and ensure yellow transit corridors remain unblocked.`);
        }
      } else if (gamePhase === 2) {
        const audited = pallets.filter(p => p.data.status === 'AUDITED').length;
        if (audited >= pallets.length) {
          SoundSystem.playSuccessChime();
          alert('🏆 SHIFT COMPLETE — 100% AUDIT ACCURACY!\n\nAll 7 inbound pallets (189 total cases) verified, barcode-certified, and temp-compliant!\n\nElectronic ASN & Bill of Lading transmitted to Central ERP.\n\nOutstanding work, Lead Receiver!');
        } else {
          SoundSystem.playErrorBuzzer();
          alert(`⚠️ AUDIT INCOMPLETE\n\nOnly ${audited} of ${pallets.length} pallets audited. Use your Hand Scanner [F] to inspect and scan the remaining ${pallets.length - audited} pallets.`);
        }
      }
    }

    // ==========================================
    // GRID COLLISION DETECTION
    // Trailer access allowed if trailer present;
    // Side Rollup Door EXIT strictly blocked for player!
    // ==========================================
    function checkCollision(newX, newZ) {
      const r = player.radius;

      const minWorldX = ORIGIN_X + 0.1;
      const maxWorldX = -ORIGIN_X - 0.1;
      const minWorldZ = ORIGIN_Z + 0.1;
      const maxWorldZ = ORIGIN_Z + ROWS * TILE_SIZE - 0.1;

      // RULE: Player CANNOT exit through the side rollup door under any circumstances!
      // Only vendors may walk in and out of it.
      if (newX + r > maxWorldX) {
        const atSideDoorZ = Math.abs(newZ - sideRollupDoor.worldZ) < (sideRollupDoor.width / 2);
        if (atSideDoorZ && sideRollupDoor.isOpen) {
          showNotification('⚠️ VENDORS ONLY: Receiving staff must remain on the dock.');
        }
        return true;
      }
      if (newX - r < minWorldX) return true;
      if (newZ - r < minWorldZ || newZ + r > maxWorldZ) return true;

      // RULE: Dock rollup doors + Trailer roll-up doors:
      // Player can enter a trailer ONLY if both the dock door AND the trailer's own roll-up door are open!
      for (let i = 0; i < dockDoors.length; i++) {
        const dd = dockDoors[i];
        const doorMinX = dd.worldX - doorWidth / 2;
        const doorMaxX = dd.worldX + doorWidth / 2;

        if (!dd.isOpen || dd.currentProgress < 0.7) {
          if (newX >= doorMinX && newX <= doorMaxX && Math.abs(newZ - doorZ) < 0.35 + r) {
            return true;
          }
        } else if (!dd.hasTrailer) {
          if (newX >= doorMinX && newX <= doorMaxX && newZ < doorZ + r && newZ > doorZ - 0.5) {
            return true;
          }
        } else if (dd.trailerDoorProgress < 0.70) {
          if (newX >= doorMinX && newX <= doorMaxX && newZ < (doorZ - 0.45) + r + 0.12 && newZ > doorZ - 1.2) {
            showNotification(`🔒 Bay ${dd.id} trailer door sealed! Let driver inside building to open trailer.`);
            return true;
          }
        }
      }

      // Inside an active docked trailer (Z < doorZ): enforce open trailer door, sidewalls & nose bulkhead
      if (newZ < doorZ - 0.45) {
        const insideBay = dockDoors.find((dd) => dd.hasTrailer && dd.trailerDoorProgress >= 0.70 && player.position.x >= dd.worldX - TILE_SIZE && player.position.x <= dd.worldX + TILE_SIZE);
        if (insideBay) {
          const trailerRows = (insideBay.trailerType === 'vendor_truck') ? 6 : 10;
          const minTrailerZ = doorZ - trailerRows * TILE_SIZE + 0.14;
          if (
            newX - r < insideBay.worldX - TILE_SIZE + 0.14 ||
            newX + r > insideBay.worldX + TILE_SIZE - 0.14 ||
            newZ - r < minTrailerZ
          ) {
            return true;
          }
        } else {
          return true;
        }
      }

      // Check solid red walls, dock steel columns, and bollards
      for (let i = 0; i < solidWalls.length; i++) {
        const b = solidWalls[i];
        if (newX + r > b.minX && newX - r < b.maxX &&
          newZ + r > b.minZ && newZ - r < b.maxZ) {
          return true;
        }
      }

      // Check parked Electric Pallet Jack (battery body + forks in local oriented space)
      if (!player.hasElectricJack && electricJackWorld.visible) {
        const rot = electricJackWorld.rotation.y || 0;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const dx = newX - electricJackWorld.position.x;
        const dz = newZ - electricJackWorld.position.z;
        const lx = dx * cosR - dz * sinR;
        const lz = dx * sinR + dz * cosR;
        const hitBody = (lx + r > -0.36 && lx - r < 0.36 && lz + r > -0.28 && lz - r < 0.28);
        const hitForks = (lx + r > -0.28 && lx - r < 0.28 && lz + r > -1.42 && lz - r < -0.28);
        if (hitBody || hitForks) {
          return true;
        }
      }

      return false;
    }

    // --- PLAYER & PALLET UPDATE LOOP ---
    const VIEWMODEL_BASE_Y = -0.32;
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
        if (!wasAudioPaused && SoundSystem && typeof SoundSystem.stopAmbientLoops === 'function') {
          SoundSystem.stopAmbientLoops();
        }
        wasAudioPaused = true;
        return;
      }
      wasAudioPaused = false;

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

      const currentSpeed = player.hitchedPallet ? (player.speed * 0.75) : player.speed;

      if (inputLen > 0.01) {
        const sinYaw = Math.sin(player.yaw);
        const cosYaw = Math.cos(player.yaw);

        const moveX = (-sinYaw * forwardInput + cosYaw * strafeInput) * currentSpeed * dt;
        const moveZ = (-cosYaw * forwardInput - sinYaw * strafeInput) * currentSpeed * dt;

        const testX = player.position.x + moveX;
        if (!checkCollision(testX, player.position.z)) {
          player.position.x = testX;
        }

        const testZ = player.position.z + moveZ;
        if (!checkCollision(player.position.x, testZ)) {
          player.position.z = testZ;
        }
      }

      if (player.hasElectricJack) {
        const drainPerSec = inputLen > 0.01
          ? (player.hitchedPallet ? 0.063 : 0.043)
          : 0.008;
        jackBattery = Math.max(5, jackBattery - drainPerSec * dt);

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

      positionHitchedPallet();

      camera.position.copy(player.position);
      if (playerEuler) {
        playerEuler.set(player.pitch, player.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(playerEuler);
      } else {
        const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);
      }
    }

    // --- MINIMAP RENDERING ---
    let minimapBgCanvas = null;
    let minimapBgKey = '';
    let lastMinimapDrawMs = -1;
    let lastDoorLightsSyncMs = -1;
    let lastHudSyncMs = -1;
    let lastCanvasCursor = '';
    const playerEuler = (typeof THREE.Euler === 'function') ? new THREE.Euler(0, 0, 0, 'YXZ') : null;

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
          if (r < 10) {
            bgCtx.fillStyle = '#0f172a';
            bgCtx.fillRect(c * cellW, r * cellH, cellW, cellH);
            continue;
          }

          let color = '#838a95';
          if (type === 'W' || type === 'H') color = '#dc2626';
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

    function renderMinimap() {
      const cw = minimapCanvas.width;
      const ch = minimapCanvas.height;
      const cellW = cw / COLS;
      const cellH = ch / ROWS;

      if (!minimapBgCanvas || minimapBgKey !== `${cw}x${ch}`) {
        buildMinimapStaticBg(cw, ch);
      }

      minimapCtx.clearRect(0, 0, cw, ch);
      if (minimapBgCanvas) {
        minimapCtx.drawImage(minimapBgCanvas, 0, 0);
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
          minimapCtx.fillStyle = '#9c6644';
          minimapCtx.fillRect(rx, ry, rw, rh);
          minimapCtx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
          minimapCtx.lineWidth = 0.5;
          for (let r = startRow; r < 10; r++) {
            for (let c = dd.colStart; c <= dd.colEnd; c++) {
              minimapCtx.strokeRect(c * cellW, r * cellH, cellW, cellH);
            }
          }
          minimapCtx.strokeStyle = '#cbd5e1';
          minimapCtx.lineWidth = 1;
          minimapCtx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
        }
      });

      // Draw dock doors with live beacon status matching 2D DSD tutorial signals
      dockDoors.forEach(dd => {
        const x1 = dd.colStart * cellW;
        const w = 2 * cellW;
        const y = 10 * cellH - 1.5;
        minimapCtx.fillStyle = dd.beaconColor || (dd.isOpen ? '#f59e0b' : '#22c55e');
        minimapCtx.fillRect(x1, y, w, 3.5);
      });

      // Draw Side Rollup Door on East Wall (Row 14.5, Col 10) with live beacon status
      const sdy = 13.5 * cellH;
      const sdx = 11 * cellW - 3.5;
      minimapCtx.fillStyle = sideRollupDoor.beaconColor || (sideRollupDoor.isOpen ? '#f59e0b' : '#22c55e');
      minimapCtx.fillRect(sdx, sdy - 4.5, 3.5, 9);

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
          minimapCtx.fillStyle = 'rgba(180, 130, 70, 0.85)';
          minimapCtx.fillRect(ox, oz, Math.max(2, ow), Math.max(2, oh));
          minimapCtx.strokeStyle = op.accentCss || '#f59e0b';
          minimapCtx.lineWidth = 1;
          minimapCtx.strokeRect(ox, oz, Math.max(2, ow), Math.max(2, oh));
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
        minimapCtx.fillStyle = '#94a3b8';
        minimapCtx.fillRect(rx, rz, Math.max(2, rw), Math.max(3, rh));
        minimapCtx.strokeStyle = '#f59e0b';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(rx, rz, Math.max(2, rw), Math.max(3, rh));
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

        minimapCtx.fillStyle = pCol;
        minimapCtx.fillRect(mx - 2.5, my - 2.5, 5, 5);
        minimapCtx.strokeStyle = '#000';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(mx - 2.5, my - 2.5, 5, 5);
      });

      // Draw parked electric jack on minimap
      if (!player.hasElectricJack && electricJackWorld.visible) {
        const normJx = (electricJackWorld.position.x - ORIGIN_X) / (COLS * TILE_SIZE);
        const normJz = (electricJackWorld.position.z - ORIGIN_Z) / (ROWS * TILE_SIZE);
        const jx = normJx * cw;
        const jy = normJz * ch;
        minimapCtx.fillStyle = '#f59e0b';
        minimapCtx.fillRect(jx - 3.5, jy - 3.5, 7, 7);
        minimapCtx.strokeStyle = '#000000';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(jx - 3.5, jy - 3.5, 7, 7);
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

          minimapCtx.fillStyle = dCol;
          minimapCtx.beginPath();
          minimapCtx.arc(dmx, dmy, 3.8, 0, Math.PI * 2);
          minimapCtx.fill();
          minimapCtx.strokeStyle = '#000000';
          minimapCtx.lineWidth = 1;
          minimapCtx.stroke();
        }

        if (s.cart && s.cart.mesh && s.cart.mesh.parent) {
          const cPos = s.cart.mesh.position;
          const normCx = (cPos.x - ORIGIN_X) / (COLS * TILE_SIZE);
          const normCz = (cPos.z - ORIGIN_Z) / (ROWS * TILE_SIZE);
          const cmx = normCx * cw;
          const cmy = normCz * ch;

          minimapCtx.fillStyle = '#f59e0b';
          minimapCtx.fillRect(cmx - 2.5, cmy - 3.5, 5, 7);
          minimapCtx.strokeStyle = '#000000';
          minimapCtx.lineWidth = 0.8;
          minimapCtx.strokeRect(cmx - 2.5, cmy - 3.5, 5, 7);
        }
      });

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

    const sdQueueTxtEl = document.getElementById('dlp-sd-queue-txt');
    const whDriverTagEl = document.getElementById('dlp-wh-driver-tag');
    let lastSdQueueCount = -1;
    let lastSdHasWh = null;

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

      if (sdQueueTxtEl || whDriverTagEl) {
        const waiting = (typeof DeliverySystem !== 'undefined' && DeliverySystem && typeof DeliverySystem.getWaitingOutsideSessions === 'function')
          ? DeliverySystem.getWaitingOutsideSessions()
          : [];
        const count = waiting.length;
        const hasWh = waiting.some((s) => s && s.delivery && s.delivery.type === 'warehouse');
        if (sdQueueTxtEl && lastSdQueueCount !== count) {
          lastSdQueueCount = count;
          sdQueueTxtEl.textContent = String(count);
        }
        if (whDriverTagEl && lastSdHasWh !== hasWh) {
          lastSdHasWh = hasWh;
          whDriverTagEl.classList.toggle('active', hasWh);
        }
      }
    }

    // --- Main Animation Loop ---
    let lastTime = performance.now();

    function animate(now) {
      requestAnimationFrame(animate);

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
        if (typeof hallwayTimeclock !== 'undefined') hallwayTimeclock.setTime(clockSnap.hour, clockSnap.minute);
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
      if (player.scannerActive) updateScannerDisplay();
      if (!lastDoorLightsSyncMs || lastDoorLightsSyncMs < 0 || (now - lastDoorLightsSyncMs) >= 80) {
        lastDoorLightsSyncMs = now;
        renderDoorLightsPanel();
      }
      if (!lastMinimapDrawMs || lastMinimapDrawMs < 0 || (now - lastMinimapDrawMs) >= 50) {
        lastMinimapDrawMs = now;
        renderMinimap();
      }
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
          showAlert(`🚨 PRODUCT RECALL ALERT\n\n"${rec.productName}" has been recalled!\n1. Inspect & rearrange units on the Recall Cart top shelf to count them.\n2. Pick up the small gray tote on the bottom shelf & collect each unit into it.\n3. Dump in ${rec.correctBinLabel}, then submit your counted total on Computer Terminal [4].`);
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

    function resetAllForFreshCampaign() {
      DeliverySystem.cancelPendingArrivals();
      DeliverySystem.clearAllSessions();
      closeScanner();
      closeInvoice();
      closeWarehouseBol();
      closeTerminal();
      closeDoorQueueModal(true);

      if (window.ShiftClock) window.ShiftClock.init();
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
      player.position.set(0, 1.65, ORIGIN_Z + 13 * TILE_SIZE);
      player.yaw = 0;
      player.pitch = 0;
      player.hitchedPallet = null;
      player.hasElectricJack = false;
      if (hitchStatusCard) hitchStatusCard.style.display = 'none';

      jackBattery = 100;
      jackDockedAtCharger = true;
      electricJackViewmodel.visible = false;
      electricJackWorld.position.set(JACK_HOME_POS.x, 0, JACK_HOME_POS.z);
      electricJackWorld.rotation.y = JACK_HOME_POS.yaw;
      electricJackWorld.visible = true;
      syncElectricJackBatteryVisuals(undefined, true);

      if (window.WarehouseTrucks) {
        window.WarehouseTrucks.resetForShift();
        DELIVERY_MANIFEST.length = 0;
        DELIVERY_MANIFEST.push(...window.WarehouseTrucks.getNonWarehouseQueue());
      }
      if (window.DSDReceipts) {
        window.DSDReceipts.init({ preserveNone: false });
      }
      if (window.BackstockRacks) {
        window.BackstockRacks.resetForShift();
      }
      if (window.ClaimsTotes) {
        window.ClaimsTotes.resetForShift();
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

      const ej = data.electricJack || {};
      jackBattery = Number.isFinite(Number(ej.battery)) ? Number(ej.battery) : 100;
      jackDockedAtCharger = ej.dockedAtCharger !== undefined ? Boolean(ej.dockedAtCharger) : true;
      electricJackWorld.position.set(
        Number.isFinite(Number(ej.x)) ? Number(ej.x) : JACK_HOME_POS.x,
        Number.isFinite(Number(ej.y)) ? Number(ej.y) : 0,
        Number.isFinite(Number(ej.z)) ? Number(ej.z) : JACK_HOME_POS.z
      );
      electricJackWorld.rotation.y = Number.isFinite(Number(ej.yaw)) ? Number(ej.yaw) : JACK_HOME_POS.yaw;
      electricJackWorld.visible = !player.hasElectricJack;
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
        onMenuStateChange: (menuFlags) => {
          const anyOverlay = Boolean(menuFlags && (menuFlags.mainMenuOpen || menuFlags.systemMenuOpen || menuFlags.saveLoadModalOpen || menuFlags.infoModalOpen || menuFlags.shiftSummaryOpen));
          container.classList.toggle('main-menu-open', Boolean(menuFlags && menuFlags.mainMenuOpen));
          container.classList.toggle('system-menu-open', Boolean(menuFlags && (menuFlags.systemMenuOpen || menuFlags.saveLoadModalOpen || menuFlags.infoModalOpen)));
          if (anyOverlay && document.exitPointerLock) {
            try { document.exitPointerLock(); } catch (_) { }
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
          player.hitchedPallet = null;
          player.hasElectricJack = false;
          jackBattery = 100;
          jackDockedAtCharger = true;
          electricJackViewmodel.visible = false;
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
          if (nextShiftSupplyOrders.length > 0) {
            const totalSupCases = nextShiftSupplyOrders.reduce((s, it) => s + Math.max(0, Number(it.cases || it.qty) || 0), 0);
            showNotification(`🚚 Vendor #601 Dept 60 supply delivery (${totalSupCases} case${totalSupCases === 1 ? '' : 's'}) scheduled today!`);
          }
          if (supplyUsageReport && Array.isArray(supplyUsageReport.outOfStock) && supplyUsageReport.outOfStock.length > 0) {
            const missingNames = supplyUsageReport.outOfStock.slice(0, 3).map((s) => s.name).join(', ');
            const extraMore = supplyUsageReport.outOfStock.length > 3 ? ` +${supplyUsageReport.outOfStock.length - 3} more` : '';
            const pts = supplyUsageReport.outOfStock.length * 200;
            showAlert(`⚠️ SUPPLY OUT OF STOCK (-${pts} pts): ${missingNames}${extraMore}. Order Dept 60 on Scanner #2!`);
          } else if (supplyUsageReport && Array.isArray(supplyUsageReport.nowEmptySkus) && supplyUsageReport.nowEmptySkus.length > 0) {
            const emptyNames = supplyUsageReport.nowEmptySkus.slice(0, 3).map((s) => s.name).join(', ');
            const extraMore = supplyUsageReport.nowEmptySkus.length > 3 ? ` +${supplyUsageReport.nowEmptySkus.length - 3} more` : '';
            showNotification(`⚠️ Dept 60 depleted today: ${emptyNames}${extraMore}. Order on Scanner #2 before next shift!`);
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
          syncCrtMonitorDisplay();
        },
        onReceiptUpdated: (d, opts) => {
          syncDeliveryBoxesVisuals(d);
          if (opts && opts.switchInvoiceTab && d) {
            uiState.currentInvoiceTab = opts.switchInvoiceTab;
          }
          if (uiState.invoiceModalOpen && d) {
            renderInvoiceDocument(d, uiState.currentInvoiceTab || 'invoice');
          }
          syncCrtMonitorDisplay();
        },
        onReceiptPrinted: () => {
          if (typeof triggerPrinterPrint === 'function') triggerPrinterPrint();
          if (SoundSystem.playPrinterPrint) SoundSystem.playPrinterPrint();
          else if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          DeliverySystem.updateDeliveryHud();
          syncCrtMonitorDisplay();
        },
        onReceiptCollected: () => {
          if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          DeliverySystem.updateDeliveryHud();
          syncCrtMonitorDisplay();
        },
        onReceiptDiscarded: () => {
          if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          DeliverySystem.updateDeliveryHud();
        },
        onReceiptHanded: (res) => {
          if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
          if (res && res.complete && SoundSystem.playSuccessChime) SoundSystem.playSuccessChime();
          DeliverySystem.updateDeliveryHud();
          syncCrtMonitorDisplay();
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
          syncCrtMonitorDisplay();
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
        showAlert: showAlert
      });
    }

    if (window.ShiftClock && typeof window.ShiftClock.on === 'function') {
      window.ShiftClock.on('onMinuteTick', (snap) => {
        renderPendingDeliveriesPanel();
        DeliverySystem.tryStartNextScheduledVendor(snap);
        if (window.DSDReceipts && typeof window.DSDReceipts.updateTerminalClock === 'function') {
          window.DSDReceipts.updateTerminalClock(snap);
        }
        syncCrtMonitorDisplay(snap);
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
          showNotification('📂 Shift progress loaded!', 3200);
        }
      });
    }

    if (window.DSDMenuUI && typeof window.DSDMenuUI.init === 'function') {
      window.DSDMenuUI.init();
    }
    container.classList.toggle('main-menu-open', Boolean(window.DSDGame && window.DSDGame.isMainMenuOpen && window.DSDGame.isMainMenuOpen()));
    syncCrtMonitorDisplay();

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
