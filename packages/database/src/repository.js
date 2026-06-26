import { prismaClient } from "./client.js";
import { importStatusForDatasets, normalizeImportDatasets, rawExportStorageKey } from "../../ea-importer/src/index.js";

const lower = (value) => value?.toLowerCase();

function normalizeMembership(membership) {
  return {
    leagueId: membership.league.slug,
    teamId: membership.teamId,
    role: lower(membership.role),
    status: lower(membership.status)
  };
}

function normalizeUser(user) {
  return {
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    memberships: user.memberships.map(normalizeMembership)
  };
}

function normalizeLeague(row) {
  const season = row.seasons[0];
  const week = season?.weeks[0];
  const latestImport = row.importRuns[0];
  const teams = row.teams.map((team) => {
    const snapshot = team.seasonSnapshots[0] || {};
    return {
      id: team.id,
      externalId: team.externalId,
      name: team.name,
      abbr: team.abbreviation,
      conference: team.conference,
      division: team.division,
      color: team.primaryColor || "#64748b",
      owner: team.ownerMembership?.user?.displayName || null,
      wins: snapshot.wins || 0,
      losses: snapshot.losses || 0,
      ties: snapshot.ties || 0,
      conferenceWins: snapshot.conferenceWins || 0,
      conferenceLosses: snapshot.conferenceLosses || 0,
      conferenceTies: snapshot.conferenceTies || 0,
      divisionWins: snapshot.divisionWins || 0,
      divisionLosses: snapshot.divisionLosses || 0,
      divisionTies: snapshot.divisionTies || 0,
      pointsFor: snapshot.pointsFor || 0,
      pointsAgainst: snapshot.pointsAgainst || 0,
      turnoverDiff: snapshot.turnoverDiff || 0,
      last5Wins: snapshot.last5Wins || 0,
      last5Losses: snapshot.last5Losses || 0,
      last5Ties: snapshot.last5Ties || 0
    };
  });
  return {
    databaseId: row.id,
    id: row.slug,
    name: row.name,
    gameType: row.gameType,
    season: season?.number || null,
    week: week?.number || null,
    advanceAt: week?.advancesAt?.toISOString() || null,
    teams,
    games: row.games.map((game) => ({
      id: game.id,
      externalId: game.externalId,
      week: week?.number || null,
      awayTeamId: game.awayTeamId,
      homeTeamId: game.homeTeamId,
      status: lower(game.status),
      scheduledAt: game.scheduledAt?.toISOString() || null,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      featured: false
    })),
    players: row.players.map((player) => ({
      id: player.id,
      name: player.name,
      teamId: player.teamId,
      position: player.position,
      overall: player.overall,
      devTrait: player.devTrait,
      age: player.age,
      attributes: player.attributes,
      statLabel: "Overall",
      statValue: player.overall || 0
    })),
    actions: { coach: [], commissioner: [] },
    trades: [],
    media: [],
    syncHealth: {
      status: lower(latestImport?.status) || "not_started",
      lastCompletedAt: latestImport?.completedAt?.toISOString() || null,
      datasets: (latestImport?.datasets || []).map((dataset) => ({
        name: dataset.name,
        status: lower(dataset.status),
        records: dataset.recordCount
      }))
    }
  };
}

function normalizeImportRun(run) {
  return {
    id: run.id,
    leagueId: run.league?.slug || run.leagueId,
    source: run.source,
    status: lower(run.status),
    startedAt: run.startedAt?.toISOString() || null,
    completedAt: run.completedAt?.toISOString() || null,
    errorMessage: run.errorMessage,
    datasets: (run.datasets || []).map((dataset) => ({
      name: dataset.name,
      status: lower(dataset.status),
      records: dataset.recordCount,
      errorMessage: dataset.errorMessage
    })),
    rawExports: (run.rawExports || []).map((rawExport) => ({
      dataset: rawExport.dataset,
      source: rawExport.source,
      sha256: rawExport.sha256,
      storageKey: rawExport.storageKey
    }))
  };
}

