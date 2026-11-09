/* YTV2 v2 renderer - library / selection / output, all in one window. */
'use strict';
const Core = window.YTV2Core;
const $ = id => document.getElementById(id);

const state = {
  entries: [],
  selectedIds: [],
  activeTags: new Set(),
  editingId: null,
  outputEdited: false,
  loaded: false,
};

// ---------- storage ---------------------------------------------------------
const LS_DATA = 'ytv2-v2-data';
const LS_OLD = 'userData';
const LS_THEME = 'ytv2-theme';

async function loadData() {
  let data = null;
  if (window.ytv2Desktop) {
    data = await window.ytv2Desktop.loadData();
  } else {
    try { data = JSON.parse(localStorage.getItem(LS_DATA) || 'null'); } catch (_) {}
    if (!data) {
      // one-time migration from the v1 browser version saved in this browser
      try {
        const old = JSON.parse(localStorage.getItem(LS_OLD) || 'null');
        if (old) data = { version: 2, entries: Core.fromV1Object(old) };
      } catch (_) {}
    }
  }
  state.entries = (data && Array.isArray(data.entries) ? data.entries : []).map(Core.normalizeEntry);
  state.loaded = true;
  saveData(); // persist migrated data in the new format
}

let saveTimer = null;
function saveData() {
  if (!state.loaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const payload = { version: 2, entries: state.entries };
    if (window.ytv2Desktop) window.ytv2Desktop.saveData(payload);
    else localStorage.setItem(LS_DATA, JSON.stringify(payload));
  }, 150);
}

// ---------- helpers -----------------------------------------------------------
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 2600);
}
function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
}
function entryById(id) { return state.entries.find(e => e.id === id); }

// ---------- library -----------------------------------------------------------
function allTags() {
  const s = new Set();
  state.entries.forEach(e => e.tags.forEach(t => s.add(t)));
  return [...s].sort((a, b) => a.localeCompare(b, 'ja'));
}
function filteredEntries() {
  const q = $('searchInput').value.trim().toLowerCase();
  let list = state.entries.filter(e => {
    if ($('favoriteOnly').checked && !e.favorite) return false;
    if (state.activeTags.size && !e.tags.some(t => state.activeTags.has(t))) return false;
    if (q) {
      const hay = [e.name, e.notes, ...e.tags, ...e.links.map(l => l.label + ' ' + l.url)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sort = $('sortOrder').value;
  if (sort === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  if (sort === 'name-desc') list.sort((a, b) => b.name.localeCompare(a.name, 'ja'));
  if (sort === 'favorite') list.sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name, 'ja'));
  return list;
}
function renderTagChips() {
  const box = $('tagChips');
  box.innerHTML = '';
  allTags().forEach(tag => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.activeTags.has(tag) ? ' active' : '');
    b.textContent = tag;
    b.onclick = () => { state.activeTags.has(tag) ? state.activeTags.delete(tag) : state.activeTags.add(tag); renderLibrary(); };
    box.appendChild(b);
  });
}
function renderLibrary() {
  renderTagChips();
  const list = filteredEntries();
  $('libraryCount').textContent = `${list.length} / ${state.entries.length} 件`;
  const box = $('entryList');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = `<div class="empty">${state.entries.length ? '条件に合う登録がありません' : 'まだ登録がありません。<br>「＋ 新規登録」から追加してください。'}</div>`;
    return;
  }
  list.forEach(e => {
    const card = document.createElement('button');
    card.className = 'entry-card' + (state.selectedIds.includes(e.id) ? ' in-list' : '');
    const inList = state.selectedIds.includes(e.id);
    card.innerHTML = '';
    const row1 = document.createElement('div'); row1.className = 'row1';
    if (e.favorite) { const s = document.createElement('span'); s.className = 'star'; s.textContent = '★'; row1.appendChild(s); }
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = e.name; row1.appendChild(nm);
    if (inList) { const b = document.createElement('span'); b.className = 'count-badge'; b.textContent = '追加済み'; row1.appendChild(b); }
    const edit = document.createElement('span'); edit.className = 'edit-btn'; edit.textContent = '✏️'; edit.title = '編集';
    edit.onclick = ev => { ev.stopPropagation(); openEditor(e.id); };
    row1.appendChild(edit);
    card.appendChild(row1);
    const meta = document.createElement('div'); meta.className = 'meta';
    e.tags.forEach(t => { const p = document.createElement('span'); p.className = 'tag-pill'; p.textContent = t; meta.appendChild(p); });
    e.links.forEach(l => { const s = document.createElement('span'); s.textContent = l.label; meta.appendChild(s); });
    if (e.notes) { const s = document.createElement('span'); s.textContent = '📝'; meta.appendChild(s); }
    card.appendChild(meta);
    card.onclick = () => addToSelected(e.id);
    box.appendChild(card);
  });
}

