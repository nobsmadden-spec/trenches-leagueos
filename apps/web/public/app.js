const leagueId = "the-trenches";
const productionOrigin = "https://trenches-leagueos.onrender.com";

// ── NFL Team Logo & Color Helpers ────────────────────────────────────────────
const NFL_LOGO_MAP = {
  ari:"ari",atl:"atl",bal:"bal",buf:"buf",car:"car",chi:"chi",cin:"cin",cle:"cle",
  dal:"dal",den:"den",det:"det",gb:"gb",hou:"hou",ind:"ind",jax:"jax",kc:"kc",
  lac:"lac",lar:"lar",lv:"lv",mia:"mia",min:"min",ne:"ne",no:"no",nyg:"nyg",
  nyj:"nyj",phi:"phi",pit:"pit",sea:"sea",sf:"sf",tb:"tb",ten:"ten",
  wsh:"wsh",was:"wsh",wsh:"wsh",
};
const NFL_COLOR_MAP = {
  ari:"#97233F",atl:"#A71930",bal:"#241773",buf:"#00338D",car:"#0085CA",
  chi:"#0B162A",cin:"#FB4F14",cle:"#311D00",dal:"#003594",den:"#FB4F14",
  det:"#0076B6",gb:"#203731",hou:"#03202F",ind:"#002C5F",jax:"#101820",
  kc:"#E31837",lac:"#0080C6",lar:"#003594",lv:"#000000",mia:"#008E97",
  min:"#4F2683",ne:"#002244",no:"#D3BC8D",nyg:"#0B2265",nyj:"#125740",
  phi:"#004C54",pit:"#FFB612",sea:"#002244",sf:"#AA0000",tb:"#D50A0A",
  ten:"#0C2340",wsh:"#5A1414",was:"#5A1414",
};
function getNFLLogo(abbr) {
  if (!abbr) return null;
  const key = (abbr || "").toLowerCase();
  const mapped = NFL_LOGO_MAP[key];
  return mapped ? `/assets/logos/nfl/${mapped}.png` : null;
}
function getNFLColor(abbr, fallback) {
  if (!abbr) return fallback || "#64748b";
  const key = (abbr || "").toLowerCase();
  return NFL_COLOR_MAP[key] || fallback || "#64748b";
}
function teamLogoImg(abbr, size = 40) {
  const src = getNFLLogo(abbr);
  if (!src) return `<span class="team-abbr-text">${(abbr||"").toUpperCase()}</span>`;
  return `<img src="${src}" alt="${(abbr||"").toUpperCase()}" class="team-logo-img" width="${size}" height="${size}" loading="lazy" onerror="this.style.display='none';this.nextSibling&&(this.nextSibling.style.display='')">`;
}
// ─────────────────────────────────────────────────────────────────────────────
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
const record = (team = {}) => Number.isFinite(Number(team.wins)) && Number.isFinite(Number(team.losses)) ? `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}` : "--";
const formatStat = (value) => Number.isInteger(value) ? value.toLocaleString() : Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
let currentRole = "coach";
let workspace;
let tradeCache = [];
let tradeAssets = [];
let tradeFilter = "all";
let mediaDraftCache = [];
let mediaPostCache = [];
let teamCache = [];
let matchupCache = [];
let matchupFilter = "all";
let activeThreadGameId = null;
let selectedTeamId = null;
document.body.dataset.role = currentRole;

