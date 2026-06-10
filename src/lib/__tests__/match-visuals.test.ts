import { describe, it, expect } from 'vitest'
import { computeFormationPositions, getTeamColor, resolveMatchColors } from '@/lib/match-visuals'

describe('computeFormationPositions', () => {
  it('returns 11 positions for a valid 4-3-3 home formation', () => {
    const positions = computeFormationPositions('4-3-3', 'home')
    expect(positions).toHaveLength(11)
  })

  it('returns 11 positions for a valid 4-2-3-1 home formation', () => {
    const positions = computeFormationPositions('4-2-3-1', 'home')
    expect(positions).toHaveLength(11)
  })

  it('places home GK at left:5%, top:50%', () => {
    const positions = computeFormationPositions('4-3-3', 'home')
    expect(positions[0]).toEqual({ left: 5, top: 50 })
  })

  it('places away GK at left:95%, top:50%', () => {
    const positions = computeFormationPositions('4-3-3', 'away')
    expect(positions[0]).toEqual({ left: 95, top: 50 })
  })

  it('evenly spaces 4 defenders vertically', () => {
    const positions = computeFormationPositions('4-3-3', 'home')
    // 4 defenders = players index 1–4
    const defenders = positions.slice(1, 5)
    expect(defenders[0].top).toBe(20)
    expect(defenders[1].top).toBe(40)
    expect(defenders[2].top).toBe(60)
    expect(defenders[3].top).toBe(80)
  })

  it('handles empty/unknown formation by returning 11 fallback positions', () => {
    const positions = computeFormationPositions('', 'home')
    expect(positions).toHaveLength(11)
  })
})

describe('getTeamColor', () => {
  it('uses the first parseable API club color when available', () => {
    expect(getTeamColor('764', '', 'https://crests.football-data.org/764.svg', 'Yellow / Green / Blue')).toBe('#facc15')
    expect(getTeamColor('773', '', 'https://crests.football-data.org/773.svg', 'Blue / White / Red')).toBe('#2563eb')
    expect(getTeamColor('765', '', 'https://crests.football-data.org/765.svg', 'Red / Green')).toBe('#dc2626')
  })

  it('returns a consistent color from API identifiers', () => {
    const color1 = getTeamColor('9999', '', 'https://crests.football-data.org/9999.svg')
    const color2 = getTeamColor('9999', '', 'https://crests.football-data.org/9999.svg')
    expect(color1).toBe(color2)
    expect(color1).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('falls back to hash for unknown team names', () => {
    expect(getTeamColor('759', '', 'https://crests.football-data.org/759.svg')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keeps nearby football-data team identifiers visually distinct', () => {
    const colors = [
      getTeamColor('799', '', 'https://crests.football-data.org/799.svg', 'Unlisted'),
      getTeamColor('773', '', 'https://crests.football-data.org/773.svg', 'Unlisted'),
      getTeamColor('764', '', 'https://crests.football-data.org/764.svg', 'Unlisted'),
      getTeamColor('765', '', 'https://crests.football-data.org/765.svg', 'Unlisted'),
    ]
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('returns WC home color by team name', () => {
    expect(getTeamColor('', 'Brazil', '', '', 'home')).toBe('#F7D22D')
    expect(getTeamColor('', 'England', '', '', 'home')).toBe('#FFFFFF')
    expect(getTeamColor('', 'Argentina', '', '', 'home')).toBe('#75AADB')
  })

  it('returns WC away color by team name when preference is away', () => {
    expect(getTeamColor('', 'Brazil', '', '', 'away')).toBe('#009B77')
    expect(getTeamColor('', 'England', '', '', 'away')).toBe('#032577')
    expect(getTeamColor('', 'South Korea', '', '', 'away')).toBe('#5C2D91')
  })

  it('WC name lookup takes priority over clubColors', () => {
    expect(getTeamColor('764', 'Brazil', 'https://...', 'Yellow / Green', 'home')).toBe('#F7D22D')
  })
})

describe('resolveMatchColors', () => {
  const team = (name: string) => ({ id: '1', name, crest: '', clubColors: '' })

  it('uses home kit for both teams when colors differ', () => {
    const { homeColor, awayColor } = resolveMatchColors(team('Brazil'), team('France'))
    expect(homeColor).toBe('#F7D22D')
    expect(awayColor).toBe('#002395')
  })

  it('switches away team to secondary kit when home colors clash', () => {
    // Belgium and Egypt both have red home kits (#C8102E)
    const { homeColor, awayColor } = resolveMatchColors(team('Belgium'), team('Egypt'))
    expect(homeColor).toBe('#C8102E')
    expect(awayColor).toBe('#FFFFFF') // Egypt away
  })

  it('switches away team to secondary kit for similar reds', () => {
    // Canada (#FF0000) vs Switzerland (#FF0000) — identical home colors
    const { homeColor, awayColor } = resolveMatchColors(team('Canada'), team('Switzerland'))
    expect(homeColor).toBe('#FF0000')
    expect(awayColor).toBe('#AAFF00') // Switzerland away (neon green)
  })

  it('does not clash Argentina sky blue vs France navy', () => {
    const { awayColor } = resolveMatchColors(team('Argentina'), team('France'))
    expect(awayColor).toBe('#002395') // France home — no clash
  })
})
