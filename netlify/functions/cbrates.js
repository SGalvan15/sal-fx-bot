// AXIOM FX — Central Bank Rates v3.0 (FRED, St. Louis Fed)
// v3.0 data-integrity changes:
//   • REMOVED the hand-maintained CB_META block (next-meeting dates had all passed;
//     outlook/bias labels were frozen at April 2026). Nothing manual remains.
//   • outlook is now DERIVED from real FRED rate history: last change ≤ 240 days →
//     Hiking/Cutting, else Hold. bias derived from the 12-month rate trajectory.
//   • Every currency now carries `asOf` (last valid FRED observation date) and
//     `freq` (daily vs monthly series) so data latency is visible, never hidden —
//     several non-US policy series are monthly OECD data that lag CB decisions.
//   • Next-meeting display is replaced client-side by the official-schedule link.

const FRED_KEY = process.env.FRED_API_KEY;
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function originBlocked(event) {
  const allowed = process.env.AXIOM_ALLOWED_ORIGIN;
  if (!allowed) return false;
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const referer = event.headers?.referer || event.headers?.Referer || '';
  return !(origin.startsWith(allowed) || referer.startsWith(allowed));
}

// Primary + fallback FRED series per G10 central bank. `daily:true` marks series
// updated daily; the OECD IRSTCB/IR3TIB families are monthly and can lag decisions.
const FRED_SERIES = {
  USD: { id: 'IORB',            fallback: 'FEDFUNDS',        daily: true,  name: 'Federal Reserve',             url: 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm' },
  EUR: { id: 'ECBDFR',          fallback: 'ECBMRRFR',        daily: true,  name: 'European Central Bank',       url: 'https://www.ecb.europa.eu/mopo/decisions/html/index.en.html' },
  GBP: { id: 'IUDSOIA',         fallback: 'IRSTCB01GBM156N', daily: true,  name: 'Bank of England',             url: 'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes' },
  JPY: { id: 'IRSTCB01JPM156N', fallback: 'IR3TIB01JPM156N', daily: false, name: 'Bank of Japan',               url: 'https://www.boj.or.jp/en/mopo/mpmdeci/' },
  AUD: { id: 'IRSTCB01AUM156N', fallback: 'IR3TIB01AUM156N', daily: false, name: 'Reserve Bank of Australia',   url: 'https://www.rba.gov.au/monetary-policy/rba-board-minutes/' },
  CAD: { id: 'IRSTCB01CAM156N', fallback: 'IR3TIB01CAM156N', daily: false, name: 'Bank of Canada',              url: 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/' },
  CHF: { id: 'IRSTCB01CHM156N', fallback: 'IR3TIB01CHM156N', daily: false, name: 'Swiss National Bank',         url: 'https://www.snb.ch/en/monetary-policy/monetary-policy-decisions' },
  NZD: { id: 'IRSTCB01NZM156N', fallback: 'IR3TIB01NZM156N', daily: false, name: 'Reserve Bank of New Zealand', url: 'https://www.rbnz.govt.nz/monetary-policy/official-cash-rate-decisions' },
  NOK: { id: 'IRSTCB01NOM156N', fallback: 'IR3TIB01NOM156N', daily: false, name: 'Norges Bank',                 url: 'https://www.norges-bank.no/en/topics/Monetary-policy/monetary-policy-meetings/' },
  SEK: { id: 'IRSTCB01SEM156N', fallback: 'IR3TIB01SEM156N', daily: false, name: 'Riksbank',                    url: 'https://www.riksbank.se/en-gb/monetary-policy/the-policy-rate/policy-rate-table/' },
};

async function fetchFredSeries(seriesId, key, fallbackId) {
  const fourYearsAgo = new Date();
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
  const startDate = fourYearsAgo.toISOString().slice(0, 10);

  async function tryFetch(id) {
    const url = `${FRED_BASE}?series_id=${id}&api_key=${key}&file_type=json&observation_start=${startDate}&sort_order=asc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`FRED ${id} returned ${res.status}`);
    const data = await res.json();
    if (!data.observations?.length) throw new Error(`FRED ${id}: no observations returned`);
    const valid = data.observations.filter(o => o.value !== '.' && o.value !== '');
    if (!valid.length) throw new Error(`FRED ${id}: all observations missing`);
    return { observations: data.observations, usedSeries: id };
  }

  try { return await tryFetch(seriesId); }
  catch (primaryErr) {
    if (fallbackId) {
      try { return await tryFetch(fallbackId); }
      catch (fallbackErr) { throw new Error(`${seriesId}: ${primaryErr.message} | fallback ${fallbackId}: ${fallbackErr.message}`); }
    }
    throw primaryErr;
  }
}

function buildHistory(observations) {
  const valid = observations
    .filter(o => o.value !== '.' && o.value !== '')
    .map(o => ({ date: o.date, rate: parseFloat(o.value) }));
  if (!valid.length) return { changes: [], lastObs: null };

  const changes = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    if (Math.abs(valid[i].rate - changes[changes.length - 1].rate) > 0.001) changes.push(valid[i]);
  }
  return { changes, lastObs: valid[valid.length - 1] };
}

// ── Derived stance labels — computed from actual rate history, never hand-set ──
function deriveOutlook(changes, lastObsDate) {
  if (changes.length < 2) return 'Hold';
  const last = changes[changes.length - 1];
  const prev = changes[changes.length - 2];
  const daysSince = (new Date(lastObsDate) - new Date(last.date)) / 86400000;
  if (daysSince > 240) return 'Hold';
  return last.rate > prev.rate ? 'Hiking' : 'Cutting';
}
function deriveBias(changes, lastObs) {
  if (!lastObs || changes.length === 0) return 'Neutral';
  const yearAgo = new Date(lastObs.date); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  let rateYearAgo = changes[0].rate;
  for (const c of changes) { if (new Date(c.date) <= yearAgo) rateYearAgo = c.rate; else break; }
  const diff = lastObs.rate - rateYearAgo;
  if (diff > 0.10) return 'Hawkish';
  if (diff < -0.10) return 'Dovish';
  return 'Neutral';
}
function fmtHist(changes) {
  return changes.slice(-14).map(c => {
    const d = new Date(c.date);
    return { d: `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}'${String(d.getUTCFullYear()).slice(2)}`, r: Math.round(c.rate * 100) / 100 };
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (originBlocked(event)) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Origin not allowed' }) };

  const headers = { ...CORS, 'Cache-Control': 'public, max-age=3600' };
  // Errors must NEVER be cached — a fixed key would otherwise keep serving the
  // stale 503 from the browser cache for up to an hour after RELOAD.
  const errHeaders = { ...CORS, 'Cache-Control': 'no-store' };

  if (!FRED_KEY) {
    return { statusCode: 503, headers: errHeaders, body: JSON.stringify({
      error: 'FRED_API_KEY not configured',
      action: 'Add FRED_API_KEY to Netlify environment variables — free at fred.stlouisfed.org → My Account → API Keys',
      source: 'error', rates: null,
    }) };
  }

  const results = {};
  const errors = [];

  await Promise.allSettled(
    Object.entries(FRED_SERIES).map(async ([ccy, info]) => {
      try {
        const { observations, usedSeries } = await fetchFredSeries(info.id, FRED_KEY, info.fallback);
        const { changes, lastObs } = buildHistory(observations);
        if (!changes.length || !lastObs) throw new Error(`${ccy}: FRED returned no valid rate data`);

        const hist = fmtHist(changes);
        const latest = hist[hist.length - 1];
        const prev = hist[hist.length - 2];

        results[ccy] = {
          rate: latest.r,
          prev: prev ? prev.r : latest.r,
          hist,
          asOf: lastObs.date,                                   // last valid FRED observation
          freq: info.daily ? 'daily' : 'monthly',               // latency visibility
          outlook: deriveOutlook(changes, lastObs.date),        // derived, not hand-set
          bias: deriveBias(changes, lastObs),                   // derived, not hand-set
          derived: true,
          bank: info.name,
          fredSeries: usedSeries,
          sourceUrl: info.url,
          source: 'FRED',
        };
      } catch (e) {
        errors.push({ currency: ccy, error: e.message, fredSeries: info.id });
      }
    })
  );

  if (Object.keys(results).length === 0) {
    return { statusCode: 503, headers: errHeaders, body: JSON.stringify({
      error: 'FRED fetch failed for all currencies', errors, source: 'error', rates: null,
      action: 'Check FRED_API_KEY validity at fred.stlouisfed.org',
    }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({
    rates: results,
    source: errors.length === 0 ? 'FRED' : 'FRED_PARTIAL',
    errors: errors.length ? errors : undefined,
    loaded: Object.keys(results).length,
    total: Object.keys(FRED_SERIES).length,
    updated: new Date().toISOString(),
  }) };
};

exports.__test__ = { deriveOutlook, deriveBias, buildHistory };
