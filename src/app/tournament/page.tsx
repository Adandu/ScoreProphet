import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'
import { TournamentTabs } from '@/components/tournament-tabs'
import { TournamentStatisticsPanel } from '@/components/tournament-statistics-panel'

export const revalidate = 60

export default async function TournamentPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const matches = await prisma.match.findMany({ orderBy: { kickoff: 'asc' } })
  const groupMatches = matches.filter((match) => match.stage === 'GROUP')
  const knockoutMatches = matches.filter((match) => match.stage !== 'GROUP')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Tournament</h1>
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
        statistics={<TournamentStatisticsPanel />}
      />
    </div>
  )
}
