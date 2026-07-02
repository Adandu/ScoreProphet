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

interface H2HRecord {
  pts: number
  gd: number
  gf: number
}

function emptyH2HRecord(): H2HRecord {
  return { pts: 0, gd: 0, gf: 0 }
}

function computeH2HRecord(team: string, tiedTeams: Set<string>, matches: GroupMatch[]): H2HRecord {
  const record = emptyH2HRecord()
  for (const match of matches) {
    if (match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) continue
    if (!tiedTeams.has(match.homeTeam) || !tiedTeams.has(match.awayTeam)) continue
    if (match.homeTeam !== team && match.awayTeam !== team) continue

    const isHome = match.homeTeam === team
    const goalsFor = isHome ? match.homeScore : match.awayScore
    const goalsAgainst = isHome ? match.awayScore : match.homeScore
    record.gf += goalsFor
    record.gd += goalsFor - goalsAgainst
    if (goalsFor > goalsAgainst) record.pts += 3
    else if (goalsFor === goalsAgainst) record.pts += 1
  }
  return record
}

function sortGroupRows(rows: StandingRow[], matches: GroupMatch[]) {
  // Pre-compute stable H2H mini-table ranks for tied groups of 3+ teams.
  // Aggregating all H2H matches per team and sorting by those totals avoids
  // non-transitive comparisons that arise from inline pairwise H2H in a comparator.
  const h2hRanks = new Map<string, number>()
  const byPts = new Map<number, StandingRow[]>()
  for (const row of rows) {
    const group = byPts.get(row.pts) ?? []
    group.push(row)
    byPts.set(row.pts, group)
  }
  for (const [, tied] of byPts) {
    if (tied.length < 3) continue
    const tiedTeams = new Set(tied.map((r) => r.team))
    const sorted = [...tied].sort((a, b) => {
      const h2hA = computeH2HRecord(a.team, tiedTeams, matches)
      const h2hB = computeH2HRecord(b.team, tiedTeams, matches)
      return h2hB.pts - h2hA.pts || h2hB.gd - h2hA.gd || h2hB.gf - h2hA.gf || a.team.localeCompare(b.team)
    })
    sorted.forEach((row, idx) => h2hRanks.set(row.team, idx))
  }

  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts

    const tiedTeams = new Set(rows.filter((row) => row.pts === a.pts).map((row) => row.team))
    if (tiedTeams.size >= 3) {
      // Use the stable pre-computed rank to avoid non-transitive inline H2H
      const rankDiff = (h2hRanks.get(a.team) ?? 0) - (h2hRanks.get(b.team) ?? 0)
      if (rankDiff !== 0) return rankDiff
    } else if (tiedTeams.size === 2 && tiedTeams.has(b.team)) {
      // Pairwise H2H is safe and transitive for exactly 2 teams
      const h2hA = computeH2HRecord(a.team, tiedTeams, matches)
      const h2hB = computeH2HRecord(b.team, tiedTeams, matches)
      if (h2hB.pts !== h2hA.pts) return h2hB.pts - h2hA.pts
      if (h2hB.gd !== h2hA.gd) return h2hB.gd - h2hA.gd
      if (h2hB.gf !== h2hA.gf) return h2hB.gf - h2hA.gf
    }

    return b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
  })
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
    sortGroupRows(rows, matches.filter((match) => match.group === group))
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
