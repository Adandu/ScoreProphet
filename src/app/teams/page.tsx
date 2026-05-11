import Image from 'next/image'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export const revalidate = 300

export default async function TeamsPage() {
  await requireAuth()
  const teams = await prisma.team.findMany({ orderBy: { name: 'asc' } })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Teams</h1>
      {teams.length === 0 && (
        <p className="text-white/40">No teams yet — run a sync from the Admin panel.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {teams.map((team) => (
          <Link
            key={team.externalId}
            href={`/teams/${team.externalId}`}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
          >
            {team.crest ? (
              <Image src={team.crest} alt={team.name} width={48} height={48} className="object-contain" />
            ) : (
              <div className="h-12 w-12 rounded bg-white/10" />
            )}
            <span className="text-xs text-center text-white/80 leading-tight">{team.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
