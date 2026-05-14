export interface GroupMatch {
  group: string | null
  status: string
  homeTeam: string
  awayTeam: string
  homeTeamCrest?: string
  awayTeamCrest?: string
  homeScore: number | null
  awayScore: number | null
}

export interface StandingRow {
  team: string
  crest: string
  played: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  advancing: boolean
}

export type GroupStandings = Record<string, StandingRow[]>

function emptyRow(team: string, crest = ''): StandingRow {
  return {
    team,
    crest,
    played: 0,
    w: 0,
    d: 0,
    l: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
    advancing: false,
  }
}

function compareRows(a: StandingRow, b: StandingRow): number {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
}

export function computeGroupStandings(matches: GroupMatch[]): GroupStandings {
  const groups: GroupStandings = {}
  const rowsByTeamByGroup: Record<string, Map<string, StandingRow>> = {}
  const finishedByGroup: Record<string, number> = {}
  const totalByGroup: Record<string, number> = {}

  for (const match of matches) {
    if (!match.group) continue

    if (!groups[match.group]) {
      groups[match.group] = []
      rowsByTeamByGroup[match.group] = new Map()
    }
    totalByGroup[match.group] = (totalByGroup[match.group] ?? 0) + 1

    const rowsByTeam = rowsByTeamByGroup[match.group]
    if (!rowsByTeam.has(match.homeTeam)) {
      const row = emptyRow(match.homeTeam, match.homeTeamCrest)
      groups[match.group].push(row)
      rowsByTeam.set(match.homeTeam, row)
    }
    if (!rowsByTeam.has(match.awayTeam)) {
      const row = emptyRow(match.awayTeam, match.awayTeamCrest)
      groups[match.group].push(row)
      rowsByTeam.set(match.awayTeam, row)
    }

    if (match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) continue

    finishedByGroup[match.group] = (finishedByGroup[match.group] ?? 0) + 1
    const home = rowsByTeam.get(match.homeTeam)!
    const away = rowsByTeam.get(match.awayTeam)!

    home.played += 1
    away.played += 1
    home.gf += match.homeScore
    home.ga += match.awayScore
    away.gf += match.awayScore
    away.ga += match.homeScore

    if (match.homeScore > match.awayScore) {
      home.w += 1
      away.l += 1
      home.pts += 3
    } else if (match.homeScore < match.awayScore) {
      away.w += 1
      home.l += 1
      away.pts += 3
    } else {
      home.d += 1
      away.d += 1
      home.pts += 1
      away.pts += 1
    }

    home.gd = home.gf - home.ga
    away.gd = away.gf - away.ga
  }

  for (const [group, rows] of Object.entries(groups)) {
    rows.sort(compareRows)
    const complete = totalByGroup[group] > 0 && totalByGroup[group] === finishedByGroup[group]
    if (complete) {
      rows.forEach((row, index) => {
        row.advancing = index < 2
      })
    }
  }

  const bestThirdPlace = getBest8ThirdPlace(groups)
  for (const row of bestThirdPlace) row.advancing = true

  return groups
}

export function getBest8ThirdPlace(groups: GroupStandings): StandingRow[] {
  const groupValues = Object.values(groups)
  if (groupValues.length < 12) return []
  if (groupValues.some((rows) => rows.length < 3 || rows.some((row) => row.played < 3))) return []

  return groupValues
    .map((rows) => rows[2])
    .filter(Boolean)
    .sort(compareRows)
    .slice(0, 8)
}
