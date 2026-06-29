'use client'

import Image from 'next/image'
import Link from 'next/link'
import { formatMatchTime } from '@/lib/format-date'

type Stage = 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'

interface BracketMatch {
  id: number
  externalId: string
  homeTeam: string
  awayTeam: string
  homeTeamCrest?: string
  awayTeamCrest?: string
  homeTeamUrl?: string
  awayTeamUrl?: string
  homeScore: number | null
  awayScore: number | null
  scoreDuration: string
  penaltiesHomeScore: number | null
  penaltiesAwayScore: number | null
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
  homeTeamCrest: string | null
  awayTeamCrest: string | null
  homeTeamUrl: string | null
  awayTeamUrl: string | null
  homeScore: number | null
  awayScore: number | null
  scoreDuration: string
  penaltiesHomeScore: number | null
  penaltiesAwayScore: number | null
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

// Slots listed in kickoff date order. matchNo determines which R16 branch each winner enters.
const BRACKET_SLOTS: BracketSlot[] = [
  { matchNo: 73, stage: 'ROUND_OF_32', homeSlot: '2A', awaySlot: '2B' },
  { matchNo: 76, stage: 'ROUND_OF_32', homeSlot: '1C', awaySlot: '2F' },
  { matchNo: 74, stage: 'ROUND_OF_32', homeSlot: '1E', awaySlot: '3ABCDF' },
  { matchNo: 75, stage: 'ROUND_OF_32', homeSlot: '1F', awaySlot: '2C' },
  { matchNo: 78, stage: 'ROUND_OF_32', homeSlot: '2E', awaySlot: '2I' },
  { matchNo: 77, stage: 'ROUND_OF_32', homeSlot: '1I', awaySlot: '3CDFGH' },
  { matchNo: 79, stage: 'ROUND_OF_32', homeSlot: '1A', awaySlot: '3CEFHI' },
  { matchNo: 80, stage: 'ROUND_OF_32', homeSlot: '1L', awaySlot: '3EHIJK' },
  { matchNo: 82, stage: 'ROUND_OF_32', homeSlot: '1G', awaySlot: '3AEHIJ' },
  { matchNo: 81, stage: 'ROUND_OF_32', homeSlot: '1D', awaySlot: '3BEFIJ' },
  { matchNo: 83, stage: 'ROUND_OF_32', homeSlot: '2K', awaySlot: '2L' },
  { matchNo: 84, stage: 'ROUND_OF_32', homeSlot: '1H', awaySlot: '2J' },
  { matchNo: 85, stage: 'ROUND_OF_32', homeSlot: '1B', awaySlot: '3EFGIJ' },
  { matchNo: 88, stage: 'ROUND_OF_32', homeSlot: '2D', awaySlot: '2G' },
  { matchNo: 86, stage: 'ROUND_OF_32', homeSlot: '1J', awaySlot: '2H' },
  { matchNo: 87, stage: 'ROUND_OF_32', homeSlot: '1K', awaySlot: '3DEIJL' },
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

// Bracket arms: matchNos in top-to-bottom visual order per stage.
// Left arm leads to SF M101; right arm leads to SF M102.
const LEFT_ARM: Partial<Record<Stage, number[]>> = {
  ROUND_OF_32: [74, 77, 73, 75, 83, 84, 81, 82],
  ROUND_OF_16: [89, 90, 93, 94],
  QUARTER_FINAL: [97, 98],
  SEMI_FINAL: [101],
}

const RIGHT_ARM: Partial<Record<Stage, number[]>> = {
  ROUND_OF_32: [76, 78, 79, 80, 86, 88, 85, 87],
  ROUND_OF_16: [91, 92, 95, 96],
  QUARTER_FINAL: [99, 100],
  SEMI_FINAL: [102],
}

export function KnockoutBracket({ matches, timezone }: { matches: BracketMatch[]; timezone: string }) {
  const displayMatches = buildDisplayMatches(matches)
  const byMatchNo = new Map(displayMatches.map((m) => [m.matchNo, m]))
  const arm = (arm: Partial<Record<Stage, number[]>>, stage: Stage) =>
    (arm[stage] ?? []).map((n) => byMatchNo.get(n)).filter(Boolean) as DisplayMatch[]

  const final = displayMatches.find((m) => m.stage === 'FINAL')
  const thirdPlace = displayMatches.find((m) => m.stage === 'THIRD_PLACE')

  return (
    <div className="space-y-6">
      <MobileBracket displayMatches={displayMatches} final={final} thirdPlace={thirdPlace} timezone={timezone} />

      <div className="hidden rounded-xl border border-white/10 bg-white/5 p-3 xl:block">
        {/* min-h ensures each flex slot is tall enough to hold a match card */}
        <div className="flex w-full items-stretch justify-center gap-1 min-h-[640px]">
          {/* Left arm: R32 → R16 → QF → SF (outermost to innermost) */}
          {MAIN_ROUNDS.map((stage) => (
            <AlignedColumn key={`left-${stage}`} title={ROUND_LABELS[stage]} matches={arm(LEFT_ARM, stage)} timezone={timezone} />
          ))}

          {/* Center: trophy + final + 3rd place */}
          <div className="flex min-w-[136px] flex-col items-center justify-center gap-2 px-1">
            <Image src="/World_Cup_Trophy.png" alt="World Cup Trophy" width={88} height={110} className="h-24 w-auto object-contain drop-shadow-lg" />
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A84C]">World Cup 2026</p>
            {final ? <MatchSlot match={final} timezone={timezone} compact /> : <EmptySlot label="Final" />}
            {thirdPlace && (
              <div className="mt-2 w-full">
                <h2 className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">3rd Place</h2>
                <MatchSlot match={thirdPlace} timezone={timezone} compact />
              </div>
            )}
          </div>

          {/* Right arm: SF → QF → R16 → R32 (innermost to outermost) */}
          {[...MAIN_ROUNDS].reverse().map((stage) => (
            <AlignedColumn key={`right-${stage}`} title={ROUND_LABELS[stage]} matches={arm(RIGHT_ARM, stage)} timezone={timezone} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MobileBracket({
  displayMatches,
  final,
  thirdPlace,
  timezone,
}: {
  displayMatches: DisplayMatch[]
  final: DisplayMatch | undefined
  thirdPlace: DisplayMatch | undefined
  timezone: string
}) {
  return (
    <div className="space-y-4 xl:hidden">
      {MAIN_ROUNDS.map((stage) => {
        const matches = displayMatches.filter((match) => match.stage === stage)
        return (
          <section key={stage} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#C9A84C]">{ROUND_LABELS[stage]}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {matches.length > 0 ? matches.map((match) => <MatchSlot key={match.id} match={match} timezone={timezone} roomy />) : <EmptySlot label={ROUND_LABELS[stage]} roomy />}
            </div>
          </section>
        )
      })}

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-4 flex items-center justify-center gap-4">
          <Image src="/World_Cup_Trophy.png" alt="World Cup Trophy" width={76} height={96} className="h-20 w-auto object-contain drop-shadow-lg" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A84C]">World Cup 2026</p>
            <h2 className="text-xl font-bold text-white">Finals</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">Final</h3>
            {final ? <MatchSlot match={final} timezone={timezone} roomy /> : <EmptySlot label="Final" roomy />}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">3rd Place</h3>
            {thirdPlace ? <MatchSlot match={thirdPlace} timezone={timezone} roomy /> : <EmptySlot label="3rd Place" roomy />}
          </div>
        </div>
      </section>
    </div>
  )
}

// Each match gets an equal-height flex slot so R16 is perfectly centered between its two R32 feeders.
function AlignedColumn({ title, matches, timezone }: { title: string; matches: DisplayMatch[]; timezone: string }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <h2 className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-white/45 pb-1 shrink-0">{title}</h2>
      <div className="flex flex-1 flex-col">
        {matches.length > 0
          ? matches.map((match) => (
              <div key={match.id} className="flex flex-1 items-center px-0.5 py-0.5">
                <MatchSlot match={match} timezone={timezone} />
              </div>
            ))
          : <EmptySlot label={title} />}
      </div>
    </section>
  )
}

function MatchSlot({ match, timezone, compact = false, roomy = false }: { match: DisplayMatch; timezone: string; compact?: boolean; roomy?: boolean }) {
  const homeWon = match.status === 'FINISHED' && match.winnerTeam === match.homeTeam
  const awayWon = match.status === 'FINISHED' && match.winnerTeam === match.awayTeam
  const scoreNote = getScoreNote(match)

  return (
    <div className={`w-full rounded-md border border-white/10 bg-[#0A1628]/80 ${roomy ? 'p-3' : 'p-1.5'} ${compact ? 'max-w-[132px]' : ''}`}>
      <TeamLine team={match.homeTeam} crest={match.homeTeamCrest} href={match.homeTeamUrl} score={match.homeScore} winner={homeWon} roomy={roomy} />
      <TeamLine team={match.awayTeam} crest={match.awayTeamCrest} href={match.awayTeamUrl} score={match.awayScore} winner={awayWon} roomy={roomy} />
      <div className={`mt-1.5 flex items-center justify-between gap-1 border-t border-white/10 pt-1.5 text-white/35 ${roomy ? 'text-[11px]' : 'text-[9px]'}`}>
        <span>{match.kickoff ? formatMatchTime(match.kickoff, timezone) : `M${match.matchNo}`}</span>
        {scoreNote && <span className="shrink-0 text-[#C9A84C]/80">{scoreNote}</span>}
        {match.status === 'LIVE' && <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />}
      </div>
    </div>
  )
}

function TeamLine({ team, crest, href, score, winner, roomy = false }: { team: string; crest?: string | null; href?: string | null; score: number | null; winner: boolean; roomy?: boolean }) {
  const pending = /^[WL]?\d|^3[A-L]/.test(team)
  const colorClass = winner ? 'font-bold text-[#C9A84C]' : pending ? 'text-white/35' : 'text-white/80'
  const imgSize = roomy ? 18 : 12

  const inner = (
    <>
      {crest && !pending && (
        <Image src={crest} alt="" width={imgSize} height={imgSize} className="shrink-0 object-contain" />
      )}
      <span className="truncate">{team}</span>
    </>
  )

  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${roomy ? 'min-h-7 text-sm' : 'text-[10px]'} ${colorClass}`}>
      {href && !pending ? (
        <Link href={href} className="flex min-w-0 items-center gap-1 truncate transition-opacity hover:opacity-80">
          {inner}
        </Link>
      ) : (
        <span className="flex min-w-0 items-center gap-1 truncate">{inner}</span>
      )}
      <span className="shrink-0 tabular-nums">{score ?? ''}</span>
    </div>
  )
}

function EmptySlot({ label, roomy = false }: { label: string; roomy?: boolean }) {
  return (
    <div className={`w-full rounded-md border border-dashed border-white/10 bg-white/[0.03] text-center text-white/25 ${roomy ? 'p-4 text-sm' : 'p-2 text-[10px]'}`}>
      {label}
    </div>
  )
}

function buildDisplayMatches(matches: BracketMatch[]): DisplayMatch[] {
  const matchByNumber = new Map<number, BracketMatch>()

  for (const stage of ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL'] as Stage[]) {
    const stageSlots = BRACKET_SLOTS.filter((slot) => slot.stage === stage)
    // R32 externalIds are assigned by the API in bracket-position order, not kickoff order.
    // All other stages use kickoff order which aligns with the API bracket structure.
    const sortFn = stage === 'ROUND_OF_32' ? byExternalId : byKickoff
    const stageMatches = matches.filter((match) => match.stage === stage).sort(sortFn)
    stageSlots.forEach((slot, index) => {
      const match = stageMatches[index]
      if (match) matchByNumber.set(slot.matchNo, match)
    })
  }

  return BRACKET_SLOTS.map((slot) => {
    const match = matchByNumber.get(slot.matchNo)
    const realHome = match && match.homeTeam !== 'TBD'
    const realAway = match && match.awayTeam !== 'TBD'
    return {
      id: match?.id ?? -slot.matchNo,
      matchNo: slot.matchNo,
      homeTeam: realHome ? match.homeTeam : slot.homeSlot,
      awayTeam: realAway ? match.awayTeam : slot.awaySlot,
      homeTeamCrest: realHome ? (match.homeTeamCrest ?? null) : null,
      awayTeamCrest: realAway ? (match.awayTeamCrest ?? null) : null,
      homeTeamUrl: realHome ? (match.homeTeamUrl ?? null) : null,
      awayTeamUrl: realAway ? (match.awayTeamUrl ?? null) : null,
      homeScore: match?.homeScore ?? null,
      awayScore: match?.awayScore ?? null,
      scoreDuration: match?.scoreDuration ?? 'REGULAR',
      penaltiesHomeScore: match?.penaltiesHomeScore ?? null,
      penaltiesAwayScore: match?.penaltiesAwayScore ?? null,
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

function byExternalId(a: BracketMatch, b: BracketMatch) {
  return parseInt(a.externalId, 10) - parseInt(b.externalId, 10)
}

function getScoreNote(match: DisplayMatch) {
  if (match.status !== 'FINISHED') return null
  if (match.scoreDuration === 'PENALTY_SHOOTOUT' && match.penaltiesHomeScore !== null && match.penaltiesAwayScore !== null) {
    return `Pens ${match.penaltiesHomeScore}-${match.penaltiesAwayScore}`
  }
  if (match.scoreDuration === 'EXTRA_TIME') return 'AET'
  return null
}
