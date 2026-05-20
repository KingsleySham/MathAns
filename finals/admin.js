// Finals admin — note management.
// Structure: the gate is wired up SYNCHRONOUSLY with no top-level imports
// so that even if Firebase or the network fails the eye toggle / form
// submit / status pill still work. Firebase is lazy-loaded only when the
// admin is unlocked.

import { COVERAGE as DEFAULT_COVERAGE } from './exam-data.js';

console.log('[admin] script start');

/* ──────────────────────────────────────────────────────────────────────────
   Global error handlers — surface anything thrown to the gate status pill
   so we can debug without DevTools.
   ────────────────────────────────────────────────────────────────────────── */
window.addEventListener('error', (e) => {
  console.error('[admin] uncaught error:', e.error || e.message);
  tryShowFatal('Uncaught error: ' + ((e.error && e.error.message) || e.message || 'unknown'));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[admin] unhandled rejection:', e.reason);
  tryShowFatal('Unhandled promise rejection: ' + ((e.reason && e.reason.message) || String(e.reason)));
});

function tryShowFatal(msg) {
  const el = document.getElementById('gate-status');
  if (!el) return;
  el.className = 'gate-status gate-status-err';
  el.textContent = msg;
}

/* ──────────────────────────────────────────────────────────────────────────
   Gate elements — defensive lookup. Each is allowed to be null; the gate
   still partially works as long as the form + input are present.
   ────────────────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const gateEl          = $('gate');
const appEl           = $('admin-app');
const gateForm        = $('gate-form');
const gateInput       = $('gate-passcode');
const gateSubmit      = $('gate-submit');
const gateStatus      = $('gate-status');
const gatePwToggle    = $('gate-pw-toggle');
const gateCaps        = $('gate-caps');
const gateSubmitLabel = gateSubmit ? gateSubmit.querySelector('.gate-submit-label') : null;

console.log('[admin] gate elements:', {
  gateEl: !!gateEl, appEl: !!appEl, gateForm: !!gateForm, gateInput: !!gateInput,
  gateSubmit: !!gateSubmit, gateStatus: !!gateStatus, gatePwToggle: !!gatePwToggle,
  gateCaps: !!gateCaps, gateSubmitLabel: !!gateSubmitLabel
});

const ADMIN_PASSCODE_KEY = 'finals.adminPasscode';
function getPasscode() { try { return sessionStorage.getItem(ADMIN_PASSCODE_KEY) || ''; } catch (_) { return ''; } }
function setPasscode(v) { try { sessionStorage.setItem(ADMIN_PASSCODE_KEY, v); } catch (_) {} }
function clearPasscode() { try { sessionStorage.removeItem(ADMIN_PASSCODE_KEY); } catch (_) {} }

function escapeHtmlSimple(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setGateStatus(kind, msg) {
  if (!gateStatus) return;
  gateStatus.className = 'gate-status' + (kind ? ' gate-status-' + kind : '');
  gateStatus.innerHTML = msg || '';
}

function setGateBusy(busy) {
  if (gateSubmit) gateSubmit.disabled = busy;
  if (gateInput) gateInput.disabled = busy;
  if (gateSubmit) gateSubmit.classList.toggle('is-loading', busy);
  if (gateSubmitLabel) gateSubmitLabel.textContent = busy ? 'Checking…' : 'Unlock';
}

/* ──────────────────────────────────────────────────────────────────────────
   Eye toggle (show/hide passcode)
   ────────────────────────────────────────────────────────────────────────── */
