export interface SentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral' | null;
  confidence: number | null;
  summary: string | null;
  impact: string | null;
  relevance: number | null;
  tags: string[] | null;
}

const API_BASE_URL = 'https://api.openai.com/v1';
const MODEL = 'gpt-5-mini';

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
    return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null };
  }

  const systemPrompt =
    'You are a financial news analyst. Analyse the following news headline for its impact on a specific stock. Respond with ONLY valid JSON, no markdown.';

  const userPrompt =
    `Analyse this headline for ${ticker} (${companyName}):\n\n"${articleTitle}"\n\n` +
    `Respond with this exact JSON structure:\n` +
    `{"sentiment": "bullish" or "bearish" or "neutral", "confidence": 0.0-1.0, "summary": "one sentence summary of the news", "impact": "one sentence on why this matters for the stock", "relevance": 0.0-1.0 how relevant this is to the stock specifically, "tags": ["array", "of", "topic", "tags"]}`;

  let responseText: string;
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
        max_tokens: 256,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[sentiment] OpenAI API error ${res.status}:`, body.slice(0, 200));
      return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null };
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    responseText = data?.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    console.warn('[sentiment] OpenAI fetch error:', e instanceof Error ? e.message : e);
    return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null };
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

    return { sentiment, confidence, summary, impact, relevance, tags };
  } catch (e) {
    console.warn('[sentiment] Failed to parse response:', responseText.slice(0, 200), e);
    return { sentiment: null, confidence: null, summary: null, impact: null, relevance: null, tags: null };
  }
}

export { sleep };
