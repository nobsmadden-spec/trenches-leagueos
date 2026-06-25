import test from "node:test";
import assert from "node:assert/strict";
import { createPrismaRepository } from "../src/repository.js";

test("Prisma repository normalizes durable league records to the API contract", async () => {
  const row = {
    id: "db-league",
    slug: "the-trenches",
    name: "The Trenches",
    gameType: "MADDEN",
    seasons: [{ number: 2, weeks: [{ number: 11, advancesAt: new Date("2026-06-23T02:00:00Z") }] }],
    teams: [{
      id: "team-1", externalId: "buf", name: "Buffalo Bills", abbreviation: "BUF", conference: "AFC", division: "East",
      primaryColor: "#2563eb", ownerMembership: { user: { displayName: "Coach Devin" } },
      seasonSnapshots: [{ wins: 8, losses: 2, pointsFor: 286, pointsAgainst: 201 }]
    }],
    games: [{ id: "game-1", externalId: "g1", awayTeamId: "team-1", homeTeamId: "team-1", status: "SCHEDULED", scheduledAt: null, awayScore: null, homeScore: null }],
    players: [{ id: "player-1", name: "Josh Allen", teamId: "team-1", position: "QB", overall: 95, devTrait: "X-Factor", age: 30, attributes: {} }],
    importRuns: [{ status: "COMPLETE", completedAt: new Date("2026-06-22T22:00:00Z"), datasets: [{ name: "Rosters", status: "COMPLETE", recordCount: 1696 }] }]
  };
  const repository = createPrismaRepository({ league: { findFirst: async () => row } });
  const league = await repository.getLeague("the-trenches");
  assert.equal(league.id, "the-trenches");
  assert.equal(league.teams[0].wins, 8);
  assert.equal(league.teams[0].owner, "Coach Devin");
  assert.equal(league.games[0].status, "scheduled");
  assert.equal(league.players[0].statValue, 95);
  assert.equal(league.syncHealth.datasets[0].records, 1696);
});

test("Prisma repository resolves opaque sessions to current memberships", async () => {
  let touched = false;
  const user = {
    id: "user-1", discordId: "discord-1", username: "devin", displayName: "Coach Devin", avatarUrl: null,
    memberships: [{ leagueId: "db-league", teamId: "team-1", role: "COMMISSIONER", status: "ACTIVE", league: { slug: "the-trenches" } }]
  };
  const repository = createPrismaRepository({
    session: {
      findFirst: async () => ({ id: "session-1", user }),
      update: async () => { touched = true; }
    }
  });
  const identity = await repository.getSessionIdentity("session-1");
  assert.equal(identity.memberships[0].leagueId, "the-trenches");
  assert.equal(identity.memberships[0].role, "commissioner");
  assert.equal(touched, true);
});

test("Prisma membership updates write an audit event in the same transaction", async () => {
  let auditData;
  const updated = {
    id: "member-1", userId: "user-1", teamId: null, role: "COACH", status: "SUSPENDED",
    user: { displayName: "Coach Devin" }, team: null
  };
  const transaction = {
    leagueMembership: { update: async () => updated },
    auditLog: { create: async ({ data }) => { auditData = data; } }
  };
  const repository = createPrismaRepository({ $transaction: async (operation) => operation(transaction) });
  const membership = await repository.updateMembership({ databaseId: "league-1" }, "member-1", { status: "suspended", teamId: null }, "user-1");
  assert.equal(membership.status, "suspended");
  assert.equal(auditData.action, "membership.updated");
  assert.equal(auditData.actorUserId, "user-1");
});

test("Prisma import history returns recent runs with datasets and raw exports", async () => {
  const repository = createPrismaRepository({
    importRun: {
      findMany: async () => [{
        id: "import-1",
        leagueId: "league-1",
        source: "manual-bundle",
        status: "COMPLETE",
        startedAt: new Date("2026-06-22T22:00:00Z"),
        completedAt: new Date("2026-06-22T22:01:00Z"),
        errorMessage: null,
        league: { slug: "the-trenches" },
        datasets: [{ name: "Teams", status: "COMPLETE", recordCount: 32, errorMessage: null }],
        rawExports: [{ dataset: "Teams", source: "manual-bundle", sha256: "abc", storageKey: "raw-exports/teams.json" }]
      }]
    }
  });
  const runs = await repository.listImportRuns({ databaseId: "league-1" });
  assert.equal(runs[0].source, "manual-bundle");
  assert.equal(runs[0].status, "complete");
  assert.equal(runs[0].datasets[0].records, 32);
  assert.equal(runs[0].rawExports[0].sha256, "abc");
});


