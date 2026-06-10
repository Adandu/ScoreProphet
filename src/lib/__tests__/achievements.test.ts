import { describe, it, expect } from 'vitest'
import { evaluateAchievements, type AchievementInput } from '@/lib/achievements'

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
