// Finals Study Hub — main client logic.
// Sections: countdown, tab routing, notes upload + browse, timer (pomodoro,
// custom countdown, stopwatch).
import {
  db,
  collection, addDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from './firebase-init.js';

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
   Main tabs (Notes / Timer)
   ========================================================================== */
document.getElementById('main-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.main-tab');
  if (!btn) return;
  const target = btn.dataset.tab;
  document.querySelectorAll('.main-tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + target);
  });
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

const uploadForm = document.getElementById('upload-form');
const uploadBtn = document.getElementById('upload-btn');
const progressBox = document.getElementById('upload-progress');
const progressFill = document.getElementById('upload-progress-fill');
const progressText = document.getElementById('upload-progress-text');
const statusEl = document.getElementById('upload-status');

const MAX_BYTES = 3 * 1024 * 1024;   // Vercel serverless body cap (4.5 MB) + base64 overhead
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'txt'];

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

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  const name = nameInput.value.trim();
  const title = document.getElementById('note-title').value.trim();
  const subject = document.getElementById('note-subject').value;
  const type = document.getElementById('note-type').value;
  const description = document.getElementById('note-desc').value.trim();
  const fileInput = document.getElementById('note-file');
  const file = fileInput.files && fileInput.files[0];

  if (!name) { setStatus('Please enter your name.', 'err'); return; }
  if (!title) { setStatus('Please enter a title.', 'err'); return; }
  if (!file) { setStatus('Please pick a file.', 'err'); return; }
  if (file.size > MAX_BYTES) {
    setStatus('File is larger than 3 MB. Try compressing the PDF first.', 'err');
    return;
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    setStatus('Unsupported file type. Allowed: ' + ALLOWED_EXT.join(', '), 'err');
    return;
  }

  uploadBtn.disabled = true;
  progressBox.style.display = 'flex';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  setStatus('Reading file…');

  try {
    const fileBase64 = await fileToBase64(file);

    progressFill.style.width = '55%';
    progressText.textContent = '55%';
    setStatus('Uploading…');

    const resp = await fetch('/api/upload-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploaderName: name,
        title,
        subject,
        type,
        description,
        fileName: file.name,
        fileMime: file.type || '',
        fileBase64
      })
    });

    progressFill.style.width = '90%';
    progressText.textContent = '90%';

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${resp.status}`);
    }

    await addDoc(collection(db, 'notes'), {
      title,
      description,
      uploaderName: name,
      subject,
      type,
      fileName: file.name,
      filePath: result.filePath,
      fileSize: result.fileSize || file.size,
      fileMime: file.type || '',
      downloadUrl: result.downloadUrl,
      createdAt: serverTimestamp()
    });

    progressFill.style.width = '100%';
    progressText.textContent = '100%';

    setStatus('Uploaded! Thanks for sharing.', 'ok');
    uploadForm.reset();
    nameInput.value = name;          // keep the name
    document.getElementById('note-subject').value = subject;
    document.getElementById('note-type').value = type;
    setTimeout(() => { progressBox.style.display = 'none'; }, 800);
  } catch (err) {
    console.error(err);
    setStatus('Upload failed: ' + (err && err.message ? err.message : err), 'err');
    progressBox.style.display = 'none';
  } finally {
    uploadBtn.disabled = false;
  }
});

/* ==========================================================================
   Notes — browse
   ========================================================================== */
const notesListEl = document.getElementById('notes-list');
const notesEmpty = document.getElementById('notes-empty');
const filterSubjectEl = document.getElementById('filter-subject');
const filterTypeEl = document.getElementById('filter-type');

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
  notesListEl.innerHTML = filtered.map(n => {
    const typeLabel = n.type === 'mock_paper' ? 'Mock Paper' : 'Notes';
    const typeClass = n.type === 'mock_paper' ? 'mock_paper' : 'notes';
    return `
      <div class="note-card">
        <div class="note-card-top">
          <div class="note-title">${escapeHtml(n.title)}</div>
          <div class="note-type ${typeClass}">${typeLabel}</div>
        </div>
        <div class="note-meta">
          <span>${escapeHtml(n.subject || '—')}</span>
          <span>·</span>
          <span>by ${escapeHtml(n.uploaderName || 'Anonymous')}</span>
          <span>·</span>
          <span>${fmtBytes(n.fileSize)}</span>
          <span>·</span>
          <span>${escapeHtml(fmtDate(n.createdAt))}</span>
        </div>
        ${n.description ? `<div class="note-desc">${escapeHtml(n.description)}</div>` : ''}
        <div class="note-actions">
          <a class="btn-primary" href="${escapeHtml(n.downloadUrl)}" target="_blank" rel="noopener" download="${escapeHtml(n.fileName)}">Download</a>
        </div>
      </div>
    `;
  }).join('');
}

filterSubjectEl.addEventListener('change', renderNotes);
filterTypeEl.addEventListener('change', renderNotes);

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

onSnapshot(
  query(collection(db, 'notes'), orderBy('createdAt', 'desc')),
  (snap) => {
    allNotes = [];
    snap.forEach(d => allNotes.push({ id: d.id, ...d.data() }));
    renderNotes();
  },
  (err) => {
    console.warn('notes listener offline:', err.message);
    notesEmpty.textContent = 'Could not load notes (offline?). Refresh to retry.';
  }
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
