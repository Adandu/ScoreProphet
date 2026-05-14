import { describe, expect, it } from 'vitest'
import { arePredictionsConfigured, predictionReminderWindow } from '@/lib/prediction-reminder-rules'

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
