// Subject page templates + config helpers.
//
// A "template" is a visual+structural preset: colour palette, floating
// emojis, and a default set of sections (study tracks, practice formats,
// flashcards, e-textbook) with their cards and the tag each card filters
// by. The admin picks a template as a starting point, then customises any
// field per subject and publishes. Live config lives in Firestore at
// state/subjectPages → { pages: { <slug>: PageConfig }, updatedAt }.
//
// This module is the single source of truth for both the public renderer
// (subject-hub.js) and the admin editor (admin.js).

/* ---------- colour helpers ---------- */
export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (isNaN(n) || h.length !== 6) return '79, 70, 229';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function buildHeroGrad(p) {
  const a1 = hexToRgb(p.accent), a2 = hexToRgb(p.accent2), a3 = hexToRgb(p.accent3);
  return (
    `radial-gradient(circle at 80% 20%, rgba(${a2}, 0.20) 0%, transparent 50%),` +
    `radial-gradient(circle at 15% 80%, rgba(${a1}, 0.16) 0%, transparent 55%),` +
    `linear-gradient(135deg, #ffffff 0%, ${p.bg} 55%, rgba(${a3}, 0.18) 100%)`
  );
}

// Apply a palette to an element as inline CSS custom properties. These
// override the theme-* class defaults in subject.css, so any palette works.
export function applyPalette(el, p) {
  if (!el || !p) return;
  const s = el.style;
  s.setProperty('--accent', p.accent);
  s.setProperty('--accent-2', p.accent2);
  s.setProperty('--accent-3', p.accent3);
  s.setProperty('--accent-rgb', hexToRgb(p.accent));
  s.setProperty('--accent-2-rgb', hexToRgb(p.accent2));
  s.setProperty('--accent-3-rgb', hexToRgb(p.accent3));
  s.setProperty('--bg', p.bg);
  s.setProperty('--on-accent', p.onAccent || '#ffffff');
  s.setProperty('--hero-grad', buildHeroGrad(p));
}

/* ---------- card / section factories ---------- */
function trackCards() {
  return [
    { emoji: '🎯', pill: 'Aim for 100%', title: 'Precise notes',   sub: 'Every detail, every term, every example.', tag: '100' },
    { emoji: '⚖️', pill: 'Balanced',     title: 'Best of both',    sub: 'Core concepts plus the bits that score.',  tag: 'balanced' },
    { emoji: '✅', pill: 'Just to pass', title: 'Condensed notes', sub: 'The bare minimum to clear the bar.',       tag: 'pass' },
  ];
}
function practiceCards() {
  return [
    { emoji: '📚', title: 'Question bank', sub: 'Topic-by-topic exercises. Hit weak spots.', tag: 'bank', kind: 'excludeMock' },
    { emoji: '📝', title: 'Mock papers',   sub: 'Full exam-style sets, timed and graded.',   tag: 'mock', kind: 'mockOnly' },
  ];
}
function flashcardsCard() {
  return { emoji: '⚡', title: 'Quizlet — drill terms fast', sub: 'Tap to study the sets curated on Quizlet.', tag: 'flashcards', kind: 'flashcardsOnly' };
}
function textbookCard() {
  return { emoji: '📖', title: 'The full digital textbook', sub: 'Every chapter, every diagram — searchable.', tag: 'textbook' };
}

// Build the default sections object. `on` lists which sections are enabled.
function sections(on) {
  return {
    tracks: {
      enabled: on.includes('tracks'),
      eyebrow: 'Study tracks', title: 'Pick your battle', sub: 'Same syllabus, three depths.',
      cards: trackCards(),
    },
    practice: {
      enabled: on.includes('practice'),
      eyebrow: 'Practice', title: 'Two ways to drill', sub: 'Pick the format that suits today.',
      cards: practiceCards(),
    },
    flashcards: {
      enabled: on.includes('flashcards'),
      eyebrow: '⚡ Flashcards', title: 'Quizlet — drill terms fast', sub: 'Tap to study the sets I curate on Quizlet.',
      card: flashcardsCard(),
    },
    textbook: {
      enabled: on.includes('textbook'),
      eyebrow: '📖 E-Textbook', title: 'The full digital textbook', sub: 'Every chapter, every diagram — searchable.',
      card: textbookCard(),
    },
  };
}

