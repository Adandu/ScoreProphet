import { prisma } from '@/lib/db'

export interface Achievement {
  id: string
  emoji: string
  name: string
  description: string
}

export interface AchievementInput {
  // One entry per finished match the user predicted, with the total points they
  // earned on it and whether they landed an exact-score hit.
  matches: Array<{ matchId?: number; stage: string; kickoff: number; points: number; exact: boolean }>
  advancePensCorrect: boolean
  tournamentWinnerCorrect: boolean
  totalPoints: number
  rank: number // 1-based position on the overall leaderboard
  // Front Runner is held only by a sole leader; a tie at the top means nobody
  // holds it. Defaults to true for callers that don't track ties.
  soleLeader?: boolean
  // Context for badges not tied to the user's per-match points.
  finalMatch?: AchievementTrigger | null
  advancePensMatch?: AchievementTrigger | null
}

export interface AchievementTrigger {
  matchId?: number
  kickoff: number
}

export interface DetailedAchievement {
  achievement: Achievement
  // The match that earned the badge, when derivable (Front Runner has none).
  trigger?: AchievementTrigger
}

const CATALOG = {
  sharpshooter: { emoji: '🎯', name: 'Sharpshooter', description: '10 exact-score predictions' },
  hot_streak: { emoji: '🔥', name: 'Hot Streak', description: 'Correct result in 5 matches in a row' },
  oracle: { emoji: '🧠', name: 'Oracle', description: 'Predicted the tournament winner' },
  perfect_round: { emoji: '💯', name: 'Perfect Round', description: 'Every match right in a single round' },
  front_runner: { emoji: '🥇', name: 'Front Runner', description: 'Currently #1 on the leaderboard — only one player holds this at a time' },
  golden_eye: { emoji: '⚽', name: 'Golden Eye', description: 'Correct knockout advance decided on pens/ET' },
  century: { emoji: '📈', name: 'Century', description: 'Reached 100 points' },
  first_blood: { emoji: '🎬', name: 'First Blood', description: 'Your first points on the board' },
} as const

const RESULT_THRESHOLD = 3 // points that mean the match result was predicted correctly

function badge(id: keyof typeof CATALOG): Achievement {
  return { id, ...CATALOG[id] }
}

export function evaluateAchievements(input: AchievementInput): Achievement[] {
  return evaluateAchievementsDetailed(input).map((d) => d.achievement)
}

export function evaluateAchievementsDetailed(input: AchievementInput): DetailedAchievement[] {
  const earned: DetailedAchievement[] = []
  const ordered = [...input.matches].sort((a, b) => a.kickoff - b.kickoff)
  const asTrigger = (m?: { matchId?: number; kickoff: number }): AchievementTrigger | undefined =>
    m ? { matchId: m.matchId, kickoff: m.kickoff } : undefined

  const exacts = ordered.filter((m) => m.exact)
  if (exacts.length >= 10) earned.push({ achievement: badge('sharpshooter'), trigger: asTrigger(exacts[9]) })

  // Longest run of consecutive predicted matches with a correct result;
  // the trigger is the match that first completed a run of 5.
  let run = 0
  let longestRun = 0
  let streakTrigger: AchievementTrigger | undefined
  for (const match of ordered) {
    run = match.points >= RESULT_THRESHOLD ? run + 1 : 0
    longestRun = Math.max(longestRun, run)
    if (run === 5 && !streakTrigger) streakTrigger = asTrigger(match)
  }
  if (longestRun >= 5) earned.push({ achievement: badge('hot_streak'), trigger: streakTrigger })

  if (input.tournamentWinnerCorrect) earned.push({ achievement: badge('oracle'), trigger: asTrigger(input.finalMatch ?? undefined) })

  // A "perfect round": a stage with 2+ predicted matches all scored as correct.
  // The trigger is the last match of the earliest-completed qualifying stage.
  const byStage = new Map<string, { total: number; correct: number; last: (typeof ordered)[number] }>()
  for (const match of ordered) {
    const entry = byStage.get(match.stage) ?? { total: 0, correct: 0, last: match }
    entry.total++
    if (match.points >= RESULT_THRESHOLD) entry.correct++
    if (match.kickoff >= entry.last.kickoff) entry.last = match
    byStage.set(match.stage, entry)
  }
  const perfectStages = [...byStage.values()].filter((s) => s.total >= 2 && s.correct === s.total)
  if (perfectStages.length > 0) {
    perfectStages.sort((a, b) => a.last.kickoff - b.last.kickoff)
    earned.push({ achievement: badge('perfect_round'), trigger: asTrigger(perfectStages[0].last) })
  }

  if (input.rank === 1 && input.totalPoints > 0 && (input.soleLeader ?? true)) earned.push({ achievement: badge('front_runner') })
  if (input.advancePensCorrect) earned.push({ achievement: badge('golden_eye'), trigger: asTrigger(input.advancePensMatch ?? undefined) })

  if (input.totalPoints >= 100) {
    // Trigger: the match whose points took the running match total to 100+.
    // Advance/winner bonus points can push the total past 100 without any
    // single match crossing it; in that case there is no trigger.
    let cumulative = 0
    let centuryTrigger: AchievementTrigger | undefined
    for (const match of ordered) {
      cumulative += match.points
      if (cumulative >= 100) { centuryTrigger = asTrigger(match); break }
    }
    earned.push({ achievement: badge('century'), trigger: centuryTrigger })
  }

  const firstScoring = ordered.find((m) => m.points > 0)
  if (firstScoring) earned.push({ achievement: badge('first_blood'), trigger: asTrigger(firstScoring) })

  return earned
}

