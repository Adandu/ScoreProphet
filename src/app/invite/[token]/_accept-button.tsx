'use client'

import { useActionState } from 'react'
import { acceptInvite } from '@/actions/invites'

export function AcceptInviteButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite, null)
  return (
    <form action={formAction} className="mt-6 flex flex-col items-center gap-3">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-md bg-[#C9A84C] px-6 text-sm font-semibold text-[#0A1628] hover:bg-[#C9A84C]/90 disabled:opacity-60"
      >
        {pending ? 'Joining…' : 'Join championship'}
      </button>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  )
}
