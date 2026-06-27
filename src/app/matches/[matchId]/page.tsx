import { notFound } from 'next/navigation'
import { BackButton } from '@/components/back-button'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { LiveMatchPanel } from '@/components/live/live-match-panel'
import { fetchLiveMatchDetails, type NormalizedMatch, type LiveMatchDetails } from '@/lib/football-api'
import { canCallMatchDetailApi } from '@/lib/api-call-budget'
import { getCurrentTournament } from '@/lib/selected-tournament'
import type { Stage } from '@/lib/types'

export const revalidate = 0

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  await requireAuth()
  const { matchId } = await params

  const [match, dbTeams, tournament] = await Promise.all([
    prisma.match.findUnique({ where: { externalId: matchId } }),
    prisma.team.findMany({ select: { externalId: true, name: true } }).catch(() => []),
    getCurrentTournament(),
  ])
  if (!match || match.status !== 'FINISHED') notFound()
  // Verify the match belongs to the currently selected tournament
  if (tournament && match.tournamentId !== tournament.id) notFound()

  const teamUrlByName: Record<string, string> = {}
  for (const t of dbTeams) if (t.externalId) teamUrlByName[t.name] = t.externalId

  let prefetchedDetails: LiveMatchDetails | undefined

  // FINISHED match detail is only cached once it is complete (see guard below), so an
  // Use cached detailJson unless the score it recorded no longer matches the DB (stale mid-match cache).
  if (match.detailJson) {
    try {
      const cached: LiveMatchDetails = JSON.parse(match.detailJson)
      const scoreStale =
        cached.homeScore !== match.homeScore || cached.awayScore !== match.awayScore
      if (scoreStale) {
        await prisma.match.update({ where: { id: match.id }, data: { detailJson: '' } })
      } else {
        prefetchedDetails = cached
      }
    } catch { /* corrupted — refetch below */ }
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
      <LiveMatchPanel
        liveMatch={liveMatch}
        prefetchedDetails={prefetchedDetails}
        homeTeamUrl={teamUrlByName[match.homeTeam] ? `/teams/${teamUrlByName[match.homeTeam]}` : undefined}
        awayTeamUrl={teamUrlByName[match.awayTeam] ? `/teams/${teamUrlByName[match.awayTeam]}` : undefined}
      />
    </div>
  )
}
