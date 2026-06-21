const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

type PredictionSummary = { type: 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE' }

export const STAGE_LABELS = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
} as const

export function stageLabel(stage: string): string {
  return (STAGE_LABELS as Record<string, string>)[stage] ?? stage
}

export function predictionReminderWindow(now: Date) {
  return {
    gt: now,
    lte: new Date(now.getTime() + REMINDER_LEAD_MS),
  }
}

export function arePredictionsConfigured(
  match: { stage: keyof typeof STAGE_LABELS },
  predictions: PredictionSummary[],
  hasAdvancePrediction: boolean,
  doubleChanceEnabled: boolean
): boolean {
  const visiblePredictions = doubleChanceEnabled
    ? predictions
    : predictions.filter((prediction) => prediction.type !== 'DOUBLE_CHANCE')
  const hasResultPrediction = visiblePredictions.some(
    (prediction) => prediction.type === 'SINGLE_OUTCOME' || prediction.type === 'DOUBLE_CHANCE'
  )
  const hasExactPrediction = visiblePredictions.some((prediction) => prediction.type === 'EXACT_SCORE')
  const hasRequiredAdvancePrediction = match.stage === 'GROUP' || hasAdvancePrediction

  return hasResultPrediction && hasExactPrediction && hasRequiredAdvancePrediction
}
