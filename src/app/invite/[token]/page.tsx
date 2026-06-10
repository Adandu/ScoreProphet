import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getInvitePreview } from '@/lib/invites'
import { AcceptInviteButton } from './_accept-button'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const session = await getSession()
  const invitePath = `/invite/${encodeURIComponent(token)}`

  if (!session.userId) redirect(`/login?next=${encodeURIComponent(invitePath)}`)

  const preview = await getInvitePreview(token)
  if (!preview || (!preview.isActive && !session.isAdmin)) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <h1 className="text-2xl font-bold text-white">Invitation unavailable</h1>
        <p className="mt-3 text-sm text-white/50">This invitation link is no longer valid.</p>
        <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-[#C9A84C] hover:underline">
          Return home
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-white/10 bg-white/5 p-8 text-center">
      <h1 className="text-2xl font-bold text-white">You&apos;ve been invited</h1>
      <p className="mt-3 text-sm text-white/60">
        Join <span className="font-semibold text-white">{preview.championshipName}</span> and start making predictions.
      </p>
      <AcceptInviteButton token={token} />
    </div>
  )
}
