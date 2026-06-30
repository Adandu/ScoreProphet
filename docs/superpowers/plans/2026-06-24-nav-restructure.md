# Navigation Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the top navbar and page structure so championship content lives under one hub page, tournament has URL-persistent tabs including Teams, and profile/manage/admin are grouped under a username dropdown.

**Architecture:** The championship sub-routes (`/championships/[id]/predictions`, `/results`, `/leaderboard`) gain a shared `layout.tsx` that renders a tab bar + championship selector, replacing the per-page `ChampionshipPageNav`. The tournament page tabs switch from `useState` to URL search params so the active tab survives a page refresh. The username in the navbar becomes a dropdown containing Profile, Manage (conditional), and Admin (conditional) links.

**Tech Stack:** Next.js 15 App Router, React `useSearchParams` / `usePathname` / `useRouter`, Tailwind CSS, Prisma (read-only in layouts), TypeScript.

## Global Constraints

- All tab IDs for tournament: `groups` | `bracket` | `teams` | `scorers` | `statistics` (default: `groups`)
- Championship sub-tab routes stay as-is: `/championships/[id]/predictions`, `/results`, `/leaderboard`
- Pending filter URL param: `?pending=1` on the predictions page
- Championship selector appears in **both** the navbar and the Championship layout header
- Profile/Manage/Admin remain at their existing routes (`/profile`, `/manage`, `/admin`); only the nav entry point changes
- Logout moves into the username dropdown (removed from standalone button in navbar)
- Navbar order (desktop): ScoreProphet logo | Home | [Championship Name link] | Tournament | How to Play | [ChampionshipSelector] [TimezoneSelector] [UsernameDropdown]
- Mobile menu must mirror all desktop nav changes
- No DB schema changes, no new server actions
- Wrap every `useSearchParams()` client component with `<Suspense>` in its parent server component

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/components/tournament-tabs.tsx` | URL-based tab switching via `useSearchParams` + `Link` |
| Modify | `src/app/tournament/page.tsx` | Add Teams tab prop + data, wrap `TournamentTabs` in `<Suspense>` |
| Modify | `src/app/teams/page.tsx` | Redirect `/teams` → `/tournament?tab=teams` |
| Create | `src/app/championships/[championshipId]/layout.tsx` | Shared server layout: championship header, tab bar, selector |
| Create | `src/components/championship-tab-bar.tsx` | Client component: tab links, highlights active via `usePathname` |
| Modify | `src/app/championships/[championshipId]/predictions/page.tsx` | Accept `searchParams`, filter pending-only, add toggle |
| Modify | `src/app/championships/[championshipId]/results/page.tsx` | Remove `ChampionshipPageNav` render |
| Modify | `src/app/championships/[championshipId]/leaderboard/page.tsx` | Remove `ChampionshipPageNav` render |
| Modify | `src/app/championships/[championshipId]/pending/page.tsx` | Replace with redirect to `/championships/[id]/predictions?pending=1` |
| Create | `src/components/pending-filter-toggle.tsx` | Client toggle for pending filter URL param |
| Create | `src/components/username-dropdown.tsx` | Client dropdown: Profile, Manage, Admin links + Logout |
| Modify | `src/components/navbar.tsx` | New structure: fewer top-level links, championship name link, username dropdown |
| Modify | `src/components/mobile-menu.tsx` | Mirror new nav structure |
| Delete | `src/components/championship-page-nav.tsx` | Replaced by layout + ChampionshipTabBar |

---

### Task 1: URL-based Tournament Tabs + Teams Tab

**Files:**
- Modify: `src/components/tournament-tabs.tsx`
- Modify: `src/app/tournament/page.tsx`
- Modify: `src/app/teams/page.tsx`

**Interfaces:**
- Produces: `TournamentTabs` now accepts a `teams: ReactNode` prop in addition to existing props; reads `?tab=` URL param instead of local state

- [ ] **Step 1: Rewrite `TournamentTabs` to use URL search params**

Replace the entire file content:

```tsx
'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'

