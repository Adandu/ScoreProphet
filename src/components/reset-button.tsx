'use client'

import { useActionState } from 'react'
import { resetMatchPredictions } from '@/actions/predictions'
import { Button } from '@/components/ui/button'

export function ResetButton({ matchId }: { matchId: number }) {
  const [state, formAction, pending] = useActionState(resetMatchPredictions, null)

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="matchId" value={matchId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        variant="outline"
        className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent"
      >
        {pending ? 'Resetting…' : 'Reset predictions'}
      </Button>
      {state?.error && <p className="text-xs text-red-400 mt-1">{state.error}</p>}
    </form>
  )
}
