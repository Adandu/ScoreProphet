const BASE_URL = 'https://api.football-data.org/v4'
const COMPETITION = 'WC'

type Stage = 'GROUP' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'
type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED'

export interface NormalizedMatch {
  externalId: string
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  stage: Stage
  kickoff: Date
  status: MatchStatus
  homeScore: number | null
  awayScore: number | null
}

export interface NormalizedTeam {
  externalId: string
  name: string
  shortName: string
  crest: string
}

const STAGE_MAP: Record<string, Stage> = {
  GROUP_STAGE: 'GROUP',
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
    'X-Auth-Token': process.env.FOOTBALL_API_KEY ?? '',
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
    stage: STAGE_MAP[m.stage] ?? 'GROUP',
    kickoff: new Date(m.utcDate),
    status: STATUS_MAP[m.status] ?? 'SCHEDULED',
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
      next: { revalidate: 60 },
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
  return (data.teams ?? []).map((t: any): NormalizedTeam => ({
    externalId: String(t.id),
    name: t.name ?? '',
    shortName: t.shortName ?? t.tla ?? '',
    crest: t.crest ?? '',
  }))
}

export async function fetchTeamById(id: string | number): Promise<NormalizedTeam> {
  const res = await fetch(
    `${BASE_URL}/teams/${id}`,
    {
      headers: getHeaders(),
      next: { revalidate: 60 },
    }
  )
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  const t = await res.json()
  return {
    externalId: String(t.id),
    name: t.name ?? '',
    shortName: t.shortName ?? t.tla ?? '',
    crest: t.crest ?? '',
  }
}
