const team = (id, name, abbr, conference, division, wins, losses, pf, pa, color, extra = {}) => ({
  id, name, abbr, conference, division, wins, losses, ties: 0, pointsFor: pf, pointsAgainst: pa,
  conferenceWins: Math.max(1, wins - 2), conferenceLosses: Math.max(1, losses - 1),
  divisionWins: Math.max(1, Math.floor(wins / 2)), divisionLosses: Math.max(0, Math.floor(losses / 2)),
  turnoverDiff: wins - losses, last5Wins: Math.min(5, Math.max(1, wins - 4)),
  last5Losses: Math.max(0, 5 - Math.min(5, Math.max(1, wins - 4))), color, ...extra
});

export const demoLeague = {
  id: "the-trenches",
  name: "The Trenches",
  gameType: "MADDEN",
  season: 2026,
  week: 11,
  advanceAt: "Sunday · 10:00 PM ET",
  demoUser: { id: "coach-dev", displayName: "Coach Devin", teamId: "buf", roles: ["coach", "commissioner"] },
  members: [
    { id: "member-dev", userId: "coach-dev", displayName: "Coach Devin", teamId: "buf", role: "commissioner", status: "active" },
    { id: "member-mia", userId: "coach-mia", displayName: "Coach South", teamId: "mia", role: "coach", status: "active" },
    { id: "member-dal", userId: "coach-dal", displayName: "Coach Star", teamId: "dal", role: "coach", status: "active" }
  ],
  syncHealth: {
    status: "healthy",
    lastCompletedAt: "2026-06-22T18:42:00-04:00",
    datasets: [
      { name: "League settings", status: "complete", records: 1 },
      { name: "Weekly schedule", status: "complete", records: 16 },
      { name: "Rosters", status: "complete", records: 1696 },
      { name: "Season stats", status: "complete", records: 842 }
    ]
  },
  actions: {
    coach: [
      { id: "a1", priority: "high", label: "Schedule Week 11 vs. Ravens", detail: "No time confirmed yet", target: "team" },
      { id: "a2", priority: "normal", label: "Review incoming trade", detail: "Offer expires before advance", target: "trades" },
      { id: "a3", priority: "normal", label: "Set weekly stream link", detail: "Optional league media task", target: "media" }
    ],
    commissioner: [
      { id: "a4", priority: "high", label: "Resolve one unscheduled game", detail: "Eagles at Packers", target: "office" },
      { id: "a5", priority: "high", label: "Vote on pending trade", detail: "2 of 3 committee votes submitted", target: "trades" },
      { id: "a6", priority: "normal", label: "Review two open-team applications", detail: "Patriots vacancy", target: "office" }
    ]
  },
  trades: [
    { id: "t1", status: "committee_review", submittedAt: "2026-06-22T14:10:00-04:00", teamA: "buf", teamB: "dal", teamAAssets: ["2027 1st", "WR Keon Coleman"], teamBAssets: ["RE Micah Parsons"], votesFor: 2, votesNeeded: 3 },
    { id: "t2", status: "negotiating", submittedAt: "2026-06-21T20:00:00-04:00", teamA: "mia", teamB: "gb", teamAAssets: ["2027 2nd"], teamBAssets: ["HB MarShawn Lloyd"], votesFor: 0, votesNeeded: 3 },
    { id: "t3", status: "approved", submittedAt: "2026-06-20T09:30:00-04:00", teamA: "pit", teamB: "min", teamAAssets: ["CB Joey Porter Jr."], teamBAssets: ["2027 1st", "2028 3rd"], votesFor: 3, votesNeeded: 3 }
  ],
  media: [
    { id: "m1", type: "Game of the Week", title: "Heavyweights collide in Buffalo", summary: "The league's top two AFC defenses meet under the lights.", status: "published" },
    { id: "m2", type: "Power Rankings", title: "Detroit takes over the top spot", summary: "A dominant five-game run reshapes the championship picture.", status: "draft" },
    { id: "m3", type: "Players of the Week", title: "Week 10 honors", summary: "Josh Allen and Micah Parsons headline this week's award winners.", status: "published" }
  ],
  teams: [
    team("buf", "Buffalo Bills", "BUF", "AFC", "East", 8, 2, 286, 201, "#2563eb", { overall: 88, capAvailable: 18400000, offenseRank: 5, defenseRank: 2, passRank: 3, rushRank: 14, owner: "Coach Devin" }),
    team("mia", "Miami Dolphins", "MIA", "AFC", "East", 7, 3, 278, 224, "#06b6d4"),
    team("nyj", "New York Jets", "NYJ", "AFC", "East", 4, 6, 191, 230, "#10b981"),
    team("ne", "New England Patriots", "NE", "AFC", "East", 2, 8, 164, 267, "#64748b"),
    team("bal", "Baltimore Ravens", "BAL", "AFC", "North", 9, 1, 310, 188, "#7c3aed"),
    team("pit", "Pittsburgh Steelers", "PIT", "AFC", "North", 6, 4, 238, 219, "#eab308"),
    team("cin", "Cincinnati Bengals", "CIN", "AFC", "North", 5, 5, 246, 251, "#f97316"),
    team("cle", "Cleveland Browns", "CLE", "AFC", "North", 3, 7, 180, 249, "#92400e"),
    team("dal", "Dallas Cowboys", "DAL", "NFC", "East", 8, 2, 301, 210, "#38bdf8"),
    team("phi", "Philadelphia Eagles", "PHI", "NFC", "East", 7, 3, 270, 214, "#0f766e"),
    team("was", "Washington Commanders", "WAS", "NFC", "East", 5, 5, 227, 231, "#facc15"),
    team("nyg", "New York Giants", "NYG", "NFC", "East", 2, 8, 171, 279, "#1d4ed8"),
    team("det", "Detroit Lions", "DET", "NFC", "North", 9, 1, 322, 196, "#0ea5e9"),
    team("gb", "Green Bay Packers", "GB", "NFC", "North", 6, 4, 254, 232, "#15803d"),
    team("min", "Minnesota Vikings", "MIN", "NFC", "North", 4, 6, 218, 247, "#8b5cf6"),
    team("chi", "Chicago Bears", "CHI", "NFC", "North", 3, 7, 196, 258, "#ea580c")
  ],
  games: [
    { id: "g1", week: 11, awayTeamId: "bal", homeTeamId: "buf", status: "scheduled", scheduledAt: "Tonight · 8:30 PM ET", featured: true },
    { id: "g2", week: 11, awayTeamId: "dal", homeTeamId: "det", status: "scheduled", scheduledAt: "Tuesday · 9:00 PM ET" },
    { id: "g3", week: 11, awayTeamId: "phi", homeTeamId: "gb", status: "unscheduled", scheduledAt: null },
    { id: "g4", week: 11, awayTeamId: "mia", homeTeamId: "pit", status: "played", awayScore: 31, homeScore: 24 },
    { id: "g5", week: 11, awayTeamId: "was", homeTeamId: "min", status: "played", awayScore: 21, homeScore: 27 }
  ],
  players: [
    { id: "p1", name: "Lamar Jackson", teamId: "bal", position: "QB", overall: 96, devTrait: "X-Factor", age: 29, statLabel: "Pass Yards", statValue: 3412 },
    { id: "p2", name: "Josh Allen", teamId: "buf", position: "QB", overall: 95, devTrait: "X-Factor", age: 30, statLabel: "Pass TD", statValue: 31 },
    { id: "p3", name: "Micah Parsons", teamId: "dal", position: "RE", overall: 98, devTrait: "X-Factor", age: 27, statLabel: "Sacks", statValue: 15.5 },
    { id: "p4", name: "Amon-Ra St. Brown", teamId: "det", position: "WR", overall: 94, devTrait: "Superstar", age: 26, statLabel: "Rec Yards", statValue: 1128 },
    { id: "p5", name: "Jordan Love", teamId: "gb", position: "QB", overall: 91, devTrait: "Superstar", age: 27, statLabel: "Pass Yards", statValue: 3605 }
  ]
};
