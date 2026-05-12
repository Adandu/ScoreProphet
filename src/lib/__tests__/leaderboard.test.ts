import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { getRankedUsers } from '@/lib/leaderboard'

const champOn = { id: 1, doubleChanceEnabled: true }
const champOff = { id: 2, doubleChanceEnabled: false }

describe('getRankedUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ranks users by total points and filters by championshipId', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 2,
        username: 'bob',
        predictions: [{ type: 'EXACT_SCORE', pointsAwarded: 5 }],
        advances: [],
      },
      {
        id: 1,
        username: 'anna',
        predictions: [{ type: 'SINGLE_OUTCOME', pointsAwarded: 3 }],
        advances: [{ pointsAwarded: 1 }],
      },
    ] as never)

    const ranked = await getRankedUsers([1, 2], champOn)

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [1, 2] } },
        include: expect.objectContaining({
          predictions: expect.objectContaining({
            where: expect.objectContaining({ championshipId: 1 }),
          }),
          advances: expect.objectContaining({
            where: expect.objectContaining({ championshipId: 1 }),
          }),
        }),
      })
    )
    expect(ranked.map((u) => u.username)).toEqual(['bob', 'anna'])
    expect(ranked.map((u) => u.total)).toEqual([5, 4])
  })

  it('does not query when userIds is empty', async () => {
    expect(await getRankedUsers([], champOn)).toEqual([])
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('includes double chance in total and returns double field when enabled', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 1,
        username: 'anna',
        predictions: [
          { type: 'SINGLE_OUTCOME', pointsAwarded: 3 },
          { type: 'DOUBLE_CHANCE', pointsAwarded: 1 },
        ],
        advances: [],
      },
    ] as never)

    const ranked = await getRankedUsers([1], champOn)
    expect(ranked[0].total).toBe(4)
    expect(ranked[0].double).toBe(1)
  })

  it('excludes double chance from total and omits double field when disabled', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 1,
        username: 'anna',
        predictions: [
          { type: 'SINGLE_OUTCOME', pointsAwarded: 3 },
          { type: 'DOUBLE_CHANCE', pointsAwarded: 1 },
        ],
        advances: [],
      },
    ] as never)

    const ranked = await getRankedUsers([1], champOff)
    expect(ranked[0].total).toBe(3)
    expect(ranked[0].double).toBeUndefined()
  })
})
