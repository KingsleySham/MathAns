// Finals Study Hub — main client logic.
// Sections: countdown, tab routing, notes upload + browse, timer (pomodoro,
// custom countdown, stopwatch).
import {
  db,
  collection, addDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp,
  doc, increment
} from './firebase-init.js';
import { TIMETABLE, COVERAGE as DEFAULT_COVERAGE } from './exam-data.js';

// Coverage starts from the static default and gets replaced by the
// admin-managed copy in /state/coverage once it loads.
let COVERAGE = DEFAULT_COVERAGE;

/* ==========================================================================
   Countdown to finals
   Period: 2026-06-01 08:30 HKT → 2026-06-12 12:30 HKT (HKT = UTC+8)
   Date.UTC(2026, 5, 1, 0, 30)  → June 1, 00:30 UTC = 08:30 HKT
   Date.UTC(2026, 5, 12, 4, 30) → June 12, 04:30 UTC = 12:30 HKT
   ========================================================================== */
const EXAM_START_MS = Date.UTC(2026, 5, 1, 0, 30);
const EXAM_END_MS   = Date.UTC(2026, 5, 12, 4, 30);

function fmtUnit(n) { return String(Math.max(0, Math.floor(n))).padStart(2, '0'); }

function renderCountdown() {
  const now = Date.now();
  const card = document.getElementById('countdown-card');
  const label = document.getElementById('countdown-label');
  const sub = document.getElementById('countdown-sub');
  const dEl = document.getElementById('cd-days');
  const hEl = document.getElementById('cd-hours');
  const mEl = document.getElementById('cd-mins');
  const sEl = document.getElementById('cd-secs');

  let targetMs, state;
  if (now < EXAM_START_MS) {
    targetMs = EXAM_START_MS - now;
    state = 'pre';
    card.classList.remove('live', 'done');
    label.textContent = 'Time until finals begin';
    sub.textContent = 'Exam period: 1 Jun 08:30 → 12 Jun 12:30 (HKT)';
  } else if (now < EXAM_END_MS) {
    targetMs = EXAM_END_MS - now;
    state = 'live';
    card.classList.add('live');
    card.classList.remove('done');
    label.textContent = 'Finals in progress — time until last paper ends';
    sub.textContent = 'You\'ve got this. 加油！';
  } else {
    state = 'done';
    card.classList.add('done');
    card.classList.remove('live');
    label.textContent = 'Finals are over 🎉';
    sub.textContent = 'Enjoy your break — you earned it.';
    dEl.textContent = '00'; hEl.textContent = '00'; mEl.textContent = '00'; sEl.textContent = '00';
    return;
  }

  const totalSec = Math.floor(targetMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  dEl.textContent = fmtUnit(days);
  hEl.textContent = fmtUnit(hours);
  mEl.textContent = fmtUnit(mins);
  sEl.textContent = fmtUnit(secs);
}

renderCountdown();
setInterval(renderCountdown, 1000);

/* ==========================================================================
   Main tabs (Notes / Maths / Timer)
   ========================================================================== */
document.getElementById('main-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.main-tab');
  if (!btn) return;
  const target = btn.dataset.tab;
  document.querySelectorAll('.main-tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + target);
  });
  if (target === 'maths') ensureMathsInitialized();
});

/* ==========================================================================
   Notes — upload
   ========================================================================== */
const NAME_KEY = 'finals.uploaderName';

const nameInput = document.getElementById('uploader-name');
nameInput.value = localStorage.getItem(NAME_KEY) || '';
nameInput.addEventListener('change', () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
});

const uploadToggle = document.getElementById('upload-toggle');
const uploadCollapse = document.getElementById('upload-collapse');
function setUploadOpen(open) {
  uploadToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  uploadCollapse.hidden = !open;
  uploadToggle.querySelector('.upload-toggle-text').textContent =
    open ? 'Hide upload form' : 'Share notes or a mock paper';
  if (open) {
    setTimeout(() => {
      const firstEmpty = !nameInput.value
        ? nameInput
        : document.getElementById('note-title');
      firstEmpty.focus({ preventScroll: false });
    }, 100);
  }
}
uploadToggle.addEventListener('click', () => {
  setUploadOpen(uploadToggle.getAttribute('aria-expanded') !== 'true');
});

const uploadForm = document.getElementById('upload-form');
const uploadBtn = document.getElementById('upload-btn');
const progressBox = document.getElementById('upload-progress');
const progressFill = document.getElementById('upload-progress-fill');
const progressText = document.getElementById('upload-progress-text');
const statusEl = document.getElementById('upload-status');

const MAX_BYTES = 3 * 1024 * 1024;   // Vercel serverless body cap (4.5 MB) + base64 overhead
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'html', 'htm'];

function setStatus(msg, kind) {
  statusEl.textContent = msg || '';
  statusEl.className = 'upload-status' + (kind ? ' ' + kind : '');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // dataURL like "data:application/pdf;base64,XXXX"
      const s = String(reader.result || '');
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 50;          // first half: read
        progressFill.style.width = pct.toFixed(1) + '%';
        progressText.textContent = Math.round(pct) + '%';
      }
    };
    reader.readAsDataURL(file);
  });
}

/* Quizlet URL → set ID extraction. Supports:
     https://quizlet.com/123456789/foo-flash-cards/
     https://quizlet.com/123456789
     https://quizlet.com/set/123456789/foo
     https://www.quizlet.com/...
*/
function parseQuizletUrl(url) {
  const m = String(url || '').trim().match(/^https?:\/\/(?:www\.)?quizlet\.com\/(?:set\/)?(\d{4,})/i);
  return m ? m[1] : null;
}

/* Google Docs / Drive URL validation. */
function isGdocsUrl(url) {
  return /^https?:\/\/(?:docs|drive)\.google\.com\//i.test(String(url || '').trim());
}
function gdocsKind(url) {
  const u = String(url || '');
  if (u.includes('docs.google.com/document'))     return 'document';
  if (u.includes('docs.google.com/spreadsheets')) return 'spreadsheet';
  if (u.includes('docs.google.com/presentation')) return 'presentation';
  if (u.includes('drive.google.com'))             return 'drive';
  return 'gdocs';
}

const typeSelect = document.getElementById('note-type');
const fileRow = document.getElementById('note-file-row');
const quizletRow = document.getElementById('note-quizlet-row');
const gdocsRow = document.getElementById('note-gdocs-row');
function syncTypeUI() {
  // Notes and Mock Paper both show file + gdocs + quizlet rows.
  // (Flashcards is no longer a separate type — it's an optional link.)
  fileRow.style.display    = '';
  gdocsRow.style.display   = '';
  quizletRow.style.display = '';
}
typeSelect.addEventListener('change', syncTypeUI);
syncTypeUI();

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  const name = nameInput.value.trim();
  const title = document.getElementById('note-title').value.trim();
  const subject = document.getElementById('note-subject').value;
  const type = typeSelect.value;
  const description = document.getElementById('note-desc').value.trim();
  const folderId = document.getElementById('note-folder').value || null;

  if (!name) { setStatus('Please enter your name.', 'err'); return; }
  if (!title) { setStatus('Please enter a title.', 'err'); return; }

  return submitFile({ name, title, subject, type, description, folderId });
});

// Legacy stub kept so any external caller that referenced this name
// doesn't blow up; new uploads go through submitFile.
async function submitFlashcards({ name, title, subject, description, folderId }) {
  const url = document.getElementById('note-quizlet-url').value.trim();
  if (!url) { setStatus('Please paste a Quizlet URL.', 'err'); return; }
  const setId = parseQuizletUrl(url);
  if (!setId) {
    setStatus('That doesn\'t look like a Quizlet URL. It should look like https://quizlet.com/123456789/...', 'err');
    return;
  }

  uploadBtn.disabled = true;
  progressBox.style.display = 'flex';
  progressFill.style.width = '50%';
  progressText.textContent = '50%';
  setStatus('Saving…');

  try {
    await addDoc(collection(db, 'notes'), {
      title,
      description,
      uploaderName: name,
      subject,
      type: 'flashcards',
      folderId,
      quizletUrl: url,
      quizletSetId: setId,
      createdAt: serverTimestamp()
    });

    progressFill.style.width = '100%';
    progressText.textContent = '100%';
    setStatus('Saved! Thanks for sharing.', 'ok');
    uploadForm.reset();
    nameInput.value = name;
    document.getElementById('note-subject').value = subject;
    typeSelect.value = 'notes';
    syncTypeUI();
    setTimeout(() => {
      progressBox.style.display = 'none';
      setUploadOpen(false);
      setStatus('');
    }, 1600);
  } catch (err) {
    console.error(err);
    setStatus('Save failed: ' + (err && err.message ? err.message : err), 'err');
    progressBox.style.display = 'none';
  } finally {
    uploadBtn.disabled = false;
  }
}

