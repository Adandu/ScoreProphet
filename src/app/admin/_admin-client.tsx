'use client'

import { useActionState } from 'react'
import { overrideMatchScore, recalculateAllPoints, removeUser, syncMatchesFromApi } from '@/actions/admin'
import { createChampionship, deleteChampionship, setChampionshipManagers, setChampionshipMembers, updateChampionship } from '@/actions/championships'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

interface Match {
  id: number
  homeTeam: string
  awayTeam: string
  kickoff: string
  status: string
  homeScore: number | null
  awayScore: number | null
  winnerTeam: string | null
  stage: string
  adminOverride: boolean
}

interface User {
  id: number
  username: string
  isAdmin: boolean
}

interface Championship {
  id: number
  name: string
  description: string
  isActive: boolean
  doubleChanceEnabled: boolean
  userIds: number[]
  managerUserIds: number[]
}

export function AdminClient({
  matches,
  users,
  championships,
  timezone,
}: {
  matches: Match[]
  users: User[]
  championships: Championship[]
  timezone: string
}) {
  const [syncState, syncAction, syncPending] = useActionState(syncMatchesFromApi, null)
  const [recalcState, recalcAction, recalcPending] = useActionState(recalculateAllPoints, null)
  const [createState, createAction, createPending] = useActionState(createChampionship, null)

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-white">Admin Panel</h1>

      {/* Actions */}
      <section className="flex gap-3 flex-wrap">
        <form action={syncAction}>
          <Button type="submit" disabled={syncPending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {syncPending ? 'Syncing…' : 'Sync Matches from API'}
          </Button>
        </form>
        <form action={recalcAction}>
          <Button type="submit" disabled={recalcPending} variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent">
            {recalcPending ? 'Recalculating…' : 'Recalculate All Points'}
          </Button>
        </form>
        {syncState?.error && <p className="text-sm text-red-400 self-center">{syncState.error}</p>}
        {syncState?.success && <p className="text-sm text-green-400 self-center">Synced {(syncState as { synced: number }).synced} matches</p>}
        {recalcState?.success && <p className="text-sm text-green-400 self-center">Recalculated {(recalcState as { count: number }).count} matches</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">Championships</h2>
        <form action={createAction} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
          <div>
            <label className="mb-1 block text-xs text-white/40" htmlFor="championship-name">Name</label>
            <Input id="championship-name" name="name" className="w-56 bg-white/10 text-white border-white/20" />
          </div>
          <div className="flex-1 min-w-56">
            <label className="mb-1 block text-xs text-white/40" htmlFor="championship-description">Description</label>
            <Input id="championship-description" name="description" className="bg-white/10 text-white border-white/20" />
          </div>
          <Button type="submit" disabled={createPending} className="bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90 font-semibold">
            {createPending ? 'Creating…' : 'Create'}
          </Button>
          {createState?.error && <p className="text-xs text-red-400">{createState.error}</p>}
          {createState?.success && <p className="text-xs text-green-400">Created</p>}
        </form>
        <div className="space-y-3">
          {championships.map((championship) => (
            <ChampionshipRow key={championship.id} championship={championship} users={users} />
          ))}
          {championships.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/40">
              No championships yet.
            </div>
          )}
        </div>
      </section>

      {/* Users */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">Users</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-2 text-left text-white/40 font-normal">Username</th>
                <th className="px-4 py-2 text-left text-white/40 font-normal">Role</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Override Scores */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#C9A84C]">Override Match Score</h2>
        <div className="space-y-3">
          {matches.map((match) => (
            <MatchOverrideRow key={match.id} match={match} timezone={timezone} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ChampionshipRow({ championship, users }: { championship: Championship; users: User[] }) {
  const [updateState, updateAction, updatePending] = useActionState(updateChampionship, null)
  const [membersState, membersAction, membersPending] = useActionState(setChampionshipMembers, null)
  const [managersState, managersAction, managersPending] = useActionState(setChampionshipManagers, null)
  const [deleteState, deleteAction, deletePending] = useActionState(deleteChampionship, null)

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <form action={updateAction} className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="championshipId" value={championship.id} />
        <div>
          <label className="mb-1 block text-xs text-white/40">Name</label>
          <Input name="name" defaultValue={championship.name} className="w-56 bg-white/10 text-white border-white/20" />
        </div>
        <div className="flex-1 min-w-56">
          <label className="mb-1 block text-xs text-white/40">Description</label>
          <Input name="description" defaultValue={championship.description} className="bg-white/10 text-white border-white/20" />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm text-white/70">
          <input type="checkbox" name="isActive" defaultChecked={championship.isActive} className="h-4 w-4 accent-[#C9A84C]" />
          Active
        </label>
        <label className="flex h-9 items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            name="doubleChanceEnabled"
            defaultChecked={championship.doubleChanceEnabled}
            className="h-4 w-4 accent-[#C9A84C]"
          />
          Double chance
        </label>
        <Button type="submit" size="sm" disabled={updatePending} className="bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90">
          {updatePending ? 'Saving…' : 'Save'}
        </Button>
        {updateState?.error && <span className="text-xs text-red-400">{updateState.error}</span>}
        {updateState?.success && <span className="text-xs text-green-400">Saved</span>}
      </form>

      <form action={managersAction} className="mb-4 space-y-3 border-t border-white/10 pt-4">
        <input type="hidden" name="championshipId" value={championship.id} />
        <p className="text-sm font-medium text-white/70">Championship Managers</p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {users.map((user) => (
            <label key={user.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0A1628]/40 px-3 py-2 text-sm text-white/75">
              <input
                type="checkbox"
                name="managerUserIds"
                value={user.id}
                defaultChecked={championship.managerUserIds.includes(user.id)}
                disabled={user.isAdmin}
                className="h-4 w-4 accent-[#C9A84C] disabled:opacity-40"
              />
              {user.username}
              {user.isAdmin && <span className="text-xs text-[#C9A84C]">Admin</span>}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={managersPending} className="border-white/20 text-white hover:bg-white/10 bg-transparent">
            {managersPending ? 'Saving managers…' : 'Save managers'}
          </Button>
          {managersState?.error && <span className="text-xs text-red-400">{managersState.error}</span>}
          {managersState?.success && <span className="text-xs text-green-400">Managers saved</span>}
        </div>
      </form>

      <form action={membersAction} className="space-y-3">
        <input type="hidden" name="championshipId" value={championship.id} />
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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={membersPending} className="border-white/20 text-white hover:bg-white/10 bg-transparent">
            {membersPending ? 'Saving members…' : 'Save members'}
          </Button>
          {membersState?.error && <span className="text-xs text-red-400">{membersState.error}</span>}
          {membersState?.success && <span className="text-xs text-green-400">Members saved</span>}
        </div>
      </form>

      <form action={deleteAction} className="mt-3">
        <input type="hidden" name="championshipId" value={championship.id} />
        <Button type="submit" size="sm" variant="outline" disabled={deletePending} className="border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent text-xs">
          {deletePending ? 'Deleting…' : 'Delete championship'}
        </Button>
        {deleteState?.error && <span className="ml-2 text-xs text-red-400">{deleteState.error}</span>}
      </form>
    </div>
  )
}

function MatchOverrideRow({ match, timezone }: { match: Match; timezone: string }) {
  const [state, formAction, pending] = useActionState(overrideMatchScore, null)

  return (
    <form action={formAction} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2 flex-wrap">
      <input type="hidden" name="matchId" value={match.id} />
      <span className="text-sm text-white flex-1 min-w-0">
        <span className="text-white/30 text-xs mr-2">{STAGE_LABELS[match.stage] ?? match.stage}</span>
        {match.homeTeam} vs {match.awayTeam}
        <span className="ml-2 text-white/30 text-xs">{new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(match.kickoff))}</span>
        {match.adminOverride && <Badge className="ml-2 bg-orange-600/20 text-orange-400 text-xs">overridden</Badge>}
      </span>
      <Input name="homeScore" type="number" min="0" max="20" defaultValue={match.homeScore ?? ''} placeholder="H" className="w-14 bg-white/10 text-white border-white/20 text-sm h-7 text-center" />
      <span className="text-white/40">–</span>
      <Input name="awayScore" type="number" min="0" max="20" defaultValue={match.awayScore ?? ''} placeholder="A" className="w-14 bg-white/10 text-white border-white/20 text-sm h-7 text-center" />
      {match.stage !== 'GROUP' && (
        <select
          name="winnerTeam"
          defaultValue={match.winnerTeam ?? ''}
          className="h-7 w-44 rounded-md border border-white/20 bg-[#0A1628] px-2 text-sm text-white"
        >
          <option value="" disabled>Advancing team</option>
          <option value={match.homeTeam}>{match.homeTeam}</option>
          <option value={match.awayTeam}>{match.awayTeam}</option>
        </select>
      )}
      <Button type="submit" size="sm" disabled={pending} className="h-7 bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90 text-xs font-semibold">
        {pending ? '…' : 'Set'}
      </Button>
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      {state?.success && <span className="text-xs text-green-400">✓</span>}
    </form>
  )
}

function UserRow({ user }: { user: User }) {
  const [, formAction, pending] = useActionState(removeUser, null)
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="px-4 py-2 text-white">{user.username}</td>
      <td className="px-4 py-2">
        {user.isAdmin ? (
          <Badge className="bg-[#C9A84C] text-[#0A1628]">Admin</Badge>
        ) : (
          <span className="text-white/40">User</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {!user.isAdmin && (
          <form action={formAction}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent text-xs">
              Remove
            </Button>
          </form>
        )}
      </td>
    </tr>
  )
}
