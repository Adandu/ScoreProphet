import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { isCoachEntry } from '@/lib/tournament-statistics'
import { formatDisplayScore } from '@/lib/format-score'

interface Props {
  params: Promise<{ teamId: string }>
}

interface DisplayTeam {
  externalId: string
  name: string
  shortName: string
  tla: string
  crest: string
  areaName: string
  areaCode: string
  address: string
  website: string
  founded: number | null
  clubColors: string
  venue: string
  coachName: string
  squadJson: string
  staffJson: string
  runningCompetitionsJson: string
  rawJson: string
  wcStatsJson: string
}

interface WcStats {
  worldCupsPlayed?: number
  allTimeStanding?: number | null
  titles?: number[]
  runnerUp?: number[]
  gamesPlayed?: number
  wins?: number
  draws?: number
  losses?: number
  goalsScored?: number | null
  goalsConceded?: number | null
  goalDifference?: string | null
}

interface ApiPerson {
  id?: number | string
  name?: string
  firstName?: string
  lastName?: string
  dateOfBirth?: string
  nationality?: string
  position?: string
  shirtNumber?: number
  section?: string
  role?: string
  contract?: { start?: string; until?: string }
}

interface ApiCompetition {
  id?: number | string
  name?: string
  code?: string
  type?: string
  emblem?: string
}

