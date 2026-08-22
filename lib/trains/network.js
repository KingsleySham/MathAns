// Chatswood ⇄ Hurstville rail network model.
//
// The stopping patterns, platforms, interchange walks and ride times here are
// transcribed from the journey brief that asked for this app (see
// trains/README.md, "Where the numbers come from"). Where the brief's own
// figures did not reconcile — its per-option ride times imply different
// Martin Place → Central runs for the same train — the call tables win,
// because one consistent line model is what lets the planner say "the
// 10:14 from Chatswood catches the 10:31 at Sydenham" and be right.
//
// One correction of substance: Martin Place, Central and Sydenham all sit on
// the SAME T4 line, in that order. The three "route options" in the brief are
// not three lines; they are three points at which you leave the Metro and
// join one southbound train. So services are modelled once, line-wide, with a
// call table anchored at Martin Place (or Central for South Coast services,
// which do not call there) — never as three independent departure boards,
// which would invent trains that stop at Sydenham but never passed Central.
//
// Pure ESM with no dependencies: it runs in the browser (trains/index.html
// imports it as a module) and under node --test.

// ---------------------------------------------------------------------------
// Stations
//
// English names are authoritative — they are what is printed on the platform
// signs, the indicator boards and the on-train announcements. The Traditional
// Chinese names are the transliterations in common use in Sydney's Chinese
// community, shown alongside so a reader can recognise the stop, never
// instead of the English.

export const STATIONS = {
  chatswood: { en: 'Chatswood', zh: '車士活' },
  crowsNest: { en: 'Crows Nest', zh: '克羅斯內斯特' },
  victoriaCross: { en: 'Victoria Cross', zh: '維多利亞十字' },
  barangaroo: { en: 'Barangaroo', zh: '巴蘭加魯' },
  martinPlace: { en: 'Martin Place', zh: '馬丁廣場' },
  gadigal: { en: 'Gadigal', zh: '加迪高' },
  central: { en: 'Central', zh: '中央車站' },
  waterloo: { en: 'Waterloo', zh: '滑鐵盧' },
  sydenham: { en: 'Sydenham', zh: '悉尼漢' },
  townHall: { en: 'Town Hall', zh: '市政廳' },
  redfern: { en: 'Redfern', zh: '雷德芬' },
  tempe: { en: 'Tempe', zh: '坦比' },
  wolliCreek: { en: 'Wolli Creek', zh: '沃利溪' },
  arncliffe: { en: 'Arncliffe', zh: '安克利夫' },
  banksia: { en: 'Banksia', zh: '班克夏' },
  rockdale: { en: 'Rockdale', zh: '洛克代爾' },
  kogarah: { en: 'Kogarah', zh: '高嘉華' },
  carlton: { en: 'Carlton', zh: '卡爾頓' },
  allawah: { en: 'Allawah', zh: '阿拉瓦' },
  hurstville: { en: 'Hurstville', zh: '好市圍' },
};

/** The three places you can step off the Metro and onto a suburban train. */
export const INTERCHANGES = ['martinPlace', 'central', 'sydenham'];

/**
 * How fast a pattern runs, which is the thing worth spotting on a board: the
 * peak South Coast expresses and the limited-stops trains are what make a
 * journey short, and they are the services a reader is looking for.
 */
export const SPEEDS = {
  express: { key: 'express', en: 'Express', zh: '特快' },
  limited: { key: 'limited', en: 'Limited stops', zh: '快車 · 部分站停' },
  allStops: { key: 'allStops', en: 'All stops', zh: '每站停' },
};

// ---------------------------------------------------------------------------
// Dayparts
//
// Sydney's timetable changes shape through the day, and so does the answer to
// "which way is fastest" — the South Coast expresses that make Central the
// best interchange only run in the peaks.