function normalizeTrade(row) {
  const assets = row.assets || [];
  const teamAAssets = assets.filter((asset) => asset.side === "TEAM_A").map((asset) => ({
    label: asset.label,
    value: asset.value,
    type: asset.type,
    metadata: asset.metadata || null
  }));
  const teamBAssets = assets.filter((asset) => asset.side === "TEAM_B").map((asset) => ({
    label: asset.label,
    value: asset.value,
    type: asset.type,
    metadata: asset.metadata || null
  }));
  return {
    id: row.id,
    status: lower(row.status),
    submittedAt: row.submittedAt?.toISOString?.() || row.submittedAt,
    submittedBy: row.submittedById || null,
    teamA: row.teamAId,
    teamB: row.teamBId,
    teamAAssets,
    teamBAssets,
    votesFor: row.votesFor,
    votesNeeded: row.votesNeeded
  };
}

const gameStatuses = new Set(["UNSCHEDULED", "SCHEDULED", "PLAYED", "FAIR_SIM", "FORCE_WIN_HOME", "FORCE_WIN_AWAY", "ADMIN_REVIEW"]);

function datasetPayload(datasets, name) {
  return datasets.find((dataset) => dataset.name.toLowerCase() === name.toLowerCase())?.payload || [];
}

const statLeaderCategories = [
  { key: "passing", title: "Passing", datasetNames: ["Passing"], metric: "Pass Yards", aliases: ["passingYds", "passYds", "passYards", "passingYards", "yards"], secondaryMetric: "TD", secondaryAliases: ["passingTDs", "passTDs", "passingTds", "passTds", "tds", "touchdowns"] },
  { key: "rushing", title: "Rushing", datasetNames: ["Rushing"], metric: "Rush Yards", aliases: ["rushingYds", "rushYds", "rushingYards", "rushYards", "yards"], secondaryMetric: "TD", secondaryAliases: ["rushingTDs", "rushTDs", "rushingTds", "rushTds", "tds", "touchdowns"] },
  { key: "receiving", title: "Receiving", datasetNames: ["Receiving"], metric: "Rec Yards", aliases: ["receivingYds", "recYds", "receivingYards", "recYards", "yards"], secondaryMetric: "REC", secondaryAliases: ["receptions", "rec", "catches"] },
  { key: "defense", title: "Defense", datasetNames: ["Defense", "Defensive"], metric: "Sacks", aliases: ["defSacks", "sacks", "sack"], secondaryMetric: "INT", secondaryAliases: ["defInts", "interceptions", "ints", "int"] },
  { key: "kicking", title: "Kicking", datasetNames: ["Kicking"], metric: "FG Made", aliases: ["fgMade", "fieldGoalsMade", "fgm", "kickFgm"], secondaryMetric: "PTS", secondaryAliases: ["kickPts", "points", "pts"] },
  { key: "punting", title: "Punting", datasetNames: ["Punting"], metric: "Punt Yards", aliases: ["puntYds", "puntingYds", "puntYards", "puntingYards", "yards"], secondaryMetric: "PUNTS", secondaryAliases: ["punts", "puntAttempts", "attempts"] }
];

