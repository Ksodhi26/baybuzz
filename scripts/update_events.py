#!/usr/bin/env python3
"""
BayBuzz event updater.

Fetches upcoming Bay Area events from the Ticketmaster Discovery API (and any
iCal feeds listed in feeds.json), cleans them up, removes duplicates and past
events, and writes events.json for the website.

Usage:
    TICKETMASTER_API_KEY=xxxx python3 scripts/update_events.py

Safe by design: if there is no API key and no iCal feed, or if every source
fails, events.json is left exactly as it is.

Only needs the Python standard library plus `requests`.
"""
from __future__ import annotations

import hashlib
import html
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests

try:
    from zoneinfo import ZoneInfo
    PACIFIC = ZoneInfo("America/Los_Angeles")
except Exception:  # pragma: no cover - zoneinfo/tzdata missing
    PACIFIC = timezone(timedelta(hours=-8))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS_PATH = os.path.join(ROOT, "events.json")
FEEDS_PATH = os.path.join(ROOT, "feeds.json")
CURATED_PATH = os.path.join(ROOT, "curated_events.json")

TM_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
TM_LATLONG = "37.77,-122.27"     # Oakland-ish centre of the Bay
TM_RADIUS_MILES = 60
TM_PAGE_SIZE = 200               # Ticketmaster max page size
TM_MAX_PAGES = 5                 # API only allows paging through the first 1000 results
DAYS_AHEAD = 60
# Cities whose own calendars block bots (or that the 60-mile search under-covers because of the
# 1,000-result cap). We ask Ticketmaster for each one by name as well.
TM_EXTRA_CITIES = ["San Francisco", "Walnut Creek", "Pleasanton", "Livermore", "San Ramon"]
USER_AGENT = "BayBuzz-updater/1.0 (+static site)"

# Titles we don't want to list (add-ons rather than events).
SKIP_TITLE_RE = re.compile(r"\b(parking|upgrade|vip package|gift card|voucher|test event)\b", re.I)

BAY_AREA_CITIES = [
    "Alameda", "Albany", "American Canyon", "Antioch", "Atherton", "Belmont", "Belvedere", "Benicia",
    "Berkeley", "Brentwood", "Brisbane", "Burlingame", "Calistoga", "Campbell", "Clayton", "Concord",
    "Corte Madera", "Cupertino", "Daly City", "Danville", "Dixon", "Dublin", "East Palo Alto", "El Cerrito",
    "Emeryville", "Fairfax", "Fairfield", "Foster City", "Fremont", "Gilroy", "Half Moon Bay", "Hayward",
    "Healdsburg", "Hercules", "Hillsborough", "Lafayette", "Larkspur", "Livermore", "Los Altos",
    "Los Altos Hills", "Los Gatos", "Martinez", "Menlo Park", "Mill Valley", "Millbrae", "Milpitas",
    "Monte Sereno", "Moraga", "Morgan Hill", "Mountain View", "Napa", "Newark", "Novato", "Oakland",
    "Oakley", "Orinda", "Pacifica", "Palo Alto", "Petaluma", "Piedmont", "Pinole", "Pittsburg",
    "Pleasant Hill", "Pleasanton", "Portola Valley", "Redwood City", "Richmond", "Rohnert Park", "Ross",
    "San Anselmo", "San Bruno", "San Carlos", "San Francisco", "San Jose", "San Leandro", "San Mateo",
    "San Pablo", "San Rafael", "San Ramon", "Santa Clara", "Santa Rosa", "Saratoga", "Sausalito",
    "Sebastopol", "Sonoma", "South San Francisco", "St. Helena", "Suisun City", "Sunnyvale", "Tiburon",
    "Union City", "Vacaville", "Vallejo", "Walnut Creek", "Windsor", "Woodside", "Yountville",
    "Santa Cruz", "Castro Valley", "Alamo",
]
_CITY_BY_LOWER = {c.lower(): c for c in BAY_AREA_CITIES}


