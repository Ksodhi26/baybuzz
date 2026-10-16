/* BayBuzz seasonal themes.
   Picks a theme from today's date in the Bay Area (America/Los_Angeles) and sets
   <html data-theme="…">. Colors live in themes.css; this file only adds the tagline/emoji
   variables and a few aria-hidden decorations inside .hero (absolutely positioned, so
   nothing on the page moves). Preview any theme with ?theme=halloween (see THEMES keys),
   ?theme=none shows the original look. Loaded in <head> without defer on purpose so the
   colors are right on first paint (it is tiny and does no network requests). */
(function () {
  "use strict";
  var d = document, root = d.documentElement;

  var THEMES = {
    halloween:    { emoji: "🎃", tagline: "Spooky season in the Bay 🎃", meta: "#ea580c" },
    thanksgiving: { emoji: "🍂", tagline: "Harvest happenings around the Bay 🍂", meta: "#b45309" },
    christmas:    { emoji: "🎄", tagline: "Holiday fun around the Bay 🎄", meta: "#b91c1c" },
    newyear:      { emoji: "🎆", tagline: "New year, new adventures around the Bay ✨", meta: "#1e3a8a" },
    winter:       { emoji: "❄️", tagline: "Cozy winter outings around the Bay ☕", meta: "#1d4ed8" },
    valentine:    { emoji: "💗", tagline: "Love & lanterns around the Bay 💗🏮", meta: "#be123c" },
    spring:       { emoji: "🌸", tagline: "Spring is blooming around the Bay 🌸", meta: "#db2777" },
    summer:       { emoji: "☀️", tagline: "Sunny days around the Bay ☀️", meta: "#0e7490" },
    backtoschool: { emoji: "🍎", tagline: "Back-to-school & early fall fun 🍎", meta: "#1e40af" }
  };
  var ALIASES = {
    fall: "halloween", spooky: "halloween", october: "halloween",
    autumn: "thanksgiving", harvest: "thanksgiving",
    xmas: "christmas", holiday: "christmas", holidays: "christmas", december: "christmas",
    "new-year": "newyear", nye: "newyear",
    "winter-late": "winter", cozy: "winter",
    valentines: "valentine", lunar: "valentine", "lunar-new-year": "valentine", lunarnewyear: "valentine",
    "back-to-school": "backtoschool", school: "backtoschool", september: "backtoschool", earlyfall: "backtoschool"
  };
  // Lunar New Year (Gregorian date, month*100+day). Extends the "love & lanterns" theme when it falls early/late.
  var LNY = { 2026: 217, 2027: 206, 2028: 126, 2029: 213, 2030: 203, 2031: 123, 2032: 211, 2033: 131, 2034: 219, 2035: 208 };

  function pacificToday() {
    try {
      var o = {};
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" })
        .formatToParts(new Date()).forEach(function (p) { o[p.type] = parseInt(p.value, 10); });
      if (o.year && o.month && o.day) return o;
    } catch (e) { /* fall through */ }
    var n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() };
  }
  function addDays(md, year, n) {
    var t = new Date(Date.UTC(year, Math.floor(md / 100) - 1, md % 100 + n));
    return (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
  }
  function themeFor(t) {
    var m = t.month, md = m * 100 + t.day;
    if (md >= 1001 && md <= 1101) return "halloween";      // Oct 1 – Nov 1
    if (m === 11) return "thanksgiving";                    // Nov 2 – Nov 30
    if (m === 12) return "christmas";                       // Dec 1 – Dec 31
    if (md <= 114) return "newyear";                        // Jan 1 – Jan 14
    var vStart = 210, vEnd = 301, lny = LNY[t.year];        // Feb 10 – Mar 1 (+ Lunar New Year window)
    if (lny) { vStart = Math.max(115, Math.min(vStart, addDays(lny, t.year, -3))); vEnd = Math.max(vEnd, addDays(lny, t.year, 14)); }
    if (md >= vStart && md <= vEnd) return "valentine";
    if (m <= 2) return "winter";                            // Jan 15 – Feb 9 (or until the LNY window)
    if (m <= 5) return "spring";                            // Mar 2 – May 31
    if (m <= 8) return "summer";                            // Jun 1 – Aug 31
    return "backtoschool";                                  // Sep 1 – Sep 30
  }

  var name = "";
  try {
    var q = new URLSearchParams(location.search).get("theme");
    if (q) { q = q.toLowerCase().trim(); name = ALIASES[q] || q; }
  } catch (e) { /* old browser: ignore override */ }
  if (name === "none" || name === "off" || name === "default") return;
  if (!THEMES[name]) name = themeFor(pacificToday());
  var theme = THEMES[name];

  root.setAttribute("data-theme", name);
  root.style.setProperty("--theme-emoji", JSON.stringify(theme.emoji));
  root.style.setProperty("--theme-tagline", JSON.stringify(theme.tagline));
  var meta = d.querySelector('meta[name="theme-color"][media*="light"]');
  if (meta) meta.setAttribute("content", theme.meta);

  /* ---------- decorations (inline SVG, aria-hidden) ---------- */
  function svg(vb, body) { return '<svg viewBox="' + vb + '" focusable="false">' + body + "</svg>"; }
  var S = {
    bat: function () { return svg("0 0 64 32", '<path d="M32 9c1.5-3 2.6-4.6 2.6-4.6l1.2 4.1c3-.8 5.2.3 6.2 2.1 4.6-4 12.6-5.6 21-2.6-5 2.2-7 6.2-7 10-3-3-7.2-3-9.2 0-2.2-3-6.2-3-8.2 1-1.8 3.6-4 5.4-6.6 5.4s-4.8-1.8-6.6-5.4c-2-4-6-4-8.2-1-2-3-6.2-3-9.2 0 0-3.8-2-7.8-7-10 8.4-3 16.4-1.4 21 2.6 1-1.8 3.2-2.9 6.2-2.1l1.2-4.1S30.5 6 32 9z" fill="#1c0f2e"/><circle cx="29.3" cy="13" r="1.3" fill="#fde047"/><circle cx="34.7" cy="13" r="1.3" fill="#fde047"/>'); },
    pumpkin: function () { return svg("0 0 40 40", '<path d="M19 3c2.5-.5 4.5 1 4.6 5.5H19.4z" fill="#3f6212"/><ellipse cx="12.5" cy="24" rx="9" ry="12" fill="#ea580c"/><ellipse cx="27.5" cy="24" rx="9" ry="12" fill="#ea580c"/><ellipse cx="20" cy="24" rx="9.5" ry="13" fill="#fb923c"/><circle cx="15" cy="21" r="1.9" fill="#3b0764"/><circle cx="25" cy="21" r="1.9" fill="#3b0764"/><path d="M13.5 27q6.5 5.5 13 0" stroke="#3b0764" stroke-width="2" fill="none" stroke-linecap="round"/>'); },
    candycorn: function () { return svg("0 0 24 24", '<path d="M12 2L21 21Q12 24 3 21Z" fill="#facc15"/><path d="M12 2L17.4 14Q12 15.6 6.6 14Z" fill="#f97316"/><path d="M12 2L14.8 8.2Q12 9 9.2 8.2Z" fill="#fff7ed"/>'); },
    ghost: function () { return svg("0 0 30 34", '<path d="M15 2C8 2 4 7.5 4 14v17l3.6-2.8L11 31l4-2.8 4 2.8 3.4-2.8L26 31V14C26 7.5 22 2 15 2z" fill="#fff" opacity=".95"/><circle cx="11.5" cy="14" r="1.8" fill="#3b0764"/><circle cx="18.5" cy="14" r="1.8" fill="#3b0764"/><path d="M12.5 19q2.5 2 5 0" stroke="#3b0764" stroke-width="1.6" fill="none" stroke-linecap="round"/>'); },
    leaf: function (c) { return svg("0 0 24 24", '<path d="M12 1.5l2 5 4-2-1 5 5 1-4 3 2 3-5-1v7h-2v-7l-5 1 2-3-4-3 5-1-1-5 4 2z" fill="' + c + '"/>'); },
    acorn: function () { return svg("0 0 24 24", '<path d="M6 11h12v2c0 5-3 9-6 9s-6-4-6-9z" fill="#b45309"/><path d="M4 11c0-4 4-6 8-6s8 2 8 6z" fill="#78350f"/><path d="M12 5V2" stroke="#78350f" stroke-width="2" stroke-linecap="round"/>'); },
    flake: function () { return svg("0 0 24 24", '<g stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3 10.5l3.5-1-1-3.4M21 13.5l-3.5 1 1 3.4M3 13.5l3.5 1-1 3.4M21 10.5l-3.5-1 1-3.4"/></g>'); },
    dot: function (c) { return svg("0 0 10 10", '<circle cx="5" cy="5" r="4.5" fill="' + c + '"/>'); },
    sparkle: function (c) { return svg("0 0 24 24", '<path d="M12 0c1.2 7 4.8 10.8 12 12-7.2 1.2-10.8 5-12 12-1.2-7-4.8-10.8-12-12C7.2 10.8 10.8 7 12 0z" fill="' + c + '"/>'); },
    burst: function (c) { var p = ""; for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6; p += "M" + (20 + 7 * Math.cos(a)).toFixed(1) + " " + (20 + 7 * Math.sin(a)).toFixed(1) + "L" + (20 + 18 * Math.cos(a)).toFixed(1) + " " + (20 + 18 * Math.sin(a)).toFixed(1); } return svg("0 0 40 40", '<path d="' + p + '" stroke="' + c + '" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="20" r="3" fill="' + c + '"/>'); },
    heart: function (c) { return svg("0 0 24 24", '<path d="M12 21s-8.5-5.3-8.5-11.2C3.5 6.6 6 4.5 8.6 4.5c1.6 0 2.7.8 3.4 1.9.7-1.1 1.8-1.9 3.4-1.9 2.6 0 5.1 2.1 5.1 5.3C20.5 15.7 12 21 12 21z" fill="' + c + '"/>'); },
    lantern: function () { return svg("0 0 24 40", '<path d="M12 0v6" stroke="#fde68a" stroke-width="1.2"/><rect x="8" y="5" width="8" height="3" rx="1" fill="#facc15"/><ellipse cx="12" cy="17" rx="10" ry="10" fill="#dc2626"/><path d="M12 7c-4 3-4 17 0 20M12 7c4 3 4 17 0 20" stroke="#fbbf24" stroke-width="1" fill="none"/><rect x="8" y="26" width="8" height="3" rx="1" fill="#facc15"/><path d="M10 29v8M12 29v10M14 29v8" stroke="#facc15" stroke-width="1.2"/>'); },
    flower: function (c) { return svg("0 0 24 24", '<g fill="' + c + '"><circle cx="12" cy="6" r="4.5"/><circle cx="17.7" cy="10.2" r="4.5"/><circle cx="15.5" cy="17" r="4.5"/><circle cx="8.5" cy="17" r="4.5"/><circle cx="6.3" cy="10.2" r="4.5"/></g><circle cx="12" cy="12" r="3.4" fill="#fde047"/>'); },
    butterfly: function (c) { return svg("0 0 32 24", '<g class="wing" fill="' + c + '"><path d="M15 12C11-2 0 0 2 8c1 4 6 5 13 4z"/><path d="M15 13C9 13 4 16 6 21c2 3 7 1 9-8z"/><path d="M17 12c4-14 15-12 13-4-1 4-6 5-13 4z"/><path d="M17 13c6 0 11 3 9 8-2 3-7 1-9-8z"/></g><rect x="15" y="6" width="2" height="14" rx="1" fill="#3b0764"/>'); },
    ball: function () { return svg("0 0 24 24", '<circle cx="12" cy="12" r="10.5" fill="#fff"/><path d="M12 1.5A10.5 10.5 0 0 1 22.5 12H12z" fill="#ef4444"/><path d="M12 12h10.5A10.5 10.5 0 0 1 12 22.5z" fill="#2563eb"/><path d="M12 22.5A10.5 10.5 0 0 1 1.5 12H12z" fill="#facc15"/><circle cx="12" cy="12" r="2" fill="#fff"/>'); },
    shell: function () { return svg("0 0 24 24", '<path d="M12 3C6 3 2 9 3 15l9 6 9-6c1-6-3-12-9-12z" fill="#fda4af"/><path d="M12 4v16M8 5l2 15M16 5l-2 15M4.5 9l6 11M19.5 9l-6 11" stroke="#fff" stroke-width="1" opacity=".8"/>'); },
    apple: function () { return svg("0 0 24 24", '<path d="M12 7c-2-2-9-2-9 6s5 10 7 10c1 0 1.4-.5 2-.5s1 .5 2 .5c2 0 7-2 7-10s-7-8-9-6z" fill="#dc2626"/><path d="M12 7c0-3 1-5 3-6" stroke="#78350f" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13 5c2-3 5-3 6-2-1 2-4 3-6 2z" fill="#16a34a"/><ellipse cx="8" cy="11" rx="1.2" ry="2.2" fill="#fff" opacity=".5"/>'); },
    pencil: function () { return svg("0 0 40 12", '<rect x="6" y="2" width="28" height="8" fill="#facc15"/><rect x="6" y="2" width="28" height="2.6" fill="#fde047"/><rect x="30" y="2" width="5" height="8" fill="#f472b6"/><rect x="28.5" y="2" width="2" height="8" fill="#94a3b8"/><path d="M6 2L0 6l6 4z" fill="#fde68a"/><path d="M2 4.7L0 6l2 1.3z" fill="#1f2937"/>'); },
    star: function (c) { return svg("0 0 24 24", '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" fill="' + c + '"/>'); },
    gift: function () { return svg("0 0 24 24", '<rect x="3" y="9" width="18" height="13" rx="2" fill="#16a34a"/><rect x="2" y="6" width="20" height="5" rx="1.5" fill="#22c55e"/><rect x="10.5" y="6" width="3" height="16" fill="#facc15"/><path d="M12 6C9 1 5 3 7.5 6M12 6c3-5 7-3 4.5 0" stroke="#facc15" stroke-width="2" fill="none"/>'); }
  };
  var WEB = '<svg class="td-web" viewBox="0 0 130 130" focusable="false"><path d="M0 0L130 0M0 0L128 21M0 0L113 64M0 0L84 99M0 0L47 121M0 0L16 129M0 0L0 130M28 0Q25 2 28 5Q23 8 24 14Q19 16 18 21Q13 21 10 26Q6 24 3 28Q2 25 0 28M56 0Q50 4 55 9Q47 17 49 28Q38 32 36 43Q25 43 20 52Q12 48 7 56Q3 50 0 56M84 0Q75 6 83 14Q70 25 73 42Q57 48 54 64Q38 64 31 78Q18 73 10 83Q5 75 0 84M112 0Q100 8 110 18Q93 33 97 55Q76 64 72 86Q51 85 41 104Q25 97 14 111Q6 100 0 112" fill="none" stroke="#fff" stroke-width="1.3" stroke-opacity=".55"/></svg>';
  var SPIDER = '<div class="td-spider"><svg viewBox="0 0 24 24" focusable="false"><g stroke="#1c0f2e" stroke-width="1.4" stroke-linecap="round" fill="none"><path d="M8 12L3 9M8 14l-5 1M9 16l-4 5M16 12l5-3M16 14l5 1M15 16l4 5"/></g><circle cx="12" cy="14" r="5" fill="#1c0f2e"/><circle cx="10.3" cy="13.5" r="1.1" fill="#fff"/><circle cx="13.7" cy="13.5" r="1.1" fill="#fff"/><path d="M10.5 16q1.5 1.2 3 0" stroke="#fde047" stroke-width=".9" fill="none" stroke-linecap="round"/></svg></div>';

  // particle recipes: [shape, color, motion]
  var P = {
    halloween: { motion: "float", items: [["bat"], ["pumpkin"], ["leaf", "#f97316"], ["candycorn"], ["bat"], ["ghost"], ["leaf", "#facc15"], ["pumpkin"], ["bat"], ["candycorn"], ["leaf", "#c2410c"], ["ghost"]] },
    thanksgiving: { motion: "fall", items: [["leaf", "#dc2626"], ["leaf", "#f59e0b"], ["acorn"], ["leaf", "#ea580c"], ["leaf", "#fde047"], ["leaf", "#b91c1c"], ["acorn"], ["leaf", "#f97316"], ["leaf", "#facc15"], ["leaf", "#dc2626"], ["acorn"], ["leaf", "#f59e0b"]] },
    christmas: { motion: "snow", items: [["dot", "#fff"], ["flake"], ["dot", "#fff"], ["dot", "#e0f2fe"], ["flake"], ["dot", "#fff"], ["star", "#fde047"], ["dot", "#fff"], ["flake"], ["dot", "#e0f2fe"], ["dot", "#fff"], ["flake"], ["dot", "#fff"], ["dot", "#fff"]] },
    newyear: { motion: "twinkle", items: [["sparkle", "#fde68a"], ["burst", "#facc15"], ["dot", "#fde047"], ["sparkle", "#fff"], ["burst", "#7dd3fc"], ["dot", "#fff"], ["sparkle", "#facc15"], ["burst", "#f9a8d4"], ["dot", "#fde68a"], ["sparkle", "#fff"], ["dot", "#facc15"], ["sparkle", "#fde68a"]] },
    winter: { motion: "snow", items: [["flake"], ["dot", "#fff"], ["dot", "#e0f2fe"], ["flake"], ["dot", "#fff"], ["dot", "#bae6fd"], ["flake"], ["dot", "#fff"], ["dot", "#fff"], ["flake"]] },
    valentine: { motion: "rise", items: [["heart", "#fda4af"], ["heart", "#fff"], ["heart", "#f43f5e"], ["sparkle", "#fde68a"], ["heart", "#fecdd3"], ["heart", "#fb7185"], ["heart", "#fff"], ["sparkle", "#facc15"], ["heart", "#fda4af"], ["heart", "#f43f5e"]] },
    spring: { motion: "drift", items: [["flower", "#f9a8d4"], ["butterfly", "#c4b5fd"], ["flower", "#fde68a"], ["dot", "#fbcfe8"], ["flower", "#a5f3fc"], ["butterfly", "#fbcfe8"], ["flower", "#bbf7d0"], ["dot", "#fff"], ["flower", "#ddd6fe"], ["butterfly", "#fde68a"], ["flower", "#fecaca"], ["dot", "#fbcfe8"]] },
    summer: { motion: "float", items: [["ball"], ["sparkle", "#fef08a"], ["shell"], ["dot", "#fff"], ["sparkle", "#fff"], ["ball"], ["dot", "#fde047"], ["shell"], ["sparkle", "#fef08a"], ["dot", "#fff"]] },
    backtoschool: { motion: "fall", items: [["leaf", "#facc15"], ["apple"], ["star", "#fde047"], ["leaf", "#f97316"], ["pencil"], ["leaf", "#84cc16"], ["star", "#fff"], ["apple"], ["leaf", "#f59e0b"], ["pencil"], ["leaf", "#facc15"], ["star", "#fde047"]] }
  };
  // big piece of art on the right of the hero (replaces the default shapes)
  function art(n) {
    function at(x, y, w, h, shape, c) { var s = S[shape](c); return s.replace("<svg ", '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" '); }
    var A = {
      halloween: '<circle cx="250" cy="62" r="46" fill="#fef3c7"/><circle cx="236" cy="50" r="7" fill="#fde68a"/><circle cx="262" cy="80" r="5" fill="#fde68a"/>' + at(120, 30, 70, 35, "bat") + at(40, 96, 110, 110, "pumpkin") + at(150, 120, 80, 80, "pumpkin") + at(240, 120, 60, 68, "ghost") + at(20, 40, 30, 30, "candycorn"),
      thanksgiving: '<circle cx="250" cy="60" r="42" fill="#fcd34d" opacity=".9"/>' + at(60, 100, 110, 110, "pumpkin") + at(170, 90, 70, 70, "leaf", "#dc2626") + at(230, 130, 60, 60, "leaf", "#f59e0b") + at(30, 50, 40, 40, "acorn") + at(160, 170, 36, 36, "acorn"),
      christmas: '<path d="M240 18l58 92h-26l40 62h-144l40-62h-26z" fill="#15803d"/><rect x="226" y="172" width="28" height="26" fill="#78350f"/>' + at(222, 2, 36, 36, "star", "#fde047") + '<g fill="#fde047"><circle cx="230" cy="80" r="5"/><circle cx="262" cy="120" r="5"/></g><g fill="#ef4444"><circle cx="252" cy="70" r="5"/><circle cx="214" cy="140" r="5"/><circle cx="276" cy="150" r="5"/></g><g fill="#7dd3fc"><circle cx="240" cy="105" r="5"/><circle cx="244" cy="150" r="5"/></g>' + at(90, 140, 60, 60, "gift") + at(140, 160, 44, 44, "gift"),
      newyear: at(170, 10, 120, 120, "burst", "#facc15") + at(60, 40, 90, 90, "burst", "#7dd3fc") + at(230, 110, 80, 80, "burst", "#f9a8d4") + at(120, 140, 40, 40, "sparkle", "#fff") + at(40, 150, 30, 30, "sparkle", "#fde68a"),
      winter: '<circle cx="210" cy="160" r="46" fill="#fff"/><circle cx="210" cy="92" r="32" fill="#fff"/><circle cx="200" cy="86" r="3.5" fill="#1e293b"/><circle cx="220" cy="86" r="3.5" fill="#1e293b"/><path d="M210 94l18 5-18 4z" fill="#f97316"/><path d="M200 104q10 7 20 0" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M182 118h56v12h-56z" fill="#ef4444"/><path d="M226 128h12v26h-12z" fill="#ef4444"/><path d="M188 62h44v-30h-36z" fill="#1e3a8a"/><rect x="180" y="58" width="60" height="8" rx="3" fill="#1e3a8a"/>' + at(60, 40, 50, 50, "flake") + at(280, 20, 30, 30, "flake"),
      valentine: at(170, 30, 130, 130, "heart", "#fb7185") + at(110, 100, 70, 70, "heart", "#fecdd3") + at(40, 0, 50, 84, "lantern") + at(280, 120, 34, 56, "lantern") + at(140, 30, 30, 30, "sparkle", "#fde68a"),
      spring: at(180, 30, 90, 90, "flower", "#f9a8d4") + at(250, 100, 64, 64, "flower", "#c4b5fd") + at(120, 120, 70, 70, "flower", "#a5f3fc") + at(50, 40, 64, 48, "butterfly", "#fde68a") + '<path d="M225 118v90M282 160v50M155 186v24" stroke="#4ade80" stroke-width="6" stroke-linecap="round"/>',
      summer: '<g class="td-sun"><circle cx="250" cy="64" r="40" fill="#fde047"/><g stroke="#fde047" stroke-width="7" stroke-linecap="round"><path d="M250 6v12M250 110v12M192 64h12M296 64h12M209 23l8 8M283 97l8 8M209 105l8-8M283 31l8-8"/></g></g><path d="M120 120q40-60 80 0z" fill="#f43f5e"/><path d="M160 60v5M160 90v100" stroke="#fff" stroke-width="4"/><path d="M120 120q10-14 20 0q10-14 20 0q10-14 20 0q10-14 20 0" fill="#fda4af"/>' + at(40, 150, 50, 50, "ball") + at(230, 160, 40, 40, "shell"),
      backtoschool: at(190, 40, 110, 110, "apple") + at(60, 140, 150, 45, "pencil") + '<rect x="80" y="40" width="80" height="60" rx="6" fill="#1e40af"/><rect x="84" y="44" width="72" height="52" rx="4" fill="#fff"/><path d="M92 58h56M92 70h56M92 82h40" stroke="#93c5fd" stroke-width="3" stroke-linecap="round"/>' + at(260, 160, 34, 34, "star", "#fde047") + at(30, 50, 40, 40, "leaf", "#f59e0b")
    };
    return '<svg class="td-art" viewBox="0 0 320 220" focusable="false">' + A[n] + "</svg>";
  }
  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function decorate() {
    var heroes = d.querySelectorAll(".hero");
    if (!heroes.length) return;
    var recipe = P[name], r = rnd(name.length * 7919 + 13), html = '<div class="td-particles">';
    recipe.items.forEach(function (it, i) {
      var x = ((i + r() * 0.8) / recipe.items.length * 100).toFixed(1), y = (5 + r() * 80).toFixed(1);
      var s = (it[0] === "dot" ? 6 + r() * 6 : it[0] === "pencil" ? 40 : 18 + r() * 16).toFixed(0);
      html += '<span class="tp tp-' + it[0] + '" style="--x:' + x + "%;--y:" + y + "%;--s:" + s + "px;--dur:" + (7 + r() * 7).toFixed(1) + "s;--delay:-" + (r() * 12).toFixed(1) + "s;--r:" + (r() * 360).toFixed(0) + 'deg">' + S[it[0]](it[1]) + "</span>";
    });
    html += "</div>" + art(name);
    if (name === "halloween") html += WEB + SPIDER;
    if (name === "christmas") html += '<div class="td-garland"></div><div class="td-garland td-glow"></div>';
    if (name === "summer") html += '<div class="td-waves"></div>';
    for (var i = 0; i < heroes.length; i++) {
      var el = d.createElement("div");
      el.className = "theme-deco motion-" + recipe.motion;
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = html;
      heroes[i].appendChild(el);
    }
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", decorate); else decorate();
})();
