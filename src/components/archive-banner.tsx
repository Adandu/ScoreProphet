import { setSelectedTournament } from '@/actions/tournament'

interface Props {
  tournamentName: string
  firstActiveTournamentId: number | null
}

export function ArchiveBanner({ tournamentName, firstActiveTournamentId }: Props) {
  return (
    <div className="w-full bg-amber-900/40 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-sm">
      <span className="text-amber-300">
        Viewing archived tournament: <strong>{tournamentName}</strong> — results are read-only.
      </span>
      {firstActiveTournamentId !== null && (
        <form
          action={async () => {
            'use server'
            await setSelectedTournament(firstActiveTournamentId)
          }}
        >
          <button type="submit" className="text-amber-200 underline hover:text-white ml-4 shrink-0">
            Back to active tournament
          </button>
        </form>
      )}
    </div>
  )
}
