// Netlify Function: proxies ForexFactory XML calendar
// Bypasses CORS restrictions on the client side
exports.handler = async function(event) {
  const week = event.queryStringParameters?.week || 'this';
  const url = week === 'next'
    ? 'https://nfs.faireconomy.media/ff_calendar_nextweek.xml'
    : 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AXIOM-FX/1.0)',
        'Accept': 'application/xml, text/xml, */*'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: 'FF fetch failed: ' + res.status })
      };
    }

    const xml = await res.text();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=900' // 15 min cache
      },
      body: xml
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
