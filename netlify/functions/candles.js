// AXIOM FX — OANDA candle proxy v2.0
// v2.0: correct OANDA v20 host (was api-trade.oanda.com — not a documented endpoint),
//       OANDA_ENV switch, count clamp, and a new bulk `daily-opens` mode that returns
//       today's D1 open for every requested pair so the UI can show TRUE daily change
//       (OANDA daily candles align to 17:00 New York — the FX market-standard day).

const OANDA_KEY = process.env.OANDA_API_KEY;
const ENV       = (process.env.OANDA_ENV || 'live').toLowerCase();
const BASE      = (ENV === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com') + '/v3';

const CORS = { 'Access-Control-Allow-Origin': '*' };

function originBlocked(event) {
  const allowed = process.env.AXIOM_ALLOWED_ORIGIN;
  if (!allowed) return false;
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const referer = event.headers?.referer || event.headers?.Referer || '';
  return !(origin.startsWith(allowed) || referer.startsWith(allowed));
}

const TF_MAP = { M5:'M5', M15:'M15', M30:'M30', H1:'H1', H4:'H4', D1:'D', W1:'W', MN:'M' };

// ── In-memory cache for bulk daily opens (10 min, keyed by FX day) ───────────
let _opensCache = null, _opensCacheKey = '', _opensCacheTime = 0;

async function fetchDailyOpen(instrument) {
  // count=2 without the complete-filter: the LAST candle is the in-progress
  // current FX day (5pm-NY aligned); its `o` is today's true open.
  const url = `${BASE}/instruments/${instrument}/candles?count=2&granularity=D&price=M`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${OANDA_KEY}` }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`OANDA ${res.status} for ${instrument}`);
  const data = await res.json();
  const candles = data.candles || [];
  if (!candles.length) throw new Error(`No daily candles for ${instrument}`);
  const last = candles[candles.length - 1];
  return { open: parseFloat(last.mid.o), time: last.time, complete: !!last.complete };
}

// The FX "trading date" label shown next to the daily-Δ columns: the calendar
// date (America/New_York) on which the current 5pm-NY session opened. OANDA's
// daily candle timestamp is the session boundary, so the NY date of that stamp
// is exactly the label we want.
function nyTradingDate(iso) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch (_) { return null; }
}

async function handleDailyOpens(pairsParam) {
  const pairs = decodeURIComponent(pairsParam || '').split(',').filter(Boolean);
  if (!pairs.length || pairs.length > 40 || !pairs.every(p => /^[A-Z]{3}\/[A-Z]{3}$/.test(p))) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid pairs parameter' }) };
  }

  const cacheKey = pairs.slice().sort().join('|');
  if (_opensCache && _opensCacheKey === cacheKey && Date.now() - _opensCacheTime < 600000) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, body: JSON.stringify(_opensCache) };
  }

  const opens = {}, errors = [];
  let sessionTime = null;
  // Concurrency 7 — 28 pairs in 4 waves, well inside OANDA limits.
  for (let i = 0; i < pairs.length; i += 7) {
    const batch = pairs.slice(i, i + 7);
    const results = await Promise.allSettled(batch.map(async (pair) => {
      const r = await fetchDailyOpen(pair.replace('/', '_'));
      return { pair, ...r };
    }));
    for (const r of results) {
      if (r.status === 'fulfilled') { opens[r.value.pair] = { open: r.value.open, time: r.value.time }; if (!sessionTime) sessionTime = r.value.time; }
      else errors.push(String(r.reason?.message || r.reason));
    }
  }

  if (!Object.keys(opens).length) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Daily opens fetch failed for all pairs', errors: errors.slice(0, 5) }) };
  }

  const payload = { opens, date: nyTradingDate(sessionTime), count: Object.keys(opens).length, errors: errors.length ? errors.slice(0, 5) : undefined, fetchedAt: new Date().toISOString() };
  _opensCache = payload; _opensCacheKey = cacheKey; _opensCacheTime = Date.now();
  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, body: JSON.stringify(payload) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (originBlocked(event)) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Origin not allowed' }) };
  if (!OANDA_KEY) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'OANDA_API_KEY not set' }) };

  const q = event.queryStringParameters || {};

  // ── Bulk mode: true daily opens for the dashboard CHG/CHG% columns ─────────
  if (q.bulk === 'daily-opens') {
    try { return await handleDailyOpens(q.pairs); }
    catch (e) { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }; }
  }

  // ── Single-instrument OHLCV mode (original contract, host fixed) ───────────
  const { pair, tf = 'H1' } = q;
  const count = Math.min(500, Math.max(1, parseInt(q.count, 10) || 200));
  if (!pair || !/^[A-Z]{3}\/[A-Z]{3}$/.test(pair)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'pair required (format: EUR/USD)' }) };
  }
  const instrument = pair.replace('/', '_');
  const granularity = TF_MAP[tf] || 'H1';

  try {
    const url = `${BASE}/instruments/${instrument}/candles?count=${count}&granularity=${granularity}&price=M`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${OANDA_KEY}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, headers: CORS, body: JSON.stringify({ error: `OANDA ${res.status}: ${txt.slice(0, 300)}` }) };
    }
    const data = await res.json();
    const candles = (data.candles || [])
      .filter(c => c.complete)
      .map(c => ({ t: c.time, o: parseFloat(c.mid.o), h: parseFloat(c.mid.h), l: parseFloat(c.mid.l), c: parseFloat(c.mid.c), v: c.volume || 0 }));
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ pair, tf, candles }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
