import type { ReactNode } from 'react'
import { requireChampionshipAccessLean, getUserChampionships } from '@/lib/championships'
import { ChampionshipSelector } from '@/components/championship-selector'
import { ChampionshipTabBar } from '@/components/championship-tab-bar'

export default async function ChampionshipLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ championshipId: string }>
}) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccessLean(championshipId)
  const championships = await getUserChampionships(session.userId!)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{championship.name}</h1>
        {championships.length > 1 && (
          <ChampionshipSelector
            championships={championships.map((c) => ({ id: c.id, name: c.name }))}
            selectedId={championship.id}
          />
        )}
      </div>
      <ChampionshipTabBar championshipId={championship.id} />
      {children}
    </div>
  )
}