export const WEEKDAY_DAYPARTS = [
  { key: 'earlyMorning', from: 5 * 60, to: 6 * 60 + 30 },
  { key: 'amPeak', from: 6 * 60 + 30, to: 9 * 60 + 30 },
  { key: 'interpeak', from: 9 * 60 + 30, to: 15 * 60 },
  { key: 'pmPeak', from: 15 * 60, to: 19 * 60 },
  { key: 'evening', from: 19 * 60, to: 24 * 60 },
  // Trains keep running past midnight, thinly. Modelled on the same minute
  // scale rather than wrapping to zero, so a journey boarded at 23:55 and
  // finished at 00:25 is one journey and not two half-journeys.
  { key: 'lateNight', from: 24 * 60, to: 25 * 60 },
];

export const WEEKEND_DAYPARTS = [
  { key: 'earlyMorning', from: 5 * 60, to: 7 * 60 },
  { key: 'weekendDay', from: 7 * 60, to: 20 * 60 },
  { key: 'evening', from: 20 * 60, to: 24 * 60 },
  { key: 'lateNight', from: 24 * 60, to: 25 * 60 },
];

/** Dayparts covering a given service day, earliest first. */
export function daypartsFor(isWeekend) {
  return isWeekend ? WEEKEND_DAYPARTS : WEEKDAY_DAYPARTS;
}

/** The daypart a wall-clock minute falls in, or null outside service hours. */
export function daypartAt(minuteOfDay, isWeekend) {
  return daypartsFor(isWeekend).find((d) => minuteOfDay >= d.from && minuteOfDay < d.to) || null;
}

// ---------------------------------------------------------------------------
// Services
//
// A service is one stopping pattern, described by a call table of minutes from
// its anchor stop, plus how often it runs in each daypart. `offset` staggers
// the patterns against each other so two patterns do not perpetually leave in
// the same minute; it is what makes the model deterministic rather than
// arbitrary.
//
// `platform` on a call is the platform you BOARD from, and it is only filled
// in where the brief stated it. A missing platform renders as "check the
// indicator board" — never as a guess, because an elderly passenger sent to
// the wrong platform by a confident-looking number is worse off than one who
// was told to look up.

/** Sydney Metro M1, southbound: Chatswood → Sydenham. */
export const METRO_SOUTH = {
  id: 'metro-south',
  speed: SPEEDS.allStops,
  mode: 'metro',
  line: 'M1',
  lineLabel: { en: 'Metro M1', zh: '地鐵 M1' },
  headsign: { en: 'towards Sydenham', zh: '往 Sydenham 方向' },
  calls: [
    { station: 'chatswood', t: 0, platform: '1 / 2' },
    { station: 'crowsNest', t: 4 },
    { station: 'victoriaCross', t: 6 },
    { station: 'barangaroo', t: 9 },
    { station: 'martinPlace', t: 11 },
    { station: 'gadigal', t: 13 },
    { station: 'central', t: 15 },
    { station: 'waterloo', t: 18 },
    { station: 'sydenham', t: 22 },
  ],
  headways: {
    earlyMorning: 10, amPeak: 4, interpeak: 5, pmPeak: 4,
    evening: 10, weekendDay: 6, lateNight: 15,
  },
  offset: 0,
};

/**
 * T4 peak limited stops — the fast one, and the reason Sydenham is not always
 * the answer in the morning: it runs past Sydenham without stopping.
 */
export const T4_PEAK_LIMITED = {
  id: 't4-peak-limited',
  speed: SPEEDS.limited,
  mode: 'train',
  line: 'T4',
  lineLabel: { en: 'T4 Illawarra', zh: 'T4 線' },
  headsign: { en: 'towards Cronulla / Waterfall', zh: '往 Cronulla / Waterfall 方向' },
  calls: [
    { station: 'martinPlace', t: 0, platform: '2' },
    { station: 'townHall', t: 2 },
    { station: 'central', t: 5, platform: '25' },
    { station: 'redfern', t: 8 },
    { station: 'wolliCreek', t: 18 },
    { station: 'kogarah', t: 23 },
    { station: 'hurstville', t: 26 },
  ],
  headways: { amPeak: 15, pmPeak: 15 },
  offset: 3,
};

