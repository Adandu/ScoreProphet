# Per-Championship Predictions & Double Chance Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind predictions to championships and add a per-championship `doubleChanceEnabled` flag that hides double chance from the UI and excludes it from scoring when disabled.

**Architecture:** Add `championshipId` to `Prediction` and `KnockoutAdvance` so each prediction belongs to exactly one championship. Add `doubleChanceEnabled` to `Championship`. All server actions read `championshipId` from hidden form inputs; the leaderboard filters by it at query time, excluding double chance points when disabled.

**Tech Stack:** Next.js 15 App Router, Prisma 7 + SQLite, Vitest, Tailwind CSS, React 19 `useActionState`

---

## File Map

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `doubleChanceEnabled` to Championship; add `championshipId` + update unique constraints on Prediction and KnockoutAdvance |
| `prisma/migrations/…` | New migration (auto-generated) |
| `src/lib/championships.ts` | Add `doubleChanceEnabled` to `ChampionshipSummary` and query mappings |
| `src/lib/leaderboard.ts` | New signature with `championship` param; filter by `championshipId`; exclude double chance when disabled |
| `src/lib/__tests__/leaderboard.test.ts` | Update existing tests; add tests for championship filtering and double chance exclusion |
| `src/actions/predictions.ts` | All 4 actions: read + validate `championshipId`; scope upsert/delete; update revalidatePath |
| `src/actions/championships.ts` | Add `doubleChanceEnabled` to `updateChampionship` |
| `src/app/admin/page.tsx` | Add `doubleChanceEnabled` to championship mapping |
| `src/app/admin/_admin-client.tsx` | Add `doubleChanceEnabled` to Championship interface; add checkbox in update form |
| `src/app/championships/[championshipId]/predictions/page.tsx` | Filter predictions/advances by `championshipId`; pass new props |
| `src/app/championships/[championshipId]/leaderboard/page.tsx` | Pass championship to `getRankedUsers`; conditional Double column |
| `src/components/prediction-form.tsx` | Add `championshipId` + `doubleChanceEnabled` props; hidden inputs; conditional double chance |
| `src/components/reset-button.tsx` | Add `championshipId` prop + hidden input |

---

## Task 1: Schema changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update the Prisma schema**

In `prisma/schema.prisma`, make these three changes:

*Championship model* — add after `updatedAt`:
```prisma
doubleChanceEnabled Boolean @default(true)
```

*Prediction model* — add `championshipId` field and replace the unique constraint:
```prisma
// Add this field (after the existing fields, before @@unique):
championshipId      Int

// Replace:
// @@unique([userId, matchId, type])
// With:
@@unique([userId, matchId, type, championshipId])
```

*KnockoutAdvance model* — same pattern:
```prisma
// Add this field (after matchId):
championshipId      Int

// Replace:
// @@unique([userId, matchId])
// With:
@@unique([userId, matchId, championshipId])
```

The full updated models should look like:

```prisma
model Championship {
  id                  Int                  @id @default(autoincrement())
  name                String               @unique
  description         String               @default("")
  isActive            Boolean              @default(true)
  doubleChanceEnabled Boolean              @default(true)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  members             ChampionshipMember[]
}

model Prediction {
  id             Int            @id @default(autoincrement())
  userId         Int
  matchId        Int
  championshipId Int
  type           PredictionType
  value          String
  pointsAwarded  Int?
  createdAt      DateTime       @default(now())
  user           User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  match          Match          @relation(fields: [matchId], references: [id])

  @@unique([userId, matchId, type, championshipId])
}

model KnockoutAdvance {
  id             Int      @id @default(autoincrement())
  userId         Int
  matchId        Int
  championshipId Int
  predictedTeam  String
  pointsAwarded  Int?
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  match          Match    @relation(fields: [matchId], references: [id])

  @@unique([userId, matchId, championshipId])
}
```

- [ ] **Step 2: Run the migration**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx prisma migrate dev --name add_championship_binding
```

Expected: migration created and applied, Prisma client regenerated. Existing `Prediction` and `KnockoutAdvance` rows get `championshipId = 0` (matches no real championship — effectively orphaned, which is acceptable).

- [ ] **Step 3: Verify client compiles**

```bash
npx prisma generate
```

Expected: no errors.

- [ ] **Step 4: Run existing tests to confirm no breakage**

```bash
npm test
```

Expected: all tests that don't touch leaderboard pass. Leaderboard tests will fail (new signature) — that is expected and will be fixed in Task 3–4.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add championshipId to predictions and doubleChanceEnabled to championship"
```

