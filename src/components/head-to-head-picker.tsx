'use client'

import { usePathname, useRouter } from 'next/navigation'

export function HeadToHeadPicker({
  members,
  aId,
  bId,
}: {
  members: Array<{ id: number; username: string }>
  aId: number
  bId: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const go = (a: number, b: number) => router.push(`${pathname}?a=${a}&b=${b}`)

  const selectClass = 'h-9 rounded-md border border-white/20 bg-[#0A1628] px-3 text-sm text-white'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select className={selectClass} value={aId} onChange={(e) => go(Number(e.target.value), bId)}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
      </select>
      <span className="text-sm font-semibold text-white/40">vs</span>
      <select className={selectClass} value={bId} onChange={(e) => go(aId, Number(e.target.value))}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
      </select>
    </div>
  )
}
