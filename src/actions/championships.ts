'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin, requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getAppUrl } from '@/lib/app-url'
import { userCanManageChampionship } from '@/lib/championships'
import { hashInviteToken } from '@/lib/invites'

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
  await requireAdmin()
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string) ?? '').trim()

  if (!name || name.length < 2 || name.length > 60) return { error: 'Championship name must be 2-60 characters' }

  try {
    await prisma.championship.create({ data: { name, description } })
  } catch {
    return { error: 'Championship name already exists' }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function updateChampionship(prevState: unknown, formData: FormData) {
  await requireAdmin()
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
  if (!await requireChampionshipEditor(championshipId)) return { error: 'Not authorized' }

  const isActive = formData.get('isActive') === 'on'
  const doubleChanceEnabled = formData.get('doubleChanceEnabled') === 'on'

  await prisma.championship.update({
    where: { id: championshipId },
    data: { isActive, doubleChanceEnabled },
  })

  revalidatePath('/manage')
  revalidatePath(`/championships/${championshipId}/manage`)
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  revalidatePath(`/championships/${championshipId}/predictions`)
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function deleteChampionship(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }

  await prisma.championship.delete({ where: { id: championshipId } })
  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setChampionshipMembers(prevState: unknown, formData: FormData) {
  const championshipId = parseId(formData.get('championshipId'))
  if (!championshipId) return { error: 'Missing championship ID' }
  if (!await requireChampionshipEditor(championshipId)) return { error: 'Not authorized' }

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

  revalidatePath('/admin')
  revalidatePath('/manage')
  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  revalidatePath(`/championships/${championshipId}/manage`)
  return { success: true }
}

export async function setChampionshipManagers(prevState: unknown, formData: FormData) {
  await requireAdmin()
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
    },
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
