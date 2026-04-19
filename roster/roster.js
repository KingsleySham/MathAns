(function (global) {
  const KEYS = {
    LEDGER: 'roster.ledger',
    CURRENT: 'roster.current',
    AVAILABILITY: 'roster.availability',
    REHEARSALS: 'roster.rehearsals',
    CHECKINS: 'roster.checkins',
    LEAVES: 'roster.leaves',
    PROJECT: 'roster.project',
    POLL_WINDOW: 'roster.pollWindow',
    NOTICES: 'roster.notices',
    PRESENT: 'roster.presentSubmissions',
    REASONS: 'roster.commonReasons',
    LEAVE_REASONS: 'roster.commonLeaveReasons',
    CHECKIN_CODES: 'roster.checkinCodes',
    ATTENDANCE: 'roster.attendance',
    ZOOM_MEETINGS: 'roster.zoomMeetings',
    ZOOM_CONFIG: 'roster.zoomConfig',
    ZOOM_SESSION: 'roster.zoomSession',
    ADMIN_INBOX: 'roster.adminInbox',
    MTIMES: 'roster.__mtimes'
  };

  const DEFAULT_REASONS = ['School commitment', 'Family event', 'Health', 'Tutoring', 'Other'];
  const DEFAULT_LEAVE_REASONS = ['Sick', 'Family emergency', 'Academic conflict', 'Personal'];

  /* Fixed, production-wide time slots. All polls use these. */
  const FIXED_SLOTS = [
    { id: 'slot-0950', startMinute:  9 * 60 + 50, endMinute: 10 * 60 + 10, label: '9:50am – 10:10am' },
    { id: 'slot-1130', startMinute: 11 * 60 + 30, endMinute: 12 * 60 +  0, label: '11:30am – 12:00pm' },
    { id: 'slot-1200', startMinute: 12 * 60 +  0, endMinute: 12 * 60 + 30, label: '12:00pm – 12:30pm' },
    { id: 'slot-1350', startMinute: 13 * 60 + 50, endMinute: 14 * 60 +  0, label: '1:50pm – 2:00pm' },
    { id: 'slot-1530', startMinute: 15 * 60 + 30, endMinute: 16 * 60 + 10, label: '3:30pm – 4:10pm' },
    { id: 'slot-1610', startMinute: 16 * 60 + 10, endMinute: 16 * 60 + 50, label: '4:10pm – 4:50pm' },
    { id: 'slot-1650', startMinute: 16 * 60 + 50, endMinute: 17 * 60 + 30, label: '4:50pm – 5:30pm' }
  ];

  const ADMIN_PASSCODE = '20260508';
  const ADMIN_SESSION_KEY = 'roster.adminAuthed';

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  /* opts.seed = true → this is a default from ensureSeed(), so don't bump
     mtime and don't push to Firestore. Seed values must always lose the merge
     against any real remote data. */
  function writeJSON(key, value, opts) {
    localStorage.setItem(key, JSON.stringify(value));
    if (!opts || !opts.seed) {
      try {
        const mt = JSON.parse(localStorage.getItem(KEYS.MTIMES) || '{}');
        mt[key] = Date.now();
        localStorage.setItem(KEYS.MTIMES, JSON.stringify(mt));
      } catch (e) { /* ignore */ }
      if (global.rosterFirebase && typeof global.rosterFirebase.pushState === 'function') {
        global.rosterFirebase.pushState();
      }
    }
  }

  function uid() { return 'stu_' + Math.random().toString(36).slice(2, 9); }
  function genId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

  /* ── Students collection cache ────────────────────────────────────────
     Each student is a doc in the Firestore `students` collection. We hold
     them in a Map for synchronous reads, mirror to localStorage for the
     first paint after a cold open, and dispatch roster-state-sync when the
     remote sends an update. */
  const studentsCache = new Map();
  let studentsCacheReady = false;

  function mirrorStudentsToLocal() {
    const arr = [...studentsCache.values()];
    localStorage.setItem(KEYS.LEDGER, JSON.stringify(arr));
  }

  function writeStudent(student) {
    studentsCache.set(student.id, student);
    mirrorStudentsToLocal();
    if (global.rosterFirebase && global.rosterFirebase.writeCollectionDoc) {
      global.rosterFirebase.writeCollectionDoc('students', student.id, student);
    }
  }

  function patchStudent(id, patch) {
    const existing = studentsCache.get(id) || (readJSON(KEYS.LEDGER, []).find(s => s.id === id));
    if (!existing) return null;
    const merged = { ...existing, ...patch };
    writeStudent(merged);
    return merged;
  }

  function initStudentsSync() {
    /* Seed the cache from localStorage so the first synchronous getLedger()
       (before Firestore replies) still returns whatever this device knows. */
    readJSON(KEYS.LEDGER, []).forEach(s => { if (s && s.id) studentsCache.set(s.id, s); });

    if (!global.rosterFirebase || !global.rosterFirebase.subscribeCollection) return;
    global.rosterFirebase.subscribeCollection('students', (docs) => {
      studentsCache.clear();
      docs.forEach(d => { if (d && d.id) studentsCache.set(d.id, d); });
      studentsCacheReady = true;
      mirrorStudentsToLocal();
      window.dispatchEvent(new CustomEvent('roster-state-sync'));
    });

    /* One-time migration: if state/main carries a legacy ledger that the
       students collection hasn't picked up yet, push each entry up. setDoc
       with merge:true is idempotent so re-running is harmless. */
    const legacy = readJSON(KEYS.LEDGER, []);
    legacy.forEach(s => {
      if (s && s.id && global.rosterFirebase.writeCollectionDoc) {
        global.rosterFirebase.writeCollectionDoc('students', s.id, s);
      }
    });
  }

  /* ── Generic collection caches ────────────────────────────────────────
     Two patterns:
     - listCache:   array of {id, ...}     → one Firestore doc per item
     - keyedCache:  { id: value, ... }     → one Firestore doc per key,
                                            value wrapped as { value: … } so
                                            arbitrary nested shapes work. */

  function makeListCache(collectionName, localKey) {
    const cache = new Map();
    let ready = false;
    function mirror() {
      const arr = [];
      cache.forEach(v => arr.push(v));
      localStorage.setItem(localKey, JSON.stringify(arr));
    }
    return {
      list() { return ready ? [...cache.values()] : readJSON(localKey, []); },
      write(item) {
        if (!item || !item.id) return;
        cache.set(item.id, item);
        mirror();
        if (global.rosterFirebase && global.rosterFirebase.writeCollectionDoc) {
          global.rosterFirebase.writeCollectionDoc(collectionName, item.id, item);
        }
      },
      delete(id) {
        cache.delete(id);
        mirror();
        if (global.rosterFirebase && global.rosterFirebase.deleteCollectionDoc) {
          global.rosterFirebase.deleteCollectionDoc(collectionName, id);
        }
      },
      replaceAll(items) {
        const next = new Map();
        items.forEach(it => { if (it && it.id) next.set(it.id, it); });
        const removed = [...cache.keys()].filter(k => !next.has(k));
        cache.clear();
        next.forEach((v, k) => cache.set(k, v));
        mirror();
        if (global.rosterFirebase && global.rosterFirebase.writeCollectionDoc) {
          next.forEach((v, k) => global.rosterFirebase.writeCollectionDoc(collectionName, k, v));
          removed.forEach(k => global.rosterFirebase.deleteCollectionDoc(collectionName, k));
        }
      },
      init() {
        readJSON(localKey, []).forEach(it => { if (it && it.id) cache.set(it.id, it); });
        if (!global.rosterFirebase || !global.rosterFirebase.subscribeCollection) return;
        global.rosterFirebase.subscribeCollection(collectionName, docs => {
          cache.clear();
          docs.forEach(d => {
            const id = d.id || d.__id;
            if (!id) return;
            const { __id, ...rest } = d;
            cache.set(id, { id, ...rest });
          });
          ready = true;
          mirror();
          window.dispatchEvent(new CustomEvent('roster-state-sync'));
        });
        /* one-time migration of any legacy local rows */
        readJSON(localKey, []).forEach(it => {
          if (it && it.id && global.rosterFirebase.writeCollectionDoc) {
            global.rosterFirebase.writeCollectionDoc(collectionName, it.id, it);
          }
        });
      }
    };
  }

  function makeKeyedCache(collectionName, localKey) {
    const cache = new Map();
    let ready = false;
    function mirror() {
      const obj = {};
      cache.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(localKey, JSON.stringify(obj));
    }
    return {
      asObj() {
        if (ready) {
          const o = {};
          cache.forEach((v, k) => { o[k] = v; });
          return o;
        }
        return readJSON(localKey, {});
      },
      get(id) {
        if (ready) return cache.get(id);
        const local = readJSON(localKey, {});
        return local[id];
      },
      write(id, value) {
        cache.set(id, value);
        mirror();
        if (global.rosterFirebase && global.rosterFirebase.writeCollectionDoc) {
          global.rosterFirebase.writeCollectionDoc(collectionName, id, { value });
        }
      },
      delete(id) {
        cache.delete(id);
        mirror();
        if (global.rosterFirebase && global.rosterFirebase.deleteCollectionDoc) {
          global.rosterFirebase.deleteCollectionDoc(collectionName, id);
        }
      },
      init() {
        const local = readJSON(localKey, {});
        Object.keys(local).forEach(k => cache.set(k, local[k]));
        if (!global.rosterFirebase || !global.rosterFirebase.subscribeCollection) return;
        global.rosterFirebase.subscribeCollection(collectionName, docs => {
          cache.clear();
          docs.forEach(d => {
            const id = d.__id;
            if (!id) return;
            cache.set(id, d.value !== undefined ? d.value : d);
          });
          ready = true;
          mirror();
          window.dispatchEvent(new CustomEvent('roster-state-sync'));
        });
        Object.keys(local).forEach(id => {
          if (global.rosterFirebase.writeCollectionDoc) {
            global.rosterFirebase.writeCollectionDoc(collectionName, id, { value: local[id] });
          }
        });
      }
    };
  }

  const _rehearsals  = makeListCache('rehearsals',  KEYS.REHEARSALS);
  const _leaves      = makeListCache('leaves',      KEYS.LEAVES);
  const _notices     = makeListCache('notices',     KEYS.NOTICES);
  const _inbox       = makeListCache('inbox',       KEYS.ADMIN_INBOX);
  const _availability= makeKeyedCache('availability', KEYS.AVAILABILITY);
  const _attendance  = makeKeyedCache('attendance',   KEYS.ATTENDANCE);
  const _checkins    = makeKeyedCache('checkins',     KEYS.CHECKINS);
  const _checkinCodes= makeKeyedCache('checkinCodes', KEYS.CHECKIN_CODES);

  function initAllCollections() {
    initStudentsSync();
    _rehearsals.init();
    _leaves.init();
    _notices.init();
    _inbox.init();
    _availability.init();
    _attendance.init();
    _checkins.init();
    _checkinCodes.init();
  }

  if (typeof window !== 'undefined') {
    if (window.rosterFirebase && window.rosterFirebase.isReady && window.rosterFirebase.isReady()) {
      initAllCollections();
    } else {
      window.addEventListener('firebase-ready', initAllCollections, { once: true });
    }
  }

  function nextScriptId(ledger) {
    const used = new Set(ledger.map(s => s.scriptId).filter(Boolean));
    let n = 1;
    while (used.has('/student' + String(n).padStart(2, '0'))) n++;
    return '/student' + String(n).padStart(2, '0');
  }

  const Roster = {
    KEYS,

    ensureSeed() {
      const seed = { seed: true };
      if (!readJSON(KEYS.LEDGER, null)) writeJSON(KEYS.LEDGER, [], seed);
      if (!readJSON(KEYS.PROJECT, null)) {
        writeJSON(KEYS.PROJECT, {
          title: 'The Redemption of the White Queen',
          venue: 'Main Stage',
          competitionDate: '2026-05-08',
          competitionLocation: 'Hong Kong',
          subtitle: 'S.3G4 English Drama'
        }, seed);
      }
      if (!readJSON(KEYS.REHEARSALS, null)) writeJSON(KEYS.REHEARSALS, [], seed);
      if (!readJSON(KEYS.NOTICES, null)) writeJSON(KEYS.NOTICES, [], seed);
      if (!readJSON(KEYS.PRESENT, null)) writeJSON(KEYS.PRESENT, [], seed);
      if (!readJSON(KEYS.REASONS, null)) writeJSON(KEYS.REASONS, DEFAULT_REASONS, seed);
      if (!readJSON(KEYS.LEAVE_REASONS, null)) writeJSON(KEYS.LEAVE_REASONS, DEFAULT_LEAVE_REASONS, seed);
      if (!readJSON(KEYS.CHECKIN_CODES, null)) writeJSON(KEYS.CHECKIN_CODES, {}, seed);
      if (!readJSON(KEYS.ATTENDANCE, null)) writeJSON(KEYS.ATTENDANCE, {}, seed);
      if (!readJSON(KEYS.ZOOM_MEETINGS, null)) writeJSON(KEYS.ZOOM_MEETINGS, [], seed);
      if (!readJSON(KEYS.ADMIN_INBOX, null)) writeJSON(KEYS.ADMIN_INBOX, [], seed);
    },

    /* Wait for Firestore's initial sync to land before rendering, so pages
       never flash empty cast lists or miss rehearsals. Returns a promise that
       resolves once rosterFirebase has completed (or failed) its first read. */
    whenReady() {
      return new Promise(resolve => {
        if (!global.rosterFirebase) return resolve();
        if (global.rosterFirebase.isReady && global.rosterFirebase.isReady()) return resolve();
        window.addEventListener('firebase-ready', () => resolve(), { once: true });
      });
    },

    /* ── invite links + admin inbox ──────────────────────── */
    /* Permanent invite URLs: include the name/role as URL hints so the link
       resolves even if a device has stale local data or Firestore is slow. */
    buildInviteUrl(studentId) {
      const base = location.origin + location.pathname.replace(/[^/]+$/, '');
      const params = new URLSearchParams({ id: studentId });
      const s = Roster.getLedger().find(x => x.id === studentId);
      if (s) {
        if (s.name) params.set('n', s.name);
        if (s.role) params.set('r', s.role);
      }
      return `${base}invite.html?${params.toString()}`;
    },
    /* Recreate or update a ledger entry from an invite URL's embedded name/role,
       so an invite link is effectively permanent even after local data is cleared. */
    ensureInvitedStudent(input) {
      if (!input || !input.id) return null;
      const existing = Roster.getLedger().find(x => x.id === input.id);
      if (existing) {
        const patch = {};
        if (input.name && !existing.name) patch.name = input.name;
        if (input.role && !existing.role) patch.role = input.role;
        return Object.keys(patch).length ? patchStudent(input.id, patch) : existing;
      }
      if (!input.name) return null;
      const s = { id: input.id, name: input.name, role: input.role || '', scriptId: null, createdAt: Date.now() };
      writeStudent(s);
      return s;
    },
    getAdminInbox() {
      return _inbox.list().slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    },
    pushAdminInbox(entry) {
      const item = { id: genId('inb'), at: Date.now(), read: false, ...entry };
      _inbox.write(item);
      /* Keep only the 100 most-recent items in storage to bound growth. */
      const all = Roster.getAdminInbox();
      if (all.length > 100) all.slice(100).forEach(x => _inbox.delete(x.id));
    },
    markAdminInboxRead(id) {
      const item = _inbox.list().find(x => x.id === id);
      if (item) _inbox.write({ ...item, read: true });
    },
    markAllAdminInboxRead() {
      _inbox.list().forEach(x => { if (!x.read) _inbox.write({ ...x, read: true }); });
    },
    unreadInboxCount() { return _inbox.list().filter(x => !x.read).length; },

    /* ── common reasons for unavailability ──────────────── */
    getCommonReasons() { return readJSON(KEYS.REASONS, DEFAULT_REASONS); },
    setCommonReasons(arr) { writeJSON(KEYS.REASONS, Array.isArray(arr) ? arr : DEFAULT_REASONS); },
    getCommonLeaveReasons() { return readJSON(KEYS.LEAVE_REASONS, DEFAULT_LEAVE_REASONS); },
    setCommonLeaveReasons(arr) { writeJSON(KEYS.LEAVE_REASONS, Array.isArray(arr) ? arr : DEFAULT_LEAVE_REASONS); },

    /* ── check-in codes (per rehearsal) ──────────────────── */
    getCheckinCodes() { return _checkinCodes.asObj(); },
    generateCheckinCode(rehearsalId) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      _checkinCodes.write(rehearsalId, { code, createdAt: Date.now() });
      return code;
    },
    verifyCheckinCode(rehearsalId, code) {
      const entry = _checkinCodes.get(rehearsalId);
      return !!(entry && entry.code === String(code).trim());
    },

    /* ── attendance records ──────────────────────────────── */
    getAttendance() { return _attendance.asObj(); },
    markAttendance(rehearsalId, studentId, status) {
      const recForRehearsal = { ...(_attendance.get(rehearsalId) || {}) };
      recForRehearsal[studentId] = { status, at: Date.now() };
      _attendance.write(rehearsalId, recForRehearsal);
      /* keep checkins and attendance in sync — marking present also records
         a check-in; flipping away from present clears it. */
      const studentCheckins = { ...(_checkins.get(studentId) || {}) };
      if (status === 'present') {
        if (!studentCheckins[rehearsalId]) {
          studentCheckins[rehearsalId] = Date.now();
          _checkins.write(studentId, studentCheckins);
        }
      } else if (studentCheckins[rehearsalId]) {
        delete studentCheckins[rehearsalId];
        _checkins.write(studentId, studentCheckins);
      }
    },
    getStudentAttendance(studentId) {
      const all = _attendance.asObj();
      const out = [];
      Object.keys(all).forEach(rId => {
        if (all[rId] && all[rId][studentId]) {
          out.push({ rehearsalId: rId, ...all[rId][studentId] });
        }
      });
      return out;
    },

    /* ── zoom meetings (admin-created links, users join) ─── */
    getZoomMeetings() { return readJSON(KEYS.ZOOM_MEETINGS, []); },
    addZoomMeeting(meeting) {
      const list = Roster.getZoomMeetings();
      const rec = { id: genId('zm'), createdAt: Date.now(), ...meeting };
      list.push(rec);
      writeJSON(KEYS.ZOOM_MEETINGS, list);
      return rec;
    },
    removeZoomMeeting(id) {
      writeJSON(KEYS.ZOOM_MEETINGS, Roster.getZoomMeetings().filter(z => z.id !== id));
    },

    /* ── zoom OAuth config + session ─────────────────────── */
    getZoomConfig() {
      return readJSON(KEYS.ZOOM_CONFIG, { clientId: '', backendBase: '', redirectUri: '' });
    },
    setZoomConfig(cfg) { writeJSON(KEYS.ZOOM_CONFIG, cfg || {}); },
    getZoomSession() { return readJSON(KEYS.ZOOM_SESSION, null); },
    setZoomSession(s) {
      if (s) writeJSON(KEYS.ZOOM_SESSION, s);
      else localStorage.removeItem(KEYS.ZOOM_SESSION);
    },
    zoomAuthUrl() {
      const cfg = Roster.getZoomConfig();
      if (!cfg.clientId || !cfg.redirectUri) return null;
      const qs = new URLSearchParams({
        response_type: 'code',
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri
      });
      return `https://zoom.us/oauth/authorize?${qs.toString()}`;
    },
    /* calls the admin-configured backend that wraps Zoom's /users/me/meetings API */
    async zoomCreateMeeting({ topic, startTime, durationMinutes, agenda }) {
      const cfg = Roster.getZoomConfig();
      const session = Roster.getZoomSession();
      if (!cfg.backendBase) throw new Error('Zoom backend URL not configured.');
      if (!session || !session.accessToken) throw new Error('Zoom is not connected. Click "Connect Zoom" first.');
      const res = await fetch(`${cfg.backendBase.replace(/\/$/, '')}/zoom/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.accessToken}` },
        body: JSON.stringify({ topic, start_time: startTime, duration: durationMinutes, agenda })
      });
      if (!res.ok) throw new Error(`Zoom API error: ${res.status} ${await res.text()}`);
      return res.json(); // expects { join_url, start_url, id, topic, ... }
    },

    resetForNewProduction() {
      /* Wipe all collection-backed entities by deleting each Firestore doc
         (one round-trip per row). The safety-net backups in Firestore mean
         this is recoverable even when invoked accidentally. */
      Roster.getLedger().forEach(s => Roster.removeStudent(s.id));
      _rehearsals.list().forEach(r => _rehearsals.delete(r.id));
      _notices.list().forEach(n => _notices.delete(n.id));
      _inbox.list().forEach(i => _inbox.delete(i.id));
      Object.keys(_attendance.asObj()).forEach(k => _attendance.delete(k));
      Object.keys(_checkinCodes.asObj()).forEach(k => _checkinCodes.delete(k));
      writeJSON(KEYS.PRESENT, []);
      localStorage.removeItem(KEYS.POLL_WINDOW);
      localStorage.removeItem(KEYS.CURRENT);
    },

    getProject() {
      return readJSON(KEYS.PROJECT, {
        title: 'The Redemption of the White Queen',
        subtitle: 'S.3G4 English Drama',
        competitionDate: '2026-05-08'
      });
    },

    /* Ledger lives in the `students` Firestore collection (one doc per
       student). The in-memory cache below is the synchronous source of
       truth; localStorage is only an offline fallback for the very first
       paint before Firestore answers. */
    getLedger() {
      if (studentsCacheReady) return [...studentsCache.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return readJSON(KEYS.LEDGER, []);
    },

    addStudent(name, role = '') {
      const student = { id: uid(), name, role, scriptId: null, createdAt: Date.now() };
      writeStudent(student);
      return student;
    },

    removeStudent(studentId) {
      studentsCache.delete(studentId);
      mirrorStudentsToLocal();
      if (global.rosterFirebase && global.rosterFirebase.deleteCollectionDoc) {
        global.rosterFirebase.deleteCollectionDoc('students', studentId);
      }
      _availability.delete(studentId);
      _checkins.delete(studentId);
      Roster.getLeaves()
        .filter(l => l.studentId === studentId)
        .forEach(l => _leaves.delete(l.id));
      const current = readJSON(KEYS.CURRENT, null);
      if (current === studentId) localStorage.removeItem(KEYS.CURRENT);
    },

    findByName(name) {
      const q = (name || '').trim().toLowerCase();
      if (!q) return null;
      return Roster.getLedger().find(s => (s.name || '').trim().toLowerCase() === q) || null;
    },

    getOrCreateByName(name, role = '') {
      const trimmed = (name || '').trim();
      if (!trimmed) return null;
      const existing = Roster.findByName(trimmed);
      if (existing) return existing;
      return Roster.addStudent(trimmed, role);
    },

    assignScriptId(studentId, role) {
      const ledger = Roster.getLedger();
      const student = ledger.find(s => s.id === studentId);
      if (!student) return null;
      const patch = {};
      if (!student.scriptId) patch.scriptId = nextScriptId(ledger);
      if (role) patch.role = role;
      return patchStudent(studentId, patch) || student;
    },

    findByScriptId(raw) {
      let q = (raw || '').trim().toLowerCase();
      if (!q) return null;
      if (!q.startsWith('/')) q = '/' + q;
      return Roster.getLedger().find(s => (s.scriptId || '').toLowerCase() === q) || null;
    },

    onboardNew(name, role = '') {
      if (!name) return null;
      const student = Roster.addStudent(name.trim(), (role || '').trim());
      return Roster.assignScriptId(student.id);
    },

    markLegalAccepted(studentId) { patchStudent(studentId, { legalAcceptedAt: Date.now() }); },
    hasAcceptedLegal(studentId) {
      const s = Roster.getLedger().find(x => x.id === studentId);
      return !!(s && s.legalAcceptedAt);
    },
    markTutorialSeen(studentId) { patchStudent(studentId, { tutorialSeenAt: Date.now() }); },
    hasSeenTutorial(studentId) {
      const s = Roster.getLedger().find(x => x.id === studentId);
      return !!(s && s.tutorialSeenAt);
    },

    /* remember that a student has dismissed the "new poll" popup */
    markPollSeen(studentId, pollId) { patchStudent(studentId, { seenPollId: pollId }); },
    hasSeenPoll(studentId, pollId) {
      const s = Roster.getLedger().find(x => x.id === studentId);
      return !!(s && s.seenPollId === pollId);
    },

    bootstrap(pageName) {
      Roster.ensureSeed();
      const current = Roster.getCurrentStudent();
      if (pageName === 'landing') {
        if (current) {
          if (!Roster.hasAcceptedLegal(current.id)) { location.href = 'legal.html'; return { redirected: true }; }
          if (!Roster.hasSeenTutorial(current.id)) { location.href = 'support.html?first=1'; return { redirected: true }; }
          location.href = 'profile.html';
          return { redirected: true };
        }
        return { student: null, redirected: false };
      }
      if (!current) { location.href = 'index.html'; return { redirected: true }; }
      if (pageName !== 'legal' && !Roster.hasAcceptedLegal(current.id)) {
        location.href = 'legal.html'; return { redirected: true };
      }
      if (pageName !== 'legal' && pageName !== 'support' && !Roster.hasSeenTutorial(current.id)) {
        location.href = 'support.html?first=1'; return { redirected: true };
      }
      return { student: current, redirected: false };
    },

    signOut() { Roster.clearCurrent(); },

    authenticateAdmin(code) {
      if ((code || '').trim() === ADMIN_PASSCODE) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
        return true;
      }
      return false;
    },
    isAdminAuthed() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; },
    signOutAdmin() { sessionStorage.removeItem(ADMIN_SESSION_KEY); },

    /* ── poll window ─────────────────────────────────────────── */
    getPollWindow() { return readJSON(KEYS.POLL_WINDOW, null); },
    setPollWindow(win) {
      if (win && !win.id) win.id = genId('poll');
      writeJSON(KEYS.POLL_WINDOW, win);
    },
    clearPollWindow() { localStorage.removeItem(KEYS.POLL_WINDOW); },

    isDateBlockedOut(dateStr) {
      const win = Roster.getPollWindow();
      return !!(win && Array.isArray(win.blockoutDates) && win.blockoutDates.includes(dateStr));
    },

    /* Fixed production time slots. */
    getFixedSlots() { return FIXED_SLOTS.slice(); },

    getPollSlotKeys() {
      const win = Roster.getPollWindow();
      if (!win || !win.active) return [];
      const [sy, sm, sd] = win.startDate.split('-').map(Number);
      const [ey, em, ed] = win.endDate.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd);
      const end   = new Date(ey, em - 1, ed);
      const allowed  = new Set(win.daysOfWeek && win.daysOfWeek.length ? win.daysOfWeek : [0,1,2,3,4,5,6]);
      const blockouts = new Set(win.blockoutDates || []);
      const enabledSlotIds = Array.isArray(win.enabledSlotIds) && win.enabledSlotIds.length
        ? new Set(win.enabledSlotIds)
        : new Set(FIXED_SLOTS.map(s => s.id));
      const perDateExclusions = win.perDateExclusions || {};
      const keys = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (!allowed.has(d.getDay())) continue;
        const y  = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${mo}-${dd}`;
        if (blockouts.has(dateStr)) continue;
        const excludedForDate = new Set(perDateExclusions[dateStr] || []);

        FIXED_SLOTS.forEach(s => {
          if (!enabledSlotIds.has(s.id)) return;
          if (excludedForDate.has(s.id)) return;
          const h = Math.floor(s.startMinute / 60);
          const m = s.startMinute % 60;
          keys.push(Roster.buildSlotKey(d, h, m));
        });
      }
      return keys;
    },

    /* returns the FIXED_SLOTS entry matching this slot-key's start time */
    getSlotBlock(slotKey) {
      const d = Roster.parseSlotKey(slotKey);
      const startMin = d.getHours() * 60 + d.getMinutes();
      return FIXED_SLOTS.find(b => b.startMinute === startMin) || null;
    },

    /* poll-slot metadata: format (video/offline) + whether a typed reason is required */
    getSlotMeta(slotKey) {
      const win = Roster.getPollWindow();
      if (!win) return { format: 'offline', reasonRequired: false };
      const perSlot = !!(win.reasonRequiredSlots && win.reasonRequiredSlots.includes(slotKey));
      return {
        format: win.format || 'offline',
        reasonRequired: !!win.reasonRequiredAll || perSlot
      };
    },

    setCurrentStudent(id) { writeJSON(KEYS.CURRENT, id); },
    getCurrentStudent() {
      const id = readJSON(KEYS.CURRENT, null);
      if (!id) return null;
      return Roster.getLedger().find(s => s.id === id) || null;
    },
    clearCurrent() { localStorage.removeItem(KEYS.CURRENT); },

    getAvailabilityMap() { return _availability.asObj(); },
    getAvailability(studentId) {
      return _availability.get(studentId) || { available: [], blocked: [], reasons: {}, submittedAt: null };
    },
    setAvailability(studentId, data) { _availability.write(studentId, data); },
    toggleSlot(studentId, slotKey, mode, reason) {
      const data = Roster.getAvailability(studentId);
      data.available = (data.available || []).filter(k => k !== slotKey);
      data.blocked = (data.blocked || []).filter(k => k !== slotKey);
      data.reasons = data.reasons || {};
      delete data.reasons[slotKey];
      if (mode === 'available') data.available.push(slotKey);
      else if (mode === 'blocked') {
        data.blocked.push(slotKey);
        if (reason) data.reasons[slotKey] = reason;
      }
      Roster.setAvailability(studentId, data);
      return data;
    },
    markSubmitted(studentId) {
      const data = Roster.getAvailability(studentId);
      data.submittedAt = Date.now();
      Roster.setAvailability(studentId, data);
    },

    aggregateSlot(slotKey) {
      const all = Roster.getAvailabilityMap();
      const ledger = Roster.getLedger();
      const availableIds = [];
      const blockedIds = [];
      const pendingIds = [];
      ledger.forEach(s => {
        const d = all[s.id];
        if (d && d.available && d.available.includes(slotKey)) availableIds.push(s.id);
        else if (d && d.blocked && d.blocked.includes(slotKey)) blockedIds.push(s.id);
        else pendingIds.push(s.id);
      });
      return { availableIds, blockedIds, pendingIds, total: ledger.length };
    },

    recommendSlots(slotKeys, topN = 5) {
      const scored = slotKeys.map(k => {
        const a = Roster.aggregateSlot(k);
        const score = a.availableIds.length - a.blockedIds.length * 1.5;
        return { slot: k, score, ...a };
      });
      scored.sort((a, b) => b.score - a.score || b.availableIds.length - a.availableIds.length);
      return scored.slice(0, topN);
    },

    /* slots in the poll window that no one has touched yet */
    emptySlots() {
      const keys = Roster.getPollSlotKeys();
      return keys.filter(k => {
        const a = Roster.aggregateSlot(k);
        return a.availableIds.length === 0 && a.blockedIds.length === 0;
      });
    },

    getRehearsals() { return _rehearsals.list().slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
    /* true if the student is called for this rehearsal (empty list = everyone) */
    isParticipant(rehearsal, studentId) {
      if (!rehearsal) return false;
      const ids = rehearsal.participantIds;
      if (!Array.isArray(ids) || ids.length === 0) return true;
      return ids.includes(studentId);
    },
    getRehearsalsForStudent(studentId) {
      return Roster.getRehearsals().filter(r => Roster.isParticipant(r, studentId));
    },
    addRehearsal(slotKey, label = 'Rehearsal', type = 'rehearsal', venue = 'Main Stage') {
      if (Roster.getRehearsals().some(r => r.slotKey === slotKey)) return null;
      const meta = Roster.getSlotMeta(slotKey);
      const r = {
        id: genId('reh'),
        slotKey, label, type, venue,
        format: meta.format,
        createdAt: Date.now()
      };
      _rehearsals.write(r);
      return r;
    },
    updateRehearsal(id, updates) {
      const r = Roster.getRehearsals().find(x => x.id === id);
      if (!r) return null;
      const merged = { ...r, ...updates };
      _rehearsals.write(merged);
      return merged;
    },
    removeRehearsal(id) { _rehearsals.delete(id); },

    getCheckIns() { return _checkins.asObj(); },
    checkIn(studentId, rehearsalId) {
      const own = { ...(_checkins.get(studentId) || {}) };
      own[rehearsalId] = Date.now();
      _checkins.write(studentId, own);
    },
    hasCheckedIn(studentId, rehearsalId) {
      const own = _checkins.get(studentId);
      if (own && own[rehearsalId]) return true;
      const att = _attendance.get(rehearsalId);
      return !!(att && att[studentId] && att[studentId].status === 'present');
    },

    getLeaves() { return _leaves.list().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); },
    requestLeave(studentId, rehearsalId, reason) {
      _leaves.write({
        id: genId('lve'),
        studentId, rehearsalId, reason: reason || '',
        createdAt: Date.now(), status: 'pending'
      });
    },
    getLeavesForStudent(studentId) {
      return Roster.getLeaves().filter(l => l.studentId === studentId);
    },
    updateLeaveStatus(leaveId, status) {
      const l = Roster.getLeaves().find(x => x.id === leaveId);
      if (l) _leaves.write({ ...l, status });
    },
    deleteLeave(leaveId) { _leaves.delete(leaveId); },

    /* ── notices ─────────────────────────────────────────────── */
    getNotices() { return _notices.list().slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
    addNotice(title, body, severity = 'info') {
      _notices.write({ id: genId('not'), title, body, severity, createdAt: Date.now() });
    },
    removeNotice(id) { _notices.delete(id); },

    /* ── present-mode submissions (walk-up, no login) ────────── */
    getPresentSubmissions() { return readJSON(KEYS.PRESENT, []); },
    addPresentSubmission(entry) {
      const list = Roster.getPresentSubmissions();
      list.push({ id: genId('pre'), createdAt: Date.now(), ...entry });
      writeJSON(KEYS.PRESENT, list);
      /* also forward to Firestore's presentSubmissions collection if online */
      if (global.rosterFirebase && typeof global.rosterFirebase.submitPresent === 'function') {
        global.rosterFirebase.submitPresent(entry).catch(() => {});
      }
    },

    buildSlotKey(date, hour, minute) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(hour).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');
      return `${y}-${m}-${d}T${hh}:${mm}`;
    },
    parseSlotKey(key) {
      const [datePart, timePart] = key.split('T');
      const [y, m, d] = datePart.split('-').map(Number);
      const [hh, mm] = timePart.split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm);
    },
    formatSlot(key) {
      const d = Roster.parseSlotKey(key);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const block = Roster.getSlotBlock(key);
      const start = Roster.formatTime(d.getHours(), d.getMinutes());
      const dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
      if (block) {
        const eh = Math.floor(block.endMinute / 60);
        const em = block.endMinute % 60;
        const endStr = Roster.formatTime(eh, em);
        const labelStr = block.label ? ` (${block.label})` : '';
        return `${dateStr} — ${start}–${endStr}${labelStr}`;
      }
      return `${dateStr} — ${start}`;
    },

    formatTime(h, m) {
      const ampm = h >= 12 ? 'pm' : 'am';
      const h12 = ((h + 11) % 12) + 1;
      const mm = String(m).padStart(2, '0');
      return `${h12}:${mm}${ampm}`;
    },

    /* Sorted slot stats: most-booked first */
    getSlotRanking() {
      const keys = Roster.getPollSlotKeys();
      return keys.map(k => {
        const a = Roster.aggregateSlot(k);
        return { slot: k, available: a.availableIds.length, blocked: a.blockedIds.length, total: a.total };
      }).sort((x, y) => y.available - x.available);
    },

    /* Submission-completed students */
    hasSubmitted(studentId) {
      const a = Roster.getAvailability(studentId);
      return !!(a && a.submittedAt);
    },

    /* ── notifications / email generation ─────────────────────── */
    generateStudentNotification(studentId) {
      const student = Roster.getLedger().find(s => s.id === studentId);
      if (!student) return null;
      const project = Roster.getProject();
      const rehearsals = Roster.getRehearsals();
      const avail = Roster.getAvailability(studentId);

      const lines = [
        `Dear ${student.name},`,
        ``,
        `Thank you for submitting your availability for "${project.title}" (${project.subtitle}).`,
        ``
      ];

      if (avail.available && avail.available.length > 0) {
        lines.push(`You marked the following times as AVAILABLE:`);
        avail.available.forEach(key => {
          lines.push(`  • ${Roster.formatSlot(key)}`);
        });
        lines.push(``);
      }

      if (avail.blocked && avail.blocked.length > 0) {
        lines.push(`You marked the following times as UNAVAILABLE:`);
        avail.blocked.forEach(key => {
          const reason = avail.reasons && avail.reasons[key];
          const reasonText = reason ? ` (${reason})` : '';
          lines.push(`  • ${Roster.formatSlot(key)}${reasonText}`);
        });
        lines.push(``);
      }

      lines.push(`Production details:`);
      lines.push(`  Title: ${project.title}`);
      lines.push(`  Subtitle: ${project.subtitle}`);
      lines.push(`  Competition Date: ${project.competitionDate}`);
      if (project.competitionLocation) {
        lines.push(`  Location: ${project.competitionLocation}`);
      }
      lines.push(``);
      lines.push(`If you need to change your availability, please contact the production team.`);
      lines.push(``);
      lines.push(`Best regards,`);
      lines.push(`Production Team`);

      return lines.join('\n');
    }
  };

  global.Roster = Roster;
})(window);
