export function record(team) {
  return `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;
}

export function standingsFields(standings) {
  return Object.entries(standings).map(([division, teams]) => ({
    name: division,
    value: teams.map((team, index) => `${index + 1}. **${team.name}** ${record(team)}`).join("\n") || "No teams imported",
    inline: true
  }));
}

const matchupStatus = {
  played: "Final",
  scheduled: "Scheduled",
  unscheduled: "Needs time",
  fair_sim: "Fair sim",
  force_win_home: "Home force win",
  force_win_away: "Away force win",
  admin_review: "Commissioner review"
};

export function matchupFields(games, limit = 16) {
  return games.slice(0, Math.min(limit, 25)).map((game) => {
    const away = game.awayTeam || {};
    const home = game.homeTeam || {};
    const isFinal = game.status === "played";
    const detail = isFinal
      ? `${away.abbr || "AWY"} ${game.awayScore ?? "-"} - ${home.abbr || "HME"} ${game.homeScore ?? "-"}`
      : game.scheduledAt || "Kickoff time not confirmed";
    return {
      name: `Week ${game.week || "--"} | ${away.abbr || "AWY"} at ${home.abbr || "HME"}`,
      value: `**${matchupStatus[game.status] || game.status || "Unknown"}** | ${detail}\n${away.name || "Away Team"} (${record(away)}) vs ${home.name || "Home Team"} (${record(home)})`,
      inline: false
    };
  });
}

const rosterLanes = {
  Offense: new Set(["QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT"]),
  Defense: new Set(["LE", "RE", "DT", "LOLB", "MLB", "ROLB", "CB", "FS", "SS"]),
  "Special Teams": new Set(["K", "P"])
};

function rosterLane(position) {
  return Object.entries(rosterLanes).find(([, positions]) => positions.has(position))?.[0] || "Other";
}

export function rosterFields(team) {
  const groups = new Map();
  const roster = (team.roster || []).slice().sort((a, b) => (b.overall || 0) - (a.overall || 0) || a.name.localeCompare(b.name));
  for (const player of roster) {
    const lane = rosterLane(player.position);
    groups.set(lane, [...(groups.get(lane) || []), player]);
  }
  return ["Offense", "Defense", "Special Teams", "Other"].filter((lane) => groups.has(lane)).map((lane) => ({
    name: `${lane} | ${groups.get(lane).length}`,
    value: groups.get(lane).map((player) => `**${player.position || "--"}** ${player.name} | ${player.overall ?? "--"} OVR`).join("\n").slice(0, 1024) || "No players imported",
    inline: false
  }));
}
