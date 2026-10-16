/* BayBuzz – front-end logic. No build step. Leaflet (map view) is loaded on demand from a CDN. */

// ====== SETTINGS YOU CAN EDIT ==============================================
// Paste the link to your Google Form here (the "Send" > link URL from Google Forms).
const ADD_EVENT_FORM_URL = "mailto:Ksodhihuntington@gmail.com?subject=Add%20my%20event%20to%20BayBuzz&body=Event%20name%3A%0ADate%20and%20time%3A%0APlace%20and%20city%3A%0APrice%20%28or%20Free%29%3A%0ALink%20for%20more%20info%3A%0AShort%20description%3A%0A";
// Time zone used for all dates on the site.
const TIME_ZONE = "America/Los_Angeles";
// How many event cards to show at once before "Load more".
const PAGE_SIZE = 36;
// Cloudflare Web Analytics (free, cookie-free, privacy-friendly).
// To turn it on: Cloudflare dashboard → Analytics & Logs → Web Analytics → Add a site (thebaybuzz.com)
// → copy the token from the snippet it shows (the value of "token" in data-cf-beacon) and paste it below.
// While this is empty, NO analytics script is loaded at all.
const CF_ANALYTICS_TOKEN = "";
// ===========================================================================

const CATEGORY_EMOJI = {
  "Music": "🎸", "Sports": "🏟️", "Arts & Theatre": "🎭", "Family": "🎈",
  "Comedy": "🤣", "Food & Drink": "🌮", "Community": "🤝", "Film": "🎬",
  "Festivals": "🎉", "Outdoors": "🌲", "Other": "✨"
};
// CSS class suffix per category (colors live in style.css)
const CATEGORY_KEY = {
  "Music": "music", "Sports": "sports", "Arts & Theatre": "arts", "Family": "family",
  "Comedy": "comedy", "Food & Drink": "food", "Community": "community", "Film": "film",
  "Festivals": "fest", "Outdoors": "outdoors", "Other": "other"
};
const catKey = (c) => CATEGORY_KEY[c] || "other";

