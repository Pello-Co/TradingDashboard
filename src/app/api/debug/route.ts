import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not set' });
  }

  try {
    const sql = neon(dbUrl);
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    const posCheck = await sql`SELECT count(*) as c FROM positions`;
    return NextResponse.json({
      ok: true,
      dbUrlPrefix: dbUrl.substring(0, 40) + '...',
      tables: tables.map(t => t.table_name),
      positionsCount: posCheck[0]?.c,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      dbUrlPrefix: dbUrl.substring(0, 40) + '...',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
