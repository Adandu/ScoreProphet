import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requireChampionshipAccess } from '@/lib/championships'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import { formatDisplayScore } from '@/lib/format-score'
import { ChampionshipPageNav } from '@/components/championship-page-nav'

const PAGE_SIZE = 10

function pointsBadge(pts: number | null) {
  if (pts === null) return <span className="text-white/30">-</span>
  const cls = pts === 5 ? 'bg-yellow-500' : pts === 3 ? 'bg-green-600' : pts === 1 ? 'bg-blue-600' : 'bg-white/10'
  return <Badge className={`${cls} text-white text-xs`}>{pts} pt{pts !== 1 ? 's' : ''}</Badge>
}

export default async function ChampionshipResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ championshipId: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const page = Math.max(1, parseInt((await searchParams).page ?? '1', 10))
  const { session, championship } = await requireChampionshipAccess(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'
  const memberIds = championship.members.map((member) => member.userId)
  const members = championship.members.map((member) => member.user)

  const [totalMatches, matches] = await Promise.all([
    prisma.match.count({ where: { status: { in: ['FINISHED', 'LIVE'] } } }),
    prisma.match.findMany({
      where: { status: { in: ['FINISHED', 'LIVE'] } },
      orderBy: { kickoff: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        predictions: { where: { userId: { in: memberIds } }, include: { user: true } },
        advances: { where: { userId: { in: memberIds } }, include: { user: true } },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Results</h2>
      {totalMatches === 0 && <p className="text-white/40">No completed or live matches yet.</p>}
      {matches.map((match) => {
        const detailHref = match.status === 'LIVE' ? '/live' : `/matches/${match.externalId}`
        return (
        <div key={match.id} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <Link href={detailHref} className="flex items-center justify-between px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors group">
            <span className="font-semibold text-white">
              {match.homeTeam} {formatDisplayScore(match)} {match.awayTeam}
            </span>
            <div className="flex items-center gap-3">
              {match.status === 'LIVE' && (
                <span className="text-xs font-semibold uppercase tracking-wider text-red-400">● Live</span>
              )}
              <span className="text-xs text-white/40">{formatMatchTime(match.kickoff, timezone)}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
            </div>
          </Link>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-2 text-left text-white/40 font-normal">Player</th>
                  <th className="px-4 py-2 text-left text-white/40 font-normal">Result</th>
                  {championship.doubleChanceEnabled && <th className="px-4 py-2 text-left text-white/40 font-normal">Double</th>}
                  <th className="px-4 py-2 text-left text-white/40 font-normal">Score</th>
                  {match.stage !== 'GROUP' && <th className="px-4 py-2 text-left text-white/40 font-normal">Advance</th>}
                  <th className="px-4 py-2 text-left text-white/40 font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {members.map((user) => {
                  const preds = match.predictions.filter((p) => p.userId === user.id)
                  const advance = match.advances.find((a) => a.userId === user.id)
                  const single = preds.find((p) => p.type === 'SINGLE_OUTCOME')
                  const double_ = preds.find((p) => p.type === 'DOUBLE_CHANCE')
                  const exact = preds.find((p) => p.type === 'EXACT_SCORE')
                  const doublePoints = championship.doubleChanceEnabled ? (double_?.pointsAwarded ?? 0) : 0
                  const total =
                    (single?.pointsAwarded ?? 0) +
                    doublePoints +
                    (exact?.pointsAwarded ?? 0) +
                    (advance?.pointsAwarded ?? 0)
                  if (!single && !double_ && !exact && !advance) return null
                  return (
                    <tr key={user.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-2 text-white font-medium">{user.username}</td>
                      <td className="px-4 py-2">{single ? <>{single.value} {pointsBadge(single.pointsAwarded)}</> : <span className="text-white/20">-</span>}</td>
                      {championship.doubleChanceEnabled && <td className="px-4 py-2">{double_ ? <>{double_.value} {pointsBadge(double_.pointsAwarded)}</> : <span className="text-white/20">-</span>}</td>}
                      <td className="px-4 py-2">{exact ? <>{exact.value} {pointsBadge(exact.pointsAwarded)}</> : <span className="text-white/20">-</span>}</td>
                      {match.stage !== 'GROUP' && <td className="px-4 py-2">{advance ? <>{advance.predictedTeam} {pointsBadge(advance.pointsAwarded)}</> : <span className="text-white/20">-</span>}</td>}
                      <td className="px-4 py-2 font-bold text-[#C9A84C]">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )})}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          {page > 1 ? (
            <Link
              href={`/championships/${championship.id}/results?page=${page - 1}`}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              ← Prev
            </Link>
          ) : (
            <span className="text-sm text-white/20">← Prev</span>
          )}
          <span className="text-sm text-white/40">Page {page} of {totalPages}</span>
          {page < totalPages ? (
            <Link
              href={`/championships/${championship.id}/results?page=${page + 1}`}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Next →
            </Link>
          ) : (
            <span className="text-sm text-white/20">Next →</span>
          )}
        </div>
      )}
    </div>
  )
}
