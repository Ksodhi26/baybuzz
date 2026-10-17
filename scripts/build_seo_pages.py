#!/usr/bin/env python3
"""Build static SEO landing pages for BayBuzz from events.json.

Writes (all committed to the repo, served as-is by Cloudflare Pages):
  events/index.html                    hub: every city page
  events/<city>/index.html             upcoming events in a city
  kid-friendly/<city>/index.html       kid-friendly events in a city (only if enough events)
  free-events/<city>/index.html        free events in a city (only if enough events)
  this-weekend/index.html              Bay Area events this weekend
  sitemap.xml                          home, advertise and every page above

Run from anywhere:  python scripts/build_seo_pages.py
Only uses the Python standard library. Re-running it deletes and rebuilds the generated folders,
so cities that drop below the threshold disappear cleanly.
"""
from __future__ import annotations

import html
import json
import re
import shutil
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://thebaybuzz.com"
TZ = ZoneInfo("America/Los_Angeles")

CORE_CITIES = ["San Ramon", "Walnut Creek", "Pleasanton", "Livermore", "San Francisco", "Oakland", "San Jose"]
MIN_CITY_EVENTS = 15        # any other city with at least this many upcoming events gets a page
MIN_SUBPAGE_EVENTS = 5      # kid-friendly / free pages need at least this many events (avoids thin pages)
LIST_LIMIT = 40             # events rendered as HTML per page
JSONLD_LIMIT = 10           # events described with schema.org Event JSON-LD per page
GENERATED_DIRS = ["events", "kid-friendly", "free-events", "this-weekend"]

CATEGORY_EMOJI = {
    "Music": "🎸", "Sports": "🏟️", "Arts & Theatre": "🎭", "Family": "🎈", "Comedy": "🤣",
    "Food & Drink": "🌮", "Community": "🤝", "Film": "🎬", "Festivals": "🎉", "Outdoors": "🌲", "Other": "✨",
}
CATEGORY_KEY = {
    "Music": "music", "Sports": "sports", "Arts & Theatre": "arts", "Family": "family", "Comedy": "comedy",
    "Food & Drink": "food", "Community": "community", "Film": "film", "Festivals": "fest", "Outdoors": "outdoors",
    "Other": "other",
}

# ---- kid-friendly guess: a straight port of isKidFriendly() in app.js (keep the two in sync) ----
KID_RE = re.compile(r"""\b(kids?|kiddos?|children'?s?|child|famil(y|ies)|story ?times?|toddlers?|bab(y|ies)|infants?|preschool(ers)?|pre-k|kindergarten|teens?|tweens?|youth|puppets?|puppetry|disney|circus|lego|legos|sesame street|paw patrol|bluey|cocomelon|peppa|elmo|pok[eé]mon|minecraft|magic show|nursery|lullaby|homeschool(ers)?|grades? k|ages? \d{1,2} ?(-|–|to) ?1[0-8]|ages? [0-9] ?(\+|and up)|jr\.? rangers?|(girl|boy|cub) scouts?|petting zoo|face painting|bounce house|trick[- ]or[- ]treat|pumpkin patch|meet santa|easter egg)(?!\w)""", re.I)
KID_TITLE_RE = re.compile(r"""\b(for kids|kids'?|children'?s|famil(y|ies)|disney|bluey|sesame street|paw patrol|cocomelon|peppa|story ?time|toddlers?|puppets?|circus|lullab(y|ies)|baby shark|kidz bop)\b""", re.I)
ALL_AGES_RE = re.compile(r"\ball[- ]ages\b", re.I)
ADULT_RE = re.compile(r"""\b(21 ?\+|18 ?\+|18 ?& ?up|ages? 1[3-9] ?\+|no children|21 and (over|up)|18 and (over|up)|adults? only|ages? 18|ages? 21|for adults|burlesque|wine tasting|beer|cocktails?|happy hour|bar crawl)(?!\w)""", re.I)
NOT_KID_RE = re.compile(r"""\b(all ages or 18|family (history|tree|caregivers?|law|search center|research)|genealog\w*|baby boomers?|child ?care providers?|parents? of teens|adult children)\b""", re.I)
KID_WORD_TITLE_RE = re.compile(r"\b(kids?|children|family)\b", re.I)


