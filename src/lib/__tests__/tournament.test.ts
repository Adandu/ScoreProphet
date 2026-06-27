import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    tournament: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

import { getActiveTournaments, getSelectedTournament, getTournamentForUser } from '@/lib/tournament'
import { prisma } from '@/lib/db'

const wc2026 = {
  id: 1,
  name: 'FIFA World Cup 2026',
  competitionCode: 'WC',
  season: '2026',
  type: 'WORLD_CUP',
  isActive: true,
  isArchived: false,
  startDate: new Date('2026-06-11'),
  endDate: new Date('2026-07-19'),
  createdAt: new Date(),
}

describe('getActiveTournaments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all active tournaments ordered by startDate desc', async () => {
    vi.mocked(prisma.tournament.findMany).mockResolvedValue([wc2026] as never)
    const result = await getActiveTournaments()
    expect(result).toHaveLength(1)
    expect(result[0].competitionCode).toBe('WC')
    expect(prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, orderBy: { startDate: 'desc' } })
    )
  })
})

describe('getSelectedTournament', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tournament matching session.selectedTournamentId', async () => {
    vi.mocked(prisma.tournament.findFirst).mockResolvedValue(wc2026 as never)
    const result = await getSelectedTournament({ selectedTournamentId: 1 })
    expect(result?.id).toBe(1)
  })

  it('falls back to first active tournament when no selectedTournamentId in session', async () => {
    vi.mocked(prisma.tournament.findMany).mockResolvedValue([wc2026] as never)
    const result = await getSelectedTournament({})
    expect(result?.id).toBe(1)
  })

  it('returns null when no active tournaments exist', async () => {
    vi.mocked(prisma.tournament.findMany).mockResolvedValue([] as never)
    const result = await getSelectedTournament({})
    expect(result).toBeNull()
  })
})

describe('getTournamentForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tournament when user has a championship in it', async () => {
    vi.mocked(prisma.tournament.findFirst).mockResolvedValue(wc2026 as never)
    const result = await getTournamentForUser(1, 42)
    expect(result?.id).toBe(1)
    expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 1,
          championships: { some: { members: { some: { userId: 42 } } } },
        }),
      })
    )
  })

  it('returns null when user has no championship in the tournament', async () => {
    vi.mocked(prisma.tournament.findFirst).mockResolvedValue(null)
    const result = await getTournamentForUser(1, 42)
    expect(result).toBeNull()
  })
})
