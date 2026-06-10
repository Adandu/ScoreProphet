-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KnockoutAdvance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "championshipId" INTEGER NOT NULL,
    "predictedTeam" TEXT NOT NULL,
    "pointsAwarded" INTEGER,
    CONSTRAINT "KnockoutAdvance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnockoutAdvance_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_KnockoutAdvance" ("championshipId", "id", "matchId", "pointsAwarded", "predictedTeam", "userId") SELECT "championshipId", "id", "matchId", "pointsAwarded", "predictedTeam", "userId" FROM "KnockoutAdvance";
DROP TABLE "KnockoutAdvance";
ALTER TABLE "new_KnockoutAdvance" RENAME TO "KnockoutAdvance";
CREATE INDEX "KnockoutAdvance_matchId_idx" ON "KnockoutAdvance"("matchId");
CREATE UNIQUE INDEX "KnockoutAdvance_userId_matchId_championshipId_key" ON "KnockoutAdvance"("userId", "matchId", "championshipId");
CREATE TABLE "new_Prediction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "championshipId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "pointsAwarded" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Prediction" ("championshipId", "createdAt", "id", "matchId", "pointsAwarded", "type", "userId", "value") SELECT "championshipId", "createdAt", "id", "matchId", "pointsAwarded", "type", "userId", "value" FROM "Prediction";
DROP TABLE "Prediction";
ALTER TABLE "new_Prediction" RENAME TO "Prediction";
CREATE INDEX "Prediction_matchId_championshipId_idx" ON "Prediction"("matchId", "championshipId");
CREATE UNIQUE INDEX "Prediction_userId_matchId_type_championshipId_key" ON "Prediction"("userId", "matchId", "type", "championshipId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
