import { unstable_cache } from 'next/cache'
import { prisma } from './db'

export type TeamRef = {
  externalId: string
  name: string
  crest: string
}

type TeamWithSquad = TeamRef & {
  squadJson: string
}

export type StatEvent = {
  type: string
  minute: number
  teamName: string
  playerName: string
  relatedPlayerName: string
  match: {
    homeTeam: string
    awayTeam: string
    homeScore: number | null
    awayScore: number | null
  }
}

type SquadPerson = {
  name?: string
  firstName?: string
  lastName?: string
  dateOfBirth?: string
  position?: string
}

type FinishedMatchScore = {
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  fullTimeHomeScore: number | null
  fullTimeAwayScore: number | null
}

export type CountResult = { key: string; count: number }

type PlayerAge = { name: string; dateOfBirth: string; teamName: string }

export type TournamentStatistics = {
  totalGoals: number
  completedMatches: number
  cleanSheets: number
  topScorer: CountResult | null
  topAssist: CountResult | null
  fastestGoal: StatEvent | null
  mostGoalsTeam: { teamName: string; goalsFor: number } | null
  leastGoalsAgainstTeam: { teamName: string; goalsAgainst: number } | null
  mostGoalsMatch: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null
  yellowCount: number
  fastestYellow: StatEvent | null
  redCount: number
  fastestRed: StatEvent | null
  foulsTotal: number
  fastestFoul: StatEvent | null
  cornersTotal: number
  fastestCorner: StatEvent | null
  youngestPlayer: PlayerAge | null
  oldestPlayer: PlayerAge | null
  teams: TeamRef[]
}

type ComputeInput = {
  matches: FinishedMatchScore[]
  events: StatEvent[]
  teamStats: { type: string; value: number }[]
  teams: TeamWithSquad[]
}

const MIN_PLAYER_AGE = 15
const MAX_PLAYER_AGE = 60

export function computeTournamentStatistics({ matches, events, teamStats, teams }: ComputeInput): TournamentStatistics {
  const displayMatches = matches.map(toDisplayMatchScore)
  const totalGoals = displayMatches.reduce((sum, match) => sum + (match.homeScore ?? 0) + (match.awayScore ?? 0), 0)
  const completedMatches = displayMatches.length
  const teamTotals = getTeamTotals(displayMatches)
  const mostGoalsTeam = [...teamTotals.values()].sort((a, b) => b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName))[0]
  const leastGoalsAgainstTeam = [...teamTotals.values()]
    .filter((team) => team.played > 0)
    .sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.teamName.localeCompare(b.teamName))[0]
  const topScorer = topCount(events.filter((event) => event.type === 'GOAL' && event.playerName), (event) => `${event.playerName}|||${event.teamName}`)
  const topAssist = topCount(events.filter((event) => event.type === 'GOAL' && event.relatedPlayerName), (event) => `${event.relatedPlayerName}|||${event.teamName}`)
  const fastestGoal = fastest(events, 'GOAL')
  const yellowCards = events.filter((event) => event.type === 'YELLOW_CARD' || event.type === 'YELLOW_RED_CARD')
  const redCards = events.filter((event) => event.type === 'RED_CARD' || event.type === 'YELLOW_RED_CARD')
  const foulsTotal = getStatTotal(teamStats, 'FOULS', events, 'FOUL')
  const cornersTotal = getStatTotal(teamStats, 'CORNERS', events, 'CORNER')
  const mostGoalsMatch = displayMatches
    .filter((match) => match.homeScore !== null && match.awayScore !== null)
    .sort((a, b) => (b.homeScore! + b.awayScore!) - (a.homeScore! + a.awayScore!))[0]
  const cleanSheets = countCleanSheets(displayMatches)
  const youngestPlayer = getAgeExtreme(teams, 'youngest')
  const oldestPlayer = getAgeExtreme(teams, 'oldest')

  return {
    totalGoals,
    completedMatches,
    cleanSheets,
    topScorer: topScorer ?? null,
    topAssist: topAssist ?? null,
    fastestGoal: fastestGoal ?? null,
    mostGoalsTeam: mostGoalsTeam ? { teamName: mostGoalsTeam.teamName, goalsFor: mostGoalsTeam.goalsFor } : null,
    leastGoalsAgainstTeam: leastGoalsAgainstTeam ? { teamName: leastGoalsAgainstTeam.teamName, goalsAgainst: leastGoalsAgainstTeam.goalsAgainst } : null,
    mostGoalsMatch: mostGoalsMatch && mostGoalsMatch.homeScore !== null && mostGoalsMatch.awayScore !== null
      ? { homeTeam: mostGoalsMatch.homeTeam, awayTeam: mostGoalsMatch.awayTeam, homeScore: mostGoalsMatch.homeScore, awayScore: mostGoalsMatch.awayScore }
      : null,
    yellowCount: yellowCards.length,
    fastestYellow: fastestAny(yellowCards, ['YELLOW_CARD', 'YELLOW_RED_CARD']) ?? null,
    redCount: redCards.length,
    fastestRed: fastestAny(redCards, ['RED_CARD', 'YELLOW_RED_CARD']) ?? null,
    foulsTotal,
    fastestFoul: fastest(events, 'FOUL') ?? null,
    cornersTotal,
    fastestCorner: fastest(events, 'CORNER') ?? null,
    youngestPlayer: youngestPlayer ?? null,
    oldestPlayer: oldestPlayer ?? null,
    teams: teams.map((team) => ({ externalId: team.externalId, name: team.name, crest: team.crest })),
  }
}

