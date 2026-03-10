'use client';

import { useState, useMemo } from 'react';

export interface EnrichedPosition {
  id: number;
  ticker: string;
  name: string | null;
  yahoo_ticker: string;
  platform: string;
  direction: string;
  asset_type: string;
  option_type: string | null;
  strike_price: string | null;
  expiry_date: string | null;
  underlying_ticker: string | null;
  entry: number;
  qty: number;
  current: number | null;
  prevClose: number | null;
  weekAgo: number | null;
  marketValue: number | null;
  costBasis: number;
  totalPnlAbs: number | null;
  totalPnlPct: number | null;
  dailyPnlAbs: number | null;
  dailyPnlPct: number | null;
  weeklyPnlAbs: number | null;
  weeklyPnlPct: number | null;
}

type SortKey = 'ticker' | 'marketValue' | 'totalPnlPct' | 'dailyPnlPct' | 'weeklyPnlPct';
type SortDir = 'asc' | 'desc';
type FilterAsset = 'all' | 'stock' | 'option';
type FilterPlatform = 'all' | 'freetrade' | 'trading212' | 'ibkr' | 'crypto';

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

const TYPE_BADGE: Record<string, string> = {
  stock: 'bg-gray-800 text-gray-500 border border-gray-700',
  call: 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50',
  put: 'bg-amber-900/50 text-amber-300 border border-amber-700/50',
};

