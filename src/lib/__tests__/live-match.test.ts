import { describe, it, expect } from 'vitest'
import { computeFormationPositions, getTeamColor } from '@/lib/live-match'

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
  it('returns a consistent color from API identifiers', () => {
    const color1 = getTeamColor('9999', 'https://crests.football-data.org/9999.svg')
    const color2 = getTeamColor('9999', 'https://crests.football-data.org/9999.svg')
    expect(color1).toBe(color2)
    expect(color1).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('does not depend on hardcoded team names', () => {
    expect(getTeamColor('759', 'https://crests.football-data.org/759.svg')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keeps nearby football-data team identifiers visually distinct', () => {
    const colors = [
      getTeamColor('799', 'https://crests.football-data.org/799.svg'),
      getTeamColor('773', 'https://crests.football-data.org/773.svg'),
      getTeamColor('764', 'https://crests.football-data.org/764.svg'),
      getTeamColor('765', 'https://crests.football-data.org/765.svg'),
    ]

    expect(new Set(colors).size).toBe(colors.length)
  })
})