async function submitFile({ name, title, subject, type, description, folderId }) {
  const fileInput = document.getElementById('note-file');
  const file = fileInput.files && fileInput.files[0];
  const gdocsUrlRaw = document.getElementById('note-gdocs-url').value.trim();
  const quizletUrlRaw = document.getElementById('note-quizlet-url').value.trim();

  // At least one of file / gdocs / quizlet must be present.
  if (!file && !gdocsUrlRaw && !quizletUrlRaw) {
    setStatus('Add a file, a Google Docs link, a Quizlet link, or any combination.', 'err');
    return;
  }
  if (gdocsUrlRaw && !isGdocsUrl(gdocsUrlRaw)) {
    setStatus('Google Docs link must start with https://docs.google.com/ or https://drive.google.com/.', 'err');
    return;
  }
  let quizletSetId = null;
  if (quizletUrlRaw) {
    quizletSetId = parseQuizletUrl(quizletUrlRaw);
    if (!quizletSetId) {
      setStatus('That doesn\'t look like a Quizlet URL. It should look like https://quizlet.com/123456789/...', 'err');
      return;
    }
  }
  if (file) {
    if (file.size > MAX_BYTES) {
      setStatus('File is larger than 3 MB. Try compressing the PDF first.', 'err');
      return;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setStatus('Unsupported file type. Allowed: ' + ALLOWED_EXT.join(', '), 'err');
      return;
    }
  }

  uploadBtn.disabled = true;
  progressBox.style.display = 'flex';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  setStatus(file ? 'Reading file…' : 'Saving…');

  try {
    const docData = {
      title,
      description,
      uploaderName: name,
      subject,
      type,
      folderId,
      createdAt: serverTimestamp()
    };

    if (file) {
      const fileBase64 = await fileToBase64(file);
      progressFill.style.width = '55%';
      progressText.textContent = '55%';
      setStatus('Uploading…');

      const resp = await fetch('/api/upload-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploaderName: name, title, subject, type, description,
          fileName: file.name, fileMime: file.type || '', fileBase64
        })
      });
      progressFill.style.width = '85%';
      progressText.textContent = '85%';

      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || !result.ok) {
        throw new Error(result.error || `HTTP ${resp.status}`);
      }

      docData.fileName = file.name;
      docData.filePath = result.filePath;
      docData.fileSize = result.fileSize || file.size;
      docData.fileMime = file.type || '';
      docData.downloadUrl = result.downloadUrl;
    } else {
      // No file → just bump the bar so the user sees progress on the
      // Firestore write below.
      progressFill.style.width = '60%';
      progressText.textContent = '60%';
    }

    if (gdocsUrlRaw) {
      docData.gdocsUrl = gdocsUrlRaw;
      docData.gdocsKind = gdocsKind(gdocsUrlRaw);
    }
    if (quizletUrlRaw) {
      docData.quizletUrl = quizletUrlRaw;
      docData.quizletSetId = quizletSetId;
    }

    await addDoc(collection(db, 'notes'), docData);

    progressFill.style.width = '100%';
    progressText.textContent = '100%';
    setStatus(file ? 'Uploaded! Thanks for sharing.' : 'Saved! Thanks for sharing.', 'ok');
    uploadForm.reset();
    nameInput.value = name;
    document.getElementById('note-subject').value = subject;
    typeSelect.value = type;
    syncTypeUI();
    setTimeout(() => {
      progressBox.style.display = 'none';
      setUploadOpen(false);
      setStatus('');
    }, 1600);
  } catch (err) {
    console.error(err);
    setStatus('Upload failed: ' + (err && err.message ? err.message : err), 'err');
    progressBox.style.display = 'none';
  } finally {
    uploadBtn.disabled = false;
  }
}

/* ==========================================================================
   Notes — browse
   ========================================================================== */
const notesListEl = document.getElementById('notes-list');
const notesEmpty = document.getElementById('notes-empty');
const filterSubjectEl = document.getElementById('filter-subject');
const filterTypeEl = document.getElementById('filter-type');

let allNotes = [];

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
  const now = Date.now();
  const diff = now - d.getTime();
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

/* Folders — flat list from Firestore, transformed into a tree client-side.
   `folderTree` is keyed by folder id; each node has { id, name, parentId,
   children: [id…], depth, path: 'Parent / Child' }. */
let allFolders = [];
let folderById = new Map();
let folderLinear = [];
const noteFolderEl = document.getElementById('note-folder');

/* View mode (All vs Browse-by-folder) — persisted to localStorage so a
   returning visitor lands on whatever they last picked. */
const VIEW_MODE_KEY = 'finals.viewMode';
// Folder browsing is the only mode now — 'View all' was removed so
// every note must live in a folder. Any previously persisted
// preference is ignored.
let viewMode = 'folders';
let currentFolderId = null;   // null = root level in folder browser

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

  // Linear order — depth-first, alphabetical at each level.
  const linear = [];
  function walk(id) {
    const node = folderById.get(id);
    if (!node) return;
    linear.push(node);
    node.children.forEach(walk);
  }
  roots.forEach(walk);
  return linear;
}

function populateFolderSelects(linear) {
  folderLinear = linear;
  if (!noteFolderEl) return;
  const prevValue = noteFolderEl.value;
  noteFolderEl.innerHTML = `<option value="">— No folder —</option>`;
  linear.forEach(node => {
    const opt = document.createElement('option');
    opt.value = node.id;
    opt.textContent = '—'.repeat(node.depth) + (node.depth ? ' ' : '') + node.name;
    noteFolderEl.appendChild(opt);
  });
  if (prevValue && folderById.has(prevValue)) noteFolderEl.value = prevValue;
}

/* Compact Google Docs button — used wherever a note has a gdocsUrl
   set (the field is now optional alongside file uploads). The big
   variant from the previous design is gone; instead, the button sits
   alongside Download/View like the other action buttons. */
function gdocsButtonHTML(compact) {
  return `
    <button class="gdocs-btn${compact ? ' gdocs-btn-compact' : ''}" data-action="gdocs-open">
      <span class="gdocs-btn-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="${compact ? 16 : 22}" height="${compact ? 16 : 22}">
          <path fill="#4285f4" d="M21.6 12.227c0-.708-.058-1.39-.166-2.045H12v3.87h5.385a4.6 4.6 0 0 1-1.996 3.016v2.508h3.227c1.886-1.737 2.984-4.295 2.984-7.349z"/>
          <path fill="#34a853" d="M12 22c2.7 0 4.964-.895 6.616-2.424l-3.227-2.508c-.895.6-2.037.953-3.389.953-2.603 0-4.806-1.756-5.59-4.12H3.07v2.59A9.997 9.997 0 0 0 12 22z"/>
          <path fill="#fbbc05" d="M6.41 13.901A6.013 6.013 0 0 1 6.09 12c0-.66.114-1.302.32-1.901V7.508H3.07A9.997 9.997 0 0 0 2 12c0 1.614.386 3.14 1.07 4.49l3.34-2.589z"/>
          <path fill="#ea4335" d="M12 5.977c1.47 0 2.788.505 3.826 1.498l2.866-2.866C16.96 2.99 14.696 2 12 2 8.087 2 4.705 4.244 3.07 7.508l3.34 2.59C7.194 7.734 9.397 5.977 12 5.977z"/>
        </svg>
      </span>
      <span class="gdocs-btn-label">View via Google Workspace</span>
    </button>
  `;
}

function quizletButtonHTML(url) {
  // Anchor with target=_blank — preserved so popup blockers never
  // intervene; the click handler intercepts it and shows the
  // warning popup, then opens the URL via openInNewTab(). Blue "Q"
  // roundel (Quizlet brand blue).
  return `
    <a class="quizlet-btn" data-action="quizlet-open" href="${escapeHtml(url || '#')}" target="_blank" rel="noopener">
      <span class="quizlet-btn-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#2563eb"/>
          <text x="12" y="17.5" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="800" fill="white" text-anchor="middle">Q</text>
        </svg>
      </span>
      <span class="quizlet-btn-label">Flashcards</span>
    </a>
  `;
}

