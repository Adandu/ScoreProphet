# Tournament Winner Prediction — Design Spec

**Date:** 2026-05-19  
**Feature:** World Cup Winner prediction on the Predictions page  
**Points value:** 50 points for a correct pick

---

## Overview

Users can predict which team will win the tournament. The prediction appears above the Group Stage section on the Predictions page. It uses a searchable team dropdown (similar to the Timezone selector) with an explicit Save button. Predictions lock when the first Group Stage match kicks off.

---

## Database

### New model: `TournamentWinnerPrediction`

```prisma
model TournamentWinnerPrediction {
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

- `predictedTeam` stores the team name string exactly as it appears in `Match.homeTeam` / `Match.awayTeam` / `Match.winnerTeam`.
- `pointsAwarded` is `null` until the FINAL match is resolved, then set to 50 (correct) or 0 (incorrect).
- Add back-relations to `User` and `Championship` models.

No changes to the `Championship` model. The actual winner is read from the FINAL stage match's `winnerTeam` field.

### Migration

Generate and apply a Prisma migration for the new model.

---

## Team List Source

The dropdown is populated from the `Team` model (fields: `name`, `shortName`, `crest`). Teams are fetched server-side on the Predictions page and passed as props. The `name` field matches the strings used in Match records, ensuring scoring works correctly.

Sorted alphabetically by `name`. If the Team table is empty (no API sync yet), fall back to deriving distinct teams from all Match records (`homeTeam` / `awayTeam`).

---

## Locking

The prediction is locked when the earliest GROUP stage match's `kickoff <= now`. Computed server-side — no new DB fields. When locked, the selector and save button are replaced with a read-only display of the saved prediction (or a "No prediction set" message).

---

## Server Action

**File:** `src/actions/predictions.ts`

New export: `saveTournamentWinnerPrediction(prevState, formData)`

- Requires auth (`requireAuth`)
- Reads `championshipId` (Int) and `predictedTeam` (String) from `formData`
- Validates: fields present, user is a championship member, prediction is not locked (first GROUP match kickoff > now), `predictedTeam` is a non-empty string
- Upserts `TournamentWinnerPrediction` for `(userId, championshipId)`
- Calls `revalidatePath(\`/championships/\${championshipId}/predictions\`)`
- Returns `{ success: true }` or `{ error: string }`

---

## Scoring

**File:** `src/lib/scoring.ts`

Add `TOURNAMENT_WINNER: 50` to the `SCORING` constant.

Add helper:
```ts
export function calculateTournamentWinnerPoints(predictedTeam: string, actualWinner: string): number {
  return predictedTeam === actualWinner ? SCORING.TOURNAMENT_WINNER : 0
}
```

**File:** `src/actions/admin.ts`

In `recalculateMatchPoints(matchId)`:
- After processing regular predictions and advances, check if `match.stage === 'FINAL'` and `match.winnerTeam` is set.
- If so, fetch all `TournamentWinnerPrediction` rows (across all championships) and update each `pointsAwarded` using `calculateTournamentWinnerPoints`.
- Include these updates in the same `$transaction`.

In `recalculateAllPoints`:
- After match recalculation loop, also trigger tournament winner scoring for any FINAL match that is FINISHED (handled automatically via `recalculateMatchPoints`).

---

## Leaderboard

**File:** `src/lib/leaderboard.ts`

Update `getRankedUsers`:
- Include `tournamentWinnerPredictions` in the user query (`where: { pointsAwarded: { not: null }, championshipId: championship.id }`).
- Add `winnerPts` to the total.
- Add `winner: number` field to `RankedUser` (count of correct winner predictions, 0 or 1).

---

## UI Components

### `TournamentWinnerSelector` (new client component)

**File:** `src/components/tournament-winner-selector.tsx`

Props:
```ts
{
  teams: { name: string; shortName: string; crest: string }[]
  existing: string | null       // currently saved predictedTeam, or null
  championshipId: number
  locked: boolean
}
```

Behaviour:
- Searchable dropdown filtering by team `name` and `shortName` (same pattern as `TimezoneSelector`).
- Each option shows the team crest (16×16 `<Image>`) + team name.
- Selected state shows the chosen team with crest in the trigger button.
- Separate "Save" button that submits via `useActionState` / `useTransition` calling `saveTournamentWinnerPrediction`.
- Pending state: button shows "Saving…" and is disabled.
- Success state: brief "Saved!" confirmation.
- Error state: inline error message below the button.
- When `locked=true`: render read-only display (team crest + name, or "No prediction set") with a "Locked" badge. No dropdown or button.

### Predictions Page

**File:** `src/app/championships/[championshipId]/predictions/page.tsx`

Add to the page query:
```ts
const [matches, userPredictions, userAdvances, teams, winnerPrediction] = await Promise.all([
  // existing queries...
  prisma.team.findMany({ orderBy: { name: 'asc' }, select: { name: true, shortName: true, crest: true } }),
  prisma.tournamentWinnerPrediction.findFirst({ where: { userId: session.userId, championshipId } }),
])
```

Compute `isWinnerLocked`: earliest GROUP stage match kickoff across all matches (not just upcoming) — use `matches` but include finished ones, or query separately.

Actually: query the minimum kickoff of all GROUP matches to determine lock (since the existing query filters `status: { not: 'FINISHED' }`). Add a separate query:
```ts
prisma.match.findFirst({ where: { stage: 'GROUP' }, orderBy: { kickoff: 'asc' }, select: { kickoff: true } })
```

Render above the first `STAGE_ORDER.map(...)` section:

```tsx
<section>
  <h3 className="mb-3 text-lg font-semibold text-[#C9A84C]">🏆 Tournament Winner</h3>
  <TournamentWinnerSelector
    teams={teams}
    existing={winnerPrediction?.predictedTeam ?? null}
    championshipId={championshipId}
    locked={isWinnerLocked}
  />
</section>
```

---

## Fallback: Empty Team Table

If `teams` from the DB is empty, derive teams server-side from all matches:
```ts
const allMatches = await prisma.match.findMany({ select: { homeTeam: true, awayTeam: true, homeTeamCrest: true, awayTeamCrest: true } })
// deduplicate by name, map to { name, shortName: name, crest }
```

This ensures the feature works even before the admin has synced teams from the API.

---

## Out of Scope

- Admin UI to manually set/override the tournament winner (the Final match's `winnerTeam` field, set via match override, is the source of truth).
- Per-championship toggle to enable/disable winner prediction (always enabled).
- Changing an existing prediction after lock (not allowed — same as all other predictions).
