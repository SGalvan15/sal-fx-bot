// AXIOM FX — News Netlify Function
// Layer 1: Fetches real forex news from Finnhub (real articles, real URLs, real timestamps)
// Layer 2: Falls back to Claude AI enrichment if Finnhub key not set
// No hallucinated URLs — all articles are real or clearly labelled AI analysis

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Map Finnhub categories/sources to G10 currency codes
function extractCcy(headline, summary) {
  const text = ((headline || '') + ' ' + (summary || '')).toUpperCase();
  const pairs = [
    ['JPY', ['YEN','BOJ','BANK OF JAPAN','UEDA','JAPAN','USD/JPY','EUR/JPY','GBP/JPY']],
    ['EUR', ['ECB','EUROPEAN CENTRAL BANK','LAGARDE','SCHNABEL','EUROZONE','EUR/USD','EUR/GBP']],
    ['GBP', ['BOE','BANK OF ENGLAND','BAILEY','STERLING','POUND','GBP/USD']],
    ['CHF', ['SNB','SWISS','FRANC','CHF']],
    ['AUD', ['RBA','RESERVE BANK OF AUSTRALIA','BULLOCK','AUSSIE','AUD/USD']],
    ['NZD', ['RBNZ','RESERVE BANK OF NEW ZEALAND','KIWI','NZD/USD']],
    ['CAD', ['BOC','BANK OF CANADA','MACKLEM','LOONIE','CAD']],
    ['NOK', ['NORGES BANK','NORWAY','NOK']],
    ['SEK', ['RIKSBANK','SWEDEN','SWEDISH','SEK']],
    ['USD', ['FED','FEDERAL RESERVE','POWELL','FOMC','DOLLAR','DXY','USD']],
  ];
  for (const [ccy, keywords] of pairs) {
    if (keywords.some(k => text.includes(k))) return ccy;
  }
  return 'USD';
}

function extractImpact(headline, summary) {
  const text = ((headline || '') + ' ' + (summary || '')).toUpperCase();
  const bullish = ['HIKE','HAWKISH','BEAT','ABOVE','STRONG','SURGE','RALLY','GAINS','HIGHER','RISE','BULLISH','CUT EXPECTATIONS','BETTER THAN'];
  const bearish = ['CUT','DOVISH','MISS','BELOW','WEAK','DROP','FALL','LOWER','DECLINE','BEARISH','RECESSION','CONTRACTION','SLUMP'];
  const bScore = bullish.filter(w => text.includes(w)).length;
  const dScore = bearish.filter(w => text.includes(w)).length;
  if (bScore > dScore) return 'BULLISH';
  if (dScore > bScore) return 'BEARISH';
  return 'NEUTRAL';
}

function extractImp(headline, category) {
  const text = (headline || '').toUpperCase();
  const high = ['CPI','NFP','NON-FARM','INTEREST RATE','RATE DECISION','FOMC','ECB','BOJ','BOE','RBA','RBNZ','BOC','SNB','GDP','FEDERAL RESERVE','CENTRAL BANK','INFLATION'];
  const low = ['COMMENT','SAYS','NOTES','EXPECTS','ANALYST','FORECAST'];
  if (high.some(w => text.includes(w))) return 'HIGH';
  if (low.some(w => text.includes(w))) return 'LOW';
  return 'MED';
}

