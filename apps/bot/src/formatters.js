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
