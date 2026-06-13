import { fetchLiveMatchDetails, type NormalizedMatch, type LiveMatchDetails } from '@/lib/football-api'
import { PitchFormation } from '@/components/pitch-formation'
import { TeamBlock } from './team-block'
import { CardBadge } from './card-badge'
import { MatchStatsRow } from './match-stats-row'

function fmtMin(minute: number, injuryTime?: number | null, scoreDuration?: string): string {
  if (injuryTime != null && injuryTime > 0) return `${minute}+${injuryTime}'`
  const isET = scoreDuration === 'EXTRA_TIME' || scoreDuration === 'PENALTY_SHOOTOUT'
  if (minute > 120) return `120+${minute - 120}'`
  if (minute > 90 && !isET) return `90+${minute - 90}'`
  return `${minute}'`
}

function mergeBookings(bookings: Awaited<ReturnType<typeof fetchLiveMatchDetails>>['bookings']) {
  const yellows: Record<string, number> = {}
  return bookings.map(b => {
    if (b.card === 'YELLOW_CARD') {
      yellows[b.playerName] = (yellows[b.playerName] ?? 0) + 1
      if (yellows[b.playerName] >= 2) return { ...b, card: 'YELLOW_RED_CARD' as const }
    }
    return b
  })
}

function finishedLabel(scoreDuration: string): string {
  if (scoreDuration === 'PENALTY_SHOOTOUT') return 'Penalties'
  if (scoreDuration === 'EXTRA_TIME') return 'AET'
  return 'Full Time'
}

