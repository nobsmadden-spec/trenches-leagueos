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
- [x] Connect Snallabot as the real Madden export acquisition source

Snallabot reference decision: reuse their workflow as an acquisition/export source where possible. The Trenches should ingest exported league data, preserve the raw payload, and normalize it into LeagueOS datasets rather than duplicating EA login, persona selection, queueing, and command code.

## Phase 3: AI content and league intelligence

Do not interrupt the active import, roster, and trade workflow for this phase. Begin after live roster and weekly-stat data are consistently normalized and visible across web and Discord.

### Analytics foundation

- [x] Build deterministic team tendency profiles from imported standings, game, and roster data
- [ ] Build matchup comparison models for offense, defense, key personnel, injuries/availability, recent form, and coach activity (core comparison is live; injury and direct coach-activity feeds remain pending)
- [ ] Build opponent-specific game-plan inputs with strengths, pressure points, counters, and measurable supporting evidence
- [ ] Connect spendable recognition perks to gated analytics products: offensive game plan, defensive game plan, opponent tendency report, scouting focus, and draft war-room intel
- [ ] Record perk purchases, generated outputs, data version, season, week, matchup, and expiration so advice is auditable
- [ ] Keep calculations deterministic; AI explains and packages the results but does not invent statistics or unsupported certainty

### Generated weekly content

- [ ] Game of the Week package: branded AI-generated visual, NFL-style matchup preview, coach tags, key players, statistical edges, prediction, stream link, and Discord-ready copy
- [ ] Weekly recap package: scores, turning points, standout performances, awards, standings movement, playoff impact, and next-week hooks
- [ ] Reporter posts: distinct reporter voices, rumors clearly labeled as commentary, transaction reactions, coach quotes, and evolving league storylines
- [ ] Props package: virtual-currency player/team props, transparent source statistics, settlement rules, and responsible non-cash framing
- [ ] Season statistics package: leaderboards, pace projections, records watch, historical comparisons, and award races
- [ ] Generate web cards and Discord posts from the same structured content record so facts remain consistent across surfaces

### Visual and publishing system

- [ ] Create reusable branded templates for GOTW, weekly awards, recaps, power rankings, playoff pictures, draft grades, and record alerts
- [ ] Support AI-generated backgrounds and editorial art while keeping team marks, player names, scores, and statistics in controlled layout layers
- [ ] Add commissioner preview, regenerate, edit, approve, schedule, and publish controls
- [ ] Publish through configured Discord channels with role mentions, image attachments, embeds, and links back to LeagueOS
- [ ] Preserve every prompt, input fingerprint, output version, approval event, and published message ID

### Phase 3 acceptance gate

1. No generated post may cite a statistic that is absent from the normalized league dataset.
2. Every preview and game plan must show its data week and last import time.
3. Spendable perks must produce private, matchup-specific value and cannot expose another coach's private report.
4. Props remain virtual-currency only and settle from imported final results.
5. Commissioners can edit or reject all AI output before public posting.
