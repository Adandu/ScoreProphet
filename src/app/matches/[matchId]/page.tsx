import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { LiveMatchPanel } from '@/components/live/live-match-panel'
import { fetchLiveMatchDetails, type NormalizedMatch, type LiveMatchDetails } from '@/lib/football-api'
import type { Stage } from '@/lib/types'

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  await requireAuth()
  const { matchId } = await params

  const match = await prisma.match.findUnique({ where: { externalId: matchId } })
  if (!match || match.status !== 'FINISHED') notFound()

  // Serve from cached detail JSON — fetch from API and cache on first visit
  let prefetchedDetails: LiveMatchDetails | undefined
  if (match.detailJson) {
    try {
      prefetchedDetails = JSON.parse(match.detailJson) as LiveMatchDetails
    } catch {
      // corrupted cache — will re-fetch below
    }
  }

  if (!prefetchedDetails) {
    try {
      prefetchedDetails = await fetchLiveMatchDetails(match.externalId)
      await prisma.match.update({
        where: { id: match.id },
        data: { detailJson: JSON.stringify(prefetchedDetails) },
      })
    } catch {
      // leave undefined — LiveMatchPanel will show error state
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
      <Link href="javascript:history.back()" className="text-sm text-white/40 hover:text-white/70 transition-colors">
        ← Back
      </Link>
      <LiveMatchPanel liveMatch={liveMatch} prefetchedDetails={prefetchedDetails} />
    </div>
  )
}
