export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { sql, dbError } from '@/lib/db';
import { fetchQuotes, fetchWeeklyChange, fetchExchangeRates, ExchangeRates } from '@/lib/prices';
import PortfolioClient, { EnrichedPosition } from '@/app/components/PortfolioClient';
import TabNav from '@/app/components/TabNav';

interface RawPosition {
  id: string;
  ticker: string;
  display_name: string | null;
  yahoo_ticker: string | null;
  platform: string | null;
  entry_price: string;
  quantity: string;
  source: string | null;
  asset_type: 'stock' | 'call' | 'put';
  strike: string | null;
  expiry: unknown; // may be Date object or string from DB driver
  currency: string;
}

function toGbp(amount: number, currency: string, rates: ExchangeRates): number {
  switch (currency) {
    case 'EUR': return (amount * rates.EUR) / rates.GBP; // EUR → USD → GBP
    case 'GBP': return amount;
    case 'GBX': return amount / 100; // pence → GBP
    default: return amount / rates.GBP; // USD → GBP
  }
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const userId = session.user.id;

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
    // Set user context for RLS, then query positions filtered by user_id
    const results = await sql.transaction([
      sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
      sql`
        SELECT id::text, ticker, display_name, yahoo_ticker, platform, entry_price, quantity,
               source, asset_type, strike, expiry::text,
               COALESCE(currency, 'USD') AS currency
        FROM positions
        WHERE user_id = ${userId} AND is_closed = false
        ORDER BY created_at DESC
      `,
    ]);
    rows = results[1] as RawPosition[];
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

  // For options, yahoo_ticker may be null — fall back to ticker
  const yahooTickers = rows.map((r) => r.yahoo_ticker ?? r.ticker);

  let quotes = new Map<string, import('@/lib/prices').QuoteResult>();
  let weeklyChanges = new Map<string, import('@/lib/prices').WeeklyChangeResult>();
  let rates: ExchangeRates = { EUR: 1.08, GBP: 1.27 };

  try {
    [quotes, weeklyChanges, rates] = await Promise.all([
      fetchQuotes(yahooTickers),
      fetchWeeklyChange(yahooTickers),
      fetchExchangeRates(),
    ]);
  } catch {
    console.error('Failed to fetch prices from Yahoo Finance');
  }

  const positions: EnrichedPosition[] = rows.map((pos) => {
    const entry = parseFloat(pos.entry_price);
    const qty = parseFloat(pos.quantity);
    const isOption = pos.asset_type === 'call' || pos.asset_type === 'put';
    // US options: each contract represents 100 shares
    const contractMultiplier = isOption ? 100 : 1;

    const yahooTicker = pos.yahoo_ticker ?? pos.ticker;
    const quote = quotes.get(yahooTicker);
    const weekly = weeklyChanges.get(yahooTicker);

    const current = quote?.currentPrice ?? null;
    const prevClose = quote?.previousClose ?? null;
    const weekAgo = weekly?.weekAgoClose ?? null;

    // Use DB currency; fall back to what Yahoo Finance reported
    const currency = (pos.currency ?? quote?.currency ?? 'USD').toUpperCase();

    // Native-currency values (GBX = pence)
    const marketValue = current !== null ? current * qty * contractMultiplier : null;
    const costBasis = entry * qty * contractMultiplier;
    const totalPnlAbs = current !== null ? (current - entry) * qty * contractMultiplier : null;
    const totalPnlPct = current !== null ? ((current - entry) / entry) * 100 : null;
    const dailyPnlAbs =
      current !== null && prevClose !== null
        ? (current - prevClose) * qty * contractMultiplier
        : null;
    const dailyPnlPct =
      current !== null && prevClose !== null
        ? ((current - prevClose) / prevClose) * 100
        : null;
    const weeklyPnlAbs =
      current !== null && weekAgo !== null
        ? (current - weekAgo) * qty * contractMultiplier
        : null;
    const weeklyPnlPct =
      current !== null && weekAgo !== null
        ? ((current - weekAgo) / weekAgo) * 100
        : null;

    // GBP-converted values for totals and P&L display
    const marketValueUsd = marketValue !== null ? toGbp(marketValue, currency, rates) : null;
    const costBasisUsd = toGbp(costBasis, currency, rates);
    const totalPnlAbsUsd = totalPnlAbs !== null ? toGbp(totalPnlAbs, currency, rates) : null;
    const dailyPnlAbsUsd = dailyPnlAbs !== null ? toGbp(dailyPnlAbs, currency, rates) : null;
    const weeklyPnlAbsUsd = weeklyPnlAbs !== null ? toGbp(weeklyPnlAbs, currency, rates) : null;
    const prevValueUsd =
      prevClose !== null ? toGbp(prevClose * qty * contractMultiplier, currency, rates) : null;
    const weekValueUsd =
      weekAgo !== null ? toGbp(weekAgo * qty * contractMultiplier, currency, rates) : null;

    // Normalize expiry: DB may return a Date object or ISO string
    let expiryDate: string | null = null;
    if (pos.expiry) {
      const raw = pos.expiry;
      if (raw instanceof Date) {
        expiryDate = raw.toISOString().split('T')[0];
      } else {
        expiryDate = String(raw).split('T')[0];
      }
    }

    return {
      id: pos.id,
      ticker: pos.ticker,
      display_name: pos.display_name,
      yahoo_ticker: yahooTicker,
      platform: pos.platform ?? 'ibkr',
      asset_type: pos.asset_type,
      strike: pos.strike,
      expiry: expiryDate,
      currency,
      entry,
      qty,
      current,
      prevClose,
      weekAgo,
      marketValue,
      marketValueUsd,
      costBasis,
      costBasisUsd,
      totalPnlAbs,
      totalPnlPct,
      totalPnlAbsUsd,
      dailyPnlAbs,
      dailyPnlPct,
      dailyPnlAbsUsd,
      weeklyPnlAbs,
      weeklyPnlPct,
      weeklyPnlAbsUsd,
      prevValueUsd,
      weekValueUsd,
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

      <TabNav />

      <main className="px-4 py-6 sm:px-6">
        <PortfolioClient positions={positions} updatedAt={updatedAt} />
      </main>
    </div>
  );
}
