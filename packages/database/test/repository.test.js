import test from "node:test";
import assert from "node:assert/strict";
import { buildStatLeaders, createPrismaRepository } from "../src/repository.js";

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

test("Prisma repository ensures the foundation league when missing", async () => {
  const ensuredLeague = {
    id: "db-league",
    slug: "the-trenches",
    name: "The Trenches",
    gameType: "MADDEN",
    seasons: [{ number: 1, weeks: [{ number: 1, advancesAt: null }] }],
    teams: [],
    games: [],
    players: [],
    importRuns: []
  };
  const calls = { user: 0, league: 0, season: 0, week: 0 };
  const repository = createPrismaRepository({
    user: { upsert: async () => { calls.user += 1; return { id: "user-1" }; } },
    league: {
      findFirst: async () => (calls.league++ === 0 ? null : ensuredLeague),
      upsert: async () => ({ id: "db-league" })
    },
    season: { upsert: async () => { calls.season += 1; return { id: "season-1" }; } },
    week: { upsert: async () => { calls.week += 1; return { id: "week-1" }; } }
  });
  const league = await repository.getLeague("the-trenches");
  assert.equal(league.id, "the-trenches");
  assert.equal(calls.user, 1);
  assert.equal(calls.season, 1);
  assert.equal(calls.week, 1);
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

test("Snallabot raw weekly stats become stat leader categories", () => {
  const leaders = buildStatLeaders({
    rawExports: [
      { dataset: "Passing", payload: [{ rosterId: 17, firstName: "Josh", lastName: "Allen", teamId: 1, passingYds: 333, passingTDs: 4 }] },
      { dataset: "Receiving", payload: [{ rosterId: 88, fullName: "Elite Receiver", teamId: 2, recYds: 129, receptions: 8 }] }
    ],
    teams: [{ externalId: "1", abbreviation: "BUF" }, { externalId: "2", abbreviation: "DET" }]
  });

  assert.equal(leaders[0].key, "passing");
  assert.equal(leaders[0].leaders[0].name, "Josh Allen");
  assert.equal(leaders[0].leaders[0].team, "BUF");
  assert.equal(leaders[0].leaders[0].value, 333);
  assert.equal(leaders[1].leaders[0].secondaryValue, 8);
});

test("Prisma stat leaders read the latest raw Snallabot stat exports", async () => {
  const repository = createPrismaRepository({
    rawExport: {
      findMany: async () => [
        { dataset: "Passing", payload: [{ rosterId: 17, passingYds: 410, passingTDs: 5 }] },
        { dataset: "Passing", payload: [{ rosterId: 18, passingYds: 201 }] }
      ]
    },
    player: {
      findMany: async () => [
        { id: "player-17", externalId: "17", name: "Josh Allen", team: { externalId: "1", abbreviation: "BUF" } }
      ]
    }
  });

  const leaders = await repository.listStatLeaders({ databaseId: "league-1", players: [], teams: [{ externalId: "1", abbr: "BUF" }] });
  assert.equal(leaders[0].title, "Passing");
  assert.equal(leaders[0].leaders[0].name, "Josh Allen");
  assert.equal(leaders[0].leaders[0].value, 410);
});

test("Prisma trade center persists proposals and status updates", async () => {
  const calls = { createdTrade: null, audit: [] };
  const transaction = {
    trade: {
      findFirst: async ({ where, select }) => {
        calls.findTrade = { where, select };
        return { id: "trade-1" };
      },
      create: async ({ data, include }) => {
        calls.createdTrade = { data, include };
        return {
          id: "trade-1",
          leagueId: data.leagueId,
          teamAId: data.teamAId,
          teamBId: data.teamBId,
          submittedById: data.submittedById,
          status: data.status,
          votesFor: data.votesFor,
          votesNeeded: data.votesNeeded,
          submittedAt: new Date("2026-06-26T12:00:00Z"),
          assets: data.assets.create.map((asset, index) => ({ id: `asset-${index}`, ...asset }))
        };
      },
      update: async ({ data }) => ({
        id: "trade-1",
        teamAId: "team-buf",
        teamBId: "team-dal",
        submittedById: "user-1",
        status: data.status,
        votesFor: data.votesFor || 0,
        votesNeeded: 3,
        submittedAt: new Date("2026-06-26T12:00:00Z"),
        assets: []
      })
    },
    auditLog: { create: async ({ data }) => { calls.audit.push(data); } }
  };
  const repository = createPrismaRepository({ $transaction: async (operation) => operation(transaction) });
  const league = { databaseId: "league-1", teams: [{ id: "team-buf", externalId: "buf" }, { id: "team-dal", externalId: "dal" }] };
  const created = await repository.createTradeProposal(league, {
    teamA: "buf",
    teamB: "dal",
    teamAAssets: [{ label: "2027 1st", value: 250, type: "pick" }],
    teamBAssets: [{ label: "RE Micah Parsons", value: 518, type: "player" }]
  }, "user-1");

  assert.equal(created.status, "negotiating");
  assert.equal(created.teamA, "team-buf");
  assert.equal(created.teamAAssets[0].label, "2027 1st");
  assert.equal(calls.createdTrade.data.assets.create.length, 2);
  assert.equal(calls.audit[0].action, "trade.created");

  const updated = await repository.updateTradeStatus(league, "trade-1", "approved", "user-1");
  assert.equal(updated.status, "approved");
  assert.equal(updated.votesFor, 3);
  assert.deepEqual(calls.findTrade.where, { id: "trade-1", leagueId: "league-1" });
  assert.equal(calls.audit[1].action, "trade.status_updated");
});

test("Prisma trade center lists durable trades with assets", async () => {
  const repository = createPrismaRepository({
    trade: {
      findMany: async () => [{
        id: "trade-1",
        teamAId: "team-buf",
        teamBId: "team-dal",
        submittedById: "user-1",
        status: "COMMITTEE_REVIEW",
        votesFor: 1,
        votesNeeded: 3,
        submittedAt: new Date("2026-06-26T12:00:00Z"),
        assets: [
          { side: "TEAM_A", label: "2027 1st", value: 250, type: "pick" },
          { side: "TEAM_B", label: "RE Micah Parsons", value: 518, type: "player" }
        ]
      }]
    }
  });
  const trades = await repository.listTrades({ databaseId: "league-1" });
  assert.equal(trades[0].status, "committee_review");
  assert.equal(trades[0].teamBAssets[0].value, 518);
});

test("Prisma recognition activations are listed and audited", async () => {
  const calls = { created: null, audit: null };
  const client = {
    recognitionActivation: {
      findMany: async ({ where, orderBy }) => {
        calls.findMany = { where, orderBy };
        return [{
          perkId: "offensive-plan",
          name: "Offensive Game Plan",
          lane: "Impact",
          cost: 6,
          activatedAt: new Date("2026-06-26T12:00:00Z"),
          metadata: { detail: "Attack script" }
        }];
      }
    },
    $transaction: async (operation) => operation({
      recognitionActivation: {
        create: async ({ data }) => {
          calls.created = data;
          return { id: "activation-1", ...data };
        }
      },
      auditLog: { create: async ({ data }) => { calls.audit = data; } }
    })
  };
  const repository = createPrismaRepository(client);
  const league = { databaseId: "league-1" };
  const activations = await repository.activateRecognitionPerk(league, "user-1", {
    id: "offensive-plan",
    name: "Offensive Game Plan",
    lane: "Impact",
    cost: 6,
    detail: "Attack script"
  });

  assert.equal(calls.created.perkId, "offensive-plan");
  assert.equal(calls.created.cost, 6);
  assert.equal(calls.audit.action, "recognition.perk_activated");
  assert.equal(calls.findMany.where.userId, "user-1");
  assert.equal(activations[0].id, "offensive-plan");
  assert.equal(activations[0].activatedAt, "2026-06-26T12:00:00.000Z");
});

test("Prisma import recording writes datasets, raw exports, and audit metadata", async () => {
  const calls = { datasets: [], rawExports: [], audit: null, transactionOptions: null };
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
  const repository = createPrismaRepository({ $transaction: async (operation, options) => { calls.transactionOptions = options; return operation(transaction); } });
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
  assert.equal(calls.transactionOptions.timeout, 30000);
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
