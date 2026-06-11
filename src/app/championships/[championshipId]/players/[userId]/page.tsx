import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireChampionshipAccessLean, getChampionshipMemberIds } from '@/lib/championships'
import { getRankedUsers } from '@/lib/leaderboard'
import { getAchievementsByUser, getCatalog, getUserEarnedBadges } from '@/lib/achievements'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import { formatDisplayScore } from '@/lib/format-score'
import { ChampionshipPageNav } from '@/components/championship-page-nav'

const PREDICTION_LABEL: Record<string, string> = {
  EXACT_SCORE: 'Exact',
  SINGLE_OUTCOME: 'Outcome',
  DOUBLE_CHANCE: 'Double',
}

function pointsBadge(pts: number | null) {
  if (pts === null) return <span className="text-white/30">-</span>
  const cls = pts === 5 ? 'bg-yellow-500' : pts === 3 ? 'bg-green-600' : pts === 1 ? 'bg-blue-600' : 'bg-white/10'
  return <Badge className={`${cls} text-white text-xs`}>{pts} pt{pts !== 1 ? 's' : ''}</Badge>
}

function formatEarnedDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ championshipId: string; userId: string }> }) {
  const { championshipId: rawChampionshipId, userId: rawUserId } = await params
  const championshipId = parseInt(rawChampionshipId, 10)
  const playerId = parseInt(rawUserId, 10)
  // Same guard as the leaderboard: viewer must be a member of this championship (or admin).
  const { session, championship } = await requireChampionshipAccessLean(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'

  if (!Number.isInteger(playerId) || playerId <= 0) notFound()
  const membership = await prisma.championshipMember.findFirst({
    where: { championshipId, userId: playerId },
    select: { user: { select: { id: true, username: true, createdAt: true } } },
  })
  if (!membership) notFound()
  const player = membership.user

  const memberIds = await getChampionshipMemberIds(championshipId)
  const [overall, achievementsMap] = await Promise.all([
    getRankedUsers(memberIds, championship, 'OVERALL'),
    getAchievementsByUser(memberIds, championship),
  ])
  const rankIndex = overall.findIndex((u) => u.id === playerId)
  const ranked = rankIndex >= 0 ? overall[rankIndex] : null
  const holdsFrontRunner = achievementsMap.get(playerId)?.some((a) => a.id === 'front_runner') ?? false
  const frontRunner = getCatalog().find((a) => a.id === 'front_runner')!
  const earned = await getUserEarnedBadges(playerId, championshipId)

  // Prediction history: only matches that have kicked off (LIVE or FINISHED) —
  // picks for upcoming matches are never shown.
  const [matches, advances, winnerPrediction, firstGroupMatch] = await Promise.all([
    prisma.match.findMany({
      where: { status: { in: ['FINISHED', 'LIVE'] } },
      orderBy: { kickoff: 'desc' },
      include: {
        predictions: { where: { userId: playerId, championshipId } },
      },
    }),
    prisma.knockoutAdvance.findMany({ where: { userId: playerId, championshipId } }),
    prisma.tournamentWinnerPrediction.findFirst({ where: { userId: playerId, championshipId } }),
    prisma.match.findFirst({
      where: { stage: 'GROUP', competitionCode: championship.competitionCode },
      orderBy: { kickoff: 'asc' },
      select: { kickoff: true },
    }),
  ])
  const advanceByMatch = new Map(advances.map((a) => [a.matchId, a]))
  const playedMatches = matches.filter((m) => m.predictions.length > 0 || advanceByMatch.has(m.id))
  // The tournament-winner pick is public only once picks are locked.
  const isWinnerLocked = Boolean(firstGroupMatch && firstGroupMatch.kickoff <= new Date())

  return (
    <div className="space-y-6">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-bold text-white">{player.username}</h1>
          {ranked && (
            <span className="text-sm text-white/50">
              #{rankIndex + 1} on the leaderboard · <span className="font-bold text-[#C9A84C]">{ranked.total} pts</span>
            </span>
          )}
        </div>
        {isWinnerLocked && winnerPrediction && (
          <p className="mt-2 text-sm text-white/50">
            Tournament winner pick: <span className="font-semibold text-white">{winnerPrediction.predictedTeam}</span>
            {winnerPrediction.pointsAwarded != null && winnerPrediction.pointsAwarded > 0 && (
              <span className="text-[#C9A84C]"> (+{winnerPrediction.pointsAwarded} pts)</span>
            )}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-white">Badges</h2>
        {earned.length === 0 && !holdsFrontRunner && (
          <p className="mt-2 text-sm text-white/40">No badges earned yet.</p>
        )}
        <ul className="mt-3 space-y-3">
          {holdsFrontRunner && (
            <li className="flex items-start gap-3">
              <span className="text-2xl leading-none">{frontRunner.emoji}</span>
              <div>
                <div className="text-sm font-semibold text-[#C9A84C]">{frontRunner.name}</div>
                <div className="text-xs text-white/60">{frontRunner.description}</div>
                <div className="mt-0.5 text-xs text-white/40">Currently held</div>
              </div>
            </li>
          )}
          {earned.map((b) => (
            <li key={b.badgeId} className="flex items-start gap-3">
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
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Prediction history</h2>
        {playedMatches.length === 0 && (
          <p className="text-sm text-white/40">No predictions on played matches yet.</p>
        )}
        {playedMatches.map((match) => {
          const visiblePredictions = championship.doubleChanceEnabled
            ? match.predictions
            : match.predictions.filter((p) => p.type !== 'DOUBLE_CHANCE')
          const advance = advanceByMatch.get(match.id)
          return (
            <div key={match.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={match.status === 'LIVE' ? '/live' : `/matches/${match.externalId}`}
                  className="font-semibold text-white hover:underline decoration-[#C9A84C]/60 underline-offset-2"
                >
                  {match.homeTeam} {formatDisplayScore(match)} {match.awayTeam}
                </Link>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  {match.status === 'LIVE' && <span className="font-semibold uppercase tracking-wider text-red-400">● Live</span>}
                  <span>{formatMatchTime(match.kickoff, timezone)}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                {visiblePredictions.map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5">
                    <span className="text-white/40">{PREDICTION_LABEL[p.type] ?? p.type}:</span>
                    <span className="font-semibold text-white">{p.value}</span>
                    {pointsBadge(p.pointsAwarded)}
                  </span>
                ))}
                {advance && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-white/40">Advance:</span>
                    <span className="font-semibold text-white">{advance.predictedTeam}</span>
                    {pointsBadge(advance.pointsAwarded)}
                  </span>
                )}
                {visiblePredictions.length === 0 && !advance && (
                  <span className="text-white/30">No prediction</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
