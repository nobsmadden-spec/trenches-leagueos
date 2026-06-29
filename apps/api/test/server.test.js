import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { requestHandler } = await import("../src/server.js");

async function request(path, { method = "GET", headers = {}, body } = {}) {
  let status;
  let responseHeaders = {};
  let responseBody = "";
  const response = {
    writeHead(code, headers = {}) { status = code; responseHeaders = headers; },
    end(chunk = "") { responseBody += chunk; }
  };
  await requestHandler({ method, url: path, headers: { host: "localhost", ...headers }, body }, response);
  return {
    status,
    headers: responseHeaders,
    body: responseBody,
    get json() { return JSON.parse(responseBody); }
  };
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
  const games = await get("/api/leagues/the-trenches/games");
  assert.equal(games.status, 200);
  assert.ok(games.json[0].awayTeam);
  assert.ok(games.json[0].homeTeam);
  const intelligence = await get(`/api/leagues/the-trenches/games/${games.json[0].id}/intelligence`);
  assert.equal(intelligence.status, 200);
  assert.equal(intelligence.json.dataWeek, 11);
  assert.ok(intelligence.json.edges.some((edge) => edge.label === "Scoring"));
  assert.match(intelligence.json.projection.note, /measured edges|clear favorite/);
  const strikeBoard = await get("/api/leagues/the-trenches/strike-board");
  assert.equal(strikeBoard.status, 200);
  assert.equal(strikeBoard.json.rules.hardLimit, 5);
  assert.ok(strikeBoard.json.activeCases.length > 0);
  const trades = await get("/api/leagues/the-trenches/trades");
  assert.equal(trades.status, 200);
  assert.ok(trades.json[0].valueCheck);
  assert.ok(trades.json[0].teamAAssets[0].value >= 0);
  const tradeAssets = await get("/api/leagues/the-trenches/trade-assets");
  assert.equal(tradeAssets.status, 200);
  assert.ok(tradeAssets.json[0].assets.length > 0);
  const billsAssets = tradeAssets.json.find((entry) => entry.teamAbbr === "BUF");
  assert.ok(billsAssets.rosterCount > 0);
  assert.match(billsAssets.assets[0].label, /OVR/);
  assert.equal(billsAssets.assets[0].type, "player");
  const recognition = await get("/api/leagues/the-trenches/recognition");
  assert.equal(recognition.status, 200);
  assert.ok(recognition.json.leaders.length > 0);
  assert.ok(recognition.json.breakdown.some((item) => item.lane === "Impact"));
  assert.ok(recognition.json.scorecard.some((item) => item.label === "Stream or proof"));
  assert.ok(recognition.json.perks.some((perk) => perk.name === "Offensive Game Plan"));
  const mediaDrafts = await get("/api/leagues/the-trenches/media-drafts");
  assert.equal(mediaDrafts.status, 200);
  assert.ok(mediaDrafts.json.some((draft) => draft.channel === "#announcements" && draft.body.includes("Week 11")));
  assert.ok(mediaDrafts.json.some((draft) => draft.id === "matchup-watch" && draft.body.includes("Measured edges")));
  const me = await get("/api/me");
  assert.equal(me.json.authenticated, true);
});

