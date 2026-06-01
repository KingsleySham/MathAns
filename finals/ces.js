// CES Study Hub — dedicated page logic.
// Subscribes to /notes, filters to subject === 'CES' and not-archived,
// renders dark-theme cards, and re-uses the existing viewer + Google
// Workspace warning modals from style.css. Click tracking still hits
// Firestore so the admin dashboard counts CES-page interactions too.

import {
  db, collection, doc, updateDoc,
  onSnapshot, query, orderBy, increment
} from './firebase-init.js';

const CES_SUBJECT = 'CES';

const gridEl       = document.getElementById('ces-grid');
const emptyEl      = document.getElementById('ces-empty');
const filterChips  = document.querySelectorAll('[data-ces-filter]');
const searchEl     = document.getElementById('ces-search');
const statTotal    = document.getElementById('ces-stat-total');
const statNotes    = document.getElementById('ces-stat-notes');
const statPapers   = document.getElementById('ces-stat-papers');
const adminBadge   = document.getElementById('admin-badge');

let allNotes = [];
let activeFilter = 'all';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
function fmtRel(ts) {
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
function isPreviewable(name) {
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();
  return ['pdf','png','jpg','jpeg','webp','gif','txt','doc','docx','html','htm'].includes(ext);
}

/* Admin badge (reuses sessionStorage key from main hub) */
try {
  if (sessionStorage.getItem('finals.adminPasscode') && adminBadge) adminBadge.hidden = false;
} catch (_) {}

function isAdmin() {
  try { return !!sessionStorage.getItem('finals.adminPasscode'); }
  catch (_) { return false; }
}

const CLICK_FIELDS = {
  view: 'clicksView', download: 'clicksDownload',
  'gdocs-open': 'clicksGdocs', 'quizlet-open': 'clicksQuizlet',
};
function trackClick(noteId, action) {
  if (isAdmin()) return;
  const field = CLICK_FIELDS[action];
  if (!field || !noteId) return;
  updateDoc(doc(db, 'notes', noteId), { [field]: increment(1) })
    .catch(err => console.warn('[ces] click track failed:', err));
}

/* ---------- Filter chips ---------- */
filterChips.forEach(b => b.addEventListener('click', () => {
  filterChips.forEach(x => x.classList.toggle('active', x === b));
  activeFilter = b.dataset.cesFilter;
  render();
}));
if (searchEl) searchEl.addEventListener('input', render);

/* Tracks — each one accepts a list of `aliases` so a note tagged
   'question-bank' OR 'bank' both land in the Question bank card,
   etc. (Tag normalisation lowercases and hyphenates, so the admin
   typing 'Question Bank' produces 'question-bank'.) Regex `re` is
   used as the fallback only when a note has no tags at all. */
const TRACKS = {
  '100':        { label: 'Aim for 100% — Precise notes',
                  aliases: ['100', 'aim-100', 'aim-for-100', 'precise', '100%'],
                  re: /precise|100|comprehensive|aiming/i },
  'balanced':   { label: 'Balanced — Best of both',
                  aliases: ['balanced', 'balance'],
                  re: /balanced|standard|core/i },
  'pass':       { label: 'Just to pass — Condensed notes',
                  aliases: ['pass', 'just-to-pass', 'condensed'],
                  re: /condensed|brief|pass|essential/i },
  'bank':       { label: 'Question bank',
                  aliases: ['bank', 'question-bank', 'questionbank', 'knowledge-check',
                            'exercises', 'exercise', 'practice', 'qbank'],
                  re: /question[- ]?bank|knowledge[- ]?check|exercises?\b|practice/i,
                  excludeMock: true },
  'mock':       { label: 'Mock papers',
                  aliases: ['mock', 'mock-paper', 'mock-papers', 'past-paper', 'past-papers'],
                  re: /mock|exam practice|past paper/i,
                  mockOnly: true },
  'flashcards': { label: 'Flashcards',
                  aliases: ['flashcards', 'flashcard', 'quizlet'],
                  re: /flashcards?\b|quizlet/i,
                  flashcardsOnly: true },
  'textbook':   { label: 'E-Textbook',
                  aliases: ['textbook', 'e-textbook', 'etextbook', 'ebook', 'book'],
                  re: /textbook|e[- ]?book|chapter/i }
};
let activeTrack = null;
const trackButtons = document.querySelectorAll('[data-ces-track]');
const activeFilterEl = document.getElementById('ces-active-filter');
const activeFilterLabelEl = document.getElementById('ces-active-filter-label');
const clearFilterBtn = document.getElementById('ces-clear-filter');

trackButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.cesTrack;
    if (activeTrack === key) {
      activeTrack = null;
    } else {
      activeTrack = key;
    }
    trackButtons.forEach(b => b.classList.toggle('is-active', b.dataset.cesTrack === activeTrack));
    if (activeTrack && activeFilterEl) {
      activeFilterEl.hidden = false;
      activeFilterLabelEl.textContent = 'Showing: ' + (TRACKS[activeTrack].label || activeTrack);
    } else if (activeFilterEl) {
      activeFilterEl.hidden = true;
    }
    render();
    // Smooth-scroll to the library so it's clear something happened.
    if (activeTrack) {
      const libEl = document.querySelector('.ces-section .ces-grid');
      if (libEl) libEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
if (clearFilterBtn) clearFilterBtn.addEventListener('click', () => {
  activeTrack = null;
  trackButtons.forEach(b => b.classList.remove('is-active'));
  if (activeFilterEl) activeFilterEl.hidden = true;
  render();
});

function matchesTrack(n, key) {
  const t = TRACKS[key];
  if (!t) return true;
  if (t.mockOnly && n.type !== 'mock_paper') return false;
  if (t.excludeMock && n.type === 'mock_paper') return false;
  // Flashcards track: requires a Quizlet link to be useful.
  if (t.flashcardsOnly && !n.quizletUrl) return false;

  // Anything with a Quizlet link is, by definition, a flashcard set —
  // surface it under the Flashcards track even if it has no explicit
  // tag yet.
  if (key === 'flashcards' && n.quizletUrl) return true;

  // Tags are authoritative when present. Each track has a list of
  // aliases (e.g. 'bank' / 'question-bank' / 'knowledge-check' all
  // map to the Question bank track) so the admin can type whatever
  // form they like and it still lands in the right section.
  const tags = Array.isArray(n.tags) ? n.tags : [];
  if (tags.length > 0) {
    const aliases = t.aliases || [key];
    return tags.some(tag => aliases.includes(tag));
  }

  // Untagged notes fall back to regex on title + description.
  const hay = `${n.title || ''} ${n.description || ''}`;
  return t.re.test(hay);
}

function countTrack(key) {
  return allNotes.filter(n => matchesTrack(n, key)).length;
}

/* ---------- Render ---------- */
function passesFilter(n) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'notes')      return n.type === 'notes' || (!n.type && n.downloadUrl);
  if (activeFilter === 'mock_paper') return n.type === 'mock_paper';
  if (activeFilter === 'links')      return !n.downloadUrl && (!!n.gdocsUrl || !!n.quizletUrl);
  return true;
}

