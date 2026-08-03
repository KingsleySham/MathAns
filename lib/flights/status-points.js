// Cathay status point earning engine.
//
// Every number in this file is transcribed from Cathay's published material
// (FLIGHTS.md §4) — the tier thresholds, the 2026 reset, the distance zones,
// and the per-sector earning table for Cathay Pacific–marketed flights
// departing on or after 20 August 2025. Do not adjust, interpolate, or
// "fix" values here without checking against the source. Partner-marketed
// flights use a different chart this module does not model: they return
// null, never a fallback number.
//
// Pure ESM with no dependencies, because it runs in two places: the
// serverless tracker (api/flights.js) and the browser planner
// (flights/index.html imports it as a module straight off the CDN).

// ---------------------------------------------------------------------------
// Tiers

export const TIER_THRESHOLDS = {
  green: 0,
  silver: 300,
  gold: 600,
  diamond: 1200,
};

export const TIER_ORDER = ['green', 'silver', 'gold', 'diamond'];

/**
 * Status points still to fly to get from one tier to another.
 *
 * Under the 2026 transition rules (reset2026 = true) reaching a tier resets
 * the balance to zero, so a multi-tier climb costs the SUM of every
 * threshold on the way up: green → diamond is 300 + 600 + 1200 = 2100.
 * From 1 January 2027 the reset is removed and the same climb costs the
 * target threshold alone: 1200.
 *
 * currentPoints offsets the climb in both rule sets.
 */
export function pointsNeeded(fromTier, toTier, currentPoints = 0, reset2026 = true) {
  const from = TIER_ORDER.indexOf(fromTier);
  const to = TIER_ORDER.indexOf(toTier);
  if (from === -1 || to === -1) return null;
  if (to <= from) return 0;
  let total;
  if (reset2026) {
    total = 0;
    for (let i = from + 1; i <= to; i++) total += TIER_THRESHOLDS[TIER_ORDER[i]];
  } else {
    total = TIER_THRESHOLDS[TIER_ORDER[to]];
  }
  return Math.max(0, total - currentPoints);
}

