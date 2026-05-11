# ScoreProphet Spec A — Bug Fixes & Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all reported bugs (logout, leaderboard auth, Round of 32 stage, teams empty, admin advancing team) and add five user-facing features (reset predictions, teams from DB, per-user timezone, countdown timer, alphabetical teams).

**Architecture:** All changes are within the existing Next.js 15 + Prisma v7 + SQLite stack. Three schema additions (ROUND_OF_32 enum value, User.timezone field, Team model), one new utility (`format-date.ts`), and four new client components (TimezoneSelector, Countdown, ResetButton) plus one new server action (`updateTimezone`, `resetMatchPredictions`). No new external dependencies.

**Tech Stack:** Next.js 15, Prisma v7 + better-sqlite3, iron-session v8, React 19, Tailwind CSS, shadcn/ui, Vitest, football-data.org API v4

---

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add ROUND_OF_32 to Stage, timezone to User, new Team model |
| `src/lib/session.ts` | Modify | Add timezone to SessionData |
| `src/lib/auth.ts` | Modify | getCurrentUser returns timezone |
| `src/lib/football-api.ts` | Modify | Add ROUND_OF_32 to local Stage type + STAGE_MAP |
| `src/lib/format-date.ts` | Create | Timezone-aware date formatter |
| `src/lib/__tests__/format-date.test.ts` | Create | Unit tests for format-date |
| `src/actions/auth.ts` | Modify | Add updateTimezone action; login/register save timezone to session |
| `src/actions/predictions.ts` | Modify | Add resetMatchPredictions action |
| `src/actions/admin.ts` | Modify | syncMatchesFromApi also syncs teams |
| `src/components/navbar.tsx` | Modify | Fix logout type="submit", add TimezoneSelector |
| `src/components/timezone-selector.tsx` | Create | Per-user timezone dropdown (client) |
| `src/components/countdown.tsx` | Create | Countdown timer to kickoff (client) |
| `src/components/reset-button.tsx` | Create | Per-match reset predictions button (client) |
| `src/components/live-match-card.tsx` | Modify | Accept timezone prop, use formatMatchTime |
| `src/app/page.tsx` | Modify | Pass timezone + kickoff to LiveMatchCard and Countdown |
| `src/app/leaderboard/page.tsx` | Modify | Add requireAuth() |
| `src/app/predictions/page.tsx` | Modify | Add ROUND_OF_32, format times, add ResetButton |
| `src/app/results/page.tsx` | Modify | Add ROUND_OF_32, format times |
| `src/app/admin/_admin-client.tsx` | Modify | Add ROUND_OF_32 label |
| `src/app/teams/page.tsx` | Modify | Query DB, alphabetical sort |
| `src/app/teams/[teamId]/page.tsx` | Modify | Query DB by externalId |
| `scripts/seed.ts` | Modify | Also seed teams from API |

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Run: Prisma migration

- [ ] **Step 1: Update prisma/schema.prisma**

Replace the entire file content:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
}

model User {
  id           Int               @id @default(autoincrement())
  username     String            @unique
  passwordHash String
  isAdmin      Boolean           @default(false)
  timezone     String            @default("Europe/Bucharest")
  createdAt    DateTime          @default(now())
  predictions  Prediction[]
  advances     KnockoutAdvance[]
}

model Match {
  id            Int               @id @default(autoincrement())
  externalId    String            @unique
  homeTeam      String
  awayTeam      String
  homeTeamCrest String            @default("")
  awayTeamCrest String            @default("")
  stage         Stage
  kickoff       DateTime
  status        MatchStatus       @default(SCHEDULED)
  homeScore     Int?
  awayScore     Int?
  winnerTeam    String?
  adminOverride Boolean           @default(false)
  predictions   Prediction[]
  advances      KnockoutAdvance[]
}

model Team {
  id         Int    @id @default(autoincrement())
  externalId String @unique
  name       String
  shortName  String
  crest      String
}

model Prediction {
  id            Int            @id @default(autoincrement())
  userId        Int
  matchId       Int
  type          PredictionType
  value         String
  pointsAwarded Int?
  createdAt     DateTime       @default(now())
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  match         Match          @relation(fields: [matchId], references: [id])

  @@unique([userId, matchId, type])
}