// Builds achievement lists for every ranked member of a championship, and
// persists newly earned badges to UserAchievement (lazy award-on-read).
// earnedAt is backdated to the triggering match's kickoff when derivable, so
// the first run after deploy backfills history with sensible dates.
//
// Only FINISHED matches count: points are recalculated live while a match is
// in play, and a permanently-persisted badge must not be awarded off a
// provisional score. Totals and rank are likewise computed from finished
// results only, not the live leaderboard.
export async function getAchievementsByUser(
  memberIds: number[],
  championship: { id: number; doubleChanceEnabled: boolean; competitionCode?: string },
): Promise<Map<number, Achievement[]>> {
  const result = new Map<number, Achievement[]>()
  if (memberIds.length === 0) return result

  const [predictions, advances, winnerPredictions, finalMatchRow] = await Promise.all([
    prisma.prediction.findMany({
      where: { championshipId: championship.id, userId: { in: memberIds }, pointsAwarded: { not: null }, match: { status: 'FINISHED' } },
      select: { userId: true, type: true, pointsAwarded: true, matchId: true, match: { select: { stage: true, kickoff: true } } },
    }),
    prisma.knockoutAdvance.findMany({
      where: { championshipId: championship.id, userId: { in: memberIds }, pointsAwarded: { not: null }, match: { status: 'FINISHED' } },
      select: { userId: true, pointsAwarded: true, matchId: true, match: { select: { kickoff: true } } },
    }),
    prisma.tournamentWinnerPrediction.findMany({
      where: { championshipId: championship.id, userId: { in: memberIds }, pointsAwarded: { not: null } },
      select: { userId: true, pointsAwarded: true },
    }),
    championship.competitionCode
      ? prisma.match.findFirst({
          where: { competitionCode: championship.competitionCode, stage: 'FINAL', status: 'FINISHED' },
          select: { id: true, kickoff: true },
        })
      : Promise.resolve(null),
  ])

  // Aggregate per user → per match.
  type MatchAgg = { matchId: number; stage: string; kickoff: number; points: number; exact: boolean }
  const perUserMatch = new Map<number, Map<number, MatchAgg>>()
  for (const p of predictions) {
    if (!championship.doubleChanceEnabled && p.type === 'DOUBLE_CHANCE') continue
    const byMatch = perUserMatch.get(p.userId) ?? new Map<number, MatchAgg>()
    const agg = byMatch.get(p.matchId) ?? { matchId: p.matchId, stage: p.match.stage, kickoff: p.match.kickoff.getTime(), points: 0, exact: false }
    agg.points += p.pointsAwarded ?? 0
    if (p.type === 'EXACT_SCORE' && (p.pointsAwarded ?? 0) > 0) agg.exact = true
    byMatch.set(p.matchId, agg)
    perUserMatch.set(p.userId, byMatch)
  }

  const advancePensMatchByUser = new Map<number, AchievementTrigger>()
  for (const a of advances) {
    if ((a.pointsAwarded ?? 0) > 0 && !advancePensMatchByUser.has(a.userId)) {
      advancePensMatchByUser.set(a.userId, { matchId: a.matchId, kickoff: a.match.kickoff.getTime() })
    }
  }
  const winnerByUser = new Set(winnerPredictions.filter((w) => (w.pointsAwarded ?? 0) > 0).map((w) => w.userId))
  const finalMatch: AchievementTrigger | null = finalMatchRow
    ? { matchId: finalMatchRow.id, kickoff: finalMatchRow.kickoff.getTime() }
    : null

  // Totals and rank from finished results only (winner predictions are scored
  // when the final finishes, advances are filtered to finished matches above).
  const totalByUser = new Map<number, number>()
  for (const userId of memberIds) {
    const matchPoints = [...(perUserMatch.get(userId)?.values() ?? [])].reduce((sum, m) => sum + m.points, 0)
    totalByUser.set(userId, matchPoints)
  }
  for (const a of advances) totalByUser.set(a.userId, (totalByUser.get(a.userId) ?? 0) + (a.pointsAwarded ?? 0))
  for (const w of winnerPredictions) totalByUser.set(w.userId, (totalByUser.get(w.userId) ?? 0) + (w.pointsAwarded ?? 0))
  const sortedTotals = [...new Set(totalByUser.values())].sort((a, b) => b - a)
  const rankByUser = new Map(memberIds.map((id) => [id, sortedTotals.indexOf(totalByUser.get(id) ?? 0) + 1]))
  const maxTotal = sortedTotals[0] ?? 0
  const leadersAtMax = [...totalByUser.values()].filter((t) => t === maxTotal).length

  const detailedByUser = new Map<number, DetailedAchievement[]>()
  for (const userId of memberIds) {
    const matches = [...(perUserMatch.get(userId)?.values() ?? [])]
    const detailed = evaluateAchievementsDetailed({
      matches,
      advancePensCorrect: advancePensMatchByUser.has(userId),
      tournamentWinnerCorrect: winnerByUser.has(userId),
      totalPoints: totalByUser.get(userId) ?? 0,
      rank: rankByUser.get(userId) ?? memberIds.length,
      soleLeader: leadersAtMax === 1,
      finalMatch,
      advancePensMatch: advancePensMatchByUser.get(userId) ?? null,
    })
    detailedByUser.set(userId, detailed)
    result.set(userId, detailed.map((d) => d.achievement))
  }

  await persistNewAchievements(championship.id, detailedByUser)
  return result
}

