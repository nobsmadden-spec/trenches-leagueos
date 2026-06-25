import test from "node:test";
import assert from "node:assert/strict";
import { compareTeams, playoffRace, powerRankings, standingsByDivision } from "../src/index.js";

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
