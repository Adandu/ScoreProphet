import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchStandings } from '@/lib/football-api'
import { computeFormByTeam } from '@/lib/team-form'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'
import { TournamentTabs } from '@/components/tournament-tabs'
import { TournamentStatisticsPanel } from '@/components/tournament-statistics-panel'
import { TopScorersPanel } from '@/components/top-scorers-panel'

export default async function TournamentPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, teams] = await Promise.all([
    prisma.match.findMany({ orderBy: { kickoff: 'asc' } }),
    prisma.team.findMany({ select: { externalId: true, name: true } }),
  ])
  const groupMatches = matches.filter((match) => match.stage === 'GROUP')
  const knockoutMatches = matches.filter((match) => match.stage !== 'GROUP')

  // Name -> team id lookup so group-stage rows can link to each team's page.
  const teamIdByName: Record<string, string> = {}
  for (const team of teams) teamIdByName[team.name] = team.externalId

  // The standings feed leaves `form` null for tournaments, so derive form from
  // our own finished results; API form is only a fallback (best-effort).
  const formByTeam: Record<string, string> = {}
  try {
    for (const group of await fetchStandings()) {
      for (const row of group.table) if (row.form) formByTeam[row.teamName] = row.form
    }
  } catch {
    // Standings unavailable — local form below still populates.
  }
  Object.assign(formByTeam, computeFormByTeam(matches))

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
            teamIdByName={teamIdByName}
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