/* ---------- the 7 templates ---------- */
export const TEMPLATES = {
  chronicle: {
    id: 'chronicle', name: 'Chronicle', emoji: '📜',
    blurb: 'Warm sepia & amber — humanities, History.',
    palette: { accent: '#b45309', accent2: '#d97706', accent3: '#a16207', bg: '#fdf8f0', onAccent: '#ffffff' },
    floatEmojis: ['📜', '🏛️', '⚔️', '👑', '🏺', '🗿', '📅', '🗺️'],
    sections: sections(['tracks', 'practice', 'flashcards', 'textbook']),
  },
  atlas: {
    id: 'atlas', name: 'Atlas', emoji: '🌍',
    blurb: 'Emerald, teal & cyan — Geography, earth sciences.',
    palette: { accent: '#047857', accent2: '#0d9488', accent3: '#0891b2', bg: '#f1faf5', onAccent: '#ffffff' },
    floatEmojis: ['🌍', '🗺️', '🏔️', '🌋', '🏜️', '🌊', '🧭', '🛰️'],
    sections: sections(['tracks', 'practice', 'flashcards', 'textbook']),
  },
  quill: {
    id: 'quill', name: 'Quill', emoji: '📚',
    blurb: 'Plum & rose — English Literature, languages.',
    palette: { accent: '#7c3aed', accent2: '#be185d', accent3: '#c026d3', bg: '#fbf6ff', onAccent: '#ffffff' },
    floatEmojis: ['📚', '🖋️', '🎭', '📖', '✍️', '🪶', '💭', '📝'],
    sections: sections(['tracks', 'practice', 'flashcards', 'textbook']),
  },
  circuit: {
    id: 'circuit', name: 'Circuit', emoji: '💻',
    blurb: 'Electric blue & cyan — ICT, computing.',
    palette: { accent: '#2563eb', accent2: '#0891b2', accent3: '#06b6d4', bg: '#eef4ff', onAccent: '#ffffff' },
    floatEmojis: ['💻', '🖥️', '⌨️', '🖱️', '🌐', '📡', '🔢', '💾'],
    sections: sections(['tracks', 'practice', 'flashcards', 'textbook']),
  },
  lab: {
    id: 'lab', name: 'Lab', emoji: '🔬',
    blurb: 'Green & violet — Physics, Chemistry, Biology.',
    palette: { accent: '#16a34a', accent2: '#0d9488', accent3: '#7c3aed', bg: '#f0fdf4', onAccent: '#ffffff' },
    floatEmojis: ['🔬', '⚗️', '🧪', '🧬', '🦠', '🌡️', '🔭', '🧫'],
    sections: sections(['tracks', 'practice', 'flashcards']),
  },
  abacus: {
    id: 'abacus', name: 'Abacus', emoji: '🧮',
    blurb: 'Indigo & amber — Maths, Economics, numerate subjects.',
    palette: { accent: '#4f46e5', accent2: '#2563eb', accent3: '#f59e0b', bg: '#eef2ff', onAccent: '#ffffff' },
    floatEmojis: ['🔢', '➗', '📐', '📏', '📊', '✖️', '➕', '🧮'],
    sections: sections(['tracks', 'practice', 'flashcards', 'textbook']),
  },
  canvas: {
    id: 'canvas', name: 'Canvas', emoji: '🎨',
    blurb: 'Rose, orange & violet — Arts, minimal layout (no note tiers).',
    palette: { accent: '#db2777', accent2: '#f97316', accent3: '#8b5cf6', bg: '#fff5f7', onAccent: '#ffffff' },
    floatEmojis: ['🎨', '🖌️', '🖼️', '✏️', '🎭', '🎬', '🎼', '📷'],
    sections: sections(['flashcards', 'textbook']),
  },
};

export function getTemplate(id) {
  return TEMPLATES[id] || TEMPLATES.chronicle;
}

