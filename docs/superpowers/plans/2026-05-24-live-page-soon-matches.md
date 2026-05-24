# Live Page — Show Matches 15 Minutes Before Kickoff

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the Live page and navbar Live button 15 minutes before kickoff, displaying full match details (lineups, formation, bench) even before the API reports `IN_PLAY`.

**Architecture:** A `MATCH_SOON_MS` constant (15 min) is added to `football-api.ts`. The live page queries the DB for `SCHEDULED` matches within that window, merges them with API live matches (deduplicating by `externalId`), and passes all to `LiveMatchPanel`. The panel already calls `fetchLiveMatchDetails` per match (which works for any status), so lineup data renders automatically once submitted. The score header shows "Starting soon" for pre-kickoff matches instead of the "Live" pulse. The navbar `hasLiveMatch` query gains the same OR condition.

**Tech Stack:** Next.js 15 (App Router), Prisma + SQLite, Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/lib/football-api.ts` | Add exported `MATCH_SOON_MS` constant |
| `src/components/navbar.tsx` | Update `hasLiveMatch` query to include soon matches |
| `src/app/live/page.tsx` | Merge DB soon matches with API live; update panel badge/score |
| `src/lib/__tests__/football-api.test.ts` | Test for `MATCH_SOON_MS` value |

---

### Task 1: Add `MATCH_SOON_MS` constant

**Files:**
- Modify: `src/lib/football-api.ts` (top of file, after imports)
- Test: `src/lib/__tests__/football-api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/football-api.test.ts`:

```typescript
import { MATCH_SOON_MS } from '@/lib/football-api'

