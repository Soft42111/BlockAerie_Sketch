# Migration Guide

## What Changed

### New Files Added
| File | Purpose |
|---|---|
| `packages/config/index.js` | Shared config layer with new env keys |
| `packages/sogni-wrapper/index.js` | CLI wrapper around `sogni-gen.mjs` |
| `packages/memory/index.js` | User memory + conversation context |
| `packages/scheduler/index.js` | Reminder scheduling |
| `packages/agent-core/index.js` | Intent classification for natural language |
| `src/slashCommands/register.js` | Slash command registration script |
| `src/slashCommands/handler.js` | Slash command interaction handler |
| `src/slashCommands/handlers.js` | Shared command handlers |
| `src/slashCommands/naturalLanguageRouter.js` | Natural language → command routing |
| `Dockerfile` | Container build |
| `docker-compose.yml` | Container orchestration |

### Modified Files
| File | Change | Impact |
|---|---|---|
| `src/index.js` | Added 3 import lines, `interactionCreate` listener, NL router call before `handleChat` | **Minimal** — no existing logic changed |
| `.env.example` | Appended new keys (all commented, with defaults) | **None** — existing keys preserved |

### What Stayed The Same
- **All 26+ prefix commands** — zero changes to command handlers
- **`src/config.js`** — untouched, legacy modules continue to use it
- **`src/chatHandler.js`** — untouched, still handles general chat
- **`src/imageGenerator.js`** — untouched, legacy `!imagine` still uses it
- **All `src/commands/*.js`** — zero changes
- **All `src/utils/*.js`** — zero changes
- **All tests** — zero changes
- **`package.json`** — no dependency changes required (uses existing deps)

## New Environment Variables

All optional with defaults. Add to `.env` as needed:

```
DISCORD_CLIENT_ID=...          # Required for slash command registration
DISCORD_GUILD_ID=...           # Optional, for dev-only guild deploy
SOGNI_GEN_PATH=...             # Path to sogni-gen.mjs CLI
ADMIN_USER_ID=...              # Comma-separated Discord user IDs
```

## Setup Steps

1. **Add `DISCORD_CLIENT_ID`** to `.env` (get from Discord Developer Portal)
2. **Register slash commands**: `node src/slashCommands/register.js`
3. **Start the bot**: `npm start` (same as before)

## Rollback

To revert to pre-upgrade behavior:

1. Remove the 3 added lines from `src/index.js`:
   - The import block (lines 31-33)
   - The `interactionCreate` listener
   - The `routeNaturalLanguage` call
2. Everything else can stay (new files are inert without the wiring)
3. Slash commands can be unregistered via Discord Developer Portal
