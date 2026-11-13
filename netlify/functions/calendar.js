// AXIOM FX — Economic calendar proxy v2.0
// v2.0 CRITICAL FIX: v1 returned raw ForexFactory XML while the UI called res.json()
// and read data.events — the parse threw on every load and the Calendar tab silently
// rendered "0 events" as a healthy feed. This version parses server-side and returns
// the exact JSON contract the UI consumes.
//
//   • Source feed times are wall-clock in the feed timezone (ForexFactory default is
//     US Eastern). Converted to true UTC with a DST-correct Intl-based conversion —
//     the client renders local time from the `utc` field.
//   • Impact High/Medium/Low → HIGH/MED/LOW. Event type derived from title keywords.
//   • 15-min in-memory cache per week + HTTP cache headers. Hard errors, no fallback.

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const SOURCE_TZ = process.env.CAL_SOURCE_TZ || 'America/New_York';

function originBlocked(event) {
  const allowed = process.env.AXIOM_ALLOWED_ORIGIN;
  if (!allowed) return false;
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const referer = event.headers?.referer || event.headers?.Referer || '';
  return !(origin.startsWith(allowed) || referer.startsWith(allowed));
}

// ── DST-correct wall-time → UTC conversion ──────────────────────────────────
// Iterative technique: guess UTC = wall components, measure what wall-clock that
// UTC instant produces in the source TZ, adjust by the difference. Two passes
// converge for all real-world offsets including DST transitions.
function tzWallParts(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = t => parseInt(parts.find(p => p.type === t).value, 10);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute') };
}
function wallTimeToUTC(tz, y, mo, d, h, mi) {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const w = tzWallParts(tz, new Date(guess));
    const asUTC = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
    guess += Date.UTC(y, mo - 1, d, h, mi) - asUTC;
  }
  return new Date(guess);
}

// ── Minimal XML field extraction (CDATA-safe) for the flat FF event schema ───
function xmlField(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

const IMP_MAP = { high: 'HIGH', medium: 'MED', low: 'LOW', 'non-economic': 'LOW', holiday: 'LOW' };

const TYPE_RULES = [
  ['CB Decision',  /\b(rate decision|interest rate|cash rate|ocr|refinancing|policy rate|fomc statement|monetary policy (statement|decision))\b/i],
  ['CB Speech',    /\b(speaks|speech|testimony|testifies|press conference|minutes)\b/i],
  ['Inflation',    /\b(cpi|ppi|inflation|pce|hicp|deflator)\b/i],
  ['Employment',   /\b(employment|unemployment|payrolls?|jobless|claims|jolts|wage)\b/i],
  ['GDP',          /\bgdp\b/i],
  ['PMI',          /\bpmi\b/i],
  ['Sentiment',    /\b(sentiment|confidence|zew|ifo|michigan)\b/i],
  ['Trade',        /\b(trade balance|current account|exports?|imports?)\b/i],
  ['Retail',       /\bretail sales\b/i],
  ['Housing',      /\b(housing|building|home sales|permits|construction)\b/i],
  ['Manufacturing',/\b(manufacturing|industrial|factory|durable)\b/i],
];
function deriveType(title) {
  for (const [t, re] of TYPE_RULES) if (re.test(title)) return t;
  return 'Other';
}

function parseFF(xml) {
  const events = [];
  const blocks = xml.match(/<event>[\s\S]*?<\/event>/gi) || [];
  for (const b of blocks) {
    const title   = xmlField(b, 'title');
    const country = xmlField(b, 'country').toUpperCase();
    const dateStr = xmlField(b, 'date');   // MM-DD-YYYY
    const timeStr = xmlField(b, 'time');   // "8:30am" | "All Day" | "Tentative" | ""
    const impact  = xmlField(b, 'impact');
    const fc      = xmlField(b, 'forecast');
    const pr      = xmlField(b, 'previous');
    if (!title || !country || !dateStr) continue;

    const dm = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!dm) continue;
    const mo = parseInt(dm[1], 10), d = parseInt(dm[2], 10), y = parseInt(dm[3], 10);

    let h = 0, mi = 0, allDay = false;
    const tm = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    if (tm) {
      h = parseInt(tm[1], 10) % 12; if (/pm/i.test(tm[3])) h += 12;
      mi = parseInt(tm[2], 10);
    } else {
      allDay = true; // "All Day" / "Tentative" / blank — anchor to source-TZ midnight
    }

    const utc = wallTimeToUTC(SOURCE_TZ, y, mo, d, h, mi);
    events.push({
      utc: utc.toISOString(),
      ccy: country,
      ev: title,
      imp: IMP_MAP[impact.toLowerCase()] || 'LOW',
      fc: fc || '–',
      pr: pr || '–',
      type: deriveType(title),
      allDay,
    });
  }
  events.sort((a, b) => a.utc.localeCompare(b.utc));
  return events;
}

// ── 15-min in-memory cache per week feed ────────────────────────────────────
const _cache = {}; // { this:{t,data}, next:{t,data} }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (originBlocked(event)) return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Origin not allowed' }) };

  const week = event.queryStringParameters?.week === 'next' ? 'next' : 'this';
  const cached = _cache[week];
  if (cached && Date.now() - cached.t < 900000) {
    return { statusCode: 200, headers: { ...CORS, 'Cache-Control': 'public, max-age=600' },
      body: JSON.stringify(cached.data) };
  }

  const url = week === 'next'
    ? 'https://nfs.faireconomy.media/ff_calendar_nextweek.xml'
    : 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AXIOM-FX/7.2)', 'Accept': 'application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: `ForexFactory fetch failed: HTTP ${res.status}`, events: null }) };
    }
    const xml = await res.text();
    const events = parseFF(xml);
    if (!events.length) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'ForexFactory feed parsed to zero events — feed format may have changed', events: null }) };
    }

    const data = { events, week, count: events.length, source: 'forexfactory', sourceTz: SOURCE_TZ, fetchedAt: new Date().toISOString() };
    _cache[week] = { t: Date.now(), data };
    return { statusCode: 200, headers: { ...CORS, 'Cache-Control': 'public, max-age=600' }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: `Calendar feed error: ${e.message}`, events: null }) };
  }
};

exports.__test__ = { parseFF, wallTimeToUTC, deriveType };
