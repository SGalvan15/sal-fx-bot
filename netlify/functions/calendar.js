// AXIOM FX — Calendar Netlify Function
// Fetches ForexFactory XML, parses it server-side, returns clean JSON
// No static data — 100% live from ForexFactory feed

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  const week = event.queryStringParameters?.week || 'this';
  const url = week === 'next'
    ? 'https://nfs.faireconomy.media/ff_calendar_nextweek.xml'
    : 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'FF fetch failed: ' + res.status, events: [] })
      };
    }

    const xml = await res.text();
    const events = parseForexFactoryXML(xml);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=900' // 15-min cache
      },
      body: JSON.stringify({ events, week, count: events.length })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message, events: [] })
    };
  }
};

function parseForexFactoryXML(xml) {
  const events = [];

  // Extract all <event> blocks using regex (no DOMParser in Node.js Netlify functions)
  const eventBlocks = xml.match(/<event>([\s\S]*?)<\/event>/g) || [];

  for (const block of eventBlocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}>([\\s\\S]*?)<\/${tag}>`));
      if (!m) return '';
      return (m[1] !== undefined ? m[1] : m[2] || '').trim();
    };

    const title    = get('title');
    const country  = get('country');
    const dateStr  = get('date');    // e.g. "04-10-2026" (MM-DD-YYYY)
    const timeStr  = get('time');    // e.g. "8:30am" or "All Day" or "Tentative"
    const impact   = get('impact');  // "High", "Medium", "Low", "Non-Economic"
    const forecast = get('forecast') || '–';
    const previous = get('previous') || '–';
    const actual   = get('actual')   || '–';

    if (!title || !dateStr) continue;
    if (impact === 'Non-Economic') continue;

    // Parse MM-DD-YYYY date
    const dateParts = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!dateParts) continue;
    const [, mm, dd, yyyy] = dateParts;
    const isoDate = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;

    // Parse time — "8:30am", "2:00pm", "All Day", "Tentative"
    let isoTime = '00:00';
    if (timeStr && timeStr !== 'All Day' && timeStr !== 'Tentative' && timeStr !== '') {
      const tm = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
      if (tm) {
        let h = parseInt(tm[1], 10);
        const min = tm[2];
        const ampm = tm[3].toLowerCase();
        if (ampm === 'pm' && h !== 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        isoTime = `${String(h).padStart(2,'0')}:${min}`;
      }
    }

    const dt = `${isoDate} ${isoTime}`;

    // Map impact
    const imp = impact === 'High' ? 'HIGH' : impact === 'Medium' ? 'MED' : 'LOW';

    // Map country to currency code
    const CCY_MAP = {
      'USD': 'USD', 'United States': 'USD',
      'EUR': 'EUR', 'Euro Zone': 'EUR', 'Germany': 'EUR', 'France': 'EUR', 'Italy': 'EUR', 'Spain': 'EUR',
      'GBP': 'GBP', 'United Kingdom': 'GBP',
      'JPY': 'JPY', 'Japan': 'JPY',
      'AUD': 'AUD', 'Australia': 'AUD',
      'CAD': 'CAD', 'Canada': 'CAD',
      'CHF': 'CHF', 'Switzerland': 'CHF',
      'NZD': 'NZD', 'New Zealand': 'NZD',
      'NOK': 'NOK', 'Norway': 'NOK',
      'SEK': 'SEK', 'Sweden': 'SEK',
      'CNY': 'CNY', 'China': 'CNY',
    };
    const ccy = CCY_MAP[country] || country || 'OTHER';

    // Classify event type from title
    const t = title.toUpperCase();
    const type =
      t.includes('RATE DECISION') || t.includes('INTEREST RATE') || t.includes('POLICY DECISION') ? 'CB Decision' :
      t.includes('PRESS CONFERENCE') || t.includes('SPEECH') || t.includes('SPEAKS') || t.includes('STATEMENT') || t.includes('MINUTES') || t.includes('TESTIMONY') ? 'CB Speech' :
      t.includes('CPI') || t.includes('INFLATION') || t.includes('PPI') || t.includes('PCE') ? 'Inflation' :
      t.includes('NFP') || t.includes('NON-FARM') || t.includes('PAYROLL') || t.includes('EMPLOYMENT') || t.includes('UNEMPLOYMENT') || t.includes('JOBS') || t.includes('LABOR') ? 'Employment' :
      t.includes('GDP') ? 'GDP' :
      t.includes('PMI') ? 'PMI' :
      t.includes('RETAIL') ? 'Retail' :
      t.includes('TRADE BALANCE') || t.includes('CURRENT ACCOUNT') ? 'Trade' :
      t.includes('HOUSING') || t.includes('HOME SALES') || t.includes('BUILDING PERMIT') ? 'Housing' :
      t.includes('MANUFACTURING') || t.includes('INDUSTRIAL') || t.includes('FACTORY') || t.includes('DURABLE GOODS') ? 'Manufacturing' :
      t.includes('SENTIMENT') || t.includes('CONFIDENCE') || t.includes('IFO') ? 'Sentiment' :
      t.includes('INVENTORY') || t.includes('INVENTORIES') ? 'Inventory' :
      t.includes('INCOME') || t.includes('SPENDING') ? 'Income' :
      'Indicator';

    events.push({ dt, ccy, ev: title, imp, fc: forecast, pr: previous, actual, type });
  }

  // Sort by datetime
  events.sort((a, b) => a.dt.localeCompare(b.dt));
  return events;
}
