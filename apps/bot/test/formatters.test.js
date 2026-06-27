import test from "node:test";
import assert from "node:assert/strict";
import { matchupFields, rosterFields, standingsFields } from "../src/formatters.js";

test("Discord standings formatter preserves division order and records", () => {
  const fields = standingsFields({
    "AFC East": [
      { name: "Buffalo Bills", wins: 8, losses: 2, ties: 0 },
      { name: "Miami Dolphins", wins: 7, losses: 3, ties: 0 }
    ]
  });
  assert.equal(fields[0].name, "AFC East");
  assert.match(fields[0].value, /1\. \*\*Buffalo Bills\*\* 8-2/);
  assert.match(fields[0].value, /2\. \*\*Miami Dolphins\*\* 7-3/);
});

test("Discord matchup formatter shows schedule status and final scores", () => {
  const fields = matchupFields([
    {
      week: 8,
      status: "scheduled",
      scheduledAt: "Friday 9:00 PM ET",
      awayTeam: { name: "Buffalo Bills", abbr: "BUF", wins: 6, losses: 1 },
      homeTeam: { name: "Miami Dolphins", abbr: "MIA", wins: 5, losses: 2 }
    },
    {
      week: 8,
      status: "played",
      awayScore: 24,
      homeScore: 31,
      awayTeam: { name: "Dallas Cowboys", abbr: "DAL", wins: 4, losses: 4 },
      homeTeam: { name: "Detroit Lions", abbr: "DET", wins: 7, losses: 1 }
    }
  ]);
  assert.match(fields[0].name, /Week 8 \| BUF at MIA/);
  assert.match(fields[0].value, /Scheduled.*Friday 9:00 PM ET/);
  assert.match(fields[1].value, /Final.*DAL 24 - DET 31/);
});

test("Discord roster formatter groups imported players by unit", () => {
  const fields = rosterFields({
    roster: [
      { name: "Josh Allen", position: "QB", overall: 95 },
      { name: "Greg Rousseau", position: "LE", overall: 89 },
      { name: "Strong Leg", position: "K", overall: 80 }
    ]
  });
  assert.deepEqual(fields.map((field) => field.name), ["Offense | 1", "Defense | 1", "Special Teams | 1"]);
  assert.match(fields[0].value, /\*\*QB\*\* Josh Allen \| 95 OVR/);
});