export const TEMPLATE_LIST = Object.values(TEMPLATES);

/* ---------- routing helpers ---------- */
// Slugs that already have a clean /finals/<slug> rewrite in vercel.json.
export const CLEAN_SLUGS = ['history', 'geography', 'englit', 'ict', 'ces'];

export function pagePath(slug) {
  const s = String(slug || '').toLowerCase();
  return CLEAN_SLUGS.includes(s) ? `/finals/${s}` : `/finals/s/${s}`;
}

// Derive the slug for the currently-loaded page. Supports the clean
// routes (/finals/history), the catch-all (/finals/s/<slug>) and an
// explicit ?s=<slug> override for previews.
export function slugFromLocation() {
  try {
    const u = new URL(window.location.href);
    const q = u.searchParams.get('s');
    if (q) return q.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    return last.replace(/\.html$/, '').toLowerCase();
  } catch (_) { return ''; }
}

/* ---------- config building / merging ---------- */
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// A fresh page config from a template, for a given slug.
export function configFromTemplate(slug, templateId, extra = {}) {
  const t = getTemplate(templateId);
  const label = extra.label || (slug.charAt(0).toUpperCase() + slug.slice(1));
  return {
    slug,
    path: pagePath(slug),
    subject: extra.subject || label,
    label,
    template: t.id,
    published: false,
    emoji: t.emoji,
    eyebrow: extra.eyebrow || `S.3 · ${label}`,
    titleLead: extra.titleLead || label,
    titleAccent: 'Study Hub',
    subtitle: extra.subtitle || `Every ${label} note, mock paper and link — in one place.`,
    floatEmojis: clone(t.floatEmojis),
    palette: clone(t.palette),
    sections: clone(t.sections),
    ...extra.overrides,
  };
}

// Built-in defaults so the four original pages render fully even before
// anything is published in Firestore (and as a fallback if the doc fails
// to load). Each is marked published.
export const BUILTIN_DEFAULTS = {
  history: configFromTemplate('history', 'chronicle', {
    subject: 'History', label: 'History', eyebrow: 'S.3 · Modern World History',
    titleLead: '📜 History', subtitle: 'Every History note, mock paper and link — in one place.',
    overrides: { published: true },
  }),
  geography: configFromTemplate('geography', 'atlas', {
    subject: 'Geography', label: 'Geography', eyebrow: 'S.3 · Physical & Human Geography',
    titleLead: '🌍 Geography', subtitle: 'Every Geography note, mock paper and link — in one place.',
    overrides: { published: true },
  }),
  englit: configFromTemplate('englit', 'quill', {
    subject: 'English Literature', label: 'English Literature', eyebrow: 'S.3 · English Literature',
    titleLead: '📚 Eng Lit', subtitle: 'Every English Literature note, mock paper and link — in one place.',
    overrides: { published: true },
  }),
  ict: configFromTemplate('ict', 'circuit', {
    subject: 'ICT', label: 'ICT', eyebrow: 'S.3 · Information & Communication Technology',
    titleLead: '💻 ICT', subtitle: 'Every ICT note, mock paper and link — in one place.',
    overrides: { published: true },
  }),
};

// Resolve the effective config for a slug: stored config wins, else the
// built-in default, else null (unknown subject).
export function resolveConfig(slug, storedPages) {
  const s = String(slug || '').toLowerCase();
  if (storedPages && storedPages[s]) {
    // Merge over the built-in/template defaults so partial configs still render.
    const base = BUILTIN_DEFAULTS[s] || configFromTemplate(s, storedPages[s].template || 'chronicle');
    return deepMerge(base, storedPages[s]);
  }
  return BUILTIN_DEFAULTS[s] || null;
}

function deepMerge(base, over) {
  if (Array.isArray(over)) return clone(over);
  if (over && typeof over === 'object') {
    const out = base && typeof base === 'object' && !Array.isArray(base) ? clone(base) : {};
    for (const k of Object.keys(over)) {
      out[k] = (k in out) ? deepMerge(out[k], over[k]) : clone(over[k]);
    }
    return out;
  }
  return over === undefined ? clone(base) : over;
}
