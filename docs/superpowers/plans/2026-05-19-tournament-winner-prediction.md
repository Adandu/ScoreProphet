# Tournament Winner Prediction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a World Cup Winner prediction above the Group Stage on the Predictions page — a searchable team dropdown with a Save button, worth 50 points if correct, locking when the first Group Stage match kicks off.

**Architecture:** New `TournamentWinnerPrediction` DB model stores one pick per user per championship. Scoring is triggered inside `recalculateMatchPoints` when the FINAL stage match resolves. The leaderboard includes winner prediction points in the total. A new `TournamentWinnerSelector` client component mirrors the `TimezoneSelector` pattern.

**Tech Stack:** Next.js 15 (App Router), Prisma (SQLite), React `useActionState`, Tailwind CSS, Vitest

---

## File Map

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `TournamentWinnerPrediction` model; add back-relations to `User` and `Championship` |
| `src/lib/scoring.ts` | Add `SCORING.TOURNAMENT_WINNER = 50` and `calculateTournamentWinnerPoints` |
| `src/lib/__tests__/scoring.test.ts` | Tests for `calculateTournamentWinnerPoints` |
| `src/actions/predictions.ts` | Add `saveTournamentWinnerPrediction` server action |
| `src/actions/admin.ts` | Update `recalculateMatchPoints` to score winner predictions on FINAL |
| `src/lib/leaderboard.ts` | Include winner prediction points in totals; add `winner` field to `RankedUser` |
| `src/app/championships/[championshipId]/leaderboard/page.tsx` | Add "Winner" column |
| `src/components/tournament-winner-selector.tsx` | New client component (searchable dropdown + Save button) |
| `src/app/championships/[championshipId]/predictions/page.tsx` | Add winner section above Group Stage |

---

## Task 1: Database Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model and back-relations**

In `prisma/schema.prisma`, add the new model after `KnockoutAdvance`:

```prisma
model TournamentWinnerPrediction {
  id             Int          @id @default(autoincrement())
  userId         Int
  championshipId Int
  predictedTeam  String
  pointsAwarded  Int?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  championship   Championship @relation(fields: [championshipId], references: [id], onDelete: Cascade)

  @@unique([userId, championshipId])
}
```

Add the back-relation to the `User` model (after `advances KnockoutAdvance[]`):

```prisma
  winnerPredictions TournamentWinnerPrediction[]
```

Add the back-relation to the `Championship` model (after `predictionReminders PredictionReminder[]`):

```prisma
  winnerPredictions TournamentWinnerPrediction[]
```

- [ ] **Step 2: Generate and apply the migration**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx prisma migrate dev --name add_tournament_winner_prediction
```

Expected: migration file created under `prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 3: Verify the migration applied**

```bash
npx prisma db pull --print | grep -A10 "TournamentWinnerPrediction"
```

Expected: the new table definition appears.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add TournamentWinnerPrediction schema model"
```

---

## Task 2: Scoring Logic

**Files:**
- Modify: `src/lib/scoring.ts`
- Modify: `src/lib/__tests__/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculatePredictionPoints, calculateAdvancePoints, calculateTournamentWinnerPoints } from '@/lib/scoring';

// ... existing tests unchanged ...

