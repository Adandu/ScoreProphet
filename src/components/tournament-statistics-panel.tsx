import Image from 'next/image'
import Link from 'next/link'
import { getTournamentStatistics, type TeamRef, type StatEvent, type CountResult } from '@/lib/tournament-statistics'

export async function TournamentStatisticsPanel({ tournamentId }: { tournamentId: number }) {
  const stats = await getTournamentStatistics(tournamentId)
  const teamsByName = new Map(stats.teams.map((team) => [team.name, team]))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total goals" value={stats.totalGoals} />
        <MetricCard label="Finished matches" value={stats.completedMatches} />
        <MetricCard label="Average goals / match" value={stats.completedMatches ? (stats.totalGoals / stats.completedMatches).toFixed(2) : '-'} />
        <MetricCard label="Clean sheets" value={stats.cleanSheets} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatPanel title="Top Scorer">
          <CountPerson value={stats.topScorer} teamsByName={teamsByName} empty="No goal scorer data synced yet." />
        </StatPanel>
        <StatPanel title="Most Assists">
          <CountPerson value={stats.topAssist} teamsByName={teamsByName} empty="No assist data synced yet." />
        </StatPanel>
        <StatPanel title="Fastest Goal">
          <EventLine event={stats.fastestGoal} teamsByName={teamsByName} empty="No goal event data synced yet." />
        </StatPanel>
        <StatPanel title="Most Goals by Team">
          {stats.mostGoalsTeam ? (
            <TeamValue teamName={stats.mostGoalsTeam.teamName} value={`${stats.mostGoalsTeam.goalsFor} goals`} teamsByName={teamsByName} />
          ) : <EmptyText>No finished matches yet.</EmptyText>}
        </StatPanel>
        <StatPanel title="Fewest Goals Received">
          {stats.leastGoalsAgainstTeam ? (
            <TeamValue teamName={stats.leastGoalsAgainstTeam.teamName} value={`${stats.leastGoalsAgainstTeam.goalsAgainst} conceded`} teamsByName={teamsByName} />
          ) : <EmptyText>No finished matches yet.</EmptyText>}
        </StatPanel>
        <StatPanel title="Most Goals in a Match">
          {stats.mostGoalsMatch ? (
            <Link href={`/matches/${stats.mostGoalsMatch.externalId}`} className="block space-y-1 group">
              <p className="text-2xl font-bold text-white">{stats.mostGoalsMatch.homeScore + stats.mostGoalsMatch.awayScore} goals</p>
              <p className="flex items-center gap-2 text-sm text-white/60 group-hover:text-white transition-colors">
                {teamsByName.get(stats.mostGoalsMatch.homeTeam)?.crest && (
                  <Image src={teamsByName.get(stats.mostGoalsMatch.homeTeam)!.crest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain" />
                )}
                <span className="group-hover:underline decoration-[#C9A84C]/60 underline-offset-2">
                  {stats.mostGoalsMatch.homeTeam} {stats.mostGoalsMatch.homeScore} - {stats.mostGoalsMatch.awayScore} {stats.mostGoalsMatch.awayTeam}
                </span>
                {teamsByName.get(stats.mostGoalsMatch.awayTeam)?.crest && (
                  <Image src={teamsByName.get(stats.mostGoalsMatch.awayTeam)!.crest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain" />
                )}
              </p>
            </Link>
          ) : <EmptyText>No finished matches yet.</EmptyText>}
        </StatPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatPanel title="Yellow Cards">
          <p className="text-2xl font-bold text-white">{stats.yellowCount}</p>
          <EventLine event={stats.fastestYellow} teamsByName={teamsByName} empty="No yellow card data synced yet." prefix="Fastest" compact />
        </StatPanel>
        <StatPanel title="Red Cards">
          <p className="text-2xl font-bold text-white">{stats.redCount}</p>
          <EventLine event={stats.fastestRed} teamsByName={teamsByName} empty="No red card data synced yet." prefix="Fastest" compact />
        </StatPanel>
        {/* The feed only provides aggregate foul/corner counts, never per-event
            data, so these panels show totals without a "fastest" line. */}
        <StatPanel title="Fouls">
          <p className="text-2xl font-bold text-white">{stats.foulsTotal}</p>
        </StatPanel>
        <StatPanel title="Corners">
          <p className="text-2xl font-bold text-white">{stats.cornersTotal}</p>
        </StatPanel>
        <StatPanel title="Youngest Player">
          {stats.youngestPlayer ? <TeamValue teamName={stats.youngestPlayer.teamName} value={`${stats.youngestPlayer.name} · ${stats.youngestPlayer.dateOfBirth}`} teamsByName={teamsByName} /> : <EmptyText>No squad birthdate data synced yet.</EmptyText>}
        </StatPanel>
        <StatPanel title="Oldest Player">
          {stats.oldestPlayer ? <TeamValue teamName={stats.oldestPlayer.teamName} value={`${stats.oldestPlayer.name} · ${stats.oldestPlayer.dateOfBirth}`} teamsByName={teamsByName} /> : <EmptyText>No squad birthdate data synced yet.</EmptyText>}
        </StatPanel>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
    </section>
  )
}

function StatPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">{title}</h2>
      {children}
    </section>
  )
}

