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
  crest: string
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
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-white/50">
        Team information is not yet available. This page will be populated once more information is available.
      </div>
    </div>
  )
}
