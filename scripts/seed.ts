import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://neondb_owner:npg_4mxOc1eETULV@ep-orange-mode-abwyitvv.eu-west-2.aws.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);

async function seed() {
  console.log('Seeding sample positions...');

  // Get the first user from the Better Auth user table
  const users = (await sql`SELECT id FROM "user" LIMIT 1`) as Array<{ id: string }>;
  if (users.length === 0) {
    console.error('No users found. Sign up first, then run seed.');
    process.exit(1);
  }
  const userId = users[0].id;
  console.log(`Seeding for user: ${userId}`);

  // Clear existing seed data to avoid duplicates on re-run
  await sql`DELETE FROM positions WHERE source = 'seed' AND user_id = ${userId}`;

  await sql`
    INSERT INTO positions (user_id, ticker, display_name, yahoo_ticker, platform, asset_type, entry_price, quantity, currency, source)
    VALUES
      (${userId}, 'AAPL', 'Apple Inc.', 'AAPL', 'ibkr', 'stock', 178.50, 10, 'USD', 'seed'),
      (${userId}, 'TSLA', 'Tesla Inc.', 'TSLA', 'freetrade', 'stock', 245.00, 5, 'USD', 'seed'),
      (${userId}, 'BTC-USD', 'Bitcoin', 'BTC-USD', 'crypto', 'stock', 58000.00, 0.25, 'USD', 'seed')
  `;

  console.log('Seed complete: 3 sample positions inserted.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
