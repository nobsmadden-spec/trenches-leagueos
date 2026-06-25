#!/usr/bin/env bash
set -euo pipefail

cat <<'TEXT'
To finish Phase 1 web login:

1. In Discord, enable Developer Mode:
   User Settings > Advanced > Developer Mode

2. Right-click your Discord username and choose:
   Copy User ID

3. Add this line to .env:
   LEAGUE_OWNER_DISCORD_ID=your-copied-discord-user-id
   The value must be numbers only, not your username.

4. Optional team assignment:
   LEAGUE_OWNER_TEAM=buf

5. Restart the website, sign in with Discord, then open the browser console
   and run:
   fetch("/api/leagues/the-trenches/bootstrap-owner", { method: "POST" }).then(r => r.json()).then(console.log)
TEXT
