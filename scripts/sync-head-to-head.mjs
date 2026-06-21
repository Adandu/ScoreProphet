import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const BASE_URL = 'https://api.football-data.org/v4'

const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })
const FRESH_SYNC_MS = 6 * 60 * 60 * 1000

function getHeaders() {
  return {
    'X-Auth-Token': process.env.FOOTBALL_API_KEY ?? '',
  }
}

async function fetchHeadToHead(matchId, limit = 10) {
  const res = await fetch(`${BASE_URL}/matches/${matchId}/head2head?limit=${limit}`, {
    headers: getHeaders(),
  })
  if (!res.ok) {
    const err = new Error(`football-data.org error ${res.status}: ${res.statusText}`)
    err.status = res.status
    throw err
  }

  const data = await res.json()
  return {
    homeTeamId: data.aggregates?.homeTeam?.id ? String(data.aggregates.homeTeam.id) : null,
    awayTeamId: data.aggregates?.awayTeam?.id ? String(data.aggregates.awayTeam.id) : null,
    matches: (data.matches ?? []).map((match) => ({
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

async function getHomepageMatches() {
  const now = new Date()
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { status: 'LIVE' },
        { status: 'SCHEDULED', kickoff: { gt: now, lte: next24Hours } },
      ],
    },
    orderBy: { kickoff: 'asc' },
  })

  if (matches.length > 0) return matches

  const fallback = await prisma.match.findFirst({
    where: { status: 'SCHEDULED', kickoff: { gt: now } },
    orderBy: { kickoff: 'asc' },
  })
  return fallback ? [fallback] : []
}

async function main() {
  const matches = await getHomepageMatches()
  let synced = 0

  for (const match of matches) {
    if (match.headToHeadSyncedAt && Date.now() - match.headToHeadSyncedAt.getTime() < FRESH_SYNC_MS) {
      continue
    }

    try {
      const headToHead = await fetchHeadToHead(match.externalId, 10)
      await prisma.match.update({
        where: { id: match.id },
        data: {
          headToHeadHomeTeamId: headToHead.homeTeamId,
          headToHeadAwayTeamId: headToHead.awayTeamId,
          headToHeadJson: JSON.stringify(headToHead.matches),
          headToHeadSyncedAt: new Date(),
        },
      })
      synced++
    } catch (err) {
      if (err?.status === 429 || String(err).includes('error 429')) {
        console.warn(`[head-to-head-sync] Rate limited by football-data.org while syncing match ${match.externalId}; stopping this cycle.`)
        break
      }
      console.warn(`[head-to-head-sync] Failed for match ${match.externalId}: ${err?.message ?? err}`)
    }
  }

  console.log(`[head-to-head-sync] Synced ${synced}/${matches.length} homepage matches.`)
  await prisma.jobStatus.upsert({
    where: { jobName: 'head-to-head-sync' },
    update: { lastRunAt: new Date(), lastResult: 'ok', runCount: { increment: 1 } },
    create: { jobName: 'head-to-head-sync', lastRunAt: new Date(), lastResult: 'ok', runCount: 1 },
  })
}

main()
  .catch(async (err) => {
    console.error('[head-to-head-sync] Fatal error:', err)
    try {
      await prisma.jobStatus.upsert({
        where: { jobName: 'head-to-head-sync' },
        update: { lastRunAt: new Date(), lastResult: String(err.message ?? err), runCount: { increment: 1 } },
        create: { jobName: 'head-to-head-sync', lastRunAt: new Date(), lastResult: String(err.message ?? err), runCount: 1 },
      })
    } catch {}
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
