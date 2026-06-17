export type TeamStat = { teamId: string; teamName: string; type: 'FOULS' | 'CORNERS' | 'OFFSIDES' | 'FREE_KICKS' | 'GOAL_KICKS' | 'SAVES' | 'THROW_INS' | 'SHOTS' | 'SHOTS_ON_GOAL' | 'SHOTS_OFF_GOAL' | 'YELLOW_CARDS' | 'RED_CARDS'; value: number }

function StatBar({ home, away, homeColor, awayColor }: { home: number; away: number; homeColor: string; awayColor: string }) {
  const total = home + away
  const homePct = total === 0 ? 50 : Math.round((home / total) * 100)
  const awayPct = 100 - homePct
  return (
    <div className="flex h-1 overflow-hidden rounded-full">
      <div style={{ background: homeColor, width: `${homePct}%` }} />
      <div style={{ background: awayColor, width: `${awayPct}%` }} />
    </div>
  )
}

export function MatchStatsRow({
  homeId,
  awayId,
  teamStats,
  homeColor,
  awayColor,
}: {
  homeId: string
  awayId: string
  teamStats: TeamStat[]
  homeColor: string
  awayColor: string
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
      <div className="divide-y divide-white/5">
        {rows.map(({ label, type }) => {
          const h = get(homeId, type)
          const a = get(awayId, type)
          return (
            <div key={type} className="px-4 py-2">
              <div className="mb-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 text-sm">
                <span className="text-right font-bold" style={{ color: homeColor }}>{h}</span>
                <span className="text-center text-xs text-white/50">{label}</span>
                <span className="text-left font-bold" style={{ color: awayColor }}>{a}</span>
              </div>
              <StatBar home={h} away={a} homeColor={homeColor} awayColor={awayColor} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
