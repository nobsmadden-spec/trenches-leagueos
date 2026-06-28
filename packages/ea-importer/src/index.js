import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

export function payloadDigest(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function inferRecordCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") return Object.keys(payload).length;
  return payload === undefined || payload === null ? 0 : 1;
}

export function importStatusForDatasets(datasets) {
  if (!datasets.length) return "FAILED";
  const failed = datasets.filter((dataset) => dataset.status === "FAILED").length;
  const complete = datasets.filter((dataset) => dataset.status === "COMPLETE").length;
  if (failed === datasets.length) return "FAILED";
  if (complete === datasets.length) return "COMPLETE";
  return "PARTIAL";
}

export function normalizeImportDatasets(datasets = []) {
  return datasets.map((dataset) => {
    const payload = dataset.payload ?? null;
    const errorMessage = dataset.errorMessage || null;
    const status = errorMessage ? "FAILED" : (dataset.status || "COMPLETE").toUpperCase();
    return {
      name: String(dataset.name || "unknown").trim(),
      payload,
      sha256: payloadDigest(payload),
      status,
      recordCount: Number.isInteger(dataset.recordCount) ? dataset.recordCount : inferRecordCount(payload),
      errorMessage
    };
  }).filter((dataset) => dataset.name);
}

export function rawExportStorageKey({ leagueId, season, week, dataset, sha256 }) {
  const safeDataset = dataset.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "dataset";
  return `raw-exports/${leagueId}/season-${season || "current"}/week-${week || "current"}/${safeDataset}-${sha256.slice(0, 12)}.json`;
}

function assertArray(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalInteger(value, name) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${name} must be an integer`);
  return number;
}

export function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ""])));
}

function firstValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return row[name];
  }
  return undefined;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

function snallabotRows(exportPayload, rowKey) {
  if (!exportPayload) return [];
  if (Array.isArray(exportPayload)) return exportPayload;
  if (Array.isArray(exportPayload[rowKey])) return exportPayload[rowKey];
  return [];
}

function snallabotRosterRows(rosterExports) {
  return asArray(rosterExports).flatMap((exportPayload) => {
    if (Array.isArray(exportPayload)) return exportPayload;
    if (Array.isArray(exportPayload?.rosterInfoList)) return exportPayload.rosterInfoList;
    return [];
  });
}

function snallabotColor(value) {
  if (typeof value === "string" && value.startsWith("#")) return value;
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `#${(number & 0xffffff).toString(16).padStart(6, "0")}`;
}

function snallabotDevTrait(value) {
  const traits = ["Normal", "Star", "Superstar", "X-Factor"];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && Number.isNaN(Number(value))) return value;
  return traits[Number(value)] || String(value);
}

function snallabotGameStatus(value) {
  const number = Number(value);
  if ([2, 3, 4].includes(number)) return "PLAYED";
  return "SCHEDULED";
}

function snallabotWeek(gameWeek, fallbackWeek) {
  if (fallbackWeek !== undefined && fallbackWeek !== null && fallbackWeek !== "") return fallbackWeek;
  if (gameWeek === undefined || gameWeek === null || gameWeek === "") return null;
  const number = Number(gameWeek);
  return Number.isInteger(number) ? number + 1 : gameWeek;
}

function snallabotId(value) {
  if (value === undefined || value === null || value === "") return value;
  return String(value);
}

function snallabotBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "yes", "y"].includes(value.toLowerCase())) return true;
    if (["false", "no", "n"].includes(value.toLowerCase())) return false;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number !== 0 : null;
}

