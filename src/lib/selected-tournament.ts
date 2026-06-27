import { getSession } from '@/lib/session'
import { getSelectedTournament } from '@/lib/tournament'
import type { Tournament } from '@prisma/client'

export async function getCurrentTournament(): Promise<Tournament | null> {
  const session = await getSession()
  return getSelectedTournament(session)
}
