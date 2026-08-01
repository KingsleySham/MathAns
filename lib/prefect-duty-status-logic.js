// Pure decision logic for the prefect duty status widget (api/prefects/status.js
// and prefects/status.html). Shared with prefects/status/test.html, which imports
// this file directly in the browser so the simulator exercises the exact same
// duty-mapping code as production instead of a hand-copied reimplementation
// that could drift out of sync.
//
// Nothing here calls fetch(), touches KV, or reads the clock — every function
// takes its inputs as plain arguments, so it runs identically under Node and
// under a browser <script type="module">.

// Stations serving the school get an ETA threshold, since a slow train there
// actually changes when a prefect needs to leave (off-peak headways differ
// per line, hence per-line thresholds). The remaining lines have no
// threshold — they're checked at one representative station each purely for
// network-wide status (json.status === 0 / isdelay), so prefects get a
// heads-up on a citywide MTR problem even on a line they don't ride.
export const LINES = [
  { line: 'TWL', sta: 'SSP', label: 'Tsuen Wan Line', threshold: 8 },
  { line: 'TML', sta: 'NAC', label: 'Tuen Ma Line', threshold: 10 },
  { line: 'TCL', sta: 'NAC', label: 'Tung Chung Line', threshold: 12 },
  { line: 'AEL', sta: 'HOK', label: 'Airport Express' },
  { line: 'TKL', sta: 'TKO', label: 'Tseung Kwan O Line' },
  { line: 'EAL', sta: 'ADM', label: 'East Rail Line' },
  { line: 'SIL', sta: 'SOH', label: 'South Island Line' },
  { line: 'ISL', sta: 'CEN', label: 'Island Line' },
  { line: 'KTL', sta: 'KOT', label: 'Kwun Tong Line' },
  { line: 'DRL', sta: 'SUN', label: 'Disneyland Resort Line' },
];

export const DUTY_WINDOW = [6 * 60 + 30, 8 * 60 + 30];   // only run the ETA check 06:30–08:30
export const CUTOFF = 5 * 60 + 30;                        // 05:30 — suspension rule starts here

export const SUSPEND = new Set(['WRAINR', 'WRAINB', 'TC8NE', 'TC8SE', 'TC8NW', 'TC8SW', 'TC9', 'TC10']);

export const ADVISORY = {
  WHOT:   { text: 'Morning Assembly moves to homerooms or the Assembly Hall.', umbrella: false },
  WCOLD:  { text: 'Assembly moves indoors. Non-school jackets are allowed if a notice has been issued via eClass.', umbrella: false },
  WTS:    { text: 'Assembly moves indoors. Bring an umbrella in case of sudden showers.', umbrella: true },
  WRAINA: { text: 'Assembly moves indoors. Bring an umbrella in case of sudden showers.', umbrella: true },
  TC1:    { text: 'No change to duty — heads up only. If the weather is adverse, Assembly moves indoors.', umbrella: false },
  TC3:    { text: 'No change to duty — heads up only. If the weather is adverse, Assembly moves indoors.', umbrella: false },
};

export const SUSPEND_DETAIL =
  'All duties cancelled, no rescheduling. Classes suspended for the whole day. ' +
  'If you have not left for school, stay home. If you are already at school, remain there until it is safe to leave.';

export const NORMAL_DETAIL = 'Morning Duty at 7:45am. Morning Assembly outdoors as normal.';

// active: warnsum entries already filtered to actionCode !== 'CANCEL', each { code, name }
// minutes: minutes since HK midnight (0–1439)
// latch: { available, suspended, names } — the whole-day latch read from storage
export function classifyWeather(active, minutes, latch) {
  const afterCutoff = minutes >= CUTOFF;
  const suspendingNow = active.filter(w => SUSPEND.has(w.code)).map(w => w.name);
  const names = suspendingNow.length ? suspendingNow : latch.names;

  if ((suspendingNow.length && afterCutoff) || latch.suspended) {
    return {
      level: 'red',
      headline: 'Duty suspended — whole day',
      warnings: names,
      detail: SUSPEND_DETAIL + (suspendingNow.length ? '' : ' The signal has since been lowered, but the suspension stands for the whole day.'),
      latchAvailable: latch.available,
    };
  }

  const advisories = active.filter(w => ADVISORY[w.code]);
  if (advisories.length) {
    const umbrella = advisories.some(w => ADVISORY[w.code].umbrella);
    return {
      level: 'amber',
      headline: umbrella ? 'Duty as usual — bring an umbrella' : 'Duty as usual',
      warnings: advisories.map(w => w.name),
      detail: [...new Set(advisories.map(w => ADVISORY[w.code].text))].join(' '),
      latchAvailable: latch.available,
    };
  }

  return {
    level: 'green',
    headline: 'Duty as usual',
    warnings: [],
    detail: NORMAL_DETAIL,
    latchAvailable: latch.available,
  };
}

// cfg: one entry from LINES ({ line, sta, label, threshold })
// mtrResult: parsed JSON from getSchedule.php for that line+station, or null on fetch failure
// minutes: minutes since HK midnight
export function evaluateLine(cfg, mtrResult, minutes) {
  if (!mtrResult) return null;

  if (mtrResult.status === 0) {
    return { label: cfg.label, severity: 'red', reason: mtrResult.message || 'Special service arrangements in place.' };
  }

  const block = mtrResult.data && mtrResult.data[`${cfg.line}-${cfg.sta}`];
  if (!block) return null;

  if (block.isdelay === 'Y') {
    return { label: cfg.label, severity: 'amber', reason: 'MTR has flagged a delay on this line.' };
  }

  if (minutes < DUTY_WINDOW[0] || minutes > DUTY_WINDOW[1]) return null;

  const waits = ['UP', 'DOWN']
    .flatMap(dir => (block[dir] || []).filter(t => String(t.seq) === '1'))
    .map(t => parseInt(t.ttnt, 10))
    .filter(Number.isFinite);

  if (!waits.length) return null;
  const worst = Math.max(...waits);
  if (worst >= cfg.threshold) {
    return { label: cfg.label, severity: 'amber', reason: `Next train ${worst} minutes away — longer than usual for this time.` };
  }
  return null;
}

export function summarizeTransport(alerts) {
  return {
    ok: alerts.length === 0,
    severity: alerts.some(a => a.severity === 'red') ? 'red' : alerts.length ? 'amber' : 'green',
    alerts,
  };
}
