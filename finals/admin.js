// Finals admin — passcode-gated note management.
// Pattern mirrors roster/roster.js (admin passcode constant + sessionStorage
// flag). The passcode is intentionally separate so a leak doesn't compromise
// the roster admin.
import {
  db, storage,
  collection, doc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp,
  ref, deleteObject
} from './firebase-init.js';

const ADMIN_PASSCODE = '20260612finals';
const ADMIN_SESSION_KEY = 'finals.adminAuthed';

const gateEl = document.getElementById('gate');
const appEl  = document.getElementById('admin-app');
const gateForm = document.getElementById('gate-form');
const gateInput = document.getElementById('gate-passcode');
const gateError = document.getElementById('gate-error');

function isAuthed() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; }
function setAuthed() { sessionStorage.setItem(ADMIN_SESSION_KEY, '1'); }
function clearAuthed() { sessionStorage.removeItem(ADMIN_SESSION_KEY); }

function showApp() {
  gateEl.style.display = 'none';
  appEl.style.display = 'block';
  startAdmin();
}

function showGate() {
  gateEl.style.display = 'block';
  appEl.style.display = 'none';
  setTimeout(() => gateInput && gateInput.focus(), 0);
}

gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (gateInput.value === ADMIN_PASSCODE) {
    setAuthed();
    gateError.style.display = 'none';
    showApp();
  } else {
    gateError.style.display = 'block';
    gateInput.select();
  }
});

document.getElementById('admin-signout').addEventListener('click', () => {
  clearAuthed();
  showGate();
});

if (isAuthed()) showApp(); else showGate();

/* ==========================================================================
   Admin app
   ========================================================================== */
const tbody = document.getElementById('admin-tbody');
const searchEl = document.getElementById('admin-search');
const statCount = document.getElementById('stat-count');
const statSize  = document.getElementById('stat-size');
const statNotes = document.getElementById('stat-notes');
const statMocks = document.getElementById('stat-mocks');

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

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderTable() {
  const q = (searchEl.value || '').trim().toLowerCase();
  const filtered = q
    ? allNotes.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.uploaderName || '').toLowerCase().includes(q))
    : allNotes;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:30px 0;">${
      allNotes.length === 0 ? 'No notes uploaded yet.' : 'No matches.'
    }</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(n => {
    const typeLabel = n.type === 'mock_paper' ? 'Mock Paper' : 'Notes';
    return `
      <tr data-id="${escapeHtml(n.id)}">
        <td class="title-cell">
          <input type="text" data-role="title" value="${escapeHtml(n.title || '')}" maxlength="200" />
        </td>
        <td>${escapeHtml(n.subject || '')}</td>
        <td>${typeLabel}</td>
        <td>${escapeHtml(n.uploaderName || '')}</td>
        <td>${fmtBytes(n.fileSize)}</td>
        <td>${escapeHtml(fmtDate(n.createdAt))}</td>
        <td class="actions">
          <a class="btn-secondary" href="${escapeHtml(n.downloadUrl || '#')}" target="_blank" rel="noopener">Open</a>
          <button class="btn-primary" data-action="save">Save</button>
          <button class="btn-primary btn-danger" data-action="delete">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderStats() {
  statCount.textContent = allNotes.length;
  statSize.textContent  = fmtBytes(allNotes.reduce((sum, n) => sum + (n.fileSize || 0), 0));
  statNotes.textContent = allNotes.filter(n => n.type !== 'mock_paper').length;
  statMocks.textContent = allNotes.filter(n => n.type === 'mock_paper').length;
}

function startAdmin() {
  if (unsub) return;
  unsub = onSnapshot(
    query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
    (snap) => {
      allNotes = [];
      snap.forEach(d => allNotes.push({ id: d.id, ...d.data() }));
      renderStats();
      renderTable();
    },
    (err) => {
      console.error('notes listener:', err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#b91c1c;padding:30px 0;">Failed to load notes: ${escapeHtml(err.message || String(err))}</td></tr>`;
    }
  );
}

searchEl.addEventListener('input', renderTable);

tbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const tr = btn.closest('tr');
  const id = tr.dataset.id;
  const note = allNotes.find(n => n.id === id);
  if (!note) return;

  const action = btn.dataset.action;

  if (action === 'save') {
    const newTitle = tr.querySelector('input[data-role="title"]').value.trim();
    if (!newTitle) { alert('Title cannot be empty.'); return; }
    if (newTitle === note.title) { return; }
    btn.disabled = true;
    try {
      await updateDoc(doc(db, 'notes', id), {
        title: newTitle,
        editedAt: serverTimestamp()
      });
      btn.textContent = 'Saved';
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1200);
    } catch (err) {
      alert('Save failed: ' + (err.message || err));
      btn.disabled = false;
    }
    return;
  }

  if (action === 'delete') {
    const ok = confirm(`Delete "${note.title}"?\n\nThis removes the file and metadata permanently.`);
    if (!ok) return;
    btn.disabled = true;
    try {
      if (note.filePath) {
        try { await deleteObject(ref(storage, note.filePath)); }
        catch (e) {
          if (e && e.code !== 'storage/object-not-found') throw e;
        }
      }
      await deleteDoc(doc(db, 'notes', id));
      // The snapshot listener will rerender.
    } catch (err) {
      alert('Delete failed: ' + (err.message || err));
      btn.disabled = false;
    }
    return;
  }
});
