CREATE TABLE "MatchEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "matchId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "minute" INTEGER NOT NULL,
  "teamName" TEXT NOT NULL,
  "playerName" TEXT NOT NULL DEFAULT '',
  "relatedPlayerName" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MatchEvent_matchId_type_minute_teamName_playerName_relatedPlayerName_key" ON "MatchEvent"("matchId", "type", "minute", "teamName", "playerName", "relatedPlayerName");
CREATE INDEX "MatchEvent_type_idx" ON "MatchEvent"("type");
CREATE INDEX "MatchEvent_teamName_idx" ON "MatchEvent"("teamName");

CREATE TABLE "MatchTeamStat" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "matchId" INTEGER NOT NULL,
  "teamName" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  CONSTRAINT "MatchTeamStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MatchTeamStat_matchId_teamName_type_key" ON "MatchTeamStat"("matchId", "teamName", "type");
CREATE INDEX "MatchTeamStat_type_idx" ON "MatchTeamStat"("type");
