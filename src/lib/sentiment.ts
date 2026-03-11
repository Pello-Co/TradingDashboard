export interface SentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral' | null;
  confidence: number | null;
  summary: string | null;
  impact: string | null;
  relevance: number | null;
  tags: string[] | null;
  inputTokens: number;
  outputTokens: number;
}

export interface ArticleSummaryInput {
  title: string;
  sentiment: string | null;
  summary: string | null;
}

export interface TickerSummaryResult {
  overall_summary: string | null;
  recommendation: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell' | null;
  risks: string | null;
  catalysts: string | null;
  inputTokens: number;
  outputTokens: number;
}

const API_BASE_URL = 'https://api.openai.com/v1';
const MODEL = 'gpt-4o';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyseArticle(
  ticker: string,
  companyName: string,
  articleTitle: string
): Promise<SentimentResult> {
  const apiKey = process.env.OPENAI_KEY;

  if (!apiKey) {
    console.info('[sentiment] OPENAI_KEY not set — skipping analysis');
    return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null, inputTokens: 0, outputTokens: 0 };
  }

  const systemPrompt =
    'You are a financial news analyst. Analyse the following news headline for its impact on a specific stock. Respond with ONLY valid JSON, no markdown.';

  const userPrompt =
    `Analyse this headline for ${ticker} (${companyName}):\n\n"${articleTitle}"\n\n` +
    `Respond with this exact JSON structure:\n` +
    `{"sentiment": "bullish" or "bearish" or "neutral", "confidence": 0.0-1.0, "summary": "one sentence summary of the news", "impact": "one sentence on why this matters for the stock", "relevance": 0.0-1.0 how relevant this is to the stock specifically, "tags": ["array", "of", "topic", "tags"]}`;

  let responseText: string;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const res = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_completion_tokens: 256,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[sentiment] OpenAI API error ${res.status}:`, body.slice(0, 200));
      return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null, inputTokens: 0, outputTokens: 0 };
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    responseText = data?.choices?.[0]?.message?.content ?? '';
    inputTokens = data?.usage?.prompt_tokens ?? 0;
    outputTokens = data?.usage?.completion_tokens ?? 0;
  } catch (e) {
    console.warn('[sentiment] OpenAI fetch error:', e instanceof Error ? e.message : e);
    return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null, inputTokens: 0, outputTokens: 0 };
  }

  // Strip markdown code fences if present
  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const sentiment = ['bullish', 'bearish', 'neutral'].includes(String(parsed.sentiment))
      ? (parsed.sentiment as 'bullish' | 'bearish' | 'neutral')
      : null;

    const confidence =
      typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : null;

    const summary = typeof parsed.summary === 'string' ? parsed.summary : null;
    const impact = typeof parsed.impact === 'string' ? parsed.impact : null;

    const relevance =
      typeof parsed.relevance === 'number' && parsed.relevance >= 0 && parsed.relevance <= 1
        ? parsed.relevance
        : null;

    const tags = Array.isArray(parsed.tags)
      ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : null;

    return { sentiment, confidence, summary, impact, relevance, tags, inputTokens, outputTokens };
  } catch (e) {
    console.warn('[sentiment] Failed to parse response:', responseText.slice(0, 200), e);
    return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null, inputTokens, outputTokens };
  }
}

export async function generateTickerSummary(
  ticker: string,
  companyName: string,
  articles: ArticleSummaryInput[]
): Promise<TickerSummaryResult> {
  const apiKey = process.env.OPENAI_KEY;

  if (!apiKey) {
    console.info('[sentiment] OPENAI_KEY not set — skipping ticker summary');
    return { overall_summary: null, recommendation: null, risks: null, catalysts: null, inputTokens: 0, outputTokens: 0 };
  }

  if (articles.length === 0) {
    return { overall_summary: null, recommendation: null, risks: null, catalysts: null, inputTokens: 0, outputTokens: 0 };
  }

  const articleLines = articles
    .map((a, i) => {
      const sentiment = a.sentiment ?? 'unknown';
      const summary = a.summary ?? a.title;
      return `${i + 1}. [${sentiment.toUpperCase()}] ${summary}`;
    })
    .join('\n');

  const userPrompt =
    `You are a financial analyst. Given these news summaries about ${ticker} (${companyName}), provide:\n` +
    `1. An overall summary (2-3 sentences) of the news landscape\n` +
    `2. A recommendation: Strong Buy, Buy, Hold, Sell, or Strong Sell\n` +
    `3. Key risks (1 sentence)\n` +
    `4. Key catalysts (1 sentence)\n\n` +
    `News summaries:\n${articleLines}\n\n` +
    `Respond with ONLY valid JSON:\n` +
    `{"overall_summary": "...", "recommendation": "Strong Buy|Buy|Hold|Sell|Strong Sell", "risks": "...", "catalysts": "..."}`;

  let responseText: string;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const res = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
        max_completion_tokens: 512,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[sentiment] Ticker summary API error ${res.status}:`, body.slice(0, 200));
      return { overall_summary: null, recommendation: null, risks: null, catalysts: null, inputTokens: 0, outputTokens: 0 };
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    responseText = data?.choices?.[0]?.message?.content ?? '';
    inputTokens = data?.usage?.prompt_tokens ?? 0;
    outputTokens = data?.usage?.completion_tokens ?? 0;
  } catch (e) {
    console.warn('[sentiment] Ticker summary fetch error:', e instanceof Error ? e.message : e);
    return { overall_summary: null, recommendation: null, risks: null, catalysts: null, inputTokens: 0, outputTokens: 0 };
  }

  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const validRecommendations = ['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'];
    const recommendation = validRecommendations.includes(String(parsed.recommendation))
      ? (parsed.recommendation as TickerSummaryResult['recommendation'])
      : null;

    return {
      overall_summary: typeof parsed.overall_summary === 'string' ? parsed.overall_summary : null,
      recommendation,
      risks: typeof parsed.risks === 'string' ? parsed.risks : null,
      catalysts: typeof parsed.catalysts === 'string' ? parsed.catalysts : null,
      inputTokens,
      outputTokens,
    };
  } catch (e) {
    console.warn('[sentiment] Failed to parse ticker summary:', responseText.slice(0, 200), e);
    return { overall_summary: null, recommendation: null, risks: null, catalysts: null, inputTokens, outputTokens };
  }
}

export { sleep };
