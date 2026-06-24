'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function ChampionshipTabBar({ championshipId }: { championshipId: number }) {
  const pathname = usePathname()

  const tabs = [
    { href: `/championships/${championshipId}/predictions`, label: 'Predictions' },
    { href: `/championships/${championshipId}/results`, label: 'Results' },
    { href: `/championships/${championshipId}/leaderboard`, label: 'Leaderboard' },
  ]

  return (
    <div className="border-b border-white/10">
      <div className="flex gap-6 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
