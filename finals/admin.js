// Finals admin — note management.
// Structure: the gate is wired up SYNCHRONOUSLY with no top-level imports
// so that even if Firebase or the network fails the eye toggle / form
// submit / status pill still work. Firebase is lazy-loaded only when the
// admin is unlocked.

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
  const { db, collection, doc, deleteDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp } = fb;

  const cardsEl       = $('admin-cards');
  const emptyEl       = $('admin-empty');
  const searchEl      = $('admin-search');
  const statCount     = $('stat-count');
  const statSize      = $('stat-size');
  const statNotes     = $('stat-notes');
  const statMocks     = $('stat-mocks');
  const subjectListEl = $('subject-breakdown');
  const recentListEl  = $('recent-list');

  let allNotes = [];

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
      const typeLabel = n.type === 'mock_paper' ? 'Mock Paper' : 'Notes';
      const typeClass = n.type === 'mock_paper' ? 'mock_paper' : 'notes';
      return `
        <div class="admin-card" data-id="${escapeHtmlSimple(n.id)}">
          <div class="admin-card-top">
            <div class="admin-card-title">${escapeHtmlSimple(n.title || '(untitled)')}</div>
            <div class="note-type ${typeClass}">${typeLabel}</div>
          </div>
          <div class="admin-card-meta">
            <span><strong>${escapeHtmlSimple(n.subject || '—')}</strong></span>
            <span>·</span>
            <span>by ${escapeHtmlSimple(n.uploaderName || 'Anonymous')}</span>
            <span>·</span>
            <span>${fmtBytes(n.fileSize)}</span>
            <span>·</span>
            <span title="${escapeHtmlSimple(fmtDate(n.createdAt))}">${escapeHtmlSimple(fmtRelative(n.createdAt))}</span>
          </div>
          ${n.description ? `<div class="admin-card-desc">${escapeHtmlSimple(n.description)}</div>` : ''}
          <div class="admin-card-actions">
            <a class="btn-secondary" href="${escapeHtmlSimple(n.downloadUrl || '#')}" target="_blank" rel="noopener">Open</a>
            <button class="btn-primary" data-action="edit">Edit title</button>
            <button class="btn-primary btn-danger" data-action="delete">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderStats() {
    if (statCount) statCount.textContent = allNotes.length;
    if (statSize)  statSize.textContent  = fmtBytes(allNotes.reduce((sum, n) => sum + (n.fileSize || 0), 0));
    if (statNotes) statNotes.textContent = allNotes.filter(n => n.type !== 'mock_paper').length;
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
      const recent = allNotes.slice(0, 5);
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

  onSnapshot(
    query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
    (snap) => {
      allNotes = [];
      snap.forEach(d => allNotes.push({ id: d.id, ...d.data() }));
      renderStats();
      renderCards();
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
  const editModal = $('edit-modal');
  const editTitleInput = $('edit-title-input');
  const editModalMeta = $('edit-modal-meta');
  const editSaveBtn = $('edit-save-btn');

  const deleteModal = $('delete-modal');
  const deleteNoteTitleEl = $('delete-note-title');
  const deleteConfirmBtn = $('delete-confirm-btn');

  let activeNoteId = null;

  function openEditModal(note) {
    if (!editModal) return;
    activeNoteId = note.id;
    if (editTitleInput) editTitleInput.value = note.title || '';
    if (editModalMeta)  editModalMeta.textContent =
      `${note.subject || '—'} · by ${note.uploaderName || 'Anonymous'} · ${fmtBytes(note.fileSize)}`;
    if (editSaveBtn) { editSaveBtn.disabled = false; editSaveBtn.textContent = 'Save'; }
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

  [editModal, deleteModal].forEach(modal => {
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
  });

  if (editSaveBtn) {
    editSaveBtn.addEventListener('click', async () => {
      if (!activeNoteId) return;
      const note = allNotes.find(n => n.id === activeNoteId);
      if (!note) { closeModal(editModal); return; }
      const newTitle = (editTitleInput && editTitleInput.value || '').trim();
      if (!newTitle) { if (editTitleInput) editTitleInput.focus(); return; }
      if (newTitle === note.title) { closeModal(editModal); return; }
      editSaveBtn.disabled = true;
      editSaveBtn.textContent = 'Saving…';
      try {
        await updateDoc(doc(db, 'notes', activeNoteId), {
          title: newTitle,
          editedAt: serverTimestamp()
        });
        closeModal(editModal);
      } catch (err) {
        editSaveBtn.disabled = false;
        editSaveBtn.textContent = 'Save';
        alert('Save failed: ' + (err.message || err));
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
    });
  }
}

console.log('[admin] gate wired up — ready');
