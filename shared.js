import { catalog } from "./catalog.js";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  n === undefined
    ? "Price coming soon"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n / 100);
let data = catalog,
  settings = null,
  client = null,
  kind = "food",
  search = "",
  names = {},
  board = [];
let picks = [];
try {
  const parsed = JSON.parse(localStorage.getItem("jamroc-picks") || "[]");
  if (Array.isArray(parsed))
    picks = parsed
      .filter(
        (x) =>
          typeof x.slug === "string" &&
          Number.isInteger(x.quantity) &&
          x.quantity > 0,
      )
      .slice(0, 40);
} catch {}
const page = document.body.dataset.page;
document
  .querySelector(`[data-nav="${page}"]`)
  ?.setAttribute("aria-current", "page");
$("#year").textContent = new Date().getFullYear();
function openDialog(el) {
  el.showModal();
}
document.addEventListener("click", (e) => {
  if (e.target.closest(".dialog-close")) e.target.closest("dialog").close();
  if (e.target.closest(".toast-order")) {
    if (settings?.orderingEnabled && validToast(settings.toastOrderingUrl))
      window.location.assign(settings.toastOrderingUrl);
    else openDialog($("#ordering-dialog"));
  }
});
for (const d of document.querySelectorAll("dialog"))
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
function validToast(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.hostname === "toasttab.com" || u.hostname.endsWith(".toasttab.com"))
    );
  } catch {
    return false;
  }
}
function imageUrl(value) {
  return /^assets\/images\/menu\/[a-z0-9-]+\.webp$/.test(value || "") ||
    /^https:\/\//.test(value || "")
    ? value
    : "";
}
function card(item, featured = false) {
  const image = imageUrl(item.imageUrl);
  return `<button class="food-card" data-item="${esc(item.slug)}" aria-label="View ${esc(item.name)}"><div class="food-photo">${image ? `<img src="${esc(image)}" width="600" height="450" loading="lazy" decoding="async" alt="${esc(item.name)}">` : ""}</div><div class="food-info">${featured ? `<p class="eyebrow">${esc(data.categories.find((c) => c.slug === item.categorySlug)?.name || "FROM OUR KITCHEN")}</p>` : ""}<h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><div class="price"><span>${item.isAvailable ? money(item.price) : "Currently unavailable"}</span><span class="round-arrow" aria-hidden="true">↗</span></div></div></button>`;
}
function renderMenu() {
  if (page === "home") {
    const featured = ["oxtail", "curry-goat", "jerk-chicken"]
      .map((s) => data.items.find((i) => i.slug === s))
      .filter(Boolean);
    $("#featured-items").innerHTML =
      featured.map((i) => card(i, true)).join("") ||
      "<p>Our menu is being updated. Check back soon.</p>";
    return;
  }
  if (page !== "menu") return;
  const cats = data.categories
    .filter((c) => c.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  $("#category-nav").innerHTML = cats
    .map((c) => `<a href="#${esc(c.slug)}">${esc(c.name)}</a>`)
    .join("");
  $("#menu-sections").innerHTML =
    cats
      .map((c) => {
        const items = data.items
          .filter(
            (i) =>
              i.kind === kind &&
              i.categorySlug === c.slug &&
              (!search ||
                (i.name + " " + i.description).toLowerCase().includes(search)),
          )
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (search && !items.length) return "";
        return `<section class="menu-section" id="${esc(c.slug)}"><h2>${esc(c.name)}</h2>${items.length ? `<div class="menu-grid">${items.map((i) => card(i)).join("")}</div>` : `<p class="empty">${kind === "drink" ? "Our " + esc(c.name.toLowerCase()) + " selection is coming soon." : "This section is being updated."}</p>`}</section>`;
      })
      .join("") || '<p class="empty">No matches. Try a different dish.</p>';
  $("#menu-notice").textContent = data.preview
    ? "Menu preview · Prices and online ordering coming soon."
    : client
      ? settings?.orderingEnabled
        ? "Browse here. Place and pay for your order on Toast."
        : "Online ordering is coming soon. Browse our current menu below."
      : "Menu preview · Prices and online ordering coming soon.";
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-item]");
  if (b) {
    const item = data.items.find((i) => i.slug === b.dataset.item);
    if (page === "home") {
      location.href = "menu.html?item=" + encodeURIComponent(item.slug);
      return;
    }
    showItem(item);
  }
  const k = e.target.closest("[data-kind]");
  if (k) {
    kind = k.dataset.kind;
    document.querySelectorAll("[data-kind]").forEach((b) => {
      const active = b === k;
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", active);
    });
    renderMenu();
  }
});
function showItem(item) {
  if (!item) return;
  const d = $("#item-dialog");
  d.innerHTML = `<button class="dialog-close" aria-label="Close">×</button>${imageUrl(item.imageUrl) ? `<img src="${esc(item.imageUrl)}" width="650" height="480" alt="${esc(item.name)}">` : ""}<div class="item-detail"><p class="eyebrow">${esc(data.categories.find((c) => c.slug === item.categorySlug)?.name)}</p><h2>${esc(item.name)}</h2><p>${esc(item.description)}</p><p><strong>${money(item.price)}</strong></p>${item.options?.length ? `<label>Preparation<select id="preparation">${item.options.map((o) => `<option>${esc(o.name)}</option>`).join("")}</select></label>` : ""}<button class="button" id="add-pick" ${!item.isAvailable ? "disabled" : ""}>${item.isAvailable ? "Add to your picks" : "Currently unavailable"}</button><p class="muted">Save your favorites while you browse. Checkout takes place on Toast.</p>${item.illustrative ? '<p class="muted">Illustrative food photograph.</p>' : ""}</div>`;
  d.querySelector("#preparation")?.addEventListener("change", (e) => {
    const o = item.options.find((o) => o.name === e.target.value);
    if (imageUrl(o?.imageUrl)) d.querySelector("img").src = o.imageUrl;
  });
  d.querySelector("#add-pick").onclick = () => {
    const option = d.querySelector("select")?.value || "";
    const old = picks.find((p) => p.slug === item.slug && p.option === option);
    if (old) old.quantity = Math.min(20, old.quantity + 1);
    else if (picks.length < 40)
      picks.push({ slug: item.slug, name: item.name, quantity: 1, option });
    savePicks();
    d.close();
  };
  openDialog(d);
}
function savePicks() {
  try {
    localStorage.setItem("jamroc-picks", JSON.stringify(picks));
  } catch {}
  if ($("#tray-count"))
    $("#tray-count").textContent = picks.reduce((s, p) => s + p.quantity, 0);
}
function renderTray() {
  $("#tray-items").innerHTML = picks.length
    ? picks
        .map(
          (p, i) =>
            `<div class="tray-row"><div><strong>${esc(p.name)}</strong>${p.option ? `<br><small>${esc(p.option)}</small>` : ""}<br><small>Quantity: ${p.quantity}</small></div><button data-remove="${i}" aria-label="Remove ${esc(p.name)}">Remove</button></div>`,
        )
        .join("")
    : "<p>Your picks are empty. Add something from the menu.</p>";
}
$("#open-tray")?.addEventListener("click", () => {
  renderTray();
  openDialog($("#tray-dialog"));
});
$("#tray-items")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (b) {
    picks.splice(Number(b.dataset.remove), 1);
    savePicks();
    renderTray();
  }
});
$("#menu-search")?.addEventListener("input", (e) => {
  search = e.target.value.trim().toLowerCase();
  renderMenu();
});
function renderContact() {
  if (page !== "contact" || !settings) return;
  const fields = [
    ["Find us", settings.address],
    ["Opening hours", settings.hours],
    ["Call us", settings.phone],
    ["Email", settings.email],
  ].filter(([, v]) => v);
  if (!fields.length) return;
  $("#contact-details").innerHTML =
    "<h2>Make yourself at home.</h2>" +
    fields
      .map(([label, value]) => `<h3>${label}</h3><p>${esc(value)}</p>`)
      .join("") +
    (settings.instagram
      ? `<a class="text-link" href="${esc(settings.instagram)}" target="_blank" rel="noopener noreferrer">Follow us on Instagram ↗</a>`
      : "");
}
function renderBoard() {
  if (page !== "status") return;
  for (const status of ["preparing", "ready"]) {
    const rows = board.filter((o) => o.status === status);
    $("#" + status + "-count").textContent = rows.length;
    $("#" + status + "-orders").innerHTML =
      rows
        .map(
          (o) =>
            `<article class="board-order"><h3>${esc(names[o._id] || "Guest")}</h3><span>#${esc(o.orderNumber)}</span></article>`,
        )
        .join("") ||
      `<p class="empty">${client ? "No orders " + (status === "ready" ? "ready for pickup" : "being prepared") + " right now." : "The pickup board will be available when online ordering opens."}</p>`;
  }
}
function connectionError() {
  if ($("#board-connection"))
    $("#board-connection").textContent =
      "Connection interrupted · updates may be delayed";
  if ($("#menu-notice"))
    $("#menu-notice").textContent =
      "Live menu unavailable. Please check back shortly.";
}
async function connect() {
  const url = window.JAMROC_CONFIG?.convexUrl;
  if (!url) {
    if ($("#board-connection"))
      $("#board-connection").textContent = "Online ordering coming soon";
    renderBoard();
    return;
  }
  try {
    for (let i = 0; i < 50 && !window.JamRocConvex; i++)
      await new Promise((r) => setTimeout(r, 100));
    client = new window.JamRocConvex.ConvexClient(url);
    client.onUpdate(
      "settings:publicSettings",
      {},
      (s) => {
        settings = s;
        renderContact();
        renderMenu();
      },
      connectionError,
    );
    if (page === "menu" || page === "home") {
      client.onUpdate(
        "menu:publicMenu",
        {},
        (m) => {
          data = m;
          renderMenu();
        },
        connectionError,
      );
    }
    if (page === "status") {
      let nameTimer;
      let namesInFlight = false;
      function refreshMissingNames() {
        clearTimeout(nameTimer);
        if (!board.some((o) => !names[o._id])) return;
        nameTimer = setTimeout(async () => {
          if (namesInFlight) return;
          namesInFlight = true;
          let successful = false;
          try {
            const result = await client.action("customerData:boardNames", {});
            for (const entry of result) names[entry.id] = entry.firstName;
            successful = true;
            renderBoard();
          } catch {
            connectionError();
          } finally {
            namesInFlight = false;
            if (successful) refreshMissingNames();
          }
        }, 250);
      }
      client.onUpdate(
        "orders:board",
        {},
        (rows) => {
          board = rows;
          renderBoard();
          $("#board-connection").textContent = "Live pickup updates";
          refreshMissingNames();
        },
        connectionError,
      );
    }

    window.addEventListener("offline", connectionError);
    window.addEventListener("online", () => {
      if ($("#board-connection"))
        $("#board-connection").textContent = "Reconnecting…";
    });
  } catch {
    client = null;
    connectionError();
  }
}
renderMenu();
savePicks();
connect();
if (page === "menu") {
  const item = new URLSearchParams(location.search).get("item");
  if (item) showItem(data.items.find((i) => i.slug === item));
}
