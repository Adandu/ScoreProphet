'use client'

import { useState } from 'react'
import type { RankedUser } from '@/lib/leaderboard'
import type { Achievement } from '@/lib/achievements'
import { AchievementBadge } from '@/components/achievement-badge'

type Scope = 'overall' | 'group' | 'knockout'

const MEDALS = ['🥇', '🥈', '🥉']

export function LeaderboardTabs({
  overall,
  group,
  knockout,
  doubleChanceEnabled,
  currentUserId,
  achievementsByUser = {},
}: {
  overall: RankedUser[]
  group: RankedUser[]
  knockout: RankedUser[]
  doubleChanceEnabled: boolean
  currentUserId?: number
  achievementsByUser?: Record<number, Achievement[]>
}) {
  const [scope, setScope] = useState<Scope>('overall')
  const rows = scope === 'group' ? group : scope === 'knockout' ? knockout : overall
  const tabs: Array<{ id: Scope; label: string }> = [
    { id: 'overall', label: 'Overall' },
    { id: 'group', label: 'Group Stage' },
    { id: 'knockout', label: 'Knockout' },
  ]
  const colCount = doubleChanceEnabled ? 8 : 7

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setScope(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              scope === tab.id ? 'bg-[#C9A84C] text-[#0A1628]' : 'bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-white/40 font-normal w-12">#</th>
              <th className="px-4 py-3 text-left text-white/40 font-normal">Player</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Exact</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Result</th>
              {doubleChanceEnabled && <th className="px-4 py-3 text-right text-white/40 font-normal">Double</th>}
              {scope !== 'group' && <th className="px-4 py-3 text-right text-white/40 font-normal">Advance</th>}
              {scope === 'overall' && <th className="px-4 py-3 text-right text-white/40 font-normal">Winner</th>}
              <th className="px-4 py-3 text-right font-semibold text-white/40">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => {
              const isCurrentUser = u.id === currentUserId
              return (
                <tr key={u.id} className={`border-b border-white/5 last:border-0 ${isCurrentUser ? 'bg-[#C9A84C]/10' : ''}`}>
                  <td className="px-4 py-3 text-white/60">{MEDALS[i] ?? i + 1}</td>
                  <td className={`px-4 py-3 font-medium ${isCurrentUser ? 'text-[#C9A84C]' : 'text-white'}`}>
                    <span className="flex items-center gap-1.5">
                      <span>{u.username} {isCurrentUser && '(you)'}</span>
                      {(achievementsByUser[u.id] ?? []).map((a) => (
                        <AchievementBadge key={a.id} achievement={a} />
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-yellow-400">{u.exact}</td>
                  <td className="px-4 py-3 text-right text-green-400">{u.single}</td>
                  {doubleChanceEnabled && <td className="px-4 py-3 text-right text-blue-400">{u.double ?? 0}</td>}
                  {scope !== 'group' && <td className="px-4 py-3 text-right text-purple-400">{u.advance}</td>}
                  {scope === 'overall' && <td className="px-4 py-3 text-right text-amber-400">{u.winner}</td>}
                  <td className="px-4 py-3 text-right font-bold text-[#C9A84C] text-base">{u.total}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-white/30">
                  No scores yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
