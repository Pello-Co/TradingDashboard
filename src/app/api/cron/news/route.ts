import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { scrapeNewsForTicker, RawArticle } from '@/lib/news';
import { analyseArticle, generateTickerSummary, ArticleSummaryInput, sleep } from '@/lib/sentiment';

interface PositionRow {
  ticker: string;
  display_name: string | null;
  asset_type: string;
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

  // 1. Fetch all open positions (superuser connection bypasses RLS — sees all users)
  let positions: PositionRow[];
  try {
    positions = (await sql`
      SELECT ticker, display_name, asset_type
      FROM positions
      WHERE is_closed = false
    `) as PositionRow[];
  } catch (e) {
    console.error('[cron/news] Failed to fetch positions:', e);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  // 2. Deduplicate tickers — for options (call/put), ticker IS the underlying
  const tickerMap = new Map<string, TickerInfo>();
  for (const pos of positions) {
    if (!tickerMap.has(pos.ticker)) {
      tickerMap.set(pos.ticker, {
        ticker: pos.ticker,
        companyName: pos.display_name ?? pos.ticker,
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
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalApiCalls = 0;

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

    // Track article summaries for this ticker (for the overall summary)
    const tickerArticleSummaries: ArticleSummaryInput[] = [];

    for (const article of newArticles) {
      // Insert article with null sentiment fields first
      let insertedId: string | null = null;
      try {
        const inserted = (await sql`
          INSERT INTO news_articles (ticker, title, url, source, published_at)
          VALUES (${ticker}, ${article.title}, ${article.url}, ${article.source}, ${article.published_at})
          ON CONFLICT (url) DO NOTHING
          RETURNING id::text
        `) as Array<{ id: string }>;
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
      totalInputTokens += sentiment.inputTokens;
      totalOutputTokens += sentiment.outputTokens;
      totalApiCalls++;

      if (sentiment.sentiment !== null) {
        try {
          await sql`
            UPDATE news_articles
            SET
              sentiment = ${sentiment.sentiment},
              confidence = ${sentiment.confidence},
              summary = ${sentiment.summary},
              impact = ${sentiment.impact},
              tags = ${sentiment.tags}
            WHERE id = ${insertedId}::uuid
          `;
          articlesAnalysed++;
        } catch (e) {
          console.warn(`[cron/news] Update sentiment failed for id ${insertedId}:`, e);
        }
      }

      tickerArticleSummaries.push({
        title: article.title,
        sentiment: sentiment.sentiment,
        summary: sentiment.summary,
      });
    }

    // Also include any existing articles from today that weren't newly added
    if (tickerArticleSummaries.length === 0) {
      try {
        const existing = (await sql`
          SELECT title, sentiment, summary FROM news_articles
          WHERE ticker = ${ticker}
            AND published_at >= NOW() - INTERVAL '7 days'
          ORDER BY published_at DESC
          LIMIT 20
        `) as Array<{ title: string; sentiment: string | null; summary: string | null }>;
        for (const row of existing) {
          tickerArticleSummaries.push({ title: row.title, sentiment: row.sentiment, summary: row.summary });
        }
      } catch (e) {
        console.warn(`[cron/news] Could not fetch existing articles for ${ticker} summary:`, e);
      }
    }

    // Generate overall ticker summary if we have articles
    if (tickerArticleSummaries.length > 0) {
      await sleep(300);
      const summary = await generateTickerSummary(ticker, companyName, tickerArticleSummaries);
      totalInputTokens += summary.inputTokens;
      totalOutputTokens += summary.outputTokens;
      totalApiCalls++;

      if (summary.overall_summary) {
        try {
          await sql`
            INSERT INTO ticker_summaries (ticker, date, overall_summary, recommendation, risks, catalysts)
            VALUES (
              ${ticker},
              CURRENT_DATE,
              ${summary.overall_summary},
              ${summary.recommendation},
              ${summary.risks},
              ${summary.catalysts}
            )
            ON CONFLICT (ticker, date)
            DO UPDATE SET
              overall_summary = EXCLUDED.overall_summary,
              recommendation = EXCLUDED.recommendation,
              risks = EXCLUDED.risks,
              catalysts = EXCLUDED.catalysts
          `;
        } catch (e) {
          console.warn(`[cron/news] Failed to upsert ticker_summary for ${ticker}:`, e);
        }
      }
    }
  }

  // Backfill: analyse any existing articles with null sentiment
  let articlesBackfilled = 0;
  try {
    const unanalysed = (await sql`
      SELECT id::text, ticker, title FROM news_articles
      WHERE sentiment IS NULL
      ORDER BY published_at DESC
      LIMIT 100
    `) as Array<{ id: string; ticker: string; title: string }>;

    for (const article of unanalysed) {
      const info = tickerMap.get(article.ticker);
      const companyName = info?.companyName ?? article.ticker;

      await sleep(200);
      const sentiment = await analyseArticle(article.ticker, companyName, article.title);
      totalInputTokens += sentiment.inputTokens;
      totalOutputTokens += sentiment.outputTokens;
      totalApiCalls++;

      if (sentiment.sentiment !== null) {
        try {
          await sql`
            UPDATE news_articles
            SET
              sentiment = ${sentiment.sentiment},
              confidence = ${sentiment.confidence},
              summary = ${sentiment.summary},
              impact = ${sentiment.impact},
              tags = ${sentiment.tags}
            WHERE id = ${article.id}::uuid
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

  // Persist token usage for today
  if (totalApiCalls > 0) {
    try {
      await sql`
        INSERT INTO token_usage_log (date, input_tokens, output_tokens, api_calls, updated_at)
        VALUES (CURRENT_DATE, ${totalInputTokens}, ${totalOutputTokens}, ${totalApiCalls}, NOW())
        ON CONFLICT (date)
        DO UPDATE SET
          input_tokens = token_usage_log.input_tokens + EXCLUDED.input_tokens,
          output_tokens = token_usage_log.output_tokens + EXCLUDED.output_tokens,
          api_calls = token_usage_log.api_calls + EXCLUDED.api_calls,
          updated_at = NOW()
      `;
    } catch (e) {
      console.warn('[cron/news] Failed to upsert token_usage_log:', e);
    }
  }

  return NextResponse.json({
    tickersProcessed,
    articlesFound,
    articlesNew,
    articlesAnalysed,
    articlesBackfilled,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      apiCalls: totalApiCalls,
    },
    completedAt: new Date().toISOString(),
  });
}
