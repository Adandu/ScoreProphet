'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface Props {
  match: {
    homeTeam: string
    awayTeam: string
    homeTeamCrest: string
    awayTeamCrest: string
    homeScore: number | null
    awayScore: number | null
    status: string
    kickoff: string
  }
}

export function LiveMatchCard({ match }: Props) {
  const router = useRouter()

  useEffect(() => {
    if (match.status !== 'LIVE') return
    const interval = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(interval)
  }, [match.status, router])

  const isLive = match.status === 'LIVE'
  const kickoffDate = new Date(match.kickoff)

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
          {match.status === 'FINISHED' ? 'Final Score' : `Kickoff: ${kickoffDate.toLocaleString()}`}
        </p>
      )}
      <div className="flex items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-2 w-32">
          {match.homeTeamCrest && (
            <Image src={match.homeTeamCrest} alt={match.homeTeam} width={64} height={64} className="rounded" />
          )}
          <span className="text-center font-semibold text-white">{match.homeTeam}</span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-5xl font-bold text-[#C9A84C] tabular-nums">
            {match.homeScore ?? '-'} : {match.awayScore ?? '-'}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 w-32">
          {match.awayTeamCrest && (
            <Image src={match.awayTeamCrest} alt={match.awayTeam} width={64} height={64} className="rounded" />
          )}
          <span className="text-center font-semibold text-white">{match.awayTeam}</span>
        </div>
      </div>
    </div>
  )
}