# --------------------------------------------------------------------------- helpers
def log(msg: str) -> None:
    print(f"[update_events] {msg}", flush=True)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """ISO string in Pacific time with offset, e.g. 2026-10-17T19:30:00-07:00"""
    return dt.astimezone(PACIFIC).replace(microsecond=0).isoformat()


def clean_text(s, limit: int = 400) -> str:
    if not s:
        return ""
    s = html.unescape(re.sub(r"<[^>]+>", " ", str(s)))
    if "√" in s or "¬" in s:  # repair mac-roman mojibake from some feeds
        try:
            s = s.encode("mac_roman").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    s = re.sub(r"\s+", " ", s).strip()
    return (s[: limit - 1].rstrip() + "…") if len(s) > limit else s


def normalize_city(raw: str | None, *extra_text: str) -> str:
    if raw:
        r = raw.strip()
        if r.lower() in _CITY_BY_LOWER:
            return _CITY_BY_LOWER[r.lower()]
        if r.upper() == "SF":
            return "San Francisco"
    # look for a known city name inside other text (e.g. an iCal LOCATION line)
    blob = " ".join([raw or ""] + [t or "" for t in extra_text]).lower()
    for c in sorted(BAY_AREA_CITIES, key=len, reverse=True):
        if re.search(r"\b" + re.escape(c.lower()) + r"\b", blob):
            return c
    return (raw or "").strip().title()


def make_id(*parts) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]


def parse_any_dt(s: str | None):
    """Parse ISO strings (or YYYY-MM-DD). Returns aware datetime or date or None."""
    if not s:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return date.fromisoformat(s)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=PACIFIC)


def event_end_utc(ev: dict) -> datetime | None:
    """When does this event finish? Used to drop past events."""
    end = parse_any_dt(ev.get("end")) or parse_any_dt(ev.get("start"))
    if end is None:
        return None
    if isinstance(end, datetime):
        if not ev.get("end"):
            end = end + timedelta(hours=3)
        return end.astimezone(timezone.utc)
    # all-day: end of that day in Pacific
    return datetime(end.year, end.month, end.day, 23, 59, tzinfo=PACIFIC).astimezone(timezone.utc)


# --------------------------------------------------------------------------- Ticketmaster
def map_tm_category(ev: dict) -> str:
    cls = (ev.get("classifications") or [{}])[0] or {}
    seg = ((cls.get("segment") or {}).get("name") or "").strip()
    genre = ((cls.get("genre") or {}).get("name") or "").strip()
    if cls.get("family") or genre.lower() == "family" or seg.lower() == "family":
        return "Family"
    if "comedy" in genre.lower():
        return "Comedy"
    if seg in ("Music", "Sports", "Arts & Theatre", "Film"):
        return seg
    if genre.lower() in ("fairs & festivals", "festival"):
        return "Festivals"
    if "food" in genre.lower():
        return "Food & Drink"
    if seg == "Miscellaneous":
        return "Community"
    return "Other"


def best_image(images: list) -> str:
    imgs = [i for i in (images or []) if i.get("url")]
    if not imgs:
        return ""
    wide = [i for i in imgs if i.get("ratio") == "16_9"] or imgs
    # pick a medium-size image (~640px) to keep the site fast
    wide.sort(key=lambda i: abs((i.get("width") or 0) - 640))
    return wide[0]["url"]


