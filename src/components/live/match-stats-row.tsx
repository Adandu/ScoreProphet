import { Fragment } from 'react'

export type TeamStat = { teamId: string; teamName: string; type: 'FOULS' | 'CORNERS' | 'OFFSIDES' | 'FREE_KICKS' | 'GOAL_KICKS' | 'SAVES' | 'THROW_INS' | 'SHOTS' | 'SHOTS_ON_GOAL' | 'SHOTS_OFF_GOAL' | 'YELLOW_CARDS' | 'RED_CARDS'; value: number }

export function MatchStatsRow({
  homeId,
  awayId,
  teamStats,
}: {
  homeId: string
  awayId: string
  teamStats: TeamStat[]
}) {
  const get = (id: string, type: string) =>
    teamStats.find((s) => s.teamId === id && s.type === type)?.value ?? 0

  const rows: { label: string; type: string }[] = [
    { label: 'Corners', type: 'CORNERS' },
    { label: 'Free Kicks', type: 'FREE_KICKS' },
    { label: 'Goal Kicks', type: 'GOAL_KICKS' },
    { label: 'Offsides', type: 'OFFSIDES' },
    { label: 'Fouls', type: 'FOULS' },
    { label: 'Saves', type: 'SAVES' },
    { label: 'Throw-Ins', type: 'THROW_INS' },
    { label: 'Shots', type: 'SHOTS' },
    { label: 'Shots On Goal', type: 'SHOTS_ON_GOAL' },
    { label: 'Shots Off Goal', type: 'SHOTS_OFF_GOAL' },
    { label: 'Yellow Cards', type: 'YELLOW_CARDS' },
    { label: 'Red Cards', type: 'RED_CARDS' },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
      <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
        Match Stats
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-6 p-3 text-sm">
        {rows.map(({ label, type }) => {
          const h = get(homeId, type)
          const a = get(awayId, type)
          return (
            <Fragment key={type}>
              <span className="py-1 text-right font-bold text-white">{h}</span>
              <span className="py-1 text-center text-xs text-white/50">{label}</span>
              <span className="py-1 text-left font-bold text-white">{a}</span>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
