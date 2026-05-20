#!/usr/bin/env python3
"""
Fetch H2H (World Cup only) from thesoccerworldcups.com for all WC 2026 matches.
Resumes automatically — skips matches already synced.

Usage:
  python3 scripts/fetch_h2h_soccerworldcups.py
  python3 scripts/fetch_h2h_soccerworldcups.py --dry-run
"""

import sqlite3
import json
import time
import re
import gzip
import sys
import urllib.request
import urllib.error

DB_PATH = "/mnt/sdc/docker/scoreprophet/scoreprophet.db"
BASE_URL = "https://www.thesoccerworldcups.com/head_to_head/{team1}_vs_{team2}.php"
DRY_RUN = "--dry-run" in sys.argv

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
}

# Map DB team names → site URL slugs
SLUGS: dict[str, str] = {
    "Algeria":            "algeria",
    "Argentina":          "argentina",
    "Australia":          "australia",
    "Austria":            "austria",
    "Belgium":            "belgium",
    "Bosnia-Herzegovina": "bosnia_and_herzegovina",
    "Brazil":             "brazil",
    "Canada":             "canada",
    "Cape Verde Islands": "cape_verde",
    "Colombia":           "colombia",
    "Congo DR":           "rd_congo",
    "Croatia":            "croatia",
    "Curaçao":            "curacao",
    "Czechia":            "czech_republic",
    "Ecuador":            "ecuador",
    "Egypt":              "egypt",
    "England":            "england",
    "France":             "france",
    "Germany":            "germany",
    "Ghana":              "ghana",
    "Haiti":              "haiti",
    "Iran":               "iran",
    "Iraq":               "iraq",
    "Ivory Coast":        "ivory_coast",
    "Japan":              "japan",
    "Jordan":             "jordan",
    "Mexico":             "mexico",
    "Morocco":            "morocco",
    "Netherlands":        "holland",
    "New Zealand":        "new_zealand",
    "Norway":             "norway",
    "Panama":             "panama",
    "Paraguay":           "paraguay",
    "Portugal":           "portugal",
    "Qatar":              "qatar",
    "Saudi Arabia":       "saudi_arabia",
    "Scotland":           "scotland",
    "Senegal":            "senegal",
    "South Africa":       "south_africa",
    "South Korea":        "south_korea",
    "Spain":              "spain",
    "Sweden":             "sweden",
    "Switzerland":        "switzerland",
    "Tunisia":            "tunisia",
    "Turkey":             "turkey",
    "United States":      "usa",
    "Uruguay":            "uruguay",
    "Uzbekistan":         "uzbekistan",
}

MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
}


def fetch_html(url: str) -> str | None:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            if r.headers.get('Content-Encoding') == 'gzip':
                raw = gzip.decompress(raw)
            return raw.decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def parse_date(raw: str) -> str:
    parts = raw.replace(',', '').split()
    month = MONTHS.get(parts[0].lower(), 1)
    day = int(parts[1])
    year = int(parts[2])
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_h2h(html: str, home_name: str, away_name: str) -> list[dict]:
    date_pat = re.compile(
        r'<div class="left wpx-100 a-left">(\w+ \d+, \d{4})</div>'
        r'<div class="left a-left wpx-170">(.*?)</div>',
        re.DOTALL,
    )
    score_pat = re.compile(r"games/([^']+)\.php'>(\d+)\s*-\s*(\d+)</a>")

    dates = list(date_pat.finditer(html))
    scores = list(score_pat.finditer(html))

    matches = []
    for d, s in zip(dates, scores):
        utc_date = parse_date(d.group(1))
        game_slug = s.group(1)
        home_score = int(s.group(2))
        away_score = int(s.group(3))
        matches.append({
            'id': game_slug,
            'utcDate': utc_date,
            'homeTeam': home_name,
            'awayTeam': away_name,
            'homeScore': home_score,
            'awayScore': away_score,
        })
    return matches


def main() -> None:
    db = sqlite3.connect(DB_PATH)
    cur = db.cursor()

    cur.execute("""
        SELECT id, homeTeam, awayTeam FROM Match
        WHERE headToHeadSyncedAt IS NULL AND homeTeam != 'TBD' AND awayTeam != 'TBD'
        ORDER BY id
    """)
    matches = cur.fetchall()
    print(f"Matches to process: {len(matches)}")

    if DRY_RUN:
        print("\n--- DRY RUN: checking slug coverage ---")
        missing = []
        for _, home, away in matches:
            for team in (home, away):
                if team not in SLUGS:
                    missing.append(team)
        if missing:
            print("Teams missing from SLUGS:")
            for t in sorted(set(missing)):
                print(f"  {t}")
        else:
            print("All teams covered.")
        db.close()
        return

    done = 0
    for match_id, home_team, away_team in matches:
        home_slug = SLUGS.get(home_team)
        away_slug = SLUGS.get(away_team)

        if not home_slug or not away_slug:
            missing = [t for t, s in [(home_team, home_slug), (away_team, away_slug)] if not s]
            print(f"  SKIP {home_team} vs {away_team} — no slug for: {missing}")
            cur.execute(
                "UPDATE Match SET headToHeadJson='[]', headToHeadSyncedAt='SKIPPED' WHERE id=?",
                (match_id,)
            )
            db.commit()
            continue

        url = BASE_URL.format(team1=home_slug, team2=away_slug)
        print(f"  {home_team} vs {away_team}...", end=" ", flush=True)

        html = fetch_html(url)
        time.sleep(1.5)

        if html is None:
            print("404 — trying reversed order...")
            url_rev = BASE_URL.format(team1=away_slug, team2=home_slug)
            html = fetch_html(url_rev)
            time.sleep(1.5)

        if html is None:
            print("404 both orders — marking NO_SLUG")
            cur.execute(
                "UPDATE Match SET headToHeadJson='[]', headToHeadSyncedAt='NO_SLUG' WHERE id=?",
                (match_id,)
            )
            db.commit()
            continue

        h2h = parse_h2h(html, home_team, away_team)

        if h2h:
            cur.execute(
                "UPDATE Match SET headToHeadJson=?, headToHeadSyncedAt='2099-01-01T00:00:00.000Z' WHERE id=?",
                (json.dumps(h2h), match_id)
            )
        else:
            cur.execute(
                "UPDATE Match SET headToHeadJson='[]', headToHeadSyncedAt='NO_DATA' WHERE id=?",
                (match_id,)
            )

        db.commit()
        print(f"{len(h2h)} WC matches")
        done += 1

    db.close()
    remaining = len(matches) - done
    print(f"\nDone. Processed {done} matches. {remaining} remaining.")


if __name__ == "__main__":
    main()
