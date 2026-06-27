import test from "node:test";
import assert from "node:assert/strict";
import { gameThreadEmbed, gameThreadName, openGamesForThreads } from "../src/thread-builder.js";

const scheduledGame = {
  week: 8,
  status: "scheduled",
  scheduledAt: "Friday 9:00 PM ET",
  awayTeam: { name: "Buffalo Bills", abbr: "BUF", wins: 6, losses: 1 },
  homeTeam: { name: "Miami Dolphins", abbr: "MIA", wins: 5, losses: 2 }
};

test("Discord game thread builder creates stable names and starter content", () => {
  assert.equal(gameThreadName(scheduledGame), "week-8-buf-at-mia");
  const embed = gameThreadEmbed(scheduledGame);
  assert.equal(embed.title, "Buffalo Bills at Miami Dolphins");
  assert.match(embed.fields[2].value, /Friday 9:00 PM ET/);
  assert.match(embed.fields[3].value, /Record the final outcome/);
});

test("Discord game thread builder excludes terminal matchups", () => {
  const games = openGamesForThreads([
    scheduledGame,
    { ...scheduledGame, status: "played" },
    { ...scheduledGame, status: "fair_sim" }
  ]);
  assert.equal(games.length, 1);
});
