(function (global) {
  'use strict';

  function createController(ctx) {
    const { scene, camera, world, hooks } = ctx;
    const { interactibles, matSteel } = world;
    const { ORIGIN_X, gridToWorld } = global.WarehouseWorld;
    const {
      createWoodGrainTexture,
      createCardboardBoxTexture,
      createElectricJackDecalTexture,
      createCartTexture,
      createKgsCapTexture,
      createDriverBadgeTexture,
      createDriverFaceTexture
    } = global.WarehouseTextures;
    const takeElectricJack = hooks.onTakeElectricJack || (() => { });

    // --- PALLET DEFINITIONS & 3D MODELS ---
    const PALLET_DATA = [
      {
        id: 'P1',
        truck: 1,
        po: '#4091',
        name: 'Frozen Seafood & Meals',
        targetZone: 'F',
        expectedTemp: '-4Ã‚Â°F to 0Ã‚Â°F',
        actualTemp: '-2.4Ã‚Â°F',
        colorHex: '#0284c7',
        startCol: 0.5,
        startRow: 3.5,
        status: 'UNLOADED'
      },
      {
        id: 'P2',
        truck: 1,
        po: '#4092',
        name: 'Premium Ice Cream Tubs',
        targetZone: 'F',
        expectedTemp: '-10Ã‚Â°F to -2Ã‚Â°F',
        actualTemp: '-6.1Ã‚Â°F',
        colorHex: '#0369a1',
        startCol: 0.5,
        startRow: 7.0,
        status: 'UNLOADED'
      },
      {
        id: 'P3',
        truck: 2,
        po: '#3884',
        name: 'Organic Milk & Dairy',
        targetZone: 'C',
        expectedTemp: '34Ã‚Â°F to 38Ã‚Â°F',
        actualTemp: '35.8Ã‚Â°F',
        colorHex: '#38bdf8',
        startCol: 3.5,
        startRow: 3.5,
        status: 'UNLOADED'
      },
      {
        id: 'P4',
        truck: 2,
        po: '#3885',
        name: 'Fresh Deli Cold Cuts',
        targetZone: 'C',
        expectedTemp: '33Ã‚Â°F to 37Ã‚Â°F',
        actualTemp: '34.6Ã‚Â°F',
        colorHex: '#0284c7',
        startCol: 3.5,
        startRow: 7.0,
        status: 'UNLOADED'
      },
      {
        id: 'P5',
        truck: 3,
        po: '#5102',
        name: 'Canned Soups & Beans',
        targetZone: 'D',
        expectedTemp: 'Ambient 60Ã‚Â°-72Ã‚Â°F',
        actualTemp: '67.0Ã‚Â°F',
        colorHex: '#78716c',
        startCol: 6.5,
        startRow: 4.0,
        status: 'UNLOADED'
      },
      {
        id: 'P6',
        truck: 3,
        po: '#5103',
        name: 'Paper Towels & Tissue',
        targetZone: 'D',
        expectedTemp: 'Ambient 60Ã‚Â°-72Ã‚Â°F',
        actualTemp: '68.2Ã‚Â°F',
        colorHex: '#a8a29e',
        startCol: 6.5,
        startRow: 7.5,
        status: 'UNLOADED'
      },
      {
        id: 'P7',
        truck: 4,
        po: '#5104',
        name: 'Breakfast Cereals & Bars',
        targetZone: 'D',
        expectedTemp: 'Ambient 60Ã‚Â°-72Ã‚Â°F',
        actualTemp: '66.5Ã‚Â°F',
        colorHex: '#d97706',
        startCol: 9.5,
        startRow: 5.5,
        status: 'UNLOADED'
      }
    ];

    const pallets = [];

    function computeGroupedStackPlacements(boxList, maxHeight, reserveCenterForFullOnly) {
      const safeMaxH = Math.max(1, maxHeight || 3);
      const groups = [];
      const groupByCode = new Map();
      (boxList || []).forEach((box) => {
        const key = String(box.code || '');
        let grp = groupByCode.get(key);
        if (!grp) {
          grp = { code: key, boxes: [] };
          groupByCode.set(key, grp);
          groups.push(grp);
        }
        grp.boxes.push(box);
      });

      // Split each UPC group into vertical stacks up to safeMaxH tall
      const stacks = [];
      groups.forEach((grp, gIdx) => {
        for (let i = 0; i < grp.boxes.length; i += safeMaxH) {
          stacks.push({
            groupIdx: gIdx,
            boxes: grp.boxes.slice(i, i + safeMaxH)
          });
        }
      });

      // Neighbor expansion order starting from opposite corners: Top-Left, Bottom-Right, Top-Right, Bottom-Left
      const cornerOrders = [
        [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [1, 2], [2, 1], [2, 2], [1, 1]],
        [[2, 2], [1, 2], [2, 1], [0, 2], [2, 0], [1, 0], [0, 1], [0, 0], [1, 1]],
        [[2, 0], [1, 0], [2, 1], [0, 0], [2, 2], [1, 2], [0, 1], [0, 2], [1, 1]],
        [[0, 2], [1, 2], [0, 1], [2, 2], [0, 0], [1, 0], [2, 1], [2, 0], [1, 1]]
      ];
      const slotKey = (c, r) => `${c},${r}`;
      const usedSlots = new Set();

      // If reserveCenterForFullOnly is set, keep center (1,1) unused unless needed for a full stack
      if (reserveCenterForFullOnly) {
        const outerNeeded = stacks.length;
        if (outerNeeded <= 8) {
          usedSlots.add(slotKey(1, 1));
        } else {
          let fullCenterIdx = stacks.findIndex(
            (st) => st.boxes.length >= safeMaxH && stacks.filter((s) => s.groupIdx === st.groupIdx).length > 1
          );
          if (fullCenterIdx === -1) {
            fullCenterIdx = stacks.findIndex((st) => st.boxes.length >= safeMaxH);
          }
          if (fullCenterIdx !== -1) {
            stacks[fullCenterIdx].slot = { col: 1, row: 1 };
            usedSlots.add(slotKey(1, 1));
          } else {
            usedSlots.add(slotKey(1, 1));
          }
        }
      }

      // Pass 1: Reserve each UPC group's corner anchor first (up to 4 groups) so corners aren't stolen
      for (let gIdx = 0; gIdx < groups.length && gIdx < cornerOrders.length; gIdx++) {
        const firstStack = stacks.find((st) => st.groupIdx === gIdx && !st.slot);
        if (!firstStack) continue;
        const order = cornerOrders[gIdx];
        for (let i = 0; i < order.length; i++) {
          const c = order[i][0];
          const r = order[i][1];
          const k = slotKey(c, r);
          if (!usedSlots.has(k)) {
            firstStack.slot = { col: c, row: r };
            usedSlots.add(k);
            break;
          }
        }
      }

      // Pass 2: Assign remaining stacks for each group to nearest unoccupied neighbor slot
      const extraLayerStacks = [];
      stacks.forEach((st) => {
        if (st.slot) return;
        const order = cornerOrders[st.groupIdx % cornerOrders.length];
        for (let i = 0; i < order.length; i++) {
          const c = order[i][0];
          const r = order[i][1];
          const k = slotKey(c, r);
          if (!usedSlots.has(k)) {
            st.slot = { col: c, row: r };
            usedSlots.add(k);
            return;
          }
        }
        extraLayerStacks.push(st);
      });

      const slotHeights = {};
      const placements = [];
      stacks.forEach((st) => {
        if (!st.slot) return;
        const k = slotKey(st.slot.col, st.slot.row);
        const baseH = slotHeights[k] || 0;
        st.boxes.forEach((box, idx) => {
          placements.push({
            box: box,
            col: st.slot.col,
            row: st.slot.row,
            layer: baseH + idx
          });
        });
        slotHeights[k] = baseH + st.boxes.length;
      });

      // Fallback only if more than 9 total stacks exist on a single surface
      extraLayerStacks.forEach((st, idx) => {
        const order = cornerOrders[st.groupIdx % cornerOrders.length];
        const fallbackCoord = order[idx % order.length];
        const k = slotKey(fallbackCoord[0], fallbackCoord[1]);
        const baseH = slotHeights[k] || 0;
        st.boxes.forEach((box, bIdx) => {
          placements.push({
            box: box,
            col: fallbackCoord[0],
            row: fallbackCoord[1],
            layer: baseH + bIdx
          });
        });
        slotHeights[k] = baseH + st.boxes.length;
      });

      return placements;
    }

    function createPallet3D(data) {
      const group = new THREE.Group();
      const startPos = gridToWorld(data.startCol, data.startRow);
      group.position.set(startPos.x, 0, startPos.z);

      const matWood = new THREE.MeshStandardMaterial({
        map: createWoodGrainTexture(),
        roughness: 0.85
      });

      // 1. GMA 48x40 Wooden Skid Structure
      // Top Planks: 2 lead boards (0.14m wide) + 5 interior planks (0.09m wide)
      const topPlankZ = [-0.44, -0.28, -0.14, 0, 0.14, 0.28, 0.44];
      topPlankZ.forEach((pz, idx) => {
        const pw = (idx === 0 || idx === 6) ? 0.14 : 0.09;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.022, pw), matWood);
        plank.position.set(0, 0.125, pz);
        group.add(plank);
      });

      // 3 Notched Stringer Runners (left, center, right)
      [-0.50, 0, 0.50].forEach(sx => {
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.095, 1.00), matWood);
        runner.position.set(sx, 0.065, 0);
        group.add(runner);
      });

      // Bottom Planks: 5 planks
      [-0.44, -0.22, 0, 0.22, 0.44].forEach(pz => {
        const bPlank = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.022, 0.09), matWood);
        bPlank.position.set(0, 0.011, pz);
        group.add(bPlank);
      });

      // 2. Cargo Stack:
      // - Vendor truck invoice pallets (data.physicalBoxes <= 9): open single-layer 3x3 grid of individually scannable cases (no shrink-wrap)
      // - Warehouse skids: 3x3x3 27-case shrink-wrapped pallet
      const topCaseMeshes = [];
      if (Array.isArray(data.physicalBoxes)) {
        const placements = computeGroupedStackPlacements(data.physicalBoxes, 4, true);
        const caseW = 0.30;
        const caseH = 0.28;
        const caseD = 0.28;
        const caseSpacing = 0.085;
        const texCache = {};

        placements.forEach(({ box: physBox, col, row, layer }) => {
          const boxQty = Number(physBox.unitsPerCase) || 0;
          const cacheKey = `${physBox.code}|${physBox.type}|${Boolean(physBox.notScannable)}|${boxQty}`;
          if (!texCache[cacheKey]) {
            texCache[cacheKey] = createCardboardBoxTexture(
              physBox.code,
              physBox.name,
              physBox.type,
              physBox.notScannable,
              boxQty
            );
          }
          const meshMat = new THREE.MeshStandardMaterial({
            map: texCache[cacheKey],
            roughness: 0.75
          });
          const box = new THREE.Mesh(new THREE.BoxGeometry(caseW, caseH, caseD), meshMat);
          const bx = (col - 1) * (caseW + caseSpacing);
          const by = 0.14 + layer * (caseH + 0.008) + caseH / 2;
          const bz = (row - 1) * (caseD + caseSpacing);
          box.position.set(bx, by, bz);
          box.userData.physicalBoxRef = physBox;
          box.userData.deliveryId = data.deliveryId || null;
          physBox.mesh = box;
          applyBoxScannedVisual(physBox);
          group.add(box);
          topCaseMeshes.push(box);
        });
      } else {
        const caseBaseTex = createCardboardBoxTexture(data.po, data.name, data.targetZone);
        const caseMat = new THREE.MeshStandardMaterial({
          map: caseBaseTex,
          roughness: 0.75
        });

        const caseW = 0.36;
        const caseH = 0.32;
        const caseD = 0.32;
        const caseSpacing = 0.02;

        for (let layer = 0; layer < 3; layer++) {
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              const isTopLayer = layer === 2;
              const meshMat = isTopLayer
                ? new THREE.MeshStandardMaterial({ map: caseBaseTex, roughness: 0.75 })
                : caseMat;
              const box = new THREE.Mesh(new THREE.BoxGeometry(caseW, caseH, caseD), meshMat);
              const bx = (col - 1) * (caseW + caseSpacing);
              const by = 0.14 + layer * caseH + caseH / 2;
              const bz = (row - 1) * (caseD + caseSpacing);
              box.position.set(bx, by, bz);
              group.add(box);
              if (isTopLayer) {
                topCaseMeshes.push(box);
              }
            }
          }
        }

        // Translucent Stretch Shrink-Wrap (warehouse pallets only)
        const wrapMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.1,
          metalness: 0.15,
          transparent: true,
          opacity: 0.22
        });
        const shrinkWrap = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.02, 1.06), wrapMat);
        shrinkWrap.position.set(0, 0.65, 0);
        group.add(shrinkWrap);
      }

      let ringColor = 0x64748b;
      if (data.targetZone === 'F') ringColor = 0x0284c7;
      else if (data.targetZone === 'C') ringColor = 0x38bdf8;
      else if (data.targetZone === 'D') ringColor = 0xf59e0b;

      const ringMat = new THREE.MeshBasicMaterial({ color: ringColor });
      const ring = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.025, 1.08), ringMat);
      ring.position.set(0, 0.14, 0);
      group.add(ring);

      scene.add(group);

      const palletHitbox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
      palletHitbox.position.set(0, 0.75, 0);
      group.add(palletHitbox);

      const palletObj = {
        data: data,
        mesh: group,
        position: group.position,
        topCaseMeshes: topCaseMeshes,
        isHitched: false
      };
      pallets.push(palletObj);

      const palletInteractible = {
        id: `pallet_${data.po}`,
        type: 'pallet',
        name: `Pallet ${data.po}`,
        target: palletObj,
        mesh: palletHitbox,
        get boxCenter() {
          return new THREE.Vector3(palletObj.position.x, 0.75, palletObj.position.z);
        },
        boxSize: new THREE.Vector3(1.36, 1.45, 1.36),
        getPrompt: () => `[Space] Lift & Hitch Pallet (${data.po}: ${data.name})`,
        interact: () => {
          if (hooks.onHitchPallet) hooks.onHitchPallet(palletObj);
        }
      };
      interactibles.push(palletInteractible);
      palletHitbox.userData.interactible = palletInteractible;
      palletObj.interactible = palletInteractible;
      return palletObj;
    }

    function removePallet3D(palletObj) {
      if (!palletObj) return;
      if (hooks.onClearHitchedPallet) hooks.onClearHitchedPallet(palletObj);
      if (palletObj.mesh) scene.remove(palletObj.mesh);
      const pIdx = pallets.indexOf(palletObj);
      if (pIdx !== -1) pallets.splice(pIdx, 1);
      if (palletObj.interactible) {
        const iIdx = interactibles.indexOf(palletObj.interactible);
        if (iIdx !== -1) interactibles.splice(iIdx, 1);
      }
    }

    // Dynamic Phase 3 pallets are spawned wave-by-wave via WarehouseTrucks.init()

    // --- ELECTRIC PALLET JACK (WALKIE) 3D MODELS ---
    const JACK_BATTERY_LED_SPECS = [
      { threshold: 10, onColor: 0xef4444, offColor: 0x3b1111, label: '10' },
      { threshold: 20, onColor: 0xfacc15, offColor: 0x3b300a, label: '20' },
      { threshold: 40, onColor: 0x22c55e, offColor: 0x0d2e18, label: '40' },
      { threshold: 80, onColor: 0x22c55e, offColor: 0x0d2e18, label: '80' },
      { threshold: 95, onColor: 0x22c55e, offColor: 0x0d2e18, label: '95' }
    ];

    let sharedJackGaugePlateTex = null;
    function getJackGaugePlateTexture() {
      if (sharedJackGaugePlateTex) return sharedJackGaugePlateTex;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, 252, 60);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BATTERY %', 128, 15);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px "Courier New", monospace';
      JACK_BATTERY_LED_SPECS.forEach((spec, idx) => {
        const x = 32 + idx * 48;
        ctx.fillText(spec.label, x, 56);
      });

      sharedJackGaugePlateTex = new THREE.CanvasTexture(canvas);
      return sharedJackGaugePlateTex;
    }

    function createJackBatteryGauge() {
      const group = new THREE.Group();
      const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.35 });
      const plateMat = new THREE.MeshBasicMaterial({ map: getJackGaugePlateTexture() });

      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.148, 0.012, 0.044), housingMat);
      group.add(housing);

      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.142, 0.040), plateMat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, 0.0065, 0);
      group.add(plate);

      const leds = [];
      JACK_BATTERY_LED_SPECS.forEach((spec, idx) => {
        const ledMat = new THREE.MeshBasicMaterial({ color: spec.onColor });
        const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.007, 0.013), ledMat);
        ledMesh.position.set(-0.052 + idx * 0.026, 0.009, -0.001);
        group.add(ledMesh);
        leds.push({ spec, mat: ledMat });
      });

      function update(batteryPct) {
        const rawPct = Number.isFinite(batteryPct) ? batteryPct : 100;
        for (let i = 0; i < leds.length; i++) {
          const item = leds[i];
          const isOn = rawPct > item.spec.threshold;
          const targetHex = isOn ? item.spec.onColor : item.spec.offColor;
          if (item.mat.color.getHex() !== targetHex) {
            item.mat.color.setHex(targetHex);
          }
        }
      }

      return { group, update };
    }

    function createJackMaterials() {
      return {
        matDark: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.55 }),
        matCharcoal: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8, metalness: 0.35 }),
        matSteel: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.48, metalness: 0.72 }),
        matChrome: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.90 }),
        matYellow: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.32 }),
        matYellowDark: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.55, metalness: 0.35 }),
        matHazard: new THREE.MeshStandardMaterial({ map: createElectricJackDecalTexture(), roughness: 0.5 }),
        matBellyRed: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
        matAmberBtn: new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
        matGrip: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.92, metalness: 0.1 })
      };
    }

    function buildJackTillerHead(mats, options) {
      const opts = options || {};
      const headGroup = new THREE.Group();

      // Central die-cast control pod & contoured amber top shroud
      const podCore = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.085, 0.14), mats.matDark);
      headGroup.add(podCore);

      const podCap = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.025, 0.125), mats.matYellow);
      podCap.position.set(0, 0.052, -0.005);
      headGroup.add(podCap);

      // Stepped neck collar connecting tiller shaft to pod
      const podNeck = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.10), mats.matSteel);
      podNeck.position.set(0, -0.055, -0.01);
      headGroup.add(podNeck);

      // Left & right closed-loop ergonomic handlebars + flared end guards
      [-1, 1].forEach((side) => {
        const barBar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 14), mats.matGrip);
        barBar.rotation.z = Math.PI / 2;
        barBar.position.set(side * 0.165, 0.005, 0.015);
        headGroup.add(barBar);

        const outerGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 14), mats.matGrip);
        outerGrip.rotation.x = Math.PI / 2;
        outerGrip.rotation.z = side * -0.14;
        outerGrip.position.set(side * 0.225, 0.005, 0.035);
        headGroup.add(outerGrip);

        // Protective wraparound loop bar from outer grip back to pod front
        const frontBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 10), mats.matDark);
        frontBrace.rotation.z = Math.PI / 2;
        frontBrace.rotation.y = side * 0.28;
        frontBrace.position.set(side * 0.16, 0.005, -0.052);
        headGroup.add(frontBrace);

        const gripEndCap = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.016, 14), mats.matDark);
        gripEndCap.rotation.x = Math.PI / 2;
        gripEndCap.position.set(side * 0.232, 0.005, 0.105);
        headGroup.add(gripEndCap);
      });

      // Dual butterfly thumb speed throttle wings
      [-0.085, 0.085].forEach((tx) => {
        const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.028, 0.044), mats.matYellow);
        paddle.position.set(tx, 0.042, 0.028);
        paddle.rotation.x = -0.18;
        headGroup.add(paddle);
      });

      // Center safety red Emergency Belly-Reverse Switch with collar
      const bellyCollar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.056, 0.025), mats.matCharcoal);
      bellyCollar.position.set(0, 0.01, 0.072);
      headGroup.add(bellyCollar);

      const bellyBtn = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.044, 0.042), mats.matBellyRed);
      bellyBtn.position.set(0, 0.01, 0.088);
      headGroup.add(bellyBtn);

      // Embedded 5-LED Battery Discharge Indicator
      const gauge = createJackBatteryGauge();
      gauge.group.position.set(0, 0.068, 0.022);
      gauge.group.rotation.x = opts.gaugeTilt !== undefined ? opts.gaugeTilt : 0.25;
      headGroup.add(gauge.group);

      return { group: headGroup, updateBatteryGauge: gauge.update };
    }

    function buildJackChassisGroup(mats, options) {
      const opts = options || {};
      const root = new THREE.Group();

      // 1. Undercarriage: Center Drive Tire + Rear Outrigger Stabilizer Casters
      const driveTire = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.11, 18), mats.matCharcoal);
      driveTire.rotation.z = Math.PI / 2;
      driveTire.position.set(0, 0.115, 0.04);
      root.add(driveTire);

      const driveHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.116, 12), mats.matSteel);
      driveHub.rotation.z = Math.PI / 2;
      driveHub.position.set(0, 0.115, 0.04);
      root.add(driveHub);

      [-0.25, 0.25].forEach((cx) => {
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.095), mats.matSteel);
        yoke.position.set(cx, 0.072, 0.12);
        root.add(yoke);

        const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.052, 12), mats.matCharcoal);
        caster.rotation.z = Math.PI / 2;
        caster.position.set(cx, 0.048, 0.12);
        root.add(caster);
      });

      // 2. Stepped Bumper Skirt & 45-deg Hazard Decal Apron
      const apronFrame = new THREE.Mesh(new THREE.BoxGeometry(0.73, 0.17, 0.54), mats.matDark);
      apronFrame.position.set(0, 0.11, -0.02);
      root.add(apronFrame);

      const hazardWrap = new THREE.Mesh(new THREE.BoxGeometry(0.742, 0.11, 0.552), mats.matHazard);
      hazardWrap.position.set(0, 0.105, -0.02);
      root.add(hazardWrap);

      // 3. Contoured Two-Tier Powerhead & Battery Bay
      const lowerCowling = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.34, 0.50), mats.matYellow);
      lowerCowling.position.set(0, 0.365, -0.02);
      root.add(lowerCowling);

      const upperShroud = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.44), mats.matYellow);
      upperShroud.position.set(0, 0.63, -0.03);
      root.add(upperShroud);

      // Recessed dark steel side ventilation & inspection panels
      [-0.343, 0.343].forEach((sx) => {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.24, 0.34), mats.matDark);
        panel.position.set(sx, 0.37, -0.02);
        root.add(panel);
      });

      // Front hydraulic motor housing recess
      const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.18, 0.03), mats.matDark);
      frontTrim.position.set(0, 0.28, -0.275);
      root.add(frontTrim);

      // Hinged battery compartment lid, latch, Anderson charge plug & E-stop
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.045, 0.42), mats.matDark);
      lid.position.set(0, 0.76, -0.03);
      root.add(lid);

      const lidLatch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.04), mats.matSteel);
      lidLatch.position.set(0, 0.785, 0.13);
      root.add(lidLatch);

      const emergCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.02, 12), mats.matYellowDark);
      emergCollar.position.set(-0.21, 0.785, 0.10);
      root.add(emergCollar);

      const emergKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.030, 0.045, 12), mats.matBellyRed);
      emergKnob.position.set(-0.21, 0.812, 0.10);
      root.add(emergKnob);

      const keySwitch = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.028, 10), mats.matChrome);
      keySwitch.position.set(0.20, 0.79, 0.10);
      root.add(keySwitch);

      const andersonPlug = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.038, 0.06), mats.matAmberBtn);
      andersonPlug.position.set(0.21, 0.775, -0.14);
      root.add(andersonPlug);

      // 4. Central Hydraulic Lift Cylinder & Extending Chrome Piston Ram
      const cylBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.36, 14), mats.matDark);
      cylBarrel.position.set(0, 0.38, -0.30);
      root.add(cylBarrel);

      const pistonRam = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 12), mats.matChrome);
      pistonRam.position.set(0, 0.56, -0.30);
      root.add(pistonRam);

      // 5. Articulated Lift Forks + Steel Load Backrest (`forksLiftGroup` raises on hitch)
      const forksLiftGroup = new THREE.Group();
      root.add(forksLiftGroup);

      // Fork heel carriage apron & gusset bar
      const carriagePlate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.14, 0.055), mats.matDark);
      carriagePlate.position.set(0, 0.13, -0.34);
      forksLiftGroup.add(carriagePlate);

      // Tubular Steel Load Backrest (compact low-profile so it clears level HUD view cleanly)
      [-0.27, 0.27].forEach((bx) => {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.50, 0.042), mats.matDark);
        upright.position.set(bx, 0.42, -0.34);
        forksLiftGroup.add(upright);
      });
      [0.42, 0.65].forEach((by) => {
        const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.038, 0.038), mats.matDark);
        crossBar.position.set(0, by, -0.34);
        forksLiftGroup.add(crossBar);
      });

      // Dual High-Tensile Steel Forks at x = ±0.24 (centered inside GMA pallet bays)
      [-0.24, 0.24].forEach((fx) => {
        // Fork heel knee reinforcement
        const heelKnee = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.095, 0.09), mats.matYellowDark);
        heelKnee.position.set(fx, 0.082, -0.38);
        forksLiftGroup.add(heelKnee);

        // Main horizontal fork blade (y = 0.034..0.078 lowered, clears inside GMA pallet deck)
        const forkBlade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.044, 1.08), mats.matYellow);
        forkBlade.position.set(fx, 0.056, -0.92);
        forksLiftGroup.add(forkBlade);

        // Center recessed rib detail on top of fork blade
        const forkSpine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 1.02), mats.matYellowDark);
        forkSpine.position.set(fx, 0.080, -0.92);
        forksLiftGroup.add(forkSpine);

        // Tapered chisel entry tip (z = -1.46..-1.54)
        const forkTip = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.022, 0.09), mats.matYellow);
        forkTip.rotation.x = 0.18;
        forkTip.position.set(fx, 0.042, -1.50);
        forksLiftGroup.add(forkTip);

        // Tandem polyurethane load rollers & axle
        const rollerBox = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.036, 0.14), mats.matDark);
        rollerBox.position.set(fx, 0.035, -1.32);
        forksLiftGroup.add(rollerBox);

        const loadRoller = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.105, 14), mats.matCharcoal);
        loadRoller.rotation.z = Math.PI / 2;
        loadRoller.position.set(fx, 0.032, -1.32);
        forksLiftGroup.add(loadRoller);
      });

      // 6. Rear Steer Drive Turret & Tilting Tiller Pivot Knuckle
      const steerTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.14, 14), mats.matDark);
      steerTurret.position.set(0, 0.22, 0.19);
      root.add(steerTurret);

      const tillerPivot = new THREE.Group();
      tillerPivot.position.set(0, 0.24, 0.17);
      root.add(tillerPivot);

      const pivotClevis = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.085), mats.matSteel);
      pivotClevis.position.set(0, 0.02, 0);
      tillerPivot.add(pivotClevis);

      const gasBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.16, 12), mats.matCharcoal);
      gasBoot.position.set(0, 0.09, 0);
      tillerPivot.add(gasBoot);

      let tillerHeadObj = null;
      if (opts.includeFullTiller) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.030, 0.92, 14), mats.matChrome);
        stem.position.set(0, 0.48, 0);
        tillerPivot.add(stem);

        tillerHeadObj = buildJackTillerHead(mats, { gaugeTilt: 0.30 });
        tillerHeadObj.group.position.set(0, 0.94, 0);
        tillerPivot.add(tillerHeadObj.group);
        tillerPivot.rotation.x = 0.18;
      } else {
        // Floor-locked active unit: lower stem stub reaching cleanly toward operator's HUD handle
        const lowerStub = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, 0.50, 14), mats.matChrome);
        lowerStub.position.set(0, 0.28, 0);
        tillerPivot.add(lowerStub);
        tillerPivot.rotation.x = 0.42;
      }

      root.setLifted = function (isLifted) {
        const lifted = Boolean(isLifted);
        forksLiftGroup.position.y = lifted ? 0.075 : 0;
        pistonRam.position.y = lifted ? 0.635 : 0.56;
      };

      root.setOperatingMode = function (isOperating) {
        if (opts.includeFullTiller) {
          tillerPivot.rotation.x = isOperating ? 0.36 : 0.18;
        }
      };

      root.updateBatteryGauge = tillerHeadObj ? tillerHeadObj.updateBatteryGauge : (() => { });
      root.forksLiftGroup = forksLiftGroup;
      root.tillerPivot = tillerPivot;
      return root;
    }

    function createElectricJackWorld() {
      const mats = createJackMaterials();
      const root = buildJackChassisGroup(mats, { includeFullTiller: true });
      root.position.set(-7.20, 0, 2.08); // Staged between Docks 1 & 2 clear of column & bollards
      root.rotation.y = 0; // Facing South into dock floor

      // Tight oriented hitbox matching powerhead + forks (-1.54..+0.30 Z, centered at -0.62)
      const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.28, 1.88), new THREE.MeshBasicMaterial({ visible: false }));
      hitbox.position.set(0, 0.64, -0.62);
      root.add(hitbox);

      root.hitbox = hitbox;
      return root;
    }

    function createElectricJackFloorUnit() {
      const mats = createJackMaterials();
      const root = buildJackChassisGroup(mats, { includeFullTiller: false });
      root.visible = false;
      return root;
    }

    function createElectricJackViewmodel() {
      const mats = createJackMaterials();
      const root = new THREE.Group();
      root.position.set(0, -0.34, -0.58);

      // Detailed HUD Tiller Control Pod, Grips & 5-LED Battery Gauge
      const head = buildJackTillerHead(mats, { gaugeTilt: 0.28 });
      root.add(head.group);
      root.updateBatteryGauge = head.updateBatteryGauge;

      // Upper Chrome Tiller Stem extending downward cleanly toward the floor-locked lower shaft
      const upperStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.46, 14), mats.matChrome);
      upperStem.rotation.x = 0.62;
      upperStem.position.set(0, -0.20, -0.13);
      root.add(upperStem);

      root.visible = false;
      return root;
    }

    const electricJackWorld = createElectricJackWorld();
    scene.add(electricJackWorld);

    const electricJackActiveFloor = createElectricJackFloorUnit();
    scene.add(electricJackActiveFloor);

    const electricJackViewmodel = createElectricJackViewmodel();
    scene.add(camera);
    camera.add(electricJackViewmodel);

    const electricJackInteractible = {
      id: 'electric_pallet_jack',
      type: 'electric_jack',
      name: 'Electric Pallet Jack',
      target: electricJackWorld,
      mesh: electricJackWorld.hitbox,
      get boxCenter() {
        const rot = electricJackWorld.rotation.y || 0;
        return new THREE.Vector3(
          electricJackWorld.position.x - Math.sin(rot) * 0.62,
          0.64,
          electricJackWorld.position.z - Math.cos(rot) * 0.62
        );
      },
      get boxQuaternion() {
        return electricJackWorld.quaternion.clone();
      },
      boxSize: new THREE.Vector3(0.84, 1.28, 1.88),
      getPrompt: () => '[Space] Take Electric Pallet Jack',
      interact: () => takeElectricJack()
    };
    interactibles.push(electricJackInteractible);
    electricJackWorld.hitbox.userData.interactible = electricJackInteractible;

    // ==========================================
    // 3D 4-WHEEL PLATFORM HAND CART (MOCKUP 2)
    // ==========================================
    function applyBoxScannedVisual(box) {
      if (!box || !box.mesh || !box.mesh.material) return;
      const mat = box.mesh.material;
      if (box.overageFlagged) {
        mat.color.setHex(0xf9a8d4);
        if (mat.emissive) {
          mat.emissive.setHex(0xdb2777);
          mat.emissiveIntensity = 0.65;
        }
      } else if (box.scanned) {
        mat.color.setHex(0x86efac);
        if (mat.emissive) {
          mat.emissive.setHex(0x16a34a);
          mat.emissiveIntensity = 0.48;
        }
      } else {
        mat.color.setHex(0xffffff);
        if (mat.emissive) {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    }

    function syncDeliveryBoxesVisuals(delivery) {
      if (!delivery) return;
      if (Array.isArray(delivery.physicalBoxes)) {
        delivery.physicalBoxes.forEach(applyBoxScannedVisual);
      }
      if (Array.isArray(delivery.creditBoxes)) {
        delivery.creditBoxes.forEach(applyBoxScannedVisual);
      }
    }

    function bindDeliveryBoxesToBayPallets(delivery) {
      if (!delivery || !delivery.dockBay) return;
      if (window.DSDReceipts) window.DSDReceipts.enrichDelivery(delivery);
      const list = delivery.physicalBoxes || [];
      // If createPallet3D already bound each physical box directly onto its invoice pallet mesh, preserve direct refs.
      const alreadyBound = list.length > 0 && list.every((box) => box && box.mesh);
      if (!alreadyBound) {
        const bayPallets = pallets.filter((p) =>
          p.data && (p.data.deliveryId ? p.data.deliveryId === delivery.id : p.data.truck === delivery.dockBay)
        );
        const candidateMeshes = [];
        bayPallets.forEach((p) => {
          if (Array.isArray(p.topCaseMeshes)) {
            p.topCaseMeshes.forEach((m) => candidateMeshes.push(m));
          }
        });
        const usedMeshes = new Set();
        const texCache = {};
        list.forEach((box, idx) => {
          let mesh = candidateMeshes.find((m) =>
            !usedMeshes.has(m) &&
            m.userData &&
            m.userData.physicalBoxRef &&
            box.boxId &&
            m.userData.physicalBoxRef.boxId === box.boxId
          );
          if (!mesh) {
            mesh = candidateMeshes.find((m) => !usedMeshes.has(m)) || candidateMeshes[idx % Math.max(1, candidateMeshes.length)];
          }
          if (!mesh) return;
          usedMeshes.add(mesh);
          const boxQty = Number(box.unitsPerCase) || 0;
          const cacheKey = `${box.code}|${box.type}|${Boolean(box.notScannable)}|${boxQty}`;
          if (!texCache[cacheKey]) {
            texCache[cacheKey] = createCardboardBoxTexture(
              box.code,
              box.name,
              box.type,
              box.notScannable,
              boxQty
            );
          }
          mesh.material.map = texCache[cacheKey];
          mesh.material.needsUpdate = true;
          mesh.userData.physicalBoxRef = box;
          mesh.userData.deliveryId = delivery.id;
          box.mesh = mesh;
        });
      }
      syncDeliveryBoxesVisuals(delivery);
    }

    function getActiveDeliveryBoxMeshes() {
      const meshes = [];
      const ds = hooks.getDeliverySystem ? hooks.getDeliverySystem() : null;
      const activeDels = (ds && typeof ds.getInsideDeliveries === 'function')
        ? ds.getInsideDeliveries()
        : (ds && ds.activeDelivery ? [ds.activeDelivery] : []);
      activeDels.forEach((d) => {
        if (!d) return;
        const collect = (arr) => {
          if (!Array.isArray(arr)) return;
          arr.forEach((b) => {
            if (b && b.mesh && meshes.indexOf(b.mesh) === -1) {
              b.mesh.userData.deliveryId = d.id;
              meshes.push(b.mesh);
            }
          });
        };
        collect(d.physicalBoxes);
        collect(d.creditBoxes);
      });
      return meshes;
    }

    function createCreditToteLabelTexture() {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 96;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fef2f2';
      ctx.fillRect(0, 0, 256, 96);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(0, 0, 256, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CREDIT RETURNS', 128, 16);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('SCAN [-] ITEMS', 128, 62);
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 92);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    }

    function populateCreditToteCartons(targetGroup, creditList, delivery, opts) {
      const {
        smallW = 0.15,
        smallH = 0.16,
        smallD = 0.15,
        cavityBaseY = 0.025,
        gridCols = 3,
        maxPerLayer = 6,
        frontBiasRow = false
      } = opts || {};

      const texCache = {};
      const boxMeshes = [];

      creditList.forEach((cBox, idx) => {
        const boxQty = Number(cBox.unitsPerCase) || 1;
        const cacheKey = `${cBox.code}|${cBox.type}|${Boolean(cBox.notScannable)}|${boxQty}`;
        if (!texCache[cacheKey]) {
          texCache[cacheKey] = createCardboardBoxTexture(
            cBox.code,
            cBox.name,
            cBox.type,
            cBox.notScannable,
            boxQty
          );
        }
        const mat = new THREE.MeshStandardMaterial({
          map: texCache[cacheKey],
          roughness: 0.78
        });
        const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(smallW, smallH, smallD), mat);
        const layer = Math.floor(idx / maxPerLayer);
        const inLayer = idx % maxPerLayer;
        const countOnThisLayer = Math.min(maxPerLayer, creditList.length - layer * maxPerLayer);
        let bx;
        let bz;
        if (frontBiasRow && countOnThisLayer <= gridCols) {
          bx = (inLayer - (countOnThisLayer - 1) / 2) * (smallW + 0.03);
          bz = -0.16;
        } else {
          const col = inLayer % gridCols;
          const row = Math.floor(inLayer / gridCols);
          const rowsPerLayer = Math.max(1, Math.ceil(maxPerLayer / gridCols));
          bx = (col - (gridCols - 1) / 2) * (smallW + 0.018);
          bz = (row - (rowsPerLayer - 1) / 2) * (smallD + 0.024);
        }
        const by = cavityBaseY + (layer * smallH) + (smallH / 2);
        boxMesh.position.set(bx, by, bz);
        boxMesh.userData.physicalBoxRef = cBox;
        boxMesh.userData.deliveryId = delivery ? delivery.id : null;
        cBox.mesh = boxMesh;
        applyBoxScannedVisual(cBox);
        targetGroup.add(boxMesh);
        boxMeshes.push(boxMesh);
      });

      return boxMeshes;
    }

    function createCreditTote3D(initialPos, delivery) {
      if (delivery && window.DSDReceipts) {
        window.DSDReceipts.enrichDelivery(delivery);
      }
      const creditList = (delivery && Array.isArray(delivery.creditBoxes)) ? delivery.creditBoxes : [];

      if (world && typeof world.createClaimsToteMesh === 'function') {
        const toteGroup = world.createClaimsToteMesh(true, { doubleSidedLabel: true });
        if (initialPos) toteGroup.position.copy(initialPos);
        const boxMeshes = populateCreditToteCartons(toteGroup, creditList, delivery, {
          smallW: 0.17,
          smallH: 0.19,
          smallD: 0.19,
          cavityBaseY: 0.025,
          gridCols: 3,
          maxPerLayer: 9
        });
        scene.add(toteGroup);
        return {
          mesh: toteGroup,
          boxes: boxMeshes
        };
      }

      const toteGroup = new THREE.Group();
      if (initialPos) toteGroup.position.copy(initialPos);

      const matTote = new THREE.MeshStandardMaterial({
        color: 0xb91c1c,
        roughness: 0.55,
        metalness: 0.15
      });
      const matToteRim = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.45,
        metalness: 0.2
      });
      const matToteDark = new THREE.MeshStandardMaterial({
        color: 0x7f1d1d,
        roughness: 0.7
      });

      const toteW = 0.58;
      const toteH = 0.22;
      const toteD = 0.42;
      const wallT = 0.025;
      const baseH = 0.025;
      const wallH = toteH - baseH;
      const wallCenterY = baseH + wallH / 2;

      // Bottom base & cavity floor
      const base = new THREE.Mesh(new THREE.BoxGeometry(toteW, baseH, toteD), matToteDark);
      base.position.set(0, baseH / 2, 0);
      toteGroup.add(base);

      // 4 open-top walls sitting cleanly atop base
      const frontWall = new THREE.Mesh(new THREE.BoxGeometry(toteW, wallH, wallT), matTote);
      frontWall.position.set(0, wallCenterY, toteD / 2 - wallT / 2);
      toteGroup.add(frontWall);

      const backWall = new THREE.Mesh(new THREE.BoxGeometry(toteW, wallH, wallT), matTote);
      backWall.position.set(0, wallCenterY, -toteD / 2 + wallT / 2);
      toteGroup.add(backWall);

      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, toteD - wallT * 2), matTote);
      leftWall.position.set(-toteW / 2 + wallT / 2, wallCenterY, 0);
      toteGroup.add(leftWall);

      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, toteD - wallT * 2), matTote);
      rightWall.position.set(toteW / 2 - wallT / 2, wallCenterY, 0);
      toteGroup.add(rightWall);

      // Molded top rim accents resting cleanly on top of walls
      const rimF = new THREE.Mesh(new THREE.BoxGeometry(toteW + 0.02, 0.022, 0.038), matToteRim);
      rimF.position.set(0, toteH + 0.011, toteD / 2 - wallT / 2);
      toteGroup.add(rimF);
      const rimB = new THREE.Mesh(new THREE.BoxGeometry(toteW + 0.02, 0.022, 0.038), matToteRim);
      rimB.position.set(0, toteH + 0.011, -toteD / 2 + wallT / 2);
      toteGroup.add(rimB);

      // Label plaque on front and back faces for readability from any angle
      const lblMat = new THREE.MeshStandardMaterial({ map: createCreditToteLabelTexture(), roughness: 0.45 });
      const lblF = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.11), lblMat);
      lblF.position.set(0, 0.11, toteD / 2 + 0.002);
      toteGroup.add(lblF);
      const lblB = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.11), lblMat);
      lblB.rotation.y = Math.PI;
      lblB.position.set(0, 0.11, -toteD / 2 - 0.002);
      toteGroup.add(lblB);

      const boxMeshes = populateCreditToteCartons(toteGroup, creditList, delivery, {
        smallW: 0.15,
        smallH: 0.16,
        smallD: 0.15,
        cavityBaseY: 0.025,
        gridCols: 3,
        maxPerLayer: 6
      });

      scene.add(toteGroup);
      return {
        mesh: toteGroup,
        boxes: boxMeshes,
        isSharedWorldTote: false
      };
    }

    function createHandCart3D(initialPos, initialYaw, delivery) {
      const cartGroup = new THREE.Group();
      cartGroup.position.copy(initialPos);
      cartGroup.rotation.y = initialYaw;

      const matSteelDeck = new THREE.MeshStandardMaterial({
        map: createCartTexture(),
        metalness: 0.6,
        roughness: 0.4
      });
      const matFrame = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.7,
        roughness: 0.35
      });
      const matTubing = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.8,
        roughness: 0.25
      });
      const matRubber = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.95
      });

      // 1. Steel Deck Platform (1.20m x 0.78m x 0.04m, elevated 0.18m on wheels)
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 1.20), matSteelDeck);
      deck.position.set(0, 0.18, 0);
      cartGroup.add(deck);

      // Peripheral protective bumper edge
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 1.24), matFrame);
      bumper.position.set(0, 0.165, 0);
      cartGroup.add(bumper);

      // 2. Tubular Push Handle at rear (+Z is back where vendor pushes)
      const handleGroup = new THREE.Group();
      handleGroup.position.set(0, 0.18, 0.58);
      handleGroup.rotation.x = 0.22; // ~12.6 deg backward rake

      [-0.34, 0.34].forEach(hx => {
        const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.96, 16), matTubing);
        upright.position.set(hx, 0.48, 0);
        handleGroup.add(upright);
      });

      const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.76, 16), matTubing);
      topBar.rotation.z = Math.PI / 2;
      topBar.position.set(0, 0.96, 0);
      handleGroup.add(topBar);

      const midBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.70, 16), matTubing);
      midBar.rotation.z = Math.PI / 2;
      midBar.position.set(0, 0.45, 0);
      handleGroup.add(midBar);

      [-0.24, 0.24].forEach(gx => {
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 16), matRubber);
        grip.rotation.z = Math.PI / 2;
        grip.position.set(gx, 0.96, 0);
        handleGroup.add(grip);
      });

      cartGroup.add(handleGroup);

      // 3. Four Caster Wheels
      const casterWheels = [];
      const casterOffsets = [
        { x: -0.30, z: -0.45 },
        { x: 0.30, z: -0.45 },
        { x: -0.30, z: 0.45 },
        { x: 0.30, z: 0.45 }
      ];

      casterOffsets.forEach(pos => {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), matFrame);
        bracket.position.set(pos.x, 0.12, pos.z);
        cartGroup.add(bracket);

        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 16), matRubber);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, 0.075, pos.z);
        cartGroup.add(wheel);
        casterWheels.push(wheel);
      });

      // 4. Cargo: Dynamic Cases matching Delivery Invoice physicalBoxes
      const cargoCasesGroup = new THREE.Group();
      cargoCasesGroup.position.set(0, 0.20, 0);
      cartGroup.add(cargoCasesGroup);

      const cartBoxes = [];
      if (delivery && window.DSDReceipts) {
        window.DSDReceipts.enrichDelivery(delivery);
      }
      const physicalList = (delivery && Array.isArray(delivery.physicalBoxes) && delivery.physicalBoxes.length > 0)
        ? delivery.physicalBoxes
        : [];

      const caseW = 0.23;
      const caseH = 0.26;
      const caseL = 0.35;
      const texCache = {};
      const cartPlacements = computeGroupedStackPlacements(physicalList, 3, false);

      cartPlacements.forEach(({ box: physBox, col, row, layer }, boxIndex) => {
        const boxQty = Number(physBox.unitsPerCase) || 0;
        const cacheKey = `${physBox.code}|${physBox.type}|${Boolean(physBox.notScannable)}|${boxQty}`;
        if (!texCache[cacheKey]) {
          texCache[cacheKey] = createCardboardBoxTexture(
            physBox.code,
            physBox.name,
            physBox.type,
            physBox.notScannable,
            boxQty
          );
        }
        const caseMat = new THREE.MeshStandardMaterial({
          map: texCache[cacheKey],
          roughness: 0.78
        });
        const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(caseW, caseH, caseL), caseMat);
        const bx = (col - 1) * (caseW + 0.02);
        const bz = (row - 1) * (caseL + 0.02);
        const by = (layer * caseH) + (caseH / 2);
        boxMesh.position.set(bx, by, bz);
        boxMesh.userData.physicalBoxRef = physBox;
        boxMesh.userData.deliveryId = delivery ? (delivery.id || null) : null;
        physBox.mesh = boxMesh;
        applyBoxScannedVisual(physBox);
        cargoCasesGroup.add(boxMesh);

        const boxData = {
          id: physBox.boxId || `cart_case_${boxIndex}`,
          po: physBox.code,
          name: physBox.name,
          targetZone: physBox.type === 'frozen' ? 'F' : (physBox.type === 'refrigerated' ? 'C' : 'D'),
          actualTemp: delivery.observedTemp || delivery.temp || '68.0°F',
          expectedTemp: delivery.expectedTemp || 'Ambient',
          status: physBox.scanned ? 'SCANNED' : 'READY',
          isCartCase: true
        };
        cartBoxes.push({ mesh: boxMesh, data: boxData, physicalBox: physBox });
      });

      scene.add(cartGroup);

      return {
        mesh: cartGroup,
        cargoGroup: cargoCasesGroup,
        boxes: cartBoxes,
        wheels: casterWheels,
        handleGroup: handleGroup,
        rollWheels: function (dist) {
          const rot = dist / 0.075;
          casterWheels.forEach(w => {
            w.rotation.x += rot;
          });
        }
      };
    }

    // ==========================================
    // 3D MODULAR HUMANOID DRIVER RIG (MOCKUPS 1, 2, 3)
    // ==========================================
    function createHumanoidDriver3D(options) {
      const variant = options.variant || 'sidedoor';
      const driverGroup = new THREE.Group();
      driverGroup.position.copy(options.initialPos);
      driverGroup.rotation.y = options.initialYaw || 0;

      let shirtColor = 0x3b6e8c; // Sidedoor: Work Blue
      let pantsColor = 0x7d7565; // Sidedoor: Khaki
      let capColor = 0x1e3a5f;   // Sidedoor: Navy Blue
      let skinColor = 0xf8c291;  // Realistic skin tone
      let hairColor = 0x4a2810;  // Dark brown hair
      let bootsColor = 0x271911; // Heavy-duty work boot brown

      if (variant === 'warehouse') {
        shirtColor = 0x1e3f1a; // KGS Forest Green
        pantsColor = 0x2d5a27; // KGS Forest Green trousers
        capColor = 0x1e3f1a;
      } else if (variant === 'vendor_truck') {
        shirtColor = 0x4b5563; // Industrial Slate / Charcoal Grey
        pantsColor = 0x374151; // Charcoal Grey work pants
        capColor = 0x4b5563;
      }

      const matShirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
      const matPants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.85 });
      const matCap = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.7 });
      const matSkin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
      const matBoots = new THREE.MeshStandardMaterial({ color: bootsColor, roughness: 0.7, metalness: 0.2 });
      const matBelt = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
      const matPaper = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.4 });
      const matClipboard = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });

      // 1. Pelvis & Belt (Pivot Y = 0.88m)
      const pelvisGroup = new THREE.Group();
      pelvisGroup.position.set(0, 0.88, 0);
      driverGroup.add(pelvisGroup);

      const hips = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.24), matPants);
      hips.position.set(0, 0, 0);
      pelvisGroup.add(hips);

      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.045, 0.25), matBelt);
      belt.position.set(0, 0.08, 0);
      pelvisGroup.add(belt);

      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.8, roughness: 0.2 }));
      buckle.position.set(0, 0.08, 0.13);
      pelvisGroup.add(buckle);

      // 2. Torso (Pivot Y = 0.98m)
      const torsoGroup = new THREE.Group();
      torsoGroup.position.set(0, 0.98, 0);
      driverGroup.add(torsoGroup);

      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.26), matShirt);
      chest.position.set(0, 0.24, 0);
      torsoGroup.add(chest);

      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.20), matShirt);
      collar.position.set(0, 0.48, 0.02);
      torsoGroup.add(collar);

      // Lanyard and Badge for Warehouse Driver (Mockup 1)
      if (variant === 'warehouse') {
        const matLanyard = new THREE.MeshBasicMaterial({ color: 0x0f172a });
        [-0.07, 0.07].forEach(lx => {
          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.32, 0.005), matLanyard);
          strap.position.set(lx, 0.32, 0.135);
          torsoGroup.add(strap);
        });

        const matBadge = new THREE.MeshStandardMaterial({ map: createDriverBadgeTexture(), roughness: 0.4 });
        const badgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.17), matBadge);
        badgeMesh.position.set(0, 0.18, 0.14);
        torsoGroup.add(badgeMesh);
      }

      // 3. Head & Cap Group (Pivot Y = 1.50m)
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.50, 0);
      driverGroup.add(headGroup);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.08, 12), matSkin);
      neck.position.set(0, 0.04, 0);
      headGroup.add(neck);

      const faceVariant = (variant === 'warehouse' ? 'kgs' : (variant === 'vendor_truck' ? 'grey' : 'clean'));
      const matFace = new THREE.MeshStandardMaterial({
        map: createDriverFaceTexture(faceVariant),
        roughness: 0.8
      });
      const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), [
        matSkin, // right
        matSkin, // left
        matSkin, // top
        matSkin, // bottom
        matFace, // front (+Z)
        new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 }) // back (-Z)
      ]);
      headMesh.position.set(0, 0.18, 0);
      headGroup.add(headMesh);

      const capCrownGeo = new THREE.CylinderGeometry(0.125, 0.13, 0.09, 16);
      let capCrownMat = matCap;
      if (variant === 'warehouse') {
        capCrownMat = new THREE.MeshStandardMaterial({ map: createKgsCapTexture(), roughness: 0.7 });
      }
      const capCrown = new THREE.Mesh(capCrownGeo, capCrownMat);
      capCrown.position.set(0, 0.30, 0.01);
      headGroup.add(capCrown);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.02, 0.12), matCap);
      visor.position.set(0, 0.28, 0.14);
      visor.rotation.x = 0.12;
      headGroup.add(visor);

      // 4. Legs (Left & Right, Pivot Y = 0.84m)
      const legL = new THREE.Group();
      legL.position.set(-0.11, 0.84, 0);
      driverGroup.add(legL);

      const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), matPants);
      thighL.position.set(0, -0.21, 0);
      legL.add(thighL);

      const calfL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.15), matPants);
      calfL.position.set(0, -0.58, 0);
      legL.add(calfL);

      const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.24), matBoots);
      bootL.position.set(0, -0.80, 0.04);
      legL.add(bootL);

      const legR = new THREE.Group();
      legR.position.set(0.11, 0.84, 0);
      driverGroup.add(legR);

      const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), matPants);
      thighR.position.set(0, -0.21, 0);
      legR.add(thighR);

      const calfR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.15), matPants);
      calfR.position.set(0, -0.58, 0);
      legR.add(calfR);

      const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.24), matBoots);
      bootR.position.set(0, -0.80, 0.04);
      legR.add(bootR);

      // 5. Arms (Left & Right, Pivot Y = 1.42m)
      const armL = new THREE.Group();
      armL.position.set(-0.26, 1.42, 0);
      driverGroup.add(armL);

      const upperArmL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), matShirt);
      upperArmL.position.set(0, -0.14, 0);
      armL.add(upperArmL);

      const forearmL = new THREE.Group();
      forearmL.position.set(0, -0.28, 0);
      armL.add(forearmL);

      const lowerArmMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.26, 0.10), matSkin);
      lowerArmMeshL.position.set(0, -0.13, 0);
      forearmL.add(lowerArmMeshL);

      const handL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), matSkin);
      handL.position.set(0, -0.28, 0);
      forearmL.add(handL);

      armL.rotation.x = variant === 'sidedoor' ? 0.08 : ((variant === 'warehouse' || variant === 'vendor_truck') ? -0.55 : 0.55); // Clipboard arms reach in front.
      forearmL.rotation.x = variant === 'sidedoor' ? -Math.PI / 2 : ((variant === 'warehouse' || variant === 'vendor_truck') ? -0.65 : 0.65);
      forearmL.rotation.y = variant === 'sidedoor' ? 0 : 0.25;

      const clipboard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.015), matClipboard);
      clipboard.visible = variant !== 'sidedoor';
      clipboard.position.set(0, -0.28, 0.10);
      clipboard.rotation.x = 0.35;
      forearmL.add(clipboard);

      const paperSheet = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), matPaper);
      paperSheet.visible = variant !== 'sidedoor';
      paperSheet.position.set(0, -0.28, 0.11);
      paperSheet.rotation.x = 0.35;
      forearmL.add(paperSheet);

      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.02), matBelt);
      clip.visible = variant !== 'sidedoor';
      clip.position.set(0, -0.13, 0.11);
      clip.rotation.x = 0.35;
      forearmL.add(clip);

      // Right Arm
      const armR = new THREE.Group();
      armR.position.set(0.26, 1.42, 0);
      driverGroup.add(armR);

      const upperArmR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), matShirt);
      upperArmR.position.set(0, -0.14, 0);
      armR.add(upperArmR);

      const forearmR = new THREE.Group();
      forearmR.position.set(0, -0.28, 0);
      armR.add(forearmR);

      const lowerArmMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.26, 0.10), matSkin);
      lowerArmMeshR.position.set(0, -0.13, 0);
      forearmR.add(lowerArmMeshR);

      const handR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), matSkin);
      handR.position.set(0, -0.28, 0);
      forearmR.add(handR);

      if (variant === 'sidedoor') {
        armR.rotation.x = 0.08;
        forearmR.rotation.x = -Math.PI / 2;
      }

      // 6. Soft Shadow Circle under feet
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 128; shadowCanvas.height = 128;
      const sCtx = shadowCanvas.getContext('2d');
      const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowCanvas),
        transparent: true,
        opacity: 0.7,
        depthWrite: false
      });
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, 0.015, 0);
      driverGroup.add(shadow);

      // 7. Raycast Interaction Hitbox
      const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 1.0), new THREE.MeshBasicMaterial({ visible: false }));
      hitbox.position.set(0, 0.95, 0);
      driverGroup.add(hitbox);

      scene.add(driverGroup);

      let walkCycle = 0;
      let isOperatingJack = false;

      return {
        mesh: driverGroup,
        hitbox: hitbox,
        head: headGroup,
        torso: torsoGroup,
        pelvis: pelvisGroup,
        legL: legL,
        legR: legR,
        armL: armL,
        forearmL: forearmL,
        armR: armR,
        forearmR: forearmR,
        clipboard: clipboard,
        paperSheet: paperSheet,
        clip: clip,
        variant: variant,
        name: options.name || 'Vendor Driver',
        setOperatingJack: function (usingJack) {
          isOperatingJack = Boolean(usingJack);
          const showClipboard = !isOperatingJack && variant !== 'sidedoor';
          clipboard.visible = showClipboard;
          paperSheet.visible = showClipboard;
          clip.visible = showClipboard;

          if (isOperatingJack) {
            // Reach both hands forward & slightly inward to grip the tilted electric jack handlebar grips
            armL.rotation.x = -0.52;
            armL.rotation.z = 0.08;
            forearmL.rotation.x = -0.92;
            forearmL.rotation.y = 0;
            armR.rotation.x = -0.52;
            armR.rotation.z = -0.08;
            forearmR.rotation.x = -0.92;
            forearmR.rotation.y = 0;
          } else if (variant !== 'sidedoor') {
            armL.rotation.x = (variant === 'warehouse' || variant === 'vendor_truck') ? -0.55 : 0.55;
            armL.rotation.z = 0;
            forearmL.rotation.x = (variant === 'warehouse' || variant === 'vendor_truck') ? -0.65 : 0.65;
            forearmL.rotation.y = 0.25;
            armR.rotation.x = 0;
            armR.rotation.z = 0;
            forearmR.rotation.x = 0;
            forearmR.rotation.y = 0;
          }
        },
        updateAnimation: function (isMoving, dt) {
          if (isMoving) {
            walkCycle += dt * 8.5;
            const swing = Math.sin(walkCycle) * 0.55;
            legL.rotation.x = swing;
            legR.rotation.x = -swing;
            torsoGroup.position.y = 0.98 + Math.abs(Math.sin(walkCycle * 2)) * 0.035;

            if (variant !== 'sidedoor' && !isOperatingJack) {
              armR.rotation.x = -swing * 0.65;
            }
          } else {
            legL.rotation.x *= 0.8;
            legR.rotation.x *= 0.8;
            torsoGroup.position.y = 0.98;
            if (variant !== 'sidedoor' && !isOperatingJack) {
              armR.rotation.x *= 0.8;
            }
          }
        },
        trackPlayerGaze: function (playerPos, dt) {
          const worldHeadPos = new THREE.Vector3();
          headGroup.getWorldPosition(worldHeadPos);
          const dx = playerPos.x - worldHeadPos.x;
          const dz = playerPos.z - worldHeadPos.z;
          const dist = Math.hypot(dx, dz);

          const maxTurn = 1.05; // 60 degrees neck physiological limit
          let targetYaw = 0;
          let targetPitch = 0;

          // Natural interactive distance window
          if (dist < 6.5 && dist > 0.7) {
            const worldAngle = Math.atan2(dx, dz);
            let relYaw = worldAngle - driverGroup.rotation.y;
            while (relYaw > Math.PI) relYaw -= Math.PI * 2;
            while (relYaw < -Math.PI) relYaw += Math.PI * 2;

            // Human neck physiological limit: ~60 degrees (1.05 rad).
            // If player is in front (+-60 deg), track their position.
            // If player walks behind or to the side, look straight forward!
            if (Math.abs(relYaw) <= maxTurn) {
              targetYaw = relYaw;
              const dy = (playerPos.y - 0.12) - worldHeadPos.y;
              targetPitch = Math.max(-0.35, Math.min(0.35, Math.atan2(dy, dist)));
            }
          }

          const delta = (typeof dt === 'number' && dt > 0) ? dt : 0.016;
          const lerpRate = Math.min(1.0, 7.5 * delta);
          headGroup.rotation.y += (targetYaw - headGroup.rotation.y) * lerpRate;
          headGroup.rotation.x += (targetPitch - headGroup.rotation.x) * lerpRate;

          // Absolute safety limits: head CANNOT rotate 360 or exceed neck rotation
          headGroup.rotation.y = Math.max(-maxTurn, Math.min(maxTurn, headGroup.rotation.y));
          headGroup.rotation.x = Math.max(-0.35, Math.min(0.35, headGroup.rotation.x));
          headGroup.rotation.z = 0;
        }
      };
    }

    // ==========================================

    return {
      pallets,
      createPallet3D,
      removePallet3D,
      createElectricJackWorld,
      createElectricJackFloorUnit,
      createElectricJackViewmodel,
      electricJackWorld,
      electricJackActiveFloor,
      electricJackViewmodel,
      syncDeliveryBoxesVisuals,
      bindDeliveryBoxesToBayPallets,
      getActiveDeliveryBoxMeshes,
      createHandCart3D,
      createCreditTote3D,
      createHumanoidDriver3D
    };
  }

  global.WarehouseModels = {
    createController
  };
})(window);
