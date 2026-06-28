import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { requireAuth } from '@/lib/auth'

export interface ChampionshipSummary {
  id: number
  name: string
  description: string
  isActive: boolean
  doubleChanceEnabled: boolean
  isManager?: boolean
}

export const getUserChampionships = cache(async (userId: number, tournamentId?: number): Promise<ChampionshipSummary[]> => {
  const tournamentFilter = tournamentId ? { tournamentId } : {}
  const [memberships, managerAssignments] = await Promise.all([
    prisma.championshipMember.findMany({
      where: {
        userId,
        championship: { isActive: true, ...tournamentFilter },
      },
      include: { championship: true },
      orderBy: { championship: { name: 'asc' } },
    }),
    prisma.championshipManager.findMany({
      where: { userId, championship: { isActive: true, ...tournamentFilter } },
      include: { championship: true },
    }),
  ])

  const managerIds = new Set(managerAssignments.map((assignment) => assignment.championshipId))

  return memberships.map(({ championship }) => ({
      id: championship.id,
      name: championship.name,
      description: championship.description,
      isActive: championship.isActive,
      doubleChanceEnabled: championship.doubleChanceEnabled,
      isManager: managerIds.has(championship.id),
  }))
})

export const getSelectedChampionship = cache(async (userId: number, tournamentId?: number): Promise<ChampionshipSummary | null> => {
  const session = await getSession()
  const championships = await getUserChampionships(userId, tournamentId)
  if (championships.length === 0) return null

  const selected = championships.find((championship) => championship.id === session.selectedChampionshipId)
  return selected ?? championships[0]
})

export async function requireChampionshipAccess(championshipId: number) {
  const session = await requireAuth()
  if (!Number.isInteger(championshipId) || championshipId <= 0) redirect('/')
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    include: { members: { include: { user: true }, orderBy: { user: { username: 'asc' } } } },
  })

  if (!championship || !championship.isActive) redirect('/')
  const isMember = championship.members.some((member) => member.userId === session.userId)
  if (!isMember && !session.isAdmin) redirect('/')

  return { session, championship }
}

export const requireChampionshipAccessLean = cache(async (championshipId: number) => {
  const session = await requireAuth()
  if (!Number.isInteger(championshipId) || championshipId <= 0) redirect('/')
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    select: { id: true, name: true, description: true, isActive: true, doubleChanceEnabled: true, competitionCode: true, tournamentId: true },
  })

  if (!championship || !championship.isActive) redirect('/')
  if (!session.isAdmin) {
    const membership = await prisma.championshipMember.findFirst({
      where: { championshipId, userId: session.userId! },
      select: { championshipId: true },
    })
    if (!membership) redirect('/')
  }

  return { session, championship }
})

export async function getChampionshipMemberIds(championshipId: number): Promise<number[]> {
  const members = await prisma.championshipMember.findMany({
    where: { championshipId },
    select: { userId: true },
  })
  return members.map((member) => member.userId)
}

export async function getManagedChampionships(userId: number): Promise<ChampionshipSummary[]> {
  const assignments = await prisma.championshipManager.findMany({
    where: { userId },
    include: { championship: true },
    orderBy: { championship: { name: 'asc' } },
  })

  return assignments.map(({ championship }) => ({
    id: championship.id,
    name: championship.name,
    description: championship.description,
    isActive: championship.isActive,
    doubleChanceEnabled: championship.doubleChanceEnabled,
    isManager: true,
  }))
}

export async function userCanManageChampionship(userId: number, championshipId: number): Promise<boolean> {
  const assignment = await prisma.championshipManager.findUnique({
    where: { championshipId_userId: { championshipId, userId } },
    select: { championshipId: true },
  })
  return Boolean(assignment)
}

export async function requireChampionshipManager(championshipId: number) {
  const session = await requireAuth()
  if (!Number.isInteger(championshipId) || championshipId <= 0) redirect('/')

  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    include: {
      members: { include: { user: true }, orderBy: { user: { username: 'asc' } } },
      managers: true,
      invites: {
        where: { revokedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!championship) redirect('/')
  const canManage = session.isAdmin || championship.managers.some((manager) => manager.userId === session.userId)
  if (!canManage) redirect('/')

  return { session, championship }
}

export async function redirectToSelectedChampionshipPage(page: 'predictions' | 'results' | 'leaderboard') {
  const session = await requireAuth()
  const selected = await getSelectedChampionship(session.userId!)
  if (!selected) redirect('/')
  redirect(`/championships/${selected.id}/${page}`)
}

export async function userHasActiveChampionship(userId: number): Promise<boolean> {
  const count = await prisma.championshipMember.count({
    where: { userId, championship: { isActive: true } },
  })
  return count > 0
}