// ---------- selection ---------------------------------------------------------
function addToSelected(id) {
  if (state.selectedIds.includes(id)) { toast('すでに追加されています'); return; }
  state.selectedIds.push(id);
  renderAll(false);
}
function renderSelected() {
  $('selectedCount').textContent = `${state.selectedIds.length} 件`;
  const box = $('selectedList');
  box.innerHTML = '';
  if (!state.selectedIds.length) {
    box.innerHTML = '<div class="empty">まだ何も選ばれていません。<br>左のライブラリで名前をクリックしてください。</div>';
    return;
  }
  state.selectedIds.forEach((id, i) => {
    const e = entryById(id);
    if (!e) return;
    const item = document.createElement('div');
    item.className = 'selected-item';
    item.draggable = true;
    item.dataset.id = id;
    const num = document.createElement('span'); num.className = 'num'; num.textContent = (i + 1) + '.'; item.appendChild(num);
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = e.name; item.appendChild(nm);
    const mk = (label, title, fn) => { const b = document.createElement('button'); b.textContent = label; b.title = title; b.onclick = fn; return b; };
    item.appendChild(mk('↑', '上へ', () => moveSelected(i, -1)));
    item.appendChild(mk('↓', '下へ', () => moveSelected(i, 1)));
    item.appendChild(mk('✕', '外す', () => { state.selectedIds.splice(i, 1); renderAll(false); }));
    item.addEventListener('dragstart', ev => { item.classList.add('dragging'); ev.dataTransfer.setData('text/plain', id); });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', ev => ev.preventDefault());
    item.addEventListener('drop', ev => {
      ev.preventDefault();
      const fromId = ev.dataTransfer.getData('text/plain');
      const from = state.selectedIds.indexOf(fromId);
      if (from === -1 || from === i) return;
      state.selectedIds.splice(from, 1);
      state.selectedIds.splice(i, 0, fromId);
      renderAll(false);
    });
    box.appendChild(item);
  });
}
function moveSelected(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= state.selectedIds.length) return;
  [state.selectedIds[i], state.selectedIds[j]] = [state.selectedIds[j], state.selectedIds[i]];
  renderAll(false);
}

// ---------- output --------------------------------------------------------------
function currentOptions() {
  const labels = [...document.querySelectorAll('#labelFilters input:checked')].map(i => i.value);
  const allLabels = [...document.querySelectorAll('#labelFilters input')].map(i => i.value);
  const preset = Core.TEMPLATES[$('templateSelect').value] || {};
  return {
    numbering: $('optNumbering').checked,
    showLabels: $('optLabels').checked,
    includeNotes: $('optNotes').checked,
    separator: $('optSeparator').value,
    namePrefix: preset.namePrefix || '',
    linksMode: preset.linksMode || 'all',
    includeLabels: labels.length === allLabels.length ? null : labels,
    header: $('optHeader').value.trim(),
    footer: $('optFooter').value.trim(),
  };
}
function renderLabelFilters() {
  const labels = new Set();
  state.selectedIds.forEach(id => { const e = entryById(id); if (e) e.links.forEach(l => labels.add(l.label)); });
  const box = $('labelFilters');
  const prev = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
  box.innerHTML = '';
  if (!labels.size) return;
  const title = document.createElement('span'); title.className = 'hint'; title.textContent = '含めるリンク：'; box.appendChild(title);
  [...labels].forEach(label => {
    const lab = document.createElement('label'); lab.className = 'check';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = label;
    cb.checked = prev.size ? prev.has(label) : true;
    cb.onchange = () => maybeAutoGenerate();
    lab.appendChild(cb); lab.appendChild(document.createTextNode(label));
    box.appendChild(lab);
  });
}
function doGenerate(flash) {
  const entries = state.selectedIds.map(entryById).filter(Boolean);
  const text = entries.length ? Core.generate(entries, currentOptions()) : '';
  $('outputArea').value = text;
  state.outputEdited = false;
  $('charCount').textContent = text ? `${text.length} 文字` : '';
  if (flash) toast(entries.length ? '生成しました' : '作成リストが空です');
}
function maybeAutoGenerate() { if (!state.outputEdited) doGenerate(false); }

