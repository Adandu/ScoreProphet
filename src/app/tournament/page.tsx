import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchStandings } from '@/lib/football-api'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'
import { TournamentTabs } from '@/components/tournament-tabs'
import { TournamentStatisticsPanel } from '@/components/tournament-statistics-panel'
import { TopScorersPanel } from '@/components/top-scorers-panel'

export default async function TournamentPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const matches = await prisma.match.findMany({ orderBy: { kickoff: 'asc' } })
  const groupMatches = matches.filter((match) => match.stage === 'GROUP')
  const knockoutMatches = matches.filter((match) => match.stage !== 'GROUP')

  // Pull the last-5 form for each team from the official standings (best-effort).
  const formByTeam: Record<string, string> = {}
  try {
    for (const group of await fetchStandings()) {
      for (const row of group.table) formByTeam[row.teamName] = row.form
    }
  } catch {
    // Standings unavailable — the group tables simply render without form.
  }

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
            formByTeam={formByTeam}
          />
        }
        bracket={
          <KnockoutBracket
            timezone={timezone}
            matches={knockoutMatches.map((match) => ({
              id: match.id,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              homeScore: match.fullTimeHomeScore ?? match.homeScore,
              awayScore: match.fullTimeAwayScore ?? match.awayScore,
              scoreDuration: match.scoreDuration,
              penaltiesHomeScore: match.penaltiesHomeScore,
              penaltiesAwayScore: match.penaltiesAwayScore,
              winnerTeam: match.winnerTeam,
              status: match.status,
              stage: match.stage,
              kickoff: match.kickoff.toISOString(),
            }))}
          />
        }
        scorers={<TopScorersPanel />}
        statistics={<TournamentStatisticsPanel />}
      />
    </div>
  )
}
