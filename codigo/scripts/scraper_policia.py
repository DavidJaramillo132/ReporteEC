"""Prototype: fetch Policia Nacional news through the WordPress REST API.

The site noticias.policia.gob.ec runs WordPress, and its robots.txt allows
all crawling. WordPress exposes a public REST API, so no HTML scraping is
needed: posts come back as JSON with id, dates, title, excerpt and categories.

This prototype only validates feasibility. It fetches recent posts, maps the
site categories to ReporteEC incident types, extracts a naive place hint from
the title, and prints normalized records as JSON lines. It does not geocode
and does not write to any database.

Usage:
    python3 scraper_policia.py                  # posts from the last 24 hours
    python3 scraper_policia.py --hours 72
    python3 scraper_policia.py --since 2026-09-20T00:00:00
"""

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

BASE_URL = "https://noticias.policia.gob.ec/wp-json/wp/v2/posts"
USER_AGENT = "ReporteEC-prototype/0.1 (+research; low volume)"
PAGE_SIZE = 100
REQUEST_PAUSE_SECONDS = 1.0

# Site category id -> ReporteEC incident type. Ids verified 2026-09-22.
# Unmapped categories (community events, institutional news) yield type None
# and are discarded as non-incidents. Category 95 (sexual violence) is
# deliberately unmapped: that type is only loaded from official sources.
CATEGORY_TO_TYPE = {
    74: "asesinato",
    77: "tentativa_asesinato",
    87: "sicariato",
    81: "robo",
    257: "robo",
    7: "secuestro_extorsion",
    280: "extorsion",
    59: "trafico_armas",
    2: "drogas",
    268: "drogas",
    86: "delincuencia_organizada",
    71: "delincuencia_organizada",
}

# Titles often end with "... en <Place>" or "... en <Place>, <Province>".
PLACE_PATTERN = re.compile(
    r"\ben\s+(?:el\s+|la\s+)?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+)*"
    r"(?:,\s*[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+)*)?)\s*$"
)


def fetch_posts(since_iso):
    """Yield raw posts published after since_iso, following pagination."""
    page = 1
    while True:
        query = urllib.parse.urlencode({
            "per_page": PAGE_SIZE,
            "page": page,
            "after": since_iso,
            "orderby": "date",
            "order": "desc",
            "_fields": "id,date,modified,link,title,excerpt,categories",
        })
        request = urllib.request.Request(f"{BASE_URL}?{query}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=45) as response:
            total_pages = int(response.headers.get("X-WP-TotalPages", "1"))
            posts = json.load(response)
        yield from posts
        if page >= total_pages:
            return
        page += 1
        time.sleep(REQUEST_PAUSE_SECONDS)


def clean_text(rendered):
    text = re.sub(r"<[^>]+>", " ", html.unescape(rendered))
    return re.sub(r"\s+", " ", text).strip()


def classify(category_ids):
    for category_id in category_ids:
        incident_type = CATEGORY_TO_TYPE.get(category_id)
        if incident_type:
            return incident_type
    return None


def extract_place(title):
    match = PLACE_PATTERN.search(title)
    return match.group(1) if match else None


def normalize(post):
    title = clean_text(post["title"]["rendered"])
    return {
        "source": "policia_noticias",
        "source_id": post["id"],
        "source_url": post["link"],
        "published_at": post["date"],
        "title": title,
        "summary": clean_text(post["excerpt"]["rendered"])[:300],
        "incident_type": classify(post["categories"]),
        "place_hint": extract_place(title),
        "confidence_level": "reportado",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--hours", type=int, default=24)
    group.add_argument("--since")
    args = parser.parse_args()
    since = args.since or (datetime.now() - timedelta(hours=args.hours)).strftime("%Y-%m-%dT%H:%M:%S")

    kept = discarded = without_place = 0
    for post in fetch_posts(since):
        record = normalize(post)
        if record["incident_type"] is None:
            discarded += 1
            continue
        kept += 1
        without_place += record["place_hint"] is None
        print(json.dumps(record, ensure_ascii=False))

    print(
        f"# since={since} kept={kept} discarded_non_incident={discarded} "
        f"kept_without_place={without_place}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
