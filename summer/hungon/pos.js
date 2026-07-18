(function () {
  "use strict";

  var PRODUCTS = window.HUNGON_PRODUCTS || [];
  var CATEGORIES = window.HUNGON_CATEGORIES || [];
  var STORAGE_KEY = "hungon-pos-cart-v1";

  var state = {
    activeCategory: "all",
    searchTerm: "",
    cart: loadCart() // { productId: { id, name, unit, price, qty } }
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.categoryTabs = document.getElementById("category-tabs");
    els.productGrid = document.getElementById("product-grid");
    els.searchInput = document.getElementById("search-input");
    els.cartItems = document.getElementById("cart-items");
    els.cartCount = document.getElementById("cart-count");
    els.cartCountBadge = document.getElementById("cart-count-badge");
    els.cartSubtotal = document.getElementById("cart-subtotal");
    els.cartTotal = document.getElementById("cart-total");
    els.clearBtn = document.getElementById("clear-cart-btn");
    els.checkoutBtn = document.getElementById("checkout-btn");
    els.printBtn = document.getElementById("print-btn");
    els.cartPanel = document.getElementById("cart-panel");
    els.cartOverlay = document.getElementById("cart-overlay");
    els.cartToggleBtn = document.getElementById("cart-toggle-btn");
    els.cartCloseBtn = document.getElementById("cart-panel-close");
    els.toast = document.getElementById("toast");
    els.customName = document.getElementById("custom-name");
    els.customPrice = document.getElementById("custom-price");
    els.customAddBtn = document.getElementById("custom-add-btn");
    els.receiptBody = document.getElementById("receipt-body");
    els.receiptMeta = document.getElementById("receipt-meta");

    renderCategoryTabs();
    renderProducts();
    renderCart();

    els.searchInput.addEventListener("input", function (e) {
      state.searchTerm = e.target.value.trim();
      renderProducts();
    });

    els.clearBtn.addEventListener("click", function () {
      if (Object.keys(state.cart).length === 0) return;
      if (confirm("確定要清空購物車嗎？")) {
        state.cart = {};
        saveCart();
        renderCart();
      }
    });

    els.checkoutBtn.addEventListener("click", function () {
      if (Object.keys(state.cart).length === 0) {
        showToast("購物車是空的");
        return;
      }
      if (confirm("確認結帳並清空購物車？")) {
        state.cart = {};
        saveCart();
        renderCart();
        showToast("已完成結帳");
      }
    });

    els.printBtn.addEventListener("click", function () {
      if (Object.keys(state.cart).length === 0) {
        showToast("購物車是空的");
        return;
      }
      renderReceipt();
      window.print();
    });

    els.customAddBtn.addEventListener("click", addCustomItem);
    els.customPrice.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addCustomItem();
    });

    els.cartToggleBtn.addEventListener("click", openCart);
    els.cartCloseBtn.addEventListener("click", closeCart);
    els.cartOverlay.addEventListener("click", closeCart);
  }

  function renderCategoryTabs() {
    var frag = document.createDocumentFragment();

    var allBtn = document.createElement("button");
    allBtn.textContent = "全部";
    allBtn.className = "active";
    allBtn.dataset.category = "all";
    allBtn.addEventListener("click", function () { selectCategory("all", allBtn); });
    frag.appendChild(allBtn);

    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.textContent = cat.name;
      btn.dataset.category = cat.id;
      btn.addEventListener("click", function () { selectCategory(cat.id, btn); });
      frag.appendChild(btn);
    });

    els.categoryTabs.appendChild(frag);
  }

  function selectCategory(catId, btnEl) {
    state.activeCategory = catId;
    Array.prototype.forEach.call(els.categoryTabs.children, function (b) {
      b.classList.toggle("active", b === btnEl);
    });
    renderProducts();
  }

  function renderProducts() {
    var term = state.searchTerm.toLowerCase();
    var list = PRODUCTS.filter(function (p) {
      var matchesCategory = state.activeCategory === "all" || p.category === state.activeCategory;
      var matchesSearch = !term || p.name.toLowerCase().indexOf(term) !== -1;
      return matchesCategory && matchesSearch;
    });

    els.productGrid.innerHTML = "";

    if (list.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "找不到相關產品";
      els.productGrid.appendChild(empty);
      return;
    }

    var frag = document.createDocumentFragment();
    list.forEach(function (p) {
      var card = document.createElement("button");
      card.className = "product-card";
      card.type = "button";
      card.innerHTML =
        '<div class="name">' + escapeHtml(p.name) + '</div>' +
        '<div class="meta"><span>' + escapeHtml(p.unit) + '</span><span class="price">$' + p.price + '</span></div>';
      card.addEventListener("click", function () { addToCart(p); });
      frag.appendChild(card);
    });
    els.productGrid.appendChild(frag);
  }

  function addToCart(product) {
    var existing = state.cart[product.id];
    if (existing) {
      existing.qty += 1;
    } else {
      state.cart[product.id] = {
        id: product.id,
        name: product.name,
        unit: product.unit,
        price: product.price,
        qty: 1
      };
    }
    saveCart();
    renderCart();
    showToast(product.name + " 已加入");
  }

  function addCustomItem() {
    var name = els.customName.value.trim();
    var price = parseFloat(els.customPrice.value);
    if (!name) {
      showToast("請輸入項目名稱");
      els.customName.focus();
      return;
    }
    if (isNaN(price) || price < 0) {
      showToast("請輸入正確價錢");
      els.customPrice.focus();
      return;
    }
    var id = "custom-" + Date.now();
    state.cart[id] = { id: id, name: name, unit: "項", price: price, qty: 1 };
    saveCart();
    renderCart();
    els.customName.value = "";
    els.customPrice.value = "";
    els.customName.focus();
    showToast(name + " 已加入");
  }

  function changeQty(id, delta) {
    var line = state.cart[id];
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) delete state.cart[id];
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    delete state.cart[id];
    saveCart();
    renderCart();
  }

  function renderCart() {
    var lines = Object.values(state.cart);
    els.cartItems.innerHTML = "";

    if (lines.length === 0) {
      var empty = document.createElement("div");
      empty.className = "cart-empty";
      empty.textContent = "購物車是空的，點選左方產品加入";
      els.cartItems.appendChild(empty);
    } else {
      var frag = document.createDocumentFragment();
      lines.forEach(function (line) {
        var el = document.createElement("div");
        el.className = "cart-line";
        el.innerHTML =
          '<div class="name">' + escapeHtml(line.name) + '</div>' +
          '<div class="line-total">$' + (line.price * line.qty).toFixed(0) + '</div>' +
          '<div class="qty-controls">' +
            '<button data-action="dec" aria-label="減少">−</button>' +
            '<span class="qty-value">' + line.qty + '</span>' +
            '<button data-action="inc" aria-label="增加">+</button>' +
            '<button class="remove-btn" data-action="remove">刪除</button>' +
          '</div>' +
          '<div class="unit-price">$' + line.price + ' / ' + escapeHtml(line.unit) + '</div>';

        el.querySelector('[data-action="inc"]').addEventListener("click", function () { changeQty(line.id, 1); });
        el.querySelector('[data-action="dec"]').addEventListener("click", function () { changeQty(line.id, -1); });
        el.querySelector('[data-action="remove"]').addEventListener("click", function () { removeItem(line.id); });

        frag.appendChild(el);
      });
      els.cartItems.appendChild(frag);
    }

    var totalQty = lines.reduce(function (sum, l) { return sum + l.qty; }, 0);
    var subtotal = lines.reduce(function (sum, l) { return sum + l.price * l.qty; }, 0);

    els.cartCount.textContent = totalQty;
    els.cartCountBadge.textContent = totalQty;
    els.cartSubtotal.textContent = "$" + subtotal.toFixed(0);
    els.cartTotal.textContent = "$" + subtotal.toFixed(0);
  }

  function renderReceipt() {
    var lines = Object.values(state.cart);
    var subtotal = lines.reduce(function (sum, l) { return sum + l.price * l.qty; }, 0);

    els.receiptMeta.textContent = new Date().toLocaleString("zh-HK", { hour12: false });

    var rows = lines.map(function (l) {
      return '<tr>' +
        '<td>' + escapeHtml(l.name) + '</td>' +
        '<td class="num">' + l.qty + '</td>' +
        '<td class="num">$' + l.price + '</td>' +
        '<td class="num">$' + (l.price * l.qty).toFixed(0) + '</td>' +
        '</tr>';
    }).join("");

    els.receiptBody.innerHTML =
      '<table>' +
        '<thead><tr><th>品項</th><th class="num">數量</th><th class="num">單價</th><th class="num">小計</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr class="total-row"><td colspan="3">總計</td><td class="num">$' + subtotal.toFixed(0) + '</td></tr></tfoot>' +
      '</table>';
  }

  function openCart() {
    els.cartPanel.classList.add("open");
    els.cartOverlay.classList.add("open");
  }

  function closeCart() {
    els.cartPanel.classList.remove("open");
    els.cartOverlay.classList.remove("open");
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1600);
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
    } catch (e) { /* storage unavailable */ }
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
