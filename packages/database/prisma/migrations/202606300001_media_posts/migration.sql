CREATE TYPE "MediaStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');

CREATE TABLE "MediaPost" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "draftId" TEXT,
  "type" TEXT NOT NULL,
  "channel" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT NOT NULL,
  "visualBrief" TEXT,
  "notes" JSONB,
  "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "MediaPost_leagueId_status_createdAt_idx" ON "MediaPost"("leagueId", "status", "createdAt");
CREATE INDEX "MediaPost_leagueId_draftId_idx" ON "MediaPost"("leagueId", "draftId");