---

## Task 2: ChampionshipSummary type

**Files:**
- Modify: `src/lib/championships.ts`

- [ ] **Step 1: Add `doubleChanceEnabled` to the interface and query mappings**

Replace the `ChampionshipSummary` interface:
```ts
export interface ChampionshipSummary {
  id: number
  name: string
  description: string
  isActive: boolean
  doubleChanceEnabled: boolean
}
```

In `getUserChampionships`, update the map return:
```ts
return memberships.map(({ championship }) => ({
  id: championship.id,
  name: championship.name,
  description: championship.description,
  isActive: championship.isActive,
  doubleChanceEnabled: championship.doubleChanceEnabled,
}))
```

`requireChampionshipAccess` already returns the raw Prisma championship object (which now includes `doubleChanceEnabled`), so no change needed there.

- [ ] **Step 2: Confirm no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing ones unrelated to this task).

- [ ] **Step 3: Commit**

```bash
git add src/lib/championships.ts
git commit -m "feat: add doubleChanceEnabled to ChampionshipSummary"
```

---

## Task 3: Leaderboard tests (TDD — write failing tests first)

**Files:**
- Modify: `src/lib/__tests__/leaderboard.test.ts`

- [ ] **Step 1: Replace the leaderboard test file**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { getRankedUsers } from '@/lib/leaderboard'

const champOn = { id: 1, doubleChanceEnabled: true }
const champOff = { id: 2, doubleChanceEnabled: false }

describe('getRankedUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ranks users by total points and filters by championshipId', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 2,
        username: 'bob',
        predictions: [{ type: 'EXACT_SCORE', pointsAwarded: 5 }],
        advances: [],
      },
      {
        id: 1,
        username: 'anna',
        predictions: [{ type: 'SINGLE_OUTCOME', pointsAwarded: 3 }],
        advances: [{ pointsAwarded: 1 }],
      },
    ] as never)

    const ranked = await getRankedUsers([1, 2], champOn)

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [1, 2] } },
        include: expect.objectContaining({
          predictions: expect.objectContaining({
            where: expect.objectContaining({ championshipId: 1 }),
          }),
          advances: expect.objectContaining({
            where: expect.objectContaining({ championshipId: 1 }),
          }),
        }),
      })
    )
    expect(ranked.map((u) => u.username)).toEqual(['bob', 'anna'])
    expect(ranked.map((u) => u.total)).toEqual([5, 4])
  })

  it('does not query when userIds is empty', async () => {
    expect(await getRankedUsers([], champOn)).toEqual([])
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('includes double chance in total and returns double field when enabled', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 1,
        username: 'anna',
        predictions: [
          { type: 'SINGLE_OUTCOME', pointsAwarded: 3 },
          { type: 'DOUBLE_CHANCE', pointsAwarded: 1 },
        ],
        advances: [],
      },
    ] as never)

    const ranked = await getRankedUsers([1], champOn)
    expect(ranked[0].total).toBe(4)
    expect(ranked[0].double).toBe(1)
  })

  it('excludes double chance from total and omits double field when disabled', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 1,
        username: 'anna',
        predictions: [
          { type: 'SINGLE_OUTCOME', pointsAwarded: 3 },
          { type: 'DOUBLE_CHANCE', pointsAwarded: 1 },
        ],
        advances: [],
      },
    ] as never)

    const ranked = await getRankedUsers([1], champOff)
    expect(ranked[0].total).toBe(3)
    expect(ranked[0].double).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- leaderboard
```

Expected: FAIL — `getRankedUsers` signature mismatch (currently takes one argument).

---

## Task 4: Leaderboard implementation

**Files:**
- Modify: `src/lib/leaderboard.ts`

- [ ] **Step 1: Replace the full file**

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

      const result: RankedUser = {
        id: u.id,
        username: u.username,
        total: exactPts + singlePts + (championship.doubleChanceEnabled ? doublePts : 0) + advancePts,
        exact: u.predictions.filter((p) => p.type === 'EXACT_SCORE' && (p.pointsAwarded ?? 0) > 0).length,
        single: u.predictions.filter((p) => p.type === 'SINGLE_OUTCOME' && (p.pointsAwarded ?? 0) > 0).length,
        advance: u.advances.filter((a) => (a.pointsAwarded ?? 0) > 0).length,
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

- [ ] **Step 2: Run tests**

```bash
npm test -- leaderboard
```

Expected: all 4 leaderboard tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/__tests__/leaderboard.test.ts
git commit -m "feat: scope leaderboard by championship, exclude double chance when disabled"
```

