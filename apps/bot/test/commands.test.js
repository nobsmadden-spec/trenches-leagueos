import test from "node:test";
import assert from "node:assert/strict";
import { createLeagueCommands } from "../src/commands.js";

test("Discord matchup command reads the central games API", async () => {
  let requestedUrl;
  const commands = createLeagueCommands({
    apiBaseUrl: "https://league.example",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => [{ id: "game-1" }] };
    }
  });
  const games = await commands.matchups("the-trenches");
  assert.equal(requestedUrl, "https://league.example/api/leagues/the-trenches/games");
  assert.equal(games[0].id, "game-1");
});

test("Discord roster command reads one imported team profile", async () => {
  let requestedUrl;
  const commands = createLeagueCommands({
    apiBaseUrl: "https://league.example",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ id: "team-1", roster: [{ id: "player-1" }] }) };
    }
  });
  const team = await commands.roster("the-trenches", "team-1");
  assert.equal(requestedUrl, "https://league.example/api/leagues/the-trenches/teams/team-1");
  assert.equal(team.roster[0].id, "player-1");
});
