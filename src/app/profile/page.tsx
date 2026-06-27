import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { ProfileClient } from './_profile-client'
import { ProfileBadges } from '@/components/profile-badges'
import { setSelectedArchivedTournament } from '@/actions/tournament'

export default async function ProfilePage() {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.userId! } })
  if (!user) {
    const s = await getSession()
    s.destroy()
    redirect('/login')
  }

  const pastTournaments = await prisma.tournament.findMany({
    where: {
      isArchived: true,
      championships: {
        some: {
          members: { some: { userId: session.userId! } },
        },
      },
    },
    include: {
      championships: {
        where: { members: { some: { userId: session.userId! } } },
        select: { id: true, name: true },
      },
    },
    orderBy: { endDate: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Profile</h1>
        <p className="mt-1 text-sm text-white/50">Manage your account, password, timezone, and appearance.</p>
      </div>
      <ProfileClient
        user={{
          username: user!.username,
          email: user!.email ?? '',
          timezone: user!.timezone,
          theme: user!.theme,
          isAdmin: user!.isAdmin,
          predictionReminderEnabled: user!.predictionReminderEnabled,
          predictionReminderHoursBefore: user!.predictionReminderHoursBefore,
        }}
      />
      <ProfileBadges userId={user!.id} timezone={user!.timezone} />

      {pastTournaments.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Past Tournaments</h2>
          {pastTournaments.map((t) => {
            const startStr = t.startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            const endStr = t.endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            const viewAction = setSelectedArchivedTournament.bind(null, t.id)
            return (
              <form key={t.id} action={viewAction}>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{t.name}</p>
                    <p className="text-sm text-white/50">{t.season}</p>
                    <p className="text-xs text-white/40">{startStr} – {endStr}</p>
                    {t.championships.length > 0 && (
                      <p className="text-xs text-white/40">{t.championships.map(c => c.name).join(', ')}</p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
                  >
                    View History →
                  </button>
                </div>
              </form>
            )
          })}
        </section>
      )}
    </div>
  )
}
