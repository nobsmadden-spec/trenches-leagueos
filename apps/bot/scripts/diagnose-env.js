import { loadEnvFile } from "../../../packages/config/src/env.js";

await loadEnvFile(undefined, { override: true });

function describeSecret(name) {
  const value = process.env[name] || "";
  const trimmed = value.trim();
  const sections = trimmed ? trimmed.split(".") : [];
  return {
    name,
    present: Boolean(value),
    length: value.length,
    trimmedLength: trimmed.length,
    sections: sections.length,
    sectionLengths: sections.map((section) => section.length),
    hasWhitespace: value !== trimmed,
    hasBotPrefix: trimmed.startsWith("Bot "),
    looksPlaceholder: /your-|paste-|token|secret|client/i.test(trimmed),
    startsLikeMfaToken: trimmed.startsWith("mfa.")
  };
}

const clientId = process.env.DISCORD_CLIENT_ID || "";

console.log(JSON.stringify({
  DISCORD_CLIENT_ID: {
    present: Boolean(clientId),
    length: clientId.length,
    numeric: /^\d+$/.test(clientId),
    value: clientId ? `${clientId.slice(0, 4)}...${clientId.slice(-4)}` : null
  },
  DISCORD_BOT_TOKEN: describeSecret("DISCORD_BOT_TOKEN"),
  DISCORD_CLIENT_SECRET: describeSecret("DISCORD_CLIENT_SECRET")
}, null, 2));
