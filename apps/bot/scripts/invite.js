import { PermissionFlagsBits } from "discord.js";
import { loadEnvFile } from "../../../packages/config/src/env.js";

await loadEnvFile(undefined, { override: true });

const applicationId = process.env.DISCORD_CLIENT_ID;

if (!applicationId) {
  console.error("DISCORD_CLIENT_ID is required in .env");
  process.exit(1);
}

const permissions = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory
].reduce((total, permission) => total | permission, 0n);

function inviteUrl({ base = "https://discord.com/oauth2/authorize", permissionValue = permissions.toString() } = {}) {
  const url = new URL(base);
  url.searchParams.set("client_id", applicationId.trim());
  url.searchParams.set("permissions", permissionValue);
  url.searchParams.set("scope", "bot applications.commands");
  return url.toString().replace("bot+applications.commands", "bot%20applications.commands");
}

console.log("Primary invite URL:");
console.log(inviteUrl());
console.log("");
console.log("Fallback invite URL:");
console.log(inviteUrl({ base: "https://discord.com/api/oauth2/authorize" }));
console.log("");
console.log("Minimal-permissions invite URL:");
console.log(inviteUrl({ permissionValue: "0" }));
