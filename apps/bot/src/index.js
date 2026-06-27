import { Client, EmbedBuilder, GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, ThreadAutoArchiveDuration } from "discord.js";
import { loadEnvFile } from "../../../packages/config/src/env.js";
import { createLeagueCommands } from "./commands.js";
import { matchupFields, rosterFields, standingsFields } from "./formatters.js";
import { gameThreadEmbed, gameThreadName, openGamesForThreads } from "./thread-builder.js";

await loadEnvFile(undefined, { override: true });

const token = process.env.DISCORD_BOT_TOKEN?.trim();
const applicationId = process.env.DISCORD_CLIENT_ID?.trim();
const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const defaultLeagueId = process.env.LEAGUE_ID || "the-trenches";

if (!token || !applicationId) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required");
  process.exit(1);
}

const standingsCommand = new SlashCommandBuilder()
  .setName("standings")
  .setDescription("Show the current league standings")
  .addStringOption((option) => option.setName("league").setDescription("League slug").setRequired(false));
const matchupsCommand = new SlashCommandBuilder()
  .setName("matchups")
  .setDescription("Show the current matchup board")
  .addStringOption((option) => option.setName("league").setDescription("League slug").setRequired(false));
const rosterCommand = new SlashCommandBuilder()
  .setName("roster")
  .setDescription("Show an imported team roster")
  .addStringOption((option) => option.setName("team").setDescription("Team abbreviation or name, such as BUF").setRequired(true))
  .addStringOption((option) => option.setName("league").setDescription("League slug").setRequired(false));
const createThreadsCommand = new SlashCommandBuilder()
  .setName("create-game-threads")
  .setDescription("Create this week's matchup threads in the current channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
  .addStringOption((option) => option.setName("league").setDescription("League slug").setRequired(false));
const slashCommands = [standingsCommand, matchupsCommand, rosterCommand, createThreadsCommand];
const leagueCommands = createLeagueCommands({ apiBaseUrl });

const rest = new REST({ version: "10" }).setToken(token);
try {
  await rest.put(Routes.applicationCommands(applicationId), { body: slashCommands.map((command) => command.toJSON()) });
  console.log("Registered /standings, /matchups, /roster, and /create-game-threads commands with Discord.");
} catch (error) {
  console.error(`Unable to register Discord commands: ${error.message}`);
  if (error.status === 401 || String(error.message).includes("401")) {
    console.error("Discord rejected DISCORD_BOT_TOKEN. Reset the token on the Bot page for the same app as DISCORD_CLIENT_ID.");
  }
  if (error.status === 403 || String(error.message).includes("403")) {
    console.error("Discord accepted the token but denied command registration. Check the application ID and bot permissions.");
  }
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once("clientReady", () => {
  console.log(`The Trenches bot connected as ${client.user.tag}`);
  console.log(`Visible Discord servers: ${client.guilds.cache.size}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || !slashCommands.some((command) => command.name === interaction.commandName)) return;
  await interaction.deferReply();
  try {
    const leagueId = interaction.options.getString("league") || defaultLeagueId;
    if (interaction.commandName === "create-game-threads") {
      if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) {
        throw new Error("Manage Threads permission is required");
      }
      if (!interaction.channel?.threads?.create) throw new Error("Run this command in a server text channel");
      const games = openGamesForThreads(await leagueCommands.matchups(leagueId));
      const active = await interaction.channel.threads.fetchActive();
      const existingNames = new Set([...active.threads.values()].map((thread) => thread.name));
      let created = 0;
      let skipped = 0;
      for (const game of games) {
        const name = gameThreadName(game);
        if (existingNames.has(name)) {
          skipped += 1;
          continue;
        }
        const thread = await interaction.channel.threads.create({
          name,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          reason: `LeagueOS Week ${game.week || "--"} matchup thread`
        });
        await thread.send({ embeds: [new EmbedBuilder(gameThreadEmbed(game))] });
        existingNames.add(name);
        created += 1;
      }
      await interaction.editReply(`Game threads complete: ${created} created, ${skipped} already existed, ${games.length} open matchups checked.`);
      return;
    }
    let title;
    let description;
    let fields;
    if (interaction.commandName === "standings") {
      title = "The Trenches Standings";
      description = "Live division records from LeagueOS";
      fields = standingsFields(await leagueCommands.standings(leagueId));
    } else if (interaction.commandName === "matchups") {
      title = "The Trenches Matchup Board";
      description = "Live schedule and game status from LeagueOS";
      fields = matchupFields(await leagueCommands.matchups(leagueId));
    } else {
      const query = interaction.options.getString("team", true).trim().toLowerCase();
      const teams = await leagueCommands.teamList(leagueId);
      const team = teams.find((entry) => entry.abbr?.toLowerCase() === query || entry.name?.toLowerCase() === query || entry.name?.toLowerCase().includes(query));
      if (!team) throw new Error(`Team "${query}" was not found`);
      const roster = await leagueCommands.roster(leagueId, team.id);
      title = `${team.abbr} | ${team.name} Roster`;
      description = `${roster.roster?.length || 0} imported players | ${roster.conference} ${roster.division}`;
      fields = rosterFields(roster);
      if (!fields.length) fields = [{ name: "Roster", value: "No imported players are available for this team.", inline: false }];
    }
    const embed = new EmbedBuilder().setColor(0xd6a94b).setTitle(title).setDescription(description).addFields(fields).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const label = { standings: "Standings", matchups: "Matchups", roster: "Roster", "create-game-threads": "Game thread creation" }[interaction.commandName] || "Command";
    await interaction.editReply(`${label} is unavailable right now: ${error.message}`);
  }
});

try {
  await client.login(token);
} catch (error) {
  console.error(`Unable to log in Discord bot: ${error.message}`);
  if (String(error.message).includes("TokenInvalid") || String(error.message).includes("invalid token")) {
    console.error("The bot token is invalid or stale. Reset it on the Discord Developer Portal Bot page.");
  }
  process.exit(1);
}
