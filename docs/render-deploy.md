# Render deployment

Use Render when Snallabot needs a public export receiver URL.

## 1. Push this repo to GitHub

Render deploys from a GitHub repository. Keep `.env` out of GitHub.

## 2. Create a Render Blueprint

In Render:

1. New > Blueprint
2. Connect the GitHub repo
3. Select `render.yaml`
4. Create the web service and Postgres database

The blueprint runs:

- build: install dependencies and generate Prisma client
- pre-deploy: apply Prisma migrations and seed the foundation league
- start: run the LeagueOS web/API server

## 3. Fill required secrets

Render will prompt for:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `LEAGUE_OWNER_DISCORD_ID`

Use this redirect URI after Render gives you the service URL:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/auth/discord/callback
```

Add that exact URI to the Discord Developer Portal OAuth2 redirect list too.

## 4. Bootstrap owner access

After deploy:

1. Open the Render URL
2. Sign in with Discord
3. Run this in the browser console:

```js
fetch("/api/leagues/the-trenches/bootstrap-owner", { method: "POST" })
  .then(r => r.json())
  .then(console.log)
```

Refresh. League Office should appear.

## 5. Add the Snallabot receiver URL

In Render, open the `SNALLABOT_WEBHOOK_TOKEN` environment variable value.

Paste this into Snallabot's **Add Export URL** field:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/import-receivers/snallabot/the-trenches/token/YOUR_SNALLABOT_WEBHOOK_TOKEN
```

When Snallabot exports, LeagueOS receives the payload and records an import run.