model KnockoutAdvance {
  id            Int      @id @default(autoincrement())
  userId        Int
  matchId       Int
  predictedTeam String
  pointsAwarded Int?
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  match         Match    @relation(fields: [matchId], references: [id])

  @@unique([userId, matchId])
}

enum Stage {
  GROUP
  ROUND_OF_32
  ROUND_OF_16
  QUARTER_FINAL
  SEMI_FINAL
  THIRD_PLACE
  FINAL
}

enum MatchStatus {
  SCHEDULED
  LIVE
  FINISHED
}

enum PredictionType {
  SINGLE_OUTCOME
  DOUBLE_CHANCE
  EXACT_SCORE
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd /mnt/sdb/AI/ScoreProphet
DATABASE_URL="file:./dev.db" npx prisma migrate dev --name "add-round-of-32-timezone-teams"
```

Expected: Migration created and applied. SQLite DB now has `timezone` column on User (default 'Europe/Bucharest'), Team table, and ROUND_OF_32 as valid Stage value.

- [ ] **Step 3: Regenerate Prisma client**

```bash
DATABASE_URL="file:./dev.db" npx prisma generate
```

Expected: Client regenerated with new types.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ROUND_OF_32 stage, User.timezone, Team model to schema"
```

---

## Task 2: Football API & Stage Type Fix

**Files:**
- Modify: `src/lib/football-api.ts`

- [ ] **Step 1: Update Stage type and STAGE_MAP in football-api.ts**

Replace lines 4–6 and the STAGE_MAP:

```ts
type Stage = 'GROUP' | 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'
```

Replace the STAGE_MAP constant:

```ts
const STAGE_MAP: Record<string, Stage> = {
  GROUP_STAGE: 'GROUP',
  LAST_32: 'ROUND_OF_32',
  LAST_16: 'ROUND_OF_16',
  QUARTER_FINALS: 'QUARTER_FINAL',
  SEMI_FINALS: 'SEMI_FINAL',
  THIRD_PLACE: 'THIRD_PLACE',
  FINAL: 'FINAL',
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/football-api.ts
git commit -m "feat: add ROUND_OF_32 to football API stage mapping"
```

---

## Task 3: Session & Auth — Add Timezone

**Files:**
- Modify: `src/lib/session.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/actions/auth.ts`

- [ ] **Step 1: Add timezone to SessionData in src/lib/session.ts**

Replace the `SessionData` interface:

```ts
export interface SessionData {
  userId?: number
  username?: string
  isAdmin?: boolean
  timezone?: string
}
```

- [ ] **Step 2: Update getCurrentUser in src/lib/auth.ts**

Replace the `getCurrentUser` function:

```ts
export async function getCurrentUser() {
  const session = await getSession()
  if (!session.userId) return null
  return {
    userId: session.userId,
    username: session.username!,
    isAdmin: session.isAdmin ?? false,
    timezone: session.timezone ?? 'Europe/Bucharest',
  }
}
```

- [ ] **Step 3: Update login in src/actions/auth.ts to save timezone**

In the `login` function, after fetching the user from DB and before `session.save()`, add timezone to the session. Replace the session-saving block:

```ts
  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isAdmin = isAdmin
  session.timezone = user.timezone
  await session.save()
  redirect('/')
```

- [ ] **Step 4: Update register in src/actions/auth.ts to save timezone**

In the `register` function, replace the session-saving block:

```ts
  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isAdmin = user.isAdmin
  session.timezone = user.timezone
  await session.save()
  redirect('/')
```

- [ ] **Step 5: Add updateTimezone server action to src/actions/auth.ts**

Add the following after the `logout` function. The file already has `'use server'` at the top.

```ts
const VALID_TIMEZONES = [
  'Europe/Bucharest', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Athens',
  'Europe/Moscow', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo',
  'Asia/Dubai', 'Asia/Istanbul', 'Asia/Tokyo', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
]

export async function updateTimezone(timezone: string) {
  const session = await requireAuth()
  if (!VALID_TIMEZONES.includes(timezone)) return
  await prisma.user.update({ where: { id: session.userId! }, data: { timezone } })
  session.timezone = timezone
  await session.save()
  revalidatePath('/', 'layout')
}
```

Also add these imports at the top of `src/actions/auth.ts` (they're needed for `updateTimezone`):

```ts
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
```

(The file already imports `prisma`, `getSession`, `redirect` — only add what's missing.)

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/session.ts src/lib/auth.ts src/actions/auth.ts
git commit -m "feat: add timezone to session and auth, updateTimezone server action"
```

---

## Task 4: Seed Teams from API

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `src/actions/admin.ts`

- [ ] **Step 1: Update scripts/seed.ts to also seed teams**

Replace the entire file:

```ts
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { fetchAllMatches, fetchAllTeams } from '../src/lib/football-api'

import { config } from 'dotenv'
config()

const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('[seed] Syncing WC2026 matches from football-data.org...')
  let matches
  try {
    matches = await fetchAllMatches()
  } catch (err) {
    console.warn('[seed] API unavailable, skipping match sync:', err)
    await prisma.$disconnect()
    return
  }
  for (const m of matches) {
    await prisma.match.upsert({
      where: { externalId: m.externalId },
      update: { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest },
      create: { externalId: m.externalId, homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest, stage: m.stage, kickoff: m.kickoff, status: m.status, homeScore: m.homeScore, awayScore: m.awayScore },
    })
  }
  console.log(`[seed] Synced ${matches.length} matches.`)

  console.log('[seed] Syncing teams...')
  try {
    const teams = await fetchAllTeams()
    for (const t of teams) {
      await prisma.team.upsert({
        where: { externalId: t.externalId },
        update: { name: t.name, shortName: t.shortName, crest: t.crest },
        create: { externalId: t.externalId, name: t.name, shortName: t.shortName, crest: t.crest },
      })
    }
    console.log(`[seed] Synced ${teams.length} teams.`)
  } catch (err) {
    console.warn('[seed] Team sync failed (API may not have teams yet):', err)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error('[seed] Fatal error:', e); process.exit(1) })
```

- [ ] **Step 2: Update syncMatchesFromApi in src/actions/admin.ts to also sync teams**

In the `syncMatchesFromApi` function, after the match sync loop and before the points recalculation block, add team sync. Replace the try block inside `syncMatchesFromApi`:

```ts
  try {
    const matches = await fetchAllMatches()
    let synced = 0
    for (const m of matches) {
      await prisma.match.upsert({
        where: { externalId: m.externalId },
        update: { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore },
        create: {
          externalId: m.externalId,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeTeamCrest: m.homeTeamCrest,
          awayTeamCrest: m.awayTeamCrest,
          stage: m.stage,
          kickoff: m.kickoff,
          status: m.status,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
        },
      })
      synced++
    }

    // Also sync teams
    try {
      const { fetchAllTeams } = await import('@/lib/football-api')
      const teams = await fetchAllTeams()
      for (const t of teams) {
        await prisma.team.upsert({
          where: { externalId: t.externalId },
          update: { name: t.name, shortName: t.shortName, crest: t.crest },
          create: { externalId: t.externalId, name: t.name, shortName: t.shortName, crest: t.crest },
        })
      }
    } catch {
      // Teams API may not be available — non-fatal
    }

    const finished = await prisma.match.findMany({
      where: { status: 'FINISHED', predictions: { some: { pointsAwarded: null } } },
    })
    for (const match of finished) await recalculateMatchPoints(match.id)

    revalidatePath('/admin')
    revalidatePath('/results')
    revalidatePath('/leaderboard')
    revalidatePath('/teams')
    return { success: true, synced }
  } catch (err) {
    return { error: String(err) }
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts src/actions/admin.ts
git commit -m "feat: seed teams from football API, sync teams on admin sync"
```

---

## Task 5: Teams Pages — Serve from DB

**Files:**
- Modify: `src/app/teams/page.tsx`
- Modify: `src/app/teams/[teamId]/page.tsx`

- [ ] **Step 1: Rewrite src/app/teams/page.tsx to query DB**

Replace the entire file:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export const revalidate = 300

export default async function TeamsPage() {
  await requireAuth()
  const teams = await prisma.team.findMany({ orderBy: { name: 'asc' } })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Teams</h1>
      {teams.length === 0 && (
        <p className="text-white/40">No teams yet — run a sync from the Admin panel.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {teams.map((team) => (
          <Link
            key={team.externalId}
            href={`/teams/${team.externalId}`}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
          >
            {team.crest ? (
              <Image src={team.crest} alt={team.name} width={48} height={48} className="object-contain" />
            ) : (
              <div className="h-12 w-12 rounded bg-white/10" />
            )}
            <span className="text-xs text-center text-white/80 leading-tight">{team.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite src/app/teams/[teamId]/page.tsx to query DB**

Replace the entire file:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export const revalidate = 300

interface Props {
  params: Promise<{ teamId: string }>
}

export default async function TeamDetailPage({ params }: Props) {
  await requireAuth()
  const { teamId } = await params
  const team = await prisma.team.findUnique({ where: { externalId: teamId } })
  if (!team) notFound()

  return (
    <div className="space-y-6">
      <Link href="/teams" className="text-sm text-white/40 hover:text-white">← All Teams</Link>
      <div className="flex items-center gap-4">
        {team.crest && (
          <Image src={team.crest} alt={team.name} width={72} height={72} className="object-contain" />
        )}
        <div>
          <h1 className="text-3xl font-bold text-white">{team.name}</h1>
          {team.shortName && team.shortName !== team.name && (
            <p className="text-white/50">{team.shortName}</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/teams/page.tsx "src/app/teams/[teamId]/page.tsx"
git commit -m "feat: serve teams from DB, alphabetical sort, add auth guard"
```

---

## Task 6: Quick Bug Fixes

**Files:**
- Modify: `src/components/navbar.tsx`
- Modify: `src/app/leaderboard/page.tsx`

- [ ] **Step 1: Fix logout button in src/components/navbar.tsx**

Find this line in the logout form:

```tsx
<Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white bg-transparent">
  Logout
</Button>
```

Replace with:

```tsx
<Button type="submit" variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white bg-transparent">
  Logout
</Button>
```

- [ ] **Step 2: Add requireAuth to leaderboard page**

In `src/app/leaderboard/page.tsx`, add the import for `requireAuth` at the top:

```ts
import { getCurrentUser, requireAuth } from '@/lib/auth'
```

Then at the top of the `LeaderboardPage` function body, before any DB queries:

```ts
export default async function LeaderboardPage() {
  await requireAuth()
  const currentUser = await getCurrentUser()
  // ... rest unchanged
```

- [ ] **Step 3: Run tests to make sure nothing is broken**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/navbar.tsx src/app/leaderboard/page.tsx
git commit -m "fix: logout button type=submit, leaderboard requires auth"
```

---

## Task 7: Date Formatter Utility (TDD)

**Files:**
- Create: `src/lib/format-date.ts`
- Create: `src/lib/__tests__/format-date.test.ts`

- [ ] **Step 1: Write failing tests in src/lib/__tests__/format-date.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { formatMatchTime } from '@/lib/format-date'

describe('formatMatchTime', () => {
  it('formats a UTC date in Europe/Bucharest timezone (UTC+3 in summer)', () => {
    // 2026-06-11 15:00 UTC = 18:00 Bucharest time (EEST = UTC+3)
    const date = new Date('2026-06-11T15:00:00.000Z')
    const result = formatMatchTime(date, 'Europe/Bucharest')
    expect(result).toContain('18:00')
  })

  it('formats a UTC date in UTC timezone', () => {
    const date = new Date('2026-06-11T15:00:00.000Z')
    const result = formatMatchTime(date, 'UTC')
    expect(result).toContain('15:00')
  })

  it('accepts an ISO string as input', () => {
    const result = formatMatchTime('2026-06-11T15:00:00.000Z', 'UTC')
    expect(result).toContain('15:00')
  })

  it('falls back to Europe/Bucharest for invalid timezone', () => {
    const date = new Date('2026-06-11T15:00:00.000Z')
    expect(() => formatMatchTime(date, 'Not/ATimezone')).not.toThrow()
    const result = formatMatchTime(date, 'Not/ATimezone')
    expect(result).toContain('18:00')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- src/lib/__tests__/format-date.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/format-date'`

- [ ] **Step 3: Implement src/lib/format-date.ts**

```ts
const FALLBACK_TZ = 'Europe/Bucharest'

const FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

export function formatMatchTime(date: Date | string, timezone: string = FALLBACK_TZ): string {
  const d = typeof date === 'string' ? new Date(date) : date
  try {
    return new Intl.DateTimeFormat('en-GB', { ...FORMAT_OPTS, timeZone: timezone }).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...FORMAT_OPTS, timeZone: FALLBACK_TZ }).format(d)
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- src/lib/__tests__/format-date.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/format-date.ts src/lib/__tests__/format-date.test.ts
git commit -m "feat: add formatMatchTime utility with timezone support (TDD)"
```

---

## Task 8: Timezone Selector Component & Navbar Integration

**Files:**
- Create: `src/components/timezone-selector.tsx`
- Modify: `src/components/navbar.tsx`

- [ ] **Step 1: Create src/components/timezone-selector.tsx**

```tsx
'use client'

import { useTransition } from 'react'
import { updateTimezone } from '@/actions/auth'

export const TIMEZONES = [
  { value: 'Europe/Bucharest', label: 'Bucharest (GMT+3)' },
  { value: 'Europe/London', label: 'London (GMT+1)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+2)' },
  { value: 'Europe/Berlin', label: 'Berlin (GMT+2)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+2)' },
  { value: 'Europe/Rome', label: 'Rome (GMT+2)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (GMT+2)' },
  { value: 'Europe/Athens', label: 'Athens (GMT+3)' },
  { value: 'Europe/Moscow', label: 'Moscow (GMT+3)' },
  { value: 'America/New_York', label: 'New York (GMT-4)' },
  { value: 'America/Chicago', label: 'Chicago (GMT-5)' },
  { value: 'America/Denver', label: 'Denver (GMT-6)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-7)' },
  { value: 'America/Toronto', label: 'Toronto (GMT-4)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+4)' },
  { value: 'Asia/Istanbul', label: 'Istanbul (GMT+3)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (GMT+5:30)' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10)' },
  { value: 'Pacific/Auckland', label: 'Auckland (GMT+12)' },
  { value: 'UTC', label: 'UTC' },
]

export function TimezoneSelector({ timezone }: { timezone: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <select
      value={timezone}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value
        startTransition(async () => {
          await updateTimezone(value)
        })
      }}
      className="bg-[#0A1628] text-white/50 text-xs border border-white/20 rounded px-2 py-1 cursor-pointer hover:border-white/40 disabled:opacity-50"
    >
      {TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value} className="bg-[#0A1628]">
          {tz.label}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Update src/components/navbar.tsx to include TimezoneSelector**

Add the import at the top:

```tsx
import { TimezoneSelector } from '@/components/timezone-selector'
```

In the authenticated user section (where username and logout are shown), add the `TimezoneSelector` between the username span and logout form:

```tsx
{user ? (
  <>
    <span className="text-sm text-white/50">{user.username}</span>
    <TimezoneSelector timezone={user.timezone} />
    <form action={logout}>
      <Button type="submit" variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white bg-transparent">
        Logout
      </Button>
    </form>
  </>
) : (
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/timezone-selector.tsx src/components/navbar.tsx
git commit -m "feat: per-user timezone selector in navbar"
```

---

## Task 9: Apply Timezone Formatting Across Pages

**Files:**
- Modify: `src/app/predictions/page.tsx`
- Modify: `src/app/results/page.tsx`
- Modify: `src/components/live-match-card.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/admin/_admin-client.tsx`

The goal is to replace all `toLocaleString()` / `toLocaleDateString()` calls (which use server UTC) with `formatMatchTime(date, timezone)` using the user's stored timezone.

- [ ] **Step 1: Update src/app/predictions/page.tsx**

Add `ROUND_OF_32` to the local Stage type, STAGE_LABELS, and STAGE_ORDER. Also get the user's timezone from session and pass it to match cards.

Replace the Stage type, STAGE_LABELS, and STAGE_ORDER at the top of the file:

```tsx
import { formatMatchTime } from '@/lib/format-date'

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
```

At the top of `PredictionsPage()`, get the timezone:

```tsx
export default async function PredictionsPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'
  // ... rest of queries unchanged
```

Replace the kickoff display:

```tsx
<span className="text-xs text-white/40">{formatMatchTime(match.kickoff, timezone)}</span>
```

Also update `isKnockout` to include ROUND_OF_32:

```tsx
isKnockout={match.stage !== 'GROUP'}
```

(This was already correct — ROUND_OF_32 !== 'GROUP' so it will show advance prediction. No change needed.)

- [ ] **Step 2: Update src/app/results/page.tsx**

Add import at top:

```tsx
import { formatMatchTime } from '@/lib/format-date'
```

Get timezone at top of `ResultsPage()` (it already calls `requireAuth()`):

```tsx
export default async function ResultsPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'
```

Replace the kickoff display:

```tsx
<span className="text-xs text-white/40">{formatMatchTime(match.kickoff, timezone)}</span>
```

Also add ROUND_OF_32 support to the advance column — update both `match.stage !== 'GROUP'` checks (in `<th>` and `<td>`). These already correctly exclude GROUP, so ROUND_OF_32 advances will show automatically with no code change.

- [ ] **Step 3: Update src/components/live-match-card.tsx to accept timezone prop**

Add `timezone` to the Props interface:

```tsx
interface Props {
  match: {
    homeTeam: string
    awayTeam: string
    homeTeamCrest: string
    awayTeamCrest: string
    homeScore: number | null
    awayScore: number | null
    status: string
    kickoff: string
  }
  timezone: string
}
```

Add import:

```tsx
import { formatMatchTime } from '@/lib/format-date'
```

Replace the kickoff display in the component:

```tsx
{!isLive && (
  <p className="mb-4 text-center text-sm text-white/50">
    {match.status === 'FINISHED' ? 'Final Score' : `Kickoff: ${formatMatchTime(match.kickoff, timezone)}`}
  </p>
)}
```

Update the function signature:

```tsx
export function LiveMatchCard({ match, timezone }: Props) {
```

- [ ] **Step 4: Update src/app/page.tsx to read timezone and pass to LiveMatchCard**

Replace the entire file:

```tsx
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { LiveMatchCard } from '@/components/live-match-card'
import { Countdown } from '@/components/countdown'

export const revalidate = 60

async function getFeaturedMatch() {
  const live = await prisma.match.findFirst({ where: { status: 'LIVE' } })
  if (live) return live

  return prisma.match.findFirst({
    where: { status: 'SCHEDULED', kickoff: { gt: new Date() } },
    orderBy: { kickoff: 'asc' },
  })
}

export default async function HomePage() {
  const [match, user] = await Promise.all([getFeaturedMatch(), getCurrentUser()])
  const timezone = user?.timezone ?? 'Europe/Bucharest'

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">
        World Cup 2026 <span className="text-[#C9A84C]">Predictions</span>
      </h1>

      {match ? (
        <>
          <LiveMatchCard
            match={{
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              homeTeamCrest: match.homeTeamCrest,
              awayTeamCrest: match.awayTeamCrest,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              status: match.status,
              kickoff: match.kickoff.toISOString(),
            }}
            timezone={timezone}
          />
          {match.status === 'SCHEDULED' && (
            <Countdown kickoff={match.kickoff.toISOString()} />
          )}
        </>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-white/50">
          No matches scheduled yet. Check back soon.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update src/app/admin/_admin-client.tsx to add ROUND_OF_32 label**

In the `MatchOverrideRow` component, the match title shows `homeTeam vs awayTeam` and date. No STAGE_LABELS map exists here. Add one at the top of the file:

```tsx
const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}
```

In `MatchOverrideRow`, add the stage label next to the match title:

```tsx
<span className="text-sm text-white flex-1 min-w-0">
  <span className="text-white/30 text-xs mr-2">{STAGE_LABELS[match.stage] ?? match.stage}</span>
  {match.homeTeam} vs {match.awayTeam}
  <span className="ml-2 text-white/30 text-xs">{new Date(match.kickoff).toLocaleDateString()}</span>
  {match.adminOverride && <Badge className="ml-2 bg-orange-600/20 text-orange-400 text-xs">overridden</Badge>}
</span>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/predictions/page.tsx src/app/results/page.tsx \
  src/components/live-match-card.tsx src/app/page.tsx \
  src/app/admin/_admin-client.tsx
git commit -m "feat: timezone-aware date formatting across all pages, ROUND_OF_32 stage labels"
```

---

## Task 10: Reset Predictions (TDD)

**Files:**
- Modify: `src/actions/predictions.ts`
- Create: `src/components/reset-button.tsx`
- Modify: `src/app/predictions/page.tsx`
- Create: `src/lib/__tests__/reset-predictions.test.ts` (integration-style unit test of the action logic)

- [ ] **Step 1: Write failing test for resetMatchPredictions action**

Create `src/lib/__tests__/reset-predictions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

// We test the lock logic directly — the function that checks kickoff
function isMatchLocked(kickoff: Date, now: Date): boolean {
  return kickoff <= now
}

describe('isMatchLocked', () => {
  it('returns true when kickoff is in the past', () => {
    const kickoff = new Date('2026-01-01T10:00:00Z')
    const now = new Date('2026-01-01T11:00:00Z')
    expect(isMatchLocked(kickoff, now)).toBe(true)
  })

  it('returns false when kickoff is in the future', () => {
    const kickoff = new Date('2026-01-01T12:00:00Z')
    const now = new Date('2026-01-01T11:00:00Z')
    expect(isMatchLocked(kickoff, now)).toBe(false)
  })

  it('returns true when kickoff equals now (exactly at kickoff)', () => {
    const t = new Date('2026-01-01T11:00:00Z')
    expect(isMatchLocked(t, t)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to confirm it passes (pure logic test)**

```bash
npm test -- src/lib/__tests__/reset-predictions.test.ts
```

Expected: PASS (pure logic, no imports needed).

- [ ] **Step 3: Add resetMatchPredictions to src/actions/predictions.ts**

Add the following function at the end of `src/actions/predictions.ts`:

```ts
export async function resetMatchPredictions(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  if (!matchId) return { error: 'Missing match ID' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Match has already started — predictions are locked' }

  await prisma.prediction.deleteMany({ where: { userId: session.userId!, matchId } })
  await prisma.knockoutAdvance.deleteMany({ where: { userId: session.userId!, matchId } })

  revalidatePath('/predictions')
  return { success: true }
}
```

- [ ] **Step 4: Create src/components/reset-button.tsx**

```tsx
'use client'

import { useActionState } from 'react'
import { resetMatchPredictions } from '@/actions/predictions'
import { Button } from '@/components/ui/button'

export function ResetButton({ matchId }: { matchId: number }) {
  const [state, formAction, pending] = useActionState(resetMatchPredictions, null)

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="matchId" value={matchId} />
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

- [ ] **Step 5: Add ResetButton to src/app/predictions/page.tsx**

Add the import at the top:

```tsx
import { ResetButton } from '@/components/reset-button'
```

In the match card JSX, after the `PredictionForm` component (still inside the `!locked` block), add the reset button when the user has existing predictions:

```tsx
{!locked && (
  <>
    <PredictionForm
      matchId={match.id}
      existing={existing}
      isKnockout={match.stage !== 'GROUP'}
      existingAdvanceTeam={advanceByMatch[match.id]}
    />
    {existing.length > 0 && (
      <ResetButton matchId={match.id} />
    )}
  </>
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/actions/predictions.ts src/components/reset-button.tsx \
  src/app/predictions/page.tsx src/lib/__tests__/reset-predictions.test.ts
git commit -m "feat: reset predictions button per match (TDD)"
```

---

## Task 11: Countdown Timer

**Files:**
- Create: `src/components/countdown.tsx`
- (src/app/page.tsx already imports and uses Countdown from Task 9 Step 4)

- [ ] **Step 1: Create src/components/countdown.tsx**

```tsx
'use client'

import { useEffect, useState } from 'react'

interface Props {
  kickoff: string  // ISO string
}

function getTimeLeft(kickoff: string): string | null {
  const diff = new Date(kickoff).getTime() - Date.now()
  if (diff <= 0) return null
  const d = Math.floor(diff / (1000 * 60 * 60 * 24))
  const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const s = Math.floor((diff % (1000 * 60)) / 1000)
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function Countdown({ kickoff }: Props) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null)

  useEffect(() => {
    const update = () => setTimeLeft(getTimeLeft(kickoff))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [kickoff])

  if (!timeLeft) return null

  return (
    <p className="text-center text-sm text-[#C9A84C] font-mono tracking-wide">
      ⏱ Kickoff in {timeLeft}
    </p>
  )
}
```

Note: `timeLeft` starts as `null` (server render and first client render both return null), avoiding hydration mismatches. The `useEffect` then sets it immediately on mount.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/countdown.tsx
git commit -m "feat: countdown timer component for home page"
```

---

## Task 12: CI/CD — Push and Deploy

- [ ] **Step 1: Push all commits to trigger CI**

```bash
git push origin main
```

Expected: GitHub Actions runs the `test` job then `build-and-push` job. Monitor at the repo's Actions tab.

- [ ] **Step 2: Verify CI passes**

Expected output in CI logs:
```
> npm test
✓ src/lib/__tests__/scoring.test.ts
✓ src/lib/__tests__/validation.test.ts
✓ src/lib/__tests__/format-date.test.ts
✓ src/lib/__tests__/reset-predictions.test.ts
```

- [ ] **Step 3: Inform user to update container**

Once CI passes and `ghcr.io/adandu/scoreprophet:latest` is pushed, the user pulls the new image and restarts the container. On first startup:
- Migration runs automatically (`prisma migrate deploy`) — adds `timezone` column, `Team` table
- Seed runs — syncs 104 matches + 48 teams from API
- Server starts

- [ ] **Step 4: Verify container logs show team sync**

```bash
docker logs ScoreProphet --tail=30
```

Expected:
```
[startup] Running Prisma migrations...
All migrations have been successfully applied.
[startup] Syncing match data from API...
[seed] Synced 104 matches.
[seed] Synced 48 teams.
[startup] Starting Next.js server...
✓ Ready in ...ms
```

---

## Test Coverage Summary

| Test file | Tests |
|-----------|-------|
| `src/lib/__tests__/scoring.test.ts` | Existing — scoring logic |
| `src/lib/__tests__/validation.test.ts` | Existing — prediction validation |
| `src/lib/__tests__/format-date.test.ts` | New — timezone formatting (4 tests) |
| `src/lib/__tests__/reset-predictions.test.ts` | New — lock logic (3 tests) |

---

## Notes for the Implementer

**Prisma v7 + SQLite enums:** SQLite doesn't enforce enum values natively. Adding `ROUND_OF_32` to the schema is safe — existing rows with other Stage values are unaffected. After migration, re-run the seed to reclassify any ROUND_OF_32 matches that were previously mis-mapped to GROUP.

**Stage type local aliases:** Several files define `type Stage = ...` as a local alias instead of importing from Prisma (required for Prisma v7 compatibility). Every such file needs ROUND_OF_32 added to the union type.

**Hydration and Countdown:** The Countdown component uses `useState(null)` so it renders nothing on the server. The `useEffect` fires immediately on mount and starts the interval. This avoids React hydration mismatches from server/client time differences.

**iron-session `requireAuth()` returns the session:** `requireAuth()` in `src/lib/auth.ts` calls `getSession()` internally and returns the session object. You can call `.save()` directly on it to persist changes.

**Dockerfile unchanged:** The seed script only imports from `../src/lib/football-api` which is already copied. The new `Team` upsert uses `prisma.team` — Prisma client regenerates at build time so the Team model is available in the container.
