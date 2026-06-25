# Delivery phases

## Phase 1: Foundation

Phase 1 is complete only when the platform has durable storage and real identity, not merely a convincing demo.

- [x] API-centered service boundary
- [x] Shared standings, playoff, and power-ranking logic
- [x] Responsive web dashboard
- [x] Role-aware coach and commissioner workspace contracts
- [x] Team, trade, media, sync-health, and action-queue API contracts
- [x] Discord bot API adapter boundary
- [x] Replaceable EA importer boundary with raw export preservation
- [x] PostgreSQL/Prisma schema and baseline migration authored
- [x] Discord OAuth routes, signed sessions, identity endpoint, and logout
- [x] Durable users, league memberships, roles, and team assignments
- [x] Discord bot process registering `/standings` against the central API
- [x] Authorization tests for coach, commissioner, and public access
- [x] Production configuration baseline, membership audit logging, and deployment readiness endpoint
- [x] Prisma repository adapter preserving the existing API contract
- [x] Opaque database-backed sessions when the Prisma adapter is active
- [x] Commissioner membership management API and League Office workflow
- [x] Import-run recording with dataset status, raw export fingerprints, and audit metadata
- [x] Apply and seed the migration against a running PostgreSQL service
- [ ] Validate authenticated Discord identities and membership changes against live services

Current status: Phase 1 production foundation is active locally. Final live validation is Discord login plus `/standings` in a development server.

## Immediate next milestone

Finish the production foundation:

1. Connect Discord identities to commissioner-managed league memberships.
2. Validate `/standings` in a real Discord development server.
3. Exercise deployment readiness with production configuration and audit events.

## Phase 2: Madden data import

Start Phase 2 only after the Phase 1 gate above passes. Connect a versioned clean-room EA adapter to real export acquisition, replay imports, normalize the initial datasets, and test partial/failing imports.

- [x] Define `leagueos-import/v1` bundle contract for teams, players, standings, and games
- [x] Accept import bundles through the commissioner import-run API
- [x] Preserve raw bundle datasets with deterministic fingerprints
- [x] Apply normalized bundle data into durable teams, players, standings snapshots, and games
- [x] Add commissioner upload UI
- [x] Add import history detail view
- [x] Add CSV-to-bundle mapper for commissioner-owned exports
- [x] Add browser CSV upload path for teams, players, standings, and games
- [x] Add Snallabot-shaped export adapter for teams, standings, schedules, and rosters
- [ ] Connect a real Madden export acquisition source

Snallabot reference decision: reuse their workflow as an acquisition/export source where possible. The Trenches should ingest exported league data, preserve the raw payload, and normalize it into LeagueOS datasets rather than duplicating EA login, persona selection, queueing, and command code.
