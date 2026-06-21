import { prisma } from '@/lib/db'
import { requireChampionshipAccessLean } from '@/lib/championships'
import { formatMatchTime } from '@/lib/format-date'
import { ChampionshipPageNav } from '@/components/championship-page-nav'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarClock, CheckCircle2 } from 'lucide-react'

export default async function ChampionshipPendingPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccessLean(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const now = new Date()

  const [matches, userPredictions, userAdvances] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: 'SCHEDULED',
        kickoff: { gt: now },
        competitionCode: championship.competitionCode,
      },
      orderBy: { kickoff: 'asc' },
      select: {
        id: true,
        homeTeam: true,
        awayTeam: true,
        homeTeamCrest: true,
        awayTeamCrest: true,
        stage: true,
        kickoff: true,
      },
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

  const pendingMatches = matches.filter((match) => {
    const existing = predByMatch[match.id] ?? []

    const hasSingleOutcome = existing.some((p) => p.type === 'SINGLE_OUTCOME')
    const hasDoubleChance = existing.some((p) => p.type === 'DOUBLE_CHANCE')
    const hasResultPrediction = championship.doubleChanceEnabled
      ? hasSingleOutcome || hasDoubleChance
      : hasSingleOutcome
    const hasExactScore = existing.some((p) => p.type === 'EXACT_SCORE')
    const isKnockout = match.stage !== 'GROUP'
    const hasAdvance = !isKnockout || Boolean(advanceByMatch[match.id])

    return !(hasResultPrediction && hasExactScore && hasAdvance)
  })

  return (
    <div className="space-y-8">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Pending Predictions</h2>

      {pendingMatches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 p-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-400" aria-hidden="true" />
          <p className="text-lg font-semibold text-green-300">All predictions set! Nothing left to do.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pendingMatches.map((match) => {
            const existing = predByMatch[match.id] ?? []

            const hasSingleOutcome = existing.some((p) => p.type === 'SINGLE_OUTCOME')
            const hasDoubleChance = existing.some((p) => p.type === 'DOUBLE_CHANCE')
            const hasResultPrediction = championship.doubleChanceEnabled
              ? hasSingleOutcome || hasDoubleChance
              : hasSingleOutcome
            const hasExactScore = existing.some((p) => p.type === 'EXACT_SCORE')
            const isKnockout = match.stage !== 'GROUP'
            const hasAdvance = !isKnockout || Boolean(advanceByMatch[match.id])

            const missing: string[] = []
            if (!hasResultPrediction) missing.push('result')
            if (!hasExactScore) missing.push('exact score')
            if (isKnockout && !hasAdvance) missing.push('advance pick')

            return (
              <div key={match.id} className="rounded-xl border border-orange-400/20 bg-orange-500/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 shrink-0 text-[#C9A84C]" aria-hidden="true" />
                  <span className="tabular-nums text-sm font-semibold text-[#F2D27A]">
                    {formatMatchTime(match.kickoff, timezone)}
                  </span>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 font-semibold text-white mb-3">
                  <TeamLabel name={match.homeTeam} crest={match.homeTeamCrest} align="right" />
                  <span className="w-8 text-center text-xs uppercase tracking-widest text-white/30">vs</span>
                  <TeamLabel name={match.awayTeam} crest={match.awayTeamCrest} align="left" />
                </div>

                <p className="mb-3 text-xs text-orange-300/80">
                  Missing: {missing.join(', ')}
                </p>

                <Link
                  href={`/championships/${championshipId}/predictions`}
                  className="inline-block rounded-lg bg-[#C9A84C]/20 px-4 py-2 text-sm font-semibold text-[#F2D27A] hover:bg-[#C9A84C]/30 transition-colors"
                >
                  Set predictions →
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TeamLabel({ name, crest, align }: { name: string; crest: string; align: 'left' | 'right' }) {
  const crestNode = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
      {crest ? (
        <Image src={crest} alt="" width={32} height={32} className="max-h-8 w-auto object-contain" />
      ) : (
        <span className="h-5 w-5 rounded bg-white/10" />
      )}
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
