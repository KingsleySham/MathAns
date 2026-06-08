/* ==========================================================================
   English Speaking — Group Possibility counter  (Paper 4 speaking exam)

   Students sit the speaking exam in groups of 3–4. Everyone in a group must
   share the same reporting time (timeslot). This module lets a student pick
   their class + class number and estimates the chance of ending up in the
   same group as each other student who reports at the same time.

   The estimate gives a higher chance to students from a DIFFERENT class,
   reflecting that the exam tends to mix classes within a timeslot. It is a
   fun estimate only — the school sets the real groups.

   Exported: mountSpeaking(container)  — builds the UI inside `container`.
   Used by both /finals (English Speaking tab) and /finals/engp4 (standalone).
   ========================================================================== */

export const ENGP4_DATA = {
  classes: ["S3A", "S3B", "S3C"],
  students: {
    "S3A": [
      { no: 1, name: "CHEN KEXIN", time: "10:40", redacted: false },
      { no: 2, name: "CHENG CHUN HIM", time: "10:00", redacted: false },
      { no: 3, name: "CHOI PUI HEI", time: "10:55", redacted: false },
      { no: 4, name: "CHONG SHING CHI", time: "10:00", redacted: false },
      { no: 5, name: "GU JIANUO", time: "10:40", redacted: false },
      { no: 6, name: "HO KWONG KAI", time: "10:55", redacted: false },
      { no: 7, name: "HO TIN WING", time: "11:10", redacted: false },
      { no: 8, name: "LAI PUI KWAN", time: "11:10", redacted: false },
      { no: 9, name: "LAM HO CHING CHLOE", time: "10:10", redacted: false },
      { no: 10, name: "", time: null, redacted: true },
      { no: 11, name: "LAW CHUN HEI", time: "10:55", redacted: false },
      { no: 12, name: "LEE KA KI ALVIN", time: "10:00", redacted: false },
      { no: 13, name: "LEE NOK HEI", time: "10:55", redacted: false },
      { no: 14, name: "LI DANIEL", time: "10:00", redacted: false },
      { no: 15, name: "LIU CHEUK LAM", time: "10:10", redacted: false },
      { no: 16, name: "LIU TSZ CHING", time: "10:25", redacted: false },
      { no: 17, name: "LUO DANIEL", time: "10:55", redacted: false },
      { no: 18, name: "MPINYURI AMBER SIYANDA", time: "10:25", redacted: false },
      { no: 19, name: "POON AKEMI MITO", time: "10:40", redacted: false },
      { no: 20, name: "SHEK ON YIN", time: "10:00", redacted: false },
      { no: 21, name: "SIBY ABOUBACAR", time: "10:55", redacted: false },
      { no: 22, name: "SIU YIU", time: "11:10", redacted: false },
      { no: 23, name: "SIU YU TO", time: "10:25", redacted: false },
      { no: 24, name: "SO KA YAU", time: "11:10", redacted: false },
      { no: 25, name: "SUEN HEI WUN", time: "11:25", redacted: false },
      { no: 26, name: "SUM CHEUK HIM", time: "10:00", redacted: false },
      { no: 27, name: "TAM ADRIAN", time: "10:55", redacted: false },
      { no: 28, name: "TANG CHEUK SING", time: "10:25", redacted: false },
      { no: 29, name: "TSOI WAI KIU", time: "10:25", redacted: false },
      { no: 30, name: "WANG YUEHAN", time: "10:10", redacted: false },
      { no: 31, name: "WONG WUI CHING", time: "10:55", redacted: false },
      { no: 32, name: "WONG YUE HEI JASPER", time: "10:00", redacted: false },
      { no: 33, name: "WU YAN NING", time: "11:10", redacted: false },
      { no: 34, name: "YEUNG SUM YAU", time: "10:10", redacted: false },
      { no: 35, name: "YIP HUEN", time: "10:10", redacted: false },
      { no: 36, name: "YUAN ZHI YAN", time: "10:25", redacted: false },
      { no: 37, name: "YUE TSZ CHING JANICE", time: "11:25", redacted: false },
      { no: 38, name: "ZHU JENNIFER", time: "10:10", redacted: false }
    ],
    "S3B": [
      { no: 1, name: "AU HEI YIU KAYLEY", time: "10:40", redacted: false },
      { no: 2, name: "AU TSZ YUET", time: "10:25", redacted: false },
      { no: 3, name: "BARKER LILYANNA", time: "10:40", redacted: false },
      { no: 4, name: "CHAN CHEUK YIN", time: "10:10", redacted: false },
      { no: 5, name: "CHAN SHUN HEI", time: "11:10", redacted: false },
      { no: 6, name: "CHAN YIK SUM CALEB", time: "11:10", redacted: false },
      { no: 7, name: "CHOW HEI WING", time: "11:10", redacted: false },
      { no: 8, name: "CHU CHI YUEN", time: "10:10", redacted: false },
      { no: 9, name: "CHU LOK YEE", time: "11:10", redacted: false },
      { no: 10, name: "CHUNG JOHN BENEDICT", time: "10:40", redacted: false },
      { no: 11, name: "CHUNG YEUK TING", time: "10:10", redacted: false },
      { no: 12, name: "COLLOTON TSENG YING AISLING", time: "10:25", redacted: false },
      { no: 13, name: "FU JIAKUN", time: "11:25", redacted: false },
      { no: 14, name: "HAU HIU YAU OYUMI", time: "10:55", redacted: false },
      { no: 15, name: "HUANG KIN KA PONTUS", time: "11:25", redacted: false },
      { no: 16, name: "HUNG TSAM KI", time: "10:00", redacted: false },
      { no: 17, name: "KWAN HO YAN", time: "10:10", redacted: false },
      { no: 18, name: "KWONG HAY TUNG", time: "10:25", redacted: false },
      { no: 19, name: "LEE ABIGAIL KATE", time: "11:25", redacted: false },
      { no: 20, name: "LEE TSUN HEI", time: "10:40", redacted: false },
      { no: 21, name: "LEE WING LAM", time: "10:25", redacted: false },
      { no: 22, name: "LEE YIN CHUN", time: "10:00", redacted: false },
      { no: 23, name: "LEUNG WAI SING JACOB", time: "10:00", redacted: false },
      { no: 24, name: "LI CHING FUNG ADRIAN", time: "10:40", redacted: false },
      { no: 25, name: "LI QIYONG ANGEL", time: "10:40", redacted: false },
      { no: 26, name: "LIU HAU YUI EMMA", time: "11:10", redacted: false },
      { no: 27, name: "MAN CHUN LOK", time: "10:55", redacted: false },
      { no: 28, name: "POON HEI TUNG", time: "11:25", redacted: false },
      { no: 29, name: "SANTOS KYLIE ANN", time: "10:10", redacted: false },
      { no: 30, name: "SUN YU SEN STELLA", time: "10:10", redacted: false },
      { no: 31, name: "TAM HO YIN", time: "11:10", redacted: false },
      { no: 32, name: "TSANG ANGUS", time: "10:40", redacted: false },
      { no: 33, name: "TSANG CHUN HEI", time: "10:55", redacted: false },
      { no: 34, name: "TSO KA YI", time: "10:40", redacted: false },
      { no: 35, name: "WONG YAT HEI MAX", time: "11:25", redacted: false },
      { no: 36, name: "YEUNG SIN TING", time: "10:40", redacted: false },
      { no: 37, name: "YIP LUT YIN", time: "11:25", redacted: false },
      { no: 38, name: "LAU YUET HUEN", time: "11:25", redacted: false },
      { no: 39, name: "WONG WING YU", time: "10:55", redacted: false }
    ],
    "S3C": [
      { no: 1, name: "CHAN ALVIN SHUI HANG", time: "11:10", redacted: false },
      { no: 2, name: "", time: null, redacted: true },
      { no: 3, name: "", time: null, redacted: true },
      { no: 4, name: "CHUI YAN HEI", time: "11:25", redacted: false },
      { no: 5, name: "CHUNG CHI LOK", time: "10:25", redacted: false },
      { no: 6, name: "FUNG SUN WAI", time: "10:10", redacted: false },
      { no: 7, name: "HO CHING LAM", time: "10:40", redacted: false },
      { no: 8, name: "HU YIYI", time: "11:25", redacted: false },
      { no: 9, name: "IP HOI CHING SYRENA", time: "10:10", redacted: false },
      { no: 10, name: "KUNG HOI KIU MACY", time: "11:25", redacted: false },
      { no: 11, name: "KUNG HOI NGA DAISY", time: "10:00", redacted: false },
      { no: 12, name: "KWOK HIU CHING", time: "10:10", redacted: false },
      { no: 13, name: "KWOK SHING LAM", time: "10:55", redacted: false },
      { no: 14, name: "LAM WAI CHING", time: "10:25", redacted: false },
      { no: 15, name: "LAW PATRICK", time: "10:55", redacted: false },
      { no: 16, name: "LEE TSZ CHING", time: "11:10", redacted: false },
      { no: 17, name: "LEUNG YAT CHI", time: "10:00", redacted: false },
      { no: 18, name: "LEUNG YIK FAYE CALISSA", time: "10:25", redacted: false },
      { no: 19, name: "LI WAI KAM", time: "10:25", redacted: false },
      { no: 20, name: "LI ZIEN", time: "10:00", redacted: false },
      { no: 21, name: "LIN ZHE", time: "10:10", redacted: false },
      { no: 22, name: "LIU SUM YIN", time: "11:25", redacted: false },
      { no: 23, name: "LOK TSUN HIN ETHAN", time: "10:40", redacted: false },
      { no: 24, name: "MAK SUM YU", time: "10:25", redacted: false },
      { no: 25, name: "PANG DANIEL", time: "11:25", redacted: false },
      { no: 26, name: "SHAM KINGSLEY", time: "10:00", redacted: false },
      { no: 27, name: "SIU CHEUK WAI", time: "10:55", redacted: false },
      { no: 28, name: "TONG YIN HOUSTON", time: "10:40", redacted: false },
      { no: 29, name: "", time: null, redacted: true },
      { no: 30, name: "WAN POK YIN", time: "11:10", redacted: false },
      { no: 31, name: "", time: null, redacted: true },
      { no: 32, name: "", time: null, redacted: true },
      { no: 33, name: "WOO YAN SIN", time: "10:40", redacted: false },
      { no: 34, name: "WU YAT SUM", time: "10:00", redacted: false },
      { no: 35, name: "YAM JOSHUA OLIVER", time: "11:10", redacted: false },
      { no: 36, name: "YANG EMILY", time: "11:10", redacted: false },
      { no: 37, name: "YIP MEI YING ANNABELLE", time: "10:55", redacted: false },
      { no: 38, name: "YU CHUN", time: "10:00", redacted: false },
      { no: 39, name: "WANG SHU FAN", time: "10:25", redacted: false }
    ]
  }
};

