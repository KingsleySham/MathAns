// ============================================================
//  S.3 Maths Answer Finder — app logic
// ============================================================

(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────
  var currentSection = "4.1";
  var currentUtChapter = "";   // "Ch4", "Ch5", or "Ch6"
  var DIAGRAMS = {};           // loaded from diagrams.json

  // ── Load diagram mapping ──────────────────────────────────
  fetch("/diagrams.json")
    .then(function (r) { return r.json(); })
    .then(function (d) { DIAGRAMS = d || {}; })
    .catch(function () {}); // graceful fallback if file missing

  // ── Init ─────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    // Wire tab buttons
    var tabs = document.querySelectorAll(".tab");
    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectSection(btn.getAttribute("data-section"));
      });
    });

    // Wire UT chapter select
    var utChapterSel = document.getElementById("ut-chapter-select");
    utChapterSel.addEventListener("change", function () {
      currentUtChapter = utChapterSel.value;
      populateQuestions();
      hideAnswer();
    });

    // Wire question select (hide answer on change)
    var qSel = document.getElementById("question-select");
    qSel.addEventListener("change", function () {
      hideAnswer();
    });

    // Default: load 4.1
    selectSection("4.1");
  });

  // ── Section selection ────────────────────────────────────
  window.selectSection = function (key) {
    currentSection = key;
    currentUtChapter = "";

    // Update active tab
    document.querySelectorAll(".tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-section") === key);
    });

    // Show/hide UT chapter picker
    var utGroup = document.getElementById("ut-chapter-group");
    var qStepLabel = document.getElementById("q-step-label");
    if (key === "UT") {
      utGroup.style.display = "block";
      // Reset UT chapter select
      var utSel = document.getElementById("ut-chapter-select");
      utSel.value = "";
      currentUtChapter = "";
      qStepLabel.textContent = "3. 選擇題號 (Question)";
    } else {
      utGroup.style.display = "none";
      qStepLabel.textContent = "2. 選擇題號 (Question)";
    }

    populateQuestions();
    hideAnswer();
  };

  // ── Populate question dropdown ───────────────────────────
  function populateQuestions() {
    var sel = document.getElementById("question-select");
    sel.innerHTML = '<option value="">— 請選擇 / Select —</option>';

    if (currentSection === "UT") {
      if (!currentUtChapter) return; // wait for chapter choice

      var utData = SECTIONS["UT"];
      if (!utData || !utData.questions) return;

      // Filter keys for this chapter prefix, e.g. "Ch4_"
      var prefix = currentUtChapter + "_";
      var allKeys = Object.keys(utData.questions);
      var chapterKeys = allKeys.filter(function (k) {
        return k.indexOf(prefix) === 0;
      });

      // Sort by the numeric suffix
      chapterKeys.sort(function (a, b) {
        var na = parseInt(a.split("_")[1], 10);
        var nb = parseInt(b.split("_")[1], 10);
        return na - nb;
      });

      chapterKeys.forEach(function (k) {
        var qNum = k.split("_")[1];  // e.g. "1", "2", "10"
        var opt = document.createElement("option");
        opt.value = k;               // store full key as value
        opt.textContent = "Q" + qNum;
        sel.appendChild(opt);
      });

    } else {
      var data = SECTIONS[currentSection];
      if (!data || !data.questions) return;

      var qs = data.questions;
      var keys = Object.keys(qs).map(Number).sort(function (a, b) { return a - b; });
      keys.forEach(function (k) {
        var opt = document.createElement("option");
        opt.value = k;
        opt.textContent = "Q" + k;
        sel.appendChild(opt);
      });
    }
  }

  // ── Show result ──────────────────────────────────────────
  window.showResult = function () {
    var sel = document.getElementById("question-select");
    var qKey = sel.value;

    if (!qKey) {
      alert("請選擇題號 / Please select a question number.");
      return;
    }

    var qData;
    var sectionLabel;

    if (currentSection === "UT") {
      if (!currentUtChapter) {
        alert("請選擇章節 / Please select a chapter.");
        return;
      }
      var utData = SECTIONS["UT"];
      // qKey is the full key e.g. "Ch4_3"
      qData = utData.questions[qKey];
      var qNum = qKey.split("_")[1];
      sectionLabel = "UT · " + currentUtChapter + " · Q" + qNum;
    } else {
      qData = SECTIONS[currentSection].questions[parseInt(qKey)];
      sectionLabel = "Section " + currentSection + " · Q" + qKey;
    }

    if (!qData) {
      alert("找不到答案 / Answer not found.");
      return;
    }

    // Set header
    document.getElementById("answer-header").textContent = sectionLabel;

    // Render steps & answer
    var stepsContainer = document.getElementById("steps-container");
    stepsContainer.innerHTML = "";

    // Diagram image (if one has been uploaded for this question)
    var sectionDiagrams = DIAGRAMS[currentSection] || {};
    var imgPath = sectionDiagrams[qKey];
    if (imgPath) {
      var imgDiv = document.createElement("div");
      imgDiv.className = "diagram-img-container";
      var img = document.createElement("img");
      img.src = "/" + imgPath;
      img.alt = "Diagram for " + sectionLabel;
      img.className = "diagram-img";
      imgDiv.appendChild(img);
      stepsContainer.appendChild(imgDiv);
    }

    if (qData.parts) {
      // Multi-part question
      qData.parts.forEach(function (part) {
        var block = document.createElement("div");
        block.className = "part-block";

        // Part label
        if (part.label) {
          var lbl = document.createElement("div");
          lbl.className = "part-label";
          lbl.textContent = "Part " + part.label;
          block.appendChild(lbl);
        }

        // Steps
        if (part.steps && part.steps.length > 0) {
          block.appendChild(buildStepsList(part.steps));
        }

        // Part final answer (yellow)
        if (part.answer) {
          var ans = document.createElement("div");
          ans.className = "part-final-answer";
          ans.innerHTML = renderMath(part.answer);
          block.appendChild(ans);
        }

        stepsContainer.appendChild(block);
      });

      // Hide the global final-answer div (parts have their own)
      document.getElementById("final-answer").style.display = "none";

    } else {
      // Simple steps + answer format
      if (qData.steps && qData.steps.length > 0) {
        stepsContainer.appendChild(buildStepsList(qData.steps));
      }

      // Final answer (yellow highlight)
      var finalDiv = document.getElementById("final-answer");
      finalDiv.style.display = "block";

      // Check if MCQ (single letter A/B/C/D)
      if (qData.answer && /^[A-Da-d]$/.test(qData.answer.trim())) {
        finalDiv.innerHTML = '<span class="mcq-answer">' + escapeHtml(qData.answer.trim()) + '</span>';
      } else {
        finalDiv.innerHTML = renderMath(qData.answer || "");
      }
    }

    // Show panel
    var panel = document.getElementById("answer-panel");
    panel.style.display = "block";

    // Smooth scroll to answer
    setTimeout(function () {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  // ── Helpers ──────────────────────────────────────────────
  function buildStepsList(steps) {
    var ol = document.createElement("ol");
    ol.className = "steps-list" + (steps.length === 1 ? " single-step" : "");

    steps.forEach(function (text, i) {
      var li = document.createElement("li");
      li.setAttribute("data-n", i + 1);

      var pipeIdx = text.indexOf(" | ");
      if (pipeIdx !== -1) {
        // Split into working (left) and reason (right)
        var workText = text.slice(0, pipeIdx);
        var reasonText = text.slice(pipeIdx + 3); // skip " | "

        var workSpan = document.createElement("span");
        workSpan.className = "step-work";
        workSpan.innerHTML = renderMath(workText);

        var reasonSpan = document.createElement("span");
        reasonSpan.className = "step-reason";
        reasonSpan.textContent = reasonText;

        li.appendChild(workSpan);
        li.appendChild(reasonSpan);
      } else {
        // No reason — just working text, full width
        var workSpan2 = document.createElement("span");
        workSpan2.className = "step-work";
        workSpan2.innerHTML = renderMath(text);
        li.appendChild(workSpan2);
      }

      ol.appendChild(li);
    });

    return ol;
  }

  function hideAnswer() {
    var panel = document.getElementById("answer-panel");
    panel.style.display = "none";
    document.getElementById("steps-container").innerHTML = "";
    document.getElementById("final-answer").textContent = "";
    document.getElementById("final-answer").style.display = "block";
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Converts fraction patterns into stacked <span class="frac"> HTML.
  //
  // STACKED — any A/B where A and B are alphanumeric/symbol tokens:
  //   970/83, 40/3, EC/BC, AD/cos∠OAC, 1/3, √3/2, etc.
  //
  // NOT stacked — parenthesised coefficients (prefix or suffix guard):
  //   (1/2)BC, (3/4)x  — excluded by prefix rule (char before num is '(')
  //   x/(y+1)          — excluded because den contains '+'
  //
  function renderMath(rawText) {
    var s = escapeHtml(rawText);

    // Handle (NUM/DEN)UNIT? — strip parens, render stacked fraction + optional unit.
    // e.g. (ab/ac)cm3  →  [stacked frac] cm3
    //      (1/2)BC     →  [stacked frac] BC
    s = s.replace(
      /\(([A-Za-z0-9°²³√∠△]+)\/([A-Za-z0-9°²³√∠△]+(?:[ ][A-Za-z0-9°²³√∠△]+)*)\)([A-Za-z0-9°²³√∠△]*)/g,
      function (match, num, den, unit) {
        var frac = '<span class="frac"><span class="num">' + num + '</span><span class="den">' + den + '</span></span>';
        return unit ? frac + ' ' + unit : frac;
      }
    );

    // Stack any NUM/DEN where neither side contains spaces-except-between-tokens.
    // Prefix guard: must not be preceded by letter, digit, or '('.
    // Suffix guard: must not be followed by letter, digit, or ')'.
    s = s.replace(
      /(^|[^A-Za-z0-9(])([A-Za-z0-9°²³√∠△]+)\/([A-Za-z0-9°²³√∠△]+(?:[ ][A-Za-z0-9°²³√∠△]+)*)(?![A-Za-z0-9)])/g,
      function (match, prefix, num, den) {
        return prefix + '<span class="frac"><span class="num">' + num + '</span><span class="den">' + den + '</span></span>';
      }
    );

    return s;
  }

})();