function noteCardHTML(n, opts) {
  const typeMeta = noteTypeMeta(n.type);
  const folderNode = n.folderId ? folderById.get(n.folderId) : null;
  const hasFile = !!n.downloadUrl;
  const hasGdocs = !!n.gdocsUrl;
  const hasQuizlet = !!n.quizletUrl;
  const canPreview = hasFile && isPreviewable(n.fileName);
  const showFolder = opts && opts.showFolder !== false;

  // Pick what to show in the meta line as the "primary" identifier.
  let sizeOrId = '';
  if (hasFile)              sizeOrId = fmtBytes(n.fileSize);
  else if (hasGdocs)        sizeOrId = `Google ${({document:'Doc',spreadsheet:'Sheet',presentation:'Slides',drive:'Drive'})[n.gdocsKind] || 'Docs'}`;
  else if (hasQuizlet)      sizeOrId = `Quizlet · #${escapeHtml(n.quizletSetId || '')}`;

  // Actions in a consistent order: View, Download, Fullscreen, Google, Quizlet.
  const actions = [];
  if (canPreview)  actions.push(`<button class="btn-primary" data-action="view">View</button>`);
  if (hasFile)     actions.push(`<a class="btn-secondary" data-action="download" href="${escapeHtml(n.downloadUrl)}" target="_blank" rel="noopener" download="${escapeHtml(n.fileName)}">Download</a>`);
  if (hasFile && isHtmlFile(n.fileName)) {
    actions.push(`<a class="btn-fullscreen" data-action="fullscreen-open" href="/view/${encodeURIComponent(n.id)}" target="_blank" rel="noopener" aria-label="Open in fullscreen" title="Open in fullscreen"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" fill="currentColor"/></svg></a>`);
  }
  if (hasGdocs)    actions.push(gdocsButtonHTML(actions.length > 0));
  if (hasQuizlet)  actions.push(quizletButtonHTML(n.quizletUrl));

  return `
    <div class="note-card${hasQuizlet ? ' note-card-flashcards' : ''}" data-id="${escapeHtml(n.id)}">
      <div class="note-card-top">
        <div class="note-title">${escapeHtml(n.title)}</div>
        <div class="note-type ${typeMeta.cls}">${typeMeta.label}</div>
      </div>
      <div class="note-meta">
        <span>${escapeHtml(n.subject || '—')}</span>
        <span>·</span>
        <span>by ${escapeHtml(n.uploaderName || 'Anonymous')}</span>
        <span>·</span>
        ${sizeOrId ? `<span>${sizeOrId}</span><span>·</span>` : ''}
        <span>${escapeHtml(fmtDate(n.createdAt))}</span>
      </div>
      ${showFolder && folderNode ? `<div class="note-folder">📁 ${escapeHtml(folderNode.path)}</div>` : ''}
      ${n.description ? `<div class="note-desc">${escapeHtml(n.description)}</div>` : ''}
      ${Array.isArray(n.tags) && n.tags.length ? `<div class="note-tags">${n.tags.map(t => `<span class="note-tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="note-actions">${actions.join('')}</div>
    </div>
  `;
}

function renderNotes() {
  const subjectFilter = filterSubjectEl.value;
  const typeFilter = filterTypeEl.value;

  const filtered = allNotes.filter(n => {
    if (subjectFilter && n.subject !== subjectFilter) return false;
    if (typeFilter && n.type !== typeFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    notesListEl.innerHTML = '';
    notesEmpty.style.display = 'block';
    notesEmpty.textContent = allNotes.length === 0
      ? 'No notes yet. Be the first to share!'
      : 'No notes match these filters.';
    notesListEl.appendChild(notesEmpty);
    return;
  }

  notesEmpty.style.display = 'none';
  notesListEl.innerHTML = filtered.map(n => noteCardHTML(n)).join('');
}

// Admin-added types from the noteTypes Firestore collection. Keyed by the
// value used on note docs. Updated via subscription below.
const customTypeMap = new Map();

function noteTypeMeta(type) {
  if (type === 'mock_paper') return { label: 'Mock Paper', cls: 'mock_paper' };
  const custom = customTypeMap.get(type);
  if (custom) return { label: custom, cls: 'custom' };
  // Legacy 'flashcards' / 'gdocs' types from earlier versions still
  // read — display them as Notes since they're no longer creation
  // categories.
  return { label: 'Notes', cls: 'notes' };
}

function isPreviewable(fileName) {
  const ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
  return ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'doc', 'docx', 'html', 'htm'].includes(ext);
}

function isHtmlFile(fileName) {
  const ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
  return ext === 'html' || ext === 'htm';
}

/* Click tracking — every action click increments a per-note Firestore
   counter. Admin sessions are skipped so my own clicks don't pollute
   the numbers. */
const CLICK_FIELDS = {
  'view':            'clicksView',
  'download':        'clicksDownload',
  'gdocs-open':      'clicksGdocs',
  'quizlet-open':    'clicksQuizlet',
  'fullscreen-open': 'clicksFullscreen',
};
function isAdminSignedIn() {
  try { return !!sessionStorage.getItem('finals.adminPasscode'); }
  catch (_) { return false; }
}

// Reveal the floating "🛡 Admin" badge in the header when an admin
// session is active. Clicking the badge navigates to /admin. Also
// toggle which "share" affordance is shown: admin sees the full
// upload card; everyone else sees a 'Request from admin' button.
(function applyAdminUI() {
  const admin = isAdminSignedIn();
  const badge = document.getElementById('admin-badge');
  if (admin && badge) badge.hidden = false;

  // Upload form is admin-only now (students can't add notes/papers).
  const uploadCard = document.getElementById('upload-card');
  if (uploadCard) uploadCard.hidden = !admin;

  // Request card is the opposite — visible to everyone EXCEPT admin
  // (admin uses the upload form directly).
  const requestCard = document.getElementById('request-card');
  if (requestCard) requestCard.hidden = admin;
})();
function trackClick(noteId, action) {
  if (isAdminSignedIn()) return;
  const field = CLICK_FIELDS[action];
  if (!field || !noteId) return;
  updateDoc(doc(db, 'notes', noteId), { [field]: increment(1) })
    .catch(err => console.warn('[clicks] track failed:', err));
}

notesListEl.addEventListener('click', (e) => {
  const card = e.target.closest('.note-card');
  if (!card) return;
  const note = allNotes.find(n => n.id === card.dataset.id);
  if (!note) return;
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  trackClick(note.id, action);
  if (action === 'gdocs-open')   { e.preventDefault(); return openGdocs(note); }
  if (action === 'quizlet-open' && !getQuizletWarnSkipped()) {
    e.preventDefault();
    return openQuizlet(note);
  }
  if (action === 'view')         return openViewer(note);
  // 'download' and 'quizlet-open' (when warn skipped) navigate natively.
});

filterSubjectEl.addEventListener('change', renderNotes);
filterTypeEl.addEventListener('change', renderNotes);

/* ──────────────────────────────────────────────────────────────────────────
   View mode (All notes vs Browse by folder) + folder browser rendering.
   ────────────────────────────────────────────────────────────────────────── */
const viewModeTabsEl = document.getElementById('view-mode-tabs');
const viewAllEl      = document.getElementById('view-all');
const viewFoldersEl  = document.getElementById('view-folders');
const folderBreadcrumbEl     = document.getElementById('folder-breadcrumb');
const folderChildrenListEl   = document.getElementById('folder-children-list');
const folderChildrenSection  = document.getElementById('folder-children-section');
const folderChildrenHead     = document.getElementById('folder-children-head');
const folderNotesListEl      = document.getElementById('folder-notes-list');
const folderNotesEmpty       = document.getElementById('folder-notes-empty');
const folderNotesHead        = document.getElementById('folder-notes-head');

function setViewMode(_mode) {
  // Folder-only — argument is ignored. Stays in place so any caller
  // (notably the existing onSnapshot handler) keeps working.
  viewMode = 'folders';
  if (viewAllEl)     viewAllEl.style.display = 'none';
  if (viewFoldersEl) viewFoldersEl.style.display = '';
  renderFolderBrowser();
}

viewModeTabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.view-mode-tab');
  if (!btn) return;
  setViewMode(btn.dataset.view);
});

function enterFolder(folderId) {
  // CES has its own dedicated page (/finals/ces) — clicking a folder
  // named exactly "CES" at any level jumps there instead of opening
  // it in the in-page browser.
  if (folderId) {
    const node = folderById.get(folderId);
    if (node && /^ces$/i.test((node.name || '').trim())) {
      window.location.href = '/finals/ces';
      return;
    }
  }
  currentFolderId = folderId || null;
  renderFolderBrowser();
}

function renderFolderBrowser() {
  // Breadcrumb
  const trail = [];
  let cur = currentFolderId ? folderById.get(currentFolderId) : null;
  while (cur) {
    trail.unshift(cur);
    cur = cur.parentId ? folderById.get(cur.parentId) : null;
  }
  let crumbsHtml = `<a class="folder-crumb" href="#" data-folder-nav="">All folders</a>`;
  trail.forEach((node, i) => {
    crumbsHtml += `<span class="folder-crumb-sep">›</span>`;
    if (i === trail.length - 1) {
      crumbsHtml += `<span class="folder-crumb current">${escapeHtml(node.name)}</span>`;
    } else {
      crumbsHtml += `<a class="folder-crumb" href="#" data-folder-nav="${escapeHtml(node.id)}">${escapeHtml(node.name)}</a>`;
    }
  });
  folderBreadcrumbEl.innerHTML = crumbsHtml;

  // Subfolders at this level
  const children = currentFolderId
    ? (folderById.get(currentFolderId) || { children: [] }).children.map(id => folderById.get(id)).filter(Boolean)
    : folderLinear.filter(n => !n.parentId || !folderById.has(n.parentId));

  if (children.length === 0) {
    folderChildrenSection.style.display = 'none';
  } else {
    folderChildrenSection.style.display = '';
    folderChildrenHead.textContent = currentFolderId ? 'Subfolders' : 'Folders';
    folderChildrenListEl.innerHTML = children.map(node => {
      const noteCount = countNotesInFolderTree(node.id);
      const subCount = node.children.length;
      return `
        <button class="folder-card" data-folder-nav="${escapeHtml(node.id)}">
          <div class="folder-card-icon">📁</div>
          <div class="folder-card-body">
            <div class="folder-card-name">${escapeHtml(node.name)}</div>
            <div class="folder-card-meta">
              ${noteCount} note${noteCount === 1 ? '' : 's'}${subCount ? ` · ${subCount} subfolder${subCount === 1 ? '' : 's'}` : ''}
            </div>
          </div>
          <div class="folder-card-arrow">→</div>
        </button>
      `;
    }).join('');
  }

  // Notes directly in this folder. At root we just show the folder tree —
  // no "uncategorised" section. Use the "View all" mode if you want to see
  // notes that aren't in any folder.
  const folderNotesSection = document.getElementById('folder-notes-section');
  if (!currentFolderId) {
    if (folderNotesSection) folderNotesSection.style.display = 'none';
  } else {
    if (folderNotesSection) folderNotesSection.style.display = '';
    const notesHere = allNotes.filter(n => n.folderId === currentFolderId);
    folderNotesHead.textContent = 'Notes in this folder';
    if (notesHere.length === 0) {
      folderNotesListEl.innerHTML = '';
      folderNotesEmpty.style.display = 'block';
      folderNotesEmpty.textContent = 'No notes in this folder yet.';
      folderNotesListEl.appendChild(folderNotesEmpty);
    } else {
      folderNotesEmpty.style.display = 'none';
      folderNotesListEl.innerHTML = notesHere.map(n => noteCardHTML(n, { showFolder: false })).join('');
    }
  }
}

function countNotesInFolderTree(folderId) {
  // Count notes in this folder plus any descendant folder.
  const ids = new Set([folderId]);
  function gather(id) {
    const node = folderById.get(id);
    if (!node) return;
    node.children.forEach(cid => { ids.add(cid); gather(cid); });
  }
  gather(folderId);
  let total = 0;
  allNotes.forEach(n => { if (n.folderId && ids.has(n.folderId)) total++; });
  return total;
}

// Click breadcrumb or folder card to navigate; or any action button on a note card.
viewFoldersEl.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const card = actionEl.closest('.note-card');
    if (card) {
      const note = allNotes.find(n => n.id === card.dataset.id);
      if (note) {
        const action = actionEl.dataset.action;
        trackClick(note.id, action);
        if (action === 'gdocs-open')        { e.preventDefault(); openGdocs(note); }
        else if (action === 'quizlet-open' && !getQuizletWarnSkipped()) {
          e.preventDefault();
          openQuizlet(note);
        }
        else if (action === 'view')         openViewer(note);
        // 'download' and skipped 'quizlet-open' navigate natively.
      }
    }
    return;
  }
  const navTarget = e.target.closest('[data-folder-nav]');
  if (!navTarget) return;
  e.preventDefault();
  enterFolder(navTarget.dataset.folderNav || null);
});

// Initial render reflects the persisted view mode.
setViewMode(viewMode);

// Populate subject filter from upload-form options once.
(function seedSubjectFilter() {
  const opts = document.getElementById('note-subject').options;
  for (let i = 0; i < opts.length; i++) {
    const opt = document.createElement('option');
    opt.value = opts[i].value;
    opt.textContent = opts[i].textContent;
    filterSubjectEl.appendChild(opt);
  }
})();

/* Admin-managed subjects/types — sync into the upload form and filters as
   they're added/removed in Firestore. Built-in <option>s in the HTML remain
   so the form still works if Firestore is unreachable. */
const noteSubjectSelect = document.getElementById('note-subject');
const noteTypeSelect    = document.getElementById('note-type');

function mergeCustomOptions(selectEl, items, getValue, getLabel) {
  if (!selectEl) return;
  // Drop anything previously injected.
  Array.from(selectEl.querySelectorAll('option[data-custom="1"]')).forEach(o => o.remove());
  // Re-add from the current list, inserted at the end (or before a trailing
  // "Other" entry on the subject select, so "Other" stays last).
  const otherOpt = Array.from(selectEl.options).find(o => o.value === 'Other');
  items.forEach(item => {
    const o = document.createElement('option');
    o.value = getValue(item);
    o.textContent = getLabel(item);
    o.dataset.custom = '1';
    if (otherOpt) selectEl.insertBefore(o, otherOpt);
    else selectEl.appendChild(o);
  });
}

