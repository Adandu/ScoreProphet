import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { ProfileClient } from './_profile-client'

export default async function ProfilePage() {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.userId! } })
  if (!user) return null

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
    </div>
  )
}
