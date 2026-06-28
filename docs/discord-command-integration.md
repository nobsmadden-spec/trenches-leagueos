# Discord command integration

LeagueOS and Snallabot must use separate Discord applications, client IDs, and bot tokens.

## Why separation is required

Snallabot installs global commands for its application and dispatches them through a fixed `SlashCommands` handler map. When a command exists in Discord but is absent from that map, Snallabot responds with `command <name> not implemented`.

LeagueOS previously registered `/roster` against the same Discord application used by the running Snallabot service. Discord exposed the new global command, but Snallabot received the interaction and rejected it because `roster` was not one of its handlers. Restarting or rotating a shared token cannot solve that architectural conflict.

References:

- [Snallabot command documentation](https://github.com/snallabot/snallabot#commands)
- [Snallabot command dispatcher](https://github.com/snallabot/snallabot-service/blob/main/src/discord/commands_handler.ts)
- [Snallabot feature setup](https://github.com/snallabot/snallabot/blob/main/feature_setup.md)
- [Snallabot game-channel implementation](https://github.com/snallabot/snallabot-service/blob/main/src/discord/commands/game_channels.ts)

## LeagueOS command boundary

1. Keep the existing Snallabot application responsible for Snallabot exports and its native commands.
2. Create a dedicated LeagueOS Discord application for LeagueOS interactions.
3. Use separate LeagueOS bot credentials instead of the website OAuth or Snallabot credentials.
4. Never call Discord's global command replacement route with a shared Snallabot application ID.
5. Treat Snallabot export HTTP payloads as the integration boundary; do not duplicate its EA acquisition workflow.

## Command shape to adopt

Snallabot's strongest command pattern is a grouped command with explicit subcommands and a configure-first workflow. LeagueOS should follow that interaction model while keeping a distinct branded namespace:

- `/league standings`
- `/league matchups`
- `/league roster team:<team>`
- `/league threads configure`
- `/league threads create`
- `/league threads notify`
- `/league media preview`

Each configurable workflow should:

- validate its channel, category, role, and bot permissions before saving;
- use ephemeral setup and error responses;
- show progress for multi-step work;
- fail with a specific corrective instruction rather than a generic fallback;
- keep command definitions and handler registration in one registry so they cannot drift;
- register to a test guild during development and promote to global commands only after verification.

## Permissions

Request permissions by feature instead of relying on administrator access. Thread creation needs channel visibility, message/embed access, public-thread creation, thread messaging, history access, and thread management. Team assignment and onboarding additionally need member and role access. LeagueOS should verify these capabilities during `/league threads configure` before attempting creation.

The Snallabot service is MIT licensed, so its public implementation can inform LeagueOS design. LeagueOS should still preserve its own data contracts and avoid copying workflows that are already supplied by Snallabot.