// ---------- editor --------------------------------------------------------------
function linkRow(link) {
  const row = document.createElement('div'); row.className = 'link-row';
  const sel = document.createElement('select');
  Core.LINK_PRESETS.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
  const custom = document.createElement('input'); custom.className = 'custom-label'; custom.placeholder = '自由ラベル'; custom.hidden = true;
  if (link && link.label && !Core.LINK_PRESETS.includes(link.label)) { sel.value = 'その他'; custom.hidden = false; custom.value = link.label; }
  else if (link && link.label) sel.value = link.label;
  sel.onchange = () => { custom.hidden = sel.value !== 'その他'; };
  const url = document.createElement('input'); url.className = 'url'; url.placeholder = 'https://…'; url.value = link ? link.url : '';
  const del = document.createElement('button'); del.type = 'button'; del.textContent = '✕'; del.onclick = () => row.remove();
  row.append(sel, custom, url, del);
  row._collect = () => {
    const label = sel.value === 'その他' ? (custom.value.trim() || 'その他') : sel.value;
    const u = url.value.trim();
    return u ? { label, url: u } : null;
  };
  return row;
}
function openEditor(id) {
  state.editingId = id || null;
  const e = id ? entryById(id) : null;
  $('editorTitle').textContent = e ? '登録を編集' : '新規登録';
  $('fName').value = e ? e.name : '';
  $('fFavorite').checked = e ? e.favorite : false;
  $('fTags').value = e ? e.tags.join(' ') : '';
  $('fNotes').value = e ? e.notes : '';
  const rows = $('linkRows'); rows.innerHTML = '';
  const links = e && e.links.length ? e.links : [{ label: 'YouTube', url: '' }, { label: 'X (旧Twitter)', url: '' }];
  links.forEach(l => rows.appendChild(linkRow(l)));
  $('deleteEntryBtn').hidden = !e;
  $('editorOverlay').hidden = false;
  $('fName').focus();
}
function closeEditor() { $('editorOverlay').hidden = true; state.editingId = null; }

// ---------- render all ------------------------------------------------------------
function renderAll(keepOutput) {
  renderLibrary();
  renderSelected();
  renderLabelFilters();
  if (!keepOutput) maybeAutoGenerate();
}

