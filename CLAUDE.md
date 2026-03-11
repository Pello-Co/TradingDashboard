# TradingDashboard — CLAUDE.md

## How This Project Works

This project is managed by **TradeBot** (an OpenClaw orchestrator agent) and built by **you** (Claude Code).

**You are the coding executor.** TradeBot is the orchestrator, planner, product manager, and reviewer. You will receive task cards with clear objectives and acceptance criteria. Your job is to implement them correctly and completely.

### What you do:
- Receive task cards from TradeBot
- Implement features, fixes, and refactors in this repo
- Stay focused on the codebase and technical execution
- Report back what you built, what changed, and any blockers
- Commit frequently with clear messages
- **Keep CLAUDE.md up to date** — see rule below

### What you don't do:
- Make product decisions — ask if scope is unclear
- Skip acceptance criteria — every task card defines "done"
- Assume your work is complete without checking the criteria
- Refactor unrelated code unless asked to

---

## CLAUDE.md Maintenance Rule

**You MUST update this file as part of completing any task that changes the following:**

| Category | Examples that require an update |
|----------|--------------------------------|
| Database schema | New table, new column, dropped column, renamed field, changed type or constraint |
| API routes | New route, changed request/response shape, removed route, auth changes |
| External integrations | New API or service added, switched provider, changed auth method |
| Core libraries / `lib/` | New file, changed function signatures, new utility |
| Pages / features | New page, new UI feature, removed feature |
| Architecture | New component pattern, new data flow, rendering strategy change |
| Environment variables | New var required, var renamed, var removed |
| Infrastructure | Cron schedule change, new Vercel config, deployment change |
| Tech stack | Package added/removed, version upgrade with behaviour change |
| Decisions | Any significant "why did we do it this way" choice |

**When to update:** Before committing — CLAUDE.md should be accurate at the time of every commit that touches the above.

**What to update:**
- **Project Structure** — add/remove/rename files
- **Database Schema** — reflect the actual current schema exactly
- **Implemented Features** — mark features done, add new ones
- **Status Checklist** — tick off completed items
- **Decisions Log** — add a row with the date, decision, and context
- **Environment Variables** — add any new required vars
- Any other section that is now inaccurate

**Do not wait to be asked.** Keeping CLAUDE.md current is part of the definition of done for every task.

---

## Project Overview

