const terminalStatuses = new Set(["played", "fair_sim", "force_win_home", "force_win_away"]);

function record(team = {}) {
  return `${team.wins ?? 0}-${team.losses ?? 0}${team.ties ? `-${team.ties}` : ""}`;
}

export function openGamesForThreads(games = []) {
  return games.filter((game) => !terminalStatuses.has(game.status));
}

export function gameThreadName(game) {
  const away = game.awayTeam?.abbr || "away";
  const home = game.homeTeam?.abbr || "home";
  return `week-${game.week || "x"}-${away}-at-${home}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 100);
}

export function gameThreadEmbed(game) {
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  return {
    color: 0xd6a94b,
    title: `${away.name || "Away Team"} at ${home.name || "Home Team"}`,
    description: `Week ${game.week || "--"} matchup thread. Schedule and play your game here, post a stream or proof link, and record the outcome in LeagueOS.`,
    fields: [
      { name: "Away", value: `**${away.name || "Away Team"}** | ${record(away)}`, inline: true },
      { name: "Home", value: `**${home.name || "Home Team"}** | ${record(home)}`, inline: true },
      { name: "Kickoff", value: game.scheduledAt || "Time needs to be confirmed", inline: false },
      { name: "Checklist", value: "Tag both coaches\nConfirm kickoff window\nPost stream or proof\nRecord the final outcome", inline: false }
    ],
    timestamp: new Date().toISOString()
  };
}