describe('MATCH_SOON_MS', () => {
  it('equals 15 minutes in milliseconds', () => {
    expect(MATCH_SOON_MS).toBe(15 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx vitest run src/lib/__tests__/football-api.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `MATCH_SOON_MS` is not exported

- [ ] **Step 3: Add the constant to `football-api.ts`**

Add after the existing imports, before `const BASE_URL`:

```typescript
export const MATCH_SOON_MS = 15 * 60 * 1000
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/football-api.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /mnt/sdb/AI/ScoreProphet add src/lib/football-api.ts src/lib/__tests__/football-api.test.ts
git -C /mnt/sdb/AI/ScoreProphet commit -m "feat: export MATCH_SOON_MS constant (15 min before kickoff)"
```

---

### Task 2: Update navbar `hasLiveMatch` to include soon matches

**Files:**
- Modify: `src/components/navbar.tsx` (line 21)

- [ ] **Step 1: Replace the `hasLiveMatch` query**

Current code at line 21:
```typescript
const hasLiveMatch = await prisma.match.count({ where: { status: 'LIVE' } }).then((n) => n > 0)
```

Replace with:
```typescript
const now = new Date()
const hasLiveMatch = await prisma.match.count({
  where: {
    OR: [
      { status: 'LIVE' },
      { status: 'SCHEDULED', kickoff: { gt: now, lte: new Date(now.getTime() + MATCH_SOON_MS) } },
    ],
  },
}).then((n) => n > 0)
```

- [ ] **Step 2: Add the import for `MATCH_SOON_MS`**

Add to the existing import from `@/lib/football-api` (or add a new import line if none exists):
```typescript
import { MATCH_SOON_MS } from '@/lib/football-api'
```

- [ ] **Step 3: Type-check**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git -C /mnt/sdb/AI/ScoreProphet add src/components/navbar.tsx
git -C /mnt/sdb/AI/ScoreProphet commit -m "feat: show Live nav link 15 min before kickoff"
```

---

### Task 3: Update live page to include soon matches and update panel

**Files:**
- Modify: `src/app/live/page.tsx`

The live page currently calls `fetchLiveMatches()` (API, `IN_PLAY` only) then renders each via `LiveMatchPanel`. We need to:
1. Also query the DB for `SCHEDULED` matches within 15 min.
2. Merge the two lists (API live takes precedence; dedup by `externalId`).
3. Change `LiveMatchPanel`'s prop type from `NormalizedMatch` to a slim type since it only uses `externalId`, `homeTeam`, and `awayTeam`.
4. Show "Starting soon" badge and `- : -` score for pre-kickoff matches.

- [ ] **Step 1: Replace the full content of `src/app/live/page.tsx`**

```typescript
import Image from 'next/image'
import { fetchLiveMatches, fetchLiveMatchDetails, MATCH_SOON_MS } from '@/lib/football-api'
import { PitchFormation } from '@/components/pitch-formation'
import { LivePageRefresh } from '@/components/live-page-refresh'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const revalidate = 5

interface SlimMatch {
  externalId: string
  homeTeam: string
  awayTeam: string
}

export default async function LivePage() {
  await requireAuth()

  // 1. API live matches
  let apiMatches: SlimMatch[] = []
  try {
    const live = await fetchLiveMatches()
    apiMatches = live.map((m) => ({ externalId: m.externalId, homeTeam: m.homeTeam, awayTeam: m.awayTeam }))
  } catch { /* fall through */ }

  // 2. DB matches starting within 15 min
  const now = new Date()
  const soonCutoff = new Date(now.getTime() + MATCH_SOON_MS)
  const dbSoon = await prisma.match.findMany({
    where: { status: 'SCHEDULED', kickoff: { gt: now, lte: soonCutoff } },
    orderBy: { kickoff: 'asc' },
    select: { externalId: true, homeTeam: true, awayTeam: true },
  }).catch(() => [])

  // 3. Merge — API live takes precedence; deduplicate by externalId
  const liveIds = new Set(apiMatches.map((m) => m.externalId))
  const soonOnly = dbSoon.filter((m) => !liveIds.has(m.externalId))
  const allMatches: SlimMatch[] = [...apiMatches, ...soonOnly]

  if (allMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="text-2xl font-bold text-white">No live match right now</h1>
        <p className="text-white/50">Check back when a match is in play.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <LivePageRefresh isLive={true} />
      {allMatches.map((match) => (
        <LiveMatchPanel key={match.externalId} match={match} />
      ))}
    </div>
  )
}

async function LiveMatchPanel({ match }: { match: SlimMatch }) {
  let details
  try {
    details = await fetchLiveMatchDetails(match.externalId)
  } catch {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-5xl">⚽</div>
        <h2 className="text-2xl font-bold text-white">{match.homeTeam} vs {match.awayTeam}</h2>
        <p className="text-white/50">Live match data is unavailable. Please try again shortly.</p>
      </div>
    )
  }

  const isLive = details.status === 'LIVE'
  const homeId = details.homeTeam.id
  const awayId = details.awayTeam.id
  const homeScore = details.homeScore
  const awayScore = details.awayScore

  const homeGoals = details.goals.filter((g) => g.teamId === homeId)
  const awayGoals = details.goals.filter((g) => g.teamId === awayId)
  const homeBookings = details.bookings.filter((b) => b.teamId === homeId)
  const awayBookings = details.bookings.filter((b) => b.teamId === awayId)
  const homeSubs = details.substitutions.filter((s) => s.teamId === homeId)
  const awaySubs = details.substitutions.filter((s) => s.teamId === awayId)

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0a1628] px-8 py-5">
        <TeamBlock name={details.homeTeam.name} crest={details.homeTeam.crest} />

        <div className="flex flex-col items-center gap-1.5">
          {isLive ? (
            <div className="flex items-center gap-2 rounded-full bg-red-950 px-3 py-0.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-red-300">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-amber-950 px-3 py-0.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Starting soon</span>
            </div>
          )}
          <div className="text-5xl font-black tabular-nums text-[#C9A84C]">
            {isLive
              ? <>{homeScore ?? 0} <span className="text-white/30">:</span> {awayScore ?? 0}</>
              : <span className="text-3xl text-white/30">vs</span>
            }
          </div>
          {details.minute !== null && (
            <div className="text-sm text-white/50">{details.minute}&apos;</div>
          )}
          {details.venue && (
            <div className="text-xs text-white/30">{details.venue}</div>
          )}
        </div>

        <TeamBlock name={details.awayTeam.name} crest={details.awayTeam.crest} />
      </div>

      {/* 3D Pitch */}
      <PitchFormation
        homeTeam={details.homeTeam}
        awayTeam={details.awayTeam}
        goals={details.goals}
        bookings={details.bookings}
        substitutions={details.substitutions}
        referee={details.referee}
        homePossession={details.homePossession}
      />

      {/* Goals */}
      {(homeGoals.length > 0 || awayGoals.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            ⚽ Goals
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-green-400">⚽</span>
                  <span className="font-semibold text-white/80">{g.playerName}</span>
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{g.minute}&apos;</span>
                  <span className="font-semibold text-white/80">{g.playerName}</span>
                  <span className="text-blue-400">⚽</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {(homeBookings.length > 0 || awayBookings.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            🟨 Cards
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span>{b.card === 'YELLOW_CARD' ? '🟨' : '🟥'}</span>
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <span className="text-xs font-bold text-white/40">{b.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awayBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-bold text-white/40">{b.minute}&apos;</span>
                  <span className="font-semibold text-white/80">{b.playerName}</span>
                  <span>{b.card === 'YELLOW_CARD' ? '🟨' : '🟥'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Substitutions */}
      {(homeSubs.length > 0 || awaySubs.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]">
          <div className="border-b border-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/40">
            🔄 Substitutions
          </div>
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="flex flex-col gap-2 p-3">
              {homeSubs.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm">
                  <span className="font-bold text-green-400">↑</span>
                  <span className="font-semibold text-white/80">{s.playerInName}</span>
                  <span className="font-bold text-red-400">↓</span>
                  <span className="text-white/50">{s.playerOutName}</span>
                  <span className="ml-auto text-xs font-bold text-white/40">{s.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5" />
            <div className="flex flex-col items-end gap-2 p-3">
              {awaySubs.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs font-bold text-white/40">{s.minute}&apos;</span>
                  <span className="text-white/50">{s.playerOutName}</span>
                  <span className="font-bold text-red-400">↓</span>
                  <span className="font-semibold text-white/80">{s.playerInName}</span>
                  <span className="font-bold text-blue-400">↑</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamBlock({ name, crest }: { name: string; crest: string }) {
  return (
    <div className="flex min-w-[120px] flex-col items-center gap-2">
      {crest ? (
        <Image src={crest} alt={name} width={68} height={68} className="rounded" />
      ) : (
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-white/10 bg-white/10 text-4xl">⚽</div>
      )}
      <span className="text-center text-base font-bold text-white">{name}</span>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: all passing (no regressions)

- [ ] **Step 4: Commit**

```bash
git -C /mnt/sdb/AI/ScoreProphet add src/app/live/page.tsx
git -C /mnt/sdb/AI/ScoreProphet commit -m "feat: show live page 15 min before kickoff with Starting soon badge"
```
