# Per-Championship Predictions & Double Chance Toggle — Design Spec

## Goal

Bind predictions to championships (not global), and add a per-championship `doubleChanceEnabled` flag. When double chance is disabled for a championship, the option is completely hidden from the predictions page and excluded from the leaderboard — no trace in the UI.

---

## Section 1: Data Model

### Schema changes

**`Championship`** — add:
```prisma
doubleChanceEnabled Boolean @default(true)
```

**`Prediction`** — add `championshipId`, update unique constraint:
```prisma
championshipId Int
@@unique([userId, matchId, type, championshipId])
// replaces @@unique([userId, matchId, type])
```

**`KnockoutAdvance`** — add `championshipId`, update unique constraint:
```prisma
championshipId Int
@@unique([userId, matchId, championshipId])
// replaces @@unique([userId, matchId])
```

### Migration

New non-nullable columns added with `DEFAULT 0` in the raw SQLite migration. Existing prediction and advance rows land at `championshipId = 0`, which matches no real championship — effectively orphaned. Acceptable since the app is pre-launch and no real tournament data exists.

### `ChampionshipSummary` (src/lib/championships.ts)

Add `doubleChanceEnabled: boolean` to the interface and to the `getUserChampionships` and `requireChampionshipAccess` return values so pages downstream don't need extra queries.

---

## Section 2: Server Actions

All changes in `src/actions/predictions.ts`. All four actions read `championshipId` from a hidden form input.

**`savePrediction`**
- Reads `championshipId` from form data
- Verifies the user is a member of that championship (via `prisma.championshipMember`)
- Rejects `DOUBLE_CHANCE` submissions when `championship.doubleChanceEnabled` is false
- Upsert scoped to `(userId, matchId, type, championshipId)`

**`deletePrediction`**
- No championship scoping needed — delete by `predictionId` with ownership check already in place

**`saveKnockoutAdvance`**
- Reads `championshipId` from form data
- Validates membership
- Upsert scoped to `(userId, matchId, championshipId)`

**`resetMatchPredictions`**
- Reads `championshipId` from form data
- Deletes only predictions and advances matching `(userId, matchId, championshipId)`

**New: `setChampionshipDoubleChance`** in `src/actions/admin.ts`
- Admin-only
- Updates `championship.doubleChanceEnabled`
- Revalidates `/championships/[id]/predictions` and `/championships/[id]/leaderboard`

**`recalculateMatchPoints`** — unchanged. Sets `pointsAwarded` on every prediction based on match result. Whether those points are included in a championship's total is decided at query time, not storage time. This means toggling `doubleChanceEnabled` takes effect immediately on the leaderboard without requiring recalculation.

---

## Section 3: Leaderboard

**`src/lib/leaderboard.ts`**

`getRankedUsers` signature changes to `getRankedUsers(userIds: number[], championship: { id: number, doubleChanceEnabled: boolean })`. The `userIds` parameter stays (controls which users appear in the table); `championship` is a new required second parameter. Both the `predictions` and `advances` include-filters gain `championshipId: championship.id`.

- `predictions` include filter adds `championshipId: championship.id`
- `advances` include filter adds `championshipId: championship.id`
- When `!championship.doubleChanceEnabled`:
  - Double chance predictions excluded from `total`
  - `double` field omitted from the returned shape (`double?: number`)

**`src/app/championships/[championshipId]/leaderboard/page.tsx`**

- Pass championship object to `getRankedUsers`
- When `!championship.doubleChanceEnabled`, the "Double" column header and all cells are not rendered

---

## Section 4: Predictions Page & Form

**`src/app/championships/[championshipId]/predictions/page.tsx`**

- `predByMatch` query adds `championshipId` filter
- `advanceByMatch` query adds `championshipId` filter
- Passes `championshipId` and `doubleChanceEnabled` down to `PredictionForm` and `ResetButton`

**`src/components/prediction-form.tsx`**

- New props: `championshipId: number`, `doubleChanceEnabled: boolean`
- `championshipId` added as hidden input in every `<form>` inside the component
- When `!doubleChanceEnabled`: double chance section not rendered (no buttons, no label)
- Locked-match badge display omits `DOUBLE_CHANCE` badges when `!doubleChanceEnabled`

**`src/components/reset-button.tsx`**

- Accepts `championshipId: number`, passes as hidden input

---

## Section 5: Admin UI

**`src/app/admin/page.tsx`** — include `doubleChanceEnabled` in the championship query select.

**`src/app/admin/_admin-client.tsx`**

- Add a "Double chance" toggle (checkbox or switch) per championship in the championship management section
- Calls `setChampionshipDoubleChance` on change
- No confirmation dialog — immediately reversible

---

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `doubleChanceEnabled` to Championship; add `championshipId` + update unique constraints on Prediction and KnockoutAdvance |
| `prisma/migrations/…` | New migration |
| `src/lib/championships.ts` | Add `doubleChanceEnabled` to `ChampionshipSummary`, `getUserChampionships`, `requireChampionshipAccess` |
| `src/lib/leaderboard.ts` | Accept championship param; filter by championshipId; conditionally exclude double chance |
| `src/actions/predictions.ts` | All 4 actions: read + validate `championshipId`; scope DB operations |
| `src/actions/admin.ts` | Add `setChampionshipDoubleChance` action |
| `src/app/championships/[championshipId]/predictions/page.tsx` | Filter predictions/advances by championshipId; pass new props |
| `src/app/championships/[championshipId]/leaderboard/page.tsx` | Pass championship to getRankedUsers; conditional Double column |
| `src/components/prediction-form.tsx` | Add `championshipId` + `doubleChanceEnabled` props; hidden inputs; conditional double chance section |
| `src/components/reset-button.tsx` | Add `championshipId` prop + hidden input |
| `src/app/admin/page.tsx` | Include `doubleChanceEnabled` in championship query |
| `src/app/admin/_admin-client.tsx` | Double chance toggle per championship |

---

## Test Coverage

- Unit test: `getRankedUsers` excludes double chance from total when `doubleChanceEnabled = false`
- Unit test: `getRankedUsers` includes double chance when `doubleChanceEnabled = true`
- Existing leaderboard tests updated to pass the championship parameter
- `savePrediction` server action: double chance rejected when disabled (integration or unit with mocked prisma)