def is_kid_friendly(e: dict) -> bool:
    if e.get("category") == "Family":
        return True
    title = e.get("title") or ""
    text = NOT_KID_RE.sub(" ", f"{title} {e.get('description') or ''}")
    if ADULT_RE.search(title):
        return False
    if ADULT_RE.search(text) and not KID_WORD_TITLE_RE.search(title):
        return False
    if e.get("category") in ("Music", "Comedy"):
        return bool(KID_TITLE_RE.search(title))
    if KID_RE.search(text):
        return True
    return bool(ALL_AGES_RE.search(text))


# ---------------- helpers ----------------
def esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def is_date_only(s) -> bool:
    return isinstance(s, str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s))


def parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def start_dt(e) -> datetime:
    if is_date_only(e["start"]):
        return datetime.fromisoformat(e["start"]).replace(tzinfo=TZ)
    return parse_dt(e["start"])


def end_dt(e) -> datetime:
    if e.get("end"):
        if is_date_only(e["end"]):
            return datetime.fromisoformat(e["end"]).replace(hour=23, minute=59, second=59, tzinfo=TZ)
        return parse_dt(e["end"])
    if is_date_only(e["start"]):
        return start_dt(e).replace(hour=23, minute=59, second=59)
    return start_dt(e) + timedelta(hours=3)


def day_key(s: str) -> date:
    if is_date_only(s):
        return date.fromisoformat(s)
    return parse_dt(s).astimezone(TZ).date()


def weekend_range(today: date) -> tuple[date, date]:
    """Same rule as the app: Fri (from 5pm) – Sun; on Sat → Sat+Sun; on Sun → Sun."""
    wd = today.weekday()  # Mon=0..Sun=6
    if wd == 5:
        return today, today + timedelta(days=1)
    if wd == 6:
        return today, today
    fri = today + timedelta(days=4 - wd)
    return fri, fri + timedelta(days=2)


def in_weekend(e, rng) -> bool:
    k = e["_k"]
    if e["_kend"] < rng[0] or k > rng[1]:
        return False
    if k < rng[0]:              # multi-day event already running → it's on this weekend too
        return True
    if k.weekday() == 4 and not is_date_only(e["start"]):
        return parse_dt(e["start"]).astimezone(TZ).hour >= 17
    return True


def fmt_day(d: date) -> str:
    return f"{d.strftime('%a')}, {d.strftime('%b')} {d.day}"


def fmt_time(dt: datetime) -> str:
    dt = dt.astimezone(TZ)
    h = dt.hour % 12 or 12
    return f"{h}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}"


def when_text(e, today: date) -> str:
    k, kend = e["_k"], e["_kend"]
    if k < today <= kend or (kend > k and is_date_only(e["start"])):
        label = f"{fmt_day(k)} – {fmt_day(kend)}" if k >= today else f"On now · through {fmt_day(kend)}"
    else:
        label = fmt_day(k)
    if not is_date_only(e["start"]) and kend == k:
        label += " · " + fmt_time(start_dt(e))
    return label


def price_text(e) -> str:
    if e.get("isFree"):
        return "Free"
    p = e.get("price")
    if isinstance(p, (int, float)):
        return f"${p:g}"
    if isinstance(p, dict):
        def m(n):
            return f"${n:g}" if float(n).is_integer() else f"${n:.2f}"
        lo, hi = p.get("min"), p.get("max")
        if lo is not None and hi is not None:
            return m(lo) if lo == hi else f"{m(lo)}–{m(hi)}"
        if lo is not None:
            return f"From {m(lo)}"
        if hi is not None:
            return f"Up to {m(hi)}"
    return "See tickets"