// ---------- kid-friendly guess ----------
// An event counts as kid-friendly if its category is "Family" or its title/description mentions kid words,
// unless it is clearly adults-only.
const KID_RE = /\b(kids?|kiddos?|children'?s?|child|famil(y|ies)|story ?times?|toddlers?|bab(y|ies)|infants?|preschool(ers)?|pre-k|kindergarten|teens?|tweens?|youth|puppets?|puppetry|disney|circus|lego|legos|sesame street|paw patrol|bluey|cocomelon|peppa|elmo|pok[eé]mon|minecraft|magic show|nursery|lullaby|homeschool(ers)?|grades? k|ages? \d{1,2} ?(-|–|to) ?1[0-8]|ages? [0-9] ?(\+|and up)|jr\.? rangers?|(girl|boy|cub) scouts?|petting zoo|face painting|bounce house|trick[- ]or[- ]treat|pumpkin patch|meet santa|easter egg)(?!\w)/i;
const KID_TITLE_RE = /\b(for kids|kids'?|children'?s|famil(y|ies)|disney|bluey|sesame street|paw patrol|cocomelon|peppa|story ?time|toddlers?|puppets?|circus|lullab(y|ies)|baby shark|kidz bop)\b/i;
const ALL_AGES_RE = /\ball[- ]ages\b/i;
const ADULT_RE = /\b(21 ?\+|18 ?\+|18 ?& ?up|ages? 1[3-9] ?\+|no children|21 and (over|up)|18 and (over|up)|adults? only|ages? 18|ages? 21|for adults|burlesque|wine tasting|beer|cocktails?|happy hour|bar crawl)(?!\w)/i;
// phrases that contain kid words but aren't about kids
const NOT_KID_RE = /\b(all ages or 18|family (history|tree|caregivers?|law|search center|research)|genealog\w*|baby boomers?|child ?care providers?|parents? of teens|adult children)\b/gi;
function isKidFriendly(e) {
  if (e.category === "Family") return true;
  const text = `${e.title || ""} ${e.description || ""}`.replace(NOT_KID_RE, " ");
  if (ADULT_RE.test(e.title || "")) return false;
  if (ADULT_RE.test(text) && !/\b(kids?|children|family)\b/i.test(e.title || "")) return false;
  // Concert/comedy listings often say "children under 2 need a ticket" or have band names like
  // "Baby" or "Kid", so for those we only trust clearly kid-focused words in the title.
  if (["Music", "Comedy"].includes(e.category)) return KID_TITLE_RE.test(e.title || "");
  if (KID_RE.test(text)) return true;
  // "All ages" (non-concert events only, handled above)
  return ALL_AGES_RE.test(text);
}

// ---------- Bay Area city centers (approximate) for the map ----------
const CITY_COORDS = {
  "San Francisco": [37.7749, -122.4194], "Oakland": [37.8044, -122.2712], "Berkeley": [37.8716, -122.2727],
  "San Jose": [37.3382, -121.8863], "Palo Alto": [37.4419, -122.1430], "Fremont": [37.5485, -121.9886],
  "San Mateo": [37.5630, -122.3255], "San Ramon": [37.7799, -121.9780], "Danville": [37.8216, -121.9999],
  "Dublin": [37.7022, -121.9358], "Pleasanton": [37.6624, -121.8747], "Livermore": [37.6819, -121.7680],
  "Walnut Creek": [37.9101, -122.0652], "Alamo": [37.8502, -122.0322], "Lafayette": [37.8858, -122.1180],
  "Orinda": [37.8771, -122.1797], "Moraga": [37.8349, -122.1297], "Pleasant Hill": [37.9480, -122.0608],
  "Concord": [37.9780, -122.0311], "Clayton": [37.9410, -121.9358], "Martinez": [38.0194, -122.1341],
  "Pittsburg": [38.0280, -121.8847], "Bay Point": [38.0291, -121.9616], "Antioch": [38.0049, -121.8058],
  "Oakley": [37.9974, -121.7125], "Brentwood": [37.9319, -121.6958], "Discovery Bay": [37.9085, -121.6002],
  "Hercules": [38.0172, -122.2886], "Pinole": [38.0044, -122.2989], "Crockett": [38.0524, -122.2130],
  "El Sobrante": [37.9771, -122.2952], "San Pablo": [37.9621, -122.3455], "Richmond": [37.9358, -122.3477],
  "El Cerrito": [37.9161, -122.3108], "Kensington": [37.9105, -122.2800], "Albany": [37.8869, -122.2978],
  "Emeryville": [37.8313, -122.2852], "Piedmont": [37.8244, -122.2316], "Alameda": [37.7652, -122.2416],
  "San Leandro": [37.7249, -122.1561], "San Lorenzo": [37.6810, -122.1244], "Castro Valley": [37.6941, -122.0864],
  "Hayward": [37.6688, -122.0808], "Union City": [37.5934, -122.0438], "Newark": [37.5297, -122.0402],
  "Sunol": [37.5944, -121.8883], "Milpitas": [37.4323, -121.8996], "Santa Clara": [37.3541, -121.9552],
  "Sunnyvale": [37.3688, -122.0363], "Mountain View": [37.3861, -122.0839], "Los Altos": [37.3852, -122.1141],
  "Los Altos Hills": [37.3797, -122.1375], "Cupertino": [37.3230, -122.0322], "Campbell": [37.2872, -121.9500],
  "Saratoga": [37.2638, -122.0230], "Los Gatos": [37.2358, -121.9624], "Monte Sereno": [37.2363, -121.9925],
  "Morgan Hill": [37.1305, -121.6544], "Gilroy": [37.0058, -121.5683], "Stanford": [37.4275, -122.1697],
  "East Palo Alto": [37.4688, -122.1411], "Menlo Park": [37.4530, -122.1817], "Atherton": [37.4613, -122.1977],
  "Portola Valley": [37.3841, -122.2352], "Woodside": [37.4299, -122.2539], "Redwood City": [37.4852, -122.2364],
  "San Carlos": [37.5072, -122.2605], "Belmont": [37.5202, -122.2758], "Foster City": [37.5585, -122.2711],
  "Hillsborough": [37.5741, -122.3794], "Burlingame": [37.5841, -122.3661], "Millbrae": [37.5985, -122.3872],
  "San Bruno": [37.6305, -122.4111], "South San Francisco": [37.6547, -122.4077], "Brisbane": [37.6808, -122.3999],
  "Daly City": [37.6879, -122.4702], "Colma": [37.6769, -122.4597], "Pacifica": [37.6138, -122.4869],
  "Half Moon Bay": [37.4636, -122.4286], "Sausalito": [37.8591, -122.4853], "Mill Valley": [37.9060, -122.5450],
  "Tiburon": [37.8735, -122.4566], "Corte Madera": [37.9255, -122.5275], "Larkspur": [37.9341, -122.5353],
  "San Rafael": [37.9735, -122.5311], "Novato": [38.1074, -122.5697], "Petaluma": [38.2324, -122.6367],
  "Rohnert Park": [38.3396, -122.7011], "Santa Rosa": [38.4405, -122.7144], "Healdsburg": [38.6105, -122.8692],
  "Sonoma": [38.2919, -122.4580], "Napa": [38.2975, -122.2869], "American Canyon": [38.1750, -122.2608],
  "Yountville": [38.4016, -122.3608], "St. Helena": [38.5052, -122.4703], "Vallejo": [38.1041, -122.2566],
  "Benicia": [38.0494, -122.1586], "Fairfield": [38.2494, -122.0400], "Vacaville": [38.3566, -121.9877],
  "Tracy": [37.7397, -121.4252], "Stockton": [37.9577, -121.2908], "Santa Cruz": [36.9741, -122.0308],
  "Scotts Valley": [37.0511, -122.0147], "Felton": [37.0513, -122.0733], "Ben Lomond": [37.0891, -122.0866],
  "Boulder Creek": [37.1261, -122.1222], "Capitola": [36.9752, -121.9533], "Aptos": [36.9772, -121.8994],
  "Watsonville": [36.9102, -121.7569]
};
const CITY_LOOKUP = new Map(Object.entries(CITY_COORDS).map(([k, v]) => [normCity(k), v]));
function normCity(c) {
  return String(c || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\bsaint\b/g, "st").replace(/\bst\.?\s/g, "st ").replace(/,.*$/, "").replace(/\s+/g, " ").trim();
}
const cityCoords = (c) => CITY_LOOKUP.get(normCity(c)) || null;

const $ = (id) => document.getElementById(id);
const DEFAULTS = { search: "", city: "", date: "all", category: "", freeOnly: false, kidOnly: false };
const state = { all: [], ...DEFAULTS, view: "list", shown: PAGE_SIZE, list: [] };

// ---------- date helpers (everything in Pacific time) ----------
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const cardDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const stampFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" });

const isDateOnly = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
function dayKey(s) {               // "YYYY-MM-DD" in Pacific time
  if (isDateOnly(s)) return s;
  return keyFmt.format(new Date(s));
}
function addDays(key, n) {          // pure calendar arithmetic on "YYYY-MM-DD"
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (key) => new Date(key + "T12:00:00Z").getUTCDay(); // 0=Sun..6=Sat
function startMs(e) { return isDateOnly(e.start) ? new Date(e.start + "T00:00:00-08:00").getTime() : new Date(e.start).getTime(); }
function endMs(e) {
  if (e.end) return isDateOnly(e.end) ? new Date(e.end + "T23:59:59-08:00").getTime() : new Date(e.end).getTime();
  return isDateOnly(e.start) ? new Date(e.start + "T23:59:59-08:00").getTime() : startMs(e) + 3 * 3600e3;
}

function dateRange(which) {
  const today = dayKey(new Date().toISOString());
  if (which === "today") return [today, today];
  if (which === "week") return [today, addDays(today, 6)];
  if (which === "weekend") {
    const wd = weekday(today);
    if (wd === 6) return [today, addDays(today, 1)];        // Saturday
    if (wd === 0) return [today, today];                    // Sunday
    const fri = addDays(today, 5 - wd);                     // Mon–Fri → this Friday
    return [fri, addDays(fri, 2)];
  }
  return null;
}
function inWeekend(e, range) {
  // Friday only counts from 5pm onward ("Friday night").
  const k = dayKey(e.start);
  if (k < range[0] || k > range[1]) return false;
  if (weekday(k) === 5 && !isDateOnly(e.start)) {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date(e.start)));
    return hour >= 17;
  }
  return true;
}