export async function LiveMatchPanel({ liveMatch, prefetchedDetails }: { liveMatch: NormalizedMatch; prefetchedDetails?: LiveMatchDetails }) {
  let details: LiveMatchDetails
  if (prefetchedDetails) {
    details = prefetchedDetails
  } else {
    try {
      details = await fetchLiveMatchDetails(liveMatch.externalId)
    } catch {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="text-5xl">⚽</div>
          <h2 className="text-2xl font-bold text-white">{liveMatch.homeTeam} vs {liveMatch.awayTeam}</h2>
          <p className="text-white/50">Live match data is unavailable. Please try again shortly.</p>
        </div>
      )
    }
  }

  const homeId = details.homeTeam.id
  const awayId = details.awayTeam.id
  const isShootout = liveMatch.scoreDuration === 'PENALTY_SHOOTOUT'
  const homePenalties = details.penaltyShootout.filter((p) => p.teamId === homeId)
  const awayPenalties = details.penaltyShootout.filter((p) => p.teamId === awayId)

  // During shootout the API adds penalty goals into fullTime — use regularTime as the clean match score
  const homeScore = isShootout
    ? (liveMatch.regularTimeHomeScore ?? liveMatch.homeScore ?? details.homeScore ?? 0)
    : (details.homeScore ?? 0)
  const awayScore = isShootout
    ? (liveMatch.regularTimeAwayScore ?? liveMatch.awayScore ?? details.awayScore ?? 0)
    : (details.awayScore ?? 0)
  // Penalty tally: prefer liveMatch fields (populated when FINISHED), fall back to counting kicks
  const homePenScore = liveMatch.penaltiesHomeScore ?? homePenalties.filter((p) => p.scored).length
  const awayPenScore = liveMatch.penaltiesAwayScore ?? awayPenalties.filter((p) => p.scored).length

  const homeGoals = details.goals.filter((g) => g.teamId === homeId)
  const awayGoals = details.goals.filter((g) => g.teamId === awayId)
  // The API's penalties[] includes in-match penalty goals — filter those out of the shootout display
  const inMatchPenaltyScorers = new Set(
    details.goals.filter((g) => g.type === 'PENALTY').map((g) => g.playerName)
  )
  const homeShootout = homePenalties.filter((p) => !inMatchPenaltyScorers.has(p.playerName))
  const awayShootout = awayPenalties.filter((p) => !inMatchPenaltyScorers.has(p.playerName))
  const homeBookings = mergeBookings(details.bookings.filter((b) => b.teamId === homeId))
  const awayBookings = mergeBookings(details.bookings.filter((b) => b.teamId === awayId))
  const homeSubs = details.substitutions.filter((s) => s.teamId === homeId)
  const awaySubs = details.substitutions.filter((s) => s.teamId === awayId)

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center rounded-xl border border-white/10 bg-[#0a1628] px-8 py-5">
        <div className="flex flex-1 justify-center">
          <TeamBlock name={details.homeTeam.name} crest={details.homeTeam.crest} />
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {liveMatch.status === 'FINISHED' ? (
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-0.5">
              <span className="text-xs font-bold uppercase tracking-widest text-white/50">{finishedLabel(liveMatch.scoreDuration)}</span>
            </div>
          ) : details.halftime ? (
            <div className="flex items-center gap-2 rounded-full bg-blue-950 px-3 py-0.5">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-300">
                {details.minute !== null && details.minute > 45 ? 'ET Break' : 'Half Time'}
              </span>
            </div>
          ) : isShootout ? (
            <div className="flex items-center gap-2 rounded-full bg-purple-950 px-3 py-0.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-purple-300">Penalties</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-red-950 px-3 py-0.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-red-300">Live</span>
            </div>
          )}
          <div className="text-5xl font-black tabular-nums text-[#C9A84C]">
            {homeScore} <span className="text-white/30">:</span> {awayScore}
          </div>
          {isShootout && (
            <div className="text-sm font-semibold text-white/60">
              ({homePenScore} : {awayPenScore}) pens
            </div>
          )}
          {liveMatch.status !== 'FINISHED' && (details.halftime ? (
            <div className="text-sm font-bold text-white/50">{details.minute !== null && details.minute > 45 ? 'ET' : 'HT'}</div>
          ) : isShootout ? null : details.minute !== null && (
            <div className="text-sm text-white/50">{fmtMin(details.minute, details.injuryTime, liveMatch.scoreDuration)}</div>
          ))}
          {(details.venue || details.attendance) && (
            <div className="text-xs text-white/30">
              {[details.venue, details.attendance ? `${details.attendance.toLocaleString()} fans` : null].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

        <div className="flex flex-1 justify-center">
          <TeamBlock name={details.awayTeam.name} crest={details.awayTeam.crest} />
        </div>
      </div>

      {/* 3D Pitch — hidden on mobile via injected media query */}
      <>
        <style>{`#sp-pitch{display:none}@media(min-width:768px){#sp-pitch{display:block}}`}</style>
        <div id="sp-pitch">
          <PitchFormation
            homeTeam={details.homeTeam}
            awayTeam={details.awayTeam}
            goals={details.goals}
            bookings={details.bookings}
            substitutions={details.substitutions}
            referee={details.referee}
            homePossession={details.homePossession}
          />
        </div>
      </>

      {/* Match Stats */}
      {details.teamStats.length > 0 ? (
        <MatchStatsRow
          homeId={String(details.homeTeam.id)}
          awayId={String(details.awayTeam.id)}
          teamStats={details.teamStats}
        />
      ) : (
        <div className="rounded-xl border border-white/10 bg-[#0a1628] px-4 py-3 text-center text-xs text-white/40">
          Match statistics not yet provided by the data feed
        </div>
      )}

      {/* Goals */}
      {(homeGoals.length > 0 || awayGoals.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            ⚽ Goals
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-green-400">⚽</span>
                  <span className="font-semibold text-white/80">{g.playerName}</span>
                  {g.type === 'OWN_GOAL' && <span className="text-xs font-bold text-orange-400">OG</span>}
                  {g.type === 'PENALTY' && <span className="text-xs font-bold text-yellow-400">P</span>}
                  <span className="text-xs font-bold text-white/40">{fmtMin(g.minute, g.injuryTime, liveMatch.scoreDuration)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{fmtMin(g.minute, g.injuryTime, liveMatch.scoreDuration)}</span>
                  {g.type === 'OWN_GOAL' && <span className="text-xs font-bold text-orange-400">OG</span>}
                  {g.type === 'PENALTY' && <span className="text-xs font-bold text-yellow-400">P</span>}
                  <span className="font-semibold text-white/80">{g.playerName}</span>
                  <span className="text-blue-400">⚽</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {(homeBookings.length > 0 || awayBookings.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            Cards
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CardBadge card={b.card} />
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <span className="text-xs font-bold text-white/40">{fmtMin(b.minute, b.injuryTime, liveMatch.scoreDuration)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{fmtMin(b.minute, b.injuryTime, liveMatch.scoreDuration)}</span>
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <CardBadge card={b.card} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Substitutions */}
      {(homeSubs.length > 0 || awaySubs.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            🔄 Substitutions
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeSubs.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm">
                  <span className="font-bold text-green-400">↑</span>
                  <span className="font-semibold text-white/80">{s.playerInName}</span>
                  <span className="font-bold text-red-400">↓</span>
                  <span className="text-white/50">{s.playerOutName}</span>
                  <span className="ml-auto text-xs font-bold text-white/40">{fmtMin(s.minute, s.injuryTime, liveMatch.scoreDuration)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awaySubs.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs font-bold text-white/40">{fmtMin(s.minute, s.injuryTime, liveMatch.scoreDuration)}</span>
                  <span className="text-white/50">{s.playerOutName}</span>
                  <span className="font-bold text-red-400">↓</span>
                  <span className="font-semibold text-white/80">{s.playerInName}</span>
                  <span className="font-bold text-blue-400">↑</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Penalty Shootout */}
      {isShootout && (homeShootout.length > 0 || awayShootout.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            🥅 Penalty Shootout
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeShootout.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={p.scored ? 'text-green-400' : 'text-red-400'}>{p.scored ? '⚽' : '✗'}</span>
                  <span className="font-semibold text-white/80">{p.playerName}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayShootout.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-white/80">{p.playerName}</span>
                  <span className={p.scored ? 'text-green-400' : 'text-red-400'}>{p.scored ? '⚽' : '✗'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
