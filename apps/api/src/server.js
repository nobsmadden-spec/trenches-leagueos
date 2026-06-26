import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../../../packages/config/src/env.js";
import { normalizeExport } from "../../../packages/ea-importer/src/index.js";
import { playoffRace, powerRankings, standingsByDivision } from "../../../packages/league-core/src/index.js";
import {
  clearSessionCookie,
  createOAuthState,
  createSessionCookie,
  demoIdentity,
  discordAuthorizationUrl,
  exchangeDiscordCode,
  hasLeagueRole,
  sessionFromRequest,
  verifyPayload
} from "./auth.js";
import { repository } from "./repository.js";

await loadEnvFile();

const webRoot = fileURLToPath(new URL("../../web/public", import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const maxExportBytes = Number(process.env.MAX_EXPORT_URL_BYTES || 5_000_000);
const receiverAttempts = [];
const runtimeTrades = new Map();
const runtimeRecognition = new Map();

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, { location, "cache-control": "no-store", ...headers });
  response.end();
}

async function readJson(request) {
  if (request.body !== undefined) return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function fetchExportJson(exportUrl) {
  let url;
  try {
    url = new URL(exportUrl);
  } catch {
    throw new Error("Export URL is not valid");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Export URL must start with http:// or https://");
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Export URL returned ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) return response.json();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxExportBytes) throw new Error(`Export file is too large. Limit is ${maxExportBytes} bytes.`);
    chunks.push(value);
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}

function unwrapExportPayload(body) {
  return body?.data || body?.payload || body?.export || body;
}

function titleDatasetName(name) {
  return String(name || "Snallabot Dataset").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function payloadList(payload, keys = []) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return payload;
}

function snallabotPathExportToInput(tail, body) {
  if (!tail) return null;
  const parts = tail.split("/").filter(Boolean);
  const [, , ...rest] = parts;
  const ending = parts.at(-1);
  const source = `snallabot-receiver:${rest.join("/") || ending}`;

  if (rest.length === 1 && ending === "leagueteams") return normalizeExport({ schemaVersion: "snallabot-export/v1", source, teamsExport: body });
  if (rest.length === 1 && ending === "standings") return normalizeExport({ schemaVersion: "snallabot-export/v1", source, standingsExport: body });
  if (rest[0] === "week" && ending === "schedules") return normalizeExport({ schemaVersion: "snallabot-export/v1", source, schedulesExport: body });
  if (rest[0] === "freeagents" && rest[1] === "roster") return normalizeExport({ schemaVersion: "snallabot-export/v1", source, rosterExports: [body] });
  if (rest[0] === "team" && rest[2] === "roster") {
    const rosterInfoList = (body.rosterInfoList || []).map((player) => ({ teamId: player.teamId ?? rest[1], ...player }));
    return normalizeExport({ schemaVersion: "snallabot-export/v1", source, rosterExports: [{ ...body, rosterInfoList }] });
  }
  if (rest[0] === "week" && ending) {
    return {
      source,
      season: null,
      week: Number.isInteger(Number(rest[2])) ? Number(rest[2]) + 1 : null,
      datasets: [{
        name: titleDatasetName(ending),
        payload: payloadList(body, [
          "playerPuntingStatInfoList",
          "teamStatInfoList",
          "playerPassingStatInfoList",
          "playerKickingStatInfoList",
          "playerRushingStatInfoList",
          "playerDefensiveStatInfoList",
          "playerReceivingStatInfoList"
        ])
      }]
    };
  }
  if (ending === "extra") {
    return { source, season: null, week: null, datasets: [{ name: "Extra Data", payload: body }] };
  }
  return { source, season: null, week: null, datasets: [{ name: titleDatasetName(ending), payload: body }] };
}

function payloadPreview(payload) {
  if (Array.isArray(payload)) return { type: "array", length: payload.length };
  if (payload && typeof payload === "object") return { type: "object", keys: Object.keys(payload).slice(0, 20) };
  return { type: typeof payload };
}

