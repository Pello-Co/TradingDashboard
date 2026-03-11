'use client';

import { useState } from 'react';
import type { NewsArticle, TickerSummary, TokenUsage } from '@/app/news/page';

// ── Date helpers ─────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function getUTCDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toISOString().slice(0, 10);
}

function buildDateTabs(): { value: string; label: string; isToday: boolean }[] {
  const tabs = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const value = d.toISOString().slice(0, 10);
    const day = d.getUTCDate();
    const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
    const label = i === 0 ? `${day} ${month} (Today)` : `${day} ${month}`;
    tabs.push({ value, label, isToday: i === 0 });
  }
  return tabs;
}

// ── Shared constants ──────────────────────────────────────────────────────────

const INACTIVE_PILL = 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200 hover:border-gray-600';

// ── Utility components ────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SentimentPill({
  sentiment,
  confidence,
}: {
  sentiment: NewsArticle['sentiment'];
  confidence: string | null;
}) {
  if (!sentiment) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-800 text-gray-500 border border-gray-700">
        Pending
      </span>
    );
  }

  const pct = confidence ? Math.round(parseFloat(confidence) * 100) : null;

  const styles: Record<string, string> = {
    bullish: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    bearish: 'bg-red-500/20 text-red-300 border border-red-500/40',
    neutral: 'bg-gray-700 text-gray-300 border border-gray-600',
  };

  const labels: Record<string, string> = {
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
  };

  const dots: Record<string, string> = {
    bullish: 'bg-emerald-400',
    bearish: 'bg-red-400',
    neutral: 'bg-gray-400',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${styles[sentiment]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[sentiment]}`} />
      {labels[sentiment]}
      {pct !== null && <span className="font-normal opacity-75">{pct}%</span>}
    </span>
  );
}

interface SentimentCounts {
  bullish: number;
  bearish: number;
  neutral: number;
}

function computeSentimentCounts(articles: NewsArticle[]): SentimentCounts {
  return articles.reduce(
    (acc, a) => {
      if (a.sentiment === 'bullish') acc.bullish++;
      else if (a.sentiment === 'bearish') acc.bearish++;
      else if (a.sentiment === 'neutral') acc.neutral++;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0 }
  );
}

function getCardAccent(counts: SentimentCounts): string {
  const { bullish, bearish } = counts;
  if (bullish > bearish && bullish > counts.neutral) return 'border-l-emerald-500';
  if (bearish > bullish && bearish > counts.neutral) return 'border-l-red-500';
  return 'border-l-gray-600';
}

function getAccentBg(counts: SentimentCounts): string {
  const { bullish, bearish } = counts;
  if (bullish > bearish && bullish > counts.neutral) return 'bg-emerald-500/5';
  if (bearish > bullish && bearish > counts.neutral) return 'bg-red-500/5';
  return 'bg-gray-800/30';
}

function SentimentBreakdown({ counts }: { counts: SentimentCounts }) {
  const parts: string[] = [];
  if (counts.bullish > 0) parts.push(`${counts.bullish} Bullish`);
  if (counts.bearish > 0) parts.push(`${counts.bearish} Bearish`);
  if (counts.neutral > 0) parts.push(`${counts.neutral} Neutral`);
  if (parts.length === 0) return null;

  return (
    <span className="text-xs text-gray-500">
      {parts.map((part, i) => {
        const isFirst = i === 0;
        const color = part.includes('Bullish')
          ? 'text-emerald-400'
          : part.includes('Bearish')
          ? 'text-red-400'
          : 'text-gray-400';
        return (
          <span key={part}>
            {!isFirst && <span className="mx-1 text-gray-700">·</span>}
            <span className={color}>{part}</span>
          </span>
        );
      })}
    </span>
  );
}

function ArticleRow({ article }: { article: NewsArticle }) {
  const timeStr = relativeTime(article.published_at);

  return (
    <div className="py-3 border-t border-gray-800/60 first:border-t-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 mb-1">
        {/* Title */}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 text-sm font-medium text-gray-200 hover:text-emerald-400 transition-colors duration-150 leading-snug cursor-pointer"
        >
          {article.title}
        </a>
        {/* Sentiment pill — right of title on wider screens */}
        <div className="flex-shrink-0">
          <SentimentPill sentiment={article.sentiment} confidence={article.confidence} />
        </div>
      </div>

      {/* Source + time */}
      <p className="text-xs text-gray-600 mb-1.5">
        {article.source && <span>{article.source}</span>}
        {article.source && timeStr && <span className="mx-1">·</span>}
        {timeStr && <span>{timeStr}</span>}
      </p>

      {/* AI Summary — 1 line, truncated */}
      {article.summary && (
        <p className="text-xs text-gray-400 leading-relaxed mb-1.5 line-clamp-1">
          {article.summary}
        </p>
      )}

      {/* Tags */}
      {article.tags && article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded px-1.5 py-0.5 text-xs text-gray-600 bg-gray-800/60 border border-gray-700/40"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const RECOMMENDATION_STYLES: Record<string, { pill: string; label: string }> = {
  'buy': { pill: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40', label: 'Buy' },
  'hold': { pill: 'bg-amber-500/20 text-amber-300 border border-amber-500/40', label: 'Hold' },
  'sell': { pill: 'bg-red-500/20 text-red-300 border border-red-500/40', label: 'Sell' },
};

function TickerSummaryPanel({ summary }: { summary: TickerSummary }) {
  const rec = summary.recommendation ? RECOMMENDATION_STYLES[summary.recommendation] : null;

  return (
    <div className="mx-4 mb-3 mt-3 rounded-md bg-gray-800/50 border border-gray-700/60 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Summary</span>
        {rec && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${rec.pill}`}>
            {rec.label}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-300 leading-relaxed mb-2">{summary.overall_summary}</p>
      {(summary.catalysts || summary.risks) && (
        <div className="flex flex-col gap-1 mt-1.5">
          {summary.catalysts && (
            <p className="text-xs text-gray-500">
              <span className="text-emerald-500/80 font-medium">Catalysts: </span>
              {summary.catalysts}
            </p>
          )}
          {summary.risks && (
            <p className="text-xs text-gray-500">
              <span className="text-red-500/80 font-medium">Risks: </span>
              {summary.risks}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const ARTICLES_VISIBLE_DEFAULT = 3;

function TickerCard({
  ticker,
  articles,
  summary,
}: {
  ticker: string;
  articles: NewsArticle[];
  summary: TickerSummary | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const counts = computeSentimentCounts(articles);
  const accentBorder = getCardAccent(counts);
  const accentBg = getAccentBg(counts);
  const visibleArticles = expanded ? articles : articles.slice(0, ARTICLES_VISIBLE_DEFAULT);
  const hiddenCount = articles.length - ARTICLES_VISIBLE_DEFAULT;

  return (
    <div
      className={`border border-gray-800 border-l-2 ${accentBorder} rounded-lg overflow-hidden`}
    >
      {/* Card Header */}
      <div className={`${accentBg} px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5`}>
        <span className="inline-flex items-center rounded px-2 py-0.5 text-sm font-mono font-bold bg-gray-800 text-gray-200 border border-gray-700">
          {ticker}
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-800/80 text-gray-400 border border-gray-700/60">
          {articles.length} {articles.length === 1 ? 'article' : 'articles'}
        </span>
        <SentimentBreakdown counts={counts} />
        {summary?.recommendation && RECOMMENDATION_STYLES[summary.recommendation] && (
          <span className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${RECOMMENDATION_STYLES[summary.recommendation].pill}`}>
            {RECOMMENDATION_STYLES[summary.recommendation].label}
          </span>
        )}
      </div>

      {/* AI overall summary panel */}
      {summary && <TickerSummaryPanel summary={summary} />}

      {/* Article rows */}
      <div className="px-4 bg-gray-900/40">
        {visibleArticles.map((article) => (
          <ArticleRow key={article.id} article={article} />
        ))}
      </div>

      {/* Expand / collapse */}
      {articles.length > ARTICLES_VISIBLE_DEFAULT && (
        <div className="px-4 py-2.5 border-t border-gray-800/60 bg-gray-900/20">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors duration-150 cursor-pointer"
          >
            {expanded ? '↑ Show less' : `↓ Show ${hiddenCount} more`}
          </button>
        </div>
      )}
    </div>
  );
}

function TokenUsageFooter({ usage, date }: { usage: TokenUsage; date: string }) {
  const totalTokens = usage.input_tokens + usage.output_tokens;
  const fmtNum = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);

  // Format date for display
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDate();
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const isToday = date === todayUTC();
  const dateLabel = isToday ? `Today (${day} ${month})` : `${day} ${month}`;

  return (
    <div className="mt-8 border-t border-gray-800/60 pt-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-xs text-gray-600 font-medium uppercase tracking-wider">AI Token Usage · {dateLabel}</span>
        <span className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">{fmtNum(usage.input_tokens)}</span> in
        </span>
        <span className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">{fmtNum(usage.output_tokens)}</span> out
        </span>
        <span className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">{fmtNum(totalTokens)}</span> total
        </span>
        <span className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">{usage.api_calls}</span> API calls
        </span>
      </div>
    </div>
  );
}

type SentimentFilter = 'all' | 'bullish' | 'bearish' | 'neutral';

const SENTIMENT_FILTERS: { value: SentimentFilter; label: string; activeClass: string }[] = [
  { value: 'all', label: 'All', activeClass: 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/40' },
  { value: 'bullish', label: 'Bullish', activeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' },
  { value: 'bearish', label: 'Bearish', activeClass: 'bg-red-500/20 text-red-300 border border-red-500/40' },
  { value: 'neutral', label: 'Neutral', activeClass: 'bg-gray-700 text-gray-300 border border-gray-600' },
];

export default function NewsFeed({
  articles,
  tickerSummaries,
  tokenUsageByDate,
}: {
  articles: NewsArticle[];
  tickerSummaries: TickerSummary[];
  tokenUsageByDate: Record<string, TokenUsage>;
}) {
  const dateTabs = buildDateTabs();
  const [selectedDate, setSelectedDate] = useState<string>(dateTabs[0].value);
  const [activeTicker, setActiveTicker] = useState<string>('all');
  const [activeSentiment, setActiveSentiment] = useState<SentimentFilter>('all');

  // Filter articles by selected date, then ticker, then sentiment
  const dateFilteredArticles = articles.filter(
    (a) => getUTCDate(a.published_at) === selectedDate
  );

  const filteredArticles = dateFilteredArticles.filter((a) => {
    const tickerMatch = activeTicker === 'all' || a.ticker === activeTicker;
    const sentimentMatch = activeSentiment === 'all' || a.sentiment === activeSentiment;
    return tickerMatch && sentimentMatch;
  });

  // Tickers available for this day (before sentiment filter, for the pill row)
  const tickersForDay = Array.from(new Set(dateFilteredArticles.map((a) => a.ticker))).sort();

  // Summary map for selected date
  const summaryMap = Object.fromEntries(
    tickerSummaries
      .filter((s) => s.date === selectedDate)
      .map((s) => [s.ticker, s])
  );

  // Token usage for selected date
  const tokenUsage = tokenUsageByDate[selectedDate] ?? null;

  // Group by ticker, sort groups by most recent article first
  const groups = filteredArticles.reduce<Record<string, NewsArticle[]>>((acc, a) => {
    if (!acc[a.ticker]) acc[a.ticker] = [];
    acc[a.ticker].push(a);
    return acc;
  }, {});

  const sortedTickers = Object.keys(groups).sort((a, b) => {
    const latestA = String(groups[a][0]?.published_at ?? '');
    const latestB = String(groups[b][0]?.published_at ?? '');
    return latestB.localeCompare(latestA);
  });

  function handleDateChange(date: string) {
    setSelectedDate(date);
    setActiveTicker('all');
    setActiveSentiment('all');
  }

  return (
    <div>
      {/* Date tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
        {dateTabs.map((tab) => {
          const isActive = tab.value === selectedDate;
          return (
            <button
              key={tab.value}
              onClick={() => handleDateChange(tab.value)}
              className={[
                'flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap',
                isActive
                  ? 'bg-gray-700 text-gray-100 border border-gray-500'
                  : 'bg-gray-800/60 text-gray-500 border border-gray-700/60 hover:text-gray-300 hover:border-gray-600',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Ticker filter */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setActiveTicker('all')}
          className={[
            'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer',
            activeTicker === 'all'
              ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/40'
              : INACTIVE_PILL,
          ].join(' ')}
        >
          All
        </button>
        {tickersForDay.map((ticker) => (
          <button
            key={ticker}
            onClick={() => setActiveTicker(ticker)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium font-mono transition-colors duration-150 cursor-pointer',
              activeTicker === ticker
                ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/40'
                : INACTIVE_PILL,
            ].join(' ')}
          >
            {ticker}
          </button>
        ))}
      </div>

      {/* Sentiment filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {SENTIMENT_FILTERS.map(({ value, label, activeClass }) => (
          <button
            key={value}
            onClick={() => setActiveSentiment(value)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer',
              activeSentiment === value ? activeClass : INACTIVE_PILL,
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grouped ticker cards */}
      {dateFilteredArticles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center mb-4">
            <svg
              className="h-5 w-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-400 mb-1">No articles for this date.</p>
          <p className="text-xs text-gray-600">News is refreshed daily at 2pm UK time.</p>
        </div>
      ) : sortedTickers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-gray-400">No articles match the current filters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedTickers.map((ticker) => (
            <TickerCard
              key={ticker}
              ticker={ticker}
              articles={groups[ticker]}
              summary={summaryMap[ticker]}
            />
          ))}
        </div>
      )}

      {/* Token usage footer */}
      {tokenUsage && <TokenUsageFooter usage={tokenUsage} date={selectedDate} />}
    </div>
  );
}