def normalize_tm(ev: dict) -> dict | None:
    title = clean_text(ev.get("name"), 200)
    if not title or SKIP_TITLE_RE.search(title):
        return None
    dates = ev.get("dates") or {}
    status = ((dates.get("status") or {}).get("code") or "").lower()
    if status in ("cancelled", "canceled", "postponed"):
        return None
    st = dates.get("start") or {}
    if st.get("dateTime"):
        start_dt = parse_any_dt(st["dateTime"])
        start = iso(start_dt) if isinstance(start_dt, datetime) else None
    elif st.get("localDate") and st.get("localTime") and not st.get("timeTBA"):
        start = iso(datetime.fromisoformat(f"{st['localDate']}T{st['localTime']}").replace(tzinfo=PACIFIC))
    elif st.get("localDate"):
        start = st["localDate"]  # all-day / time to be announced
    else:
        return None
    if not start:
        return None
    end = None
    en = dates.get("end") or {}
    if en.get("dateTime"):
        end_dt = parse_any_dt(en["dateTime"])
        if isinstance(end_dt, datetime):
            end = iso(end_dt)

    venue_obj = ((ev.get("_embedded") or {}).get("venues") or [{}])[0] or {}
    venue = clean_text(venue_obj.get("name"), 120)
    city = normalize_city((venue_obj.get("city") or {}).get("name"))

    pr = (ev.get("priceRanges") or [])
    price = None
    is_free = False
    if pr:
        mins = [p.get("min") for p in pr if p.get("min") is not None]
        maxs = [p.get("max") for p in pr if p.get("max") is not None]
        lo = min(mins) if mins else None
        hi = max(maxs) if maxs else None
        if lo is not None or hi is not None:
            price = {"min": round(lo, 2) if lo is not None else None,
                     "max": round(hi, 2) if hi is not None else None,
                     "currency": pr[0].get("currency", "USD")}
            is_free = (lo == 0 and (hi in (0, None)))
            if is_free:
                price = None

    description = clean_text(ev.get("info") or ev.get("pleaseNote") or ev.get("description"))
    return {
        "id": "tm-" + str(ev.get("id") or make_id(title, start, venue)),
        "title": title,
        "start": start,
        "end": end,
        "venue": venue,
        "city": city,
        "category": map_tm_category(ev),
        "price": price,
        "isFree": is_free,
        "url": ev.get("url") or "",
        "source": "Ticketmaster",
        "description": description,
        "image": best_image(ev.get("images")),
    }


def fetch_ticketmaster(api_key: str, city: str | None = None) -> list[dict] | None:
    """Returns a list of normalized events, or None if the fetch failed entirely.

    With `city`, searches that city by name instead of the 60-mile radius around the Bay centre."""
    start = now_utc().replace(microsecond=0)
    end = start + timedelta(days=DAYS_AHEAD)
    params = {
        "apikey": api_key,
        "size": TM_PAGE_SIZE,
        "sort": "date,asc",
        "startDateTime": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDateTime": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "locale": "*",
    }
    if city:
        params.update({"city": city, "stateCode": "CA", "countryCode": "US"})
    else:
        params.update({"latlong": TM_LATLONG, "radius": TM_RADIUS_MILES, "unit": "miles"})
    out: list[dict] = []
    got_any_page = False
    for page in range(TM_MAX_PAGES):
        params["page"] = page
        data = None
        for attempt in range(3):
            try:
                r = requests.get(TM_URL, params=params, timeout=30, headers={"User-Agent": USER_AGENT})
                if r.status_code == 429:          # rate limited – wait and retry
                    time.sleep(2 + attempt * 3)
                    continue
                if r.status_code in (401, 403):
                    log(f"Ticketmaster rejected the API key (HTTP {r.status_code}). Check the TICKETMASTER_API_KEY secret.")
                    return out if got_any_page else None
                r.raise_for_status()
                data = r.json()
                break
            except (requests.RequestException, ValueError) as e:
                log(f"Ticketmaster page {page} attempt {attempt + 1} failed: {e}")
                time.sleep(2)
        if data is None:
            break
        got_any_page = True
        items = ((data.get("_embedded") or {}).get("events")) or []
        for raw in items:
            n = normalize_tm(raw)
            if n:
                out.append(n)
        info = data.get("page") or {}
        total_pages = int(info.get("totalPages") or 0)
        log(f"Ticketmaster{' (' + city + ')' if city else ''} page {page + 1}/{max(total_pages, 1)}: {len(items)} events")
        if page + 1 >= total_pages or not items or (page + 2) * TM_PAGE_SIZE > 1000:
            break
        time.sleep(0.3)  # be polite: well under the 5 requests/second limit
    return out if got_any_page else None


