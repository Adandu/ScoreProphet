import { getCurrentUser } from '@/lib/auth'
import { requireChampionshipAccessLean, getChampionshipMemberIds } from '@/lib/championships'
import { getRankedUsers } from '@/lib/leaderboard'
import { getAchievementsByUser, type Achievement } from '@/lib/achievements'
import { ChampionshipPageNav } from '@/components/championship-page-nav'
import { LeaderboardTabs } from '@/components/leaderboard-tabs'

export default async function ChampionshipLeaderboardPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const [{ championship }, currentUser] = await Promise.all([
    requireChampionshipAccessLean(championshipId),
    getCurrentUser(),
  ])

  const memberIds = await getChampionshipMemberIds(championship.id)
  const [overall, group, knockout] = await Promise.all([
    getRankedUsers(memberIds, championship, 'OVERALL'),
    getRankedUsers(memberIds, championship, 'GROUP'),
    getRankedUsers(memberIds, championship, 'KNOCKOUT'),
  ])

  const achievementsMap = await getAchievementsByUser(memberIds, championship)
  const achievementsByUser: Record<number, Achievement[]> = Object.fromEntries(achievementsMap)

  return (
    <div className="space-y-6">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Leaderboard</h2>
        <a href={`/championships/${championship.id}/head-to-head`} className="text-sm font-semibold text-[#C9A84C] hover:underline">
          Head-to-head →
        </a>
      </div>
      <LeaderboardTabs
        overall={overall}
        group={group}
        knockout={knockout}
        doubleChanceEnabled={championship.doubleChanceEnabled}
        currentUserId={currentUser?.userId}
        achievementsByUser={achievementsByUser}
        championshipId={championship.id}
      />
    </div>
  )
}
