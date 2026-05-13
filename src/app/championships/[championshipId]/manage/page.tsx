import { prisma } from '@/lib/db'
import { requireChampionshipManager } from '@/lib/championships'
import { ManageChampionshipClient } from './_manage-client'

export default async function ManageChampionshipPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { championship } = await requireChampionshipManager(championshipId)
  const users = await prisma.user.findMany({ orderBy: { username: 'asc' } })

  return (
    <ManageChampionshipClient
      users={users.map((user) => ({ id: user.id, username: user.username, isAdmin: user.isAdmin }))}
      championship={{
        id: championship.id,
        name: championship.name,
        isActive: championship.isActive,
        doubleChanceEnabled: championship.doubleChanceEnabled,
        userIds: championship.members.map((member) => member.userId),
        invites: championship.invites.map((invite) => ({
          id: invite.id,
          createdAt: invite.createdAt.toISOString(),
        })),
      }}
    />
  )
}
