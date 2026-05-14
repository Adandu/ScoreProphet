import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const BASE_URL = 'https://api.football-data.org/v4'
const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

function getHeaders() {
  return {
    'X-Auth-Token': process.env.FOOTBALL_API_KEY ?? '',
  }
}

async function fetchMatchDetails(matchId) {
  const res = await fetch(`${BASE_URL}/matches/${matchId}`, { headers: getHeaders() })
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

function normalizeTeamStatType(value) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized.includes('FOUL')) return 'FOULS'
  if (normalized.includes('CORNER')) return 'CORNERS'
  return null
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

  const teamStats = []
  for (const statGroup of details.statistics ?? []) {
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
  const matches = await prisma.match.findMany({
    where: { status: { in: ['LIVE', 'FINISHED'] } },
    orderBy: { kickoff: 'desc' },
  })

  let synced = 0
  for (const match of matches) {
    try {
      const details = await fetchMatchDetails(match.externalId)
      await replaceMatchStatistics(match, details)
      synced++
    } catch (err) {
      console.warn(`[match-statistics] Failed for match ${match.externalId}:`, err)
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
