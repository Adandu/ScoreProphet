'use client'

import { useActionState, useState } from 'react'
import {
  createTournamentFromApi,
  syncTournamentFixtures,
  archiveTournament,
  recalculateTournamentPoints,
} from '@/actions/admin'
import type { Tournament } from '@prisma/client'
import type { AvailableCompetition } from '@/lib/football-api'

interface Props {
  tournaments: Tournament[]
  availableCompetitions: AvailableCompetition[]
}

export function TournamentManager({ tournaments, availableCompetitions }: Props) {
  const [createState, createAction, createPending] = useActionState(createTournamentFromApi, null)
  const [syncState, syncAction, syncPending] = useActionState(syncTournamentFixtures, null)
  const [archiveState, archiveAction, archivePending] = useActionState(archiveTournament, null)
  const [recalcState, recalcAction, recalcPending] = useActionState(recalculateTournamentPoints, null)
  const [selectedCode, setSelectedCode] = useState('')

  const selected = availableCompetitions.find((c) => c.code === selectedCode)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Tournaments</h2>

      {/* Existing tournaments */}
      <div className="space-y-3">
        {tournaments.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
            <div>
              <p className="font-medium text-white">{t.name}</p>
              <p className="text-sm text-white/50">{t.competitionCode} · {t.season} · {t.type}</p>
              {t.isArchived && <span className="text-xs text-amber-400">Archived</span>}
            </div>
            <div className="flex gap-2">
              <form action={syncAction}>
                <input type="hidden" name="tournamentId" value={t.id} />
                <button type="submit" disabled={syncPending}
                  className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {syncPending ? 'Syncing…' : 'Sync'}
                </button>
              </form>
              <form action={recalcAction}>
                <input type="hidden" name="tournamentId" value={t.id} />
                <button type="submit" disabled={recalcPending}
                  className="rounded bg-purple-600 px-3 py-1 text-sm text-white hover:bg-purple-700 disabled:opacity-50">
                  {recalcPending ? 'Recalc…' : 'Recalculate'}
                </button>
              </form>
              {!t.isArchived && (
                <form action={archiveAction}>
                  <input type="hidden" name="tournamentId" value={t.id} />
                  <button type="submit" disabled={archivePending}
                    className="rounded bg-amber-600 px-3 py-1 text-sm text-white hover:bg-amber-700 disabled:opacity-50">
                    Archive
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
        {syncState?.error && <p className="text-sm text-red-400">{syncState.error}</p>}
        {syncState?.success && <p className="text-sm text-green-400">Synced {syncState.synced} matches.</p>}
        {recalcState?.success && <p className="text-sm text-green-400">Recalculated {recalcState.count} matches.</p>}
        {archiveState?.success && <p className="text-sm text-green-400">Tournament archived.</p>}
      </div>

      {/* Add tournament */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
        <h3 className="font-medium text-white">Add Tournament</h3>
        <form action={createAction} className="space-y-3">
          <div>
            <label className="block text-sm text-white/70 mb-1">Competition</label>
            <select
              name="competitionCode"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="w-full rounded bg-white/10 px-3 py-2 text-white"
              required
            >
              <option value="">Select competition…</option>
              {availableCompetitions.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          {selected && (
            <>
              <input type="hidden" name="name" value={selected.name} />
              <input type="hidden" name="type" value={selected.type} />
              <input type="hidden" name="season" value={selected.currentSeason?.startDate.slice(0, 4) ?? ''} />
              <input type="hidden" name="startDate" value={selected.currentSeason?.startDate ?? ''} />
              <input type="hidden" name="endDate" value={selected.currentSeason?.endDate ?? ''} />
              <p className="text-sm text-white/60">
                {selected.currentSeason
                  ? `Season: ${selected.currentSeason.startDate} → ${selected.currentSeason.endDate}`
                  : 'No current season data available — cannot create tournament yet.'}
              </p>
            </>
          )}
          <button
            type="submit"
            disabled={createPending || !selected?.currentSeason}
            className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {createPending ? 'Creating…' : 'Create & Sync Fixtures'}
          </button>
          {createState?.error && <p className="text-sm text-red-400">{createState.error}</p>}
          {createState?.success && <p className="text-sm text-green-400">Created. Synced {createState.synced} matches.</p>}
        </form>
      </div>
    </div>
  )
}
