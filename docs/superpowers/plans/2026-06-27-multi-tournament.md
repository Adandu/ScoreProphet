# Multi-Tournament Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Tournament` model as a first-class entity so ScoreProphet can run WC, UCL, Euro, and other competitions independently, each with isolated championships, predictions, and leaderboards.

**Architecture:** A new `Tournament` DB table replaces the `competitionCode` string as the primary scope. `Match` and `Championship` both gain a required `tournamentId` FK. The active tournament is stored in the iron-session (`selectedTournamentId`). All existing pages filter by the selected tournament. Archived tournaments are accessible read-only from the user's profile.

**Tech Stack:** Next.js 15 App Router, Prisma + better-sqlite3 (SQLite), iron-session, Vitest, Tailwind CSS, TypeScript.

## Global Constraints

- Test runner: `npm test` (Vitest). Tests live in `src/lib/__tests__/`. Pattern: `describe/it/expect`, no mocks unless necessary.
- All server actions use `'use server'` directive and return `{ success, error }` shapes.
- Session cookie: `scoreprophet-session` via iron-session, `SessionData` in `src/lib/session.ts`.
- DB path: `/mnt/sdc/docker/scoreprophet/scoreprophet.db`. Prisma client from `@/lib/db`.
- football-data.org base URL: `https://api.football-data.org/v4`. API key env: `FOOTBALL_API_KEY`.
- Never break existing WC 2026 data or championship memberships.
- Commit after every task.

---

## Task 1: Schema — Tournament model, Stage→String, tournamentId FKs, migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_tournament/migration.sql` (via Prisma CLI, then hand-edited)

**Interfaces:**
- Produces: `Tournament` Prisma model with fields `id`, `name`, `competitionCode`, `season`, `type`, `isActive`, `isArchived`, `startDate`, `endDate`, `createdAt`
- Produces: `Match.tournamentId Int` (required FK)
- Produces: `Championship.tournamentId Int` (required FK)
- Produces: `Match.stage String` (no longer a Prisma enum)

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Replace the `Stage` enum and update `Match`, `Championship`, and add `Tournament`:

```prisma
// Remove the entire `enum Stage { ... }` block.

// Add this new model (before the Match model):
model Tournament {
  id              Int            @id @default(autoincrement())
  name            String
  competitionCode String
  season          String
  type            String
  isActive        Boolean        @default(true)
  isArchived      Boolean        @default(false)
  startDate       DateTime
  endDate         DateTime
  createdAt       DateTime       @default(now())
  matches         Match[]
  championships   Championship[]

  @@index([isActive])
  @@index([isArchived])
  @@index([competitionCode])
}

// In Match model:
// Change:  stage  Stage
// To:      stage  String
// Add after existing fields:
//   tournamentId  Int
//   tournament    Tournament  @relation(fields: [tournamentId], references: [id])

// In Championship model, add:
//   tournamentId  Int
//   tournament    Tournament  @relation(fields: [tournamentId], references: [id])
```

Final `Match` index block should include: `@@index([competitionCode, stage])` and `@@index([tournamentId])`.
Final `Championship` block should include: `@@index([tournamentId])`.

- [ ] **Step 2: Generate migration with --create-only**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx prisma migrate dev --create-only --name add_tournament
```

This creates `prisma/migrations/<timestamp>_add_tournament/migration.sql`. Open that file.

- [ ] **Step 3: Edit the generated migration SQL**

Find the lines that create or alter `Match` and `Championship` to add `tournamentId`. Before those lines, insert the WC 2026 seed and backfill. The edited file should contain (in order):

```sql
-- CreateTable Tournament
CREATE TABLE "Tournament" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Tournament_isActive_idx" ON "Tournament"("isActive");
CREATE INDEX "Tournament_isArchived_idx" ON "Tournament"("isArchived");
CREATE INDEX "Tournament_competitionCode_idx" ON "Tournament"("competitionCode");

-- Seed WC 2026 before backfill
INSERT INTO "Tournament" ("name","competitionCode","season","type","isActive","isArchived","startDate","endDate","createdAt")
VALUES ('FIFA World Cup 2026','WC','2026','WORLD_CUP',1,0,'2026-06-11 00:00:00','2026-07-19 00:00:00',CURRENT_TIMESTAMP);

-- Prisma recreates Match here (due to stage String + tournamentId NOT NULL).
-- In the recreated Match CREATE TABLE, tournamentId must have a DEFAULT of 1
-- so the data copy succeeds, then we remove the default after.
-- Prisma auto-generates the RedefineTables block — verify it looks like:
-- PRAGMA foreign_keys=OFF;
-- CREATE TABLE "new_Match" ( ... "tournamentId" INTEGER NOT NULL DEFAULT 1, ... )
-- INSERT INTO "new_Match" SELECT ..., 1 AS "tournamentId" FROM "Match";
-- DROP TABLE "Match";
-- ALTER TABLE "new_Match" RENAME TO "Match";
-- (same pattern for Championship)
-- PRAGMA foreign_keys=ON;
```

> **Important:** Prisma's RedefineTables block for SQLite will look different. The key edit is ensuring the INSERT INTO new_Match includes `1 AS "tournamentId"` (the WC 2026 id) in the SELECT. Edit the generated INSERT to hardcode this.

After the RedefineTables block, add the FK index:
```sql
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");
CREATE INDEX "Championship_tournamentId_idx" ON "Championship"("tournamentId");
```

- [ ] **Step 4: Apply migration and regenerate client**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: "1 migration applied", no errors.

- [ ] **Step 5: Verify data**

```bash
sqlite3 /mnt/sdc/docker/scoreprophet/scoreprophet.db \
  "SELECT t.name, COUNT(m.id) as matches, COUNT(c.id) as championships
   FROM Tournament t
   LEFT JOIN Match m ON m.tournamentId = t.id
   LEFT JOIN Championship c ON c.tournamentId = t.id
   GROUP BY t.id;"
