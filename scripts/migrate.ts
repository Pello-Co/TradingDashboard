import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Make sure .env.local exists.');
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('Running migration...');

  await sql`
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(20) NOT NULL,
      name VARCHAR(100),
      yahoo_ticker VARCHAR(30) NOT NULL,
      platform VARCHAR(20) NOT NULL CHECK (platform IN ('freetrade', 'trading212', 'ibkr', 'crypto')),
      direction VARCHAR(10) NOT NULL DEFAULT 'long' CHECK (direction IN ('long', 'short')),
      entry_price DECIMAL(18,8) NOT NULL,
      quantity DECIMAL(18,8) NOT NULL,
      opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMP,
      exit_price DECIMAL(18,8),
      status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      source VARCHAR(100),
      thesis TEXT,
      notes TEXT,
      asset_type VARCHAR(10) NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock', 'option')),
      option_type VARCHAR(10) CHECK (option_type IN ('call', 'put')),
      strike_price DECIMAL(18,8),
      expiry_date DATE,
      underlying_ticker VARCHAR(30),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add columns if they don't exist (for existing tables)
  await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS asset_type VARCHAR(10) NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock', 'option'))`;
  await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS option_type VARCHAR(10) CHECK (option_type IN ('call', 'put'))`;
  await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS strike_price DECIMAL(18,8)`;
  await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS expiry_date DATE`;
  await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS underlying_ticker VARCHAR(30)`;

  await sql`
    CREATE TABLE IF NOT EXISTS ticker_summaries (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(20) NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      overall_summary TEXT,
      recommendation VARCHAR(20) CHECK (recommendation IN ('Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell')),
      risks TEXT,
      catalysts TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(ticker, date)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS token_usage_log (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      api_calls INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  console.log('Migration complete: positions, ticker_summaries, token_usage_log tables ready.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
