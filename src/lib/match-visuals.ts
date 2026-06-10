export interface FormationPosition {
  left: number  // percentage 0–100
  top: number   // percentage 0–100
}

const CLUB_COLOR_MAP: Record<string, string> = {
  black: '#111827',
  blue: '#2563eb',
  gold: '#d4af37',
  green: '#16a34a',
  maroon: '#7f1d1d',
  navy: '#1e3a8a',
  orange: '#f97316',
  purple: '#9333ea',
  red: '#dc2626',
  sky: '#38bdf8',
  white: '#f8fafc',
  yellow: '#facc15',
}

// FIFA World Cup 2026 — home/away jersey colors per national team.
// Names match Football Data API. Aliases handle common variants.
const WC_TEAM_COLORS: Record<string, { home: string; away: string }> = {
  // Group A
  'Mexico':                   { home: '#006847', away: '#FFFFFF' },
  'South Africa':             { home: '#FFB81C', away: '#007A4D' },
  'Korea Republic':           { home: '#C8102E', away: '#5C2D91' },
  'South Korea':              { home: '#C8102E', away: '#5C2D91' },
  'Czechia':                  { home: '#D7141A', away: '#FFFFFF' },
  // Group B
  'Canada':                   { home: '#FF0000', away: '#000000' },
  'Bosnia and Herzegovina':   { home: '#003DA5', away: '#F5D130' },
  'Qatar':                    { home: '#8D1B3D', away: '#FFFFFF' },
  'Switzerland':              { home: '#FF0000', away: '#AAFF00' },
  // Group C
  'Brazil':                   { home: '#F7D22D', away: '#009B77' },
  'Morocco':                  { home: '#C1272D', away: '#FFFFFF' },
  'Haiti':                    { home: '#00209F', away: '#D21034' },
  'Scotland':                 { home: '#003380', away: '#CC0000' },
  // Group D
  'United States':            { home: '#B22234', away: '#002868' },
  'Paraguay':                 { home: '#D52B1E', away: '#FFFFFF' },
  'Australia':                { home: '#FFD200', away: '#008080' },
  'Türkiye':                  { home: '#E30A17', away: '#FFFFFF' },
  'Turkey':                   { home: '#E30A17', away: '#FFFFFF' },
  // Group E
  'Germany':                  { home: '#FFFFFF', away: '#000000' },
  'Curaçao':                  { home: '#003DA5', away: '#FFDE00' },
  'Curacao':                  { home: '#003DA5', away: '#FFDE00' },
  "Côte d'Ivoire":            { home: '#F47920', away: '#FFFFFF' },
  'Ivory Coast':              { home: '#F47920', away: '#FFFFFF' },
  'Ecuador':                  { home: '#FFD100', away: '#003087' },
  // Group F
  'Netherlands':              { home: '#FF6600', away: '#FFFFFF' },
  'Japan':                    { home: '#003087', away: '#FFFFFF' },
  'Sweden':                   { home: '#FECC02', away: '#006AA7' },
  'Tunisia':                  { home: '#E70013', away: '#FFFFFF' },
  // Group G
  'Belgium':                  { home: '#C8102E', away: '#ADD8E6' },
  'Egypt':                    { home: '#C8102E', away: '#FFFFFF' },
  'Iran':                     { home: '#FFFFFF', away: '#239F40' },
  'New Zealand':              { home: '#000000', away: '#B0C4DE' },
  // Group H
  'Spain':                    { home: '#AA151B', away: '#F1BF00' },
  'Cape Verde':               { home: '#003893', away: '#FFFFFF' },
  'Saudi Arabia':             { home: '#4B0082', away: '#FFFFFF' },
  'Uruguay':                  { home: '#75AADB', away: '#FFFFFF' },
  // Group I
  'France':                   { home: '#002395', away: '#FFFFFF' },
  'Senegal':                  { home: '#FFFFFF', away: '#00853F' },
  'Iraq':                     { home: '#007A3D', away: '#FFFFFF' },
  'Norway':                   { home: '#EF2B2D', away: '#000000' },
  // Group J
  'Argentina':                { home: '#75AADB', away: '#003DA5' },
  'Algeria':                  { home: '#FFFFFF', away: '#006233' },
  'Austria':                  { home: '#ED2939', away: '#FFFFFF' },
  'Jordan':                   { home: '#CE1126', away: '#FFFFFF' },
  // Group K
  'Portugal':                 { home: '#CC0001', away: '#FFFFFF' },
  'DR Congo':                 { home: '#007FFF', away: '#FFDF00' },
  'Congo DR':                 { home: '#007FFF', away: '#FFDF00' },
  'Uzbekistan':               { home: '#FFFFFF', away: '#1EB53A' },
  'Colombia':                 { home: '#FCD116', away: '#003087' },
  // Group L
  'England':                  { home: '#FFFFFF', away: '#032577' },
  'Croatia':                  { home: '#FF0000', away: '#003DA5' },
  'Ghana':                    { home: '#FFFFFF', away: '#FCD116' },
  'Panama':                   { home: '#DA121A', away: '#FFFFFF' },
}

