import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Read-only lookup used to render the invite confirmation page (no state change).
export async function getInvitePreview(token: string) {
  const invite = await prisma.championshipInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { championship: { select: { id: true, name: true, isActive: true } } },
  })
  if (!invite || invite.revokedAt || (invite.expiresAt && invite.expiresAt <= new Date())) return null
  return {
    championshipId: invite.championshipId,
    championshipName: invite.championship.name,
    isActive: invite.championship.isActive,
  }
}

export async function acceptInviteToken(token: string) {
  const session = await getSession()
  if (!session.userId) return { error: 'You must be signed in to accept this invitation' }
  const userId = session.userId

  const invite = await prisma.championshipInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { championship: true },
  })

  if (!invite || invite.revokedAt || (invite.expiresAt && invite.expiresAt <= new Date())) {
    return { error: 'This invitation link is no longer valid' }
  }
  if (!invite.championship.isActive && !session.isAdmin) {
    return { error: 'This championship is not active' }
  }

  const consumed = await prisma.$transaction(async (tx) => {
    const deleted = await tx.championshipInvite.deleteMany({
      where: {
        id: invite.id,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    })
    if (deleted.count !== 1) return false

    await tx.championshipMember.upsert({
      where: { championshipId_userId: { championshipId: invite.championshipId, userId } },
      update: {},
      create: { championshipId: invite.championshipId, userId },
    })

    return true
  })

  if (!consumed) return { error: 'This invitation link is no longer valid' }

  session.selectedChampionshipId = invite.championshipId
  await session.save()

  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${invite.championshipId}/leaderboard`)
  revalidatePath(`/championships/${invite.championshipId}/manage`)
  return { success: true, championshipId: invite.championshipId, championshipName: invite.championship.name }
}
