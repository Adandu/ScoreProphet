import { getCurrentUser } from '@/lib/auth'
import { requireChampionshipAccessLean, getChampionshipMemberIds } from '@/lib/championships'
import { getRankedUsers } from '@/lib/leaderboard'
import { ChampionshipPageNav } from '@/components/championship-page-nav'

export default async function ChampionshipLeaderboardPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const [{ championship }, currentUser] = await Promise.all([
    requireChampionshipAccessLean(championshipId),
    getCurrentUser(),
  ])

  const memberIds = await getChampionshipMemberIds(championship.id)
  const ranked = await getRankedUsers(memberIds, championship)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-6">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Leaderboard</h2>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-white/40 font-normal w-12">#</th>
              <th className="px-4 py-3 text-left text-white/40 font-normal">Player</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Exact</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Result</th>
              {championship.doubleChanceEnabled && (
                <th className="px-4 py-3 text-right text-white/40 font-normal">Double</th>
              )}
              <th className="px-4 py-3 text-right text-white/40 font-normal">Advance</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Winner</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((u, i) => {
              const isCurrentUser = u.id === currentUser?.userId
              return (
                <tr key={u.id} className={`border-b border-white/5 last:border-0 ${isCurrentUser ? 'bg-[#C9A84C]/10' : ''}`}>
                  <td className="px-4 py-3 text-white/60">{medals[i] ?? i + 1}</td>
                  <td className={`px-4 py-3 font-medium ${isCurrentUser ? 'text-[#C9A84C]' : 'text-white'}`}>
                    {u.username} {isCurrentUser && '(you)'}
                  </td>
                  <td className="px-4 py-3 text-right text-yellow-400">{u.exact}</td>
                  <td className="px-4 py-3 text-right text-green-400">{u.single}</td>
                  {championship.doubleChanceEnabled && (
                    <td className="px-4 py-3 text-right text-blue-400">{u.double ?? 0}</td>
                  )}
                  <td className="px-4 py-3 text-right text-purple-400">{u.advance}</td>
                  <td className="px-4 py-3 text-right text-amber-400">{u.winner}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#C9A84C] text-base">{u.total}</td>
                </tr>
              )
            })}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={championship.doubleChanceEnabled ? 8 : 7} className="px-4 py-8 text-center text-white/30">
                  No championship members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
