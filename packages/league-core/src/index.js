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

const offensePositions = new Set(["QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT"]);
const defensePositions = new Set(["LE", "RE", "DT", "LOLB", "MLB", "ROLB", "CB", "FS", "SS"]);

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const rounded = (value, digits = 1) => Number(number(value).toFixed(digits));
const clamp = (value, low = 0, high = 100) => Math.min(high, Math.max(low, value));

function unitAverage(players, positions, limit = 11) {
  const ratings = players
    .filter((player) => positions.has(String(player.position || "").toUpperCase()))
    .map((player) => number(player.overall, NaN))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
    .slice(0, limit);
  return ratings.length ? rounded(ratings.reduce((total, rating) => total + rating, 0) / ratings.length) : null;
}

function recentRecord(team, games) {
  const imported = games
    .filter((game) => game.status === "played" && (game.homeTeamId === team.id || game.awayTeamId === team.id))
    .filter((game) => Number.isFinite(Number(game.homeScore)) && Number.isFinite(Number(game.awayScore)))
    .sort((a, b) => number(b.week) - number(a.week))
    .slice(0, 5);
  if (imported.length) {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const game of imported) {
      const teamScore = game.homeTeamId === team.id ? number(game.homeScore) : number(game.awayScore);
      const opponentScore = game.homeTeamId === team.id ? number(game.awayScore) : number(game.homeScore);
      if (teamScore > opponentScore) wins += 1;
      else if (teamScore < opponentScore) losses += 1;
      else ties += 1;
    }
    return { wins, losses, ties, games: imported.length, winPct: rounded(safePct(wins, losses, ties), 3), source: "imported finals" };
  }
  const wins = number(team.last5Wins);
  const losses = number(team.last5Losses);
  const ties = number(team.last5Ties);
  const total = wins + losses + ties;
  return { wins, losses, ties, games: total, winPct: rounded(safePct(wins, losses, ties), 3), source: total ? "standings form" : "season record" };
}

