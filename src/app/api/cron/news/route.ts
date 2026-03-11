import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { scrapeNewsForTicker, RawArticle } from '@/lib/news';
import { analyseArticle, sleep } from '@/lib/sentiment';

interface PositionRow {
  ticker: string;
  name: string | null;
  asset_type: string;
  underlying_ticker: string | null;
}

interface TickerInfo {
  ticker: string;
  companyName: string;
}

export async function GET(req: NextRequest) {
  // Auth check: require CRON_SECRET if set
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!sql) {
    return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
  }

  // 1. Fetch all open positions
  let positions: PositionRow[];
  try {
    positions = (await sql`
      SELECT ticker, name, asset_type, underlying_ticker
      FROM positions
      WHERE status = 'open'
    `) as PositionRow[];
  } catch (e) {
    console.error('[cron/news] Failed to fetch positions:', e);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  // 2. Deduplicate tickers — for options, use underlying_ticker
  const tickerMap = new Map<string, TickerInfo>();
  for (const pos of positions) {
    const effectiveTicker = pos.asset_type === 'option' && pos.underlying_ticker
      ? pos.underlying_ticker
      : pos.ticker;
    if (!tickerMap.has(effectiveTicker)) {
      tickerMap.set(effectiveTicker, {
        ticker: effectiveTicker,
        companyName: pos.name ?? effectiveTicker,
      });
    }
  }

  const tickers = Array.from(tickerMap.values());

  // 3. Fetch existing URLs from DB to deduplicate
  let existingUrls = new Set<string>();
  try {
    const rows = (await sql`SELECT url FROM news_articles`) as Array<{ url: string }>;
    existingUrls = new Set(rows.map((r) => r.url));
  } catch (e) {
    console.warn('[cron/news] Could not fetch existing URLs:', e);
  }

  let tickersProcessed = 0;
  let articlesFound = 0;
  let articlesNew = 0;
  let articlesAnalysed = 0;

  for (const { ticker, companyName } of tickers) {
    tickersProcessed++;
    let articles: RawArticle[] = [];

    try {
      articles = await scrapeNewsForTicker(ticker, companyName);
    } catch (e) {
      console.warn(`[cron/news] Scrape failed for ${ticker}:`, e);
      continue;
    }

    articlesFound += articles.length;

    // Filter out already-stored articles
    const newArticles = articles.filter((a) => !existingUrls.has(a.url));
    articlesNew += newArticles.length;

    for (const article of newArticles) {
      // Insert article with null sentiment fields first
      let insertedId: number | null = null;
      try {
        const inserted = (await sql`
          INSERT INTO news_articles (ticker, title, url, source, published_at, raw_title)
          VALUES (${ticker}, ${article.title}, ${article.url}, ${article.source}, ${article.published_at}, ${article.title})
          ON CONFLICT (url) DO NOTHING
          RETURNING id
        `) as Array<{ id: number }>;
        insertedId = inserted[0]?.id ?? null;
        existingUrls.add(article.url);
      } catch (e) {
        console.warn(`[cron/news] Insert failed for "${article.title}":`, e);
        continue;
      }

      if (!insertedId) continue;

      // Run sentiment analysis with delay between calls
      await sleep(200);
      const sentiment = await analyseArticle(ticker, companyName, article.title);

      if (sentiment.sentiment !== null) {
        try {
          await sql`
            UPDATE news_articles
            SET
              sentiment = ${sentiment.sentiment},
              sentiment_confidence = ${sentiment.confidence},
              summary = ${sentiment.summary},
              impact = ${sentiment.impact},
              relevance = ${sentiment.relevance},
              tags = ${sentiment.tags}
            WHERE id = ${insertedId}
          `;
          articlesAnalysed++;
        } catch (e) {
          console.warn(`[cron/news] Update sentiment failed for id ${insertedId}:`, e);
        }
      }
    }
  }

  // Backfill: analyse any existing articles with null sentiment
  let articlesBackfilled = 0;
  try {
    const unanalysed = (await sql`
      SELECT id, ticker, title FROM news_articles
      WHERE sentiment IS NULL
      ORDER BY published_at DESC
      LIMIT 100
    `) as Array<{ id: number; ticker: string; title: string }>;

    for (const article of unanalysed) {
      const info = tickerMap.get(article.ticker);
      const companyName = info?.companyName ?? article.ticker;

      await sleep(200);
      const sentiment = await analyseArticle(article.ticker, companyName, article.title);

      if (sentiment.sentiment !== null) {
        try {
          await sql`
            UPDATE news_articles
            SET
              sentiment = ${sentiment.sentiment},
              sentiment_confidence = ${sentiment.confidence},
              summary = ${sentiment.summary},
              impact = ${sentiment.impact},
              relevance = ${sentiment.relevance},
              tags = ${sentiment.tags}
            WHERE id = ${article.id}
          `;
          articlesBackfilled++;
        } catch (e) {
          console.warn(`[cron/news] Backfill update failed for id ${article.id}:`, e);
        }
      }
    }
  } catch (e) {
    console.warn('[cron/news] Backfill query failed:', e);
  }

  return NextResponse.json({
    tickersProcessed,
    articlesFound,
    articlesNew,
    articlesAnalysed,
    articlesBackfilled,
    completedAt: new Date().toISOString(),
  });
}
