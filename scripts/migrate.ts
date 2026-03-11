import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true });

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://neondb_owner:npg_4mxOc1eETULV@ep-orange-mode-abwyitvv.eu-west-2.aws.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log('Phase 3 migration: dropping old app tables and rebuilding with new schema...');

  // Drop old app tables (Better Auth tables are kept)
  await sql`DROP TABLE IF EXISTS token_usage_log CASCADE`;
  await sql`DROP TABLE IF EXISTS ticker_summaries CASCADE`;
  await sql`DROP TABLE IF EXISTS news_articles CASCADE`;
  await sql`DROP TABLE IF EXISTS positions CASCADE`;
  console.log('Dropped old tables.');

  // positions
  await sql`
    CREATE TABLE positions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      ticker          TEXT NOT NULL,
      display_name    TEXT,
      yahoo_ticker    TEXT,
      asset_type      TEXT NOT NULL CHECK (asset_type IN ('stock', 'call', 'put')),
      entry_price     NUMERIC(18,6) NOT NULL,
      quantity        NUMERIC(18,6) NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'USD',
      platform        TEXT DEFAULT 'IBKR',
      strike          NUMERIC(18,6),
      expiry          DATE,
      source          TEXT,
      notes           TEXT,
      is_closed       BOOLEAN NOT NULL DEFAULT false,
      closed_at       TIMESTAMPTZ,
      close_price     NUMERIC(18,6),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('Created positions table.');

  // RLS on positions
  await sql`ALTER TABLE positions ENABLE ROW LEVEL SECURITY`;
  await sql`
    CREATE POLICY "positions_user_isolation"
      ON positions
      FOR ALL
      USING (user_id = current_setting('app.current_user_id', true))
      WITH CHECK (user_id = current_setting('app.current_user_id', true))
  `;
  console.log('RLS enabled on positions with user isolation policy.');

  // news_articles
  await sql`
    CREATE TABLE news_articles (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticker          TEXT NOT NULL,
      title           TEXT NOT NULL,
      url             TEXT NOT NULL UNIQUE,
      source          TEXT,
      published_at    TIMESTAMPTZ,
      sentiment       TEXT CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
      confidence      NUMERIC(5,4),
      summary         TEXT,
      impact          TEXT,
      tags            TEXT[],
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('Created news_articles table.');

  // ticker_summaries
  await sql`
    CREATE TABLE ticker_summaries (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticker          TEXT NOT NULL,
      date            DATE NOT NULL,
      overall_summary TEXT,
      recommendation  TEXT CHECK (recommendation IN ('buy', 'hold', 'sell')),
      risks           TEXT,
      catalysts       TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(ticker, date)
    )
  `;
  console.log('Created ticker_summaries table.');

  // token_usage_log
  await sql`
    CREATE TABLE token_usage_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date            DATE NOT NULL UNIQUE,
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      api_calls       INTEGER NOT NULL DEFAULT 0,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('Created token_usage_log table.');

  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
