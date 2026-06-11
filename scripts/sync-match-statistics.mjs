import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const BASE_URL = 'https://api.football-data.org/v4'
const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })
const RECENT_FINISHED_MS = 3 * 24 * 60 * 60 * 1000
const MAX_MATCHES_PER_RUN = 4

function getHeaders() {
  return {
    'X-Auth-Token': process.env.FOOTBALL_API_KEY ?? '',
  }
}

async function fetchMatchDetails(matchId) {
  const res = await fetch(`${BASE_URL}/matches/${matchId}`, { headers: getHeaders() })
  if (!res.ok) {
    const err = new Error(`football-data.org error ${res.status}: ${res.statusText}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

function normalizeTeamStatType(value) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized.includes('FOUL')) return 'FOULS'
  if (normalized.includes('CORNER')) return 'CORNERS'
  return null
}

// New API format: homeTeam.statistics / awayTeam.statistics are objects keyed
// by stat name (corner_kicks, fouls, ...) with null for unpopulated values.
function collectTeamStats(match, teamObj) {
  const stats = teamObj?.statistics
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return []
  const teamName = teamObj.name ?? ''
  const rows = []
  for (const [key, val] of Object.entries(stats)) {
    if (val == null) continue
    const type = normalizeTeamStatType(key)
    const value = Number(val)
    if (type && Number.isFinite(value)) rows.push({ matchId: match.id, teamName, type, value })
  }
  return rows
}

async function replaceMatchStatistics(match, details) {
  const events = []

  for (const goal of details.goals ?? []) {
    events.push({
      matchId: match.id,
      type: 'GOAL',
      minute: Number(goal.minute ?? 0),
      teamName: goal.team?.name ?? '',
      playerName: goal.scorer?.name ?? '',
      relatedPlayerName: goal.assist?.name ?? '',
    })
  }

  for (const booking of details.bookings ?? []) {
    const card = booking.card === 'YELLOW_RED_CARD' ? 'YELLOW_RED_CARD' : booking.card === 'RED_CARD' ? 'RED_CARD' : 'YELLOW_CARD'
    events.push({
      matchId: match.id,
      type: card,
      minute: Number(booking.minute ?? 0),
      teamName: booking.team?.name ?? '',
      playerName: booking.player?.name ?? '',
      relatedPlayerName: '',
    })
  }

  const teamStats = [
    ...collectTeamStats(match, details.homeTeam),
    ...collectTeamStats(match, details.awayTeam),
  ]
  // Legacy format fallback: top-level statistics array of { team, statistics: [{ type, value }] }.
  // Only used when the per-team format yielded nothing, to avoid violating the
  // (matchId, teamName, type) unique constraint with duplicate rows.
  for (const statGroup of teamStats.length > 0 ? [] : details.statistics ?? []) {
    const teamName = statGroup.team?.name ?? ''
    for (const stat of statGroup.statistics ?? []) {
      const type = normalizeTeamStatType(stat.type)
      const value = Number(stat.value)
      if (type && Number.isFinite(value)) {
        teamStats.push({ matchId: match.id, teamName, type, value })
      }
    }
  }

  await prisma.$transaction([
    prisma.matchEvent.deleteMany({ where: { matchId: match.id } }),
    prisma.matchTeamStat.deleteMany({ where: { matchId: match.id } }),
    ...events.map((event) => prisma.matchEvent.create({ data: event })),
    ...teamStats.map((stat) => prisma.matchTeamStat.create({ data: stat })),
  ])
}

async function main() {
  const recentCutoff = new Date(Date.now() - RECENT_FINISHED_MS)
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { status: 'LIVE' },
        { status: 'FINISHED', kickoff: { gte: recentCutoff } },
      ],
    },
    orderBy: { kickoff: 'desc' },
    take: MAX_MATCHES_PER_RUN,
  })

  let synced = 0
  for (const match of matches) {
    try {
      const details = await fetchMatchDetails(match.externalId)
      await replaceMatchStatistics(match, details)
      synced++
    } catch (err) {
      if (err?.status === 429 || String(err).includes('error 429')) {
        console.warn(`[match-statistics] Rate limited by football-data.org while syncing match ${match.externalId}; stopping this cycle.`)
        break
      }
      console.warn(`[match-statistics] Failed for match ${match.externalId}: ${err?.message ?? err}`)
    }
  }

  console.log(`[match-statistics] Synced statistics for ${synced}/${matches.length} matches.`)
}

main()
  .catch((err) => {
    console.error('[match-statistics] Fatal error:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
