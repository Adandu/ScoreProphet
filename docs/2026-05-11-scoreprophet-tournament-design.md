# ScoreProphet — Tournament Page (Spec B)

## Goal

Add a read-only `/tournament` page showing the World Cup 2026 group standings and knockout bracket, served from existing DB data with one schema addition.

## Architecture

New protected route `/app/tournament/page.tsx` (server component, `requireAuth`, `revalidate = 60`). Group standings are computed from FINISHED GROUP-stage matches already in the DB. The bracket reads knockout matches directly. One schema addition: `group String?` on `Match`, populated during sync.

Two interactive client components rendered inside a tab switcher:
- `<GroupStageTab>` — receives all GROUP matches, computes standings in-component
- `<KnockoutBracket>` — receives all non-GROUP matches, renders horizontal scrollable bracket

## Tech Stack

Next.js 15, Prisma v7, SQLite, Tailwind CSS — no new dependencies.

---

## Section 1: Schema & Sync

### 1a. Schema change

Add `group` field to `Match`:

```prisma
model Match {
  ...
  group  String?   // e.g. "GROUP_A" ... "GROUP_L", null for knockout matches
  ...
}
```

One migration. No data loss — existing matches get `null` until next sync.

### 1b. NormalizedMatch

Add `group: string | null` to the `NormalizedMatch` interface in `src/lib/football-api.ts`. In `normalizeMatch()`, read `m.group ?? null`.

### 1c. Sync upsert

In `scripts/seed.ts` and `src/actions/admin.ts`, add `group` to the match upsert payload. No other changes — the existing sync pipeline handles the rest.

---

## Section 2: Page & Tabs

### Route

`src/app/tournament/page.tsx` — server component:

```ts
const session = await requireAuth()
const allMatches = await prisma.match.findMany({ orderBy: { kickoff: 'asc' } })
const groupMatches = allMatches.filter(m => m.stage === 'GROUP')
const knockoutMatches = allMatches.filter(m => m.stage !== 'GROUP')
```

Pass `groupMatches` to `<GroupStageTab>` and `knockoutMatches` to `<KnockoutBracket>` inside a `<TournamentTabs>` client wrapper.

### Navbar

Add `<Link href="/tournament">Tournament</Link>` to `src/components/navbar.tsx`, between Results and Leaderboard.

### TournamentTabs component

`src/components/tournament-tabs.tsx` — `'use client'`, `useState<'groups' | 'bracket'>('groups')`. Two tab buttons styled to match the app theme (gold underline on active tab). Renders the selected child component.

---

## Section 3: Group Stage Tab

### Component

`src/components/group-stage-tab.tsx` — `'use client'`. Receives `Match[]` (GROUP stage only).

### Standings computation

For each group (GROUP_A … GROUP_L), filter the FINISHED matches in that group and compute per team:
- **P** (played), **W**, **D**, **L**, **GF** (goals for), **GA** (goals against), **GD** (GF − GA), **Pts** (W×3 + D×1)

Sorted by: Pts desc → GD desc → GF desc.

### Advancing teams logic

- **Top 2** in each group: marked as advancing (green highlight) once all 3 group matches for that group are FINISHED.
- **Best 8 third-place teams**: computed only when all 12 groups have all their matches FINISHED. Take the 3rd-place team from each group, rank by Pts → GD → GF, mark top 8 as advancing.
- Before that threshold: 3rd-place rows show no highlight.

### Display

Responsive grid: 4 columns (≥1280px), 3 columns (≥768px), 2 columns (≥480px), 1 column (mobile).

Each group card:
```
Group A
─────────────────────────────────────────────
Team (crest 20px + name)  W  D  L  GF  GA  GD  Pts
🇧🇷 Brazil                 3  0  0   7   2  +5    9   ← green bg
🇫🇷 France                 2  0  1   5   3  +2    6   ← green bg
🇩🇪 Germany                1  0  2   3   5  -2    3
🇯🇵 Japan                  0  0  3   1   6  -5    0
```

Advancing rows: `bg-green-900/30 text-green-300`. Non-advancing rows: normal text. Pts column bold gold. GD shows `+N` or `-N`.

If no GROUP matches exist: show placeholder "Group stage hasn't started yet."

---

## Section 4: Knockout Bracket Tab

### Component

`src/components/knockout-bracket.tsx` — `'use client'`. Receives `Match[]` (non-GROUP).

### Trophy placement

The trophy occupies the **centre column** of the bracket, sitting above the Final match card. Both bracket halves converge into this column:

```tsx
<div className="flex flex-col items-center justify-center gap-3 px-6">
  <img src="/trophy.webp" alt="World Cup Trophy" className="h-28 w-auto object-contain drop-shadow-lg" />
  <p className="text-[#C9A84C] text-xs tracking-widest uppercase">World Cup 2026</p>
  {/* Final match card rendered here */}
</div>
```

A World Cup trophy image is downloaded and stored at `public/trophy.webp` during setup (implementation task includes this). Falls back to the `🏆` emoji if the image fails to load.

### Bracket structure

The bracket uses a **converging centre** layout: the left half progresses right → centre, the right half progresses left → centre (mirror image), with the trophy and Final match at the centre column:

```
R32  →  R16  →  QF  →  SF  →  [🏆 FINAL]  ←  SF  ←  QF  ←  R16  ←  R32
```

- **Left half**: first 16 R32 matches by kickoff date, rounds progressing rightward
- **Right half**: remaining 16 R32 matches by kickoff date, rounds progressing leftward (columns in reverse order so they mirror correctly)
- **Centre column**: trophy image + "World Cup 2026" label above the Final match card
- The Third-place play-off (`THIRD_PLACE`) is shown in a separate row below the main bracket, labeled "3rd Place Play-off"

Matches are ordered by kickoff within each round to maintain consistent bracket positioning.

### Match slot

Each match slot renders:
```
┌──────────────────────┐
│ 🇧🇷 Brazil      2    │  ← winner highlighted gold if FINISHED
│ 🇫🇷 France      1    │
│ Jun 28, 20:00        │  ← formatted with user timezone
└──────────────────────┘
```

For unplayed slots, team names come from the stored DB value (e.g. *"Winner Group A"*, *"Winner Match 37"*) rendered in `text-white/40`. Score cells are blank. Status `LIVE` shows a pulsing green dot.

### CSS connecting lines

Rounds are flex columns. Connector lines between rounds use `border-r`, `border-t`, `border-b` on wrapper divs — pure Tailwind/CSS, no SVG.

### Horizontal scroll

The bracket container uses `overflow-x-auto` with a minimum width set to accommodate all rounds. A subtle "← scroll →" hint is shown on mobile.

---

## Section 5: Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `group String?` to Match |
| `prisma/migrations/…` | New migration |
| `src/lib/football-api.ts` | Add `group` to NormalizedMatch + normalizeMatch() |
| `scripts/seed.ts` | Add `group` to match upsert |
| `src/actions/admin.ts` | Add `group` to match upsert |
| `src/components/navbar.tsx` | Add Tournament nav link |
| `src/app/tournament/page.tsx` | New page — server component |
| `src/components/tournament-tabs.tsx` | New — tab switcher client component |
| `src/components/group-stage-tab.tsx` | New — group standings client component |
| `src/components/knockout-bracket.tsx` | New — bracket client component |
| `public/trophy.webp` | New — World Cup trophy image |

---

## Section 6: Test Coverage

- Unit test for standings computation: correct W/D/L/GF/GA/GD/Pts from a set of match results
- Unit test for best-8 third-place logic: correct ranking and threshold (only active when all 12 groups complete)
- No tests for bracket rendering (pure display component)