def safe_url(u) -> str:
    if not isinstance(u, str):
        return ""
    try:
        p = urlparse(u)
    except ValueError:
        return ""
    return u if p.scheme in ("http", "https") and p.netloc else ""


def page_url(path: str) -> str:
    return SITE + path


def app_link(**params) -> str:
    q = {k: v for k, v in params.items() if v}
    return "/" + ("?" + urlencode(q) if q else "")


def iso_for_schema(s: str) -> str:
    return s if is_date_only(s) else parse_dt(s).isoformat()


def event_jsonld(e) -> dict:
    d = {"@type": "Event", "name": e["title"], "startDate": iso_for_schema(e["start"])}
    if e.get("end"):
        d["endDate"] = iso_for_schema(e["end"])
    addr = {"@type": "PostalAddress", "addressRegion": "CA", "addressCountry": "US"}
    if e.get("city"):
        addr["addressLocality"] = e["city"]
    d["location"] = {"@type": "Place", "name": e.get("venue") or e.get("city") or "Bay Area", "address": addr}
    if e.get("description"):
        d["description"] = e["description"][:300]
    img = safe_url(e.get("image"))
    if img:
        d["image"] = [img]
    url = safe_url(e.get("url"))
    if url:
        d["url"] = url
    p = e.get("price")
    if e.get("isFree"):
        d["isAccessibleForFree"] = True
        d["offers"] = {"@type": "Offer", "price": 0, "priceCurrency": "USD", **({"url": url} if url else {})}
    elif isinstance(p, dict) and (p.get("min") is not None or p.get("max") is not None):
        offer = {"@type": "Offer", "priceCurrency": p.get("currency") or "USD"}
        if p.get("min") is not None:
            offer["price"] = p["min"]
        else:
            offer["price"] = p["max"]
        if url:
            offer["url"] = url
        d["offers"] = offer
    return d


# ---------------- HTML pieces ----------------
HEAD_FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600;700&display=swap">'
)
FAVICON_LINKS = """<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">"""

HERO_ART = """<svg class="hero-art" viewBox="0 0 320 220" aria-hidden="true" focusable="false">
      <circle cx="250" cy="60" r="44" fill="#ffd43b"/>
      <rect x="40" y="120" width="70" height="70" rx="18" fill="#22d3ee" transform="rotate(-14 75 155)"/>
      <path d="M150 40l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="#fff" opacity=".95"/>
      <path d="M180 170c20-30 50-30 70 0s50 30 70 0" fill="none" stroke="#a3e635" stroke-width="10" stroke-linecap="round"/>
      <circle cx="40" cy="50" r="10" fill="#fb7185"/><circle cx="290" cy="150" r="8" fill="#fff"/>
      <circle cx="120" cy="200" r="6" fill="#ffd43b"/><circle cx="210" cy="110" r="7" fill="#c084fc"/>
    </svg>"""


SOCIAL_IG = "https://www.instagram.com/thebaybuzzevents/"
SOCIAL_FB = "https://www.facebook.com/profile.php?id=61595417553522"
SOCIAL_HERO = '<span class="social-row"><a href="https://www.instagram.com/thebaybuzzevents/" target="_blank" rel="noopener" aria-label="BayBuzz on Instagram (opens in a new tab)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a><a href="https://www.facebook.com/profile.php?id=61595417553522" target="_blank" rel="noopener" aria-label="BayBuzz on Facebook (opens in a new tab)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.9.4-1.7 1.8-1.7h1.6V3.8c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.6H7.4v3.3h2.8V22z"/></svg></a></span>'
SOCIAL_FOOTER = '<p class="social-follow">Follow BayBuzz: <span class="social-row social-row-footer"><a href="https://www.instagram.com/thebaybuzzevents/" target="_blank" rel="noopener" aria-label="BayBuzz on Instagram (opens in a new tab)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a><a href="https://www.facebook.com/profile.php?id=61595417553522" target="_blank" rel="noopener" aria-label="BayBuzz on Facebook (opens in a new tab)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.9.4-1.7 1.8-1.7h1.6V3.8c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.6H7.4v3.3h2.8V22z"/></svg></a></span></p>'
ORG_LD = {"@type": "Organization", "name": "BayBuzz", "url": "https://thebaybuzz.com/", "logo": "https://thebaybuzz.com/icon-512.png", "sameAs": [SOCIAL_IG, SOCIAL_FB]}


