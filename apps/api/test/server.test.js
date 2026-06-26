import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { requestHandler } = await import("../src/server.js");

async function request(path, { method = "GET", headers = {}, body } = {}) {
  let status;
  let responseBody = "";
  const response = {
    writeHead(code) { status = code; },
    end(chunk = "") { responseBody += chunk; }
  };
  await requestHandler({ method, url: path, headers: { host: "localhost", ...headers }, body }, response);
  return { status, json: JSON.parse(responseBody) };
}

const get = (path, options) => request(path, options);

test("health and league summary APIs respond", async () => {
  const health = await get("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.status, "ok");
  const ready = await get("/api/ready");
  assert.equal(ready.json.status, "ready");
  assert.equal(ready.json.components.repository, "memory");
  const league = await get("/api/leagues/the-trenches");
  assert.equal(league.json.name, "The Trenches");
  assert.equal(league.json.week, 11);
  assert.ok(league.json.powerRankings.length > 0);
  assert.equal(league.json.workspace.activeRole, "coach");
  const office = await get("/api/leagues/the-trenches/workspace?role=commissioner");
  assert.equal(office.json.activeRole, "commissioner");
  assert.ok(office.json.actions.length > 0);
  const leaders = await get("/api/leagues/the-trenches/stat-leaders");
  assert.equal(leaders.status, 200);
  assert.ok(leaders.json[0].leaders.length > 0);
  const team = await get("/api/leagues/the-trenches/teams/buf");
  assert.equal(team.json.owner, "Coach Devin");
  const me = await get("/api/me");
  assert.equal(me.json.authenticated, true);
});

test("production-style requests cannot claim commissioner access by query string", async () => {
  const previous = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "false";
  try {
    const response = await get("/api/leagues/the-trenches/workspace?role=commissioner");
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previous;
  }
});

test("commissioners can update a membership through the audited API contract", async () => {
  const members = await get("/api/leagues/the-trenches/members");
  assert.equal(members.status, 200);
  const target = members.json.find((member) => member.id === "member-mia");
  const updated = await request(`/api/leagues/the-trenches/members/${target.id}`, {
    method: "PATCH",
    body: { role: "coach", status: "suspended", teamId: null }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.status, "suspended");
  assert.equal(updated.json.teamId, null);
});

test("commissioners can record import runs and update sync health", async () => {
  const recorded = await request("/api/leagues/the-trenches/import-runs", {
    method: "POST",
    body: {
      source: "manual-export",
      datasets: [
        { name: "Rosters", payload: [{ id: "p1" }, { id: "p2" }] },
        { name: "Schedule", payload: [{ id: "g1" }], errorMessage: "Week is incomplete" }
      ]
    }
  });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.json.status, "partial");
  assert.equal(recorded.json.datasets[0].records, 2);
  assert.match(recorded.json.datasets[0].storageKey, /raw-exports\/the-trenches/);

  const sync = await get("/api/leagues/the-trenches/sync-health");
  assert.equal(sync.json.status, "partial");
  assert.equal(sync.json.datasets[1].status, "failed");
});

test("commissioners can record a leagueos import bundle", async () => {
  const recorded = await request("/api/leagues/the-trenches/import-runs", {
    method: "POST",
    body: {
      schemaVersion: "leagueos-import/v1",
      source: "manual-bundle",
      season: 2,
      week: 11,
      teams: [{ externalId: "buf", name: "Buffalo Bills", abbr: "BUF", conference: "AFC", division: "East" }],
      players: [{ externalId: "p1", teamExternalId: "buf", name: "Josh Allen", position: "QB", overall: 95 }],
      standings: [{ teamExternalId: "buf", wins: 8, losses: 2 }],
      games: [{ externalId: "g1", homeTeamExternalId: "buf", awayTeamExternalId: "buf" }]
    }
  });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.json.source, "manual-bundle");
  assert.equal(recorded.json.datasets.length, 4);
  const history = await get("/api/leagues/the-trenches/import-runs");
  assert.equal(history.status, 200);
  assert.equal(history.json[0].source, "manual-bundle");
});

test("commissioners can import a Snallabot export from a URL", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: null,
    async json() {
      return {
        schemaVersion: "snallabot-export/v1",
        source: "snallabot-url-test",
        season: 3,
        weekIndex: 10,
        teamsExport: { leagueTeamInfoList: [{ teamId: 1, displayName: "Buffalo Bills", abbrName: "BUF", divName: "East" }] },
        standingsExport: { teamStandingInfoList: [{ teamId: 1, conferenceName: "AFC", totalWins: 8, totalLosses: 2 }] },
        schedulesExport: { gameScheduleInfoList: [{ scheduleId: 99, weekIndex: 10, homeTeamId: 1, awayTeamId: 1 }] },
        rosterExports: [{ rosterInfoList: [{ rosterId: 17, teamId: 1, firstName: "Josh", lastName: "Allen", position: "QB" }] }]
      };
    }
  });
  try {
    const recorded = await request("/api/leagues/the-trenches/import-runs/from-url", {
      method: "POST",
      body: { url: "https://exports.example.test/the-trenches.json" }
    });
    assert.equal(recorded.status, 201);
    assert.equal(recorded.json.source, "snallabot-url-test");
    assert.equal(recorded.json.datasets.length, 4);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Snallabot receiver records pushed exports with a token", async () => {
  const previousToken = process.env.SNALLABOT_WEBHOOK_TOKEN;
  process.env.SNALLABOT_WEBHOOK_TOKEN = "receiver-test-token";
  try {
    const recorded = await request("/api/import-receivers/snallabot/the-trenches?token=receiver-test-token", {
      method: "POST",
      body: {
        schemaVersion: "snallabot-export/v1",
        source: "snallabot-push-test",
        season: 3,
        weekIndex: 10,
        teamsExport: { leagueTeamInfoList: [{ teamId: 1, displayName: "Buffalo Bills", abbrName: "BUF", divName: "East" }] },
        standingsExport: { teamStandingInfoList: [{ teamId: 1, conferenceName: "AFC", totalWins: 8, totalLosses: 2 }] },
        schedulesExport: { gameScheduleInfoList: [{ scheduleId: 99, weekIndex: 10, homeTeamId: 1, awayTeamId: 1 }] },
        rosterExports: [{ rosterInfoList: [{ rosterId: 17, teamId: 1, firstName: "Josh", lastName: "Allen", position: "QB" }] }]
      }
    });
    assert.equal(recorded.status, 201);
    assert.equal(recorded.json.ok, true);
    assert.equal(recorded.json.importRun.source, "snallabot-push-test");
    assert.equal(recorded.json.importRun.datasets.length, 4);
  } finally {
    if (previousToken === undefined) delete process.env.SNALLABOT_WEBHOOK_TOKEN;
    else process.env.SNALLABOT_WEBHOOK_TOKEN = previousToken;
  }
});