// ---------- misc helpers ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(u) {
  if (!u || typeof u !== "string") return "";
  try { const x = new URL(u, location.href); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : ""; }
  catch { return ""; }
}
function priceText(e) {
  if (e.isFree) return "Free";
  if (e.price === null || e.price === undefined || e.price === "") return "See tickets";
  if (typeof e.price === "number") return "$" + e.price;
  if (typeof e.price === "object") {
    const { min, max } = e.price;
    const m = (n) => "$" + (Number.isInteger(n) ? n : Number(n).toFixed(2));
    if (min != null && max != null && max === min) return m(min);
    if (min != null && max != null && max !== min) return `${m(min)}–${m(max)}`;
    if (min != null) return `From ${m(min)}`;
    if (max != null) return `Up to ${m(max)}`;
    return "See tickets";
  }
  return String(e.price);
}
function dateLabel(e) {
  const k = dayKey(e.start), today = dayKey(new Date().toISOString());
  const base = cardDateFmt.format(new Date(k + "T12:00:00-08:00"));
  if (k === today) return "Today · " + base;
  if (k === addDays(today, 1)) return "Tomorrow · " + base;
  return base;
}
function whenText(e) {
  if (isDateOnly(e.start)) return "All day";
  let t = timeFmt.format(new Date(e.start));
  if (e.end && !isDateOnly(e.end) && dayKey(e.end) === dayKey(e.start)) t += " – " + timeFmt.format(new Date(e.end));
  return t;
}
function fillSelect(sel, values) {
  for (const v of values) { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); }
}