test("Prisma import recording writes datasets, raw exports, and audit metadata", async () => {
  const calls = { datasets: [], rawExports: [], audit: null };
  const transaction = {
    season: { upsert: async () => ({ id: "season-1" }) },
    week: { upsert: async () => ({ id: "week-1" }) },
    importRun: {
      create: async ({ data }) => ({ id: "import-1", ...data }),
      findUnique: async () => ({
        id: "import-1",
        leagueId: "league-1",
        source: "manual-export",
        status: "PARTIAL",
        startedAt: new Date("2026-06-22T22:00:00Z"),
        completedAt: new Date("2026-06-22T22:00:00Z"),
        errorMessage: null,
        league: { slug: "the-trenches" },
        datasets: calls.datasets.map((entry) => entry.data),
        rawExports: calls.rawExports.map((entry) => entry.create)
      })
    },
    importDataset: { create: async (entry) => { calls.datasets.push(entry); } },
    rawExport: { upsert: async (entry) => { calls.rawExports.push(entry); } },
    auditLog: { create: async ({ data }) => { calls.audit = data; } }
  };
  const repository = createPrismaRepository({ $transaction: async (operation) => operation(transaction) });
  const run = await repository.recordImportRun(
    { id: "the-trenches", databaseId: "league-1", season: 2, week: 11 },
    {
      source: "manual-export",
      datasets: [
        { name: "Rosters", payload: [{ id: "p1" }] },
        { name: "Stats", payload: [], errorMessage: "Missing stat export" }
      ]
    },
    "user-1"
  );

  assert.equal(run.status, "partial");
  assert.equal(run.datasets[0].records, 1);
  assert.equal(calls.rawExports[0].create.importRunId, "import-1");
  assert.match(calls.rawExports[0].create.storageKey, /raw-exports\/the-trenches/);
  assert.equal(calls.audit.action, "import.recorded");
  assert.equal(calls.audit.actorUserId, "user-1");
});

test("Prisma import recording applies normalized teams, players, standings, and games", async () => {
  const calls = { teams: [], players: [], snapshots: [], games: [], audit: null, datasets: [], rawExports: [] };
  const teamByExternalId = new Map();
  const transaction = {
    season: { upsert: async () => ({ id: "season-2" }) },
    week: { upsert: async () => ({ id: "week-11" }) },
    importRun: {
      create: async ({ data }) => ({ id: "import-2", ...data }),
      findUnique: async () => ({
        id: "import-2",
        leagueId: "league-1",
        source: "manual-bundle",
        status: "COMPLETE",
        startedAt: new Date("2026-06-22T22:00:00Z"),
        completedAt: new Date("2026-06-22T22:00:00Z"),
        errorMessage: null,
        league: { slug: "the-trenches" },
        datasets: calls.datasets.map((entry) => entry.data),
        rawExports: calls.rawExports.map((entry) => entry.create)
      })
    },
    importDataset: { create: async (entry) => { calls.datasets.push(entry); } },
    rawExport: { upsert: async (entry) => { calls.rawExports.push(entry); } },
    team: {
      upsert: async ({ create }) => {
        const row = { id: `team-${create.externalId}`, ...create };
        teamByExternalId.set(create.externalId, row);
        calls.teams.push(row);
        return row;
      },
      findFirst: async ({ where }) => teamByExternalId.get(where.externalId)
    },
    player: { upsert: async (entry) => { calls.players.push(entry); } },
    teamSeasonSnapshot: { create: async (entry) => { calls.snapshots.push(entry); } },
    game: { upsert: async (entry) => { calls.games.push(entry); } },
    auditLog: { create: async ({ data }) => { calls.audit = data; } }
  };
  const repository = createPrismaRepository({ $transaction: async (operation) => operation(transaction) });
  await repository.recordImportRun(
    { id: "the-trenches", databaseId: "league-1", season: 2, week: 11 },
    {
      source: "manual-bundle",
      season: 2,
      week: 11,
      datasets: [
        { name: "Teams", payload: [{ externalId: "buf", name: "Buffalo Bills", abbreviation: "BUF", conference: "AFC", division: "East" }] },
        { name: "Players", payload: [{ externalId: "p1", teamExternalId: "buf", name: "Josh Allen", position: "QB", overall: 95 }] },
        { name: "Standings", payload: [{ teamExternalId: "buf", wins: 8, losses: 2, ties: 0, pointsFor: 286, pointsAgainst: 201, turnoverDiff: 7 }] },
        { name: "Schedule", payload: [{ externalId: "g1", homeTeamExternalId: "buf", awayTeamExternalId: "buf", status: "SCHEDULED" }] }
      ]
    },
    "user-1"
  );

  assert.equal(calls.teams.length, 1);
  assert.equal(calls.players.length, 1);
  assert.equal(calls.players[0].create.teamId, "team-buf");
  assert.equal(calls.snapshots[0].data.wins, 8);
  assert.equal(calls.games[0].create.status, "SCHEDULED");
  assert.deepEqual(calls.audit.metadata.applied, { teams: 1, players: 1, standings: 1, games: 1 });
});

test("Prisma owner bootstrap creates an active commissioner membership", async () => {
  let auditData;
  const transaction = {
    team: { findFirst: async () => ({ id: "team-1", externalId: "buf" }) },
    leagueMembership: {
      upsert: async ({ update }) => ({
        id: "member-1",
        userId: "user-1",
        teamId: update.teamId,
        role: update.role,
        status: update.status,
        user: { displayName: "Coach Devin" },
        team: { id: "team-1", name: "Buffalo Bills", abbreviation: "BUF", primaryColor: "#2563eb" }
      })
    },
    auditLog: { create: async ({ data }) => { auditData = data; } }
  };
  const repository = createPrismaRepository({ $transaction: async (operation) => operation(transaction) });
  const membership = await repository.bootstrapOwnerMembership({ databaseId: "league-1" }, "user-1", "buf");
  assert.equal(membership.role, "commissioner");
  assert.equal(membership.status, "active");
  assert.equal(membership.team.abbr, "BUF");
  assert.equal(auditData.action, "membership.bootstrap_owner");
});
