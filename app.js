(() => {
  "use strict";

  const catalog = window.CATALOG_DATA;
  if (!catalog || !Array.isArray(catalog.products)) return;

  const PAGE_SIZE = 24;
  const STORAGE_KEY = "shopwave-wholesale-enquiry-list-v1";
  const WHATSAPP_NUMBER = "918249918763";
  const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const $ = (selector) => document.querySelector(selector);
  const products = catalog.products;
  const productById = new Map(products.map((product) => [product.id, product]));
  const categoryCounts = new Map();
  products.forEach((product) => categoryCounts.set(product.category, (categoryCounts.get(product.category) || 0) + 1));
  const categoryNames = [...categoryCounts.keys()];
  const searchIndex = products.map((product) => normalizeSearch(`${product.name} ${product.category} ${product.price} ${money.format(product.price)}`));

  const state = {
    category: "All products",
    query: "",
    sort: "featured",
    page: 1,
    shortlist: readShortlist(),
    toastTimer: 0,
    previousFocus: null,
  };

  const categoryList = $("#category-list");
  const productGrid = $("#product-grid");
  const searchInput = $("#search-input");
  const sortSelect = $("#sort-select");
  const panel = $("#list-panel");
  const scrim = $("#scrim");

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function normalizeSearch(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en-IN")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function readShortlist() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return new Map();
      return new Map(Object.entries(saved)
        .filter(([id, quantity]) => productById.has(id) && Number.isInteger(quantity) && quantity > 0)
        .map(([id, quantity]) => [id, Math.min(quantity, 99)]));
    } catch {
      return new Map();
    }
  }

  function saveShortlist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state.shortlist))); }
    catch { showToast("Your list is available until this page is closed."); }
  }

  function renderCategories() {
    const names = ["All products", ...categoryNames];
    $("#category-count").textContent = `${categoryNames.length} categories`;
    categoryList.innerHTML = names.map((name) => {
      const count = name === "All products" ? products.length : categoryCounts.get(name);
      return `<button class="category-chip" type="button" data-category="${escapeHTML(name)}" aria-pressed="${name === state.category}">
        <span>${escapeHTML(name)}</span><span class="chip-count">${count}</span>
      </button>`;
    }).join("");
  }

  function filteredProducts() {
    const queryParts = normalizeSearch(state.query).split(/\s+/).filter(Boolean);
    let result = products.filter((product, index) => {
      const matchesCategory = state.category === "All products" || product.category === state.category;
      const matchesQuery = !queryParts.length || queryParts.every((part) => searchIndex[index].includes(part));
      return matchesCategory && matchesQuery;
    });
    if (state.sort === "price-asc") result = [...result].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    if (state.sort === "price-desc") result = [...result].sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
    if (state.sort === "name") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }

  function imageMarkup(product, className = "") {
    if (!product.image) return `<span class="image-missing ${className}" role="img" aria-label="Product photo unavailable">Photo unavailable</span>`;
    return `<img class="${className}" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy" decoding="async" width="260" height="260">`;
  }

  function cardMarkup(product) {
    const quantity = state.shortlist.get(product.id) || 0;
    const actionText = quantity ? `Added · ${quantity}` : "Add to list";
    return `<article class="product-card" data-id="${escapeHTML(product.id)}">
      <div class="product-photo">${imageMarkup(product)}</div>
      <div class="product-info">
        <span class="product-category">${escapeHTML(product.category)}</span>
        <h3 class="product-name">${escapeHTML(product.name)}</h3>
        <div class="product-bottom">
          <div class="product-price"><small>CATALOGUE PRICE</small>₹${money.format(product.price)}</div>
          <button class="add-button${quantity ? " is-added" : ""}" type="button" data-action="add" data-id="${escapeHTML(product.id)}" aria-label="Add ${escapeHTML(product.name)} to enquiry list">
            ${quantity ? "✓" : `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>`}${actionText}
          </button>
        </div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const result = filteredProducts();
    const pageCount = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const start = (state.page - 1) * PAGE_SIZE;
    const shown = result.slice(start, start + PAGE_SIZE);
    productGrid.innerHTML = shown.map(cardMarkup).join("");
    const empty = result.length === 0;
    $("#empty-state").hidden = !empty;
    productGrid.hidden = empty;
    $("#pagination").hidden = empty || pageCount <= 1;
    $("#results-count").innerHTML = result.length
      ? `Showing <strong>${(start + 1).toLocaleString("en-IN")}-${(start + shown.length).toLocaleString("en-IN")}</strong> of <strong>${result.length.toLocaleString("en-IN")}</strong> products`
      : "No matching products";
    renderPagination(pageCount);
  }

  function renderPagination(pageCount) {
    if (pageCount <= 1) {
      $("#pagination").innerHTML = "";
      return;
    }

    const currentPage = state.page;
    $("#pagination").innerHTML = `
      <button class="page-button page-step" type="button" data-page="${currentPage - 1}" aria-label="Previous page"${currentPage === 1 ? " disabled" : ""}>
        <span aria-hidden="true">←</span><span>Previous</span>
      </button>
      <span class="page-status" aria-live="polite">Page ${currentPage} of ${pageCount}</span>
      <button class="page-button page-step" type="button" data-page="${currentPage + 1}" aria-label="Next page"${currentPage === pageCount ? " disabled" : ""}>
        <span>Next</span><span aria-hidden="true">→</span>
      </button>`;
  }

  function shortlistUnits() {
    let total = 0;
    state.shortlist.forEach((quantity) => { total += quantity; });
    return total;
  }

  function renderShortlist() {
    const units = shortlistUnits();
    const entries = [...state.shortlist.entries()].filter(([id]) => productById.has(id));
    $("#list-count").textContent = units > 99 ? "99+" : String(units);
    $("#panel-count").textContent = `(${units})`;
    const whatsappLink = $("#send-whatsapp");
    const hasItems = entries.length > 0;
    whatsappLink.setAttribute("aria-disabled", String(!hasItems));
    whatsappLink.classList.toggle("is-disabled", !hasItems);
    whatsappLink.tabIndex = hasItems ? 0 : -1;
    whatsappLink.href = hasItems
      ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(enquiryText())}`
      : "#";
    $("#clear-list").disabled = entries.length === 0;

    if (!entries.length) {
      $("#panel-body").innerHTML = `<div class="panel-empty"><span aria-hidden="true">＋</span><strong>Your list is empty</strong><p>Add products from the catalogue to build an enquiry.</p></div>`;
      return;
    }

    $("#panel-body").innerHTML = entries.map(([id, quantity]) => {
      const product = productById.get(id);
      return `<div class="list-item" data-id="${escapeHTML(id)}">
        ${imageMarkup(product)}
        <div><p class="list-item-name">${escapeHTML(product.name)}</p><span class="list-item-price">₹${money.format(product.price)} each</span></div>
        <div class="qty-control" aria-label="Quantity for ${escapeHTML(product.name)}">
          <button type="button" data-action="decrease" data-id="${escapeHTML(id)}" aria-label="Remove one ${escapeHTML(product.name)}">−</button>
          <span>${quantity}</span>
          <button type="button" data-action="increase" data-id="${escapeHTML(id)}" aria-label="Add one ${escapeHTML(product.name)}">+</button>
        </div>
      </div>`;
    }).join("");
  }

  function updateShortlist(id, delta) {
    const next = (state.shortlist.get(id) || 0) + delta;
    if (next <= 0) state.shortlist.delete(id);
    else state.shortlist.set(id, Math.min(99, next));
    saveShortlist();
    renderShortlist();
    renderProducts();
  }

  function openList() {
    state.previousFocus = document.activeElement;
    scrim.hidden = false;
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("#close-list").focus();
  }

  function closeList() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
    document.body.style.overflow = "";
    if (state.previousFocus && typeof state.previousFocus.focus === "function") state.previousFocus.focus();
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  function enquiryText() {
    const lines = ["Product enquiry - Ecomhub Wholesale", ""];
    let total = 0;
    let lineNumber = 1;
    for (const [id, quantity] of state.shortlist) {
      const product = productById.get(id);
      if (!product) continue;
      const lineTotal = product.price * quantity;
      total += lineTotal;
      lines.push(`${lineNumber}. ${product.name}`);
      lines.push(`   Qty: ${quantity} | Unit price: ₹${money.format(product.price)} | Line total: ₹${money.format(lineTotal)}`);
      lineNumber += 1;
    }
    lines.push("", `Total items: ${shortlistUnits()}`, `Estimated catalogue total: ₹${money.format(total)}`, "Catalogue prices may differ when placing an order.");
    return lines.join("\n");
  }

  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    state.page = 1;
    renderCategories();
    renderProducts();
  });

  productGrid.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="add"]');
    if (!button) return;
    const id = button.dataset.id;
    updateShortlist(id, 1);
    showToast(`${productById.get(id).name} added to your list`);
  });

  $("#panel-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    updateShortlist(button.dataset.id, button.dataset.action === "increase" ? 1 : -1);
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    state.page = 1;
    $("#clear-search").hidden = !state.query;
    renderProducts();
  });
  $("#search-form").addEventListener("submit", (event) => event.preventDefault());
  $("#clear-search").addEventListener("click", () => {
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.focus();
  });
  $("#reset-filters").addEventListener("click", () => {
    state.category = "All products";
    state.query = "";
    state.page = 1;
    searchInput.value = "";
    $("#clear-search").hidden = true;
    renderCategories();
    renderProducts();
  });
  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    state.page = 1;
    renderProducts();
  });
  $("#pagination").addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    state.page = Number(button.dataset.page);
    renderProducts();
    $(".results-toolbar").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#open-list").addEventListener("click", openList);
  $("#close-list").addEventListener("click", closeList);
  scrim.addEventListener("click", closeList);
  $("#send-whatsapp").addEventListener("click", (event) => {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      return;
    }
    showToast("WhatsApp opened with your enquiry. Tap Send to deliver it.");
  });
  $("#clear-list").addEventListener("click", () => {
    state.shortlist.clear();
    saveShortlist();
    renderShortlist();
    renderProducts();
    showToast("Enquiry list cleared");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) closeList();
    if ((event.key === "/" || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)))
      && !event.altKey && !event.target.matches("input, textarea, select, [contenteditable='true']")) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  $("#hero-total").textContent = products.length.toLocaleString("en-IN");
  $("#hero-category-total").textContent = categoryCounts.size;
  renderCategories();
  renderProducts();
  renderShortlist();
})();