function fmt(n: number | null, decimals = 2) {
  if (n === null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(n: number | null) {
  if (n === null || isNaN(n)) return '—';
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

function fmtPnlAbs(n: number | null) {
  if (n === null) return '—';
  return `${pnlSign(n)}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPnlPct(n: number | null) {
  if (n === null) return '—';
  return `${pnlSign(n)}${fmt(n)}%`;
}

function formatOptionTicker(pos: EnrichedPosition): string {
  const type = pos.option_type === 'call' ? 'C' : 'P';
  const rawStrike = pos.strike_price ? parseFloat(pos.strike_price) : 0;
  const strikeStr = rawStrike % 1 === 0 ? String(Math.round(rawStrike)) : String(rawStrike);
  // expiry_date: "2026-04-17" → "04/17"
  const expiry = pos.expiry_date ? pos.expiry_date.substring(5).replace('-', '/') : '';
  return `${pos.underlying_ticker} $${strikeStr}${type} ${expiry}`;
}

function getTypeBadgeKey(pos: EnrichedPosition): string {
  if (pos.asset_type === 'option') return pos.option_type ?? 'call';
  return 'stock';
}

function getTypeBadgeLabel(pos: EnrichedPosition): string {
  if (pos.asset_type === 'option') return pos.option_type === 'call' ? 'CALL' : 'PUT';
  return 'STOCK';
}

function sortPositions(positions: EnrichedPosition[], key: SortKey, dir: SortDir) {
  return [...positions].sort((a, b) => {
    if (key === 'ticker') {
      const aVal = a.asset_type === 'option' ? (a.underlying_ticker ?? a.ticker) : a.ticker;
      const bVal = b.asset_type === 'option' ? (b.underlying_ticker ?? b.ticker) : b.ticker;
      return dir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    const aVal =
      key === 'marketValue' ? a.marketValue
      : key === 'totalPnlPct' ? a.totalPnlPct
      : key === 'dailyPnlPct' ? a.dailyPnlPct
      : a.weeklyPnlPct;
    const bVal =
      key === 'marketValue' ? b.marketValue
      : key === 'totalPnlPct' ? b.totalPnlPct
      : key === 'dailyPnlPct' ? b.dailyPnlPct
      : b.weeklyPnlPct;

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1; // nulls last
    if (bVal === null) return -1;
    return dir === 'asc' ? aVal - bVal : bVal - aVal;
  });
}

const HEADERS: { label: string; sortKey?: SortKey }[] = [
  { label: 'Ticker', sortKey: 'ticker' },
  { label: 'Name' },
  { label: 'Platform' },
  { label: 'Dir' },
  { label: 'Entry' },
  { label: 'Current' },
  { label: 'Qty' },
  { label: 'Mkt Value', sortKey: 'marketValue' },
  { label: 'P&L $' },
  { label: 'P&L %', sortKey: 'totalPnlPct' },
  { label: 'Day $' },
  { label: 'Day %', sortKey: 'dailyPnlPct' },
  { label: 'Wk $' },
  { label: 'Wk %', sortKey: 'weeklyPnlPct' },
];

export default function PortfolioClient({
  positions: allPositions,
  updatedAt,
}: {
  positions: EnrichedPosition[];
  updatedAt: string;
}) {
  const [filterAsset, setFilterAsset] = useState<FilterAsset>('all');
  const [filterPlatform, setFilterPlatform] = useState<FilterPlatform>('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    return allPositions.filter((p) => {
      if (filterAsset !== 'all' && p.asset_type !== filterAsset) return false;
      if (filterPlatform !== 'all' && p.platform !== filterPlatform) return false;
      return true;
    });
  }, [allPositions, filterAsset, filterPlatform]);

  const sorted = useMemo(() => sortPositions(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  // Summary totals for filtered positions
  const totalValue = filtered.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const totalPnlAbs = filtered.reduce((s, p) => s + (p.totalPnlAbs ?? 0), 0);
  const totalCostBasis = filtered.reduce((s, p) => s + p.costBasis, 0);
  const totalPnlPct = totalCostBasis > 0 ? (totalPnlAbs / totalCostBasis) * 100 : 0;
  const totalDailyPnl = filtered.reduce((s, p) => s + (p.dailyPnlAbs ?? 0), 0);
  const totalPrevValue = filtered.reduce((s, p) => {
    if (p.prevClose === null) return s;
    const m = p.asset_type === 'option' ? 100 : 1;
    return s + p.prevClose * p.qty * m;
  }, 0);
  const totalDailyPct = totalPrevValue > 0 ? (totalDailyPnl / totalPrevValue) * 100 : 0;
  const totalWeeklyPnl = filtered.reduce((s, p) => s + (p.weeklyPnlAbs ?? 0), 0);
  const totalWeekValue = filtered.reduce((s, p) => {
    if (p.weekAgo === null) return s;
    const m = p.asset_type === 'option' ? 100 : 1;
    return s + p.weekAgo * p.qty * m;
  }, 0);
  const totalWeeklyPct = totalWeekValue > 0 ? (totalWeeklyPnl / totalWeekValue) * 100 : 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ colKey }: { colKey: SortKey }) {
    if (sortKey !== colKey) return <span className="text-gray-700 ml-1">↕</span>;
    return <span className="text-gray-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const pillBase = 'px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border';
  const pillActive = 'bg-gray-600 text-white border-gray-500';
  const pillInactive = 'bg-transparent text-gray-500 hover:text-gray-300 border-gray-800';

  const assetFilters: { key: FilterAsset; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'stock', label: 'Stocks' },
    { key: 'option', label: 'Options' },
  ];

  const platformFilters: { key: FilterPlatform; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'freetrade', label: 'FreeTrade' },
    { key: 'trading212', label: 'Trading212' },
    { key: 'ibkr', label: 'IBKR' },
    { key: 'crypto', label: 'Crypto' },
  ];

  return (
    <>
      {/* Summary Bar */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Portfolio Value"
          value={`$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          neutral
        />
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

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-600 uppercase tracking-wider mr-1">Type</span>
          {assetFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterAsset(f.key)}
              className={`${pillBase} ${filterAsset === f.key ? pillActive : pillInactive}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="hidden sm:block w-px h-5 bg-gray-800" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-600 uppercase tracking-wider mr-1">Platform</span>
          {platformFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterPlatform(f.key)}
              className={`${pillBase} ${filterPlatform === f.key ? pillActive : pillInactive}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Positions Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm font-[var(--font-mono)]">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50">
              {HEADERS.map((h) => (
                <th
                  key={h.label}
                  onClick={h.sortKey ? () => handleSort(h.sortKey!) : undefined}
                  className={`whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${h.sortKey ? 'cursor-pointer hover:text-gray-300 select-none' : ''}`}
                >
                  {h.label}
                  {h.sortKey && <SortIcon colKey={h.sortKey} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-12 text-center text-gray-500">
                  No positions match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map((pos) => {
                const isOption = pos.asset_type === 'option';
                const typeBadgeKey = getTypeBadgeKey(pos);
                const typeBadgeLabel = getTypeBadgeLabel(pos);
                const displayTicker = isOption ? formatOptionTicker(pos) : pos.ticker;

                return (
                  <tr key={pos.id} className="hover:bg-gray-900/30 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-white whitespace-nowrap">{displayTicker}</span>
                        <span className={`inline-block self-start rounded px-1 py-0 text-[10px] leading-4 ${TYPE_BADGE[typeBadgeKey]}`}>
                          {typeBadgeLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs max-w-[120px] truncate">
                      {isOption ? '—' : (pos.name ?? '—')}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${PLATFORM_COLORS[pos.platform] ?? 'bg-gray-800 text-gray-400'}`}>
                        {PLATFORM_LABELS[pos.platform] ?? pos.platform}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium ${pos.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-300">{fmtPrice(pos.entry)}</td>
                    <td className="px-3 py-2.5 text-white">{fmtPrice(pos.current)}</td>
                    <td className="px-3 py-2.5 text-gray-300">
                      {isOption ? `${Math.round(pos.qty)} ct` : fmt(pos.qty, 4)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-200">
                      {pos.marketValue !== null
                        ? `$${pos.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.totalPnlAbs)}`}>{fmtPnlAbs(pos.totalPnlAbs)}</td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.totalPnlPct)}`}>{fmtPnlPct(pos.totalPnlPct)}</td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.dailyPnlAbs)}`}>{fmtPnlAbs(pos.dailyPnlAbs)}</td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.dailyPnlPct)}`}>{fmtPnlPct(pos.dailyPnlPct)}</td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.weeklyPnlAbs)}`}>{fmtPnlAbs(pos.weeklyPnlAbs)}</td>
                    <td className={`px-3 py-2.5 ${pnlClass(pos.weeklyPnlPct)}`}>{fmtPnlPct(pos.weeklyPnlPct)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-right text-xs text-gray-600">
        {sorted.length} of {allPositions.length} position{allPositions.length !== 1 ? 's' : ''} · Updated {updatedAt} · Prices from Yahoo Finance
      </p>
    </>
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
  const valueColor = neutral ? 'text-white' : positive ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-lg font-semibold font-[var(--font-mono)] ${valueColor}`}>{value}</p>
      {sub && <p className={`text-xs ${valueColor}`}>{sub}</p>}
    </div>
  );
}