---

## Task 5: Server actions — predictions.ts

**Files:**
- Modify: `src/actions/predictions.ts`

- [ ] **Step 1: Replace the full file**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { validatePredictionCombination, parseExactScore } from '@/lib/validation'

type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE'

export async function savePrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const type = formData.get('type') as PredictionType
  const value = (formData.get('value') as string)?.trim()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !type || !value || !championshipId) return { error: 'Missing fields' }

  const [match, membership] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.championshipMember.findFirst({
      where: { userId: session.userId!, championshipId },
      include: { championship: true },
    }),
  ])

  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }
  if (!membership) return { error: 'You are not a member of this championship' }
  if (type === 'DOUBLE_CHANCE' && !membership.championship.doubleChanceEnabled) {
    return { error: 'Double chance is not enabled for this championship' }
  }

  if (type === 'EXACT_SCORE') {
    const parsed = parseExactScore(value)
    if (!parsed) return { error: 'Invalid score format. Use e.g. 2-1' }
  }

  const existing = await prisma.prediction.findMany({
    where: { userId: session.userId!, matchId, championshipId },
  })

  const existingOtherTypes = existing.filter((p) => p.type !== type)
  const validationError = validatePredictionCombination(type, existingOtherTypes)
  if (validationError) return { error: validationError }

  await prisma.prediction.upsert({
    where: { userId_matchId_type_championshipId: { userId: session.userId!, matchId, type, championshipId } },
    update: { value },
    create: { userId: session.userId!, matchId, type, value, championshipId },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function deletePrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const predictionId = parseInt(formData.get('predictionId') as string, 10)

  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { match: true },
  })
  if (!prediction || prediction.userId !== session.userId) return { error: 'Not found' }
  if (prediction.match.kickoff <= new Date()) return { error: 'Cannot delete after kickoff' }

  await prisma.prediction.delete({ where: { id: predictionId } })
  revalidatePath(`/championships/${prediction.championshipId}/predictions`)
  return { success: true }
}

