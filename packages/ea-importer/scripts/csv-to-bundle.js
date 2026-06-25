import { readFile, writeFile } from "node:fs/promises";
import { csvSourcesToLeagueOsImportV1 } from "../src/index.js";

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function readOptional(path) {
  return path ? readFile(path, "utf8") : "";
}

const output = arg("out") || "leagueos-import-v1.generated.json";
const bundle = csvSourcesToLeagueOsImportV1({
  source: arg("source") || "csv-cli",
  season: arg("season"),
  week: arg("week"),
  teamsCsv: await readOptional(arg("teams")),
  playersCsv: await readOptional(arg("players")),
  standingsCsv: await readOptional(arg("standings")),
  gamesCsv: await readOptional(arg("games"))
});

await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
console.log(`Wrote ${output}`);
