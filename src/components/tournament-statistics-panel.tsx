import Image from 'next/image'
import Link from 'next/link'
import { prisma } from '@/lib/db'

type TeamRef = {
  externalId: string
  name: string
  crest: string
}

type TeamWithSquad = TeamRef & {
  squadJson: string
}

type StatEvent = {
  type: string
  minute: number
  teamName: string
  playerName: string
  relatedPlayerName: string
  match: {
    homeTeam: string
    awayTeam: string
    homeScore: number | null
    awayScore: number | null
  }
}

type SquadPerson = {
  name?: string
  firstName?: string
  lastName?: string
  dateOfBirth?: string
}

const MIN_PLAYER_AGE = 15
const MAX_PLAYER_AGE = 60

export async function TournamentStatisticsPanel() {
  const [matches, events, teamStats, teams] = await Promise.all([
    prisma.match.findMany({
      where: { status: 'FINISHED' },
      orderBy: { kickoff: 'asc' },
      select: { homeTeam: true, awayTeam: true, homeScore: true, awayScore: true },
    }),
    prisma.matchEvent.findMany({
      select: {
        type: true,
        minute: true,
        teamName: true,
        playerName: true,
        relatedPlayerName: true,
        match: {
          select: {
            homeTeam: true,
            awayTeam: true,
            homeScore: true,
            awayScore: true,
          },
        },
      },
      orderBy: [{ minute: 'asc' }, { id: 'asc' }],
    }),
    prisma.matchTeamStat.findMany({
      select: { type: true, value: true },
    }),
    prisma.team.findMany({
      orderBy: { name: 'asc' },
      select: { externalId: true, name: true, crest: true, squadJson: true },
    }),
  ])

  const teamsByName = new Map(teams.map((team) => [team.name, team]))
  const totalGoals = matches.reduce((sum, match) => sum + (match.homeScore ?? 0) + (match.awayScore ?? 0), 0)
  const completedMatches = matches.length
  const teamTotals = getTeamTotals(matches)
  const mostGoalsTeam = [...teamTotals.values()].sort((a, b) => b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName))[0]
  const leastGoalsAgainstTeam = [...teamTotals.values()]
    .filter((team) => team.played > 0)
    .sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.teamName.localeCompare(b.teamName))[0]
  const topScorer = topCount(events.filter((event) => event.type === 'GOAL' && event.playerName), (event) => `${event.playerName}|||${event.teamName}`)
  const topAssist = topCount(events.filter((event) => event.type === 'GOAL' && event.relatedPlayerName), (event) => `${event.relatedPlayerName}|||${event.teamName}`)
  const fastestGoal = fastest(events, 'GOAL')
  const yellowCards = events.filter((event) => event.type === 'YELLOW_CARD' || event.type === 'YELLOW_RED_CARD')
  const redCards = events.filter((event) => event.type === 'RED_CARD' || event.type === 'YELLOW_RED_CARD')
  const foulsTotal = getStatTotal(teamStats, 'FOULS', events, 'FOUL')
  const cornersTotal = getStatTotal(teamStats, 'CORNERS', events, 'CORNER')
  const mostGoalsMatch = matches
    .filter((match) => match.homeScore !== null && match.awayScore !== null)
    .sort((a, b) => (b.homeScore! + b.awayScore!) - (a.homeScore! + a.awayScore!))[0]
  const cleanSheets = countCleanSheets(matches)
  const youngestPlayer = getAgeExtreme(teams, 'youngest')
  const oldestPlayer = getAgeExtreme(teams, 'oldest')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total goals" value={totalGoals} />
        <MetricCard label="Finished matches" value={completedMatches} />
        <MetricCard label="Average goals / match" value={completedMatches ? (totalGoals / completedMatches).toFixed(2) : '-'} />
        <MetricCard label="Clean sheets" value={cleanSheets} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatPanel title="Top Scorer">
          <CountPerson value={topScorer} teamsByName={teamsByName} empty="No goal scorer data synced yet." />
        </StatPanel>
        <StatPanel title="Most Assists">
          <CountPerson value={topAssist} teamsByName={teamsByName} empty="No assist data synced yet." />
        </StatPanel>
        <StatPanel title="Fastest Goal">
          <EventLine event={fastestGoal} teamsByName={teamsByName} empty="No goal event data synced yet." />
        </StatPanel>
        <StatPanel title="Most Goals by Team">
          {mostGoalsTeam ? (
            <TeamValue teamName={mostGoalsTeam.teamName} value={`${mostGoalsTeam.goalsFor} goals`} teamsByName={teamsByName} />
          ) : <EmptyText>No finished matches yet.</EmptyText>}
        </StatPanel>
        <StatPanel title="Fewest Goals Received">
          {leastGoalsAgainstTeam ? (
            <TeamValue teamName={leastGoalsAgainstTeam.teamName} value={`${leastGoalsAgainstTeam.goalsAgainst} conceded`} teamsByName={teamsByName} />
          ) : <EmptyText>No finished matches yet.</EmptyText>}
        </StatPanel>
        <StatPanel title="Most Goals in a Match">
          {mostGoalsMatch ? (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-white">{mostGoalsMatch.homeScore! + mostGoalsMatch.awayScore!} goals</p>
              <p className="text-sm text-white/60">
                {mostGoalsMatch.homeTeam} {mostGoalsMatch.homeScore} - {mostGoalsMatch.awayScore} {mostGoalsMatch.awayTeam}
              </p>
            </div>
          ) : <EmptyText>No finished matches yet.</EmptyText>}
        </StatPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatPanel title="Yellow Cards">
          <p className="text-2xl font-bold text-white">{yellowCards.length}</p>
          <EventLine event={fastestAny(yellowCards, ['YELLOW_CARD', 'YELLOW_RED_CARD'])} teamsByName={teamsByName} empty="No yellow card data synced yet." prefix="Fastest" compact />
        </StatPanel>
        <StatPanel title="Red Cards">
          <p className="text-2xl font-bold text-white">{redCards.length}</p>
          <EventLine event={fastestAny(redCards, ['RED_CARD', 'YELLOW_RED_CARD'])} teamsByName={teamsByName} empty="No red card data synced yet." prefix="Fastest" compact />
        </StatPanel>
        <StatPanel title="Fouls">
          <p className="text-2xl font-bold text-white">{foulsTotal}</p>
          <EventLine event={fastest(events, 'FOUL')} teamsByName={teamsByName} empty="No foul event data synced yet." prefix="Fastest" compact />
        </StatPanel>
        <StatPanel title="Corners">
          <p className="text-2xl font-bold text-white">{cornersTotal}</p>
          <EventLine event={fastest(events, 'CORNER')} teamsByName={teamsByName} empty="No corner event data synced yet." prefix="Fastest" compact />
        </StatPanel>
        <StatPanel title="Youngest Player">
          {youngestPlayer ? <TeamValue teamName={youngestPlayer.teamName} value={`${youngestPlayer.name} · ${youngestPlayer.dateOfBirth}`} teamsByName={teamsByName} /> : <EmptyText>No squad birthdate data synced yet.</EmptyText>}
        </StatPanel>
        <StatPanel title="Oldest Player">
          {oldestPlayer ? <TeamValue teamName={oldestPlayer.teamName} value={`${oldestPlayer.name} · ${oldestPlayer.dateOfBirth}`} teamsByName={teamsByName} /> : <EmptyText>No squad birthdate data synced yet.</EmptyText>}
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