/** Per-step breakdown of the climb, for the ladder UI. */
export function ladderSteps(fromTier, toTier, currentPoints = 0, reset2026 = true) {
  const from = TIER_ORDER.indexOf(fromTier);
  const to = TIER_ORDER.indexOf(toTier);
  if (from === -1 || to === -1 || to <= from) return [];
  const steps = [];
  let balance = Math.max(0, currentPoints);
  for (let i = from + 1; i <= to; i++) {
    const tier = TIER_ORDER[i];
    const threshold = reset2026
      ? TIER_THRESHOLDS[tier]
      : TIER_THRESHOLDS[tier]; // 2027: thresholds are absolute, balance rolls forward
    const need = Math.max(0, threshold - balance);
    steps.push({ tier, threshold, startingBalance: balance, pointsToFly: need });
    // 2026: balance resets to zero on reaching the tier.
    // 2027: no reset — the balance you arrive with counts toward the next rung.
    balance = reset2026 ? 0 : threshold;
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Distance zones (great-circle miles, per sector)

// Countries whose sectors price on the Short – Type 2 column.
export const TYPE2_COUNTRIES = ['JP', 'ID', 'LK', 'NP', 'BD', 'IN'];

export const ZONE_LABELS = {
  ultra_short: 'Ultra-short',
  short_t1: 'Short – Type 1',
  short_t2: 'Short – Type 2',
  medium: 'Medium',
  long: 'Long',
  ultra_long: 'Ultra-long',
};

/**
 * Zone for a sector. Type 2 applies when either endpoint touches Japan,
 * Indonesia, Sri Lanka, Nepal, Bangladesh or India.
 */
export function zoneForSector(miles, countryA, countryB) {
  if (!(miles > 0)) return null;
  if (miles <= 750) return 'ultra_short';
  if (miles <= 2750) {
    const t2 = TYPE2_COUNTRIES.includes(countryA) || TYPE2_COUNTRIES.includes(countryB);
    return t2 ? 'short_t2' : 'short_t1';
  }
  if (miles <= 5000) return 'medium';
  if (miles <= 7500) return 'long';
  return 'ultra_long';
}

// ---------------------------------------------------------------------------
// Status points per sector — Cathay Pacific–marketed flights only

// Column order: ultra_short, short_t1, short_t2, medium, long, ultra_long.
// One row per (cabin, class group, fare brand) exactly as published.
// D/P/I share one Essential/Light row; W/R exist only as Flex; E only as
// Essential; F/A only as Flex. Combinations not in the table return null.
export const EARNING_TABLE = [
  { cabin: 'First', classes: ['F', 'A'], fareTypes: ['flex'], points: { ultra_short: 35, short_t1: 45, short_t2: 60, medium: 110, long: 160, ultra_long: 180 } },
  { cabin: 'Business', classes: ['J', 'C'], fareTypes: ['flex'], points: { ultra_short: 30, short_t1: 40, short_t2: 50, medium: 90, long: 130, ultra_long: 150 } },
  { cabin: 'Business', classes: ['D', 'P', 'I'], fareTypes: ['essential', 'light'], points: { ultra_short: 25, short_t1: 35, short_t2: 45, medium: 75, long: 100, ultra_long: 120 } },
  { cabin: 'Premium Economy', classes: ['W', 'R'], fareTypes: ['flex'], points: { ultra_short: 25, short_t1: 30, short_t2: 35, medium: 60, long: 80, ultra_long: 100 } },
  { cabin: 'Premium Economy', classes: ['E'], fareTypes: ['essential'], points: { ultra_short: 15, short_t1: 20, short_t2: 25, medium: 45, long: 65, ultra_long: 85 } },
  { cabin: 'Economy', classes: ['Y', 'B', 'H', 'K'], fareTypes: ['flex'], points: { ultra_short: 25, short_t1: 30, short_t2: 35, medium: 48, long: 70, ultra_long: 90 } },
  { cabin: 'Economy', classes: ['Y', 'B', 'H', 'K'], fareTypes: ['essential'], points: { ultra_short: 15, short_t1: 20, short_t2: 25, medium: 38, long: 60, ultra_long: 70 } },
  { cabin: 'Economy', classes: ['Y', 'B', 'H', 'K'], fareTypes: ['light'], points: { ultra_short: 10, short_t1: 15, short_t2: 18, medium: 30, long: 40, ultra_long: 50 } },
  { cabin: 'Economy', classes: ['M', 'L', 'V'], fareTypes: ['flex'], points: { ultra_short: 20, short_t1: 25, short_t2: 30, medium: 42, long: 60, ultra_long: 80 } },
  { cabin: 'Economy', classes: ['M', 'L', 'V'], fareTypes: ['essential'], points: { ultra_short: 10, short_t1: 15, short_t2: 20, medium: 32, long: 50, ultra_long: 60 } },
  { cabin: 'Economy', classes: ['M', 'L', 'V'], fareTypes: ['light'], points: { ultra_short: 6, short_t1: 10, short_t2: 12, medium: 22, long: 32, ultra_long: 40 } },
  { cabin: 'Economy', classes: ['S', 'N', 'Q', 'O'], fareTypes: ['flex'], points: { ultra_short: 15, short_t1: 20, short_t2: 25, medium: 32, long: 38, ultra_long: 45 } },
  { cabin: 'Economy', classes: ['S', 'N', 'Q', 'O'], fareTypes: ['essential'], points: { ultra_short: 5, short_t1: 10, short_t2: 15, medium: 22, long: 28, ultra_long: 35 } },
  { cabin: 'Economy', classes: ['S', 'N', 'Q', 'O'], fareTypes: ['light'], points: { ultra_short: 3, short_t1: 6, short_t2: 8, medium: 15, long: 18, ultra_long: 25 } },
];

/**
 * Status points for one sector, or null when the table has no answer:
 * non-CX marketing carrier, unknown booking class, or a class/brand
 * combination Cathay does not publish. Null means "we do not know" —
 * callers must not substitute a number.
 */
export function statusPoints({ marketingCarrier, bookingClass, fareType, zone }) {
  if (marketingCarrier !== 'CX') return null;
  if (!bookingClass || !fareType || !zone) return null;
  const cls = String(bookingClass).toUpperCase();
  const ft = String(fareType).toLowerCase();
  const row = EARNING_TABLE.find((r) => r.classes.includes(cls) && r.fareTypes.includes(ft));
  if (!row) return null;
  return row.points[zone] ?? null;
}

// ---------------------------------------------------------------------------
// Airports & great-circle distance

// Curated Cathay network, HKG-centric. Coordinates are airport reference
// points; a few hundredths of a degree either way never moves a sector
// across a zone boundary except exactly at one, in which case check the
// published mileage before trusting this table.
export const AIRPORTS = {
  HKG: { city: 'Hong Kong', country: 'HK', lat: 22.308, lon: 113.9185 },
  // Taiwan
  TPE: { city: 'Taipei', country: 'TW', lat: 25.0777, lon: 121.2328 },
  KHH: { city: 'Kaohsiung', country: 'TW', lat: 22.5771, lon: 120.35 },
  // Japan — Type 2
  NRT: { city: 'Tokyo Narita', country: 'JP', lat: 35.7647, lon: 140.3864 },
  HND: { city: 'Tokyo Haneda', country: 'JP', lat: 35.5494, lon: 139.7798 },
  KIX: { city: 'Osaka Kansai', country: 'JP', lat: 34.4273, lon: 135.2441 },
  NGO: { city: 'Nagoya', country: 'JP', lat: 34.8584, lon: 136.8049 },
  FUK: { city: 'Fukuoka', country: 'JP', lat: 33.5859, lon: 130.4506 },
  CTS: { city: 'Sapporo', country: 'JP', lat: 42.7752, lon: 141.6923 },
  OKA: { city: 'Okinawa', country: 'JP', lat: 26.1958, lon: 127.6459 },
  // Korea
  ICN: { city: 'Seoul Incheon', country: 'KR', lat: 37.4691, lon: 126.4505 },
  // Mainland China
  PEK: { city: 'Beijing Capital', country: 'CN', lat: 40.0801, lon: 116.5846 },
  PVG: { city: 'Shanghai Pudong', country: 'CN', lat: 31.1434, lon: 121.8052 },
  HGH: { city: 'Hangzhou', country: 'CN', lat: 30.2295, lon: 120.4344 },
  // Southeast Asia
  SIN: { city: 'Singapore', country: 'SG', lat: 1.3592, lon: 103.9894 },
  BKK: { city: 'Bangkok', country: 'TH', lat: 13.69, lon: 100.7501 },
  HKT: { city: 'Phuket', country: 'TH', lat: 8.1132, lon: 98.3169 },
  KUL: { city: 'Kuala Lumpur', country: 'MY', lat: 2.7456, lon: 101.7099 },
  PEN: { city: 'Penang', country: 'MY', lat: 5.2971, lon: 100.2767 },
  SGN: { city: 'Ho Chi Minh City', country: 'VN', lat: 10.8188, lon: 106.6519 },
  HAN: { city: 'Hanoi', country: 'VN', lat: 21.2212, lon: 105.8072 },
  MNL: { city: 'Manila', country: 'PH', lat: 14.5086, lon: 121.0198 },
  CEB: { city: 'Cebu', country: 'PH', lat: 10.3097, lon: 123.9794 },
  PNH: { city: 'Phnom Penh', country: 'KH', lat: 11.5466, lon: 104.8441 },
  // Indonesia — Type 2
  CGK: { city: 'Jakarta', country: 'ID', lat: -6.1256, lon: 106.6559 },
  DPS: { city: 'Bali Denpasar', country: 'ID', lat: -8.7482, lon: 115.1672 },
  SUB: { city: 'Surabaya', country: 'ID', lat: -7.3798, lon: 112.7871 },
  // South Asia — Type 2 (IN, LK, NP, BD)
  DEL: { city: 'Delhi', country: 'IN', lat: 28.5562, lon: 77.1 },
  BOM: { city: 'Mumbai', country: 'IN', lat: 19.0887, lon: 72.8679 },
  BLR: { city: 'Bengaluru', country: 'IN', lat: 13.1986, lon: 77.7066 },
  MAA: { city: 'Chennai', country: 'IN', lat: 12.99, lon: 80.1693 },
  CMB: { city: 'Colombo', country: 'LK', lat: 7.1808, lon: 79.8841 },
  DAC: { city: 'Dhaka', country: 'BD', lat: 23.8433, lon: 90.3978 },
  KTM: { city: 'Kathmandu', country: 'NP', lat: 27.6966, lon: 85.3591 },
  // Middle East
  DXB: { city: 'Dubai', country: 'AE', lat: 25.2528, lon: 55.3644 },
  RUH: { city: 'Riyadh', country: 'SA', lat: 24.9576, lon: 46.6988 },
  TLV: { city: 'Tel Aviv', country: 'IL', lat: 32.0114, lon: 34.8867 },
  // Oceania
  SYD: { city: 'Sydney', country: 'AU', lat: -33.9461, lon: 151.1772 },
  MEL: { city: 'Melbourne', country: 'AU', lat: -37.6733, lon: 144.8433 },
  BNE: { city: 'Brisbane', country: 'AU', lat: -27.3842, lon: 153.1175 },
  PER: { city: 'Perth', country: 'AU', lat: -31.9403, lon: 115.9669 },
  AKL: { city: 'Auckland', country: 'NZ', lat: -37.0081, lon: 174.7917 },
  // Europe
  LHR: { city: 'London Heathrow', country: 'GB', lat: 51.4706, lon: -0.4619 },
  MAN: { city: 'Manchester', country: 'GB', lat: 53.3537, lon: -2.275 },
  CDG: { city: 'Paris CDG', country: 'FR', lat: 49.0097, lon: 2.5479 },
  AMS: { city: 'Amsterdam', country: 'NL', lat: 52.3105, lon: 4.7683 },
  FRA: { city: 'Frankfurt', country: 'DE', lat: 50.0379, lon: 8.5622 },
  ZRH: { city: 'Zurich', country: 'CH', lat: 47.4647, lon: 8.5492 },
  MXP: { city: 'Milan Malpensa', country: 'IT', lat: 45.6306, lon: 8.7281 },
  FCO: { city: 'Rome Fiumicino', country: 'IT', lat: 41.8003, lon: 12.2389 },
  MAD: { city: 'Madrid', country: 'ES', lat: 40.4719, lon: -3.5626 },
  // North America
  JFK: { city: 'New York JFK', country: 'US', lat: 40.6398, lon: -73.7789 },
  BOS: { city: 'Boston', country: 'US', lat: 42.3643, lon: -71.0052 },
  ORD: { city: 'Chicago O’Hare', country: 'US', lat: 41.9742, lon: -87.9073 },
  LAX: { city: 'Los Angeles', country: 'US', lat: 33.9425, lon: -118.4081 },
  SFO: { city: 'San Francisco', country: 'US', lat: 37.6189, lon: -122.375 },
  YVR: { city: 'Vancouver', country: 'CA', lat: 49.1939, lon: -123.1844 },
  YYZ: { city: 'Toronto', country: 'CA', lat: 43.6772, lon: -79.6248 },
};

const EARTH_RADIUS_MILES = 3958.7613;

export function greatCircleMiles(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance, zone and points for one sector between two IATA codes.
 * Unknown airports return null rather than guessing.
 */
export function sectorEarning({ origin, destination, marketingCarrier, bookingClass, fareType }) {
  const a = AIRPORTS[origin];
  const b = AIRPORTS[destination];
  if (!a || !b) return null;
  const miles = greatCircleMiles(a, b);
  const zone = zoneForSector(miles, a.country, b.country);
  return {
    miles: Math.round(miles),
    zone,
    points: statusPoints({ marketingCarrier, bookingClass, fareType, zone }),
  };
}
