import { access, constants, statfs } from "node:fs/promises";
import { request } from "node:http";
import { basename } from "node:path";
import { spawn } from "node:child_process";
import { loadEnvFile } from "../packages/config/src/env.js";

const cwd = new URL("..", import.meta.url);
const minFreeBytes = 1024 * 1024 * 1024;
const requiredEnv = ["SESSION_SECRET", "DATABASE_URL", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"];

function pass(label, detail) {
  return { ok: true, label, detail };
}

function fail(label, detail) {
  return { ok: false, label, detail };
}

function formatBytes(bytes) {
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes > 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function fileExists(path) {
  try {
    await access(new URL(path, cwd), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function commandSucceeds(command) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", command], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function healthCheck(url) {
  return new Promise((resolve) => {
    const req = request(url, { timeout: 1500 }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 500));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

const checks = [];
const loadedEnv = await loadEnvFile();

const stats = await statfs(cwd);
const freeBytes = stats.bavail * stats.bsize;
checks.push(freeBytes >= minFreeBytes
  ? pass("Disk space", `${formatBytes(freeBytes)} free`)
  : fail("Disk space", `${formatBytes(freeBytes)} free; clear at least ${formatBytes(minFreeBytes)} before database activation`));

const major = Number(process.versions.node.split(".")[0]);
checks.push(major >= 20 ? pass("Node.js", process.version) : fail("Node.js", `${process.version}; Node 20+ required`));

checks.push(await fileExists("node_modules")
  ? pass("Dependencies", "node_modules present")
  : fail("Dependencies", "run pnpm install after freeing disk space"));

checks.push(loadedEnv
  ? pass("Local env file", ".env loaded")
  : fail("Local env file", ".env not found; copy .env.example to .env and fill in real values"));

const hasPsql = await commandAvailable("psql");
const hasPostgres = await commandAvailable("postgres");
const hasDocker = await commandAvailable("docker");
const canUseDocker = hasDocker && await commandSucceeds("docker info");
checks.push(hasPsql ? pass("Postgres client", "psql available") : pass("Postgres client", "psql not found; Prisma can still run migrations"));
checks.push(hasDocker
  ? canUseDocker ? pass("Docker daemon", "Docker is reachable") : fail("Docker daemon", "Docker is installed but this shell cannot reach the Docker daemon")
  : pass("Docker daemon", "Docker not installed; local postgres can still satisfy durable mode"));
checks.push(hasPostgres || canUseDocker
  ? pass("Database runtime", hasPostgres ? "local postgres binary available" : "Docker available for docker-compose.yml")
  : fail("Database runtime", "neither postgres nor Docker is available"));

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
checks.push(missingEnv.length
  ? fail("Production env", `missing ${missingEnv.join(", ")}`)
  : pass("Production env", "required production variables are set"));

const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
checks.push(await healthCheck(`${apiBaseUrl}/api/ready`)
  ? pass("Local API", `${apiBaseUrl}/api/ready answered`)
  : pass("Local API", `${apiBaseUrl}/api/ready is not running yet`));

console.log(`\n${basename(process.cwd())} activation preflight\n`);
for (const check of checks) {
  console.log(`${check.ok ? "OK " : "NO "} ${check.label}: ${check.detail}`);
}

const failures = checks.filter((check) => !check.ok);
if (failures.length) {
  console.log(`\nBlocked by ${failures.length} item${failures.length === 1 ? "" : "s"}. Fix those, then run:`);
  console.log("  pnpm db:deploy && pnpm db:seed");
  console.log("  REPOSITORY_ADAPTER=prisma DEMO_MODE=false pnpm start");
  process.exitCode = 1;
} else {
  console.log("\nReady for Phase 1 activation.");
}
