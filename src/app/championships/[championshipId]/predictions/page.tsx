import { prisma } from '@/lib/db'
import { requireChampionshipAccessLean } from '@/lib/championships'
import { PredictionForm } from '@/components/prediction-form'
import { ResetButton } from '@/components/reset-button'
import { TournamentWinnerSelector } from '@/components/tournament-winner-selector'
import { PendingFilterToggle } from '@/components/pending-filter-toggle'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import Image from 'next/image'
import { CalendarClock, Trophy } from 'lucide-react'
import { stageLabel } from '@/lib/prediction-reminder-rules'
import type { Stage } from '@/lib/types'

const COMPETITION_LABEL: Record<string, string> = {
  WC: 'World Cup', CL: 'Champions League', PL: 'Premier League',
}

export default async function ChampionshipPredictionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ championshipId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { championshipId: rawId } = await params
  const showPendingOnly = (await searchParams)?.pending === '1'
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccessLean(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, userPredictions, userAdvances, dbTeams, firstGroupMatch, winnerPrediction] = await Promise.all([
    prisma.match.findMany({
      where: { status: { not: 'FINISHED' } },
      orderBy: { kickoff: 'asc' },
      select: {
        id: true, externalId: true, homeTeam: true, awayTeam: true,
        homeTeamCrest: true, awayTeamCrest: true, stage: true,
        kickoff: true, status: true, headToHeadJson: true, competitionCode: true,
      },
    }),
    prisma.prediction.findMany({ where: { userId: session.userId, championshipId } }),
    prisma.knockoutAdvance.findMany({ where: { userId: session.userId, championshipId } }),
    prisma.team.findMany({ orderBy: { name: 'asc' }, select: { name: true, shortName: true, crest: true } }),
    prisma.match.findFirst({ where: { stage: 'GROUP', competitionCode: championship.competitionCode }, orderBy: { kickoff: 'asc' }, select: { kickoff: true } }),
    prisma.tournamentWinnerPrediction.findFirst({ where: { userId: session.userId, championshipId } }),
  ])

  // Fall back to deriving teams from match records if the Team table is empty
  let teams = dbTeams
  if (teams.length === 0) {
    const allMatches = await prisma.match.findMany({
      select: { homeTeam: true, homeTeamCrest: true, awayTeam: true, awayTeamCrest: true },
    })
    const teamMap = new Map<string, { name: string; shortName: string; crest: string }>()
    for (const m of allMatches) {
      if (!teamMap.has(m.homeTeam)) teamMap.set(m.homeTeam, { name: m.homeTeam, shortName: m.homeTeam, crest: m.homeTeamCrest })
      if (!teamMap.has(m.awayTeam)) teamMap.set(m.awayTeam, { name: m.awayTeam, shortName: m.awayTeam, crest: m.awayTeamCrest })
    }
    teams = [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  const isWinnerLocked = Boolean(firstGroupMatch && firstGroupMatch.kickoff <= new Date())

  const predByMatch = userPredictions.reduce<Record<number, typeof userPredictions>>((acc, p) => {
    acc[p.matchId] = acc[p.matchId] ?? []
    acc[p.matchId].push(p)
    return acc
  }, {})

  const advanceByMatch = userAdvances.reduce<Record<number, string>>((acc, a) => {
    acc[a.matchId] = a.predictedTeam
    return acc
  }, {})

  // Group by competitionCode+stage, sorted by earliest kickoff so cross-competition sections interleave correctly
  const sectionMap = new Map<string, typeof matches>()
  for (const m of matches) {
    const key = `${m.competitionCode}__${m.stage}`
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(m)
  }
  const competitions = [...new Set(matches.map((m) => m.competitionCode))]
  const multiCompetition = competitions.length > 1
  const sections = [...sectionMap.entries()]
    .sort(([, a], [, b]) => (a[0]?.kickoff?.getTime() ?? 0) - (b[0]?.kickoff?.getTime() ?? 0))

  const filteredSections = showPendingOnly
    ? sections
        .map(([key, sectionMatches]) => [
          key,
          sectionMatches.filter((match) => {
            const existing = predByMatch[match.id] ?? []
            const hasSingleOutcome = existing.some((p) => p.type === 'SINGLE_OUTCOME')
            const hasDoubleChance = existing.some((p) => p.type === 'DOUBLE_CHANCE')
            const hasResultPrediction = championship.doubleChanceEnabled
              ? hasSingleOutcome || hasDoubleChance
              : hasSingleOutcome
            const hasExactScore = existing.some((p) => p.type === 'EXACT_SCORE')
            const isKnockout = match.stage !== 'GROUP'
            const predictedDraw = existing.some((p) => p.type === 'SINGLE_OUTCOME' && p.value === 'X')
            const hasAdvance = !isKnockout || !predictedDraw || Boolean(advanceByMatch[match.id])
            return !(hasResultPrediction && hasExactScore && hasAdvance)
          }),
        ] as [string, typeof sectionMatches])
        .filter(([, sectionMatches]) => sectionMatches.length > 0)
    : sections

  const now = new Date()

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold text-white">Predictions</h2>

      <section className="rounded-2xl border border-[#C9A84C]/30 bg-gradient-to-br from-[#C9A84C]/10 to-transparent p-5">
        <div className="mb-1 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#C9A84C]" aria-hidden="true" />
          <h3 className="text-lg font-bold text-[#F2D27A]">Tournament Winner</h3>
          <span className="ml-auto rounded bg-[#C9A84C]/20 px-2 py-0.5 text-xs font-bold text-[#F2D27A]">50 pts</span>
        </div>
        <p className="mb-4 text-sm text-white/50">
          Pick the team that wins the whole tournament. Locks when the first group-stage match kicks off.
        </p>
        <TournamentWinnerSelector
          teams={teams}
          existing={winnerPrediction?.predictedTeam ?? null}
          championshipId={championshipId}
          locked={isWinnerLocked}
        />
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-white/40">
          {filteredSections.reduce((n, [, s]) => n + s.length, 0)} match{filteredSections.reduce((n, [, s]) => n + s.length, 0) !== 1 ? 'es' : ''}
          {showPendingOnly ? ' with pending predictions' : ' upcoming'}
        </p>
        <PendingFilterToggle showPendingOnly={showPendingOnly} />
      </div>

      {filteredSections.map(([key, stageMatches]) => {
        const [competitionCode, stage] = key.split('__') as [string, Stage]
        const heading = multiCompetition
          ? `${COMPETITION_LABEL[competitionCode] ?? competitionCode} · ${stageLabel(stage)}`
          : stageLabel(stage)
        return (
          <section key={key}>
            <h3 className="mb-3 text-lg font-semibold text-[#C9A84C]">{heading}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {stageMatches.map((match) => {
                const locked = match.kickoff <= now
                const existing = predByMatch[match.id] ?? []
                const visibleExisting = championship.doubleChanceEnabled
                  ? existing
                  : existing.filter((p) => p.type !== 'DOUBLE_CHANCE')
                const hasResultPrediction = visibleExisting.some((p) => p.type === 'SINGLE_OUTCOME' || p.type === 'DOUBLE_CHANCE')
                const hasExactPrediction = visibleExisting.some((p) => p.type === 'EXACT_SCORE')
                const hasAdvancePrediction = match.stage === 'GROUP' || Boolean(advanceByMatch[match.id])
                const predictionsSet = hasResultPrediction && hasExactPrediction && hasAdvancePrediction
                return (
                  <div key={match.id} className={`rounded-xl border p-4 ${locked ? 'border-white/5 bg-white/[0.03]' : 'border-white/10 bg-white/5'}`}>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[#C9A84C]/35 bg-[#C9A84C]/10 px-3 py-1.5 text-sm font-semibold text-[#F2D27A] shadow-sm shadow-black/20">
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                        <span className="tabular-nums">{formatMatchTime(match.kickoff, timezone)}</span>
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={predictionsSet ? 'text-xs font-semibold text-green-400' : 'text-xs font-semibold text-orange-400'}>
                          {predictionsSet ? 'Predictions set' : 'Predictions not set'}
                        </span>
                        {locked && <Badge variant="outline" className="text-xs border-white/20 text-white/40">Locked</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 font-semibold text-white">
                      <TeamLabel name={match.homeTeam} crest={match.homeTeamCrest} align="right" />
                      <span className="w-8 text-center text-xs uppercase tracking-widest text-white/30">vs</span>
                      <TeamLabel name={match.awayTeam} crest={match.awayTeamCrest} align="left" />
                    </div>
                    <H2HStrip json={match.headToHeadJson} homeTeam={match.homeTeam} />
                    {!locked && (
                      <>
                        <PredictionForm
                          matchId={match.id}
                          homeTeam={match.homeTeam}
                          awayTeam={match.awayTeam}
                          existing={existing}
                          isKnockout={match.stage !== 'GROUP'}
                          existingAdvanceTeam={advanceByMatch[match.id]}
                          championshipId={championshipId}
                          doubleChanceEnabled={championship.doubleChanceEnabled}
                        />
                        {(visibleExisting.length > 0 || advanceByMatch[match.id]) && (
                          <ResetButton matchId={match.id} championshipId={championshipId} />
                        )}
                      </>
                    )}
                    {locked && visibleExisting.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {visibleExisting.map((p) => (
                          <Badge key={p.id} className="bg-white/10 text-white/60 text-xs">{p.value}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

interface H2HMatch {
  id: string
  utcDate: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

function H2HStrip({ json, homeTeam }: { json: string; homeTeam: string }) {
  let matches: H2HMatch[] = []
  try { matches = JSON.parse(json) } catch { return null }
  if (!matches.length) return null

  const sorted = [...matches].sort((a, b) => b.utcDate.localeCompare(a.utcDate))

  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
      {sorted.map((m) => {
        const isHome = m.homeTeam === homeTeam
        const hs = m.homeScore ?? 0
        const as_ = m.awayScore ?? 0
        const result = hs === as_ ? 'D' : (isHome ? (hs > as_ ? 'W' : 'L') : (as_ > hs ? 'W' : 'L'))
        const color = result === 'W' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : result === 'D' ? 'bg-white/10 text-white/50 border-white/20'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
        const date = m.utcDate.slice(0, 10)
        const score = isHome ? `${hs}–${as_}` : `${as_}–${hs}`

        return (
          <div key={m.id} className="group relative">
            <span className={`inline-block cursor-default rounded border px-1.5 py-0.5 text-[11px] font-bold ${color}`}>
              {result}
            </span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#0a1628] border border-white/10 px-2 py-1 text-[11px] text-white/80 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              <span className="font-semibold">{score}</span>
              <span className="mx-1 text-white/30">·</span>
              <span className="text-white/50">{date}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TeamLabel({ name, crest, align }: { name: string; crest: string; align: 'left' | 'right' }) {
  const crestNode = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
      {crest ? <Image src={crest} alt="" width={32} height={32} className="max-h-8 w-auto object-contain" /> : <span className="h-5 w-5 rounded bg-white/10" />}
    </span>
  )

  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'}`}>
      {align === 'right' && crestNode}
      <span className="min-w-0 truncate">{name}</span>
      {align === 'left' && crestNode}
    </div>
  )
}
