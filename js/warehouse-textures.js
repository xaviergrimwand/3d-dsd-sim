(function (global) {
  'use strict';

  // PROCEDURAL TEXTURE GENERATORS
  // Rich architectural textures reconciled from original rendering
  // ==========================================

  // 1. Concrete Floor with stains and expansion joint seams
  function createConcreteFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#7a818c';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 35000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, Math.random() * 3 + 1, Math.random() * 3 + 1);
    }

    ctx.strokeStyle = '#4b525d';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 504, 504);
    ctx.beginPath();
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(257, 0); ctx.lineTo(257, 512);
    ctx.moveTo(0, 257); ctx.lineTo(512, 257);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  // 2. Concrete Wall with vertical panel seams & tie-rod circular impressions
  function createConcreteWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8e96a2';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 30000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, y, Math.random() * 2 + 1, Math.random() * 2 + 1);
    }

    ctx.strokeStyle = 'rgba(40,46,55,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(128, 0); ctx.lineTo(128, 512);
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.moveTo(384, 0); ctx.lineTo(384, 512);
    ctx.stroke();

    ctx.fillStyle = 'rgba(30,35,42,0.3)';
    [64, 192, 320, 448].forEach(cx => {
      [64, 256, 448].forEach(cy => {
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    return tex;
  }

  // 3. Diagonal Hazard Stripe Texture (Yellow & Black)
  function createHazardStripeTexture(repeatCount = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#18181b';
    const stripeWidth = 24;
    for (let x = -64; x < 320; x += stripeWidth * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeWidth, 0);
      ctx.lineTo(x + stripeWidth + 64, 64);
      ctx.lineTo(x + 64, 64);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatCount, 1);
    return tex;
  }

  // 4. Corrugated Metal Roller Shutter Texture
  function createRollerDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8c95a3';
    ctx.fillRect(0, 0, 256, 512);
    const slatHeight = 16;
    for (let y = 0; y < 512; y += slatHeight) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, y, 256, 3);
      ctx.fillStyle = 'rgba(120,130,145,0.3)';
      ctx.fillRect(0, y + 3, 256, slatHeight - 6);
      ctx.fillStyle = 'rgba(20,25,35,0.6)';
      ctx.fillRect(0, y + slatHeight - 3, 256, 3);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 5. Door Number Sign Placard ("1", "2", "3", "4")
  function createNumberTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 242, 242);
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 160px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 134);
    return new THREE.CanvasTexture(canvas);
  }

  // 6. Analog Wall Clock Dial Texture (hands are separate 3D meshes for animation)
  function createClockTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const cx = 256;
    const cy = 256;

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(cx, cy, 248, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.stroke();

    // 60 minute & hour tick marks
    for (let i = 0; i < 60; i++) {
      const angle = (i * Math.PI) / 30 - Math.PI / 2;
      const isHour = (i % 5 === 0);
      const isQuarter = (i % 15 === 0);
      const innerR = isHour ? (isQuarter ? 196 : 202) : 212;
      const outerR = 224;
      ctx.strokeStyle = isHour ? '#0f172a' : '#64748b';
      ctx.lineWidth = isHour ? (isQuarter ? 8 : 5) : 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.stroke();
    }

    // Hour numerals 1-12
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let h = 1; h <= 12; h++) {
      const angle = (h * Math.PI) / 6 - Math.PI / 2;
      const numR = 164;
      ctx.fillText(String(h), cx + Math.cos(angle) * numR, cy + Math.sin(angle) * numR);
    }

    // Subtle industrial dial labels
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('DSD RECEIVING', cx, 194);
    ctx.font = 'bold 12px monospace';
    ctx.fillText('QUARTZ', cx, 320);

    return new THREE.CanvasTexture(canvas);
  }

  // 7. Industrial Warning Signs & Placards
  function createWarningSignTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 160);

    if (type === 'caution') {
      ctx.fillStyle = '#eab308';
      ctx.fillRect(8, 8, 240, 48);
      ctx.fillStyle = '#000000';
      ctx.font = '900 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CAUTION', 128, 42);
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('AUTHORIZED PERSONNEL', 128, 85);
      ctx.fillText('ONLY BEYOND THIS POINT', 128, 108);
      ctx.fillText('EYE PROTECTION REQ.', 128, 132);
    } else if (type === 'danger') {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(8, 8, 240, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DANGER', 128, 42);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('HIGH VOLTAGE 480V', 128, 92);
      ctx.fillText('KEEP CLEAR AT ALL TIMES', 128, 122);
    } else if (type === 'warning') {
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(8, 8, 240, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WARNING', 128, 42);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('FORKLIFT TRAFFIC', 128, 88);
      ctx.fillText('PEDESTRIANS YIELD', 128, 114);
    } else if (type === 'extinguisher') {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(8, 8, 240, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FIRE EXTINGUISHER', 128, 40);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('DO NOT BLOCK ACCESS', 128, 88);
      ctx.fillText('INSPECTED MONTHLY', 128, 114);
    } else if (type === 'eyewash') {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(8, 8, 240, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EMERGENCY EYE WASH', 128, 38);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('SAFETY SHOWER STATION', 128, 88);
      ctx.fillText('KEEP CLEAR AT ALL TIMES', 128, 114);
    } else if (type === 'dockrules') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(8, 8, 240, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DOCK OPERATIONS', 128, 38);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('1. WHEEL CHOCKS REQ.', 128, 76);
      ctx.fillText('2. JACK STANDS IN PLACE', 128, 98);
      ctx.fillText('3. INSPECT BEFORE UNLOAD', 128, 120);
    } else {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(8, 8, 240, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SAFETY FIRST', 128, 38);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('REPORT ALL INCIDENTS', 128, 88);
      ctx.fillText('TO DOCK SUPERVISOR', 128, 114);
    }

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 154);
    return new THREE.CanvasTexture(canvas);
  }

  function createColdHeaderPlacardTexture(isFreezer) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    // Enamel background gradient matching Freezer / Cooler palette
    const grad = ctx.createLinearGradient(0, 0, 0, 192);
    if (isFreezer) {
      grad.addColorStop(0, '#072a4f');
      grad.addColorStop(0.65, '#0b3b6e');
      grad.addColorStop(1, '#06203d');
    } else {
      grad.addColorStop(0, '#064e4b');
      grad.addColorStop(0.65, '#0a6c63');
      grad.addColorStop(1, '#053b38');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 768, 192);

    // Metallic outer border + hairline + corner mounting bolts
    ctx.strokeStyle = isFreezer ? '#7dd3fc' : '#6ee7b7';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 752, 176);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, 736, 160);

    [[24, 24], [744, 24], [24, 168], [744, 168]].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#cbd5e1';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Left Emblem Box (Snowflake for Freezer / Thermometer for Cooler)
    ctx.fillStyle = isFreezer ? 'rgba(3, 105, 161, 0.55)' : 'rgba(5, 150, 105, 0.45)';
    ctx.fillRect(32, 28, 136, 136);
    ctx.strokeStyle = isFreezer ? '#bae6fd' : '#a7f3d0';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 28, 136, 136);

    const cx = 100;
    const cy = 96;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineCap = 'round';

    if (isFreezer) {
      ctx.lineWidth = 5;
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3;
        const x2 = cx + Math.cos(ang) * 44;
        const y2 = cy + Math.sin(ang) * 44;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const bx = cx + Math.cos(ang) * 28;
        const by = cy + Math.sin(ang) * 28;
        [-0.55, 0.55].forEach((offset) => {
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ang + offset) * 14, by + Math.sin(ang + offset) * 14);
          ctx.stroke();
        });
      }
    } else {
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.roundRect(cx - 10, cy - 46, 20, 56, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 22, 17, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(cx - 4, cy - 24, 8, 38);
    }

    // Clean centered single-word label: FREEZER or COOLER only
    ctx.font = '900 84px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillText(isFreezer ? 'FREEZER' : 'COOLER', 462, 102);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(isFreezer ? 'FREEZER' : 'COOLER', 458, 98);

    return new THREE.CanvasTexture(canvas);
  }

  function createTempLedTexture(tempText, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 120);
    ctx.fillStyle = colorHex;
    ctx.font = '900 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tempText, 128, 75);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('ZONE TEMP SENSOR', 128, 105);
    return new THREE.CanvasTexture(canvas);
  }

  // 8. Workstation Terminal CRT Screen Display (Live replica of AS/400 New Main Menu)
  function createCrtScreenDisplay() {
    const W = 640;
    const H = 528;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    let lastKey = '';

    function draw(data) {
      const d = data || {};
      const dateLabel = d.dateLabel || 'FEB 1, 1996';
      const timeLabel = d.timeLabel || '6:00 AM';
      const initialCount = Number(d.initialCount) || 0;
      const finalCount = Number(d.finalCount) || 0;
      const receiptTotal = initialCount + finalCount;
      const activeCount = Number(d.activeCount) || 0;
      const vendorTruckCount = Number(d.vendorTruckCount) || 0;
      const sideDoorCount = Number(d.sideDoorCount) || 0;
      const whTrucks = Array.isArray(d.whTrucks) ? d.whTrucks : [];
      const recallCount = Number(d.recallCount) || 0;
      const shortageCount = Number(d.shortageCount) || 0;
      const overageCount = Number(d.overageCount) || 0;
      const missingCount = Number(d.missingCount) || 0;
      const totalUnhandled = Number.isFinite(Number(d.totalUnhandled))
        ? Number(d.totalUnhandled)
        : (recallCount + shortageCount + overageCount + missingCount);

      const whKey = whTrucks.map(t => `${t.etaText || ''}:${t.totalPallets || 0}:${t.dry || 0}/${t.chilled || 0}/${t.frozen || 0}`).join('|');
      const key = [
        dateLabel, timeLabel, initialCount, finalCount, activeCount,
        vendorTruckCount, sideDoorCount, whKey,
        recallCount, shortageCount, overageCount, missingCount
      ].join(';');
      if (key === lastKey) return;
      lastKey = key;

      // Deep phosphor CRT screen base (#020b04)
      ctx.fillStyle = '#020b04';
      ctx.fillRect(0, 0, W, H);

      // Radial phosphor tube glow
      const glow = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 360);
      glow.addColorStop(0, 'rgba(34, 197, 94, 0.14)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Inner phosphor border
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, W - 24, H - 24);

      // Header bar (+== AS/400 DSD RECEIVING SYSTEM :: MAIN MENU)
      ctx.fillStyle = 'rgba(20, 83, 45, 0.24)';
      ctx.fillRect(22, 22, W - 44, 38);
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(22, 22); ctx.lineTo(W - 22, 22);
      ctx.stroke();

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, 60); ctx.lineTo(W - 22, 60);
      ctx.moveTo(22, 64); ctx.lineTo(W - 22, 64);
      ctx.stroke();

      ctx.font = 'bold 12.5px "Courier New", monospace';
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'left';
      ctx.fillText('+== AS/400 DSD RECEIVING SYSTEM :: MAIN MENU', 28, 45);

      // [ F2=PAPER ] & [ F3=CLOSE ] header buttons
      ctx.fillStyle = '#422006';
      ctx.fillRect(W - 224, 29, 90, 24);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W - 224, 29, 90, 24);
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText('[ F2=PAPER ]', W - 179, 45);

      ctx.fillStyle = '#052e16';
      ctx.fillRect(W - 126, 29, 98, 24);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W - 126, 29, 98, 24);
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'center';
      ctx.fillText('[ F3=CLOSE ]', W - 77, 45);

      // Top meta strip (.crt-meta-bar)
      ctx.fillStyle = 'rgba(20, 83, 45, 0.16)';
      ctx.fillRect(22, 73, W - 44, 28);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(22, 73); ctx.lineTo(W - 22, 73);
      ctx.moveTo(22, 101); ctx.lineTo(W - 22, 101);
      ctx.stroke();
      ctx.restore();

      ctx.font = 'bold 11.5px "Courier New", monospace';
      ctx.fillStyle = '#86efac';
      ctx.textAlign = 'left';
      ctx.fillText('STORE #0412 :: SYS:DSD96 :: OP:RCVR01', 30, 91);
      ctx.textAlign = 'right';
      ctx.fillText(`${dateLabel} :: ${timeLabel}`, W - 30, 91);

      // 2-Column New Main Menu Layout (Left 2/3 option cards, Right 1/3 Shift Summary)
      const contentTop = 111;
      const contentBottom = H - 62;
      const contentH = contentBottom - contentTop; // 355px
      const leftX = 22;
      const leftW = 388;
      const sumX = leftX + leftW + 10; // 420
      const sumW = (W - 22) - sumX; // 198

      const menuRows = [
        { key: '[1]', title: 'CREATE MANUAL RECEIPT' },
        { key: '[2]', title: 'RECEIPTS LEDGER' },
        { key: '[3]', title: 'SHIFT RECEIVING SCHEDULE' },
        { key: '[4]', title: 'RECEIVING TASKS & RECALLS' },
        { key: '[5]', title: 'SUPPLIERS & ITEM DIRECTORY' }
      ];

      const gap = 9;
      const cardH = Math.floor((contentH - gap * (menuRows.length - 1)) / menuRows.length);

      menuRows.forEach((row, idx) => {
        const cy = contentTop + idx * (cardH + gap);
        ctx.fillStyle = 'rgba(5, 46, 22, 0.26)';
        ctx.fillRect(leftX, cy, leftW, cardH);

        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(leftX, cy, leftW, cardH);
        ctx.restore();

        // Left 3px green bar (.crt-menu-card)
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(leftX, cy, 4, cardH);

        // Amber key badge [1]..[5]
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.fillStyle = '#facc15';
        ctx.textAlign = 'left';
        ctx.fillText(row.key, leftX + 14, cy + Math.round(cardH * 0.57));

        // Option title (clean single line, no description)
        ctx.font = 'bold 14.5px "Courier New", monospace';
        ctx.fillStyle = '#4ade80';
        ctx.fillText(row.title, leftX + 54, cy + Math.round(cardH * 0.57));
      });

      // Right Column: SHIFT SUMMARY panel (.crt-menu-summary)
      ctx.fillStyle = 'rgba(2, 24, 10, 0.62)';
      ctx.fillRect(sumX, contentTop, sumW, contentH);

      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(sumX, contentTop, sumW, contentH);
      ctx.restore();

      ctx.fillStyle = '#22c55e';
      ctx.fillRect(sumX, contentTop, 4, contentH);

      // Clip interior of Shift Summary to prevent overflow if many trucks exist
      ctx.save();
      ctx.beginPath();
      ctx.rect(sumX + 6, contentTop + 4, sumW - 12, contentH - 8);
      ctx.clip();

      const sxLeft = sumX + 11;
      const sxRight = sumX + sumW - 9;
      let sy = contentTop + 18;

      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'left';
      ctx.fillText('SHIFT SUMMARY', sxLeft, sy);

      sy += 5;
      ctx.save();
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sxLeft, sy);
      ctx.lineTo(sxRight, sy);
      ctx.stroke();
      ctx.restore();

      const drawVal = (val, yPos) => {
        ctx.font = 'bold 10.5px "Courier New", monospace';
        ctx.fillStyle = val === 0 ? '#6b9e78' : '#4ade80';
        ctx.textAlign = 'right';
        ctx.fillText(String(val), sxRight, yPos);
      };

      const drawHdr = (label, val) => {
        sy += 16;
        ctx.font = 'bold 10.5px "Courier New", monospace';
        ctx.fillStyle = '#4ade80';
        ctx.textAlign = 'left';
        ctx.fillText(label, sxLeft, sy);
        drawVal(val, sy);
        ctx.save();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sxLeft, sy + 3);
        ctx.lineTo(sxRight, sy + 3);
        ctx.stroke();
        ctx.restore();
      };

      const drawRow = (label, val, indent, color) => {
        sy += 14;
        ctx.font = '10px "Courier New", monospace';
        ctx.fillStyle = color || '#bbf7d0';
        ctx.textAlign = 'left';
        ctx.fillText(label, sxLeft + (indent || 6), sy);
        if (val !== null && val !== undefined) {
          drawVal(val, sy);
        }
      };

      // RECEIPTS group
      drawHdr('RECEIPTS', receiptTotal);
      drawRow('Initial Receipts', initialCount, 6, '#bbf7d0');
      drawRow('Final Receipts', finalCount, 6, '#bbf7d0');

      sy += 5;
      // SCHEDULED DELIVERIES group
      drawHdr('SCHEDULED DELIVERIES', activeCount);
      drawRow('Vendor Trucks', vendorTruckCount, 6, '#bbf7d0');
      drawRow('Side Door', sideDoorCount, 6, '#bbf7d0');
      drawRow('Warehouse Trucks', whTrucks.length, 6, '#bbf7d0');

      if (whTrucks.length > 0) {
        whTrucks.slice(0, 3).forEach((t, idx) => {
          drawRow(`Truck #${idx + 1} (${t.etaText || 'TBD'})`, Number(t.totalPallets) || 0, 12, '#bbf7d0');
          drawRow(`D ${Number(t.dry) || 0}   C ${Number(t.chilled) || 0}   F ${Number(t.frozen) || 0}`, null, 12, '#86efac');
        });
      } else {
        drawRow('Pallets', 0, 12, '#bbf7d0');
        drawRow('D 0   C 0   F 0', null, 12, '#86efac');
      }

      sy += 5;
      // UNHANDLED TASKS group
      drawHdr('UNHANDLED TASKS', totalUnhandled);
      drawRow('Recalls', recallCount, 6, '#bbf7d0');
      drawRow('Shortages', shortageCount, 6, '#bbf7d0');
      drawRow('Overages', overageCount, 6, '#bbf7d0');
      drawRow('Missing Receipts', missingCount, 6, '#bbf7d0');

      ctx.restore(); // end summary clip

      // Bottom command prompt strip
      const footY = H - 52;
      ctx.fillStyle = 'rgba(20, 83, 45, 0.16)';
      ctx.fillRect(22, footY, W - 44, 28);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(22, footY); ctx.lineTo(W - 22, footY);
      ctx.moveTo(22, footY + 28); ctx.lineTo(W - 22, footY + 28);
      ctx.stroke();
      ctx.restore();

      ctx.font = 'bold 11.5px "Courier New", monospace';
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'left';
      ctx.fillText('SELECTION ===> [ PRESS KEY 1-5 ]', 30, footY + 18);
      ctx.fillStyle = '#86efac';
      ctx.textAlign = 'right';
      ctx.fillText('F2=PAPER  F12=MENU  F3=CLOSE', W - 30, footY + 18);

      // Subtle CRT scanline pass
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      for (let y = 0; y < H; y += 3) {
        ctx.fillRect(0, y, W, 1.5);
      }

      // CRT bezel edge vignette
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.80)';
      ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, W, H);

      tex.needsUpdate = true;
    }

    draw({});
    return { texture: tex, draw };
  }

  function createCrtScreenTexture() {
    return createCrtScreenDisplay().texture;
  }

  // 8b. Document Tray Printed Invoice Sheet Texture (matching reference image)
  function createInvoiceSheetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 340;
    const ctx = canvas.getContext('2d');

    // Crisp office invoice paper
    ctx.fillStyle = '#fbfbfb';
    ctx.fillRect(0, 0, 256, 340);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 240, 324);

    // Header: INVOICE
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('INVOICE', 20, 38);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#475569';
    ctx.fillText('INV #: 0071154', 20, 56);
    ctx.fillText('DATE: 2026-02-18', 20, 70);

    // Table Header
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(16, 82, 224, 18);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('ITEM', 22, 94);
    ctx.fillText('QTY', 140, 94);
    ctx.fillText('PRICE', 185, 94);

    // Item Rows
    ctx.fillStyle = '#334155';
    ctx.font = '9px monospace';
    ctx.fillText('SPARE PUMP', 22, 116);
    ctx.fillText('1', 148, 116);
    ctx.fillText('.00', 185, 116);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 130); ctx.lineTo(240, 130);
    ctx.stroke();

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('TOTAL: .00', 130, 154);

    // Barcode lines at bottom
    ctx.fillStyle = '#0f172a';
    for (let x = 20; x < 236; x += 4) {
      if ((x * 13) % 7 !== 0) ctx.fillRect(x, 260, 2, 36);
    }
    ctx.font = '8px monospace';
    ctx.fillText('DSD-PO-4091-VERIFIED', 60, 310);

    // Red APPROVED stamp
    ctx.save();
    ctx.translate(140, 205);
    ctx.rotate(-0.18);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.strokeRect(-45, -12, 90, 24);
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RECEIVED', 0, 4);
    ctx.restore();

    return new THREE.CanvasTexture(canvas);
  }

  // 8c. Textured 90s Chunky Mechanical Keyboard (Model-M Cream/Pebble Keycaps & ABS Pebble Housing)
  function createKeyboardShellTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#d7d1c3';
    ctx.fillRect(0, 0, 256, 256);

    // Classic 90s injection-molded ABS pebble grain
    for (let i = 0; i < 480; i++) {
      const px = (i * 61 + 13) % 254;
      const py = (i * 107 + 23) % 254;
      ctx.fillStyle = (i % 2 === 0) ? 'rgba(255, 252, 244, 0.14)' : 'rgba(110, 102, 88, 0.12)';
      ctx.fillRect(px, py, 2, 2);
    }

    // Subtle molded bezel rim shadow
    ctx.strokeStyle = 'rgba(92, 86, 74, 0.22)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 252);

    return new THREE.CanvasTexture(canvas);
  }

  function createKeyboardTexture(section = 'full') {
    const dims = {
      main: [512, 192],
      func: [512, 48],
      nav: [128, 192],
      numpad: [160, 192],
      badge: [256, 48],
      full: [512, 180]
    };
    const [w, h] = dims[section] || dims.full;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    function drawKeycap(x, y, kw, kh, label, isModifier) {
      // Dark keywell gap under skirt
      ctx.fillStyle = '#1e2128';
      ctx.fillRect(x - 1, y - 1, kw + 2, kh + 2);
      // Keycap skirt (darker beveled base)
      ctx.fillStyle = isModifier ? '#857f72' : '#bab3a3';
      ctx.fillRect(x, y, kw, kh);
      // Top highlight rim & sculpted dish face
      ctx.fillStyle = isModifier ? '#ada697' : '#ebe5d7';
      ctx.fillRect(x + 2, y + 1.5, Math.max(4, kw - 4), Math.max(4, kh - 5));
      ctx.strokeStyle = isModifier ? 'rgba(235, 229, 215, 0.32)' : 'rgba(255, 255, 250, 0.50)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2, Math.max(3, kw - 5), Math.max(3, kh - 6));

      if (label) {
        ctx.fillStyle = '#1f2329';
        ctx.font = label.length > 2 ? 'bold 8px monospace' : 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + 4.5, y + 4);
      }
    }

    if (section === 'badge') {
      // Dark brushed-slate top indicator strip + 90s asset plate
      ctx.fillStyle = '#24272d';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      // Left terminal tag ("DSD-3270")
      ctx.fillStyle = '#d1ccc0';
      ctx.fillRect(10, 9, 86, 30);
      ctx.fillStyle = '#18181b';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DSD-3270', 53, 24);

      // Right 3 status indicator windows (NUM, CAPS, SCRL)
      const leds = [
        { label: 'NUM', x: 132, on: true },
        { label: 'CAPS', x: 174, on: false },
        { label: 'SCRL', x: 216, on: false }
      ];
      leds.forEach((led) => {
        ctx.fillStyle = led.on ? '#22c55e' : '#14532d';
        ctx.fillRect(led.x, 12, 18, 8);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 8px monospace';
        ctx.fillText(led.label, led.x + 9, 34);
      });
      return new THREE.CanvasTexture(canvas);
    }

    ctx.fillStyle = '#2b2f38';
    ctx.fillRect(0, 0, w, h);

    if (section === 'func') {
      drawKeycap(6, 7, 30, 34, 'Esc', true);
      const fGroups = [
        { startX: 60, labels: ['F1', 'F2', 'F3', 'F4'], mod: false },
        { startX: 204, labels: ['F5', 'F6', 'F7', 'F8'], mod: true },
        { startX: 348, labels: ['F9', 'F10', 'F11', 'F12'], mod: false }
      ];
      fGroups.forEach((grp) => {
        grp.labels.forEach((lbl, idx) => {
          drawKeycap(grp.startX + idx * 33, 7, 30, 34, lbl, grp.mod);
        });
      });
      return new THREE.CanvasTexture(canvas);
    }

    if (section === 'nav') {
      const topLabels = [
        ['Ins', 'Hm', 'PU'],
        ['Del', 'End', 'PD']
      ];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          drawKeycap(6 + c * 39, 6 + r * 36, 35, 32, topLabels[r][c], false);
        }
      }
      // Inverted-T arrow cluster
      drawKeycap(45, 114, 35, 32, '↑', true);
      drawKeycap(6, 150, 35, 32, '←', true);
      drawKeycap(45, 150, 35, 32, '↓', true);
      drawKeycap(84, 150, 35, 32, '→', true);
      return new THREE.CanvasTexture(canvas);
    }

    if (section === 'numpad') {
      const cw = 36;
      const ch = 33;
      const topKeys = [
        ['Num', true], ['/', true], ['*', true], ['-', true]
      ];
      topKeys.forEach(([lbl, mod], c) => drawKeycap(6 + c * 38, 6, 35, ch, lbl, mod));
      const rows = [
        [['7', false], ['8', false], ['9', false]],
        [['4', false], ['5', false], ['6', false]],
        [['1', false], ['2', false], ['3', false]]
      ];
      rows.forEach((row, r) => {
        row.forEach(([lbl, mod], c) => {
          drawKeycap(6 + c * 38, 42 + r * 36, 35, ch, lbl, mod);
        });
      });
      // Tall '+' and 'Ent' on right column, double-wide '0' + '.'
      drawKeycap(120, 42, 35, 69, '+', true);
      drawKeycap(120, 114, 35, 69, 'Ent', true);
      drawKeycap(6, 150, 73, ch, '0', false);
      drawKeycap(82, 150, 35, ch, '.', false);
      return new THREE.CanvasTexture(canvas);
    }

    if (section === 'main') {
      const row0 = [['~', 28, false], ['1', 30, false], ['2', 30, false], ['3', 30, false], ['4', 30, false], ['5', 30, false], ['6', 30, false], ['7', 30, false], ['8', 30, false], ['9', 30, false], ['0', 30, false], ['-', 30, false], ['=', 30, false], ['Bksp', 62, true]];
      const row1 = [['Tab', 46, true], ['Q', 30, false], ['W', 30, false], ['E', 30, false], ['R', 30, false], ['T', 30, false], ['Y', 30, false], ['U', 30, false], ['I', 30, false], ['O', 30, false], ['P', 30, false], ['[', 30, false], [']', 30, false], ['\\', 44, false]];
      const row2 = [['Caps', 56, true], ['A', 30, false], ['S', 30, false], ['D', 30, false], ['F', 30, false], ['G', 30, false], ['H', 30, false], ['J', 30, false], ['K', 30, false], ['L', 30, false], [';', 30, false], ['\'', 30, false], ['Enter', 68, true]];
      const row3 = [['Shift', 72, true], ['Z', 30, false], ['X', 30, false], ['C', 30, false], ['V', 30, false], ['B', 30, false], ['N', 30, false], ['M', 30, false], [',', 30, false], ['.', 30, false], ['/', 30, false], ['Shift', 86, true]];
      const row4 = [['Ctrl', 48, true], [' ', 28, true], ['Alt', 44, true], ['', 206, false], ['Alt', 44, true], [' ', 28, true], ['Ctrl', 50, true]];

      [row0, row1, row2, row3, row4].forEach((keys, rIdx) => {
        let kx = 6;
        const ky = 6 + rIdx * 36;
        keys.forEach(([lbl, kw, isMod]) => {
          drawKeycap(kx, ky, kw, 33, lbl, isMod);
          kx += kw + 3;
        });
      });
      return new THREE.CanvasTexture(canvas);
    }

    // Fallback 'full' compact layout
    ctx.fillStyle = '#d7d1c3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b2f38';
    ctx.fillRect(10, 10, 492, 160);
    for (let x = 16; x < 496; x += 30) {
      drawKeycap(x, 14, 24, 18, '', false);
    }
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 14; col++) {
        drawKeycap(16 + col * 24, 38 + row * 24, 20, 20, '', col === 0 || col === 13);
      }
    }
    drawKeycap(112, 134, 150, 22, '', false);
    drawKeycap(16, 134, 36, 22, 'Ctrl', true);
    drawKeycap(68, 134, 34, 22, 'Alt', true);
    drawKeycap(270, 134, 34, 22, 'Alt', true);
    drawKeycap(310, 134, 36, 22, 'Ctrl', true);
    return new THREE.CanvasTexture(canvas);
  }

  // 9. Cutaway Red Brick Texture for Outer Edge Pillars
  function createBrickTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#d6d3d1';
    const rowHeight = 32;
    const brickWidth = 64;
    for (let r = 0; r < 256; r += rowHeight) {
      ctx.fillRect(0, r, 256, 4);
      const offset = (r / rowHeight) % 2 === 0 ? 0 : brickWidth / 2;
      for (let c = offset; c < 256; c += brickWidth) {
        ctx.fillRect(c, r, 4, rowHeight);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 4);
    return tex;
  }


  function createHallwaySignTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, 502, 118);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '900 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EMPLOYEE BREAK HALL', 256, 52);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('LOCKERS  •  TIMECLOCK  •  BREAKROOM', 256, 94);
    return new THREE.CanvasTexture(canvas);
  }

  function createHallwayPosterTexture(variant) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    const presets = {
      safety_lift: {
        hdrBg: '#b45309',
        accent: '#f59e0b',
        badge: 'SAFETY FIRST',
        title: 'PROPER LIFTING',
        lines: ['1. TEST LOAD WEIGHT', '2. BEND AT KNEES', '3. KEEP BACK STRAIGHT', '4. TEAM LIFT 50+ LBS', '5. USE PALLET JACKS']
      },
      guidelines: {
        hdrBg: '#1d4ed8',
        accent: '#38bdf8',
        badge: 'TEAM GUIDELINES',
        title: 'DOCK STANDARDS',
        lines: ['• PUNCH IN / OUT ON TIME', '• SCAN EVERY DSD CASE', '• TEMP-CHECK ALL COLD', '• KEEP AISLES & EXITS', '  CLEAR AT ALL TIMES']
      },
      safety_exit: {
        hdrBg: '#991b1b',
        accent: '#ef4444',
        badge: 'DOCK SAFETY',
        title: 'AISLE & SPILL RULES',
        lines: ['• WATCH ELECTRIC JACKS', '• NO PALLETS IN YELLOW', '• REPORT SPILLS NOW', '• PPE VEST & BOOTS REQ', '• SECURE EXTERIOR DOORS']
      }
    };
    const cfg = presets[variant] || presets.safety_lift;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 320);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 310);

    ctx.fillStyle = cfg.hdrBg;
    ctx.fillRect(14, 14, 228, 72);
    ctx.fillStyle = '#fef08a';
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.badge, 128, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(cfg.title, 128, 70);

    ctx.fillStyle = cfg.accent;
    ctx.fillRect(22, 98, 212, 6);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    cfg.lines.forEach((line, idx) => {
      ctx.fillText(line, 24, 134 + idx * 34);
    });

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KGS DISTRIBUTION · RECEIVING', 128, 300);
    return new THREE.CanvasTexture(canvas);
  }

  function createNoPalletZoneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle brushed concrete grain
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect((i * 53) % 256, (i * 97) % 256, 2, 2);
    }

    // Safety yellow diagonal hazard stripes along left/door border and crisp inner keep-clear frame
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 256, 256);
    ctx.clip();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
    ctx.lineWidth = 14;
    for (let s = -256; s < 512; s += 44) {
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(s + 256, 256);
      ctx.stroke();
    }
    ctx.restore();

    // Inner dark charcoal pad with "NO PALLETS" stencil text
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.fillRect(28, 28, 200, 200);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 8;
    ctx.strokeRect(28, 28, 200, 200);

    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'center';
    ctx.font = '900 32px sans-serif';
    ctx.fillText('NO', 128, 114);
    ctx.fillText('PALLETS', 128, 152);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('KEEP DOOR CLEAR', 128, 186);

    return new THREE.CanvasTexture(canvas);
  }

  function createHallwayDoorSignTexture(title, subtitle, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor || '#0f172a';
    ctx.fillRect(0, 0, 256, 72);
    ctx.strokeStyle = textColor || '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 64);

    ctx.fillStyle = textColor || '#f8fafc';
    ctx.textAlign = 'center';
    ctx.font = '900 19px sans-serif';
    ctx.fillText(String(title || ''), 128, subtitle ? 32 : 43);
    if (subtitle) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(String(subtitle), 128, 55);
    }
    return new THREE.CanvasTexture(canvas);
  }

  function createVendingFrontTexture(kind) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    if (kind === 'soda') {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(0, 0, 256, 384);
      const grad = ctx.createLinearGradient(0, 14, 0, 265);
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(0.55, '#dc2626');
      grad.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = grad;
      ctx.fillRect(18, 16, 220, 246);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 4;
      ctx.strokeRect(18, 16, 220, 246);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '900 26px sans-serif';
      ctx.fillText('ICE COLD', 128, 86);
      ctx.fillStyle = '#fde047';
      ctx.font = '900 30px sans-serif';
      ctx.fillText('DRINKS', 128, 124);
      ctx.fillStyle = '#e0f2fe';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('75¢ · COLA · LIME · TEA', 128, 166);
      // Selection buttons column & vend chute
      for (let bi = 0; bi < 6; bi++) {
        ctx.fillStyle = ['#ef4444', '#38bdf8', '#22c55e', '#f59e0b', '#e2e8f0', '#7c3aed'][bi];
        ctx.fillRect(36 + (bi % 3) * 64, 194 + Math.floor(bi / 3) * 26, 52, 18);
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(34, 286, 188, 62);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.strokeRect(34, 286, 188, 62);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PUSH', 128, 322);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 256, 384);
      // Glass display window
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(16, 16, 162, 244);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, 162, 244);
      const colors = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#38bdf8', '#ec4899'];
      for (let row = 0; row < 5; row++) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(22, 56 + row * 44, 150, 4);
        for (let col = 0; col < 4; col++) {
          ctx.fillStyle = colors[(row * 4 + col) % colors.length];
          ctx.fillRect(26 + col * 36, 26 + row * 44, 26, 28);
        }
      }
      // Side keypad strip
      ctx.fillStyle = '#334155';
      ctx.fillRect(188, 34, 52, 180);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(194, 44, 40, 22);
      ctx.fillStyle = '#e2e8f0';
      for (let k = 0; k < 12; k++) {
        ctx.fillRect(194 + (k % 3) * 14, 80 + Math.floor(k / 3) * 16, 10, 11);
      }
      // Bottom pickup bin
      ctx.fillStyle = '#090d16';
      ctx.fillRect(26, 284, 204, 66);
      ctx.strokeStyle = '#64748b';
      ctx.strokeRect(26, 284, 204, 66);
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('SNACKS · 50¢', 128, 322);
    }

    return new THREE.CanvasTexture(canvas);
  }

  function createTrailerDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Crisp Todco white-silver slatted trailer roll-up door
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 512, 512);

    // Horizontal hinged slats (12 slats)
    const slatH = 40;
    for (let y = 0; y < 512; y += slatH) {
      ctx.fillStyle = (Math.floor(y / slatH) % 2 === 0) ? '#f1f5f9' : '#e2e8f0';
      ctx.fillRect(0, y, 512, slatH - 3);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, y + slatH - 3, 512, 3);
      // Rivet & hinge brackets on left/center/right
      [42, 256, 470].forEach((hx) => {
        ctx.fillStyle = '#475569';
        ctx.fillRect(hx - 8, y + slatH - 8, 16, 10);
      });
    }

    // Warning stencil near eye level
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(110, 178, 292, 46);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(110, 178, 292, 46);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TRAILER DOOR — SEALED', 256, 208);

    // Bottom latch bar & pull strap
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 484, 512, 28);
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(248, 430, 16, 62);

    return new THREE.CanvasTexture(canvas);
  }

  function createHallwayTimeclockDisplay() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    let lastKey = '';

    function draw(hour24, minute) {
      const key = `${hour24}:${minute}`;
      if (key === lastKey) return;
      lastKey = key;

      const isPm = hour24 >= 12;
      const h12 = (hour24 % 12) || 12;
      const hh = String(h12).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');

      // Bezel background
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, 256, 192);
      ctx.strokeStyle = '#52525b';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, 250, 186);

      // Top nameplate strip
      ctx.fillStyle = '#27272a';
      ctx.fillRect(14, 14, 228, 30);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '900 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SIMPLEX TIME RECORDER', 128, 34);

      // Dark red-tinted LCD window
      ctx.fillStyle = '#090203';
      ctx.fillRect(18, 52, 220, 82);
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 3;
      ctx.strokeRect(18, 52, 220, 82);

      // Ghost 88:88 segments
      ctx.font = 'bold 48px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
      ctx.fillText('88:88', 28, 108);

      // Bright glowing red LED digits
      ctx.fillStyle = '#ff2b2b';
      ctx.fillText(`${hh}:${mm}`, 28, 108);

      // AM / PM indicator
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillStyle = !isPm ? '#ff3b3b' : 'rgba(239, 68, 68, 0.18)';
      ctx.fillText('AM', 194, 80);
      ctx.fillStyle = isPm ? '#ff3b3b' : 'rgba(239, 68, 68, 0.18)';
      ctx.fillText('PM', 194, 108);

      // Bottom date / instruction line
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('INSERT TIMECARD BELOW', 128, 158);
      ctx.fillStyle = '#22c55e';
      ctx.fillText('● SYSTEM READY', 128, 176);

      tex.needsUpdate = true;
    }

    draw(6, 0);
    return { texture: tex, draw };
  }

  function createTruckFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5c3823';
    ctx.fillRect(0, 0, 256, 256);

    // Narrow longitudinal oak planks (darker weathered trailer decking)
    const plankW = 32;
    for (let x = 0; x < 256; x += plankW) {
      const shade = (x / plankW) % 3;
      ctx.fillStyle = shade === 0 ? '#684028' : (shade === 1 ? '#573420' : '#603a24');
      ctx.fillRect(x, 0, plankW, 256);
      ctx.fillStyle = '#331d10';
      ctx.fillRect(x + plankW - 2, 0, 2, 256);

      // Subtle board end joints & wood grain streaks
      ctx.fillStyle = 'rgba(20, 10, 4, 0.22)';
      const jointY = ((x * 5) % 192) + 32;
      ctx.fillRect(x, jointY, plankW - 2, 2);
      for (let g = 0; g < 10; g++) {
        ctx.fillRect(x + ((g * 7) % (plankW - 4)), (g * 29) % 256, 1, 24);
      }
    }
    // Light pallet jack scuffing down deck
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.fillRect(42, 0, 18, 256);
    ctx.fillRect(190, 0, 18, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 8);
    return tex;
  }

  function createTrailerWallTexture(repeatX = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3b434f';
    ctx.fillRect(0, 0, 256, 256);

    // Vertical corrugated steel/plywood liner panels + ribs
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = '#475160';
      ctx.fillRect(x + 2, 0, 22, 256);
      ctx.fillStyle = '#252b34';
      ctx.fillRect(x, 0, 3, 256);
      // Rivet heads
      ctx.fillStyle = '#64748b';
      for (let y = 16; y < 256; y += 48) {
        ctx.fillRect(x + 12, y, 2, 2);
      }
    }

    // Twin horizontal galvanized E-track cargo rails & dark steel kick-scuff plate
    [96, 168].forEach((ry) => {
      ctx.fillStyle = '#20262e';
      ctx.fillRect(0, ry, 256, 14);
      ctx.fillStyle = '#5a6575';
      ctx.fillRect(0, ry + 2, 256, 10);
      ctx.fillStyle = '#181c22';
      for (let sx = 6; sx < 256; sx += 16) {
        ctx.fillRect(sx, ry + 4, 6, 6);
      }
    });
    // Lower corrugated scuff guard
    ctx.fillStyle = '#272d36';
    ctx.fillRect(0, 214, 256, 42);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, 1);
    return tex;
  }

  function createTrailerRoofTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3f4754';
    ctx.fillRect(0, 0, 256, 256);

    // Structural aluminum roof bows & panel seams
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = '#282e37';
      ctx.fillRect(0, y, 256, 5);
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(0, y + 5, 256, 2);
    }
    // Dim center translucent skylight/rib strip
    ctx.fillStyle = 'rgba(203, 213, 225, 0.14)';
    ctx.fillRect(108, 0, 40, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 10);
    return tex;
  }

  // 8d. Realistic, Subtle Industrial Hazard Safety Floor Texture (OSHA Keep-Clear Transit Zone)
  function createYellowTransitTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base concrete warehouse floor
    ctx.fillStyle = '#444850';
    ctx.fillRect(0, 0, 512, 512);

    // Concrete aggregate speckles
    for (let i = 0; i < 4000; i++) {
      const lum = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.07)';
      ctx.fillStyle = lum;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // 45-degree diagonal hazard striping matching dock door wall bumper
    // Subtle, muted industrial safety yellow / ochre and dark charcoal black
    const stripeWidth = 48;
    const size = 512;

    for (let x = -size; x < size * 2; x += stripeWidth * 2) {
      // Muted, subtle industrial yellow (not bright/cartoonish!)
      ctx.fillStyle = '#9e8116';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeWidth, 0);
      ctx.lineTo(x + stripeWidth + size, size);
      ctx.lineTo(x + size, size);
      ctx.closePath();
      ctx.fill();

      // Dark charcoal tire-scuff black
      ctx.fillStyle = '#222326';
      ctx.beginPath();
      ctx.moveTo(x + stripeWidth, 0);
      ctx.lineTo(x + stripeWidth * 2, 0);
      ctx.lineTo(x + stripeWidth * 2 + size, size);
      ctx.lineTo(x + stripeWidth + size, size);
      ctx.closePath();
      ctx.fill();
    }

    // Concrete dust wash to blend subtly with the floor
    ctx.fillStyle = 'rgba(68, 72, 80, 0.16)';
    ctx.fillRect(0, 0, 512, 512);

    // Perimeter expansion joint seam
    ctx.strokeStyle = '#1a1c1e';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 506);

    // Inner worn border guide
    ctx.strokeStyle = 'rgba(158, 129, 22, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 492, 492);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createFreezerFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 248);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    return new THREE.CanvasTexture(canvas);
  }

  function createCoolerFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 248);
    return new THREE.CanvasTexture(canvas);
  }

  // Embossed cam-lock insulated cold-storage wall panels (Cooler & Freezer back walls / headers)
  function createInsulatedPanelTexture(repeatX = 1, repeatY = 1, withKickGuard = true) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Clean frost-white galvanized insulated metal base
    ctx.fillStyle = '#dce6f0';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle vertical stucco-embossed micro ribs
    for (let x = 0; x < 512; x += 16) {
      ctx.fillStyle = (x / 16) % 2 === 0 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(148, 163, 184, 0.10)';
      ctx.fillRect(x, 0, 8, 512);
    }

    // Vertical cam-lock insulated panel joints (2 panels per tile width)
    [0, 256].forEach((px) => {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px, 0, 4, 512);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(px + 4, 0, 3, 512);
      // Cam-lock fastener plug caps near top & mid height
      [90, 250].forEach((ry) => {
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(px + 22, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Top ceiling cove molding trim
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 512, 14);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 14, 512, 4);

    if (withKickGuard) {
      // Lower stainless diamond-plate / bumper guard (bottom ~25% of wall)
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(0, 384, 512, 128);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 382, 512, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      for (let gx = 8; gx < 512; gx += 24) {
        for (let gy = 396; gy < 504; gy += 22) {
          ctx.fillRect(gx, gy, 8, 3);
          ctx.fillRect(gx + 10, gy + 10, 3, 8);
        }
      }
      // Floor sanitary cove trim
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 498, 512, 14);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  }

  // Main warehouse dock corrugated steel roof decking & bar-joist ceiling texture
  function createDockCeilingTexture(repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

    // Corrugated steel deck flutes
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = '#273549';
      ctx.fillRect(x, 0, 16, 512);
      ctx.fillStyle = '#151d2b';
      ctx.fillRect(x + 16, 0, 4, 512);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.fillRect(x + 2, 0, 4, 512);
    }

    // Structural open-web steel purlin / cross-joist beams
    [0, 256].forEach((jy) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, jy, 512, 18);
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, jy + 4, 512, 5);
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, jy + 18, 512, 2);
    });

    // Perimeter panel flange line
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 508);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  }

  // Walk-in Cooler & Freezer insulated modular metal ceiling panels
  function createColdCeilingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle brushed panel ribs
    for (let x = 0; x < 512; x += 24) {
      ctx.fillStyle = (x / 24) % 2 === 0 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(100, 116, 139, 0.08)';
      ctx.fillRect(x, 0, 12, 512);
    }

    // Cam-lock insulated ceiling panel seams (2x2 grid per tile)
    [0, 256].forEach((pos) => {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(pos, 0, 5, 512);
      ctx.fillRect(0, pos, 512, 5);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(pos + 5, 0, 3, 512);
      ctx.fillRect(0, pos + 5, 512, 3);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Employee break hallway suspended acoustic drop-ceiling grid (2x2 tiles per grid cell)
  function createHallwayCeilingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#dbe2ea';
    ctx.fillRect(0, 0, 512, 512);

    // Fine acoustic ceiling tile stipple
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(71, 85, 105, 0.14)' : 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Crisp metal T-bar drop-ceiling grid lines (2x2 per 2.4m square)
    ctx.fillStyle = '#64748b';
    [0, 252, 504].forEach((p) => {
      ctx.fillRect(p, 0, 8, 512);
      ctx.fillRect(0, p, 512, 8);
    });
    ctx.fillStyle = '#94a3b8';
    [8, 260].forEach((p) => {
      ctx.fillRect(p, 0, 2, 512);
      ctx.fillRect(0, p, 512, 2);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createElectricJackDecalTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Safety Yellow base
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 512, 256);

    // 45-degree Black & Yellow Hazard Stripes on lower skirt
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 160, 512, 96);
    ctx.clip();
    ctx.fillStyle = '#0f172a';
    for (let x = -200; x < 700; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 256);
      ctx.lineTo(x + 28, 256);
      ctx.lineTo(x + 68, 160);
      ctx.lineTo(x + 40, 160);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Black border band
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 154, 512, 6);

    // Industrial Equipment Logo Badge
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(40, 36, 180, 80, 8);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.font = '900 32px "Arial Black", sans-serif';
    ctx.fillText('CROWN', 55, 82);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('WP-SERIES ELECTRIC', 55, 104);

    // Capacity & Safety Placard
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(260, 36, 210, 80);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('WARNING: 4500 LB MAX', 272, 62);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.fillText('TRAINED OPERATORS ONLY', 272, 84);
    ctx.fillText('KEEP FEET CLEAR OF FORKS', 272, 102);

    return new THREE.CanvasTexture(canvas);
  }

  function drawBatteryChargerScreen(ctx, state) {
    const cfg = state || {};
    const docked = cfg.docked !== false;
    const rawPct = Number.isFinite(cfg.batteryPct) ? cfg.batteryPct : 100;
    const pct = rawPct >= 99.99 ? 100 : Math.max(0, Math.min(99, Math.floor(rawPct)));
    const isCharging = docked && pct < 100;
    const isComplete = docked && pct >= 100;
    const blinkOn = cfg.blinkOn !== false;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;

    // 1990s powder-coated dark steel faceplate
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 384);

    // Recessed anodized control bezel
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(12, 12, 232, 206);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 232, 206);

    // 4 corner hex mounting screws
    ctx.fillStyle = '#64748b';
    [[20, 20], [236, 20], [20, 210], [236, 210]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Top silkscreen nameplate strip
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FERRO-CHARGE 36V • MOD CR-94', 128, 25);
    ctx.textAlign = 'left';

    // --- LCD #1: Monochrome 7-segment olive LCD (Voltage & Current) ---
    ctx.fillStyle = '#020617';
    ctx.fillRect(22, 32, 212, 34);
    ctx.fillStyle = '#8fa37b';
    ctx.fillRect(25, 35, 206, 28);
    ctx.strokeStyle = '#5f7050';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(25, 35, 206, 28);

    // Ghost segments for 90s TN LCD realism
    ctx.fillStyle = '#7f936d';
    ctx.font = 'bold 17px "Courier New", monospace';
    ctx.fillText('88.8V  88.8A', 33, 55);

    let meterStr = '00.0V  00.0A';
    if (isCharging) {
      const bulkStage = pct < 85;
      const volts = bulkStage
        ? (34.2 + (pct / 85) * 2.9)
        : (37.1 + ((pct - 85) / 15) * 0.7);
      const amps = bulkStage
        ? (18.4 - (pct / 85) * 3.8)
        : (14.6 - ((pct - 85) / 15) * 11.4);
      meterStr = `${volts.toFixed(1)}V  ${amps.toFixed(1).padStart(4, ' ')}A`;
    } else if (isComplete) {
      meterStr = '36.4V   0.2A';
    }
    ctx.fillStyle = '#142214';
    ctx.fillText(meterStr, 33, 55);

    // --- LCD #2: Monochrome 2-line HD44780 character LCD ---
    ctx.fillStyle = '#020617';
    ctx.fillRect(22, 72, 212, 46);
    ctx.fillStyle = '#8fa37b';
    ctx.fillRect(25, 75, 206, 40);
    ctx.strokeStyle = '#5f7050';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(25, 75, 206, 40);

    let lcdLine1 = 'NO BATTERY';
    let lcdLine2 = 'CONNECT PLUG';
    if (isCharging) {
      lcdLine1 = `BATT:  ${String(pct).padStart(3, ' ')}%`;
      lcdLine2 = pct < 85 ? 'CYCLE: BULK CHG' : 'CYCLE: ABSORB';
    } else if (isComplete) {
      lcdLine1 = 'BATT:  100%';
      lcdLine2 = 'FLOAT READY';
    }

    ctx.fillStyle = '#142214';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText(lcdLine1, 33, 92);
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText(lcdLine2, 33, 108);

    // Helper to draw recessed colored hardware LED
    function drawPanelLed(cx, cy, r, onColor, offColor, isOn, label) {
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isOn ? onColor : offColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      if (isOn) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (label) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, cy + r + 11);
        ctx.textAlign = 'left';
      }
    }

    // --- Row 1: Mains & Charger Cycle Status LEDs ---
    drawPanelLed(50, 134, 6.5, '#ef4444', '#451212', true, 'AC PWR');
    drawPanelLed(128, 134, 6.5, '#f59e0b', '#3f2a08', isCharging && blinkOn, 'CHARGING');
    drawPanelLed(206, 134, 6.5, '#22c55e', '#0d2e18', isComplete, 'COMPLETE');

    // Divider rule
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(22, 160);
    ctx.lineTo(234, 160);
    ctx.stroke();

    // --- Row 2: 5-LED Plug-In Battery Level Bank (dark until jack plugged in) ---
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BATTERY CHARGE LEVEL (PLUG-IN)', 128, 171);
    ctx.textAlign = 'left';

    const bankSpecs = [
      { threshold: 10, on: '#ef4444', off: '#3b1111', label: '10%' },
      { threshold: 20, on: '#facc15', off: '#3b300a', label: '20%' },
      { threshold: 40, on: '#22c55e', off: '#0d2e18', label: '40%' },
      { threshold: 80, on: '#22c55e', off: '#0d2e18', label: '80%' },
      { threshold: 95, on: '#22c55e', off: '#0d2e18', label: '95%' }
    ];
    bankSpecs.forEach((spec, idx) => {
      const lx = 44 + idx * 42;
      const isOn = docked && rawPct > spec.threshold;
      drawPanelLed(lx, 187, 6.5, spec.on, spec.off, isOn, spec.label);
    });

    // Yellow high voltage warning plate
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.moveTo(128, 232);
    ctx.lineTo(190, 330);
    ctx.lineTo(66, 330);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 128, 318);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('BATTERY CHARGER', 128, 355);
    ctx.fillText('KEEP AREA CLEAR', 128, 372);
    ctx.restore();
  }

  function createBatteryChargerTexture(initialState) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 384;
    const ctx = canvas.getContext('2d');
    drawBatteryChargerScreen(ctx, initialState);
    return new THREE.CanvasTexture(canvas);
  }

  function createBatteryChargerDisplay() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 384;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    let lastKey = '';

    function update(state) {
      const cfg = state || {};
      const docked = cfg.docked !== false;
      const rawPct = Number.isFinite(cfg.batteryPct) ? cfg.batteryPct : 100;
      const pct = rawPct >= 99.99 ? 100 : Math.max(0, Math.min(99, Math.floor(rawPct)));
      const blinkOn = cfg.blinkOn !== false;
      const ledMask = docked
        ? ((rawPct > 10 ? 1 : 0) | (rawPct > 20 ? 2 : 0) | (rawPct > 40 ? 4 : 0) | (rawPct > 80 ? 8 : 0) | (rawPct > 95 ? 16 : 0))
        : 0;
      // When unplugged, batteryPct is never read remotely, so exclude it from key
      const key = docked ? `1_${pct}_${ledMask}_${blinkOn ? 1 : 0}` : '0_unplugged';
      if (key === lastKey) return;
      lastKey = key;
      drawBatteryChargerScreen(ctx, { docked, batteryPct: docked ? rawPct : 0, blinkOn });
      texture.needsUpdate = true;
    }

    update({ docked: true, batteryPct: 100, blinkOn: true });
    return { texture, update };
  }

  function createWoodGrainTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b4783c';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#9a5e28';
    for (let y = 0; y < 512; y += 4) {
      ctx.globalAlpha = 0.15 + 0.1 * Math.sin(y * 0.05);
      ctx.fillRect(0, y, 512, 2);
    }

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#6b3d16';
    [[120, 180], [380, 320], [240, 440]].forEach(([kx, ky]) => {
      ctx.beginPath();
      ctx.ellipse(kx, ky, 35, 12, 0.1, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#4a2608';
    ctx.lineWidth = 3;
    for (let x = 0; x <= 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();

      ctx.fillStyle = '#222222';
      [30, 480].forEach(ny => {
        ctx.beginPath();
        ctx.arc(x - 12, ny, 3.5, 0, Math.PI * 2);
        ctx.arc(x + 12, ny, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1.0;
    return new THREE.CanvasTexture(canvas);
  }

  // 90s Dark Walnut-Oak Formica Laminate Desktop Texture (fine lengthwise oak veneer + satin melamine sheen)
  function createOfficeDeskLaminateTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#6e492c';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle multi-band plank tone variation across width (matches laminated walnut-oak strip top)
    const stripBands = ['#744d2f', '#684327', '#785032', '#6b462a'];
    for (let sx = 0; sx < 512; sx += 128) {
      ctx.fillStyle = stripBands[(sx / 128) % stripBands.length];
      ctx.fillRect(sx, 0, 128, 512);
    }

    // Fine directional lengthwise oak fibers & cathedral grain waves
    for (let x = 2; x < 512; x += 4) {
      ctx.strokeStyle = (x % 8 === 0) ? 'rgba(56, 33, 16, 0.28)' : 'rgba(148, 108, 72, 0.16)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let y = 0; y <= 512; y += 16) {
        const wave = Math.sin(y * 0.022 + x * 0.11) * 2.4 + Math.cos(y * 0.05 + x * 0.04) * 1.1;
        if (y === 0) ctx.moveTo(x + wave, y);
        else ctx.lineTo(x + wave, y);
      }
      ctx.stroke();
    }

    // Cathedral grain arches along panel strips
    [64, 192, 320, 448].forEach((cx, bi) => {
      const cy = 140 + bi * 85;
      for (let ring = 1; ring <= 4; ring++) {
        ctx.strokeStyle = 'rgba(48, 28, 12, 0.24)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, ring * 11, ring * 44, 0.04, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Ultra-fine oak pores & faint laminated seam lines between oak strips
    ctx.fillStyle = 'rgba(38, 21, 9, 0.30)';
    for (let i = 0; i < 180; i++) {
      const px = (i * 73 + 17) % 508;
      const py = (i * 139 + 29) % 496;
      ctx.fillRect(px, py, 1.5, 8 + (i % 9));
    }
    ctx.strokeStyle = 'rgba(42, 24, 11, 0.28)';
    ctx.lineWidth = 1.5;
    [128, 256, 384].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, 512);
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 90s Steelcase / HON Putty-Grey Baked Enamel Steel Texture (chassis/legs vs beveled file drawers)
  function createOfficeDeskEnamelTexture(variant = 'chassis') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const isDrawer = variant === 'drawer';

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, isDrawer ? '#85887f' : '#96988f');
    grad.addColorStop(0.5, isDrawer ? '#777a71' : '#898b82');
    grad.addColorStop(1, isDrawer ? '#696c63' : '#7b7d74');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle hammered baked-enamel powder-coat stipple grain
    for (let i = 0; i < 420; i++) {
      const sx = (i * 53 + 11) % 252;
      const sy = (i * 97 + 19) % 252;
      ctx.fillStyle = (i % 2 === 0) ? 'rgba(255, 255, 248, 0.07)' : 'rgba(30, 34, 28, 0.08)';
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Faint brushed horizontal enamel sheen bands
    ctx.fillStyle = 'rgba(255, 255, 250, 0.04)';
    for (let y = 0; y < 256; y += 6) {
      if ((y / 6) % 3 === 0) ctx.fillRect(0, y, 256, 2);
    }

    if (isDrawer) {
      // Crisply stamped 90s office file-drawer bezel border + top finger-channel shadow
      ctx.strokeStyle = 'rgba(24, 28, 26, 0.45)';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 248, 248);

      ctx.strokeStyle = 'rgba(241, 243, 236, 0.26)';
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, 236, 236);

      ctx.fillStyle = 'rgba(20, 24, 22, 0.22)';
      ctx.fillRect(10, 10, 236, 8);
    }

    const tex = new THREE.CanvasTexture(canvas);
    if (!isDrawer) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    }
    return tex;
  }

  const cardboardTextureCache = new Map();

  function createCardboardBoxTexture(sku, name, tempType, notScannable, unitsPerCase, opts) {
    const o = opts || {};
    const isLabeled = Boolean(o.labeled);
    const isPluUnlabeled = Boolean(notScannable && !isLabeled);
    const cacheKey = `${sku || ''}|${name || ''}|${tempType || ''}|${isPluUnlabeled ? 1 : 0}|${isLabeled ? 1 : 0}|${Number(unitsPerCase) || 0}`;
    if (cardboardTextureCache.has(cacheKey)) {
      return cardboardTextureCache.get(cacheKey);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c59f6b';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#b38c56';
    for (let y = 0; y < 512; y += 3) {
      ctx.globalAlpha = 0.08 + 0.06 * Math.sin(y * 0.1);
      ctx.fillRect(0, y, 512, 1.5);
    }
    ctx.globalAlpha = 1.0;

    // Clear / Tan packing tape
    ctx.fillStyle = 'rgba(215, 185, 140, 0.6)';
    ctx.fillRect(0, 230, 512, 52);
    ctx.strokeStyle = 'rgba(160, 125, 80, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 230, 512, 52);

    // Top thermal shipping label (bright green for unlabeled PLU, white for standard, yellow-tinted if labeled)
    ctx.fillStyle = isLabeled ? '#fef9c3' : (isPluUnlabeled ? '#86efac' : '#ffffff');
    ctx.fillRect(40, 60, 432, 145);
    ctx.strokeStyle = isPluUnlabeled ? '#15803d' : (isLabeled ? '#ca8a04' : '#94a3b8');
    ctx.lineWidth = (isPluUnlabeled || isLabeled) ? 4 : 2;
    ctx.strokeRect(40, 60, 432, 145);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    const shortName = (name || 'DSD CARGO').toUpperCase().slice(0, 20);
    ctx.fillText(shortName, 56, 94);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = isPluUnlabeled ? '#052e16' : '#334155';
    const codeLabel = (isPluUnlabeled ? 'PLU ONLY: ' : 'UPC/SKU: ') + (sku || 'CASE-108');
    ctx.fillText(codeLabel, 56, 124);

    if (isPluUnlabeled) {
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(56, 136, 396, 46);
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 2;
      ctx.strokeRect(56, 136, 396, 46);
      ctx.fillStyle = '#052e16';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('NO BARCODE · KEY PLU ' + (sku || ''), 70, 167);
    } else {
      ctx.fillStyle = '#0f172a';
      let bx = 56;
      for (let i = 0; i < 48; i++) {
        const w = (i % 3 === 0) ? 5 : 2.5;
        ctx.fillRect(bx, 136, w, 44);
        bx += w + (i % 2 === 0 ? 3 : 2);
        if (bx > 420) break;
      }
    }

    if (tempType === 'F' || tempType === 'frozen') {
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('❄ FROZEN', 345, 94);
    } else if (tempType === 'C' || tempType === 'refrigerated') {
      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('🌡 COOLER', 345, 94);
    } else {
      ctx.fillStyle = '#d97706';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('📦 AMBIENT', 345, 94);
    }

    // Case inventory/check-in tag on the bottom-left corner:
    // Yellow = printed scannable inventory label (UPC);
    // Bright Green = unlabeled PLU case (PLU);
    // White = check-in / unlabeled standard case / Dept 60 supply (UPC).
    if (unitsPerCase && Number(unitsPerCase) > 0) {
      const tagX = 14;
      const tagY = 286;
      const tagW = 368;
      const tagH = 212;

      const bgHex = isLabeled ? '#facc15' : (isPluUnlabeled ? '#4ade80' : '#ffffff');
      const borderHex = isPluUnlabeled ? '#14532d' : '#000000';
      const textHex = isPluUnlabeled ? '#052e16' : '#000000';

      ctx.fillStyle = bgHex;
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = borderHex;
      ctx.lineWidth = 5;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      ctx.fillStyle = textHex;
      ctx.textAlign = 'left';
      ctx.font = '900 30px Arial, Helvetica, sans-serif';
      const tagName = (name || 'BACKSTOCK').toUpperCase().slice(0, 14);
      ctx.fillText(tagName, tagX + 16, tagY + 38, tagW - 32);

      ctx.fillRect(tagX + 16, tagY + 52, tagW - 32, 4);

      ctx.font = '900 72px Arial, Helvetica, sans-serif';
      ctx.fillText('QTY: ' + String(Number(unitsPerCase)), tagX + 16, tagY + 128, tagW - 32);

      ctx.font = '900 50px Arial, Helvetica, sans-serif';
      const tagCode = (isPluUnlabeled ? 'PLU ' : 'UPC ') + String(sku || '');
      ctx.fillText(tagCode, tagX + 16, tagY + 188, tagW - 32);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.minFilter = THREE.LinearMipmapNearestFilter;
    tex.needsUpdate = true;
    cardboardTextureCache.set(cacheKey, tex);
    return tex;
  }

  function createKgsCapTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e3f1a';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#163113';
    for (let x = 0; x < 256; x += 4) {
      ctx.fillRect(x, 0, 2, 256);
    }

    // Keystone "KGS" patch
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(78, 80);
    ctx.lineTo(178, 80);
    ctx.lineTo(198, 140);
    ctx.lineTo(128, 185);
    ctx.lineTo(58, 140);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f2910';
    ctx.beginPath();
    ctx.moveTo(84, 86);
    ctx.lineTo(172, 86);
    ctx.lineTo(190, 138);
    ctx.lineTo(128, 178);
    ctx.lineTo(66, 138);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.font = '900 32px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KGS', 128, 142);

    return new THREE.CanvasTexture(canvas);
  }

  function createDriverBadgeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 192);

    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, 128, 38);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KGS LOGISTICS', 64, 24);

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(64, 75, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 125, 34, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    for (let x = 20; x < 108; x += 4) {
      ctx.fillRect(x, 150, 2.5, 26);
    }

    return new THREE.CanvasTexture(canvas);
  }

  function createDriverFaceTexture(variant) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8c291';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#4a2810';
    ctx.fillRect(60, 95, 38, 8);
    ctx.fillRect(158, 95, 38, 8);

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(78, 115, 8, 0, Math.PI * 2);
    ctx.arc(178, 115, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e5a56d';
    ctx.beginPath();
    ctx.moveTo(128, 115);
    ctx.lineTo(138, 148);
    ctx.lineTo(118, 148);
    ctx.closePath();
    ctx.fill();

    if (variant === 'kgs') {
      ctx.fillStyle = '#4a2810';
      ctx.beginPath();
      ctx.moveTo(40, 130);
      ctx.lineTo(216, 130);
      ctx.lineTo(200, 240);
      ctx.lineTo(128, 256);
      ctx.lineTo(56, 240);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2d1808';
      ctx.fillRect(108, 185, 40, 6);
    } else if (variant === 'grey') {
      ctx.fillStyle = '#52525b';
      ctx.beginPath();
      ctx.arc(128, 205, 38, 0, Math.PI);
      ctx.fill();
      ctx.fillRect(104, 172, 48, 10);
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(112, 182, 32, 6);
    }

    return new THREE.CanvasTexture(canvas);
  }

  function createCartTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#334155';
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 2);
        ctx.lineTo(x + 14, y + 8);
        ctx.lineTo(x + 8, y + 14);
        ctx.lineTo(x + 2, y + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  function createDoorEnclosureTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Powder-coated industrial safety-yellow cast housing with subtle edge bevel shading
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#facc15');
    grad.addColorStop(0.45, '#eab308');
    grad.addColorStop(1, '#ca8a04');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Natural random powder-coat stipple micro-grain (32-bit Murmur finalizer to eliminate lattice striping)
    for (let i = 0; i < 2400; i++) {
      let h = (i + 1) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      h = (h ^ (h >>> 16)) >>> 0;
      const x = (h >>> 8) & 255;
      const y = (h >>> 16) & 255;
      ctx.fillStyle = (h & 1) ? 'rgba(255,255,255,0.065)' : 'rgba(66,32,6,0.085)';
      ctx.fillRect(x, y, 2, 2);
    }

    // Soft cast bevel vignette along perimeter
    ctx.strokeStyle = 'rgba(254, 249, 195, 0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.strokeStyle = 'rgba(66, 32, 6, 0.38)';
    ctx.lineWidth = 8;
    ctx.strokeRect(1, 1, 254, 254);

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function createDoorControlFaceplateTexture(doorLabel) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');

    // Brushed dark slate steel control plate
    const bg = ctx.createLinearGradient(0, 0, 0, 440);
    bg.addColorStop(0, '#273449');
    bg.addColorStop(0.5, '#1e293b');
    bg.addColorStop(1, '#111827');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 440);

    // Horizontal brushed aluminum grain
    for (let y = 0; y < 440; y += 3) {
      ctx.fillStyle = (y % 6 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, y, 256, 1);
    }

    // Outer etched trim border & 4 corner hex screws
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 240, 424);
    [[20, 20], [236, 20], [20, 420], [236, 420]].forEach(([sx, sy]) => {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy - 2);
      ctx.lineTo(sx + 3, sy + 2);
      ctx.stroke();
    });

    // Top riveted aluminum identification nameplate
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(28, 24, 200, 44);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 24, 200, 44);
    ctx.fillStyle = '#475569';
    ctx.beginPath(); ctx.arc(38, 46, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(218, 46, 3.2, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 21px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(doorLabel || 'DOOR CTRL').toUpperCase(), 128, 47);

    // Silk-screened OPEN collar, vector up-arrow, & label (aligned at py = 148)
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.moveTo(86, 85);
    ctx.lineTo(79, 98);
    ctx.lineTo(93, 98);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('OPEN', 136, 92);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 148, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.arc(128, 148, 43, 0, Math.PI * 2);
    ctx.fill();

    // Silk-screened CLOSE collar, vector down-arrow, & label (aligned at py = 256)
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.moveTo(82, 210);
    ctx.lineTo(75, 197);
    ctx.lineTo(89, 197);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('CLOSE', 137, 204);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 256, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.arc(128, 256, 43, 0, Math.PI * 2);
    ctx.fill();

    // Divider & Status / Lockout sub-labels (above py = 342)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, 312);
    ctx.lineTo(232, 312);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('STATUS', 67, 326);
    ctx.fillText('LOCKOUT', 189, 326);

    // Caution 240V hazard strip at bottom
    ctx.save();
    ctx.beginPath();
    ctx.rect(20, 386, 216, 26);
    ctx.clip();
    ctx.fillStyle = '#eab308';
    ctx.fillRect(20, 386, 216, 26);
    ctx.fillStyle = '#0f172a';
    for (let x = -20; x < 260; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 412);
      ctx.lineTo(x + 11, 386);
      ctx.lineTo(x + 21, 386);
      ctx.lineTo(x + 10, 412);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(62, 390, 132, 18);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillText('240V - NEMA 4X', 128, 400);

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function createBeaconFaceplateTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Anodized dark slate metallic faceplate backing
    const bg = ctx.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#273449');
    bg.addColorStop(0.5, '#1e293b');
    bg.addColorStop(1, '#111827');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 192, 512);

    // Subtle horizontal brushed steel striations
    for (let y = 0; y < 512; y += 3) {
      ctx.fillStyle = (y % 6 === 0) ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.065)';
      ctx.fillRect(0, y, 192, 1);
    }

    // Outer etched trim border + 4 corner slotted hex screws
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(7, 7, 178, 498);
    [[18, 18], [174, 18], [18, 494], [174, 494]].forEach(([sx, sy]) => {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - 3.5, sy - 3.5);
      ctx.lineTo(sx + 3.5, sy + 3.5);
      ctx.stroke();
    });

    // Riveted aluminum header plate ("DOCK SIGNAL")
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(28, 14, 136, 26);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 14, 136, 26);
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(36, 27, 2.5, 0, Math.PI * 2);
    ctx.arc(156, 27, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DOCK SIGNAL', 96, 28);

    // Three optical lens recessed sockets & silk-screened state legends
    const bays = [
      { py: 117, ring: '#991b1b', label: 'OPEN / ALARM', textCol: '#fca5a5' },
      { py: 256, ring: '#b45309', label: 'ACTIVE / WAIT', textCol: '#fcd34d' },
      { py: 395, ring: '#166534', label: 'SECURE / SHUT', textCol: '#86efac' }
    ];
    bays.forEach((b) => {
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.arc(96, b.py, 49, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = b.ring;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(96, b.py, 52, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = b.textCol;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, 96, b.py + 62);
    });

    // Bottom caution chevron band
    ctx.save();
    ctx.beginPath();
    ctx.rect(22, 476, 148, 18);
    ctx.clip();
    ctx.fillStyle = '#eab308';
    ctx.fillRect(22, 476, 148, 18);
    ctx.fillStyle = '#111827';
    for (let sx = 0; sx < 192; sx += 18) {
      ctx.beginPath();
      ctx.moveTo(sx, 494);
      ctx.lineTo(sx + 9, 476);
      ctx.lineTo(sx + 18, 476);
      ctx.lineTo(sx + 9, 494);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fillRect(46, 478, 100, 14);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('120V - NEMA 4X', 96, 485);

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function createBeaconLensTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Neutral grayscale Fresnel lens pattern (tinted dynamically via material color/emissive)
    const rad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    rad.addColorStop(0, '#ffffff');
    rad.addColorStop(0.45, '#e2e8f0');
    rad.addColorStop(0.82, '#94a3b8');
    rad.addColorStop(1, '#1e293b');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, 128, 128);

    // Subtle radial glass flutes
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(ang) * 10, 64 + Math.sin(ang) * 10);
      ctx.lineTo(64 + Math.cos(ang) * 58, 64 + Math.sin(ang) * 58);
      ctx.stroke();
    }

    // Concentric Fresnel stepped refraction rings
    for (let r = 14; r <= 56; r += 8) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(64, 64, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(64, 64, r - 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function createBeaconGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.32, 'rgba(255,255,255,0.52)');
    g.addColorStop(0.68, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ==========================================
  // MAIN INITIALIZATION

  global.WarehouseTextures = {
    createConcreteFloorTexture: createConcreteFloorTexture,
    createConcreteWallTexture: createConcreteWallTexture,
    createHazardStripeTexture: createHazardStripeTexture,
    createRollerDoorTexture: createRollerDoorTexture,
    createNumberTexture: createNumberTexture,
    createClockTexture: createClockTexture,
    createWarningSignTexture: createWarningSignTexture,
    createColdHeaderPlacardTexture: createColdHeaderPlacardTexture,
    createTempLedTexture: createTempLedTexture,
    createCrtScreenTexture: createCrtScreenTexture,
    createCrtScreenDisplay: createCrtScreenDisplay,
    createInvoiceSheetTexture: createInvoiceSheetTexture,
    createKeyboardShellTexture: createKeyboardShellTexture,
    createKeyboardTexture: createKeyboardTexture,
    createBrickTexture: createBrickTexture,
    createHallwaySignTexture: createHallwaySignTexture,
    createHallwayPosterTexture: createHallwayPosterTexture,
    createHallwayDoorSignTexture: createHallwayDoorSignTexture,
    createNoPalletZoneTexture: createNoPalletZoneTexture,
    createVendingFrontTexture: createVendingFrontTexture,
    createTrailerDoorTexture: createTrailerDoorTexture,
    createHallwayTimeclockDisplay: createHallwayTimeclockDisplay,
    createTruckFloorTexture: createTruckFloorTexture,
    createTrailerWallTexture: createTrailerWallTexture,
    createTrailerRoofTexture: createTrailerRoofTexture,
    createYellowTransitTexture: createYellowTransitTexture,
    createFreezerFloorTexture: createFreezerFloorTexture,
    createCoolerFloorTexture: createCoolerFloorTexture,
    createInsulatedPanelTexture: createInsulatedPanelTexture,
    createDockCeilingTexture: createDockCeilingTexture,
    createColdCeilingTexture: createColdCeilingTexture,
    createHallwayCeilingTexture: createHallwayCeilingTexture,
    createElectricJackDecalTexture: createElectricJackDecalTexture,
    createBatteryChargerTexture: createBatteryChargerTexture,
    createBatteryChargerDisplay: createBatteryChargerDisplay,
    createWoodGrainTexture: createWoodGrainTexture,
    createOfficeDeskLaminateTexture: createOfficeDeskLaminateTexture,
    createOfficeDeskEnamelTexture: createOfficeDeskEnamelTexture,
    createCardboardBoxTexture: createCardboardBoxTexture,
    createKgsCapTexture: createKgsCapTexture,
    createDriverBadgeTexture: createDriverBadgeTexture,
    createDriverFaceTexture: createDriverFaceTexture,
    createCartTexture: createCartTexture,
    createDoorEnclosureTexture: createDoorEnclosureTexture,
    createDoorControlFaceplateTexture: createDoorControlFaceplateTexture,
    createBeaconFaceplateTexture: createBeaconFaceplateTexture,
    createBeaconLensTexture: createBeaconLensTexture,
    createBeaconGlowTexture: createBeaconGlowTexture
  };
})(window);
