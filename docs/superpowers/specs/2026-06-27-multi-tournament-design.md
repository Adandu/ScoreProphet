# Multi-Tournament Architecture — Design Spec
**Date:** 2026-06-27
**Status:** Approved

## Goal

Make ScoreProphet capable of running multiple tournaments (WC, UCL, Euro, etc.) independently, with isolated championships, predictions, and leaderboards per tournament. Users can switch between active tournaments via the navbar and access finished tournaments from their profile. The WC 2026 data is preserved as the first tournament record.

## Scope

**Phase 1 (this spec):** Schema, data migration, admin tournament management, navigation switcher, per-tournament page scoping, read-only archive view.

**Phase 2 (future):** Format-specific bracket UIs for non-WC tournaments (UCL league phase, Euro, etc.) — built when API data for those tournaments becomes available.

---

## 1. Data Model

### New model: `Tournament`

```prisma
model Tournament {
  id              Int            @id @default(autoincrement())
  name            String         // e.g. "FIFA World Cup 2026"
  competitionCode String         // e.g. "WC", "CL", "EC"
  season          String         // e.g. "2026", "2026-27"
  type            String         // "WORLD_CUP" | "CHAMPIONS_LEAGUE" | "CONTINENTAL" | "DOMESTIC_LEAGUE"
  isActive        Boolean        @default(true)
  isArchived      Boolean        @default(false)
  startDate       DateTime
  endDate         DateTime
  createdAt       DateTime       @default(now())
  matches         Match[]
  championships   Championship[]

  @@index([isActive])
  @@index([isArchived])
}
```

### Modified: `Match`

- Add `tournamentId Int` FK → `Tournament` (required, backfilled via migration)
- Keep `competitionCode String` — used by sync scripts, kept for compatibility
- Change `stage Stage` (enum) → `stage String` — the API returns stage names as strings; the enum was an artificial constraint that breaks for non-WC formats

### Modified: `Championship`

- Add `tournamentId Int` FK → `Tournament` (required, backfilled via migration)

### Dropped: `Stage` enum

Replaced by plain `String`. Existing values (`"GROUP"`, `"ROUND_OF_32"`, etc.) remain as strings in the DB — no data loss.

---

## 2. Data Migration

A Prisma migration + seed script runs automatically on deploy:

1. **Insert WC 2026 Tournament:**
   ```
   name:            "FIFA World Cup 2026"
   competitionCode: "WC"
   season:          "2026"
   type:            "WORLD_CUP"
   isActive:        true
   isArchived:      false
   startDate:       2026-06-11
   endDate:         2026-07-19
   ```

2. **Backfill all `Match` rows** → set `tournamentId` to the WC 2026 Tournament id.

3. **Backfill all `Championship` rows** → set `tournamentId` to the WC 2026 Tournament id.

The migration is idempotent — safe to re-run.

---

## 3. Admin Tournament Management

The admin panel (`/admin`) gets a **Tournaments** section replacing the current global "Sync Fixtures" and "Recalculate Points" buttons.

### Add Tournament flow

1. Admin clicks "Add Tournament"
2. App queries football-data.org `/competitions` endpoint — returns all competitions the API has data for
3. Admin picks a competition + season from the list (only real API-available options shown)
4. App creates the `Tournament` record and triggers an initial fixture sync for that competition/season
5. Tournament appears in the admin list immediately

### Per-tournament controls

For each tournament in the list:

| Action | Behaviour |
|--------|-----------|
| Sync Fixtures | Pull latest match/result data from football-data.org for this tournament |
| Recalculate Points | Recompute `pointsAwarded` for all predictions in this tournament |
| Set Active / Archive | Flip `isActive: false`, `isArchived: true` — removes it from navbar switcher; users can still access via profile history |

---

## 4. Navigation

### Navbar tournament switcher

- Appears only when **2+ active tournaments** exist simultaneously
- When only one active tournament (current state: WC 2026 only), no switcher shown — navbar looks identical to today
- Selected tournament stored in a **cookie** (`selected_tournament_id`) — persists across page loads and sessions
- Defaults to the most recently created active tournament for new sessions

### Page scoping

All existing pages scope their DB queries to the currently selected tournament:

- `/predictions` — matches in selected tournament only
- `/results` — results in selected tournament only
- `/leaderboard` — scores within selected tournament's championships only
- `/tournament` — bracket/group stage for selected tournament
- `/live` — live matches in selected tournament only
- `/matches/[matchId]` — accessible as long as match belongs to selected tournament

The championship selector (existing dropdown) shows only championships belonging to the currently selected tournament.

### Profile page — history

A **"Past Tournaments"** section lists all archived tournaments the user participated in (has at least one `ChampionshipMember` record for a championship in that tournament). Each entry shows:
- Tournament name, season, dates
- Their final rank within their championship(s)
- Link → enters full read-only view of that tournament

---

## 5. Archive / Read-Only View

When a user views an archived tournament (via profile history link), the selected tournament context switches to that archived tournament. All pages render with their data but:

- A banner at the top of every page: *"This tournament has ended — viewing historical results"*
- Prediction forms are replaced by read-only prediction displays
- No "Submit", "Edit", or "Join" actions anywhere
- Championship management (invite links, manage members) is hidden
- The Live page is excluded from the nav
- ProphetBot does not predict for archived tournaments

Returning to the active tournament: user clicks "Back to active tournament" in the banner or uses the navbar switcher.

---

## 6. Bracket UI

The Tournament page (`/tournament`) dispatches to a bracket renderer based on `Tournament.type`:

| Type | Phase 1 renderer | Phase 2 renderer |
|------|-----------------|-----------------|
| `WORLD_CUP` | Existing WC bracket (unchanged) | — |
| `CHAMPIONS_LEAGUE` | Match schedule list | UCL-specific bracket |
| `CONTINENTAL` | Match schedule list | Euro/Copa bracket |
| `DOMESTIC_LEAGUE` | Match schedule list | League table view |

Phase 1 ships the dispatcher + the "match schedule list" fallback. Phase 2 builds format-specific UIs when API data is available.

---

## 7. What Does Not Change

- URL structure — tournament context is global state (cookie), not per-URL
- Authentication and user model
- Championship creation flow (admin creates championships within a tournament)
- Point scoring rules — per championship, per tournament
- Existing WC 2026 bracket component — untouched

---

## 8. Out of Scope

- Per-tournament point rule configuration (currently per-championship — stays that way)
- Public tournament view (unauthenticated users)
- Cross-tournament leaderboard or statistics
- Importing historical data for past tournaments (e.g. WC 2022)