export function csvSourcesToLeagueOsImportV1({ source = "csv-upload", season, week, teamsCsv, playersCsv, standingsCsv, gamesCsv }) {
  const teams = parseCsv(teamsCsv).map((row) => ({
    externalId: firstValue(row, ["externalId", "teamId", "id", "abbr", "abbreviation"]),
    name: firstValue(row, ["name", "team", "teamName"]),
    abbreviation: firstValue(row, ["abbreviation", "abbr"]),
    conference: firstValue(row, ["conference", "conf"]),
    division: firstValue(row, ["division", "div"]),
    primaryColor: firstValue(row, ["primaryColor", "color"])
  }));
  const players = parseCsv(playersCsv).map((row) => ({
    externalId: firstValue(row, ["externalId", "playerId", "id"]),
    teamExternalId: firstValue(row, ["teamExternalId", "teamId", "team", "abbr"]),
    name: firstValue(row, ["name", "player", "playerName"]),
    position: firstValue(row, ["position", "pos"]),
    overall: firstValue(row, ["overall", "ovr"]),
    devTrait: firstValue(row, ["devTrait", "dev", "trait"]),
    age: firstValue(row, ["age"]),
    attributes: compactObject({
      injuryLength: firstValue(row, ["injuryLength", "injuryWeeks"]),
      injuryType: firstValue(row, ["injuryType", "injury"]),
      isOnIr: snallabotBoolean(firstValue(row, ["isOnIr", "isOnIR", "ir"])),
      contractYears: firstValue(row, ["contractYears", "yearsRemaining"]),
      contractSalary: firstValue(row, ["contractSalary", "salary"]),
      speedRating: firstValue(row, ["speedRating", "speed", "spd"]),
      awarenessRating: firstValue(row, ["awarenessRating", "awareness", "awr"]),
      strengthRating: firstValue(row, ["strengthRating", "strength", "str"])
    })
  }));
  const standings = parseCsv(standingsCsv).map((row) => ({
    teamExternalId: firstValue(row, ["teamExternalId", "teamId", "team", "abbr"]),
    wins: firstValue(row, ["wins", "w"]),
    losses: firstValue(row, ["losses", "l"]),
    ties: firstValue(row, ["ties", "t"]),
    pointsFor: firstValue(row, ["pointsFor", "pf"]),
    pointsAgainst: firstValue(row, ["pointsAgainst", "pa"]),
    turnoverDiff: firstValue(row, ["turnoverDiff", "tod", "diff"])
  }));
  const games = parseCsv(gamesCsv).map((row) => ({
    externalId: firstValue(row, ["externalId", "gameId", "id"]),
    week: firstValue(row, ["week"]),
    homeTeamExternalId: firstValue(row, ["homeTeamExternalId", "homeTeamId", "home", "homeAbbr"]),
    awayTeamExternalId: firstValue(row, ["awayTeamExternalId", "awayTeamId", "away", "awayAbbr"]),
    status: firstValue(row, ["status"]),
    scheduledAt: firstValue(row, ["scheduledAt", "scheduled", "kickoff"]),
    homeScore: firstValue(row, ["homeScore"]),
    awayScore: firstValue(row, ["awayScore"])
  }));
  return {
    schemaVersion: "leagueos-import/v1",
    source,
    season,
    week,
    teams,
    players,
    standings,
    games
  };
}

