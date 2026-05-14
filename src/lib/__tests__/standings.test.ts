import { describe, expect, it } from 'vitest'
import { computeGroupStandings, getBest8ThirdPlace, type GroupStandings } from '@/lib/standings'

const finishedMatch = (group: string, home: string, away: string, homeScore: number, awayScore: number) => ({
  group,
  status: 'FINISHED',
  homeTeam: home,
  awayTeam: away,
  homeScore,
  awayScore,
})

const scheduledMatch = (group: string, home: string, away: string) => ({
  group,
  status: 'SCHEDULED',
  homeTeam: home,
  awayTeam: away,
  homeScore: null,
  awayScore: null,
})

describe('computeGroupStandings', () => {
  it('computes and sorts a complete group', () => {
    const result = computeGroupStandings([
      finishedMatch('GROUP_A', 'Brazil', 'France', 2, 1),
      finishedMatch('GROUP_A', 'Germany', 'Japan', 0, 0),
      finishedMatch('GROUP_A', 'Brazil', 'Germany', 3, 0),
      finishedMatch('GROUP_A', 'France', 'Japan', 2, 0),
      finishedMatch('GROUP_A', 'Brazil', 'Japan', 1, 0),
      finishedMatch('GROUP_A', 'France', 'Germany', 1, 1),
    ])

    expect(result.GROUP_A[0]).toMatchObject({ team: 'Brazil', w: 3, d: 0, l: 0, gf: 6, ga: 1, gd: 5, pts: 9, advancing: true })
    expect(result.GROUP_A[1]).toMatchObject({ team: 'France', w: 1, d: 1, l: 1, gf: 4, ga: 3, gd: 1, pts: 4, advancing: true })
    expect(result.GROUP_A[2]).toMatchObject({ team: 'Germany', w: 0, d: 2, l: 1, gf: 1, ga: 4, gd: -3, pts: 2, advancing: false })
    expect(result.GROUP_A[3]).toMatchObject({ team: 'Japan', w: 0, d: 1, l: 2, gf: 0, ga: 3, gd: -3, pts: 1, advancing: false })
  })

  it('ignores null-group matches and still computes valid group matches correctly', () => {
    const result = computeGroupStandings([
      finishedMatch('GROUP_A', 'Brazil', 'France', 2, 1),
      { group: null, status: 'FINISHED', homeTeam: 'Brazil', awayTeam: 'France', homeScore: 5, awayScore: 5 },
      { group: null, status: 'SCHEDULED', homeTeam: 'Germany', awayTeam: 'Japan', homeScore: null, awayScore: null },
    ])

    expect(Object.keys(result)).toEqual(['GROUP_A'])
    expect(result.GROUP_A).toHaveLength(2)
    expect(result.GROUP_A.find((r) => r.team === 'Brazil')).toMatchObject({ w: 1, l: 0, pts: 3 })
    expect(result.GROUP_A.find((r) => r.team === 'France')).toMatchObject({ w: 0, l: 1, pts: 0 })
  })

  it('does not mark advancing rows before a group is complete', () => {
    const result = computeGroupStandings([
      finishedMatch('GROUP_A', 'Brazil', 'France', 2, 1),
      scheduledMatch('GROUP_A', 'Germany', 'Japan'),
      scheduledMatch('GROUP_A', 'Brazil', 'Germany'),
    ])

    expect(result.GROUP_A.every((row) => !row.advancing)).toBe(true)
  })
})

describe('getBest8ThirdPlace', () => {
  it('returns no third-place qualifiers until all 12 groups are complete', () => {
    const standings = computeGroupStandings([
      finishedMatch('GROUP_A', 'A1', 'A2', 1, 0),
      finishedMatch('GROUP_A', 'A3', 'A4', 1, 0),
      finishedMatch('GROUP_A', 'A1', 'A3', 1, 0),
    ])

    expect(getBest8ThirdPlace(standings)).toEqual([])
  })

  it('selects the best 8 third-place teams across 12 complete groups', () => {
    const standings: GroupStandings = {}
    for (let i = 0; i < 12; i++) {
      standings[`GROUP_${String.fromCharCode(65 + i)}`] = [
        { team: `Winner ${i}`, crest: '', played: 3, w: 3, d: 0, l: 0, gf: 6, ga: 1, gd: 5, pts: 9, advancing: true },
        { team: `Runner ${i}`, crest: '', played: 3, w: 2, d: 0, l: 1, gf: 5, ga: 2, gd: 3, pts: 6, advancing: true },
        { team: `Third ${i}`, crest: '', played: 3, w: 1, d: 0, l: 2, gf: i, ga: 4, gd: i - 4, pts: i, advancing: false },
        { team: `Fourth ${i}`, crest: '', played: 3, w: 0, d: 0, l: 3, gf: 1, ga: 8, gd: -7, pts: 0, advancing: false },
      ]
    }

    expect(getBest8ThirdPlace(standings).map((row) => row.team)).toEqual([
      'Third 11',
      'Third 10',
      'Third 9',
      'Third 8',
      'Third 7',
      'Third 6',
      'Third 5',
      'Third 4',
    ])
  })
})
