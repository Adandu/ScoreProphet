import Image from 'next/image'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireChampionshipAccessLean } from '@/lib/championships'
import { getHeadToHead } from '@/lib/user-comparison'
import { HeadToHeadPicker } from '@/components/head-to-head-picker'
import { PlayerStatsPanel } from '@/components/player-stats-panel'
import { computePlayerStats } from '@/lib/player-stats'

export default async function HeadToHeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ championshipId: string }>
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { championshipId: rawId } = await params
  const sp = await searchParams
  const championshipId = parseInt(rawId, 10)
  const [{ championship }, currentUser] = await Promise.all([
    requireChampionshipAccessLean(championshipId),
    getCurrentUser(),
  ])

  const members = (await prisma.championshipMember.findMany({
    where: { championshipId: championship.id },
    select: { user: { select: { id: true, username: true } } },
    orderBy: { user: { username: 'asc' } },
  })).map((m) => m.user)

  if (members.length < 2) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">Head-to-Head</h2>
        <p className="text-sm text-white/40">A head-to-head needs at least two members in this championship.</p>
      </div>
    )
  }

  const ids = members.map((m) => m.id)
  const aId = ids.includes(Number(sp.a)) ? Number(sp.a)
    : ids.includes(currentUser?.userId ?? -1) ? currentUser!.userId
      : ids[0]
  const bId = ids.includes(Number(sp.b)) && Number(sp.b) !== aId
    ? Number(sp.b)
    : ids.find((id) => id !== aId)!

  const aName = members.find((m) => m.id === aId)!.username
  const bName = members.find((m) => m.id === bId)!.username

  // Fetch data for H2H comparison and stats for both players
  const [h2h, aMatches, bMatches, aAdvances, bAdvances] = await Promise.all([
    getHeadToHead(championship, aId, bId),
    prisma.match.findMany({
      where: { status: { in: ['FINISHED', 'LIVE'] } },
      orderBy: { kickoff: 'asc' },
      include: { predictions: { where: { userId: aId, championshipId } } },
    }),
    prisma.match.findMany({
      where: { status: { in: ['FINISHED', 'LIVE'] } },
      orderBy: { kickoff: 'asc' },
      include: { predictions: { where: { userId: bId, championshipId } } },
    }),
    prisma.knockoutAdvance.findMany({ where: { userId: aId, championshipId } }),
    prisma.knockoutAdvance.findMany({ where: { userId: bId, championshipId } }),
  ])

  const aAdvanceMap = new Map(aAdvances.map((a) => [a.matchId, a]))
  const bAdvanceMap = new Map(bAdvances.map((b) => [b.matchId, b]))
  const aStats = computePlayerStats(aMatches, aAdvanceMap, championship.doubleChanceEnabled)
  const bStats = computePlayerStats(bMatches, bAdvanceMap, championship.doubleChanceEnabled)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Head-to-Head</h2>
      <HeadToHeadPicker members={members} aId={aId} bId={bId} />

      {/* Win/Draw/Loss summary */}
      <div className="grid grid-cols-3 items-center rounded-xl border border-white/10 bg-white/5 p-5 text-center">
        <div>
          <p className="truncate text-sm font-semibold text-white">{aName}</p>
          <p className="mt-1 text-3xl font-bold text-green-400">{h2h.aWins}</p>
          <p className="text-xs text-white/40">match wins</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50">Ties</p>
          <p className="mt-1 text-3xl font-bold text-white/70">{h2h.ties}</p>
          <p className="text-xs text-white/40">{h2h.matches.length} shared</p>
        </div>
        <div>
          <p className="truncate text-sm font-semibold text-white">{bName}</p>
          <p className="mt-1 text-3xl font-bold text-blue-400">{h2h.bWins}</p>
          <p className="text-xs text-white/40">match wins</p>
        </div>
      </div>

      {/* Per-match table with crests and scores */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40">
              <th className="px-4 py-3 text-left font-normal">Match</th>
              <th className="px-4 py-3 text-center font-normal">{aName}</th>
              <th className="px-4 py-3 text-center font-normal">{bName}</th>
            </tr>
          </thead>
          <tbody>
            {h2h.matches.map((m) => (
              <tr key={m.matchId} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {m.homeTeamCrest && (
                      <Image src={m.homeTeamCrest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain" />
                    )}
                    <span className="text-white/80">{m.homeTeam}</span>
                    <span className="font-bold tabular-nums text-[#C9A84C]">
                      {m.homeScore !== null && m.awayScore !== null
                        ? `${m.homeScore} – ${m.awayScore}`
                        : 'vs'}
                    </span>
                    <span className="text-white/80">{m.awayTeam}</span>
                    {m.awayTeamCrest && (
                      <Image src={m.awayTeamCrest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain" />
                    )}
                  </div>
                </td>
                <td className={`px-4 py-2.5 text-center tabular-nums ${m.aPoints > m.bPoints ? 'font-bold text-green-400' : 'text-white/60'}`}>{m.aPoints}</td>
                <td className={`px-4 py-2.5 text-center tabular-nums ${m.bPoints > m.aPoints ? 'font-bold text-blue-400' : 'text-white/60'}`}>{m.bPoints}</td>
              </tr>
            ))}
            {h2h.matches.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-white/30">
                  No finished matches both players have predicted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Stats comparison */}
      {(aStats.matchesPlayed > 0 || bStats.matchesPlayed > 0) && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-white">{aName} — Statistics</h3>
          <PlayerStatsPanel stats={aStats} />
          <h3 className="mt-2 text-base font-semibold text-white">{bName} — Statistics</h3>
          <PlayerStatsPanel stats={bStats} />
        </div>
      )}
    </div>
  )
}
