(function (global) {
  'use strict';

  /**
   * InfotipRenderer - Renders Tabulated Infotip cards safely and diffs DOM updates
   * so the 60fps raycast hover loop performs zero redundant DOM writes.
   */
  const FALLBACK_ICONS = Object.freeze({
    barcode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5v14M7 5v14M10 5v10M14 5v14M17 5v10M21 5v14"/><path d="M9 18h2M16 18h2" stroke-width="2.4"/></svg>',
    plu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h2M12 8h2M16 8h0M8 12h2M12 12h2M16 12h0M8 16h2M12 16h4" stroke-linecap="round"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v18M5 4h11l-2 4 2 4H5"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 8L12 13l8.7-5M12 13v9"/></svg>',
    shelf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v16M20 4v16M4 9h16M4 17h16"/><rect x="7" y="5" width="5" height="4" rx="0.5"/><rect x="13" y="13" width="5" height="4" rx="0.5"/></svg>',
    claim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01" stroke-linecap="round"/></svg>',
    tote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h18l-1.5 11h-15L3 8zM2 8h20"/><path d="M8 12h8"/></svg>',
    bin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16l-1.2 13H5.2L4 7z"/><path d="M8 7V4h8v3"/></svg>',
    door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 8h16M4 12h16M4 16h16"/><circle cx="19" cy="14" r="1.2" fill="currentColor"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 9l2.5 2L7 13M12 13h4M8 20h8M12 16v4"/></svg>',
    tray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h4l2 3h4l2-3h4v6H4v-6z"/><path d="M6 10h12M8 6h8"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
    cabinet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 12h14M10 7.5h4M10 16.5h4"/></svg>',
    printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><rect x="6" y="14" width="12" height="7" fill="rgba(15,23,42,0.9)"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg>',
    jack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 16h12l2-7h3M6 16v3M14 16v3"/><circle cx="6" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/><rect x="13" y="5" width="4" height="4" rx="0.5"/></svg>',
    pallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="7" height="6"/><rect x="13" y="5" width="7" height="6"/><path d="M2 15h20M4 18h16M5 15v4M12 15v4M19 15v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    driver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>'
  });

  const ICONS = (global.SvgIcons && global.SvgIcons.ICONS) ? global.SvgIcons.ICONS : FALLBACK_ICONS;

  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatInlineHtml(s) {
    if (global.SvgIcons && typeof global.SvgIcons.formatHtml === 'function') {
      return global.SvgIcons.formatHtml(s);
    }
    return escapeHtml(s);
  }

  function buildTabulatedInfotipHtml(spec, isTouch) {
    const s = spec || {};
    const rows = [];
    let pluDigits = '';
    let codeLabel = '';
    let codeVal = '';
    const inlineDetails = [];
    const condAlerts = [];
    const warnAlerts = [];
    const infoExtras = [];

    (s.chips || []).forEach((c) => {
      if (!c) return;
      const clean = String(c.text || '').trim().replace(/^(?:⚠️|\[\[ico:claim\]\])\s*/u, '');
      if (c.cls === 'plu' || /^PLU\s+/i.test(clean)) {
        pluDigits = clean.replace(/^PLU\s+/i, '');
      } else if (/^UPC\s+/i.test(clean)) {
        codeLabel = 'UPC';
        codeVal = clean.replace(/^UPC\s+/i, '');
      } else if (/^SKU\s+/i.test(clean)) {
        codeLabel = 'SKU';
        codeVal = clean.replace(/^SKU\s+/i, '');
      } else if (/CONDITION:/i.test(clean)) {
        const condTxt = clean.replace(/^CONDITION:\s*/i, '');
        if (c.cls === 'cond-warn') warnAlerts.push(condTxt);
        else condAlerts.push(condTxt);
      } else if (c.cls === 'cond-crit') {
        condAlerts.push(clean);
      } else if (c.cls === 'cond-warn') {
        warnAlerts.push(clean);
      } else if (/^BIN\s+/i.test(clean) || /^TARGET:\s*/i.test(clean) || /(\d+u\s*\/\s*cs|CREDIT|STACK|ITEMS INSIDE|COLLECTED|LINK ROW|LINKED)/i.test(clean)) {
        inlineDetails.push(clean);
      } else if (/^NO BARCODE$/i.test(clean)) {
        inlineDetails.push('Manual Key-In');
      } else if (clean) {
        infoExtras.push({ text: clean, cls: c.cls || '' });
      }
    });

    const m = s.meta || null;
    const unitsHtml = (m && Number(m.unitsPerCase) > 0)
      ? `<span class="ti-units-hero">${escapeHtml(String(m.unitsPerCase))}u / cs</span>` +
        ((Number(m.stackCases) > 1 && Number(m.stackUnits) > 0)
          ? `<span class="ti-stack-badge">×${escapeHtml(String(m.stackCases))} · ${escapeHtml(String(m.stackUnits))}u TOTAL</span>`
          : '')
      : '';

    if (pluDigits) {
      const tailParts = [];
      if (unitsHtml) tailParts.push(unitsHtml);
      if (inlineDetails.length) tailParts.push(`<span>${escapeHtml(inlineDetails.join(' · '))}</span>`);
      rows.push(
        `<tr class="ti-row-plu">` +
          `<th scope="row" class="ti-k">PLU</th>` +
          `<td class="ti-v"><div class="ti-inline"><span class="ti-plu-digits">${escapeHtml(pluDigits)}</span><span class="ti-plu-badge">KEY IN</span>${tailParts.join('')}</div></td>` +
        `</tr>`
      );
    } else if (codeVal) {
      const tailParts = [];
      if (unitsHtml) tailParts.push(unitsHtml);
      if (inlineDetails.length) tailParts.push(`<span class="ti-pack">${escapeHtml(inlineDetails.join(' · '))}</span>`);
      rows.push(
        `<tr>` +
          `<th scope="row" class="ti-k">${escapeHtml(codeLabel)}</th>` +
          `<td class="ti-v"><div class="ti-inline"><span class="ti-code">${escapeHtml(codeVal)}</span>${tailParts.join('')}</div></td>` +
        `</tr>`
      );
    } else if (inlineDetails.length) {
      const formattedSpec = inlineDetails.map((txt) => {
        if (/FREEZER/i.test(txt)) return `<span class="ti-zone-f">${escapeHtml(txt)}</span>`;
        if (/COOLER/i.test(txt)) return `<span class="ti-zone-c">${escapeHtml(txt)}</span>`;
        if (/DRY|AMBIENT/i.test(txt)) return `<span class="ti-zone-d">${escapeHtml(txt)}</span>`;
        return escapeHtml(txt);
      }).join(' <span class="ti-sep">·</span> ');
      rows.push(
        `<tr>` +
          `<th scope="row" class="ti-k">SPEC</th>` +
          `<td class="ti-v">${formattedSpec}</td>` +
        `</tr>`
      );
    }

    if (m && (m.dept || m.vendorName || Number.isFinite(Number(m.caseCost)))) {
      const caseBits = [];
      if (Number.isFinite(Number(m.caseCost))) {
        const csStr = '$' + Number(m.caseCost).toFixed(2) + '/cs';
        const uStr = (Number.isFinite(Number(m.unitCost)) && Number(m.unitsPerCase) > 1)
          ? ` <span class="ti-unit-sub">($${Number(m.unitCost).toFixed(2)}/u)</span>`
          : '';
        caseBits.push(`<span class="ti-cost-pill">${escapeHtml(csStr)}</span>${uStr}`);
      }
      if (m.dept) caseBits.push(`<span class="ti-dept-tag">${escapeHtml(m.dept)}</span>`);
      if (m.vendorName || m.vendorNo) {
        const vTxt = m.vendorNo ? `#${m.vendorNo} ${m.vendorName || ''}`.trim() : m.vendorName;
        caseBits.push(`<span class="ti-vendor-txt">${escapeHtml(vTxt)}</span>`);
      }
      rows.push(
        `<tr>` +
          `<th scope="row" class="ti-k">CASE</th>` +
          `<td class="ti-v"><div class="ti-info-flow">${caseBits.join('')}</div></td>` +
        `</tr>`
      );
    }

    if (Array.isArray(s.facts)) {
      s.facts.forEach((f) => {
        const toks = (f.tokens || []).map((t) =>
          `<span class="${escapeHtml(t.cls || 'ti-st-neutral')}">${formatInlineHtml(t.text)}</span>`
        ).join('');
        rows.push(
          `<tr>` +
            `<th scope="row" class="ti-k">${escapeHtml(f.key || 'STAT')}</th>` +
            `<td class="ti-v"><div class="ti-info-flow">${toks}</div></td>` +
          `</tr>`
        );
      });
    }

    if (s.tone === 'overage') {
      const ovgTxt = infoExtras.filter((x) => x.cls === 'status-overage').map((x) => x.text).join(' · ') || (isTouch ? 'OVERAGE MODE — TAP TO FLAG' : 'OVERAGE MODE — CLICK TO FLAG');
      rows.push(
        `<tr class="ti-row-overage">` +
          `<th scope="row" class="ti-k">OVG</th>` +
          `<td class="ti-v">${escapeHtml(ovgTxt)}</td>` +
        `</tr>`
      );
    } else if (s.tone === 'credit') {
      const crTxt = infoExtras.filter((x) => x.cls === 'status-credit').map((x) => x.text).join(' · ') || 'DSD VENDOR CREDIT';
      rows.push(
        `<tr class="ti-row-credit">` +
          `<th scope="row" class="ti-k">CREDIT</th>` +
          `<td class="ti-v">${escapeHtml(crTxt)}</td>` +
        `</tr>`
      );
    } else if (s.tone === 'label') {
      rows.push(
        `<tr class="ti-row-label">` +
          `<th scope="row" class="ti-k">LABEL</th>` +
          `<td class="ti-v">Print Yellow UPC Inventory Sticker</td>` +
        `</tr>`
      );
    }

    if (condAlerts.length) {
      rows.push(
        `<tr class="ti-row-crit">` +
          `<th scope="row" class="ti-k">COND.</th>` +
          `<td class="ti-v">${escapeHtml(condAlerts.join(' · '))}</td>` +
        `</tr>`
      );
    }
    if (warnAlerts.length) {
      rows.push(
        `<tr class="ti-row-warn">` +
          `<th scope="row" class="ti-k">${condAlerts.length ? 'NOTE' : 'COND.'}</th>` +
          `<td class="ti-v">${escapeHtml(warnAlerts.join(' · '))}</td>` +
        `</tr>`
      );
    }

    const infoBits = [];
    if (m && (m.binState || typeof m.labeled === 'boolean' || typeof m.inventoried === 'boolean' || m.supply)) {
      if (m.binState === 'binned') {
        infoBits.push(`<span class="ti-bin-placed">BIN ${escapeHtml(m.binCode || '')}</span>`);
      } else if (m.binState === 'unbinned') {
        infoBits.push(`<span class="ti-bin-unbinned">UNBINNED · FLOOR</span>`);
      }
      if (m.supply) {
        infoBits.push(`<span class="ti-sup-pill">STORE SUPPLY</span>`);
      } else {
        if (m.labeled === true) infoBits.push(`<span class="ti-lbl-yes">✓ LABELED</span>`);
        else if (m.labeled === false) infoBits.push(`<span class="ti-lbl-no">UNLABELED</span>`);
        if (m.binState === 'binned') {
          if (m.inventoried === true) infoBits.push(`<span class="ti-st-ok">✓ INVENTORIED (${escapeHtml(String(m.auditedQty || m.stackUnits || m.unitsPerCase || 0))}u)</span>`);
          else if (m.inventoried === false) infoBits.push(`<span class="ti-inv-pending">UNINVENTORIED</span>`);
        }
      }
    }
    if (s.subtitle) infoBits.push(`<span class="ti-src-muted">${escapeHtml(s.subtitle)}</span>`);
    infoExtras.forEach((x) => {
      if (x.cls === 'status-overage' && s.tone === 'overage') return;
      if (x.cls === 'status-credit' && s.tone === 'credit') return;
      if (s.tone === 'label' && /YELLOW LABEL REQ/i.test(x.text)) return;
      if (/HAZWASTE/i.test(x.text)) infoBits.push(`<span class="ti-disp-haz">${escapeHtml(x.text)}</span>`);
      else if (/ORGANICS/i.test(x.text)) infoBits.push(`<span class="ti-disp-org">${escapeHtml(x.text)}</span>`);
      else if (x.cls === 'status-ok') infoBits.push(`<span class="ti-st-ok">${escapeHtml(x.text)}</span>`);
      else if (x.cls === 'status-overage') infoBits.push(`<span class="ti-st-overage">${escapeHtml(x.text)}</span>`);
      else if (x.cls === 'cond-warn') infoBits.push(`<span class="ti-st-warn">${escapeHtml(x.text)}</span>`);
      else infoBits.push(`<span class="ti-st-neutral">${escapeHtml(x.text)}</span>`);
    });
    if (infoBits.length) {
      rows.push(
        `<tr>` +
          `<th scope="row" class="ti-k">INFO</th>` +
          `<td class="ti-v"><div class="ti-info-flow">${infoBits.join('')}</div></td>` +
        `</tr>`
      );
    }

    const actsHtml = (s.actions || []).map((a) => {
      if (isTouch) {
        const touchTxt = String(a.touch || 'TAP');
        const touchCls = /^(BLOCKED|NEED JACK)$/i.test(touchTxt)
          ? 'blocked'
          : (/^(INFO|LABELED|FINALIZED)$/i.test(touchTxt) ? 'neutral' : (a.touchCls || ''));
        return `<span class="ti-act"><span class="ut-touch-pill ${escapeHtml(touchCls)}">${escapeHtml(touchTxt)}</span><span>${escapeHtml(a.verb)}</span></span>`;
      }
      const keyTxt = String(a.key || 'E');
      const keyCls = /^(Blocked|Locked)$/i.test(keyTxt)
        ? 'blocked'
        : (/^(Info|Done|Next Shift)$/i.test(keyTxt) ? 'neutral' : (a.touchCls || ''));
      return `<span class="ti-act"><span class="ut-keycap ${escapeHtml(keyCls)}">${escapeHtml(keyTxt)}</span><span>${escapeHtml(a.verb)}</span></span>`;
    }).join('');

    const catChipCls = s.catChipCls ? ` ${escapeHtml(s.catChipCls)}` : '';
    const tableHtml = rows.length ? `<table class="ti-table"><tbody>${rows.join('')}</tbody></table>` : '';
    return `<div class="ti-hdr">` +
        `<span class="ti-hdr-ico">${ICONS[s.icon] || ICONS.box}</span>` +
        `<div class="ti-hdr-title">${escapeHtml(s.title)}</div>` +
        (s.catChip ? `<span class="ti-hdr-tag${catChipCls}">${escapeHtml(s.catChip)}</span>` : '') +
      `</div>` +
      tableHtml +
      (actsHtml ? `<div class="ti-foot">${actsHtml}</div>` : '');
  }

  function renderToElement(el, spec, opts) {
    if (!el) return;
    if (!spec) {
      if (el._lastDisp !== 'none') {
        el._lastDisp = 'none';
        el.style.display = 'none';
      }
      return;
    }

    const o = opts || {};
    const isTouch = Boolean(o.isTouch);
    const isAimCenter = Boolean(o.isAimCenter);
    const isMinimal = Boolean(spec.minimal);
    const nextClass = `hud-infotip tone-${spec.tone || 'info'}${isAimCenter ? ' docked-right' : ' free-cursor'}${isMinimal ? ' minimal-card' : ''}`;
    const nextHtml = buildTabulatedInfotipHtml(spec, isTouch);

    if (el._lastClass !== nextClass) {
      el._lastClass = nextClass;
      el.className = nextClass;
    }
    if (el._lastHtml !== nextHtml) {
      el._lastHtml = nextHtml;
      el.innerHTML = nextHtml;
    }
    if (el._lastDisp !== 'block') {
      el._lastDisp = 'block';
      el.style.display = 'block';
    }

    if (isAimCenter) {
      if (el.style.left) el.style.left = '';
      if (el.style.top) el.style.top = '';
    } else {
      const ndc = o.pointerNDC || { x: 0, y: 0 };
      const vw = Math.max(320, global.innerWidth || 1280);
      const vh = Math.max(240, global.innerHeight || 720);
      const px = ((ndc.x + 1) * 0.5) * vw;
      const py = ((1 - ndc.y) * 0.5) * vh;
      const boxW = el.offsetWidth || 340;
      const boxH = el.offsetHeight || 140;
      const leftPx = Math.round(Math.min(vw - boxW - 14, Math.max(12, px + 18)));
      const topPx = Math.round(Math.min(vh - boxH - 14, Math.max(102, py - 24)));
      const leftStr = leftPx + 'px';
      const topStr = topPx + 'px';
      if (el._lastLeft !== leftStr) {
        el._lastLeft = leftStr;
        el.style.left = leftStr;
      }
      if (el._lastTop !== topStr) {
        el._lastTop = topStr;
        el.style.top = topStr;
      }
    }
  }

  global.InfotipRenderer = {
    ICONS: ICONS,
    escapeHtml: escapeHtml,
    buildTabulatedInfotipHtml: buildTabulatedInfotipHtml,
    renderToElement: renderToElement
  };
})(window);
