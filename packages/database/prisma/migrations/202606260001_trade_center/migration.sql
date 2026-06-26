CREATE TYPE "TradeStatus" AS ENUM ('NEGOTIATING', 'COMMITTEE_REVIEW', 'APPROVED', 'DENIED');
CREATE TYPE "TradeSide" AS ENUM ('TEAM_A', 'TEAM_B');

CREATE TABLE "Trade" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "teamAId" TEXT NOT NULL REFERENCES "Team"("id"),
  "teamBId" TEXT NOT NULL REFERENCES "Team"("id"),
  "submittedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "status" "TradeStatus" NOT NULL DEFAULT 'NEGOTIATING',
  "votesFor" INTEGER NOT NULL DEFAULT 0,
  "votesNeeded" INTEGER NOT NULL DEFAULT 3,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Trade_leagueId_status_submittedAt_idx" ON "Trade"("leagueId", "status", "submittedAt");
CREATE INDEX "Trade_teamAId_idx" ON "Trade"("teamAId");
CREATE INDEX "Trade_teamBId_idx" ON "Trade"("teamBId");

CREATE TABLE "TradeAsset" (
  "id" TEXT PRIMARY KEY,
  "tradeId" TEXT NOT NULL REFERENCES "Trade"("id") ON DELETE CASCADE,
  "side" "TradeSide" NOT NULL,
  "label" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL DEFAULT 'asset',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TradeAsset_tradeId_side_idx" ON "TradeAsset"("tradeId", "side");
