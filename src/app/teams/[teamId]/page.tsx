import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { fetchTeamById } from '@/lib/football-api'

export const revalidate = 300

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
  let team: DisplayTeam | null = await prisma.team.findUnique({ where: { externalId: teamId } })
  if (!team) {
    try {
      team = await fetchTeamById(teamId)
    } catch {
      notFound()
    }
  }
  if (!team) notFound()

  const squad = parseJson<ApiPerson[]>(team.squadJson, [])
  const staff = parseJson<ApiPerson[]>(team.staffJson, [])
  const competitions = parseJson<ApiCompetition[]>(team.runningCompetitionsJson, [])

  return (
    <div className="space-y-6">
      <Link href="/teams" className="text-sm text-white/40 hover:text-white">← All Teams</Link>
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
          <InfoItem label="Coach" value={team.coachName} />
          <InfoItem label="Address" value={team.address} wide />
          <InfoItem label="Website" value={team.website} href={team.website} wide />
        </dl>
      </section>

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
      <PeopleSection title="Staff" people={staff} emptyText="No staff data returned by the API for this team." />
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
