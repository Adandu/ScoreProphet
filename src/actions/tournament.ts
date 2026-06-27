'use server'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'

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
