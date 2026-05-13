-- CreateTable
CREATE TABLE "ChampionshipManager" (
    "championshipId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("championshipId", "userId"),
    CONSTRAINT "ChampionshipManager_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChampionshipManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChampionshipInvite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "championshipId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "ChampionshipInvite_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChampionshipInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChampionshipInvite_tokenHash_key" ON "ChampionshipInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ChampionshipInvite_championshipId_revokedAt_idx" ON "ChampionshipInvite"("championshipId", "revokedAt");
