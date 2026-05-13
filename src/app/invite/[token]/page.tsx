import Link from 'next/link'
import { redirect } from 'next/navigation'
import { acceptChampionshipInvite } from '@/actions/championships'
import { getSession } from '@/lib/session'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const session = await getSession()
  const invitePath = `/invite/${encodeURIComponent(token)}`

  if (!session.userId) redirect(`/login?next=${encodeURIComponent(invitePath)}`)

  const result = await acceptChampionshipInvite(token)
  if (result.success) redirect(`/championships/${result.championshipId}/predictions`)

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-white/10 bg-white/5 p-8 text-center">
      <h1 className="text-2xl font-bold text-white">Invitation unavailable</h1>
      <p className="mt-3 text-sm text-white/50">{result.error ?? 'This invitation link could not be used.'}</p>
      <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-[#C9A84C] hover:underline">
        Return home
      </Link>
    </div>
  )
}