function receiverUrl() {
  const current = $("#receiver-url")?.value || "";
  const tokenMatch = current.match(/\/token\/([^/?#]+)/);
  const token = tokenMatch?.[1] && tokenMatch[1] !== "YOUR_TOKEN" ? tokenMatch[1] : "YOUR_TOKEN";
  const publicOrigin = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ? productionOrigin : window.location.origin;
  return `${publicOrigin}/api/import-receivers/snallabot/${leagueId}/token/${token}`;
}

function updateReceiverUrl() {
  const field = $("#receiver-url");
  if (field) field.value = receiverUrl();
  const note = $("#receiver-environment-note");
  if (note) {
    note.textContent = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
      ? "Snallabot sends to Render. Live exports appear on the Render website; localhost uses a separate Docker database."
      : "This public receiver writes directly to the current league database.";
  }
}

async function loadIdentity() {
  const response = await fetch("/api/me");
  const identity = await response.json();
  const chip = $("#identity-chip");
  if (!identity.authenticated) {
    chip.textContent = "Sign in";
    $("#role-switch").hidden = true;
    return identity;
  }
  chip.textContent = identity.displayName;
  chip.removeAttribute("href");
  const membership = identity.memberships?.find((entry) => entry.leagueId === leagueId && entry.status === "active");
  $("#role-switch").hidden = !["commissioner", "admin"].includes(membership?.role);
  return identity;
}

async function api(path) {
  const response = await fetch(`/api/leagues/${leagueId}${path}`);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function apiMutation(path, method, body) {
  const response = await fetch(`/api/leagues/${leagueId}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error([result.error || `Request failed: ${response.status}`, result.detail].filter(Boolean).join(": "));
  return result;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

function setView(name) {
  $(".hero").classList.toggle("hidden", name !== "dashboard");
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "standings") return loadStandings();
  if (name === "matchups") return loadMatchups();
  if (name === "players") return loadPlayers();
  if (name === "team") return loadTeam();
  if (name === "trades") return loadTrades();
  if (name === "media") return loadMedia();
  if (name === "office") return loadOffice();
  return Promise.resolve();
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewTarget)));
document.addEventListener("click", (event) => {
  const tradeSubmit = event.target.closest("[data-trade-submit]");
  if (tradeSubmit) {
    submitTradeProposal();
    return;
  }
  const tradeDecision = event.target.closest("[data-trade-decision]");
  if (tradeDecision) {
    updateTradeDecision(tradeDecision.dataset.tradeId, tradeDecision.dataset.tradeDecision);
    return;
  }
  const tradeRefresh = event.target.closest("#trade-refresh");
  if (tradeRefresh) {
    loadTrades(true);
    return;
  }
  const recognitionPerk = event.target.closest("[data-recognition-perk]");
  if (recognitionPerk) {
    activateRecognitionPerk(recognitionPerk.dataset.recognitionPerk);
    return;
  }
  const mediaCopy = event.target.closest("[data-media-copy]");
  if (mediaCopy) {
    copyMediaDraft(mediaCopy.dataset.mediaCopy);
    return;
  }
  const mediaPostCopy = event.target.closest("[data-media-post-copy]");
  if (mediaPostCopy) {
    copyMediaPost(mediaPostCopy.dataset.mediaPostCopy);
    return;
  }
  const mediaStage = event.target.closest("[data-media-stage]");
  if (mediaStage) {
    stageMediaDraft(mediaStage.dataset.mediaStage);
    return;
  }
  const mediaAction = event.target.closest("[data-media-action]");
  if (mediaAction) {
    updateMediaPost(mediaAction.dataset.mediaId, mediaAction.dataset.mediaAction);
    return;
  }
  const threadOutcome = event.target.closest("[data-thread-outcome]");
  if (threadOutcome) {
    recordThreadOutcome(threadOutcome.dataset.threadOutcome);
    return;
  }
  const threadPreview = event.target.closest("[data-thread-preview]");
  if (threadPreview) {
    openThreadPreview(threadPreview.dataset.threadPreview);
    return;
  }
  const teamThread = event.target.closest("[data-open-team-thread]");
  if (teamThread) {
    openTeamThread(teamThread.dataset.openTeamThread);
    return;
  }
  const teamProfile = event.target.closest("[data-team-profile]");
  if (teamProfile) {
    selectedTeamId = teamProfile.dataset.teamProfile;
    setView("team");
    return;
  }
  const action = event.target.closest("[data-action-target]");
  if (action) setView(action.dataset.actionTarget);
});

$("#role-switch").addEventListener("click", async () => {
  currentRole = currentRole === "coach" ? "commissioner" : "coach";
  $("#role-switch").textContent = currentRole === "coach" ? "Coach View" : "Commissioner View";
  document.body.dataset.role = currentRole;
  if (currentRole === "coach" && $("#office-view").classList.contains("active")) setView("dashboard");
  workspace = await api(`/workspace?role=${currentRole}`);
  renderWorkspace(workspace);
});

function gameTeam(team) {
  return `<div class="match-team"><div class="team-badge" style="border-color:${getNFLColor(team.abbr, team.color)}">${teamLogoImg(team.abbr, 36)}<span class="team-abbr-text" style="display:none">${team.abbr}</span></div><h3>${team.name}</h3><p>${record(team)} · ${team.conference} ${team.division}</p></div>`;
}

function gameStatusLabel(game) {
  const labels = { played: "Final", scheduled: "Scheduled", unscheduled: "Needs time", fair_sim: "Fair sim", force_win_home: "Force home", force_win_away: "Force away", admin_review: "Admin review" };
  return labels[game.status] || game.status || "Unknown";
}

function matchupLine(game, compact = false) {
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  const isFinal = game.status === "played";
  const detail = isFinal ? `${game.awayScore ?? "-"} - ${game.homeScore ?? "-"}` : (game.scheduledAt || "No time set");
  const gameKey = game.id || game.externalId || "";
  return `<article class="${compact ? "matchup-mini" : "matchup-card"}" data-status="${game.status || "unknown"}"><div class="matchup-status"><span>${gameStatusLabel(game)}</span><b>${detail}</b></div><div class="matchup-teams"><button data-team-profile="${away.id}" style="--team-color:${away.color || "#64748b"}"><span>${away.abbr || "AWY"}</span><strong>${away.name || "Away Team"}</strong><small>${record(away)}</small></button><em>${isFinal ? "FINAL" : "VS"}</em><button data-team-profile="${home.id}" style="--team-color:${home.color || "#64748b"}"><span>${home.abbr || "HME"}</span><strong>${home.name || "Home Team"}</strong><small>${record(home)}</small></button></div>${compact ? "" : `<div class="matchup-actions"><button class="text-button" data-team-profile="${away.id}">Away profile</button><button class="primary-button" type="button" data-thread-preview="${gameKey}">Game Thread Preview</button><button class="text-button" data-team-profile="${home.id}">Home profile</button></div>`}</article>`;
}

function threadTeam(team = {}, label) {
  const diff = Number(team.pointsFor || 0) - Number(team.pointsAgainst || 0);
  return `<article class="thread-team" style="--team-color:${team.color || "#64748b"}"><span>${label}</span><div><strong>${team.name || "Team TBD"}</strong><small>${record(team)} · ${team.conference || "Conference"} ${team.division || ""}</small></div><b>${diff >= 0 ? "+" : ""}${diff} DIFF</b></article>`;
}

function matchupIntelligenceCard(intelligence) {
  const away = intelligence.away || {};
  const home = intelligence.home || {};
  const teamLabel = (teamId) => teamId === "even" ? "Even" : teamId === away.teamId ? away.abbr : home.abbr;
  const edges = (intelligence.edges || []).map((edge) => `<article class="intelligence-edge"><span>${escapeHtml(edge.label)}</span><div><strong>${escapeHtml(away.abbr)} ${escapeHtml(edge.awayValue)}${escapeHtml(edge.unit)}</strong><em>vs</em><strong>${escapeHtml(home.abbr)} ${escapeHtml(edge.homeValue)}${escapeHtml(edge.unit)}</strong></div><b>${escapeHtml(teamLabel(edge.advantage))}</b><small>${escapeHtml(edge.evidence)}</small></article>`).join("");
  const personnel = (profile) => `<div class="intelligence-personnel"><strong>${escapeHtml(profile.abbr)} key personnel</strong>${(profile.keyPersonnel || []).slice(0, 3).map((player) => `<span>${escapeHtml(player.position)} ${escapeHtml(player.name)} <b>${escapeHtml(player.overall)}</b></span>`).join("") || `<span>No rated roster data.</span>`}</div>`;
  const imported = intelligence.lastImportAt ? new Date(intelligence.lastImportAt) : null;
  const importLabel = imported && !Number.isNaN(imported.valueOf()) ? imported.toLocaleString() : "import time unavailable";
  const unavailable = intelligence.coverage?.unavailable?.length ? `Unavailable inputs: ${intelligence.coverage.unavailable.join(", ")}.` : "All configured inputs available.";
  return `<section class="thread-intelligence"><div class="intelligence-heading"><div><span>Deterministic matchup model</span><h3>${escapeHtml(intelligence.projection?.winnerName || "Toss-up")} · ${escapeHtml(intelligence.projection?.confidence || "slight")} lean</h3></div><b>WEEK ${escapeHtml(intelligence.dataWeek ?? intelligence.week ?? "--")}</b></div><p>${escapeHtml(intelligence.projection?.note || "No clear projection is available.")}</p><div class="intelligence-edge-grid">${edges}</div><div class="intelligence-personnel-grid">${personnel(away)}${personnel(home)}</div><footer>${escapeHtml(intelligence.methodology)}<br>${escapeHtml(unavailable)}<br>Season ${escapeHtml(intelligence.season ?? "--")} · ${escapeHtml(importLabel)}</footer></section>`;
}

async function openThreadPreview(gameId) {
  const game = matchupCache.find((item) => String(item.id) === String(gameId) || String(item.externalId) === String(gameId));
  if (!game) return;
  activeThreadGameId = game.id || game.externalId;
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  const isFinal = game.status === "played";
  const scoreLine = isFinal ? `Final score: ${away.abbr || "Away"} ${game.awayScore ?? "-"}, ${home.abbr || "Home"} ${game.homeScore ?? "-"}` : `Kickoff: ${game.scheduledAt || "time still needs to be confirmed"}`;
  $("#thread-title").textContent = `${away.abbr || "Away"} at ${home.abbr || "Home"}`;
  const commissionerActions = currentRole === "commissioner" ? `<button type="button" data-thread-outcome="force_win_away">FW ${away.abbr || "Away"}</button><button type="button" data-thread-outcome="force_win_home">FW ${home.abbr || "Home"}</button><button class="danger-button" type="button" data-thread-outcome="strike_away">Strike ${away.abbr || "Away"}</button><button class="danger-button" type="button" data-thread-outcome="strike_home">Strike ${home.abbr || "Home"}</button>` : "";
  $("#thread-preview-body").innerHTML = `<div class="thread-copy"><p class="eyebrow">${gameStatusLabel(game)} · Week ${game.week || "--"}</p><h3>${away.name || "Away Team"} at ${home.name || "Home Team"}</h3><p>${scoreLine}</p></div><div class="thread-team-grid">${threadTeam(away, "Away coach")}${threadTeam(home, "Home coach")}</div><div id="thread-intelligence" class="thread-intelligence-loading">Calculating matchup edges from imported standings and rosters...</div><div class="thread-outcomes"><button class="success-button" type="button" data-thread-outcome="played">Game Completed</button><button type="button" data-thread-outcome="fair_sim">Fair Sim</button><button type="button" data-thread-outcome="cpu">CPU Game</button>${commissionerActions}</div><div id="thread-outcome-result" class="thread-outcome-result muted">Choose an outcome to record it in LeagueOS.</div><div class="thread-checklist"><strong>Thread checklist</strong><span>Tag both coaches</span><span>Confirm kickoff window</span><span>Post stream or proof link</span><span>${isFinal ? "Mark final and archive" : "Track activity until final"}</span></div>`;
  const panel = $("#game-thread-preview");
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  const requestedGameId = activeThreadGameId;
  try {
    const intelligence = await api(`/games/${encodeURIComponent(game.id || game.externalId)}/intelligence`);
    if (activeThreadGameId !== requestedGameId) return;
    const target = $("#thread-intelligence");
    if (target) target.outerHTML = matchupIntelligenceCard(intelligence);
  } catch (error) {
    const target = $("#thread-intelligence");
    if (target) target.innerHTML = `Matchup intelligence is unavailable: ${escapeHtml(error.message)}`;
  }
}

async function openTeamThread(gameId) {
  if (!gameId) return;
  await setView("matchups");
  openThreadPreview(gameId);
}

async function recordThreadOutcome(outcome) {
  const game = matchupCache.find((item) => String(item.id) === String(activeThreadGameId) || String(item.externalId) === String(activeThreadGameId));
  if (!game) return;
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  const labels = {
    played: "Game marked complete. Next version can post the final confirmation to Discord.",
    fair_sim: "Fair sim drafted. Both coaches should be treated as agreeing the game will not be played.",
    force_win_away: `${away.name || "Away team"} force-win drafted for commissioner review.`,
    force_win_home: `${home.name || "Home team"} force-win drafted for commissioner review.`,
    cpu: "CPU outcome drafted. No strike should be applied.",
    strike_away: `${away.name || "Away team"} strike drafted from thread evidence.`,
    strike_home: `${home.name || "Home team"} strike drafted from thread evidence.`
  };
  const result = $("#thread-outcome-result");
  result.textContent = "Recording outcome...";
  result.className = "thread-outcome-result muted";
  try {
    const updated = await apiMutation(`/games/${encodeURIComponent(game.id || game.externalId)}/outcome`, "PATCH", { outcome });
    Object.assign(game, updated);
    loadMatchups(matchupFilter);
    result.textContent = labels[outcome] || "Outcome recorded.";
    result.className = `thread-outcome-result ${outcome.includes("strike") ? "danger" : "complete"}`;
  } catch (error) {
    result.textContent = error.message;
    result.className = "thread-outcome-result danger";
  }
}

function seedRows(teams) {
  return teams.map((team) => `<div class="seed-row"><span class="seed">${team.seed}</span><strong>${team.name}</strong><span class="record">${record(team)}</span></div>`).join("");
}

function actionRows(actions) {
  return actions.map((action) => `<button class="action-row" data-action-target="${action.target}"><span class="priority-dot ${action.priority}"></span><span><strong>${action.label}</strong><small>${action.detail}</small></span><span class="action-arrow">→</span></button>`).join("");
}

function renderSync(target, sync) {
  const datasets = sync?.datasets || [];
  target.innerHTML = datasets.length
    ? datasets.map((dataset) => `<div class="dataset-row"><span class="dataset-check">✓</span><span>${dataset.name}</span><strong>${Number(dataset.records || 0).toLocaleString()}</strong></div>`).join("")
    : `<p class="muted">No imported datasets have reported yet.</p>`;
}

function renderWorkspace(nextWorkspace) {
  workspace = nextWorkspace;
  if (!workspace) return;
  $("#action-eyebrow").textContent = currentRole === "coach" ? "Coach workspace" : "Commissioner workspace";
  $("#action-count").textContent = workspace.actions?.length || 0;
  $("#action-queue").innerHTML = workspace.actions?.length ? actionRows(workspace.actions) : `<p class="muted">Nothing needs attention right now.</p>`;
  $("#sync-state").textContent = workspace.syncHealth?.status || "unknown";
  $("#sync-state").className = `health-badge ${workspace.syncHealth?.status || "unknown"}`;
  const updated = workspace.syncHealth?.lastCompletedAt ? new Date(workspace.syncHealth.lastCompletedAt) : null;
  $("#sync-time").textContent = updated && !Number.isNaN(updated.valueOf()) ? `Last complete import ${updated.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Waiting for the first completed import.";
  renderSync($("#sync-datasets"), workspace.syncHealth);
}

function renderRecognition(recognition) {
  $("#recognition-week").textContent = `Week ${recognition.week || "--"} · ${recognition.phase || "Season"}`;
  const balances = recognition.balances || {};
  const leaders = recognition.leaders || [];
  const perks = recognition.perks || [];
  const activePerks = recognition.activePerks || [];
  const reportCards = activePerks.filter((perk) => perk.report);
  const challenge = recognition.challenge || {};
  const breakdown = recognition.breakdown || [];
  const scorecard = recognition.scorecard || [];
  $("#recognition-hub").innerHTML = `<div class="recognition-balances">${["activity", "impact", "legacy"].map((lane) => `<article><span>${lane}</span><strong>${Number(balances[lane] || 0)}</strong><small>available</small></article>`).join("")}</div><div id="recognition-action" class="recognition-action muted">${activePerks.length ? `${activePerks.length} active perk${activePerks.length === 1 ? "" : "s"} this week.` : "Choose a perk to activate for this week."}</div>${scorecard.length ? `<section class="recognition-scorecard"><h3>Weekly Coach Scorecard</h3>${scorecard.map((item) => `<article class="scorecard-item ${item.status || "pending"}"><span>${item.status || "pending"}</span><div><strong>${item.label || "Coach task"}</strong><small>${item.detail || "Track this item through the weekly workflow."}</small></div></article>`).join("")}</section>` : ""}${reportCards.length ? `<section class="recognition-reports"><h3>Generated Perk Reports</h3>${reportCards.map((perk) => `<article class="recognition-report"><span>${escapeHtml(perk.lane || "Perk")} Report</span><h4>${escapeHtml(perk.report.title || perk.name)}</h4><p>${escapeHtml(perk.report.subtitle || "")}</p><ul>${(perk.report.lines || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul><small>${escapeHtml(perk.report.data || "")}</small></article>`).join("")}</section>` : ""}${breakdown.length ? `<section class="recognition-breakdown"><h3>Balance Breakdown</h3>${breakdown.map((item) => `<div class="recognition-breakdown-row"><span>${item.lane || "Lane"}</span><div><strong>${item.label || "Recognition points"}</strong><small>${item.detail || "Tracked from league activity."}</small></div><b>${Number(item.points || 0) > 0 ? "+" : ""}${Number(item.points || 0)}</b></div>`).join("")}</section>` : ""}<div class="recognition-columns"><section><h3>Recognition Leaders</h3>${leaders.map((leader) => `<div class="recognition-leader"><span>${leader.lane}</span><div><strong>${leader.name}</strong><small>${leader.detail || "League recognition"}</small></div><b>${leader.points}</b></div>`).join("") || `<p class="muted">Recognition leaders will appear after coach events are tracked.</p>`}</section><section><h3>Weekly Challenge</h3><article class="challenge-card"><strong>${challenge.title || "Clean Week Checklist"}</strong><p>${challenge.detail || "Schedule, communicate, stream, and finish on time."}</p><small>${challenge.bonus || "Bonuses will appear here."}</small></article>${activePerks.length ? `<div class="active-perks"><h3>Active Perks</h3>${activePerks.map((perk) => `<span>${perk.name} · ${perk.lane}</span>`).join("")}</div>` : ""}</section></div><div class="perk-grid">${perks.map((perk) => `<button class="perk-card ${perk.status === "locked" ? "locked" : ""} ${perk.status === "active" ? "active" : ""}" type="button" title="${perk.detail || ""}" ${perk.status === "available" ? `data-recognition-perk="${perk.id}"` : "disabled"}><span>${perk.lane}</span><strong>${perk.name}</strong><small>${perk.status === "locked" ? "Locked" : perk.status === "active" ? "Active" : `Cost ${perk.cost}`}</small></button>`).join("")}</div>`;
}

async function loadRecognition() {
  const target = $("#recognition-hub");
  if (!target) return;
  try {
    renderRecognition(await api("/recognition"));
  } catch (error) {
    target.innerHTML = `<p class="muted">Recognition is not available yet: ${error.message}</p>`;
  }
}

async function activateRecognitionPerk(perkId) {
  const action = $("#recognition-action");
  if (action) action.textContent = "Activating perk...";
  try {
    renderRecognition(await apiMutation("/recognition/perks", "POST", { perkId }));
  } catch (error) {
    if (action) action.textContent = error.message;
  }
}

function renderDashboard(league) {
  $("#season-label").textContent = `${league.gameType} · ${league.season} SEASON`;
  $("#week-number").textContent = `WEEK ${league.week}`;
  $("#advance-at").textContent = league.advanceAt || "Advance time not set";
  const game = league.featuredGame;
  const featured = $("#featured-game");
  featured.classList.remove("skeleton");
  if (game?.awayTeam && game?.homeTeam) {
    featured.style.setProperty("--away-color", game.awayTeam.color);
    featured.style.setProperty("--home-color", game.homeTeam.color);
    featured.innerHTML = `${gameTeam(game.awayTeam)}<div class="versus"><p>${game.scheduledAt || "Time TBD"}</p><strong>VS</strong><span>Featured matchup</span></div>${gameTeam(game.homeTeam)}`;
  } else {
    featured.innerHTML = `<p class="empty">Featured matchup will appear after schedule data imports.</p>`;
  }
  const finals = league.recentFinals || [];
  $("#recent-finals").innerHTML = finals.length ? finals.map((final) => `<div class="score-row"><div class="score-teams"><div class="score-team"><span class="mini-badge" style="--team-color:${getNFLColor(final.awayTeam.abbr, final.awayTeam.color)}">${teamLogoImg(final.awayTeam.abbr, 28)}</span>${final.awayTeam.name}</div><div class="score-team"><span class="mini-badge" style="--team-color:${getNFLColor(final.homeTeam.abbr, final.homeTeam.color)}">${teamLogoImg(final.homeTeam.abbr, 28)}</span>${final.homeTeam.name}</div></div><div class="score-values"><span>${final.awayScore}</span><span>${final.homeScore}</span></div></div>`).join("") : `<p class="muted">Final scores will appear after completed games import.</p>`;
  $("#power-rankings").innerHTML = (league.powerRankings || []).map((team) => `<li><div class="rank-team"><strong>${team.name}</strong><small>${record(team)} · ${team.pointsFor - team.pointsAgainst >= 0 ? "+" : ""}${team.pointsFor - team.pointsAgainst} DIFF</small></div><span>${team.powerScore}</span></li>`).join("");
  $("#playoff-picture").innerHTML = Object.entries(league.playoffRace || {}).map(([conference, race]) => `<div class="conference"><h3>${conference}</h3>${seedRows(race.playoff)}<p class="hunt-label">IN THE HUNT</p>${seedRows(race.inTheHunt)}</div>`).join("");
  loadDashboardMatchups();
  loadRecognition();
  renderWorkspace(league.workspace);
}

async function loadDashboardMatchups() {
  const target = $("#dashboard-matchups");
  if (!target) return;
  try {
    const games = matchupCache.length ? matchupCache : await api("/games");
    matchupCache = games;
    const openGames = games.filter((game) => game.status !== "played").slice(0, 3);
    target.innerHTML = openGames.length ? openGames.map((game) => matchupLine(game, true)).join("") : `<p class="muted">No upcoming matchups are waiting on the board.</p>`;
  } catch (error) {
    target.innerHTML = `<p class="muted">Matchup board could not load: ${error.message}</p>`;
  }
}

async function loadMatchups(filter = matchupFilter) {
  matchupFilter = filter;
  document.querySelectorAll("[data-matchup-filter]").forEach((button) => button.classList.toggle("active", button.dataset.matchupFilter === matchupFilter));
  if (!matchupCache.length) matchupCache = await api("/games");
  const games = matchupFilter === "all" ? matchupCache : matchupCache.filter((game) => game.status === matchupFilter);
  $("#matchup-grid").innerHTML = games.length ? games.map((game) => matchupLine(game)).join("") : `<p class="empty">No ${matchupFilter === "all" ? "" : gameStatusLabel({ status: matchupFilter }).toLowerCase()} matchups found.</p>`;
}

async function loadStandings() {
  const [standings, statLeaders] = await Promise.all([api("/standings"), api("/stat-leaders")]);
  $("#stat-leaders-grid").innerHTML = statLeaders.length ? statLeaders.map((category) => `<article class="stat-leader-card"><div class="stat-leader-title"><span>${category.title}</span><strong>${category.metric}</strong></div>${category.leaders.map((leader, index) => `<div class="stat-leader-row"><span class="seed">${index + 1}</span><div><strong>${leader.name}</strong><small>${leader.team || "FA"}${leader.secondaryValue !== null && leader.secondaryValue !== undefined ? ` · ${leader.secondaryValue} ${leader.secondaryMetric}` : ""}</small></div><b>${formatStat(leader.value)}</b></div>`).join("")}</article>`).join("") : `<p class="empty">Stat leaders will appear after weekly Snallabot stat exports arrive.</p>`;
  $("#standings-grid").innerHTML = Object.entries(standings).map(([division, teams]) => `<article class="division-card"><h3>${division}</h3><div class="standing-row header"><span>Team</span><span>Record</span><span>PF</span><span>Diff</span></div>${teams.map((team) => `<button class="standing-row standing-team" data-team-profile="${team.id}"><strong>${team.name}</strong><span>${record(team)}</span><span>${team.pointsFor}</span><span>${team.pointsFor - team.pointsAgainst > 0 ? "+" : ""}${team.pointsFor - team.pointsAgainst}</span></button>`).join("")}</article>`).join("");
}

async function loadPlayers(query = "") {
  const players = await api(`/players?q=${encodeURIComponent(query)}`);
  $("#player-results").innerHTML = players.length ? players.map((player) => {
    const attributes = player.attributes || {};
    const injuryWeeks = Number(attributes.injuryLength || 0);
    const unavailable = injuryWeeks > 0 || attributes.isOnIr === true;
    return `<article class="player-card" data-position="${player.position}"><div class="player-top"><div><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml(player.team?.name || "Free Agent")}</p></div><div class="ovr">${player.overall ?? "--"}<small>OVR</small></div></div><div class="player-meta"><span>${escapeHtml(player.position || "POS")}</span><span>${escapeHtml(player.devTrait || "Normal")}</span><span>AGE ${player.age ?? "--"}</span>${unavailable ? `<span class="availability-alert">${attributes.isOnIr ? "IR" : `${injuryWeeks}W OUT`}</span>` : ""}</div><div class="player-stat"><span>${player.statLabel || "Overall"}</span><strong>${Number(player.statValue || player.overall || 0).toLocaleString()}</strong></div></article>`;
  }).join("") : `<p class="empty">No players match “${query}”.</p>`;
}

const rosterLanes = {
  Offense: new Set(["QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT"]),
  Defense: new Set(["LE", "RE", "DT", "LOLB", "MLB", "ROLB", "CB", "FS", "SS"]),
  "Special Teams": new Set(["K", "P"])
};

function rosterLane(position) {
  return Object.entries(rosterLanes).find(([, positions]) => positions.has(position))?.[0] || "Other";
}

function rosterGroups(roster) {
  const groups = new Map();
  for (const player of roster) {
    const lane = rosterLane(player.position);
    groups.set(lane, [...(groups.get(lane) || []), player]);
  }
  return ["Offense", "Defense", "Special Teams", "Other"].filter((lane) => groups.has(lane)).map((lane, index) => {
    const players = groups.get(lane);
    return `<details class="roster-group" ${index < 2 ? "open" : ""}><summary><strong>${lane}</strong><span>${players.length} players</span></summary><div>${players.map((player) => {
      const attributes = player.attributes || {};
      const injuryWeeks = Number(attributes.injuryLength || 0);
      const contractYears = Number(attributes.contractYears);
      const unavailable = injuryWeeks > 0 || attributes.isOnIr === true;
      const contract = Number.isFinite(contractYears) && contractYears > 0 ? `${contractYears}Y` : "";
      return `<div class="roster-line"><span>${escapeHtml(player.position)}</span><strong>${escapeHtml(player.name)}${unavailable ? `<small class="availability-alert">${attributes.isOnIr ? "IR" : `${injuryWeeks}W OUT`}</small>` : ""}</strong><em>${contract}</em><b>${player.overall ?? "--"}</b></div>`;
    }).join("")}</div></details>`;
  }).join("");
}

async function loadTeam(nextTeamId = selectedTeamId) {
  if (!teamCache.length) teamCache = await api("/teams");
  const teamId = nextTeamId || workspace?.team?.id || teamCache[0]?.id || "buf";
  selectedTeamId = teamId;
  const picker = $("#team-picker");
  picker.innerHTML = teamCache.map((team) => `<option value="${team.id}" ${team.id === teamId ? "selected" : ""}>${team.abbr} · ${team.name}</option>`).join("");
  const team = await api(`/teams/${teamId}`);
  if (!team) {
    $("#team-command").innerHTML = `<p class="empty">Team profile is unavailable.</p>`;
    return;
  }
  const opponentGame = team.schedule.find((game) => game.status !== "played");
  const opponent = opponentGame && (opponentGame.homeTeamId === team.id ? opponentGame.awayTeam : opponentGame.homeTeam);
  const pointDiff = team.pointsFor - team.pointsAgainst;
  const roster = team.roster.slice().sort((a, b) => (b.overall || 0) - (a.overall || 0));
  const ratedRoster = roster.filter((player) => Number.isFinite(Number(player.overall))).slice(0, 22);
  const calculatedOverall = ratedRoster.length ? Math.round(ratedRoster.reduce((total, player) => total + Number(player.overall), 0) / ratedRoster.length) : null;
  const unavailableCount = roster.filter((player) => Number(player.attributes?.injuryLength || 0) > 0 || player.attributes?.isOnIr === true).length;
  const expiringCount = roster.filter((player) => Number(player.attributes?.contractYears) === 1).length;
  const recordLine = `${record(team)} · ${team.conference} ${team.division}`;
  const command = $("#team-command");
  command.classList.remove("skeleton");
  command.innerHTML = `<section class="team-identity" style="--team-color:${getNFLColor(team.abbr, team.color)}"><div class="team-monogram">${teamLogoImg(team.abbr, 64)}</div><div><p>${recordLine}</p><h2>${team.name}</h2><span>${team.owner || "Open team"}</span></div><div class="team-overall"><strong>${team.overall ?? calculatedOverall ?? "--"}</strong><small>TOP 22 OVR</small></div></section><div class="team-stat-grid"><article><span>Points For</span><strong>${team.pointsFor}</strong></article><article><span>Points Against</span><strong>${team.pointsAgainst}</strong></article><article><span>Point Diff</span><strong>${pointDiff > 0 ? "+" : ""}${pointDiff}</strong></article><article><span>Roster Size</span><strong>${team.roster.length}</strong></article><article><span>Unavailable</span><strong>${unavailableCount}</strong></article><article><span>Contract Year</span><strong>${expiringCount}</strong></article></div><div class="team-columns"><section class="panel"><div class="panel-heading"><div><span>Next assignment</span><h2>${opponent ? `${opponentGame.homeTeamId === team.id ? "vs." : "at"} ${opponent.name}` : "Schedule clear"}</h2></div></div><p class="team-detail">${opponentGame?.scheduledAt || "A game time still needs to be confirmed."}</p><div class="team-schedule">${team.schedule.length ? team.schedule.map((game) => {
    const isHome = game.homeTeamId === team.id;
    const opponentTeam = isHome ? game.awayTeam : game.homeTeam;
    const score = game.status === "played" ? `${game.awayScore ?? "-"}-${game.homeScore ?? "-"}` : game.scheduledAt || "Not scheduled";
    return `<div class="schedule-line"><span>W${game.week || "--"}</span><strong>${isHome ? "vs." : "at"} ${opponentTeam?.name || "TBD"}</strong><b>${score}</b></div>`;
  }).join("") : `<p class="muted">Schedule arrives with the league export.</p>`}</div><button class="primary-button" type="button" ${opponentGame ? `data-open-team-thread="${escapeHtml(opponentGame.id || opponentGame.externalId)}"` : "disabled"}>${opponentGame ? "Open Game Thread" : "No Open Matchup"}</button></section><section class="panel"><div class="panel-heading"><div><span>Roster room</span><h2>Full Imported Roster</h2></div><span class="muted">${roster.length} players · sorted by OVR</span></div>${roster.length ? rosterGroups(roster) : `<p class="muted">Full roster arrives with the EA importer.</p>`}<div class="draft-picks">${(team.draftPicks || []).map((pick) => `<span>${pick}</span>`).join("")}</div></section></div>`;
}

$("#team-picker").addEventListener("change", (event) => loadTeam(event.target.value));
$("#thread-close").addEventListener("click", () => $("#game-thread-preview").classList.add("hidden"));

function renderTrades(filter = "all") {
  const visible = tradeCache.filter((trade) => filter === "all" || (filter === "committee" ? trade.status === "committee_review" : filter === "completed" ? trade.status === "approved" : trade.status === filter));
  $("#trade-list").innerHTML = visible.map((trade) => {
    const check = trade.valueCheck || {};
    const teamA = trade.teamA || { name: "Team A" };
    const teamB = trade.teamB || { name: "Team B" };
    const submitted = new Date(trade.submittedAt);
    const actions = trade.status === "negotiating"
      ? `<div class="trade-actions"><button data-trade-id="${trade.id}" data-trade-decision="approve">Other Coach Approves</button><button class="danger-button" data-trade-id="${trade.id}" data-trade-decision="deny">Deny</button></div>`
      : trade.status === "committee_review"
        ? `<div class="trade-actions"><button data-trade-id="${trade.id}" data-trade-decision="committee_approve">Committee Approves</button><button class="danger-button" data-trade-id="${trade.id}" data-trade-decision="committee_deny">Committee Denies</button></div>`
        : "";
    return `<article class="trade-card"><div class="trade-card-head"><span class="trade-status ${trade.status}">${trade.status.replaceAll("_", " ")}</span><small>${Number.isNaN(submitted.valueOf()) ? "Date pending" : submitted.toLocaleDateString()}</small></div><div class="trade-id">Trade ID ${trade.id}</div><div class="trade-sides"><div><strong>${teamA.name}</strong>${trade.teamAAssets.map((asset) => `<span>${asset.label || asset} <b>${asset.value || 0}</b></span>`).join("")}<em>Total ${check.teamATotal || 0}</em></div><div class="trade-swap">⇄</div><div><strong>${teamB.name}</strong>${trade.teamBAssets.map((asset) => `<span>${asset.label || asset} <b>${asset.value || 0}</b></span>`).join("")}<em>Total ${check.teamBTotal || 0}</em></div></div><div class="trade-value-check ${check.withinLimit ? "approved" : "denied"}"><span>Value gap ${check.gap ?? "--"} / limit ${check.limit || 50}</span><strong>${check.withinLimit ? "Within Limit" : "Committee Flag"}</strong></div><div class="vote-progress"><span>Committee votes</span><strong>${trade.votesFor}/${trade.votesNeeded}</strong></div>${actions}</article>`;
  }).join("") || `<p class="empty">No trades in this stage.</p>`;
}

function renderTradeOperations() {
  const counts = {
    all: tradeCache.length,
    negotiating: tradeCache.filter((trade) => trade.status === "negotiating").length,
    committee: tradeCache.filter((trade) => trade.status === "committee_review").length,
    approved: tradeCache.filter((trade) => trade.status === "approved").length,
    denied: tradeCache.filter((trade) => trade.status === "denied").length
  };
  $("#trade-summary").innerHTML = [
    ["All", counts.all],
    ["Negotiating", counts.negotiating],
    ["Committee", counts.committee],
    ["Approved", counts.approved],
    ["Denied", counts.denied]
  ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");
  const attention = tradeCache.find((trade) => trade.status === "committee_review") || tradeCache.find((trade) => trade.status === "negotiating");
  if (!attention) {
    $("#trade-attention").innerHTML = `<p class="muted">No trades need action right now. The approval lane is clear.</p>`;
    return;
  }
  const check = attention.valueCheck || {};
  const teamA = attention.teamA?.name || "Team A";
  const teamB = attention.teamB?.name || "Team B";
  const nextAction = attention.status === "committee_review" ? "Committee vote required" : "Waiting on other coach";
  $("#trade-attention").innerHTML = `<article class="trade-attention-card"><div><span class="trade-status ${attention.status}">${attention.status.replaceAll("_", " ")}</span><h3>${teamA} ↔ ${teamB}</h3><p>${nextAction} · value gap ${check.gap ?? "--"}${check.withinLimit === false ? " · committee flag" : ""}</p></div><button class="text-button" type="button" data-trade-filter-target="${attention.status === "committee_review" ? "committee" : "negotiating"}">View Lane</button></article>`;
}

async function loadTrades(force = false) {
  if (force) {
    $("#trade-list").innerHTML = `<p class="empty">Refreshing trade board...</p>`;
    tradeCache = [];
  }
  try {
    if (!tradeCache.length) tradeCache = await api("/trades");
  } catch (error) {
    $("#trade-list").innerHTML = `<p class="empty">Trade board could not load: ${error.message}</p>`;
    return;
  }
  try {
    if (!tradeAssets.length) tradeAssets = await api("/trade-assets");
    renderTradeBuilder();
  } catch (error) {
    tradeAssets = [];
    $("#trade-builder-state").textContent = "Trade asset board is unavailable. Saved trades can still be reviewed.";
    $("#trade-preview").innerHTML = `<p class="empty">Restart or redeploy the API to enable the guided trade builder.</p>`;
  }
  renderTradeOperations();
  renderTrades(tradeFilter);
}

function selectedAssets(selector) {
  return [...$(selector).selectedOptions].map((option) => ({ label: option.textContent.replace(/\s+·\s+\d+$/, ""), value: Number(option.value || 0), type: option.dataset.assetType || "asset" }));
}

function renderAssetOptions(select, teamId, side) {
  const board = tradeAssets.find((entry) => entry.teamId === teamId);
  select.innerHTML = (board?.assets || []).map((asset) => `<option value="${asset.value}" data-asset-type="${asset.type}" data-position="${asset.position || ""}">${escapeHtml(asset.label)} · ${asset.value}</option>`).join("");
  filterTradeAssets(side);
  updateTradeSelection(side);
}

function filterTradeAssets(side) {
  const query = $(`#trade-search-${side}`).value.trim().toLowerCase();
  const filter = $(`#trade-filter-${side}`).value;
  const options = [...$(`#trade-assets-${side}`).options];
  for (const option of options) {
    const type = option.dataset.assetType;
    const position = option.dataset.position;
    const lane = rosterLane(position);
    const matchesFilter = filter === "all"
      || (filter === "players" && type === "player")
      || (filter === "picks" && type === "pick")
      || (type === "player" && lane === filter);
    option.hidden = !matchesFilter || !option.textContent.toLowerCase().includes(query);
  }
}

function updateTradeSelection(side) {
  const count = $(`#trade-assets-${side}`).selectedOptions.length;
  $(`#trade-selection-${side}`).textContent = `${count} selected`;
}

function updateTradePreview() {
  updateTradeSelection("a");
  updateTradeSelection("b");
  const send = selectedAssets("#trade-assets-a");
  const receive = selectedAssets("#trade-assets-b");
  const sendTotal = send.reduce((total, asset) => total + asset.value, 0);
  const receiveTotal = receive.reduce((total, asset) => total + asset.value, 0);
  const gap = Math.abs(sendTotal - receiveTotal);
  const withinLimit = gap <= 50;
  $("#trade-builder-state").textContent = withinLimit ? "Value check is within limit" : "Value gap needs committee review";
  $("#trade-preview").innerHTML = `<div class="trade-preview-card ${withinLimit ? "approved" : "denied"}"><div><span>You send</span><strong>${sendTotal}</strong><small>${send.map((asset) => asset.label).join(", ") || "No assets selected"}</small></div><div><span>You receive</span><strong>${receiveTotal}</strong><small>${receive.map((asset) => asset.label).join(", ") || "No assets selected"}</small></div><p>Value gap ${gap} ${withinLimit ? "is within the 50 point limit." : "exceeds the 50 point limit."}</p><button class="primary-button" type="button" data-trade-submit>Draft Trade Proposal</button></div>`;
}

async function submitTradeProposal() {
  const state = $("#trade-builder-state");
  const body = {
    teamA: $("#trade-team-a").value,
    teamB: $("#trade-team-b").value,
    teamAAssets: selectedAssets("#trade-assets-a"),
    teamBAssets: selectedAssets("#trade-assets-b")
  };
  state.textContent = "Drafting trade proposal...";
  try {
    const trade = await apiMutation("/trades", "POST", body);
    tradeCache = [trade, ...tradeCache.filter((entry) => entry.id !== trade.id)];
    renderTradeOperations();
    renderTrades(tradeFilter);
    state.textContent = "Trade proposal drafted and waiting on the other coach.";
  } catch (error) {
    state.textContent = error.message;
  }
}

async function updateTradeDecision(tradeId, action) {
  const result = await apiMutation(`/trades/${tradeId}`, "PATCH", { action });
  tradeCache = tradeCache.map((trade) => trade.id === tradeId ? result : trade);
  renderTradeOperations();
  renderTrades(tradeFilter);
}

function renderTradeBuilder() {
  const teamOptions = tradeAssets.map((entry) => `<option value="${entry.teamId}">${entry.teamAbbr || "--"} · ${entry.teamName} (${entry.rosterCount} players)</option>`).join("");
  $("#trade-team-a").innerHTML = teamOptions;
  $("#trade-team-b").innerHTML = teamOptions;
  const preferredTeamId = workspace?.team?.id;
  if (preferredTeamId && tradeAssets.some((entry) => entry.teamId === preferredTeamId)) $("#trade-team-a").value = preferredTeamId;
  if (!$("#trade-team-b").value || $("#trade-team-b").value === $("#trade-team-a").value) $("#trade-team-b").selectedIndex = Math.min(1, tradeAssets.length - 1);
  renderAssetOptions($("#trade-assets-a"), $("#trade-team-a").value, "a");
  renderAssetOptions($("#trade-assets-b"), $("#trade-team-b").value, "b");
  updateTradePreview();
}

["#trade-team-a", "#trade-team-b"].forEach((selector) => $(selector).addEventListener("change", () => {
  const side = selector === "#trade-team-a" ? "a" : "b";
  $(`#trade-search-${side}`).value = "";
  $(`#trade-filter-${side}`).value = "all";
  renderAssetOptions($(`#trade-assets-${side}`), $(selector).value, side);
  updateTradePreview();
}));
["#trade-assets-a", "#trade-assets-b"].forEach((selector) => $(selector).addEventListener("change", updateTradePreview));
["a", "b"].forEach((side) => {
  $(`#trade-search-${side}`).addEventListener("input", () => filterTradeAssets(side));
  $(`#trade-filter-${side}`).addEventListener("change", () => filterTradeAssets(side));
});

document.querySelectorAll(".status-tabs button").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.matchupFilter) {
    loadMatchups(button.dataset.matchupFilter);
    return;
  }
  if (button.dataset.tradeFilter) {
    tradeFilter = button.dataset.tradeFilter;
    button.closest(".status-tabs").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    renderTrades(tradeFilter);
    return;
  }
  button.closest(".status-tabs").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  const filters = { "All Activity": "all", Negotiating: "negotiating", Committee: "committee", Completed: "completed" };
  renderTrades(filters[button.textContent]);
}));

document.addEventListener("click", (event) => {
  const lane = event.target.closest("[data-trade-filter-target]");
  if (!lane) return;
  const filter = lane.dataset.tradeFilterTarget;
  const button = document.querySelector(`[data-trade-filter="${filter}"]`);
  if (button) button.click();
});

async function loadMedia() {
  const draftTarget = $("#media-drafts");
  const postTarget = $("#media-grid");
  try {
    const drafts = await api("/media-drafts");
    mediaDraftCache = drafts;
    draftTarget.innerHTML = drafts.length ? drafts.map((draft) => {
      const visual = draft.visualBrief ? `<div class="media-visual-brief"><strong>Visual brief</strong><p>${escapeHtml(draft.visualBrief)}</p></div>` : "";
      const notes = draft.notes?.length ? `<ul class="media-draft-notes">${draft.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "";
      const stageAction = currentRole === "commissioner" ? `<button type="button" data-media-stage="${escapeHtml(draft.id)}">Stage for Review</button>` : "";
      return `<article class="media-draft"><div class="media-draft-heading"><span>${escapeHtml(draft.type)}</span><strong>${escapeHtml(draft.channel)}</strong></div><h2>${escapeHtml(draft.title)}</h2>${visual}${notes}<pre>${escapeHtml(draft.body)}</pre><div class="media-draft-actions"><button class="text-button" type="button" data-media-copy="${escapeHtml(draft.id)}">Copy Package</button>${stageAction}</div></article>`;
    }).join("") : `<p class="muted">Announcement drafts will appear after league data syncs.</p>`;
  } catch (error) {
    mediaDraftCache = [];
    draftTarget.innerHTML = `<p class="muted">Announcement cards are waiting on the latest API deploy.</p>`;
  }
  try {
    const posts = await api("/media");
    mediaPostCache = posts;
    postTarget.innerHTML = posts.length ? posts.map(renderMediaPost).join("") : `<p class="empty">Published media posts will appear here after the first story is drafted.</p>`;
  } catch (error) {
    mediaPostCache = [];
    postTarget.innerHTML = `<p class="empty">Media posts could not load: ${error.message}</p>`;
  }
}

function renderMediaPost(post) {
  const actions = currentRole === "commissioner" ? mediaPostActions(post) : "";
  const visual = post.visualBrief ? `<div class="media-visual-brief"><strong>Visual brief</strong><p>${escapeHtml(post.visualBrief)}</p></div>` : "";
  const byline = [post.channel, post.createdBy ? `queued by ${post.createdBy}` : null].filter(Boolean).join(" • ");
  return `<article class="media-card"><div class="media-type">${escapeHtml(post.type || "Media")} ${byline ? `<span>${escapeHtml(byline)}</span>` : ""}</div><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.summary || "Ready for commissioner review.")}</p>${visual}<div class="media-footer"><span class="content-status ${escapeHtml(post.status || "draft")}">${escapeHtml(post.status || "draft")}</span>${actions}</div></article>`;
}

function mediaPostActions(post) {
  const id = escapeHtml(post.id);
  if (post.status === "pending_review") return `<div class="media-card-actions"><button type="button" data-media-id="${id}" data-media-action="approve">Approve</button><button class="text-button" type="button" data-media-id="${id}" data-media-action="needs_work">Needs Work</button></div>`;
  if (post.status === "approved") return `<div class="media-card-actions"><button type="button" data-media-id="${id}" data-media-action="publish">Mark Published</button><button class="text-button" type="button" data-media-id="${id}" data-media-action="reject">Reject</button></div>`;
  if (post.status === "draft") return `<div class="media-card-actions"><button type="button" data-media-id="${id}" data-media-action="approve">Approve</button><button class="text-button" type="button" data-media-post-copy="${id}">Copy Source</button></div>`;
  return `<button class="text-button" type="button" data-media-post-copy="${id}">Copy Source</button>`;
}

async function stageMediaDraft(draftId) {
  const button = document.querySelector(`[data-media-stage="${draftId}"]`);
  if (button) button.textContent = "Staging...";
  try {
    await apiMutation(`/media?role=${currentRole}`, "POST", { draftId });
    await loadMedia();
  } catch (error) {
    if (button) button.textContent = error.message;
  }
}

async function updateMediaPost(mediaId, action) {
  const post = mediaPostCache.find((item) => item.id === mediaId);
  const button = document.querySelector(`[data-media-id="${mediaId}"][data-media-action="${action}"]`);
  if (button) button.textContent = "Saving...";
  try {
    await apiMutation(`/media/${encodeURIComponent(mediaId)}?role=${currentRole}`, "PATCH", { action });
    await loadMedia();
  } catch (error) {
    if (button) button.textContent = error.message;
    if (post) post.status = post.status || "draft";
  }
}

async function copyMediaDraft(draftId) {
  const draft = mediaDraftCache.find((item) => item.id === draftId);
  if (!draft) return;
  const button = document.querySelector(`[data-media-copy="${draftId}"]`);
  const packageText = [
    draft.visualBrief ? `VISUAL BRIEF\n${draft.visualBrief}` : "",
    draft.notes?.length ? `NOTES\n${draft.notes.map((note) => `- ${note}`).join("\n")}` : "",
    `COPY\n${draft.body}`
  ].filter(Boolean).join("\n\n");
  const copied = await copyText(packageText);
  if (button) button.textContent = copied ? "Copied" : "Copy failed";
}

async function copyMediaPost(mediaId) {
  const post = mediaPostCache.find((item) => item.id === mediaId);
  if (!post) return;
  const button = document.querySelector(`[data-media-post-copy="${mediaId}"]`);
  const packageText = [
    post.visualBrief ? `VISUAL BRIEF\n${post.visualBrief}` : "",
    `COPY\n${post.body || [post.title, post.summary].filter(Boolean).join("\n")}`
  ].filter(Boolean).join("\n\n");
  const copied = await copyText(packageText);
  if (button) button.textContent = copied ? "Copied" : "Copy failed";
}

async function loadOffice() {
  const results = await Promise.allSettled([
    currentRole === "commissioner" ? workspace : api("/workspace?role=commissioner"),
    api("/members"),
    api("/teams"),
    api("/import-runs"),
    api("/receiver-attempts"),
    api("/strike-board"),
    api("/data-coverage")
  ]);
  const valueAt = (index, fallback) => results[index].status === "fulfilled" && results[index].value !== undefined ? results[index].value : fallback;
  const [office, members, teams, imports, receiverAttempts, strikeBoard, dataCoverage] = [
    valueAt(0, null), valueAt(1, []), valueAt(2, []), valueAt(3, []), valueAt(4, []), valueAt(5, null), valueAt(6, null)
  ];

  $("#office-actions").innerHTML = office ? actionRows(office.actions || []) : `<p class="empty">League Office actions could not load.</p>`;
  if (office) renderSync($("#office-sync"), office.syncHealth);
  else $("#office-sync").innerHTML = `<p class="empty">Sync health could not load.</p>`;
  if (strikeBoard) renderStrikeBoard(strikeBoard);
  else $("#strike-board").innerHTML = `<p class="empty">Strike board could not load.</p>`;
  $("#data-coverage").innerHTML = dataCoverage
    ? `<div class="coverage-summary"><article><span>Teams With Rosters</span><strong>${dataCoverage.totals.populatedTeams}/${dataCoverage.totals.teams}</strong></article><article><span>Imported Players</span><strong>${dataCoverage.totals.players}</strong></article><article><span>Recorded Finals</span><strong>${dataCoverage.totals.finals}</strong></article></div><div class="coverage-fields">${dataCoverage.fields.map((field) => `<article><div><strong>${escapeHtml(field.label)}</strong><span>${field.count}/${dataCoverage.totals.players} players</span></div><b>${field.percentage}%</b><i style="--coverage:${field.percentage}%"></i></article>`).join("")}</div><div class="coverage-readiness">${Object.entries(dataCoverage.readiness).map(([key, ready]) => `<span class="${ready ? "ready" : "waiting"}">${ready ? "Ready" : "Waiting"} · ${escapeHtml(key.replaceAll(/([A-Z])/g, " $1"))}</span>`).join("")}</div>`
    : `<p class="empty">Data coverage could not load.</p>`;

  $("#receiver-attempts").innerHTML = results[4].status === "rejected"
    ? `<p class="empty">Recent receiver calls could not load.</p>`
    : receiverAttempts.length ? `<h3 class="receiver-heading">Latest Snallabot Receiver Calls</h3>${receiverAttempts.map((attempt) => `<article class="import-run receiver-attempt"><div class="import-run-head"><strong>${escapeHtml(attempt.status)}</strong><span class="trade-status ${attempt.status === "accepted" ? "approved" : "denied"}">${escapeHtml(attempt.statusCode)}</span></div><small>${new Date(attempt.receivedAt).toLocaleString()}</small><p class="muted">${escapeHtml(attempt.source || "snallabot-receiver")}</p><p class="muted">${escapeHtml(attempt.message)}</p><details><summary>Payload preview</summary><code>${escapeHtml(JSON.stringify(attempt.preview))}</code></details></article>`).join("")}` : "";
  $("#import-history").innerHTML = results[3].status === "rejected"
    ? `<p class="empty">Recent exports could not load. Refresh the page or check the database connection.</p>`
    : imports.length ? imports.map((run) => `<article class="import-run"><div class="import-run-head"><strong>${escapeHtml(run.source)}</strong><span class="trade-status ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></div><small>${run.completedAt ? new Date(run.completedAt).toLocaleString() : "Not completed"}</small><div class="import-datasets">${(run.datasets || []).map((dataset) => `<span>${escapeHtml(dataset.name)}: ${escapeHtml(dataset.records)}</span>`).join("")}</div><details><summary>Raw fingerprints</summary>${(run.rawExports || []).map((raw) => `<code>${escapeHtml(raw.dataset)} · ${escapeHtml(raw.sha256?.slice(0, 12))} · ${escapeHtml(raw.storageKey)}</code>`).join("") || "<p>No raw exports recorded.</p>"}</details></article>`).join("") : `<p class="empty">No imports have run yet.</p>`;

  $("#open-teams").innerHTML = office
    ? (office.openTeams || []).map((team) => `<article><span class="mini-badge" style="--team-color:${getNFLColor(team.abbr, team.color)}">${teamLogoImg(team.abbr, 28)}</span><div><strong>${escapeHtml(team.name)}</strong><small>${record(team)} · ${escapeHtml(team.conference)} ${escapeHtml(team.division)}</small></div><button>Review applicants</button></article>`).join("") || `<p class="muted">All imported teams currently have an assigned coach.</p>`
    : `<p class="empty">Open teams could not load.</p>`;
  $("#member-table").innerHTML = results[1].status === "rejected"
    ? `<p class="empty">Coach assignments could not load.</p>`
    : `<div class="member-row member-header"><span>Coach</span><span>Team</span><span>Role</span><span>Status</span><span></span></div>${results[2].status === "rejected" ? `<p class="empty">Imported teams could not load. Team assignment menus are temporarily unavailable.</p>` : ""}${members.map((member) => `<div class="member-row" data-member-id="${member.id}"><strong>${escapeHtml(member.displayName)}</strong><select data-field="teamId" ${results[2].status === "rejected" ? "disabled" : ""}><option value="">Unassigned</option>${teams.map((team) => `<option value="${team.id}" ${member.teamId === team.id ? "selected" : ""}>${escapeHtml(team.abbr)}</option>`).join("")}</select><select data-field="role"><option value="coach" ${member.role === "coach" ? "selected" : ""}>Coach</option><option value="commissioner" ${member.role === "commissioner" ? "selected" : ""}>Commissioner</option></select><select data-field="status"><option value="active" ${member.status === "active" ? "selected" : ""}>Active</option><option value="pending" ${member.status === "pending" ? "selected" : ""}>Pending</option><option value="suspended" ${member.status === "suspended" ? "selected" : ""}>Suspended</option><option value="removed" ${member.status === "removed" ? "selected" : ""}>Removed</option></select><button class="member-save">Save</button></div>`).join("")}`;
}

function strikeCaseRows(cases, emptyText) {
  return cases.length ? cases.map((entry) => `<article class="strike-case"><div><strong>${entry.coach || entry.teamId}</strong><small>${entry.reason || "Active case"}</small></div><b>${Number(entry.points || 0).toFixed(1)}</b><p>${(entry.flags || []).join(" · ") || "No flags"}</p></article>`).join("") : `<p class="muted">${emptyText}</p>`;
}

function renderStrikeBoard(board) {
  $("#strike-board-status").textContent = `Week ${board.week || "--"} · hard limit ${board.rules?.hardLimit || 5}`;
  $("#strike-board").innerHTML = `<div class="strike-summary"><article><span>At Risk</span><strong>${board.atRisk?.length || 0}</strong></article><article><span>Active Cases</span><strong>${board.activeCases?.length || 0}</strong></article><article><span>Clean Teams</span><strong>${board.cleanTeams?.length || 0}</strong></article></div><div class="strike-columns"><section><h3>At Risk / Removal Range</h3>${strikeCaseRows(board.atRisk || [], "No teams are currently at 3.0 or higher.")}</section><section><h3>Active Strike Cases</h3>${strikeCaseRows(board.activeCases || [], "No active strike cases below watch range.")}</section></div><div class="communication-flags"><h3>Communication Flags</h3>${(board.communicationFlags || []).length ? board.communicationFlags.map((flag) => `<span>${flag.label}: ${flag.detail}</span>`).join("") : `<p class="muted">No separate communication flags right now.</p>`}</div>`;
}

$("#member-table").addEventListener("click", async (event) => {
  const button = event.target.closest(".member-save");
  if (!button) return;
  const row = button.closest("[data-member-id]");
  const values = Object.fromEntries([...row.querySelectorAll("[data-field]")].map((field) => [field.dataset.field, field.value || null]));
  const state = $("#member-save-state");
  button.disabled = true;
  state.textContent = "Saving...";
  try {
    await apiMutation(`/members/${row.dataset.memberId}`, "PATCH", values);
    state.textContent = "Member updated and audited";
  } catch (error) {
    state.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  loadImportText(await file.text(), file.name);
});

function parseCsv(text) {
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
  for (const name of names) if (row[name] !== undefined && row[name] !== "") return row[name];
}

function countRows(payload, key) {
  if (Array.isArray(payload)) return payload.length;
  return Array.isArray(payload?.[key]) ? payload[key].length : 0;
}

function countRosterRows(rosters) {
  const entries = Array.isArray(rosters) ? rosters : Object.values(rosters || {});
  return entries.reduce((total, roster) => total + (Array.isArray(roster?.rosterInfoList) ? roster.rosterInfoList.length : Array.isArray(roster) ? roster.length : 0), 0);
}

function importPreview(payload) {
  if (payload.schemaVersion === "leagueos-import/v1") {
    return `Ready: ${payload.teams?.length || 0} teams, ${payload.players?.length || 0} players, ${payload.standings?.length || 0} standings, ${payload.games?.length || 0} games.`;
  }
  if (payload.schemaVersion === "snallabot-export/v1") {
    return `Ready: ${countRows(payload.teamsExport || payload.teams, "leagueTeamInfoList")} teams, ${countRosterRows(payload.rosterExports || payload.rosters || payload.players)} players, ${countRows(payload.standingsExport || payload.standings, "teamStandingInfoList")} standings, ${countRows(payload.schedulesExport || payload.scheduleExport || payload.schedule || payload.games, "gameScheduleInfoList")} games.`;
  }
  if (Array.isArray(payload.datasets)) return `Ready: ${payload.datasets.length} raw dataset${payload.datasets.length === 1 ? "" : "s"}.`;
  return "This JSON loaded, but it does not look like a supported LeagueOS or Snallabot export.";
}

function loadImportText(text, label) {
  $("#import-json").value = text;
  $("#import-state").textContent = `Loaded ${label}`;
  if (!text.trim()) {
    $("#import-result").textContent = `${label} is empty. Choose a JSON export with data before running import.`;
    return;
  }
  try {
    $("#import-result").textContent = importPreview(JSON.parse(text));
  } catch {
    $("#import-result").textContent = `${label} is not valid JSON.`;
  }
}

function csvBundle(sources) {
  const rows = (key) => parseCsv(sources[key] || "");
  return {
    schemaVersion: "leagueos-import/v1",
    source: "browser-csv",
    season: $("#import-season").value || undefined,
    week: $("#import-week").value || undefined,
    teams: rows("teams").map((row) => ({
      externalId: firstValue(row, ["externalId", "teamId", "id", "abbr", "abbreviation"]),
      name: firstValue(row, ["name", "team", "teamName"]),
      abbreviation: firstValue(row, ["abbreviation", "abbr"]),
      conference: firstValue(row, ["conference", "conf"]),
      division: firstValue(row, ["division", "div"]),
      primaryColor: firstValue(row, ["primaryColor", "color"])
    })),
    players: rows("players").map((row) => ({
      externalId: firstValue(row, ["externalId", "playerId", "id"]),
      teamExternalId: firstValue(row, ["teamExternalId", "teamId", "team", "abbr"]),
      name: firstValue(row, ["name", "player", "playerName"]),
      position: firstValue(row, ["position", "pos"]),
      overall: firstValue(row, ["overall", "ovr"]),
      devTrait: firstValue(row, ["devTrait", "dev", "trait"]),
      age: firstValue(row, ["age"])
    })),
    standings: rows("standings").map((row) => ({
      teamExternalId: firstValue(row, ["teamExternalId", "teamId", "team", "abbr"]),
      wins: firstValue(row, ["wins", "w"]),
      losses: firstValue(row, ["losses", "l"]),
      ties: firstValue(row, ["ties", "t"]),
      pointsFor: firstValue(row, ["pointsFor", "pf"]),
      pointsAgainst: firstValue(row, ["pointsAgainst", "pa"]),
      turnoverDiff: firstValue(row, ["turnoverDiff", "tod", "diff"])
    })),
    games: rows("games").map((row) => ({
      externalId: firstValue(row, ["externalId", "gameId", "id"]),
      week: firstValue(row, ["week"]),
      homeTeamExternalId: firstValue(row, ["homeTeamExternalId", "homeTeamId", "home", "homeAbbr"]),
      awayTeamExternalId: firstValue(row, ["awayTeamExternalId", "awayTeamId", "away", "awayAbbr"]),
      status: firstValue(row, ["status"]),
      scheduledAt: firstValue(row, ["scheduledAt", "scheduled", "kickoff"]),
      homeScore: firstValue(row, ["homeScore"]),
      awayScore: firstValue(row, ["awayScore"])
    }))
  };
}

$("#csv-files").addEventListener("change", async (event) => {
  const files = [...(event.target.files || [])];
  const sources = {};
  for (const file of files) {
    const name = file.name.toLowerCase();
    const key = ["teams", "players", "standings", "games"].find((label) => name.includes(label));
    if (key) sources[key] = await file.text();
  }
  const bundle = csvBundle(sources);
  $("#import-json").value = JSON.stringify(bundle, null, 2);
  $("#import-state").textContent = `Built bundle from ${files.length} CSV file${files.length === 1 ? "" : "s"}`;
  $("#import-result").textContent = "CSV bundle is ready. Click Run Import.";
});

$("#receiver-copy").addEventListener("click", async () => {
  updateReceiverUrl();
  const url = $("#receiver-url").value;
  const copied = await copyText(url);
  $("#import-result").textContent = copied
    ? "Receiver URL copied. Paste it into Snallabot's Add Export URL field."
    : "Copy was blocked by the browser. Select the receiver URL above and copy it manually.";
});

$("#import-sample").addEventListener("click", async () => {
  const response = await fetch("/samples/snallabot-export-v1.sample.json", { cache: "no-store" });
  loadImportText(await response.text(), "built-in Snallabot sample");
});

$("#import-url-submit").addEventListener("click", async (event) => {
  event.preventDefault();
  const state = $("#import-state");
  const resultState = $("#import-result");
  const button = $("#import-url-submit");
  const exportUrl = $("#import-url").value.trim();
  if (!exportUrl) {
    resultState.textContent = "Paste a Snallabot export URL first.";
    return;
  }
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Importing...";
  state.textContent = "Importing from URL...";
  resultState.textContent = "Fetching export URL...";
  try {
    const result = await apiMutation("/import-runs/from-url", "POST", { url: exportUrl });
    const summary = `${result.status}: ${result.datasets.map((dataset) => `${dataset.name} ${dataset.records}`).join(", ")}`;
    state.textContent = `Import ${summary}`;
    resultState.textContent = `Import complete from URL. ${summary}`;
    workspace = await api(`/workspace?role=${currentRole}`);
    renderWorkspace(workspace);
    if ($("#office-view").classList.contains("active")) loadOffice();
  } catch (error) {
    state.textContent = error.message;
    resultState.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

$("#import-submit").addEventListener("click", async (event) => {
  event.preventDefault();
  const state = $("#import-state");
  const resultState = $("#import-result");
  const button = $("#import-submit");
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Importing...";
  state.textContent = "Running import...";
  resultState.textContent = "Sending export to LeagueOS...";
  try {
    const rawJson = $("#import-json").value.trim();
    if (!rawJson) throw new Error("No JSON is loaded yet. Choose a JSON file or paste the export text first.");
    let payload;
    try {
      payload = JSON.parse(rawJson);
    } catch {
      throw new Error("That file is not valid JSON. Choose a .json export file or paste JSON text.");
    }
    if (!payload.schemaVersion && !Array.isArray(payload.datasets)) throw new Error("This JSON does not look like a LeagueOS or Snallabot export.");
    resultState.textContent = importPreview(payload);
    const result = await apiMutation("/import-runs", "POST", payload);
    const summary = `${result.status}: ${result.datasets.map((dataset) => `${dataset.name} ${dataset.records}`).join(", ")}`;
    state.textContent = `Import ${summary}`;
    resultState.textContent = `Import complete. ${summary}`;
    workspace = await api(`/workspace?role=${currentRole}`);
    renderWorkspace(workspace);
    if ($("#office-view").classList.contains("active")) loadOffice();
  } catch (error) {
    state.textContent = error.message;
    resultState.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

let searchTimer;
$("#player-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPlayers(event.target.value), 180);
});

updateReceiverUrl();
loadIdentity().then(() => api(`?role=${currentRole}`)).then(renderDashboard).catch((error) => {
  $("#featured-game").classList.remove("skeleton");
  $("#featured-game").innerHTML = `<p class="empty">Sign in with Discord to open your league workspace. ${error.message}</p>`;
});