// ---------- events ------------------------------------------------------------------
function bindEvents() {
  $('searchInput').addEventListener('input', renderLibrary);
  $('favoriteOnly').addEventListener('change', renderLibrary);
  $('sortOrder').addEventListener('change', renderLibrary);
  $('addFilteredBtn').onclick = () => {
    let added = 0;
    filteredEntries().forEach(e => { if (!state.selectedIds.includes(e.id)) { state.selectedIds.push(e.id); added++; } });
    renderAll(false);
    toast(added ? `${added} 件を追加しました` : '追加できる項目がありません');
  };
  $('clearSelectedBtn').onclick = () => { state.selectedIds = []; renderAll(false); };
  $('newEntryBtn').onclick = () => openEditor(null);
  $('addLinkBtn').onclick = () => $('linkRows').appendChild(linkRow(null));
  $('cancelEditorBtn').onclick = closeEditor;
  $('editorOverlay').addEventListener('click', ev => { if (ev.target === $('editorOverlay')) closeEditor(); });

  $('editorForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('fName').value.trim();
    if (!name) return;
    const links = [...$('linkRows').children].map(r => r._collect()).filter(Boolean);
    const data = {
      name,
      favorite: $('fFavorite').checked,
      tags: $('fTags').value.split(/\s+/).map(t => t.trim()).filter(Boolean),
      notes: $('fNotes').value.trim(),
      links,
    };
    if (state.editingId) {
      Object.assign(entryById(state.editingId), data);
      toast(`「${name}」を更新しました`);
    } else {
      const dup = state.entries.find(e => e.name === name);
      if (dup && !confirm(`「${name}」はすでに登録されています。上書きしますか？`)) return;
      if (dup) Object.assign(dup, data);
      else state.entries.push(Core.normalizeEntry(data));
      toast(`「${name}」を登録しました`);
    }
    saveData();
    closeEditor();
    renderAll(true);
  });
  $('deleteEntryBtn').onclick = () => {
    const e = entryById(state.editingId);
    if (!e || !confirm(`「${e.name}」を削除しますか？`)) return;
    state.entries = state.entries.filter(x => x.id !== e.id);
    state.selectedIds = state.selectedIds.filter(id => id !== e.id);
    saveData(); closeEditor(); renderAll(false);
    toast(`「${e.name}」を削除しました`);
  };

  // templates & options
  const sel = $('templateSelect');
  Object.entries(Core.TEMPLATES).forEach(([key, t]) => { const o = document.createElement('option'); o.value = key; o.textContent = t.label; sel.appendChild(o); });
  sel.onchange = () => {
    const t = Core.TEMPLATES[sel.value];
    $('optNumbering').checked = !!t.numbering;
    $('optLabels').checked = !!t.showLabels;
    $('optNotes').checked = !!t.includeNotes;
    $('optSeparator').value = t.separator || 'blank';
    state.outputEdited = false;
    doGenerate(false);
  };
  ['optNumbering', 'optLabels', 'optNotes', 'optSeparator', 'optHeader', 'optFooter'].forEach(id => {
    $(id).addEventListener('change', () => { state.outputEdited = false; doGenerate(false); });
  });
  $('outputArea').addEventListener('input', () => { state.outputEdited = true; $('charCount').textContent = `${$('outputArea').value.length} 文字`; });
  $('generateBtn').onclick = () => doGenerate(true);
  $('copyBtn').onclick = async () => {
    const text = $('outputArea').value;
    if (!text) { toast('コピーする内容がありません'); return; }
    try { await navigator.clipboard.writeText(text); toast('コピーしました！'); }
    catch (_) { $('outputArea').select(); document.execCommand('copy'); toast('コピーしました！'); }
  };
  $('saveTxtBtn').onclick = () => {
    const text = $('outputArea').value;
    if (!text) { toast('保存する内容がありません'); return; }
    download('ytv2-list.txt', text);
    toast('保存しました');
  };

  // import / export
  $('exportBtn').onclick = () => { $('exportMenu').hidden = !$('exportMenu').hidden; };
  document.addEventListener('click', ev => {
    if (!$('exportMenu').hidden && !ev.target.closest('#exportMenu') && ev.target !== $('exportBtn')) $('exportMenu').hidden = true;
  });
  $('exportMenu').addEventListener('click', ev => {
    const kind = ev.target.dataset && ev.target.dataset.export;
    if (!kind) return;
    $('exportMenu').hidden = true;
    if (kind === 'csv') { download('ytv2-data.csv', '\uFEFF' + Core.entriesToCSV(state.entries), 'text/csv;charset=utf-8'); toast('CSVを書き出しました'); }
    if (kind === 'json') { download('ytv2-backup.json', JSON.stringify({ version: 2, entries: state.entries }, null, 2), 'application/json'); toast('バックアップを書き出しました'); }
  });
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').addEventListener('change', async ev => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const text = await file.text();
    let incoming = [];
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) incoming = parsed.map(Core.normalizeEntry);
        else if (parsed && Array.isArray(parsed.entries)) incoming = parsed.entries.map(Core.normalizeEntry);
        else incoming = Core.fromV1Object(parsed); // v1 userData JSON
      } else {
        incoming = Core.entriesFromCSV(text);
      }
    } catch (_) { toast('ファイルを読み取れませんでした'); return; }
    if (!incoming.length) { toast('取り込めるデータがありませんでした'); return; }
    let added = 0, updated = 0;
    incoming.forEach(inc => {
      const existing = state.entries.find(e => e.name === inc.name);
      if (existing) { const id = existing.id; Object.assign(existing, inc, { id }); updated++; }
      else { state.entries.push(Core.normalizeEntry(inc)); added++; }
    });
    saveData(); renderAll(true);
    toast(`取り込み完了：追加 ${added} 件 / 更新 ${updated} 件`);
  });

  // theme
  const savedTheme = localStorage.getItem(LS_THEME);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('themeBtn').textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  $('themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? '' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(LS_THEME, next);
    $('themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
  };
}

// ---------- init ----------------------------------------------------------------------
(async function init() {
  bindEvents();
  const t = Core.TEMPLATES.standard;
  $('optNumbering').checked = !!t.numbering;
  $('optLabels').checked = !!t.showLabels;
  $('optNotes').checked = !!t.includeNotes;
  await loadData();
  renderAll(false);
})();
