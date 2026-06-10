import Image from 'next/image'
import { computeGroupStandings, type GroupMatch } from '@/lib/standings'

const GROUP_LABELS: Record<string, string> = {
  GROUP_A: 'Group A',
  GROUP_B: 'Group B',
  GROUP_C: 'Group C',
  GROUP_D: 'Group D',
  GROUP_E: 'Group E',
  GROUP_F: 'Group F',
  GROUP_G: 'Group G',
  GROUP_H: 'Group H',
  GROUP_I: 'Group I',
  GROUP_J: 'Group J',
  GROUP_K: 'Group K',
  GROUP_L: 'Group L',
}

export function GroupStageTab({ matches }: { matches: GroupMatch[] }) {
  const standings = computeGroupStandings(matches)
  const groups = Object.keys(standings).sort()

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/40">
        Group stage has not started yet.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {groups.map((group) => (
        <section key={group} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">
            {GROUP_LABELS[group] ?? group.replace('_', ' ')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[11px]">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
                  <th className="w-[42%] py-2 pr-2 text-left font-normal">Team</th>
                  <th className="px-1 text-right font-normal">P</th>
                  <th className="px-1 text-right font-normal">W</th>
                  <th className="px-1 text-right font-normal">D</th>
                  <th className="px-1 text-right font-normal">L</th>
                  <th className="px-1 text-right font-normal">GF</th>
                  <th className="px-1 text-right font-normal">GA</th>
                  <th className="px-1 text-right font-normal">GD</th>
                  <th className="pl-1 text-right font-normal">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings[group].map((row) => (
                  <tr key={row.team} className={`border-b border-white/5 last:border-0 ${row.advancing ? 'bg-green-900/30 text-green-300' : 'text-white/75'}`}>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center">
                          {row.crest ? <Image src={row.crest} alt="" width={20} height={20} className="max-h-5 object-contain" /> : <span className="h-4 w-4 rounded bg-white/10" />}
                        </span>
                        <span className="truncate text-[10px] sm:text-[11px]">{row.team}</span>
                      </div>
                    </td>
                    <td className="px-1 text-right tabular-nums">{row.played}</td>
                    <td className="px-1 text-right tabular-nums">{row.w}</td>
                    <td className="px-1 text-right tabular-nums">{row.d}</td>
                    <td className="px-1 text-right tabular-nums">{row.l}</td>
                    <td className="px-1 text-right tabular-nums">{row.gf}</td>
                    <td className="px-1 text-right tabular-nums">{row.ga}</td>
                    <td className="px-1 text-right tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                    <td className="pl-1 text-right font-bold tabular-nums text-[#C9A84C]">{row.pts}</td>
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