type CountResult = { key: string; count: number }

function topCount<T>(items: T[], keyFn: (item: T) => string): CountResult | null {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyFn(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0] ?? null
}

function fastest(events: StatEvent[], type: string): StatEvent | null {
  return events.filter((event) => event.type === type).sort((a, b) => a.minute - b.minute)[0] ?? null
}

function fastestAny(events: StatEvent[], types: string[]): StatEvent | null {
  return events.filter((event) => types.includes(event.type)).sort((a, b) => a.minute - b.minute)[0] ?? null
}

function getTeamTotals(matches: Array<{ homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null }>) {
  const totals = new Map<string, { teamName: string; played: number; goalsFor: number; goalsAgainst: number }>()
  const ensure = (teamName: string) => {
    const existing = totals.get(teamName)
    if (existing) return existing
    const created = { teamName, played: 0, goalsFor: 0, goalsAgainst: 0 }
    totals.set(teamName, created)
    return created
  }
  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue
    const home = ensure(match.homeTeam)
    const away = ensure(match.awayTeam)
    home.played++
    away.played++
    home.goalsFor += match.homeScore
    home.goalsAgainst += match.awayScore
    away.goalsFor += match.awayScore
    away.goalsAgainst += match.homeScore
  }
  return totals
}

function getStatTotal(teamStats: Array<{ type: string; value: number }>, statType: string, events: StatEvent[], eventType: string) {
  const aggregateTotal = teamStats.filter((stat) => stat.type === statType).reduce((sum, stat) => sum + stat.value, 0)
  return aggregateTotal || events.filter((event) => event.type === eventType).length
}

function countCleanSheets(matches: Array<{ homeScore: number | null; awayScore: number | null }>) {
  return matches.reduce((count, match) => {
    if (match.homeScore === null || match.awayScore === null) return count
    return count + (match.homeScore === 0 ? 1 : 0) + (match.awayScore === 0 ? 1 : 0)
  }, 0)
}

function getAgeExtreme(teams: TeamWithSquad[], mode: 'youngest' | 'oldest') {
  const players = teams.flatMap((team) => parseJson<SquadPerson[]>(team.squadJson, []).map((person) => ({
    name: person.name ?? ([person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown'),
    dateOfBirth: person.dateOfBirth ?? '',
    teamName: team.name,
  }))).filter((person) => isPlausiblePlayerBirthdate(person.dateOfBirth))
  return players.sort((a, b) => mode === 'youngest'
    ? new Date(b.dateOfBirth).getTime() - new Date(a.dateOfBirth).getTime()
    : new Date(a.dateOfBirth).getTime() - new Date(b.dateOfBirth).getTime()
  )[0] ?? null
}

function isPlausiblePlayerBirthdate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const birthdate = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(birthdate.getTime())) return false

  const today = new Date()
  const age = today.getUTCFullYear() - birthdate.getUTCFullYear()
    - (today.getUTCMonth() < birthdate.getUTCMonth() ||
      (today.getUTCMonth() === birthdate.getUTCMonth() && today.getUTCDate() < birthdate.getUTCDate())
      ? 1
      : 0)

  return age >= MIN_PLAYER_AGE && age <= MAX_PLAYER_AGE
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