function recordReceiverAttempt(leagueId, attempt) {
  receiverAttempts.unshift({
    id: `receiver-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    leagueId,
    receivedAt: new Date().toISOString(),
    ...attempt
  });
  receiverAttempts.splice(50);
}

function receiverAttemptsForLeague(leagueId) {
  return receiverAttempts.filter((attempt) => attempt.leagueId === leagueId).slice(0, 10);
}

async function receiverRoute(request, response, url) {
  const match = url.pathname.match(/^\/api\/import-receivers\/snallabot\/([^/]+)(?:\/token\/([^/]+))?(?:\/(.+))?$/);
  if (!match) return false;
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" }) ?? true;
  const configuredToken = process.env.SNALLABOT_WEBHOOK_TOKEN;
  const [, leagueSlug, pathToken, tail] = match;
  const suppliedToken = pathToken || url.searchParams.get("token") || request.headers["x-snallabot-token"] || request.headers["x-leagueos-token"];
  if (configuredToken && suppliedToken !== configuredToken) return sendJson(response, 401, { error: "Invalid Snallabot receiver token" }) ?? true;
  if (!configuredToken && process.env.NODE_ENV === "production") return sendJson(response, 503, { error: "Snallabot receiver token is not configured" }) ?? true;
  const league = await repository.getLeague(leagueSlug);
  if (!league) return sendJson(response, 404, { error: "League not found" }) ?? true;
  if (!repository.recordImportRun) return sendJson(response, 501, { error: "Import recording is not supported by this repository" }) ?? true;
  let body = null;
  let input = null;
  try {
    body = await readJson(request);
    const exportPayload = unwrapExportPayload(body);
    input = snallabotPathExportToInput(tail, exportPayload) || (exportPayload?.schemaVersion ? normalizeExport(exportPayload) : exportPayload);
    if (!Array.isArray(input?.datasets) || input.datasets.length === 0) {
      recordReceiverAttempt(league.id, { status: "rejected", statusCode: 400, source: input?.source || tail || "snallabot-receiver", message: "No importable datasets found", preview: payloadPreview(exportPayload) });
      return sendJson(response, 400, { error: "No importable datasets found", detail: "The receiver accepted the request, but the payload did not contain LeagueOS or Snallabot export data." }) ?? true;
    }
    const run = await repository.recordImportRun(league, {
      source: input.source || "snallabot-receiver",
      season: input.season,
      week: input.week,
      datasets: input.datasets
    }, null);
    recordReceiverAttempt(league.id, { status: "accepted", statusCode: 201, source: input.source || tail || "snallabot-receiver", message: "Import recorded", preview: payloadPreview(exportPayload), importRunId: run.id });
    return sendJson(response, 201, { ok: true, importRun: run }) ?? true;
  } catch (error) {
    recordReceiverAttempt(league.id, { status: "failed", statusCode: 400, source: input?.source || tail || "snallabot-receiver", message: error.message, preview: payloadPreview(body) });
    return sendJson(response, 400, { error: "Unable to receive Snallabot export", detail: error.message }) ?? true;
  }
}

async function identityForRequest(request) {
  const session = sessionFromRequest(request);
  if (session?.sessionId && repository.getSessionIdentity) return repository.getSessionIdentity(session.sessionId);
  if (session) return session;
  if (process.env.DEMO_MODE !== "false") {
    const league = await repository.getLeague("the-trenches");
    if (league?.demoUser) return demoIdentity(league);
  }
  return null;
}

async function authRoute(request, response, url) {
  if (url.pathname === "/api/me") {
    const identity = await identityForRequest(request);
    sendJson(response, 200, identity ? { authenticated: true, ...identity } : { authenticated: false });
    return true;
  }
  if (url.pathname === "/api/auth/discord/debug" && request.method === "GET") {
    const state = createOAuthState("/");
    const redirectUri = (process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/api/auth/discord/callback").trim();
    sendJson(response, 200, {
      clientId: process.env.DISCORD_CLIENT_ID?.trim() || null,
      redirectUri,
      authorizeUrl: discordAuthorizationUrl(state),
      requiredPortalRedirect: redirectUri
    });
    return true;
  }
  if (url.pathname === "/api/auth/discord" && request.method === "GET") {
    const state = createOAuthState(url.searchParams.get("returnTo") || "/");
    const location = discordAuthorizationUrl(state);
    if (!location) sendJson(response, 503, { error: "Discord OAuth is not configured", required: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"] });
    else redirect(response, location);
    return true;
  }
  if (url.pathname === "/api/auth/discord/callback" && request.method === "GET") {
    const state = verifyPayload(url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!state || !code) {
      sendJson(response, 400, { error: "Invalid or expired Discord authorization" });
      return true;
    }
    try {
      const profile = await exchangeDiscordCode(code);
      const user = await repository.upsertDiscordUser(profile);
      const cookieIdentity = repository.createSession ? { sessionId: await repository.createSession(user.id) } : user;
      redirect(response, state.returnTo, { "set-cookie": createSessionCookie(cookieIdentity) });
    } catch (error) {
      sendJson(response, 502, { error: "Discord login failed", detail: error.message });
    }
    return true;
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const session = sessionFromRequest(request);
    if (session?.sessionId && repository.deleteSession) await repository.deleteSession(session.sessionId);
    response.writeHead(204, { "set-cookie": clearSessionCookie(), "cache-control": "no-store" });
    response.end();
    return true;
  }
  return false;
}

function enrichGame(league, game) {
  if (!game) return null;
  return { ...game, awayTeam: repository.getTeam(league, game.awayTeamId), homeTeam: repository.getTeam(league, game.homeTeamId) };
}

function assetValue(asset) {
  if (typeof asset === "object") return Number(asset.value || 0);
  const text = String(asset || "");
  const pickMatch = text.match(/20\d{2}\s+(\d)(?:st|nd|rd|th)/i);
  if (pickMatch) return { 1: 250, 2: 150, 3: 90, 4: 55, 5: 30, 6: 18, 7: 10 }[pickMatch[1]] || 0;
  const player = text.match(/\b([A-Z]{1,3})\s+(.+)/);
  const positionBonus = { QB: 40, HB: 12, WR: 16, TE: 10, CB: 18, RE: 16, LE: 16, DT: 12, MLB: 12, LOLB: 12, ROLB: 12, SS: 10, FS: 10 };
  return player ? 100 + (positionBonus[player[1]] || 8) : 75;
}

function normalizeTradeAsset(asset) {
  if (typeof asset === "object") return asset;
  return { label: asset, value: assetValue(asset), type: String(asset).match(/20\d{2}/) ? "pick" : "player" };
}

function enrichTrade(league, trade) {
  const teamAAssets = (trade.teamAAssets || []).map(normalizeTradeAsset);
  const teamBAssets = (trade.teamBAssets || []).map(normalizeTradeAsset);
  const teamATotal = teamAAssets.reduce((total, asset) => total + Number(asset.value || 0), 0);
  const teamBTotal = teamBAssets.reduce((total, asset) => total + Number(asset.value || 0), 0);
  const gap = Math.abs(teamATotal - teamBTotal);
  return {
    ...trade,
    teamA: repository.getTeam(league, trade.teamA),
    teamB: repository.getTeam(league, trade.teamB),
    teamAAssets,
    teamBAssets,
    valueCheck: { teamATotal, teamBTotal, gap, limit: 50, withinLimit: gap <= 50 }
  };
}

function tradesForLeague(league) {
  return [...(runtimeTrades.get(league.id) || []), ...(league.trades || [])];
}

function storeRuntimeTrade(league, trade) {
  const trades = runtimeTrades.get(league.id) || [];
  runtimeTrades.set(league.id, [trade, ...trades]);
  return trade;
}

function updateTradeStatus(league, tradeId, nextStatus) {
  const runtime = runtimeTrades.get(league.id) || [];
  const runtimeTrade = runtime.find((trade) => trade.id === tradeId);
  if (runtimeTrade) {
    runtimeTrade.status = nextStatus;
    runtimeTrade.votesFor = nextStatus === "approved" ? runtimeTrade.votesNeeded : runtimeTrade.votesFor;
    return runtimeTrade;
  }
  const demoTrade = league.trades?.find((trade) => trade.id === tradeId);
  if (!demoTrade) return null;
  demoTrade.status = nextStatus;
  demoTrade.votesFor = nextStatus === "approved" ? demoTrade.votesNeeded : demoTrade.votesFor;
  return demoTrade;
}

function createTradeProposal(league, body, identity) {
  const teamA = repository.getTeam(league, body.teamA);
  const teamB = repository.getTeam(league, body.teamB);
  if (!teamA || !teamB) throw new Error("Choose two valid teams.");
  if (teamA.id === teamB.id) throw new Error("A team cannot trade with itself.");
  const teamAAssets = (body.teamAAssets || []).map(normalizeTradeAsset);
  const teamBAssets = (body.teamBAssets || []).map(normalizeTradeAsset);
  if (!teamAAssets.length || !teamBAssets.length) throw new Error("Each side needs at least one asset.");
  return storeRuntimeTrade(league, {
    id: `trade_${Date.now()}`,
    status: "negotiating",
    submittedAt: new Date().toISOString(),
    submittedBy: identity?.id || null,
    teamA: teamA.id,
    teamB: teamB.id,
    teamAAssets,
    teamBAssets,
    votesFor: 0,
    votesNeeded: 3
  });
}

function tradeAssetBoard(league) {
  const picks = ["2027 1st", "2027 2nd", "2027 3rd", "2028 1st", "2028 2nd", "2029 1st"];
  return league.teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    assets: [
      ...league.players.filter((player) => player.teamId === team.id).map((player) => ({
        label: `${player.position} ${player.name}`,
        value: Math.round(((player.overall || 70) - 60) * 11 + (player.position === "QB" ? 80 : 0)),
        type: "player"
      })),
      ...picks.map((pick) => ({ label: pick, value: assetValue(pick), type: "pick" }))
    ]
  }));
}

function buildStrikeBoard(league) {
  const configured = league.strikeBoard || {};
  const rules = configured.rules || { fairSim: 0.5, forceWin: 1, determinedStrike: 1.5, hardLimit: 5 };
  const cases = configured.cases || league.games
    .filter((game) => ["unscheduled", "admin_review", "fair_sim", "force_win_home", "force_win_away"].includes(game.status))
    .flatMap((game) => {
      const away = repository.getTeam(league, game.awayTeamId);
      const home = repository.getTeam(league, game.homeTeamId);
      const points = game.status === "fair_sim" ? rules.fairSim : game.status?.startsWith("force_win") ? rules.forceWin : 1;
      return [away, home].filter(Boolean).map((team) => ({
        teamId: team.id,
        coach: team.owner || `${team.name} Coach`,
        points,
        reason: `${away?.abbr || "Away"} at ${home?.abbr || "Home"} needs commissioner attention`,
        flags: [gameStatusLabel(game.status)]
      }));
    });
  const activeTeamIds = new Set(cases.map((entry) => entry.teamId));
  return {
    season: league.season,
    week: league.week,
    rules,
    atRisk: cases.filter((entry) => Number(entry.points || 0) >= 3),
    activeCases: cases.filter((entry) => Number(entry.points || 0) < 3),
    communicationFlags: configured.communicationFlags || [],
    cleanTeams: league.teams.filter((team) => !activeTeamIds.has(team.id)).map((team) => ({ id: team.id, abbr: team.abbr, name: team.name, owner: team.owner || null })).slice(0, 32)
  };
}

function gameStatusLabel(status) {
  const labels = { played: "Game completed", scheduled: "Scheduled", unscheduled: "Needs time", fair_sim: "Fair sim", force_win_home: "Force home", force_win_away: "Force away", admin_review: "Admin review" };
  return labels[status] || status || "Unknown";
}

function workspaceFor(league, role, identity) {
  const activeRole = role === "commissioner" ? "commissioner" : "coach";
  const membership = identity?.memberships?.find((entry) => entry.leagueId === league.id && entry.status === "active");
  const fallbackUser = league.demoUser || {};
  return {
    user: { id: identity?.id || fallbackUser.id, displayName: identity?.displayName || fallbackUser.displayName, teamId: membership?.teamId || fallbackUser.teamId },
    activeRole,
    team: repository.getTeam(league, membership?.teamId || fallbackUser.teamId),
    actions: league.actions?.[activeRole] || [],
    syncHealth: league.syncHealth,
    openTeams: league.teams.filter((team) => !team.owner).slice(0, 3)
  };
}

function recognitionKey(league, identity) {
  return `${league.id}:${identity?.id || league.demoUser?.id || "demo-user"}`;
}

function recognitionTeamFor(league, identity) {
  const membership = identity?.memberships?.find((entry) => entry.leagueId === league.id && entry.status === "active");
  return repository.getTeam(league, membership?.teamId || league.demoUser?.teamId) || league.teams[0] || null;
}

function baseRecognitionFor(league, identity) {
  if (league.recognition) return league.recognition;
  const ranked = powerRankings(league.teams);
  const best = ranked[0] || league.teams[0] || {};
  const challenger = ranked[1] || league.teams[1] || best;
  const team = recognitionTeamFor(league, identity);
  const playedGames = (league.games || []).filter((game) => game.status === "played" && (game.homeTeamId === team?.id || game.awayTeamId === team?.id));
  const openGames = (league.games || []).filter((game) => game.status !== "played" && (game.homeTeamId === team?.id || game.awayTeamId === team?.id));
  const wins = Number(team?.wins || 0);
  const losses = Number(team?.losses || 0);
  const pointDiff = Number(team?.pointsFor || 0) - Number(team?.pointsAgainst || 0);
  const activity = Math.max(5, Math.min(20, 3 + playedGames.length * 2 + openGames.length));
  const impact = Math.max(6, Math.min(30, wins * 2 + Math.floor(Math.max(0, pointDiff) / 50)));
  const legacy = Math.max(4, Math.min(20, Math.floor((wins + Math.max(league.teams.length, 1)) / 4) - Math.floor(losses / 4)));
  const scheduledGames = openGames.filter((game) => game.status === "scheduled" || game.scheduledAt);
  const featuredOpenGame = openGames.find((game) => game.featured) || openGames[0];
  return {
    week: league.week,
    phase: Number(league.week || 0) >= 10 ? "Late Regular Season" : "Regular Season",
    balances: { activity, impact, legacy },
    breakdown: [
      { lane: "Activity", label: "Game thread activity", points: activity, detail: `${playedGames.length} completed game(s), ${openGames.length} open matchup(s).` },
      { lane: "Impact", label: "Team performance", points: impact, detail: `${wins}-${losses} record, ${pointDiff >= 0 ? "+" : ""}${pointDiff} point differential.` },
      { lane: "Legacy", label: "League standing", points: legacy, detail: `${league.teams.length} teams tracked, ${wins} win(s) banked.` }
    ],
    scorecard: [
      {
        label: "Game completed",
        status: playedGames.length ? "complete" : "pending",
        detail: playedGames.length ? `${playedGames.length} completed game(s) imported this week.` : "No completed game has imported for this coach yet."
      },
      {
        label: "Kickoff scheduled",
        status: !openGames.length || scheduledGames.length ? "complete" : "warning",
        detail: !openGames.length ? "No open matchup is waiting." : scheduledGames.length ? `${scheduledGames.length} open matchup(s) have a time.` : `${featuredOpenGame?.awayTeam?.name || "Open matchup"} at ${featuredOpenGame?.homeTeam?.name || "opponent"} still needs a confirmed time.`
      },
      {
        label: "Thread communication",
        status: openGames.length ? "pending" : "complete",
        detail: openGames.length ? "Use the game thread to confirm availability and outcome." : "No active thread response is needed right now."
      },
      {
        label: "Stream or proof",
        status: playedGames.length ? "complete" : "pending",
        detail: playedGames.length ? "Game result is in; archive proof when ready." : "Post a stream link or result proof before advance."
      }
    ],
    leaders: [
      { lane: "Activity", name: best.name || "League leader", points: Math.max(0, Number(best.wins || 0) * 2 - Number(best.losses || 0)), detail: "Generated from current record until recognition events are recorded." },
      { lane: "Impact", name: challenger.name || "Contender", points: Math.max(0, Number(challenger.pointsFor || 0) - Number(challenger.pointsAgainst || 0)), detail: "Point differential snapshot from imported standings." },
      { lane: "Legacy", name: league.name, points: league.teams.length, detail: "League-wide participation baseline." }
    ],
    challenge: {
      title: "Clean Week Checklist",
      detail: "Schedule early, respond in thread, post stream or proof, and finish on time.",
      bonus: "Featured matchup winner earns extra Impact once recognition events are tracked."
    },
    perks: [
      { id: "streak-shield", lane: "Activity", name: "Streak Shield", cost: 5, status: "available", detail: "Protect one borderline activity week." },
      { id: "offensive-plan", lane: "Impact", name: "Offensive Game Plan", cost: 6, status: "available", detail: "Prepare an attack script for your next opponent." },
      { id: "tendency-report", lane: "Impact", name: "Opponent Tendency Report", cost: 5, status: "available", detail: "Review opponent style and counter points." },
      { id: "scout-focus", lane: "Legacy", name: "Scouting Focus Pack", cost: 6, status: "locked", detail: "Unlocks once scouting imports are connected." }
    ]
  };
}

function recognitionFor(league, identity, savedActivations) {
  const base = JSON.parse(JSON.stringify(baseRecognitionFor(league, identity)));
  const activations = savedActivations || runtimeRecognition.get(recognitionKey(league, identity)) || [];
  const balances = { ...(base.balances || {}) };
  const activeIds = new Set(activations.map((activation) => activation.id));
  base.perks = (base.perks || []).map((perk) => {
    if (!activeIds.has(perk.id)) return perk;
    return { ...perk, status: "active" };
  });
  for (const activation of activations) {
    const lane = String(activation.lane || "").toLowerCase();
    balances[lane] = Math.max(0, Number(balances[lane] || 0) - Number(activation.cost || 0));
  }
  base.balances = balances;
  base.breakdown = [
    ...(base.breakdown || []),
    ...activations.map((activation) => ({
      lane: activation.lane || "Recognition",
      label: `Spent: ${activation.name}`,
      points: -Number(activation.cost || 0),
      detail: "Activated for the current league week."
    }))
  ];
  base.activePerks = activations;
  return base;
}

async function recognitionView(league, identity) {
  const savedActivations = repository.listRecognitionActivations
    ? await repository.listRecognitionActivations(league, identity?.id)
    : null;
  return recognitionFor(league, identity, savedActivations);
}

async function activateRecognitionPerk(league, identity, perkId) {
  const current = await recognitionView(league, identity);
  const perk = current.perks.find((entry) => entry.id === perkId);
  if (!perk) throw new Error("Recognition perk not found.");
  if (perk.status === "locked") throw new Error("This perk is locked right now.");
  if (perk.status === "active") throw new Error("This perk is already active.");
  const lane = String(perk.lane || "").toLowerCase();
  const balance = Number(current.balances?.[lane] || 0);
  if (balance < Number(perk.cost || 0)) throw new Error(`Not enough ${perk.lane} points for this perk.`);
  if (repository.activateRecognitionPerk) {
    return recognitionFor(league, identity, await repository.activateRecognitionPerk(league, identity?.id, perk));
  }
  const key = recognitionKey(league, identity);
  const activation = { id: perk.id, name: perk.name, lane: perk.lane, cost: perk.cost, activatedAt: new Date().toISOString() };
  runtimeRecognition.set(key, [...(runtimeRecognition.get(key) || []), activation]);
  return recognitionFor(league, identity);
}

async function leagueRoute(request, response, url, identity) {
  const match = url.pathname.match(/^\/api\/leagues\/([^/]+)(?:\/(.+))?$/);
  if (!match) return false;
  const league = await repository.getLeague(match[1]);
  if (!league) return sendJson(response, 404, { error: "League not found" }) ?? true;
  const resource = match[2];
  if (request.method !== "GET" && !(request.method === "PATCH" && (resource?.startsWith("members/") || resource?.startsWith("trades/"))) && !(request.method === "POST" && (resource === "recognition/perks" || ["import-runs", "import-runs/from-url", "bootstrap-owner", "trades"].includes(resource)))) {
    return sendJson(response, 405, { error: "Method not allowed" }) ?? true;
  }

  if (!resource) {
    const requestedRole = url.searchParams.get("role") === "commissioner" ? "commissioner" : "coach";
    if (!hasLeagueRole(identity, league.id, requestedRole)) return sendJson(response, identity ? 403 : 401, { error: "League membership required" }) ?? true;
    const rankings = powerRankings(league.teams);
    const featuredGame = league.games.find((game) => game.featured) || league.games.find((game) => game.status === "scheduled") || league.games[0];
    return sendJson(response, 200, {
      id: league.id, name: league.name, gameType: league.gameType, season: league.season, week: league.week,
      advanceAt: league.advanceAt, featuredGame: enrichGame(league, featuredGame),
      recentFinals: league.games.filter((game) => game.status === "played").map((game) => enrichGame(league, game)),
      powerRankings: rankings.slice(0, 5), playoffRace: playoffRace(league.teams),
      workspace: workspaceFor(league, requestedRole, identity)
    }) ?? true;
  }
  if (resource === "workspace") {
    const requestedRole = url.searchParams.get("role") === "commissioner" ? "commissioner" : "coach";
    if (!hasLeagueRole(identity, league.id, requestedRole)) return sendJson(response, identity ? 403 : 401, { error: "Insufficient league role" }) ?? true;
    return sendJson(response, 200, workspaceFor(league, requestedRole, identity)) ?? true;
  }
  if (resource === "recognition") {
    if (!hasLeagueRole(identity, league.id, "coach")) return sendJson(response, identity ? 403 : 401, { error: "League membership required" }) ?? true;
    return sendJson(response, 200, await recognitionView(league, identity)) ?? true;
  }
  if (resource === "recognition/perks" && request.method === "POST") {
    if (!hasLeagueRole(identity, league.id, "coach")) return sendJson(response, identity ? 403 : 401, { error: "League membership required" }) ?? true;
    try {
      const body = await readJson(request);
      return sendJson(response, 201, await activateRecognitionPerk(league, identity, body.perkId)) ?? true;
    } catch (error) {
      return sendJson(response, 400, { error: "Unable to activate perk", detail: error.message }) ?? true;
    }
  }
  if (resource === "members") {
    if (!hasLeagueRole(identity, league.id, "commissioner")) return sendJson(response, identity ? 403 : 401, { error: "Commissioner role required" }) ?? true;
    return sendJson(response, 200, await repository.listMembers(league)) ?? true;
  }
  if (resource?.startsWith("members/") && request.method === "PATCH") {
    if (!hasLeagueRole(identity, league.id, "commissioner")) return sendJson(response, identity ? 403 : 401, { error: "Commissioner role required" }) ?? true;
    try {
      const body = await readJson(request);
      const changes = {};
      if (body.role !== undefined) {
        if (!["coach", "commissioner"].includes(body.role)) return sendJson(response, 400, { error: "Invalid membership role" }) ?? true;
        changes.role = body.role;
      }
      if (body.status !== undefined) {
        if (!["pending", "active", "suspended", "removed"].includes(body.status)) return sendJson(response, 400, { error: "Invalid membership status" }) ?? true;
        changes.status = body.status;
      }
      if (body.teamId !== undefined) {
        if (body.teamId !== null && !repository.getTeam(league, body.teamId)) return sendJson(response, 400, { error: "Unknown team" }) ?? true;
        changes.teamId = body.teamId;
      }
      if (!Object.keys(changes).length) return sendJson(response, 400, { error: "No supported changes supplied" }) ?? true;
      const membership = await repository.updateMembership(league, resource.slice("members/".length), changes, identity.id);
      if (!membership) return sendJson(response, 404, { error: "Membership not found" }) ?? true;
      return sendJson(response, 200, membership) ?? true;
    } catch (error) {
      return sendJson(response, 400, { error: "Unable to update membership", detail: error.message }) ?? true;
    }
  }
  if (resource === "import-runs" && request.method === "POST") {
    if (!hasLeagueRole(identity, league.id, "commissioner")) return sendJson(response, identity ? 403 : 401, { error: "Commissioner role required" }) ?? true;
    if (!repository.recordImportRun) return sendJson(response, 501, { error: "Import recording is not supported by this repository" }) ?? true;
    try {
      const body = await readJson(request);
      const input = body.schemaVersion ? normalizeExport(body) : body;
      if (!Array.isArray(input.datasets) || input.datasets.length === 0) return sendJson(response, 400, { error: "No importable datasets found", detail: "Use a LeagueOS bundle, the built-in Snallabot sample, or a Snallabot export containing teamsExport, standingsExport, schedulesExport, or rosterExports." }) ?? true;
      const run = await repository.recordImportRun(league, {
        source: input.source,
        season: input.season,
        week: input.week,
        datasets: input.datasets
      }, identity.id);
      return sendJson(response, 201, run) ?? true;
    } catch (error) {
      return sendJson(response, 400, { error: "Unable to record import", detail: error.message }) ?? true;
    }
  }
  if (resource === "import-runs/from-url" && request.method === "POST") {
    if (!hasLeagueRole(identity, league.id, "commissioner")) return sendJson(response, identity ? 403 : 401, { error: "Commissioner role required" }) ?? true;
    if (!repository.recordImportRun) return sendJson(response, 501, { error: "Import recording is not supported by this repository" }) ?? true;
    try {
      const body = await readJson(request);
      const exportUrl = body.url || body.exportUrl;
      if (!exportUrl) return sendJson(response, 400, { error: "Export URL is required" }) ?? true;
      const exportPayload = await fetchExportJson(exportUrl);
      const input = exportPayload.schemaVersion ? normalizeExport(exportPayload) : exportPayload;
      if (!Array.isArray(input.datasets) || input.datasets.length === 0) return sendJson(response, 400, { error: "No importable datasets found", detail: "The export URL returned JSON, but it did not contain importable LeagueOS or Snallabot datasets." }) ?? true;
      const run = await repository.recordImportRun(league, {
        source: input.source || exportUrl,
        season: input.season,
        week: input.week,
        datasets: input.datasets
      }, identity.id);
      return sendJson(response, 201, run) ?? true;
    } catch (error) {
      return sendJson(response, 400, { error: "Unable to import export URL", detail: error.message }) ?? true;
    }
  }
  if (resource === "import-runs" && request.method === "GET") {
    if (!hasLeagueRole(identity, league.id, "commissioner")) return sendJson(response, identity ? 403 : 401, { error: "Commissioner role required" }) ?? true;
    if (!repository.listImportRuns) return sendJson(response, 501, { error: "Import history is not supported by this repository" }) ?? true;
    const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50);
    return sendJson(response, 200, await repository.listImportRuns(league, limit)) ?? true;
  }
  if (resource === "import-runs/monitor" && request.method === "GET") {
    const monitorToken = url.searchParams.get("token");
    const configuredMonitorToken = process.env.SNALLABOT_WEBHOOK_TOKEN;
    if (!configuredMonitorToken || monitorToken !== configuredMonitorToken) return sendJson(response, 401, { error: "Invalid monitor token" }) ?? true;
    if (!repository.listImportRuns) return sendJson(response, 501, { error: "Import history is not supported" }) ?? true;
    const runs = await repository.listImportRuns(league, 50);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = runs.filter(r => new Date(r.startedAt) >= since);
    const errors = recent.filter(r => r.errorMessage || (r.datasets || []).some(d => d.errorMessage));
    const clean = recent.filter(r => !r.errorMessage && !(r.datasets || []).some(d => d.errorMessage));
    const lastRun = recent[0] || null;
    const summary = {
      generatedAt: new Date().toISOString(),
      window: "24h",
      total: recent.length,
      clean: clean.length,
      errors: errors.length,
      lastRun: lastRun ? { source: lastRun.source, status: lastRun.status, startedAt: lastRun.startedAt } : null,
      errorDetails: errors.map(r => ({
        source: r.source,
        status: r.status,
        startedAt: r.startedAt,
        errorMessage: r.errorMessage || null,
        datasetErrors: (r.datasets || []).filter(d => d.errorMessage).map(d => ({ name: d.name, error: d.errorMessage }))
      }))
    };
    return sendJson(response, 200, summary) ?? true;
  }
  if (resource === "receiver-attempts" && request.method === "GET") {
    if (!hasLeagueRole(identity, league.id, "commissioner")) return sendJson(response, identity ? 403 : 401, { error: "Commissioner role required" }) ?? true;
    return sendJson(response, 200, receiverAttemptsForLeague(league.id)) ?? true;
  }
  if (resource === "bootstrap-owner" && request.method === "POST") {
    if (!identity) return sendJson(response, 401, { error: "Discord sign-in required" }) ?? true;
    const allowedDiscordIds = (process.env.LEAGUE_OWNER_DISCORD_ID || "").split(",").map((id) => id.trim()).filter(Boolean);
    if (!allowedDiscordIds.includes(identity.discordId)) return sendJson(response, 403, { error: "This Discord account is not configured as a league owner" }) ?? true;
    if (!repository.bootstrapOwnerMembership) return sendJson(response, 501, { error: "Owner bootstrap is not supported by this repository" }) ?? true;
    try {
      const membership = await repository.bootstrapOwnerMembership(league, identity.id, process.env.LEAGUE_OWNER_TEAM || "buf");
      return sendJson(response, 201, membership) ?? true;
    } catch (error) {
      return sendJson(response, 400, { error: "Unable to bootstrap owner membership", detail: error.message }) ?? true;
    }
  }
  if (resource === "sync-health") return sendJson(response, 200, league.syncHealth) ?? true;
  if (resource === "strike-board") {
    if (!hasLeagueRole(identity, league.id, "commissioner")) return sendJson(response, identity ? 403 : 401, { error: "Commissioner role required" }) ?? true;
    return sendJson(response, 200, buildStrikeBoard(league)) ?? true;
  }
  if (resource === "trades" && request.method === "POST") {
    if (!hasLeagueRole(identity, league.id, "coach")) return sendJson(response, identity ? 403 : 401, { error: "League membership required" }) ?? true;
    try {
      const body = await readJson(request);
      const trade = repository.createTradeProposal
        ? await repository.createTradeProposal(league, body, identity.id)
        : createTradeProposal(league, body, identity);
      return sendJson(response, 201, enrichTrade(league, trade)) ?? true;
    } catch (error) {
      return sendJson(response, 400, { error: "Unable to draft trade", detail: error.message }) ?? true;
    }
  }
  if (resource?.startsWith("trades/") && request.method === "PATCH") {
    if (!hasLeagueRole(identity, league.id, "coach")) return sendJson(response, identity ? 403 : 401, { error: "League membership required" }) ?? true;
    const tradeId = resource.slice("trades/".length);
    const body = await readJson(request);
    const statusByAction = { approve: "committee_review", deny: "denied", committee_approve: "approved", committee_deny: "denied" };
    const nextStatus = statusByAction[body.action];
    if (!nextStatus) return sendJson(response, 400, { error: "Unsupported trade action" }) ?? true;
    const trade = repository.updateTradeStatus
      ? await repository.updateTradeStatus(league, tradeId, nextStatus, identity.id)
      : updateTradeStatus(league, tradeId, nextStatus);
    if (!trade) return sendJson(response, 404, { error: "Trade not found" }) ?? true;
    return sendJson(response, 200, enrichTrade(league, trade)) ?? true;
  }
  if (resource === "trades") {
    const trades = repository.listTrades ? await repository.listTrades(league) : tradesForLeague(league);
    return sendJson(response, 200, trades.map((trade) => enrichTrade(league, trade))) ?? true;
  }
  if (resource === "trade-assets") return sendJson(response, 200, tradeAssetBoard(league)) ?? true;
  if (resource === "media") return sendJson(response, 200, league.media || []) ?? true;
  if (resource === "standings") return sendJson(response, 200, standingsByDivision(league.teams)) ?? true;
  if (resource === "stat-leaders") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 5), 25);
    const leaders = repository.listStatLeaders ? await repository.listStatLeaders(league, limit) : [];
    return sendJson(response, 200, leaders) ?? true;
  }
  if (resource === "playoff-race") return sendJson(response, 200, playoffRace(league.teams)) ?? true;
  if (resource === "power-rankings") return sendJson(response, 200, powerRankings(league.teams)) ?? true;
  if (resource === "teams") return sendJson(response, 200, league.teams) ?? true;
  if (resource.startsWith("teams/")) {
    const team = repository.getTeam(league, resource.slice("teams/".length));
    if (!team) return sendJson(response, 404, { error: "Team not found" }) ?? true;
    return sendJson(response, 200, {
      ...team,
      roster: league.players.filter((player) => player.teamId === team.id),
      schedule: league.games.filter((game) => game.homeTeamId === team.id || game.awayTeamId === team.id).map((game) => enrichGame(league, game)),
      draftPicks: ["2027 1st", "2027 2nd", "2028 1st"]
    }) ?? true;
  }
  if (resource === "games") return sendJson(response, 200, league.games.map((game) => enrichGame(league, game))) ?? true;
  if (resource === "players") {
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const players = league.players.filter((player) => !query || player.name.toLowerCase().includes(query) || player.position.toLowerCase() === query)
      .map((player) => ({ ...player, team: repository.getTeam(league, player.teamId) }));
    return sendJson(response, 200, players) ?? true;
  }
  return sendJson(response, 404, { error: "Resource not found" }) ?? true;
}

async function staticFile(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = normalize(join(webRoot, requested));
  if (!path.startsWith(webRoot)) return sendJson(response, 403, { error: "Forbidden" });
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" });
    response.end(body);
  } catch {
    const body = await readFile(join(webRoot, "index.html"));
    response.writeHead(200, { "content-type": mime[".html"] });
    response.end(body);
  }
}

export async function requestHandler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (await authRoute(request, response, url)) return;
  if (!["GET", "PATCH", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed" });
  if (url.pathname === "/api/health") return sendJson(response, 200, { status: "ok", service: "trenches-api" });
  if (url.pathname === "/api/ready") {
    const production = process.env.NODE_ENV === "production";
    const missing = production
      ? ["SESSION_SECRET", "DATABASE_URL", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"].filter((name) => !process.env[name])
      : [];
    const ready = !production || (missing.length === 0 && process.env.REPOSITORY_ADAPTER === "prisma");
    return sendJson(response, ready ? 200 : 503, {
      status: ready ? "ready" : "not_ready",
      components: { api: "ready", repository: process.env.REPOSITORY_ADAPTER || "memory", auth: process.env.DEMO_MODE === "false" ? "discord" : "demo" },
      missing
    });
  }
  if (url.pathname === "/api/leagues") return sendJson(response, 200, await repository.listLeagues());
  if (await receiverRoute(request, response, url)) return;
  const identity = await identityForRequest(request);
  if (await leagueRoute(request, response, url, identity)) return;
  if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "Route not found" });
  await staticFile(response, url.pathname);
}

export const server = createServer(requestHandler);

if (process.env.NODE_ENV !== "test") {
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. The website may already be running at http://localhost:${port}.`);
    } else {
      console.error(`Unable to start the website: ${error.message}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`The Trenches LeagueOS running at http://localhost:${port}`));
}
