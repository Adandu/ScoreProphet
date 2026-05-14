'use client'

import { useState, type ReactNode } from 'react'

type TournamentTab = 'groups' | 'bracket' | 'statistics'

export function TournamentTabs({ groups, bracket, statistics }: { groups: ReactNode; bracket: ReactNode; statistics: ReactNode }) {
  const [active, setActive] = useState<TournamentTab>('groups')
  const tabs: Array<{ id: TournamentTab; label: string }> = [
    { id: 'groups', label: 'Group Stage' },
    { id: 'bracket', label: 'Knockout Bracket' },
    { id: 'statistics', label: 'Statistics' },
  ]

  return (
    <div className="space-y-5">
      <div className="border-b border-white/10">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${active === tab.id ? 'border-[#C9A84C] text-[#C9A84C]' : 'border-transparent text-white/50 hover:text-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {active === 'groups' && groups}
      {active === 'bracket' && bracket}
      {active === 'statistics' && statistics}
    </div>
  )
}