if (gatePwToggle && gateInput) {
  gatePwToggle.addEventListener('click', () => {
    const isPw = gateInput.type === 'password';
    gateInput.type = isPw ? 'text' : 'password';
    gatePwToggle.setAttribute('aria-label', isPw ? 'Hide passcode' : 'Show passcode');
    gatePwToggle.classList.toggle('on', isPw);
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   Caps Lock detection
   ────────────────────────────────────────────────────────────────────────── */
if (gateInput && gateCaps) {
  const syncCaps = (e) => {
    if (e && typeof e.getModifierState === 'function') {
      gateCaps.hidden = !e.getModifierState('CapsLock');
    }
  };
  gateInput.addEventListener('keydown', syncCaps);
  gateInput.addEventListener('keyup', syncCaps);
  gateInput.addEventListener('input', () => { gateCaps.hidden = true; });
}

/* ──────────────────────────────────────────────────────────────────────────
   Verify passcode via /api/admin-verify
   ────────────────────────────────────────────────────────────────────────── */
async function verifyPasscode(passcode) {
  let resp;
  try {
    resp = await fetch('/api/admin-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    });
  } catch (e) {
    return { kind: 'network', message: e.message || 'Network error' };
  }

  const ct = resp.headers.get('content-type') || '';
  let payload = null, rawText = '';
  if (ct.includes('application/json')) {
    try { payload = await resp.json(); } catch (_) {}
  } else {
    try { rawText = await resp.text(); } catch (_) {}
  }
  console.debug('[admin] verify response', resp.status, payload || rawText.slice(0, 200));

  if (resp.status === 200 && payload && payload.ok) return { kind: 'ok' };
  if (resp.status === 401) return { kind: 'wrong' };
  if (resp.status === 404) return { kind: 'notfound', status: 404 };
  if (resp.status === 500) return { kind: 'misconf', status: 500, message: (payload && payload.error) || 'Server error' };

  return {
    kind: 'unexpected',
    status: resp.status,
    message: (payload && payload.error) || (rawText && rawText.slice(0, 240)) || `HTTP ${resp.status}`
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Form submit handler — attach IMMEDIATELY so we never let the form's
   default submit reload the page.
   ────────────────────────────────────────────────────────────────────────── */
if (gateForm) {
  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = (gateInput && gateInput.value || '').trim();
    if (!input) {
      setGateStatus('err', 'Please enter a passcode.');
      if (gateInput) gateInput.focus();
      return;
    }

    setGateBusy(true);
    setGateStatus('info', 'Checking passcode…');

    let result;
    try {
      result = await verifyPasscode(input);
    } catch (err) {
      setGateBusy(false);
      setGateStatus('err', 'Unexpected error: ' + escapeHtmlSimple(err.message || String(err)));
      return;
    }
    setGateBusy(false);

    if (result.kind === 'ok') {
      setGateStatus('ok', '✓ Correct — unlocking…');
      setPasscode(input);
      setTimeout(unlockAdmin, 400);
      return;
    }
    if (result.kind === 'wrong') {
      setGateStatus('err', '✗ Wrong passcode. Try again.');
      if (gateInput) gateInput.select();
      return;
    }
    if (result.kind === 'notfound') {
      setGateStatus('err',
        'The <code>/api/admin-verify</code> endpoint returned 404. ' +
        'The latest deploy may not include it yet — wait a minute and retry, ' +
        'or trigger a redeploy from Vercel.');
      return;
    }
    if (result.kind === 'misconf') {
      setGateStatus('err',
        'Server error (500): ' + escapeHtmlSimple(result.message || ''));
      return;
    }
    if (result.kind === 'network') {
      setGateStatus('err',
        'Could not reach the server. Check your internet and try again.<br>' +
        '<span style="font-size:0.78rem;opacity:0.85;">(' + escapeHtmlSimple(result.message || '') + ')</span>');
      return;
    }
    setGateStatus('err',
      'Unexpected response (HTTP ' + result.status + ').<br>' +
      '<span style="font-size:0.78rem;opacity:0.85;">' + escapeHtmlSimple(result.message || '') + '</span>');
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   Sign-out button (visible after unlock)
   ────────────────────────────────────────────────────────────────────────── */
const signoutBtn = $('admin-signout');
if (signoutBtn) {
  signoutBtn.addEventListener('click', () => {
    clearPasscode();
    if (gateEl) gateEl.style.display = 'block';
    if (appEl)  appEl.style.display  = 'none';
    setGateStatus('', '');
    setTimeout(() => gateInput && gateInput.focus(), 0);
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   Lazy-load Firebase and switch into the admin app
   ────────────────────────────────────────────────────────────────────────── */
let firebaseModule = null;

async function unlockAdmin() {
  if (gateEl) gateEl.style.display = 'none';
  if (appEl)  appEl.style.display  = 'block';

  try {
    if (!firebaseModule) {
      firebaseModule = await import('./firebase-init.js');
    }
    startAdmin(firebaseModule);
  } catch (err) {
    console.error('[admin] firebase load failed', err);
    const tbody = $('admin-cards');
    if (tbody) {
      tbody.innerHTML = '<div class="empty-state" style="color:#b91c1c;">' +
        'Failed to load Firebase: ' + escapeHtmlSimple(err.message || String(err)) + '</div>';
    }
  }
}

// If we previously authenticated this session, jump straight in.
if (getPasscode()) {
  console.log('[admin] previously authenticated — unlocking');
  unlockAdmin();
} else {
  console.log('[admin] gate shown');
  if (gateInput) setTimeout(() => gateInput.focus(), 0);
}

/* ==========================================================================
   Admin app — runs after unlock, with Firebase module passed in.
   ========================================================================== */
function startAdmin(fb) {
  const { db, collection, addDoc, doc, setDoc, deleteDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp } = fb;

  const cardsEl       = $('admin-cards');
  const emptyEl       = $('admin-empty');
  const searchEl      = $('admin-search');
  const statCount     = $('stat-count');
  const statSize      = $('stat-size');
  const statNotes     = $('stat-notes');
  const statMocks     = $('stat-mocks');
  const subjectListEl = $('subject-breakdown');
  const recentListEl  = $('recent-list');
  const folderTreeEl  = $('folder-tree');

  let allNotes = [];
  let allFolders = [];
  let folderById = new Map();   // id → { id, name, parentId, children, depth, path }
  let folderLinear = [];        // depth-first ordered list

  // Sort key: lower = earlier in the list. Admin-set `order` wins; otherwise
  // fall back to -createdAtMillis so newest items still come first by default.
  function noteSortKey(n) {
    if (typeof n.order === 'number') return n.order;
    const ms = n.createdAt && typeof n.createdAt.toMillis === 'function' ? n.createdAt.toMillis() : 0;
    return -ms;
  }
  function sortNotes(arr) { arr.sort((a, b) => noteSortKey(a) - noteSortKey(b)); return arr; }

  function fmtBytes(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function fmtDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  function fmtRelative(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' min ago';
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' h ago';
    if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + ' d ago';
    return d.toLocaleDateString();
  }

  function renderCards() {
    if (!cardsEl) return;
    const q = ((searchEl && searchEl.value) || '').trim().toLowerCase();
    const filtered = q
      ? allNotes.filter(n =>
          (n.title || '').toLowerCase().includes(q) ||
          (n.uploaderName || '').toLowerCase().includes(q) ||
          (n.subject || '').toLowerCase().includes(q))
      : allNotes;

    if (filtered.length === 0) {
      cardsEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.textContent = allNotes.length === 0
          ? 'No notes uploaded yet.'
          : 'No matches.';
        cardsEl.appendChild(emptyEl);
      }
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    cardsEl.innerHTML = filtered.map(n => {
      const meta = n.type === 'mock_paper' ? { label: 'Mock Paper', cls: 'mock_paper' }
                 : n.type === 'flashcards'  ? { label: 'Flashcards', cls: 'flashcards' }
                 : { label: 'Notes', cls: 'notes' };
      const isFlash = n.type === 'flashcards';
      const folderNode = n.folderId ? folderById.get(n.folderId) : null;
      const sizeOrSetId = isFlash ? `Quizlet · #${escapeHtmlSimple(n.quizletSetId || '')}` : fmtBytes(n.fileSize);
      const openHref = isFlash ? (n.quizletUrl || '#') : (n.downloadUrl || '#');
      // Click stats — counts populated by the public hub via
      // updateDoc({clicksX: increment(1)}). Admin signed-in sessions
      // are excluded from the counters (see app.js trackClick()).
      const cView     = n.clicksView     || 0;
      const cDownload = n.clicksDownload || 0;
      const cGdocs    = n.clicksGdocs    || 0;
      const cQuizlet  = n.clicksQuizlet  || 0;
      const cTotal    = cView + cDownload + cGdocs + cQuizlet;
      const statsBits = [];
      if (cView)     statsBits.push(`<span class="cstat cstat-view">👁 ${cView}</span>`);
      if (cDownload) statsBits.push(`<span class="cstat cstat-dl">⬇ ${cDownload}</span>`);
      if (cGdocs)    statsBits.push(`<span class="cstat cstat-gdocs">G ${cGdocs}</span>`);
      if (cQuizlet)  statsBits.push(`<span class="cstat cstat-quizlet">Q ${cQuizlet}</span>`);

      return `
        <div class="admin-card ${isFlash ? 'note-card-flashcards' : ''}" data-id="${escapeHtmlSimple(n.id)}">
          <div class="admin-card-top">
            <div class="admin-card-title">${escapeHtmlSimple(n.title || '(untitled)')}</div>
            <div class="note-type ${meta.cls}">${meta.label}</div>
          </div>
          <div class="admin-card-meta">
            <span><strong>${escapeHtmlSimple(n.subject || '—')}</strong></span>
            <span>·</span>
            <span>by ${escapeHtmlSimple(n.uploaderName || 'Anonymous')}</span>
            <span>·</span>
            <span>${sizeOrSetId}</span>
            <span>·</span>
            <span title="${escapeHtmlSimple(fmtDate(n.createdAt))}">${escapeHtmlSimple(fmtRelative(n.createdAt))}</span>
          </div>
          ${folderNode ? `<div class="admin-card-folder">📁 ${escapeHtmlSimple(folderNode.path)}</div>` : ''}
          ${n.description ? `<div class="admin-card-desc">${escapeHtmlSimple(n.description)}</div>` : ''}
          <div class="admin-card-clicks" title="${cTotal} non-admin click${cTotal === 1 ? '' : 's'}">
            <span class="cstat-label">Clicks:</span>
            ${statsBits.length ? statsBits.join('') : '<span class="cstat-empty">none yet</span>'}
          </div>
          <div class="admin-card-actions">
            <div class="reorder-group" role="group" aria-label="Reorder">
              <button class="btn-secondary btn-reorder" data-action="move-up"   aria-label="Move up"   title="Move up">↑</button>
              <button class="btn-secondary btn-reorder" data-action="move-down" aria-label="Move down" title="Move down">↓</button>
            </div>
            <a class="btn-secondary" href="${escapeHtmlSimple(openHref)}" target="_blank" rel="noopener">Open</a>
            <button class="btn-primary" data-action="edit">Edit</button>
            <button class="btn-primary btn-danger" data-action="delete">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function currentlyVisibleNotes() {
    const q = ((searchEl && searchEl.value) || '').trim().toLowerCase();
    if (!q) return allNotes;
    return allNotes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.uploaderName || '').toLowerCase().includes(q) ||
      (n.subject || '').toLowerCase().includes(q));
  }

  // Swap the effective sort keys between `note` and the note immediately above
  // (dir=-1) or below (dir=+1) it in the visible (filtered) list, so the move
  // matches what the admin actually sees. Two writes per move.
  async function moveNote(noteId, dir) {
    const visible = currentlyVisibleNotes();
    const idx = visible.findIndex(n => n.id === noteId);
    if (idx < 0) return;
    const neighborIdx = idx + dir;
    if (neighborIdx < 0 || neighborIdx >= visible.length) return;
    const me = visible[idx];
    const neighbor = visible[neighborIdx];
    const myKey = noteSortKey(me);
    const neighborKey = noteSortKey(neighbor);
    if (myKey === neighborKey) {
      // Two notes with identical effective keys — bump by a tiny offset.
      const offset = dir < 0 ? -1 : 1;
      try {
        await updateDoc(doc(db, 'notes', me.id), { order: neighborKey + offset });
      } catch (err) { alert('Reorder failed: ' + (err.message || err)); }
      return;
    }
    try {
      await Promise.all([
        updateDoc(doc(db, 'notes', me.id),       { order: neighborKey }),
        updateDoc(doc(db, 'notes', neighbor.id), { order: myKey }),
      ]);
    } catch (err) {
      alert('Reorder failed: ' + (err.message || err));
    }
  }

  function renderStats() {
    if (statCount) statCount.textContent = allNotes.length;
    if (statSize)  statSize.textContent  = fmtBytes(allNotes.reduce((sum, n) => sum + (n.fileSize || 0), 0));
    if (statNotes) statNotes.textContent = allNotes.filter(n => n.type === 'notes').length;
    if (statMocks) statMocks.textContent = allNotes.filter(n => n.type === 'mock_paper').length;

    if (subjectListEl) {
      const bySubject = new Map();
      allNotes.forEach(n => {
        const k = n.subject || 'Unknown';
        bySubject.set(k, (bySubject.get(k) || 0) + 1);
      });
      const subjects = [...bySubject.entries()].sort((a, b) => b[1] - a[1]);
      const total = allNotes.length || 1;
      if (subjects.length === 0) {
        subjectListEl.innerHTML = '<li class="empty-state-small">No data yet.</li>';
      } else {
        subjectListEl.innerHTML = subjects.map(([name, count]) => {
          const pct = Math.round((count / total) * 100);
          return `
            <li class="subject-row">
              <div class="subject-row-top">
                <span class="subject-name">${escapeHtmlSimple(name)}</span>
                <span class="subject-count">${count}</span>
              </div>
              <div class="subject-bar"><div class="subject-bar-fill" style="width:${pct}%;"></div></div>
            </li>
          `;
        }).join('');
      }
    }

    if (recentListEl) {
      const recent = [...allNotes].sort((a, b) => {
        const am = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bm = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bm - am;
      }).slice(0, 5);
      if (recent.length === 0) {
        recentListEl.innerHTML = '<li class="empty-state-small">No recent uploads.</li>';
      } else {
        recentListEl.innerHTML = recent.map(n => `
          <li class="recent-row">
            <div class="recent-title">${escapeHtmlSimple(n.title || '(untitled)')}</div>
            <div class="recent-meta">
              <span>${escapeHtmlSimple(n.uploaderName || '—')}</span>
              <span>·</span>
              <span>${escapeHtmlSimple(fmtRelative(n.createdAt))}</span>
            </div>
          </li>
        `).join('');
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────────────
     Folders tree — flat collection in Firestore, transformed into a tree
     client-side. Same shape as in /finals/app.js so the picker dropdowns
     behave identically.
     ──────────────────────────────────────────────────────────────────── */
  function rebuildFolderTree() {
    folderById = new Map();
    allFolders.forEach(f => folderById.set(f.id, { ...f, children: [], depth: 0, path: f.name }));

    const roots = [];
    folderById.forEach(node => {
      if (node.parentId && folderById.has(node.parentId)) {
        folderById.get(node.parentId).children.push(node.id);
      } else {
        roots.push(node.id);
      }
    });

    function assignDepth(id, depth, parentPath) {
      const node = folderById.get(id);
      if (!node) return;
      node.depth = depth;
      node.path = parentPath ? `${parentPath} / ${node.name}` : node.name;
      node.children.sort((a, b) => folderById.get(a).name.localeCompare(folderById.get(b).name));
      node.children.forEach(cid => assignDepth(cid, depth + 1, node.path));
    }
    roots.sort((a, b) => folderById.get(a).name.localeCompare(folderById.get(b).name));
    roots.forEach(id => assignDepth(id, 0, ''));

    const linear = [];
    function walk(id) {
      const node = folderById.get(id);
      if (!node) return;
      linear.push(node);
      node.children.forEach(walk);
    }
    roots.forEach(walk);
    folderLinear = linear;
  }

  function countNotesInFolder(folderId) {
    let cur = 0;
    allNotes.forEach(n => { if (n.folderId === folderId) cur++; });
    return cur;
  }

  function renderFolderTree() {
    if (!folderTreeEl) return;
    if (folderLinear.length === 0) {
      folderTreeEl.innerHTML = '<li class="empty-state-small">No folders yet. Click "+ New folder" to create one.</li>';
      return;
    }
    folderTreeEl.innerHTML = folderLinear.map(node => {
      const noteCount = countNotesInFolder(node.id);
      const hasChildren = node.children.length > 0;
      return `
        <li class="folder-row" data-id="${escapeHtmlSimple(node.id)}" style="padding-left:${node.depth * 22 + 6}px;">
          <span class="folder-row-icon">📁</span>
          <span class="folder-row-name">${escapeHtmlSimple(node.name)}</span>
          <span class="folder-row-count">${noteCount} note${noteCount === 1 ? '' : 's'}${hasChildren ? ` · ${node.children.length} subfolder${node.children.length === 1 ? '' : 's'}` : ''}</span>
          <span class="folder-row-actions">
            <button class="btn-secondary" data-folder-action="rename">Rename</button>
            <button class="btn-secondary" data-folder-action="move">Move</button>
            <button class="btn-primary btn-danger" data-folder-action="delete">Delete</button>
          </span>
        </li>
      `;
    }).join('');
  }

  function populateFolderSelect(selectEl, opts) {
    if (!selectEl) return;
    const prev = selectEl.value;
    const placeholder = (opts && opts.placeholder) || '— No folder —';
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    folderLinear.forEach(node => {
      if (opts && opts.excludeId && (node.id === opts.excludeId || isDescendantOf(node.id, opts.excludeId))) return;
      const opt = document.createElement('option');
      opt.value = node.id;
      opt.textContent = '—'.repeat(node.depth) + (node.depth ? ' ' : '') + node.name;
      selectEl.appendChild(opt);
    });
    if (prev && folderById.has(prev)) selectEl.value = prev;
  }

  function isDescendantOf(maybeChildId, ancestorId) {
    let cur = folderById.get(maybeChildId);
    let guard = 0;
    while (cur && cur.parentId && guard++ < 32) {
      if (cur.parentId === ancestorId) return true;
      cur = folderById.get(cur.parentId);
    }
    return false;
  }

  onSnapshot(
    query(collection(db, 'folders'), orderBy('createdAt', 'asc')),
    (snap) => {
      allFolders = [];
      snap.forEach(d => allFolders.push({ id: d.id, ...d.data() }));
      rebuildFolderTree();
      renderFolderTree();
      renderCards();
    },
    (err) => {
      console.error('[admin] folders listener:', err);
      if (folderTreeEl) folderTreeEl.innerHTML = `<li class="empty-state-small" style="color:#b91c1c;">Failed to load folders: ${escapeHtmlSimple(err.message || String(err))}</li>`;
    }
  );

  /* Folder CRUD via modal */
  const folderModal = $('folder-modal');
  const folderModalTitle = $('folder-modal-title');
  const folderNameInput = $('folder-name-input');
  const folderParentSelect = $('folder-parent-select');
  const folderSaveBtn = $('folder-save-btn');
  const folderNewBtn = $('folder-new-btn');

  // mode: 'create' (no editingId) | 'rename' | 'move'
  let folderModalState = { mode: 'create', editingId: null };

  function openFolderModal(mode, folder) {
    folderModalState = { mode, editingId: folder ? folder.id : null };
    if (mode === 'create') {
      folderModalTitle.textContent = 'New folder';
      folderNameInput.value = '';
      folderNameInput.disabled = false;
      populateFolderSelect(folderParentSelect, { placeholder: '(top level)' });
      folderParentSelect.disabled = false;
    } else if (mode === 'rename') {
      folderModalTitle.textContent = 'Rename folder';
      folderNameInput.value = folder.name || '';
      folderNameInput.disabled = false;
      populateFolderSelect(folderParentSelect, { placeholder: '(top level)', excludeId: folder.id });
      folderParentSelect.value = folder.parentId || '';
      folderParentSelect.disabled = true;     // rename mode: don't move
    } else if (mode === 'move') {
      folderModalTitle.textContent = `Move "${folder.name}"`;
      folderNameInput.value = folder.name || '';
      folderNameInput.disabled = true;
      populateFolderSelect(folderParentSelect, { placeholder: '(top level)', excludeId: folder.id });
      folderParentSelect.value = folder.parentId || '';
      folderParentSelect.disabled = false;
    }
    folderSaveBtn.disabled = false;
    folderSaveBtn.textContent = 'Save';
    folderModal.style.display = 'flex';
    setTimeout(() => folderNameInput.focus(), 0);
  }

  if (folderNewBtn) folderNewBtn.addEventListener('click', () => openFolderModal('create', null));

  folderSaveBtn.addEventListener('click', async () => {
    const name = folderNameInput.value.trim();
    if (!name) { folderNameInput.focus(); return; }
    folderSaveBtn.disabled = true;
    folderSaveBtn.textContent = 'Saving…';
    try {
      if (folderModalState.mode === 'create') {
        await addDoc(collection(db, 'folders'), {
          name,
          parentId: folderParentSelect.value || null,
          createdAt: serverTimestamp()
        });
      } else if (folderModalState.mode === 'rename') {
        await updateDoc(doc(db, 'folders', folderModalState.editingId), { name });
      } else if (folderModalState.mode === 'move') {
        await updateDoc(doc(db, 'folders', folderModalState.editingId), {
          parentId: folderParentSelect.value || null
        });
      }
      closeModal(folderModal);
    } catch (err) {
      folderSaveBtn.disabled = false;
      folderSaveBtn.textContent = 'Save';
      alert('Folder save failed: ' + (err.message || err));
    }
  });

  if (folderTreeEl) {
    folderTreeEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-folder-action]');
      if (!btn) return;
      const row = btn.closest('.folder-row');
      if (!row) return;
      const id = row.dataset.id;
      const folder = folderById.get(id);
      if (!folder) return;
      const action = btn.dataset.folderAction;

      if (action === 'rename') return openFolderModal('rename', folder);
      if (action === 'move')   return openFolderModal('move', folder);

      if (action === 'delete') {
        const notesIn = allNotes.filter(n => n.folderId === id).length;
        const subs = folder.children.length;
        if (notesIn > 0 || subs > 0) {
          alert(`Can't delete "${folder.name}" — it contains ${notesIn} note${notesIn === 1 ? '' : 's'} and ${subs} subfolder${subs === 1 ? '' : 's'}. Move or delete those first.`);
          return;
        }
        if (!confirm(`Delete folder "${folder.name}"?`)) return;
        try {
          await deleteDoc(doc(db, 'folders', id));
        } catch (err) {
          alert('Delete failed: ' + (err.message || err));
        }
      }
    });
  }

  /* ==========================================================================
     Subjects & Types (admin-managed taxonomy)
     ========================================================================== */
  const subjectListEl2  = $('subject-list');
  const typeListEl      = $('type-list');
  const subjectNewBtn   = $('subject-new-btn');
  const typeNewBtn      = $('type-new-btn');
  const taxonomyModal   = $('taxonomy-modal');
  const taxonomyTitle   = $('taxonomy-modal-title');
  const taxonomyLabel   = $('taxonomy-name-label');
  const taxonomyHint    = $('taxonomy-hint');
  const taxonomyInput   = $('taxonomy-name-input');
  const taxonomySaveBtn = $('taxonomy-save-btn');

  let customSubjects = [];   // [{ id, name }]
  let customTypes    = [];   // [{ id, value, label }]
  let taxonomyState  = { kind: 'subject', editingId: null };

  function renderTaxonomy() {
    if (subjectListEl2) {
      if (!customSubjects.length) {
        subjectListEl2.innerHTML = '<li class="empty-state-small">No custom subjects yet.</li>';
      } else {
        subjectListEl2.innerHTML = customSubjects.map(s => `
          <li class="taxonomy-row-item" data-id="${escapeAttr(s.id)}">
            <span class="taxonomy-name">${escapeHtmlSimple(s.name)}</span>
            <span class="taxonomy-actions">
              <button class="btn-secondary btn-sm" data-tax-action="rename-subject">Rename</button>
              <button class="btn-secondary btn-sm btn-danger-outline" data-tax-action="delete-subject">Delete</button>
            </span>
          </li>
        `).join('');
      }
    }
    if (typeListEl) {
      if (!customTypes.length) {
        typeListEl.innerHTML = '<li class="empty-state-small">No custom types yet.</li>';
      } else {
        typeListEl.innerHTML = customTypes.map(t => `
          <li class="taxonomy-row-item" data-id="${escapeAttr(t.id)}">
            <span class="taxonomy-name">${escapeHtmlSimple(t.label)}</span>
            <span class="taxonomy-actions">
              <button class="btn-secondary btn-sm" data-tax-action="rename-type">Rename</button>
              <button class="btn-secondary btn-sm btn-danger-outline" data-tax-action="delete-type">Delete</button>
            </span>
          </li>
        `).join('');
      }
    }
  }

  function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

  function openTaxonomyModal(kind, item) {
    taxonomyState = { kind, editingId: item ? item.id : null };
    if (kind === 'subject') {
      taxonomyTitle.textContent = item ? 'Rename subject' : 'New subject';
      taxonomyLabel.textContent = 'Subject name';
      taxonomyHint.textContent  = 'Appears in the upload form and filter on the hub.';
      taxonomyInput.placeholder = 'e.g. Visual Arts';
      taxonomyInput.value = item ? (item.name || '') : '';
    } else {
      taxonomyTitle.textContent = item ? 'Rename type' : 'New type';
      taxonomyLabel.textContent = 'Type name';
      taxonomyHint.textContent  = 'Shown as a pill on each note (e.g. "Assignment", "Worksheet").';
      taxonomyInput.placeholder = 'e.g. Worksheet';
      taxonomyInput.value = item ? (item.label || '') : '';
    }
    taxonomySaveBtn.disabled = false;
    taxonomySaveBtn.textContent = 'Save';
    taxonomyModal.style.display = 'flex';
    setTimeout(() => taxonomyInput.focus(), 0);
  }

  if (subjectNewBtn) subjectNewBtn.addEventListener('click', () => openTaxonomyModal('subject', null));
  if (typeNewBtn)    typeNewBtn.addEventListener('click',    () => openTaxonomyModal('type', null));

  taxonomySaveBtn.addEventListener('click', async () => {
    const value = taxonomyInput.value.trim();
    if (!value) { taxonomyInput.focus(); return; }
    taxonomySaveBtn.disabled = true;
    taxonomySaveBtn.textContent = 'Saving…';
    try {
      if (taxonomyState.kind === 'subject') {
        if (taxonomyState.editingId) {
          await updateDoc(doc(db, 'subjects', taxonomyState.editingId), { name: value });
        } else {
          await addDoc(collection(db, 'subjects'), { name: value, createdAt: serverTimestamp() });
        }
      } else {
        // Type value is the slug used in note docs; for renames keep the
        // original value so existing notes still resolve to this label.
        if (taxonomyState.editingId) {
          await updateDoc(doc(db, 'noteTypes', taxonomyState.editingId), { label: value });
        } else {
          const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || ('type_' + Date.now());
          await addDoc(collection(db, 'noteTypes'), {
            value: slug,
            label: value,
            createdAt: serverTimestamp()
          });
        }
      }
      closeModal(taxonomyModal);
    } catch (err) {
      taxonomySaveBtn.disabled = false;
      taxonomySaveBtn.textContent = 'Save';
      alert('Save failed: ' + (err.message || err));
    }
  });

  function attachTaxonomyHandlers(listEl) {
    if (!listEl) return;
    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-tax-action]');
      if (!btn) return;
      const row = btn.closest('.taxonomy-row-item');
      if (!row) return;
      const id = row.dataset.id;
      const action = btn.dataset.taxAction;

      if (action === 'rename-subject') {
        const item = customSubjects.find(s => s.id === id);
        if (item) openTaxonomyModal('subject', item);
        return;
      }
      if (action === 'rename-type') {
        const item = customTypes.find(t => t.id === id);
        if (item) openTaxonomyModal('type', item);
        return;
      }
      if (action === 'delete-subject') {
        const item = customSubjects.find(s => s.id === id);
        if (!item) return;
        const used = allNotes.filter(n => n.subject === item.name).length;
        if (used > 0) {
          alert(`"${item.name}" is used by ${used} note${used === 1 ? '' : 's'}. Reassign or delete those first.`);
          return;
        }
        if (!confirm(`Delete subject "${item.name}"?`)) return;
        try { await deleteDoc(doc(db, 'subjects', id)); }
        catch (err) { alert('Delete failed: ' + (err.message || err)); }
        return;
      }
      if (action === 'delete-type') {
        const item = customTypes.find(t => t.id === id);
        if (!item) return;
        const used = allNotes.filter(n => n.type === item.value).length;
        if (used > 0) {
          alert(`"${item.label}" is used by ${used} note${used === 1 ? '' : 's'}. Change or delete those first.`);
          return;
        }
        if (!confirm(`Delete type "${item.label}"?`)) return;
        try { await deleteDoc(doc(db, 'noteTypes', id)); }
        catch (err) { alert('Delete failed: ' + (err.message || err)); }
      }
    });
  }
  attachTaxonomyHandlers(subjectListEl2);
  attachTaxonomyHandlers(typeListEl);

  onSnapshot(
    query(collection(db, 'subjects'), orderBy('createdAt', 'asc')),
    (snap) => {
      customSubjects = [];
      snap.forEach(d => customSubjects.push({ id: d.id, ...d.data() }));
      renderTaxonomy();
    },
    (err) => console.error('[admin] subjects listener:', err)
  );

  onSnapshot(
    query(collection(db, 'noteTypes'), orderBy('createdAt', 'asc')),
    (snap) => {
      customTypes = [];
      snap.forEach(d => customTypes.push({ id: d.id, ...d.data() }));
      renderTaxonomy();
    },
    (err) => console.error('[admin] noteTypes listener:', err)
  );

  /* ==========================================================================
     Popups (admin-authored hub welcome popups shown to visitors)
     One active popup at a time. Activating one deactivates the others.
     Users dismiss locally via localStorage; the doc stays in Firestore.
     ========================================================================== */
  const popupListEl     = $('popup-list');
  const popupNewBtn     = $('popup-new-btn');
  const popupModal      = $('popup-modal');
  const popupModalTitle = $('popup-modal-title');
  const popupEmojiInput = $('popup-emoji-input');
  const popupTitleInput = $('popup-title-input');
  const popupDescInput  = $('popup-desc-input');
  const popupButtonInput= $('popup-button-input');
  const popupFolderSel  = $('popup-folder-select');
  const popupActiveInput= $('popup-active-input');
  const popupSaveBtn    = $('popup-save-btn');

  let allPopups = [];
  let popupEditingId = null;

  function renderPopups() {
    if (!popupListEl) return;
    if (!allPopups.length) {
      popupListEl.innerHTML = '<li class="empty-state-small">No popups yet.</li>';
      return;
    }
    popupListEl.innerHTML = allPopups.map(p => {
      const folder = p.folderId ? folderById.get(p.folderId) : null;
      const folderLabel = folder ? folder.path : (p.folderId ? '(missing folder)' : '— no folder —');
      const titleLine = `${p.emoji ? escapeHtmlSimple(p.emoji) + ' ' : ''}${escapeHtmlSimple(p.title || '(untitled)')}`;
      return `
        <li class="taxonomy-row-item" data-id="${escapeAttr(p.id)}">
          <span class="taxonomy-name">
            ${titleLine}
            ${p.active ? '<span class="popup-active-badge" style="margin-left:8px;padding:2px 8px;background:#dcfce7;color:#15803d;border-radius:999px;font-size:0.72rem;font-weight:700;">ACTIVE</span>' : ''}
            <div style="font-weight:500;color:#6b7280;font-size:0.78rem;margin-top:2px;">→ ${escapeHtmlSimple(folderLabel)}</div>
          </span>
          <span class="taxonomy-actions">
            <button class="btn-secondary btn-sm" data-popup-action="edit">Edit</button>
            <button class="btn-secondary btn-sm btn-danger-outline" data-popup-action="delete">Delete</button>
          </span>
        </li>
      `;
    }).join('');
  }

  function openPopupModal(popup) {
    popupEditingId = popup ? popup.id : null;
    popupModalTitle.textContent = popup ? 'Edit popup' : 'New popup';
    popupEmojiInput.value  = popup ? (popup.emoji || '')       : '';
    popupTitleInput.value  = popup ? (popup.title || '')       : '';
    popupDescInput.value   = popup ? (popup.description || '') : '';
    popupButtonInput.value = popup ? (popup.buttonText || '')  : 'Click here to know more!';
    populateFolderSelect(popupFolderSel, { placeholder: '(no folder — button hidden)' });
    popupFolderSel.value   = popup && popup.folderId ? popup.folderId : '';
    popupActiveInput.checked = popup ? !!popup.active : false;
    popupSaveBtn.disabled = false;
    popupSaveBtn.textContent = 'Save';
    popupModal.style.display = 'flex';
    setTimeout(() => popupTitleInput.focus(), 0);
  }

  if (popupNewBtn) popupNewBtn.addEventListener('click', () => openPopupModal(null));

  popupSaveBtn.addEventListener('click', async () => {
    const title = popupTitleInput.value.trim();
    if (!title) { popupTitleInput.focus(); return; }
    popupSaveBtn.disabled = true;
    popupSaveBtn.textContent = 'Saving…';
    const data = {
      emoji:       popupEmojiInput.value.trim().slice(0, 8),
      title:       title.slice(0, 180),
      description: popupDescInput.value.trim().slice(0, 1800),
      buttonText:  popupButtonInput.value.trim().slice(0, 100),
      folderId:    popupFolderSel.value || null,
      active:      !!popupActiveInput.checked,
    };
    try {
      let savedId;
      if (popupEditingId) {
        await updateDoc(doc(db, 'popups', popupEditingId), data);
        savedId = popupEditingId;
      } else {
        const ref = await addDoc(collection(db, 'popups'), { ...data, createdAt: serverTimestamp() });
        savedId = ref.id;
      }
      if (data.active) {
        // Deactivate all other popups so only this one shows.
        const others = allPopups.filter(p => p.id !== savedId && p.active);
        await Promise.all(others.map(p => updateDoc(doc(db, 'popups', p.id), { active: false })));
      }
      closeModal(popupModal);
    } catch (err) {
      popupSaveBtn.disabled = false;
      popupSaveBtn.textContent = 'Save';
      alert('Save failed: ' + (err.message || err));
    }
  });

  if (popupListEl) {
    popupListEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-popup-action]');
      if (!btn) return;
      const row = btn.closest('.taxonomy-row-item');
      if (!row) return;
      const id = row.dataset.id;
      const popup = allPopups.find(p => p.id === id);
      if (!popup) return;
      const action = btn.dataset.popupAction;
      if (action === 'edit') return openPopupModal(popup);
      if (action === 'delete') {
        if (!confirm(`Delete popup "${popup.title}"?`)) return;
        try { await deleteDoc(doc(db, 'popups', id)); }
        catch (err) { alert('Delete failed: ' + (err.message || err)); }
      }
    });
  }

  onSnapshot(
    query(collection(db, 'popups'), orderBy('createdAt', 'desc')),
    (snap) => {
      allPopups = [];
      snap.forEach(d => allPopups.push({ id: d.id, ...d.data() }));
      renderPopups();
    },
    (err) => console.error('[admin] popups listener:', err)
  );

  /* ==========================================================================
     Exam Coverage (admin-managed via /state/coverage)
     Renders the same .subj-card layout as the hub, with every text node
     made contenteditable so admins can change wording in place.
     ========================================================================== */
  const covListEl    = $('coverage-list');
  const covResetBtn  = $('coverage-reset-btn');
  const covSaveBadge = $('cov-save-indicator');

  let coverageItems = [];

  function setSaveStatus(text, kind) {
    if (!covSaveBadge) return;
    covSaveBadge.textContent = text || '';
    covSaveBadge.classList.remove('is-saving', 'is-saved', 'is-error');
    if (kind) covSaveBadge.classList.add('is-' + kind);
    if (kind === 'saved') {
      clearTimeout(setSaveStatus._t);
      setSaveStatus._t = setTimeout(() => {
        covSaveBadge.textContent = '';
        covSaveBadge.classList.remove('is-saved');
      }, 1800);
    }
  }

  const COV_SECTIONS = [
    { field: 'chapters',   head: 'Chapters / topics' },
    { field: 'workbooks',  head: 'Workbooks' },
    { field: 'worksheets', head: 'Worksheets' },
    { field: 'others',     head: 'Others' }
  ];

  function renderCoverageEditor() {
    if (!covListEl) return;
    // When Firestore has no override yet, render the built-in defaults so
    // the admin can edit the wording directly. The first autosave will
    // persist the whole list (defaults + their edits) into Firestore.
    const renderItems = coverageItems.length ? coverageItems : DEFAULT_COVERAGE;
    if (!renderItems.length) {
      covListEl.innerHTML = `<div class="empty-state-small">No coverage data available.</div>`;
      return;
    }
    covListEl.innerHTML = renderItems.map((sub, i) => {
      const sections = COV_SECTIONS.map(({ field, head }) => {
        const lines = Array.isArray(sub[field]) ? sub[field] : [];
        const lis = lines.map(line => `
          <li>
            <span class="cov-li-text" contenteditable="true" spellcheck="false">${escapeHtmlSimple(line)}</span>
          </li>`).join('');
        const empty = !lines.length;
        return `
          <div class="subj-section${empty ? ' subj-section-empty' : ''}" data-field="${field}">
            <div class="subj-section-head">${head}</div>
            <ul class="subj-list">${lis}</ul>
            <button type="button" class="cov-add-line" data-cov-action="add-line">+ Add line</button>
          </div>`;
      }).join('');

      return `
        <details class="subj-card cov-edit-card" data-i="${i}" open>
          <summary class="subj-card-summary">
            <span class="subj-icon cov-edit-icon" contenteditable="true" spellcheck="false" aria-label="Icon">${escapeHtmlSimple(sub.icon || '📘')}</span>
            <div class="subj-summary-text">
              <div class="subj-name" contenteditable="true" spellcheck="false">${escapeHtmlSimple(sub.subject || '(no name)')}</div>
              <div class="subj-classes" contenteditable="true" spellcheck="false">${escapeHtmlSimple(sub.classes || 'all')}</div>
            </div>
            <span class="subj-chevron" aria-hidden="true">▾</span>
          </summary>
          <div class="subj-card-body">
            ${sections}
          </div>
        </details>`;
    }).join('');
  }

  function readCardEntry(card) {
    const iconEl    = card.querySelector('.cov-edit-icon');
    const nameEl    = card.querySelector('.subj-name');
    const classesEl = card.querySelector('.subj-classes');
    const entry = {
      subject: (nameEl ? nameEl.textContent.trim() : '') || '(untitled)',
      icon:    (iconEl ? iconEl.textContent.trim() : '') || '📘',
      classes: (classesEl ? classesEl.textContent.trim() : '') || 'all'
    };
    COV_SECTIONS.forEach(({ field }) => {
      const sec = card.querySelector(`.subj-section[data-field="${field}"]`);
      if (!sec) return;
      const items = Array.from(sec.querySelectorAll('.cov-li-text'))
        .map(el => el.textContent.replace(/ /g, ' ').trim())
        .filter(Boolean);
      if (field === 'workbooks') {
        if (items.length) entry.workbooks = items;
      } else {
        entry[field] = items;
      }
    });
    return entry;
  }

  async function persistCoverage(nextItems) {
    await setDoc(doc(db, 'state', 'coverage'), {
      items: nextItems,
      updatedAt: serverTimestamp()
    });
  }

  function readAllCards() {
    if (!covListEl) return coverageItems.slice();
    return Array.from(covListEl.querySelectorAll('.cov-edit-card')).map(readCardEntry);
  }

  // Debounced autosave: read the DOM, push to Firestore. The snapshot
  // listener below skips re-rendering while focus is inside the editor,
  // so the caret doesn't jump while the admin is mid-edit.
  let autosaveTimer = null;
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    setSaveStatus('Saving…', 'saving');
    autosaveTimer = setTimeout(async () => {
      autosaveTimer = null;
      try {
        await persistCoverage(readAllCards());
        setSaveStatus('All changes saved', 'saved');
      } catch (err) {
        setSaveStatus('Save failed — ' + (err.message || err), 'error');
      }
    }, 600);
  }

  if (covResetBtn) covResetBtn.addEventListener('click', async () => {
    if (!confirm('Discard your edits and go back to the built-in coverage list?')) return;
    setSaveStatus('Saving…', 'saving');
    try {
      await persistCoverage([]);
      setSaveStatus('All changes saved', 'saved');
    } catch (err) {
      setSaveStatus('Reset failed — ' + (err.message || err), 'error');
    }
  });

  if (covListEl) {
    // Any text edit triggers a debounced save.
    covListEl.addEventListener('input', (e) => {
      if (!e.target.closest('[contenteditable="true"]')) return;
      scheduleAutosave();
    });

    // Keep clicks on editable fields from collapsing the <details>.
    covListEl.addEventListener('click', (e) => {
      if (e.target.matches('[contenteditable="true"]')) e.stopPropagation();
    });

    // Keyboard: Enter inside a bullet adds a new bullet; Backspace at
    // the start of an empty bullet removes it (moving focus back).
    // Enter elsewhere just blurs.
    covListEl.addEventListener('keydown', (e) => {
      const el = e.target;
      if (!el.matches('[contenteditable="true"]')) return;

      if (e.key === 'Enter') {
        if (el.classList.contains('cov-li-text')) {
          e.preventDefault();
          const li = el.closest('li');
          if (!li) return;
          const newLi = document.createElement('li');
          newLi.innerHTML = `<span class="cov-li-text" contenteditable="true" spellcheck="false"></span>`;
          li.after(newLi);
          newLi.querySelector('.cov-li-text').focus();
          scheduleAutosave();
        } else {
          e.preventDefault();
          el.blur();
        }
        return;
      }

      if (e.key === 'Backspace' &&
          el.classList.contains('cov-li-text') &&
          el.textContent === '') {
        e.preventDefault();
        const li  = el.closest('li');
        const ul  = li && li.parentElement;
        const prevLi = li && li.previousElementSibling;
        if (li) li.remove();
        if (prevLi) {
          const prevText = prevLi.querySelector('.cov-li-text');
          if (prevText) {
            prevText.focus();
            const range = document.createRange();
            range.selectNodeContents(prevText);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        if (ul) {
          const section = ul.closest('.subj-section');
          if (section && !ul.children.length) section.classList.add('subj-section-empty');
        }
        scheduleAutosave();
      }
    });

    covListEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-cov-action]');
      if (!btn) return;
      const card = btn.closest('.cov-edit-card');
      if (!card) return;
      const i = parseInt(card.dataset.i, 10);
      if (isNaN(i)) return;
      const action = btn.dataset.covAction;
      e.preventDefault();
      e.stopPropagation();

      if (action === 'add-line') {
        const section = btn.closest('.subj-section');
        const ul = section && section.querySelector('.subj-list');
        if (!ul) return;
        const newLi = document.createElement('li');
        newLi.innerHTML = `<span class="cov-li-text" contenteditable="true" spellcheck="false"></span>`;
        ul.appendChild(newLi);
        if (section) section.classList.remove('subj-section-empty');
        newLi.querySelector('.cov-li-text').focus();
        scheduleAutosave();
      }
    });
  }

  onSnapshot(
    doc(db, 'state', 'coverage'),
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      coverageItems = (data && Array.isArray(data.items)) ? data.items : [];
      // If the admin is mid-edit (caret somewhere inside the editor) the
      // DOM already reflects what we just wrote. Skip the re-render so
      // the caret position and selection survive.
      const focusedInside = covListEl && covListEl.contains(document.activeElement);
      if (!focusedInside) renderCoverageEditor();
    },
    (err) => console.error('[admin] coverage listener:', err)
  );

  /* ==========================================================================
     Reports — anonymous error reports submitted from the hub
     ========================================================================== */
  const reportsListEl  = $('reports-list');
  const reportsFilter  = $('reports-hide-resolved');
  let allReports = [];

  const REPORT_CATEGORIES = {
    'access':   { label: 'Access error',     cls: 'rep-access'   },
    'download': { label: 'Download failed',  cls: 'rep-download' },
    'view':     { label: "Preview wouldn't open", cls: 'rep-view' },
    'load':     { label: "Page won't load",  cls: 'rep-load'     },
    'other':    { label: 'Other',            cls: 'rep-other'    }
  };

  function categoryMeta(c) {
    return REPORT_CATEGORIES[c] || REPORT_CATEGORIES['other'];
  }

  function shortUA(ua) {
    if (!ua) return '';
    // Try to pull the OS/browser hints; otherwise show first 80 chars.
    return ua.length > 80 ? ua.slice(0, 80) + '…' : ua;
  }

  function renderReports() {
    if (!reportsListEl) return;
    const hideResolved = !!(reportsFilter && reportsFilter.checked);
    const list = hideResolved ? allReports.filter(r => !r.resolved) : allReports;
    if (!list.length) {
      reportsListEl.innerHTML = `<li class="empty-state-small">${hideResolved ? 'No unresolved reports — nice. ✓' : 'No reports yet.'}</li>`;
      return;
    }
    reportsListEl.innerHTML = list.map(r => {
      const meta = categoryMeta(r.category);
      const when = fmtDate(r.createdAt);
      const rel  = fmtRelative(r.createdAt);
      const path = escapeHtmlSimple(r.path || '/');
      const ua   = escapeHtmlSimple(shortUA(r.userAgent || ''));
      const msg  = escapeHtmlSimple(r.message || '').replace(/\n/g, '<br>');
      return `
        <li class="report-row${r.resolved ? ' is-resolved' : ''}" data-id="${escapeAttr(r.id)}">
          <div class="report-row-top">
            <span class="report-cat ${meta.cls}">${escapeHtmlSimple(meta.label)}</span>
            <span class="report-when" title="${escapeHtmlSimple(when)}">${escapeHtmlSimple(rel)}</span>
            <div class="report-row-actions">
              <button class="btn-secondary btn-sm" data-rep-action="toggle">${r.resolved ? 'Reopen' : 'Mark resolved'}</button>
              <button class="btn-secondary btn-sm btn-danger-outline" data-rep-action="delete">Delete</button>
            </div>
          </div>
          <div class="report-msg">${msg || '<em class="report-empty">(no message)</em>'}</div>
          <div class="report-meta">
            <span class="report-meta-label">Page</span><code>${path}</code>
            ${ua ? `<span class="report-meta-label">UA</span><code>${ua}</code>` : ''}
          </div>
        </li>`;
    }).join('');
  }

  if (reportsFilter) reportsFilter.addEventListener('change', renderReports);

  if (reportsListEl) {
    reportsListEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-rep-action]');
      if (!btn) return;
      const row = btn.closest('.report-row');
      if (!row) return;
      const id = row.dataset.id;
      const item = allReports.find(r => r.id === id);
      if (!item) return;
      const action = btn.dataset.repAction;
      btn.disabled = true;
      try {
        if (action === 'toggle') {
          await updateDoc(doc(db, 'reports', id), { resolved: !item.resolved });
        } else if (action === 'delete') {
          if (!confirm('Delete this report?')) { btn.disabled = false; return; }
          await deleteDoc(doc(db, 'reports', id));
        }
      } catch (err) {
        alert('Action failed: ' + (err.message || err));
      } finally {
        btn.disabled = false;
      }
    });
  }

  onSnapshot(
    query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
    (snap) => {
      allReports = [];
      snap.forEach(d => allReports.push({ id: d.id, ...d.data() }));
      renderReports();
    },
    (err) => {
      console.error('[admin] reports listener:', err);
      if (reportsListEl) reportsListEl.innerHTML = `<li class="empty-state-small" style="color:#b91c1c;">Failed to load reports: ${escapeHtmlSimple(err.message || String(err))}</li>`;
    }
  );

  onSnapshot(
    query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
    (snap) => {
      allNotes = [];
      snap.forEach(d => allNotes.push({ id: d.id, ...d.data() }));
      sortNotes(allNotes);
      renderStats();
      renderCards();
      renderFolderTree();      // refresh note counts in tree
    },
    (err) => {
      console.error('[admin] notes listener:', err);
      if (cardsEl) cardsEl.innerHTML = `<div class="empty-state" style="color:#b91c1c;">Failed to load notes: ${escapeHtmlSimple(err.message || String(err))}</div>`;
    }
  );

  if (searchEl) searchEl.addEventListener('input', renderCards);

  /* ────────────────────────────────────────────────────────────────────
     Modals — edit + delete
     ──────────────────────────────────────────────────────────────────── */
  const editModal        = $('edit-modal');
  const editTitleInput   = $('edit-title-input');
  const editDescInput    = $('edit-desc-input');
  const editFolderSelect = $('edit-folder-select');
  const editFileInput    = $('edit-file-input');
  const editCurrentFile  = $('edit-current-file');
  const editGdocsInput   = $('edit-gdocs-input');
  const editQuizletInput = $('edit-quizlet-input');
  const editModalMeta    = $('edit-modal-meta');
  const editStatus       = $('edit-status');
  const editSaveBtn      = $('edit-save-btn');

  const deleteModal = $('delete-modal');
  const deleteNoteTitleEl = $('delete-note-title');
  const deleteConfirmBtn = $('delete-confirm-btn');

  let activeNoteId = null;

  function setEditStatus(kind, msg) {
    if (!editStatus) return;
    editStatus.textContent = msg || '';
    editStatus.className = 'upload-status' + (kind ? ' ' + kind : '');
  }

  function isGdocsUrl(url) {
    return /^https?:\/\/(?:docs|drive)\.google\.com\//i.test(String(url || '').trim());
  }
  function gdocsKindFromUrl(url) {
    const u = String(url || '');
    if (u.includes('docs.google.com/document'))     return 'document';
    if (u.includes('docs.google.com/spreadsheets')) return 'spreadsheet';
    if (u.includes('docs.google.com/presentation')) return 'presentation';
    if (u.includes('drive.google.com'))             return 'drive';
    return 'gdocs';
  }
  function parseQuizletUrl(url) {
    const m = String(url || '').trim().match(/^https?:\/\/(?:www\.)?quizlet\.com\/(?:set\/)?(\d{4,})/i);
    return m ? m[1] : null;
  }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const idx = s.indexOf(',');
        resolve(idx >= 0 ? s.slice(idx + 1) : s);
      };
      r.onerror = () => reject(r.error || new Error('Read failed'));
      r.readAsDataURL(file);
    });
  }
  const EDIT_MAX_BYTES = 3 * 1024 * 1024;
  const EDIT_ALLOWED_EXT = ['pdf','doc','docx','png','jpg','jpeg','webp','txt','html','htm'];

  function openEditModal(note) {
    if (!editModal) return;
    activeNoteId = note.id;
    if (editTitleInput)   editTitleInput.value   = note.title || '';
    if (editDescInput)    editDescInput.value    = note.description || '';
    if (editGdocsInput)   editGdocsInput.value   = note.gdocsUrl || '';
    if (editQuizletInput) editQuizletInput.value = note.quizletUrl || '';
    if (editFileInput)    editFileInput.value    = '';
    if (editCurrentFile) {
      if (note.fileName) {
        editCurrentFile.textContent = `Current: ${note.fileName} (${fmtBytes(note.fileSize)})`;
        editCurrentFile.classList.remove('empty');
      } else {
        editCurrentFile.textContent = 'No file attached';
        editCurrentFile.classList.add('empty');
      }
    }
    if (editFolderSelect) {
      populateFolderSelect(editFolderSelect, { placeholder: '— No folder —' });
      editFolderSelect.value = note.folderId || '';
    }
    if (editModalMeta) {
      editModalMeta.textContent = [
        note.subject || '—',
        'by ' + (note.uploaderName || 'Anonymous'),
        note.createdAt ? fmtDate(note.createdAt) : null
      ].filter(Boolean).join(' · ');
    }
    setEditStatus('', '');
    if (editSaveBtn) { editSaveBtn.disabled = false; editSaveBtn.textContent = 'Save changes'; }
    editModal.style.display = 'flex';
    setTimeout(() => { if (editTitleInput) { editTitleInput.focus(); editTitleInput.select(); } }, 0);
  }

  function openDeleteModal(note) {
    if (!deleteModal) return;
    activeNoteId = note.id;
    if (deleteNoteTitleEl) deleteNoteTitleEl.textContent = note.title || '(untitled)';
    if (deleteConfirmBtn) { deleteConfirmBtn.disabled = false; deleteConfirmBtn.textContent = 'Delete'; }
    deleteModal.style.display = 'flex';
  }

  function closeModal(modal) {
    if (modal) modal.style.display = 'none';
    activeNoteId = null;
  }

  [editModal, deleteModal, folderModal, taxonomyModal, popupModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      const closeRole = e.target.dataset.close;
      if (!closeRole) return;
      if (closeRole === 'overlay' && e.target !== modal) return;
      closeModal(modal);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (editModal && editModal.style.display === 'flex') closeModal(editModal);
    if (deleteModal && deleteModal.style.display === 'flex') closeModal(deleteModal);
    if (folderModal && folderModal.style.display === 'flex') closeModal(folderModal);
    if (taxonomyModal && taxonomyModal.style.display === 'flex') closeModal(taxonomyModal);
    if (popupModal && popupModal.style.display === 'flex') closeModal(popupModal);
  });
  if (taxonomyInput) {
    taxonomyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); taxonomySaveBtn.click(); }
    });
  }

  if (editSaveBtn) {
    editSaveBtn.addEventListener('click', async () => {
      if (!activeNoteId) return;
      const note = allNotes.find(n => n.id === activeNoteId);
      if (!note) { closeModal(editModal); return; }

      const newTitle   = (editTitleInput   && editTitleInput.value   || '').trim();
      const newDesc    = (editDescInput    && editDescInput.value    || '').trim();
      const newGdocs   = (editGdocsInput   && editGdocsInput.value   || '').trim();
      const newQuizlet = (editQuizletInput && editQuizletInput.value || '').trim();
      const newFolderId = (editFolderSelect && editFolderSelect.value) || null;
      const newFile = editFileInput && editFileInput.files && editFileInput.files[0];

      if (!newTitle) { setEditStatus('err', 'Title is required.'); editTitleInput.focus(); return; }
      if (newGdocs && !isGdocsUrl(newGdocs)) {
        setEditStatus('err', 'Google Docs link must start with https://docs.google.com/ or https://drive.google.com/.');
        return;
      }
      let newQuizletSetId = null;
      if (newQuizlet) {
        newQuizletSetId = parseQuizletUrl(newQuizlet);
        if (!newQuizletSetId) {
          setEditStatus('err', 'Quizlet link must look like https://quizlet.com/123456789/...');
          return;
        }
      }
      if (newFile) {
        if (newFile.size > EDIT_MAX_BYTES) {
          setEditStatus('err', 'File is larger than 3 MB.');
          return;
        }
        const ext = (newFile.name.split('.').pop() || '').toLowerCase();
        if (!EDIT_ALLOWED_EXT.includes(ext)) {
          setEditStatus('err', 'Unsupported file type. Allowed: ' + EDIT_ALLOWED_EXT.join(', '));
          return;
        }
      }

      const titleChanged   = newTitle !== (note.title || '');
      const descChanged    = newDesc !== (note.description || '');
      const folderChanged  = newFolderId !== (note.folderId || null);
      const gdocsChanged   = newGdocs !== (note.gdocsUrl || '');
      const quizletChanged = newQuizlet !== (note.quizletUrl || '');

      if (!titleChanged && !descChanged && !folderChanged && !gdocsChanged && !quizletChanged && !newFile) {
        closeModal(editModal);
        return;
      }

      editSaveBtn.disabled = true;
      editSaveBtn.textContent = 'Saving…';
      setEditStatus('info', 'Saving…');

      try {
        const patch = { editedAt: serverTimestamp() };
        if (titleChanged)  patch.title = newTitle;
        if (descChanged)   patch.description = newDesc;
        if (folderChanged) patch.folderId = newFolderId;
        if (gdocsChanged) {
          patch.gdocsUrl = newGdocs || null;
          if (newGdocs) patch.gdocsKind = gdocsKindFromUrl(newGdocs);
          else          patch.gdocsKind = null;
        }
        if (quizletChanged) {
          patch.quizletUrl = newQuizlet || null;
          patch.quizletSetId = newQuizletSetId;
        }

        // If a new file was picked, upload it first, then delete the old
        // file from the repo (best-effort cleanup).
        let oldFilePath = null;
        if (newFile) {
          setEditStatus('info', 'Uploading new file…');
          const fileBase64 = await fileToBase64(newFile);
          const resp = await fetch('/api/upload-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploaderName: note.uploaderName || 'Admin',
              title: newTitle,
              subject: note.subject || '',
              type: note.type || 'notes',
              description: newDesc,
              fileName: newFile.name,
              fileMime: newFile.type || '',
              fileBase64
            })
          });
          const result = await resp.json().catch(() => ({}));
          if (!resp.ok || !result.ok) {
            throw new Error('Upload failed: ' + (result.error || `HTTP ${resp.status}`));
          }
          patch.fileName = newFile.name;
          patch.filePath = result.filePath;
          patch.fileSize = result.fileSize || newFile.size;
          patch.fileMime = newFile.type || '';
          patch.downloadUrl = result.downloadUrl;
          oldFilePath = note.filePath || null;
        }

        await updateDoc(doc(db, 'notes', activeNoteId), patch);

        // Clean up old file in the background — non-blocking.
        if (oldFilePath && oldFilePath !== patch.filePath) {
          fetch('/api/delete-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: getPasscode(), filePath: oldFilePath })
          }).catch(e => console.warn('Old file cleanup failed (harmless):', e));
        }

        setEditStatus('ok', '✓ Saved');
        setTimeout(() => closeModal(editModal), 600);
      } catch (err) {
        editSaveBtn.disabled = false;
        editSaveBtn.textContent = 'Save changes';
        setEditStatus('err', 'Save failed: ' + (err.message || err));
      }
    });
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', async () => {
      if (!activeNoteId) return;
      const note = allNotes.find(n => n.id === activeNoteId);
      if (!note) { closeModal(deleteModal); return; }
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = 'Deleting…';
      try {
        if (note.filePath) {
          const resp = await fetch('/api/delete-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: getPasscode(), filePath: note.filePath })
          });
          const result = await resp.json().catch(() => ({}));
          if (!resp.ok && !(result && result.alreadyGone)) {
            if (resp.status === 401) {
              closeModal(deleteModal);
              clearPasscode();
              if (gateEl) gateEl.style.display = 'block';
              if (appEl)  appEl.style.display  = 'none';
              setGateStatus('err', 'Your session expired — sign in again.');
              return;
            }
            throw new Error(result.error || `HTTP ${resp.status}`);
          }
        }
        await deleteDoc(doc(db, 'notes', note.id));
        closeModal(deleteModal);
      } catch (err) {
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = 'Delete';
        alert('Delete failed: ' + (err.message || err));
      }
    });
  }

  if (cardsEl) {
    cardsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const card = btn.closest('.admin-card');
      if (!card) return;
      const id = card.dataset.id;
      const note = allNotes.find(n => n.id === id);
      if (!note) return;
      const action = btn.dataset.action;
      if (action === 'edit') openEditModal(note);
      else if (action === 'delete') openDeleteModal(note);
      else if (action === 'move-up')   moveNote(id, -1);
      else if (action === 'move-down') moveNote(id, +1);
    });
  }
}

console.log('[admin] gate wired up — ready');