def head(title: str, desc: str, path: str, jsonld: list[dict]) -> str:
    url = page_url(path)
    ld = ""
    jsonld = list(jsonld) + [ORG_LD]
    if jsonld:
        payload = json.dumps({"@context": "https://schema.org", "@graph": jsonld}, ensure_ascii=False, separators=(",", ":"))
        payload = payload.replace("</", "<\\/")
        ld = f'\n  <script type="application/ld+json">{payload}</script>'
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <link rel="canonical" href="{esc(url)}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="BayBuzz">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{esc(url)}">
  <meta property="og:image" content="{SITE}/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{SITE}/og-image.png">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#ff4d6d" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0d0b1e" media="(prefers-color-scheme: dark)">
  {FAVICON_LINKS}
  {HEAD_FONTS}
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/themes.css">
  <script src="/themes.js"></script>{ld}
</head>"""


def hero(h1_html: str, sub: str, crumbs: list[tuple[str, str]], app_href: str, app_label: str) -> str:
    bc = " <span aria-hidden=\"true\">›</span> ".join(
        f'<a href="{esc(h)}">{esc(t)}</a>' if h else f'<span aria-current="page">{esc(t)}</span>' for t, h in crumbs)
    return f"""  <a class="skip-link" href="#main">Skip to events</a>
  <header class="hero hero-small">
    <div class="hero-blobs" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="confetti" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    {HERO_ART}
    <div class="wrap hero-inner">
      <div class="hero-copy">
        <nav class="crumbs" aria-label="Breadcrumb">{bc}</nav>
        <a class="brand-logo" href="/" aria-label="BayBuzz home"><img src="/logo-header.webp" width="142" height="80" alt="BayBuzz" decoding="async"></a>
        <p class="eyebrow">Bay Area events</p>
        <h1 class="hero-title">{h1_html}</h1>
        <p class="sub">{esc(sub)}</p>
      </div>
      <div class="hero-actions">
        <a class="btn btn-hero" href="{esc(app_href)}">{esc(app_label)}</a>
        {SOCIAL_HERO}
      </div>
    </div>
    <div class="hero-wave" aria-hidden="true"></div>
  </header>"""


def card_html(e, today: date) -> str:
    ck = CATEGORY_KEY.get(e.get("category"), "other")
    emoji = CATEGORY_EMOJI.get(e.get("category"), "✨")
    url = safe_url(e.get("url"))
    title = f'<a href="{esc(url)}" target="_blank" rel="noopener">{esc(e["title"])}</a>' if url else esc(e["title"])
    where = ", ".join(x for x in [e.get("venue"), e.get("city")] if x)
    badges = []
    if e.get("category"):
        badges.append(f'<span class="badge cat-chip"><span aria-hidden="true">{emoji}</span> {esc(e["category"])}</span>')
    if e.get("isFree"):
        badges.append('<span class="badge badge-free">Free</span>')
    if e["_kid"]:
        badges.append('<span class="badge badge-kid"><span aria-hidden="true">🧸</span> Kid-friendly</span>')
    return f"""      <li class="seo-card cat-{ck}">
        <span class="seo-emoji" aria-hidden="true">{emoji}</span>
        <div class="seo-card-body">
          <p class="seo-when"><time datetime="{esc(e['start'])}">{esc(when_text(e, today))}</time></p>
          <h3>{title}</h3>
          {f'<p class="seo-where"><span aria-hidden="true">📍</span> {esc(where)}</p>' if where else ''}
          <div class="badges">{''.join(badges)}{'' if e.get('isFree') else f'<span class="badge badge-price">{esc(price_text(e))}</span>'}</div>
        </div>
      </li>"""


def footer(link_groups: list[tuple[str, list[tuple[str, str]]]], updated: str) -> str:
    groups = "\n".join(
        f'      <div class="seo-links"><h2>{esc(h)}</h2><ul>' + "".join(f'<li><a href="{esc(u)}">{esc(t)}</a></li>' for t, u in links) + "</ul></div>"
        for h, links in link_groups if links)
    return f"""  <section class="wrap seo-explore" aria-label="Explore more">
{groups}
  </section>
  <footer class="site-footer">
    <div class="wrap">
      {SOCIAL_FOOTER}
      <p class="attribution"><a href="https://www.ticketmaster.com/" target="_blank" rel="noopener">Events by Ticketmaster</a> · public library, city and venue calendars</p>
      <p class="disclaimer">
        BayBuzz is a free, independent listing site and is not affiliated with event organizers or ticket sellers.
        Event details (dates, times, prices, venues) come from third-party sources and can change —
        <strong>please verify with the organizer or the original listing before you go.</strong>
        “Kid-friendly” tags are guessed automatically from event text, so check the listing for age limits.
      </p>
      <p class="small"><a href="/">All Bay Area events</a> · <a href="/events/">Events by city</a> · <a href="/this-weekend/">This weekend</a> · <a href="/advertise">Advertise with BayBuzz</a>{(' · Listings updated ' + esc(updated)) if updated else ''}</p>
    </div>
  </footer>
