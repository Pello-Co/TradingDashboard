export interface RawArticle {
  title: string;
  url: string;
  source: string | null;
  published_at: Date;
}

function parseRssItems(xml: string): RawArticle[] {
  const articles: RawArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                       item.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/) ||
                      item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (!titleMatch || !linkMatch || !pubDateMatch) continue;

    const title = titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const url = linkMatch[1].trim();
    const source = sourceMatch ? sourceMatch[1].trim() : null;

    let published_at: Date;
    try {
      published_at = new Date(pubDateMatch[1].trim());
      if (isNaN(published_at.getTime())) continue;
    } catch {
      continue;
    }

    if (url && title) {
      articles.push({ title, url, source, published_at });
    }
  }

  return articles;
}

export async function scrapeNewsForTicker(ticker: string, companyName: string): Promise<RawArticle[]> {
  const query = encodeURIComponent(`${ticker} ${companyName} stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en&gl=GB&ceid=GB:en`;

  let xml: string;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradingDashboard/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[news] RSS fetch failed for ${ticker}: HTTP ${res.status}`);
      return [];
    }

    xml = await res.text();
  } catch (e) {
    console.warn(`[news] RSS fetch error for ${ticker}:`, e instanceof Error ? e.message : e);
    return [];
  }

  const articles = parseRssItems(xml);

  // Return only articles from the last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return articles.filter((a) => a.published_at >= cutoff);
}
