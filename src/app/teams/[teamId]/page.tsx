import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export const revalidate = 300

interface Props {
  params: Promise<{ teamId: string }>
}

export default async function TeamDetailPage({ params }: Props) {
  await requireAuth()
  const { teamId } = await params
  const team = await prisma.team.findUnique({ where: { externalId: teamId } })
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
    </div>
  )
}