onSnapshot(
  query(collection(db, 'subjects'), orderBy('createdAt', 'asc')),
  (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    // Keep ones the built-in HTML already covers from being duplicated.
    const builtIn = new Set(
      Array.from(noteSubjectSelect.options)
        .filter(o => o.dataset.custom !== '1')
        .map(o => o.value)
    );
    const fresh = items.filter(s => s.name && !builtIn.has(s.name));
    mergeCustomOptions(noteSubjectSelect, fresh, s => s.name, s => s.name);
    mergeCustomOptions(filterSubjectEl,   fresh, s => s.name, s => s.name);
  },
  (err) => console.warn('[hub] subjects listener:', err)
);

onSnapshot(
  query(collection(db, 'noteTypes'), orderBy('createdAt', 'asc')),
  (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    customTypeMap.clear();
    items.forEach(t => { if (t.value && t.label) customTypeMap.set(t.value, t.label); });
    const builtIn = new Set(
      Array.from(noteTypeSelect.options)
        .filter(o => o.dataset.custom !== '1')
        .map(o => o.value)
    );
    const fresh = items.filter(t => t.value && !builtIn.has(t.value));
    mergeCustomOptions(noteTypeSelect, fresh, t => t.value, t => t.label);
    mergeCustomOptions(filterTypeEl,   fresh, t => t.value, t => t.label);
    renderNotes();
  },
  (err) => console.warn('[hub] noteTypes listener:', err)
);

// Admin-editable exam coverage. Falls back to the static default if the
// doc doesn't exist yet or has no items array.
onSnapshot(
  doc(db, 'state', 'coverage'),
  (snap) => {
    const data = snap.exists() ? snap.data() : null;
    if (data && Array.isArray(data.items) && data.items.length) {
      COVERAGE = data.items;
    } else {
      COVERAGE = DEFAULT_COVERAGE;
    }
    // Refresh the coverage modal in place if it's open right now.
    if (coverageModal && coverageModal.classList.contains('open')) {
      renderCoverage(null);
    }
  },
  (err) => console.warn('[hub] coverage listener:', err)
);

onSnapshot(
  query(collection(db, 'folders'), orderBy('createdAt', 'asc')),
  (snap) => {
    allFolders = [];
    snap.forEach(d => allFolders.push({ id: d.id, ...d.data() }));
    const linear = rebuildFolderTree();
    populateFolderSelects(linear);
    if (viewMode === 'folders') renderFolderBrowser();
    else renderNotes();
  },
  (err) => console.warn('folders listener offline:', err.message)
);

onSnapshot(
  query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
  (snap) => {
    allNotes = [];
    snap.forEach(d => {
      const data = d.data();
      // Hide archived notes from the public hub entirely. Admin can
      // still see them via the "Show archived" toggle on /admin.
      if (data.archived) return;
      allNotes.push({ id: d.id, ...data });
    });
    sortNotes(allNotes);
    if (viewMode === 'folders') renderFolderBrowser();
    else renderNotes();
  },
  (err) => {
    console.warn('notes listener offline:', err.message);
    notesEmpty.textContent = 'Could not load notes (offline?). Refresh to retry.';
  }
);

/* ==========================================================================
   Welcome popup — admin-authored, shown once per visitor per popup id.
   Dismissals stored in localStorage under `finals.dismissedPopups`.
   ========================================================================== */
const DISMISSED_POPUPS_KEY = 'finals.dismissedPopups';
const welcomePopupModal   = document.getElementById('welcome-popup-modal');
const welcomePopupEmoji   = document.getElementById('welcome-popup-emoji');
const welcomePopupTitle   = document.getElementById('welcome-popup-title');
const welcomePopupDesc    = document.getElementById('welcome-popup-desc');
const welcomePopupCta     = document.getElementById('welcome-popup-cta');
const welcomePopupSkip    = document.getElementById('welcome-popup-skip');
let activeWelcomePopup    = null;
let welcomePopupShown     = false;

function getDismissedPopups() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_POPUPS_KEY) || '{}') || {}; }
  catch (_) { return {}; }
}
function markPopupDismissed(id) {
  if (!id) return;
  try {
    const map = getDismissedPopups();
    map[id] = Date.now();
    localStorage.setItem(DISMISSED_POPUPS_KEY, JSON.stringify(map));
  } catch (_) {}
}
function maybeMarkSkipped(id) {
  if (welcomePopupSkip && welcomePopupSkip.checked) markPopupDismissed(id);
}
function closeWelcomePopup() {
  if (!welcomePopupModal) return;
  welcomePopupModal.style.display = 'none';
}
function showWelcomePopup(popup) {
  if (!welcomePopupModal || welcomePopupShown) return;
  if (!popup || !popup.active) return;
  if (getDismissedPopups()[popup.id]) return;
  welcomePopupShown = true;
  activeWelcomePopup = popup;

  welcomePopupEmoji.textContent = popup.emoji || '';
  welcomePopupEmoji.style.display = popup.emoji ? '' : 'none';
  welcomePopupTitle.textContent = popup.title || '';
  welcomePopupDesc.textContent  = popup.description || '';

  if (popup.folderId) {
    welcomePopupCta.style.display = '';
    welcomePopupCta.textContent = popup.buttonText || 'Click here to know more!';
  } else {
    welcomePopupCta.style.display = 'none';
  }
  welcomePopupSkip.checked = false;
  welcomePopupModal.style.display = 'flex';
}

if (welcomePopupModal) {
  welcomePopupModal.addEventListener('click', (e) => {
    const role = e.target.dataset.close;
    if (!role) return;
    if (role === 'overlay' && e.target !== welcomePopupModal) return;
    if (activeWelcomePopup) maybeMarkSkipped(activeWelcomePopup.id);
    closeWelcomePopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (welcomePopupModal.style.display !== 'flex') return;
    if (activeWelcomePopup) maybeMarkSkipped(activeWelcomePopup.id);
    closeWelcomePopup();
  });
}
if (welcomePopupCta) {
  welcomePopupCta.addEventListener('click', () => {
    if (!activeWelcomePopup) return;
    maybeMarkSkipped(activeWelcomePopup.id);
    const folderId = activeWelcomePopup.folderId;
    closeWelcomePopup();
    if (folderId && folderById.has(folderId)) {
      const notesTabBtn = document.querySelector('.main-tab[data-tab="notes"]');
      if (notesTabBtn && !notesTabBtn.classList.contains('active')) notesTabBtn.click();
      setViewMode('folders');
      enterFolder(folderId);
      const notesPanel = document.getElementById('panel-notes');
      if (notesPanel) notesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

onSnapshot(
  query(collection(db, 'popups'), orderBy('createdAt', 'desc')),
  (snap) => {
    let next = null;
    snap.forEach(d => {
      if (next) return;
      const data = d.data();
      if (data && data.active) next = { id: d.id, ...data };
    });
    if (next) showWelcomePopup(next);
  },
  (err) => console.warn('popups listener offline:', err.message)
);

/* ==========================================================================
   Timer — sub-tabs
   ========================================================================== */
document.getElementById('timer-sub-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.sub-tab');
  if (!btn) return;
  const target = btn.dataset.sub;
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.sub-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'sub-' + target);
  });
});

/* ==========================================================================
   Audio beep (shared by all timers)
   ========================================================================== */
let audioCtx = null;
function beep(times = 2) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.45);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.45 + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.45 + 0.30);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.45);
      osc.stop(ctx.currentTime + i * 0.45 + 0.32);
    }
  } catch (e) { /* ignore audio failures */ }
}

function notify(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192x192.png', silent: true });
    }
  } catch (e) { /* ignore */ }
}

function askNotificationOnce() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch (e) { /* ignore */ }
}

/* ==========================================================================
   Pomodoro — drift-free using endAtMs vs Date.now()
   ========================================================================== */
const POMO_STATE_KEY = 'finals.pomo';
const pomoDisplay = document.getElementById('pomo-display');
const pomoPhaseLabel = document.getElementById('pomo-phase');
const pomoCyclesEl = document.getElementById('pomo-cycles');
const pomoStartBtn = document.getElementById('pomo-start');
const pomoSkipBtn = document.getElementById('pomo-skip');
const pomoResetBtn = document.getElementById('pomo-reset');

function getPomoConfig() {
  return {
    focus:    Math.max(1, +document.getElementById('pomo-focus-min').value || 25),
    short:    Math.max(1, +document.getElementById('pomo-break-min').value || 5),
    long:     Math.max(1, +document.getElementById('pomo-long-min').value || 15),
    every:    Math.max(2, +document.getElementById('pomo-long-every').value || 4)
  };
}

let pomo = loadPomoState() || {
  phase: 'focus',           // 'focus' | 'short' | 'long'
  running: false,
  endAtMs: 0,
  remainingMs: 25 * 60_000, // when paused
  completedFocus: 0
};
let pomoEndTimer = null;
let pomoTickTimer = null;

