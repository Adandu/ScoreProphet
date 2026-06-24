'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Filter } from 'lucide-react'

function PendingFilterToggleInner({ showPendingOnly }: { showPendingOnly: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function toggle() {
    const params = new URLSearchParams(searchParams.toString())
    if (showPendingOnly) {
      params.delete('pending')
    } else {
      params.set('pending', '1')
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        showPendingOnly
          ? 'border-orange-400/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'
          : 'border-white/15 bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
      }`}
    >
      <Filter className="h-3 w-3" />
      {showPendingOnly ? 'Showing pending only' : 'Show pending only'}
    </button>
  )
}

export function PendingFilterToggle({ showPendingOnly }: { showPendingOnly: boolean }) {
  return (
    <Suspense>
      <PendingFilterToggleInner showPendingOnly={showPendingOnly} />
    </Suspense>
  )
}
