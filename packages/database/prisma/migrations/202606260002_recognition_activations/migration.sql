CREATE TABLE "RecognitionActivation" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "perkId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lane" TEXT NOT NULL,
  "cost" INTEGER NOT NULL DEFAULT 0,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB
);

CREATE UNIQUE INDEX "RecognitionActivation_leagueId_userId_perkId_key" ON "RecognitionActivation"("leagueId", "userId", "perkId");
CREATE INDEX "RecognitionActivation_leagueId_userId_activatedAt_idx" ON "RecognitionActivation"("leagueId", "userId", "activatedAt");
