import { describe, it, expect } from 'vitest'

function isMatchLocked(kickoff: Date, now: Date): boolean {
  return kickoff <= now
}

describe('isMatchLocked', () => {
  it('returns true when kickoff is in the past', () => {
    const kickoff = new Date('2026-01-01T10:00:00Z')
    const now = new Date('2026-01-01T11:00:00Z')
    expect(isMatchLocked(kickoff, now)).toBe(true)
  })

  it('returns false when kickoff is in the future', () => {
    const kickoff = new Date('2026-01-01T12:00:00Z')
    const now = new Date('2026-01-01T11:00:00Z')
    expect(isMatchLocked(kickoff, now)).toBe(false)
  })

  it('returns true when kickoff equals now', () => {
    const t = new Date('2026-01-01T11:00:00Z')
    expect(isMatchLocked(t, t)).toBe(true)
  })
})
