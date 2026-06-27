import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const foundationTeams = [
  ["ari", "Arizona Cardinals", "ARI", "NFC", "West", "#97233F"],
  ["atl", "Atlanta Falcons", "ATL", "NFC", "South", "#A71930"],
  ["bal", "Baltimore Ravens", "BAL", "AFC", "North", "#241773"],
  ["buf", "Buffalo Bills", "BUF", "AFC", "East", "#00338D"],
  ["car", "Carolina Panthers", "CAR", "NFC", "South", "#0085CA"],
  ["chi", "Chicago Bears", "CHI", "NFC", "North", "#0B162A"],
  ["cin", "Cincinnati Bengals", "CIN", "AFC", "North", "#FB4F14"],
  ["cle", "Cleveland Browns", "CLE", "AFC", "North", "#311D00"],
  ["dal", "Dallas Cowboys", "DAL", "NFC", "East", "#003594"],
  ["den", "Denver Broncos", "DEN", "AFC", "West", "#FB4F14"],
  ["det", "Detroit Lions", "DET", "NFC", "North", "#0076B6"],
  ["gb", "Green Bay Packers", "GB", "NFC", "North", "#203731"],
  ["hou", "Houston Texans", "HOU", "AFC", "South", "#03202F"],
  ["ind", "Indianapolis Colts", "IND", "AFC", "South", "#002C5F"],
  ["jax", "Jacksonville Jaguars", "JAX", "AFC", "South", "#101820"],
  ["kc", "Kansas City Chiefs", "KC", "AFC", "West", "#E31837"],
  ["lac", "Los Angeles Chargers", "LAC", "AFC", "West", "#0080C6"],
  ["lar", "Los Angeles Rams", "LAR", "NFC", "West", "#003594"],
  ["lv", "Las Vegas Raiders", "LV", "AFC", "West", "#000000"],
  ["mia", "Miami Dolphins", "MIA", "AFC", "East", "#008E97"],
  ["min", "Minnesota Vikings", "MIN", "NFC", "North", "#4F2683"],
  ["ne", "New England Patriots", "NE", "AFC", "East", "#002244"],
  ["no", "New Orleans Saints", "NO", "NFC", "South", "#D3BC8D"],
  ["nyg", "New York Giants", "NYG", "NFC", "East", "#0B2265"],
  ["nyj", "New York Jets", "NYJ", "AFC", "East", "#125740"],
  ["phi", "Philadelphia Eagles", "PHI", "NFC", "East", "#004C54"],
  ["pit", "Pittsburgh Steelers", "PIT", "AFC", "North", "#FFB612"],
  ["sea", "Seattle Seahawks", "SEA", "NFC", "West", "#002244"],
  ["sf", "San Francisco 49ers", "SF", "NFC", "West", "#AA0000"],
  ["tb", "Tampa Bay Buccaneers", "TB", "NFC", "South", "#D50A0A"],
  ["ten", "Tennessee Titans", "TEN", "AFC", "South", "#0C2340"],
  ["wsh", "Washington Commanders", "WSH", "NFC", "East", "#5A1414"]
].map(([externalId, name, abbreviation, conference, division, primaryColor]) => ({ externalId, name, abbreviation, conference, division, primaryColor }));

async function seed() {
  const user = await prisma.user.upsert({
    where: { discordId: "demo-commissioner" },
    update: { username: "coach-devin", displayName: "Coach Devin" },
    create: { discordId: "demo-commissioner", username: "coach-devin", displayName: "Coach Devin" }
  });
  const league = await prisma.league.upsert({
    where: { slug: "the-trenches" },
    update: { name: "The Trenches", gameType: "MADDEN" },
    create: { slug: "the-trenches", name: "The Trenches", gameType: "MADDEN", createdById: user.id }
  });
  const seededTeams = new Map();
  for (const teamData of foundationTeams) {
    const importedTeam = await prisma.team.findFirst({
      where: { leagueId: league.id, abbreviation: teamData.abbreviation }
    });
    const team = importedTeam
      ? await prisma.team.update({
          where: { id: importedTeam.id },
          data: {
            name: teamData.name,
            abbreviation: teamData.abbreviation,
            conference: teamData.conference,
            division: teamData.division,
            primaryColor: importedTeam.primaryColor || teamData.primaryColor
          }
        })
      : await prisma.team.create({ data: { leagueId: league.id, ...teamData } });
    seededTeams.set(teamData.externalId, team);
  }
  const team = seededTeams.get("buf");
  await prisma.leagueMembership.upsert({
    where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
    update: { role: "COMMISSIONER", status: "ACTIVE", teamId: team.id, joinedAt: new Date() },
    create: { leagueId: league.id, userId: user.id, teamId: team.id, role: "COMMISSIONER", status: "ACTIVE", joinedAt: new Date() }
  });
  const season = await prisma.season.upsert({
    where: { leagueId_number: { leagueId: league.id, number: 1 } },
    update: { isCurrent: true },
    create: { leagueId: league.id, number: 1, label: "2026 Season", isCurrent: true }
  });
  await prisma.week.upsert({
    where: { seasonId_number_phase: { seasonId: season.id, number: 1, phase: "REGULAR_SEASON" } },
    update: {},
    create: { seasonId: season.id, number: 1, phase: "REGULAR_SEASON" }
  });
  for (const seededTeam of seededTeams.values()) {
    const existingSnapshot = await prisma.teamSeasonSnapshot.findFirst({ where: { seasonId: season.id, teamId: seededTeam.id } });
    if (!existingSnapshot) {
      await prisma.teamSeasonSnapshot.create({ data: { leagueId: league.id, seasonId: season.id, teamId: seededTeam.id } });
    }
  }
}

seed()
  .then(() => console.log("Seeded The Trenches foundation"))
  .finally(() => prisma.$disconnect());
