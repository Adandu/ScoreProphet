import type { Stage } from '@/lib/types'

const BASE_URL = 'https://api.football-data.org/v4'
const COMPETITION = process.env.FOOTBALL_API_COMPETITION ?? 'WC'
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY

if (!FOOTBALL_API_KEY && process.env.NODE_ENV === 'production') {
  console.error('[football-api] FOOTBALL_API_KEY is not set - API calls will fail')
}

type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED'

export interface NormalizedMatch {
  externalId: string
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  stage: Stage
  group: string | null
  kickoff: Date
  status: MatchStatus
  homeScore: number | null
  awayScore: number | null
}

export interface NormalizedTeam {
  externalId: string
  name: string
  shortName: string
  tla: string
  crest: string
  areaName: string
  areaCode: string
  address: string
  website: string
  founded: number | null
  clubColors: string
  venue: string
  coachName: string
  squadJson: string
  staffJson: string
  runningCompetitionsJson: string
  rawJson: string
}

export interface HeadToHeadMatch {
  id: string
  utcDate: string
  competition: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

export interface HeadToHeadSummary {
  homeTeamId: string | null
  awayTeamId: string | null
  matches: HeadToHeadMatch[]
}

export interface LivePlayer {
  id: string
  name: string
  shirtNumber: number
  position: string // "Goalkeeper" | "Defence" | "Midfield" | "Offence"
}

export interface LiveTeam {
  id: string
  name: string
  crest: string
  clubColors: string
  formation: string  // e.g. "4-3-3", empty string if unknown
  lineup: LivePlayer[]
  bench: LivePlayer[]
  coach: string | null
}

export interface LiveMatchEvent {
  minute: number
  teamId: string
  teamName: string
  playerName: string
  assistName?: string
}

export interface LiveMatchSubstitution {
  minute: number
  teamId: string
  playerOutName: string
  playerInName: string
}

export interface LiveMatchBooking extends LiveMatchEvent {
  card: 'YELLOW_CARD' | 'RED_CARD' | 'YELLOW_RED_CARD'
}

export interface LiveMatchDetails {
  matchId: string
  status: string
  minute: number | null
  venue: string | null
  homeScore: number | null
  awayScore: number | null
  homeTeam: LiveTeam
  awayTeam: LiveTeam
  referee: { name: string; nationality: string } | null
  goals: LiveMatchEvent[]
  bookings: LiveMatchBooking[]
  substitutions: LiveMatchSubstitution[]
  teamStats: Array<{ teamId: string; teamName: string; type: 'FOULS' | 'CORNERS'; value: number }>
  homePossession: number | null  // 0–100, null if not available
}

const STAGE_MAP: Record<string, Stage> = {
  GROUP_STAGE: 'GROUP',
  LAST_32: 'ROUND_OF_32',
  LAST_16: 'ROUND_OF_16',
  QUARTER_FINALS: 'QUARTER_FINAL',
  SEMI_FINALS: 'SEMI_FINAL',
  THIRD_PLACE: 'THIRD_PLACE',
  FINAL: 'FINAL',
}

const STATUS_MAP: Record<string, MatchStatus> = {
  SCHEDULED: 'SCHEDULED',
  TIMED: 'SCHEDULED',
  IN_PLAY: 'LIVE',
  PAUSED: 'LIVE',
  FINISHED: 'FINISHED',
  AWARDED: 'FINISHED',
}

function getHeaders(): HeadersInit {
  return {
    'X-Auth-Token': FOOTBALL_API_KEY ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMatch(m: any): NormalizedMatch {
  return {
    externalId: String(m.id),
    homeTeam: m.homeTeam?.name ?? 'TBD',
    awayTeam: m.awayTeam?.name ?? 'TBD',
    homeTeamCrest: m.homeTeam?.crest ?? '',
    awayTeamCrest: m.awayTeam?.crest ?? '',
    stage: (() => {
      const knownStages = Object.keys(STAGE_MAP)
      if (m.stage && !knownStages.includes(m.stage)) {
        console.warn(`[football-api] Unknown stage value: ${m.stage}`)
      }
      return STAGE_MAP[m.stage] ?? 'GROUP'
    })(),
    group: m.group ?? null,
    kickoff: new Date(m.utcDate),
    status: (() => {
      const knownStatuses = Object.keys(STATUS_MAP)
      if (m.status && !knownStatuses.includes(m.status)) {
        console.warn(`[football-api] Unknown status value: ${m.status}`)
      }
      return STATUS_MAP[m.status] ?? 'SCHEDULED'
    })(),
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
  }
}

export async function fetchAllMatches(): Promise<NormalizedMatch[]> {
  const res = await fetch(
    `${BASE_URL}/competitions/${COMPETITION}/matches`,
    {
      headers: getHeaders(),
      next: { revalidate: 60 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.matches ?? []).map((m: any) => normalizeMatch(m))
}

export async function fetchLiveMatch(): Promise<NormalizedMatch | null> {
  const res = await fetch(
    `${BASE_URL}/competitions/${COMPETITION}/matches?status=IN_PLAY`,
    {
      headers: getHeaders(),
      next: { revalidate: 5 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  const matches = data.matches ?? []
  if (matches.length === 0) return null
  return normalizeMatch(matches[0])
}

export async function fetchNextMatch(): Promise<NormalizedMatch | null> {
  const res = await fetch(
    `${BASE_URL}/competitions/${COMPETITION}/matches?status=SCHEDULED`,
    {
      headers: getHeaders(),
      next: { revalidate: 60 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  const matches = data.matches ?? []
  if (matches.length === 0) return null
  // Sort ascending by date and return the earliest
  matches.sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
  )
  return normalizeMatch(matches[0])
}

export async function fetchAllTeams(): Promise<NormalizedTeam[]> {
  const res = await fetch(
    `${BASE_URL}/competitions/${COMPETITION}/teams`,
    {
      headers: getHeaders(),
      next: { revalidate: 60 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.teams ?? []).map((t: any): NormalizedTeam => normalizeTeam(t))
}

export async function fetchTeamById(id: string | number): Promise<NormalizedTeam> {
  const teams = await fetchAllTeams()
  const team = teams.find((t) => t.externalId === String(id))
  if (!team) throw new Error(`Team ${id} not found in ${COMPETITION} teams`)
  return team
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTeam(t: any): NormalizedTeam {
  return {
    externalId: String(t.id),
    name: t.name ?? '',
    shortName: t.shortName ?? t.tla ?? '',
    tla: t.tla ?? '',
    crest: t.crest ?? '',
    areaName: t.area?.name ?? '',
    areaCode: t.area?.code ?? '',
    address: t.address ?? '',
    website: t.website ?? '',
    founded: Number.isInteger(t.founded) ? t.founded : null,
    clubColors: t.clubColors ?? '',
    venue: t.venue ?? '',
    coachName: t.coach?.name ?? '',
    squadJson: JSON.stringify(t.squad ?? []),
    staffJson: JSON.stringify(t.staff ?? []),
    runningCompetitionsJson: JSON.stringify(t.runningCompetitions ?? []),
    rawJson: JSON.stringify(t),
  }
}

export async function fetchHeadToHead(matchId: string | number, limit = 10): Promise<HeadToHeadSummary> {
  const res = await fetch(
    `${BASE_URL}/matches/${matchId}/head2head?limit=${limit}`,
    {
      headers: getHeaders(),
      next: { revalidate: 60 * 60 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  const data = await res.json()

  return {
    homeTeamId: data.aggregates?.homeTeam?.id ? String(data.aggregates.homeTeam.id) : null,
    awayTeamId: data.aggregates?.awayTeam?.id ? String(data.aggregates.awayTeam.id) : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matches: (data.matches ?? []).map((match: any): HeadToHeadMatch => ({
      id: String(match.id),
      utcDate: match.utcDate,
      competition: match.competition?.name ?? '',
      homeTeam: match.homeTeam?.name ?? 'TBD',
      awayTeam: match.awayTeam?.name ?? 'TBD',
      homeScore: match.score?.fullTime?.home ?? null,
      awayScore: match.score?.fullTime?.away ?? null,
    })),
  }
}

export async function fetchLiveMatchDetails(matchId: string | number): Promise<LiveMatchDetails> {
  const res = await fetch(
    `${BASE_URL}/matches/${matchId}`,
    {
      headers: getHeaders(),
      next: { revalidate: 5 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = await res.json()

  const homeId = String(m.homeTeam?.id ?? '')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizePlayer = (p: any): LivePlayer => ({
    id: String(p.id ?? ''),
    name: p.name ?? '',
    shirtNumber: p.shirtNumber ?? 0,
    position: p.position ?? '',
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeTeam = (t: any): LiveTeam => ({
    id: String(t.id ?? ''),
    name: t.name ?? '',
    crest: t.crest ?? '',
    clubColors: t.clubColors ?? '',
    formation: t.formation ?? '',
    lineup: (t.lineup ?? []).map(normalizePlayer),
    bench: (t.bench ?? []).map(normalizePlayer),
    coach: t.coach?.name ?? null,
  })

  const referee = (m.referees ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => r.role === 'REFEREE'
  )

  // Extract possession from statistics if present
  let homePossession: number | null = null
  const teamStats: LiveMatchDetails['teamStats'] = []
  if (Array.isArray(m.statistics)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const homeStats = m.statistics.find((s: any) => String(s.team?.id) === homeId)
    if (homeStats) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poss = homeStats.statistics?.find((s: any) => s.type === 'BALL_POSSESSION')
      if (poss?.value != null) homePossession = Number(poss.value)
    }

    for (const statGroup of m.statistics) {
      const teamId = String(statGroup.team?.id ?? '')
      const teamName = statGroup.team?.name ?? ''
      for (const stat of statGroup.statistics ?? []) {
        const type = normalizeTeamStatType(stat.type)
        const value = Number(stat.value)
        if (type && Number.isFinite(value)) teamStats.push({ teamId, teamName, type, value })
      }
    }
  }

  return {
    matchId: String(m.id),
    status: STATUS_MAP[m.status] ?? m.status ?? '',
    minute: m.minute ?? null,
    venue: m.venue ?? null,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    homeTeam: normalizeTeam(m.homeTeam ?? {}),
    awayTeam: normalizeTeam(m.awayTeam ?? {}),
    referee: referee
      ? { name: referee.name ?? '', nationality: referee.nationality ?? '' }
      : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    goals: (m.goals ?? []).map((g: any): LiveMatchEvent => ({
      minute: g.minute ?? 0,
      teamId: String(g.team?.id ?? ''),
      teamName: g.team?.name ?? '',
      playerName: g.scorer?.name ?? '',
      assistName: g.assist?.name ?? undefined,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookings: (m.bookings ?? []).map((b: any): LiveMatchBooking => ({
      minute: b.minute ?? 0,
      teamId: String(b.team?.id ?? ''),
      teamName: b.team?.name ?? '',
      playerName: b.player?.name ?? '',
      card: b.card ?? 'YELLOW_CARD',
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    substitutions: (m.substitutions ?? []).map((s: any): LiveMatchSubstitution => ({
      minute: s.minute ?? 0,
      teamId: String(s.team?.id ?? ''),
      playerOutName: s.playerOut?.name ?? '',
      playerInName: s.playerIn?.name ?? '',
    })),
    teamStats,
    homePossession,
  }
}

function normalizeTeamStatType(value: string | undefined): 'FOULS' | 'CORNERS' | null {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized.includes('FOUL')) return 'FOULS'
  if (normalized.includes('CORNER')) return 'CORNERS'
  return null
}
