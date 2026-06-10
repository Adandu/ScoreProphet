import type { PredictionType } from './types'
export type { PredictionType }  // re-export for backward compat

export const SCORING = {
  EXACT_SCORE: 5,
  SINGLE_OUTCOME: 3,
  DOUBLE_CHANCE: 1,
  ADVANCE: 1,
  TOURNAMENT_WINNER: 50,
} as const

function getOutcome(homeScore: number, awayScore: number): '1' | 'X' | '2' {
  if (homeScore > awayScore) return '1';
  if (homeScore === awayScore) return 'X';
  return '2';
}

const DOUBLE_CHANCE_MAP: Record<string, Array<'1' | 'X' | '2'>> = {
  '1X': ['1', 'X'],
  'X2': ['X', '2'],
  '12': ['1', '2'],
};

export function calculatePredictionPoints(
  type: PredictionType,
  value: string,
  homeScore: number,
  awayScore: number
): number {
  const outcome = getOutcome(homeScore, awayScore);

  switch (type) {
    case 'SINGLE_OUTCOME':
      return value === outcome ? SCORING.SINGLE_OUTCOME : 0;

    case 'DOUBLE_CHANCE': {
      const covers = DOUBLE_CHANCE_MAP[value] ?? [];
      return covers.includes(outcome) ? SCORING.DOUBLE_CHANCE : 0;
    }

    case 'EXACT_SCORE': {
      const [predictedHome, predictedAway] = value.split('-').map(Number);
      return predictedHome === homeScore && predictedAway === awayScore ? SCORING.EXACT_SCORE : 0;
    }

    default:
      return 0;
  }
}

export function calculateAdvancePoints(
  predictedTeam: string,
  actualWinner: string
): number {
  return predictedTeam === actualWinner ? SCORING.ADVANCE : 0;
}

// Knockout "advance" points are only awarded when the match was actually
// decided in extra time or on penalties (not in regular time).
export const ADVANCE_SCORE_DURATIONS = ['EXTRA_TIME', 'PENALTY_SHOOTOUT'] as const;

export function calculateAdvancePointsForMatch(
  predictedTeam: string,
  match: { winnerTeam: string | null; scoreDuration: string }
): number {
  if (!match.winnerTeam) return 0;
  if (!ADVANCE_SCORE_DURATIONS.includes(match.scoreDuration as (typeof ADVANCE_SCORE_DURATIONS)[number])) return 0;
  return calculateAdvancePoints(predictedTeam, match.winnerTeam);
}

export function calculateTournamentWinnerPoints(
  predictedTeam: string,
  actualWinner: string
): number {
  return predictedTeam === actualWinner ? SCORING.TOURNAMENT_WINNER : 0;
}
