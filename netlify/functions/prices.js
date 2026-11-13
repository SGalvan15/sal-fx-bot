// AXIOM FX — OANDA live price proxy v2.0
// v2.0: correct OANDA v20 hosts (api-fxtrade / api-fxpractice), OANDA_ENV switch,
//       tradeable flag passthrough (market-closed detection), no hardcoded account id,
//       optional origin lock via AXIOM_ALLOWED_ORIGIN.

const OANDA_KEY  = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID;
const ENV        = (process.env.OANDA_ENV || 'live').toLowerCase();

// Documented OANDA v20 REST hosts. Primary chosen by OANDA_ENV, other kept as failover.
const HOST_LIVE     = 'https://api-fxtrade.oanda.com';
const HOST_PRACTICE = 'https://api-fxpractice.oanda.com';
const HOSTS = ENV === 'practice' ? [HOST_PRACTICE, HOST_LIVE] : [HOST_LIVE, HOST_PRACTICE];

const CORS = { 'Access-Control-Allow-Origin': '*' };

function originBlocked(event) {
  const allowed = process.env.AXIOM_ALLOWED_ORIGIN;
  if (!allowed) return false; // lock disabled by default
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const referer = event.headers?.referer || event.headers?.Referer || '';
  return !(origin.startsWith(allowed) || referer.startsWith(allowed));
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (originBlocked(event)) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Origin not allowed' }) };

  if (!OANDA_KEY)  return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'OANDA_API_KEY env var not set in Netlify' }) };
  if (!ACCOUNT_ID) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'OANDA_ACCOUNT_ID env var not set in Netlify' }) };

  const raw = event.queryStringParameters?.instruments || 'EUR_USD';
  // Whitelist charset: instrument codes and comma / URL-encoded comma only.
  let instruments;
  try { instruments = decodeURIComponent(raw); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Malformed instruments parameter (bad percent-encoding)' }) }; }
  if (!/^[A-Z]{3}_[A-Z]{3}(,[A-Z]{3}_[A-Z]{3})*$/.test(instruments)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid instruments parameter' }) };
  }

  let lastError = '';
  for (const host of HOSTS) {
    try {
      const url = `${host}/v3/accounts/${ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(instruments)}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${OANDA_KEY}`,
          'Content-Type': 'application/json',
          'Accept-Datetime-Format': 'RFC3339',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        const txt = await res.text();
        lastError = `OANDA ${res.status} (${host}): ${txt.slice(0, 300)}`;
        continue;
      }

      // Pass OANDA payload through verbatim — includes per-instrument `tradeable`
      // and `time`, which the UI uses for MARKET CLOSED detection.
      const data = await res.json();
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
        body: JSON.stringify(data),
      };
    } catch (e) {
      lastError = `${e.name}: ${e.message} (host: ${host})`;
    }
  }

  return {
    statusCode: 502,
    headers: CORS,
    body: JSON.stringify({
      error: 'All OANDA endpoints failed',
      detail: lastError,
      env: ENV,
      keyPresent: !!OANDA_KEY,
    }),
  };
};