</body>
</html>
"""


def render_page(*, path, title, desc, h1_html, sub, crumbs, app_href, app_label, events, today, intro, empty_msg,
                link_groups, updated, total, weekend=None, weekend_label="") -> str:
    shown = events[:LIST_LIMIT]
    sections = [("", shown)]
    if weekend:
        wk_list = [e for e in events if in_weekend(e, weekend)][:LIST_LIMIT]
        ids = {id(e) for e in wk_list}
        rest = [e for e in events if id(e) not in ids][:max(0, LIST_LIMIT - len(wk_list))]
        shown = wk_list + rest
        sections = [(f"This weekend · {weekend_label}", wk_list), ("Coming up", rest)]
    jsonld = [event_jsonld(e) for e in shown[:JSONLD_LIMIT]]
    crumb_ld = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": t, "item": page_url(h or path)} for i, (t, h) in enumerate(crumbs)]}
    def block(h, lst):
        if not lst:
            return ""
        hd = f'<h2 class="seo-h2">{esc(h)} <span>{len(lst)}</span></h2>' + chr(10) if h else ""
        return hd + '    <ol class="seo-list">' + chr(10) + chr(10).join(card_html(e, today) for e in lst) + chr(10) + "    </ol>"
    cards = (chr(10) + '    <hr class="rainbow" aria-hidden="true">' + chr(10)).join(b for b in (block(h, l) for h, l in sections) if b)
    more = ""
    if total > len(shown):
        more = f'<p class="seo-more">Showing {len(shown)} of {total} upcoming events. <a class="btn btn-load" href="{esc(app_href)}">See all {total} in the interactive app →</a></p>'
    elif total:
        more = f'<p class="seo-more"><a class="btn btn-load" href="{esc(app_href)}">Filter, search &amp; map these in the app →</a></p>'
    body = f"""