# --------------------------------------------------------------------------- iCal
def _unfold(text: str) -> list[str]:
    lines: list[str] = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if line[:1] in (" ", "\t") and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def _ical_unescape(v: str) -> str:
    return (v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",")
             .replace("\\;", ";").replace("\\\\", "\\"))


def _parse_ical_dt(value: str, params: dict):
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        return date(int(value[:4]), int(value[4:6]), int(value[6:8]))
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)", value)
    if not m:
        return None
    y, mo, d, h, mi, s, z = m.groups()
    dt = datetime(int(y), int(mo), int(d), int(h), int(mi), int(s or 0))
    if z:
        return dt.replace(tzinfo=timezone.utc)
    tzid = params.get("TZID")
    tz = PACIFIC
    if tzid:
        try:
            tz = ZoneInfo(tzid.strip('"'))
        except Exception:
            tz = PACIFIC
    return dt.replace(tzinfo=tz)


def parse_ical(text: str) -> list[dict]:
    """Very small iCal parser: returns raw VEVENT dicts with parsed dates.
    Note: recurring events (RRULE) are only listed on their first date."""
    events, cur = [], None
    for line in _unfold(text):
        if not line.strip():
            continue
        if line == "BEGIN:VEVENT":
            cur = {}
            continue
        if line == "END:VEVENT":
            if cur is not None:
                events.append(cur)
            cur = None
            continue
        if cur is None or ":" not in line:
            continue
        head, value = line.split(":", 1)
        name, *pparts = head.split(";")
        params = {}
        for p in pparts:
            if "=" in p:
                k, v = p.split("=", 1)
                params[k.upper()] = v
        name = name.upper()
        if name in ("DTSTART", "DTEND"):
            cur[name] = _parse_ical_dt(value, params)
        elif name in ("SUMMARY", "LOCATION", "DESCRIPTION", "URL", "UID", "STATUS", "CATEGORIES"):
            cur[name] = _ical_unescape(value)
    return events


def _dt_to_field(v):
    if isinstance(v, datetime):
        return iso(v)
    if isinstance(v, date):
        return v.isoformat()
    return None


# --------------------------------------------------------------------------- RSS
# Two public RSS dialects are understood:
#   * BiblioCommons "BiblioEvents" feeds   (https://<library>.bibliocommons.com/events/rss/all)
#   * CivicPlus city calendars             (https://<city>/RSSFeed.aspx?ModID=58&CID=All-calendar.xml)
BC_NS = "{http://bibliocommons.com/rss/1.0/modules/event/}"
FAMILY_AUDIENCES = {"kids", "families", "babies", "toddlers", "preschoolers", "grade schoolers", "tweens",
                    "children", "family", "teens"}


def _txt(el, tag):
    child = el.find(tag)
    return (child.text or "").strip() if child is not None and child.text else ""


def _bc_category(item) -> str | None:
    types = {(c.text or "").strip().lower() for c in item.findall("category") if c.get("domain") == "Type"}
    aud = {(c.text or "").strip().lower() for c in item.findall("category") if c.get("domain") == "Audience"}
    if "storytime" in types or (aud & FAMILY_AUDIENCES and not (aud & {"adults", "seniors"})):
        return "Family"
    if types & {"film", "movies", "movie"}:
        return "Film"
    if types & {"art at the library", "arts & crafts", "music", "performance"}:
        return "Arts & Theatre"
    if types & {"outdoor", "outdoors"}:
        return "Outdoors"
    return None


