'use client'
import { useEffect, useState } from 'react'

export function DeadlineBadge({ kickoff }: { kickoff: Date | string }) {
  const [urgent, setUrgent] = useState(false)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  useEffect(() => {
    const check = () => {
      const msLeft = new Date(kickoff).getTime() - Date.now()
      const mins = Math.floor(msLeft / 60000)
      setMinutesLeft(mins)
      setUrgent(msLeft > 0 && msLeft < 2 * 60 * 60 * 1000)
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [kickoff])

  if (!urgent || minutesLeft === null || minutesLeft <= 0) return null

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-500/30">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
      {minutesLeft < 60 ? `${minutesLeft}m left` : `${Math.ceil(minutesLeft / 60)}h left`}
    </span>
  )
}