type TournamentTab = 'groups' | 'bracket' | 'teams' | 'scorers' | 'statistics'

export function TournamentTabs({
  groups,
  bracket,
  teams,
  scorers,
  statistics,
}: {
  groups: ReactNode
  bracket: ReactNode
  teams: ReactNode
  scorers: ReactNode
  statistics: ReactNode
}) {
  const searchParams = useSearchParams()
  const active = (searchParams.get('tab') as TournamentTab) ?? 'groups'

  const tabs: Array<{ id: TournamentTab; label: string }> = [
    { id: 'groups', label: 'Group Stage' },
    { id: 'bracket', label: 'Knockout Bracket' },
    { id: 'teams', label: 'Teams' },
    { id: 'scorers', label: 'Top Scorers' },
    { id: 'statistics', label: 'Statistics' },
  ]

  return (
    <div className="space-y-5">
      <div className="border-b border-white/10">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`?tab=${tab.id}`}
              className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                active === tab.id
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      {active === 'groups' && groups}
      {active === 'bracket' && bracket}
      {active === 'teams' && teams}
      {active === 'scorers' && scorers}
      {active === 'statistics' && statistics}
    </div>
  )
}
```

- [ ] **Step 2: Update tournament page to add Teams tab + Suspense boundary**

Replace the entire `src/app/tournament/page.tsx`:

```tsx
import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchStandings } from '@/lib/football-api'
import { computeFormByTeam } from '@/lib/team-form'
import { GroupStageTab } from '@/components/group-stage-tab'
import { KnockoutBracket } from '@/components/knockout-bracket'
import { TournamentTabs } from '@/components/tournament-tabs'
import { TournamentStatisticsPanel } from '@/components/tournament-statistics-panel'
import { TopScorersPanel } from '@/components/top-scorers-panel'
import Image from 'next/image'
import Link from 'next/link'

