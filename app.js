/* BayBuzz – front-end logic. No build step, no libraries. */

// ====== SETTINGS YOU CAN EDIT ==============================================
// Paste the link to your Google Form here (the "Send" > link URL from Google Forms).
const ADD_EVENT_FORM_URL = "mailto:Ksodhihuntington@gmail.com?subject=Add%20my%20event%20to%20BayBuzz&body=Event%20name%3A%0ADate%20and%20time%3A%0APlace%20and%20city%3A%0APrice%20%28or%20Free%29%3A%0ALink%20for%20more%20info%3A%0AShort%20description%3A%0A";
// Time zone used for all dates on the site.
const TIME_ZONE = "America/Los_Angeles";
// ===========================================================================

const CATEGORY_EMOJI = {
  "Music": "🎵", "Sports": "🏟️", "Arts & Theatre": "🎭", "Family": "👨‍👩‍👧",
  "Comedy": "😂", "Food & Drink": "🍜", "Community": "🤝", "Film": "🎬",
  "Festivals": "🎉", "Outdoors": "🌲", "Other": "✨"
};
const CATEGORY_COLOR = {
  "Music": "#dbe4ff", "Sports": "#dff3e4", "Arts & Theatre": "#f6e1f3", "Family": "#fff0d6",
  "Comedy": "#ffe3dc", "Food & Drink": "#ffe9cf", "Community": "#e0f1f7", "Film": "#e6e2fb",
  "Festivals": "#fde2ef", "Outdoors": "#ddf1e2", "Other": "#eceff6"
};

const $ = (id) => document.getElementById(id);
const state = { all: [], search: "", city: "", date: "all", category: "", freeOnly: false };

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

// ---------- filtering + rendering ----------
function filtered() {
  const now = Date.now();
  const range = state.date === "all" ? null : dateRange(state.date);
  const q = state.search.trim().toLowerCase();
  return state.all.filter((e) => {
    if (endMs(e) < now) return false;                       // hide past events
    if (state.city && e.city !== state.city) return false;
    if (state.category && e.category !== state.category) return false;
    if (state.freeOnly && !e.isFree) return false;
    if (range) {
      if (state.date === "weekend") { if (!inWeekend(e, range)) return false; }
      else {
        const k = dayKey(e.start);
        // multi-day events: include if they overlap the range
        const kEnd = e.end ? dayKey(e.end) : k;
        if (kEnd < range[0] || k > range[1]) return false;
      }
    }
    if (q) {
      const hay = [e.title, e.venue, e.city, e.category, e.description, e.source].join(" ").toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }).sort((a, b) => startMs(a) - startMs(b) || String(a.title).localeCompare(String(b.title)));
}

function card(e) {
  const url = safeUrl(e.url);
  const img = safeUrl(e.image || "");
  const emoji = CATEGORY_EMOJI[e.category] || CATEGORY_EMOJI.Other;
  const bg = CATEGORY_COLOR[e.category] || CATEGORY_COLOR.Other;
  const imgStyle = img ? `background-image:url('${esc(img)}')` : `background-color:${bg}`;
  const price = priceText(e);
  return `
  <article class="card">
    <div class="card-img" style="${imgStyle}">${img ? "" : `<span class="emoji" aria-hidden="true">${emoji}</span>`}<span class="date-pill">${esc(dateLabel(e))}</span></div>
    <div class="card-body">
      <div class="badges">
        ${e.category ? `<span class="badge">${esc(e.category)}</span>` : ""}
        ${e.isFree ? `<span class="badge badge-free">Free</span>` : ""}
        ${e.sample ? `<span class="badge badge-sample" title="Made-up example event">Sample – not a real event</span>` : ""}
      </div>
      <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}</h3>
      <div class="when">${esc(dateLabel(e))} · ${esc(whenText(e))}</div>
      <div class="where">📍 ${esc([e.venue, e.city].filter(Boolean).join(", "))}</div>
      ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ""}
      <div class="card-foot">
        <span class="price ${e.isFree ? "free" : ""}">${esc(price)}</span>
        <span class="src">via ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(e.source || "source")}</a>` : esc(e.source || "source")}</span>
      </div>
    </div>
  </article>`;
}

function render() {
  const list = filtered();
  const box = $("events");
  $("count").textContent = list.length === 1 ? "1 event" : `${list.length} events`;
  $("empty").hidden = list.length > 0;
  const html = `<div class="day-grid">${list.map(card).join("")}</div>`;
  box.innerHTML = html;
  $("quick-weekend").setAttribute("aria-pressed", String(state.date === "weekend"));
  $("quick-free").setAttribute("aria-pressed", String(state.freeOnly));
}

function readControls() {
  state.search = $("search").value;
  state.city = $("city").value;
  state.date = $("date").value;
  state.category = $("category").value;
  state.freeOnly = $("free-only").checked;
  render();
}
function setControls() {
  $("search").value = state.search; $("city").value = state.city; $("date").value = state.date;
  $("category").value = state.category; $("free-only").checked = state.freeOnly;
  render();
}
function reset() { Object.assign(state, { search: "", city: "", date: "all", category: "", freeOnly: false }); setControls(); }

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

async function init() {
  for (const id of ["add-event-link", "add-event-link-footer"]) { $(id).href = ADD_EVENT_FORM_URL; $(id).removeAttribute("target"); }
  ["search"].forEach((id) => $(id).addEventListener("input", readControls));
  ["city", "date", "category", "free-only"].forEach((id) => $(id).addEventListener("change", readControls));
  $("quick-weekend").addEventListener("click", () => { state.date = state.date === "weekend" ? "all" : "weekend"; setControls(); });
  $("quick-free").addEventListener("click", () => { state.freeOnly = !state.freeOnly; setControls(); });
  $("reset").addEventListener("click", reset);
  $("empty-reset").addEventListener("click", reset);

  let data;
  try {
    const res = await fetch("events.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (err) {
    $("count").textContent = "Sorry – events couldn't be loaded right now. Please try again later.";
    console.error("Could not load events.json", err);
    return;
  }
  const events = (Array.isArray(data) ? data : data.events || []).filter((e) => e && e.title && e.start);
  if (Array.isArray(data)) data = { events };
  state.all = events;

  $("sample-banner").hidden = !events.some((e) => e.sample === true);
  if (data.lastUpdated) $("updated").textContent = "Last updated: " + stampFmt.format(new Date(data.lastUpdated)) + " (Pacific)";

  const upcoming = events.filter((e) => endMs(e) >= Date.now());
  fillSelect($("city"), [...new Set(upcoming.map((e) => e.city).filter(Boolean))].sort());
  fillSelect($("category"), [...new Set(upcoming.map((e) => e.category).filter(Boolean))].sort());
  showCredits(data, events);
  render();
}

document.addEventListener("DOMContentLoaded", init);
