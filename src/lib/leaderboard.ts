import { prisma } from '@/lib/db'

export interface RankedUser {
  id: number
  username: string
  total: number
  exact: number
  single: number
  double?: number
  advance: number
  winner: number
}

export async function getRankedUsers(
  userIds: number[],
  championship: { id: number; doubleChanceEnabled: boolean }
): Promise<RankedUser[]> {
  if (userIds.length === 0) return []

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: {
      predictions: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
      advances: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
      winnerPredictions: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
    },
  })

  return users
    .map((u) => {
      const exactPts = u.predictions
        .filter((p) => p.type === 'EXACT_SCORE')
        .reduce((sum, p) => sum + (p.pointsAwarded ?? 0), 0)
      const singlePts = u.predictions
        .filter((p) => p.type === 'SINGLE_OUTCOME')
        .reduce((sum, p) => sum + (p.pointsAwarded ?? 0), 0)
      const doublePts = u.predictions
        .filter((p) => p.type === 'DOUBLE_CHANCE')
        .reduce((sum, p) => sum + (p.pointsAwarded ?? 0), 0)
      const advancePts = u.advances.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0)
      const winnerPts = u.winnerPredictions.reduce((sum, w) => sum + (w.pointsAwarded ?? 0), 0)

      const result: RankedUser = {
        id: u.id,
        username: u.username,
        total: exactPts + singlePts + (championship.doubleChanceEnabled ? doublePts : 0) + advancePts + winnerPts,
        exact: u.predictions.filter((p) => p.type === 'EXACT_SCORE' && (p.pointsAwarded ?? 0) > 0).length,
        single: u.predictions.filter((p) => p.type === 'SINGLE_OUTCOME' && (p.pointsAwarded ?? 0) > 0).length,
        advance: u.advances.filter((a) => (a.pointsAwarded ?? 0) > 0).length,
        winner: u.winnerPredictions.filter((w) => (w.pointsAwarded ?? 0) > 0).length,
      }

      if (championship.doubleChanceEnabled) {
        result.double = u.predictions.filter(
          (p) => p.type === 'DOUBLE_CHANCE' && (p.pointsAwarded ?? 0) > 0
        ).length
      }

      return result
    })
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))
}
