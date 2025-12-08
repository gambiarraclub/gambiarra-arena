-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "maxTokens" INTEGER NOT NULL DEFAULT 400,
    "temperature" REAL NOT NULL DEFAULT 0.8,
    "deadlineMs" INTEGER NOT NULL DEFAULT 90000,
    "seed" INTEGER,
    "svgMode" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "votingStatus" TEXT NOT NULL DEFAULT 'closed',
    "revealedCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rounds_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_rounds" ("deadlineMs", "endedAt", "id", "index", "maxTokens", "prompt", "seed", "sessionId", "startedAt", "svgMode", "temperature") SELECT "deadlineMs", "endedAt", "id", "index", "maxTokens", "prompt", "seed", "sessionId", "startedAt", "svgMode", "temperature" FROM "rounds";
DROP TABLE "rounds";
ALTER TABLE "new_rounds" RENAME TO "rounds";
CREATE UNIQUE INDEX "rounds_sessionId_index_key" ON "rounds"("sessionId", "index");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