test("static assets are served with their real content types", async () => {
  const styles = await request("/styles.css");
  assert.equal(styles.status, 200);
  assert.match(styles.headers["content-type"], /text\/css/);
  assert.match(styles.body, /\.view/);
  assert.doesNotMatch(styles.body.slice(0, 100), /<!doctype html>/i);

  const script = await request("/app.js");
  assert.equal(script.status, 200);
  assert.match(script.headers["content-type"], /text\/javascript/);
  assert.match(script.body, /function setView/);
  assert.match(script.body, /Announcement cards are waiting on the latest API deploy/);
  assert.match(script.body, /Published media posts will appear here/);
  assert.match(script.body, /Promise\.allSettled/);
  assert.match(script.body, /Recent exports could not load/);
  assert.match(script.body, /Imported teams could not load/);
  assert.match(script.body, /trenches-leagueos\.onrender\.com/);
  assert.match(script.body, /Live exports appear on the Render website/);
  assert.match(script.body, /function rosterGroups/);
  assert.match(script.body, /Full Imported Roster/);
  assert.match(script.body, /TOP 22 OVR/);
  assert.match(script.body, /async function openTeamThread/);
  assert.match(script.body, /function matchupIntelligenceCard/);
  assert.match(script.body, /\/intelligence/);
  assert.match(script.body, /async function recordThreadOutcome/);
  assert.match(script.body, /Recording outcome/);
  assert.match(script.body, /data-open-team-thread/);
  assert.match(script.body, /No Open Matchup/);
  assert.match(script.body, /function filterTradeAssets/);
  assert.match(script.body, /function updateTradeSelection/);
  assert.match(script.body, /escapeHtml/);

  const html = await request("/");
  assert.equal(html.status, 200);
  assert.match(html.body, /id="trade-search-a"/);
  assert.match(html.body, /id="trade-filter-b"/);
  assert.match(html.body, /Draft picks/);
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

test("coaches can draft and progress a trade proposal", async () => {
  const drafted = await request("/api/leagues/the-trenches/trades", {
    method: "POST",
    body: {
      teamA: "buf",
      teamB: "dal",
      teamAAssets: [{ label: "2027 1st", value: 250, type: "pick" }],
      teamBAssets: [{ label: "RE Micah Parsons", value: 518, type: "player" }]
    }
  });
  assert.equal(drafted.status, 201);
  assert.equal(drafted.json.status, "negotiating");
  assert.equal(drafted.json.valueCheck.withinLimit, false);

  const approvedByCoach = await request(`/api/leagues/the-trenches/trades/${drafted.json.id}`, {
    method: "PATCH",
    body: { action: "approve" }
  });
  assert.equal(approvedByCoach.status, 200);
  assert.equal(approvedByCoach.json.status, "committee_review");

  const approvedByCommittee = await request(`/api/leagues/the-trenches/trades/${drafted.json.id}`, {
    method: "PATCH",
    body: { action: "committee_approve" }
  });
  assert.equal(approvedByCommittee.status, 200);
  assert.equal(approvedByCommittee.json.status, "approved");
});

test("game thread outcomes are recorded through the league API", async () => {
  const games = await get("/api/leagues/the-trenches/games");
  const game = games.json.find((entry) => entry.status !== "played");
  const recorded = await request(`/api/leagues/the-trenches/games/${game.id}/outcome`, {
    method: "PATCH",
    body: { outcome: "fair_sim" }
  });
  assert.equal(recorded.status, 200);
  assert.equal(recorded.json.status, "fair_sim");

  const unsupported = await request(`/api/leagues/the-trenches/games/${game.id}/outcome`, {
    method: "PATCH",
    body: { outcome: "invented_result" }
  });
  assert.equal(unsupported.status, 400);
});

test("coaches can activate recognition perks", async () => {
  const activated = await request("/api/leagues/the-trenches/recognition/perks", {
    method: "POST",
    body: { perkId: "offensive-plan" }
  });
  assert.equal(activated.status, 201);
  assert.equal(activated.json.balances.impact, 5);
  assert.ok(activated.json.activePerks.some((perk) => perk.id === "offensive-plan"));
  assert.equal(activated.json.perks.find((perk) => perk.id === "offensive-plan").status, "active");
  assert.ok(activated.json.breakdown.some((item) => item.points < 0 && item.label.includes("Spent")));
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

test("commissioners can inspect normalized analytics data coverage", async () => {
  const coverage = await get("/api/leagues/the-trenches/data-coverage");
  assert.equal(coverage.status, 200);
  assert.ok(coverage.json.totals.teams > 0);
  assert.ok(Array.isArray(coverage.json.fields));
  assert.equal(typeof coverage.json.readiness.matchupAvailability, "boolean");
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