function loadPomoState() {
  try {
    const raw = sessionStorage.getItem(POMO_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function savePomoState() {
  try { sessionStorage.setItem(POMO_STATE_KEY, JSON.stringify(pomo)); } catch (e) {}
}

function phaseLabel(p) {
  if (p === 'focus') return 'Focus';
  if (p === 'short') return 'Short Break';
  return 'Long Break';
}

function fmtMSS(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function renderPomo() {
  const remaining = pomo.running ? (pomo.endAtMs - Date.now()) : pomo.remainingMs;
  pomoDisplay.textContent = fmtMSS(remaining);
  pomoPhaseLabel.textContent = phaseLabel(pomo.phase);
  pomoPhaseLabel.classList.toggle('break', pomo.phase !== 'focus');
  pomoCyclesEl.textContent = pomo.completedFocus;
  pomoStartBtn.textContent = pomo.running ? 'Pause' : (remaining < phaseDurMs() ? 'Resume' : 'Start');
}

function phaseDurMs() {
  const cfg = getPomoConfig();
  if (pomo.phase === 'focus') return cfg.focus * 60_000;
  if (pomo.phase === 'short') return cfg.short * 60_000;
  return cfg.long * 60_000;
}

function pomoTick() {
  renderPomo();
  if (pomo.running && Date.now() >= pomo.endAtMs) {
    finishPomoPhase();
  }
}

function startPomoLoop() {
  if (pomoTickTimer) clearInterval(pomoTickTimer);
  pomoTickTimer = setInterval(pomoTick, 250);
  if (pomoEndTimer) clearTimeout(pomoEndTimer);
  pomoEndTimer = setTimeout(finishPomoPhase, Math.max(0, pomo.endAtMs - Date.now()));
}

function stopPomoLoop() {
  if (pomoTickTimer) { clearInterval(pomoTickTimer); pomoTickTimer = null; }
  if (pomoEndTimer) { clearTimeout(pomoEndTimer); pomoEndTimer = null; }
}

function pomoStart() {
  askNotificationOnce();
  if (pomo.running) {
    // Pause
    pomo.remainingMs = Math.max(0, pomo.endAtMs - Date.now());
    pomo.running = false;
    stopPomoLoop();
  } else {
    // Start / resume
    if (!pomo.remainingMs || pomo.remainingMs <= 0) pomo.remainingMs = phaseDurMs();
    pomo.endAtMs = Date.now() + pomo.remainingMs;
    pomo.running = true;
    startPomoLoop();
  }
  savePomoState();
  renderPomo();
}

function pomoSkip() {
  // Advance to next phase without completing the current one.
  pomo.running = false;
  stopPomoLoop();
  advancePomoPhase(false);
  savePomoState();
  renderPomo();
}

function pomoReset() {
  stopPomoLoop();
  pomo = {
    phase: 'focus',
    running: false,
    endAtMs: 0,
    remainingMs: getPomoConfig().focus * 60_000,
    completedFocus: 0
  };
  savePomoState();
  renderPomo();
}

function finishPomoPhase() {
  if (!pomo.running) return;
  pomo.running = false;
  stopPomoLoop();
  beep(3);
  if (pomo.phase === 'focus') {
    notify('Focus done', 'Time for a break.');
  } else {
    notify('Break over', 'Back to focus!');
  }
  advancePomoPhase(true);
  // Auto-start next phase.
  pomo.endAtMs = Date.now() + pomo.remainingMs;
  pomo.running = true;
  startPomoLoop();
  savePomoState();
  renderPomo();
}

function advancePomoPhase(completedNaturally) {
  const cfg = getPomoConfig();
  if (pomo.phase === 'focus') {
    if (completedNaturally) pomo.completedFocus += 1;
    pomo.phase = (pomo.completedFocus > 0 && pomo.completedFocus % cfg.every === 0) ? 'long' : 'short';
  } else {
    pomo.phase = 'focus';
  }
  pomo.remainingMs = phaseDurMs();
}

pomoStartBtn.addEventListener('click', pomoStart);
pomoSkipBtn.addEventListener('click', pomoSkip);
pomoResetBtn.addEventListener('click', pomoReset);

// Re-render when config changes (only when not running).
['pomo-focus-min', 'pomo-break-min', 'pomo-long-min', 'pomo-long-every'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (!pomo.running) {
      pomo.remainingMs = phaseDurMs();
      renderPomo();
    }
  });
});

// Resume timer if we were running when the tab was closed/refreshed.
if (pomo.running) {
  if (Date.now() >= pomo.endAtMs) {
    // Already finished while we were gone — fire the transition.
    finishPomoPhase();
  } else {
    startPomoLoop();
  }
}
renderPomo();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && pomo.running) {
    renderPomo();
    if (Date.now() >= pomo.endAtMs) finishPomoPhase();
  }
});

/* ==========================================================================
   Custom countdown
   ========================================================================== */
const CD_STATE_KEY = 'finals.customCd';
const cdDisplay = document.getElementById('cd-timer-display');
const cdHInput = document.getElementById('cd-input-h');
const cdMInput = document.getElementById('cd-input-m');
const cdSInput = document.getElementById('cd-input-s');
const cdStartBtn = document.getElementById('cd-start');
const cdResetBtn = document.getElementById('cd-reset');

let cd = loadCdState() || { running: false, endAtMs: 0, remainingMs: 25 * 60_000 };
let cdTickTimer = null;
let cdEndTimer = null;

function loadCdState() {
  try {
    const raw = sessionStorage.getItem(CD_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveCdState() {
  try { sessionStorage.setItem(CD_STATE_KEY, JSON.stringify(cd)); } catch (e) {}
}

function fmtHMS(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function renderCd() {
  const remaining = cd.running ? (cd.endAtMs - Date.now()) : cd.remainingMs;
  cdDisplay.textContent = fmtHMS(remaining);
  cdStartBtn.textContent = cd.running ? 'Pause' : (cd.remainingMs > 0 && cd.endAtMs ? 'Resume' : 'Start');
}

function cdTick() {
  renderCd();
  if (cd.running && Date.now() >= cd.endAtMs) cdFinish();
}

function cdStartLoop() {
  if (cdTickTimer) clearInterval(cdTickTimer);
  cdTickTimer = setInterval(cdTick, 250);
  if (cdEndTimer) clearTimeout(cdEndTimer);
  cdEndTimer = setTimeout(cdFinish, Math.max(0, cd.endAtMs - Date.now()));
}
function cdStopLoop() {
  if (cdTickTimer) { clearInterval(cdTickTimer); cdTickTimer = null; }
  if (cdEndTimer) { clearTimeout(cdEndTimer); cdEndTimer = null; }
}

function cdStart() {
  askNotificationOnce();
  if (cd.running) {
    cd.remainingMs = Math.max(0, cd.endAtMs - Date.now());
    cd.running = false;
    cdStopLoop();
  } else {
    if (!cd.remainingMs || cd.remainingMs <= 0) {
      const h = +cdHInput.value || 0, m = +cdMInput.value || 0, s = +cdSInput.value || 0;
      cd.remainingMs = (h * 3600 + m * 60 + s) * 1000;
    }
    if (cd.remainingMs <= 0) return;
    cd.endAtMs = Date.now() + cd.remainingMs;
    cd.running = true;
    cdStartLoop();
  }
  saveCdState();
  renderCd();
}

function cdReset() {
  cdStopLoop();
  const h = +cdHInput.value || 0, m = +cdMInput.value || 0, s = +cdSInput.value || 0;
  cd = { running: false, endAtMs: 0, remainingMs: (h * 3600 + m * 60 + s) * 1000 };
  saveCdState();
  renderCd();
}

function cdFinish() {
  if (!cd.running) return;
  cd.running = false;
  cd.remainingMs = 0;
  cdStopLoop();
  beep(4);
  notify('Timer done', 'Your countdown reached zero.');
  saveCdState();
  renderCd();
}

cdStartBtn.addEventListener('click', cdStart);
cdResetBtn.addEventListener('click', cdReset);
[cdHInput, cdMInput, cdSInput].forEach(inp => {
  inp.addEventListener('change', () => {
    if (!cd.running) cdReset();
  });
});

if (cd.running) {
  if (Date.now() >= cd.endAtMs) cdFinish();
  else cdStartLoop();
}
renderCd();

/* ==========================================================================
   Stopwatch — high-precision using startAtMs vs Date.now()
   ========================================================================== */
const SW_STATE_KEY = 'finals.sw';
const swDisplay = document.getElementById('sw-display');
const swStartBtn = document.getElementById('sw-start');
const swLapBtn = document.getElementById('sw-lap');
const swResetBtn = document.getElementById('sw-reset');
const swLapsList = document.getElementById('sw-laps');

let sw = loadSwState() || { running: false, startAtMs: 0, elapsedMs: 0, laps: [] };
let swTickTimer = null;

function loadSwState() {
  try {
    const raw = sessionStorage.getItem(SW_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveSwState() {
  try { sessionStorage.setItem(SW_STATE_KEY, JSON.stringify(sw)); } catch (e) {}
}

function fmtHMSCS(ms) {
  const totalCs = Math.max(0, Math.floor(ms / 10));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':') + '.' + String(cs).padStart(2, '0');
}

function swCurrentMs() {
  return sw.running ? (sw.elapsedMs + (Date.now() - sw.startAtMs)) : sw.elapsedMs;
}

function renderSw() {
  swDisplay.textContent = fmtHMSCS(swCurrentMs());
  swStartBtn.textContent = sw.running ? 'Pause' : (sw.elapsedMs > 0 ? 'Resume' : 'Start');
  swLapsList.innerHTML = sw.laps.map((t, i) =>
    `<li><span class="lap-n">Lap ${i + 1}</span><span class="lap-t">${fmtHMSCS(t)}</span></li>`
  ).reverse().join('');
}

function swTick() { swDisplay.textContent = fmtHMSCS(swCurrentMs()); }

function swStart() {
  if (sw.running) {
    sw.elapsedMs += Date.now() - sw.startAtMs;
    sw.running = false;
    if (swTickTimer) { clearInterval(swTickTimer); swTickTimer = null; }
  } else {
    sw.startAtMs = Date.now();
    sw.running = true;
    if (swTickTimer) clearInterval(swTickTimer);
    swTickTimer = setInterval(swTick, 50);
  }
  saveSwState();
  renderSw();
}

function swLap() {
  if (!sw.running && sw.elapsedMs === 0) return;
  sw.laps.push(swCurrentMs());
  saveSwState();
  renderSw();
}

function swReset() {
  if (swTickTimer) { clearInterval(swTickTimer); swTickTimer = null; }
  sw = { running: false, startAtMs: 0, elapsedMs: 0, laps: [] };
  saveSwState();
  renderSw();
}

swStartBtn.addEventListener('click', swStart);
swLapBtn.addEventListener('click', swLap);
swResetBtn.addEventListener('click', swReset);

if (sw.running) {
  swTickTimer = setInterval(swTick, 50);
}
renderSw();

/* ==========================================================================
   Maths Answers — ported from /app.js, lazy-loaded when the tab opens.
   `/data.js` (132 KB) and `/diagrams.json` are only fetched on first use.
   ========================================================================== */
let mathsState = null;

function ensureMathsInitialized() {
  if (mathsState) return mathsState.ready;

  const loader = document.getElementById('maths-loader');
  const appBox = document.getElementById('maths-app');
  loader.style.display = 'block';

  mathsState = {
    section: '4.1',
    utChapter: '',
    diagrams: {},
    ready: null
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });

  mathsState.ready = (async () => {
    try {
      await loadScript('/data.js');
      try {
        const r = await fetch('/diagrams.json');
        if (r.ok) mathsState.diagrams = await r.json() || {};
      } catch (_) { /* optional, ignore */ }

      loader.style.display = 'none';
      appBox.style.display = 'block';
      wireMathsUI();
      mathsSelectSection('4.1');
    } catch (err) {
      loader.textContent = 'Failed to load answer database: ' + (err.message || err);
    }
  })();

  return mathsState.ready;
}

function wireMathsUI() {
  document.querySelectorAll('#m-section-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => mathsSelectSection(btn.getAttribute('data-section')));
  });
  document.getElementById('m-ut-chapter-select').addEventListener('change', (e) => {
    mathsState.utChapter = e.target.value;
    mathsPopulateQuestions();
    mathsHideAnswer();
  });
  document.getElementById('m-question-select').addEventListener('change', mathsHideAnswer);
  document.getElementById('m-btn-check').addEventListener('click', mathsShowResult);
}

function mathsSelectSection(key) {
  mathsState.section = key;
  mathsState.utChapter = '';
  document.querySelectorAll('#m-section-tabs .tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-section') === key);
  });
  const utGroup = document.getElementById('m-ut-chapter-group');
  const qLabel = document.getElementById('m-q-step-label');
  if (key === 'UT') {
    utGroup.style.display = 'block';
    document.getElementById('m-ut-chapter-select').value = '';
    qLabel.textContent = '3. 選擇題號 (Question)';
  } else {
    utGroup.style.display = 'none';
    qLabel.textContent = '2. 選擇題號 (Question)';
  }
  mathsPopulateQuestions();
  mathsHideAnswer();
}

function mathsPopulateQuestions() {
  const sel = document.getElementById('m-question-select');
  sel.innerHTML = '<option value="">— 請選擇 / Select —</option>';
  const SECTIONS = window.SECTIONS;
  if (!SECTIONS) return;

  if (mathsState.section === 'UT') {
    if (!mathsState.utChapter) return;
    const utData = SECTIONS['UT'];
    if (!utData || !utData.questions) return;
    const prefix = mathsState.utChapter + '_';
    const chapterKeys = Object.keys(utData.questions)
      .filter(k => k.indexOf(prefix) === 0)
      .sort((a, b) => parseInt(a.split('_')[1], 10) - parseInt(b.split('_')[1], 10));
    chapterKeys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = 'Q' + k.split('_')[1];
      sel.appendChild(opt);
    });
  } else {
    const data = SECTIONS[mathsState.section];
    if (!data || !data.questions) return;
    const keys = Object.keys(data.questions).map(Number).sort((a, b) => a - b);
    keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = String(k);
      opt.textContent = 'Q' + k;
      sel.appendChild(opt);
    });
  }
}