/** T4 peak semi-fast — the peak pattern that does call at Sydenham. */
export const T4_PEAK_SEMI_FAST = {
  id: 't4-peak-semi-fast',
  speed: SPEEDS.limited,
  mode: 'train',
  line: 'T4',
  lineLabel: { en: 'T4 Illawarra', zh: 'T4 線' },
  headsign: { en: 'towards Cronulla / Waterfall', zh: '往 Cronulla / Waterfall 方向' },
  calls: [
    { station: 'martinPlace', t: 0, platform: '2' },
    { station: 'townHall', t: 2 },
    { station: 'central', t: 5, platform: '25' },
    { station: 'redfern', t: 8 },
    { station: 'sydenham', t: 15, platform: '3 / 4' },
    { station: 'wolliCreek', t: 19 },
    { station: 'kogarah', t: 23 },
    { station: 'hurstville', t: 25 },
  ],
  headways: { amPeak: 15, pmPeak: 15 },
  offset: 10,
};

/** T4 standard off-peak / weekend pattern. */
export const T4_STANDARD = {
  id: 't4-standard',
  speed: SPEEDS.limited,
  mode: 'train',
  line: 'T4',
  lineLabel: { en: 'T4 Illawarra', zh: 'T4 線' },
  headsign: { en: 'towards Cronulla / Waterfall', zh: '往 Cronulla / Waterfall 方向' },
  calls: [
    { station: 'martinPlace', t: 0, platform: '2' },
    { station: 'townHall', t: 2 },
    { station: 'central', t: 5, platform: '25' },
    { station: 'redfern', t: 8 },
    { station: 'sydenham', t: 15, platform: '3 / 4' },
    { station: 'wolliCreek', t: 19 },
    { station: 'rockdale', t: 21 },
    { station: 'kogarah', t: 24 },
    { station: 'hurstville', t: 27 },
  ],
  headways: { earlyMorning: 20, interpeak: 15, evening: 20, weekendDay: 15, lateNight: 30 },
  offset: 4,
};

/** T4 all stops — runs at every hour of the service day. */
export const T4_ALL_STOPS = {
  id: 't4-all-stops',
  speed: SPEEDS.allStops,
  mode: 'train',
  line: 'T4',
  lineLabel: { en: 'T4 Illawarra', zh: 'T4 線' },
  headsign: { en: 'towards Cronulla / Waterfall', zh: '往 Cronulla / Waterfall 方向' },
  calls: [
    { station: 'martinPlace', t: 0, platform: '2' },
    { station: 'townHall', t: 2 },
    { station: 'central', t: 5, platform: '25' },
    { station: 'redfern', t: 8 },
    { station: 'sydenham', t: 16, platform: '3 / 4' },
    { station: 'tempe', t: 18 },
    { station: 'wolliCreek', t: 20 },
    { station: 'arncliffe', t: 22 },
    { station: 'banksia', t: 24 },
    { station: 'rockdale', t: 25 },
    { station: 'kogarah', t: 27 },
    { station: 'carlton', t: 29 },
    { station: 'allawah', t: 30 },
    { station: 'hurstville', t: 32 },
  ],
  headways: {
    earlyMorning: 20, amPeak: 10, interpeak: 15, pmPeak: 10,
    evening: 20, weekendDay: 15, lateNight: 30,
  },
  offset: 9,
};

/**
 * South Coast Line intercity, peak only — two stops from Central and the
 * fastest run on the southern half, which is the whole case for interchanging
 * at Central rather than earlier. It does not call at Martin Place, so its
 * call table is anchored at Central.
 */
export const SCO_PEAK = {
  id: 'sco-peak',
  speed: SPEEDS.express,
  mode: 'train',
  line: 'SCO',
  lineLabel: { en: 'South Coast Line', zh: '南海岸線' },
  headsign: { en: 'towards Wollongong / Kiama', zh: '往 Wollongong / Kiama 方向' },
  calls: [
    { station: 'central', t: 0, platform: '25' },
    { station: 'redfern', t: 3 },
    { station: 'wolliCreek', t: 13 },
    { station: 'hurstville', t: 18 },
  ],
  headways: { amPeak: 30, pmPeak: 30 },
  offset: 7,
};

