(function () {
  "use strict";

  var escapeHtml = window.HungonCatalog.escapeHtml;
  var UNCATEGORIZED_ID = window.HungonCatalog.UNCATEGORIZED_ID;
  var UNCATEGORIZED_NAME = window.HungonCatalog.UNCATEGORIZED_NAME;

  var state = {
    products: [],
    categories: [],
    categoryFilter: "all",
    searchTerm: ""
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.categoryList = document.getElementById("category-list");
    els.newCategoryName = document.getElementById("new-category-name");
    els.addCategoryBtn = document.getElementById("add-category-btn");

    els.newProductName = document.getElementById("new-product-name");
    els.newProductCategory = document.getElementById("new-product-category");
    els.newProductUnit = document.getElementById("new-product-unit");
    els.newProductPrice = document.getElementById("new-product-price");
    els.addProductBtn = document.getElementById("add-product-btn");

    els.productSearch = document.getElementById("product-search");
    els.productCategoryFilter = document.getElementById("product-category-filter");
    els.productTotal = document.getElementById("product-total");
    els.productTableBody = document.getElementById("product-table-body");
    els.toast = document.getElementById("toast");

    els.addCategoryBtn.addEventListener("click", addCategory);
    els.newCategoryName.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addCategory();
    });

    els.addProductBtn.addEventListener("click", addProduct);

    els.productSearch.addEventListener("input", function (e) {
      state.searchTerm = e.target.value.trim();
      renderProductTable();
    });
    els.productCategoryFilter.addEventListener("change", function (e) {
      state.categoryFilter = e.target.value;
      renderProductTable();
    });

    // While a field inside the table has focus, we freeze re-renders so a
    // remote update (or our own save echoing back) can never wipe out
    // whatever the admin is mid-typing. The moment focus leaves the table,
    // render again with the latest data.
    els.productTableBody.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!isEditingTable()) renderProductTable();
      }, 0);
    });
    els.categoryList.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!isEditingCategoryList()) renderCategoryList();
      }, 0);
    });

    window.HungonCatalog.ensureUncategorized().catch(function () { /* best-effort, offline is fine */ });

    window.HungonCatalog.start({
      onCategories: function (cats) {
        state.categories = cats;
        renderCategorySelects();
        if (!isEditingCategoryList()) renderCategoryList();
        if (!isEditingTable()) renderProductTable();
      },
      onProducts: function (prods) {
        state.products = prods;
        if (!isEditingTable()) renderProductTable();
      }
    });
  }

  function isEditingTable() {
    var el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "SELECT") && els.productTableBody.contains(el);
  }

  function isEditingCategoryList() {
    var el = document.activeElement;
    return !!el && el.tagName === "INPUT" && els.categoryList.contains(el);
  }

  function requireOnline() {
    if (!window.hungonFirebase || window.HungonCatalog.offline) {
      showToast("離線模式，無法儲存變更，請檢查網絡連線");
      return false;
    }
    return true;
  }

  function categoryName(id) {
    var cat = state.categories.find(function (c) { return c.id === id; });
    return cat ? cat.name : UNCATEGORIZED_NAME;
  }

  function productCountFor(categoryId) {
    return state.products.filter(function (p) { return p.category === categoryId; }).length;
  }

  /* ---------- Categories ---------- */

  function renderCategorySelects() {
    [els.newProductCategory, els.productCategoryFilter].forEach(function (sel) {
      var isFilter = sel === els.productCategoryFilter;
      var prevValue = sel.value;
      sel.innerHTML = "";
      if (isFilter) {
        var allOpt = document.createElement("option");
        allOpt.value = "all";
        allOpt.textContent = "全部分類";
        sel.appendChild(allOpt);
      }
      state.categories.forEach(function (cat) {
        var opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.name;
        sel.appendChild(opt);
      });
      if ([...sel.options].some(function (o) { return o.value === prevValue; })) {
        sel.value = prevValue;
      }
    });
  }

  function renderCategoryList() {
    els.categoryList.innerHTML = "";
    if (state.categories.length === 0) {
      var empty = document.createElement("div");
      empty.className = "count";
      empty.textContent = "未有分類，請先新增一個。";
      els.categoryList.appendChild(empty);
      return;
    }

    var frag = document.createDocumentFragment();
    state.categories.forEach(function (cat) {
      var isBuiltIn = cat.id === UNCATEGORIZED_ID;
      var row = document.createElement("div");
      row.className = "category-row";

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = cat.name;
      nameInput.disabled = isBuiltIn;
      nameInput.addEventListener("blur", function () {
        var newName = nameInput.value.trim();
        if (!newName || newName === cat.name) { nameInput.value = cat.name; return; }
        if (!requireOnline()) { nameInput.value = cat.name; return; }
        window.hungonFirebase.upsertCategory(cat.id, { name: newName })
          .then(function () { showToast("分類已更新"); })
          .catch(function (e) { showToast("更新失敗：" + e.message); });
      });
      nameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") nameInput.blur();
      });

      var count = document.createElement("span");
      count.className = "count";
      count.textContent = productCountFor(cat.id) + " 件產品";

      var delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.type = "button";
      delBtn.textContent = "刪除";
      if (isBuiltIn) {
        delBtn.disabled = true;
        delBtn.title = "此為內建分類，不能刪除";
      } else {
        delBtn.addEventListener("click", function () { deleteCategory(cat); });
      }

      row.appendChild(nameInput);
      row.appendChild(count);
      row.appendChild(delBtn);
      frag.appendChild(row);
    });
    els.categoryList.appendChild(frag);
  }

  function addCategory() {
    if (!requireOnline()) return;
    var name = els.newCategoryName.value.trim();
    if (!name) {
      showToast("請輸入分類名稱");
      els.newCategoryName.focus();
      return;
    }
    var id = slugify(name) || ("cat-" + Date.now());
    window.hungonFirebase.upsertCategory(id, { name: name })
      .then(function () {
        els.newCategoryName.value = "";
        showToast("已新增分類「" + name + "」");
      })
      .catch(function (e) { showToast("新增失敗：" + e.message); });
  }

  function deleteCategory(cat) {
    if (!requireOnline()) return;
    var count = productCountFor(cat.id);
    var msg = count > 0
      ? "刪除分類「" + cat.name + "」？此分類內的 " + count + " 件產品將移至「" + UNCATEGORIZED_NAME + "」。"
      : "刪除分類「" + cat.name + "」？";
    if (!confirm(msg)) return;

    var affected = state.products.filter(function (p) { return p.category === cat.id; });
    Promise.all(affected.map(function (p) {
      return window.hungonFirebase.upsertProduct(p.id, {
        name: p.name, unit: p.unit, price: p.price, category: UNCATEGORIZED_ID
      });
    }))
      .then(function () { return window.hungonFirebase.deleteCategory(cat.id); })
      .then(function () { showToast("已刪除分類「" + cat.name + "」"); })
      .catch(function (e) { showToast("刪除失敗：" + e.message); });
  }

  /* ---------- Products ---------- */

  function renderProductTable() {
    var term = state.searchTerm.toLowerCase();
    var list = state.products.filter(function (p) {
      var matchesCategory = state.categoryFilter === "all" || p.category === state.categoryFilter;
      var matchesSearch = !term || p.name.toLowerCase().indexOf(term) !== -1;
      return matchesCategory && matchesSearch;
    });

    els.productTotal.textContent = list.length + " / " + state.products.length + " 件產品";
    els.productTableBody.innerHTML = "";

    if (list.length === 0) {
      var tr = document.createElement("tr");
      tr.className = "empty-row";
      tr.innerHTML = '<td colspan="5">找不到相關產品</td>';
      els.productTableBody.appendChild(tr);
      return;
    }

    var frag = document.createDocumentFragment();
    list.forEach(function (p) {
      frag.appendChild(buildProductRow(p));
    });
    els.productTableBody.appendChild(frag);
  }

  function buildProductRow(p) {
    var row = document.createElement("tr");
    row.dataset.id = p.id;

    var nameCell = document.createElement("td");
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "name-input";
    nameInput.value = p.name;
    nameCell.appendChild(nameInput);

    var catCell = document.createElement("td");
    var catSelect = document.createElement("select");
    state.categories.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      catSelect.appendChild(opt);
    });
    catSelect.value = p.category;
    catCell.appendChild(catSelect);

    var unitCell = document.createElement("td");
    var unitInput = document.createElement("input");
    unitInput.type = "text";
    unitInput.value = p.unit;
    unitCell.appendChild(unitInput);

    var priceCell = document.createElement("td");
    var priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.1";
    priceInput.value = p.price;
    priceCell.appendChild(priceInput);

    var delCell = document.createElement("td");
    delCell.className = "delete-cell";
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "delete-btn";
    delBtn.textContent = "刪除";
    delBtn.addEventListener("click", function () { deleteProduct(p); });
    delCell.appendChild(delBtn);

    function save() {
      var newName = nameInput.value.trim();
      var newUnit = unitInput.value.trim();
      var newPrice = parseFloat(priceInput.value);
      if (!newName) { nameInput.value = p.name; return; }
      if (!newUnit) { unitInput.value = p.unit; return; }
      if (isNaN(newPrice) || newPrice < 0) { priceInput.value = p.price; return; }

      var changed = newName !== p.name || newUnit !== p.unit ||
        newPrice !== p.price || catSelect.value !== p.category;
      if (!changed) return;
      if (!requireOnline()) return;

      window.hungonFirebase.upsertProduct(p.id, {
        name: newName, unit: newUnit, price: newPrice, category: catSelect.value
      })
        .then(function () { showToast(newName + " 已更新"); })
        .catch(function (e) { showToast("更新失敗：" + e.message); });
    }

    [nameInput, unitInput, priceInput].forEach(function (input) {
      input.addEventListener("blur", save);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") input.blur();
      });
    });
    catSelect.addEventListener("change", save);

    row.appendChild(nameCell);
    row.appendChild(catCell);
    row.appendChild(unitCell);
    row.appendChild(priceCell);
    row.appendChild(delCell);
    return row;
  }

  function addProduct() {
    if (!requireOnline()) return;
    var name = els.newProductName.value.trim();
    var category = els.newProductCategory.value;
    var unit = els.newProductUnit.value.trim();
    var price = parseFloat(els.newProductPrice.value);

    if (!name) { showToast("請輸入產品名稱"); els.newProductName.focus(); return; }
    if (!category) { showToast("請先新增分類"); return; }
    if (!unit) { showToast("請輸入單位"); els.newProductUnit.focus(); return; }
    if (isNaN(price) || price < 0) { showToast("請輸入正確價錢"); els.newProductPrice.focus(); return; }

    var id = slugify(name) + "-" + Date.now().toString(36);
    window.hungonFirebase.upsertProduct(id, { name: name, unit: unit, price: price, category: category })
      .then(function () {
        els.newProductName.value = "";
        els.newProductUnit.value = "";
        els.newProductPrice.value = "";
        els.newProductName.focus();
        showToast("已新增產品「" + name + "」");
      })
      .catch(function (e) { showToast("新增失敗：" + e.message); });
  }

  function deleteProduct(p) {
    if (!confirm("刪除產品「" + p.name + "」？")) return;
    if (!requireOnline()) return;
    window.hungonFirebase.deleteProduct(p.id)
      .then(function () { showToast("已刪除「" + p.name + "」"); })
      .catch(function (e) { showToast("刪除失敗：" + e.message); });
  }

  /* ---------- Utils ---------- */

  function slugify(str) {
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1800);
  }
})();
