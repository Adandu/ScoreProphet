'use client'

import { useTransition } from 'react'
import { setSelectedTournament } from '@/actions/tournament'
import type { Tournament } from '@prisma/client'

interface Props {
  tournaments: Tournament[]
  selectedId: number | null
}

export function TournamentSwitcher({ tournaments, selectedId }: Props) {
  const [isPending, startTransition] = useTransition()

  if (tournaments.length <= 1) return null

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value)
    startTransition(() => { setSelectedTournament(id) })
  }

  return (
    <select
      value={selectedId ?? tournaments[0]?.id ?? ''}
      onChange={handleChange}
      disabled={isPending}
      className="rounded bg-white/10 px-2 py-1 text-sm text-white border border-white/20 hover:bg-white/20 disabled:opacity-50"
    >
      {tournaments.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  )
}
