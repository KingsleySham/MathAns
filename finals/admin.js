// Finals admin — note management.
// The gate prompts for a passcode and keeps it in sessionStorage. The
// passcode is ONLY validated server-side: every destructive action (delete)
// sends it to /api/delete-note, which checks it against the
// FINALS_ADMIN_SECRET env var. There is no hardcoded client-side passcode
// — viewing the table is open (the data is public Firestore anyway).
import {
  db,
  collection, doc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from './firebase-init.js';

const ADMIN_PASSCODE_KEY = 'finals.adminPasscode';

const gateEl = document.getElementById('gate');
const appEl  = document.getElementById('admin-app');
const gateForm = document.getElementById('gate-form');
const gateInput = document.getElementById('gate-passcode');
const gateSubmit = document.getElementById('gate-submit');
const gateStatus = document.getElementById('gate-status');

function getPasscode() { return sessionStorage.getItem(ADMIN_PASSCODE_KEY) || ''; }
function setPasscode(v) { sessionStorage.setItem(ADMIN_PASSCODE_KEY, v); }
function clearPasscode() { sessionStorage.removeItem(ADMIN_PASSCODE_KEY); }

function setGateStatus(kind, msg) {
  gateStatus.className = 'gate-status' + (kind ? ' gate-status-' + kind : '');
  gateStatus.textContent = msg || '';
}

function showApp() {
  gateEl.style.display = 'none';
  appEl.style.display = 'block';
  startAdmin();
}

function showGate(message) {
  gateEl.style.display = 'block';
  appEl.style.display = 'none';
  setGateStatus(message ? 'err' : '', message || '');
  setTimeout(() => gateInput && gateInput.focus(), 0);
}

/* ──────────────────────────────────────────────────────────────────────────
   Verify passcode via /api/admin-verify. Returns a status string:
     'ok'        → correct passcode
     'wrong'     → wrong passcode
     'misconf'   → server is missing FINALS_ADMIN_SECRET
     'network'   → couldn't reach the server
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
    console.error('verify network error', e);
    return { kind: 'network', message: e.message || 'Network error' };
  }
  let payload = {};
  try { payload = await resp.json(); } catch (_) {}
  if (resp.status === 200) return { kind: 'ok' };
  if (resp.status === 401) return { kind: 'wrong' };
  if (resp.status === 500) return { kind: 'misconf', message: payload.error || 'Server error' };
  return { kind: 'wrong', message: payload.error || `HTTP ${resp.status}` };
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = gateInput.value;
  if (!input) return;

  gateSubmit.disabled = true;
  gateInput.disabled = true;
  gateSubmit.textContent = 'Checking…';
  setGateStatus('info', 'Checking passcode…');

  const result = await verifyPasscode(input);

  gateSubmit.disabled = false;
  gateInput.disabled = false;
  gateSubmit.textContent = 'Unlock';

  if (result.kind === 'ok') {
    setGateStatus('ok', '✓ Correct — unlocking…');
    setPasscode(input);
    setTimeout(showApp, 400);
    return;
  }
  if (result.kind === 'wrong') {
    setGateStatus('err', '✗ Wrong passcode. Try again.');
    gateInput.select();
    return;
  }
  if (result.kind === 'misconf') {
    setGateStatus('err',
      'Server misconfigured: FINALS_ADMIN_SECRET is not set in Vercel. Set it in Project Settings → Environment Variables, then redeploy.');
    return;
  }
  setGateStatus('err', 'Could not reach the server (' + (result.message || 'network error') + ').');
});

document.getElementById('admin-signout').addEventListener('click', () => {
  clearPasscode();
  showGate();
});

if (getPasscode()) showApp(); else showGate();

/* ==========================================================================
   Admin app
   ========================================================================== */
const cardsEl       = document.getElementById('admin-cards');
const emptyEl       = document.getElementById('admin-empty');
const searchEl      = document.getElementById('admin-search');
const statCount     = document.getElementById('stat-count');
const statSize      = document.getElementById('stat-size');
const statNotes     = document.getElementById('stat-notes');
const statMocks     = document.getElementById('stat-mocks');
const subjectListEl = document.getElementById('subject-breakdown');
const recentListEl  = document.getElementById('recent-list');

let allNotes = [];
let unsub = null;

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

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderCards() {
  const q = (searchEl.value || '').trim().toLowerCase();
  const filtered = q
    ? allNotes.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.uploaderName || '').toLowerCase().includes(q) ||
        (n.subject || '').toLowerCase().includes(q))
    : allNotes;

  if (filtered.length === 0) {
    cardsEl.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = allNotes.length === 0
      ? 'No notes uploaded yet.'
      : 'No matches.';
    cardsEl.appendChild(emptyEl);
    return;
  }

  emptyEl.style.display = 'none';
  cardsEl.innerHTML = filtered.map(n => {
    const typeLabel = n.type === 'mock_paper' ? 'Mock Paper' : 'Notes';
    const typeClass = n.type === 'mock_paper' ? 'mock_paper' : 'notes';
    return `
      <div class="admin-card" data-id="${escapeHtml(n.id)}">
        <div class="admin-card-top">
          <div class="admin-card-title">${escapeHtml(n.title || '(untitled)')}</div>
          <div class="note-type ${typeClass}">${typeLabel}</div>
        </div>
        <div class="admin-card-meta">
          <span><strong>${escapeHtml(n.subject || '—')}</strong></span>
          <span>·</span>
          <span>by ${escapeHtml(n.uploaderName || 'Anonymous')}</span>
          <span>·</span>
          <span>${fmtBytes(n.fileSize)}</span>
          <span>·</span>
          <span title="${escapeHtml(fmtDate(n.createdAt))}">${escapeHtml(fmtRelative(n.createdAt))}</span>
        </div>
        ${n.description ? `<div class="admin-card-desc">${escapeHtml(n.description)}</div>` : ''}
        <div class="admin-card-actions">
          <a class="btn-secondary" href="${escapeHtml(n.downloadUrl || '#')}" target="_blank" rel="noopener">Open</a>
          <button class="btn-primary" data-action="edit">Edit title</button>
          <button class="btn-primary btn-danger" data-action="delete">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderStats() {
  statCount.textContent = allNotes.length;
  statSize.textContent  = fmtBytes(allNotes.reduce((sum, n) => sum + (n.fileSize || 0), 0));
  statNotes.textContent = allNotes.filter(n => n.type !== 'mock_paper').length;
  statMocks.textContent = allNotes.filter(n => n.type === 'mock_paper').length;

  // Subject breakdown
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
            <span class="subject-name">${escapeHtml(name)}</span>
            <span class="subject-count">${count}</span>
          </div>
          <div class="subject-bar"><div class="subject-bar-fill" style="width:${pct}%;"></div></div>
        </li>
      `;
    }).join('');
  }

  // Recent uploads (top 5 by createdAt desc — list is already sorted that way)
  const recent = allNotes.slice(0, 5);
  if (recent.length === 0) {
    recentListEl.innerHTML = '<li class="empty-state-small">No recent uploads.</li>';
  } else {
    recentListEl.innerHTML = recent.map(n => `
      <li class="recent-row">
        <div class="recent-title">${escapeHtml(n.title || '(untitled)')}</div>
        <div class="recent-meta">
          <span>${escapeHtml(n.uploaderName || '—')}</span>
          <span>·</span>
          <span>${escapeHtml(fmtRelative(n.createdAt))}</span>
        </div>
      </li>
    `).join('');
  }
}

