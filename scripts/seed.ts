import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Make sure .env.local exists.');
}

const sql = neon(process.env.DATABASE_URL);

async function seed() {
  console.log('Seeding sample positions...');

  // Clear existing seed data to avoid duplicates on re-run
  await sql`DELETE FROM positions WHERE source = 'seed'`;

  await sql`
    INSERT INTO positions (ticker, name, yahoo_ticker, platform, direction, entry_price, quantity, opened_at, status, source, thesis)
    VALUES
      ('AAPL', 'Apple Inc.', 'AAPL', 'ibkr', 'long', 178.50, 10, NOW() - INTERVAL '30 days', 'open', 'seed', 'Strong iPhone cycle, services growth, buyback machine.'),
      ('TSLA', 'Tesla Inc.', 'TSLA', 'freetrade', 'long', 245.00, 5, NOW() - INTERVAL '14 days', 'open', 'seed', 'Robotaxi and energy storage optionality.'),
      ('BTC-USD', 'Bitcoin', 'BTC-USD', 'crypto', 'long', 58000.00, 0.25, NOW() - INTERVAL '60 days', 'open', 'seed', 'Digital gold, halving cycle thesis.')
  `;

  console.log('Seed complete: 3 sample positions inserted.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
