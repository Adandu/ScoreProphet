import type { Stage } from '@/lib/types'

const BASE_URL = 'https://api.football-data.org/v4'
const COMPETITION = process.env.FOOTBALL_API_COMPETITION ?? 'WC'
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY

if (!FOOTBALL_API_KEY && process.env.NODE_ENV === 'production') {
  console.error('[football-api] FOOTBALL_API_KEY is not set - API calls will fail')
}

type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED'
type ScoreDuration = 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
const TEAMS_CACHE_MS = 60 * 60 * 1000

let teamsCache: { expiresAt: number; teams: NormalizedTeam[] } | null = null

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
  scoreDuration: ScoreDuration
  regularTimeHomeScore: number | null
  regularTimeAwayScore: number | null
  fullTimeHomeScore: number | null
  fullTimeAwayScore: number | null
  extraTimeHomeScore: number | null
  extraTimeAwayScore: number | null
  penaltiesHomeScore: number | null
  penaltiesAwayScore: number | null
  homeScore: number | null
  awayScore: number | null
  winnerTeam: string | null
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
  injuryTime?: number
  teamId: string
  teamName: string
  playerId: string
  playerName: string
  assistId?: string
  assistName?: string
  type?: string
}

export interface LiveMatchSubstitution {
  minute: number
  injuryTime?: number
  teamId: string
  playerOutId: string
  playerOutName: string
  playerInId: string
  playerInName: string
}

export interface LiveMatchBooking extends LiveMatchEvent {
  card: 'YELLOW_CARD' | 'RED_CARD' | 'YELLOW_RED_CARD'
}

