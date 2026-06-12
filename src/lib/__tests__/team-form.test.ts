import { describe, it, expect } from 'vitest'
import { computeFormByTeam } from '@/lib/team-form'

const match = (
  kickoff: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number | null,
  awayScore: number | null,
  status = 'FINISHED',
) => ({ kickoff: new Date(kickoff), homeTeam, awayTeam, homeScore, awayScore, status })

describe('computeFormByTeam', () => {
  it('derives W/D/L per team in chronological order', () => {
    const form = computeFormByTeam([
      match(2, 'Alpha', 'Beta', 1, 1),
      match(1, 'Alpha', 'Gamma', 2, 0),
      match(3, 'Beta', 'Alpha', 3, 1),
    ])
    expect(form['Alpha']).toBe('W,D,L')
    expect(form['Beta']).toBe('D,W')
    expect(form['Gamma']).toBe('L')
  })

  it('ignores unfinished matches and missing scores', () => {
    const form = computeFormByTeam([
      match(1, 'Alpha', 'Beta', 2, 0),
      match(2, 'Alpha', 'Beta', 1, 0, 'LIVE'),
      match(3, 'Alpha', 'Beta', null, null),
    ])
    expect(form['Alpha']).toBe('W')
    expect(form['Beta']).toBe('L')
  })

  it('returns an empty object with no finished matches', () => {
    expect(computeFormByTeam([match(1, 'A', 'B', 0, 0, 'SCHEDULED')])).toEqual({})
  })
})
