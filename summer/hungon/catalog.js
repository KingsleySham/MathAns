// Shared catalogue bootstrap for pos.js and admin.js — waits for the
// Firestore bridge, seeds it once from the starter data if empty, then
// hands both live collections to the caller and keeps them updated.
(function () {
  "use strict";

  var UNCATEGORIZED_ID = "uncategorized";
  var UNCATEGORIZED_NAME = "未分類";

  function onFirebaseReady(cb) {
    if (window.hungonFirebase && window.hungonFirebase.isReady()) {
      cb();
    } else {
      window.addEventListener("hungon-firebase-ready", cb, { once: true });
    }
  }

  function sortCategories(categories) {
    var real = categories.filter(function (c) { return c.id !== UNCATEGORIZED_ID; });
    real.sort(function (a, b) { return a.name.localeCompare(b.name, "zh-Hant"); });
    var uncategorized = categories.find(function (c) { return c.id === UNCATEGORIZED_ID; });
    return uncategorized ? real.concat([uncategorized]) : real;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // start({ onProducts, onCategories }) — begins the seed + subscribe flow.
  // Callbacks fire every time the underlying Firestore collection changes.
  //
  // Falls back to the read-only built-in catalogue (window.HungonCatalog.offline
  // becomes true) if the Firestore module never loads at all — e.g. gstatic.com
  // blocked on the shop's network — or connects but never delivers a first
  // snapshot within a few seconds. Without this, a blocked/offline network
  // would leave the POS staring at a permanently empty product grid.
  function start(handlers) {
    var seedCategories = window.HUNGON_CATEGORIES || [];
    var seedProducts = window.HUNGON_PRODUCTS || [];
    var gotLiveData = false;

    var fallbackTimer = setTimeout(function () {
      if (gotLiveData) return;
      window.HungonCatalog.offline = true;
      handlers.onCategories(sortCategories(seedCategories.map(function (c) {
        return { id: c.id, name: c.name };
      })));
      handlers.onProducts(seedProducts.map(function (p) {
        return { id: p.id, name: p.name, unit: p.unit, price: p.price, category: p.category };
      }));
    }, 4000);

    onFirebaseReady(function () {
      var fb = window.hungonFirebase;
      if (!fb || !fb.isReady()) return; // stay on the fallback timer/seed data

      fb.seedIfEmpty(seedCategories, seedProducts).finally(function () {
        fb.subscribeCategories(function (cats) {
          gotLiveData = true;
          clearTimeout(fallbackTimer);
          window.HungonCatalog.offline = false;
          handlers.onCategories(sortCategories(cats));
        });
        fb.subscribeProducts(function (prods) {
          gotLiveData = true;
          clearTimeout(fallbackTimer);
          window.HungonCatalog.offline = false;
          handlers.onProducts(prods);
        });
      });
    });
  }

  // Only the admin page needs to guarantee the 未分類 bucket actually
  // exists as a document (so category deletion always has somewhere valid
  // to reassign orphaned products to). The POS page never calls this —
  // it just renders whatever categories are present.
  function ensureUncategorized() {
    var fb = window.hungonFirebase;
    if (!fb) return Promise.resolve();
    return fb.upsertCategory(UNCATEGORIZED_ID, { name: UNCATEGORIZED_NAME });
  }

  window.HungonCatalog = {
    UNCATEGORIZED_ID: UNCATEGORIZED_ID,
    UNCATEGORIZED_NAME: UNCATEGORIZED_NAME,
    offline: false,
    start: start,
    escapeHtml: escapeHtml,
    ensureUncategorized: ensureUncategorized
  };
})();