A personal trading portfolio dashboard for Sina — one user, not a SaaS product. Prioritise clarity, speed, and usefulness over polish. Ship fast, iterate. No premature abstraction.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 (App Router) + TypeScript 5 + Tailwind CSS 4 |
| Database | Neon (serverless Postgres) |
| Auth | Better Auth (`better-auth`) — self-hosted, tables in Neon |
| Hosting | Vercel |
| Price Data | Yahoo Finance (unofficial API via chart endpoint) |
| News | Brave News Search API |
| AI | OpenAI GPT-4o (sentiment analysis + ticker summaries) |
| Repo | [github.com/Pello-Co/TradingDashboard](https://github.com/Pello-Co/TradingDashboard) |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...all]/
│   │   │       └── route.ts        # Better Auth Next.js handler (all auth endpoints)
│   │   └── cron/
│   │       └── news/route.ts       # Daily news scraping + AI analysis cron
│   ├── components/
│   │   ├── PortfolioClient.tsx     # Interactive portfolio table (client)
│   │   └── TabNav.tsx              # Portfolio / News navigation tabs (client)
│   ├── dashboard/
│   │   └── page.tsx                # Portfolio dashboard (server, session-protected)
│   ├── news/
│   │   ├── page.tsx                # News page (server, session-protected)
│   │   └── components/
│   │       └── NewsFeed.tsx        # News feed UI (client)
│   ├── forgot-password/
│   │   └── page.tsx                # Forgot password page (sends reset email)
│   ├── reset-password/
│   │   └── page.tsx                # Reset password page (reads token from URL, sets new password)
│   ├── sign-in/
│   │   └── page.tsx                # Sign-in page (email + password form)
│   ├── sign-up/
│   │   └── page.tsx                # Sign-up page (name + email + password form)
│   ├── verify-email/
│   │   └── page.tsx                # "Check your inbox" page + resend button
│   ├── page.tsx                    # Root — redirects to /dashboard
│   ├── layout.tsx                  # Root layout (no auth wrapper needed)
│   └── globals.css
├── lib/
│   ├── auth.ts                     # Better Auth server instance (betterAuth config)
│   ├── auth-client.ts              # Better Auth React client (signIn, signUp, signOut, useSession)
│   ├── session.ts                  # getSession() server helper
│   ├── db.ts                       # Neon connection
│   ├── prices.ts                   # Yahoo Finance price fetching
│   ├── news.ts                     # Brave News Search API integration
│   └── sentiment.ts                # OpenAI GPT-4o sentiment + summaries
└── middleware.ts                   # Route protection — uses getSessionCookie from better-auth/cookies

scripts/
├── migrate.ts                      # App DB schema creation (run with tsx)
├── migrate-auth.ts                 # Better Auth table migration (run once; already applied)
└── seed.ts                         # Sample data insertion

vercel.json                         # Cron job schedule config
```

## Database Schema

### Better Auth tables (managed by Better Auth, do not modify)
`user`, `session`, `account`, `verification` — created by `scripts/migrate-auth.ts`

### `positions` table — open and closed trading positions (per user)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
ticker          TEXT NOT NULL                 -- Display ticker / underlying for options (e.g. AAPL)
display_name    TEXT                          -- Company name
yahoo_ticker    TEXT                          -- Yahoo Finance ticker (may differ)
asset_type      TEXT NOT NULL                 -- stock | call | put
entry_price     NUMERIC(18,6) NOT NULL
quantity        NUMERIC(18,6) NOT NULL
currency        TEXT NOT NULL DEFAULT 'USD'   -- USD | GBP | EUR | GBX
platform        TEXT DEFAULT 'IBKR'
strike          NUMERIC(18,6)                 -- options only
expiry          DATE                          -- options only
source          TEXT                          -- Who recommended the trade
notes           TEXT
is_closed       BOOLEAN NOT NULL DEFAULT false
closed_at       TIMESTAMPTZ
close_price     NUMERIC(18,6)
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

RLS: ENABLED — policy "positions_user_isolation" enforces user_id = app.current_user_id
Note: neondb_owner is a superuser and bypasses RLS; explicit WHERE user_id = $userId used in all app queries
```

### `news_articles` table — AI-analysed news per ticker (global, not per user)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
ticker          TEXT NOT NULL
title           TEXT NOT NULL
url             TEXT NOT NULL UNIQUE
source          TEXT
published_at    TIMESTAMPTZ
sentiment       TEXT                          -- bullish | bearish | neutral
confidence      NUMERIC(5,4)                  -- 0.0–1.0
summary         TEXT                          -- AI-generated 1-sentence summary
impact          TEXT
tags            TEXT[]
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### `ticker_summaries` table — daily AI summary per ticker (global, not per user)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
ticker          TEXT NOT NULL
date            DATE NOT NULL
overall_summary TEXT
recommendation  TEXT                          -- buy | hold | sell
risks           TEXT
catalysts       TEXT
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE(ticker, date)
```

### `token_usage_log` table — daily OpenAI API cost tracking (global)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
date            DATE NOT NULL UNIQUE
input_tokens    INTEGER NOT NULL DEFAULT 0
output_tokens   INTEGER NOT NULL DEFAULT 0
api_calls       INTEGER NOT NULL DEFAULT 0
updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

## Implemented Features

### Portfolio Dashboard (`/`)
- Fetches all open positions from DB
- Fetches live prices from Yahoo Finance (current + daily change + weekly change)
- Fetches EUR/USD and GBP/USD exchange rates
- Calculates: Total P&L, Daily P&L, Weekly P&L (absolute + %)
- Summary cards: Portfolio Value, Total P&L, Daily P&L, Weekly P&L (all in GBP)
- Filterable by asset type (All / Stocks / Options) and platform (All / FreeTrade / Trading212 / IBKR / Crypto)
- Sortable columns: Ticker, Market Value, Total P&L %, Daily P&L %, Weekly P&L %
- Colour-coded P&L (green/red)
- Multi-currency display: USD, EUR, GBP, GBX (pence) — all converted to GBP for totals
- Options displayed as: `UNDERLYING STRIKE CALL/PUT EXP`
- Shows last-updated timestamp

### News Page (`/news`)
- Fetches news articles from the last 7 days
- Fetches AI ticker summaries from the last 6 days
- Fetches token usage logs for cost visibility
- Date tabs (last 7 days) with client-side filtering
- Ticker filter pills — click to filter by ticker
- Sentiment filter pills (All / Bullish / Bearish / Neutral)
- Grouped cards per ticker with sentiment breakdown counts
- AI ticker summary panel: overall_summary, recommendation badge, risks, catalysts
- Expandable article lists (3 shown by default, expand to see all)
- Each article: title, source, relative time, AI summary, tags, sentiment pill
- Token usage footer: daily input/output tokens + API call count
- Empty state messages for no articles / no filtered results

### News Cron Job (`/api/cron/news`)
- Runs daily at 14:00 UTC via Vercel cron (configured in `vercel.json`)
- Optional Bearer token auth via `CRON_SECRET` env var
- Flow:
  1. Fetch all open positions; deduplicate tickers (options → underlying ticker)
  2. Scrape up to 5 articles per ticker via Brave News Search API (freshness: past day)
  3. Filter out already-stored URLs
  4. Insert new articles (sentiment fields NULL initially)
  5. Run GPT-4o sentiment analysis per article (200ms delay between calls)
  6. Update articles with: sentiment, confidence, summary, impact, relevance, tags
  7. Generate overall ticker summary (recommendation + risks + catalysts)
  8. Backfill any existing articles still missing sentiment analysis
  9. Log token usage to `token_usage_log`
- Returns JSON: `{ tickersProcessed, articlesFound, articlesNew, articlesAnalysed, articlesBackfilled, tokens }`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `BRAVE_BROWSER_SEARCH` | Brave News Search API key |
| `OPENAI_KEY` | OpenAI API key (GPT-4o) |
| `CRON_SECRET` | Optional Bearer token for cron auth |
| `BETTER_AUTH_SECRET` | Random 32+ char secret for Better Auth JWT signing |
| `BETTER_AUTH_URL` | App base URL (`http://localhost:3000` dev / prod URL for Vercel) |
| `NEXT_PUBLIC_APP_URL` | Same as `BETTER_AUTH_URL` but public (used by auth-client) |
| `RESEND_BULLIST_KEY` | Resend API key (env var name is RESEND_BULLIST_KEY) — set in Vercel; add locally to `.env.local` |

Files: `.env.local` (dev), `.env.production` and `.env.vercel-prod` (prod).

## Infrastructure

| Service | Account / Detail |
|---------|-----------------|
| GitHub | Pello-Co |
| Vercel | sina-2972 |
| Neon | Serverless Postgres — connection active |
| Brave Search | API key in env |
| OpenAI | GPT-4o — key in env |

## Broader System Context

- **TradeBot** (OpenClaw agent) handles daily research, price checks, trade analysis, and Telegram notifications for Sina.
- The dashboard is the **visual layer** — TradeBot is the **intelligence layer**.
- TradeBot will read from and write to the same Neon database to keep portfolio state in sync.
- Reminders set in the dashboard should be surfaceable by TradeBot via Telegram.
- The dashboard and TradeBot share the same data model — keep schema decisions compatible.

## Coding Standards

- **TypeScript** — strict mode, no `any` unless truly unavoidable
- **Tailwind CSS** — no custom CSS files unless there's a good reason
- **Next.js App Router** — server components by default, client components only for interactivity/hooks
- **Database queries** — parameterised queries only, never string concatenation
- **Error handling** — surface errors clearly in the UI, log them server-side
- **Commits** — small, frequent, with clear messages describing what changed and why
- **No premature abstraction** — keep it simple until complexity demands otherwise
- **Mobile-friendly** — Sina may check this on his phone

## Status Checklist

- [x] Repo created
- [x] Neon database setup + connection
- [x] Project scaffolding (Next.js + Tailwind + TypeScript)
- [x] Core data model + migrations (positions, news_articles, ticker_summaries, token_usage_log)
- [x] Dashboard UI (portfolio overview with live prices + P&L)
- [x] Multi-currency support (USD / EUR / GBP / GBX)
- [x] Options support (call/put with strike, expiry, underlying)
- [x] Platform filtering (FreeTrade / Trading212 / IBKR / Crypto)
- [x] News page with AI sentiment analysis (Brave News + GPT-4o)
- [x] Daily cron job for news scraping + AI analysis
- [x] Token usage tracking for API cost monitoring
- [x] Vercel deployment (active, with cron)
- [x] Better Auth — email/password auth, session management, route protection
- [x] Resend email verification (verification + password reset via noreply@bullist.co)
- [x] DB rebuild with user_id + RLS (positions scoped per user)
- [ ] Trade entry form (UI to add new trades)
- [ ] Trade close flow (UI to close positions with exit price)
- [ ] Trade history view (closed trades archive)
- [ ] P&L by source breakdown (which friend's picks are performing?)
- [ ] Reminder system + Telegram integration
- [ ] TradeBot ↔ Dashboard data sync

## Decisions Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-03-10 | Repo created as Pello-Co/TradingDashboard | — |
| 2026-03-10 | Trade sources = friends (track by name) | Sina's trade ideas come from friends |
| 2026-03-10 | Reminders via Telegram | Sina's preferred channel |
| 2026-03-10 | Stack: Next.js + Neon + Vercel | Fast to ship, serverless, low maintenance |
| 2026-03-11 | Positions table replaces trades table | Richer schema: platforms, asset types, currency, options fields |
| 2026-03-11 | Multi-currency support (USD/EUR/GBP/GBX) | Sina trades across UK and US markets |
| 2026-03-11 | Options support added | Calls and puts with strike, expiry, underlying ticker |
| 2026-03-11 | News scraper: Google News RSS → Yahoo Finance → Brave Search | Brave gives better coverage and freshness filtering |
| 2026-03-11 | AI sentiment: switched to OpenAI GPT-4o | Better quality than previous GLM model |
| 2026-03-11 | 5 articles per ticker per day | Balance between coverage and API cost |
| 2026-03-11 | Token usage logging added | Track OpenAI costs per day |
| 2026-03-11 | Date tabs for news (client-side filtering) | Better UX — no extra DB queries per tab |
| 2026-03-11 | Auth: switched from Stack Auth → Better Auth | Better Auth is fully self-hosted; no external auth SaaS needed; tables live in our own Neon DB |
| 2026-03-11 | Better Auth uses pg + Kysely (not @neondatabase/serverless) | Kysely is bundled with better-auth; pg used for auth routes only; app queries still use @neondatabase/serverless |
| 2026-03-11 | Dashboard moved from / to /dashboard | Required by Better Auth middleware redirect target; root / now redirects to /dashboard |
| 2026-03-11 | emailVerification is a top-level betterAuth option, not a plugin | Task card example was wrong; actual API uses `emailVerification: { sendVerificationEmail: ... }` |
| 2026-03-11 | Resend sender: noreply@bullist.co | Domain is bullist.co; must be verified in Resend dashboard |
| 2026-03-11 | Resend env var named RESEND_BULLIST_KEY (not RESEND_API_KEY) | Operator set it with this name in Vercel; code updated to match |
| 2026-03-11 | Phase 3 schema: UUID PKs, user_id FK, asset_type merges call/put | Simpler schema; ticker IS the underlying for options; no direction/thesis/underlying_ticker |
| 2026-03-11 | ticker_summaries recommendation: buy/hold/sell (lowercase) | Simplified from 5-value scale; matches AI prompt and DB constraint |
| 2026-03-11 | neondb_owner bypasses RLS; explicit WHERE user_id added | Superuser connections bypass Postgres RLS by default; double-filter for safety |
| 2026-03-11 | Dashboard uses sql.transaction() to set app.current_user_id before query | Correct RLS setup for future non-superuser roles; also filters by user_id explicitly |

## When You're Stuck

- If the task card is ambiguous, say so and ask for clarification rather than guessing
- If you hit a real blocker (auth issue, missing env var, API limit), report it clearly
- If you think the approach in the task card is wrong, explain why and propose an alternative — but don't silently deviate
