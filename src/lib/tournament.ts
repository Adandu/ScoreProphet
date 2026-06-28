import { prisma } from '@/lib/db'
import type { SessionData } from '@/lib/session'
import type { Tournament } from '@prisma/client'

export type { Tournament }

export async function getActiveTournaments(): Promise<Tournament[]> {
  return prisma.tournament.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })
}

export async function getSelectedTournament(session: Partial<SessionData>): Promise<Tournament | null> {
  if (session.selectedTournamentId !== undefined) {
    const t = await prisma.tournament.findFirst({ where: { id: session.selectedTournamentId } })
    if (t) return t
    // Stored id no longer exists (tournament deleted) — fall through to default
  }
  const active = await getActiveTournaments()
  return active[0] ?? null
}

export async function getTournamentForUser(
  tournamentId: number,
  userId: number
): Promise<Tournament | null> {
  return prisma.tournament.findFirst({
    where: {
      id: tournamentId,
      championships: { some: { members: { some: { userId } } } },
    },
  })
}
