'use server'

import { redirect } from 'next/navigation'
import { acceptInviteToken } from '@/lib/invites'

export async function acceptInvite(prevState: unknown, formData: FormData) {
  const token = (formData.get('token') as string)?.trim() ?? ''
  const result = await acceptInviteToken(token)
  if (result.success) redirect(`/championships/${result.championshipId}/predictions`)
  return { error: result.error ?? 'This invitation link could not be used.' }
}
