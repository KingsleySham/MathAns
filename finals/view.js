import { db, doc, getDoc } from './firebase-init.js';

const rootEl = document.getElementById('root');
const errEl  = document.getElementById('err');
const fsBtn  = document.getElementById('fs-btn');

function showError(msg) {
  rootEl.innerHTML = '';
  errEl.textContent = msg;
  errEl.classList.add('show');
  document.title = msg;
}

function readNoteId() {
  const fromPath = decodeURIComponent(
    location.pathname.replace(/^\/view\/?/, '').replace(/\/$/, '')
  );
  if (fromPath) return fromPath;
  return new URLSearchParams(location.search).get('id') || '';
}

function isHtmlFile(fileName) {
  const ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
  return ext === 'html' || ext === 'htm';
}

fsBtn.addEventListener('click', () => {
  const target = document.documentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    (target.requestFullscreen ? target.requestFullscreen() : Promise.resolve())
      .catch(() => {});
  }
});

(async () => {
  const id = readNoteId();
  if (!id) {
    showError('No note id in URL.');
    return;
  }

  let note;
  try {
    const snap = await getDoc(doc(db, 'notes', id));
    if (!snap.exists()) {
      showError('Note not found.');
      return;
    }
    note = { id: snap.id, ...snap.data() };
  } catch (err) {
    showError("Couldn't load note: " + (err && err.message ? err.message : String(err)));
    return;
  }

  if (!note.downloadUrl || !isHtmlFile(note.fileName)) {
    showError('This viewer is for HTML notes only.');
    return;
  }

  document.title = note.title || note.fileName || 'Note';

  try {
    const resp = await fetch(note.downloadUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const html = await resp.text();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = note.title || note.fileName || 'Note';
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    iframe.setAttribute('allow', 'fullscreen');
    rootEl.appendChild(iframe);
  } catch (err) {
    showError("Couldn't load HTML: " + (err && err.message ? err.message : String(err)));
  }
})();
