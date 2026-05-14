ALTER TABLE "User" ADD COLUMN "predictionReminderEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PredictionReminder" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "matchId" INTEGER NOT NULL,
  "championshipId" INTEGER NOT NULL,
  "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PredictionReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PredictionReminder_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PredictionReminder_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PredictionReminder_userId_matchId_championshipId_key" ON "PredictionReminder"("userId", "matchId", "championshipId");
CREATE INDEX "PredictionReminder_matchId_idx" ON "PredictionReminder"("matchId");
