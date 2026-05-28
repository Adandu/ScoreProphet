import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const COMPETITION = process.env.FOOTBALL_API_COMPETITION ?? 'WC'
const BASE_URL = 'https://api.football-data.org/v4'
const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

const STATUS_MAP = {
  SCHEDULED: 'SCHEDULED', TIMED: 'SCHEDULED',
  IN_PLAY: 'LIVE', PAUSED: 'LIVE',
  FINISHED: 'FINISHED', AWARDED: 'FINISHED',
}

function getHeaders() {
  return { 'X-Auth-Token': process.env.FOOTBALL_API_KEY ?? '' }
}

function scorePart(score, key, side) {
  const value = score?.[key]?.[side]
  return typeof value === 'number' ? value : null
}

function extractScores(apiScore) {
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
    homeScore: rh ?? fh,
    awayScore: ra ?? fa,
  }
}

function calcPredictionPoints(type, value, homeScore, awayScore) {
  const outcome = homeScore > awayScore ? '1' : homeScore === awayScore ? 'X' : '2'
  if (type === 'SINGLE_OUTCOME') return value === outcome ? 3 : 0
  if (type === 'DOUBLE_CHANCE') {
    const map = { '1X': ['1', 'X'], 'X2': ['X', '2'], '12': ['1', '2'] }
    return (map[value] ?? []).includes(outcome) ? 1 : 0
  }
  if (type === 'EXACT_SCORE') {
    const [h, a] = value.split('-').map(Number)
    return h === homeScore && a === awayScore ? 5 : 0
  }
  return 0
}

async function recalculateMatchPoints(match) {
  if (match.homeScore === null || match.awayScore === null) return

  const predictions = await prisma.prediction.findMany({ where: { matchId: match.id } })
  const ops = predictions.map(p =>
    prisma.prediction.update({
      where: { id: p.id },
      data: { pointsAwarded: calcPredictionPoints(p.type, p.value, match.homeScore, match.awayScore) },
    })
  )

  if (match.status === 'FINISHED') {
    const advances = await prisma.knockoutAdvance.findMany({ where: { matchId: match.id } })
    for (const adv of advances) {
      const pts = match.winnerTeam && ['EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(match.scoreDuration)
        ? (adv.predictedTeam === match.winnerTeam ? 1 : 0)
        : 0
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
          data: { pointsAwarded: wp.predictedTeam === match.winnerTeam ? 50 : 0 },
        }))
      }
    }
  }

  if (ops.length > 0) await prisma.$transaction(ops)
}

async function main() {
  // Skip if no matches are scheduled or live today
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)

  const [dbLiveMatches, todayMatchCount] = await Promise.all([
    prisma.match.findMany({ where: { status: 'LIVE' } }),
    prisma.match.count({ where: { kickoff: { gte: todayStart, lte: todayEnd }, status: { in: ['SCHEDULED', 'LIVE'] } } }),
  ])

  if (dbLiveMatches.length === 0 && todayMatchCount === 0) return

  // Fetch live matches from API
  const res = await fetch(`${BASE_URL}/competitions/${COMPETITION}/matches?status=IN_PLAY,PAUSED`, {
    headers: getHeaders(),
  })
  if (!res.ok) {
    if (res.status === 429) { console.warn('[score-sync] Rate limited by API'); return }
    throw new Error(`[score-sync] API error ${res.status}: ${res.statusText}`)
  }
  const apiLiveMatches = (await res.json()).matches ?? []
  const apiLiveIds = new Set(apiLiveMatches.map(m => String(m.id)))

  let updated = 0

  // Update currently live matches + recalculate provisional points
  for (const m of apiLiveMatches) {
    const externalId = String(m.id)
    const existing = await prisma.match.findUnique({ where: { externalId } })
    if (!existing || existing.adminOverride) continue

    const scores = extractScores(m.score)
    const status = STATUS_MAP[m.status] ?? 'LIVE'

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
      console.warn(`[score-sync] Failed to check match ${dbMatch.externalId}:`, err?.message ?? err)
    }
  }

  if (updated > 0) console.log(`[score-sync] Recalculated points for ${updated} match(es)`)
}

main()
  .catch(err => {
    console.error('[score-sync] Fatal error:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
