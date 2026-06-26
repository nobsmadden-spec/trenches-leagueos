const leagueId = "the-trenches";
const $ = (selector) => document.querySelector(selector);
const record = (team = {}) => Number.isFinite(Number(team.wins)) && Number.isFinite(Number(team.losses)) ? `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}` : "--";
const formatStat = (value) => Number.isInteger(value) ? value.toLocaleString() : Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
let currentRole = "coach";
let workspace;
let tradeCache = [];
let teamCache = [];
let matchupCache = [];
let matchupFilter = "all";
let selectedTeamId = null;
document.body.dataset.role = currentRole;

function receiverUrl() {
  const current = $("#receiver-url")?.value || "";
  const tokenMatch = current.match(/\/token\/([^/?#]+)/);
  const token = tokenMatch?.[1] && tokenMatch[1] !== "YOUR_TOKEN" ? tokenMatch[1] : "YOUR_TOKEN";
  return `${window.location.origin}/api/import-receivers/snallabot/${leagueId}/token/${token}`;
}

function updateReceiverUrl() {
  const field = $("#receiver-url");
  if (field) field.value = receiverUrl();
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

function setView(name) {
  $(".hero").classList.toggle("hidden", name !== "dashboard");
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "standings") loadStandings();
  if (name === "matchups") loadMatchups();
  if (name === "players") loadPlayers();
  if (name === "team") loadTeam();
  if (name === "trades") loadTrades();
  if (name === "media") loadMedia();
  if (name === "office") loadOffice();
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewTarget)));
document.addEventListener("click", (event) => {
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
  return `<div class="match-team"><div class="team-badge" style="border-color:${team.color}">${team.abbr}</div><h3>${team.name}</h3><p>${record(team)} · ${team.conference} ${team.division}</p></div>`;
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
  return `<article class="${compact ? "matchup-mini" : "matchup-card"}" data-status="${game.status || "unknown"}"><div class="matchup-status"><span>${gameStatusLabel(game)}</span><b>${detail}</b></div><div class="matchup-teams"><button data-team-profile="${away.id}" style="--team-color:${away.color || "#64748b"}"><span>${away.abbr || "AWY"}</span><strong>${away.name || "Away Team"}</strong><small>${record(away)}</small></button><em>${isFinal ? "FINAL" : "VS"}</em><button data-team-profile="${home.id}" style="--team-color:${home.color || "#64748b"}"><span>${home.abbr || "HME"}</span><strong>${home.name || "Home Team"}</strong><small>${record(home)}</small></button></div>${compact ? "" : `<div class="matchup-actions"><button class="text-button" data-team-profile="${away.id}">Away profile</button><button class="primary-button" type="button">Game Thread Preview</button><button class="text-button" data-team-profile="${home.id}">Home profile</button></div>`}</article>`;
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
  $("#recent-finals").innerHTML = finals.length ? finals.map((final) => `<div class="score-row"><div class="score-teams"><div class="score-team"><span class="mini-badge" style="--team-color:${final.awayTeam.color}">${final.awayTeam.abbr}</span>${final.awayTeam.name}</div><div class="score-team"><span class="mini-badge" style="--team-color:${final.homeTeam.color}">${final.homeTeam.abbr}</span>${final.homeTeam.name}</div></div><div class="score-values"><span>${final.awayScore}</span><span>${final.homeScore}</span></div></div>`).join("") : `<p class="muted">Final scores will appear after completed games import.</p>`;
  $("#power-rankings").innerHTML = (league.powerRankings || []).map((team) => `<li><div class="rank-team"><strong>${team.name}</strong><small>${record(team)} · ${team.pointsFor - team.pointsAgainst >= 0 ? "+" : ""}${team.pointsFor - team.pointsAgainst} DIFF</small></div><span>${team.powerScore}</span></li>`).join("");
  $("#playoff-picture").innerHTML = Object.entries(league.playoffRace || {}).map(([conference, race]) => `<div class="conference"><h3>${conference}</h3>${seedRows(race.playoff)}<p class="hunt-label">IN THE HUNT</p>${seedRows(race.inTheHunt)}</div>`).join("");
  loadDashboardMatchups();
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
  $("#player-results").innerHTML = players.length ? players.map((player) => `<article class="player-card" data-position="${player.position}"><div class="player-top"><div><h3>${player.name}</h3><p>${player.team?.name || "Free Agent"}</p></div><div class="ovr">${player.overall ?? "--"}<small>OVR</small></div></div><div class="player-meta"><span>${player.position || "POS"}</span><span>${player.devTrait || "Normal"}</span><span>AGE ${player.age ?? "--"}</span></div><div class="player-stat"><span>${player.statLabel || "Overall"}</span><strong>${Number(player.statValue || player.overall || 0).toLocaleString()}</strong></div></article>`).join("") : `<p class="empty">No players match “${query}”.</p>`;
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
  const recordLine = `${record(team)} · ${team.conference} ${team.division}`;
  const command = $("#team-command");
  command.classList.remove("skeleton");
  command.innerHTML = `<section class="team-identity" style="--team-color:${team.color}"><div class="team-monogram">${team.abbr}</div><div><p>${recordLine}</p><h2>${team.name}</h2><span>${team.owner || "Open team"}</span></div><div class="team-overall"><strong>${team.overall ?? "--"}</strong><small>OVR</small></div></section><div class="team-stat-grid"><article><span>Points For</span><strong>${team.pointsFor}</strong></article><article><span>Points Against</span><strong>${team.pointsAgainst}</strong></article><article><span>Point Diff</span><strong>${pointDiff > 0 ? "+" : ""}${pointDiff}</strong></article><article><span>Roster Size</span><strong>${team.roster.length}</strong></article></div><div class="team-columns"><section class="panel"><div class="panel-heading"><div><span>Next assignment</span><h2>${opponent ? `${opponentGame.homeTeamId === team.id ? "vs." : "at"} ${opponent.name}` : "Schedule clear"}</h2></div></div><p class="team-detail">${opponentGame?.scheduledAt || "A game time still needs to be confirmed."}</p><div class="team-schedule">${team.schedule.length ? team.schedule.map((game) => {
    const isHome = game.homeTeamId === team.id;
    const opponentTeam = isHome ? game.awayTeam : game.homeTeam;
    const score = game.status === "played" ? `${game.awayScore ?? "-"}-${game.homeScore ?? "-"}` : game.scheduledAt || "Not scheduled";
    return `<div class="schedule-line"><span>W${game.week || "--"}</span><strong>${isHome ? "vs." : "at"} ${opponentTeam?.name || "TBD"}</strong><b>${score}</b></div>`;
  }).join("") : `<p class="muted">Schedule arrives with the league export.</p>`}</div><button class="primary-button">Open Game Thread</button></section><section class="panel"><div class="panel-heading"><div><span>Roster room</span><h2>Key Personnel</h2></div><span class="muted">Top 12 by OVR</span></div>${roster.length ? roster.slice(0, 12).map((player) => `<div class="roster-line"><span>${player.position}</span><strong>${player.name}</strong><b>${player.overall ?? "--"}</b></div>`).join("") : `<p class="muted">Full roster arrives with the EA importer.</p>`}<div class="draft-picks">${(team.draftPicks || []).map((pick) => `<span>${pick}</span>`).join("")}</div></section></div>`;
}

$("#team-picker").addEventListener("change", (event) => loadTeam(event.target.value));

function renderTrades(filter = "all") {
  const visible = tradeCache.filter((trade) => filter === "all" || (filter === "committee" ? trade.status === "committee_review" : filter === "completed" ? trade.status === "approved" : trade.status === filter));
  $("#trade-list").innerHTML = visible.map((trade) => `<article class="trade-card"><div class="trade-card-head"><span class="trade-status ${trade.status}">${trade.status.replaceAll("_", " ")}</span><small>${new Date(trade.submittedAt).toLocaleDateString()}</small></div><div class="trade-sides"><div><strong>${trade.teamA.name}</strong>${trade.teamAAssets.map((asset) => `<span>${asset}</span>`).join("")}</div><div class="trade-swap">⇄</div><div><strong>${trade.teamB.name}</strong>${trade.teamBAssets.map((asset) => `<span>${asset}</span>`).join("")}</div></div><div class="vote-progress"><span>Committee votes</span><strong>${trade.votesFor}/${trade.votesNeeded}</strong></div></article>`).join("") || `<p class="empty">No trades in this stage.</p>`;
}

async function loadTrades() {
  if (!tradeCache.length) tradeCache = await api("/trades");
  renderTrades();
}

document.querySelectorAll(".status-tabs button").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.matchupFilter) {
    loadMatchups(button.dataset.matchupFilter);
    return;
  }
  button.closest(".status-tabs").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  const filters = { "All Activity": "all", Negotiating: "negotiating", Committee: "committee", Completed: "completed" };
  renderTrades(filters[button.textContent]);
}));