// Cached across requests so the heavy aggregation is not recomputed on every
// /tournament view. Stats may lag live data by up to the revalidate window.
export const getTournamentStatistics = unstable_cache(
  async (): Promise<TournamentStatistics> => {
    const [matches, events, teamStats, teams] = await Promise.all([
      prisma.match.findMany({
        where: { status: 'FINISHED' },
        orderBy: { kickoff: 'asc' },
        select: {
          homeTeam: true,
          awayTeam: true,
          homeScore: true,
          awayScore: true,
          fullTimeHomeScore: true,
          fullTimeAwayScore: true,
        },
      }),
      prisma.matchEvent.findMany({
        select: {
          type: true,
          minute: true,
          teamName: true,
          playerName: true,
          relatedPlayerName: true,
          match: {
            select: {
              homeTeam: true,
              awayTeam: true,
              homeScore: true,
              awayScore: true,
            },
          },
        },
        orderBy: [{ minute: 'asc' }, { id: 'asc' }],
      }),
      prisma.matchTeamStat.findMany({
        select: { type: true, value: true },
      }),
      prisma.team.findMany({
        orderBy: { name: 'asc' },
        select: { externalId: true, name: true, crest: true, squadJson: true },
      }),
    ])
    return computeTournamentStatistics({ matches, events, teamStats, teams })
  },
  ['tournament-statistics'],
  { revalidate: 60 }
)

function topCount<T>(items: T[], keyFn: (item: T) => string): CountResult | null {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyFn(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0] ?? null
}

function fastest(events: StatEvent[], type: string): StatEvent | null {
  return events.filter((event) => event.type === type).sort((a, b) => a.minute - b.minute)[0] ?? null
}

function fastestAny(events: StatEvent[], types: string[]): StatEvent | null {
  return events.filter((event) => types.includes(event.type)).sort((a, b) => a.minute - b.minute)[0] ?? null
}

function getTeamTotals(matches: Array<{ homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null }>) {
  const totals = new Map<string, { teamName: string; played: number; goalsFor: number; goalsAgainst: number }>()
  const ensure = (teamName: string) => {
    const existing = totals.get(teamName)
    if (existing) return existing
    const created = { teamName, played: 0, goalsFor: 0, goalsAgainst: 0 }
    totals.set(teamName, created)
    return created
  }
  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue
    const home = ensure(match.homeTeam)
    const away = ensure(match.awayTeam)
    home.played++
    away.played++
    home.goalsFor += match.homeScore
    home.goalsAgainst += match.awayScore
    away.goalsFor += match.awayScore
    away.goalsAgainst += match.homeScore
  }
  return totals
}

function toDisplayMatchScore(match: FinishedMatchScore) {
  return {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: match.fullTimeHomeScore ?? match.homeScore,
    awayScore: match.fullTimeAwayScore ?? match.awayScore,
  }
}

function getStatTotal(teamStats: Array<{ type: string; value: number }>, statType: string, events: StatEvent[], eventType: string) {
  const aggregateTotal = teamStats.filter((stat) => stat.type === statType).reduce((sum, stat) => sum + stat.value, 0)
  return aggregateTotal || events.filter((event) => event.type === eventType).length
}

function countCleanSheets(matches: Array<{ homeScore: number | null; awayScore: number | null }>) {
  return matches.reduce((count, match) => {
    if (match.homeScore === null || match.awayScore === null) return count
    return count + (match.homeScore === 0 ? 1 : 0) + (match.awayScore === 0 ? 1 : 0)
  }, 0)
}

function getAgeExtreme(teams: TeamWithSquad[], mode: 'youngest' | 'oldest') {
  const players = teams.flatMap((team) => parseJson<SquadPerson[]>(team.squadJson, [])
    // National-team squads include the coach (and assistants) as squad entries
    // with a "Coach" position — exclude them so they don't skew player ages.
    .filter((person) => !isCoachEntry(person.position))
    .map((person) => ({
      name: person.name ?? ([person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown'),
      dateOfBirth: person.dateOfBirth ?? '',
      teamName: team.name,
    }))).filter((person) => isPlausiblePlayerBirthdate(person.dateOfBirth))
  return players.sort((a, b) => mode === 'youngest'
    ? new Date(b.dateOfBirth).getTime() - new Date(a.dateOfBirth).getTime()
    : new Date(a.dateOfBirth).getTime() - new Date(b.dateOfBirth).getTime()
  )[0] ?? null
}

function isPlausiblePlayerBirthdate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const birthdate = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(birthdate.getTime())) return false

  const today = new Date()
  const age = today.getUTCFullYear() - birthdate.getUTCFullYear()
    - (today.getUTCMonth() < birthdate.getUTCMonth() ||
      (today.getUTCMonth() === birthdate.getUTCMonth() && today.getUTCDate() < birthdate.getUTCDate())
      ? 1
      : 0)

  return age >= MIN_PLAYER_AGE && age <= MAX_PLAYER_AGE
}

// football-data.org returns national-team coaches inside the squad array with a
// "Coach" position (the separate `coach` field is null for national teams).
export function isCoachEntry(position?: string | null): boolean {
  return (position ?? '').toLowerCase().includes('coach')
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
