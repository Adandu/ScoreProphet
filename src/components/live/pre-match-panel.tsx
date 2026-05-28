import { TeamBlock } from './team-block'

type PreMatchMatch = {
  id: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  kickoff: Date
}

export function PreMatchPanel({ match, now }: { match: PreMatchMatch; now: Date }) {
  const msUntil = match.kickoff.getTime() - now.getTime()
  const minsUntil = Math.max(0, Math.floor(msUntil / 60000))

  return (
    <div className="space-y-4">
      <div className="flex items-center rounded-xl border border-white/10 bg-[#0a1628] px-8 py-5">
        <div className="flex flex-1 justify-center">
          <TeamBlock name={match.homeTeam} crest={match.homeTeamCrest} />
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 rounded-full bg-amber-950 px-3 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Starting soon</span>
          </div>
          <div className="text-5xl font-black tabular-nums text-white/20">
            - <span className="text-white/15">:</span> -
          </div>
          <div className="text-sm text-white/50">
            {minsUntil === 0 ? 'Kick-off now' : `in ${minsUntil} min`}
          </div>
        </div>

        <div className="flex flex-1 justify-center">
          <TeamBlock name={match.awayTeam} crest={match.awayTeamCrest} />
        </div>
      </div>
    </div>
  )
}
