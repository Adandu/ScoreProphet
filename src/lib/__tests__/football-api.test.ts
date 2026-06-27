import { describe, it, expect } from 'vitest'
import { fetchAllMatches, fetchAllTeams, fetchAvailableCompetitions, fetchLiveMatches, fetchStandings, fetchTopScorers, type NormalizedMatch, type NormalizedTeam } from '@/lib/football-api'

// We test normalizeMatch and normalizeTeam indirectly by mocking fetch and
// calling the public fetchAllMatches / fetchAllTeams functions, which pipe
// every raw API object through the normalizers.

function mockFetch(body: unknown) {
  global.fetch = async () =>
    ({
      ok: true,
      json: async () => body,
    } as Response)
}

// ---------------------------------------------------------------------------
// normalizeMatch
// ---------------------------------------------------------------------------

describe('normalizeMatch — via fetchAllMatches', () => {
  it('maps a complete representative API payload to all fields correctly', async () => {
    mockFetch({
      matches: [
        {
          id: 417,
          utcDate: '2026-06-14T18:00:00Z',
          status: 'FINISHED',
          stage: 'GROUP_STAGE',
          group: 'GROUP_A',
          homeTeam: { name: 'Brazil', crest: 'https://example.com/brazil.svg' },
          awayTeam: { name: 'Serbia', crest: 'https://example.com/serbia.svg' },
          score: { fullTime: { home: 2, away: 0 } },
        },
      ],
    })

    const matches: NormalizedMatch[] = await fetchAllMatches()
    expect(matches).toHaveLength(1)
    const m = matches[0]

    expect(m.externalId).toBe('417')
    expect(m.homeTeam).toBe('Brazil')
    expect(m.awayTeam).toBe('Serbia')
    expect(m.homeTeamCrest).toBe('https://example.com/brazil.svg')
    expect(m.awayTeamCrest).toBe('https://example.com/serbia.svg')
    expect(m.stage).toBe('GROUP')
    expect(m.group).toBe('GROUP_A')
    expect(m.kickoff).toEqual(new Date('2026-06-14T18:00:00Z'))
    expect(m.status).toBe('FINISHED')
    expect(m.scoreDuration).toBe('REGULAR')
    expect(m.regularTimeHomeScore).toBeNull()
    expect(m.regularTimeAwayScore).toBeNull()
    expect(m.fullTimeHomeScore).toBe(2)
    expect(m.fullTimeAwayScore).toBe(0)
    expect(m.homeScore).toBe(2)
    expect(m.awayScore).toBe(0)
  })

  it('uses regular-time score for matches that go to extra time', async () => {
    mockFetch({
      matches: [
        {
          id: 418,
          utcDate: '2026-07-04T18:00:00Z',
          status: 'FINISHED',
          stage: 'LAST_16',
          homeTeam: { name: 'Brazil' },
          awayTeam: { name: 'Argentina' },
          score: {
            duration: 'EXTRA_TIME',
            winner: 'AWAY_TEAM',
            regularTime: { home: 1, away: 1 },
            extraTime: { home: 0, away: 1 },
            fullTime: { home: 1, away: 2 },
          },
        },
      ],
    })

    const [match] = await fetchAllMatches()

    expect(match.scoreDuration).toBe('EXTRA_TIME')
    expect(match.regularTimeHomeScore).toBe(1)
    expect(match.regularTimeAwayScore).toBe(1)
    expect(match.extraTimeHomeScore).toBe(0)
    expect(match.extraTimeAwayScore).toBe(1)
    expect(match.fullTimeHomeScore).toBe(1)
    expect(match.fullTimeAwayScore).toBe(2)
    expect(match.homeScore).toBe(1)
    expect(match.awayScore).toBe(1)
    expect(match.winnerTeam).toBe('Argentina')
  })

  it('applies defaults when homeTeam, awayTeam, score, and group are absent', async () => {
    mockFetch({
      matches: [
        {
          id: 999,
          utcDate: '2026-07-01T15:00:00Z',
          status: 'SCHEDULED',
          stage: 'FINAL',
          // no group, no homeTeam, no awayTeam, no score
        },
      ],
    })

    const matches = await fetchAllMatches()
    const m = matches[0]

    expect(m.homeTeam).toBe('TBD')
    expect(m.awayTeam).toBe('TBD')
    expect(m.homeTeamCrest).toBe('')
    expect(m.awayTeamCrest).toBe('')
    expect(m.group).toBeNull()
    expect(m.homeScore).toBeNull()
    expect(m.awayScore).toBeNull()
    expect(m.stage).toBe('FINAL')
    expect(m.status).toBe('SCHEDULED')
  })

  it('maps TIMED status to SCHEDULED', async () => {
    mockFetch({
      matches: [{ id: 1, utcDate: '2026-06-15T12:00:00Z', status: 'TIMED', stage: 'GROUP_STAGE' }],
    })
    const [m] = await fetchAllMatches()
    expect(m.status).toBe('SCHEDULED')
  })

  it('maps IN_PLAY and PAUSED status to LIVE', async () => {
    mockFetch({
      matches: [
        { id: 2, utcDate: '2026-06-16T12:00:00Z', status: 'IN_PLAY', stage: 'ROUND_OF_16' },
        { id: 3, utcDate: '2026-06-17T12:00:00Z', status: 'PAUSED', stage: 'ROUND_OF_16' },
      ],
    })
    const matches = await fetchAllMatches()
    expect(matches[0].status).toBe('LIVE')
    expect(matches[1].status).toBe('LIVE')
  })

  it('falls back to GROUP stage for an unknown stage value', async () => {
    mockFetch({
      matches: [{ id: 5, utcDate: '2026-06-20T12:00:00Z', status: 'SCHEDULED', stage: 'UNKNOWN_STAGE' }],
    })
    const [m] = await fetchAllMatches()
    expect(m.stage).toBe('GROUP')
  })

  it('maps all known knockout stages correctly', async () => {
    const stageFixtures = [
      { api: 'LAST_32', normalized: 'ROUND_OF_32' },
      { api: 'LAST_16', normalized: 'ROUND_OF_16' },
      { api: 'QUARTER_FINALS', normalized: 'QUARTER_FINAL' },
      { api: 'SEMI_FINALS', normalized: 'SEMI_FINAL' },
      { api: 'THIRD_PLACE', normalized: 'THIRD_PLACE' },
      { api: 'FINAL', normalized: 'FINAL' },
    ]

    for (const { api, normalized } of stageFixtures) {
      mockFetch({
        matches: [{ id: 10, utcDate: '2026-06-25T12:00:00Z', status: 'SCHEDULED', stage: api }],
      })
      const [m] = await fetchAllMatches()
      expect(m.stage).toBe(normalized)
    }
  })
})

