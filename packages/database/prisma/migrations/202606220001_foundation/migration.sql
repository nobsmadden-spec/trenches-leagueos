CREATE TYPE "GameType" AS ENUM ('MADDEN', 'CFB');
CREATE TYPE "LeagueRole" AS ENUM ('COACH', 'COMMISSIONER', 'ADMIN');
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED');
CREATE TYPE "GameStatus" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'PLAYED', 'FAIR_SIM', 'FORCE_WIN_HOME', 'FORCE_WIN_AWAY', 'ADMIN_REVIEW');
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED');
CREATE TYPE "DatasetStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED', 'SKIPPED');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "discordId" TEXT NOT NULL UNIQUE,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "League" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "gameType" "GameType" NOT NULL,
  "discordGuildId" TEXT UNIQUE,
  "createdById" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Team" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "abbreviation" TEXT NOT NULL,
  "conference" TEXT NOT NULL,
  "division" TEXT NOT NULL,
  "primaryColor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_leagueId_externalId_key" UNIQUE ("leagueId", "externalId")
);
CREATE INDEX "Team_leagueId_conference_division_idx" ON "Team"("leagueId", "conference", "division");

CREATE TABLE "LeagueMembership" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "teamId" TEXT UNIQUE REFERENCES "Team"("id") ON DELETE SET NULL,
  "role" "LeagueRole" NOT NULL DEFAULT 'COACH',
  "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeagueMembership_leagueId_userId_key" UNIQUE ("leagueId", "userId")
);
CREATE INDEX "LeagueMembership_leagueId_role_status_idx" ON "LeagueMembership"("leagueId", "role", "status");

CREATE TABLE "Season" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "number" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Season_leagueId_number_key" UNIQUE ("leagueId", "number")
);
CREATE INDEX "Season_leagueId_isCurrent_idx" ON "Season"("leagueId", "isCurrent");

CREATE TABLE "Week" (
  "id" TEXT PRIMARY KEY,
  "seasonId" TEXT NOT NULL REFERENCES "Season"("id") ON DELETE CASCADE,
  "number" INTEGER NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'REGULAR_SEASON',
  "startsAt" TIMESTAMP(3),
  "advancesAt" TIMESTAMP(3),
  CONSTRAINT "Week_seasonId_number_phase_key" UNIQUE ("seasonId", "number", "phase")
);

CREATE TABLE "Game" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "seasonId" TEXT NOT NULL REFERENCES "Season"("id") ON DELETE CASCADE,
  "weekId" TEXT NOT NULL REFERENCES "Week"("id") ON DELETE CASCADE,
  "externalId" TEXT NOT NULL,
  "homeTeamId" TEXT NOT NULL REFERENCES "Team"("id"),
  "awayTeamId" TEXT NOT NULL REFERENCES "Team"("id"),
  "status" "GameStatus" NOT NULL DEFAULT 'UNSCHEDULED',
  "scheduledAt" TIMESTAMP(3),
  "homeScore" INTEGER,
  "awayScore" INTEGER,
  "discordThreadId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Game_leagueId_externalId_key" UNIQUE ("leagueId", "externalId")
);
CREATE INDEX "Game_leagueId_seasonId_weekId_status_idx" ON "Game"("leagueId", "seasonId", "weekId", "status");

CREATE TABLE "Player" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "teamId" TEXT REFERENCES "Team"("id") ON DELETE SET NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "overall" INTEGER,
  "devTrait" TEXT,
  "age" INTEGER,
  "attributes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Player_leagueId_externalId_key" UNIQUE ("leagueId", "externalId")
);
CREATE INDEX "Player_leagueId_name_idx" ON "Player"("leagueId", "name");
CREATE INDEX "Player_leagueId_position_overall_idx" ON "Player"("leagueId", "position", "overall");

CREATE TABLE "TeamSeasonSnapshot" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "seasonId" TEXT NOT NULL REFERENCES "Season"("id") ON DELETE CASCADE,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "ties" INTEGER NOT NULL DEFAULT 0,
  "conferenceWins" INTEGER NOT NULL DEFAULT 0,
  "conferenceLosses" INTEGER NOT NULL DEFAULT 0,
  "conferenceTies" INTEGER NOT NULL DEFAULT 0,
  "divisionWins" INTEGER NOT NULL DEFAULT 0,
  "divisionLosses" INTEGER NOT NULL DEFAULT 0,
  "divisionTies" INTEGER NOT NULL DEFAULT 0,
  "pointsFor" INTEGER NOT NULL DEFAULT 0,
  "pointsAgainst" INTEGER NOT NULL DEFAULT 0,
  "turnoverDiff" INTEGER NOT NULL DEFAULT 0,
  "last5Wins" INTEGER NOT NULL DEFAULT 0,
  "last5Losses" INTEGER NOT NULL DEFAULT 0,
  "last5Ties" INTEGER NOT NULL DEFAULT 0,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamSeasonSnapshot_seasonId_teamId_capturedAt_key" UNIQUE ("seasonId", "teamId", "capturedAt")
);
CREATE INDEX "TeamSeasonSnapshot_leagueId_seasonId_capturedAt_idx" ON "TeamSeasonSnapshot"("leagueId", "seasonId", "capturedAt");

CREATE TABLE "ImportRun" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "seasonId" TEXT REFERENCES "Season"("id") ON DELETE SET NULL,
  "weekId" TEXT REFERENCES "Week"("id") ON DELETE SET NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
  "source" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ImportRun_leagueId_createdAt_idx" ON "ImportRun"("leagueId", "createdAt");

CREATE TABLE "ImportDataset" (
  "id" TEXT PRIMARY KEY,
  "importRunId" TEXT NOT NULL REFERENCES "ImportRun"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "status" "DatasetStatus" NOT NULL DEFAULT 'PENDING',
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ImportDataset_importRunId_name_key" UNIQUE ("importRunId", "name")
);

CREATE TABLE "RawExport" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "seasonId" TEXT REFERENCES "Season"("id") ON DELETE SET NULL,
  "weekId" TEXT REFERENCES "Week"("id") ON DELETE SET NULL,
  "importRunId" TEXT REFERENCES "ImportRun"("id") ON DELETE SET NULL,
  "dataset" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RawExport_leagueId_sha256_key" UNIQUE ("leagueId", "sha256")
);
CREATE INDEX "RawExport_leagueId_seasonId_weekId_dataset_idx" ON "RawExport"("leagueId", "seasonId", "weekId", "dataset");

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "leagueId" TEXT NOT NULL REFERENCES "League"("id") ON DELETE CASCADE,
  "actorUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_leagueId_createdAt_idx" ON "AuditLog"("leagueId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
