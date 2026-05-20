#!/usr/bin/env python3
"""
Fetch World Cup stats from thesoccerworldcups.com for all teams in the DB.
Stores: WC appearances, all-time standing, titles, runner-up years, W/D/L, goals.

Usage:
  python3 scripts/fetch_wc_stats_soccerworldcups.py
  python3 scripts/fetch_wc_stats_soccerworldcups.py --force   # re-fetch all
"""

import sqlite3
import json
import re
import gzip
import sys
import time
import urllib.request
import urllib.error

DB_PATH = "/mnt/sdc/docker/scoreprophet/scoreprophet.db"
BASE_URL = "https://www.thesoccerworldcups.com/national_teams/{slug}_national_team.php"
FORCE = "--force" in sys.argv

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

# DB team name → site slug (same mapping as H2H script)
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


def strip_tags(s: str) -> str:
    return re.sub(r'<[^>]+>', '', s).strip()


def parse_wc_stats(html: str) -> dict:
    stats: dict = {}

    # WC appearances: <span class="size-11">23</span>
    m = re.search(r'<span class="size-11">(\d+)</span>', html)
    stats['worldCupsPlayed'] = int(m.group(1)) if m else 0

    # All-time standing: <td>All-Time Standing</td> then <td class="pad-8">1<br>
    m = re.search(r'All-Time Standing.*?<td class="pad-8">(\d+)', html, re.DOTALL)
    stats['allTimeStanding'] = int(m.group(1)) if m else None

    # Champion + Runner-up: find the header row then extract both data cells
    champ_block = re.search(
        r'<td>Champion</td>\s*<td>Runner-up</td>.*?'
        r'<tr[^>]*>.*?<td>(.*?)</td>\s*<td[^>]*>(\d+)<br>(.*?)</td>',
        html, re.DOTALL
    )
    if champ_block:
        champ_cell = champ_block.group(1)
        runner_cell = champ_block.group(3)
        # Titles: only year links preceded by a trophy image within the champion cell
        titles = re.findall(r"world_cup_trophy[^>]+>.*?/(\d{4})_world_cup\.php", champ_cell, re.DOTALL)
        stats['titles'] = sorted(set(int(y) for y in titles))
        stats['runnerUp'] = sorted(set(
            int(y) for y in re.findall(r'/(\d{4})_world_cup\.php', runner_cell)
        ))
    else:
        stats['titles'] = []
        stats['runnerUp'] = []

    # Games: Games Played / Wins / Draw / Losses table
    games_section = re.search(
        r'Games Played.*?<tr class="a-top pad-8">(.*?)</tr>', html, re.DOTALL
    )
    if games_section:
        tds = re.findall(r'<td>(.*?)</td>', games_section.group(1), re.DOTALL)
        def first_num(s: str) -> int:
            m2 = re.search(r'\d+', strip_tags(s))
            return int(m2.group()) if m2 else 0
        if len(tds) >= 4:
            stats['gamesPlayed'] = first_num(tds[0])
            stats['wins']        = first_num(tds[1])
            stats['draws']       = first_num(tds[2])
            stats['losses']      = first_num(tds[3])

    # Goals: first Goals table (totals, not averages)
    goals_section = re.search(
        r'Goals Scored.*?Goals against.*?Goal Difference.*?<tr>\s*<td class="pad-8">(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>',
        html, re.DOTALL
    )
    if goals_section:
        def parse_num(s: str):
            raw = strip_tags(s).replace('+', '')
            try: return int(raw)
            except: return None
        stats['goalsScored']    = parse_num(goals_section.group(1))
        stats['goalsConceded']  = parse_num(goals_section.group(2))
        diff_raw = strip_tags(goals_section.group(3))
        stats['goalDifference'] = diff_raw if diff_raw else None

    return stats


def main() -> None:
    db = sqlite3.connect(DB_PATH)
    cur = db.cursor()

    if FORCE:
        cur.execute("SELECT id, name FROM Team ORDER BY name")
    else:
        cur.execute("SELECT id, name FROM Team WHERE wcStatsJson='{}' OR wcStatsJson IS NULL ORDER BY name")

    teams = cur.fetchall()
    print(f"Teams to process: {len(teams)}")

    done = 0
    for team_id, name in teams:
        slug = SLUGS.get(name)
        if not slug:
            print(f"  SKIP {name} — no slug mapping")
            continue

        url = BASE_URL.format(slug=slug)
        print(f"  {name}...", end=" ", flush=True)

        html = fetch_html(url)
        time.sleep(1.2)

        if html is None:
            print("404")
            continue

        stats = parse_wc_stats(html)
        cur.execute("UPDATE Team SET wcStatsJson=? WHERE id=?", (json.dumps(stats), team_id))
        db.commit()

        titles = len(stats.get('titles', []))
        played = stats.get('gamesPlayed', 0)
        print(f"{stats.get('worldCupsPlayed', 0)} WCs, {titles} titles, {played} games")
        done += 1

    db.close()
    print(f"\nDone. {done}/{len(teams)} teams processed.")


if __name__ == "__main__":
    main()