export function snallabotExportsToLeagueOsImportV1(bundle) {
  if (!bundle || typeof bundle !== "object") throw new Error("Snallabot export bundle must be an object");
  const teamsExport = bundle.teamsExport || bundle.teams;
  const standingsExport = bundle.standingsExport || bundle.standings;
  const schedulesExport = bundle.schedulesExport || bundle.scheduleExport || bundle.schedule || bundle.games;
  const rosterExports = bundle.rosterExports || bundle.rosters || bundle.players;
  const standingsByTeamId = new Map(snallabotRows(standingsExport, "teamStandingInfoList").map((standing) => [String(standing.teamId), standing]));
  const season = bundle.season ?? bundle.seasonIndex ?? firstValue(snallabotRows(schedulesExport, "gameScheduleInfoList")[0] || {}, ["season", "seasonIndex"]);
  const week = bundle.week ?? (bundle.weekIndex === undefined ? null : snallabotWeek(bundle.weekIndex, null));

  const teams = snallabotRows(teamsExport, "leagueTeamInfoList").map((team) => {
    const standing = standingsByTeamId.get(String(team.teamId)) || {};
    return {
      externalId: snallabotId(team.teamId),
      name: team.displayName || [team.cityName, team.nickName].filter(Boolean).join(" ") || team.teamName || team.abbrName,
      abbreviation: team.abbrName || team.abbreviation || team.teamAbbr || team.teamId,
      conference: standing.conferenceName || team.conferenceName || team.confName || "Unknown",
      division: team.divName || standing.divisionName || team.divisionName || "Unknown",
      primaryColor: snallabotColor(team.primaryColor)
    };
  });

  const players = snallabotRosterRows(rosterExports).map((player) => ({
    externalId: snallabotId(player.rosterId ?? player.playerId ?? player.id),
    teamExternalId: snallabotId(player.teamId),
    name: player.fullName || [player.firstName, player.lastName].filter(Boolean).join(" ") || player.playerName,
    position: player.position,
    overall: player.playerBestOvr ?? player.playerSchemeOvr ?? player.overall ?? player.ovr,
    devTrait: snallabotDevTrait(player.devTrait),
    age: player.age,
    attributes: compactObject({
      jerseyNum: player.jerseyNum,
      height: player.height,
      weight: player.weight,
      yearsPro: player.yearsPro,
      college: player.college,
      injuryLength: player.injuryLength ?? player.injuryDuration ?? player.injury_length,
      injuryType: player.injuryType ?? player.injuryName ?? player.injury_type,
      isOnIr: snallabotBoolean(player.isOnIr ?? player.isOnIR ?? player.injuryReserve ?? player.is_on_ir),
      contractYears: player.contractYears ?? player.contractLength ?? player.contract_years,
      contractSalary: player.contractSalary ?? player.salary ?? player.contract_salary,
      contractBonus: player.contractBonus ?? player.signingBonus ?? player.contract_bonus,
      speedRating: player.speedRating,
      accelerationRating: player.accelerationRating,
      strengthRating: player.strengthRating,
      agilityRating: player.agilityRating,
      awarenessRating: player.awarenessRating,
      throwPowerRating: player.throwPowerRating,
      throwAccuracyShortRating: player.throwAccuracyShortRating,
      catchRating: player.catchRating,
      tackleRating: player.tackleRating
    })
  }));

  const standings = snallabotRows(standingsExport, "teamStandingInfoList").map((standing) => ({
    teamExternalId: snallabotId(standing.teamId),
    wins: standing.totalWins,
    losses: standing.totalLosses,
    ties: standing.totalTies,
    pointsFor: standing.ptsFor,
    pointsAgainst: standing.ptsAgainst,
    turnoverDiff: standing.tODiff ?? standing.turnoverDiff
  }));

  const games = snallabotRows(schedulesExport, "gameScheduleInfoList").map((game) => ({
    externalId: snallabotId(game.scheduleId ?? game.gameId ?? game.id),
    week: snallabotWeek(game.weekIndex ?? game.week, week),
    homeTeamExternalId: snallabotId(game.homeTeamId),
    awayTeamExternalId: snallabotId(game.awayTeamId),
    status: snallabotGameStatus(game.status),
    homeScore: game.homeScore,
    awayScore: game.awayScore
  }));

  return {
    schemaVersion: "leagueos-import/v1",
    source: bundle.source || "snallabot-export/v1",
    season,
    week,
    teams,
    players,
    standings,
    games
  };
}

export function normalizeSnallabotExportV1(bundle) {
  return normalizeLeagueOsImportV1(snallabotExportsToLeagueOsImportV1(bundle));
}

