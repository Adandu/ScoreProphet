import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LiveMatchCard } from '@/components/live-match-card'
import { Countdown } from '@/components/countdown'
import { fetchHeadToHead } from '@/lib/football-api'

export const revalidate = 60

async function getFeaturedMatches() {
  const now = new Date()
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const upcoming = await prisma.match.findMany({
    where: {
      OR: [
        { status: 'LIVE' },
        { status: 'SCHEDULED', kickoff: { gt: now, lte: next24Hours } },
      ],
    },
    orderBy: { kickoff: 'asc' },
  })

  if (upcoming.length > 0) return upcoming

  const fallback = await prisma.match.findFirst({
    where: { status: 'SCHEDULED', kickoff: { gt: now } },
    orderBy: { kickoff: 'asc' },
  })

  return fallback ? [fallback] : []
}

export default async function HomePage() {
  const [matches, user] = await Promise.all([getFeaturedMatches(), getCurrentUser()])
  const timezone = user?.timezone ?? 'Europe/Bucharest'
  const headToHeadByMatch = new Map(
    await Promise.all(
      matches.map(async (match) => {
        try {
          return [match.id, await fetchHeadToHead(match.externalId, 10)] as const
        } catch {
          return [match.id, null] as const
        }
      })
    )
  )

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">
        World Cup 2026 <span className="text-[#C9A84C]">Predictions</span>
      </h1>
      {matches.length > 0 ? (
        <div className="mx-auto grid w-full justify-items-center gap-4">
          {matches.map((match) => (
            (() => {
              const headToHead = headToHeadByMatch.get(match.id)

              return (
                <LiveMatchCard
                  key={match.id}
                  match={{
                    homeTeam: match.homeTeam,
                    awayTeam: match.awayTeam,
                    homeTeamCrest: match.homeTeamCrest,
                    awayTeamCrest: match.awayTeamCrest,
                    homeTeamUrl: headToHead?.homeTeamId ? `/teams/${headToHead.homeTeamId}` : undefined,
                    awayTeamUrl: headToHead?.awayTeamId ? `/teams/${headToHead.awayTeamId}` : undefined,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    status: match.status,
                    kickoff: match.kickoff.toISOString(),
                  }}
                  timezone={timezone}
                  countdown={match.status === 'SCHEDULED' ? <Countdown kickoff={match.kickoff.toISOString()} /> : undefined}
                  headToHead={headToHead?.matches ?? []}
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
