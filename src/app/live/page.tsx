import { fetchLiveMatches, type NormalizedMatch } from '@/lib/football-api'
import { LivePageRefresh } from '@/components/live-page-refresh'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PreMatchPanel } from '@/components/live/pre-match-panel'
import { LiveMatchPanel } from '@/components/live/live-match-panel'

export const revalidate = 5

export default async function LivePage() {
  await requireAuth()

  const now = new Date()
  const soonCutoff = new Date(now.getTime() + 15 * 60 * 1000)

  let liveMatches: NormalizedMatch[]
  try {
    liveMatches = await fetchLiveMatches()
  } catch {
    liveMatches = []
  }

  const upcomingMatches = await prisma.match.findMany({
    where: { status: 'SCHEDULED', kickoff: { gte: now, lte: soonCutoff } },
    orderBy: { kickoff: 'asc' },
  })

  const hasActivity = liveMatches.length > 0 || upcomingMatches.length > 0

  if (!hasActivity) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="text-2xl font-bold text-white">No live match right now</h1>
        <p className="text-white/50">Check back when a match is in play.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <LivePageRefresh isLive={hasActivity} />
      {upcomingMatches.map((match) => (
        <PreMatchPanel key={match.id} match={match} now={now} />
      ))}
      {liveMatches.map((liveMatch) => (
        <LiveMatchPanel key={liveMatch.externalId} liveMatch={liveMatch} />
      ))}
    </div>
  )
}