function numberAt(row, names) {
  for (const name of names) {
    const value = row?.[name];
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function statPlayerId(row) {
  return row?.rosterId ?? row?.playerId ?? row?.maddenId ?? row?.id ?? row?.statId ?? null;
}

function statTeamId(row) {
  return row?.teamId ?? row?.teamID ?? row?.clubId ?? row?.clubID ?? null;
}

function playerName(row, player) {
  const direct = row?.fullName || row?.playerName || row?.name;
  if (direct) return String(direct);
  const joined = [row?.firstName, row?.lastName].filter(Boolean).join(" ");
  return joined || player?.name || "Unknown Player";
}

function teamName(row, player, teamsByExternalId) {
  const teamId = statTeamId(row) ?? player?.team?.externalId;
  const team = teamId === null || teamId === undefined ? null : teamsByExternalId.get(String(teamId));
  return team?.abbreviation || team?.abbr || team?.name || player?.team?.abbreviation || null;
}

function latestPayloadByDataset(rawExports) {
  const latest = new Map();
  for (const rawExport of rawExports || []) {
    const key = rawExport.dataset?.toLowerCase();
    if (!key || latest.has(key)) continue;
    latest.set(key, Array.isArray(rawExport.payload) ? rawExport.payload : []);
  }
  return latest;
}

export function buildStatLeaders({ rawExports = [], players = [], teams = [], limit = 5 } = {}) {
  const latest = latestPayloadByDataset(rawExports);
  const playersByExternalId = new Map(players.map((player) => [String(player.externalId || player.id), player]));
  const teamsByExternalId = new Map(teams.map((team) => [String(team.externalId || team.id), team]));
  const categories = statLeaderCategories.map((category) => {
    const rows = category.datasetNames.flatMap((name) => latest.get(name.toLowerCase()) || []);
    const leaders = rows.map((row) => {
      const value = numberAt(row, category.aliases);
      if (value === null) return null;
      const player = playersByExternalId.get(String(statPlayerId(row))) || null;
      return {
        playerId: statPlayerId(row) ? String(statPlayerId(row)) : null,
        name: playerName(row, player),
        team: teamName(row, player, teamsByExternalId),
        metric: category.metric,
        value,
        secondaryMetric: category.secondaryMetric,
        secondaryValue: numberAt(row, category.secondaryAliases)
      };
    }).filter(Boolean).sort((a, b) => b.value - a.value).slice(0, limit);
    return { key: category.key, title: category.title, metric: category.metric, leaders };
  });
  return categories.filter((category) => category.leaders.length);
}

export function fallbackPlayerLeaders(league, limit = 5) {
  return [{
    key: "players",
    title: "Top Players",
    metric: "Overall",
    leaders: (league.players || [])
      .slice()
      .sort((a, b) => (b.overall || 0) - (a.overall || 0))
      .slice(0, limit)
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        team: league.teams?.find((team) => team.id === player.teamId)?.abbr || null,
        metric: "Overall",
        value: player.overall || 0,
        secondaryMetric: player.position,
        secondaryValue: null
      }))
  }];
}

async function resolveSeasonAndWeek(transaction, league, input) {
  const seasonNumber = input.season || league.season || 1;
  const weekNumber = input.week || league.week || 1;
  const season = await transaction.season.upsert({
    where: { leagueId_number: { leagueId: league.databaseId, number: seasonNumber } },
    update: { isCurrent: true },
    create: { leagueId: league.databaseId, number: seasonNumber, label: `${seasonNumber} Season`, isCurrent: true }
  });
  const week = await transaction.week.upsert({
    where: { seasonId_number_phase: { seasonId: season.id, number: weekNumber, phase: "REGULAR_SEASON" } },
    update: {},
    create: { seasonId: season.id, number: weekNumber, phase: "REGULAR_SEASON" }
  });
  return { season, week };
}