export interface LiveMatchDetails {
  matchId: string
  status: string
  minute: number | null
  injuryTime: number | null
  venue: string | null
  homeScore: number | null
  awayScore: number | null
  homeTeam: LiveTeam
  awayTeam: LiveTeam
  referee: { name: string; nationality: string } | null
  goals: LiveMatchEvent[]
  bookings: LiveMatchBooking[]
  substitutions: LiveMatchSubstitution[]
  teamStats: Array<{ teamId: string; teamName: string; type: 'CORNERS' | 'FREE_KICKS' | 'GOAL_KICKS' | 'OFFSIDES' | 'FOULS' | 'SAVES' | 'THROW_INS' | 'SHOTS' | 'SHOTS_ON_GOAL' | 'SHOTS_OFF_GOAL' | 'YELLOW_CARDS' | 'RED_CARDS'; value: number }>
  homePossession: number | null  // 0–100, null if not available
  halftime: boolean
  penaltyShootout: Array<{ playerName: string; teamId: string; scored: boolean }>
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
function scorePart(score: any, key: 'regularTime' | 'fullTime' | 'extraTime' | 'penalties', side: 'home' | 'away'): number | null {
  const value = score?.[key]?.[side]
  return typeof value === 'number' ? value : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMatch(m: any): NormalizedMatch {
  const homeTeam = m.homeTeam?.name ?? 'TBD'
  const awayTeam = m.awayTeam?.name ?? 'TBD'
  const status = (() => {
    const knownStatuses = Object.keys(STATUS_MAP)
    if (m.status && !knownStatuses.includes(m.status)) {
      console.warn(`[football-api] Unknown status value: ${m.status}`)
    }
    return STATUS_MAP[m.status] ?? 'SCHEDULED'
  })()
  const winner = m.score?.winner ?? null
  const scoreDuration = m.score?.duration === 'EXTRA_TIME' || m.score?.duration === 'PENALTY_SHOOTOUT'
    ? m.score.duration
    : 'REGULAR'
  const regularTimeHomeScore = scorePart(m.score, 'regularTime', 'home')
  const regularTimeAwayScore = scorePart(m.score, 'regularTime', 'away')
  const fullTimeHomeScore = scorePart(m.score, 'fullTime', 'home')
  const fullTimeAwayScore = scorePart(m.score, 'fullTime', 'away')
  const extraTimeHomeScore = scorePart(m.score, 'extraTime', 'home')
  const extraTimeAwayScore = scorePart(m.score, 'extraTime', 'away')
  const penaltiesHomeScore = scorePart(m.score, 'penalties', 'home')
  const penaltiesAwayScore = scorePart(m.score, 'penalties', 'away')
  const homeScore = regularTimeHomeScore ?? fullTimeHomeScore
  const awayScore = regularTimeAwayScore ?? fullTimeAwayScore
  return {
    externalId: String(m.id),
    homeTeam,
    awayTeam,
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
    status,
    scoreDuration,
    regularTimeHomeScore,
    regularTimeAwayScore,
    fullTimeHomeScore,
    fullTimeAwayScore,
    extraTimeHomeScore,
    extraTimeAwayScore,
    penaltiesHomeScore,
    penaltiesAwayScore,
    homeScore,
    awayScore,
    winnerTeam: status === 'FINISHED'
      ? winner === 'HOME_TEAM'
        ? homeTeam
        : winner === 'AWAY_TEAM'
          ? awayTeam
          : null
      : null,
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

export async function fetchLiveMatches(): Promise<NormalizedMatch[]> {
  const res = await fetch(
    `${BASE_URL}/competitions/${COMPETITION}/matches?status=IN_PLAY,PAUSED`,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return matches.map((m: any) => normalizeMatch(m))
}

export async function fetchAllTeams(): Promise<NormalizedTeam[]> {
  if (process.env.NODE_ENV !== 'test' && teamsCache && Date.now() < teamsCache.expiresAt) {
    return teamsCache.teams
  }

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
  const teams = (data.teams ?? []).map((t: any): NormalizedTeam => normalizeTeam(t))
  if (process.env.NODE_ENV !== 'test') {
    teamsCache = { expiresAt: Date.now() + TEAMS_CACHE_MS, teams }
  }
  return teams
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

  const POSITION_GROUP: Record<string, number> = {
    Goalkeeper: 0,
    Defence: 1, 'Centre-Back': 1, 'Right-Back': 1, 'Left-Back': 1, 'Wing-Back': 1,
    Midfield: 2, 'Defensive Midfield': 2, 'Central Midfield': 2, 'Attacking Midfield': 2,
    'Right Midfield': 2, 'Left Midfield': 2,
    Offence: 3, 'Right Winger': 3, 'Left Winger': 3, 'Centre-Forward': 3, Striker: 3,
  }

  // Lateral sort order within each line: Left-side(0) → Centre(1) → Right-side(2)
  // Both home and away use the same top-to-bottom order (Left-flank at top, Right-flank at bottom)
  // so each team's formation reads consistently from the viewer's fixed perspective.
  const LATERAL_ORDER: Record<string, number> = {
    'Left-Back': 0, 'Left Midfield': 0, 'Left Winger': 0,
    'Centre-Back': 1, Defence: 1, 'Defensive Midfield': 1, 'Central Midfield': 1,
    Midfield: 1, 'Attacking Midfield': 1, 'Centre-Forward': 1, Striker: 1, Offence: 1, 'Wing-Back': 1,
    'Right-Back': 2, 'Right Midfield': 2, 'Right Winger': 2,
  }

  const lateralSort = (players: LivePlayer[]) =>
    [...players].sort((a, b) => (LATERAL_ORDER[a.position] ?? 1) - (LATERAL_ORDER[b.position] ?? 1))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizePlayer = (p: any): LivePlayer => ({
    id: String(p.id ?? ''),
    name: p.name ?? '',
    shirtNumber: p.shirtNumber ?? 0,
    position: p.position ?? '',
  })

  function sortLineup(players: LivePlayer[], formation: string): LivePlayer[] {
    const backLineSize = parseInt(formation.split('-')[0] ?? '4', 10)
    const gks = players.filter((p) => (POSITION_GROUP[p.position] ?? 2) === 0)
    const defs = players.filter((p) => (POSITION_GROUP[p.position] ?? 2) === 1)
    const mids = players.filter((p) => (POSITION_GROUP[p.position] ?? 2) === 2)
    const fwds = players.filter((p) => (POSITION_GROUP[p.position] ?? 2) === 3)
    // In 3-back formations, non-CB defenders are wing-backs playing in the mid line
    const backLine =
      backLineSize <= 3
        ? defs.filter((p) => p.position === 'Centre-Back' || p.position === 'Defence')
        : defs
    const overflowDefs =
      backLineSize <= 3
        ? defs.filter((p) => p.position !== 'Centre-Back' && p.position !== 'Defence')
        : []
    return [
      ...gks,
      ...lateralSort(backLine),
      ...lateralSort(overflowDefs),
      ...lateralSort(mids),
      ...lateralSort(fwds),
    ]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeTeam = (t: any): LiveTeam => ({
    id: String(t.id ?? ''),
    name: t.name ?? '',
    crest: t.crest ?? '',
    clubColors: t.clubColors ?? '',
    formation: t.formation ?? '',
    lineup: sortLineup((t.lineup ?? []).map(normalizePlayer), t.formation ?? ''),
    bench: (t.bench ?? []).map(normalizePlayer),
    coach: t.coach?.name ?? null,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referees: any[] = m.referees ?? []
  const referee = referees.find((r) => r.role === 'REFEREE' || r.type === 'REFEREE') ?? referees[0] ?? null

  // Extract per-team statistics from the new API format (homeTeam.statistics / awayTeam.statistics as objects)
  let homePossession: number | null = null
  const teamStats: LiveMatchDetails['teamStats'] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractTeamStats(teamObj: any) {
    const stats = teamObj?.statistics
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return
    const id = String(teamObj.id ?? '')
    const name = teamObj.name ?? ''
    for (const [key, val] of Object.entries(stats)) {
      const type = normalizeTeamStatType(key)
      const value = Number(val)
      if (type && Number.isFinite(value)) teamStats.push({ teamId: id, teamName: name, type, value })
    }
  }

  extractTeamStats(m.homeTeam)
  extractTeamStats(m.awayTeam)

  const homePoss = m.homeTeam?.statistics?.ball_possession
  if (homePoss != null) homePossession = Number(homePoss)

  return {
    matchId: String(m.id),
    status: STATUS_MAP[m.status] ?? m.status ?? '',
    minute: m.minute ?? null,
    injuryTime: m.injuryTime != null ? Number(m.injuryTime) : null,
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
      injuryTime: g.injuryTime != null ? Number(g.injuryTime) : undefined,
      teamId: String(g.team?.id ?? ''),
      teamName: g.team?.name ?? '',
      playerId: String(g.scorer?.id ?? ''),
      playerName: g.scorer?.name ?? '',
      assistId: g.assist?.id != null ? String(g.assist.id) : undefined,
      assistName: g.assist?.name ?? undefined,
      type: g.type === 'OWN' ? 'OWN_GOAL' : g.type ?? undefined,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookings: (m.bookings ?? []).map((b: any): LiveMatchBooking => ({
      minute: b.minute ?? 0,
      injuryTime: b.injuryTime != null ? Number(b.injuryTime) : undefined,
      teamId: String(b.team?.id ?? ''),
      teamName: b.team?.name ?? '',
      playerId: String(b.player?.id ?? ''),
      playerName: b.player?.name ?? '',
      card: b.card === 'YELLOW' ? 'YELLOW_CARD' : b.card === 'RED' ? 'RED_CARD' : b.card === 'YELLOW_RED' ? 'YELLOW_RED_CARD' : 'YELLOW_CARD',
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    substitutions: (m.substitutions ?? []).map((s: any): LiveMatchSubstitution => ({
      minute: s.minute ?? 0,
      injuryTime: s.injuryTime != null ? Number(s.injuryTime) : undefined,
      teamId: String(s.team?.id ?? ''),
      playerOutId: String(s.playerOut?.id ?? ''),
      playerOutName: s.playerOut?.name ?? '',
      playerInId: String(s.playerIn?.id ?? ''),
      playerInName: s.playerIn?.name ?? '',
    })),
    teamStats,
    homePossession,
    halftime: m.status === 'PAUSED',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    penaltyShootout: (m.penalties ?? []).map((p: any) => ({
      playerName: p.player?.name ?? '',
      teamId: String(p.team?.id ?? ''),
      scored: p.scored === true,
    })),
  }
}

function normalizeTeamStatType(value: string | undefined): 'CORNERS' | 'FREE_KICKS' | 'GOAL_KICKS' | 'OFFSIDES' | 'FOULS' | 'SAVES' | 'THROW_INS' | 'SHOTS' | 'SHOTS_ON_GOAL' | 'SHOTS_OFF_GOAL' | 'YELLOW_CARDS' | 'RED_CARDS' | null {
  const n = String(value ?? '').toLowerCase()
  if (n === 'corner_kicks') return 'CORNERS'
  if (n === 'free_kicks') return 'FREE_KICKS'
  if (n === 'goal_kicks') return 'GOAL_KICKS'
  if (n === 'offsides') return 'OFFSIDES'
  if (n === 'fouls') return 'FOULS'
  if (n === 'saves') return 'SAVES'
  if (n === 'throw_ins') return 'THROW_INS'
  if (n === 'shots') return 'SHOTS'
  if (n === 'shots_on_goal') return 'SHOTS_ON_GOAL'
  if (n === 'shots_off_goal') return 'SHOTS_OFF_GOAL'
  if (n === 'yellow_cards') return 'YELLOW_CARDS'
  if (n === 'red_cards') return 'RED_CARDS'
  return null
}