export const SOUTHBOUND_SUBURBAN = [
  T4_PEAK_LIMITED,
  T4_PEAK_SEMI_FAST,
  T4_STANDARD,
  T4_ALL_STOPS,
  SCO_PEAK,
];

// ---------------------------------------------------------------------------
// The northbound mirror
//
// Return trips run the same patterns the other way. Boarding platforms are a
// different matter: the brief only documented the southbound ones, so the
// mirrored services carry no platform numbers and the app tells the reader to
// read the indicator board. The headsign — which is the wayfinding cue that
// actually matters on a Sydney platform — is stated instead, and it is one we
// can be sure of.

/** Mirror a service: same stops, reversed, with times measured from the far end. */
export function reverseService(service, overrides = {}) {
  const total = service.calls[service.calls.length - 1].t;
  return {
    ...service,
    ...overrides,
    id: overrides.id || `${service.id}-rev`,
    calls: service.calls
      .map((call) => ({ station: call.station, t: total - call.t }))
      .reverse(),
  };
}

export const METRO_NORTH = reverseService(METRO_SOUTH, {
  id: 'metro-north',
  headsign: { en: 'towards Tallawong', zh: '往 Tallawong 方向' },
});

const CITYBOUND_T4 = { en: 'towards City / Bondi Junction', zh: '往市區 / Bondi Junction 方向' };
const CITYBOUND_SCO = { en: 'towards Central / Bondi Junction', zh: '往中央車站 / Bondi Junction 方向' };

export const NORTHBOUND_SUBURBAN = SOUTHBOUND_SUBURBAN.map((service) =>
  reverseService(service, {
    headsign: service.line === 'SCO' ? CITYBOUND_SCO : CITYBOUND_T4,
    // Stagger the return workings off the outbound ones; two directions of the
    // same pattern do not leave opposite ends of the line in the same minute.
    offset: (service.offset + 6) % 15,
  }),
);

// ---------------------------------------------------------------------------
// Interchanges

/**
 * Metro concourse → suburban platform, in minutes.
 *
 * The brief gives ranges (Martin Place 1–2, Central 3–4, Sydenham 1–2); the
 * upper bound is used, because a plan that only works at the walking pace of
 * someone half their age is not a plan. `slowWalkExtra` is added on top when
 * the reader asks for more time.
 */
export const TRANSFERS = {
  martinPlace: {
    walkMinutes: 2,
    note: {
      en: 'Underground concourse — follow the Sydney Trains signs, no stairs to the street.',
      zh: '地下通道直達，跟隨 Sydney Trains 指示牌，毋須出地面。',
    },
  },
  central: {
    walkMinutes: 4,
    note: {
      en: 'Escalators up from the Metro platforms to the Eastern Suburbs concourse.',
      zh: '由地鐵月台乘扶手電梯上東區鐵路大堂。',
    },
  },
  sydenham: {
    walkMinutes: 2,
    note: {
      en: 'Short cross-platform walk to the Sydney Trains platforms.',
      zh: '短距離步行至 Sydney Trains 月台。',
    },
  },
};

/** Minutes added to every transfer when the reader asks for a slower walk. */
export const SLOW_WALK_EXTRA = 3;

/**
 * Safety margin on every connection. A model this coarse should not be
 * promising a change that needs the two trains to be to the minute.
 */
export const CONNECTION_BUFFER = 1;

// ---------------------------------------------------------------------------
// Service span

export const SERVICE_START = 5 * 60;
/** 01:00 the following morning, on the same minute scale. */
export const SERVICE_END = 25 * 60;

// ---------------------------------------------------------------------------
// Lookups

export function stationName(key) {
  return STATIONS[key] || { en: key, zh: key };
}

/** The call a service makes at a station, or undefined if it runs through. */
export function callAt(service, station) {
  return service.calls.find((call) => call.station === station);
}