function mathsShowResult() {
  const SECTIONS = window.SECTIONS;
  if (!SECTIONS) return;
  const sel = document.getElementById('m-question-select');
  const qKey = sel.value;
  if (!qKey) { alert('請選擇題號 / Please select a question number.'); return; }

  let qData, sectionLabel;
  if (mathsState.section === 'UT') {
    if (!mathsState.utChapter) { alert('請選擇章節 / Please select a chapter.'); return; }
    qData = SECTIONS['UT'].questions[qKey];
    sectionLabel = 'UT · ' + mathsState.utChapter + ' · Q' + qKey.split('_')[1];
  } else {
    qData = SECTIONS[mathsState.section].questions[parseInt(qKey, 10)];
    sectionLabel = 'Section ' + mathsState.section + ' · Q' + qKey;
  }
  if (!qData) { alert('找不到答案 / Answer not found.'); return; }

  document.getElementById('m-answer-header').textContent = sectionLabel;

  const stepsContainer = document.getElementById('m-steps-container');
  stepsContainer.innerHTML = '';

  const sectionDiagrams = mathsState.diagrams[mathsState.section] || {};
  const imgPath = sectionDiagrams[qKey];
  if (imgPath) {
    const imgDiv = document.createElement('div');
    imgDiv.className = 'diagram-img-container';
    const img = document.createElement('img');
    img.src = '/' + imgPath;
    img.alt = 'Diagram for ' + sectionLabel;
    img.className = 'diagram-img';
    imgDiv.appendChild(img);
    stepsContainer.appendChild(imgDiv);
  }

  const finalDiv = document.getElementById('m-final-answer');
  if (qData.parts) {
    qData.parts.forEach(part => {
      const block = document.createElement('div');
      block.className = 'part-block';
      if (part.label) {
        const lbl = document.createElement('div');
        lbl.className = 'part-label';
        lbl.textContent = 'Part ' + part.label;
        block.appendChild(lbl);
      }
      if (part.steps && part.steps.length > 0) block.appendChild(mathsBuildStepsList(part.steps));
      if (part.answer) {
        const ans = document.createElement('div');
        ans.className = 'part-final-answer';
        ans.innerHTML = mathsRenderMath(part.answer);
        block.appendChild(ans);
      }
      stepsContainer.appendChild(block);
    });
    finalDiv.style.display = 'none';
  } else {
    if (qData.steps && qData.steps.length > 0) stepsContainer.appendChild(mathsBuildStepsList(qData.steps));
    finalDiv.style.display = 'block';
    if (qData.answer && /^[A-Da-d]$/.test(qData.answer.trim())) {
      finalDiv.innerHTML = '<span class="mcq-answer">' + mathsEscapeHtml(qData.answer.trim()) + '</span>';
    } else {
      finalDiv.innerHTML = mathsRenderMath(qData.answer || '');
    }
  }

  const panel = document.getElementById('m-answer-panel');
  panel.style.display = 'block';
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function mathsBuildStepsList(steps) {
  const ol = document.createElement('ol');
  ol.className = 'steps-list' + (steps.length === 1 ? ' single-step' : '');
  steps.forEach((text, i) => {
    const li = document.createElement('li');
    li.setAttribute('data-n', i + 1);
    const pipeIdx = text.indexOf(' | ');
    if (pipeIdx !== -1) {
      const workText = text.slice(0, pipeIdx);
      const reasonText = text.slice(pipeIdx + 3);
      const workSpan = document.createElement('span');
      workSpan.className = 'step-work';
      workSpan.innerHTML = mathsRenderMath(workText);
      const reasonSpan = document.createElement('span');
      reasonSpan.className = 'step-reason';
      reasonSpan.textContent = reasonText;
      li.appendChild(workSpan);
      li.appendChild(reasonSpan);
    } else {
      const workSpan2 = document.createElement('span');
      workSpan2.className = 'step-work';
      workSpan2.innerHTML = mathsRenderMath(text);
      li.appendChild(workSpan2);
    }
    ol.appendChild(li);
  });
  return ol;
}

function mathsHideAnswer() {
  const panel = document.getElementById('m-answer-panel');
  panel.style.display = 'none';
  document.getElementById('m-steps-container').innerHTML = '';
  document.getElementById('m-final-answer').textContent = '';
  document.getElementById('m-final-answer').style.display = 'block';
}

function mathsEscapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mathsRenderMath(rawText) {
  let s = mathsEscapeHtml(rawText);
  s = s.replace(
    /\(([A-Za-z0-9°²³√∠△]+)\/([A-Za-z0-9°²³√∠△]+(?:[ ][A-Za-z0-9°²³√∠△]+)*)\)([A-Za-z0-9°²³√∠△]*)/g,
    (m, num, den, unit) => {
      const frac = '<span class="frac"><span class="num">' + num + '</span><span class="den">' + den + '</span></span>';
      return unit ? frac + ' ' + unit : frac;
    }
  );
  s = s.replace(
    /(^|[^A-Za-z0-9(])([A-Za-z0-9°²³√∠△]+)\/([A-Za-z0-9°²³√∠△]+(?:[ ][A-Za-z0-9°²³√∠△]+)*)(?![A-Za-z0-9)])/g,
    (m, prefix, num, den) => prefix + '<span class="frac"><span class="num">' + num + '</span><span class="den">' + den + '</span></span>'
  );
  return s;
}

/* ==========================================================================
   In-browser viewer — renders a note's file inside a modal:
   - Images (png/jpg/jpeg/webp/gif): <img src>
   - PDFs: open in a new tab so the browser's native PDF viewer takes
     over fullscreen (with its built-in zoom / search / page nav)
   - Plain text: fetch and render in <pre>
   - Word (doc/docx): Microsoft Office Online viewer iframe
   ========================================================================== */
const viewerModal = document.getElementById('viewer-modal');
const viewerTitle = document.getElementById('viewer-title');
const viewerMeta = document.getElementById('viewer-meta');
const viewerDownload = document.getElementById('viewer-download');
const viewerBody = document.getElementById('viewer-body');

function openViewer(note) {
  const isFlash = note.type === 'flashcards';
  const ext = (String(note.fileName || '').split('.').pop() || '').toLowerCase();

  // PDFs bypass the modal entirely — they open in a fresh browser tab so
  // the user gets the native PDF viewer (fullscreen, paged, searchable).
  if (!isFlash && ext === 'pdf') {
    return openPdfInNewTab(note);
  }

  viewerTitle.textContent = note.title || '(untitled)';
  viewerMeta.textContent = [
    note.subject,
    isFlash ? 'Flashcards' : (note.type === 'mock_paper' ? 'Mock Paper' : 'Notes'),
    note.uploaderName ? 'by ' + note.uploaderName : null,
    isFlash ? null : fmtBytes(note.fileSize)
  ].filter(Boolean).join(' · ');

  if (isFlash) {
    viewerDownload.href = note.quizletUrl || '#';
    viewerDownload.removeAttribute('download');
    viewerDownload.textContent = 'Open in Quizlet';
  } else {
    viewerDownload.href = note.downloadUrl || '#';
    viewerDownload.setAttribute('download', note.fileName || 'download');
    viewerDownload.textContent = 'Download';
  }

  viewerBody.innerHTML = '<div class="viewer-loading">Loading…</div>';
  viewerModal.style.display = 'flex';

  if (isFlash) return renderFlashcardsViewer(note);

  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    renderImageViewer(note);
  } else if (ext === 'txt') {
    renderTextViewer(note);
  } else if (['doc', 'docx'].includes(ext)) {
    renderOfficeViewer(note);
  } else if (['html', 'htm'].includes(ext)) {
    renderHtmlViewer(note);
  } else {
    viewerBody.innerHTML = '<div class="viewer-error">Preview not available for this file type. Use Download instead.</div>';
  }
}

