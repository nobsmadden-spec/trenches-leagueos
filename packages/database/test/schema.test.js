import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const migrationUrl = new URL("../prisma/migrations/202606220001_foundation/migration.sql", import.meta.url);
const seedUrl = new URL("../prisma/seed.js", import.meta.url);
const mediaMigrationUrl = new URL("../prisma/migrations/202606300001_media_posts/migration.sql", import.meta.url);

test("foundation schema and migration cover identity, league, and import ownership", async () => {
  const [schema, migration] = await Promise.all([
    readFile(schemaUrl, "utf8"),
    readFile(migrationUrl, "utf8")
  ]);
  const requiredModels = ["User", "Session", "League", "LeagueMembership", "Team", "Season", "Week", "Game", "Player", "TeamSeasonSnapshot", "ImportRun", "ImportDataset", "RawExport", "AuditLog"];
  for (const model of requiredModels) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /@@unique\(\[leagueId, userId\]\)/);
  assert.match(schema, /@@unique\(\[leagueId, sha256\]\)/);
});

test("foundation seed covers 32 teams without replacing imported external IDs", async () => {
  const seed = await readFile(seedUrl, "utf8");
  assert.equal([...seed.matchAll(/^\s+\["[a-z]+",/gm)].length, 32);
  assert.match(seed, /abbreviation: teamData\.abbreviation/);
  assert.match(seed, /where: \{ id: importedTeam\.id \}/);
  assert.doesNotMatch(seed, /data: \{[^}]*externalId: teamData\.externalId[^}]*\}/s);
});

test("media approval posts have durable schema and migration coverage", async () => {
  const [schema, migration] = await Promise.all([
    readFile(schemaUrl, "utf8"),
    readFile(mediaMigrationUrl, "utf8")
  ]);
  assert.match(schema, /enum MediaStatus \{/);
  assert.match(schema, /model MediaPost \{/);
  assert.match(schema, /mediaPosts\s+MediaPost\[\]/);
  assert.match(migration, /CREATE TYPE "MediaStatus"/);
  assert.match(migration, /CREATE TABLE "MediaPost"/);
  assert.match(migration, /MediaPost_leagueId_status_createdAt_idx/);
});
