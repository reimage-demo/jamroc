import { catalog } from "./catalog.js?v=20261105-drink-photos";
import { renderEvents, eventsError } from "./events.js?v=20261105-events";
import { createDrinkBuilder } from "./drink-builder.js?v=20261105-external-ordering";
const $ = (s) => document.querySelector(s);
setupMobileNavigation();
function setupMobileNavigation() {
  const header = $(".site-header");
  const toggle = header?.querySelector(".nav-toggle");
  if (!toggle) return;
  const mobile = window.matchMedia("(max-width: 760px)");
  const setOpen = (open) => {
    header.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  header.addEventListener("click", (event) => {
    if (event.target.closest("nav a, .online-order")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header.classList.contains("nav-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });
  header.addEventListener("focusout", (event) => {
    if (!header.contains(event.relatedTarget)) setOpen(false);
  });
  mobile.addEventListener("change", () => {
    const active = document.activeElement;
    setOpen(false);
    if (mobile.matches && header.contains(active) && active !== toggle && !active.closest(".brand")) {
      toggle.focus();
    } else if (!mobile.matches && active === toggle) {
      header.querySelector("nav a").focus();
    }
  });
  header.classList.add("nav-ready");
}
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
const featuredDrinkSlugs = ["watermelon-splash", "rum-punch"];
let data = catalog,
  settings = null,
  client = null,
  kind = new URLSearchParams(location.search).get("kind") === "drink" ? "drink" : "food",
  search = "",
  names = {},
  board = [];
const page = document.body.dataset.page;
const drinkBuilder = createDrinkBuilder();
const refreshScrollReveals = setupScrollReveals();
function setupScrollReveals() {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches || !("IntersectionObserver" in window)) return () => {};
  const revealedItems = new Set();
  const reveal = (element) => {
    element.classList.add("is-revealed");
    if (element.dataset.revealKey) revealedItems.add(element.dataset.revealKey);
    observer.unobserve(element);
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) reveal(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  const selector = [
    ".hero-copy > *", ".hero-art", ".section-heading", ".food-card",
    ".callout-image", ".callout-copy", ".pickup-callout > *",
    ".page-heading > *", ".contact-details", ".contact-art", ".status-title",
  ].map((s) => `main ${s}`).join(", ");
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest(".scroll-reveal");
    if (target) reveal(target);
  });
  motion.addEventListener("change", (event) => {
    if (!event.matches) return;
    document.querySelectorAll(".scroll-reveal").forEach(reveal);
    observer.disconnect();
  });
  return () => {
    // Menu subscriptions and filters replace cards; release the previous nodes.
    observer.disconnect();
    document.querySelectorAll(selector).forEach((element) => {
      if (motion.matches || element.classList.contains("is-revealed")) return;
      // Preserve restored scroll positions and avoid replaying live menu updates.
      if (element.getBoundingClientRect().bottom < 0 ||
          revealedItems.has(element.dataset.revealKey)) {
        reveal(element);
        return;
      }
      const index = Array.prototype.indexOf.call(element.parentElement.children, element);
      element.style.setProperty("--reveal-delay", `${(index % 3) * 0.09}s`);
      element.classList.add("scroll-reveal");
      observer.observe(element);
    });
  };
}
document
  .querySelector(`[data-nav="${page}"]`)
  ?.setAttribute("aria-current", "page");
$("#year").textContent = new Date().getFullYear();
function openDialog(el) {
  el.showModal();
}
document.addEventListener("click", (e) => {
  if (e.target.closest(".dialog-close")) e.target.closest("dialog").close();
  if (e.target.closest(".online-order")) {
    openDialog($("#ordering-dialog"));
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
function imageUrl(value) {
  return /^assets\/images\/menu\/[a-z0-9-]+\.webp$/.test(value || "") ||
    /^https:\/\//.test(value || "")
    ? value
    : "";
}
function displayImage(item) {
  const url = imageUrl(item.imageUrl);
  return url.startsWith("assets/images/menu/")
    ? url + "?v=20261105-restaurant-photos"
    : url;
}
function card(item, featured = false) {
  const image = displayImage(item);
  return `<article class="food-card ${item.kind === "drink" ? "drink-card" : ""}" data-reveal-key="${esc(item.slug)}"><div class="food-photo">${image ? `<img src="${esc(image)}" width="${item.kind === "drink" ? 190 : 600}" height="${item.kind === "drink" ? 246 : 450}" loading="lazy" decoding="async" alt="${esc(item.name)}">` : ""}</div><div class="food-info">${featured ? `<p class="item-category">${esc(data.categories.find((c) => c.slug === item.categorySlug)?.name || "FROM OUR KITCHEN")}</p>` : ""}<h3><button class="item-name" data-item="${esc(item.slug)}" aria-label="Details for ${esc(item.name)}">${esc(item.name)}</button></h3><p>${esc(item.description)}</p>${item.options?.length ? `<label class="card-preparation">Preparation<select aria-label="Preparation for ${esc(item.name)}">${item.options.map((o) => `<option>${esc(o.name)}</option>`).join("")}</select></label>` : ""}<div class="price"><span>${item.isAvailable ? money(item.price) : "Currently unavailable"}</span></div></div></article>`;
}
function renderMenu() {
  if (page === "home") {
    const featured = ["oxtail", "curry-goat", "jerk-chicken"]
      .map((s) => data.items.find((i) => i.slug === s))
      .filter(Boolean);
    $("#featured-items").innerHTML =
      featured.map((i) => card(i, true)).join("") ||
      "<p>Our menu is being updated. Check back soon.</p>";
    refreshScrollReveals();
    return;
  }
  if (page !== "menu") return;
  const cats = data.categories
    .filter((c) => c.kind === kind)
    .sort((a, b) => kind === "drink" ? (a.slug === "cocktails" ? -1 : b.slug === "cocktails" ? 1 : a.sortOrder - b.sortOrder) : a.sortOrder - b.sortOrder);
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
        const builder = kind === "drink" && c.slug === "cocktails" ? drinkBuilder.renderEntry(search) : "";
        const featuredDrinks = kind === "drink"
          ? featuredDrinkSlugs.map((slug) => items.find((item) => item.slug === slug)).filter(Boolean)
          : [];
        const remainingItems = items.filter((item) => !featuredDrinks.includes(item));
        if (search && !items.length && !builder) return "";
        return `<section class="menu-section" id="${esc(c.slug)}"><h2>${esc(c.name)}</h2>${items.length || builder ? `<div class="menu-grid">${featuredDrinks.map((i) => card(i)).join("")}${builder}${remainingItems.map((i) => card(i)).join("")}</div>` : `<p class="empty">${kind === "drink" ? "Our " + esc(c.name.toLowerCase()) + " selection is coming soon." : "This section is being updated."}</p>`}</section>`;
      })
      .join("") || '<p class="empty">No matches. Try a different dish.</p>';
  $("#menu-notice").textContent = "Browse the menu here. Order through DoorDash or Grubhub for current prices and availability.";
  refreshScrollReveals();
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
  d.classList.toggle("drink-detail", item.kind === "drink");
  d.innerHTML = `<button class="dialog-close" aria-label="Close">×</button>${imageUrl(item.imageUrl) ? `<img src="${esc(displayImage(item))}" width="650" height="480" alt="${esc(item.name)}">` : ""}<div class="item-detail"><p class="item-category">${esc(data.categories.find((c) => c.slug === item.categorySlug)?.name)}</p><h2>${esc(item.name)}</h2><p>${esc(item.description)}</p><p><strong>${item.isAvailable ? money(item.price) : "Currently unavailable"}</strong></p>${item.options?.length ? `<label>Preparation<select id="preparation">${item.options.map((o) => `<option>${esc(o.name)}</option>`).join("")}</select></label>` : ""}<p class="muted">Order through DoorDash or Grubhub for current prices and availability.</p>${item.illustrative ? '<p class="muted">AI-enhanced or illustrative image. Actual presentation may vary.</p>' : ""}</div>`;
  d.querySelector("#preparation")?.addEventListener("change", (e) => {
    const o = item.options.find((o) => o.name === e.target.value);
    if (imageUrl(o?.imageUrl)) d.querySelector("img").src = displayImage(o);
  });
  openDialog(d);
}
$("#menu-search")?.addEventListener("input", (e) => {
  search = e.target.value.trim().toLowerCase();
  renderMenu();
});
function renderContact() {
  if (!["home", "contact"].includes(page) || !settings) return;
  // Keep the published visit details when individual admin fields are unset.
  for (const field of ["address", "phone", "hours"]) {
    const value = settings[field]?.trim();
    if (!value) continue;
    document.querySelectorAll(`[data-contact="${field}"]`).forEach((element) => {
      element.textContent = value;
      if (field === "address")
        element.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(value);
      if (field === "phone") element.href = "tel:" + value.replace(/[^+\d]/g, "");
    });
    if (field === "address")
      document.querySelectorAll('[data-contact="directions"]').forEach((link) => {
        link.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(value);
      });
  }
  const extras = $('[data-contact="extras"]');
  if (extras) extras.innerHTML =
    (settings.email ? `<h3>Email</h3><p>${esc(settings.email)}</p>` : "") +
    (settings.instagram && /^https:\/\/(www\.)?instagram\.com\//.test(settings.instagram)
      ? `<a class="text-link" href="${esc(settings.instagram)}" target="_blank" rel="noopener noreferrer">Follow us on Instagram</a>` : "");
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
  if (page === "events") eventsError();
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
    if (page === "events") eventsError();
    if ($("#board-connection"))
      $("#board-connection").textContent = "Online ordering coming soon";
    renderBoard();
    return;
  }
  try {
    for (let i = 0; i < 50 && !window.JamRocConvex; i++)
      await new Promise((r) => setTimeout(r, 100));
    client = new window.JamRocConvex.ConvexClient(url);
    if (page === "menu") client.onUpdate("drinkBuilder:publicConfig", {}, (config) => {
      drinkBuilder.update(config);
      renderMenu();
    }, () => {
      drinkBuilder.connectionError();
      renderMenu();
    });
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
          // Supply the new photos for existing live records that have no image yet.
          data = {
            ...m,
            items: m.items.map((item) => {
              const fallback = item.kind === "drink" && featuredDrinkSlugs.includes(item.slug)
                ? catalog.items.find((entry) => entry.slug === item.slug)
                : null;
              return !item.imageUrl && fallback
                ? { ...item, imageUrl: fallback.imageUrl, illustrative: true }
                : item;
            }),
          };
          renderMenu();
        },
        connectionError,
      );
    }
    if (page === "events") client.onUpdate("events:publicEvents", {}, renderEvents, eventsError);
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
    if (page === "menu") {
      drinkBuilder.connectionError();
      renderMenu();
    }
  }
}
document.querySelectorAll("[data-kind]").forEach(button => {
  const active = button.dataset.kind === kind;
  button.classList.toggle("selected", active);
  button.setAttribute("aria-pressed", active);
});
renderMenu();
refreshScrollReveals();
connect();
if (page === "menu") {
  const item = new URLSearchParams(location.search).get("item");
  if (item) showItem(data.items.find((i) => i.slug === item));
}
