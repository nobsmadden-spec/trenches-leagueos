import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const sessionCookie = "trenches_session";
const defaultSessionSeconds = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return "leagueos-development-only-secret";
}

function signature(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyPayload(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, supplied] = token.split(".");
  const expected = signature(encoded);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator === -1 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  }));
}

export function sessionFromRequest(request) {
  return verifyPayload(cookies(request.headers.cookie)[sessionCookie]);
}

export function createSessionCookie(identity, maxAge = defaultSessionSeconds) {
  const token = signPayload({ ...identity, expiresAt: Date.now() + maxAge * 1000 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie() {
  return `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function createOAuthState(returnTo = "/") {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return signPayload({ nonce: randomBytes(16).toString("hex"), returnTo: safeReturnTo, expiresAt: Date.now() + 10 * 60 * 1000 });
}

export function discordAuthorizationUrl(state) {
  if (!process.env.DISCORD_CLIENT_ID) return null;
  const redirectUri = (process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/api/auth/discord/callback").trim();
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID.trim(),
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify",
    state
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString().replaceAll("+", "%20")}`;
}

export async function exchangeDiscordCode(code) {
  const redirectUri = (process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/api/auth/discord/callback").trim();
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID?.trim() || "",
    client_secret: process.env.DISCORD_CLIENT_SECRET?.trim() || "",
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!tokenResponse.ok) throw new Error(`Discord token exchange failed (${tokenResponse.status})`);
  const token = await tokenResponse.json();
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  if (!userResponse.ok) throw new Error(`Discord user lookup failed (${userResponse.status})`);
  return userResponse.json();
}

export function hasLeagueRole(identity, leagueId, requestedRole = "coach") {
  const membership = identity?.memberships?.find((entry) => entry.leagueId === leagueId && entry.status === "active");
  if (!membership) return false;
  if (requestedRole === "coach") return ["coach", "commissioner", "admin"].includes(membership.role);
  if (requestedRole === "commissioner") return ["commissioner", "admin"].includes(membership.role);
  return membership.role === "admin";
}

export function demoIdentity(league) {
  return {
    id: league.demoUser.id,
    discordId: league.demoUser.discordId || "demo-commissioner",
    displayName: league.demoUser.displayName,
    avatarUrl: null,
    memberships: [{ leagueId: league.id, teamId: league.demoUser.teamId, role: "commissioner", status: "active" }]
  };
}
