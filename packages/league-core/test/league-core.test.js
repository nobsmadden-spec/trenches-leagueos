import test from "node:test";
import assert from "node:assert/strict";
import { compareTeams, matchupComparison, playoffRace, powerRankings, standingsByDivision, teamTendencyProfile } from "../src/index.js";

const team = (id, overrides = {}) => ({
  id, name: id, conference: "AFC", division: "East", wins: 5, losses: 5, ties: 0,
  conferenceWins: 3, conferenceLosses: 3, divisionWins: 2, divisionLosses: 2,
  pointsFor: 200, pointsAgainst: 200, turnoverDiff: 0, last5Wins: 3, last5Losses: 2,
  ...overrides
});

test("standings sort by win percentage before other tiebreakers", () => {
  const groups = standingsByDivision([team("low"), team("high", { wins: 7, losses: 3 })]);
  assert.equal(groups["AFC East"][0].id, "high");
});

test("conference record breaks equal overall records", () => {
  const better = team("better", { conferenceWins: 5, conferenceLosses: 1 });
  const worse = team("worse", { conferenceWins: 2, conferenceLosses: 4 });
  assert.ok(compareTeams(better, worse) < 0);
});

test("playoff race seeds division leaders before wildcards", () => {
  const teams = [
    team("east-leader", { division: "East", wins: 7, losses: 3 }),
    team("east-wildcard", { division: "East", wins: 9, losses: 1 }),
    team("north-leader", { division: "North", wins: 6, losses: 4 }),
    team("north-other", { division: "North", wins: 4, losses: 6 })
  ];
  const race = playoffRace(teams, 3).AFC;
  assert.deepEqual(race.playoff.map((entry) => entry.id), ["east-wildcard", "north-leader", "east-leader"]);
});

test("power rankings reward winning and recent form", () => {
  const rankings = powerRankings([team("average"), team("elite", { wins: 9, losses: 1, last5Wins: 5, last5Losses: 0 })]);
  assert.equal(rankings[0].id, "elite");
  assert.equal(rankings[0].rank, 1);
});

test("team tendency profiles use recorded standings and roster ratings", () => {
  const bills = team("buf", { name: "Bills", abbr: "BUF", wins: 8, losses: 2, pointsFor: 280, pointsAgainst: 180, turnoverDiff: 8 });
  const profile = teamTendencyProfile(bills, {
    players: [
      { id: "qb", teamId: "buf", name: "Quarterback", position: "QB", overall: 90 },
      { id: "cb", teamId: "buf", name: "Corner", position: "CB", overall: 88 }
    ]
  });
  assert.equal(profile.metrics.pointsPerGame, 28);
  assert.equal(profile.metrics.pointsAllowedPerGame, 18);
  assert.equal(profile.metrics.offenseOverall, 90);
  assert.equal(profile.keyPersonnel[0].name, "Quarterback");
  assert.ok(profile.strengths.some((item) => item.label === "Scoring pace"));
});

test("matchup comparisons expose auditable edges and a deterministic projection", () => {
  const awayTeam = team("buf", { name: "Bills", abbr: "BUF", wins: 8, losses: 2, pointsFor: 280, pointsAgainst: 180, last5Wins: 5, last5Losses: 0 });
  const homeTeam = team("mia", { name: "Dolphins", abbr: "MIA", wins: 5, losses: 5, pointsFor: 210, pointsAgainst: 230, last5Wins: 2, last5Losses: 3 });
  const result = matchupComparison({ game: { id: "game-1", week: 11 }, awayTeam, homeTeam });
  assert.equal(result.gameId, "game-1");
  assert.equal(result.projection.winnerTeamId, "buf");
  assert.ok(result.edgeCount.away > result.edgeCount.home);
  assert.deepEqual(result.coverage.unavailable, ["injuries", "direct coach activity"]);
  assert.match(result.methodology, /No generated or inferred statistics/);
});

test("matchup comparisons use explicit imported availability without inventing injuries", () => {
  const awayTeam = team("buf", { name: "Bills", abbr: "BUF" });
  const homeTeam = team("mia", { name: "Dolphins", abbr: "MIA" });
  const players = [
    { id: "buf-qb", teamId: "buf", name: "Bills QB", position: "QB", overall: 90, attributes: { injuryLength: 2, injuryType: "Shoulder", isOnIr: false, contractYears: 1 } },
    { id: "buf-cb", teamId: "buf", name: "Bills CB", position: "CB", overall: 88, attributes: { injuryLength: 0, isOnIr: false } },
    { id: "mia-qb", teamId: "mia", name: "Dolphins QB", position: "QB", overall: 89, attributes: { injuryLength: 0, isOnIr: false } }
  ];
  const result = matchupComparison({ game: { id: "game-availability" }, awayTeam, homeTeam, players });
  assert.equal(result.away.availability.unavailable, 1);
  assert.equal(result.away.availability.expiringContracts, 1);
  assert.equal(result.coverage.injuries, true);
  assert.deepEqual(result.coverage.unavailable, ["direct coach activity"]);
  assert.equal(result.edges.find((item) => item.id === "availability").advantage, "mia");
});
