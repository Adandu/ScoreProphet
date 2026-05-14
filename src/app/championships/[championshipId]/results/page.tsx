import { prisma } from '@/lib/db'
import { requireChampionshipAccess } from '@/lib/championships'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import { ChampionshipPageNav } from '@/components/championship-page-nav'

function pointsBadge(pts: number | null) {
  if (pts === null) return <span className="text-white/30">-</span>
  const cls = pts === 5 ? 'bg-yellow-500' : pts === 3 ? 'bg-green-600' : pts === 1 ? 'bg-blue-600' : 'bg-white/10'
  return <Badge className={`${cls} text-white text-xs`}>{pts} pt{pts !== 1 ? 's' : ''}</Badge>
}

export default async function ChampionshipResultsPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccess(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'
  const memberIds = championship.members.map((member) => member.userId)
  const members = championship.members.map((member) => member.user)

  const matches = await prisma.match.findMany({
    where: { status: 'FINISHED' },
    orderBy: { kickoff: 'desc' },
    include: {
      predictions: { where: { userId: { in: memberIds } }, include: { user: true } },
      advances: { where: { userId: { in: memberIds } }, include: { user: true } },
    },
  })

  return (
    <div className="space-y-8">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Results</h2>
      {matches.length === 0 && <p className="text-white/40">No completed matches yet.</p>}
      {matches.map((match) => (
        <div key={match.id} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="font-semibold text-white">
              {match.homeTeam} {match.homeScore}-{match.awayScore} {match.awayTeam}
            </span>
            <span className="text-xs text-white/40">{formatMatchTime(match.kickoff, timezone)}</span>
          </div>
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
      ))}
    </div>
  )
}
