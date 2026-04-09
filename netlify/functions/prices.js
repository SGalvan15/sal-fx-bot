// OANDA live price proxy with detailed error reporting
const OANDA_KEY = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID || '001-001-21201857-001';

exports.handler = async function(event) {
  if (!OANDA_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OANDA_API_KEY env var not set in Netlify' }) };
  }

  const instruments = event.queryStringParameters?.instruments || 'EUR_USD';

  // Try live endpoint first, fall back to practice
  const endpoints = [
    `https://api-trade.oanda.com/v3/accounts/${ACCOUNT_ID}/pricing`,
    `https://api-fxtrade.oanda.com/v3/accounts/${ACCOUNT_ID}/pricing`
  ];

  let lastError = '';
  for (const base of endpoints) {
    try {
      const url = `${base}?instruments=${instruments}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${OANDA_KEY}`,
          'Content-Type': 'application/json',
          'Accept-Datetime-Format': 'RFC3339'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const txt = await res.text();
        lastError = `OANDA ${res.status}: ${txt}`;
        continue;
      }

      const data = await res.json();
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store'
        },
        body: JSON.stringify(data)
      };
    } catch(e) {
      lastError = `${e.name}: ${e.message} (endpoint: ${base})`;
      continue;
    }
  }

  // Both endpoints failed - return detailed error
  return {
    statusCode: 502,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      error: 'All OANDA endpoints failed',
      detail: lastError,
      account: ACCOUNT_ID,
      keyPresent: !!OANDA_KEY,
      keyPrefix: OANDA_KEY ? OANDA_KEY.substring(0,8) + '...' : 'none'
    })
  };
};