async function fetchFinnhubNews(category) {
  if (!FINNHUB_KEY) return null;
  try {
    // Fetch general forex news — category=forex gives FX-specific articles
    const url = `https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Finnhub ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');

    // Also fetch general financial news to supplement
    const url2 = `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`;
    const res2 = await fetch(url2, { signal: AbortSignal.timeout(8000) });
    const data2 = res2.ok ? await res2.json() : [];

    const combined = [...data, ...(Array.isArray(data2) ? data2 : [])];

    // Filter to FX-relevant articles and deduplicate
    const fxKeywords = ['forex','currency','dollar','euro','yen','pound','franc','yuan','fed','ecb','boj','boe','rba','rbnz','boc','snb','rate','central bank','monetary','inflation','gdp','nfp','payroll','cpi','trade','tariff','fx','exchange rate'];
    const seen = new Set();
    const articles = combined
      .filter(a => {
        if (!a.headline || !a.url) return false;
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        const text = ((a.headline || '') + ' ' + (a.summary || '')).toLowerCase();
        return fxKeywords.some(k => text.includes(k));
      })
      .slice(0, 50)
      .map(a => {
        const ccy = extractCcy(a.headline, a.summary);
        const impact = extractImpact(a.headline, a.summary);
        const imp = extractImp(a.headline, a.category);
        // Format timestamp from Unix to YYYY-MM-DD HH:mm
        const d = new Date(a.datetime * 1000);
        const dt = d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0') + ' ' +
          String(d.getHours()).padStart(2, '0') + ':' +
          String(d.getMinutes()).padStart(2, '0');
        return {
          id: `finnhub_${a.id}`,
          dt,
          ccy,
          hl: a.headline,
          detail: a.summary ? a.summary.slice(0, 200) : '',
          impact,
          imp,
          url: a.url,          // REAL URL — not hallucinated
          source: a.source || 'Finnhub',
          image: a.image || null,
          realSource: true,    // flag so UI knows this is a real article
        };
      });

    return articles.length > 0 ? articles : null;
  } catch (e) {
    console.error('Finnhub error:', e.message);
    return null;
  }
}

async function fetchClaudeEnrichedNews(todayDate, ccyFilter, impFilter) {
  if (!ANTHROPIC_KEY) throw new Error('No API key configured');

  const ccyContext = ccyFilter && ccyFilter !== 'ALL' ? ` Focus exclusively on ${ccyFilter}.` : '';
  const impContext = impFilter && impFilter !== 'ALL' ? ` Include only ${impFilter} impact events.` : '';

  const prompt = `Today is ${todayDate}. Generate 15 institutional G10 FX news analysis items grounded in confirmed April 2026 macro reality: BOJ hiking at 0.75% (only G10 hiker, structural JPY bid), ECB hawkish hold 2.00% (Schnabel hike bias), Fed hold 3.875% (tariff uncertainty, June cut 38%), RBNZ just cut to 3.00% Apr 9, RBA hold 3.85% (Bullock hawkish), BOC 2.25% (dovish), EUR/USD ~1.168, USD/JPY ~158.4, DXY testing 100 handle, 90-day tariff pause in effect, US CPI Apr 10 key event.${ccyContext}${impContext}

For each item provide:
- dt: Use ${todayDate} with realistic trading session times (00:00-23:59)
- ccy: Single G10 currency code (USD/EUR/GBP/JPY/AUD/CAD/CHF/NZD/NOK/SEK)
- hl: 80-120 character institutional-grade headline (specific, data-driven)
- detail: 2 precise sentences with exact figures, levels, and context
- impact: BULLISH/BEARISH/NEUTRAL (for the named currency)
- imp: HIGH/MED/LOW
- source: Real publication name (Reuters, Bloomberg, FT, WSJ, ECB, BOJ, Fed, etc.)
- url: Leave as "" — do not invent URLs

Respond ONLY with a valid JSON array starting with [ and ending with ]. No markdown, no backticks.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in response');
  const arts = JSON.parse(match[0]);
  if (!Array.isArray(arts) || !arts.length) throw new Error('Empty array');

  return arts.map((a, i) => ({
    ...a,
    id: `ai_${Date.now()}_${i}`,
    url: '',          // explicitly no URL for AI-generated items
    realSource: false,
  }));
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    };
  }

  const params = event.queryStringParameters || {};
  const ccyFilter = params.ccy || 'ALL';
  const impFilter = params.imp || 'ALL';

  // Get today's date in local server time (UTC — close enough for news context)
  const now = new Date();
  const todayDate = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  try {
    // Layer 1: Try Finnhub for real articles
    let articles = await fetchFinnhubNews();

    if (articles && articles.length > 0) {
      // Apply client filters on the server side
      let filtered = articles;
      if (ccyFilter !== 'ALL') filtered = filtered.filter(a => a.ccy === ccyFilter);
      if (impFilter !== 'ALL') filtered = filtered.filter(a => a.imp === impFilter);
      // If filtering left nothing, return unfiltered (client will handle display)
      const result = filtered.length > 0 ? filtered : articles;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300', // 5-min cache
        },
        body: JSON.stringify({ articles: result, source: 'finnhub', date: todayDate }),
      };
    }

    // Layer 2: Finnhub not available — use Claude AI analysis (with no fake URLs)
    const aiArticles = await fetchClaudeEnrichedNews(todayDate, ccyFilter, impFilter);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ articles: aiArticles, source: 'ai', date: todayDate }),
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message, articles: [], source: 'error', date: todayDate }),
    };
  }
};