function startAdmin() {
  if (unsub) return;
  unsub = onSnapshot(
    query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
    (snap) => {
      allNotes = [];
      snap.forEach(d => allNotes.push({ id: d.id, ...d.data() }));
      renderStats();
      renderCards();
    },
    (err) => {
      console.error('notes listener:', err);
      cardsEl.innerHTML = `<div class="empty-state" style="color:#b91c1c;">Failed to load notes: ${escapeHtml(err.message || String(err))}</div>`;
    }
  );
}

searchEl.addEventListener('input', renderCards);

/* ==========================================================================
   Modals — edit + delete
   ========================================================================== */
const editModal = document.getElementById('edit-modal');
const editTitleInput = document.getElementById('edit-title-input');
const editModalMeta = document.getElementById('edit-modal-meta');
const editSaveBtn = document.getElementById('edit-save-btn');

const deleteModal = document.getElementById('delete-modal');
const deleteNoteTitleEl = document.getElementById('delete-note-title');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

let activeNoteId = null;

function openEditModal(note) {
  activeNoteId = note.id;
  editTitleInput.value = note.title || '';
  editModalMeta.textContent = `${note.subject || '—'} · by ${note.uploaderName || 'Anonymous'} · ${fmtBytes(note.fileSize)}`;
  editSaveBtn.disabled = false;
  editSaveBtn.textContent = 'Save';
  editModal.style.display = 'flex';
  setTimeout(() => { editTitleInput.focus(); editTitleInput.select(); }, 0);
}

function openDeleteModal(note) {
  activeNoteId = note.id;
  deleteNoteTitleEl.textContent = note.title || '(untitled)';
  deleteConfirmBtn.disabled = false;
  deleteConfirmBtn.textContent = 'Delete';
  deleteModal.style.display = 'flex';
}

function closeModal(modal) {
  modal.style.display = 'none';
  activeNoteId = null;
}

// Click-outside / X / cancel to close.
[editModal, deleteModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    const closeRole = e.target.dataset.close;
    if (!closeRole) return;
    if (closeRole === 'overlay' && e.target !== modal) return;
    closeModal(modal);
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (editModal.style.display === 'flex') closeModal(editModal);
  if (deleteModal.style.display === 'flex') closeModal(deleteModal);
});

editSaveBtn.addEventListener('click', async () => {
  if (!activeNoteId) return;
  const note = allNotes.find(n => n.id === activeNoteId);
  if (!note) { closeModal(editModal); return; }
  const newTitle = editTitleInput.value.trim();
  if (!newTitle) { editTitleInput.focus(); return; }
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
          showGate('Your session expired — sign in again.');
          return;
        }
        throw new Error(result.error || `HTTP ${resp.status}`);
      }
    }
    await deleteDoc(doc(db, 'notes', note.id));
    closeModal(deleteModal);
    // The snapshot listener will rerender.
  } catch (err) {
    deleteConfirmBtn.disabled = false;
    deleteConfirmBtn.textContent = 'Delete';
    alert('Delete failed: ' + (err.message || err));
  }
});

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
