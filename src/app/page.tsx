export const dynamic = 'force-dynamic';

import { sql } from '@/lib/db';
import { fetchQuotes, fetchWeeklyChange } from '@/lib/prices';

interface Position {
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
}

const PLATFORM_LABELS: Record<string, string> = {
  freetrade: 'FreeTrade',
  trading212: 'Trading212',
  ibkr: 'IBKR',
  crypto: 'Crypto',
};

const PLATFORM_COLORS: Record<string, string> = {
  freetrade: 'bg-green-900/50 text-green-300 border border-green-700/50',
  trading212: 'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  ibkr: 'bg-purple-900/50 text-purple-300 border border-purple-700/50',
  crypto: 'bg-orange-900/50 text-orange-300 border border-orange-700/50',
};

function fmt(n: number | null, decimals = 2, prefix = '') {
  if (n === null || isNaN(n)) return '—';
  return `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtPrice(n: number | null) {
  if (n === null || isNaN(n)) return '—';
  // Use more decimals for crypto
  const decimals = n < 1 ? 6 : n < 100 ? 4 : 2;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function pnlClass(n: number | null) {
  if (n === null || isNaN(n)) return 'text-gray-400';
  return n >= 0 ? 'text-emerald-400' : 'text-red-400';
}

function pnlSign(n: number | null) {
  if (n === null || isNaN(n || 0)) return '';
  return n >= 0 ? '+' : '';
}

export default async function DashboardPage() {
  const rows = (await sql`
    SELECT id, ticker, name, yahoo_ticker, platform, direction, entry_price, quantity, opened_at, source, thesis
    FROM positions
    WHERE status = 'open'
    ORDER BY opened_at DESC
  `) as Position[];

  const yahooTickers = rows.map((r) => r.yahoo_ticker);

  let quotes = new Map<string, import('@/lib/prices').QuoteResult>();
  let weeklyChanges = new Map<string, import('@/lib/prices').WeeklyChangeResult>();

  try {
    [quotes, weeklyChanges] = await Promise.all([
      fetchQuotes(yahooTickers),
      fetchWeeklyChange(yahooTickers),
    ]);
  } catch {
    // If price fetching fails entirely, render with empty prices
    console.error('Failed to fetch prices from Yahoo Finance');
  }

  // Enrich each position with calculated data
  const positions = rows.map((pos: Position) => {
    const entry = parseFloat(pos.entry_price);
    const qty = parseFloat(pos.quantity);
    const direction = pos.direction;

    const quote = quotes.get(pos.yahoo_ticker);
    const weekly = weeklyChanges.get(pos.yahoo_ticker);

    const current = quote?.currentPrice ?? null;
    const prevClose = quote?.previousClose ?? null;
    const weekAgo = weekly?.weekAgoClose ?? null;

    const multiplier = direction === 'short' ? -1 : 1;

    const marketValue = current !== null ? current * qty : null;
    const totalPnlAbs = current !== null ? (current - entry) * qty * multiplier : null;
    const totalPnlPct = current !== null ? ((current - entry) / entry) * 100 * multiplier : null;
    const dailyPnlAbs = current !== null && prevClose !== null ? (current - prevClose) * qty * multiplier : null;
    const dailyPnlPct = current !== null && prevClose !== null ? ((current - prevClose) / prevClose) * 100 * multiplier : null;
    const weeklyPnlAbs = current !== null && weekAgo !== null ? (current - weekAgo) * qty * multiplier : null;
    const weeklyPnlPct = current !== null && weekAgo !== null ? ((current - weekAgo) / weekAgo) * 100 * multiplier : null;

    return {
      ...pos,
      entry,
      qty,
      current,
      prevClose,
      weekAgo,
      marketValue,
      totalPnlAbs,
      totalPnlPct,
      dailyPnlAbs,
      dailyPnlPct,
      weeklyPnlAbs,
      weeklyPnlPct,
    };
  });

  // Summary totals
  const totalValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const totalPnlAbs = positions.reduce((sum, p) => sum + (p.totalPnlAbs ?? 0), 0);
  const totalCostBasis = positions.reduce((sum, p) => sum + p.entry * p.qty, 0);
  const totalPnlPct = totalCostBasis > 0 ? (totalPnlAbs / totalCostBasis) * 100 : 0;
  const totalDailyPnl = positions.reduce((sum, p) => sum + (p.dailyPnlAbs ?? 0), 0);
  const totalPrevValue = positions.reduce((sum, p) => {
    if (p.prevClose === null) return sum;
    return sum + p.prevClose * p.qty;
  }, 0);
  const totalDailyPct = totalPrevValue > 0 ? (totalDailyPnl / totalPrevValue) * 100 : 0;
  const totalWeeklyPnl = positions.reduce((sum, p) => sum + (p.weeklyPnlAbs ?? 0), 0);
  const totalWeekValue = positions.reduce((sum, p) => {
    if (p.weekAgo === null) return sum;
    return sum + p.weekAgo * p.qty;
  }, 0);
  const totalWeeklyPct = totalWeekValue > 0 ? (totalWeeklyPnl / totalWeekValue) * 100 : 0;

  const updatedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

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
        {/* Summary Bar */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Portfolio Value" value={`$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} neutral />
          <SummaryCard
            label="Total P&L"
            value={`${pnlSign(totalPnlAbs)}$${Math.abs(totalPnlAbs).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`${pnlSign(totalPnlPct)}${fmt(totalPnlPct)}%`}
            positive={totalPnlAbs >= 0}
          />
          <SummaryCard
            label="Daily P&L"
            value={`${pnlSign(totalDailyPnl)}$${Math.abs(totalDailyPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`${pnlSign(totalDailyPct)}${fmt(totalDailyPct)}%`}
            positive={totalDailyPnl >= 0}
          />
          <SummaryCard
            label="Weekly P&L"
            value={`${pnlSign(totalWeeklyPnl)}$${Math.abs(totalWeeklyPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`${pnlSign(totalWeeklyPct)}${fmt(totalWeeklyPct)}%`}
            positive={totalWeeklyPnl >= 0}
          />
        </div>

        {/* Positions Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm font-[var(--font-mono)]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                {[
                  'Ticker', 'Name', 'Platform', 'Dir',
                  'Entry', 'Current', 'Qty', 'Mkt Value',
                  'P&L $', 'P&L %',
                  'Day $', 'Day %',
                  'Wk $', 'Wk %',
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-gray-500">
                    No open positions.
                  </td>
                </tr>
              ) : (
                positions.map((pos) => (
                  <tr key={pos.id} className="hover:bg-gray-900/30 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-white">{pos.ticker}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs max-w-[140px] truncate">{pos.name ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${PLATFORM_COLORS[pos.platform]}`}>
                        {PLATFORM_LABELS[pos.platform]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium ${pos.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-300">{fmtPrice(pos.entry)}</td>
                    <td className="px-3 py-2.5 text-white">{fmtPrice(pos.current)}</td>
                    <td className="px-3 py-2.5 text-gray-300">{fmt(pos.qty, 4)}</td>
                    <td className="px-3 py-2.5 text-gray-200">{pos.marketValue !== null ? `$${pos.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.totalPnlAbs)}`}>
                      {pos.totalPnlAbs !== null ? `${pnlSign(pos.totalPnlAbs)}$${Math.abs(pos.totalPnlAbs).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.totalPnlPct)}`}>
                      {pos.totalPnlPct !== null ? `${pnlSign(pos.totalPnlPct)}${fmt(pos.totalPnlPct)}%` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.dailyPnlAbs)}`}>
                      {pos.dailyPnlAbs !== null ? `${pnlSign(pos.dailyPnlAbs)}$${Math.abs(pos.dailyPnlAbs).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.dailyPnlPct)}`}>
                      {pos.dailyPnlPct !== null ? `${pnlSign(pos.dailyPnlPct)}${fmt(pos.dailyPnlPct)}%` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.weeklyPnlAbs)}`}>
                      {pos.weeklyPnlAbs !== null ? `${pnlSign(pos.weeklyPnlAbs)}$${Math.abs(pos.weeklyPnlAbs).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.weeklyPnlPct)}`}>
                      {pos.weeklyPnlPct !== null ? `${pnlSign(pos.weeklyPnlPct)}${fmt(pos.weeklyPnlPct)}%` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-right text-xs text-gray-600">{positions.length} open position{positions.length !== 1 ? 's' : ''} · Prices from Yahoo Finance</p>
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  positive,
  neutral,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  neutral?: boolean;
}) {
  const valueColor = neutral
    ? 'text-white'
    : positive
    ? 'text-emerald-400'
    : 'text-red-400';

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-lg font-semibold font-[var(--font-mono)] ${valueColor}`}>{value}</p>
      {sub && <p className={`text-xs ${valueColor}`}>{sub}</p>}
    </div>
  );
}
