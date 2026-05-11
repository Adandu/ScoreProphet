import { describe, it, expect } from 'vitest';
import { validatePredictionCombination, parseExactScore } from '@/lib/validation';

type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE';

// ---------------------------------------------------------------------------
// validatePredictionCombination
// ---------------------------------------------------------------------------

describe('validatePredictionCombination — allowed combinations', () => {
  it('allows SINGLE_OUTCOME when no existing predictions', () => {
    expect(validatePredictionCombination('SINGLE_OUTCOME', [])).toBeNull();
  });

  it('allows DOUBLE_CHANCE when no existing predictions', () => {
    expect(validatePredictionCombination('DOUBLE_CHANCE', [])).toBeNull();
  });

  it('allows EXACT_SCORE when no existing predictions', () => {
    expect(validatePredictionCombination('EXACT_SCORE', [])).toBeNull();
  });

  it('allows EXACT_SCORE alongside existing SINGLE_OUTCOME', () => {
    expect(
      validatePredictionCombination('EXACT_SCORE', [{ type: 'SINGLE_OUTCOME' as PredictionType }])
    ).toBeNull();
  });

  it('allows EXACT_SCORE alongside existing DOUBLE_CHANCE', () => {
    expect(
      validatePredictionCombination('EXACT_SCORE', [{ type: 'DOUBLE_CHANCE' as PredictionType }])
    ).toBeNull();
  });

  it('allows SINGLE_OUTCOME alongside existing EXACT_SCORE', () => {
    expect(
      validatePredictionCombination('SINGLE_OUTCOME', [{ type: 'EXACT_SCORE' as PredictionType }])
    ).toBeNull();
  });

  it('allows DOUBLE_CHANCE alongside existing EXACT_SCORE', () => {
    expect(
      validatePredictionCombination('DOUBLE_CHANCE', [{ type: 'EXACT_SCORE' as PredictionType }])
    ).toBeNull();
  });
});

describe('validatePredictionCombination — forbidden combinations', () => {
  it('rejects DOUBLE_CHANCE when SINGLE_OUTCOME already exists', () => {
    const result = validatePredictionCombination('DOUBLE_CHANCE', [
      { type: 'SINGLE_OUTCOME' as PredictionType },
    ]);
    expect(result).toBe(
      'Cannot combine single outcome (1/X/2) with double chance (1X/X2/12)'
    );
  });

  it('rejects SINGLE_OUTCOME when DOUBLE_CHANCE already exists', () => {
    const result = validatePredictionCombination('SINGLE_OUTCOME', [
      { type: 'DOUBLE_CHANCE' as PredictionType },
    ]);
    expect(result).toBe(
      'Cannot combine single outcome (1/X/2) with double chance (1X/X2/12)'
    );
  });
});

describe('validatePredictionCombination — duplicate detection', () => {
  it('rejects duplicate SINGLE_OUTCOME', () => {
    const result = validatePredictionCombination('SINGLE_OUTCOME', [
      { type: 'SINGLE_OUTCOME' as PredictionType },
    ]);
    expect(result).toBe(
      'You already have a single outcome prediction for this match'
    );
  });

  it('rejects duplicate DOUBLE_CHANCE', () => {
    const result = validatePredictionCombination('DOUBLE_CHANCE', [
      { type: 'DOUBLE_CHANCE' as PredictionType },
    ]);
    expect(result).toBe(
      'You already have a double chance prediction for this match'
    );
  });

  it('rejects duplicate EXACT_SCORE', () => {
    const result = validatePredictionCombination('EXACT_SCORE', [
      { type: 'EXACT_SCORE' as PredictionType },
    ]);
    expect(result).toBe(
      'You already have an exact score prediction for this match'
    );
  });
});

// ---------------------------------------------------------------------------
// parseExactScore
// ---------------------------------------------------------------------------

describe('parseExactScore — valid inputs', () => {
  it('parses "2-1" correctly', () => {
    expect(parseExactScore('2-1')).toEqual({ home: 2, away: 1 });
  });

  it('parses "0-0" correctly', () => {
    expect(parseExactScore('0-0')).toEqual({ home: 0, away: 0 });
  });

  it('parses "15-15" (max allowed)', () => {
    expect(parseExactScore('15-15')).toEqual({ home: 15, away: 15 });
  });
});

describe('parseExactScore — invalid inputs', () => {
  it('returns null for alphabetic input "abc"', () => {
    expect(parseExactScore('abc')).toBeNull();
  });

  it('returns null for negative score "-1-0"', () => {
    expect(parseExactScore('-1-0')).toBeNull();
  });

  it('returns null for score exceeding max "20-0"', () => {
    expect(parseExactScore('20-0')).toBeNull();
  });

  it('returns null for score exceeding max on away side "0-20"', () => {
    expect(parseExactScore('0-20')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseExactScore('')).toBeNull();
  });
});
