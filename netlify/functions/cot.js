// AXIOM COT Function — CFTC Commitments of Traders
// Free public data — published every Friday 3:30 PM ET
// Returns net non-commercial positioning for G10 FX futures

// CFTC contract codes for G10 FX futures (Financial Futures disaggregated)
const COT_CODES = {
  EUR: '099741', // Euro FX
  GBP: '096742', // British Pound
  JPY: '097741', // Japanese Yen
  CHF: '092741', // Swiss Franc
  CAD: '090741', // Canadian Dollar
  AUD: '232741', // Australian Dollar
  NZD: '112741', // New Zealand Dollar
  USD: '098662', // USD Index futures (DXY) — inverted: extreme long = bearish for USD-base pairs
};

// Cache COT data for 6 hours (published weekly, no need to re-fetch constantly)
let _cotCache = null;
let _cotCacheTime = 0;

async function fetchCOTData() {
  if (_cotCache && Date.now() - _cotCacheTime < 6 * 3600 * 1000) {
    return _cotCache;
  }

  const result = {};

  await Promise.allSettled(
    Object.entries(COT_CODES).map(async ([currency, code]) => {
      try {
        // CFTC public reporting API — no API key required
        const url = `https://publicreporting.cftc.gov/api/explore/dataset/traders-in-financial-futures-combined/exports/json?rows=2&refine.cftc_commodity_code=${code}&sort=report_date_as_yyyy_mm_dd`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;

        const data = await res.json();
        if (!data?.records?.length) return;

        const latest = data.records[0]?.fields;
        const prev = data.records[1]?.fields;
        if (!latest) return;

        const netLong = parseInt(latest.noncomm_positions_long_all || 0);
        const netShort = parseInt(latest.noncomm_positions_short_all || 0);
        const netPosition = netLong - netShort;

        const prevLong = prev ? parseInt(prev.noncomm_positions_long_all || 0) : netLong;
        const prevShort = prev ? parseInt(prev.noncomm_positions_short_all || 0) : netShort;
        const prevNet = prevLong - prevShort;
        const weeklyChange = netPosition - prevNet;

        // Extreme thresholds by currency (approximate 90th percentile from historical data)
        const thresholds = {
          EUR: 150000, GBP: 60000, JPY: 80000, CHF: 25000,
          CAD: 40000, AUD: 60000, NZD: 20000,
          USD: 10000, // DXY futures — lower open interest than individual contracts
        };
        const threshold = thresholds[currency] || 50000;

        result[currency] = {
          netPosition,
          netLong,
          netShort,
          weeklyChange,
          extremeLong: netPosition > threshold,
          extremeShort: netPosition < -threshold,
          reportDate: latest.report_date_as_yyyy_mm_dd || 'Unknown',
          available: true,
        };
      } catch (e) {
        result[currency] = { available: false, error: e.message };
      }
    })
  );

  _cotCache = result;
  _cotCacheTime = Date.now();
  return result;
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { currency } = event.queryStringParameters || {};

  try {
    const cotData = await fetchCOTData();

    if (currency) {
      const data = cotData[currency.toUpperCase()];
      if (!data) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `No COT data for ${currency}`, available: false }),
        };
      }
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // Return all currencies
    const summary = Object.entries(cotData).map(([ccy, d]) => ({
      currency: ccy,
      netPosition: d.netPosition,
      weeklyChange: d.weeklyChange,
      extremeLong: d.extremeLong,
      extremeShort: d.extremeShort,
      // USD DXY is inverted: extreme long DXY = bearish for USD-base pairs (fade the crowd)
      bias: ccy === 'USD'
        ? (d.extremeLong ? 'EXTREME_LONG_DXY' : d.extremeShort ? 'EXTREME_SHORT_DXY' : 'NEUTRAL')
        : (d.extremeLong ? 'EXTREME_LONG' : d.extremeShort ? 'EXTREME_SHORT' : 'NEUTRAL'),
      isInverted: ccy === 'USD', // signals using this must flip direction logic
      reportDate: d.reportDate,
      available: d.available,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        cot: summary,
        count: summary.length,
        cachedAt: new Date(_cotCacheTime).toISOString(),
        source: 'CFTC Commitments of Traders (disaggregated financial futures)',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message, available: false }),
    };
  }
};