// COLOR_CLASH_THRESHOLD: RGB Euclidean distance below which two jersey colors
// are considered too similar to distinguish on the pitch (max possible ≈ 442).
const COLOR_CLASH_THRESHOLD = 100

export function getTeamColor(teamId: string, teamName = '', crestUrl = '', clubColors = '', preference: 'home' | 'away' = 'home'): string {
  const wc = WC_TEAM_COLORS[teamName]
  if (wc) return wc[preference]

  const clubColor = getColorFromClubColors(clubColors)
  if (clubColor) return clubColor

  const source = `${teamId}:${crestUrl}`
  const hash = fnv1a(source)
  const hue = hash % 360
  const saturation = 62 + ((hash >>> 9) % 18)
  const lightness = 42 + ((hash >>> 17) % 12)
  return hslToHex(hue, saturation, lightness)
}

// Returns the home color for both teams, but if they clash switches the away
// team to its secondary (away) jersey color.
export function resolveMatchColors(
  homeTeam: { id: string; name: string; crest: string; clubColors: string },
  awayTeam: { id: string; name: string; crest: string; clubColors: string },
): { homeColor: string; awayColor: string } {
  const homeColor = getTeamColor(homeTeam.id, homeTeam.name, homeTeam.crest, homeTeam.clubColors, 'home')
  const awayColorPrimary = getTeamColor(awayTeam.id, awayTeam.name, awayTeam.crest, awayTeam.clubColors, 'home')

  if (rgbDistance(homeColor, awayColorPrimary) < COLOR_CLASH_THRESHOLD) {
    const awayColorSecondary = getTeamColor(awayTeam.id, awayTeam.name, awayTeam.crest, awayTeam.clubColors, 'away')
    return { homeColor, awayColor: awayColorSecondary }
  }

  return { homeColor, awayColor: awayColorPrimary }
}

function rgbDistance(a: string, b: string): number {
  const pa = hexToRgbTuple(a)
  const pb = hexToRgbTuple(b)
  return Math.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2)
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function getColorFromClubColors(value: string): string | null {
  const tokens = value.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  for (const token of tokens) {
    const color = CLUB_COLOR_MAP[token]
    if (color) return color
  }
  return null
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] :
    [c, 0, x]

  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`
}

function toHex(value: number): string {
  return Math.round(value * 255).toString(16).padStart(2, '0')
}

// Default formation used when formation string is missing or unparseable
const DEFAULT_FORMATION = '4-4-2'

/**
 * Given a formation string like "4-3-3" and side, returns an array of 11
 * {left, top} percentage positions — GK first, then outfield lines in order.
 * Home: attacking right (GK near left). Away: attacking left (GK near right).
 */
export function computeFormationPositions(
  formation: string,
  side: 'home' | 'away'
): FormationPosition[] {
  const raw = formation.trim() || DEFAULT_FORMATION
  const lineCounts = raw.split('-').map(Number).filter((n) => !isNaN(n) && n > 0)
  if (lineCounts.length === 0 || lineCounts.reduce((a, b) => a + b, 0) !== 10) {
    // Fallback: parse default
    return computeFormationPositions(DEFAULT_FORMATION, side)
  }

  const positions: FormationPosition[] = []

  // GK
  const gkLeft = side === 'home' ? 5 : 95
  positions.push({ left: gkLeft, top: 50 })

  // Outfield lines: spread x between 17% and 47% (home) or 83% to 53% (away)
  const numLines = lineCounts.length
  const xStart = side === 'home' ? 17 : 83
  const xEnd = side === 'home' ? 47 : 53
  const xStep = numLines > 1 ? (xEnd - xStart) / (numLines - 1) : 0

  lineCounts.forEach((count, lineIndex) => {
    const left = Math.round(xStart + xStep * lineIndex)
    for (let i = 0; i < count; i++) {
      const top = Math.round((100 / (count + 1)) * (i + 1))
      positions.push({ left, top })
    }
  })

  return positions
}
