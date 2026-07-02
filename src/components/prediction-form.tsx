'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { savePrediction, saveKnockoutAdvance } from '@/actions/predictions'
import { Button } from '@/components/ui/button'

type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE'
type ScoreOutcome = '1' | 'X' | '2'

interface ExistingPrediction {
  id: number
  type: PredictionType
  value: string
}

interface Props {
  matchId: number
  homeTeam: string
  awayTeam: string
  existing: ExistingPrediction[]
  isKnockout: boolean
  existingAdvanceTeam?: string
  championshipId: number
  doubleChanceEnabled: boolean
  isArchived?: boolean
}

const SINGLE_OPTS = ['1', 'X', '2']
const DOUBLE_OPTS = ['1X', 'X2', '12']
const OUTCOME_LABELS: Record<string, string> = {
  '1': 'Home win',
  'X': 'Draw',
  '2': 'Away win',
  '1X': 'Home win or Draw',
  'X2': 'Draw or Away win',
  '12': 'Home win or Away win',
}
const SCORE_OPTS = Array.from({ length: 11 }, (_, i) => i)

function parseScore(value?: string): { home: number; away: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(value ?? '')
  if (!match) return null
  return { home: parseInt(match[1], 10), away: parseInt(match[2], 10) }
}

function getScoreOutcome(home: number, away: number): ScoreOutcome {
  if (home > away) return '1'
  if (home < away) return '2'
  return 'X'
}

function scoreMatchesSelection(home: number, away: number, selection?: ExistingPrediction): boolean {
  if (!selection) return true
  const outcome = getScoreOutcome(home, away)
  if (selection.type === 'SINGLE_OUTCOME') return selection.value === outcome
  if (selection.type === 'DOUBLE_CHANCE') return selection.value.includes(outcome)
  return true
}

function getFirstAllowedScore(selection?: ExistingPrediction): { home: number; away: number } {
  for (const home of SCORE_OPTS) {
    for (const away of SCORE_OPTS) {
      if (scoreMatchesSelection(home, away, selection)) return { home, away }
    }
  }
  return { home: 0, away: 0 }
}

function scoreHasAllowedPair(score: number, side: 'home' | 'away', selection?: ExistingPrediction): boolean {
  return SCORE_OPTS.some((otherScore) =>
    side === 'home'
      ? scoreMatchesSelection(score, otherScore, selection)
      : scoreMatchesSelection(otherScore, score, selection)
  )
}

function getAllowedScoresForSide(side: 'home' | 'away', selection?: ExistingPrediction): number[] {
  return SCORE_OPTS.filter((score) => scoreHasAllowedPair(score, side, selection))
}

