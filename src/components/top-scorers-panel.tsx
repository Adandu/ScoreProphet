import Image from 'next/image'
import { fetchTopScorers, type TopScorer } from '@/lib/football-api'

export async function TopScorersPanel({ competitionCode = 'WC', season }: { competitionCode?: string; season?: string }) {
  let scorers: TopScorer[] = []
  try {
    scorers = await fetchTopScorers(competitionCode, 20, season)
  } catch {
    scorers = []
  }

  if (scorers.length === 0) {
    return <p className="text-sm text-white/40">Top scorers will appear once goals are scored in the tournament.</p>
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">Golden Boot Race</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40">
              <th className="py-1 pr-2 font-normal">#</th>
              <th className="py-1 pr-2 font-normal">Player</th>
              <th className="py-1 pr-2 font-normal">Team</th>
              <th className="py-1 px-2 text-center font-normal">MP</th>
              <th className="py-1 px-2 text-center font-semibold text-white/60">Goals</th>
              <th className="py-1 px-2 text-center font-normal">Assists</th>
              <th className="py-1 px-2 text-center font-normal">Pens</th>
            </tr>
          </thead>
          <tbody>
            {scorers.map((scorer, index) => (
              <tr key={`${scorer.playerName}-${scorer.teamName}`} className="border-t border-white/5">
                <td className="py-1.5 pr-2 text-white/50">{index + 1}</td>
                <td className="py-1.5 pr-2 font-medium text-white">{scorer.playerName}</td>
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-6 shrink-0 items-center justify-center">
                      {scorer.teamCrest
                        ? <Image src={scorer.teamCrest} alt="" width={24} height={16} className="max-h-4 max-w-full object-contain" />
                        : <span className="h-4 w-4 rounded bg-white/10" />}
                    </span>
                    <span className="text-white/70">{scorer.teamName}</span>
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center text-white/60">{scorer.playedMatches}</td>
                <td className="py-1.5 px-2 text-center font-bold text-white">{scorer.goals}</td>
                <td className="py-1.5 px-2 text-center text-white/60">{scorer.assists}</td>
                <td className="py-1.5 px-2 text-center text-white/60">{scorer.penalties}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
