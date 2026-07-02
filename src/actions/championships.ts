'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin, requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getAppUrl } from '@/lib/app-url'
import { userCanManageChampionship } from '@/lib/championships'
import { getSelectedTournament } from '@/lib/tournament'
import { hashInviteToken } from '@/lib/invites'
import { logAdminAction } from '@/lib/audit'

function parseId(value: FormDataEntryValue | null): number | null {
  const id = parseInt(String(value ?? ''), 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function requireChampionshipEditor(championshipId: number) {
  const session = await requireAuth()
  if (session.isAdmin || await userCanManageChampionship(session.userId!, championshipId)) return session
  return null
}

export async function createChampionship(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string) ?? '').trim()

  if (!name || name.length < 2 || name.length > 60) return { error: 'Championship name must be 2-60 characters' }

  const explicitId = parseId(formData.get('tournamentId'))
  let tournamentId: number
  if (explicitId) {
    const t = await prisma.tournament.findFirst({ where: { id: explicitId, isActive: true, isArchived: false } })
    if (!t) return { error: 'Selected tournament is not active' }
    tournamentId = t.id
  } else {
    const t = await getSelectedTournament(session)
    if (!t) return { error: 'No active tournament selected' }
    tournamentId = t.id
  }

  try {
    const championship = await prisma.championship.create({ data: { name, description, tournamentId } })
    await logAdminAction({
      adminId: session.userId!,
      adminUsername: session.username ?? String(session.userId),
      action: 'CREATE_CHAMPIONSHIP',
      entityType: 'championship',
      entityId: String(championship.id),
      details: name,
    })
  } catch {
    return { error: 'Championship name already exists' }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function updateChampionship(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string) ?? '').trim()
  const isActive = formData.get('isActive') === 'on'
  const doubleChanceEnabled = formData.get('doubleChanceEnabled') === 'on'

  if (!championshipId) return { error: 'Missing championship ID' }
  if (!name || name.length < 2 || name.length > 60) return { error: 'Championship name must be 2-60 characters' }

  try {
    await prisma.championship.update({
      where: { id: championshipId },
      data: { name, description, isActive, doubleChanceEnabled },
    })
    await logAdminAction({
      adminId: session.userId!,
      adminUsername: session.username ?? String(session.userId),
      action: 'UPDATE_CHAMPIONSHIP',
      entityType: 'championship',
      entityId: String(championshipId),
      details: name,
    })
  } catch {
    return { error: 'Could not update championship' }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function updateManagedChampionshipSettings(prevState: unknown, formData: FormData) {
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }
  const session = await requireChampionshipEditor(championshipId)
  if (!session) return { error: 'Not authorized' }

  const isActive = formData.get('isActive') === 'on'
  const doubleChanceEnabled = formData.get('doubleChanceEnabled') === 'on'

  await prisma.championship.update({
    where: { id: championshipId },
    data: { isActive, doubleChanceEnabled },
  })
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'UPDATE_CHAMPIONSHIP',
    entityType: 'championship',
    entityId: String(championshipId),
    details: 'Updated managed settings',
  })

  revalidatePath('/manage')
  revalidatePath(`/championships/${championshipId}/manage`)
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  revalidatePath(`/championships/${championshipId}/predictions`)
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function deleteChampionship(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }

  await prisma.championship.delete({ where: { id: championshipId } })
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'DELETE_CHAMPIONSHIP',
    entityType: 'championship',
    entityId: String(championshipId),
  })
  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setChampionshipMembers(prevState: unknown, formData: FormData) {
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }
  const session = await requireChampionshipEditor(championshipId)
  if (!session) return { error: 'Not authorized' }

  const userIds = Array.from(new Set(
    formData
      .getAll('userIds')
      .map((value) => parseId(value))
      .filter((id): id is number => id !== null)
  ))

  const championship = await prisma.championship.findUnique({ where: { id: championshipId } })
  if (!championship) return { error: 'Championship not found' }

  await prisma.$transaction([
    prisma.championshipMember.deleteMany({ where: { championshipId } }),
    ...userIds.map((userId) =>
      prisma.championshipMember.create({
        data: { championshipId, userId },
      })
    ),
  ])
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'UPDATE_MEMBERS',
    entityType: 'championship',
    entityId: String(championshipId),
    details: `${userIds.length} members`,
  })

  revalidatePath('/admin')
  revalidatePath('/manage')
  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  revalidatePath(`/championships/${championshipId}/manage`)
  return { success: true }
}

export async function setChampionshipManagers(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }

  const userIds = Array.from(new Set(
    formData
      .getAll('managerUserIds')
      .map((value) => parseId(value))
      .filter((id): id is number => id !== null)
  ))

  const championship = await prisma.championship.findUnique({ where: { id: championshipId } })
  if (!championship) return { error: 'Championship not found' }

  await prisma.$transaction([
    prisma.championshipManager.deleteMany({ where: { championshipId } }),
    ...userIds.map((userId) =>
      prisma.championshipManager.create({
        data: { championshipId, userId },
      })
    ),
  ])
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'UPDATE_MANAGERS',
    entityType: 'championship',
    entityId: String(championshipId),
    details: `${userIds.length} managers`,
  })

  revalidatePath('/admin')
  revalidatePath('/manage')
  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${championshipId}/manage`)
  return { success: true }
}

export async function generateChampionshipInvite(prevState: unknown, formData: FormData) {
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }
  const session = await requireChampionshipEditor(championshipId)
  if (!session) return { error: 'Not authorized' }

  const championship = await prisma.championship.findUnique({ where: { id: championshipId } })
  if (!championship) return { error: 'Championship not found' }

  const token = crypto.randomBytes(32).toString('base64url')
  await prisma.championshipInvite.create({
    data: {
      championshipId,
      tokenHash: hashInviteToken(token),
      createdById: session.userId!,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'GENERATE_INVITE',
    entityType: 'championship',
    entityId: String(championshipId),
    details: championship.name,
  })

  revalidatePath('/admin')
  revalidatePath('/manage')
  revalidatePath(`/championships/${championshipId}/manage`)
  const invitePath = `/invite/${encodeURIComponent(token)}`
  return { success: true, inviteUrl: `${await getAppUrl()}/register?next=${encodeURIComponent(invitePath)}` }
}

export async function revokeChampionshipInvite(prevState: unknown, formData: FormData) {
  const inviteId = parseId(formData.get('inviteId'))
  if (!inviteId) return { error: 'Missing invite ID' }

  // Auth check before DB lookup — prevents unauthenticated callers from probing invite IDs
  await requireAuth()

  const invite = await prisma.championshipInvite.findUnique({ where: { id: inviteId } })
  if (!invite) return { error: 'Invite not found' }
  if (!await requireChampionshipEditor(invite.championshipId)) return { error: 'Not authorized' }

  await prisma.championshipInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  })

  revalidatePath(`/championships/${invite.championshipId}/manage`)
  return { success: true }
}

export async function selectChampionship(championshipId: number) {
  const auth = await requireAuth()
  const membership = await prisma.championshipMember.findFirst({
    where: { userId: auth.userId, championshipId, championship: { isActive: true } },
  })
  if (!membership && !auth.isAdmin) return { error: 'Championship not available' }

  const session = await getSession()
  session.selectedChampionshipId = championshipId
  await session.save()
  revalidatePath('/', 'layout')
  return { success: true }
}
