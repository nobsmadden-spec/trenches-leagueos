import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const migrationUrl = new URL("../prisma/migrations/202606220001_foundation/migration.sql", import.meta.url);

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
