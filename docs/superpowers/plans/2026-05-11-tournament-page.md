# Tournament Page (Spec B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected `/tournament` page showing World Cup 2026 group standings and a converging knockout bracket with the trophy at the centre.

**Architecture:** Add `group String?` to the Match schema and populate it on sync. Compute group standings from finished matches in a pure utility function. Render a tab-switched page: Group Stage tab (12 group cards in a responsive grid) and Bracket tab (converging left↔right bracket with trophy+Final in the centre column). All client components, server page passes data down.

**Tech Stack:** Next.js 15, Prisma v7, SQLite, Tailwind CSS, Vitest — no new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `prisma/schema.prisma` | Modify | Add `group String?` to Match |
| `src/lib/football-api.ts` | Modify | Add `group` to NormalizedMatch + normalizeMatch() |
| `scripts/seed.ts` | Modify | Add `group` to match upsert create payload |
| `src/actions/admin.ts` | Modify | Add `group` to match upsert create payload in syncMatchesFromApi |
| `src/lib/standings.ts` | Create | Pure functions: computeGroupStandings, getBest8ThirdPlace |
| `src/lib/__tests__/standings.test.ts` | Create | Unit tests for standings logic |
| `src/components/navbar.tsx` | Modify | Add Tournament nav link |
| `src/app/tournament/page.tsx` | Create | Server component, requireAuth, passes data to tabs |
| `src/components/tournament-tabs.tsx` | Create | 'use client' tab switcher (groups / bracket) |
| `src/components/group-stage-tab.tsx` | Create | 'use client' group standings grid |
| `src/components/knockout-bracket.tsx` | Create | 'use client' converging bracket |
| `public/trophy.webp` | Create | World Cup trophy image (downloaded from Wikimedia Commons) |

---

### Task 1: Schema migration + API group field

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/football-api.ts`
- Modify: `scripts/seed.ts`
- Modify: `src/actions/admin.ts`

- [ ] **Step 1: Add `group` to Prisma schema**

In `prisma/schema.prisma`, add `group String?` to the Match model after the `stage` field:

```prisma
model Match {
  id            Int               @id @default(autoincrement())
  externalId    String            @unique
  homeTeam      String
  awayTeam      String
  homeTeamCrest String            @default("")
  awayTeamCrest String            @default("")
  stage         Stage
  group         String?
  kickoff       DateTime
  status        MatchStatus       @default(SCHEDULED)
  homeScore     Int?
  awayScore     Int?
  winnerTeam    String?
  adminOverride Boolean           @default(false)
  predictions   Prediction[]
  advances      KnockoutAdvance[]
}
```

- [ ] **Step 2: Run migration**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx prisma migrate dev --name add_match_group
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 3: Add `group` to NormalizedMatch interface and normalizeMatch()**

In `src/lib/football-api.ts`, update the interface and the normalizer:

```typescript
export interface NormalizedMatch {
  externalId: string
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  stage: Stage
  group: string | null
  kickoff: Date
  status: MatchStatus
  homeScore: number | null
  awayScore: number | null
}
```

In `normalizeMatch()`, add the group field. The football-data.org API returns `m.group` as e.g. `"GROUP_A"` for group matches and `null` for knockout matches:

```typescript
function normalizeMatch(m: any): NormalizedMatch {
  return {
    externalId: String(m.id),
    homeTeam: m.homeTeam?.name ?? 'TBD',
    awayTeam: m.awayTeam?.name ?? 'TBD',
    homeTeamCrest: m.homeTeam?.crest ?? '',
    awayTeamCrest: m.awayTeam?.crest ?? '',
    stage: STAGE_MAP[m.stage] ?? 'GROUP',
    group: m.group ?? null,
    kickoff: new Date(m.utcDate),
    status: STATUS_MAP[m.status] ?? 'SCHEDULED',
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
  }
}
```

- [ ] **Step 4: Update seed.ts match upsert to store group**

In `scripts/seed.ts`, add `group: m.group` to the `create` payload (not `update` — the group never changes):

```typescript
await prisma.match.upsert({
  where: { externalId: m.externalId },
  update: { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest },
  create: {
    externalId: m.externalId,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeTeamCrest: m.homeTeamCrest,
    awayTeamCrest: m.awayTeamCrest,
    stage: m.stage,
    group: m.group,
    kickoff: m.kickoff,
    status: m.status,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  },
})
```

- [ ] **Step 5: Update admin.ts syncMatchesFromApi match upsert to store group**

In `src/actions/admin.ts`, inside `syncMatchesFromApi`, add `group: m.group` to the `create` payload:

```typescript
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
    group: m.group,
    kickoff: m.kickoff,
    status: m.status,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  },
})
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/football-api.ts scripts/seed.ts src/actions/admin.ts
git commit -m "feat: add group field to Match schema and sync pipeline"
```

---

### Task 2: Group standings utility (TDD)

**Files:**
- Create: `src/lib/standings.ts`
- Create: `src/lib/__tests__/standings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/standings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeGroupStandings, getBest8ThirdPlace } from '@/lib/standings'