async function persistNewAchievements(
  championshipId: number,
  detailedByUser: Map<number, DetailedAchievement[]>,
): Promise<void> {
  const existing = await prisma.userAchievement.findMany({
    where: { championshipId, userId: { in: [...detailedByUser.keys()] } },
    select: { userId: true, badgeId: true },
  })
  const have = new Set(existing.map((e) => `${e.userId}:${e.badgeId}`))

  const rows: Array<{ userId: number; championshipId: number; badgeId: string; earnedAt: Date; matchId: number | null }> = []
  for (const [userId, detailed] of detailedByUser) {
    for (const d of detailed) {
      // Front Runner is a transient status (sole current leader), never persisted.
      if (d.achievement.id === 'front_runner') continue
      if (have.has(`${userId}:${d.achievement.id}`)) continue
      rows.push({
        userId,
        championshipId,
        badgeId: d.achievement.id,
        earnedAt: d.trigger ? new Date(d.trigger.kickoff) : new Date(),
        matchId: d.trigger?.matchId ?? null,
      })
    }
  }
  if (rows.length > 0) {
    await prisma.userAchievement.createMany({ data: rows })
  }
}

export interface EarnedBadge {
  badgeId: string
  emoji: string
  name: string
  description: string
  earnedAt: Date
  championshipName: string
  match: { homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null } | null
}

export function getCatalog(): Achievement[] {
  return (Object.keys(CATALOG) as Array<keyof typeof CATALOG>).map((id) => badge(id))
}

// Earned badges for one user, optionally scoped to a championship. Assumes
// lazy award has run (any leaderboard/profile view triggers it).
export async function getUserEarnedBadges(userId: number, championshipId?: number): Promise<EarnedBadge[]> {
  const rows = await prisma.userAchievement.findMany({
    where: { userId, ...(championshipId !== undefined ? { championshipId } : {}) },
    orderBy: { earnedAt: 'asc' },
    select: {
      badgeId: true,
      earnedAt: true,
      championship: { select: { name: true } },
      match: { select: { homeTeam: true, awayTeam: true, homeScore: true, awayScore: true } },
    },
  })
  return rows
    .filter((r): r is typeof r & { badgeId: keyof typeof CATALOG } => r.badgeId in CATALOG)
    .map((r) => ({
      badgeId: r.badgeId,
      ...CATALOG[r.badgeId],
      earnedAt: r.earnedAt,
      championshipName: r.championship.name,
      match: r.match,
    }))
}