describe('calculateTournamentWinnerPoints', () => {
  it('awards 50 points when predicted team matches actual winner', () => {
    expect(calculateTournamentWinnerPoints('Brazil', 'Brazil')).toBe(50);
  });

  it('awards 0 points when predicted team does not match actual winner', () => {
    expect(calculateTournamentWinnerPoints('Argentina', 'Brazil')).toBe(0);
  });

  it('is case-sensitive when comparing teams', () => {
    expect(calculateTournamentWinnerPoints('brazil', 'Brazil')).toBe(0);
  });

  it('awards 50 points for team names with spaces', () => {
    expect(calculateTournamentWinnerPoints('Real Madrid', 'Real Madrid')).toBe(50);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx vitest run src/lib/__tests__/scoring.test.ts
```

Expected: FAIL — `calculateTournamentWinnerPoints is not a function`

- [ ] **Step 3: Implement in scoring.ts**

In `src/lib/scoring.ts`, add to the `SCORING` constant and export the function:

```ts
export const SCORING = {
  EXACT_SCORE: 5,
  SINGLE_OUTCOME: 3,
  DOUBLE_CHANCE: 1,
  ADVANCE: 1,
  TOURNAMENT_WINNER: 50,
} as const

// ... existing functions unchanged ...

export function calculateTournamentWinnerPoints(
  predictedTeam: string,
  actualWinner: string
): number {
  return predictedTeam === actualWinner ? SCORING.TOURNAMENT_WINNER : 0
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/scoring.test.ts
```

Expected: all tests pass including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/__tests__/scoring.test.ts
git commit -m "feat: add calculateTournamentWinnerPoints (50 pts)"
```

---

## Task 3: Server Action

**Files:**
- Modify: `src/actions/predictions.ts`

- [ ] **Step 1: Add `saveTournamentWinnerPrediction` to predictions.ts**

Add this export at the bottom of `src/actions/predictions.ts`:

```ts
export async function saveTournamentWinnerPrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)
  const predictedTeam = (formData.get('predictedTeam') as string)?.trim()

  if (!Number.isInteger(championshipId) || championshipId <= 0 || !predictedTeam) {
    return { error: 'Missing fields' }
  }

  const [firstGroupMatch, membership] = await Promise.all([
    prisma.match.findFirst({
      where: { stage: 'GROUP' },
      orderBy: { kickoff: 'asc' },
      select: { kickoff: true },
    }),
    prisma.championshipMember.findFirst({
      where: { userId: session.userId!, championshipId },
    }),
  ])

  if (!membership) return { error: 'You are not a member of this championship' }
  if (firstGroupMatch && firstGroupMatch.kickoff <= new Date()) {
    return { error: 'Tournament winner prediction is locked' }
  }

  await prisma.tournamentWinnerPrediction.upsert({
    where: { userId_championshipId: { userId: session.userId!, championshipId } },
    update: { predictedTeam },
    create: { userId: session.userId!, championshipId, predictedTeam },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/predictions.ts
git commit -m "feat: add saveTournamentWinnerPrediction server action"
```

---

## Task 4: Admin Scoring

**Files:**
- Modify: `src/actions/admin.ts`

- [ ] **Step 1: Import the new scoring function**

At the top of `src/actions/admin.ts`, update the scoring import:

```ts
import { calculatePredictionPoints, calculateAdvancePoints, calculateTournamentWinnerPoints } from '@/lib/scoring'
```

- [ ] **Step 2: Update `recalculateMatchPoints` to score winner predictions on FINAL**

In `src/actions/admin.ts`, update the `recalculateMatchPoints` function. After the existing `for (const advance of match.advances)` loop, add:

```ts
  if (match.stage === 'FINAL' && match.winnerTeam) {
    const winnerPredictions = await prisma.tournamentWinnerPrediction.findMany({
      where: { championshipId: { in: await prisma.championshipMember.findMany({ select: { championshipId: true } }).then(rows => [...new Set(rows.map(r => r.championshipId))]) } },
    })
    for (const wp of winnerPredictions) {
      const pts = calculateTournamentWinnerPoints(wp.predictedTeam, match.winnerTeam)
      operations.push(
        prisma.tournamentWinnerPrediction.update({ where: { id: wp.id }, data: { pointsAwarded: pts } })
      )
    }
  }
```

Wait — that approach is complex. Use a simpler direct query: fetch all `TournamentWinnerPrediction` rows (they span all championships) and score each one:

```ts
  if (match.stage === 'FINAL' && match.winnerTeam) {
    const winnerPredictions = await prisma.tournamentWinnerPrediction.findMany()
    for (const wp of winnerPredictions) {
      const pts = calculateTournamentWinnerPoints(wp.predictedTeam, match.winnerTeam)
      operations.push(
        prisma.tournamentWinnerPrediction.update({ where: { id: wp.id }, data: { pointsAwarded: pts } })
      )
    }
  }
```

The full updated `recalculateMatchPoints` function:

```ts
async function recalculateMatchPoints(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { predictions: true, advances: true },
  })
  if (!match || match.homeScore === null || match.awayScore === null) return

  const operations: ReturnType<typeof prisma.prediction.update>[] = []

  for (const pred of match.predictions) {
    const pts = calculatePredictionPoints(pred.type as PredictionType, pred.value, match.homeScore, match.awayScore)
    operations.push(prisma.prediction.update({ where: { id: pred.id }, data: { pointsAwarded: pts } }))
  }

  for (const advance of match.advances) {
    const pts = match.winnerTeam
      && ['EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(match.scoreDuration)
      ? calculateAdvancePoints(advance.predictedTeam, match.winnerTeam)
      : 0
    operations.push(prisma.knockoutAdvance.update({ where: { id: advance.id }, data: { pointsAwarded: pts } }))
  }

  if (match.stage === 'FINAL' && match.winnerTeam) {
    const winnerPredictions = await prisma.tournamentWinnerPrediction.findMany()
    for (const wp of winnerPredictions) {
      const pts = calculateTournamentWinnerPoints(wp.predictedTeam, match.winnerTeam)
      operations.push(
        prisma.tournamentWinnerPrediction.update({ where: { id: wp.id }, data: { pointsAwarded: pts } })
      )
    }
  }

  if (operations.length > 0) await prisma.$transaction(operations)
}
```

Note: The `operations` array type must be widened. Replace `const operations = []` with a typed array that accepts Prisma update promises. In practice, just use `const operations: Parameters<typeof prisma.$transaction>[0] = []` or keep the existing implicit `any[]`.

The simplest change: keep `const operations = []` as-is (implicit `any[]`) and just add the new block. The original code uses `const operations = []` which TypeScript infers as `any[]`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/admin.ts
git commit -m "feat: score tournament winner predictions when FINAL resolves"
```

---

## Task 5: Leaderboard

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Modify: `src/app/championships/[championshipId]/leaderboard/page.tsx`

- [ ] **Step 1: Update `RankedUser` interface and `getRankedUsers` in leaderboard.ts**

Replace the entire content of `src/lib/leaderboard.ts`:

```ts
import { prisma } from '@/lib/db'

export interface RankedUser {
  id: number
  username: string
  total: number
  exact: number
  single: number
  double?: number
  advance: number
  winner: number
}

export async function getRankedUsers(
  userIds: number[],
  championship: { id: number; doubleChanceEnabled: boolean }
): Promise<RankedUser[]> {
  if (userIds.length === 0) return []

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: {
      predictions: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
      advances: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
      winnerPredictions: { where: { pointsAwarded: { not: null }, championshipId: championship.id } },
    },
  })

  return users
    .map((u) => {
      const exactPts = u.predictions
        .filter((p) => p.type === 'EXACT_SCORE')
        .reduce((sum, p) => sum + (p.pointsAwarded ?? 0), 0)
      const singlePts = u.predictions
        .filter((p) => p.type === 'SINGLE_OUTCOME')
        .reduce((sum, p) => sum + (p.pointsAwarded ?? 0), 0)
      const doublePts = u.predictions
        .filter((p) => p.type === 'DOUBLE_CHANCE')
        .reduce((sum, p) => sum + (p.pointsAwarded ?? 0), 0)
      const advancePts = u.advances.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0)
      const winnerPts = u.winnerPredictions.reduce((sum, w) => sum + (w.pointsAwarded ?? 0), 0)

      const result: RankedUser = {
        id: u.id,
        username: u.username,
        total: exactPts + singlePts + (championship.doubleChanceEnabled ? doublePts : 0) + advancePts + winnerPts,
        exact: u.predictions.filter((p) => p.type === 'EXACT_SCORE' && (p.pointsAwarded ?? 0) > 0).length,
        single: u.predictions.filter((p) => p.type === 'SINGLE_OUTCOME' && (p.pointsAwarded ?? 0) > 0).length,
        advance: u.advances.filter((a) => (a.pointsAwarded ?? 0) > 0).length,
        winner: u.winnerPredictions.filter((w) => (w.pointsAwarded ?? 0) > 0).length,
      }

      if (championship.doubleChanceEnabled) {
        result.double = u.predictions.filter(
          (p) => p.type === 'DOUBLE_CHANCE' && (p.pointsAwarded ?? 0) > 0
        ).length
      }

      return result
    })
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username))
}
```

- [ ] **Step 2: Add "Winner" column to the leaderboard page**

In `src/app/championships/[championshipId]/leaderboard/page.tsx`, add the Winner column header after the Advance `<th>`:

```tsx
<th className="px-4 py-3 text-right text-white/40 font-normal">Advance</th>
<th className="px-4 py-3 text-right text-white/40 font-normal">Winner</th>
<th className="px-4 py-3 text-right text-white/40 font-normal font-semibold">Total</th>
```

Add the Winner column cell after the advance `<td>` in the row:

```tsx
<td className="px-4 py-3 text-right text-purple-400">{u.advance}</td>
<td className="px-4 py-3 text-right text-amber-400">{u.winner}</td>
<td className="px-4 py-3 text-right font-bold text-[#C9A84C] text-base">{u.total}</td>
```

Also update the empty-state `colSpan` from `7` to `8` (and `6` to `7` for the non-double-chance case):

```tsx
<td colSpan={championship.doubleChanceEnabled ? 8 : 7} className="px-4 py-8 text-center text-white/30">
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts src/app/championships/[championshipId]/leaderboard/page.tsx
git commit -m "feat: include tournament winner points in leaderboard"
```

---

## Task 6: TournamentWinnerSelector Component

**Files:**
- Create: `src/components/tournament-winner-selector.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/tournament-winner-selector.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect, useActionState, useTransition } from 'react'
import Image from 'next/image'
import { saveTournamentWinnerPrediction } from '@/actions/predictions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Team {
  name: string
  shortName: string
  crest: string
}