export default async function TeamDetailPage({ params }: Props) {
  await requireAuth()
  const { teamId } = await params
  const team: DisplayTeam | null = await prisma.team.findUnique({ where: { externalId: teamId } })
  if (!team) notFound()

  const tournamentMatches = await prisma.match.findMany({
    where: {
      status: { in: ['FINISHED', 'LIVE'] },
      OR: [{ homeTeam: team.name }, { awayTeam: team.name }],
    },
    orderBy: { kickoff: 'asc' },
    select: {
      id: true, externalId: true, status: true, kickoff: true, stage: true, group: true,
      homeTeam: true, awayTeam: true, homeTeamCrest: true, awayTeamCrest: true,
      homeScore: true, awayScore: true, scoreDuration: true,
      regularTimeHomeScore: true, regularTimeAwayScore: true,
    },
  })

  const squadAndCoaches = parseJson<ApiPerson[]>(team.squadJson, [])
  // National-team squads from football-data.org include the coach as a squad
  // entry (position "Coach"); keep them out of the player list. The coach is
  // surfaced in the Team Profile "Coach" field, so no separate staff list is
  // needed (the API never returns a populated staff array).
  const squad = squadAndCoaches.filter((person) => !isCoachEntry(person.position))
  const squadCoach = squadAndCoaches.find((person) => isCoachEntry(person.position))
  const coachName = team.coachName || (squadCoach ? getPersonName(squadCoach) : '')
  const competitions = parseJson<ApiCompetition[]>(team.runningCompetitionsJson, [])
  const wcStats = parseJson<WcStats>(team.wcStatsJson, {})

  return (
    <div className="space-y-6">
      <Link href="/tournament?tab=teams" className="text-sm text-white/40 hover:text-white">← All Teams</Link>
      <div className="flex items-center gap-4">
        {team.crest && (
          <Image src={team.crest} alt={team.name} width={72} height={72} className="object-contain" />
        )}
        <div>
          <h1 className="text-3xl font-bold text-white">{team.name}</h1>
          {team.shortName && team.shortName !== team.name && (
            <p className="text-white/50">{team.shortName}</p>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-lg font-semibold text-[#C9A84C]">Team Profile</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="TLA" value={team.tla} />
          <InfoItem label="Area" value={[team.areaName, team.areaCode].filter(Boolean).join(' / ')} />
          <InfoItem label="Founded" value={team.founded ? String(team.founded) : ''} />
          <InfoItem label="Club colors" value={team.clubColors} />
          <InfoItem label="Venue" value={team.venue} />
          <InfoItem label="Coach" value={coachName} />
          <InfoItem label="Address" value={team.address} wide />
          <InfoItem label="Website" value={team.website} href={team.website} wide />
        </dl>
      </section>

      <WcStatsSection stats={wcStats} />

      {tournamentMatches.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-lg font-semibold text-[#C9A84C]">Tournament Matches</h2>
          <div className="space-y-2">
            {tournamentMatches.map((match) => {
              const isHome = match.homeTeam === team.name
              const opponent = isHome ? match.awayTeam : match.homeTeam
              const opponentCrest = isHome ? match.awayTeamCrest : match.homeTeamCrest
              const teamScore = isHome ? match.homeScore : match.awayScore
              const oppScore = isHome ? match.awayScore : match.homeScore
              const won = teamScore != null && oppScore != null && teamScore > oppScore
              const lost = teamScore != null && oppScore != null && teamScore < oppScore
              const resultColor = won ? 'text-green-400' : lost ? 'text-red-400' : 'text-white/50'
              const resultLabel = won ? 'W' : lost ? 'L' : 'D'
              const href = match.status === 'LIVE' ? '/live' : `/matches/${match.externalId}`
              const stageLabel = match.stage === 'GROUP' && match.group
                ? `Group ${match.group.replace('GROUP_', '')}`
                : match.stage.replace(/_/g, ' ')
              return (
                <Link key={match.id} href={href} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-4 py-2.5 hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-5 shrink-0 text-center text-xs font-bold ${resultColor}`}>{teamScore != null ? resultLabel : '–'}</span>
                    {opponentCrest && <Image src={opponentCrest} alt="" width={20} height={20} className="max-h-5 w-auto shrink-0 object-contain" />}
                    <span className="truncate text-sm text-white">{isHome ? 'vs' : '@'} {opponent}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-sm font-bold text-white tabular-nums">
                      {teamScore != null && oppScore != null ? `${teamScore}–${oppScore}` : '–'}
                    </span>
                    <span className="text-xs text-white/30">{stageLabel}</span>
                    {match.status === 'LIVE' && <span className="text-xs font-semibold uppercase tracking-wider text-red-400">● Live</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {competitions.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-lg font-semibold text-[#C9A84C]">Running Competitions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {competitions.map((competition, index) => (
              <div key={`${competition.id ?? competition.code ?? competition.name ?? index}`} className="rounded-lg border border-white/10 bg-[#0A1628]/40 p-3">
                <div className="flex items-center gap-3">
                  {competition.emblem && (
                    <Image src={competition.emblem} alt="" width={28} height={28} className="max-h-7 w-auto object-contain" />
                  )}
                  <div>
                    <p className="font-medium text-white">{competition.name ?? 'Competition'}</p>
                    <p className="text-xs text-white/40">{[competition.code, competition.type].filter(Boolean).join(' / ')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <PeopleSection title="Squad" people={squad} emptyText="No squad data returned by the API for this team." />
    </div>
  )
}

function WcStatsSection({ stats }: { stats: WcStats }) {
  const hasAnyData = stats.worldCupsPlayed !== undefined

  if (!hasAnyData) return null

  const wcsPlayed = stats.worldCupsPlayed ?? 0
  const standing = stats.allTimeStanding
  const titles = stats.titles ?? []
  const runnerUp = stats.runnerUp ?? []
  const gamesPlayed = stats.gamesPlayed ?? 0
  const wins = stats.wins ?? 0
  const draws = stats.draws ?? 0
  const losses = stats.losses ?? 0
  const winPct = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0
  const goalsScored = stats.goalsScored ?? 0
  const goalsConceded = stats.goalsConceded ?? 0

  return (
    <section className="rounded-xl border border-[#C9A84C]/20 bg-white/5 p-5">
      <h2 className="mb-4 text-lg font-semibold text-[#C9A84C]">World Cup Record</h2>

      {/* Participation row */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Stat label="World Cups" value={String(wcsPlayed)} />
        {standing != null && (
          <Stat label="All-time ranking" value={`#${standing}`} />
        )}
        {titles.length > 0 && (
          <Stat label={titles.length === 1 ? 'Title' : 'Titles'} value={`${titles.length}× (${titles.join(', ')})`} highlight />
        )}
        {runnerUp.length > 0 && (
          <Stat label="Runner-up" value={`${runnerUp.length}× (${runnerUp.join(', ')})`} />
        )}
      </div>

      {gamesPlayed > 0 && (
        <>
          {/* W/D/L */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RecordCell label="Played" value={gamesPlayed} />
            <RecordCell label="Won" value={wins} color="text-green-400" sub={`${winPct}%`} />
            <RecordCell label="Drawn" value={draws} />
            <RecordCell label="Lost" value={losses} color="text-red-400" />
          </div>

          {/* Goals */}
          <div className="grid grid-cols-3 gap-2">
            <RecordCell label="Goals scored" value={goalsScored} />
            <RecordCell label="Goals conceded" value={goalsConceded} />
            <RecordCell
              label="Difference"
              value={stats.goalDifference ?? (goalsScored - goalsConceded >= 0 ? `+${goalsScored - goalsConceded}` : String(goalsScored - goalsConceded))}
              color={(stats.goalDifference ?? '').startsWith('+') || goalsScored >= goalsConceded ? 'text-green-400' : 'text-red-400'}
            />
          </div>
        </>
      )}

      {wcsPlayed > 0 && gamesPlayed === 0 && (
        <p className="text-sm text-white/40">No World Cup matches played yet.</p>
      )}
    </section>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${highlight ? 'text-[#F2D27A]' : 'text-white/80'}`}>{value}</p>
    </div>
  )
}

function RecordCell({ label, value, color = 'text-white/80', sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/30">{sub}</p>}
    </div>
  )
}

function InfoItem({ label, value, href, wide = false }: { label: string; value: string; href?: string; wide?: boolean }) {
  if (!value) return null
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <dt className="text-xs uppercase tracking-wide text-white/35">{label}</dt>
      <dd className="mt-1 break-words text-white/75">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-[#C9A84C] hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function PeopleSection({ title, people, emptyText }: { title: string; people: ApiPerson[]; emptyText: string }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="mb-4 text-lg font-semibold text-[#C9A84C]">{title}</h2>
      {people.length === 0 ? (
        <p className="text-sm text-white/40">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/40">
                <th className="py-2 pr-4 font-normal">Name</th>
                <th className="py-2 pr-4 font-normal">Position / Role</th>
                <th className="py-2 pr-4 font-normal">Nationality</th>
                <th className="py-2 pr-4 font-normal">Date of birth</th>
                <th className="py-2 pr-4 font-normal">Shirt</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person, index) => (
                <tr key={`${person.id ?? person.name ?? index}`} className="border-b border-white/5 last:border-0">
                  <td className="py-2 pr-4 font-medium text-white">{getPersonName(person)}</td>
                  <td className="py-2 pr-4 text-white/60">{person.position ?? person.role ?? person.section ?? '-'}</td>
                  <td className="py-2 pr-4 text-white/60">{person.nationality ?? '-'}</td>
                  <td className="py-2 pr-4 text-white/60">{person.dateOfBirth ?? '-'}</td>
                  <td className="py-2 pr-4 text-white/60">{person.shirtNumber ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function getPersonName(person: ApiPerson): string {
  return person.name ?? ([person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown')
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
