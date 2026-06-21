import { prisma } from '@/lib/db'

export type LeaderboardScope = 'OVERALL' | 'GROUP' | 'KNOCKOUT'

export interface RankedUser {
  id: number
  username: string
  isBot: boolean
  total: number
  exact: number
  single: number
  double?: number
  advance: number
  winner: number
}

export async function getRankedUsers(
  userIds: number[],
  championship: { id: number; doubleChanceEnabled: boolean },
  scope: LeaderboardScope = 'OVERALL'
): Promise<RankedUser[]> {
  if (userIds.length === 0) return []

  // Restrict predictions by the stage of their match; advances are knockout-only
  // and the tournament-winner pick only contributes to the overall standing.
  const stageFilter =
    scope === 'GROUP' ? { match: { stage: 'GROUP' as const } }
      : scope === 'KNOCKOUT' ? { match: { stage: { not: 'GROUP' as const } } }
        : {}
  const advancesInclude = scope !== 'GROUP'
    ? { where: { pointsAwarded: { not: null }, championshipId: championship.id } }
    : false
  const winnerInclude = scope === 'OVERALL'
    ? { where: { pointsAwarded: { not: null }, championshipId: championship.id } }
    : false

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: {
      predictions: { where: { pointsAwarded: { not: null }, championshipId: championship.id, ...stageFilter } },
      advances: advancesInclude,
      winnerPredictions: winnerInclude,
    },
  })

  return users
    .map((u) => {
      const pred = u.predictions.reduce(
        (acc, p) => {
          const pts = p.pointsAwarded ?? 0
          if (p.type === 'EXACT_SCORE') { acc.exactPts += pts; if (pts > 0) acc.exact++ }
          else if (p.type === 'SINGLE_OUTCOME') { acc.singlePts += pts; if (pts > 0) acc.single++ }
          else if (p.type === 'DOUBLE_CHANCE') { acc.doublePts += pts; if (pts > 0) acc.double++ }
          return acc
        },
        { exactPts: 0, singlePts: 0, doublePts: 0, exact: 0, single: 0, double: 0 }
      )
      const advances = u.advances ?? []
      const winnerPredictions = u.winnerPredictions ?? []
      const advancePts = advances.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0)
      const advance = advances.filter((a) => (a.pointsAwarded ?? 0) > 0).length
      const winnerPts = winnerPredictions.reduce((sum, w) => sum + (w.pointsAwarded ?? 0), 0)
      const winner = winnerPredictions.filter((w) => (w.pointsAwarded ?? 0) > 0).length

      const result: RankedUser = {
        id: u.id,
        username: u.username,
        isBot: u.isBot,
        total: pred.exactPts + pred.singlePts + (championship.doubleChanceEnabled ? pred.doublePts : 0) + advancePts + winnerPts,
        exact: pred.exact,
        single: pred.single,
        advance,
        winner,
      }

      if (championship.doubleChanceEnabled) result.double = pred.double

      return result
    })
    .sort((a, b) => b.total - a.total || b.exact - a.exact || b.single - a.single || b.advance - a.advance || a.username.localeCompare(b.username))
}
