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

interface BracketSlot {
  matchNo: number
  stage: Stage
  homeSlot: string
  awaySlot: string
}

interface DisplayMatch {
  id: number
  matchNo: number
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  winnerTeam: string | null
  status: string
  stage: Stage
  kickoff: string | null
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

const BRACKET_SLOTS: BracketSlot[] = [
  { matchNo: 73, stage: 'ROUND_OF_32', homeSlot: '2A', awaySlot: '2B' },
  { matchNo: 74, stage: 'ROUND_OF_32', homeSlot: '1E', awaySlot: '3ABCDF' },
  { matchNo: 75, stage: 'ROUND_OF_32', homeSlot: '1F', awaySlot: '2C' },
  { matchNo: 76, stage: 'ROUND_OF_32', homeSlot: '1C', awaySlot: '2F' },
  { matchNo: 77, stage: 'ROUND_OF_32', homeSlot: '1I', awaySlot: '3CDFGH' },
  { matchNo: 78, stage: 'ROUND_OF_32', homeSlot: '2E', awaySlot: '2I' },
  { matchNo: 79, stage: 'ROUND_OF_32', homeSlot: '1A', awaySlot: '3CEFHI' },
  { matchNo: 80, stage: 'ROUND_OF_32', homeSlot: '1L', awaySlot: '3EHIJK' },
  { matchNo: 81, stage: 'ROUND_OF_32', homeSlot: '1D', awaySlot: '3BEFIJ' },
  { matchNo: 82, stage: 'ROUND_OF_32', homeSlot: '1G', awaySlot: '3AEHIJ' },
  { matchNo: 83, stage: 'ROUND_OF_32', homeSlot: '2K', awaySlot: '2L' },
  { matchNo: 84, stage: 'ROUND_OF_32', homeSlot: '1H', awaySlot: '2J' },
  { matchNo: 85, stage: 'ROUND_OF_32', homeSlot: '1B', awaySlot: '3EFGIJ' },
  { matchNo: 86, stage: 'ROUND_OF_32', homeSlot: '1J', awaySlot: '2H' },
  { matchNo: 87, stage: 'ROUND_OF_32', homeSlot: '1K', awaySlot: '3DEIJL' },
  { matchNo: 88, stage: 'ROUND_OF_32', homeSlot: '2D', awaySlot: '2G' },
  { matchNo: 89, stage: 'ROUND_OF_16', homeSlot: 'W74', awaySlot: 'W77' },
  { matchNo: 90, stage: 'ROUND_OF_16', homeSlot: 'W73', awaySlot: 'W75' },
  { matchNo: 91, stage: 'ROUND_OF_16', homeSlot: 'W76', awaySlot: 'W78' },
  { matchNo: 92, stage: 'ROUND_OF_16', homeSlot: 'W79', awaySlot: 'W80' },
  { matchNo: 93, stage: 'ROUND_OF_16', homeSlot: 'W83', awaySlot: 'W84' },
  { matchNo: 94, stage: 'ROUND_OF_16', homeSlot: 'W81', awaySlot: 'W82' },
  { matchNo: 95, stage: 'ROUND_OF_16', homeSlot: 'W86', awaySlot: 'W88' },
  { matchNo: 96, stage: 'ROUND_OF_16', homeSlot: 'W85', awaySlot: 'W87' },
  { matchNo: 97, stage: 'QUARTER_FINAL', homeSlot: 'W89', awaySlot: 'W90' },
  { matchNo: 98, stage: 'QUARTER_FINAL', homeSlot: 'W93', awaySlot: 'W94' },
  { matchNo: 99, stage: 'QUARTER_FINAL', homeSlot: 'W91', awaySlot: 'W92' },
  { matchNo: 100, stage: 'QUARTER_FINAL', homeSlot: 'W95', awaySlot: 'W96' },
  { matchNo: 101, stage: 'SEMI_FINAL', homeSlot: 'W97', awaySlot: 'W98' },
  { matchNo: 102, stage: 'SEMI_FINAL', homeSlot: 'W99', awaySlot: 'W100' },
  { matchNo: 103, stage: 'THIRD_PLACE', homeSlot: 'L101', awaySlot: 'L102' },
  { matchNo: 104, stage: 'FINAL', homeSlot: 'W101', awaySlot: 'W102' },
]

export function KnockoutBracket({ matches, timezone }: { matches: BracketMatch[]; timezone: string }) {
  const displayMatches = buildDisplayMatches(matches)
  const byStage = MAIN_ROUNDS.reduce<Record<Stage, DisplayMatch[]>>((acc, stage) => {
    acc[stage] = displayMatches.filter((match) => match.stage === stage)
    return acc
  }, {} as Record<Stage, DisplayMatch[]>)

  const final = displayMatches.find((match) => match.stage === 'FINAL')
  const thirdPlace = displayMatches.find((match) => match.stage === 'THIRD_PLACE')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex w-full items-center justify-center gap-2">
          {MAIN_ROUNDS.map((stage) => (
            <RoundColumn key={`left-${stage}`} title={ROUND_LABELS[stage]} matches={leftHalf(byStage[stage])} timezone={timezone} />
          ))}

          <div className="flex min-w-[136px] flex-col items-center justify-center gap-2 px-1">
            <Image src="/Word_Cup_Trophy.png" alt="World Cup Trophy" width={88} height={110} className="h-24 w-auto object-contain drop-shadow-lg" />
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

function RoundColumn({ title, matches, timezone }: { title: string; matches: DisplayMatch[]; timezone: string }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      <h2 className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-white/45">{title}</h2>
      <div className="flex flex-col justify-center gap-2">
        {matches.length > 0 ? matches.map((match) => <MatchSlot key={match.id} match={match} timezone={timezone} />) : <EmptySlot label={title} />}
      </div>
    </section>
  )
}

function MatchSlot({ match, timezone, compact = false }: { match: DisplayMatch; timezone: string; compact?: boolean }) {
  const homeWon = match.status === 'FINISHED' && match.winnerTeam === match.homeTeam
  const awayWon = match.status === 'FINISHED' && match.winnerTeam === match.awayTeam

  return (
    <div className={`w-full rounded-md border border-white/10 bg-[#0A1628]/80 p-1.5 ${compact ? 'max-w-[132px]' : ''}`}>
      <TeamLine team={match.homeTeam} score={match.homeScore} winner={homeWon} />
      <TeamLine team={match.awayTeam} score={match.awayScore} winner={awayWon} />
      <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-white/10 pt-1.5 text-[9px] text-white/35">
        <span>{match.kickoff ? formatMatchTime(match.kickoff, timezone) : `M${match.matchNo}`}</span>
        {match.status === 'LIVE' && <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />}
      </div>
    </div>
  )
}

function TeamLine({ team, score, winner }: { team: string; score: number | null; winner: boolean }) {
  const pending = /^[WL]?\d|^3[A-L]/.test(team)
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

function leftHalf(matches: DisplayMatch[]) {
  return matches.slice(0, Math.ceil(matches.length / 2))
}

function rightHalf(matches: DisplayMatch[]) {
  return matches.slice(Math.ceil(matches.length / 2))
}

function buildDisplayMatches(matches: BracketMatch[]): DisplayMatch[] {
  const matchByNumber = new Map<number, BracketMatch>()

  for (const stage of ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL'] as Stage[]) {
    const stageSlots = BRACKET_SLOTS.filter((slot) => slot.stage === stage)
    const stageMatches = matches.filter((match) => match.stage === stage).sort(byKickoff)
    stageSlots.forEach((slot, index) => {
      const match = stageMatches[index]
      if (match) matchByNumber.set(slot.matchNo, match)
    })
  }

  return BRACKET_SLOTS.map((slot) => {
    const match = matchByNumber.get(slot.matchNo)
    return {
      id: match?.id ?? -slot.matchNo,
      matchNo: slot.matchNo,
      homeTeam: match && match.homeTeam !== 'TBD' ? match.homeTeam : slot.homeSlot,
      awayTeam: match && match.awayTeam !== 'TBD' ? match.awayTeam : slot.awaySlot,
      homeScore: match?.homeScore ?? null,
      awayScore: match?.awayScore ?? null,
      winnerTeam: match?.winnerTeam ?? null,
      status: match?.status ?? 'SCHEDULED',
      stage: slot.stage,
      kickoff: match?.kickoff ?? null,
    }
  })
}

function byKickoff(a: BracketMatch, b: BracketMatch) {
  return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
}
