import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arePredictionsConfigured, predictionReminderWindow } from '@/lib/prediction-reminder-rules'

vi.mock('@/lib/db', () => ({
  prisma: {
    match: { findMany: vi.fn() },
    championship: { findMany: vi.fn() },
    championshipMember: { findMany: vi.fn() },
    predictionReminder: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    prediction: { findMany: vi.fn() },
    knockoutAdvance: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/email', () => ({
  sendPredictionReminderEmail: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { sendPredictionReminderEmail } from '@/lib/email'
import { sendDuePredictionReminders } from '@/lib/prediction-reminders'

describe('prediction reminders', () => {
  it('treats group match predictions as configured when result and exact score are set', () => {
    expect(
      arePredictionsConfigured(
        { stage: 'GROUP' },
        [{ type: 'SINGLE_OUTCOME' }, { type: 'EXACT_SCORE' }],
        false,
        true
      )
    ).toBe(true)
  })

  it('requires a knockout advance prediction outside the group stage', () => {
    expect(
      arePredictionsConfigured(
        { stage: 'ROUND_OF_16' },
        [{ type: 'SINGLE_OUTCOME' }, { type: 'EXACT_SCORE' }],
        false,
        true
      )
    ).toBe(false)

    expect(
      arePredictionsConfigured(
        { stage: 'ROUND_OF_16' },
        [{ type: 'SINGLE_OUTCOME' }, { type: 'EXACT_SCORE' }],
        true,
        true
      )
    ).toBe(true)
  })

  it('ignores double chance predictions when double chance is disabled', () => {
    expect(
      arePredictionsConfigured(
        { stage: 'GROUP' },
        [{ type: 'DOUBLE_CHANCE' }, { type: 'EXACT_SCORE' }],
        false,
        false
      )
    ).toBe(false)
  })

  it('checks matches due within 12 hours and not already started', () => {
    const now = new Date('2026-06-01T00:00:00.000Z')
    expect(predictionReminderWindow(now)).toEqual({
      gt: now,
      lte: new Date('2026-06-01T12:00:00.000Z'),
    })
  })
})

const makeMatch = (id: number, overrides = {}) => ({
  id,
  homeTeam: 'Home FC',
  awayTeam: 'Away FC',
  kickoff: new Date('2026-06-01T10:00:00.000Z'),
  status: 'SCHEDULED',
  stage: 'GROUP' as const,
  group: 'GROUP_A',
  homeScore: null,
  awayScore: null,
  winnerTeam: null,
  adminOverride: false,
  ...overrides,
})

const makeChampionship = (id: number, overrides = {}) => ({
  id,
  name: `Championship ${id}`,
  isActive: true,
  doubleChanceEnabled: true,
  ...overrides,
})

const makeMember = (userId: number, championshipId: number, overrides = {}) => ({
  userId,
  championshipId,
  championship: makeChampionship(championshipId),
  user: {
    id: userId,
    email: `user${userId}@example.com`,
    predictionReminderEnabled: true,
    timezone: 'Europe/Bucharest',
  },
  ...overrides,
})

describe('sendDuePredictionReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.predictionReminder.create).mockResolvedValue({} as never)
    vi.mocked(sendPredictionReminderEmail).mockResolvedValue(undefined)
  })

  it('creates reminder records for due matches, scoped to each championship', async () => {
    const match = makeMatch(1)
    const champ = makeChampionship(10)
    const member = makeMember(100, 10)

    vi.mocked(prisma.match.findMany).mockResolvedValue([match] as never)
    vi.mocked(prisma.championship.findMany).mockResolvedValue([champ] as never)
    vi.mocked(prisma.championshipMember.findMany).mockResolvedValue([member] as never)
    vi.mocked(prisma.predictionReminder.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.prediction.findMany).mockResolvedValue([])
    vi.mocked(prisma.knockoutAdvance.findUnique).mockResolvedValue(null)

    const result = await sendDuePredictionReminders('https://example.com')

    expect(result).toEqual({ matchesChecked: 1, sent: 1 })
    expect(prisma.championshipMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ championshipId: 10 }) })
    )
    expect(prisma.predictionReminder.create).toHaveBeenCalledWith({
      data: { userId: 100, matchId: 1, championshipId: 10 },
    })
    expect(sendPredictionReminderEmail).toHaveBeenCalledTimes(1)
  })

  it('does not send duplicate reminders when a reminder record already exists', async () => {
    const match = makeMatch(1)
    const champ = makeChampionship(10)
    const member = makeMember(100, 10)

    vi.mocked(prisma.match.findMany).mockResolvedValue([match] as never)
    vi.mocked(prisma.championship.findMany).mockResolvedValue([champ] as never)
    vi.mocked(prisma.championshipMember.findMany).mockResolvedValue([member] as never)
    vi.mocked(prisma.predictionReminder.findUnique).mockResolvedValue({ id: 99 } as never)

    const result = await sendDuePredictionReminders('https://example.com')

    expect(result).toEqual({ matchesChecked: 1, sent: 0 })
    expect(sendPredictionReminderEmail).not.toHaveBeenCalled()
    expect(prisma.predictionReminder.create).not.toHaveBeenCalled()
  })

  it('skips sending when no matches are within the reminder window', async () => {
    vi.mocked(prisma.match.findMany).mockResolvedValue([])
    vi.mocked(prisma.championship.findMany).mockResolvedValue([makeChampionship(10)] as never)
    vi.mocked(prisma.championshipMember.findMany).mockResolvedValue([makeMember(100, 10)] as never)

    const result = await sendDuePredictionReminders('https://example.com')

    expect(result).toEqual({ matchesChecked: 0, sent: 0 })
    expect(sendPredictionReminderEmail).not.toHaveBeenCalled()
  })

  it('handles empty member lists gracefully without sending any reminders', async () => {
    const match = makeMatch(1)
    const champ = makeChampionship(10)

    vi.mocked(prisma.match.findMany).mockResolvedValue([match] as never)
    vi.mocked(prisma.championship.findMany).mockResolvedValue([champ] as never)
    vi.mocked(prisma.championshipMember.findMany).mockResolvedValue([])

    const result = await sendDuePredictionReminders('https://example.com')

    expect(result).toEqual({ matchesChecked: 1, sent: 0 })
    expect(sendPredictionReminderEmail).not.toHaveBeenCalled()
    expect(prisma.predictionReminder.findUnique).not.toHaveBeenCalled()
  })
})
