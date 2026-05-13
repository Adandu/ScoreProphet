import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { getManagedChampionships } from '@/lib/championships'

export default async function ManagePage() {
  const session = await requireAuth()
  const championships = session.isAdmin
    ? []
    : await getManagedChampionships(session.userId!)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Championship Management</h1>
      {session.isAdmin && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/60">
          Admins can manage all championships from the <Link href="/admin" className="text-[#C9A84C] hover:underline">Admin Panel</Link>.
        </div>
      )}
      {!session.isAdmin && championships.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {championships.map((championship) => (
            <Link
              key={championship.id}
              href={`/championships/${championship.id}/manage`}
              className="rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-white">{championship.name}</h2>
                <span className={championship.isActive ? 'text-xs text-green-400' : 'text-xs text-white/40'}>
                  {championship.isActive ? 'Active' : 'Disabled'}
                </span>
              </div>
              {championship.description && <p className="mt-2 text-sm text-white/50">{championship.description}</p>}
            </Link>
          ))}
        </div>
      )}
      {!session.isAdmin && championships.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center text-white/40">
          You are not assigned as a Championship Manager yet.
        </div>
      )}
    </div>
  )
}