// ---------- filtering ----------
function filtered() {
  const now = Date.now();
  const range = state.date === "all" ? null : dateRange(state.date);
  const words = state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return state.all.filter((e) => {
    if (e._end < now) return false;                          // hide past events
    if (state.city && e.city !== state.city) return false;
    if (state.category && e.category !== state.category) return false;
    if (state.freeOnly && !e.isFree) return false;
    if (state.kidOnly && !e._kid) return false;
    if (range) {
      if (state.date === "weekend") { if (!inWeekend(e, range)) return false; }
      else {
        // multi-day events: include if they overlap the range
        if (e._kEnd < range[0] || e._k > range[1]) return false;
      }
    }
    if (words.length && !words.every((w) => e._hay.includes(w))) return false;
    return true;
  });
}

// ---------- list view ----------
function card(e, i) {
  const url = safeUrl(e.url);
  const img = safeUrl(e.image || "");
  const ck = catKey(e.category);
  const emoji = CATEGORY_EMOJI[e.category] || CATEGORY_EMOJI.Other;
  const price = priceText(e);
  const where = [e.venue, e.city].filter(Boolean).join(", ");
  return `
  <article class="card cat-${ck}" style="--i:${i % PAGE_SIZE}">
    <div class="card-img">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}
      <span class="emoji" aria-hidden="true">${emoji}</span>
      <span class="date-pill">${esc(pillLabel(e))}</span>
    </div>
    <div class="card-body">
      <div class="badges">
        ${e.category ? `<span class="badge cat-chip"><span aria-hidden="true">${emoji}</span> ${esc(e.category)}</span>` : ""}
        ${e.isFree ? `<span class="badge badge-free">Free</span>` : ""}
        ${e._kid ? `<span class="badge badge-kid" title="Looks kid-friendly (guessed from the listing – check age limits)"><span aria-hidden="true">🧸</span> Kid-friendly</span>` : ""}
        ${e.sample ? `<span class="badge badge-sample" title="Made-up example event">Sample – not a real event</span>` : ""}
      </div>
      <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}</h3>
      <div class="when"><span aria-hidden="true">🕒</span> ${esc(whenText(e))}</div>
      ${where ? `<div class="where"><span aria-hidden="true">📍</span> ${esc(where)}</div>` : ""}
      ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ""}
      <div class="card-foot">
        <span class="price ${e.isFree ? "free" : ""}">${esc(price)}</span>
        <span class="src">via ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(e.source || "source")}</a>` : esc(e.source || "source")}</span>
      </div>
    </div>
  </article>`;
}

function pillLabel(e) {
  const today = dayKey(new Date().toISOString());
  if (e._k < today && e._kEnd >= today)   // multi-day event that already started
    return "On now · thru " + cardDateFmt.format(new Date(e._kEnd + "T12:00:00-08:00")).replace(/^\w+, /, "");
  return dateLabel(e);
}

function renderList(append) {
  const grid = $("grid");
  const list = state.list;
  const from = append ? grid.childElementCount : 0;
  const upto = Math.min(state.shown, list.length);
  const html = list.slice(from, upto).map((e, i) => card(e, i)).join("");
  if (append) grid.insertAdjacentHTML("beforeend", html); else grid.innerHTML = html;
  const left = list.length - upto;
  const more = $("load-more");
  more.hidden = left <= 0 || state.view !== "list";
  more.textContent = `Load ${Math.min(left, PAGE_SIZE)} more · ${left.toLocaleString()} to go`;
}
function loadMore() { if (state.shown < state.list.length) { state.shown += PAGE_SIZE; renderList(true); } }

// ---------- render everything ----------
function activeFilterCount() {
  return ["city", "category"].filter((k) => state[k]).length + (state.date !== "all" ? 1 : 0)
    + (state.freeOnly ? 1 : 0) + (state.kidOnly ? 1 : 0);
}
function render() {
  state.list = filtered();
  state.shown = PAGE_SIZE;
  const n = state.list.length;
  $("count").textContent = (n === 1 ? "1 event" : `${n.toLocaleString()} events`) + (state.city ? ` in ${state.city}` : "");
  $("empty").hidden = n > 0;
  $("skeletons").hidden = true;
  $("quick-weekend").setAttribute("aria-pressed", String(state.date === "weekend"));
  $("quick-free").setAttribute("aria-pressed", String(state.freeOnly));
  $("quick-kid").setAttribute("aria-pressed", String(state.kidOnly));
  const ac = activeFilterCount();
  $("active-count").hidden = !ac; $("active-count").textContent = ac;
  renderList(false);
  if (state.view === "map") renderMap();
}

// ---------- controls ----------
let searchTimer;
function readControls() {
  state.search = $("search").value;
  state.city = $("city").value;
  state.date = $("date").value;
  state.category = $("category").value;
  state.freeOnly = $("free-only").checked;
  state.kidOnly = $("kid-only").checked;
  render();
}
function setControls() {
  $("search").value = state.search; $("city").value = state.city; $("date").value = state.date;
  $("category").value = state.category; $("free-only").checked = state.freeOnly; $("kid-only").checked = state.kidOnly;
  render();
}
function reset() { Object.assign(state, DEFAULTS); mapFitPending = true; setControls(); }

function setView(view, { scroll = false } = {}) {
  state.view = view;
  const isMap = view === "map";
  $("view-list").setAttribute("aria-pressed", String(!isMap));
  $("view-map").setAttribute("aria-pressed", String(isMap));
  $("events").hidden = isMap;
  $("map-view").hidden = !isMap;
  $("load-more").hidden = isMap || state.shown >= state.list.length;
  document.body.classList.toggle("is-map", isMap);
  if (history.replaceState) history.replaceState(null, "", isMap ? "#map" : location.pathname + location.search);
  if (isMap) renderMap(); else renderList(false);
  if (scroll) $("main").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

// ---------- map view (Leaflet + OpenStreetMap, loaded on first use) ----------
// Default framing: SF / Peninsula / East Bay / South Bay
const BAY_BOUNDS = [[37.25, -122.52], [37.98, -121.78]];
let leafletPromise = null, map = null, markerLayer = null, mapFitPending = true, lastMapKey = "";
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="; css.crossOrigin = "";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="; js.crossOrigin = "";
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletPromise = null; reject(new Error("Leaflet failed to load")); };
    document.head.appendChild(js);
  });
  return leafletPromise;
}

function popupHtml(city, evs) {
  const MAX = 8;
  const items = evs.slice(0, MAX).map((e) => {
    const url = safeUrl(e.url);
    const t = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title);
    return `<li><span class="pop-emoji" aria-hidden="true">${CATEGORY_EMOJI[e.category] || "✨"}</span><span>${t}<small>${esc(dateLabel(e))} · ${esc(whenText(e))}${e.isFree ? " · Free" : ""}${e._kid ? " · 🧸" : ""}</small></span></li>`;
  }).join("");
  const extra = evs.length > MAX ? `<p class="pop-more">+ ${evs.length - MAX} more</p>` : "";
  return `<div class="pop">
    <h3>${esc(city)} <span>${evs.length} event${evs.length === 1 ? "" : "s"}</span></h3>
    <ul>${items}</ul>${extra}
    <button type="button" class="pop-btn" data-city="${esc(city)}">Filter to this city →</button>
  </div>`;
}

async function renderMap() {
  const note = $("map-note");
  let L;
  try { L = await loadLeaflet(); }
  catch (err) { note.textContent = "Sorry – the map couldn't be loaded right now. The list view still works."; console.error(err); return; }
  if (state.view !== "map") return;
  if (!map) {
    map = L.map("map", { scrollWheelZoom: false, zoomControl: true }).setView([37.62, -122.15], 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    markerLayer = L.layerGroup().addTo(map);
    $("map").addEventListener("click", (ev) => {
      const b = ev.target.closest(".pop-btn");
      if (!b) return;
      state.city = b.dataset.city; mapFitPending = true;
      map.closePopup(); setControls(); setView("list", { scroll: true });
    });
  }
  map.invalidateSize();

  // group current results by city
  const groups = new Map();
  let unplaced = 0;
  for (const e of state.list) {
    const ll = cityCoords(e.city);
    if (!ll) { unplaced++; continue; }
    if (!groups.has(e.city)) groups.set(e.city, { ll, evs: [] });
    groups.get(e.city).evs.push(e);
  }
  const key = state.list.length + "|" + [...groups].map(([c, g]) => c + g.evs.length).join(",");
  if (key === lastMapKey && !mapFitPending) return;
  lastMapKey = key;
  markerLayer.clearLayers();
  const max = Math.max(1, ...[...groups.values()].map((g) => g.evs.length));
  for (const [city, g] of groups) {
    const n = g.evs.length;
    const size = Math.round(28 + 30 * Math.sqrt(n / max));
    const hot = n / max > 0.4 ? "hot" : n / max > 0.1 ? "warm" : "cool";
    const icon = L.divIcon({
      className: "city-pin-wrap",
      html: `<span class="city-pin ${hot}" style="--s:${size}px">${n > 999 ? Math.round(n / 100) / 10 + "k" : n}</span>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2]
    });
    L.marker(g.ll, { icon, title: `${city}: ${n} event${n === 1 ? "" : "s"}`, alt: `${city}: ${n} events`, riseOnHover: true, zIndexOffset: n })
      .bindPopup(() => popupHtml(city, g.evs), { maxWidth: 320, minWidth: 240, autoPanPadding: [20, 80] })
      .addTo(markerLayer);
  }
  if (mapFitPending && groups.size) {
    // Frame the cities that hold most of the results, so a few far-off towns (Stockton, Santa Cruz…)
    // don't zoom the whole map out.
    const sorted = [...groups.values()].sort((a, b) => b.evs.length - a.evs.length);
    const total = sorted.reduce((t, g) => t + g.evs.length, 0);
    const core = []; let acc = 0;
    for (const g of sorted) { core.push(g.ll); acc += g.evs.length; if (acc >= total * 0.9 && core.length >= 3) break; }
    if (core.length === 1) map.setView(core[0], 12);
    else if (groups.size > 12) map.fitBounds(BAY_BOUNDS);
    else map.fitBounds(L.latLngBounds(core), { padding: [30, 30], maxZoom: 11 });
    mapFitPending = false;
  }
  const placed = state.list.length - unplaced;
  note.textContent = `${placed.toLocaleString()} events in ${groups.size} cities on the map` +
    (unplaced ? ` · ${unplaced} more have a city we can't place yet` : "") +
    ". Pins sit at the city center, not the exact venue. Tap a bubble to see its events.";
}

