import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import type { Match, MatchStatus } from '@prisma/client'
import {
  calculatePredictionPoints,
  calculateAdvancePointsForMatch,
  calculateTournamentWinnerPoints,
} from '../src/lib/scoring'
import type { PredictionType } from '../src/lib/types'

const BASE_URL = 'https://api.football-data.org/v4'
const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: 'SCHEDULED', TIMED: 'SCHEDULED',
  IN_PLAY: 'LIVE', PAUSED: 'LIVE',
  FINISHED: 'FINISHED', AWARDED: 'FINISHED',
}

type ApiScoreSide = { home?: number | null; away?: number | null }
type ApiScore = {
  duration?: string
  winner?: string | null
  regularTime?: ApiScoreSide
  fullTime?: ApiScoreSide
  extraTime?: ApiScoreSide
  penalties?: ApiScoreSide
}
type ApiMatch = {
  id: number | string
  status: string
  score?: ApiScore
  homeTeam?: { name?: string }
  awayTeam?: { name?: string }
}

function getHeaders(): Record<string, string> {
  return { 'X-Auth-Token': process.env.FOOTBALL_API_KEY ?? '' }
}

function scorePart(
  score: ApiScore | undefined,
  key: 'regularTime' | 'fullTime' | 'extraTime' | 'penalties',
  side: 'home' | 'away',
): number | null {
  const value = score?.[key]?.[side]
  return typeof value === 'number' ? value : null
}

function extractScores(apiScore: ApiScore | undefined) {
  const rh = scorePart(apiScore, 'regularTime', 'home')
  const ra = scorePart(apiScore, 'regularTime', 'away')
  const fh = scorePart(apiScore, 'fullTime', 'home')
  const fa = scorePart(apiScore, 'fullTime', 'away')
  return {
    regularTimeHomeScore: rh,
    regularTimeAwayScore: ra,
    fullTimeHomeScore: fh,
    fullTimeAwayScore: fa,
    extraTimeHomeScore: scorePart(apiScore, 'extraTime', 'home'),
    extraTimeAwayScore: scorePart(apiScore, 'extraTime', 'away'),
    penaltiesHomeScore: scorePart(apiScore, 'penalties', 'home'),
    penaltiesAwayScore: scorePart(apiScore, 'penalties', 'away'),
    scoreDuration: apiScore?.duration === 'EXTRA_TIME' || apiScore?.duration === 'PENALTY_SHOOTOUT'
      ? apiScore.duration : 'REGULAR',
    // fullTime is the definitive final score (includes ET/penalties).
    // regularTime is only the 90-min score — never use it as the primary.
    homeScore: fh ?? rh,
    awayScore: fa ?? ra,
  }
}

async function recalculateMatchPoints(match: Match) {
  if (match.homeScore === null || match.awayScore === null) return

  const predictions = await prisma.prediction.findMany({ where: { matchId: match.id } })
  const ops: Prisma.PrismaPromise<unknown>[] = predictions.map(p =>
    prisma.prediction.update({
      where: { id: p.id },
      data: { pointsAwarded: calculatePredictionPoints(p.type as PredictionType, p.value, match.homeScore!, match.awayScore!) },
    })
  )

  if (match.status === 'FINISHED') {
    const advances = await prisma.knockoutAdvance.findMany({ where: { matchId: match.id } })
    for (const adv of advances) {
      const pts = calculateAdvancePointsForMatch(adv.predictedTeam, match)
      ops.push(prisma.knockoutAdvance.update({ where: { id: adv.id }, data: { pointsAwarded: pts } }))
    }

    if (match.stage === 'FINAL' && match.winnerTeam) {
      const championships = await prisma.championship.findMany({
        where: { competitionCode: match.competitionCode },
        select: { id: true },
      })
      const championshipIds = championships.map(c => c.id)
      const winnerPreds = await prisma.tournamentWinnerPrediction.findMany({
        where: { championshipId: { in: championshipIds } },
      })
      for (const wp of winnerPreds) {
        ops.push(prisma.tournamentWinnerPrediction.update({
          where: { id: wp.id },
          data: { pointsAwarded: calculateTournamentWinnerPoints(wp.predictedTeam, match.winnerTeam) },
        }))
      }
    }
  }

  if (ops.length > 0) await prisma.$transaction(ops)
}

