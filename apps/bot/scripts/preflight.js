import { REST, Routes, PermissionFlagsBits } from "discord.js";
import { loadEnvFile } from "../../../packages/config/src/env.js";

await loadEnvFile(undefined, { override: true });

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_CLIENT_ID;

if (!token || !applicationId) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required in .env");
  process.exit(1);
}

const trimmedToken = token.trim();
const tokenSections = trimmedToken.split(".");
const looksLikeClientSecret = /^[A-Za-z0-9_-]{32,}$/.test(trimmedToken) && !trimmedToken.includes(".");

if (token !== trimmedToken) {
  console.error("DISCORD_BOT_TOKEN has leading or trailing whitespace. Remove the extra space/newline and try again.");
  process.exit(1);
}

if (looksLikeClientSecret) {
  console.error("DISCORD_BOT_TOKEN looks like a client secret, not a bot token. Copy the token from Developer Portal > Bot > Reset Token.");
  process.exit(1);
}

if (tokenSections.length !== 3) {
  console.warn(`Warning: DISCORD_BOT_TOKEN has ${tokenSections.length} section(s). Discord will validate it directly.`);
}

const permissions = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory
].reduce((total, permission) => total | permission, 0n);

const inviteUrl = new URL("https://discord.com/oauth2/authorize");
inviteUrl.searchParams.set("client_id", applicationId);
inviteUrl.searchParams.set("scope", "bot applications.commands");
inviteUrl.searchParams.set("permissions", permissions.toString());
const inviteUrlText = inviteUrl.toString().replace("bot+applications.commands", "bot%20applications.commands");

try {
  const rest = new REST({ version: "10" }).setToken(trimmedToken);
  const application = await rest.get(Routes.oauth2CurrentApplication());
  const bot = await rest.get(Routes.user("@me"));
  console.log(`Discord application: ${application.name} (${application.id})`);
  console.log(`Bot user: ${bot.username}#${bot.discriminator} (${bot.id})`);
  console.log("");
  console.log("Invite URL:");
  console.log(inviteUrlText);
  console.log("");
  console.log("After inviting the bot, keep it online with:");
  console.log("  pnpm bot:start");
} catch (error) {
  console.error(`Discord bot preflight failed: ${error.message}`);
  if (error.status === 401 || String(error.message).includes("401")) {
    console.error("Discord rejected DISCORD_BOT_TOKEN. Reset and copy the token from Developer Portal > Bot > Reset Token.");
    console.error("Make sure it is not the OAuth2 client secret, public key, or application ID.");
  }
  console.error("");
  console.error("Invite URL, if you want to invite the application while fixing the token:");
  console.error(inviteUrlText);
  process.exit(1);
}
