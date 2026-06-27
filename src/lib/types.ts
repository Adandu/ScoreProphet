export const VALID_PREDICTION_TYPES = ['SINGLE_OUTCOME', 'DOUBLE_CHANCE', 'EXACT_SCORE'] as const
export type PredictionType = typeof VALID_PREDICTION_TYPES[number]

export type Stage = string