```

Expected: one row — `FIFA World Cup 2026 | 208 | <N championships>`.

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat(schema): add Tournament model, stage String, tournamentId FKs with WC 2026 backfill"
```

---

## Task 2: Stage type + football-api competition parameter

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/football-api.ts`
- Modify: `src/lib/__tests__/football-api.test.ts`

**Interfaces:**
- Produces: `Stage = string` (replaces union type)
- Produces: `fetchAllMatches(competitionCode: string, season?: string): Promise<NormalizedMatch[]>` — accepts competition code and optional season
- Produces: `fetchAvailableCompetitions(): Promise<AvailableCompetition[]>` — new export
- Produces: `type AvailableCompetition = { code: string; name: string; type: string; currentSeason: { id: number; startDate: string; endDate: string } | null }`

- [ ] **Step 1: Update Stage type in `src/lib/types.ts`**

```typescript
// Change:
export type Stage =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINAL'
  | 'SEMI_FINAL'
  | 'THIRD_PLACE'
  | 'FINAL'

// To:
export type Stage = string
```

- [ ] **Step 2: Update `src/lib/football-api.ts`**

At the top, remove the module-level `COMPETITION` const:
```typescript
// Remove: const COMPETITION = process.env.FOOTBALL_API_COMPETITION ?? 'WC'
```

Update `fetchAllMatches` signature and all internal usages:
```typescript
export async function fetchAllMatches(competitionCode = 'WC', season?: string): Promise<NormalizedMatch[]> {
  const seasonParam = season ? `?season=${season}` : ''
  const res = await fetch(
    `${BASE_URL}/competitions/${competitionCode}/matches${seasonParam}`,
    { headers: { 'X-Auth-Token': FOOTBALL_API_KEY ?? '' } }
  )
  if (!res.ok) throw new Error(`football-api fetchAllMatches ${res.status}`)
  const data = await res.json()
  return (data.matches ?? []).map(normalizeMatch)
}
```

Update `fetchLiveMatches`, `fetchStandings`, `fetchTopScorers`, `fetchAllTeams` the same way — each gets a `competitionCode = 'WC'` parameter replacing the module-level const. Every URL that used `${COMPETITION}` becomes `${competitionCode}`.

Add new export at the end of the file:
```typescript
export interface AvailableCompetition {
  code: string
  name: string
  type: string
  currentSeason: { id: number; startDate: string; endDate: string } | null
}