// ---------- credits + hero stats ----------
function showCredits(data, events) {
  // Sources: prefer the list in events.json, then add any other source names found on events.
  const seen = new Map();
  for (const s of (data.sources || [])) if (s && s.name) seen.set(s.name, s.url || "");
  for (const e of events) if (e.source && !seen.has(e.source)) seen.set(e.source, "");
  seen.delete("Ticketmaster"); // already credited by "Events by Ticketmaster"
  const parts = [...seen].map(([name, url]) => {
    const u = safeUrl(url);
    return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
  });
  $("source-credits").innerHTML = parts.length ? ` · Other sources: ${parts.join(", ")}` : "";
}
function showStats(upcoming) {
  const cities = new Set(upcoming.map((e) => e.city).filter(Boolean)).size;
  const free = upcoming.filter((e) => e.isFree).length;
  const kid = upcoming.filter((e) => e._kid).length;
  const stat = (n, label) => `<li><strong>${n.toLocaleString()}</strong> ${label}</li>`;
  $("hero-stats").innerHTML = stat(upcoming.length, "upcoming events") + stat(cities, "cities") + stat(free, "free") + stat(kid, "kid-friendly");
}

// ---------- analytics (only if CF_ANALYTICS_TOKEN is set above) ----------
function loadAnalytics() {
  const token = String(CF_ANALYTICS_TOKEN || "").trim();
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) return;   // empty (or malformed) token → load nothing
  // Placeholder snippet, equivalent to Cloudflare's:
  // <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "..."}'></script>
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token }));
  document.head.appendChild(s);
}

