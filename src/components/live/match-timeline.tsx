import type { LiveMatchEvent, LiveMatchBooking, LiveMatchSubstitution } from '@/lib/football-api'
import { CardBadge } from './card-badge'

type GoalEvent   = LiveMatchEvent & { kind: 'goal' }
type BookingEvent = LiveMatchBooking & { kind: 'booking' }
type SubEvent    = LiveMatchSubstitution & { kind: 'sub' }
type TimelineItem = (GoalEvent | BookingEvent | SubEvent) & { sortKey: number }

function fmtMin(minute: number, injuryTime?: number): string {
  if (injuryTime && injuryTime > 0) return `${minute}+${injuryTime}'`
  return `${minute}'`
}

function GoalLabel({ event }: { event: GoalEvent }) {
  return (
    <span className="flex items-center gap-1 text-sm">
      <span>⚽</span>
      <span className="font-semibold text-white/80">{event.playerName}</span>
      {event.type === 'OWN_GOAL' && <span className="text-[10px] font-bold text-orange-400">OG</span>}
      {event.type === 'PENALTY' && <span className="text-[10px] font-bold text-yellow-400">P</span>}
      {event.assistName && <span className="text-xs text-white/35">({event.assistName})</span>}
    </span>
  )
}

function BookingLabel({ event }: { event: BookingEvent }) {
  return (
    <span className="flex items-center gap-1 text-sm">
      <CardBadge card={event.card} />
      <span className="font-semibold text-white/80">{event.playerName}</span>
    </span>
  )
}

function SubLabel({ event }: { event: SubEvent }) {
  return (
    <span className="flex flex-col text-sm leading-tight">
      <span className="flex items-center gap-1">
        <span className="font-bold text-green-400 text-xs">↑</span>
        <span className="font-semibold text-white/80">{event.playerInName}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="font-bold text-red-400 text-xs">↓</span>
        <span className="text-white/40">{event.playerOutName}</span>
      </span>
    </span>
  )
}

export function MatchTimeline({
  homeId,
  goals,
  bookings,
  substitutions,
}: {
  homeId: string
  goals: LiveMatchEvent[]
  bookings: LiveMatchBooking[]
  substitutions: LiveMatchSubstitution[]
}) {
  const items: TimelineItem[] = [
    ...goals.map((g) => ({ ...g, kind: 'goal' as const, sortKey: g.minute * 100 + (g.injuryTime ?? 0) })),
    ...bookings.map((b) => ({ ...b, kind: 'booking' as const, sortKey: b.minute * 100 + (b.injuryTime ?? 0) + 1 })),
    ...substitutions.map((s) => ({ ...s, kind: 'sub' as const, sortKey: s.minute * 100 + (s.injuryTime ?? 0) + 2 })),
  ].sort((a, b) => a.sortKey - b.sortKey)

  if (items.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
      <div className="border-b border-white/5 px-4 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-white/40">
        Match Timeline
      </div>
      <div className="px-2 py-2">
        {items.map((item, i) => {
          const isHome = item.teamId === homeId
          const min = fmtMin(item.minute, item.injuryTime)

          return (
            <div key={i} className="grid grid-cols-[1fr_48px_1fr] items-center gap-1 py-1">
              {/* Home side */}
              <div className="flex justify-end pr-1">
                {isHome && (
                  item.kind === 'goal' ? <GoalLabel event={item} /> :
                  item.kind === 'booking' ? <BookingLabel event={item} /> :
                  <SubLabel event={item} />
                )}
              </div>

              {/* Minute — center */}
              <div className="flex flex-col items-center">
                <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/50">
                  {min}
                </span>
              </div>

              {/* Away side */}
              <div className="flex justify-start pl-1">
                {!isHome && (
                  item.kind === 'goal' ? <GoalLabel event={item} /> :
                  item.kind === 'booking' ? <BookingLabel event={item} /> :
                  <SubLabel event={item} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
