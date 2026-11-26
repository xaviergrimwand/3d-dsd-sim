(function (global) {
  'use strict';

  // FACILITY BLUEPRINT GRID (11 COLS x 24 ROWS)
  // ==========================================
  const DOCK_LAYOUT = [
    "TTWTTWTTWTT", // Row 0  (Truck trailers 1-4)
    "TTWTTWTTWTT", // Row 1
    "TTWTTWTTWTT", // Row 2
    "TTWTTWTTWTT", // Row 3
    "TTWTTWTTWTT", // Row 4
    "TTWTTWTTWTT", // Row 5
    "TTWTTWTTWTT", // Row 6
    "TTWTTWTTWTT", // Row 7
    "TTWTTWTTWTT", // Row 8
    "TTWTTWTTWTT", // Row 9  (Back of trucks / Dock door entry)
    "YYDYYDYYDYY", // Row 10 (Dock door threshold & apron)
    "DDDDDDDDDDY", // Row 11 (Main dock floor + east transit lane)
    "DDDDDDDDDDY", // Row 12
    "YDDDDDDDDDY", // Row 13 (Col 0 Sales Floor door threshold - yellow no-pallet tiles)
    "YDDDDDDDDDY", // Row 14 (Col 0 Sales Floor door threshold - yellow no-pallet tiles)
    "DDDDDDDDDDY", // Row 15 (Expanded dry staging row)
    "DDDDDDDDDDY", // Row 16 (Bottom row of dry staging: dock approach, backstock racks & east hallway entry)
    "WWYWWWYWWWW", // Row 17 (Cooler / Freezer front wall & doorways)
    "FFFFWCCCCWW", // Row 18 (Freezer & Cooler interior)
    "FFFFWCCCCWW", // Row 19
    "FFFFWCCCCWW", // Row 20
    "FFFFWCCCCWW", // Row 21 (Expanded Freezer & Cooler back row)
    "WWWWWWWWWWW", // Row 22 (Red bulkhead separating Freezer/Cooler from Employee Hallway; Col 10 corridor opens south)
    "HHHHHHHHHHH", // Row 23 (Extended Employee Hallway - turns West, 2 tiles wide)
    "HHHHHHHHHHH"  // Row 24 (Extended Employee Hallway - South outer row)
  ];

  const COLS = 11;
  const ROWS = 25;
  const TILE_SIZE = 2.4;

  const ORIGIN_X = -(COLS * TILE_SIZE) / 2;
  const ORIGIN_Z = -10 * TILE_SIZE;

  function gridToWorld(col, row) {
    return {
      x: ORIGIN_X + (col + 0.5) * TILE_SIZE,
      z: ORIGIN_Z + (row + 0.5) * TILE_SIZE
    };
  }

  function worldToGrid(x, z) {
    return {
      col: Math.floor((x - ORIGIN_X) / TILE_SIZE),
      row: Math.floor((z - ORIGIN_Z) / TILE_SIZE)
    };
  }

  function getTileType(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return 'W';
    return DOCK_LAYOUT[row].charAt(col);
  }

  // ==========================================

  function buildFacilityScene(scene, hooks) {
    hooks = hooks || {};
    const SoundSystem = global.SoundSystem;
    const {
      createConcreteFloorTexture,
      createConcreteWallTexture,
      createHazardStripeTexture,
      createRollerDoorTexture,
      createNumberTexture,
      createClockTexture,
      createWarningSignTexture,
      createColdHeaderPlacardTexture,
      createTempLedTexture,
      createCrtScreenDisplay,
      createInvoiceSheetTexture,
      createKeyboardShellTexture,
      createKeyboardTexture,
      createBrickTexture,
      createHallwaySignTexture,
      createHallwayPosterTexture,
      createHallwayDoorSignTexture,
      createNoPalletZoneTexture,
      createVendingFrontTexture,
      createTrailerDoorTexture,
      createThermalCurtainTexture,
      createHallwayTimeclockDisplay,
      createTruckFloorTexture,
      createTrailerWallTexture,
      createTrailerRoofTexture,
      createYellowTransitTexture,
      createFreezerFloorTexture,
      createCoolerFloorTexture,
      createInsulatedPanelTexture,
      createDockCeilingTexture,
      createColdCeilingTexture,
      createHallwayCeilingTexture,
      createElectricJackDecalTexture,
      createBatteryChargerTexture,
      createBatteryChargerDisplay,
      createWoodGrainTexture,
      createOfficeDeskLaminateTexture,
      createOfficeDeskEnamelTexture,
      createCardboardBoxTexture,
      createKgsCapTexture,
      createDriverBadgeTexture,
      createDriverFaceTexture,
      createCartTexture,
      createDoorEnclosureTexture,
      createDoorControlFaceplateTexture,
      createBeaconFaceplateTexture,
      createBeaconLensTexture,
      createBeaconGlowTexture
    } = global.WarehouseTextures;
    const showAlert = hooks.showAlert || (() => { });
    const showNotification = hooks.showNotification || (() => { });
    const openTerminal = hooks.onOpenTerminal || (() => { });
    const getDeliverySystem = hooks.getDeliverySystem || (() => null);

    // --- Materials ---
    const concreteFloorTex = createConcreteFloorTexture();
    const concreteWallTex = createConcreteWallTexture();
    const hazardTex = createHazardStripeTexture(12);
    const rollerDoorTex = createRollerDoorTexture();
    const brickTex = createBrickTexture();

    const truckFloorTex = createTruckFloorTexture();
    const vendorFloorTex = truckFloorTex.clone();
    vendorFloorTex.needsUpdate = true;
    vendorFloorTex.repeat.set(2, 5);
    const trailerWallTex = createTrailerWallTexture(10);
    const vendorTrailerWallTex = createTrailerWallTexture(6);
    const trailerNoseTex = createTrailerWallTexture(2);
    const trailerRoofTex = createTrailerRoofTexture();
    const vendorTrailerRoofTex = trailerRoofTex.clone();
    vendorTrailerRoofTex.needsUpdate = true;
    vendorTrailerRoofTex.repeat.set(1, 6);
    const yellowTransitTex = createYellowTransitTexture();
    const noPalletZoneTex = createNoPalletZoneTexture();
    const freezerFloorTex = createFreezerFloorTexture();
    const coolerFloorTex = createCoolerFloorTexture();
    const insulatedHeaderTex = createInsulatedPanelTexture(2, 1, false);
    const coldBackWallTex = createInsulatedPanelTexture(11, 1, true);
    const dockCeilingTex = createDockCeilingTexture(1, 1);
    const coldCeilingTex = createColdCeilingTexture();
    const hallwayCeilingTex = createHallwayCeilingTexture();

    const matFloorDock = new THREE.MeshStandardMaterial({ map: concreteFloorTex, roughness: 0.82 });
    const matFloorTruck = new THREE.MeshStandardMaterial({ map: truckFloorTex, roughness: 0.88 });
    const matFloorVendorTruck = new THREE.MeshStandardMaterial({ map: vendorFloorTex, roughness: 0.88 });
    const matFloorYellow = new THREE.MeshStandardMaterial({ map: yellowTransitTex, roughness: 0.88, metalness: 0.05 });
    const matFloorNoPallet = new THREE.MeshStandardMaterial({ map: noPalletZoneTex, roughness: 0.88, metalness: 0.05 });
    const matFloorFreezer = new THREE.MeshStandardMaterial({ map: freezerFloorTex, roughness: 0.4 });
    const matFloorCooler = new THREE.MeshStandardMaterial({ map: coolerFloorTex, roughness: 0.45 });

    const matWallDock = new THREE.MeshStandardMaterial({ map: concreteWallTex, roughness: 0.85 });
    const matRedWall = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.8, metalness: 0.1 });
    const matTruckWall = new THREE.MeshStandardMaterial({ map: trailerWallTex, roughness: 0.72, metalness: 0.32 });
    const matVendorTruckWall = new THREE.MeshStandardMaterial({ map: vendorTrailerWallTex, roughness: 0.72, metalness: 0.32 });
    const matTruckNoseWall = new THREE.MeshStandardMaterial({ map: trailerNoseTex, roughness: 0.72, metalness: 0.32 });
    const matInsulatedWall = new THREE.MeshStandardMaterial({ map: insulatedHeaderTex, roughness: 0.38, metalness: 0.25 });
    const matColdBackWall = new THREE.MeshStandardMaterial({ map: coldBackWallTex, roughness: 0.38, metalness: 0.28 });
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.7 });
    const matSteelFrame = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.6 });
    const matCopperPipe = new THREE.MeshStandardMaterial({ color: 0xc27847, roughness: 0.35, metalness: 0.8 });
    const matConduit = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.65 });
    const matYellowBumper = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });
    const matHazardBollard = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    const matHazardRail = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.7 });
    const matBlackRubber = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const matChrome = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.85 });
    const matCeiling = new THREE.MeshStandardMaterial({ map: dockCeilingTex, roughness: 0.82, metalness: 0.25 });
    const matColdCeiling = new THREE.MeshStandardMaterial({ map: coldCeilingTex, roughness: 0.45, metalness: 0.22 });
    const matHallCeiling = new THREE.MeshStandardMaterial({ map: hallwayCeilingTex, roughness: 0.88, metalness: 0.05 });
    const matTruckRoof = new THREE.MeshStandardMaterial({ map: trailerRoofTex, roughness: 0.78, metalness: 0.22 });
    const matVendorTruckRoof = new THREE.MeshStandardMaterial({ map: vendorTrailerRoofTex, roughness: 0.78, metalness: 0.22 });
    const matBrick = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });

    // --- BUILD 3D WORLD FROM THE GRID ---
    const DOCK_CEILING_H = 7.2;
    const TRUCK_CEILING_H = 3.8;
    const COLD_CEILING_H = 4.2;

    const tileMeshGroup = new THREE.Group();
    scene.add(tileMeshGroup);

    const solidWalls = [];

    // Normalize concrete wall BoxGeometry UVs to world-space meters (4.8m = 2 grid tiles per repeat)
    // so every wall, pier, jamb, and bulkhead shares uniform, un-stretched panel seams and circular tie-rods.
    const WORLD_WALL_UV_SCALE = TILE_SIZE * 2; // 4.8m square (4 panels x 1.2m wide each)
    function applyWorldWallUVs(mesh, tileMeters = WORLD_WALL_UV_SCALE) {
      if (!mesh || !mesh.geometry) return;
      const geom = mesh.geometry;
      const posAttr = geom.attributes && geom.attributes.position;
      const normAttr = geom.attributes && geom.attributes.normal;
      const uvAttr = geom.attributes && geom.attributes.uv;
      if (!posAttr || !normAttr || !uvAttr) return;

      const ox = mesh.position.x;
      const oy = mesh.position.y;
      const oz = mesh.position.z;

      for (let i = 0; i < posAttr.count; i++) {
        const wx = ox + posAttr.getX(i);
        const wy = oy + posAttr.getY(i);
        const wz = oz + posAttr.getZ(i);
        const nx = Math.abs(normAttr.getX(i));
        const ny = Math.abs(normAttr.getY(i));
        const nz = Math.abs(normAttr.getZ(i));

        let u, v;
        if (nx >= ny && nx >= nz) {
          u = wz / tileMeters;
          v = wy / tileMeters;
        } else if (nz >= nx && nz >= ny) {
          u = wx / tileMeters;
          v = wy / tileMeters;
        } else {
          u = wx / tileMeters;
          v = wz / tileMeters;
        }
        uvAttr.setXY(i, u, v);
      }
      uvAttr.needsUpdate = true;
    }

    // Add uniform floor-to-wall black & yellow hazard kickrail segments that break cleanly at doorways.
    const KICKRAIL_REPEAT_METERS = 7.68; // 0.16m height * 4:1 stripe aspect * repeatS(12)
    function addWallKickrailSegments(axis, fixedCoord, segments, opts = {}) {
      const h = opts.height || 0.16;
      const d = opts.depth || 0.04;
      const y = opts.y !== undefined ? opts.y : h / 2;
      (segments || []).forEach(([start, end]) => {
        const len = end - start;
        if (!(len > 0.02)) return;
        const geom = axis === 'x'
          ? new THREE.BoxGeometry(len, h, d)
          : new THREE.BoxGeometry(d, h, len);
        const mesh = new THREE.Mesh(geom, matHazardRail);
        if (axis === 'x') mesh.position.set((start + end) / 2, y, fixedCoord);
        else mesh.position.set(fixedCoord, y, (start + end) / 2);

        const posAttr = geom.attributes && geom.attributes.position;
        const normAttr = geom.attributes && geom.attributes.normal;
        const uvAttr = geom.attributes && geom.attributes.uv;
        if (posAttr && normAttr && uvAttr) {
          for (let i = 0; i < posAttr.count; i++) {
            const wx = mesh.position.x + posAttr.getX(i);
            const wy = mesh.position.y + posAttr.getY(i);
            const wz = mesh.position.z + posAttr.getZ(i);
            const nx = Math.abs(normAttr.getX(i));
            const nz = Math.abs(normAttr.getZ(i));
            const uCoord = (nx >= nz) ? wz : wx;
            uvAttr.setXY(i, uCoord / KICKRAIL_REPEAT_METERS, wy / h);
          }
          uvAttr.needsUpdate = true;
        }
        scene.add(mesh);
      });
    }

    function mergeStaticGroupByMaterial(rootGroup, skipSet) {
      if (
        !rootGroup ||
        typeof THREE.Matrix4 !== 'function' ||
        typeof THREE.Matrix3 !== 'function' ||
        typeof THREE.BufferGeometry !== 'function' ||
        typeof THREE.BufferAttribute !== 'function'
      ) {
        return;
      }
      const skip = skipSet || null;
      rootGroup.updateMatrixWorld(true);
      const invRoot = new THREE.Matrix4().copy(rootGroup.matrixWorld).invert();
      const relMat = new THREE.Matrix4();
      const normalMat = new THREE.Matrix3();
      const tmpPos = new THREE.Vector3();
      const tmpNorm = new THREE.Vector3();

      const buckets = new Map();
      const toRemove = [];

      function walk(node) {
        if (!node || !node.visible) return;
        if (skip && skip.has(node)) return;
        if (node.isMesh) {
          const mat = node.material;
          const geom = node.geometry;
          if (
            mat &&
            !Array.isArray(mat) &&
            mat.visible !== false &&
            geom &&
            geom.attributes &&
            geom.attributes.position
          ) {
            relMat.multiplyMatrices(invRoot, node.matrixWorld);
            normalMat.getNormalMatrix(relMat);
            const srcGeom = geom.index ? geom.toNonIndexed() : geom;
            const posAttr = srcGeom.attributes.position;
            const normAttr = srcGeom.attributes.normal;
            const uvAttr = srcGeom.attributes.uv;
            const vCount = posAttr.count;
            if (vCount > 0) {
              let bucket = buckets.get(mat);
              if (!bucket) {
                bucket = { material: mat, meshes: [], totalVerts: 0 };
                buckets.set(mat, bucket);
              }
              bucket.meshes.push({ node, geom, srcGeom, ownedNonIndexed: srcGeom !== geom, relMat: relMat.clone(), normalMat: normalMat.clone(), posAttr, normAttr, uvAttr, vCount });
              bucket.totalVerts += vCount;
              toRemove.push(node);
            } else if (srcGeom !== geom) {
              srcGeom.dispose();
            }
          }
          return;
        }
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
          walk(children[i]);
        }
      }

      walk(rootGroup);

      buckets.forEach((bucket) => {
        if (bucket.meshes.length <= 1) {
          // Only 1 mesh for this material; keep it untouched (just clean temp non-indexed clone)
          const single = bucket.meshes[0];
          if (single && single.ownedNonIndexed) single.srcGeom.dispose();
          const rIdx = single ? toRemove.indexOf(single.node) : -1;
          if (rIdx !== -1) toRemove.splice(rIdx, 1);
          return;
        }
        const positions = new Float32Array(bucket.totalVerts * 3);
        const normals = new Float32Array(bucket.totalVerts * 3);
        const uvs = new Float32Array(bucket.totalVerts * 2);
        let vOffset = 0;

        for (let m = 0; m < bucket.meshes.length; m++) {
          const item = bucket.meshes[m];
          const pAttr = item.posAttr;
          const nAttr = item.normAttr;
          const uAttr = item.uvAttr;
          const count = item.vCount;
          for (let i = 0; i < count; i++) {
            const o3 = (vOffset + i) * 3;
            const o2 = (vOffset + i) * 2;
            tmpPos.fromBufferAttribute(pAttr, i).applyMatrix4(item.relMat);
            positions[o3] = tmpPos.x;
            positions[o3 + 1] = tmpPos.y;
            positions[o3 + 2] = tmpPos.z;
            if (nAttr) {
              tmpNorm.fromBufferAttribute(nAttr, i).applyMatrix3(item.normalMat).normalize();
              normals[o3] = tmpNorm.x;
              normals[o3 + 1] = tmpNorm.y;
              normals[o3 + 2] = tmpNorm.z;
            } else {
              normals[o3 + 1] = 1;
            }
            if (uAttr) {
              uvs[o2] = uAttr.getX(i);
              uvs[o2 + 1] = uAttr.getY(i);
            }
          }
          vOffset += count;
          if (item.ownedNonIndexed) item.srcGeom.dispose();
        }

        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        merged.computeBoundingSphere();

        const mergedMesh = new THREE.Mesh(merged, bucket.material);
        rootGroup.add(mergedMesh);
      });

      for (let i = 0; i < toRemove.length; i++) {
        const mNode = toRemove[i];
        if (mNode.parent) mNode.parent.remove(mNode);
        if (mNode.geometry && typeof mNode.geometry.dispose === 'function') {
          mNode.geometry.dispose();
        }
      }
    }

    // Dedicated helper for authentic cylindrical warehouse safety bollards with rounded dome caps
    function createRoundedBollard(radius = 0.14, height = 1.35) {
      const bGroup = new THREE.Group();
      // Base flange plate
      const baseFlange = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.5, radius * 1.5, 0.04, 24), matSteelFrame);
      baseFlange.position.y = 0.02;
      bGroup.add(baseFlange);

      // Solid safety-yellow cylindrical post matching domed cap
      const post = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), matHazardBollard);
      post.position.y = height / 2;
      bGroup.add(post);

      // Rounded hemispherical dome cap on top
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        matHazardBollard
      );
      dome.position.y = height;
      bGroup.add(dome);

      return bGroup;
    }

    const isHallwayTile = (c, r) => (c === 10 && r >= 17 && r <= 22) || (DOCK_LAYOUT[r] && DOCK_LAYOUT[r].charAt(c) === 'H');

    for (let r = 0; r < ROWS; r++) {
      // Rows 0..9 belong to dynamic outdoor trailer bays (rendered per-bay via dd.trailerGroup only when docked)
      if (r < 10) continue;
      for (let c = 0; c < COLS; c++) {
        const type = DOCK_LAYOUT[r].charAt(c);
        const hallwayTile = isHallwayTile(c, r);
        const pos = gridToWorld(c, r);

        let floorMat = matFloorDock;
        if (type === 'Y') floorMat = matFloorYellow;
        else if (type === 'N') floorMat = matFloorNoPallet;
        else if (type === 'F') floorMat = matFloorFreezer;
        else if (type === 'C') floorMat = matFloorCooler;
        else if (type === 'W' && !hallwayTile) floorMat = matWallDock;

        const tileGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
        const floorTile = new THREE.Mesh(tileGeo, floorMat);
        floorTile.rotation.x = -Math.PI / 2;
        floorTile.position.set(pos.x, 0, pos.z);
        tileMeshGroup.add(floorTile);

        if (type === 'W' && !hallwayTile) {
          const wallH = (r >= 17) ? COLD_CEILING_H : DOCK_CEILING_H;

          const wallGeo = new THREE.BoxGeometry(TILE_SIZE, wallH, TILE_SIZE);
          const wallMesh = new THREE.Mesh(wallGeo, matWallDock);
          wallMesh.position.set(pos.x, wallH / 2, pos.z);
          applyWorldWallUVs(wallMesh);
          scene.add(wallMesh);

          solidWalls.push({
            minX: pos.x - TILE_SIZE / 2,
            maxX: pos.x + TILE_SIZE / 2,
            minZ: pos.z - TILE_SIZE / 2,
            maxZ: pos.z + TILE_SIZE / 2
          });
        }

        const ceilH = (r >= 17) ? COLD_CEILING_H : DOCK_CEILING_H;
        let ceilMat = matCeiling;
        if (hallwayTile) ceilMat = matHallCeiling;
        else if (r >= 17 && (type === 'F' || type === 'C')) ceilMat = matColdCeiling;
        const ceilTile = new THREE.Mesh(tileGeo, ceilMat);
        ceilTile.rotation.x = Math.PI / 2;
        ceilTile.position.set(pos.x, ceilH, pos.z);
        tileMeshGroup.add(ceilTile);
      }
    }
    mergeStaticGroupByMaterial(tileMeshGroup);

    // ==========================================
    // PERIMETER OUTER WALLS, OUTDOOR YARD APRON & SIDE DOOR CUTOUT
    // ==========================================
    const outerWallThickness = 0.5;
    const totalW = COLS * TILE_SIZE;  // 26.4m
    const totalD = ROWS * TILE_SIZE;  // 48.0m
    const buildingNorthZ = ORIGIN_Z + 10 * TILE_SIZE; // Z = 0.0 (Dock Headwall)
    const buildingDepth = (ORIGIN_Z + totalD) - buildingNorthZ; // 24.0m (Rows 10..19)
    const buildingCenterZ = buildingNorthZ + buildingDepth / 2;

    // Outdoor truck yard asphalt apron below dock height (-1.25m) outside empty dock doors
    const yardMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.95 });
    const yardApron = new THREE.Mesh(new THREE.PlaneGeometry(76, 56), yardMat);
    yardApron.rotation.x = -Math.PI / 2;
    yardApron.position.set(0, -1.25, buildingNorthZ - 28);
    scene.add(yardApron);

    // Drop dockSkirt top to Y = -0.02 so it never coplanarly Z-fights with floorTile / trailer deck at Y = 0.0
    const dockSkirt = new THREE.Mesh(new THREE.BoxGeometry(totalW, 1.22, 0.44), matWallDock);
    dockSkirt.position.set(0, -0.63, buildingNorthZ);
    applyWorldWallUVs(dockSkirt);
    scene.add(dockSkirt);

    const southWall = new THREE.Mesh(new THREE.BoxGeometry(totalW, COLD_CEILING_H, outerWallThickness), matColdBackWall);
    southWall.position.set(0, COLD_CEILING_H / 2, ORIGIN_Z + totalD);
    scene.add(southWall);

    // West Wall split around Inset Receiving-Dock Sales Floor Double Doorway (Col 0, Rows 13-14: Z = 8.05m .. 11.15m)
    const westDoorWidth = 3.10;
    const westDoorHeight = 2.68;
    const westDoorCenterZ = ORIGIN_Z + 14 * TILE_SIZE; // Z = 9.60m (centered between Rows 13 & 14)
    const westDoorMinZ = westDoorCenterZ - westDoorWidth / 2; // 8.05m
    const westDoorMaxZ = westDoorCenterZ + westDoorWidth / 2; // 11.15m
    const westNorthLen = westDoorMinZ - buildingNorthZ;
    const westWallNorth = new THREE.Mesh(
      new THREE.BoxGeometry(outerWallThickness, DOCK_CEILING_H, westNorthLen),
      matWallDock
    );
    westWallNorth.position.set(ORIGIN_X, DOCK_CEILING_H / 2, buildingNorthZ + westNorthLen / 2);
    applyWorldWallUVs(westWallNorth);
    scene.add(westWallNorth);

    const westSouthLen = (ORIGIN_Z + totalD) - westDoorMaxZ;
    const westWallSouth = new THREE.Mesh(
      new THREE.BoxGeometry(outerWallThickness, DOCK_CEILING_H, westSouthLen),
      matWallDock
    );
    westWallSouth.position.set(ORIGIN_X, DOCK_CEILING_H / 2, westDoorMaxZ + westSouthLen / 2);
    applyWorldWallUVs(westWallSouth);
    scene.add(westWallSouth);

    const westHeaderH = DOCK_CEILING_H - westDoorHeight;
    const westDoorHeader = new THREE.Mesh(
      new THREE.BoxGeometry(outerWallThickness, westHeaderH, westDoorWidth),
      matWallDock
    );
    westDoorHeader.position.set(ORIGIN_X, westDoorHeight + westHeaderH / 2, westDoorCenterZ);
    applyWorldWallUVs(westDoorHeader);
    scene.add(westDoorHeader);

    // Inset Portal Masonry Recess + Non-Functional Large Double Black Sales Floor Doors (facing East +X into dock)
    const westInsetGrp = new THREE.Group();
    westInsetGrp.position.set(ORIGIN_X, 0, westDoorCenterZ);

    const insetBacking = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, westDoorHeight + 0.14, westDoorWidth + 0.34),
      matWallDock
    );
    insetBacking.position.set(-0.34, (westDoorHeight + 0.14) / 2, 0);
    westInsetGrp.add(insetBacking);

    const insetSoffit = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.10, westDoorWidth + 0.04),
      matSteelFrame
    );
    insetSoffit.position.set(0.0, westDoorHeight - 0.03, 0);
    westInsetGrp.add(insetSoffit);

    [-westDoorWidth / 2 + 0.04, westDoorWidth / 2 - 0.04].forEach((jz) => {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.52, westDoorHeight, 0.09), matSteelFrame);
      jamb.position.set(0.01, westDoorHeight / 2, jz);
      westInsetGrp.add(jamb);
    });

    const dockBlackLeafMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.52, metalness: 0.28 });
    const dockDoorGlassMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.4, opacity: 0.65, transparent: true });
    const dockDoorLeafW = (westDoorWidth - 0.22) / 2;
    [-1, 1].forEach((side) => {
      const lz = side * (dockDoorLeafW / 2 + 0.015);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, westDoorHeight - 0.08, dockDoorLeafW), dockBlackLeafMat);
      leaf.position.set(-0.14, (westDoorHeight - 0.08) / 2, lz);
      westInsetGrp.add(leaf);

      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.48, dockDoorLeafW - 0.08), matChrome);
      kick.position.set(-0.105, 0.26, lz);
      westInsetGrp.add(kick);

      const crashBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, dockDoorLeafW - 0.16), matSteel);
      crashBar.position.set(-0.095, 1.08, lz);
      westInsetGrp.add(crashBar);

      const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.68, 0.34), matSteelFrame);
      winFrame.position.set(-0.106, 1.78, lz - side * 0.14);
      westInsetGrp.add(winFrame);
      const winGlass = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.60, 0.28), dockDoorGlassMat);
      winGlass.position.set(-0.104, 1.78, lz - side * 0.14);
      westInsetGrp.add(winGlass);
    });

    const westDoorsSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 0.34),
      new THREE.MeshBasicMaterial({ map: createHallwayDoorSignTexture('SALES FLOOR', 'KEEP CLEAR — NO PALLETS', '#090d16', '#facc15') })
    );
    westDoorsSign.position.set(0.26, westDoorHeight + 0.30, 0);
    westDoorsSign.rotation.y = Math.PI / 2;
    westInsetGrp.add(westDoorsSign);

    const floorThresh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, westDoorWidth - 0.12), matSteelFrame);
    floorThresh.position.set(0.06, 0.009, 0);
    westInsetGrp.add(floorThresh);
    scene.add(westInsetGrp);

    // EAST WALL: Cutout matches Side Rollup Door EXACTLY with zero gap to the outside world
    // Side door is 2.4m wide, centered at Row 13.5 (Z = ORIGIN_Z + 13.5 * TILE_SIZE = +8.4m)
    const sideDoorWidth = 2.4;
    const sideDoorHeight = 3.2;
    const sideDoorZ = ORIGIN_Z + 13.5 * TILE_SIZE; // Z = 8.4m
    const sideDoorMinZ = sideDoorZ - sideDoorWidth / 2; // 7.2m
    const sideDoorMaxZ = sideDoorZ + sideDoorWidth / 2; // 9.6m

    // North section of East Wall (buildingNorthZ = 0.0m to sideDoorMinZ = 7.2m)
    const eastNorthLen = sideDoorMinZ - buildingNorthZ; // 7.2m
    const eastWallNorthPart = new THREE.Mesh(
      new THREE.BoxGeometry(outerWallThickness, DOCK_CEILING_H, eastNorthLen),
      matWallDock
    );
    eastWallNorthPart.position.set(-ORIGIN_X, DOCK_CEILING_H / 2, buildingNorthZ + eastNorthLen / 2);
    applyWorldWallUVs(eastWallNorthPart);
    scene.add(eastWallNorthPart);

    // South section of East Wall (sideDoorMaxZ = 9.6m to Row 20 = 24.0m)
    const eastSouthLen = (ORIGIN_Z + totalD) - sideDoorMaxZ; // 14.4m
    const eastWallSouthPart = new THREE.Mesh(
      new THREE.BoxGeometry(outerWallThickness, DOCK_CEILING_H, eastSouthLen),
      matWallDock
    );
    eastWallSouthPart.position.set(-ORIGIN_X, DOCK_CEILING_H / 2, sideDoorMaxZ + eastSouthLen / 2);
    applyWorldWallUVs(eastWallSouthPart);
    scene.add(eastWallSouthPart);

    // Header above Side Door: Fills from Y = 3.2m to 7.2m over the 2.4m door width
    const sideDoorHeaderH = DOCK_CEILING_H - sideDoorHeight;
    const sideDoorHeader = new THREE.Mesh(
      new THREE.BoxGeometry(outerWallThickness, sideDoorHeaderH, sideDoorWidth),
      matWallDock
    );
    sideDoorHeader.position.set(-ORIGIN_X, sideDoorHeight + sideDoorHeaderH / 2, sideDoorZ);
    applyWorldWallUVs(sideDoorHeader);
    scene.add(sideDoorHeader);

    // Cutaway Red Brick Outer Pillars
    [-ORIGIN_X + 0.35, ORIGIN_X - 0.35].forEach(px => {
      [ORIGIN_Z + 10 * TILE_SIZE, ORIGIN_Z + 16 * TILE_SIZE].forEach(pz => {
        const bp = new THREE.Mesh(new THREE.BoxGeometry(0.65, DOCK_CEILING_H, 0.65), matBrick);
        bp.position.set(px, DOCK_CEILING_H / 2, pz);
        scene.add(bp);
      });
    });

    // ==========================================
    // DOCK HEADWALL & 4 LOADING BAYS (Row 10, Z = 0.0)
    // With Unobscured Button Stations & High-Mounted Signal Beacons
    // ==========================================
    const doorZ = ORIGIN_Z + 10 * TILE_SIZE; // Z = 0.0
    const doorWidth = TILE_SIZE * 2 - 0.2;   // 4.6m
    const doorHeight = TRUCK_CEILING_H - 0.2;// 3.6m

    // Door speed & travel calculations:
    // - Dock doors (1-4): 3.4m vertical curtain travel (doorHeight 3.6m - 0.2m) @ 1.889 m/s = 1.80s
    // - Side roll-up door: 3.0m vertical curtain travel (sideDoorHeight 3.2m - 0.2m) @ 1.875 m/s = 1.60s
    const DOCK_DOOR_DURATION = 1.80; // seconds for full cycle (travel & motor audio)
    const SIDE_DOOR_DURATION = 1.60; // seconds for full cycle (travel & motor audio)

    // 1. Concrete Bulkhead Wall above all loading bay doors
    const bulkheadH = DOCK_CEILING_H - doorHeight; // 3.6m
    const bulkhead = new THREE.Mesh(new THREE.BoxGeometry(totalW, bulkheadH, 0.4), matWallDock);
    bulkhead.position.set(0, doorHeight + bulkheadH / 2, doorZ);
    applyWorldWallUVs(bulkhead);
    scene.add(bulkhead);

    // 2. Concrete Dividing Piers between bay door openings
    [-7.2, 0.0, 7.2].forEach(px => {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, doorHeight, 0.4), matWallDock);
      pier.position.set(px, doorHeight / 2, doorZ);
      applyWorldWallUVs(pier);
      scene.add(pier);

      solidWalls.push({
        minX: px - 1.2,
        maxX: px + 1.2,
        minZ: doorZ - 0.20,
        maxZ: doorZ + 0.20
      });
    });

    // Left and Right outer jamb piers
    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.5, doorHeight, 0.4), matWallDock);
    leftJamb.position.set(ORIGIN_X + 0.25, doorHeight / 2, doorZ);
    applyWorldWallUVs(leftJamb);
    scene.add(leftJamb);
    solidWalls.push({
      minX: ORIGIN_X,
      maxX: ORIGIN_X + 0.5,
      minZ: doorZ - 0.20,
      maxZ: doorZ + 0.20
    });

    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.5, doorHeight, 0.4), matWallDock);
    rightJamb.position.set(-ORIGIN_X - 0.25, doorHeight / 2, doorZ);
    applyWorldWallUVs(rightJamb);
    scene.add(rightJamb);
    solidWalls.push({
      minX: -ORIGIN_X - 0.5,
      maxX: -ORIGIN_X,
      minZ: doorZ - 0.20,
      maxZ: doorZ + 0.20
    });

    // 3. Lower Floor Hazard Kickrail along North dock piers ONLY (breaks cleanly at all 4 dock doorways & steel I-beams)
    addWallKickrailSegments('x', doorZ + 0.22, [
      [-8.40, -7.41], [-6.99, -6.00],
      [-1.20, -0.21], [0.21, 1.20],
      [6.00, 6.99], [7.41, 8.40]
    ]);

    // 4. Five Full-Height Vertical Structural Steel I-Beam Columns
    const colXPositions = [-13.2, -7.2, 0.0, 7.2, 13.2];
    colXPositions.forEach(cx => {
      const colGroup = new THREE.Group();
      colGroup.position.set(cx, DOCK_CEILING_H / 2, doorZ + 0.22);

      const web = new THREE.Mesh(new THREE.BoxGeometry(0.12, DOCK_CEILING_H, 0.42), matSteel);
      const frontFlange = new THREE.Mesh(new THREE.BoxGeometry(0.42, DOCK_CEILING_H, 0.08), matSteel);
      frontFlange.position.set(0, 0, 0.21);
      colGroup.add(web);
      colGroup.add(frontFlange);
      scene.add(colGroup);

      solidWalls.push({
        minX: cx - 0.21,
        maxX: cx + 0.21,
        minZ: doorZ + 0.01,
        maxZ: doorZ + 0.47
      });
    });

    // Global interactibles registry for raycaster focus & CRT green glow mask
    const interactibles = [];

    // Shared NEMA 4X Door Control Station Builder (Wall Backplate, Cast Enclosure, Gasket, Hinges, Latch, Shrouded Pushbuttons, Pilot Jewel, Lockout Switch)
    const doorEnclosureTex = createDoorEnclosureTexture ? createDoorEnclosureTexture() : null;
    const matCtrlEnclosure = new THREE.MeshStandardMaterial(
      doorEnclosureTex
        ? { map: doorEnclosureTex, roughness: 0.46, metalness: 0.24 }
        : { color: 0xeab308, roughness: 0.46, metalness: 0.24 }
    );
    const matCtrlChrome = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.22, metalness: 0.88 });
    const matCtrlBolt = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.32, metalness: 0.82 });
    const matCtrlShroud = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.55 });
    const matCtrlOpenCap = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x15803d,
      emissiveIntensity: 0.42,
      roughness: 0.24,
      metalness: 0.12
    });
    const matCtrlCloseCap = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.42,
      roughness: 0.24,
      metalness: 0.12
    });

    function buildDoorControlButton(yPos, capMat) {
      const wrap = new THREE.Group();
      wrap.position.set(0, yPos, 0);

      // Outer anodized guard shroud + raised safety ring
      const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.040, 0.018, 18), matCtrlShroud);
      shroud.rotation.x = Math.PI / 2;
      shroud.position.z = 0.084;
      wrap.add(shroud);

      const guardRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0045, 8, 18), matCtrlShroud);
      guardRing.position.z = 0.094;
      wrap.add(guardRing);

      // Chrome bezel collar & rubber weather boot
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.031, 0.020, 18), matCtrlChrome);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.z = 0.088;
      wrap.add(bezel);

      // Depressible translucent plunger + dome cap
      const plungerGroup = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.024, 0.020, 18), capMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.097;
      plungerGroup.add(barrel);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), capMat);
      dome.rotation.x = Math.PI / 2;
      dome.scale.set(1, 0.42, 1);
      dome.position.z = 0.105;
      plungerGroup.add(dome);

      wrap.add(plungerGroup);
      return { wrap, plungerGroup };
    }

    function buildDoorControlStation(doorLabel) {
      const station = new THREE.Group();

      // 1. Heavy steel wall mounting backplate + 4 hex lag bolts
      const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.014), matSteel);
      backplate.position.set(0, 0, -0.063);
      station.add(backplate);

      const boltGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.014, 6);
      [[-0.105, 0.195], [0.105, 0.195], [-0.105, -0.195], [0.105, -0.195]].forEach(([bx, by]) => {
        const bolt = new THREE.Mesh(boltGeo, matCtrlBolt);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(bx, by, -0.052);
        station.add(bolt);
      });

      // 2. Main cast safety-yellow NEMA 4X enclosure body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.37, 0.108), matCtrlEnclosure);
      body.position.set(0, 0, -0.004);
      station.add(body);

      // 3. Recessed rubber gasket seam + hinged front cover door
      const gasket = new THREE.Mesh(new THREE.BoxGeometry(0.208, 0.358, 0.007), matBlackRubber);
      gasket.position.set(0, 0, 0.052);
      station.add(gasket);

      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.202, 0.352, 0.020), matCtrlEnclosure);
      cover.position.set(0, 0, 0.064);
      station.add(cover);

      // Side barrel hinges (left) + quarter-turn stainless cam latch (right)
      [-0.105, 0.105].forEach((hy) => {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.036, 10), matCtrlChrome);
        hinge.position.set(-0.104, hy, 0.057);
        station.add(hinge);
      });
      const latchBase = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.044, 0.022), matCtrlChrome);
      latchBase.position.set(0.104, 0, 0.062);
      station.add(latchBase);
      const latchTab = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 10), matCtrlShroud);
      latchTab.rotation.z = Math.PI / 2;
      latchTab.position.set(0.114, 0, 0.062);
      station.add(latchTab);

      // 4. Top cast conduit hub & gland nut
      const hubNut = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.035, 0.032, 8), matCtrlBolt);
      hubNut.position.set(0, 0.198, -0.012);
      station.add(hubNut);
      const hubCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 12), matCtrlShroud);
      hubCollar.position.set(0, 0.220, -0.012);
      station.add(hubCollar);

      // 5. Brushed dark steel silk-screened faceplate
      const faceTex = createDoorControlFaceplateTexture ? createDoorControlFaceplateTexture(doorLabel) : null;
      const matFaceFront = new THREE.MeshStandardMaterial(
        faceTex
          ? { map: faceTex, roughness: 0.42, metalness: 0.45 }
          : { color: 0x1e293b, roughness: 0.42, metalness: 0.45 }
      );
      const faceMaterials = [
        matCtrlShroud, matCtrlShroud, matCtrlShroud, matCtrlShroud,
        matFaceFront, matCtrlShroud
      ];
      const faceplate = new THREE.Mesh(new THREE.BoxGeometry(0.174, 0.322, 0.006), faceMaterials);
      faceplate.position.set(0, 0, 0.077);
      station.add(faceplate);

      // 6. Tactile 3-layer shrouded OPEN & CLOSE pushbuttons aligned with faceplate collars
      const openBtn = buildDoorControlButton(0.053, matCtrlOpenCap);
      station.add(openBtn.wrap);
      const closeBtn = buildDoorControlButton(-0.026, matCtrlCloseCap);
      station.add(closeBtn.wrap);

      // 7. Live Pilot Jewel LED (left) & Keyed Lockout Selector (right)
      const pilotBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.012, 14), matCtrlChrome);
      pilotBezel.rotation.x = Math.PI / 2;
      pilotBezel.position.set(-0.042, -0.089, 0.083);
      station.add(pilotBezel);

      const pilotMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 0.75,
        roughness: 0.18,
        metalness: 0.15
      });
      const pilotJewel = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), pilotMat);
      pilotJewel.position.set(-0.042, -0.089, 0.090);
      station.add(pilotJewel);

      const lockBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.014, 14), matCtrlChrome);
      lockBezel.rotation.x = Math.PI / 2;
      lockBezel.position.set(0.042, -0.089, 0.084);
      station.add(lockBezel);
      const lockKnob = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.024, 0.014), matCtrlShroud);
      lockKnob.rotation.z = -0.45;
      lockKnob.position.set(0.042, -0.089, 0.094);
      station.add(lockKnob);

      mergeStaticGroupByMaterial(station, new Set([openBtn.plungerGroup, closeBtn.plungerGroup, pilotJewel]));

      return {
        group: station,
        openBtnGroup: openBtn.plungerGroup,
        closeBtnGroup: closeBtn.plungerGroup,
        pilotMat: pilotMat,
        pressAnim: 0,
        pressTarget: 'open'
      };
    }

    // Shared Heavy-Duty 3-Aspect Dock Traffic Signal Fixture Builder
    const beaconFaceTex = createBeaconFaceplateTexture ? createBeaconFaceplateTexture() : null;
    const beaconLensTex = createBeaconLensTexture ? createBeaconLensTexture() : null;
    const beaconGlowTex = createBeaconGlowTexture ? createBeaconGlowTexture() : null;
    const matBeaconFaceFront = new THREE.MeshStandardMaterial(
      beaconFaceTex
        ? { map: beaconFaceTex, roughness: 0.44, metalness: 0.42 }
        : { color: 0x1e293b, roughness: 0.44, metalness: 0.42 }
    );

    function buildDoorBeaconBay(yPos, initialColorHex) {
      const bay = new THREE.Group();
      bay.position.set(0, yPos, 0);

      // Chrome inner parabolic reflector collar & matte rubber weatherseal ring
      const reflector = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.068, 0.016, 20), matCtrlChrome);
      reflector.rotation.x = Math.PI / 2;
      reflector.position.z = 0.103;
      bay.add(reflector);

      const gasketRing = new THREE.Mesh(new THREE.TorusGeometry(0.070, 0.0085, 10, 22), matCtrlShroud);
      gasketRing.position.z = 0.105;
      bay.add(gasketRing);

      // 3-piece tapered industrial anti-glare sun visor hood (top brow + left/right blinders)
      const visorTop = new THREE.Mesh(new THREE.BoxGeometry(0.156, 0.012, 0.098), matCtrlShroud);
      visorTop.position.set(0, 0.073, 0.148);
      visorTop.rotation.x = 0.09;
      bay.add(visorTop);

      [-0.074, 0.074].forEach((vx) => {
        const blinder = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.112, 0.088), matCtrlShroud);
        blinder.position.set(vx, 0.016, 0.143);
        bay.add(blinder);
      });

      // Fresnel glass bullseye dome lens with independent material for live ON/OFF & emissive state
      const lensMat = new THREE.MeshStandardMaterial({
        map: beaconLensTex || null,
        emissiveMap: beaconLensTex || null,
        color: initialColorHex,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.22,
        metalness: 0.12
      });
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.060, 18, 14), lensMat);
      lens.scale.set(1, 1, 0.56);
      lens.position.set(0, 0, 0.111);
      bay.add(lens);

      // Soft optical halo plane shown only while this aspect is illuminated
      const haloMat = new THREE.MeshBasicMaterial({
        map: beaconGlowTex || null,
        color: initialColorHex,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), haloMat);
      halo.position.set(0, 0, 0.132);
      halo.visible = false;
      bay.add(halo);

      return { bay, lens, halo };
    }

    function buildDoorBeaconFixture() {
      const fixture = new THREE.Group();

      // 1. Heavy steel wall mounting backplate + slotted bracket ears + 4 hex lag bolts
      const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.88, 0.016), matSteel);
      backplate.position.set(0, 0, -0.102);
      fixture.add(backplate);

      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.80, 0.028), matCtrlShroud);
      spine.position.set(0, 0, -0.084);
      fixture.add(spine);

      const lagGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.016, 6);
      [[-0.122, 0.41], [0.122, 0.41], [-0.122, -0.41], [0.122, -0.41]].forEach(([bx, by]) => {
        const bolt = new THREE.Mesh(lagGeo, matCtrlBolt);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(bx, by, -0.090);
        fixture.add(bolt);
      });

      // 2. Cast powder-coat safety-yellow housing + dark anodized top cap & bottom sill
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.78, 0.19), matCtrlEnclosure);
      body.position.set(0, 0, 0.0);
      fixture.add(body);

      const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.296, 0.034, 0.208), matCtrlShroud);
      topCap.position.set(0, 0.398, 0.002);
      fixture.add(topCap);

      const botSill = new THREE.Mesh(new THREE.BoxGeometry(0.296, 0.034, 0.208), matCtrlShroud);
      botSill.position.set(0, -0.398, 0.002);
      fixture.add(botSill);

      // Side cooling ribs / cast reinforcement fins on both flanks
      [-0.143, 0.143].forEach((fx) => {
        [-0.24, -0.08, 0.08, 0.24].forEach((fy) => {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.036, 0.145), matCtrlShroud);
          fin.position.set(fx, fy, 0.0);
          fixture.add(fin);
        });
      });

      // Bottom cast conduit hub & hex locknut (aligned with wall conduit at z = -0.047)
      const conduitHub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.036, 12), matCtrlShroud);
      conduitHub.position.set(0, -0.422, -0.047);
      fixture.add(conduitHub);
      const conduitNut = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.014, 6), matCtrlChrome);
      conduitNut.position.set(0, -0.440, -0.047);
      fixture.add(conduitNut);

      // 3. Perimeter gasket collar + brushed dark-slate silk-screened front faceplate
      const gasket = new THREE.Mesh(new THREE.BoxGeometry(0.264, 0.752, 0.010), matCtrlShroud);
      gasket.position.set(0, 0, 0.094);
      fixture.add(gasket);

      const faceMaterials = [
        matCtrlShroud, matCtrlShroud, matCtrlShroud, matCtrlShroud,
        matBeaconFaceFront, matCtrlShroud
      ];
      const faceplate = new THREE.Mesh(new THREE.BoxGeometry(0.244, 0.728, 0.008), faceMaterials);
      faceplate.position.set(0, 0, 0.099);
      fixture.add(faceplate);

      // 4. Three individual hooded Fresnel lens bays (Red / Amber / Green)
      const redBay = buildDoorBeaconBay(0.195, 0xef4444);
      const amberBay = buildDoorBeaconBay(0.0, 0x451a03);
      const greenBay = buildDoorBeaconBay(-0.195, 0x052e16);
      fixture.add(redBay.bay);
      fixture.add(amberBay.bay);
      fixture.add(greenBay.bay);

      mergeStaticGroupByMaterial(
        fixture,
        new Set([redBay.lens, redBay.halo, amberBay.lens, amberBay.halo, greenBay.lens, greenBay.halo])
      );

      return {
        group: fixture,
        redLens: redBay.lens,
        amberLens: amberBay.lens,
        greenLens: greenBay.lens,
        redHalo: redBay.halo,
        amberHalo: amberBay.halo,
        greenHalo: greenBay.halo
      };
    }

    // 5. 4 Interactive Roll-Up Doors with Shrouds, Curtains, Rounded Bollards & Unobscured Beacons
    const dockDoors = [
      { id: 1, colStart: 0, colEnd: 1, name: "Dock Door 1", isOpen: false, hasTrailer: false, currentProgress: 0, trailerDoorOpen: false, trailerDoorProgress: 0, timeOpen: 0 },
      { id: 2, colStart: 3, colEnd: 4, name: "Dock Door 2", isOpen: false, hasTrailer: false, currentProgress: 0, trailerDoorOpen: false, trailerDoorProgress: 0, timeOpen: 0 },
      { id: 3, colStart: 6, colEnd: 7, name: "Dock Door 3", isOpen: false, hasTrailer: false, currentProgress: 0, trailerDoorOpen: false, trailerDoorProgress: 0, timeOpen: 0 },
      { id: 4, colStart: 9, colEnd: 10, name: "Dock Door 4", isOpen: false, hasTrailer: false, currentProgress: 0, trailerDoorOpen: false, trailerDoorProgress: 0, timeOpen: 0 }
    ];
    const trailerDoorTex = createTrailerDoorTexture();

    dockDoors.forEach(dd => {
      const posX = ORIGIN_X + (dd.colStart + 1.0) * TILE_SIZE;
      dd.worldX = posX;
      dd.worldZ = doorZ;

      const group = new THREE.Group();
      group.position.set(posX, 0, doorZ);

      // Overhead Beveled Rectangular Shroud Hood Box
      const drumBox = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.35, 0.48, 0.45), matSteelFrame);
      drumBox.position.set(0, doorHeight + 0.18, 0.1);
      group.add(drumBox);

      // Top Roll-up Drum Canister inside shroud
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, doorWidth + 0.2, 16), matSteel);
      drum.rotation.z = Math.PI / 2;
      drum.position.set(0, doorHeight + 0.18, 0.1);
      group.add(drum);

      // Corrugated Roll-up Curtain
      const curtainGeo = new THREE.PlaneGeometry(doorWidth, doorHeight);
      const curtain = new THREE.Mesh(curtainGeo, new THREE.MeshStandardMaterial({
        map: rollerDoorTex,
        roughness: 0.65,
        metalness: 0.5,
        side: THREE.DoubleSide
      }));
      curtain.position.set(0, doorHeight / 2, 0);
      group.add(curtain);
      dd.curtainMesh = curtain;

      // Steel Guide Tracks on door jambs
      [-doorWidth / 2 - 0.08, doorWidth / 2 + 0.08].forEach(gx => {
        const track = new THREE.Mesh(new THREE.BoxGeometry(0.18, doorHeight, 0.2), matSteelFrame);
        track.position.set(gx, doorHeight / 2, 0.05);
        group.add(track);
      });

      // Large Number Sign Placard ("1", "2", "3", "4") centered on bulkhead above door
      const numSign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshStandardMaterial({ map: createNumberTexture(dd.id.toString()), roughness: 0.6 })
      );
      numSign.position.set(0, doorHeight + 0.95, 0.25);
      group.add(numSign);

      // ROUNDED HAZARD BOLLARDS flanking each door opening
      [-doorWidth / 2 - 0.18, doorWidth / 2 + 0.18].forEach(bx => {
        const roundBollard = createRoundedBollard(0.14, 1.35);
        roundBollard.position.set(bx, 0, 0.45);
        group.add(roundBollard);

        const wx = posX + bx;
        const wz = doorZ + 0.45;
        solidWalls.push({
          minX: wx - 0.16,
          maxX: wx + 0.16,
          minZ: wz - 0.16,
          maxZ: wz + 0.16
        });

        // Trailer heavy black rubber bumper on trailer side
        const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.95, 0.36), matBlackRubber);
        rubber.position.set(bx, 0.55, -0.16);
        group.add(rubber);
      });

      // BUTTON STATION & SIGNAL LIGHT PLACEMENT:
      // For Docks 1, 2, 3: Mounted on the pier to the RIGHT (+doorWidth/2 + 0.55m)
      // For Dock 4: Mounted on the LEFT pier (-doorWidth/2 - 0.55m) so it is NEVER hidden by the East corner wall!
      const ctrlOffsetX = (dd.id === 4) ? (-doorWidth / 2 - 0.55) : (doorWidth / 2 + 0.55);

      // Industrial Wall Control Button Station (at Y = 1.45m on the flat pier, unobstructed)
      const station = buildDoorControlStation(`DOOR ${dd.id}`);
      station.group.position.set(ctrlOffsetX, 1.45, 0.22);
      group.add(station.group);
      dd.stationCtrl = station;

      // Generous hitbox for raycast interaction
      const switchHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.56, 0.32), new THREE.MeshBasicMaterial({ visible: false }));
      switchHitbox.position.set(ctrlOffsetX, 1.45, 0.22);
      group.add(switchHitbox);

      const dockInteractible = {
        id: `dock_${dd.id}_button`,
        type: 'dock_button',
        name: `${dd.name} Control Panel`,
        target: dd,
        mesh: switchHitbox,
        boxCenter: new THREE.Vector3(posX + ctrlOffsetX, 1.45, doorZ + 0.22),
        boxSize: new THREE.Vector3(0.28, 0.44, 0.24),
        getPrompt: () => `[E] Push Button - ${dd.isOpen ? 'CLOSE' : 'OPEN'} ${dd.name}`,
        interact: () => {
          dd.isOpen = !dd.isOpen;
          if (dd.stationCtrl) {
            dd.stationCtrl.pressTarget = dd.isOpen ? 'open' : 'close';
            dd.stationCtrl.pressAnim = 1.0;
          }
          if (SoundSystem.playWallSwitch) SoundSystem.playWallSwitch();
          else SoundSystem.playButtonClick();
          const remainingTravel = (dd.isOpen ? (1.0 - dd.currentProgress) : dd.currentProgress);
          const motorTime = Math.max(0.3, remainingTravel * DOCK_DOOR_DURATION);
          SoundSystem.playDoorMotor(motorTime);
          if (typeof lib !== 'undefined' && lib.log) {
            lib.log(`${dd.name} button pressed: ${dd.isOpen ? 'OPEN' : 'CLOSED'}`);
          }
        }
      };
      interactibles.push(dockInteractible);
      switchHitbox.userData.interactible = dockInteractible;

      // Vertical metal conduit running from button box straight up into the high beacon conduit hub
      const conduitPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.20, 8), matConduit);
      conduitPipe.position.set(ctrlOffsetX, 2.75, 0.22);
      group.add(conduitPipe);

      // 3-LENS TRAFFIC BEACON: Mounted high up at Y = 4.25m on bulkhead wall!
      // Unobscured by bollards or walls; visible across the entire warehouse floor!
      const beacon = buildDoorBeaconFixture();
      beacon.group.position.set(ctrlOffsetX, 4.25, 0.26);
      group.add(beacon.group);

      dd.redLens = beacon.redLens;
      dd.amberLens = beacon.amberLens;
      dd.greenLens = beacon.greenLens;
      dd.beaconCtrl = beacon;

      // Dynamic 3D Semi-Trailer + Tractor Assembly (visible ONLY while dd.hasTrailer is true)
      const trailerGroup = new THREE.Group();
      trailerGroup.position.set(posX, 0, doorZ);
      const tLen = 10 * TILE_SIZE; // 24.0m (bay wheel guide baseline & full warehouse trailer length)
      const vendorTrailerLen = 6 * TILE_SIZE; // 14.4m (2 cols x 6 rows = 12 pallet tiles)
      const tWidth = 2 * TILE_SIZE; // 4.8m
      const yardY = -1.25; // Outdoor yard ground plane elevation relative to dock floor

      // Beveled Steel Dock Leveler Plate bridging dock door threshold -> trailer floor cleanly above Y=0
      const dockLeveler = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth - 0.08, 0.018, 0.52),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.75 })
      );
      dockLeveler.position.set(0, 0.009, -0.03);
      trailerGroup.add(dockLeveler);

      // Dedicated Trailer Roll-Up Door at z = -0.45m (separate from dock door at z = 0.0)
      const tDoorW = doorWidth - 0.16;  // 4.44m
      const tDoorH = doorHeight - 0.14; // 3.46m
      const tDoorFrameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.65 });
      [-tDoorW / 2 - 0.05, tDoorW / 2 + 0.05].forEach((tx) => {
        const tJamb = new THREE.Mesh(new THREE.BoxGeometry(0.10, TRUCK_CEILING_H, 0.14), tDoorFrameMat);
        tJamb.position.set(tx, TRUCK_CEILING_H / 2, -0.45);
        trailerGroup.add(tJamb);
      });
      const tHeaderPanel = new THREE.Mesh(
        new THREE.BoxGeometry(tWidth - 0.28, TRUCK_CEILING_H - tDoorH, 0.14),
        tDoorFrameMat
      );
      tHeaderPanel.position.set(0, tDoorH + (TRUCK_CEILING_H - tDoorH) / 2, -0.45);
      trailerGroup.add(tHeaderPanel);

      const trailerDoorCurtain = new THREE.Mesh(
        new THREE.PlaneGeometry(tDoorW, tDoorH),
        new THREE.MeshStandardMaterial({
          map: trailerDoorTex,
          roughness: 0.52,
          metalness: 0.22,
          side: THREE.DoubleSide
        })
      );
      trailerDoorCurtain.position.set(0, tDoorH / 2, -0.45);
      trailerGroup.add(trailerDoorCurtain);
      dd.trailerDoorCurtain = trailerDoorCurtain;
      dd.trailerDoorH = tDoorH;

      // Helper: build interior cargo box + exterior livery, wheels, chassis & tractor for Warehouse (20 tiles) or Vendor (12 tiles)
      const matTireRubber = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.92 });
      const matWheelRim = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.3, metalness: 0.85 });
      const matChassisDark = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.55 });
      const matChrome = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, roughness: 0.2, metalness: 0.9 });
      const matGlass = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.65 });

      function createDualWheel(x, z, radius = 0.50) {
        const wGroup = new THREE.Group();
        wGroup.position.set(x, yardY + radius, z);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.36, 18), matTireRubber);
        tire.rotation.z = Math.PI / 2;
        wGroup.add(tire);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.54, radius * 0.54, 0.38, 14), matWheelRim);
        rim.rotation.z = Math.PI / 2;
        wGroup.add(rim);
        return wGroup;
      }

      function buildExteriorSemiVariant(isWarehouse) {
        const vGroup = new THREE.Group();
        const vLen = isWarehouse ? tLen : vendorTrailerLen; // Warehouse: 24.0m (10 rows), Vendor: 14.4m (6 rows)

        // Interior cargo floor, walls, nose bulkhead, roof & overhead light scaled to variant length
        // Trailer deck starts at z = -0.22 so it never overlaps floorTile at z = 0.0 (eliminates Z-fighting flicker)
        const deckLen = vLen - 0.22;
        const tFloor = new THREE.Mesh(
          new THREE.BoxGeometry(tWidth, 0.14, deckLen),
          isWarehouse ? matFloorTruck : matFloorVendorTruck
        );
        tFloor.position.set(0, -0.07, -0.22 - deckLen / 2);
        vGroup.add(tFloor);

        const wallMat = isWarehouse ? matTruckWall : matVendorTruckWall;
        const tLeftWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, TRUCK_CEILING_H, vLen), wallMat);
        tLeftWall.position.set(-tWidth / 2 + 0.07, TRUCK_CEILING_H / 2, -vLen / 2);
        vGroup.add(tLeftWall);

        const tRightWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, TRUCK_CEILING_H, vLen), wallMat);
        tRightWall.position.set(tWidth / 2 - 0.07, TRUCK_CEILING_H / 2, -vLen / 2);
        vGroup.add(tRightWall);

        const tNoseWall = new THREE.Mesh(new THREE.BoxGeometry(tWidth, TRUCK_CEILING_H, 0.25), matTruckNoseWall);
        tNoseWall.position.set(0, TRUCK_CEILING_H / 2, -vLen);
        vGroup.add(tNoseWall);

        const tRoof = new THREE.Mesh(
          new THREE.PlaneGeometry(tWidth, vLen),
          isWarehouse ? matTruckRoof : matVendorTruckRoof
        );
        tRoof.rotation.x = Math.PI / 2;
        tRoof.position.set(0, TRUCK_CEILING_H, -vLen / 2);
        vGroup.add(tRoof);

        // Self-lit cargo dome ceiling strip replaces per-trailer PointLight to keep fragment shader light count minimal
        const tDomeStrip = new THREE.Mesh(
          new THREE.PlaneGeometry(0.42, vLen * 0.72),
          new THREE.MeshBasicMaterial({ color: 0xffedd5 })
        );
        tDomeStrip.rotation.x = Math.PI / 2;
        tDomeStrip.position.set(0, TRUCK_CEILING_H - 0.015, -vLen / 2);
        vGroup.add(tDomeStrip);
        vGroup.userData.trailerLight = null;

        // Exterior livery panels wrapping sides slightly outside interior sidewalls so adjacent open bays see livery
        const sideSkinMat = new THREE.MeshStandardMaterial({
          color: isWarehouse ? 0xf8fafc : 0xcbd5e1,
          roughness: 0.45,
          metalness: isWarehouse ? 0.12 : 0.38
        });
        const stripeMat = new THREE.MeshStandardMaterial({
          color: isWarehouse ? 0xb91c1c : 0x1d4ed8,
          roughness: 0.45
        });
        const accentMat = new THREE.MeshStandardMaterial({
          color: isWarehouse ? 0xfef2f2 : 0xf59e0b,
          roughness: 0.4
        });

        [-tWidth / 2 - 0.02, tWidth / 2 + 0.02].forEach((sx) => {
          const skin = new THREE.Mesh(new THREE.BoxGeometry(0.04, TRUCK_CEILING_H, vLen), sideSkinMat);
          skin.position.set(sx, TRUCK_CEILING_H / 2, -vLen / 2);
          vGroup.add(skin);

          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, vLen - 0.4), stripeMat);
          stripe.position.set(sx, 1.9, -vLen / 2);
          vGroup.add(stripe);

          const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, vLen - 0.4), accentMat);
          lowerTrim.position.set(sx, 0.28, -vLen / 2);
          vGroup.add(lowerTrim);
        });

        // Undercarriage chassis rails + landing gear legs near nose
        [-0.85, 0.85].forEach((rx) => {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, vLen + 5.8), matChassisDark);
          rail.position.set(rx, -0.30, -vLen / 2 - 2.6);
          vGroup.add(rail);

          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.10, 0.16), matChassisDark);
          leg.position.set(rx * 1.35, yardY + 0.56, -vLen + 4.4);
          vGroup.add(leg);

          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.34), matSteelFrame);
          pad.position.set(rx * 1.35, yardY + 0.03, -vLen + 4.4);
          vGroup.add(pad);
        });

        // Trailer rear tandem bogie wheels (near dock end at z = -3.8 & -5.2)
        const bogieZ = isWarehouse ? [-3.8, -5.2] : [-4.2];
        bogieZ.forEach((bz) => {
          [-tWidth / 2 + 0.34, tWidth / 2 - 0.34].forEach((wx) => {
            vGroup.add(createDualWheel(wx, bz, 0.50));
          });
        });

        // Mudflaps behind rear trailer tires
        [-tWidth / 2 + 0.34, tWidth / 2 - 0.34].forEach((mx) => {
          const flap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.04), matBlackRubber);
          flap.position.set(mx, yardY + 0.42, -2.9);
          vGroup.add(flap);
        });

        // Tractor Cab (Warehouse: Red long-nose Sleeper Semi + Reefer unit; Vendor: Blue/Gold Day Cab)
        const cabPaint = new THREE.MeshStandardMaterial({
          color: isWarehouse ? 0x991b1b : 0x1e40af,
          roughness: 0.35,
          metalness: 0.45
        });

        if (isWarehouse) {
          // Nose-mounted Thermo-King Reefer unit on trailer bulkhead
          const reefer = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.8, 0.72), sideSkinMat);
          reefer.position.set(0, 2.55, -vLen - 0.36);
          vGroup.add(reefer);
          const reeferGrille = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.08), stripeMat);
          reeferGrille.position.set(0, 2.65, -vLen - 0.73);
          vGroup.add(reeferGrille);
        }

        const cabBaseZ = -vLen - 1.2;
        // Tractor drive tires (tandem for Warehouse, single heavy axle for Vendor) + front steer axle
        const driveAxles = isWarehouse ? [cabBaseZ - 0.3, cabBaseZ - 1.7] : [cabBaseZ - 0.6];
        driveAxles.forEach((az) => {
          [-1.12, 1.12].forEach((wx) => vGroup.add(createDualWheel(wx, az, 0.50)));
        });
        const steerZ = cabBaseZ - (isWarehouse ? 4.4 : 3.4);
        [-1.15, 1.15].forEach((wx) => vGroup.add(createDualWheel(wx, steerZ, 0.48)));

        // Sleeper/Cab Main Cabin
        const cabDepth = isWarehouse ? 2.4 : 1.75;
        const cabHeight = isWarehouse ? 2.85 : 2.35;
        const cabCenterZ = cabBaseZ - 2.0;
        const cabBody = new THREE.Mesh(new THREE.BoxGeometry(2.50, cabHeight, cabDepth), cabPaint);
        cabBody.position.set(0, yardY + 0.55 + cabHeight / 2, cabCenterZ);
        vGroup.add(cabBody);

        if (isWarehouse) {
          // Aerodynamic sleeper roof fairing + twin chrome exhaust stacks
          const fairing = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.65, 1.8), cabPaint);
          fairing.position.set(0, yardY + 0.55 + cabHeight + 0.25, cabCenterZ + 0.2);
          vGroup.add(fairing);

          [-1.30, 1.30].forEach((ex) => {
            const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 12), matChrome);
            stack.position.set(ex, yardY + 2.3, cabCenterZ + 0.9);
            vGroup.add(stack);
          });
        } else {
          // Day-cab contrasting roof cap & safety-gold side doors
          const cap = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.20, cabDepth + 0.08), sideSkinMat);
          cap.position.set(0, yardY + 0.55 + cabHeight + 0.05, cabCenterZ);
          vGroup.add(cap);
          const doorStripe = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.28, cabDepth - 0.1), accentMat);
          doorStripe.position.set(0, yardY + 1.25, cabCenterZ);
          vGroup.add(doorStripe);
        }

        // Engine Hood, Windshield, Chrome Grille, Bumper & Headlights
        const hoodLen = isWarehouse ? 2.0 : 1.45;
        const hoodZ = cabCenterZ - cabDepth / 2 - hoodLen / 2;
        const hood = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.38, hoodLen), cabPaint);
        hood.position.set(0, yardY + 1.24, hoodZ);
        vGroup.add(hood);

        const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.72, 0.10), matGlass);
        windshield.position.set(0, yardY + cabHeight - 0.15, cabCenterZ - cabDepth / 2 - 0.02);
        vGroup.add(windshield);

        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.05, 0.08), matChrome);
        grille.position.set(0, yardY + 1.28, hoodZ - hoodLen / 2 - 0.02);
        vGroup.add(grille);

        const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.34, 0.22), matChrome);
        bumper.position.set(0, yardY + 0.56, hoodZ - hoodLen / 2 - 0.06);
        vGroup.add(bumper);

        // Fuel tanks along chassis sides
        [-1.08, 1.08].forEach((tx) => {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.45, 14), matChrome);
          tank.rotation.x = Math.PI / 2;
          tank.position.set(tx, yardY + 0.62, cabCenterZ + 0.2);
          vGroup.add(tank);
        });

        // Headlights + Amber Roof Clearance Markers
        [-0.86, 0.86].forEach((hx) => {
          const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.16, 0.08),
            new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
          );
          lamp.position.set(hx, yardY + 0.95, hoodZ - hoodLen / 2 - 0.04);
          vGroup.add(lamp);
        });
        [-0.65, 0, 0.65].forEach((cx) => {
          const marker = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.08, 0.10),
            new THREE.MeshBasicMaterial({ color: 0xf59e0b })
          );
          marker.position.set(cx, yardY + 0.55 + cabHeight + (isWarehouse ? 0.56 : 0.18), cabCenterZ - cabDepth / 2);
          vGroup.add(marker);
        });

        mergeStaticGroupByMaterial(vGroup);
        return vGroup;
      }

      const whSemiGroup = buildExteriorSemiVariant(true);
      const vendorSemiGroup = buildExteriorSemiVariant(false);
      whSemiGroup.visible = dd.trailerType === 'warehouse';
      vendorSemiGroup.visible = dd.trailerType === 'vendor_truck';
      trailerGroup.add(whSemiGroup);
      trailerGroup.add(vendorSemiGroup);

      // Up to 2 dynamic insulated zone curtains inside Warehouse Trailers (F|C and C|D seams)
      const curtainTexF = createThermalCurtainTexture('F');
      const curtainTexC = createThermalCurtainTexture('C');
      const tcFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.65 });
      const tcInnerW = tWidth - 0.34;
      const tcH = tDoorH;
      dd.tempCurtains = [0, 1].map(() => {
        const cGrp = new THREE.Group();
        cGrp.visible = false;

        // Overhead roller header box & side vinyl guide rails
        const rollerBox = new THREE.Mesh(new THREE.BoxGeometry(tcInnerW + 0.14, 0.22, 0.16), tcFrameMat);
        rollerBox.position.set(0, tcH + 0.08, 0);
        cGrp.add(rollerBox);

        [-tcInnerW / 2 - 0.03, tcInnerW / 2 + 0.03].forEach((gx) => {
          const track = new THREE.Mesh(new THREE.BoxGeometry(0.08, tcH, 0.12), tcFrameMat);
          track.position.set(gx, tcH / 2, 0);
          cGrp.add(track);
        });

        const pilotMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const pilotLight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.15), pilotMat);
        pilotLight.position.set(-tcInnerW / 2 + 0.08, 2.05, 0);
        cGrp.add(pilotLight);

        const cMat = new THREE.MeshStandardMaterial({
          map: curtainTexC,
          roughness: 0.45,
          metalness: 0.08,
          transparent: true,
          side: THREE.DoubleSide
        });
        const cMesh = new THREE.Mesh(new THREE.PlaneGeometry(tcInnerW, tcH), cMat);
        cMesh.position.set(0, tcH / 2, 0);
        cGrp.add(cMesh);

        whSemiGroup.add(cGrp);
        return {
          active: false,
          zoneBehind: 'C',
          zoneFront: 'D',
          rowAfter: 0,
          localZ: 0,
          worldZ: doorZ,
          frontPallets: [],
          isOpen: false,
          progress: 0,
          _lastProg: -1,
          curtainH: tcH,
          group: cGrp,
          curtainMesh: cMesh,
          curtainMat: cMat,
          pilotMat: pilotMat,
          texF: curtainTexF,
          texC: curtainTexC
        };
      });

      trailerGroup.visible = Boolean(dd.hasTrailer);
      dd.trailerGroup = trailerGroup;
      dd.whSemiGroup = whSemiGroup;
      dd.vendorSemiGroup = vendorSemiGroup;
      dd.trailerLight = whSemiGroup.userData.trailerLight || null;
      scene.add(trailerGroup);

      // Painted yellow asphalt wheel guide stripes outside empty dock bay on yard apron
      [-tWidth / 2 + 0.25, tWidth / 2 - 0.25].forEach((gx) => {
        const guide = new THREE.Mesh(
          new THREE.PlaneGeometry(0.14, tLen * 0.85),
          new THREE.MeshBasicMaterial({ color: 0xeab308 })
        );
        guide.rotation.x = -Math.PI / 2;
        guide.position.set(posX + gx, -1.235, doorZ - tLen * 0.45);
        scene.add(guide);
      });

      mergeStaticGroupByMaterial(group, new Set([curtain, station.group, beacon.group]));
      scene.add(group);
    });

    // 6. Detailed Wall-Mounted Fire Extinguisher Station Builder (shared by Dock East Wall & Employee Hallway)
    const extMatRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.28, metalness: 0.35 });
    const extMatBrass = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8 });
    function createFireExtinguisherStation(opts = {}) {
      const grp = opts.parentGroup || new THREE.Group();
      const ox = opts.offsetX || 0;
      if (!opts.parentGroup) {
        grp.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
        if (opts.ry !== undefined) grp.rotation.y = opts.ry;
      }

      const extBoard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.94, 0.03), matSteelFrame);
      extBoard.position.set(ox, 1.32, 0.015);
      grp.add(extBoard);
      const extTank = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.48, 16), extMatRed);
      extTank.position.set(ox, 1.24, 0.12);
      grp.add(extTank);
      const extDome = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), extMatRed);
      extDome.position.set(ox, 1.48, 0.12);
      grp.add(extDome);
      const extBand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.175), matSteelFrame);
      extBand.position.set(ox, 1.32, 0.12);
      grp.add(extBand);
      const extValve = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, 0.09, 10), extMatBrass);
      extValve.position.set(ox, 1.59, 0.12);
      grp.add(extValve);
      const extLever = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.03), matBlackRubber);
      extLever.position.set(ox + 0.03, 1.63, 0.12);
      grp.add(extLever);
      const extGauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12),
        new THREE.MeshBasicMaterial({ color: 0x4ade80 })
      );
      extGauge.rotation.x = Math.PI / 2;
      extGauge.position.set(ox, 1.59, 0.155);
      grp.add(extGauge);
      // Curved discharge hose + flared black nozzle strapped to side of tank
      const extHose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), matBlackRubber);
      extHose.position.set(ox + 0.11, 1.38, 0.13);
      extHose.rotation.z = 0.08;
      grp.add(extHose);
      const extHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, 0.12, 10), matBlackRubber);
      extHorn.position.set(ox + 0.13, 1.15, 0.13);
      grp.add(extHorn);
      const extSign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.16),
        new THREE.MeshBasicMaterial({ map: createHallwayDoorSignTexture('FIRE EXTINGUISHER', 'ABC CLASS · PULL PIN', '#991b1b', '#fef08a') })
      );
      extSign.position.set(ox, 1.90, 0.01);
      grp.add(extSign);

      if (!opts.parentGroup) scene.add(grp);
      return grp;
    }

    // 6B. Column at X = -7.2 (Between Docks 1 & 2): Industrial Battery Charging Station
    const chargerGroup = new THREE.Group();
    chargerGroup.position.set(-7.2, 1.45, doorZ + 0.43);

    const chargerBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.24), matSteelFrame);
    chargerGroup.add(chargerBody);

    const batteryCharger = createBatteryChargerDisplay();
    const chargerFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.66),
      new THREE.MeshStandardMaterial({ map: batteryCharger.texture, roughness: 0.5 })
    );
    chargerFace.position.set(0, 0, 0.122);
    chargerGroup.add(chargerFace);

    // Heavy industrial electrical conduit rising from charger to ceiling Warren truss
    const chargerConduit = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.8, 8), matConduit);
    chargerConduit.position.set(0.16, 2.7, 0.04);
    chargerGroup.add(chargerConduit);

    scene.add(chargerGroup);

    // Floor Recharging Bay Marking under Electric Jack Home Position (X = -7.20, Z = 0.57..2.47)
    const rechargeBayPad = new THREE.Mesh(
      new THREE.PlaneGeometry(1.12, 1.90),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.20, depthWrite: false })
    );
    rechargeBayPad.rotation.x = -Math.PI / 2;
    rechargeBayPad.position.set(-7.20, 0.005, doorZ + 1.52);
    scene.add(rechargeBayPad);
    const rechargeBorderMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthWrite: false });
    [
      [1.12, 0.05, 0, 0.925],
      [1.12, 0.05, 0, -0.925],
      [0.05, 1.90, -0.535, 0],
      [0.05, 1.90, 0.535, 0]
    ].forEach(([bw, bh, ox, oz]) => {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), rechargeBorderMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(-7.20 + ox, 0.006, doorZ + 1.52 + oz);
      scene.add(stripe);
    });

    // 7. WEST WALL SAFETY STATION (Mounted cleanly on West Wall, not over Door 1!)
    const cautionWallSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.5),
      new THREE.MeshStandardMaterial({ map: createWarningSignTexture('caution') })
    );
    cautionWallSign.rotation.y = Math.PI / 2;
    cautionWallSign.position.set(ORIGIN_X + 0.06, 2.8, 2.4);
    scene.add(cautionWallSign);



    const leftSwitchBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.24), matSteelFrame);
    leftSwitchBox.position.set(ORIGIN_X + 0.08, 1.4, 3.4);
    scene.add(leftSwitchBox);

    const leftConduitPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.5, 8), matConduit);
    leftConduitPipe.position.set(ORIGIN_X + 0.08, 3.2, 3.4);
    scene.add(leftConduitPipe);

    // 8. Dock Rules Placard above Bay 4
    const dockRulesSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.55),
      new THREE.MeshStandardMaterial({ map: createWarningSignTexture('dockrules') })
    );
    dockRulesSign.position.set(10.8, doorHeight + 1.85, doorZ + 0.22);
    scene.add(dockRulesSign);

    // ==========================================
    // EXPOSED STEEL CEILING TRUSSES & GIRDERS
    // Heavy Warren steel lattice trusses spanning the dock
    // Aligned with the 5 vertical columns at X = -13.2, -7.2, 0.0, 7.2, 13.2
    // ==========================================
    const trussL = 16.8; // Covers rows 10 to 16 (Z: 0 to 16.8)
    const trussDepth = 1.0;
    const trussY = DOCK_CEILING_H - trussDepth / 2 - 0.05;
    const ceilingSteelGroup = new THREE.Group();

    colXPositions.forEach(cx => {
      const trussGroup = new THREE.Group();
      trussGroup.position.set(cx, trussY, trussL / 2);

      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, trussL), matSteel);
      topBeam.position.y = trussDepth / 2;
      trussGroup.add(topBeam);

      const bottomBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, trussL), matSteel);
      bottomBeam.position.y = -trussDepth / 2;
      trussGroup.add(bottomBeam);

      // Diagonal Warren lattice cross-bracing struts
      const strutCount = 8;
      const strutStep = trussL / strutCount;
      for (let s = 0; s < strutCount; s++) {
        const zStart = -trussL / 2 + s * strutStep;
        const zMid = zStart + strutStep / 2;
        const zEnd = zStart + strutStep;

        const strutLen = Math.sqrt(trussDepth * trussDepth + (strutStep / 2) * (strutStep / 2));
        const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, strutLen, 8);

        const strut1 = new THREE.Mesh(strutGeo, matSteel);
        strut1.position.set(0, 0, (zStart + zMid) / 2);
        strut1.rotation.x = Math.atan2(strutStep / 2, trussDepth);
        trussGroup.add(strut1);

        const strut2 = new THREE.Mesh(strutGeo, matSteel);
        strut2.position.set(0, 0, (zMid + zEnd) / 2);
        strut2.rotation.x = -Math.atan2(strutStep / 2, trussDepth);
        trussGroup.add(strut2);

        // Vertical upright tie strut
        const vertStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, trussDepth, 8), matSteel);
        vertStrut.position.set(0, 0, zMid);
        trussGroup.add(vertStrut);
      }

      ceilingSteelGroup.add(trussGroup);
    });

    // Longitudinal cross-girders connecting the 5 trusses along the ceiling
    [2.4, 6.0, 9.6, 13.2, 15.8].forEach(zPos => {
      const crossGirder = new THREE.Mesh(new THREE.BoxGeometry(totalW - 0.2, 0.18, 0.18), matSteel);
      crossGirder.position.set(0, DOCK_CEILING_H - 0.55, zPos);
      ceilingSteelGroup.add(crossGirder);
    });

    mergeStaticGroupByMaterial(ceilingSteelGroup);
    scene.add(ceilingSteelGroup);

    // ==========================================
    // SUSPENDED INDUSTRIAL FLUORESCENT LIGHT FIXTURES
    // Suspended directly in front of each dock bay & across staging
    // ==========================================
    const lightFixturePositions = [
      // Row 1: Suspended in front of the 4 dock bays (Z = 1.65m, clear of the Z = 2.4m ceiling cross-girder)
      { x: -10.8, z: 1.65 },
      { x: -3.6, z: 1.65 },
      { x: 3.6, z: 1.65 },
      { x: 10.8, z: 1.65 },
      // Row 2: Across the central staging floor (Z = 8.4m, Row 13)
      { x: -7.2, z: 8.4 },
      { x: 0.0, z: 8.4 },
      { x: 7.2, z: 8.4 }
    ];

    const emissiveTubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const fixtureBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
    const ceilingFixturesGroup = new THREE.Group();

    lightFixturePositions.forEach(pos => {
      const fixtureGroup = new THREE.Group();
      const fixY = 5.3;
      fixtureGroup.position.set(pos.x, fixY, pos.z);

      const fixtureL = 3.4;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(fixtureL, 0.15, 0.38), fixtureBodyMat);
      fixtureGroup.add(housing);

      const tube1 = new THREE.Mesh(new THREE.BoxGeometry(fixtureL - 0.2, 0.05, 0.06), emissiveTubeMat);
      tube1.position.set(0, -0.07, -0.09);
      fixtureGroup.add(tube1);

      const tube2 = new THREE.Mesh(new THREE.BoxGeometry(fixtureL - 0.2, 0.05, 0.06), emissiveTubeMat);
      tube2.position.set(0, -0.07, 0.09);
      fixtureGroup.add(tube2);

      const cableGeo = new THREE.CylinderGeometry(0.015, 0.015, DOCK_CEILING_H - fixY, 6);
      [-fixtureL / 2 + 0.35, fixtureL / 2 - 0.35].forEach(cx => {
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.set(cx, (DOCK_CEILING_H - fixY) / 2, 0);
        fixtureGroup.add(cable);
      });

      ceilingFixturesGroup.add(fixtureGroup);
    });

    mergeStaticGroupByMaterial(ceilingFixturesGroup);
    scene.add(ceilingFixturesGroup);

    // Consolidated dock & staging lights tuned to original industrial brightness without overexposing surfaces
    [
      { x: -6.2, z: 2.2 },
      { x: 6.2, z: 2.2 },
      { x: 0.0, z: 8.6 }
    ].forEach((lp) => {
      const spot = new THREE.PointLight(0xfff8ee, 0.85, 16, 1.6);
      spot.position.set(lp.x, 5.05, lp.z);
      scene.add(spot);
    });

    // ==========================================
    // EAST WALL: SAFETY PLACARDS, PIPING, CONDUITS & BREAKER BOXES
    // Exactly matching Right Wall in Original 3D Rendering
    // ==========================================
    // Hazard Rail continuing around the East wall
    const eastHazardRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 5.8), matHazardRail);
    eastHazardRail.position.set(-ORIGIN_X - 0.08, doorHeight + 0.22, 2.9);
    scene.add(eastHazardRail);

    // Three Safety Signs Mounted Side-by-Side (Y = 2.8m, Z = 2.0 to 4.2)
    const signWarning = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.46),
      new THREE.MeshStandardMaterial({ map: createWarningSignTexture('warning') })
    );
    signWarning.rotation.y = -Math.PI / 2;
    signWarning.position.set(-ORIGIN_X - 0.05, 2.8, 2.2);
    scene.add(signWarning);

    const signDanger = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.46),
      new THREE.MeshStandardMaterial({ map: createWarningSignTexture('danger') })
    );
    signDanger.rotation.y = -Math.PI / 2;
    signDanger.position.set(-ORIGIN_X - 0.05, 2.8, 3.2);
    scene.add(signDanger);

    const signNotice = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.46),
      new THREE.MeshStandardMaterial({ map: createWarningSignTexture('notice') })
    );
    signNotice.rotation.y = -Math.PI / 2;
    signNotice.position.set(-ORIGIN_X - 0.05, 2.8, 4.2);
    scene.add(signNotice);

    // Green emergency push station next to signs
    const emergencyPushBox = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.2), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
    emergencyPushBox.position.set(-ORIGIN_X - 0.06, 1.4, 4.9);
    scene.add(emergencyPushBox);

    // Dual horizontal copper pipes along East wall with 90Â° downward elbows
    const copperPipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 9.5, 16), matCopperPipe);
    copperPipe1.rotation.x = Math.PI / 2;
    copperPipe1.position.set(-ORIGIN_X - 0.15, 5.2, 4.8);
    scene.add(copperPipe1);

    const copperPipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 9.5, 16), matCopperPipe);
    copperPipe2.rotation.x = Math.PI / 2;
    copperPipe2.position.set(-ORIGIN_X - 0.15, 4.8, 4.8);
    scene.add(copperPipe2);

    const copperDrop1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 16), matCopperPipe);
    copperDrop1.position.set(-ORIGIN_X - 0.15, 3.8, 1.6);
    scene.add(copperDrop1);

    // Galvanized electrical conduit pipes along East wall
    const eastConduit = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 9.5, 16), matConduit);
    eastConduit.rotation.x = Math.PI / 2;
    eastConduit.position.set(-ORIGIN_X - 0.1, 4.2, 4.8);
    scene.add(eastConduit);

    // Two Large Industrial Breaker Panels mounted side-by-side
    [-ORIGIN_X - 0.14].forEach(bx => {
      const breaker1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.95, 0.65), matSteelFrame);
      breaker1.position.set(bx, 3.2, 5.5);
      scene.add(breaker1);

      const breaker2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.95, 0.65), matSteelFrame);
      breaker2.position.set(bx, 3.2, 6.3);
      scene.add(breaker2);

      const jBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.35), matSteelFrame);
      jBox.position.set(bx, 4.4, 5.9);
      scene.add(jBox);
    });

    // ==========================================
    // SIDE ROLLUP DOOR (DSD VENDOR ENTRY ONLY)
    // Perfectly sized to wall opening (Width: 2.4m, Height: 3.2m, Centered at Z = 8.4m)
    // Controls & Beacon placed to the North, completely unobstructed by bollards!
    // ==========================================
    const sideRollupDoor = {
      name: "Side Rollup Door",
      worldX: -ORIGIN_X,
      worldZ: sideDoorZ, // Z = 8.4m
      width: sideDoorWidth, // 2.4m
      height: sideDoorHeight, // 3.2m
      isOpen: false,
      currentProgress: 0,
      timeOpen: 0
    };

    const sideRollupGroup = new THREE.Group();
    sideRollupGroup.position.set(sideRollupDoor.worldX, 0, sideRollupDoor.worldZ);

    // Overhead Drum Hood Box
    const sideDrumBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, sideRollupDoor.width + 0.3), matSteelFrame);
    sideDrumBox.position.set(-0.12, sideRollupDoor.height + 0.16, 0);
    sideRollupGroup.add(sideDrumBox);

    const sideDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, sideRollupDoor.width + 0.2, 16), matSteel);
    sideDrum.rotation.x = Math.PI / 2;
    sideDrum.position.set(-0.12, sideRollupDoor.height + 0.16, 0);
    sideRollupGroup.add(sideDrum);

    const sideCurtainGeo = new THREE.PlaneGeometry(sideRollupDoor.width, sideRollupDoor.height);
    const sideCurtain = new THREE.Mesh(sideCurtainGeo, new THREE.MeshStandardMaterial({
      map: rollerDoorTex,
      roughness: 0.65,
      metalness: 0.5,
      side: THREE.DoubleSide
    }));
    sideCurtain.rotation.y = -Math.PI / 2;
    sideCurtain.position.set(0, sideRollupDoor.height / 2, 0);
    sideRollupGroup.add(sideCurtain);
    sideRollupDoor.curtainMesh = sideCurtain;

    // Steel guide tracks flush on door jambs
    [-sideRollupDoor.width / 2, sideRollupDoor.width / 2].forEach(gz => {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.18, sideRollupDoor.height, 0.16), matSteelFrame);
      track.position.set(-0.06, sideRollupDoor.height / 2, gz);
      sideRollupGroup.add(track);
    });

    // ROUNDED HAZARD BOLLARDS flanking side rollup door
    [-sideRollupDoor.width / 2 - 0.2, sideRollupDoor.width / 2 + 0.2].forEach(bz => {
      const sBollard = createRoundedBollard(0.14, 1.35);
      sBollard.position.set(-0.45, 0, bz);
      sideRollupGroup.add(sBollard);

      const wx = sideRollupDoor.worldX - 0.45;
      const wz = sideRollupDoor.worldZ + bz;
      solidWalls.push({
        minX: wx - 0.16,
        maxX: wx + 0.16,
        minZ: wz - 0.16,
        maxZ: wz + 0.16
      });
    });

    // ==========================================
    // SIDE DOOR BUTTON STATION & HIGH BEACON
    // East Wall inner face is at local X = -0.25m (World X = 12.95m).
    // North button panel mounts into clear space between north bollard and computer desk.
    // ==========================================

    // SIDE DOOR NORTH BUTTON STATION (North of door on East wall near desk, local Z = -1.95m / World Z = 6.45m)
    const sideStation = buildDoorControlStation('SIDE DOOR');
    sideStation.group.rotation.y = -Math.PI / 2;
    sideStation.group.position.set(-0.325, 1.45, -1.95);
    sideRollupGroup.add(sideStation.group);
    sideRollupDoor.stationCtrl = sideStation;

    // Continuous conduit running up from North panel top hub (X = -0.313, Y = 1.67m) into side door mechanism (Y = 3.42m):
    // 1. Vertical conduit rising from top of switch box hub to mechanism height (Y = 3.42m)
    const sideNorthConduitVert = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.75, 8), matConduit);
    sideNorthConduitVert.position.set(-0.313, 2.545, -1.95);
    sideRollupGroup.add(sideNorthConduitVert);

    // 2. 90-degree conduit junction elbow at Y = 3.42m, Z = -1.95m
    const sideNorthConduitElbow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), matConduit);
    sideNorthConduitElbow.position.set(-0.313, 3.42, -1.95);
    sideRollupGroup.add(sideNorthConduitElbow);

    // 3. Horizontal conduit running South along wall from Z = -1.95m into the side door mechanism at Z = -1.35m
    const sideNorthConduitHoriz = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.60, 8), matConduit);
    sideNorthConduitHoriz.rotation.x = Math.PI / 2;
    sideNorthConduitHoriz.position.set(-0.313, 3.42, -1.65);
    sideRollupGroup.add(sideNorthConduitHoriz);

    // 4. Industrial conduit fitting entering directly into the top of sideDrumBox
    const sideNorthConduitFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), matSteelFrame);
    sideNorthConduitFlange.rotation.x = Math.PI / 2;
    sideNorthConduitFlange.position.set(-0.313, 3.42, -1.35);
    sideRollupGroup.add(sideNorthConduitFlange);

    // North Button Station Hitbox & Interactible
    const sideNorthHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.60, 0.40), new THREE.MeshBasicMaterial({ visible: false }));
    sideNorthHitbox.position.set(-0.36, 1.45, -1.95);
    sideRollupGroup.add(sideNorthHitbox);

    const sideNorthInteractible = {
      id: 'side_door_north_button',
      type: 'side_door_button',
      name: 'Side Rollup Door Control Panel',
      target: sideRollupDoor,
      mesh: sideNorthHitbox,
      boxCenter: new THREE.Vector3(sideRollupDoor.worldX - 0.33, 1.45, sideRollupDoor.worldZ - 1.95),
      boxSize: new THREE.Vector3(0.26, 0.44, 0.28),
      getPrompt: () => {
        const waiting = (getDeliverySystem() && getDeliverySystem().getWaitingOutsideSessions)
          ? getDeliverySystem().getWaitingOutsideSessions() : [];
        const waitingExit = (getDeliverySystem() && getDeliverySystem().getWaitingExitSessions)
          ? getDeliverySystem().getWaitingExitSessions() : [];
        const moving = (getDeliverySystem() && getDeliverySystem().getMovingDoorSessions)
          ? getDeliverySystem().getMovingDoorSessions() : [];
        if (moving.length > 0) {
          return '[E] Side Door Obstructed (Driver in Door Frame)';
        }
        if (!sideRollupDoor.isOpen && waitingExit.length > 0) {
          return waitingExit.length === 1
            ? `[E] Push Button - OPEN Side Door (${waitingExit[0].delivery.driverName} Waiting to Exit)`
            : `[E] Push Button - OPEN Side Door (${waitingExit.length} Waiting to Exit)`;
        }
        if (!sideRollupDoor.isOpen && waiting.length > 0) {
          return waiting.length === 1
            ? `[E] Push Button - OPEN Side Door (${waiting[0].delivery.driverName} Waiting)`
            : `[E] Push Button - OPEN Side Door (${waiting.length} Waiting Outside)`;
        }
        return `[E] Push Button - ${sideRollupDoor.isOpen ? 'CLOSE' : 'OPEN'} Side Rollup Door`;
      },
      interact: () => {
        const waiting = (getDeliverySystem() && getDeliverySystem().getWaitingOutsideSessions)
          ? getDeliverySystem().getWaitingOutsideSessions() : [];
        const waitingExit = (getDeliverySystem() && getDeliverySystem().getWaitingExitSessions)
          ? getDeliverySystem().getWaitingExitSessions() : [];
        const moving = (getDeliverySystem() && getDeliverySystem().getMovingDoorSessions)
          ? getDeliverySystem().getMovingDoorSessions() : [];
        if (moving.length > 0) {
          showAlert('[[ico:claim]] Stand clear: A driver is standing inside the side door frame.');
          SoundSystem.playErrorBuzzer();
          return;
        }
        sideRollupDoor.isOpen = !sideRollupDoor.isOpen;
        if (sideRollupDoor.stationCtrl) {
          sideRollupDoor.stationCtrl.pressTarget = sideRollupDoor.isOpen ? 'open' : 'close';
          sideRollupDoor.stationCtrl.pressAnim = 1.0;
        }
        if (SoundSystem.playWallSwitch) SoundSystem.playWallSwitch();
        else SoundSystem.playButtonClick();
        const remainingTravel = (sideRollupDoor.isOpen ? (1.0 - sideRollupDoor.currentProgress) : sideRollupDoor.currentProgress);
        const motorTime = Math.max(0.3, remainingTravel * SIDE_DOOR_DURATION);
        SoundSystem.playDoorMotor(motorTime);
        if (sideRollupDoor.isOpen && waitingExit.length > 0) {
          showNotification(`[[ico:lightning]] Side Door opening — letting ${waitingExit.length === 1 ? waitingExit[0].delivery.driverName : waitingExit.length + ' driver(s)'} out.`, 'status');
        } else if (sideRollupDoor.isOpen && waiting.length > 0) {
          showNotification(`[[ico:lightning]] Side Door open — ${waiting.length} waiting outside. Speak [E] to pick who may enter.`, 'low');
        }
      }
    };
    interactibles.push(sideNorthInteractible);
    sideNorthHitbox.userData.interactible = sideNorthInteractible;

    // 3. HIGH-MOUNTED 3-LENS BEACON: Raised to Y = 4.00m on East wall so it clears the button conduit (Y = 3.42m)
    const sideBeaconZ = -sideRollupDoor.width / 2 - 0.55;
    const sideBeaconTee = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.055), matConduit);
    sideBeaconTee.position.set(-0.313, 3.42, sideBeaconZ);
    sideRollupGroup.add(sideBeaconTee);

    const sideBeaconRiser = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), matConduit);
    sideBeaconRiser.position.set(-0.313, 3.51, sideBeaconZ);
    sideRollupGroup.add(sideBeaconRiser);

    const sideBeacon = buildDoorBeaconFixture();
    sideBeacon.group.rotation.y = -Math.PI / 2;
    sideBeacon.group.position.set(-0.36, 4.00, sideBeaconZ);
    sideRollupGroup.add(sideBeacon.group);

    sideRollupDoor.redLens = sideBeacon.redLens;
    sideRollupDoor.amberLens = sideBeacon.amberLens;
    sideRollupDoor.greenLens = sideBeacon.greenLens;
    sideRollupDoor.beaconCtrl = sideBeacon;

    // Outside Delivery Pad visible through open door
    const outdoorPad = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 4.0), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }));
    outdoorPad.rotation.x = -Math.PI / 2;
    outdoorPad.position.set(3.0, 0, 0);
    sideRollupGroup.add(outdoorPad);

    // Outside rounded bollards
    [-1.4, 1.4].forEach(bz => {
      const obollard = createRoundedBollard(0.14, 1.1);
      obollard.position.set(1.5, 0, bz);
      sideRollupGroup.add(obollard);
    });

    // Threshold Security Line on floor
    const thresholdLine = new THREE.Mesh(new THREE.PlaneGeometry(0.18, sideRollupDoor.width), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    thresholdLine.rotation.x = -Math.PI / 2;
    thresholdLine.position.set(-0.05, 0.015, 0);
    sideRollupGroup.add(thresholdLine);

    mergeStaticGroupByMaterial(sideRollupGroup, new Set([sideCurtain, sideStation.group, sideBeacon.group]));
    scene.add(sideRollupGroup);

    // Fire Extinguisher Station moved to East Wall just South of Side Rollup Door (opposite the Computer Desk)
    createFireExtinguisherStation({
      x: -ORIGIN_X - outerWallThickness / 2,
      z: sideDoorMaxZ + 1.05,
      ry: -Math.PI / 2
    });

    // ==========================================
    // CORNER WORKSTATION: OFFICE DESK WITH TWO FILE DRAWERS & RETRO TERMINAL
    // Faithfully matches user reference image with two drawers, retro CRT,
    // keyboard, mouse, document trays, overhead fluorescent light, and wall details
    // ==========================================
    // Mirrored to the North side of Side Rollup Door (sideDoorZ = 13.5 -> 12.12 * TILE_SIZE = +5.088m); geometry kept un-flipped
    const deskPos = { x: -ORIGIN_X - 0.96, z: ORIGIN_Z + 12.12 * TILE_SIZE };
    const deskGroup = new THREE.Group();
    deskGroup.position.set(deskPos.x, 0, deskPos.z);

    const deskLaminateTex = createOfficeDeskLaminateTexture ? createOfficeDeskLaminateTexture() : null;
    const deskChassisTex = createOfficeDeskEnamelTexture ? createOfficeDeskEnamelTexture('chassis') : null;
    const deskDrawerTex = createOfficeDeskEnamelTexture ? createOfficeDeskEnamelTexture('drawer') : null;
    const deskLaminateMat = new THREE.MeshStandardMaterial(
      deskLaminateTex
        ? { map: deskLaminateTex, roughness: 0.46, metalness: 0.04 }
        : { color: 0x6e492c, roughness: 0.48, metalness: 0.04 }
    );
    const deskEdgeTrimMat = new THREE.MeshStandardMaterial({ color: 0x262629, roughness: 0.62, metalness: 0.08 });
    const woodMat = new THREE.MeshStandardMaterial(
      deskChassisTex
        ? { map: deskChassisTex, roughness: 0.56, metalness: 0.22 }
        : { color: 0x898b82, roughness: 0.58, metalness: 0.22 }
    );
    const drawerWoodMat = new THREE.MeshStandardMaterial(
      deskDrawerTex
        ? { map: deskDrawerTex, roughness: 0.54, metalness: 0.24 }
        : { color: 0x777a71, roughness: 0.56, metalness: 0.24 }
    );
    const matCrtCase = new THREE.MeshStandardMaterial({ color: 0xd8d3c7, roughness: 0.55 });
    const matDarkTray = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.4 });

    // 1. Office Desk Tabletop (Honey-Oak Formica Laminate surface with dark 90s T-molding edge trim)
    const deskTopMaterials = [
      deskEdgeTrimMat, deskEdgeTrimMat,
      deskLaminateMat, deskLaminateMat,
      deskEdgeTrimMat, deskEdgeTrimMat
    ];
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 2.3), deskTopMaterials);
    deskTop.position.set(0, 1.05, 0);
    deskGroup.add(deskTop);

    // Make the computer desk solid so the player cannot walk through it
    solidWalls.push({
      minX: deskPos.x - 1.35 / 2,
      maxX: deskPos.x + 1.35 / 2,
      minZ: deskPos.z - 2.3 / 2,
      maxZ: deskPos.z + 2.3 / 2
    });

    // 2. TWO FILE DRAWERS UNDER DESK (Built-in Office Pedestal Cabinet on North Side)
    const pedestal = new THREE.Group();
    pedestal.position.set(0, 0.50, -0.62);

    // Pedestal outer wooden frame
    const pedCasing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.92, 0.72), woodMat);
    pedestal.add(pedCasing);

    // TOP FILE DRAWER (animated group for Phase 2 File Cabinet Archive)
    const topDrawerGroup = new THREE.Group();
    const topDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.66), drawerWoodMat);
    topDrawer.position.set(-0.58, 0.22, 0);
    topDrawerGroup.add(topDrawer);

    // Inner steel drawer tray + hanging manila folders (visible when drawer slides open)
    const topTray = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.24, 0.58), matSteelFrame);
    topTray.position.set(-0.31, 0.16, 0);
    topDrawerGroup.add(topTray);
    const folderMatA = new THREE.MeshLambertMaterial({ color: 0xd8c896 });
    const folderMatB = new THREE.MeshLambertMaterial({ color: 0x6ea88a });
    for (let fi = 0; fi < 5; fi++) {
      const folderMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.23, 0.52),
        fi % 2 === 0 ? folderMatA : folderMatB
      );
      folderMesh.position.set(-0.50 + fi * 0.085, 0.21, 0);
      topDrawerGroup.add(folderMesh);
    }

    // Top Drawer Horizontal Chrome Pull Handle
    const topHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 12), matChrome);
    topHandle.rotation.x = Math.PI / 2;
    topHandle.position.set(-0.62, 0.22, 0);
    topDrawerGroup.add(topHandle);

    // Top Drawer Metal Label Holder Plate
    const topLabel = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.12), matSteelFrame);
    topLabel.position.set(-0.605, 0.31, 0);
    topDrawerGroup.add(topLabel);

    // Top Drawer Cylinder Keyhole Lock
    const keyLock = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 12), matChrome);
    keyLock.rotation.z = Math.PI / 2;
    keyLock.position.set(-0.605, 0.36, 0);
    topDrawerGroup.add(keyLock);

    pedestal.add(topDrawerGroup);

    const TOP_DRAWER_OPEN_X = -0.46;
    const drawerState = {
      topDrawerSlideOpen: false,
      pendingArchiveOpen: false,
      pendingArchiveTimer: 0
    };
    const fileCabinetHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.40, 0.68), new THREE.MeshBasicMaterial({ visible: false }));
    fileCabinetHitbox.position.set(-0.31, 0.22, 0);
    topDrawerGroup.add(fileCabinetHitbox);

    const fileCabinetInteractible = {
      id: 'file_cabinet',
      type: 'file_cabinet',
      name: '90-Day File Cabinet Archive',
      target: topDrawerGroup,
      mesh: fileCabinetHitbox,
      get boxCenter() {
        return new THREE.Vector3(deskPos.x - 0.31 + topDrawerGroup.position.x, 0.72, deskPos.z - 0.62);
      },
      boxSize: new THREE.Vector3(0.64, 0.40, 0.68),
      getPrompt: () => '[E] Open 90-Day File Cabinet Archive',
      interact: () => {
        if (drawerState.pendingArchiveOpen) return;
        if (window.DSDReceipts && window.DSDReceipts.isBlockingModalOpen && window.DSDReceipts.isBlockingModalOpen()) return;
        if (document.exitPointerLock) document.exitPointerLock();
        drawerState.topDrawerSlideOpen = true;
        drawerState.pendingArchiveOpen = true;
        drawerState.pendingArchiveTimer = 0;
        if (typeof SoundSystem !== 'undefined') {
          if (SoundSystem.playMetalClang) SoundSystem.playMetalClang();
          else if (SoundSystem.playButtonClick) SoundSystem.playButtonClick();
          if (SoundSystem.playPaperRustle) SoundSystem.playPaperRustle();
        }
      }
    };
    interactibles.push(fileCabinetInteractible);
    fileCabinetHitbox.userData.interactible = fileCabinetInteractible;

    // BOTTOM DEEP FILE DRAWER
    const btmDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.66), drawerWoodMat);
    btmDrawer.position.set(-0.58, -0.22, 0);
    pedestal.add(btmDrawer);

    // Bottom Drawer Horizontal Chrome Pull Handle
    const btmHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 12), matChrome);
    btmHandle.rotation.x = Math.PI / 2;
    btmHandle.position.set(-0.62, -0.22, 0);
    pedestal.add(btmHandle);

    // Bottom Drawer Metal Label Holder Plate
    const btmLabel = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.12), matSteelFrame);
    btmLabel.position.set(-0.605, -0.13, 0);
    pedestal.add(btmLabel);

    deskGroup.add(pedestal);

    // Desk Corner Legs (South Kneehole Side + North File Cabinet Side)
    [[-0.55, 0.98], [0.55, 0.98], [-0.55, -1.00], [0.55, -1.00]].forEach(lp => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.01, 0.09), woodMat);
      leg.position.set(lp[0], 0.505, lp[1]);
      leg.userData.isDeskLeg = true;
      deskGroup.add(leg);
    });

    // Inner Pedestal Cabinet Floor Support Feet (prevents floating 4cm gap on kneehole side)
    [[-0.52, -0.31], [0.52, -0.31]].forEach(fp => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), woodMat);
      foot.position.set(fp[0], 0.025, fp[1]);
      foot.userData.isDeskLeg = true;
      deskGroup.add(foot);
    });

    // Rear Kneehole Modesty Panel
    const modestyPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.65, 1.3), woodMat);
    modestyPanel.position.set(0.54, 0.68, 0.35);
    deskGroup.add(modestyPanel);

    // 3. RETRO TERMINAL COMPUTER (Positioned halfway between North Tray/Folder and South Printer)
    const crtGroup = new THREE.Group();
    // Monitor at X = +0.22, Z = -0.06
    crtGroup.position.set(0.22, 1.09, -0.06);
    crtGroup.rotation.y = -Math.PI / 2; // Screen faces directly West towards the player

    // Swivel Monitor Base Pedestal
    const monitorBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), matCrtCase);
    monitorBase.position.set(0, 0.03, 0);
    crtGroup.add(monitorBase);

    const monitorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.08, 16), matCrtCase);
    monitorStem.position.set(0, 0.08, 0);
    crtGroup.add(monitorStem);

    // CRT Chassis & Bevel Bezel
    const monitorChassis = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.52, 0.52), matCrtCase);
    monitorChassis.position.set(0, 0.38, 0);
    crtGroup.add(monitorChassis);

    const monitorBezel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.06), matCrtCase);
    monitorBezel.position.set(0, 0.38, 0.26);
    crtGroup.add(monitorBezel);

    // Phosphor Screen Face
    const crtScreen = createCrtScreenDisplay();
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.38),
      new THREE.MeshBasicMaterial({ map: crtScreen.texture })
    );
    screenMesh.position.set(0, 0.38, 0.292);
    crtGroup.add(screenMesh);

    // Monitor Front Bezel Controls (Knobs, Switch, Green Power LED)
    const powerLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    powerLed.position.set(0.20, 0.17, 0.295);
    crtGroup.add(powerLed);

    const dial1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.015, 12), matSteelFrame);
    dial1.rotation.x = Math.PI / 2;
    dial1.position.set(0.14, 0.17, 0.295);
    crtGroup.add(dial1);

    const rockerSwitch = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.015), matSteel);
    rockerSwitch.position.set(0.08, 0.17, 0.295);
    crtGroup.add(rockerSwitch);

    deskGroup.add(crtGroup);

    // Receiving Terminal Interactible Hitbox & Registration
    const terminalHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), new THREE.MeshBasicMaterial({ visible: false }));
    terminalHitbox.position.set(0.22, 1.45, -0.06);
    deskGroup.add(terminalHitbox);

    const terminalInteractible = {
      id: 'terminal',
      type: 'terminal',
      name: 'Receiving Computer Terminal',
      target: null,
      mesh: terminalHitbox,
      boxCenter: new THREE.Vector3(deskPos.x + 0.22, 1.45, deskPos.z - 0.06),
      boxSize: new THREE.Vector3(0.68, 0.65, 0.68),
      getPrompt: () => '[E] Access Receiving Terminal Manifest',
      interact: () => {
        openTerminal();
      }
    };
    interactibles.push(terminalInteractible);
    terminalHitbox.userData.interactible = terminalInteractible;

    // 4. CHUNKY 90s MECHANICAL KEYBOARD DIRECTLY IN FRONT OF MONITOR (approx. 0.56m x 0.22m footprint)
    // Aligned with monitor at Z = -0.06, Model-M wedged beige shell + 3D raised key zones + coiled cord
    const kbGroup = new THREE.Group();
    kbGroup.position.set(-0.34, 1.09, -0.06);
    kbGroup.rotation.y = -Math.PI / 2; // Spacebar faces West towards player, rear cable faces East towards CRT

    const kbShellTex = createKeyboardShellTexture ? createKeyboardShellTexture() : null;
    const kbShellMat = new THREE.MeshStandardMaterial(
      kbShellTex
        ? { map: kbShellTex, roughness: 0.58, metalness: 0.05 }
        : { color: 0xd7d1c3, roughness: 0.58, metalness: 0.05 }
    );
    const kbWellMat = new THREE.MeshStandardMaterial({ color: 0x262a33, roughness: 0.78 });
    const kbSkirtMat = new THREE.MeshStandardMaterial({ color: 0xb5ae9e, roughness: 0.62 });

    // 4A. Lower rubberized tilt feet & thick ABS bottom plinth (gives chunky rear lift)
    [-0.21, 0.21].forEach((fx) => {
      const tiltFoot = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.022), matBlackRubber);
      tiltFoot.position.set(fx, 0.007, -0.088);
      kbGroup.add(tiltFoot);
    });
    const kbLowerBase = new THREE.Mesh(new THREE.BoxGeometry(0.556, 0.020, 0.214), kbSkirtMat);
    kbLowerBase.position.set(0, 0.015, 0.002);
    kbGroup.add(kbLowerBase);

    // 4B. Wedged upper shell + recessed keywell + 3D sculpted key clusters tilted toward user
    const kbTopTilt = new THREE.Group();
    kbTopTilt.position.set(0, 0.028, 0.004);
    kbTopTilt.rotation.x = 0.095; // Classic Model-M forward typing wedge slope

    const kbMainBody = new THREE.Mesh(new THREE.BoxGeometry(0.560, 0.024, 0.216), kbShellMat);
    kbMainBody.position.set(0, 0, 0);
    kbTopTilt.add(kbMainBody);

    // Chunky side & wrist bezel rails around the recessed keybed
    const kbBackForehead = new THREE.Mesh(new THREE.BoxGeometry(0.560, 0.018, 0.044), kbShellMat);
    kbBackForehead.position.set(0, 0.018, -0.084);
    kbTopTilt.add(kbBackForehead);

    const kbFrontLip = new THREE.Mesh(new THREE.BoxGeometry(0.560, 0.011, 0.022), kbShellMat);
    kbFrontLip.position.set(0, 0.013, 0.096);
    kbTopTilt.add(kbFrontLip);

    [-0.268, 0.268].forEach((bx) => {
      const sideBezel = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.148), kbShellMat);
      sideBezel.position.set(bx, 0.015, 0.011);
      kbTopTilt.add(sideBezel);
    });

    // Dark recessed steel keybed well plate
    const kbWell = new THREE.Mesh(new THREE.BoxGeometry(0.514, 0.004, 0.148), kbWellMat);
    kbWell.position.set(0, 0.012, 0.011);
    kbTopTilt.add(kbWell);

    // Raised 3D keycap cluster blocks + top-plate printed legends (Main, Function, Nav, Numpad)
    const kbMainTex = createKeyboardTexture('main');
    const kbFuncTex = createKeyboardTexture('func');
    const kbNavTex = createKeyboardTexture('nav');
    const kbNumTex = createKeyboardTexture('numpad');
    const kbBadgeTex = createKeyboardTexture('badge');

    function addKeyCluster(cw, cd, cx, cz, topTex) {
      const cBlock = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.011, cd), kbSkirtMat);
      cBlock.position.set(cx, 0.018, cz);
      kbTopTilt.add(cBlock);
      const cTop = new THREE.Mesh(
        new THREE.PlaneGeometry(cw, cd),
        new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.56 })
      );
      cTop.rotation.x = -Math.PI / 2;
      cTop.position.set(cx, 0.0238, cz);
      kbTopTilt.add(cTop);
    }

    // Function row strip (top rear of keybed)
    addKeyCluster(0.320, 0.024, -0.092, -0.044, kbFuncTex);
    // Main QWERTY + Spacebar cluster (with raised Model-M Spacebar cap)
    addKeyCluster(0.320, 0.106, -0.092, 0.028, kbMainTex);
    const spacebarCap = new THREE.Mesh(new THREE.BoxGeometry(0.128, 0.005, 0.018), kbShellMat);
    spacebarCap.position.set(-0.103, 0.0242, 0.067);
    kbTopTilt.add(spacebarCap);
    // Navigation & Inverted-T Arrow cluster
    addKeyCluster(0.068, 0.106, 0.114, 0.028, kbNavTex);
    // Warehouse Numeric Keypad cluster
    addKeyCluster(0.090, 0.106, 0.204, 0.028, kbNumTex);

    // Upper forehead status badge & Num/Caps/Scroll LED strip
    const kbBadgePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.240, 0.032),
      new THREE.MeshStandardMaterial({ map: kbBadgeTex, roughness: 0.42 })
    );
    kbBadgePlate.rotation.x = -Math.PI / 2;
    kbBadgePlate.position.set(0.132, 0.0274, -0.084);
    kbTopTilt.add(kbBadgePlate);

    kbGroup.add(kbTopTilt);

    // Coiled 90s PS/2 cable exiting the back edge toward the CRT monitor
    for (let ci = 0; ci < 7; ci++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0028, 8, 12), matBlackRubber);
      coil.position.set(0.12, 0.012, -0.116 - ci * 0.011);
      kbGroup.add(coil);
    }
    const kbCordLead = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 8), matBlackRubber);
    kbCordLead.rotation.x = Math.PI / 2;
    kbCordLead.position.set(0.12, 0.006, -0.255);
    kbGroup.add(kbCordLead);

    const keyboard = kbGroup;
    deskGroup.add(keyboard);

    // (Mouse and mousepad removed to open South side of desk for the dot-matrix printer)

    // 6. 2-TIER "INBOX / OUTBOX" WIRE DOCUMENT TRAY
    // Positioned on the North-East rear of desk (X = +0.26, Z = -0.72), well back from the Daily Filing folder
    const docTrayGroup = new THREE.Group();
    docTrayGroup.position.set(0.26, 1.09, -0.72);
    docTrayGroup.rotation.y = -Math.PI / 2; // Facing West towards player

    // Lower Tray (OUTBOX)
    const outboxTray = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.06, 0.40), matDarkTray);
    outboxTray.position.set(0, 0.03, 0);
    docTrayGroup.add(outboxTray);

    // 4 Connecting Risers
    [[-0.14, -0.18], [0.14, -0.18], [-0.14, 0.18], [0.14, 0.18]].forEach(rp => {
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), matSteel);
      riser.position.set(rp[0], 0.10, rp[1]);
      docTrayGroup.add(riser);
    });

    // Upper Tray (INBOX)
    const inboxTray = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.06, 0.40), matDarkTray);
    inboxTray.position.set(0, 0.16, 0);
    docTrayGroup.add(inboxTray);

    // Staged Paper Invoice inside INBOX Tray (visibility tracks Night Drops & Pinned Reference)
    const invoicePaper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.32),
      new THREE.MeshBasicMaterial({ map: createInvoiceSheetTexture() })
    );
    invoicePaper.rotation.x = -Math.PI / 2;
    invoicePaper.rotation.z = 0.06;
    invoicePaper.position.set(0, 0.192, 0);
    docTrayGroup.add(invoicePaper);

    const deskPapersHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.38), new THREE.MeshBasicMaterial({ visible: false }));
    deskPapersHitbox.position.set(0.26, 1.25, -0.72);
    deskGroup.add(deskPapersHitbox);

    const deskPapersInteractible = {
      id: 'desk_papers',
      type: 'desk_papers',
      name: 'Desk Inbox Tray (Night Drops & Pinned Docs)',
      target: docTrayGroup,
      mesh: deskPapersHitbox,
      boxCenter: new THREE.Vector3(deskPos.x + 0.26, 1.25, deskPos.z - 0.72),
      boxSize: new THREE.Vector3(0.46, 0.34, 0.38),
      getPrompt: () => {
        const nd = window.DSDReceipts ? window.DSDReceipts.getNightDropCount() : 0;
        const pin = window.DSDReceipts ? window.DSDReceipts.getPinnedCount() : 0;
        return (nd + pin > 0)
          ? `[E] Inspect Night Drops (${nd}) & Pinned Ref (${pin})`
          : '[E] Desk Inbox Tray (Empty)';
      },
      interact: () => {
        if (document.exitPointerLock) document.exitPointerLock();
        if (window.DSDReceipts) window.DSDReceipts.openNightDropPanel(hooks.getTerminalModalOpen ? hooks.getTerminalModalOpen() : false);
      }
    };
    interactibles.push(deskPapersInteractible);
    deskPapersHitbox.userData.interactible = deskPapersInteractible;

    // 6B. DAILY FILING MANILA FOLDER (North-West tabletop directly in front of the Night-Drop Inbox/Outbox Tray)
    const manilaFolderGroup = new THREE.Group();
    manilaFolderGroup.position.set(-0.38, 1.095, -0.72);
    manilaFolderGroup.rotation.y = 0.08;

    const folderCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.012, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xe6c17a, roughness: 0.78 })
    );
    manilaFolderGroup.add(folderCover);

    const folderTab = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.013, 0.11),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65 })
    );
    folderTab.position.set(0.12, 0.001, -0.07);
    manilaFolderGroup.add(folderTab);

    const folderSheet = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.006, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    folderSheet.position.set(-0.005, 0.009, 0);
    manilaFolderGroup.add(folderSheet);

    deskGroup.add(manilaFolderGroup);

    const filingFolderHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.35), new THREE.MeshBasicMaterial({ visible: false }));
    filingFolderHitbox.position.set(-0.38, 1.11, -0.72);
    deskGroup.add(filingFolderHitbox);

    const filingFolderInteractible = {
      id: 'filing_folder',
      type: 'filing_folder',
      name: 'Daily Filing Folder',
      target: manilaFolderGroup,
      mesh: filingFolderHitbox,
      boxCenter: new THREE.Vector3(deskPos.x - 0.38, 1.11, deskPos.z - 0.72),
      boxSize: new THREE.Vector3(0.28, 0.05, 0.35),
      getPrompt: () => {
        const done = window.DSDReceipts && window.DSDReceipts.isFilingComplete();
        return done ? '[E] Daily Filing Folder (Filed ✓)' : '[E] Open Daily Filing Folder';
      },
      interact: () => {
        if (document.exitPointerLock) document.exitPointerLock();
        if (window.DSDReceipts) window.DSDReceipts.openFilingOverlay();
      }
    };
    interactibles.push(filingFolderInteractible);
    filingFolderHitbox.userData.interactible = filingFolderInteractible;

    deskGroup.add(docTrayGroup);

    // 6C. OLD-SCHOOL 1990s DOT-MATRIX RECEIPT PRINTER (Mounted in open South half of desk, facing West toward player)
    const printerGroup = new THREE.Group();
    printerGroup.position.set(0.06, 1.09, 0.64);
    printerGroup.rotation.y = -Math.PI / 2; // Front control panel faces West (-X) toward the player

    const matPrinterIvory = new THREE.MeshStandardMaterial({ color: 0xddd6c6, roughness: 0.62 });
    const matPrinterTrim = new THREE.MeshStandardMaterial({ color: 0xbeb5a2, roughness: 0.7 });
    const matPrinterDark = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 });
    const matPrinterCavity = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.85 });
    const matAcousticLid = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.22,
      metalness: 0.1,
      transparent: true,
      opacity: 0.56
    });

    // 4 Rubber isolation feet
    [[-0.21, -0.16], [0.21, -0.16], [-0.21, 0.16], [0.21, 0.16]].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.014, 10), matPrinterDark);
      foot.position.set(fx, 0.007, fz);
      printerGroup.add(foot);
    });

    // Lower beige printer base chassis
    const printerBase = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.095, 0.39), matPrinterIvory);
    printerBase.position.set(0, 0.061, 0);
    printerGroup.add(printerBase);

    // Sloped upper rear cowl
    const printerRearCowl = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.065, 0.15), matPrinterTrim);
    printerRearCowl.position.set(0, 0.135, -0.11);
    printerGroup.add(printerRearCowl);

    // Left & Right side cheek towers around carriage opening
    [-0.22, 0.22].forEach((cx) => {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.062, 0.21), matPrinterIvory);
      cheek.position.set(cx, 0.135, 0.06);
      printerGroup.add(cheek);
    });

    // Recessed dark mechanical carriage cavity
    const carriageBed = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.032, 0.17), matPrinterCavity);
    carriageBed.position.set(0, 0.112, 0.04);
    printerGroup.add(carriageBed);

    // Black rubber platen roller (horizontal cylinder along X)
    const platenRoller = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 16), matPrinterDark);
    platenRoller.rotation.z = Math.PI / 2;
    platenRoller.position.set(0, 0.132, 0.02);
    printerGroup.add(platenRoller);

    // Steel printhead guide bar + traveling printhead shuttle + ribbon cartridge
    const guideBar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 10), matChrome);
    guideBar.rotation.z = Math.PI / 2;
    guideBar.position.set(0, 0.138, 0.085);
    printerGroup.add(guideBar);

    const printHead = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.038, 0.045), matPrinterDark);
    printHead.position.set(-0.07, 0.142, 0.08);
    printerGroup.add(printHead);

    const ribbonCart = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.016, 0.038), matSteelFrame);
    ribbonCart.position.set(-0.02, 0.142, 0.105);
    printerGroup.add(ribbonCart);

    // Tractor-feed paper sprocket hubs (left & right)
    [-0.145, 0.145].forEach((tx) => {
      const tractor = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.024, 0.036), matPrinterTrim);
      tractor.position.set(tx, 0.148, -0.01);
      printerGroup.add(tractor);
    });

    // Smoked tinted acrylic acoustic shield cover tilted cleanly over the carriage
    const acousticLid = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.012, 0.165), matAcousticLid);
    acousticLid.position.set(0, 0.172, 0.055);
    acousticLid.rotation.x = 0.22;
    printerGroup.add(acousticLid);

    // Side manual platen feed knob (extending right / +X in local frame -> South +Z in world)
    const knobShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 10), matChrome);
    knobShaft.rotation.z = Math.PI / 2;
    knobShaft.position.set(0.26, 0.132, 0.02);
    printerGroup.add(knobShaft);

    const platenKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.024, 14), matPrinterDark);
    platenKnob.rotation.z = Math.PI / 2;
    platenKnob.position.set(0.278, 0.132, 0.02);
    printerGroup.add(platenKnob);

    // Front Bezel Angled Operator Membrane Control Strip (right front apron)
    const ctrlPanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.016, 0.055), matPrinterDark);
    ctrlPanel.position.set(0.15, 0.112, 0.165);
    ctrlPanel.rotation.x = 0.24;
    printerGroup.add(ctrlPanel);

    const printerOnlineLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.008, 0.010),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    printerOnlineLed.position.set(0.105, 0.121, 0.158);
    printerGroup.add(printerOnlineLed);

    const printerPowerLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.008, 0.010),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    printerPowerLed.position.set(0.082, 0.121, 0.158);
    printerGroup.add(printerPowerLed);

    [0.145, 0.175, 0.205].forEach((bx, bIdx) => {
      const btnMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.020, 0.009, 0.020),
        new THREE.MeshStandardMaterial({ color: bIdx === 0 ? 0x64748b : 0x94a3b8, roughness: 0.5 })
      );
      btnMesh.position.set(bx, 0.120, 0.168);
      btnMesh.rotation.x = 0.24;
      printerGroup.add(btnMesh);
    });

    // Rear fanfold continuous perforated paper stack + printed receipt strip exiting front top
    const fanfoldStack = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.032, 0.18),
      new THREE.MeshLambertMaterial({ color: 0xf1f5f9 })
    );
    fanfoldStack.position.set(0, 0.016, -0.29);
    printerGroup.add(fanfoldStack);

    const fanfoldRise = new THREE.Mesh(
      new THREE.PlaneGeometry(0.27, 0.17),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
    );
    fanfoldRise.position.set(0, 0.105, -0.20);
    fanfoldRise.rotation.x = -0.35;
    printerGroup.add(fanfoldRise);

    const printerReceiptCanvas = document.createElement('canvas');
    printerReceiptCanvas.width = 192;
    printerReceiptCanvas.height = 192;
    const prCtx = printerReceiptCanvas.getContext('2d');
    prCtx.fillStyle = '#f8fafc';
    prCtx.fillRect(0, 0, 192, 192);
    // Tractor perforation holes left & right
    prCtx.fillStyle = '#cbd5e1';
    for (let py = 10; py < 190; py += 18) {
      prCtx.beginPath(); prCtx.arc(10, py, 3.2, 0, Math.PI * 2); prCtx.fill();
      prCtx.beginPath(); prCtx.arc(182, py, 3.2, 0, Math.PI * 2); prCtx.fill();
    }
    // Green-bar dot matrix bands & sample printed lines
    prCtx.fillStyle = '#dcfce7';
    for (let py = 24; py < 180; py += 36) prCtx.fillRect(22, py, 148, 16);
    prCtx.fillStyle = '#1e293b';
    prCtx.font = 'bold 11px monospace';
    prCtx.fillText('STORES DSD RECEIPT', 32, 20);
    prCtx.font = '10px monospace';
    for (let py = 36; py < 176; py += 16) prCtx.fillText('--------------------------', 24, py);
    const printerReceiptTex = new THREE.CanvasTexture(printerReceiptCanvas);

    const printerPaperStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.22),
      new THREE.MeshBasicMaterial({ map: printerReceiptTex, side: THREE.DoubleSide })
    );
    printerPaperStrip.position.set(0, 0.195, 0.06);
    printerPaperStrip.rotation.x = 0.62;
    printerGroup.add(printerPaperStrip);

    // Printed receipt stack resting out on top/front catch when hand-scanner prints await pickup
    const printerTrayOutput = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.012, 0.19),
      new THREE.MeshBasicMaterial({ map: printerReceiptTex })
    );
    printerTrayOutput.position.set(0, 0.132, 0.27);
    printerTrayOutput.rotation.x = 0.14;
    printerTrayOutput.visible = false;
    printerGroup.add(printerTrayOutput);

    deskGroup.add(printerGroup);

    const printerState = {
      printingTimer: 0,
      trayCount: 0
    };

    function syncPrinterTrayVisual(count) {
      printerState.trayCount = count || 0;
      printerTrayOutput.visible = printerState.trayCount > 0;
      if (printerState.printingTimer <= 0) {
        printerOnlineLed.material.color.setHex(printerState.trayCount > 0 ? 0xf59e0b : 0x22c55e);
      }
    }

    function triggerPrinterPrint() {
      printerState.printingTimer = 0.75;
      printerPaperStrip.position.y = 0.225;
      printerPaperStrip.position.z = 0.085;
      printerOnlineLed.material.color.setHex(0x4ade80);
      printHead.position.x = 0.08;
      setTimeout(() => {
        printerState.printingTimer = 0;
        printerPaperStrip.position.y = 0.195;
        printerPaperStrip.position.z = 0.06;
        printHead.position.x = -0.07;
        printerOnlineLed.material.color.setHex(printerState.trayCount > 0 ? 0xf59e0b : 0x22c55e);
      }, 420);
    }

    const printerHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.56), new THREE.MeshBasicMaterial({ visible: false }));
    printerHitbox.position.set(0.06, 1.24, 0.64);
    deskGroup.add(printerHitbox);

    const printerInteractible = {
      id: 'dot_matrix_printer',
      type: 'printer',
      name: 'Dot-Matrix Receipt Printer',
      target: printerGroup,
      mesh: printerHitbox,
      boxCenter: new THREE.Vector3(deskPos.x + 0.06, 1.24, deskPos.z + 0.64),
      boxSize: new THREE.Vector3(0.54, 0.30, 0.54),
      getPrompt: () => {
        const tray = window.DSDReceipts && window.DSDReceipts.getPrinterTrayCount ? window.DSDReceipts.getPrinterTrayCount() : 0;
        if (tray > 0) {
          return `[E] Pick Up Printed Receipt${tray > 1 ? 's' : ''} from Printer (${tray} waiting)`;
        }
        const slips = window.DSDReceipts && window.DSDReceipts.getPrintedSlipsCount ? window.DSDReceipts.getPrintedSlipsCount() : 0;
        return slips > 0
          ? `[E] Dot-Matrix Printer (${slips} Printed Receipt${slips > 1 ? 's' : ''} Held)`
          : '[E] Dot-Matrix Printer (Tray Empty — Print in Terminal [2])';
      },
      interact: () => {
        if (window.DSDReceipts && typeof window.DSDReceipts.collectPrinterTraySlips === 'function') {
          window.DSDReceipts.collectPrinterTraySlips();
        } else if (window.DSDReceipts && typeof window.DSDReceipts.togglePrintedReceiptHud === 'function') {
          window.DSDReceipts.togglePrintedReceiptHud(true);
        }
      }
    };
    interactibles.push(printerInteractible);
    printerHitbox.userData.interactible = printerInteractible;

    // 6D. OFFICE TRASH CAN UNDER THE DESK (Discards duplicate or unneeded receipt print-outs)
    const trashCanGroup = new THREE.Group();
    trashCanGroup.position.set(-0.32, 0, 0.68); // Under South kneehole floor, visible & easy to target

    const matTrashBody = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 });
    const matTrashRim = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const matTrashLiner = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, side: THREE.DoubleSide });

    const trashOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.132, 0.36, 14, 1, true), matTrashBody);
    trashOuter.position.y = 0.18;
    trashCanGroup.add(trashOuter);

    const trashBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.015, 14), matTrashRim);
    trashBottom.position.y = 0.008;
    trashCanGroup.add(trashBottom);

    const trashInnerLiner = new THREE.Mesh(new THREE.CylinderGeometry(0.156, 0.125, 0.34, 14, 1, true), matTrashLiner);
    trashInnerLiner.position.y = 0.185;
    trashCanGroup.add(trashInnerLiner);

    const trashRim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.012, 8, 18), matTrashRim);
    trashRim.rotation.x = Math.PI / 2;
    trashRim.position.y = 0.36;
    trashCanGroup.add(trashRim);

    // Crumpled paper balls inside wastebasket
    const crumpleGeo = new THREE.DodecahedronGeometry(0.042, 0);
    const matCrumple = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
    [[-0.04, 0.16, 0.03], [0.05, 0.14, -0.02], [0.0, 0.19, -0.04]].forEach(([cx, cy, cz], ci) => {
      const wad = new THREE.Mesh(crumpleGeo, matCrumple);
      wad.position.set(cx, cy, cz);
      wad.rotation.set(ci * 0.7, ci * 1.1, ci * 0.4);
      trashCanGroup.add(wad);
    });

    deskGroup.add(trashCanGroup);

    const trashCanHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
    trashCanHitbox.position.set(-0.32, 0.22, 0.68);
    deskGroup.add(trashCanHitbox);

    const trashCanInteractible = {
      id: 'desk_trash_can',
      type: 'trash_can',
      name: 'Under-Desk Trash Can',
      target: trashCanGroup,
      mesh: trashCanHitbox,
      boxCenter: new THREE.Vector3(deskPos.x - 0.32, 0.22, deskPos.z + 0.68),
      boxSize: new THREE.Vector3(0.42, 0.44, 0.42),
      getPrompt: () => {
        const slips = window.DSDReceipts && window.DSDReceipts.getPrintedSlipsCount ? window.DSDReceipts.getPrintedSlipsCount() : 0;
        return slips > 0
          ? `[E] Trash Can — Choose Receipt Print-Outs to Discard (${slips} held)`
          : '[E] Trash Can Under Desk (No Held Receipt)';
      },
      interact: () => {
        const slips = window.DSDReceipts && window.DSDReceipts.getPrintedSlipsCount ? window.DSDReceipts.getPrintedSlipsCount() : 0;
        if (slips <= 0) return;
        if (document.exitPointerLock) document.exitPointerLock();
        if (typeof SoundSystem !== 'undefined' && SoundSystem.playMetalClang) SoundSystem.playMetalClang();
        if (window.DSDReceipts && typeof window.DSDReceipts.openTrashCanDialog === 'function') {
          window.DSDReceipts.openTrashCanDialog();
        }
      }
    };
    interactibles.push(trashCanInteractible);
    trashCanHitbox.userData.interactible = trashCanInteractible;

    mergeStaticGroupByMaterial(
      deskGroup,
      new Set([topDrawerGroup, screenMesh, powerLed, printerPaperStrip, printerTrayOutput, printHead, printerOnlineLed, invoicePaper])
    );
    scene.add(deskGroup);

    // 7. OVERHEAD FLUORESCENT SHOP LIGHT FIXTURE (With Industrial Cantilever Wall Support Fixtures)
    const innerEastWallX = -ORIGIN_X - outerWallThickness / 2; // 12.95m
    const overheadLightGroup = new THREE.Group();
    overheadLightGroup.position.set(deskPos.x, 2.95, deskPos.z);

    const lightHood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 1.4), matSteelFrame);
    overheadLightGroup.add(lightHood);

    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfffaed });
    [-0.08, 0.08].forEach(tx => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.3, 12), tubeMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(tx, -0.04, 0);
      overheadLightGroup.add(tube);
    });

    const deskLight = new THREE.PointLight(0xffedd5, 1.1, 7, 1.8);
    deskLight.position.set(0, -0.15, 0);
    overheadLightGroup.add(deskLight);

    // INDUSTRIAL WALL-MOUNT CANTILEVER BRACKETS & CONDUIT (Supports light fixture from the East Wall!)
    const wallArmSpan = innerEastWallX - deskPos.x; // 0.95m span from light center to concrete East wall

    // Twin heavy-gauge steel cantilever support arms at North and South ends of fixture
    [-0.45, 0.45].forEach(zArm => {
      // Horizontal cantilever Unistrut / box channel arm running from hood back into East wall
      const arm = new THREE.Mesh(new THREE.BoxGeometry(wallArmSpan, 0.045, 0.045), matSteelFrame);
      arm.position.set(wallArmSpan / 2, 0.05, zArm);
      overheadLightGroup.add(arm);

      // Heavy industrial wall mounting anchor plate flush on the concrete East wall
      const wallPlate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.30, 0.14), matSteel);
      wallPlate.position.set(wallArmSpan - 0.012, -0.06, zArm);
      overheadLightGroup.add(wallPlate);

      // Corner anchor bolts on wall plate
      [[-0.11, -0.045], [-0.11, 0.045], [0.03, -0.045], [0.03, 0.045]].forEach(bp => {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), matSteelFrame);
        bolt.rotation.z = Math.PI / 2;
        bolt.position.set(wallArmSpan - 0.022, bp[0], zArm + bp[1]);
        overheadLightGroup.add(bolt);
      });

      // 45-degree diagonal triangular knee brace / support gusset
      const braceHypot = Math.hypot(wallArmSpan * 0.55, 0.18);
      const braceAngle = Math.atan2(0.18, wallArmSpan * 0.55);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(braceHypot, 0.035, 0.035), matSteelFrame);
      brace.rotation.z = -braceAngle;
      brace.position.set(wallArmSpan * 0.725, -0.065, zArm);
      overheadLightGroup.add(brace);

      // Structural fixture saddle clamp where arm grips light hood
      const saddleClamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.06), matSteel);
      saddleClamp.position.set(0, 0.05, zArm);
      overheadLightGroup.add(saddleClamp);
    });

    // Electrical power conduit feeding the light fixture from the East wall
    const lightJunction = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), matSteel);
    lightJunction.position.set(wallArmSpan - 0.04, 0.14, 0);
    overheadLightGroup.add(lightJunction);

    const lightConduit = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, wallArmSpan - 0.06, 8), matConduit);
    lightConduit.rotation.z = Math.PI / 2;
    lightConduit.position.set((wallArmSpan - 0.06) / 2, 0.14, 0);
    overheadLightGroup.add(lightConduit);

    const lightConduitDrop = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8), matConduit);
    lightConduitDrop.position.set(0, 0.09, 0);
    overheadLightGroup.add(lightConduitDrop);

    scene.add(overheadLightGroup);

    // 8. INDUSTRIAL ANALOG WALL CLOCK
    // Mirrored to the North side of the Side Door near the desk on the East Wall (Z = deskPos.z + 0.72m = 5.808m).
    // Positioned at Y = 2.35m: higher than door button panels (Y = 1.45m ~ 1.64m),
    // but lower than the computer desk light fixture (Y = 2.95m)!
    const clockGroup = new THREE.Group();
    clockGroup.position.set(innerEastWallX - 0.02, 2.35, deskPos.z + 0.72);
    clockGroup.rotation.y = -Math.PI / 2; // Facing West towards player and receiving workstation

    // Wall mounting bracket base ring
    const clockWallPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 32), matSteelFrame);
    clockWallPlate.rotation.x = Math.PI / 2;
    clockWallPlate.position.z = 0.01;
    clockGroup.add(clockWallPlate);

    // Circular steel clock bezel housing
    const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 32), matSteel);
    clockBody.rotation.x = Math.PI / 2;
    clockBody.position.z = 0.045;
    clockGroup.add(clockBody);

    // Analog clock dial face with numerals and tick marks
    const clockMesh = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), new THREE.MeshBasicMaterial({ map: createClockTexture() }));
    clockMesh.position.z = 0.082;
    clockGroup.add(clockMesh);

    // 3D Clock Hands (pivoting around local Z; 12 o'clock is +Y, clockwise is negative Z rotation)
    const matClockHandDark = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const matClockHandRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    const clockHourPivot = new THREE.Group();
    clockHourPivot.position.z = 0.086;
    const clockHourMesh = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.195, 0.004), matClockHandDark);
    clockHourMesh.position.y = 0.0675; // Extends -0.030 to +0.165
    clockHourPivot.add(clockHourMesh);
    clockGroup.add(clockHourPivot);

    const clockMinutePivot = new THREE.Group();
    clockMinutePivot.position.z = 0.091;
    const clockMinuteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.285, 0.004), matClockHandDark);
    clockMinuteMesh.position.y = 0.1025; // Extends -0.040 to +0.245
    clockMinutePivot.add(clockMinuteMesh);
    clockGroup.add(clockMinutePivot);

    const clockSecondPivot = new THREE.Group();
    clockSecondPivot.position.z = 0.096;
    const clockSecondMesh = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.330, 0.003), matClockHandRed);
    clockSecondMesh.position.y = 0.100; // Extends -0.065 to +0.265
    clockSecondPivot.add(clockSecondMesh);
    clockGroup.add(clockSecondPivot);

    const clockCenterCap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), matClockHandRed);
    clockCenterCap.rotation.x = Math.PI / 2;
    clockCenterCap.position.z = 0.098;
    clockGroup.add(clockCenterCap);

    scene.add(clockGroup);

    const wallClock = {
      group: clockGroup,
      hourHand: clockHourPivot,
      minuteHand: clockMinutePivot,
      secondHand: clockSecondPivot,
      useSystemTime: false,
      setTime(hours, minutes, seconds, milliseconds = 0, smoothSweep = false) {
        const h = ((hours % 12) + 12) % 12;
        const m = ((minutes % 60) + 60) % 60;
        const rawSec = seconds + milliseconds / 1000;
        const s = ((rawSec % 60) + 60) % 60;

        let displaySec = s;
        if (!smoothSweep) {
          // Realistic quartz 1-second tick with a crisp 75ms snap and subtle overshoot
          const secInt = Math.floor(s);
          const secFrac = s - secInt;
          const tickDuration = 0.075;
          displaySec = secInt;
          if (secFrac < tickDuration) {
            const t = secFrac / tickDuration;
            const overshoot = 1.35;
            const u = t - 1;
            const eased = 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
            displaySec = (secInt - 1) + eased;
          }
        }

        const secondAngle = (displaySec / 60) * Math.PI * 2;
        const exactMinutes = m + s / 60;
        const minuteAngle = (exactMinutes / 60) * Math.PI * 2;
        const exactHours = h + exactMinutes / 60;
        const hourAngle = (exactHours / 12) * Math.PI * 2;

        this.secondHand.rotation.z = -secondAngle;
        this.minuteHand.rotation.z = -minuteAngle;
        this.hourHand.rotation.z = -hourAngle;
      },
      update() {
        if (this.useSystemTime) {
          const now = new Date();
          this.setTime(
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
            now.getMilliseconds()
          );
        }
      }
    };
    wallClock.update();

    // ==========================================
    // SOUTH WALL & COLD STORAGE ENCLOSURE (Row 16/17)
    // Solid Bulkhead from Y = 4.2m to 7.2m completely closes off ceiling gap!
    // Insulated Dividing Wall & Enclosure Roof Deck seal the rooms completely
    // ==========================================
    const southDividingZ = ORIGIN_Z + 17 * TILE_SIZE; // Z = 16.8m
    const coldBulkheadH = DOCK_CEILING_H - COLD_CEILING_H; // 7.2 - 4.2 = 3.0m

    // 1. Solid Overhead Bulkhead Wall spanning across Row 17 from Y = 4.2m to 7.2m
    // Completely walls off the freezer and cooler, meeting the dock ceiling (7.2m) and side walls!
    const coldBulkhead = new THREE.Mesh(
      new THREE.BoxGeometry(totalW, coldBulkheadH, 0.45),
      matWallDock
    );
    coldBulkhead.position.set(0, COLD_CEILING_H + coldBulkheadH / 2, southDividingZ);
    applyWorldWallUVs(coldBulkhead);
    scene.add(coldBulkhead);

    // 2. Cold Storage Top Enclosure Roof Deck (spanning Rows 17 to 21, Z: 16.8m to 26.4m)
    const coldRoofDepth = (ORIGIN_Z + totalD) - southDividingZ; // 9.6m
    const coldRoofDeck = new THREE.Mesh(
      new THREE.BoxGeometry(totalW, 0.25, coldRoofDepth),
      matCeiling
    );
    coldRoofDeck.position.set(0, COLD_CEILING_H + 0.12, southDividingZ + coldRoofDepth / 2);
    scene.add(coldRoofDeck);

    // 2B. Wrap embossed insulated cold-room wall panels onto the remaining interior walls of Freezer & Cooler
    // Row 22 (Z = 28.80m..31.20m) is the solid red bulkhead behind Freezer/Cooler; Rows 23-24 form the West-turning hallway!
    const coldRoomInnerZ = ORIGIN_Z + 18 * TILE_SIZE; // 19.20m
    const coldBackWallZ = ORIGIN_Z + 22 * TILE_SIZE;  // 28.80m
    const coldRoomBackZ = coldBackWallZ;              // flush against North face of Row 22 bulkhead
    const coldSideLen = coldRoomBackZ - coldRoomInnerZ;
    const coldSideMidZ = coldRoomInnerZ + coldSideLen / 2;
    const coldDoorRevealZ = coldRoomInnerZ - 0.60; // 18.60m

    const hallMinX = ORIGIN_X + 10 * TILE_SIZE;  // 10.8m (outer red column)
    const hallMaxX = innerEastWallX;             // 12.95m (inner face of East wall)
    const hallWestX = ORIGIN_X + outerWallThickness / 2; // -12.95m (in line with Freezer West wall)
    const hallClearW = hallMaxX - hallMinX;      // 2.15m
    const hallCenterX = (hallMinX + hallMaxX) / 2; // 11.875m
    const hallEndZ = ORIGIN_Z + totalD - outerWallThickness / 2; // 35.75m (Row 24 inner South wall)
    const hallNorthZ = ORIGIN_Z + 23 * TILE_SIZE;                // 31.20m (South face of Row 22 bulkhead)
    const hallWestCenterZ = (hallNorthZ + hallEndZ) / 2;         // 33.475m

    const coldWallSpecs = [
      // Freezer (cols 0-3, X: -12.95 to -3.60, doorway at col 2: -8.40 to -6.00)
      { x: ORIGIN_X + outerWallThickness / 2 + 0.015, z: coldSideMidZ, w: coldSideLen, ry: Math.PI / 2 },
      { x: ORIGIN_X + 4 * TILE_SIZE - 0.015, z: coldSideMidZ, w: coldSideLen, ry: -Math.PI / 2 },
      { x: -10.675, z: coldRoomInnerZ + 0.015, w: 4.55, ry: 0 },
      { x: -4.80, z: coldRoomInnerZ + 0.015, w: 2.40, ry: 0 },
      { x: ORIGIN_X + 2 * TILE_SIZE + 0.015, z: coldDoorRevealZ, w: 1.20, ry: Math.PI / 2 },
      { x: ORIGIN_X + 3 * TILE_SIZE - 0.015, z: coldDoorRevealZ, w: 1.20, ry: -Math.PI / 2 },
      { x: (ORIGIN_X + outerWallThickness / 2 + ORIGIN_X + 4 * TILE_SIZE) / 2, z: coldRoomBackZ - 0.015, w: 4 * TILE_SIZE - outerWallThickness / 2, ry: Math.PI },
      // Cooler (cols 5-8, X: -1.20 to +8.40, doorway at col 6: +1.20 to +3.60)
      { x: ORIGIN_X + 5 * TILE_SIZE + 0.015, z: coldSideMidZ, w: coldSideLen, ry: Math.PI / 2 },
      { x: ORIGIN_X + 9 * TILE_SIZE - 0.015, z: coldSideMidZ, w: coldSideLen, ry: -Math.PI / 2 },
      { x: 0.00, z: coldRoomInnerZ + 0.015, w: 2.40, ry: 0 },
      { x: 6.00, z: coldRoomInnerZ + 0.015, w: 4.80, ry: 0 },
      { x: ORIGIN_X + 6 * TILE_SIZE + 0.015, z: coldDoorRevealZ, w: 1.20, ry: Math.PI / 2 },
      { x: ORIGIN_X + 7 * TILE_SIZE - 0.015, z: coldDoorRevealZ, w: 1.20, ry: -Math.PI / 2 },
      { x: ORIGIN_X + 7 * TILE_SIZE, z: coldRoomBackZ - 0.015, w: 4 * TILE_SIZE, ry: Math.PI }
    ];
    const coldWallMatCache = {};
    coldWallSpecs.forEach((spec) => {
      const key = spec.w.toFixed(2);
      if (!coldWallMatCache[key]) {
        coldWallMatCache[key] = new THREE.MeshStandardMaterial({
          map: createInsulatedPanelTexture(spec.w / TILE_SIZE, 1, true),
          roughness: 0.38,
          metalness: 0.28
        });
      }
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(spec.w, COLD_CEILING_H),
        coldWallMatCache[key]
      );
      panel.position.set(spec.x, COLD_CEILING_H / 2, spec.z);
      panel.rotation.y = spec.ry;
      scene.add(panel);
    });

    // 3. Consistent floor-to-wall black & yellow hazard kickrails along all Dock & Hallway walls
    // Every rail matches (0.16m H x 0.04m D) and breaks cleanly across all doors, jambs, and doorways.
    const innerWestWallX = ORIGIN_X + outerWallThickness / 2; // -12.95m
    // Dock South wall (breaks at Freezer door Col 2, Cooler door Col 6, and Hallway opening Col 10)
    addWallKickrailSegments('x', southDividingZ - 0.02, [
      [innerWestWallX, ORIGIN_X + 2 * TILE_SIZE - 0.02],
      [ORIGIN_X + 3 * TILE_SIZE + 0.02, ORIGIN_X + 6 * TILE_SIZE - 0.02],
      [ORIGIN_X + 7 * TILE_SIZE + 0.02, hallMinX]
    ]);
    // Dock West wall (breaks cleanly across Sales Floor double black doors at Z = 8.05m..11.15m)
    addWallKickrailSegments('z', innerWestWallX + 0.02, [
      [doorZ + 0.20, westDoorMinZ],
      [westDoorMaxZ, southDividingZ - 0.04]
    ]);
    // Dock East wall (breaks cleanly across Side Rollup Door Z = 7.20m..9.60m and Hallway portal jamb at 16.57m)
    addWallKickrailSegments('z', innerEastWallX - 0.02, [
      [doorZ + 0.20, sideDoorMinZ],
      [sideDoorMaxZ, southDividingZ - 0.23]
    ]);

    // 3B. L-SHAPED EMPLOYEE HALLWAY (Col 10 Rows 17-23, turning West across Rows 22-23 to Freezer West Wall)
    // Hallway Entrance Portal Trim
    const hallPortalBeam = new THREE.Mesh(
      new THREE.BoxGeometry(hallClearW + 0.04, 0.12, 0.46),
      matSteelFrame
    );
    hallPortalBeam.position.set(hallCenterX, COLD_CEILING_H - 0.06, southDividingZ);
    scene.add(hallPortalBeam);

    [hallMinX + 0.03, hallMaxX - 0.03].forEach((jx) => {
      const hallJamb = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, COLD_CEILING_H, 0.46),
        matSteelFrame
      );
      hallJamb.position.set(jx, COLD_CEILING_H / 2, southDividingZ);
      scene.add(hallJamb);
    });

    // Leg 1 (along Cooler): Keep floor completely unobstructed; add simple wall-mounted safety & guidelines posters
    const posterSpecs = [
      { variant: 'safety_lift', x: hallMaxX - 0.02, z: 19.2, ry: -Math.PI / 2 },
      { variant: 'guidelines', x: hallMinX + 0.02, z: 22.0, ry: Math.PI / 2 },
      { variant: 'safety_exit', x: hallMaxX - 0.02, z: 25.2, ry: -Math.PI / 2 }
    ];
    posterSpecs.forEach((ps) => {
      const frame = new THREE.Group();
      frame.position.set(ps.x, 1.66, ps.z);
      frame.rotation.y = ps.ry;
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.022), matSteelFrame);
      frame.add(backing);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.70),
        new THREE.MeshBasicMaterial({ map: createHallwayPosterTexture(ps.variant) })
      );
      art.position.z = 0.013;
      frame.add(art);
      scene.add(frame);
    });

    // Leg 1 West & East Wall Base Hazard Kickrails inside Hallway (starting South of portal jambs at Z = 17.03m)
    addWallKickrailSegments('z', hallMinX + 0.02, [
      [southDividingZ + 0.23, hallNorthZ]
    ]);
    addWallKickrailSegments('z', hallMaxX - 0.02, [
      [southDividingZ + 0.23, hallEndZ - 0.04]
    ]);

    // Full South Wall Concrete Finish & Base Kickrail (breaks across Store Manager, Breakroom & Broom Closet doors)
    const hallFullW = hallMaxX - hallWestX;
    const hallSouthPanel = new THREE.Mesh(
      new THREE.BoxGeometry(hallFullW, COLD_CEILING_H, 0.05),
      matWallDock
    );
    hallSouthPanel.position.set((hallWestX + hallMaxX) / 2, COLD_CEILING_H / 2, hallEndZ - 0.02);
    applyWorldWallUVs(hallSouthPanel);
    scene.add(hallSouthPanel);

    addWallKickrailSegments('x', hallEndZ - 0.055, [
      [hallWestX + 0.04, -3.17],
      [-2.03, 1.78],
      [3.02, 6.27],
      [7.33, hallMaxX - 0.04]
    ]);

    // North Wall Base Hazard Kickrail along West-running Hallway (Cols 0..9, Z = 31.22m)
    addWallKickrailSegments('x', hallNorthZ + 0.02, [
      [hallWestX + 0.04, hallMinX]
    ]);

    // West End Wall Concrete Finish & Kickrail (breaks cleanly across Sales Floor double black doors)
    const hallWestDepth = hallEndZ - hallNorthZ;
    const hallWestPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, COLD_CEILING_H, hallWestDepth),
      matWallDock
    );
    hallWestPanel.position.set(hallWestX + 0.02, COLD_CEILING_H / 2, hallWestCenterZ);
    applyWorldWallUVs(hallWestPanel);
    scene.add(hallWestPanel);

    addWallKickrailSegments('z', hallWestX + 0.055, [
      [hallNorthZ + 0.04, hallWestCenterZ - 1.25],
      [hallWestCenterZ + 1.25, hallEndZ - 0.04]
    ]);

    // Overhead Fluorescent Strip Fixtures & Lighting in both N-S and E-W Hallway legs
    const matHallLamp = new THREE.MeshBasicMaterial({ color: 0xfffaed });
    const hallFixturesGroup = new THREE.Group();
    [southDividingZ + 2.4, southDividingZ + 6.4, southDividingZ + 10.4, hallEndZ - 2.2].forEach((lz) => {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 1.35), matSteelFrame);
      hood.position.set(hallCenterX, COLD_CEILING_H - 0.04, lz);
      hallFixturesGroup.add(hood);
      [-0.07, 0.07].forEach((lxOff) => {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.25, 10), matHallLamp);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(hallCenterX + lxOff, COLD_CEILING_H - 0.08, lz);
        hallFixturesGroup.add(tube);
      });
    });
    [7.2, 1.2, -4.8, -10.2].forEach((lx) => {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.28), matSteelFrame);
      hood.position.set(lx, COLD_CEILING_H - 0.04, hallWestCenterZ);
      hallFixturesGroup.add(hood);
      [-0.07, 0.07].forEach((lzOff) => {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.25, 10), matHallLamp);
        tube.rotation.z = Math.PI / 2;
        tube.position.set(lx, COLD_CEILING_H - 0.08, hallWestCenterZ + lzOff);
        hallFixturesGroup.add(tube);
      });
    });
    mergeStaticGroupByMaterial(hallFixturesGroup);
    scene.add(hallFixturesGroup);

    [9.2, 1.0, -7.2].forEach((lx) => {
      const hallLight = new THREE.PointLight(0xffedd5, 0.72, 16, 1.5);
      hallLight.position.set(lx, 3.55, hallWestCenterZ);
      scene.add(hallLight);
    });

    // ---------------------------------------------------------
    // 1. EXPANDED TIMECLOCK AREA (East Wall at Hallway Corner, facing West)
    // ---------------------------------------------------------
    const tcCenterZ = hallWestCenterZ;
    const tcDeskShelf = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 1.66), woodMat);
    tcDeskShelf.position.set(hallMaxX - 0.20, 0.96, tcCenterZ);
    scene.add(tcDeskShelf);

    [-0.64, 0.64].forEach((bz) => {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.05), matSteelFrame);
      bracket.position.set(hallMaxX - 0.17, 0.82, tcCenterZ + bz);
      scene.add(bracket);
    });

    const tcShelfClipboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.02, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
    );
    tcShelfClipboard.position.set(hallMaxX - 0.18, 1.00, tcCenterZ + 0.42);
    scene.add(tcShelfClipboard);

    const timeclockDisplay = createHallwayTimeclockDisplay();
    const timeclockGroup = new THREE.Group();
    timeclockGroup.position.set(hallMaxX - 0.12, 1.54, tcCenterZ);
    timeclockGroup.rotation.y = Math.PI / 2; // local -Z face points West (-X) into the hallway

    const tcHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.50, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.55 })
    );
    timeclockGroup.add(tcHousing);

    const tcFaceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.27),
      new THREE.MeshBasicMaterial({ map: timeclockDisplay.texture })
    );
    tcFaceMesh.position.set(0, 0.075, -0.082);
    tcFaceMesh.rotation.y = Math.PI;
    timeclockGroup.add(tcFaceMesh);

    const tcTray = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.08), matSteelFrame);
    tcTray.position.set(0, -0.14, -0.09);
    timeclockGroup.add(tcTray);

    const tcPunchSlot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.03), matBlackRubber);
    tcPunchSlot.position.set(0, -0.105, -0.084);
    timeclockGroup.add(tcPunchSlot);

    const tcCardSample = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.09, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 })
    );
    tcCardSample.position.set(0, -0.08, -0.10);
    timeclockGroup.add(tcCardSample);
    scene.add(timeclockGroup);

    // Placard above Timeclock + Directional Sign pointing North toward Receiving Dock
    const tcHeaderSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.24),
      new THREE.MeshBasicMaterial({ map: createHallwayDoorSignTexture('TIMECLOCK STATION', 'PUNCH OUT [E] AFTER 12:00 PM', '#0f172a', '#f59e0b') })
    );
    tcHeaderSign.position.set(hallMaxX - 0.02, 2.02, tcCenterZ);
    tcHeaderSign.rotation.y = -Math.PI / 2;
    scene.add(tcHeaderSign);

    const tcDockDirSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.26),
      new THREE.MeshBasicMaterial({ map: createHallwayDoorSignTexture('← RECEIVING DOCK', 'BACK TO TRUCK BAYS', '#0f172a', '#38bdf8') })
    );
    tcDockDirSign.position.set(hallMaxX - 0.02, 2.02, tcCenterZ - 1.15);
    tcDockDirSign.rotation.y = -Math.PI / 2;
    scene.add(tcDockDirSign);

    // Twin Steel Timecard Racks flanking North & South of the Timeclock
    const matTimecard = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.85 });
    [tcCenterZ - 0.62, tcCenterZ + 0.62].forEach((rz, rackIdx) => {
      const cardRackGroup = new THREE.Group();
      cardRackGroup.position.set(hallMaxX - 0.03, 1.48, rz);
      cardRackGroup.rotation.y = -Math.PI / 2;
      cardRackGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.68, 0.05), matSteelFrame));
      for (let ci = 0; ci < 7; ci++) {
        const slotPocket = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.03, 0.025), matSteel);
        slotPocket.position.set(0, -0.24 + ci * 0.08, 0.032);
        cardRackGroup.add(slotPocket);
        if ((ci + rackIdx) % 2 === 0 || ci === 3) {
          const card = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.008), matTimecard);
          card.position.set(0, -0.205 + ci * 0.08, 0.035);
          cardRackGroup.add(card);
        }
      }
      scene.add(cardRackGroup);
    });

    // Shift Schedule & Labor Bulletin Board on East Wall beside Timeclock
    const noticeZ = hallEndZ - 0.80;
    const corkMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
    const noticeFrame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.80, 0.96), matSteelFrame);
    noticeFrame.position.set(hallMaxX - 0.02, 1.56, noticeZ);
    scene.add(noticeFrame);
    const noticeCork = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.72, 0.88), corkMat);
    noticeCork.position.set(hallMaxX - 0.022, 1.56, noticeZ);
    scene.add(noticeCork);
    [-0.22, 0.08].forEach((nz, ni) => {
      const sheet = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.28, 0.22),
        new THREE.MeshStandardMaterial({ color: ni === 0 ? 0xf8fafc : 0xfef08a, roughness: 0.8 })
      );
      sheet.position.set(hallMaxX - 0.025, 1.62 - ni * 0.14, noticeZ + nz);
      scene.add(sheet);
    });

    solidWalls.push({
      minX: hallMaxX - 0.44,
      maxX: hallMaxX + 0.05,
      minZ: tcCenterZ - 0.86,
      maxZ: tcCenterZ + 0.86
    });

    // Timeclock Interactible ([E] to Punch Out at End of Shift — clean margin around housing/tray/card)
    const timeclockHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.60, 0.50),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    timeclockHitbox.position.set(hallMaxX - 0.15, 1.50, tcCenterZ);
    scene.add(timeclockHitbox);

    const timeclockInteractible = {
      id: 'hallway_timeclock',
      type: 'timeclock',
      name: 'Employee Timeclock',
      mesh: timeclockHitbox,
      boxCenter: new THREE.Vector3(hallMaxX - 0.15, 1.50, tcCenterZ),
      boxSize: new THREE.Vector3(0.30, 0.60, 0.50),
      getPrompt: () => {
        const afterNoon = global.ShiftClock && typeof global.ShiftClock.isAfterNoon === 'function'
          ? global.ShiftClock.isAfterNoon()
          : false;
        return afterNoon
          ? '[E] Punch Out at Timeclock (End Shift)'
          : '[E] Employee Timeclock (Punch Out Opens 12:00 PM)';
      },
      interact: () => {
        if (typeof hooks.onPunchOutTimeclock === 'function') {
          hooks.onPunchOutTimeclock();
        }
      }
    };
    interactibles.push(timeclockInteractible);
    timeclockHitbox.userData.interactible = timeclockInteractible;

    // ---------------------------------------------------------
    // 2. FULL ROW OF 12 EMPLOYEE LOCKERS (North Wall, facing South)
    // ---------------------------------------------------------
    const lockerCount = 12;
    const lockerSpacing = 0.46;
    const lockerGroup = new THREE.Group();
    lockerGroup.position.set(6.96, 0, hallNorthZ + 0.27); // X: +4.20 .. +9.72, facing South (+Z)
    lockerGroup.rotation.y = Math.PI;

    const matLockerBody = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.55 });
    const matLockerDoor = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.42, metalness: 0.55 });
    const matLockerTrim = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.35 });
    const matNamePlate = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.2 });

    const lockerPlinth = new THREE.Mesh(new THREE.BoxGeometry(lockerCount * lockerSpacing + 0.04, 0.10, 0.48), matLockerTrim);
    lockerPlinth.position.set(0, 0.05, 0);
    lockerGroup.add(lockerPlinth);

    const midIdx = (lockerCount - 1) / 2;
    for (let li = 0; li < lockerCount; li++) {
      const lx = (li - midIdx) * lockerSpacing;
      const unit = new THREE.Group();
      unit.position.set(lx, 0.10, 0);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.84, 0.46), matLockerBody);
      body.position.set(0, 0.92, 0.01);
      unit.add(body);

      const door = new THREE.Mesh(new THREE.BoxGeometry(0.40, 1.78, 0.025), matLockerDoor);
      door.position.set(0, 0.92, -0.225);
      unit.add(door);

      const topSlope = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.46), matLockerBody);
      topSlope.position.set(0, 1.87, 0.01);
      topSlope.rotation.x = 0.16;
      unit.add(topSlope);

      [1.60, 1.54, 1.48, 0.30, 0.24, 0.18].forEach((vy) => {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.012), matLockerTrim);
        vent.position.set(0, vy, -0.238);
        unit.add(vent);
      });

      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.012), matNamePlate);
      plate.position.set(0, 1.70, -0.238);
      unit.add(plate);

      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.025), matChrome);
      handle.position.set(-0.14, 0.96, -0.242);
      unit.add(handle);

      lockerGroup.add(unit);
    }
    scene.add(lockerGroup);

    solidWalls.push(
      { minX: 4.16, maxX: 9.76, minZ: hallNorthZ, maxZ: hallNorthZ + 0.54 }
    );

    // ---------------------------------------------------------
    // 3. COAT RACK & HANGING COATS AREA (North Wall beside Lockers, X: 1.7..3.7)
    // ---------------------------------------------------------
    const coatCenterX = 2.70;
    const coatRackGroup = new THREE.Group();
    coatRackGroup.position.set(coatCenterX, 0, hallNorthZ + 0.04);

    // Molded oak backboard + chamfered lower trim strip
    const coatRail = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.20, 0.045), woodMat);
    coatRail.position.set(0, 1.66, 0.02);
    coatRackGroup.add(coatRail);

    const coatTopShelf = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.04, 0.28), woodMat);
    coatTopShelf.position.set(0, 1.78, 0.14);
    coatRackGroup.add(coatTopShelf);

    // Steel shelf support corbel brackets + front lip rail
    [-0.78, 0, 0.78].forEach((bx) => {
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.22), matSteelFrame);
      corbel.position.set(bx, 1.69, 0.11);
      coatRackGroup.add(corbel);
    });

    // Folded hard hat, knit cap & work gloves resting cleanly on top shelf
    const hardHatMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 });
    const hardHat = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hardHatMat);
    hardHat.position.set(-0.52, 1.80, 0.15);
    coatRackGroup.add(hardHat);
    const hardHatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 16), hardHatMat);
    hardHatBrim.position.set(-0.52, 1.805, 0.15);
    coatRackGroup.add(hardHatBrim);

    const capBeanie = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.095, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.9 })
    );
    capBeanie.position.set(0.45, 1.84, 0.15);
    coatRackGroup.add(capBeanie);

    const glovesBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.04, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 })
    );
    glovesBox.position.set(0.05, 1.82, 0.15);
    coatRackGroup.add(glovesBox);

    const coatSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.20),
      new THREE.MeshBasicMaterial({ map: createHallwayDoorSignTexture('COATS & PPE', 'HANG GEAR HERE', '#1e293b', '#e2e8f0') })
    );
    coatSign.position.set(0, 2.06, 0.01);
    coatRackGroup.add(coatSign);

    const coatSpecs = [
      { x: -0.72, color: 0x1e3a8a, vest: false, hood: true, len: 0.78 },
      { x: -0.36, color: 0xfacc15, vest: true, hood: false, len: 0.62 },
      { x: 0.0, color: 0x334155, vest: false, hood: true, len: 0.80 },
      { x: 0.36, color: 0x7c2d12, vest: false, hood: false, len: 0.72 }
    ];
    [-0.72, -0.36, 0.0, 0.36, 0.72].forEach((hx, idx) => {
      // Twin-prong brass/chrome coat hook + rosette plate
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.015), matChrome);
      plate.position.set(hx, 1.63, 0.045);
      coatRackGroup.add(plate);
      const pegTop = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.06, 0.075), matChrome);
      pegTop.position.set(hx, 1.65, 0.075);
      coatRackGroup.add(pegTop);
      const pegLow = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.045, 0.055), matChrome);
      pegLow.position.set(hx, 1.60, 0.065);
      coatRackGroup.add(pegLow);

      const cs = coatSpecs[idx];
      if (cs) {
        const coatMat = new THREE.MeshStandardMaterial({ color: cs.color, roughness: 0.82 });
        const trimMat = new THREE.MeshStandardMaterial({ color: cs.vest ? 0xe2e8f0 : 0x0f172a, roughness: 0.5 });
        const topY = 1.56 - (cs.len - 0.62) * 0.45;

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.27, cs.len, 0.11), coatMat);
        body.position.set(hx, topY - 0.04, 0.11);
        body.rotation.z = (idx % 2 === 0 ? 0.025 : -0.025);
        coatRackGroup.add(body);

        const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.125), coatMat);
        shoulders.position.set(hx, 1.55, 0.11);
        coatRackGroup.add(shoulders);

        // Hanging side sleeves & center seam/reflective stripe
        [-0.145, 0.145].forEach((sx) => {
          const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.07, cs.len * 0.68, 0.085), coatMat);
          sleeve.position.set(hx + sx, 1.32, 0.11);
          sleeve.rotation.z = sx > 0 ? -0.05 : 0.05;
          coatRackGroup.add(sleeve);
        });
        if (cs.vest) {
          [-0.08, 0.14].forEach((vyOff) => {
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.118), trimMat);
            stripe.position.set(hx, topY + vyOff, 0.11);
            coatRackGroup.add(stripe);
          });
        } else {
          const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.018, cs.len * 0.88, 0.116), trimMat);
          zipper.position.set(hx, topY - 0.03, 0.112);
          coatRackGroup.add(zipper);
        }
        if (cs.hood) {
          const hood = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.09), coatMat);
          hood.position.set(hx, 1.63, 0.13);
          coatRackGroup.add(hood);
        }
      }
    });

    // Rubberized slatted boot mat + work boots waiting on the floor tray
    const bootTray = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.035, 0.34), matLockerTrim);
    bootTray.position.set(0, 0.018, 0.17);
    coatRackGroup.add(bootTray);
    const bootTrayLip = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.045, 0.03), matBlackRubber);
    bootTrayLip.position.set(0, 0.022, 0.34);
    coatRackGroup.add(bootTrayLip);
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.78 });
    [-0.58, -0.44, 0.44, 0.58].forEach((bx) => {
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.24), bootMat);
      sole.position.set(bx, 0.095, 0.19);
      coatRackGroup.add(sole);
    });
    scene.add(coatRackGroup);

    solidWalls.push({
      minX: coatCenterX - 0.98,
      maxX: coatCenterX + 0.98,
      minZ: hallNorthZ,
      maxZ: hallNorthZ + 0.38
    });

    // ---------------------------------------------------------
    // 4. VENDING MACHINE ALCOVE (North Wall, facing South +Z)
    // ---------------------------------------------------------
    [
      { x: -0.95, kind: 'soda', bodyColor: 0x991b1b },
      { x: -2.20, kind: 'snack', bodyColor: 0x1e293b }
    ].forEach((vm) => {
      const vg = new THREE.Group();
      vg.position.set(vm.x, 0, hallNorthZ + 0.45);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.02, 1.94, 0.84),
        new THREE.MeshStandardMaterial({ color: vm.bodyColor, roughness: 0.45, metalness: 0.45 })
      );
      body.position.set(0, 0.97, 0);
      vg.add(body);
      const front = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 1.78),
        new THREE.MeshBasicMaterial({ map: createVendingFrontTexture(vm.kind) })
      );
      front.position.set(0, 0.99, 0.422);
      vg.add(front);
      scene.add(vg);
    });

    // Detailed Break Trash Receptacle beside Vending Machines (tapered bin, folded white liner rim, dome swing lid)
    const vendTrashGroup = new THREE.Group();
    vendTrashGroup.position.set(-3.16, 0, hallNorthZ + 0.30);
    const trashBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.62, metalness: 0.15 });
    const trashRimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
    const trashLidMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55 });
    const trashBase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.42), trashBodyMat);
    trashBase.position.y = 0.31;
    vendTrashGroup.add(trashBase);
    // Vertical molded ribs & liner bag cuff
    [-0.17, 0, 0.17].forEach((rx) => {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.56, 0.435), matSteelFrame);
      rib.position.set(rx, 0.31, 0);
      vendTrashGroup.add(rib);
    });
    const linerCuff = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.44), trashRimMat);
    linerCuff.position.y = 0.63;
    vendTrashGroup.add(linerCuff);
    const domeHood = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.18, 0.43), trashLidMat);
    domeHood.position.y = 0.74;
    vendTrashGroup.add(domeHood);
    const swingFlap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.02), matChrome);
    swingFlap.position.set(0, 0.74, 0.215);
    swingFlap.rotation.x = -0.14;
    vendTrashGroup.add(swingFlap);
    scene.add(vendTrashGroup);

    solidWalls.push({
      minX: -3.45,
      maxX: -0.40,
      minZ: hallNorthZ,
      maxZ: hallNorthZ + 0.92
    });

    // ---------------------------------------------------------
    // 5. CLOSED DECORATIVE ROOM DOORS (ALL facing away from Dock/Freezer/Cooler; strictly non-openable)
    // ---------------------------------------------------------
    function createDecorativeHallDoor(opts) {
      const grp = new THREE.Group();
      const totalW = opts.doubleDoor ? (opts.width || 2.30) : (opts.width || 0.98);
      const doorH = opts.height || 2.18;
      grp.position.set(
        opts.x !== undefined ? opts.x : 0,
        0,
        opts.z !== undefined ? opts.z : (hallEndZ - 0.045)
      );
      grp.rotation.y = opts.ry !== undefined ? opts.ry : Math.PI; // Default: South wall facing North; West wall uses ry = Math.PI/2

      const frameT = 0.075;
      [-totalW / 2 - frameT / 2, totalW / 2 + frameT / 2].forEach((jx) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(frameT, doorH + 0.04, 0.09), matSteelFrame);
        post.position.set(jx, (doorH + 0.04) / 2, 0.02);
        grp.add(post);
      });
      const header = new THREE.Mesh(new THREE.BoxGeometry(totalW + frameT * 2, 0.08, 0.09), matSteelFrame);
      header.position.set(0, doorH + 0.04, 0.02);
      grp.add(header);

      const leafMat = new THREE.MeshStandardMaterial({
        color: opts.color || 0x475569,
        roughness: opts.blackDoor ? 0.55 : 0.48,
        metalness: opts.blackDoor ? 0.25 : 0.35
      });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.4, opacity: 0.65, transparent: true });
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8 });

      if (opts.doubleDoor) {
        const leafW = totalW / 2 - 0.015;
        [-1, 1].forEach((side) => {
          const lx = side * (leafW / 2 + 0.01);
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH, 0.055), leafMat);
          leaf.position.set(lx, doorH / 2, 0);
          grp.add(leaf);

          const kick = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.08, 0.42, 0.012), matChrome);
          kick.position.set(lx, 0.24, 0.032);
          grp.add(kick);

          const bumper = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.14, 0.10, 0.025), matSteel);
          bumper.position.set(lx, 1.06, 0.036);
          grp.add(bumper);

          const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.56, 0.014), matSteelFrame);
          winFrame.position.set(lx - side * 0.12, 1.62, 0.030);
          grp.add(winFrame);
          const pane = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.50, 0.018), glassMat);
          pane.position.set(lx - side * 0.12, 1.62, 0.032);
          grp.add(pane);
        });
      } else {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(totalW, doorH, 0.055), leafMat);
        leaf.position.set(0, doorH / 2, 0);
        grp.add(leaf);

        const kick = new THREE.Mesh(new THREE.BoxGeometry(totalW - 0.08, 0.24, 0.01), matChrome);
        kick.position.set(0, 0.14, 0.03);
        grp.add(kick);

        if (opts.window) {
          const pane = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.014), glassMat);
          pane.position.set(0, 1.60, 0.028);
          grp.add(pane);
        }
        if (opts.louvers) {
          for (let v = 0; v < 5; v++) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(totalW * 0.58, 0.025, 0.014), matSteelFrame);
            slat.position.set(0, 0.42 + v * 0.06, 0.03);
            grp.add(slat);
          }
        }
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.032, 0.045), opts.brass ? brassMat : matChrome);
        lever.position.set(totalW * 0.34, 1.02, 0.042);
        grp.add(lever);
      }

      if (opts.signTitle) {
        const placard = new THREE.Mesh(
          new THREE.PlaneGeometry(opts.doubleDoor ? 1.48 : 0.78, 0.22),
          new THREE.MeshBasicMaterial({
            map: createHallwayDoorSignTexture(opts.signTitle, opts.signSub || '', opts.signBg || '#0f172a', opts.signFg || '#f8fafc')
          })
        );
        placard.position.set(0, doorH + 0.24, 0.02);
        grp.add(placard);
      }

      scene.add(grp);
    }

    // Broom Closet, Breakroom, & Store Manager's Office along South Wall
    createDecorativeHallDoor({
      x: 6.80,
      width: 0.90,
      color: 0x64748b,
      louvers: true,
      signTitle: 'BROOM CLOSET',
      signSub: 'JANITORIAL SUPPLIES',
      signBg: '#1e293b',
      signFg: '#cbd5e1'
    });
    createDecorativeHallDoor({
      x: 2.40,
      width: 1.08,
      color: 0x0f766e,
      window: true,
      signTitle: 'BREAKROOM',
      signSub: 'STAFF LOUNGE',
      signBg: '#064e3b',
      signFg: '#6ee7b7'
    });
    createDecorativeHallDoor({
      x: -2.60,
      width: 0.98,
      color: 0x78350f,
      window: true,
      brass: true,
      signTitle: 'STORE MANAGER',
      signSub: 'OFFICE',
      signBg: '#451a03',
      signFg: '#fde68a'
    });

    // Double Black Doors to Sales Floor on West End Wall (facing East into Hallway, leading West away from Dock/Freezer/Cooler)
    createDecorativeHallDoor({
      x: hallWestX + 0.05,
      z: hallWestCenterZ,
      ry: Math.PI / 2,
      width: 2.34,
      height: 2.34,
      doubleDoor: true,
      blackDoor: true,
      color: 0x111827,
      signTitle: 'SALES FLOOR',
      signSub: 'KEEP DOORS CLOSED',
      signBg: '#090d16',
      signFg: '#f8fafc'
    });

    // Detailed Fire Extinguisher Station & First Aid Cabinet on South Wall (swapped from West end, around X = -8.60)
    {
    const safetyGrp = new THREE.Group();
    safetyGrp.position.set(-8.60, 0, hallEndZ - 0.05);
    safetyGrp.rotation.y = Math.PI; // local +Z faces North into hallway

    createFireExtinguisherStation({ parentGroup: safetyGrp, offsetX: -0.34 });

    // Adjacent White First Aid Metal Cabinet with Bold Red Cross
    const faBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.46, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42, metalness: 0.15 })
    );
    faBody.position.set(0.32, 1.46, 0.07);
    safetyGrp.add(faBody);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.01), crossMat);
    crossH.position.set(0.32, 1.50, 0.144);
    safetyGrp.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.01), crossMat);
    crossV.position.set(0.32, 1.50, 0.144);
    safetyGrp.add(crossV);
    const faClasp = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.02), matChrome);
    faClasp.position.set(0.12, 1.46, 0.142);
    safetyGrp.add(faClasp);
    const faSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.14),
      new THREE.MeshBasicMaterial({ map: createHallwayDoorSignTexture('FIRST AID KIT', '', '#1e293b', '#f8fafc') })
    );
    faSign.position.set(0.32, 1.79, 0.01);
    safetyGrp.add(faSign);
    scene.add(safetyGrp);
    }

    solidWalls.push({
      minX: -9.18,
      maxX: -8.02,
      minZ: hallEndZ - 0.24,
      maxZ: hallEndZ + 0.05
    });

    const hallwayTimeclock = {
      setTime(hours, minutes) {
        timeclockDisplay.draw(hours, minutes);
      }
    };

    // 4. Cold Room Double Swinging Black Impact Doors at Row 17
    // Split into a right and left half door, each swinging from its doorway wall jamb!
    // Opens automatically when entered by player or pallet.
    const coldDoors = [];

    function createColdRoomDoorway(col, label, tempText, tempColor, isFreezer) {
      const pos = gridToWorld(col, 17);
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);

      const doorWidth = 2.2;
      const doorHeight = 2.7;
      const leafW = doorWidth / 2; // 1.1m

      // Heavy-Duty Steel Door Frame (Jambs & Head Lintel)
      const matSteelJamb = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.7 });
      const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorHeight, 0.32), matSteelJamb);
      leftJamb.position.set(-(doorWidth / 2 + 0.06), doorHeight / 2, 0);
      group.add(leftJamb);

      const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorHeight, 0.32), matSteelJamb);
      rightJamb.position.set(doorWidth / 2 + 0.06, doorHeight / 2, 0);
      group.add(rightJamb);

      const headJamb = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.24, 0.14, 0.32), matSteelJamb);
      headJamb.position.set(0, doorHeight + 0.07, 0);
      group.add(headJamb);

      // Solid Insulated Wall Header above door frame up to COLD_CEILING_H (4.2m)
      const headerFillH = COLD_CEILING_H - (doorHeight + 0.14);
      const headerFill = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth + 0.24, headerFillH, 0.45),
        matInsulatedWall
      );
      headerFill.position.set(0, (doorHeight + 0.14) + headerFillH / 2, 0);
      group.add(headerFill);

      // Framed overhead cold room sign directly above the impact doors (facing North out into dock floor)
      const lintelTex = createColdHeaderPlacardTexture(isFreezer);
      const signFrame = new THREE.Mesh(
        new THREE.BoxGeometry(2.32, 0.62, 0.05),
        matSteelFrame
      );
      signFrame.position.set(0, 3.48, -0.23);
      group.add(signFrame);

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.22, 0.54),
        new THREE.MeshStandardMaterial({ map: lintelTex, roughness: 0.36, metalness: 0.16 })
      );
      sign.position.set(0, 3.48, -0.26);
      sign.rotation.y = Math.PI;
      group.add(sign);

      // Digital LED Temperature Display on door jamb (facing North into dock floor)
      const ledTex = createTempLedTexture(tempText, tempColor);
      const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.35), new THREE.MeshBasicMaterial({ map: ledTex }));
      ledMesh.position.set(doorWidth / 2 + 0.52, 1.8, -0.24);
      ledMesh.rotation.y = Math.PI;
      group.add(ledMesh);

      // DOUBLE SWINGING BLACK IMPACT TRAFFIC DOORS
      const matBlackDoor = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.8,
        metalness: 0.15
      });

      // Translucent vision window panel at eye level
      const matVisionWindow = new THREE.MeshStandardMaterial({
        color: 0xc7d2fe,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.65
      });

      // Tear-drop bottom impact bumper
      const matImpactBumper = new THREE.MeshStandardMaterial({
        color: 0x09090b,
        roughness: 0.95
      });

      // --- LEFT HALF DOOR PANEL ---
      // Pivot attached to Left Wall Jamb
      const leftHingeGroup = new THREE.Group();
      leftHingeGroup.position.set(-doorWidth / 2, 0, 0);

      const leftDoorLeaf = new THREE.Mesh(
        new THREE.BoxGeometry(leafW, doorHeight - 0.05, 0.055),
        matBlackDoor
      );
      leftDoorLeaf.position.set(leafW / 2, doorHeight / 2, 0);
      leftHingeGroup.add(leftDoorLeaf);

      // Left leaf vision window (eye level Y = 1.55m)
      const leftWindow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, 0.06), matVisionWindow);
      leftWindow.position.set(leafW / 2 + 0.12, 1.55, 0);
      leftHingeGroup.add(leftWindow);

      // Left leaf tear-drop rubber bumper at bottom
      const leftBumper = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.04, 0.70, 0.085), matImpactBumper);
      leftBumper.position.set(leafW / 2, 0.42, 0);
      leftHingeGroup.add(leftBumper);

      // Left gravity V-cam hinges on jamb
      const topHingeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.14), matSteel);
      topHingeL.position.set(0.02, doorHeight - 0.15, 0);
      leftHingeGroup.add(topHingeL);
      const btmHingeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.14), matSteel);
      btmHingeL.position.set(0.02, 0.20, 0);
      leftHingeGroup.add(btmHingeL);

      // Flexible center meeting rubber seal
      const leftSeal = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorHeight - 0.05, 0.02), matBlackRubber);
      leftSeal.position.set(leafW + 0.02, doorHeight / 2, 0);
      leftHingeGroup.add(leftSeal);

      group.add(leftHingeGroup);

      // --- RIGHT HALF DOOR PANEL ---
      // Pivot attached to Right Wall Jamb
      const rightHingeGroup = new THREE.Group();
      rightHingeGroup.position.set(doorWidth / 2, 0, 0);

      const rightDoorLeaf = new THREE.Mesh(
        new THREE.BoxGeometry(leafW, doorHeight - 0.05, 0.055),
        matBlackDoor
      );
      rightDoorLeaf.position.set(-leafW / 2, doorHeight / 2, 0);
      rightHingeGroup.add(rightDoorLeaf);

      // Right leaf vision window
      const rightWindow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, 0.06), matVisionWindow);
      rightWindow.position.set(-leafW / 2 - 0.12, 1.55, 0);
      rightHingeGroup.add(rightWindow);

      // Right leaf tear-drop rubber bumper at bottom
      const rightBumper = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.04, 0.70, 0.085), matImpactBumper);
      rightBumper.position.set(-leafW / 2, 0.42, 0);
      rightHingeGroup.add(rightBumper);

      // Right gravity V-cam hinges on jamb
      const topHingeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.14), matSteel);
      topHingeR.position.set(-0.02, doorHeight - 0.15, 0);
      rightHingeGroup.add(topHingeR);
      const btmHingeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.14), matSteel);
      btmHingeR.position.set(-0.02, 0.20, 0);
      rightHingeGroup.add(btmHingeR);

      // Flexible center meeting rubber seal
      const rightSeal = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorHeight - 0.05, 0.02), matBlackRubber);
      rightSeal.position.set(-leafW - 0.02, doorHeight / 2, 0);
      rightHingeGroup.add(rightSeal);

      group.add(rightHingeGroup);

      scene.add(group);

      coldDoors.push({
        name: label,
        worldX: pos.x,
        worldZ: pos.z,
        leftHinge: leftHingeGroup,
        rightHinge: rightHingeGroup,
        currentLeftAngle: 0,
        currentRightAngle: 0,
        targetLeftAngle: 0,
        targetRightAngle: 0,
        activeDirection: 0,
        wasOpen: false
      });
    }

    createColdRoomDoorway(2, "FREEZER  0 deg F", "-2.4 deg F", "#38bdf8", true);
    createColdRoomDoorway(6, "COOLER  36 deg F", "35.8 deg F", "#34d399", false);

    // ==========================================
    // PHASE 4 STEEL RACKS (Industrial Selective Racking, Half-Tile Deep x 3 Tiles Wide)
    // Uprights sit along exact tile edges to create 3 clean bay segments per rack.
    // Freezer & Cooler use 3.10m uprights (cold ceiling); Dry & Claims/Supplies use 4.25m uprights.
    // ==========================================
    const matRackUpright = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.45, metalness: 0.72 });
    const matRackBeam = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.42, metalness: 0.35 });
    const matRackDeck = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.58, metalness: 0.65 });
    const matRackFoot = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.60, metalness: 0.70 });
    const matBlackPlasticPallet = new THREE.MeshStandardMaterial({ color: 0x181b20, roughness: 0.44, metalness: 0.14 });
    const matBlackPlasticRib = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.52, metalness: 0.10 });

    function createQuarterPlasticPallet(w = 1.04, d = 0.90) {
      // Molded black plastic floor pallet sized to span rack bays cleanly (nearly touching in pairs)
      const group = new THREE.Group();
      const legW = 0.11;
      const legD = 0.11;
      const legX = w / 2 - legW / 2 - 0.025;
      const legZ = d / 2 - legD / 2 - 0.025;
      const rimT = 0.07;

      // 3 bottom runner skids along depth
      [-legX, 0, legX].forEach((rx) => {
        const skid = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.016, d), matBlackPlasticRib);
        skid.position.set(rx, 0.008, 0);
        group.add(skid);
      });

      // 9 molded leg blocks (3x3 layout leaving clean fork pockets)
      [-legX, 0, legX].forEach((lx) => {
        [-legZ, 0, legZ].forEach((lz) => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, 0.090, legD), matBlackPlasticRib);
          leg.position.set(lx, 0.061, lz);
          group.add(leg);
        });
      });

      // Top molded perimeter frame (solid top lip)
      const lipSideFront = new THREE.Mesh(new THREE.BoxGeometry(w, 0.024, rimT), matBlackPlasticPallet);
      lipSideFront.position.set(0, 0.118, d / 2 - rimT / 2);
      group.add(lipSideFront);
      const lipSideBack = new THREE.Mesh(new THREE.BoxGeometry(w, 0.024, rimT), matBlackPlasticPallet);
      lipSideBack.position.set(0, 0.118, -d / 2 + rimT / 2);
      group.add(lipSideBack);
      [-w / 2 + rimT / 2, w / 2 - rimT / 2].forEach((ex) => {
        const lipEnd = new THREE.Mesh(new THREE.BoxGeometry(rimT, 0.024, d - rimT * 2), matBlackPlasticPallet);
        lipEnd.position.set(ex, 0.118, 0);
        group.add(lipEnd);
      });

      // Molded perforated waffle deck slats inside perimeter
      const innerSpanX = (w - rimT * 2) * 0.34;
      const innerSpanZ = (d - rimT * 2) * 0.34;
      [-innerSpanX, 0, innerSpanX].forEach((gx) => {
        const slatX = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.021, d - rimT * 2), matBlackPlasticPallet);
        slatX.position.set(gx, 0.118, 0);
        group.add(slatX);
      });
      [-innerSpanZ, 0, innerSpanZ].forEach((gz) => {
        const slatZ = new THREE.Mesh(new THREE.BoxGeometry(w - rimT * 2, 0.021, 0.055), matBlackPlasticPallet);
        slatZ.position.set(0, 0.118, gz);
        group.add(slatZ);
      });

      return group;
    }

    const steelRacks = [];

    function createShelfBinLabelTexture(binCode) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 60);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(binCode, 14, 34, 228);
      return new THREE.CanvasTexture(c);
    }

    function createSteelRackUnit(cfg) {
      const {
        id,
        zone,
        label,
        accentCss,
        facing, // 'E' (+X), 'W' (-X), or 'N' (-Z)
        binPrefix = '',
        tierBinNumbers = null,
        uprightH: cfgUprightH,
        tierHeights: cfgTierHeights,
        beamOnlyTierHeights = [],
        floorQuarterPalletsPerBay = 0,
        crossbarY: cfgCrossbarY,
        diagMidYList: cfgDiagMidYList,
        tiers = 3,
        spanEdges, // 4 sorted coordinates along the 3-tile length
        wallEdge, // coordinate touching the wall
        aisleEdge // coordinate on the open aisle side (~half tile from wallEdge)
      } = cfg;

      const isNS = (facing === 'E' || facing === 'W');
      const uprightH = cfgUprightH ?? (tiers === 3 ? 4.25 : 3.10);
      const tierHeights = cfgTierHeights ?? (tiers === 3 ? [0.88, 2.02, 3.16] : [0.16, 1.55, 2.95]);
      const crossbarY = cfgCrossbarY ?? (uprightH > 3.5 ? [0.26, 1.45, 2.60, 4.10] : [0.26, 1.45, 3.04]);
      const diagMidYList = cfgDiagMidYList ?? (uprightH > 3.5 ? [0.84, 2.02, 3.35] : [0.86, 2.20]);
      const postSize = 0.085;
      const rackGroup = new THREE.Group();

      const dMin = Math.min(wallEdge, aisleEdge);
      const dMax = Math.max(wallEdge, aisleEdge);
      const dCenter = (dMin + dMax) / 2;
      const rackDepth = dMax - dMin;

      const spanMin = spanEdges[0];
      const spanMax = spanEdges[spanEdges.length - 1];

      const toWorldXZ = (spanVal, depthVal) => (
        isNS ? { x: depthVal, z: spanVal } : { x: spanVal, z: depthVal }
      );

      // 1. Upright Ladder Frames along each tile edge (4 frames -> 3 segments)
      const backOffset = facing === 'E' ? (dMin + postSize / 2) : (dMax - postSize / 2);
      const frontOffset = facing === 'E' ? (dMax - postSize / 2) : (dMin + postSize / 2);

      spanEdges.forEach((edgeVal) => {
        [backOffset, frontOffset].forEach((dPos) => {
          const p = toWorldXZ(edgeVal, dPos);
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(postSize, uprightH, postSize),
            matRackUpright
          );
          post.position.set(p.x, uprightH / 2, p.z);
          rackGroup.add(post);

          const foot = new THREE.Mesh(
            new THREE.BoxGeometry(0.17, 0.024, 0.17),
            matRackFoot
          );
          foot.position.set(p.x, 0.012, p.z);
          rackGroup.add(foot);
        });

        // Horizontal crossbars & diagonal brace connecting front-to-back frame posts
        const braceSpan = Math.max(0.2, rackDepth - postSize);
        crossbarY.forEach((by) => {
          const cPos = toWorldXZ(edgeVal, dCenter);
          const barGeo = isNS
            ? new THREE.BoxGeometry(braceSpan, 0.042, 0.042)
            : new THREE.BoxGeometry(0.042, 0.042, braceSpan);
          const bar = new THREE.Mesh(barGeo, matRackUpright);
          bar.position.set(cPos.x, by, cPos.z);
          rackGroup.add(bar);
        });

        diagMidYList.forEach((diagMidY, di) => {
          const diagRun = braceSpan;
          const diagRise = 1.05;
          const diagLen = Math.hypot(diagRun, diagRise);
          const diagAngle = Math.atan2(diagRise, diagRun) * (di % 2 === 0 ? 1 : -1);
          const dPos = toWorldXZ(edgeVal, dCenter);
          const diagGeo = isNS
            ? new THREE.BoxGeometry(diagLen, 0.032, 0.032)
            : new THREE.BoxGeometry(0.032, 0.032, diagLen);
          const diagBar = new THREE.Mesh(diagGeo, matRackUpright);
          diagBar.position.set(dPos.x, diagMidY, dPos.z);
          if (isNS) diagBar.rotation.z = diagAngle;
          else diagBar.rotation.x = diagAngle;
          rackGroup.add(diagBar);
        });
      });

      // 2. Three Bay Segments x Tier Beams & Wire-Mesh Shelves
      const slots = [];
      const floorPallets = [];
      for (let seg = 0; seg < 3; seg++) {
        const sStart = spanEdges[seg];
        const sEnd = spanEdges[seg + 1];
        const segLen = Math.max(0.4, (sEnd - sStart) - postSize);
        const sMid = (sStart + sEnd) / 2;

        const addOrangeBeamPair = (tierY) => {
          [frontOffset, backOffset].forEach((dPos) => {
            const bp = toWorldXZ(sMid, dPos);
            const beamGeo = isNS
              ? new THREE.BoxGeometry(0.065, 0.11, segLen)
              : new THREE.BoxGeometry(segLen, 0.11, 0.065);
            const beam = new THREE.Mesh(beamGeo, matRackBeam);
            beam.position.set(bp.x, tierY - 0.055, bp.z);
            rackGroup.add(beam);
          });
        };

        tierHeights.forEach((tierY, lv) => {
          // Front & Back horizontal orange box beams
          addOrangeBeamPair(tierY);

          // Galvanized steel shelf deck resting across beams
          const deckPos = toWorldXZ(sMid, dCenter);
          const deckDepth = Math.max(0.3, rackDepth - postSize * 0.8);
          const deckGeo = isNS
            ? new THREE.BoxGeometry(deckDepth, 0.036, segLen - 0.02)
            : new THREE.BoxGeometry(segLen - 0.02, 0.036, deckDepth);
          const deck = new THREE.Mesh(deckGeo, matRackDeck);
          deck.position.set(deckPos.x, tierY + 0.005, deckPos.z);
          rackGroup.add(deck);

          // 2 underside deck support struts per bay
          [-segLen * 0.25, segLen * 0.25].forEach((off) => {
            const sp = toWorldXZ(sMid + off, dCenter);
            const strutGeo = isNS
              ? new THREE.BoxGeometry(deckDepth - 0.06, 0.035, 0.035)
              : new THREE.BoxGeometry(0.035, 0.035, deckDepth - 0.06);
            const strut = new THREE.Mesh(strutGeo, matRackFoot);
            strut.position.set(sp.x, tierY - 0.03, sp.z);
            rackGroup.add(strut);
          });

          // Left-justified white/black bin location label on front orange cross member face (left to right as viewed from aisle)
          const bayNum = (facing === 'W') ? (seg + 1) : (3 - seg);
          const shelfBinNum = Array.isArray(tierBinNumbers) ? tierBinNumbers[lv] : (lv + 1);
          const binLabel = (binPrefix && shelfBinNum)
            ? `${binPrefix}/${String(bayNum).padStart(3, '0')}/${String(shelfBinNum).padStart(3, '0')}`
            : '';
          if (binLabel) {
            const lblW = 0.42;
            const lblH = 0.086;
            // Left side of bay when looking from aisle: +span for 'N'/'E', -span for 'W'
            const lblSpan = (facing === 'W')
              ? (sStart + postSize / 2 + lblW / 2 + 0.05)
              : (sEnd - postSize / 2 - lblW / 2 - 0.05);
            const outerFaceOffset = frontOffset + (facing === 'E' ? (0.0325 + 0.003) : -(0.0325 + 0.003));
            const lp = toWorldXZ(lblSpan, outerFaceOffset);
            const lblMat = new THREE.MeshBasicMaterial({ map: createShelfBinLabelTexture(binLabel) });
            const lblMesh = new THREE.Mesh(new THREE.PlaneGeometry(lblW, lblH), lblMat);
            lblMesh.position.set(lp.x, tierY - 0.055, lp.z);
            if (facing === 'E') lblMesh.rotation.y = Math.PI / 2;
            else if (facing === 'W') lblMesh.rotation.y = -Math.PI / 2;
            else if (facing === 'N') lblMesh.rotation.y = Math.PI;
            rackGroup.add(lblMesh);
          }

          slots.push({
            rackId: id,
            zone: zone,
            segment: seg,
            level: lv,
            binLabel: binLabel,
            minX: isNS ? dMin : (sStart + postSize / 2),
            maxX: isNS ? dMax : (sEnd - postSize / 2),
            minZ: isNS ? (sStart + postSize / 2) : dMin,
            maxZ: isNS ? (sEnd - postSize / 2) : dMax,
            deckY: tierY + 0.023,
            centerX: deckPos.x,
            centerZ: deckPos.z
          });
        });

        // Optional open top beam-only tiers (orange cross-beams connecting uprights without a deck)
        beamOnlyTierHeights.forEach((tierY) => {
          addOrangeBeamPair(tierY);
        });

        // Optional molded black plastic floor pallets placed across the open bottom bay
        if (floorQuarterPalletsPerBay > 0) {
          const palletGap = 0.05;
          const palletD = Math.min(0.92, Math.max(0.50, rackDepth - postSize - 0.08));
          const palletW = 1.03;
          for (let pi = 0; pi < floorQuarterPalletsPerBay; pi++) {
            const offsetIdx = pi - (floorQuarterPalletsPerBay - 1) / 2;
            const pSpan = sMid + offsetIdx * (palletW + palletGap);
            const pp = toWorldXZ(pSpan, dCenter);
            const qPallet = createQuarterPlasticPallet(palletW, palletD);
            qPallet.position.set(pp.x, 0, pp.z);
            if (isNS) qPallet.rotation.y = Math.PI / 2;
            rackGroup.add(qPallet);
            floorPallets.push({
              rackId: id,
              zone: zone,
              segment: seg,
              palletIndex: pi,
              width: palletW,
              depth: palletD,
              topY: 0.130,
              centerX: pp.x,
              centerZ: pp.z,
              mesh: qPallet
            });
          }
        }
      }

      mergeStaticGroupByMaterial(rackGroup);
      scene.add(rackGroup);

      const bounds = isNS
        ? { minX: dMin, maxX: dMax, minZ: spanMin, maxZ: spanMax }
        : { minX: spanMin, maxX: spanMax, minZ: dMin, maxZ: dMax };
      solidWalls.push(bounds);

      const rackRecord = {
        id,
        zone,
        label,
        facing,
        tiers: tierHeights.length,
        accentCss,
        bounds,
        group: rackGroup,
        slots,
        floorPallets
      };
      steelRacks.push(rackRecord);
      return rackRecord;
    }

    const HALF_TILE_RACK_DEPTH = 1.08;
    const freezerWallX = ORIGIN_X + outerWallThickness / 2 + 0.05;
    const coolerWallX = ORIGIN_X + 9 * TILE_SIZE - 0.05;
    const southRackWallZ = southDividingZ - 0.22;

    // 1. FREEZER STEEL (West wall inside Freezer: Col 0, Rows 18-20, 3 segments, 3 shelves on 3.10m uprights, facing East)
    createSteelRackUnit({
      id: 'freezer_steel',
      zone: 'F',
      label: 'FREEZER BACKSTOCK',
      accentCss: '#38bdf8',
      facing: 'E',
      binPrefix: '030',
      uprightH: 3.10,
      tierHeights: [0.16, 1.55, 2.95],
      spanEdges: [
        ORIGIN_Z + 18 * TILE_SIZE + 0.07,
        ORIGIN_Z + 19 * TILE_SIZE,
        ORIGIN_Z + 20 * TILE_SIZE,
        ORIGIN_Z + 21 * TILE_SIZE - outerWallThickness / 2 - 0.06
      ],
      wallEdge: freezerWallX,
      aisleEdge: freezerWallX + HALF_TILE_RACK_DEPTH
    });

    // 2. COOLER STEEL (East wall inside Cooler: Col 8, Rows 18-20, 3 segments, 3 shelves on 3.10m uprights, facing West)
    createSteelRackUnit({
      id: 'cooler_steel',
      zone: 'C',
      label: 'COOLER BACKSTOCK',
      accentCss: '#34d399',
      facing: 'W',
      binPrefix: '020',
      uprightH: 3.10,
      tierHeights: [0.16, 1.55, 2.95],
      spanEdges: [
        ORIGIN_Z + 18 * TILE_SIZE + 0.07,
        ORIGIN_Z + 19 * TILE_SIZE,
        ORIGIN_Z + 20 * TILE_SIZE,
        ORIGIN_Z + 21 * TILE_SIZE - outerWallThickness / 2 - 0.06
      ],
      wallEdge: coolerWallX,
      aisleEdge: coolerWallX - HALF_TILE_RACK_DEPTH
    });

    // 3. DRY BACKSTOCK STEEL (3 free tiles between Freezer & Cooler doors along South wall: Cols 3-5, Row 15, 3 shelves + top beams)
    createSteelRackUnit({
      id: 'dry_steel',
      zone: 'D',
      label: 'DRY BACKSTOCK',
      accentCss: '#f59e0b',
      facing: 'N',
      binPrefix: '010',
      tiers: 3,
      tierHeights: [0.16, 1.30, 2.44],
      beamOnlyTierHeights: [4.10],
      crossbarY: [0.26, 1.45, 2.60, 4.18],
      spanEdges: [
        ORIGIN_X + 3 * TILE_SIZE + 0.04,
        ORIGIN_X + 4 * TILE_SIZE,
        ORIGIN_X + 5 * TILE_SIZE,
        ORIGIN_X + 6 * TILE_SIZE - 0.04
      ],
      wallEdge: southRackWallZ,
      aisleEdge: southRackWallZ - HALF_TILE_RACK_DEPTH
    });

    // 4. CLAIMS & SUPPLIES STEEL (3 free dry staging tiles between Cooler door & Hallway entrance: Cols 7-9, Row 15)
    // Matches Dry steel frame (4.25m, 1.30m & 2.44m shelves + 4.10m top beams), no bottom shelf, with two black plastic floor pallets per bay (6 total).
    const claimsRack = createSteelRackUnit({
      id: 'claims_steel',
      zone: 'CLAIMS',
      label: 'CLAIMS & SUPPLIES',
      accentCss: '#f87171',
      facing: 'N',
      binPrefix: '060',
      tierBinNumbers: [null, 3],
      uprightH: 4.25,
      tierHeights: [1.30, 2.44],
      beamOnlyTierHeights: [4.10],
      crossbarY: [0.26, 1.45, 2.60, 4.18],
      diagMidYList: [0.84, 2.02, 3.35],
      floorQuarterPalletsPerBay: 2,
      spanEdges: [
        ORIGIN_X + 7 * TILE_SIZE + 0.04,
        ORIGIN_X + 8 * TILE_SIZE,
        ORIGIN_X + 9 * TILE_SIZE,
        ORIGIN_X + 10 * TILE_SIZE - 0.04
      ],
      wallEdge: southRackWallZ,
      aisleEdge: southRackWallZ - HALF_TILE_RACK_DEPTH
    });

    // Floor cargo on the 6 Claims & Supplies black plastic pallets (East to West: Trash, Organics, Hazwaste, Empty Barrels, Flat Boxes, Built Donation Boxes)
    function createClaimsLabelTexture(titleText, bgHex, accentHex, textHex) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, 244, 116);
      ctx.fillStyle = accentHex;
      ctx.fillRect(14, 14, 228, 22);
      ctx.fillStyle = textHex;
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(titleText, 128, 76, 220);
      return new THREE.CanvasTexture(c);
    }

    function createClaimsBarrelMesh(opts) {
      const {
        rBottom,
        rTop,
        height,
        bodyColor,
        lidColor,
        rimColor,
        labelText,
        labelBg,
        labelAccent,
        labelTextColor,
        sideHandles = false,
        drumHoops = false,
        hazardBand = false,
        emptyUpsideDown = false
      } = opts;

      const g = new THREE.Group();
      const inner = new THREE.Group();
      const matBody = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45, metalness: drumHoops ? 0.35 : 0.08 });
      const matLid = new THREE.MeshStandardMaterial({ color: lidColor, roughness: 0.48, metalness: 0.15 });
      const matRim = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.40, metalness: 0.25 });

      // Main barrel cylinder (leave 4mm recessed chime pocket at bottom when flipped upside-down so bottom cap never coplanar-clips)
      const bodyBottomOffset = emptyUpsideDown ? 0.004 : 0;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBottom, height - bodyBottomOffset, 24),
        matBody
      );
      body.position.y = bodyBottomOffset + (height - bodyBottomOffset) / 2;
      inner.add(body);

      // Flared top collar
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.018, rTop + 0.014, 0.045, 24), matRim);
      collar.position.y = height - 0.018;
      inner.add(collar);

      if (emptyUpsideDown) {
        // Open empty barrel flipped upside-down: raised outer bottom chime skirt & inner bottom lip (zero coplanar Z-fighting)
        const bottomChimeOuter = new THREE.Mesh(
          new THREE.CylinderGeometry(rBottom + 0.009, rBottom + 0.006, 0.026, 24, 1, true),
          matRim
        );
        bottomChimeOuter.position.y = 0.013;
        inner.add(bottomChimeOuter);
        const chimeRimRing = new THREE.Mesh(
          new THREE.TorusGeometry(rBottom + 0.001, 0.006, 8, 24),
          matRim
        );
        chimeRimRing.rotation.x = Math.PI / 2;
        chimeRimRing.position.y = 0.003;
        inner.add(chimeRimRing);
        const hollowOpening = new THREE.Mesh(
          new THREE.CylinderGeometry(rTop - 0.015, rTop - 0.015, 0.01, 20),
          new THREE.MeshBasicMaterial({ color: 0x090b0f })
        );
        hollowOpening.position.y = height - 0.004;
        inner.add(hollowOpening);
      } else {
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.014, rTop + 0.018, 0.036, 24), matLid);
        lid.position.y = height + 0.018;
        inner.add(lid);
      }

      if (sideHandles) {
        // Utility barrel molded handles & domed lid grab bar
        [-1, 1].forEach((side) => {
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.13), matRim);
          handle.position.set(side * (rTop + 0.015), height - 0.11, 0);
          inner.add(handle);
        });
        if (!emptyUpsideDown) {
          const topGrip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.032, 0.045), matRim);
          topGrip.position.y = height + 0.048;
          inner.add(topGrip);
        }
      }

      if (drumHoops) {
        // Steel/HDPE drum rolling ribs (+ top bung caps when upright & sealed)
        [0.30, 0.56].forEach((frac) => {
          const rAtH = THREE.MathUtils.lerp(rBottom, rTop, frac) + 0.008;
          const hoop = new THREE.Mesh(new THREE.CylinderGeometry(rAtH, rAtH, 0.026, 24), matRim);
          hoop.position.y = height * frac;
          inner.add(hoop);
        });
        if (!emptyUpsideDown) {
          [-0.10, 0.10].forEach((bx) => {
            const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.022, 12), matRim);
            bung.position.set(bx, height + 0.042, 0);
            inner.add(bung);
          });
        }
      }

      if (hazardBand) {
        const rBand = THREE.MathUtils.lerp(rBottom, rTop, 0.72) + 0.003;
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(rBand, rBand, 0.045, 24, 1, true),
          new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.DoubleSide })
        );
        band.position.y = height * 0.72;
        inner.add(band);
      }

      // Front curved placard facing North (-Z, thetaStart centered on Math.PI)
      const labelFrac = 0.52;
      const rLbl = THREE.MathUtils.lerp(rBottom, rTop, labelFrac) + 0.010;
      const labelTex = createClaimsLabelTexture(labelText, labelBg, labelAccent, labelTextColor);
      const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, side: THREE.DoubleSide });
      const labelArc = new THREE.Mesh(
        new THREE.CylinderGeometry(rLbl, rLbl, height * 0.30, 16, 1, true, Math.PI - 0.55, 1.10),
        labelMat
      );
      labelArc.position.y = height * labelFrac;
      inner.add(labelArc);

      if (emptyUpsideDown) {
        // Flip around Z so -Z placard stays facing North aisle while open mouth sits flush at y = 0
        inner.rotation.z = Math.PI;
        inner.position.y = height;
      }
      g.add(inner);

      return g;
    }

    function createDonationBoxesStack() {
      const g = new THREE.Group();
      const matBoxA = new THREE.MeshStandardMaterial({ color: 0xc49562, roughness: 0.85 });
      const matBoxB = new THREE.MeshStandardMaterial({ color: 0xb38452, roughness: 0.88 });
      const matTape = new THREE.MeshStandardMaterial({ color: 0xe7d2b5, roughness: 0.60 });
      const donationTex = createClaimsLabelTexture('DONATION', '#fffbeb', '#d97706', '#92400e');
      const matDonateLbl = new THREE.MeshBasicMaterial({ map: donationTex });

      const addBox = (w, h, d, x, y, z, rotY, mat, withLabel) => {
        const boxGrp = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        boxGrp.add(mesh);
        const tape = new THREE.Mesh(new THREE.BoxGeometry(w + 0.003, 0.006, 0.055), matTape);
        tape.position.y = h / 2 + 0.001;
        boxGrp.add(tape);
        if (withLabel) {
          const placard = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.68, h * 0.52), matDonateLbl);
          placard.position.set(0, 0, -(d / 2 + 0.003));
          placard.rotation.y = Math.PI;
          boxGrp.add(placard);
        }
        boxGrp.position.set(x, y + h / 2, z);
        boxGrp.rotation.y = rotY;
        g.add(boxGrp);
      };

      // Bottom tier (2 boxes side by side)
      addBox(0.42, 0.33, 0.38, -0.22, 0.00, 0.03, 0.05, matBoxA, true);
      addBox(0.40, 0.35, 0.36, 0.23, 0.00, -0.02, -0.06, matBoxB, false);
      // Middle tier (2 boxes)
      addBox(0.38, 0.29, 0.34, -0.20, 0.33, 0.01, -0.04, matBoxB, false);
      addBox(0.36, 0.27, 0.32, 0.21, 0.35, 0.02, 0.07, matBoxA, true);
      // Top box (stays well below 1.06m shelf clearance)
      addBox(0.38, 0.25, 0.32, -0.01, 0.62, -0.01, 0.02, matBoxA, true);

      return g;
    }

    function createEmptyUpsideDownBarrelsPair() {
      const g = new THREE.Group();

      // Staggered slightly in Z inside the 1.03m x 0.915m pallet so both upside-down drums sit side-by-side cleanly
      const emptyHazwaste = createClaimsBarrelMesh({
        rBottom: 0.23,
        rTop: 0.23,
        height: 0.78,
        bodyColor: 0xeab308,
        lidColor: 0x111827,
        rimColor: 0xca8a04,
        labelText: 'HAZWASTE',
        labelBg: '#7f1d1d',
        labelAccent: '#facc15',
        labelTextColor: '#fef08a',
        drumHoops: true,
        hazardBand: true,
        emptyUpsideDown: true
      });
      emptyHazwaste.position.set(0.24, 0, -0.09);
      g.add(emptyHazwaste);

      const emptyOrganics = createClaimsBarrelMesh({
        rBottom: 0.22,
        rTop: 0.235,
        height: 0.76,
        bodyColor: 0x15803d,
        lidColor: 0x14532d,
        rimColor: 0x166534,
        labelText: 'ORGANICS',
        labelBg: '#052e16',
        labelAccent: '#4ade80',
        labelTextColor: '#dcfce7',
        drumHoops: true,
        emptyUpsideDown: true
      });
      emptyOrganics.position.set(-0.24, 0, 0.09);
      g.add(emptyOrganics);

      return g;
    }

    function createFlatDonationBoxesStack() {
      const g = new THREE.Group();
      const matFlats = [
        new THREE.MeshStandardMaterial({ color: 0xc49562, roughness: 0.86 }),
        new THREE.MeshStandardMaterial({ color: 0xb38452, roughness: 0.88 }),
        new THREE.MeshStandardMaterial({ color: 0xa47442, roughness: 0.90 })
      ];
      const matStrap = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.15 });
      const matCrease = new THREE.MeshStandardMaterial({ color: 0x8c5e32, roughness: 0.90 });
      const donationTex = createClaimsLabelTexture('DONATION', '#fffbeb', '#d97706', '#92400e');
      const matDonateLbl = new THREE.MeshBasicMaterial({ map: donationTex });

      const sheetW = 0.80;
      const sheetD = 0.66;
      const sheetH = 0.022;
      const layerCount = 14; // ~0.31m tall stack of flat unbuilt corrugated boxes

      for (let i = 0; i < layerCount; i++) {
        const isUpperBundle = i >= 7;
        const jx = ((i % 3) - 1) * 0.008 + (isUpperBundle ? 0.014 : 0);
        const jz = (((i + 1) % 3) - 1) * 0.007 - (isUpperBundle ? 0.012 : 0);
        const jy = i * sheetH + sheetH / 2 + (isUpperBundle ? 0.004 : 0);
        const sheet = new THREE.Mesh(
          new THREE.BoxGeometry(sheetW, sheetH - 0.003, sheetD),
          matFlats[i % matFlats.length]
        );
        sheet.position.set(jx, jy, jz);
        sheet.rotation.y = (isUpperBundle ? -0.028 : 0.015) + ((i % 2 === 0 ? 1 : -1) * 0.008);
        g.add(sheet);
      }

      const stackTopY = layerCount * sheetH + 0.004;

      // Poly strapping bands around the flat bundle + scored fold crease marks on the top flat box
      [-0.22, 0.22].forEach((sx) => {
        const strapTop = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, sheetD + 0.016), matStrap);
        strapTop.position.set(sx + 0.01, stackTopY + 0.002, -0.01);
        g.add(strapTop);
        [-sheetD / 2 - 0.006, sheetD / 2 + 0.006].forEach((sz) => {
          const strapSide = new THREE.Mesh(new THREE.BoxGeometry(0.022, stackTopY, 0.005), matStrap);
          strapSide.position.set(sx + 0.01, stackTopY / 2, sz - 0.01);
          g.add(strapSide);
        });
      });

      // Top flat-box flap crease lines & visible label
      [-0.14, 0.14].forEach((cz) => {
        const crease = new THREE.Mesh(new THREE.BoxGeometry(sheetW - 0.04, 0.003, 0.008), matCrease);
        crease.position.set(0.01, stackTopY + 0.001, cz - 0.01);
        crease.rotation.y = -0.028;
        g.add(crease);
      });

      const topCard = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), matDonateLbl);
      topCard.rotation.x = -Math.PI / 2;
      topCard.rotation.z = -0.028;
      topCard.position.set(0.01, stackTopY + 0.004, -0.02);
      g.add(topCard);

      return g;
    }

    if (claimsRack && Array.isArray(claimsRack.floorPallets)) {
      const palletsEastToWest = [...claimsRack.floorPallets].sort((a, b) => b.centerX - a.centerX);
      const claimsProps = [
        createClaimsBarrelMesh({
          rBottom: 0.25,
          rTop: 0.30,
          height: 0.78,
          bodyColor: 0x475569,
          lidColor: 0x1e293b,
          rimColor: 0x334155,
          labelText: 'TRASH',
          labelBg: '#1e293b',
          labelAccent: '#94a3b8',
          labelTextColor: '#f8fafc',
          sideHandles: true
        }),
        createClaimsBarrelMesh({
          rBottom: 0.27,
          rTop: 0.285,
          height: 0.80,
          bodyColor: 0x15803d,
          lidColor: 0x14532d,
          rimColor: 0x166534,
          labelText: 'ORGANICS',
          labelBg: '#052e16',
          labelAccent: '#4ade80',
          labelTextColor: '#dcfce7',
          drumHoops: true
        }),
        createClaimsBarrelMesh({
          rBottom: 0.285,
          rTop: 0.285,
          height: 0.82,
          bodyColor: 0xeab308,
          lidColor: 0x111827,
          rimColor: 0xca8a04,
          labelText: 'HAZWASTE',
          labelBg: '#7f1d1d',
          labelAccent: '#facc15',
          labelTextColor: '#fef08a',
          drumHoops: true,
          hazardBand: true
        }),
        createEmptyUpsideDownBarrelsPair(),
        createFlatDonationBoxesStack(),
        createDonationBoxesStack()
      ];

      const claimsReceptacleMeta = [
        { id: 'trash', label: 'TRASH BARREL' },
        { id: 'organics', label: 'ORGANICS BARREL' },
        { id: 'hazwaste', label: 'HAZWASTE DRUM' },
        null, // Empty upside-down barrels (decorative)
        null, // Flat unbuilt donation boxes (decorative)
        { id: 'donate', label: 'DONATIONS BOXES' }
      ];

      // Assign East -> West across all 6 Claims & Supplies pallets
      claimsProps.forEach((propMesh, idx) => {
        const fp = palletsEastToWest[idx];
        if (!fp) return;
        propMesh.position.set(fp.centerX, fp.topY, fp.centerZ);
        const recMeta = claimsReceptacleMeta[idx];
        if (recMeta) {
          propMesh.userData.claimsReceptacle = Object.assign({ pallet: fp }, recMeta);
          propMesh.traverse((child) => {
            if (child && child.isMesh) {
              child.userData = child.userData || {};
              child.userData.claimsReceptacle = propMesh.userData.claimsReceptacle;
            }
          });
        }
        scene.add(propMesh);
        fp.cargoMesh = propMesh;
      });
    }

    function createClaimsShelfToteMesh(isRed = false, opts = {}) {
      // Base molded tote model shared by Claims & Supplies steel totes and floor vendor credit totes
      const { doubleSidedLabel = false, customLabelTexture = null, labelText = null } = opts;
      const toteGroup = new THREE.Group();
      const matTote = new THREE.MeshStandardMaterial({
        color: isRed ? 0xb91c1c : 0x64748b,
        roughness: 0.55,
        metalness: 0.15
      });
      const matToteRim = new THREE.MeshStandardMaterial({
        color: isRed ? 0xef4444 : 0x94a3b8,
        roughness: 0.45,
        metalness: 0.20
      });
      const matToteDark = new THREE.MeshStandardMaterial({
        color: isRed ? 0x7f1d1d : 0x475569,
        roughness: 0.70
      });

      const toteW = 0.65;
      const toteH = 0.24;
      const toteD = 0.78;
      const wallT = 0.025;
      const baseH = 0.025;
      const wallH = toteH - baseH;
      const wallCenterY = baseH + wallH / 2;

      // Bottom base & cavity floor (y: 0.000 .. baseH)
      const base = new THREE.Mesh(new THREE.BoxGeometry(toteW, baseH, toteD), matToteDark);
      base.position.set(0, baseH / 2, 0);
      toteGroup.add(base);

      // 4 open-top walls sitting cleanly atop base (y: baseH .. toteH, zero coplanar bottom overlap)
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

      // Molded top rim accents resting cleanly on top of walls (y: toteH .. toteH + 0.022, zero corner overlap)
      const rimH = 0.022;
      const rimY = toteH + rimH / 2;
      const rimFBDepth = 0.038;
      const rimF = new THREE.Mesh(new THREE.BoxGeometry(toteW + 0.02, rimH, rimFBDepth), matToteRim);
      rimF.position.set(0, rimY, toteD / 2 - wallT / 2);
      toteGroup.add(rimF);
      const rimB = new THREE.Mesh(new THREE.BoxGeometry(toteW + 0.02, rimH, rimFBDepth), matToteRim);
      rimB.position.set(0, rimY, -toteD / 2 + wallT / 2);
      toteGroup.add(rimB);
      const sideRimSpan = Math.max(0.1, (toteD - wallT) - rimFBDepth);
      const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.036, rimH, sideRimSpan), matToteRim);
      rimL.position.set(-toteW / 2 + wallT / 2, rimY, 0);
      toteGroup.add(rimL);
      const rimR = new THREE.Mesh(new THREE.BoxGeometry(0.036, rimH, sideRimSpan), matToteRim);
      rimR.position.set(toteW / 2 - wallT / 2, rimY, 0);
      toteGroup.add(rimR);

      const resolvedLabel = customLabelTexture
        ? null
        : (labelText || (isRed ? 'CREDIT TOTE' : null));
      if (customLabelTexture || resolvedLabel) {
        // Label plaque on North (-Z) face (white & red for credit tote; white & black for gray dept totes)
        const labelTex = customLabelTexture || (isRed
          ? createClaimsLabelTexture(resolvedLabel, '#fef2f2', '#dc2626', '#991b1b')
          : createClaimsLabelTexture(resolvedLabel, '#ffffff', '#111827', '#111827'));
        const lblMat = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.45 });
        const lblNorth = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.12), lblMat);
        lblNorth.rotation.y = Math.PI;
        lblNorth.position.set(0, toteH * 0.50, -toteD / 2 - 0.003);
        toteGroup.add(lblNorth);
        if (doubleSidedLabel) {
          const lblSouth = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.12), lblMat);
          lblSouth.position.set(0, toteH * 0.50, toteD / 2 + 0.003);
          toteGroup.add(lblSouth);
        }
      }

      return toteGroup;
    }

    if (claimsRack && Array.isArray(claimsRack.slots)) {
      // East -> West across the 9 positions on the 1.30m shelf: 7 gray dept totes, 1 empty gap beside the red credit tote
      const eastToWestSpec = [
        { label: 'Dept 01', isRed: false },
        { label: 'Depts 1X', isRed: false },
        { label: 'Depts 2X', isRed: false },
        { label: 'Depts 3X', isRed: false },
        { label: 'Depts 4X', isRed: false },
        { label: 'Dept 50', isRed: false },
        { label: 'Dept 60', isRed: false },
        null, // Empty gap beside the red credit tote
        { label: 'CREDIT TOTE', isRed: true }
      ];
      const lowerSlotsEastToWest = claimsRack.slots
        .filter((s) => s.level === 0)
        .sort((a, b) => b.centerX - a.centerX);

      claimsRack.shelfTotes = [];
      let posIdx = 0;
      lowerSlotsEastToWest.forEach((slot) => {
        slot.hasTotes = true;
        const slotW = slot.maxX - slot.minX;
        for (let ti = 0; ti < 3; ti++) {
          const spec = eastToWestSpec[posIdx++];
          if (!spec) continue;
          // Order East (+X) -> West (-X) across each bay: ti=0 East, ti=2 West
          const frac = 1 - ti; // +1, 0, -1
          const tx = slot.centerX + frac * (slotW * 0.315);
          const toteMesh = createClaimsShelfToteMesh(spec.isRed, { labelText: spec.label });
          toteMesh.position.set(tx, slot.deckY + 0.001, slot.centerZ);
          scene.add(toteMesh);
          claimsRack.shelfTotes.push({
            rackId: claimsRack.id,
            segment: slot.segment,
            level: slot.level,
            indexInBay: ti,
            label: spec.label,
            isRed: spec.isRed,
            mesh: toteMesh
          });
        }
      });
    }

    // ==========================================
    // PHASE 4 BACKSTOCK OVERSTOCK PALLETS (One Wooden Floor Pallet Near Each Steel Rack)
    // Placed with >= 1.30m walkway clearance between pallet and steel front, clear of doorways & transit lanes.
    // ==========================================
    const matOverstockWood = new THREE.MeshStandardMaterial({
      map: typeof createWoodGrainTexture === 'function' ? createWoodGrainTexture() : undefined,
      color: 0xd6b07c,
      roughness: 0.85
    });

    const overstockPallets = [];

    function createOverstockFloorPallet(cfg) {
      const { palletId, rackId, zone, label, accentCss, x, z, rotY = 0 } = cfg;
      const palletW = 1.20;
      const palletD = 1.00;
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = rotY;

      // GMA 48x40 Wooden Skid Base (top deck ends at y = 0.136m)
      const topPlankZ = [-0.44, -0.28, -0.14, 0, 0.14, 0.28, 0.44];
      topPlankZ.forEach((pz, idx) => {
        const pw = (idx === 0 || idx === 6) ? 0.14 : 0.09;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(palletW, 0.022, pw), matOverstockWood);
        plank.position.set(0, 0.125, pz);
        group.add(plank);
      });
      [-0.50, 0, 0.50].forEach((sx) => {
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.095, palletD), matOverstockWood);
        runner.position.set(sx, 0.065, 0);
        group.add(runner);
      });
      [-0.44, -0.22, 0, 0.22, 0.44].forEach((pz) => {
        const bPlank = new THREE.Mesh(new THREE.BoxGeometry(palletW, 0.022, 0.09), matOverstockWood);
        bPlank.position.set(0, 0.011, pz);
        group.add(bPlank);
      });

      const cargoGroup = new THREE.Group();
      cargoGroup.position.set(0, 0.136, 0);
      group.add(cargoGroup);

      scene.add(group);

      const isRotated = Math.abs(Math.sin(rotY)) > 0.7;
      const worldW = isRotated ? palletD : palletW;
      const worldD = isRotated ? palletW : palletD;
      const bounds = {
        minX: x - worldW / 2,
        maxX: x + worldW / 2,
        minZ: z - worldD / 2,
        maxZ: z + worldD / 2,
        _isOverstockPallet: true
      };
      solidWalls.push(bounds);

      const resolvedPalletId = palletId || `${rackId}_p${overstockPallets.length}`;
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(palletW + 0.16, 1.40, palletD + 0.16),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.set(0, 0.70, 0);
      group.add(hitbox);

      const rec = {
        palletId: resolvedPalletId,
        rackId,
        zone,
        label,
        accentCss,
        homeX: x,
        homeZ: z,
        homeRotY: rotY,
        x,
        z,
        rotY,
        width: palletW,
        depth: palletD,
        topY: 0.136,
        isHitched: false,
        data: {
          id: resolvedPalletId,
          isOverstockPallet: true,
          isWarehousePallet: false,
          rackId,
          targetZone: zone,
          name: label || 'Overstock Floor Pallet',
          caseCount: 0
        },
        position: group.position,
        mesh: group,
        hitbox,
        bounds,
        group,
        cargoGroup
      };

      rec.syncPlacement = function (includeSolid) {
        const px = rec.group.position.x;
        const pz = rec.group.position.z;
        const ry = rec.group.rotation.y;
        rec.x = px;
        rec.z = pz;
        rec.rotY = ry;
        const c = Math.abs(Math.cos(ry));
        const s = Math.abs(Math.sin(ry));
        const halfW = (c * rec.width + s * rec.depth) / 2;
        const halfD = (s * rec.width + c * rec.depth) / 2;
        rec.bounds.minX = px - halfW;
        rec.bounds.maxX = px + halfW;
        rec.bounds.minZ = pz - halfD;
        rec.bounds.maxZ = pz + halfD;
        const idx = solidWalls.indexOf(rec.bounds);
        const shouldSolid = includeSolid !== undefined ? Boolean(includeSolid) : Boolean(rec.group.visible && !rec.isHitched);
        if (shouldSolid && idx === -1) {
          solidWalls.push(rec.bounds);
        } else if (!shouldSolid && idx !== -1) {
          solidWalls.splice(idx, 1);
        }
      };

      const palletInteractible = {
        id: `pallet_${resolvedPalletId}`,
        type: 'pallet',
        name: label || 'Overstock Pallet',
        target: rec,
        mesh: hitbox,
        get boxCenter() {
          return new THREE.Vector3(rec.group.position.x, 0.65, rec.group.position.z);
        },
        get boxQuaternion() {
          return rec.group.quaternion;
        },
        boxSize: new THREE.Vector3(palletW + 0.06, 1.30, palletD + 0.06),
        getPrompt: () => `[Space] Lift & Move Overstock Pallet (${label || resolvedPalletId})`,
        interact: () => {
          if (hooks.onHitchPallet) hooks.onHitchPallet(rec);
        }
      };
      interactibles.push(palletInteractible);
      hitbox.userData.interactible = palletInteractible;
      rec.interactible = palletInteractible;

      overstockPallets.push(rec);
      return rec;
    }

    // 1. Freezer Overstock Pallets (3 spawn points aligned with Freezer Steel bays, ~1.07m aisle clearance)
    [20.44, 22.80, 25.04].forEach((pz, idx) => {
      createOverstockFloorPallet({
        palletId: `freezer_steel_p${idx + 1}`,
        rackId: 'freezer_steel',
        zone: 'F',
        label: `FREEZER BACKSTOCK PALLET ${idx + 1}`,
        accentCss: '#38bdf8',
        x: -10.25,
        z: pz,
        rotY: Math.PI / 2
      });
    });

    // 2. Cooler Overstock Pallets (3 spawn points aligned with Cooler Steel bays, ~1.07m aisle clearance)
    [20.44, 22.80, 25.04].forEach((pz, idx) => {
      createOverstockFloorPallet({
        palletId: `cooler_steel_p${idx + 1}`,
        rackId: 'cooler_steel',
        zone: 'C',
        label: `COOLER BACKSTOCK PALLET ${idx + 1}`,
        accentCss: '#34d399',
        x: 5.70,
        z: pz,
        rotY: Math.PI / 2
      });
    });

    // 3. Dry Backstock Overstock Pallets (3 spawn points aligned with Dry Steel bays, ~1.05m aisle clearance)
    [-4.78, -2.40, -0.02].forEach((px, idx) => {
      createOverstockFloorPallet({
        palletId: `dry_steel_p${idx + 1}`,
        rackId: 'dry_steel',
        zone: 'D',
        label: `DRY BACKSTOCK PALLET ${idx + 1}`,
        accentCss: '#f59e0b',
        x: px,
        z: 13.95,
        rotY: 0
      });
    });

    // 4. Claims & Supplies Overstock Pallets (3 spawn points aligned with Claims Steel bays, ~1.05m aisle clearance)
    [4.82, 7.20, 9.58].forEach((px, idx) => {
      createOverstockFloorPallet({
        palletId: `claims_steel_p${idx + 1}`,
        rackId: 'claims_steel',
        zone: 'CLAIMS',
        label: `SUPPLIES BACKSTOCK PALLET ${idx + 1}`,
        accentCss: '#f87171',
        x: px,
        z: 13.95,
        rotY: 0
      });
    });

    // ==========================================
    // 3-TIERED SOLID-SHELF STOCKING CART (RECALLS STAGING)
    // Placed on regular staging tile (Col 9, X = 10.20, Z = 11.80) just north of east-most
    // Dept 60 overstock pallet (claims_steel_p3) & near Side Rollup Door, clear of 'Y' transit lane.
    // ==========================================
    function createThreeTierStockingCart3D(x, z, rotY = 0) {
      const cartW = 0.60;
      const cartL = 1.12;
      const deckW = 0.58;
      const deckL = 1.08;
      const deckThick = 0.024;
      const tierCentersY = [0.144, 0.864];
      const topTierY = tierCentersY[tierCentersY.length - 1];
      const tierTopY = tierCentersY.map((cy) => cy + deckThick / 2);

      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = rotY;

      const matCartDeck = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.42,
        roughness: 0.58
      });
      const matCartRail = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.65,
        roughness: 0.40
      });
      const matCartChrome = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.85,
        roughness: 0.24
      });
      const matCartRubber = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.92
      });

      // 1. Three continuous solid flat shelves (no grates/gaps) with raised perimeter retention lips
      const lipH = 0.026;
      const lipT = 0.016;
      tierCentersY.forEach((cy) => {
        // Solid continuous flat shelf deck
        const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, deckThick, deckL), matCartDeck);
        deck.position.set(0, cy, 0);
        group.add(deck);

        // Underside reinforcing longitudinal channels
        [-deckW * 0.34, deckW * 0.34].forEach((rx) => {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, deckL - 0.06), matCartRail);
          rib.position.set(rx, cy - deckThick / 2 - 0.009, 0);
          group.add(rib);
        });

        // Raised perimeter safety lips flush against deck edges (keeps small items from sliding off)
        [-deckL / 2 + lipT / 2, deckL / 2 - lipT / 2].forEach((lz) => {
          const endLip = new THREE.Mesh(new THREE.BoxGeometry(deckW, lipH, lipT), matCartRail);
          endLip.position.set(0, cy + deckThick / 2 + lipH / 2 - 0.004, lz);
          group.add(endLip);
        });
        [-deckW / 2 + lipT / 2, deckW / 2 - lipT / 2].forEach((lx) => {
          const sideLip = new THREE.Mesh(new THREE.BoxGeometry(lipT, lipH, deckL - lipT * 2), matCartRail);
          sideLip.position.set(lx, cy + deckThick / 2 + lipH / 2 - 0.004, 0);
          group.add(sideLip);
        });
      });

      // 2. Four vertical chrome corner posts from bottom frame to top shelf
      const postX = deckW / 2 - 0.016;
      const postZ = deckL / 2 - 0.016;
      const postBottomY = 0.115;
      const frontPostTopY = topTierY + deckThick / 2 + 0.024;
      const frontPostH = frontPostTopY - postBottomY;

      [-postX, postX].forEach((px) => {
        // Front corner uprights (to top shelf lip)
        const frontPost = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, frontPostH, 12), matCartChrome);
        frontPost.position.set(px, postBottomY + frontPostH / 2, -postZ);
        group.add(frontPost);

        // Rear corner uprights extending up to push-handle height (Y = 1.04m)
        const rearPostTopY = 1.04;
        const rearPostH = rearPostTopY - postBottomY;
        const rearPost = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, rearPostH, 12), matCartChrome);
        rearPost.position.set(px, postBottomY + rearPostH / 2, postZ);
        group.add(rearPost);

        // Angled rear handle stub reaching slightly outward (+Z)
        const handleStub = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.09, 10), matCartChrome);
        handleStub.rotation.x = Math.PI / 2;
        handleStub.position.set(px, rearPostTopY, postZ + 0.045);
        group.add(handleStub);

        // Black rubber bumper endcaps on front corner bases
        const bumperCap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.032, 12), matCartRubber);
        bumperCap.position.set(px, postBottomY + 0.02, -postZ);
        group.add(bumperCap);
      });

      // 3. Full-width tubular push handle with padded grip
      const handleSpan = postX * 2 + 0.032;
      const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, handleSpan, 14), matCartChrome);
      handleBar.rotation.z = Math.PI / 2;
      handleBar.position.set(0, 1.04, postZ + 0.09);
      group.add(handleBar);

      const handleGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, handleSpan * 0.72, 14), matCartRubber);
      handleGrip.rotation.z = Math.PI / 2;
      handleGrip.position.set(0, 1.04, postZ + 0.09);
      group.add(handleGrip);

      // 4. Four corner swivel caster brackets & rubber wheels
      const casterOffsets = [
        { cx: -0.22, cz: -0.45 },
        { cx: 0.22, cz: -0.45 },
        { cx: -0.22, cz: 0.45 },
        { cx: 0.22, cz: 0.45 }
      ];
      casterOffsets.forEach(({ cx, cz }) => {
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.068, 0.064), matCartRail);
        fork.position.set(cx, 0.096, cz);
        group.add(fork);

        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.036, 16), matCartRubber);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(cx, 0.055, cz);
        group.add(wheel);

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.040, 12), matCartChrome);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(cx, 0.055, cz);
        group.add(hub);
      });

      // 5. Crisp high-DPI "RECALL" placard plate on North-facing top lip
      const recallCanvas = document.createElement('canvas');
      recallCanvas.width = 1024;
      recallCanvas.height = 256;
      const rCtx = recallCanvas.getContext('2d');
      rCtx.fillStyle = '#0f172a';
      rCtx.fillRect(0, 0, 1024, 256);
      rCtx.strokeStyle = '#f59e0b';
      rCtx.lineWidth = 14;
      rCtx.strokeRect(10, 10, 1004, 236);
      rCtx.fillStyle = '#f59e0b';
      rCtx.fillRect(24, 24, 976, 22);
      rCtx.fillStyle = '#fef3c7';
      rCtx.font = '900 132px "Segoe UI", Arial, sans-serif';
      rCtx.textAlign = 'center';
      rCtx.textBaseline = 'middle';
      rCtx.fillText('RECALL', 512, 152);
      const recallTagTex = new THREE.CanvasTexture(recallCanvas);
      recallTagTex.anisotropy = 4;
      recallTagTex.generateMipmaps = false;
      recallTagTex.minFilter = THREE.LinearFilter;
      recallTagTex.magFilter = THREE.LinearFilter;
      const matRecallTag = new THREE.MeshStandardMaterial({
        map: recallTagTex,
        roughness: 0.42,
        metalness: 0.05
      });
      const frontTag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.012), matCartRail);
      frontTag.position.set(0, topTierY - 0.02, -deckL / 2 - 0.008);
      group.add(frontTag);
      const frontTagFace = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.075), matRecallTag);
      frontTagFace.rotation.y = Math.PI;
      frontTagFace.position.set(0, topTierY - 0.02, -deckL / 2 - 0.015);
      group.add(frontTagFace);

      group.visible = false;
      scene.add(group);

      const bounds = {
        minX: x - cartW / 2 - 0.02,
        maxX: x + cartW / 2 + 0.02,
        minZ: z - cartL / 2 - 0.03,
        maxZ: z + cartL / 2 + 0.06
      };

      function setVisible(show) {
        const visible = Boolean(show);
        group.visible = visible;
        const idx = solidWalls.indexOf(bounds);
        if (visible && idx === -1) {
          solidWalls.push(bounds);
        } else if (!visible && idx !== -1) {
          solidWalls.splice(idx, 1);
        }
      }

      return {
        id: 'recall_cart',
        label: 'RECALL CART',
        x,
        z,
        rotY,
        width: cartW,
        length: cartL,
        tierTopY,
        bounds,
        group,
        setVisible
      };
    }

    const recallCart = createThreeTierStockingCart3D(10.20, 11.80, 0);


    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 0.58);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.34);
    scene.add(ambientLight);

    // Freezer blue lighting
    const freezerLight = new THREE.PointLight(0x38bdf8, 0.95, 14, 1.4);
    freezerLight.position.set(gridToWorld(2, 19.5).x, COLD_CEILING_H - 0.4, gridToWorld(2, 19.5).z);
    scene.add(freezerLight);

    // Cooler crisp cyan lighting
    const coolerLight = new THREE.PointLight(0xbae6fd, 0.95, 14, 1.4);
    coolerLight.position.set(gridToWorld(7, 19.5).x, COLD_CEILING_H - 0.4, gridToWorld(7, 19.5).z);
    scene.add(coolerLight);

    // Trailer interior lighting uses self-lit cargo strips; outdoor yard relies on hemisphere + ambient light


    return {
      solidWalls,
      interactibles,
      dockDoors,
      sideRollupDoor,
      coldDoors,
      steelRacks,
      overstockPallets,
      recallCart,
      createClaimsToteMesh: createClaimsShelfToteMesh,
      matSteel,
      DOCK_CEILING_H,
      TRUCK_CEILING_H,
      COLD_CEILING_H,
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
    };
  }

  global.WarehouseWorld = {
    DOCK_LAYOUT,
    COLS,
    ROWS,
    TILE_SIZE,
    ORIGIN_X,
    ORIGIN_Z,
    gridToWorld,
    worldToGrid,
    getTileType,
    buildFacilityScene
  };
})(window);