// ---------- sponsored slot (sponsors.json) ----------
// sponsors.json is a list like:
// [{ "name": "Joe's Tacos", "title": "Taco Tuesday, 2-for-1", "url": "https://example.com",
//    "blurb": "One or two short sentences.", "image": "https://example.com/pic.jpg", "until": "2026-12-31" }]
// "image" is optional. A sponsor shows through the end of its "until" day (Pacific time); past ones are hidden.
// With [] (or no active sponsor) the slot stays hidden.
function activeSponsors(list) {
  const today = dayKey(new Date().toISOString());
  return (Array.isArray(list) ? list : []).filter((s) =>
    s && s.name && s.title && safeUrl(s.url) && typeof s.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.until) && s.until >= today);
}
function sponsorHtml(s) {
  const url = safeUrl(s.url), img = safeUrl(s.image || "");
  return `
  <article class="sponsor-card">
    ${img ? `<a class="sponsor-img" href="${esc(url)}" target="_blank" rel="sponsored noopener" tabindex="-1" aria-hidden="true"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.remove()"></a>` : ""}
    <div class="sponsor-body">
      <p class="sponsor-label"><span aria-hidden="true">📣</span> Sponsored · ${esc(s.name)}</p>
      <h3><a href="${esc(url)}" target="_blank" rel="sponsored noopener">${esc(s.title)}</a></h3>
      ${s.blurb ? `<p class="sponsor-blurb">${esc(s.blurb)}</p>` : ""}
    </div>
    <a class="btn sponsor-cta" href="${esc(url)}" target="_blank" rel="sponsored noopener">Learn more →</a>
  </article>`;
}
async function loadSponsors() {
  const slot = $("sponsor-slot");
  if (!slot) return;
  try {
    const res = await fetch("sponsors.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const live = activeSponsors(await res.json());
    if (!live.length) { slot.hidden = true; slot.innerHTML = ""; return; }
    slot.innerHTML = live.slice(0, 1).map(sponsorHtml).join("") +
      `<p class="sponsor-note">Sponsored listing · <a href="advertise.html">Advertise with BayBuzz</a></p>`;
    slot.hidden = false;
  } catch (err) { console.warn("sponsors.json not loaded", err); }
}

// ---------- start ----------
async function init() {
  loadAnalytics();
  if (!$("grid")) return;                  // other pages (e.g. advertise.html) only need analytics
  loadSponsors();
  for (const id of ["add-event-link", "add-event-link-footer"]) { $(id).href = ADD_EVENT_FORM_URL; $(id).removeAttribute("target"); }
  $("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(readControls, 140); });
  ["city", "date", "category", "free-only", "kid-only"].forEach((id) => $(id).addEventListener("change", () => { if (id === "city") mapFitPending = true; readControls(); }));
  $("quick-weekend").addEventListener("click", () => { state.date = state.date === "weekend" ? "all" : "weekend"; setControls(); });
  $("quick-free").addEventListener("click", () => { state.freeOnly = !state.freeOnly; setControls(); });
  $("quick-kid").addEventListener("click", () => { state.kidOnly = !state.kidOnly; setControls(); });
  $("reset").addEventListener("click", reset);
  $("empty-reset").addEventListener("click", reset);
  $("load-more").addEventListener("click", loadMore);
  $("view-list").addEventListener("click", () => setView("list"));
  $("view-map").addEventListener("click", () => setView("map"));
  $("more-filters").addEventListener("click", () => {
    const open = $("filters").classList.toggle("open");
    $("more-filters").setAttribute("aria-expanded", String(open));
  });
  if ("IntersectionObserver" in window) {   // auto "load more" as you scroll near the end
    new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting) && state.view === "list" && state.list.length) loadMore();
    }, { rootMargin: "600px 0px" }).observe($("sentinel"));
  }

  let data;
  try {
    const res = await fetch("events.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    $("skeletons").hidden = true;
    $("count").textContent = "Sorry – events couldn't be loaded right now. Please try again later.";
    console.error("Could not load events.json", err);
    return;
  }
  const events = (Array.isArray(data) ? data : data.events || []).filter((e) => e && e.title && e.start);
  if (Array.isArray(data)) data = { events };
  for (const e of events) {               // precompute once for fast filtering
    e._start = startMs(e); e._end = endMs(e);
    e._k = dayKey(e.start); e._kEnd = e.end ? dayKey(e.end) : e._k;
    e._kid = isKidFriendly(e);
    e._hay = [e.title, e.venue, e.city, e.category, e.description, e.source, e._kid ? "kid-friendly kids" : ""].join(" ").toLowerCase();
  }
  events.sort((a, b) => a._start - b._start || String(a.title).localeCompare(String(b.title)));
  state.all = events;

  $("sample-banner").hidden = !events.some((e) => e.sample === true);
  if (data.lastUpdated) $("updated").textContent = "Last updated: " + stampFmt.format(new Date(data.lastUpdated)) + " (Pacific)";

  const upcoming = events.filter((e) => e._end >= Date.now());
  fillSelect($("city"), [...new Set(upcoming.map((e) => e.city).filter(Boolean))].sort());
  fillSelect($("category"), [...new Set(upcoming.map((e) => e.category).filter(Boolean))].sort());
  showCredits(data, events);
  showStats(upcoming);
  render();
  if (location.hash === "#map") setView("map");
}

document.addEventListener("DOMContentLoaded", init);
