import Image from 'next/image'
import Link from 'next/link'
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

export function GroupStageTab({ matches, formByTeam = {}, teamIdByName = {} }: { matches: GroupMatch[]; formByTeam?: Record<string, string>; teamIdByName?: Record<string, string> }) {
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
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => (
        <section key={group} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">
            {GROUP_LABELS[group] ?? group.replace('_', ' ')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[11px]">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
                  <th className="w-[34%] py-2 pr-2 text-left font-normal">Team</th>
                  <th className="px-1 text-right font-normal">P</th>
                  <th className="px-1 text-right font-normal">W</th>
                  <th className="px-1 text-right font-normal">D</th>
                  <th className="px-1 text-right font-normal">L</th>
                  <th className="px-1 text-right font-normal">GF</th>
                  <th className="px-1 text-right font-normal">GA</th>
                  <th className="px-1 text-right font-normal">GD</th>
                  <th className="px-1 text-right font-normal">Pts</th>
                  <th className="w-[104px] pl-2 text-left font-normal">Form</th>
                </tr>
              </thead>
              <tbody>
                {standings[group].map((row) => (
                  <tr key={row.team} className={`border-b border-white/5 last:border-0 ${row.advancing ? 'bg-green-900/30 text-green-300' : 'text-white/75'}`}>
                    <td className="py-2 pr-2">
                      <TeamCell team={row.team} crest={row.crest} teamId={teamIdByName[row.team]} />
                    </td>
                    <td className="px-1 text-right tabular-nums">{row.played}</td>
                    <td className="px-1 text-right tabular-nums">{row.w}</td>
                    <td className="px-1 text-right tabular-nums">{row.d}</td>
                    <td className="px-1 text-right tabular-nums">{row.l}</td>
                    <td className="px-1 text-right tabular-nums">{row.gf}</td>
                    <td className="px-1 text-right tabular-nums">{row.ga}</td>
                    <td className="px-1 text-right tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                    <td className="px-1 text-right font-bold tabular-nums text-[#C9A84C]">{row.pts}</td>
                    <td className="pl-2"><FormStrip form={formByTeam[row.team] ?? ''} /></td>
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

function TeamCell({ team, crest, teamId }: { team: string; crest: string; teamId?: string }) {
  const inner = (
    <>
      <span className="flex h-5 w-5 items-center justify-center">
        {crest ? <Image src={crest} alt="" width={20} height={20} className="max-h-5 object-contain" /> : <span className="h-4 w-4 rounded bg-white/10" />}
      </span>
      <span className="truncate text-[10px] sm:text-[11px]">{team}</span>
    </>
  )
  if (!teamId) return <div className="flex items-center gap-2">{inner}</div>
  return (
    <Link href={`/teams/${teamId}`} className="flex items-center gap-2 transition-opacity hover:opacity-80">
      {inner}
    </Link>
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
