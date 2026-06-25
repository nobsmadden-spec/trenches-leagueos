import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  const team = await prisma.team.upsert({
    where: { leagueId_externalId: { leagueId: league.id, externalId: "buf" } },
    update: { name: "Buffalo Bills", abbreviation: "BUF" },
    create: {
      leagueId: league.id, externalId: "buf", name: "Buffalo Bills", abbreviation: "BUF",
      conference: "AFC", division: "East", primaryColor: "#2563eb"
    }
  });
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
  const existingSnapshot = await prisma.teamSeasonSnapshot.findFirst({ where: { seasonId: season.id, teamId: team.id } });
  if (!existingSnapshot) {
    await prisma.teamSeasonSnapshot.create({ data: { leagueId: league.id, seasonId: season.id, teamId: team.id } });
  }
}

seed()
  .then(() => console.log("Seeded The Trenches foundation"))
  .finally(() => prisma.$disconnect());
