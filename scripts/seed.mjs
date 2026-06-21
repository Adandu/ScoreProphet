import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const BASE_URL = 'https://api.football-data.org/v4'
const COMPETITION = process.env.FOOTBALL_API_COMPETITION ?? 'WC'

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
  const homeTeam = match.homeTeam?.name ?? 'TBD'
  const awayTeam = match.awayTeam?.name ?? 'TBD'
  const status = STATUS_MAP[match.status] ?? 'SCHEDULED'
  const winner = match.score?.winner ?? null
  const regularTimeHomeScore = scorePart(match.score, 'regularTime', 'home')
  const regularTimeAwayScore = scorePart(match.score, 'regularTime', 'away')
  const fullTimeHomeScore = scorePart(match.score, 'fullTime', 'home')
  const fullTimeAwayScore = scorePart(match.score, 'fullTime', 'away')
  const extraTimeHomeScore = scorePart(match.score, 'extraTime', 'home')
  const extraTimeAwayScore = scorePart(match.score, 'extraTime', 'away')
  const penaltiesHomeScore = scorePart(match.score, 'penalties', 'home')
  const penaltiesAwayScore = scorePart(match.score, 'penalties', 'away')

  return {
    externalId: String(match.id),
    homeTeam,
    awayTeam,
    homeTeamCrest: match.homeTeam?.crest ?? '',
    awayTeamCrest: match.awayTeam?.crest ?? '',
    stage: STAGE_MAP[match.stage] ?? 'GROUP',
    group: match.group ?? null,
    kickoff: new Date(match.utcDate),
    status,
    scoreDuration: match.score?.duration === 'EXTRA_TIME' || match.score?.duration === 'PENALTY_SHOOTOUT' ? match.score.duration : 'REGULAR',
    regularTimeHomeScore,
    regularTimeAwayScore,
    fullTimeHomeScore,
    fullTimeAwayScore,
    extraTimeHomeScore,
    extraTimeAwayScore,
    penaltiesHomeScore,
    penaltiesAwayScore,
    homeScore: regularTimeHomeScore ?? fullTimeHomeScore,
    awayScore: regularTimeAwayScore ?? fullTimeAwayScore,
    winnerTeam: status === 'FINISHED'
      ? winner === 'HOME_TEAM'
        ? homeTeam
        : winner === 'AWAY_TEAM'
          ? awayTeam
          : null
      : null,
    competitionCode: COMPETITION,
  }
}

function scorePart(score, key, side) {
  const value = score?.[key]?.[side]
  return typeof value === 'number' ? value : null
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
    tla: team.tla ?? '',
    crest: team.crest ?? '',
    areaName: team.area?.name ?? '',
    areaCode: team.area?.code ?? '',
    address: team.address ?? '',
    website: team.website ?? '',
    founded: Number.isInteger(team.founded) ? team.founded : null,
    clubColors: team.clubColors ?? '',
    venue: team.venue ?? '',
    coachName: team.coach?.name ?? '',
    squadJson: JSON.stringify(team.squad ?? []),
    staffJson: JSON.stringify(team.staff ?? []),
    runningCompetitionsJson: JSON.stringify(team.runningCompetitions ?? []),
    rawJson: JSON.stringify(team),
  }))
}

async function main() {
  console.log(`[seed] Syncing ${COMPETITION} matches from football-data.org...`)
  let matches
  try {
    matches = await fetchAllMatches()
  } catch (err) {
    console.warn('[seed] API unavailable, skipping match sync:', err)
    try {
      await prisma.jobStatus.upsert({
        where: { jobName: 'fixture-sync' },
        update: { lastRunAt: new Date(), lastResult: 'API unavailable', runCount: { increment: 1 } },
        create: { jobName: 'fixture-sync', lastRunAt: new Date(), lastResult: 'API unavailable', runCount: 1 },
      })
    } catch {}
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
        update: {
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          crest: team.crest,
          areaName: team.areaName,
          areaCode: team.areaCode,
          address: team.address,
          website: team.website,
          founded: team.founded,
          clubColors: team.clubColors,
          venue: team.venue,
          coachName: team.coachName,
          squadJson: team.squadJson,
          staffJson: team.staffJson,
          runningCompetitionsJson: team.runningCompetitionsJson,
          rawJson: team.rawJson,
        },
        create: team,
      })
    }
    console.log(`[seed] Synced ${teams.length} teams.`)
  } catch (err) {
    console.warn('[seed] Team sync failed (API may not have teams yet):', err)
  }
  await prisma.jobStatus.upsert({
    where: { jobName: 'fixture-sync' },
    update: { lastRunAt: new Date(), lastResult: 'ok', runCount: { increment: 1 } },
    create: { jobName: 'fixture-sync', lastRunAt: new Date(), lastResult: 'ok', runCount: 1 },
  })
}

main()
  .catch(async (err) => {
    console.error('[seed] Fatal error:', err)
    try {
      await prisma.jobStatus.upsert({
        where: { jobName: 'fixture-sync' },
        update: { lastRunAt: new Date(), lastResult: String(err.message ?? err), runCount: { increment: 1 } },
        create: { jobName: 'fixture-sync', lastRunAt: new Date(), lastResult: String(err.message ?? err), runCount: 1 },
      })
    } catch {}
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
