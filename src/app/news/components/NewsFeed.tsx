'use client';

import { useState } from 'react';
import type { NewsArticle } from '@/app/news/page';

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

function SentimentBadge({
  sentiment,
  confidence,
}: {
  sentiment: NewsArticle['sentiment'];
  confidence: string | null;
}) {
  if (!sentiment) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-gray-800 text-gray-500 border border-gray-700">
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${styles[sentiment]}`}>
      <span className={`h-2 w-2 rounded-full ${dots[sentiment]}`} />
      {labels[sentiment]}
      {pct !== null && <span className="font-normal opacity-80">{pct}%</span>}
    </span>
  );
}

function TickerBadge({ ticker }: { ticker: string }) {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-semibold bg-gray-800 text-gray-300 border border-gray-700">
      {ticker}
    </span>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  const timeStr = relativeTime(article.published_at);

  return (
    <article className="border border-gray-800 rounded-lg bg-gray-900/50 p-4 hover:bg-gray-900/80 transition-colors">
      {/* Header row: ticker + sentiment */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <TickerBadge ticker={article.ticker} />
        <SentimentBadge sentiment={article.sentiment} confidence={article.sentiment_confidence} />
      </div>

      {/* Title */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-medium text-gray-100 hover:text-emerald-400 transition-colors leading-snug mb-2"
      >
        {article.title}
      </a>

      {/* Source + time */}
      <p className="text-xs text-gray-500 mb-3">
        {article.source && <span>{article.source}</span>}
        {article.source && timeStr && <span className="mx-1">·</span>}
        {timeStr && <span>{timeStr}</span>}
      </p>

      {/* AI Summary */}
      {article.summary && (
        <p className="text-xs text-gray-300 leading-relaxed mb-2">{article.summary}</p>
      )}

      {/* AI Impact */}
      {article.impact && (
        <p className="text-xs text-gray-500 leading-relaxed mb-3">{article.impact}</p>
      )}

      {/* Tags */}
      {article.tags && article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded px-1.5 py-0.5 text-xs text-gray-500 bg-gray-800/60 border border-gray-700/50"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

type SentimentFilter = 'all' | 'bullish' | 'bearish' | 'neutral';

const SENTIMENT_FILTERS: { value: SentimentFilter; label: string; activeClass: string }[] = [
  { value: 'all', label: 'All', activeClass: 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/40' },
  { value: 'bullish', label: 'Bullish', activeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' },
  { value: 'bearish', label: 'Bearish', activeClass: 'bg-red-500/20 text-red-300 border border-red-500/40' },
  { value: 'neutral', label: 'Neutral', activeClass: 'bg-gray-700 text-gray-300 border border-gray-600' },
];

const INACTIVE_PILL = 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200 hover:border-gray-600';

export default function NewsFeed({ articles }: { articles: NewsArticle[] }) {
  // Collect unique tickers
  const tickers = Array.from(new Set(articles.map((a) => a.ticker))).sort();
  const [activeTicker, setActiveTicker] = useState<string>('all');
  const [activeSentiment, setActiveSentiment] = useState<SentimentFilter>('all');

  const filtered = articles.filter((a) => {
    const tickerMatch = activeTicker === 'all' || a.ticker === activeTicker;
    const sentimentMatch = activeSentiment === 'all' || a.sentiment === activeSentiment;
    return tickerMatch && sentimentMatch;
  });

  return (
    <div>
      {/* Ticker filter */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setActiveTicker('all')}
          className={[
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            activeTicker === 'all'
              ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/40'
              : INACTIVE_PILL,
          ].join(' ')}
        >
          All
        </button>
        {tickers.map((ticker) => (
          <button
            key={ticker}
            onClick={() => setActiveTicker(ticker)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium font-mono transition-colors',
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
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              activeSentiment === value ? activeClass : INACTIVE_PILL,
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Article list */}
      {filtered.length === 0 ? (
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
          <p className="text-sm text-gray-400 mb-1">No news articles yet.</p>
          <p className="text-xs text-gray-600">News is refreshed daily at 2pm UK time.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((article) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
