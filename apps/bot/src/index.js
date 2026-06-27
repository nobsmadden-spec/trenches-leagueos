import { Client, EmbedBuilder, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { loadEnvFile } from "../../../packages/config/src/env.js";
import { createLeagueCommands } from "./commands.js";
import { matchupFields, standingsFields } from "./formatters.js";

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
const slashCommands = [standingsCommand, matchupsCommand];
const leagueCommands = createLeagueCommands({ apiBaseUrl });

const rest = new REST({ version: "10" }).setToken(token);
try {
  await rest.put(Routes.applicationCommands(applicationId), { body: slashCommands.map((command) => command.toJSON()) });
  console.log("Registered /standings and /matchups commands with Discord.");
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
    const isStandings = interaction.commandName === "standings";
    const data = isStandings ? await leagueCommands.standings(leagueId) : await leagueCommands.matchups(leagueId);
    const embed = new EmbedBuilder().setColor(0xd6a94b)
      .setTitle(isStandings ? "The Trenches Standings" : "The Trenches Matchup Board")
      .setDescription(isStandings ? "Live division records from LeagueOS" : "Live schedule and game status from LeagueOS")
      .addFields(isStandings ? standingsFields(data) : matchupFields(data))
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply(`${interaction.commandName === "standings" ? "Standings" : "Matchups"} are unavailable right now: ${error.message}`);
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
