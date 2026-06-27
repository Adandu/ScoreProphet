import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchStandings } from '@/lib/football-api'
import { computeFormByTeam } from '@/lib/team-form'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'
import { TournamentTabs } from '@/components/tournament-tabs'
import { TournamentStatisticsPanel } from '@/components/tournament-statistics-panel'
import { TopScorersPanel } from '@/components/top-scorers-panel'
import { getCurrentTournament } from '@/lib/selected-tournament'
import Image from 'next/image'
import Link from 'next/link'

export default async function TournamentPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const tournament = await getCurrentTournament()

  const [matches, teams] = await Promise.all([
    prisma.match.findMany({
      where: { ...(tournament ? { tournamentId: tournament.id } : {}) },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.team.findMany({ select: { externalId: true, name: true, crest: true }, orderBy: { name: 'asc' } }),
  ])
  const groupMatches = matches.filter((match) => match.stage === 'GROUP')
  const knockoutMatches = matches.filter((match) => match.stage !== 'GROUP')

  const teamIdByName: Record<string, string> = {}
  for (const team of teams) teamIdByName[team.name] = team.externalId

  const formByTeam: Record<string, string> = {}
  try {
    for (const group of await fetchStandings()) {
      for (const row of group.table) if (row.form) formByTeam[row.teamName] = row.form
    }
  } catch {
    // Standings unavailable — local form below still populates.
  }
  Object.assign(formByTeam, computeFormByTeam(matches))

  const teamsTab = (
    <div className="space-y-6">
      {teams.length === 0 && (
        <p className="text-white/40">No teams yet — run a sync from the Admin panel.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {teams.map((team) => (
          <Link
            key={team.externalId}
            href={`/teams/${team.externalId}`}
            className="flex flex-col items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center">
              {team.crest ? (
                <Image src={team.crest} alt={team.name} width={48} height={48} className="object-contain max-h-12" />
              ) : (
                <div className="h-12 w-12 rounded bg-white/10" />
              )}
            </div>
            <span className="text-center text-sm font-medium text-white/80">{team.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Tournament</h1>
      <Suspense>
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
                homeTeamCrest: match.homeTeamCrest || undefined,
                awayTeamCrest: match.awayTeamCrest || undefined,
                homeTeamUrl: teamIdByName[match.homeTeam] ? `/teams/${teamIdByName[match.homeTeam]}` : undefined,
                awayTeamUrl: teamIdByName[match.awayTeam] ? `/teams/${teamIdByName[match.awayTeam]}` : undefined,
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
          teams={teamsTab}
          scorers={<TopScorersPanel />}
          statistics={<TournamentStatisticsPanel />}
        />
      </Suspense>
    </div>
  )
}
