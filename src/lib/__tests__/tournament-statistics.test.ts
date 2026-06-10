import { describe, it, expect } from 'vitest'
import { computeTournamentStatistics } from '@/lib/tournament-statistics'

const teams = [
  {
    externalId: '1',
    name: 'Alpha',
    crest: 'a.png',
    squadJson: JSON.stringify([
      { name: 'Young A', position: 'Midfield', dateOfBirth: '2005-01-01' },
      { name: 'Old A', position: 'Goalkeeper', dateOfBirth: '1990-01-01' },
      // National-team squads from football-data.org include the coach as a
      // squad entry with position "Coach" — must be excluded from player stats.
      { name: 'Coach Old', position: 'Coach', dateOfBirth: '1970-01-01' },
    ]),
  },
  { externalId: '2', name: 'Beta', crest: 'b.png', squadJson: '[]' },
]

const matches = [
  { homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 2, awayScore: 1, fullTimeHomeScore: 2, fullTimeAwayScore: 1 },
  { homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 0, awayScore: 0, fullTimeHomeScore: 0, fullTimeAwayScore: 0 },
]

const events = [
  { type: 'GOAL', minute: 10, teamName: 'Alpha', playerName: 'Young A', relatedPlayerName: '', match: { homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 2, awayScore: 1 } },
  { type: 'GOAL', minute: 20, teamName: 'Alpha', playerName: 'Young A', relatedPlayerName: '', match: { homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 2, awayScore: 1 } },
]

describe('computeTournamentStatistics', () => {
  const stats = computeTournamentStatistics({ matches, events, teamStats: [], teams })

  it('sums total goals from full-time scores', () => {
    expect(stats.totalGoals).toBe(3)
  })

  it('counts completed matches', () => {
    expect(stats.completedMatches).toBe(2)
  })

  it('counts clean sheets (per team that conceded zero)', () => {
    expect(stats.cleanSheets).toBe(2)
  })

  it('identifies the top scorer with goal count', () => {
    expect(stats.topScorer).toEqual({ key: 'Young A|||Alpha', count: 2 })
  })

  it('identifies the team with the most goals scored', () => {
    expect(stats.mostGoalsTeam).toEqual({ teamName: 'Alpha', goalsFor: 2 })
  })

  it('identifies youngest and oldest players from squad birthdates', () => {
    expect(stats.youngestPlayer?.name).toBe('Young A')
    expect(stats.oldestPlayer?.name).toBe('Old A')
  })

  it('excludes coaches (position "Coach") from youngest/oldest player stats', () => {
    expect(stats.oldestPlayer?.name).not.toBe('Coach Old')
  })

  it('returns lean team references without squadJson for rendering', () => {
    expect(stats.teams).toEqual([
      { externalId: '1', name: 'Alpha', crest: 'a.png' },
      { externalId: '2', name: 'Beta', crest: 'b.png' },
    ])
  })
})
