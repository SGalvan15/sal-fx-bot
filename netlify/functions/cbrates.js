// AXIOM FX — Central Bank Rates Netlify Function v2.0
// Live policy rates from FRED (St. Louis Fed) for all 10 G10 central banks
// NO static fallback data — fails loudly if FRED is unavailable
// FRED API key is free: fred.stlouisfed.org → My Account → API Keys
// Add FRED_API_KEY to Netlify environment variables

const FRED_KEY = process.env.FRED_API_KEY;
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// FRED series IDs for each G10 central bank policy rate
const FRED_SERIES = {
  USD: { id: 'IORB',             name: 'Federal Reserve',            url: 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm' },
  EUR: { id: 'ECBDFR',           name: 'European Central Bank',      url: 'https://www.ecb.europa.eu/mopo/decisions/html/index.en.html' },
  GBP: { id: 'IUDSOIA',          name: 'Bank of England',            url: 'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes' },
  JPY: { id: 'IRSTCB01JPM156N',  name: 'Bank of Japan',              url: 'https://www.boj.or.jp/en/mopo/mpmdeci/' },
  AUD: { id: 'IRSTCB01AUM156N',  name: 'Reserve Bank of Australia',  url: 'https://www.rba.gov.au/monetary-policy/rba-board-minutes/' },
  CAD: { id: 'IRSTCB01CAM156N',  name: 'Bank of Canada',             url: 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/' },
  CHF: { id: 'IRSTCB01CHM156N',  name: 'Swiss National Bank',        url: 'https://www.snb.ch/en/monetary-policy/monetary-policy-decisions' },
  NZD: { id: 'IRSTCB01NZM156N',  name: 'Reserve Bank of New Zealand',url: 'https://www.rbnz.govt.nz/monetary-policy/official-cash-rate-decisions' },
  NOK: { id: 'IRSTCB01NOM156N',  name: 'Norges Bank',                url: 'https://www.norges-bank.no/en/topics/Monetary-policy/monetary-policy-meetings/' },
  SEK: { id: 'IRSTCB01SEM156N',  name: 'Riksbank',                   url: 'https://www.riksbank.se/en-gb/monetary-policy/the-policy-rate/policy-rate-table/' },
};

// Outlook and bias metadata — non-rate data that FRED doesn't provide
// These are contextual labels only, not used for any signal calculation
// Updated manually after CB meetings alongside AXIOM_REGIMES env var
const CB_META = {
  USD: { outlook: 'Hold',    bias: 'Neutral', next: '2026-05-07', bank: 'Federal Reserve'            },
  EUR: { outlook: 'Hold',    bias: 'Hawkish', next: '2026-04-30', bank: 'European Central Bank'      },
  GBP: { outlook: 'Hold',    bias: 'Neutral', next: '2026-05-08', bank: 'Bank of England'            },
  JPY: { outlook: 'Hiking',  bias: 'Hawkish', next: '2026-04-30', bank: 'Bank of Japan'              },
  AUD: { outlook: 'Hold',    bias: 'Neutral', next: '2026-05-20', bank: 'Reserve Bank of Australia'  },
  CAD: { outlook: 'Cutting', bias: 'Dovish',  next: '2026-04-16', bank: 'Bank of Canada'             },
  CHF: { outlook: 'Hold',    bias: 'Neutral', next: '2026-06-19', bank: 'Swiss National Bank'        },
  NZD: { outlook: 'Cutting', bias: 'Dovish',  next: '2026-05-28', bank: 'Reserve Bank of New Zealand'},
  NOK: { outlook: 'Hold',    bias: 'Neutral', next: '2026-05-08', bank: 'Norges Bank'                },
  SEK: { outlook: 'Hold',    bias: 'Neutral', next: '2026-04-30', bank: 'Riksbank'                   },
};

async function fetchFredSeries(seriesId, key) {
  const fourYearsAgo = new Date();
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
  const startDate = fourYearsAgo.toISOString().slice(0, 10);
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${key}&file_type=json&observation_start=${startDate}&sort_order=asc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`FRED ${seriesId} returned ${res.status}`);
  const data = await res.json();
  if (!data.observations?.length) throw new Error(`FRED ${seriesId}: no observations returned`);
  return data.observations;
}

function buildHistory(observations) {
  const valid = observations
    .filter(o => o.value !== '.' && o.value !== '')
    .map(o => ({ date: o.date, rate: parseFloat(o.value) }));

  if (!valid.length) return [];

  // Keep only rate-change entries
  const changes = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    if (Math.abs(valid[i].rate - changes[changes.length - 1].rate) > 0.001) {
      changes.push(valid[i]);
    }
  }

  return changes.slice(-14).map(c => {
    const d = new Date(c.date);
    const mon = d.toLocaleString('en-US', { month: 'short' });
    const yr = String(d.getFullYear()).slice(2);
    return { d: `${mon}'${yr}`, r: Math.round(c.rate * 100) / 100 };
  });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  // Hard error — no FRED key means no data, no fallback
  if (!FRED_KEY) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'FRED_API_KEY not configured',
        action: 'Add FRED_API_KEY to Netlify environment variables — free at fred.stlouisfed.org → My Account → API Keys',
        source: 'error',
        rates: null,
      }),
    };
  }

  // Fetch all 10 series from FRED in parallel
  const results = {};
  const errors = [];

  await Promise.allSettled(
    Object.entries(FRED_SERIES).map(async ([ccy, info]) => {
      try {
        const obs = await fetchFredSeries(info.id, FRED_KEY);
        const hist = buildHistory(obs);
        if (!hist.length) throw new Error(`${ccy}: FRED returned no valid rate data`);

        const latest = hist[hist.length - 1];
        const prev   = hist[hist.length - 2];
        const meta   = CB_META[ccy] || {};

        results[ccy] = {
          rate:      latest.r,
          prev:      prev ? prev.r : latest.r,
          hist,
          outlook:   meta.outlook  || 'Unknown',
          bias:      meta.bias     || 'Unknown',
          next:      meta.next     || 'Unknown',
          bank:      meta.bank     || info.name,
          fredSeries:info.id,
          sourceUrl: info.url,
          source:    'FRED',
          updated:   new Date().toISOString(),
        };
      } catch (e) {
        // Per-currency failure — logged in errors[], no fallback substituted
        errors.push({ currency: ccy, error: e.message, fredSeries: info.id });
      }
    })
  );

  // If ALL currencies failed, return a hard 503
  if (Object.keys(results).length === 0) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'FRED fetch failed for all currencies',
        errors,
        source: 'error',
        rates: null,
        action: 'Check FRED_API_KEY validity at fred.stlouisfed.org',
      }),
    };
  }

  // Partial success — return what loaded, flag what failed
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      rates:   results,
      source:  errors.length === 0 ? 'FRED' : 'FRED_PARTIAL',
      errors:  errors.length > 0 ? errors : undefined,
      loaded:  Object.keys(results).length,
      total:   Object.keys(FRED_SERIES).length,
      updated: new Date().toISOString(),
    }),
  };
};
