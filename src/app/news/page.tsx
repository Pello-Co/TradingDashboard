export const dynamic = 'force-dynamic';

import { sql, dbError } from '@/lib/db';
import TabNav from '@/app/components/TabNav';
import NewsFeed from '@/app/news/components/NewsFeed';

export interface NewsArticle {
  id: number;
  ticker: string;
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  sentiment: 'bullish' | 'bearish' | 'neutral' | null;
  sentiment_confidence: string | null;
  summary: string | null;
  impact: string | null;
  relevance: string | null;
  tags: string[] | null;
}

export interface TickerSummary {
  ticker: string;
  overall_summary: string;
  recommendation: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
  risks: string | null;
  catalysts: string | null;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  api_calls: number;
}

export default async function NewsPage() {
  if (!sql) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Config Error</h1>
          <p className="text-gray-400">{dbError || 'DATABASE_URL not configured'}</p>
        </div>
      </div>
    );
  }

  let articles: NewsArticle[] = [];
  try {
    articles = (await sql`
      SELECT id, ticker, title, url, source, published_at,
             sentiment, sentiment_confidence, summary, impact, relevance, tags
      FROM news_articles
      WHERE published_at >= NOW() - INTERVAL '7 days'
      ORDER BY published_at DESC
    `) as NewsArticle[];
  } catch (e) {
    console.error('[news page] DB query failed:', e);
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Database Error</h1>
          <p className="text-gray-400">{e instanceof Error ? e.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  let tickerSummaries: TickerSummary[] = [];
  try {
    tickerSummaries = (await sql`
      SELECT ticker, overall_summary, recommendation, risks, catalysts
      FROM ticker_summaries
      WHERE date = CURRENT_DATE
        AND overall_summary IS NOT NULL
    `) as TickerSummary[];
  } catch (e) {
    console.warn('[news page] ticker_summaries query failed:', e);
  }

  let tokenUsage: TokenUsage | null = null;
  try {
    const rows = (await sql`
      SELECT
        SUM(input_tokens)::int AS input_tokens,
        SUM(output_tokens)::int AS output_tokens,
        SUM(api_calls)::int AS api_calls
      FROM token_usage_log
      WHERE date >= NOW() - INTERVAL '7 days'
    `) as Array<{ input_tokens: number | null; output_tokens: number | null; api_calls: number | null }>;
    const row = rows[0];
    if (row?.input_tokens != null) {
      tokenUsage = {
        input_tokens: row.input_tokens ?? 0,
        output_tokens: row.output_tokens ?? 0,
        api_calls: row.api_calls ?? 0,
      };
    }
  } catch (e) {
    console.warn('[news page] token_usage_log query failed:', e);
  }

  // Build a map for easy lookup in the component
  const summaryMap = Object.fromEntries(tickerSummaries.map((s) => [s.ticker, s]));

  return (
    <div className="min-h-screen bg-gray-950 font-[var(--font-inter)]">
      <header className="border-b border-gray-800 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-sm font-semibold tracking-widest text-gray-300 uppercase">Trading Terminal</h1>
          </div>
        </div>
      </header>

      <TabNav />

      <main className="px-4 py-6 sm:px-6">
        <NewsFeed articles={articles} summaryMap={summaryMap} tokenUsage={tokenUsage} />
      </main>
    </div>
  );
}
