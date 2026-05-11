import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { PredictionForm } from '@/components/prediction-form'
import { ResetButton } from '@/components/reset-button'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'

type Stage = 'GROUP' | 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'

const STAGE_LABELS: Record<Stage, string> = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

const STAGE_ORDER: Stage[] = ['GROUP', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL']

export default async function PredictionsPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const matches = await prisma.match.findMany({
    where: { status: { not: 'FINISHED' } },
    orderBy: { kickoff: 'asc' },
  })

  const userPredictions = await prisma.prediction.findMany({
    where: { userId: session.userId },
  })

  const predByMatch = userPredictions.reduce<Record<number, typeof userPredictions>>((acc, p) => {
    acc[p.matchId] = acc[p.matchId] ?? []
    acc[p.matchId].push(p)
    return acc
  }, {})

  const userAdvances = await prisma.knockoutAdvance.findMany({
    where: { userId: session.userId },
  })
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
      <h1 className="text-2xl font-bold text-white">Make Your Predictions</h1>
      {STAGE_ORDER.map((stage) => {
        const stageMatches = grouped[stage]
        if (!stageMatches.length) return null
        return (
          <section key={stage}>
            <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">{STAGE_LABELS[stage]}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {stageMatches.map((match) => {
                const locked = match.kickoff <= now
                const existing = predByMatch[match.id] ?? []
                return (
                  <div key={match.id} className={`rounded-xl border p-4 ${locked ? 'border-white/5 bg-white/3 opacity-60' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/40">{formatMatchTime(match.kickoff, timezone)}</span>
                      {locked && <Badge variant="outline" className="text-xs border-white/20 text-white/40">🔒 Locked</Badge>}
                    </div>
                    <div className="flex items-center justify-between font-semibold text-white">
                      <span>{match.homeTeam}</span>
                      <span className="text-white/30">vs</span>
                      <span>{match.awayTeam}</span>
                    </div>
                    {!locked && (
                      <>
                        <PredictionForm
                          matchId={match.id}
                          existing={existing}
                          isKnockout={match.stage !== 'GROUP'}
                          existingAdvanceTeam={advanceByMatch[match.id]}
                        />
                        {existing.length > 0 && (
                          <ResetButton matchId={match.id} />
                        )}
                      </>
                    )}
                    {locked && existing.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {existing.map((p) => (
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
