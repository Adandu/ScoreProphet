import { prisma } from '@/lib/db'
import { getChampionshipMemberIds } from '@/lib/championships'
import { getRankedUsers } from '@/lib/leaderboard'
import { getAchievementsByUser, getCatalog, getUserEarnedBadges } from '@/lib/achievements'

function formatEarnedDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export async function ProfileBadges({ userId, timezone }: { userId: number; timezone: string }) {
  // Lazy-award pass over the user's championships so the profile is fresh
  // even if nobody has opened a leaderboard since the badges were earned.
  const memberships = await prisma.championshipMember.findMany({
    where: { userId },
    select: { championship: { select: { id: true, doubleChanceEnabled: true, competitionCode: true } } },
  })
  for (const { championship } of memberships) {
    const memberIds = await getChampionshipMemberIds(championship.id)
    const overall = await getRankedUsers(memberIds, championship, 'OVERALL')
    await getAchievementsByUser(memberIds, championship, overall)
  }

  const earned = await getUserEarnedBadges(userId)
  const earnedIds = new Set(earned.map((b) => b.badgeId))
  const locked = getCatalog().filter((a) => !earnedIds.has(a.id))
  const showChampionship = new Set(earned.map((b) => b.championshipName)).size > 1

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-white">Badges</h2>
      <p className="mt-0.5 text-sm text-white/50">
        {earned.length > 0
          ? `You have earned ${earned.length} of ${earned.length + locked.length} badges.`
          : 'No badges yet — they are earned through your predictions.'}
      </p>

      {earned.length > 0 && (
        <ul className="mt-4 space-y-3">
          {earned.map((b) => (
            <li key={`${b.championshipName}-${b.badgeId}`} className="flex items-start gap-3">
              <span className="text-2xl leading-none">{b.emoji}</span>
              <div>
                <div className="text-sm font-semibold text-[#C9A84C]">{b.name}</div>
                <div className="text-xs text-white/60">{b.description}</div>
                <div className="mt-0.5 text-xs text-white/40">
                  {formatEarnedDate(b.earnedAt, timezone)}
                  {b.match && (
                    <>
                      {' · '}
                      {b.match.homeTeam} {b.match.homeScore != null && b.match.awayScore != null
                        ? `${b.match.homeScore}–${b.match.awayScore}`
                        : 'vs'} {b.match.awayTeam}
                    </>
                  )}
                  {showChampionship && <> · {b.championshipName}</>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {locked.length > 0 && (
        <>
          <div className="mt-5 text-xs font-bold uppercase tracking-widest text-white/30">Still to earn</div>
          <ul className="mt-2 space-y-2">
            {locked.map((a) => (
              <li key={a.id} className="flex items-start gap-3 opacity-50">
                <span className="text-2xl leading-none grayscale">{a.emoji}</span>
                <div>
                  <div className="text-sm font-semibold text-white/70">{a.name}</div>
                  <div className="text-xs text-white/50">{a.description}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