export async function fetchAvailableCompetitions(): Promise<AvailableCompetition[]> {
  const res = await fetch(`${BASE_URL}/competitions`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY ?? '' },
  })
  if (!res.ok) throw new Error(`football-api fetchAvailableCompetitions ${res.status}`)
  const data = await res.json()
  return (data.competitions ?? []).map((c: Record<string, unknown>) => ({
    code: c.code as string,
    name: (c.name as string) ?? '',
    type: (c.type as string) ?? '',
    currentSeason: c.currentSeason
      ? {
          id: (c.currentSeason as Record<string, unknown>).id as number,
          startDate: (c.currentSeason as Record<string, unknown>).startDate as string,
          endDate: (c.currentSeason as Record<string, unknown>).endDate as string,
        }
      : null,
  }))
}
```

- [ ] **Step 2: Write failing test for `fetchAvailableCompetitions`**

In `src/lib/__tests__/football-api.test.ts`, add:

```typescript
describe('fetchAvailableCompetitions', () => {
  it('returns normalized competitions from API response', async () => {
    mockFetch({
      competitions: [
        {
          code: 'WC',
          name: 'FIFA World Cup',
          type: 'CUP',
          currentSeason: { id: 1, startDate: '2026-06-11', endDate: '2026-07-19' },
        },
        {
          code: 'CL',
          name: 'UEFA Champions League',
          type: 'CUP',
          currentSeason: null,
        },
      ],
    })
    const result = await fetchAvailableCompetitions()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      code: 'WC',
      name: 'FIFA World Cup',
      type: 'CUP',
      currentSeason: { id: 1, startDate: '2026-06-11', endDate: '2026-07-19' },
    })
    expect(result[1].currentSeason).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm test -- football-api
```

Expected: all tests pass including the new one.

- [ ] **Step 4: Fix TypeScript errors from Stage→string change**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Fix any remaining type errors (likely in `knockout-bracket.tsx` where `stage: Stage` comparisons exist — they'll work fine with `string`, no code changes needed there since string literals still match).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/football-api.ts src/lib/__tests__/football-api.test.ts
git commit -m "feat(api): parameterize competition code, add fetchAvailableCompetitions, Stage→string"
```

---

## Task 3: Tournament context lib + session update

**Files:**
- Modify: `src/lib/session.ts`
- Create: `src/lib/tournament.ts`
- Create: `src/lib/__tests__/tournament.test.ts`

**Interfaces:**
- Consumes: `SessionData` from `src/lib/session.ts`; `prisma` from `@/lib/db`; `Tournament` Prisma model from Task 1
- Produces: `getActiveTournaments(): Promise<Tournament[]>` — all tournaments where `isActive = true`, ordered by `startDate desc`
- Produces: `getSelectedTournament(session: SessionData): Promise<Tournament | null>` — resolves `session.selectedTournamentId` to a Tournament; falls back to the first active tournament
- Produces: `getTournamentForUser(tournamentId: number, userId: number): Promise<Tournament | null>` — returns tournament only if user has a championship membership in it (for profile history access)
- Produces: `SessionData.selectedTournamentId?: number` field added

- [ ] **Step 1: Add `selectedTournamentId` to `src/lib/session.ts`**

```typescript
export interface SessionData {
  userId?: number
  username?: string
  isAdmin?: boolean
  timezone?: string
  theme?: 'DARK' | 'LIGHT'
  selectedChampionshipId?: number
  selectedTournamentId?: number   // ← add this
}
```

- [ ] **Step 2: Write failing tests in `src/lib/__tests__/tournament.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    tournament: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

import { getActiveTournaments, getSelectedTournament, getTournamentForUser } from '@/lib/tournament'
import { prisma } from '@/lib/db'

const wc2026 = {
  id: 1,
  name: 'FIFA World Cup 2026',
  competitionCode: 'WC',
  season: '2026',
  type: 'WORLD_CUP',
  isActive: true,
  isArchived: false,
  startDate: new Date('2026-06-11'),
  endDate: new Date('2026-07-19'),
  createdAt: new Date(),
}

describe('getActiveTournaments', () => {
  it('returns all active tournaments ordered by startDate desc', async () => {
    vi.mocked(prisma.tournament.findMany).mockResolvedValue([wc2026])
    const result = await getActiveTournaments()
    expect(result).toHaveLength(1)
    expect(result[0].competitionCode).toBe('WC')
    expect(prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    )
  })
})

describe('getSelectedTournament', () => {
  it('returns tournament matching session.selectedTournamentId', async () => {
    vi.mocked(prisma.tournament.findFirst).mockResolvedValue(wc2026)
    const result = await getSelectedTournament({ selectedTournamentId: 1 })
    expect(result?.id).toBe(1)
  })

  it('falls back to first active tournament when no selectedTournamentId in session', async () => {
    vi.mocked(prisma.tournament.findMany).mockResolvedValue([wc2026])
    const result = await getSelectedTournament({})
    expect(result?.id).toBe(1)
  })

  it('returns null when no active tournaments exist', async () => {
    vi.mocked(prisma.tournament.findMany).mockResolvedValue([])
    const result = await getSelectedTournament({})
    expect(result).toBeNull()
  })
})

describe('getTournamentForUser', () => {
  it('returns tournament when user has a championship in it', async () => {
    vi.mocked(prisma.tournament.findFirst).mockResolvedValue(wc2026)
    const result = await getTournamentForUser(1, 42)
    expect(result?.id).toBe(1)
    expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 1,
          championships: { some: { members: { some: { userId: 42 } } } },
        }),
      })
    )
  })

  it('returns null when user has no championship in the tournament', async () => {
    vi.mocked(prisma.tournament.findFirst).mockResolvedValue(null)
    const result = await getTournamentForUser(1, 42)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test -- tournament
```

Expected: FAIL — "Cannot find module '@/lib/tournament'"

- [ ] **Step 4: Create `src/lib/tournament.ts`**

```typescript
import { prisma } from '@/lib/db'
import type { SessionData } from '@/lib/session'
import type { Tournament } from '@prisma/client'

export type { Tournament }

export async function getActiveTournaments(): Promise<Tournament[]> {
  return prisma.tournament.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })
}

export async function getSelectedTournament(session: Partial<SessionData>): Promise<Tournament | null> {
  if (session.selectedTournamentId) {
    return prisma.tournament.findFirst({
      where: { id: session.selectedTournamentId },
    })
  }
  const active = await getActiveTournaments()
  return active[0] ?? null
}

export async function getTournamentForUser(
  tournamentId: number,
  userId: number
): Promise<Tournament | null> {
  return prisma.tournament.findFirst({
    where: {
      id: tournamentId,
      championships: { some: { members: { some: { userId } } } },
    },
  })
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tournament
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/session.ts src/lib/tournament.ts src/lib/__tests__/tournament.test.ts
git commit -m "feat(lib): add tournament context helpers and selectedTournamentId to session"
```

---

## Task 4: Server action — setSelectedTournament

**Files:**
- Create: `src/actions/tournament.ts`

**Interfaces:**
- Consumes: `getSession()` from `@/lib/session`; `prisma` from `@/lib/db`
- Produces: `setSelectedTournament(tournamentId: number): Promise<void>` — server action that writes `selectedTournamentId` to session and redirects

- [ ] **Step 1: Create `src/actions/tournament.ts`**

```typescript
'use server'

import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'

export async function setSelectedTournament(tournamentId: number): Promise<void> {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, isActive: true },
  })
  if (!tournament) return

  const session = await getSession()
  session.selectedTournamentId = tournamentId
  await session.save()
  redirect('/')
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep 'actions/tournament' | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/tournament.ts
git commit -m "feat(actions): add setSelectedTournament server action"
```

---

## Task 5: Admin — tournament management

**Files:**
- Modify: `src/actions/admin.ts`
- Create: `src/app/admin/_tournament-manager.tsx`
- Modify: `src/app/admin/_admin-client.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `fetchAvailableCompetitions`, `fetchAllMatches` from `@/lib/football-api`; `prisma` from `@/lib/db`; `Tournament` from `@/lib/tournament`
- Produces: `createTournamentFromApi(prevState, formData)` — server action
- Produces: `syncTournamentFixtures(prevState, formData)` — server action (replaces global sync for a specific tournament)
- Produces: `archiveTournament(prevState, formData)` — server action
- Produces: `recalculateTournamentPoints(prevState, formData)` — server action

- [ ] **Step 1: Add tournament admin actions to `src/actions/admin.ts`**

Add these server actions at the end of the file:

```typescript
export async function listTournamentsForAdmin() {
  return prisma.tournament.findMany({ orderBy: { startDate: 'desc' } })
}

export async function fetchCompetitionsFromApi() {
  const { fetchAvailableCompetitions } = await import('@/lib/football-api')
  return fetchAvailableCompetitions()
}

export async function createTournamentFromApi(prevState: unknown, formData: FormData) {
  const code = formData.get('competitionCode') as string
  const season = formData.get('season') as string
  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string

  if (!code || !name) return { success: false, error: 'Missing required fields' }

  const existing = await prisma.tournament.findFirst({ where: { competitionCode: code, season } })
  if (existing) return { success: false, error: 'Tournament already exists' }

  const tournament = await prisma.tournament.create({
    data: { name, competitionCode: code, season, type, isActive: true, isArchived: false,
            startDate: new Date(startDate), endDate: new Date(endDate) },
  })

  // Initial fixture sync
  const { fetchAllMatches } = await import('@/lib/football-api')
  const matches = await fetchAllMatches(code, season || undefined)
  let synced = 0
  for (const m of matches) {
    await prisma.match.upsert({
      where: { externalId: m.externalId },
      update: { homeTeam: m.homeTeam, awayTeam: m.awayTeam, stage: m.stage,
                group: m.group, kickoff: m.kickoff, status: m.status,
                competitionCode: code, tournamentId: tournament.id },
      create: { ...m, competitionCode: code, tournamentId: tournament.id },
    })
    synced++
  }
  return { success: true, synced, tournamentId: tournament.id }
}

export async function syncTournamentFixtures(prevState: unknown, formData: FormData) {
  const tournamentId = Number(formData.get('tournamentId'))
  const tournament = await prisma.tournament.findFirst({ where: { id: tournamentId } })
  if (!tournament) return { success: false, error: 'Tournament not found' }

  const { fetchAllMatches } = await import('@/lib/football-api')
  const matches = await fetchAllMatches(tournament.competitionCode, tournament.season)
  let synced = 0
  for (const m of matches) {
    await prisma.match.upsert({
      where: { externalId: m.externalId },
      update: { homeTeam: m.homeTeam, awayTeam: m.awayTeam, stage: m.stage,
                group: m.group, kickoff: m.kickoff, status: m.status },
      create: { ...m, competitionCode: tournament.competitionCode, tournamentId: tournament.id },
    })
    synced++
  }
  return { success: true, synced }
}

export async function archiveTournament(prevState: unknown, formData: FormData) {
  const tournamentId = Number(formData.get('tournamentId'))
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { isActive: false, isArchived: true },
  })
  return { success: true }
}

