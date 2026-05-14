import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'
import { TournamentTabs } from '@/components/tournament-tabs'
import Link from 'next/link'

export const revalidate = 60

export default async function TournamentPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const matches = await prisma.match.findMany({ orderBy: { kickoff: 'asc' } })
  const groupMatches = matches.filter((match) => match.stage === 'GROUP')
  const knockoutMatches = matches.filter((match) => match.stage !== 'GROUP')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Tournament</h1>
        <Link href="/tournament/statistics" className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
          Statistics
        </Link>
      </div>
      <TournamentTabs
        groups={
          <GroupStageTab
            matches={groupMatches.map((match) => ({
              group: match.group,
              status: match.status,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              homeTeamCrest: match.homeTeamCrest,
              awayTeamCrest: match.awayTeamCrest,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
            }))}
          />
        }
        bracket={
          <KnockoutBracket
            timezone={timezone}
            matches={knockoutMatches.map((match) => ({
              id: match.id,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              winnerTeam: match.winnerTeam,
              status: match.status,
              stage: match.stage,
              kickoff: match.kickoff.toISOString(),
            }))}
          />
        }
      />
    </div>
  )
}
