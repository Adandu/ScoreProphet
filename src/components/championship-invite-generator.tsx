'use client'

import { useActionState } from 'react'
import { generateChampionshipInvite } from '@/actions/championships'
import { Button } from '@/components/ui/button'

export function ChampionshipInviteGenerator({
  championshipId,
  compact = false,
}: {
  championshipId: number
  compact?: boolean
}) {
  const [state, action, pending] = useActionState(generateChampionshipInvite, null)

  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="championshipId" value={championshipId} />
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          className={compact ? 'bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90 text-xs' : 'bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90'}
        >
          {pending ? 'Generating...' : 'Generate invite link'}
        </Button>
        {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      </form>
      {state?.success && 'inviteUrl' in state && (
        <div className="rounded-md border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-200 break-all">
          {state.inviteUrl}
        </div>
      )}
    </div>
  )
}