def parse_bibliocommons_rss(root, library: str) -> list[dict]:
    out = []
    for item in root.iter("item"):
        if _txt(item, BC_NS + "is_cancelled").lower() == "true":
            continue
        start = parse_any_dt(_txt(item, BC_NS + "start_date"))
        if not isinstance(start, datetime):
            continue
        end = parse_any_dt(_txt(item, BC_NS + "end_date"))
        loc = item.find(BC_NS + "location")
        branch = _txt(loc, BC_NS + "name") if loc is not None else ""
        city = _txt(loc, BC_NS + "city") if loc is not None else ""
        street = " ".join(x for x in (_txt(loc, BC_NS + "number"), _txt(loc, BC_NS + "street")) if x) if loc is not None else ""
        virtual = _txt(item, BC_NS + "is_virtual").lower() == "true"
        if virtual:
            venue = "Online event"
        elif branch:
            venue = branch if "library" in branch.lower() else f"{branch} Library"
        else:
            venue = library
        enc = item.find("enclosure")
        desc = clean_text(_txt(item, "description"))
        if street and not virtual:
            desc = (f"{street}, {city}. " if city else f"{street}. ") + desc
        out.append({
            "SUMMARY": _txt(item, "title"),
            "DTSTART": start,
            "DTEND": end if isinstance(end, datetime) else None,
            "DESCRIPTION": desc,
            "URL": _txt(item, "link"),
            "UID": _txt(item, "guid") or _txt(item, "link"),
            "_venue": venue,
            "_city": normalize_city(city) if city else "",
            "_category": _bc_category(item),
            "_image": enc.get("url", "").replace("http://", "https://") if enc is not None else "",
        })
    return out


_CP_DATE_RE = re.compile(r"([A-Z][a-z]+ \d{1,2}, \d{4})")
_CP_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})\s*([AP]M)", re.I)


def _cp_date(s: str):
    try:
        return datetime.strptime(s, "%B %d, %Y").date()
    except ValueError:
        return None


def _cp_time(m):
    h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3).upper()
    h = h % 12 + (12 if ap == "PM" else 0)
    return h, mi


def parse_civicplus_rss(root) -> list[dict]:
    out = []
    for item in root.iter("item"):
        dates = [d for d in (_cp_date(x) for x in _CP_DATE_RE.findall(_txt_ns(item, "EventDates"))) if d]
        if not dates:
            continue
        times = _CP_TIME_RE.findall(_txt_ns(item, "EventTimes"))
        d0, d1 = dates[0], dates[-1]
        if times:
            h, mi = _cp_time(_CP_TIME_RE.search(_txt_ns(item, "EventTimes")))
            start = datetime(d0.year, d0.month, d0.day, h, mi, tzinfo=PACIFIC)
            end = None
            if len(times) > 1:
                m2 = list(_CP_TIME_RE.finditer(_txt_ns(item, "EventTimes")))[-1]
                h2, mi2 = _cp_time(m2)
                end = datetime(d1.year, d1.month, d1.day, h2, mi2, tzinfo=PACIFIC)
        else:
            start, end = d0, (d1 + timedelta(days=1) if d1 != d0 else None)   # all-day; DTEND exclusive
        raw_desc = _txt(item, "description")
        loc_html = re.search(r"Location:</strong>\s*(?:<br\s*/?>)?(.*?)(?:<br\s*/?><strong>|$)", raw_desc, re.S | re.I)
        location = clean_text(re.sub(r"<br\s*/?>", ", ", loc_html.group(1)) if loc_html else _txt_ns(item, "Location"), 200)
        body = re.search(r"Description:</strong>(.*)$", raw_desc, re.S | re.I)
        title = _txt(item, "title")
        out.append({
            "SUMMARY": title,
            "DTSTART": start,
            "DTEND": end,
            "LOCATION": location.strip(", "),
            "DESCRIPTION": body.group(1) if body else "",
            "URL": _txt(item, "link"),
            "UID": _txt(item, "link"),
        })
    return out


def _txt_ns(item, local):
    for child in item:
        if child.tag.endswith("}" + local):
            return (child.text or "").strip()
    return ""


def parse_rss(text: str, fmt: str | None, feed: dict) -> list[dict]:
    import xml.etree.ElementTree as ET
    root = ET.fromstring(text.encode("utf-8") if isinstance(text, str) else text)
    if fmt == "bibliocommons" or "bibliocommons.com/rss" in text[:600]:
        title = _txt(root.find("channel"), "title") if root.find("channel") is not None else ""
        library = title.split("|", 1)[-1].strip() or feed.get("name", "")
        return parse_bibliocommons_rss(root, library)
    return parse_civicplus_rss(root)


