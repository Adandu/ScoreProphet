import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LiveMatchCard } from '@/components/live-match-card'
import { Countdown } from '@/components/countdown'
import { parseStoredHeadToHead } from '@/lib/head-to-head'
import { getSelectedChampionship } from '@/lib/championships'

export const revalidate = 60

async function getFeaturedMatches() {
  const now = new Date()
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  let upcoming
  try {
    upcoming = await prisma.match.findMany({
      where: {
        OR: [
          { status: 'LIVE' },
          { status: 'SCHEDULED', kickoff: { gt: now, lte: next24Hours } },
        ],
      },
      orderBy: { kickoff: 'asc' },
    })
  } catch {
    return []
  }

  if (upcoming.length > 0) return upcoming

  let fallback
  try {
    fallback = await prisma.match.findFirst({
      where: { status: 'SCHEDULED', kickoff: { gt: now } },
      orderBy: { kickoff: 'asc' },
    })
  } catch {
    return []
  }

  return fallback ? [fallback] : []
}

type RevealedPredictionsByMatch = Record<number, {
  championshipName: string
  players: Array<{
    userId: number
    username: string
    single: string | null
    double: string | null
    exact: string | null
    advance: string | null
  }>
}>

async function getRevealedPredictionsByMatch(
  matchIds: number[],
  championshipId: number,
  championshipName: string
): Promise<RevealedPredictionsByMatch> {
  if (matchIds.length === 0) return {}

  const [members, predictions, advances] = await Promise.all([
    prisma.championshipMember.findMany({
      where: { championshipId },
      include: { user: true },
      orderBy: { user: { username: 'asc' } },
    }),
    prisma.prediction.findMany({
      where: { championshipId, matchId: { in: matchIds } },
      select: { userId: true, matchId: true, type: true, value: true },
    }),
    prisma.knockoutAdvance.findMany({
      where: { championshipId, matchId: { in: matchIds } },
      select: { userId: true, matchId: true, predictedTeam: true },
    }),
  ])

  const predictionsByKey = new Map<string, typeof predictions>()
  for (const prediction of predictions) {
    const key = `${prediction.matchId}:${prediction.userId}`
    const rows = predictionsByKey.get(key) ?? []
    rows.push(prediction)
    predictionsByKey.set(key, rows)
  }

  const advanceByKey = new Map(advances.map((advance) => [`${advance.matchId}:${advance.userId}`, advance.predictedTeam]))

  return Object.fromEntries(
    matchIds.map((matchId) => [
      matchId,
      {
        championshipName,
        players: members.map((member) => {
          const rows = predictionsByKey.get(`${matchId}:${member.userId}`) ?? []
          return {
            userId: member.userId,
            username: member.user.username,
            single: rows.find((row) => row.type === 'SINGLE_OUTCOME')?.value ?? null,
            double: rows.find((row) => row.type === 'DOUBLE_CHANCE')?.value ?? null,
            exact: rows.find((row) => row.type === 'EXACT_SCORE')?.value ?? null,
            advance: advanceByKey.get(`${matchId}:${member.userId}`) ?? null,
          }
        }),
      },
    ])
  )
}

export default async function HomePage() {
  const [matches, user] = await Promise.all([getFeaturedMatches(), getCurrentUser()])
  const timezone = user?.timezone ?? 'Europe/Bucharest'
  const selectedChampionship = user ? await getSelectedChampionship(user.userId) : null
  const now = new Date()
  const startedMatchIds = matches
    .filter((match) => match.status !== 'SCHEDULED' || match.kickoff <= now)
    .map((match) => match.id)
  const revealedPredictionsByMatch = selectedChampionship
    ? await getRevealedPredictionsByMatch(startedMatchIds, selectedChampionship.id, selectedChampionship.name)
    : {}

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">
        World Cup 2026 <span className="text-[#C9A84C]">Predictions</span>
      </h1>
      {matches.length > 0 ? (
        <div className="mx-auto grid w-full justify-items-center gap-4">
          {matches.map((match) => (
            (() => {
              const headToHead = parseStoredHeadToHead(match.headToHeadJson)

              return (
                <LiveMatchCard
                  key={match.id}
                  match={{
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    homeTeamCrest: match.homeTeamCrest,
                    awayTeamCrest: match.awayTeamCrest,
                    homeTeamUrl: match.headToHeadHomeTeamId ? `/teams/${match.headToHeadHomeTeamId}` : undefined,
                    awayTeamUrl: match.headToHeadAwayTeamId ? `/teams/${match.headToHeadAwayTeamId}` : undefined,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    status: match.status,
                    kickoff: match.kickoff.toISOString(),
                  }}
                  timezone={timezone}
                  countdown={match.status === 'SCHEDULED' ? <Countdown kickoff={match.kickoff.toISOString()} /> : undefined}
                  headToHead={headToHead}
                  revealedPredictions={revealedPredictionsByMatch[match.id]}
                />
              )
            })()
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-white/50">
          No matches scheduled yet. Check back soon.
        </div>
      )}
    </div>
  )
}