async function applyImportDatasets(transaction, league, input, datasets, season, week) {
  const teamRows = datasetPayload(datasets, "Teams");
  const playerRows = datasetPayload(datasets, "Players");
  const standingRows = datasetPayload(datasets, "Standings");
  const gameRows = datasetPayload(datasets, "Schedule");
  const teamIds = new Map();

  for (const team of teamRows) {
    const row = await transaction.team.upsert({
      where: { leagueId_externalId: { leagueId: league.databaseId, externalId: team.externalId } },
      update: {
        name: team.name,
        abbreviation: team.abbreviation,
        conference: team.conference,
        division: team.division,
        primaryColor: team.primaryColor
      },
      create: {
        leagueId: league.databaseId,
        externalId: team.externalId,
        name: team.name,
        abbreviation: team.abbreviation,
        conference: team.conference,
        division: team.division,
        primaryColor: team.primaryColor
      }
    });
    teamIds.set(team.externalId, row.id);
  }

  async function teamIdFor(externalId) {
    if (!externalId) return null;
    if (teamIds.has(externalId)) return teamIds.get(externalId);
    const team = await transaction.team.findFirst({ where: { leagueId: league.databaseId, externalId } });
    if (!team) return null;
    teamIds.set(externalId, team.id);
    return team.id;
  }

  for (const player of playerRows) {
    const teamId = await teamIdFor(player.teamExternalId);
    await transaction.player.upsert({
      where: { leagueId_externalId: { leagueId: league.databaseId, externalId: player.externalId } },
      update: {
        teamId,
        name: player.name,
        position: player.position,
        overall: player.overall,
        devTrait: player.devTrait,
        age: player.age,
        attributes: player.attributes
      },
      create: {
        leagueId: league.databaseId,
        teamId,
        externalId: player.externalId,
        name: player.name,
        position: player.position,
        overall: player.overall,
        devTrait: player.devTrait,
        age: player.age,
        attributes: player.attributes
      }
    });
  }

  for (const standing of standingRows) {
    const teamId = await teamIdFor(standing.teamExternalId);
    if (!teamId) continue;
    await transaction.teamSeasonSnapshot.create({
      data: {
        leagueId: league.databaseId,
        seasonId: season.id,
        teamId,
        wins: standing.wins,
        losses: standing.losses,
        ties: standing.ties,
        pointsFor: standing.pointsFor,
        pointsAgainst: standing.pointsAgainst,
        turnoverDiff: standing.turnoverDiff
      }
    });
  }

  for (const game of gameRows) {
    const homeTeamId = await teamIdFor(game.homeTeamExternalId);
    const awayTeamId = await teamIdFor(game.awayTeamExternalId);
    if (!homeTeamId || !awayTeamId) continue;
    const status = gameStatuses.has(game.status?.toUpperCase()) ? game.status.toUpperCase() : "UNSCHEDULED";
    await transaction.game.upsert({
      where: { leagueId_externalId: { leagueId: league.databaseId, externalId: game.externalId } },
      update: {
        seasonId: season.id,
        weekId: week.id,
        homeTeamId,
        awayTeamId,
        status,
        scheduledAt: game.scheduledAt ? new Date(game.scheduledAt) : null,
        homeScore: game.homeScore,
        awayScore: game.awayScore
      },
      create: {
        leagueId: league.databaseId,
        seasonId: season.id,
        weekId: week.id,
        externalId: game.externalId,
        homeTeamId,
        awayTeamId,
        status,
        scheduledAt: game.scheduledAt ? new Date(game.scheduledAt) : null,
        homeScore: game.homeScore,
        awayScore: game.awayScore
      }
    });
  }

  return {
    teams: teamRows.length,
    players: playerRows.length,
    standings: standingRows.length,
    games: gameRows.length
  };
}