export async function saveKnockoutAdvance(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const predictedTeam = (formData.get('predictedTeam') as string)?.trim()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !predictedTeam || !championshipId) return { error: 'Missing fields' }

  const [match, membership] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.championshipMember.findFirst({ where: { userId: session.userId!, championshipId } }),
  ])

  if (!match) return { error: 'Match not found' }
  if (match.stage === 'GROUP') return { error: 'Advance prediction only for knockout rounds' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }
  if (!membership) return { error: 'You are not a member of this championship' }
  if (![match.homeTeam, match.awayTeam].includes(predictedTeam)) return { error: 'Choose one of the teams in this match' }

  await prisma.knockoutAdvance.upsert({
    where: { userId_matchId_championshipId: { userId: session.userId!, matchId, championshipId } },
    update: { predictedTeam },
    create: { userId: session.userId!, matchId, predictedTeam, championshipId },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function resetMatchPredictions(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !championshipId) return { error: 'Missing fields' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Match has already started — predictions are locked' }

  await prisma.prediction.deleteMany({ where: { userId: session.userId!, matchId, championshipId } })
  await prisma.knockoutAdvance.deleteMany({ where: { userId: session.userId!, matchId, championshipId } })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/predictions.ts
git commit -m "feat: bind prediction actions to championship"
```

---

## Task 6: Admin action — add doubleChanceEnabled to updateChampionship

**Files:**
- Modify: `src/actions/championships.ts`

- [ ] **Step 1: Update `updateChampionship` to read and save `doubleChanceEnabled`**

Replace the `updateChampionship` function:

```ts
export async function updateChampionship(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const championshipId = parseId(formData.get('championshipId'))
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string) ?? '').trim()
  const isActive = formData.get('isActive') === 'on'
  const doubleChanceEnabled = formData.get('doubleChanceEnabled') === 'on'

  if (!championshipId) return { error: 'Missing championship ID' }
  if (!name || name.length < 2 || name.length > 60) return { error: 'Championship name must be 2-60 characters' }

  try {
    await prisma.championship.update({
      where: { id: championshipId },
      data: { name, description, isActive, doubleChanceEnabled },
    })
  } catch {
    return { error: 'Could not update championship' }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  revalidatePath(`/championships/${championshipId}/leaderboard`)
  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/championships.ts
git commit -m "feat: add doubleChanceEnabled to updateChampionship action"
```

---

## Task 7: Admin page — add doubleChanceEnabled to championship mapping

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add `doubleChanceEnabled` to the championships map**

In the `AdminPage` component, update the championships mapping:

```tsx
championships={championships.map((championship) => ({
  id: championship.id,
  name: championship.name,
  description: championship.description,
  isActive: championship.isActive,
  doubleChanceEnabled: championship.doubleChanceEnabled,
  userIds: championship.members.map((member) => member.userId),
}))}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: pass doubleChanceEnabled to admin client"
```

---

## Task 8: Admin client — Championship interface and toggle checkbox

**Files:**
- Modify: `src/app/admin/_admin-client.tsx`

- [ ] **Step 1: Add `doubleChanceEnabled` to the `Championship` interface**

Replace:
```ts
interface Championship {
  id: number
  name: string
  description: string
  isActive: boolean
  userIds: number[]
}
```

With:
```ts
interface Championship {
  id: number
  name: string
  description: string
  isActive: boolean
  doubleChanceEnabled: boolean
  userIds: number[]
}
```

- [ ] **Step 2: Add the "Double chance" checkbox to the `ChampionshipRow` update form**

In `ChampionshipRow`, inside the update `<form>`, add the "Double chance" checkbox immediately after the existing "Active" checkbox label:

```tsx
<label className="flex h-9 items-center gap-2 text-sm text-white/70">
  <input
    type="checkbox"
    name="doubleChanceEnabled"
    defaultChecked={championship.doubleChanceEnabled}
    className="h-4 w-4 accent-[#C9A84C]"
  />
  Double chance
</label>
```

The two checkboxes together should look like:
```tsx
<label className="flex h-9 items-center gap-2 text-sm text-white/70">
  <input type="checkbox" name="isActive" defaultChecked={championship.isActive} className="h-4 w-4 accent-[#C9A84C]" />
  Active
</label>
<label className="flex h-9 items-center gap-2 text-sm text-white/70">
  <input
    type="checkbox"
    name="doubleChanceEnabled"
    defaultChecked={championship.doubleChanceEnabled}
    className="h-4 w-4 accent-[#C9A84C]"
  />
  Double chance
</label>
```

- [ ] **Step 3: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/_admin-client.tsx
git commit -m "feat: add double chance toggle to admin championship UI"
```

---

## Task 9: Predictions page

**Files:**
- Modify: `src/app/championships/[championshipId]/predictions/page.tsx`

- [ ] **Step 1: Replace the full file**

```tsx
import { prisma } from '@/lib/db'
import { requireChampionshipAccess } from '@/lib/championships'
import { PredictionForm } from '@/components/prediction-form'
import { ResetButton } from '@/components/reset-button'
import { Badge } from '@/components/ui/badge'
import { formatMatchTime } from '@/lib/format-date'
import { ChampionshipPageNav } from '@/components/championship-page-nav'
import Image from 'next/image'

type Stage = 'GROUP' | 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'

const STAGE_LABELS: Record<Stage, string> = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

const STAGE_ORDER: Stage[] = ['GROUP', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL']

export default async function ChampionshipPredictionsPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccess(championshipId)
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, userPredictions, userAdvances] = await Promise.all([
    prisma.match.findMany({
      where: { status: { not: 'FINISHED' } },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.prediction.findMany({ where: { userId: session.userId, championshipId } }),
    prisma.knockoutAdvance.findMany({ where: { userId: session.userId, championshipId } }),
  ])

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
      {STAGE_ORDER.map((stage) => {
        const stageMatches = grouped[stage]
        if (!stageMatches.length) return null
        return (
          <section key={stage}>
            <h3 className="mb-3 text-lg font-semibold text-[#C9A84C]">{STAGE_LABELS[stage]}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {stageMatches.map((match) => {
                const locked = match.kickoff <= now
                const existing = predByMatch[match.id] ?? []
                const visibleExisting = championship.doubleChanceEnabled
                  ? existing
                  : existing.filter((p) => p.type !== 'DOUBLE_CHANCE')
                return (
                  <div key={match.id} className={`rounded-xl border p-4 ${locked ? 'border-white/5 bg-white/3 opacity-60' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/40">{formatMatchTime(match.kickoff, timezone)}</span>
                      {locked && <Badge variant="outline" className="text-xs border-white/20 text-white/40">Locked</Badge>}
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
                          homeTeamCrest={match.homeTeamCrest}
                          awayTeamCrest={match.awayTeamCrest}
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

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/championships/[championshipId]/predictions/page.tsx"
git commit -m "feat: filter predictions by championship, pass doubleChanceEnabled to form"
```

---

## Task 10: PredictionForm component

**Files:**
- Modify: `src/components/prediction-form.tsx`

- [ ] **Step 1: Replace the full file**

```tsx
'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import { savePrediction, saveKnockoutAdvance } from '@/actions/predictions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE'

interface ExistingPrediction {
  id: number
  type: PredictionType
  value: string
}

interface Props {
  matchId: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  existing: ExistingPrediction[]
  isKnockout: boolean
  existingAdvanceTeam?: string
  championshipId: number
  doubleChanceEnabled: boolean
}

const SINGLE_OPTS = ['1', 'X', '2']
const DOUBLE_OPTS = ['1X', 'X2', '12']

export function PredictionForm({
  matchId,
  homeTeam,
  awayTeam,
  homeTeamCrest,
  awayTeamCrest,
  existing,
  isKnockout,
  existingAdvanceTeam,
  championshipId,
  doubleChanceEnabled,
}: Props) {
  const [state, formAction, pending] = useActionState(savePrediction, null)

  const hasSingle = existing.some((p) => p.type === 'SINGLE_OUTCOME')
  const hasDouble = existing.some((p) => p.type === 'DOUBLE_CHANCE')
  const hasExact = existing.some((p) => p.type === 'EXACT_SCORE')

  return (
    <div className="mt-3 space-y-3 text-center">
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}

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
        <p className="text-xs text-white/50 mb-1">Exact score (5 pts){hasExact && ' ✓'}</p>
        <form action={formAction} className="flex justify-center gap-2">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="championshipId" value={championshipId} />
          <input type="hidden" name="type" value="EXACT_SCORE" />
          <Input name="value" placeholder="e.g. 2-1"
            defaultValue={existing.find((p) => p.type === 'EXACT_SCORE')?.value ?? ''}
            className="w-24 bg-white/10 text-white border-white/20 text-sm h-8" />
          <Button type="submit" size="sm" disabled={pending}
            className={`h-8 ${hasExact ? 'bg-yellow-600' : 'bg-[#C9A84C]'} text-[#0A1628] font-semibold hover:opacity-90`}>
            {hasExact ? 'Update' : 'Save'}
          </Button>
        </form>
      </div>

      {/* Knockout Advance */}
      {isKnockout && (
        <KnockoutAdvanceForm
          matchId={matchId}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeTeamCrest={homeTeamCrest}
          awayTeamCrest={awayTeamCrest}
          existingTeam={existingAdvanceTeam}
          championshipId={championshipId}
        />
      )}
    </div>
  )
}

function KnockoutAdvanceForm({
  matchId,
  homeTeam,
  awayTeam,
  homeTeamCrest,
  awayTeamCrest,
  existingTeam,
  championshipId,
}: {
  matchId: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  existingTeam?: string
  championshipId: number
}) {
  const [state, formAction, pending] = useActionState(saveKnockoutAdvance, null)
  return (
    <div>
      <p className="text-xs text-white/50 mb-1">Who advances? (1 bonus pt){existingTeam && ` ✓ ${existingTeam}`}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {[
          { name: homeTeam, crest: homeTeamCrest },
          { name: awayTeam, crest: awayTeamCrest },
        ].map((team) => {
          const active = existingTeam === team.name
          return (
            <form key={team.name} action={formAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="championshipId" value={championshipId} />
              <input type="hidden" name="predictedTeam" value={team.name} />
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                variant={active ? 'default' : 'outline'}
                className={active ? 'bg-purple-600 text-white border-0' : 'border-white/20 text-white/70 bg-transparent hover:bg-white/10'}
              >
                {team.crest && <Image src={team.crest} alt="" width={18} height={18} className="max-h-4 w-auto object-contain" />}
                {team.name}
              </Button>
            </form>
          )
        })}
      </div>
      {state?.error && <p className="text-xs text-red-400 mt-1">{state.error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/prediction-form.tsx
git commit -m "feat: add championshipId and doubleChanceEnabled to PredictionForm"
```

---

## Task 11: ResetButton component

**Files:**
- Modify: `src/components/reset-button.tsx`

- [ ] **Step 1: Add `championshipId` prop and hidden input**

Replace the full file:

```tsx
'use client'

import { useActionState } from 'react'
import { resetMatchPredictions } from '@/actions/predictions'
import { Button } from '@/components/ui/button'

export function ResetButton({ matchId, championshipId }: { matchId: number; championshipId: number }) {
  const [state, formAction, pending] = useActionState(resetMatchPredictions, null)

  return (
    <form action={formAction} className="mt-2 text-center">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="championshipId" value={championshipId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        variant="outline"
        className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent"
      >
        {pending ? 'Resetting…' : 'Reset predictions'}
      </Button>
      {state?.error && <p className="text-xs text-red-400 mt-1">{state.error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reset-button.tsx
git commit -m "feat: add championshipId to ResetButton"
```

---

## Task 12: Leaderboard page

**Files:**
- Modify: `src/app/championships/[championshipId]/leaderboard/page.tsx`

- [ ] **Step 1: Replace the full file**

```tsx
import { getCurrentUser } from '@/lib/auth'
import { requireChampionshipAccess } from '@/lib/championships'
import { getRankedUsers } from '@/lib/leaderboard'
import { ChampionshipPageNav } from '@/components/championship-page-nav'

export const revalidate = 60

export default async function ChampionshipLeaderboardPage({ params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const [{ championship }, currentUser] = await Promise.all([
    requireChampionshipAccess(championshipId),
    getCurrentUser(),
  ])

  const memberIds = championship.members.map((member) => member.userId)
  const ranked = await getRankedUsers(memberIds, championship)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-6">
      <ChampionshipPageNav championshipId={championship.id} name={championship.name} />
      <h2 className="text-xl font-bold text-white">Leaderboard</h2>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-white/40 font-normal w-12">#</th>
              <th className="px-4 py-3 text-left text-white/40 font-normal">Player</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Exact</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal">Result</th>
              {championship.doubleChanceEnabled && (
                <th className="px-4 py-3 text-right text-white/40 font-normal">Double</th>
              )}
              <th className="px-4 py-3 text-right text-white/40 font-normal">Advance</th>
              <th className="px-4 py-3 text-right text-white/40 font-normal font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((u, i) => {
              const isCurrentUser = u.id === currentUser?.userId
              return (
                <tr key={u.id} className={`border-b border-white/5 last:border-0 ${isCurrentUser ? 'bg-[#C9A84C]/10' : ''}`}>
                  <td className="px-4 py-3 text-white/60">{medals[i] ?? i + 1}</td>
                  <td className={`px-4 py-3 font-medium ${isCurrentUser ? 'text-[#C9A84C]' : 'text-white'}`}>
                    {u.username} {isCurrentUser && '(you)'}
                  </td>
                  <td className="px-4 py-3 text-right text-yellow-400">{u.exact}</td>
                  <td className="px-4 py-3 text-right text-green-400">{u.single}</td>
                  {championship.doubleChanceEnabled && (
                    <td className="px-4 py-3 text-right text-blue-400">{u.double ?? 0}</td>
                  )}
                  <td className="px-4 py-3 text-right text-purple-400">{u.advance}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#C9A84C] text-base">{u.total}</td>
                </tr>
              )
            })}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={championship.doubleChanceEnabled ? 7 : 6} className="px-4 py-8 text-center text-white/30">
                  No championship members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/championships/[championshipId]/leaderboard/page.tsx"
git commit -m "feat: pass championship to getRankedUsers, hide Double column when disabled"
```

---

## Task 13: Final verification and push

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: 6 test files, all tests pass (count will be higher than 50 due to new leaderboard tests).

- [ ] **Step 2: Check for TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Push**

```bash
git push
```
