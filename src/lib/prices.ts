export interface QuoteResult {
  ticker: string;
  currentPrice: number | null;
  previousClose: number | null;
  regularMarketChange: number | null;
  regularMarketChangePercent: number | null;
}

export interface WeeklyChangeResult {
  ticker: string;
  weekAgoClose: number | null;
}

async function fetchChart(ticker: string, range: string, interval: string): Promise<unknown> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
    next: { revalidate: 300 }, // cache 5 min
  });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${ticker}`);
  return res.json();
}

export async function fetchQuotes(yahooTickers: string[]): Promise<Map<string, QuoteResult>> {
  const results = new Map<string, QuoteResult>();

  await Promise.all(
    yahooTickers.map(async (ticker) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await fetchChart(ticker, '1d', '1d');
        const meta = data?.chart?.result?.[0]?.meta;

        const currentPrice: number | null = meta?.regularMarketPrice ?? null;
        const previousClose: number | null = meta?.previousClose ?? meta?.chartPreviousClose ?? null;
        const regularMarketChange =
          currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null;
        const regularMarketChangePercent =
          regularMarketChange !== null && previousClose ? (regularMarketChange / previousClose) * 100 : null;

        results.set(ticker, {
          ticker,
          currentPrice,
          previousClose,
          regularMarketChange,
          regularMarketChangePercent,
        });
      } catch {
        results.set(ticker, {
          ticker,
          currentPrice: null,
          previousClose: null,
          regularMarketChange: null,
          regularMarketChangePercent: null,
        });
      }
    })
  );

  return results;
}

export async function fetchWeeklyChange(yahooTickers: string[]): Promise<Map<string, WeeklyChangeResult>> {
  const results = new Map<string, WeeklyChangeResult>();

  await Promise.all(
    yahooTickers.map(async (ticker) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await fetchChart(ticker, '10d', '1d');
        const closes: (number | null)[] | undefined =
          data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;

        // First non-null close in the 10-day window = ~week ago
        const weekAgoClose =
          Array.isArray(closes) && closes.length > 0
            ? (closes.find((v) => v !== null && v !== undefined) ?? null)
            : null;

        results.set(ticker, { ticker, weekAgoClose });
      } catch {
        results.set(ticker, { ticker, weekAgoClose: null });
      }
    })
  );

  return results;
}