const finishedMatch = (group: string, home: string, away: string, homeScore: number, awayScore: number) => ({
  group,
  stage: 'GROUP' as const,
  status: 'FINISHED' as const,
  homeTeam: home,
  awayTeam: away,
  homeScore,
  awayScore,
})

const scheduledMatch = (group: string, home: string, away: string) => ({
  group,
  stage: 'GROUP' as const,
  status: 'SCHEDULED' as const,
  homeTeam: home,
  awayTeam: away,
  homeScore: null,
  awayScore: null,
})

describe('computeGroupStandings', () => {
  it('computes correct W/D/L/GF/GA/GD/Pts for a complete group', () => {
    const matches = [
      finishedMatch('GROUP_A', 'Brazil', 'France', 2, 1),
      finishedMatch('GROUP_A', 'Germany', 'Japan', 0, 0),
      finishedMatch('GROUP_A', 'Brazil', 'Germany', 3, 0),
      finishedMatch('GROUP_A', 'France', 'Japan', 2, 0),
      finishedMatch('GROUP_A', 'Brazil', 'Japan', 1, 0),
      finishedMatch('GROUP_A', 'France', 'Germany', 1, 1),
    ]
    const result = computeGroupStandings(matches)
    const groupA = result['GROUP_A']

    expect(groupA[0]).toMatchObject({ team: 'Brazil', w: 3, d: 0, l: 0, gf: 6, ga: 1, gd: 5, pts: 9 })
    expect(groupA[1]).toMatchObject({ team: 'France', w: 1, d: 1, l: 1, gf: 4, ga: 3, gd: 1, pts: 4 })
    expect(groupA[2]).toMatchObject({ team: 'Germany', w: 0, d: 2, l: 1, gf: 1, ga: 4, gd: -3, pts: 2 })
    expect(groupA[3]).toMatchObject({ team: 'Japan', w: 0, d: 1, l: 2, gf: 0, ga: 3, gd: -3, pts: 1 })
  })

  it('marks top 2 as advancing when all group matches are FINISHED', () => {
    const matches = [
      finishedMatch('GROUP_A', 'Brazil', 'France', 2, 1),
      finishedMatch('GROUP_A', 'Germany', 'Japan', 0, 0),
      finishedMatch('GROUP_A', 'Brazil', 'Germany', 3, 0),
      finishedMatch('GROUP_A', 'France', 'Japan', 2, 0),
      finishedMatch('GROUP_A', 'Brazil', 'Japan', 1, 0),
      finishedMatch('GROUP_A', 'France', 'Germany', 1, 1),
    ]
    const result = computeGroupStandings(matches)
    const groupA = result['GROUP_A']

    expect(groupA[0].advancing).toBe(true)
    expect(groupA[1].advancing).toBe(true)
    expect(groupA[2].advancing).toBe(false)
    expect(groupA[3].advancing).toBe(false)
  })

  it('does NOT mark advancing when group matches are not all finished', () => {
    const matches = [
      finishedMatch('GROUP_A', 'Brazil', 'France', 2, 1),
      scheduledMatch('GROUP_A', 'Germany', 'Japan'),
      scheduledMatch('GROUP_A', 'Brazil', 'Germany'),
      scheduledMatch('GROUP_A', 'France', 'Japan'),
      scheduledMatch('GROUP_A', 'Brazil', 'Japan'),
      scheduledMatch('GROUP_A', 'France', 'Germany'),
    ]
    const result = computeGroupStandings(matches)
    const groupA = result['GROUP_A']

    expect(groupA.every(r => !r.advancing)).toBe(true)
  })

  it('sorts by Pts then GD then GF on tie', () => {
    // Two teams tied on pts and GD, sorted by GF
    const matches = [
      finishedMatch('GROUP_B', 'Spain', 'Italy', 1, 0),
      finishedMatch('GROUP_B', 'Norway', 'Poland', 1, 0),
      finishedMatch('GROUP_B', 'Spain', 'Norway', 0, 1),
      finishedMatch('GROUP_B', 'Italy', 'Poland', 1, 0),
      finishedMatch('GROUP_B', 'Spain', 'Poland', 2, 0),
      finishedMatch('GROUP_B', 'Italy', 'Norway', 0, 0),
    ]
    const result = computeGroupStandings(matches)
    // Spain: W2 D0 L1 GF3 GA1 GD2 pts6
    // Norway: W2 D1 L0 ... wait let me recalc
    // Spain vs Italy: Spain W → Spain: W1 pts3; Italy: L1
    // Norway vs Poland: Norway W → Norway: W1 pts3; Poland: L1
    // Spain vs Norway: Norway W → Norway: W2 pts6; Spain: L1 pts3
    // Italy vs Poland: Italy W → Italy: W1 pts3; Poland: L2 pts0
    // Spain vs Poland: Spain W → Spain: W2 pts6; Poland: L3 pts0
    // Italy vs Norway: Draw → Italy: D1 pts4; Norway: D1 pts7
    // Norway: W2 D1 L0 GF2 GA0 GD2 pts7
    // Spain: W2 D0 L1 GF3 GA2 GD1 pts6
    // Italy: W1 D1 L1 GF1 GA1 GD0 pts4
    // Poland: W0 D0 L3 GF0 GA3 GD-3 pts0
    const groupB = result['GROUP_B']
    expect(groupB[0].team).toBe('Norway')
    expect(groupB[1].team).toBe('Spain')
  })

  it('ignores knockout matches', () => {
    const matches = [
      finishedMatch('GROUP_A', 'Brazil', 'France', 2, 1),
      { group: null, stage: 'ROUND_OF_16' as const, status: 'FINISHED' as const, homeTeam: 'Brazil', awayTeam: 'Spain', homeScore: 1, awayScore: 0 },
    ]
    const result = computeGroupStandings(matches)
    expect(Object.keys(result)).toEqual(['GROUP_A'])
  })
})

