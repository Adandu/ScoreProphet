import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchStandings } from '@/lib/football-api'
import { computeFormByTeam } from '@/lib/team-form'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'
import { MatchScheduleList } from '@/components/match-schedule-list'
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

  const [matches, allTeams] = await Promise.all([
    prisma.match.findMany({
      where: { ...(tournament ? { tournamentId: tournament.id } : {}) },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.team.findMany({ select: { externalId: true, name: true, crest: true }, orderBy: { name: 'asc' } }),
  ])

  // Derive which team names actually appear in this tournament's matches
  const tournamentTeamNames = new Set<string>()
  for (const m of matches) {
    if (m.homeTeam && m.homeTeam !== 'TBD') tournamentTeamNames.add(m.homeTeam)
    if (m.awayTeam && m.awayTeam !== 'TBD') tournamentTeamNames.add(m.awayTeam)
  }

  // Filter to only teams participating in the current tournament
  const teams = allTeams.filter((t) => tournamentTeamNames.has(t.name))

  const groupMatches = matches.filter((match) => match.stage === 'GROUP')
  const knockoutMatches = matches.filter((match) => match.stage !== 'GROUP')

  const teamIdByName: Record<string, string> = {}
  const teamCrestByName: Record<string, string> = {}
  for (const team of allTeams) {
    teamIdByName[team.name] = team.externalId
    if (team.crest) teamCrestByName[team.name] = team.crest
  }

  const formByTeam: Record<string, string> = {}
  try {
    for (const group of await fetchStandings(tournament?.competitionCode ?? 'WC')) {
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
      <Suspense fallback={<div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" /></div>}>
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
            tournament?.type === 'WORLD_CUP' ? (
              <KnockoutBracket
                timezone={timezone}
                matches={knockoutMatches.map((match) => ({
                  id: match.id,
                  externalId: match.externalId,
                  homeTeam: match.homeTeam,
                  awayTeam: match.awayTeam,
                  homeTeamCrest: match.homeTeamCrest || teamCrestByName[match.homeTeam] || undefined,
                  awayTeamCrest: match.awayTeamCrest || teamCrestByName[match.awayTeam] || undefined,
                  homeTeamUrl: teamIdByName[match.homeTeam] ? `/teams/${teamIdByName[match.homeTeam]}` : undefined,
                  awayTeamUrl: teamIdByName[match.awayTeam] ? `/teams/${teamIdByName[match.awayTeam]}` : undefined,
                  homeScore: match.scoreDuration === 'PENALTY_SHOOTOUT'
                    ? (match.regularTimeHomeScore ?? match.homeScore)
                    : (match.fullTimeHomeScore ?? match.homeScore),
                  awayScore: match.scoreDuration === 'PENALTY_SHOOTOUT'
                    ? (match.regularTimeAwayScore ?? match.awayScore)
                    : (match.fullTimeAwayScore ?? match.awayScore),
                  scoreDuration: match.scoreDuration,
                  penaltiesHomeScore: match.penaltiesHomeScore,
                  penaltiesAwayScore: match.penaltiesAwayScore,
                  winnerTeam: match.winnerTeam,
                  status: match.status,
                  stage: match.stage,
                  kickoff: match.kickoff.toISOString(),
                }))}
              />
            ) : (
              <MatchScheduleList
                matches={[...groupMatches, ...knockoutMatches].map((m) => ({
                  id: m.id,
                  homeTeam: m.homeTeam,
                  awayTeam: m.awayTeam,
                  homeTeamCrest: m.homeTeamCrest || undefined,
                  awayTeamCrest: m.awayTeamCrest || undefined,
                  homeScore: m.homeScore,
                  awayScore: m.awayScore,
                  status: m.status,
                  stage: m.stage,
                  kickoff: m.kickoff.toISOString(),
                }))}
                timezone={timezone}
              />
            )
          }
          teams={teamsTab}
          scorers={<TopScorersPanel competitionCode={tournament?.competitionCode ?? 'WC'} season={tournament?.season ?? undefined} />}
          statistics={tournament ? <TournamentStatisticsPanel tournamentId={tournament.id} /> : <p className="text-white/40">No tournament selected.</p>}
        />
      </Suspense>
    </div>
  )
}
