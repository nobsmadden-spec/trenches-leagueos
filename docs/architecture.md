# Architecture decisions

## API-centered product

The API owns access to league state. Discord, web, jobs, and mobile are clients. This prevents calculations and permissions from being copied into each surface.

## Shared league rules

`packages/league-core` contains deterministic, side-effect-free calculations. The current playoff MVP orders division leaders before wildcards and uses win percentage, conference record, division record, point differential, points scored, then team name. Head-to-head, common-game, and strength-of-victory tiebreakers remain a production milestone.

## Replaceable importers

`packages/ea-importer` owns the boundary around external game data. It stores untouched payloads first. Versioned normalization adapters should follow after a real export sample is available. No API route or league calculation depends directly on EA response shapes.

## Production data ownership

The in-memory repository is an evaluation adapter. Its interface is intentionally small so Prisma/PostgreSQL can replace it. Every production entity should carry `leagueId`; season-scoped records should also carry `seasonId`, and week-scoped records should carry `weekId`.

## Security model

Discord OAuth belongs in the API. API authorization must verify league membership and role (`member`, `commissioner`, `admin`) for every mutation. Bot credentials and EA tokens must never enter browser code or raw export records.

OAuth state and development sessions are signed with HMAC and delivered through HTTP-only, same-site cookies. Production sessions must use the `Session` table so they can be revoked; the cookie should contain only an opaque session identifier once the Prisma repository is active.