// Render an uploaded .html page inside a sandboxed iframe. The raw
// GitHub URL serves the file as text/plain, so we fetch it ourselves
// and wrap the body in a text/html Blob to get the browser to render
// it. Scripts inside the page are allowed (sandbox="allow-scripts")
// so interactive HTML notes like flashcard pages work, but the iframe
// has an opaque origin so it can't touch the parent page's storage.
async function renderHtmlViewer(note) {
  try {
    const resp = await fetch(note.downloadUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    viewerBody.dataset.blobUrl = url;
    viewerBody.innerHTML = `<iframe src="${url}" class="viewer-iframe" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" title="${escapeHtml(note.title || '')}"></iframe>`;
  } catch (err) {
    viewerBody.innerHTML = `<div class="viewer-error">Couldn't load HTML: ${escapeHtml(err.message || String(err))}.</div>`;
  }
}

// Opens the PDF in a new tab via /api/pdf, which streams the file
// back with Content-Type: application/pdf + inline disposition. We
// can't link to note.downloadUrl directly because raw.githubusercontent.com
// serves every file as application/octet-stream with nosniff and a
// strict sandbox CSP, which forces a download instead of viewing.
//
// Synchronous window.open in a click handler — no fetch, no blob, no
// popup-blocker dance, no loading splash.
function openPdfInNewTab(note) {
  const target = note.filePath
    ? '/api/pdf?path=' + encodeURIComponent(note.filePath)
    : note.downloadUrl; // legacy uploads pre-filePath, best-effort
  window.open(target, '_blank', 'noopener');
}

function renderFlashcardsViewer(note) {
  // Quizlet's official embed URL — works inside an iframe.
  // Quizlet sets X-Frame-Options that allow iframe embedding for their
  // /flashcards/embed endpoint. We render a fallback link below the iframe
  // in case the iframe is blocked by the browser or the set was made
  // unembeddable by its author.
  const setId = note.quizletSetId;
  const embedUrl = setId
    ? `https://quizlet.com/${encodeURIComponent(setId)}/flashcards/embed`
    : '';
  const linkUrl = note.quizletUrl || '#';
  viewerBody.innerHTML = `
    <iframe
      src="${escapeHtml(embedUrl)}"
      class="viewer-iframe viewer-iframe-quizlet"
      title="${escapeHtml(note.title || '')}"
      allow="fullscreen"></iframe>
    <div class="viewer-quizlet-fallback">
      Flashcards not loading?
      <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener">Open this set in Quizlet ↗</a>
    </div>
  `;
}

function closeViewer() {
  viewerBody.innerHTML = '';
  viewerModal.style.display = 'none';
}

function renderImageViewer(note) {
  viewerBody.innerHTML = `<img src="${escapeHtml(note.downloadUrl)}" alt="${escapeHtml(note.title || '')}" class="viewer-img" />`;
}

async function renderTextViewer(note) {
  try {
    const resp = await fetch(note.downloadUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    viewerBody.innerHTML = `<pre class="viewer-text">${escapeHtml(text)}</pre>`;
  } catch (err) {
    viewerBody.innerHTML = `<div class="viewer-error">Couldn't load file: ${escapeHtml(err.message || String(err))}.</div>`;
  }
}

function renderOfficeViewer(note) {
  // Microsoft Office Online viewer accepts any publicly accessible URL.
  // raw.githubusercontent.com URLs qualify.
  const src = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(note.downloadUrl);
  viewerBody.innerHTML = `<iframe src="${src}" class="viewer-iframe" title="${escapeHtml(note.title || '')}"></iframe>`;
}

// Modal close wiring.
viewerModal.addEventListener('click', (e) => {
  const role = e.target.dataset.close;
  if (!role) return;
  if (role === 'overlay' && e.target !== viewerModal) return;
  closeViewer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && viewerModal.style.display === 'flex') closeViewer();
});

/* ==========================================================================
   Timetable modal — vertical timeline of every exam day.
   Each day card shows date, weekday, "in X days / today / past" badge, and
   each paper inside with time + subject + meta. Clicking a paper jumps to
   that subject in the coverage modal.
   ========================================================================== */
const timetableModal = document.getElementById('timetable-modal');
const timetableBody = document.getElementById('timetable-body');
const coverageModal = document.getElementById('coverage-modal');
const coverageBody = document.getElementById('coverage-body');

function escapeHtmlInfo(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// HKT-naive: render the calendar day of the exam as the school sees it.
function dayMs(d) {
  // Treat the date string as a local-HKT date by parsing "YYYY-MM-DD"
  // against UTC midnight (so day arithmetic is timezone-independent).
  const [y, mo, da] = d.split('-').map(Number);
  return Date.UTC(y, mo - 1, da);
}
function todayMsUtc() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDayStatus(dateStr) {
  const target = dayMs(dateStr);
  const today = todayMsUtc();
  const diff = Math.round((target - today) / 86_400_000);
  if (diff === 0) return { label: 'Today', cls: 'today' };
  if (diff === 1) return { label: 'Tomorrow', cls: 'tomorrow' };
  if (diff > 1)   return { label: `in ${diff} days`, cls: 'future' };
  if (diff === -1) return { label: 'Yesterday', cls: 'past' };
  return { label: `${-diff} days ago`, cls: 'past' };
}

function formatDateLabel(dateStr) {
  const [y, mo, da] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1, da));
  // "1 Jun · Mon" — concise
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function renderTimetable() {
  const html = TIMETABLE.map((day, idx) => {
    const status = formatDayStatus(day.date);
    const dateLabel = formatDateLabel(day.date);
    const isTSA = !!day.isTSA;
    return `
      <div class="day-card day-${status.cls}${isTSA ? ' day-tsa' : ''}" style="animation-delay:${Math.min(idx * 40, 600)}ms;">
        <div class="day-card-head">
          <div class="day-card-date">
            <div class="day-card-date-main">${escapeHtmlInfo(dateLabel)}</div>
            <div class="day-card-date-day">${escapeHtmlInfo(day.day)}</div>
          </div>
          <div class="day-card-status status-${status.cls}">${escapeHtmlInfo(status.label)}${isTSA ? ' · TSA' : ''}</div>
        </div>
        <ul class="paper-list">
          ${day.papers.map(p => `
            <li class="paper-row ${p.subjectKey ? 'paper-row-clickable' : ''}"${p.subjectKey ? ` data-subject="${escapeHtmlInfo(p.subjectKey)}"` : ''}>
              <div class="paper-time">${escapeHtmlInfo(p.time)}</div>
              <div class="paper-body">
                <div class="paper-subject">${escapeHtmlInfo(p.subject)}</div>
                ${p.meta ? `<div class="paper-meta">${escapeHtmlInfo(p.meta)}</div>` : ''}
              </div>
              ${p.subjectKey ? '<div class="paper-arrow" title="View coverage">📚</div>' : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }).join('');
  timetableBody.innerHTML = html;
}

function renderCoverage(focusKey) {
  const html = COVERAGE.map((sub, idx) => {
    const expanded = sub.subject === focusKey;
    return `
      <details class="subj-card" data-subject="${escapeHtmlInfo(sub.subject)}"${expanded ? ' open' : ''} style="animation-delay:${Math.min(idx * 30, 600)}ms;">
        <summary class="subj-card-summary">
          <span class="subj-icon">${sub.icon || '📘'}</span>
          <div class="subj-summary-text">
            <div class="subj-name">${escapeHtmlInfo(sub.subject)}</div>
            ${sub.classes && sub.classes !== 'all' ? `<div class="subj-classes">${escapeHtmlInfo(sub.classes)}</div>` : ''}
          </div>
          <span class="subj-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="subj-card-body">
          ${sub.chapters && sub.chapters.length ? `
            <div class="subj-section">
              <div class="subj-section-head">Chapters / topics</div>
              <ul class="subj-list">${sub.chapters.map(c => `<li>${escapeHtmlInfo(c)}</li>`).join('')}</ul>
            </div>` : ''}
          ${sub.workbooks && sub.workbooks.length ? `
            <div class="subj-section">
              <div class="subj-section-head">Workbooks</div>
              <ul class="subj-list">${sub.workbooks.map(w => `<li>${escapeHtmlInfo(w)}</li>`).join('')}</ul>
            </div>` : ''}
          ${sub.worksheets && sub.worksheets.length ? `
            <div class="subj-section">
              <div class="subj-section-head">Worksheets</div>
              <ul class="subj-list">${sub.worksheets.map(w => `<li>${escapeHtmlInfo(w)}</li>`).join('')}</ul>
            </div>` : ''}
          ${sub.others && sub.others.length ? `
            <div class="subj-section">
              <div class="subj-section-head">Others</div>
              <ul class="subj-list">${sub.others.map(o => `<li>${escapeHtmlInfo(o)}</li>`).join('')}</ul>
            </div>` : ''}
        </div>
      </details>
    `;
  }).join('');
  coverageBody.innerHTML = html;

  // Scroll the focused subject into view.
  if (focusKey) {
    const target = coverageBody.querySelector(`[data-subject="${CSS.escape(focusKey)}"]`);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

function openInfoModal(modal, renderFn) {
  renderFn();
  modal.style.display = 'flex';
  // Force reflow so the animation kicks in even when reopened.
  modal.offsetHeight;  // eslint-disable-line no-unused-expressions
  modal.classList.add('open');
}

function closeInfoModal(modal) {
  modal.classList.remove('open');
  modal.style.display = 'none';
}

document.getElementById('open-timetable').addEventListener('click', () => {
  openInfoModal(timetableModal, renderTimetable);
});
document.getElementById('open-coverage').addEventListener('click', () => {
  openInfoModal(coverageModal, () => renderCoverage(null));
});

// Click a clickable paper row → open coverage modal on that subject.
timetableBody.addEventListener('click', (e) => {
  const row = e.target.closest('.paper-row-clickable');
  if (!row) return;
  const key = row.dataset.subject;
  if (!key) return;
  closeInfoModal(timetableModal);
  // Open coverage immediately on the focused subject.
  openInfoModal(coverageModal, () => renderCoverage(key));
});

// Close handlers (overlay click / × button / Escape)
[timetableModal, coverageModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    const role = e.target.dataset.close;
    if (!role) return;
    if (role === 'overlay' && e.target !== modal) return;
    closeInfoModal(modal);
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (timetableModal.classList.contains('open')) closeInfoModal(timetableModal);
  if (coverageModal.classList.contains('open'))  closeInfoModal(coverageModal);
});

/* ==========================================================================
   Google Docs warning modal — reminds students to use their @smcesps.edu.hk
   account before the doc opens in a new tab. Persists "don't show again"
   to localStorage. Opens via a synthetic <a target="_blank"> click so we
   stay inside the user-gesture context that browsers require for popup
   permission.
   ========================================================================== */
const GDOCS_SKIP_KEY = 'finals.gdocsWarnSkipped';
const gdocsWarnModal = document.getElementById('gdocs-warn-modal');
const gdocsWarnSkip  = document.getElementById('gdocs-warn-skip');
const gdocsWarnOpen  = document.getElementById('gdocs-warn-open');

function getGdocsSkipped() {
  try { return localStorage.getItem(GDOCS_SKIP_KEY) === '1'; }
  catch (_) { return false; }
}
function setGdocsSkipped(on) {
  try { localStorage.setItem(GDOCS_SKIP_KEY, on ? '1' : '0'); }
  catch (_) {}
}

function openInNewTab(url) {
  // Programmatic anchor click — survives popup blockers because we're
  // still inside the user's click handler call stack.
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openGdocs(note) {
  const url = note.gdocsUrl || '#';
  if (getGdocsSkipped()) {
    openInNewTab(url);
    return;
  }
  // Configure modal for THIS note.
  gdocsWarnSkip.checked = false;
  gdocsWarnOpen.href = url;
  gdocsWarnOpen.dataset.url = url;
  gdocsWarnModal.style.display = 'flex';
  gdocsWarnModal.offsetHeight;            // reflow for transition
  gdocsWarnModal.classList.add('open');
}

/* Quizlet redirect: same pattern as the Google Docs warning.
   - Anchor click is intercepted (preventDefault).
   - Light-themed popup appears with the blue Quizlet "Q" logo,
     a few celebratory icons, and a "Don't show again" toggle.
   - Inside the popup an "Open Quizlet" anchor is wired with the
     same target=_blank URL — clicking it (or letting the auto-open
     fire ~1.5 s later) navigates via native user click, so popup
     blockers never intervene.
*/
const QUIZLET_WARN_KEY = 'finals.quizletWarnSkipped';
const qWarnModal = document.getElementById('quizlet-warn-modal');
const qWarnSkip  = document.getElementById('quizlet-warn-skip');
const qWarnOpen  = document.getElementById('quizlet-warn-open');
let qWarnAutoTimer = null;

function getQuizletWarnSkipped() {
  try { return localStorage.getItem(QUIZLET_WARN_KEY) === '1'; }
  catch (_) { return false; }
}
function setQuizletWarnSkipped(on) {
  try { localStorage.setItem(QUIZLET_WARN_KEY, on ? '1' : '0'); }
  catch (_) {}
}

function openQuizlet(note) {
  const url = note && note.quizletUrl;
  if (!url) return;
  // If the student has chosen "don't show again", let the anchor's
  // native navigation happen — we don't preventDefault and the
  // browser opens the new tab as a user-initiated click.
  if (getQuizletWarnSkipped() || !qWarnModal) {
    openInNewTab(url);
    return;
  }
  qWarnSkip.checked = false;
  qWarnOpen.href = url;
  qWarnModal.style.display = 'flex';
  qWarnModal.offsetHeight;
  qWarnModal.classList.add('open');
}

function closeQuizletWarn() {
  if (!qWarnModal) return;
  qWarnModal.classList.remove('open');
  if (qWarnAutoTimer) { clearTimeout(qWarnAutoTimer); qWarnAutoTimer = null; }
  setTimeout(() => { qWarnModal.style.display = 'none'; }, 200);
}

if (qWarnModal) {
  // The "Open Quizlet" button is a real anchor — clicking it is a
  // user gesture that opens the tab. Record the skip choice on
  // click so future opens bypass the popup.
  qWarnOpen.addEventListener('click', () => {
    if (qWarnSkip.checked) setQuizletWarnSkipped(true);
    setTimeout(closeQuizletWarn, 50);
  });
  qWarnModal.addEventListener('click', (e) => {
    const role = e.target.dataset.close;
    if (!role) return;
    if (role === 'overlay' && e.target !== qWarnModal) return;
    closeQuizletWarn();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qWarnModal.classList.contains('open')) closeQuizletWarn();
  });
}

function closeGdocsModal() {
  gdocsWarnModal.classList.remove('open');
  setTimeout(() => { gdocsWarnModal.style.display = 'none'; }, 220);
}

// The "Open in new tab" anchor handles the open via its native target.
// We piggy-back on its click to record the "don't show again" preference
// and close the modal. Because it's an anchor with target=_blank, the
// new tab opens correctly.
gdocsWarnOpen.addEventListener('click', () => {
  if (gdocsWarnSkip.checked) setGdocsSkipped(true);
  setTimeout(closeGdocsModal, 50);
});

// Cancel / overlay / × → just close.
gdocsWarnModal.addEventListener('click', (e) => {
  const role = e.target.dataset.close;
  if (!role) return;
  if (role === 'overlay' && e.target !== gdocsWarnModal) return;
  closeGdocsModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gdocsWarnModal.classList.contains('open')) closeGdocsModal();
});


/* ==========================================================================
   Report a problem — anonymous error reports written to Firestore
   /reports. No personal info is collected; user agent and current path
   are stored to help reproduce. Admin reviews these in /admin.
   ========================================================================== */
(function setupReportForm() {
  const card     = document.getElementById('report-card');
  if (!card) return;
  const toggle   = document.getElementById('report-toggle');
  const collapse = document.getElementById('report-collapse');
  const form     = document.getElementById('report-form');
  const catSel   = document.getElementById('report-category');
  const msgEl    = document.getElementById('report-message');
  const btn      = document.getElementById('report-submit');
  const statusEl = document.getElementById('report-status');

  toggle.addEventListener('click', () => {
    const open = !collapse.hidden;
    if (open) {
      collapse.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    } else {
      collapse.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      setTimeout(() => msgEl.focus(), 50);
    }
  });

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.classList.remove('ok', 'err');
    if (kind) statusEl.classList.add(kind);
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const message = msgEl.value.trim();
    const category = catSel.value;
    if (!message) { setStatus('Please describe the issue first.', 'err'); msgEl.focus(); return; }
    // Light throttle so the same person can't spam reports.
    try {
      const last = parseInt(sessionStorage.getItem('finals.lastReportAt') || '0', 10);
      if (Date.now() - last < 8000) { setStatus('Just a moment — try again in a few seconds.', 'err'); return; }
    } catch (e) {}

    btn.disabled = true;
    btn.textContent = 'Sending…';
    setStatus('');
    try {
      await addDoc(collection(db, 'reports'), {
        message: message.slice(0, 500),
        category: category || 'other',
        path: (location && location.pathname) || '',
        userAgent: (navigator && navigator.userAgent ? navigator.userAgent.slice(0, 240) : ''),
        resolved: false,
        createdAt: serverTimestamp()
      });
      try { sessionStorage.setItem('finals.lastReportAt', String(Date.now())); } catch (e) {}
      form.reset();
      setStatus('Thanks — your report was sent. ✓', 'ok');
      // Auto-collapse after a moment so the panel doesn't stay sitting open.
      setTimeout(() => {
        collapse.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        setStatus('');
      }, 3500);
    } catch (err) {
      console.error('[report] write failed:', err);
      setStatus('Could not send: ' + (err.message || err), 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send report';
    }
  });
})();

/* ==========================================================================
   Request from admin — non-admin students suggest something they want
   added. Writes to /requests Firestore collection. Admin sees pending
   requests in the /admin dashboard.
   ========================================================================== */
(function setupRequestForm() {
  const REQ_NAME_KEY = 'finals.uploaderName';   // reuse name cache from upload
  const toggle    = document.getElementById('request-toggle');
  const modal     = document.getElementById('request-modal');
  const form      = document.getElementById('request-form');
  const nameEl    = document.getElementById('req-name');
  const titleEl   = document.getElementById('req-title');
  const subjectEl = document.getElementById('req-subject');
  const descEl    = document.getElementById('req-desc');
  const linkEl    = document.getElementById('req-link');
  const submitBtn = document.getElementById('request-submit-btn');
  const statusEl  = document.getElementById('request-status');
  if (!toggle || !modal || !form) return;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'upload-status' + (kind ? ' ' + kind : '');
  }

  function openModal() {
    try {
      const cached = localStorage.getItem(REQ_NAME_KEY);
      if (cached && !nameEl.value) nameEl.value = cached;
    } catch (_) {}
    setStatus('', '');
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    setTimeout(() => {
      (nameEl.value ? titleEl : nameEl).focus();
    }, 60);
  }

  function closeModal() {
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 200);
  }

  toggle.addEventListener('click', openModal);
  modal.addEventListener('click', (e) => {
    const role = e.target.dataset.close;
    if (!role) return;
    if (role === 'overlay' && e.target !== modal) return;
    closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name    = nameEl.value.trim();
    const title   = titleEl.value.trim();
    const subject = subjectEl.value || '';
    const desc    = descEl.value.trim();
    const link    = linkEl.value.trim();

    if (!name)  { setStatus('Please enter your name.', 'err'); return; }
    if (!title) { setStatus('Please describe what you\'re asking for.', 'err'); return; }
    if (link && !/^https?:\/\//i.test(link)) {
      setStatus('Link must start with http:// or https://', 'err');
      return;
    }

    try { localStorage.setItem(REQ_NAME_KEY, name); } catch (_) {}

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    setStatus('Sending…', 'info');

    try {
      await addDoc(collection(db, 'requests'), {
        requesterName: name,
        title,
        subject,
        description: desc,
        link,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setStatus('✓ Sent — thanks! The admin will see it on the dashboard.', 'ok');
      form.reset();
      nameEl.value = name;   // keep the name cached in the form
      setTimeout(closeModal, 1200);
    } catch (err) {
      console.error('[request] write failed:', err);
      setStatus('Could not send: ' + (err.message || err), 'err');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
    }
  });
})();
