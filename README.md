# The Trenches LeagueOS

A runnable Phase 1 foundation for a league operating system. The API is the center of the product; the web dashboard and future Discord/mobile clients consume the same league logic.

This repository currently demonstrates the Phase 1 product experience. It is not yet production-complete; see `docs/phase-plan.md` for the remaining persistence, identity, authorization, and bot milestones.

## Included

- Responsive league media dashboard
- JSON API for league summary, standings, playoff race, games, power rankings, teams, and players
- Shared standings and playoff calculations with deterministic tiebreakers
- Product blueprint organized around the Live League Hub, automated game threads, scouting and draft tools, Trade Center, coach onboarding, weekly content, and engagement systems
- Demo Madden league data so the product runs before EA credentials or Postgres are connected
- Importer boundary that preserves raw exports before normalization
- Discord command adapter examples
- Automated tests for the highest-risk league calculations

## Run

Requires Node.js 20 or newer.

```bash
pnpm install
pnpm test
pnpm preflight
pnpm start
```

Open `http://localhost:3000`. The API health check is at `http://localhost:3000/api/health`.
Deployment readiness is reported separately at `http://localhost:3000/api/ready`; production readiness requires configured Discord credentials and the Prisma repository adapter.

The website is served by the API process; opening `index.html` directly will not load league data. Start the app first, then use the localhost address above.

## Architecture

```text
apps/web  ---------\
apps/bot  ----------> apps/api --> packages/league-core --> storage
future mobile ------/                  ^
                                     |
                              packages/ea-importer
```

The memory adapter keeps local evaluation simple. Set `REPOSITORY_ADAPTER=prisma` after PostgreSQL is migrated and seeded to activate durable storage. Discord OAuth and the bot remain credential-gated through environment variables.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service health |
| GET | `/api/ready` | Deployment readiness and active adapters |
| GET | `/api/me` | Current signed-in identity and memberships |
| GET | `/api/leagues` | Available leagues |
| GET | `/api/leagues/:id` | Dashboard summary |
| GET | `/api/leagues/:id/standings` | Division standings |
| GET | `/api/leagues/:id/playoff-race` | Seeded conferences |
| GET | `/api/leagues/:id/power-rankings` | Ranked teams |
| GET | `/api/leagues/:id/games` | Current games |
| GET | `/api/leagues/:id/teams` | League teams |
| GET | `/api/leagues/:id/players?q=` | Player search |
| POST | `/api/leagues/:id/import-runs` | Commissioner-only import run recording with dataset status and raw payload fingerprints |

Import runs accept explicit `datasets`, a `leagueos-import/v1` bundle, a Snallabot-shaped `snallabot-export/v1` bundle, or a commissioner-submitted export URL. See `examples/imports/leagueos-import-v1.sample.json` for the clean-room contract and `examples/imports/snallabot-export-v1.sample.json` for the EA export shape we can ingest without duplicating Snallabot's acquisition workflow.

In League Office, paste a Snallabot export URL into **Snallabot Export URL** and click **Import From URL**. The API fetches the JSON, normalizes it through the same importer, fingerprints raw datasets, and records the import run.

Snallabot can also push exports into LeagueOS. Add this receiver base URL to Snallabot's **Add Export URL** field:

```text
https://your-public-domain.example/api/import-receivers/snallabot/the-trenches/token/your-token
```

Set `SNALLABOT_WEBHOOK_TOKEN` in `.env` to require the token. Snallabot appends dataset paths like `/ps5/{leagueId}/leagueteams` and `/ps5/{leagueId}/team/{teamId}/roster`, so the token belongs in the path instead of a query string. Snallabot needs a public URL, so `http://localhost:3000/...` only works for your browser, not for Snallabot's servers.

CSV files can be converted into that bundle shape:

```bash
pnpm import:csv:bundle -- --teams=examples/imports/csv/teams.csv --players=examples/imports/csv/players.csv --standings=examples/imports/csv/standings.csv --games=examples/imports/csv/games.csv --season=2 --week=11 --out=work/import-bundle.json
```

## Next production milestone

1. Apply and seed the baseline migration against a running PostgreSQL service.
2. Connect Discord identities to commissioner-managed memberships.
3. Validate the registered `/standings` command in a Discord development server.
4. Connect a real Madden export acquisition source; Snallabot-shaped exports can already be ingested through the import API.
5. Add durable jobs with Redis/BullMQ for imports, notifications, and weekly channel creation.

## Render deployment

Render deployment is configured in `render.yaml`. See `docs/render-deploy.md` for the click-by-click setup and the Snallabot receiver URL format.

## Durable mode

With PostgreSQL available:

```bash
pnpm preflight
pnpm db:deploy
pnpm db:seed
REPOSITORY_ADAPTER=prisma DEMO_MODE=false pnpm start
```

If Docker is available in your normal terminal but not inside Codex, run the one-command local activation helper:

```bash
./scripts/activate-phase1.sh
```

Then start the app against the durable database:

```bash
./scripts/start-durable.sh
```

To grant your real Discord account commissioner access, add `LEAGUE_OWNER_DISCORD_ID` to `.env` using your Discord user ID, restart the website, sign in, then call the owner bootstrap endpoint from the signed-in browser session.

Start the Discord client after setting `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID`:

```bash
pnpm bot:preflight
pnpm bot:start
```

If the bot does not appear in Discord, run `pnpm bot:preflight` and open the printed invite URL. The bot process must stay running in a terminal for it to show online.

Do not copy GPL source into this repository unless the project intentionally adopts compatible licensing. Treat EA data acquisition as replaceable infrastructure.
