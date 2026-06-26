import { demoLeague } from "./demo-data.js";
import { importStatusForDatasets, normalizeImportDatasets, rawExportStorageKey } from "../../../packages/ea-importer/src/index.js";
import { loadEnvFile } from "../../../packages/config/src/env.js";

await loadEnvFile();

const leagues = new Map([[demoLeague.id, structuredClone(demoLeague)]]);
const users = new Map();

const memoryRepository = {
  adapter: "memory",
  listLeagues: () => [...leagues.values()].map(({ teams, games, players, ...league }) => ({
    ...league, teamCount: teams.length
  })),
  getLeague: (id) => leagues.get(id),
  getTeam: (league, id) => league.teams.find((team) => team.id === id),
  listStatLeaders: (league, limit = 5) => [{
    key: "players",
    title: "Top Players",
    metric: "Overall",
    leaders: league.players
      .slice()
      .sort((a, b) => (b.overall || 0) - (a.overall || 0))
      .slice(0, limit)
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        team: league.teams.find((team) => team.id === player.teamId)?.abbr || null,
        metric: "Overall",
        value: player.overall || 0,
        secondaryMetric: player.position,
        secondaryValue: null
      }))
  }],
  listMembers: (league) => (league.members || []).map((membership) => ({
    ...membership,
    team: league.teams.find((team) => team.id === membership.teamId) || null
  })),
  updateMembership: (league, membershipId, changes) => {
    const membership = league.members?.find((entry) => entry.id === membershipId);
    if (!membership) return null;
    Object.assign(membership, changes);
    return { ...membership, team: league.teams.find((team) => team.id === membership.teamId) || null };
  },
  listImportRuns: (league, limit = 10) => (league.importRuns || []).slice(0, limit),
  bootstrapOwnerMembership: (league, userId, teamId = "buf") => {
    const user = [...users.values()].find((entry) => entry.id === userId) || league.demoUser;
    if (!user) return null;
    const membership = league.members?.find((entry) => entry.userId === userId);
    const next = membership || {
      id: `member-${userId}`,
      userId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || null
    };
    Object.assign(next, { teamId, role: "commissioner", status: "active" });
    if (!membership) league.members = [...(league.members || []), next];
    user.memberships = [{ leagueId: league.id, teamId, role: "commissioner", status: "active" }];
    return { ...next, team: league.teams.find((team) => team.id === teamId) || null };
  },
  recordImportRun: (league, input) => {
    const now = new Date().toISOString();
    const datasets = normalizeImportDatasets(input.datasets);
    const status = importStatusForDatasets(datasets);
    const run = {
      id: `import-${Date.now()}`,
      leagueId: league.id,
      source: input.source || "manual-upload",
      status: status.toLowerCase(),
      startedAt: now,
      completedAt: now,
      datasets: datasets.map((dataset) => ({
        name: dataset.name,
        status: dataset.status.toLowerCase(),
        records: dataset.recordCount,
        errorMessage: dataset.errorMessage,
        storageKey: rawExportStorageKey({ leagueId: league.id, season: input.season || league.season, week: input.week || league.week, dataset: dataset.name, sha256: dataset.sha256 })
      }))
    };
    league.importRuns = [run, ...(league.importRuns || [])];
    league.syncHealth = {
      status: run.status,
      lastCompletedAt: run.completedAt,
      datasets: run.datasets.map(({ name, status: datasetStatus, records }) => ({ name, status: datasetStatus, records }))
    };
    return run;
  },
  upsertDiscordUser: (profile) => {
    const existing = users.get(profile.id);
    const user = {
      id: existing?.id || `discord-${profile.id}`,
      discordId: profile.id,
      username: profile.username,
      displayName: profile.global_name || profile.username,
      avatarUrl: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
      memberships: existing?.memberships || []
    };
    users.set(profile.id, user);
    return user;
  }
};

const adapter = process.env.NODE_ENV === "test" ? process.env.TEST_REPOSITORY_ADAPTER : process.env.REPOSITORY_ADAPTER;

export const repository = adapter === "prisma"
  ? (await import("../../../packages/database/src/repository.js")).createPrismaRepository()
  : memoryRepository;
