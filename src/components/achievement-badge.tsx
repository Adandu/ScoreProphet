'use client'

import { Popover } from '@base-ui/react/popover'
import type { Achievement } from '@/lib/achievements'

// Badge emoji that explains itself: hover (desktop) or tap (mobile) opens a
// popover with the badge name and what it represents.
export function AchievementBadge({ achievement }: { achievement: Achievement }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        className="cursor-pointer text-sm leading-none outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C]/60 rounded"
        aria-label={achievement.name}
      >
        {achievement.emoji}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} className="z-50">
          <Popover.Popup className="max-w-60 rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-left shadow-lg shadow-black/40">
            <div className="text-sm font-semibold text-[#C9A84C]">
              {achievement.emoji} {achievement.name}
            </div>
            <div className="mt-0.5 text-xs text-white/60">{achievement.description}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