<body class="seo-page">
{hero(h1_html, sub, crumbs, app_href, app_label)}
  <main class="wrap seo-main" id="main">
    <p class="seo-intro">{intro}</p>
    <hr class="rainbow" aria-hidden="true">
    {cards if shown else f'<p class="empty">{empty_msg} <a href="{esc(app_href)}">Browse all events</a>.</p>'}
    {more}
  </main>
{footer(link_groups, updated)}"""
    return head(title, desc, path, jsonld + [crumb_ld]) + body


# ---------------- main ----------------
def main() -> int:
    data = json.loads((ROOT / "events.json").read_text(encoding="utf-8"))
    raw = data["events"] if isinstance(data, dict) else data
    now = datetime.now(timezone.utc)
    today = now.astimezone(TZ).date()
    updated = ""
    if isinstance(data, dict) and data.get("lastUpdated"):
        try:
            u = parse_dt(data["lastUpdated"]).astimezone(TZ)
            updated = f"{u.strftime('%b')} {u.day}, {u.year}"
        except ValueError:
            pass

    events = []
    for e in raw:
        if not (isinstance(e, dict) and e.get("title") and e.get("start")) or e.get("sample"):
            continue
        try:
            e["_start"], e["_end"] = start_dt(e), end_dt(e)
            e["_k"] = day_key(e["start"])
            e["_kend"] = day_key(e["end"]) if e.get("end") else e["_k"]
        except (ValueError, TypeError):
            continue
        if e["_end"] < now:
            continue
        e["_kid"] = is_kid_friendly(e)
        events.append(e)
    # Soonest first; long-running exhibitions that started weeks ago sort by today so they don't crowd the top.
    events.sort(key=lambda e: (max(e["_k"], today), e["_start"], e["title"]))

    by_city: dict[str, list] = {}
    for e in events:
        if e.get("city"):
            by_city.setdefault(e["city"], []).append(e)
    cities = [c for c in CORE_CITIES] + sorted(
        (c for c, evs in by_city.items() if len(evs) >= MIN_CITY_EVENTS and c not in CORE_CITIES),
        key=lambda c: -len(by_city[c]))
    slugs = {c: slugify(c) for c in cities}

    wk = weekend_range(today)
    weekend_label = f"{fmt_day(wk[0])}" + (f" – {fmt_day(wk[1])}" if wk[1] != wk[0] else "")

    # clear old output (only folders this script owns)
    for d in GENERATED_DIRS:
        p = ROOT / d
        if p.exists():
            shutil.rmtree(p)

    pages: list[tuple[str, str]] = []   # (path, html)
    kid_pages, free_pages = {}, {}
    for c in cities:
        evs = by_city.get(c, [])
        kid_pages[c] = sum(1 for e in evs if e["_kid"]) >= MIN_SUBPAGE_EVENTS
        free_pages[c] = sum(1 for e in evs if e.get("isFree")) >= MIN_SUBPAGE_EVENTS

    city_links = [(c, f"/events/{slugs[c]}/") for c in cities]

    def nearby_links(c):
        return [(f"Events in {x}", f"/events/{slugs[x]}/") for x in cities if x != c][:14]

    def city_group(c):
        s = slugs[c]
        links = [(f"All events in {c}", f"/events/{s}/")]
        if kid_pages[c]:
            links.append((f"Kid-friendly events in {c}", f"/kid-friendly/{s}/"))
        if free_pages[c]:
            links.append((f"Free events in {c}", f"/free-events/{s}/"))
        links.append(("This weekend around the Bay", "/this-weekend/"))
        return (f"More in {c}", links)

    for c in cities:
        s = slugs[c]
        evs = by_city.get(c, [])
        n_wk = sum(1 for e in evs if in_weekend(e, wk))
        n_free = sum(1 for e in evs if e.get("isFree"))
        n_kid = sum(1 for e in evs if e["_kid"])
        variants = [("events", evs, None)]
        if kid_pages[c]:
            variants.append(("kid-friendly", [e for e in evs if e["_kid"]], "kid"))
        if free_pages[c]:
            variants.append(("free-events", [e for e in evs if e.get("isFree")], "free"))
        for folder, lst, kind in variants:
            path = f"/{folder}/{s}/"
            total = len(lst)
            wk_n = sum(1 for e in lst if in_weekend(e, wk))
            if kind is None:
                title = f"Things to Do in {c} This Weekend & Upcoming Events | BayBuzz"
                desc = (f"{total} upcoming events in {c}, CA: concerts, family fun, library programs, comedy and more. "
                        f"{n_free} free, {n_kid} kid-friendly. Updated daily.")
                h1 = f'Events in <span class="hl">{esc(c)}</span>'
                sub = f"{total} upcoming · {n_wk} this weekend · {n_free} free · {n_kid} kid-friendly"
                intro = (f"Looking for things to do in {esc(c)}? Here are the next upcoming events in and around {esc(c)}, "
                         f"pulled daily from Ticketmaster, public libraries, city calendars and local venues.")
                crumb = "Events"
                app = app_link(city=c)
            elif kind == "kid":
                title = f"Kid-Friendly Events in {c} This Weekend & Beyond | BayBuzz"
                desc = (f"{total} upcoming kid-friendly and family events in {c}, CA, including story times, "
                        f"family shows and free library programs. Updated daily.")
                h1 = f'Kid-friendly events in <span class="hl">{esc(c)}</span>'
                sub = f"{total} upcoming family-friendly events · {wk_n} this weekend"
                intro = (f"Family outings in {esc(c)}: story times, kids’ shows, crafts and more. Kid-friendly tags are "
                         f"guessed from each listing, so please check age limits with the organizer.")
                crumb = "Kid-friendly"
                app = app_link(city=c, kid="1")
            else:
                title = f"Free Events in {c} This Weekend & Upcoming | BayBuzz"
                desc = (f"{total} upcoming free events in {c}, CA: free concerts, library programs, festivals and "
                        f"community events. Updated daily.")
                h1 = f'Free events in <span class="hl">{esc(c)}</span>'
                sub = f"{total} upcoming free events · {wk_n} this weekend"
                intro = (f"No ticket needed: free things to do in {esc(c)}, from library programs to community "
                         f"festivals. Some free events still ask you to register, so check the listing.")
                crumb = "Free events"
                app = app_link(city=c, free="1")
            groups = [city_group(c), ("Other Bay Area cities", nearby_links(c))]
            pages.append((path, render_page(
                path=path, title=title, desc=desc, h1_html=h1, sub=sub,
                crumbs=([("BayBuzz", "/"), ("Events", "/events/"), (c, None)] if kind is None
                        else [("BayBuzz", "/"), ("Events", "/events/"), (c, f"/events/{s}/"), (crumb, None)]),
                weekend=wk, weekend_label=weekend_label,
                app_href=app, app_label="🔎 Open in the app", events=lst, today=today, intro=intro,
                empty_msg=f"No upcoming events found in {esc(c)} right now — check back soon.",
                link_groups=groups, updated=updated, total=total)))

    # this weekend
    wk_events = [e for e in events if in_weekend(e, wk)]
    n_free = sum(1 for e in wk_events if e.get("isFree"))
    n_kid = sum(1 for e in wk_events if e["_kid"])
    top_wk_cities = sorted({e["city"] for e in wk_events if e.get("city") in slugs}, key=lambda c: -sum(1 for e in wk_events if e.get("city") == c))
    pages.append(("/this-weekend/", render_page(
        path="/this-weekend/",
        title=f"Things to Do in the Bay Area This Weekend ({weekend_label}) | BayBuzz",
        desc=(f"{len(wk_events)} Bay Area events this weekend ({weekend_label}): concerts, festivals, family fun, "
              f"{n_free} free events and {n_kid} kid-friendly picks from SF to San Jose."),
        h1_html='Things to do <span class="hl">this weekend</span> around the Bay',
        sub=f"{weekend_label} · {len(wk_events)} events · {n_free} free · {n_kid} kid-friendly",
        crumbs=[("BayBuzz", "/"), ("This weekend", None)],
        app_href=app_link(date="weekend"), app_label="🔎 Open in the app", events=wk_events, today=today,
        intro=("Your Bay Area weekend, sorted: the next events happening Friday night through Sunday across San Francisco, "
               "the East Bay, the Peninsula and the South Bay."),
        empty_msg="No weekend events found yet — check back soon.",
        link_groups=[("This weekend by city", [(f"Events in {c}", f"/events/{slugs[c]}/") for c in top_wk_cities[:12]]),
                     ("Browse cities", [(f"Events in {c}", u) for c, u in city_links])],
        updated=updated, total=len(wk_events))))

    # hub
    hub_items = []
    for c in cities:
        s, n = slugs[c], len(by_city.get(c, []))
        extra = []
        if kid_pages[c]:
            extra.append(f'<a href="/kid-friendly/{s}/">kid-friendly</a>')
        if free_pages[c]:
            extra.append(f'<a href="/free-events/{s}/">free</a>')
        hub_items.append(f'<li class="hub-city"><a class="hub-name" href="/events/{s}/">{esc(c)}</a> <span class="hub-n">{n} events</span>'
                         + (f' <span class="hub-sub">· {" · ".join(extra)}</span>' if extra else "") + "</li>")
    hub_body = f"""
