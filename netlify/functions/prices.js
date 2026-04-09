// OANDA live price proxy - keys stored in Netlify environment variables
const OANDA_KEY = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID || '001-001-21201857-001';
const OANDA_URL = `https://api-trade.oanda.com/v3/accounts/${ACCOUNT_ID}/pricing`;

exports.handler = async function(event) {
  if (!OANDA_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OANDA_API_KEY env var not set in Netlify' }) };
  }
  const instruments = event.queryStringParameters?.instruments || '';
  if (!instruments) {
    return { statusCode: 400, body: JSON.stringify({ error: 'instruments param required' }) };
  }
  try {
    const res = await fetch(`${OANDA_URL}?instruments=${instruments}`, {
      headers: { 'Authorization': `Bearer ${OANDA_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: JSON.stringify({ error: `OANDA ${res.status}: ${txt}` }) };
    }
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(data)
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
