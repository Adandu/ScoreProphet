# Badge popover + profile badges — design

Date: 2026-06-11 · Approved by user (no further approval gates requested)

## Goal

Users can see what each leaderboard badge means (tap/hover popover), and the
profile page shows earned badges with the date and triggering match, plus
locked badges with how to earn them.

## Data model

New Prisma model:

```prisma
model UserAchievement {
  id             Int       @id @default(autoincrement())
  userId         Int
  championshipId Int
  badgeId        String    // CATALOG key, e.g. 'hot_streak'
  earnedAt       DateTime  @default(now())
  matchId        Int?      // triggering match when derivable
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  championship   Championship @relation(fields: [championshipId], references: [id], onDelete: Cascade)
  match          Match?       @relation(fields: [matchId], references: [id], onDelete: SetNull)

  @@unique([userId, championshipId, badgeId])
}
```

## Award mechanism — lazy, on read

No sync-script hook. A lib function `syncAndGetAchievements(championship, memberIds, ranked)`:

1. Computes currently-earned badges per member (existing `evaluateAchievements`,
   extended to also return the **triggering match** per badge).
2. Inserts rows missing from `UserAchievement` (idempotent via the unique
   constraint). `earnedAt` = triggering match kickoff when known, else `now()`
   (Front Runner has no derivable match).
3. Returns the persisted set.

Called from the leaderboard and profile page renders. This backfills everyone
automatically on first page view after deploy, with sensible historical dates.
Badges never disappear once persisted (e.g. Front Runner stays after losing #1).

Triggering match per badge: First Blood → first match with points;
Sharpshooter → 10th exact hit; Hot Streak → 5th match of the streak;
Perfect Round → last match of that round; Century → match crossing 100 pts;
Golden Eye → the pens/ET advance match; Oracle → the final; Front Runner → none.

## UI

- `AchievementBadge` client component: emoji button; tap (mobile) or hover
  (desktop) opens a Base UI popover (`@base-ui/react`, already a dependency)
  styled to the site theme, showing badge name + description. Native `title`
  kept as fallback. Used in `leaderboard-tabs.tsx`.
- Profile page gains a "Badges" section per championship membership:
  earned — emoji, name, description, earn date in the user's timezone, match
  label ("Mexico 1–0 South Africa") when applicable; locked — greyed emoji,
  name, and how to earn.

## Out of scope

No API-feed interaction (zero rate-budget impact). No badge revocation. No
notifications on earning a badge.

## Testing

Unit tests: trigger-match derivation per badge; award idempotency (second sync
inserts nothing); earnedAt falls back to now() when no match. Existing
achievement tests must keep passing.
