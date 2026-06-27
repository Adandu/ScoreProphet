/*
  Warnings:

  - Added the required column `tournamentId` to the `Championship` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tournamentId` to the `Match` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Tournament" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed WC 2026 before backfill
INSERT INTO "Tournament" ("name","competitionCode","season","type","isActive","isArchived","startDate","endDate","createdAt")
VALUES ('FIFA World Cup 2026','WC','2026','WORLD_CUP',1,0,'2026-06-11 00:00:00','2026-07-19 00:00:00',CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Championship" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "doubleChanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "competitionCode" TEXT NOT NULL DEFAULT 'WC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    CONSTRAINT "Championship_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Championship" ("competitionCode", "createdAt", "description", "doubleChanceEnabled", "id", "isActive", "name", "updatedAt", "tournamentId") SELECT "competitionCode", "createdAt", "description", "doubleChanceEnabled", "id", "isActive", "name", "updatedAt", 1 AS "tournamentId" FROM "Championship";
DROP TABLE "Championship";
ALTER TABLE "new_Championship" RENAME TO "Championship";
CREATE UNIQUE INDEX "Championship_name_key" ON "Championship"("name");
CREATE INDEX "Championship_competitionCode_idx" ON "Championship"("competitionCode");
CREATE INDEX "Championship_tournamentId_idx" ON "Championship"("tournamentId");
CREATE TABLE "new_Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeTeamCrest" TEXT NOT NULL DEFAULT '',
    "awayTeamCrest" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL,
    "group" TEXT,
    "kickoff" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scoreDuration" TEXT NOT NULL DEFAULT 'REGULAR',
    "regularTimeHomeScore" INTEGER,
    "regularTimeAwayScore" INTEGER,
    "fullTimeHomeScore" INTEGER,
    "fullTimeAwayScore" INTEGER,
    "extraTimeHomeScore" INTEGER,
    "extraTimeAwayScore" INTEGER,
    "penaltiesHomeScore" INTEGER,
    "penaltiesAwayScore" INTEGER,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "winnerTeam" TEXT,
    "competitionCode" TEXT NOT NULL DEFAULT 'WC',
    "detailJson" TEXT NOT NULL DEFAULT '',
    "adminOverride" BOOLEAN NOT NULL DEFAULT false,
    "headToHeadHomeTeamId" TEXT,
    "headToHeadAwayTeamId" TEXT,
    "headToHeadJson" TEXT NOT NULL DEFAULT '[]',
    "headToHeadSyncedAt" DATETIME,
    "tournamentId" INTEGER NOT NULL,
    CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("adminOverride", "awayScore", "awayTeam", "awayTeamCrest", "competitionCode", "detailJson", "externalId", "extraTimeAwayScore", "extraTimeHomeScore", "fullTimeAwayScore", "fullTimeHomeScore", "group", "headToHeadAwayTeamId", "headToHeadHomeTeamId", "headToHeadJson", "headToHeadSyncedAt", "homeScore", "homeTeam", "homeTeamCrest", "id", "kickoff", "penaltiesAwayScore", "penaltiesHomeScore", "regularTimeAwayScore", "regularTimeHomeScore", "scoreDuration", "stage", "status", "winnerTeam", "tournamentId") SELECT "adminOverride", "awayScore", "awayTeam", "awayTeamCrest", "competitionCode", "detailJson", "externalId", "extraTimeAwayScore", "extraTimeHomeScore", "fullTimeAwayScore", "fullTimeHomeScore", "group", "headToHeadAwayTeamId", "headToHeadHomeTeamId", "headToHeadJson", "headToHeadSyncedAt", "homeScore", "homeTeam", "homeTeamCrest", "id", "kickoff", "penaltiesAwayScore", "penaltiesHomeScore", "regularTimeAwayScore", "regularTimeHomeScore", "scoreDuration", "stage", "status", "winnerTeam", 1 AS "tournamentId" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");
CREATE INDEX "Match_status_idx" ON "Match"("status");
CREATE INDEX "Match_kickoff_idx" ON "Match"("kickoff");
CREATE INDEX "Match_competitionCode_stage_idx" ON "Match"("competitionCode", "stage");
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Tournament_isActive_idx" ON "Tournament"("isActive");

-- CreateIndex
CREATE INDEX "Tournament_isArchived_idx" ON "Tournament"("isArchived");

-- CreateIndex
CREATE INDEX "Tournament_competitionCode_idx" ON "Tournament"("competitionCode");