test("Snallabot receiver accepts appended destination paths", async () => {
  const previousToken = process.env.SNALLABOT_WEBHOOK_TOKEN;
  process.env.SNALLABOT_WEBHOOK_TOKEN = "receiver-test-token";
  try {
    const teams = await request("/api/import-receivers/snallabot/the-trenches/token/receiver-test-token/ps5/1315799985069228032/leagueteams", {
      method: "POST",
      body: { leagueTeamInfoList: [{ teamId: 1, displayName: "Buffalo Bills", abbrName: "BUF", divName: "East" }] }
    });
    assert.equal(teams.status, 201);
    assert.equal(teams.json.importRun.datasets[0].name, "Teams");

    const roster = await request("/api/import-receivers/snallabot/the-trenches/token/receiver-test-token/ps5/1315799985069228032/team/1/roster", {
      method: "POST",
      body: { rosterInfoList: [{ rosterId: 17, firstName: "Josh", lastName: "Allen", position: "QB" }] }
    });
    assert.equal(roster.status, 201);
    assert.equal(roster.json.importRun.datasets[0].name, "Players");

    const stats = await request("/api/import-receivers/snallabot/the-trenches/token/receiver-test-token/ps5/1315799985069228032/week/reg/7/passing", {
      method: "POST",
      body: { playerPassingStatInfoList: [{ statId: 1, passingYds: 300 }] }
    });
    assert.equal(stats.status, 201);
    assert.equal(stats.json.importRun.datasets[0].name, "Passing");
  } finally {
    if (previousToken === undefined) delete process.env.SNALLABOT_WEBHOOK_TOKEN;
    else process.env.SNALLABOT_WEBHOOK_TOKEN = previousToken;
  }
});

test("Snallabot receiver rejects invalid tokens", async () => {
  const previousToken = process.env.SNALLABOT_WEBHOOK_TOKEN;
  process.env.SNALLABOT_WEBHOOK_TOKEN = "receiver-test-token";
  try {
    const recorded = await request("/api/import-receivers/snallabot/the-trenches?token=wrong", {
      method: "POST",
      body: { schemaVersion: "leagueos-import/v1", teams: [] }
    });
    assert.equal(recorded.status, 401);
  } finally {
    if (previousToken === undefined) delete process.env.SNALLABOT_WEBHOOK_TOKEN;
    else process.env.SNALLABOT_WEBHOOK_TOKEN = previousToken;
  }
});

test("commissioners can inspect rejected Snallabot receiver attempts", async () => {
  const previousToken = process.env.SNALLABOT_WEBHOOK_TOKEN;
  process.env.SNALLABOT_WEBHOOK_TOKEN = "receiver-test-token";
  try {
    const rejected = await request("/api/import-receivers/snallabot/the-trenches?token=receiver-test-token", {
      method: "POST",
      body: { hello: "world" }
    });
    assert.equal(rejected.status, 400);
    const attempts = await get("/api/leagues/the-trenches/receiver-attempts");
    assert.equal(attempts.status, 200);
    assert.equal(attempts.json[0].status, "rejected");
    assert.equal(attempts.json[0].source, "snallabot-receiver");
    assert.deepEqual(attempts.json[0].preview.keys, ["hello"]);
  } finally {
    if (previousToken === undefined) delete process.env.SNALLABOT_WEBHOOK_TOKEN;
    else process.env.SNALLABOT_WEBHOOK_TOKEN = previousToken;
  }
});


test("owner bootstrap only grants commissioner access to the configured Discord account", async () => {
  const previousOwner = process.env.LEAGUE_OWNER_DISCORD_ID;
  const previousDemoMode = process.env.DEMO_MODE;
  process.env.LEAGUE_OWNER_DISCORD_ID = "demo-commissioner";
  process.env.DEMO_MODE = "true";
  try {
    const response = await request("/api/leagues/the-trenches/bootstrap-owner", { method: "POST", body: {} });
    assert.equal(response.status, 201);
    assert.equal(response.json.role, "commissioner");
    assert.equal(response.json.status, "active");
  } finally {
    if (previousOwner === undefined) delete process.env.LEAGUE_OWNER_DISCORD_ID;
    else process.env.LEAGUE_OWNER_DISCORD_ID = previousOwner;
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  }
});
