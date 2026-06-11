import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { ProfileClient } from './_profile-client'
import { ProfileBadges } from '@/components/profile-badges'

export default async function ProfilePage() {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.userId! } })
  if (!user) {
    const s = await getSession()
    s.destroy()
    redirect('/login')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Profile</h1>
        <p className="mt-1 text-sm text-white/50">Manage your account, password, timezone, and appearance.</p>
      </div>
      <ProfileClient
        user={{
          username: user.username,
          email: user.email ?? '',
          timezone: user.timezone,
          theme: user.theme,
          isAdmin: user.isAdmin,
          predictionReminderEnabled: user.predictionReminderEnabled,
        }}
      />
      <ProfileBadges userId={user.id} timezone={user.timezone} />
    </div>
  )
}
