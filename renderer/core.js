/* YTV2 core logic - pure functions, shared by the renderer and Node tests.
   Data model v2:
     entry = { id, name, favorite, tags: [], notes: "", links: [{label, url}] }
   v1 data ({ name: { youtube, x, tags, favorite } }) and v1 CSV
   (name,youtube,x,tags,favorite) are converted on import. */
(function (global) {
  'use strict';

  const LINK_PRESETS = [
    'YouTube', 'X (旧Twitter)', 'Twitch', 'TikTok', 'Instagram',
    'ニコニコ動画', 'Discord', 'Bluesky', 'Webサイト', 'メール', 'その他',
  ];

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeEntry(raw) {
    const e = raw || {};
    return {
      id: e.id || uid(),
      name: String(e.name || '').trim(),
      favorite: !!e.favorite,
      tags: Array.isArray(e.tags) ? e.tags.map(t => String(t).trim()).filter(Boolean) : [],
      notes: String(e.notes || ''),
      links: Array.isArray(e.links)
        ? e.links
            .map(l => ({ label: String((l && l.label) || 'リンク').trim() || 'リンク', url: String((l && l.url) || '').trim() }))
            .filter(l => l.url)
        : [],
    };
  }

  // ---- v1 -> v2 conversion -------------------------------------------------
  function fromV1Object(userData) {
    if (!userData || typeof userData !== 'object') return [];
    return Object.keys(userData).map(name => {
      const d = userData[name] || {};
      const links = [];
      if (d.youtube) links.push({ label: 'YouTube', url: d.youtube });
      if (d.x) links.push({ label: 'X (旧Twitter)', url: d.x });
      return normalizeEntry({ name, favorite: d.favorite, tags: d.tags, links });
    }).filter(e => e.name);
  }

  // ---- CSV (RFC 4180) ------------------------------------------------------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    const src = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inQuotes) {
        if (c === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
  }

  function csvEscape(value) {
    const s = String(value == null ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function stringifyCSV(rows) {
    return rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  }

  // v2 CSV columns: name, favorite, tags, notes, links
  //   tags  : ";" separated (commas stay usable inside a tag)
  //   links : "Label|URL" pairs, ";" separated
  const V2_HEADERS = ['name', 'favorite', 'tags', 'notes', 'links'];

  function entriesToCSV(entries) {
    const rows = [V2_HEADERS.slice()];
    entries.forEach(e => {
      rows.push([
        e.name,
        e.favorite ? 'true' : 'false',
        (e.tags || []).join(';'),
        e.notes || '',
        (e.links || []).map(l => `${l.label}|${l.url}`).join(';'),
      ]);
    });
    return stringifyCSV(rows);
  }

  function entriesFromCSV(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const headers = rows[0].map(h => String(h).trim().toLowerCase());
    const body = rows.slice(1);
    const idx = name => headers.indexOf(name);

    // v1 CSV: name,youtube,x,tags,favorite  (tags were comma-joined, and the
    // old parser broke on them; here tags arrive as ONE quoted cell in files
    // written by v1's exporter because v1 quoted every field.)
    if (idx('youtube') !== -1 || idx('x') !== -1) {
      return body.map(r => {
        const links = [];
        if (idx('youtube') !== -1 && r[idx('youtube')]) links.push({ label: 'YouTube', url: r[idx('youtube')] });
        if (idx('x') !== -1 && r[idx('x')]) links.push({ label: 'X (旧Twitter)', url: r[idx('x')] });
        const tagsCell = idx('tags') !== -1 ? String(r[idx('tags')] || '') : '';
        return normalizeEntry({
          name: r[idx('name')],
          favorite: idx('favorite') !== -1 && String(r[idx('favorite')]).trim() === 'true',
          tags: tagsCell.split(/[,;]/),
          links,
        });
      }).filter(e => e.name);
    }

    // v2 CSV
    return body.map(r => {
      const linksCell = idx('links') !== -1 ? String(r[idx('links')] || '') : '';
      const links = linksCell.split(';').map(pair => {
        const bar = pair.indexOf('|');
        if (bar === -1) return null;
        return { label: pair.slice(0, bar).trim(), url: pair.slice(bar + 1).trim() };
      }).filter(Boolean);
      return normalizeEntry({
        name: idx('name') !== -1 ? r[idx('name')] : r[0],
        favorite: idx('favorite') !== -1 && String(r[idx('favorite')]).trim() === 'true',
        tags: idx('tags') !== -1 ? String(r[idx('tags')] || '').split(';') : [],
        notes: idx('notes') !== -1 ? r[idx('notes')] : '',
        links,
      });
    }).filter(e => e.name);
  }

  // ---- List generation -----------------------------------------------------
  const TEMPLATES = {
    standard: { label: '標準（名前＋リンク）', numbering: false, showLabels: true, includeNotes: false, separator: 'blank', namePrefix: '' },
    compact: { label: 'コンパクト（空行なし）', numbering: false, showLabels: true, includeNotes: false, separator: 'none', namePrefix: '' },
    numbered: { label: '番号付き一覧', numbering: true, showLabels: true, includeNotes: false, separator: 'blank', namePrefix: '' },
    namesOnly: { label: '名前のみ', numbering: false, showLabels: true, includeNotes: false, separator: 'none', namePrefix: '', linksMode: 'none' },
    announce: { label: '告知用（◆付き・メモあり）', numbering: false, showLabels: true, includeNotes: true, separator: 'blank', namePrefix: '◆ ' },
  };

  function generate(entries, options) {
    const o = Object.assign({
      numbering: false, showLabels: true, includeNotes: false,
      separator: 'blank', namePrefix: '', linksMode: 'all',
      includeLabels: null, header: '', footer: '',
    }, options || {});
    const blocks = entries.map((e, i) => {
      const lines = [];
      lines.push(`${o.numbering ? (i + 1) + '. ' : ''}${o.namePrefix || ''}${e.name}`);
      if (o.linksMode !== 'none') {
        (e.links || []).forEach(l => {
          if (Array.isArray(o.includeLabels) && !o.includeLabels.includes(l.label)) return;
          lines.push(o.showLabels ? `${l.label}: ${l.url}` : l.url);
        });
      }
      if (o.includeNotes && e.notes) lines.push(e.notes);
      return lines.join('\n');
    });
    const sep = o.separator === 'blank' ? '\n\n' : o.separator === 'line' ? '\n----------\n' : '\n';
    let out = blocks.join(sep);
    if (o.header) out = o.header + '\n\n' + out;
    if (o.footer) out = out + '\n\n' + o.footer;
    return out;
  }

  // ---- Share codes -----------------------------------------------------------
  // A share code carries the entries of one generated list (the selection).
  // Format: "YTV2." + base64url( UTF-8 JSON { app, kind, version, entries } )
  const SHARE_PREFIX = 'YTV2.';
  function encodeShareCode(entries) {
    const payload = {
      app: 'YTV2', kind: 'list-share', version: 2,
      entries: (entries || []).map(e => ({
        name: e.name, favorite: !!e.favorite,
        tags: Array.isArray(e.tags) ? e.tags : [],
        notes: e.notes || '',
        links: (e.links || []).map(l => ({ label: l.label, url: l.url })),
      })),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return SHARE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeShareCode(code) {
    let s = String(code || '').trim();
    if (!s) return null;
    if (s.startsWith(SHARE_PREFIX)) s = s.slice(SHARE_PREFIX.length);
    s = s.replace(/\s+/g, '');
    if (!s) return null;
    try {
      let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      const obj = JSON.parse(new TextDecoder().decode(bytes));
      const list = Array.isArray(obj) ? obj : obj && obj.entries;
      if (!Array.isArray(list)) return null;
      return list.map(normalizeEntry).filter(e => e.name);
    } catch (_) { return null; }
  }

  const api = { LINK_PRESETS, uid, normalizeEntry, fromV1Object, parseCSV, stringifyCSV, entriesToCSV, entriesFromCSV, TEMPLATES, generate, SHARE_PREFIX, encodeShareCode, decodeShareCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.YTV2Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
