-- AlterTable
ALTER TABLE "metrics" ADD COLUMN "firstTokenAt" DATETIME;
ALTER TABLE "metrics" ADD COLUMN "generationEndedAt" DATETIME;
ALTER TABLE "metrics" ADD COLUMN "generationStartedAt" DATETIME;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "endedAt" DATETIME;

-- AlterTable
ALTER TABLE "votes" ADD COLUMN "responseTime" INTEGER;
ALTER TABLE "votes" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "votes" ADD COLUMN "voteOrder" INTEGER;

-- CreateTable
CREATE TABLE "event_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" TEXT,
    CONSTRAINT "event_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "event_logs_sessionId_idx" ON "event_logs"("sessionId");

-- CreateIndex
CREATE INDEX "event_logs_eventType_idx" ON "event_logs"("eventType");

-- CreateIndex
CREATE INDEX "event_logs_timestamp_idx" ON "event_logs"("timestamp");