function render() {
  const q = (searchEl && searchEl.value || '').trim().toLowerCase();
  const filtered = allNotes.filter(n => {
    if (!passesFilter(n)) return false;
    if (activeTrack && !matchesTrack(n, activeTrack)) return false;
    if (!q) return true;
    return (n.title || '').toLowerCase().includes(q) ||
           (n.description || '').toLowerCase().includes(q) ||
           (n.uploaderName || '').toLowerCase().includes(q);
  });

  // Update per-track counts wherever a [data-track-count] sits.
  document.querySelectorAll('[data-track-count]').forEach(el => {
    const k = el.dataset.trackCount;
    const n = countTrack(k);
    el.textContent = n > 0 ? (n + (n === 1 ? ' item' : ' items')) : 'Coming soon';
    el.classList.toggle('is-empty', n === 0);
  });

  if (filtered.length === 0) {
    gridEl.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = allNotes.length === 0
      ? 'No CES notes have been added yet. Check back soon.'
      : 'No CES notes match that filter.';
    gridEl.appendChild(emptyEl);
    return;
  }
  emptyEl.style.display = 'none';

  gridEl.innerHTML = filtered.map((n, idx) => {
    const isMock = n.type === 'mock_paper';
    const hasFile = !!n.downloadUrl;
    const hasGdocs = !!n.gdocsUrl;
    const hasQuizlet = !!n.quizletUrl;
    const canPreview = hasFile && isPreviewable(n.fileName);
    const cls = hasFile ? (isMock ? 'mock_paper' : 'notes') : 'links';
    const label = isMock ? 'Mock Paper' : (hasFile ? 'Notes' : 'Link');

    const actions = [];
    if (canPreview) actions.push(`<button class="ces-btn-view" data-action="view">View</button>`);
    if (hasFile) actions.push(`<a class="ces-btn-download" data-action="download" href="${esc(n.downloadUrl)}" target="_blank" rel="noopener" download="${esc(n.fileName || '')}">Download</a>`);
    if (hasGdocs) actions.push(`<button class="ces-btn-gdocs" data-action="gdocs-open">📄 Workspace</button>`);
    if (hasQuizlet) actions.push(`<a class="ces-btn-quizlet" data-action="quizlet-open" href="${esc(n.quizletUrl)}" target="_blank" rel="noopener">Q Flashcards</a>`);

    return `
      <div class="ces-card" data-id="${esc(n.id)}" style="animation-delay:${Math.min(idx * 35, 600)}ms;">
        <div class="ces-card-top">
          <div class="ces-card-title">${esc(n.title || '(untitled)')}</div>
          <div class="ces-card-type ces-card-type-${cls}">${label}</div>
        </div>
        <div class="ces-card-meta">
          <span>by ${esc(n.uploaderName || 'Anonymous')}</span>
          ${hasFile ? `<span>· ${fmtBytes(n.fileSize)}</span>` : ''}
          <span>· ${esc(fmtRel(n.createdAt))}</span>
        </div>
        ${n.description ? `<div class="ces-card-desc">${esc(n.description)}</div>` : ''}
        ${Array.isArray(n.tags) && n.tags.length ? `<div class="ces-card-tags">${n.tags.map(t => `<span class="note-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="ces-card-actions">${actions.join('')}</div>
      </div>
    `;
  }).join('');
}

/* ---------- Card click dispatch ---------- */
gridEl.addEventListener('click', (e) => {
  const card = e.target.closest('.ces-card');
  if (!card) return;
  const note = allNotes.find(n => n.id === card.dataset.id);
  if (!note) return;
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  trackClick(note.id, action);
  if (action === 'view')          { openViewer(note); }
  else if (action === 'gdocs-open') { openGdocs(note); }
  // 'download' and 'quizlet-open' are native anchors — let them navigate.
});

/* ---------- Viewer modal (re-implements the parts we need) ---------- */
const viewerModal    = document.getElementById('viewer-modal');
const viewerTitle    = document.getElementById('viewer-title');
const viewerMeta     = document.getElementById('viewer-meta');
const viewerDownload = document.getElementById('viewer-download');
const viewerBody     = document.getElementById('viewer-body');

function openViewer(note) {
  viewerTitle.textContent = note.title || '(untitled)';
  viewerMeta.textContent = [
    'CES',
    note.uploaderName ? 'by ' + note.uploaderName : null,
    fmtBytes(note.fileSize)
  ].filter(Boolean).join(' · ');
  viewerDownload.href = note.downloadUrl || '#';
  viewerDownload.setAttribute('download', note.fileName || 'download');
  viewerDownload.textContent = 'Download';
  viewerBody.innerHTML = '<div class="viewer-loading">Loading…</div>';
  viewerModal.style.display = 'flex';

  const ext = (String(note.fileName || '').split('.').pop() || '').toLowerCase();
  if (['png','jpg','jpeg','webp','gif'].includes(ext)) {
    viewerBody.innerHTML = `<img src="${esc(note.downloadUrl)}" alt="${esc(note.title || '')}" class="viewer-img" />`;
  } else if (ext === 'pdf') {
    // Try /api/pdf (sets correct Content-Type) — falls back to raw.
    const target = note.filePath ? '/api/pdf?path=' + encodeURIComponent(note.filePath) : note.downloadUrl;
    window.open(target, '_blank', 'noopener');
    viewerBody.innerHTML = `<div class="viewer-loading">Opened in a new tab.</div>`;
  } else if (ext === 'txt') {
    fetch(note.downloadUrl).then(r => r.text()).then(t => {
      viewerBody.innerHTML = `<pre class="viewer-text">${esc(t)}</pre>`;
    }).catch(err => { viewerBody.innerHTML = `<div class="viewer-error">Couldn't load: ${esc(err.message)}</div>`; });
  } else if (['doc','docx'].includes(ext)) {
    const src = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(note.downloadUrl);
    viewerBody.innerHTML = `<iframe src="${src}" class="viewer-iframe" title="${esc(note.title || '')}"></iframe>`;
  } else if (['html','htm'].includes(ext)) {
    fetch(note.downloadUrl).then(r => r.text()).then(html => {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      viewerBody.dataset.blobUrl = url;
      viewerBody.innerHTML = `<iframe src="${url}" class="viewer-iframe" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" title="${esc(note.title || '')}"></iframe>`;
    }).catch(err => { viewerBody.innerHTML = `<div class="viewer-error">Couldn't load: ${esc(err.message)}</div>`; });
  } else {
    viewerBody.innerHTML = `<div class="viewer-error">Preview not available. Use Download.</div>`;
  }
}
function closeViewer() {
  const url = viewerBody.dataset.blobUrl;
  if (url) { URL.revokeObjectURL(url); delete viewerBody.dataset.blobUrl; }
  viewerBody.innerHTML = '';
  viewerModal.style.display = 'none';
}
viewerModal.addEventListener('click', (e) => {
  const role = e.target.dataset.close;
  if (!role) return;
  if (role === 'overlay' && e.target !== viewerModal) return;
  closeViewer();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && viewerModal.style.display === 'flex') closeViewer();
});

/* ---------- Google Workspace warning modal ---------- */
const GDOCS_SKIP_KEY = 'finals.gdocsWarnSkipped';
const gdocsWarnModal = document.getElementById('gdocs-warn-modal');
const gdocsWarnSkip  = document.getElementById('gdocs-warn-skip');
const gdocsWarnOpen  = document.getElementById('gdocs-warn-open');
function gdocsSkipped() {
  try { return localStorage.getItem(GDOCS_SKIP_KEY) === '1'; }
  catch (_) { return false; }
}
function openInNewTab(url) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
function openGdocs(note) {
  const url = note.gdocsUrl || '#';
  if (gdocsSkipped()) { openInNewTab(url); return; }
  gdocsWarnSkip.checked = false;
  gdocsWarnOpen.href = url;
  gdocsWarnModal.style.display = 'flex';
  gdocsWarnModal.offsetHeight;
  gdocsWarnModal.classList.add('open');
}
function closeGdocsModal() {
  gdocsWarnModal.classList.remove('open');
  setTimeout(() => { gdocsWarnModal.style.display = 'none'; }, 220);
}
gdocsWarnOpen.addEventListener('click', () => {
  if (gdocsWarnSkip.checked) {
    try { localStorage.setItem(GDOCS_SKIP_KEY, '1'); } catch (_) {}
  }
  setTimeout(closeGdocsModal, 50);
});
gdocsWarnModal.addEventListener('click', (e) => {
  const role = e.target.dataset.close;
  if (!role) return;
  if (role === 'overlay' && e.target !== gdocsWarnModal) return;
  closeGdocsModal();
});

/* ---------- Firestore subscription ---------- */
onSnapshot(
  query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
  (snap) => {
    allNotes = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.archived) return;
      if (data.subject !== CES_SUBJECT) return;
      allNotes.push({ id: d.id, ...data });
    });
    statTotal.textContent  = allNotes.length;
    statNotes.textContent  = allNotes.filter(n => n.type !== 'mock_paper').length;
    statPapers.textContent = allNotes.filter(n => n.type === 'mock_paper').length;
    render();
  },
  (err) => {
    console.error('[ces] notes listener:', err);
    gridEl.innerHTML = '';
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'Could not load CES notes: ' + (err.message || err);
    gridEl.appendChild(emptyEl);
  }
);
