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
        <NewsFeed articles={articles} />
      </main>
    </div>
  );
}
