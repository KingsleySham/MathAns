// Roster Grid Data Layer — Role-based Crew Assignments with conflict detection, hours, changelog, notifications
(function (global) {
  const KEYS = {
    ROLES: 'grid.roles',
    SESSIONS: 'grid.sessions',
    ASSIGNMENTS: 'grid.assignments',
    ACTS: 'grid.acts',
    CHANGELOG: 'grid.changelog'
  };

  const DEFAULT_ROLES = [
    { id: 'role_lighting', name: 'Lighting Designer', color: '#FFD700' },
    { id: 'role_sound', name: 'Sound Designer', color: '#87CEEB' },
    { id: 'role_costumes', name: 'Costumes', color: '#FFB6C1' },
    { id: 'role_props', name: 'Props Master', color: '#DEB887' },
    { id: 'role_stage', name: 'Stage Manager', color: '#90EE90' },
    { id: 'role_foh', name: 'Front of House', color: '#D8BFD8' },
    { id: 'role_set', name: 'Set Design', color: '#F0E68C' },
    { id: 'role_makeup', name: 'Makeup', color: '#FFDAB9' }
  ];

  const DEFAULT_ACTS = [
    { id: 'act_1', name: 'Act 1', scenes: ['Scene 1A', 'Scene 1B', 'Scene 1C'] },
    { id: 'act_2', name: 'Act 2', scenes: ['Scene 2A', 'Scene 2B'] },
    { id: 'act_3', name: 'Act 3', scenes: ['Scene 3A', 'Scene 3B', 'Scene 3C'] }
  ];

  const SESSION_TYPES = {
    REHEARSAL: 'rehearsal',
    TECH: 'tech_run',
    DRESS: 'dress_rehearsal',
    PERFORMANCE: 'performance',
    BUMPIN: 'bump_in',
    BUMPOUT: 'bump_out'
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function uid() { return Math.random().toString(36).slice(2, 9); }

  const RosterGrid = {
    KEYS,
    SESSION_TYPES,

    ensureDefaults() {
      if (!readJSON(KEYS.ROLES, null)) writeJSON(KEYS.ROLES, DEFAULT_ROLES);
      if (!readJSON(KEYS.SESSIONS, null)) writeJSON(KEYS.SESSIONS, []);
      if (!readJSON(KEYS.ASSIGNMENTS, null)) writeJSON(KEYS.ASSIGNMENTS, []);
      if (!readJSON(KEYS.ACTS, null)) writeJSON(KEYS.ACTS, DEFAULT_ACTS);
      if (!readJSON(KEYS.CHANGELOG, null)) writeJSON(KEYS.CHANGELOG, []);
    },

    /* ── ACTS/SCENES ──────────────────────── */
    getActs() { return readJSON(KEYS.ACTS, DEFAULT_ACTS); },
    updateActs(acts) { writeJSON(KEYS.ACTS, acts); },

    /* ── ROLES ────────────────────────────────── */
    getRoles() { return readJSON(KEYS.ROLES, DEFAULT_ROLES); },
    addRole(name, color) {
      const roles = RosterGrid.getRoles();
      const role = { id: 'role_' + uid(), name, color };
      roles.push(role);
      writeJSON(KEYS.ROLES, roles);
      return role;
    },
    removeRole(roleId) {
      const roles = RosterGrid.getRoles().filter(r => r.id !== roleId);
      writeJSON(KEYS.ROLES, roles);
      const assignments = RosterGrid.getAssignments().filter(a => a.roleId !== roleId);
      writeJSON(KEYS.ASSIGNMENTS, assignments);
    },

    /* ── SESSIONS ────────────────────────── */
    getSessions() { return readJSON(KEYS.SESSIONS, []); },
    addSession(dateTime, type, label, venue, durationMinutes, acts) {
      const sessions = RosterGrid.getSessions();
      const session = { id: 'sess_' + uid(), dateTime, type, label, venue, durationMinutes: durationMinutes || 120, acts: acts || [], createdAt: Date.now() };
      sessions.push(session);
      writeJSON(KEYS.SESSIONS, sessions);
      return session;
    },
    removeSession(sessionId) {
      const sessions = RosterGrid.getSessions().filter(s => s.id !== sessionId);
      writeJSON(KEYS.SESSIONS, sessions);
      const assignments = RosterGrid.getAssignments().filter(a => a.sessionId !== sessionId);
      writeJSON(KEYS.ASSIGNMENTS, assignments);
    },
    updateSession(sessionId, updates) {
      const sessions = RosterGrid.getSessions();
      const s = sessions.find(x => x.id === sessionId);
      if (!s) return;
      Object.assign(s, updates);
      writeJSON(KEYS.SESSIONS, sessions);
      return s;
    },

    /* ── ASSIGNMENTS ──────────────────────── */
    getAssignments() { return readJSON(KEYS.ASSIGNMENTS, []); },
    assign(sessionId, roleId, studentId, notes) {
      const assignments = RosterGrid.getAssignments();
      const existing = assignments.find(a => a.sessionId === sessionId && a.roleId === roleId && a.studentId === studentId);
      if (existing) return existing;
      const a = { id: 'asn_' + uid(), sessionId, roleId, studentId, notes: notes || '', createdAt: Date.now() };
      assignments.push(a);
      writeJSON(KEYS.ASSIGNMENTS, assignments);
      RosterGrid.logChange('ASSIGN', { sessionId, roleId, studentId });
      return a;
    },
    unassign(assignmentId) {
      const a = RosterGrid.getAssignments().find(x => x.id === assignmentId);
      if (a) RosterGrid.logChange('UNASSIGN', { sessionId: a.sessionId, roleId: a.roleId, studentId: a.studentId });
      const assignments = RosterGrid.getAssignments().filter(x => x.id !== assignmentId);
      writeJSON(KEYS.ASSIGNMENTS, assignments);
    },
    getAssignmentsForSlot(sessionId, roleId) {
      return RosterGrid.getAssignments().filter(a => a.sessionId === sessionId && a.roleId === roleId);
    },
    getAssignmentsForPerson(studentId) {
      return RosterGrid.getAssignments().filter(a => a.studentId === studentId);
    },

    /* ── CONFLICT DETECTION ─────────────── */
    checkAvailabilityConflict(studentId, sessionId) {
      const session = RosterGrid.getSessions().find(s => s.id === sessionId);
      if (!session) return null;
      const avail = Roster.getAvailability(studentId);
      const blocked = avail.blocked || [];
      const slotKey = Roster.buildSlotKey(new Date(session.dateTime), new Date(session.dateTime).getHours(), new Date(session.dateTime).getMinutes());
      return blocked.includes(slotKey) ? { conflict: true, reason: 'Marked unavailable' } : null;
    },

    /* ── HOURS TRACKING ─────────────────── */
    getTotalHours(studentId) {
      const assignments = RosterGrid.getAssignmentsForPerson(studentId);
      const sessions = RosterGrid.getSessions();
      let total = 0;
      assignments.forEach(a => {
        const s = sessions.find(x => x.id === a.sessionId);
        if (s) total += s.durationMinutes / 60;
      });
      return total.toFixed(1);
    },
    getPersonHoursBreakdown(studentId) {
      const assignments = RosterGrid.getAssignmentsForPerson(studentId);
      const sessions = RosterGrid.getSessions();
      const breakdown = [];
      assignments.forEach(a => {
        const s = sessions.find(x => x.id === a.sessionId);
        const r = RosterGrid.getRoles().find(x => x.id === a.roleId);
        if (s && r) breakdown.push({
          session: s.label,
          role: r.name,
          hours: (s.durationMinutes / 60).toFixed(1)
        });
      });
      return breakdown;
    },

    /* ── CHANGELOG ──────────────────────── */
    logChange(action, data) {
      const log = readJSON(KEYS.CHANGELOG, []);
      log.push({ id: uid(), action, data, timestamp: Date.now() });
      writeJSON(KEYS.CHANGELOG, log);
    },
    getChangelog() { return readJSON(KEYS.CHANGELOG, []).sort((a, b) => b.timestamp - a.timestamp); },
    clearChangelog() { writeJSON(KEYS.CHANGELOG, []); },

    /* ── NOTIFICATIONS ─────────────────── */
    generateCrewEmail(studentId, studentName) {
      const assignments = RosterGrid.getAssignmentsForPerson(studentId);
      const sessions = RosterGrid.getSessions();
      const roles = RosterGrid.getRoles();
      const lines = [
        `Dear ${studentName},`,
        ``,
        `You have been assigned to the following roles in "The Redemption of the White Queen":`,
        ``
      ];
      assignments.forEach(a => {
        const s = sessions.find(x => x.id === a.sessionId);
        const r = roles.find(x => x.id === a.roleId);
        if (s && r) {
          lines.push(`• ${r.name} — ${RosterGrid.formatDateTime(s.dateTime)} (${s.venue})`);
          if (a.notes) lines.push(`  Note: ${a.notes}`);
        }
      });
      lines.push(``);
      lines.push(`Total hours: ${RosterGrid.getTotalHours(studentId)} hours`);
      lines.push(``);
      lines.push(`Please confirm your availability.`);
      lines.push(`Production Team`);
      return lines.join('\n');
    },

    /* ── HELPERS ──────────────────────── */
    formatDateTime(dateTimeStr) {
      const d = new Date(dateTimeStr);
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} at ${h}:${m}`;
    },
    typeLabel(type) {
      const labels = {
        rehearsal: '🎭 Rehearsal',
        tech_run: '⚙️ Tech Run',
        dress_rehearsal: '👗 Dress Rehearsal',
        performance: '🎬 Performance',
        bump_in: '📦 Bump-in',
        bump_out: '📦 Bump-out'
      };
      return labels[type] || type;
    }
  };

  global.RosterGrid = RosterGrid;
})(window);
