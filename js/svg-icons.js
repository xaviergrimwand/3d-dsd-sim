(function (global) {
  'use strict';

  /**
   * SvgIcons - Top-level shared SVG icon registry for UI chrome, notifications,
   * HUD prompts, modals, CRT terminal, handheld scanner, and tabulated infotips.
   * All icons share a crisp 24x24 currentColor line-art system.
   */
  const ICONS = Object.freeze({
    // --- Existing 20 Infotip Icons (matched verbatim to InfotipRenderer) ---
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
    driver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',

    // --- Newly Drawn Icons Replacing Remaining Codebase Emojis ---
    checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/></svg>',
    crossCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 10h6M9 14h6M9 18h4"/></svg>',
    document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6V3z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></svg>',
    siren: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17v-4a6 6 0 0 1 12 0v4"/><path d="M4 17h16v3H4v-3z"/><path d="M12 2v3M5 5l2 2M19 5l-2 2"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4v2a3 3 0 0 0 4 2.8M16 6h4v2a3 3 0 0 1-4 2.8"/><path d="M12 13v5M8 20h8"/></svg>',
    ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.1 5.9L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1L12 3z"/><path d="M18.5 3.5v3M17 5h3M5.5 17.5v3M4 19h3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>',
    snowflake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17"/><path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/></svg>',
    thermometer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>',
    lightning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    volumeOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
    volumeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M21 9l-6 6M15 9l6 6"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="13" height="10" rx="1"/><path d="M15 9h4l3 3v4h-7V9z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    checkboxChecked: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 12.5l2.8 2.8 5.4-5.6"/></svg>',
    checkboxEmpty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"/></svg>',
    mailbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10a4 4 0 0 1 4-4h7a4 4 0 0 1 4 4v7H5v-7z"/><path d="M12 17v4M16 10h-2V4h3"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15v6M6 15h12l-2-5V5h1V3H7v2h1v5l-2 5z"/></svg>',
    signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 18v-2M9 18v-5M14 18v-8M19 18V6"/></svg>',
    battery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="16" height="10" rx="2"/><path d="M19 10v4" stroke-width="2.4"/><path d="M7 10v4M11 10v4" stroke-width="2.4"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13l3 3v13H4V4z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19h15M8 7h7"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15H6c1.2-1.4 2-3.2 2-6a4 4 0 0 1 8 0c0 2.8.8 4.6 2 6z"/><path d="M10 18a2 2 0 0 0 4 0"/></svg>',
    warehouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6v10H3V10z"/><path d="M8 20v-7h8v7M8 16h8"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.2 8.7-7 10-3.8-1.3-7-5-7-10V6l7-3z"/><path d="M9.5 12l1.8 1.8 3.5-3.6"/></svg>',
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 17l-5-9V3"/><path d="M7.5 15h9"/></svg>',
    paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.1-8.1"/></svg>',
    statusDotRed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V5M7 9l5-5 5 5M5 20h14"/></svg>',
    returnKey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-5-5 5-5"/><path d="M4 9h10a5 5 0 0 1 0 10H11"/></svg>',
    backspace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 6H9l-6 6 6 6h12V6z"/><path d="M12 10l4 4M16 10l-4 4"/></svg>',
    scannerArrows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 7l-5 5 5 5M14 7l5 5-5 5"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6,4 20,12 6,20" fill="currentColor"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    rollupDoor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4.2V2a.8.8 0 0 1 .8-.8h19.4a.8.8 0 0 1 .8.8v2.2"/><path d="M2.5 4.2v18M21.5 4.2v18M1.2 22.4h21.6"/><path d="M2.5 4.2h19M2.5 6.2h19M2.5 19.5h19" stroke-width="1.15" opacity="0.85"/></svg>'
  });

  // Legacy emoji -> SVG icon key mapping (used by display sheet & gradual safe migration)
  const EMOJI_TO_ICON = Object.freeze({
    '⚠️': 'claim',
    '⚠': 'claim',
    '✅': 'checkCircle',
    '📦': 'box',
    '❌': 'crossCircle',
    '📋': 'clipboard',
    '🖨️': 'printer',
    '🖨': 'printer',
    '📄': 'document',
    '📝': 'document',
    '🚨': 'siren',
    '🚩': 'flag',
    '🏆': 'trophy',
    '🚫': 'ban',
    '🎉': 'sparkle',
    '🚀': 'sparkle',
    '🔒': 'lock',
    '❄️': 'snowflake',
    '❄': 'snowflake',
    '🧊': 'snowflake',
    '🌡️': 'thermometer',
    '🌡': 'thermometer',
    '⚡': 'lightning',
    '🔊': 'volumeOn',
    '🔇': 'volumeOff',
    '📂': 'folder',
    '📁': 'folder',
    '🚚': 'truck',
    '☑': 'checkboxChecked',
    '☐': 'checkboxEmpty',
    '🧺': 'tote',
    '📬': 'mailbox',
    '🗄️': 'cabinet',
    '🗄': 'cabinet',
    '💬': 'chat',
    '📌': 'pin',
    '📥': 'tray',
    '🖥️': 'terminal',
    '🖥': 'terminal',
    '⌫': 'backspace',
    '🚧': 'door',
    '🔴': 'statusDotRed',
    '🛡️': 'shield',
    '🛡': 'shield',
    '📎': 'paperclip',
    '⏱️': 'clock',
    '⏱': 'clock',
    '🕛': 'clock',
    '⏳': 'clock',
    '🔔': 'bell',
    '📘': 'book',
    '🔋': 'battery',
    '🏭': 'warehouse',
    '🧪': 'flask',
    '🗑️': 'trash',
    '🗑': 'trash',
    '🏷️': 'tag',
    '🏷': 'tag',
    '📶': 'signal',
    '💾': 'save',
    'ℹ️': 'info',
    'ℹ': 'info',
    '⬇': 'download',
    '⬆': 'upload',
    '↩️': 'returnKey',
    '↩': 'returnKey',
    '⯬': 'scannerArrows',
    '⯮': 'scannerArrows'
  });

  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function get(name) {
    return ICONS[name] || ICONS.box;
  }

  function render(name, opts) {
    const o = opts || {};
    const safeKey = ICONS[name] ? name : 'box';
    const cls = 'svg-ico svg-ico-' + safeKey + (o.className ? ' ' + escapeHtml(o.className) : '');
    const label = o.ariaLabel ? ' aria-label="' + escapeHtml(o.ariaLabel) + '"' : ' aria-hidden="true"';
    const style = o.color ? ' style="color:' + escapeHtml(o.color) + ';"' : '';
    return '<span class="' + cls + '"' + label + style + '>' + get(safeKey) + '</span>';
  }

  const FALLBACK_EMOJI_RE = /(?:⚠️|⚠|✅|📦|❌|📋|🖨️|🖨|📄|📝|🚨|🚩|🏆|🚫|🎉|🚀|🔒|❄️|❄|🧊|🌡️|🌡|⚡|🔊|🔇|📂|📁|🚚|☑|☐|🧺|📬|🗄️|🗄|💬|📌|📥|🖥️|🖥|⌫|🚧|🔴|🛡️|🛡|📎|⏱️|⏱|🕛|⏳|🔔|📘|🔋|🏭|🧪|🗑️|🗑|🏷️|🏷|📶|💾|ℹ️|ℹ|⬇|⬆|↩️|↩|⯬|⯮)/g;

  // Safely escapes HTML first, then converts explicit [[ico:name]] tokens (or legacy emojis) into inline SVGs.
  function formatHtml(text) {
    let html = escapeHtml(text);
    html = html.replace(/\[\[ico:([a-zA-Z0-9_]+)\]\]/g, (_, key) => {
      return ICONS[key] ? render(key) : '';
    });
    html = html.replace(FALLBACK_EMOJI_RE, (m) => {
      const mapped = EMOJI_TO_ICON[m];
      return mapped ? render(mapped) : m;
    });
    return html;
  }

  function stripEmojis(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/\[\[ico:[a-zA-Z0-9_]+\]\]\s*/g, '')
      .replace(/(?:[\uD83C-\uDBFF][\uDC00-\uDFFF][\uFE0F\u200D]*|[\u2300-\u27BF\u2B00-\u2BFF][\uFE0F]?|\u2139\uFE0F?)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function hydrate(root) {
    if (typeof document === 'undefined') return;
    const scope = root || document;
    const nodes = scope.querySelectorAll('[data-svg-ico]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const key = el.getAttribute('data-svg-ico');
      if (!key || !ICONS[key]) continue;
      el.classList.add('svg-ico', 'svg-ico-' + key);
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-hidden', 'true');
      el.innerHTML = ICONS[key];
    }
  }

  // Crisp Canvas2D vector glyphs for cardboard box shipping decals (independent of OS emoji fonts)
  function drawCanvasZoneIcon(ctx, zoneKey, cx, cy, size) {
    if (!ctx) return;
    const r = (size || 14) * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.6, r * 0.24);
    if (zoneKey === 'F' || zoneKey === 'frozen' || zoneKey === 'snowflake') {
      for (let a = 0; a < 3; a++) {
        const ang = (a * Math.PI) / 3;
        const dx = Math.cos(ang) * r;
        const dy = Math.sin(ang) * r;
        ctx.beginPath();
        ctx.moveTo(-dx, -dy);
        ctx.lineTo(dx, dy);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    } else if (zoneKey === 'C' || zoneKey === 'refrigerated' || zoneKey === 'thermometer') {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.lineTo(0, r * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, r * 0.55, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeRect(-r * 0.25, -r * 0.92, r * 0.5, r * 1.15);
    } else {
      // Isometric cube (ambient/box)
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.85, -r * 0.48);
      ctx.lineTo(r * 0.85, r * 0.48);
      ctx.lineTo(0, r * 0.95);
      ctx.lineTo(-r * 0.85, r * 0.48);
      ctx.lineTo(-r * 0.85, -r * 0.48);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, -r * 0.48);
      ctx.lineTo(0, 0);
      ctx.lineTo(r * 0.85, -r * 0.48);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, r * 0.95);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => hydrate(document));
    } else {
      hydrate(document);
    }
  }

  global.SvgIcons = {
    ICONS: ICONS,
    EMOJI_TO_ICON: EMOJI_TO_ICON,
    get: get,
    render: render,
    formatHtml: formatHtml,
    stripEmojis: stripEmojis,
    stripTokens: stripEmojis,
    hydrate: hydrate,
    drawCanvasZoneIcon: drawCanvasZoneIcon,
    escapeHtml: escapeHtml
  };
})(window);
