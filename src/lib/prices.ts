import yahooFinance from 'yahoo-finance2';

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

const moduleOpts = { validateResult: false } as const;

export async function fetchQuotes(yahooTickers: string[]): Promise<Map<string, QuoteResult>> {
  const results = new Map<string, QuoteResult>();

  await Promise.all(
    yahooTickers.map(async (ticker) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quote: any = await yahooFinance.quote(ticker, {}, moduleOpts);
        results.set(ticker, {
          ticker,
          currentPrice: quote?.regularMarketPrice ?? null,
          previousClose: quote?.regularMarketPreviousClose ?? null,
          regularMarketChange: quote?.regularMarketChange ?? null,
          regularMarketChangePercent: quote?.regularMarketChangePercent ?? null,
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

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 10); // 10 days back to ensure ~5 trading days

  await Promise.all(
    yahooTickers.map(async (ticker) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const historical: any[] = await yahooFinance.historical(
          ticker,
          { period1: startDate, period2: endDate, interval: '1d' },
          moduleOpts
        );

        // Sorted oldest to newest — take the first entry as ~week ago close
        const weekAgoClose = Array.isArray(historical) && historical.length > 0
          ? (historical[0]?.close ?? null)
          : null;

        results.set(ticker, { ticker, weekAgoClose });
      } catch {
        results.set(ticker, { ticker, weekAgoClose: null });
      }
    })
  );

  return results;
}