export function teamTendencyProfile(team, { players = [], games = [] } = {}) {
  const roster = players.filter((player) => player.teamId === team.id);
  const availabilityRows = roster.filter((player) => {
    const attributes = player.attributes || {};
    return attributes.injuryLength !== undefined || attributes.injuryType !== undefined || attributes.isOnIr !== undefined;
  });
  const unavailablePlayers = availabilityRows.filter((player) => {
    const attributes = player.attributes || {};
    return Number(attributes.injuryLength || 0) > 0 || attributes.isOnIr === true;
  });
  const expiringContracts = roster.filter((player) => Number(player.attributes?.contractYears) === 1);
  const gamesPlayed = Math.max(1, number(team.wins) + number(team.losses) + number(team.ties));
  const pointsPerGame = rounded(number(team.pointsFor) / gamesPlayed);
  const pointsAllowedPerGame = rounded(number(team.pointsAgainst) / gamesPlayed);
  const pointDifferentialPerGame = rounded((number(team.pointsFor) - number(team.pointsAgainst)) / gamesPlayed);
  const offenseOverall = unitAverage(roster, offensePositions);
  const defenseOverall = unitAverage(roster, defensePositions);
  const recent = recentRecord(team, games);
  if (!recent.games) recent.winPct = rounded(safePct(number(team.wins), number(team.losses), number(team.ties)), 3);
  const seasonWinPct = rounded(safePct(number(team.wins), number(team.losses), number(team.ties)), 3);
  const turnoverPerGame = rounded(number(team.turnoverDiff) / gamesPlayed);
  const ratings = {
    offense: rounded(clamp(50 + (pointsPerGame - 21) * 2 + ((offenseOverall ?? 75) - 75) * 1.25)),
    defense: rounded(clamp(50 + (21 - pointsAllowedPerGame) * 2 + ((defenseOverall ?? 75) - 75) * 1.25)),
    form: rounded(clamp((recent.winPct || seasonWinPct) * 100))
  };
  const strengths = [];
  const pressurePoints = [];
  if (pointsPerGame >= 24) strengths.push({ label: "Scoring pace", evidence: `${pointsPerGame} points per game` });
  else pressurePoints.push({ label: "Scoring pace", evidence: `${pointsPerGame} points per game` });
  if (pointsAllowedPerGame <= 21) strengths.push({ label: "Scoring defense", evidence: `${pointsAllowedPerGame} points allowed per game` });
  else pressurePoints.push({ label: "Scoring defense", evidence: `${pointsAllowedPerGame} points allowed per game` });
  if (pointDifferentialPerGame > 0) strengths.push({ label: "Point margin", evidence: `${pointDifferentialPerGame > 0 ? "+" : ""}${pointDifferentialPerGame} per game` });
  else pressurePoints.push({ label: "Point margin", evidence: `${pointDifferentialPerGame} per game` });
  if (turnoverPerGame > 0) strengths.push({ label: "Turnover margin", evidence: `${turnoverPerGame > 0 ? "+" : ""}${turnoverPerGame} per game` });
  else if (turnoverPerGame < 0) pressurePoints.push({ label: "Turnover margin", evidence: `${turnoverPerGame} per game` });
  return {
    teamId: team.id,
    teamName: team.name,
    abbr: team.abbr,
    record: record(team),
    gamesPlayed,
    metrics: { pointsPerGame, pointsAllowedPerGame, pointDifferentialPerGame, turnoverPerGame, seasonWinPct, offenseOverall, defenseOverall },
    recent,
    ratings,
    strengths,
    pressurePoints,
    availability: {
      tracked: availabilityRows.length,
      unavailable: unavailablePlayers.length,
      available: Math.max(0, availabilityRows.length - unavailablePlayers.length),
      expiringContracts: expiringContracts.length,
      players: unavailablePlayers
        .sort((a, b) => number(b.overall) - number(a.overall) || a.name.localeCompare(b.name))
        .slice(0, 5)
        .map((player) => ({
          id: player.id,
          name: player.name,
          position: player.position,
          overall: Number.isFinite(Number(player.overall)) ? number(player.overall) : null,
          injuryLength: number(player.attributes?.injuryLength),
          injuryType: player.attributes?.injuryType || null,
          isOnIr: player.attributes?.isOnIr === true
        }))
    },
    keyPersonnel: roster
      .filter((player) => Number.isFinite(Number(player.overall)))
      .sort((a, b) => number(b.overall) - number(a.overall) || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((player) => ({ id: player.id, name: player.name, position: player.position, overall: number(player.overall), devTrait: player.devTrait || null }))
  };
}

function edge(id, label, awayValue, homeValue, { lowerIsBetter = false, unit = "" } = {}, awayTeam, homeTeam) {
  const difference = lowerIsBetter ? homeValue - awayValue : awayValue - homeValue;
  const advantage = Math.abs(difference) < 0.05 ? "even" : difference > 0 ? awayTeam.id : homeTeam.id;
  const display = (value) => `${rounded(value)}${unit}`;
  return {
    id,
    label,
    awayValue: rounded(awayValue),
    homeValue: rounded(homeValue),
    unit,
    advantage,
    evidence: `${awayTeam.abbr || awayTeam.name} ${display(awayValue)} vs ${homeTeam.abbr || homeTeam.name} ${display(homeValue)}`
  };
}

export function matchupComparison({ game, awayTeam, homeTeam, players = [], games = [] }) {
  const away = teamTendencyProfile(awayTeam, { players, games });
  const home = teamTendencyProfile(homeTeam, { players, games });
  const edges = [
    edge("scoring", "Scoring", away.metrics.pointsPerGame, home.metrics.pointsPerGame, { unit: " PPG" }, awayTeam, homeTeam),
    edge("defense", "Scoring defense", away.metrics.pointsAllowedPerGame, home.metrics.pointsAllowedPerGame, { lowerIsBetter: true, unit: " PA/G" }, awayTeam, homeTeam),
    edge("margin", "Point differential", away.metrics.pointDifferentialPerGame, home.metrics.pointDifferentialPerGame, { unit: " /G" }, awayTeam, homeTeam),
    edge("form", "Recent form", away.recent.winPct * 100, home.recent.winPct * 100, { unit: "%" }, awayTeam, homeTeam)
  ];
  if (away.metrics.offenseOverall !== null && home.metrics.offenseOverall !== null) {
    edges.push(edge("offense-personnel", "Offensive personnel", away.metrics.offenseOverall, home.metrics.offenseOverall, { unit: " OVR" }, awayTeam, homeTeam));
  }
  if (away.metrics.defenseOverall !== null && home.metrics.defenseOverall !== null) {
    edges.push(edge("defense-personnel", "Defensive personnel", away.metrics.defenseOverall, home.metrics.defenseOverall, { unit: " OVR" }, awayTeam, homeTeam));
  }
  if (away.availability.tracked && home.availability.tracked) {
    edges.push(edge("availability", "Roster availability", away.availability.unavailable, home.availability.unavailable, { lowerIsBetter: true, unit: " unavailable" }, awayTeam, homeTeam));
  }
  const awayEdgeCount = edges.filter((item) => item.advantage === awayTeam.id).length;
  const homeEdgeCount = edges.filter((item) => item.advantage === homeTeam.id).length;
  const awayScore = away.ratings.offense * 0.35 + away.ratings.defense * 0.35 + away.ratings.form * 0.2 + (away.metrics.offenseOverall ?? 75) * 0.05 + (away.metrics.defenseOverall ?? 75) * 0.05;
  const homeScore = home.ratings.offense * 0.35 + home.ratings.defense * 0.35 + home.ratings.form * 0.2 + (home.metrics.offenseOverall ?? 75) * 0.05 + (home.metrics.defenseOverall ?? 75) * 0.05;
  const margin = rounded(Math.abs(awayScore - homeScore));
  const winner = margin < 2 ? null : awayScore > homeScore ? awayTeam : homeTeam;
  return {
    gameId: game.id || game.externalId,
    week: game.week || null,
    away,
    home,
    edges,
    edgeCount: { away: awayEdgeCount, home: homeEdgeCount, even: edges.length - awayEdgeCount - homeEdgeCount },
    projection: {
      winnerTeamId: winner?.id || null,
      winnerName: winner?.name || "Toss-up",
      confidence: margin >= 12 ? "strong" : margin >= 6 ? "moderate" : "slight",
      modelMargin: margin,
      note: winner
        ? `${winner.name} leads the deterministic matchup score and ${winner.id === awayTeam.id ? awayEdgeCount : homeEdgeCount} of ${edges.length} measured edges.`
        : `The matchup score is within two points; the recorded data does not support a clear favorite.`
    },
    coverage: {
      standings: true,
      rosterRatings: players.some((player) => player.teamId === awayTeam.id || player.teamId === homeTeam.id),
      recentFinals: games.some((entry) => entry.status === "played"),
      injuries: Boolean(away.availability.tracked && home.availability.tracked),
      coachActivity: false,
      unavailable: [
        ...(away.availability.tracked && home.availability.tracked ? [] : ["injuries"]),
        "direct coach activity"
      ]
    },
    methodology: "Standings pace, scoring defense, point differential, recent imported finals, top-unit roster ratings, and explicit imported availability when present. No generated or inferred statistics."
  };
}
