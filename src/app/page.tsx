export const dynamic = 'force-dynamic';

import { sql, dbError } from '@/lib/db';
import { fetchQuotes, fetchWeeklyChange } from '@/lib/prices';
import PortfolioClient, { EnrichedPosition } from '@/app/components/PortfolioClient';

interface RawPosition {
  id: number;
  ticker: string;
  name: string | null;
  yahoo_ticker: string;
  platform: 'freetrade' | 'trading212' | 'ibkr' | 'crypto';
  direction: 'long' | 'short';
  entry_price: string;
  quantity: string;
  opened_at: string;
  source: string | null;
  thesis: string | null;
  asset_type: string;
  option_type: string | null;
  strike_price: string | null;
  expiry_date: unknown; // may be Date object or string from DB driver
  underlying_ticker: string | null;
}

export default async function DashboardPage() {
  if (!sql) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Config Error</h1>
          <p className="text-gray-400">{dbError || 'DATABASE_URL not configured'}</p>
          <p className="text-gray-600 text-xs mt-2">VERCEL_ENV: {process.env.VERCEL_ENV ?? 'not set'} | NODE_ENV: {process.env.NODE_ENV ?? 'not set'}</p>
        </div>
      </div>
    );
  }

  let rows: RawPosition[] = [];
  try {
    rows = (await sql`
      SELECT id, ticker, name, yahoo_ticker, platform, direction, entry_price, quantity, opened_at, source, thesis,
             asset_type, option_type, strike_price, expiry_date, underlying_ticker
      FROM positions
      WHERE status = 'open'
      ORDER BY opened_at DESC
    `) as RawPosition[];
  } catch (e) {
    console.error('DB query failed:', e);
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Database Error</h1>
          <p className="text-gray-400">Query failed: {e instanceof Error ? e.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const yahooTickers = rows.map((r) => r.yahoo_ticker);

  let quotes = new Map<string, import('@/lib/prices').QuoteResult>();
  let weeklyChanges = new Map<string, import('@/lib/prices').WeeklyChangeResult>();

  try {
    [quotes, weeklyChanges] = await Promise.all([
      fetchQuotes(yahooTickers),
      fetchWeeklyChange(yahooTickers),
    ]);
  } catch {
    console.error('Failed to fetch prices from Yahoo Finance');
  }

  const positions: EnrichedPosition[] = rows.map((pos) => {
    const entry = parseFloat(pos.entry_price);
    const qty = parseFloat(pos.quantity);
    const isOption = pos.asset_type === 'option';
    // US options: each contract represents 100 shares
    const contractMultiplier = isOption ? 100 : 1;
    const dirMultiplier = pos.direction === 'short' ? -1 : 1;

    const quote = quotes.get(pos.yahoo_ticker);
    const weekly = weeklyChanges.get(pos.yahoo_ticker);

    const current = quote?.currentPrice ?? null;
    const prevClose = quote?.previousClose ?? null;
    const weekAgo = weekly?.weekAgoClose ?? null;

    const marketValue = current !== null ? current * qty * contractMultiplier : null;
    const costBasis = entry * qty * contractMultiplier;
    const totalPnlAbs = current !== null ? (current - entry) * qty * contractMultiplier * dirMultiplier : null;
    const totalPnlPct = current !== null ? ((current - entry) / entry) * 100 * dirMultiplier : null;
    const dailyPnlAbs =
      current !== null && prevClose !== null
        ? (current - prevClose) * qty * contractMultiplier * dirMultiplier
        : null;
    const dailyPnlPct =
      current !== null && prevClose !== null
        ? ((current - prevClose) / prevClose) * 100 * dirMultiplier
        : null;
    const weeklyPnlAbs =
      current !== null && weekAgo !== null
        ? (current - weekAgo) * qty * contractMultiplier * dirMultiplier
        : null;
    const weeklyPnlPct =
      current !== null && weekAgo !== null
        ? ((current - weekAgo) / weekAgo) * 100 * dirMultiplier
        : null;

    // Normalize expiry_date: DB may return a Date object or ISO string
    let expiryDate: string | null = null;
    if (pos.expiry_date) {
      const raw = pos.expiry_date;
      if (raw instanceof Date) {
        expiryDate = raw.toISOString().split('T')[0];
      } else {
        expiryDate = String(raw).split('T')[0];
      }
    }

    return {
      id: pos.id,
      ticker: pos.ticker,
      name: pos.name,
      yahoo_ticker: pos.yahoo_ticker,
      platform: pos.platform,
      direction: pos.direction,
      asset_type: pos.asset_type,
      option_type: pos.option_type,
      strike_price: pos.strike_price,
      expiry_date: expiryDate,
      underlying_ticker: pos.underlying_ticker,
      entry,
      qty,
      current,
      prevClose,
      weekAgo,
      marketValue,
      costBasis,
      totalPnlAbs,
      totalPnlPct,
      dailyPnlAbs,
      dailyPnlPct,
      weeklyPnlAbs,
      weeklyPnlPct,
    };
  });

  const updatedAt = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <div className="min-h-screen bg-gray-950 font-[var(--font-inter)]">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-sm font-semibold tracking-widest text-gray-300 uppercase">Trading Terminal</h1>
          </div>
          <span className="text-xs text-gray-500">Updated {updatedAt}</span>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6">
        <PortfolioClient positions={positions} updatedAt={updatedAt} />
      </main>
    </div>
  );
}
