import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.DATABASE_URL;

export const sql = dbUrl ? neon(dbUrl) : null;
export const dbError = dbUrl ? null : 'DATABASE_URL not set';
