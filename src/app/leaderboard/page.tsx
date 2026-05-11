import { prisma } from '@/lib/db'
import { getCurrentUser, requireAuth } from '@/lib/auth'

export const revalidate = 60

export default async function LeaderboardPage() {
  await requireAuth()
  const currentUser = await getCurrentUser()

  const users = await prisma.user.findMany({
    include: {
      predictions: { where: { pointsAwarded: { not: null } } },
      advances: { where: { pointsAwarded: { not: null } } },
    },
  })

  const ranked = users
    .map((u) => ({
      id: u.id,
      username: u.username,
      total: u.predictions.reduce((s, p) => s + (p.pointsAwarded ?? 0), 0) +
             u.advances.reduce((s, a) => s + (a.pointsAwarded ?? 0), 0),
      exact: u.predictions.filter((p) => p.type === 'EXACT_SCORE' && (p.pointsAwarded ?? 0) > 0).length,
      single: u.predictions.filter((p) => p.type === 'SINGLE_OUTCOME' && (p.pointsAwarded ?? 0) > 0).length,
      double: u.predictions.filter((p) => p.type === 'DOUBLE_CHANCE' && (p.pointsAwarded ?? 0) > 0).length,
    }))
    .sort((a, b) => b.total - a.total)

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-white/40 font-normal w-12">#</th>
              <th className="px-4 py-3 text-left text-white/40 font-normal">Player</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Exact</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Result</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Double</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((u, i) => {
              const isCurrentUser = u.id === currentUser?.userId
              return (
                <tr
                  key={u.id}
                  className={`border-b border-white/5 last:border-0 ${isCurrentUser ? 'bg-[#C9A84C]/10' : ''}`}
                >
                  <td className="px-4 py-3 text-white/60">
                    {medals[i] ?? i + 1}
                  </td>
                  <td className={`px-4 py-3 font-medium ${isCurrentUser ? 'text-[#C9A84C]' : 'text-white'}`}>
                    {u.username} {isCurrentUser && '(you)'}
                  </td>
                  <td className="px-4 py-3 text-right text-yellow-400">{u.exact}</td>
                  <td className="px-4 py-3 text-right text-green-400">{u.single}</td>
                  <td className="px-4 py-3 text-right text-blue-400">{u.double}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#C9A84C] text-base">{u.total}</td>
                </tr>
              )
            })}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/30">
                  No scores yet — predictions are being evaluated.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
