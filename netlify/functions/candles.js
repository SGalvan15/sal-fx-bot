// OANDA Candle Data Fetcher
// Returns OHLCV candles for technical analysis
const OANDA_KEY = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID || '001-001-21201857-001';
const BASE = 'https://api-trade.oanda.com/v3';

exports.handler = async function(event) {
  if (!OANDA_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'OANDA_API_KEY not set' }) };

  const { pair, tf = 'H1', count = '200' } = event.queryStringParameters || {};
  if (!pair) return { statusCode: 400, body: JSON.stringify({ error: 'pair required' }) };

  // Convert pair format EUR/USD -> EUR_USD
  const instrument = pair.replace('/', '_');

  // Map timeframe to OANDA granularity
  const tfMap = {
    'M5': 'M5', 'M15': 'M15', 'M30': 'M30',
    'H1': 'H1', 'H4': 'H4', 'D1': 'D',
    'W1': 'W', 'MN': 'M'
  };
  const granularity = tfMap[tf] || 'H1';

  try {
    const url = `${BASE}/instruments/${instrument}/candles?count=${count}&granularity=${granularity}&price=M`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${OANDA_KEY}` },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: JSON.stringify({ error: `OANDA ${res.status}: ${txt}` }) };
    }
    const data = await res.json();
    // Return simplified candle array: [time, open, high, low, close, volume]
    const candles = (data.candles || [])
      .filter(c => c.complete)
      .map(c => ({
        t: c.time,
        o: parseFloat(c.mid.o),
        h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l),
        c: parseFloat(c.mid.c),
        v: c.volume || 0
      }));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ pair, tf, candles })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
