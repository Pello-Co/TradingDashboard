import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL not set. Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('VERCEL')));
  throw new Error('DATABASE_URL environment variable is not set');
}

export const sql = neon(dbUrl);
