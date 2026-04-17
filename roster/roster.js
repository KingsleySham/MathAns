(function (global) {
  const KEYS = {
    LEDGER: 'roster.ledger',
    CURRENT: 'roster.current',
    AVAILABILITY: 'roster.availability',
    REHEARSALS: 'roster.rehearsals',
    CHECKINS: 'roster.checkins',
    LEAVES: 'roster.leaves',
    PROJECT: 'roster.project'
  };

  const SEED_NAMES = ['Alexander Hamilton', 'Eliza Schuyler', 'Aaron Burr', 'Angelica Schuyler', 'Lafayette', 'Hercules Mulligan'];

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function uid() { return 'stu_' + Math.random().toString(36).slice(2, 9); }

  function nextScriptId(ledger) {
    const used = new Set(ledger.map(s => s.scriptId).filter(Boolean));
    let n = 1;
    while (used.has('/student' + String(n).padStart(2, '0'))) n++;
    return '/student' + String(n).padStart(2, '0');
  }

  const Roster = {
    KEYS,

    ensureSeed() {
      const ledger = readJSON(KEYS.LEDGER, null);
      if (!ledger) {
        const seeded = SEED_NAMES.map(name => ({ id: uid(), name, role: '', scriptId: null, createdAt: Date.now() }));
        writeJSON(KEYS.LEDGER, seeded);
      }
      if (!readJSON(KEYS.PROJECT, null)) {
        writeJSON(KEYS.PROJECT, { title: 'The Glass Menagerie (2024)', venue: 'Main Stage' });
      }
      if (!readJSON(KEYS.REHEARSALS, null)) {
        writeJSON(KEYS.REHEARSALS, []);
      }
    },

    getProject() { return readJSON(KEYS.PROJECT, { title: 'The Glass Menagerie (2024)' }); },

    getLedger() { return readJSON(KEYS.LEDGER, []); },

    addStudent(name, role = '') {
      const ledger = Roster.getLedger();
      const student = { id: uid(), name, role, scriptId: null, createdAt: Date.now() };
      ledger.push(student);
      writeJSON(KEYS.LEDGER, ledger);
      return student;
    },

    assignScriptId(studentId, role) {
      const ledger = Roster.getLedger();
      const student = ledger.find(s => s.id === studentId);
      if (!student) return null;
      if (!student.scriptId) student.scriptId = nextScriptId(ledger);
      if (role) student.role = role;
      writeJSON(KEYS.LEDGER, ledger);
      return student;
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

    markLegalAccepted(studentId) {
      const ledger = Roster.getLedger();
      const s = ledger.find(x => x.id === studentId);
      if (!s) return;
      s.legalAcceptedAt = Date.now();
      writeJSON(KEYS.LEDGER, ledger);
    },
    hasAcceptedLegal(studentId) {
      const s = Roster.getLedger().find(x => x.id === studentId);
      return !!(s && s.legalAcceptedAt);
    },
    markTutorialSeen(studentId) {
      const ledger = Roster.getLedger();
      const s = ledger.find(x => x.id === studentId);
      if (!s) return;
      s.tutorialSeenAt = Date.now();
      writeJSON(KEYS.LEDGER, ledger);
    },
    hasSeenTutorial(studentId) {
      const s = Roster.getLedger().find(x => x.id === studentId);
      return !!(s && s.tutorialSeenAt);
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

    setCurrentStudent(id) { writeJSON(KEYS.CURRENT, id); },
    getCurrentStudent() {
      const id = readJSON(KEYS.CURRENT, null);
      if (!id) return null;
      return Roster.getLedger().find(s => s.id === id) || null;
    },
    clearCurrent() { localStorage.removeItem(KEYS.CURRENT); },

    getAvailabilityMap() { return readJSON(KEYS.AVAILABILITY, {}); },
    getAvailability(studentId) {
      const all = Roster.getAvailabilityMap();
      return all[studentId] || { available: [], blocked: [] };
    },
    setAvailability(studentId, data) {
      const all = Roster.getAvailabilityMap();
      all[studentId] = data;
      writeJSON(KEYS.AVAILABILITY, all);
    },
    toggleSlot(studentId, slotKey, mode) {
      const data = Roster.getAvailability(studentId);
      data.available = (data.available || []).filter(k => k !== slotKey);
      data.blocked = (data.blocked || []).filter(k => k !== slotKey);
      if (mode === 'available') data.available.push(slotKey);
      else if (mode === 'blocked') data.blocked.push(slotKey);
      Roster.setAvailability(studentId, data);
      return data;
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

    getRehearsals() { return readJSON(KEYS.REHEARSALS, []); },
    addRehearsal(slotKey, label = 'Rehearsal') {
      const list = Roster.getRehearsals();
      if (list.some(r => r.slotKey === slotKey)) return null;
      const r = { id: 'reh_' + Math.random().toString(36).slice(2, 9), slotKey, label, createdAt: Date.now() };
      list.push(r);
      writeJSON(KEYS.REHEARSALS, list);
      return r;
    },
    removeRehearsal(id) {
      const list = Roster.getRehearsals().filter(r => r.id !== id);
      writeJSON(KEYS.REHEARSALS, list);
    },

    getCheckIns() { return readJSON(KEYS.CHECKINS, {}); },
    checkIn(studentId, rehearsalId) {
      const all = Roster.getCheckIns();
      all[studentId] = all[studentId] || {};
      all[studentId][rehearsalId] = Date.now();
      writeJSON(KEYS.CHECKINS, all);
    },
    hasCheckedIn(studentId, rehearsalId) {
      const all = Roster.getCheckIns();
      return !!(all[studentId] && all[studentId][rehearsalId]);
    },

    getLeaves() { return readJSON(KEYS.LEAVES, []); },
    requestLeave(studentId, rehearsalId, reason) {
      const list = Roster.getLeaves();
      list.push({
        id: 'lve_' + Math.random().toString(36).slice(2, 9),
        studentId, rehearsalId, reason: reason || '',
        createdAt: Date.now(), status: 'pending'
      });
      writeJSON(KEYS.LEAVES, list);
    },
    getLeavesForStudent(studentId) {
      return Roster.getLeaves().filter(l => l.studentId === studentId);
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
      const ampm = d.getHours() >= 12 ? 'pm' : 'am';
      const h12 = ((d.getHours() + 11) % 12) + 1;
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} — ${h12}:${mm}${ampm}`;
    }
  };

  global.Roster = Roster;
})(window);
