import { describe, it, expect } from 'vitest'
import { computeHeadToHead } from '@/lib/user-comparison'

const meta = {
  1: { label: 'A vs B', kickoff: 100 },
  2: { label: 'C vs D', kickoff: 200 },
  3: { label: 'E vs F', kickoff: 300 },
  4: { label: 'G vs H', kickoff: 400 },
}

describe('computeHeadToHead', () => {
  const result = computeHeadToHead(
    [{ matchId: 1, points: 5 }, { matchId: 2, points: 3 }, { matchId: 3, points: 0 }],
    [{ matchId: 1, points: 3 }, { matchId: 2, points: 3 }, { matchId: 4, points: 5 }],
    meta,
  )

  it('counts a win for the higher score only on matches both players predicted', () => {
    expect(result.aWins).toBe(1) // match 1: 5 > 3
    expect(result.bWins).toBe(0)
    expect(result.ties).toBe(1)  // match 2: 3 == 3
  })

  it('only includes matches both players predicted, ordered by kickoff', () => {
    expect(result.matches.map((m) => m.matchId)).toEqual([1, 2])
  })

  it('returns each shared match with both point values and a label', () => {
    expect(result.matches[0]).toEqual({ matchId: 1, label: 'A vs B', kickoff: 100, aPoints: 5, bPoints: 3 })
  })
})
