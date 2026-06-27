import { formatMatchTime } from '@/lib/format-date'

interface ScheduleMatch {
  id: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest?: string
  awayTeamCrest?: string
  homeScore: number | null
  awayScore: number | null
  status: string
  stage: string
  kickoff: string
}

interface Props {
  matches: ScheduleMatch[]
  timezone: string
}

export function MatchScheduleList({ matches, timezone }: Props) {
  const byStage = matches.reduce<Record<string, ScheduleMatch[]>>((acc, m) => {
    acc[m.stage] = acc[m.stage] ?? []
    acc[m.stage].push(m)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      {Object.entries(byStage).map(([stage, stageMatches]) => (
        <section key={stage}>
          <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            {stage.replace(/_/g, ' ')}
          </h3>
          <div className="space-y-2">
            {stageMatches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-white font-medium w-1/3 text-right">{m.homeTeam}</span>
                <span className="text-white/60 text-sm w-1/3 text-center">
                  {m.status === 'FINISHED'
                    ? `${m.homeScore} - ${m.awayScore}`
                    : m.status === 'LIVE'
                    ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0} LIVE`
                    : formatMatchTime(m.kickoff, timezone)}
                </span>
                <span className="text-white font-medium w-1/3">{m.awayTeam}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
