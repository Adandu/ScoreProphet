'use server'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getTournamentForUser } from '@/lib/tournament'

export async function setSelectedTournament(tournamentId: number): Promise<void> {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, isActive: true },
  })
  if (!tournament) return

  const session = await getSession()
  session.selectedTournamentId = tournamentId
  await session.save()
  redirect('/')
}

export async function setSelectedArchivedTournament(tournamentId: number): Promise<void> {
  const session = await getSession()
  if (!session.userId) return

  const tournament = await getTournamentForUser(tournamentId, session.userId)
  if (!tournament) return

  session.selectedTournamentId = tournamentId
  await session.save()
  redirect('/')
}
