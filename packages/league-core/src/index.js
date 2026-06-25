const safePct = (wins, losses, ties = 0) => {
  const games = wins + losses + ties;
  return games ? (wins + ties * 0.5) / games : 0;
};

const groupBy = (items, keyFor) => items.reduce((groups, item) => {
  const key = keyFor(item);
  (groups[key] ??= []).push(item);
  return groups;
}, {});

export function compareTeams(a, b) {
  const keys = [
    [safePct(a.wins, a.losses, a.ties), safePct(b.wins, b.losses, b.ties)],
    [safePct(a.conferenceWins, a.conferenceLosses, a.conferenceTies), safePct(b.conferenceWins, b.conferenceLosses, b.conferenceTies)],
    [safePct(a.divisionWins, a.divisionLosses, a.divisionTies), safePct(b.divisionWins, b.divisionLosses, b.divisionTies)],
    [a.pointsFor - a.pointsAgainst, b.pointsFor - b.pointsAgainst],
    [a.pointsFor, b.pointsFor]
  ];

  for (const [left, right] of keys) {
    if (left !== right) return right - left;
  }
  return a.name.localeCompare(b.name);
}

export function standingsByDivision(teams) {
  return groupBy(
    [...teams].sort(compareTeams),
    (team) => `${team.conference} ${team.division}`
  );
}

export function playoffRace(teams, playoffTeams = 7) {
  return Object.fromEntries(
    [...new Set(teams.map((team) => team.conference))].sort().map((conference) => {
      const conferenceTeams = teams.filter((team) => team.conference === conference);
      const divisions = groupBy(conferenceTeams, (team) => team.division);
      const leaders = Object.values(divisions).map((division) => [...division].sort(compareTeams)[0]).sort(compareTeams);
      const leaderIds = new Set(leaders.map((team) => team.id));
      const wildcards = conferenceTeams.filter((team) => !leaderIds.has(team.id)).sort(compareTeams);
      const seeded = [...leaders, ...wildcards].map((team, index) => ({ ...team, seed: index + 1 }));
      return [conference, {
        playoff: seeded.slice(0, playoffTeams),
        inTheHunt: seeded.slice(playoffTeams, playoffTeams + 3),
        outside: seeded.slice(playoffTeams + 3)
      }];
    })
  );
}

export function powerRankings(teams) {
  const ranked = teams.map((team) => {
    const games = Math.max(1, team.wins + team.losses + team.ties);
    const winPct = safePct(team.wins, team.losses, team.ties);
    const pointDiffPerGame = (team.pointsFor - team.pointsAgainst) / games;
    const turnoverPerGame = (team.turnoverDiff ?? 0) / games;
    const recentPct = safePct(team.last5Wins ?? 0, team.last5Losses ?? 0, team.last5Ties ?? 0);
    const score = winPct * 55 + recentPct * 20 + pointDiffPerGame * 1.25 + turnoverPerGame * 4;
    return { ...team, powerScore: Number(score.toFixed(1)) };
  }).sort((a, b) => b.powerScore - a.powerScore || compareTeams(a, b));

  return ranked.map((team, index) => ({ ...team, rank: index + 1 }));
}

export function record(team) {
  return `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;
}
