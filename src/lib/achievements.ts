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
  matches: Array<{ stage: string; kickoff: number; points: number; exact: boolean }>
  advancePensCorrect: boolean
  tournamentWinnerCorrect: boolean
  totalPoints: number
  rank: number // 1-based position on the overall leaderboard
}

const CATALOG = {
  sharpshooter: { emoji: '🎯', name: 'Sharpshooter', description: '10 exact-score predictions' },
  hot_streak: { emoji: '🔥', name: 'Hot Streak', description: 'Correct result in 5 matches in a row' },
  oracle: { emoji: '🧠', name: 'Oracle', description: 'Predicted the tournament winner' },
  perfect_round: { emoji: '💯', name: 'Perfect Round', description: 'Every match right in a single round' },
  front_runner: { emoji: '🥇', name: 'Front Runner', description: 'Reached #1 on the leaderboard' },
  golden_eye: { emoji: '⚽', name: 'Golden Eye', description: 'Correct knockout advance decided on pens/ET' },
  century: { emoji: '📈', name: 'Century', description: 'Reached 100 points' },
  first_blood: { emoji: '🎬', name: 'First Blood', description: 'Your first points on the board' },
} as const

const RESULT_THRESHOLD = 3 // points that mean the match result was predicted correctly

function badge(id: keyof typeof CATALOG): Achievement {
  return { id, ...CATALOG[id] }
}

export function evaluateAchievements(input: AchievementInput): Achievement[] {
  const earned: Achievement[] = []
  const ordered = [...input.matches].sort((a, b) => a.kickoff - b.kickoff)

  if (ordered.filter((m) => m.exact).length >= 10) earned.push(badge('sharpshooter'))

  // Longest run of consecutive predicted matches with a correct result.
  let run = 0
  let longestRun = 0
  for (const match of ordered) {
    run = match.points >= RESULT_THRESHOLD ? run + 1 : 0
    longestRun = Math.max(longestRun, run)
  }
  if (longestRun >= 5) earned.push(badge('hot_streak'))

  if (input.tournamentWinnerCorrect) earned.push(badge('oracle'))

  // A "perfect round": a stage with 2+ predicted matches all scored as correct.
  const byStage = new Map<string, { total: number; correct: number }>()
  for (const match of ordered) {
    const entry = byStage.get(match.stage) ?? { total: 0, correct: 0 }
    entry.total++
    if (match.points >= RESULT_THRESHOLD) entry.correct++
    byStage.set(match.stage, entry)
  }
  if ([...byStage.values()].some((s) => s.total >= 2 && s.correct === s.total)) earned.push(badge('perfect_round'))

  if (input.rank === 1 && input.totalPoints > 0) earned.push(badge('front_runner'))
  if (input.advancePensCorrect) earned.push(badge('golden_eye'))
  if (input.totalPoints >= 100) earned.push(badge('century'))
  if (ordered.some((m) => m.points > 0)) earned.push(badge('first_blood'))

  return earned
}

// Builds achievement lists for every ranked member of a championship.
export async function getAchievementsByUser(
  memberIds: number[],
  championship: { id: number; doubleChanceEnabled: boolean },
  ranked: Array<{ id: number; total: number }>,
): Promise<Map<number, Achievement[]>> {
  const result = new Map<number, Achievement[]>()
  if (memberIds.length === 0) return result

  const rankByUser = new Map(ranked.map((r, index) => [r.id, index + 1]))
  const totalByUser = new Map(ranked.map((r) => [r.id, r.total]))

  const [predictions, advances, winnerPredictions] = await Promise.all([
    prisma.prediction.findMany({
      where: { championshipId: championship.id, userId: { in: memberIds }, pointsAwarded: { not: null } },
      select: { userId: true, type: true, pointsAwarded: true, matchId: true, match: { select: { stage: true, kickoff: true } } },
    }),
    prisma.knockoutAdvance.findMany({
      where: { championshipId: championship.id, userId: { in: memberIds }, pointsAwarded: { not: null } },
      select: { userId: true, pointsAwarded: true },
    }),
    prisma.tournamentWinnerPrediction.findMany({
      where: { championshipId: championship.id, userId: { in: memberIds }, pointsAwarded: { not: null } },
      select: { userId: true, pointsAwarded: true },
    }),
  ])

  // Aggregate per user → per match.
  type MatchAgg = { stage: string; kickoff: number; points: number; exact: boolean }
  const perUserMatch = new Map<number, Map<number, MatchAgg>>()
  for (const p of predictions) {
    if (!championship.doubleChanceEnabled && p.type === 'DOUBLE_CHANCE') continue
    const byMatch = perUserMatch.get(p.userId) ?? new Map<number, MatchAgg>()
    const agg = byMatch.get(p.matchId) ?? { stage: p.match.stage, kickoff: p.match.kickoff.getTime(), points: 0, exact: false }
    agg.points += p.pointsAwarded ?? 0
    if (p.type === 'EXACT_SCORE' && (p.pointsAwarded ?? 0) > 0) agg.exact = true
    byMatch.set(p.matchId, agg)
    perUserMatch.set(p.userId, byMatch)
  }

  const advancePensByUser = new Set(advances.filter((a) => (a.pointsAwarded ?? 0) > 0).map((a) => a.userId))
  const winnerByUser = new Set(winnerPredictions.filter((w) => (w.pointsAwarded ?? 0) > 0).map((w) => w.userId))

  for (const userId of memberIds) {
    const matches = [...(perUserMatch.get(userId)?.values() ?? [])]
    result.set(userId, evaluateAchievements({
      matches,
      advancePensCorrect: advancePensByUser.has(userId),
      tournamentWinnerCorrect: winnerByUser.has(userId),
      totalPoints: totalByUser.get(userId) ?? 0,
      rank: rankByUser.get(userId) ?? memberIds.length,
    }))
  }

  return result
}