/* ---- exam meta (from the "Exam Info" sheet) ---- */
export const EXAM_INFO = {
  title: "S3 Speaking Examination (Paper 4)",
  date: "10 June 2026 (Wednesday)",
  waitingRoom: "Room 401",
  prepRoom: "Room 402"
};

/* -------------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------------- */
const CLASS_LABEL = ENGP4_DATA.classes;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function timeToMinutes(t) {
  if (!t) return Infinity;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function prettyTime(t) {
  return t ? `${t} a.m.` : "—";
}

function displayName(s) {
  if (s.redacted || !s.name) return "(name withheld)";
  return s.name;
}

/* Flatten every student into one list, tagged with their class. */
function allStudents() {
  const out = [];
  CLASS_LABEL.forEach(cls => {
    (ENGP4_DATA.students[cls] || []).forEach(s => {
      out.push({ cls, no: s.no, name: s.name, time: s.time, redacted: !!s.redacted });
    });
  });
  return out;
}

function findStudent(cls, no) {
  return allStudents().find(s => s.cls === cls && s.no === no) || null;
}

/* Everyone (besides `me`) who reports at the same timeslot. */
function sameSlotPool(me) {
  if (!me || !me.time) return [];
  return allStudents().filter(
    s => s.time === me.time && !(s.cls === me.cls && s.no === me.no)
  );
}

/* -------------------------------------------------------------------------
   Group-size model.

   N students in a timeslot are split into groups of 3 or 4. Using the fewest
   possible groups (= largest groups) gives `fours` groups of 4 and `threes`
   groups of 3.  The expected size of the group a given student lands in is
   the size-weighted average  (Σ size²)/N, so the expected number of
   group-MATES is that minus one.
   ------------------------------------------------------------------------- */
export function partitionGroups(N) {
  if (N <= 0) return { groups: 0, fours: 0, threes: 0 };
  if (N <= 4) return { groups: 1, fours: N === 4 ? 1 : 0, threes: N === 3 ? 1 : 0, singleSize: N };
  const groups = Math.ceil(N / 4);   // fewest groups → largest groups
  const fours = N - 3 * groups;      // 4·fours + 3·threes = N
  const threes = 4 * groups - N;
  return { groups, fours, threes };
}

export function expectedGroupmates(N) {
  if (N <= 1) return 0;
  if (N <= 4) return N - 1;          // everyone is in one group
  const { fours, threes } = partitionGroups(N);
  const expectedGroupSize = (16 * fours + 9 * threes) / N;
  return expectedGroupSize - 1;
}

/* -------------------------------------------------------------------------
   Possibility model.

   Within a timeslot, each candidate is weighted: 1 if same class as the
   selected student, `crossFactor` (>1) if a different class — so cross-class
   partners are more likely. The chance a candidate shares your group is the
   expected number of groupmates spread across the pool by weight:

       chance(c) = expectedGroupmates · weight(c) / Σ weights

   clamped to [1%, 99%] for display.
   ------------------------------------------------------------------------- */
export function computeChances(me, pool, crossFactor) {
  const N = pool.length + 1;
  const eMates = expectedGroupmates(N);
  let totalW = 0;
  const weighted = pool.map(c => {
    const sameClass = c.cls === me.cls;
    const weight = sameClass ? 1 : crossFactor;
    totalW += weight;
    return { c, sameClass, weight };
  });
  return weighted.map(({ c, sameClass, weight }) => {
    let chance = totalW > 0 ? (eMates * weight) / totalW : 0;
    chance = Math.max(0.01, Math.min(0.99, chance));
    return { ...c, sameClass, weight, chance };
  }).sort((a, b) =>
    b.chance - a.chance ||
    a.cls.localeCompare(b.cls) ||
    a.no - b.no
  );
}

/* -------------------------------------------------------------------------
   UI
   ------------------------------------------------------------------------- */
const STORE_KEY = "engp4.selection";

export function mountSpeaking(container) {
  if (!container || container.dataset.engp4Mounted === "1") return;
  container.dataset.engp4Mounted = "1";

  container.innerHTML = `
    <div class="speaking-finder">
      <h2 class="section-title">English Speaking — Group Possibility</h2>
      <p class="section-desc">
        Speaking exam groups are 3–4 students who report at the same time.
        Pick your class and number to see who might be in your group — and the chance for each.
        <br />選擇你的班別和學號，看看誰最有機會與你同組。
      </p>

      <div class="form-group">
        <div class="step-label">1. Your class 班別</div>
        <div class="section-tabs sp-class-tabs" id="sp-class-tabs">
          ${CLASS_LABEL.map(c => `<button type="button" class="tab sp-cls-tab" data-cls="${c}">${c}</button>`).join("")}
        </div>
      </div>

      <div class="form-group">
        <div class="step-label">2. Your class number 學號</div>
        <div class="select-wrap">
          <select id="sp-no-select" disabled>
            <option value="">— pick your class first —</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <div class="step-label">3. Mixing strength <span class="sp-hint">— how much more likely a different-class partner is</span></div>
        <div class="section-tabs sp-strength-tabs" id="sp-strength-tabs">
          <button type="button" class="tab sp-str-tab" data-r="1.5">Mild ×1.5</button>
          <button type="button" class="tab sp-str-tab active" data-r="2">Standard ×2</button>
          <button type="button" class="tab sp-str-tab" data-r="3">Strong ×3</button>
        </div>
      </div>

      <div id="sp-result" class="sp-result"></div>

      <p class="maths-foot sp-foot">
        Estimate only — the school sets the real groups. The chance is higher for students in a different class. 只供參考。
      </p>
    </div>
  `;

  const classTabs = container.querySelector("#sp-class-tabs");
  const noSelect = container.querySelector("#sp-no-select");
  const strengthTabs = container.querySelector("#sp-strength-tabs");
  const resultBox = container.querySelector("#sp-result");

  const state = { cls: "", no: null, crossFactor: 2 };

  /* restore last selection */
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (CLASS_LABEL.includes(saved.cls)) state.cls = saved.cls;
    if (typeof saved.no === "number") state.no = saved.no;
    if ([1.5, 2, 3].includes(saved.crossFactor)) state.crossFactor = saved.crossFactor;
  } catch (e) { /* ignore */ }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function populateNumbers() {
    const list = (ENGP4_DATA.students[state.cls] || []).slice().sort((a, b) => a.no - b.no);
    noSelect.innerHTML =
      `<option value="">— select your number —</option>` +
      list.map(s => {
        const label = s.redacted
          ? `No. ${s.no}`
          : `No. ${s.no} · ${esc(s.name)}`;
        return `<option value="${s.no}">${label}</option>`;
      }).join("");
    noSelect.disabled = false;
  }

  function syncClassTabs() {
    classTabs.querySelectorAll(".sp-cls-tab").forEach(b =>
      b.classList.toggle("active", b.dataset.cls === state.cls));
  }
  function syncStrengthTabs() {
    strengthTabs.querySelectorAll(".sp-str-tab").forEach(b =>
      b.classList.toggle("active", Number(b.dataset.r) === state.crossFactor));
  }

  function render() {
    if (!state.cls || state.no == null) {
      resultBox.innerHTML = "";
      return;
    }
    const me = findStudent(state.cls, state.no);
    if (!me) { resultBox.innerHTML = ""; return; }

    if (!me.time) {
      resultBox.innerHTML = `
        <div class="sp-you-card sp-cls-${me.cls}">
          <div class="sp-you-line">
            <span class="sp-badge sp-badge-${me.cls}">${me.cls}</span>
            No. ${me.no}${me.redacted ? "" : " · " + esc(displayName(me))}
          </div>
        </div>
        <div class="sp-empty">No reporting time is listed for this number on the schedule, so a group can't be worked out.</div>`;
      return;
    }

    const pool = sameSlotPool(me);
    const N = pool.length + 1;
    const part = partitionGroups(N);
    const eMates = expectedGroupmates(N);
    const ranked = computeChances(me, pool, state.crossFactor);

    const groupDesc = N <= 4
      ? `one group of ${N}`
      : [
          part.fours ? `${part.fours} group${part.fours > 1 ? "s" : ""} of 4` : "",
          part.threes ? `${part.threes} group${part.threes > 1 ? "s" : ""} of 3` : ""
        ].filter(Boolean).join(" + ");

    const diffCount = pool.filter(c => c.cls !== me.cls).length;
    const sameCount = pool.length - diffCount;
    const top = ranked[0];

    let html = `
      <div class="sp-you-card sp-cls-${me.cls}">
        <div class="sp-you-line">
          <span class="sp-badge sp-badge-${me.cls}">${me.cls}</span>
          No. ${me.no}${me.redacted ? "" : " · " + esc(displayName(me))}
        </div>
        <div class="sp-you-time">Reporting time 報到時間: <strong>${prettyTime(me.time)}</strong></div>
      </div>

      <div class="sp-summary">
        <div class="sp-summary-row"><span class="sp-summary-num">${N}</span> students report at <strong>${prettyTime(me.time)}</strong></div>
        <div class="sp-summary-row">They split into <strong>${groupDesc}</strong> → you'll have about <strong>${eMates.toFixed(1)}</strong> groupmates.</div>
        <div class="sp-summary-row sp-summary-mix">${diffCount} from other classes · ${sameCount} from ${me.cls}</div>
      </div>`;

    if (top) {
      html += `
        <div class="sp-top">
          <div class="sp-top-label">Most likely groupmate</div>
          <div class="sp-top-name">
            <span class="sp-badge sp-badge-${top.cls}">${top.cls}</span>
            No. ${top.no}${top.redacted ? "" : " · " + esc(displayName(top))}
            <span class="sp-top-pct">${Math.round(top.chance * 100)}%</span>
          </div>
        </div>`;
    }

    if (!ranked.length) {
      html += `<div class="sp-empty">No one else reports at ${prettyTime(me.time)} — you may be grouped across timeslots.</div>`;
    } else {
      html += `
        <div class="sp-list-head">Who you might be grouped with <span>(${prettyTime(me.time)} slot, ranked by chance)</span></div>
        <ul class="sp-list">
          ${ranked.map((c, i) => `
            <li class="sp-item">
              <span class="sp-rank">${i + 1}</span>
              <span class="sp-who">
                <span class="sp-badge sp-badge-${c.cls}">${c.cls}</span>
                <span class="sp-no">No. ${c.no}</span>
                <span class="sp-name">${c.redacted ? "(name withheld)" : esc(displayName(c))}</span>
                <span class="sp-tag ${c.sameClass ? "sp-tag-same" : "sp-tag-diff"}">${c.sameClass ? "same class" : "different class"}</span>
              </span>
              <span class="sp-meter">
                <span class="sp-bar"><span class="sp-bar-fill ${c.sameClass ? "is-same" : "is-diff"}" style="width:${Math.round(c.chance * 100)}%"></span></span>
                <span class="sp-pct">${Math.round(c.chance * 100)}%</span>
              </span>
            </li>`).join("")}
        </ul>`;
    }

    resultBox.innerHTML = html;
  }

  /* ---- events ---- */
  classTabs.addEventListener("click", e => {
    const btn = e.target.closest(".sp-cls-tab");
    if (!btn) return;
    state.cls = btn.dataset.cls;
    state.no = null;
    syncClassTabs();
    populateNumbers();
    persist();
    render();
  });

  noSelect.addEventListener("change", () => {
    state.no = noSelect.value ? Number(noSelect.value) : null;
    persist();
    render();
  });

  strengthTabs.addEventListener("click", e => {
    const btn = e.target.closest(".sp-str-tab");
    if (!btn) return;
    state.crossFactor = Number(btn.dataset.r);
    syncStrengthTabs();
    persist();
    render();
  });

  /* ---- initial paint (restore) ---- */
  syncStrengthTabs();
  if (state.cls) {
    syncClassTabs();
    populateNumbers();
    if (state.no != null) noSelect.value = String(state.no);
  }
  render();
}