export async function recalculateTournamentPoints(prevState: unknown, formData: FormData) {
  const tournamentId = Number(formData.get('tournamentId'))
  const matches = await prisma.match.findMany({
    where: { tournamentId, status: 'FINISHED' },
    select: { id: true },
  })
  for (const m of matches) {
    // Re-use the existing recalculateMatchPoints function (already defined in this file)
    // It's not exported — call it here or extract it. If not accessible, inline equivalent logic.
    await (recalculateMatchPoints as (id: number) => Promise<void>)(m.id)
  }
  return { success: true, count: matches.length }
}
```

- [ ] **Step 2: Create `src/app/admin/_tournament-manager.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import {
  createTournamentFromApi,
  syncTournamentFixtures,
  archiveTournament,
  recalculateTournamentPoints,
} from '@/actions/admin'
import type { Tournament } from '@prisma/client'
import type { AvailableCompetition } from '@/lib/football-api'

interface Props {
  tournaments: Tournament[]
  availableCompetitions: AvailableCompetition[]
}

export function TournamentManager({ tournaments, availableCompetitions }: Props) {
  const [createState, createAction, createPending] = useActionState(createTournamentFromApi, null)
  const [syncState, syncAction, syncPending] = useActionState(syncTournamentFixtures, null)
  const [archiveState, archiveAction, archivePending] = useActionState(archiveTournament, null)
  const [recalcState, recalcAction, recalcPending] = useActionState(recalculateTournamentPoints, null)
  const [selectedCode, setSelectedCode] = useState('')

  const selected = availableCompetitions.find((c) => c.code === selectedCode)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Tournaments</h2>

      {/* Existing tournaments */}
      <div className="space-y-3">
        {tournaments.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
            <div>
              <p className="font-medium text-white">{t.name}</p>
              <p className="text-sm text-white/50">{t.competitionCode} · {t.season} · {t.type}</p>
              {t.isArchived && <span className="text-xs text-amber-400">Archived</span>}
            </div>
            <div className="flex gap-2">
              <form action={syncAction}>
                <input type="hidden" name="tournamentId" value={t.id} />
                <button type="submit" disabled={syncPending}
                  className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {syncPending ? 'Syncing…' : 'Sync'}
                </button>
              </form>
              <form action={recalcAction}>
                <input type="hidden" name="tournamentId" value={t.id} />
                <button type="submit" disabled={recalcPending}
                  className="rounded bg-purple-600 px-3 py-1 text-sm text-white hover:bg-purple-700 disabled:opacity-50">
                  {recalcPending ? 'Recalc…' : 'Recalculate'}
                </button>
              </form>
              {!t.isArchived && (
                <form action={archiveAction}>
                  <input type="hidden" name="tournamentId" value={t.id} />
                  <button type="submit" disabled={archivePending}
                    className="rounded bg-amber-600 px-3 py-1 text-sm text-white hover:bg-amber-700 disabled:opacity-50">
                    Archive
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add tournament */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
        <h3 className="font-medium text-white">Add Tournament</h3>
        <form action={createAction} className="space-y-3">
          <div>
            <label className="block text-sm text-white/70 mb-1">Competition</label>
            <select
              name="competitionCode"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="w-full rounded bg-white/10 px-3 py-2 text-white"
              required
            >
              <option value="">Select competition…</option>
              {availableCompetitions.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          {selected && (
            <>
              <input type="hidden" name="name" value={selected.name} />
              <input type="hidden" name="type" value={selected.type} />
              <input type="hidden" name="season" value={selected.currentSeason?.startDate.slice(0, 4) ?? ''} />
              <input type="hidden" name="startDate" value={selected.currentSeason?.startDate ?? ''} />
              <input type="hidden" name="endDate" value={selected.currentSeason?.endDate ?? ''} />
              <p className="text-sm text-white/60">
                {selected.currentSeason
                  ? `Season: ${selected.currentSeason.startDate} → ${selected.currentSeason.endDate}`
                  : 'No current season data available — cannot create tournament yet.'}
              </p>
            </>
          )}
          <button
            type="submit"
            disabled={createPending || !selected?.currentSeason}
            className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {createPending ? 'Creating…' : 'Create & Sync Fixtures'}
          </button>
          {createState?.error && <p className="text-sm text-red-400">{createState.error}</p>}
          {createState?.success && <p className="text-sm text-green-400">Created. Synced {createState.synced} matches.</p>}
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `src/app/admin/page.tsx`**

Import and render `TournamentManager`. In the page's data fetching, add:

```typescript
import { listTournamentsForAdmin, fetchCompetitionsFromApi } from '@/actions/admin'
import { TournamentManager } from './_tournament-manager'

// In the page component, add to data fetching:
const [tournaments, availableCompetitions] = await Promise.all([
  listTournamentsForAdmin(),
  fetchCompetitionsFromApi().catch(() => []),  // gracefully fail if API is down
])

// Add to JSX:
<TournamentManager tournaments={tournaments} availableCompetitions={availableCompetitions} />
```

- [ ] **Step 4: Update `src/app/admin/_admin-client.tsx`**

Remove the existing global "Sync Matches from API" and "Recalculate All Points" buttons — they are now replaced by per-tournament versions in `TournamentManager`. If any page still calls `syncMatchesFromApi` globally, leave it as a fallback for now and note it for cleanup.

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/actions/admin.ts src/app/admin/
git commit -m "feat(admin): per-tournament sync, archive, recalculate, and add-from-API flow"
```

---

## Task 6: Navbar tournament switcher

**Files:**
- Create: `src/components/tournament-switcher.tsx`
- Modify: `src/components/navbar.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `getActiveTournaments()`, `getSelectedTournament()` from `@/lib/tournament`; `setSelectedTournament` from `@/actions/tournament`; `getSession()` from `@/lib/session`
- Produces: `<TournamentSwitcher>` client component — renders a dropdown when 2+ active tournaments, nothing when 0 or 1

- [ ] **Step 1: Create `src/components/tournament-switcher.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { setSelectedTournament } from '@/actions/tournament'
import type { Tournament } from '@prisma/client'

interface Props {
  tournaments: Tournament[]
  selectedId: number | null
}

export function TournamentSwitcher({ tournaments, selectedId }: Props) {
  const [isPending, startTransition] = useTransition()

  if (tournaments.length <= 1) return null

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value)
    startTransition(() => { setSelectedTournament(id) })
  }

  return (
    <select
      value={selectedId ?? tournaments[0]?.id ?? ''}
      onChange={handleChange}
      disabled={isPending}
      className="rounded bg-white/10 px-2 py-1 text-sm text-white border border-white/20 hover:bg-white/20 disabled:opacity-50"
    >
      {tournaments.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Update `src/app/layout.tsx`**

Pass tournament data to Navbar:

```typescript
import { getActiveTournaments, getSelectedTournament } from '@/lib/tournament'
import { getSession } from '@/lib/session'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  const theme = user?.theme === 'LIGHT' ? 'light' : 'dark'

  const session = await getSession()
  const [activeTournaments, selectedTournament] = await Promise.all([
    getActiveTournaments(),
    getSelectedTournament(session),
  ])

  return (
    <html lang="en" className={theme}>
      <body className={`${inter.className} bg-[#0A1628] text-white`}>
        <Navbar
          activeTournaments={activeTournaments}
          selectedTournamentId={selectedTournament?.id ?? null}
          isArchivedView={selectedTournament?.isArchived ?? false}
        />
        <main className="mx-auto w-full max-w-[90rem] px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Update `src/components/navbar.tsx`**

Add props and render `TournamentSwitcher`:

```typescript
import { TournamentSwitcher } from './tournament-switcher'
import type { Tournament } from '@prisma/client'

interface NavbarProps {
  activeTournaments?: Tournament[]
  selectedTournamentId?: number | null
  isArchivedView?: boolean
}

export async function Navbar({ activeTournaments = [], selectedTournamentId = null, isArchivedView = false }: NavbarProps) {
  // ... existing navbar content ...
  // Add TournamentSwitcher somewhere visible in the navbar, e.g. next to the logo:
  // <TournamentSwitcher tournaments={activeTournaments} selectedId={selectedTournamentId} />
}
```

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament-switcher.tsx src/components/navbar.tsx src/app/layout.tsx
git commit -m "feat(nav): tournament switcher dropdown in navbar (hidden when ≤1 active tournament)"
```

---

## Task 7: Page scoping — filter all pages by selected tournament

**Files:**
- Create: `src/lib/selected-tournament.ts` — shared helper to get current tournament in server components
- Modify: `src/app/predictions/page.tsx`
- Modify: `src/app/results/page.tsx`
- Modify: `src/app/leaderboard/page.tsx`
- Modify: `src/app/tournament/page.tsx`
- Modify: `src/app/live/page.tsx`
- Modify: `src/app/matches/[matchId]/page.tsx`
- Modify: `src/app/championships/page.tsx`
- Modify: `src/components/championship-selector.tsx`

**Interfaces:**
- Produces: `getCurrentTournament(): Promise<Tournament | null>` — reads session + resolves tournament, usable in any server component

- [ ] **Step 1: Create `src/lib/selected-tournament.ts`**

```typescript
import { getSession } from '@/lib/session'
import { getSelectedTournament } from '@/lib/tournament'
import type { Tournament } from '@prisma/client'

export async function getCurrentTournament(): Promise<Tournament | null> {
  const session = await getSession()
  return getSelectedTournament(session)
}
```

- [ ] **Step 2: Update `src/app/predictions/page.tsx`**

Add tournament filter to the match query. Find where matches are fetched (look for `prisma.match.findMany`) and add:

```typescript
import { getCurrentTournament } from '@/lib/selected-tournament'

// In the page component, before fetching matches:
const tournament = await getCurrentTournament()
const tournamentId = tournament?.id

// Add to every prisma.match.findMany where clause:
where: { ...existingWhere, ...(tournamentId ? { tournamentId } : {}) }
```

- [ ] **Step 3: Update `src/app/results/page.tsx`** — same pattern as Step 2.

- [ ] **Step 4: Update `src/app/leaderboard/page.tsx`**

Filter championships to those belonging to the current tournament:

```typescript
const tournament = await getCurrentTournament()
// When fetching championships for the selector:
where: { ...(tournament ? { tournamentId: tournament.id } : {}) }
```

- [ ] **Step 5: Update `src/app/tournament/page.tsx`**

```typescript
const tournament = await getCurrentTournament()
// Filter knockoutMatches and groupMatches by tournamentId:
const allMatches = await prisma.match.findMany({
  where: { ...(tournament ? { tournamentId: tournament.id } : {}) },
  orderBy: { kickoff: 'asc' },
})
```

- [ ] **Step 6: Update `src/app/live/page.tsx`** — same pattern: filter `LIVE` matches by `tournamentId`.

- [ ] **Step 7: Update `src/app/matches/[matchId]/page.tsx`** — no filter needed (match is looked up by id), but verify the match's `tournamentId` matches the selected tournament to prevent cross-tournament URL access. If it doesn't match, redirect to `/`.

- [ ] **Step 8: Update `src/app/championships/page.tsx`**

Filter championship list to current tournament:

```typescript
const tournament = await getCurrentTournament()
where: { ...(tournament ? { tournamentId: tournament.id } : {}) }
```

- [ ] **Step 9: Update `src/components/championship-selector.tsx`**

If the selector fetches championships itself, pass `tournamentId` as a filter. If it receives championships as props, the prop source (the page) already filters them after Step 8.

- [ ] **Step 10: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/lib/selected-tournament.ts src/app/ src/components/championship-selector.tsx
git commit -m "feat(pages): scope all pages to selected tournament via tournamentId filter"
```

---

## Task 8: Profile — past tournaments history

**Files:**
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/profile/_profile-client.tsx` (if past tournaments section needs client interactivity; otherwise profile/page.tsx only)

**Interfaces:**
- Consumes: `getTournamentForUser()` from `@/lib/tournament`; `prisma` from `@/lib/db`; `requireAuth()` from `@/lib/auth`
- Produces: "Past Tournaments" section on profile showing archived tournaments the user participated in, with final rank and link

- [ ] **Step 1: Add past tournaments query in `src/app/profile/page.tsx`**

```typescript
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// In the page, after requireAuth():
const session = await requireAuth()

const pastTournaments = await prisma.tournament.findMany({
  where: {
    isArchived: true,
    championships: {
      some: {
        members: { some: { userId: session.userId } },
      },
    },
  },
  include: {
    championships: {
      where: { members: { some: { userId: session.userId } } },
      select: { id: true, name: true },
    },
  },
  orderBy: { endDate: 'desc' },
})
```

- [ ] **Step 2: Add Past Tournaments section to profile JSX**

In the profile page JSX, after the existing profile fields, add:

```tsx
{pastTournaments.length > 0 && (
  <section className="space-y-3">
    <h2 className="text-lg font-semibold text-white">Past Tournaments</h2>
    {pastTournaments.map((t) => (
      <form key={t.id} action={async () => {
        'use server'
        const { setSelectedTournament } = await import('@/actions/tournament')
        // For archived tournaments, we need a separate action that allows archived selection
        // Use setSelectedArchivedTournament (see below)
      }}>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-white">{t.name}</p>
            <p className="text-sm text-white/50">{t.season}</p>
            <p className="text-xs text-white/40">{t.championships.map(c => c.name).join(', ')}</p>
          </div>
          <button type="submit"
            className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20">
            View History →
          </button>
        </div>
      </form>
    ))}
  </section>
)}
```

- [ ] **Step 3: Add `setSelectedArchivedTournament` to `src/actions/tournament.ts`**

The existing `setSelectedTournament` only allows active tournaments. Add a separate action for profile history access that allows archived ones (but verifies the user participated):

```typescript
export async function setSelectedArchivedTournament(tournamentId: number): Promise<void> {
  const { requireAuth } = await import('@/lib/auth')
  const { getTournamentForUser } = await import('@/lib/tournament')
  const session = await getSession()
  if (!session.userId) return

  const tournament = await getTournamentForUser(tournamentId, session.userId)
  if (!tournament) return  // user didn't participate — deny

  session.selectedTournamentId = tournamentId
  await session.save()
  redirect('/')
}
```

Update the profile page's form action to call `setSelectedArchivedTournament(t.id)`.

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/ src/actions/tournament.ts
git commit -m "feat(profile): past tournaments section with link to archived tournament history"
```

---

## Task 9: Archive banner + read-only enforcement

**Files:**
- Create: `src/components/archive-banner.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/prediction-form.tsx`
- Modify: `src/app/live/page.tsx` (hide from nav when archived)

**Interfaces:**
- Consumes: `isArchivedView` boolean from layout (already passed to Navbar in Task 6)
- Produces: `<ArchiveBanner>` — full-width banner shown on all pages when viewing an archived tournament
- Produces: prediction form disabled when `isArchived = true`

- [ ] **Step 1: Create `src/components/archive-banner.tsx`**

```tsx
import { setSelectedTournament } from '@/actions/tournament'

interface Props {
  tournamentName: string
  firstActiveTournamentId: number | null
}

export function ArchiveBanner({ tournamentName, firstActiveTournamentId }: Props) {
  return (
    <div className="w-full bg-amber-900/40 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-sm">
      <span className="text-amber-300">
        Viewing archived tournament: <strong>{tournamentName}</strong> — results are read-only.
      </span>
      {firstActiveTournamentId && (
        <form action={async () => {
          'use server'
          await setSelectedTournament(firstActiveTournamentId)
        }}>
          <button type="submit" className="text-amber-200 underline hover:text-white">
            Back to active tournament
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render ArchiveBanner in `src/app/layout.tsx`**

```tsx
import { ArchiveBanner } from '@/components/archive-banner'

// In the layout, after <Navbar>:
{selectedTournament?.isArchived && (
  <ArchiveBanner
    tournamentName={selectedTournament.name}
    firstActiveTournamentId={activeTournaments.find(t => !t.isArchived)?.id ?? null}
  />
)}
```

- [ ] **Step 3: Make prediction form read-only for archived tournaments**

In `src/components/prediction-form.tsx`, the component receives match and championship props. Add a prop `isArchived?: boolean`:

```tsx
interface PredictionFormProps {
  // ... existing props ...
  isArchived?: boolean
}

export function PredictionForm({ ..., isArchived = false }: PredictionFormProps) {
  if (isArchived) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white/60 text-sm">
        Predictions locked — tournament has ended.
        {/* Show existing prediction value if present */}
      </div>
    )
  }
  // ... rest of existing form ...
}
```

- [ ] **Step 4: Pass `isArchived` from prediction pages**

In `src/app/predictions/page.tsx` (and any other page that renders `PredictionForm`), pass the flag:

```typescript
const tournament = await getCurrentTournament()
// Pass to PredictionForm:
<PredictionForm ... isArchived={tournament?.isArchived ?? false} />
```

- [ ] **Step 5: Hide Live from nav when archived**

In `src/components/navbar.tsx`, add conditional: if `isArchivedView` (already passed as prop from Task 6), don't render the Live nav link.

```tsx
{!isArchivedView && <NavLink href="/live">Live</NavLink>}
```

- [ ] **Step 6: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/archive-banner.tsx src/components/prediction-form.tsx src/app/layout.tsx src/components/navbar.tsx
git commit -m "feat(archive): banner + read-only predictions for archived tournaments, hide Live nav"
```

---

## Task 10: Tournament page — format dispatcher

**Files:**
- Create: `src/components/match-schedule-list.tsx`
- Modify: `src/app/tournament/page.tsx`

**Interfaces:**
- Consumes: `Tournament.type` string; existing `KnockoutBracket` component; matches from DB
- Produces: `<MatchScheduleList>` — generic match list for non-WC tournament formats
- Produces: tournament page dispatches to `KnockoutBracket` for `WORLD_CUP`, `MatchScheduleList` for all others

- [ ] **Step 1: Create `src/components/match-schedule-list.tsx`**

```tsx
import { formatMatchTime } from '@/lib/format-date'

interface ScheduleMatch {
  id: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest?: string
  awayTeamCrest?: string
  homeScore: number | null
  awayScore: number | null
  status: string
  stage: string
  kickoff: string
}

interface Props {
  matches: ScheduleMatch[]
  timezone: string
}

export function MatchScheduleList({ matches, timezone }: Props) {
  const byStage = matches.reduce<Record<string, ScheduleMatch[]>>((acc, m) => {
    acc[m.stage] = acc[m.stage] ?? []
    acc[m.stage].push(m)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      {Object.entries(byStage).map(([stage, stageMatches]) => (
        <section key={stage}>
          <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            {stage.replace(/_/g, ' ')}
          </h3>
          <div className="space-y-2">
            {stageMatches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-white font-medium w-1/3 text-right">{m.homeTeam}</span>
                <span className="text-white/60 text-sm w-1/3 text-center">
                  {m.status === 'FINISHED'
                    ? `${m.homeScore} - ${m.awayScore}`
                    : m.status === 'LIVE'
                    ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0} LIVE`
                    : formatMatchTime(m.kickoff, timezone)}
                </span>
                <span className="text-white font-medium w-1/3">{m.awayTeam}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Update `src/app/tournament/page.tsx`**

Import both components and dispatch based on `tournament.type`:

```typescript
import { MatchScheduleList } from '@/components/match-schedule-list'
import { getCurrentTournament } from '@/lib/selected-tournament'

// In the page:
const tournament = await getCurrentTournament()

// Replace the bracket prop in TournamentTabs with a conditional:
bracket={
  tournament?.type === 'WORLD_CUP'
    ? <KnockoutBracket timezone={timezone} matches={knockoutMatches.map(...)} />
    : <MatchScheduleList
        matches={[...groupMatches, ...knockoutMatches].map((m) => ({
          id: m.id,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          status: m.status,
          stage: m.stage,
          kickoff: m.kickoff.toISOString(),
        }))}
        timezone={timezone}
      />
}
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/match-schedule-list.tsx src/app/tournament/page.tsx
git commit -m "feat(tournament): dispatch to WC bracket or match schedule list based on tournament type"
```

---

## Task 11: Sync scripts + ProphetBot — tournament-aware

**Files:**
- Modify: `scripts/sync-scores.mjs`
- Modify: `scripts/sync-scores.ts` (if it's the TypeScript source — check which one is actually run)
- Modify: `scripts/bot-predict.mjs`

**Interfaces:**
- Consumes: `Tournament` table from DB; `fetchAllMatches(competitionCode, season)` from `@/lib/football-api` (Task 2)
- Produces: sync-scores loops over all active (non-archived) tournaments; bot-predict skips archived tournaments

- [ ] **Step 1: Check which sync script is actually run**

```bash
cat /mnt/sdb/AI/ScoreProphet/package.json | python3 -c "import json,sys; p=json.load(sys.stdin); print(p.get('scripts',{}).get('sync',''))"
```

Use the script referenced in the `sync` npm script for the changes below.

- [ ] **Step 2: Update `scripts/sync-scores.mjs` to loop active tournaments**

Find the section where matches are fetched from the API. Replace the hardcoded competition code with a loop over active tournaments:

```javascript
// Before (find and replace this pattern):
// const matches = await fetchAllMatches()  // or similar

// After — loop all active tournaments:
const { default: Database } = await import('better-sqlite3')
const db = new Database(DB_PATH)

const activeTournaments = db.prepare(
  "SELECT id, competitionCode, season FROM Tournament WHERE isActive = 1 AND isArchived = 0"
).all()

for (const tournament of activeTournaments) {
  console.log(`[sync] Syncing tournament: ${tournament.competitionCode} ${tournament.season}`)
  const matches = await fetchAllMatches(tournament.competitionCode, tournament.season || undefined)
  // ... rest of existing sync logic, but use tournament.id for tournamentId on upsert ...
  for (const m of matches) {
    // upsert with tournamentId: tournament.id
    db.prepare(`INSERT INTO Match (..., tournamentId) VALUES (..., ?)
                ON CONFLICT(externalId) DO UPDATE SET ...`)
      .run(..., tournament.id)
  }
}
db.close()
```

- [ ] **Step 3: Update `scripts/bot-predict.mjs` to skip archived tournaments**

In `findMatchesToPredict`, the query already filters by `status = 'SCHEDULED'` and `kickoff <= cutoff`. Add a JOIN to exclude matches from archived tournaments:

```javascript
// Find the matches query and add:
const matches = db.prepare(`
  SELECT m.id, m.externalId, m.homeTeam, m.awayTeam, m.kickoff,
         m.stage, m."group", m.headToHeadJson, m.competitionCode
  FROM Match m
  JOIN Tournament t ON t.id = m.tournamentId
  WHERE m.status = 'SCHEDULED'
    AND m.kickoff <= ?
    AND m.kickoff > datetime('now')
    AND t.isActive = 1
    AND t.isArchived = 0
`).all(cutoff)
```

- [ ] **Step 4: Test sync script dry run**

```bash
cd /mnt/sdb/AI/ScoreProphet
node scripts/sync-scores.mjs 2>&1 | head -20
```

Expected: logs showing "Syncing tournament: WC 2026", no crashes.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat(scripts): sync-scores loops active tournaments, bot-predict skips archived"
git push
```

---

## Self-Review Checklist (completed inline)

**Spec coverage:**
- ✅ Tournament model — Task 1
- ✅ Stage→String — Task 1 + 2
- ✅ Data migration / WC 2026 backfill — Task 1
- ✅ Admin discover from API — Task 5
- ✅ Admin sync/archive/recalculate per tournament — Task 5
- ✅ Navbar switcher (hidden when ≤1 active) — Task 6
- ✅ Session selectedTournamentId — Task 3 + 4
- ✅ All pages scoped to selected tournament — Task 7
- ✅ Profile past tournaments (only if participated) — Task 8
- ✅ Archive banner — Task 9
- ✅ Read-only predictions — Task 9
- ✅ Live hidden for archived — Task 9
- ✅ Tournament bracket dispatcher — Task 10
- ✅ MatchScheduleList fallback — Task 10
- ✅ Sync scripts tournament-aware — Task 11
- ✅ ProphetBot skips archived — Task 11

**Type consistency:** All references to `Tournament`, `getActiveTournaments()`, `getSelectedTournament()`, `setSelectedTournament()`, `getCurrentTournament()` are consistent across tasks.
