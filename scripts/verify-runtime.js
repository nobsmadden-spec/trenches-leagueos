import { request } from "node:http";

const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const leagueId = process.env.LEAGUE_ID || "the-trenches";

function check(path) {
  return new Promise((resolve) => {
    const req = request(`${baseUrl}${path}`, { timeout: 2500 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ path, status: res.statusCode, body }));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ path, status: 0, body: "Request timed out" });
    });
    req.on("error", (error) => resolve({ path, status: 0, body: error.message }));
    req.end();
  });
}

function ok(label, detail) {
  return { ok: true, label, detail };
}

function fail(label, detail) {
  return { ok: false, label, detail };
}

function parseJson(result) {
  try {
    return JSON.parse(result.body);
  } catch {
    return null;
  }
}

const results = [];

const health = await check("/api/health");
results.push(health.status === 200 ? ok("API health", "health endpoint answered") : fail("API health", `${health.status || "no response"} from ${baseUrl}/api/health`));

const script = await check("/app.js");
results.push(script.status === 200 && script.body.includes("Announcement cards are waiting on the latest API deploy")
  ? ok("Browser assets", "latest Media Room fallback code is served")
  : fail("Browser assets", "app.js does not include the latest Media Room fallback code"));

const mediaDrafts = await check(`/api/leagues/${leagueId}/media-drafts`);
const mediaJson = parseJson(mediaDrafts);
results.push(mediaDrafts.status === 200 && Array.isArray(mediaJson) && mediaJson.some((draft) => draft.id === "weekly-announcement")
  ? ok("Media drafts API", "Discord-ready cards are available")
  : fail("Media drafts API", `${mediaDrafts.status || "no response"} from /media-drafts; restart or redeploy the API`));

const recognition = await check(`/api/leagues/${leagueId}/recognition`);
const recognitionJson = parseJson(recognition);
results.push(
  recognition.status === 200 && Array.isArray(recognitionJson?.scorecard)
    ? ok("Recognition API", "weekly coach scorecard is available")
    : recognition.status === 401 || recognition.status === 403
      ? ok("Recognition API", "route exists but requires sign-in")
      : fail("Recognition API", `${recognition.status || "no response"} from /recognition; restart or redeploy the API`)
);

console.log(`\nLeagueOS runtime verification\nBase URL: ${baseUrl}\n`);
for (const result of results) {
  console.log(`${result.ok ? "OK " : "NO "} ${result.label}: ${result.detail}`);
}

const failures = results.filter((result) => !result.ok);
if (failures.length) {
  console.log("\nRuntime is not fully current. Restart the local server or wait for Render to finish deploying the latest commit.");
  process.exitCode = 1;
} else {
  console.log("\nRuntime is current.");
}
