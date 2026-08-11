# Ping Pong Tournament Bot

Discord bot for Swiss-system table tennis leagues with a Top Cut bracket. Runs on **Cloudflare Workers** (free tier) with **Supabase** as the database

## Setup

### 1. Supabase

Run the full schema setup in the Supabase SQL editor:

```
supabase/full_schema.sql
```

### 2. Discord Application

1. Create an app at [discord.com/developers](https://discord.com/developers/applications)
2. Copy **Application ID**, **Public Key**, and bot **Token**
3. Enable **Interactions Endpoint URL** → your Cloudflare Worker URL (after deploy)
4. Bot needs `applications.commands` scope when invited

### 3. Environment

Copy `.env.example` to `.dev.vars` for local dev and set secrets in Cloudflare for production:

```
DISCORD_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
GUILD_ID=                    # dev guild for fast command registration
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Set Cloudflare secrets:

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# ... etc
```

### 4. Install & register commands

```bash
npm install
npm run register
```

### 5. Run locally / deploy

```bash
npm run dev      # wrangler dev
npm run deploy   # wrangler deploy
```

## Commands

| Command | Who | Description |
|---------|-----|-------------|
| `/register` | Players | Join the active tournament |
| `/report-score` | Players | Submit a match result (best-of-5) |
| `/my-match` | Players | View your current opponent and deadline |
| `/tournament` | Everyone | View the current tournament standings or bracket |
| `/tournaments` | Everyone | List all past and active tournaments |
| `/history` | Everyone | View player history, past standings, or past brackets |
| `/help` | Everyone | Learn how to use commands |
| `/rules` | Everyone | View the tournament rules |

**Tournament Organizer (TO) Commands:**
- `/start-tournament` — Open registration for a new tournament
- `/next-round` — Close registration & start Round 1, or advance to the next Swiss/Top Cut round
- `/force-match-winner` — Manually resolve or override a match result
- `/undo-match-result` — Revert a match to pending and recalculate standings
- `/cancel-tournament` — Cancel and delete the active tournament
- `/to-add` / `/to-remove` — Manage Tournament Organizers

## Tournament flow

1. TO runs `/start-tournament` to open registration, indicating a deadline.
2. Players `/register` for the tournament
3. TO runs `/next-round` when ≥9 players have joined and the deadline has passed (TO discretion). This will close registration, calculate rounds/top cut size, and post Round 1 pairings
4. Weekly rounds: 7-day deadline (TO discretion)
5. After Swiss rounds → Top Cut single elimination → `/next-round` until champion

