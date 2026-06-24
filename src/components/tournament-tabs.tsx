'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'

type TournamentTab = 'groups' | 'bracket' | 'teams' | 'scorers' | 'statistics'

export function TournamentTabs({
  groups,
  bracket,
  teams,
  scorers,
  statistics,
}: {
  groups: ReactNode
  bracket: ReactNode
  teams: ReactNode
  scorers: ReactNode
  statistics: ReactNode
}) {
  const searchParams = useSearchParams()
  const active = (searchParams.get('tab') as TournamentTab) ?? 'groups'

  const tabs: Array<{ id: TournamentTab; label: string }> = [
    { id: 'groups', label: 'Group Stage' },
    { id: 'bracket', label: 'Knockout Bracket' },
    { id: 'teams', label: 'Teams' },
    { id: 'scorers', label: 'Top Scorers' },
    { id: 'statistics', label: 'Statistics' },
  ]

  return (
    <div className="space-y-5">
      <div className="border-b border-white/10">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`?tab=${tab.id}`}
              className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                active === tab.id
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      {active === 'groups' && groups}
      {active === 'bracket' && bracket}
      {active === 'teams' && teams}
      {active === 'scorers' && scorers}
      {active === 'statistics' && statistics}
    </div>
  )
}
