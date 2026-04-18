// Roster Grid Data Layer — Role-based Crew Assignments
// Extends the parent roster with crew roles, session types, and assignments
// Stores: roles, sessions, assignments

(function (global) {
  const KEYS = {
    ROLES: 'grid.roles',
    SESSIONS: 'grid.sessions',
    ASSIGNMENTS: 'grid.assignments'
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
      if (!readJSON(KEYS.ROLES, null)) {
        writeJSON(KEYS.ROLES, DEFAULT_ROLES);
      }
      if (!readJSON(KEYS.SESSIONS, null)) {
        writeJSON(KEYS.SESSIONS, []);
      }
      if (!readJSON(KEYS.ASSIGNMENTS, null)) {
        writeJSON(KEYS.ASSIGNMENTS, []);
      }
    },

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

    /* ── SESSIONS ────────────────────────────── */
    getSessions() { return readJSON(KEYS.SESSIONS, []); },
    addSession(dateTime, type, label, venue) {
      const sessions = RosterGrid.getSessions();
      const session = { id: 'sess_' + uid(), dateTime, type, label, venue, createdAt: Date.now() };
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

    /* ── ASSIGNMENTS (Role + Session → Person) */
    getAssignments() { return readJSON(KEYS.ASSIGNMENTS, []); },
    assign(sessionId, roleId, studentId, notes) {
      const assignments = RosterGrid.getAssignments();
      const existing = assignments.find(a => a.sessionId === sessionId && a.roleId === roleId && a.studentId === studentId);
      if (existing) return existing;
      const a = { id: 'asn_' + uid(), sessionId, roleId, studentId, notes: notes || '', createdAt: Date.now() };
      assignments.push(a);
      writeJSON(KEYS.ASSIGNMENTS, assignments);
      return a;
    },
    unassign(assignmentId) {
      const assignments = RosterGrid.getAssignments().filter(a => a.id !== assignmentId);
      writeJSON(KEYS.ASSIGNMENTS, assignments);
    },
    getAssignmentsForSlot(sessionId, roleId) {
      return RosterGrid.getAssignments().filter(a => a.sessionId === sessionId && a.roleId === roleId);
    },
    getAssignmentsForPerson(studentId) {
      return RosterGrid.getAssignments().filter(a => a.studentId === studentId);
    },

    /* ── GAPS (empty cells) ────────────────── */
    getGaps() {
      const sessions = RosterGrid.getSessions();
      const roles = RosterGrid.getRoles();
      const assignments = RosterGrid.getAssignments();
      const gaps = [];
      sessions.forEach(s => {
        roles.forEach(r => {
          const assigned = assignments.filter(a => a.sessionId === s.id && a.roleId === r.id);
          if (assigned.length === 0) {
            gaps.push({ sessionId: s.id, roleId: r.id, session: s, role: r });
          }
        });
      });
      return gaps;
    },

    /* ── HELPERS ──────────────────────────── */
    formatDateTime(dateTimeStr) {
      const d = new Date(dateTimeStr);
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} at ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
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