export default async function TournamentPage() {
  const session = await requireAuth()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, teams] = await Promise.all([
    prisma.match.findMany({ orderBy: { kickoff: 'asc' } }),
    prisma.team.findMany({ select: { externalId: true, name: true, crest: true }, orderBy: { name: 'asc' } }),
  ])
  const groupMatches = matches.filter((match) => match.stage === 'GROUP')
  const knockoutMatches = matches.filter((match) => match.stage !== 'GROUP')

  const teamIdByName: Record<string, string> = {}
  for (const team of teams) teamIdByName[team.name] = team.externalId

  const formByTeam: Record<string, string> = {}
  try {
    for (const group of await fetchStandings()) {
      for (const row of group.table) if (row.form) formByTeam[row.teamName] = row.form
    }
  } catch {
    // Standings unavailable — local form below still populates.
  }
  Object.assign(formByTeam, computeFormByTeam(matches))

  const teamsTab = (
    <div className="space-y-6">
      {teams.length === 0 && (
        <p className="text-white/40">No teams yet — run a sync from the Admin panel.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {teams.map((team) => (
          <Link
            key={team.externalId}
            href={`/teams/${team.externalId}`}
            className="flex flex-col items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center">
              {team.crest ? (
                <Image src={team.crest} alt={team.name} width={48} height={48} className="object-contain max-h-12" />
              ) : (
                <div className="h-12 w-12 rounded bg-white/10" />
              )}
            </div>
            <span className="text-center text-sm font-medium text-white/80">{team.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Tournament</h1>
      <Suspense>
        <TournamentTabs
          groups={
            <GroupStageTab
              matches={groupMatches.map((match) => ({
                group: match.group,
                status: match.status,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeTeamCrest: match.homeTeamCrest,
                awayTeamCrest: match.awayTeamCrest,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
              }))}
              formByTeam={formByTeam}
              teamIdByName={teamIdByName}
            />
          }
          bracket={
            <KnockoutBracket
              timezone={timezone}
              matches={knockoutMatches.map((match) => ({
                id: match.id,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: match.fullTimeHomeScore ?? match.homeScore,
                awayScore: match.fullTimeAwayScore ?? match.awayScore,
                scoreDuration: match.scoreDuration,
                penaltiesHomeScore: match.penaltiesHomeScore,
                penaltiesAwayScore: match.penaltiesAwayScore,
                winnerTeam: match.winnerTeam,
                status: match.status,
                stage: match.stage,
                kickoff: match.kickoff.toISOString(),
              }))}
            />
          }
          teams={teamsTab}
          scorers={<TopScorersPanel />}
          statistics={<TournamentStatisticsPanel />}
        />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 3: Redirect `/teams` to `/tournament?tab=teams`**

Replace entire `src/app/teams/page.tsx` content:

```tsx
import { redirect } from 'next/navigation'

export default function TeamsPage() {
  redirect('/tournament?tab=teams')
}
```

- [ ] **Step 4: Type-check and run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm run type-check 2>&1 | tail -5
npm test -- --testPathPattern="tournament" 2>&1 | tail -10
```

Expected: no type errors, tests pass.

- [ ] **Step 5: Verify in browser**

Start dev server (`npm run dev`), navigate to `/tournament`. Confirm:
- Tabs: Group Stage / Knockout Bracket / Teams / Top Scorers / Statistics
- Clicking Teams shows team grid with links to `/teams/[id]`
- Pressing F5 stays on the same tab (URL shows `?tab=teams`)
- `/teams` redirects to `/tournament?tab=teams`

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet
git add src/components/tournament-tabs.tsx src/app/tournament/page.tsx src/app/teams/page.tsx
git commit -m "feat: URL-based tournament tabs with Teams tab"
git push
```

---

### Task 2: Championship Shared Layout with Tab Bar + Selector

**Files:**
- Create: `src/app/championships/[championshipId]/layout.tsx`
- Create: `src/components/championship-tab-bar.tsx`
- Modify: `src/app/championships/[championshipId]/predictions/page.tsx` (remove ChampionshipPageNav render)
- Modify: `src/app/championships/[championshipId]/results/page.tsx` (remove ChampionshipPageNav render)
- Modify: `src/app/championships/[championshipId]/leaderboard/page.tsx` (remove ChampionshipPageNav render)
- Modify: `src/app/championships/[championshipId]/pending/page.tsx` (remove ChampionshipPageNav render — Task 3 will redirect it)

**Interfaces:**
- Produces: `ChampionshipTabBar` client component accepts `{ championshipId: number }`; determines active tab from `usePathname()`
- Produces: The championship layout renders: championship name h1, `ChampionshipSelector` (if multiple championships), `ChampionshipTabBar`, then `{children}`

- [ ] **Step 1: Create `ChampionshipTabBar` client component**

Create `src/components/championship-tab-bar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function ChampionshipTabBar({ championshipId }: { championshipId: number }) {
  const pathname = usePathname()

  const tabs = [
    { href: `/championships/${championshipId}/predictions`, label: 'Predictions' },
    { href: `/championships/${championshipId}/results`, label: 'Results' },
    { href: `/championships/${championshipId}/leaderboard`, label: 'Leaderboard' },
  ]

  return (
    <div className="border-b border-white/10">
      <div className="flex gap-6 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the championship layout**

Create `src/app/championships/[championshipId]/layout.tsx`:

```tsx
import type { ReactNode } from 'react'
import { requireAuth } from '@/lib/auth'
import { requireChampionshipAccessLean, getUserChampionships } from '@/lib/championships'
import { ChampionshipSelector } from '@/components/championship-selector'
import { ChampionshipTabBar } from '@/components/championship-tab-bar'

export default async function ChampionshipLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ championshipId: string }>
}) {
  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  const { session, championship } = await requireChampionshipAccessLean(championshipId)
  const championships = await getUserChampionships(session.userId!)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{championship.name}</h1>
        {championships.length > 1 && (
          <ChampionshipSelector
            championships={championships.map((c) => ({ id: c.id, name: c.name }))}
            selectedId={championship.id}
          />
        )}
      </div>
      <ChampionshipTabBar championshipId={championship.id} />
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Remove `ChampionshipPageNav` from predictions page**

In `src/app/championships/[championshipId]/predictions/page.tsx`, remove the import and the `<ChampionshipPageNav ... />` JSX element. The page currently renders it near the top of the returned JSX — delete those lines. (The layout now provides the header.)

Find and remove these lines from predictions/page.tsx:
```tsx
import { ChampionshipPageNav } from '@/components/championship-page-nav'
```
and the JSX:
```tsx
<ChampionshipPageNav championshipId={championship.id} name={championship.name} />
```

- [ ] **Step 4: Remove `ChampionshipPageNav` from results page**

In `src/app/championships/[championshipId]/results/page.tsx`, remove:
```tsx
import { ChampionshipPageNav } from '@/components/championship-page-nav'
```
and its JSX usage `<ChampionshipPageNav ... />`.

- [ ] **Step 5: Remove `ChampionshipPageNav` from leaderboard page**

In `src/app/championships/[championshipId]/leaderboard/page.tsx`, remove:
```tsx
import { ChampionshipPageNav } from '@/components/championship-page-nav'
```
and its JSX usage `<ChampionshipPageNav ... />`.

- [ ] **Step 6: Remove `ChampionshipPageNav` from pending page**

In `src/app/championships/[championshipId]/pending/page.tsx`, remove:
```tsx
import { ChampionshipPageNav } from '@/components/championship-page-nav'
```
and its JSX usage `<ChampionshipPageNav championshipId={championship.id} name={championship.name} />` (also remove the `name` variable from the destructured `championship` if only used for that).

- [ ] **Step 7: Delete `championship-page-nav.tsx`**

```bash
rm /mnt/sdb/AI/ScoreProphet/src/components/championship-page-nav.tsx
```

- [ ] **Step 8: Type-check**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm run type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 9: Verify in browser**

Navigate to `/championships/[id]/predictions`. Confirm:
- Championship name as h1 in the header
- Championship selector appears (if user is in multiple championships)
- Tabs: Predictions / Results / Leaderboard — active tab highlighted
- F5 stays on the same tab (URL is the tab)
- Navigating to Results and Leaderboard tabs works

- [ ] **Step 10: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet
git add src/app/championships/ src/components/championship-tab-bar.tsx
git rm src/components/championship-page-nav.tsx
git commit -m "feat: championship shared layout with tab bar and selector"
git push
```

---

### Task 3: Predictions Pending Filter + Retire Pending Page

**Files:**
- Create: `src/components/pending-filter-toggle.tsx`
- Modify: `src/app/championships/[championshipId]/predictions/page.tsx`
- Modify: `src/app/championships/[championshipId]/pending/page.tsx`

**Interfaces:**
- Produces: `PendingFilterToggle` client component accepts `{ showPendingOnly: boolean }`, toggles `?pending=1` in the URL
- Produces: The predictions page accepts `searchParams: Promise<Record<string, string>>` prop and applies pending filter when `pending === '1'`

- [ ] **Step 1: Create `PendingFilterToggle` client component**

Create `src/components/pending-filter-toggle.tsx`:

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Filter } from 'lucide-react'

function PendingFilterToggleInner({ showPendingOnly }: { showPendingOnly: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function toggle() {
    const params = new URLSearchParams(searchParams.toString())
    if (showPendingOnly) {
      params.delete('pending')
    } else {
      params.set('pending', '1')
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        showPendingOnly
          ? 'border-orange-400/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'
          : 'border-white/15 bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
      }`}
    >
      <Filter className="h-3 w-3" />
      {showPendingOnly ? 'Showing pending only' : 'Show pending only'}
    </button>
  )
}

export function PendingFilterToggle({ showPendingOnly }: { showPendingOnly: boolean }) {
  return (
    <Suspense>
      <PendingFilterToggleInner showPendingOnly={showPendingOnly} />
    </Suspense>
  )
}
```

- [ ] **Step 2: Add `searchParams` prop to predictions page and apply filter**

In `src/app/championships/[championshipId]/predictions/page.tsx`:

Add `searchParams` to the page props type and read the pending flag. Then, after building `sections`, add a filter step. Add the toggle button above the sections render.

**Add `searchParams` to the function signature** (the page currently only destructures `params`):
```tsx
export default async function ChampionshipPredictionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ championshipId: string }>
  searchParams: Promise<Record<string, string>>
}) {
```

**Read the flag** after the existing `await params` line:
```tsx
const showPendingOnly = (await searchParams)?.pending === '1'
```

**Add the import** at the top of the file:
```tsx
import { PendingFilterToggle } from '@/components/pending-filter-toggle'
```

**Add a pending-only filter after `sections` is built** (after the `const sections = [...]` line). The logic mirrors the pending page: a match is "pending" if it has no result prediction, or no exact score, or (knockout + X predicted + no advance pick):

```tsx
const filteredSections = showPendingOnly
  ? sections
      .map(([key, sectionMatches]) => [
        key,
        sectionMatches.filter((match) => {
          const existing = predByMatch[match.id] ?? []
          const hasSingleOutcome = existing.some((p) => p.type === 'SINGLE_OUTCOME')
          const hasDoubleChance = existing.some((p) => p.type === 'DOUBLE_CHANCE')
          const hasResultPrediction = championship.doubleChanceEnabled
            ? hasSingleOutcome || hasDoubleChance
            : hasSingleOutcome
          const hasExactScore = existing.some((p) => p.type === 'EXACT_SCORE')
          const isKnockout = match.stage !== 'GROUP'
          const predictedDraw = existing.some((p) => p.type === 'SINGLE_OUTCOME' && p.value === 'X')
          const hasAdvance = !isKnockout || !predictedDraw || Boolean(advanceByMatch[match.id])
          return !(hasResultPrediction && hasExactScore && hasAdvance)
        }),
      ] as [string, typeof sectionMatches])
      .filter(([, sectionMatches]) => sectionMatches.length > 0)
  : sections
```

**Replace `sections` with `filteredSections`** in the JSX render (the `.map` over sections that renders each section). Change both the outer `.map` call and any inner reference from `sections` to `filteredSections`.

**Add the toggle button** just before the sections render, inside the outermost `<div>` that wraps the page content, between the tournament winner block and the first section:

```tsx
<div className="flex items-center justify-between">
  <p className="text-sm text-white/40">
    {filteredSections.reduce((n, [, s]) => n + s.length, 0)} match{filteredSections.reduce((n, [, s]) => n + s.length, 0) !== 1 ? 'es' : ''}
    {showPendingOnly ? ' with pending predictions' : ' upcoming'}
  </p>
  <PendingFilterToggle showPendingOnly={showPendingOnly} />
</div>
```

- [ ] **Step 3: Replace the pending page with a redirect**

Replace all content in `src/app/championships/[championshipId]/pending/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default async function ChampionshipPendingPage({
  params,
}: {
  params: Promise<{ championshipId: string }>
}) {
  const { championshipId } = await params
  redirect(`/championships/${championshipId}/predictions?pending=1`)
}
```

- [ ] **Step 4: Type-check**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm run type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Verify in browser**

Navigate to `/championships/[id]/predictions`. Confirm:
- "Show pending only" button is visible above the match list
- Clicking it reloads the page with `?pending=1` and shows only matches with incomplete predictions
- Clicking "Showing pending only" removes the filter
- F5 stays on the pending-only view when `?pending=1` is in the URL
- Navigating to `/championships/[id]/pending` redirects to predictions with `?pending=1`

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet
git add src/components/pending-filter-toggle.tsx src/app/championships/
git commit -m "feat: pending predictions filter on predictions tab; retire /pending page"
git push
```

---

### Task 4: Username Dropdown

**Files:**
- Create: `src/components/username-dropdown.tsx`

**Interfaces:**
- Produces: `UsernameDropdown` accepts `{ username: string; isAdmin: boolean; canManage: boolean }`, renders a dropdown with Profile, Manage (if canManage), Admin (if isAdmin), separator, Logout

- [ ] **Step 1: Create `UsernameDropdown` client component**

Create `src/components/username-dropdown.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, User, Settings, ShieldCheck } from 'lucide-react'
import { logout } from '@/actions/auth'

export function UsernameDropdown({
  username,
  isAdmin,
  canManage,
}: {
  username: string
  isAdmin: boolean
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {username}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-white/10 bg-[#0A1628] py-1 shadow-2xl">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            Profile
          </Link>
          {canManage && (
            <Link
              href="/manage"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#C9A84C] hover:text-[#F2D27A] hover:bg-white/5 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Manage
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#C9A84C] hover:text-[#F2D27A] hover:bg-white/5 transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </Link>
          )}
          <div className="my-1 border-t border-white/10" />
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center px-4 py-2 text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              Logout
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm run type-check 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet
git add src/components/username-dropdown.tsx
git commit -m "feat: username dropdown with Profile/Manage/Admin/Logout"
git push
```

---

### Task 5: Navbar Restructure

**Files:**
- Modify: `src/components/navbar.tsx`

**Interfaces:**
- Consumes: `UsernameDropdown` from Task 4
- Produces: Navbar with order: Logo | Home | [Championship Name link] | Tournament | How to Play | [ChampionshipSelector] [TimezoneSelector] [UsernameDropdown]

- [ ] **Step 1: Rewrite the desktop navbar**

Replace the entire `src/components/navbar.tsx`:

```tsx
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getManagedChampionships, getSelectedChampionship, getUserChampionships } from '@/lib/championships'
import { TimezoneSelector } from '@/components/timezone-selector'
import { ChampionshipSelector } from '@/components/championship-selector'
import { UsernameDropdown } from '@/components/username-dropdown'
import { MobileMenu } from '@/components/mobile-menu'
import { prisma } from '@/lib/db'

export async function Navbar() {
  const user = await getCurrentUser()
  const [championships, selectedChampionship, managedChampionships] = user
    ? await Promise.all([
        getUserChampionships(user.userId),
        getSelectedChampionship(user.userId),
        getManagedChampionships(user.userId),
      ])
    : [[], null, []]
  const canManageChampionships = user?.isAdmin || managedChampionships.length > 0
  const now = new Date()
  const soonCutoff = new Date(now.getTime() + 15 * 60 * 1000)
  const hasLiveMatch = await prisma.match
    .count({
      where: {
        OR: [
          { status: 'LIVE' },
          { status: 'SCHEDULED', kickoff: { gte: now, lte: soonCutoff } },
        ],
      },
    })
    .then((n) => n > 0)

  return (
    <nav className="border-b border-white/10 bg-[#0A1628]/95 backdrop-blur sticky top-0 z-50 caret-transparent">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-[#C9A84C] tracking-tight">
          ScoreProphet
        </Link>

        {user ? (
          <>
            {/* Desktop nav links */}
            <div className="hidden items-center gap-5 text-sm text-white/70 lg:flex">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              {hasLiveMatch && (
                <Link
                  href="/live"
                  className="flex items-center gap-1.5 font-semibold text-red-400 hover:text-red-300 transition-colors"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </Link>
              )}
              {selectedChampionship && (
                <Link
                  href={`/championships/${selectedChampionship.id}/predictions`}
                  className="font-semibold text-white/90 hover:text-white transition-colors"
                >
                  {selectedChampionship.name}
                </Link>
              )}
              <Link href="/tournament" className="hover:text-white transition-colors">Tournament</Link>
              <Link href="/instructions" className="hover:text-white transition-colors">How to Play</Link>
            </div>

            {/* Desktop right-side controls */}
            <div className="hidden items-center gap-3 lg:flex">
              {championships.length > 0 && selectedChampionship && (
                <ChampionshipSelector
                  championships={championships.map((c) => ({ id: c.id, name: c.name }))}
                  selectedId={selectedChampionship.id}
                />
              )}
              <TimezoneSelector timezone={user.timezone} />
              <UsernameDropdown
                username={user.username}
                isAdmin={user.isAdmin}
                canManage={canManageChampionships}
              />
            </div>
          </>
        ) : (
          <>
            <div className="hidden lg:block" />
            <div className="hidden items-center gap-2 lg:flex sm:gap-3">
              <Link href="/login">
                <button type="button" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:text-white bg-transparent transition-colors">
                  Login
                </button>
              </Link>
              <Link href="/register">
                <button type="button" className="rounded-md bg-[#C9A84C] px-3 py-1.5 text-sm font-semibold text-[#0A1628] hover:bg-[#C9A84C]/90 transition-colors">
                  Register
                </button>
              </Link>
            </div>
          </>
        )}

        <MobileMenu
          user={user}
          championships={championships.map((c) => ({ id: c.id, name: c.name }))}
          selectedChampionship={selectedChampionship}
          hasLiveMatch={Boolean(user && hasLiveMatch)}
          canManageChampionships={canManageChampionships}
        />
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm run type-check 2>&1 | tail -10
```

Expected: no errors (MobileMenu shape will be verified in Task 6).

- [ ] **Step 3: Commit**

```bash
cd /mnt/sdb/AI/ScoreProphet
git add src/components/navbar.tsx
git commit -m "feat: restructure desktop navbar — championship name link, username dropdown"
git push
```

---

### Task 6: Mobile Menu Update

**Files:**
- Modify: `src/components/mobile-menu.tsx`

**Interfaces:**
- Consumes: Same props as before (user, championships, selectedChampionship, hasLiveMatch, canManageChampionships) — no prop shape changes
- Produces: Mobile menu with order matching desktop: Home | Live | [Championship Name] | Tournament | How to Play | Profile | Manage | Admin | Timezone selector | Logout

- [ ] **Step 1: Rewrite `MobileMenu` to mirror new nav order**

Replace the entire `src/components/mobile-menu.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { logout } from '@/actions/auth'
import { TimezoneSelector } from '@/components/timezone-selector'
import { ChampionshipSelector } from '@/components/championship-selector'

interface User {
  userId: number
  username: string
  isAdmin: boolean
  timezone: string
  theme?: 'DARK' | 'LIGHT'
}

interface Championship {
  id: number
  name: string
}

export function MobileMenu({
  user,
  championships,
  selectedChampionship,
  hasLiveMatch = false,
  canManageChampionships = false,
}: {
  user: User | null
  championships: Championship[]
  selectedChampionship: Championship | null
  hasLiveMatch?: boolean
  canManageChampionships?: boolean
}) {
  const [open, setOpen] = useState(false)

  if (!user) return null

  const close = () => setOpen(false)

  const links = [
    { href: '/', label: 'Home' },
    ...(selectedChampionship
      ? [{ href: `/championships/${selectedChampionship.id}/predictions`, label: selectedChampionship.name, highlight: true }]
      : []),
    { href: '/tournament', label: 'Tournament' },
    { href: '/instructions', label: 'How to Play' },
    { href: '/profile', label: 'Profile' },
    ...(canManageChampionships ? [{ href: '/manage', label: 'Manage', gold: true }] : []),
    ...(user.isAdmin ? [{ href: '/admin', label: 'Admin', gold: true }] : []),
  ]

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full border-b border-white/10 bg-[#0A1628] px-4 py-4 shadow-2xl">
          <div className="flex flex-col gap-4">
            <div className="grid gap-1 text-sm text-white/75">
              {hasLiveMatch && (
                <Link
                  href="/live"
                  onClick={close}
                  className="flex items-center gap-1.5 rounded-md px-2 py-2 font-semibold text-red-400 hover:bg-white/10"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </Link>
              )}
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className={`rounded-md px-2 py-2 hover:bg-white/10 transition-colors ${
                    'gold' in link && link.gold
                      ? 'font-semibold text-[#C9A84C]'
                      : 'highlight' in link && link.highlight
                      ? 'font-semibold text-white'
                      : 'text-white/75'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="border-t border-white/10 pt-3 flex flex-col gap-3">
              {championships.length > 1 && selectedChampionship && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">Championship:</span>
                  <ChampionshipSelector championships={championships} selectedId={selectedChampionship.id} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">Timezone:</span>
                <TimezoneSelector timezone={user.timezone} />
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-white/15 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check and run tests**

```bash
cd /mnt/sdb/AI/ScoreProphet && npm run type-check 2>&1 | tail -10
npm test 2>&1 | tail -15
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: End-to-end browser verification**

Verify all of the following at `http://localhost:3000`:

1. **Desktop navbar** (wide window):
   - Order: ScoreProphet | Home | [Championship Name] | Tournament | How to Play | [selector] [timezone] [username ▾]
   - Championship name links to `/championships/[id]/predictions`
   - Username dropdown opens showing Profile, (Manage if manager), (Admin if admin), Logout
   - ChampionshipSelector changes championship and updates the name in navbar

2. **Mobile menu** (narrow window):
   - Hamburger opens drawer with: Live (if live), Home, [Championship Name], Tournament, How to Play, Profile, Manage, Admin
   - Bottom section has championship selector (if multiple), timezone, Logout

3. **Championship page** (`/championships/[id]/predictions`):
   - Header shows championship name + selector
   - Tabs: Predictions | Results | Leaderboard — all URL-routed
   - F5 on Results stays on Results
   - "Show pending only" toggle appears and filters correctly

4. **Tournament page** (`/tournament`):
   - 5 tabs: Group Stage / Knockout Bracket / Teams / Top Scorers / Statistics
   - All URL-based, F5 stays on current tab
   - Teams tab shows team grid
   - `/teams` redirects to `/tournament?tab=teams`

5. **Profile/Manage/Admin** remain accessible at existing URLs.

- [ ] **Step 4: Final commit**

```bash
cd /mnt/sdb/AI/ScoreProphet
git add src/components/mobile-menu.tsx
git commit -m "feat: update mobile menu to mirror restructured desktop nav"
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ Navbar order: Home | Championship Name | Tournament | How to Play | Username
- ✅ Championship Name clickable → predictions tab
- ✅ Championship page tabs: Predictions, Results, Leaderboard
- ✅ Pending filter on Predictions tab (not a separate page)
- ✅ Championship selector on championship page AND navbar (option C)
- ✅ Tournament tabs: Group Stage, Knockout Bracket, Teams, Top Scorers, Statistics
- ✅ Teams content moves under Tournament as a tab
- ✅ All tournament/championship tabs URL-based (F5 safe)
- ✅ Username → dropdown with Profile, Manage (conditional), Admin (conditional)
- ✅ Mobile menu mirrors desktop changes
- ✅ No DB changes

**Placeholder scan:** No TBDs, no "implement later", all code blocks are complete.

**Type consistency:** `ChampionshipSelector` receives `championships: { id: number; name: string }[]` throughout. `UsernameDropdown` props `{ username, isAdmin, canManage }` match across navbar and component definition.