describe('fetchLiveMatches', () => {
  it('returns all in-play matches, not just the first', async () => {
    mockFetch({
      matches: [
        { id: 1, status: 'IN_PLAY', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, score: { fullTime: { home: 1, away: 0 } }, stage: 'GROUP_STAGE', utcDate: '2026-06-01T18:00:00Z' },
        { id: 2, status: 'IN_PLAY', homeTeam: { name: 'C' }, awayTeam: { name: 'D' }, score: { fullTime: { home: 0, away: 0 } }, stage: 'GROUP_STAGE', utcDate: '2026-06-01T18:00:00Z' },
      ],
    })

    const result = await fetchLiveMatches()

    expect(result).toHaveLength(2)
    expect(result[0].externalId).toBe('1')
    expect(result[1].externalId).toBe('2')
  })
})

// ---------------------------------------------------------------------------
// normalizeTeam
// ---------------------------------------------------------------------------

describe('normalizeTeam — via fetchAllTeams', () => {
  it('maps a complete representative API payload to all fields correctly', async () => {
    mockFetch({
      teams: [
        {
          id: 764,
          name: 'Brazil',
          shortName: 'Brazil',
          tla: 'BRA',
          crest: 'https://crests.football-data.org/764.svg',
          area: { name: 'Brazil', code: 'BRA' },
          address: 'Rua Victor Civita 66, Rio de Janeiro',
          website: 'http://www.cbf.com.br',
          founded: 1914,
          clubColors: 'Yellow / Green / Blue',
          venue: 'Estadio do Maracana',
          coach: { name: 'Dorival Junior' },
          squad: [{ id: 1, name: 'Alisson Becker' }],
          staff: [],
          runningCompetitions: [{ id: 2000, name: 'FIFA World Cup' }],
        },
      ],
    })

    const teams: NormalizedTeam[] = await fetchAllTeams()
    expect(teams).toHaveLength(1)
    const t = teams[0]

    expect(t.externalId).toBe('764')
    expect(t.name).toBe('Brazil')
    expect(t.shortName).toBe('Brazil')
    expect(t.tla).toBe('BRA')
    expect(t.crest).toBe('https://crests.football-data.org/764.svg')
    expect(t.areaName).toBe('Brazil')
    expect(t.areaCode).toBe('BRA')
    expect(t.address).toBe('Rua Victor Civita 66, Rio de Janeiro')
    expect(t.website).toBe('http://www.cbf.com.br')
    expect(t.founded).toBe(1914)
    expect(t.clubColors).toBe('Yellow / Green / Blue')
    expect(t.venue).toBe('Estadio do Maracana')
    expect(t.coachName).toBe('Dorival Junior')
    expect(t.squadJson).toBe(JSON.stringify([{ id: 1, name: 'Alisson Becker' }]))
    expect(t.staffJson).toBe('[]')
    expect(t.runningCompetitionsJson).toBe(JSON.stringify([{ id: 2000, name: 'FIFA World Cup' }]))
    // rawJson contains the full original object
    expect(JSON.parse(t.rawJson).name).toBe('Brazil')
  })

  it('applies defaults when optional fields are absent', async () => {
    mockFetch({
      teams: [
        {
          id: 1,
          // no name, shortName, tla, crest, area, address, website, founded,
          // clubColors, venue, coach, squad, staff, runningCompetitions
        },
      ],
    })

    const [t] = await fetchAllTeams()

    expect(t.externalId).toBe('1')
    expect(t.name).toBe('')
    expect(t.shortName).toBe('')
    expect(t.tla).toBe('')
    expect(t.crest).toBe('')
    expect(t.areaName).toBe('')
    expect(t.areaCode).toBe('')
    expect(t.address).toBe('')
    expect(t.website).toBe('')
    expect(t.founded).toBeNull()
    expect(t.clubColors).toBe('')
    expect(t.venue).toBe('')
    expect(t.coachName).toBe('')
    expect(t.squadJson).toBe('[]')
    expect(t.staffJson).toBe('[]')
    expect(t.runningCompetitionsJson).toBe('[]')
  })

  it('falls back to tla for shortName when shortName is missing', async () => {
    mockFetch({
      teams: [{ id: 2, tla: 'ARG' /* no shortName */ }],
    })
    const [t] = await fetchAllTeams()
    expect(t.shortName).toBe('ARG')
  })

  it('sets founded to null for non-integer values', async () => {
    mockFetch({
      teams: [{ id: 3, founded: 'unknown' }],
    })
    const [t] = await fetchAllTeams()
    expect(t.founded).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fetchStandings
// ---------------------------------------------------------------------------

describe('fetchStandings', () => {
  it('normalizes group standings and keeps only the TOTAL table per group', async () => {
    mockFetch({
      standings: [
        { stage: 'ALL', type: 'TOTAL', group: 'Group A', table: [
          { position: 1, team: { name: 'Brazil', crest: 'b.png' }, playedGames: 3, form: 'W,W,D', won: 2, draw: 1, lost: 0, points: 7, goalsFor: 5, goalsAgainst: 1, goalDifference: 4 },
        ] },
        { stage: 'ALL', type: 'HOME', group: 'Group A', table: [] },
      ],
    })
    const groups = await fetchStandings()
    expect(groups).toHaveLength(1)
    expect(groups[0].group).toBe('Group A')
    expect(groups[0].table[0]).toMatchObject({
      position: 1, teamName: 'Brazil', teamCrest: 'b.png',
      playedGames: 3, won: 2, draw: 1, lost: 0,
      goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 7, form: 'W,W,D',
    })
  })

  it('returns an empty array when no standings are present', async () => {
    mockFetch({})
    expect(await fetchStandings()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// fetchTopScorers
// ---------------------------------------------------------------------------

describe('fetchTopScorers', () => {
  it('normalizes scorer records', async () => {
    mockFetch({
      scorers: [
        { player: { name: 'Haaland' }, team: { name: 'Man City', crest: 'c.png' }, playedMatches: 5, goals: 7, assists: 2, penalties: 1 },
      ],
    })
    const scorers = await fetchTopScorers()
    expect(scorers[0]).toMatchObject({
      playerName: 'Haaland', teamName: 'Man City', teamCrest: 'c.png',
      playedMatches: 5, goals: 7, assists: 2, penalties: 1,
    })
  })

  it('defaults missing assists/penalties to 0 and tolerates missing team', async () => {
    mockFetch({ scorers: [{ player: { name: 'X' }, goals: 3 }] })
    const [s] = await fetchTopScorers()
    expect(s).toMatchObject({ playerName: 'X', teamName: '', goals: 3, assists: 0, penalties: 0 })
  })
})

// ---------------------------------------------------------------------------
// fetchAvailableCompetitions
// ---------------------------------------------------------------------------

describe('fetchAvailableCompetitions', () => {
  it('returns normalized competitions from API response', async () => {
    mockFetch({
      competitions: [
        {
          code: 'WC',
          name: 'FIFA World Cup',
          type: 'CUP',
          currentSeason: { id: 1, startDate: '2026-06-11', endDate: '2026-07-19' },
        },
        {
          code: 'CL',
          name: 'UEFA Champions League',
          type: 'CUP',
          currentSeason: null,
        },
      ],
    })
    const result = await fetchAvailableCompetitions()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      code: 'WC',
      name: 'FIFA World Cup',
      type: 'CUP',
      currentSeason: { id: 1, startDate: '2026-06-11', endDate: '2026-07-19' },
    })
    expect(result[1].currentSeason).toBeNull()
  })
})
