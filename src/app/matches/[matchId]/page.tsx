import { notFound, redirect } from 'next/navigation'
import { BackButton } from '@/components/back-button'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { LiveMatchPanel } from '@/components/live/live-match-panel'
import { fetchLiveMatchDetails, type NormalizedMatch, type LiveMatchDetails } from '@/lib/football-api'
import { canCallMatchDetailApi } from '@/lib/api-call-budget'
import { getCurrentTournament } from '@/lib/selected-tournament'
import { getSelectedChampionship } from '@/lib/championships'
import type { Stage } from '@/lib/types'

export const revalidate = 0

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const session = await requireAuth()
  const { matchId } = await params

  const [match, dbTeams, tournament] = await Promise.all([
    prisma.match.findUnique({ where: { externalId: matchId } }),
    prisma.team.findMany({ select: { externalId: true, name: true } }).catch(() => []),
    getCurrentTournament(),
  ])
  if (!match || match.status !== 'FINISHED') notFound()
  // Verify the match belongs to the currently selected tournament
  if (tournament && match.tournamentId !== tournament.id) redirect('/')

  // Feature 2 + 5: fetch championship-scoped prediction data for finished matches
  const selectedChampionship = session.userId
    ? await getSelectedChampionship(session.userId, tournament?.id)
    : null

  type PredictionRow = { userId: number; type: string; value: string; pointsAwarded: number | null; user: { username: string } }
  type AggRow = { value: string; _count: { value: number } }
  type AdvanceRow = { userId: number; predictedTeam: string; pointsAwarded: number | null; user: { username: string } }

  let predictionReveal: PredictionRow[] | null = null
  let predictionAgg: AggRow[] | null = null
  let advanceReveal: AdvanceRow[] | null = null

  if (selectedChampionship) {
    ;[predictionReveal, predictionAgg, advanceReveal] = await Promise.all([
      prisma.prediction.findMany({
        where: {
          matchId: match.id,
          championshipId: selectedChampionship.id,
        },
        select: {
          userId: true,
          type: true,
          value: true,
          pointsAwarded: true,
          user: { select: { username: true } },
        },
      }),
      prisma.prediction.groupBy({
        by: ['value'],
        where: { matchId: match.id, type: 'SINGLE_OUTCOME', championshipId: selectedChampionship.id },
        _count: { value: true },
      }),
      prisma.knockoutAdvance.findMany({
        where: { matchId: match.id, championshipId: selectedChampionship.id },
        select: {
          userId: true,
          predictedTeam: true,
          pointsAwarded: true,
          user: { select: { username: true } },
        },
      }),
    ])
  }

  // Build per-user reveal data sorted by total points desc
  type UserReveal = {
    userId: number
    username: string
    outcome: string | null
    outcomePoints: number | null
    exactScore: string | null
    exactPoints: number | null
    advance: string | null
    advancePoints: number | null
    total: number
  }

  const isKnockout = match.stage !== 'GROUP'
  let revealRows: UserReveal[] | null = null
  if (predictionReveal && predictionReveal.length > 0) {
    const byUser = new Map<number, UserReveal>()
    for (const p of predictionReveal) {
      const row = byUser.get(p.userId) ?? {
        userId: p.userId,
        username: p.user.username,
        outcome: null, outcomePoints: null,
        exactScore: null, exactPoints: null,
        advance: null, advancePoints: null,
        total: 0,
      }
      if (p.type === 'SINGLE_OUTCOME') { row.outcome = p.value; row.outcomePoints = p.pointsAwarded; row.total += p.pointsAwarded ?? 0 }
      if (p.type === 'EXACT_SCORE') { row.exactScore = p.value; row.exactPoints = p.pointsAwarded; row.total += p.pointsAwarded ?? 0 }
      byUser.set(p.userId, row)
    }
    for (const a of (advanceReveal ?? [])) {
      const row = byUser.get(a.userId)
      if (row) { row.advance = a.predictedTeam; row.advancePoints = a.pointsAwarded; row.total += a.pointsAwarded ?? 0 }
    }
    revealRows = [...byUser.values()].sort((a, b) => b.total - a.total)
  }

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

      {/* Feature 5 — Fan predictions poll */}
      {predictionAgg && predictionAgg.length > 0 && (() => {
        const total = predictionAgg!.reduce((sum, p) => sum + p._count.value, 0)
        return (
          <section className="mt-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/40">Fan predictions</h2>
            <div className="flex gap-2">
              {(['1', 'X', '2'] as const).map((outcome) => {
                const count = predictionAgg!.find((p) => p.value === outcome)?._count.value ?? 0
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                const label = outcome === '1' ? 'Home' : outcome === 'X' ? 'Draw' : 'Away'
                return (
                  <div key={outcome} className="flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-white/10 py-3">
                    <span className="text-xs text-white/40">{label}</span>
                    <span className="text-xl font-bold text-white">{pct}%</span>
                    <span className="text-[10px] text-white/30">{count} picks</span>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}

      {/* Feature 2 — Prediction reveal */}
      {revealRows && revealRows.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/40">How everyone predicted</h2>
          <div className="overflow-x-auto overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/30">
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-center">Result</th>
                  <th className="px-3 py-2 text-center">Score (90 min)</th>
                  {isKnockout && <th className="px-3 py-2 text-center">Advance</th>}
                  <th className="px-3 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {revealRows.map((row) => (
                  <tr key={row.userId} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 text-white/80">{row.username}</td>
                    <td className="px-3 py-2 text-center">
                      {row.outcome
                        ? <span className={`font-mono ${row.outcomePoints ? 'text-green-400' : 'text-white/50'}`}>{row.outcome}</span>
                        : <span className="text-white/20">-</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.exactScore
                        ? <span className={`font-mono ${row.exactPoints ? 'text-yellow-300' : 'text-white/50'}`}>{row.exactScore}</span>
                        : <span className="text-white/20">-</span>}
                    </td>
                    {isKnockout && (
                      <td className="px-3 py-2 text-center">
                        {row.advance
                          ? <span className={`text-xs ${row.advancePoints ? 'text-purple-300' : 'text-white/50'}`}>{row.advance}</span>
                          : <span className="text-white/20">-</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-semibold text-[#C9A84C]">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