async function main() {
  // Fetch active, non-archived tournaments to scope all sync operations
  const activeTournaments = await prisma.tournament.findMany({
    where: { isActive: true, isArchived: false },
    select: { id: true, competitionCode: true, season: true },
  })

  if (activeTournaments.length === 0) {
    console.log('[score-sync] No active tournaments to sync.')
    return
  }

  const activeTournamentIds = activeTournaments.map(t => t.id)

  // Skip unless a match is live, or a scheduled match is near its kickoff window
  // (15 min before kickoff up to 3 h after, to cover delayed kickoffs).
  // Keeps the 5-second sync loop from hitting the API outside match windows.
  const now = new Date()
  const windowStart = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 15 * 60 * 1000)

  const [dbLiveMatches, nearKickoffCount] = await Promise.all([
    prisma.match.findMany({ where: { status: 'LIVE', tournamentId: { in: activeTournamentIds } } }),
    prisma.match.count({ where: { kickoff: { gte: windowStart, lte: windowEnd }, status: 'SCHEDULED', tournamentId: { in: activeTournamentIds } } }),
  ])

  if (dbLiveMatches.length === 0 && nearKickoffCount === 0) return

  // Collect live matches from API for each active tournament
  const apiLiveMatches: ApiMatch[] = []
  for (const tournament of activeTournaments) {
    const res = await fetch(`${BASE_URL}/competitions/${tournament.competitionCode}/matches?status=IN_PLAY,PAUSED${tournament.season ? `&season=${tournament.season}` : ''}`, {
      headers: getHeaders(),
    })
    if (!res.ok) {
      if (res.status === 429) { console.warn('[score-sync] Rate limited by API, skipping tournament', tournament.competitionCode); continue }
      throw new Error(`[score-sync] API error ${res.status}: ${res.statusText}`)
    }
    const data = await res.json()
    apiLiveMatches.push(...((data.matches ?? []) as ApiMatch[]))
  }

  const apiLiveIds = new Set(apiLiveMatches.map(m => String(m.id)))

  let updated = 0

  // Update currently live matches + recalculate provisional points
  for (const m of apiLiveMatches) {
    const externalId = String(m.id)
    const existing = await prisma.match.findUnique({ where: { externalId } })
    if (!existing || existing.adminOverride) continue

    const scores = extractScores(m.score)
    const status = (STATUS_MAP[m.status] ?? 'LIVE') as MatchStatus

    const scoreChanged = existing.homeScore !== scores.homeScore || existing.awayScore !== scores.awayScore
    const statusChanged = existing.status !== status

    if (!scoreChanged && !statusChanged) continue

    const updated_ = await prisma.match.update({
      where: { externalId },
      data: { status, ...scores },
    })

    if (scores.homeScore !== null && scores.awayScore !== null) {
      await recalculateMatchPoints(updated_)
      updated++
      if (scoreChanged) {
        console.log(`[score-sync] ${existing.homeTeam} ${scores.homeScore}-${scores.awayScore} ${existing.awayTeam} (live)`)
      }
    }
  }

  // Detect matches that were LIVE in DB but are no longer in API live list (may have finished)
  const maybeFinished = dbLiveMatches.filter(m => !apiLiveIds.has(m.externalId) && !m.adminOverride)

  for (const dbMatch of maybeFinished) {
    try {
      const r = await fetch(`${BASE_URL}/matches/${dbMatch.externalId}`, { headers: getHeaders() })
      if (!r.ok) {
        if (r.status === 429) { console.warn('[score-sync] Rate limited on individual match fetch'); break }
        continue
      }
      const m = await r.json()
      const newStatus = STATUS_MAP[m.status] ?? 'SCHEDULED'
      if (newStatus !== 'FINISHED') continue

      const scores = extractScores(m.score)
      const winner = m.score?.winner ?? null
      const winnerTeam = winner === 'HOME_TEAM' ? (m.homeTeam?.name ?? null)
        : winner === 'AWAY_TEAM' ? (m.awayTeam?.name ?? null) : null

      const finishedMatch = await prisma.match.update({
        where: { id: dbMatch.id },
        data: { status: 'FINISHED', ...scores, winnerTeam },
      })
      await recalculateMatchPoints(finishedMatch)
      updated++
      console.log(`[score-sync] ${dbMatch.homeTeam} ${finishedMatch.homeScore}-${finishedMatch.awayScore} ${dbMatch.awayTeam} FINISHED — points recalculated`)
    } catch (err) {
      console.warn(`[score-sync] Failed to check match ${dbMatch.externalId}:`, err instanceof Error ? err.message : err)
    }
  }

  // Re-sync FINISHED ET/penalty matches that may have stale scores.
  // Covers two cases: missing winner (API lag at match end) and wrong score
  // (regularTime score was frozen instead of fullTime score — now fixed, but
  // existing rows with homeScore = regularTimeHomeScore need correction).
  const recentWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const stalePenaltyMatches = await prisma.match.findMany({
    where: {
      status: 'FINISHED',
      scoreDuration: { in: ['PENALTY_SHOOTOUT', 'EXTRA_TIME'] },
      adminOverride: false,
      tournamentId: { in: activeTournamentIds },
      OR: [
        { winnerTeam: null },
        // Matches where fullTime score may differ from stored homeScore (ET bug)
        { kickoff: { gte: recentWindow } },
      ],
    },
  })
  for (const dbMatch of stalePenaltyMatches) {
    try {
      const r = await fetch(`${BASE_URL}/matches/${dbMatch.externalId}`, { headers: getHeaders() })
      if (!r.ok) {
        if (r.status === 429) { console.warn('[score-sync] Rate limited on stale match re-fetch'); break }
        continue
      }
      const m = await r.json()
      const scores = extractScores(m.score)
      const winner = m.score?.winner ?? null
      const winnerTeam = winner === 'HOME_TEAM' ? (m.homeTeam?.name ?? null)
        : winner === 'AWAY_TEAM' ? (m.awayTeam?.name ?? null) : null
      if (!winnerTeam) continue
      // Never overwrite a valid score with null — API sometimes returns null during post-match transitions
      if (scores.homeScore === null && dbMatch.homeScore !== null) continue
      if (scores.awayScore === null && dbMatch.awayScore !== null) continue

      const patched = await prisma.match.update({
        where: { id: dbMatch.id },
        data: { ...scores, winnerTeam },
      })
      await recalculateMatchPoints(patched)
      updated++
      console.log(`[score-sync] Patched stale penalty match: ${dbMatch.homeTeam} ${dbMatch.awayTeam} — winner: ${winnerTeam}`)
    } catch (err) {
      console.warn(`[score-sync] Failed to re-sync stale match ${dbMatch.externalId}:`, err instanceof Error ? err.message : err)
    }
  }

  if (updated > 0) console.log(`[score-sync] Recalculated points for ${updated} match(es)`)
  try {
    await prisma.jobStatus.upsert({
      where: { jobName: 'score-sync' },
      update: { lastRunAt: new Date(), lastResult: 'ok', runCount: { increment: 1 } },
      create: { jobName: 'score-sync', lastRunAt: new Date(), lastResult: 'ok', runCount: 1 },
    })
  } catch {}
}

main()
  .catch(async (err) => {
    console.error('[score-sync] Fatal error:', err)
    try {
      await prisma.jobStatus.upsert({
        where: { jobName: 'score-sync' },
        update: { lastRunAt: new Date(), lastResult: String(err?.message ?? err), runCount: { increment: 1 } },
        create: { jobName: 'score-sync', lastRunAt: new Date(), lastResult: String(err?.message ?? err), runCount: 1 },
      })
    } catch {}
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
