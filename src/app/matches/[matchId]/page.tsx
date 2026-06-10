import { notFound } from 'next/navigation'
import { BackButton } from '@/components/back-button'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { LiveMatchPanel } from '@/components/live/live-match-panel'
import { fetchLiveMatchDetails, type NormalizedMatch, type LiveMatchDetails } from '@/lib/football-api'
import { canCallMatchDetailApi } from '@/lib/api-call-budget'
import type { Stage } from '@/lib/types'

export const revalidate = 0

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  await requireAuth()
  const { matchId } = await params

  const match = await prisma.match.findUnique({ where: { externalId: matchId } })
  if (!match || match.status !== 'FINISHED') notFound()

  let prefetchedDetails: LiveMatchDetails | undefined

  // FINISHED match detail is only cached once it is complete (see guard below), so an
  // existing detailJson is authoritative — serve it as a pure read with no API call / write.
  if (match.detailJson) {
    try { prefetchedDetails = JSON.parse(match.detailJson) } catch { /* corrupted — refetch below */ }
  }

  // Only hit the API the first time (no/corrupted cache) and when under the rate-limit budget.
  if (!prefetchedDetails && canCallMatchDetailApi()) {
    try {
      const details = await fetchLiveMatchDetails(match.externalId)
      prefetchedDetails = details
      // Only persist if the response looks complete (has goals for matches that should have them).
      const hasGoals = details.goals.length > 0
      const expectsGoals = (match.homeScore ?? 0) + (match.awayScore ?? 0) > 0
      if (hasGoals || !expectsGoals) {
        await prisma.match.update({
          where: { id: match.id },
          data: { detailJson: JSON.stringify(details) },
        })
      }
    } catch {
      // API failed and no usable cache — the panel renders without prefetched details.
    }
  }

  const liveMatch: NormalizedMatch = {
    externalId: match.externalId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeTeamCrest: match.homeTeamCrest,
    awayTeamCrest: match.awayTeamCrest,
    stage: match.stage as Stage,
    group: match.group,
    kickoff: match.kickoff,
    status: 'FINISHED',
    scoreDuration: match.scoreDuration as 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT',
    regularTimeHomeScore: match.regularTimeHomeScore,
    regularTimeAwayScore: match.regularTimeAwayScore,
    fullTimeHomeScore: match.fullTimeHomeScore,
    fullTimeAwayScore: match.fullTimeAwayScore,
    extraTimeHomeScore: match.extraTimeHomeScore,
    extraTimeAwayScore: match.extraTimeAwayScore,
    penaltiesHomeScore: match.penaltiesHomeScore,
    penaltiesAwayScore: match.penaltiesAwayScore,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    winnerTeam: match.winnerTeam,
  }

  return (
    <div className="space-y-6">
      <BackButton className="text-sm text-white/40 hover:text-white/70 transition-colors" />
      <LiveMatchPanel liveMatch={liveMatch} prefetchedDetails={prefetchedDetails} />
    </div>
  )
}
