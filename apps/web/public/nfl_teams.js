/**
 * NFL Teams Data — All 32 teams with official colors, abbreviations, and logo paths.
 * Colors sourced from official NFL team brand guidelines.
 * Logos served from /assets/logos/nfl/{abbr}.png (ESPN CDN originals, 500px).
 */
const NFL_TEAMS = {
  ARI: {
    abbr: "ARI", city: "Arizona", name: "Cardinals", full: "Arizona Cardinals",
    primary: "#97233F", secondary: "#000000", accent: "#FFB612",
    logo: "/assets/logos/nfl/ari.png"
  },
  ATL: {
    abbr: "ATL", city: "Atlanta", name: "Falcons", full: "Atlanta Falcons",
    primary: "#A71930", secondary: "#000000", accent: "#A5ACAF",
    logo: "/assets/logos/nfl/atl.png"
  },
  BAL: {
    abbr: "BAL", city: "Baltimore", name: "Ravens", full: "Baltimore Ravens",
    primary: "#241773", secondary: "#000000", accent: "#9E7C0C",
    logo: "/assets/logos/nfl/bal.png"
  },
  BUF: {
    abbr: "BUF", city: "Buffalo", name: "Bills", full: "Buffalo Bills",
    primary: "#00338D", secondary: "#C60C30", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/buf.png"
  },
  CAR: {
    abbr: "CAR", city: "Carolina", name: "Panthers", full: "Carolina Panthers",
    primary: "#0085CA", secondary: "#101820", accent: "#BFC0BF",
    logo: "/assets/logos/nfl/car.png"
  },
  CHI: {
    abbr: "CHI", city: "Chicago", name: "Bears", full: "Chicago Bears",
    primary: "#0B162A", secondary: "#C83803", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/chi.png"
  },
  CIN: {
    abbr: "CIN", city: "Cincinnati", name: "Bengals", full: "Cincinnati Bengals",
    primary: "#FB4F14", secondary: "#000000", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/cin.png"
  },
  CLE: {
    abbr: "CLE", city: "Cleveland", name: "Browns", full: "Cleveland Browns",
    primary: "#311D00", secondary: "#FF3C00", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/cle.png"
  },
  DAL: {
    abbr: "DAL", city: "Dallas", name: "Cowboys", full: "Dallas Cowboys",
    primary: "#003594", secondary: "#041E42", accent: "#869397",
    logo: "/assets/logos/nfl/dal.png"
  },
  DEN: {
    abbr: "DEN", city: "Denver", name: "Broncos", full: "Denver Broncos",
    primary: "#FB4F14", secondary: "#002244", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/den.png"
  },
  DET: {
    abbr: "DET", city: "Detroit", name: "Lions", full: "Detroit Lions",
    primary: "#0076B6", secondary: "#B0B7BC", accent: "#000000",
    logo: "/assets/logos/nfl/det.png"
  },
  GB: {
    abbr: "GB",  city: "Green Bay", name: "Packers", full: "Green Bay Packers",
    primary: "#203731", secondary: "#FFB612", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/gb.png"
  },
  HOU: {
    abbr: "HOU", city: "Houston", name: "Texans", full: "Houston Texans",
    primary: "#03202F", secondary: "#A71930", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/hou.png"
  },
  IND: {
    abbr: "IND", city: "Indianapolis", name: "Colts", full: "Indianapolis Colts",
    primary: "#002C5F", secondary: "#A2AAAD", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/ind.png"
  },
  JAX: {
    abbr: "JAX", city: "Jacksonville", name: "Jaguars", full: "Jacksonville Jaguars",
    primary: "#101820", secondary: "#D7A22A", accent: "#006778",
    logo: "/assets/logos/nfl/jax.png"
  },
  KC: {
    abbr: "KC",  city: "Kansas City", name: "Chiefs", full: "Kansas City Chiefs",
    primary: "#E31837", secondary: "#FFB81C", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/kc.png"
  },
  LAC: {
    abbr: "LAC", city: "Los Angeles", name: "Chargers", full: "Los Angeles Chargers",
    primary: "#0080C6", secondary: "#FFC20E", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/lac.png"
  },
  LAR: {
    abbr: "LAR", city: "Los Angeles", name: "Rams", full: "Los Angeles Rams",
    primary: "#003594", secondary: "#FFA300", accent: "#FF8200",
    logo: "/assets/logos/nfl/lar.png"
  },
  LV: {
    abbr: "LV",  city: "Las Vegas", name: "Raiders", full: "Las Vegas Raiders",
    primary: "#000000", secondary: "#A5ACAF", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/lv.png"
  },
  MIA: {
    abbr: "MIA", city: "Miami", name: "Dolphins", full: "Miami Dolphins",
    primary: "#008E97", secondary: "#FC4C02", accent: "#005778",
    logo: "/assets/logos/nfl/mia.png"
  },
  MIN: {
    abbr: "MIN", city: "Minnesota", name: "Vikings", full: "Minnesota Vikings",
    primary: "#4F2683", secondary: "#FFC62F", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/min.png"
  },
  NE: {
    abbr: "NE",  city: "New England", name: "Patriots", full: "New England Patriots",
    primary: "#002244", secondary: "#C60C30", accent: "#B0B7BC",
    logo: "/assets/logos/nfl/ne.png"
  },
  NO: {
    abbr: "NO",  city: "New Orleans", name: "Saints", full: "New Orleans Saints",
    primary: "#D3BC8D", secondary: "#101820", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/no.png"
  },
  NYG: {
    abbr: "NYG", city: "New York", name: "Giants", full: "New York Giants",
    primary: "#0B2265", secondary: "#A71930", accent: "#A5ACAF",
    logo: "/assets/logos/nfl/nyg.png"
  },
  NYJ: {
    abbr: "NYJ", city: "New York", name: "Jets", full: "New York Jets",
    primary: "#125740", secondary: "#000000", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/nyj.png"
  },
  PHI: {
    abbr: "PHI", city: "Philadelphia", name: "Eagles", full: "Philadelphia Eagles",
    primary: "#004C54", secondary: "#A5ACAF", accent: "#ACC0C6",
    logo: "/assets/logos/nfl/phi.png"
  },
  PIT: {
    abbr: "PIT", city: "Pittsburgh", name: "Steelers", full: "Pittsburgh Steelers",
    primary: "#FFB612", secondary: "#101820", accent: "#C60C30",
    logo: "/assets/logos/nfl/pit.png"
  },
  SEA: {
    abbr: "SEA", city: "Seattle", name: "Seahawks", full: "Seattle Seahawks",
    primary: "#002244", secondary: "#69BE28", accent: "#A5ACAF",
    logo: "/assets/logos/nfl/sea.png"
  },
  SF: {
    abbr: "SF",  city: "San Francisco", name: "49ers", full: "San Francisco 49ers",
    primary: "#AA0000", secondary: "#B3995D", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/sf.png"
  },
  TB: {
    abbr: "TB",  city: "Tampa Bay", name: "Buccaneers", full: "Tampa Bay Buccaneers",
    primary: "#D50A0A", secondary: "#FF7900", accent: "#0A0A08",
    logo: "/assets/logos/nfl/tb.png"
  },
  TEN: {
    abbr: "TEN", city: "Tennessee", name: "Titans", full: "Tennessee Titans",
    primary: "#0C2340", secondary: "#4B92DB", accent: "#C8102E",
    logo: "/assets/logos/nfl/ten.png"
  },
  WSH: {
    abbr: "WSH", city: "Washington", name: "Commanders", full: "Washington Commanders",
    primary: "#5A1414", secondary: "#FFB612", accent: "#FFFFFF",
    logo: "/assets/logos/nfl/wsh.png"
  },
};

// Helper: get team by abbreviation (case-insensitive)
function getNFLTeam(abbr) {
  if (!abbr) return null;
  return NFL_TEAMS[abbr.toUpperCase()] || null;
}

// Helper: get team logo URL
function getNFLTeamLogo(abbr) {
  const team = getNFLTeam(abbr);
  return team ? team.logo : "/assets/logos/nfl/nfl.png";
}

// Helper: get team primary color
function getNFLTeamColor(abbr) {
  const team = getNFLTeam(abbr);
  return team ? team.primary : "#1a1a1a";
}

// Export for use in app.js
if (typeof module !== "undefined") {
  module.exports = { NFL_TEAMS, getNFLTeam, getNFLTeamLogo, getNFLTeamColor };
}
