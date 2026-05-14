import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LiveMatchCard } from '@/components/live-match-card'
import { Countdown } from '@/components/countdown'
import { parseStoredHeadToHead } from '@/lib/head-to-head'

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

export default async function HomePage() {
  const [matches, user] = await Promise.all([getFeaturedMatches(), getCurrentUser()])
  const timezone = user?.timezone ?? 'Europe/Bucharest'

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