async function loadMedia() {
  const posts = await api("/media");
  $("#media-grid").innerHTML = posts.map((post) => `<article class="media-card"><div class="media-type">${post.type}</div><h2>${post.title}</h2><p>${post.summary}</p><div class="media-footer"><span class="content-status ${post.status}">${post.status}</span><button>${post.status === "draft" ? "Continue Draft" : "Read Story"}</button></div></article>`).join("");
}

async function loadOffice() {
  const [office, members, teams, imports, receiverAttempts] = await Promise.all([
    currentRole === "commissioner" ? workspace : api("/workspace?role=commissioner"),
    api("/members"),
    api("/teams"),
    api("/import-runs"),
    api("/receiver-attempts")
  ]);
  $("#office-actions").innerHTML = actionRows(office.actions);
  renderSync($("#office-sync"), office.syncHealth);
  $("#receiver-attempts").innerHTML = receiverAttempts.length ? `<h3 class="receiver-heading">Latest Snallabot Receiver Calls</h3>${receiverAttempts.map((attempt) => `<article class="import-run receiver-attempt"><div class="import-run-head"><strong>${attempt.status}</strong><span class="trade-status ${attempt.status === "accepted" ? "approved" : "denied"}">${attempt.statusCode}</span></div><small>${new Date(attempt.receivedAt).toLocaleString()}</small><p class="muted">${attempt.source || "snallabot-receiver"}</p><p class="muted">${attempt.message}</p><details><summary>Payload preview</summary><code>${JSON.stringify(attempt.preview)}</code></details></article>`).join("")}` : "";
  $("#import-history").innerHTML = imports.length ? imports.map((run) => `<article class="import-run"><div class="import-run-head"><strong>${run.source}</strong><span class="trade-status ${run.status}">${run.status}</span></div><small>${run.completedAt ? new Date(run.completedAt).toLocaleString() : "Not completed"}</small><div class="import-datasets">${run.datasets.map((dataset) => `<span>${dataset.name}: ${dataset.records}</span>`).join("")}</div><details><summary>Raw fingerprints</summary>${run.rawExports.map((raw) => `<code>${raw.dataset} · ${raw.sha256.slice(0, 12)} · ${raw.storageKey}</code>`).join("") || "<p>No raw exports recorded.</p>"}</details></article>`).join("") : `<p class="empty">No imports have run yet.</p>`;
  $("#open-teams").innerHTML = office.openTeams.map((team) => `<article><span class="mini-badge" style="--team-color:${team.color}">${team.abbr}</span><div><strong>${team.name}</strong><small>${record(team)} · ${team.conference} ${team.division}</small></div><button>Review applicants</button></article>`).join("");
  $("#member-table").innerHTML = `<div class="member-row member-header"><span>Coach</span><span>Team</span><span>Role</span><span>Status</span><span></span></div>${members.map((member) => `<div class="member-row" data-member-id="${member.id}"><strong>${member.displayName}</strong><select data-field="teamId"><option value="">Unassigned</option>${teams.map((team) => `<option value="${team.id}" ${member.teamId === team.id ? "selected" : ""}>${team.abbr}</option>`).join("")}</select><select data-field="role"><option value="coach" ${member.role === "coach" ? "selected" : ""}>Coach</option><option value="commissioner" ${member.role === "commissioner" ? "selected" : ""}>Commissioner</option></select><select data-field="status"><option value="active" ${member.status === "active" ? "selected" : ""}>Active</option><option value="pending" ${member.status === "pending" ? "selected" : ""}>Pending</option><option value="suspended" ${member.status === "suspended" ? "selected" : ""}>Suspended</option><option value="removed" ${member.status === "removed" ? "selected" : ""}>Removed</option></select><button class="member-save">Save</button></div>`).join("")}`;
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
  await navigator.clipboard.writeText(url);
  $("#import-result").textContent = "Receiver URL copied. Paste it into Snallabot's Add Export URL field.";
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