export function createPrismaRepository(client = prismaClient()) {
  async function ensureLeague(slug) {
    if (slug !== "the-trenches") return null;
    const user = await client.user.upsert({
      where: { discordId: "demo-commissioner" },
      update: { username: "coach-devin", displayName: "Coach Devin" },
      create: { discordId: "demo-commissioner", username: "coach-devin", displayName: "Coach Devin" }
    });
    const league = await client.league.upsert({
      where: { slug },
      update: { name: "The Trenches", gameType: "MADDEN" },
      create: { slug, name: "The Trenches", gameType: "MADDEN", createdById: user.id }
    });
    const season = await client.season.upsert({
      where: { leagueId_number: { leagueId: league.id, number: 1 } },
      update: { isCurrent: true },
      create: { leagueId: league.id, number: 1, label: "2026 Season", isCurrent: true }
    });
    await client.week.upsert({
      where: { seasonId_number_phase: { seasonId: season.id, number: 1, phase: "REGULAR_SEASON" } },
      update: {},
      create: { seasonId: season.id, number: 1, phase: "REGULAR_SEASON" }
    });
    return client.league.findFirst({
      where: { slug },
      include: {
        seasons: { where: { isCurrent: true }, take: 1, include: { weeks: { orderBy: { number: "desc" }, take: 1 } } },
        teams: { include: { ownerMembership: { include: { user: true } }, seasonSnapshots: { where: { season: { isCurrent: true } }, orderBy: { capturedAt: "desc" }, take: 1 } } },
        games: { where: { season: { isCurrent: true } } },
        players: true,
        importRuns: { orderBy: { createdAt: "desc" }, take: 1, include: { datasets: true } }
      }
    });
  }

  return {
    adapter: "prisma",
    async listLeagues() {
      const leagues = await client.league.findMany({
        include: { _count: { select: { teams: true } }, seasons: { where: { isCurrent: true }, take: 1 } },
        orderBy: { name: "asc" }
      });
      return leagues.map((league) => ({
        id: league.slug,
        name: league.name,
        gameType: league.gameType,
        season: league.seasons[0]?.number || null,
        teamCount: league._count.teams
      }));
    },
    async getLeague(id) {
      let row = await client.league.findFirst({
        where: { OR: [{ id }, { slug: id }] },
        include: {
          seasons: { where: { isCurrent: true }, take: 1, include: { weeks: { orderBy: { number: "desc" }, take: 1 } } },
          teams: {
            include: {
              ownerMembership: { include: { user: true } },
              seasonSnapshots: { where: { season: { isCurrent: true } }, orderBy: { capturedAt: "desc" }, take: 1 }
            }
          },
          games: { where: { season: { isCurrent: true } } },
          players: true,
          importRuns: { orderBy: { createdAt: "desc" }, take: 1, include: { datasets: true } }
        }
      });
      if (!row) row = await ensureLeague(id);
      return row ? normalizeLeague(row) : null;
    },
    getTeam(league, id) {
      return league.teams.find((team) => team.id === id || team.externalId === id);
    },
    async listMembers(league) {
      const memberships = await client.leagueMembership.findMany({
        where: { league: { id: league.databaseId } },
        include: { user: true, team: true },
        orderBy: { user: { displayName: "asc" } }
      });
      return memberships.map((membership) => ({
        id: membership.id,
        userId: membership.userId,
        displayName: membership.user.displayName,
        avatarUrl: membership.user.avatarUrl,
        teamId: membership.teamId,
        team: membership.team ? { id: membership.team.id, name: membership.team.name, abbr: membership.team.abbreviation, color: membership.team.primaryColor } : null,
        role: lower(membership.role),
        status: lower(membership.status)
      }));
    },
    async listImportRuns(league, limit = 10) {
      const runs = await client.importRun.findMany({
        where: { leagueId: league.databaseId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { league: true, datasets: true, rawExports: true }
      });
      return runs.map(normalizeImportRun);
    },
    async listStatLeaders(league, limit = 5) {
      const [rawExports, players] = await Promise.all([
        client.rawExport.findMany({
          where: { leagueId: league.databaseId, dataset: { in: statLeaderCategories.flatMap((category) => category.datasetNames) } },
          orderBy: { createdAt: "desc" },
          take: 40
        }),
        client.player.findMany({
          where: { leagueId: league.databaseId },
          include: { team: true }
        })
      ]);
      const leaders = buildStatLeaders({ rawExports, players, teams: league.teams, limit });
      return leaders.length ? leaders : fallbackPlayerLeaders(league, limit);
    },
    async listTrades(league) {
      const trades = await client.trade.findMany({
        where: { leagueId: league.databaseId },
        orderBy: { submittedAt: "desc" },
        include: { assets: true }
      });
      return trades.map(normalizeTrade);
    },
    async createTradeProposal(league, input, actorUserId) {
      const findTeam = (id) => league.teams.find((team) => team.id === id || team.externalId === id);
      const teamA = findTeam(input.teamA);
      const teamB = findTeam(input.teamB);
      if (!teamA || !teamB) throw new Error("Choose two valid teams.");
      if (teamA.id === teamB.id) throw new Error("A team cannot trade with itself.");
      const teamAAssets = input.teamAAssets || [];
      const teamBAssets = input.teamBAssets || [];
      if (!teamAAssets.length || !teamBAssets.length) throw new Error("Each side needs at least one asset.");
      const trade = await client.$transaction(async (transaction) => {
        const created = await transaction.trade.create({
          data: {
            leagueId: league.databaseId,
            teamAId: teamA.id,
            teamBId: teamB.id,
            submittedById: actorUserId || null,
            status: "NEGOTIATING",
            votesFor: 0,
            votesNeeded: 3,
            assets: {
              create: [
                ...teamAAssets.map((asset) => ({ side: "TEAM_A", label: asset.label, value: Number(asset.value || 0), type: asset.type || "asset", metadata: asset.metadata || undefined })),
                ...teamBAssets.map((asset) => ({ side: "TEAM_B", label: asset.label, value: Number(asset.value || 0), type: asset.type || "asset", metadata: asset.metadata || undefined }))
              ]
            }
          },
          include: { assets: true }
        });
        await transaction.auditLog.create({
          data: { leagueId: league.databaseId, actorUserId, action: "trade.created", entityType: "Trade", entityId: created.id, metadata: { teamA: teamA.id, teamB: teamB.id } }
        });
        return created;
      });
      return normalizeTrade(trade);
    },
    async updateTradeStatus(league, tradeId, nextStatus, actorUserId) {
      const status = nextStatus.toUpperCase();
      const data = { status };
      if (status === "APPROVED") data.votesFor = 3;
      const trade = await client.$transaction(async (transaction) => {
        const existing = await transaction.trade.findFirst({
          where: { id: tradeId, leagueId: league.databaseId },
          select: { id: true }
        });
        if (!existing) return null;
        const updated = await transaction.trade.update({
          where: { id: existing.id },
          data,
          include: { assets: true }
        });
        await transaction.auditLog.create({
          data: { leagueId: league.databaseId, actorUserId, action: "trade.status_updated", entityType: "Trade", entityId: tradeId, metadata: { status } }
        });
        return updated;
      });
      return trade ? normalizeTrade(trade) : null;
    },
    async updateMembership(league, membershipId, changes, actorUserId) {
      const data = {};
      if (changes.role !== undefined) data.role = changes.role.toUpperCase();
      if (changes.status !== undefined) data.status = changes.status.toUpperCase();
      if (changes.teamId !== undefined) data.teamId = changes.teamId;
      const membership = await client.$transaction(async (transaction) => {
        const updated = await transaction.leagueMembership.update({
          where: { id: membershipId, leagueId: league.databaseId },
          data,
          include: { user: true, team: true }
        });
        await transaction.auditLog.create({
          data: { leagueId: league.databaseId, actorUserId, action: "membership.updated", entityType: "LeagueMembership", entityId: membershipId, metadata: changes }
        });
        return updated;
      });
      return {
        id: membership.id,
        userId: membership.userId,
        displayName: membership.user.displayName,
        teamId: membership.teamId,
        team: membership.team ? { id: membership.team.id, name: membership.team.name, abbr: membership.team.abbreviation, color: membership.team.primaryColor } : null,
        role: lower(membership.role),
        status: lower(membership.status)
      };
    },
    async recordImportRun(league, input, actorUserId) {
      const datasets = normalizeImportDatasets(input.datasets);
      const status = importStatusForDatasets(datasets);
      const now = new Date();
      const run = await client.$transaction(async (transaction) => {
        const { season, week } = await resolveSeasonAndWeek(transaction, league, input);
        const created = await transaction.importRun.create({
          data: {
            leagueId: league.databaseId,
            seasonId: season?.id,
            weekId: week?.id,
            source: input.source || "manual-upload",
            status,
            startedAt: now,
            completedAt: now,
            errorMessage: status === "FAILED" ? "All datasets failed" : null
          }
        });
        for (const dataset of datasets) {
          await transaction.importDataset.create({
            data: {
              importRunId: created.id,
              name: dataset.name,
              status: dataset.status,
              recordCount: dataset.recordCount,
              errorMessage: dataset.errorMessage,
              completedAt: now
            }
          });
          await transaction.rawExport.upsert({
            where: { leagueId_sha256: { leagueId: league.databaseId, sha256: dataset.sha256 } },
            create: {
              leagueId: league.databaseId,
              seasonId: season?.id,
              weekId: week?.id,
              importRunId: created.id,
              dataset: dataset.name,
              source: input.source || "manual-upload",
              sha256: dataset.sha256,
              storageKey: rawExportStorageKey({ leagueId: league.id, season: input.season || league.season, week: input.week || league.week, dataset: dataset.name, sha256: dataset.sha256 }),
              payload: dataset.payload
            },
            update: { importRunId: created.id }
          });
        }
        const applied = await applyImportDatasets(transaction, league, input, datasets, season, week);
        await transaction.auditLog.create({
          data: {
            leagueId: league.databaseId,
            actorUserId,
            action: "import.recorded",
            entityType: "ImportRun",
            entityId: created.id,
            metadata: { source: input.source || "manual-upload", status, applied, datasets: datasets.map(({ name, status: datasetStatus, recordCount }) => ({ name, status: datasetStatus, recordCount })) }
          }
        });
        return transaction.importRun.findUnique({
          where: { id: created.id },
          include: { league: true, datasets: true, rawExports: true }
        });
      }, { maxWait: 10000, timeout: 30000 });
      return normalizeImportRun(run);
    },
    async upsertDiscordUser(profile) {
      const avatarUrl = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null;
      const user = await client.user.upsert({
        where: { discordId: profile.id },
        create: { discordId: profile.id, username: profile.username, displayName: profile.global_name || profile.username, avatarUrl },
        update: { username: profile.username, displayName: profile.global_name || profile.username, avatarUrl },
        include: { memberships: { include: { league: true } } }
      });
      return normalizeUser(user);
    },
    async bootstrapOwnerMembership(league, userId, teamExternalId = "buf") {
      const membership = await client.$transaction(async (transaction) => {
        const team = await transaction.team.findFirst({
          where: { leagueId: league.databaseId, externalId: teamExternalId }
        });
        const updated = await transaction.leagueMembership.upsert({
          where: { leagueId_userId: { leagueId: league.databaseId, userId } },
          update: { role: "COMMISSIONER", status: "ACTIVE", teamId: team?.id, joinedAt: new Date() },
          create: { leagueId: league.databaseId, userId, role: "COMMISSIONER", status: "ACTIVE", teamId: team?.id, joinedAt: new Date() },
          include: { user: true, team: true }
        });
        await transaction.auditLog.create({
          data: {
            leagueId: league.databaseId,
            actorUserId: userId,
            action: "membership.bootstrap_owner",
            entityType: "LeagueMembership",
            entityId: updated.id,
            metadata: { teamExternalId }
          }
        });
        return updated;
      });
      return {
        id: membership.id,
        userId: membership.userId,
        displayName: membership.user.displayName,
        teamId: membership.teamId,
        team: membership.team ? { id: membership.team.id, name: membership.team.name, abbr: membership.team.abbreviation, color: membership.team.primaryColor } : null,
        role: lower(membership.role),
        status: lower(membership.status)
      };
    },
    async createSession(userId) {
      const session = await client.session.create({
        data: { userId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
      });
      return session.id;
    },
    async getSessionIdentity(sessionId) {
      const session = await client.session.findFirst({
        where: { id: sessionId, expiresAt: { gt: new Date() } },
        include: { user: { include: { memberships: { include: { league: true } } } } }
      });
      if (!session) return null;
      await client.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } });
      return normalizeUser(session.user);
    },
    async deleteSession(sessionId) {
      await client.session.deleteMany({ where: { id: sessionId } });
    }
  };
}
