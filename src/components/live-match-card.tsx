'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatMatchTime } from '@/lib/format-date'

interface Props {
  match: {
    homeTeam: string
    awayTeam: string
    homeTeamCrest: string
    awayTeamCrest: string
    homeTeamUrl?: string
    awayTeamUrl?: string
    homeScore: number | null
    awayScore: number | null
    status: string
    kickoff: string
  }
  timezone: string
  countdown?: ReactNode
  headToHead?: Array<{
    id: string
    utcDate: string
    competition: string
    homeTeam: string
    awayTeam: string
    homeScore: number | null
    awayScore: number | null
  }>
  revealedPredictions?: {
    championshipName: string
    players: Array<{
      userId: number
      username: string
      single: string | null
      double: string | null
      exact: string | null
      advance: string | null
    }>
  }
}

export function LiveMatchCard({ match, timezone, countdown, headToHead = [], revealedPredictions }: Props) {
  const isLive = match.status === 'LIVE'

  return (
    <div className="w-full max-w-xl rounded-xl border border-white/10 bg-white/5 p-4 sm:p-8">
      {isLive && (
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-semibold uppercase tracking-widest text-red-400">Live</span>
        </div>
      )}
      {!isLive && (
        <p className="mb-4 text-center text-sm text-white/50">
          {match.status === 'FINISHED' ? 'Final Score' : `Kickoff: ${formatMatchTime(match.kickoff, timezone)}`}
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:items-center sm:gap-8">
        <TeamBlock name={match.homeTeam} crest={match.homeTeamCrest} href={match.homeTeamUrl} />

        <div className="flex min-h-16 items-center justify-center pt-2 sm:pt-0">
          <span className="grid grid-cols-[2ch_auto_2ch] items-center gap-1 text-center text-3xl font-bold tabular-nums text-[#C9A84C] sm:text-5xl">
            <span className="text-right">{match.homeScore ?? '-'}</span>
            <span className="text-center text-white/35">:</span>
            <span className="text-left">{match.awayScore ?? '-'}</span>
          </span>
        </div>

        <TeamBlock name={match.awayTeam} crest={match.awayTeamCrest} href={match.awayTeamUrl} />
      </div>
      {countdown && (
        <div className="mt-6 border-t border-white/10 pt-4">
          {countdown}
        </div>
      )}
      {revealedPredictions && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-white/40">
            {revealedPredictions.championshipName} predictions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
                  <th className="px-2 py-2 text-left font-normal">Player</th>
                  <th className="px-2 py-2 text-left font-normal">Result</th>
                  <th className="px-2 py-2 text-left font-normal">Double</th>
                  <th className="px-2 py-2 text-left font-normal">Score</th>
                  <th className="px-2 py-2 text-left font-normal">Advance</th>
                </tr>
              </thead>
              <tbody>
                {revealedPredictions.players.map((player) => (
                  <tr key={player.userId} className="border-b border-white/5 last:border-0">
                    <td className="px-2 py-2 font-medium text-white/80">{player.username}</td>
                    <td className="px-2 py-2 text-white/60">{player.single ?? '-'}</td>
                    <td className="px-2 py-2 text-white/60">{player.double ?? '-'}</td>
                    <td className="px-2 py-2 text-white/60">{player.exact ?? '-'}</td>
                    <td className="px-2 py-2 text-white/60">{player.advance ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-6 border-t border-white/10 pt-4">
        <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-white/40">Last 10 head-to-head results</h2>
        {headToHead.length > 0 ? (
          <div className="space-y-2">
            {headToHead.map((result) => (
              <div key={result.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-md bg-white/[0.03] p-2 text-xs text-white/60">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white/80">
                    {result.homeTeam} {result.homeScore ?? '-'}-{result.awayScore ?? '-'} {result.awayTeam}
                  </p>
                  <p className="truncate text-white/35">{result.competition || 'Match result'}</p>
                </div>
                <span className="text-right tabular-nums text-white/35">
                  {result.utcDate && !isNaN(new Date(result.utcDate).getTime())
                    ? formatMatchTime(result.utcDate, timezone)
                    : 'TBD'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-white/35">No previous head-to-head results are available yet.</p>
        )}
      </div>
    </div>
  )
}

function TeamBlock({ name, crest, href }: { name: string; crest: string; href?: string }) {
  const content = (
    <>
      {crest && (
        <Image src={crest} alt={name} width={64} height={64} className="rounded" />
      )}
      <span className="max-w-28 truncate text-center text-sm font-semibold text-white sm:max-w-32 sm:text-base">{name}</span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className="flex min-w-0 flex-col items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/10">
        {content}
      </Link>
    )
  }

  return <div className="flex min-w-0 flex-col items-center gap-2 p-2">{content}</div>
}
