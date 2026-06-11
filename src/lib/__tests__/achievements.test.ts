import { describe, it, expect } from 'vitest'
import { evaluateAchievements, evaluateAchievementsDetailed, type AchievementInput } from '@/lib/achievements'

function ids(input: AchievementInput): string[] {
  return evaluateAchievements(input).map((a) => a.id)
}

const base: AchievementInput = {
  matches: [],
  advancePensCorrect: false,
  tournamentWinnerCorrect: false,
  totalPoints: 0,
  rank: 5,
}

describe('evaluateAchievements', () => {
  it('awards Sharpshooter at 10 exact-score hits', () => {
    const matches = Array.from({ length: 10 }, (_, i) => ({ stage: 'GROUP', kickoff: i, points: 5, exact: true }))
    expect(ids({ ...base, matches })).toContain('sharpshooter')
    expect(ids({ ...base, matches: matches.slice(0, 9) })).not.toContain('sharpshooter')
  })

  it('awards Hot Streak for 5 consecutive matches with 3+ points', () => {
    const streak = Array.from({ length: 5 }, (_, i) => ({ stage: 'GROUP', kickoff: i, points: 3, exact: false }))
    expect(ids({ ...base, matches: streak })).toContain('hot_streak')
    // a gap breaks the streak
    const broken = [...streak.slice(0, 2), { stage: 'GROUP', kickoff: 2, points: 0, exact: false }, ...streak.slice(3)]
    expect(ids({ ...base, matches: broken })).not.toContain('hot_streak')
  })

  it('awards Oracle, Golden Eye, Century and Front Runner from flags/totals', () => {
    const result = ids({ ...base, tournamentWinnerCorrect: true, advancePensCorrect: true, totalPoints: 120, rank: 1 })
    expect(result).toEqual(expect.arrayContaining(['oracle', 'golden_eye', 'century', 'front_runner']))
  })

  it('awards Perfect Round when every predicted match in a stage scored 3+ (min 2)', () => {
    const matches = [
      { stage: 'QUARTER_FINAL', kickoff: 1, points: 5, exact: true },
      { stage: 'QUARTER_FINAL', kickoff: 2, points: 3, exact: false },
      { stage: 'SEMI_FINAL', kickoff: 3, points: 0, exact: false },
    ]
    expect(ids({ ...base, matches })).toContain('perfect_round')
  })

  it('does not award Perfect Round when a stage has only one predicted match', () => {
    const matches = [{ stage: 'FINAL', kickoff: 1, points: 5, exact: true }]
    expect(ids({ ...base, matches })).not.toContain('perfect_round')
  })

  it('awards First Blood once any match earned points', () => {
    expect(ids({ ...base, matches: [{ stage: 'GROUP', kickoff: 1, points: 1, exact: false }] })).toContain('first_blood')
    expect(ids(base)).not.toContain('first_blood')
  })
})

describe('evaluateAchievementsDetailed — trigger matches', () => {
  const m = (matchId: number, points: number, exact = false, stage = 'GROUP', kickoff = matchId) =>
    ({ matchId, stage, kickoff, points, exact })

  function trigger(input: AchievementInput, id: string) {
    const found = evaluateAchievementsDetailed(input).find((d) => d.achievement.id === id)
    expect(found).toBeDefined()
    return found!.trigger
  }

  it('First Blood triggers on the first match with points', () => {
    const input = { ...base, matches: [m(1, 0), m(2, 3), m(3, 5)] }
    expect(trigger(input, 'first_blood')?.matchId).toBe(2)
  })

  it('Sharpshooter triggers on the 10th exact hit', () => {
    const matches = Array.from({ length: 12 }, (_, i) => m(i + 1, 5, true))
    expect(trigger({ ...base, matches }, 'sharpshooter')?.matchId).toBe(10)
  })

  it('Hot Streak triggers on the 5th consecutive correct result', () => {
    const matches = [m(1, 0), ...Array.from({ length: 6 }, (_, i) => m(i + 2, 3))]
    expect(trigger({ ...base, matches }, 'hot_streak')?.matchId).toBe(6)
  })

  it('Perfect Round triggers on the last match of the completed round', () => {
    const matches = [m(1, 3, false, 'QUARTER_FINAL'), m(2, 5, true, 'QUARTER_FINAL'), m(3, 0, false, 'SEMI_FINAL')]
    expect(trigger({ ...base, matches }, 'perfect_round')?.matchId).toBe(2)
  })

  it('Century triggers on the match whose points cross 100', () => {
    const matches = Array.from({ length: 25 }, (_, i) => m(i + 1, 5, true))
    expect(trigger({ ...base, matches, totalPoints: 125 }, 'century')?.matchId).toBe(20)
  })

  it('Century has no trigger when match points alone never reach 100', () => {
    const matches = [m(1, 5, true)]
    expect(trigger({ ...base, matches, totalPoints: 100 }, 'century')).toBeUndefined()
  })

  it('Oracle and Golden Eye use the provided context matches', () => {
    const input: AchievementInput = {
      ...base,
      matches: [m(1, 3)],
      tournamentWinnerCorrect: true,
      advancePensCorrect: true,
      finalMatch: { matchId: 99, kickoff: 99 },
      advancePensMatch: { matchId: 42, kickoff: 42 },
    }
    expect(trigger(input, 'oracle')?.matchId).toBe(99)
    expect(trigger(input, 'golden_eye')?.matchId).toBe(42)
  })

  it('Front Runner has no trigger match', () => {
    const input = { ...base, matches: [m(1, 3)], totalPoints: 3, rank: 1 }
    expect(trigger(input, 'front_runner')).toBeUndefined()
  })
})

describe('front runner is a sole-leader status', () => {
  it('is not awarded when tied at the top', () => {
    const input: AchievementInput = { ...base, matches: [{ stage: 'GROUP', kickoff: 1, points: 3, exact: false }], totalPoints: 3, rank: 1, soleLeader: false }
    expect(ids(input)).not.toContain('front_runner')
  })

  it('is awarded to a sole leader', () => {
    const input: AchievementInput = { ...base, matches: [{ stage: 'GROUP', kickoff: 1, points: 3, exact: false }], totalPoints: 3, rank: 1, soleLeader: true }
    expect(ids(input)).toContain('front_runner')
  })
})