export function normalizeLeagueOsImportV1(bundle) {
  if (!bundle || typeof bundle !== "object") throw new Error("Import bundle must be an object");
  if (bundle.schemaVersion !== "leagueos-import/v1") throw new Error("Unsupported import schemaVersion");
  const season = optionalInteger(bundle.season, "season");
  const week = optionalInteger(bundle.week, "week");
  const teams = assertArray(bundle.teams, "teams").map((team, index) => ({
    externalId: requiredString(team.externalId, `teams[${index}].externalId`),
    name: requiredString(team.name, `teams[${index}].name`),
    abbreviation: requiredString(team.abbreviation || team.abbr, `teams[${index}].abbreviation`),
    conference: requiredString(team.conference, `teams[${index}].conference`),
    division: requiredString(team.division, `teams[${index}].division`),
    primaryColor: optionalString(team.primaryColor || team.color)
  }));
  const players = assertArray(bundle.players, "players").map((player, index) => ({
    externalId: requiredString(player.externalId, `players[${index}].externalId`),
    teamExternalId: optionalString(player.teamExternalId || player.teamId),
    name: requiredString(player.name, `players[${index}].name`),
    position: requiredString(player.position, `players[${index}].position`),
    overall: optionalInteger(player.overall, `players[${index}].overall`),
    devTrait: optionalString(player.devTrait),
    age: optionalInteger(player.age, `players[${index}].age`),
    attributes: player.attributes && typeof player.attributes === "object" ? player.attributes : null
  }));
  const standings = assertArray(bundle.standings, "standings").map((standing, index) => ({
    teamExternalId: requiredString(standing.teamExternalId || standing.teamId, `standings[${index}].teamExternalId`),
    wins: optionalInteger(standing.wins, `standings[${index}].wins`) || 0,
    losses: optionalInteger(standing.losses, `standings[${index}].losses`) || 0,
    ties: optionalInteger(standing.ties, `standings[${index}].ties`) || 0,
    pointsFor: optionalInteger(standing.pointsFor, `standings[${index}].pointsFor`) || 0,
    pointsAgainst: optionalInteger(standing.pointsAgainst, `standings[${index}].pointsAgainst`) || 0,
    turnoverDiff: optionalInteger(standing.turnoverDiff, `standings[${index}].turnoverDiff`) || 0
  }));
  const games = assertArray(bundle.games, "games").map((game, index) => ({
    externalId: requiredString(game.externalId, `games[${index}].externalId`),
    week: optionalInteger(game.week ?? week, `games[${index}].week`) || week,
    homeTeamExternalId: requiredString(game.homeTeamExternalId || game.homeTeamId, `games[${index}].homeTeamExternalId`),
    awayTeamExternalId: requiredString(game.awayTeamExternalId || game.awayTeamId, `games[${index}].awayTeamExternalId`),
    status: optionalString(game.status) || "UNSCHEDULED",
    scheduledAt: optionalString(game.scheduledAt),
    homeScore: optionalInteger(game.homeScore, `games[${index}].homeScore`),
    awayScore: optionalInteger(game.awayScore, `games[${index}].awayScore`)
  }));
  return {
    source: bundle.source || "leagueos-import/v1",
    season,
    week,
    datasets: [
      { name: "Teams", payload: teams },
      { name: "Players", payload: players },
      { name: "Standings", payload: standings },
      { name: "Schedule", payload: games }
    ].filter((dataset) => dataset.payload.length)
  };
}

/** Preserve source payloads before any normalization so imports are replayable. */
export async function preserveRawExport({ rootDir, leagueId, season, week, dataset = "export", payload }) {
  const sha256 = payloadDigest(payload);
  const directory = join(rootDir, "data", "raw-exports", leagueId, String(season));
  const storageKey = rawExportStorageKey({ leagueId, season, week, dataset, sha256 });
  const path = join(rootDir, "data", storageKey);
  await mkdir(directory, { recursive: true });
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { path, storageKey, sha256 };
}

export function normalizeExport(bundle) {
  if (bundle?.schemaVersion === "snallabot-export/v1") return normalizeSnallabotExportV1(bundle);
  return normalizeLeagueOsImportV1(bundle);
}