export function PredictionForm({
  matchId,
  homeTeam,
  awayTeam,
  existing,
  isKnockout,
  existingAdvanceTeam,
  championshipId,
  doubleChanceEnabled,
  isArchived = false,
}: Props) {
  // Hook must be called unconditionally (Rules of Hooks)
  const [state, formAction, pending] = useActionState(savePrediction, null)

  if (isArchived) {
    return (
      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-white/50 text-sm text-center">
        Predictions locked — tournament has ended.
        {existing.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {existing.map((p) => (
              <span key={p.id} className="inline-block rounded border border-white/15 bg-white/10 px-2 py-0.5 text-xs text-white/60">
                {p.value}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const hasSingle = existing.some((p) => p.type === 'SINGLE_OUTCOME')
  const hasDouble = existing.some((p) => p.type === 'DOUBLE_CHANCE')
  const hasExact = existing.some((p) => p.type === 'EXACT_SCORE')
  const exactScoreValue = existing.find((p) => p.type === 'EXACT_SCORE')?.value
  const exactScore = parseScore(exactScoreValue)
  const resultSelection = existing.find((p) => p.type === 'SINGLE_OUTCOME' || p.type === 'DOUBLE_CHANCE')
  const defaultScore = exactScore && scoreMatchesSelection(exactScore.home, exactScore.away, resultSelection)
    ? exactScore
    : getFirstAllowedScore(resultSelection)

  return (
    <div className="mt-3 space-y-3 text-center">
      {state?.error && <p className="text-xs text-red-400">Match result / double chance: {state.error}</p>}

      {/* Single Outcome */}
      {!hasDouble && (
        <div>
          <p className="text-xs text-white/50 mb-1">Match result (3 pts){hasSingle && ' ✓'}</p>
          <div className="flex justify-center gap-2">
            {SINGLE_OPTS.map((opt) => {
              const active = existing.find((p) => p.type === 'SINGLE_OUTCOME')?.value === opt
              return (
                <form key={opt} action={formAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="championshipId" value={championshipId} />
                  <input type="hidden" name="type" value="SINGLE_OUTCOME" />
                  <input type="hidden" name="value" value={opt} />
                  <Button type="submit" size="sm" disabled={pending}
                    aria-label={OUTCOME_LABELS[opt]}
                    variant={active ? 'default' : 'outline'}
                    className={active ? 'bg-green-600 text-white border-0' : 'border-white/20 text-white/70 bg-transparent hover:bg-white/10'}>
                    {opt}
                  </Button>
                </form>
              )
            })}
          </div>
        </div>
      )}

      {/* Double Chance */}
      {!hasSingle && doubleChanceEnabled && (
        <div>
          <p className="text-xs text-white/50 mb-1">Double chance (1 pt){hasDouble && ' ✓'}</p>
          <div className="flex justify-center gap-2">
            {DOUBLE_OPTS.map((opt) => {
              const active = existing.find((p) => p.type === 'DOUBLE_CHANCE')?.value === opt
              return (
                <form key={opt} action={formAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="championshipId" value={championshipId} />
                  <input type="hidden" name="type" value="DOUBLE_CHANCE" />
                  <input type="hidden" name="value" value={opt} />
                  <Button type="submit" size="sm" disabled={pending}
                    aria-label={OUTCOME_LABELS[opt]}
                    variant={active ? 'default' : 'outline'}
                    className={active ? 'bg-blue-600 text-white border-0' : 'border-white/20 text-white/70 bg-transparent hover:bg-white/10'}>
                    {opt}
                  </Button>
                </form>
              )
            })}
          </div>
        </div>
      )}

      {/* Exact Score */}
      <div>
        <p className="text-xs text-white/50 mb-1">Exact score after 90 minutes (5 pts){hasExact && ' ✓'}</p>
        <ExactScoreForm
          matchId={matchId}
          championshipId={championshipId}
          defaultHomeScore={defaultScore.home}
          defaultAwayScore={defaultScore.away}
          resultSelection={resultSelection}
          exactScoreValue={exactScoreValue}
          exactScore={exactScore}
        />
      </div>

      {/* Knockout Advance — only when user has saved a draw (X) result */}
      {isKnockout && !isKnownTeam(homeTeam) || isKnockout && !isKnownTeam(awayTeam) ? (
        <p className="text-xs text-white/40">Advancing team selection opens after both teams are decided.</p>
      ) : isKnockout && resultSelection?.type === 'SINGLE_OUTCOME' && resultSelection.value === 'X' ? (
        <KnockoutAdvanceForm
          matchId={matchId}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          existingTeam={existingAdvanceTeam}
          championshipId={championshipId}
        />
      ) : isKnockout ? (
        <p className="text-xs text-white/40">Predict a draw (X) to pick the advancing team.</p>
      ) : null}
    </div>
  )
}

function isKnownTeam(team: string): boolean {
  const normalized = team.trim().toUpperCase()
  return Boolean(normalized) && normalized !== 'TBD' && normalized !== 'TBA' && !normalized.includes('TO BE DETERMINED')
}

function ExactScoreForm({
  matchId,
  championshipId,
  defaultHomeScore,
  defaultAwayScore,
  resultSelection,
  exactScoreValue,
  exactScore,
}: {
  matchId: number
  championshipId: number
  defaultHomeScore: number
  defaultAwayScore: number
  resultSelection?: ExistingPrediction
  exactScoreValue?: string
  exactScore: { home: number; away: number } | null
}) {
  const [state, formAction, pending] = useActionState(savePrediction, null)
  const [savedScore, setSavedScore] = useState(exactScore)
  const [isEditing, setIsEditing] = useState(!exactScore)
  const [homeScore, setHomeScore] = useState(defaultHomeScore)
  const [awayScore, setAwayScore] = useState(defaultAwayScore)

  useEffect(() => {
    const nextScore = parseScore(exactScoreValue)
    setSavedScore(nextScore)
    setIsEditing(!nextScore)
    setHomeScore(defaultHomeScore)
    setAwayScore(defaultAwayScore)
  }, [defaultAwayScore, defaultHomeScore, exactScoreValue])

  useEffect(() => {
    if (!state) return
    if (state.error) {
      setIsEditing(true)
    } else if (!state.error) {
      setSavedScore({ home: activeHomeScore, away: activeAwayScore })
      setIsEditing(false)
    }
  // activeHomeScore / activeAwayScore are derived synchronously from select state;
  // capturing them here is safe because the effect only runs after the action resolves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const homeOptions = useMemo(
    () => getAllowedScoresForSide('home', resultSelection),
    [resultSelection]
  )
  const safeHomeScore = homeOptions.includes(homeScore) ? homeScore : homeOptions[0] ?? 0
  const awayOptions = useMemo(
    () => SCORE_OPTS.filter((score) => scoreMatchesSelection(safeHomeScore, score, resultSelection)),
    [safeHomeScore, resultSelection]
  )
  const safeAwayScore = awayOptions.includes(awayScore) ? awayScore : awayOptions[0] ?? 0
  const activeHomeScore = scoreMatchesSelection(safeHomeScore, safeAwayScore, resultSelection)
    ? safeHomeScore
    : SCORE_OPTS.find((score) => scoreMatchesSelection(score, safeAwayScore, resultSelection)) ?? safeHomeScore
  const activeAwayScore = scoreMatchesSelection(activeHomeScore, safeAwayScore, resultSelection)
    ? safeAwayScore
    : SCORE_OPTS.find((score) => scoreMatchesSelection(activeHomeScore, score, resultSelection)) ?? safeAwayScore

  if (savedScore && !isEditing) {
    return (
      <>
        <div className="flex items-center justify-center gap-2">
          <span className="inline-flex h-8 items-center rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 text-sm font-semibold text-yellow-200">
            {savedScore.home} - {savedScore.away}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/20 text-white/70 bg-transparent hover:bg-white/10"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </div>
        {state?.error && <p className="mt-1 text-xs text-red-400">{state.error}</p>}
      </>
    )
  }

  return (
    <form
      action={formAction}
      className="flex justify-center gap-2"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="championshipId" value={championshipId} />
      <input type="hidden" name="type" value="EXACT_SCORE" />
      <select
        name="homeScore"
        value={activeHomeScore}
        onChange={(event) => {
          const nextHomeScore = parseInt(event.target.value, 10)
          setHomeScore(nextHomeScore)
          if (!scoreMatchesSelection(nextHomeScore, awayScore, resultSelection)) {
            setAwayScore(SCORE_OPTS.find((score) => scoreMatchesSelection(nextHomeScore, score, resultSelection)) ?? awayScore)
          }
        }}
        className="h-8 rounded-md border border-white/20 bg-[#0A1628] px-2 text-sm text-white"
        aria-label="Home team score"
      >
        {homeOptions.map((score) => (
          <option key={score} value={score}>{score}</option>
        ))}
      </select>
      <span className="flex h-8 items-center text-white/40">-</span>
      <select
        name="awayScore"
        value={activeAwayScore}
        onChange={(event) => {
          const nextAwayScore = parseInt(event.target.value, 10)
          setAwayScore(nextAwayScore)
          if (!scoreMatchesSelection(activeHomeScore, nextAwayScore, resultSelection)) {
            setHomeScore(SCORE_OPTS.find((score) => scoreMatchesSelection(score, nextAwayScore, resultSelection)) ?? activeHomeScore)
          }
        }}
        className="h-8 rounded-md border border-white/20 bg-[#0A1628] px-2 text-sm text-white"
        aria-label="Away team score"
      >
        {awayOptions.map((score) => (
          <option key={score} value={score}>{score}</option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}
        className={`h-8 ${savedScore ? 'bg-yellow-600' : 'bg-[#C9A84C]'} text-[#0A1628] font-semibold hover:opacity-90`}>
        {savedScore ? 'Update' : 'Save'}
      </Button>
      {savedScore && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-white/20 text-white/70 bg-transparent hover:bg-white/10"
          onClick={() => {
            setHomeScore(savedScore.home)
            setAwayScore(savedScore.away)
            setIsEditing(false)
          }}
        >
          Cancel
        </Button>
      )}
      {state?.error && <p className="self-center text-xs text-red-400">{state.error}</p>}
    </form>
  )
}

function KnockoutAdvanceForm({
  matchId,
  homeTeam,
  awayTeam,
  existingTeam,
  championshipId,
}: {
  matchId: number
  homeTeam: string
  awayTeam: string
  existingTeam?: string
  championshipId: number
}) {
  const [state, formAction, pending] = useActionState(saveKnockoutAdvance, null)
  return (
    <div>
      <p className="text-xs text-white/50 mb-1">If extra time happens, which team will advance? (1 bonus pt)</p>
      <form action={formAction} className="flex justify-center gap-2">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="championshipId" value={championshipId} />
        <select
          name="predictedTeam"
          defaultValue={existingTeam ?? ''}
          required
          className="h-8 min-w-48 rounded-md border border-white/20 bg-[#0A1628] px-2 text-sm text-white"
        >
          <option value="" disabled>Choose advancing team</option>
          <option value={homeTeam}>{homeTeam}</option>
          <option value={awayTeam}>{awayTeam}</option>
        </select>
        <Button type="submit" size="sm" disabled={pending} className="h-8 bg-purple-600 text-white hover:bg-purple-500">
          {existingTeam ? 'Update' : 'Save'}
        </Button>
      </form>
      {existingTeam && <p className="mt-1 text-xs text-purple-300">Saved: {existingTeam}</p>}
      {state?.error && <p className="text-xs text-red-400 mt-1">{state.error}</p>}
    </div>
  )
}
