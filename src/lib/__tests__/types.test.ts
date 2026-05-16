import { describe, it, expect } from 'vitest'
import { VALID_PREDICTION_TYPES } from '../types'

describe('VALID_PREDICTION_TYPES', () => {
  it('contains the three valid types', () => {
    expect(VALID_PREDICTION_TYPES).toContain('SINGLE_OUTCOME')
    expect(VALID_PREDICTION_TYPES).toContain('DOUBLE_CHANCE')
    expect(VALID_PREDICTION_TYPES).toContain('EXACT_SCORE')
  })
  it('has exactly three entries', () => {
    expect(VALID_PREDICTION_TYPES).toHaveLength(3)
  })

  it('does not include invalid strings', () => {
    expect(VALID_PREDICTION_TYPES).not.toContain('INVALID')
    expect(VALID_PREDICTION_TYPES).not.toContain('')
  })
})
