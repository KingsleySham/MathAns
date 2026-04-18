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
    ZOOM_MEETINGS: 'roster.zoomMeetings'
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
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (global.rosterFirebase && typeof global.rosterFirebase.pushState === 'function') {
      global.rosterFirebase.pushState();
    }
  }

  function uid() { return 'stu_' + Math.random().toString(36).slice(2, 9); }
  function genId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

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
        writeJSON(KEYS.LEDGER, []);
      }
      if (!readJSON(KEYS.PROJECT, null)) {
        writeJSON(KEYS.PROJECT, {
          title: 'The Redemption of the White Queen',
          venue: 'Main Stage',
          competitionDate: '2026-05-08',
          competitionLocation: 'Hong Kong',
          subtitle: 'S.3G4 English Drama'
        });
      }
      if (!readJSON(KEYS.REHEARSALS, null)) writeJSON(KEYS.REHEARSALS, []);
      if (!readJSON(KEYS.NOTICES, null)) writeJSON(KEYS.NOTICES, []);
      if (!readJSON(KEYS.PRESENT, null)) writeJSON(KEYS.PRESENT, []);
      if (!readJSON(KEYS.REASONS, null)) writeJSON(KEYS.REASONS, DEFAULT_REASONS);
      if (!readJSON(KEYS.LEAVE_REASONS, null)) writeJSON(KEYS.LEAVE_REASONS, DEFAULT_LEAVE_REASONS);
      if (!readJSON(KEYS.CHECKIN_CODES, null)) writeJSON(KEYS.CHECKIN_CODES, {});
      if (!readJSON(KEYS.ATTENDANCE, null)) writeJSON(KEYS.ATTENDANCE, {});
      if (!readJSON(KEYS.ZOOM_MEETINGS, null)) writeJSON(KEYS.ZOOM_MEETINGS, []);
    },

    /* ── common reasons for unavailability ──────────────── */
    getCommonReasons() { return readJSON(KEYS.REASONS, DEFAULT_REASONS); },
    setCommonReasons(arr) { writeJSON(KEYS.REASONS, Array.isArray(arr) ? arr : DEFAULT_REASONS); },
    getCommonLeaveReasons() { return readJSON(KEYS.LEAVE_REASONS, DEFAULT_LEAVE_REASONS); },
    setCommonLeaveReasons(arr) { writeJSON(KEYS.LEAVE_REASONS, Array.isArray(arr) ? arr : DEFAULT_LEAVE_REASONS); },

    /* ── check-in codes (per rehearsal) ──────────────────── */
    getCheckinCodes() { return readJSON(KEYS.CHECKIN_CODES, {}); },
    generateCheckinCode(rehearsalId) {
      const codes = Roster.getCheckinCodes();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      codes[rehearsalId] = { code, createdAt: Date.now() };
      writeJSON(KEYS.CHECKIN_CODES, codes);
      return code;
    },
    verifyCheckinCode(rehearsalId, code) {
      const codes = Roster.getCheckinCodes();
      return codes[rehearsalId] && codes[rehearsalId].code === String(code).trim();
    },

    /* ── attendance records ──────────────────────────────── */
    getAttendance() { return readJSON(KEYS.ATTENDANCE, {}); },
    markAttendance(rehearsalId, studentId, status) {
      const records = Roster.getAttendance();
      records[rehearsalId] = records[rehearsalId] || {};
      records[rehearsalId][studentId] = { status, at: Date.now() };
      writeJSON(KEYS.ATTENDANCE, records);
    },
    getStudentAttendance(studentId) {
      const records = Roster.getAttendance();
      const out = [];
      Object.keys(records).forEach(rId => {
        if (records[rId] && records[rId][studentId]) {
          out.push({ rehearsalId: rId, ...records[rId][studentId] });
        }
      });
      return out;
    },

    /* ── zoom meetings (admin-created links, users join) ─── */
    getZoomMeetings() { return readJSON(KEYS.ZOOM_MEETINGS, []); },
    addZoomMeeting(meeting) {
      const list = Roster.getZoomMeetings();
      list.push({ id: genId('zm'), createdAt: Date.now(), ...meeting });
      writeJSON(KEYS.ZOOM_MEETINGS, list);
    },
    removeZoomMeeting(id) {
      writeJSON(KEYS.ZOOM_MEETINGS, Roster.getZoomMeetings().filter(z => z.id !== id));
    },

    resetForNewProduction() {
      writeJSON(KEYS.LEDGER, []);
      writeJSON(KEYS.AVAILABILITY, {});
      writeJSON(KEYS.CHECKINS, {});
      writeJSON(KEYS.LEAVES, []);
      writeJSON(KEYS.PRESENT, []);
      writeJSON(KEYS.CURRENT, null);
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

    getLedger() { return readJSON(KEYS.LEDGER, []); },

    addStudent(name, role = '') {
      const ledger = Roster.getLedger();
      const student = { id: uid(), name, role, scriptId: null, createdAt: Date.now() };
      ledger.push(student);
      writeJSON(KEYS.LEDGER, ledger);
      return student;
    },

    removeStudent(studentId) {
      const ledger = Roster.getLedger().filter(s => s.id !== studentId);
      writeJSON(KEYS.LEDGER, ledger);
      const all = Roster.getAvailabilityMap();
      delete all[studentId];
      writeJSON(KEYS.AVAILABILITY, all);
      const checkIns = Roster.getCheckIns();
      delete checkIns[studentId];
      writeJSON(KEYS.CHECKINS, checkIns);
      const leaves = Roster.getLeaves().filter(l => l.studentId !== studentId);
      writeJSON(KEYS.LEAVES, leaves);
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

    /* remember that a student has dismissed the "new poll" popup */
    markPollSeen(studentId, pollId) {
      const ledger = Roster.getLedger();
      const s = ledger.find(x => x.id === studentId);
      if (!s) return;
      s.seenPollId = pollId;
      writeJSON(KEYS.LEDGER, ledger);
    },
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

    getAvailabilityMap() { return readJSON(KEYS.AVAILABILITY, {}); },
    getAvailability(studentId) {
      const all = Roster.getAvailabilityMap();
      return all[studentId] || { available: [], blocked: [], reasons: {}, submittedAt: null };
    },
    setAvailability(studentId, data) {
      const all = Roster.getAvailabilityMap();
      all[studentId] = data;
      writeJSON(KEYS.AVAILABILITY, all);
    },
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

    getRehearsals() { return readJSON(KEYS.REHEARSALS, []); },
    addRehearsal(slotKey, label = 'Rehearsal', type = 'rehearsal', venue = 'Main Stage') {
      const list = Roster.getRehearsals();
      if (list.some(r => r.slotKey === slotKey)) return null;
      const meta = Roster.getSlotMeta(slotKey);
      const r = {
        id: genId('reh'),
        slotKey,
        label,
        type,
        venue,
        format: meta.format,
        createdAt: Date.now()
      };
      list.push(r);
      writeJSON(KEYS.REHEARSALS, list);
      return r;
    },
    updateRehearsal(id, updates) {
      const list = Roster.getRehearsals();
      const r = list.find(x => x.id === id);
      if (r) {
        Object.assign(r, updates);
        writeJSON(KEYS.REHEARSALS, list);
      }
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
        id: genId('lve'),
        studentId, rehearsalId, reason: reason || '',
        createdAt: Date.now(), status: 'pending'
      });
      writeJSON(KEYS.LEAVES, list);
    },
    getLeavesForStudent(studentId) {
      return Roster.getLeaves().filter(l => l.studentId === studentId);
    },
    updateLeaveStatus(leaveId, status) {
      const list = Roster.getLeaves();
      const l = list.find(x => x.id === leaveId);
      if (l) { l.status = status; writeJSON(KEYS.LEAVES, list); }
    },
    deleteLeave(leaveId) {
      writeJSON(KEYS.LEAVES, Roster.getLeaves().filter(l => l.id !== leaveId));
    },

    /* ── notices ─────────────────────────────────────────────── */
    getNotices() { return readJSON(KEYS.NOTICES, []); },
    addNotice(title, body, severity = 'info') {
      const list = Roster.getNotices();
      list.push({ id: genId('not'), title, body, severity, createdAt: Date.now() });
      writeJSON(KEYS.NOTICES, list);
    },
    removeNotice(id) {
      writeJSON(KEYS.NOTICES, Roster.getNotices().filter(n => n.id !== id));
    },

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
