import Image from 'next/image'
import { fetchStandings, type StandingsGroup } from '@/lib/football-api'

export async function StandingsPanel() {
  let groups: StandingsGroup[] = []
  try {
    groups = await fetchStandings()
  } catch {
    groups = []
  }

  if (groups.length === 0) {
    return <p className="text-sm text-white/40">Official standings will appear once the tournament is under way.</p>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <section key={group.group} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">{group.group}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40">
                  <th className="py-1 pr-2 font-normal">#</th>
                  <th className="py-1 pr-2 font-normal">Team</th>
                  <th className="py-1 px-1 text-center font-normal">P</th>
                  <th className="py-1 px-1 text-center font-normal">W</th>
                  <th className="py-1 px-1 text-center font-normal">D</th>
                  <th className="py-1 px-1 text-center font-normal">L</th>
                  <th className="py-1 px-1 text-center font-normal">GD</th>
                  <th className="py-1 px-1 text-center font-semibold text-white/60">Pts</th>
                  <th className="py-1 pl-2 font-normal">Form</th>
                </tr>
              </thead>
              <tbody>
                {group.table.map((row) => (
                  <tr key={`${group.group}-${row.position}-${row.teamName}`} className="border-t border-white/5">
                    <td className="py-1.5 pr-2 text-white/50">{row.position}</td>
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-2">
                        {row.teamCrest
                          ? <Image src={row.teamCrest} alt="" width={18} height={18} className="max-h-[18px] w-auto object-contain" />
                          : <span className="h-[18px] w-[18px] rounded bg-white/10" />}
                        <span className="font-medium text-white">{row.teamName}</span>
                      </span>
                    </td>
                    <td className="py-1.5 px-1 text-center text-white/60">{row.playedGames}</td>
                    <td className="py-1.5 px-1 text-center text-white/60">{row.won}</td>
                    <td className="py-1.5 px-1 text-center text-white/60">{row.draw}</td>
                    <td className="py-1.5 px-1 text-center text-white/60">{row.lost}</td>
                    <td className="py-1.5 px-1 text-center text-white/60">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                    <td className="py-1.5 px-1 text-center font-bold text-white">{row.points}</td>
                    <td className="py-1.5 pl-2"><FormStrip form={row.form} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function FormStrip({ form }: { form: string }) {
  const results = form.split(',').map((r) => r.trim()).filter(Boolean)
  if (results.length === 0) return <span className="text-white/25">–</span>
  return (
    <span className="flex gap-1">
      {results.slice(-5).map((result, index) => (
        <span
          key={index}
          title={result}
          className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${
            result === 'W' ? 'bg-green-500/25 text-green-300'
              : result === 'L' ? 'bg-red-500/25 text-red-300'
                : 'bg-white/15 text-white/60'
          }`}
        >
          {result}
        </span>
      ))}
    </span>
  )
}
