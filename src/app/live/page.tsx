import { Fragment } from 'react'
import Image from 'next/image'
import { fetchLiveMatches, fetchLiveMatchDetails, type NormalizedMatch } from '@/lib/football-api'
import { PitchFormation } from '@/components/pitch-formation'
import { LivePageRefresh } from '@/components/live-page-refresh'
import { requireAuth } from '@/lib/auth'

export const revalidate = 5

export default async function LivePage() {
  await requireAuth()

  let liveMatches: NormalizedMatch[]
  try {
    liveMatches = await fetchLiveMatches()
  } catch {
    liveMatches = []
  }

  if (liveMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="text-2xl font-bold text-white">No live match right now</h1>
        <p className="text-white/50">Check back when a match is in play.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <LivePageRefresh isLive={true} />
      {liveMatches.map((liveMatch) => (
        <LiveMatchPanel key={liveMatch.externalId} liveMatch={liveMatch} />
      ))}
    </div>
  )
}

async function LiveMatchPanel({ liveMatch }: { liveMatch: NormalizedMatch }) {
  let details
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

  const homeId = details.homeTeam.id
  const awayId = details.awayTeam.id
  const homeScore = details.homeScore ?? 0
  const awayScore = details.awayScore ?? 0

  const homeGoals = details.goals.filter((g) => g.teamId === homeId)
  const awayGoals = details.goals.filter((g) => g.teamId === awayId)
  const homeBookings = details.bookings.filter((b) => b.teamId === homeId)
  const awayBookings = details.bookings.filter((b) => b.teamId === awayId)
  const homeSubs = details.substitutions.filter((s) => s.teamId === homeId)
  const awaySubs = details.substitutions.filter((s) => s.teamId === awayId)

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0a1628] px-8 py-5">
        <TeamBlock name={details.homeTeam.name} crest={details.homeTeam.crest} />

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 rounded-full bg-red-950 px-3 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-red-300">Live</span>
          </div>
          <div className="text-5xl font-black tabular-nums text-[#C9A84C]">
            {homeScore} <span className="text-white/30">:</span> {awayScore}
          </div>
          {details.minute !== null && (
            <div className="text-sm text-white/50">{details.minute}&apos;</div>
          )}
          {details.venue && (
            <div className="text-xs text-white/30">{details.venue}</div>
          )}
        </div>

        <TeamBlock name={details.awayTeam.name} crest={details.awayTeam.crest} />
      </div>

      {/* 3D Pitch */}
      <PitchFormation
        homeTeam={details.homeTeam}
        awayTeam={details.awayTeam}
        goals={details.goals}
        bookings={details.bookings}
        substitutions={details.substitutions}
        referee={details.referee}
        homePossession={details.homePossession}
      />

      {/* Match Stats */}
      {details.teamStats.length > 0 && (
        <MatchStatsRow
          homeId={String(details.homeTeam.id)}
          awayId={String(details.awayTeam.id)}
          teamStats={details.teamStats}
        />
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
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
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
            🟨 Cards
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span>{b.card === 'YELLOW_CARD' ? '🟨' : '🟥'}</span>
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <span className="text-xs font-bold text-white/40">{b.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{b.minute}&apos;</span>
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <span>{b.card === 'YELLOW_CARD' ? '🟨' : '🟥'}</span>
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
                  <span className="ml-auto text-xs font-bold text-white/40">{s.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awaySubs.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs font-bold text-white/40">{s.minute}&apos;</span>
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
    </div>
  )
}

type TeamStat = { teamId: string; teamName: string; type: 'FOULS' | 'CORNERS' | 'OFFSIDES' | 'FREE_KICKS' | 'GOAL_KICKS' | 'SAVES' | 'THROW_INS' | 'SHOTS_ON_GOAL' | 'SHOTS_OFF_GOAL' | 'YELLOW_CARDS' | 'RED_CARDS'; value: number }

function MatchStatsRow({
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

function TeamBlock({ name, crest }: { name: string; crest: string }) {
  return (
    <div className="flex min-w-[120px] flex-col items-center gap-2">
      {crest ? (
        <Image src={crest} alt={name} width={68} height={68} className="rounded" />
      ) : (
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-white/10 bg-white/10 text-4xl">⚽</div>
      )}
      <span className="text-center text-base font-bold text-white">{name}</span>
    </div>
  )
}
