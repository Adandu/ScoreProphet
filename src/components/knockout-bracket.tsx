'use client'

import Image from 'next/image'
import { formatMatchTime } from '@/lib/format-date'

type Stage = 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'

interface BracketMatch {
  id: number
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  winnerTeam: string | null
  status: string
  stage: string
  kickoff: string
}

const ROUND_LABELS: Record<Stage, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: '3rd Place',
  FINAL: 'Final',
}

const MAIN_ROUNDS: Stage[] = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL']

export function KnockoutBracket({ matches, timezone }: { matches: BracketMatch[]; timezone: string }) {
  const byStage = MAIN_ROUNDS.reduce<Record<Stage, BracketMatch[]>>((acc, stage) => {
    acc[stage] = matches.filter((match) => match.stage === stage).sort(byKickoff)
    return acc
  }, {} as Record<Stage, BracketMatch[]>)

  const final = matches.find((match) => match.stage === 'FINAL')
  const thirdPlace = matches.find((match) => match.stage === 'THIRD_PLACE')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex w-full items-center justify-center gap-2">
          {MAIN_ROUNDS.map((stage) => (
            <RoundColumn key={`left-${stage}`} title={ROUND_LABELS[stage]} matches={leftHalf(byStage[stage])} timezone={timezone} />
          ))}

          <div className="flex min-w-[136px] flex-col items-center justify-center gap-2 px-1">
            <Image src="/trophy.png" alt="World Cup trophy" width={88} height={88} className="h-22 w-auto object-contain drop-shadow-lg" />
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A84C]">World Cup 2026</p>
            {final ? <MatchSlot match={final} timezone={timezone} compact /> : <EmptySlot label="Final" />}
            {thirdPlace && (
              <div className="mt-2 w-full">
                <h2 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">3rd Place</h2>
                <MatchSlot match={thirdPlace} timezone={timezone} compact />
              </div>
            )}
          </div>

          {[...MAIN_ROUNDS].reverse().map((stage) => (
            <RoundColumn key={`right-${stage}`} title={ROUND_LABELS[stage]} matches={rightHalf(byStage[stage])} timezone={timezone} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RoundColumn({ title, matches, timezone }: { title: string; matches: BracketMatch[]; timezone: string }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      <h2 className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-white/45">{title}</h2>
      <div className="flex flex-col justify-center gap-2">
        {matches.length > 0 ? matches.map((match) => <MatchSlot key={match.id} match={match} timezone={timezone} />) : <EmptySlot label={title} />}
      </div>
    </section>
  )
}

function MatchSlot({ match, timezone, compact = false }: { match: BracketMatch; timezone: string; compact?: boolean }) {
  const homeWon = match.status === 'FINISHED' && match.winnerTeam === match.homeTeam
  const awayWon = match.status === 'FINISHED' && match.winnerTeam === match.awayTeam

  return (
    <div className={`w-full rounded-md border border-white/10 bg-[#0A1628]/80 p-1.5 ${compact ? 'max-w-[132px]' : ''}`}>
      <TeamLine team={match.homeTeam} score={match.homeScore} winner={homeWon} />
      <TeamLine team={match.awayTeam} score={match.awayScore} winner={awayWon} />
      <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-white/10 pt-1.5 text-[9px] text-white/35">
        <span>{formatMatchTime(match.kickoff, timezone)}</span>
        {match.status === 'LIVE' && <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />}
      </div>
    </div>
  )
}

function TeamLine({ team, score, winner }: { team: string; score: number | null; winner: boolean }) {
  const pending = team === 'TBD' || team.startsWith('Winner ') || team.startsWith('Runner ')
  return (
    <div className={`flex items-center justify-between gap-1 py-0.5 text-[10px] ${winner ? 'font-bold text-[#C9A84C]' : pending ? 'text-white/35' : 'text-white/80'}`}>
      <span className="truncate">{team}</span>
      <span className="tabular-nums">{score ?? ''}</span>
    </div>
  )
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="w-full rounded-md border border-dashed border-white/10 bg-white/[0.03] p-2 text-center text-[10px] text-white/25">
      {label}
    </div>
  )
}

function byKickoff(a: BracketMatch, b: BracketMatch) {
  return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
}

function leftHalf(matches: BracketMatch[]) {
  return matches.slice(0, Math.ceil(matches.length / 2))
}

function rightHalf(matches: BracketMatch[]) {
  return matches.slice(Math.ceil(matches.length / 2))
}
