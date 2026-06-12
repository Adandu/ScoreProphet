// Derives each team's W/D/L form from finished matches, oldest first, in the
// comma-separated format the group-stage FormStrip expects. Used because the
// football-data.org standings feed leaves `form` null for tournaments.
export function computeFormByTeam(
  matches: Array<{ kickoff: Date; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; status: string }>,
): Record<string, string> {
  const byTeam = new Map<string, string[]>()
  const finished = matches
    .filter((m) => m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())

  for (const m of finished) {
    const homeResult = m.homeScore! > m.awayScore! ? 'W' : m.homeScore! < m.awayScore! ? 'L' : 'D'
    const awayResult = homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D'
    byTeam.set(m.homeTeam, [...(byTeam.get(m.homeTeam) ?? []), homeResult])
    byTeam.set(m.awayTeam, [...(byTeam.get(m.awayTeam) ?? []), awayResult])
  }

  return Object.fromEntries([...byTeam].map(([team, results]) => [team, results.join(',')]))
}