def fetch_ical_feeds(feeds: list[dict]) -> list[dict] | None:
    out: list[dict] = []
    any_ok = False
    horizon = now_utc() + timedelta(days=DAYS_AHEAD)
    for feed in feeds:
        url = (feed or {}).get("url")
        if not url:
            continue
        name = feed.get("name") or re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
        feed_horizon = now_utc() + timedelta(days=int(feed.get("max_days") or DAYS_AHEAD))
        try:
            r = requests.get(url, timeout=60, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            if r.text.lstrip()[:5] == "<?xml" or "<rss" in r.text[:500]:
                raw_events = parse_rss(r.text, feed.get("format"), feed)
            else:
                raw_events = parse_ical(r.text)
            any_ok = True
        except Exception as e:  # noqa: BLE001 - one bad feed shouldn't stop the rest
            log(f"iCal feed '{name}' failed: {e}")
            continue
        count = 0
        for ve in raw_events:
            title = clean_text(ve.get("SUMMARY"), 200)
            start = ve.get("DTSTART")
            if not title or start is None or (ve.get("STATUS", "").upper() == "CANCELLED"):
                continue
            start_cmp = start if isinstance(start, datetime) else datetime(start.year, start.month, start.day, tzinfo=PACIFIC)
            if start_cmp > feed_horizon:
                continue
            end = ve.get("DTEND")
            if isinstance(end, date) and not isinstance(end, datetime):
                end = end - timedelta(days=1)  # iCal all-day DTEND is exclusive
                if isinstance(start, date) and not isinstance(start, datetime) and end <= start:
                    end = None
            location = clean_text(ve.get("LOCATION"), 200)
            venue = ve.get("_venue") or (location.split(",")[0].strip() if location else "")
            desc = clean_text(ve.get("DESCRIPTION"))
            text_blob = (title + " " + desc).lower()
            out.append({
                "id": "ics-" + make_id(url, ve.get("UID") or title, _dt_to_field(start)),
                "title": title,
                "start": _dt_to_field(start),
                "end": _dt_to_field(end),
                "venue": venue,
                "city": ve.get("_city") or normalize_city(None, location) or feed.get("city", ""),
                "category": ve.get("_category") or feed.get("category") or "Community",
                "price": None,
                "isFree": bool(feed.get("free")) or bool(re.search(r"\bfree\b", text_blob)),
                "url": ve.get("URL") or feed.get("homepage") or url,
                "source": name,
                "sourceUrl": feed.get("homepage") or url,
                "description": desc,
                "image": ve.get("_image", ""),
            })
            if not out[-1]["city"]:
                out[-1]["city"] = feed.get("city", "")
            count += 1
        log(f"iCal feed '{name}': {count} events")
    return out if any_ok else None


def load_feeds() -> list[dict]:
    try:
        with open(FEEDS_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        return []
    except ValueError as e:
        log(f"feeds.json is not valid JSON ({e}); ignoring it.")
        return []
    feeds = cfg.get("feeds", []) if isinstance(cfg, dict) else cfg
    return [f for f in feeds if isinstance(f, dict) and f.get("url")]



# --------------------------------------------------------------------------- curated events
def load_curated() -> list[dict]:
    """Hand-checked events (curated_events.json) for cities whose calendars block bots.

    Each entry needs title, start and url. Missing optional fields are filled in with
    safe defaults, and anything malformed is skipped with a log line rather than
    breaking the whole update."""
    try:
        with open(CURATED_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        return []
    except ValueError as e:
        log(f"curated_events.json is not valid JSON ({e}); ignoring it.")
        return []
    raw = cfg.get("events", []) if isinstance(cfg, dict) else cfg
    out: list[dict] = []
    for i, ev in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(ev, dict):
            continue
        title = clean_text(ev.get("title"), 200)
        start = ev.get("start")
        if not title or not start or parse_any_dt(str(start)) is None:
            log(f"curated_events.json entry #{i + 1} skipped (needs a title and a valid start).")
            continue
        end = ev.get("end")
        if end and parse_any_dt(str(end)) is None:
            end = None
        city = normalize_city(ev.get("city"), ev.get("venue") or "")
        out.append({
            "id": ev.get("id") or "cur-" + make_id(title, start, ev.get("venue", "")),
            "title": title,
            "start": str(start),
            "end": str(end) if end else None,
            "venue": clean_text(ev.get("venue"), 120),
            "city": city,
            "category": ev.get("category") or "Other",
            "price": ev.get("price"),
            "isFree": bool(ev.get("isFree")),
            "url": ev.get("url") or "",
            "source": ev.get("source") or "Curated",
            "description": clean_text(ev.get("description")),
            "image": ev.get("image") or "",
        })
    return out

# --------------------------------------------------------------------------- merge + write
def dedupe(events: list[dict]) -> list[dict]:
    seen_ids, seen_keys, out = set(), set(), []
    for ev in events:
        key = (re.sub(r"[^a-z0-9]", "", ev["title"].lower())[:60],
               str(ev["start"])[:16],
               re.sub(r"[^a-z0-9]", "", (ev.get("venue") or "").lower())[:30])
        if ev["id"] in seen_ids or key in seen_keys:
            continue
        seen_ids.add(ev["id"])
        seen_keys.add(key)
        out.append(ev)
    return out


def sort_key(ev: dict):
    s = parse_any_dt(ev["start"])
    if isinstance(s, datetime):
        return s.astimezone(timezone.utc)
    return datetime(s.year, s.month, s.day, tzinfo=PACIFIC).astimezone(timezone.utc)


def main() -> int:
    api_key = os.environ.get("TICKETMASTER_API_KEY", "").strip()
    feeds = load_feeds()

    curated = load_curated()

    if not api_key and not feeds and not curated:
        log("No TICKETMASTER_API_KEY set, no iCal feeds and no curated events – leaving events.json unchanged.")
        return 0

    collected: list[dict] = []
    sources: list[dict] = []
    ok = False

    if api_key:
        tm = fetch_ticketmaster(api_key)
        if tm is not None:
            ok = True
            collected += tm
            sources.append({"name": "Ticketmaster", "url": "https://www.ticketmaster.com/"})
            log(f"Ticketmaster: {len(tm)} usable events")
            for extra_city in TM_EXTRA_CITIES:
                extra = fetch_ticketmaster(api_key, city=extra_city)
                if extra:
                    collected += extra   # duplicates of the main search are removed by dedupe()
                    log(f"Ticketmaster ({extra_city}): {len(extra)} usable events")
    else:
        log("No TICKETMASTER_API_KEY set – skipping Ticketmaster.")

    if feeds:
        ics = fetch_ical_feeds(feeds)
        if ics is not None:
            ok = True
            collected += ics
            for name in sorted({e["source"] for e in ics}):
                url = next((e.get("sourceUrl") for e in ics if e["source"] == name), "")
                sources.append({"name": name, "url": url})

    if curated:
        ok = True
        collected += curated
        # One footer credit for the whole file; each event still names its own source and links to it.
        sources.append({"name": "Local organizers' own event pages (curated)", "url": ""})
        log(f"Curated: {len(curated)} events from curated_events.json")

    if not ok:
        log("All sources failed – leaving events.json unchanged.")
        return 0

    now = now_utc()
    upcoming = [e for e in collected if (event_end_utc(e) or now) >= now]
    events = dedupe(sorted(upcoming, key=sort_key))
    for e in events:
        e.pop("sourceUrl", None)

    if not events:
        log("Sources answered but returned 0 upcoming events – leaving events.json unchanged to avoid an empty site.")
        return 0

    payload = {
        "lastUpdated": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sources": sources,
        "events": events,
    }
    tmp = EVENTS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, EVENTS_PATH)
    log(f"Wrote {len(events)} events to events.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
