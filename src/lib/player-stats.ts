import { SCORING, ADVANCE_SCORE_DURATIONS } from './scoring'

export type PlayerStats = {
  matchesPlayed: number
  totalPoints: number
  maxPossiblePoints: number
  pointsEfficiency: number | null
  pointsPerMatch: number | null
  bestMatchPoints: number | null
  resultAccuracy: number | null
  exactAccuracy: number | null
  doubleAccuracy: number | null   // null when doubleChance is disabled for the championship
  advanceAccuracy: number | null  // null when no knockout advance picks exist
  currentStreak: number
  longestStreak: number
}

type PredictionRow = { type: string; value: string; pointsAwarded: number | null }
type MatchRow = {
  id: number
  stage: string
  scoreDuration: string
  kickoff: Date
  status: string
  predictions: PredictionRow[]
}
type AdvanceRow = { matchId: number; pointsAwarded: number | null }

export function computePlayerStats(
  matches: MatchRow[],
  advanceByMatch: Map<number, AdvanceRow>,
  doubleChanceEnabled: boolean,
): PlayerStats {
  const finished = matches
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())

  let totalPoints = 0
  let maxPossiblePoints = 0
  let bestMatchPoints: number | null = null
  let resultCorrect = 0, resultTotal = 0
  let exactCorrect = 0, exactTotal = 0
  let doubleCorrect = 0, doubleTotal = 0
  let advanceCorrect = 0, advanceTotal = 0
  let currentStreak = 0, longestStreak = 0

  for (const match of finished) {
    const preds = match.predictions
    const advance = advanceByMatch.get(match.id)
    if (preds.length === 0 && !advance) continue

    const matchPts =
      preds.reduce((s, p) => s + (p.pointsAwarded ?? 0), 0) +
      (advance?.pointsAwarded ?? 0)
    totalPoints += matchPts
    if (bestMatchPoints === null || matchPts > bestMatchPoints) bestMatchPoints = matchPts

    // Max possible for this match
    const hasAdvance = advance !== undefined &&
      ADVANCE_SCORE_DURATIONS.includes(match.scoreDuration as (typeof ADVANCE_SCORE_DURATIONS)[number])
    const matchMax =
      SCORING.SINGLE_OUTCOME +
      SCORING.EXACT_SCORE +
      (doubleChanceEnabled ? SCORING.DOUBLE_CHANCE : 0) +
      (hasAdvance ? SCORING.ADVANCE : 0)
    maxPossiblePoints += matchMax

    // Accuracy buckets
    for (const p of preds) {
      if (p.pointsAwarded === null) continue
      if (p.type === 'SINGLE_OUTCOME') {
        resultTotal++
        if (p.pointsAwarded > 0) resultCorrect++
      } else if (p.type === 'EXACT_SCORE') {
        exactTotal++
        if (p.pointsAwarded > 0) exactCorrect++
      } else if (p.type === 'DOUBLE_CHANCE' && doubleChanceEnabled) {
        doubleTotal++
        if (p.pointsAwarded > 0) doubleCorrect++
      }
    }
    if (advance?.pointsAwarded !== null && advance?.pointsAwarded !== undefined) {
      advanceTotal++
      if (advance.pointsAwarded > 0) advanceCorrect++
    }

  }

  // Longest streak (forward pass — same algorithm as achievements.ts hot_streak)
  let run = 0
  for (const entry of finished) {
    const advance = advanceByMatch.get(entry.id)
    if (entry.predictions.length === 0 && !advance) continue
    const pts =
      entry.predictions.reduce((s, p) => s + (p.pointsAwarded ?? 0), 0) +
      (advance?.pointsAwarded ?? 0)
    if (pts > 0) {
      run++
      longestStreak = Math.max(longestStreak, run)
    } else {
      run = 0
    }
  }

  // currentStreak only counts from the most recent match backwards; recalculate
  currentStreak = 0
  for (let i = finished.length - 1; i >= 0; i--) {
    const match = finished[i]
    const preds = match.predictions
    const advance = advanceByMatch.get(match.id)
    if (preds.length === 0 && !advance) continue
    const pts = preds.reduce((s, p) => s + (p.pointsAwarded ?? 0), 0) + (advance?.pointsAwarded ?? 0)
    if (pts > 0) currentStreak++
    else break
  }

  const matchesPlayed = finished.filter(
    (m) => m.predictions.length > 0 || advanceByMatch.has(m.id),
  ).length

  return {
    matchesPlayed,
    totalPoints,
    maxPossiblePoints,
    pointsEfficiency: maxPossiblePoints > 0 ? Math.round((totalPoints / maxPossiblePoints) * 100) : null,
    pointsPerMatch: matchesPlayed > 0 ? Math.round((totalPoints / matchesPlayed) * 10) / 10 : null,
    bestMatchPoints,
    resultAccuracy: resultTotal > 0 ? Math.round((resultCorrect / resultTotal) * 100) : null,
    exactAccuracy: exactTotal > 0 ? Math.round((exactCorrect / exactTotal) * 100) : null,
    doubleAccuracy: !doubleChanceEnabled ? null : doubleTotal > 0 ? Math.round((doubleCorrect / doubleTotal) * 100) : null,
    advanceAccuracy: advanceTotal > 0 ? Math.round((advanceCorrect / advanceTotal) * 100) : null,
    currentStreak,
    longestStreak,
  }
}