interface Props {
  teams: Team[]
  existing: string | null
  championshipId: number
  locked: boolean
}

export function TournamentWinnerSelector({ teams, existing, championshipId, locked }: Props) {
  const [state, formAction] = useActionState(saveTournamentWinnerPrediction, null)
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(existing)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = search.trim()
    ? teams.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.shortName.toLowerCase().includes(search.toLowerCase()),
      )
    : teams

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function openDropdown() {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function pickTeam(name: string) {
    setSelected(name)
    setOpen(false)
    setSearch('')
  }

  const selectedTeam = selected ? teams.find((t) => t.name === selected) : null

  if (locked) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4">
        <div className="flex-1">
          {existing ? (
            <div className="flex items-center gap-2">
              {selectedTeam?.crest && (
                <Image src={selectedTeam.crest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain" />
              )}
              <span className="text-sm font-semibold text-white">{existing}</span>
            </div>
          ) : (
            <span className="text-sm text-white/40">No prediction set</span>
          )}
        </div>
        <Badge variant="outline" className="text-xs border-white/20 text-white/40">Locked</Badge>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="relative">
        <button
          type="button"
          onClick={openDropdown}
          className="w-full text-left bg-[#0A1628] text-white border border-white/20 rounded px-3 py-2 text-sm cursor-pointer hover:border-white/40 flex items-center gap-2"
        >
          {selectedTeam ? (
            <>
              {selectedTeam.crest && (
                <Image src={selectedTeam.crest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain shrink-0" />
              )}
              <span className="truncate">{selectedTeam.name}</span>
            </>
          ) : (
            <span className="text-white/40">Select a team…</span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 w-full rounded border border-white/20 bg-[#0A1628] shadow-2xl">
            <div className="p-2 border-b border-white/10">
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team…"
                className="w-full bg-white/5 text-white text-xs rounded px-3 py-1.5 outline-none placeholder:text-white/30 border border-white/10 focus:border-white/30 caret-white"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-white/30 text-center">No results</div>
              ) : (
                filtered.map((team) => (
                  <button
                    key={team.name}
                    type="button"
                    onClick={() => pickTeam(team.name)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                      team.name === selected ? 'text-[#C9A84C] bg-white/5' : 'text-white/70'
                    }`}
                  >
                    {team.crest && (
                      <Image src={team.crest} alt="" width={16} height={16} className="max-h-4 w-auto object-contain shrink-0" />
                    )}
                    {team.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <form
        action={formAction}
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(() => { formAction(fd) })
        }}
      >
        <input type="hidden" name="championshipId" value={championshipId} />
        <input type="hidden" name="predictedTeam" value={selected ?? ''} />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !selected}
            className="bg-[#C9A84C] hover:bg-[#C9A84C]/80 text-black font-semibold disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save prediction'}
          </Button>
          {state?.success && <span className="text-xs text-green-400">Saved!</span>}
          {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament-winner-selector.tsx
git commit -m "feat: add TournamentWinnerSelector component"
```

---

## Task 7: Wire Up the Predictions Page

**Files:**
- Modify: `src/app/championships/[championshipId]/predictions/page.tsx`

- [ ] **Step 1: Update the page**

Replace the entire content of `src/app/championships/[championshipId]/predictions/page.tsx`:

```tsx
import { prisma } from '@/lib/db'
import { requireChampionshipAccess } from '@/lib/championships'
import { PredictionForm } from '@/components/prediction-form'
import { ResetButton } from '@/components/reset-button'
import { TournamentWinnerSelector } from '@/components/tournament-winner-selector'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import { ChampionshipPageNav } from '@/components/championship-page-nav'
import Image from 'next/image'
import { CalendarClock, Trophy } from 'lucide-react'
import { stageLabel } from '@/lib/prediction-reminder-rules'
import type { Stage } from '@/lib/types'

const STAGE_ORDER: Stage[] = ['GROUP', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL']

export default async function ChampionshipPredictionsPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccess(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, userPredictions, userAdvances, dbTeams, firstGroupMatch, winnerPrediction] = await Promise.all([
    prisma.match.findMany({
      where: { status: { not: 'FINISHED' } },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.prediction.findMany({ where: { userId: session.userId, championshipId } }),
    prisma.knockoutAdvance.findMany({ where: { userId: session.userId, championshipId } }),
    prisma.team.findMany({ orderBy: { name: 'asc' }, select: { name: true, shortName: true, crest: true } }),
    prisma.match.findFirst({ where: { stage: 'GROUP' }, orderBy: { kickoff: 'asc' }, select: { kickoff: true } }),
    prisma.tournamentWinnerPrediction.findFirst({ where: { userId: session.userId, championshipId } }),
  ])

  // Fall back to deriving teams from match records if the Team table is empty
  let teams = dbTeams
  if (teams.length === 0) {
    const allMatches = await prisma.match.findMany({
      select: { homeTeam: true, homeTeamCrest: true, awayTeam: true, awayTeamCrest: true },
    })
    const teamMap = new Map<string, { name: string; shortName: string; crest: string }>()
    for (const m of allMatches) {
      if (!teamMap.has(m.homeTeam)) teamMap.set(m.homeTeam, { name: m.homeTeam, shortName: m.homeTeam, crest: m.homeTeamCrest })
      if (!teamMap.has(m.awayTeam)) teamMap.set(m.awayTeam, { name: m.awayTeam, shortName: m.awayTeam, crest: m.awayTeamCrest })
    }
    teams = [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  const isWinnerLocked = Boolean(firstGroupMatch && firstGroupMatch.kickoff <= new Date())

  const predByMatch = userPredictions.reduce<Record<number, typeof userPredictions>>((acc, p) => {
    acc[p.matchId] = acc[p.matchId] ?? []
    acc[p.matchId].push(p)
    return acc
  }, {})

  const advanceByMatch = userAdvances.reduce<Record<number, string>>((acc, a) => {
    acc[a.matchId] = a.predictedTeam
    return acc
  }, {})

  const grouped = STAGE_ORDER.reduce<Record<Stage, typeof matches>>((acc, stage) => {
    acc[stage] = matches.filter((m) => m.stage === stage)
    return acc
  }, {} as Record<Stage, typeof matches>)

  const now = new Date()

  return (
    <div className="space-y-8">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Predictions</h2>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-[#C9A84C] flex items-center gap-2">
          <Trophy className="h-5 w-5" aria-hidden="true" />
          Tournament Winner
          <span className="text-xs font-normal text-white/40 ml-1">50 pts</span>
        </h3>
        <TournamentWinnerSelector
          teams={teams}
          existing={winnerPrediction?.predictedTeam ?? null}
          championshipId={championshipId}
          locked={isWinnerLocked}
        />
      </section>

      {STAGE_ORDER.map((stage) => {
        const stageMatches = grouped[stage]
        if (!stageMatches.length) return null
        return (
          <section key={stage}>
            <h3 className="mb-3 text-lg font-semibold text-[#C9A84C]">{stageLabel(stage)}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {stageMatches.map((match) => {
                const locked = match.kickoff <= now
                const existing = predByMatch[match.id] ?? []
                const visibleExisting = championship.doubleChanceEnabled
                  ? existing
                  : existing.filter((p) => p.type !== 'DOUBLE_CHANCE')
                const hasResultPrediction = visibleExisting.some((p) => p.type === 'SINGLE_OUTCOME' || p.type === 'DOUBLE_CHANCE')
                const hasExactPrediction = visibleExisting.some((p) => p.type === 'EXACT_SCORE')
                const hasAdvancePrediction = match.stage === 'GROUP' || Boolean(advanceByMatch[match.id])
                const predictionsSet = hasResultPrediction && hasExactPrediction && hasAdvancePrediction
                return (
                  <div key={match.id} className={`rounded-xl border p-4 ${locked ? 'border-white/5 bg-white/[0.03]' : 'border-white/10 bg-white/5'}`}>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[#C9A84C]/35 bg-[#C9A84C]/10 px-3 py-1.5 text-sm font-semibold text-[#F2D27A] shadow-sm shadow-black/20">
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                        <span className="tabular-nums">{formatMatchTime(match.kickoff, timezone)}</span>
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={predictionsSet ? 'text-xs font-semibold text-green-400' : 'text-xs font-semibold text-orange-400'}>
                          {predictionsSet ? 'Predictions set' : 'Predictions not set'}
                        </span>
                        {locked && <Badge variant="outline" className="text-xs border-white/20 text-white/40">Locked</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 font-semibold text-white">
                      <TeamLabel name={match.homeTeam} crest={match.homeTeamCrest} align="right" />
                      <span className="w-8 text-center text-xs uppercase tracking-widest text-white/30">vs</span>
                      <TeamLabel name={match.awayTeam} crest={match.awayTeamCrest} align="left" />
                    </div>
                    {!locked && (
                      <>
                        <PredictionForm
                          matchId={match.id}
                          homeTeam={match.homeTeam}
                          awayTeam={match.awayTeam}
                          existing={existing}
                          isKnockout={match.stage !== 'GROUP'}
                          existingAdvanceTeam={advanceByMatch[match.id]}
                          championshipId={championshipId}
                          doubleChanceEnabled={championship.doubleChanceEnabled}
                        />
                        {(visibleExisting.length > 0 || advanceByMatch[match.id]) && (
                          <ResetButton matchId={match.id} championshipId={championshipId} />
                        )}
                      </>
                    )}
                    {locked && visibleExisting.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {visibleExisting.map((p) => (
                          <Badge key={p.id} className="bg-white/10 text-white/60 text-xs">{p.value}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TeamLabel({ name, crest, align }: { name: string; crest: string; align: 'left' | 'right' }) {
  const crestNode = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
      {crest ? <Image src={crest} alt="" width={32} height={32} className="max-h-8 w-auto object-contain" /> : <span className="h-5 w-5 rounded bg-white/10" />}
    </span>
  )

  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'}`}>
      {align === 'right' && crestNode}
      <span className="min-w-0 truncate">{name}</span>
      {align === 'left' && crestNode}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/championships/[championshipId]/predictions/page.tsx
git commit -m "feat: add tournament winner prediction section to predictions page"
```

---

## Final Verification

- [ ] Start dev server and open the Predictions page in a browser

```bash
cd /mnt/sdb/AI/ScoreProphet
npm run dev
```

Open `http://localhost:3000` → select a championship → Predictions.

Confirm:
- "Tournament Winner" section appears above the Group Stage matches
- Searchable dropdown lists teams with crests
- Selecting a team and clicking "Save prediction" persists the pick (page reload shows the saved team)
- When the first Group match kickoff is in the past (simulate by setting `firstGroupMatch.kickoff` to past in a test), the section shows the locked view with a "Locked" badge

- [ ] Kill dev server after verification.
