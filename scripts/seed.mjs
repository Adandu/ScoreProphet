import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const BASE_URL = 'https://api.football-data.org/v4'
const COMPETITION = 'WC'

const STAGE_MAP = {
  GROUP_STAGE: 'GROUP',
  LAST_32: 'ROUND_OF_32',
  LAST_16: 'ROUND_OF_16',
  QUARTER_FINALS: 'QUARTER_FINAL',
  SEMI_FINALS: 'SEMI_FINAL',
  THIRD_PLACE: 'THIRD_PLACE',
  FINAL: 'FINAL',
}

const STATUS_MAP = {
  SCHEDULED: 'SCHEDULED',
  TIMED: 'SCHEDULED',
  IN_PLAY: 'LIVE',
  PAUSED: 'LIVE',
  FINISHED: 'FINISHED',
  AWARDED: 'FINISHED',
}

const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

function getHeaders() {
  return {
    'X-Auth-Token': process.env.FOOTBALL_API_KEY ?? '',
  }
}

function normalizeMatch(match) {
  return {
    externalId: String(match.id),
    homeTeam: match.homeTeam?.name ?? 'TBD',
    awayTeam: match.awayTeam?.name ?? 'TBD',
    homeTeamCrest: match.homeTeam?.crest ?? '',
    awayTeamCrest: match.awayTeam?.crest ?? '',
    stage: STAGE_MAP[match.stage] ?? 'GROUP',
    group: match.group ?? null,
    kickoff: new Date(match.utcDate),
    status: STATUS_MAP[match.status] ?? 'SCHEDULED',
    homeScore: match.score?.fullTime?.home ?? null,
    awayScore: match.score?.fullTime?.away ?? null,
  }
}

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: getHeaders() })
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

async function fetchAllMatches() {
  const data = await fetchJson(`/competitions/${COMPETITION}/matches`)
  return (data.matches ?? []).map((match) => normalizeMatch(match))
}

async function fetchAllTeams() {
  const data = await fetchJson(`/competitions/${COMPETITION}/teams`)
  return (data.teams ?? []).map((team) => ({
    externalId: String(team.id),
    name: team.name ?? '',
    shortName: team.shortName ?? team.tla ?? '',
    crest: team.crest ?? '',
  }))
}

async function main() {
  console.log('[seed] Syncing WC2026 matches from football-data.org...')
  let matches
  try {
    matches = await fetchAllMatches()
  } catch (err) {
    console.warn('[seed] API unavailable, skipping match sync:', err)
    return
  }

  for (const match of matches) {
    await prisma.match.upsert({
      where: { externalId: match.externalId },
      update: match,
      create: match,
    })
  }
  console.log(`[seed] Synced ${matches.length} matches.`)

  console.log('[seed] Syncing teams...')
  try {
    const teams = await fetchAllTeams()
    for (const team of teams) {
      await prisma.team.upsert({
        where: { externalId: team.externalId },
        update: { name: team.name, shortName: team.shortName, crest: team.crest },
        create: team,
      })
    }
    console.log(`[seed] Synced ${teams.length} teams.`)
  } catch (err) {
    console.warn('[seed] Team sync failed (API may not have teams yet):', err)
  }
}

main()
  .catch((err) => {
    console.error('[seed] Fatal error:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
