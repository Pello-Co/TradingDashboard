import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  console.log('Migration complete: positions table created.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
