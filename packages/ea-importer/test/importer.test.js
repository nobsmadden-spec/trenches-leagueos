import test from "node:test";
import assert from "node:assert/strict";
import { csvSourcesToLeagueOsImportV1, importStatusForDatasets, inferRecordCount, normalizeExport, normalizeImportDatasets, parseCsv, payloadDigest, rawExportStorageKey, snallabotExportsToLeagueOsImportV1 } from "../src/index.js";

test("payload fingerprints and storage keys are deterministic", () => {
  const payload = [{ id: "p1", overall: 92 }];
  const digest = payloadDigest(payload);
  assert.equal(payloadDigest(payload), digest);
  assert.match(rawExportStorageKey({ leagueId: "the-trenches", season: 2, week: 11, dataset: "Player Ratings", sha256: digest }), /^raw-exports\/the-trenches\/season-2\/week-11\/player-ratings-/);
});

test("dataset normalization infers counts and import status", () => {
  assert.equal(inferRecordCount([{ id: 1 }, { id: 2 }]), 2);
  assert.equal(inferRecordCount({ teams: [], players: [] }), 2);
  const datasets = normalizeImportDatasets([
    { name: "Rosters", payload: [{ id: "p1" }] },
    { name: "Stats", payload: [], errorMessage: "Missing stat export" }
  ]);
  assert.equal(datasets[0].status, "COMPLETE");
  assert.equal(datasets[1].status, "FAILED");
  assert.equal(importStatusForDatasets(datasets), "PARTIAL");
});

test("leagueos import v1 normalizes teams, players, standings, and games into datasets", () => {
  const normalized = normalizeExport({
    schemaVersion: "leagueos-import/v1",
    source: "manual-test",
    season: 2,
    week: 11,
    teams: [{ externalId: "buf", name: "Buffalo Bills", abbr: "BUF", conference: "AFC", division: "East", color: "#2563eb" }],
    players: [{ externalId: "p1", teamExternalId: "buf", name: "Josh Allen", position: "QB", overall: "95", age: 30 }],
    standings: [{ teamExternalId: "buf", wins: 8, losses: 2, pointsFor: 286, pointsAgainst: 201 }],
    games: [{ externalId: "g1", week: 11, awayTeamExternalId: "buf", homeTeamExternalId: "buf", status: "SCHEDULED" }]
  });
  assert.equal(normalized.source, "manual-test");
  assert.equal(normalized.season, 2);
  assert.equal(normalized.datasets.length, 4);
  assert.equal(normalized.datasets.find((dataset) => dataset.name === "Players").payload[0].overall, 95);
  assert.equal(normalized.datasets.find((dataset) => dataset.name === "Teams").payload[0].abbreviation, "BUF");
});

test("leagueos import v1 rejects unsupported bundle versions", () => {
  assert.throws(() => normalizeExport({ schemaVersion: "other" }), /Unsupported import schemaVersion/);
});

test("CSV parser handles quoted commas", () => {
  const rows = parseCsv('id,name,position\np1,"Allen, Josh",QB\n');
  assert.deepEqual(rows, [{ id: "p1", name: "Allen, Josh", position: "QB" }]);
});

test("CSV sources convert to a leagueos import bundle", () => {
  const bundle = csvSourcesToLeagueOsImportV1({
    source: "csv-test",
    season: 2,
    week: 11,
    teamsCsv: "abbr,name,conference,division\nBUF,Buffalo Bills,AFC,East\n",
    playersCsv: "id,team,name,pos,ovr\np1,BUF,Josh Allen,QB,95\n",
    standingsCsv: "team,w,l,pf,pa\nBUF,8,2,286,201\n",
    gamesCsv: "id,week,away,home,status\ng1,11,BUF,BUF,SCHEDULED\n"
  });
  const normalized = normalizeExport(bundle);
  assert.equal(normalized.source, "csv-test");
  assert.equal(normalized.datasets.find((dataset) => dataset.name === "Teams").payload[0].externalId, "BUF");
  assert.equal(normalized.datasets.find((dataset) => dataset.name === "Players").payload[0].overall, 95);
});

test("Snallabot exports convert to the LeagueOS import contract", () => {
  const sourceExport = {
    schemaVersion: "snallabot-export/v1",
    season: 3,
    weekIndex: 10,
    teamsExport: {
      leagueTeamInfoList: [{
        teamId: 1,
        displayName: "Buffalo Bills",
        abbrName: "BUF",
        divName: "East",
        primaryColor: 255
      }]
    },
    standingsExport: {
      teamStandingInfoList: [{
        teamId: 1,
        conferenceName: "AFC",
        divisionName: "East",
        totalWins: 8,
        totalLosses: 2,
        totalTies: 0,
        ptsFor: 286,
        ptsAgainst: 201,
        tODiff: 6
      }]
    },
    schedulesExport: {
      gameScheduleInfoList: [{
        scheduleId: 99,
        weekIndex: 10,
        awayTeamId: 1,
        homeTeamId: 1,
        awayScore: 24,
        homeScore: 31,
        status: 3
      }]
    },
    rosterExports: [{
      rosterInfoList: [{
        rosterId: 17,
        teamId: 1,
        firstName: "Josh",
        lastName: "Allen",
        position: "QB",
        playerBestOvr: 95,
        devTrait: 3,
        age: 30,
        throwPowerRating: 99
      }]
    }]
  };
  const bundle = snallabotExportsToLeagueOsImportV1(sourceExport);
  assert.equal(bundle.schemaVersion, "leagueos-import/v1");
  assert.equal(bundle.week, 11);
  assert.equal(bundle.teams[0].conference, "AFC");
  assert.equal(bundle.players[0].devTrait, "X-Factor");
  assert.equal(bundle.players[0].attributes.throwPowerRating, 99);
  assert.equal(bundle.games[0].week, 11);
  assert.equal(bundle.games[0].status, "PLAYED");

  const normalized = normalizeExport(sourceExport);
  assert.equal(normalized.source, "snallabot-export/v1");
  assert.equal(normalized.datasets.find((dataset) => dataset.name === "Schedule").payload[0].homeScore, 31);
});
