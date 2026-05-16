import { prisma } from '@/lib/db'
import { requireChampionshipAccess } from '@/lib/championships'
import { PredictionForm } from '@/components/prediction-form'
import { ResetButton } from '@/components/reset-button'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import { ChampionshipPageNav } from '@/components/championship-page-nav'
import Image from 'next/image'
import { CalendarClock } from 'lucide-react'
import { stageLabel } from '@/lib/prediction-reminder-rules'
import type { Stage } from '@/lib/types'

const STAGE_ORDER: Stage[] = ['GROUP', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL']

export default async function ChampionshipPredictionsPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccess(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, userPredictions, userAdvances] = await Promise.all([
    prisma.match.findMany({
      where: { status: { not: 'FINISHED' } },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.prediction.findMany({ where: { userId: session.userId, championshipId } }),
    prisma.knockoutAdvance.findMany({ where: { userId: session.userId, championshipId } }),
  ])

  const predByMatch = userPredictions.reduce<Record<number, typeof userPredictions>>((acc, p) => {
    acc[p.matchId] = acc[p.matchId] ?? []
    acc[p.matchId].push(p)
    return acc
  }, {})

  const advanceByMatch = userAdvances.reduce<Record<number, string>>((acc, a) => {
    acc[a.matchId] = a.predictedTeam
    return acc
  }, {})

  const grouped = STAGE_ORDER.reduce<Record<Stage, typeof matches>>((acc, stage) => {
    acc[stage] = matches.filter((m) => m.stage === stage)
    return acc
  }, {} as Record<Stage, typeof matches>)

  const now = new Date()

  return (
    <div className="space-y-8">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Predictions</h2>
      {STAGE_ORDER.map((stage) => {
        const stageMatches = grouped[stage]
        if (!stageMatches.length) return null
        return (
          <section key={stage}>
            <h3 className="mb-3 text-lg font-semibold text-[#C9A84C]">{stageLabel(stage)}</h3>
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
                    {!locked && (
                      <>
                        <PredictionForm
                          matchId={match.id}
                          homeTeam={match.homeTeam}
                          awayTeam={match.awayTeam}
                          homeTeamCrest={match.homeTeamCrest}
                          awayTeamCrest={match.awayTeamCrest}
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