describe('getBest8ThirdPlace', () => {
  it('returns empty set when fewer than 12 groups have advancing teams', () => {
    // 3 complete groups — not enough
    const standings = {
      GROUP_A: [
        { team: 'A1', p:3, w:3, d:0, l:0, gf:9, ga:0, gd:9, pts:9, advancing: true },
        { team: 'A2', p:3, w:2, d:0, l:1, gf:6, ga:3, gd:3, pts:6, advancing: true },
        { team: 'A3', p:3, w:1, d:0, l:2, gf:3, ga:6, gd:-3, pts:3, advancing: false },
        { team: 'A4', p:3, w:0, d:0, l:3, gf:0, ga:9, gd:-9, pts:0, advancing: false },
      ],
    }
    expect(getBest8ThirdPlace(standings).size).toBe(0)
  })

  it('returns top 8 third-place teams when all 12 groups are complete', () => {
    // Build 12 groups, with known 3rd-place standings
    const makeGroup = (key: string, third: { team: string; pts: number; gd: number; gf: number }) => ({
      [key]: [
        { team: `${key}-1st`, p:3, w:3, d:0, l:0, gf:9, ga:0, gd:9, pts:9, advancing:true },
        { team: `${key}-2nd`, p:3, w:2, d:0, l:1, gf:6, ga:3, gd:3, pts:6, advancing:true },
        { team: third.team, p:3, w:0, d:third.pts === 1 ? 1 : 0, l:third.pts === 0 ? 3 : 2, gf:third.gf, ga:third.gf - third.gd, gd:third.gd, pts:third.pts, advancing:false },
        { team: `${key}-4th`, p:3, w:0, d:0, l:3, gf:0, ga:9, gd:-9, pts:0, advancing:false },
      ],
    })

    const standings = {
      ...makeGroup('GROUP_A', { team: 'A3', pts: 6, gd: 2, gf: 5 }),
      ...makeGroup('GROUP_B', { team: 'B3', pts: 5, gd: 1, gf: 4 }),
      ...makeGroup('GROUP_C', { team: 'C3', pts: 4, gd: 1, gf: 3 }),
      ...makeGroup('GROUP_D', { team: 'D3', pts: 4, gd: 0, gf: 3 }),
      ...makeGroup('GROUP_E', { team: 'E3', pts: 4, gd: 0, gf: 2 }),
      ...makeGroup('GROUP_F', { team: 'F3', pts: 3, gd: 1, gf: 3 }),
      ...makeGroup('GROUP_G', { team: 'G3', pts: 3, gd: 0, gf: 2 }),
      ...makeGroup('GROUP_H', { team: 'H3', pts: 3, gd: -1, gf: 2 }),
      ...makeGroup('GROUP_I', { team: 'I3', pts: 2, gd: 0, gf: 1 }),
      ...makeGroup('GROUP_J', { team: 'J3', pts: 1, gd: -2, gf: 1 }),
      ...makeGroup('GROUP_K', { team: 'K3', pts: 1, gd: -3, gf: 1 }),
      ...makeGroup('GROUP_L', { team: 'L3', pts: 0, gd: -5, gf: 0 }),
    }

    const best8 = getBest8ThirdPlace(standings)
    expect(best8.size).toBe(8)
    expect(best8.has('A3')).toBe(true) // 6 pts - top
    expect(best8.has('B3')).toBe(true) // 5 pts
    expect(best8.has('L3')).toBe(false) // 0 pts - worst
    expect(best8.has('K3')).toBe(false) // 1 pt, worst GD
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/sdb/AI/ScoreProphet
npm test -- standings
```

Expected: FAIL — `Cannot find module '@/lib/standings'`

- [ ] **Step 3: Implement standings.ts**

Create `src/lib/standings.ts`:

```typescript
interface MatchInput {
  group: string | null
  stage: string
  status: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

export interface StandingRow {
  team: string
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  advancing: boolean
}

export type GroupStandings = Record<string, StandingRow[]>

function sortRows(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort(
    (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
  )
}

export function computeGroupStandings(matches: MatchInput[]): GroupStandings {
  const groupMatches = matches.filter((m) => m.stage === 'GROUP' && m.group)

  // Collect teams per group
  const teamsByGroup: Record<string, Set<string>> = {}
  for (const m of groupMatches) {
    const g = m.group!
    if (!teamsByGroup[g]) teamsByGroup[g] = new Set()
    teamsByGroup[g].add(m.homeTeam)
    teamsByGroup[g].add(m.awayTeam)
  }

  // Initialize zero rows
  const rows: Record<string, Record<string, StandingRow>> = {}
  for (const [g, teams] of Object.entries(teamsByGroup)) {
    rows[g] = {}
    for (const team of teams) {
      rows[g][team] = { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, advancing: false }
    }
  }

  // Accumulate finished results
  for (const m of groupMatches) {
    if (m.status !== 'FINISHED' || m.homeScore === null || m.awayScore === null) continue
    const g = m.group!
    const home = rows[g]?.[m.homeTeam]
    const away = rows[g]?.[m.awayTeam]
    if (!home || !away) continue

    home.p++; away.p++
    home.gf += m.homeScore; home.ga += m.awayScore
    away.gf += m.awayScore; away.ga += m.homeScore

    if (m.homeScore > m.awayScore) {
      home.w++; home.pts += 3; away.l++
    } else if (m.homeScore < m.awayScore) {
      away.w++; away.pts += 3; home.l++
    } else {
      home.d++; home.pts += 1; away.d++; away.pts += 1
    }

    home.gd = home.gf - home.ga
    away.gd = away.gf - away.ga
  }

  // Sort and mark advancing
  const result: GroupStandings = {}
  for (const [g, teamRows] of Object.entries(rows)) {
    const matchesInGroup = groupMatches.filter((m) => m.group === g)
    const groupComplete = matchesInGroup.length > 0 && matchesInGroup.every((m) => m.status === 'FINISHED')
    const sorted = sortRows(Object.values(teamRows))
    result[g] = sorted.map((row, i) => ({
      ...row,
      advancing: groupComplete && i < 2,
    }))
  }

  return result
}

export function getBest8ThirdPlace(standings: GroupStandings): Set<string> {
  const groups = Object.values(standings)
  // Only active when all 12 groups are complete (top 2 all marked advancing)
  if (groups.length < 12) return new Set()
  const allComplete = groups.every((rows) => rows[0]?.advancing && rows[1]?.advancing)
  if (!allComplete) return new Set()

  const thirdPlace = groups
    .map((rows) => rows[2])
    .filter(Boolean)
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
    .slice(0, 8)

  return new Set(thirdPlace.map((r) => r.team))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- standings
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/standings.ts src/lib/__tests__/standings.test.ts
git commit -m "feat: group standings utility with TDD (computeGroupStandings, getBest8ThirdPlace)"
```

---

### Task 3: Navbar link + Tournament page + tabs scaffold

**Files:**
- Modify: `src/components/navbar.tsx`
- Create: `src/app/tournament/page.tsx`
- Create: `src/components/tournament-tabs.tsx`

- [ ] **Step 1: Add Tournament link to navbar**

In `src/components/navbar.tsx`, add the Tournament link between Results and Leaderboard:

```tsx
<Link href="/" className="hover:text-white transition-colors">Home</Link>
<Link href="/predictions" className="hover:text-white transition-colors">Predictions</Link>
<Link href="/results" className="hover:text-white transition-colors">Results</Link>
<Link href="/tournament" className="hover:text-white transition-colors">Tournament</Link>
<Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
<Link href="/teams" className="hover:text-white transition-colors">Teams</Link>
```

- [ ] **Step 2: Create the TournamentTabs client component**

Create `src/components/tournament-tabs.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { GroupStageTabProps } from '@/components/group-stage-tab'
import type { KnockoutBracketProps } from '@/components/knockout-bracket'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'

type Tab = 'groups' | 'bracket'

interface Props {
  groupProps: GroupStageTabProps
  bracketProps: KnockoutBracketProps
}

export function TournamentTabs({ groupProps, bracketProps }: Props) {
  const [active, setActive] = useState<Tab>('groups')

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 pb-0">
        {(['groups', 'bracket'] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab
                ? 'text-[#C9A84C] border-[#C9A84C]'
                : 'text-white/50 border-transparent hover:text-white/80'
            }`}
          >
            {tab === 'groups' ? 'Group Stage' : 'Knockout Bracket'}
          </button>
        ))}
      </div>
      {active === 'groups' ? (
        <GroupStageTab {...groupProps} />
      ) : (
        <KnockoutBracket {...bracketProps} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create the tournament page**

Create `src/app/tournament/page.tsx`:

```tsx
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { TournamentTabs } from '@/components/tournament-tabs'

export const revalidate = 60

export default async function TournamentPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const allMatches = await prisma.match.findMany({ orderBy: { kickoff: 'asc' } })
  const groupMatches = allMatches.filter((m) => m.stage === 'GROUP')
  const knockoutMatches = allMatches.filter((m) => m.stage !== 'GROUP')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">
        World Cup 2026 <span className="text-[#C9A84C]">Tournament</span>
      </h1>
      <TournamentTabs
        groupProps={{ matches: groupMatches }}
        bracketProps={{ matches: knockoutMatches, timezone }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verify the page compiles (TypeScript will flag missing components)**

```bash
cd /mnt/sdb/AI/ScoreProphet
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about missing `group-stage-tab` and `knockout-bracket` — that's fine for now, confirms the imports are wired correctly.

- [ ] **Step 5: Commit**

```bash
git add src/components/navbar.tsx src/app/tournament/page.tsx src/components/tournament-tabs.tsx
git commit -m "feat: tournament page scaffold with tabs, navbar link"
```

---

### Task 4: GroupStageTab component

**Files:**
- Create: `src/components/group-stage-tab.tsx`

- [ ] **Step 1: Create the GroupStageTab component**

Create `src/components/group-stage-tab.tsx`:

```tsx
'use client'

import Image from 'next/image'
import { computeGroupStandings, getBest8ThirdPlace } from '@/lib/standings'

interface Match {
  id: number
  stage: string
  group: string | null
  status: string
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  homeScore: number | null
  awayScore: number | null
}

export interface GroupStageTabProps {
  matches: Match[]
}

const GROUP_ORDER = [
  'GROUP_A', 'GROUP_B', 'GROUP_C', 'GROUP_D',
  'GROUP_E', 'GROUP_F', 'GROUP_G', 'GROUP_H',
  'GROUP_I', 'GROUP_J', 'GROUP_K', 'GROUP_L',
]

const GROUP_LABELS: Record<string, string> = {
  GROUP_A: 'Group A', GROUP_B: 'Group B', GROUP_C: 'Group C', GROUP_D: 'Group D',
  GROUP_E: 'Group E', GROUP_F: 'Group F', GROUP_G: 'Group G', GROUP_H: 'Group H',
  GROUP_I: 'Group I', GROUP_J: 'Group J', GROUP_K: 'Group K', GROUP_L: 'Group L',
}

// Find the crest for a team from the match list
function getCrest(matches: Match[], team: string): string {
  for (const m of matches) {
    if (m.homeTeam === team) return m.homeTeamCrest
    if (m.awayTeam === team) return m.awayTeamCrest
  }
  return ''
}

export function GroupStageTab({ matches }: GroupStageTabProps) {
  const standings = computeGroupStandings(matches)
  const best8 = getBest8ThirdPlace(standings)
  const hasAnyMatches = matches.length > 0

  if (!hasAnyMatches) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-white/40">
        Group stage hasn't started yet.
      </div>
    )
  }

  const presentGroups = GROUP_ORDER.filter((g) => standings[g])

  return (
    <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {presentGroups.map((groupKey) => {
        const rows = standings[groupKey]
        return (
          <div key={groupKey} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-3 py-2 border-b border-white/10">
              <span className="text-xs font-bold tracking-wider text-[#C9A84C] uppercase">
                {GROUP_LABELS[groupKey]}
              </span>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-3 py-1.5 text-left text-white/30 font-normal">Team</th>
                  <th className="px-1 py-1.5 text-center text-white/30 font-normal w-6">W</th>
                  <th className="px-1 py-1.5 text-center text-white/30 font-normal w-6">D</th>
                  <th className="px-1 py-1.5 text-center text-white/30 font-normal w-6">L</th>
                  <th className="px-1 py-1.5 text-center text-white/30 font-normal w-7">GF</th>
                  <th className="px-1 py-1.5 text-center text-white/30 font-normal w-7">GA</th>
                  <th className="px-1 py-1.5 text-center text-white/30 font-normal w-8">GD</th>
                  <th className="px-2 py-1.5 text-center text-white/30 font-normal w-8">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isAdvancing = row.advancing || best8.has(row.team)
                  const crest = getCrest(matches, row.team)
                  return (
                    <tr
                      key={row.team}
                      className={`border-b border-white/5 last:border-0 ${
                        isAdvancing ? 'bg-green-900/20' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {crest && (
                            <Image
                              src={crest}
                              alt={row.team}
                              width={16}
                              height={16}
                              className="object-contain shrink-0"
                            />
                          )}
                          <span className={`truncate ${isAdvancing ? 'text-green-300' : 'text-white/70'}`}>
                            {row.team}
                          </span>
                        </div>
                      </td>
                      <td className="px-1 py-1.5 text-center text-white/60">{row.w}</td>
                      <td className="px-1 py-1.5 text-center text-white/60">{row.d}</td>
                      <td className="px-1 py-1.5 text-center text-white/60">{row.l}</td>
                      <td className="px-1 py-1.5 text-center text-white/60">{row.gf}</td>
                      <td className="px-1 py-1.5 text-center text-white/60">{row.ga}</td>
                      <td className="px-1 py-1.5 text-center text-white/60">
                        {row.gd > 0 ? `+${row.gd}` : row.gd}
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold text-[#C9A84C]">{row.pts}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep group-stage
```

Expected: no errors for group-stage-tab

- [ ] **Step 3: Commit**

```bash
git add src/components/group-stage-tab.tsx
git commit -m "feat: GroupStageTab component with standings grid and advancing highlights"
```

---

### Task 5: Trophy image + KnockoutBracket component

**Files:**
- Create: `public/trophy.webp`
- Create: `src/components/knockout-bracket.tsx`

- [ ] **Step 1: Download the World Cup trophy image**

Download the FIFA World Cup Trophy image from Wikimedia Commons (public domain) and save it to `public/trophy.webp`:

```bash
curl -L "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/FIFA_World_Cup_Trophy_2010.jpg/440px-FIFA_World_Cup_Trophy_2010.jpg" \
  -o /mnt/sdb/AI/ScoreProphet/public/trophy.jpg
```

If the above fails (network issue), use any World Cup trophy image saved to `public/trophy.webp`. The component falls back to the 🏆 emoji via an `onError` handler so a missing image doesn't break the page.

- [ ] **Step 2: Create the KnockoutBracket component**

Create `src/components/knockout-bracket.tsx`:

```tsx
'use client'

import { formatMatchTime } from '@/lib/format-date'

type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED'
type Stage = 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL'

interface BracketMatch {
  id: number
  homeTeam: string
  awayTeam: string
  homeTeamCrest: string
  awayTeamCrest: string
  homeScore: number | null
  awayScore: number | null
  status: MatchStatus
  stage: Stage
  kickoff: Date
  winnerTeam: string | null
}

export interface KnockoutBracketProps {
  matches: BracketMatch[]
  timezone: string
}

function MatchSlot({ match, timezone }: { match: BracketMatch; timezone: string }) {
  const isFinished = match.status === 'FINISHED'
  const homeWon = isFinished && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore
  const awayWon = isFinished && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore
  const isLive = match.status === 'LIVE'

  return (
    <div className="w-36 rounded border border-white/10 bg-white/5 overflow-hidden text-[11px] shrink-0">
      <div className={`flex items-center justify-between gap-1 px-2 py-1.5 ${homeWon ? 'text-[#C9A84C] font-semibold' : 'text-white/60'}`}>
        <span className="truncate">{match.homeTeam}</span>
        <div className="flex items-center gap-1 shrink-0">
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          <span className="tabular-nums">{match.homeScore ?? ''}</span>
        </div>
      </div>
      <div className="border-t border-white/10" />
      <div className={`flex items-center justify-between gap-1 px-2 py-1.5 ${awayWon ? 'text-[#C9A84C] font-semibold' : 'text-white/60'}`}>
        <span className="truncate">{match.awayTeam}</span>
        <span className="tabular-nums shrink-0">{match.awayScore ?? ''}</span>
      </div>
      <div className="border-t border-white/5 px-2 py-1 text-white/25 text-[9px]">
        {formatMatchTime(match.kickoff, timezone)}
      </div>
    </div>
  )
}

// Connects N pairs of matches (from round with 2N slots) to N slots in next round
function ForwardConnectors({ count }: { count: number }) {
  return (
    <div className="flex flex-col justify-around self-stretch w-5 shrink-0 pt-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col flex-1">
          <div className="flex-1 border-r border-t border-white/20 rounded-tr" />
          <div className="flex-1 border-r border-b border-white/20 rounded-br" />
        </div>
      ))}
    </div>
  )
}

// Mirror of ForwardConnectors for the right half (lines go left)
function BackwardConnectors({ count }: { count: number }) {
  return (
    <div className="flex flex-col justify-around self-stretch w-5 shrink-0 pt-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col flex-1">
          <div className="flex-1 border-l border-t border-white/20" />
          <div className="flex-1 border-l border-b border-white/20" />
        </div>
      ))}
    </div>
  )
}

function HConnector() {
  return (
    <div className="self-stretch w-5 shrink-0 flex items-center pt-7">
      <div className="w-full border-t border-white/20" />
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  ROUND_OF_32: 'R32',
  ROUND_OF_16: 'R16',
  QUARTER_FINAL: 'QF',
  SEMI_FINAL: 'SF',
  FINAL: 'Final',
}

function RoundColumn({ matches, timezone, label }: { matches: BracketMatch[]; timezone: string; label: string }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <span className="text-[9px] font-bold tracking-widest text-[#C9A84C] uppercase mb-2 h-5">{label}</span>
      <div className="flex flex-col justify-around flex-1 gap-2">
        {matches.map((m) => (
          <MatchSlot key={m.id} match={m} timezone={timezone} />
        ))}
      </div>
    </div>
  )
}

export function KnockoutBracket({ matches, timezone }: KnockoutBracketProps) {
  const byStage = (stage: Stage) =>
    matches
      .filter((m) => m.stage === stage)
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

  const r32 = byStage('ROUND_OF_32')
  const r16 = byStage('ROUND_OF_16')
  const qf  = byStage('QUARTER_FINAL')
  const sf  = byStage('SEMI_FINAL')
  const final = byStage('FINAL')
  const thirdPlace = byStage('THIRD_PLACE')

  // Split each stage into left half (→ centre) and right half (← centre)
  const half = (arr: BracketMatch[]) => [arr.slice(0, Math.ceil(arr.length / 2)), arr.slice(Math.ceil(arr.length / 2))]
  const [r32L, r32R] = half(r32)
  const [r16L, r16R] = half(r16)
  const [qfL, qfR]   = half(qf)
  const [sfL, sfR]   = half(sf)

  const hasKnockoutData = r32.length > 0 || r16.length > 0 || sf.length > 0 || final.length > 0

  if (!hasKnockoutData) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-white/40">
        Knockout bracket will appear once the group stage is complete.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Bracket */}
      <div className="overflow-x-auto pb-4">
        <p className="text-white/20 text-xs mb-3 sm:hidden">← Scroll to see full bracket →</p>
        <div className="flex items-stretch min-w-max">

          {/* ── LEFT HALF (R32 → R16 → QF → SF → centre) ── */}
          {r32L.length > 0 && <><RoundColumn matches={r32L} timezone={timezone} label={STAGE_LABELS.ROUND_OF_32} /><ForwardConnectors count={r16L.length || Math.ceil(r32L.length / 2)} /></>}
          {r16L.length > 0 && <><RoundColumn matches={r16L} timezone={timezone} label={STAGE_LABELS.ROUND_OF_16} /><ForwardConnectors count={qfL.length || Math.ceil(r16L.length / 2)} /></>}
          {qfL.length > 0  && <><RoundColumn matches={qfL}  timezone={timezone} label={STAGE_LABELS.QUARTER_FINAL} /><ForwardConnectors count={sfL.length || Math.ceil(qfL.length / 2)} /></>}
          {sfL.length > 0  && <><RoundColumn matches={sfL}  timezone={timezone} label={STAGE_LABELS.SEMI_FINAL} /><HConnector /></>}

          {/* ── CENTRE: Trophy + Final ── */}
          <div className="flex flex-col items-center justify-center px-4 gap-3 shrink-0">
            <div className="h-5" />{/* spacer matching round label height */}
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/trophy.jpg"
                alt="World Cup Trophy"
                className="h-24 w-auto object-contain drop-shadow-[0_0_12px_rgba(201,168,76,0.4)]"
                onError={(e) => {
                  const el = e.target as HTMLImageElement
                  el.style.display = 'none'
                  el.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <span className="text-4xl hidden">🏆</span>
              <span className="text-[9px] tracking-widest text-[#C9A84C] uppercase">World Cup 2026</span>
            </div>
            {final[0] ? (
              <MatchSlot match={final[0]} timezone={timezone} />
            ) : (
              <div className="w-36 rounded border border-[#C9A84C]/30 bg-[#C9A84C]/5 px-2 py-3 text-center text-[11px] text-[#C9A84C]/50">
                Final
              </div>
            )}
          </div>

          {/* ── RIGHT HALF (centre → SF → QF → R16 → R32) ── */}
          {sfR.length > 0  && <><HConnector /><RoundColumn matches={sfR}  timezone={timezone} label={STAGE_LABELS.SEMI_FINAL} /></>}
          {qfR.length > 0  && <><BackwardConnectors count={sfR.length || Math.ceil(qfR.length / 2)} /><RoundColumn matches={qfR}  timezone={timezone} label={STAGE_LABELS.QUARTER_FINAL} /></>}
          {r16R.length > 0 && <><BackwardConnectors count={qfR.length || Math.ceil(r16R.length / 2)} /><RoundColumn matches={r16R} timezone={timezone} label={STAGE_LABELS.ROUND_OF_16} /></>}
          {r32R.length > 0 && <><BackwardConnectors count={r16R.length || Math.ceil(r32R.length / 2)} /><RoundColumn matches={r32R} timezone={timezone} label={STAGE_LABELS.ROUND_OF_32} /></>}

        </div>
      </div>

      {/* Third-place play-off */}
      {thirdPlace.length > 0 && (
        <div className="border-t border-white/10 pt-6">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">3rd Place Play-off</p>
          <MatchSlot match={thirdPlace[0]} timezone={timezone} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to this feature)

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/knockout-bracket.tsx public/trophy.jpg
git commit -m "feat: KnockoutBracket component with converging layout and trophy in centre"
```

---

### Task 6: Push and verify build

- [ ] **Step 1: Run full build**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` — fix any TypeScript or lint errors before continuing.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Update container once CI passes**

Once GitHub Actions pushes `ghcr.io/adandu/scoreprophet:latest`, update the ScoreProphet container. On first start, `prisma migrate deploy` runs the `add_match_group` migration automatically. Then run Admin → Sync Matches from API to populate the `group` field on existing matches.
