-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "externalId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeTeamCrest" TEXT NOT NULL DEFAULT '',
    "awayTeamCrest" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL,
    "kickoff" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "winnerTeam" TEXT,
    "adminOverride" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "pointsAwarded" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnockoutAdvance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "predictedTeam" TEXT NOT NULL,
    "pointsAwarded" INTEGER,
    CONSTRAINT "KnockoutAdvance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnockoutAdvance_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_userId_matchId_type_key" ON "Prediction"("userId", "matchId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "KnockoutAdvance_userId_matchId_key" ON "KnockoutAdvance"("userId", "matchId");