<body class="seo-page">
{hero('Bay Area events <span class="hl">by city</span>', f"{len(cities)} cities · {len(events)} upcoming events", [("BayBuzz", "/"), ("Events by city", None)], "/", "🔎 Open the app")}
  <main class="wrap seo-main" id="main">
    <p class="seo-intro">Pick a city to see its upcoming events, plus free and kid-friendly picks. Want the weekend? See <a href="/this-weekend/">things to do this weekend</a>.</p>
    <hr class="rainbow" aria-hidden="true">
    <ul class="hub-list">
      {chr(10).join(hub_items)}
    </ul>
  </main>
{footer([], updated)}"""
    pages.append(("/events/", head("Bay Area Events by City – Things to Do Near You | BayBuzz",
                                   f"Upcoming events in {len(cities)} Bay Area cities including San Francisco, Oakland, San Jose, "
                                   f"Walnut Creek, San Ramon, Pleasanton and Livermore. Free and kid-friendly picks.",
                                   "/events/", [{"@type": "BreadcrumbList", "itemListElement": [
                                       {"@type": "ListItem", "position": 1, "name": "BayBuzz", "item": SITE + "/"},
                                       {"@type": "ListItem", "position": 2, "name": "Events by city", "item": SITE + "/events/"}]}]) + hub_body))

    for path, doc in pages:
        out = ROOT / path.strip("/") / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(doc, encoding="utf-8")

    # sitemap (Cloudflare Pages serves folder/index.html at the trailing-slash URL; /advertise.html → /advertise)
    urls = [("/", "daily", "1.0"), ("/this-weekend/", "daily", "0.9"), ("/events/", "daily", "0.8")]
    urls += [(p, "daily", "0.8" if p.startswith("/events/") else "0.7") for p, _ in pages if p not in ("/this-weekend/", "/events/")]
    urls.append(("/advertise", "monthly", "0.5"))
    lastmod = today.isoformat()
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for p, freq, prio in urls:
        sm.append(f"  <url>\n    <loc>{esc(SITE + p)}</loc>\n    <lastmod>{lastmod}</lastmod>\n    <changefreq>{freq}</changefreq>\n    <priority>{prio}</priority>\n  </url>")
    sm.append("</urlset>\n")
    (ROOT / "sitemap.xml").write_text("\n".join(sm), encoding="utf-8")

    n_city = len(cities)
    print(f"SEO pages: {len(pages)} total — {n_city} city, {sum(kid_pages.values())} kid-friendly, "
          f"{sum(free_pages.values())} free, 1 this-weekend, 1 hub; sitemap {len(urls)} URLs; "
          f"{len(events)} upcoming events, {len(wk_events)} this weekend ({weekend_label}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
