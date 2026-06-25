import test from "node:test";
import assert from "node:assert/strict";
import { createSessionCookie, hasLeagueRole, sessionFromRequest, signPayload, verifyPayload } from "../src/auth.js";

test("signed payloads reject modification and expiration", () => {
  const valid = signPayload({ id: "u1", expiresAt: Date.now() + 1000 });
  assert.equal(verifyPayload(valid).id, "u1");
  assert.equal(verifyPayload(`${valid}changed`), null);
  assert.equal(verifyPayload(signPayload({ id: "u1", expiresAt: Date.now() - 1 })), null);
});

test("session cookies are HTTP-only and recover identity", () => {
  const cookie = createSessionCookie({ id: "u1", memberships: [] });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const token = cookie.match(/^trenches_session=([^;]+)/)[1];
  const identity = sessionFromRequest({ headers: { cookie: `trenches_session=${token}` } });
  assert.equal(identity.id, "u1");
});

test("league authorization enforces active membership and role hierarchy", () => {
  const coach = { memberships: [{ leagueId: "l1", role: "coach", status: "active" }] };
  const commissioner = { memberships: [{ leagueId: "l1", role: "commissioner", status: "active" }] };
  assert.equal(hasLeagueRole(coach, "l1", "coach"), true);
  assert.equal(hasLeagueRole(coach, "l1", "commissioner"), false);
  assert.equal(hasLeagueRole(commissioner, "l1", "commissioner"), true);
  assert.equal(hasLeagueRole(commissioner, "other", "coach"), false);
});
