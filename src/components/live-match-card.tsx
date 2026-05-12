'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
}

export function LiveMatchCard({ match, timezone, countdown, headToHead = [] }: Props) {
  const router = useRouter()

  useEffect(() => {
    if (match.status !== 'LIVE') return
    const interval = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(interval)
  }, [match.status, router])

  const isLive = match.status === 'LIVE'

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-8">
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
      <div className="flex items-center justify-center gap-8">
        <TeamBlock name={match.homeTeam} crest={match.homeTeamCrest} href={match.homeTeamUrl} />

        <div className="flex flex-col items-center">
          <span className="text-5xl font-bold text-[#C9A84C] tabular-nums">
            {match.homeScore ?? '-'} : {match.awayScore ?? '-'}
          </span>
        </div>

        <TeamBlock name={match.awayTeam} crest={match.awayTeamCrest} href={match.awayTeamUrl} />
      </div>
      {countdown && (
        <div className="mt-6 border-t border-white/10 pt-4">
          {countdown}
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
                <span className="text-right tabular-nums text-white/35">{formatMatchTime(result.utcDate, timezone)}</span>
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
      <span className="text-center font-semibold text-white">{name}</span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className="flex w-32 flex-col items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/10">
        {content}
      </Link>
    )
  }

  return <div className="flex w-32 flex-col items-center gap-2 p-2">{content}</div>
}