function TeamValue({ teamName, value, teamsByName }: { teamName: string; value: string; teamsByName: Map<string, TeamRef> }) {
  return (
    <div className="flex items-center gap-3">
      <TeamIdentity teamName={teamName} teamsByName={teamsByName} />
      <span className="text-sm font-semibold text-white/75">{value}</span>
    </div>
  )
}

function CountPerson({ value, teamsByName, empty }: { value: CountResult | null; teamsByName: Map<string, TeamRef>; empty: string }) {
  if (!value) return <EmptyText>{empty}</EmptyText>
  const [playerName, teamName] = value.key.split('|||')
  return (
    <div className="space-y-3">
      <p className="text-2xl font-bold text-white">{playerName}</p>
      <div className="flex items-center gap-3">
        <TeamIdentity teamName={teamName} teamsByName={teamsByName} />
        <span className="text-sm font-semibold text-white/75">{value.count}</span>
      </div>
    </div>
  )
}

function EventLine({
  event,
  teamsByName,
  empty,
  prefix,
  compact = false,
}: {
  event: StatEvent | null
  teamsByName: Map<string, TeamRef>
  empty: string
  prefix?: string
  compact?: boolean
}) {
  if (!event) return <EmptyText>{empty}</EmptyText>
  return (
    <div className={compact ? 'mt-3 space-y-2' : 'space-y-3'}>
      <p className={compact ? 'text-sm font-semibold text-white' : 'text-2xl font-bold text-white'}>
        {prefix ? `${prefix}: ` : ''}{event.playerName || 'Unknown player'}
      </p>
      <TeamIdentity teamName={event.teamName} teamsByName={teamsByName} />
      <p className="text-sm text-white/55">
        {event.minute} min · {event.match.homeTeam} vs {event.match.awayTeam}
      </p>
    </div>
  )
}

function TeamIdentity({ teamName, teamsByName }: { teamName: string; teamsByName: Map<string, TeamRef> }) {
  const team = teamsByName.get(teamName)
  const content = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        {team?.crest ? <Image src={team.crest} alt="" width={32} height={32} className="max-h-8 w-auto object-contain" /> : <span className="h-6 w-6 rounded bg-white/10" />}
      </span>
      <span className="text-sm font-medium text-white">{teamName || 'Unknown team'}</span>
    </>
  )
  if (!team) return <span className="inline-flex items-center gap-2">{content}</span>
  return (
    <Link href={`/teams/${team.externalId}`} className="inline-flex items-center gap-2 hover:opacity-80">
      {content}
    </Link>
  )
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-white/40">{children}</p>
}
