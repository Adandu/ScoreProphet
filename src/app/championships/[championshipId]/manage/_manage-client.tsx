'use client'

import { useActionState } from 'react'
import { revokeChampionshipInvite, setChampionshipMembers, updateManagedChampionshipSettings } from '@/actions/championships'
import { Button } from '@/components/ui/button'
import { ChampionshipInviteGenerator } from '@/components/championship-invite-generator'

interface User {
  id: number
  username: string
  isAdmin: boolean
}

interface Invite {
  id: number
  createdAt: string
}

interface Championship {
  id: number
  name: string
  isActive: boolean
  doubleChanceEnabled: boolean
  userIds: number[]
  invites: Invite[]
}

export function ManageChampionshipClient({ championship, users }: { championship: Championship; users: User[] }) {
  const [settingsState, settingsAction, settingsPending] = useActionState(updateManagedChampionshipSettings, null)
  const [membersState, membersAction, membersPending] = useActionState(setChampionshipMembers, null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{championship.name}</h1>
      </div>

      <form action={settingsAction} className="rounded-lg border border-white/10 bg-white/5 p-4">
        <input type="hidden" name="championshipId" value={championship.id} />
        <div className="flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" name="isActive" defaultChecked={championship.isActive} className="h-4 w-4 accent-[#C9A84C]" />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" name="doubleChanceEnabled" defaultChecked={championship.doubleChanceEnabled} className="h-4 w-4 accent-[#C9A84C]" />
            Double Chance
          </label>
          <Button type="submit" size="sm" disabled={settingsPending} className="bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90">
            {settingsPending ? 'Saving…' : 'Save settings'}
          </Button>
          {settingsState?.error && <span className="text-xs text-red-400">{settingsState.error}</span>}
          {settingsState?.success && <span className="text-xs text-green-400">Saved</span>}
        </div>
      </form>

      <form action={membersAction} className="rounded-lg border border-white/10 bg-white/5 p-4">
        <input type="hidden" name="championshipId" value={championship.id} />
        <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">Members</h2>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {users.map((user) => (
            <label key={user.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0A1628]/40 px-3 py-2 text-sm text-white/75">
              <input
                type="checkbox"
                name="userIds"
                value={user.id}
                defaultChecked={championship.userIds.includes(user.id)}
                className="h-4 w-4 accent-[#C9A84C]"
              />
              {user.username}
              {user.isAdmin && <span className="text-xs text-[#C9A84C]">Admin</span>}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={membersPending} className="border-white/20 text-white hover:bg-white/10 bg-transparent">
            {membersPending ? 'Saving members…' : 'Save members'}
          </Button>
          {membersState?.error && <span className="text-xs text-red-400">{membersState.error}</span>}
          {membersState?.success && <span className="text-xs text-green-400">Members saved</span>}
        </div>
      </form>

      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">Invitation Links</h2>
        <ChampionshipInviteGenerator championshipId={championship.id} />
        <div className="mt-4 space-y-2">
          {championship.invites.map((invite) => (
            <InviteRow key={invite.id} invite={invite} />
          ))}
          {championship.invites.length === 0 && <p className="text-sm text-white/40">No active invitation links.</p>}
        </div>
      </section>
    </div>
  )
}

function InviteRow({ invite }: { invite: Invite }) {
  const [state, action, pending] = useActionState(revokeChampionshipInvite, null)

  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-[#0A1628]/40 px-3 py-2 text-sm">
      <input type="hidden" name="inviteId" value={invite.id} />
      <span className="text-white/60">Created {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(invite.createdAt))}</span>
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent">
        {pending ? 'Revoking…' : 'Revoke'}
      </Button>
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
    </form>
  )
}
