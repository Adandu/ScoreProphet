import type { PlayerStats } from '@/lib/player-stats'

function StatCell({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-white/40">{label}</span>
      <span className="text-xl font-bold text-white">{value}</span>
      {sub && <span className="text-xs text-white/40">{sub}</span>}
    </div>
  )
}

function pct(n: number | null): string {
  return n === null ? '—' : `${n}%`
}

export function PlayerStatsPanel({ stats }: { stats: PlayerStats }) {
  if (stats.matchesPlayed === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">Statistics</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <StatCell
          label="Points"
          value={stats.totalPoints}
          sub={stats.maxPossiblePoints > 0 ? `of ${stats.maxPossiblePoints} possible` : undefined}
        />
        <StatCell
          label="Efficiency"
          value={pct(stats.pointsEfficiency)}
          sub="pts vs max possible"
        />
        <StatCell
          label="Avg per match"
          value={stats.pointsPerMatch ?? '—'}
          sub={`${stats.matchesPlayed} match${stats.matchesPlayed !== 1 ? 'es' : ''} played`}
        />
        <StatCell
          label="Best match"
          value={stats.bestMatchPoints ?? '—'}
          sub="pts in one game"
        />
        <StatCell
          label="Result accuracy"
          value={pct(stats.resultAccuracy)}
          sub="correct outcomes"
        />
        <StatCell
          label="Exact score"
          value={pct(stats.exactAccuracy)}
          sub="correct exact scores"
        />
        {stats.doubleAccuracy !== null && (
          <StatCell
            label="Double chance"
            value={pct(stats.doubleAccuracy)}
            sub="correct double picks"
          />
        )}
        {stats.advanceAccuracy !== null && (
          <StatCell
            label="Advance picks"
            value={pct(stats.advanceAccuracy)}
            sub="correct team to advance"
          />
        )}
        <StatCell
          label="Current streak"
          value={stats.currentStreak}
          sub={`longest: ${stats.longestStreak}`}
        />
      </div>
    </div>
  )
}
