export function formatDisplayScore(match: {
  homeScore: number | null
  awayScore: number | null
  regularTimeHomeScore: number | null
  regularTimeAwayScore: number | null
  fullTimeHomeScore: number | null
  fullTimeAwayScore: number | null
  penaltiesHomeScore: number | null
  penaltiesAwayScore: number | null
  scoreDuration: string
}) {
  // For penalty shootout matches the API rolls penalty goals into fullTime — use regularTime as the clean score
  const homeScore = match.scoreDuration === 'PENALTY_SHOOTOUT'
    ? (match.regularTimeHomeScore ?? match.homeScore)
    : (match.fullTimeHomeScore ?? match.homeScore)
  const awayScore = match.scoreDuration === 'PENALTY_SHOOTOUT'
    ? (match.regularTimeAwayScore ?? match.awayScore)
    : (match.fullTimeAwayScore ?? match.awayScore)
  const base = `${homeScore ?? '-'}-${awayScore ?? '-'}`

  if (match.scoreDuration === 'PENALTY_SHOOTOUT' && match.penaltiesHomeScore !== null && match.penaltiesAwayScore !== null) {
    return `${base} (pens ${match.penaltiesHomeScore}-${match.penaltiesAwayScore})`
  }
  if (match.scoreDuration === 'EXTRA_TIME') return `${base} AET`
  return base
}
