// Anthropic AI chat proxy - key stored in Netlify environment variable
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY env var not set in Netlify' } }) };
  }
  try {
    const body = JSON.parse(event.body);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    const data = await res.json();
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: { message: e.message } }) };
  }
};
