// Subject Study Hub — dynamic, config-driven renderer.
//
// One module renders every dedicated subject page. The page shell
// (subject.html) is an empty container; this module derives the slug from
// the URL, loads the live page config from Firestore (state/subjectPages,
// edited from /admin), and renders the hero + sections from that config.
// Falls back to built-in defaults so the original four pages render even
// before anything is published.
//
// Re-uses the viewer + Google Workspace warning modals from the shell and
// records clicks/visits/presence in Firestore so the admin dashboard
// counts these pages too.

import {
  db, collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, increment, serverTimestamp
} from './firebase-init.js';
import {
  resolveConfig, applyPalette, slugFromLocation
} from './subject-templates.js';

export function initSubjectPage(opts = {}) {
  const SLUG = (opts.slug || slugFromLocation() || '').toLowerCase();

  const root = document.getElementById('subject-root');
  if (!root) { console.error('[subject] no #subject-root'); return; }

  const state = {
    config: null,
    rawNotes: [],   // every non-archived note, all subjects
    notes: [],      // filtered to this page's subject
    notesLoaded: false,
    activeFilter: null,  // null = nothing picked yet (show prompt, not all)
    activeCardId: null,
    cardsById: new Map(),
  };

  // Re-derive the subject-filtered list + stat tiles from rawNotes. Called
  // whenever notes OR config change (config decides the subject filter).
  function recomputeNotes() {
    const subj = subjectFilter();
    state.notes = state.rawNotes.filter(n => !subj || n.subject === subj);
    const t = document.getElementById('ces-stat-total');
    const nn = document.getElementById('ces-stat-notes');
    const pp = document.getElementById('ces-stat-papers');
    if (t)  t.textContent  = state.notes.length;
    if (nn) nn.textContent = state.notes.filter(n => n.type !== 'mock_paper').length;
    if (pp) pp.textContent = state.notes.filter(n => n.type === 'mock_paper').length;
    renderNotes();
  }

  /* ---------- small utils ---------- */
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
  function isHtmlFile(name) {
    const ext = (String(name || '').split('.').pop() || '').toLowerCase();
    return ext === 'html' || ext === 'htm';
  }
  function isAdmin() {
    try { return !!sessionStorage.getItem('finals.adminPasscode'); }
    catch (_) { return false; }
  }
  function label() { return (state.config && state.config.label) || 'Subject'; }
  function subjectFilter() { return state.config && state.config.subject; }

  /* ---------- analytics ---------- */
  const CLICK_FIELDS = {
    view: 'clicksView', download: 'clicksDownload',
    'gdocs-open': 'clicksGdocs', 'quizlet-open': 'clicksQuizlet',
  };
  const CLICK_BUCKET = { view: 'view', download: 'download', 'gdocs-open': 'gdocs', 'quizlet-open': 'quizlet' };
  function recordAggregateClick(action) {
    const bucket = CLICK_BUCKET[action];
    if (!bucket) return;
    const now = new Date();
    setDoc(doc(db, 'state', 'clickStats'), {
      totalClicks: increment(1),
      byHour:      { [String(now.getHours())]: increment(1) },
      byDayOfWeek: { [String(now.getDay())]:  increment(1) },
      byAction:    { [bucket]: increment(1) },
      byPage:      { [SLUG]: { [bucket]: increment(1) } },
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(err => console.warn('[' + SLUG + '] aggregate failed:', err));
  }
  function trackClick(noteId, action) {
    if (isAdmin()) return;
    const field = CLICK_FIELDS[action];
    if (!field || !noteId) return;
    updateDoc(doc(db, 'notes', noteId), { [field]: increment(1) })
      .catch(err => console.warn('[' + SLUG + '] click track failed:', err));
    recordAggregateClick(action);
  }
  function recordVisit() {
    if (isAdmin()) return;
    let firstVisit = false;
    try {
      if (!localStorage.getItem('finals.visitorId')) {
        localStorage.setItem('finals.visitorId', 'v_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
        firstVisit = true;
      }
    } catch (_) {}
    const patch = {
      pageViews: increment(1),
      byPage: { [SLUG]: { visits: increment(1) } },
      updatedAt: serverTimestamp(),
    };
    if (firstVisit) patch.uniqueVisitors = increment(1);
    setDoc(doc(db, 'state', 'clickStats'), patch, { merge: true })
      .catch(err => console.warn('[' + SLUG + '] visit track failed:', err));
  }

  /* Per-section + per-folder engagement for the admin Insights tab.
     Section = the active card; folder = the note's folder. Admin skips. */
  function sanitizeTag(tag) {
    const t = String(tag || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return t || 'untagged';
  }
  function recordSectionOpen(card) {
    if (isAdmin() || !card) return;
    const tag = card.tag || 'untagged';
    setDoc(doc(db, 'state', 'clickStats'), {
      bySection: { [SLUG + '__' + sanitizeTag(tag)]: {
        open: increment(1),
        label: card.title || tag,
        page: SLUG,
      } },
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }
  function recordItemEngagement(action, note) {
    if (isAdmin()) return;
    const bucket = CLICK_BUCKET[action];
    if (!bucket) return;
    const activeCard = state.activeCardId ? state.cardsById.get(state.activeCardId) : null;
    const patch = { updatedAt: serverTimestamp() };
    if (note && note.folderId) patch.byFolder = { [note.folderId]: { [bucket]: increment(1) } };
    if (activeCard) {
      const tag = activeCard.tag || 'untagged';
      patch.bySection = { [SLUG + '__' + sanitizeTag(tag)]: {
        [bucket]: increment(1),
        label: activeCard.title || tag,
        page: SLUG,
      } };
    }
    if (patch.byFolder || patch.bySection) {
      setDoc(doc(db, 'state', 'clickStats'), patch, { merge: true }).catch(() => {});
    }
  }

  /* ---------- card matching ---------- */
  function matchesCard(n, card) {
    if (!card) return true;
    // Flashcards card is link-based (anything with a Quizlet set).
    if (card.kind === 'flashcardsOnly') return !!n.quizletUrl;
    // Mock papers belong ONLY under a mock-only card — never under study
    // tracks, question banks or the textbook, even if they happen to share
    // a tag. Conversely the mock card never shows non-mock notes.
    if (card.kind === 'mockOnly') return n.type === 'mock_paper';
    if (n.type === 'mock_paper') return false;
    // Note/track/textbook cards: match on the card's tag.
    const tags = Array.isArray(n.tags) ? n.tags : [];
    if (tags.length) return tags.includes(card.tag);
    // Untagged fallback: loose match on title/description.
    const hay = `${n.title || ''} ${n.description || ''}`.toLowerCase();
    return card.tag ? hay.includes(String(card.tag).toLowerCase()) : false;
  }
  function countCard(card) { return state.notes.filter(n => matchesCard(n, card)).length; }

  /* ---------- HTML builders ---------- */
  function heroHTML(cfg) {
    const floats = (cfg.floatEmojis || []).map((e, i) =>
      `<span class="ces-float-i" style="--i:${i}">${esc(e)}</span>`).join('');
    return `
      <header class="ces-hero">
        <a class="ces-back" href="/finals/">← Finals hub</a>
        <a class="admin-badge ces-admin-badge" id="admin-badge" href="/admin" hidden title="Signed in as admin">
          <span class="admin-badge-icon" aria-hidden="true">🛡</span>
          <span class="admin-badge-label">Admin</span>
        </a>
        <div class="ces-blob ces-blob-1" aria-hidden="true"></div>
        <div class="ces-blob ces-blob-2" aria-hidden="true"></div>
        <div class="ces-blob ces-blob-3" aria-hidden="true"></div>
        <div class="ces-float" aria-hidden="true">${floats}</div>
        <div class="ces-hero-inner">
          <div class="ces-eyebrow">${esc(cfg.eyebrow || '')}</div>
          <h1 class="ces-title">${esc(cfg.titleLead || cfg.label || '')} <span>${esc(cfg.titleAccent || 'Study Hub')}</span></h1>
          <p class="ces-sub">${esc(cfg.subtitle || '')}</p>
          <div class="ces-stat-row">
            <div class="ces-stat"><span class="ces-stat-num" id="ces-stat-total">0</span><span class="ces-stat-lab">items</span></div>
            <div class="ces-stat-divider"></div>
            <div class="ces-stat"><span class="ces-stat-num" id="ces-stat-notes">0</span><span class="ces-stat-lab">notes</span></div>
            <div class="ces-stat-divider"></div>
            <div class="ces-stat"><span class="ces-stat-num" id="ces-stat-papers">0</span><span class="ces-stat-lab">mocks</span></div>
          </div>
        </div>
      </header>`;
  }

  function regId(card) {
    const id = 'c' + state.cardsById.size;
    state.cardsById.set(id, card);
    return id;
  }

  function tracksHTML(sec) {
    if (!sec || !sec.enabled) return '';
    const cls = ['ces-track-100', 'ces-track-balanced', 'ces-track-pass'];
    const cards = (sec.cards || []).map((c, i) => {
      const id = regId(c);
      return `
        <button class="ces-track ${cls[i % cls.length]}" data-card="${id}">
          <div class="ces-track-icon">${esc(c.emoji || '🎯')}</div>
          ${c.pill ? `<div class="ces-track-pill">${esc(c.pill)}</div>` : ''}
          <div class="ces-track-title">${esc(c.title || '')}</div>
          <div class="ces-track-sub">${esc(c.sub || '')}</div>
          <div class="ces-track-count" data-count="${id}"></div>
        </button>`;
    }).join('');
    return `
      <section class="ces-section">
        <div class="ces-section-head">
          <div class="ces-section-eyebrow">${esc(sec.eyebrow || 'Study tracks')}</div>
          <h2 class="ces-section-title">${esc(sec.title || 'Pick your battle')}</h2>
          ${sec.sub ? `<p class="ces-section-sub">${esc(sec.sub)}</p>` : ''}
        </div>
        <div class="ces-tracks">${cards}</div>
      </section>`;
  }

  function practiceHTML(sec) {
    if (!sec || !sec.enabled) return '';
    const cls = ['ces-pract-bank', 'ces-pract-mock'];
    const cards = (sec.cards || []).map((c, i) => {
      const id = regId(c);
      return `
        <button class="ces-pract ${cls[i % cls.length]}" data-card="${id}">
          <div class="ces-pract-icon">${esc(c.emoji || '📚')}</div>
          <div class="ces-pract-text">
            <div class="ces-pract-title">${esc(c.title || '')}</div>
            <div class="ces-pract-sub">${esc(c.sub || '')}</div>
          </div>
          <div class="ces-pract-count" data-count="${id}"></div>
        </button>`;
    }).join('');
    return `
      <section class="ces-section">
        <div class="ces-section-head">
          <div class="ces-section-eyebrow">${esc(sec.eyebrow || 'Practice')}</div>
          <h2 class="ces-section-title">${esc(sec.title || 'Two ways to drill')}</h2>
          ${sec.sub ? `<p class="ces-section-sub">${esc(sec.sub)}</p>` : ''}
        </div>
        <div class="ces-practice">${cards}</div>
      </section>`;
  }

  function flashcardsHTML(sec) {
    if (!sec || !sec.enabled) return '';
    const c = sec.card || {};
    const id = regId({ ...c, kind: 'flashcardsOnly', tag: c.tag || 'flashcards' });
    return `
      <section class="ces-section">
        <button class="ces-flashcards" data-card="${id}">
          <div class="ces-fc-stack" aria-hidden="true">
            <div class="ces-fc-card ces-fc-c3"><span>Q</span></div>
            <div class="ces-fc-card ces-fc-c2"><span>?</span></div>
            <div class="ces-fc-card ces-fc-c1">
              <svg viewBox="0 0 48 48" width="32" height="32">
                <rect x="4" y="4" width="40" height="40" rx="10" fill="#2563eb"/>
                <text x="24" y="33" font-family="-apple-system, sans-serif" font-size="22" font-weight="800" fill="white" text-anchor="middle">Q</text>
              </svg>
            </div>
            <div class="ces-fc-sparkle ces-fc-sp1">✨</div>
            <div class="ces-fc-sparkle ces-fc-sp2">⚡</div>
          </div>
          <div class="ces-flashcards-text">
            <div class="ces-flashcards-eyebrow">${esc(sec.eyebrow || '⚡ Flashcards')}</div>
            <div class="ces-flashcards-title">${esc(sec.title || c.title || 'Quizlet — drill terms fast')}</div>
            <div class="ces-flashcards-sub">${esc(sec.sub || c.sub || '')}</div>
            <div class="ces-flashcards-count" data-count="${id}"></div>
          </div>
          <div class="ces-flashcards-arrow">→</div>
        </button>
      </section>`;
  }

  function textbookHTML(sec) {
    if (!sec || !sec.enabled) return '';
    const c = sec.card || {};
    const id = regId({ ...c, tag: c.tag || 'textbook' });
    return `
      <section class="ces-section">
        <button class="ces-textbook" data-card="${id}">
          <div class="ces-textbook-illustration" aria-hidden="true">
            <div class="ces-tb-book">
              <div class="ces-tb-page ces-tb-p1"></div>
              <div class="ces-tb-page ces-tb-p2"></div>
              <div class="ces-tb-page ces-tb-p3"></div>
              <div class="ces-tb-spine"></div>
            </div>
            <div class="ces-tb-sparkle ces-tb-s1">✨</div>
            <div class="ces-tb-sparkle ces-tb-s2">📖</div>
            <div class="ces-tb-sparkle ces-tb-s3">📑</div>
          </div>
          <div class="ces-textbook-text">
            <div class="ces-textbook-eyebrow">${esc(sec.eyebrow || '📖 E-Textbook')}</div>
            <div class="ces-textbook-title">${esc(sec.title || c.title || 'The full digital textbook')}</div>
            <div class="ces-textbook-sub">${esc(sec.sub || c.sub || '')}</div>
            <div class="ces-textbook-count" data-count="${id}"></div>
          </div>
          <div class="ces-textbook-arrow">→</div>
        </button>
      </section>`;
  }

  function libraryHTML(cfg) {
    return `
      <section class="ces-section">
        <div class="ces-section-head">
          <div class="ces-section-eyebrow">All items</div>
          <h2 class="ces-section-title">Library</h2>
        </div>
        <div class="ces-filters">
          <button class="ces-chip" data-ces-filter="all">All</button>
          <button class="ces-chip" data-ces-filter="notes">Notes</button>
          <button class="ces-chip" data-ces-filter="mock_paper">Mock papers</button>
          <button class="ces-chip" data-ces-filter="links">Links only</button>
          <div class="ces-search-wrap">
            <input type="search" id="ces-search" placeholder="Search title or description…" />
          </div>
        </div>
        <div class="ces-active-filter" id="ces-active-filter" hidden>
          <span id="ces-active-filter-label"></span>
          <button class="ces-clear-filter" id="ces-clear-filter" type="button">Clear ×</button>
        </div>
        <div class="ces-grid" id="ces-grid">
          <div class="ces-empty" id="ces-empty">Loading ${esc(cfg.label || '')} library…</div>
        </div>
      </section>`;
  }

  /* ---------- mount the page chrome from config ---------- */
  function mount(cfg) {
    state.config = cfg;
    state.cardsById = new Map();
    state.activeCardId = null;
    state.activeFilter = null;

    // Unknown subject.
    if (!cfg) {
      applyPalette(document.body, { accent: '#475569', accent2: '#64748b', accent3: '#94a3b8', bg: '#f8fafc' });
      root.innerHTML = `
        <header class="ces-hero"><div class="ces-hero-inner">
          <a class="ces-back" href="/finals/">← Finals hub</a>
          <h1 class="ces-title">Not <span>found</span></h1>
          <p class="ces-sub">No study hub is set up for “${esc(SLUG)}” yet.</p>
        </div></header>`;
      document.title = 'Subject Study Hub';
      return;
    }

    applyPalette(document.body, cfg.palette);
    document.title = `${cfg.label} Study Hub`;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc && cfg.palette) tc.setAttribute('content', cfg.palette.accent);

    // Unpublished — students see a placeholder, admins get a live preview
    // (either via an admin session or an explicit ?preview=1 link).
    let previewMode = false;
    try { previewMode = new URLSearchParams(window.location.search).get('preview') === '1'; } catch (_) {}
    if (cfg.published === false && !isAdmin() && !previewMode) {
      root.innerHTML = heroHTML(cfg) + `
        <main class="ces-main">
          <div class="ces-empty" style="padding:80px 16px;">
            ✨ This ${esc(cfg.label)} hub is being prepared. Check back soon!
          </div>
        </main>`;
      wireHeroOnly();
      return;
    }

    const s = cfg.sections || {};
    const adminNote = (cfg.published === false)
      ? `<div class="subject-preview-banner">👁 Preview — this page is unpublished. Students can't see it yet.</div>`
      : '';

    root.innerHTML =
      heroHTML(cfg) +
      `<main class="ces-main">` +
        adminNote +
        tracksHTML(s.tracks) +
        practiceHTML(s.practice) +
        flashcardsHTML(s.flashcards) +
        textbookHTML(s.textbook) +
        libraryHTML(cfg) +
      `</main>`;

    setFooter(cfg);
    wireHeroOnly();
    syncChrome();
    recomputeNotes();
  }

  function setFooter(cfg) {
    const f = document.getElementById('subject-footer');
    if (f) {
      f.innerHTML = `
        <div>S.3 ${esc(cfg.label)} ${esc(cfg.emoji || '')}</div>
        <div class="footer-links"><a href="/finals/">← Back to Finals hub</a></div>`;
    }
  }

  function wireHeroOnly() {
    try {
      if (sessionStorage.getItem('finals.adminPasscode')) {
        const b = document.getElementById('admin-badge');
        if (b) b.hidden = false;
      }
    } catch (_) {}
  }

  /* ---------- section interactions ----------
     Listeners are DELEGATED on the persistent #subject-root container and
     attached exactly once (see init below). This survives every re-render
     of the page chrome, so clicks always work no matter how often mount()
     runs. */
  function syncChrome() {
    document.querySelectorAll('[data-ces-filter]').forEach(b =>
      b.classList.toggle('active', b.dataset.cesFilter === state.activeFilter));
    document.querySelectorAll('[data-card]').forEach(b =>
      b.classList.toggle('is-active', b.dataset.card === state.activeCardId));
    const banner = document.getElementById('ces-active-filter');
    const lbl = document.getElementById('ces-active-filter-label');
    const card = state.activeCardId ? state.cardsById.get(state.activeCardId) : null;
    if (banner) {
      if (card) { banner.hidden = false; if (lbl) lbl.textContent = 'Showing: ' + (card.title || card.tag || ''); }
      else banner.hidden = true;
    }
  }
  function selectFilter(f) {
    state.activeFilter = (state.activeFilter === f) ? null : f;
    state.activeCardId = null;
    syncChrome();
    renderNotes();
  }
  function selectCard(id) {
    const card = state.cardsById.get(id);
    if (!card) return;
    state.activeCardId = (state.activeCardId === id) ? null : id;
    state.activeFilter = null;
    syncChrome();
    renderNotes();
    if (state.activeCardId) {
      recordSectionOpen(card);
      const grid = document.getElementById('ces-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function clearPicks() {
    state.activeFilter = null;
    state.activeCardId = null;
    const s = document.getElementById('ces-search');
    if (s) s.value = '';
    syncChrome();
    renderNotes();
  }
  function handleNoteAction(e, cardEl) {
    const note = state.notes.find(n => n.id === cardEl.dataset.id);
    if (!note) return;
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    trackClick(note.id, action);
    recordItemEngagement(action, note);
    if (action === 'view') openViewer(note);
    else if (action === 'gdocs-open') openGdocs(note);
  }
  // One delegated click + input listener for the whole page.
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-ces-filter]');
    if (chip) { selectFilter(chip.dataset.cesFilter); return; }
    const clearBtn = e.target.closest('#ces-clear-filter');
    if (clearBtn) { clearPicks(); return; }
    const cardBtn = e.target.closest('[data-card]');
    if (cardBtn) { selectCard(cardBtn.dataset.card); return; }
    const noteCard = e.target.closest('.ces-card');
    if (noteCard) { handleNoteAction(e, noteCard); return; }
  });
  root.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'ces-search') renderNotes();
  });

  /* ---------- notes render ---------- */
  function passesFilter(n) {
    const f = state.activeFilter;
    if (f === null || f === 'all') return true;
    if (f === 'notes')      return n.type === 'notes' || (!n.type && n.downloadUrl);
    if (f === 'mock_paper') return n.type === 'mock_paper';
    if (f === 'links')      return !n.downloadUrl && (!!n.gdocsUrl || !!n.quizletUrl);
    return true;
  }

  function emptyHTML(msg) {
    return `<div class="ces-empty">${esc(msg)}</div>`;
  }

  function renderNotes() {
    const grid = document.getElementById('ces-grid');
    if (!grid) return;

    // per-card counts (shown on the cards regardless of what's picked)
    document.querySelectorAll('[data-count]').forEach(el => {
      const card = state.cardsById.get(el.dataset.count);
      const n = card ? countCard(card) : 0;
      el.textContent = n > 0 ? (n + (n === 1 ? ' item' : ' items')) : 'Coming soon';
      el.classList.toggle('is-empty', n === 0);
    });

    const searchEl = document.getElementById('ces-search');
    const q = (searchEl && searchEl.value || '').trim().toLowerCase();
    const activeCard = state.activeCardId ? state.cardsById.get(state.activeCardId) : null;
    const picked = state.activeFilter !== null || !!activeCard || q !== '';

    // Nothing picked yet — prompt the user to choose instead of dumping
    // the whole library. (The grid HTML is rebuilt every call so we never
    // depend on a persistent #ces-empty node.)
    if (!picked) {
      grid.innerHTML = emptyHTML(!state.notesLoaded
        ? `Loading ${label()} library…`
        : `👆 Pick a study track, practice format, or a filter above to see ${label()} notes.`);
      return;
    }

    const filtered = state.notes.filter(n => {
      if (!passesFilter(n)) return false;
      if (activeCard && !matchesCard(n, activeCard)) return false;
      if (!q) return true;
      return (n.title || '').toLowerCase().includes(q) ||
             (n.description || '').toLowerCase().includes(q) ||
             (n.uploaderName || '').toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      grid.innerHTML = emptyHTML(!state.notesLoaded
        ? `Loading ${label()} library…`
        : (state.notes.length === 0
            ? `No ${label()} notes have been added yet. Check back soon.`
            : `No ${label()} notes match that filter.`));
      return;
    }

    grid.innerHTML = filtered.map((n, idx) => {
      const isMock = n.type === 'mock_paper';
      const hasFile = !!n.downloadUrl;
      const hasGdocs = !!n.gdocsUrl;
      const hasQuizlet = !!n.quizletUrl;
      const canPreview = hasFile && isPreviewable(n.fileName);
      const cls = hasFile ? (isMock ? 'mock_paper' : 'notes') : 'links';
      const lbl = isMock ? 'Mock Paper' : (hasFile ? 'Notes' : 'Link');
      const actions = [];
      if (canPreview) actions.push(`<button class="ces-btn-view" data-action="view">View</button>`);
      if (hasFile) actions.push(`<a class="ces-btn-download" data-action="download" href="${esc(n.downloadUrl)}" target="_blank" rel="noopener" download="${esc(n.fileName || '')}">Download</a>`);
      if (hasFile && isHtmlFile(n.fileName)) actions.push(`<a class="ces-btn-fullscreen" data-action="fullscreen-open" href="/view/${encodeURIComponent(n.id)}" target="_blank" rel="noopener" aria-label="Open in fullscreen" title="Open in fullscreen"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" fill="currentColor"/></svg></a>`);
      if (hasGdocs) actions.push(`<button class="ces-btn-gdocs" data-action="gdocs-open">📄 Workspace</button>`);
      if (hasQuizlet) actions.push(`<a class="ces-btn-quizlet" data-action="quizlet-open" href="${esc(n.quizletUrl)}" target="_blank" rel="noopener">Q Flashcards</a>`);
      return `
        <div class="ces-card" data-id="${esc(n.id)}" style="animation-delay:${Math.min(idx * 35, 600)}ms;">
          <div class="ces-card-top">
            <div class="ces-card-title">${esc(n.title || '(untitled)')}</div>
            <div class="ces-card-type ces-card-type-${cls}">${lbl}</div>
          </div>
          <div class="ces-card-meta">
            <span>by ${esc(n.uploaderName || 'Anonymous')}</span>
            ${hasFile ? `<span>· ${fmtBytes(n.fileSize)}</span>` : ''}
            <span>· ${esc(fmtRel(n.createdAt))}</span>
          </div>
          ${n.description ? `<div class="ces-card-desc">${esc(n.description)}</div>` : ''}
          ${Array.isArray(n.tags) && n.tags.length ? `<div class="ces-card-tags">${n.tags.map(t => `<span class="note-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
          <div class="ces-card-actions">${actions.join('')}</div>
        </div>`;
    }).join('');
  }

  /* ---------- viewer modal (static in shell) ---------- */
  const viewerModal    = document.getElementById('viewer-modal');
  const viewerTitle    = document.getElementById('viewer-title');
  const viewerMeta     = document.getElementById('viewer-meta');
  const viewerDownload = document.getElementById('viewer-download');
  const viewerBody     = document.getElementById('viewer-body');

  function openViewer(note) {
    if (!viewerModal) return;
    viewerTitle.textContent = note.title || '(untitled)';
    viewerMeta.textContent = [label(), note.uploaderName ? 'by ' + note.uploaderName : null, fmtBytes(note.fileSize)]
      .filter(Boolean).join(' · ');
    viewerDownload.href = note.downloadUrl || '#';
    viewerDownload.setAttribute('download', note.fileName || 'download');
    viewerDownload.textContent = 'Download';
    viewerBody.innerHTML = '<div class="viewer-loading">Loading…</div>';
    viewerModal.style.display = 'flex';

    const ext = (String(note.fileName || '').split('.').pop() || '').toLowerCase();
    if (['png','jpg','jpeg','webp','gif'].includes(ext)) {
      viewerBody.innerHTML = `<img src="${esc(note.downloadUrl)}" alt="${esc(note.title || '')}" class="viewer-img" />`;
    } else if (ext === 'pdf') {
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
    if (!viewerBody) return;
    const url = viewerBody.dataset.blobUrl;
    if (url) { URL.revokeObjectURL(url); delete viewerBody.dataset.blobUrl; }
    viewerBody.innerHTML = '';
    viewerModal.style.display = 'none';
  }
  if (viewerModal) viewerModal.addEventListener('click', (e) => {
    const role = e.target.dataset.close;
    if (!role) return;
    if (role === 'overlay' && e.target !== viewerModal) return;
    closeViewer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewerModal && viewerModal.style.display === 'flex') closeViewer();
  });

  /* ---------- Google Workspace warning modal (static in shell) ---------- */
  const GDOCS_SKIP_KEY = 'finals.gdocsWarnSkipped';
  const gdocsWarnModal = document.getElementById('gdocs-warn-modal');
  const gdocsWarnSkip  = document.getElementById('gdocs-warn-skip');
  const gdocsWarnOpen  = document.getElementById('gdocs-warn-open');
  function gdocsSkipped() {
    try { return localStorage.getItem(GDOCS_SKIP_KEY) === '1'; } catch (_) { return false; }
  }
  function openInNewTab(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function openGdocs(note) {
    const url = note.gdocsUrl || '#';
    if (gdocsSkipped() || !gdocsWarnModal) { openInNewTab(url); return; }
    gdocsWarnSkip.checked = false;
    gdocsWarnOpen.href = url;
    gdocsWarnModal.style.display = 'flex';
    gdocsWarnModal.offsetHeight;
    gdocsWarnModal.classList.add('open');
  }
  function closeGdocsModal() {
    if (!gdocsWarnModal) return;
    gdocsWarnModal.classList.remove('open');
    setTimeout(() => { gdocsWarnModal.style.display = 'none'; }, 220);
  }
  if (gdocsWarnOpen) gdocsWarnOpen.addEventListener('click', () => {
    if (gdocsWarnSkip.checked) { try { localStorage.setItem(GDOCS_SKIP_KEY, '1'); } catch (_) {} }
    setTimeout(closeGdocsModal, 50);
  });
  if (gdocsWarnModal) gdocsWarnModal.addEventListener('click', (e) => {
    const role = e.target.dataset.close;
    if (!role) return;
    if (role === 'overlay' && e.target !== gdocsWarnModal) return;
    closeGdocsModal();
  });

  /* ---------- presence ---------- */
  const PRESENCE_HEARTBEAT_MS = 30_000;
  const presenceSessionId = (() => {
    try {
      const key = 'finals.' + SLUG + 'PresenceId';
      let id = sessionStorage.getItem(key);
      if (!id) { id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem(key, id); }
      return id;
    } catch (_) { return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  })();
  const presenceRef = doc(db, 'presence', presenceSessionId);
  async function presenceHeartbeat() {
    try { await setDoc(presenceRef, { page: SLUG, lastSeen: serverTimestamp() }); } catch (_) {}
  }
  async function presenceClear() { try { await deleteDoc(presenceRef); } catch (_) {} }
  presenceHeartbeat();
  setInterval(presenceHeartbeat, PRESENCE_HEARTBEAT_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') presenceClear(); else presenceHeartbeat();
  });
  window.addEventListener('pagehide', presenceClear);
  window.addEventListener('beforeunload', presenceClear);

  /* ---------- config subscription ---------- */
  onSnapshot(doc(db, 'state', 'subjectPages'), (snap) => {
    const data = snap.exists() ? snap.data() : {};
    mount(resolveConfig(SLUG, data.pages || {}));
  }, (err) => {
    console.warn('[' + SLUG + '] config load failed, using defaults:', err);
    mount(resolveConfig(SLUG, {}));
  });

  /* ---------- notes subscription ---------- */
  recordVisit();
  onSnapshot(
    query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
    (snap) => {
      state.rawNotes = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.archived) return;
        state.rawNotes.push({ id: d.id, ...data });
      });
      state.notesLoaded = true;
      recomputeNotes();
    },
    (err) => {
      console.error('[' + SLUG + '] notes listener:', err);
      const grid = document.getElementById('ces-grid');
      if (grid) grid.innerHTML = emptyHTML('Could not load notes: ' + (err.message || err));
    }
  );
}
