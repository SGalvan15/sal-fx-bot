// AXIOM FX — Live FX news proxy v1.0 (NEW — fixes the missing news.js gap)
// Source: Finnhub /api/v1/news?category=forex — real headlines, real URLs, real wires.
// Design rules honored:
//   • NO AI fallback, NO fabricated articles. Feed down = hard 503, UI shows error state.
//   • sentiment is NOT invented — Finnhub general news carries none, so the field is null
//     and the UI hides the BULLISH/BEARISH badge for wire articles.
//   • Currency tagging + impact tier are transparent keyword heuristics, documented below.

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function originBlocked(event) {
  const allowed = process.env.AXIOM_ALLOWED_ORIGIN;
  if (!allowed) return false;
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const referer = event.headers?.referer || event.headers?.Referer || '';
  return !(origin.startsWith(allowed) || referer.startsWith(allowed));
}

// ── Currency detection: explicit codes, pair notation, central banks, country terms ──
const CCY_PATTERNS = [
  ['USD', /\b(USD|dollar|greenback|fed(eral reserve)?|fomc|powell|treasur(y|ies))\b/i],
  ['EUR', /\b(EUR|euro(zone)?|ecb|lagarde|bund)\b/i],
  ['GBP', /\b(GBP|sterling|pound|boe|bank of england|gilt)\b/i],
  ['JPY', /\b(JPY|yen|boj|bank of japan|ueda)\b/i],
  ['AUD', /\b(AUD|aussie|australian dollar|rba|reserve bank of australia)\b/i],
  ['CAD', /\b(CAD|loonie|canadian dollar|boc|bank of canada)\b/i],
  ['CHF', /\b(CHF|franc|snb|swiss national bank)\b/i],
  ['NZD', /\b(NZD|kiwi|new zealand dollar|rbnz)\b/i],
  ['NOK', /\b(NOK|norwegian krone|norges bank)\b/i],
  ['SEK', /\b(SEK|swedish krona|riksbank)\b/i],
];

const HIGH_RE = /\b(rate (decision|cut|hike)|fomc|cpi|inflation|nonfarm|payrolls?|nfp|gdp|central bank|intervention|fed|ecb|boj|boe|rba|boc|snb|rbnz)\b/i;
const MED_RE  = /\b(pmi|retail sales|employment|unemployment|trade balance|sentiment|confidence|yields?|treasur(y|ies)|manufacturing)\b/i;

function detectCcy(text) {
  for (const [ccy, re] of CCY_PATTERNS) if (re.test(text)) return ccy;
  return 'FX'; // general market piece — no specific G10 anchor detected
}
function detectImp(text) {
  if (HIGH_RE.test(text)) return 'HIGH';
  if (MED_RE.test(text))  return 'MED';
  return 'LOW';
}
function fmtUTC(epochSec) {
  const d = new Date(epochSec * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// ── 10-minute in-memory cache (per warm lambda) ─────────────────────────────
let _cache = null, _cacheTime = 0;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (originBlocked(event)) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Origin not allowed' }) };

  if (!FINNHUB_KEY) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({
      error: 'FINNHUB_API_KEY not configured',
      action: 'Add FINNHUB_API_KEY to Netlify environment variables — free at finnhub.io',
      source: 'error', articles: null,
    }) };
  }

  const q = event.queryStringParameters || {};

  try {
    let articles;
    if (_cache && Date.now() - _cacheTime < 600000) {
      articles = _cache;
    } else {
      const res = await fetch(`https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_KEY}`,
        { signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Finnhub returned no articles');

      articles = raw
        .filter(a => a && a.headline && a.url)
        .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
        .slice(0, 60)
        .map(a => {
          const text = `${a.headline} ${a.summary || ''}`;
          return {
            id: `fh_${a.id}`,
            ts: (a.datetime || 0) * 1000,
            dt: fmtUTC(a.datetime || 0),          // UTC — client renders local time from ts
            ccy: detectCcy(text),                  // keyword heuristic (see CCY_PATTERNS)
            imp: detectImp(text),                  // keyword heuristic (HIGH_RE / MED_RE)
            hl: a.headline,
            detail: (a.summary || '').slice(0, 260),
            impact: null,                          // Finnhub carries no sentiment — never fabricated
            source: a.source || 'Finnhub',
            url: a.url,
            realSource: true,
          };
        });

      _cache = articles; _cacheTime = Date.now();
    }

    // Optional server-side currency filter
    let out = articles;
    if (q.ccy && /^[A-Z]{2,3}$/.test(q.ccy)) out = articles.filter(a => a.ccy === q.ccy);
    if (q.imp && /^(HIGH|MED|LOW)$/.test(q.imp)) out = out.filter(a => a.imp === q.imp);

    return {
      statusCode: 200,
      headers: { ...CORS, 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify({ articles: out, source: 'finnhub', count: out.length, fetchedAt: new Date().toISOString() }),
    };
  } catch (e) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({
      error: `Live news unavailable: ${e.message}`,
      action: 'Check FINNHUB_API_KEY in Netlify env vars / Finnhub status',
      source: 'error', articles: null,
    }) };
  }
};
