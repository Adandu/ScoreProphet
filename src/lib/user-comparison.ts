import { prisma } from '@/lib/db'

export interface H2HMatchResult {
  matchId: number
  label: string
  kickoff: number
  aPoints: number
  bPoints: number
}

export interface HeadToHead {
  aWins: number
  bWins: number
  ties: number
  matches: H2HMatchResult[]
}

export function computeHeadToHead(
  a: Array<{ matchId: number; points: number }>,
  b: Array<{ matchId: number; points: number }>,
  meta: Record<number, { label: string; kickoff: number }>,
): HeadToHead {
  const aByMatch = new Map(a.map((m) => [m.matchId, m.points]))
  const bByMatch = new Map(b.map((m) => [m.matchId, m.points]))

  const matches: H2HMatchResult[] = []
  let aWins = 0
  let bWins = 0
  let ties = 0

  for (const [matchId, aPoints] of aByMatch) {
    if (!bByMatch.has(matchId)) continue
    const bPoints = bByMatch.get(matchId)!
    if (aPoints > bPoints) aWins++
    else if (bPoints > aPoints) bWins++
    else ties++
    const info = meta[matchId] ?? { label: '', kickoff: 0 }
    matches.push({ matchId, label: info.label, kickoff: info.kickoff, aPoints, bPoints })
  }

  matches.sort((x, y) => x.kickoff - y.kickoff)
  return { aWins, bWins, ties, matches }
}

// Loads each player's per-match points (across all prediction types) for a
// championship so two members can be compared head-to-head.
export async function getHeadToHead(
  championship: { id: number; doubleChanceEnabled: boolean },
  userAId: number,
  userBId: number,
): Promise<HeadToHead> {
  const predictions = await prisma.prediction.findMany({
    where: {
      championshipId: championship.id,
      userId: { in: [userAId, userBId] },
      pointsAwarded: { not: null },
    },
    select: { userId: true, matchId: true, type: true, pointsAwarded: true, match: { select: { homeTeam: true, awayTeam: true, kickoff: true } } },
  })

  const meta: Record<number, { label: string; kickoff: number }> = {}
  const points = new Map<number, Map<number, number>>([[userAId, new Map()], [userBId, new Map()]])

  for (const p of predictions) {
    if (!championship.doubleChanceEnabled && p.type === 'DOUBLE_CHANCE') continue
    meta[p.matchId] = { label: `${p.match.homeTeam} vs ${p.match.awayTeam}`, kickoff: p.match.kickoff.getTime() }
    const byMatch = points.get(p.userId)
    if (byMatch) byMatch.set(p.matchId, (byMatch.get(p.matchId) ?? 0) + (p.pointsAwarded ?? 0))
  }

  const toList = (userId: number) =>
    [...(points.get(userId)?.entries() ?? [])].map(([matchId, pts]) => ({ matchId, points: pts }))
  return computeHeadToHead(toList(userAId), toList(userBId), meta)
}
